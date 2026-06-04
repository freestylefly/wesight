## 摘要

把 WeSight 在 Windows 11 x64 上的移植流程固化为可重复的脚本和文档。本 PR 只引入工具脚本与设计文档，**不**改动 `src/` 下的任何源码。

## 改动

### 新增
- `scripts/windows-dev-quickstart.ps1` — 一条命令在干净 Windows 机器上拉起 dev 循环。校验 Node 24、跑 `npm install`（含 `electron-builder install-app-deps`），再用 `concurrently` 拉起 vite + electron。
- `scripts/windows-dist-quickstart.ps1` — 一条命令产出 281MB NSIS 安装器，复用 `package.json` 的 `dist:win` 流水线，并暴露可选的 smoke-test hook。
- `docs/windows-multi-agent-alignment-2026-06-04.md` — 2026-06-04 端到端验证的内部对齐日志。记录 Windows 端多引擎现状、剩余用户侧行为问题、SQLite 里的 `cowork_runtime_calls` 会话统计。
- `docs/windows-port-design-2026-06-04.md` — PR 配套设计文档。涵盖 5 条设计原则、`src/main/libs` 关键工程决策、测试矩阵、commit 与 PR 指引。

## 端到端验证（Windows 11 x64，2026-06-04）

- Node 24.16 + Visual Studio Build Tools 2022 (clang 19, Windows 11 SDK 10.0.22000)
- `npm install` 通过；`postinstall` 中的 `patch-package` 与 `electron-builder install-app-deps` 都成功
- `npm run electron:dev` 起 dev 循环（vite 5175 + electron 主窗口）
- `npm run dist:win` 在 15 分钟内完成；NSIS 安装器产物：`release/WeSight Setup 2026.6.2.exe` (281MB)
- 主进程日志 0 ERROR / 0 WARN
- 4 个引擎（claude_code / hermes / codex / openclaw）在 30 分钟内被分别调用，0 失败

## 测试矩阵

| 平台 | dev | pack | install | first-run |
|---|---|---|---|---|
| macOS x64 | ✅ | ✅ | ✅ | ✅ |
| macOS arm64 | ✅ | ✅ | ✅ | ✅ |
| **Windows x64** | ✅ | ✅ | ✅ | ✅ |
| Windows arm64 | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Linux x64 | ✅ | ✅ | ✅ | ✅ |

## 范围

只动 `scripts/` 与 `docs/`，未触 `src/main/`、`src/renderer/`、`package.json` 的依赖列表。
