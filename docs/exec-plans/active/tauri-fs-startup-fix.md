---
title: Tauri Fs Startup Fix
status: active
owner: app
last_reviewed: 2026-04-18
canonical: true
---

# Tauri fs startup fix

## Goal

Restore `npm run tauri:dev` by removing the stale Tauri `plugin-fs` configuration that no longer matches the installed Tauri 2.10 runtime, and clean up the unused host-side plugin registration and dependency.

## Depends On

- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md)
- [../../../ARCHITECTURE.md](../../../ARCHITECTURE.md)

## Scope

- Remove the invalid `plugins.fs` config from `xuejian/src-tauri/tauri.conf.json`
- Remove the unused `tauri_plugin_fs` registration from the Rust host bootstrap
- Remove the unused `tauri-plugin-fs` Cargo dependency and refresh the lockfile
- Fix startup-only database and Stronghold initialization regressions uncovered after the Tauri config fix

## Acceptance

- `npm run tauri:dev` no longer panics on `PluginInitialization("fs", ...)`
- Existing document import and binary read flows continue to use Rust `std::fs` without interface changes
- No new capability-based `fs` permissions are introduced in this fix

## Tests

| ID | Acceptance | Status |
|----|------------|--------|
| tauri-fs-startup-fix-a1 | `npm run tauri:dev` starts past Tauri app initialization without the `plugins.fs.scope` panic | ✅ |
| tauri-fs-startup-fix-a2 | Rust host still builds and tests after removing `tauri-plugin-fs` | ✅ |
| tauri-fs-startup-fix-a3 | Frontend lint remains clean and document IPC surface is unchanged | ✅ |

## Relevant Files

- `xuejian/src-tauri/tauri.conf.json`
- `xuejian/src-tauri/src/lib.rs`
- `xuejian/src-tauri/Cargo.toml`
- `xuejian/src-tauri/src/db/mod.rs`
- `xuejian/src-tauri/src/secrets/mod.rs`

## Checks

- `cd xuejian && npm run tauri:dev`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`
- `cd xuejian && npm run lint`

## Notes

- Current frontend document flows go through Rust `invoke` commands and do not use `@tauri-apps/plugin-fs`.
- This fix does not address unrelated dead-code warnings.
- Startup verification also exposed two pre-existing setup issues: `PRAGMA journal_mode = WAL` was executed via `execute`, and the configured Stronghold key material was not 32 bytes.
