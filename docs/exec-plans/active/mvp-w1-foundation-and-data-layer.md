---
title: MVP W1 Foundation And Data Layer
status: draft
owner: platform
last_reviewed: 2026-04-19
canonical: true
---

# MVP 第1周：基础架构与数据层

## Goal

完成 Card schema 扩展（title/cardType/clusterId/exportGuid）和 Anchor provenance（hierarchyPath/quoteHash）的数据库迁移、TypeScript 类型与 Zod schema 对齐、Rust Repository 层适配，以及 Rough.js 点缀组件封装，为后续周的网关和文档处理奠定数据层基础。

## Depends On

- [../../spec.md](../../spec.md) §4.2, §4.4
- [tauri-fs-startup-fix.md](./tauri-fs-startup-fix.md) ✅

## Scope

- 创建 V10 迁移：cards 表增加 title, card_type, cluster_id, export_guid 列；card_candidates 表增加 title, card_type 列
- 创建 V11 迁移：document_anchors 表增加 hierarchy_path, quote_hash 列，移除旧 hash 列
- 更新 TypeScript `Card` / `CardCandidate` / `DocumentAnchor` 接口和 Zod schema
- 更新 Rust `CardRepository` / `DocumentRepository` 读写方法适配新列
- 更新 Python `providers/runtime.py` 的 `normalize_provider` 移除 google/adc，改为 `openai | anthropic | custom` + protocol
- 封装 Rough.js `SketchBorder` 组件（卡片边框、分隔线、空状态点缀）
- 编写数据层单元测试

## Acceptance

- V10/V11 迁移在空库和既有库上均可成功执行，`cargo test` 通过
- TypeScript `Card` 类型包含 title, cardType, clusterId, exportGuid 字段，Zod schema 校验通过
- TypeScript `DocumentAnchor` 类型包含 hierarchyPath, quoteHash 字段
- Rust `CardRepository::create_card` 生成稳定 exportGuid（UUID v5 命名空间）
- `normalize_provider("custom")` 返回 `"custom"`（不再转换为 `"openai_compatible"`）
- Rough.js `SketchBorder` 组件在 Storybook 或测试页可渲染，roughness ≤ 0.6

## Tests

| ID        | 验收点                                                                                            | 状态 |
| --------- | ------------------------------------------------------------------------------------------------- | ---- |
| mvp-w1-a1 | V10 迁移：cards 新增 title/card_type/cluster_id/export_guid，card_candidates 新增 title/card_type | ✅   |
| mvp-w1-a2 | V11 迁移：document_anchors 新增 hierarchy_path/quote_hash                                         | ✅   |
| mvp-w1-a3 | TS Card/CardCandidate/DocumentAnchor 类型与 Zod schema 对齐 spec §4.2                             | ✅   |
| mvp-w1-a4 | Rust CardRepository 读写新字段，exportGuid 稳定生成                                               | ✅   |
| mvp-w1-a5 | Python normalize_provider 支持 openai/anthropic/custom                                            | ✅   |
| mvp-w1-a6 | Rough.js SketchBorder 组件可渲染                                                                  | ✅   |

## Relevant Files

- `xuejian/src-tauri/src/migrations/V10__card_schema_extension.sql` (to create)
- `xuejian/src-tauri/src/migrations/V11__anchor_provenance.sql` (to create)
- `xuejian/src/types/document.ts`
- `xuejian/src/types/schema.ts`
- `xuejian/src-tauri/src/db/card_repo.rs`
- `xuejian/src-tauri/src/db/document_repo.rs`
- `xuejian/src-tauri/src/db/settings_repo.rs` (normalize_provider)
- `xuejian/orchestration_service/providers/runtime.py`
- `xuejian/src/components/ui/SketchBorder.tsx` (to create)
- `xuejian/src/design-system/tokens.ts`

## Checks

- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- exportGuid 使用 UUID v5（命名空间 + cardId）保证稳定，不使用随机 UUID
- V9 迁移曾将 `custom` 转为 `openai_compatible`；V10 需新增迁移将 `openai_compatible` 转回 `custom` 并添加 `protocol` 列
- hierarchyPath 存为 JSON 数组，如 `["Chapter 3", "Section 3.2"]`
- quoteHash 为 SHA-256(normalized textQuote)，用于锚点去重和漂移检测
- Rough.js 仅用于壳层装饰，不侵入正文区、PDF 热区或表单控件
