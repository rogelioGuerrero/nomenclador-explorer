"""
AI assistant routes for the Nomenclador Explorer.

Two endpoints:
- /api/ai/explain: explain inferred facts in plain Spanish
- /api/ai/translate-rule: translate natural language to IF/THEN rule syntax

Uses the same LLM providers as governance-agent (Groq, Gemini, SambaNova)
via env vars. Self-contained — no dependency on governance-agent code.
"""

import asyncio
import os
import time
import logging
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    # Load .env from project root and CWD
    for _env_path in [Path.cwd() / ".env", Path(__file__).resolve().parents[3] / ".env"]:
        if _env_path.exists():
            load_dotenv(_env_path)
except ImportError:
    pass

router = APIRouter(tags=["AI"])

# === LLM PROVIDERS (self-contained, reads same env vars as governance-agent) ===

def _build_providers() -> list[dict]:
    """Build provider list dynamically from env vars.

    Called on each request so keys set after server start (e.g. via .env
    or export) are picked up without restarting.
    """
    providers = []

    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        providers.append({
            "name": "groq",
            "url": "https://api.groq.com/openai/v1/chat/completions",
            "key": groq_key,
            "models": [os.getenv("GROQ_MODEL_PRIMARY", "llama-3.3-70b-versatile")],
        })

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if gemini_key:
        providers.append({
            "name": "gemini",
            "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            "key": gemini_key,
            "models": [os.getenv("GEMINI_MODEL", "gemini-2.0-flash")],
        })

    sambanova_key = os.getenv("SAMBANOVA_API_KEY", "")
    if sambanova_key:
        providers.append({
            "name": "sambanova",
            "url": "https://api.sambanova.ai/v1/chat/completions",
            "key": sambanova_key,
            "models": [os.getenv("SAMBANOVA_MODEL", "Meta-Llama-3.1-70B-Instruct")],
        })

    return providers

_LLM_SEMAPHORE = asyncio.Semaphore(1)
_LLM_LAST_CALL = 0.0
_LLM_MIN_DELAY = float(os.getenv("LLM_MIN_DELAY", "2.0"))

logger = logging.getLogger(__name__)


async def _call_llm(messages: list[dict], temperature: float = 0.3, max_tokens: int = 2000, timeout: int = 45) -> Optional[str]:
    """Call LLM with failover across providers. Returns text or None."""
    global _LLM_LAST_CALL

    providers = _build_providers()
    for provider in providers:
        async with _LLM_SEMAPHORE:
            elapsed = time.monotonic() - _LLM_LAST_CALL
            wait = _LLM_MIN_DELAY - elapsed
            if wait > 0:
                await asyncio.sleep(wait)
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
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(provider["url"], headers=headers, json=body)
            except Exception as exc:
                logger.warning("LLM provider %s failed: %s", provider["name"], exc)
                continue

            if resp.status_code >= 400:
                logger.warning("LLM provider %s returned %d", provider["name"], resp.status_code)
                continue

            data = resp.json()
            content = data["choices"][0]["message"].get("content", "")
            if content:
                return content

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
    if not _build_providers():
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

    result = await _call_llm(messages, temperature=0.3, max_tokens=1500)
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
    if not _build_providers():
        raise HTTPException(status_code=503, detail="No hay providers LLM configurados. Verifica GROQ_API_KEY o GEMINI_API_KEY en el entorno.")

    messages = [
        {"role": "system", "content": _TRANSLATE_SYSTEM},
        {"role": "user", "content": f"Traduce esta descripción a una regla de inferencia:\n\n{body.description}"},
    ]

    result = await _call_llm(messages, temperature=0.2, max_tokens=1000)
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


class SuggestInstrumentRequest(BaseModel):
    policy_description: str = Field(..., description="Descripción de la política pública a monitorear")
    population: str = Field(default="", description="Filtro opcional de población objetivo")


class InstrumentVariable(BaseModel):
    name: str
    definition: str
    suggested_question: str
    response_options: dict[str, str]
    classifier_standard: str = ""
    population: str = ""
    capture_method: str = ""
    custodian: str = ""
    custodian_department: str = ""
    normative: str = ""
    rationale: str = ""


class SuggestInstrumentResponse(BaseModel):
    variables: List[InstrumentVariable]
    summary: str = ""
    provider: str = ""


_SUGGEST_INSTRUMENT_SYSTEM = """Eres un experto en diseño de instrumentos de captura de datos socioeconómicos.
Tu tarea es, dada una descripción de política pública y un catálogo de conceptos disponibles,
seleccionar las variables relevantes y generar un instrumento indicativo (codebook).

Para cada variable seleccionada debes generar:
1. Una pregunta sugerida en español, lista para usar en un formulario (Kobo/Google Forms).
2. Las opciones de respuesta, tomadas EXCLUSIVAMENTE del clasificador del concepto.
3. Una justificación breve de por qué esa variable es necesaria para la política descrita.

Reglas estrictas:
- NO inventes opciones de respuesta que no estén en el clasificador del concepto.
- Si un concepto no tiene clasificador, indica "respuesta abierta" en las opciones.
- NO incluyas variables que no estén en el catálogo proporcionado.
- Prioriza variables que ya tienen estandarización (standard, classifier).
- Máximo 15 variables por instrumento.
- Responde en JSON válido con esta estructura:
{
  "variables": [
    {
      "name": "<nombre canónico del concepto>",
      "suggested_question": "<pregunta en español>",
      "rationale": "<por qué es relevante para esta política>"
    }
  ],
  "summary": "<breve resumen del instrumento sugerido>"
}
"""


@router.post("/api/ai/suggest-instrument", response_model=SuggestInstrumentResponse)
async def suggest_instrument(body: SuggestInstrumentRequest):
    if not _build_providers():
        raise HTTPException(status_code=503, detail="No hay providers LLM configurados. Verifica GROQ_API_KEY o GEMINI_API_KEY en el entorno.")

    from mcp.tools.nomenclador import get_agent
    agent = get_agent()

    concepts_data = agent.list_concepts()
    if "error" in concepts_data:
        raise HTTPException(status_code=504, detail=concepts_data["error"])

    catalog_lines = []
    for c in concepts_data.get("concepts", []):
        line = f"- {c['name']}"
        if c.get("standard"):
            line += f" (estándar: {c['standard']})"
        if c.get("definition") and c["definition"] != "-":
            line += f": {c['definition']}"
        catalog_lines.append(line)

    catalog = "\n".join(catalog_lines)
    pop_filter = f"\nPoblación objetivo: {body.population}" if body.population else ""

    user_msg = f"""Descripción de la política pública:
{body.policy_description}{pop_filter}

Catálogo de conceptos disponibles en el nomenclador:
{catalog}

Selecciona las variables relevantes para monitorear esta política y genera el instrumento indicativo."""

    messages = [
        {"role": "system", "content": _SUGGEST_INSTRUMENT_SYSTEM},
        {"role": "user", "content": user_msg},
    ]

    result = await _call_llm(messages, temperature=0.3, max_tokens=3000)
    if not result:
        raise HTTPException(status_code=503, detail="El LLM no respondió. Intenta de nuevo.")

    import json as _json

    llm_output = result.strip()
    if llm_output.startswith("```"):
        llm_output = llm_output.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        parsed = _json.loads(llm_output)
    except _json.JSONDecodeError:
        start = llm_output.find("{")
        end = llm_output.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                parsed = _json.loads(llm_output[start:end])
            except _json.JSONDecodeError:
                raise HTTPException(status_code=502, detail="El LLM no devolvió JSON válido.")
        else:
            raise HTTPException(status_code=502, detail="El LLM no devolvió JSON válido.")

    variables: List[InstrumentVariable] = []
    for var in parsed.get("variables", []):
        concept_name = var.get("name", "")
        concept_detail = agent.get_concept(concept_name)

        response_options: dict[str, str] = {}
        classifier_standard = ""
        if "classifier" in concept_detail:
            clf = concept_detail["classifier"]
            classifier_standard = clf.get("standard", clf.get("name", ""))
            response_options = clf.get("values", {})

        variables.append(InstrumentVariable(
            name=concept_name,
            definition=concept_detail.get("definition", "-"),
            suggested_question=var.get("suggested_question", ""),
            response_options=response_options,
            classifier_standard=classifier_standard,
            population=concept_detail.get("population", "-"),
            capture_method=concept_detail.get("capture_method", "-"),
            custodian=concept_detail.get("custodian", "-"),
            custodian_department=concept_detail.get("custodian_department", "-"),
            normative=concept_detail.get("normative", "-"),
            rationale=var.get("rationale", ""),
        ))

    return SuggestInstrumentResponse(
        variables=variables,
        summary=parsed.get("summary", ""),
    )


@router.get("/api/ai/status")
async def ai_status():
    """Check which LLM providers are configured."""
    providers = _build_providers()
    return {
        "configured": len(providers) > 0,
        "providers": [{"name": p["name"], "model": p["models"][0]} for p in providers],
        "env_checked": {
            "GROQ_API_KEY": bool(os.getenv("GROQ_API_KEY")),
            "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
            "SAMBANOVA_API_KEY": bool(os.getenv("SAMBANOVA_API_KEY")),
        },
    }
