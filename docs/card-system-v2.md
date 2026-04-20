# 新版卡片系统设计文档 v2.0

## 1. 概述

学笺（XueJian）卡片系统是基于 **Tauri 2 + React 19 + SQLite + FSRS** 的间隔复习引擎核心模块。

**技术选型理由：**

- `react-markdown + rehype-katex`：原生支持 Markdown 与 LaTeX 数学公式，零侵入渲染
- `@uiw/react-md-editor`：分屏预览，开箱即用的 Markdown 编辑体验
- `ts-fsrs`：TypeScript 原生 FSRS-5 实现，前端即可做调度计算，无需额外 roundtrip
- `Zod v3`：在 Tauri IPC 边界做运行时类型校验，防止 Rust DTO 与前端类型漂移

---

## 2. 卡片类型

| 类型     | `cardType`        | front 格式                    | 特点                           |
| -------- | ----------------- | ----------------------------- | ------------------------------ |
| 问答     | `qa`              | Markdown 问题文本             | 最基本类型，手动输入或 AI 生成 |
| 完形填空 | `cloze`           | 含 `{{c1::答案}}` 的 Markdown | 按编号遮挡，逐一揭示           |
| 知识点   | `fact`            | Markdown 陈述句               | 单面卡，概念记忆               |
| 单选题   | `choice`          | `?> 题目\n- 选项\n- [x] 正确` | 即时反馈 UI，选后显示解析      |
| 图像遮挡 | `image_occlusion` | JSON `{image, zones[]}`       | 遮挡图像区域（Phase 4 规划中） |

---

## 3. 核心数据流

```
[用户/AI 生成]
     │
     ▼
cardsGateway.create(data)          ← Tauri IPC: create_card
     │ Zod 校验 CardSchema
     ▼
SQLite cards 表 (state='new')
     │
     ▼ 触发复习
useDueCardsQuery()                 ← next_review ≤ NOW
     │
     ▼
LearningSessionStore.loadQueue()
     │
     ▼ 用户评分 (Again/Hard/Good/Easy)
scheduleCard(card, rating)         ← ts-fsrs 本地计算
     │ → {difficulty, stability, nextReview, state}
     ▼
useSubmitReviewMutation()
     ├── cardsGateway.updateCardReview(id, fsrsResult)
     └── cardsGateway.createReviewLog(log)
```

---

## 4. 组件架构

```
src/
├── features/
│   ├── cards/CardStudioPage.tsx        # 牌库管理（筛选/搜索/新建）
│   └── review/ReviewPage.tsx           # FSRS 复习会话（三阶段流程）
│
├── components/cards/
│   ├── CardContentRenderer.tsx         # Markdown + KaTeX 渲染基础组件
│   ├── ClozeCardContent.tsx            # {{c1::}} 遮挡/揭示交互
│   ├── ChoiceCardContent.tsx           # ?> 单选题 + 即时反馈
│   ├── CardEditorModal.tsx             # 创建/编辑 Modal（分屏预览）
│   ├── CardClusterView.tsx             # 网格/分组/聚类视图
│   └── CardCandidatePanel.tsx          # AI 候选卡片审核面板
│
├── queries/
│   ├── cards.ts                        # useCardsQuery / useCreateCardMutation
│   └── learning.ts                     # useDueCardsQuery / useSubmitReviewMutation
│
└── services/
    ├── gateway/cards.ts                # Tauri IPC 封装
    └── learning/index.ts               # scheduleCard() FSRS 调度
```

---

## 5. 扩展指南：添加新卡片类型

以添加 `matching`（连线题）为例：

1. **TypeScript 类型**：在 `src/types/schema.ts` 的 `cardTypeSchema` 联合类型中追加 `'matching'`
2. **Rust DTO**：`card_type` 为 TEXT，SQLite 侧无需迁移
3. **渲染组件**：新建 `src/components/cards/MatchingCardContent.tsx`
4. **渲染路由**：在 `CardContentRenderer.tsx` 的 `switch(cardType)` 分支中注册
5. **AI 生成**：更新 `orchestration_service/workflows/card_generation.py` 提示词
6. **编辑器**：在 `CardEditorModal.tsx` 类型选择下拉追加选项

---

## 6. 已知限制

| 编号 | 问题                                              | 影响                     | 状态           |
| ---- | ------------------------------------------------- | ------------------------ | -------------- |
| 1    | 媒体文件支持未实现（card_media 表/assetProtocol） | 图像类卡片无法使用       | Phase 4 规划中 |
| 2    | APKG 导入未实现，仅支持导出                       | 无法从 Anki 迁移现有牌组 | 低优先级 TODO  |
