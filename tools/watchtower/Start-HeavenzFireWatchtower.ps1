param(
    [ValidateSet('Start','Stop','Status','Test')]
    [string]$Mode = 'Start'
)
$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:LOCALAPPDATA 'HeavenzFire\Watchtower'
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $InstallDir 'watchtower.py'
$PidDir = Join-Path $Root 'pids'
$LogDir = Join-Path $Root 'logs'
$Roles = @('health','integrity')
$PythonCandidates = @(
    'C:\Users\rucke\miniconda3\python.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe')
)
$Python = $PythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $Python) {
    $PythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($PythonCommand) { $Python = $PythonCommand.Source }
}
if ($Mode -eq 'Test') {
    if (-not (Test-Path -LiteralPath $ScriptPath)) { throw "Missing watcher script: $ScriptPath" }
    if (-not $Python) { throw 'Python 3 was not found.' }
    & $Python -m py_compile $ScriptPath
    if ($LASTEXITCODE -ne 0) { throw 'Python compile check failed.' }
    foreach ($role in $Roles) {
        & $Python $ScriptPath --role $role --once
        if ($LASTEXITCODE -ne 0) { throw "Smoke test failed for $role" }
    }
    Write-Output 'TEST_PASS: both observer roles ran once.'
    exit 0
}
if ($Mode -eq 'Stop') {
    foreach ($role in $Roles) {
        $pidFile = Join-Path $PidDir "$role.pid"
        if (Test-Path -LiteralPath $pidFile) {
            $id = 0
            if ([int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$id)) {
                $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
                if ($proc -and $proc.ProcessName -match '^python(w)?$') {
                    Stop-Process -Id $id -ErrorAction SilentlyContinue
                }
            }
            Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Output 'Stop requested for Watchtower processes recorded by this launcher.'
    exit 0
}
if ($Mode -eq 'Status') {
    foreach ($role in $Roles) {
        $pidFile = Join-Path $PidDir "$role.pid"
        $id = if (Test-Path -LiteralPath $pidFile) { (Get-Content -LiteralPath $pidFile -Raw).Trim() } else { 'not-started' }
        $valid = $false
        if ($id -match '^\d+$') { $valid = [bool](Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue) }
        [pscustomobject]@{ Role=$role; PID=$id; Running=$valid; Journal=(Join-Path $Root "watchtower-$role.jsonl") }
    }
    exit 0
}
if (-not (Test-Path -LiteralPath $ScriptPath)) { throw "Missing watcher script: $ScriptPath" }
if (-not $Python) { throw 'Python 3 was not found.' }
New-Item -ItemType Directory -Force -Path $PidDir,$LogDir | Out-Null
foreach ($role in $Roles) {
    $pidFile = Join-Path $PidDir "$role.pid"
    $existingId = 0
    if ((Test-Path -LiteralPath $pidFile) -and [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$existingId)) {
        if (Get-Process -Id $existingId -ErrorAction SilentlyContinue) {
            Write-Output "$role already running (PID $existingId); leaving it untouched."
            continue
        }
    }
    $outLog = Join-Path $LogDir "$role.out.log"
    $errLog = Join-Path $LogDir "$role.err.log"
    $args = @($ScriptPath,'--role',$role,'--interval','30')
    $proc = Start-Process -FilePath $Python -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ASCII
    Write-Output "Started $role observer PID $($proc.Id)"
}
Write-Output "Watchtower data directory: $Root"
Write-Output 'Observers are loopback-only and observe-only; no automatic remediation is enabled.'
