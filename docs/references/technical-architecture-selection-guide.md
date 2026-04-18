---
title: Technical Architecture Selection Guide
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# V4-5 Technical Architecture Selection Guide

This guide fixes the target architecture for the V4-5 rearchitecture stream. It is intentionally implementation-oriented. Product truth stays in `docs/product-specs/*`; this file records the technical choices, tradeoffs, and boundaries that implementation must follow.

## Related Docs

- [ai-orchestration.md](./ai-orchestration.md)
- [document-ir.md](./document-ir.md)
- [../SECURITY.md](../SECURITY.md)
- [../exec-plans/active/v4-5-ai-stack-and-reader-rearchitecture.md](../exec-plans/active/v4-5-ai-stack-and-reader-rearchitecture.md)
- [../design-docs/reader-annotation.md](../design-docs/reader-annotation.md)
- [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
- [../../xuejian/AGENTS.md](../../xuejian/AGENTS.md)

## Decision Summary

| Area                       | Chosen Direction                                                                       | Why                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| BYOK                       | Host-owned provider adapters with `openai`, `anthropic`, `google`, `openai_compatible` | Keeps secrets and provider quirks inside the Rust host boundary                                                  |
| Auth modes                 | `api_key`, `adc`                                                                       | Covers the official provider paths needed now without browser-session hacks                                      |
| Google auth                | `api_key` and `adc`                                                                    | `adc` is the only acceptable "login-like" path because it remains an official credential flow                    |
| AI runtime                 | `LangChain + LangGraph`                                                                | LangChain handles model/tool abstractions; LangGraph handles state, checkpoints, resume, and routing             |
| Reader                     | `react-pdf-viewer` over the custom canvas reader                                       | Better baseline UX and plugin ecosystem while remaining relatively light                                         |
| PDF annotation persistence | SQLite sidecar, not PDF write-back in phase 1                                          | Faster delivery and less risk than full embedded PDF annotation editing                                          |
| Document parsing           | `Docling -> DocumentIR -> LLM enhancement -> human gate`                               | Parsing-first preserves structure and citations; the model improves output instead of inventing source structure |
| Document export            | Markdown-first artifacts with structured citations                                     | Easier to diff, persist, review, and reuse than HTML-heavy storage                                               |
| Open-source comparators    | `Marker`, `MinerU`, `ts-pdf`, `react-pdf-highlighter`                                  | Useful references, but not the default stack                                                                     |

## 1. BYOK And Model Gateway

### 1.1 Target Provider Model

`ApiConfig` must evolve from the previous narrow provider model into:

- `provider`: `openai | anthropic | google | openai_compatible`
- `authMode`: `api_key | adc`
- `baseUrl?`
- `model`
- `budgetLimit?`
- `hasStoredCredential`

`custom` should be retired as a vague bucket. If a service speaks an OpenAI-compatible protocol, it belongs under `openai_compatible`.

### 1.2 Credential Boundary

Secrets remain host-owned.

- The Rust host stores credentials and resolves provider-specific auth.
- The Python orchestration service receives capability, not raw secrets.
- The UI can configure and test connections, but it must not persist plaintext credentials outside the host secret store.

This means:

- OpenAI: `api_key`
- Anthropic: `api_key`
- Google: `api_key` or `adc`
- OpenAI-compatible: `api_key` plus `baseUrl`

### 1.3 Why Not Browser Login Or Cookie Bridging

The project should not implement:

- browser login session scraping
- cookie forwarding
- hidden webview auth relays
- unofficial token extraction from hosted chat products

Those flows are brittle, hard to secure, and do not fit the host-owned secret model. The only accepted "login-like" path in this phase is `google + adc`.

### 1.4 Gateway Shape

The Rust gateway should separate:

- model connection testing
- provider capability reporting
- model invocation
- budget and telemetry accounting
- log redaction

The orchestration manifest should advertise provider and auth capabilities in a stable schema so Python can route behavior without seeing credentials.

## 2. AI Runtime: LangChain Plus LangGraph

### 2.1 Split Of Responsibilities

Use the libraries for what they are good at.

- LangChain: model clients, tools, structured output, middleware, provider abstraction
- LangGraph: workflow state, branching, checkpoints, resumption, human-in-the-loop, graph execution

Do not build a new hand-rolled workflow engine in `main.py`.

### 2.2 Package Direction

`xuejian/orchestration_service/` should move toward:

- `server.py`
- `clients/host_gateway.py`
- `providers/`
- `schemas/`
- `graph/runtime.py`
- `graph/checkpointing.py`
- `workflows/card_generation.py`
- `workflows/knowledge_qa.py`
- `workflows/content_pipeline.py`
- `workflows/study_coach.py`

### 2.3 Workflow Classes

#### `card_generation`

Flow:

1. Load document context
2. Retrieve candidate spans or chunks
3. Draft cards
4. Evaluate card quality and citation coverage
5. Optionally stop for human review
6. Persist approved drafts

Why a graph:

- needs branching between auto-accept, revise, and review
- benefits from checkpoints
- may run multiple drafting/evaluation passes

#### `knowledge_qa`

Flow:

1. Classify the question
2. Retrieve structured context
3. Synthesize an answer with citations
4. Normalize output for UI rendering

This is a constrained workflow, not a free-form autonomous agent.

#### `content_pipeline`

For interview blog, podcast script, or study article generation:

1. Gather source material
2. Build outline
3. Draft artifact
4. Review structure and factuality
5. Optionally ask for human approval
6. Persist the final artifact

#### `study_coach`

Flow:

1. Load schedule state
2. Inspect recent performance
3. Choose intervention
4. Generate coaching payload
5. Save follow-up or review scheduling

### 2.4 Tool Surface To Stabilize

The host tool gateway for this phase should converge on:

- `load_document_ir`
- `search_chunks`
- `list_reader_annotations`
- `save_card_drafts`
- `save_content_artifact`
- `schedule_review`

## 3. Reader And Sticky Notes

### 3.1 Primary Choice

The default reader path should move to `react-pdf-viewer`.

Reasons:

- better out-of-the-box page navigation and zoom behavior
- lighter implementation burden than maintaining a custom reader stack
- easier plugin-based composition for sidebar and note workflows

### 3.2 What Changes In The Data Model

Stop treating a sticky note as the same thing as a highlight.

- `Highlight`: selection geometry, spans, and anchor information
- `ReaderAnnotation`: user-authored annotation metadata
- `NoteThread`: note body, replies, status, and links to highlights/cards

This split makes card linking and future collaboration features much cleaner.

### 3.3 Persistence Rule

Phase 1 uses SQLite sidecar persistence.

- No PDF write-back requirement
- No embedded annotation export requirement
- Original PDF remains immutable

If real PDF annotation export becomes mandatory later, evaluate `ts-pdf` as a separate workstream because it changes the licensing and product constraints.

### 3.4 Component Direction

TypeScript structure should move toward:

- `src/components/reader/`
- `src/features/reader/`
- `src/features/library/`

The current `documents` bucket is too broad and mixes library, reader, and annotation concerns.

## 4. Document Parsing And Card Generation

### 4.1 Parsing Strategy

Adopt a parsing-first pipeline:

1. Parse the document into `DocumentIR`
2. Derive chunks, anchors, and citations from IR
3. Ask the LLM to draft cards, summaries, labels, and difficulty
4. Apply evaluator or human review before persistence

### 4.2 Primary Tool: Docling

`Docling` is the preferred parser because it gives a strong balance of structure extraction and realistic integration cost.

Primary reasons:

- strong document structure preservation
- useful coverage across PDF and office-style content
- better fit for a parsing-first IR pipeline than model-only extraction

### 4.3 Comparison Set

#### `Marker`

Pros:

- good markdown-oriented extraction in some workflows

Cons:

- less aligned with the target IR-centric pipeline
- licensing and deployment fit should be treated carefully before embedding

#### `MinerU`

Pros:

- useful comparator for complex PDF extraction

Cons:

- should remain a benchmark and fallback candidate, not the primary embedded dependency for this phase

### 4.4 Why Not LLM-Only Conversion

Pure model-driven card conversion is weaker because:

- citations are less reliable
- document structure is less stable
- pagination and anchor references drift
- repeated re-runs can produce inconsistent chunk boundaries

LLM enhancement is still valuable for:

- rewriting source material into card-friendly language
- generating candidate cards
- adding tags and difficulty
- building interview/blog artifacts

The model should improve structured input, not replace the parser.

## 5. DocumentIR

`DocumentIR` becomes the shared contract between parsing, retrieval, card drafting, and reader linking.

High-level shape:

- `document`
- `pages`
- `blocks`
- `spans`
- `anchors`
- `assets`
- `citations`
- `sourceMetadata`

See [document-ir.md](./document-ir.md) for the working reference.

## 6. Directory Restructure

### 6.1 TypeScript

Target direction:

- `src/types/documents.ts`
- `src/types/cards.ts`
- `src/types/reader.ts`
- `src/types/ai.ts`
- `src/types/settings.ts`
- `src/services/gateway/`
- `src/services/document-processing/`
- `src/components/reader/`
- `src/features/library/`
- `src/features/reader/`

### 6.2 Rust

Target direction:

- `src-tauri/src/gateway/model/`
- `src-tauri/src/gateway/tool/`
- `src-tauri/src/commands/reader.rs` or equivalent reader-focused split

Keep the architecture invariants:

- `commands/` stays the outer boundary
- `db/` and `gateway/` do not depend on `commands/`

### 6.3 Python

`orchestration_service/main.py` should stop being the system center of gravity. The service must become a package with clear workflow and schema modules.

## 7. Migration Priorities

The highest-value oversized files to split first:

1. `xuejian/orchestration_service/main.py`
2. `xuejian/src/types/document.ts`
3. `xuejian/src/features/settings/SettingsPage.tsx`
4. `xuejian/src/features/documents/ReaderPage.tsx`
5. `xuejian/src-tauri/src/commands/cards.rs`

Recommended order:

1. freeze docs and interfaces
2. move schemas and helper modules
3. split workflow/runtime code
4. split UI composition and reader state
5. remove compatibility shims after adoption

## 8. Validation Checklist

- Docs: `python scripts/docs/validate.py`
- Architecture: `python scripts/docs/check_architecture.py`
- Frontend lint: `cd xuejian && npm run lint`
- Frontend tests: `cd xuejian && npm run test`
- Rust tests: `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## 9. Non-Goals For This Phase

- browser-login credential relays
- PDF write-back as a day-one requirement
- free-form autonomous multi-agent orchestration
- HTML-first canonical storage for cards
- moving the system of record away from SQLite
