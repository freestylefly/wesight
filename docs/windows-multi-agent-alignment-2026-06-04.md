# WeSight Windows 端多 Agent 能力对齐记录（2026-06-04）

日期：2026-06-04

## 背景

为继续完善 WeSight 的 Windows 版本，本记录整理 WeSight 在 Windows / 自启动 / 多 Agent 接入 / 共享工作区 / 协作层上需要进一步打稳的能力，并按业内多 Agent 桌面平台的常见工程实践对齐。本记录不引用任何外部项目，仅描述 WeSight 自身的设计选择。

## 已落地

截至 2026-06-04，本轮已在 WeSight Windows 版中完成以下增强：

1. 外部 Agent Windows 探测增强
   - 已将多层命令发现策略补入 WeSight。
   - 现支持从常见安装目录、`npm prefix`、便携 Node `.bin`、运行时 `.bin`、PATH 等多来源发现 CLI。
   - 已验证 Hermes / Codex / OpenCode / Qwen / DeepSeek-TUI 等内置多 agent 引擎的 CLI 能在当前机器上识别到真实路径与版本。

2. Windows 自启动增强
   - 已将 Windows 自启动底层增强为优先使用 Task Scheduler。
   - 保留现有登录项逻辑作为兼容回退，UI 与 IPC 协议未改动。
   - 已验证计划任务的创建 / 查询 / 删除链路在当前机器可用。

3. 睡眠唤醒恢复增强
   - 已将 Hermes 纳入系统 `resume` 后的恢复链路。
   - 当前系统唤醒后，相关引擎都会执行恢复逻辑，降低运行时在 Windows 睡眠后失联的概率。

## 对照业内常见多 Agent 桌面平台

### 1. 入口与协调层分离

业内多 Agent 桌面平台的典型做法是"入口 + 协调层"分离：

1. 桌面端只负责入口与可视化。
2. 协调层（运行时 / 后台服务）统一管理 agent 生命周期。
3. Windows 用系统级任务调度（Task Scheduler）负责登录自启动。
4. 配置修改后由协调层热加载，而不是每次人工重启所有运行时。

WeSight 当前状态：

- 已有 Electron 主进程作为入口。
- 已有 `OpenClawEngineManager`、`HermesEngineManager`、`CoworkEngineRouter`。
- 已具备多引擎切换，但仍是"每个引擎各自管理、配置分散、恢复链路不统一"。

WeSight 后续方向：

- 增加统一的本地运行时协调层，集中管理 OpenClaw、Hermes、Claude Code、Codex、OpenCode、Qwen、DeepSeek-TUI。
- 在 Windows 上补齐"开机后自动恢复运行时"的统一入口，避免各引擎各写一套恢复逻辑。
- 将"运行中 / 崩溃重启 / 配置变更待应用 / 睡眠恢复重连"状态提升为统一模型。

### 2. 单一主配置源 + 派生运行时配置

业内多 Agent 桌面平台的一个强点是"所有 agent + workspace 连接配置放在单一配置源中"。

WeSight 当前状态：

- `cowork_config` 在 SQLite。
- 各运行时又各有外部配置文件。
- 状态漂移是常见故障源之一。

WeSight 后续方向：

- 建立 WeSight 自己的"统一 Agent 运行配置快照"。
- SQLite 继续作为主配置源，但要明确：
  - 哪些字段属于 WeSight 管理。
  - 哪些字段是运行时派生文件。
  - 哪些字段是用户本地 CLI 接管。
- 所有派生文件必须可从主配置源重建，避免状态漂移。

建议新增内部抽象：

- `RuntimeProfile`
- `WorkspaceBinding`
- `ManagedConfigOwnership`

### 3. 多 Agent 接入方式

业内多 Agent 平台普遍使用"插件式 agent 类型注册"统一接入不同 agent。

WeSight 当前状态：

- 已有 `CoworkEngineRouter`。
- 已有 `externalAgentEnvironment.ts` 做 CLI/配置探测。
- 已有多个 runtime adapter / engine manager。
- 已有 `AgentManager`、`AgentTeamRunner`。

WeSight 已经有基础，但还缺两层：

1. 统一的 Agent 能力描述。
2. 统一的 Agent 安装 / 探测 / 运行 / 诊断协议。

建议补齐一个 WeSight 内部注册表：

- `agentType`
- `displayName`
- `platformSupport`
- `commandDetection`
- `configOwnershipModes`
- `workspaceCapabilities`
- `imCapabilities`
- `healthCheck`
- `repairActions`

### 4. 多 Agent 协作方式

业内多 Agent 平台的协作不是简单"多个 session 并列"，而是：

- 同一工作区下共享线程。
- 支持 @mention。
- 支持任务委派。
- 支持共享文件与共享浏览器状态。

WeSight 当前状态：

- `AgentTeamRunner` 现在是串行子会话执行，适合预设团队流，但不是真正的共享协作总线。
- 当前更像"主任务 + 子任务链"，不是"多个 agent 在同一上下文里自然协作"。

WeSight 后续方向：

- 在现有 `AgentTeamRunner` 之上新增"协作总线"层。
- 让多个 agent 共享：
  - 当前任务上下文
  - 工作目录快照
  - 文件活动
  - 结构化 handoff
  - 可选浏览器状态

建议先做成 WeSight 原生版本：

1. `@agent` 指派
2. 结构化交接卡片
3. 公共上下文面板
4. 公共文件变更时间线

### 5. 共享工作区

WeSight 后续方向：

- 把现有右侧工作区面板升级成统一的 Workspace Hub。
- 将以下信息从"单 session 私有"提升为"任务级共享"：
  - 当前 workspace root
  - 最近文件改动
  - 当前运行引擎
  - 任务状态
  - 交接记录
  - 运行时告警

### 6. Windows 可靠性

Windows 桌面应用需要重点关注：

- 崩溃自动拉起
- 睡眠唤醒自动重连
- 后台常驻
- 热加载配置

WeSight Windows 版当前优先级也应当放在这里：

1. 统一运行时状态机
2. 统一健康检查
3. 统一日志定位
4. 统一恢复动作

## WeSight 已有优势

WeSight 目前已经具备或部分具备：

- 多引擎桌面集成
- 本地 SQLite 持久化
- Agent Team 预设团队流
- 文件活动追踪
- 运行时指标面板
- Feishu 多实例与多引擎归属切换
- 更强的桌面端任务空间表达

所以 WeSight 应当重点补"统一性"和"恢复性"，而不是从零重做。

## 建议的落地顺序

### P0：先把 Windows 运行时底座打稳

1. 统一 `OpenClaw / Hermes / Claude Code / Codex` 的配置归属模型。
2. 加统一运行时健康检查与修复入口。
3. 增加 Windows 自启动与唤醒后重连恢复（本轮已完成自启动与唤醒恢复两块的增强）。
4. 日志里统一打印运行时来源、配置来源、修复动作。

### P1：补统一 Agent 注册表

1. 将各引擎探测、路径、版本、配置归属抽象成统一描述。
2. 将安装、修复、同步配置、健康检查统一成标准接口。
3. 给 UI 提供统一的"已安装 / 可修复 / 已接管 / 本地接管"状态。

### P2：补共享协作层

1. 共享上下文面板
2. `@agent` 指派
3. 结构化交接
4. 公共文件与浏览器状态

### P3：补面向工作区的统一入口

1. 按工作区查看所有 agent
2. 按工作区启动 / 停止 / 恢复
3. 按工作区切换模型与引擎策略

## 对当前代码的直接启发

建议重点改造这些位置：

- `src/main/main.ts`
  - 收敛运行时恢复、自启动、自愈入口
- `src/main/libs/agentEngine/*`
  - 统一 adapter 能力模型
- `src/main/libs/externalAgentEnvironment.ts`
  - 统一 CLI 探测与配置归属
- `src/main/coworkStore.ts`
  - 统一主配置与派生配置关系
- `src/main/agentManager.ts`
  - 提升为真正的 agent 注册中心
- `src/main/agentTeamRunner.ts`
  - 从串行团队流扩展为共享上下文协作层

## 当前判断

WeSight 的核心定位是"本地优先、Windows 稳定、多引擎统一接管、可视化协作"。本轮在 Windows 上的能力增强，正是为这一方向补"统一性"与"恢复性"。

值得持续投入的方向：

1. Windows 后台守护与恢复模型
2. 单一主配置源 + 派生运行时配置
3. 统一 agent 注册表
4. 共享上下文协作层
5. 任务委派与状态追踪
