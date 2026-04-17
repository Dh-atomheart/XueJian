# M3 卡片生产线模块实施计划

## 模块定位

- `Module ID`: `M3`
- `Stage`: `MVP`
- `Priority`: `P0`
- `Spec Reference`: `spec.md` §2.2.3、§5.1.2、§6.2
- `Depends On`: `M1`、`M2`
- `Blocks`: `M4`、`M5`、`V3-1`

## 交付目标

- 建立从文档分块到卡片候选再到正式卡片的完整生产线
- 通过 `LangChain` 实现 `PresetWorkflow`，由 `Python Orchestration Service` 调度工作流推进
- 保证人工确认、去重、幂等入库和导出链路可用

## Done Means

- 用户可启动生成任务、看到候选、批量确认并入库
- `WorkflowRun`、`WorkflowCheckpoint` 与事件流可支撑取消、恢复和错误解释
- 候选与正式卡片都能保留来源锚点和导出能力

## 前置条件

- `M1` 的 `ModelGateway`、`ToolGateway`、Host-Service 协议和工作流基础模型已可用
- `M2` 已稳定输出 `DocumentChunk` 与 `DocumentAnchor`

## 交付物

- 代码层：Python 工作流、Host 协议适配、Prompt、确认界面
- 数据层：`CardCandidate`、`Card`、`WorkflowRun`、`WorkflowCheckpoint`
- UI层：候选列表、确认对话框、进度与恢复提示
- 测试层：生成、去重、恢复、导出测试

## 一级任务映射

| 一级任务 | 内容 |
| --- | --- |
| `M3-T1` | Python orchestration service 基础设施 |
| `M3-T2` | Host-Service 协议封装 |
| `M3-T3` | 文档转卡片 `PresetWorkflow` |
| `M3-T4` | `ModelGateway` / `ToolGateway` 适配 |
| `M3-T5` | 文档分块策略 |
| `M3-T6` | 卡片生成Prompt模板 |
| `M3-T7` | `CardCandidate` 数据模型 |
| `M3-T8` | 用户确认界面 |
| `M3-T9` | `WorkflowCheckpoint` 持久化 |
| `M3-T10` | 任务恢复机制 |

## 实施级子任务

| 一级任务 | 子任务 | 说明 |
| --- | --- | --- |
| `M3-T1` | `M3-T1.1` 建立工作流执行入口；`M3-T1.2` 定义工作流状态结构和事件协议 | 先搭骨架后接模型 |
| `M3-T2` | `M3-T2.1` 建立 Host-Service 请求响应协议；`M3-T2.2` 处理取消、进度和错误事件 | Python 不直接触碰主存储 |
| `M3-T3` | `M3-T3.1` 定义 `chunk -> generate -> confirm -> save`；`M3-T3.2` 固定人工确认点协议 | 明确 HITL 边界 |
| `M3-T4` | `M3-T4.1` 通过 Host 访问 `ModelGateway`；`M3-T4.2` 通过 Host 访问受控工具与预算信息 | Provider 差异与权限统一由 Host 处理 |
| `M3-T5` | `M3-T5.1` 复用 `DocumentChunk`；`M3-T5.2` 明确过长文档的 chunk 策略 | 依赖 M2 输出 |
| `M3-T6` | `M3-T6.1` 固定 Prompt 模板；`M3-T6.2` 增加结构化输出校验 | 降低模型漂移 |
| `M3-T7` | `M3-T7.1` 定义候选表；`M3-T7.2` 实现 `dedupeKey` 和 `accepted/rejected` 状态 | 保证人工确认前不入正式表 |
| `M3-T8` | `M3-T8.1` 批量接受/拒绝；`M3-T8.2` 单张编辑与标签修改 | HITL 可用性核心 |
| `M3-T9` | `M3-T9.1` 持久化 `WorkflowCheckpoint`；`M3-T9.2` 记录 approval payload 和错误信息 | 为恢复和审计服务 |
| `M3-T10` | `M3-T10.1` 启动时扫描待恢复任务；`M3-T10.2` 恢复后幂等保存 | 严禁重复正式卡片 |

## 计划改动路径

- `xuejian/python/orchestration/`
- `xuejian/src/features/agents/cardGeneration/`
- `xuejian/src/components/cards/`
- `xuejian/src-tauri/src/gateway/`
- `xuejian/src-tauri/src/tasks/`

## 接口与数据契约

- 公共业务类型：`CardCandidate`、`Card`、`WorkflowRun`、`WorkflowCheckpoint`、`WorkflowEvent`
- 关键契约：
  - `CardCandidate.status`: `pending | accepted | rejected`
  - `WorkflowRun.status`: `queued | running | waiting_confirmation | completed | failed | cancelled`
  - 人工确认点必须保存：候选列表、编辑结果、当前阶段、来源文档范围
  - 当前保留 `WorkflowCheckpoint` 契约，但不把 LangGraph checkpoint 当现行实现前提
- 模块内部实施类型：
  - `CardGenerationState`
  - `WorkflowEnvelope`
  - `ApprovalPayload`

## 数据流 / 交互流

1. 用户对文档发起卡片生成
2. Host 创建 `WorkflowRun` 并将任务下发给 Python 服务
3. Python 工作流按 chunk 调用 Host 提供的模型与工具能力
4. 生成候选卡片并通过 Host 写入候选表
5. UI 进入人工确认界面
6. 用户接受、编辑或拒绝候选
7. 系统保存正式卡片并更新任务状态
8. 若中断，则从 `WorkflowCheckpoint` 恢复到确认点或保存点

## 异常与边界

- `M3` 不负责 PDF 解析本身，输入必须来自 `M2`
- 模型返回非法结构时必须进入可解释错误，不直接写库
- 恢复逻辑不得重复执行保存正式卡片的提交阶段
- 候选导出和正式卡片导出必须分开处理
- 当前阶段不默认引入 LangGraph 图级恢复

## 测试矩阵

- 单元：Prompt 解析、结构校验、`dedupeKey`、候选转正式卡片
- 集成：文档到卡片、API key 无效、`WorkflowCheckpoint` 恢复
- E2E：生成中断恢复、批量确认、导出链路

## 验收清单

- [ ] `M3-T1` ~ `M3-T10` 已全部覆盖
- [ ] 每个一级任务均有实施级子任务
- [ ] 人工确认与恢复协议已写清且可实现
- [ ] 不会产生重复正式卡片
- [ ] 为 `M4`、`M5`、`V3-1` 提供稳定卡片数据
