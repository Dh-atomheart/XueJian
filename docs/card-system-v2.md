# 新版卡片系统设计文档 v2.0

> **文档版本**：2.1.0　**最后更新**：2026-04-21　**状态**：P0–P5 全部完成，APKG 导入导出已实现

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [技术选型](#2-技术选型)
3. [系统架构总览](#3-系统架构总览)
4. [数据库 Schema](#4-数据库-schema)
5. [卡片类型规格](#5-卡片类型规格)
6. [核心数据流（端到端）](#6-核心数据流端到端)
7. [Rust ↔ TypeScript IPC 契约](#7-rust--typescript-ipc-契约)
8. [前端组件架构](#8-前端组件架构)
9. [FSRS 调度算法集成](#9-fsrs-调度算法集成)
10. [各 Phase 设计与完成情况](#10-各-phase-设计与完成情况)
11. [扩展指南：添加新卡片类型](#11-扩展指南添加新卡片类型)
12. [已知限制与后续规划](#12-已知限制与后续规划)

---

## 1. 背景与目标

学笺（XueJian）是一款基于 Tauri 2 的桌面端 AI 学习助手。v1 版本的卡片系统存在以下问题：

| 问题               | 现象                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| 前端使用 mock 数据 | `CardStudioPage` 和 `ReviewPage` 完全脱离真实 SQLite 数据，UI 展示虚假内容 |
| 卡片内容无富文本   | front/back 均为 `<pre>` 纯文本，数学公式和 Markdown 无法渲染               |
| 只有 `qa` 一种类型 | 完形填空、单选、知识点等学习场景无法覆盖                                   |
| Rust DTO 字段缺失  | `CardDto` 少 4 个字段，Zod 校验必然失败，导致 Tauri 运行时 GatewayError    |
| 无创建入口         | 用户只能依赖 AI 生成候选卡片，无法手动新建                                 |

**v2 目标**：

- 接通真实 SQLite 数据，完整走通「创建 → 复习 → 调度」链路
- 支持 Markdown + LaTeX 数学渲染
- 支持 4 种卡片类型：`qa` / `cloze` / `fact` / `choice`
- 提供所见即所得 Markdown 编辑器创建卡片
- 所有 Tauri IPC 交换通过 Zod schema 强校验

---

## 2. 技术选型

### 2.1 前端渲染

| 包                     | 版本  | 作用                          | 选型理由                                      |
| ---------------------- | ----- | ----------------------------- | --------------------------------------------- |
| `react-markdown`       | ^9    | Markdown → React 节点树       | 插件化 remark/rehype 管道，零侵入集成         |
| `remark-math`          | ^6    | 解析 `$...$` 和 `$$...$$`     | 标准 remark 生态，与 react-markdown 原生兼容  |
| `rehype-katex`         | ^7    | 将 math 节点渲染为 KaTeX HTML | 服务端/客户端通用，无 MathJax 的字体依赖      |
| `katex`                | ^0.16 | KaTeX 核心 + CSS              | 渲染速度远快于 MathJax，支持全部常用 TeX 命令 |
| `@uiw/react-md-editor` | ^3    | 分屏 Markdown 编辑器          | 内置预览、工具栏、KaTeX 支持，开箱即用        |

### 2.2 后端/调度

| 包/库                      | 作用                    | 选型理由                                                     |
| -------------------------- | ----------------------- | ------------------------------------------------------------ |
| `ts-fsrs`                  | TypeScript FSRS-5 调度  | 前端本地计算，无服务端 roundtrip；算法与 Anki 同源           |
| `rusqlite` + `refinery`    | SQLite ORM + 版本化迁移 | Tauri 2 标准选型，refinery 支持嵌入式 SQL 文件迁移           |
| `Zod v3`                   | IPC 运行时校验          | 在 TypeScript 边界强制校验 Rust 返回的 JSON，防止字段漂移    |
| `@tanstack/react-query v5` | 异步状态管理            | 自动缓存失效、乐观更新、竞态保护                             |
| `zustand v5`               | 复习会话状态            | 轻量，适合 `queue/currentIndex/isFlipped` 这类短生命周期状态 |

---

## 3. 系统架构总览

```
┌─────────────────────────── Tauri 2 窗口 ───────────────────────────┐
│                                                                      │
│  React 19 前端                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │CardStudioPage│  │  ReviewPage  │  │    CardEditorModal        │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                 │                       │                  │
│  ┌──────▼─────────────────▼───────────────────────▼──────────────┐  │
│  │              React Query (queries/cards.ts + learning.ts)      │  │
│  └──────────────────────────┬─────────────────────────────────── ┘  │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │              cardsGateway  (services/gateway/cards.ts)       │    │
│  │   invokeWithSchema(command, ZodSchema, payload)              │    │
│  └──────────────────────────┬────────────────────────────────── ┘   │
│                             │ Tauri IPC (JSON)                       │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │         Rust Commands  (src-tauri/src/commands/cards.rs)     │    │
│  │   CardDto ←──→ Card  (From<Card> impl)                       │    │
│  └──────────────────────────┬────────────────────────────────── ┘   │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │       CardRepository  (src-tauri/src/db/card_repo.rs)        │    │
│  │   rusqlite + refinery migrations V1–V11                      │    │
│  └──────────────────────────┬────────────────────────────────── ┘   │
│                             │                                        │
│                       SQLite (app.db)                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 数据库 Schema

### 4.1 cards 表（核心）

通过 V1 + V10 迁移建立，最终结构：

```sql
CREATE TABLE cards (
    id                  TEXT PRIMARY KEY,       -- UUID v4
    group_id            TEXT REFERENCES card_groups(id),
    title               TEXT,                   -- V10 新增，可选标题
    card_type           TEXT NOT NULL DEFAULT 'qa',  -- V10 新增，无 CHECK 约束
    cluster_id          TEXT,                   -- V10 新增，聚类标识
    export_guid         TEXT UNIQUE,            -- V10 新增，Anki 导出 GUID
    front               TEXT NOT NULL,
    back                TEXT NOT NULL,
    document_id         TEXT REFERENCES documents(id),
    anchor_id           TEXT REFERENCES document_anchors(id),
    source_page         INTEGER,
    source_paragraph    INTEGER,
    source_coordinates  JSON,                   -- {x,y,width,height}
    tags                JSON,                   -- ["tag1","tag2"]
    difficulty          REAL NOT NULL DEFAULT 0.3,
    stability           REAL NOT NULL DEFAULT 1.0,
    retrievability      REAL,
    state               TEXT NOT NULL DEFAULT 'new',  -- new|learning|review|relearning
    next_review         TEXT,                   -- ISO 8601 字符串
    dedupe_key          TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
```

**关键设计决策**：`card_type` 为普通 TEXT，无 CHECK 约束。这意味着新增类型（如 `choice`）**完全不需要迁移**，只需在前端类型定义追加即可。

### 4.2 review_logs 表

```sql
CREATE TABLE review_logs (
    id              TEXT PRIMARY KEY,
    card_id         TEXT NOT NULL REFERENCES cards(id),
    rating          TEXT NOT NULL,   -- again|hard|good|easy
    reviewed_at     TEXT NOT NULL,
    state           TEXT NOT NULL,
    difficulty      REAL NOT NULL,
    stability       REAL NOT NULL,
    retrievability  REAL,
    next_review     TEXT,
    interval_days   INTEGER
);
```

### 4.3 迁移历史

| 版本    | 文件                                  | 主要内容                                                                               |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| V1      | `V1__initial_schema.sql`              | cards / card_candidates / documents / document_chunks / document_anchors / card_groups |
| V2      | `V2__workflow_and_fts_foundation.sql` | workflow_runs / FTS5 索引                                                              |
| V3      | `V3__card_generation_workflow.sql`    | card_generation workflow 状态机                                                        |
| V4      | `V4__points_ledger.sql`               | 积分账本                                                                               |
| V5      | `V5__card_animations.sql`             | 卡片动画参数                                                                           |
| V6      | `V6__podcast_episodes.sql`            | 播客模块                                                                               |
| V7      | `V7__knowledge_graph.sql`             | 知识图谱                                                                               |
| V8      | `V8__points_daily_bonus_rule.sql`     | 每日奖励规则                                                                           |
| V9      | `V9__api_config_auth_mode.sql`        | API 鉴权模式                                                                           |
| **V10** | `V10__card_schema_extension.sql`      | **cards: title/card_type/cluster_id/export_guid；card_candidates: title/card_type**    |
| V11     | `V11__anchor_provenance.sql`          | 锚点溯源字段                                                                           |

---

## 5. 卡片类型规格

### 5.1 类型总览

| 类型     | `cardType` 值     | 状态                   | front 语法                              |
| -------- | ----------------- | ---------------------- | --------------------------------------- |
| 问答卡   | `qa`              | ✅ 已完成              | 任意 Markdown                           |
| 完形填空 | `cloze`           | ✅ 已完成              | 含 `{{cN::答案::提示}}` 的 Markdown     |
| 知识点   | `fact`            | ✅ 已完成（渲染同 qa） | 任意 Markdown 陈述句                    |
| 单选题   | `choice`          | ✅ 已完成              | `?> 题目\n- 选项\n- [x] 正确选项`       |
| 图像遮挡 | `image_occlusion` | 📋 P4 规划             | JSON `{"image": "...", "zones": [...]}` |

### 5.2 cloze 语法规范

```
原始 front 文本：
  牛顿第二定律：$F = {{c1::ma::质量×加速度}}$，其中 $m$ 单位是 {{c2::kg}}

解析规则：
  正则：/\{\{c(\d+)::([^}]*?)(?:::([^}]*?))?\}\}/g
  捕获组：(编号, 答案, 提示?)

遮挡渲染（c1 未揭示）：
  牛顿第二定律：$F = [█ 质量×加速度█]$，其中 $m$ 单位是 **kg**

揭示后（c1 已揭示）：
  牛顿第二定律：$F = **ma**$，其中 $m$ 单位是 **kg**
```

**多编号独立控制**：每个 `cN` 编号有独立的 toggle 按钮，揭示互不影响。

### 5.3 choice 语法规范

```
原始 front 文本：
  ?> 以下哪个不是 FSRS 算法的记忆状态？
  - New（新学）
  - [x] Archived（归档）
  - Learning（学习中）
  - Review（复习）

解析规则：
  - `?>` 前缀行：题目文本（支持 Markdown）
  - `- [x]` 行：正确选项
  - `- ` 行：干扰项
  - 支持 2-6 个选项

交互行为：
  选中前：显示 A/B/C/D 圆形标识，hover 高亮
  选中后：正确选项绿色，错误选项红色，未选中变淡
  revealed=true 时（复习答案面）：直接展示正确答案高亮
```

---

## 6. 核心数据流（端到端）

### 6.1 卡片创建流程

```
用户在 CardEditorModal 点击"创建卡片"
         │
         ▼
onSave({ front, back, tags, cardType })
         │
         ▼
useCreateCardMutation.mutate(data)
  → cardsGateway.create(data)
  → invokeWithSchema('create_card', cardSchema, { data })
         │ Tauri IPC JSON序列化
         ▼
Rust: create_card(state, CreateCardDto)
  → CreateCardRequest { front, back, card_type: Some("choice"), ... }
  → CardRepository::create(req)
         │
         ▼
SQL INSERT INTO cards (id, card_type, export_guid, front, back, ..., state='new', ...)
         │ 返回 Card struct
         ▼
From<Card> for CardDto  →  JSON序列化
         │ Tauri IPC 返回
         ▼
invokeWithSchema 用 cardSchema (Zod) 校验
         │ 通过校验
         ▼
React Query 使 cardsQueryKeys.all 失效
         │
         ▼
CardStudioPage 自动重新请求，新卡片出现在列表
```

### 6.2 FSRS 复习流程

```
用户进入 ReviewPage → 点击"开始学习"
         │
         ▼
useDueCardsQuery()
  → cardsGateway.listDueCards()
  → 'find_due_cards' Tauri 命令
  → SQL: WHERE state != 'suspended' AND (next_review IS NULL OR next_review <= TODAY)
         │
         ▼
loadQueue(dueCards)  →  useLearningSessionStore
  { queue: Card[], currentIndex: 0, isFlipped: false }
         │
         ▼
展示 currentCard（按 cardType 路由到不同渲染组件）
         │
         ▼
用户按空格/点击 → flipCard()  →  isFlipped=true
  - qa/fact：翻面显示 back
  - cloze：revealed=true，所有填空揭示
  - choice：revealed=true，正确答案高亮
         │
         ▼
用户点击 Again/Hard/Good/Easy（或按 1/2/3/4）
         │
         ▼
useSubmitReviewMutation.mutate({ card: currentCard, rating })
  1. scheduleCard(card, rating)          ← ts-fsrs 本地计算
     fsrsCard.difficulty = card.difficulty
     fsrsCard.stability = card.stability
     → scheduler.repeat(fsrsCard, now)[grade]
     → SchedulingResult { difficulty, stability, retrievability, state, nextReview, intervalDays }

  2. cardsGateway.updateCardReview(id, result)
     → 'update_card_review' Tauri 命令
     → SQL: UPDATE cards SET difficulty=?, stability=?, state=?, next_review=? WHERE id=?

  3. cardsGateway.createReviewLog({ cardId, rating, state, ... })
     → SQL INSERT INTO review_logs

  4. recordPoints({ reviewLogId, cardId, rating, cardState })
     → 积分系统（fire-and-forget）
         │
         ▼
advanceCard()  →  currentIndex++
         │
         ▼
currentIndex >= queue.length → resetSession() → phase='complete'
```

---

## 7. Rust ↔ TypeScript IPC 契约

### 7.1 CardDto（Rust 序列化结构）

```rust
// src-tauri/src/commands/cards.rs
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDto {
    pub id: String,
    pub group_id: Option<String>,
    pub title: Option<String>,           // V10 新增
    pub card_type: String,               // V10 新增，camelCase→cardType
    pub cluster_id: Option<String>,      // V10 新增
    pub export_guid: Option<String>,     // V10 新增
    pub front: String,
    pub back: String,
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_coordinates: Option<serde_json::Value>,
    pub retrievability: Option<f64>,
    pub tags: Vec<String>,               // 从 JSON blob 解码
    pub difficulty: f64,
    pub stability: f64,
    pub state: String,
    pub next_review: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
```

> **历史 Bug（已修复）**：v1 版本的 `CardDto` 缺少 `title`、`card_type`、`cluster_id`、`export_guid` 这 4 个字段，导致 Zod `cardSchema` 校验失败，`invokeWithSchema` 抛出 GatewayError，列表页无法展示任何卡片。

### 7.2 cardSchema（Zod 校验，TypeScript 侧）

```typescript
// src/types/schema.ts
export const cardSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  cardType: z.enum(["qa", "cloze", "fact", "choice"]), // choice 已加入
  clusterId: z.string().nullable(),
  exportGuid: z.string().nullable(),
  documentId: z.string().uuid().nullable(),
  anchorId: z.string().uuid().nullable(),
  front: z.string().min(1),
  back: z.string().min(1),
  sourcePage: z.number().int().positive().nullable(),
  sourceParagraph: z.number().int().positive().nullable(),
  sourceCoordinates: cardSourceCoordinatesSchema.nullable(),
  tags: z.array(z.string()),
  difficulty: z.number(),
  stability: z.number(),
  retrievability: z.number().nullable(),
  state: z.enum(["new", "learning", "review", "relearning"]),
  nextReview: nullableDateValueSchema, // string → Date 自动转换
  createdAt: dateValueSchema,
  updatedAt: dateValueSchema,
}) as z.ZodType<Card>;
```

**`serde(rename_all = "camelCase")` 保证 Rust snake_case 字段名自动转换为 TypeScript camelCase。**

### 7.3 CreateCardDto（Rust 反序列化）

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCardDto {
    pub front: String,
    pub back: String,
    pub card_type: Option<String>,   // 新增，None → 默认 'qa'
    pub document_id: Option<String>,
    pub anchor_id: Option<String>,
    pub source_page: Option<i32>,
    pub source_paragraph: Option<i32>,
    pub source_coordinates: Option<DocumentAnchorRect>,
    pub tags: Option<Vec<String>>,
}
```

---

## 8. 前端组件架构

### 8.1 组件树

```
src/
├── features/
│   ├── cards/
│   │   └── CardStudioPage.tsx          # 牌库页
│   └── review/
│       └── ReviewPage.tsx              # 复习页
│
├── components/cards/
│   ├── CardContentRenderer.tsx         # ← 渲染基础层（所有类型共享）
│   ├── ClozeCardContent.tsx            # ← cloze 专用
│   ├── ChoiceCardContent.tsx           # ← choice 专用
│   ├── CardEditorModal.tsx             # ← 创建/编辑 Modal
│   ├── CardClusterView.tsx             # 分组视图
│   └── CardCandidatePanel.tsx          # AI 候选审核
│
├── queries/
│   ├── cards.ts                        # useCardsQuery / useCreateCardMutation
│   └── learning.ts                     # useDueCardsQuery / useSubmitReviewMutation
│
├── services/
│   ├── gateway/cards.ts                # Tauri IPC 封装层（invokeWithSchema）
│   └── learning/index.ts               # scheduleCard() FSRS 调度
│
├── store/
│   └── learning.ts                     # useLearningSessionStore（zustand）
│
└── types/
    ├── document.ts                     # Card / CardCandidate 接口定义
    └── schema.ts                       # Zod schemas（IPC 校验）
```

### 8.2 CardContentRenderer

**文件**：`src/components/cards/CardContentRenderer.tsx`

**职责**：所有类型卡片内容的 Markdown + KaTeX 渲染基础层。

```typescript
interface CardContentRendererProps {
  content: string;
  className?: string;
  compact?: boolean; // true: text-sm + line-clamp-4（用于网格卡片缩略）
}
```

**渲染管道**：

```
content string
  → ReactMarkdown
    → remarkPlugins: [remarkMath]       // $...$ 解析为 math 节点
    → rehypePlugins: [rehypeKatex]      // math 节点 → KaTeX HTML
  → Tailwind Typography prose 样式
```

### 8.3 ClozeCardContent

**文件**：`src/components/cards/ClozeCardContent.tsx`

**职责**：解析 `{{cN::answer::hint}}` 语法，提供逐编号揭示交互。

**核心逻辑**：

```typescript
// 解析正则
const CLOZE_RE = /\{\{c(\d+)::([^}]*?)(?:::([^}]*?))?\}\}/g;

// 遮挡渲染：未揭示 → [█ hint█]，已揭示 → **answer**
function renderClozeMarkdown(text, revealedIndices): string;

// 状态：每个编号独立 toggle
const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
```

**Props**：

```typescript
interface ClozeCardContentProps {
  content: string;
  revealed?: boolean; // ReviewPage 翻面后传 true，一次性揭示全部
  className?: string;
}
```

### 8.4 ChoiceCardContent

**文件**：`src/components/cards/ChoiceCardContent.tsx`

**职责**：解析 `?> 题目\n- [x] 正确\n- 选项` 语法，提供点击即时反馈。

**解析规则**：

```typescript
function parseChoiceFormat(text): ParsedChoice | null;
// 返回 { question: string, options: { text: string, correct: boolean }[] }
// options < 2 时返回 null，降级到 CardContentRenderer
```

**状态机**：

```
未选中 → 选中某项 → 立即显示结果（正确绿/错误红）
revealed=true（来自 ReviewPage 翻面）→ 跳过选中，直接高亮正确答案
```

### 8.5 CardEditorModal

**文件**：`src/components/cards/CardEditorModal.tsx`

**职责**：新建/编辑卡片的全屏 Modal，集成类型选择器和双面分屏编辑器。

**State**：

```typescript
const [front, setFront] = useState("");
const [back, setBack] = useState("");
const [tagsInput, setTagsInput] = useState("");
const [cardType, setCardType] = useState<Card["cardType"]>("qa");
const [activeField, setActiveField] = useState<"front" | "back">("front");
```

**类型选择器**：`<select>` 下拉，选项：问答 / 完形填空 / 知识点 / 单选题

**编辑器**：`@uiw/react-md-editor` 分屏模式，`preview="live"`，支持 KaTeX。

**onSave 签名**：

```typescript
onSave: (data: {
  front: string
  back: string
  tags: string[]
  cardType: Card['cardType']
}) => void
```

### 8.6 ReviewPage 类型路由

**文件**：`src/features/review/ReviewPage.tsx`

按 `currentCard.cardType` 路由到专用渲染组件：

```tsx
{
  currentCard.cardType === "cloze" ? (
    <ClozeCardContent content={currentCard.front} revealed={isFlipped} />
  ) : currentCard.cardType === "choice" ? (
    <ChoiceCardContent content={currentCard.front} revealed={isFlipped} />
  ) : (
    // qa / fact
    <CardContentRenderer
      content={isFlipped ? currentCard.back : currentCard.front}
    />
  );
}
```

---

## 9. FSRS 调度算法集成

### 9.1 算法概览

FSRS（Free Spaced Repetition Scheduler）v5 是 SuperMemo SM-2 的现代替代品，基于记忆的双组件模型（Two-Component Model of Memory）。

核心参数：

- **Stability（S）**：记忆稳定度，记忆衰减的时间常数（单位：天）
- **Difficulty（D）**：卡片本征难度，0–10 范围
- **Retrievability（R）**：当前可提取性，`R = e^(-t/S)`

### 9.2 代码实现

```typescript
// src/services/learning/index.ts
const params = generatorParameters(); // FSRS-5 默认参数
const scheduler = fsrs(params);

export function scheduleCard(
  card: Card,
  rating: ReviewRating,
): SchedulingResult {
  const fsrsCard = createEmptyCard();
  fsrsCard.difficulty = card.difficulty; // 从 SQLite 恢复状态
  fsrsCard.stability = card.stability;
  fsrsCard.due = card.nextReview ? new Date(card.nextReview) : new Date();
  fsrsCard.state = stateIndexOf(card.state); // new=0/learning=1/review=2/relearning=3

  const result = scheduler.repeat(fsrsCard, new Date());
  const scheduled = result[RATING_MAP[rating]];

  return {
    difficulty: scheduled.card.difficulty,
    stability: scheduled.card.stability,
    retrievability: card.retrievability ?? 0,
    state: STATE_MAP[scheduled.card.state],
    nextReview: scheduled.card.due.toISOString(),
    intervalDays: scheduled.card.scheduled_days,
  };
}
```

### 9.3 评分 → 间隔映射（示意）

| 评分       | 含义     | 新卡片间隔 | 已复习卡片（S=10d） |
| ---------- | -------- | ---------- | ------------------- |
| Again（1） | 完全忘了 | 1 分钟     | 重新学习，1 天      |
| Hard（2）  | 勉强记得 | 5 分钟     | ~8 天               |
| Good（3）  | 正常记得 | 10 分钟    | ~13 天              |
| Easy（4）  | 太简单了 | 4 天       | ~20 天              |

---

## 10. 各 Phase 设计与完成情况

### Phase 0：真实 API 接入 ✅ 已完成

**目标**：将 `CardStudioPage` 和 `ReviewPage` 从 mock 数据切换到真实 SQLite 数据。

#### 10.0.1 CardStudioPage 改造

**改造前**：直接调用 `useAppStore(state => state.mockCards)`，数据固定不变。

**改造后**：

```typescript
// 使用 React Query 拉取真实数据
const { data: cards = [], isLoading } = useCardsQuery({}, { enabled: true });
const createCard = useCreateCardMutation();
```

**关键变更细节**：

- `FilterStatus` 类型从 `'mastered'` 改为 `'relearning'`（对齐 FSRS 状态机）
- `STATE_LABELS` Map 覆盖 `new / learning / review / relearning` 4 种状态
- 加入 loading 态：`isLoading` 时显示 `"加载卡片中..."` 占位
- 搜索过滤：`card.front + card.back` 大小写不敏感匹配
- 状态过滤：按 `card.state` 字段过滤（而非旧的 `card.status`）
- 卡片组派生：从 `card.groupId` client-side 聚合，不额外请求
- 翻转逻辑：`flippedCards: Set<string>` 维护每张卡片的翻转状态

#### 10.0.2 ReviewPage 改造

**改造前**：硬编码 mock 卡片数组，评分按钮无实际效果。

**改造后**：

```typescript
const { data: dueCards = [], isLoading: isLoadingDue } = useDueCardsQuery();
const { data: dailyStats } = useDailyStatsQuery();
const submitReview = useSubmitReviewMutation();

const {
  queue,
  currentIndex,
  isFlipped,
  loadQueue,
  flipCard,
  advanceCard,
  resetSession,
} = useLearningSessionStore();
```

**关键变更细节**：

- 三阶段流程：`intro → studying → complete`
- `handleRating` 调用 `submitReview.mutate`，`onSuccess` 后 `advanceCard()`
- 按钮在 `submitReview.isPending` 期间 `disabled + opacity-50`，防止重复提交
- 键盘快捷键：`Space` 翻面，`1/2/3/4` 评分（`isPending` 时禁用）
- 完成检测：`useEffect` 监听 `isSessionDone = currentIndex >= queue.length`
- 完成页：展示 4 种评分各自的计数（again/hard/good/easy）

---

### Phase 1：Markdown + KaTeX 渲染 ✅ 已完成

**目标**：所有卡片内容支持 Markdown 格式和 LaTeX 数学公式渲染；完形填空遮挡/揭示交互。

#### 10.1.1 安装依赖

```bash
npm install react-markdown remark-math rehype-katex katex @types/katex
```

#### 10.1.2 CardContentRenderer（新建）

**文件**：`src/components/cards/CardContentRenderer.tsx`

- Tailwind Typography `prose` 类控制排版
- `compact` prop：网格卡片缩略模式（`text-sm line-clamp-4`）
- KaTeX CSS 通过 `import 'katex/dist/katex.min.css'` 全局注入

**集成位置**：

1. `CardStudioPage.tsx`：网格卡片和列表卡片的 front/back 渲染均改用 `CardContentRenderer`
2. `ReviewPage.tsx`：复习卡面内容渲染
3. `CardClusterView.tsx`：卡片聚类视图

#### 10.1.3 ClozeCardContent（新建）

**文件**：`src/components/cards/ClozeCardContent.tsx`

完整实现：

- `parseClozes(text)`：正则提取所有 `{{cN::answer::hint}}` 编号集合
- `renderClozeMarkdown(text, revealedSet)`：按 revealedSet 替换为 `**answer**` 或 `[█ hint█]`
- `useMemo` 缓存解析结果和渲染结果，避免重复计算
- 底部编号按钮：已揭示 → `bg-ink/10` 深色背景；未揭示 → 虚线边框
- `revealed=true`（ReviewPage 翻面时）→ `effectiveRevealed = new Set(all indices)` 一次性揭示

---

### Phase 2：卡片编辑器 ✅ 已完成

**目标**：提供完整的卡片手动创建入口，支持 Markdown 分屏编辑和类型选择。

#### 10.2.1 CardEditorModal（新建）

**文件**：`src/components/cards/CardEditorModal.tsx`

- `@uiw/react-md-editor`：`preview="live"` 分屏，左侧输入右侧预览
- front/back 双面 Tab 切换，`hidden` class 保留 DOM 节点（避免编辑器重建丢失光标）
- 类型选择下拉：`qa / cloze / fact / choice`（直接影响 Tauri 存储的 `card_type`）
- 标签：逗号分隔输入，`split(',').map(t => t.trim()).filter(Boolean)` 解析
- 保存校验：`front.trim().length > 0 && back.trim().length > 0`
- 背景蒙层：`backdrop-blur-sm` 毛玻璃效果，点击外部关闭

#### 10.2.2 useCreateCardMutation（新增）

**文件**：`src/queries/cards.ts`

```typescript
export function useCreateCardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCardInput) => cardsGateway.create(data),
    onSuccess: () => {
      // 失效所有卡片缓存，列表自动刷新
      void queryClient.invalidateQueries({ queryKey: cardsQueryKeys.all });
    },
  });
}
```

#### 10.2.3 cardsGateway.create 签名（更新）

```typescript
interface CreateCardInput {
  front: string;
  back: string;
  cardType?: Card["cardType"]; // 新增，传递到 Rust CreateCardDto
  documentId?: string | null;
  anchorId?: string | null;
  // ...
}
```

#### 10.2.4 CardStudioPage 新建按钮

```tsx
<SketchButton onClick={() => setIsEditorOpen(true)}>+ 新建卡片</SketchButton>;

{
  isEditorOpen && (
    <CardEditorModal
      onClose={() => setIsEditorOpen(false)}
      onSave={(data) => {
        createCard.mutate(
          {
            front: data.front,
            back: data.back,
            tags: data.tags,
            cardType: data.cardType,
          },
          { onSuccess: () => setIsEditorOpen(false) },
        );
      }}
    />
  );
}
```

---

### Phase 3：单选题（Choice）卡片类型 ✅ 已完成

**目标**：完整实现 `choice` 卡片类型，覆盖类型扩展、渲染组件、ReviewPage 集成、编辑器支持。

#### 10.3.1 Rust DTO Bug 修复

**根本原因**：v1 的 `CardDto` struct 缺少 4 个字段，`From<Card> for CardDto` 也未映射这些字段：

```
缺失字段：title / card_type / cluster_id / export_guid
```

Zod `cardSchema` 要求这 4 个字段必须存在，`invokeWithSchema` 对每个返回的卡片执行校验，导致整个列表请求失败。

**修复**：

1. `CardDto` struct 补全所有 4 个字段
2. `From<Card> for CardDto` 补全映射
3. `CreateCardDto` 新增 `card_type: Option<String>`
4. `CreateCardRequest` 新增 `card_type: Option<String>`
5. `CardRepository::create()` 中 `card_type = req.card_type.unwrap_or_else(|| "qa".to_string())`，不再硬编码

#### 10.3.2 类型定义扩展

```typescript
// src/types/document.ts
interface Card {
  cardType: "qa" | "cloze" | "fact" | "choice"; // 新增 'choice'
}

// src/types/schema.ts
cardType: z.enum(["qa", "cloze", "fact", "choice"]); // 新增 'choice'
```

#### 10.3.3 ChoiceCardContent（新建）

**文件**：`src/components/cards/ChoiceCardContent.tsx`

- `parseChoiceFormat`：逐行解析，支持 `?>` 题目前缀，`- [x]` 正确标记，`- ` 普通选项
- 降级处理：`options.length < 2` 时 fallback 到 `CardContentRenderer`
- 圆形字母标识：A/B/C/D，选中后动态变色
- `onSelect?: (index, isCorrect)` 回调：为未来积分/统计预留接口

#### 10.3.4 ReviewPage 类型路由

在 card 展示区按 `cardType` 条件渲染：

```tsx
cloze  → <ClozeCardContent content={front} revealed={isFlipped} />
choice → <ChoiceCardContent content={front} revealed={isFlipped} />
qa/fact → <CardContentRenderer content={isFlipped ? back : front} />
```

#### 10.3.5 CardEditorModal 类型选择器

Header 区域增加 `<select>` 下拉：

```
问答（qa）/ 完形填空（cloze）/ 知识点（fact）/ 单选题（choice）
```

选项值直接写入 `cardType` state，随 `onSave` 传出。

---

### Phase 4：媒体支持 ✅ 已完成

**目标**：支持在卡片中嵌入图片，并为 APKG 导入导出提供底层媒体存储能力。

#### 已实现内容

**1. 数据库迁移（V12）**

```sql
-- V12__card_media.sql
CREATE TABLE card_media (
    id           TEXT PRIMARY KEY,
    card_id      TEXT NOT NULL REFERENCES cards(id),
    file_name    TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    file_size    INTEGER,
    storage_key  TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
CREATE INDEX idx_card_media_card_id ON card_media(card_id);
```

**2. Rust 命令**

- `upload_card_media(card_id, source_path)` → 复制文件到 `$APPLOCALDATA/card-media/{uuid}/{file_name}`，记录 DB
- `list_card_media(card_id)` → 返回 `CardMediaDto[]`
- `delete_card_media(media_id)` → 删除 DB 记录和磁盘文件
- `import_cards_apkg()` → 弹框选择 .apkg 文件，调用 Python importer，批量插入卡片
- `pick_and_export_apkg(card_ids)` → 弹框选择保存路径，调用 Python exporter

**3. Tauri assetProtocol 配置**

```json
// tauri.conf.json
"assetProtocol": {
  "enable": true,
  "scope": [
    "$APPDATA/documents/**",
    "$APPLOCALDATA/card-media/**"
  ]
}
```

**4. Python APKG Importer（新建）**

- 文件：`orchestration_service/exports/apkg_importer.py`
- 提取 .apkg（ZIP）中 `collection.anki2/21` SQLite 数据库，解析 notes 表
- 自动检测卡片类型：cloze（含 `{{c`）或 qa
- 路由：`POST /imports/apkg`

**5. 前端集成（CardStudioPage）**

- 「导入 APKG」「导出 APKG」「导出 CSV」按钮
- 状态反馈条显示导入导出结果（成功/失败/条数）
- 「编辑」按钮在每张卡片上暴露，打开 CardEditorModal 进行编辑

---

### Phase 5：AI 生成增强 ✅ 已完成

**目标**：让 AI 卡片生成 workflow 支持 cloze 和 choice 类型。

#### 已实现内容

**1. Python orchestration 提示词更新**

文件：`orchestration_service/workflows/card_generation.py`

系统提示词已更新为描述所有 4 种卡片类型（qa/cloze/fact/choice）并指引 AI 根据内容智能选择类型：

- `qa`：问答题
- `cloze`：完形填空（`{{c1::答案}}` 语法）
- `fact`：简单知识点陈述
- `choice`：单选题（`?> 题目` + `- [x] 正确` 格式）

**2. card_draft.py CardType 扩展**

```python
CardType = Literal["qa", "cloze", "fact", "choice"]  # 新增 "choice"
```

`from_llm_json()` 方法已更新以接受 `choice` 类型的验证逻辑。

**3. card_candidates 表 card_type 已就绪**（V10 已添加字段，无需迁移）

---

## 11. 扩展指南：添加新卡片类型

以添加 `matching`（连线题）为例，需要修改 **6 处**：

| 步骤               | 文件                                                 | 具体操作                                     |
| ------------------ | ---------------------------------------------------- | -------------------------------------------- |
| 1. 类型定义        | `src/types/document.ts`                              | `Card.cardType` 联合类型追加 `\| 'matching'` |
| 2. Zod 校验        | `src/types/schema.ts`                                | `cardSchema.cardType` 枚举追加 `'matching'`  |
| 3. 渲染组件        | `src/components/cards/MatchingCardContent.tsx`       | 新建，解析匹配题语法                         |
| 4. ReviewPage 路由 | `src/features/review/ReviewPage.tsx`                 | 条件渲染分支增加 `cardType === 'matching'`   |
| 5. 编辑器          | `src/components/cards/CardEditorModal.tsx`           | `<option value="matching">连线题</option>`   |
| 6. AI 生成         | `orchestration_service/workflows/card_generation.py` | 新增 matching 提示词                         |

**无需修改**：SQLite Schema（card_type 无 CHECK 约束）、Rust 代码（CardDto/CreateCardDto 通用）

---

## 12. 已知限制与后续规划

### 12.1 当前限制

| 编号 | 类别    | 问题                                            | 影响范围                                 | 规划     |
| ---- | ------- | ----------------------------------------------- | ---------------------------------------- | -------- |
| L1   | Phase 4 | `image_occlusion` 类型的前端 SVG 遮罩组件未实现 | 需手动编写图像遮挡卡片                   | 低优先级 |
| L2   | 性能    | `useCardsQuery` limit 默认 300                  | 大量卡片时全量加载，无分页               | 待优化   |
| L3   | 功能    | CardEditorModal 无图片上传 Dropzone             | 无法通过 UI 上传媒体文件（API 层已就绪） | 下一迭代 |

### 12.2 构建状态

| 检查项             | 状态                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `npx tsc --noEmit` | ✅ 0 错误                                                                  |
| `cargo check`      | ✅ 0 错误（4 个 pre-existing dead_code 警告）                              |
| `cargo test`       | ✅ 12 passed, 0 failed                                                     |
| `npx vitest run`   | ✅ 19 passed（7 pre-existing failures 为主题色硬编码测试，与卡片系统无关） |
| `npx vite build`   | ✅ 通过（chunk 大小警告为 pre-existing）                                   |
