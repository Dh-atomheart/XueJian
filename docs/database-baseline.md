# Database Baseline 工程契约

本文档定义 XueJian 开发期 V1 SQLite baseline。产品边界以 `docs/spec.md` 为准，跨层数据权威以 `docs/architecture.md` 为准；字段、关系、索引和迁移基线以本文档为准。

## 目标与权威

- Rust/SQLite 是唯一数据权威。
- Python orchestration 不直接读写 SQLite，只通过 Rust 暴露的受控接口提交解析或 AI workflow 结果。
- 当前项目仍处开发期，允许把旧 migrations 折叠为新的 V1 baseline，不承诺兼容旧本地数据。
- V1 baseline 只服务 MVP-0 到 MVP-2 主闭环，不纳入 `knowledge / podcast / animation / points / export / profile`。

## Schema 原则

- 主键统一使用 UUID 文本：`TEXT PRIMARY KEY`。
- 时间统一使用 UTC ISO-8601 字符串：`TEXT NOT NULL`。
- 核心业务表使用软删除：`deleted_at TEXT NULL`。
- SQLite 必须启用 `PRAGMA foreign_keys = ON`。
- SQLite 建议启用 WAL：`PRAGMA journal_mode = WAL`。
- 表名使用 snake_case 复数形式。
- 枚举值使用小写 snake_case 文本。
- MVP 不建立向量表，不引入 sqlite-vec；全文检索可在后续专项中补充。

## 核心表

V1 baseline 包含九张核心表：

```text
documents
document_chunks
source_anchors
cards
card_groups
review_states
study_events
background_jobs
provider_configs
```

## 表关系

```text
documents -> document_chunks -> source_anchors -> cards
cards -> card_groups
cards -> review_states -> study_events
background_jobs -> target resource
provider_configs -> BYOK model calls
```

- `documents` 保存导入 PDF 的元数据和本地文件路径。
- `document_chunks` 保存文档解析后的页级或片段级文本。
- `source_anchors` 保存卡片与来源片段的绑定。
- `cards` 保存 Basic 单卡型学习资产。
- `card_groups` 是全局学习单位。
- `review_states` 保存卡片当前复习状态。
- `study_events` 是学习统计事实来源。
- `background_jobs` 保存长任务状态。
- `provider_configs` 只保存非敏感 Provider 配置和 Stronghold key ref。

## 字段级 Baseline

### `documents`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `title` | TEXT | 是 | 展示标题，默认取文件名 |  |
| `original_filename` | TEXT | 是 | 用户导入时的文件名 |  |
| `file_path` | TEXT | 是 | 应用数据目录内 PDF 路径 | UNIQUE |
| `file_hash` | TEXT | 是 | 文件 hash，用于去重 | UNIQUE |
| `file_size` | INTEGER | 是 | 字节数 |  |
| `page_count` | INTEGER | 否 | 解析后页数 |  |
| `parse_status` | TEXT | 是 | `pending / parsed / failed / unsupported` | INDEX |
| `created_at` | TEXT | 是 | UTC ISO | INDEX |
| `updated_at` | TEXT | 是 | UTC ISO |  |
| `deleted_at` | TEXT | 否 | 软删除 | INDEX |

### `document_chunks`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `document_id` | TEXT | 是 | 所属文档 | FK, INDEX |
| `page_start` | INTEGER | 是 | 起始页，1-based | INDEX |
| `page_end` | INTEGER | 是 | 结束页，1-based |  |
| `chunk_index` | INTEGER | 是 | 文档内顺序 | INDEX |
| `text` | TEXT | 是 | 可复制文本内容 |  |
| `char_count` | INTEGER | 是 | 字符数 |  |
| `parser` | TEXT | 是 | `pymupdf / docling` |  |
| `created_at` | TEXT | 是 | UTC ISO |  |

建议唯一约束：`(document_id, chunk_index)`。

### `source_anchors`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `document_id` | TEXT | 是 | 来源文档 | FK, INDEX |
| `chunk_id` | TEXT | 否 | 来源 chunk | FK, INDEX |
| `page` | INTEGER | 是 | 来源页码，1-based | INDEX |
| `quote` | TEXT | 是 | 来源文本片段 |  |
| `bbox_json` | TEXT | 否 | 可选 PDF 坐标，MVP 可空 |  |
| `created_at` | TEXT | 是 | UTC ISO |  |

### `card_groups`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `name` | TEXT | 是 | 分组名 | INDEX |
| `description` | TEXT | 否 | 描述 |  |
| `color` | TEXT | 否 | UI 色值 token 或 hex |  |
| `is_enabled` | INTEGER | 是 | 1 启用，0 暂停 | INDEX |
| `created_at` | TEXT | 是 | UTC ISO |  |
| `updated_at` | TEXT | 是 | UTC ISO |  |
| `deleted_at` | TEXT | 否 | 软删除 | INDEX |

### `cards`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `group_id` | TEXT | 是 | 所属学习分组 | FK, INDEX |
| `source_anchor_id` | TEXT | 否 | 来源绑定，AI 卡必填，手动卡可空 | FK, INDEX |
| `title` | TEXT | 是 | 卡片标题 | INDEX |
| `front` | TEXT | 是 | 正面，问题或简述 |  |
| `back` | TEXT | 是 | 背面，答案或解释 |  |
| `tags_json` | TEXT | 是 | JSON 字符串，默认 `[]` |  |
| `origin` | TEXT | 是 | `manual / ai` | INDEX |
| `created_at` | TEXT | 是 | UTC ISO | INDEX |
| `updated_at` | TEXT | 是 | UTC ISO |  |
| `deleted_at` | TEXT | 否 | 软删除 | INDEX |

### `review_states`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `card_id` | TEXT | 是 | 一张卡一条复习状态 | FK, UNIQUE |
| `state` | TEXT | 是 | `new / learning / review / relearning` | INDEX |
| `due_at` | TEXT | 是 | 下次到期时间 | INDEX |
| `last_reviewed_at` | TEXT | 否 | 最近复习时间 |  |
| `review_count` | INTEGER | 是 | 复习次数 |  |
| `lapse_count` | INTEGER | 是 | 忘记次数 |  |
| `stability` | REAL | 否 | FSRS 或等价算法字段 |  |
| `difficulty` | REAL | 否 | FSRS 或等价算法字段 |  |
| `created_at` | TEXT | 是 | UTC ISO |  |
| `updated_at` | TEXT | 是 | UTC ISO |  |

新卡创建时必须同步创建 `review_states`。

### `study_events`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `card_id` | TEXT | 是 | 学习卡片 | FK, INDEX |
| `group_id` | TEXT | 是 | 事件发生时所属分组 | FK, INDEX |
| `rating` | TEXT | 是 | `again / hard / good / easy` | INDEX |
| `started_at` | TEXT | 否 | 本次学习开始时间 |  |
| `answered_at` | TEXT | 是 | 提交反馈时间 | INDEX |
| `duration_ms` | INTEGER | 否 | 学习耗时 |  |
| `previous_due_at` | TEXT | 否 | 反馈前到期时间 |  |
| `next_due_at` | TEXT | 是 | 反馈后到期时间 | INDEX |

统计必须能从 `study_events` 重建。

### `background_jobs`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `type` | TEXT | 是 | `document_parse / ai_card_generation` | INDEX |
| `status` | TEXT | 是 | `queued / running / succeeded / failed / cancelled` | INDEX |
| `target_type` | TEXT | 是 | 目标资源类型，如 `document` | INDEX |
| `target_id` | TEXT | 是 | 目标资源 ID | INDEX |
| `payload_json` | TEXT | 是 | 任务输入参数 |  |
| `result_json` | TEXT | 否 | 成功结果摘要 |  |
| `error_message` | TEXT | 否 | 面向用户的错误 |  |
| `error_details` | TEXT | 否 | 调试信息 |  |
| `progress_current` | INTEGER | 否 | 当前进度 |  |
| `progress_total` | INTEGER | 否 | 总进度 |  |
| `progress_message` | TEXT | 否 | 当前阶段说明 |  |
| `created_at` | TEXT | 是 | UTC ISO | INDEX |
| `started_at` | TEXT | 否 | UTC ISO |  |
| `finished_at` | TEXT | 否 | UTC ISO |  |
| `cancel_requested_at` | TEXT | 否 | UTC ISO |  |

### `provider_configs`

| 字段 | 类型 | 必填 | 说明 | 索引 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 | UUID | PK |
| `provider` | TEXT | 是 | `openai / anthropic / openai_compatible` | INDEX |
| `display_name` | TEXT | 是 | 展示名称 |  |
| `base_url` | TEXT | 否 | OpenAI-compatible 可用 |  |
| `default_model` | TEXT | 是 | 默认模型名 |  |
| `api_key_ref` | TEXT | 是 | Stronghold key ref，不保存明文 key | UNIQUE |
| `is_enabled` | INTEGER | 是 | 是否启用 | INDEX |
| `created_at` | TEXT | 是 | UTC ISO |  |
| `updated_at` | TEXT | 是 | UTC ISO |  |
| `deleted_at` | TEXT | 否 | 软删除 | INDEX |

## 迁移策略

- V1 baseline 作为开发期目标 schema。
- 旧 migrations 只作为历史参考，不作为兼容要求。
- 如果后续需要保留旧开发数据，单独写一次性迁移脚本，不阻塞 MVP 主线。
- 每次 schema 修改必须同步更新本文档、Rust repository 测试和 IPC DTO。

## 验收

- 新环境启动后能创建 V1 SQLite 数据库。
- Rust 数据库测试能插入、查询、更新、软删除核心记录。
- foreign key 约束可验证。
- `documents.file_hash` 去重可验证。
- 新卡创建时同步产生 `review_states`。
- 学习反馈写入 `study_events` 后可重建今日完成数。
- `provider_configs` 不保存明文 API Key。

