# XueJian

![Visitors](https://visitor-badge.laobi.icu/badge?page_id=Dh-atomheart.XueJian)
![GitHub stars](https://img.shields.io/github/stars/Dh-atomheart/XueJian?style=flat-square)
![GitHub forks](https://img.shields.io/github/forks/Dh-atomheart/XueJian?style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/Dh-atomheart/XueJian?style=flat-square)
![License](https://img.shields.io/github/license/Dh-atomheart/XueJian?style=flat-square)

XueJian 是一款本地优先的 PDF 学习闪卡桌面应用。它围绕“资料导入 -> 阅读加工 -> 卡片生成 -> 分组管理 -> 间隔复习 -> 学习反馈 -> 知识问答”的学习闭环，把 PDF 中的知识沉淀为可管理、可复习、可追踪的学习资产。

项目当前以桌面端为主，优先保证本地数据、文档解析、卡片系统和复习流程稳定；AI 能力作为辅助生产工具，用于降低制卡和问答成本。

## 核心能力

- 文档库：导入 PDF，并将文件复制到应用本地数据目录。
- 文档解析：使用 PyMuPDF 解析可复制文本 PDF，并保留页码、文本片段和来源信息。
- 阅读器：基于 `pdfjs-dist` 构建桌面阅读体验，支持阅读时联动相关卡片。
- 卡片系统：创建、编辑、分组和管理 Basic 学习卡片，支持 Markdown 和 KaTeX。
- AI 制卡：通过 BYOK Provider 从文档内容生成中文学习卡片。
- 间隔复习：按启用分组生成每日复习队列，使用四档反馈完成学习记录。
- 知识问答：基于已解析和向量化的文档进行学习型问答，并展示可追溯来源。

## 技术栈

- 桌面端：Tauri 2
- 前端：React 19、TypeScript、Vite、Tailwind CSS、TanStack Query、Zustand
- 本地层：Rust、SQLite、Stronghold、Tauri commands
- 编排服务：Python orchestration sidecar、本地 HTTP、BackgroundJob
- AI 与解析：LiteLLM、Pydantic、PyMuPDF、Docling
- 测试：Vitest、Playwright、Cargo tests、native smoke

## 快速开始

### 环境要求

- Node.js 与 npm
- Rust 与 Cargo
- Python 3
- Tauri CLI

Python 编排服务依赖见 `xuejian/orchestration_service/requirements.txt`。

### 安装依赖

```powershell
cd xuejian
npm install
pip install -r orchestration_service/requirements.txt
```

### 前端开发预览

```powershell
cd xuejian
npm run dev
```

前端开发服务默认用于 Web 预览。完整桌面能力需要通过 Tauri 启动。

### 桌面端开发

```powershell
cd xuejian
npm run tauri:dev
```

Tauri 启动后会初始化本地数据库、密钥存储、Host Gateway 和 Python orchestration service。

### 构建与测试

```powershell
cd xuejian
npm run build
npm run test
npm run test:e2e
npm run tauri:build
```

Rust native smoke：

```powershell
cd xuejian
cargo run --manifest-path src-tauri/Cargo.toml --bin native-smoke
```

## 项目结构

```text
XueJianProject/
├─ README.md
├─ LICENSE
├─ documents/                 # 面向发布读者的用户与开发者文档
├─ docs/                      # 内部工程文档、架构契约和路线文档
├─ scripts/                   # CI 与辅助脚本
├─ runtime/                   # 运行时和 smoke 产物
└─ xuejian/
   ├─ src/                    # React 前端
   ├─ src-tauri/              # Tauri/Rust 本地层
   ├─ orchestration_service/  # Python 编排服务
   └─ tests/                  # 单测、服务测试和 E2E
```

## 文档

- [发布文档入口](./documents/index.md)
- [用户手册](./documents/user-guide.md)
- [开发者指南](./documents/developer-guide.md)
- [内部工程文档入口](./docs/index.md)

`documents/` 面向普通用户、安装者、贡献者和二次开发者；`docs/` 面向项目开发路线、架构边界、工程契约和后续 AI agent 协作。

## 功能状态与限制

当前主线优先稳定 PDF、卡片、分组、复习和学习反馈。AI 卡片生成、文档向量化和知识问答已经接入本地编排服务，但外部模型能力依赖用户自己的 Provider 配置。

以下能力不作为当前主线交付目标：

- 扫描版 PDF OCR。
- 多设备同步和账户系统。
- 完整播客音频生成。
- 动画演示生成。
- 完整 Anki note/card type 系统。
- 云端存储。

## 数据与隐私

XueJian 采用本地优先架构。业务数据以本机 SQLite 为权威来源，API Key 使用 Tauri Stronghold 存储。Python orchestration service 只负责解析和 AI workflow 执行，不直接写 SQLite，也不持久化 API Key。

只有当用户配置并主动使用 AI Provider 时，应用才会向外部模型服务发送相关请求。

## 许可证

本项目按 GPL v3 发布，详见 [LICENSE](./LICENSE)。

发布前请注意：当前 `xuejian/src-tauri/Cargo.toml` 的许可证元数据仍写为 `MIT`，需要与根目录 `LICENSE` 的 GPL v3 保持一致。
