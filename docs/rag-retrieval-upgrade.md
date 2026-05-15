# RAG 检索质量升级蓝图

本文档定义 XueJian RAG Retrieval Quality 2.0 的专项升级路线。它位于 RAG 数据结构和检索底座稳定之后、学习问答 Agent 工具化之前，用于把现有“可用 RAG”升级为“可调、可诊断、证据质量更稳定的学习型 RAG”。

全局路线以 [RAG -> Agent -> Multi-Agent 升级总路线图](./rag-agent-upgrade-roadmap.md) 为准。本文负责其中 Phase 3: RAG Quality 2.0；它依赖 chunking 结构落库和 hybrid/embedding 检索底座，不应被理解为早于这些基础阶段的第一步。

本文不新增第二套 RAG 服务，不推翻现有 Rust/SQLite/Host Gateway 权威边界，不要求立即引入 LangGraph 或多 Agent。所有能力应先作为现有 `knowledge_qa` workflow 或单 Agent 工具链中的受控步骤落地。

分工说明：[Chunking 优化策略](./chunking-optimization-strategy.md) 负责定义 Section/Parent/Child 如何生成、保留 metadata 并同时服务 RAG 与制卡；[Embedding 与混合检索升级蓝图](./embedding-hybrid-retrieval-upgrade.md) 负责定义 embedding profile、FTS5/BM25、中文 n-gram、RRF、query cache、增量 embedding 与 hybrid retrieval trace 的检索底座；本文负责定义这些证据单元在检索后的 auto-merge、rerank、门控、packing、citation audit 和 trace UI 中如何使用。

## 1. 定位与目标

目标：

- 提高检索证据与用户问题的相关性。
- 让短 chunk 负责精确召回，让 parent/section 上下文负责回答理解。
- 在生成回答前增加 rerank 和相关性门控，降低错引、弱证据强答和幻觉。
- 把 RAG trace 以摘要方式落到 workflow event、diagnostics 和 UI，方便用户理解状态、开发者定位问题。

非目标：

- 不做通用聊天、开放域搜索或跨文档知识图谱。
- 不绕过现有 embedding gate、citation validation 和无证据拒答策略。
- 不保存完整 prompt、完整 chain-of-thought、完整敏感文档正文或 API key。
- 不把 rerank、trace、memory 或 query rewrite 结果当作 citation source。

## 2. 当前差距

当前 XueJian RAG 已具备：

- active embedding profile 和 embedding readiness gate。
- query embedding 与持久化 query embedding cache。
- SQLite FTS5 + sqlite-vec 的 hybrid search。
- RRF 融合排序、chunk packing 和 near-duplicate 去重。
- LLM JSON answer、citation normalization 和 no evidence 策略。
- Ragas/LangSmith 评估文档基础。

主要差距：

- 缺少 Parent/Child Auto-merging：child chunk 命中后，没有自动扩展到 parent/section 上下文。
- 缺少 rerank 层：RRF 后没有专门判断“这个 chunk 是否真正回答当前问题”。
- 缺少相关性门控和二次检索：低相关召回时容易直接进入回答或简单 no_hits，没有稳定的 rewrite/HyDE/step-back 补救路径。
- 缺少 RAG trace UI：检索、合并、rerank、门控、citation audit 的过程没有形成用户可见摘要和开发诊断数据。

## 3. 目标链路

升级后的推荐链路：

```text
user question
-> load conversation context
-> optional query rewrite
-> hybrid recall
-> parent/child auto-merge
-> rerank evidence
-> relevance gate
-> optional second retrieval
-> context packing
-> grounded answer
-> citation audit
-> trace payload
-> persist answer / events / diagnostics
```

每一步的边界：

- `query rewrite` 只服务检索，不替代用户原始问题。
- `hybrid recall` 仍必须通过 embedding gate，不允许缺少 embedding 时做 FTS-only 正式回答。
- `parent/child auto-merge` 可以扩大回答上下文，但 citation 仍必须追溯到本轮命中的 child chunk。
- `rerank evidence` 只改变排序和保留集合，不生成事实。
- `relevance gate` 只决定继续检索、拒答或进入回答，不直接生成答案。
- `trace payload` 只保存摘要级诊断，不保存完整 prompt 或 chain-of-thought。

## 4. Parent/Child Auto-merging

目标是让叶子 chunk 负责召回精度，让 parent/section 提供回答所需的完整语义边界。

推荐规则：

- embedding 仍优先打在 child/leaf chunk 上。
- hybrid recall 返回 child chunk 后，根据 `sectionId`、`anchorId`、`chunkIndex`、metadata 或后续 parent 关系扩展 parent/section context。
- parent context 只进入 answer context，不自动成为 citation。
- citation 的 `chunkId` 必须来自本轮 retrieved child chunk set。
- 如果 parent content 很长，按 token budget 裁剪为与 child 命中位置相邻的窗口。
- 同一 parent 下多个 child 命中时合并 parent context，避免重复塞入。

输出建议：

```text
retrieved_child_chunks
expanded_parent_contexts
merge_summary
context_budget_summary
```

验收重点：

- child chunk 命中后，回答能利用 parent/section 中的必要上下文。
- citation 仍能追溯到 child chunk。
- parent expansion 不得绕过 document scope。
- parent expansion 不得把未命中文档的内容混入回答上下文。

## 5. Rerank 与相关性门控

Rerank 插入点：

```text
hybrid recall -> parent/child auto-merge -> rerank evidence -> packing
```

第一阶段推荐做成可选能力：

- 如果配置了 rerank provider，则对候选 evidence 计算 `rerankScore`。
- 如果没有 rerank provider，则保留 RRF 排序，并在 trace 中标记 `rerankStatus: "disabled"`。
- rerank 输入应使用当前问题、rewrite query、child snippet 和必要 parent 摘要，不传入完整长文档。
- rerank 输出只能影响排序、保留和 diagnostics，不直接写入最终答案。

相关性门控：

- 如果 top evidence 的 rerank/相关性分数明显不足，先判断是否可以二次检索。
- 二次检索可使用改写 query、step-back query 或 HyDE-style query，但结果仍必须经过 embedding gate、hybrid recall、merge、rerank 和 citation audit。
- 如果二次检索仍无足够证据，返回 `no_relevant_content`。
- 不允许因为用户强烈要求或 memory 暗示某结论，就绕过证据门控生成 grounded answer。

输出建议：

```text
rerank_status
reranked_chunk_refs
top_evidence_score
relevance_gate_decision
second_retrieval_reason
```

## 6. RAG Trace UI

Trace 的目标是让用户知道系统正在做什么，让开发者能定位检索质量问题，而不是暴露完整 agent 思考过程。

用户可见 trace 建议：

- `正在改写问题`：仅显示“已结合上下文改写检索问题”，默认不展示完整 rewritten query。
- `正在检索证据`：显示检索模式、文档范围和命中文档数。
- `正在扩展上下文`：显示已合并相邻片段或章节上下文。
- `正在重排证据`：显示是否启用 rerank。
- `证据不足，正在补充检索`：仅在触发二次检索时显示。
- `正在校验引用`：显示引用是否全部来自本轮检索。

开发诊断可见信息：

```text
rewritten_query_summary
retrieval_mode
candidate_count
retrieved_chunk_refs
expanded_parent_refs
rrf_scores
rerank_scores
relevance_gate_decision
second_retrieval_used
citation_audit_summary
context_budget_summary
duration_ms_by_step
```

禁止记录或展示：

- 完整 API key。
- 完整 prompt。
- 完整 chain-of-thought。
- 未裁剪的长文档正文。
- 不必要的完整用户历史对话。

## 7. Agent 工具化映射

这些能力应先作为单 Agent 工具链或 workflow step 落地，不要求立即拆成多 Agent。

推荐工具：

- `rewrite_query`：生成 standalone retrieval query。
- `retrieve_evidence`：执行 embedding gate 与 hybrid recall。
- `merge_parent_context`：把 child chunk 命中扩展为 parent/section context。
- `rerank_evidence`：对候选 evidence 重排并输出分数摘要。
- `grade_retrieval_relevance`：判断是否足够回答、是否需要二次检索或拒答。
- `pack_context`：按 token budget 打包 evidence。
- `write_grounded_answer`：基于 packed evidence 输出 JSON answer。
- `audit_citations`：校验 citations 来自本轮 child chunk。
- `build_rag_trace`：生成用户可见和开发诊断两级 trace。

工具边界：

- 每个工具必须有 input/output schema。
- 写入 workflow events/checkpoints 仍走 Rust Host Gateway。
- 工具不得直接写 SQLite 业务表。
- 工具输出的 trace 是摘要，不是模型推理链。

## 8. 分阶段实施

本章是本文专项的内部实施子阶段，对应总纲 Phase 3: RAG Quality 2.0。它依赖两个前置条件：Section/Parent/Child 结构与 metadata 已可靠落库，以及正式 hybrid retrieval 已使用稳定的 embedding 与 FTS5/BM25 检索底座。

### Phase 3A：Parent/Child Auto-merging

- 明确 embeddable child chunk 和 parent/section context 的映射。
- 在检索后、packing 前加入 parent expansion。
- citation 保持 child chunk 级别。
- 增加 parent expansion 的单元测试和端到端 smoke。

### Phase 3B：Rerank Layer

- 增加可选 rerank provider 或 adapter。
- 在 RRF 后、packing 前输出 `rerankScore`。
- 无 provider 时保持现有 RRF fallback。
- Ragas/LangSmith 评估中记录 rerank 前后 top evidence 差异。

### Phase 3C：Relevance Gate 与二次检索

- 增加低相关度判定。
- 支持 rewrite/step-back/HyDE-style 二次检索。
- 二次检索仍必须走相同的 gate、merge、rerank 和 audit。
- 二次仍无证据时稳定返回 `no_relevant_content`。

### Phase 3D：RAG Trace UI

- 后端返回摘要级 trace payload。
- workflow events 记录每个关键阶段的开始、完成、失败和质量摘要。
- UI 展示阶段状态、引用审计和失败原因。
- 开发诊断面板可查看 chunk refs、scores 和 audit summary。

## 9. 验收标准

检索质量：

- 单文档问题能命中正确 child chunk，并扩展到必要 parent/section context。
- 多文档问题不会把不同文档的 parent context 混合成无来源结论。
- rerank 后 top evidence 与问题相关性不低于 RRF-only baseline。
- 低相关证据不会强行进入 grounded answer。

引用忠实：

- citations 只来自本轮 retrieved child chunks。
- parent context 可以支持解释，但不能生成无法追溯的 citation。
- snippet 必须能从对应 child chunk 裁剪或近似匹配。
- citation 全部无效时必须拒答或进入受控 fallback。

无证据策略：

- 首轮无足够证据时可以二次检索。
- 二次检索仍无足够证据时返回 `no_relevant_content`。
- memory、rewrite、rerank 结果都不能补事实。

Trace 与隐私：

- UI 能显示当前 RAG 阶段、检索模式、命中文档数、是否启用 rerank、citation audit 状态。
- 开发诊断能看到 chunk refs、scores、merge/rerank/gate/audit 摘要。
- trace 不包含完整 prompt、API key、chain-of-thought 或未裁剪敏感正文。

兼容性：

- 不破坏现有 `answer_payload` 的基本字段。
- 未配置 rerank provider 时仍可使用现有 RAG 链路。
- 未完成 embedding 的文档仍被阻止进入正式回答。
- FTS-only 仍不得作为正式 grounded answer 路径。
