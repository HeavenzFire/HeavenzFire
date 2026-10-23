#requires -Version 5.1
<#
.SYNOPSIS
  Read-only diagnostics for the HeavenzFire Unified Field local and tailnet paths.
.DESCRIPTION
  Does not restart services, change firewall rules, alter Tailscale, or expose listeners.
  Reports local HTTP health separately from self-tailnet reachability. A successful
  self-tailnet probe does not prove that an Android peer can reach the same endpoint.
#>
[CmdletBinding()]
param(
    [int[]]$Ports = @(8798, 8800, 8799, 11434, 8787, 8788, 8790),
    [int]$TimeoutMilliseconds = 1500
)

$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Area, [string]$Target, [string]$Status, [string]$Detail)
    $results.Add([pscustomobject]@{
        Area = $Area
        Target = $Target
        Status = $Status
        Detail = $Detail
    })
}

function Test-TcpEndpoint {
    param([string]$Address, [int]$Port, [int]$TimeoutMs)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($Address, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return [pscustomobject]@{ Connected = $false; Detail = 'timeout' }
        }
        $client.EndConnect($async)
        return [pscustomobject]@{ Connected = $true; Detail = 'TCP connected' }
    }
    catch {
        return [pscustomobject]@{ Connected = $false; Detail = $_.Exception.GetBaseException().Message }
    }
    finally {
        $client.Close()
    }
}

function Test-HttpEndpoint {
    param([string]$Uri, [int]$TimeoutMs)
    try {
        $response = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec ([Math]::Max(1, [int][Math]::Ceiling($TimeoutMs / 1000.0))) -UseBasicParsing
        return [pscustomobject]@{ Ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300); Detail = ('HTTP ' + $response.StatusCode) }
    }
    catch {
        $message = $_.Exception.GetBaseException().Message
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            return [pscustomobject]@{ Ok = $false; Detail = ('HTTP ' + [int]$_.Exception.Response.StatusCode + ': ' + $message) }
        }
        return [pscustomobject]@{ Ok = $false; Detail = $message }
    }
}

Write-Output '=== HEAVENZFIRE UNIFIED FIELD CONNECTIVITY DIAGNOSTICS ==='
Write-Output ('Timestamp UTC: ' + [DateTime]::UtcNow.ToString('o'))
Write-Output 'Mode: read-only; no service, firewall, route, or configuration changes.'
Write-Output ''

foreach ($name in @('ollama', 'node', 'tailscale')) {
    $found = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
    if ($found.Count -gt 0) {
        Add-Result -Area 'PROCESS' -Target $name -Status 'FOUND' -Detail (($found | ForEach-Object { 'PID=' + $_.Id }) -join ', ')
    }
    else {
        Add-Result -Area 'PROCESS' -Target $name -Status 'NOT_FOUND' -Detail 'No process with this name; this alone does not prove a service is unavailable.'
    }
}

$tailscaleCommand = Get-Command tailscale.exe -ErrorAction SilentlyContinue
if (-not $tailscaleCommand) { $tailscaleCommand = Get-Command tailscale -ErrorAction SilentlyContinue }
if ($tailscaleCommand) {
    try {
        $tsStatus = & $tailscaleCommand.Source status 2>&1
        $tsExit = $LASTEXITCODE
        if ($tsExit -eq 0) {
            Add-Result -Area 'TAILSCALE' -Target 'tailscale status' -Status 'OK' -Detail (($tsStatus | Select-Object -First 8) -join ' | ')
        }
        else {
            Add-Result -Area 'TAILSCALE' -Target 'tailscale status' -Status 'ERROR' -Detail (($tsStatus | Select-Object -First 3) -join ' | ')
        }
    }
    catch { Add-Result -Area 'TAILSCALE' -Target 'tailscale status' -Status 'ERROR' -Detail $_.Exception.Message }
}
else {
    Add-Result -Area 'TAILSCALE' -Target 'CLI' -Status 'NOT_FOUND' -Detail 'tailscale CLI not found in PATH; the GUI/service may still exist.'
}

$tailnetAddresses = @()
try {
    $tailnetAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -match '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.' } |
        Select-Object -ExpandProperty IPAddress -Unique)
}
catch {
    Add-Result -Area 'TAILNET_IP' -Target 'Get-NetIPAddress' -Status 'ERROR' -Detail $_.Exception.Message
}
if ($tailnetAddresses.Count -gt 0) {
    foreach ($ip in $tailnetAddresses) {
        Add-Result -Area 'TAILNET_IP' -Target $ip -Status 'FOUND' -Detail 'Local interface address in the Tailscale IPv4 range.'
    }
}
else {
    Add-Result -Area 'TAILNET_IP' -Target '100.64.0.0/10' -Status 'NOT_FOUND' -Detail 'No local IPv4 address in the Tailscale CGNAT range was found.'
}

foreach ($port in $Ports) {
    $listeners = @()
    try {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    }
    catch { }
    if ($listeners.Count -eq 0) {
        Add-Result -Area 'LISTENER' -Target ('TCP ' + $port) -Status 'NO_LISTENER' -Detail 'No listening TCP socket found for this port.'
    }
    else {
        $descriptions = @()
        foreach ($listener in $listeners) {
            $procName = 'PID ' + $listener.OwningProcess
            try {
                $p = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
                $procName = $p.ProcessName + ' PID ' + $listener.OwningProcess
            }
            catch { }
            $descriptions += ($listener.LocalAddress + ' (' + $procName + ')')
        }
        Add-Result -Area 'LISTENER' -Target ('TCP ' + $port) -Status 'LISTENING' -Detail ($descriptions -join '; ')
    }
}

$localEndpoints = @(
    [pscustomobject]@{ Name = 'Unified Field worker'; Uri = 'http://127.0.0.1:8798/health' },
    [pscustomobject]@{ Name = 'Unified Field dashboard'; Uri = 'http://127.0.0.1:8800/health' },
    [pscustomobject]@{ Name = 'Avatar Body'; Uri = 'http://127.0.0.1:8799/health' },
    [pscustomobject]@{ Name = 'Ollama'; Uri = 'http://127.0.0.1:11434/api/tags' },
    [pscustomobject]@{ Name = 'HeavenzFire gateway'; Uri = 'http://127.0.0.1:8787/health' },
    [pscustomobject]@{ Name = 'HeavenzFire orchestrator'; Uri = 'http://127.0.0.1:8788/health' },
    [pscustomobject]@{ Name = 'HeavenzFire agent'; Uri = 'http://127.0.0.1:8790/health' }
)
foreach ($endpoint in $localEndpoints) {
    $probe = Test-HttpEndpoint -Uri $endpoint.Uri -TimeoutMs $TimeoutMilliseconds
    $status = if ($probe.Ok) { 'HTTP_OK' } else { 'HTTP_FAILED' }
    Add-Result -Area 'LOCAL_HTTP' -Target $endpoint.Name -Status $status -Detail ($endpoint.Uri + ' — ' + $probe.Detail)
}

foreach ($ip in $tailnetAddresses) {
    foreach ($port in @(11434, 8798, 8800)) {
        $probe = Test-TcpEndpoint -Address $ip -Port $port -TimeoutMs $TimeoutMilliseconds
        $status = if ($probe.Connected) { 'SELF_TAILNET_TCP_OK' } else { 'SELF_TAILNET_TCP_FAILED' }
        Add-Result -Area 'SELF_TAILNET_PROBE' -Target ($ip + ':' + $port) -Status $status -Detail $probe.Detail
    }
}

Write-Output ''
$results | Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Output
Write-Output '=== INTERPRETATION ==='
Write-Output '1. LOCAL_HTTP failure plus NO_LISTENER usually means the service is stopped, on another port, or failed to start.'
Write-Output '2. LOCAL_HTTP succeeds but SELF_TAILNET_TCP fails: inspect listener binding and local firewall; do not open ports blindly.'
Write-Output '3. Self-tailnet succeeds but Android fails: verify the current Windows tailnet IP, both peers online, tailnet ACL/grants, and Android route.'
Write-Output '4. This script does not test from Android and cannot prove peer-to-peer connectivity.'
Write-Output '5. Paste the full output back for evidence-based diagnosis. It does not intentionally print environment variables or tokens.'
