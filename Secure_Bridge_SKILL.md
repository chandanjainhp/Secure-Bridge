# Secure Bridge Project Skill

## Purpose

You are the engineering agent for the Secure Bridge repository.

Your job is to take the project from its current state to a production-ready, tested, maintainable state without blindly rewriting working code.

Secure Bridge is a React/Vite frontend with a Node.js/Express backend, MongoDB, authentication, project management, chat, BYOK API-key management, usage tracking, Docker support, and planned RAG/MCP/FHE capabilities.

The primary AI direction for the current phase is **RAG**.

MCP and OpenFHE/FHE-WASM are secondary integrations. Do not pretend they are complete when they are stubs or missing artifacts.

---

## 1. Project Context

### Frontend

- React
- Vite
- JavaScript where present
- Tailwind CSS
- shadcn/ui
- React Query
- Redux/Zustand state management where already used
- Mobile-first responsive UI

Important frontend areas:

```text
client/src/features/auth/
client/src/features/projects/
client/src/features/chat/
client/src/App.jsx
```

### Backend

- Node.js
- Express
- MongoDB
- Mongoose
- JWT authentication
- OTP/password-reset flows
- REST APIs
- Feature-based architecture

Important backend areas:

```text
server/src/features/
server/src/app.js
server/.env
```

### Current backend capabilities

- Authentication and users
- JWT auth
- OTP
- Password reset
- Project CRUD
- Project core memory
- Chat
- BYOK API-key handling
- AES-256-GCM API-key encryption
- Masked API-key display
- API-key validation
- Usage tracking
- Free-tier enforcement
- Redis configuration
- Nodemailer configuration

### Current incomplete areas

Treat these as incomplete unless repository evidence proves otherwise:

- Client-side API-key management
- Client-side usage dashboard
- FHE UI
- FHE WASM binaries/build output
- MCP production implementation
- RAG implementation
- Automated test coverage
- Production secret hardening

---

# 2. Core Engineering Rule

Never assume the repository is correct.

For every meaningful change:

```text
Inspect
→ Understand
→ Implement
→ Build
→ Test
→ Run
→ Inspect logs
→ Fix
→ Retest
→ Recheck affected features
```

Repeat the loop until:

- the project builds successfully,
- critical paths execute successfully,
- tests pass,
- no new lint/type errors are introduced,
- obvious runtime errors are resolved,
- performance regressions are not introduced.

Do not stop after changing code.

A change is not complete until it has been validated.

---

# 3. Repository Inspection First

Before making architectural changes:

1. Inspect the repository tree.
2. Inspect root package files.
3. Inspect `client/package.json`.
4. Inspect `server/package.json`.
5. Inspect Vite configuration.
6. Inspect Tailwind configuration.
7. Inspect ESLint and Prettier configuration.
8. Inspect Docker Compose and Dockerfiles.
9. Inspect server entry points.
10. Inspect client routing and application entry points.
11. Inspect existing feature modules.
12. Inspect environment examples.
13. Inspect existing tests.
14. Inspect Git status.

Do not delete working code merely because another architecture appears cleaner.

Prefer incremental refactoring.

---

# 4. Source-of-Truth Rule

Repository code is the source of truth.

README files may be stale.

Comments may be stale.

Old implementation summaries may be stale.

Before claiming a feature exists, verify:

- route exists,
- controller exists,
- service exists,
- model/schema exists where required,
- client integration exists where required,
- runtime path works,
- tests cover it or a smoke test validates it.

Never describe a stub as a completed feature.

---

# 5. Development Workflow

## Step 1 — Establish a baseline

Run the available checks before modifying code.

Typical commands:

```bash
cd server
npm install
npm test
```

```bash
cd ../client
npm install
npm run lint
npm run build
```

Also run TypeScript checks when the repository uses TypeScript:

```bash
npx tsc --noEmit
```

Do not invent scripts that do not exist.

Inspect `package.json` first.

Record baseline failures.

Separate:

- existing failures,
- failures introduced by your changes.

---

# 6. Application Startup

Prefer Docker for infrastructure.

Start MongoDB with:

```bash
docker compose up -d mongodb
```

Optionally start Mongo Express:

```bash
docker compose --profile tools up -d mongo-express
```

Backend development:

```bash
cd server
npm install
npm run dev
```

Frontend development:

```bash
cd client
npm install
npm run dev
```

Use the actual scripts found in the repository.

Do not assume a port.

Read configuration.

Verify that:

- backend starts,
- frontend starts,
- MongoDB connects,
- health endpoints respond when available,
- frontend can reach backend,
- browser console has no critical errors.

---

# 7. Self-Test Loop

After every substantial implementation, perform this sequence.

## Build

Run:

```text
frontend build
backend validation/startup
```

## Static checks

Run:

```text
lint
typecheck
tests
```

where configured.

## Runtime checks

Start the required services.

Check:

```text
application startup
database connection
authentication
protected route access
project CRUD
chat flow
API-key flow
usage enforcement
RAG flow
```

## Failure analysis

For every failure:

1. Read the complete error.
2. Identify the first meaningful failure.
3. Trace it to the responsible layer.
4. Fix the underlying cause.
5. Re-run the smallest relevant test.
6. Re-run the broader test suite.
7. Rebuild.
8. Re-check the browser/runtime.

Do not hide errors with broad exception handling.

Do not suppress lint rules simply to make checks pass.

---

# 8. Feature Completion Standard

A feature is considered complete only when all applicable layers exist.

For example:

```text
Database/model
→ service
→ controller
→ route
→ authentication/authorization
→ validation
→ frontend API call
→ frontend state
→ frontend UI
→ loading state
→ empty state
→ error state
→ success state
→ tests
```

For backend-only features, omit the frontend layer.

For frontend-only visual features, include responsive and accessibility validation.

---

# 9. Authentication Requirements

Maintain secure authentication behavior.

Validate:

- registration,
- login,
- OTP,
- password reset,
- protected routes,
- expired/invalid JWT,
- unauthorized API access,
- logout/session cleanup where implemented.

Never expose:

- passwords,
- raw API keys,
- JWT secrets,
- encryption keys,
- database credentials.

Do not log secrets.

---

# 10. BYOK API-Key Requirements

The BYOK design must remain secure.

API keys must:

- be encrypted at rest,
- use AES-256-GCM where already established,
- never be rendered in plaintext after storage,
- be masked in UI/API responses,
- never be placed in logs,
- never be committed to Git.

Validate encryption/decryption behavior.

Test invalid keys.

Test missing keys.

Test provider-specific keys.

Test usage restrictions.

Do not place provider API keys in frontend source code.

---

# 11. RAG Architecture

RAG is the primary AI enhancement for the current project phase.

Build RAG as a separate service layer.

Preferred logical pipeline:

```text
User Query
→ Query Validation
→ Query Embedding
→ Vector Retrieval
→ Relevance Filtering
→ Context Construction
→ LLM Request
→ Answer
→ Optional Citation Metadata
```

Keep the retrieval layer independent from the chat controller.

Recommended components:

```text
rag/
  ingestion/
  embedding/
  retrieval/
  context/
  generation/
```

Choose the vector database based on repository constraints.

Do not introduce a large infrastructure dependency unless it provides a clear benefit.

Support:

- document ingestion,
- chunking,
- embeddings,
- metadata,
- similarity retrieval,
- filtering,
- source references,
- configurable top-k,
- graceful empty-retrieval behavior.

Do not blindly send the entire document corpus to the model.

Limit context size.

Deduplicate retrieved chunks.

Prefer high-relevance context.

---

# 12. RAG Data Quality

Every indexed chunk should preserve useful metadata where possible:

- document ID,
- project ID,
- source,
- title,
- chunk index,
- timestamps,
- optional user/tenant ownership.

Enforce authorization during retrieval.

A user must never retrieve another user's project data.

Test cross-project isolation.

Test empty collections.

Test duplicate documents.

Test document updates/deletes.

Ensure stale embeddings can be replaced or invalidated.

---

# 13. Chat Architecture

Chat should remain modular.

Separate:

```text
UI
→ API client
→ chat controller
→ chat service
→ retrieval/orchestration
→ provider adapter
```

Do not place all provider logic in a React component.

Do not hard-code providers.

Use adapters/services when multiple LLM providers are supported.

Handle:

- loading,
- streaming if supported,
- timeout,
- provider errors,
- rate limits,
- invalid API keys,
- empty messages,
- retry behavior.

---

# 14. MCP Rules

MCP is planned/secondary.

If MCP code is currently a stub:

- keep the stub explicit,
- do not claim MCP is production-ready,
- isolate MCP code from core chat behavior,
- use feature flags,
- fail gracefully when MCP is disabled,
- add tests before enabling it by default.

Use:

```text
ENABLE_MCP=true
```

only when the required implementation and dependencies are available.

---

# 15. FHE/OpenFHE Rules

Treat FHE/OpenFHE as experimental until the real WASM artifacts exist and execute correctly.

Do not:

- claim FHE is active because a stub exists,
- silently substitute normal encryption for homomorphic encryption,
- ship empty WASM files as working FHE,
- block normal application startup because optional FHE is unavailable.

Prefer:

```text
FHE enabled
→ load real WASM
→ verify initialization
→ expose feature

FHE unavailable
→ log clear warning
→ continue normal operation
```

---

# 16. Frontend Performance

The website must load fast.

Priorities:

### Initial JavaScript

Reduce initial bundle size.

Use lazy loading for:

- project pages,
- settings,
- API-key management,
- usage dashboard,
- large chat components,
- RAG administration,
- optional MCP/FHE UI.

Use route-level code splitting.

Do not load optional features during initial page load.

### Network

Avoid duplicate requests.

Use React Query caching where appropriate.

Prefetch only when it improves the real user path.

Cancel stale requests.

Do not fetch data before it is needed.

### Rendering

Avoid unnecessary React re-renders.

Keep large message lists efficient.

Use virtualization for very large chat histories.

Memoize only where profiling shows value.

Do not blindly wrap every component in `memo`.

### Assets

Optimize:

- images,
- icons,
- fonts,
- large JSON payloads.

Use modern image formats.

Avoid shipping development-only assets.

### CSS

Keep Tailwind usage predictable.

Avoid unnecessary custom CSS.

Do not create enormous client-side style payloads.

---

# 17. Backend Performance

Keep API responses small.

Select only required MongoDB fields.

Use pagination for:

- messages,
- projects,
- documents,
- usage history,
- API-key listings.

Add indexes for real query patterns.

Do not add indexes without a query reason.

Use Redis for genuine caching/session workloads.

Avoid:

```text
N+1 database queries
```

Do not perform expensive embedding or document processing inside latency-sensitive request handlers when background processing is appropriate.

---

# 18. Database Rules

MongoDB must enforce logical data ownership.

Every user-scoped resource must be checked against the authenticated user.

Examples:

```text
userId
projectId
documentId
apiKeyId
usage records
```

Never rely only on client-supplied IDs.

Validate:

```text
user owns project
project owns document
user owns API key
```

Use appropriate MongoDB indexes.

Handle duplicate keys gracefully.

Handle missing documents with clear HTTP responses.

---

# 19. API Design

Use consistent HTTP semantics.

Typical pattern:

```text
200 OK
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
429 Too Many Requests
500 Internal Server Error
```

Do not return stack traces in production responses.

Use structured error responses.

Prefer:

```json
{
  "error": "Human-readable message",
  "code": "STABLE_MACHINE_CODE"
}
```

Avoid exposing implementation details.

---

# 20. Validation

Validate all external input.

This includes:

- request body,
- query parameters,
- path parameters,
- uploaded documents,
- provider identifiers,
- project IDs,
- document IDs.

Reject malformed input early.

Never trust frontend validation alone.

---

# 21. Testing Strategy

Build the test pyramid.

## Unit tests

Test:

- encryption helpers,
- auth utilities,
- usage calculations,
- RAG chunking,
- embedding orchestration,
- retrieval ranking/filtering,
- provider adapters,
- validation.

## Integration tests

Test:

- auth endpoints,
- project CRUD,
- API-key endpoints,
- usage endpoints,
- chat endpoints,
- RAG endpoints,
- authorization boundaries.

Use a test database or isolated test environment.

Never run destructive tests against production data.

## Frontend tests

Test:

- authentication UI,
- protected routes,
- project creation/edit/delete,
- chat interaction,
- loading states,
- error states,
- API-key masking,
- usage display,
- RAG source display where implemented.

## End-to-end smoke tests

At minimum verify:

```text
Open application
→ Register/login
→ Create project
→ Open chat
→ Send message
→ Receive response
→ Add/retrieve RAG data when configured
→ Refresh page
→ Verify authenticated state
```

---

# 22. Security Testing

Check for:

- plaintext secrets,
- API-key leakage,
- insecure CORS,
- missing authorization,
- IDOR,
- unsafe error messages,
- insecure cookies/storage,
- injection risks,
- unvalidated uploads,
- unrestricted resource access.

Never commit:

```text
.env
.env.local
real API keys
JWT secrets
encryption keys
database passwords
```

Verify `.gitignore`.

Rotate any credentials that have already been exposed.

---

# 23. Browser Verification

When browser tooling is available, verify:

### Desktop

```text
1280px+
```

### Tablet

```text
768px+
```

### Mobile

```text
320px
375px
390px
420px
```

Check:

- no horizontal overflow,
- readable text,
- usable chat input,
- keyboard interaction,
- buttons have visible states,
- loading indicators,
- empty states,
- error states,
- accessible focus states.

---

# 24. Accessibility

Use semantic HTML.

Provide:

- labels,
- keyboard navigation,
- visible focus,
- alt text,
- accessible dialog behavior,
- accessible error messages.

Do not rely only on color.

Ensure chat controls work without a mouse.

---

# 25. Performance Validation

Do not optimize from assumptions alone.

Measure first where tooling permits.

Check:

- build size,
- initial JS,
- route chunks,
- API latency,
- MongoDB query latency,
- RAG retrieval latency,
- LCP,
- CLS,
- INP.

Performance goal:

```text
Fast initial render
→ minimal blocking JavaScript
→ delayed optional features
→ cached repeated data
→ small API responses
```

Do not sacrifice security for speed.

Do not sacrifice correctness for benchmark numbers.

---

# 26. Error Handling

Errors must be actionable.

Use logs for developers.

Use safe messages for users.

Bad:

```text
MongoServerError: E11000 ...
```

Better:

```text
Project name already exists.
```

Backend logs should include enough context to diagnose failures without exposing secrets.

---

# 27. Logging

Never log:

```text
passwords
API keys
JWT tokens
encryption keys
authorization headers
```

Prefer structured logs containing:

```text
timestamp
request ID
route
status
duration
user ID where appropriate
error code
```

Use different log levels for development and production.

---

# 28. Environment Configuration

Keep environment variables documented.

Maintain:

```text
server/.env.example
```

Never require a real secret to run the basic development environment.

Provide safe mock/dev behavior where appropriate.

Separate:

```text
development
test
production
```

configuration.

---

# 29. Code Quality

Prefer small modules.

Prefer feature-based organization.

Avoid giant controllers.

Avoid giant React components.

Avoid duplicated API clients.

Avoid duplicated validation.

Avoid copy-pasted provider logic.

Use clear names.

Use comments only where they explain non-obvious behavior.

Do not rewrite unrelated files during a feature change.

---

# 30. Git Discipline

Before changing code:

```bash
git status
```

After changing code:

```bash
git diff
```

Review:

- accidental files,
- secrets,
- debug code,
- temporary files,
- generated artifacts.

Do not commit:

```text
.env
logs
node_modules
large generated binaries unless intentionally required
local databases
temporary test files
```

---

# 31. Completion Checklist

A task is complete only after this checklist passes.

```text
[ ] Requirement understood
[ ] Existing implementation inspected
[ ] Smallest correct change implemented
[ ] Backend starts
[ ] Frontend starts
[ ] Database connects
[ ] Lint passes
[ ] Typecheck passes where applicable
[ ] Unit tests pass
[ ] Integration tests pass where applicable
[ ] Build succeeds
[ ] Main user flow tested
[ ] Error states tested
[ ] Authorization tested
[ ] Secrets checked
[ ] Mobile UI checked
[ ] Performance impact checked
[ ] No unrelated regressions found
```

---

# 32. Autonomous Fix Loop

When something fails, continue the engineering loop.

```text
FAIL
↓
READ ERROR
↓
LOCATE ROOT CAUSE
↓
PATCH
↓
RUN TARGETED TEST
↓
RUN FULL TEST SUITE
↓
BUILD
↓
RUN APPLICATION
↓
SMOKE TEST
↓
PERFORMANCE CHECK
↓
PASS
```

Do not repeatedly run the same failing command without changing anything.

Do not declare success because the process starts.

Do not ignore browser/runtime failures because unit tests pass.

---

# 33. Priority Order

When fixing the project, use this priority:

1. Security
2. Data correctness
3. Authentication/authorization
4. Build/runtime failures
5. Core user flows
6. Test coverage
7. RAG correctness
8. API performance
9. Frontend performance
10. UI polish
11. Optional MCP/FHE features

Do not optimize UI while authentication is broken.

Do not optimize bundle size while the build fails.

---

# 34. RAG Phase Completion Criteria

RAG is ready to be called production-capable only when:

```text
[ ] Documents can be ingested
[ ] Documents are correctly chunked
[ ] Embeddings are generated
[ ] Embeddings are stored
[ ] Retrieval works
[ ] Project/user isolation is enforced
[ ] Relevant context reaches the model
[ ] Empty retrieval is handled
[ ] Source metadata is preserved
[ ] Retrieval errors are handled
[ ] RAG tests exist
[ ] End-to-end RAG flow works
[ ] Retrieval latency is measured
```

---

# 35. Final Reporting

At the end of every substantial task, report:

```text
Implemented:
- ...

Tested:
- ...

Passed:
- ...

Remaining:
- ...

Known limitations:
- ...
```

Never claim a test passed unless it was actually run.

Never claim a feature is complete unless its required runtime path was verified.

Never hide failures.

---

# 36. Default Engineering Principle

Make Secure Bridge:

```text
secure
→ correct
→ testable
→ modular
→ fast
→ maintainable
```

The goal is not to produce the most code.

The goal is to produce the smallest reliable system that satisfies the requirements and proves its behavior through testing.
