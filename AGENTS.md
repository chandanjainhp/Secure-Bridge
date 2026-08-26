# AGENTS.md — Secure Bridge Agent Instructions

> Repository-specific instructions for AI agents working on Secure Bridge. Read this file before making any changes.

---

## Project Purpose

Secure Bridge is a hybrid web application providing an encrypted messaging and chat environment where users bring their own LLM API keys (BYOK). Keys are encrypted at rest with AES-256-GCM. The backend manages third-party LLM API calls, usage tracking, MCP integrations, and optional Fully Homomorphic Encryption (FHE) via OpenFHE/WebAssembly.

---

## Technology Constraints

| Layer | Technology | Version Constraint |
|-------|-----------|-------------------|
| Runtime | Node.js | 20.x or later |
| Client tooling | Bun | 1.3.x or later |
| Frontend | React + Vite, Tailwind CSS, shadcn/ui, React Query | `[VERIFY exact versions from lockfiles]` |
| Backend | Node.js + Express | `[VERIFY exact versions from lockfiles]` |
| Database | MongoDB via Mongoose | `[VERIFY exact version]` |
| Cache | Redis | `[VERIFY exact version]` |
| Auth | JWT (access + refresh) | `[VERIFY library]` |
| Email | Nodemailer (Gmail SMTP) | `[VERIFY exact version]` |
| Encryption | AES-256-GCM (API keys), OpenFHE/WASM (experimental) | `[VERIFY library]` |
| Testing (backend) | Jest | `[VERIFY exact version]` |
| Testing (frontend) | `[VERIFY — runner not stated in README]` | — |
| Containerization | Docker, Docker Compose | `[VERIFY exact version]` |

**Do not upgrade dependencies unless explicitly requested.** Prefer currently supported versions already selected by the project.

---

## Architecture Rules

1. **Client-server separation is strict.** The frontend communicates with the backend only via the REST API (`/api/v1`). The frontend never touches MongoDB, Redis, or raw API keys.
2. **Feature-based organization.** Both frontend (`client/src/features/`) and backend (`server/src/features/`) use feature folders. New features must follow this pattern.
3. **Backend owns all secrets.** Encryption, decryption, API key storage, and external API calls happen exclusively server-side.
4. **FHE is optional.** The system must start and function in mock mode (`ENCRYPTION_MODE=mock`) using `FHEStub.js`. Never make FHE a hard dependency for application startup.
5. **MCP is optional.** The system must function with `ENABLE_MCP` unset or false. MCP features must not break core chat functionality when disabled.
6. **Redis is optional at runtime.** If Redis is offline, OTP flows fall back to in-memory storage. Do not make Redis a hard dependency for application startup.
7. **Do not change the Redis port mapping** (host 6380 → container 6379) without explicit instruction.

---

## Coding Conventions

> `[VERIFY]` Exact conventions (formatting style, import order, naming) require inspection of existing code and config files (`.eslintrc`, `.prettierrc`, `tsconfig.json` if present). The rules below are derived from the README and project structure.

1. **Frontend:** React functional components with hooks. Tailwind CSS for styling. shadcn/ui for component primitives. React Query for server state.
2. **Backend:** Express with feature-based controllers/routes/services pattern. Mongoose for MongoDB models. `asyncHandler` wrapper for async route handlers. `ApiError` for structured error responses.
3. **Validation:** Request input validation rules in `server/src/validation/`.
4. **Middleware:** Security headers, auth verification, and validation in `server/src/middlewares/`.
5. **Utilities:** Response/error helpers in `server/src/utils/` (`ApiError`, `asyncHandler`).
6. **Environment:** All configuration via `.env` files. Templates at `server/.env.docker` and `server/.env.example`. Never hardcode secrets.

---

## Testing Requirements

1. **Backend tests must pass before any merge.**
   ```bash
   cd server && bun  test
   ```
2. **Backend coverage must be measurable.**
   ```bash
   cd server && bun  run test:coverage
   ```
3. **Frontend linting must pass.**
   ```bash
   cd client && bun  run lint
   ```
4. **Frontend tests** `[VERIFY — runner and command unknown]`. Tests exist in `client/src/test/`. Identify the runner before adding new tests.
5. **Never claim a test passed without running it.**
6. **New features must include tests.** Add tests in the same phase as the feature implementation.
7. **Security-critical paths must have tests:**
   - Encryption/decryption (AES-256-GCM)
   - API key masking in responses
   - JWT auth and protected route enforcement
   - OTP verification and fallback
   - Rate limiting enforcement

---

## Validation Commands

| Check | Command | Location |
|-------|---------|----------|
| Backend tests | `bun  test` | `server/` |
| Backend coverage | `bun  run test:coverage` | `server/` |
| Frontend lint | `bun  run lint` | `client/` |
| Frontend tests | `bun  test` `[VERIFY]` | `client/` |
| Backend dev server | `bun  run dev` | `server/` (port 8000) |
| Frontend dev server | `bun  run dev` | `client/` (port 5173) |
| Database seed | `bun  run db:seed` | `server/` |
| Start services | `docker compose up -d mongodb redis` | Project root |
| Stop services | `./scripts/db-down.sh` | Project root |
| Frontend type check | `[VERIFY — check for tsc or vite build]` | `client/` |

---

## Security Rules

1. **Never expose plaintext API keys** in API responses, logs, error messages, or client-side code.
2. **Never commit `.env` files.** Only `.env.example` and `.env.docker` templates belong in version control.
3. **Never log JWT secrets, encryption keys, or API key values.**
4. **All API key storage must use AES-256-GCM encryption.** Do not introduce a different encryption algorithm without explicit approval.
5. **CORS origin must match the configured `CORS_ORIGIN` exactly.** Do not use wildcard origins.
6. **Security headers middleware must be applied to all routes.**
7. **Input validation must be applied to all user-facing endpoints.** Validation rules live in `server/src/validation/`.
8. **OTP codes must expire.** Do not extend OTP validity beyond the configured duration.
9. **Rate limiting must be enforced on LLM API calls.** Do not bypass rate limiting middleware.
10. **MCP outbound calls must respect `OUTBOUND_ALLOWLIST`.** Never hardcode allowed URLs in application code — use the environment variable.
11. **FHE WASM artifacts are build artifacts, not source code.** Do not modify precompiled binaries in `server/fhe/` or `server/fhe-wasm/` directly.

---

## Dependency Rules

1. **Do not upgrade dependencies** unless explicitly requested.
2. **Do not add new dependencies** without justification and review.
3. **Prefer existing libraries** already in the project for new functionality.
4. **Lockfiles must be updated** when dependencies change — do not commit `package.json` changes without updating `package-lock.json` / `bun.lockb`.
5. **Runtime versions (Node.js 20.x, Bun 1.3.x) must not be changed** without explicit instruction.

---

## Files/Directories Requiring Special Care

| Path | Why it matters |
|------|----------------|
| `server/src/services/` (encryption) | Contains AES-256-GCM encryption logic. Changes here affect all API key security. |
| `server/src/middlewares/` | Auth, security headers, rate limiting. Changes affect all protected routes. |
| `server/src/models/` (ApiKey, User) | Mongoose schemas for sensitive data. Schema changes require migration consideration. |
| `server/src/features/chat/services/chatService.js` | MCP integration point. Changes affect outbound calls and security. |
| `server/.env`, `server/.env.example`, `server/.env.docker` | Secrets configuration. Never commit real `.env`. |
| `server/fhe/`, `server/fhe-wasm/`, `server/emsdk/`, `server/openfhe-development/` | FHE build artifacts and toolchain. Do not modify binaries directly. |
| `server/src/services/FHEStub.js` | Mock FHE implementation. Changes must not break mock mode startup. |
| `docker-compose.yml` | Service configuration. Port mappings and credentials must not be changed without instruction. |
| `client/src/shared/` | Global components, hooks, API client. Changes ripple across the frontend. |
| `client/src/app/` | Global store, router, ErrorBoundary. Changes affect the entire frontend. |

---

## Prohibited Behavior

1. **Do not implement features** before the foundation (spec, roadmap, agent instructions) is established and reviewed.
2. **Do not make unrelated refactors** during a focused task.
3. **Do not silently fix pre-existing failures** — classify and report them.
4. **Do not upgrade dependencies** without explicit request.
5. **Do not log or expose secrets** (API keys, JWT secrets, encryption keys).
6. **Do not bypass security middleware** (auth, CORS, security headers, rate limiting, input validation).
7. **Do not modify FHE precompiled binaries** in `server/fhe/` or `server/fhe-wasm/`.
8. **Do not change Redis or MongoDB port mappings** without explicit instruction.
9. **Do not claim a test passed without running it.**
10. **Do not self-approve implementation** — wait for manual user approval.
11. **Do not invent requirements, architecture, or versions** — mark unknowns as unknown.
12. **Do not make broad refactors** unless explicitly requested.

---

## Definition of Done

A task is complete when:

1. **Scope is met** — Only the requested scope was implemented. No unrelated changes.
2. **Tests are written** — New features include tests. Existing tests still pass.
3. **Validation passes** — All relevant validation commands (tests, lint, type check) exit 0.
4. **Security is intact** — No secrets exposed, no security middleware bypassed, no new vulnerabilities introduced.
5. **Results are reported** — Exact test results, validation output, and any failures are reported honestly.
6. **Change is reviewable** — The diff is minimal, focused, and ready for human review.
7. **Manual approval received** — The phase is not marked complete until the user approves.

---

## Implementation Workflow

For every implementation phase:

1. Read this file (`AGENTS.md`).
2. Read the relevant section of `docs/SPEC.md`.
3. Read the relevant phase in `docs/ROADMAP.md`.
4. Inspect affected code before modifying.
5. Implement only the requested scope.
6. Add or update tests.
7. Run validation.
8. Report exact results (pass/fail for each check).
9. Prepare a reviewable change (minimal diff).
10. Wait for manual approval before treating the phase as complete.

---

## Failure Classification

When a validation check fails, classify it before acting:

1. **Pre-existing failure** — The failure existed before the change. Report it. Do not fix it unless explicitly asked.
2. **Configuration problem** — The failure is caused by misconfiguration (e.g., missing `.env` value). Report and propose a fix.
3. **Environment problem** — The failure is caused by the environment (e.g., Docker not running, Redis offline). Report and suggest remediation.
4. **Newly introduced failure** — The failure was introduced by the change. Fix it before proceeding.

Never silently fix unrelated existing failures.

---

## Output Expectations

- Use direct technical language.
- Do not use filler.
- Do not praise the user.
- Distinguish between: observed facts, repository decisions, assumptions, and recommendations.
- Prefer small, reviewable changes.
- Report failures honestly — never claim success without evidence.
