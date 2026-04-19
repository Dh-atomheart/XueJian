---
title: AI 编排参考
---

# AI Orchestration Reference

This file describes the target runtime shape for the local AI stack.

## Runtime Summary

The orchestration stack is a three-part system:

- React UI gathers intent and renders outputs
- Rust host owns secrets, storage, provider adapters, and tool boundaries
- Python orchestration runs `LiteLLM + PydanticAI + LangChain` workflows through host gateways

The Python service is not the system of record and must not own plaintext secrets.

## Responsibilities By Layer

### UI

- capture user intent
- submit workflow requests
- display structured outputs, citations, and review states

### Rust Host

- store credentials in the secret store
- expose model and tool gateways
- redact logs
- persist workflow events and artifacts when needed
- enforce provider and auth capability boundaries

### Python Orchestration

- choose workflow shape
- call models through LiteLLM provider routing
- validate structured output via PydanticAI
- call tools through the host
- maintain workflow state and checkpoints
- return structured workflow artifacts

## Why LiteLLM Plus PydanticAI Plus LangChain

Use each for its strengths.

### LiteLLM

Use for:

- provider protocol routing (OpenAI native, Anthropic native, OpenAI-compatible)
- cost callback and token accounting
- stream normalization across providers

### PydanticAI

Use for:

- structured output validation (`CardDraft`, `RagAnswer`, `Citation`, `WorkflowEvent`)
- auto-retry on validation failure (max 2 retries)
- strong typing boundary between LLM output and downstream consumers

### LangChain

Use for:

- PresetWorkflow 编排
- tool binding
- prompt template management
- provider-aware prompting helpers

### LangGraph (Future Path Only)

LangGraph is not a current runtime dependency. It enters evaluation when:

- checkpoint / resume becomes a first-class need
- human-in-the-loop requires graph-level state recovery
- multi-branch, long-chain state graphs clearly complexify

Until then, all preset workflows follow LangChain-first design.

## Workflow Catalog

### `card_generation`

Recommended node flow:

1. `load_document_context`
2. `retrieve_candidate_spans`
3. `draft_cards` (PydanticAI `CardDraft` structured output)
4. `evaluate_cards`
5. `human_gate`
6. `persist_cards` (generate stable `exportGuid`)

Outputs:

- card drafts
- citations
- evaluator verdict
- review metadata

### `knowledge_qa`

Recommended node flow:

1. `classify_question`
2. `retrieve_context`
3. `answer_with_citations`
4. `normalize_response`

Outputs:

- answer
- citation list
- confidence or answer mode

### `content_pipeline`

Recommended node flow:

1. `gather_material`
2. `build_outline`
3. `draft_artifact`
4. `review_artifact`
5. `human_gate_optional`
6. `persist_artifact`

Typical artifacts:

- interview blog
- podcast script
- study article
- briefing note

### `study_coach`

Recommended node flow:

1. `load_schedule_state`
2. `inspect_recent_performance`
3. `choose_intervention`
4. `generate_coaching_payload`
5. `persist_or_schedule_followup`

Outputs:

- coaching guidance
- review recommendation
- scheduling follow-up

## Workflow State Model

Workflow payloads should converge on structured schemas rather than free-form JSON blobs.

Suggested common fields:

- `input`
- `retrieval`
- `draft`
- `evaluation`
- `artifacts`
- `checkpoint`
- `human_gate`

## Host Tool Surface

The preferred host tool surface:

- `load_document_ir`
- `search_chunks`
- `list_reader_annotations`
- `save_card_drafts`
- `save_content_artifact`
- `export_apkg` (genanki `.apkg` generation)
- `schedule_review`

These tools give the Python runtime enough leverage without moving persistence ownership out of the host boundary.

## Packaging Direction

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

## Non-Goals

- browser-owned secrets
- direct database ownership from Python
- unconstrained autonomous multi-agent behavior as the default interaction model
- opaque string-only outputs with no schema or citations
