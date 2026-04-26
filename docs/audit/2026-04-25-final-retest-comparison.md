# 学笺项目复测与对比报告

日期：2026-04-25  
复测人：Codex  
对照基线：`docs/audit/2026-04-25-functional-test-results.md`  
对应整改方案：`docs/audit/2026-04-25-modification-plan.md`

## 1. 复测结论

本轮按照整改计划继续收口了高级能力与体验升级后的剩余问题，并重新执行了仓库级验证。

当前状态已经从“测试基线和关键用户流不稳定”收敛到“核心回归集可稳定通过”：

- Vitest 全量：`42` 个测试文件、`240` 个测试全部通过。
- 前端构建：`npm.cmd run build` 通过。
- Tauri Rust 编译检查：`cargo check` 通过。
- 关键 Playwright 用户流：`13/13` 通过。

结论更新：

- `Mock/UI 层`：由“部分可用且已有回归”提升为“回归基线已恢复稳定”。
- `桌面集成层`：虽然本轮仍未拉起完整 Tauri GUI 手工点击系统文件选择器，但前端闭环、阅读器、卡片工坊、导出/复习相关的关键用户流已恢复为可回归状态。

## 2. 本轮执行的验证命令

1. `npm.cmd test -- --run`
2. `npm.cmd run build`
3. `cargo check`
4. `npm.cmd run test:e2e -- tests/e2e/app-shell.spec.ts tests/e2e/reader.spec.ts tests/e2e/card-system-happy-path.spec.ts tests/e2e/export-and-review.spec.ts tests/e2e/performance-smoke.spec.ts --workers=1`

## 3. 与原功能测试报告的对比

### 3.1 全量单测 / 组件测试

原报告：

- `233 通过 / 5 失败 / 238 总测试`

本轮复测：

- `240 通过 / 0 失败 / 240 总测试`

变化说明：

- 修复了 `card-studio` 过期 mock 契约，补齐候选卡片与动画相关 hooks 的测试桩。
- 收敛了积分台账 mock 契约，使其符合“仅当日首次复习奖励”的验收规则。
- 阅读器/主题可读性相关断言已通过。
- 说明测试基础设施与验收契约的主阻塞项已经解除。

### 3.2 Playwright 关键用户流

原报告：

- `app-shell.spec.ts`：失败
- `reader.spec.ts`：`0/3` 通过
- `card-system-happy-path.spec.ts`：`1/2` 通过
- `export-and-review.spec.ts`：`1/4` 通过
- `performance-smoke.spec.ts`：`0/2` 通过

本轮复测：

- `app-shell.spec.ts`：`1/1` 通过
- `reader.spec.ts`：`3/3` 通过
- `card-system-happy-path.spec.ts`：`3/3` 通过
- `export-and-review.spec.ts`：`4/4` 通过
- `performance-smoke.spec.ts`：`2/2` 通过

总计：

- 原报告关键 e2e：`2/13` 通过
- 本轮关键 e2e：`13/13` 通过

变化说明：

- Playwright 启动链路已从直接依赖 Vite dev 冷启动，改为基于生产构建产物的 `vite preview`。
- `gotoApp` 增加了更稳健的首屏 readiness 等待逻辑，避免将冷启动抖动误判为业务回归。
- 卡片工坊新增更稳定的 DOM 契约，编辑/删除动作不再依赖脆弱按钮顺序。

### 3.3 构建与桌面端编译层

原报告：

- 前端构建通过
- `cargo check` 通过

本轮复测：

- 前端构建仍通过
- `cargo check` 仍通过

变化说明：

- 本轮改动没有破坏构建和 Rust 编译面。
- 仍然存在 chunk 体积告警与若干 Rust `unused` warning，但已不构成当前闭环回归阻塞。

## 4. 本轮落实到代码的关键修复

### 4.1 测试基础设施与验收契约

- `xuejian/playwright.config.ts`
  - e2e `webServer` 改为 `build + vite preview`，修复冷启动导致的首页超时。
- `xuejian/tests/e2e/support.ts`
  - 加固 `gotoApp(...)` 的首屏 readiness 等待逻辑。
- `xuejian/src/components/pages/card-studio-page.tsx`
  - 为正式卡片编辑/删除动作补充稳定 `data-testid`。
- `xuejian/tests/unit/card-studio-page.test.tsx`
  - 补齐候选卡片与动画相关查询/变更 hooks 的 mock。

### 4.2 核心学习闭环与业务契约

- `xuejian/src/services/gateway/mockData.ts`
  - 调整积分 mock：仅当日首次复习奖励 `10` 分，其余返回 `null`，与验收契约一致。
- `xuejian/tests/services/gateway/cards.test.ts`
  - 同步更新积分汇总预期。

### 4.3 高级能力与体验升级

本轮复测建立在此前已落地的高级能力修复之上，重点包括：

- 播客页已补上结构化阶段态、错误面板和可重试状态。
- 动画链路已升级为 `quick_preview` / `video_render` 双模式契约，失败时保留结构化错误与渲染日志。

## 5. 当前仍然存在的风险

1. `video_render` 目前是“真实契约已接通，但渲染器未安装时明确失败”，还不是完整的本地视频生产能力闭环。
2. e2e 稳定性已经恢复，但当前策略是“先构建再预览”，执行时间比直接 dev server 更长。
3. 前端产物体积仍然较大，Vite 继续给出 chunk size warning，后续仍建议做拆包优化。
4. Rust 侧仍有未使用代码和仓储方法告警，说明部分后端能力还有继续收敛空间。

## 6. 最终判断

相对原始审计报告，本轮最大的变化不是“又多了几个页面”，而是：

- 测试基线恢复了。
- 核心阅读/卡片/复习/导出相关用户流恢复为可回归状态。
- 高级能力不再停留在无状态 UI 壳子，已经具备更明确的状态、错误与联动语义。

因此，项目当前状态已经明显优于原报告中的“功能面很广但闭环不稳”。

更准确的表述应更新为：

- 核心学习主闭环：`已恢复为可验证、可回归`
- 关键高级能力：`已完成契约级接线与体验收敛，但部分真实生产能力仍待继续落地`
- 下一阶段重点：`真实视频渲染器落地、构建体积优化、Tauri 端更完整的真实桌面集成验证`
