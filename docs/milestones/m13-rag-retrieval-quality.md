# M13：RAG Retrieval Quality

## Summary

M13 目标是把 RAG 检索质量做稳。重点是 embedding gate、向量检索、多文档排序、chunk packing 和无证据策略。

M13 是 RAG Retrieval Quality 的基础阶段。Parent/Child Auto-merging、rerank、相关性门控、二次检索和 RAG trace UI 属于后续增强路线，详见 [RAG 检索质量升级蓝图](../rag-retrieval-upgrade.md)；该升级不得推翻本里程碑的 embedding gate、no FTS-only 正式回答和 citation 忠实边界。

## 范围

- 检查所选文档是否完成当前 active embedding profile 的向量化。
- 使用 query embedding 执行 hybrid/vector retrieval。
- 支持多文档检索。
- 对检索结果去重、排序和压缩上下文。
- 建立无命中和低相关度时的拒答策略。

## 不做

- FTS-only 正式回答。
- 复杂 reranker。
- 跨文档知识图谱。
- 长文档全局总结。
- 表格/图片/OCR 专项增强。

## 实现要点

- `document_chunk_embedding_state` 是判断文档是否可问答的关键依据。
- 所选文档任一未完成 embedding 时，第一版直接阻止回答并提示生成向量。
- `search_hybrid` 返回的 chunk 必须包含 `chunkId/documentId/page/content/score`。
- chunk packing 控制 top chunks 和总上下文长度。
- 相邻重复 chunk 去重，保留高分结果。
- no hits 时返回 `no_relevant_content`，不调用通用知识补全。

## 验收

- 单文档问题能命中正确 chunk。
- 多文档问题能返回跨文档 citations。
- 未向量化文档被阻止。
- 过期向量状态可被识别。
- 无关问题不会生成无来源答案。
