param([string]$ZoteroExe = 'D:\Program Files\Zotero\zotero.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$isolatedProfile = Join-Path $projectRoot 'tests\host\profile'
if (-not (Test-Path -LiteralPath $isolatedProfile)) { python scripts/prepare_host_test.py }
# Match only our explicitly named test profile, never the ordinary Zotero session.
$isolatedProcesses = Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" |
    Where-Object { $_.CommandLine -like ('*' + $isolatedProfile + '*') }
foreach ($isolatedProcess in $isolatedProcesses) { Stop-Process -Id $isolatedProcess.ProcessId }
Start-Sleep -Seconds 1
python scripts/refresh_host_test.py
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$testProcess = Start-Process -FilePath $ZoteroExe -ArgumentList @('-no-remote','-profile',$isolatedProfile,'-purgecaches','-ZoteroDebugText') -WindowStyle Hidden -RedirectStandardOutput "tests/host/stdout-$stamp.log" -RedirectStandardError "tests/host/stderr-$stamp.log" -PassThru
$report = Join-Path $projectRoot 'tests\host\host-report.json'
for ($attempt=0; $attempt -lt 110; $attempt++) {
    if (Test-Path -LiteralPath $report) {
        $result = Get-Content -LiteralPath $report -Raw -Encoding UTF8 | ConvertFrom-Json
        [pscustomobject]@{PluginVersion=$result.pluginVersion;Passed=$result.passed;Checks=$result.checks.Count;Error=$result.error} | ConvertTo-Json
        if ($result.passed) { exit 0 } else { exit 1 }
    }
    Start-Sleep -Seconds 1
}
Write-Error 'No host test report within 110 seconds. Inspect tests/host logs.'
