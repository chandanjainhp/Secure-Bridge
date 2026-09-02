"""search_project_context tool — call back into the existing Express API.

This intentionally does NOT open a second MongoDB connection. The Express
backend is the single source of truth for project data; calling its REST API
keeps authorization, validation, and caching in one place.

The Express endpoint shape is a [VERIFY] item. The implementation below
assumes a reasonable convention (``/api/v1/projects/:id/context?q=...``) and
is isolated behind :func:`search_project_context` so it can be re-pointed once
the real route is confirmed.
"""

from __future__ import annotations

import logging
from typing import Annotated
from urllib.parse import quote

import httpx
from fastmcp.exceptions import ToolError

from .. import config
from ..allowlist import get_allowlist
from ..server import mcp

log = logging.getLogger("mcp.tools.search_project_context")


async def search_project_context(
    project_id: Annotated[str, "The project identifier (path segment)."],
    query: Annotated[str, "Natural-language query to match against project context."],
) -> list[str]:
    """Return relevant conversation history / project settings from the backend.

    Calls the Express API (single source of truth) rather than querying
    MongoDB directly. The Express host must be on ``OUTBOUND_ALLOWLIST``.
    """
    if not isinstance(project_id, str) or not project_id.strip():
        raise ToolError("project_id must be a non-empty string.")
    if not isinstance(query, str) or not query.strip():
        raise ToolError("query must be a non-empty string.")
    if "/" in project_id or ".." in project_id:
        raise ToolError("project_id contains invalid characters.")

    settings = config.get_settings()
    allowlist = get_allowlist()

    # Build the callback URL against the Express base URL, then enforce the
    # allowlist on its host (the Express host must be allowlisted explicitly).
    express_host = httpx.URL(settings.express_api_base_url).host
    allowlist.assert_host_allowed(express_host, tool="search_project_context")

    url = (
        f"{settings.express_api_base_url}/api/v1/projects/"
        f"{quote(project_id, safe='')}/context"
    )
    params = {"q": query}

    try:
        async with httpx.AsyncClient(
            timeout=settings.outbound_timeout_seconds,
            follow_redirects=False,
        ) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
    except ToolError:
        raise
    except httpx.HTTPStatusError as exc:
        raise ToolError(
            f"Express API returned HTTP {exc.response.status_code}."
        ) from exc
    except httpx.RequestError as exc:
        raise ToolError(f"Network error contacting Express API: {type(exc).__name__}.") from exc
    except ValueError as exc:
        raise ToolError("Express API returned non-JSON content.") from exc
    except Exception as exc:
        log.warning("search_project_context unexpected error: %s", type(exc).__name__)
        raise ToolError("An unexpected error occurred while querying project context.") from exc

    # Normalize the response into a list[str] regardless of exact API shape.
    if isinstance(data, list):
        return [str(item) for item in data]
    if isinstance(data, dict):
        # Common shapes: {"results": [...]} or {"context": [...]}
        for key in ("results", "context", "items", "messages"):
            if isinstance(data.get(key), list):
                return [str(item) for item in data[key]]
        return [str(data)]
    return [str(data)]


# Register as an MCP tool.
search_project_context_tool = mcp.tool(
    name="search_project_context",
    description=(
        "Search a project's conversation history / settings via the Express "
        "API (single source of truth). The Express host must be allowlisted."
    ),
)(search_project_context)
