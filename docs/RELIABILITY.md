---
title: Reliability
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# 可靠性说明

## 当前已落地

- `WorkflowRun` / `WorkflowCheckpoint` / `WorkflowEvent` 已被纳入正式编排术语。
- 长任务由 Rust Host 负责登记与边界控制。
- Python orchestration 服务由本地 Host 生命周期托管。

## 当前不做

- 不在本轮引入完整 observability stack。
- 不在本轮为每个 worktree 启动独立 tracing/metrics 堆栈。
- 不自动合并 doc-gardening PR。

## 后续接口

后续可靠性建设应优先落在以下位置：

- `docs/references/ai-orchestration.md`：补充任务恢复与服务健康边界
- `docs/QUALITY_SCORE.md`：补充更多治理信号
- `docs/exec-plans/active/`：为 observability、tracing、budget analysis 建立单独计划

## 基线要求

- 长任务必须可解释失败原因。
- 关键状态变化必须能回传到前端。
- 恢复能力优先覆盖卡片生成与后续多媒体长任务。
