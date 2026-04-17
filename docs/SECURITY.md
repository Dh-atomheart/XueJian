---
title: Security
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# 安全边界

## 核心原则

- `SQLite` 是业务数据真相源，但不允许保存明文 API Key。
- `Stronghold` 是密钥真相源。
- Python orchestration 服务不持有明文密钥。
- UI 不直接访问主数据库或明文密钥。

## 默认约束

- 禁止把 `IndexedDB` 当作主数据库。
- 禁止把密钥写入日志、测试快照或调试输出。
- 所有模型接入必须经过 Host 暴露的 `ModelGateway`。
- 受控工具访问必须经过 Host 暴露的 `ToolGateway`。

## 文档要求

- 安全边界变更必须同时更新：
  - [../ARCHITECTURE.md](../ARCHITECTURE.md)
  - [references/ai-orchestration.md](./references/ai-orchestration.md)
  - 对应 `docs/exec-plans/*`

## 后续补充

- provider 级预算和配额边界
- 更细的审计日志策略
- 更明确的 secrets rotation 与 migration 方案
