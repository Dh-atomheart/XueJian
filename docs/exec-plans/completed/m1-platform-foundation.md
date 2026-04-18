---
title: M1 Platform Foundation
status: archived
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# M1 平台基础模块

## Goal

建立可运行的桌面应用骨架，固定数据库、密钥、命令桥、基础任务运行时、设计系统与壳层边界。

## Depends On

- [../../product-specs/mvp.md](../../product-specs/mvp.md)
- [../../../ARCHITECTURE.md](../../../ARCHITECTURE.md)
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)

## Scope

- Tauri 2 + React 19 + TypeScript + Rust Host 基础工程
- SQLite / FTS5 / Stronghold 初始化与迁移
- `ModelGateway` / `ToolGateway` 与 Python orchestration service 生命周期
- 默认设计 tokens、桌面壳层、基础 UI primitives
- `TanStack Query / Zustand / idb / SQLite` 职责边界

## Acceptance

- 应用可以启动、构建、lint
- SQLite、FTS5、Stronghold、gateway、Python 服务健康检查可工作
- 默认主题 token、字体槽位、纸感壳层与 `AppShell` 已落地
- 目录与分层符合 [../../../ARCHITECTURE.md](../../../ARCHITECTURE.md)

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| m1-a1 | 应用可以启动、构建、lint | ✅ |
| m1-a2 | gateway、Python 服务健康检查 | ✅ |
| m1-a3 | 默认主题 token、壳层落地 | ✅ |
| m1-a4 | 目录与分层符合 ARCHITECTURE | ✅ |

## Relevant Files

- `xuejian/src/design-system/`
- `xuejian/src/components/shell/`
- `xuejian/src/components/ui/`
- `xuejian/src/queries/`
- `xuejian/src/store/`
- `xuejian/src-tauri/src/db/`
- `xuejian/src-tauri/src/gateway/`
- `xuejian/src-tauri/src/secrets/`
- `xuejian/src-tauri/src/tasks/`
- `xuejian/orchestration_service/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `python scripts/docs/generate_db_schema.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- 此计划由 archive 中 `M1` 模块计划压缩而来，保留模块目标、边界和验收口径。
- 若本轮只做部分基础设施，应继续拆子计划，不要把所有任务压在一次提交里。
