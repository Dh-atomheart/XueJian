# P02 Hybrid Retrieval Foundation

本阶段对应 [升级总路线图](../rag-agent-upgrade-roadmap.md) 的 Phase 2。目标是先把 hybrid retrieval 底座做稳，再进入更复杂的 RAG 证据链增强。

## 目标

- 正式 QA hybrid 入口使用 SQLite FTS5/BM25 + vector recall。
- 中文短 query 和中英混合 query 增加字符 n-gram/trigram 辅助召回。
- 引入 chunk 级增量 embedding：content hash、chunking profile revision、embedding profile revision。
- 自定义 embedding dimensions 必须填写或首次成功后锁定。
- RRF fusion 输出可诊断 score 和来源摘要。

## 前置条件

- P01 已完成。
- 已阅读 [Embedding 与混合检索升级蓝图](../embedding-hybrid-retrieval-upgrade.md)。
- child chunk、metadata、profile revision 可从 Host Gateway 读取。

## 改动范围

- 将正式 QA 的 lexical leg 从 `contains + term count` 升级为 FTS5/BM25。
- 当 FTS5/BM25 异常或空结果时，允许 `contains` fallback 作为诊断降级，但它不是正式 lexical leg，且必须通过 trace 标记为 `lexicalSource=fallback`。
- 保留 vector recall，并通过 RRF 融合 vector 与 lexical 两条腿。
- 为中文和中英混合查询建立不依赖外部分词服务的辅助索引策略。
- 对未变化 child chunk 跳过重复 embedding。
- 对 embedding model dimension 做配置校验或首次锁定。

## 不做事项

- 不把 FTS-only 作为正式 grounded answer 路径。
- 不把 `contains` fallback 当作正式 lexical leg，也不允许它单独支撑 grounded answer。
- 不把 rerank 或 auto-merge 作为本阶段硬依赖。
- 不引入 query rewrite 作为所有请求的强制前置步骤。
- 不引入 LangGraph 或 Agent 工具编排。

## 验收标准

- 正式 QA hybrid 入口不再依赖 MVP0 的全量加载 contains 检索。
- 中文短 query 和中英混合术语 query 能通过 lexical leg 提升召回。
- 未变化 chunk 第二次 embedding 可跳过。
- 自定义 embedding 模型维度可校验，或首次 embedding 成功后被锁定。
- RRF 结果能显示 vector、lexical 来源和基本 score trace。
- 当 `lexicalSource=fallback` 时，trace 能明确显示词法降级；该路径只能进入 `excerpt_fallback` 或拒答，不能形成 grounded answer。

## 退出门槛

- P03 可以基于稳定 hybrid recall 获得候选 child chunks。
- lexical、vector、RRF 任一环节出现问题时，可通过 trace 或日志定位。

## 执行状态

状态：已完成。

修复补充：正式 lexical 主路径为 FTS5/BM25；`contains` fallback 仅保留为诊断降级，并在后续 P04 收口中继续通过 trace 和降级回答边界约束其影响范围。
