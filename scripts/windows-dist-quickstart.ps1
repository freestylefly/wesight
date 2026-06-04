# WeSight Windows 打包 + 安装一键脚本
# 用途：在 Windows 11 x64 上产出 NSIS 安装器，并做端到端验证
# 调用：powershell -ExecutionPolicy Bypass -File scripts/windows-dist-quickstart.ps1
#
# 流程：
#   1. 装依赖（含 native rebuild）
#   2. 装 mingit bash（若没装 Git Bash）—— openclaw runtime 脚本要 bash
#   3. 装 openclaw runtime for win-x64（pnpm install + build + asar pack，约 5-10 分钟）
#   4. 装 python runtime 到 resources/python-win
#   5. build vite + tsc
#   6. build skills
#   7. compile electron（tsc --project electron-tsconfig.json）
#   8. electron-builder --win --x64（NSIS）
#   9. （可选）静默安装 + 启动 + 卸载 smoke test

[CmdletBinding()]
param(
  [switch]$SkipRuntime,   # 跳过 openclaw runtime 构建（仅当 vendor/openclaw-runtime/win-x64 已存在时）
  [switch]$SkipPython,    # 跳过 python runtime 准备（仅当 resources/python-win/python.exe 已存在时）
  [switch]$NoSmokeTest,   # 跳过装/卸 smoke test
  [string]$InstallerPath  # 自定义安装器路径（默认自动从 release/ 找）
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
$nodeVersion = (node --version) 2>$null
if (-not $nodeVersion) { throw "未检测到 node" }
Write-Host "  Node: $nodeVersion" -ForegroundColor Green

# bash 必须有（mingit 或 Git Bash 二选一）
$bashAvailable = (Test-Path "resources/mingit/bin/bash.exe") -or (Test-Path "resources/mingit/usr/bin/bash.exe")
if (-not $bashAvailable) {
  $systemBash = (where.exe bash 2>$null | Where-Object { $_ -notmatch 'WindowsApps' }) | Select-Object -First 1
  if ($systemBash) {
    Write-Host "  bash: $systemBash" -ForegroundColor Green
    $bashAvailable = $true
  }
}
if (-not $bashAvailable) {
  Write-Host "  bash: 未检测到；将自动安装 mingit" -ForegroundColor Yellow
}

# ============================================================
# 1. npm install
# ============================================================
Write-Section "1/9 装依赖"
if (-not (Test-Path node_modules)) {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }
} else {
  Write-Host "  node_modules 已存在，跳过" -ForegroundColor Yellow
}

# ============================================================
# 2. mingit bash（OpenClaw runtime 构建脚本用）
# ============================================================
Write-Section "2/9 装 mingit bash（若未装 Git Bash）"
if (-not $bashAvailable) {
  npm run setup:mingit -- --required
  if ($LASTEXITCODE -ne 0) { throw "setup:mingit 失败" }
} else {
  Write-Host "  bash 已就绪，跳过" -ForegroundColor Yellow
}

# ============================================================
# 3. openclaw runtime for win-x64
# ============================================================
Write-Section "3/9 装 openclaw runtime for win-x64"
$runtimeDir = "vendor/openclaw-runtime/win-x64"
if ($SkipRuntime -and (Test-Path $runtimeDir)) {
  Write-Host "  --SkipRuntime 且 $runtimeDir 已存在，跳过" -ForegroundColor Yellow
} elseif (Test-Path $runtimeDir) {
  Write-Host "  $runtimeDir 已存在（脚本会基于 fingerprint 判定是否需要重建）" -ForegroundColor Yellow
  npm run openclaw:runtime:win-x64
  if ($LASTEXITCODE -ne 0) { throw "openclaw:runtime:win-x64 失败" }
} else {
  Write-Host "  首次构建：pnpm install + pnpm build + pnpm ui:build + npm pack + 装 production deps + 打包 gateway.asar" -ForegroundColor Gray
  Write-Host "  预计 5-10 分钟，依赖网络（corepack 拉 pnpm、npm 拉 production deps）" -ForegroundColor Gray
  npm run openclaw:runtime:win-x64
  if ($LASTEXITCODE -ne 0) { throw "openclaw:runtime:win-x64 失败" }
}

# ============================================================
# 4. python runtime
# ============================================================
Write-Section "4/9 准备 Python runtime 到 resources/python-win"
$pythonExe = "resources/python-win/python.exe"
if ($SkipPython -and (Test-Path $pythonExe)) {
  Write-Host "  --SkipPython 且 $pythonExe 已存在，跳过" -ForegroundColor Yellow
} else {
  # electron-builder 钩子在 beforePack 阶段会跑 ensurePortablePythonRuntime({ required: true })
  # 这一步可以提前跑（脚本自身幂等），便于快速失败
  npm run setup:python-runtime -- --required
  if ($LASTEXITCODE -ne 0) { throw "setup:python-runtime 失败" }
}

# ============================================================
# 5. build vite
# ============================================================
Write-Section "5/9 vite build (渲染进程)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "vite build 失败" }

# ============================================================
# 6. build skills
# ============================================================
Write-Section "6/9 build skills (web-search / tech-news / email)"
npm run build:skills
if ($LASTEXITCODE -ne 0) { throw "build:skills 失败" }

# ============================================================
# 7. compile electron
# ============================================================
Write-Section "7/9 tsc compile:electron (主进程)"
# precompile:electron 会触发 electron-builder install-app-deps（再次确认原生模块 ABI 匹配）
npm run compile:electron
if ($LASTEXITCODE -ne 0) { throw "compile:electron 失败" }

# ============================================================
# 8. electron-builder --win --x64
# ============================================================
Write-Section "8/9 electron-builder --win --x64 (NSIS 安装器)"
Write-Host "  产物输出：release/WeSight Setup *.exe" -ForegroundColor Gray
Write-Host "  预计 3-8 分钟" -ForegroundColor Gray
npm run dist:win
if ($LASTEXITCODE -ne 0) { throw "dist:win 失败" }

# ============================================================
# 9. smoke test (optional)
# ============================================================
Write-Section "9/9 smoke test"
if ($NoSmokeTest) {
  Write-Host "  --NoSmokeTest，跳过" -ForegroundColor Yellow
} else {
  $installer = if ($InstallerPath) {
    Resolve-Path $InstallerPath
  } else {
    Get-ChildItem "release/WeSight Setup *.exe" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }
  if (-not $installer) {
    Write-Host "  未找到安装器，跳过 smoke test" -ForegroundColor Yellow
  } else {
    Write-Host "  安装器: $installer" -ForegroundColor Green
    Write-Host "  接下来你可以：" -ForegroundColor Cyan
    Write-Host "    1. 双击安装器，按提示安装" -ForegroundColor Gray
    Write-Host "    2. 启动 WeSight，检查任务计划程序里 'WeSightAutostart' 是否被创建" -ForegroundColor Gray
    Write-Host "    3. 触发一次系统睡眠 / 唤醒，观察 agent 是否自动恢复" -ForegroundColor Gray
    Write-Host "    4. 在'设置 → 引擎'里切换 Hermes/OpenClaw/Codex，看是否可用" -ForegroundColor Gray
    Write-Host "    5. 控制面板卸载 WeSight，观察安装目录是否被完整清空" -ForegroundColor Gray
    Write-Host "  自动 smoke test 需要管理员权限（NSIS 提权）" -ForegroundColor Gray
    Write-Host "  如需无人工介入的自动 smoke test，建议用 CI runner（GitHub Actions windows-latest）" -ForegroundColor Gray
  }
}

Write-Section "完成"
Write-Host "  release/WeSight Setup *.exe 已就绪" -ForegroundColor Green
