# 学笺 (XueJian)

> 上传文档，一键生成卡片，卡片贴在原文旁边，像在书里贴便签一样学习。

学笺是一个本地优先的桌面学习应用，围绕“文档导入 -> 卡片生成 -> 贴笺阅读 -> FSRS 复习 -> BYOK 配置”构建完整学习闭环。

## 文档入口

- 产品规格：[docs/product-specs/index.md](./docs/product-specs/index.md)
- 设计系统：[docs/design-docs/README.md](./docs/design-docs/README.md)
- 项目总规范：[docs/spec.md](./docs/spec.md)

## MVP 目标闭环

- 文档上传与 PDF 解析
- LLM 卡片生成与候选确认
- 卡片管理与导出
- 阅读页原文/卡片双向联动
- FSRS 学习调度与学习反馈
- BYOK 模型配置与连接测试

## 当前已落地的技术栈

### 前端

| 技术 | 用途 |
| --- | --- |
| React 19 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Tailwind CSS | 样式框架 |
| Radix Primitives | 无样式组件基础 |
| TanStack Query | IPC / 异步数据缓存 |
| TanStack Virtual | 虚拟滚动 |
| Zustand | 局部 UI 状态 |
| Zod | IPC 与结构化输出运行时校验 |
| idb | 派生缓存层 |
| ts-fsrs | 间隔重复算法 |

### 后端

| 技术 | 用途 |
| --- | --- |
| Tauri 2.0 | 桌面应用框架 |
| Rust | 核心服务层 |
| SQLite + FTS5 | 主数据库与全文检索 |
| Stronghold | 密钥安全存储 |

### AI 集成

| 技术 | 用途 |
| --- | --- |
| OpenAI SDK | OpenAI API 调用 |
| Anthropic SDK | Anthropic API 调用 |
| Python Orchestration Service | 预设工作流编排 |

### 已确认的架构决策

- `Rust Host` 持有 SQLite、Stronghold、文件系统、预算与受控工具边界。
- `Python Orchestration Service` 是当前正式 AI 编排目标架构。
- `LangChain` 是当前唯一正式工作流框架，`LangGraph` 仅保留为未来升级路径。
- `RAG` 保持简单形态：`MVP = FTS5`，`V2 = sqlite-vec + FTS5` 混合检索。
- `TanStack Query = IPC / server-style state`，`Zustand = UI state`，`SQLite = source of truth`，`idb = cache`。

## 快速开始

- 安装：`cd xuejian && npm install`
- 前端开发：`cd xuejian && npm run dev`
- 前端构建：`cd xuejian && npm run build`
- Lint：`cd xuejian && npm run lint`
- 单元测试：`cd xuejian && npm run test`
- E2E：`cd xuejian && npm run test:e2e`
- Tauri 开发：`cd xuejian && npm run tauri:dev`
- Tauri 构建：`cd xuejian && npm run tauri:build`
- Rust 测试：`cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## 仓库结构

```text
XueJianProject/
├── docs/
│   ├── design-docs/
│   ├── product-specs/
│   ├── references/
│   └── archive/
├── examples/
└── xuejian/
    ├── src/
    ├── src-tauri/
    ├── tests/
    └── package.json
```

## 许可

本项目采用 GPL v3 许可证，详见 [LICENSE](./LICENSE)。
