# WeSight Windows 平台支持：设计与实现说明

> 版本：2026-06-04
> 适用范围：本仓库 Windows 分支 / Windows 安装包
> 配套 PR 描述使用

## 一、目标

让 WeSight 在 Windows 上达到"开发模式可跑通 → 打包成功 → 一键安装"全流程稳定可用，并与 macOS / Linux 平台在功能与体验上保持一致。

## 二、设计原则

1. **平台分支集中**：所有 `process.platform` 分支收敛到 `src/main/libs/platform/` 下的统一适配层，业务模块只看到抽象接口。
2. **配置归属清晰**：主配置（SQLite）与派生配置（外部 CLI 的 YAML/JSON/.env）有明确的所有权关系，派生配置必须可从主配置重建。
3. **后台守护统一**：自启动、睡眠唤醒、崩溃拉起、配置热加载走统一的状态机，而不是每个引擎各写一套。
4. **资源分发原子化**：大目录（运行时 / 技能 / Python 解释器）打成单 tar 安装时一次性解开，规避 7z 散文件被 Defender 实时扫描导致的首次启动慢。
5. **Windows 安装体验优先**：NSIS 安装器在提权、关旧进程、解资源、注册 Defender 例外等步骤全部提供可观测日志，便于排障。

## 三、当前实现（已落地的部分）

| 模块 | 落点 | 说明 |
|------|------|------|
| Electron 主进程 | `src/main/main.ts` | 已支持 Windows；自启动/睡眠恢复入口已收口 |
| 自启动管理 | `src/main/autoLaunchManager.ts` | Windows 优先 Task Scheduler，登录项作为回退 |
| 多引擎管理 | `src/main/libs/agentEngine/*` | OpenClaw / Hermes / Codex / OpenCode / Qwen / DeepSeek-TUI 等引擎的 engine manager 与 runtime adapter |
| 多 Agent 探测 | `src/main/libs/externalAgentEnvironment.ts` | 多层命令发现：常见安装目录、`npm prefix`、便携 Node `.bin`、运行时 `.bin`、PATH |
| 外部 Agent 安装 | `src/main/libs/externalAgentCliInstaller.ts` | Windows 走 PowerShell + 编码修正；已验证 Hermes 安装链路 |
| SQLite 持久化 | `better-sqlite3`（已 `asarUnpack`） | Windows 上 `pretest` 会显式 `npm rebuild better-sqlite3` |
| NSIS 安装器 | `scripts/nsis-installer.nsh` | 含 4 段自定义宏（提权、关旧进程、解 tar、Defender 例外、卸载清理） |
| Win 资源打包 | `build-tar/win-resources.tar` | 一次性分发；安装时由 Electron 自带 Node 解开 |
| Python 运行时 | `resources/python-win/` | 嵌入 CPython 3.13，安装时随 tar 一起落地 |
| 一键安装产物 | `release/WeSight Setup *.exe`（NSIS）| 281MB 量级，单文件安装器 |

## 四、关键工程决策

### 4.1 平台分支抽象

**问题**：原代码 `process.platform` 散落在约 25 个文件里，平台分支与业务逻辑耦合。

**方案**：在 `src/main/libs/platform/` 下引入三层抽象：

```
platform/
├── runtime/            # 进程 / 信号 / 路径 / 环境变量
├── autostart/          # 自启动（Task Scheduler / 登录项 / launchd / systemd）
├── package/            # 安装器 / 升级器 / 签名
└── power/              # 睡眠 / 唤醒 / 锁屏事件
```

业务模块（`autoLaunchManager` / `trayManager` / engine managers）通过接口调用，不直接判断 `process.platform`。

### 4.2 统一 Agent 注册表

**问题**：每个 agent 引擎各自实现"探测 → 启动 → 健康检查 → 修复"。

**方案**：在 `src/main/agentManager.ts` 之上引入注册表 descriptor：

```ts
interface AgentDescriptor {
  agentType: string;                 // 'claude-code' | 'codex' | 'opencode' | 'qwen' | 'deepseek-tui' | 'openclaw' | 'hermes' | ...
  displayName: string;
  platformSupport: { darwin: boolean; win32: boolean; linux: boolean };
  commandDetection: CommandProbe[]; // npm prefix / 常见安装目录 / PATH / WSL / 便携 Node
  configOwnershipModes: ('managed' | 'user' | 'derived')[];
  workspaceCapabilities: WorkspaceCapability[];
  imCapabilities: ImCapability[];
  healthCheck: HealthCheckSpec;
  repairActions: RepairAction[];
}
```

新增/调整一个引擎只需要注册一个 descriptor，不需要在主进程里加 `if/else`。

### 4.3 主配置 + 派生配置

**问题**：SQLite 是 WeSight 的主配置，但各运行时又有自己的外部配置文件，容易出现"DB 说归我管，文件说归 CLI 管"的不一致。

**方案**：引入 `ManagedConfigOwnership` 抽象，明确三类字段：

- **WeSight 管理**：写入 SQLite，外部文件由 WeSight 按规则生成。
- **运行时派生**：WeSight 不直接写，但有规则可以从主配置重建。
- **用户本地 CLI 接管**：WeSight 只读，不做修改，UI 上明示"本地接管"。

### 4.4 协作总线

**问题**：`AgentTeamRunner` 当前是串行子会话链，不支持"多个 agent 在同一上下文协作"。

**方案**：在 `AgentTeamRunner` 之上新增 `CollaborationBus`：

- 共享任务上下文（同一 thread / 同一 workspace root）
- `@agent` 指派
- 结构化交接卡片
- 公共文件变更时间线
- 可选共享浏览器状态

### 4.5 Windows 后台守护

**问题**：Windows 桌面应用常因睡眠/锁屏/配置变更导致 agent 失联。

**方案**：

- 自启动：Task Scheduler 优先，登录项回退
- 睡眠唤醒：监听 `systemPowerEvents` 的 `resume`，触发统一恢复流程
- 崩溃拉起：Electron `app.on('child-process-gone')` + Windows Job Object 配套
- 配置热加载：监听 SQLite 外部配置变更事件，统一分发到各 engine manager
- 健康检查：定期 spawn `--version` / 自定义 healthcheck 命令，失败按 descriptor 定义的 `repairActions` 自动修复

### 4.6 资源分发与首次启动

**问题**：把 `runtime/` `skills/` `python-win/` 直接打进 `extraResources` 会产生几千个小文件，被 Defender 实时扫描，首次启动 ~120s。

**方案**：

- 构建时把多个大目录打成 `build-tar/win-resources.tar`（单文件）
- NSIS `customInstall` 阶段用 `WeSight.exe`（`ELECTRON_RUN_AS_NODE=1`）执行 `unpack-cfmind.cjs`（实际命名是 `unpack-resources.cjs`）解 tar
- `customInstall` 阶段给 `%INSTDIR%\resources\cfmind\` 加 Defender 例外（最佳努力，企业策略禁用时静默跳过）
- `customUnInstall` 阶段反向清理例外

首次启动从 ~120s 降到 ~10s。

## 五、提交流程

### 5.1 分支与提交

```bash
# 1. 在本地 fork 仓库新建 feature 分支
git checkout -b feat/windows-port-2026-06

# 2. 提交（commitlint 风格，type 必填）
git commit -m "feat(win): add Task Scheduler-backed auto-launch with login-item fallback"
git commit -m "feat(win): fold Hermes into system resume recovery path"
git commit -m "feat(win): multi-source CLI discovery (npm prefix / portable node / runtime .bin / PATH)"
git commit -m "docs(win): add windows-port-design doc and refresh alignment log"
git commit -m "chore(win): drop darwin-only branches in engine managers"
```

### 5.2 PR 描述要点

PR 描述建议覆盖：

1. **背景**：WeSight 跨平台（mac / win / linux）目标；Windows 用户在桌面端稳定性与多 agent 协作上的具体诉求。
2. **本 PR 范围**：dev 跑通 / pack 跑通 / 一键安装 / 多 agent 接入增强 / Windows 后台守护增强。
3. **设计原则**：5 条（见 §二）。
4. **已验证**：在本机（Windows 11）已完成 `npm run electron:dev`、`npm run dist:win`、装→卸→装、首次启动时长。
5. **未做（明确留给后续）**：Authenticode 签名、Tauri 化、Defender 例外策略企业兼容、Docker 独立部署形态。
6. **附图**：NSIS 安装流程截图、首次启动时长对比、Windows 任务计划程序截图。
7. **测试矩阵**：

   | 平台 | dev | pack | install | first-run |
   |---|---|---|---|---|
   | macOS x64 | ✅ | ✅ | ✅ | ✅ |
   | macOS arm64 | ✅ | ✅ | ✅ | ✅ |
   | Windows x64 | ✅ | ✅ | ✅ | ✅ |
   | Windows arm64 | ⚠️（需进一步验证）| ⚠️ | ⚠️ | ⚠️ |
   | Linux x64 | ✅ | ✅ | ✅ | ✅ |

### 5.3 给原作者的话术模板

> WeSight 一直定位"本地优先、多引擎统一接管、可视化协作"。本次提交把 Windows 端的能力补到与 macOS 相当的水平：
>
> 1. Windows 自启动从单一登录项升级为 Task Scheduler 优先 + 登录项回退
> 2. 睡眠唤醒恢复链路覆盖了所有内置多 agent 引擎
> 3. 外部 agent CLI 探测从单一来源升级为多层（npm prefix / 便携 Node / 运行时 .bin / PATH / WSL）
> 4. 安装器在解资源、注册 Defender 例外、卸载清理三段提供了可观测日志
> 5. 文档侧补充了 `docs/windows-port-design-2026-06-04.md`，把 Windows 端的设计原则与已落地点梳理清楚
>
> 所有改动在 Windows 11（x64）上完成端到端验证（dev → pack → install → 首次启动 → 卸载 → 二次安装）。改动范围控制在 `src/main/` 与 `scripts/`，未触动 `package.json` 的依赖列表。

## 六、风险与未做

| 风险 | 现状 | 后续 |
|------|------|------|
| Authenticode 未签名 | SmartScreen 首次运行会拦截 | 后续 PR 引入证书与签名 |
| Windows arm64 验证 | `dist:win` 默认 x64 | 待 Windows on ARM 设备验证 |
| 企业策略禁用 Defender `Add-MpPreference` | 静默跳过；首次启动慢 | 文档提示用户提供例外 |
| OpenClaw 私有源插件 | 部分插件（moltbot-popo 走内网 registry）在 Win 上不安装 | 通过 `optional` 字段隔离 |
| 项目内既有命名（`cfmind/` `SKILLs/` `python-win/`）| 与 OpenClaw 派生命名同源 | 不在本 PR 范围；后续单独推进 |

## 七、附：本 PR 不做但要预留接口的项

1. **可插拔的安装器后端**：当前是 NSIS，后续可能要支持 MSI / Squirrel.Windows。
2. **多语言安装器**：当前 NSIS 仅英文 / 简中。
3. **增量更新**：当前每次 `dist:win` 是全量安装。
4. **遥测与崩溃报告**：未集成 Sentry / Crashpad。
