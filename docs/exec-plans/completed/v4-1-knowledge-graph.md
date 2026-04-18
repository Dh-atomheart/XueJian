---
title: V4-1 Knowledge Graph
status: archived
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# V4-1 知识图谱模块

## Goal

从文档、卡片、问答和播客内容中抽取知识节点和关系，建立可回溯来源和可增量更新的图谱结构。

## Depends On

- [../../product-specs/v4.md](../../product-specs/v4.md)
- [../completed/v2-1-rag.md](../completed/v2-1-rag.md)
- [../completed/v3-2-ai-podcast.md](../completed/v3-2-ai-podcast.md)
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)

## Scope

- 实体抽取、关系抽取、消歧与合并
- 图谱存储与 `GraphBuildRun`
- 来源回溯和增量更新
- 图谱浏览 UI

## Acceptance

- 图谱可构建、可增量更新、可回溯来源
- 同义概念能做基本消歧与合并
- UI 可浏览节点、关系和来源
- 不展示无法回溯来源的强结论

## Tests

| ID      | 验收点                             | 状态 |
| ------- | ---------------------------------- | ---- |
| v4-1-a1 | 图谱可构建、可增量更新、可回溯来源 | ✅   |
| v4-1-a2 | 同义概念基本消歧与合并             | ✅   |
| v4-1-a3 | UI 可浏览节点、关系和来源          | ✅   |
| v4-1-a4 | 不展示无法回溯来源的强结论         | ✅   |

## Relevant Files

- `xuejian/src-tauri/migrations/V7__knowledge_graph.sql`
- `xuejian/src-tauri/src/db/knowledge_graph_repo.rs`
- `xuejian/src-tauri/src/commands/knowledge_graph.rs`
- `xuejian/src/types/knowledge-graph.ts`
- `xuejian/src/services/gateway/knowledgeGraph.ts`
- `xuejian/src/queries/knowledgeGraph.ts`
- `xuejian/src/features/knowledge/KnowledgeGraphPage.tsx`
- `xuejian/orchestration_service/main.py`
- `xuejian/tests/services/gateway/knowledgeGraph.test.ts`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- 如果抽取链路真的演化成复杂图状态机，再单独出升级到 `LangGraph` 的 exec plan。
- **Backlog**：此计划属于 V4 阶段，V3 完成前不应启动。
