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

$tempPidFile = Join-Path $env:TEMP ('start-dev-regression-{0}.pid' -f [guid]::NewGuid().ToString('N'))

try {
    Set-Content -Path $tempPidFile -Value $PID -Encoding ascii
    if (Test-TrackedProcessAlive -PidFile $tempPidFile) {
        throw 'Expected a random live PowerShell PID to be rejected, but it was treated as a managed dev process.'
    }
}
finally {
    Remove-Item $tempPidFile -Force -ErrorAction SilentlyContinue
}

Write-Host 'start-dev regression test passed'
