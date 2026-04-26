# XueJian 日志系统查询指南

本文说明开发和使用雪笺 App 时，遇到错误、卡顿、服务异常或工作流失败后应该去哪里查日志，以及如何根据日志定位问题。

> 目录名按当前要求使用 `log-systeam`。如果后续统一命名，建议迁移为 `log-system`。

## 一、日志来源总览

当前日志分为四类：

| 来源 | 覆盖范围 | 主要用途 |
| --- | --- | --- |
| Tauri/Rust 主进程日志 | 数据库、Stronghold、IPC 命令、Host Gateway、Python 服务启动/停止、panic | 判断桌面端核心能力是否正常 |
| 前端日志 | React ErrorBoundary、未捕获 JS 错误、未处理 Promise、React Query 错误、IPC 调用失败/慢调用 | 判断 UI、查询层、前端异步逻辑是否异常 |
| 测试/构建输出 | Vitest、ESLint、TypeScript、Cargo、Python 编译检查 | 判断开发期代码质量和回归问题 |

## 二、App 使用时在哪里查日志

### 1. 项目根目录日志目录

当前项目默认把日志统一写入仓库根目录下的 `logs/`，并且每次 App 进程启动都会创建一个独立的会话目录。

```text
E:\XueJianProject\logs
```

会话目录格式：

```text
logs\YYYY-MM-DD[HH-MM-SS]
```

示例：

```text
E:\XueJianProject\logs\2026-04-24[18-48-17]
```

注意：Windows 文件名不能包含冒号 `:`，所以时间使用 `18-48-17`，而不是 `18:48:17`。

每个会话目录内常见文件：

```text
xuejian.log
orchestration.log
```

说明：

- `xuejian.log`：Rust 主进程日志，也包含前端通过 `log_frontend_event` 写入的结构化日志。
- `orchestration.log`：Python 编排服务日志，JSONL 格式，一行一条记录。
- 日志文件会轮转，当前保留最近若干份，避免无限增长。

### 2. PowerShell 快速打开

打开日志目录：

```powershell
explorer "E:\XueJianProject\logs"
```

打开最新的日志会话目录：

```powershell
$latest = Get-ChildItem "E:\XueJianProject\logs" -Directory | Sort-Object Name -Descending | Select-Object -First 1
explorer $latest.FullName
```

查看最新 Rust/前端日志：

```powershell
$latest = Get-ChildItem "E:\XueJianProject\logs" -Directory | Sort-Object Name -Descending | Select-Object -First 1
Get-Content (Join-Path $latest.FullName "xuejian.log") -Tail 120
```

查看最新 Python 工作流日志：

```powershell
$latest = Get-ChildItem "E:\XueJianProject\logs" -Directory | Sort-Object Name -Descending | Select-Object -First 1
Get-Content (Join-Path $latest.FullName "orchestration.log") -Tail 120
```

### 3. 临时改到其他目录

如需把日志写到其他位置，可以在启动 App 前设置环境变量：

```powershell
$env:XUEJIAN_LOG_DIR="D:\xuejian-logs"
cd E:\XueJianProject\xuejian
npm run tauri:dev
```

设置后，Rust/Tauri 日志和 Python 编排日志都会写入该目录下的新会话子目录，例如：

```text
D:\xuejian-logs\2026-04-24[18-48-17]
```

### 4. 日志里重点看什么

优先搜索这些关键字：

```text
ERROR
WARN
panic
Command failed
frontend
host_gateway
python-orchestration
workflow
run_id
document_id
request_id
```

如果是一次 UI 操作失败，优先看 `request_id` 和 `command`。

如果是 AI 工作流失败，优先看 `run_id`、`document_id`、`workflow`。

## 三、开发时在哪里查错误

### 1. 前端开发服务器

运行：

```powershell
cd E:\XueJianProject\xuejian
npm run dev
```

主要查看终端输出：

- Vite 编译错误
- React 运行时错误
- 模块导入错误
- CSS/Tailwind 构建错误

### 2. Tauri 开发模式

运行：

```powershell
cd E:\XueJianProject\xuejian
npm run tauri:dev
```

重点查看：

- 当前终端输出
- `E:\XueJianProject\logs\<启动时间>\xuejian.log`
- `E:\XueJianProject\logs\<启动时间>\orchestration.log`

Tauri 开发模式会同时涉及前端、Rust 主进程、Python 编排服务，问题通常要跨日志串联。

### 3. Rust 检查

```powershell
cargo check --manifest-path E:\XueJianProject\xuejian\src-tauri\Cargo.toml
```

用于发现：

- Rust 类型错误
- Tauri command 注册错误
- 依赖/API 使用错误

### 4. 前端检查

```powershell
cd E:\XueJianProject\xuejian
npm run build
```

用于发现：

- TypeScript 类型错误
- Vite 打包错误
- 生产构建问题

局部 ESLint：

```powershell
cd E:\XueJianProject\xuejian
npx eslint src/lib/logger.ts src/services/gateway/index.ts
```

### 5. Python 语法检查

```powershell
python -m py_compile E:\XueJianProject\xuejian\orchestration_service\logging_config.py E:\XueJianProject\xuejian\orchestration_service\server.py
```

用于发现 Python 语法错误和导入层面的基础问题。

## 四、常见问题排查流程

### 1. 页面按钮点击后没有反应

排查顺序：

1. 打开浏览器/前端控制台，看是否有 React 或 JS 错误。
2. 查最新会话目录中的 `xuejian.log`，搜索 `frontend`、`Command failed`、`IPC`。
3. 如果涉及后端命令，搜索对应 command 名。
4. 如果日志里有 `request_id`，用同一个 `request_id` 查前后相关记录。

### 2. 文档导入或 PDF 解析失败

排查顺序：

1. 查最新会话目录中的 `xuejian.log`，搜索 `import_document`、`document-parse`、`Command failed`。
2. 查最新会话目录中的 `orchestration.log`，搜索 `document-parse`、`document_id`、`exception`。
3. 如果 Python 服务没有日志，检查 Rust 日志里是否有 orchestration service 启动失败。


排查顺序：

1. 在 UI 或数据库记录中找到对应 `runId`。
2. 查最新会话目录中的 `orchestration.log`，搜索 `run_id` 或工作流名称。
3. 查最新会话目录中的 `xuejian.log`，搜索同一个 `run_id`、`host_gateway`、`HTTP`。
4. 如果是模型调用失败，检查日志中的 provider/model/base_url，但不要记录或传播 API key。

### 4. Python 编排服务启动失败

排查顺序：

1. 查最新会话目录中的 `xuejian.log`，搜索：

```text
Background orchestration startup failed
Orchestration service failed to start
PythonRuntimeNotFound
ScriptMissing
degraded
```

2. 检查本机 Python：

```powershell
python --version
python3 --version
py -3 --version
```

3. 检查依赖：

```powershell
cd E:\XueJianProject\xuejian
pip install -r orchestration_service\requirements.txt
```

### 5. App 直接崩溃或白屏

排查顺序：

1. 查最新会话目录中的 `xuejian.log`，搜索 `panic`。
2. 查是否有 `frontend.runtime` 或 `frontend.react`。
3. 如果是 release 包，优先收集最近的 `xuejian.log` 和 `orchestration.log`。

## 五、日志字段说明

前端结构化日志通常包含：

```json
{
  "source": "frontend",
  "scope": "IPC",
  "message": "Command failed",
  "requestId": "ipc-...",
  "command": "get_settings",
  "durationMs": 123.4,
  "errorCode": "INVOKE_ERROR",
  "details": {
    "detail": "..."
  }
}
```

Python 编排日志通常包含：

```json
{
  "timestamp": "2026-04-24T10:00:00.000000+00:00",
  "level": "error",
  "source": "python-orchestration",
  "logger": "orchestration_service.server",
  "message": "Card generation workflow failed: ...",
  "request_id": "...",
  "run_id": "...",
  "document_id": "...",
  "exception": "..."
}
```

重要字段：

| 字段 | 含义 |
| --- | --- |
| `source` | 日志来源，如 `frontend`、`python-orchestration` |
| `scope` | 前端日志作用域，如 `IPC`、`frontend.react` |
| `requestId` / `request_id` | 单次请求或操作链路 ID |
| `run_id` | 工作流运行 ID |
| `document_id` | 文档 ID |
| `command` | Tauri IPC 命令名 |
| `durationMs` / `duration_ms` | 耗时 |
| `exception` | Python 异常堆栈 |

## 六、隐私与脱敏规则

日志系统默认做本地记录，不上传远程服务。

这些内容不应出现在日志中：

- API key
- Authorization header
- token
- password
- credential
- Stronghold secret
- 完整文档正文
- 完整 LLM prompt 或模型输出全文

当前日志写入前会对包含以下关键词的字段做脱敏：

```text
key
secret
token
authorization
password
credential
```

长字符串会被截断，数组也会限制长度。

## 七、提交问题时建议附带什么

如果需要他人协助排查，建议提供：

1. 复现步骤。
2. 出错时间点。
3. 相关功能名称，例如“导入 PDF”“生成卡片”“播客生成”。
4. 最近会话目录中的 `xuejian.log` 最近 120 行。
5. 如果涉及 AI 工作流，再附同一会话目录中的 `orchestration.log` 最近 120 行。
6. 如果 UI 提示中有 `runId`、`requestId` 或 command 名，也一并提供。

不要提供：

- API key
- 私密文档全文
- 账号密码
- 完整 Authorization/token

## 八、当前已知限制

- UI 里的反馈面板是内存态提示，不等同于完整日志文件。
- `requestId` 当前主要覆盖前端 IPC 调用；Python 内部 workflow 的上下文仍主要依赖 `run_id`。
- 目前没有一键导出诊断包功能，后续可以在设置页增加。
- `npm run build` 可能被既有 TypeScript 问题阻塞，构建错误不代表日志系统本身不可用。
