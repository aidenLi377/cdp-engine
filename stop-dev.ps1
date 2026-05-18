[CmdletBinding()]
param()

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

function Get-ListeningPids {
    param([int]$Port)

    $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if (-not $getNetTcpConnection) {
        return @()
    }

    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

function Stop-ProcessTree {
    param([int]$TargetPid)

    if ($TargetPid -le 0) {
        return $false
    }

    $process = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
    if (-not $process) {
        return $false
    }

    & taskkill.exe /PID $TargetPid /T /F | Out-Null
    return $true
}

function Wait-ForPortClosed {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 10
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (-not (Get-ListeningPids -Port $Port)) {
            return $true
        }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)

    return $false
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path $scriptDir).Path
$runtimeDir = Join-Path $rootDir '.runtime\dev'
$backendPidFile = Join-Path $runtimeDir 'backend.pid'
$frontendPidFile = Join-Path $runtimeDir 'frontend.pid'
$backendPort = 5000
$frontendPort = 5173

$stoppedLabels = @()

foreach ($entry in @(
    @{ Label = 'backend'; PidFile = $backendPidFile },
    @{ Label = 'frontend'; PidFile = $frontendPidFile }
)) {
    if (-not (Test-Path $entry.PidFile)) {
        continue
    }

    $pidText = (Get-Content $entry.PidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    $targetPidValue = 0
    if ([int]::TryParse($pidText, [ref]$targetPidValue)) {
        if (Stop-ProcessTree -TargetPid $targetPidValue) {
            $stoppedLabels += $entry.Label
        }
    }

    Remove-Item $entry.PidFile -Force -ErrorAction SilentlyContinue
}

foreach ($entry in @(
    @{ Label = 'backend'; Port = $backendPort },
    @{ Label = 'frontend'; Port = $frontendPort }
)) {
    foreach ($listeningPidValue in (Get-ListeningPids -Port $entry.Port)) {
        if (Stop-ProcessTree -TargetPid $listeningPidValue) {
            $stoppedLabels += ('{0} listener' -f $entry.Label)
        }
    }

    if (-not (Wait-ForPortClosed -Port $entry.Port -TimeoutSeconds 10)) {
        Fail ("Port {0} is still open after stop attempt." -f $entry.Port)
    }
}

if ($stoppedLabels.Count -eq 0) {
    Write-Info 'No running backend or frontend process was found.'
}
else {
    Write-Ok ('Stopped: {0}' -f (($stoppedLabels | Select-Object -Unique) -join ', '))
}

Write-Host ('Backend port {0}: closed' -f $backendPort)
Write-Host ('Frontend port {0}: closed' -f $frontendPort)
