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

    $netstatExe = Join-Path $env:SystemRoot 'System32\netstat.exe'
    if (-not (Test-Path $netstatExe)) {
        return @()
    }

    $listeningPids = foreach ($line in (& $netstatExe -ano -p TCP 2>$null)) {
        if ($line -notmatch '^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            continue
        }

        $localEndpoint = $Matches[1]
        $candidatePid = [int]$Matches[2]
        if ($localEndpoint -match (':{0}$' -f $Port)) {
            $candidatePid
        }
    }

    return @($listeningPids | Select-Object -Unique)
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

    $executablePath = $null
    $startTime = $null
    try {
        $executablePath = $process.Path
        $startTime = $process.StartTime
    }
    catch {
    }

    return [pscustomobject]@{
        ProcessId      = $ProcessId
        ProcessName    = $process.ProcessName
        ExecutablePath = $executablePath
        StartTime      = $startTime
    }
}

function Test-TrackedProcessMatch {
    param(
        [string]$PidFile,
        [string]$ExpectedProcessName,
        [string]$ExpectedExecutablePath
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

    if ($ExpectedExecutablePath) {
        if (-not $processDetails.ExecutablePath) {
            return $false
        }

        $expectedPath = [System.IO.Path]::GetFullPath($ExpectedExecutablePath)
        $actualPath = [System.IO.Path]::GetFullPath($processDetails.ExecutablePath)
        if (-not $actualPath.Equals($expectedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $false
        }
    }

    $pidFileTime = (Get-Item $PidFile -ErrorAction SilentlyContinue).LastWriteTime
    if (-not $processDetails.StartTime -or -not $pidFileTime) {
        return $false
    }

    if ([Math]::Abs(($pidFileTime - $processDetails.StartTime).TotalSeconds) -gt 60) {
        return $false
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

    $taskkillOutput = & taskkill.exe /PID $TargetPid /T /F 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Info ("Could not stop tracked PID {0}: {1}" -f $TargetPid, (($taskkillOutput | Out-String).Trim()))
        return $false
    }

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
    @{ Label = 'backend'; PidFile = $backendPidFile; ProcessName = 'python'; ExecutablePath = (Join-Path $rootDir '.venv\Scripts\python.exe') },
    @{ Label = 'frontend'; PidFile = $frontendPidFile; ProcessName = 'cmd'; ExecutablePath = (Join-Path $env:SystemRoot 'System32\cmd.exe') }
)) {
    if (-not (Test-Path $entry.PidFile)) {
        continue
    }

    $removePidFile = $true
    $targetPidValue = Get-TrackedPid -PidFile $entry.PidFile
    if ($targetPidValue -and (Test-TrackedProcessMatch -PidFile $entry.PidFile -ExpectedProcessName $entry.ProcessName -ExpectedExecutablePath $entry.ExecutablePath)) {
        if (Stop-ProcessTree -TargetPid $targetPidValue) {
            $stoppedLabels += $entry.Label
        }
        else {
            $removePidFile = $false
        }
    }

    if ($removePidFile) {
        Remove-Item $entry.PidFile -Force -ErrorAction SilentlyContinue
    }
}

foreach ($entry in @(
    @{ Label = 'backend'; Port = $backendPort },
    @{ Label = 'frontend'; Port = $frontendPort }
)) {
    if (-not (Wait-ForPortClosed -Port $entry.Port -TimeoutSeconds 10)) {
        $remainingPids = (Get-ListeningPids -Port $entry.Port) -join ', '
        Fail ("Port {0} is still open (PID {1}). It was not force-stopped because it could not be safely matched to this project's tracked process." -f $entry.Port, $remainingPids)
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
