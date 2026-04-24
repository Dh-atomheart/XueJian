# xuejian frontend

这是学笺的主前端工程，负责桌面端 UI、页面状态、查询层、Reader 交互和各知识加工工作流的可视化承载。

## 技术栈

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Zustand
- Tauri 2

## 设计约束

- 以 `examples/sample of design code/b_UWqxn1dtBzw` 为高保真视觉参考
- 保持单壳层应用结构，不迁移到 Next.js
- 业务数据仍走现有 `queries/`、`services/gateway/`、`store/`
- 保留稳定测试锚点：`app-shell`、`app-shell-page-title`、`sidebar-nav-*`

## 常用命令

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`

## 关键目录

- `src/components/shell/`: 应用壳层
- `src/features/`: 页面级业务模块
- `src/components/ui/`: 通用 UI 组件
- `src/queries/`: React Query hooks
- `src/services/gateway/`: 前后端桥接
- `tests/`: 单测与 E2E
