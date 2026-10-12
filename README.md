# 荒野回响 · Wild Echoes

原生 HTML、CSS 与 JavaScript Canvas 游戏的代码仓库，无运行时第三方依赖。

本仓库维护可执行代码、测试和必要的工程说明。游戏设计文档独立保存在指定的私有仓库，不能复制到本仓库；维护入口见 `AGENTS.md`。

## 开发与检查

`dist/` 是完整静态站点目录，通过 HTTP 静态服务加载即可运行。无需前端打包；不要直接使用 `file://` 加载 ES 模块。

使用 Node.js 运行检查：

```sh
npm run check
npm test
```

语法检查覆盖运行模块；回归脚本验证游戏逻辑与界面交互。离线 DOM 与 Canvas 检查不能替代真实浏览器和触屏设备验证。

## 仓库结构

| 路径 | 用途 |
|---|---|
| `dist/` | 页面、样式与浏览器运行模块 |
| `qa-*.mjs` | 自动回归脚本 |
| `scripts/stamp-version.mjs` | 根据代码仓库历史提交数写入版本 |
| `.github/workflows/pages.yml` | GitHub Pages 部署流程 |

## 部署与版本

将 `dist/` 作为静态站点目录部署，资源使用相对路径。GitHub Pages 工作流在 `main` 更新后拉取完整历史、写入版本并部署产物，不额外生成版本提交。

游戏版本格式为 `v0.0.N`，`N` 为 `goodleap/wild-reaper` 当前提交可达的完整历史提交总数；本代码仓库的文档提交也计入。设计仓库的独立提交不计入。

Sites 使用独立源码仓库。同步发布前，按 GitHub 代码仓库本次提交后的总数执行：

```sh
npm run stamp-version -- --commit-count N
```

不要以 Sites 自身的 Git 历史代替 GitHub 代码仓库计数。
