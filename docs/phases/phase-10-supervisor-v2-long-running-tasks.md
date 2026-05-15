# Phase 10: Supervisor v2 Long Running Tasks

## Goal

将 Supervisor 从单次复合任务编排升级为可恢复、可中断、可继续的长任务引擎，并支持多轮追问复用 artifact。

## Inputs

- Phase 06 的 Intelligent Supervisor v1。
- Phase 09 的 artifact store。
- workflow events / checkpoints。
- 左侧 Agent 面板 v1。

## Implementation Scope

- 支持长任务状态：queued、running、paused、waiting_for_user、completed、partial、failed、cancelled。
- 支持任务中断、继续、取消。
- 支持从 checkpoint 恢复 route plan、budget counters、artifact refs。
- 支持用户追问时复用上一轮 artifact。
- 支持 plan revision UI 摘要，不保存 chain-of-thought。

## Out Of Scope

- 不让 Supervisor 生成业务内容。
- 不跳过子图质量门槛。
- 不直接写 SQLite。
- 不把用户完整长对话历史写入 checkpoint。

## Interfaces

新增或扩展：

```text
pause_agent_task
resume_agent_task
cancel_agent_task
continue_agent_task_with_message
```

checkpoint 只保存摘要、refs、预算、错误类别和恢复所需最小状态。

## State Machine Decisions

Supervisor v2 任务状态固定为：

```text
queued
running
paused
waiting_for_user
completed
partial
failed
cancelled
```

允许状态迁移：

```text
queued -> running
running -> paused | waiting_for_user | completed | partial | failed | cancelled
paused -> running | cancelled
waiting_for_user -> running | cancelled
partial -> running | completed | cancelled
```

不允许：

```text
cancelled -> running
completed -> running
failed -> running
```

## Checkpoint Decisions

checkpoint payload 只能包含：

```text
runtime
graphVersion
currentStep
routePlanSummary
planRevisionSummary
decisionRecords
artifactRefs
qualityEnvelopes
budgetCounters
errorCategories
resumeToken
```

`resumeToken` 由 Rust/Host Gateway 生成。Python 不生成持久权限 token。

## Discovery Checklist

- 读取 Phase 06 Supervisor state 和 event/checkpoint 设计。
- 读取 artifact store 查询接口。
- 读取 `workflow_repo.rs` 中 checkpoint 保存和读取方式。
- 检查前端 workflow event 查询和状态展示能力。
- 列出需要支持恢复的任务类型。

## Implementation Checklist

- 扩展 Supervisor state 的 resumable summary。
- 将 artifact refs 和 decisionRecord 绑定到 checkpoint。
- 实现 pause/resume/cancel 控制流。
- 实现多轮追问时的 artifact 选择和上下文裁剪。
- 增加预算续接规则，避免恢复后预算重置。
- 增加 partial success 的恢复策略。
- 在每个子图调用前检查 cancellation。
- resume 时从 checkpoint 恢复预算，不允许重置 `maxPlanSteps`、`maxSubgraphCalls`、`maxReplans`。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_knowledge_qa.py xuejian/tests/unit/test_card_tools.py xuejian/tests/unit/test_study_tools.py
cd xuejian; cargo check --manifest-path src-tauri/Cargo.toml
rg "pause|resume|cancel|checkpoint|decisionRecord|artifactRefs|budget" docs/phases docs/multi-agent-development-guide.md xuejian
```

## Do Not Proceed If

- checkpoint 保存 chain-of-thought、完整 prompt 或未裁剪长正文。
- resume 后预算被重置。
- cancelled task 仍继续写入业务数据。
- Supervisor 恢复时绕过 artifact quality gate。
- 状态机允许 cancelled/completed/failed 回到 running。

## Acceptance Tests

- 长任务可暂停并恢复。
- 长任务可取消且不继续业务写入。
- 恢复后保留 artifact refs、预算和 decisionRecord。
- 用户追问能复用上一轮 artifact 摘要。
- 子图失败后仍可恢复部分成功结果。

## Exit Criteria

Supervisor v2 能可靠处理中断、恢复、取消和多轮 artifact 复用后，进入 Phase 11。
