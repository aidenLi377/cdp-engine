[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[ OK ] $Message" -ForegroundColor Green
}

function Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    exit 1
}

function Resolve-CommandPath {
    param(
        [string]$PreferredPath,
        [string[]]$CommandNames
    )

    if ($PreferredPath -and (Test-Path $PreferredPath)) {
        return (Resolve-Path $PreferredPath).Path
    }

    foreach ($commandName in $CommandNames) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    return $null
}

function Get-ListeningProcess {
    param([int]$Port)

    $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if (-not $getNetTcpConnection) {
        return $null
    }

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $connection) {
        return $null
    }

    $processName = $null
    try {
        $processName = (Get-Process -Id $connection.OwningProcess -ErrorAction Stop).ProcessName
    }
    catch {
    }

    return [pscustomobject]@{
        Port        = $Port
        ProcessId   = $connection.OwningProcess
        ProcessName = $processName
    }
}

function Assert-PortFree {
    param([int]$Port)

    $listener = Get-ListeningProcess -Port $Port
    if ($listener) {
        $owner = if ($listener.ProcessName) {
            "$($listener.ProcessName) (PID $($listener.ProcessId))"
        }
        else {
            "PID $($listener.ProcessId)"
        }
        Fail ("Port {0} is already in use by {1}. Close it before running this script." -f $Port, $owner)
    }

    $tcpSucceeded = $false
    try {
        $tcpSucceeded = (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded
    }
    catch {
    }

    if ($tcpSucceeded) {
        Fail ("Port {0} is already in use. Free the port and try again." -f $Port)
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path $scriptDir).Path
$backendApp = Join-Path $rootDir 'app.py'
$frontendDir = Join-Path $rootDir 'cdp-web'
$backendLog = Join-Path $rootDir 'backend.stdout.log'
$frontendLog = Join-Path $rootDir 'frontend.stdout.log'
$backendPort = 5000
$frontendPort = 5173

$pythonExe = Resolve-CommandPath -PreferredPath (Join-Path $rootDir '.venv\Scripts\python.exe') -CommandNames @('python.exe', 'python')
$npmExe = Resolve-CommandPath -PreferredPath $null -CommandNames @('npm.cmd', 'npm')
$powerShellExe = Resolve-CommandPath -PreferredPath (Join-Path $PSHOME 'powershell.exe') -CommandNames @('powershell.exe', 'pwsh.exe')

if (-not (Test-Path $backendApp)) {
    Fail ("Backend entry file not found: {0}" -f $backendApp)
}

if (-not (Test-Path $frontendDir)) {
    Fail ("Frontend directory not found: {0}" -f $frontendDir)
}

if (-not $pythonExe) {
    Fail "Python was not found. Install Python or make sure .venv is available."
}

if (-not $npmExe) {
    Fail "npm was not found. Install Node.js first."
}

if (-not $powerShellExe) {
    Fail "PowerShell executable was not found."
}

if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Fail "cdp-web\\node_modules was not found. Run npm install inside cdp-web first."
}

Write-Info ("Project root: {0}" -f $rootDir)
Write-Info ("Backend Python: {0}" -f $pythonExe)
Write-Info ("Frontend npm: {0}" -f $npmExe)

Assert-PortFree -Port $backendPort
Assert-PortFree -Port $frontendPort

$backendCommand = @"
Set-Location '$rootDir'
`$Host.UI.RawUI.WindowTitle = 'CDP Backend'
if (Test-Path '$backendLog') { Remove-Item '$backendLog' -Force }
& '$pythonExe' '$backendApp' *>&1 | Tee-Object -FilePath '$backendLog'
"@

$frontendCommand = @"
Set-Location '$frontendDir'
`$Host.UI.RawUI.WindowTitle = 'CDP Frontend'
if (Test-Path '$frontendLog') { Remove-Item '$frontendLog' -Force }
& '$npmExe' run dev -- --host 127.0.0.1 --port $frontendPort *>&1 | Tee-Object -FilePath '$frontendLog'
"@

if ($DryRun) {
    Write-Info "Dry run mode: checks environment only and does not launch services."
    Write-Host ''
    Write-Host 'Backend command preview:' -ForegroundColor Yellow
    Write-Host $backendCommand
    Write-Host ''
    Write-Host 'Frontend command preview:' -ForegroundColor Yellow
    Write-Host $frontendCommand
    exit 0
}

Start-Process -FilePath $powerShellExe `
    -WorkingDirectory $rootDir `
    -ArgumentList @('-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand) | Out-Null

Start-Sleep -Milliseconds 600

Start-Process -FilePath $powerShellExe `
    -WorkingDirectory $frontendDir `
    -ArgumentList @('-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand) | Out-Null

Write-Ok 'Launch commands for backend and frontend have been sent.'
Write-Host ('Backend URL: http://127.0.0.1:{0}' -f $backendPort)
Write-Host ('Frontend URL: http://127.0.0.1:{0}' -f $frontendPort)
Write-Host ('Backend log: {0}' -f $backendLog)
Write-Host ('Frontend log: {0}' -f $frontendLog)
Write-Host 'If a startup window closes immediately, check the related log file first.'
