# Phase 11: Agent Panel v2 Workbench

## Goal

将左侧 Agent 面板从自然语言入口升级为学习工作台，支持 artifact 卡片、长任务状态、可执行 action、撤销入口和推荐解释。

## Inputs

- Phase 07 Agent Panel v1。
- Phase 09 artifact store。
- Phase 10 long-running Supervisor。
- 现有 Knowledge QA、Card、Review UI。

## Implementation Scope

- 展示 artifact cards：answer、evidence、card candidate、learning advice、study schedule write。
- 展示长任务状态和进度。
- 支持 action buttons：开始复习、生成补卡、查看来源、创建卡片、撤销写入、继续任务、取消任务。
- 支持当前页面上下文：当前文档、选中文本、当前卡组、当前复习会话。
- 展示 recommendation reason summary，不展示 chain-of-thought。

## Out Of Scope

- 不绕过 Graph 或 Host Gateway 执行业务写入。
- 不展示完整 prompt、API key、未裁剪长正文。
- 不把 Agent 面板变成所有功能的唯一入口。

## Interfaces

UI 最小模型：

```text
taskStatus
artifactCards
availableActions
qualityEnvelope
errorCategory
fallbackTarget
rollbackAction
```

## UI Contract Decisions

左侧 Agent Workbench 固定为三层布局：

```text
Header: task status + current context chips + collapse button
Body: message stream + artifact cards + progress timeline
Footer: natural language input + action buttons
```

artifact card 固定展示：

```text
artifactType
summary
quality badge
source refs count
createdBy
available actions
```

action button 固定分组：

```text
safe: 查看来源、展开原因、继续任务
write: 创建卡片、加入今日计划、撤销写入
danger: 取消任务、回滚
```

`write` 和 `danger` action 必须显示执行结果和 rollback 状态。

## Context Injection Decisions

当前页面上下文只允许传：

```text
documentIds
selectedTextPreview
selectedAnchorRefs
cardGroupIds
reviewSessionId
artifactRefs
```

`selectedTextPreview` 最大 500 字；完整选中文本必须通过 anchor/source refs 取用。

## Discovery Checklist

- 读取 Phase 07 面板实现。
- 读取 artifact store 查询接口。
- 读取 workflow event 查询接口。
- 读取现有卡片、复习、文档页面的路由和 action。
- 检查 app shell 布局和响应式约束。

## Implementation Checklist

- 先实现 artifact card 组件。
- 再实现 long-running task progress。
- 再接 action button 到已验收 workflow / Host Gateway。
- 增加 rollback / undo 展示。
- 增加当前页面上下文注入，但只传 refs 和摘要。
- 增加隐私过滤和 UI 测试。
- 为 safe/write/danger action 分别加 loading、success、failed、rollback available 状态。
- 为 partial success 增加独立展示，不把 partial 显示成 failed。

## Verification Commands

```powershell
cd xuejian; npm.cmd test -- tests/unit/knowledge-qa-page.test.tsx tests/unit/app-shell-layout-css.test.ts
cd xuejian; npm.cmd test -- tests/unit/knowledge-qa-result.test.ts
cd xuejian; npm.cmd run build
rg "artifactCards|availableActions|rollbackAction|chain-of-thought|Agent Panel" docs/phases xuejian/src
```

## Do Not Proceed If

- action button 直接写 SQLite。
- 面板展示 chain-of-thought 或完整 prompt。
- 当前页面上下文传递完整长正文。
- 取消任务后 UI 仍显示可继续写入 action。
- rollback action 没有对应 Host Gateway 能力。
- selectedTextPreview 超过 500 字或传递完整长正文。

## Acceptance Tests

- 面板能展示 artifact cards 和质量状态。
- 面板能展示长任务进度。
- 用户可从面板继续、取消、撤销支持的任务。
- 推荐卡组能展示原因摘要。
- 当前文档或选中文本可作为 refs 进入任务。
- 普通 QA 仍可绕过 Supervisor。

## Exit Criteria

Agent Panel v2 成为可解释、可操作、可恢复的学习工作台后，进入 Phase 12。
