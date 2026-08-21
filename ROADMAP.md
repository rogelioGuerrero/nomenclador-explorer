# Nomenclador Explorer — Hoja de Ruta

## Estado actual

### Fase 1 — Core + UI ✅
- MCP Server con 24 tools y 4 resources (JSON-RPC 2.0 over stdio)
- NomencladorAgent con 7 tools de gobernanza semántica (patrón NOOA)
- 3 endpoints de IA con Groq/Gemini/SambaNova y failover
- Provenance tracking con SQLite (W3C PROV-O)
- Explorer UI con 10 workspaces (React 19 + Sigma.js)
- Reasoning engine (deductivo, abductivo, temporal, SPARQL, SHACL)
- Tests con pytest
- Bug fix: UnicodeEncodeError en Windows (cp1252 → UTF-8 fallback en _write)

### Fase 2 — Caso real ✅

#### 2.1 Nomenclador.json real ✅
- 20 conceptos con estándares reales (ISO 5218, ISCO-08, ISCED, ISIC Rev.4, ICD-11, etc.)
- 12 clasificadores con valores canónicos
- 42 campos con metadata completa
- 13 fuentes reales: CEPALSTAT, WorldBank, INE_PY, OIT, OMS, UNESCO, ITU, BCP, etc.
- Asimetrías reales: mismo concepto con distinto método de captura, población, cardinalidad

#### 2.2 MCP server en Windsurf ✅
- Server configurado en `devin/mcp_config.json` con wrapper `start_mcp.py`
- 24 tools verificadas via JSON-RPC handshake
- Tools del nomenclador probadas desde Cascade en el IDE:
  - `list_concepts` → 20 conceptos
  - `check_interoperability` INE_PY↔CEPALSTAT → 5 paths con asimetrías reales
  - `check_interoperability` INE_PY↔WorldBank → 4 paths, detectó NO RECOMENDADA
  - `get_transform` → SQL CASE WHEN + JSON Schema generados
  - `validate_field` → detectó M/F como no canónicos para ISO 5218
  - `get_concept` → metadata completa (custodio, normativa, calidad)
  - `get_classifier` → valores canónicos ISO 5218

#### 2.3 Exporters multi-formato ✅
- Endpoint `/api/nomenclador/export-transform` con 4 formatos:
  - **Tableau** Calculated Fields
  - **dbt** model (SELECT con CASE WHEN + ref())
  - **pandas** mapping dictionary + apply_transforms()
  - **PySpark** withColumn/withColumnRenamed

---

### 2.4 Probar AI routes con datos reales ✅
- Server FastAPI levantado con `SEMANTICA_ALLOW_ANONYMOUS=true` y `GROQ_API_KEY`
- Modelo: `openai/gpt-oss-120b` (llama-3.3-70b-versatile dio 404, deprecado)
- `/api/ai/suggest-instrument` — generó instrumento de 9 variables para empleo juvenil rural en Paraguay
- `/api/ai/explain` — explicó asimetría metodológica Sexo INE_PY↔WorldBank
- `/api/ai/translate-rule` — tradujo descripción natural a regla IF/THEN
- `/api/nomenclador/export-transform` — dbt, tableau, pandas, pyspark todos verificados

---

## Fase 3 — Capa semántica del datalake (proyecto nuevo)

**Objetivo:** Convertir al nomenclador de "documentación bonita" a infraestructura semántica que cualquier ETL consulta.

**Principio:** El nomenclador NO es ETL execution. Es el intérprete en 4 momentos:

```
PLANIFICAR → check_interoperability (¿puedo unir A y B? ¿por qué?)
TRAER      → ETL extrae datos crudos
TRADUCIR  → get_transform (¿cómo transformo a canónico?)
NARRAR    → get_concept + explain (¿qué significa? contexto)
```

### 3.1 API de validación como servicio ✅
- Endpoint REST `/api/nomenclador/validate` ya existe y funciona
- Input: columna + valores muestra
- Output: estándar detectado, valores no canónicos, confianza
- Pendiente: wrapper HTTP ligero para consumo desde ETL externos (Airflow, Pentaho, etc.)

### 3.2 Export a DDI ✅
- Endpoint `GET /api/nomenclador/export-ddi` genera DDI 3.2 XML
- 20 conceptos exportados con: nombre, definición, estándar, versión, clasificador (CodeList), población, método de captura, custodian, normativa, confidencialidad
- Cada campo físico (DataElement) con tipo de dato, calidad, completitud y confianza
- Interoperable con ecosistema estadístico internacional (CEPAL, Banco Mundial, Eurostat)

### 3.3 Exporters multi-formato del transform ✅
- Endpoint `/api/nomenclador/export-transform` con 4 formatos
- Tableau Calculated Fields (con warnings como comentarios)
- dbt model (SELECT con CASE WHEN + ref())
- pandas mapping dictionary + apply_transforms()
- PySpark withColumn/withColumnRenamed

### 3.4 Diff de versiones del nomenclador ✅
- Endpoint `POST /api/nomenclador/diff` compara dos snapshots JSON
- Detecta: conceptos nuevos, conceptos removidos, cambios de standard/definición/población/captura/custodio/review_status
- Detecta deprecation de conceptos
- Detecta campos agregados/removidos por concepto
- Probado: detectó 1 nuevo, 2 cambiados (Sexo cambió standard, Edad deprecado), 18 sin cambios

### 3.5 Catálogo Open Data ✅
- Endpoint `GET /api/nomenclador/export-opendata/frictionless` — Frictionless Data Package v2
  - 42 fields con tipo, título, descripción, rdfType (estándar), constraints (enum de clasificador)
  - 13 sources, licencia CC0, keywords
  - Consumible por pandas, OpenRefine, Dataverse, GitHub
- Endpoint `GET /api/nomenclador/export-opendata/ckan` — CKAN package schema
  - 42 resources con concept, standard, definition, capture_method, custodian, quality_score
  - 18 tags (estándares), 12 extras (clasificadores con valores canónicos)
  - Importable directo a portales CKAN (datos.gob.mx, datos.gob.ar, data.worldbank.org)

### Criterio de salida
- API de validación consumida por al menos 1 pipeline ETL real
- Export DDI validado contra un repositorio estadístico internacional
- Documentación de cómo integrar el nomenclador con cualquier stack ETL

---

## Lo que NO se hace

- **LangChain/LangGraph** — el patrón NOOA lo descarta, los flujos multi-step ya están codificados a mano
- **Orquestador genérico** — los flujos son conocidos y hardcoded, más confiable que un LLM decidiendo rutas
- **Vector store** — NetworkX + índices es suficiente para el volumen de un nomenclador
- **Deploy a la nube** — local con arranque manual es suficiente para el caso de uso
- **ETL execution dentro del nomenclador** — el nomenclador es el intérprete, no la grúa

---

## Arquitectura de referencia

```
nomenclador-explorer/
├── mcp/                          # MCP Server (24 tools, 4 resources)
│   ├── server.py                 # JSON-RPC 2.0 over stdio
│   ├── session.py                # Lazy singleton del grafo
│   ├── schemas.py                # JSON Schema de inputs
│   └── tools/
│       ├── nomenclador.py        # NomencladorAgent (7 tools, OO Agent)
│       ├── extraction.py         # NER, relations, events
│       ├── decisions.py          # Record, query, precedents, causal chain
│       ├── graph.py              # Add/search/analytics
│       ├── reasoning.py          # Forward-chaining, abductive
│       └── export.py             # Multi-format export + provenance
├── semantica/
│   ├── core/
│   │   ├── orchestrator.py       # Framework coordinator (1027 líneas)
│   │   └── lifecycle.py          # State management (614 líneas)
│   ├── explorer/
│   │   ├── app.py                # FastAPI + 14 routers + WebSocket
│   │   └── routes/
│   │       └── ai.py             # 3 endpoints IA con failover
│   ├── provenance/
│   │   └── storage.py            # SQLite W3C PROV-O (1040 líneas)
│   └── reasoning/                # Deductive, abductive, datalog, SPARQL, Rete
├── explorer/                     # React 19 + Sigma.js (10 workspaces)
├── tests/                        # pytest
└── ROADMAP.md                    # Este documento
```

## Stack técnico
- **Backend:** Python 3.8+, FastAPI, NetworkX, rdflib, pydantic
- **IA:** Groq (GPT-OSS 120B), Gemini, SambaNova con failover
- **Frontend:** React 19, Vite 6, Sigma.js 3, Monaco Editor
- **Storage:** SQLite (provenance), JSON (grafo)
- **Protocolo:** MCP (JSON-RPC 2.0 over stdio)
- **Patrón:** NOOA (NVIDIA Object Oriented Agent)
