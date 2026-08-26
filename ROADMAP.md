# Secure Bridge — Implementation Roadmap

> **Status:** DRAFT — derived from README.md only. Phases are ordered by dependency and risk. Each phase should be validated against the actual codebase before implementation begins. Items marked `[VERIFY]` require repository inspection.

---

## Guiding Principles

- Small, reviewable phases over large feature batches.
- Each phase is complete only when its acceptance criteria and validation checks pass.
- No phase should require changing the whole application at once.
- Security-critical paths (encryption, auth, key management) are prioritized early.

---

## Phase 0 — Foundation Validation & Gap Resolution

**Objective:** Verify the foundation documents against the actual repository and resolve all `[VERIFY]` and `[UNKNOWN]` items.

**Scope:**
- Inspect `package.json`, `package-lock.json` / `bun.lockb` in both `client/` and `server/`.
- Inspect `.github/workflows/`, `Dockerfile`, deployment config for CI/CD.
- Inspect `client/package.json` scripts for test runner, linter, formatter, type-checker.
- Inspect `.eslintrc*`, `.prettierrc*`, `tsconfig.json` (if present).
- Inspect Mongoose models (`server/src/models/`) for schema details.
- Inspect encryption service code (`server/src/services/`).
- Inspect auth middleware (`server/src/middlewares/`).
- Inspect `docker-compose.yml` for full service configuration.
- Inspect rate limiting implementation.
- Update SPEC.md and AGENTS.md with verified facts.

**Dependencies:** None (this is the first phase).

**Files/components likely affected:**
- `docs/SPEC.md` (update)
- `AGENTS.md` (update)
- All `package.json`, lockfiles, config files (read-only)

**Acceptance Criteria:**
- AC-0-1: All `[VERIFY]` and `[UNKNOWN]` items in SPEC.md are resolved or explicitly marked as deferred with rationale.
- AC-0-2: Exact dependency versions are documented in SPEC.md.
- AC-0-3: CI/CD status (existing or missing) is documented.
- AC-0-4: Frontend test runner is identified and documented.

**Required Tests:** None (inspection only).

**Validation Commands:**
```bash
cd server && cat package.json
cd client && cat package.json
# Inspect lockfiles, config files, models, services, middleware
```

**Completion Condition:** All `[VERIFY]` markers resolved; SPEC.md and AGENTS.md reflect verified repository facts.

---

## Phase 1 — Security Audit & Hardening

**Objective:** Verify and harden the security-critical paths — API key encryption, JWT auth, CORS, security headers, and input validation.

**Scope:**
- Audit AES-256-GCM encryption implementation in `server/src/services/`.
- Verify plaintext keys are never returned in API responses (inspect all API key routes/controllers).
- Verify plaintext keys are never written to logs (inspect logging calls).
- Audit JWT configuration (secret strength, expiry, refresh flow).
- Audit CORS configuration.
- Audit security headers middleware.
- Audit input validation rules in `server/src/validation/`.
- Verify OTP storage and expiry in Redis.

**Dependencies:** Phase 0 (need verified codebase facts).

**Files/components likely affected:**
- `server/src/services/` (encryption services)
- `server/src/middlewares/` (auth, security headers, validation)
- `server/src/routes/` (API key routes)
- `server/src/controllers/` (API key controllers)
- `server/src/features/api-key/`
- `server/src/models/` (ApiKey model)
- `server/.env.example`, `server/.env.docker`

**Acceptance Criteria:**
- AC-SEC-1: CORS origin is enforced — requests from non-allowlisted origins are rejected.
- AC-SEC-2: Security headers are applied — response headers include security headers from middleware.
- AC-SEC-3: API keys are encrypted at rest in MongoDB — direct MongoDB query returns ciphertext.
- AC-SEC-4: JWT tokens expire correctly — access token after `JWT_EXPIRES_IN`, refresh token after `JWT_REFRESH_EXPIRES_IN`.
- AC-SEC-5: No plaintext API key appears in any API response payload.
- AC-SEC-6: No plaintext API key appears in any log output.

**Required Tests:**
- Unit test: encryption service encrypts and decrypts correctly with AES-256-GCM.
- Unit test: API key route response does not contain plaintext key field.
- Integration test: protected route returns 401 without valid JWT.
- Integration test: CORS rejects non-allowlisted origin.
- Integration test: OTP verification accepts valid code and rejects invalid code.

**Validation Commands:**
```bash
cd server && bun  test
cd server && bun  run test:coverage
```

**Completion Condition:** All security acceptance criteria pass; no plaintext key exposure in responses or logs; test coverage for encryption and auth paths.

---

## Phase 2 — Authentication & User Management Completion

**Objective:** Verify and complete the authentication flow — registration, login, OTP, refresh, and profile.

**Scope:**
- Verify registration endpoint creates user and returns tokens.
- Verify login endpoint validates credentials and returns tokens.
- Verify OTP flow (send via SMTP, verify code, fallback to in-memory if Redis offline).
- Verify refresh token flow.
- Verify user profile endpoints.
- Identify and fill test coverage gaps for auth.

**Dependencies:** Phase 1 (security audit must confirm JWT config is sound).

**Files/components likely affected:**
- `server/src/features/auth/` or `server/src/routes/` (auth routes)
- `server/src/models/` (User model)
- `server/src/middlewares/` (auth middleware)
- `server/src/email/` (email templates and transport)
- `server/src/config/` (Redis config for OTP)
- `client/src/features/auth/` (auth UI components)
- `client/src/features/profile/` (profile UI)

**Acceptance Criteria:**
- AC-AUTH-1: User can register and receive JWT access + refresh tokens.
- AC-AUTH-2: User can log in with valid credentials and receive tokens.
- AC-AUTH-3: Invalid credentials return 401.
- AC-AUTH-4: OTP verification works when enabled — code sent via SMTP, verification accepts/rejects.
- AC-AUTH-5: Protected routes reject requests without valid JWT.
- AC-AUTH-6: Refresh token produces new access token.

**Required Tests:**
- Integration test: full registration → login → protected request flow.
- Integration test: OTP send → verify → access granted.
- Integration test: OTP fallback to in-memory when Redis offline.
- Integration test: expired access token → refresh → new access token.
- Unit test: password hashing/verification.

**Validation Commands:**
```bash
cd server && bun  test
cd client && bun  run lint
```

**Completion Condition:** All auth acceptance criteria pass; OTP fallback tested; refresh flow tested.

---

## Phase 3 — BYOK API Key Management Completion

**Objective:** Verify and complete the BYOK feature — storing, retrieving (masked), updating, and deleting API keys for supported providers.

**Scope:**
- Verify API key CRUD endpoints.
- Verify encryption/decryption flow for key storage and retrieval.
- Verify provider support (OpenAI, Anthropic, Gemini, Azure).
- Verify masked key display in responses.
- Fill test coverage gaps for BYOK.

**Dependencies:** Phase 1 (security audit confirms encryption is sound).

**Files/components likely affected:**
- `server/src/features/api-key/`
- `server/src/routes/` (apiKey routes)
- `server/src/models/` (ApiKey model)
- `server/src/services/` (encryption service)
- `server/src/validation/` (API key validation)
- `client/src/features/api-key/` (BYOK UI)

**Acceptance Criteria:**
- AC-BYOK-1: User can store an API key for a supported provider — key encrypted at rest.
- AC-BYOK-2: API key is never returned in plaintext in any response.
- AC-BYOK-3: API key is never written to logs.
- AC-BYOK-4: User can update an API key.
- AC-BYOK-5: User can delete an API key.
- AC-BYOK-6: Encryption uses AES-256-GCM.

**Required Tests:**
- Unit test: encryption service with AES-256-GCM.
- Integration test: store key → retrieve (masked) → update → delete.
- Integration test: key from User A is not accessible by User B.
- Unit test: masked key format in response.

**Validation Commands:**
```bash
cd server && bun  test
cd client && bun  run lint
```

**Completion Condition:** All BYOK acceptance criteria pass; no plaintext key in any response or log.

---

## Phase 4 — Project Workspaces Completion

**Objective:** Verify and complete project/workspace CRUD with per-user isolation.

**Scope:**
- Verify project CRUD endpoints.
- Verify per-user isolation (users cannot see/modify other users' projects).
- Verify system prompt and settings storage per project.
- Fill test coverage gaps.

**Dependencies:** Phase 2 (auth must be working for user context).

**Files/components likely affected:**
- `server/src/routes/` (Project routes)
- `server/src/models/` (Project model)
- `server/src/middlewares/` (auth middleware for user context)
- `server/src/validation/` (project validation)
- `client/src/features/projects/` (projects UI)

**Acceptance Criteria:**
- AC-PROJ-1: User can create a project with name, system prompt, and settings.
- AC-PROJ-2: User can list their projects.
- AC-PROJ-3: User can update a project's settings.
- AC-PROJ-4: User can delete a project.
- AC-PROJ-5: Projects are isolated per user — User A cannot access User B's projects.

**Required Tests:**
- Integration test: create → list → update → delete project.
- Integration test: cross-user isolation (User A cannot GET/PUT/DELETE User B's project).
- Unit test: project schema validation.

**Validation Commands:**
```bash
cd server && bun  test
cd client && bun  run lint
```

**Completion Condition:** All project acceptance criteria pass; cross-user isolation verified.

---

## Phase 5 — Chat & Messaging Completion

**Objective:** Verify and complete the chat flow — message routing to LLM via stored encrypted key, conversation persistence, and system prompt application.

**Scope:**
- Verify chat message endpoint accepts user input and returns LLM response.
- Verify chat uses the user's decrypted API key for LLM calls.
- Verify conversation history is persisted per project.
- Verify system prompt from project settings is applied.
- Fill test coverage gaps.

**Dependencies:** Phase 3 (BYOK must be working for key retrieval) + Phase 4 (projects must be working for conversation context).

**Files/components likely affected:**
- `server/src/features/chat/` (chat feature)
- `server/src/features/chat/services/chatService.js` (chat service, MCP integration)
- `server/src/routes/` (chat routes)
- `server/src/models/` (conversation/message models)
- `client/src/features/chat/` (chat UI)

**Acceptance Criteria:**
- AC-CHAT-1: User can send a message and receive an LLM response.
- AC-CHAT-2: Chat uses the user's stored encrypted API key (decrypted server-side).
- AC-CHAT-3: Conversation history is persisted per project.
- AC-CHAT-4: System prompt from project settings is applied to LLM calls.

**Required Tests:**
- Integration test: send message → receive response (mock LLM API).
- Integration test: conversation history persisted and retrievable by project ID.
- Unit test: system prompt injection into LLM request.
- Integration test: chat fails gracefully when no API key is configured.

**Validation Commands:**
```bash
cd server && bun  test
cd client && bun  run lint
```

**Completion Condition:** All chat acceptance criteria pass; conversation persistence verified; system prompt applied.

---

## Phase 6 — Usage Tracking & Rate Limiting Completion

**Objective:** Verify and complete usage tracking — token/message counting, Redis-cached rate limits, free-tier enforcement, and usage dashboard.

**Scope:**
- Verify usage is recorded per LLM call.
- Verify Redis caching of usage counters.
- Verify rate limiting middleware enforces free-tier limits.
- Verify usage dashboard endpoint returns aggregated data.
- Fill test coverage gaps.

**Dependencies:** Phase 5 (chat must be working to generate usage data).

**Files/components likely affected:**
- `server/src/features/usage/`
- `server/src/middlewares/` (rate limiting middleware)
- `server/src/models/` (usage model)
- `server/src/config/` (Redis config)
- `client/src/features/usage/` (usage dashboard UI)

**Acceptance Criteria:**
- AC-USAGE-1: Token usage is recorded per request in MongoDB.
- AC-USAGE-2: Usage is cached in Redis for rate-limit checks.
- AC-USAGE-3: Free-tier limits are enforced — requests exceeding limit return 429.
- AC-USAGE-4: Usage dashboard displays aggregated data.

**Required Tests:**
- Integration test: LLM call → usage record created.
- Integration test: exceeding limit → 429 response.
- Unit test: usage aggregation logic.
- Integration test: Redis offline fallback (if applicable).

**Validation Commands:**
```bash
cd server && bun  test
cd client && bun  run lint
```

**Completion Condition:** All usage acceptance criteria pass; rate limiting enforced; dashboard data accurate.

---

## Phase 7 — MCP Integration Completion

**Objective:** Verify and complete MCP integration — enable/disable via config, outbound allowlist enforcement, and chat service integration.

**Scope:**
- Verify MCP is disabled by default.
- Verify MCP can be enabled via `ENABLE_MCP=true`.
- Verify outbound calls respect `OUTBOUND_ALLOWLIST`.
- Verify MCP integrates with `chatService.js`.
- Fill test coverage gaps.

**Dependencies:** Phase 5 (chat service must be working).

**Files/components likely affected:**
- `server/src/features/chat/services/chatService.js`
- `server/src/config/` (MCP configuration)
- `server/.env.example`, `server/.env.docker`

**Acceptance Criteria:**
- AC-MCP-1: MCP is disabled by default — features not available when `ENABLE_MCP` is unset/false.
- AC-MCP-2: MCP can be enabled via environment.
- AC-MCP-3: Outbound calls respect allowlist — non-allowlisted URLs are blocked.
- AC-MCP-4: MCP service integrates with chat service.

**Required Tests:**
- Integration test: MCP disabled → MCP tools not available in chat.
- Integration test: MCP enabled → tools available and execute allowed outbound calls.
- Unit test: allowlist enforcement (allowed URL passes, blocked URL rejected).

**Validation Commands:**
```bash
cd server && bun  test
```

**Completion Condition:** All MCP acceptance criteria pass; allowlist enforcement verified.

---

## Phase 8 — FHE Integration Verification

**Objective:** Verify FHE mock mode and WASM build path — ensure graceful fallback and document the build process.

**Scope:**
- Verify mock mode (`ENCRYPTION_MODE=mock`) starts successfully with `FHEStub.js`.
- Verify FHE WASM artifacts are loadable when configured with valid paths.
- Document the WASM build process (Emscripten, CMake, OpenFHE).
- Fill test coverage gaps (mock mode at minimum).

**Dependencies:** None strictly required, but Phase 1 (security audit) should confirm FHE service is not introducing vulnerabilities.

**Files/components likely affected:**
- `server/src/services/` (FHE service, FHEStub.js)
- `server/emsdk/`, `server/fhe/`, `server/fhe-wasm/`, `server/openfhe-development/`
- `server/.env.example`, `server/.env.docker`

**Acceptance Criteria:**
- AC-FHE-1: Mock mode starts successfully without WASM artifacts.
- AC-FHE-2: FHE WASM artifacts are loadable when configured.
- AC-FHE-3: FHE operations do not crash the server in mock mode.

**Required Tests:**
- Integration test: server starts in mock mode and responds to health checks.
- Integration test: chat and API key operations work in mock mode.
- `[VERIFY]` Integration test: FHE WASM operations (requires build environment).

**Validation Commands:**
```bash
cd server && ENCRYPTION_MODE=mock bun  test
```

**Completion Condition:** Mock mode verified; WASM build path documented; no crashes in mock mode.

---

## Phase 9 — CI/CD Establishment

**Objective:** Establish or verify CI pipelines for automated testing, linting, and build validation.

**Scope:**
- Inspect existing `.github/workflows/` (if present).
- If CI is missing, create a minimal GitHub Actions workflow that runs:
  - Backend: dependency install → lint `[VERIFY]` → test → coverage
  - Frontend: dependency install → lint → test `[VERIFY]`
- If CI exists, verify it covers the relevant checks.
- Configure Dependabot for dependency update monitoring (if GitHub).
- Configure GitHub security automation (code scanning, secret protection).

**Dependencies:** Phase 0 (need to know what CI exists) + Phases 1–6 (need passing tests to put in CI).

**Files/components likely affected:**
- `.github/workflows/ci.yml` (create or update)
- `.github/dependabot.yml` (create)
- `server/package.json` (verify scripts)
- `client/package.json` (verify scripts)

**Acceptance Criteria:**
- AC-CI-1: Backend tests pass in CI — `cd server && bun  test` exits 0.
- AC-CI-2: Frontend linting passes in CI — `cd client && bun  run lint` exits 0.
- AC-CI-3: Backend coverage is measurable — `cd server && bun  run test:coverage` produces report.
- AC-CI-4: CI runs on every pull request.
- AC-CI-5: Dependabot is configured for dependency updates.

**Required Tests:** None (CI is the test).

**Validation Commands:**
```bash
# Trigger CI run via PR or manual dispatch
cd server && bun  test
cd server && bun  run test:coverage
cd client && bun  run lint
```

**Completion Condition:** CI pipeline passes on main branch; Dependabot active; security automation enabled.

---

## Phase 10 — Frontend Test Coverage

**Objective:** Identify and fill frontend test gaps — ensure UI components, auth flows, and key user interactions are tested.

**Scope:**
- Identify frontend test runner (`[VERIFY]` — Vitest or Jest).
- Audit existing `client/src/test/` coverage.
- Add tests for: auth flow (login, register, OTP), API key management UI, chat interface, usage dashboard.
- Add component tests for shared components.

**Dependencies:** Phase 2 (auth), Phase 3 (BYOK), Phase 5 (chat), Phase 6 (usage) — need working features to test against.

**Files/components likely affected:**
- `client/src/test/` (existing tests)
- `client/src/features/*/` (add tests per feature)
- `client/package.json` (verify/add test scripts)

**Acceptance Criteria:**
- `[VERIFY]` Frontend test runner identified and configured.
- All critical user flows have at least one integration/component test.
- `bun  test` (or equivalent) exits 0 in `client/`.

**Required Tests:**
- Component test: auth login form validation and submission.
- Component test: API key management UI (add, mask, delete).
- Integration test: chat message send and receive rendering.
- Component test: usage dashboard renders data.

**Validation Commands:**
```bash
cd client && bun  test  # [VERIFY] — command may differ
cd client && bun  run lint
```

**Completion Condition:** Frontend test runner identified; critical flows tested; `bun  test` passes.

---

## Phase 11 — Documentation & Developer Onboarding

**Objective:** Complete developer-facing documentation — setup guide, architecture overview, contribution guide, and environment configuration reference.

**Scope:**
- Verify README is accurate and up to date.
- Create `CONTRIBUTING.md` with branching, commit, and PR conventions.
- Create `docs/ARCHITECTURE.md` with detailed architecture diagrams.
- Document environment variable reference (all `.env` variables with descriptions).
- Document FHE build process separately in `docs/FHE_BUILD.md`.

**Dependencies:** Phase 0 (need verified facts) + Phase 9 (CI conventions documented).

**Files/components likely affected:**
- `README.md` (verify/update)
- `CONTRIBUTING.md` (create)
- `docs/ARCHITECTURE.md` (create)
- `docs/ENV_REFERENCE.md` (create)
- `docs/FHE_BUILD.md` (create)

**Acceptance Criteria:**
- A new developer can clone the repo, set up `.env`, start services, and run the app following only the documentation.
- All environment variables are documented with descriptions and default values.
- FHE build process is documented step by step.

**Required Tests:** None (documentation).

**Validation Commands:**
```bash
# Manual: follow README setup from scratch
docker compose up -d mongodb redis
cd server && bun  install && bun  run dev
cd client && bun  install && bun  run dev
```

**Completion Condition:** Documentation is complete, accurate, and tested by a fresh setup.

---

## Roadmap Summary

| Phase | Objective | Dependencies | Priority |
|-------|-----------|--------------|----------|
| 0 | Foundation validation & gap resolution | None | Critical |
| 1 | Security audit & hardening | Phase 0 | Critical |
| 2 | Auth & user management completion | Phase 1 | High |
| 3 | BYOK API key management completion | Phase 1 | High |
| 4 | Project workspaces completion | Phase 2 | High |
| 5 | Chat & messaging completion | Phase 3, 4 | High |
| 6 | Usage tracking & rate limiting completion | Phase 5 | Medium |
| 7 | MCP integration completion | Phase 5 | Medium |
| 8 | FHE integration verification | Phase 1 | Low |
| 9 | CI/CD establishment | Phase 0, 1–6 | High |
| 10 | Frontend test coverage | Phase 2–6 | Medium |
| 11 | Documentation & developer onboarding | Phase 0, 9 | Low |

---

## Notes

- Phases 0–1 are foundational and must be completed before any feature implementation.
- Phases 2–7 are feature-focused and can be partially parallelized where dependencies allow (e.g., Phase 3 and Phase 4 can proceed in parallel after Phase 1).
- Phase 8 (FHE) is low priority — the mock mode is sufficient for development.
- Phase 9 (CI/CD) should be established as early as possible once tests are stable.
- Phase 10 (frontend tests) and Phase 11 (documentation) are important but not blocking for feature work.
- No phase includes upgrading dependencies unless explicitly requested.
