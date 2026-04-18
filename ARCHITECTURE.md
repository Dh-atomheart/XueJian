---
title: Repository Architecture
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# XueJian Architecture

This file is the repository-level architecture summary. Use it with [docs/references/ai-orchestration.md](./docs/references/ai-orchestration.md) for deeper runtime detail.

## Verification Commands

- Install: `cd xuejian && npm install`
- Frontend dev: `cd xuejian && npm run dev`
- Frontend build: `cd xuejian && npm run build`
- Lint: `cd xuejian && npm run lint`
- Unit tests: `cd xuejian && npm run test`
- E2E tests: `cd xuejian && npm run test:e2e`
- Tauri dev: `cd xuejian && npm run tauri:dev`
- Tauri build: `cd xuejian && npm run tauri:build`
- Rust tests: `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## System Shape

XueJian is a local-first desktop learning application:

- React + TypeScript renders the desktop UI.
- Rust + Tauri owns SQLite, Stronghold, file access, and task boundaries.
- A local Python orchestration service runs LangChain + LangGraph workflows through host-owned gateways.

## Layer Map

### TypeScript

| Layer | Path | Responsibility |
| --- | --- | --- |
| Types | `xuejian/src/types` | Shared schemas and foundational types |
| Design tokens | `xuejian/src/design-system` | Static visual tokens and surface variants |
| Lib | `xuejian/src/lib` | Reusable utilities and client-side caches |
| Services | `xuejian/src/services` | Runtime adapters, gateway wrappers, and document-processing helpers |
| Queries | `xuejian/src/queries` | TanStack Query wrappers around services |
| Store | `xuejian/src/store` | Local UI state only |
| Components | `xuejian/src/components` | Reusable shell and UI building blocks |
| Features | `xuejian/src/features` | Task-oriented screens and feature flows |
| App shell | `xuejian/src/App.tsx`, `main.tsx` | Top-level composition |

### Rust

| Layer | Path | Responsibility |
| --- | --- | --- |
| DB | `xuejian/src-tauri/src/db` | SQLite access and repository functions |
| Gateway | `xuejian/src-tauri/src/gateway` | Host-owned protocol constants plus model/tool gateway adapters |
| Secrets | `xuejian/src-tauri/src/secrets` | Stronghold-backed secret handling |
| Tasks | `xuejian/src-tauri/src/tasks` | Long-running orchestration service lifecycle |
| Commands | `xuejian/src-tauri/src/commands` | Tauri IPC boundary and outer adapter layer |
| Migrations | `xuejian/src-tauri/src/migrations` | Schema evolution |

## Dependency Rules

### Enforced TypeScript rules

- `src/types` must not depend on `features`, `services`, `queries`, `store`, or `components`.
- `src/services` must not depend on `features`.
- `src/components/ui` must not depend on `features`.
- `src/queries` may use `services`, `types`, and `lib`, but must not depend on feature or store layers.
- `src/store` must not call gateway code directly.

### Enforced Rust rules

- Any module outside `commands/` must not depend on `commands`.
- `db/` must not depend on `commands/`.
- `gateway/` must not depend on `commands/`.
- `tasks/` may depend on `gateway/` and `db/`, but not on `commands/`.

## Runtime Boundaries

- SQLite is the only source of truth for persisted application data.
- Stronghold owns secret storage; plaintext API keys must not be written to logs or SQLite.
- The Python orchestration service does not own the database or plaintext secrets.
- Model access goes through host-owned gateways, not directly from the UI.

## Canonical Docs

- Product phases: [docs/product-specs/index.md](./docs/product-specs/index.md)
- Design system: [docs/design-docs/README.md](./docs/design-docs/README.md)
- AI orchestration detail: [docs/references/ai-orchestration.md](./docs/references/ai-orchestration.md)
- Generated schema reference: [docs/generated/db-schema.md](./docs/generated/db-schema.md)
- Quality and governance: [docs/QUALITY_SCORE.md](./docs/QUALITY_SCORE.md), [docs/RELIABILITY.md](./docs/RELIABILITY.md), [docs/SECURITY.md](./docs/SECURITY.md)
