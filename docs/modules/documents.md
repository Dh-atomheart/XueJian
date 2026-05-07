# Documents 模块设计

Documents 模块负责 PDF 导入、存储、解析、阅读和来源定位。它是卡片生成、PDF 侧栏联动和未来 RAG 的基础。

## 目标

MVP 目标是稳定支持可复制文本 PDF：

- 用户导入 PDF。
- 应用复制 PDF 到本地应用库。
- 系统按 hash 识别重复导入。
- PyMuPDF 解析文本并生成 chunk。
- 用户可基于整篇文档或页码范围生成卡片。
- PDF 阅读页能根据当前页展示相关卡片。

## 不做什么

MVP 不做：

- 扫描版 PDF OCR。
- 完整 PDF 编辑器。
- 精确词级高亮。
- 注释写回 PDF。
- annotated PDF export。
- 表格、图片、公式的结构化抽取。

Docling 只作为后台增强能力，不阻塞 MVP 导入和阅读流程。

## 当前决策

- 解析采用 `PyMuPDF + Docling` 双层策略。
- PyMuPDF 是 MVP 主线。
- Docling 是按需后台增强。
- 阅读器基于 `pdfjs-dist` 自建，不嵌入完整 PDF.js Viewer。
- Source anchor 使用 `page + quote + optional bbox`。
- PDF 导入后复制到应用数据目录，不依赖原路径。
- 重复导入按文件 hash 识别。
- MVP 文件类型只支持 PDF。

## 核心流程

### PDF 导入

```text
用户选择 PDF
-> Rust 计算文件 hash
-> 检查 documents 是否已有相同 hash
-> 无重复：复制到应用库
-> 创建 Document
-> 创建 PDF 解析 BackgroundJob
```

重复导入时：

- 如果 hash 已存在，提示用户打开已有文档。
- 后续可以支持“作为副本导入”，但不是 MVP 必需主线。

### PDF 解析

```text
Rust 创建 BackgroundJob
-> Python PyMuPDF 解析文本、页码和可选 bbox
-> Python 产出页面文本和 chunk
-> Rust 校验并写入 DocumentChunk / SourceAnchor
-> job succeeded 或 failed
```

解析失败时：

- 保留 Document 记录。
- `BackgroundJob` 标记 failed。
- UI 显示可理解错误，例如“该 PDF 可能是扫描版或文本不可复制”。

### PDF 阅读联动

```text
用户打开 PDF 阅读页
-> 前端 pdfjs-dist 渲染 PDF
-> 当前页码变化
-> 查询该页 SourceAnchor 关联的 Card
-> 右侧展示当前页相关卡片
```

MVP 只要求页码和文本片段级定位。`optional bbox` 可用于未来高亮层。

## 数据与状态

核心实体：

- `Document`：导入的 PDF。
- `DocumentChunk`：解析后的文本片段。
- `SourceAnchor`：来源定位，连接 chunk、页码、quote、可选 bbox。
- `BackgroundJob`：解析和增强任务状态。

关系：

```text
Document -> DocumentChunk -> SourceAnchor -> Card
Document -> BackgroundJob
```

## 与其他模块的边界

- Documents 不负责卡片内容质量，只提供可追踪来源。
- Cards 负责保存和管理卡片。
- AI 负责基于 chunk 生成卡片候选结果。
- Study 不直接依赖 PDF，只依赖 Card 和 ReviewState。
- Data 权威在 Rust/SQLite，Python 不直接写库。

## MVP 验收场景

- 用户导入一个可复制文本 PDF，文件被复制到应用库，并生成 Document。
- 重复导入同一 PDF 时，系统能识别 hash 重复并提示。
- PyMuPDF 能解析 PDF 文本并生成 chunk。
- 解析失败时 UI 能展示明确错误。
- 用户打开 PDF 阅读页，左侧显示 PDF，右侧显示当前页相关卡片。
- 卡片能显示来源页码和来源文本片段。

## 后续待细化问题

- PyMuPDF chunk 切分规则。
- Docling 增强任务触发条件。
- `optional bbox` 的坐标格式。
- pdfjs-dist 阅读器性能策略。
- 大文件导入和解析取消策略。
