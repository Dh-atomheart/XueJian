# V3-2 AI播客生成模块实施计划

## 模块定位

- `Module ID`: `V3-2`
- `Stage`: `V3`
- `Priority`: `P2`
- `Spec Reference`: `spec.md` §2.4.2、§5.3、§6.4
- `Depends On`: `V2-1`、`M6`
- `Blocks`: `V4-1`

## 交付目标

- 根据文档或卡片集合生成播客式学习材料
- 建立提纲、脚本、TTS、音频拼接和恢复链路
- 通过 `LangChain` 实现播客类 `PresetWorkflow`，由 Host 持有预算、文件与任务状态边界

## Done Means

- 用户可生成播客脚本与音频
- 任务可恢复、可取消、可预算中止
- 音频资源、脚本与元数据可被回放和管理

## 前置条件

- `V2-1` 已提供知识范围和引用上下文
- `M6` 已提供模型配置、成本感知和最小预算控制

## 交付物

- 代码层：提纲生成、对话脚本、TTS、音频拼接、播放器
- 数据层：`PodcastScript`、`AudioSegment`、`PodcastEpisode`
- 任务层：`WorkflowRun`、`WorkflowCheckpoint`、任务事件流
- 测试层：脚本生成、音频拼接、长任务恢复、预算中止测试

## 一级任务映射

| 一级任务 | 内容 |
| --- | --- |
| `V3-2-T1` | 提纲生成 `PresetWorkflow` |
| `V3-2-T2` | 对话脚本生成 |
| `V3-2-T3` | TTS集成 |
| `V3-2-T4` | 音频拼接 |
| `V3-2-T5` | 播客播放器 |
| `V3-2-T6` | 长任务恢复 |

## 实施级子任务

| 一级任务 | 子任务 | 说明 |
| --- | --- | --- |
| `V3-2-T1` | `V3-2-T1.1` 基于知识范围提取提纲；`V3-2-T1.2` 固定节目结构模板 | 控制输出质量 |
| `V3-2-T2` | `V3-2-T2.1` 生成多角色对话；`V3-2-T2.2` 约束长度和语气风格 | 脚本可读可听 |
| `V3-2-T3` | `V3-2-T3.1` 接入 TTS 提供者；`V3-2-T3.2` 分段生成音频 | 便于恢复 |
| `V3-2-T4` | `V3-2-T4.1` 拼接音频片段；`V3-2-T4.2` 记录时长与输出路径 | 生成完整节目 |
| `V3-2-T5` | `V3-2-T5.1` 实现播放器；`V3-2-T5.2` 同步脚本与进度 | 结果可消费 |
| `V3-2-T6` | `V3-2-T6.1` 保留 `WorkflowCheckpoint`；`V3-2-T6.2` 处理预算中止和失败回退 | 长任务控制 |

## 计划改动路径

- `xuejian/python/orchestration/`
- `xuejian/src/features/podcast/`
- `xuejian/src/components/podcast/`
- `xuejian/src-tauri/src/tasks/`
- `xuejian/src-tauri/src/db/repositories/`

## 接口与数据契约

- 公共业务类型：`PodcastScript`、`AudioSegment`、`PodcastEpisode`、`WorkflowRun`
- 关键契约：
  - 所有片段都必须登记为 `AudioSegment`
  - 节目产物必须关联脚本与知识范围
  - 预算中止必须持久化中断原因
  - Python 工作流通过 Host 获取模型、文件与预算能力
- 模块内部实施类型：
  - `PodcastOutlinePlan`
  - `TtsBatchResult`

## 数据流 / 交互流

1. 用户选择知识范围与播客风格
2. Host 创建 `WorkflowRun` 并把任务交给 Python 服务
3. Python 工作流生成提纲和脚本
4. Host 逐段执行 TTS 并落盘音频片段
5. Host 拼接为完整节目并更新状态
6. 用户在播放器中收听并查看脚本

## 异常与边界

- 脚本过长时必须分段处理，避免一次性失败
- TTS 失败不能导致已有片段丢失
- 预算中止时必须保留最小上下文和已完成资源
- 当前阶段默认不引入 LangGraph，除非播客链路后续演化到复杂图级恢复

## 测试矩阵

- 单元：提纲生成、脚本结构、片段拼接
- 集成：TTS 调用、断点恢复、预算中止
- 端到端：生成播客 -> 播放 -> 恢复失败任务

## 验收清单

- [ ] `V3-2-T1` ~ `V3-2-T6` 已全部覆盖
- [ ] 所有一级任务均有实施级子任务
- [ ] 脚本、片段与完整节目可生成
- [ ] 长任务可恢复、可取消、可预算中止
- [ ] 为 `V4-1` 提供聚合学习材料输入
