# DeepSeek Harness Desktop — one-click Windows installer build.
# Run from the `desktop/` directory:
#     powershell -ExecutionPolicy Bypass -File .\build.ps1
# Produces `dist/DeepSeek Harness-Setup-<version>.exe`.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Route Electron / electron-builder binary downloads through a mirror so GitHub
# is not a hard dependency (flaky/blocked in some networks).
if (-not $env:ELECTRON_MIRROR) { $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/' }
if (-not $env:ELECTRON_BUILDER_BINARIES_MIRROR) { $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/' }

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# 1. Verify a usable Node (any 22+ works; it is only the build tool).
Step "Checking Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js 22+ is required to build. Install it from https://nodejs.org" }
$v = & node --version
Write-Host "node $v"

# 2. Install shell tooling (electron, electron-builder, electron-updater).
Step "Installing shell dependencies"
if (-not (Test-Path .\node_modules\electron)) {
  & npm install --no-audit --no-fund
}

# 2b. Ensure pnpm (much faster at resolving the harness dependency tree).
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Step "Installing pnpm (for faster harness bundling)"
  & npm install -g pnpm@11 --no-audit --no-fund
}

# 3. Stage icons + Node runtime + harness closure, then build NSIS installer.
Step "Building installer"
& node .\scripts\build.mjs @args

Write-Host "`nDone. Look in .\dist\ for the setup .exe." -ForegroundColor Green
