# UI-03：共享组件与状态表达收敛

## 目标

统一 UI primitives 和主状态模式，避免每个页面各自实现 loading、empty、error 和长任务反馈。

## 所属阶段

UI 改造路线，组件基础设施。

## 相对工作量

M。

## 前置条件

- UI-02 完成。
- light/dark/system token 可用。
- 组件规则以 `docs/ui.md` 和详细手册为准。

## 交付内容

- 统一 Button、IconButton、Tooltip、Dialog、Drawer、Tabs、Input、Select、Toast、Skeleton、Empty、Error。
- 图标按钮统一使用 lucide-react，并具备 `aria-label` 或 Tooltip。
- Dialog、Select、Tabs、Tooltip、Drawer 优先使用 Radix。
- 建立统一 Background Job 状态展示：queued、running、succeeded、failed、cancelled、cancellable。
- 建立 Source Quote Block、Card Preview、Review Feedback Buttons 的 MVP 组件形态。
- 明确组件放置策略：通用组件向 `shared/ui` 或当前等价 UI 目录收敛；领域组件留在对应模块。

## 任务分配

### Frontend

- 审计现有通用 UI 组件，决定 reuse/adapt/replace。
- 补齐统一 empty、error、skeleton、toast 状态组件。
- 收敛图标按钮和 tooltip 规则。
- 建立业务基础组件：Source Quote、Card Preview、Review Feedback。
- 建立 Background Job 状态展示组件或等价统一模式。

### Rust/Tauri

- 无新增 API；复用现有 BackgroundJob 状态。

### Python orchestration

- 无新增任务。

### Data/Schema

- 无新增任务。

### Tests

- Button/IconButton 状态测试。
- Tooltip/Dialog/Toast 行为测试。
- A11y label 测试。
- BackgroundJob 状态展示测试。
- Source Quote、Card Preview、Review Feedback 渲染测试。

## 不做什么

- 不一次性迁移所有历史组件。
- 不改变业务 gateway 契约。
- 不实现 VNext 导出、同步、多标签 Reader。
- 不把领域对象直接塞进通用组件 props。

## 验收场景

- 所有主页面具备 loading、empty、error 的统一表达。
- 图标按钮无裸按钮。
- 删除、取消等危险动作有影响说明。
- 长任务有可理解状态，不只显示 spinner。

## 风险与回退

- 组件迁移范围膨胀：先提供统一组件和新页面使用规则，历史组件按页面打磨逐步替换。
- A11y 缺口较多：优先修图标按钮、Dialog、Select、Tabs。

## 完成后解锁

UI-04：MVP 学习闭环页面打磨。
