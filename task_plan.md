# 任务计划：WeSight Windows 移植（独立叙事版）

> v2 — 2026-06-04 用户决定：**不引用/不复刻外部项目的命名、协议外观、CLI 文案与品牌表述**。
> 本计划中所有"参考做法"都改写为通用工程语言；不在 PR 描述 / 代码注释 / 文档中提及任何外部项目。
> 注：Hermes / Codex / OpenCode / Qwen / DeepSeek-TUI 等是 WeSight 自身内嵌的多 agent 引擎，不属于"外部项目"，保留原名。

## 目标

把 WeSight 在 Windows 上做到 "开发模式可跑通 → 打包成功 → 一键安装" 全流程；改动以 **PR 形式** 提交到 `feibang191/wesight`（fork），并向 `freestylefly/wesight` 上游发 PR；**PR 描述与代码注释中不出现 OpenAgents 等外部项目名**。

## 当前阶段

阶段 4-5 已完成一键脚本交付；阶段 6-7（smoke test / PR 提交流程）由用户实际操作

## 各阶段

### 阶段 1：需求与边界再确认
- [x] 确认"独立设定"边界：命名/协议外观/CLI 文案/品牌表述 全部不复刻
- [x] 确认改动落点（dev / build / pack / install / 提交流程）
- [x] 确认 PR 描述的叙事主线："Windows 桌面端的可靠性与可维护性"
- **状态：** completed

### 阶段 2：现状盘点（已在会话前期完成，沉淀到 findings.md）
- [x] 复用本会话已摸清的事实：Electron 40 + Vite 5 + React 18 + TS 5 + better-sqlite3
- [x] 复用已识别的 13 项 Windows 移植风险点（R1–R13）
- [x] 把"借鉴外部项目"的内容全部改写为"通用工程语言"
- **状态：** completed

### 阶段 3：清理今日日志与文档（A 方案）
- [x] 修订 `docs/windows-multi-agent-alignment-2026-06-04.md`，去掉外部项目命名引用
- [x] 新增 `docs/windows-port-design-2026-06-04.md`（独立叙事版）作为正式 PR 配套文档
- [x] 复核 `WINDOWS_PORTING_REPORT.md`（2026-06-01）是否有外部项目命名痕迹（干净）
- [x] 扫描 `src/` 下命中外部项目名的代码（仅 2 处 runtime 路径硬编码，保留）
- **状态：** completed

### 阶段 4：dev 跑通（用户授权"你来操作执行"）
- [x] 通过已有信息推断 3 个脚本的可能行为（详见 `findings.md` 推断段）
- [x] 输出 `npm run electron:dev` 全流程命令清单（Git Bash + PowerShell 两套）
- [x] 输出 `npm run dist:win` 一键脚本
- [x] 给出 dev 模式验证 checklist
- [x] 给出 pack / install 验证 checklist
- [x] 写 `scripts/windows-dev-quickstart.ps1`（dev 一键）
- [x] 写 `scripts/windows-dist-quickstart.ps1`（pack 一键）
- [ ] 在干净 Windows 机器上跑一遍端到端（依赖用户实际操作）
- **状态：** completed（交付物就绪，等用户在干净机器上跑）

### 阶段 5：pack 跑通
- [ ] 输出 `npm run dist:win` 一键脚本
- [ ] 校验 `build-tar/win-resources.tar` 完整性
- [ ] NSIS 文案 / Defender 策略 / 卸载流程 优化建议
- **状态：** pending

### 阶段 6：一键安装
- [ ] 验证 `WeSight Setup *.exe` 全流程（装→卸→装）
- [ ] 编写 README 中"Windows 安装与首次运行"段落
- **状态：** pending

### 阶段 7：PR 提交
- [ ] 提交信息模板（commitlint 风格）
- [ ] PR 描述模板（突出 Windows 支持价值，**不引用外部项目**）
- [ ] 提交流程（fork → branch → commit → push → PR）
- **状态：** pending

## 关键问题

1. （已降级）3 个关键脚本内容 → 改为"按现有信息推断 + 用户授权执行"模式，详见 `findings.md` 推断结论
2. （保留作 P3）项目内已有命名（`cfmind/` / `SKILLs/` / `python-win/`）：A 方案决定**不动**；后续可单独 issue 推进
3. PR 描述口径：A+B 组合（"补 Windows 平台分支 + 移除 macOS-only 限制 + 重构 Windows 可靠性层"），通用工程语言，不引用任何外部项目

## 已做决策

| 决策 | 理由 |
|------|------|
| 不在 PR 描述 / 代码注释 / 文档中引用任何外部项目 | 用户明确指示 |
| 沿用项目内已有的 Windows 产物路径（`build-tar/win-resources.tar` 等） | 已能跑通，避免无谓改动引入回归 |
| 不在 PR 中重写 OS 选型（Electron → Tauri）| 与"补 Windows 支持"主题无关，且风险大 |
| 优先做"独立叙事文档"而非"补功能" | 用户当前阶段的方向调整 > 之前的代码细节推进 |

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| `Skill` 工具 `brainstorming` 名称未识别 | 1 | 改用 `planning-with-files-zh` 作为 process skill，并按需调用 `grill-me@` 等可用 skill |
| `using-superpowers` 提示必须走 brainstorm | 1 | 用户已给出明确方向，不需要 brainstorm 寻找方案；改走 planning 流程 |

## 备注

- 阶段状态随进度更新：pending → in_progress → complete
- 做重大决策前重新读取本计划
- 所有错误记录在本文件，避免重复
- 外部内容只写入 `findings.md`，不写入 `task_plan.md`
