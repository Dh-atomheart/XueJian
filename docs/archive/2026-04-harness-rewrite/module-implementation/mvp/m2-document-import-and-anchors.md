# M2 文档导入与锚点模块实施计划

## 模块定位

- `Module ID`: `M2`
- `Stage`: `MVP`
- `Priority`: `P0`
- `Spec Reference`: `spec.md` §2.2.2、§5.1.1、§6.2
- `Depends On`: `M1`
- `Blocks`: `M3`、`M4`、`V2-3`

## 交付目标

- 支持 PDF 选择、复制、解析、建档、分块和锚点生成
- 提供 `Document`、`DocumentChunk`、`DocumentAnchor` 作为后续模块输入
- 保证上传失败时不会写入半成品业务数据

## Done Means

- 用户可导入有效 PDF 并在文档列表中看到状态流转
- `DocumentChunk` 与 `DocumentAnchor` 可被 `M3` 与 `M4` 复用
- 错误文件可被识别并留下明确错误状态

## 前置条件

- `M1` 的数据库、gateway、桌面壳层和文档仓库已可用
- PDF 仅支持 MVP 范围内的单一格式，不接入 MD/TXT/DOCX

## 交付物

- 代码层：上传器、列表、PDF 解析与文本抽取服务
- 数据层：文档表、分块表、锚点表写入逻辑
- 测试层：上传、解析、错误处理、锚点生成测试
- 文档层：上传链路与锚点生成规则

## 一级任务映射

| 一级任务 | 内容 |
| --- | --- |
| `M2-T1` | 文件选择对话框 |
| `M2-T2` | 文件复制到应用目录 |
| `M2-T3` | PDF.js集成 |
| `M2-T4` | PDF文本层提取 |
| `M2-T5` | PDF页面渲染 |
| `M2-T6` | 锚点数据结构设计 |
| `M2-T7` | 文档元数据解析 |
| `M2-T8` | 文档状态管理 |
| `M2-T9` | 文档列表展示 |

## 实施级子任务

| 一级任务 | 子任务 | 说明 |
| --- | --- | --- |
| `M2-T1` | `M2-T1.1` 接入文件选择命令；`M2-T1.2` 限制扩展名与错误提示 | 只接受 PDF |
| `M2-T2` | `M2-T2.1` 复制到应用目录；`M2-T2.2` 生成统一文件命名策略 | 保证后续路径稳定 |
| `M2-T3` | `M2-T3.1` 封装 PDF.js 加载器；`M2-T3.2` 抽离页面与文本层接口 | 不让组件直接依赖底层 API |
| `M2-T4` | `M2-T4.1` 提取文本项；`M2-T4.2` 生成段落与块级结构 | 为 FTS5 和卡片生成做准备 |
| `M2-T5` | `M2-T5.1` 渲染页面画布；`M2-T5.2` 处理分页缓存与大文件告警 | 控制性能开销 |
| `M2-T6` | `M2-T6.1` 固定 `page + quote + rects + hash`；`M2-T6.2` 定义 paragraph 编号规则 | 锚点稳定性核心 |
| `M2-T7` | `M2-T7.1` 解析页数、大小、hash；`M2-T7.2` 持久化 `Document` 与初始状态 | 统一写库入口 |
| `M2-T8` | `M2-T8.1` 定义状态机；`M2-T8.2` 同步前端状态展示与错误信息 | 避免影子状态 |
| `M2-T9` | `M2-T9.1` 文档列表查询；`M2-T9.2` 列表卡片和状态 badge 展示 | 供后续选择文档 |

## 计划改动路径

- `xuejian/src/components/documents/`
- `xuejian/src/features/documents/`
- `xuejian/src/services/renderer/`
- `xuejian/src-tauri/src/commands/documents.rs`
- `xuejian/src-tauri/src/db/repositories/document_repo.rs`

## 接口与数据契约

- 公共业务类型：`Document`、`DocumentAnchor`、`DocumentChunk`
- 关键契约：
  - `Document.status`: `uploading | parsed | indexing | generating | ready | error`
  - `DocumentAnchor` 必须保留 `page`、`paragraph`、`textQuote`、`rects`、`hash`
- 模块内部实施类型：
  - `ParsedPdfPage`
  - `AnchorSourceTextItem`

## 数据流 / 交互流

1. 用户选择 PDF
2. Rust 复制文件并创建 `Document`
3. 前端通过 PDF.js 加载并提取文本层
4. 生成 `DocumentChunk` 与 `DocumentAnchor`
5. 状态从 `uploading -> parsed -> ready`
6. 文档出现在列表并可供后续生成卡片

## 异常与边界

- 损坏 PDF 与空文件必须进入 `error` 状态
- 大文件只做提示，不在 MVP 内引入复杂后台转码
- 不允许在 `M2` 中提前引入多格式导入逻辑
- 锚点写入失败时不得将状态错误标记为 `ready`

## 测试矩阵

- 单元：文件类型校验、hash、锚点生成、文本分块
- 集成：完整上传、重启后查询文档、锚点持久化
- 视觉验收：文档列表、上传器、状态 badge 与默认壳层风格一致

## 验收清单

- [ ] `M2-T1` ~ `M2-T9` 已覆盖
- [ ] 所有一级任务均已有实施级子任务
- [ ] `Document / DocumentChunk / DocumentAnchor` 可稳定入库
- [ ] 文档错误路径明确且不会污染后续模块
- [ ] `M3` 与 `M4` 可直接复用本模块输出
