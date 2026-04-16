# 学笺 (XueJian)

> **上传文档，一键生成卡片，卡片贴在原文旁边——像在书中贴便签一样学习。**

学笺是一个 AI 驱动的智能学习记忆应用，帮助考研、考公、期末备考等需要系统性记忆知识的学习者。通过大模型技术实现知识卡片自动生成、贴笺式文档学习、FSRS 智能复习调度，提升学习效率。

## 核心价值

- **消除手动录入痛苦** - 上传 PDF 即可自动生成问答卡片，告别 Anki 式的手动创建
- **贴笺式学习体验** - 卡片与原文关联，学习时有上下文参照，如同在真实书本中贴便签
- **本地优先设计** - 数据默认留在本地，支持 BYOK（Bring Your Own Key），保护隐私
- **FSRS 科学复习** - 采用 FSRS-4.5 算法，智能调度复习时间

## 功能特性

### MVP 核心功能

- **文档上传** - 支持 PDF 文档上传与解析
- **LLM 卡片生成** - 基于文档内容自动生成问答卡片
- **卡片管理** - 完整的 CRUD 操作，支持批量处理、标签管理、CSV/Anki 导出
- **贴笺式展示** - 阅读文档时，关联卡片显示在侧边，点击可跳转原文
- **FSRS 学习调度** - 科学安排复习计划，支持四档难度评级
- **学习记录可视化** - 热力图、统计数据、学习反馈
- **BYOK API 管理** - 支持 OpenAI、Anthropic 等多种模型，密钥安全存储

### 未来规划

- **V2** - 知识库问答（RAG）、积分系统、多格式文档支持（MD/TXT/DOCX）
- **V3** - 卡片内容动画生成、AI 播客生成
- **V4** - 知识图谱、主题切换、移动端适配评估

## 技术栈

### 前端

| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Tailwind CSS | 样式框架 |
| Radix Primitives | 无样式组件基础 |
| TanStack Query | 数据获取与缓存 |
| Zustand | UI 状态管理 |
| PDF.js | PDF 渲染 |
| ts-fsrs | 间隔重复算法 |

### 后端

| 技术 | 用途 |
|------|------|
| Tauri 2.0 | 桌面应用框架 |
| Rust | 核心服务层 |
| SQLite | 主数据库 |
| Stronghold | 密钥安全存储 |
| LangGraph.js | Agent 编排 |

### AI 集成

- OpenAI API
- Anthropic API
- 兼容 OpenAI 协议的第三方服务

## 快速开始

### 环境要求

- Node.js >= 18
- Rust >= 1.70
- pnpm / npm / yarn

### 安装依赖

```bash
cd xuejian
npm install
```

### 开发运行

```bash
# 前端开发服务器
npm run dev

# Tauri 桌面开发模式
npm run tauri:dev
```

### 构建发布

```bash
# 前端构建
npm run build

# Tauri 桌面应用构建
npm run tauri:build
```

### 其他命令

```bash
# 代码检查
npm run lint

# 单元测试
npm run test

# E2E 测试
npm run test:e2e

# 预览构建结果
npm run preview

# Rust 测试
cargo test --manifest-path xuejian/src-tauri/Cargo.toml
```

## 项目结构

```
XueJianProject/
├── docs/                    # 项目文档
│   ├── spec.md              # 项目规范文档
│   └── module-implementation/
├── examples/                # 示例文件
├── xuejian/                 # 主应用目录
│   ├── src/                 # 前端源代码
│   │   ├── app/             # 应用入口、路由
│   │   ├── components/      # UI 组件
│   │   ├── features/        # 业务功能模块
│   │   ├── services/        # 服务层
│   │   ├── store/           # Zustand 状态
│   │   ├── queries/         # TanStack Query hooks
│   │   └── types/           # TypeScript 类型定义
│   ├── src-tauri/           # Rust 核心层
│   │   ├── src/
│   │   │   ├── commands/    # Tauri 命令
│   │   │   ├── db/          # 数据库操作
│   │   │   ├── gateway/     # 模型网关
│   │   │   ├── tasks/       # 后台任务
│   │   │   └── secrets/     # 密钥管理
│   │   └── Cargo.toml
│   ├── tests/               # 测试文件
│   ├── public/              # 静态资源
│   └── package.json
├── LICENSE                  # GPL v3 许可证
└── README.md                # 本文件
```

## 开发指南

### 代码规范

- 使用 ESLint + Prettier 进行代码格式化
- TypeScript 严格模式，避免使用 `any`
- 组件保持薄层，业务逻辑放入 `features/`、`services/`
- Rust 代码遵循标准 Rust 风格

### Git 工作流

- 功能分支：`feat/<short-name>`
- 修复分支：`fix/<short-name>`
- 文档分支：`docs/<short-name>`
- 杂项分支：`chore/<short-name>`

### Commit 规范

使用 Conventional Commits：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `refactor:` 重构
- `test:` 测试
- `chore:` 杂项

### 提交前检查

```bash
npm run build
npm run lint
npm run test
```

## 路线图

| 阶段 | 目标 | 状态 |
|------|------|------|
| MVP | 完整学习闭环：上传 PDF → 生成卡片 → 贴笺阅读 → FSRS 复习 | 进行中 |
| V2 | 知识库问答、积分系统、多格式导入 | 规划中 |
| V3 | 动画生成、AI 播客 | 规划中 |
| V4 | 知识图谱、主题系统、移动端评估 | 规划中 |

## 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 创建 Pull Request

请确保：
- 代码通过 lint 检查
- 添加必要的测试
- 更新相关文档

## 许可证

本项目采用 [GNU General Public License v3.0](LICENSE) 许可证。

这意味着：
- 您可以自由使用、修改和分发本软件
- 衍生作品必须以相同许可证开源
- 修改后的版本必须标明更改

## 致谢

- [FSRS Algorithm](https://github.com/open-spaced-repetition/fsrs4anki) - 科学的间隔重复算法
- [Tauri](https://tauri.app/) - 轻量级桌面应用框架
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF 渲染引擎
- [TanStack Query](https://tanstack.com/query) - 强大的数据同步工具

---

*学笺 - 让学习更高效*
