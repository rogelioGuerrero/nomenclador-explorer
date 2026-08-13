"""
Basic tests for NomencladorAgent — graph loading, index building, and tool methods.
"""

import json
import os
import tempfile
import pytest

from mcp.tools.nomenclador import NomencladorAgent


def _make_test_graph() -> dict:
    """Build a minimal nomenclador graph in node-link format."""
    return {
        "nodes": [
            {"id": "c1", "type": "concept", "name": "Sexo", "standard": "ISO_5218",
             "definition": "Sexo biologico", "population": "Poblacion general"},
            {"id": "c2", "type": "concept", "name": "Edad", "standard": "ISO_8601",
             "definition": "Edad en anos"},
            {"id": "f1", "type": "field", "source_db": "DB_A", "table": "personas",
             "column": "sexo", "data_type": "TEXT", "sample_values": ["1", "2", "0"]},
            {"id": "f2", "type": "field", "source_db": "DB_B", "table": "censo",
             "column": "sex", "data_type": "CHAR", "sample_values": ["M", "F"]},
            {"id": "f3", "type": "field", "source_db": "DB_A", "table": "personas",
             "column": "edad", "data_type": "INT", "sample_values": ["25", "30"]},
            {"id": "cls1", "type": "classifier", "name": "ISO_5218",
             "standard": "ISO_5218", "domain": "demografia",
             "values": {"0": "Desconocido", "1": "Masculino", "2": "Femenino"}},
        ],
        "links": [
            {"source": "f1", "target": "c1", "type": "implementa"},
            {"source": "f2", "target": "c1", "type": "implementa"},
            {"source": "f3", "target": "c2", "type": "implementa"},
            {"source": "c1", "target": "cls1", "type": "usa_clasificador"},
        ],
    }


@pytest.fixture
def agent_with_graph():
    """Create a NomencladorAgent loaded with the test graph."""
    agent = NomencladorAgent()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(_make_test_graph(), f)
        path = f.name
    agent.load_graph(path)
    yield agent
    agent.reset()
    os.unlink(path)


class TestGraphLoading:
    def test_graph_loaded_with_correct_counts(self, agent_with_graph):
        g = agent_with_graph.get_graph()
        assert g.number_of_nodes() == 6
        assert g.number_of_edges() == 4

    def test_indices_built_after_load(self, agent_with_graph):
        assert agent_with_graph._indices_built is True
        assert "sexo" in agent_with_graph._concepts_by_name
        assert "edad" in agent_with_graph._concepts_by_name

    def test_reset_clears_indices(self, agent_with_graph):
        agent_with_graph.reset()
        assert agent_with_graph._indices_built is False
        assert len(agent_with_graph._concepts_by_name) == 0


class TestFindConceptByName:
    def test_find_existing_concept_case_insensitive(self, agent_with_graph):
        result = agent_with_graph._find_concept_by_name("SEXO")
        assert result is not None
        assert result["id"] == "c1"
        assert result["name"] == "Sexo"

    def test_find_nonexistent_concept_returns_none(self, agent_with_graph):
        assert agent_with_graph._find_concept_by_name("Inexistente") is None


class TestFindFieldsOfConcept:
    def test_find_fields_for_concept_with_multiple_sources(self, agent_with_graph):
        fields = agent_with_graph._find_fields_of_concept("c1")
        assert len(fields) == 2
        source_dbs = {f["source_db"] for f in fields}
        assert source_dbs == {"DB_A", "DB_B"}

    def test_find_fields_for_concept_with_no_fields(self, agent_with_graph):
        fields = agent_with_graph._find_fields_of_concept("nonexistent")
        assert fields == []


class TestFindClassifierOfConcept:
    def test_find_classifier_for_concept_with_classifier(self, agent_with_graph):
        cls = agent_with_graph._find_classifier_of_concept("c1")
        assert cls is not None
        assert cls["id"] == "cls1"
        assert cls["standard"] == "ISO_5218"

    def test_find_classifier_for_concept_without_classifier(self, agent_with_graph):
        assert agent_with_graph._find_classifier_of_concept("c2") is None


class TestFindAllClassifiers:
    def test_returns_all_classifiers(self, agent_with_graph):
        classifiers = agent_with_graph._find_all_classifiers()
        assert "ISO_5218" in classifiers
        assert classifiers["ISO_5218"]["values"]["1"] == "Masculino"


class TestListConcepts:
    def test_lists_all_concepts(self, agent_with_graph):
        result = agent_with_graph.list_concepts()
        assert "concepts" in result
        assert result["count"] == 2
        names = {c["name"] for c in result["concepts"]}
        assert names == {"Sexo", "Edad"}

    def test_empty_graph_returns_error(self):
        agent = NomencladorAgent()
        result = agent.list_concepts()
        assert "error" in result


class TestSearchVariable:
    def test_search_existing_variable(self, agent_with_graph):
        result = agent_with_graph.search_variable("Sexo")
        assert result["name"] == "Sexo"
        assert len(result["fields"]) == 2

    def test_search_nonexistent_variable(self, agent_with_graph):
        result = agent_with_graph.search_variable("Inexistente")
        assert "error" in result


class TestGetConcept:
    def test_get_concept_with_classifier(self, agent_with_graph):
        result = agent_with_graph.get_concept("Sexo")
        assert result["name"] == "Sexo"
        assert "classifier" in result
        assert result["classifier"]["standard"] == "ISO_5218"

    def test_get_concept_without_classifier(self, agent_with_graph):
        result = agent_with_graph.get_concept("Edad")
        assert result["name"] == "Edad"
        assert "classifier" not in result


class TestCheckInteroperability:
    def test_finds_shared_concepts(self, agent_with_graph):
        result = agent_with_graph.check_interoperability("DB_A", "DB_B")
        assert result["count"] == 1
        assert result["paths"][0]["concept"] == "Sexo"

    def test_no_paths_for_unknown_source(self, agent_with_graph):
        result = agent_with_graph.check_interoperability("DB_A", "DB_C")
        assert "error" in result


class TestGetClassifier:
    def test_get_existing_classifier(self, agent_with_graph):
        result = agent_with_graph.get_classifier("ISO_5218")
        assert result["standard"] == "ISO_5218"
        assert "1" in result["values"]

    def test_get_nonexistent_classifier(self, agent_with_graph):
        result = agent_with_graph.get_classifier("ISO_INEXISTENTE")
        assert "error" in result
        assert "available" in result


class TestValidateField:
    def test_validate_field_with_matching_standard(self, agent_with_graph):
        result = agent_with_graph.validate_field("sexo", ["1", "2", "0"])
        assert "candidates" in result
        assert len(result["candidates"]) > 0
        assert result["candidates"][0]["standard"] == "ISO_5218"

    def test_validate_field_no_match(self, agent_with_graph):
        result = agent_with_graph.validate_field("columna_rara", ["ZZ", "XX"])
        assert "error" in result
