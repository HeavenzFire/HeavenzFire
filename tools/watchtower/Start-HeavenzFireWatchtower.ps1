param([ValidateSet('Start','Stop','Status','Test')][string]$Mode='Start')
$ErrorActionPreference='Stop'
$Root=Join-Path $env:LOCALAPPDATA 'HeavenzFire\Watchtower'
$InstallDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath=Join-Path $InstallDir 'watchtower.py'
$PidDir=Join-Path $Root 'pids'
$LogDir=Join-Path $Root 'logs'
$Planes=@('A','B')
$Roles=@('health','integrity')
$PythonCandidates=@('C:\Users\rucke\miniconda3\python.exe',(Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'))
$Python=$PythonCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(-not $Python){$p=Get-Command python.exe -ErrorAction SilentlyContinue;if($p){$Python=$p.Source}}
function Get-Entries {
 foreach($plane in $Planes){foreach($role in $Roles){
  [pscustomobject]@{Plane=$plane;Role=$role;Key="$plane-$role";DataDir=(Join-Path $Root "Plane-$plane")}
 }}
}
if($Mode -eq 'Test'){
 if(-not (Test-Path -LiteralPath $ScriptPath)){throw "Missing watcher script: $ScriptPath"}
 if(-not $Python){throw 'Python 3 was not found.'}
 & $Python -m py_compile $ScriptPath
 if($LASTEXITCODE -ne 0){throw 'Python compile check failed.'}
 foreach($e in (Get-Entries)){& $Python $ScriptPath --role $e.Role --data-dir $e.DataDir --once;if($LASTEXITCODE -ne 0){throw "Smoke test failed: $($e.Key)"}}
 'TEST_PASS: four independent observers ran once.'
 exit 0
}
New-Item -ItemType Directory -Force -Path $PidDir,$LogDir | Out-Null
foreach($e in (Get-Entries)){
 $pidFile=Join-Path $PidDir "$($e.Key).pid"
 if($Mode -eq 'Stop'){
  if(Test-Path -LiteralPath $pidFile){
   $id=0
   if([int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(),[ref]$id)){
    $p=Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
    if($p -and $p.CommandLine -like "*watchtower.py*"){Stop-Process -Id $id -ErrorAction SilentlyContinue}
   }
   Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }
  continue
 }
 if($Mode -eq 'Status'){
  $id='not-started';$running=$false
  if(Test-Path -LiteralPath $pidFile){$id=(Get-Content -LiteralPath $pidFile -Raw).Trim();if($id -match '^\d+$'){$running=[bool](Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue)}}
  [pscustomobject]@{Plane=$e.Plane;Role=$e.Role;PID=$id;Running=$running}
  continue
 }
 $existing=0
 if((Test-Path -LiteralPath $pidFile) -and [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(),[ref]$existing) -and (Get-Process -Id $existing -ErrorAction SilentlyContinue)){Write-Output "$($e.Key) already running PID $existing";continue}
 $out=Join-Path $LogDir "$($e.Key).out.log";$err=Join-Path $LogDir "$($e.Key).err.log"
 $args=@($ScriptPath,'--role',$e.Role,'--data-dir',$e.DataDir,'--interval','30')
 $proc=Start-Process -FilePath $Python -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ASCII
 Write-Output "Started $($e.Key) observer PID $($proc.Id)"
}
if($Mode -eq 'Start'){Write-Output "Two watch planes started (A and B) under $Root. Observe-only; no auto-remediation."}
