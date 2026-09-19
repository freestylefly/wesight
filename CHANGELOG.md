# Changelog

本文档记录 WeSight 的重要变更。

发布说明应从对应版本条目生成。

## 1.0.8 - 2026-09-20

新增 TokenDance 一键授权和六个模型，按模型能力适配调用协议，并提供已上线的观猹登录入口。

### 新增

- TokenDance 加入模型供应商首位，支持浏览器 OAuth 授权、实时目录刷新、默认模型选择与连接测试。
- 接入 deepseek-v4.1-flash、glm-5.3-flash、glm-5.3、deepseek-v4-pro-0813、kimi-k3 和 hy4-preview 六个模型。
- 云端登录页已提供「使用观猹登录」，与 Google 登录并列；登录后沿用桌面端回调流程。

### 变更

- 按照实时模型目录声明的协议，为 Claude、Codex、OpenClaw 和普通对话选择调用方式；保留原有默认模型，按需切换。
- TokenDance API Key 由系统安全存储加密保存，前端和配置导出使用凭据引用；上游密钥仅在主进程发往 TokenDance。

### 修复与防护

- 修复 macOS 打包依赖混用证书密码与临时钥匙串密码的问题，保留签名、公证和产物校验。

- 处理授权取消、过期、目录刷新失败、密钥失效和额度不足，避免将上游敏感错误直接显示给用户。

### 使用说明与已知限制

- 观猹与 Google 账号独立，会员和积分保留在原账号；已有账号请继续使用原登录方式。
- 外部 Agent 使用 TokenDance 时需保持 WeSight 运行；重启后从 WeSight 重新应用配置并启动 Agent。
- 本次已通过模拟授权和协议路由测试；TokenDance 真实账号授权及六个模型的付费推理尚未逐项验收。

## 1.0.7 - 2026-09-20（未发布）

v1.0.7 标签的 macOS 构建未通过临时钥匙串解锁检查，未生成正式 Release。该版本功能与打包修复统一由 v1.0.8 发布。

## Unreleased - 2026-06-07

### 新增

- 新增 WeSight agent CLI programmatic smoke test 脚本和验证文档，覆盖外部 CLI 运行、模型代理和配置同步路径。
- 新增 OpenAI-compatible proxy、external agent config sync、external agent environment、runtime telemetry 和 session title generation 的测试覆盖。
- 新增 shared session title helper，统一会话标题上下文提取、markdown 清理、fallback 标题和 LLM prompt 构造逻辑。

### 变更

- 外部 Agent CLI runtime 集成加固，统一环境变量解析、provider 配置同步、runtime telemetry 和 UI 状态处理。
- Claude Code 通过 WeSight model/proxy 配置路由，减少外部 CLI 与应用内模型设置不一致的问题。
- MiniMax provider/model 处理逻辑标准化，覆盖 Cowork、IM Cowork session 和 OpenAI-compatible proxy 请求路径。
- Windows CLI 探测会跳过 WSL 路径，避免选择 Windows 下无法直接执行的 Linux/WSL CLI。
- Cowork 会话标题生成改为使用规范化后的多行 prompt context，并与 renderer 临时会话标题 fallback 逻辑保持一致。
- Windows release workflow、Electron builder 配置和 NSIS installer 脚本进一步收敛，统一带日期的构建输出命名。

### 修复

- 修复外部 Agent CLI 在 provider 配置、环境变量、代理路由和运行状态同步中的多个不稳定点。
- 修复 Claude Code 未稳定复用 WeSight 模型配置的问题。
- 修复 MiniMax 模型名和 provider 兼容处理在不同入口之间不一致的问题。
- 修复会话标题只依赖 prompt 首行、容易生成过泛标题的问题。

### 已知问题

- 本分支尚未重新记录 `npm run build`、`npm run lint` 和 `npm test` 的完整结果。
- 正式发布前仍需按 release gate 确认 Windows/macOS 签名、公证、checksum、SmartScreen/Gatekeeper 信任链。

## 2026-06-05

### 新增

- 新增外部 CLI agent、Codex 配置、Claude settings、OpenClaw legacy session 等回归测试覆盖。
- 新增 Windows installer/uninstall flow 与 release gate 文档，记录安装卸载流程、验证步骤和发布残余风险。

### 变更

- 外部 CLI agent 配置稳定性增强，Codex 默认使用本地 CLI 配置，Claude Code 尽量保留本地 CLI 凭据。
- Cowork 主界面的 Agent 引擎选择器只探测当前 engine，避免打开下拉框时触发全量 CLI 探测。
- Windows packaging baseline 优化：安装资源改为通过 `win-resources.tar` 解包，OpenClaw runtime 默认不随 Windows 包捆绑，并与 macOS 包策略保持一致。
- Windows Defender exclusion 改为 trusted build opt-in，不再默认添加。
- 更新 Windows packaging 和 OpenClaw runtime 构建辅助脚本，统一 Windows 环境准备、runtime 构建和资源打包基线。
- 内置 Skill 文案和脚本品牌从 LobsterAI 对齐为 WeSight。
- 更新 scheduled task/provider 相关测试 fixture，保持 WeSight/OpenClaw 命名迁移后的兼容性。

### 修复

- 修复 assisted Windows installer 在用户确认最终安装目录前提前清理默认安装目录的问题。
- 修复 Windows 覆盖安装/卸载时，OpenClaw gateway、后台 node 进程或旧 uninstaller 可能影响安装流程的问题。
- 修复 OpenClaw legacy LobsterAI managed session key 的兼容问题。
- 修复 Skill 解析失败时可能输出完整 Skill 内容的问题。
- 修复 `cowork_events` 测试夹具和 SQLite migration 漂移导致的测试失败。
- 修复 external CLI environment 测试依赖慢探测导致的 timeout 风险。

### 已知问题

- Windows 和 macOS 签名、公证、checksum、SmartScreen/Gatekeeper 信任链仍未在本 PR 中闭环。
- Windows installer smoke test 仍建议在 Windows 实机或 CI artifact 上做最终确认。
- `npm run lint` 当前通过但仍有 warning 债务，主要集中在 `any`、unused vars 和 React hook deps。
- Renderer 主 bundle 体积仍偏大，拆包和 bundle budget 需要后续推进。

## 2026-06-03

### 新增

- 新增 `docs/release-process.md`，定义最小发布流程。
- 新增根目录 `CHANGELOG.md`，作为发布说明来源。

### 变更

- 明确 changelog 条目是 release note 的生成来源。
- 明确门禁失败时不得发布稳定版；若共享候选版本，必须记录为已知问题或阻断项。

### 修复

- 本次为文档更新，不包含产品修复。

### 已知问题

- 当前基线下 `npm run lint` 尚未通过。
- 当前基线下 `npm test` 尚未通过。
