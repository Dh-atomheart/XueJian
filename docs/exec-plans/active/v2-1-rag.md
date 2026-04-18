---
title: V2-1 RAG
status: completed
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# V2-1 知识库问答模块

## Goal

在不引入 agentic RAG 的前提下，构建简单、可引用、可降级的知识问答能力。

## Depends On

- [../../product-specs/v2.md](../../product-specs/v2.md)
- [../completed/m2-document-import-and-anchors.md](../completed/m2-document-import-and-anchors.md) ✅
- [../completed/m6-byok-and-minimal-analytics.md](../completed/m6-byok-and-minimal-analytics.md) ✅
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

## Tests

| ID      | 验收点                           | 状态 |
| ------- | -------------------------------- | ---- |
| v2-1-a1 | 指定范围内提问获得带引用回答     | ✅   |
| v2-1-a2 | 无 embedding 降级为纯 FTS5       | ✅   |
| v2-1-a3 | 问答结果不进入通用 agent runtime | ✅   |
| v2-1-a4 | 引用可回查文档来源               | ✅   |

## Relevant Files

- `xuejian/src-tauri/src/db/document_repo.rs` — search_chunks_scoped()
- `xuejian/src-tauri/src/commands/knowledge.rs` — search_knowledge, start_knowledge_qa_workflow
- `xuejian/src-tauri/src/gateway/host_http.rs` — /tool-gateway/search-chunks endpoint
- `xuejian/src-tauri/src/gateway/mod.rs` — manifest update
- `xuejian/orchestration_service/main.py` — knowledge-qa workflow + search_chunks client
- `xuejian/src/services/gateway/knowledge.ts` — TS gateway service
- `xuejian/src/queries/knowledge.ts` — TanStack Query hooks
- `xuejian/src/features/knowledge/KnowledgeQaPage.tsx` — Q&A page
- `xuejian/src/store/ui.ts` — NavItemId extended
- `xuejian/src/types/document.ts` — ChunkSearchResult type
- `xuejian/src/types/schema.ts` — chunkSearchResultSchema
- `xuejian/src/App.tsx` — knowledge route
- `xuejian/src/components/shell/SidebarRail.tsx` — knowledge nav item
- `xuejian/src/components/shell/TopBar.tsx` — page title
- `xuejian/src/services/gateway/mockData.ts` — mock responses
- `xuejian/tests/services/gateway/knowledge.test.ts` — acceptance tests

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `python scripts/docs/generate_db_schema.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- 必须沿用现有文档锚点与 chunk 体系，不重建第二套文档来源模型。
- **Backlog**：此计划属于 V2 阶段，MVP（m1–m6）完成前不应启动。
