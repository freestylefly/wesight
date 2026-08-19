# WeSight

<p align="center">
  <img src="public/readme-banner.svg" alt="WeSight desktop AI agent workspace" width="900">
</p>

<h3 align="center">
  Desktop AI Agent Workspace for Local Coding Agents
</h3>

<p align="center">
  <a href="https://github.com/freestylefly/wesight/stargazers"><img src="https://img.shields.io/github/stars/freestylefly/wesight?style=flat-square&color=1b79ff" alt="GitHub stars"></a>
  <a href="https://github.com/freestylefly/wesight/network/members"><img src="https://img.shields.io/github/forks/freestylefly/wesight?style=flat-square&color=14b8a6" alt="GitHub forks"></a>
  <a href="https://github.com/freestylefly/wesight/releases/latest"><img src="https://img.shields.io/github/v/release/freestylefly/wesight?style=flat-square&color=f59e0b" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/freestylefly/wesight?style=flat-square&color=64748b" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20Apple%20Silicon%20%2B%20Intel-111827?style=flat-square&logo=apple&logoColor=white" alt="macOS Apple Silicon and Intel">
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078d4?style=flat-square&logo=windows11&logoColor=white" alt="Windows x64">
</p>

<p align="center">
  <strong>English</strong> | <a href="README_zh.md">简体中文</a>
</p>

WeSight is an open-source desktop control console for local AI agents. It helps you install or reuse Claude Code, Codex, Kimi Code, OpenClaw, Hermes Agent, OpenCode, Qwen Code, DeepSeek-TUI, and the built-in agent runtime, then gives them a visual workspace for chat, tools, files, IM channels, skills, model providers, runtime metrics, and desktop companion workflows.

> Public releases ship signed and notarized macOS builds for Apple Silicon and Intel, plus a Windows x64 installer. If WeSight helps your agent workflow, a Star makes the project easier for more builders to discover.

## Quick Links

- Website: [wesight.ai](https://wesight.ai/)
- Latest release: [github.com/freestylefly/wesight/releases/latest](https://github.com/freestylefly/wesight/releases/latest)
- Screenshots: [Screenshots](#screenshots)
- Core features: [Core Features](#core-features)
- Agent engines: [Agent Engines](#agent-engines)
- Product roadmap: [Product Roadmap](https://github.com/users/freestylefly/projects/1)
- Development: [Quick Start](#quick-start)

## Why WeSight

Terminal-native coding agents are powerful, while their setup, model routing, permissions, IM entry points, file changes, and runtime metrics often live in separate places. WeSight turns those moving pieces into one desktop workspace:

- Install, detect, and reuse local agent CLIs from a beginner-friendly UI.
- Run coding agents through a visual chat with tool panels, slash commands, file diffs, and permission prompts.
- Connect agent tasks to IM channels such as Feishu, with per-engine configuration.
- Track every task with engine, model, token usage, TTFT, TPS, tool latency, steps, status, and duration.
- Extend workflows through SkillHub skills, built-in skills, scheduled tasks, memory, and a desktop pet that follows active work.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="public/readme/screenshots/cowork-chat.png" alt="WeSight Cowork chat">
    </td>
    <td width="50%">
      <img src="public/readme/screenshots/agent-engines.png" alt="WeSight agent engine settings">
    </td>
  </tr>
  <tr>
    <td><strong>Cowork Chat</strong><br>Run local coding agents as a desktop chat with engine and model controls.</td>
    <td><strong>Agent Engines</strong><br>Configure Claude Code, Codex, Kimi Code, OpenClaw, Hermes Agent, OpenCode, Qwen Code, DeepSeek-TUI, and the built-in runtime.</td>
  </tr>
  <tr>
    <td width="50%">
      <img src="public/readme/screenshots/runtime-dashboard.png" alt="WeSight runtime dashboard">
    </td>
    <td width="50%">
      <img src="public/readme/screenshots/live-workspace.png" alt="WeSight live workspace">
    </td>
  </tr>
  <tr>
    <td><strong>AI Runtime Dashboard</strong><br>Inspect engine, model, tokens, TTFT, output-phase TPS, estimated model TPS, cost, and status.</td>
    <td><strong>Live Workspace</strong><br>Watch file writes, code changes, tool activity, and generated artifacts while the agent works.</td>
  </tr>
  <tr>
    <td width="50%">
      <img src="public/readme/screenshots/skills-marketplace.png" alt="WeSight skills marketplace">
    </td>
    <td width="50%">
      <img src="public/readme/screenshots/studio-pet.png" alt="WeSight studio and desktop companion">
    </td>
  </tr>
  <tr>
    <td><strong>Skills Marketplace</strong><br>Browse SkillHub categories, install skills locally, and manage installed skills from WeSight.</td>
    <td><strong>Studio & Pet</strong><br>Use a visual office-style workspace and desktop companion to follow active agent tasks.</td>
  </tr>
</table>

## Core Features

- **Agent Engines** - Run Claude Code, Codex, Kimi Code, OpenClaw, Hermes Agent, OpenCode, Qwen Code, DeepSeek-TUI, or the built-in runtime from the same workspace.
- **One-click setup** - On macOS, WeSight can install supported local CLIs or detect the ones already present on the machine.
- **Unified model providers** - Configure official OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, Moonshot, Ollama, OpenRouter, GitHub Copilot, and custom OpenAI-compatible endpoints.
- **Local CLI configuration** - Use existing Claude Code, Codex, Kimi Code, OpenClaw, Hermes Agent, OpenCode, Qwen Code, or DeepSeek-TUI accounts and config when you already have a working terminal setup.
- **Graphical tool execution** - View commands, files, permissions, slash commands, outputs, generated images, and tool results inside the chat flow.
- **IM Agent Hub** - Route Feishu messages into OpenClaw, Hermes Agent, Claude Code, or Codex, with per-engine bot profiles.
- **AI Runtime Dashboard** - Measure calls by engine, model, source, status, tokens, completion time, TTFT, output-phase TPS, estimated model TPS, tool latency, and agent steps.
- **Live Workspace** - Open a right-side workspace for live code writing, static diffs, runtime monitoring, task todos, skills, and artifacts.
- **SkillHub Marketplace** - Discover, categorize, install, enable, disable, update, and remove local WeSight skills.
- **Scheduled Tasks** - Create recurring agent jobs for research, reports, monitoring, inbox cleanup, and reminders.
- **Memory and personalization** - Extract useful preferences from conversations and reuse them across future sessions.
- **Desktop pet and studio** - Keep a lightweight desktop companion and a pixel-style studio view for active tasks.

## ❤️ Sponsors

> [Want to appear here?](public/readme/community/wechat-personal.jpg) Add me on WeChat and include your product name plus a short project sponsorship note in the friend request.

| Sponsor | Description |
| ------- | ----------- |
| <a href="https://pptoken.cc/"><img src="public/readme/sponsors/pptoken.png" alt="PPToken" width="240"></a> | Project sponsor. PPToken provides API relay and key distribution for ChatGPT, Claude, Gemini and other mainstream AI models, with low latency, high availability, pay-as-you-go billing, and flexible subscription plans. |
| <a href="https://ciyuan.today/"><img src="public/readme/sponsors/ciyuan-api.jpg" alt="Ciyuan API" width="240"></a> | Project sponsor. Ciyuan API aims to become a one-stop AI interface platform for developers, providing stable, low-latency, and highly available large model API services to make AI application development simpler. |

## Agent Engines

| Engine           | Best For                                                    | Setup Path                                      |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Built-in runtime | General desktop cowork sessions and skills                  | Included in WeSight                             |
| Claude Code      | Claude Code workflows with a graphical chat surface         | One-click install or existing local CLI config  |
| Codex            | Codex CLI workflows, local task execution, and IM control   | One-click install or existing local CLI config  |
| Kimi Code        | Kimi Code workflows with local login, Skills, and MCP       | Official installer or existing local CLI config |
| OpenClaw         | Runtime gateway, IM channels, sandbox-style agent work      | Local runtime/CLI reuse or WeSight setup flow   |
| Hermes Agent     | Local Hermes Agent gateway and IM-style runtime experiments | Official installer or existing local CLI config |
| OpenCode         | OpenCode terminal agent workflows                           | One-click install or existing local CLI config  |
| Qwen Code        | Qwen-friendly coding workflows and DashScope setups         | One-click install or existing local CLI config  |
| DeepSeek-TUI     | DeepSeek-TUI HTTP/SSE runtime and tool streaming            | One-click install or existing local CLI config  |

## Model Providers

WeSight keeps model setup in one place, then maps it into the selected engine when that engine follows WeSight settings.

- Add multiple providers and models.
- Use official OpenAI, Anthropic Claude, and Google Gemini providers.
- Add OpenAI-compatible providers for DeepSeek, Qwen, Moonshot, Ollama, OpenRouter, GitHub Copilot, local gateways, or private endpoints.
- Switch between WeSight-managed model settings and existing local CLI configuration.
- Import or sync local engine configuration when you want WeSight to manage it.

## Download

Public desktop builds are published through GitHub Releases:

- Website: [wesight.ai](https://wesight.ai/)
- Latest release: [github.com/freestylefly/wesight/releases/latest](https://github.com/freestylefly/wesight/releases/latest)

Each stable release includes signed and notarized macOS Apple Silicon and Intel builds, a Windows x64 installer, update metadata, and SHA256 checksums. The Windows installer is currently unsigned and may trigger Microsoft Defender SmartScreen. CI artifacts are short-lived build outputs for maintainers to test before a release is published.

## Download And Install

### macOS

Download the matching DMG from the [latest release](https://github.com/freestylefly/wesight/releases/latest): `WeSight.<version>.mac.arm64.dmg` for Apple Silicon or `WeSight.<version>.mac.x64.dmg` for Intel. The release workflow signs, notarizes, and staples both packages. Open the DMG and drag `WeSight.app` into the `Applications` folder.

<p align="center">
  <img src="public/readme/tutorial/install-dmg.svg" alt="WeSight DMG install guide" width="760">
</p>

### Windows

Download `WeSight.Setup.<version>.exe` from the same release. The current Windows x64 installer has no code-signing certificate, so SmartScreen may show an unrecognized app warning. Check the file against `SHASUMS256.txt` before continuing.

## Quick Start

### Requirements

- Node.js `>=24 <25`
- npm

### Development

```bash
git clone https://github.com/freestylefly/wesight.git
cd wesight
npm install
npm run electron:dev
```

The Vite dev server runs at `http://localhost:5175`.

### Website Development

The public website lives in `website/` with its own dependencies and lock file. Install and run it independently from the Electron application:

```bash
npm ci --prefix website
npm run website:dev
```

The website development server runs at `http://127.0.0.1:5173`. Production build and preview commands are available from the repository root:

```bash
npm run website:build
npm run website:preview
```

The existing `wesight-portal` Vercel project uses `website` as its Root Directory, Vite as its framework, Node.js 24.x, and `main` as its Production Branch. Pull requests create Preview Deployments and pushes to `main` create Production Deployments. For a manual preview from an authenticated maintainer machine:

```bash
cd website
vercel link --project wesight-portal --scope canghes-projects
vercel deploy
```

Website download buttons use `website/api/download.js` to resolve the matching macOS DMG or Windows x64 EXE from the latest public GitHub Release. Keep the `arm64` and `x64` DMG assets plus `WeSight.Setup.<version>.exe` attached to each production release.

Keep `.vercel/`, local environment files, `node_modules/`, and `dist/` out of Git. The `website/design-reference/` directory contains source concepts for design reference and is excluded from production static assets.

### Development With Agent Runtimes

```bash
# Start WeSight and detect supported local agent CLIs from Settings
npm run electron:dev

# Convenience aliases currently point to the same development entry
npm run electron:dev:openclaw
npm run electron:dev:hermes
```

Useful OpenClaw development variables:

```bash
# Override OpenClaw source location
OPENCLAW_SRC=/path/to/openclaw npm run electron:dev:openclaw

# Force OpenClaw runtime rebuild
OPENCLAW_FORCE_BUILD=1 npm run electron:dev:openclaw

# Skip OpenClaw version checkout for local OpenClaw development
OPENCLAW_SKIP_ENSURE=1 npm run electron:dev:openclaw
```

## Build

```bash
# TypeScript + Vite
npm run build

# Electron main process
npm run compile:electron

# ESLint
npm run lint

# Public website
npm run website:build
```

## Packaging

```bash
# macOS
npm run dist:mac

# macOS single-architecture packages
npm run dist:mac:x64
npm run dist:mac:arm64

# Do not use npm run dist:mac:universal until native modules have an
# explicit merge strategy for both macOS architectures.

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

Managed runtime metadata is declared in `package.json`. Generated runtime folders, build artifacts, local secrets, and packaged release output are ignored by Git.

## Automated Releases

The `Build Platforms` GitHub Actions workflow builds macOS Apple Silicon, macOS Intel, and Windows x64 in parallel. A manual workflow run performs build-only validation and uploads three Actions Artifacts. A `v*` tag run publishes a GitHub Release after every platform succeeds.

Release versions use SemVer. Update the root `package.json` version through a normal pull request before creating the tag. From a clean, synchronized `main` branch, validate and publish the tag with:

```bash
npm run release:tag -- 1.0.1 --dry-run
npm run release:tag -- 1.0.1
```

The command verifies the branch, working tree, `origin/main`, package version, and local and remote tags. It then creates an annotated `v1.0.1` tag and pushes only that tag. Prerelease versions such as `1.1.0-rc.1` are published as GitHub prereleases; stable versions become the Latest release.

macOS signing and notarization use these GitHub Actions secrets:

- `APPLE_ID`
- `APPLE_APP_PWD`
- `APPLE_TEAM_ID`
- `MACOS_CERTIFICATE`
- `MACOS_CERTIFICATE_PWD`

Do not put certificate contents or passwords in repository files or workflow logs. Windows signing remains disabled until a Windows code-signing certificate is configured.

If a platform job fails, rerun the failed GitHub Actions jobs for the same commit or tag. The release job waits for all three platforms and uses asset replacement when the release already exists, so a safe rerun updates the existing assets without creating a duplicate release.

## Architecture

WeSight uses Electron process isolation. The renderer never directly accesses Node.js APIs; privileged operations go through a typed preload bridge and IPC handlers in the main process.

<p align="center">
  <img src="public/readme-architecture.svg" alt="WeSight architecture principle diagram" width="960">
</p>

### Main Process

- Window lifecycle, tray behavior, desktop pet windows, and deep links
- SQLite persistence for settings, sessions, messages, runtime calls, skills, and auth tokens
- Agent engine routing and external CLI adapters
- OpenClaw and Hermes gateway lifecycle helpers
- IM gateway integrations and native Feishu routing
- Skill management, scheduled tasks, file activity tracking, and runtime telemetry

### Renderer

- React + Redux Toolkit + Tailwind CSS
- Cowork chat UI, studio view, live workspace, runtime dashboard, and artifacts
- Engine selector, model selector, settings, skills, MCP, agents, IM, memory, and appearance UI
- Stream rendering for messages, tool calls, command output, slash command panels, files, images, and permission prompts

### Key Directories

```text
src/main/
  main.ts                         Electron entry and IPC handlers
  preload.ts                      Safe renderer bridge
  sqliteStore.ts                  Local persistence
  coworkStore.ts                  Session and message storage
  libs/agentEngine/               Engine adapters and router
  libs/externalAgent*.ts          External CLI setup and config helpers
  im/                             IM gateway integrations

src/renderer/
  App.tsx                         App shell
  components/cowork/              Chat, studio, activity workspace, engine UI
  components/Settings.tsx         Model, engine, IM, skills, memory, and app settings
  components/pet/                 Desktop companion UI
  services/                       IPC wrappers and app services
  store/slices/                   Redux state

SKILLs/                           Built-in skills
scripts/                          Runtime, packaging, and setup scripts
src/shared/                       Shared constants and types
```

## Built-in Skills

WeSight includes a broad skills library for day-to-day agent work and connects to SkillHub for marketplace installation.

| Area           | Examples                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| Research       | web search, tech news, stock research, film/music search                  |
| Documents      | DOCX, XLSX, PPTX, PDF processing                                          |
| Automation     | Playwright, local tools, scheduled tasks                                  |
| Creative       | Remotion video, frontend design, canvas design, image and video workflows |
| Communication  | IMAP/SMTP email and IM channels                                           |
| Agent building | skill creator, skill vetting, custom planning                             |

Skills can be installed, enabled, disabled, deleted, and routed from the desktop UI.

## Security Model

- Context isolation is enabled.
- Node integration is disabled in the renderer.
- Sensitive operations run through main-process IPC.
- Tool execution can surface permission requests before running.
- Local data is stored in SQLite under the app data directory.
- Runtime folders, build artifacts, generated assets, and local secrets are ignored by Git.

## Product Roadmap

Check out the [WeSight Product Roadmap](https://github.com/users/freestylefly/projects/1) for current priorities, planned features, and larger product directions. Feel free to [open an issue](https://github.com/freestylefly/wesight/issues) if there is something you want to see.

## Community WeChat Group

Scan the QR code below to join the WeSight WeChat group and talk with other builders. The QR code is valid until June 13, 2026; if it expires, follow the official account below to get the latest invite.

<p align="center">
  <img src="public/readme/community/wechat-group.jpg" alt="WeSight WeChat Group" width="320">
</p>

## Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=freestylefly/wesight&type=Date)](https://star-history.dera.page/#freestylefly/wesight&Date)

## WeChat Official Account

Search **苍何** on WeChat or scan the QR code below to follow Canghe's original WeChat official account. Reply with **AI** to get more AI prompt and agent workflow resources.

<p align="center">
  <img src="public/wechat-official-account.png" alt="Canghe WeChat Official Account" width="760">
</p>

## Acknowledgements

WeSight is shaped by many excellent open-source projects and agent community practices. Special thanks to:

- [LobsterAI](https://github.com/netease-youdao/LobsterAI) for inspiration around desktop personal assistant agents, README structure, and open-source launch practice.
- [OpenClaw](https://github.com/openclaw/openclaw) for exploring local agent runtimes, gateways, and IM agent capabilities.
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) for local agent runtime, gateway, and model configuration ideas.
- [Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI) for the pixel-style AI studio inspiration.
- [SkillHub](https://skillhub.lol/skills) for ideas around skill discovery, installation, and marketplace flows.
- The terminal-agent ecosystem around Claude Code, Codex, Kimi Code, OpenCode, Qwen Code, DeepSeek-TUI, and the builders pushing local AI agent workflows forward.

## License

MIT. See [LICENSE](LICENSE).

## Thank You to Our Contributors

Thanks to everyone who has contributed PRs to WeSight. This wall updates automatically from GitHub contributors data after new contributions are merged.

<div align="center">

[![WeSight Contributors](https://contrib.rocks/image?repo=freestylefly/wesight)](https://github.com/freestylefly/wesight/graphs/contributors)

</div>
