---
title: Active Exec Plans Index
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# Active Exec Plans

This directory tracks work that is being prepared or actively implemented. These files are not long-lived product specs. They are execution plans tied to a concrete implementation cycle.

## Usage

- Create or update a plan here before starting large or cross-cutting work.
- Start with `status: draft` if the plan is still being shaped.
- Move the file to `../completed/` after the work is done.

## Tests Section Contract

Each plan should include a `## Tests` table after `Acceptance`.

| Field | Meaning |
| --- | --- |
| ID | Stable identifier in the form `{plan}-a{n}` |
| Acceptance Point | The acceptance line it covers |
| Status | `Pending`, `In Progress`, or `Passed` |

Use `// @acceptance:{id}` in code where useful. Advisory coverage check:

- `python scripts/docs/validate_acceptance.py`

## Plan Index

### MVP (v4.0 Research Alignment)

- [mvp-w1-foundation-and-data-layer.md](./mvp-w1-foundation-and-data-layer.md) — 数据层迁移 + 类型对齐 + Rough.js
- [mvp-w2-gateway-and-orchestration.md](./mvp-w2-gateway-and-orchestration.md) — LiteLLM + PydanticAI + WorkflowCheckpoint
- [mvp-w3-document-and-learning.md](./mvp-w3-document-and-learning.md) — Docling+PyMuPDF + 卡片生成 + FSRS
- [mvp-w4-integration-and-testing.md](./mvp-w4-integration-and-testing.md) — BYOK + 导出 + E2E + 打包

### MVP (Legacy)

- ~~m1-platform-foundation.md~~ -> [completed](../completed/m1-platform-foundation.md)
- ~~m2-document-import-and-anchors.md~~ -> [completed](../completed/m2-document-import-and-anchors.md)
- ~~m3-card-production-line.md~~ -> [completed](../completed/m3-card-production-line.md)
- ~~m4-reading-and-sticky-notes.md~~ -> [completed](../completed/m4-reading-and-sticky-notes.md)
- ~~m5-study-scheduling.md~~ -> [completed](../completed/m5-study-scheduling.md)
- ~~m6-byok-and-minimal-analytics.md~~ -> [completed](../completed/m6-byok-and-minimal-analytics.md)

### V2

- ~~v2-1-rag.md~~ -> [completed](../completed/v2-1-rag.md)
- ~~v2-2-points-system.md~~ -> [completed](../completed/v2-2-points-system.md)
- ~~v2-3-multi-format-import.md~~ -> [completed](../completed/v2-3-multi-format-import.md)

### V3

- ~~v3-1-card-animation.md~~ -> [completed](../completed/v3-1-card-animation.md)
- ~~v3-2-ai-podcast.md~~ -> [completed](../completed/v3-2-ai-podcast.md)

### V4

- ~~v4-1-knowledge-graph.md~~ -> [completed](../completed/v4-1-knowledge-graph.md)
- ~~v4-2-theme-switching-and-theme-packs.md~~ -> [completed](../completed/v4-2-theme-switching-and-theme-packs.md)
- [v4-3-android-capability-assessment.md](./v4-3-android-capability-assessment.md)
- [v4-4-app-usability-fixes.md](./v4-4-app-usability-fixes.md)
- ~~v4-5-ai-stack-and-reader-rearchitecture.md~~ -> [completed (archived: superseded by spec v4.0)](../completed/v4-5-ai-stack-and-reader-rearchitecture.md)
