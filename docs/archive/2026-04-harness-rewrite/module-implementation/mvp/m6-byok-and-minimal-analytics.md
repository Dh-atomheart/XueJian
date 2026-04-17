# M6 BYOK 与最小统计模块实施计划

## 模块定位

- `Module ID`: `M6`
- `Stage`: `MVP`
- `Priority`: `P0`
- `Spec Reference`: `spec.md` §2.2.6、§5.1.6、§6.2
- `Depends On`: `M1`、`M5`
- `Blocks`: `V2-1`、`V3-2`

## 交付目标

- 允许用户配置自有模型凭证并安全存储
- 提供最小可用学习反馈，而不是完整数据驾驶舱
- 让 BYOK、连接测试、成本感知和基础统计形成闭环

## Done Means

- 用户可配置 OpenAI、Anthropic 和兼容端点
- API Key 仅进入 Stronghold，不写入 SQLite，也不暴露给 Python 服务
- 首页与设置页可看到最小统计概览，且视觉上保持克制

## 前置条件

- `M1` 已提供 Stronghold、`ModelGateway`、`ToolGateway`、默认设计系统
- `M5` 已提供学习记录与日统计基础数据

## 交付物

- UI层：API 配置页、模型选择器、连接测试、最小统计概览
- 数据层：`APIConfig`、`DailyStats`、`HeatmapData`
- Host 层：OpenAI / Anthropic / OpenAI-compatible 适配器、成本统计、预算提示
- 测试层：连接测试、日志脱敏、统计聚合、视觉验收

## 一级任务映射

| 一级任务 | 内容 |
| --- | --- |
| `M6-T1` | API配置界面 |
| `M6-T2` | API Key安全存储 |
| `M6-T3` | Host侧连接测试功能 |
| `M6-T4` | OpenAI适配器 |
| `M6-T5` | Anthropic适配器 |
| `M6-T6` | 自定义端点适配器 |
| `M6-T7` | Token消耗统计 |
| `M6-T8` | 费用估算 |
| `M6-T9` | 热力图组件 |
| `M6-T10` | 统计数据计算 |

## 实施级子任务

| 一级任务 | 子任务 | 说明 |
| --- | --- | --- |
| `M6-T1` | `M6-T1.1` 建立配置表单；`M6-T1.2` 建立默认模型选择与删除流程 | 设置页主入口 |
| `M6-T2` | `M6-T2.1` 写入 Stronghold；`M6-T2.2` 删除时同步清理引用 | 严禁明文持久化 |
| `M6-T3` | `M6-T3.1` 通过 Host 发起测试请求；`M6-T3.2` 显示成功/失败与错误原因 | 避免盲配置 |
| `M6-T4` | `M6-T4.1` 统一 OpenAI 调用；`M6-T4.2` 处理模型列表和结构化能力 | `ModelGateway` 子集 |
| `M6-T5` | `M6-T5.1` 接入 Anthropic；`M6-T5.2` 统一错误和超时处理 | 与 OpenAI 归一化 |
| `M6-T6` | `M6-T6.1` 支持 OpenAI-compatible 端点；`M6-T6.2` 校验 `baseUrl` 和 `model` | BYOK 灵活性 |
| `M6-T7` | `M6-T7.1` 记录请求/响应 token；`M6-T7.2` 挂接到工作流和连接测试 | 成本可见性 |
| `M6-T8` | `M6-T8.1` 模型定价映射；`M6-T8.2` 估算费用与预算提示 | MVP 只做提示 |
| `M6-T9` | `M6-T9.1` 基础热力图；`M6-T9.2` 今日摘要与掌握度概览 | 克制概览而非大盘 |
| `M6-T10` | `M6-T10.1` 聚合 SQLite 数据；`M6-T10.2` 输出 UI 所需统计形状 | 禁止前端影子计数 |

## 计划改动路径

- `xuejian/src/components/settings/`
- `xuejian/src/components/stats/`
- `xuejian/src/features/settings/`
- `xuejian/src-tauri/src/gateway/model_gateway.rs`
- `xuejian/src-tauri/src/secrets/stronghold.rs`
- `xuejian/src-tauri/src/db/repositories/stats_repo.rs`

## 接口与数据契约

- 公共业务类型：`APIConfig`、`DailyStats`、`HeatmapData`
- 关键契约：
  - `APIConfig.apiKey` 只在编辑态存在，不持久化进 SQLite
  - `ModelGateway` 由 Host 持有，Python 服务不直接读取原始密钥
  - 统计以 `ReviewLog` 聚合为准
  - 设置页和统计页沿用默认视觉壳层，不单独起一套后台 UI
- 模块内部实施类型：
  - `ProviderCapability`
  - `CostEstimateResult`

## 数据流 / 交互流

1. 用户输入 API 信息
2. 前端提交到 Rust Host，密钥写入 Stronghold，元数据写入 SQLite
3. Host 通过 `ModelGateway` 返回连接测试结果并在 UI 呈现
4. 任务运行中由 Host 记录 token 和费用估算
5. 首页与设置页显示最小统计概览

## 异常与边界

- 不允许因连接测试失败而丢失已有配置
- 统计页不得扩张为复杂 BI 驾驶舱
- 日志必须脱敏，预算提示只做提醒，不拦截合法流程
- Python 服务不得绕过 Host 直接持有密钥、预算或成本真相

## 测试矩阵

- 单元：配置保存、删除、连接测试、日志脱敏、费用估算
- 集成：Stronghold + SQLite 联动、学习后统计更新、`ModelGateway` 归一化
- 视觉验收：设置页与主产品页风格连续，统计页为克制概览

## 验收清单

- [ ] `M6-T1` ~ `M6-T10` 已全部覆盖
- [ ] 所有一级任务均有实施级子任务
- [ ] API 配置、连接测试、成本提示和最小统计可用
- [ ] 页面保持统一视觉语言，不演变为企业后台驾驶舱
- [ ] 为 `V2-1` 和 `V3-2` 提供稳定模型配置能力
