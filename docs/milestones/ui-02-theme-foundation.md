# UI-02：Light / Dark / System 主题基础设施

## 目标

把 UI 规范中的 `light / dark / system` 主题模型落到前端基础设施，为后续页面打磨提供稳定 token。

## 所属阶段

UI 改造路线，主题基础设施。

## 相对工作量

M。

## 前置条件

- UI-01 完成。
- 当前 AppShell 和设置页无明显乱码。
- 主题模型以 `docs/ui.md` 和详细手册为准。

## 交付内容

- 将主题模型从当前 `default` 扩展为 `light | dark | system`。
- `system` 根据 OS 偏好解析到 `light` 或 `dark`。
- 定义 light/dark 两套同名 CSS variables。
- 设置页通用 tab 使用 Select 管理主题，不再使用自由文本输入。
- 保持旧 `default` 设置向 `light` 兼容迁移，避免历史配置失效。
- Reader、Shell、基础控件使用语义 token，不直接硬编码主题色。

## 接口与类型变化

- `AppThemeId = 'light' | 'dark' | 'system'`。
- 设置 schema 接受 `light / dark / system`。
- 旧 `default` 读入时归一为 `light`。
- ThemeProvider 暴露设置主题和实际 resolved theme。

## 任务分配

### Frontend

- 更新 theme 类型、theme definitions 和 ThemeProvider。
- 增加系统主题监听和 resolved theme 逻辑。
- 设置页改为 Select 选择主题。
- 检查 Reader、Shell、基础控件使用 token。

### Rust/Tauri

- 如设置 DTO/schema 有 Rust 侧校验，兼容 `light / dark / system` 和旧 `default`。

### Python orchestration

- 无新增任务。

### Data/Schema

- 不新增迁移；设置读取层兼容旧值。

### Tests

- ThemeProvider 测试。
- Settings 主题选择测试。
- light/dark 可读性测试。
- 旧 `default` 兼容测试。
- `system` 跟随系统偏好测试。

## 不做什么

- 不重画所有页面。
- 不引入 Tailwind 4。
- 不引入 Headless UI。
- 不改 Tauri 数据权威。

## 验收场景

- 设置页可选择 Light、Dark、System。
- 刷新后主题保持。
- System 能随系统偏好解析。
- 深色主题不是简单反色，Reader 和主要文本可读。

## 风险与回退

- 历史设置值不兼容：统一在 schema/resolve 层将 `default` 映射到 `light`。
- 深色主题覆盖不完整：优先保证 Shell、Reader、表单和主文本可读。

## 完成后解锁

UI-03：共享组件与状态表达收敛。
