# XueJian 发布文档

这里是 XueJian 面向发布读者的文档入口。它和 `docs/` 的定位不同：`documents/` 解释如何安装、使用、开发和贡献；`docs/` 保留项目内部路线、架构契约、MVP runbook 和工程细节。

## 阅读入口

- [用户手册](./user-guide.md)：适合第一次安装、配置和使用 XueJian 的用户。
- [开发者指南](./developer-guide.md)：适合贡献代码、二次开发、调试本地服务或理解架构边界的开发者。
- [内部工程文档](../docs/index.md)：适合需要深入理解产品路线、模块契约、数据库、IPC 和后台任务模型的维护者。

## 文档边界

- `documents/user-guide.md` 关注产品使用，不要求读者理解代码结构。
- `documents/developer-guide.md` 关注开发环境、架构边界、命令和贡献约定。
- `docs/` 中的文档是实现和路线权威来源；当发布文档与内部工程文档冲突时，以 `docs/spec.md`、`docs/architecture.md` 和对应专项契约为准。
