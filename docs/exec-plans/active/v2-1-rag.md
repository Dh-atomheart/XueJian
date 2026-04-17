---
title: V2-1 RAG
status: draft
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# V2-1 知识库问答模块

## Goal

在不引入 agentic RAG 的前提下，构建简单、可引用、可降级的知识问答能力。

## Depends On

- [../../product-specs/v2.md](../../product-specs/v2.md)
- [../completed/m2-document-import-and-anchors.md](../completed/m2-document-import-and-anchors.md) ✅
- [./m6-byok-and-minimal-analytics.md](./m6-byok-and-minimal-analytics.md)
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)

## Scope

- `FTS5 + sqlite-vec` 混合检索
- embedding 生成与降级策略
- 带引用的 `RagAnswer`
- Host 统一模型与检索边界
- 问答 UI 与引用查看

## Acceptance

- 用户可在指定知识范围内提问并获得带引用的回答
- 无 embedding 时可降级为纯 `FTS5`
- 问答结果不进入通用 agent runtime
- 引用可回查文档来源

## Relevant Files

- `xuejian/src/features/agents/`
- `xuejian/src/features/documents/`
- `xuejian/src/services/gateway/orchestration.ts`
- `xuejian/src/services/gateway/documents.ts`
- `xuejian/src-tauri/src/db/`
- `xuejian/src-tauri/src/tasks/`
- `xuejian/orchestration_service/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `python scripts/docs/generate_db_schema.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- 必须沿用现有文档锚点与 chunk 体系，不重建第二套文档来源模型。
- **Backlog**：此计划属于 V2 阶段，MVP（m1–m6）完成前不应启动。
