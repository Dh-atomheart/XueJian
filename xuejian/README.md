# xuejian App Workspace

This directory contains the active desktop application workspace.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Zustand
- Tauri 2
- Rust
- Python orchestration sidecar

## Main Directories

```text
xuejian/
|-- src/                     # React application
|-- src-tauri/               # Tauri host, Rust commands, SQLite migrations
|-- orchestration_service/   # Python workflows, RAG, graphs, providers, evals
|-- tests/                   # Vitest, Python unit tests, service tests, E2E tests
|-- scripts/                 # App-local CI and evaluation helpers
`-- public/                  # Static assets and fonts
```

Frontend conventions:

- Page-level modules live in `src/features/`.
- Shared UI primitives should converge toward `src/shared/ui/`.
- Existing legacy wrappers under `src/components/ui/` remain during migration.
- Data access flows through `src/queries/`, `src/services/gateway/`, and `src/store/`.

Backend conventions:

- Tauri commands and database access live under `src-tauri/src/`.
- Python orchestration entry points live in `orchestration_service/main.py` and `orchestration_service/server.py`.
- RAG and graph work should follow the current docs in `../docs/rag/`.

## Commands

```powershell
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e
npm run tauri:dev
npm run tauri:build
```

Rust check:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Python compile check from the repository root:

```powershell
python -m compileall xuejian/orchestration_service
```
