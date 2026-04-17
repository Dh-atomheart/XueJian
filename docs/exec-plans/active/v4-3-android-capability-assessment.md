---
title: V4-3 Android Capability Assessment
status: draft
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# V4-3 Android 能力适配评估

## Goal

评估桌面端能力向 Android 迁移的可行性，并输出能力矩阵、阻塞项、替代方案和优先级建议。

## Depends On

- [../../product-specs/v4.md](../../product-specs/v4.md)
- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [../completed/m2-document-import-and-anchors.md](../completed/m2-document-import-and-anchors.md) ✅
- [./m3-card-production-line.md](./m3-card-production-line.md)
- [./m4-reading-and-sticky-notes.md](./m4-reading-and-sticky-notes.md)
- [./m5-study-scheduling.md](./m5-study-scheduling.md)
- [./m6-byok-and-minimal-analytics.md](./m6-byok-and-minimal-analytics.md)
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)

## Scope

- 桌面端能力矩阵盘点
- Android 可复用协议、Host 能力和替代运行形态评估
- 文件系统、后台任务、PDF、TTS、Python 服务替代分析
- 迁移建议与里程碑优先级

## Acceptance

- 输出能力矩阵和阻塞项清单
- 区分可复用、需重写、仅协议复用和不可行项
- 明确 Android 迁移复用的是 `Orchestration Protocol`、任务语义和数据契约
- 不越界承诺 Android 客户端交付

## Relevant Files

- `docs/`
- `xuejian/src/`
- `xuejian/src-tauri/`
- `xuejian/orchestration_service/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`

## Notes

- 这是评估型计划，不是实现 Android 客户端的计划。
- 不允许为了迁移评估反向破坏桌面端既有架构。
- **Backlog**：此计划属于 V4 阶段，V3 完成前不应启动。
