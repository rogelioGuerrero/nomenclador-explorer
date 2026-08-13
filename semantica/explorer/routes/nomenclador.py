"""
Nomenclador routes — REST endpoints for the governance-agent nomenclador tools.

These endpoints delegate to the NomencladorAgent singleton (same one used by the
MCP tools) so the UI can call them without going through stdio.
"""

import json
import logging
import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..dependencies import get_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/nomenclador", tags=["Nomenclador"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class InteropRequest(BaseModel):
    source_db: str
    target_db: str


class TransformRequest(BaseModel):
    source_db: str
    target_db: str


class ValidateRequest(BaseModel):
    column_name: str
    sample_values: List[str]


class ClassifierRequest(BaseModel):
    standard_id: str


# ---------------------------------------------------------------------------
# Agent accessor — lazy import to avoid circular deps
# ---------------------------------------------------------------------------

def _get_agent():
    from mcp.tools.nomenclador import get_agent
    return get_agent()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/concepts")
async def list_concepts():
    """List all canonical concepts in the nomenclador."""
    agent = _get_agent()
    return agent.list_concepts()


@router.get("/search")
async def search_variable(name: str = Query(..., description="Variable name to search")):
    """Search for a variable by name across all sources."""
    agent = _get_agent()
    result = agent.search_variable(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Variable '{name}' not found")
    return result


@router.get("/concept/{name}")
async def get_concept(name: str):
    """Get full detail for a canonical concept."""
    agent = _get_agent()
    result = agent.get_concept(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Concept '{name}' not found")
    return result


@router.post("/interoperability")
async def check_interoperability(req: InteropRequest):
    """Check interoperability between two data sources."""
    agent = _get_agent()
    return agent.check_interoperability(req.source_db, req.target_db)


@router.post("/transform")
async def get_transform(req: TransformRequest):
    """Generate SQL transforms and JSON schemas between two sources."""
    agent = _get_agent()
    return agent.get_transform(req.source_db, req.target_db)


@router.post("/validate")
async def validate_field(req: ValidateRequest):
    """Validate sample values against known classifiers."""
    agent = _get_agent()
    return agent.validate_field(req.column_name, req.sample_values)


@router.get("/classifier/{standard_id}")
async def get_classifier(standard_id: str):
    """Get classifier details by standard ID."""
    agent = _get_agent()
    result = agent.get_classifier(standard_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Classifier '{standard_id}' not found")
    return result


@router.get("/sources")
async def list_sources():
    """List all data source nodes in the nomenclador graph."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")
    sources = []
    for node_id, data in g.nodes(data=True):
        if data.get("node_type") == "source" or data.get("type") == "source":
            sources.append({
                "id": node_id,
                "name": data.get("name", node_id),
                "label": data.get("label", data.get("name", node_id)),
            })
    return {"sources": sources, "count": len(sources)}


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

@router.get("/insights")
async def list_insights(source: Optional[str] = Query(None, description="Filter by source")):
    """List all insight nodes from the nomenclador graph."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")
    insights = []
    for node_id, data in g.nodes(data=True):
        nt = data.get("node_type") or data.get("type", "")
        if nt in ("insight", "Insight"):
            if source and source not in str(data.get("source_id", "")):
                continue
            insights.append({
                "id": node_id,
                "observation": data.get("observation", ""),
                "source_id": data.get("source_id", ""),
                "created_at": data.get("created_at", ""),
                "variables_covered": data.get("variables_covered", []),
                "cross_source_potential": data.get("cross_source_potential", ""),
                "quality_snapshot": data.get("quality_snapshot", {}),
            })
    return {"insights": insights, "count": len(insights)}


# ---------------------------------------------------------------------------
# Normatives (from graph nodes)
# ---------------------------------------------------------------------------

@router.get("/normatives")
async def list_normatives(concept: Optional[str] = Query(None, description="Filter by concept")):
    """List all normative nodes from the nomenclador graph."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")
    normatives = []
    for node_id, data in g.nodes(data=True):
        nt = data.get("node_type") or data.get("type", "")
        if nt in ("normative", "Normative"):
            normatives.append({
                "id": node_id,
                "title": data.get("title", ""),
                "source": data.get("source", ""),
                "citation": data.get("citation", ""),
                "similarity_score": data.get("similarity_score", 0),
                "article": data.get("article", ""),
            })
    return {"normatives": normatives, "count": len(normatives)}


# ---------------------------------------------------------------------------
# RAG — normative corpus search (text + tags, no embeddings needed)
# ---------------------------------------------------------------------------

_NORMATIVE_CORPUS_CACHE: Optional[dict] = None
_NORMATIVE_CORPUS_PATH: Optional[str] = None


def _load_normative_corpus() -> Optional[dict]:
    global _NORMATIVE_CORPUS_CACHE, _NORMATIVE_CORPUS_PATH
    kg_path = os.environ.get("SEMANTICA_KG_PATH", "")
    if kg_path:
        corpus_path = str(Path(kg_path).parent / "normative_corpus.json")
    else:
        corpus_path = str(Path.home() / "governance-agent" / "nomenclador" / "normative_corpus.json")
    if _NORMATIVE_CORPUS_CACHE is not None and _NORMATIVE_CORPUS_PATH == corpus_path:
        return _NORMATIVE_CORPUS_CACHE
    try:
        with open(corpus_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _NORMATIVE_CORPUS_CACHE = data
        _NORMATIVE_CORPUS_PATH = corpus_path
        return data
    except FileNotFoundError:
        logger.warning(f"Normative corpus not found at {corpus_path}")
        return None
    except Exception as e:
        logger.error(f"Error loading normative corpus: {e}")
        return None


@router.get("/rag/search")
async def rag_search(q: str = Query(..., description="Search query (variable name or keyword)")):
    """Search the normative corpus for documents relevant to a variable/keyword.

    Uses simple tag matching and text search (no embeddings required).
    Returns chunks with their text, source, and tags.
    """
    corpus = _load_normative_corpus()
    if corpus is None:
        raise HTTPException(status_code=504, detail="Normative corpus not available")
    chunks = corpus.get("chunks", [])
    q_lower = q.lower()
    results = []
    for chunk in chunks:
        tags = chunk.get("tags", [])
        text = chunk.get("text", "")
        score = 0
        if q_lower in [t.lower() for t in tags]:
            score += 10
        if q_lower in text.lower():
            score += 5
        for tag in tags:
            if q_lower in tag.lower() or tag.lower() in q_lower:
                score += 3
        if score > 0:
            results.append({
                "id": chunk.get("id", ""),
                "source": chunk.get("source", ""),
                "source_type": chunk.get("source_type", ""),
                "chunk_index": chunk.get("chunk_index", 0),
                "text": text,
                "tags": tags,
                "score": score,
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return {
        "query": q,
        "results": results,
        "count": len(results),
        "model": corpus.get("embedding_model", ""),
        "total_chunks": len(chunks),
    }


@router.get("/rag/chunks")
async def rag_chunks():
    """List all chunks in the normative corpus (metadata only, no embeddings)."""
    corpus = _load_normative_corpus()
    if corpus is None:
        raise HTTPException(status_code=504, detail="Normative corpus not available")
    chunks = corpus.get("chunks", [])
    return {
        "chunks": [
            {
                "id": c.get("id", ""),
                "source": c.get("source", ""),
                "source_type": c.get("source_type", ""),
                "chunk_index": c.get("chunk_index", 0),
                "tags": c.get("tags", []),
                "text_preview": c.get("text", "")[:200],
            }
            for c in chunks
        ],
        "count": len(chunks),
        "model": corpus.get("embedding_model", ""),
    }


# ---------------------------------------------------------------------------
# Graph reload
# ---------------------------------------------------------------------------

@router.post("/reload")
async def reload_graph():
    """Reload the nomenclador graph from disk."""
    agent = _get_agent()
    kg_path = os.environ.get("SEMANTICA_KG_PATH", "")
    if not kg_path:
        raise HTTPException(status_code=400, detail="SEMANTICA_KG_PATH not set")
    try:
        agent.load_graph(kg_path)
        g = agent.get_graph()
        node_count = g.number_of_nodes() if g else 0
        edge_count = g.number_of_edges() if g else 0
        return {"status": "ok", "nodes": node_count, "edges": edge_count, "path": kg_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload graph: {e}")
