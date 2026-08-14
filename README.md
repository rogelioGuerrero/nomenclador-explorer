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

## Desarrollo y pruebas

### Requisitos
- Python 3.11+ con `semantica` instalado (`pip install -e .`)
- Node.js 20+ y npm
- Navegador Chrome instalado en el sistema

### Estructura de estilos
- `explorer/src/index.css` — reset global, fuentes, scrollbar, variables base
- `explorer/src/App.css` — todos los estilos de la app: landing page, workspaces, componentes
- **Ambos deben importarse en `main.tsx`**. Si `App.css` no se importa, la app se renderiza sin estilos.
- El import correcto en `main.tsx`:
```tsx
import './index.css'
import './App.css'
```

### Levantar el servidor
```powershell
# 1. Build del frontend (necesario después de cambios en src/)
cd explorer; npm run build

# 2. Levantar servidor backend + frontend servido
#    Desde la raíz del proyecto:
$env:SEMANTICA_ALLOW_ANONYMOUS="true"
$env:SEMANTICA_KG_PATH="D:\codebase\governance-agent\nomenclador\nomenclador.json"
python -m semantica.explorer --graph "D:\codebase\governance-agent\nomenclador\nomenclador_explorer.json" --port 8000
```

El servidor sirve el frontend compilado desde `semantica/static/` y la API en `http://127.0.0.1:8000`.

### Probar la UI con Playwright
```powershell
# Desde explorer/
node test-ui.mjs
```

El script `test-ui.mjs` usa Playwright con el canal `chrome` del sistema (no descarga navegador propio).
Verifica: landing page, capabilities, pestañas de Gobernanza (incluido Instrumento), Analizar (SPARQL), y Explorar.

### Notas
- Si el puerto 8000 está ocupado por un proceso zombie, usar `--port 8001` o matar el proceso con `taskkill /PID <pid> /F`.
- El build de Vite genera assets con hash en el nombre; el navegador puede cachear. Usar `Ctrl+Shift+R` para hard refresh.
- Los errores de TS server "Cannot find module" son falsos positivos del IDE; el build de Vite/tsc pasa sin errores.

## Origen

Basado en el paquete `semantica` (MIT License). Se removieron módulos no utilizados (parse, split, embeddings, vector_store, pipeline, etc.) dejando solo lo necesario para el Explorer, reasoning, ontology, provenance y MCP.
