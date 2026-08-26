# Secure Bridge

Secure Bridge is a hybrid web application that provides an encrypted messaging and chat environment. The backend manages third-party LLM API keys via a secure **Bring Your Own Key (BYOK)** model, tracks API usage, supports Model Context Protocol (MCP) integrations, and leverages Fully Homomorphic Encryption (FHE) with OpenFHE compiled to WebAssembly for confidential data processing.

The project consists of:
1. **React + Vite Frontend (`client/`)** using Tailwind CSS, shadcn/ui, and React Query.
2. **Node.js + Express Backend (`server/`)** using MongoDB for primary storage, Redis for OTP caching/rate limiting, and JSON Web Token (JWT) credentials.
3. **C++ OpenFHE & Emscripten Build Setup (`server/emsdk/`, `server/fhe/`)** for compiling homomorphic encryption logic to WASM/JS wrappers.

---

## Table of Contents

- [Project Architecture & Directory Structure](#project-architecture--directory-structure)
- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database & Services Setup (Docker)](#database--services-setup-docker)
- [Running the Project Locally](#running-the-project-locally)
  - [Start Backend](#start-backend)
  - [Start Frontend](#start-frontend)
- [Homomorphic Encryption (FHE) WebAssembly Build](#homomorphic-encryption-fhe-webassembly-build)
- [Model Context Protocol (MCP) Features](#model-context-protocol-mcp-features)
- [Testing & Code Quality](#testing--code-quality)
- [Troubleshooting](#troubleshooting)

---

## Project Architecture & Directory Structure

Secure Bridge uses a hybrid structure that combines a traditional layered architecture with domain-specific feature folders (`client/src/features` and `server/src/features`) to isolate core BYOK and usage features:

```
Secure-Bridge/
├── client/                     # Frontend Application (React + Vite)
│   ├── public/                 # Static public assets
│   ├── src/                    # Source Code
│   │   ├── app/                # Global config (store, router, ErrorBoundary)
│   │   ├── features/           # Modular features
│   │   │   ├── api-key/        # BYOK management components
│   │   │   ├── auth/           # Login, registration, & OTP auth state/components
│   │   │   ├── chat/           # Conversational messaging interface
│   │   │   ├── layout/         # Persistent sidebars & panels
│   │   │   ├── profile/        # User profile configuration
│   │   │   ├── projects/       # Workspaces/Projects CRUD
│   │   │   └── usage/          # API usage visual graphs & limits
│   │   ├── pages/              # Page views matching routing paths
│   │   ├── shared/             # Global components, hooks, & API client
│   │   └── test/               # UI components test suites
│   ├── vite.config.js          # Vite build config
│   ├── tailwind.config.js      # Tailwind CSS configuration
│   └── package.json            # Frontend package details
├── server/                     # Backend API Server (Express.js)
│   ├── src/                    # Backend Source Code
│   │   ├── config/             # Connection configurations (Redis, etc.)
│   │   ├── controllers/        # General controller classes
│   │   ├── db/                 # Database initialization and connection (Mongoose)
│   │   ├── email/              # Email templates & transport setups
│   │   ├── features/           # Feature-based backend logic (api-key, chat, usage)
│   │   ├── middlewares/        # Security headers, auth verification, validation
│   │   ├── models/             # Mongoose database models (User, Project, apikey)
│   │   ├── routes/             # App Router registers (Users, Auth, Project, apiKey)
│   │   ├── services/           # Encryption services, FHE Stub, & external APIs
│   │   ├── tests/              # Jest integration/unit test suite
│   │   ├── utils/              # Response/Error helpers (ApiError, asyncHandler)
│   │   └── validation/         # Request input validation rules
│   ├── emsdk/                  # Emscripten toolchain for WebAssembly compiling
│   ├── fhe/                    # Precompiled FHE compiled binaries & scripts
│   ├── fhe-wasm/               # Precompiled FHE WASM artifacts
│   ├── openfhe-development/    # C++ OpenFHE source folder
│   └── package.json            # Backend package details
├── scripts/                    # Script helpers for dev setup
│   ├── db-up.sh                # Script to start MongoDB container
│   └── db-down.sh              # Script to tear down databases
├── docker-compose.yml          # Container configuration for MongoDB & Redis
└── README.md                   # Main Project Documentation
```

---

## Key Features

1. **Authentication**: JWT-based session security with optional One-Time Password (OTP) verification sent via Gmail SMTP.
2. **Project-based Workspaces**: Organization-level workspaces allowing different system prompts, settings, and conversation history.
3. **BYOK API-Key Caching**: Secure caching of third-party keys (OpenAI, Anthropic, Gemini, Azure) encrypted at rest using AES-256-GCM. Plaintext keys are never revealed in responses or logs.
4. **Token & Message Usage Tracking**: Free tiers with strict limits enforced by middleware, caching usage records in MongoDB/Redis.
5. **Experimental OpenFHE Support**: Fully Homomorphic Encryption (FHE) support utilizing C++ wrappers compiled to WebAssembly (fallback to a javascript `FHEStub.js` in mock environment).
6. **Model Context Protocol (MCP)**: Server integrations allowing AI models to leverage context tools (e.g. executing external calls and system diagnostics).

---

## Prerequisites

- **Node.js**: `20.x` or later recommended
- **Bun**: `1.3.x` or later (used primarily for client dependencies and Vite tooling)
- **Docker & Docker Compose**: Needed to run database services locally

---

## Environment Configuration

Configure environmental secrets before executing the services.

### Backend Configurations (`server/.env`)
Create a `.env` file under `server/` (see `server/.env.docker` or `server/.env.example` as a template):
```env
PORT=8000
NODE_ENV=development
MONGODB_URI=mongodb://admin:admin123@localhost:27017?authSource=admin
CORS_ORIGIN=http://localhost:5173

# JWT Credentials
JWT_SECRET=your_32_character_jwt_secret_here
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=your_32_character_jwt_refresh_secret_here
JWT_REFRESH_EXPIRES_IN=10d

# Cryptography
ENCRYPTION_KEY=your_base64_encoded_aes_key_here
API_KEY_ENCRYPTION_SECRET=your_api_key_encryption_secret_here

# Redis
REDIS_URL=redis://localhost:6380

# Nodemailer SMTP Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-smtp-password
```

### Frontend Configurations (`client/.env`)
Create a `.env` file under `client/`:
```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## Database & Services Setup (Docker)

We run database components inside isolated Docker containers.

1. **Start Services**:
   Start MongoDB and Redis in the background:
   ```bash
   docker compose up -d mongodb redis
   ```
   *Note: Redis is mapped to host port `6380` (container port `6379`) to avoid conflicts with native instances.*

2. **Verify Database Status**:
   You can verify MongoDB status using the convenience shell script:
   ```bash
   ./scripts/db-up.sh
   ```

3. **Optional Database Dashboard (Mongo Express)**:
   Launch the Mongo-Express visual interface:
   ```bash
   docker compose --profile tools up -d mongo-express
   ```
   Open http://localhost:8081 inside your browser to view the database collections.

4. **Shutdown Services**:
   ```bash
   ./scripts/db-down.sh
   ```

---

## Running the Project Locally

With database services running, boot up the local Node server and Vite client.

### Start Backend

1. Navigate to the server folder and install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Seed default DB collections (Optional):
   ```bash
   npm run db:seed
   ```

3. Boot the Express API Server in development mode:
   ```bash
   npm run dev
   ```
   The backend server will run on http://localhost:8000.

### Start Frontend

1. Navigate to the client folder and install dependencies:
   ```bash
   cd ../client
   npm install
   ```

2. Boot the Vite development server:
   ```bash
   npm run dev
   ```
   Open the client interface in your browser at http://localhost:5173.

---

## Homomorphic Encryption (FHE) WebAssembly Build

If you need to re-compile the C++ OpenFHE source into browser-ready WebAssembly and Javascript wrappers:

1. Setup the Emscripten Compiler Environment inside `server/emsdk/`.
2. Navigate to `server/openfhe-development/` and trigger the compiling recipe (requires `cmake` and toolchain setup).
3. The build output will output Javascript glue-code and WASM files (e.g. `openfhe_pke_es6.js` and `openfhe_pke_es6.wasm`) into `server/fhe/` and `server/fhe-wasm/`.
4. Update the server env var paths (`FHE_WASM_PATH`, `FHE_JS_PATH`) to point to these newly compiled WASM configurations.

*Note: In mock environment modes (`ENCRYPTION_MODE=mock`), the backend routes fallback gracefully to `server/src/services/FHEStub.js` without failing application startup.*

---

## Model Context Protocol (MCP) Features

To run external context operations using MCP:

1. Set `ENABLE_MCP=true` in `server/.env`.
2. Configure outbound permissions inside `OUTBOUND_ALLOWLIST` (e.g. allow weather API endpoints or localhost).
3. The model will communicate query objectives to the internal MCP helper services residing in `server/src/features/chat/services/chatService.js`.

---

## Testing & Code Quality

Run tests and style linters to verify your modifications before pushing commits.

- **Backend Jest Tests**:
  Runs database validation and API mock endpoints testing:
  ```bash
  cd server
  npm test
  ```
  Or get coverage stats:
  ```bash
  npm run test:coverage
  ```

- **Frontend Linting**:
  ```bash
  cd client
  npm run lint
  ```

---

## Troubleshooting

- **Redis Offline Warning**:
  If Redis fails to load or connect, the backend logs `Failed to connect to Redis` and logs a warning. **OTP flows will fallback automatically to local memory storage** (temporary codes will clear if the server restarts).
- **CORS Failures**:
  Ensure the `CORS_ORIGIN` variable inside `server/.env` exactly matches the local client URL (e.g. `http://localhost:5173`).
- **Database Connection Failures**:
  Verify the MongoDB URI in `server/.env`. For local docker setups, keep `MONGODB_URI=mongodb://admin:admin123@localhost:27017?authSource=admin`.
