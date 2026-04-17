---
title: Tech Debt Tracker
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# 技术债追踪

## Open Items

| ID | Area | Debt | Next Action |
| --- | --- | --- | --- |
| TD-001 | Observability | 还没有完整的 tracing / metrics / log aggregation 方案 | 等 MVP 主流程稳定后建立单独 exec plan |
| TD-002 | Doc gardening | 当前园丁任务只更新质量分数和生成文档，不做自动分类修复 | 在下一轮扩展 drift 分类和更细粒度检查 |
| TD-003 | Architecture lint | 目前是路径级约束，尚未扩展到更细的 symbol-level 依赖关系 | 视代码体量增长再升级 |

## Usage

- 新债务先写这里，再决定是否拆成独立 `exec-plan`。
- 债务清理完成后，移动到对应完成计划中记录闭环。
