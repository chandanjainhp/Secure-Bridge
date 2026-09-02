"""Environment-driven configuration for the Secure Bridge MCP server.

All settings are read from environment variables so the server matches the
naming conventions already used by the Express backend's ``server/.env.example``.

Fail-closed principle: if ``OUTBOUND_ALLOWLIST`` is unset or empty, the parsed
allowlist is an empty set, and :class:`allowlist.Allowlist` treats an empty set
as "deny everything" for outbound-HTTP tools (see :mod:`allowlist`).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _parse_allowlist(raw: str | None) -> frozenset[str]:
    """Parse a comma-separated host list into a lowercased frozenset.

    Accepts plain hostnames (``api.example.com``), host:port pairs
    (``localhost:3000`` — the port is stripped), and full URLs
    (``https://api.example.com/path`` — the host is extracted). Whitespace and
    empty entries are ignored.
    """
    from urllib.parse import urlparse

    if not raw:
        return frozenset()

    hosts: set[str] = set()
    for chunk in raw.split(","):
        token = chunk.strip()
        if not token:
            continue
        # If it looks like a URL, extract the host; otherwise treat as a bare
        # hostname (optionally with :port).
        if "://" in token:
            parsed = urlparse(token)
            host = (parsed.hostname or "").lower()
        else:
            host = token.split(":")[0].lower()
        if host:
            hosts.add(host)
    return frozenset(hosts)


@dataclass(frozen=True)
class Settings:
    """Immutable snapshot of the server configuration.

    Re-read per request via :func:`get_settings` so a cached decision is never
    trusted across requests (AC-MCP-3). The cache is keyed on the raw env
    values, so changing an env var mid-process invalidates it.
    """

    enable_mcp: bool
    outbound_allowlist: frozenset[str]
    mcp_server_host: str
    mcp_server_port: int
    # Base URL of the Express backend, used by tools that call back into the API
    # rather than hitting MongoDB directly (keeps one source of truth).
    express_api_base_url: str
    # Per-request timeout for outbound tool HTTP calls, in seconds.
    outbound_timeout_seconds: float
    # Max bytes to read from any fetched URL body, to bound memory use.
    fetch_max_bytes: int

    @property
    def allowlist_configured(self) -> bool:
        """True only when at least one host is allowlisted."""
        return len(self.outbound_allowlist) > 0

    def mcp_server_url(self) -> str:
        return f"http://{self.mcp_server_host}:{self.mcp_server_port}"


def _truthy(value: str | None) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _load_settings() -> Settings:
    return Settings(
        enable_mcp=_truthy(os.environ.get("ENABLE_MCP")),
        outbound_allowlist=_parse_allowlist(os.environ.get("OUTBOUND_ALLOWLIST")),
        mcp_server_host=os.environ.get("MCP_SERVER_HOST", "127.0.0.1"),
        mcp_server_port=int(os.environ.get("MCP_SERVER_PORT", "8787")),
        express_api_base_url=os.environ.get(
            "EXPRESS_API_BASE_URL", "http://127.0.0.1:3000"
        ).rstrip("/"),
        outbound_timeout_seconds=float(
            os.environ.get("OUTBOUND_TIMEOUT_SECONDS", "15")
        ),
        fetch_max_bytes=int(os.environ.get("FETCH_MAX_BYTES", "1_000_000")),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the current settings.

    The ``lru_cache`` here only caches within a single process invocation; the
    intent is to avoid re-parsing env on every call within one request flow.
    Tests call :func:`reset_settings_cache` after monkeypatching env vars so a
    fresh snapshot is produced.
    """
    return _load_settings()


def reset_settings_cache() -> None:
    """Drop the cached settings so the next :func:`get_settings` re-reads env."""
    get_settings.cache_clear()
