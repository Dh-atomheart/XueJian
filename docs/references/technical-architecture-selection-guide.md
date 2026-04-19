---
title: 技术架构选型指南
---

# V4-5 Technical Architecture Selection Guide

This guide fixes the target architecture for the V4-5 rearchitecture stream. It is intentionally implementation-oriented. Product truth stays in `docs/product-specs/*`; this file records the technical choices, tradeoffs, and boundaries that implementation must follow.

## Related Docs

- [ai-orchestration.md](./ai-orchestration.md)
- [document-ir.md](./document-ir.md)
- [../design-docs/reader-annotation.md](../design-docs/reader-annotation.md)

## Decision Summary

| Area                       | Chosen Direction                                                                       | Why                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| BYOK                       | Host-owned provider adapters with `openai`, `anthropic`, `custom`                      | Keeps secrets and provider quirks inside the Rust host boundary                                                  |
| Protocol routing           | `native` (OpenAI/Anthropic) or `openai-compatible` (custom)                            | Anthropic uses native Messages API; custom endpoints use OpenAI-compatible protocol                             |
| AI runtime                 | `LiteLLM + PydanticAI + LangChain`                                                     | LiteLLM handles provider routing; PydanticAI handles structured output; LangChain handles PresetWorkflow编排     |
| LangGraph                  | Future path only                                                                       | Not a current runtime dependency; enter evaluation when checkpoint/resume becomes first-class need               |
| Reader                     | `PDF.js` custom canvas rendering                                                       | Full control over highlight layer, text selection, and annotation overlay                                         |
| PDF annotation persistence | SQLite sidecar, not PDF write-back in phase 1                                          | Faster delivery and less risk than full embedded PDF annotation editing                                          |
| Document parsing           | `Docling + PyMuPDF -> DocumentIR -> LLM enhancement -> human gate`                     | Docling provides structure; PyMuPDF provides precise bbox; parsing-first preserves citations                    |
| Document export            | `.apkg` via genanki + CSV                                                              | Native Anki import with stable exportGuid; CSV for plain-text export                                             |
| Open-source comparators    | `Marker`, `MinerU`, `ts-pdf`                                                           | Useful references, but not the default stack                                                                     |

## 1. BYOK And Model Gateway

### 1.1 Target Provider Model

`ApiConfig` aligns with spec.md §2.2.6:

- `provider`: `openai | anthropic | custom`
- `protocol`: `native | openai-compatible` (inferred from provider; custom = openai-compatible)
- `apiKey`
- `baseUrl?` (required for custom)
- `model`
- `isDefault`

`custom` covers any OpenAI-compatible endpoint (user provides `baseUrl`). Anthropic uses native Messages API, not OpenAI-compatible emulation.

### 1.2 Credential Boundary

Secrets remain host-owned.

- The Rust host stores credentials in Stronghold and resolves provider-specific auth.
- The Python orchestration service receives capability, not raw secrets.
- The UI can configure and test connections, but it must not persist plaintext credentials outside the host secret store.

This means:

- OpenAI: `api_key` via native protocol
- Anthropic: `api_key` via native Messages API
- Custom: `api_key` plus `baseUrl` via OpenAI-compatible protocol

### 1.3 Why Not Browser Login Or Cookie Bridging

The project should not implement:

- browser login session scraping
- cookie forwarding
- hidden webview auth relays
- unofficial token extraction from hosted chat products

Those flows are brittle, hard to secure, and do not fit the host-owned secret model.

### 1.4 Gateway Shape

The Rust gateway should separate:

- model connection testing
- provider capability reporting
- model invocation (via LiteLLM provider routing in Python sidecar)
- budget and telemetry accounting
- log redaction

The orchestration manifest should advertise provider and protocol capabilities in a stable schema so Python can route behavior without seeing credentials.

## 2. AI Runtime: LiteLLM + PydanticAI + LangChain

### 2.1 Split Of Responsibilities

Use each library for what it is best at.

- **LiteLLM**: provider protocol routing (OpenAI native, Anthropic native, OpenAI-compatible), cost callback, stream normalization
- **PydanticAI**: structured output validation (`CardDraft`, `RagAnswer`, `Citation`, `WorkflowEvent`), auto-retry on validation failure
- **LangChain**: PresetWorkflow 编排, tool binding, prompt template management
- **LangGraph**: future path only — not a current runtime dependency

Do not build a new hand-rolled workflow engine in `main.py`.

### 2.2 Provider Routing

LiteLLM runs inside the Python sidecar process:

- `provider='openai'` → LiteLLM openai route
- `provider='anthropic'` → LiteLLM anthropic route (native Messages API)
- `provider='custom'` → LiteLLM openai-compatible route (user-provided baseUrl)

Rust Host injects credentials from Stronghold into HTTP request headers; LiteLLM does not persist secrets.

### 2.3 Package Direction

`xuejian/orchestration_service/` should move toward:

- `server.py`
- `clients/host_gateway.py`
- `providers/litellm_adapter.py`
- `schemas/card_draft.py`
- `parsing/docling_pipeline.py`
- `exports/genanki_exporter.py`
- `workflows/card_generation.py`
- `workflows/knowledge_qa.py`
- `workflows/content_pipeline.py`
- `workflows/study_coach.py`

### 2.4 Workflow Classes

#### `card_generation`

Flow:

1. Load document context (from Docling+PyMuPDF parsed DocumentIR)
2. Retrieve candidate spans or chunks
3. Draft cards (PydanticAI `CardDraft` structured output)
4. Evaluate card quality and citation coverage
5. Optionally stop for human review
6. Persist approved drafts (generate stable `exportGuid`)

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

### 2.5 Tool Surface To Stabilize

The host tool gateway for this phase should converge on:

- `load_document_ir`
- `search_chunks`
- `list_reader_annotations`
- `save_card_drafts`
- `save_content_artifact`
- `export_apkg` (genanki `.apkg` generation)
- `schedule_review`

## 3. Reader And Sticky Notes

### 3.1 Primary Choice

The default reader path uses `PDF.js` with custom canvas rendering.

Reasons:

- full control over highlight layer, text selection hot zones, and annotation overlay
- direct integration with Docling+PyMuPDF anchor model (hierarchyPath, bbox, quoteHash)
- no dependency on third-party viewer plugin lifecycle

`react-pdf-viewer` remains a future evaluation candidate if PDF.js maintenance burden grows.

### 3.2 What Changes In The Data Model

MVP uses a single `Highlight` type. V2+ introduces the following split:

- `Highlight`: selection geometry, spans, and anchor information (MVP)
- `ReaderAnnotation`: user-authored annotation metadata (V2+)
- `NoteThread`: note body, replies, status, and links to highlights/cards (V2+)

This split makes card linking and future collaboration features much cleaner, but MVP ships with Highlight only.

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

### 4.2 Primary Tools: Docling + PyMuPDF

`Docling` is the preferred structure parser and `PyMuPDF` is the preferred coordinate extractor.

Docling reasons:

- strong document structure preservation (headings, paragraphs, tables, figure captions)
- produces `hierarchyPath` for each block
- better fit for a parsing-first IR pipeline than model-only extraction

PyMuPDF reasons:

- precise bbox coordinate extraction
- text quote extraction and page metadata
- complements Docling's semantic structure with coordinate accuracy

PDF.js is used only for frontend rendering and text selection hot zones, not for parsing or anchor modeling.

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

Default `parserFamily` is `"docling+pymupdf"`. See [document-ir.md](./document-ir.md) for the working reference.

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

- Frontend lint: `cd xuejian && npm run lint`
- Frontend tests: `cd xuejian && npm run test`
- Rust tests: `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## 9. Non-Goals For This Phase

- browser-login credential relays
- PDF write-back as a day-one requirement
- free-form autonomous multi-agent orchestration
- HTML-first canonical storage for cards
- moving the system of record away from SQLite
- Google ADC or browser-session auth flows
- LangGraph as a current runtime dependency
