"""fetch_url tool — fetch an allowlisted URL and return cleaned text.

Security contract
-----------------
* The initial URL and EVERY redirect hop are re-checked against the allowlist.
  Redirects are never followed blindly (AC-MCP-3, security checklist).
* No request/response bodies are logged. Only host/tool/timestamp on rejection.
* The decrypted LLM API key is never involved here — this tool only fetches
  public allowlisted URLs, so there is nothing sensitive to leak by design.
"""

from __future__ import annotations

import logging
from typing import Annotated

import httpx
from bs4 import BeautifulSoup
from fastmcp.exceptions import ToolError

from .. import config
from ..allowlist import MAX_REDIRECTS, get_allowlist
from ..server import mcp

log = logging.getLogger("mcp.tools.fetch_url")

_MAX_RESPONSE_BYTES = 1_000_000


def _clean_html(html: str) -> str:
    """Strip scripts/styles/nav and return visible text, whitespace-normalized."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


async def _fetch_following_redirects(
    url: str, *, allowlist, client: httpx.AsyncClient, max_redirects: int
) -> httpx.Response:
    """Fetch with manual redirect handling so every hop is allowlist-checked."""
    current = url
    for _ in range(max_redirects + 1):
        allowlist.assert_url_allowed(current, tool="fetch_url")
        response = await client.get(current, follow_redirects=False)
        if response.is_redirect:
            location = response.headers.get("location", "")
            if not location:
                raise ToolError("Server returned a redirect with no Location header.")
            current = str(httpx.URL(current).join(location))
            continue
        return response
    raise ToolError(f"Too many redirects (>{max_redirects}).")


async def fetch_url(
    url: Annotated[str, "Absolute http(s) URL on an allowlisted host."],
) -> str:
    """Fetch an allowlisted URL and return its visible text content.

    Non-allowlisted hosts are rejected with a structured error. Redirects are
    followed only after re-checking each hop against the allowlist.
    """
    settings = config.get_settings()
    allowlist = get_allowlist()

    # Validate (and fail fast) before any network call.
    allowlist.assert_url_allowed(url, tool="fetch_url")

    try:
        async with httpx.AsyncClient(
            timeout=settings.outbound_timeout_seconds,
            follow_redirects=False,  # we handle redirects manually
        ) as client:
            response = await _fetch_following_redirects(
                url,
                allowlist=allowlist,
                client=client,
                max_redirects=MAX_REDIRECTS,
            )
            response.raise_for_status()

            content_type = response.headers.get("content-type", "").lower()
            body = response.content
            if len(body) > settings.fetch_max_bytes:
                raise ToolError(
                    f"Response body exceeds the configured limit "
                    f"({settings.fetch_max_bytes} bytes)."
                )

            if "html" in content_type:
                return _clean_html(response.text)
            return response.text
    except ToolError:
        raise
    except httpx.HTTPStatusError as exc:
        # Never leak the response body; only the status code.
        raise ToolError(f"Fetch failed: HTTP {exc.response.status_code}.") from exc
    except httpx.RequestError as exc:
        raise ToolError(f"Network error while fetching URL: {type(exc).__name__}.") from exc
    except Exception as exc:
        # Catch-all: never surface internal stack/paths/secrets.
        log.warning("fetch_url unexpected error: %s", type(exc).__name__)
        raise ToolError("An unexpected error occurred while fetching the URL.") from exc


# Register as an MCP tool.
fetch_url_tool = mcp.tool(
    name="fetch_url",
    description=(
        "Fetch an allowlisted URL and return its cleaned text content. "
        "Non-allowlisted hosts are rejected."
    ),
)(fetch_url)
