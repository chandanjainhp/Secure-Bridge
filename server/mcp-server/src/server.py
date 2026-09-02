"""Secure Bridge MCP server entrypoint.

Boots a FastMCP server with stdio transport for local dev and
streamable-HTTP transport for the sidecar deployment.

The server is fail-closed: if ``OUTBOUND_ALLOWLIST`` is empty at startup, it
logs a loud warning and outbound-HTTP tools will reject every host — it does
not silently allow all hosts (security checklist).
"""

from __future__ import annotations

import logging
import os
import sys
from importlib import import_module

from fastmcp import FastMCP

from . import config
from .allowlist import AllowlistError

log = logging.getLogger("mcp.server")
logging.basicConfig(
    level=os.environ.get("MCP_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Create the FastMCP app. mask_error_details=True ensures internal stack traces
# and file paths are never leaked back to the LLM/client on unexpected errors.
mcp = FastMCP(
    name="secure-bridge",
    instructions=(
        "Secure Bridge MCP server. Tools enforce the project outbound "
        "allowlist; non-allowlisted hosts are rejected."
    ),
    mask_error_details=True,
)


def register_tools() -> None:
    """Register all tool functions under ``src/tools/``.

    Tools are plain async functions decorated with ``@mcp.tool``. Each tool
    module imports ``mcp`` and registers itself on import. This auto-discovery
    keeps the extension point simple: drop a new ``tools/<name>.py`` that
    defines a ``@mcp.tool`` function, and it is picked up here.
    """
    tool_modules = ["fetch_url", "search_project_context"]
    for name in tool_modules:
        import_module(f"{__package__}.tools.{name}")


def _warn_if_allowlist_empty() -> None:
    settings = config.get_settings()
    if not settings.allowlist_configured:
        log.warning(
            "SECURITY: OUTBOUND_ALLOWLIST is empty/unset. The server is running "
            "in fail-closed mode: every outbound-HTTP tool will reject all "
            "hosts until at least one host is allowlisted."
        )


def create_server() -> FastMCP:
    """Register tools and return the configured FastMCP instance (for tests)."""
    _warn_if_allowlist_empty()
    register_tools()
    return mcp


def main() -> None:
    create_server()
    transport = os.environ.get("MCP_TRANSPORT", "stdio").lower()
    settings = config.get_settings()

    if transport == "stdio":
        mcp.run(transport="stdio")
    elif transport in {"http", "streamable-http"}:
        mcp.run(
            transport="streamable-http",
            host=settings.mcp_server_host,
            port=settings.mcp_server_port,
        )
    else:
        log.error("Unknown MCP_TRANSPORT=%r (use 'stdio' or 'streamable-http')", transport)
        sys.exit(1)


# Expose structured error type for tool modules / tests.
__all__ = ["mcp", "create_server", "main", "AllowlistError"]


if __name__ == "__main__":
    main()
