# Iris Installer — Windows PowerShell
#
# Usage:
#   irm https://iris.clickbus.com/install.ps1 | iex
#
# What it does:
#   1. Checks for Python 3.11+
#   2. Installs Iris via pip
#   3. Verifies the `iris` command is available
#
# Environment variables:
#   $env:IRIS_VERSION = "latest"   Version to install (default: latest)

$ErrorActionPreference = "Stop"

$VERSION = if ($env:IRIS_VERSION) { $env:IRIS_VERSION } else { "latest" }
$DIST_BASE = "https://iris.clickbus.com/dist"
$MIN_PYTHON_MAJOR = 3
$MIN_PYTHON_MINOR = 11

if ($VERSION -eq "latest") {
    try {
        $VERSION = (Invoke-RestMethod -Uri "$DIST_BASE/latest.txt").Trim()
    } catch {
        Write-Error "Failed to resolve latest version from $DIST_BASE/latest.txt"
        exit 1
    }
}
$WHEEL_URL = "$DIST_BASE/clickbus_iris-$VERSION-py3-none-any.whl"

function Write-Info($msg)  { Write-Host ">>> " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Warn($msg)  { Write-Host ">>> " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Err($msg)   { Write-Host ">>> " -ForegroundColor Red -NoNewline; Write-Host $msg }
function Write-Bold($msg)  { Write-Host $msg -ForegroundColor White }

# --- Detect Python ---
function Find-Python {
    foreach ($cmd in @("python3", "python", "py")) {
        try {
            $version = & $cmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            if ($version) {
                $parts = $version.Split(".")
                $major = [int]$parts[0]
                $minor = [int]$parts[1]
                if ($major -ge $MIN_PYTHON_MAJOR -and $minor -ge $MIN_PYTHON_MINOR) {
                    return $cmd
                }
            }
        } catch {
            continue
        }
    }
    return $null
}

# --- Main ---
Write-Bold "Iris Installer"
Write-Host ""

# Check Python
$python = Find-Python
if (-not $python) {
    Write-Err "Python $MIN_PYTHON_MAJOR.$MIN_PYTHON_MINOR or later is required but not found."
    Write-Host ""
    Write-Host "  Install from: https://www.python.org/downloads/"
    Write-Host "  Or via winget: winget install Python.Python.3.13"
    Write-Host ""
    exit 1
}

$pythonVersion = & $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
Write-Info "Python: $python ($pythonVersion)"

Write-Info "Version: $VERSION"

Write-Host ""

# Install in dedicated venv
$installDir = if ($env:IRIS_HOME) { $env:IRIS_HOME } else { Join-Path $env:USERPROFILE ".iris" }
$venvDir = Join-Path $installDir "venv"
$binDir = Join-Path $installDir "bin"

Write-Info "Installing to $installDir..."

# Create venv
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
& $python -m venv $venvDir 2>&1 | Out-Host

# Install into venv
$venvPip = Join-Path $venvDir "Scripts" "pip.exe"
& $venvPip install --force-reinstall $WHEEL_URL 2>&1 | Out-Host

if ($LASTEXITCODE -ne 0) {
    Write-Err "Installation failed."
    exit 1
}

# Create bin wrapper
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$venvIris = Join-Path $venvDir "Scripts" "iris.exe"
$wrapperPath = Join-Path $binDir "iris.cmd"
Set-Content -Path $wrapperPath -Value "@echo off`n`"$venvIris`" %*"

# Add to PATH if needed
$pathDirs = $env:PATH -split ";"
if ($pathDirs -notcontains $binDir) {
    $env:PATH = "$binDir;$env:PATH"

    # Persist to user PATH
    $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ($userPath -notlike "*$binDir*") {
        [Environment]::SetEnvironmentVariable('PATH', "$binDir;$userPath", 'User')
        Write-Info "Added $binDir to user PATH."
    }
}

$scriptsDir = $binDir

Write-Host ""

# Verify
try {
    $irisHelp = & iris --help 2>&1 | Select-Object -First 1
    Write-Info "Installation successful!"
    Write-Host ""
    Write-Bold $irisHelp
    Write-Host ""
    Write-Host "  Analyze a repo:     iris C:\path\to\repo"
    Write-Host "  Analyze an org:     iris --org C:\path\to\org"
    Write-Host "  Install AI hook:    iris hook install C:\path\to\repo"
    Write-Host "  With trend:         iris C:\path\to\repo --trend"
    Write-Host ""
} catch {
    Write-Warn "iris was installed but is not on PATH."
    Write-Warn "Restart your terminal or add $scriptsDir to PATH."
}

# Optional: check for gh CLI
try {
    $null = & gh --version 2>$null
    Write-Info "GitHub CLI detected — PR analysis will be available."
} catch {
    Write-Warn "GitHub CLI (gh) not found — PR analysis will be skipped."
    Write-Host "  Install: https://cli.github.com/"
}
