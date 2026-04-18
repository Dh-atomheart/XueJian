---
title: V4-4 App Usability Fixes
status: active
owner: app
last_reviewed: 2026-04-18
canonical: true
---

# V4-4 应用可用性修复

## Goal

用一次跨模块修复批次补齐学笺当前最影响主流程的可用性问题：首次进入时强制完成本地模型密钥配置、修正侧边栏导航图标、把积分规则收敛为“每天第一次卡片评分 +10”，并同时修复阅读器中的导航卡死与高亮定位错位，确保阅读、学习和模型配置三条主线都能稳定工作。

## Depends On

- [../completed/m4-reading-and-sticky-notes.md](../completed/m4-reading-and-sticky-notes.md) ✅
- [../completed/m6-byok-and-minimal-analytics.md](../completed/m6-byok-and-minimal-analytics.md) ✅
- [../completed/v2-2-points-system.md](../completed/v2-2-points-system.md) ✅
- [../../design-docs/README.md](../../design-docs/README.md)

## Scope

- 为首次进入应用增加模型密钥强阻断配置入口
- 为 API 配置补充“本地密钥已存在”的安全只读信号
- 修正侧边栏导航图标与阅读器中的全局导航切换行为
- 修复阅读器对归一化坐标的渲染与滚动定位换算
- 把积分规则改为“每天第一次卡片评分奖励 10 分”并补齐测试

## Acceptance

- 新用户在未完成本地模型密钥配置前无法进入首页、文档库、学习页和阅读器主流程
- 至少存在一个已启用且已存本地密钥的模型配置后，首次阻断自动解除，且 API Key 不会通过查询接口回传到前端
- 阅读器打开时仍可通过侧边栏切换到其他主页面，侧边栏导航图标在默认主题下正常显示
- 阅读器对文档锚点、高亮和卡片来源坐标的定位基于同一套归一化坐标换算，焦点框和高亮落点与正文位置一致
- 同一天内第一次卡片评分会新增一条 10 分账本记录，之后的评分不会重复发放当日奖励，首页积分摘要与账本查询保持一致

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| v4-4-a1 | 首次进入时强阻断未配置密钥的主流程访问 | ✅ |
| v4-4-a2 | API 配置解锁条件基于已存本地密钥且不泄露明文 | ✅ |
| v4-4-a3 | 侧边栏图标正常显示且阅读器内可切换主导航 | ✅ |
| v4-4-a4 | 阅读器高亮与焦点框按归一化坐标正确定位 | ✅ |
| v4-4-a5 | 每日第一次卡片评分奖励 10 分且仅发放一次 | ✅ |

## Relevant Files

- `xuejian/src/App.tsx`
- `xuejian/src/store/ui.ts`
- `xuejian/src/components/shell/SidebarRail.tsx`
- `xuejian/src/features/dashboard/DashboardPage.tsx`
- `xuejian/src/features/settings/SettingsPage.tsx`
- `xuejian/src/queries/apiConfigs.ts`
- `xuejian/src/services/gateway/models.ts`
- `xuejian/src/types/document.ts`
- `xuejian/src/types/schema.ts`
- `xuejian/src/features/documents/ReaderPage.tsx`
- `xuejian/src/components/documents/PdfViewer/HighlightLayer.tsx`
- `xuejian/src/components/documents/PdfViewer/PdfPageCanvas.tsx`
- `xuejian/src/services/renderer/document-analysis.ts`
- `xuejian/src/services/gateway/mockData.ts`
- `xuejian/src/queries/learning.ts`
- `xuejian/src/services/gateway/points.ts`
- `xuejian/src/queries/points.ts`
- `xuejian/src-tauri/src/secrets/mod.rs`
- `xuejian/src-tauri/src/commands/settings.rs`
- `xuejian/src-tauri/src/db/points_repo.rs`
- `xuejian/src-tauri/src/commands/points.rs`
- `xuejian/src-tauri/src/migrations/V8__points_daily_bonus_rule.sql` (to create)
- `xuejian/tests/services/settings-and-models.test.ts`
- `xuejian/tests/services/gateway/points.test.ts`
- `xuejian/tests/store/ui.test.ts`
- `xuejian/tests/unit/reader-highlight-layer.test.tsx`
- `xuejian/tests/e2e/reader.spec.ts`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cd xuejian && npm run test:e2e`

## Notes

- 首次阻断的放行条件使用“已存本地密钥”，不使用 `apiConfigs.length` 这样的弱判断。
- 阅读器持久化坐标继续使用归一化比例值作为真相源，本计划只修复渲染换算与测试契约，不做历史数据迁移。
- 每日积分唯一性必须由数据库约束兜底，不能只依赖前端会话状态。
- 本计划只修复侧边栏导航图标，不包含应用窗口图标、任务栏图标或 favicon。