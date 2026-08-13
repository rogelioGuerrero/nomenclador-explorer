# Nomenclador Explorer

Fork de [Semantica Knowledge Explorer](https://github.com/semantica-agi/semantica) adaptado para visualizar y razonar sobre nomencladores de indicadores socioeconómicos.

## Qué hace

- **Visualiza** el nomenclador como un grafo interactivo: variables, fuentes, clasificadores, normativas y sus relaciones.
- **Razona** con reglas de inferencia `IF...THEN...` en el Reasoning Playground.
- **Explica** los resultados de inferencia en español claro usando IA (Groq/Gemini/SambaNova).
- **Traduce** descripciones en lenguaje natural a reglas formales `IF...THEN...`.

## Endpoints AI

- `POST /api/ai/explain` — explica hechos inferidos en español
- `POST /api/ai/translate-rule` — traduce lenguaje natural a sintaxis de reglas

Ambos leen `GROQ_API_KEY` / `GEMINI_API_KEY` del entorno (o `.env`).

## Origen

Basado en el paquete `semantica` (MIT License). Se removieron módulos no utilizados (parse, split, embeddings, vector_store, pipeline, etc.) dejando solo lo necesario para el Explorer, reasoning, ontology, provenance y MCP.
