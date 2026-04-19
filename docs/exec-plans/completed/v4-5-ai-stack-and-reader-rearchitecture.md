---
title: V4-5 AI Stack And Reader Rearchitecture
status: archived
owner: platform
last_reviewed: 2026-04-19
canonical: true
superseded_by: spec v4.0 research alignment (LiteLLM+PydanticAI, PDF.js, Docling+PyMuPDF)
---

# V4-5 AI Stack And Reader Rearchitecture

## Goal

Implement the V4-5 architecture baseline across docs and code:

- upgrade BYOK into a provider/auth-capability model
- move Python orchestration toward `LangChain + LangGraph`
- rebuild the reader and sticky-note system on a clearer annotation model
- introduce `DocumentIR` as the parsing and retrieval contract
- reshape the `xuejian/` source tree around stable module boundaries

This plan is the implementation tracker. The architectural decisions are fixed in [../../references/technical-architecture-selection-guide.md](../../references/technical-architecture-selection-guide.md).

## Depends On

- [../../references/technical-architecture-selection-guide.md](../../references/technical-architecture-selection-guide.md)
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)
- [../../references/document-ir.md](../../references/document-ir.md)
- [../../design-docs/reader-annotation.md](../../design-docs/reader-annotation.md)
- [../completed/m4-reading-and-sticky-notes.md](../completed/m4-reading-and-sticky-notes.md)
- [../completed/m6-byok-and-minimal-analytics.md](../completed/m6-byok-and-minimal-analytics.md)

## Scope

- Extend settings and gateway contracts for `provider` and `authMode`
- Add `google` and `openai_compatible` as first-class provider types
- Keep secrets inside the Rust host and expose only capability to Python
- Split the orchestration service into `clients`, `schemas`, `graph`, and `workflows`
- Introduce LangGraph-style workflow wrappers for cards, QA, content generation, and study coaching
- Move reader concerns under `components/reader` and `features/reader`
- Introduce `ReaderAnnotation`, `NoteThread`, and `DocumentIR`
- Update documentation and repo maps together with structural changes

## Out Of Scope

- browser-login or cookie-based model auth
- PDF write-back in the first reader rework
- replacing SQLite as the primary store
- shipping unconstrained free-form agent autonomy

## Acceptance

- BYOK types, schema, and gateway DTOs support `provider` and `authMode`
- The orchestrator is no longer centered on a single `main.py` workflow blob
- Reader UI and reader data types are split from the broad `documents` bucket
- `DocumentIR` exists as a stable parsing and retrieval contract
- `/docs` reflects the new runtime, security boundary, and source layout

## Tests

| ID      | Acceptance Point                                                            | Status        |
| ------- | --------------------------------------------------------------------------- | ------------- |
| v4-5-a1 | BYOK types, schema, and gateway DTOs support `provider` and `authMode`      | `Pending`     |
| v4-5-a2 | The orchestrator is no longer centered on a single `main.py` workflow blob  | `Pending`     |
| v4-5-a3 | Reader UI and reader data types are split from the broad `documents` bucket | `Pending`     |
| v4-5-a4 | `DocumentIR` exists as a stable parsing and retrieval contract              | `Pending`     |
| v4-5-a5 | `/docs` reflects the new runtime, security boundary, and source layout      | `In Progress` |

## Relevant Files

- `xuejian/src/features/settings/`
- `xuejian/src/services/gateway/`
- `xuejian/src/services/document-processing/`
- `xuejian/src/components/reader/`
- `xuejian/src/features/reader/`
- `xuejian/src/features/library/`
- `xuejian/src/types/`
- `xuejian/src-tauri/src/db/`
- `xuejian/src-tauri/src/gateway/`
- `xuejian/src-tauri/src/commands/`
- `xuejian/orchestration_service/`
- `docs/references/`
- `docs/design-docs/`

## Implementation Notes

- Freeze documentation and interfaces first.
- Prefer compatibility exports over large one-shot moves.
- Keep the host gateway as the trust boundary for credentials and provider-specific auth.
- Use Pydantic schemas for workflow payloads and checkpoint state.
- Keep card generation parsing-first: `DocumentIR -> retrieval -> draft -> evaluate -> review -> persist`.

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Progress Notes

- 2026-04-18: Added architecture, orchestration, security, repo-map, and reader/document IR documentation baseline.
