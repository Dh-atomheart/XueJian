# Background Jobs 工程契约

本文档定义 XueJian 长任务模型。架构边界以 `docs/architecture.md` 为准，数据库字段以 `docs/database-baseline.md` 为准，IPC 形状以 `docs/ipc-api.md` 为准。

## 目标

- 所有长任务都进入 `background_jobs`。
- UI 不阻塞等待长任务完成。
- Rust 负责创建任务、持久化状态、写入最终结果。
- Python orchestration 只执行解析或 AI workflow，不直接写 SQLite。
- 任务失败必须有用户可理解的错误信息。

冻结能力 `knowledge / podcast / animation / points / export / profile` 不进入当前任务主线。

## 任务类型

MVP 主线任务：

```text
document_parse
ai_card_generation
```

预留但不进入当前 MVP 主线：

```text
docling_enhance
tts_generation
```

## 状态机

```text
queued -> running -> succeeded
queued -> running -> failed
queued -> cancelled
running -> cancelled
```

状态含义：

- `queued`：任务已创建，等待执行。
- `running`：任务正在执行。
- `succeeded`：任务完成，结果已经由 Rust 权威层落库。
- `failed`：任务失败，错误已记录。
- `cancelled`：任务取消，不再继续执行。

`succeeded / failed / cancelled` 是 terminal 状态。

## 状态转换规则

- 新任务只能以 `queued` 创建。
- 只有 `queued` 可以进入 `running`。
- 只有 `queued / running` 可以取消。
- terminal 状态不能重新运行。
- retry 必须创建新 job，并在新 job payload 中记录 `retryOfJobId`。
- 如果任务写库需要多个步骤，必须在 Rust 层事务内完成。
- AI 卡片生成失败时不允许部分入库。

## 进度与日志

每个任务可更新：

```text
progress_current
progress_total
progress_message
error_message
error_details
```

规则：

- `progress_message` 用于 UI 展示当前阶段，例如“正在解析第 3 页”。
- `error_message` 面向用户，必须简短、可理解。
- `error_details` 面向调试，可包含 provider 原始错误、堆栈摘要或 workflow 阶段信息。
- MVP 不要求完整日志表；若需要详细日志，后续新增专项设计。

## 取消与重试

### 取消

- UI 调用 `cancel_background_job`。
- Rust 设置 `cancel_requested_at`。
- 若任务仍在 `queued`，直接转为 `cancelled`。
- 若任务在 `running`，Python workflow 在安全检查点检查取消信号。
- 取消不是失败，不显示为错误。

### 重试

- failed job 可由 UI 触发重试。
- 重试创建新 job。
- 原 job 保留 failed 状态和错误信息。
- 新 job 继承必要 payload，但重新生成 `id` 和时间。

## 恢复策略

应用重启后：

- `succeeded / failed / cancelled` 保持不变。
- `queued` 可继续调度。
- `running` 统一标记为 `failed`，`error_message` 为“任务因应用关闭而中断，请重试”。

MVP 不实现跨进程精细恢复；优先保证状态不悬挂。

## `document_parse` 任务

输入 payload：

```json
{
  "documentId": "uuid",
  "filePath": "app-data/path.pdf",
  "parser": "pymupdf"
}
```

成功结果：

- 更新 `documents.parse_status = parsed`。
- 写入 `document_chunks`。
- 更新 `documents.page_count`。
- job 状态转为 `succeeded`。

失败结果：

- 更新 `documents.parse_status = failed` 或 `unsupported`。
- job 状态转为 `failed`。
- 记录用户可理解错误，例如“该 PDF 无可复制文本，MVP 暂不支持 OCR”。

## `ai_card_generation` 任务

输入 payload：

```json
{
  "documentId": "uuid",
  "groupId": "uuid",
  "pageStart": 1,
  "pageEnd": 10,
  "density": "medium",
  "providerConfigId": "uuid"
}
```

成功结果：

- Python 返回结构化卡片候选。
- Rust 校验来源和 schema。
- Rust 在事务中写入 `source_anchors / cards / review_states`。
- job 状态转为 `succeeded`。

失败结果：

- 不写入任何卡片。
- job 状态转为 `failed`。
- Provider 认证失败、余额不足、schema 校验失败等都必须给出明确 `error_message`。

## 与 IPC/API 的关系

最低接口：

- `list_background_jobs`
- `get_background_job`
- `cancel_background_job`
- 由业务 command 创建具体任务，例如 `import_document` 或 `start_ai_card_generation`。

前端轮询或订阅 job 状态时，只依赖稳定 DTO，不读取数据库内部字段。

## 验收

- PDF 解析失败能写入 failed job。
- 扫描版或无文本 PDF 能给出 unsupported/failed 的可理解说明。
- AI 生成失败不部分入库。
- UI 能展示 queued/running/succeeded/failed/cancelled。
- 应用重启后不存在长期 running 的悬挂任务。

