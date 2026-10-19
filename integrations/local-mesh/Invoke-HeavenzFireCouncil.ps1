#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateLength(1,1600)][string]$Prompt,
    [ValidateSet('engineering','guardian-review')][string]$Mode = 'engineering',
    [string[]]$Models = @('qwen2.5:0.5b','llama3.2:1b','heavenzfire-runtime:latest'),
    [ValidateRange(15,300)][int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
$Coordinator = 'http://127.0.0.1:8080'
$StateRoot = Join-Path $env:LOCALAPPDATA 'HeavenzFire\UnifiedField'
$ReportRoot = Join-Path $StateRoot 'council-reports'
$TokenPath = Join-Path $StateRoot 'mesh-token.dpapi'
$AllowedModels = @('qwen2.5:0.5b','llama3.2:1b','heavenzfire:latest','heavenzfire-runtime:latest')
foreach ($model in $Models) {
    if ($AllowedModels -notcontains $model) { throw "Model is not allowlisted: $model" }
}
if (@($Models | Select-Object -Unique).Count -lt 2) { throw 'Council requires at least two distinct model entries.' }
if (-not (Test-Path -LiteralPath $TokenPath)) { throw 'The local DPAPI mesh token is missing. Run Enter-UnifiedField.ps1 first.' }

$protected = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
$secure = ConvertTo-SecureString -String $protected
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$token = $null
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $headers = @{ Authorization = ('Bearer ' + $token) }

    function Invoke-HfJsonPost([string]$Url,[hashtable]$Body,[int]$Timeout=10) {
        $json = $Body | ConvertTo-Json -Depth 8 -Compress
        return Invoke-RestMethod -Method Post -Uri $Url -Headers $script:headers -ContentType 'application/json' -Body $json -TimeoutSec $Timeout
    }

    function Invoke-HfCouncilTask([string]$Model,[string]$TaskPrompt,[int]$WaitSeconds) {
        if ($TaskPrompt.Length -gt 3000) { throw 'Internal council task exceeded the worker prompt limit.' }
        $taskId = [guid]::NewGuid().ToString()
        $body = @{
            task_id = $taskId
            type = 'model_task'
            payload = @{ model = $Model; prompt = $TaskPrompt }
        }
        $queued = Invoke-HfJsonPost ($script:Coordinator + '/enqueue') $body 10
        if (-not $queued.ok) { throw "Coordinator rejected task for $Model" }
        $deadline = (Get-Date).AddSeconds($WaitSeconds)
        $state = $null
        do {
            Start-Sleep -Milliseconds 750
            try {
                $state = Invoke-RestMethod -Uri ($script:Coordinator + '/task?task_id=' + $taskId) -Headers $script:headers -TimeoutSec 5
            } catch { $state = $null }
            if ($state -and $state.task.status -in @('completed','failed')) { break }
        } while ((Get-Date) -lt $deadline)
        if (-not $state -or $state.task.status -notin @('completed','failed')) {
            $lastStatus = if ($state -and $state.task) { [string]$state.task.status } else { 'unavailable' }
            $lastWorker = if ($state -and $state.task) { $state.task.worker_id } else { $null }
            return [pscustomobject]@{
                model=$Model;task_id=$taskId;status='timeout';worker_id=$lastWorker
                response='';error=('Task did not reach a terminal status before timeout; last status=' + $lastStatus)
            }
        }
        $t = $state.task
        $response = ''
        $workerId = $t.worker_id
        $errorText = $t.error
        if ($t.result) {
            $response = [string]$t.result.response
            if ($t.result.worker_id) { $workerId = $t.result.worker_id }
        }
        return [pscustomobject]@{
            model=$Model;task_id=$taskId;status=[string]$t.status
            worker_id=$workerId;response=$response;error=$errorText
        }
    }

    $tagData = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4
    $installed = @($tagData.models | ForEach-Object { $_.name })
    foreach ($model in $Models) {
        if ($installed -notcontains $model) { throw "Selected model is not installed locally: $model" }
    }
    $null = Invoke-RestMethod -Uri ($Coordinator + '/health') -TimeoutSec 3

    Write-Host ''
    Write-Host '=== HEAVENZFIRE MULTI-MODEL ENGINEERING COUNCIL ===' -ForegroundColor Cyan
    Write-Host 'Mode: sequential local model tasks, authenticated mesh, evidence logged.'
    $candidates = @()
    foreach ($model in $Models) {
        Write-Host ("[COUNCIL] Candidate pass: " + $model)
        if ($Mode -eq 'guardian-review') {
            $candidatePrompt = @"
Objective and supplied evidence: $Prompt

You are an independent defensive interface-evidence reviewer. Do not design a product. Return concise JSON with keys: findings, overall_risk, counter_evidence, limitations, mitigations, human_review_status. Each finding must include signal_id, status (observed/inferred/not_observable), exact_quote copied verbatim from the supplied evidence text, rationale, and confidence from 0 to 1. Only flag a signal when the evidence supports it. If the quote is not present verbatim, reject that finding. Never infer hidden algorithms, intent, illegality, or a diagnosis from a short text sample. Set human_review_status to pending. Do not claim external verification.
"@
        } else {
            $candidatePrompt = @"
Objective: $Prompt

You are an independent HeavenzFire engineering specialist. Propose a concise solution. Return:
1) recommended design (up to 3 bullets),
2) key assumptions and failure modes,
3) one concrete verification test.
Do not claim to have run tests. Prioritize human safety, privacy, reversibility, evidence, and protection of vulnerable people.
"@
        }
        $candidate = Invoke-HfCouncilTask $model $candidatePrompt $TimeoutSeconds
        $candidates += $candidate
        Write-Host ("  status=" + $candidate.status + "; worker=" + $candidate.worker_id)
        if ($candidate.response) { Write-Host ("  " + $candidate.response.Substring(0,[Math]::Min(260,$candidate.response.Length))) }
    }

    $candidateBriefs = @()
    for ($i=0; $i -lt $candidates.Count; $i++) {
        $c = $candidates[$i]
        $brief = if ($c.response) { $c.response.Substring(0,[Math]::Min(300,$c.response.Length)) } else { '[NO RESPONSE: ' + $c.status + ' ' + $c.error + ']' }
        $candidateBriefs += ("CANDIDATE " + ($i+1) + " MODEL=" + $c.model + " STATUS=" + $c.status + ": " + $brief)
    }
    $judgeModel = if ($installed -contains 'qwen2.5:0.5b') { 'qwen2.5:0.5b' } else { $Models[0] }
    $reviewInstructions = if ($Mode -eq 'guardian-review') {
        'Act as a skeptical evidence auditor, not a product designer. Check each proposed exact_quote against the supplied evidence text; reject any quote that is not an exact substring. Report which signal IDs are supported, unsupported, or uncertain; explain counter-evidence and limitations; suggest a user-protective mitigation. Return concise JSON with human_review_status=pending. Do not claim hidden algorithm behavior, intent, illegality, or diagnosis. Model agreement is not ground truth.'
    } else {
        'Act as a skeptical engineering reviewer. Identify agreement and disagreement, reject unsupported claims, rank the safest practical next step, and provide a refined plan with one measurable acceptance test. State clearly that model agreement is not proof. Do not execute commands or claim external verification.'
    }
    $judgePrompt = @"
OBJECTIVE: $Prompt

Compare these independent candidate proposals:
$($candidateBriefs -join [Environment]::NewLine)

$reviewInstructions
"@
    if ($judgePrompt.Length -gt 3000) { $judgePrompt = $judgePrompt.Substring(0,2990) }
    Write-Host ("[COUNCIL] Independent review and refinement: " + $judgeModel)
    $judge = Invoke-HfCouncilTask $judgeModel $judgePrompt $TimeoutSeconds
    Write-Host ("  judge status=" + $judge.status + "; worker=" + $judge.worker_id)
    if ($judge.response) { Write-Host $judge.response }

    $null = New-Item -ItemType Directory -Path $ReportRoot -Force
    $reportPath = Join-Path $ReportRoot ('council-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.json')
    $report = [ordered]@{
        schema_version = '1.0.0'
        captured_at = (Get-Date).ToString('o')
        host = $env:COMPUTERNAME
        objective = $Prompt
        mode = $Mode + ' multi-model candidate generation plus skeptical review'
        models = @($Models)
        candidates = @($candidates)
        reviewer_model = $judgeModel
        reviewer = $judge
        safety = @{
            execution = 'model tasks only; no shell or code execution'
            network = 'loopback coordinator and local Ollama only'
            authorization = 'authenticated mesh token protected with Windows DPAPI'
            decision_policy = 'human review required before implementation'
            quantum_claim = 'classical asynchronous task queue; no quantum hardware or quantum speedup claimed'
        }
    }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-Host ("[COUNCIL] Evidence report: " + $reportPath) -ForegroundColor Green
    Write-Host 'Council run complete. Review candidate disagreements before accepting the recommendation.'
}
finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $token = $null
}