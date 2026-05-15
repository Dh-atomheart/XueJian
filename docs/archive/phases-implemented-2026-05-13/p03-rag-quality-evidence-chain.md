# P03 RAG Quality Evidence Chain

本阶段对应 [升级总路线图](../rag-agent-upgrade-roadmap.md) 的 Phase 3 前半段。目标是先把 RAG 证据链做忠实：child 负责召回和引用，parent/section 负责回答上下文扩展。

## 目标

- 实现 Parent/Child Auto-Merge。
- child 命中后可扩展受控 parent/section context。
- citation 仍只指向本轮 retrieved child chunks。
- 实现 context packing、citation audit、基础 trace payload。

## 前置条件

- P01 已完成，结构化 chunk 与 metadata 可用。
- P02 已完成，正式 hybrid retrieval 可用。
- 已阅读 [RAG Retrieval Quality 2.0](../rag-retrieval-upgrade.md) 和 [RAG Context Engineering](../rag-context-engineering.md)。

## 改动范围

- 增加 `merge_parent_context` 等价能力：根据命中 child 扩展同 parent 或同 section 的邻近上下文。
- 对扩展上下文做去重、预算控制和顺序稳定化。
- packing 同时保留 answer context 和 citation child refs。
- citation audit 拒绝非本轮 retrieved child evidence。
- trace payload 记录 retrieval、merge、packing、audit 的摘要。

## 不做事项

- 不提前引入 Agent runtime。
- 不把 parent context、section context 或 metadata 作为 citation source。
- 不强制启用 query rewrite、rerank 或 relevance gate。
- 不保存完整 prompt、chain-of-thought、API key 或未裁剪正文到 trace。

## 验收标准

- 命中 child chunk 后，回答上下文能包含对应 parent/section 的受控扩展内容。
- citation 仍能追溯到原始 child chunk。
- 对定义、步骤、跨段总结类问题，回答上下文比 flat child-only 更完整。
- citation audit 能拒绝不存在于本轮 retrieved child chunks 的引用。
- trace 能显示命中文档数、merge 摘要、packing 摘要和 audit 状态。

## 退出门槛

- RAG 回答具备可诊断、可审计的证据链。
- P04 可以在不破坏 citation 忠实边界的前提下加入 rewrite、rerank、gate 和 trace UI。

## 执行状态

状态：已完成。

说明：parent/section context 仍只作为回答背景，不作为 citation source；citation audit 继续只接受本轮 retrieved child chunks。
