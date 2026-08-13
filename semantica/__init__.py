"""
Semantica - Semantic Layer & Knowledge Engineering Framework

A comprehensive Python framework for transforming unstructured data into 
semantic layers, knowledge graphs, and embeddings.
"""

__version__ = "0.6.5"
__author__ = "Semantica Contributors"
__license__ = "MIT"

# Import submodules for dot notation access
import importlib

# Module proxy class for submodule access
class _ModuleProxy:
    """Proxy class to enable dot notation access to submodules."""

    def __init__(self, module_name: str):
        self._module_name = module_name
        self._module = None

    def _get_module(self):
        """Lazy load the module."""
        if self._module is None:
            self._module = importlib.import_module(f"semantica.{self._module_name}")
        return self._module

    def __getattr__(self, name: str):
        """Delegate attribute access to the actual module."""
        return getattr(self._get_module(), name)

    def __dir__(self):
        """Return directory of the actual module."""
        return dir(self._get_module())


# Create module proxies for submodule access
class _SemanticaModules:
    """Container for submodule proxies."""

    def __init__(self):
        self._kg = None
        self._ingest = None
        self._semantic_extract = None
        self._export = None
        self._ontology = None

    @property
    def kg(self):
        """Access knowledge graph module."""
        if self._kg is None:
            self._kg = _ModuleProxy("kg")
        return self._kg

    @property
    def ingest(self):
        """Access ingestion module."""
        if self._ingest is None:
            self._ingest = _ModuleProxy("ingest")
        return self._ingest

    @property
    def semantic_extract(self):
        """Access semantic extraction module."""
        if self._semantic_extract is None:
            self._semantic_extract = _ModuleProxy("semantic_extract")
        return self._semantic_extract

    @property
    def export(self):
        """Access export module."""
        if self._export is None:
            self._export = _ModuleProxy("export")
        return self._export

    @property
    def ontology(self):
        """Access ontology module."""
        if self._ontology is None:
            self._ontology = _ModuleProxy("ontology")
        return self._ontology



# Create singleton instance for module access
_modules = _SemanticaModules()




__all__ = ["kg", "ingest", "semantic_extract", "export", "ontology"]


# Make submodules accessible via dot notation
def __getattr__(name: str):
    """Enable dot notation access to submodules."""
    if name in [
        "kg",
        "ingest",
        "semantic_extract",
        "export",
        "ontology",
    ]:
        return getattr(_modules, name)
    raise AttributeError(f"module 'semantica' has no attribute '{name}'")
