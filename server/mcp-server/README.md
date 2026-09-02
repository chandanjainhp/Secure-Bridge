# Secure Bridge MCP Server

A FastMCP (Python) server that plugs into the Secure Bridge chat pipeline. It exposes a small set of tools the chat service can call when `ENABLE_MCP=true`, and it enforces the project's outbound allowlist and security model.

Satisfies acceptance criteria **AC-MCP-1** through **AC-MCP-4**.

## What it does

- **`fetch_url(url)`** — fetches an allowlisted URL and returns cleaned text content. Rejects non-allowlisted hosts. Redirects are re-checked hop-by-hop (never followed blindly).
- **`search_project_context(project_id, query)`** — calls back into the existing Express API (`/api/v1/projects/:id/context`) rather than querying MongoDB directly, keeping one source of truth.

Both tools route every outbound request through a single allowlist chokepoint (`allowlist.py`). There is no bypass path.

## Security model

- **Fail-closed.** If `OUTBOUND_ALLOWLIST` is unset or empty, the server still starts (so misconfiguration is visible in logs) but every outbound-HTTP tool rejects all hosts. The server never silently allows all hosts.
- **No secrets logged.** Rejections log only `tool`, `host`, `reason`, and `timestamp`. Request/response bodies are never logged.
- **No API keys handled.** The MCP server never receives, logs, or persists decrypted LLM API keys. BYOK keys are AES-256-GCM encrypted at rest and decrypted only server-side by the Express backend; the MCP server is designed to operate without ever seeing them.
- **No stack traces leaked.** `mask_error_details=True` on the FastMCP app ensures unexpected errors return a generic message to the LLM, never internal paths or stack frames.
- **Redirect re-checking.** `fetch_url` disables automatic redirect-following and re-validates each hop against the allowlist before following it.

## Configuration

All settings are environment variables, matching `server/.env.example` naming:

| Variable | Default | Description |
|---|---|---|
| `ENABLE_MCP` | `false` | Master switch. The Express chat service only connects when `true`. |
| `OUTBOUND_ALLOWLIST` | _(empty)_ | Comma-separated hostnames. Accepts bare hosts (`api.example.com`), `host:port` (`localhost:3000`, port stripped), and full URLs (`https://...`, host extracted). **Empty = deny all.** |
| `MCP_TRANSPORT` | `stdio` | `stdio` for local dev, `streamable-http` for the sidecar deployment. |
| `MCP_SERVER_HOST` | `127.0.0.1` | HTTP transport bind host. |
| `MCP_SERVER_PORT` | `8787` | HTTP transport bind port. |
| `EXPRESS_API_BASE_URL` | `http://127.0.0.1:3000` | Express backend base URL used by `search_project_context`. Its host must be on the allowlist. |
| `OUTBOUND_TIMEOUT_SECONDS` | `15` | Per-request HTTP timeout for tools. |
| `FETCH_MAX_BYTES` | `1000000` | Max response body size `fetch_url` will read. |
| `MCP_LOG_LEVEL` | `INFO` | Logging level. |

### Example `.env`

```bash
ENABLE_MCP=true
OUTBOUND_ALLOWLIST=api.example.com,docs.example.com,localhost,127.0.0.1
MCP_TRANSPORT=streamable-http
MCP_SERVER_HOST=127.0.0.1
MCP_SERVER_PORT=8787
EXPRESS_API_BASE_URL=http://127.0.0.1:3000
```

## Running

### Local dev (stdio transport)

```bash
cd mcp-server
pip install -e ".[dev]"
ENABLE_MCP=true \
OUTBOUND_ALLOWLIST=api.example.com,localhost \
MCP_TRANSPORT=stdio \
python -m server
```

### Sidecar (streamable-HTTP transport)

```bash
ENABLE_MCP=true \
OUTBOUND_ALLOWLIST=api.example.com,localhost,127.0.0.1 \
MCP_TRANSPORT=streamable-http \
MCP_SERVER_PORT=8787 \
python -m server
```

The Express backend connects to `http://127.0.0.1:8787/mcp`.

## Wiring into the Express backend

> **[VERIFY]** The Node-side MCP client shim is intentionally **not** written yet. It depends on the current shape of `server/src/features/chat/services/chatService.js` and `server/.env.example`, which are `[VERIFY]`/`[UNKNOWN]` items from the project spec. Please share those files and the shim will be written to match.

The shim's contract is fixed by the requirements:

- It only connects when `process.env.ENABLE_MCP === 'true'`.
- It reads the tool list from the MCP server at startup and passes it to the LLM call as available tools.
- It no-ops cleanly (chat still works without tools) if the MCP server is unreachable.
- With `ENABLE_MCP` unset/false, it never attempts to connect at all (AC-MCP-1).

A reference implementation will use the `@modelcontextprotocol/sdk` TypeScript client against the streamable-HTTP endpoint, with a `try/catch` around `client.connect()` that falls back to a no-tools chat path.

## Testing

```bash
pip install -e ".[dev]"
pytest -v
```

Tests cover:

- **`test_allowlist.py`** — allowlist parsing, host checks, fail-closed on empty allowlist, URL scheme validation, malformed input.
- **`test_fetch_url.py`** — allowlisted host success (HTML cleaned), non-allowlisted host rejection, redirect re-checking (redirect to non-allowlisted host is rejected), malformed input, HTTP error mapping.
- **`test_integration.py`** — boots the FastMCP server with `ENABLE_MCP=true`, lists tools, and invokes `fetch_url` end-to-end against a stubbed HTTP server; plus a test asserting that with `ENABLE_MCP` unset, the chat-service shim never connects (AC-MCP-1).

## Adding a new tool

1. Create `src/tools/<name>.py`.
2. Define an async function with `Annotated` parameters and a docstring.
3. Register it: `my_tool = mcp.tool(name="my_tool", description="...")(my_tool)`.
4. Add the module name to `tool_modules` in `server.register_tools`.

## Security review checklist (apply before merging)

- [x] No API key, JWT, or OTP ever logged or written to disk by the MCP server.
- [x] All outbound calls pass through the allowlist check, with no bypass path (redirects are re-checked, not followed blindly).
- [x] Server refuses to silently allow all hosts (empty allowlist = deny all; loud log warning at startup).
- [x] Errors returned to the LLM/chat never leak internal stack traces, file paths, or secrets (`mask_error_details=True`).

## Open items to confirm against the real repo

1. Exact shape of `chatService.js`'s current MCP integration hook (if any code already exists there).
2. What `OUTBOUND_ALLOWLIST` format actually is today (hostnames only? full URLs? wildcard support?). The parser currently accepts all three but does **not** support wildcards — extend `config._parse_allowlist` and `Allowlist.is_host_allowed` if wildcards are needed.
3. Whether Redis should be used for allowlist/rate-limit caching for MCP calls specifically, or whether that's out of scope for this server.
4. The real tool list the product needs — the two starter tools are placeholders.
5. The real Express route shape for `search_project_context` (currently assumes `/api/v1/projects/:id/context?q=...`).
