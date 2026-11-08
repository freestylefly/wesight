# Changelog

本文档记录 WeSight 的重要变更。

发布说明应从对应版本条目生成。

## 1.0.12 - 2026-11-08

内置供应商接入词元 API，保留旧 OpenLux 账号，并修复中转模型迁移与 macOS 公证查询的重试处理。

### 新增

- 新增词元 API 内置供应商，支持 API Key 配置、账号模型刷新、连接测试、模型原厂分类、搜索和默认模型选择。

### 变更

- 词元 API 位于 TokenDance 后，默认使用 https://ciyuan.today/v1 和 OpenAI 兼容协议，提供令牌管理与接入文档入口。
- 已有 OpenLux 账号保留为可编辑的自定义供应商，继续沿用原有密钥、接口地址和会话模型身份。
- 设置与聊天模型选择器支持词元 API 中英文名称，并按供应商身份选择同名模型。

### 修复

- 默认模型迁移按供应商判断已移除模型，避免词元 API、OpenLux 和自定义供应商的同名模型被误替换。
- macOS DMG 公证查询支持断网重试和超时续查，继续等待原提交的结果，构建失败时保留安装包以便恢复处理。

### 已知问题

- 词元 API 的真实账号模型调用尚未逐项自动验收，可在设置中填写 API Key 后测试连接。
- 部分本地开发环境的任务看板后台服务启动仍有 stdio 错误，可查看 taskboard.log 排查。
- 现有 ESLint 警告与主界面 bundle 体积问题仍待后续处理。

## 1.0.11 - 2026-11-08（未发布）

v1.0.11 的 macOS DMG 公证遇到网络中断与等待超时，未生成正式 Release。相关功能与发布修复统一由 v1.0.12 发布。

## 1.0.10 - 2026-11-08

新增 Kimi 双模式配置，包含 OpenLux 模型分类，并改进 OpenClaw 网关配置与窗口加载稳定性。

### 新增

- Kimi 设置新增 Code 模式和通用 API 切换，两种模式分别保存密钥、请求地址、模型列表和默认模型。
- 包含 v1.0.9 的 OpenLux 模型供应商、模型原厂分类、搜索和默认模型管理功能。

### 变更

- 旧版 Kimi Code 配置自动迁移至 OpenAI 兼容端点与专用模型，配置导入导出加密保存两种模式的密钥。
- Kimi 模式支持点击与键盘切换，并显示当前模式、自动配置地址和连接测试状态。

### 修复

- 处理 Moonshot 工具参数中的本地引用、联合类型和常量，服务端拒绝过大的工具定义时进行有限次数重试。
- OpenClaw 配置同步保留网关生成的认证凭据，并合并已有 HTTP 端点配置。
- 开发环境的页面加载恢复忽略取消的导航与子框架失败，避免重复重试。

### 已知问题

- OpenLux、Kimi 真实账号与付费推理尚未逐项验收。
- 部分本地开发环境的任务看板后台服务启动仍有 stdio 错误，可查看 taskboard.log 排查。
- 现有 ESLint 警告与主界面 bundle 体积问题仍待后续处理。

## 1.0.9 - 2026-10-01

新增 OpenLux 模型供应商与模型原厂分类，统一设置页和 Chat 的搜索、选择及默认模型管理体验。

### 新增

- 新增 OpenLux 模型供应商，位于 TokenDance 后，支持 API Key、账号模型列表刷新、连接测试和默认模型选择。
- OpenLux 模型列表按 OpenAI、Google、Anthropic 等模型原厂分类，支持名称与模型 ID 搜索、编辑和手动添加。

### 变更

- Chat 模型选择器整合供应商与模型列表，显示 OpenLux 模型来源，并沿用现有主题、圆角和交互风格。
- 完善上下展开、窄窗口布局、键盘操作与中英文显示，保留旧配置、手动添加模型和其他供应商的选择方式。

### 修复

- 使用供应商与模型 ID 共同确定模型身份，确保 OpenLux 同名模型通过对应账号和 OpenAI 兼容接口调用。
- 保存、重载及导入导出模型配置时保留模型分类、图像能力与默认模型选择。

### 已知问题

- OpenLux 真实账号与付费推理尚未验收；请填写自己的 API Key，刷新账号模型列表后进行连接测试。
- 部分本地开发环境的任务看板后台服务启动仍有 stdio 错误；可查看 taskboard.log 排查，当前模型设置页正常。
- 现有 ESLint 警告与主界面 bundle 体积问题仍待后续处理。

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
