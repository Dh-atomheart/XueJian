---
title: Documentation Agent Guide
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# Documentation Agent Guide

Use this file before editing anything under `docs/`.

## Canonical Areas

- Product scope: `docs/product-specs/`
- Design system: `docs/design-docs/`
- Task planning: `docs/exec-plans/`
- Detailed references: `docs/references/`
- Generated outputs: `docs/generated/`

## Editing Rules

- Keep product specs stable and compact.
- Keep implementation detail inside `exec-plans/`, not inside specs.
- Do not cite archived files as the current source of truth.
- Do not hand-edit `docs/generated/db-schema.md`.
- Preserve local links when moving or renaming docs.

## Frontmatter

Canonical Markdown files must include:

- `title`
- `status`
- `owner`
- `last_reviewed`
- `canonical`

Allowed `status` values:

- `draft`
- `active`
- `deprecated`
- `archived`

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
- Doc gardening: `python scripts/docs/garden.py`
- Preflight (all checks): `python scripts/docs/preflight.py`

## Writing Style

- Machine-entry documents can be English-first.
- Product and design truth stays Chinese-first.
- Prefer short sections and stable terminology over long narrative prose.
