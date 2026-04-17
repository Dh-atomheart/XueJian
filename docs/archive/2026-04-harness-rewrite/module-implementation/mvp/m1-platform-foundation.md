# M1 平台基础模块实施计划

## 模块定位

- `Module ID`: `M1`
- `Stage`: `MVP`
- `Priority`: `P0`
- `Spec Reference`: `spec.md` §2.2.1、§3.1.3、§6.2
- `Depends On`: 无
- `Blocks`: `M2`、`M3`、`M4`、`M5`、`M6`、`V4-2`

## 交付目标

- 建立 `Tauri 2 + React 19 + TypeScript + Rust Host` 的可运行桌面骨架
- 建立 SQLite、Stronghold、命令桥、Repository、基础任务能力与 `Python Orchestration Service` 启动管理
- 明确 `TanStack Query / Zustand / idb / SQLite` 的职责边界并落地到代码目录
- 在 MVP 阶段同步落地默认设计系统、桌面壳层和基础视觉规范

## Done Means

- 应用可启动、可构建、可通过基础 lint
- SQLite、FTS5、Stronghold、Host gateway 与 Python 服务健康检查均可正常工作
- 默认主题 Token、字体槽位、纸感纹理和桌面壳层落地完成

## 前置条件

- 已确认桌面端采用 `Tauri 2 + React 19 + Rust Host`
- AI 编排架构以 `Python Orchestration Service + LangChain now / LangGraph later` 为准
- 已锁定默认视觉基线为“极简学术感 + 中度手绘漫画风格”

## 交付物

- 代码层：应用骨架、数据库初始化、命令桥、Host gateway、Python 服务启动与健康检查
- UI层：默认主题 Token、基础 primitives、桌面壳层、局部 UI store
- 数据层：SQLite 初始化、迁移、FTS5、基础仓库、`WorkflowRun` / `WorkflowCheckpoint` 基础模型
- 测试层：数据层、主题层、Host-Service 协议层基础测试、浏览器层 Playwright E2E
- 文档层：依赖说明、目录说明、后续模块复用约定

## 一级任务映射

| 一级任务 | 内容 |
| --- | --- |
| `M1-T1` | 项目初始化 |
| `M1-T2` | 配置设计系统基础设施 |
| `M1-T3` | 建立默认设计Token与视觉基线 |
| `M1-T4` | SQLite数据库初始化 |
| `M1-T5` | 数据库迁移脚本实现 |
| `M1-T6` | FTS5全文索引配置 |
| `M1-T7` | Stronghold密钥存储封装 |
| `M1-T8` | 基础Repository层实现 |
| `M1-T9` | Tauri命令桥接与Host Gateway |
| `M1-T10` | 前端服务层封装 |
| `M1-T11` | Python服务启动与生命周期管理 |

## 实施级子任务

| 一级任务 | 子任务 | 说明 |
| --- | --- | --- |
| `M1-T1` | `M1-T1.1` 初始化 `xuejian/` 与 `src-tauri/`；`M1-T1.2` 校验 `dev/build/lint` 基础命令 | 保证工程骨架可运行 |
| `M1-T2` | `M1-T2.1` 建立 `design-system/` 与 `components/primitives/`；`M1-T2.2` 接入 Tailwind + Radix 约定 | 为后续模块提供稳定基础控件 |
| `M1-T3` | `M1-T3.1` 定义颜色/字体/纹理 Token；`M1-T3.2` 落地 `AppShell`、`SidebarRail`、`TopBar` | 默认视觉不等待 V4 |
| `M1-T4` | `M1-T4.1` 建立连接管理与数据库路径；`M1-T4.2` 验证首次启动自动建库 | SQLite 为唯一真源 |
| `M1-T5` | `M1-T5.1` 定义迁移版本约定；`M1-T5.2` 写首批迁移和回滚策略 | 防止 schema 演进失控 |
| `M1-T6` | `M1-T6.1` 建立 FTS5 表；`M1-T6.2` 验证中文检索与索引更新 | 为后续 RAG 打基础 |
| `M1-T7` | `M1-T7.1` 封装 Stronghold 读写接口；`M1-T7.2` 定义删除与迁移行为 | 禁止明文密钥入库 |
| `M1-T8` | `M1-T8.1` 建立仓库接口与 DTO；`M1-T8.2` 为 document/card/stats/workflow 提供基础 repo | 后续模块统一依赖 |
| `M1-T9` | `M1-T9.1` 定义 `ModelGateway` / `ToolGateway` 命令边界；`M1-T9.2` 统一 Host 侧错误返回格式与 camelCase IPC 契约 | Host 保持受控能力边界 |
| `M1-T10` | `M1-T10.1` 定义前端 gateway 调用封装与 `Zod` 校验；`M1-T10.2` 固定 `Query = IPC state / Zustand = UI state / idb = cache` | 避免 UI 直接调用 `invoke` |
| `M1-T11` | `M1-T11.1` 启动 Python 服务并做健康检查；`M1-T11.2` 定义退出、重连、异常回收和版本握手 | 为后续工作流复用运行边界 |

## 计划改动路径

- `xuejian/src-tauri/src/commands/`
- `xuejian/src-tauri/src/db/`
- `xuejian/src-tauri/src/secrets/`
- `xuejian/src-tauri/src/gateway/`
- `xuejian/src-tauri/src/tasks/`
- `xuejian/src/design-system/`
- `xuejian/src/components/primitives/`
- `xuejian/src/components/shell/`
- `xuejian/src/services/gateway/`
- `xuejian/src/assets/fonts/`
- `xuejian/src/assets/textures/`

## 接口与数据契约

- 共享业务类型：`ApiConfig`、`WorkflowRun`、`WorkflowCheckpoint`、`WorkflowEvent`
- 共享视觉类型：`ThemeTokens`、`SketchStyle`、`SurfaceVariant`、`PageShellVariant`
- Host 协议约定：
  - 前端只通过 gateway 访问 Rust Host
  - Python 服务只通过 `Orchestration Protocol` 访问 Host 暴露的受控能力
  - Host 保持对数据库写入、预算、密钥和文件落盘的最终边界
- 模块内部实施类型：
  - `GatewayError`
  - `MigrationStep`
  - `ThemeAssetManifest`
  - `ServiceHealthStatus`

## 数据流 / 交互流

1. 应用启动
2. 初始化数据库、执行迁移、加载默认主题和字体资源
3. 初始化 Stronghold、基础仓库和 Host gateway
4. 启动 Python 服务、执行健康检查与版本握手
5. 前端通过 gateway 拉取设置、模型、最近任务和基础状态
6. 后续模块复用相同壳层、相同仓库、相同 Host-Service 协议

## 异常与边界

- 不允许把 IndexedDB 作为主数据库
- 不允许前端直接调用未暴露的 Tauri 命令
- 不允许在页面级硬编码主题常量绕过设计系统
- 数据库初始化失败时必须阻止后续业务模块继续执行
- Stronghold 不可用时必须给出明确错误，不回退到明文存储
- Python 服务不持有明文密钥，不直接作为 SQLite 真源

## 测试矩阵

- 单元：迁移、FTS5、Stronghold、gateway、Zod schema、ThemeTokens、Shell 结构
- 集成：首次启动建库、命令桥到仓库链路、默认主题加载链路、Python 服务健康检查
- E2E：Playwright 浏览器层烟雾测试；Tauri WebDriver 待桌面专属流程出现后补入
- 恢复性检查：服务异常退出、重连、版本不匹配、Host 拒绝调用
- 视觉验收：首页壳层、按钮、输入框、分隔线不退回模板风

## 验收清单

- [x] `M1-T1` ~ `M1-T11` 对应实现路径已建立
- [x] `M1-T*.1 / *.2` 子任务完成
- [x] SQLite / FTS5 / Stronghold / Host gateway / Python 服务可用
- [x] 默认视觉系统落地且可被后续模块复用
- [x] 基础测试通过并可支撑 `M2` 与 `M3` 开发

> 说明：浏览器层 E2E 用例与 Playwright 配置已接入；若本机尚未安装浏览器二进制，首次执行 `npm run test:e2e` 前需运行 `npx playwright install chromium`。
