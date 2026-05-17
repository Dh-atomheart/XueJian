# XueJian / 学笺

![Visitors](https://visitor-badge.laobi.icu/badge?page_id=Dh-atomheart.XueJian)
![GitHub stars](https://img.shields.io/github/stars/Dh-atomheart/XueJian?style=flat-square)
![GitHub forks](https://img.shields.io/github/forks/Dh-atomheart/XueJian?style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/Dh-atomheart/XueJian?style=flat-square)
![License](https://img.shields.io/github/license/Dh-atomheart/XueJian?style=flat-square)

学笺是一个本地优先的 AI 学习工作台，目标是把 PDF 资料转化为可追踪、可复习、可问答的学习资产。

它不是一个只做摘要或聊天的工具，而是围绕学习闭环设计：导入资料、解析内容、生成或手动创建卡片、按分组复习、记录反馈，并在需要时通过 Agentic RAG 和多 Agent workflow 帮助用户理解资料、追溯证据和生成复习材料。

## 核心能力

- **PDF 导入、解析与阅读**：将可复制文本的 PDF 导入本地文档库，解析为后续卡片、问答和来源追踪可用的文本片段。
- **手动与 AI 卡片生成**：用户可以手动创建卡片，也可以让 AI 从文档证据中生成候选卡片，并保留来源信息。
- **分组管理与每日复习**：以卡片和分组为学习资产核心，结合复习队列、四档反馈和学习记录形成长期记忆流程。
- **Knowledge QA / Agentic RAG**：围绕已解析和向量化的资料进行学习型问答，支持检索、重写、rerank、相关性门控、上下文打包和引用审计。
- **多 Agent 学习任务编排**：通过 `KnowledgeGraph`、`CardGraph`、`StudyGraph` 和 `SupervisorGraph` 组织复合学习任务，例如先理解资料，再生成卡片或学习建议。
- **BYOK 与本地优先隐私边界**：用户自行配置 Provider 和 API Key；未配置模型时，仍可使用本地文档管理、手动建卡和复习能力。

## 设计内涵

学笺的重点不是堆叠 AI 功能，而是把 AI 能力放进可维护、可评估、可恢复的学习系统里。

- **本地优先的数据权威**：Rust/Tauri host 和 SQLite 是业务数据权威。前端负责交互，Python orchestration sidecar 负责解析、模型调用和 workflow 编排，但不直接拥有最终业务状态。
- **可追溯的学习资产**：PDF、文本片段、卡片、引用、分组和复习记录不是孤立对象，而是共同组成可回看、可编辑、可复习的知识资产。
- **可观测的 Agentic RAG**：Knowledge QA 不被实现成黑盒 chain，而是拆成 query rewrite、retrieval、rerank、relevance gate、context packing、answer generation、citation audit 和 RAG trace 等步骤，便于定位质量问题。
- **Schema-first Tool Calling**：工具调用通过 Pydantic schema、权限边界、错误分类和 `allowed_callers` 管理，避免 Agent 随意调用高风险能力。
- **Evaluation-driven 质量闭环**：Ragas、citation audit、golden tasks 和回归门禁共同用于发现检索、引用、生成和调度中的退化问题。

## 系统架构

```text
React / Tauri WebView
  -> Rust / Tauri Host
  -> SQLite / Stronghold / BackgroundJob / Host Gateway
  -> Python Orchestration Sidecar
  -> LangGraph / RAG / Provider Adapters / Evals
```

核心边界：

- React 前端负责页面、交互、查询状态和用户反馈。
- Rust/Tauri host 负责 Tauri commands、SQLite、迁移、后台任务、Stronghold 密钥存储和 host gateway。
- Python orchestration sidecar 负责 PDF 解析、LangGraph workflow、Provider adapter、RAG、卡片生成和评估。
- Python 不直接读写应用 SQLite，不持久化 API Key；需要持久化的业务结果通过 Rust/Host Gateway 受控写入。

## 快速开始

前置依赖：

- Node.js 和 npm
- Rust 和 Cargo
- Python 3
- Tauri CLI

安装依赖：

```powershell
cd xuejian
npm install
pip install -r orchestration_service/requirements.txt
```

运行 Web 预览：

```powershell
cd xuejian
npm run dev
```

运行完整桌面应用开发模式：

```powershell
cd xuejian
npm run tauri:dev
```

`npm run dev` 只启动 Vite Web 预览；完整的本地数据库、文件导入、密钥存储和 Python 编排服务需要通过 Tauri 启动。

AI 能力采用 BYOK 模式。用户需要在应用设置中配置自己的 Provider 和 API Key 后，才能使用 AI 制卡、embedding、Knowledge QA 或多 Agent workflow。未配置 API Key 时，学笺仍可用于本地文档管理、手动卡片和每日复习。

## 常用开发命令

```powershell
cd xuejian
npm run build
npm run test
npm run test:e2e
cargo check --manifest-path src-tauri/Cargo.toml
```

Python orchestration compile check 可从仓库根目录运行：

```powershell
python -m compileall xuejian/orchestration_service
```

## 仓库结构

```text
XueJianProject/
|-- README.md
|-- LICENSE
|-- documents/                  # 面向用户和开发者的发布文档
|-- scripts/                    # 仓库级 CI 和维护脚本
|-- archive/                    # 已归档或废弃的历史资料
`-- xuejian/
    |-- src/                    # React 前端
    |-- src-tauri/              # Tauri/Rust desktop host
    |-- orchestration_service/  # Python orchestration sidecar
    |-- tests/                  # 单测、服务测试和 E2E 测试
    `-- scripts/                # 应用工作区脚本
```

根目录 README 负责项目总览和入口导航；活跃应用代码位于 [`xuejian/`](./xuejian/)，应用工作区的更多约定见 [`xuejian/README.md`](./xuejian/README.md)。

## 阅读路线

- 用户上手：[`documents/user-guide.md`](./documents/user-guide.md)
- 开发者指南：[`documents/developer-guide.md`](./documents/developer-guide.md)

## 未来愿景

当前主线聚焦 PDF 学习、卡片、复习、Knowledge QA 和多 Agent 学习编排。
OCR、云同步、完整导出、播客、UI美化等会作为未来的开发愿景。

## License

GPL-3.0-or-later. See [LICENSE](./LICENSE).
