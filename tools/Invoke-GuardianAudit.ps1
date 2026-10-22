#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$BaselinePath = (Join-Path $env:LOCALAPPDATA 'HeavenzFire\Guardian\baseline.json'),
    [switch]$ResetBaseline
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $BaselinePath
if (-not (Test-Path -LiteralPath $root)) {
    New-Item -ItemType Directory -Path $root -Force | Out-Null
}
$reportDir = Join-Path $root 'reports'
if (-not (Test-Path -LiteralPath $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) { throw 'GitHub CLI (gh) is not installed or not on PATH. Install it and authenticate with gh auth login.' }
& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated. Run gh auth login and gh auth status.' }

Write-Host 'Fetching repositories visible to the authenticated GitHub account...'
$repoLines = & gh api '/user/repos?per_page=100&sort=pushed' --paginate --jq '.[] | {full_name: .full_name, default_branch: .default_branch, pushed_at: .pushed_at, updated_at: .updated_at, archived: .archived, visibility: .visibility} | @json'
if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate repositories. Check authentication and API permissions.' }
$repos = @()
foreach ($line in $repoLines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try { $repos += ($line | ConvertFrom-Json) } catch { Write-Warning ('Could not parse repository record: ' + $line) }
}
if ($repos.Count -eq 0) { throw 'GitHub returned zero repositories; refusing to create an empty baseline.' }

$current = @{}
$errors = @()
$index = 0
foreach ($repo in $repos) {
    $index++
    $fullName = [string]$repo.full_name
    Write-Progress -Activity 'Auditing GitHub repositories' -Status $fullName -PercentComplete (($index / $repos.Count) * 100)
    try {
        $commitJson = & gh api ('repos/' + $fullName + '/commits?per_page=1') --jq '.[0] | {sha: .sha, date: .commit.author.date, message: .commit.message, author: .author.login}'
        if ($LASTEXITCODE -ne 0) { throw 'GitHub API request failed for latest commit.' }
        $commit = $null
        if ($commitJson) { $commit = ($commitJson | ConvertFrom-Json) }
        $current[$fullName] = [ordered]@{
            full_name = $fullName
            default_branch = $repo.default_branch
            pushed_at = $repo.pushed_at
            updated_at = $repo.updated_at
            archived = $repo.archived
            visibility = $repo.visibility
            latest_commit = if ($commit) { $commit.sha } else { $null }
            latest_commit_date = if ($commit) { $commit.date } else { $null }
            latest_commit_message = if ($commit) { $commit.message } else { $null }
            latest_commit_author = if ($commit) { $commit.author } else { $null }
            observed_at_utc = [DateTime]::UtcNow.ToString('o')
        }
    } catch {
        $errors += [ordered]@{ repository = $fullName; error = $_.Exception.Message }
        Write-Warning ('AUDIT ERROR: ' + $fullName + ': ' + $_.Exception.Message)
    }
}
Write-Progress -Activity 'Auditing GitHub repositories' -Completed

if ($current.Count -eq 0) { throw 'No repository observations succeeded; baseline will not be written.' }
$old = $null
if ((Test-Path -LiteralPath $BaselinePath) -and -not $ResetBaseline) {
    try { $old = Get-Content -LiteralPath $BaselinePath -Raw | ConvertFrom-Json } catch { throw 'Existing baseline is unreadable. Preserve a copy and investigate before using -ResetBaseline.' }
}
$changes = @()
if ($old) {
    foreach ($name in $current.Keys) {
        $priorProperty = $old.repositories.PSObject.Properties[$name]
        $prior = if ($priorProperty) { $priorProperty.Value } else { $null }
        if (-not $prior) {
            $changes += [ordered]@{ type = 'NEWLY_VISIBLE_REPOSITORY'; repository = $name; current = $current[$name] }
            continue
        }
        $fields = @('default_branch','pushed_at','archived','visibility','latest_commit')
        $changedFields = @()
        foreach ($field in $fields) {
            if ([string]$prior.$field -ne [string]$current[$name][$field]) { $changedFields += $field }
        }
        if ($changedFields.Count -gt 0) {
            $changes += [ordered]@{
                type = 'REPOSITORY_CHANGED'
                repository = $name
                changed_fields = $changedFields
                previous = $prior
                current = $current[$name]
            }
        }
    }
    foreach ($oldProp in $old.repositories.PSObject.Properties) {
        if (-not $current.ContainsKey($oldProp.Name)) {
            $changes += [ordered]@{ type = 'NO_LONGER_VISIBLE'; repository = $oldProp.Name; note = 'Could be deletion, permission loss, transfer, or API visibility change; verify manually.' }
        }
    }
}

$report = [ordered]@{
    schema_version = '0.1.0'
    observed_at_utc = [DateTime]::UtcNow.ToString('o')
    mode = if ($old) { 'comparison' } else { 'baseline' }
    repositories_observed = $current.Count
    repository_errors = $errors
    changes = $changes
    interpretation = 'Differences are signals for review, not proof of unauthorized activity. API failures and missing visibility are not evidence of safety.'
}
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssZ')
$reportPath = Join-Path $reportDir ('guardian-audit-' + $stamp + '.json')
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding UTF8

if (-not $old -or $ResetBaseline) {
    $baseline = [ordered]@{
        schema_version = '0.1.0'
        created_at_utc = [DateTime]::UtcNow.ToString('o')
        repositories = $current
    }
    $baseline | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $BaselinePath -Encoding UTF8
    Write-Host ('BASELINE WRITTEN: ' + $BaselinePath)
    Write-Host ('Repositories observed: ' + $current.Count + '; errors: ' + $errors.Count)
    Write-Host 'No historical changes can be inferred from this first baseline.'
} else {
    Write-Host ('REPORT: ' + $reportPath)
    Write-Host ('Repositories observed: ' + $current.Count + '; changes: ' + $changes.Count + '; errors: ' + $errors.Count)
    foreach ($change in $changes) {
        Write-Host ('[' + $change.type + '] ' + $change.repository)
    }
    if ($errors.Count -gt 0) { Write-Warning 'One or more repositories could not be audited. Investigate the report; do not interpret this as a clean pass.' }
}
if ($errors.Count -gt 0) { exit 2 }
if ($old -and $changes.Count -gt 0) { exit 1 }
exit 0
