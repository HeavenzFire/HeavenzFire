#requires -Version 5.1
<#
.SYNOPSIS
  Launches a local HeavenzFire chat client backed by an OpenAI-hosted GPT-6-family API model.
.DESCRIPTION
  PowerShell 5.1 compatible. The API key is entered through a hidden prompt and stored
  encrypted with Windows DPAPI for the current Windows user. The key is never written
  to this repository or passed on a process command line. The local API binds to loopback.
  OpenAI API usage is billed separately from a ChatGPT subscription.
#>
$ErrorActionPreference = 'Stop'

$LocalBase = 'http://127.0.0.1:18796'
$ApiBase = 'https://api.openai.com/v1'
$SecretRoot = Join-Path $env:LOCALAPPDATA 'HeavenzFire\secrets'
$LogRoot = Join-Path $env:LOCALAPPDATA 'HeavenzFire\logs'
$KeyFile = Join-Path $SecretRoot 'openai-api-key.dpapi'
$TokenFile = Join-Path $SecretRoot 'local-api-token.dpapi'
$ModelFile = Join-Path $SecretRoot 'openai-model.txt'
$ServerProcess = $null
$ApiKey = $null
$LocalToken = $null
$SaveKey = $false

function Convert-SecureStringToPlainText {
    param([Parameter(Mandatory=$true)][Security.SecureString]$SecureValue)
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Save-DpapiSecret {
    param([Parameter(Mandatory=$true)][string]$Path, [Parameter(Mandatory=$true)][string]$Value)
    $secure = ConvertTo-SecureString -String $Value -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString -SecureString $secure
    Set-Content -LiteralPath $Path -Value $encrypted -Encoding ASCII
}

function Read-DpapiSecret {
    param([Parameter(Mandatory=$true)][string]$Path)
    $encrypted = Get-Content -LiteralPath $Path -Raw
    $secure = ConvertTo-SecureString -String $encrypted
    return Convert-SecureStringToPlainText -SecureValue $secure
}

function Get-OpenAIModelList {
    param([Parameter(Mandatory=$true)][string]$Key)
    $headers = @{ Authorization = 'Bearer ' + $Key }
    return Invoke-RestMethod -Uri ($ApiBase + '/models') -Method Get -Headers $headers -TimeoutSec 25
}

function Get-Gpt6Models {
    param($Response)
    return @($Response.data | Where-Object { $_.id -match '^gpt-6(?:$|[.-])' } | ForEach-Object { [string]$_.id } | Sort-Object -Unique)
}

function New-LocalToken {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) }
    finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

# Fail before prompting for secrets if the service directory or Node.js is missing.
$Node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
if (-not $Node) { $Node = Get-Command 'node' -ErrorAction SilentlyContinue }
if (-not $Node) { throw 'Node.js 18 or newer is required. Install Node.js, then rerun this script.' }
$ServerFile = Join-Path $PSScriptRoot 'server.cjs'
if (-not (Test-Path -LiteralPath $ServerFile)) {
    throw 'server.cjs was not found beside this script. Run this script from the services/heavenzfire-api directory in the HeavenzFire repository.'
}

# Never silently attach to an unknown service already listening on the expected port.
$Occupied = $false
try {
    $null = Invoke-RestMethod -Uri ($LocalBase + '/health') -TimeoutSec 2
    $Occupied = $true
} catch {}
if ($Occupied) {
    throw 'Port 18796 already has an HTTP service. Nothing was changed. Inspect that service before retrying; this launcher will not kill an unknown process.'
}

New-Item -ItemType Directory -Path $SecretRoot -Force | Out-Null
New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null

# Authenticate the saved key, or collect it through a hidden prompt.
$ModelResponse = $null
if (Test-Path -LiteralPath $KeyFile) {
    try {
        $ApiKey = Read-DpapiSecret -Path $KeyFile
        $ModelResponse = Get-OpenAIModelList -Key $ApiKey
        Write-Host '[OK] Saved API key authenticated with OpenAI.' -ForegroundColor Green
    } catch {
        Write-Host '[WARN] The saved API key could not be validated. Enter a replacement key.' -ForegroundColor Yellow
        $ApiKey = $null
        $ModelResponse = $null
    }
}

if (-not $ModelResponse) {
    $KeySecure = Read-Host 'Enter your OpenAI API key (hidden input; do not paste it into chat or GitHub)' -AsSecureString
    $ApiKey = Convert-SecureStringToPlainText -SecureValue $KeySecure
    $SaveKey = $true
    try {
        $ModelResponse = Get-OpenAIModelList -Key $ApiKey
    } catch {
        $ApiKey = $null
        throw 'OpenAI API key validation failed. Check the key at https://platform.openai.com/api-keys and confirm API access/billing. The key was not saved.'
    }
}

$Gpt6Models = @(Get-Gpt6Models -Response $ModelResponse)
if ($Gpt6Models.Count -eq 0) {
    $Visible = @($ModelResponse.data | ForEach-Object { [string]$_.id } | Where-Object { $_ -match '^(gpt|chatgpt)' } | Sort-Object -Unique)
    if ($Visible.Count -gt 0) {
        Write-Host 'GPT-like models visible to this API key:' -ForegroundColor Yellow
        $Visible | ForEach-Object { Write-Host ('  ' + $_) }
    }
    throw 'The API key authenticated, but its /v1/models response did not list a GPT-6-family model. No new key was saved. Check API project access and model availability; a ChatGPT subscription alone does not grant API access.'
}

# Save the key only after successful authentication and confirmation that GPT-6 is listed.
if ($SaveKey) { Save-DpapiSecret -Path $KeyFile -Value $ApiKey }

$SelectedModel = $null
if (Test-Path -LiteralPath $ModelFile) {
    $SavedModel = (Get-Content -LiteralPath $ModelFile -Raw).Trim()
    if ($Gpt6Models -contains $SavedModel) { $SelectedModel = $SavedModel }
}
if (-not $SelectedModel) {
    Write-Host ''
    Write-Host 'GPT-6-family models exposed to this API key:' -ForegroundColor Cyan
    for ($i = 0; $i -lt $Gpt6Models.Count; $i++) {
        Write-Host ('  {0}. {1}' -f ($i + 1), $Gpt6Models[$i])
    }
    $ChoiceText = Read-Host ('Select model number (1-' + $Gpt6Models.Count + ')')
    $Choice = 0
    if (-not [int]::TryParse($ChoiceText, [ref]$Choice) -or $Choice -lt 1 -or $Choice -gt $Gpt6Models.Count) {
        throw 'No valid model selected. No inference request was sent.'
    }
    $SelectedModel = $Gpt6Models[$Choice - 1]
    Set-Content -LiteralPath $ModelFile -Value $SelectedModel -Encoding ASCII
}

if (Test-Path -LiteralPath $TokenFile) {
    try { $LocalToken = Read-DpapiSecret -Path $TokenFile }
    catch { $LocalToken = $null }
}
if (-not $LocalToken) {
    $LocalToken = New-LocalToken
    Save-DpapiSecret -Path $TokenFile -Value $LocalToken
}

# Launch the local, loopback-only HeavenzFire API with secrets in its inherited environment.
$env:OPENAI_API_KEY = $ApiKey
$env:OPENAI_MODEL = $SelectedModel
$env:HF_API_KEYS = $LocalToken
$env:HF_HOST = '127.0.0.1'
$env:PORT = '18796'
$env:HF_REQUEST_TIMEOUT_MS = '120000'
$StdoutLog = Join-Path $LogRoot 'heavenzfire-api.stdout.log'
$StderrLog = Join-Path $LogRoot 'heavenzfire-api.stderr.log'
try {
    $ServerProcess = Start-Process -FilePath $Node.Source -ArgumentList @('server.cjs') -WorkingDirectory $PSScriptRoot -PassThru -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
} finally {
    Remove-Item Env:\OPENAI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\OPENAI_MODEL -ErrorAction SilentlyContinue
    Remove-Item Env:\HF_API_KEYS -ErrorAction SilentlyContinue
    Remove-Item Env:\HF_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:\PORT -ErrorAction SilentlyContinue
    Remove-Item Env:\HF_REQUEST_TIMEOUT_MS -ErrorAction SilentlyContinue
    $ApiKey = $null
}

$Healthy = $false
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    if ($ServerProcess.HasExited) { break }
    try {
        $Health = Invoke-RestMethod -Uri ($LocalBase + '/health') -TimeoutSec 2
        if ($Health.ok -and $Health.authConfigured -and $Health.providers.openaiConfigured) {
            $Healthy = $true
            break
        }
    } catch {}
}
if (-not $Healthy) {
    if ($ServerProcess -and -not $ServerProcess.HasExited) { Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue }
    Write-Host 'Gateway failed its health check. Recent server log:' -ForegroundColor Red
    if (Test-Path $StderrLog) { Get-Content $StderrLog -Tail 30 }
    if (Test-Path $StdoutLog) { Get-Content $StdoutLog -Tail 30 }
    throw 'HeavenzFire GPT gateway did not become healthy. No chat request was sent.'
}

Write-Host ''
Write-Host ('[CONNECTED] HeavenzFire local gateway -> OpenAI API -> ' + $SelectedModel) -ForegroundColor Green
Write-Host 'This is a local client to a hosted model, not downloaded GPT weights. API inference may incur charges.'
Write-Host 'Type /exit to close this session and stop the gateway. Conversation history stays in this process only.'
$Messages = New-Object System.Collections.ArrayList
[void]$Messages.Add(@{
    role = 'system'
    content = 'You are the GPT assistant operating through the HeavenzFire local gateway. Be precise. Distinguish verified facts from assumptions. Never claim a local tool action succeeded unless its result was verified. This client does not grant desktop tools by itself.'
})

try {
    while ($true) {
        $Prompt = Read-Host 'YOU'
        if ($Prompt -eq '/exit') { break }
        if ([string]::IsNullOrWhiteSpace($Prompt)) { continue }

        [void]$Messages.Add(@{ role = 'user'; content = $Prompt })
        try {
            $RequestBody = @{
                provider = 'openai'
                model = $SelectedModel
                messages = @($Messages.ToArray())
            } | ConvertTo-Json -Depth 12

            $Headers = @{ Authorization = 'Bearer ' + $LocalToken }
            $Reply = Invoke-RestMethod -Uri ($LocalBase + '/v1/chat/completions') -Method Post -Headers $Headers -ContentType 'application/json' -Body $RequestBody -TimeoutSec 180
            $Answer = [string]$Reply.choices[0].message.content
            if ([string]::IsNullOrWhiteSpace($Answer)) { throw 'The model returned an empty answer.' }
            [void]$Messages.Add(@{ role = 'assistant'; content = $Answer })
            Write-Host ''
            Write-Host ('GPT:' + [Environment]::NewLine + $Answer) -ForegroundColor Green
        } catch {
            if ($Messages.Count -gt 1 -and $Messages[$Messages.Count - 1].role -eq 'user') {
                $Messages.RemoveAt($Messages.Count - 1)
            }
            Write-Host ('[REQUEST FAILED] ' + $_.Exception.Message) -ForegroundColor Red
        }
    }
} finally {
    if ($ServerProcess -and -not $ServerProcess.HasExited) {
        Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
    }
    $LocalToken = $null
    Write-Host 'HeavenzFire local GPT session stopped.' -ForegroundColor Cyan
}
