"""Outbound allowlist enforcement, shared by every outbound-HTTP tool.

This is the single chokepoint for AC-MCP-3. Every tool that performs an HTTP
request must route its target through :func:`assert_host_allowed` (or
:func:`is_host_allowed`) — there is no bypass path.

Design notes
------------
* Decisions are never cached across requests: each call re-reads the live
  allowlist from :mod:`config`, so an operator toggling ``OUTBOUND_ALLOWLIST``
  takes effect on the next call.
* An empty allowlist means "deny everything" (fail closed). The server will
  still start (so misconfiguration is visible in logs), but no outbound-HTTP
  tool will be permitted to run.
* Hosts are matched case-insensitively on the exact hostname. Wildcards are
  NOT supported by default to keep the security model explicit; if the real
  repo uses wildcard syntax, extend :class:`Allowlist` accordingly and
  document it (see README "Open items").
* Rejections are returned to the LLM as :class:`ToolError` (structured, no
  stack trace) and logged with host/tool/timestamp only — never bodies.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastmcp.exceptions import ToolError

from . import config

log = logging.getLogger("mcp.allowlist")

# Reasonable cap on redirect chains we'll allowlist-check. Each hop is
# re-validated, so this only bounds loop length, not safety.
MAX_REDIRECTS = 5


class AllowlistError(ToolError):
    """Structured tool error raised when a host is not allowlisted.

    Subclasses :class:`fastmcp.exceptions.ToolError` so FastMCP surfaces it to
    the LLM/client as a clean tool error rather than a 500/stack trace.
    """


@dataclass(frozen=True)
class AllowlistDecision:
    allowed: bool
    host: str
    reason: str


class Allowlist:
    """Stateless checker built from the live settings snapshot."""

    def __init__(self, hosts: frozenset[str] | None = None) -> None:
        self._hosts = hosts

    @property
    def hosts(self) -> frozenset[str]:
        # Read live if not explicitly seeded (tests inject a frozen set).
        return self._hosts if self._hosts is not None else config.get_settings().outbound_allowlist

    def is_empty(self) -> bool:
        return len(self.hosts) == 0

    def is_host_allowed(self, host: str | None) -> AllowlistDecision:
        host = (host or "").strip().lower()
        if not host:
            return AllowlistDecision(False, host, "host is empty")
        if self.is_empty():
            return AllowlistDecision(
                False, host, "outbound allowlist is empty (fail-closed)"
            )
        if host in self.hosts:
            return AllowlistDecision(True, host, "allowlisted")
        return AllowlistDecision(False, host, "host not on allowlist")

    def assert_host_allowed(self, host: str | None, *, tool: str = "unknown") -> None:
        decision = self.is_host_allowed(host)
        if not decision.allowed:
            log.warning(
                "allowlist rejection: tool=%s host=%s reason=%s ts=%s",
                tool,
                decision.host,
                decision.reason,
                datetime.now(timezone.utc).isoformat(),
            )
            raise AllowlistError(
                f"Host '{decision.host}' is not permitted for tool '{tool}': "
                f"{decision.reason}. If this host should be reachable, add it "
                f"to the OUTBOUND_ALLOWLIST environment variable and restart."
            )

    def assert_url_allowed(self, url: str, *, tool: str = "unknown") -> str:
        """Validate a URL's host and return a normalized copy of the URL.

        Raises :class:`AllowlistError` (a :class:`ToolError`) on rejection or
        malformed input.
        """
        if not isinstance(url, str) or not url.strip():
            raise AllowlistError("A non-empty URL string is required.")
        try:
            parsed = urlparse(url)
        except Exception as exc:  # urlparse is lenient; guard anyway
            raise AllowlistError("Malformed URL.") from exc
        if parsed.scheme not in {"http", "https"}:
            raise AllowlistError(
                f"Unsupported URL scheme '{parsed.scheme}'. Only http/https are allowed."
            )
        host = (parsed.hostname or "").lower()
        self.assert_host_allowed(host, tool=tool)
        return url


# Module-level convenience instance so tools don't each construct one.
def get_allowlist() -> Allowlist:
    """Return an Allowlist bound to the live settings snapshot."""
    return Allowlist(config.get_settings().outbound_allowlist)
