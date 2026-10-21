#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$DashboardRoot = (Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField\QuantumLab')
)
$ErrorActionPreference = 'Stop'
$serverPath = Join-Path $DashboardRoot 'UnifiedField-Dashboard-Server.cjs'
$htmlPath = Join-Path $DashboardRoot 'UnifiedField-Dashboard.html'
if (-not (Test-Path $serverPath) -or -not (Test-Path $htmlPath)) {
    throw "Dashboard source files were not found under $DashboardRoot"
}
$server = [IO.File]::ReadAllText($serverPath)
$html = [IO.File]::ReadAllText($htmlPath)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$serverBackup = $null
$htmlBackup = $null
$serverChanged = $false
$htmlChanged = $false

try {
    if (-not $server.Contains("req.url==='/api/mesh/enqueue'")) {
        $marker = " if(req.method==='GET'&&req.url==='/api/worker/status'){"
        if (([regex]::Matches($server, [regex]::Escape($marker))).Count -ne 1) {
            throw 'Could not uniquely locate worker-status route for mesh proxy insertion.'
        }
        if (-not $serverBackup) {
            $serverBackup = $serverPath + '.bak-mesh-console-' + $stamp
            Copy-Item -LiteralPath $serverPath -Destination $serverBackup
        }
        $routes = @'
 if(req.method==='POST'&&req.url==='/api/mesh/enqueue'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>8192){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Mesh request exceeds 8 KiB'}));}}
   const body=JSON.parse(raw||'{}');
   if(!body||typeof body!=='object'||Array.isArray(body))throw Error('JSON object required');
   let payload={};
   if(body.type==='hash_task'){
    const input=body.payload&&body.payload.input!==undefined?body.payload.input:'';
    const rounds=body.payload&&body.payload.rounds!==undefined?body.payload.rounds:1;
    if(typeof input!=='string'||input.length>2000)throw Error('hash_task input must be text of at most 2000 characters');
    if(!Number.isInteger(rounds)||rounds<1||rounds>100000)throw Error('hash_task rounds must be an integer from 1 to 100000');
    payload={input,rounds};
   }else if(body.type==='model_task'){
    const prompt=body.payload&&body.payload.prompt;
    const model=body.payload&&body.payload.model||'qwen2.5:0.5b';
    if(typeof prompt!=='string'||prompt.trim().length<1||prompt.length>3000)throw Error('model_task prompt must contain 1-3000 characters');
    if(!WORKER_MODEL_ALLOWLIST.includes(model))throw Error('model is not in the local allowlist');
    payload={prompt,model};
   }else throw Error('unsupported task type; use hash_task or model_task');
   const upstream=await fetch('http://127.0.0.1:8081/api/mesh/enqueue',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({type:body.type,payload}),signal:AbortSignal.timeout(5000)});
   const data=await upstream.json();
   res.writeHead(upstream.status,{'Content-Type':'application/json'});
   return res.end(JSON.stringify(data));
  }catch(err){
   const status=String(err.message||err).includes('fetch failed')?502:400;
   res.writeHead(status,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));
  }
 }
 if(req.method==='GET'&&new URL(req.url,'http://127.0.0.1:8800').pathname==='/api/mesh/task'){
  const parsed=new URL(req.url,'http://127.0.0.1:8800');
  const taskId=parsed.searchParams.get('task_id')||'';
  if(!taskId||taskId.length>100){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'valid task_id required'}));}
  try{
   const upstream=await fetch('http://127.0.0.1:8081/api/mesh/task?task_id='+encodeURIComponent(taskId),{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(5000)});
   const data=await upstream.json();
   res.writeHead(upstream.status,{'Content-Type':'application/json'});
   return res.end(JSON.stringify(data));
  }catch(err){res.writeHead(502,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'mesh bridge unavailable'}));}
 }
'@
        $server = $server.Replace($marker, $routes + $marker)
        $serverChanged = $true
    }

    if (-not $server.Contains("id:'mesh-bridge'")) {
        $needle = " {id:'mesh',name:'Mesh coordinator',url:'http://127.0.0.1:8080/health'}"
        if (([regex]::Matches($server, [regex]::Escape($needle))).Count -ne 1) {
            throw 'Could not uniquely locate mesh endpoint inventory.'
        }
        if (-not $serverBackup) {
            $serverBackup = $serverPath + '.bak-mesh-console-' + $stamp
            Copy-Item -LiteralPath $serverPath -Destination $serverBackup
        }
        $endpoints = @'
 {id:'mesh',name:'Mesh coordinator',url:'http://127.0.0.1:8080/health'},
 {id:'mesh-bridge',name:'Mesh dashboard bridge',url:'http://127.0.0.1:8081/health'},
 {id:'mesh-worker-18101',name:'Mesh worker 18101',url:'http://127.0.0.1:18101/health'},
 {id:'mesh-worker-18102',name:'Mesh worker 18102',url:'http://127.0.0.1:18102/health'},
 {id:'mesh-worker-18103',name:'Mesh worker 18103',url:'http://127.0.0.1:18103/health'}
'@
        $server = $server.Replace($needle, $endpoints.TrimEnd())
        $serverChanged = $true
    }

    if (-not $html.Contains('id="meshHashButton"')) {
        $markupMarker = '<section class="card span12"><h2>Local AI worker pool'
        if (([regex]::Matches($html, [regex]::Escape($markupMarker))).Count -ne 1) {
            throw 'Could not uniquely locate dashboard markup insertion point.'
        }
        $jsMarker = 'async function validateForgeBlueprint(){'
        if (([regex]::Matches($html, [regex]::Escape($jsMarker))).Count -ne 1) {
            throw 'Could not uniquely locate dashboard JavaScript insertion point.'
        }
        if (-not $htmlBackup) {
            $htmlBackup = $htmlPath + '.bak-mesh-console-' + $stamp
            Copy-Item -LiteralPath $htmlPath -Destination $htmlBackup
        }
        $markup = @'
<section class="card span12"><h2>Mesh task console - authenticated local queue</h2>
<div class="detail">Submit bounded local hash or model tasks through the authenticated mesh. Model tasks may consume substantial RAM; do not queue them while the host resource guard is warning. No shell commands are accepted.</div>
<div class="actions" style="margin:12px 0">
<input id="meshHashInput" type="text" maxlength="2000" value="HeavenzFire grid canary" aria-label="Text to hash" style="flex:1;min-width:220px;background:#0c141e;border:1px solid #34516a;color:var(--text);border-radius:8px;padding:9px">
<button id="meshHashButton">Queue hash task</button>
</div>
<div class="actions" style="margin:12px 0">
<select id="meshModelSelect" aria-label="Local model" style="background:#0c141e;border:1px solid #34516a;color:var(--text);border-radius:8px;padding:9px"><option>qwen2.5:0.5b</option><option>llama3.2:1b</option><option>heavenzfire:latest</option><option>heavenzfire-runtime:latest</option></select>
<textarea id="meshModelPrompt" maxlength="3000" rows="2" placeholder="Describe a bounded engineering task for a local model" style="flex:1;min-width:240px;background:#0c141e;border:1px solid #34516a;color:var(--text);border-radius:8px;padding:9px"></textarea>
<button id="meshModelButton">Queue model task</button>
</div>
<div id="meshTaskStatus" class="detail" role="status" aria-live="polite">Mesh task queue status not yet checked.</div>
</section>
'@
        $html = $html.Replace($markupMarker, $markup + $markupMarker)
        $js = @'
async function submitMeshTask(type,payload){
 const hashButton=$('meshHashButton'),modelButton=$('meshModelButton'),status=$('meshTaskStatus');
 hashButton.disabled=true;modelButton.disabled=true;status.textContent='Submitting bounded '+type+'...';
 try{
  const response=await fetch('/api/mesh/enqueue',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({type,payload})});
  const queued=await response.json();if(!response.ok||!queued.ok||!queued.task_id)throw Error(queued.error||('HTTP '+response.status));
  status.textContent='Queued '+queued.task_id+' - waiting for an authenticated worker...';
  for(let i=0;i<60;i++){
   await new Promise(resolve=>setTimeout(resolve,500));
   const check=await fetch('/api/mesh/task?task_id='+encodeURIComponent(queued.task_id),{cache:'no-store'});
   const state=await check.json();
   if(!check.ok||!state.ok)throw Error(state.error||('Task lookup HTTP '+check.status));
   const task=state.task;
   if(task.status==='completed'){status.textContent='COMPLETED - '+task.task_id+' - '+JSON.stringify(task.result);return}
   if(task.status==='failed'){status.textContent='FAILED - '+task.task_id+' - '+String(task.error||'No error detail');return}
  }
  status.textContent='Still queued or running - task ID '+queued.task_id+' - check status before retrying to avoid duplicate work.';
 }catch(error){status.textContent='Mesh task rejected or unavailable: '+String(error.message||error)}
 finally{hashButton.disabled=false;modelButton.disabled=false}
}
$('meshHashButton').addEventListener('click',()=>submitMeshTask('hash_task',{input:$('meshHashInput').value,rounds:2}));
$('meshModelButton').addEventListener('click',()=>submitMeshTask('model_task',{prompt:$('meshModelPrompt').value,model:$('meshModelSelect').value}));
'@
        $html = $html.Replace($jsMarker, $js + $jsMarker)
        $htmlChanged = $true
    }

    if ($serverChanged) { [IO.File]::WriteAllText($serverPath, $server, (New-Object System.Text.UTF8Encoding($false))) }
    if ($htmlChanged) { [IO.File]::WriteAllText($htmlPath, $html, (New-Object System.Text.UTF8Encoding($false))) }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    & $node --check $serverPath
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard server JavaScript syntax check failed.' }
    $match = [regex]::Match($html, '<script>([\s\S]*?)</script>')
    if (-not $match.Success) { throw 'Dashboard script element is missing.' }
    $tempJs = Join-Path $env:TEMP ('heavenzfire-dashboard-check-' + [guid]::NewGuid().ToString('N') + '.js')
    try {
        [IO.File]::WriteAllText($tempJs, $match.Groups[1].Value, (New-Object System.Text.UTF8Encoding($false)))
        & $node --check $tempJs
        if ($LASTEXITCODE -ne 0) { throw 'Embedded dashboard JavaScript syntax check failed.' }
    } finally { Remove-Item -LiteralPath $tempJs -Force -ErrorAction SilentlyContinue }

    'MESH_TASK_CONSOLE=READY'
    'SERVER_CHANGED=' + $serverChanged
    'HTML_CHANGED=' + $htmlChanged
    if ($serverBackup) { 'SERVER_BACKUP=' + $serverBackup }
    if ($htmlBackup) { 'HTML_BACKUP=' + $htmlBackup }
    'SYNTAX_CHECKS=PASS'
} catch {
    if ($serverBackup -and (Test-Path $serverBackup)) { Copy-Item -LiteralPath $serverBackup -Destination $serverPath -Force }
    if ($htmlBackup -and (Test-Path $htmlBackup)) { Copy-Item -LiteralPath $htmlBackup -Destination $htmlPath -Force }
    throw
}
