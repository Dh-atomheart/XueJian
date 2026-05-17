# MVP-3：RAG 知识问答 MVP

## Summary

MVP-3 的目标是交付学习型 RAG 知识问答。用户可以基于已向量化文档提问，系统用结构化中文回答，并展示页面和相关内容引用。

MVP-3 不并入 MVP-2。它依赖 MVP-0/1/2 已完成的文档解析、chunk、provider、embedding 和知识问答页面骨架。

## 目标

- 用户可以选择一个或多个已向量化文档提问。
- 系统必须基于检索 chunk 回答。
- 回答默认采用“直接答案 + 要点解释 + 引用来源”。
- 引用展示页面和相关内容，不做 Reader 跳转。
- 没有足够证据时明确拒答。
- 未完成 embedding 的文档不能进入正式回答链路。

## 不做

- FTS-only 正式回答。
- 通用聊天和开放域问答。
- 自动制卡、追问生成、概念图。
- Reader 跳转、bbox 高亮、精确文本定位。
- 复杂 agent、多步骤规划。
- 完整 background job/checkpoint 化。

## 依赖

- MVP-0：文档、chunk、source anchor、基础数据模型。
- MVP-1：Provider/BYOK、AI workflow 基础。
- MVP-2：Reader 与学习闭环，不作为 RAG 入口依赖，但共享文档基础。
- 现有代码骨架：
  - `knowledge_qa.py`
  - `commands/knowledge.rs`
  - `document_embedding.py`
  - `vector_repo.rs`
  - `KnowledgeQaPage.tsx`

## 核心流程

```text
选择文档
-> 检查 active embedding profile
-> 检查所选文档 embedding 状态
-> 提问并创建 conversation/message/workflow_run
-> query embedding
-> hybrid/vector retrieval
-> chunk packing
-> grounded JSON answer
-> citation validation
-> 写回 assistant message
-> 前端展示答案和页面引用
```

## 数据契约

RAG answer payload：

```json
{
  "answer": "结构化中文回答",
  "answerMode": "grounded",
  "retrievalMode": "hybrid",
  "retrievalStatus": "ready",
  "citations": [
    {
      "chunkId": "chunk-id",
      "documentId": "document-id",
      "page": 12,
      "snippet": "相关内容片段",
      "relevanceScore": 0.82
    }
  ]
}
```

状态约束：

- 未配置或未完成 embedding：`embedding_missing`。
- embedding 过期：`embedding_stale`。
- embedding provider 失败：`embedding_failed`。
- 没有相关命中：`no_hits` 或 `no_relevant_content`。
- 成功回答：`answerMode: "grounded"`。

## 验收标准

- 已向量化文档可以完成一次 grounded 问答。
- 未向量化文档会被阻止回答，并引导生成向量。
- 多文档问题可以返回多个文档的引用。
- citation 全部来自本轮检索 chunk。
- 无证据问题不编造答案。
- provider 超时、取消、非法 JSON 都有可理解状态。
- 前端用户可见中文文案无乱码。

详细测试见 [RAG 验收测试](../rag/legacy/rag-acceptance-tests.md)。

