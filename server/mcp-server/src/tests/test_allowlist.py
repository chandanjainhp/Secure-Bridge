"""Tests for config parsing and allowlist enforcement."""

from __future__ import annotations

import pytest

from server import config
from server.allowlist import Allowlist, AllowlistError


# ---- config._parse_allowlist ----------------------------------------------

def test_parse_allowlist_bare_hosts():
    hosts = config._parse_allowlist("api.example.com, localhost ,127.0.0.1")
    assert hosts == frozenset({"api.example.com", "localhost", "127.0.0.1"})


def test_parse_allowlist_host_port_strips_port():
    hosts = config._parse_allowlist("localhost:3000, api.example.com:443")
    assert hosts == frozenset({"localhost", "api.example.com"})


def test_parse_allowlist_full_urls_extract_host():
    hosts = config._parse_allowlist("https://api.example.com/path, http://docs.example.com")
    assert hosts == frozenset({"api.example.com", "docs.example.com"})


def test_parse_allowlist_empty_and_unset():
    assert config._parse_allowlist("") == frozenset()
    assert config._parse_allowlist(None) == frozenset()
    assert config._parse_allowlist(" , , ") == frozenset()


def test_parse_allowlist_case_insensitive():
    hosts = config._parse_allowlist("API.Example.COM, LocalHost")
    assert hosts == frozenset({"api.example.com", "localhost"})


# ---- Settings fail-closed --------------------------------------------------

def test_settings_empty_allowlist_is_fail_closed(monkeypatch):
    monkeypatch.delenv("OUTBOUND_ALLOWLIST", raising=False)
    monkeypatch.setenv("ENABLE_MCP", "true")
    config.reset_settings_cache()
    settings = config.get_settings()
    assert settings.enable_mcp is True
    assert settings.allowlist_configured is False
    assert settings.outbound_allowlist == frozenset()
    config.reset_settings_cache()


def test_settings_enable_mcp_default_false(monkeypatch):
    monkeypatch.delenv("ENABLE_MCP", raising=False)
    config.reset_settings_cache()
    assert config.get_settings().enable_mcp is False
    config.reset_settings_cache()


# ---- Allowlist.is_host_allowed --------------------------------------------

def test_allowlist_allows_listed_host():
    al = Allowlist(frozenset({"api.example.com"}))
    assert al.is_host_allowed("api.example.com").allowed is True


def test_allowlist_rejects_unlisted_host():
    al = Allowlist(frozenset({"api.example.com"}))
    decision = al.is_host_allowed("evil.example.com")
    assert decision.allowed is False
    assert "not on allowlist" in decision.reason


def test_allowlist_case_insensitive():
    al = Allowlist(frozenset({"api.example.com"}))
    assert al.is_host_allowed("API.EXAMPLE.COM").allowed is True


def test_allowlist_empty_denies_all():
    al = Allowlist(frozenset())
    decision = al.is_host_allowed("api.example.com")
    assert decision.allowed is False
    assert "fail-closed" in decision.reason


def test_allowlist_empty_host_rejected():
    al = Allowlist(frozenset({"api.example.com"}))
    assert al.is_host_allowed("").allowed is False
    assert al.is_host_allowed(None).allowed is False


# ---- Allowlist.assert_host_allowed raises ToolError ------------------------

def test_assert_host_allowed_raises_on_reject():
    al = Allowlist(frozenset({"api.example.com"}))
    with pytest.raises(AllowlistError):
        al.assert_host_allowed("evil.example.com", tool="fetch_url")


def test_assert_host_allowed_passes_on_allowed():
    al = Allowlist(frozenset({"api.example.com"}))
    # Should not raise.
    al.assert_host_allowed("api.example.com", tool="fetch_url")


# ---- Allowlist.assert_url_allowed -----------------------------------------

def test_assert_url_allowed_rejects_non_http_scheme():
    al = Allowlist(frozenset({"api.example.com"}))
    with pytest.raises(AllowlistError, match="scheme"):
        al.assert_url_allowed("ftp://api.example.com/file", tool="fetch_url")


def test_assert_url_allowed_rejects_malformed():
    al = Allowlist(frozenset({"api.example.com"}))
    with pytest.raises(AllowlistError):
        al.assert_url_allowed("", tool="fetch_url")
    with pytest.raises(AllowlistError):
        al.assert_url_allowed("not a url", tool="fetch_url")


def test_assert_url_allowed_rejects_non_allowlisted_host():
    al = Allowlist(frozenset({"api.example.com"}))
    with pytest.raises(AllowlistError):
        al.assert_url_allowed("https://evil.example.com/x", tool="fetch_url")


def test_assert_url_allowed_accepts_allowlisted_host():
    al = Allowlist(frozenset({"api.example.com"}))
    url = al.assert_url_allowed("https://api.example.com/path?q=1", tool="fetch_url")
    assert url == "https://api.example.com/path?q=1"
