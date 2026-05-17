# 渐进式开发 Phase 索引

本文是 RAG LangGraph 化与多 Agent 升级的执行层 runbook 索引。架构权威仍在：

- [RAG LangChain / LangGraph 重构文档](../rag/rag-langchain-langgraph-refactor.md)
- [多 Agent 升级开发文档](../multi-agent-development-guide.md)

`docs/phases` 只负责把权威文档拆成可逐步实现、可验收、可停止的开发阶段。不得用旧版阶段文档替代本索引；旧阶段文档已经归档，不再作为当前开发入口。

## 执行顺序

```text
phase-00-contract-freeze
 -> phase-01-knowledgegraph-runtime
 -> phase-02-knowledgegraph-nodes
 -> phase-03-rag-quality-parity
 -> phase-04-cardgraph
 -> phase-05-studygraph-v1
 -> phase-06-intelligent-supervisor
 -> phase-07-agent-panel
 -> phase-08-studygraph-v2-schedule-write
 -> phase-09-artifact-store
 -> phase-10-supervisor-v2-long-running-tasks
 -> phase-11-agent-panel-v2-workbench
 -> phase-12-evaluation-and-regression
 -> phase-13-runtime-hardening
```

## Phase 列表

### V1 可用闭环

| Phase | 文档 | 目标 |
| --- | --- | --- |
| 0 | [Contract Freeze](./phase-00-contract-freeze.md) | 冻结 `QualityEnvelope`、`artifactRefs`、sanity set 和旧 runner 退出原则 |
| 1 | [KnowledgeGraph Runtime](./phase-01-knowledgegraph-runtime.md) | 让 `/workflows/knowledge-qa` 以 `langgraph_rag` runtime 返回兼容 payload |
| 2 | [KnowledgeGraph Nodes](./phase-02-knowledgegraph-nodes.md) | 将 RAG 核心流程拆入 KnowledgeGraph 中粒度节点 |
| 3 | [RAG Quality And Parity](./phase-03-rag-quality-parity.md) | 补齐 RAG artifact、quality gate 和轻量 compatibility parity |
| 4 | [CardGraph](./phase-04-cardgraph.md) | 将制卡 runner 迁移为 CardGraph |
| 5 | [StudyGraph v1](./phase-05-studygraph-v1.md) | 输出学习建议和补卡建议，不写复习调度 |
| 6 | [Intelligent Supervisor](./phase-06-intelligent-supervisor.md) | 实现复合学习任务编排入口 `/workflows/agent-task` |
| 7 | [Agent Panel](./phase-07-agent-panel.md) | 实现桌面左侧 Agent 对话入口 |

### V2 扩展与生产化

| Phase | 文档 | 目标 |
| --- | --- | --- |
| 8 | [StudyGraph v2 Schedule Write](./phase-08-studygraph-v2-schedule-write.md) | 在硬门槛下写入复习调度状态 |
| 9 | [Artifact Store](./phase-09-artifact-store.md) | 落地跨 Graph artifact 持久化、查询和生命周期 |
| 10 | [Supervisor v2 Long Running Tasks](./phase-10-supervisor-v2-long-running-tasks.md) | 支持长任务、恢复、中断、继续和多轮 artifact 复用 |
| 11 | [Agent Panel v2 Workbench](./phase-11-agent-panel-v2-workbench.md) | 将左侧 Agent 面板升级为学习工作台 |
| 12 | [Evaluation And Regression](./phase-12-evaluation-and-regression.md) | 建立 RAG、Card、Study、Supervisor 的回归评估体系 |
| 13 | [Runtime Hardening](./phase-13-runtime-hardening.md) | 加固取消、超时、重试、预算、隐私和运行监控 |

## 权威关系

- Phase 1-3 以 `docs/rag/rag-langchain-langgraph-refactor.md` 为权威依据。
- Phase 4-13 以 `multi-agent-development-guide.md` 为权威依据。
- Phase 3 未通过前，不得正式接入 Supervisor。
- Phase 6 未通过前，不得把左侧 Agent 面板绑定到旧 RAG runner。
- Phase 8 前不得写复习调度状态。
- Phase 9 前 `artifactRefs` 仍只能作为接口契约，不得假设已有全局 artifact store。
- 任何 phase 都不得让 Python / LangGraph 直接写 SQLite；业务写入必须通过 Rust / Host Gateway。

## 统一执行规则

每个 phase 必须按以下顺序执行：

```text
Discovery -> Implementation -> Verification -> Docs Sync
```

- `Discovery`：只读代码、读测试、跑非破坏性检查；不得实现功能。
- `Implementation`：只实现当前 phase 允许的范围，不提前做后续 phase。
- `Verification`：运行本 phase 文档列出的命令和场景。
- `Docs Sync`：如果实现中发现契约需要调整，先同步权威文档和当前 phase，再进入下一阶段。

执行硬规则：

- 前一 phase 的 `Exit Criteria` 未满足，不得进入下一 phase。
- 每个 phase 开始前必须确认权威文档仍然一致。
- RAG 相关 phase 以 `../rag/rag-langchain-langgraph-refactor.md` 为准。
- 多 Agent 相关 phase 以 `../multi-agent-development-guide.md` 为准。
- 任何自动写入都必须经过 Rust / Host Gateway，不允许 Python / LangGraph 直接写 SQLite。

## 禁止跳阶段

- 不得在 Phase 1 前让 Multi-Agent 接管普通 QA。
- 不得在 Phase 3 前把 `knowledge_qa_agent.py` 用作当前 KnowledgeGraph 入口。
- 不得在 Phase 4 前让 CardGraph 消费未通过 quality gate 的 evidence。
- 不得在 Phase 5 中写复习调度状态。
- 不得在 Phase 6 中让 Supervisor 生成 answer、citation、card candidate 或 learning advice。
- 不得在 Phase 7 中把左侧 Agent 面板做成绕过 Graph 契约的自由聊天机器人。
- 不得在 Phase 8 前启用 StudyGraph 调度写入。
- 不得在 Phase 9 前要求跨 Graph artifact 回放或长期查询。
- 不得在 Phase 10 前把 Supervisor 当作可恢复长任务引擎。
- 不得在 Phase 13 前把运行时行为视为生产硬化完成。
