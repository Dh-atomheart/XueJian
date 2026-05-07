# M10：PDF Reader 与当前页卡片联动

## 目标

实现 pdfjs-dist Reader、沉浸模式和当前页相关卡片侧栏。

## 所属 MVP

MVP-2。

## 相对工作量

L。

## 前置条件

- M09 完成。
- AI 或手动卡片已有 source page 和 source quote。

## 交付内容

- 使用 pdfjs-dist 自建 Reader。
- Reader 模式隐藏主侧栏。
- 顶部工具条包含返回、标题、页码、翻页、缩放。
- 左 PDF，右当前页相关卡片。
- 右侧卡片显示 title/front/source page/source quote。
- 当前页无卡片时显示空状态。

## 任务分配

### Frontend

- Reader 页面。
- 顶部工具条。
- 当前页状态和翻页。
- 右侧卡片栏。
- tooltip / aria-label。

### Rust/Tauri

- 提供 PDF 文件访问能力。
- 按 document/page 查询卡片。
- 返回来源页码和 quote。

### Python orchestration

- 无新增任务。

### Data/Schema

- 复用 source_anchors 和 cards。

### Tests

- Reader 打开 PDF。
- 翻页更新当前页。
- 当前页卡片查询。
- 空状态。
- 窄宽度不重叠。

## 不做什么

- 不做精确词级坐标高亮。
- 不做 OCR。
- 不做缩略图导航。
- 不做 annotated PDF export。

## 验收场景

- 用户打开 PDF Reader。
- 用户翻页后右侧卡片随页码更新。
- 卡片显示来源页码和 quote。
- 当前页无卡片时显示空状态。

## 测试要求

- 前端 Reader 测试。
- Rust 按页查询卡片测试。
- e2e smoke 覆盖 Reader 主路径。

## 风险与回退

- pdfjs-dist 性能不足：优先稳定单页或分页渲染。
- 来源不精确：MVP 只承诺页码和 quote。

## 完成后解锁

M11：学习仪表盘与体验打磨。
