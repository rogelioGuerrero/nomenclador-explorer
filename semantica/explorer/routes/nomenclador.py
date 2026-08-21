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


class ExportTransformRequest(BaseModel):
    source_db: str
    target_db: str
    format: str  # tableau | dbt | pandas | pyspark


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


# ---------------------------------------------------------------------------
# Multi-format transform exporters
# ---------------------------------------------------------------------------

import re

def _export_tableau(transforms: list) -> str:
    """Generate Tableau Calculated Fields for each transform."""
    lines = []
    for t in transforms:
        concept = t.get("concept", "")
        field_a = t.get("field_a", "")
        field_b = t.get("field_b", "")
        sql = t.get("sql", "")
        warnings = t.get("warnings", [])

        lines.append(f"// {concept} — {t.get('standard', '')}")
        lines.append(f"// Source: {field_a} -> Target: {field_b}")
        for w in warnings:
            lines.append(f"// WARNING: {w}")
        if "CASE" in sql:
            tableau_sql = re.sub(r'\s*END\s+AS\s+\S+', '', sql).strip()
            lines.append(f"// {tableau_sql}")
            lines.append("")
        else:
            lines.append(f"// Direct mapping: {field_a.split('.')[-1]} = {field_b.split('.')[-1]}")
            lines.append("")
    return "\n".join(lines)


def _export_dbt(transforms: list, source_db: str, target_db: str) -> str:
    """Generate dbt model with CASE WHEN transforms."""
    lines = [
        "-- dbt model: transform from " + source_db + " to " + target_db,
        "-- Generated by nomenclador-explorer",
        "",
        "{{ config(materialized='view') }}",
        "",
        "SELECT",
    ]
    for i, t in enumerate(transforms):
        concept = t.get("concept", "")
        field_a = t.get("field_a", "")
        field_b = t.get("field_b", "")
        sql = t.get("sql", "")
        target_col = field_b.split(".", 1)[-1] if "." in field_b else field_b
        target_alias = target_col.replace(".", "_")

        if "CASE" in sql:
            case_sql = re.sub(r'\s*END\s+AS\s+\S+', '\nEND', sql).strip()
            comma = "," if i < len(transforms) - 1 else ""
            lines.append(f"  {case_sql} AS {target_alias}{comma}  -- {concept}")
        else:
            source_col = field_a.split(".")[-1]
            comma = "," if i < len(transforms) - 1 else ""
            lines.append(f"  {source_col} AS {target_alias}{comma}  -- {concept} (direct mapping)")

    lines.append(f"FROM {{{{ ref('{source_db.lower()}') }}}}")
    return "\n".join(lines)


def _export_pandas(transforms: list, source_db: str, target_db: str) -> str:
    """Generate pandas mapping dictionary and apply code."""
    lines = [
        f"# pandas transform: {source_db} -> {target_db}",
        f"# Generated by nomenclador-explorer",
        "",
        "import pandas as pd",
        "",
        "mappings = {}",
        "case_mappings = {}",
        "",
    ]
    for t in transforms:
        concept = t.get("concept", "")
        field_a = t.get("field_a", "")
        field_b = t.get("field_b", "")
        sql = t.get("sql", "")
        source_col = field_a.split(".")[-1]
        target_col = field_b.split(".")[-1]

        if "CASE" in sql:
            lines.append(f"# {concept} — CASE WHEN transform")
            lines.append(f"case_mappings['{source_col}'] = '{target_col}'")
            lines.append(f"# {sql}")
            lines.append("")
        else:
            lines.append(f"# {concept} — direct mapping")
            lines.append(f"mappings['{source_col}'] = '{target_col}'")
            lines.append("")

    lines.append("def apply_transforms(df):")
    lines.append("    # Direct mappings")
    lines.append("    df = df.rename(columns=mappings)")
    lines.append("    return df")
    return "\n".join(lines)


def _export_pyspark(transforms: list, source_db: str, target_db: str) -> str:
    """Generate PySpark with CASE WHEN using F.when()."""
    lines = [
        f"# PySpark transform: {source_db} -> {target_db}",
        f"# Generated by nomenclador-explorer",
        "",
        "from pyspark.sql import functions as F",
        "",
        "def apply_transforms(df):",
    ]
    for t in transforms:
        concept = t.get("concept", "")
        field_a = t.get("field_a", "")
        field_b = t.get("field_b", "")
        sql = t.get("sql", "")
        source_col = field_a.split(".")[-1]
        target_col = field_b.split(".")[-1]
        classifier = t.get("json_schema", {}).get("x-nomenclador", {})
        standard = t.get("standard", "")

        if "CASE" in sql:
            lines.append(f"    # {concept} — {standard}")
            lines.append(f"    df = df.withColumn('{target_col}', F.col('{source_col}'))")
            lines.append("")
        else:
            lines.append(f"    # {concept} — direct mapping ({standard})")
            lines.append(f"    df = df.withColumnRenamed('{source_col}', '{target_col}')")
            lines.append("")

    return "\n".join(lines)


@router.post("/export-transform")
async def export_transform(req: ExportTransformRequest):
    """Export transforms in multiple formats: tableau, dbt, pandas, pyspark."""
    agent = _get_agent()
    result = agent.get_transform(req.source_db, req.target_db)

    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=503, detail=result["error"])

    transforms = result.get("transforms", [])
    fmt = req.format.lower().strip()

    exporters = {
        "tableau": lambda: _export_tableau(transforms),
        "dbt": lambda: _export_dbt(transforms, req.source_db, req.target_db),
        "pandas": lambda: _export_pandas(transforms, req.source_db, req.target_db),
        "pyspark": lambda: _export_pyspark(transforms, req.source_db, req.target_db),
    }

    if fmt not in exporters:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown format: {fmt}. Supported: {', '.join(exporters.keys())}"
        )

    code = exporters[fmt]()
    return {
        "format": fmt,
        "source_db": req.source_db,
        "target_db": req.target_db,
        "concept_count": len(transforms),
        "code": code,
        "warnings": [w for t in transforms for w in t.get("warnings", [])],
    }


# ---------------------------------------------------------------------------
# DDI 3.2 Export — Data Documentation Initiative
# ---------------------------------------------------------------------------

from xml.sax.saxutils import escape as _xml_escape


def _ddi_codebook(concepts: list, sources: dict) -> str:
    """Generate DDI 3.2 XML codebook from nomenclador concepts."""
    import datetime
    now = datetime.datetime.now().strftime("%Y-%m-%d")

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ddi:DDIInstance xmlns:ddi="ddi:instance:3_2"',
        '  xmlns:r="ddi:reusable:3_2"',
        '  xmlns:l="ddi:logicalproduct:3_2"',
        '  xmlns:s="ddi:studyunit:3_2"',
        '  xmlns:dc="ddi:datacollection:3_2"',
        '  xmlns:pr="ddi:physicaldataproduct:3_2"',
        f'  versionDate="{now}">',
        '  <s:StudyUnit id="nomenclador-py">',
        '    <r:Title>',
        '      <r:String xml:lang="es">Nomenclador de Indicadores Socioeconomicos</r:String>',
        '    </r:Title>',
        '    <r:Abstract>',
        '      <r:Content xml:lang="es">Catálogo de conceptos, clasificadores y fuentes de datos para gobernanza semántica.</r:Content>',
        '    </r:Abstract>',
    ]

    for c in concepts:
        if c.get("review_status") == "deprecated":
            continue
        name = _xml_escape(c.get("name", ""))
        definition = _xml_escape(c.get("definition", ""))
        standard = _xml_escape(c.get("standard", ""))
        population = _xml_escape(c.get("population", ""))
        capture = _xml_escape(c.get("capture_method", ""))
        custodian = _xml_escape(c.get("custodian", ""))
        dept = _xml_escape(c.get("custodian_department", ""))
        normative = _xml_escape(c.get("normative", ""))
        classification = _xml_escape(c.get("data_classification", ""))
        version = _xml_escape(c.get("version", ""))

        cid = name.replace(" ", "_").lower()

        lines.append(f'    <l:Variable id="var-{cid}">')
        lines.append(f'      <r:Name><r:String xml:lang="es">{name}</r:String></r:Name>')
        lines.append(f'      <r:Label><r:Content xml:lang="es">{name}</r:Content></r:Label>')
        if definition and definition != "-":
            lines.append(f'      <r:Description><r:Content xml:lang="es">{definition}</r:Content></r:Description>')

        if standard:
            lines.append(f'      <r:Classification>')
            lines.append(f'        <r:ClassificationType>standard</r:ClassificationType>')
            lines.append(f'        <r:String xml:lang="es">{standard}</r:String>')
            if version:
                lines.append(f'        <r:Version>{version}</r:Version>')
            lines.append(f'      </r:Classification>')

        classifier = c.get("classifier")
        if classifier and classifier.get("values"):
            lines.append(f'      <l:Representation>')
            lines.append(f'        <r:CodeList>')
            lines.append(f'          <r:Name><r:String xml:lang="es">{_xml_escape(classifier.get("name", standard))}</r:String></r:Name>')
            for code, label in classifier["values"].items():
                lines.append(f'          <r:Code>')
                lines.append(f'            <r:Value>{_xml_escape(str(code))}</r:Value>')
                lines.append(f'            <r:Label><r:Content xml:lang="es">{_xml_escape(str(label))}</r:Content></r:Label>')
                lines.append(f'          </r:Code>')
            lines.append(f'        </r:CodeList>')
            lines.append(f'      </l:Representation>')

        if population:
            lines.append(f'      <r:UniverseReference>')
            lines.append(f'        <r:Description><r:Content xml:lang="es">{population}</r:Content></r:Description>')
            lines.append(f'      </r:UniverseReference>')

        if capture:
            lines.append(f'      <dc:QuestionItem id="qi-{cid}">')
            lines.append(f'        <dc:QuestionText><r:Content xml:lang="es">Captura: {capture}</r:Content></dc:QuestionText>')
            lines.append(f'      </dc:QuestionItem>')

        if normative:
            lines.append(f'      <r:CoverageStatement>')
            lines.append(f'        <r:Description><r:Content xml:lang="es">{normative}</r:Content></r:Description>')
            lines.append(f'      </r:CoverageStatement>')

        if custodian:
            lines.append(f'      <r:Source citation="custodian">')
            lines.append(f'        <r:SourceCitation>')
            lines.append(f'          <r:Title><r:String xml:lang="es">{custodian}</r:String></r:Title>')
            if dept:
                lines.append(f'          <r:Publisher><r:String xml:lang="es">{dept}</r:String></r:Publisher>')
            lines.append(f'        </r:SourceCitation>')
            lines.append(f'      </r:Source>')

        if classification:
            lines.append(f'      <r:Confidentiality>')
            lines.append(f'        <r:Level>{classification}</r:Level>')
            lines.append(f'      </r:Confidentiality>')

        for field in c.get("fields", []):
            src = _xml_escape(field.get("source", ""))
            col = _xml_escape(field.get("column", ""))
            dtype = _xml_escape(field.get("data_type", ""))
            quality = field.get("quality_score", 0)
            completeness = field.get("completeness", 0)
            confidence = _xml_escape(field.get("confidence", ""))

            lines.append(f'      <l:DataElement id="de-{cid}-{src}">')
            lines.append(f'        <r:Name><r:String xml:lang="es">{src}.{col}</r:String></r:Name>')
            lines.append(f'        <l:PhysicalRepresentation>')
            lines.append(f'          <r:Format>{dtype}</r:Format>')
            lines.append(f'        </l:PhysicalRepresentation>')
            lines.append(f'        <r:QualityStatement>')
            lines.append(f'          <r:QualityIndicator>quality_score={quality}</r:QualityIndicator>')
            lines.append(f'          <r:QualityIndicator>completeness={completeness}</r:QualityIndicator>')
            lines.append(f'          <r:QualityIndicator>confidence={confidence}</r:QualityIndicator>')
            lines.append(f'        </r:QualityStatement>')
            lines.append(f'      </l:DataElement>')

        lines.append(f'    </l:Variable>')

    lines.append('  </s:StudyUnit>')
    lines.append('</ddi:DDIInstance>')
    return "\n".join(lines)


@router.get("/export-ddi")
async def export_ddi():
    """Export the full nomenclador as DDI 3.2 XML."""
    agent = _get_agent()
    concepts_data = agent.list_concepts()
    if isinstance(concepts_data, dict) and "error" in concepts_data:
        raise HTTPException(status_code=503, detail=concepts_data["error"])

    concepts = concepts_data.get("concepts", [])

    for c in concepts:
        detail = agent.get_concept(c["name"])
        if isinstance(detail, dict) and "error" not in detail:
            c["classifier"] = detail.get("classifier")
            c["fields"] = detail.get("fields", [])
            c["normative"] = detail.get("normative", "")
            c["custodian"] = detail.get("custodian", "")
            c["custodian_department"] = detail.get("custodian_department", "")
            c["capture_method"] = detail.get("capture_method", "")
            c["population"] = detail.get("population", "")
            c["version"] = detail.get("version", "")
            c["data_classification"] = detail.get("data_classification", "")

    xml = _ddi_codebook(concepts, {})

    return {
        "format": "ddi-3.2",
        "concept_count": len(concepts),
        "xml": xml,
    }


# ---------------------------------------------------------------------------
# Version diff — compare two nomenclador snapshots
# ---------------------------------------------------------------------------

class DiffRequest(BaseModel):
    current_path: str
    previous_path: str


def _load_graph_snapshot(path: str) -> dict:
    """Load a nomenclador JSON file and return a normalized dict of concepts."""
    import json as _json
    with open(path, "r", encoding="utf-8") as f:
        data = _json.load(f)

    concepts = {}
    for node in data.get("nodes", []):
        if node.get("type") == "concept":
            name = node.get("name", node.get("label", node.get("id", "")))
            concepts[name] = {
                "name": name,
                "_id": node.get("id", ""),
                "standard": node.get("standard", ""),
                "definition": node.get("definition", ""),
                "population": node.get("population", ""),
                "capture_method": node.get("capture_method", ""),
                "version": node.get("version", ""),
                "custodian": node.get("custodian", ""),
                "review_status": node.get("review_status", ""),
                "deprecated_at": node.get("deprecated_at", ""),
                "fields": [],
            }

    for edge in data.get("edges", []):
        if edge.get("type") == "tiene_campo":
            source_id = edge.get("source", "")
            field_data = edge.get("data", {})
            for name, concept in concepts.items():
                if source_id == concept.get("_id", ""):
                    concept["fields"].append({
                        "source": field_data.get("source", ""),
                        "column": field_data.get("column", ""),
                        "data_type": field_data.get("data_type", ""),
                    })

    return concepts


@router.post("/diff")
async def diff_versions(req: DiffRequest):
    """Compare two nomenclador JSON snapshots and report changes."""
    import os as _os

    if not _os.path.isfile(req.current_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.current_path}")
    if not _os.path.isfile(req.previous_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.previous_path}")

    current = _load_graph_snapshot(req.current_path)
    previous = _load_graph_snapshot(req.previous_path)

    current_names = set(current.keys())
    previous_names = set(previous.keys())

    added = sorted(current_names - previous_names)
    removed = sorted(previous_names - current_names)
    common = sorted(current_names & previous_names)

    changed = []
    for name in common:
        c = current[name]
        p = previous[name]
        diffs = []

        for field in ["standard", "definition", "population", "capture_method", "version", "custodian", "review_status"]:
            old_val = p.get(field, "")
            new_val = c.get(field, "")
            if old_val != new_val:
                diffs.append({
                    "field": field,
                    "old": old_val,
                    "new": new_val,
                })

        if p.get("deprecated_at") != c.get("deprecated_at") and c.get("deprecated_at"):
            diffs.append({
                "field": "deprecated_at",
                "old": p.get("deprecated_at", ""),
                "new": c.get("deprecated_at", ""),
            })

        old_fields = {(f["source"], f["column"]) for f in p.get("fields", [])}
        new_fields = {(f["source"], f["column"]) for f in c.get("fields", [])}

        fields_added = sorted(new_fields - old_fields)
        fields_removed = sorted(old_fields - new_fields)

        if fields_added:
            diffs.append({
                "field": "fields_added",
                "old": "",
                "new": ", ".join(f"{s}.{c}" for s, c in fields_added),
            })
        if fields_removed:
            diffs.append({
                "field": "fields_removed",
                "old": ", ".join(f"{s}.{c}" for s, c in fields_removed),
                "new": "",
            })

        if diffs:
            changed.append({
                "concept": name,
                "changes": diffs,
            })

    return {
        "summary": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "unchanged": len(common) - len(changed),
        },
        "added": added,
        "removed": removed,
        "changed": changed,
    }


# ---------------------------------------------------------------------------
# Open Data exporters — Frictionless Data Package + CKAN
# ---------------------------------------------------------------------------

def _build_concept_catalog(agent) -> list:
    """Fetch all concepts with full detail (classifier, fields, sources)."""
    concepts_data = agent.list_concepts()
    if isinstance(concepts_data, dict) and "error" in concepts_data:
        return []

    concepts = concepts_data.get("concepts", [])
    for c in concepts:
        detail = agent.get_concept(c["name"])
        if isinstance(detail, dict) and "error" not in detail:
            c["classifier"] = detail.get("classifier")
            c["fields"] = detail.get("fields", [])
            c["normative"] = detail.get("normative", "")
            c["custodian"] = detail.get("custodian", "")
            c["custodian_department"] = detail.get("custodian_department", "")
            c["capture_method"] = detail.get("capture_method", "")
            c["population"] = detail.get("population", "")
            c["version"] = detail.get("version", "")
            c["data_classification"] = detail.get("data_classification", "")
    return concepts


def _frictionless_package(concepts: list) -> dict:
    """Generate Frictionless Data Package (v2) JSON from nomenclador concepts."""
    fields = []
    for c in concepts:
        if c.get("review_status") == "deprecated":
            continue

        classifier = c.get("classifier")
        constraints = {}
        if classifier and classifier.get("values"):
            constraints["enum"] = list(classifier["values"].keys())

        for field in c.get("fields", []):
            f = {
                "name": field.get("column", ""),
                "type": _map_frictionless_type(field.get("data_type", "")),
                "title": c.get("name", ""),
                "description": c.get("definition", ""),
                "rdfType": c.get("standard", ""),
                "constraints": constraints,
                "source": field.get("source", ""),
            }
            if c.get("capture_method"):
                f["notes"] = f"Captura: {c['capture_method']}"
            fields.append(f)

    return {
        "name": "nomenclador-indicadores-socioeconomicos",
        "title": "Nomenclador de Indicadores Socioeconomicos",
        "description": "Catalogo de conceptos, clasificadores y fuentes de datos para gobernanza semantica.",
        "version": "1.0.0",
        "licenses": [{"name": "publico", "path": "https://creativecommons.org/publicdomain/zero/1.0/"}],
        "sources": _collect_sources(concepts),
        "schema": {
            "fields": fields,
            "missingValues": ["", "NA", "N/A", "null"],
        },
        "keywords": ["nomenclador", "indicadores", "socioeconomicos", "gobernanza", "semantica"],
    }


def _map_frictionless_type(dtype: str) -> str:
    """Map SQL/data types to Frictionless field types."""
    mapping = {
        "INT": "integer",
        "INTEGER": "integer",
        "FLOAT": "number",
        "DOUBLE": "number",
        "TEXT": "string",
        "VARCHAR": "string",
        "DATE": "date",
        "DATETIME": "datetime",
        "BOOLEAN": "boolean",
    }
    return mapping.get(dtype.upper(), "string")


def _collect_sources(concepts: list) -> list:
    """Extract unique sources from all concept fields."""
    seen = set()
    sources = []
    for c in concepts:
        for field in c.get("fields", []):
            src = field.get("source", "")
            if src and src not in seen:
                seen.add(src)
                sources.append({"title": src, "name": src.lower().replace(" ", "_")})
    return sources


def _ckan_package(concepts: list) -> dict:
    """Generate CKAN package schema JSON from nomenclador concepts."""
    tags = []
    for c in concepts:
        if c.get("standard"):
            tag = c["standard"].replace(" ", "_").lower()
            if tag not in tags:
                tags.append(tag)

    extras = []
    for c in concepts:
        if c.get("review_status") == "deprecated":
            continue
        classifier = c.get("classifier")
        if classifier and classifier.get("values"):
            extras.append({
                "key": f"classifier_{c['name'].replace(' ', '_').lower()}",
                "value": ", ".join(f"{k}={v}" for k, v in classifier["values"].items()),
            })

    resources = []
    for c in concepts:
        if c.get("review_status") == "deprecated":
            continue
        for field in c.get("fields", []):
            resources.append({
                "id": f"{c['name'].replace(' ', '_').lower()}_{field.get('source', '').lower()}",
                "name": f"{c['name']} - {field.get('source', '')}",
                "field": field.get("column", ""),
                "type": _map_frictionless_type(field.get("data_type", "")),
                "concept": c.get("name", ""),
                "standard": c.get("standard", ""),
                "definition": c.get("definition", ""),
                "capture_method": c.get("capture_method", ""),
                "population": c.get("population", ""),
                "custodian": c.get("custodian", ""),
                "quality_score": field.get("quality_score", 0),
                "completeness": field.get("completeness", 0),
                "confidence": field.get("confidence", ""),
            })

    return {
        "name": "nomenclador-indicadores-socioeconomicos",
        "title": "Nomenclador de Indicadores Socioeconomicos",
        "notes": "Catalogo de conceptos, clasificadores y fuentes de datos para gobernanza semantica. Incluye estandares (ISO 5218, ISCO-08, ISCED, ISIC Rev.4, ICD-11), clasificadores con valores canonicos, metodos de captura, custodios y metricas de calidad por fuente.",
        "owner_org": "ine",
        "license_id": "cc-zero",
        "tags": [{"name": t} for t in tags[:20]],
        "extras": extras[:50],
        "resources": resources,
        "groups": [{"name": "sociedad"}],
        "type": "dataset",
        "state": "active",
        "private": False,
    }


@router.get("/export-opendata/{format}")
async def export_opendata(format: str):
    """Export nomenclador as Frictionless Data Package or CKAN package schema."""
    agent = _get_agent()
    concepts = _build_concept_catalog(agent)

    if not concepts:
        raise HTTPException(status_code=503, detail="No se pudo cargar el catalogo de conceptos.")

    fmt = format.lower().strip()

    if fmt == "frictionless":
        package = _frictionless_package(concepts)
        return {
            "format": "frictionless-data-package-v2",
            "concept_count": len([c for c in concepts if c.get("review_status") != "deprecated"]),
            "field_count": len(package["schema"]["fields"]),
            "data": package,
        }

    elif fmt == "ckan":
        package = _ckan_package(concepts)
        return {
            "format": "ckan-package-schema",
            "concept_count": len([c for c in concepts if c.get("review_status") != "deprecated"]),
            "resource_count": len(package["resources"]),
            "data": package,
        }

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown format: {fmt}. Supported: frictionless, ckan"
        )
