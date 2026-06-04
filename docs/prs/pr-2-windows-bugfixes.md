## 摘要

修复 WeSight 在 Windows 11 x64 上用户实测可复现的 4 个 agent 引擎问题与引擎切换卡顿。每个 patch 都来自 WeSight 自身代码或运行时契约，**不引入新依赖、不改 `package.json`、不改公共 API**。

## 修复的问题（用户截图与 SQLite telemetry 共同证实）

### 1. Claude Code 默认引擎下的"反问循环"
**复现**：用户在 Claude Code 默认引擎下输入"查个今天的热点新闻"，assistant 连续 3 轮反问"我能帮你什么"，最终 0 实质输出。

**根因**：`claudeRuntimeAdapter.ts:35` 把 user prompt 直接转发给 Claude SDK，SDK 默认 system prompt 触发 docx / multi-agent-exec skill 引导。

**修复**：新增 `src/main/libs/agentEngine/queryIntentRouter.ts`（91 行）—— 关键字匹配（查/搜索/热点/抖音/web_fetch/tophub/.md/.docx 等）把 query 路由到 Hermes / YdCowork / ClaudeCode。用户**显式选择**引擎时（`options.agentEngine`）仍按用户选择，路由只在未指定时介入。

### 2. Codex App 首次启动 workspace bootstrap 卡住
**复现**：Codex CLI 在空 workspace 里返回 "I have no current request — only the workspace setup message"，引导用户 bootstrap。

**根因**：`codexAppRuntimeAdapter.runTurn` 没在 `ensureConnected` 之前检查 workspace。

**修复**：在 `codexAppRuntimeAdapter.ts` 新增 `ensureCodexWorkspace` 私有方法（~10 行），缺 `MEMORY.md` 时写一个 stub，best-effort。

### 3. 引擎调用"虚构 skill"（multi-agent-exec）
**复现**：Claude Code 输出 `Skill { "skill": "multi-agent-exec" }`，但 `SKILLs/` 目录里**不存在**这个 skill（已 `ls` 验证 27 个真实 skill）。

**根因**：Claude SDK 默认 system prompt 提到 "multi-agent" 能力，WeSight 侧没拦截。

**修复**：新增 `src/main/libs/skillWhitelist.ts`（53 行）—— 镜像 `SKILLs/` 27 个真实 skill。`coworkEngineRouter.startSession` / `continueSession` 在把 options 交给 runtime adapter 之前过滤掉不存在的 skill。

### 4. 引擎切换卡顿 3-180 秒
**根因**：
- Hermes 每次切换都重跑 `probeExistingGateway` + 写 state 文件 + 发 status broadcast（`hermesEngineManager.ts:403 startGateway`）。
- OpenClaw / Hermes 首次启动要 spawn gateway 进程（`GATEWAY_BOOT_TIMEOUT_MS = 180_000`）。

**修复**：
- `hermesEngineManager.ts`：5 分钟 TTL fast-path cache（`HERMES_GATEWAY_FAST_PATH_TTL_MS` + 静态 `Map<version, fastPath>`）。Adopting 已存在 gateway 与新 spawn 成功两条路径都写缓存。
- `main.ts`：`app.on('ready')` 后 `setImmediate` 预启动 Hermes + OpenClaw gateway，不阻塞主窗口渲染。
- `coworkEngineRouter.handleEngineConfigChanged`：只对真正在其他引擎上活跃的 session 发 `ENGINE_SWITCHED_CODE`，避免误伤。

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/main/libs/agentEngine/queryIntentRouter.ts` | **新增 91 行** |
| `src/main/libs/skillWhitelist.ts` | **新增 53 行** |
| `src/main/libs/agentEngine/coworkEngineRouter.ts` | 注入 intent router + skill 白名单过滤 + 切引擎过滤 |
| `src/main/libs/agentEngine/codexAppRuntimeAdapter.ts` | MEMORY.md bootstrap |
| `src/main/libs/hermesEngineManager.ts` | TTL fast-path + 静态 cache map + 写点 |
| `src/main/main.ts` | `app.on('ready')` 预启动 Hermes + OpenClaw |

合计净增约 250 行（不含新增文件）。

## 验证

```bash
$ npx tsc --project electron-tsconfig.json --noEmit
# 0 errors
```

- `cowork_runtime_calls` SQLite 表结构不变
- 16+ 次 engine runtime call 跨 4 引擎保持 `status=completed`
- 用户实测：4 引擎在 30 分钟内被分别调用，0 失败

## 不在本次范围（建议单独 issue）

- `lead_sequential` team 工作流对模糊输入会输出"我是助手能帮你什么"类模板占位，不引用 lead 产出。`agentTeamRunner.buildMemberPrompt` 已传 `previousResults`，但 `lead_sequential` 本身没有 lead 角色。建议在 `agentTeamRunner` 之上加 `IntentClarifier` 节点。
- OpenClaw 启动时抱怨 "config was last written by a newer OpenClaw (2026.4.23) than current (2026.3.2)"。WeSight 集成的 OpenClaw runtime 版本落后。
- DDGS 海外搜索引擎在国内网络下 timeout 20s/次；建议按 region 调整 backend 优先级。
