# RAG -> Agent -> Multi-Agent 升级总路线图

本文是 XueJian 后续 RAG、Agent 与 Multi-Agent 改造的总纲与索引。它负责统一阶段顺序、职责边界和验收口径；各专项文档继续负责具体领域设计，但不得与本文定义的全局路线冲突。

旧 P00-P06 阶段实施文档已完成并归档到 [archive/phases-implemented-2026-05-13](./archive/phases-implemented-2026-05-13/README.md)。当前新一轮执行入口是 [RAG 问答 LangGraph 化改造文档](./rag-langgraph-migration.md) 和 [Multi-Agent Development Guide](./multi-agent-development-guide.md)。

统一主线：

```text
先构建强大的 RAG 证据链与检索底座
-> 再工具化为受控 Single Agent workflow
-> 最后在契约稳定后拆成 Multi-Agent runtime
```

## 1. 总体原则

- RAG 优先：先解决证据单元、检索、排序、引用、拒答和 trace，再讨论 Agent 编排。
- 单 Agent 优先：Agent 能力先作为白名单工具和确定性 workflow 节点进入单 Agent，不提前拆 supervisor。
- 多 Agent 后置：只有当工具契约、trace、评估、fallback 都稳定后，才引入多 Agent role routing。
- 本地优先：Rust/SQLite/Host Gateway 仍是数据权威层，Python sidecar 负责解析、模型调用、编排、结构化候选输出和受控调度请求。
- 引用忠实：citation 只来自本轮 retrieved child chunks；parent context、rewrite、rerank、memory、metadata 都不能成为 citation source。
- 隐私边界：trace、workflow event、checkpoint 不保存完整 prompt、chain-of-thought、API key 或未裁剪长正文。

## 2. 统一阶段

### Phase 0: Contract Alignment

状态：已完成（2026-05-12）。

目标是统一文档职责、术语、阶段顺序和验收口径。

交付物：

- 本总纲成为阶段顺序最高优先级。
- 各专项文档都链接回本文。
- 文档统一使用同一条路线：RAG Data Foundation -> Retrieval Foundation -> RAG Quality 2.0 -> Single Agent QA -> Memory/Card Tools -> Multi-Agent Runtime。

### Phase 1: RAG Data Foundation

状态：已完成。

目标是先让证据单元可靠落库。没有稳定的 Section/Parent/Child 结构，就不应先做复杂 auto-merge、rerank 或 Agent 编排。

交付物：

- 修复 Section/Parent/Child 结构落库。
- 保留 `sectionId`、`anchorId`、`chunkKind`、`metadata` 和 source anchor。
- 引入或等价维护 chunking profile 与 stale 标记。
- 明确 child chunk 是 embedding、retrieval、citation、source quote 和制卡的最小证据单元。

负责文档：

- [Chunking 优化策略](./chunking-optimization-strategy.md)

### Phase 2: Retrieval Foundation

状态：已完成。

目标是把 hybrid retrieval 底座做稳，再进入更复杂的 RAG 证据链增强。

交付物：

- 正式 QA hybrid 入口走 SQLite FTS5/BM25，而不是 MVP0 `contains + term count`。
- 中文短 query 和中英混合 query 增加字符 n-gram/trigram 辅助召回。
- chunk 级增量 embedding：content hash、chunking profile revision、embedding profile revision。
- 自定义 embedding dimensions 必须填写或首次成功后锁定。
- RRF fusion 输出可诊断 score 与来源摘要。

负责文档：

- [Embedding 与混合检索升级蓝图](./embedding-hybrid-retrieval-upgrade.md)

### Phase 3: RAG Quality 2.0

状态：已完成（P03/P04 已于 2026-05-12 收口，前端 build、Python 单测、Rust 编译与测试通过）。

目标是把“可用 RAG”升级为“证据质量可诊断、引用忠实、低证据可拒答”的学习型 RAG。

交付物：

- Parent/Child Auto-Merge：child 命中后扩展受控 parent/section context。
- Query Rewrite 按需触发：多轮指代、短 query、低相关召回时使用；原 query 始终参与召回。
- Second Retrieval：首轮低相关时最多补检索一次。
- Optional Rerank：支持 disabled/local_rule/LLM provider，不作为硬依赖。
- Relevance Gate：决定 answer、second_retrieval 或 no_relevant_content。
- Citation Audit：只接受本轮 retrieved child chunks。
- RAG Trace：用户可见阶段摘要 + 开发诊断 score/chunk refs/audit 摘要。

负责文档：

- [RAG Retrieval Quality 2.0](./rag-retrieval-upgrade.md)
- [RAG Context Engineering](./rag-context-engineering.md)

### Phase 4: Single Agent QA

状态：旧阶段已实现过；当前需要收敛到 LangGraph KnowledgeGraph。

目标是把 Phase 3 已稳定的 RAG 能力包装为受控工具节点，形成单 Agent 学习问答 workflow。

交付物：

- 工具 registry 和 schema-first tool contract。
- 最小工具集：`retrieve_evidence`、`merge_parent_context`、`rerank_evidence`、`grade_retrieval_relevance`、`pack_context`、`audit_citations`、`build_rag_trace`。
- LangGraph StateGraph 是后续 Agent 化编排标准；确定性 workflow 只作为 fallback。
- 保留确定性 RAG fallback。
- 不开放制卡、复习调度、长期记忆写入等高影响工具。

负责文档：

- [RAG 问答 LangGraph 化改造文档](./rag-langgraph-migration.md)
- [Multi-Agent Development Guide](./multi-agent-development-guide.md)

### Phase 5: Memory And Card Tools

目标是在单 Agent QA 稳定后，逐步开放单会话 memory、制卡工具和学习流程工具。

交付物：

- 单会话 memory 只服务意图理解，不作为 citation source。
- 长期 memory 后置，需要用户可见治理、来源审计和删除机制。
- 制卡工具复用同一套 child evidence/source quote/citation 边界。
- 学习诊断第一版只输出建议和补卡线索，不生成用户可见待审项，不提交复习调度状态，不直接写 SQLite。

负责文档：

- [RAG Context Engineering](./rag-context-engineering.md)
- [Multi-Agent Development Guide](./multi-agent-development-guide.md)

### Phase 6: Multi-Agent Runtime

目标是在单 Agent 工具契约、trace、评估、fallback 都稳定后，引入复杂任务触发的 LangGraph multi-agent runtime。普通任务仍以 single-agent 或现有确定性 workflow 为主。

交付物：

- 多 Agent 共享同一套工具 registry、权限边界、workflow events/checkpoints、artifact schema 和 citation audit。
- `Supervisor/Router` 强控制领域角色顺序、输入裁剪、终止条件和 fallback。
- 领域角色作为独立 graph node/runnable，但不拥有独立数据权威、独立 RAG 服务或独立 memory。
- Multi-Agent 失败时直接回退对应确定性 workflow。
- 多 Agent trace 只保存摘要级 event chain，不保存完整中间推理。
- 失败可定位到角色、工具、输入 schema 和 error category。

负责文档：

- [Multi-Agent Development Guide](./multi-agent-development-guide.md)

## 3. 文档职责索引

- [RAG 知识问答设计文档](./rag-knowledge-qa.md)：定义学习型 RAG 的基础检索链路、回答样式、citation 校验和无证据拒答策略，是所有 RAG 阶段（Phase 1-3）的基线前提，也是 Phase 4-5 工具化的前置依据。
- [Chunking 优化策略](./chunking-optimization-strategy.md)：定义 Section/Parent/Child 如何生成、落库、标记 metadata，并服务 RAG 与制卡。
- [Embedding 与混合检索升级蓝图](./embedding-hybrid-retrieval-upgrade.md)：定义 embedding profile、FTS5/BM25、中文 n-gram、RRF、query cache、增量 embedding 与 retrieval trace。
- [RAG Retrieval Quality 2.0](./rag-retrieval-upgrade.md)：定义 auto-merge、rerank、relevance gate、second retrieval、citation audit 和 trace UI。
- [RAG Context Engineering](./rag-context-engineering.md)：定义多轮上下文、query rewrite、单会话 memory、token budget 和 memory/citation 边界。
- [Multi-Agent Development Guide](./multi-agent-development-guide.md)：定义 Single Agent QA 前置门槛、Card Graph、Study Graph、Multi-Agent Orchestrator、权限矩阵、artifact refs 通信、fallback 和 trace/event/checkpoint 边界。

## 4. 不可变底线

- 未完成 active embedding profile 的文档不得进入正式 RAG 回答。
- 不允许 FTS-only 作为正式 grounded answer 路径。
- citations 只来自本轮 retrieved child chunks。
- parent context、conversation memory、rewrite query、rerank score、metadata 不得成为 citation source。
- Python workflow、LangGraph node、Agent tool 不得直接写 SQLite 业务表。
- 所有持久化写入必须通过 Rust/Host Gateway 校验。
- trace/checkpoint/event 不保存完整 prompt、chain-of-thought、API key、未裁剪敏感正文或完整长会话历史。

## 5. 升级验收口径

Phase 1 完成后：

- 结构化 section/chunk metadata 可从 Host Gateway 读回。
- child chunk 与 source anchor 可稳定追溯。
- reparse/re-embedding stale 状态可识别。

Phase 2 完成后：

- hybrid retrieval 的 lexical leg 走 FTS5/BM25。
- 中文短 query 和中英混合 query 召回改善。
- 未变化 chunk 第二次 embedding 可跳过。
- embedding dimensions 可校验。

Phase 3 完成后：

- child 命中可扩展 parent/section context。
- low relevance 可触发一次 second retrieval 或拒答。
- optional rerank 不破坏 fallback。
- citation audit 拒绝非本轮 child evidence。
- trace 可定位 retrieval、merge、rerank、gate、audit 问题。

Phase 4 完成后：

- 单 Agent 只能调用白名单工具。
- 工具输入输出 schema-first。
- LangGraph 若启用，不影响确定性 RAG fallback。
- workflow events/checkpoints 只保存摘要级状态。

Phase 5-6 完成后：

- memory 不污染事实回答。
- 制卡和学习工具遵守同一套 source grounding。
- multi-agent 只在复杂任务触发，普通任务仍可走 single-agent 或确定性 workflow。
- multi-agent 失败时可直接回退对应确定性 workflow。
