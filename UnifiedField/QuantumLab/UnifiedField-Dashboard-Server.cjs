'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process');
const HOST='127.0.0.1',PORT=8800;
const WORKER_MODEL_ALLOWLIST=Object.freeze(['qwen2.5:0.5b','heavenzfire-runtime:latest','heavenzfire:latest','llama3.2:1b']);
const {publishWorkerResultsToJournal}=require('./uf-model-worker-journal-publisher.cjs');
const {createBlueprint,validateBlueprint,buildEvaluationMatrix,REQUIRED_ADVERSARIAL_PROFILES}=require('./worker-forge.cjs');
const {latestWorkerResults}=require('./worker-result-store.cjs');
const FORGE_AXES={
 task_type:['build','review'],
 risk_class:['LOW','MEDIUM','HIGH'],
 evidence_quality:['verified','partial'],
 tool_scope:['read_only','scoped_write'],
 adversarial_profile:REQUIRED_ADVERSARIAL_PROFILES.slice(),
 failure_mode:['timeout','invalid_output','dependency_failure']
};
const ROOT=path.join(process.env.USERPROFILE,'HeavenzFire');
const DASH=path.join(ROOT,'UnifiedField','QuantumLab','UnifiedField-Dashboard.html');
const TASKDIR=path.join(ROOT,'144A','tasks');
const GUARDIAN=path.join(ROOT,'144A','guardian-state.json');
const LOCALAI=path.join(ROOT,'UnifiedField','QuantumLab','LocalAI');
const WORKER_SCRIPT=path.join(ROOT,'UnifiedField','QuantumLab','Invoke-LocalModelWorkerBatch.ps1');
let workerRun={running:false,pid:null,startedAt:null,finishedAt:null,exitCode:null,error:null};
const endpoints=[
 {id:'browserbridge',name:'144A BrowserBridge',url:'http://127.0.0.1:18795/health'},
 {id:'ollama',name:'Local model runtime',url:'http://127.0.0.1:11434/api/tags'},
 {id:'gateway',name:'HeavenzFire gateway',url:'http://127.0.0.1:8787/health'},
 {id:'orchestrator',name:'HeavenzFire orchestrator',url:'http://127.0.0.1:8788/health'},
 {id:'agent',name:'HeavenzFire agent service',url:'http://127.0.0.1:8790/health'},
 {id:'senses',name:'Senses Console',url:'http://127.0.0.1:8794/health'},
 {id:'discovery',name:'Open-source model discovery',url:'http://127.0.0.1:8795/api/discover'},
 {id:'voice',name:'Research / voice service',url:'http://127.0.0.1:8796/health'},
 {id:'brain',name:'Digital Brain runtime',url:'http://127.0.0.1:8797/api/health'},
 {id:'mesh',name:'Mesh coordinator',url:'http://127.0.0.1:8080/health'}
];
async function probe(e){
 const start=Date.now();
 try{
  const r=await fetch(e.url,{signal:AbortSignal.timeout(1700),headers:{'Accept':'application/json'}});
  let data=null;try{data=await r.json()}catch{}
  let ok=r.ok;
  if(e.id==='ollama')ok=r.ok&&Array.isArray(data&&data.models);
  if(e.id==='discovery')ok=r.ok&&data&&data.ok===true;
  return {id:e.id,name:e.name,url:e.url,state:ok?'healthy':('HTTP '+r.status),latencyMs:Date.now()-start,data};
 }catch(err){return {id:e.id,name:e.name,url:e.url,state:'unreachable',latencyMs:Date.now()-start,error:String(err.message||err)}}
}
function readJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''))}catch{return null}}
function tasks(){
 try{return fs.readdirSync(TASKDIR).filter(n=>/^HF-.*\.json$/i.test(n)).map(n=>readJson(path.join(TASKDIR,n))).filter(Boolean).map(t=>({id:t.id,title:t.title,goal:t.goal,status:t.status,updated:t.updated||t.created||null,leadAgentName:t.leadAgentName})).sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||''))).slice(0,8)}catch{return []}
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&req.url==='/api/forge/validate'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>32768){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Blueprint body exceeds 32 KiB'}));}}
   const body=JSON.parse(raw||'{}');
   const validation=validateBlueprint(body.blueprint);
   const built=validation.ok?createBlueprint(body.blueprint):null;
   res.writeHead(200,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:true,valid:validation.ok,errors:validation.errors,blueprint_hash:built&&built.blueprint_hash}));
  }catch(err){
   res.writeHead(400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));
  }
 }
 if(req.method==='GET'&&req.url==='/api/worker/status'){
  res.writeHead(200,{'Content-Type':'application/json'});
  return res.end(JSON.stringify({ok:true,run:workerRun,latest:latestWorkerResults(LOCALAI)}));
 }
 if(req.method==='GET'&&req.url==='/api/forge/plan'){
  const plan=buildEvaluationMatrix(FORGE_AXES,{maxCases:2048});
  res.writeHead(200,{'Content-Type':'application/json'});
  return res.end(JSON.stringify({ok:true,state:'plan_ready_not_executed',axis_order:plan.axis_order,shape:plan.shape,cell_count:plan.cell_count,matrix_hash:plan.matrix_hash,adversarial_profiles:REQUIRED_ADVERSARIAL_PROFILES,axes:FORGE_AXES,note:'Plan only. No model weights trained and no candidate code executed.'}));
 }
 if(req.method==='POST'&&(req.url==='/api/worker/run'||req.url==='/api/worker/retry')){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  const isRetry=req.url==='/api/worker/retry';
  let requestedModels=WORKER_MODEL_ALLOWLIST.slice();
  if(isRetry){
   let raw='';
   try{
    for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>4096){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Retry request exceeds 4 KiB'}));}}
    const body=JSON.parse(raw||'{}');
    if(!Array.isArray(body.models)||body.models.length<1||body.models.length>WORKER_MODEL_ALLOWLIST.length||
       body.models.some(model=>typeof model!=='string'||!WORKER_MODEL_ALLOWLIST.includes(model))||
       new Set(body.models).size!==body.models.length){
      res.writeHead(400,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({ok:false,error:'Retry requires a unique, non-empty list of allowlisted model tags'}));
    }
    requestedModels=body.models;
   }catch(err){
    res.writeHead(400,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:false,error:'Invalid retry JSON: '+String(err.message||err)}));
   }
  }
  if(workerRun.running){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Worker run already active',workerRun}));}
  if(!fs.existsSync(WORKER_SCRIPT)){res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Worker script missing'}));}
  const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  let workerStdout='',workerStderr='',spawnError=null;
  const args=['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',WORKER_SCRIPT,'-OutputDirectory',LOCALAI];
  if(isRetry)args.push('-Models',...requestedModels);
  const child=cp.spawn(powershell,args,{windowsHide:true,cwd:path.dirname(WORKER_SCRIPT),env:process.env,stdio:['ignore','pipe','pipe']});
  workerRun={running:true,phase:'generating',pid:child.pid||null,startedAt:new Date().toISOString(),finishedAt:null,exitCode:null,error:null,stdout:'',stderr:'',journalPublish:null,requestedModels,runType:isRetry?'retry':'full'};
  child.stdout.on('data',chunk=>{workerStdout=(workerStdout+chunk.toString()).slice(-8000);});
  child.stderr.on('data',chunk=>{workerStderr=(workerStderr+chunk.toString()).slice(-8000);});
  child.on('error',e=>{spawnError=String(e.message||e);});
  child.on('close',async code=>{
   const startedAt=workerRun.startedAt;
   workerRun={...workerRun,phase:'publishing',exitCode:code,error:spawnError||(code!==0?(workerStderr.trim()||'Worker batch exited with code '+code):null),stdout:workerStdout,stderr:workerStderr};
   const artifact=latestWorkerResults(LOCALAI,Date.parse(startedAt||'')||Date.now());
   let journalPublish;
   if(artifact)journalPublish=await publishWorkerResultsToJournal(artifact);
   else journalPublish={state:'blocked',reason:'No result artifact was written during this batch',published:0,duplicate:0,failed:0,errors:[]};
   workerRun={...workerRun,running:false,phase:'finished',finishedAt:new Date().toISOString(),journalPublish};
  });
  res.writeHead(202,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,accepted:true,workerRun}));
 }
 if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'text/plain'});return res.end('GET only');}
 if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,service:'heavenzfire-unified-field-dashboard',host:HOST,port:PORT,mode:'local fixed-worker control'}));}
 if(req.url==='/api/overview'){
  const [sv]=await Promise.all([Promise.all(endpoints.map(probe))]);
  const guardian=readJson(GUARDIAN);
  const brain=sv.find(s=>s.id==='brain');
  let state=null;try{const r=await fetch('http://127.0.0.1:8797/api/state',{signal:AbortSignal.timeout(1700)});if(r.ok)state=await r.json()}catch{}
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  return res.end(JSON.stringify({ok:true,at:new Date().toISOString(),services:sv,guardian,tasks:tasks(),brain:state|| (brain&&brain.data)||null,modelWorker:{run:workerRun,latest:latestWorkerResults()},mode:'local monitor + fixed worker batch',host:HOST}));
 }
 if(req.url==='/'||req.url==='/index.html'){
  if(!fs.existsSync(DASH)){res.writeHead(404);return res.end('Dashboard file missing');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self' https://api.github.com; connect-src 'self' http://127.0.0.1:* https://api.github.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  return fs.createReadStream(DASH).pipe(res);
 }
 res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Not found'}));
});
server.listen(PORT,HOST,()=>console.log('HeavenzFire Unified Field Dashboard listening at http://'+HOST+':'+PORT));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
