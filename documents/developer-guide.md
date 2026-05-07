# XueJian 开发者指南

本文面向贡献者、二次开发者和维护者，说明 XueJian 的本地开发环境、仓库结构、架构边界、常用命令和贡献约定。

## 仓库结构

```text
XueJianProject/
├─ README.md
├─ LICENSE
├─ documents/                 # 发布文档
├─ docs/                      # 内部工程文档和路线契约
├─ scripts/                   # CI 与辅助脚本
└─ xuejian/
   ├─ src/                    # React 前端
   ├─ src-tauri/              # Tauri/Rust 本地层
   ├─ orchestration_service/  # Python orchestration sidecar
   └─ tests/                  # 单测、服务测试和 E2E
```

关键目录：

- `xuejian/src`：页面、组件、query、gateway、状态管理和设计系统。
- `xuejian/src-tauri`：Tauri 配置、Rust commands、SQLite 仓储、迁移、Stronghold 和后台任务。
- `xuejian/orchestration_service`：Python HTTP 服务、Provider adapter、文档解析、卡片生成、embedding 和知识问答 workflow。
- `docs`：项目路线、架构、数据库、IPC、后台任务、复习调度和 AI workflow 的内部权威文档。
- `documents`：面向发布读者的用户手册和开发者指南。

## 环境要求

- Node.js 与 npm。
- Rust 与 Cargo。
- Python 3。
- Tauri CLI。
- Python requirements：

```powershell
cd xuejian
pip install -r orchestration_service/requirements.txt
```

Python 编排服务会使用 LiteLLM、Pydantic、PyMuPDF、Docling、LangChain 相关包和 Provider SDK。实际 AI workflow 还需要用户配置对应 Provider 的 API Key。

## 常用命令

安装前端依赖：

```powershell
cd xuejian
npm install
```

前端开发预览：

```powershell
cd xuejian
npm run dev
```

桌面端开发：

```powershell
cd xuejian
npm run tauri:dev
```

构建：

```powershell
cd xuejian
npm run build
npm run tauri:build
```

测试：

```powershell
cd xuejian
npm run test
npm run test:e2e
```

Rust native smoke：

```powershell
cd xuejian
cargo run --manifest-path src-tauri/Cargo.toml --bin native-smoke
```

## 架构边界

XueJian 使用三层本地架构：

```text
React / Tauri WebView
  -> Tauri commands / gateway client
Rust / Tauri host
  -> SQLite / Stronghold / BackgroundJob / host gateway
Python orchestration sidecar
  -> PDF parsing / AI workflow / Provider adapter
```

约束：

- 前端页面组件不要直接调用 Tauri `invoke`，应通过 query、mutation 或 gateway 层访问本地能力。
- Rust/SQLite 是唯一数据权威，业务状态最终以 SQLite 为准。
- Rust 负责 Tauri commands、数据库迁移、后台任务、密钥读取、Host Gateway 和持久化写入。
- Python 只执行解析、AI 调用、结构化校验和 workflow 编排。
- Python 不直接读写应用 SQLite。
- Python 不持久化 API Key，不把明文密钥写入日志、任务 payload 或错误信息。
- API Key 存在 Stronghold，Rust 只在 workflow 执行时短时注入。

更详细的边界以 `docs/architecture.md`、`docs/ipc-api.md` 和 `docs/background-jobs.md` 为准。

## 长任务模型

所有耗时任务应进入 BackgroundJob 或 workflow run，而不是阻塞 UI：

- PDF 解析。
- Docling 增强解析。
- AI 卡片生成。
- 文档 embedding。
- 知识问答。
- 后续播客、TTS 或导出类任务。

任务至少应能表达 queued、running、succeeded、failed、cancelled 等状态，并提供可展示的进度和错误信息。

## 测试策略

推荐按改动范围选择测试：

- 前端组件和 hook：Vitest + Testing Library。
- query、gateway 和状态逻辑：`tests/services`、`tests/store`、`tests/unit`。
- 端到端流程：Playwright。
- Rust 数据层、commands 和 native smoke：Cargo tests 与 `native-smoke`。
- Python workflow：`tests/unit/test_*` 中的 Python 单测。

发布前至少应运行：

```powershell
cd xuejian
npm run build
npm run test
```

涉及阅读器、导入、复习或桌面交互时，还应运行相关 Playwright 或 native smoke。

## 贡献约定

- 先阅读 `docs/index.md`，再按任务类型进入对应内部工程文档。
- 产品边界和 MVP 范围以 `docs/spec.md` 为准。
- 跨层职责、数据权威、密钥流转和长任务边界以 `docs/architecture.md` 为准。
- Tauri commands、DTO、gateway 和错误模型以 `docs/ipc-api.md` 为准。
- 数据库字段、索引、关系和迁移策略以 `docs/database-baseline.md` 为准。
- 复习调度以 `docs/review-scheduler.md` 为准。
- AI 卡片生成以 `docs/ai-card-generation.md` 为准。

不要把冻结功能重新扩入 MVP 主线。Podcast、animation、points、APKG/export、annotated PDF export 等历史资产需要按路线审计后再决定是否解冻。

## 发布前注意

根目录 `LICENSE` 是 GPL v3。当前 `xuejian/src-tauri/Cargo.toml` 的 `license` 字段仍写为 `MIT`，发布前需要同步为与根许可证一致的元数据。
