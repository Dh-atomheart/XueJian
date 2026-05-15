# Embedding 与混合检索升级蓝图

本文定义 XueJian 后续 embedding 与 hybrid retrieval 的升级方向。它是“检索与嵌入质量基础设施蓝图”，用于指导后续开发，不要求本轮立即重构代码。

全局路线以 [RAG -> Agent -> Multi-Agent 升级总路线图](./rag-agent-upgrade-roadmap.md) 为准。本文负责其中 Phase 2: Retrieval Foundation；文内 Phase A-F 是本专项的内部实施子阶段，不覆盖总纲的全局 Phase 编号。LangGraph 和多 Agent runtime 不属于本文实现前提。

分工说明：

- [Chunking 优化策略](./chunking-optimization-strategy.md) 负责定义 Section/Parent/Child 证据单元如何生成、如何保留 metadata，并同时服务 RAG 与制卡。
- [RAG Retrieval Quality 2.0](./rag-retrieval-upgrade.md) 负责定义证据单元在 auto-merge、rerank、relevance gate、packing、citation audit 和 trace UI 中如何使用。
- 本文负责更底层的 embedding profile、query embedding cache、SQLite FTS5/BM25、中文词法增强、RRF hybrid fusion、增量 embedding 和检索 trace 约束。

## 1. 定位与目标

本文不是第二套 RAG 服务，也不是通用 Agent 规划。目标是在现有 Rust/SQLite/Host Gateway 与 Python orchestration 之间，建立更高质量、更可诊断、更可渐进落地的检索底座。

目标：

- 保持本地优先：正式检索主链路仍基于 SQLite、sqlite-vec、FTS5/BM25 和 Host Gateway。
- 保持引用忠实：正式回答不得绕过 embedding gate，不得在缺少 embedding 时降级为 FTS-only grounded answer。
- 提升召回质量：同时增强向量召回、词法召回、中文/中英混合 query、query rewrite 与 second retrieval。
- 提升排序质量：在 RRF 后提供可选 rerank 层，并用 relevance gate 判断是否回答、二次检索或拒答。
- 降低重复成本：通过 chunk content hash、profile revision 和 dimension locking 做 chunk 级增量 embedding。
- 提升可诊断性：把 embedding、hybrid recall、fusion、rerank、gate、audit 的摘要落到 trace payload。

不做事项：

- 不引入第二套远端 RAG 服务作为主链路。
- 不绕过现有 Rust/SQLite/Host Gateway。
- 不保存完整 prompt、chain-of-thought、API key 或未裁剪长正文。
- 不把 rewrite、rerank、metadata、memory 或 parent context 当作 citation source。

## 2. 当前状态诊断

现有基础：

- 已有 active embedding profile 与 embedding readiness gate。
- 已有 query embedding cache，且 cache identity 已考虑 profile/model/dimensions/revision 等信息。
- 已有 sqlite-vec chunk embedding 存储与向量检索能力。
- 已有 SQLite FTS5/BM25 实现骨架。
- 已有 RRF hybrid fusion，将 lexical 与 vector 两条召回腿合并。
- Python 解析侧已经形成 Section -> Parent -> Child 的 chunking 雏形，embedding workflow 优先使用 child chunks。

主要不足：

- 正式 hybrid 入口需要确认并统一走真实 FTS5/BM25 路径，避免继续依赖 MVP0 `contains + term count` 弱检索。
- 中文短 query、中文术语 query、中英混合 query 的词法召回仍偏弱，需要字符 n-gram/trigram 辅助。
- RRF 后直接进入 packing，缺少专门判断“证据是否真正回答问题”的 rerank 层。
- child chunk 命中后还没有稳定扩展到 parent/section context，回答上下文容易过窄。
- chunk embedding state 仍偏粗，缺少 chunk content hash、chunking profile revision、embedding profile revision 级别的跳过机制。
- 自定义 embedding 模型维度为 0 时，cache 与维度校验能力会变弱。
- query embedding 当前主要使用用户原始问题，多轮省略、口语化和中英混合问题会影响召回。

## 3. 目标链路

目标 pipeline：

```text
user question
-> query analysis
-> optional query rewrite
-> query embedding/cache
-> hybrid recall
-> RRF fusion
-> parent/child auto-merge
-> rerank evidence
-> relevance gate
-> optional second retrieval
-> context packing
-> grounded answer
-> citation audit
-> trace payload
```

每一步边界：

- `query analysis` 判断是否需要 rewrite、是否是短 query、是否包含中英混合术语、是否依赖历史对话。
- `optional query rewrite` 只服务检索，不替代用户原始问题，不生成 citation。
- `query embedding/cache` 生成或复用 query vector，必须校验 active profile 与 dimensions。
- `hybrid recall` 同时执行 lexical recall 与 vector recall，并受 document scope 约束。
- `RRF fusion` 融合两条召回腿，输出可诊断的 rank 与 score 摘要。
- `parent/child auto-merge` 将命中的 child evidence 扩展为受控 parent/section context。
- `rerank evidence` 只改变证据排序和保留集合，不生成事实。
- `relevance gate` 只决定进入回答、触发二次检索或拒答。
- `context packing` 区分可引用 child evidence 与不可直接引用的 expanded context。
- `citation audit` 只接受本轮 retrieved child chunks。
- `trace payload` 只保存摘要级诊断。

## 4. Embedding 策略增强

### 4.1 Child-first Embedding

第一版 embedding 仍优先打在 child/leaf chunks 上：

- child chunk 是 embedding、召回、citation、source quote 和制卡的最小稳定证据单元。
- parent/section 主要用于回答上下文扩展，不直接参与 citation。
- 如果未来需要 parent embedding，只能作为辅助召回信号，不能替代 child citation。

### 4.2 Chunk 级增量

chunk embedding state 应能判断“这个 chunk 是否需要重新 embedding”。建议记录或等价维护：

```text
chunk_id
chunk_content_hash
chunking_profile_id
chunking_profile_revision
embedding_profile_id
embedding_profile_revision
embedding_dimensions
embedded_at
```

需要重嵌的情况：

- chunk content hash 变化。
- chunking profile 或 revision 变化。
- embedding profile、revision、model 或 dimensions 变化。
- 当前 active profile 下没有对应 embedding state。

不需要重嵌的情况：

- 文档重新跑任务，但 chunk content hash 与相关 profile identity 都未变化。
- query embedding cache 命中，且 dimensions 与 profile revision 一致。

### 4.3 Profile Revision 与 Stale Detection

embedding profile 的变更应明确触发 stale：

- provider 变化。
- model 变化。
- dimensions 变化。
- distance metric 变化。
- base URL 或兼容模式变化导致输出语义空间可能不同。

chunking profile 的变更也应触发 stale：

- child chunk 粒度变化。
- parent/section 生成规则变化。
- metadata/schema 影响 citation 或 source quote 映射。

### 4.4 Dimension Locking

自定义 embedding 模型不能长期以 `dimensions = 0` 运行。

推荐策略：

- UI 创建自定义 embedding profile 时优先要求用户填写 dimensions。
- 如果用户未填写，首次 embedding 成功后根据返回 vector 长度锁定 dimensions。
- 后续 query embedding 与 chunk embedding 都必须校验 dimensions。
- dimensions 不一致时返回明确错误，并要求重新生成对应 profile 的文档向量。

## 5. 词法检索增强

正式 hybrid retrieval 必须使用 SQLite FTS5/BM25 作为 lexical leg 的主实现，而不是全量加载 chunks 后做 `contains` 与简单 term count。

第一版词法增强：

- 英文、数字、API 名、专业术语使用 FTS5 term/phrase 查询。
- 中文短 query 生成字符 2-gram 或 3-gram 辅助匹配。
- 中英混合 query 同时保留英文术语、数字符号和中文 n-gram。
- lexical recall 必须受 document scope 约束。
- FTS5 查询失败时可以降级为安全的简单搜索，但 trace 必须标记 `lexicalStatus: "fallback"`。

推荐输出字段：

```text
lexicalRank
lexicalScore
lexicalSource: fts5_bm25 | ngram | fallback
matchedTermsSummary
```

不在第一版引入重量级外部分词服务。后续如果评估 jieba、tantivy 或 Meilisearch，也只能作为可选增强，不能替代 SQLite 主链路。

## 6. Hybrid Fusion 策略

hybrid recall 应保留两条腿：

- lexical leg：FTS5/BM25 + 中文 n-gram/trigram 辅助。
- vector leg：sqlite-vec 查询 active embedding profile 下的 child chunk vectors。

RRF fusion 规则：

- lexical 与 vector 各召回 24-50 条候选。
- RRF 合并后保留可诊断的来源、rank、score。
- 同一 chunk 多路命中时合并 score。
- 同一 parent/section 下多个 child 命中时暂不在 RRF 层去掉，留给 auto-merge 与 packing 处理。

推荐候选字段：

```text
chunkId
documentId
sectionId
anchorId
chunkKind
content
lexicalRank
lexicalScore
vectorRank
vectorScore
rrfScore
retrievalQuerySource
retrievalMode
```

document scope 是硬边界。任何 vector、lexical、rewrite 或 second retrieval 都不得混入未选文档。

## 7. Query Rewrite 与二次检索

query rewrite 第一版按需触发，而不是每次强制触发。

触发条件：

- 当前问题依赖历史对话，例如“它的优缺点是什么”。
- query 太短，无法稳定召回。
- query 中含有中英混合术语但表达不完整。
- 首轮检索 relevance gate 判定证据不足。

策略：

- 保留 `originalQuery`。
- 生成 `standaloneRetrievalQuery`。
- original query 与 rewrite query 双路召回。
- 最终回答仍回应用户原始问题。
- rewrite query 不展示为事实来源，不作为 citation source。

second retrieval：

- relevance gate 低分时最多触发一次。
- 可使用 rewrite、step-back query 或 HyDE-style query。
- 二次检索仍必须经过 embedding gate、hybrid recall、RRF、auto-merge、rerank、packing 和 citation audit。
- 二次仍无证据时返回 `no_relevant_content`，不得强答。

## 8. Rerank 与 Relevance Gate

rerank 插入点：

```text
hybrid recall -> RRF fusion -> parent/child auto-merge -> rerank evidence -> relevance gate -> packing
```

rerank provider 第一版采用可选 adapter：

- `disabled`：保留 RRF 排序，trace 标记 `rerankStatus: "disabled"`。
- `local_rule`：使用 RRF、BM25、vector score、query term coverage、section/title match 做轻量重排。
- `llm_provider`：使用配置好的 LLM 对 evidence 相关性打分。

rerank 输入限制：

- 用户原始问题。
- rewrite query 摘要。
- child snippet。
- 必要 parent/section 摘要。
- 不传完整长文档。

rerank 输出只影响：

- evidence 排序。
- evidence 保留集合。
- diagnostics/trace。

relevance gate 决策：

```text
answer
second_retrieval
no_relevant_content
```

gate 判断依据：

- top evidence rerank score 或 local relevance score。
- 命中 child chunks 数量。
- 命中文档数。
- citation 是否可追溯到本轮 child evidence。
- 是否已经执行过 second retrieval。

gate 不生成事实，不补充 citation。

## 9. Parent/Child Auto-Merge 接口要求

auto-merge 的数据前提由 [Chunking 优化策略](./chunking-optimization-strategy.md) 约束。检索链路需要能读到：

```text
sectionId
anchorId
chunkKind
childIndex
parentId 或可等价推导的 section/parent relation
metadata
```

接口边界：

- hybrid recall 返回 child chunks 作为主要 evidence。
- auto-merge 根据 child 命中扩展 parent/section context。
- expanded context 进入 answer context，但不自动成为 citation source。
- citation audit 只接受本轮 retrieved child chunks。
- parent expansion 不能跨 document scope。

packing 时应明确区分：

```text
citationEvidence: 可引用 child chunks
expandedContext: 不可直接引用的 parent/section context
```

## 10. Trace 与隐私边界

trace 分为用户可见层与开发诊断层。

用户可见层：

```text
embeddingReadiness
retrievalMode
queryRewriteUsed
retrievedDocumentCount
parentMergeStatus
rerankStatus
relevanceGateDecision
citationAuditStatus
failureReason
```

开发诊断层：

```text
originalQuerySummary
rewrittenQuerySummary
retrievedChunkRefs
lexicalScoreSummary
vectorScoreSummary
rrfScoreSummary
expandedParentRefs
rerankScoreSummary
secondRetrievalUsed
contextBudgetSummary
citationAuditSummary
durationMsByStep
```

禁止记录：

- 完整 prompt。
- chain-of-thought。
- API key。
- 未裁剪长正文。
- 完整长会话历史。
- 未经脱敏的敏感文档内容。

## 11. 分阶段实施

### Phase A: Hybrid 路径修正

- 正式 QA hybrid 入口统一走 SQLite FTS5/BM25 lexical leg。
- 增加中文 n-gram/trigram 辅助召回。
- 保留 embedding gate 和 no FTS-only 正式回答边界。
- trace 记录 lexical source、fallback 状态和候选数量。

### Phase B: 增量 Embedding

- 扩展 chunk embedding state 身份字段。
- document embedding workflow 增加 unchanged chunk skip。
- profile revision 或 dimensions 变化时标记 stale。
- 自定义模型 dimensions 必须填写或首次成功后锁定。

### Phase C: Query Rewrite

- 增加按需 rewrite 节点。
- original query 与 rewrite query 双路召回。
- rewrite 失败时降级为 original query。
- rewrite 结果只用于检索，不进入 citation source。

### Phase D: Parent/Child Auto-Merge

- 保证入库和 Host Gateway 保留 section/chunk metadata。
- child 命中后扩展 parent/section context。
- packing 区分 citation evidence 与 expanded context。
- citation audit 仍只校验 child chunks。

### Phase E: Rerank 与 Relevance Gate

- 增加 rerank adapter。
- 默认支持 `disabled` 与 `local_rule`。
- LLM rerank 需要用户显式配置。
- gate 低分时允许一次 second retrieval。
- 二次仍低分时返回 `no_relevant_content`。

### Phase F: Trace UI

- answer payload 与 workflow event 返回摘要级 trace。
- UI 展示用户可见阶段摘要。
- diagnostics 展示 score、chunk refs、merge、rerank、gate、audit 摘要。
- trace 隐私边界写入验收测试。

## 12. 验收标准

检索质量：

- 正式 QA hybrid 入口走 FTS5/BM25，而不是 MVP0 `contains + term count`。
- 中文短 query 与中英混合术语 query 能通过 lexical leg 提升召回。
- vector leg 与 lexical leg 都能贡献候选，并在 trace 中可见。
- document scope 始终生效。

Embedding 成本与稳定性：

- 未变化 chunk 第二次 embedding 被跳过。
- 修改 chunk 内容后只重嵌变更 chunk。
- embedding profile 或 chunking profile revision 变化后文档标记 stale。
- 自定义 embedding 模型维度必须校验或首次锁定。

Rewrite 与二次检索：

- 多轮省略问题能生成 standalone retrieval query。
- original query 始终参与召回。
- rewrite 失败不阻断原 query 检索。
- 低相关首轮允许一次 second retrieval。
- 二次仍无证据时拒答。

Rerank 与 gate：

- rerank 关闭时链路仍可用。
- rerank 开启时 top evidence 相关性不低于 RRF-only baseline。
- 低相关 evidence 不应强行生成 grounded answer。
- gate 决策只影响流程，不生成事实。

引用忠实：

- citations 只来自本轮 retrieved child chunks。
- parent context 可辅助理解，但不能直接成为 citation source。
- rewrite、rerank、memory、metadata 不得成为 citation source。

Trace 隐私：

- UI 显示检索模式、命中文档数、rewrite/merge/rerank/audit 状态。
- diagnostics 显示 chunk refs 与 score 摘要。
- trace 不包含完整 prompt、API key、chain-of-thought 或未裁剪正文。

## 13. 与现有文档的关系

- `rag-knowledge-qa.md` 是正式 RAG 问答契约，本文不得推翻其中的 embedding gate、no FTS-only、citation 忠实边界。
- `chunking-optimization-strategy.md` 定义证据单元如何生成，本文定义这些证据单元如何被 embedding、召回和融合。
- `rag-retrieval-upgrade.md` 定义 RAG Retrieval Quality 2.0 的证据链流程，本文定义更底层的 embedding 与 hybrid retrieval 底座。
- `rag-context-engineering.md` 定义多轮上下文、query rewrite、token budget 与记忆边界，本文只约束 rewrite 在检索侧的输入输出。
- Agent 文档中的相关能力应先作为单 Agent workflow 工具节点落地，不提前拆成多 Agent supervisor。
