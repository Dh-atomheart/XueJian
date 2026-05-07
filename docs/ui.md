# XueJian 前端设计与实施规范

本文档是 XueJian 前端 UI 的权威总纲，维护视觉语言、导航边界、组件原则、页面职责和前端实施规则。详细页面、组件、状态和主题说明见 [学习工作台交互界面设计规范](./学习工作台_交互界面设计规范_v1.0.md)。

发生冲突时按以下顺序判断：

1. 产品边界、MVP 范围和阶段路线以 [spec.md](./spec.md) 为准。
2. 架构、数据权威、长任务和密钥流转以 [architecture.md](./architecture.md) 为准。
3. UI 视觉、组件、页面和前端实施以本文档为准。
4. 详细手册只在不冲突时补充本文档；详细手册中的 `Proposal` 不能作为开发验收依据。

## 1. 定位

XueJian 是强本地优先的 PDF 学习闪卡桌面应用。前端不是营销站点，也不是通用 AI 聊天入口，而是重度自学者每天使用的学习工作台。

设计方向：

```text
低噪音 / 高信息密度 / 专业学习工具 / 长时间阅读友好 / 来源可追踪
```

第一屏是学习仪表盘，不做 landing hero。UI 必须优先服务：

- 长时间 PDF 阅读。
- 文档到卡片的转化。
- 卡片管理和分组。
- 每日复习。
- 学习统计和进度反馈。
- V1 学习型 RAG 知识问答。

## 2. 阶段标签

所有 UI 规范、页面入口和组件能力必须标注阶段：

| 标签 | 含义 | 开发处理 |
|------|------|----------|
| `MVP` | 当前主线可实施范围 | 可直接进入开发和验收 |
| `V1` | 近期路线，依赖 MVP 基础稳定 | 可进入规划；实施前确认对应 MVP/里程碑 |
| `VNext` | 长期愿景 | 不作为当前验收依据 |
| `Proposal` | 超出当前 `spec.md` 的设计提案 | 必须先同步产品路线文档，才能实施 |

详细手册可以记录 `VNext` 和 `Proposal`，但页面、导航和设置入口不得因为这些提案自动进入当前产品。

## 3. 信息架构

### 3.1 MVP 主导航

MVP 主导航固定为：

```text
首页 / 文档 / 卡片 / 学习 / 设置
```

V1.1 文档 RAG 问答进入路线后，正式主导航扩展为：

```text
首页 / 文档 / 卡片 / 学习 / 知识 / 设置
```

对应内部导航模型：

```text
home / library / cards / learning / settings
```

导航原则：

- 使用 lucide-react 图标。
- 图标与文字并用；窄侧栏可只显示图标，但必须有 tooltip 或可访问 label。
- 当前页面状态清晰，但不要使用高饱和大面积背景。
- Reader 不作为主导航项；从文档、卡片来源或相关上下文进入。
- Reader 模式隐藏主侧栏，进入沉浸阅读。

### 3.2 V1 导航扩展

V1 可新增 `知识/RAG` 主导航：

```text
home / library / cards / learning / knowledge / settings
```

约束：

- `knowledge` 只承载学习型 RAG 问答，不是通用聊天。
- V1 规范遵守 [m14-rag-ui-polish.md](./milestones/m14-rag-ui-polish.md)：不承诺 Reader 跳转、PDF 高亮、自动制卡、推荐追问。
- 若 `spec.md` 尚未同步该导航，`knowledge` 入口按 `Proposal` 处理，不进入开发验收。

### 3.3 不进入 MVP 主导航

```text
podcast / animation / points / export / profile
```

冻结功能不删除历史代码，但不得出现在 MVP 主导航、首页任务卡、设置 tab 或默认快捷入口中。

## 4. 视觉语言

### 4.1 主题模型

产品级主题模型为：

```text
theme = light | dark | system
```

- `light`：默认主题，暖纸张、低对比边界、长时间阅读友好。
- `dark`：一等主题，深色管理区、克制边界、Reader 保持低眩光。
- `system`：跟随 OS 偏好；实际渲染解析为 `light` 或 `dark`。

文档层面允许先定义主题模型；代码 schema、Tauri API 和数据库契约的修改必须在后续开发任务中单独实施。

### 4.2 色彩

浅色主题默认使用 warm paper 体系，但不能让整站只剩米色。深色主题必须是完整等价主题，而不是简单反色。

语义 token 应覆盖：

- 应用背景：`surface-app`
- 侧栏/工具栏：`surface-muted`
- 内容面：`surface-card`
- 悬浮层：`surface-elevated`
- Reader 背景：`surface-reader`
- 主文本：`text-primary`
- 次文本：`text-secondary`
- 弱文本：`text-tertiary`
- 边界：`border-default`、`border-subtle`
- 强调：`accent-primary`
- 状态：`success`、`warning`、`danger`、`info`
- 高亮：`highlight-yellow/green/blue/pink/orange`

避免：

- 大面积紫蓝渐变。
- 单一米色或单一暗色导致层级丢失。
- 高饱和警告色常驻。
- 暗黑高对比开发者工具风格。
- 装饰性玻璃态和大面积投影。

### 4.3 字体、间距、圆角

- 中文优先清晰，不追求花哨。
- 不使用 viewport width 缩放字体。
- letter spacing 默认为 0；英文 uppercase 元标签允许极小正字距。
- 基础间距按 4px 网格。
- 工具栏高度稳定，避免内容变化导致跳动。
- 主要卡片圆角目标 8px 左右；现有大圆角可迁移期保留，但新组件向更克制的桌面工具风格收敛。
- 阴影轻，优先用边界、背景和间距表达层级。

### 4.4 动效

动效只服务状态理解：

- 页面切换可以轻微 fade 或 slide。
- 长任务状态用 spinner、progress 或 skeleton。
- 卡片翻面可以有明确 flip 动效。
- Tooltip、Popover、Dialog 使用短动效。
- Reader 中禁止自动播放或影响阅读稳定性的装饰动画。
- 必须支持 `prefers-reduced-motion`。

## 5. 页面规范

### 5.1 首页 `MVP`

首页是学习仪表盘，回答“今天我该学什么？”。

必须包含：

- 今日待复习和新卡入口。
- 学习热力图。
- 今日完成数。
- 学习时长。
- 连续学习天数。
- 最近文档。
- 分组或文档掌握进度。

不得展示冻结功能快捷入口。V1 可以弱化展示 `知识/RAG` 入口，但只有在 `knowledge` 已进入产品路线后才允许进入主布局。

### 5.2 文档页 `MVP`

文档页负责文档库和文档任务。

必须包含：

- PDF 导入入口。
- 文档列表。
- 解析状态。
- 失败原因。
- 生成卡片入口。
- 打开 Reader 入口。

文档列表应适合扫描：标题、页数、解析状态、最近使用时间、卡片数量。

### 5.3 PDF Reader `MVP`

Reader 使用沉浸模式：

```text
顶部工具条
左侧 PDF 阅读区
右侧当前页相关卡片
```

要求：

- 隐藏主侧栏。
- 顶部工具条包含返回、标题、页码、翻页、缩放和必要视图切换。
- 右侧栏默认显示当前页卡片。
- 卡片显示来源页码和来源 quote。
- PDF 阅读区优先稳定，避免横向挤压。
- 高亮颜色用于表达不同卡片来源，但 MVP 不要求精确词级坐标。

`VNext` 可以探索多标签 Reader；在进入路线前按 `Proposal` 处理。

### 5.4 卡片页 `MVP`

卡片页负责学习资产管理。

必须包含：

- Basic 卡片列表。
- 分组筛选。
- 文档来源筛选。
- tags 筛选。
- 搜索。
- 新增、编辑、删除。
- 多选和批量删除。
- 来源页码和 source quote。

MVP 只展示 Basic 单卡型，不为 Cloze、Choice、Image Occlusion 暴露主 UI。

### 5.5 学习页 `MVP`

学习页以单卡聚焦为主。

必须包含：

- 当前卡片。
- 翻面。
- 四档反馈：`忘记 / 模糊 / 记得 / 熟练`。
- 当前队列进度。
- 退出或暂停入口。

复习中不要展示过多统计面板。复习过程应减少干扰。

### 5.6 设置页 `MVP`

设置页只保留三个 tab：

```text
AI / 学习 / 通用
```

AI tab：

- Provider 列表。
- OpenAI、Anthropic、OpenAI-compatible 配置。
- API Key 状态。
- 默认 Provider。

学习 tab：

- 每日新卡上限。
- 每日复习上限。
- 复习偏好。

通用 tab：

- 本地数据目录信息。
- `light / dark / system` 主题偏好。
- 应用行为偏好。

不显示 podcast、points、animation 相关设置。

### 5.7 知识/RAG 页 `V1`

知识/RAG 是学习型问答页，不是聊天页。

必须包含：

- 可用文档列表。
- 已选文档。
- 向量状态。
- 问题输入。
- 提交、取消和重试。
- pending、answered、error、cancelled、no evidence 状态。
- 结构化中文回答。
- 引用卡片：页码 + 内容片段。

V1 不做：

- Reader 跳转。
- PDF 高亮。
- 自动生成卡片。
- 推荐追问。
- 通用聊天或开放域搜索。

## 6. 组件规范

### 6.1 通用原则

- 通用 UI primitives 放入 `shared/ui` 或现有等价目录。
- 领域组件放入对应模块。
- 页面组件不得直接调用 Tauri `invoke`。
- 页面通过 query/gateway 层访问后端能力。
- 不把完整领域对象传给通用组件。
- 所有可点击区域必须有稳定尺寸。
- 所有图标按钮必须有 `aria-label` 或 Tooltip。

### 6.2 Button / IconButton

- 明确工具操作优先用 lucide-react 图标，例如返回、翻页、缩放、删除、设置。
- primary 按钮每个局部区域最多一个。
- destructive 只用于删除、清空、取消任务等高风险动作。
- loading 状态必须禁用重复提交。
- 图标按钮应有固定宽高和 tooltip。

### 6.3 Input / Select / Switch / Tabs

- 表单控件高度稳定。
- label 和错误信息必须明确。
- Select 用于有限选项。
- Switch 用于启用/暂停这类二元设置。
- Tabs 用于同级设置分区，不用于主导航。

### 6.4 Dialog / Popover / Tooltip / Drawer

- Dialog 用于编辑、确认和关键配置。
- Popover 用于轻量上下文操作。
- Tooltip 用于图标按钮和不明显的状态说明。
- Drawer 用于 Reader 侧栏、筛选面板、导入队列和窄屏详情。
- Dialog 内不能塞复杂整页流程。
- 删除确认必须说明影响范围。

### 6.5 List / Table / Card / Panel

- 列表优先服务扫描：主信息、来源、状态、下一步动作。
- 表格和列表行必须有 hover、selected、loading、empty、error 状态。
- Card 用于重复条目、仪表盘小面板、编辑区域和右侧卡片栏。
- 不做卡片套卡片。
- 页面 section 不默认做浮动卡片。
- 内容密度按桌面工具优化。

### 6.6 Empty / Skeleton / Error / Toast

所有主页面必须有：

- Empty：说明当前为空和下一步动作。
- Skeleton：用于列表、卡片、统计面板加载。
- Error：显示可理解错误和重试入口。
- Toast：用于短反馈，不承载复杂错误说明。

错误文案必须指导下一步，例如：

- PDF 不支持复制文本。
- Provider API Key 未配置。
- Provider 调用失败。
- AI 输出格式校验失败。
- 本地任务被取消。

### 6.7 Source Quote / Card Preview

卡片相关 UI 必须强化来源可追踪：

- 卡片预览显示 front 摘要、back 摘要、来源文档、页码、tags、下次复习时间。
- Source Quote 显示原文片段、页码和进入 Reader 的动作。
- 长 quote 使用 line clamp，展开在详情或编辑中处理。
- Reader 右侧当前页卡片应支持跳转、编辑、删除入口。

### 6.8 Review Feedback

复习反馈固定四档：

```text
忘记 / 模糊 / 记得 / 熟练
```

要求：

- 支持快捷键 `1 / 2 / 3 / 4`。
- 颜色必须配合文字和图标，不只依赖颜色表达。
- 反馈按钮组在窄宽度下可纵向排列，但不能重叠。

### 6.9 Background Job Badge

长任务状态必须覆盖：

- idle。
- queued。
- running。
- succeeded。
- failed。
- cancelled。
- cancellable。

展示位置可以是全局状态层、页面任务区或导入队列 Drawer。失败状态必须提供可理解原因和下一步动作。

## 7. 前端实施规范

继续使用：

- React 19。
- Vite。
- TypeScript。
- Tailwind 3。
- Radix UI。
- lucide-react。
- class-variance-authority。
- TanStack Query。
- Zustand。
- Tauri gateway。
- roughjs 作为轻点缀，而不是核心结构。

不引入：

- Next.js。
- Tailwind 4 迁移。
- Headless UI 替代 Radix。
- 示例项目的 app router。
- 与冻结功能绑定的新依赖。

目标结构沿用 `docs/spec.md`：

```text
src/app
src/modules/documents
src/modules/cards
src/modules/study
src/modules/ai
src/modules/settings
src/shared/ui
src/shared/lib
src/shared/gateway
```

迁移期可以保留现有 `features/*` 和 `components/*`，但新增通用组件应向 `shared/ui` 收敛。

## 8. 状态、响应式和 A11y

### 8.1 状态管理

- 服务端状态使用 TanStack Query。
- 局部 UI 状态优先放组件内部。
- 跨页面 UI 状态放 app/shared store。
- 领域状态不要散落到全局 store，除非确实跨页面共享。
- 长任务状态以后端 `BackgroundJob` 为准。

### 8.2 响应式

XueJian 是桌面应用，优先桌面宽屏。

- Reader、卡片页、学习页不能在窄宽度下重叠。
- 固定格式元素使用稳定尺寸、min/max、grid tracks 或 aspect-ratio。
- 表格和热力图窄宽度时允许横向滚动。
- 页面不使用 viewport width 控制字号。

### 8.3 可访问性

- 图标按钮有 `aria-label` 或 Tooltip。
- Dialog、Select、Tabs 优先使用 Radix。
- 键盘可操作。
- 焦点态可见。
- 文本和背景对比度足够。
- 不只依赖颜色表达状态。
- Dialog/Drawer 打开时管理焦点，关闭后返回触发元素。

## 9. 迁移与复用清单

优先复用：

- `xuejian/src/components/ui/Button.tsx`。
- `xuejian/src/components/ui/Panel.tsx`。
- Sketch 系列轻点缀组件。
- `xuejian/src/design-system/tokens.ts`。
- `xuejian/src/design-system/themes.ts`。
- lucide-react 图标体系。
- Radix 基础交互组件。
- pdfjs-dist 阅读器基础。

参考但不直接复制：

- `examples/sample of design code/b_Iz00yhVXR1g` 的布局、状态和组件组织。
- shadcn/Radix primitive 组织方式。
- warm paper token 和状态动画。

暂不迁移：

- Next.js 项目结构。
- Tailwind 4 `@theme` 写法。
- 示例 mock store。
- 示例乱码文案。
- 与 animation、points、export 绑定的组件和页面。

## 10. 验收清单

- `ui.md` 与详细手册在导航、技术栈、主题模型上无冲突。
- MVP 主导航只有 `首页 / 文档 / 卡片 / 学习 / 设置`；V1.1 主导航为 `首页 / 文档 / 卡片 / 学习 / 知识 / 设置`。
- V1 `知识/RAG` 入口如果未同步 `spec.md`，必须标注为 `Proposal`；同步后按正式主导航验收。
- Reader 使用沉浸模式，并显示当前页相关卡片。
- 不出现 podcast、animation、points、export、profile 的 MVP 入口。
- 设置页只有 AI、学习、通用三个 tab。
- 通用主题模型记录为 `light / dark / system`。
- 图标按钮具备 label 或 tooltip。
- 所有主页面覆盖 loading、empty、error。
- Reader、复习页和统计图在窄宽度下不重叠。
