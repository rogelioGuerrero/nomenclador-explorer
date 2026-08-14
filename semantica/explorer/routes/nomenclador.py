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

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
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


class ReviewRequest(BaseModel):
    review_status: str  # approved | rejected | under_review
    review_notes: str = ""
    reviewed_by: str = ""


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
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/concept/{name}")
async def get_concept(name: str):
    """Get full detail for a canonical concept."""
    agent = _get_agent()
    result = agent.get_concept(name)
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.patch("/concepts/{name}/review")
async def review_concept(name: str, req: ReviewRequest):
    """Update review status and notes for a concept. Persists to disk."""
    agent = _get_agent()
    concept = agent._find_concept_by_name(name)
    if not concept:
        raise HTTPException(status_code=404, detail=f"Concepto '{name}' no encontrado")
    valid_statuses = {"approved", "rejected", "under_review", "proposed", "deprecated"}
    if req.review_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"review_status must be one of {valid_statuses}",
        )
    result = agent.update_review(
        node_id=concept["id"],
        review_status=req.review_status,
        review_notes=req.review_notes,
        reviewed_by=req.reviewed_by,
    )
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
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
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/review-summary")
async def review_summary():
    """Summary of review_status and data_classification across the nomenclador."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")

    review_counts: dict[str, int] = {}
    classification_counts: dict[str, int] = {}
    pending_concepts: list[dict] = []

    for node_id, data in g.nodes(data=True):
        nt = data.get("node_type") or data.get("type", "")
        if nt in ("concept", "Concept"):
            rs = data.get("review_status", "approved")
            review_counts[rs] = review_counts.get(rs, 0) + 1
            dc = data.get("data_classification", "publico")
            classification_counts[dc] = classification_counts.get(dc, 0) + 1
            if rs in ("proposed", "under_review"):
                pending_concepts.append({
                    "id": node_id,
                    "name": data.get("name", node_id),
                    "review_status": rs,
                    "proposed_by": data.get("proposed_by", ""),
                    "standard": data.get("standard"),
                })

    return {
        "review_counts": review_counts,
        "classification_counts": classification_counts,
        "pending_concepts": pending_concepts,
        "pending_count": len(pending_concepts),
        "total_concepts": sum(review_counts.values()),
    }


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


# ---------------------------------------------------------------------------
# Lineage — trace relationships across the nomenclador graph
# ---------------------------------------------------------------------------

_LINEAGE_EDGE_TYPES = {
    "implementa", "transforma_a", "equivalente_a", "proviene_de",
    "compone", "deriva_de", "subconcepto_de", "usa_clasificador",
    "respaldado_por", "pertenece_a", "tiene_contexto",
}


@router.get("/lineage/{node_id}")
async def get_lineage(node_id: str, depth: int = Query(2, ge=1, le=4)):
    """Trace lineage from a node, following nomenclador edges up to *depth* hops."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")

    # Resolve by name first (case-insensitive), then by raw node_id
    resolved_id = None
    concept = agent._find_concept_by_name(node_id)
    if concept:
        resolved_id = concept["id"]
    elif node_id in g:
        resolved_id = node_id
    else:
        # Try case-insensitive match on all node names
        for nid, data in g.nodes(data=True):
            if data.get("name", "").lower() == node_id.lower():
                resolved_id = nid
                break
    if not resolved_id:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")

    visited: set[str] = set()
    nodes_out: list[dict] = []
    edges_out: list[dict] = []
    queue: list[tuple[str, int]] = [(resolved_id, 0)]
    visited.add(resolved_id)

    while queue:
        current, current_depth = queue.pop(0)
        data = g.nodes[current]
        nodes_out.append({
            "id": current,
            "label": data.get("name", data.get("id", current)),
            "type": data.get("type", data.get("node_type", "unknown")),
            "source_db": data.get("source_db", ""),
            "standard": data.get("standard"),
            "review_status": data.get("review_status", "approved"),
            "data_classification": data.get("data_classification", "publico"),
            "is_root": current == resolved_id,
        })
        if current_depth >= depth:
            continue
        for _, target, edge_data in g.edges(current, data=True):
            edge_type = edge_data.get("type", "")
            if edge_type not in _LINEAGE_EDGE_TYPES:
                continue
            edges_out.append({
                "id": f"{current}->{target}",
                "source": current,
                "target": target,
                "label": edge_type,
            })
            if target not in visited:
                visited.add(target)
                queue.append((target, current_depth + 1))
        for source, _, edge_data in g.in_edges(current, data=True):
            edge_type = edge_data.get("type", "")
            if edge_type not in _LINEAGE_EDGE_TYPES:
                continue
            edges_out.append({
                "id": f"{source}->{current}",
                "source": source,
                "target": current,
                "label": edge_type,
            })
            if source not in visited:
                visited.add(source)
                queue.append((source, current_depth + 1))

    return {"root": resolved_id, "nodes": nodes_out, "edges": edges_out, "depth": depth}


# ---------------------------------------------------------------------------
# Quality dashboard — aggregated metrics by source
# ---------------------------------------------------------------------------

@router.get("/quality-summary")
async def quality_summary():
    """Aggregate quality metrics (completeness, uniqueness, consistency, validity, quality_score)
    by source, plus list of quality issues."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")

    source_metrics: dict[str, dict] = {}
    quality_issues: list[dict] = []
    source_last_verified: dict[str, str] = {}

    # First pass: collect last_verified from source nodes
    for node_id, data in g.nodes(data=True):
        nt = data.get("node_type") or data.get("type", "")
        if nt in ("source", "Source"):
            sname = data.get("name", node_id)
            lv = data.get("last_verified", "")
            if lv:
                source_last_verified[sname] = lv

    for node_id, data in g.nodes(data=True):
        nt = data.get("node_type") or data.get("type", "")
        if nt in ("field", "Field"):
            src = data.get("source_db", "?")
            if src not in source_metrics:
                source_metrics[src] = {
                    "source": src,
                    "field_count": 0,
                    "completeness": [],
                    "uniqueness": [],
                    "consistency": [],
                    "validity": [],
                    "quality_score": [],
                    "low_confidence": 0,
                    "pending_review": 0,
                }
            m = source_metrics[src]
            m["field_count"] += 1
            for metric in ("completeness", "uniqueness", "consistency", "validity", "quality_score"):
                val = data.get(metric)
                if val is not None:
                    try:
                        m[metric].append(float(val))
                    except (TypeError, ValueError):
                        pass
            if data.get("confidence", "low") == "low":
                m["low_confidence"] += 1
            if data.get("review_status", "approved") in ("proposed", "under_review"):
                m["pending_review"] += 1

        elif nt in ("quality_issue", "QualityIssue"):
            quality_issues.append({
                "id": node_id,
                "issue_type": data.get("issue_type", ""),
                "severity": data.get("severity", "warning"),
                "detail": data.get("detail", ""),
                "metric_value": data.get("metric_value", 0.0),
                "detected_by": data.get("detected_by", ""),
            })

    # Compute averages
    sources = []
    for src, m in source_metrics.items():
        entry = {"source": src, "field_count": m["field_count"],
                 "low_confidence": m["low_confidence"], "pending_review": m["pending_review"],
                 "last_verified": source_last_verified.get(src, "")}
        for metric in ("completeness", "uniqueness", "consistency", "validity", "quality_score"):
            vals = m[metric]
            entry[metric] = round(sum(vals) / len(vals), 3) if vals else 0.0
        sources.append(entry)
    sources.sort(key=lambda s: s["source"])

    issues_by_severity = {"error": 0, "warning": 0, "info": 0}
    for issue in quality_issues:
        sev = issue["severity"]
        issues_by_severity[sev] = issues_by_severity.get(sev, 0) + 1

    return {
        "sources": sources,
        "source_count": len(sources),
        "total_fields": sum(s["field_count"] for s in sources),
        "quality_issues": quality_issues,
        "issues_by_severity": issues_by_severity,
        "total_issues": len(quality_issues),
    }


# ---------------------------------------------------------------------------
# Decision Log — lifecycle audit trail from decision_log.json
# ---------------------------------------------------------------------------

@router.get("/decision-log")
async def get_decision_log():
    """Read the decision log from the governance-agent nomenclador directory."""
    kg_path = os.environ.get("SEMANTICA_KG_PATH", "")
    if not kg_path:
        raise HTTPException(status_code=400, detail="SEMANTICA_KG_PATH not set")
    log_path = Path(kg_path).parent / "decision_log.json"
    if not log_path.exists():
        return {"entries": {}}
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read decision log: {e}")


# ---------------------------------------------------------------------------
# Equivalences — edges of type equivalente_a
# ---------------------------------------------------------------------------

@router.get("/equivalences")
async def list_equivalences():
    """List all equivalente_a edges between fields/sources."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")
    equivalences = []
    for u, v, data in g.edges(data=True):
        et = data.get("edge_type") or data.get("type", "")
        if et == "equivalente_a":
            node_u = g.nodes[u]
            node_v = g.nodes[v]
            equivalences.append({
                "source_field": {
                    "id": u,
                    "name": node_u.get("name", node_u.get("column", u)),
                    "source_db": node_u.get("source_db", ""),
                },
                "target_field": {
                    "id": v,
                    "name": node_v.get("name", node_v.get("column", v)),
                    "source_db": node_v.get("source_db", ""),
                },
                "confidence": data.get("confidence", ""),
                "match_method": data.get("match_method", data.get("method", "")),
            })
    return {"equivalences": equivalences, "count": len(equivalences)}


# ---------------------------------------------------------------------------
# Source management — detailed list, upload (CSV), delete
# ---------------------------------------------------------------------------

@router.get("/sources/detailed")
async def list_sources_detailed():
    """List all data source nodes with field counts and metadata."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")
    sources = []
    for node_id, data in g.nodes(data=True):
        if data.get("node_type") == "source" or data.get("type") == "source":
            # Count fields belonging to this source
            field_count = 0
            for _f_id, f_data in g.nodes(data=True):
                if (f_data.get("node_type") == "field" or f_data.get("type") == "field"):
                    if f_data.get("source_db", "") == data.get("name", node_id):
                        field_count += 1
            sources.append({
                "id": node_id,
                "name": data.get("name", node_id),
                "description": data.get("description", ""),
                "last_verified": data.get("last_verified", ""),
                "review_status": data.get("review_status", "approved"),
                "field_count": field_count,
            })
    return {"sources": sources, "count": len(sources)}


@router.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    """Delete a source node and all its fields from the nomenclador graph."""
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")
    if source_id not in g:
        raise HTTPException(status_code=404, detail=f"Source '{source_id}' not found")
    # Find all fields belonging to this source
    source_name = g.nodes[source_id].get("name", source_id)
    fields_to_remove = []
    for node_id, data in g.nodes(data=True):
        if (data.get("node_type") == "field" or data.get("type") == "field"):
            if data.get("source_db", "") == source_name:
                fields_to_remove.append(node_id)
    # Remove fields first, then source
    for fid in fields_to_remove:
        g.remove_node(fid)
    g.remove_node(source_id)
    # Persist
    agent.save_graph()
    return {
        "status": "ok",
        "deleted_source": source_id,
        "deleted_fields": len(fields_to_remove),
    }


@router.post("/sources/preview")
async def preview_source(file: UploadFile = File(...)):
    """Profile a CSV file without persisting. Returns column-level profiling for preview."""
    import csv
    import io
    import re as _re

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("latin-1")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot decode file: {e}")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    rows = list(reader)
    total = len(rows)

    columns = []
    for col_name in reader.fieldnames:
        values = [r.get(col_name, "") for r in rows]
        non_null = [v for v in values if v and str(v).strip()]
        null_count = total - len(non_null)
        unique_count = len(set(non_null))

        sample = non_null[:20] if non_null else []
        data_type = "text"
        if sample:
            try:
                float(sample[0])
                data_type = "number"
            except (ValueError, TypeError):
                if _re.match(r"^\d{4}-\d{2}-\d{2}", sample[0]):
                    data_type = "date"
                else:
                    data_type = "text"

        completeness = round(len(non_null) / total, 3) if total > 0 else 0.0
        uniqueness = round(unique_count / len(non_null), 3) if non_null else 0.0

        columns.append({
            "name": col_name,
            "data_type": data_type,
            "null_count": null_count,
            "total_count": total,
            "unique_count": unique_count,
            "completeness": completeness,
            "uniqueness": uniqueness,
            "sample_values": non_null[:5],
        })

    return {
        "filename": file.filename,
        "row_count": total,
        "column_count": len(reader.fieldnames),
        "columns": columns,
    }


@router.post("/sources/upload")
async def upload_source(file: UploadFile = File(...)):
    """Upload a CSV file, profile it, and add as a new source in the nomenclador.

    This runs a simplified version of rapid_assessment:
    - Detects column types, null rates, unique counts
    - Creates source + field nodes in the graph
    - Returns summary of detected fields
    """
    import csv
    import io
    from datetime import datetime, timezone

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("latin-1")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot decode file: {e}")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    rows = list(reader)
    total = len(rows)

    # Profile each column
    source_name = f"uploaded_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    agent = _get_agent()
    g = agent.get_graph()
    if g is None:
        raise HTTPException(status_code=503, detail="Nomenclador graph not loaded")

    # Create source node
    source_id = f"source:{source_name}"
    g.add_node(source_id, **{
        "type": "source",
        "name": source_name,
        "description": f"Uploaded CSV ({total} rows, {len(reader.fieldnames)} columns)",
        "last_verified": datetime.now(timezone.utc).isoformat(),
        "review_status": "proposed",
    })

    field_count = 0
    for col_name in reader.fieldnames:
        values = [r.get(col_name, "") for r in rows]
        non_null = [v for v in values if v and str(v).strip()]
        null_count = total - len(non_null)
        unique_count = len(set(non_null))

        # Infer data type
        sample = non_null[:20] if non_null else []
        data_type = "text"
        if sample:
            try:
                float(sample[0])
                data_type = "number"
            except (ValueError, TypeError):
                # Check if date-like
                import re
                if re.match(r"^\d{4}-\d{2}-\d{2}", sample[0]):
                    data_type = "date"
                else:
                    data_type = "text"

        completeness = round(len(non_null) / total, 3) if total > 0 else 0.0
        uniqueness = round(unique_count / len(non_null), 3) if non_null else 0.0

        field_id = f"field:{source_name}:{col_name}"
        g.add_node(field_id, **{
            "type": "field",
            "source_db": source_name,
            "table": source_name,
            "column": col_name,
            "name": col_name,
            "data_type": data_type,
            "nullable": null_count > 0,
            "null_count": null_count,
            "total_count": total,
            "unique_count": unique_count,
            "sample_values": non_null[:5],
            "confidence": "low",
            "completeness": completeness,
            "uniqueness": uniqueness,
            "consistency": 0.0,
            "validity": 0.0,
            "quality_score": round((completeness + uniqueness) / 2, 3),
            "review_status": "proposed",
            "data_classification": "publico",
        })
        # Link field -> source
        g.add_edge(field_id, source_id, **{"type": "proviene_de"})
        field_count += 1

    # Persist
    agent.save_graph()

    return {
        "status": "ok",
        "source_name": source_name,
        "source_id": source_id,
        "field_count": field_count,
        "row_count": total,
    }
