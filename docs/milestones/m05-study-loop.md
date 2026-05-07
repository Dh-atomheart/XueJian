# M05：每日复习闭环

## 目标

实现每日复习队列、四档反馈、ReviewState 更新和 StudyEvent 记录。

## 所属 MVP

MVP-0。

## 相对工作量

L。

## 前置条件

- M04 完成。
- cards、card_groups、review_states、study_events 可用。
- 已阅读 `docs/review-scheduler.md`。

## 交付内容

- 今日队列只来自启用分组。
- 默认每日新卡 20、复习 100。
- 四档反馈：`忘记 / 模糊 / 记得 / 熟练`。
- 内部映射：`again / hard / good / easy`。
- Rust FSRS 或等价后端调度占位实现。
- 每次反馈写入 study_events。

## 任务分配

### Frontend

- 学习页显示当前卡片。
- 支持翻面。
- 支持四档反馈。
- 展示队列进度。

### Rust/Tauri

- 查询今日队列。
- 提交复习反馈。
- 更新 ReviewState。
- 写入 StudyEvent。

### Python orchestration

- 无任务。

### Data/Schema

- ReviewState 保持 FSRS 兼容字段。
- StudyEvent 作为统计事实来源。

### Tests

- 队列过滤启用分组。
- 四档反馈映射。
- ReviewState 更新。
- StudyEvent 写入。

## 不做什么

- 不做复杂记忆预测。
- 不做 points。
- 不暴露 FSRS 高级参数。
- 不做统计仪表盘增强。

## 验收场景

- 启用分组中的到期卡进入今日复习。
- 暂停分组中的卡不进入今日复习。
- 用户翻面并提交四档反馈。
- 系统更新下一次复习时间。
- 系统追加 StudyEvent。

## 测试要求

- Rust 调度测试必须覆盖四档反馈。
- 前端测试覆盖学习页主路径。

## 风险与回退

- Rust FSRS crate 未定：先实现等价调度接口，并保留 FSRS 兼容字段。
- 队列规则复杂化：MVP 固定最早到期优先。

## 完成后解锁

M06：MVP-0 加固与验收。
