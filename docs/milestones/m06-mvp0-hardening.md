# M06：MVP-0 加固与验收

## 目标

完成 MVP-0 端到端验收、错误状态补齐和基础测试补齐，作为进入 MVP-1 的 gate。

## 所属 MVP

MVP-0 gate。

## 相对工作量

M。

## 前置条件

- M01-M05 完成。

## 交付内容

- PDF 导入到复习反馈的端到端路径可运行。
- 主要页面都有 empty/loading/failed 状态。
- 冻结入口不可见。
- MVP-0 关键测试通过。
- 已知问题记录到后续 backlog，不阻塞 MVP-1 的问题必须明确。

## 任务分配

### Frontend

- 统一错误、空状态、加载状态。
- 检查主导航和页面跳转。
- 检查窄宽度不重叠。

### Rust/Tauri

- 补齐错误语义。
- 检查数据库约束。
- 检查 job 状态恢复或失败显示。

### Python orchestration

- 检查解析失败错误。
- 确保不写 SQLite。

### Data/Schema

- 检查 MVP-0 baseline 是否只包含必要范围。

### Tests

- 端到端 smoke。
- 导航测试。
- 数据库测试。
- 文档解析测试。
- 学习闭环测试。

## 不做什么

- 不开始 AI 生成。
- 不引入 BYOK。
- 不做 Reader 联动。
- 不删除历史冻结代码。

## 验收场景

- 用户导入 PDF。
- 用户手动创建卡片和分组。
- 用户启用分组。
- 用户完成复习反馈。
- StudyEvent 写入。
- UI 无冻结入口。

## 测试要求

- MVP-0 smoke 测试通过。
- 关键单元或集成测试通过。

## 风险与回退

- 端到端缺陷较多：只修阻断 MVP-0 主闭环的问题，其余记录 backlog。
- 旧 mock 数据干扰：MVP-0 验收以真实 gateway/commands 为准。

## 完成后解锁

M07：Provider 与 BYOK。
