# Secure Bridge — Project Specification

> **Status:** DRAFT — derived from README.md only. Requires validation against the actual repository (package.json, lockfiles, config files, source code) before treating as authoritative. Items marked `[VERIFY]` or `[UNKNOWN]` could not be confirmed from the README alone.

---

## Problem

Secure Bridge solves the problem of securely using third-party LLM APIs (OpenAI, Anthropic, Gemini, Azure) without exposing API keys to the frontend or to the LLM provider beyond what is necessary. It provides an encrypted messaging and chat environment where users bring their own keys (BYOK), keys are encrypted at rest, usage is tracked and rate-limited, and confidential data can be processed using Fully Homomorphic Encryption (FHE) via WebAssembly.

---

## Intended Users

- **End users / individuals** who want to use LLM-powered chat with their own API keys, without exposing those keys client-side.
- **Project/workspace owners** who want to organize conversations, system prompts, and settings into project-based workspaces.
- **Developers** who want to integrate MCP (Model Context Protocol) tools for extended AI context operations.

> `[UNKNOWN]` Whether there are admin, team, or organizational roles beyond the individual user. Requires repository inspection of the User model and auth middleware.

---

## Required Behavior

1. **User authentication** — JWT-based session with optional OTP verification via Gmail SMTP.
2. **BYOK API key management** — Users register third-party LLM API keys (OpenAI, Anthropic, Gemini, Azure). Keys are encrypted at rest using AES-256-GCM. Plaintext keys are never returned in API responses or written to logs.
3. **Project-based workspaces** — Users can create projects/workspaces with distinct system prompts, settings, and conversation history.
4. **Chat / messaging** — Conversational interface that routes user messages to the configured LLM via the stored (encrypted) API key.
5. **Usage tracking** — Token and message usage is tracked per user. Free-tier limits are enforced by middleware. Usage records are stored in MongoDB with Redis caching.
6. **MCP integration** — When enabled (`ENABLE_MCP=true`), the AI model can leverage external context tools (e.g., executing allowed outbound calls). Outbound access is controlled via `OUTBOUND_ALLOWLIST`.
7. **FHE support (experimental)** — Confidential data processing using OpenFHE compiled to WebAssembly. Falls back to `FHEStub.js` in mock mode (`ENCRYPTION_MODE=mock`).

---

## User Experience

- **Login / Registration** — Email + password with optional OTP step sent via Gmail SMTP.
- **Profile** — User profile configuration.
- **API key management** — Users add, view (masked), and manage their LLM API keys through the UI. Keys are never displayed in plaintext.
- **Project / workspace selection** — Users create or switch between projects, each with its own system prompt and settings.
- **Chat interface** — Conversational messaging UI with sidebar navigation.
- **Usage dashboard** — Visual graphs showing API usage and limits.
- **Sidebar / layout** — Persistent sidebars and panels for navigation.

---

## Architecture

Secure Bridge is a hybrid web application with a clear client-server separation:

```
┌─────────────────────┐         ┌──────────────────────────────────┐
│   Frontend (client) │         │         Backend (server)          │
│   React + Vite      │◄───────►│   Node.js + Express              │
│   Tailwind CSS      │  HTTP   │                                  │
│   shadcn/ui         │  /API   │   ┌────────────────────────┐     │
│   React Query       │         │   │  Feature modules:      │     │
│                     │         │   │  - api-key (BYOK)       │     │
│   Features:         │         │   │  - chat                 │     │
│   - auth             │         │   │  - usage                │     │
│   - api-key         │         │   └────────────────────────┘     │
│   - chat            │         │                                  │
│   - usage           │         │   ┌────────┐  ┌───────────────┐ │
│   - projects        │         │   │ MongoDB│  │    Redis       │ │
│   - profile         │         │   │(primary│  │(OTP cache,    │ │
│   - layout          │         │   │ storage)│  │ rate limiting) │ │
│                     │         │   └────────┘  └───────────────┘ │
│                     │         │                                  │
│                     │         │   ┌────────────────────────────┐ │
│                     │         │   │  FHE / OpenFHE (WASM)      │ │
│                     │         │   │  or FHEStub.js (mock mode) │ │
│                     │         │   └────────────────────────────┘ │
│                     │         └──────────────────────────────────┘
└─────────────────────┘
```

### Architecture boundaries

- **Frontend** communicates with the backend exclusively via the REST API at `VITE_API_URL` (default `http://localhost:8000/api/v1`).
- **Backend** owns all secrets, encryption, database access, and external API calls. The frontend never touches MongoDB, Redis, or raw API keys directly.
- **FHE layer** is an optional service within the backend, falling back to a stub when `ENCRYPTION_MODE=mock`.
- **MCP layer** is an optional feature within the chat service, gated by `ENABLE_MCP` and `OUTBOUND_ALLOWLIST`.

---

## Major Components

### Frontend (`client/`)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| App config | `client/src/app/` | Global store, router, ErrorBoundary |
| Auth feature | `client/src/features/auth/` | Login, registration, OTP auth state and components |
| API key feature | `client/src/features/api-key/` | BYOK management UI components |
| Chat feature | `client/src/features/chat/` | Conversational messaging interface |
| Usage feature | `client/src/features/usage/` | API usage graphs and limits display |
| Projects feature | `client/src/features/projects/` | Workspace/project CRUD UI |
| Profile feature | `client/src/features/profile/` | User profile configuration |
| Layout | `client/src/features/layout/` | Persistent sidebars and panels |
| Shared | `client/src/shared/` | Global components, hooks, API client |
| Pages | `client/src/pages/` | Page views matching routing paths |
| Tests | `client/src/test/` | UI component test suites |

### Backend (`server/`)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Config | `server/src/config/` | Connection configs (Redis, etc.) |
| Controllers | `server/src/controllers/` | General controller classes |
| Database | `server/src/db/` | MongoDB init and connection (Mongoose) |
| Email | `server/src/email/` | Email templates and transport (Nodemailer/Gmail SMTP) |
| Features | `server/src/features/` | Feature-based logic: api-key, chat, usage |
| Middleware | `server/src/middlewares/` | Security headers, auth verification, validation |
| Models | `server/src/models/` | Mongoose models: User, Project, ApiKey |
| Routes | `server/src/routes/` | Route registration: Users, Auth, Project, ApiKey |
| Services | `server/src/services/` | Encryption services, FHE stub, external API calls |
| Utils | `server/src/utils/` | Response/error helpers (ApiError, asyncHandler) |
| Validation | `server/src/validation/` | Request input validation rules |
| Tests | `server/src/tests/` | Jest integration/unit tests |
| FHE build | `server/emsdk/`, `server/fhe/`, `server/fhe-wasm/`, `server/openfhe-development/` | Emscripten toolchain, precompiled FHE binaries, OpenFHE C++ source |

### Infrastructure

| Component | Responsibility |
|-----------|----------------|
| MongoDB | Primary data storage (users, projects, API keys, usage records, conversations) |
| Redis | OTP caching, rate limiting. Falls back to in-memory storage if Redis is offline. |
| Docker Compose | Container orchestration for MongoDB and Redis. Optional Mongo Express dashboard. |
| Scripts | `scripts/db-up.sh`, `scripts/db-down.sh` for database lifecycle management |

---

## Security and Privacy

### Authentication & Authorization

- **JWT-based sessions** — Access token (`JWT_SECRET`, `JWT_EXPIRES_IN=1d`) and refresh token (`JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN=10d`).
- **OTP verification** — Optional one-time password sent via Gmail SMTP (`EMAIL_USER`, `EMAIL_PASS`). OTPs are cached in Redis with fallback to local in-memory storage.
- **CORS** — Restricted to `CORS_ORIGIN` (default `http://localhost:5173`). Must exactly match the client URL.

> `[UNKNOWN]` Authorization model beyond per-user — whether project-level permissions, role-based access, or multi-user collaboration exist. Requires inspection of auth middleware and project models.

### Secrets Management

- **AES-256-GCM encryption at rest** for API keys (`ENCRYPTION_KEY`, `API_KEY_ENCRYPTION_SECRET`).
- **Plaintext keys never exposed** — Not in API responses, not in logs.
- **JWT secrets** — Separate access and refresh secrets, each 32+ characters.
- **Environment variables** — All secrets via `.env` files. Templates at `server/.env.docker` and `server/.env.example`.

> `[UNKNOWN]` Key rotation strategy, encryption key management beyond static env vars. Requires inspection of encryption service code.

### Data Protection

- **API key storage** — Encrypted at rest, decrypted only server-side when making LLM API calls.
- **OTP storage** — Redis with automatic fallback to in-memory (cleared on server restart).
- **Usage data** — Stored in MongoDB, cached in Redis for rate limiting.

### Input Validation

- Request validation rules defined in `server/src/validation/`.
- Security headers applied via middleware in `server/src/middlewares/`.

> `[UNKNOWN]` Specific validation rules, sanitization libraries (e.g., express-validator, zod), and rate limiting configuration details. Requires code inspection.

### FHE / Confidential Computing

- Experimental support for Fully Homomorphic Encryption using OpenFHE compiled to WebAssembly.
- Mock mode (`ENCRYPTION_MODE=mock`) falls back to `FHEStub.js` — application does not fail to start.
- FHE WASM paths configured via `FHE_WASM_PATH` and `FHE_JS_PATH` environment variables.

---

## Technical Constraints

### Runtime Versions

| Component | Version | Source |
|-----------|---------|--------|
| Node.js | 20.x or later | README — Prerequisites |
| Bun | 1.3.x or later | README — Prerequisites (client dependencies and Vite tooling) |
| Docker & Docker Compose | Required (version not specified) | README — Prerequisites |

> `[VERIFY]` Exact installed versions of Bun, Docker, and all npm packages require inspection of lockfiles (`package-lock.json`, `bun.lockb`) and `package.json` files.

### Framework / Library Stack

| Layer | Technology | Source |
|-------|-----------|--------|
| Frontend framework | React + Vite | README |
| CSS | Tailwind CSS | README |
| UI components | shadcn/ui | README |
| Data fetching | React Query | README |
| Backend framework | Node.js + Express | README |
| Database | MongoDB (via Mongoose) | README |
| Cache / OTP / rate limiting | Redis | README |
| Authentication | JWT | README |
| Email | Nodemailer (Gmail SMTP) | README |
| Encryption | AES-256-GCM (API keys), OpenFHE/WASM (experimental FHE) | README |
| FHE compilation | Emscripten, CMake, OpenFHE C++ | README |
| Testing (backend) | Jest | README |
| Testing (frontend) | `[VERIFY]` — test runner not explicitly stated; `client/src/test/` exists | README |

### Platform Constraints

- **Docker required** for MongoDB and Redis services.
- **Emscripten / CMake** required only for recompiling FHE WASM (not for running the app in mock mode).
- **Redis port mapping** — Host port 6380 maps to container port 6379 to avoid conflicts with native Redis instances.

### Dependency Rules

- Do not upgrade dependencies as part of the foundation phase.
- Prefer currently supported versions already selected by the project.
> `[VERIFY]` Exact pinned versions require lockfile inspection.

---

## Acceptance Criteria

### Authentication

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-AUTH-1 | User can register and receive a JWT access token and refresh token | POST `/api/v1/auth/register` returns 200/201 with tokens; JWT contains user ID |
| AC-AUTH-2 | User can log in with valid credentials and receive tokens | POST `/api/v1/auth/login` returns tokens |
| AC-AUTH-3 | Invalid credentials return 401 | POST `/api/v1/auth/login` with wrong password returns 401 |
| AC-AUTH-4 | OTP verification works when enabled | OTP sent via SMTP; OTP verification endpoint accepts/rejects correctly |
| AC-AUTH-5 | Protected routes reject requests without valid JWT | GET protected route without token returns 401 |
| AC-AUTH-6 | Refresh token produces new access token | POST `/api/v1/auth/refresh` with valid refresh token returns new access token |

> `[VERIFY]` Exact endpoint paths require inspection of `server/src/routes/`.

### BYOK API Key Management

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-BYOK-1 | User can store an API key for a supported provider | POST API key endpoint returns 201; key is encrypted at rest in MongoDB |
| AC-BYOK-2 | API key is never returned in plaintext in any response | GET API keys endpoint returns masked/omitted key field |
| AC-BYOK-3 | API key is never written to logs | Inspect log output during key storage and retrieval |
| AC-BYOK-4 | User can update an API key | PUT/PATCH endpoint updates the encrypted key |
| AC-BYOK-5 | User can delete an API key | DELETE endpoint removes the key from MongoDB |
| AC-BYOK-6 | Encryption uses AES-256-GCM | Inspect encryption service code; verify algorithm constant |

> `[VERIFY]` Exact endpoint paths, request/response schemas, and provider list require code inspection.

### Project Workspaces

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-PROJ-1 | User can create a project with name, system prompt, and settings | POST project endpoint returns 201 |
| AC-PROJ-2 | User can list their projects | GET projects endpoint returns only the user's projects |
| AC-PROJ-3 | User can update a project's settings | PATCH/PUT project endpoint updates fields |
| AC-PROJ-4 | User can delete a project | DELETE project endpoint removes the project |
| AC-PROJ-5 | Projects are isolated per user | User A cannot see/modify User B's projects |

> `[VERIFY]` Authorization enforcement details require middleware inspection.

### Chat / Messaging

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-CHAT-1 | User can send a message and receive an LLM response | POST chat message returns a response from the configured LLM |
| AC-CHAT-2 | Chat uses the user's stored encrypted API key | LLM call succeeds only if a valid encrypted key exists; key is decrypted server-side |
| AC-CHAT-3 | Conversation history is persisted per project | Messages are stored and retrievable by project ID |
| AC-CHAT-4 | System prompt from project settings is applied | LLM response reflects the project's configured system prompt |

> `[VERIFY]` Exact chat API contract, message schema, and conversation storage model require code inspection.

### Usage Tracking

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-USAGE-1 | Token usage is recorded per request | Usage record created in MongoDB after each LLM call |
| AC-USAGE-2 | Usage is cached in Redis for rate-limit checks | Redis contains usage counters; rate limit middleware enforces limits |
| AC-USAGE-3 | Free-tier limits are enforced | Requests exceeding limit return 429 or appropriate error |
| AC-USAGE-4 | Usage dashboard displays data | GET usage endpoint returns aggregated usage data; frontend renders graphs |

> `[VERIFY]` Exact limit values, rate limiting algorithm, and usage schema require code inspection.

### MCP Integration

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-MCP-1 | MCP is disabled by default | With `ENABLE_MCP` unset/false, MCP features are not available |
| AC-MCP-2 | MCP can be enabled via environment | With `ENABLE_MCP=true`, MCP tools are available in chat |
| AC-MCP-3 | Outbound calls respect allowlist | Calls to non-allowlisted URLs are blocked |
| AC-MCP-4 | MCP service integrates with chat service | `server/src/features/chat/services/chatService.js` contains MCP integration logic |

> `[VERIFY]` Exact MCP protocol, tool list, and allowlist enforcement mechanism require code inspection.

### FHE

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-FHE-1 | Mock mode starts successfully without WASM artifacts | `ENCRYPTION_MODE=mock` — server starts and routes fall back to `FHEStub.js` |
| AC-FHE-2 | FHE WASM artifacts are loadable when configured | With valid `FHE_WASM_PATH` and `FHE_JS_PATH`, FHE service initializes |
| AC-FHE-3 | FHE operations do not crash the server in mock mode | Chat and API key operations work normally in mock mode |

> `[VERIFY]` Actual FHE operations, test coverage, and WASM build verification require build environment and code inspection.

### CI / Build

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-CI-1 | Backend tests pass | `cd server && npm test` exits 0 |
| AC-CI-2 | Frontend linting passes | `cd client && npm run lint` exits 0 |
| AC-CI-3 | Backend coverage is measurable | `cd server && npm run test:coverage` produces coverage report |

> `[VERIFY]` Whether CI pipelines exist (`.github/workflows/`, etc.) requires repository inspection. Frontend test runner and coverage command require inspection of `client/package.json`.

### Security

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-SEC-1 | CORS origin is enforced | Requests from non-allowlisted origins are rejected |
| AC-SEC-2 | Security headers are applied | Response headers include security headers from middleware |
| AC-SEC-3 | API keys are encrypted at rest in MongoDB | Direct MongoDB query returns ciphertext, not plaintext |
| AC-SEC-4 | JWT tokens expire | Access token expires after `JWT_EXPIRES_IN`; refresh token after `JWT_REFRESH_EXPIRES_IN` |

---

## Information Gaps

The following could not be determined from the README alone and require direct repository inspection:

1. **Exact npm package versions** — Need `package-lock.json` / `bun.lockb` and `package.json` files.
2. **CI/CD configuration** — Need to check for `.github/workflows/`, `Dockerfile`, deployment config.
3. **Frontend test runner** — `client/src/test/` exists but the test framework is not stated (Vitest? Jest?).
4. **Linter / formatter / type-checker configuration** — Backend uses Jest; frontend has `npm run lint`. Need to inspect `.eslintrc`, `.prettierrc`, `tsconfig.json` (if TypeScript is used).
5. **Authorization model** — Whether multi-user collaboration, roles, or project sharing exists.
6. **Encryption implementation details** — Key derivation, rotation, and exact encryption service code.
7. **Rate limiting configuration** — Algorithm, limits, and storage strategy in Redis.
8. **Database schema details** — Exact Mongoose model definitions, indexes, relationships.
9. **Deployment model** — No deployment configuration is mentioned in the README.
10. **Docker configuration** — `docker-compose.yml` exists but its full service list and health checks are unknown.
