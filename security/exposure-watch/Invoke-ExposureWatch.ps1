[CmdletBinding()]
param(
    [ValidateSet("All", "Config", "Source", "OAuthAppsScript")]
    [string]$Category = "All",
    [switch]$List,
    [switch]$OpenBrowser,
    [string]$CatalogPath = (Join-Path $PSScriptRoot "dorks.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CatalogPath -PathType Leaf)) {
    throw "Catalog file not found: $CatalogPath"
}

$catalog = Get-Content -LiteralPath $CatalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
$selected = @($catalog.categories | Where-Object {
    $Category -eq "All" -or $_.id -eq $Category
})
if ($selected.Count -eq 0) { throw "No catalog category matched '$Category'." }

$items = @()
foreach ($group in $selected) {
    foreach ($entry in $group.queries) {
        $items += [pscustomobject]@{
            Category = [string]$group.id
            Id = [string]$entry.id
            Query = [string]$entry.query
            RiskNote = [string]$entry.risk_note
        }
    }
}

if ($List) {
    $items | Select-Object Category, Id, Query, RiskNote | Format-Table -Wrap -AutoSize
    return
}

if (-not $OpenBrowser) {
    Write-Output "Preview only. Use -OpenBrowser to open the selected Google Search pages."
    $items | Select-Object Category, Id, Query | Format-Table -Wrap -AutoSize
    return
}

$logDirectory = Join-Path $env:LOCALAPPDATA "HeavenzFire\ExposureWatch"
$logPath = Join-Path $logDirectory "query-log.csv"
if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

foreach ($item in $items) {
    $url = "https://www.google.com/search?q=" + [System.Uri]::EscapeDataString($item.Query)
    $status = "OpenRequested"
    try {
        Start-Process -FilePath $url
        Write-Output ("Opened {0} [{1}]" -f $item.Id, $item.Category)
    }
    catch {
        $status = "OpenFailed"
        Write-Warning ("Could not open query {0}: {1}" -f $item.Id, $_.Exception.Message)
    }

    $record = [pscustomobject]@{
        TimestampUtc = [DateTime]::UtcNow.ToString("o")
        Category = $item.Category
        QueryId = $item.Id
        Status = $status
    }
    if (Test-Path -LiteralPath $logPath -PathType Leaf) {
        $record | Export-Csv -LiteralPath $logPath -NoTypeInformation -Append -Encoding UTF8
    } else {
        $record | Export-Csv -LiteralPath $logPath -NoTypeInformation -Encoding UTF8
    }
}

Write-Output ("Activity log (local only): {0}" -f $logPath)
Write-Output "The log records launch attempts only. It does not confirm exposure or record search results."
