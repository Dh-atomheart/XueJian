# XueJian 用户手册

XueJian 是一款本地优先的 PDF 学习闪卡桌面应用。你可以把 PDF 导入本地文档库，解析为可学习内容，创建或生成卡片，并通过每日复习持续巩固。

## 安装与启动

如果你使用发布包，直接安装并启动 XueJian。

如果你从源码运行：

```powershell
cd xuejian
npm install
pip install -r orchestration_service/requirements.txt
npm run tauri:dev
```

仅运行 `npm run dev` 会打开 Web 预览模式。完整的本地数据库、文件导入、密钥存储和 Python 编排服务需要通过 Tauri 启动。

## 首次使用流程

1. 打开“文档”页面。
2. 导入一个可复制文本的 PDF。
3. 等待解析任务完成。解析成功后，文档会生成可用于卡片和问答的文本片段。
4. 打开阅读器，阅读 PDF 并查看当前页相关卡片。
5. 在“卡片”页面手动创建卡片，或从文档内容生成 AI 卡片。
6. 在“学习”页面进入每日复习队列，使用“忘记 / 模糊 / 记得 / 熟练”四档反馈完成复习。

## AI Provider 配置

XueJian 使用 BYOK 模式，你需要使用自己的模型服务密钥。

支持方向：

- OpenAI。
- Anthropic。
- OpenAI-compatible Provider。

配置方式：

1. 打开“设置”页面。
2. 进入 AI 配置区域。
3. 添加 Provider、模型信息和 API Key。
4. 测试连接。
5. 将可用模型用于卡片生成、文档向量化或知识问答。

未配置 API Key 时，XueJian 仍可用于本地文档管理、手动建卡和复习。只有触发 AI 制卡、向量化或知识问答时，才需要可用 Provider。

## 主要页面

- 首页：查看今日学习概览、近期文档、复习进度和学习趋势。
- 文档：导入 PDF、查看解析状态、打开阅读器。
- 阅读器：阅读 PDF，并查看当前页相关卡片和来源信息。
- 卡片：创建、编辑、删除、筛选和分组管理学习卡片。
- 学习：完成每日复习队列，并提交四档学习反馈。
- 知识：基于已解析和向量化的文档进行学习型问答。
- 设置：配置 AI Provider、学习偏好和通用外观。

## 数据与隐私

XueJian 采用本地优先架构：

- 文档会复制到应用本地数据目录。
- 业务数据存储在本机 SQLite 数据库中。
- API Key 使用 Tauri Stronghold 保存。
- Python orchestration service 只执行解析和 AI workflow，不直接写入 SQLite。
- 未配置或未使用 AI Provider 时，应用不会向外部模型服务发送内容。

使用外部 AI Provider 时，请同时遵守对应服务商的数据处理和隐私政策。

## 已知限制

- 当前优先支持可复制文本 PDF。
- 扫描版 PDF 和图片型 PDF 暂不保证解析效果。
- OCR、云同步、账户系统和完整播客/动画生成不属于当前主线能力。
- 知识问答依赖文档解析、向量化和可用模型配置。
- AI 生成质量受文档质量、模型能力、Provider 可用性和提示词约束影响。

## 常见问题

### Python 依赖缺失

如果本地服务提示缺少依赖，请在 `xuejian` 目录运行：

```powershell
pip install -r orchestration_service/requirements.txt
```

### 本地服务异常

如果侧边栏提示本地服务需要检查，可以尝试重启应用。开发模式下还应确认 Python 运行时可用，并查看 `logs/` 下的会话日志。

### AI 连接失败

请检查：

- API Key 是否已保存。
- Provider 类型、Base URL 和模型 ID 是否正确。
- 当前网络是否可以访问模型服务。
- 该 Provider 是否支持当前 workflow。

### PDF 无法解析

如果 PDF 是扫描版、图片型或文本不可复制，当前解析可能失败。可以先换用可复制文本 PDF 验证流程。

### 复习队列为空

常见原因：

- 没有可复习卡片。
- 卡片所在分组未启用。
- 今日到期卡片已经复习完成。
- 新卡或复习卡每日上限已经达到。
