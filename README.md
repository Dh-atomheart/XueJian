# 学笺（XueJian）

学笺是一个本地优先的桌面学习应用，围绕“资料导入 -> 阅读加工 -> 卡片生成 -> 间隔复习 -> 知识问答/图谱 -> 播客生成”构建完整学习闭环。

## 当前前端方向

- 前端主项目位于 `xuejian/`
- 设计基线对齐 `examples/sample of design code/b_UWqxn1dtBzw`
- 运行时继续使用 `Vite + React + TypeScript + TanStack Query + Zustand + Tauri`
- 界面风格统一为暖白、低噪音、桌面优先的工作台体验

## 主要文档

- 前端体验总览：[docs/frontend-system-extension.md](./docs/frontend-system-extension.md)
- 交互与页面规划：[docs/design/00-user-journey-gui-planning.md](./docs/design/00-user-journey-gui-planning.md)
- 页面设计文档：`docs/design/01-09`
- BYOK 体系：[docs/byok-system.md](./docs/byok-system.md)
- 卡片系统：[docs/card-system-v2.md](./docs/card-system-v2.md)
- 知识图谱：[docs/knowledge-graph-system.md](./docs/knowledge-graph-system.md)
- 播客流程：[docs/podcast-generation-workflow.md](./docs/podcast-generation-workflow.md)

## 开发命令

- 安装：`cd xuejian && npm install`
- 前端开发：`cd xuejian && npm run dev`
- 前端构建：`cd xuejian && npm run build`
- Lint：`cd xuejian && npm run lint`
- 单测：`cd xuejian && npm run test`
- E2E：`cd xuejian && npm run test:e2e`
- Tauri 开发：`cd xuejian && npm run tauri:dev`

## 仓库结构

```text
XueJianProject/
├─ docs/
├─ examples/
└─ xuejian/
   ├─ src/
   ├─ src-tauri/
   ├─ orchestration_service/
   └─ tests/
```

## License

GPL v3，详见 [LICENSE](./LICENSE)。
