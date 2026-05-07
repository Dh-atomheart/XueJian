# M09：AI 生成 UI 与 MVP-1 验收

## 目标

完成 AI 卡片生成的用户入口、任务状态展示、质量补救操作，并作为 MVP-1 gate。

## 所属 MVP

MVP-1 gate。

## 相对工作量

M。

## 前置条件

- M08 完成。
- 已阅读 `docs/ai-card-generation.md`、`docs/background-jobs.md` 和 `docs/ipc-api.md`。

## 交付内容

- 文档页生成入口。
- 支持整篇或页码范围。
- 生成密度：少 / 中 / 多。
- 选择目标分组。
- Provider 未配置提示。
- BackgroundJob 状态展示。
- 卡片页支持多选和批量删除。
- MVP-1 端到端验收通过。

## 任务分配

### Frontend

- 生成参数面板。
- 任务状态面板。
- 失败和重试提示。
- 卡片页批量删除。

### Rust/Tauri

- 生成命令接入 UI。
- job 查询和取消命令稳定。
- 失败错误信息可展示。

### Python orchestration

- 保持 M08 workflow 稳定。
- 返回可理解错误。

### Data/Schema

- 不新增核心表。

### Tests

- 生成 UI 表单测试。
- Provider 未配置测试。
- 任务状态展示测试。
- 批量删除测试。
- MVP-1 smoke。

## 不做什么

- 不做草稿审核。
- 不做 card_candidates。
- 不做复杂质量评分。
- 不做成本预算。

## 验收场景

- 用户选择 PDF 整篇生成卡片。
- 用户选择页码范围生成卡片。
- 用户选择密度和目标分组。
- 成功后卡片自动入库。
- 失败时无部分入库。
- 用户批量删除质量不佳的生成卡片。

## 测试要求

- MVP-1 端到端 smoke 必须通过。
- 前端覆盖生成主路径和失败状态。

## 风险与回退

- 自动入库质量不稳定：批量删除作为补救，不引入候选流。
- 任务状态复杂：MVP 只展示 queued/running/succeeded/failed/cancelled。

## 完成后解锁

M10：PDF Reader 与当前页卡片联动。
