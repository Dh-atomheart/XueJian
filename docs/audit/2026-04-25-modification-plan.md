# 学笺项目修改计划报告

日期：2026-04-25  
目标：把当前项目从“功能面很广但闭环不稳”拉回到“核心主路径可回归、真实能力可验证、再继续扩展”的状态。

## 1. 修复原则

本轮修改不应平均用力，而应遵循以下顺序：

1. 先修测试基础设施和验收契约。
2. 再修核心学习主闭环。
3. 再补真实模型与编排依赖。
4. 最后处理高级能力和体验升级。

原因很简单：

- 如果首页、阅读器、性能 smoke 都不稳，任何新功能都无法可靠回归。
- 如果导入、生成、阅读、复习闭环不稳，产品最核心价值就没有立住。
- 如果 Python 和 provider 依赖不齐，播客、问答、图谱、导出都会反复“看起来有，实际上不通”。

## 2. 优先级总览

### P0：恢复可回归的测试基线

目标：

- 让 e2e 至少能稳定加载首页。
- 把“页面契约漂移”和“真实功能回归”分开。
- 让 smoke 能重新提供有效信号。

工作包：

1. 统一测试锚点策略
   - 给首页、文档库、卡片工坊、设置页、阅读器关键区块重新定义稳定 `data-testid`。
   - 不再让测试依赖脆弱文案，例如“模型配置”“数据导出”“文档面板”。

2. 修复 Playwright 启动链路
   - 核查 `playwright.config.ts` 中 `webServer` 的稳定性。
   - 明确是 Vite server 未稳定就绪、页面首屏阻塞，还是某些初始化逻辑阻断 `domcontentloaded`。
   - 为首页加载增加明确的 readiness signal，而不是只靠 `page.goto`。

3. 重写失效的 e2e 断言
   - `app-shell.spec.ts`
   - `reader.spec.ts`
   - `export-and-review.spec.ts`
   - `performance-smoke.spec.ts`
   - 断言应锚定用户可见能力，不锚定历史文案。

4. 清理单测与当前设计脱节的问题
   - 更新 `theme-provider.test.tsx`，反映“单官方主题”的现状。
   - 更新 `app-shell-layout-css.test.ts`，避免对 class 字符串顺序做断言。
   - 更新 `schema.test.ts`，补上 `retrievalStatus`。

验收标准：

- `npm test -- --run` 全绿。
- `tests/e2e/app-shell.spec.ts` 通过。
- `tests/e2e/card-system-happy-path.spec.ts` 全绿。
- `tests/e2e/export-and-review.spec.ts` 不再因文案变动失败。

## 3. P1：修复核心业务闭环

目标：

- 用户可以完成：导入文档 -> 生成卡片 -> 打开阅读器 -> 看到贴笺/高亮 -> 开始复习。

工作包：

### 3.1 导入与生成

修改点：

- 恢复 `useDocumentImport` 的可操作失败反馈。
- 在自动卡片生成失败时明确提示：
  - 哪一步失败
  - 用户下一步去哪
  - 是否可以重试
- 将“仅有 warning”改为“warning + 明确 CTA”。

建议实现：

- 把导入结果拆成：
  - `parse_succeeded_generation_started`
  - `parse_succeeded_generation_failed`
  - `parse_failed`
  - `embedding_skipped`
- 将 message 与 warnings 结构化，而不是只给一条模糊字符串。

验收：

- 导入失败和部分成功场景有明确用户路径。
- `use-document-import.test.tsx` 更新后通过。

### 3.2 卡片工坊

修改点：

- 明确“候选卡片列表”和“正式卡片列表”的视觉与测试结构。
- 如果当前产品已经放弃单独候选列表，就应删除旧测试并重写设计文档。
- 如果候选列表仍是核心流程，就应恢复 `candidate-list` UI 与 test id。

验收：

- 卡片工坊最少有一个稳定的“生成输入区 + 任务记录区 + 正式卡片区”契约。
- Playwright 能验证“打开卡片工坊 -> 选择文档 -> 启动生成”。

### 3.3 阅读器与贴笺

修改点：

- 修复首页进入阅读器的稳定性。
- 排查阅读器状态切换、reader mode、context rail 与导航返回之间的耦合。
- 去掉 `ReaderPage` 中硬编码颜色，统一走主题 token。

验收：

- `reader.spec.ts` 可稳定跑通。
- 贴笺点击高亮、高亮反向定位贴笺、返回首页三条路径通过。
- `theme-readability.test.ts` 通过。

### 3.4 复习主流程

修改点：

- 保持当前已经通过的 review happy path。
- 为 FSRS 调度补充真实落库验证，而不是只验证 mock 会话结束页。

验收：

- 复习评分后，卡片状态与下次复习时间发生实际变化。
- 统计页能反映复习结果。

## 4. P2：补齐真实桌面与 BYOK 链路

目标：

- 让“看起来有”的真实能力真正可验证。

工作包：

### 4.1 Python orchestration 依赖补齐

缺失依赖优先补齐：

- `langchain_anthropic`
- `litellm`
- `pydantic_ai`
- `docling`
- `PyMuPDF`
- `genanki`
- `edge_tts`
- `pydub`

建议做法：

- 把 orchestration service 依赖拆成：
  - `core`
  - `anthropic`
  - `document_parse`
  - `export`
  - `tts`
- 启动时输出 capability matrix，而不是等工作流运行到中途才失败。

验收：

- 启动日志清晰说明哪些能力可用，哪些依赖缺失。
- 缺失依赖时，设置页或工作流 UI 能明确提示“能力不可用”。

### 4.2 BYOK provider 验证

修改点：

- 对 OpenAI 和 Anthropic 分别增加最小真实链路 smoke。
- 配置保存、连接测试、模型发现、workflow assignment 要有稳定结果。

建议最小 smoke：

1. OpenAI
   - 保存 API Key
   - 测试连接
   - 拉模型
   - 跑一次最小知识问答

2. Anthropic
   - 保存 API Key
   - 测试连接
   - 跑一次最小卡片生成或问答

验收：

- 两种 provider 至少各有一条真实 workflow 通过。
- 失败时错误信息可面向用户理解。

### 4.3 桌面端真实验证

修改点：

- 增加 Tauri 层的最小集成 smoke：
  - 应用启动
  - 文件选择
  - 本地数据库初始化
  - orchestration service health
  - 导出到本地文件

验收：

- 至少一条真实桌面端 PDF 导入闭环可走通。

## 5. P3：高级能力差距修复

这一层不是简单修 bug，而是把当前实现提升到更接近目标产品。

### 5.1 动画生成能力升级

当前问题：

- 当前 `card_animation.py` 输出的是 `AnimationScript`，由 Framer Motion 渲染。
- 这不等同于“高质量演示视频”，更不是 manim 流程。

修改方向：

- 把动画能力拆为两层：
  - `quick_preview`：保留现有前端动画脚本，低成本、秒级反馈。
  - `video_render`：新增真正的视频生成工作流，可用 manim 或类似渲染器。

建议接口：

- 卡片上显示两个入口：
  - `快速演示`
  - `生成高质量视频`

验收：

- 至少可生成一个本地视频文件并在应用内预览。
- 失败时可查看渲染日志。

### 5.2 播客链路收敛

当前问题：

- 工作流逻辑已较完整，但真实依赖与真实 provider 未闭合。

修改方向：

- 明确阶段状态：
  - retrieval
  - outline
  - script
  - evaluation
  - awaiting_review
  - audio
  - ready
- 将预算超限、TTS provider 不可用、音频拼接失败都转为结构化错误。

验收：

- 生成一条最小时长音频播客。
- 可以播放、删除、重试。

### 5.3 知识图谱闭环

修改点：

- 图谱构建成功后，应能反哺问答或文档上下文，而不仅是单独展示页面。
- 给图谱 build run 增加更明确的前端状态与失败原因。

验收：

- 用户至少能从一个文档构建图谱，并在图谱页看到节点与边。
- 问答流程可声明是否使用图谱增强。

## 6. P4：产品一致性与体验治理

目标：

- 把“页面能打开”提升为“信息架构清楚，提示可执行，视觉约束统一”。

工作包：

1. 文案治理
   - 首次使用文案统一。
   - 错误态统一。
   - 部分成功态统一。

2. 视觉规范治理
   - 清除硬编码颜色。
   - 保持单官方主题策略一致。
   - 确保 rough/sketch 风格组件只作为视觉语言，不打断信息层级。

3. DOM 契约治理
   - 给首页、文档库、阅读器、卡片工坊、设置页建立长期稳定 test id。

4. 页面信息架构治理
   - 首页、设置页、卡片工坊必须同步更新设计文档和测试断言。

验收：

- 页面重构后不再大量打断 e2e。
- 同一功能的文案和 CTA 在不同页面上不互相矛盾。

## 7. 推荐实施顺序

### 里程碑 M1：测试恢复

- 修复 5 个 failing unit tests
- 修复首页 e2e
- 修复卡片工坊与导出相关 e2e 契约

完成标准：

- 单测全绿
- App shell / card-system / export-and-review 可作为稳定回归集

### 里程碑 M2：核心主闭环

- 修复导入提示
- 修复阅读器与贴笺
- 修复主题 token 回归
- 把 review 结果与统计联通

完成标准：

- 导入 -> 阅读器 -> 卡片 -> 复习 闭环可回归

### 里程碑 M3：真实能力闭环

- 补齐 Python 依赖
- 验证 OpenAI / Anthropic
- 验证播客、知识问答、导出至少各一条真实链路

完成标准：

- 真实 BYOK 最小流程可跑通

### 里程碑 M4：高级能力升级

- 动画能力升级到视频级实现
- 图谱与问答联动
- 播客稳定化和体验收敛

完成标准：

- 高级能力不再停留在 mock 或“脚手架级可见”

## 8. 关键文件建议关注

优先关注这些区域：

- `xuejian/tests/e2e/`
- `xuejian/tests/unit/`
- `xuejian/src/components/shell/AppShell.tsx`
- `xuejian/src/features/documents/ReaderPage.tsx`
- `xuejian/src/features/documents/useDocumentImport.ts`
- `xuejian/src/components/pages/settings-page.tsx`
- `xuejian/src/components/pages/card-studio-page.tsx`
- `xuejian/orchestration_service/`

## 9. 最终建议

当前阶段不建议立刻继续大规模加新功能。

最合理的路线是：

1. 用 1 个短周期把测试和主闭环拉稳。
2. 用 1 个短周期把真实 BYOK 和 orchestration 依赖补齐。
3. 再决定是否推进 manim 级动画视频、深度播客和知识图谱增强。

这样做的好处是：

- 后续每做一个功能，都能被稳定验证。
- 真正能回答“这个功能用户能不能用”，而不只是“代码里有没有这个页面和模块”。
