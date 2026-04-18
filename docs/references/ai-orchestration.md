---
title: AI Orchestration Reference
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# AI Orchestration Reference

This file describes the target runtime shape for the local AI stack.

## Runtime Summary

The orchestration stack is a three-part system:

- React UI gathers intent and renders outputs
- Rust host owns secrets, storage, provider adapters, and tool boundaries
- Python orchestration runs `LangChain + LangGraph` workflows through host gateways

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
- call models and tools through the host
- maintain graph state and checkpoints
- return structured workflow artifacts

## Why LangChain Plus LangGraph

Use both, with clear responsibilities.

### LangChain

Use for:

- model client abstraction
- tool binding
- structured output
- middleware
- provider-aware prompting helpers

### LangGraph

Use for:

- workflow state
- routing
- checkpoints
- resumable execution
- human-in-the-loop pauses

Do not use LangChain alone as a replacement for workflow state management.

## Workflow Catalog

### `card_generation`

Recommended node flow:

1. `load_document_context`
2. `retrieve_candidate_spans`
3. `draft_cards`
4. `evaluate_cards`
5. `human_gate`
6. `persist_cards`

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

The preferred host tool surface for V4-5:

- `load_document_ir`
- `search_chunks`
- `list_reader_annotations`
- `save_card_drafts`
- `save_content_artifact`
- `schedule_review`

These tools give the Python runtime enough leverage without moving persistence ownership out of the host boundary.

## Packaging Direction

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

## Non-Goals

- browser-owned secrets
- direct database ownership from Python
- unconstrained autonomous multi-agent behavior as the default interaction model
- opaque string-only outputs with no schema or citations
