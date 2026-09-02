"""MCP tools for Secure Bridge.

Each module in this package defines and registers one MCP tool with the
FastMCP server instance. To add a tool:

1. Create ``tools/<name>.py``.
2. Define an async function with typed, ``Annotated`` parameters.
3. Register it with ``@mcp.tool`` (import ``mcp`` from ``..server``).

It is auto-discovered by ``server.register_tools``.
"""
