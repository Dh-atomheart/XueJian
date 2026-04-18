---
title: Documentation System
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# Documentation System

This directory is the documentation system of record for the repository. It is organized so product truth, design truth, implementation plans, references, and generated material stay separate.

## Start Here

1. Read [../AGENTS.md](../AGENTS.md) for repo-wide rules.
2. Read [../ARCHITECTURE.md](../ARCHITECTURE.md) for layer boundaries.
3. Read [product-specs/index.md](./product-specs/index.md) for product scope and phase boundaries.
4. Read [design-docs/README.md](./design-docs/README.md) for UI and interaction rules.
5. Read [exec-plans/](./exec-plans/) for in-flight implementation plans.

## Canonical Areas

| Path | Purpose |
| --- | --- |
| `product-specs/` | Long-lived product scope and phase requirements |
| `design-docs/` | UI, UX, and interaction truth |
| `exec-plans/active/` | Current implementation plans |
| `exec-plans/completed/` | Completed implementation records |
| `references/` | Technical references and architecture guidance |
| `generated/` | Script-generated material only |

## Current High-Value References

- [references/ai-orchestration.md](./references/ai-orchestration.md)
- [references/technical-architecture-selection-guide.md](./references/technical-architecture-selection-guide.md)
- [references/document-ir.md](./references/document-ir.md)
- [design-docs/reader-annotation.md](./design-docs/reader-annotation.md)
- [SECURITY.md](./SECURITY.md)

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
- Docs validation: `python scripts/docs/validate.py`
- Architecture validation: `python scripts/docs/check_architecture.py`
- Preflight: `python scripts/docs/preflight.py`

## Rules

- Canonical Markdown files must include frontmatter.
- Keep implementation detail in `exec-plans/`, not in product specs.
- Do not hand-edit generated files in `generated/`.
- Update architecture, security, and repo maps when runtime boundaries change.
