---
title: 组件系统规范
---

# 组件系统规范

## 1. 说明

本文件分为两部分：

- 当前已存在的基础组件与壳层组件：直接映射真实代码路径
- 尚未实现的目标业务组件：只定义目标契约与推荐路径，不视为当前实现

所有组件默认遵循以下统一契约：

- `Purpose`：组件承担什么任务
- `Structure`：主要结构或 anatomy
- `Variants`：可选样式或形态
- `States`：至少列出空闲、hover、focus、disabled 或业务状态
- `Interaction`：关键交互规则
- `Do/Don't`：允许与禁止用法
- `Implementation Path`：当前实现路径或推荐路径

## 2. 基础 UI 组件

## 2.1 Button

- `Purpose`：承载主要操作、次要操作和轻量工具动作
- `Structure`：文本或图标按钮，内部保持居中对齐
- `Variants`：
  - 当前实现：`default | outline | ghost | sketch`
  - 设计语义：主操作、次操作、背景弱化操作、风格化强调操作
- `States`：default、hover、focus-visible、disabled
- `Interaction`：
  - focus 态必须可见
  - 不允许用 hover 作为唯一反馈
  - 图标按钮应有明确 `title` 或可访问名称
- `Do`：
  - 用 `default` 承担主流程确认
  - 用 `outline` 和 `ghost` 放在工具栏或列表控制区
  - 用 `sketch` 承担少量品牌化动作
- `Don't`：
  - 不要整页都使用 `sketch`
  - 不要把危险操作伪装成普通按钮
  - 不要把长段说明塞进按钮
- `Implementation Path`：`xuejian/src/components/ui/Button.tsx`

## 2.2 Input

- `Purpose`：承载表单输入、关键词搜索、模型配置等文本输入任务
- `Structure`：标准单行输入框，保持清晰矩形轮廓
- `Variants`：
  - 当前实现：单一基础输入样式
  - 目标规范：可通过容器组合形成搜索框、带状态输入框
- `States`：default、placeholder、focus-visible、disabled、error
- `Interaction`：
  - 输入焦点要优先依赖边框或线色变化
  - 错误状态以文案 + 边框变化联合表达
- `Do`：
  - 使用 `fontBody` 或清晰界面字体展示输入内容
  - 保持足够左右内边距
- `Don't`：
  - 不要给输入框加手绘扭曲边线
  - 不要用纹理做输入框底面
- `Implementation Path`：`xuejian/src/components/ui/Input.tsx`

## 2.3 Panel

- `Purpose`：统一管理页面表面层级
- `Structure`：以 surface variant 决定背景、边框、阴影和 padding
- `Variants`：
  - 当前实现：`canvas | panel | paperCard | stickyNote | toolbar | modal`
- `States`：静态容器为主；当作为交互容器时由内部组件承担状态
- `Interaction`：
  - `stickyNote` 只用于附着性上下文
  - `toolbar` 用于低高度控制条，不应承载密集正文
- `Do`：
  - 用 `canvas` 承担主工作面
  - 用 `panel` 组织常规功能区
  - 用 `paperCard` 放中等强调的信息摘要
- `Don't`：
  - 不要把所有内容都塞进 `stickyNote`
  - 不要把 `modal` 用作常驻布局块
- `Implementation Path`：`xuejian/src/components/ui/Panel.tsx`

## 2.4 Divider

- `Purpose`：建立内容分区和弱边界
- `Structure`：横向或纵向单线分隔
- `Variants`：
  - 当前实现：`horizontal | vertical`
  - 目标规范：未来可在保持克制的前提下扩展虚线或轻手绘线
- `States`：静态
- `Interaction`：不承担点击或折叠逻辑
- `Do`：
  - 用于 `TopBar`、列表分组、设置分区
- `Don't`：
  - 不要用多重分隔线堆积出层次
  - 不要以颜色替代结构分隔
- `Implementation Path`：`xuejian/src/components/ui/Divider.tsx`

## 3. 壳层组件

## 3.1 AppShell

- `Purpose`：提供桌面端统一壳层布局
- `Structure`：
  - 左侧 `SidebarRail`
  - 顶部 `TopBar`
  - 主内容区
  - 可选左辅助栏
  - 可选右 `ContextRail`
- `Variants`：
  - 当前实现支持通过 `sidebar`、`contextPanel` 组合不同页面形态
  - 目标规范与 `PageShellVariant` 对齐
- `States`：完整布局、双栏布局、隐藏上下文栏的小桌面退化
- `Interaction`：
  - 任何页面都必须先保证主任务区域完整
  - `ContextRail` 只在存在有效上下文联动时出现
- `Do`：
  - 保持壳层稳定，减少跨页面认知切换
- `Don't`：
  - 不要让 `TopBar` 和侧栏承担页面正文信息
- `Implementation Path`：`xuejian/src/components/shell/AppShell.tsx`

## 3.2 SidebarRail

- `Purpose`：承载全局一级导航
- `Structure`：品牌标识、导航图标组、底部或尾部固定入口
- `Variants`：
  - 当前实现：固定窄轨图标导航
  - 目标规范：在保持窄轨的前提下支持当前页提示和 tooltip
- `States`：default、hover、active、focus
- `Interaction`：
  - 当前页提示必须稳定且低干扰
  - 图标按钮热区不小于 `36px`
- `Do`：
  - 让图标首先表达功能，文本依赖 tooltip 或辅助文案
- `Don't`：
  - 不要在窄轨里塞入多行文本
  - 不要用高饱和底色标记当前页
- `Implementation Path`：`xuejian/src/components/shell/SidebarRail.tsx`
- `Current Implementation Note`：当前采用本地 `useState` 管理 active 状态，后续应与真实路由联动

## 3.3 TopBar

- `Purpose`：提供页面名、工具动作和弱状态提示
- `Structure`：左侧标题区，右侧状态区
- `Variants`：
  - 当前实现：品牌名 + slogan + 待复习计数
  - 目标规范：按页面变体承载页面标题、工具按钮、进度或筛选控制
- `States`：default、busy、has-actions
- `Interaction`：
  - 标题应简短明确
  - 状态信息不应抢占主任务焦点
- `Do`：
  - 维持低高度和稳定横向节奏
- `Don't`：
  - 不要把 `TopBar` 做成二级导航堆栈
  - 不要放入大量彩色状态徽章
- `Implementation Path`：`xuejian/src/components/shell/TopBar.tsx`

## 4. 目标业务组件契约

以下组件当前仓库中尚未落地，只定义目标契约。推荐路径是后续实现建议，不代表当前文件已存在。

| 目标组件 | 目标职责 | 推荐路径 |
|------|------|------|
| `DocumentCard` | 文档条目、状态、快速动作 | `xuejian/src/components/documents/DocumentCard.tsx` |
| `DocumentUploader` | 文档选择、拖拽上传、处理中提示 | `xuejian/src/components/documents/DocumentUploader.tsx` |
| `CardCandidatePanel` | 卡片候选确认、编辑、批量接受 | `xuejian/src/components/cards/CardCandidatePanel.tsx` |
| `PdfReader` | PDF 渲染、缩放、页码和高亮联动 | `xuejian/src/components/reader/PdfReader.tsx` |
| `StickyNoteCard` | 阅读上下文贴笺和摘要 | `xuejian/src/components/reader/StickyNoteCard.tsx` |
| `ReviewCard` | 学习正反面卡片与翻面节奏 | `xuejian/src/components/learning/ReviewCard.tsx` |
| `ReviewRatingBar` | Again / Hard / Good / Easy 评分动作 | `xuejian/src/components/learning/ReviewRatingBar.tsx` |
| `ApiKeyForm` | BYOK 配置、测试连接、状态反馈 | `xuejian/src/components/settings/ApiKeyForm.tsx` |
| `HeatmapPanel` | 学习热力图和弱统计 | `xuejian/src/components/stats/HeatmapPanel.tsx` |

### 4.1 目标业务组件统一规则

- 保持与 `ThemeTokens`、`SurfaceVariant`、`PageShellVariant` 一致
- 业务组件优先清晰任务边界，不把多个流程混进同一面板
- 涉及长任务的组件必须原生定义 `loading / processing / error / success`
- 贴笺类组件只能用于上下文附着，不能成为表单主结构

## 5. 组件禁用规则总表

- 不在正文密集区域使用高对比纹理背景
- 不在表单和数据输入场景使用扭曲手绘轮廓
- 不在学习评分动作上只靠颜色区分按钮
- 不用 `stickyNote` 承载大批量卡片列表
- 不让壳层装饰覆盖键盘焦点、输入边框和阅读高亮
