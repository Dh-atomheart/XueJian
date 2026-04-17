# V2阶段模块实施索引

## 阶段目标

V2 在不破坏 MVP 学习闭环的前提下，新增知识库问答、多格式导入和积分激励能力。

AI 相关模块继续服从 [ai-architecture-decision.md](../../ai-architecture-decision.md) 中的 `Python Orchestration Service + LangChain now / LangGraph later` 口径。

## 模块顺序

1. [V2-1 知识库问答模块](./v2-1-rag.md)
2. [V2-2 积分系统模块](./v2-2-points-system.md)
3. [V2-3 多格式文档导入模块](./v2-3-multi-format-import.md)

## 依赖关系

- `V2-1` 依赖 MVP 的 `DocumentChunk`、`DocumentAnchor`、`Card`、`ModelGateway`
- `V2-2` 依赖 `M5` 的学习记录与统计基础
- `V2-3` 依赖 `M2` 的导入流程与锚点模型

## 建议实施顺序

- 先实现 `V2-3` 的多格式导入基础，以便扩展知识源输入
- 再实现 `V2-1` 的检索、引用和会话持久化
- 最后接入 `V2-2` 积分激励，确保不干扰主学习流

## 当前阶段实施重点

- 所有新增能力必须复用 MVP 已有数据库和任务模型，不得另起影子状态体系
- RAG 保持“简单 RAG（非 Agentic）”，不把问答链强行并入 agent runtime
- 引用必须可追溯、积分必须可审计、多格式锚点必须可降级
