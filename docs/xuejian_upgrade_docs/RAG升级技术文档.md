# XueJian RAG 升级技术文档

> 本文定义 RAG 从 v2 到 v4 的技术升级。核心目标是把现有知识问答升级为可恢复、可诊断、可复用的证据引擎。RAG 是后续制卡与多 Agent 的基础，不依赖多 Agent 先完成。

## 0. 阅读方式

- 只想知道改什么：读「1. 升级目标」和「2. 版本分解」。
- 准备写代码：读「3. Graph 设计」「4. 模块设计」「5. 数据与接口」。
- 准备验收：读「7. 测试与验收」。

## 1. 升级目标

RAG 升级不是新增第二套问答系统，而是改造现有 `knowledge_qa` workflow。

目标：

1. 用 LangGraph 管理 RAG 状态和节点。
2. 保持现有 UI payload 兼容。
3. 强化检索、引用校验和无证据拒答。
4. 输出摘要级 trace，服务用户状态与开发诊断。
5. 为后续 Card Graph 和 Multi-Agent 复用证据能力。

非目标：

- 不引入外部向量数据库。
- 不做开放域搜索。
- 不做复杂 Agent 自由规划。
- 不让 FTS-only 生成正式 grounded answer。
- 不保存完整 prompt 或文档正文。

## 2. 版本分解

### V2：RAG Graph 骨架

改造点：

1. 新增 `graphs/rag_graph.py`。
2. 将 `knowledge_qa.py` 改为调用 graph。
3. 抽出 `citation_auditor.py` 与 `trace.py`。

节点：

```text
load_context
-> retrieve_existing
-> pack_context
-> write_answer
-> audit_citations
-> build_trace
```

此版本不改变检索策略，只改变组织方式。

### V3：Hybrid Retrieval 2.0

改造点：

1. vector path + FTS5 path 双路候选。
2. RRF 融合排名。

节点变化：

```text
retrieve_existing
替换为：
retrieve_vector
retrieve_fts5
fuse_candidates
filter_evidence
```

规则：

- vector-backed evidence 是正式回答前提。
- FTS5 可以帮助召回，但不能单独支撑 grounded answer。

### V4：Query Rewrite + Gate + Parent Context

改造点：

1. `rewrite_query` 支持多轮追问。
2. `relevance_gate` 判断 answer / rewrite / reject。
3. `merge_parent_context` 补上下文。

节点变化：

```text
load_context
-> rewrite_query
-> retrieve_vector + retrieve_fts5
-> fuse_candidates
-> relevance_gate
   -> rewrite_query_once | reject_answer | merge_parent_context
-> pack_context
-> write_answer
-> audit_citations
-> build_trace
```

## 3. Graph 设计

### 3.1 RagState

```python
class RagState(TypedDict):
    run_id: str
    graph_version: str
    conversation_id: str | None
    question: str
    document_ids: list[str]

    recent_turn_summary: list[dict]
    rewritten_query: str | None
    rewrite_used: bool
    rewrite_attempts: int

    vector_candidates: list[dict]
    fts_candidates: list[dict]
    fused_candidates: list[dict]
    evidence_chunks: list[dict]
    parent_contexts: list[dict]

    relevance_decision: Literal[
        "answerable",
        "rewrite_once",
        "no_relevant_content"
    ] | None

    context_pack: dict | None
    draft_answer: dict | None
    citation_audit: dict | None
    final_answer: dict | None

    trace: dict
    error_category: str | None
```

### 3.2 Graph 边

```text
START
 -> load_context
 -> maybe_rewrite_query
 -> retrieve_vector
 -> retrieve_fts5
 -> fuse_candidates
 -> relevance_gate
```

条件边：

```text
relevance_gate.answerable -> merge_parent_context
relevance_gate.rewrite_once -> maybe_rewrite_query
relevance_gate.no_relevant_content -> reject_answer
```

结束边：

```text
merge_parent_context -> pack_context -> write_answer -> audit_citations -> build_trace -> END
reject_answer -> build_trace -> END
```

### 3.3 Checkpoint 策略

V2：只在 graph 开始、回答完成、失败时写 checkpoint summary。  
V3：增加检索摘要。  
V4：增加 gate decision 和 rewrite summary。

生产期 checkpoint 必须经 Host Gateway 写入 Rust，不由 Python 自建持久化数据库。

## 4. 模块设计

### 4.1 `rag/retrieval.py`

职责：

- 调用 Host Gateway。
- 检查 embedding readiness。
- 获取 vector candidates。
- 获取 FTS5 candidates。

输出：

```json
{
  "candidates": [
    {
      "chunkId": "string",
      "documentId": "string",
      "pageStart": 1,
      "pageEnd": 1,
      "contentPreview": "string",
      "score": 0.82,
      "path": "vector | fts5"
    }
  ]
}
```

### 4.2 `rag/fusion.py`

职责：

- 对 vector candidates 和 FTS5 candidates 做去重。
- 通过 RRF 融合排名。

默认：

```text
rrf_k = 60
candidate_k = 24
final_k = 8
```

同一 `chunkId` 出现在两路时合并路径：

```text
retrievalPath = fusion
vectorBacked = true
```

### 4.3 `rag/relevance_gate.py`

职责：

- 判断证据是否足以回答。
- 控制最多一次 rewrite。
- 阻止低相关强答。

第一版规则优先，LLM grading 可选：

```text
无 vector-backed evidence -> no_relevant_content
top evidence 低于阈值 -> rewrite_once 或 no_relevant_content
rewrite 后仍低相关 -> no_relevant_content
```

输出：

```json
{
  "decision": "answerable | rewrite_once | no_relevant_content",
  "reason": "string",
  "confidence": 0.0
}
```

### 4.4 `rag/parent_merge.py`

职责：

- 根据 leaf chunk 找 parent chunk / section。
- 给 answer writer 补上下文。
- 不扩大 citation source。

规则：

```text
citation source = retrieved leaf chunks
parent context = answer context only
```

### 4.5 `rag/context_packer.py`

职责：

- 按 token / char budget 打包。
- 优先保留 current question、retrieved leaf、必要 parent context。
- 丢弃 diagnostics，不丢 evidence。

默认预算：

```text
max_leaf_chunks = 8
max_parent_context_chars_per_leaf = 600
max_total_context_chars = 6000
```

### 4.6 `rag/answer_writer.py`

职责：

- 只基于 context pack 生成回答。
- 使用结构化输出。
- 不生成自由 citation source。

输出 schema：

```json
{
  "answer": "string",
  "answerMode": "grounded | no_relevant_content",
  "citations": [
    {
      "chunkId": "string",
      "snippet": "string"
    }
  ]
}
```

### 4.7 `rag/citation_auditor.py`

职责：

- 校验 `chunkId` 属于本轮 retrieved leaf set。
- 校验 snippet 是 chunk content 子串或可近似裁剪。
- 修复可修复 snippet。
- 所有 citation 无效时降级。

输出：

```json
{
  "valid": true,
  "validCitationCount": 3,
  "repairedCitationCount": 1,
  "invalidCitationCount": 0,
  "decision": "accept | repair | reject"
}
```

### 4.8 `rag/trace.py`

职责：输出摘要级 trace。

```json
{
  "rewriteUsed": true,
  "retrieval": {
    "vectorCount": 12,
    "ftsCount": 8,
    "fusedCount": 8
  },
  "gate": {
    "decision": "answerable",
    "reason": "top evidence supports question"
  },
  "citations": {
    "valid": 3,
    "repaired": 1
  }
}
```

不得记录完整正文和完整 prompt。

## 5. 数据与接口

### 5.1 对 Host Gateway 的新增或规范化接口

建议接口：

```text
get_embedding_readiness(documentIds, profileId)
search_vector(documentIds, queryEmbedding, limit)
search_fts5(documentIds, queryText, limit)
get_chunks(chunkIds)
get_parent_context(chunkIds)
emit_workflow_event(runId, payload)
save_workflow_checkpoint(runId, payload)
```

如果现有接口已覆盖，则只包装，不新增 Rust 命令。

### 5.2 输出保持兼容

`knowledge_qa.py` 最终仍返回：

```json
{
  "status": "completed",
  "answer": {
    "answer": "string",
    "answerMode": "grounded | no_relevant_content | excerpt_fallback",
    "retrievalMode": "hybrid | fts5",
    "retrievalStatus": "ready | embedding_missing | embedding_stale | embedding_failed | no_hits",
    "citations": []
  },
  "diagnostics": {}
}
```

## 6. SuperMew 借鉴边界

可借鉴：

- 三层 chunk 思路。
- leaf-only vectorization。
- hybrid retrieval。
- RRF。
- relevance grading。
- query rewrite。
- auto-merging。
- RAG trace。

不照搬：

- Milvus 作为强依赖。
- FastAPI + SSE 架构。
- 外部 rerank 默认依赖。
- JSON 文件会话状态。
- 通用聊天 Agent 入口。

XueJian 的落地方式：SQLite + Host Gateway + LangGraph sidecar。

## 7. 测试与验收

### V2 验收

- 原知识问答通过现有用例。
- Graph 每个节点可单测。
- citation auditor 独立测试通过。
- Graph 失败可回退 deterministic workflow。

### V3 验收

- FTS5 命中术语时能进入候选池。
- RRF 去重稳定。
- FTS-only 不生成 grounded answer。
- trace 展示 vector / fts / fusion 摘要。

### V4 验收

- 多轮指代问题能改写。
- 低相关问题最多重试一次。
- parent context 改善回答完整性。
- citation 仍只来自 leaf chunks。
- context budget 超限时返回稳定错误或降级。

## 8. 参考资料

- XueJian RAG 设计: https://github.com/Dh-atomheart/XueJian/blob/master/docs/rag-knowledge-qa.md
- LangGraph Graph API: https://docs.langchain.com/oss/python/langgraph/graph-api
- LangGraph Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangGraph Durable Execution: https://docs.langchain.com/oss/python/langgraph/durable-execution
- LangChain Structured Output: https://docs.langchain.com/oss/python/langchain/structured-output
- SuperMew RAG Pipeline: https://deepwiki.com/icey1287/SuperMew/4-rag-pipeline
- SuperMew Hybrid Retrieval: https://deepwiki.com/icey1287/SuperMew/4.1-hybrid-retrieval-system
- SuperMew Query Rewrite / Relevance: https://deepwiki.com/icey1287/SuperMew/4.3-query-rewriting-and-relevance-grading
