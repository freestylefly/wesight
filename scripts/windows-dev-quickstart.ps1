# WeSight Windows 开发模式一键启动脚本
# 用途：在干净 Windows 11 x64 机器上零修改启动 dev 模式
# 调用：powershell -ExecutionPolicy Bypass -File scripts/windows-dev-quickstart.ps1
#
# 设计原则：
# - 失败立即退出（$ErrorActionPreference = 'Stop'）
# - 所有中间产物可缓存（setup:mingit / setup:python-runtime 自身已幂等）
# - 不需要 WSL；用 Git Bash / 捆绑 mingit 二选一
# - 适配 Node 24（engines: ">=24 <25"）

[CmdletBinding()]
param(
  [switch]$SkipMingit,    # 跳过 mingit 安装（如果系统已装 Git Bash）
  [switch]$SkipPnpm,      # 跳过 pnpm 安装
  [int]$VitePort = 5175
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $ProjectRoot

function Write-Section($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

# ============================================================
# 前置检查
# ============================================================
Write-Section "检查环境"

# 1. Node 版本（engines: >=24 <25）
$nodeVersion = (node --version) 2>$null
if (-not $nodeVersion) {
  throw "未检测到 node。请先安装 Node 24 LTS：https://nodejs.org/"
}
$nodeMajor = [int]($nodeVersion -replace '^v(\d+)\..*$', '$1')
if ($nodeMajor -lt 24) {
  throw "WeSight 要求 Node 24+，当前是 $nodeVersion"
}
Write-Host "  Node: $nodeVersion" -ForegroundColor Green

# 2. npm
$npmVersion = (npm --version) 2>$null
if (-not $npmVersion) {
  throw "未检测到 npm。请用 Node 24 自带 npm"
}
Write-Host "  npm:  $npmVersion" -ForegroundColor Green

# 3. bash（dev 模式不会调 bash，但 postinstall 的 patch-package 可能在边缘场景触发）
#    这一步只警告，不阻断
$bashLocations = @()
try {
  $bashLocations = (where.exe bash 2>$null) -split "`r?`n" | Where-Object { $_ }
} catch {}
if ($bashLocations.Count -gt 0) {
  $gitBash = $bashLocations | Where-Object { $_ -notmatch 'WindowsApps' } | Select-Object -First 1
  if ($gitBash) {
    Write-Host "  bash: $gitBash" -ForegroundColor Green
  } else {
    Write-Host "  bash: 仅检测到 WSL bash（不推荐；dev 模式可接受，pack 模式需要 Git Bash）" -ForegroundColor Yellow
  }
} else {
  Write-Host "  bash: 未检测到（dev 模式不需要；pack 模式必须装 Git Bash 或跑 setup:mingit）" -ForegroundColor Yellow
}

# ============================================================
# 依赖安装
# ============================================================
Write-Section "安装 npm 依赖（含原生模块 rebuild）"
# postinstall 会自动跑：
#   1. patch-package（应用 patches/ 下的 patch）
#   2. electron-builder install-app-deps（为 better-sqlite3 等原生模块装对应 Electron ABI 版本）
# 这一步是 dev 模式最大卡点，必须在 Windows 上原生编译。
# 编译工具链需求：Visual Studio Build Tools 2022 with "Desktop development with C++"
#   （含 Windows 10/11 SDK + MSVC v143 + C++ CMake tools）
# 下载：https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 如果上一步没有 MSBuild，下面这条会失败。

if (Test-Path node_modules) {
  Write-Host "  node_modules 已存在；跳过 npm install（如果你想强制重装：Remove-Item -Recurse node_modules）" -ForegroundColor Yellow
} else {
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install 失败。如果错误信息是 node-gyp / MSB 找不到，先装 Visual Studio Build Tools 2022"
  }
}

# ============================================================
# 启动 vite + electron
# ============================================================
Write-Section "启动 dev 模式（vite 5175 + electron）"
Write-Host "  接下来会：先清 dist-electron，跑 tsc --project electron-tsconfig.json，" -ForegroundColor Gray
Write-Host "  然后并发拉起 vite 和 electron。首次会编译主进程 + 渲染进程。" -ForegroundColor Gray
Write-Host "  关闭任一窗口即终止整个 dev 会话。" -ForegroundColor Gray
Write-Host ""

# electron:dev = concurrently "vite --port 5175" "wait-on ... && start:electron"
# start:electron = cross-env NODE_ENV=development ELECTRON_START_URL=http://localhost:5175 electron .
npm run electron:dev -- --port $VitePort
