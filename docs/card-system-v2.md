# 卡片系统开发规范 v2

> 文档版本：3.0.0  
> 最后更新：2026-04-23  
> 文档定位：卡片系统唯一开发规范  
> 当前状态：有效，但当前门禁未通过；以 `xuejian/test-results/eval-report.json` 为最新基线

---

## 1. 文档定位与适用范围

本文档是 XueJian 卡片系统的唯一开发规范，用于定义卡片系统的边界、主线、状态机、页面职责、内容规格、存储契约、完成定义和扩展规则。

本文档覆盖的卡片系统主线为：

`文档就绪 -> 候选生成 -> 候选评估与人工审核 -> 正式卡片落库 -> 复习调度`

本文档约束的实现范围包括：

- 候选卡片生成与审核工作台
- 正式卡片的数据模型、编辑能力和复习能力
- 卡片内容渲染、类型契约和 FSRS 调度
- 媒体附件、APKG 导入导出等卡片增强能力
- 相关的 Tauri IPC、Rust Repository、TypeScript schema 和前端交互契约

本文档不负责定义通用编排系统、通用 LangGraph 基础设施、知识图谱、播客、动画等旁支系统。

`docs/agent-driven-document-to-card-workflow.md` 仅作为上游专题补充文档，解释候选生成链路的编排背景和专题设计；凡涉及卡片系统页面职责、状态定义、落库边界、完成态或验收口径，均以本文档为准。

### 1.1 冲突处理规则

- 若卡片行为定义冲突，以本文档为准。
- 若 `docs/card-system-evaluation-framework.md` 的评估项与本文档冲突，先修订评估框架以对齐本文档。
- 若 `docs/agent-driven-document-to-card-workflow.md` 与本文档冲突，以本文档为准。
- 若旧实现与本文档冲突，默认视为实现待整改，除非本文档被显式修订。

---

## 2. 系统目标与非目标

### 2.1 系统目标

卡片系统当前的设计目标仅限于以下能力：

1. 以文档为输入，生成带来源信息的候选卡片。
2. 支持人工审核、编辑、接受和拒绝候选卡片。
3. 将被接受的候选卡片稳定物化为正式卡片。
4. 支持正式卡片的多类型内容渲染与复习调度。
5. 在 TypeScript 与 Rust 之间维持可验证的 IPC 契约。
6. 为媒体、APKG、导出等卡片增强能力提供稳定接口。

### 2.2 非目标

以下内容不属于本文档的目标范围：

- 通用 LangGraph 架构设计
- 知识图谱系统设计
- 播客生成系统设计
- 动画生成系统设计
- Android 迁移规划
- 云同步、多人协作、账号系统
- 与卡片行为无关的视觉主题抛光

---

## 3. 卡片系统主线总览

卡片系统的唯一主线如下：

1. 文档进入可生成状态。
2. 用户在 `CardStudioPage` 启动候选卡片生成。
3. 编排链路生成候选卡片并写入 `card_candidates`。
4. 用户在 `CardStudioPage` 中审核、编辑、接受或拒绝候选卡片。
5. 系统将被接受的候选卡片物化为正式 `cards`。
6. 用户在 `ReviewPage` 中学习正式卡片。
7. 系统依据 FSRS 更新正式卡片的调度字段与复习日志。

这一定义替代旧版“创建 -> 复习 -> 调度”单线叙事。手动创建与手动编辑仍然是系统能力，但不再被定义为卡片系统唯一入口。

### 3.1 架构摘要

```text
React UI
  -> React Query / Zustand
    -> cardsGateway / learning gateway
      -> Tauri IPC
        -> Rust commands
          -> repositories + migrations
            -> SQLite (app.db)
              -> cards / card_candidates / review_logs / card_media / workflow_*
```

### 3.2 主模块分工

- `CardStudioPage`：候选生成与审核工作台，不再定义为传统卡片列表页。
- `CardEditorModal`：候选卡片或正式卡片的编辑能力承载体，不再定义为系统唯一入口。
- `ReviewPage`：正式卡片复习会话页面。
- `cardsGateway`：卡片相关 IPC 封装与 schema 边界。
- `CardRepository`：正式卡片、候选卡片、复习记录、媒体等持久化入口。

---

## 4. 核心对象与状态机

本文档将状态机分为四组，禁止混用。

### 4.1 Document Readiness

文档就绪状态用于描述候选生成前置条件，不代表正式卡片状态。

| 状态 | 含义 |
| --- | --- |
| `uploading` | 文档刚导入，尚未完成基础处理 |
| `parsed` | 结构化解析完成 |
| `embedding` | 向量化处理中 |
| `ready` | 满足候选生成前置条件 |
| `embedding_failed` | 向量化失败，标准生成链路不可用 |
| `embedding_stale` | embedding profile 已变化，需要重建索引 |
| `error` | 文档处理失败 |

### 4.2 Candidate Lifecycle

候选卡片状态仅用于 `card_candidates`，不等同于正式卡片状态。

| 状态 | 含义 |
| --- | --- |
| `pending` | 待审核 |
| `accepted` | 已接受，待或已物化为正式卡片 |
| `rejected` | 已拒绝 |

候选卡片必须附带以下上下文能力：

- 来源信息
- 生成模式信息
- 质量评估信息
- 可编辑内容

### 4.3 Card Lifecycle

正式卡片状态仅用于 `cards.state`，不等同于候选状态。

| 状态 | 含义 |
| --- | --- |
| `new` | 新卡片 |
| `learning` | 学习中 |
| `review` | 进入常规复习 |
| `relearning` | 遗忘后重新学习 |

当前规范不把 `suspended` 定义为主流程中的稳定状态，但实现中若存在过滤逻辑，需单独在代码和评估中说明。

### 4.4 Review Session Lifecycle

复习会话页面状态与卡片状态分离。

| 状态 | 含义 |
| --- | --- |
| `intro` | 会话准备页 |
| `studying` | 正在学习 |
| `complete` | 会话完成 |

---

## 5. 页面与模块职责

### 5.1 CardStudioPage

`CardStudioPage` 的当前定义是候选卡片生成与审核工作台。

它负责：

- 选择就绪文档
- 启动候选卡片生成
- 查看候选批次、检查点和事件流
- 接受、拒绝、批量处理候选卡片
- 编辑候选卡片内容
- 触发最终入库

它不再被定义为“正式卡片列表页”或“正式卡片 CRUD 中心”。

### 5.2 CardEditorModal

`CardEditorModal` 是编辑能力载体，而不是系统唯一入口。

它可用于：

- 编辑候选卡片
- 编辑正式卡片
- 处理 front/back/tags/cardType/media 等字段

当前实现支持的编辑场景以实际接入点为准；是否从某个页面打开，不改变其组件职责定义。

### 5.3 ReviewPage

`ReviewPage` 负责正式卡片学习会话。

它负责：

- 读取到期卡片
- 按卡片类型路由渲染
- 翻面与评分交互
- 写回调度结果
- 写入复习日志

### 5.4 相关支撑模块

- `src/components/cards/CardContentRenderer.tsx`：Markdown + KaTeX 基础渲染层
- `src/components/cards/ClozeCardContent.tsx`：cloze 渲染与揭示
- `src/components/cards/ChoiceCardContent.tsx`：choice 渲染与反馈
- `src/components/cards/ImageOcclusionCardContent.tsx`：image occlusion 渲染
- `src/services/learning/index.ts`：FSRS 调度逻辑
- `src/store/learning.ts`：复习会话局部状态

### 5.5 当前 UI 契约提示

E2E 与页面识别依赖稳定的 `data-testid`。当前评估脚本与 UI 契约存在漂移，因此页面级 `data-testid` 需要被视为开发规范的一部分，后续变更必须同步更新评估脚本和评估框架。

---

## 6. 端到端数据流

### 6.1 候选生成与审核链路

```text
ready document
  -> CardStudioPage 发起生成
    -> workflow_run / checkpoints / events
      -> card_candidates 落库
        -> 用户审核、编辑、接受、拒绝
          -> finalize
            -> accepted candidates 物化为 cards
```

### 6.2 正式卡片复习链路

```text
ReviewPage
  -> list due cards
    -> load queue
      -> render by cardType
        -> flip
          -> rate again/hard/good/easy
            -> scheduleCard()
              -> update cards state / next_review / difficulty / stability
              -> create review_logs
```

### 6.3 手动编辑链路

手动编辑是一个横切能力，而不是主线入口。

```text
candidate or card
  -> CardEditorModal
    -> validate front/back/type/tags/media
      -> gateway
        -> command
          -> repository
            -> SQLite persistence
```

---

## 7. 类型与内容规格

当前规范保留以下卡片类型：

- `qa`
- `cloze`
- `fact`
- `choice`
- `image_occlusion`

### 7.1 `qa`

- 存储格式：`front` 与 `back` 为 Markdown 文本
- 渲染要求：正反面都通过 `CardContentRenderer`
- 复习行为：翻面后显示 `back`
- 降级策略：若内容异常，仍按普通 Markdown 文本展示

### 7.2 `cloze`

- 存储格式：`front` 含 `{{cN::answer::hint}}` 语法；`back` 可为空解释或补充说明
- 渲染要求：支持按编号揭示与 review reveal-all
- 复习行为：翻面后所有 cloze 一次性揭示
- 降级策略：解析失败时按普通 Markdown 文本展示

### 7.3 `fact`

- 存储格式：陈述式 Markdown 内容
- 渲染要求：渲染层与 `qa` 相同
- 复习行为：与 `qa` 一致
- 降级策略：按普通 Markdown 文本展示

### 7.4 `choice`

- 存储格式：`front` 使用 `?>` + `- [x]` 语法；`back` 可作为解析说明
- 渲染要求：支持题目、选项、正确项高亮和即时反馈
- 复习行为：翻面后直接显示正确选项；若 `back` 非空，作为解析展示
- 降级策略：语法不合法时降级为普通 Markdown 渲染

### 7.5 `image_occlusion`

- 存储格式：`front` 为 JSON 载荷，至少包含图像和遮挡区域；`back` 可为解释说明
- 渲染要求：支持图像、遮挡区域与揭示态
- 复习行为：翻面后显示遮挡答案与补充说明
- 降级策略：JSON 非法或图像不可用时，回退为原始文本显示并暴露错误上下文

### 7.6 扩展要求

新增卡片类型时，必须同步修改：

- TypeScript 业务类型
- Zod schema
- 专用渲染组件或明确复用策略
- ReviewPage 路由分支
- 编辑器可选项
- AI 生成契约
- 评估矩阵对应条目

---

## 8. 存储与 IPC 契约

### 8.1 核心表

本文档关注以下卡片系统相关表：

- `cards`
- `card_candidates`
- `review_logs`
- `card_media`
- `workflow_runs`
- `workflow_checkpoints`
- `workflow_events`

### 8.2 `cards` 契约

`cards` 是正式卡片表。当前关键字段包括：

- `id`
- `title`
- `card_type`
- `front`
- `back`
- `tags`
- `difficulty`
- `stability`
- `retrievability`
- `state`
- `next_review`
- `export_guid`
- `created_at`
- `updated_at`

`card_type` 当前为普通 `TEXT`，不使用数据库层 `CHECK` 约束。这一设计用于降低新增卡片类型的迁移成本，但并不意味着前端、Zod、Rust DTO 或评估可以跳过同步更新。

### 8.3 IPC 原则

- Rust 与 TypeScript 之间的边界必须经过 schema 校验。
- Rust DTO 与 Zod schema 必须显式对齐。
- 新增字段、枚举值、可空性变化时，必须同步更新：
  - Rust DTO
  - gateway
  - Zod schema
  - 评估脚本与评估矩阵

### 8.4 FSRS 原则

FSRS 调度以正式卡片为对象，至少更新以下字段：

- `difficulty`
- `stability`
- `retrievability`
- `state`
- `next_review`

并写入 `review_logs`。

---

## 9. 已实现能力

本章将能力分为“已实现但未自动验证”和“已实现且已验证”。只有当前有脚本、测试或检查证据支撑的能力，才允许写入“已验证”。

### 9.1 已实现且已验证

依据 2026-04-23 当前 `eval-report.json`，以下能力已有自动化证据支持：

- TypeScript 卡片系统检查通过
- Rust `cargo check` 通过
- `CardEditorModal` 的基础编辑行为有单元测试
- `CardContentRenderer`、`ClozeCardContent`、`ChoiceCardContent`、`ImageOcclusionCardContent` 有针对性单元测试
- `ReviewPage` 的基础会话行为有单元测试
- `choice` 类型已进入 TypeScript/Zod/AI 生成契约
- `image_occlusion` 类型已进入前端类型和组件层
- 媒体相关 gateway 与命令在结构检查中存在

### 9.2 已实现但当前未通过完整自动验收

以下能力在代码中已有实现痕迹，但当前自动化门禁未通过或未形成稳定验收闭环：

- `CardStudioPage` 候选工作台的完整 E2E 契约
- 卡片系统总评估门禁
- Playwright 卡片系统 happy-path
- Rust 全量测试中的卡片相关稳定性
- 结构检查与当前页面职责的一致性

---

## 10. 未完成项与风险

以下为当前真实缺口，集中记录，不允许与“已实现能力”章节冲突。

### 10.1 当前基线问题

1. `CardStudioPage` 当前实现与旧文档叙事不一致，旧文档曾将其描述为正式卡片列表页。
2. `check-structure.mjs` 仍按旧编辑流检查 `CardStudioPage`，与当前候选工作台职责不一致。
3. `check-structure.mjs` 对 `tests/unit/card-studio-page.test.tsx` 仍依赖旧用例标题字符串，造成误报。
4. `cargo test` 当前失败：
   - 用例：`db::card_repo::tests::highlight_crud_roundtrip`
   - 原因：`highlights` 表缺少 `note` 列
5. Playwright 当前 4 条卡片系统场景全部失败，主要原因是测试契约与现有 UI 不匹配。
6. 当前评估框架中的部分历史“通过/全清”表述已经不再代表当前真相。

### 10.2 当前门禁结论

以 2026-04-23 的最新评估报告为准：

- `phase0to5Average = 9.4`
- `deliveryGatePassed = false`

当前阻塞门禁的核心因素包括：

- 结构检查失败
- `cargo test` 失败
- Playwright E2E 失败

### 10.3 观察项

以下问题当前不必等同于门禁失败，但需要持续观察：

- `cargo check` 中的 pre-existing warnings
- KaTeX 对 cloze 遮挡符号的警告输出
- 页面 testid 约定不稳定引起的测试脆弱性

---

## 11. Phase 模型与扩展变更规则

P0-P5 仅作为开发切片，不再作为历史成就清单。

### 11.1 Phase 定义

| Phase | 标题 | 目标 |
| --- | --- | --- |
| P0 | 输入就绪与候选生成前置条件 | 文档达到可生成候选的状态 |
| P1 | 候选生成与工作流恢复 | 生成候选、记录事件、支持恢复 |
| P2 | 候选审核与人工确认 | 审核、编辑、接受、拒绝、最终确认 |
| P3 | 正式卡片模型、落库与编辑 | 正式卡片结构、落库、编辑契约 |
| P4 | 复习渲染与 FSRS 调度 | ReviewPage、内容渲染、调度写回 |
| P5 | 媒体、导入导出与增强能力 | card media、APKG、导出等增强功能 |

每个 phase 的后续细化必须包含：

- 目标
- 入口条件
- 出口条件
- 涉及模块
- 当前状态
- 验收证据

P6-P9 不再作为卡片系统核心 phase，若需保留，只能在路线图或相关扩展章节中出现。

### 11.2 变更同步规则

出现以下变化时，必须同步修订本文档和评估框架：

- 新增或删除卡片类型
- 页面职责变化
- 页面重命名或 testid 变化
- 候选状态或正式卡片状态变化
- 数据库 schema 变化
- Rust DTO / Zod schema 变化
- 评估脚本门禁策略变化

### 11.3 开发驱动规则

后续开发若无法从本文档直接回答以下问题，则视为规范不完整，需要先修订文档再继续开发：

- 这个改动属于哪条主线或哪个 phase
- 影响的是候选链路还是正式卡片链路
- 需要改哪些契约
- 需要更新哪些评估项
- 什么证据才算完成

