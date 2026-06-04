# WeSight Windows 移植 PR 一键 push 脚本
#
# 用途：把本地 2 个分支推到 fork
# 前置：gh CLI 已登录 OR GitHub 已配置 credential helper
#
# 用法（在 PowerShell 中）：
#   cd c:\path\to\wesight-main
#   .\scripts\push-prs-to-fork.ps1

[CmdletBinding()]
param(
  [string]$RemoteName = 'origin',
  [string]$ForkBranchBase = 'windows-porting-base',
  [string]$ForkBranchBugfix = 'windows-bugfix'
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "==> 推送 PR1 分支：$ForkBranchBase" -ForegroundColor Cyan
git push -u $RemoteName "$ForkBranchBase"
if ($LASTEXITCODE -ne 0) { throw "推送 $ForkBranchBase 失败" }

Write-Host "==> 推送 PR2 分支：$ForkBranchBugfix" -ForegroundColor Cyan
git push -u $RemoteName "$ForkBranchBugfix"
if ($LASTEXITCODE -ne 0) { throw "推送 $ForkBranchBugfix 失败" }

Write-Host ""
Write-Host "==> 推送完成。请在 GitHub 上发起 PR：" -ForegroundColor Green
Write-Host "  PR1: https://github.com/freestylefly/wesight/compare/main...feibang191:wesight:windows-porting-base" -ForegroundColor Cyan
Write-Host "  PR2: https://github.com/freestylefly/wesight/compare/main...feibang191:wesight:windows-bugfix" -ForegroundColor Cyan
Write-Host ""
Write-Host "或用 gh CLI 一次性创建两个 PR（需先 gh auth login）：" -ForegroundColor Yellow
Write-Host '  gh pr create --repo freestylefly/wesight --base main --head feibang191:windows-porting-base --title "feat(win): add Windows porting surface" --body-file docs/prs/pr-1-windows-porting-base.md' -ForegroundColor Gray
Write-Host '  gh pr create --repo freestylefly/wesight --base main --head feibang191:windows-bugfix --title "fix(win): 4 engine routing bugs and switch lag" --body-file docs/prs/pr-2-windows-bugfixes.md' -ForegroundColor Gray
