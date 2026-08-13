"""
Nomenclador MCP Server Package

A full Model Context Protocol (MCP) server for the Nomenclador Explorer — exposes knowledge graph
construction, semantic extraction, decision intelligence, reasoning, analytics,
export, and nomenclador governance capabilities as MCP tools and resources.

Run the server:
    python -m mcp.server        # from repo root

Configure in Claude Desktop, Windsurf, Cline, Continue, VS Code:
    {
        "mcpServers": {
            "nomenclador": {
                "command": "python",
                "args": ["-m", "mcp.server"],
                "cwd": "/path/to/nomenclador-explorer"
            }
        }
    }
"""

from semantica import __version__

from .server import SemanticaMCPServer, main

__all__ = ["SemanticaMCPServer", "main", "__version__"]
