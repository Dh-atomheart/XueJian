# Phase 07: Agent Panel

## Goal

实现桌面左侧 Agent 对话入口，让用户通过自然语言触发 QA、制卡、学习诊断和复合学习任务。该面板是受控 workflow 入口，不是绕过 Graph 契约的自由聊天机器人。

## Inputs

- Phase 06 已通过 Supervisor 验收。
- 现有桌面 UI、导航、QA 页面、制卡页面、复习页面。
- `/workflows/knowledge-qa`、CardGraph 入口、`/workflows/agent-task`。

## Implementation Scope

- 新增左侧 Agent 面板。
- 根据意图路由：
  - 简单 QA -> `/workflows/knowledge-qa`
  - 普通制卡 -> CardGraph 或迁移后的制卡入口
  - 学习诊断 / 推荐 / 复合任务 -> `/workflows/agent-task`
- 展示 summary、artifact refs、quality status、失败原因、部分成功状态。
- 提供结构化操作按钮，例如开始复习、生成补卡、查看来源、创建卡片、撤销刚才创建、重新生成。

## Out Of Scope

- 不让面板直接调用旧 RAG runner。
- 不让面板直接写 SQLite。
- 不展示 chain-of-thought。
- 不保存完整 prompt、API key 或未裁剪长正文。
- 不把所有请求强制走 Supervisor。

## Interfaces

面板只调用已验收 workflow：

```text
/workflows/knowledge-qa
CardGraph 或迁移后的制卡入口
/workflows/agent-task
```

UI 展示最小字段：

```text
status
summary
artifactRefs
qualityEnvelope
errorCategory
fallbackTarget
availableActions
```

## Discovery Checklist

- 读取 `xuejian/src/App.tsx`，确认桌面路由和页面挂载位置。
- 读取 `xuejian/src/features/knowledge/KnowledgeQaPage.tsx` 和 `xuejian/src/components/pages/knowledge-qa-page.tsx`，确认现有 QA UI 状态模式。
- 读取 `xuejian/src/services/gateway/orchestration.ts` 和 `xuejian/src/queries/orchestration.ts`，确认 workflow event 查询方式。
- 读取现有 app shell / navigation 相关测试，确认左侧面板不会破坏布局。
- 确认 Phase 06 `/workflows/agent-task` 已通过验收。

## Implementation Checklist

- 先实现左侧 Agent 面板壳、折叠/展开状态和消息列表。
- 实现意图路由：简单 QA、普通制卡、复合学习任务分流。
- 接入 `/workflows/knowledge-qa`、CardGraph 入口、`/workflows/agent-task`。
- 展示 status、summary、artifact refs、quality status、error category、fallback target。
- 增加结构化 action button，并确保 action 走已验收 workflow 或 Host Gateway。
- 增加隐私过滤，不展示 chain-of-thought、完整 prompt、API key 或未裁剪长正文。

## Verification Commands

```powershell
cd xuejian; npm.cmd test -- tests/unit/agent-panel.test.tsx tests/unit/agent-panel-router.test.ts tests/unit/app-shell-layout-css.test.ts
cd xuejian; npm.cmd test -- tests/unit/knowledge-qa-result.test.ts
cd xuejian; npm.cmd run build
cargo check --manifest-path xuejian/src-tauri/Cargo.toml
```

## Do Not Proceed If

- 面板绕过 Graph 调旧 runner。
- 所有请求被强制走 Supervisor。
- 面板直接写 SQLite 或绕过 Host Gateway 写业务数据。
- 面板展示 chain-of-thought、完整 prompt、API key 或未裁剪长正文。
- 普通 QA 路由不再兼容现有 Knowledge QA 页面。

## Acceptance Tests

- 用户可以请求“解释当前资料”并走 KnowledgeGraph。
- 用户可以请求“从当前资料生成卡片”并走 CardGraph。
- 用户可以请求“推荐今天复习的卡组”并走 StudyGraph / Supervisor。
- 用户可以请求“解释资料、生成卡片、给出复习建议”并走 Supervisor。
- 普通 QA 不被强制路由到 Supervisor。
- 面板能展示 partial / failed 状态和阻断原因。
- 面板不展示 chain-of-thought、完整 prompt、API key 或未裁剪长正文。

## Exit Criteria

左侧 Agent 面板成为自然语言学习任务入口，并且所有执行行为都受 KnowledgeGraph、CardGraph、StudyGraph、Supervisor、QualityEnvelope、Host Gateway 约束。
