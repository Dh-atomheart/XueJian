# IPC API 工程契约

本文档定义前端 gateway/query 层与 Tauri commands 的接口契约。产品范围以 `docs/spec.md` 为准，跨层职责以 `docs/architecture.md` 为准，数据结构以 `docs/database-baseline.md` 为准。

## 目标与边界

- 页面组件不得直接调用 Tauri `invoke`。
- 前端统一通过 `shared/gateway` 或 query/mutation 层访问 Rust commands。
- Rust command 返回稳定 DTO，不直接暴露数据库行结构。
- Python orchestration 不面向前端暴露业务 API。
- 错误结构统一，UI 只展示可理解的 `message`。
- 本文档覆盖 MVP-0 到 MVP-1 必需接口，MVP-2 只补 Reader/统计相关查询。

冻结能力 `knowledge / podcast / animation / points / export / profile` 不进入 IPC API 主线。

## 通用接口约定

### 命名

- Tauri command 使用动词开头的 snake_case：`list_documents`、`create_card`。
- 前端 gateway 使用 camelCase：`documents.list()`、`cards.create()`。
- DTO 字段在 Rust/IPC 边界统一使用 camelCase，数据库内部仍使用 snake_case。

### ID、时间和枚举

- ID：UUID 字符串。
- 时间：UTC ISO-8601 字符串。
- 布尔值：IPC 层使用 boolean，数据库层使用 integer。
- 枚举值：小写 snake_case。

### 分页、筛选、排序

列表接口统一支持：

```ts
type PageRequest = {
  page: number;      // 1-based
  pageSize: number;  // default 50, max 200
};

type PageResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
```

筛选参数只传业务需要的显式字段，不传 SQL 片段。

## 错误模型

所有 command 失败时返回统一错误：

```ts
type AppError = {
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
};
```

约定：

- `message` 面向用户，可直接展示或轻加工展示。
- `details` 面向调试，不直接暴露给普通用户。
- `recoverable=true` 表示 UI 可以展示重试或重新配置入口。

基础错误码：

```text
validation_error
not_found
conflict
unsupported_file
parse_failed
provider_not_configured
provider_auth_failed
background_job_failed
cancelled
internal_error
```

## Documents API

### `import_document`

导入 PDF，复制到应用数据目录，按 hash 去重，并创建解析任务。

```ts
type ImportDocumentRequest = {
  sourcePath: string;
};

type ImportDocumentResponse = {
  document: DocumentDto;
  job?: BackgroundJobDto;
  deduplicated: boolean;
};
```

### `list_documents`

```ts
type ListDocumentsRequest = PageRequest & {
  query?: string;
  parseStatus?: "pending" | "parsed" | "failed" | "unsupported";
  includeDeleted?: boolean;
};
```

### `get_document`

```ts
type GetDocumentRequest = {
  documentId: string;
};
```

### `list_document_chunks`

用于 Reader、来源定位和 AI 生成上下文。

```ts
type ListDocumentChunksRequest = {
  documentId: string;
  pageStart?: number;
  pageEnd?: number;
};
```

### `delete_document`

软删除文档。MVP 不要求物理删除 PDF 文件。

```ts
type DeleteDocumentRequest = {
  documentId: string;
};
```

## Cards API

### `create_card`

```ts
type CreateCardRequest = {
  groupId: string;
  title: string;
  front: string;
  back: string;
  tags?: string[];
  sourceAnchorId?: string;
  origin: "manual" | "ai";
};
```

手动卡 `sourceAnchorId` 可空，AI 卡必须有来源。

### `update_card`

```ts
type UpdateCardRequest = {
  cardId: string;
  groupId?: string;
  title?: string;
  front?: string;
  back?: string;
  tags?: string[];
};
```

### `list_cards`

```ts
type ListCardsRequest = PageRequest & {
  groupId?: string;
  documentId?: string;
  page?: number;
  query?: string;
  origin?: "manual" | "ai";
  includeDeleted?: boolean;
};
```

### `delete_card` / `delete_cards`

软删除卡片；批量删除用于 AI 自动入库后的质量补救。

```ts
type DeleteCardsRequest = {
  cardIds: string[];
};
```

### `get_card_source`

查询卡片来源页码和 quote。

```ts
type GetCardSourceRequest = {
  cardId: string;
};
```

## Groups API

### `create_card_group`

```ts
type CreateCardGroupRequest = {
  name: string;
  description?: string;
  color?: string;
};
```

### `update_card_group`

```ts
type UpdateCardGroupRequest = {
  groupId: string;
  name?: string;
  description?: string;
  color?: string;
  isEnabled?: boolean;
};
```

### `list_card_groups`

支持查询所有未删除分组。

### `delete_card_group`

软删除分组。若分组下仍有未删除卡片，MVP 默认返回 `conflict`，由 UI 引导用户先移动或删除卡片。

## Study API

### `get_today_review_queue`

```ts
type GetTodayReviewQueueRequest = {
  newLimit?: number;     // default 20
  reviewLimit?: number;  // default 100
};
```

队列只来自启用分组。

### `submit_review_feedback`

```ts
type SubmitReviewFeedbackRequest = {
  cardId: string;
  rating: "again" | "hard" | "good" | "easy";
  startedAt?: string;
  answeredAt: string;
  durationMs?: number;
};
```

提交后必须更新 `review_states` 并写入 `study_events`。

### `get_study_overview`

返回首页基础统计：

```ts
type StudyOverviewDto = {
  todayCompleted: number;
  totalStudyMs: number;
  streakDays: number;
  dueCount: number;
  newCount: number;
};
```

## Settings / Provider API

### `list_provider_configs`

只返回非敏感配置，不返回 API Key。

### `save_provider_config`

```ts
type SaveProviderConfigRequest = {
  provider: "openai" | "anthropic" | "openai_compatible";
  displayName: string;
  baseUrl?: string;
  defaultModel: string;
  apiKey: string;
};
```

Rust 将 API Key 写入 Stronghold，SQLite 只保存 `api_key_ref`。

### `test_provider_config`

验证 key、base url 和 model 是否可用。

### `delete_provider_config`

软删除配置，并删除或失效 Stronghold 中对应 key ref。

## BackgroundJob API

### `list_background_jobs`

```ts
type ListBackgroundJobsRequest = PageRequest & {
  type?: "document_parse" | "ai_card_generation";
  status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  targetType?: string;
  targetId?: string;
};
```

### `get_background_job`

```ts
type GetBackgroundJobRequest = {
  jobId: string;
};
```

### `cancel_background_job`

取消任务。若任务已经 terminal，返回当前状态而不是报错。

## AI Card Generation API

MVP-1 增加：

```ts
type StartAiCardGenerationRequest = {
  documentId: string;
  groupId: string;
  pageStart?: number;
  pageEnd?: number;
  density: "low" | "medium" | "high";
  providerConfigId: string;
};
```

返回 `BackgroundJobDto`。具体 workflow 见 `docs/ai-card-generation.md`。

## 核心 DTO

DTO 应与数据库字段解耦，但保留稳定业务含义。

最小 DTO：

- `DocumentDto`
- `DocumentChunkDto`
- `SourceAnchorDto`
- `CardDto`
- `CardGroupDto`
- `ReviewStateDto`
- `StudyEventDto`
- `BackgroundJobDto`
- `ProviderConfigDto`

## 验收

- MVP-0 页面都能只通过 gateway/query 层获取和修改数据。
- 页面组件中不出现直接 `invoke`。
- Rust command 错误能转换为统一 `AppError`。
- 列表接口支持基本分页。
- Provider API 不返回明文 API Key。
- BackgroundJob 查询能驱动 UI 展示 queued/running/succeeded/failed/cancelled。

