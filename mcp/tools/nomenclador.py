"""
Nomenclador tools — concept lookup, interoperability, transforms, classifiers.

Object-Oriented Agent design: NomencladorAgent encapsulates the graph
and exposes tool methods. The MCP server delegates to these methods,
keeping state and logic in one cohesive unit.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any, Optional

from mcp.schemas import (
    NOMENCLADOR_LIST_CONCEPTS,
    NOMENCLADOR_SEARCH_VARIABLE,
    NOMENCLADOR_GET_CONCEPT,
    NOMENCLADOR_CHECK_INTEROP,
    NOMENCLADOR_GET_TRANSFORM,
    NOMENCLADOR_VALIDATE_FIELD,
    NOMENCLADOR_GET_CLASSIFIER,
)

log = logging.getLogger("mcp.tools.nomenclador")


class NomencladorAgent:
    """Agent that wraps a nomenclador knowledge graph and exposes
    semantic operations as tool methods.

    The graph is stored as a NetworkX DiGraph (node-link JSON format).
    This agent is agnostic to the source project — it only requires
    the graph to follow the nomenclador schema (concept, field, classifier,
    source node types with implementa/proviene_de/usa_clasificador edges).
    """

    def __init__(self) -> None:
        self._graph: Any = None
        self._lock = threading.RLock()
        self._path: Optional[str] = None
        self._indices_built = False
        self._concepts_by_name: dict[str, str] = {}
        self._fields_by_concept: dict[str, list[dict]] = {}
        self._classifier_by_concept: dict[str, Optional[dict]] = {}
        self._all_classifiers: dict[str, dict] = {}
        self._fields_by_source_db: dict[str, list[dict]] = {}
        self._concepts_by_field: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Graph management
    # ------------------------------------------------------------------

    def load_graph(self, path: str) -> None:
        """Load a nomenclador.json (NetworkX node-link format) into memory."""
        with self._lock:
            import networkx as nx
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._graph = nx.node_link_graph(data, directed=True, edges="links")
            self._path = path
            self._indices_built = False
            self._build_indices()
            log.info(
                "Nomenclador graph loaded: %d nodes, %d edges",
                self._graph.number_of_nodes(),
                self._graph.number_of_edges(),
            )

    def get_graph(self) -> Any:
        """Return the current graph, loading from SEMANTICA_KG_PATH if needed."""
        if self._graph is None:
            import os
            kg_path = os.environ.get("SEMANTICA_KG_PATH", "").strip()
            if kg_path:
                self.load_graph(kg_path)
            else:
                import networkx as nx
                self._graph = nx.DiGraph()
        return self._graph

    def reset(self) -> None:
        with self._lock:
            self._graph = None
            self._path = None
            self._indices_built = False
            self._concepts_by_name.clear()
            self._fields_by_concept.clear()
            self._classifier_by_concept.clear()
            self._all_classifiers.clear()
            self._fields_by_source_db.clear()
            self._concepts_by_field.clear()

    def save_graph(self, path: str | None = None) -> None:
        """Persist the in-memory graph back to disk in node-link format."""
        with self._lock:
            import networkx as nx
            if self._graph is None:
                return
            dest = path or self._path
            if not dest:
                return
            data = nx.node_link_data(self._graph, edges="links")
            with open(dest, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            log.info("Nomenclador graph saved to %s", dest)

    def update_review(
        self,
        node_id: str,
        review_status: str,
        review_notes: str = "",
        reviewed_by: str = "",
    ) -> dict:
        """Update review_status and notes on a node, persist to disk, return updated data.
        Each review action is appended to a review_history log on the node."""
        from datetime import datetime, timezone
        with self._lock:
            g = self.get_graph()
            if g is None or node_id not in g:
                return {"error": f"Node '{node_id}' not found"}
            data = g.nodes[node_id]
            now = datetime.now(timezone.utc).isoformat()
            data["review_status"] = review_status
            data["reviewed_by"] = reviewed_by
            data["reviewed_at"] = now
            if review_notes:
                existing = data.get("review_notes", "")
                if existing:
                    data["review_notes"] = existing + "\n---\n" + review_notes
                else:
                    data["review_notes"] = review_notes
            # Append to history log
            history = data.get("review_history", [])
            history.append({
                "timestamp": now,
                "status": review_status,
                "notes": review_notes,
                "reviewed_by": reviewed_by,
            })
            data["review_history"] = history
            # Handle deprecation
            if review_status == "deprecated":
                data["deprecated_at"] = now
            # Persist
            self.save_graph()
            return {"id": node_id, "review_status": review_status,
                    "reviewed_by": data["reviewed_by"], "reviewed_at": data["reviewed_at"],
                    "review_notes": data.get("review_notes", ""),
                    "review_history": history}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_indices(self) -> None:
        """Build lookup indices lazily if not yet built."""
        if not self._indices_built:
            self._build_indices()

    def _build_indices(self) -> None:
        """Build O(1) lookup indices from the graph nodes and edges."""
        g = self.get_graph()
        self._concepts_by_name.clear()
        self._fields_by_concept.clear()
        self._classifier_by_concept.clear()
        self._all_classifiers.clear()
        self._fields_by_source_db.clear()
        self._concepts_by_field.clear()

        for node_id, data in g.nodes(data=True):
            node_type = data.get("type")
            if node_type == "concept":
                name_lower = str(data.get("name", "")).lower()
                if name_lower:
                    self._concepts_by_name[name_lower] = node_id
            elif node_type == "classifier":
                std = data.get("standard", data.get("name", node_id))
                self._all_classifiers[std] = {"id": node_id, **data}
            elif node_type == "field":
                src = data.get("source_db", "")
                if src:
                    self._fields_by_source_db.setdefault(src, []).append({"id": node_id, **data})

        for source, target, edge_data in g.edges(data=True):
            edge_type = edge_data.get("type")
            if edge_type == "implementa":
                field_data = g.nodes[source]
                self._fields_by_concept.setdefault(target, []).append({"id": source, **field_data})
                self._concepts_by_field[source] = target
            elif edge_type == "usa_clasificador":
                classifier_data = g.nodes[target]
                self._classifier_by_concept[source] = {"id": target, **classifier_data}

        self._indices_built = True

    def _find_concept_by_name(self, name: str) -> Optional[dict]:
        """Find a concept node by name (case-insensitive)."""
        self._ensure_indices()
        node_id = self._concepts_by_name.get(name.lower())
        if node_id is None:
            return None
        g = self.get_graph()
        data = g.nodes[node_id]
        return {"id": node_id, **data}

    def _find_fields_of_concept(self, concept_id: str) -> list[dict]:
        """Find all field nodes that implement a concept."""
        self._ensure_indices()
        return list(self._fields_by_concept.get(concept_id, []))

    def _find_classifier_of_concept(self, concept_id: str) -> Optional[dict]:
        """Find the classifier linked to a concept via usa_clasificador."""
        self._ensure_indices()
        return self._classifier_by_concept.get(concept_id)

    def _find_all_classifiers(self) -> dict[str, dict]:
        """Return all classifier nodes keyed by standard id."""
        self._ensure_indices()
        return dict(self._all_classifiers)

    def _find_interoperability_paths(self, source_db: str, target_db: str) -> list[dict]:
        """Find all concept paths connecting two sources."""
        self._ensure_indices()

        source_fields = list(self._fields_by_source_db.get(source_db, []))
        target_fields = list(self._fields_by_source_db.get(target_db, []))

        if not source_fields or not target_fields:
            return []

        # Map fields to concepts via the reverse index
        source_concepts: dict[str, list[dict]] = {}
        for field in source_fields:
            concept_id = self._concepts_by_field.get(field["id"])
            if concept_id:
                source_concepts.setdefault(concept_id, []).append(field)

        target_concepts: dict[str, list[dict]] = {}
        for field in target_fields:
            concept_id = self._concepts_by_field.get(field["id"])
            if concept_id:
                target_concepts.setdefault(concept_id, []).append(field)

        # Find shared concepts
        results = []
        shared = set(source_concepts.keys()) & set(target_concepts.keys())
        for concept_id in shared:
            concept_data = self.get_graph().nodes[concept_id]
            classifier = self._find_classifier_of_concept(concept_id)
            for field_a in source_concepts[concept_id]:
                for field_b in target_concepts[concept_id]:
                    results.append({
                        "field_a": field_a,
                        "field_b": field_b,
                        "concept": {"id": concept_id, **concept_data},
                        "classifier": classifier,
                    })
        return results

    def _validate_interoperability(
        self, field_a: dict, field_b: dict, concept: dict, classifier: Optional[dict]
    ) -> dict:
        """Run guardrail checkpoints between two fields."""
        checkpoints = []

        # Checkpoint 1: Population
        pop_a = concept.get("population", "") or field_a.get("population", "")
        pop_b = concept.get("population", "") or field_b.get("population", "")
        if pop_a and pop_b and pop_a != pop_b:
            checkpoints.append({
                "name": "Poblacion objetivo",
                "status": "mismatch",
                "detail": f"Asimetria: '{pop_a}' vs '{pop_b}'",
                "field_a_value": pop_a,
                "field_b_value": pop_b,
            })
        elif pop_a and pop_b and pop_a == pop_b:
            checkpoints.append({
                "name": "Poblacion objetivo",
                "status": "match",
                "detail": f"Ambas: '{pop_a}'",
                "field_a_value": pop_a,
                "field_b_value": pop_b,
            })
        else:
            checkpoints.append({
                "name": "Poblacion objetivo",
                "status": "unknown",
                "detail": "Sin informacion de poblacion",
                "field_a_value": pop_a or "(no definida)",
                "field_b_value": pop_b or "(no definida)",
            })

        # Checkpoint 2: Capture method
        cap_a = field_a.get("capture_method", "")
        cap_b = field_b.get("capture_method", "")
        if cap_a and cap_b and cap_a != cap_b:
            checkpoints.append({
                "name": "Metodologia de captura",
                "status": "mismatch",
                "detail": f"Asimetria: '{cap_a}' vs '{cap_b}'",
                "field_a_value": cap_a,
                "field_b_value": cap_b,
            })
        elif cap_a and cap_b and cap_a == cap_b:
            checkpoints.append({
                "name": "Metodologia de captura",
                "status": "match",
                "detail": f"Ambas usan: '{cap_a}'",
                "field_a_value": cap_a,
                "field_b_value": cap_b,
            })
        else:
            checkpoints.append({
                "name": "Metodologia de captura",
                "status": "unknown",
                "detail": "Sin informacion de metodo de captura",
                "field_a_value": cap_a or "(no definida)",
                "field_b_value": cap_b or "(no definida)",
            })

        # Checkpoint 3: Classifier
        if classifier:
            std = classifier.get("standard", classifier.get("name", "-"))
            checkpoints.append({
                "name": "Clasificador activo",
                "status": "match",
                "detail": f"Ambas usan: {std}",
                "field_a_value": std,
                "field_b_value": std,
            })
        else:
            checkpoints.append({
                "name": "Clasificador activo",
                "status": "unknown",
                "detail": "Ninguna fuente tiene clasificador definido",
                "field_a_value": "(no definido)",
                "field_b_value": "(no definido)",
            })

        # Checkpoint 4: Data distribution
        uniq_a = field_a.get("unique_count", 0)
        uniq_b = field_b.get("unique_count", 0)
        if uniq_a and uniq_b:
            ratio = min(uniq_a, uniq_b) / max(uniq_a, uniq_b) if max(uniq_a, uniq_b) > 0 else 0
            if ratio < 0.5:
                checkpoints.append({
                    "name": "Distribucion de datos",
                    "status": "mismatch",
                    "detail": f"Cardinalidad discrepante: {uniq_a} vs {uniq_b} unicos (ratio {ratio:.0%})",
                    "field_a_value": f"uniq={uniq_a}",
                    "field_b_value": f"uniq={uniq_b}",
                })
            else:
                checkpoints.append({
                    "name": "Distribucion de datos",
                    "status": "match",
                    "detail": f"Distribuciones compatibles (cardinalidad: {uniq_a}/{uniq_b})",
                    "field_a_value": f"uniq={uniq_a}",
                    "field_b_value": f"uniq={uniq_b}",
                })
        else:
            checkpoints.append({
                "name": "Distribucion de datos",
                "status": "unknown",
                "detail": "Sin metricas de cardinalidad",
                "field_a_value": f"uniq={uniq_a or '?'}",
                "field_b_value": f"uniq={uniq_b or '?'}",
            })

        # Recommendation
        mismatches = sum(1 for c in checkpoints if c["status"] == "mismatch")
        if mismatches == 0:
            recommendation = "INTEROPERABILIDAD RECOMENDADA"
        elif mismatches == 1:
            recommendation = "INTEROPERABILIDAD CONDICIONADA — revisar warnings"
        else:
            recommendation = "INTEROPERABILIDAD NO RECOMENDADA — multiples asimetrias semanticas"

        warnings = []
        for cp in checkpoints:
            if cp["status"] == "mismatch":
                warnings.append(f"Asimetria Semantica — {cp['name']}: {cp['detail']}")
            elif cp["status"] == "unknown":
                warnings.append(f"Informacion Incompleta — {cp['name']}: {cp['detail']}")

        return {
            "checkpoints": checkpoints,
            "recommendation": recommendation,
            "warnings": warnings,
        }

    def _generate_transform(
        self, field_a: dict, field_b: dict, concept: dict, classifier: Optional[dict], validation: dict
    ) -> dict:
        """Generate SQL CASE WHEN + JSON Schema for a field mapping."""
        std = concept.get("standard", "")
        col_a = field_a.get("column", field_a.get("name", ""))
        col_b = field_b.get("column", field_b.get("name", ""))

        if classifier and classifier.get("values"):
            values = classifier["values"]
            # Check if both fields already use canonical codes
            samples_a = set(str(v).strip().upper() for v in field_a.get("sample_values", []) if v)
            samples_b = set(str(v).strip().upper() for v in field_b.get("sample_values", []) if v)
            canonical_codes = set(str(k).upper() for k in values.keys())

            if samples_a.issubset(canonical_codes) and samples_b.issubset(canonical_codes):
                sql = f"-- Ambas fuentes ya usan codigos canonicos de {std}. Mapeo directo: {col_a} = {col_b}"
            else:
                case_lines = [f"CASE"]
                for code, label in values.items():
                    case_lines.append(f"  WHEN {col_a} = '{code}' THEN '{code}'  -- {label}")
                case_lines.append(f"  ELSE NULL  -- valor no canonico")
                case_lines.append(f"END AS {col_b}")
                sql = "\n".join(case_lines)
        else:
            sql = f"-- Ambas fuentes ya usan codigos canonicos de {std or 'sin estandar'}. Mapeo directo: {col_a} = {col_b}"

        json_schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": concept.get("name", ""),
            "description": concept.get("definition", ""),
            "type": "string",
            "x-nomenclador": {
                "standard": std or "",
                "version": concept.get("version", "1.0"),
                "population": concept.get("population", ""),
                "capture_method": concept.get("capture_method", ""),
                "data_classification": concept.get("data_classification", "publico"),
            },
        }

        return {
            "concept_name": concept.get("name", ""),
            "standard": std or "",
            "sql_transform": sql,
            "json_schema": json_schema,
        }

    def _detect_standard(self, column_name: str, sample_values: list[str]) -> list[dict]:
        """Detect which standard a column might follow based on classifiers in the graph."""
        classifiers = self._find_all_classifiers()
        candidates = []
        col_lower = column_name.lower()

        for std_id, cls_data in classifiers.items():
            values = cls_data.get("values", {})
            if not values:
                continue

            canonical_codes = set(str(k).upper() for k in values.keys())
            samples_upper = set(str(v).strip().upper() for v in sample_values if v)

            # Check name hints
            name_match = col_lower in std_id.lower() or std_id.lower() in col_lower

            # Check value overlap
            overlap = len(samples_upper & canonical_codes)
            overlap_ratio = overlap / len(samples_upper) if samples_upper else 0

            if name_match or overlap_ratio > 0:
                reason_parts = []
                if name_match:
                    reason_parts.append(f"nombre de columna coincide con estandar")
                if overlap_ratio > 0:
                    reason_parts.append(f"{overlap}/{len(samples_upper)} valores coinciden con codigos canonicos")

                candidates.append({
                    "standard": std_id,
                    "name": cls_data.get("name", std_id),
                    "confidence": "high" if overlap_ratio > 0.5 or (name_match and overlap_ratio > 0) else "medium" if name_match or overlap_ratio > 0 else "low",
                    "reason": "; ".join(reason_parts),
                })

        return sorted(candidates, key=lambda c: {"high": 0, "medium": 1, "low": 2}.get(c["confidence"], 3))

    # ------------------------------------------------------------------
    # Tool methods (public API)
    # ------------------------------------------------------------------

    def list_concepts(self) -> dict:
        """List all canonical concepts in the nomenclador."""
        g = self.get_graph()
        concepts = []
        for node_id, data in g.nodes(data=True):
            if data.get("type") == "concept":
                fields = self._find_fields_of_concept(node_id)
                sources = sorted(set(f.get("source_db", "?") for f in fields))
                concepts.append({
                    "name": data.get("name", "?"),
                    "standard": data.get("standard") or None,
                    "definition": data.get("definition", "-") or "-",
                    "sources": sources or [],
                    "source_count": len(sources),
                    "review_status": data.get("review_status", "approved"),
                    "proposed_by": data.get("proposed_by", ""),
                    "data_classification": data.get("data_classification", "publico"),
                    "custodian": data.get("custodian", "") or "",
                })
        if not concepts:
            return {"error": "Nomenclador vacio o no cargado."}
        return {"concepts": concepts, "count": len(concepts)}

    def search_variable(self, name: str) -> dict:
        """Search for a variable by name in the nomenclador."""
        concept = self._find_concept_by_name(name)
        if not concept:
            return {"error": f"Variable '{name}' no encontrada en el nomenclador."}
        fields = self._find_fields_of_concept(concept["id"])
        return {
            "name": concept.get("name", ""),
            "standard": concept.get("standard") or None,
            "definition": concept.get("definition", "-") or "-",
            "population": concept.get("population", "-") or "-",
            "capture_method": concept.get("capture_method", "-") or "-",
            "fields": [
                {
                    "source_db": f.get("source_db", "?"),
                    "table": f.get("table", "?"),
                    "column": f.get("column", "?"),
                    "data_type": f.get("data_type", "?"),
                    "sample_values": f.get("sample_values", [])[:5],
                }
                for f in fields
            ],
        }

    def get_concept(self, name: str) -> dict:
        """Get full detail of a concept including its classifier."""
        concept = self._find_concept_by_name(name)
        if not concept:
            return {"error": f"Concepto '{name}' no encontrado."}
        classifier = self._find_classifier_of_concept(concept["id"])
        fields = self._find_fields_of_concept(concept["id"])
        result = {
            "name": concept.get("name", ""),
            "standard": concept.get("standard") or None,
            "definition": concept.get("definition", "-") or "-",
            "population": concept.get("population", "-") or "-",
            "capture_method": concept.get("capture_method", "-") or "-",
            "version": concept.get("version", "1.0"),
            "custodian": concept.get("custodian", "-") or "-",
            "custodian_department": concept.get("custodian_department", "-") or "-",
            "data_classification": concept.get("data_classification", "publico"),
            "normative": concept.get("normative", "-") or "-",
            "review_status": concept.get("review_status", "approved"),
            "proposed_by": concept.get("proposed_by", ""),
            "review_notes": concept.get("review_notes", ""),
            "reviewed_by": concept.get("reviewed_by", ""),
            "reviewed_at": concept.get("reviewed_at", ""),
            "review_history": concept.get("review_history", []),
            "deprecated_at": concept.get("deprecated_at", ""),
            "fields": [
                {
                    "source": f.get("source_db", "?"),
                    "column": f.get("column", f.get("name", "?")),
                    "data_type": f.get("data_type", "?"),
                    "confidence": f.get("confidence", "low"),
                    "data_classification": f.get("data_classification", "publico"),
                    "quality_score": f.get("quality_score", 0.0),
                    "review_status": f.get("review_status", "approved"),
                    "completeness": f.get("completeness", 0.0),
                    "uniqueness": f.get("uniqueness", 0.0),
                    "consistency": f.get("consistency", 0.0),
                    "validity": f.get("validity", 0.0),
                    "last_verified": f.get("last_verified", ""),
                }
                for f in fields
            ],
        }
        if classifier:
            result["classifier"] = {
                "name": classifier.get("name", ""),
                "standard": classifier.get("standard", ""),
                "values": classifier.get("values", {}),
            }
        return result

    def check_interoperability(self, source_db: str, target_db: str) -> dict:
        """Check interoperability between two sources with guardrail checkpoints."""
        results = self._find_interoperability_paths(source_db, target_db)
        if not results:
            return {"error": f"No se encontraron caminos entre {source_db} y {target_db}."}
        paths = []
        for r in results:
            validation = self._validate_interoperability(
                r["field_a"], r["field_b"], r["concept"], r.get("classifier")
            )
            paths.append({
                "concept": r["concept"].get("name", "?"),
                "field_a": {
                    "source_db": r["field_a"].get("source_db", ""),
                    "column": r["field_a"].get("column", ""),
                },
                "field_b": {
                    "source_db": r["field_b"].get("source_db", ""),
                    "column": r["field_b"].get("column", ""),
                },
                "checkpoints": validation["checkpoints"],
                "recommendation": validation["recommendation"],
                "warnings": validation["warnings"],
            })
        return {"source": source_db, "target": target_db, "paths": paths, "count": len(paths)}

    def get_transform(self, source_db: str, target_db: str) -> dict:
        """Generate SQL CASE WHEN + JSON Schema transforms between two sources."""
        results = self._find_interoperability_paths(source_db, target_db)
        if not results:
            return {"error": f"No se encontraron caminos entre {source_db} y {target_db}."}
        transforms = []
        for r in results:
            validation = self._validate_interoperability(
                r["field_a"], r["field_b"], r["concept"], r.get("classifier")
            )
            artifact = self._generate_transform(
                r["field_a"], r["field_b"], r["concept"], r.get("classifier"), validation
            )
            transforms.append({
                "concept": artifact["concept_name"],
                "standard": artifact["standard"],
                "field_a": f"{r['field_a'].get('source_db', '')}.{r['field_a'].get('column', '')}",
                "field_b": f"{r['field_b'].get('source_db', '')}.{r['field_b'].get('column', '')}",
                "sql": artifact["sql_transform"],
                "json_schema": artifact["json_schema"],
                "warnings": validation["warnings"],
            })
        return {"source": source_db, "target": target_db, "transforms": transforms}

    def validate_field(self, column_name: str, sample_values: list[str]) -> dict:
        """Validate if a field's values match a canonical standard."""
        candidates = self._detect_standard(column_name, sample_values)
        if not candidates:
            classifiers = self._find_all_classifiers()
            return {
                "error": f"No se detecto ningun estandar para '{column_name}'.",
                "available_standards": list(classifiers.keys()),
            }
        results = []
        for cand in candidates:
            classifiers = self._find_all_classifiers()
            cls = classifiers.get(cand["standard"], {})
            canonical_values = cls.get("values", {})
            canonical_codes = set(str(k).upper() for k in canonical_values.keys())
            samples_upper = set(str(v).strip().upper() for v in sample_values if v)
            non_canonical = samples_upper - canonical_codes
            results.append({
                "standard": cand["standard"],
                "name": cand["name"],
                "confidence": cand["confidence"],
                "reason": cand["reason"],
                "non_canonical_values": list(non_canonical) if non_canonical else [],
                "canonical_values": canonical_values,
                "is_valid": len(non_canonical) == 0,
            })
        return {"column": column_name, "sample_values": sample_values, "candidates": results}

    def get_classifier(self, standard_id: str) -> dict:
        """Get valid values of a classifier/standard from the graph."""
        classifiers = self._find_all_classifiers()
        cls = classifiers.get(standard_id)
        if not cls:
            return {
                "error": f"Estandar '{standard_id}' no encontrado.",
                "available": list(classifiers.keys()),
            }
        return {
            "standard": standard_id,
            "name": cls.get("name", standard_id),
            "domain": cls.get("domain", "-"),
            "values": cls.get("values", {}),
            "version": cls.get("version", "1.0"),
        }


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------

_agent: Optional[NomencladorAgent] = None
_agent_lock = threading.Lock()


def get_agent() -> NomencladorAgent:
    global _agent
    if _agent is None:
        with _agent_lock:
            if _agent is None:
                _agent = NomencladorAgent()
    return _agent


# ---------------------------------------------------------------------------
# MCP tool handlers (thin wrappers around agent methods)
# ---------------------------------------------------------------------------

def handle_list_concepts(args: dict) -> dict:
    return get_agent().list_concepts()


def handle_search_variable(args: dict) -> dict:
    name = args.get("name", "").strip()
    if not name:
        return {"error": "name is required"}
    return get_agent().search_variable(name)


def handle_get_concept(args: dict) -> dict:
    name = args.get("name", "").strip()
    if not name:
        return {"error": "name is required"}
    return get_agent().get_concept(name)


def handle_check_interoperability(args: dict) -> dict:
    source_db = args.get("source_db", "").strip()
    target_db = args.get("target_db", "").strip()
    if not source_db or not target_db:
        return {"error": "source_db and target_db are required"}
    return get_agent().check_interoperability(source_db, target_db)


def handle_get_transform(args: dict) -> dict:
    source_db = args.get("source_db", "").strip()
    target_db = args.get("target_db", "").strip()
    if not source_db or not target_db:
        return {"error": "source_db and target_db are required"}
    return get_agent().get_transform(source_db, target_db)


def handle_validate_field(args: dict) -> dict:
    column_name = args.get("column_name", "").strip()
    sample_values = args.get("sample_values", [])
    if not column_name:
        return {"error": "column_name is required"}
    return get_agent().validate_field(column_name, sample_values)


def handle_get_classifier(args: dict) -> dict:
    standard_id = args.get("standard_id", "").strip()
    if not standard_id:
        return {"error": "standard_id is required"}
    return get_agent().get_classifier(standard_id)


# ---------------------------------------------------------------------------
# Tool definitions for MCP registration
# ---------------------------------------------------------------------------

NOMENCLADOR_TOOLS = [
    {
        "name": "list_concepts",
        "description": "List all canonical concepts in the nomenclador with their standards, definitions, and sources.",
        "inputSchema": NOMENCLADOR_LIST_CONCEPTS,
        "_handler": handle_list_concepts,
    },
    {
        "name": "search_variable",
        "description": "Search for a variable by name in the nomenclador. Returns the canonical concept and all physical sources where it appears.",
        "inputSchema": NOMENCLADOR_SEARCH_VARIABLE,
        "_handler": handle_search_variable,
    },
    {
        "name": "get_concept",
        "description": "Get full detail of a canonical concept including classifier values, custodian, and normative backing.",
        "inputSchema": NOMENCLADOR_GET_CONCEPT,
        "_handler": handle_get_concept,
    },
    {
        "name": "check_interoperability",
        "description": "Check interoperability between two data sources with semantic guardrails (population, capture method, classifier, data distribution).",
        "inputSchema": NOMENCLADOR_CHECK_INTEROP,
        "_handler": handle_check_interoperability,
    },
    {
        "name": "get_transform",
        "description": "Generate SQL CASE WHEN + JSON Schema transformation artifacts to connect two data sources.",
        "inputSchema": NOMENCLADOR_GET_TRANSFORM,
        "_handler": handle_get_transform,
    },
    {
        "name": "validate_field",
        "description": "Validate if a field's sample values match a canonical standard from the nomenclador. Returns non-canonical values and valid ones.",
        "inputSchema": NOMENCLADOR_VALIDATE_FIELD,
        "_handler": handle_validate_field,
    },
    {
        "name": "get_classifier",
        "description": "Get the valid values of a classifier/standard from the nomenclador graph (e.g. ISO_5218 returns 0=desconocido, 1=masculino, etc).",
        "inputSchema": NOMENCLADOR_GET_CLASSIFIER,
        "_handler": handle_get_classifier,
    },
]
