$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'start-dev.ps1'
$scriptText = Get-Content $scriptPath -Raw
$splitMarker = '$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path'
$markerIndex = $scriptText.IndexOf($splitMarker)

if ($markerIndex -lt 0) {
    throw 'Could not isolate function definitions from start-dev.ps1'
}

$functionBlock = $scriptText.Substring(0, $markerIndex)
Invoke-Expression $functionBlock

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$null = Get-ListeningProcess -Port 65534
$stopwatch.Stop()

if ($stopwatch.Elapsed.TotalSeconds -gt 5) {
    throw ('Port detection took too long: {0:N2}s' -f $stopwatch.Elapsed.TotalSeconds)
}

foreach ($unsupportedCommand in @('Get-NetTCPConnection', 'Get-CimInstance')) {
    if ($scriptText.Contains($unsupportedCommand)) {
        throw ("start-dev.ps1 still contains unreliable command: {0}" -f $unsupportedCommand)
    }
}

Write-Host 'start-dev regression test passed'
