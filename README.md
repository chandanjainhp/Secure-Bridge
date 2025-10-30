# Secure Bridge

Secure Bridge is a hybrid web application that provides an encrypted messaging/chat frontend and a backend that manages API keys, runs Model Context Protocol (MCP) helpers, and integrates homomorphic encryption (OpenFHE) via WebAssembly for secure processing. The project includes a React + TypeScript client, a Node.js/Express backend, FHE/WebAssembly artifacts, and tooling to run MCP services.

This README explains architecture, how to run the project locally (PowerShell-friendly), environment configuration, troubleshooting tips, and developer notes.

---

## Table of Contents
- Project overview
- Architecture & folders
- Prerequisites
- Quick start (dev)
  - Start backend
  - Start frontend
  - Start full system (Windows batch)
- Building for production
- Environment variables
- FHE / OpenFHE / WASM notes
- MCP (Model Context Protocol) notes
- Tests, linting and basic checks
- Troubleshooting
- Contributing
- License

---

## Project overview
Secure Bridge is designed to enable secure AI-assisted chat and MCP-based tools while protecting user data with layered encryption techniques, including an experimental integration with homomorphic encryption (OpenFHE) compiled to WebAssembly. The app has two primary surfaces:

- `client/` — React + TypeScript frontend (Vite) using Tailwind CSS and shadcn/ui-inspired components. Mobile-first responsive layouts and interactive chat UI live here.
- `server/` — Node.js backend with Express that exposes REST and MCP endpoints, manages API keys, implements authentication, and loads FHE WebAssembly assets where needed.

The repository also contains OpenFHE sources, Emscripten toolchain support (`emsdk/`), and built WASM artifacts in `fhe/` and `fhe-wasm/` used by the backend and client to perform encrypted operations.

---

## Architecture & folders (high-level)
- `client/` — React + TypeScript frontend. Run with Vite.
- `server/` — Node.js backend (Express, Mongoose, JWT auth). Server scripts and MCP implementation live here.
- `fhe/`, `fhe-wasm/`, `openfhe-development/` — OpenFHE C/C++ source and pre-built wasm/.js wrappers used by the system. The server loads `openfhe_pke_es6.wasm` and `openfhe_pke_es6.js` by default.
- `emsdk/` — Emscripten SDK for building WebAssembly from OpenFHE sources (if you need to rebuild WASM locally).
- `start_complete_system.bat` — Windows batch script to attempt launching the full stack (server + client + any helper services).
- `server/.env.example` — Example environment variables for backend. Copy it to `.env` and customize.

---

## Prerequisites
- Node.js 18.x or later (recommended)
- npm (8+) or yarn
- (Optional) Python 3.8+ and Emscripten (`emsdk`) if you plan to rebuild OpenFHE WASM from source
- MongoDB instance (URI) if you want full DB-backed features; the server can run in mock mode for local dev; see `server/.env.example`

Note: There are platform-specific files and helper scripts for building OpenFHE with Emscripten — consult the `openfhe-development/` folder and `emsdk/` if you plan to rebuild the WASM bundles.

---

## Quick start (development)
The instructions below assume you're using PowerShell (Windows). Adjust to your shell (bash/zsh) if needed.

1. Clone the repository and open a terminal at the repo root.

2. Backend

```powershell
cd server
npm install
# copy the example env (PowerShell)
Copy-Item .env.example .env
# Edit .env and fill required values (MONGO_URI, JWT_SECRET, API keys, etc.)
# Start in dev mode (nodemon)
npm run dev
```

3. Frontend

```powershell
cd ..\client
npm install
# Run the Vite dev server
npm run dev
```

4. Full system (Windows)
If present and configured, you can try the provided batch script from repo root:

```powershell
# From repository root
.\start_complete_system.bat
```

This tries to start both the server and client and any other helper processes; review the script to understand what it performs and ensure your `.env` values are set.

---

## Building for production
- Client (Vite):

```powershell
cd client
npm run build
# Preview the built client (optional)
npm run preview
```

- Server: Server uses Node directly. There is no transpile build step by default — configure as needed for TypeScript or bundling. You can run production server with environment variables set and `npm start` from `server/`.

---

## Important environment variables
The server includes a `.env.example` with the full list. Key vars you'll commonly set:
- `PORT` — server port (default `8000`) 
- `MONGO_URI` — connection string to MongoDB
- `JWT_SECRET` — authentication signing secret (minimum 32 characters in production)
- `ENCRYPTION_KEY` — symmetric key for at-rest API-key encryption (minimum length)
- LLM/API keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `AZURE_OPENAI_API_KEY`, etc.
- `ENABLE_MCP` — `true` / `false` to enable MCP features
- OpenFHE paths (if used): `FHE_WASM_PATH`, `FHE_JS_PATH` — by default point to `../fhe/openfhe_pke_es6.wasm` and `../fhe/openfhe_pke_es6.js` in `server/.env.example`

Always keep secrets out of source control. Use a secrets manager for production deployments.

---

## FHE / OpenFHE / WASM notes
- Pre-built WASM and JS wrappers are available in the repository under `fhe/` and `fhe-wasm/`.
- If you need to rebuild OpenFHE to WebAssembly, use the `emsdk/` toolchain. Rebuilding OpenFHE from source is advanced and platform-specific — see `openfhe-development/` and the `emsdk` README.
- The server will load the FHE JS/WASM assets if `FHE_WASM_PATH` and `FHE_JS_PATH` point to valid files. In development you may set those paths relative to the `server/` directory.

---

## MCP (Model Context Protocol) notes
- MCP-related logic lives under `server/src/mcp` and related MCP helper files. See `server/MCP_IMPLEMENTATION_SUMMARY.md` for a design summary.
- Enable MCP with `ENABLE_MCP=true` in the server `.env`. Some MCP features rely on external data sources and may require additional API keys (e.g., weather, Gemini/Google keys).
- A small test harness `server/test-mcp-endpoint.js` exists to validate the MCP server.

---

## Tests, linting and checks
- Server tests: `cd server && npm test`
- Client lint: `cd client && npm run lint` (client has `eslint` configured)
- Run TypeScript checks where applicable: install `typescript` in the folder and run `tsc --noEmit` (if TypeScript sources present)

---

## Troubleshooting (common issues)
- MongoDB connection errors: ensure `MONGO_URI` is valid and network access (Atlas IP whitelist) allows your host. If you see `option buffermaxentries is not supported` in logs, try removing deprecated options from the connection string or update driver versions.
- Missing FHE WASM: The server expects `FHE_WASM_PATH` to point to a `.wasm` file. If you see file-not-found errors, set the env var to the correct path or copy the prebuilt files from `fhe/`.
- MCP not starting: Check `ENABLE_MCP` and the `server` logs. Some MCP components are optional and the server may continue without MCP if a module fails to initialize.
- Dev server port collisions: change `PORT` in `server/.env` or the Vite port in `client/vite.config.*`.
- Secrets in `.env`: Do not commit your `.env`. Use `.env.example` as a template.

---

## Developer notes & tips
- Frontend is mobile-first using Tailwind CSS; many components use utility classes tuned for small breakpoints. If you modify layout components, check both narrow (320–420px) and wide screens.
- The repository includes a number of experimental and research folders (`openfhe-development`). Only rebuild these if you need to modify FHE internals — rebuilding typically requires Emscripten and significant build time.
- Logging and health checks: The server writes logs to `server/logs/`; use these to debug startup and MCP issues.

---

## Contributing
Contributions are welcome. Follow these steps:
1. Create an issue describing your change/bug
2. Create a feature branch off `main` or `dev` (project convention)
3. Run tests and linting locally
4. Open a PR with a clear description and testing steps

Please keep security in mind when changing how API keys or secrets are handled.

---

## License
This project is provided under the MIT License. See `LICENSE` for details.

---

If you'd like, I can also:
- Add a `client/README.md` and `server/README.md` with folder-specific commands
- Create `.env.example` copies or helper PowerShell scripts for local setup
- Run the client build and server start in this environment to validate (I will need permission to run terminal commands)

If you want any of those, tell me which and I'll add them next.