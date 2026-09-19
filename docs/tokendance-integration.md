# TokenDance 接入

## 配置入口

打开 **设置 → 模型 → TokenDance → 连接 TokenDance**，在系统浏览器完成授权后返回应用。选择默认模型，点击 **设为默认**，再点击 **保存**。供应商列表与对话模型分组均将 TokenDance 放在首位；已有默认模型仅在用户明确设置后切换。

连接操作会独立保存授权。关闭或取消设置不会删除已经授权的密钥；未完成的授权会取消。重新授权失败时保留原密钥。可从高级设置进入 TokenDance 网站管理或撤销密钥。

**刷新目录**读取公开实时目录，按照下表顺序匹配准确 ID，过滤缺失或不再支持 Chat Completions 的模型，并提示具体 ID。刷新失败保留上次目录。**测试连接**对当前选中模型发送一次简短请求，可能产生正常推理费用。

## 模型与协议

2026-09-19 核验来源：[模型文档](https://tokendance.space/docs/models)、[多协议文档](https://tokendance.space/docs/multi-protocol)、[实时目录](https://tokendance.space/gateway/v1/models)。

| 准确模型 ID | supported_protocols | Claude / 内置 Agent | Codex |
| --- | --- | --- | --- |
| `deepseek-v4.1-flash` | `openai:chat-completions`, `anthropic:messages`, `openai:responses` | 原生 Messages | 原生 Responses |
| `glm-5.3-flash` | `openai:chat-completions`, `anthropic:messages` | 原生 Messages | 本地 Responses → Chat 转换 |
| `glm-5.3` | `openai:chat-completions`, `anthropic:messages` | 原生 Messages | 本地 Responses → Chat 转换 |
| `deepseek-v4-pro-0813` | `openai:chat-completions`, `anthropic:messages`, `openai:responses` | 原生 Messages | 原生 Responses |
| `kimi-k3` | `openai:chat-completions`, `openai:responses` | 本地 Messages → Chat 转换 | 原生 Responses |
| `hy4-preview` | `openai:chat-completions`, `openai:responses` | 本地 Messages → Chat 转换 | 原生 Responses |

默认推荐 `deepseek-v4.1-flash`。普通对话、OpenClaw 及通用 OpenAI 客户端统一使用 Chat Completions。协议选择以主进程保存的目录为准；不向未声明支持的协议发送请求。

复用现有 Claude Agent SDK、Codex 客户端、OpenClaw 和 SSE 请求实现，无需增加 SDK 依赖。

| 协议 | 上游 Base URL | 实际 POST 端点 |
| --- | --- | --- |
| Chat Completions | `https://tokendance.space/gateway/v1` | `/gateway/v1/chat/completions` |
| Responses | `https://tokendance.space/gateway/v1` | `/gateway/v1/responses` |
| Messages | `https://tokendance.space/gateway` | `/gateway/v1/messages` |

## OAuth 与凭据

遵循 [API Key OAuth 文档](https://tokendance.space/docs/api-key-oauth)：使用 PKCE S256，在随机端口的 `127.0.0.1` 回调服务器接收一次性 code；每次授权使用独立随机回调路径和 verifier。浏览器访问 `/auth`，主进程通过 `/portal/api/v1/auth/keys` 换取 API Key。超时、取消及窗口关闭均终止待完成流程。

真实 API Key 只在主进程解密和发往固定 TokenDance 上游时使用，由 Electron `safeStorage` 加密后写入 SQLite。安全存储不可用或 Linux 仅提供 `basic_text` 时拒绝保存。前端只接收连接状态和不透明引用；日志不输出授权 code、verifier 或真实密钥，配置导出不包含 TokenDance 密钥。

Agent 请求通过随机端口的本地网关，使用每次进程启动重新生成的本地访问令牌。网关校验令牌、模型与协议，仅转发到固定 HTTPS 上游，禁止跟随重定向。上游错误正文不会直接透传；余额不足、周期额度、密钥失效分别显示对应提示。流式内容及工具调用保持原协议结构；客户端取消时中止上游请求。

外部 Agent 的持久配置保存凭据引用，应用配置时解析成本地网关地址与临时令牌。使用这些配置需要 WeSight 保持运行；重启 WeSight 后应由 WeSight 重新应用配置并启动 Agent，独立复用旧本地端口不可用。

## 配置字段

无需填写环境变量或手工复制 API Key。

| 位置 | 配置项 | 内容 |
| --- | --- | --- |
| `app_config.providers.tokendance` | `enabled` | 是否用于模型选择 |
| 同上 | `apiKey` / `credentialRef` | `wesight-credential:tokendance` 引用，无真实密钥 |
| 同上 | `baseUrl` / `apiFormat` | 固定 OpenAI Base URL / `openai`，运行时按引擎路由 |
| 同上 | `defaultModel` / `models` | 面板选中模型、目录协议与上下文长度 |
| `app_config.model` | `defaultModel` / `defaultModelProvider` | 用户明确设为默认并保存后更新 |
| SQLite kv | `tokendance.encrypted-key` | 系统安全存储加密后的密钥 |
| SQLite kv | `tokendance.catalog` | 最近一次成功获取的目标模型目录 |

## 改动文件

- `src/shared/tokendance/{constants,translations}.ts`：协议、ID、IPC、错误、双语文案。
- `src/shared/providers/constants.ts`：注册内置供应商及首位顺序。
- `src/main/libs/tokendance/{service,integration}.ts`：OAuth、安全存储、目录、本地网关与 IPC。
- `src/main/{main,preload}.ts`：生命周期、API 代理入口和前端桥接。
- `src/main/libs/claudeSettings.ts`：Claude、Codex、通用模型及 OpenClaw 配置解析。
- `src/main/libs/externalAgentProviderStore.ts`：应用外部 Agent 配置时解析凭据引用。
- `src/renderer/components/settings/TokenDanceSettings.tsx`：授权、默认模型、目录、测试及高级设置面板。
- `src/renderer/components/{Settings,ModelSelector}.tsx`：设置集成、默认模型保存、供应商排序。
- `src/renderer/config.ts`、`services/{config,api,i18n}.ts`、`types/electron.d.ts` 与 `src/main/i18n.ts`：配置类型、规范化、错误翻译和桥接类型。
- 相邻 `.test.ts`：目录校验、OAuth、网关隔离、流式工具调用和引擎协议路由。

## 测试方法

```bash
npm test
npm run build
npm run compile:electron
npm run lint
```

聚焦接入测试：

```bash
npx vitest run src/main/libs/tokendance src/shared/tokendance src/shared/providers/constants.test.ts src/main/libs/claudeSettings.test.ts
```

在 `npm run electron:dev` 中检查中英文界面的首位供应商、六个准确 ID、默认模型保存、目录刷新、未连接时禁用测试，以及高级设置展开。系统密钥链可用时完成真实授权；依次测试六个模型，并分别在 Claude、Codex、OpenClaw 中验证文本流、一次工具调用和停止任务。关闭重启应用，验证凭据仍可用；撤销网站密钥后验证重新授权提示。

已完成真实 Electron 窗口的供应商顺序、模型列表、公开目录刷新、未连接状态与高级设置检查。OAuth 交换、协议矩阵、凭据隔离及流式工具调用由自动化模拟验证；真实账号授权与六个模型的付费推理仍需在用户授权后验证。
