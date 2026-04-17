---
title: Design Docs Index
status: active
owner: design
last_reviewed: 2026-04-17
canonical: true
---

# 学笺前端设计文档

本目录用于沉淀学笺桌面端的默认设计系统与页面规范，服务对象包括产品、设计、前端实现和后续 AI 协作。文档目标不是输出抽象概念，而是把产品规格中已锁定的视觉基线细化成可执行规则。

## 1. 文档定位

- 上位规范：[`docs/product-specs/mvp.md`](../product-specs/mvp.md)
- 本目录职责：细化 MVP 桌面端默认视觉语言、组件契约、页面布局和跨页交互
- 非职责：不改动阶段边界，不重定义数据模型，不替代技术架构文档

## 2. 视觉基线

学笺默认视觉方向固定为：

`极简学术感 + 中度手绘漫画风格`

本目录对该方向的执行锚点是：

`纸感工作台 + 细墨线工具界面 + 贴笺式学习上下文`

这意味着：

- 壳层需要有纸感、留白和轻微纹理，但不能干扰正文阅读
- 工具栏、分隔、按钮、状态反馈以细墨线和克制高亮为主
- 阅读页和学习页优先保证内容理解效率，不允许为了“风格感”牺牲可读性

## 3. 阅读顺序

推荐按以下顺序阅读：

1. [foundation.md](./foundation.md)
2. [tokens.md](./tokens.md)
3. [components.md](./components.md)
4. [pages.md](./pages.md)
5. [interactions.md](./interactions.md)

## 4. 文档列表

| 文档 | 作用 |
|------|------|
| [foundation.md](./foundation.md) | 定义产品气质、设计原则、Do/Don't、页面共性规则 |
| [tokens.md](./tokens.md) | 细化 `ThemeTokens`、`SketchStyle`、层级、动效和响应式尺度 |
| [components.md](./components.md) | 定义基础 UI、壳层组件和目标业务组件契约 |
| [pages.md](./pages.md) | 定义五个核心页面的任务、布局、状态和响应式退化 |
| [interactions.md](./interactions.md) | 定义跨页流程、异步反馈、任务状态和提示语言 |

## 5. 当前实现锚点

以下路径是本目录当前直接映射的代码骨架：

- 设计 Token：`xuejian/src/design-system/tokens.ts`
- 基础 UI：`xuejian/src/components/ui/Button.tsx`、`Input.tsx`、`Panel.tsx`、`Divider.tsx`
- 壳层组件：`xuejian/src/components/shell/AppShell.tsx`、`SidebarRail.tsx`、`TopBar.tsx`

未实现的业务组件、页面组件和特定流程，本目录只给出目标契约和推荐路径，不视为已落地代码。

## 6. 与产品规格的关系

这里的规则分两类：

- `product-specs/mvp.md` 已锁定：默认视觉基线、关键 Token、桌面多栏结构、阶段边界
- `docs/design-docs/*` 细化：字体用法、组件状态、动效边界、页面层级、异常态和交互规则

若本目录与产品规格冲突，以 `product-specs/mvp.md` 为准，并回补修订本目录。

## 7. 更新原则

- 先改上位规范，再改设计文档，不反向覆盖产品规格
- 已有代码与设计不一致时，必须写明“当前实现”与“目标规范”
- 所有新增风格规则都要回答一个问题：是否能提升学习效率，而不是只增加装饰
