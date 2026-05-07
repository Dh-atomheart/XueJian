# M01：范围收敛与 AppShell 基线

## 目标

冻结超前功能入口，收敛主导航，建立 MVP 主线 AppShell 和页面占位，让后续功能只围绕 `首页 / 文档 / 卡片 / 学习 / 设置` 展开。

## 所属 MVP

MVP-0。

## 相对工作量

S。

## 前置条件

- 已阅读 `docs/spec.md`、`docs/ui.md`、`docs/mvps/mvp-0.md`。
- 明确冻结模块不进入主导航和验收目标。

## 交付内容

- 主导航只保留：首页 / 文档 / 卡片 / 学习 / 设置。
- 隐藏 `knowledge / podcast / animation / points / export / profile` 入口。
- AppShell 支持普通模式和未来 Reader 沉浸模式的结构预留。
- 五个主页面均有基础页面、空状态或占位状态。

## 任务分配

### Frontend

- 收敛 AppShell 导航项。
- 为五个主页面建立稳定入口。
- 移除首页和侧栏中的冻结功能快捷入口。
- 使用 `docs/ui.md` 的低噪音工具风格。

### Rust/Tauri

- 不新增命令。
- 确认隐藏入口不依赖后端删除历史 command。

### Python orchestration

- 无任务。

### Data/Schema

- 无 schema 任务。

### Tests

- 增加或更新导航可见性测试。
- 确认冻结入口不可见。

## 不做什么

- 不删除历史模块代码。
- 不实现业务数据流。
- 不恢复 knowledge、podcast、animation、points、export、profile。

## 验收场景

- 用户打开应用，只看到五项主导航。
- 点击五项主导航均能进入对应页面。
- UI 中没有冻结功能入口。
- 页面在空数据状态下不报错。

## 测试要求

- 前端测试覆盖主导航项。
- 前端测试覆盖冻结入口不可见。

## 风险与回退

- 历史路由仍被引用：先保留代码，隐藏入口，避免大规模删除造成回归。
- 某些测试依赖旧导航：更新测试目标到新 MVP 范围。

## 完成后解锁

M02：V1 数据基线与 Rust 数据权威。
