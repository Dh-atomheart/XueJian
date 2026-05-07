# Review Scheduler 工程契约

本文档定义 XueJian MVP 阶段的复习调度行为。产品边界以 `docs/spec.md` 为准，数据字段以 `docs/database-baseline.md` 为准，Study 模块职责以 `docs/modules/study.md` 为准。

## 目标

- 用户无需理解复习算法即可开始学习。
- 系统每天推荐最应该学习的卡片。
- 每次学习反馈都更新 `review_states` 并写入 `study_events`。
- 学习统计必须能从 `study_events` 重建。

`knowledge / podcast / animation / points / export / profile` 不进入当前 MVP；学习激励先不做积分系统。

## 调度权威

- Rust 后端是复习调度权威。
- 前端只展示队列、卡片和反馈按钮。
- 前端 `ts-fsrs` 可作为参考或测试辅助，不作为权威实现。
- 具体 Rust FSRS crate 可后续验证；本文档锁定行为契约，不锁死算法参数。

## 反馈模型

UI 四档反馈：

| UI 文案 | 内部 rating | 含义 |
| --- | --- | --- |
| 忘记 | `again` | 完全不会，需要很快再看 |
| 模糊 | `hard` | 有印象但不稳定 |
| 记得 | `good` | 正常记住 |
| 熟练 | `easy` | 明显掌握 |

提交反馈必须产生一条 `study_events`。

## 队列生成

默认限制：

```text
newLimit = 20
reviewLimit = 100
```

规则：

- 今日队列只来自启用分组。
- 已软删除卡片不进入队列。
- 已软删除分组不进入队列。
- 到期复习卡优先于新卡。
- 复习卡按 `due_at ASC` 排序。
- 新卡按 `created_at ASC` 排序。
- 同一张卡在一次队列中只出现一次。

队列组成：

```text
due review cards up to reviewLimit
then new cards up to newLimit
```

如果复习卡超过 `reviewLimit`，MVP 不强制加入额外新卡。

## ReviewState

每张未删除卡片必须有一条 `review_states`。

新卡初始状态：

```text
state = new
due_at = created_at
review_count = 0
lapse_count = 0
last_reviewed_at = null
```

反馈后更新：

- `state`
- `due_at`
- `last_reviewed_at`
- `review_count`
- `lapse_count`
- `stability`
- `difficulty`
- `updated_at`

若 MVP 初期暂未接入 FSRS crate，可使用等价后端占位算法，但必须满足：

- `again` 的下次到期时间最短。
- `hard` 短于 `good`。
- `good` 短于 `easy`。
- 下一次复习时间必须可预测、可测试。

## StudyEvent

`study_events` 是统计事实来源。

每次反馈写入：

- `card_id`
- `group_id`
- `rating`
- `started_at`
- `answered_at`
- `duration_ms`
- `previous_due_at`
- `next_due_at`

事件写入和 `review_states` 更新必须在同一 Rust 事务中完成。

## 统计口径

### 今日完成数

当天 `study_events.answered_at` 落在用户本地日期内的事件数。

### 总学习时长

所有 `duration_ms` 求和。为空的 duration 不计入。

### 连续学习天数

从今天向前连续存在学习事件的本地日期数。若今天没有事件，则从昨天向前计算时应显示当前连续记录为 0。

### 热力图

按本地日期聚合 `study_events` 数量或学习时长。MVP 默认用完成次数。

### 分组进度

同一分组内：

- 总卡片数：未删除卡片。
- 已学习卡片数：`review_count > 0`。
- 到期卡片数：`due_at <= now`。

### 文档进度

按卡片来源反推文档：

- 文档卡片数。
- 已学习卡片数。
- 到期卡片数。

手动无来源卡不计入文档进度。

## 算法策略

优先方案：

- Rust 后端接入 FSRS 或等价实现。
- 四档反馈映射 `again / hard / good / easy`。
- FSRS 参数使用库默认值，直到有真实学习数据再调整。

兜底方案：

- 若 Rust FSRS crate 短期不可用，使用固定间隔占位：
  - `again`: 10 分钟。
  - `hard`: 1 天。
  - `good`: 3 天。
  - `easy`: 7 天。
- 占位实现必须封装在 scheduler 边界内，便于后续替换。

## 验收

- 暂停分组后，该分组卡片不进入今日队列。
- 新卡创建后可以进入今日队列。
- 提交四档反馈后，`review_states.due_at` 发生变化。
- 提交反馈后写入 `study_events`。
- 首页今日完成数能从 `study_events` 计算。
- 热力图能从 `study_events` 聚合。
- 无来源手动卡不影响文档进度统计。
