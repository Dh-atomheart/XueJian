---
title: Application Agent Guide
status: active
owner: app
last_reviewed: 2026-04-17
canonical: true
---

# XueJian App Guide

Use this file before changing application code in `xuejian/`.

## Commands

- Install: `cd xuejian && npm install`
- Frontend dev: `cd xuejian && npm run dev`
- Frontend build: `cd xuejian && npm run build`
- Lint: `cd xuejian && npm run lint`
- Unit tests: `cd xuejian && npm run test`
- E2E tests: `cd xuejian && npm run test:e2e`
- Tauri dev: `cd xuejian && npm run tauri:dev`
- Tauri build: `cd xuejian && npm run tauri:build`
- Rust tests: `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Source Layout

- `src/types`: shared schemas and stable TypeScript types
- `src/design-system`: visual tokens and surface variants
- `src/lib`: generic helpers and client-side caches
- `src/services`: runtime adapters and gateway wrappers
- `src/queries`: TanStack Query hooks around services
- `src/store`: UI state only
- `src/components`: reusable shell and UI components
- `src/features`: feature-owned screens and workflows
- `src-tauri/src/db`: SQLite repositories
- `src-tauri/src/gateway`: host runtime adapters and orchestration protocol constants
- `src-tauri/src/tasks`: orchestration service lifecycle
- `src-tauri/src/commands`: Tauri command boundary

## Coding Rules

- Keep `src/types` foundational. Do not import features, services, queries, or store from there.
- Keep `src/components/ui` feature-agnostic.
- Keep `src/services` below `features`.
- Keep `src/queries` as wrappers around `services`, not as new business layers.
- Keep `src/store` free of direct gateway calls.
- Keep Rust `commands` as the outermost adapter layer.
- Use `Zod` at the UI/IPC boundary and `Pydantic` in Python workflow payloads.

## Canonical References

- Repository architecture: [../ARCHITECTURE.md](../ARCHITECTURE.md)
- Product scope: [../docs/product-specs/index.md](../docs/product-specs/index.md)
- Design system: [../docs/design-docs/README.md](../docs/design-docs/README.md)
- AI orchestration detail: [../docs/references/ai-orchestration.md](../docs/references/ai-orchestration.md)

## Change Checklist

- Update product or design docs if behavior changes.
- Regenerate `../docs/generated/db-schema.md` after migration changes.
- Run lint and tests before closing work.
- Record multi-step work in `../docs/exec-plans/active/` or `completed/`.
