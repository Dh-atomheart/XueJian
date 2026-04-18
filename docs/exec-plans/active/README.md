---
title: Active Exec Plans Index
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# 当前执行计划索引

本目录存放“准备执行”或“正在执行”的任务计划。这里的文档不是长期产品规范，而是面向一次实现周期的实施底稿。

## 使用方式

- 新功能、新模块、新一轮重构，先在这里创建或更新计划。
- 默认先写成 `status: draft`，真正开做后改成 `status: active`。
- 做完后移动到 `../completed/`，不要长期堆在这里。

## Tests 章节约定

每个计划在 `Acceptance` 后必须有 `## Tests` 表格，用 ID 标记验收点：

| 列 | 说明 |
|----|------|
| ID | `{plan}-a{n}` 格式的唯一标识（如 `m4-a1`、`v2-1-a3`） |
| 验收点 | 对应 Acceptance 中的一条标准 |
| 状态 | ⏳ 待实现 / ✅ 已通过 |

测试代码中用 `// @acceptance:{id}` 标记关联验收点。Agent 自由决定测试文件位置和类型。

验收覆盖率检查（advisory）：`python scripts/docs/validate_acceptance.py`

## 依赖关键路径

MVP 模块的执行顺序由依赖关系决定：

```
M1 Platform Foundation          ← 所有模块的根依赖
├── M2 Document Import & Anchors
│   └── M3 Card Production Line
│       └── M4 Reading & Sticky Notes
├── M5 Study Scheduling
└── M6 BYOK & Minimal Analytics

M2 + M6 完成后 → V2 阶段可启动
V2 完成后 → V3 阶段可启动
V3 完成后 → V4 阶段可启动
```

当前焦点：**M5 Study Scheduling**（推荐下一项）。`M6 BYOK & Minimal Analytics` 也已解除阻塞。M1、M2、M3、M4 已归档至 `completed/`。

## 模块计划

### MVP（当前阶段）

- ~~m1-platform-foundation.md~~ → [已完成](../completed/m1-platform-foundation.md)
- ~~m2-document-import-and-anchors.md~~ → [已完成](../completed/m2-document-import-and-anchors.md)
- ~~m3-card-production-line.md~~ → [已完成](../completed/m3-card-production-line.md)
- ~~m4-reading-and-sticky-notes.md~~ → [已完成](../completed/m4-reading-and-sticky-notes.md)
- [m5-study-scheduling.md](./m5-study-scheduling.md) — `draft`
- [m6-byok-and-minimal-analytics.md](./m6-byok-and-minimal-analytics.md) — `draft`

### V2（Backlog — MVP 完成后启动）

- [v2-1-rag.md](./v2-1-rag.md)
- [v2-2-points-system.md](./v2-2-points-system.md)
- [v2-3-multi-format-import.md](./v2-3-multi-format-import.md)

### V3（Backlog — V2 完成后启动）

- [v3-1-card-animation.md](./v3-1-card-animation.md)
- [v3-2-ai-podcast.md](./v3-2-ai-podcast.md)

### V4（Backlog — V3 完成后启动）

- [v4-1-knowledge-graph.md](./v4-1-knowledge-graph.md)
- [v4-2-theme-switching-and-theme-packs.md](./v4-2-theme-switching-and-theme-packs.md)
- [v4-3-android-capability-assessment.md](./v4-3-android-capability-assessment.md)
