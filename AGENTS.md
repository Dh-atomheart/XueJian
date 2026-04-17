---
title: Repository Agent Guide
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# XueJian Repository Guide

This repository follows a harness-engineering layout: small entry maps, stable canonical docs, and mechanical checks.

## Start Here

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for layer boundaries and dependency rules.
2. Read [docs/README.md](./docs/README.md) for the documentation system of record.
3. Read [xuejian/AGENTS.md](./xuejian/AGENTS.md) before changing app code.
4. Read [docs/AGENTS.md](./docs/AGENTS.md) before editing specs, references, or design docs.

## Commands

Run commands from the repository root unless the command already changes directory.

- Install: `cd xuejian && npm install`
- Frontend dev: `cd xuejian && npm run dev`
- Frontend build: `cd xuejian && npm run build`
- Lint: `cd xuejian && npm run lint`
- Unit tests: `cd xuejian && npm run test`
- E2E tests: `cd xuejian && npm run test:e2e`
- Tauri dev: `cd xuejian && npm run tauri:dev`
- Tauri build: `cd xuejian && npm run tauri:build`
- Rust tests: `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`
- Docs validation: `python scripts/docs/validate.py`
- Architecture validation: `python scripts/docs/check_architecture.py`
- Regenerate DB schema: `python scripts/docs/generate_db_schema.py`
- Run doc gardening: `python scripts/docs/garden.py`
- Preflight (all checks): `python scripts/docs/preflight.py`

## Canonical Sources

- Product scope and phase boundaries: [docs/product-specs/index.md](./docs/product-specs/index.md)
- MVP requirements: [docs/product-specs/mvp.md](./docs/product-specs/mvp.md)
- Future phases: [docs/product-specs/v2.md](./docs/product-specs/v2.md), [v3.md](./docs/product-specs/v3.md), [v4.md](./docs/product-specs/v4.md)
- Architecture summary: [ARCHITECTURE.md](./ARCHITECTURE.md)
- AI orchestration details: [docs/references/ai-orchestration.md](./docs/references/ai-orchestration.md)
- Design system and page rules: [docs/design-docs/README.md](./docs/design-docs/README.md)
- Delivery plans and debt tracking: [docs/exec-plans/](./docs/exec-plans/)
- Reliability and security: [docs/RELIABILITY.md](./docs/RELIABILITY.md), [docs/SECURITY.md](./docs/SECURITY.md)
- Quality tracking: [docs/QUALITY_SCORE.md](./docs/QUALITY_SCORE.md)

## Working Rules

- Keep `AGENTS.md` files as maps, not as giant policy dumps.
- Treat `docs/product-specs/*` and `docs/design-docs/*` as the long-lived truth.
- Put task-specific implementation detail in `docs/exec-plans/active/` or `completed/`, not back into product specs.
- Do not promote archived material back into the main navigation.
- Generated files belong in `docs/generated/` and must be updated by script.

## Architecture Invariants

- TypeScript runtime access flows through `services/`, then `queries/`.
- `store/` owns UI state only and must not call gateways directly.
- `components/ui/` stays reusable and must not depend on feature modules.
- `types/` stays foundational and must not depend on feature, query, service, or store layers.
- Rust `commands/` is the outer adapter layer; lower layers must not depend on it.
- Python orchestration does not own secrets or the primary data store.

## Documentation Workflow

- New or updated canonical Markdown files must include frontmatter with `title`, `status`, `owner`, `last_reviewed`, and `canonical`.
- Update command lists in `README.md`, `AGENTS.md`, and `ARCHITECTURE.md` whenever `xuejian/package.json` scripts change.
- If you add or modify SQL migrations, regenerate `docs/generated/db-schema.md`.
- Record multi-step implementation work in `docs/exec-plans/active/`.

## Agent Tooling

- Repo-local skills live under `.claude/skills/` and `.codex/skills/`.
- Windsurf workflows live under `.windsurf/workflows/`.
- Available workflows: `/start-task`, `/pre-commit`, `/complete-task`, `/new-exec-plan`.
- Available skills: `harness-navigation`, `code-implementation`.
- Prefer the repo map in `docs/references/repo-map-llms.txt` for fast context loading.
- Prefer mechanical checks over prose assurances.
