# M03：PDF 导入与解析闭环

## 目标

实现 PDF 导入、文件复制、hash 去重、PyMuPDF 解析和 BackgroundJob 状态闭环。

## 所属 MVP

MVP-0。

## 相对工作量

L。

## 前置条件

- M02 完成。
- `documents`、`document_chunks`、`source_anchors`、`background_jobs` 可用。
- 已阅读 `docs/ipc-api.md` 和 `docs/background-jobs.md`。

## 交付内容

- 用户可导入 PDF。
- PDF 复制到应用数据目录。
- 按文件 hash 去重。
- PyMuPDF 解析可复制文本 PDF。
- 解析结果写入 chunk 和 source anchor。
- 解析失败写入 `BackgroundJob failed` 并显示可理解错误。

## 任务分配

### Frontend

- 文档页提供导入按钮。
- 文档列表展示解析状态。
- 展示空、加载、失败状态。

### Rust/Tauri

- 实现文件选择、复制、hash 计算。
- 创建 Document 与解析 BackgroundJob。
- 调用 Python 解析入口。
- 校验解析结果并落库。

### Python orchestration

- 使用 PyMuPDF 解析 PDF 文本、页码和可选 bbox。
- 输出页面文本和 chunk。
- 扫描版或不可复制文本 PDF 返回明确失败。

### Data/Schema

- 写入 documents。
- 写入 document_chunks。
- 写入 source_anchors。
- 更新 background_jobs 状态。

### Tests

- hash 去重测试。
- 成功解析测试。
- 解析失败测试。
- job 状态流转测试。

## 不做什么

- 不做 OCR。
- 不做 Docling 阻塞增强。
- 不做 Reader 右侧联动。
- 不做导出。

## 验收场景

- 导入可复制文本 PDF 后产生文档记录和 chunk。
- 重复导入同一文件时识别 hash 重复。
- 扫描版 PDF 解析失败并显示可理解错误。
- 失败任务不会导致应用崩溃。

## 测试要求

- Rust/Python 集成测试覆盖至少一个可复制文本 PDF。
- 前端测试覆盖文档页导入状态。

## 风险与回退

- PyMuPDF 输出不稳定：MVP 只依赖文本、页码和 quote。
- 大文件解析慢：先以 BackgroundJob 展示状态，不做复杂并发优化。

## 完成后解锁

M04：Basic 卡片与分组管理。
