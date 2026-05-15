# P05 Single Agent QA Workflow

本阶段对应 [升级总路线图](../rag-agent-upgrade-roadmap.md) 的 Phase 4。目标是把已经稳定的 RAG 能力包装成单 Agent 白名单工具，而不是提前拆成多 Agent。

## 目标

- 建立 schema-first tool registry。
- 将 Phase 3 稳定 RAG 能力包装为单 Agent QA workflow。
- LangGraph 可作为单 Agent runtime 选项，但不是前置条件。
- 保留确定性 RAG fallback。

## 前置条件

- P03 和 P04 已完成。
- RAG 工具能力、trace、citation audit、fallback 均已稳定。
- 已阅读 [Multi-Agent Development Guide](../multi-agent-development-guide.md)。

## 改动范围

- 最小工具集包括 `retrieve_evidence`、`merge_parent_context`、`rerank_evidence`、`grade_retrieval_relevance`、`pack_context`、`audit_citations`、`build_rag_trace`。
- 工具输入输出必须 schema-first，可被测试和审计。
- 单 Agent workflow 只调用白名单工具。
- workflow event 和 checkpoint 只保存摘要级状态。
- Agent 输出仍必须经过 citation audit。

## 不做事项

- 不开放多 Agent supervisor。
- 不开放长期 memory 写入。
- 不开放制卡、复习调度等高影响工具。
- 不允许 Agent tool 直接写 SQLite 业务表。
- 不保存完整 prompt、chain-of-thought 或敏感正文到 checkpoint。

## 验收标准

- 单 Agent QA 能复用 P03/P04 的 RAG 工具链。
- 工具调用失败时可以回退到确定性 RAG fallback。
- Agent 不能引用非本轮 retrieved child chunks。
- LangGraph 若启用，不影响非 LangGraph fallback。
- trace 能定位到工具、输入 schema、输出摘要和错误类别。

## 退出门槛

- 单 Agent QA 在学习问答场景下稳定可用。
- 工具契约足够稳定，可在 P06 中逐步开放 memory 和 card tools。

