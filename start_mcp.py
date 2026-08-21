"""Wrapper to start the nomenclador MCP server with correct paths."""
import os
import sys

# Set paths so the mcp module is found
project_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_dir)
os.environ.setdefault("SEMANTICA_KG_PATH", os.path.join(project_dir, "nomenclador.json"))

# Import and run the MCP server
from mcp.server import main
main()
