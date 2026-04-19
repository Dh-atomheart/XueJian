---
title: MVP W4 Integration And Testing
status: draft
owner: platform
last_reviewed: 2026-04-19
canonical: true
---

# MVP 第4周：整合与测试

## Goal

实现 BYOK 配置界面与模型连接测试（Anthropic 原生 API / OpenAI / Custom），整合统计、导出（CSV + .apkg）、任务恢复与错误处理，验证 Card schema 迁移在空库和既有库上的正确性，完成 Rough.js 视觉验收，编写 E2E 测试并打包验证，确保 MVP 闭环可交付。

## Depends On

- [mvp-w3-document-and-learning.md](./mvp-w3-document-and-learning.md) ⏳
- [../../product-specs/mvp.md](../../product-specs/mvp.md)

## Scope

- BYOK 配置界面：provider 选择（openai/anthropic/custom）、API Key 输入、baseUrl（custom 必填）、连接测试
- 模型连接测试：调用 W2 的 LiteLLM adapter 做真实 completion 请求验证
- 统计整合：DailyStats 查询与首页展示
- 导出整合：CSV 导出 + .apkg 导出（复用 W3 genanki_exporter）
- 任务恢复：从 WorkflowCheckpoint 恢复中断的 card_generation 工作流
- 错误处理：统一错误反馈，失败状态有可解释提示
- V10/V11 迁移验证：空库 + 既有库迁移后数据完整
- Rough.js 视觉验收：空状态、卡片边框、分隔线、标题下划线
- E2E 测试：上传→生成→确认→阅读→复习完整链路
- 打包测试：`npm run tauri:build` 产出安装包

## Acceptance

- BYOK 界面可配置 openai/anthropic/custom provider，API Key 存入 Stronghold 不回传前端
- 连接测试发送真实 completion 请求，返回成功/失败 + 耗时
- DailyStats 在首页正确展示今日新卡/复习数/正确率
- CSV 和 .apkg 导出功能可用
- 中断的 card_generation 工作流可从最近 checkpoint 恢复，不产生重复正式卡片
- V10/V11 迁移在空库和既有库上均成功，新字段默认值正确
- Rough.js 点缀在空状态、卡片边框、分隔线上可见，roughness ≤ 0.6，不侵入正文区
- E2E 测试覆盖：上传 PDF → 生成卡片 → 确认 → 阅读联动 → FSRS 评分
- `npm run tauri:build` 成功产出安装包

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| mvp-w4-a1 | BYOK 配置：API Key 存 Stronghold，查询接口不回传明文 | ⏳ |
| mvp-w4-a2 | 连接测试：真实 completion 请求返回成功/失败 | ⏳ |
| mvp-w4-a3 | 导出：CSV + .apkg 均可用 | ⏳ |
| mvp-w4-a4 | 任务恢复：从 checkpoint 继续，无重复卡片 | ⏳ |
| mvp-w4-a5 | V10/V11 迁移：空库 + 既有库数据完整 | ⏳ |
| mvp-w4-a6 | Rough.js 视觉验收：空状态/边框/分隔线 | ⏳ |
| mvp-w4-a7 | E2E：上传→生成→确认→阅读→复习闭环 | ⏳ |
| mvp-w4-a8 | 打包：tauri:build 成功 | ⏳ |

## Relevant Files

- `xuejian/src/features/settings/SettingsPage.tsx`
- `xuejian/src/queries/apiConfigs.ts`
- `xuejian/src/services/gateway/models.ts`
- `xuejian/src-tauri/src/commands/settings.rs`
- `xuejian/src-tauri/src/secrets/mod.rs`
- `xuejian/src/features/dashboard/DashboardPage.tsx`
- `xuejian/src/components/ui/SketchBorder.tsx`
- `xuejian/src/components/ui/SketchEmptyState.tsx`
- `xuejian/tests/e2e/` (to create/extend)

## Checks

- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cd xuejian && npm run test:e2e`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`
- `cd xuejian && npm run tauri:build`

## Notes

- BYOK 连接测试需要真实 API Key，测试环境可用 mock 模式
- .apkg 导出复用 W3 的 genanki_exporter，Rust 侧通过 Host HTTP Gateway 调用
- 任务恢复的幂等性由 dedupe_key 保证，不依赖 checkpoint 去重
- E2E 测试使用 Playwright，需配置 Tauri dev 模式
- 打包测试仅在 CI 或本地最终验证时运行，不在每次 PR 时运行
