# 学笺项目功能测试结果报告

日期：2026-04-25  
审计人：Codex  
审计基准：以目标产品能力为主，以当前仓库实现为对照  
测试层级：Mock/UI、桌面集成可行性、真实 BYOK 可行性

## 1. 结论摘要


但从“用户能否真实用起来”的角度看，结论不是“功能缺少”，而是“功能面很广，但闭环稳定性明显不足”：

- 前端构建可以通过，说明页面和模块大体可编译。
- 前端单测大部分通过，但已经存在 5 个明确回归点。
- Playwright 冒烟和用户路径测试失败比例较高，暴露出页面文案/结构漂移、测试契约失效、阅读器路径不稳定、性能 smoke 失效等问题。
- Rust `cargo check` 通过，但仅能证明编译级可用，不能证明桌面工作流跑通。
- Python orchestration service 能启动，但真实高级能力依赖缺失严重，尤其影响 Anthropic、Docling、导出、TTS 和播客真实链路。

整体判断：

- `Mock/UI 层`：部分可用，但已有明显回归。
- `桌面集成层`：有实现基础，但尚未证明主闭环稳定。
- `真实 BYOK 外部模型层`：当前环境下不能判定为可用，存在依赖阻塞。

## 2. 执行范围与证据

### 2.1 已执行命令

- `npm.cmd run build`
- `npm.cmd test -- --run`
- `npm.cmd test -- --run tests/types/schema.test.ts`
- `npm.cmd test -- --run tests/unit/app-shell-layout-css.test.ts`
- `npm.cmd run test:e2e -- tests/e2e/app-shell.spec.ts --workers=1`
- `npm.cmd run test:e2e -- tests/e2e/reader.spec.ts --workers=1`
- `npm.cmd run test:e2e -- tests/e2e/card-system-happy-path.spec.ts --workers=1`
- `npm.cmd run test:e2e -- tests/e2e/export-and-review.spec.ts --workers=1`
- `npm.cmd run test:e2e -- tests/e2e/performance-smoke.spec.ts --workers=1`
- `cargo check`
- `python --version`
- Python 依赖探测脚本
- `python -m orchestration_service.server --port 8787`

### 2.2 环境事实

- Node/Vite 前端可构建。
- Python 版本：`3.11.5`
- orchestration service 可启动本地 HTTP 服务。
- 未提供真实 OpenAI / Anthropic API Key。
- 本轮未实际拉起完整 Tauri GUI，也未实际点击系统文件选择器。

## 3. 分层测试结果

### 3.1 前端构建

结果：`通过`

观察：

- `npm run build` 成功。
- 产物体积较大：主 JS chunk 约 `2.5 MB`，Vite 给出 chunk size warning。
- `@tauri-apps/api/core` 同时被动态和静态引用，构建提示 chunk 切分不理想。

风险判断：

- 这不是功能阻塞，但会影响桌面首屏时间和后续性能 smoke。

### 3.2 完整 Vitest 基线

结果：`233 通过 / 5 失败 / 238 总测试`

失败点如下：

1. `tests/types/schema.test.ts`
   - 失败用例：`parses rag answers with citations`
   - 现象：`retrievalStatus` 现在是必填，但测试样例未提供。
   - 判断：Schema 已演进，测试与数据契约失配。

2. `tests/unit/app-shell-layout-css.test.ts`
   - 失败用例：`keeps the sidebar fixed-height and uses the main area as the page scroll container`
   - 现象：测试强依赖 `app-shell-main min-h-0 flex-1 overflow-y-auto overflow-x-hidden` 这一固定类名顺序，而实际代码改为条件拼接。
   - 判断：测试过于脆弱，属于实现细节契约漂移。

3. `tests/unit/theme-provider.test.tsx`
   - 失败用例：`keeps the settings page on the official paper theme`
   - 现象：测试仍期待“主题包”和多个主题选项，但实际设置页只保留单一官方主题输入。
   - 判断：测试未跟随产品设计收敛而更新。

4. `tests/unit/theme-readability.test.ts`
   - 失败用例：`src/features/documents/ReaderPage.tsx has no hardcoded colour classes`
   - 现象：阅读器仍含 `border-yellow-300/40 bg-yellow-200/10`
   - 判断：这是实质性 UI 规范回归，不是单纯测试漂移。

5. `tests/unit/use-document-import.test.tsx`
   - 失败用例：`finishes import if automatic card generation fails`
   - 现象：测试期望明确提示“前往卡片工作台手动重新生成”，实际文案退化为“仍有后续步骤需要处理”。
   - 判断：产品失败提示变弱，用户可操作性下降。

结论：

- 单测层不是坏掉了，而是已经能发现真实回归。
- 其中 `theme-readability` 和 `use-document-import` 更接近真实产品问题。
- 其余几项更偏向“测试与当前实现不同步”。

### 3.3 Playwright 冒烟与用户流

结果：`整体失败率高，且失败主要集中在真实用户入口、页面契约和性能流`

#### A. App Shell

- 文件：`tests/e2e/app-shell.spec.ts`
- 结果：`失败`
- 现象：`page.goto('/')` 在 60 秒内未完成。

判断：

- 这是高优先级测试基础设施问题。
- 说明最基础的首页加载路径都不稳定，后续 e2e 结果天然不可信。

#### B. 阅读器

- 文件：`tests/e2e/reader.spec.ts`
- 结果：`3 失败 / 0 通过`
- 现象：
  - 第一个用例进首页后找不到 `app-shell`
  - 后续用例直接出现 `ERR_CONNECTION_REFUSED`

判断：

- 阅读器用户流当前无法作为稳定回归基线。
- 更深层问题可能是 webServer 启停不稳定，也可能是首页加载阻塞导致后续测试串联失败。

#### C. 卡片系统 Happy Path

- 文件：`tests/e2e/card-system-happy-path.spec.ts`
- 结果：`1 通过 / 1 失败`

通过：

- `card review happy path reaches the completion screen`
- 说明复习页在 mock 数据下最小复习闭环仍可走通。

失败：

- `card studio page loads from the primary navigation`
- 原因：页面上不存在 `data-testid="card-studio-candidate-list"`

判断：

- 卡片工坊页面不是打不开，而是测试契约已漂移。
- 同时也说明“候选卡片列表”这一中间层当前在 UI 中并不明确暴露。

#### D. Export & Review

- 文件：`tests/e2e/export-and-review.spec.ts`
- 结果：`1 通过 / 3 失败`

通过：

- `card studio shows documents with parsed status as eligible`

失败：

- 找不到 `数据导出`
- 找不到 `今日待学`
- 找不到 `模型配置`

判断：

- 这些失败主要是页面信息结构、命名、文案或板块收缩后，测试没有同步。
- 但从用户视角看，这不只是测试问题，还是“页面信息架构与既有验收标准已经脱钩”。

#### E. Performance Smoke

- 文件：`tests/e2e/performance-smoke.spec.ts`
- 结果：`2 失败 / 0 通过`

失败点：

- Library 页找不到 `文档面板`
- 阅读器场景下找不到 `sidebar-nav-home`，最终超时

判断：

- 当前性能 smoke 已无法作为任何性能结论依据。
- 它实际上先死于页面契约和导航可达性，而不是性能本身。

### 3.4 Rust / Tauri 层

结果：`cargo check 通过`

观察：

- Rust 后端可编译。
- 但存在多处未使用 repository / 方法 / stage 更新函数告警。

判断：

- 后端“实现存在但未完全接线”的概率较高。
- 这支持了前端层面观察到的现象：很多功能并非完全缺失，而是集成闭环不足。

### 3.5 Python orchestration service

结果：`服务外壳可启动，但真实能力依赖缺失明显`

已验证：

- `python -m orchestration_service.server --port 8787` 可以监听本地端口。
- 未传 `--host-port` 时会明确告警后续 workflow 端点将返回 `503`。

依赖探测结果：

- 缺失：
  - `langchain_anthropic`
  - `litellm`
  - `pydantic_ai`
  - `docling`
  - `fitz` / `PyMuPDF`
  - `genanki`
  - `edge_tts`
  - `pydub`

影响判断：

- Anthropic 工作流真实链路不可验证。
- 文档解析增强链路不可完整验证。
- APKG 导出、标注 PDF 导出、播客 TTS、音频拼接均存在真实阻塞。

## 4. 目标功能逐项审计

说明：

- `绿`：当前实现与目标较接近，本轮有证据支持。
- `黄`：有页面/服务/类型，但闭环未证明或只在 mock 下可用。
- `红`：目标与当前实现明显不一致，或真实能力尚未建立。

| 目标功能                                | 现状判断                                                                                            | 结论   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| 1. PDF -> 卡片生成、编辑、删除、导出    | 导入、解析、生成、编辑、删除、CSV/APKG 导出代码都存在；但自动生成真实链路未验证，导入失败提示已退化 | 黄     |
| 2. 阅读器侧边贴笺、页级关联、高亮颜色   | 阅读器、StickyNotes、highlight layer、reader geometry 都存在；但 reader e2e 全线失稳                | 黄偏红 |
| 3. 本地知识库 + 文档范围 AI 问答        | 问答页、检索、RAG schema、embedding workflow 都存在；真实 embedding/profile/BYOK 未验证             | 黄     |
| 4. 卡片结构为标题+内容，正反面完整      | 类型和编辑器支持 `title/front/back/cardType/source`；基础能力存在                                   | 黄偏绿 |
| 5. Agent 动画演示生成器，高质量视频预览 | 当前实现实际是 `AnimationScript + Framer Motion`，不是 manim 视频生产链                             | 红     |
| 6. AI 播客生成，检索、对话稿、音频      | 播客工作流和 TTS 路径存在；但依赖缺失，真实产物未验证                                               | 黄     |
| 7. 学习安排与 FSRS 调度                 | `ts-fsrs` 已接入，ReviewPage 可跑最小闭环                                                           | 黄偏绿 |
| 8. 学习统计、热力图、时长可视化         | Dashboard/Profile/Heatmap/Points 查询都存在；但首页/统计板块文案与旧验收已漂移                      | 黄     |
| 9. BYOK，兼容 OpenAI/Anthropic          | 设置页 provider 模板支持；但 Anthropic 相关 Python 依赖缺失，真实链路未验证                         | 黄偏红 |
| 11. 简洁友好的手绘风 UI                 | Rough/sketch 组件和纸张主题存在；但主题规范回归、测试与页面信息架构不一致                           | 黄     |

## 5. 用户主路径结论

### 5.1 当前可确认部分可走通的路径

- 首页进入复习页，完成一轮 mock 复习会话。
- 卡片工坊页可打开，基础页面可见，生成按钮可见。
- 构建产物可生成，前端不会整体编译失败。
- orchestration service 外壳可启动。

### 5.2 当前未能证明稳定可用的主路径

- 首次启动 -> 配置 BYOK -> 导入 PDF -> 解析 -> 嵌入 -> 自动生成卡片
- 文档库 -> 阅读器 -> 贴笺互跳 -> 返回首页
- 文档选择 -> 知识问答 -> 引用回答
- 卡片 -> 动画生成 -> 预览真实视频
- 文档 -> 播客脚本 -> 音频生成 -> 播放
- 真实 OpenAI / Anthropic provider 下的完整工作流

## 6. 高优先级问题清单

### P0 级

1. 首页 e2e `page.goto('/')` 超时，最基础用户入口不稳定。
2. 阅读器 e2e 全线失败，无法作为文档-卡片闭环的回归基线。
3. 性能 smoke 已失效，当前无法得出任何性能结论。

### P1 级

4. `useDocumentImport` 在卡片生成失败时的用户提示退化，用户不知道该去哪处理。
5. `ReaderPage` 出现硬编码颜色，破坏单主题设计约束。
6. 设置页、首页、卡片工坊的结构与既有验收和测试标准明显脱节。

### P2 级

7. Python orchestration service 缺少 8 个关键依赖，真实高级能力无法落地验证。
8. BYOK 兼容声明存在，但 Anthropic 真实链路在当前环境下不可证实。

### P3 级

9. 动画系统与目标产品要求不一致，目前是 Framer Motion 脚本，不是高质量视频生成。
10. 构建产物过大，性能 smoke 即使修复选择器后仍可能继续暴露响应问题。

## 7. 根因归类

本轮问题可以归为四类：

### 7.1 测试契约漂移

- 设置页、首页、卡片工坊的文案和 DOM 结构已变化，但 e2e/单测未同步。
- 这类问题比例不小，说明开发中“页面改了，但验收锚点没维护”。

### 7.2 真实产品回归

- 阅读器主题 token 违规。
- 导入失败提示变弱。
- 首页加载/阅读器流不稳定。

### 7.3 高级能力依赖未闭合

- Python side 缺少 Anthropic、docling、导出、TTS 等依赖。
- 导致播客、知识问答、导出、解析增强都难以做真实链路验证。

### 7.4 目标能力与当前实现方向不一致

- 动画目标是“高质量演示视频”，当前实现是“前端动画脚本”。
- 这不是 bug，而是产品实现层级不够。

## 8. 最终评估

从“继续开发”的角度看，项目不是不可救，但现在不能直接把重心放在新功能扩张上。

当前最合理的判断是：

- 该项目已经具备“中后期产品雏形”，不是早期 Demo。
- 但测试基线、页面契约、阅读器主路径和真实编排依赖还不够稳。
- 若继续直接叠加新功能，后续每个新能力都会落在不稳定底座上。

因此建议下一步优先顺序不是“新增功能”，而是：

1. 恢复稳定的测试基线。
2. 修复导入-阅读器-卡片-复习主闭环。
3. 补齐 Python/BYOK 真实依赖。
