"""Tests for the fetch_url tool."""

from __future__ import annotations

import httpx
import pytest
import respx

from server import config
from server.allowlist import AllowlistError
from fastmcp.exceptions import ToolError
from server.tools.fetch_url import fetch_url


@pytest.fixture(autouse=True)
def _allowlist_env(monkeypatch):
    """Seed an allowlist with one good host for each test."""
    monkeypatch.setenv("ENABLE_MCP", "true")
    monkeypatch.setenv("OUTBOUND_ALLOWLIST", "api.example.com")
    config.reset_settings_cache()
    yield
    config.reset_settings_cache()


async def test_fetch_url_allowlisted_success_html():
    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("https://api.example.com/page").respond(
            content="<html><body><script>bad()</script><p>Hello world</p></body></html>",
            headers={"content-type": "text/html"},
        )
        result = await fetch_url("https://api.example.com/page")
    assert "Hello world" in result
    assert "bad()" not in result  # script stripped


async def test_fetch_url_allowlisted_success_plain_text():
    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("https://api.example.com/data.txt").respond(
            content="just text",
            headers={"content-type": "text/plain"},
        )
        result = await fetch_url("https://api.example.com/data.txt")
    assert result == "just text"


async def test_fetch_url_rejects_non_allowlisted_host():
    with pytest.raises(AllowlistError):
        await fetch_url("https://evil.example.com/page")


async def test_fetch_url_rejects_empty_input():
    with pytest.raises(AllowlistError):
        await fetch_url("")


async def test_fetch_url_rejects_non_http_scheme():
    with pytest.raises(AllowlistError, match="scheme"):
        await fetch_url("ftp://api.example.com/file")


async def test_fetch_url_redirect_to_allowlisted_host():
    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("https://api.example.com/old").respond(
            status_code=301, headers={"location": "/new"}
        )
        mock.get("https://api.example.com/new").respond(
            content="redirected ok",
            headers={"content-type": "text/plain"},
        )
        result = await fetch_url("https://api.example.com/old")
    assert result == "redirected ok"


async def test_fetch_url_redirect_to_non_allowlisted_host_rejected():
    """Redirect to a non-allowlisted host must be rejected, not followed."""
    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("https://api.example.com/old").respond(
            status_code=302,
            headers={"location": "https://evil.example.com/secret"},
        )
        with pytest.raises(AllowlistError):
            await fetch_url("https://api.example.com/old")


async def test_fetch_url_http_error_mapped():
    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("https://api.example.com/missing").respond(status_code=404)
        with pytest.raises(ToolError, match="HTTP 404"):
            await fetch_url("https://api.example.com/missing")


async def test_fetch_url_network_error_mapped():
    with respx.mock(assert_all_called=False, assert_all_mocked=False) as mock:
        mock.get("https://api.example.com/down").mock(side_effect=httpx.ConnectError("conn refused"))
        with pytest.raises(ToolError, match="Network error"):
            await fetch_url("https://api.example.com/down")
