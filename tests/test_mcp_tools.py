"""
Basic tests for MCP server — tool registration and schema validation.
"""

import pytest

from mcp.tools import TOOL_DEFINITIONS
from mcp.tools.nomenclador import NOMENCLADOR_TOOLS


class TestToolDefinitions:
    def test_total_tool_count(self):
        assert len(TOOL_DEFINITIONS) == 24

    def test_all_tools_have_required_fields(self):
        for tool in TOOL_DEFINITIONS:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert "description" in tool, f"Tool missing 'description': {tool}"
            assert "inputSchema" in tool, f"Tool missing 'inputSchema': {tool}"
            assert "_handler" in tool, f"Tool missing '_handler': {tool}"

    def test_tool_names_unique(self):
        names = [t["name"] for t in TOOL_DEFINITIONS]
        assert len(names) == len(set(names)), f"Duplicate tool names: {names}"

    def test_nomenclador_tools_present(self):
        nomenclador_names = {t["name"] for t in NOMENCLADOR_TOOLS}
        expected = {
            "list_concepts",
            "search_variable",
            "get_concept",
            "check_interoperability",
            "get_transform",
            "validate_field",
            "get_classifier",
        }
        assert nomenclador_names == expected

    def test_nomenclador_tool_count(self):
        assert len(NOMENCLADOR_TOOLS) == 7
