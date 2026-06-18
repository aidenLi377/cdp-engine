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

function Get-TrackedPid {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return $null
    }

    $pidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $pidText) {
        return $null
    }

    $trackedPid = 0
    if ([int]::TryParse($pidText.Trim(), [ref]$trackedPid)) {
        return $trackedPid
    }

    return $null
}

function Get-ProcessDetails {
    param([int]$ProcessId)

    if ($ProcessId -le 0) {
        return $null
    }

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) {
        return $null
    }

    $commandLine = $null
    try {
        $cimProcess = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction Stop
        $commandLine = $cimProcess.CommandLine
    }
    catch {
    }

    return [pscustomobject]@{
        ProcessId   = $ProcessId
        ProcessName = $process.ProcessName
        CommandLine = $commandLine
    }
}

function Test-TrackedProcessMatch {
    param(
        [string]$PidFile,
        [string]$ExpectedProcessName,
        [string[]]$RequiredCommandLinePatterns = @()
    )

    $trackedPid = Get-TrackedPid -PidFile $PidFile
    if (-not $trackedPid) {
        return $false
    }

    $processDetails = Get-ProcessDetails -ProcessId $trackedPid
    if (-not $processDetails) {
        return $false
    }

    if ($ExpectedProcessName -and $processDetails.ProcessName -ne $ExpectedProcessName) {
        return $false
    }

    foreach ($pattern in $RequiredCommandLinePatterns) {
        if (-not $pattern) {
            continue
        }

        if (-not $processDetails.CommandLine) {
            return $false
        }

        if ($processDetails.CommandLine.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
            return $false
        }
    }

    return $true
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
    @{ Label = 'backend'; PidFile = $backendPidFile; ProcessName = 'python'; Patterns = @("port=$backendPort", "host='127.0.0.1'") },
    @{ Label = 'frontend'; PidFile = $frontendPidFile; ProcessName = 'cmd'; Patterns = @('run dev', "--port $frontendPort") }
)) {
    if (-not (Test-Path $entry.PidFile)) {
        continue
    }

    $targetPidValue = Get-TrackedPid -PidFile $entry.PidFile
    if ($targetPidValue -and (Test-TrackedProcessMatch -PidFile $entry.PidFile -ExpectedProcessName $entry.ProcessName -RequiredCommandLinePatterns $entry.Patterns)) {
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
