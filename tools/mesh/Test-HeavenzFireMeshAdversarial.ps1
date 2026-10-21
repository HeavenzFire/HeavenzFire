#requires -Version 5.1
[CmdletBinding()]
param([string]$BaseUrl = 'http://127.0.0.1:8800')
$ErrorActionPreference = 'Stop'

function Assert-HttpStatus {
    param([string]$Name, [int]$Expected, [scriptblock]$Action)
    $actual = 200
    try { $null = & $Action }
    catch {
        if ($_.Exception.Response) {
            try { $actual = [int]$_.Exception.Response.StatusCode }
            catch { throw }
        } else { throw }
    }
    if ($actual -ne $Expected) { throw "$Name expected HTTP $Expected but received HTTP $actual" }
    Write-Output "PASS: $Name (HTTP $actual)"
}

$health = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/health') -TimeoutSec 4
if ($health.ok -ne $true) { throw 'Dashboard health check failed.' }
Write-Output 'PASS: dashboard health'

$overview = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/overview') -TimeoutSec 15
$mesh = @($overview.services | Where-Object { $_.id -like 'mesh*' })
if ($mesh.Count -ne 5 -or @($mesh | Where-Object { $_.state -eq 'healthy' }).Count -ne 5) {
    throw "Expected five healthy mesh endpoints; observed $(@($mesh | Where-Object { $_.state -eq 'healthy' }).Count)/$($mesh.Count)"
}
Write-Output 'PASS: five mesh endpoints visible and healthy'

Assert-HttpStatus 'Coordinator rejects unauthenticated stats access' 401 {
    Invoke-RestMethod -Uri 'http://127.0.0.1:8080/stats' -TimeoutSec 3
}

$unsupported = @{ type = 'shell_task'; payload = @{ command = 'whoami' } } | ConvertTo-Json -Depth 4 -Compress
Assert-HttpStatus 'Unsupported shell task is rejected' 400 {
    Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $unsupported -TimeoutSec 5
}

$crossOrigin = @{ type = 'hash_task'; payload = @{ input = 'cross-origin-denied'; rounds = 1 } } | ConvertTo-Json -Depth 4 -Compress
Assert-HttpStatus 'Cross-origin enqueue is rejected' 403 {
    Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -Headers @{ Origin = 'https://untrusted.invalid' } -ContentType 'application/json' -Body $crossOrigin -TimeoutSec 5
}

$tooLong = @{ type = 'hash_task'; payload = @{ input = ('x' * 2001); rounds = 1 } } | ConvertTo-Json -Depth 4 -Compress
Assert-HttpStatus 'Oversized hash input is rejected' 400 {
    Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $tooLong -TimeoutSec 5
}

$badRounds = @{ type = 'hash_task'; payload = @{ input = 'bad-rounds'; rounds = 0 } } | ConvertTo-Json -Depth 4 -Compress
Assert-HttpStatus 'Invalid hash rounds are rejected' 400 {
    Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $badRounds -TimeoutSec 5
}

$ram = Get-CimInstance Win32_OperatingSystem
$availableGb = $ram.FreePhysicalMemory / 1MB
$badModel = @{ type = 'model_task'; payload = @{ prompt = 'must not run'; model = 'unapproved-model' } } | ConvertTo-Json -Depth 4 -Compress
if ($availableGb -lt 1) {
    Assert-HttpStatus 'Model tasks are blocked by RAM admission before payload dispatch' 503 {
        Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $badModel -TimeoutSec 5
    }
} else {
    Assert-HttpStatus 'Unapproved model is rejected' 400 {
        Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $badModel -TimeoutSec 5
    }
}
$emptyModelPrompt = @{ type = 'model_task'; payload = @{ prompt = ''; model = 'qwen2.5:0.5b' } } | ConvertTo-Json -Depth 4 -Compress
if ($availableGb -lt 1) {
    Assert-HttpStatus 'Model inference is paused below 1 GiB available RAM' 503 {
        Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $emptyModelPrompt -TimeoutSec 5
    }
} else {
    Assert-HttpStatus 'Empty model prompt is rejected without enqueue' 400 {
        Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $emptyModelPrompt -TimeoutSec 5
    }
}

foreach ($port in @(8080, 8081, 18101, 18102, 18103, 8800)) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    if (-not $listeners.Count) { throw "Expected listener on port $port." }
    if (@($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1', '::ffff:127.0.0.1') }).Count) {
        throw "Port $port is listening beyond loopback."
    }
}
Write-Output 'PASS: dashboard, coordinator, bridge, and workers are loopback-only'

$valid = @{ type = 'hash_task'; payload = @{ input = 'heavenzfire-adversarial-canary-20261021'; rounds = 2 } } | ConvertTo-Json -Depth 4 -Compress
$queued = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/enqueue') -Method Post -ContentType 'application/json' -Body $valid -TimeoutSec 5
if ($queued.ok -ne $true -or -not $queued.task_id) { throw 'Valid canary task was not accepted.' }
$task = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $check = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + '/api/mesh/task?task_id=' + [uri]::EscapeDataString($queued.task_id)) -TimeoutSec 5
    $task = $check.task
    if ($task.status -in @('completed', 'failed')) { break }
}
if (-not $task -or $task.status -ne 'completed') { throw "Canary task did not complete. Task ID: $($queued.task_id)" }
if ($task.attempts -ne 1 -or $task.result.task_kind -ne 'hash_task' -or $task.result.hash -notmatch '^[0-9a-f]{64}$') {
    throw 'Canary result failed schema/attempt validation.'
}
if ($task.worker_id -notin @('hf-worker-18101', 'hf-worker-18102', 'hf-worker-18103')) {
    throw 'Canary task completed on an unexpected worker identity.'
}
Write-Output ('PASS: end-to-end persisted canary (' + $task.worker_id + ', attempt 1)')
Write-Output 'MESH_ADVERSARIAL_SUITE=PASS'
