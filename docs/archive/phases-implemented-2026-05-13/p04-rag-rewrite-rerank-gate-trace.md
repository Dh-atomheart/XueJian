# P04 RAG Rewrite, Rerank, Gate, Trace

本阶段对应 [升级总路线图](../rag-agent-upgrade-roadmap.md) 的 Phase 3 后半段。目标是在证据链已经可靠的基础上，提高召回、排序、拒答和可诊断能力。

## 目标

- 加入按需 query rewrite。
- 首轮低相关时允许一次 second retrieval。
- 引入 optional rerank，支持关闭、本地规则 fallback 或 LLM provider。
- 引入 relevance gate，决定 answer、second retrieval 或 no relevant content。
- 完善 RAG trace UI。

## 前置条件

- P03 已完成。
- citation audit 和基础 trace payload 已经可用。
- 已阅读 [Embedding 与混合检索升级蓝图](../embedding-hybrid-retrieval-upgrade.md)、[RAG Retrieval Quality 2.0](../rag-retrieval-upgrade.md) 和 [RAG Context Engineering](../rag-context-engineering.md)。

## 改动范围

- 多轮指代、短 query、低相关召回时触发 rewrite，原 query 始终保留参与召回。
- rerank 插入在 RRF 后、packing 前，只改变 evidence 排序，不生成事实。
- relevance gate 只做流程决策，不生成事实。
- second retrieval 最多补检索一次，二次仍无证据则拒答。
- trace UI 展示用户可见阶段摘要和开发诊断字段。

## 不做事项

- 不让 rewrite query 成为 citation source。
- 不让 rerank score、gate result 或 memory 成为 citation source。
- 不要求 rerank provider 成为硬依赖。
- 不保存完整 prompt、chain-of-thought、API key、未裁剪长正文或敏感正文。

## 验收标准

- rewrite 只服务检索，原 query 始终参与召回。
- rerank 关闭时链路可用；开启时 top evidence 相关性不低于 RRF-only baseline。
- 首轮低相关时可触发一次 second retrieval。
- 二次检索仍无证据时系统拒答，而不是强行生成 grounded answer。
- trace UI 显示检索模式、命中文档数、rewrite/second retrieval/rerank/gate/audit 摘要。
- 当 `lexicalSource=fallback` 时，trace UI 必须显示“词法降级”，并提示重建索引或检查 FTS5。
- trace UI 不显示完整 prompt、API key、chain-of-thought 或未裁剪正文。
- 只有在 `npm run build` 通过后，本阶段才允许标记完成。

## 退出门槛

- RAG 质量链路可作为稳定工具能力供 P05 单 Agent 包装。
- rewrite、rerank、gate 任一能力关闭时，确定性 RAG fallback 仍可工作。

## 修复后验收记录

状态：已完成（2026-05-12）。

本次收口确认项：

- `npm.cmd run build` 通过。
- `npx vitest run tests/unit/knowledge-qa-result.test.ts tests/unit/knowledge-qa-page.test.tsx` 通过（25 tests passed）。
- `python -m pytest tests/unit/test_document_embedding.py tests/unit/test_knowledge_qa_p03.py tests/unit/test_knowledge_qa_p04.py tests/unit/test_orchestration_server_ragas_eval.py -q` 通过（19 passed）。
- `cargo check` 与 `cargo test` 通过。

修复补充：

- `ragTrace` 前端契约已从 loose schema 收紧到具体 summary schema，并为缺字段与错误类型提供稳定默认值。
- `retrievalMode=fts5` 且 `lexicalSource=fallback` 时，只允许输出降级摘录或拒答，不允许生成 grounded answer。
- trace 诊断面板仅展示白名单摘要字段，不暴露 prompt、provider raw response、API key 或未裁剪正文。
