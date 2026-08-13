"""
Basic tests for semantica package __init__.py — module proxy access.
"""

import pytest


class TestModuleProxies:
    def test_kg_proxy_accessible(self):
        import semantica
        kg = semantica.kg
        assert kg is not None

    def test_ontology_proxy_accessible(self):
        import semantica
        ontology = semantica.ontology
        assert ontology is not None

    def test_invalid_attribute_raises(self):
        import semantica
        with pytest.raises(AttributeError, match="has no attribute"):
            semantica.nonexistent_module

    def test_dead_proxy_removed(self):
        import semantica
        with pytest.raises(AttributeError):
            semantica.embeddings

    def test_all_exports_valid(self):
        import semantica
        for name in semantica.__all__:
            assert hasattr(semantica, name), f"__all__ lists '{name}' but it's not accessible"
