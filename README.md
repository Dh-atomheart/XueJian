# 学笺 (XueJian)

本仓库是一个本地优先的桌面学习应用，围绕“文档导入 -> 知识处理 -> 卡片生成 -> 阅读学习 -> 播客生成 -> BYOK 配置”构建工作流。

## 文档入口

- 项目总览与前端扩展：[docs/frontend-system-extension.md](./docs/frontend-system-extension.md)
- BYOK 体系：[docs/byok-system.md](./docs/byok-system.md)
- 播客工作流规范：[docs/podcast-generation-workflow.md](./docs/podcast-generation-workflow.md)
- 卡片系统规范：[docs/card-system-v2.md](./docs/card-system-v2.md)
- 知识图谱规范：[docs/knowledge-graph-system.md](./docs/knowledge-graph-system.md)
- 历史总规范，仅作参考：[docs/archive/spec.md](./docs/archive/spec.md)

## 当前技术栈

- 前端：React 19、TypeScript、Vite、Tailwind CSS、TanStack Query、Zustand、Zod
- 桌面宿主：Tauri 2、Rust、SQLite、Stronghold
- 编排层：Python orchestration service
- AI 工作流：当前实现以 LangChain 线性编排为主；LangGraph 保留为后续长任务增强路径

## 核心架构边界

- `Rust Host` 负责 SQLite、Stronghold、文件系统、预算、工作流事件与受控工具边界
- `Python Orchestration Service` 负责 AI 编排、检索、结构化输出、TTS 调用与阶段推进
- `React` 负责提交请求、消费状态、展示审阅与播放界面

## 开发命令

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
├── examples/
└── xuejian/
    ├── src/
    ├── src-tauri/
    ├── orchestration_service/
    └── tests/
```

## 许可

GPL v3，详见 [LICENSE](./LICENSE)。
