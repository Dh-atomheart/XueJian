# M06 Backlog

记录 M06 加固阶段发现、但不阻断进入 MVP-1 的问题。

## 当前已知项

### 1. 复习页积分仍为占位值

- 位置：`xuejian/src/features/review/ReviewPage.tsx`
- 现状：`todayPoints` 仍固定传入 `0`
- 影响：不影响 MVP-0 的每日复习闭环，但会让页头积分信息缺少真实数据
- 建议：后续在积分/统计里程碑中接入真实查询，再恢复动态展示

### 2. 遗留学习命令仍保留在旧模块

- 位置：`xuejian/src-tauri/src/commands/cards.rs`
- 现状：`list_due_cards`、`create_review_log`、`get_daily_stats` 等历史命令仍保留
- 影响：不会阻断 MVP-0 主闭环，但会增加后续维护成本，并可能让新旧学习路径并存
- 建议：在进入 MVP-1 前后统一梳理命令注册面，明确哪些保留，哪些冻结

### 3. 原生 PDF 导入 smoke 仍需 Tauri 实机验收

- 位置：`xuejian/tests/e2e/` 与桌面端人工验收流程
- 现状：Playwright 运行在 Vite preview 下，无法覆盖系统文件选择器与真实 Tauri 导入链路
- 影响：自动化已覆盖导航、复习和冻结入口，但“本地文件导入 → 真实命令 → SQLite 写入”仍需桌面端 smoke
- 建议：保留一次 Tauri 手工验收，确认 PDF 导入、建卡、启用分组、复习反馈、`study_events` 写入完整跑通

### 4. 前端产物体积仍有构建警告

- 位置：前端生产构建输出
- 现状：Vite 构建会提示部分 chunk 超过 500 kB
- 影响：当前不阻断 MVP-0 gate，但后续需要关注启动速度与首屏体积
- 建议：在 MVP-1 引入更多能力前评估按功能拆 chunk
