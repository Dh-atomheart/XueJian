---
title: M6 BYOK And Minimal Analytics
status: draft
owner: app
last_reviewed: 2026-04-17
canonical: true
---

# M6 BYOK 与最小统计模块

## Goal

允许用户配置自有模型凭证并安全存储，同时提供克制的学习反馈和成本感知闭环。

## Depends On

- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [./m5-study-scheduling.md](./m5-study-scheduling.md)
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)
- [../../SECURITY.md](../../SECURITY.md)

## Scope

- OpenAI、Anthropic、兼容端点配置
- Stronghold 密钥存取与连接测试
- 最小统计概览、热力图和日统计
- 成本提示、预算边界和日志脱敏

## Acceptance

- 用户可配置模型并测试连接
- API Key 只进入 Stronghold，不进入 SQLite 和 Python 服务
- 首页与设置页可看到最小统计概览
- 统计 UI 保持克制，不演变成重驾驶舱

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| m6-a1 | 配置模型并测试连接 | ⏳ |
| m6-a2 | API Key 只进 Stronghold | ⏳ |
| m6-a3 | 首页与设置页最小统计概览 | ⏳ |
| m6-a4 | 统计 UI 保持克制 | ⏳ |

## Relevant Files

- `xuejian/src/features/settings/`
- `xuejian/src/components/stats/`
- `xuejian/src/services/gateway/models.ts`
- `xuejian/src/services/gateway/settings.ts`
- `xuejian/src/queries/settings.ts`
- `xuejian/src-tauri/src/commands/settings.rs`
- `xuejian/src-tauri/src/secrets/`
- `xuejian/src-tauri/src/db/settings_repo.rs`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- 统计只覆盖“最小可用反馈”，不是 BI 系统。
- 成本感知和预算提示要沿用 Host 统一边界，不在前端直接估算真相值。
