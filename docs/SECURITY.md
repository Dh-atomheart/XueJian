---
title: Security
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# Security Boundary

## Core Rules

- SQLite is the source of truth for product data, but it must not store plaintext API keys.
- Stronghold is the source of truth for stored credentials.
- The Python orchestration service must not own plaintext secrets.
- The UI must not directly access the database or plaintext credentials.

## Default Constraints

- Do not use `IndexedDB` as the primary application database.
- Do not write secrets into logs, snapshots, or debug dumps.
- All model access goes through the host-owned `ModelGateway`.
- All privileged tool access goes through the host-owned `ToolGateway`.

## Provider Credential Boundary

The formal provider set for this phase is:

- `openai`
- `anthropic`
- `google`
- `openai_compatible`

The formal auth mode set for this phase is:

- `api_key`
- `adc`

Rules:

- `adc` is resolved only inside the host environment.
- Python orchestration may know that `adc` is available, but it must not read the underlying credential.
- `openai_compatible` may provide a custom `baseUrl`, but the host still owns connection tests, budget controls, and log redaction.
- The project does not implement browser-login bridging, cookie forwarding, or session-token relays for model providers.

## Documentation Requirements

Any change to the security boundary must be reflected in:

- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [references/ai-orchestration.md](./references/ai-orchestration.md)
- the relevant `docs/exec-plans/*`

## Follow-Up Topics

- provider-level budget policy
- audit-log policy detail
- secrets rotation and migration rules
