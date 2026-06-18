[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$NoBrowser
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
        Fail ("Port {0} is already in use by {1}. Run .\stop-dev.cmd or free the port before retrying." -f $Port, $owner)
    }
}

function Invoke-BackendPreflight {
    param(
        [string]$PythonExe,
        [string]$RootDir
    )

    $preflightCode = @"
import sys
sys.path.insert(0, r'$RootDir')
from cdp_backend.app_factory import create_app
create_app()
print('backend-preflight-ok')
"@

    $output = & $PythonExe -c $preflightCode 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $output
        Fail "Backend preflight failed. The Python environment or backend dependencies are not healthy."
    }
}

function Start-ManagedProcess {
    param(
        [string]$FilePath,
        [string]$ArgumentLine,
        [string]$WorkingDirectory,
        [string]$StdOutLog,
        [string]$StdErrLog,
        [string]$PidFile
    )

    foreach ($logPath in @($StdOutLog, $StdErrLog)) {
        if (Test-Path $logPath) {
            Remove-Item $logPath -Force
        }
    }

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentLine `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $StdOutLog `
        -RedirectStandardError $StdErrLog `
        -PassThru

    Set-Content -Path $PidFile -Value $process.Id -Encoding ascii
    return $process
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Test-HttpAvailable {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    }
    catch {
        return $false
    }
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
    $executablePath = $null
    try {
        $cimProcess = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction Stop
        $commandLine = $cimProcess.CommandLine
        $executablePath = $cimProcess.ExecutablePath
    }
    catch {
    }

    return [pscustomobject]@{
        ProcessId      = $ProcessId
        ProcessName    = $process.ProcessName
        CommandLine    = $commandLine
        ExecutablePath = $executablePath
    }
}

function Test-TrackedProcessAlive {
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

    if (-not $ExpectedProcessName -and $RequiredCommandLinePatterns.Count -eq 0) {
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

function Remove-StalePidFile {
    param([string]$PidFile)

    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Wait-ForFrontendReady {
    param(
        [string]$Url,
        [string]$StdOutLog,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
        }

        if (Test-Path $StdOutLog) {
            $logText = Get-Content $StdOutLog -Raw -ErrorAction SilentlyContinue
            if ($logText -match 'Local:\s+http://127\.0\.0\.1:5173/') {
                Start-Sleep -Milliseconds 500
                try {
                    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
                    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                        return $true
                    }
                }
                catch {
                }
            }
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Read-LogTail {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return "<missing log: $Path>"
    }

    return (Get-Content $Path -Tail 20) -join [Environment]::NewLine
}

function Stop-ProcessTree {
    param([int]$TargetPid)

    if ($TargetPid -le 0) {
        return
    }

    $process = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
    if (-not $process) {
        return
    }

    & taskkill.exe /PID $TargetPid /T /F | Out-Null
}

function Open-FrontendInBrowser {
    param([string]$Url)

    try {
        Start-Process $Url | Out-Null
        Write-Info ("Opened browser: {0}" -f $Url)
    }
    catch {
        Write-Info ("Started services, but could not open the browser automatically: {0}" -f $_.Exception.Message)
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path $scriptDir).Path
$runtimeDir = Join-Path $rootDir '.runtime\dev'
$backendApp = Join-Path $rootDir 'app.py'
$frontendDir = Join-Path $rootDir 'cdp-web'
$backendStdOutLog = Join-Path $rootDir 'backend.stdout.log'
$backendStdErrLog = Join-Path $rootDir 'backend.stderr.log'
$frontendStdOutLog = Join-Path $rootDir 'frontend.stdout.log'
$frontendStdErrLog = Join-Path $rootDir 'frontend.stderr.log'
$backendPidFile = Join-Path $runtimeDir 'backend.pid'
$frontendPidFile = Join-Path $runtimeDir 'frontend.pid'
$backendPort = 5000
$frontendPort = 5173
$backendHealthUrl = ('http://127.0.0.1:{0}/api/health' -f $backendPort)
$frontendUrl = ('http://127.0.0.1:{0}/' -f $frontendPort)

$pythonExe = Resolve-CommandPath -PreferredPath (Join-Path $rootDir '.venv\Scripts\python.exe') -CommandNames @('python.exe', 'python')
$npmExe = Resolve-CommandPath -PreferredPath $null -CommandNames @('npm.cmd', 'npm')
$cmdExe = Resolve-CommandPath -PreferredPath (Join-Path $env:SystemRoot 'System32\cmd.exe') -CommandNames @('cmd.exe')

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

if (-not $cmdExe) {
    Fail "cmd.exe was not found."
}

if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Fail "cdp-web\\node_modules was not found. Run npm install inside cdp-web first."
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

Write-Info ("Project root: {0}" -f $rootDir)
Write-Info ("Backend Python: {0}" -f $pythonExe)
Write-Info ("Frontend npm: {0}" -f $npmExe)
Invoke-BackendPreflight -PythonExe $pythonExe -RootDir $rootDir

$backendRunning = (Test-HttpAvailable -Url $backendHealthUrl) -or (Test-TrackedProcessAlive -PidFile $backendPidFile -ExpectedProcessName 'python' -RequiredCommandLinePatterns @("port=$backendPort", "host='127.0.0.1'"))
$frontendRunning = (Test-HttpAvailable -Url $frontendUrl) -or (Test-TrackedProcessAlive -PidFile $frontendPidFile -ExpectedProcessName 'cmd' -RequiredCommandLinePatterns @('run dev', "--port $frontendPort"))

if (-not $backendRunning) {
    Remove-StalePidFile -PidFile $backendPidFile
    Assert-PortFree -Port $backendPort
}

if (-not $frontendRunning) {
    Remove-StalePidFile -PidFile $frontendPidFile
    Assert-PortFree -Port $frontendPort
}

$backendCode = "from app import app, IS_PRODUCTION; app.run(debug=not IS_PRODUCTION, host='127.0.0.1', port=$backendPort, use_reloader=False)"
$backendArgs = ('-c "{0}"' -f $backendCode.Replace('"', '\"'))
$frontendCommand = ('"{0}" run dev -- --host 127.0.0.1 --port {1}' -f $npmExe, $frontendPort)
$frontendArgs = ('/d /c {0}' -f $frontendCommand)

if ($DryRun) {
    Write-Info "Dry run mode: checks environment only and does not launch services."
    Write-Host ''
    Write-Host 'Backend command preview:' -ForegroundColor Yellow
    Write-Host ('{0} {1}' -f $pythonExe, $backendArgs)
    Write-Host ''
    Write-Host 'Frontend command preview:' -ForegroundColor Yellow
    Write-Host ('{0} {1}' -f $cmdExe, $frontendArgs)
    exit 0
}

$backendProcess = $null
$frontendProcess = $null

try {
    if (-not $backendRunning) {
        $backendProcess = Start-ManagedProcess `
            -FilePath $pythonExe `
            -ArgumentLine $backendArgs `
            -WorkingDirectory $rootDir `
            -StdOutLog $backendStdOutLog `
            -StdErrLog $backendStdErrLog `
            -PidFile $backendPidFile

        if (-not (Wait-ForHttp -Url $backendHealthUrl -TimeoutSeconds 20)) {
            $backendLogTail = Read-LogTail -Path $backendStdErrLog
            if ($backendLogTail -like '<missing*') {
                $backendLogTail = Read-LogTail -Path $backendStdOutLog
            }
            throw "Backend did not become healthy in time.`n$backendLogTail"
        }
    }
    else {
        Write-Info 'Backend is already running. Reusing existing process.'
    }

    if (-not $frontendRunning) {
        $frontendProcess = Start-ManagedProcess `
            -FilePath $cmdExe `
            -ArgumentLine $frontendArgs `
            -WorkingDirectory $frontendDir `
            -StdOutLog $frontendStdOutLog `
            -StdErrLog $frontendStdErrLog `
            -PidFile $frontendPidFile

        if (-not (Wait-ForFrontendReady -Url $frontendUrl -StdOutLog $frontendStdOutLog -TimeoutSeconds 20)) {
            $frontendLogTail = Read-LogTail -Path $frontendStdErrLog
            if ($frontendLogTail -like '<missing*') {
                $frontendLogTail = Read-LogTail -Path $frontendStdOutLog
            }
            throw "Frontend did not become ready in time.`n$frontendLogTail"
        }
    }
    else {
        Write-Info 'Frontend is already running. Reusing existing process.'
    }
}
catch {
    if ($backendProcess) {
        Stop-ProcessTree -TargetPid $backendProcess.Id
    }
    if ($frontendProcess) {
        Stop-ProcessTree -TargetPid $frontendProcess.Id
    }
    Fail $_.Exception.Message
}

Write-Ok 'Backend and frontend are running.'
Write-Host ('Backend URL: http://127.0.0.1:{0}' -f $backendPort)
Write-Host ('Frontend URL: http://127.0.0.1:{0}' -f $frontendPort)
Write-Host ('Backend PID file: {0}' -f $backendPidFile)
Write-Host ('Frontend PID file: {0}' -f $frontendPidFile)
Write-Host ('Backend logs: {0}, {1}' -f $backendStdOutLog, $backendStdErrLog)
Write-Host ('Frontend logs: {0}, {1}' -f $frontendStdOutLog, $frontendStdErrLog)

if (-not $NoBrowser) {
    Open-FrontendInBrowser -Url $frontendUrl
}
