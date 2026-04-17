# 页面策略与布局规范

## 1. 页面契约

所有核心页面统一采用以下描述结构：

- `Goal`
- `Primary Tasks`
- `Information Priority`
- `Layout Zones`
- `Critical Actions`
- `State Matrix`
- `Responsive Behavior`

MVP 核心页面固定为：

- Dashboard
- Library
- Reader
- Review
- Settings

## 2. 桌面端壳层总则

默认桌面结构：

```text
┌────────────┬────────────────────────────┬──────────────────┐
│ Sidebar    │ TopBar + Main Canvas       │ ContextRail      │
│ Rail       │                            │ (按需显示)       │
└────────────┴────────────────────────────┴──────────────────┘
```

规则：

- `SidebarRail` 始终稳定存在，负责全局定位
- `TopBar` 负责当前页面名和工具动作，不承担主内容
- `ContextRail` 只在需要联动上下文时开启，MVP 重点是阅读页

## 3. 页面一览

| 页面 | 路由 | `PageShellVariant` | 主要模块 |
|------|------|------|------|
| Dashboard | `/` | `dashboard` | M1 / M5 / M6 |
| Library | `/documents` | `library` | M2 / M3 |
| Reader | `/documents/:id` | `reader` | M4 |
| Review | `/learn` | `review` | M5 |
| Settings | `/settings` | `settings` | M6 |

## 4. Dashboard

### Goal

让用户在 10 秒内知道今天最重要的学习动作，并能从首页直接进入学习或继续阅读。

### Primary Tasks

- 查看今日待复习数量
- 继续最近文档
- 看到真实学习反馈
- 进入学习流程

### Information Priority

1. 今日任务
2. 快速开始动作
3. 最近文档
4. 弱统计与热力图

### Layout Zones

- 顶部：页面标题、弱状态摘要
- 主区左上：今日待复习数和主要 CTA
- 主区下方：最近文档列表
- 主区侧边或下半区：热力图和学习反馈

### Critical Actions

- `开始学习`
- `继续阅读最近文档`
- `前往文档库`

### State Matrix

| 状态 | 设计要求 |
|------|------|
| `first-use` | 明确引导用户先去设置 API，再上传第一份文档 |
| `empty` | 无文档、无学习记录时，首页应像“起始工作台”，而不是空白统计板 |
| `loading` | 骨架屏优先展示今日任务和最近文档占位 |
| `success` | 热力图和待复习数可见，但不喧宾夺主 |

### Responsive Behavior

- 小桌面隐藏次级统计块，保留今日任务和最近文档
- 平板退化为单主列，热力图放到下方

## 5. Library

### Goal

让用户管理文档、理解文档处理状态，并能快速进入阅读或卡片相关流程。

### Primary Tasks

- 上传 PDF
- 搜索与筛选文档
- 查看每份文档状态
- 进入阅读页

### Information Priority

1. 上传动作和处理状态
2. 文档列表
3. 筛选与搜索
4. 次要批量操作

### Layout Zones

- 顶部：页面标题、上传按钮、搜索与筛选控制
- 主区：文档卡片网格或列表
- 辅助区：处理中任务或批量动作提示

### Critical Actions

- `上传文档`
- `打开文档`
- `重新生成卡片`
- `删除 / 导出`

### State Matrix

| 状态 | 设计要求 |
|------|------|
| `first-use` | 重点强调上传第一份 PDF，说明系统将生成卡片 |
| `empty` | 展示上传入口、支持格式和处理流程预期 |
| `processing` | 正在解析或生成卡片时，状态文案要明确当前阶段 |
| `error` | 错误卡片需说明失败原因和重试动作 |
| `success` | 已就绪文档应突出可进入阅读页 |

### Responsive Behavior

- 小桌面优先切换为单列列表
- 上传、搜索和筛选保持在同一可见区域，不拆成多行工具堆栈

## 6. Reader

### Goal

让用户在阅读 PDF 时看到与当前页相关的卡片、贴笺和高亮，并完成“原文 <-> 卡片”的双向联动。

### Primary Tasks

- 阅读 PDF
- 查看当前页相关卡片
- 点击卡片跳转原文
- 选中文本创建卡片

### Information Priority

1. PDF 正文与页码位置
2. 当前页相关卡片
3. 高亮与摘要
4. 缩放、搜索、翻页等工具

### Layout Zones

- 顶部：文档标题、页码、缩放、搜索、回到上次位置
- 主区：PDF 阅读面
- 右侧 `ContextRail`：当前页卡片、贴笺摘要、快速创建入口

### Critical Actions

- `点击卡片定位原文`
- `选中文本创建卡片`
- `翻页 / 缩放 / 搜索`

### State Matrix

| 状态 | 设计要求 |
|------|------|
| `loading` | 优先保证 PDF 区域和上下文栏都有清晰占位 |
| `empty` | 当前页无卡片时，右栏显示“可从选中文本创建卡片” |
| `processing` | 新建卡片或同步定位时，反馈要轻，不阻塞阅读 |
| `error` | PDF 渲染失败时说明是否可回到文档库重试 |
| `success` | 联动高亮清晰但克制，不遮挡正文 |

### Responsive Behavior

- 小桌面先隐藏 `ContextRail`
- 当 `ContextRail` 隐藏时，仍需保留可访问卡片入口，不能让卡片能力彻底消失

## 7. Review

### Goal

让用户连续完成一轮 FSRS 复习，尽量减少界面噪音和流程中断。

### Primary Tasks

- 看题
- 翻面
- 评分
- 继续下一张

### Information Priority

1. 当前卡片内容
2. 评分动作
3. 今日进度
4. 弱统计和预计时长

### Layout Zones

- 顶部：今日进度、剩余数量、预计时长
- 中央：卡片舞台
- 底部：Again / Hard / Good / Easy 评分条

### Critical Actions

- `显示答案`
- `Again / Hard / Good / Easy`
- `结束今日学习`

### State Matrix

| 状态 | 设计要求 |
|------|------|
| `loading` | 不做复杂骨架，保持学习舞台稳定 |
| `empty` | 今日无任务时给出完成反馈和返回首页动作 |
| `success` | 评分提交后节奏要顺畅，快速进入下一张 |
| `error` | 提交失败要允许重试，不能丢失当前卡片状态 |

### Responsive Behavior

- 小桌面优先保留卡片舞台和评分按钮
- 次级进度信息收纳到顶部单行

## 8. Settings

### Goal

让用户可靠配置模型、测试连接并理解成本与状态，而不是面对抽象技术参数。

### Primary Tasks

- 填写 API Key
- 选择提供商与模型
- 测试连接
- 查看预算和基本成本反馈

### Information Priority

1. 当前默认模型配置
2. API Key 与连接测试
3. 成本与预算信息
4. 其他偏好设置

### Layout Zones

- 顶部：页面标题和弱说明
- 主区：按配置分组的表单面板
- 侧下方或末尾：连接状态和成本提示

### Critical Actions

- `保存配置`
- `测试连接`
- `设为默认模型`

### State Matrix

| 状态 | 设计要求 |
|------|------|
| `first-use` | 首次配置时明确说明 BYOK 与本地存储边界 |
| `loading` | 先显示已有元数据，再补密钥状态和连接结果 |
| `processing` | 测试连接时给出明确处理中提示 |
| `success` | 成功状态应靠近表单，不必弹出强提示 |
| `error` | 错误说明要包含可修复建议，如 key、base URL、模型名检查 |

### Responsive Behavior

- 小桌面改为单列分组面板
- 表单动作区保持粘连，不把保存和测试按钮拆散

## 9. 页面禁用规则

- 不将首页做成 KPI 仪表盘
- 不将文档库做成传统后台表格墙
- 不在阅读页使用高对比纹理背景
- 不在学习页放入多余统计卡和装饰插图
- 不在设置页用手绘风标题替代表单可读性
