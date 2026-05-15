# RAG -> Agent -> Multi-Agent 阶段实施入口（已归档）

> 本目录记录已实现过的旧 P00-P06 阶段 runbook，仅供追溯历史验收口径，不再作为当前开发入口。当前新一轮 RAG/Agent 改造入口见 [RAG 问答 LangGraph 化改造文档](../../rag-langgraph-migration.md) 和 [多 Agent 升级开发文档](../../multi-agent-development-guide.md)。

本文是本次 RAG、Agent、多 Agent 升级改造的阶段实施入口。全局路线以 [RAG -> Agent -> Multi-Agent 升级总路线图](../rag-agent-upgrade-roadmap.md) 为准；本文负责把总路线拆成可逐阶段开发、可单独验收的工程交付包。

统一主线：

```text
强 RAG 数据底座 -> 强检索底座 -> RAG 证据链质量 -> 单 Agent -> Memory/Card Tools -> Multi-Agent
```

## 阶段顺序

必须按以下顺序推进，后续阶段不得绕过前置阶段：

1. [P00 Contract Alignment](./p00-contract-alignment.md)
2. [P01 RAG Data Foundation](./p01-rag-data-foundation.md)
3. [P02 Hybrid Retrieval Foundation](./p02-hybrid-retrieval-foundation.md)
4. [P03 RAG Quality Evidence Chain](./p03-rag-quality-evidence-chain.md)
5. [P04 RAG Rewrite, Rerank, Gate, Trace](./p04-rag-rewrite-rerank-gate-trace.md)
6. [P05 Single Agent QA Workflow](./p05-single-agent-qa-workflow.md)
7. [P06 Memory And Card Tools](./p06-memory-and-card-tools.md)
8. [P07 Multi-Agent Runtime](../../multi-agent-development-guide.md#p07multi-agent-orchestrator)

## 跨阶段不变量

- 未完成 active embedding profile 的文档不得进入正式 RAG 回答。
- 不允许 FTS-only 作为正式 grounded answer 路径。
- citations 只来自本轮 retrieved child chunks。
- parent context、conversation memory、rewrite query、rerank score、metadata 都不得成为 citation source。
- Python workflow、LangGraph node、Agent tool 不得直接写 SQLite 业务表。
- 所有持久化写入必须通过 Rust/SQLite/Host Gateway 校验。
- trace、checkpoint、event 不保存完整 prompt、chain-of-thought、API key、未裁剪敏感正文或完整长会话历史。

## 专项文档分工

- [Chunking 优化策略](../chunking-optimization-strategy.md)：定义 Section/Parent/Child 如何生成、落库、标记 metadata，并服务 RAG 与制卡。
- [Embedding 与混合检索升级蓝图](../embedding-hybrid-retrieval-upgrade.md)：定义 embedding profile、FTS5/BM25、中文 n-gram、RRF、query cache、增量 embedding 与 hybrid retrieval trace。
- [RAG Retrieval Quality 2.0](../rag-retrieval-upgrade.md)：定义 auto-merge、rerank、relevance gate、second retrieval、citation audit 和 trace UI。
- [RAG Context Engineering](../rag-context-engineering.md)：定义多轮上下文、query rewrite、单会话 memory、token budget 和 memory/citation 边界。
- [Multi-Agent Development Guide](../../multi-agent-development-guide.md)：定义 Single Agent QA 前置门槛、Card Graph、Study Graph、Multi-Agent Orchestrator、权限矩阵、artifact refs 通信、fallback 和 trace/event/checkpoint 边界。

## 使用方式

每次只启动一个阶段。进入某阶段前，先确认前一阶段的退出门槛已经满足；阶段结束时，必须补齐该阶段文档中的验收标准，再进入下一阶段。
