# V2-3 多格式文档导入模块实施计划

## 模块定位

- `Module ID`: `V2-3`
- `Stage`: `V2`
- `Priority`: `P1`
- `Spec Reference`: `spec.md` §2.3.3、§5.2、§6.3
- `Depends On`: `M2`
- `Blocks`: `V2-1`

## 交付目标

- 将导入格式从 PDF 扩展到 MD、TXT、DOCX
- 让非 PDF 文档也能进入既有卡片生成与学习流程
- 在无法精确定位时提供稳定的降级锚点策略

## Done Means

- 用户可导入 MD/TXT/DOCX 文件
- 文本可被标准化并进入后续流程
- 无坐标文档仍可通过 paragraph/text-range 锚点回跳

## 前置条件

- `M2` 的导入状态管理、`Document` 模型和锚点系统已稳定
- `M3` 的卡片生产线可复用统一文档输入

## 交付物

- 代码层：多格式解析器、导入路由、标准化结构
- 数据层：`ImportedDocument` 与扩展锚点模式
- 测试层：格式解析、降级锚点、后续流程兼容测试

## 一级任务映射

| 一级任务 | 内容 |
| --- | --- |
| `V2-3-T1` | Markdown解析 |
| `V2-3-T2` | TXT文本解析 |
| `V2-3-T3` | DOCX解析 |
| `V2-3-T4` | 统一文本结构 |
| `V2-3-T5` | 降级锚点策略 |
| `V2-3-T6` | 格式识别与路由 |

## 实施级子任务

| 一级任务 | 子任务 | 说明 |
| --- | --- | --- |
| `V2-3-T1` | `V2-3-T1.1` 解析 Markdown；`V2-3-T1.2` 提取标题、段落与代码块边界 | 保持文本结构 |
| `V2-3-T2` | `V2-3-T2.1` 检测编码；`V2-3-T2.2` 进行段落分割 | 处理纯文本场景 |
| `V2-3-T3` | `V2-3-T3.1` 解析 DOCX；`V2-3-T3.2` 提取正文与段落层级 | 允许后续替换解析库 |
| `V2-3-T4` | `V2-3-T4.1` 标准化为统一文档结构；`V2-3-T4.2` 复用 `Document` 流程 | 不重建第二套管线 |
| `V2-3-T5` | `V2-3-T5.1` 定义 `text-range`；`V2-3-T5.2` 定义 `paragraph` 锚点模式 | 无坐标时可回跳 |
| `V2-3-T6` | `V2-3-T6.1` 自动识别扩展名；`V2-3-T6.2` 路由到对应解析策略 | 导入入口统一 |

## 计划改动路径

- `xuejian/src/features/documents/importers/`
- `xuejian/src/services/renderer/`
- `xuejian/src-tauri/src/commands/documents.rs`

## 接口与数据契约

- 公共业务类型：`ImportedDocument`
- 关键契约：
  - `fileType = 'pdf' | 'md' | 'txt' | 'docx'`
  - `anchorMode = 'coordinate' | 'text-range' | 'paragraph'`
  - 导入后仍复用 `Document / DocumentAnchor / CardCandidate / Card`
- 模块内部实施类型：
  - `NormalizedTextBlock`
  - `ImportRoute`

## 数据流 / 交互流

1. 用户选择文件
2. 系统识别文件类型
3. 调用对应解析器
4. 标准化为统一文本结构
5. 生成降级或坐标锚点
6. 进入既有卡片与学习流程

## 异常与边界

- 不支持旧 `.doc`，必须明确报错而不是隐式失败
- 解析失败时不写入半成品卡片
- 降级锚点必须在 UI 上明确与 PDF 锚点区分

## 测试矩阵

- 单元：Markdown/TXT/DOCX 解析、扩展名识别、锚点降级
- 集成：导入后进入卡片生产线、回跳定位
- 端到端：多格式导入 -> 生成卡片 -> 学习

## 验收清单

- [ ] `V2-3-T1` ~ `V2-3-T6` 已全部覆盖
- [ ] 所有一级任务均有实施级子任务
- [ ] MD/TXT/DOCX 可导入并进入既有流程
- [ ] 降级锚点可用且可解释
- [ ] 不破坏 MVP PDF 流程
