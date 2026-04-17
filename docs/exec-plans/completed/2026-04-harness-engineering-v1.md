---
title: Harness Engineering v1
status: archived
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# Harness Engineering v1

## Goal

把仓库从“单一大文档 + 缺机械约束”升级为“多层真相源 + 自动校验 + 周期园丁任务”。

## Delivered

- 新增根级 `AGENTS.md` 和 `ARCHITECTURE.md`
- 新增 `docs/product-specs/*`
- 新增 `docs/design-docs/*` 作为 canonical 设计文档位置
- 新增 `docs/references/*`
- 新增 `docs/QUALITY_SCORE.md`、`RELIABILITY.md`、`SECURITY.md`
- 新增 `scripts/docs/*`
- 新增 `.github/workflows/knowledge-base.yml` 和 `doc-garden.yml`
- 归档旧 `spec.md`、旧设计文档、旧模块实施文档

## Notes

- 本轮不改应用运行时 API，也不改 Python orchestration 协议。
- 本轮聚焦仓库治理层，而不是业务功能扩展。
