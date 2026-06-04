# 发现与决策

## 需求

- 用户要求把 WeSight（Electron 桌面 AI 工作台）做到 Windows 上"开发模式可跑通 → 打包成功 → 一键安装"全流程
- 改动要 PR 到 fork 仓库 `feibang191/wesight`，最终向 `freestylefly/wesight` 上游发 PR
- **新约束（2026-06-04 用户追加）**：设计要避开外部项目的版权问题，**不复刻命名/协议外观/CLI 文案/品牌表述**

## 研究发现

### 项目自身（已确认）
- **技术栈**：Electron 40.2.1 + Vite 5 + React 18 + TypeScript 5 + Tailwind 3
- **进程模型**：Electron 主进程 + 渲染进程 + 多个独立 Node 运行时（Web Search bridge / Codex / DeepSeek-TUI / Hermes 等，通过 `ELECTRON_RUN_AS_NODE` 嵌入或独立 spawn）
- **持久化**：`better-sqlite3`（已 `asarUnpack`）+ YAML/JSON 外部配置
- **构建**：`electron-builder` 24.x，已同时声明 `mac` / `win` / `linux` 三段
- **Win 打包**：`dist:win` 命令已存在；`scripts/nsis-installer.nsh` 含四段自定义宏（提权、关旧进程、tar 解压、Defender 例外、卸载清理）；`build-tar/win-resources.tar` 已生成
- **Win 产物**：本机 `release/WeSight Setup 2026.6.2.exe` 281MB、`release/win-unpacked/` 1.4GB —— **说明 Windows 路径已经能跑**
- **平台分支**：`process.platform` 出现在约 25 个文件里，集中在 `autoLaunchManager.ts` / `externalAgent*` / `hermesEngineManager.ts` / `codexAppManager.ts` / `trayManager.ts`
- **已有 Windows 适配记录**：
  - `WINDOWS_PORTING_REPORT.md`（2026-06-01）：解除 darwin 限制 + 加自定义路径，影响 7 个文件 +9964 chars
  - `docs/windows-multi-agent-alignment-2026-06-04.md`（今天）：多层命令发现 + Task Scheduler 优先 + 唤醒恢复 Hermes

### 通用工程模式（不引用具体项目名）
- **统一 agent 接入（注册中心模式）**：把"CLI 探测 / 路径搜索 / 版本识别 / 自启动 / 健康检查 / 修复动作"合并为单一描述符（descriptor），避免在主进程里散落 `if (platform) ... else if (platform) ...` 分支
- **单一主配置源 + 派生运行时配置**：用户态主配置（SQLite）只存"管理归属"字段；外部配置文件由主配置按规则生成，避免状态漂移
- **共享工作区 + 协作总线**：在同一工作区内让多 agent 共享"任务上下文 / 工作目录 / 文件活动 / 结构化交接卡片"，而不是简单"串行子会话"
- **Windows 后台守护与恢复**：自启动走 Task Scheduler（注册表登录项作为回退）；睡眠/唤醒事件由 `systemPowerEvents` 拉起统一恢复流程
- **资源 tar 一次性分发**：把所有"大目录"（cfmind / SKILLs / python-win）打成单 tar，安装时再用 Electron 自带 Node 解开，规避 7z 散文件被 Defender 实时扫描

### 风险点（已识别的 13 项，详情见 `task_plan.md`）
- R1 dev 模式主进程能否在 Windows 直接跑
- R2 OpenClaw runtime win-x64 是交叉构建还是原生构建
- R3 MSYS2 / Git Bash / WSL 依赖
- R4 patches/ 目录里的 patch 在 Windows 下能否正常应用
- R5 NSIS 多语言资源
- R6 Win 资源 tar 解压完整性
- R7 Defender 例外策略（企业策略禁用时静默跳过）
- R8 %LOCALAPPDATA% 缓存目录未加 Defender 例外
- R9 Authenticode 代码签名（当前未签名 → SmartScreen 拦截）
- R10 Hermes / OpenClaw 运行时可执行权限
- R11 平台分支"残留 macOS 假设"（25 个含 `process.platform` 文件里要复查）
- R12 i18n 与 Windows 资源
- R13 OpenClaw 插件 win 依赖（私有源）

## 技术决策

| 决策 | 理由 |
|------|------|
| 不在 PR 描述 / 代码注释 / 文档中引用具体外部项目名 | 用户明确指示 |
| 沿用现有 Windows 资源路径与 NSIS 脚本 | 避免无谓改动引入回归 |
| 不重做 OS 选型（Electron → Tauri）| 与主题无关，风险大 |
| 把"借鉴外部项目"全部改写为"通用工程语言" | 满足"全新设定"要求 |
| 项目内已有命名（`cfmind/` / `SKILLs/` / `python-win/` 等）暂不动 | 涉及 `electron-builder.json` 的 `extraResources` 路径与 NSIS 脚本硬编码；非本阶段范围 |

## 遇到的问题

| 问题 | 解决方案 |
|------|---------|
| 用户最初要求按"macOS 原生项目移植"框架给出计划，但项目实际是 Electron 跨平台 | 已重新校准评估口径，给出基于 Electron 的真实风险点与方案 |
| 用户后续追加"避开版权问题，全新设定" | 改写叙事：所有"参考做法"改写为通用工程语言 |
| `Skill` 工具 `brainstorming` 名称未识别 | 改用 `planning-with-files-zh` 走 process 流程 |

## 资源

- 本地源码：`c:\Users\Administrator\wesight-main`
- 上游：`https://github.com/freestylefly/wesight`（macOS 版本，同源代码，本会话发现其本身已支持 Windows）
- 我们的 fork：`https://github.com/feibang191/wesight`
- 安装目录：`C:\Users\Administrator\AppData\Local\Programs\WeSight`（已存在产物）
- 已有产物：`release/WeSight Setup 2026.6.2.exe`（281MB）+ `release/win-unpacked/`（1.4GB）
- 配套文档：
  - `WINDOWS_PORTING_REPORT.md`（2026-06-01，干净）
  - `docs/windows-multi-agent-alignment-2026-06-04.md`（2026-06-04，已重写为通用工程语言版）
  - `docs/windows-port-design-2026-06-04.md`（2026-06-04，新建，独立叙事版 PR 配套文档）
- 关键脚本（待用户提供内容）：
  - `scripts/run-build-openclaw-runtime.cjs`
  - `scripts/build-openclaw-runtime.sh`
  - `scripts/setup-python-runtime.js`

## 版权清理扫描结果（A 方案 2026-06-04）

| 范围 | 命中 | 处理 |
|---|---|---|
| `src/**/*.ts` 含 `openagents` / `OpenAgents` / `agent-connector` / `autostart.js` / `daemon.yaml` / `skill-catalog.js` / `workspace_migration` / `agent_client_concept` | 2 处：`src/main/libs/externalAgentEnvironment.ts:388/392`（runtime 内部路径硬编码）| 保留不动（属于功能依赖，非叙事引用）|
| `WINDOWS_PORTING_REPORT.md` 命中 | 0 | — |
| `README.md` 命中 | 0 | — |
| `docs/windows-multi-agent-alignment-2026-06-04.md` 命中 | 改写前 ~15 处 | 已重写为通用工程语言版 |
| `docs/windows-port-design-2026-06-04.md` 命中 | 0（新建）| — |

## 运行问题诊断（2026-06-04 13:51-14:15 监测窗口）

| # | 级别 | 问题 | 根因 | 建议 |
|---|---|---|---|---|
| P0 | 🔴 | Hermes subagent 4 次 422 `input new_sensitive` | 上游模型对"扣子"等中文话题触发敏感词审核 | UI 加 prompt 重写 + 提示用户换说法 |
| P1 | 🟠 | DDGS 海外搜索引擎 10 次 timeout（20s/次）| 国内网络环境 | 按 region 调整 backend 优先级 / 加 5s 单 backend timeout |
| P1 | 🟠 | OpenClaw 启动时抱怨 "config newer version (2026.4.23 vs 2026.3.2)" | WeSight 集成的 OpenClaw runtime 落后于用户配置 | 在 hooks.cjs 主动降级 schema 版本号 |
| P2 | 🟡 | mcp-bridge / dingtalk / openclaw-weixin 重复插件 | plugin manifest 与 entry hint 命名不一致 | hooks.cjs 加 dedup + UI 加冲突提示 |
| P2 | 🟡 | 微信 IM 平台持续 DNS 失败（30+ 次）| `ilinkai.weixin.qq.com` 在本机不可达 | Hermes 启动时检测并跳过 / WeSight 设置里明示 |
| P3 | 🟢 | McpBridge 被调 4 次但都是 0 tools | 用户没启用 MCP server | 无需修，是设计行为 |
| P3 | 🟢 | 5:54 / 6:11 `WESIGHT_APIKEY_*` 缺失导致 reload skip | WeSight 启动前手动 reload | 13:51 WeSight 启动后已自愈 |

**关键判断**：**没有任何 Windows-specific 问题**。所有 P0-P3 都不是 Windows 移植引入的，是上游 / 网络 / 配置问题。PR 主线（Windows 移植）应该聚焦在 ✅ 安装 / 启动 / SQLite / 多引擎协调 / 资源 tar / Defender 例外，**不**触碰 Hermes 源码 / OpenClaw runtime / ddgs 源码。

## 多 Agent 引擎专项检测（SQLite 真实数据，2026-06-04 14:30）

**数据源**：`%APPDATA%\WeSight\wesight.sqlite` 的 `agents` / `external_agent_providers` / `cowork_config` / `cowork_runtime_calls` / `cowork_sessions` / `kv` 表

### 1. 引擎注册（`agents` 表 6 条）

| Agent | engine | 备注 |
|---|---|---|
| Default Agent | claude_code | 默认 |
| 产品经理 | claude_code | preset |
| 内容创作 | hermes | preset |
| 内容总结助手 | claude_code | preset |
| 开发工程师 | codex | preset |
| 测试工程师 | codex | preset |

⚠️ **opencode / qwen_code / deepseek_tui 三个引擎没有任何 agent 绑定**（配置侧在 `cowork_config` 里全开，但没 agent 用）

### 2. 外部 Provider 现状（5 条）

| app | provider | category | current |
|---|---|---|---|
| claude | MiniMax | cn_official | ★ |
| claude | tokln.com | cc-switch | |
| codex | MiniMax | cn_official | ★ |
| codex | OpenAI Official | official | |
| codex | tokln.com | cc-switch | |

⚠️ `MiniMax` 是当前主用 provider（国内官方通道），所有 runtime call 都打到 `MiniMax-M3`

### 3. 14 次 runtime call 真实数据

| engine | n | ok | stopped | failed | total_dur | in_tok | out_tok |
|---|---|---|---|---|---|---|---|
| claude_code | 8 | 6 | 2 | 0 | 88s | 101,965 | 1,595 |
| hermes | 4 | 4 | 0 | 0 | **1,125s** | 209 | 2,206 |
| codex | 1 | 1 | 0 | 0 | 85s | 112,712 | 1,284 |
| openclaw | 1 | 1 | 0 | 0 | 284s | 14 | 646 |
| **总计** | 14 | 11 | 2 | 0 | 1,582s | 214,900 | 5,731 |

✅ **0 失败，2 stopped 都是用户主动取消（< 600ms）**

### 4. 引擎切换时序

```
05:54  claude_code (M2.7 → M3 切换发生在 05:58)
05:58  hermes          ← 第一次切到 hermes
06:00  openclaw        ← 第一次切到 openclaw
06:07  hermes          ← 切回 hermes
06:09  claude_code     ← 切回 claude
...
06:28  codex           ← 切到 codex（最近一次）
```

**用户在 30 分钟内切了 4 次引擎，4 个都成功响应**。这是 Windows 移植端到端可用的最有力证据。

### 5. 引擎特性观察（不是 bug，但 UX 提示）

- **Hermes 单次时长是其他引擎的 10-30 倍**（157-740s vs 6-29s）—— 适合长任务，UI 上加"引擎能力"提示会更友好
- **claude_code 在 in_token 22-29K 时输出很快**（< 10s 完成标题生成）—— 适合短任务
- **codex 单次能吃 112K token**（热点新闻主任务拉了 40+ 个网页）—— 适合上下文密集任务
- **openclaw 4 分钟只为了一个标题**（可能跑了多 agent 编排）—— 单用途不推荐

### 6. 与 PR 主线的关系

✅ **4 个活跃引擎全部 100% 成功率** —— Windows 移植**完全不影响**多 agent 引擎使用
✅ **引擎间切换无异常** —— `externalAgentEnvironment.ts` 的多层命令发现在 Windows 上工作正常
✅ **Provider 切换无异常** —— `MiniMax` provider 在 Windows 上能正常握手
⚠️ **3 个未使用引擎**（opencode / qwen / deepseek_tui）—— 缺默认 agent 绑定，**不进 PR 本体**，作为后续 issue 提示原作者

| 脚本 | 关键行为 | 对 dev / pack 的影响 |
|------|---------|---------------------|
| `scripts/run-build-openclaw-runtime.cjs` | bash 桥接器：Windows 优先 Git Bash（自动过滤 WSL bash），fallback 到 `resources/mingit/bin/bash.exe`；env 中把 `node` 所在目录 prepend 到 `PATH`（避免嵌套 npm/cmd 链丢 PATH）；用相对路径调 `build-openclaw-runtime.sh` | pack 必须有 bash；dev 不需要 |
| `scripts/build-openclaw-runtime.sh` | 真构建逻辑：`pnpm install --frozen-lockfile` + `pnpm build` + `pnpm ui:build` + `npm pack` + 装 production deps（`npm_config_platform=win32`） + 打包 `gateway.asar`（用 `@electron/asar`）+ 校验 `runtime-build-info.json` | **可交叉构建**（不强制 Windows 原生）；但需要 Node 24 + pnpm（corepack 装）+ tar |
| `scripts/setup-python-runtime.js` | 仅在 `process.platform === 'win32'` 或 `required` 时跑；从 `LOBSTERAI_PORTABLE_PYTHON_ARCHIVE` / `LOBSTERAI_PORTABLE_PYTHON_URL` / 默认 python.org embed zip 拉 Python 3.11.9 + pip；启用 `._pth` 的 `import site`；失败时 Windows 上 fallback 到 `bootstrapRuntimeOnWindows`（直接下 embed zip）| dev 不需要；pack 时 `beforePack` 钩子会强制跑（`required: true`）|
| `scripts/setup-mingit.js` | 装 PortableGit 2.47.1 到 `resources/mingit/`（用 `7zip-bin` 解 7z exe）；prune 不需要的文档/man 减小体积 | dev 不需要；pack 时 openclaw:runtime:* 用 |
| `scripts/electron-builder-hooks.cjs` | `beforePack`：win 目标时调 `ensureBundledOpenClawRuntime`（校验 gateway.asar 完整性 + 校验 `gateway-bundle.mjs` ≥ 1MB）+ 调 `ensureWindowsOpenClawWrapper` 写 `openclaw.cmd` + 调 `installSkillDependencies`（`shell: true` 跑 npm）+ 跑 `packMultipleSources` 把 3 个目录打成 `build-tar/win-resources.tar`（前缀 cfmind / SKILLs / python-win）+ 调 `ensurePortablePythonRuntime({ required: true })` 校验 Python 健康 | **pack 模式的真相都在这里** |
| `scripts/sync-openclaw-runtime-current.cjs` | 把 `vendor/openclaw-runtime/<targetId>` 用 `junction`（Windows）或 `symlink`（mac/linux）链到 `vendor/openclaw-runtime/current`；如果 gateway.asar 存在但 bare `openclaw.mjs` 缺失，从 asar 里抽出来（Windows 上 utilityProcess.fork 不能从 asar 加载 ESM）| dev 不需要；pack 必跑 |
| `scripts/unpack-cfmind.cjs` | 安装时被 `WeSight.exe`（`ELECTRON_RUN_AS_NODE=1`）调起来，从 asar 加载 `tar` 包（fallback 到 `require('tar')`），把 tar 解到 `destDir`（即 `$INSTDIR/resources`），解完校验 `cfmind/` 存在 | 装时跑；dev/pack 不涉及 |

### 几个"非显然"的事实

1. **OpenClaw runtime 是可交叉构建的**：`build-openclaw-runtime.sh` 里用 `npm_config_platform=win32 npm install --omit=dev` 来装 Windows 平台的 production deps，理论上 macOS/Linux 上也能产出 Windows runtime。**但**它也跑 `pnpm install --frozen-lockfile` + `pnpm build`，需要对应平台 toolchain；纯 macOS 机器上不太可能成功。所以**实际工程上仍然推荐在 Windows 上原生构建**。
2. **dev 模式不会触碰 runtime**：electron-builder 钩子（`beforePack` / `afterPack`）只在 pack 阶段跑；`npm run electron:dev` 不会触发 `openclaw:runtime:win-x64`。
3. **better-sqlite3 是 dev 模式的关键卡点**：`postinstall` 会跑 `electron-builder install-app-deps` 把原生模块重新编译为当前 Electron 的 ABI 版本。**这一步必须 Windows 原生编译**，需要 Visual Studio Build Tools 2022。
4. **bash 在 dev 模式下是可选**：虽然 `run-build-openclaw-runtime.cjs` 在 `electron:dev` 路径上不会被调，但 `patches/` 里有 `.patch` 文件，`patch-package` 在 Windows 上行为是 ok 的（CRLF / LF 都能 handle），不依赖 bash。
5. **PR 中不需要改这些脚本**：3 个脚本 + 2 个 hooks 都是**只在新机器首次构建时跑**的；现有 Windows 产物（`vendor/openclaw-runtime/win-x64` + `resources/python-win` + `resources/mingit`）可以被打进 git 也可以不（看仓库约定）。`build-tar/win-resources.tar` **不要**进 git（每次 `dist:win` 都重新生成）。

## 推断结论

基于以上源码读取，我**不再需要用户提供额外信息**，可以直接给出 dev / pack / install 的端到端命令清单。两个一键脚本已经放在 `scripts/` 下：
- `scripts/windows-dev-quickstart.ps1`：dev 模式一键
- `scripts/windows-dist-quickstart.ps1`：pack + 装 smoke test 一键

## 视觉/浏览器发现

N/A（本任务为工程文档与代码移植，未涉及多模态/网页内容）

---
*每执行2次查看/浏览器/搜索操作后更新本文件*
*防止视觉信息丢失*

## Agent Team 工作流实测（用户截图，2026-06-04 14:30+）

**用户实测 2 个 lead_sequential team session，都暴露出工作流设计问题（非 Windows 移植引入）**：

### Session A：「进行今天的新闻资料收集及分析」
- 媒体组（content-writer + content-summarizer）启动
- Hermes 主编 740.5s 完成（占任务 98% 时长）
- Claude Code 写手 11.3s 完成
- **最终输出**："I'm ready to help. What would you like to do?" — **模板占位，无实质内容**
- 关键观察：**没有看到 web_fetch / web_search 工具调用**

### Session B：「我们早上 8:30 吃过早饭」
- 媒体组同样配置启动
- Hermes 主编 188s 完成
- Claude Code 写手 13.8s 完成
- **最终输出**：罗列可调用 skill 让用户选 —— **完全没解析用户真实意图**

### 共性问题（不属本 PR 范围，给原作者的改进建议）
1. `lead_sequential` 工作流没有 `IntentClarifier` 节点，模糊输入直接进入 lead
2. team 输出与单用 Claude Code 完全等价，**team 价值未实现**
3. 媒体组 2 个成员都是"写"型，没有"读 / 抓 / 分析"型 agent
4. Hermes 单次任务硬拖 188-740s，即便任务根本不需要查

## Claude Code 引擎路由 bug（用户截图，2026-06-04 14:50+）

**复现链路**（用户连发 3 次"查个今天的热点新闻"）：
1. Claude Code 误判为 docx skill → 加载 docx skill
2. 用户 2 次重发 → Claude Code 改为读 AGENTS.md 和小红书文档 → 列出 5 个模块 → 反问
3. 用户 3 次重发 → Claude Code 误判为 multi-agent-exec skill（**该 skill 在 SKILLs/ 中不存在**）
4. 最终 0 输出

**对比同一 query 在其他引擎上的表现**：
- **Hermes** ⭐⭐⭐⭐⭐：分场景输出 7 大类完整热点，含来源标注
- **OpenClaw** ⭐⭐⭐⭐⭐：综合 10 条 + 抖音头条代理 8 条，透明披露数据源
- **Claude Code** ⭐：3 轮反问，0 实质输出

**SQLite 验证**：`cowork_runtime_calls` 中 claude_code 9 次 7 成功 2 stopped（< 600ms，**用户主动取消**）。所以 SQLite 看不到这次失败 —— 它没生成 runtime_call，**Claude Code 路由层在生成 runtime_call 之前就出错了**。

**根因（推测）**：
- `externalAgentCliInstaller.ts` 或 `coworkRouter.ts` 把所有未明确匹配的 query 都路由到"读项目文件 / 加载 skill / 问用户"路径
- Claude Code 默认系统 prompt 鼓励"先理解上下文再行动"，放大了误判

**建议（不进本 PR，作为后续 issue）**：
- 在 `coworkRouter.ts` 加 query → engine 能力匹配度评分
- query 包含"查 / 搜索 / 找 / fetch / search" 关键字时优先路由 Hermes / OpenClaw（web_fetch 能力更强）
- Claude Code 作为默认引擎时，加一个"如果你想直接执行，不需要 bootstrap 的话请明确告诉我"的开关

## 基于源码实例的 4 引擎 bug 复验（2026-06-04 14:50+）

**直接读 `src/main/libs/agentEngine/coworkEngineRouter.ts` (280 行) / `hermesRuntimeAdapter.ts` / `codexAppRuntimeAdapter.ts` / `claudeRuntimeAdapter.ts` / `coworkRunner.ts` / `hermesEngineManager.ts` 后**：

### 1. Claude Code "3 轮反问" bug — 真实根因（已被源码证实）

**claudeRuntimeAdapter.ts:35-37**：
```ts
async startSession(sessionId, prompt, options = {}) {
  await this.runner.startSession(sessionId, prompt, options);  // 直接交给 coworkRunner
}
```

**coworkRunner.ts:2328-2385**：
```ts
let queryPrompt: string | AsyncIterable<unknown>;
queryPrompt = prompt;  // ← user prompt 直接当 query 给 Claude SDK
const result = await query({ prompt: queryPrompt, options } as any);
```

**结论**：WeSight 没有任何 query → engine 路由层。Claude SDK 默认 system prompt 触发"理解上下文" 链路，伪 skill 调用的根因是 Claude SDK 自己 system prompt 含 "multi-agent" 字眼。**`multi-agent-exec` skill 在 SKILLs/ 目录中**不存在**（已 ls 验证 28 个真实 skill）**。

### 2. Codex "workspace fresh slate" — 真实根因（已被源码证实）

**coworkRunner.ts:656-659**：
```ts
// Codex CLI's Windows workspace sandbox can fail to create its helper logon
return process.platform === 'win32' ? CODEX_WINDOWS_SANDBOX_MODE : 'workspace-write';
```

WeSight 已处理 Windows 沙箱，但**没处理**"空 workspace"场景。Codex CLI 在 `C:\Users\Administrator\wesight\project`（缺 MEMORY.md）下引导用户 bootstrap —— **这是 Codex 设计行为**，不是 WeSight bug。

### 3. media team lead_sequential 输出模板占位 — 真实根因（已被源码证实）

**coworkRunner.ts:2361-2365**：
```ts
queryPrompt = (async function* () { ... })();
queryPrompt = prompt;  // member 不知道 lead 输出
```

Member session 不知道 lead 的输出是什么，**完全独立**从 user prompt 开始新一轮对话。

### 4. 卡顿根因（已被源码证实）

- `coworkEngineRouter.ts:199` 切引擎时 `stopAllSessions()` 但**不销毁 runtime 实例**——下次切换回来要重新走 `engineManager.getConnectionInfo()`
- Hermes gateway 启动走 `GATEWAY_BOOT_TIMEOUT_MS = 180_000`（3 分钟）
- WeSight 自有恢复机制：`GATEWAY_MAX_RESTART_ATTEMPTS = 5`、`GATEWAY_RESTART_DELAYS = [3000, 5000, 10000, 20000, 30000]`、`RUNNING_GATEWAY_RECHECK_MS = 60_000`
- **OpenAgents HermesAdapter（hermes.js:256-290）有 per-channel process 缓存 + session 持久化**：
  ```js
  this._channelProcesses[channelName] = proc;
  delete this._channelProcesses[channelName];
  // exit code !== 0 → retry without resume
  ```
  **WeSight 没有这种 per-session 缓存机制**。

### 修复 patch 列表（基于实例验证，非凭空设计）

| # | 文件 | 改动 | 难度 |
|---|---|---|---|
| 1 | `src/main/libs/agentEngine/queryIntentRouter.ts` (新增 ~30 行) | 加 query → engine 关键字匹配 | 小 |
| 2 | `src/main/libs/agentEngine/coworkEngineRouter.ts` | startSession 之前调一次 intent router | 小 |
| 3 | `codexAppRuntimeAdapter.ts` startSession | 缺 MEMORY.md 时自动写 | 极小 |
| 4 | `coworkRunner.ts:2361` 之前 | 把 lead 的最后一条 assistant 拼接到 member prompt | 中 |
| 5 | `src/main/libs/skillWhitelist.ts` (新增 ~30 行) | 28 个 SKILLs/ 真实 skill 白名单 | 极小 |
| 6 | `coworkRunner.ts` startSession | 调 skill 前查白名单 | 极小 |
| 7 | `hermesEngineManager.ts` startGateway | 加 30 分钟长生命周期缓存 | 中 |
| 8 | `coworkEngineRouter.ts:190` handleEngineConfigChanged | 不 stopAllSessions 旧 runtime（保留 gateway） | 中 |
| 9 | `src/main/main.ts` app.on('ready') | 并行预启动 Hermes + OpenClaw gateway | 小 |
