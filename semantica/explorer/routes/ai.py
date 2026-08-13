"""
AI assistant routes for the Nomenclador Explorer.

Two endpoints:
- /api/ai/explain: explain inferred facts in plain Spanish
- /api/ai/translate-rule: translate natural language to IF/THEN rule syntax

Uses the same LLM providers as governance-agent (Groq, Gemini, SambaNova)
via env vars. Self-contained — no dependency on governance-agent code.
"""

import os
import time
import threading
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

router = APIRouter(tags=["AI"])

# === LLM PROVIDERS (self-contained, reads same env vars as governance-agent) ===

_PROVIDERS = []

_groq_key = os.getenv("GROQ_API_KEY", "")
if _groq_key:
    _PROVIDERS.append({
        "name": "groq",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "key": _groq_key,
        "models": [os.getenv("GROQ_MODEL_PRIMARY", "llama-3.3-70b-versatile")],
    })

_gemini_key = os.getenv("GEMINI_API_KEY", "")
if _gemini_key:
    _PROVIDERS.append({
        "name": "gemini",
        "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "key": _gemini_key,
        "models": [os.getenv("GEMINI_MODEL", "gemini-2.0-flash")],
    })

_sambanova_key = os.getenv("SAMBANOVA_API_KEY", "")
if _sambanova_key:
    _PROVIDERS.append({
        "name": "sambanova",
        "url": "https://api.sambanova.ai/v1/chat/completions",
        "key": _sambanova_key,
        "models": [os.getenv("SAMBANOVA_MODEL", "Meta-Llama-3.1-70B-Instruct")],
    })

_LLM_SEMAPHORE = threading.Semaphore(1)
_LLM_LAST_CALL = 0.0
_LLM_LOCK = threading.Lock()
_LLM_MIN_DELAY = float(os.getenv("LLM_MIN_DELAY", "2.0"))


def _call_llm(messages: list[dict], temperature: float = 0.3, max_tokens: int = 2000, timeout: int = 45) -> Optional[str]:
    """Call LLM with failover across providers. Returns text or None."""
    global _LLM_LAST_CALL

    for provider in _PROVIDERS:
        _LLM_SEMAPHORE.acquire()
        try:
            with _LLM_LOCK:
                elapsed = time.monotonic() - _LLM_LAST_CALL
                wait = _LLM_MIN_DELAY - elapsed
                if wait > 0:
                    time.sleep(wait)
                _LLM_LAST_CALL = time.monotonic()

            headers = {
                "Authorization": f"Bearer {provider['key']}",
                "Content-Type": "application/json",
            }
            body = {
                "model": provider["models"][0],
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(provider["url"], headers=headers, json=body)

            if resp.status_code >= 400:
                continue

            data = resp.json()
            content = data["choices"][0]["message"].get("content", "")
            if content:
                return content
        except Exception:
            continue
        finally:
            _LLM_SEMAPHORE.release()

    return None


# === SCHEMAS ===

class ExplainRequest(BaseModel):
    facts: str = Field(..., description="Original facts provided by the user")
    rules: str = Field(..., description="Rules provided by the user")
    inferred_facts: List[str] = Field(default_factory=list, description="Inferred facts from the reasoning engine")


class ExplainResponse(BaseModel):
    explanation: str
    provider: str = ""


class TranslateRuleRequest(BaseModel):
    description: str = Field(..., description="Natural language description of the rule")


class TranslateRuleResponse(BaseModel):
    rule: str
    facts_example: str = ""
    provider: str = ""


# === ENDPOINTS ===

_EXPLAIN_SYSTEM = """Eres un asistente experto en nomencladores de indicadores socioeconómicos.
Tu tarea es explicar resultados de inferencia lógica en español claro y simple, para un humano no técnico.

Contexto del dominio:
- Un nomenclador es un catálogo de variables, conceptos, fuentes de datos, clasificadores y normativas.
- Las relaciones principales son: deriva_de, compone, equivalente_a, usa_clasificador, implementa.
- Los hechos tienen la forma predicado(sujeto, objeto).
- Las reglas usan sintaxis IF ... AND ... THEN ... con variables ?X, ?Y, ?Z.

Instrucciones:
1. Explica QUÉ se infirió y POR QUÉ, en lenguaje natural.
2. Usa ejemplos concretos del nomenclador (no abstractos).
3. Máximo 3 párrafos, sé conciso.
4. No uses jerga técnica como "forward chaining" o "Rete network".
5. Si no se infirió nada, explica por qué la regla no se activó.
"""


@router.post("/api/ai/explain", response_model=ExplainResponse)
async def explain_inference(body: ExplainRequest):
    if not _PROVIDERS:
        raise HTTPException(status_code=503, detail="No hay providers LLM configurados. Verifica GROQ_API_KEY o GEMINI_API_KEY en el entorno.")

    inferred_text = "\n".join(body.inferred_facts) if body.inferred_facts else "(no se infirieron nuevos hechos)"

    user_msg = f"""Hechos originales:
{body.facts}

Reglas:
{body.rules}

Hechos inferidos:
{inferred_text}

Explica estos resultados en español claro para un humano no técnico."""

    messages = [
        {"role": "system", "content": _EXPLAIN_SYSTEM},
        {"role": "user", "content": user_msg},
    ]

    result = _call_llm(messages, temperature=0.3, max_tokens=1500)
    if not result:
        raise HTTPException(status_code=503, detail="El LLM no respondió. Intenta de nuevo.")

    return ExplainResponse(explanation=result.strip())


_TRANSLATE_SYSTEM = """Eres un asistente experto en nomencladores de indicadores socioeconómicos.
Tu tarea es traducir descripciones en lenguaje natural a reglas de inferencia formales.

Formato de reglas:
- Sintaxis: IF predicado(?X, ?Y) AND predicado(?Y, ?Z) THEN predicado(?X, ?Z)
- Variables: ?X, ?Y, ?Z, ?A, ?B, ?C, ?F, ?K, ?C
- Predicados válidos: deriva_de, compone, equivalente_a, usa_clasificador, implementa, clasifica, normaliza

Instrucciones:
1. Convierte la descripción a una regla IF ... THEN ... válida.
2. Genera 2-3 hechos de ejemplo que activarían la regla.
3. Responde en formato:
RULE: <regla>
FACTS: <hechos de ejemplo, uno por línea>

4. Si la descripción es ambigua, usa tu mejor interpretación.
5. Mantén los predicados en español (deriva_de, compone, etc.).
"""


@router.post("/api/ai/translate-rule", response_model=TranslateRuleResponse)
async def translate_rule(body: TranslateRuleRequest):
    if not _PROVIDERS:
        raise HTTPException(status_code=503, detail="No hay providers LLM configurados. Verifica GROQ_API_KEY o GEMINI_API_KEY en el entorno.")

    messages = [
        {"role": "system", "content": _TRANSLATE_SYSTEM},
        {"role": "user", "content": f"Traduce esta descripción a una regla de inferencia:\n\n{body.description}"},
    ]

    result = _call_llm(messages, temperature=0.2, max_tokens=1000)
    if not result:
        raise HTTPException(status_code=503, detail="El LLM no respondió. Intenta de nuevo.")

    text = result.strip()

    rule = ""
    facts_example = ""

    for line in text.split("\n"):
        if line.startswith("RULE:"):
            rule = line[5:].strip()
        elif line.startswith("FACTS:"):
            facts_example = line[6:].strip()

    if not rule:
        rule = text

    return TranslateRuleResponse(rule=rule, facts_example=facts_example)
