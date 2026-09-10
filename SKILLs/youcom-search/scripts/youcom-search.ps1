# You.com Search - API-based web search CLI entry point (Windows PowerShell)
# Usage: powershell -File youcom-search.ps1 "query" [max_results] [--freshness week] ...

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillDir = Split-Path -Parent $ScriptDir

# ---- Resolve Node.js runtime ----
$NodeBin = $null
$EnvVars = @{}

# Try system node first
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if ($nodePath) {
    $NodeBin = $nodePath.Path
} elseif ($env:WESIGHT_ELECTRON_PATH -and (Test-Path $env:WESIGHT_ELECTRON_PATH)) {
    $NodeBin = $env:WESIGHT_ELECTRON_PATH
    $EnvVars["ELECTRON_RUN_AS_NODE"] = "1"
} else {
    Write-Error "Node.js runtime not found. Install Node.js or ensure the WeSight Electron binary is available."
    exit 1
}

# ---- Load .env configuration (YDC_API_KEY etc.) ----
$envFile = Join-Path $SkillDir ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $eqIdx = $line.IndexOf("=")
            if ($eqIdx -gt 0) {
                $key = $line.Substring(0, $eqIdx).Trim()
                $value = $line.Substring($eqIdx + 1).Trim()
                [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
}

# ---- Set additional environment variables ----
foreach ($key in $EnvVars.Keys) {
    [System.Environment]::SetEnvironmentVariable($key, $EnvVars[$key], "Process")
}

# ---- Handle @file syntax for non-ASCII queries ----
$processedArgs = @()
foreach ($arg in $args) {
    if ($arg -match "^@(.+)$") {
        $filePath = $Matches[1]
        if (Test-Path $filePath) {
            $content = Get-Content $filePath -Raw -Encoding UTF8
            $processedArgs += $content.Trim()
        } else {
            $processedArgs += $arg
        }
    } else {
        $processedArgs += $arg
    }
}

# ---- Execute core script ----
& $NodeBin (Join-Path $ScriptDir "youcom-search.js") @processedArgs
exit $LASTEXITCODE
