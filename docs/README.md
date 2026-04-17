---
title: Documentation System
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# 学笺文档系统

本目录是学笺仓库的系统记录系统。规范的目标不是堆叠大而全的总文档，而是把不同层级的真相源拆清楚，让人类和 agent 都能只读取必要上下文。

## 阅读顺序

1. 先看 [../AGENTS.md](../AGENTS.md) 了解仓库入口和命令。
2. 再看 [../ARCHITECTURE.md](../ARCHITECTURE.md) 了解正式分层和依赖边界。
3. 再看 [product-specs/index.md](./product-specs/index.md) 了解阶段目标和 Done Means。
4. 涉及视觉与交互时，看 [design-docs/README.md](./design-docs/README.md)。
5. 涉及具体实施任务时，看 [exec-plans/](./exec-plans/)。

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `product-specs/` | 产品范围、阶段边界、验收标准 |
| `design-docs/` | 设计系统、页面规则、交互规范 |
| `exec-plans/active/` | 正在执行的任务计划 |
| `exec-plans/completed/` | 已完成任务计划与实施记录 |
| `references/` | 对 agent 友好的参考资料与细节说明 |
| `generated/` | 仅允许脚本生成的文档 |
| `QUALITY_SCORE.md` | 文档与仓库治理质量追踪 |
| `RELIABILITY.md` | 可靠性与后续 observability 规划 |
| `SECURITY.md` | 密钥、边界、安全约束 |

## 真相源规则

- `product-specs/*` 是产品和阶段边界的真相源。
- `design-docs/*` 是 UI/UX 规则的真相源。
- `exec-plans/*` 记录某项工作的实施计划与决策，不回写成新的总规范。
- `references/*` 保存细节补充，但不能取代上位规范。
- `generated/*` 只允许脚本写入。

## 命令

- 安装：`cd xuejian && npm install`
- 前端开发：`cd xuejian && npm run dev`
- 前端构建：`cd xuejian && npm run build`
- Lint：`cd xuejian && npm run lint`
- 单元测试：`cd xuejian && npm run test`
- E2E：`cd xuejian && npm run test:e2e`
- Tauri 开发：`cd xuejian && npm run tauri:dev`
- Tauri 构建：`cd xuejian && npm run tauri:build`
- Rust 测试：`cargo test --manifest-path xuejian/src-tauri/Cargo.toml`
- 文档校验：`python scripts/docs/validate.py`
- 全量预检：`python scripts/docs/preflight.py`

## 维护规则

- canonical Markdown 文档必须带 frontmatter。
- 变更 `xuejian/package.json` 脚本时，必须同步更新 `README.md`、`AGENTS.md`、`ARCHITECTURE.md`。
- 新增或修改 migration 时，必须更新 `generated/db-schema.md`。
- 新的长期实施工作必须先建 `exec-plans/active/*.md`。
