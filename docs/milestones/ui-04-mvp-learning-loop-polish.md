# UI-04：MVP 学习闭环页面打磨

## 目标

按学习闭环顺序打磨 MVP 页面，确保 PDF 到复习到统计的核心体验完整。

## 所属阶段

UI 改造路线，MVP 页面体验 gate。

## 相对工作量

L。

## 前置条件

- UI-03 完成。
- 共享组件、主题 token 和状态表达可用。
- M10 Reader 与 M11 Dashboard 的核心能力已存在或可复用。

## 交付内容

### Library

- 文档导入入口。
- 文档列表。
- 解析状态。
- 失败原因。
- 打开 Reader。
- 列表适合扫描：标题、页数、解析状态、最近使用时间、卡片数量。

### Reader

- 沉浸模式。
- 顶部工具栏：返回、标题、页码、翻页、缩放、侧栏切换。
- PDF 阅读区稳定，不因右侧栏变化横向跳动。
- 右侧当前页卡片栏展示 Card Preview 和 Source Quote。

### Cards

- Basic 卡片列表。
- 搜索、文档筛选、分组筛选、tags 筛选。
- 新增、编辑、删除、多选、批量删除。
- 来源文档、页码、quote 可见。
- 不加入 MVP 导出按钮。

### Review

- 专注复习布局。
- 翻面。
- 四档反馈：忘记、模糊、记得、熟练。
- 快捷键 `Space` 和 `1/2/3/4`。
- 退出或暂停确认。

### Dashboard

- 今日任务。
- 待复习。
- 新卡。
- 连续学习。
- 热力图。
- 最近文档。
- 掌握进度。
- 首次使用引导导入 PDF。
- 异常提醒：解析失败、复习堆积。

## 任务分配

### Frontend

- 按 Library -> Reader -> Cards -> Review -> Dashboard 顺序打磨页面。
- 用 UI-03 组件替换页面内重复状态表达。
- 补齐窄屏布局，避免 Reader、Cards、Review、Dashboard 重叠。
- 检查冻结入口不出现在任何 MVP 页面。

### Rust/Tauri

- 仅补齐页面已有需求对应的查询或状态字段；不新增 RAG、export、podcast API。

### Python orchestration

- 无新增任务。

### Data/Schema

- 不新增冻结功能相关 schema。

### Tests

- Library 页面测试。
- Reader 页面和布局测试。
- Cards 筛选、编辑、批量删除测试。
- Review 翻面、反馈、快捷键测试。
- Dashboard 统计和空状态测试。
- 关键 e2e smoke 覆盖学习闭环。

## 不做什么

- 不引入 RAG 入口作为 MVP 主入口。
- 不做 Reader 跳转到 RAG。
- 不做 podcast、animation、points、export。
- 不做 VNext 多标签 Reader。

## 验收场景

- 用户能完成 `导入 PDF -> 打开 Reader -> 查看/创建卡片 -> 管理卡片 -> 复习 -> Dashboard 反馈`。
- Reader、Cards、Review、Dashboard 在窄宽度下不重叠。
- 所有页面覆盖 empty/loading/error。
- UI 无冻结入口。

## 风险与回退

- 页面打磨范围过大：严格按闭环顺序推进，未轮到的页面只修阻断问题。
- 后端字段不足：优先复用现有 query/gateway，新增字段必须绑定当前 MVP 页面验收。

## 完成后解锁

UI-05：Knowledge / RAG V1 页面。
