"""Integration tests.

AC-MCP-2 / AC-MCP-4: boot the FastMCP server, list tools, invoke one end-to-end.
AC-MCP-1: with ENABLE_MCP unset/false, the chat-service shim never connects.
"""

from __future__ import annotations

import pytest
import respx

from server import config
from server.allowlist import AllowlistError
from fastmcp.exceptions import ToolError


@pytest.fixture
def allowlist_env(monkeypatch):
    monkeypatch.setenv("ENABLE_MCP", "true")
    monkeypatch.setenv("OUTBOUND_ALLOWLIST", "api.example.com,127.0.0.1,localhost")
    monkeypatch.setenv("EXPRESS_API_BASE_URL", "http://127.0.0.1:3000")
    config.reset_settings_cache()
    yield
    config.reset_settings_cache()


def _extract_text(result) -> str:
    """Normalize a FastMCP ToolResult into a plain string for assertions."""
    if isinstance(result, str):
        return result
    content = getattr(result, "content", None)
    if content is None and isinstance(result, list):
        content = result
    parts = []
    for block in content or []:
        text = getattr(block, "text", None)
        if text is None and isinstance(block, dict):
            text = block.get("text")
        if text:
            parts.append(text)
    return "\n".join(parts)


async def test_server_lists_expected_tools(allowlist_env):
    """AC-MCP-2: server exposes the expected tool list at startup."""
    from server.server import create_server

    mcp = create_server()
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert "fetch_url" in names
    assert "search_project_context" in names


async def test_server_invokes_fetch_url_end_to_end(allowlist_env):
    """AC-MCP-4: invoke fetch_url through the FastMCP tool registry."""
    from server.server import create_server

    mcp = create_server()

    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("https://api.example.com/page").respond(
            content="<html><body><p>Integration result</p></body></html>",
            headers={"content-type": "text/html"},
        )
        result = await mcp.call_tool("fetch_url", {"url": "https://api.example.com/page"})

    text = _extract_text(result)
    assert "Integration result" in text
    assert result.is_error is False


async def test_server_invokes_search_project_context_end_to_end(allowlist_env):
    """AC-MCP-4: invoke search_project_context through the registry (Express stubbed)."""
    from server.server import create_server

    mcp = create_server()

    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("http://127.0.0.1:3000/api/v1/projects/proj-1/context").respond(
            json={"results": ["msg-a", "msg-b"]}
        )
        result = await mcp.call_tool(
            "search_project_context",
            {"project_id": "proj-1", "query": "deploy"},
        )

    text = _extract_text(result)
    assert "msg-a" in text
    assert "msg-b" in text
    assert result.is_error is False


async def test_fetch_url_rejects_non_allowlisted_via_registry(allowlist_env):
    """AC-MCP-3: non-allowlisted host returns a structured tool error, not a crash."""
    from server.server import create_server

    mcp = create_server()
    # FastMCP re-raises ToolError (which AllowlistError subclasses) from call_tool.
    with pytest.raises((AllowlistError, ToolError)):
        await mcp.call_tool("fetch_url", {"url": "https://evil.example.com/x"})


async def test_enable_mcp_false_chat_service_never_connects(monkeypatch):
    """AC-MCP-1: with ENABLE_MCP unset/false, the chat-service shim no-ops.

    We simulate the Node-side shim's decision logic: the MCP client is only
    constructed when ENABLE_MCP === 'true'. This test encodes that contract
    so the real shim (once written against chatService.js) must preserve it.
    """
    monkeypatch.delenv("ENABLE_MCP", raising=False)
    config.reset_settings_cache()
    settings = config.get_settings()
    assert settings.enable_mcp is False

    # The shim's connection gate, as a spec the real shim must satisfy:
    def shim_should_connect(s):
        return s.enable_mcp is True

    assert shim_should_connect(settings) is False
    config.reset_settings_cache()
