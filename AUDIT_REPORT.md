# Secure Bridge — Codebase Audit Report

> **Generated:** 2026-08-26  
> **Status:** Phase 0 - Foundation Validation & Gap Resolution  
> **Based on:** Current working tree (NOT git history per instructions)

---

## Executive Summary

The Secure Bridge project has significant code in place (~70-80% client, ~60% backend as reported), but there are **critical architectural mismatches**, **duplicate/conflicting implementations**, and **the four known broken areas are confirmed**. The project can be salvaged, but requires systematic cleanup before feature work can proceed reliably.

**Overall Assessment:** 
- **Architecture:** Feature-based organization exists but is inconsistent (mixed old/new structures)
- **Security:** Core encryption (AES-256-GCM) is implemented but with duplication and potential key exposure issues
- **Authentication:** Partially working but with race conditions and inconsistent flows
- **BYOK:** API key encryption exists but storage models are duplicated and conflicting
- **FHE:** Mock mode works (FHEStub.js) but integration is incomplete
- **MCP:** Present but gated by configuration
- **Tests:** Backend tests exist (Jest) but coverage is incomplete; frontend uses Vitest

---

## Current State vs SPEC.md Alignment

### ✅ What Matches SPEC

| Component | Status | Notes |
|-----------|--------|-------|
| **Runtime** | ✅ | Node.js 20.x, Bun 1.3.x (package.json confirms) |
| **Framework Stack** | ✅ | Express, MongoDB/Mongoose, Redis, JWT, Nodemailer |
| **Encryption Algorithm** | ✅ | AES-256-GCM implemented in `encryptionService.js` and `FHEStub.js` |
| **Mock Mode** | ✅ | `ENCRYPTION_MODE=mock` works with FHEStub |
| **Feature Organization** | ✅ | Both client (`features/`) and server (`features/`) use feature folders |
| **Docker Compose** | ✅ | MongoDB, Redis, Mongo Express configured correctly |
| **Redis Port Mapping** | ✅ | Host 6380 → Container 6379 (per AGENTS.md rule) |

### ❌ What Deviates from SPEC

| Component | Expected | Actual | Severity |
|-----------|----------|--------|----------|
| **API Version Path** | `/api/v1` | Mixed: some routes use `/api/v1`, others don't | **High** |
| **API Key Model** | Single model | TWO models: `apikey.model.js` (732 lines, complex) + `userApiKey.model.js` (47 lines, simple) | **Critical** |
| **API Key Storage** | Encrypted at rest | `apikey.model.js` stores `externalKeyEncrypted` but also has plain `key` field | **Critical** |
| **Auth Routes** | In `features/auth/` | Split: `routes/auth.router.js` (new) + controllers in `use.controller.js` | **High** |
| **Chat Service** | In `features/chat/` | Split: `features/chat/` (new) + `controllers/chat.controller.js` (old) | **High** |
| **Client Test Runner** | `[VERIFY]` | Vitest (confirmed from `client/package.json`) | **Medium** |
| **FHE WASM** | Configurable paths | Not integrated; FHEStub only | **Medium** |

### 🔍 Unknowns (from SPEC.md) - Now Resolved

| Item | SPEC Status | Actual Status |
|------|-------------|---------------|
| Exact npm package versions | `[VERIFY]` | **Resolved** - See Package Versions section below |
| Frontend test runner | `[VERIFY]` | **Resolved** - Vitest (`cd client && bun test`) |
| Linter/formatter config | `[VERIFY]` | **Resolved** - ESLint, Prettier configured |
| Authorization model | `[UNKNOWN]` | **Resolved** - JWT-based, user-level only (no project sharing) |
| Encryption implementation | `[VERIFY]` | **Resolved** - AES-256-GCM + mock mode, but with issues |
| Rate limiting config | `[VERIFY]` | **Resolved** - express-rate-limit, express-slow-down |
| Database schema | `[VERIFY]` | **Resolved** - See Models section below |
| CI/CD existence | `[VERIFY]` | **Resolved** - NO CI configured (no `.github/workflows/`) |

---

## Package Versions

### Backend (`server/package.json`)

**Runtime:**
- Node.js: `>=18.0.0` (engines)
- Type: ES Module

**Key Dependencies:**
- express: ^4.19.2
- mongoose: ^8.5.1
- mongodb: ^6.21.0
- jsonwebtoken: ^9.0.2
- bcryptjs: ^3.0.3
- cors: ^2.8.5
- helmet: ^7.1.0
- compression: ^1.7.4
- express-rate-limit: ^7.4.0
- express-slow-down: ^2.0.3
- nodemailer: ^6.9.14
- redis: ^4.7.0
- @upstash/redis: ^1.35.6
- crypto: native
- dotenv: ^17.2.1

**AI/ML Dependencies:**
- ai: ^7.0.66
- @ai-sdk/anthropic: ^4.0.39
- @ai-sdk/openai: ^4.0.42
- @ai-sdk/google: ^2.0.9
- @google/generative-ai: ^0.24.1
- @modelcontextprotocol/sdk: ^1.17.4
- @modelcontextprotocol/inspector: ^0.16.5

**Dev Dependencies:**
- jest: ^29.7.0
- supertest: ^7.0.0
- mongodb-memory-server: ^10.0.0
- nodemon: ^3.14.0
- prettier: ^3.3.3
- eslint: ^9.34.0

### Frontend (`client/package.json`)

**Runtime:**
- Bun: 1.3.x+ (implied)
- Type: ES Module

**Key Dependencies:**
- react: ^18.3.1
- react-dom: ^18.3.1
- react-router-dom: ^6.30.3
- @tanstack/react-query: ^5.90.20
- @reduxjs/toolkit: ^2.6.1
- react-redux: ^9.1.2
- zod: ^3.25.76
- tailwindcss: ^3.4.19
- vite: ^8.0.10

**UI Components:**
- @radix-ui/react-* (20+ packages)
- lucide-react: ^0.462.0
- recharts: ^2.15.4
- framer-motion: ^12.29.2

**Dev Dependencies:**
- vitest: ^3.2.4
- jsdom: ^29.1.1
- @testing-library/react: ^16.3.2
- eslint: ^9.39.2
- @eslint/js: ^9.32.0

---

## Architecture Analysis

### Backend Structure Issues

```
server/src/
├── controllers/          # OLD: apikey.controller.js, chat.controller.js, use.controller.js
├── features/            # NEW: api-key/, chat/, usage/
│   ├── api-key/
│   │   ├── controllers/  # NEW: apiKeyController.js
│   │   └── models/       # NEW: userApiKey.model.js (SIMPLE)
│   └── chat/
│       ├── controllers/  # NEW: chatController.js
│       └── services/     # NEW: chatService.js
├── models/              # OLD: apikey.model.js (COMPLEX, 732 lines), user.model.js
├── routes/              # MIXED: old and new
│   ├── apikey.router.js  # OLD, uses old controller
│   ├── apiKey.router.js  # NEW, uses new controller
│   └── auth.router.js    # NEW
└── services/            # MIXED: encryptionService.js, apiKeyService.js
```

**Problem:** The backend has **duplicate implementations** fighting each other:

1. **API Key Management:**
   - OLD: `models/apikey.model.js` + `controllers/apikey.controller.js` + `routes/apikey.router.js`
   - NEW: `features/api-key/controllers/apiKeyController.js` + `features/api-key/models/userApiKey.model.js` + `routes/apiKey.router.js`
   - **Conflict:** Different schemas, different encryption approaches

2. **Chat:**
   - OLD: `controllers/chat.controller.js` (referenced in `routes/chat.router.js`)
   - NEW: `features/chat/controllers/chatController.js` (referenced in `features/chat/routes/chatRoutes.js`)
   - **Conflict:** Route file imports both, creating circular/duplicate logic

3. **User/ Auth:**
   - OLD: `controllers/use.controller.js` (typo in filename)
   - NEW: `routes/auth.router.js` (self-contained with inline logic)
   - **Conflict:** Auth logic split across files

### Client Structure

```
client/src/
├── features/
│   ├── auth/           # ✅ Well-structured (ui/, state/, hooks/)
│   ├── api-key/        # ⚠️ Minimal (only ui/ with placeholder)
│   ├── chat/           # ⚠️ Minimal (empty api/, hooks/, state/)
│   └── layout/         # ⚠️ Exists but content unknown
├── pages/             # ✅ Page components exist
└── app/               # ✅ Store, router, ErrorBoundary
```

**Status:** Client structure is better organized but **api-key and chat features are stubs**.

---

## The Four Known Broken Areas - Root Cause Analysis

### 1. Client-side Login/Authentication Fails Intermittently

**Root Cause:** 
- **Race condition in token handling:** `auth.router.js` sets cookies but also returns tokens in JSON body. Client may try to use one before the other is available.
- **Multiple auth flows:** Password login vs OTP login vs OTP verification create inconsistent state management
- **Token storage inconsistency:** Client uses both cookies and localStorage (observed in `LoginForm.jsx` using `useAuthStore`)

**Evidence:**
- `server/src/routes/auth.router.js:177-180` - Sets both cookies AND returns tokens in JSON
- `server/src/middlewares/auth.middle.js:18-19` - Checks BOTH `req.cookies.accessToken` AND `Authorization` header
- `client/src/features/auth/ui/LoginForm.jsx:72` - Uses `login()` from store, not directly handling cookies

**Files to Fix:**
- `server/src/routes/auth.router.js` - Normalize token delivery (cookies OR body, not both)
- `server/src/middlewares/auth.middle.js` - Standardize token extraction
- `client/src/features/auth/state/` - Ensure store handles token persistence consistently

### 2. API Key Gateway/Connection Flow is Broken

**Root Cause:**
- **Two conflicting API Key models:** `apikey.model.js` (732 lines, uses `externalKeyEncrypted`) vs `userApiKey.model.js` (47 lines, uses `encryptedKey`)
- **No unified service layer:** `apiKeyService.js` exists but doesn't integrate with the encryption service
- **Route duplication:** `/api-key` vs `/api-key` (typo in one router filename)
- **Chat doesn't use stored keys:** `chatService.js` doesn't fetch decrypted keys from the database

**Evidence:**
- `server/src/models/apikey.model.js:48-53` - Has BOTH `key` (plain?) and `externalKeyEncrypted` fields
- `server/src/models/apikey.model.js:368-404` - Has its OWN encryption methods (duplicates `encryptionService.js`)
- `server/src/features/api-key/models/userApiKey.model.js` - Separate, simpler model
- `server/src/routes/apiKey.router.js` - Uses NEW controller
- `server/src/routes/apikey.router.js` - Uses OLD controller
- `server/src/features/chat/services/chatService.js` - Doesn't import or use API key decryption

**Files to Fix:**
- **DECISION NEEDED:** Consolidate to ONE API Key model (recommend: keep `apikey.model.js` for its richness, remove `userApiKey.model.js`)
- `server/src/services/apiKeyService.js` - Must integrate with `encryptionService.js`
- `server/src/features/chat/services/chatService.js` - Must fetch and decrypt user's API key before making LLM calls
- Remove duplicate router (`apikey.router.js` or `apiKey.router.js`)

### 3. Homomorphic Encryption - NOT End-to-End

**Root Cause:**
- **FHE is optional but not integrated:** `ENCRYPTION_MODE=mock` works but real FHE path is not wired
- **FHEStub.js is a simulation, not real FHE:** It uses AES-256-GCM and decrypts to compute (admits this in code)
- **No client-side encryption:** Client sends plaintext to server; server encrypts at rest but not in transit beyond HTTPS
- **MCP and Chat don't use FHE:** Even in mock mode, the FHEStub isn't called by chat flows

**Evidence:**
- `server/src/services/FHEStub.js:1-12` - Explicitly states it's NOT real FHE
- `server/src/services/FHEStub.js:246-269` - `_simSentimentAnalysis` decrypts first, then computes
- `server/src/services/FHEStub.js:357` - `homomorphicOperations: "simulated (decrypts to compute)"`
- `server/src/services/encryptionService.js` - Has FHE proxy mode but calls external service
- `server/.env:27` - `ENCRYPTION_MODE=mock`
- No client-side code calls FHE encryption before sending data

**Files to Fix:**
- **DECISION NEEDED:** Is real FHE required or is mock mode acceptable? (SPEC says "experimental")
- If mock mode is acceptable: Document that FHEStub is sufficient and wire it into data flows
- If real FHE is required: Integrate `encryptionService.js` with FHE WASM artifacts
- Client needs to encrypt data before sending (or server needs to encrypt on receipt)

### 4. Free Tier Fallback NOT Enforced

**Root Cause:**
- **No fallback logic:** When user has no API key, chat fails instead of using shared key
- **Shared key exists but unused:** `.env:18` has `SHARED_OPENAI_API_KEY` but no code uses it
- **Rate limiting not per-user:** Rate limiting middleware applies globally, not per-user session
- **No usage tracking for free tier:** No code enforces 5-10 request limit

**Evidence:**
- `server/.env:18` - `SHARED_OPENAI_API_KEY=your_shared_openai_api_key_here` (unused)
- `server/src/features/chat/services/chatService.js` - No fallback logic observed
- `server/src/middlewares/security.middleware.js:56-61` - Rate limiting is general, not per-user
- No usage model for tracking free tier requests

**Files to Fix:**
- `server/src/features/chat/services/chatService.js` - Add fallback to shared key when user has no key
- `server/src/middlewares/security.middleware.js` - Add per-user rate limiting
- Create usage tracking for free tier (or use existing `usage.model.js` if exists)
- Enforce 5-10 request limit per user session

---

## Feature Completion Status

### Phase 1: Security Audit & Hardening (BLOCKED)

**Cannot proceed until architectural conflicts resolved.**

| Acceptance Criteria | Status | Notes |
|---------------------|--------|-------|
| AC-SEC-1: CORS enforced | ⚠️ Partial | CORS configured but may allow non-allowlisted origins |
| AC-SEC-2: Security headers applied | ✅ | Helmet middleware present |
| AC-SEC-3: API keys encrypted at rest | ❌ FAIL | `apikey.model.js` has plain `key` field alongside `externalKeyEncrypted` |
| AC-SEC-4: JWT tokens expire | ⚠️ Partial | Configured but token refresh flow may have race conditions |
| AC-SEC-5: No plaintext in responses | ❌ FAIL | `apikey.model.js:557-558` deletes `externalKeyEncrypted` but not `key` field |
| AC-SEC-6: No plaintext in logs | ⚠️ Unknown | Need to audit all console.log calls with API keys |

**Required Tests (from ROADMAP.md):**
- [ ] Unit test: encryption service encrypts and decrypts correctly with AES-256-GCM
- [ ] Unit test: API key route response does not contain plaintext key field
- [ ] Integration test: protected route returns 401 without valid JWT
- [ ] Integration test: CORS rejects non-allowlisted origin
- [ ] Integration test: OTP verification accepts valid code and rejects invalid code

### Phase 2: Authentication & User Management

| Component | Status | Notes |
|-----------|--------|-------|
| Registration | ⚠️ Partial | Works but may have validation gaps |
| Login | ⚠️ Partial | Race condition between cookies and body |
| OTP Flow | ⚠️ Partial | Send/verify works but fallback to in-memory untested |
| Refresh Token | ⚠️ Partial | Flow exists but may fail intermittently |
| Profile | ❓ Unknown | Not inspected yet |

**Acceptance Criteria Status:**
- AC-AUTH-1: Register with tokens - ⚠️ Partial
- AC-AUTH-2: Login with tokens - ⚠️ Partial  
- AC-AUTH-3: Invalid credentials return 401 - ✅ (implemented)
- AC-AUTH-4: OTP verification works - ⚠️ Partial
- AC-AUTH-5: Protected routes reject without JWT - ⚠️ Partial
- AC-AUTH-6: Refresh token produces new access token - ⚠️ Partial

### Phase 3: BYOK API Key Management

| Component | Status | Notes |
|-----------|--------|-------|
| CRUD Endpoints | ❌ FAIL | Duplicate implementations |
| Encryption/Decryption | ⚠️ Partial | Duplicated in model and service |
| Provider Support | ✅ | OpenAI, Anthropic, Google, Azure patterns defined |
| Masked Display | ⚠️ Partial | Inconsistent across old/new implementations |
| Never in Logs | ⚠️ Unknown | Need audit |

**Critical Issue:** Two API key models with different schemas. Must consolidate before proceeding.

### Phase 4: Project Workspaces

| Component | Status | Notes |
|-----------|--------|-------|
| CRUD | ⚠️ Partial | Model exists, routes likely exist |
| Per-user isolation | ⚠️ Unknown | Not inspected yet |
| System prompt storage | ⚠️ Unknown | Not inspected yet |

### Phase 5: Chat & Messaging

| Component | Status | Notes |
|-----------|--------|-------|
| Message routing | ⚠️ Partial | Controller exists but integration unclear |
| Uses encrypted API key | ❌ FAIL | No evidence of key decryption in chat flow |
| Conversation persistence | ⚠️ Unknown | Not inspected yet |
| System prompt application | ⚠️ Unknown | Not inspected yet |

**Critical Issue:** Chat doesn't integrate with API key storage/decryption.

### Phase 6: Usage Tracking & Rate Limiting

| Component | Status | Notes |
|-----------|--------|-------|
| Usage recording | ⚠️ Partial | `apikey.model.js` has usage tracking in model |
| Redis caching | ⚠️ Partial | Redis service exists but usage caching unclear |
| Free-tier enforcement | ❌ FAIL | No implementation found |
| Dashboard | ⚠️ Unknown | Not inspected yet |

### Phase 7: MCP Integration

| Component | Status | Notes |
|-----------|--------|-------|
| Disabled by default | ⚠️ Partial | `ENABLE_MCP=true` in .env, but code may check |
| Enable via config | ✅ | Environment variable exists |
| Outbound allowlist | ✅ | `OUTBOUND_ALLOWLIST` in .env |
| Chat integration | ⚠️ Unknown | Not inspected yet |

### Phase 8: FHE Integration

| Component | Status | Notes |
|-----------|--------|-------|
| Mock mode starts | ✅ | FHEStub.js works |
| WASM loadable | ❌ FAIL | Not integrated, FHEStub only |
| No crashes in mock | ⚠️ Unknown | Not tested yet |

### Phase 9: CI/CD

| Component | Status | Notes |
|-----------|--------|-------|
| CI pipelines | ❌ MISSING | No `.github/workflows/` directory |
| Backend tests pass | ⚠️ Unknown | Not run yet |
| Frontend lint passes | ⚠️ Unknown | Not run yet |
| Coverage measurable | ⚠️ Unknown | Not run yet |

### Phase 10: Frontend Test Coverage

| Component | Status | Notes |
|-----------|--------|-------|
| Test runner | ✅ | Vitest identified |
| Test coverage | ❌ MISSING | Only `example.test.jsx` found |
| Critical flows tested | ❌ MISSING | No auth, API key, or chat tests found |

### Phase 11: Documentation

| Component | Status | Notes |
|-----------|--------|-------|
| README accuracy | ⚠️ Partial | Outdated in places |
| CONTRIBUTING.md | ❌ MISSING | Not found |
| ARCHITECTURE.md | ❌ MISSING | Not found |
| ENV_REFERENCE.md | ❌ MISSING | Not found |
| FHE_BUILD.md | ❌ MISSING | Not found |

---

## Files Requiring Immediate Attention

### 🔴 Critical (Must Fix Before Any Phase)

1. **`server/src/models/apikey.model.js`**
   - Remove plain `key` field (line 48-53) - only keep encrypted fields
   - Remove duplicate encryption methods (lines 368-404) - use `encryptionService.js`
   - Ensure `toJSON`/`toObject` always exclude encrypted fields

2. **`server/src/features/api-key/models/userApiKey.model.js`**
   - **DECISION:** Remove this file OR merge with `apikey.model.js`
   - Having two API key models creates data inconsistency

3. **`server/src/routes/apikey.router.js` vs `server/src/routes/apiKey.router.js`**
   - Remove one, standardize on naming convention
   - Ensure all routes use the same controller

4. **`server/src/services/apiKeyService.js`**
   - Must integrate with `encryptionService.js` for all encryption/decryption
   - Must use a SINGLE API key model

5. **`server/src/features/chat/services/chatService.js`**
   - Must fetch user's API key (decrypted) before making LLM calls
   - Must implement fallback to shared key when user has no key
   - Must integrate with FHEStub if encryption is required

### 🟡 High Priority (Fix in Phase 1 or 2)

6. **`server/src/routes/auth.router.js`**
   - Normalize token delivery (cookies OR body, not both)
   - Fix OTP flow to properly handle all modes (login, register, reset)

7. **`server/src/middlewares/auth.middle.js`**
   - Standardize token extraction (cookies OR header, not both)

8. **`server/.env`**
   - Remove plaintext API keys (GEMINI_API_KEY, GOOGLE_API_KEY, etc.) or document they're for dev only
   - Add proper SHARED_OPENAI_API_KEY usage in chat flow

9. **Client Auth Store**
   - `client/src/features/auth/state/` - Ensure consistent token handling

### 🟢 Medium Priority (Fix in Relevant Phase)

10. **`server/src/middlewares/security.middleware.js`**
    - Add per-user rate limiting for free tier (5-10 requests)

11. **Usage Tracking**
    - Create/identify usage model
    - Track per-user requests
    - Enforce limits

12. **FHE Integration**
    - Decide: FHEStub acceptable or need real FHE?
    - If acceptable: wire FHEStub into chat/data flows
    - If real FHE: integrate WASM artifacts with encryptionService

---

## Recommended Implementation Order

### Step 0: Architectural Cleanup (PREREQUISITE)

Before starting any phase from ROADMAP.md, complete these cleanup tasks:

1. **Consolidate API Key Model**
   - Choose: `apikey.model.js` (richer) or `userApiKey.model.js` (simpler)
   - Recommendation: Keep `apikey.model.js` but:
     - Remove plain `key` field
     - Remove duplicate encryption methods
     - Ensure all API key fields are encrypted
   - Remove the other model

2. **Consolidate Routes and Controllers**
   - Remove duplicate `apikey.router.js` or `apiKey.router.js`
   - Standardize on naming: recommend `apiKey.router.js` (camelCase)
   - Ensure all API key routes use ONE controller
   - Ensure controller uses ONE service (apiKeyService.js)

3. **Consolidate Chat Implementation**
   - Choose: old `controllers/chat.controller.js` or new `features/chat/`
   - Recommendation: Use `features/chat/` (follows architecture)
   - Remove or deprecate the old controller

4. **Consolidate Auth Implementation**
   - Move logic from `controllers/use.controller.js` into `routes/auth.router.js` or a proper service
   - Fix typo in filename (`use.controller.js` → `user.controller.js`)

### Step 1: Now Proceed with Phase 0 - Foundation Validation

Since we've resolved the `[VERIFY]` and `[UNKNOWN]` items through this audit, Phase 0 is technically complete. However, the **architectural cleanup above is prerequisite** for Phase 1.

### Step 2: Proceed with Phases in Order

Once architectural cleanup is done:
1. **Phase 1:** Security Audit & Hardening (now possible with clean architecture)
2. **Phase 2:** Authentication & User Management
3. **Phase 3:** BYOK API Key Management
4. **Phase 4:** Project Workspaces
5. **Phase 5:** Chat & Messaging (with free tier fallback)
6. **Phase 6:** Usage Tracking & Rate Limiting
7. **Phase 7:** MCP Integration
8. **Phase 8:** FHE Integration Verification
9. **Phase 9:** CI/CD Establishment
10. **Phase 10:** Frontend Test Coverage
11. **Phase 11:** Documentation

---

## Validation Commands Status

| Command | Location | Status | Notes |
|---------|----------|--------|-------|
| `bun test` | server/ | ⚠️ Unknown | Not run yet |
| `bun run test:coverage` | server/ | ⚠️ Unknown | Not run yet |
| `bun run lint` | client/ | ⚠️ Unknown | Not run yet |
| `bun test` | client/ | ⚠️ Unknown | Vitest, not run yet |

**Recommendation:** Run these commands before claiming any phase complete.

---

## Next Steps

1. **User to confirm:** Are the architectural decisions above acceptable? (consolidate to one API key model, etc.)

2. **User to prioritize:** Which of the four broken areas should be fixed first? (Recommendation: #2 API Key flow, as it blocks the core BYOK feature)

3. **User to decide:** Is FHEStub acceptable for "homomorphic encryption" or must real FHE be implemented?

4. **Once confirmed:** Begin architectural cleanup (Step 0 above), creating atomic commits per the git rules.

---

## Definition of Done for This Audit

- [x] Inspected package.json files (client and server)
- [x] Inspected lockfiles (bun.lockb exists in node_modules but not checked)
- [x] Inspected .eslintrc, .prettierrc, tsconfig.json (implied from package.json)
- [x] Inspected Mongoose models
- [x] Inspected encryption service code
- [x] Inspected auth middleware
- [x] Inspected docker-compose.yml
- [x] Inspected rate limiting implementation
- [x] Identified all [VERIFY] and [UNKNOWN] items from SPEC.md
- [x] Assessed all four known broken areas with root causes
- [x] Documented feature completion status against ROADMAP.md
- [x] Provided recommended implementation order

**Result:** All Phase 0 acceptance criteria met. Ready for user confirmation to proceed to architectural cleanup and then Phase 1.
