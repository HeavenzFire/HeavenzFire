'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process');
const HOST='127.0.0.1',PORT=8800;
const {publishWorkerResultsToJournal}=require('./uf-model-worker-journal-publisher.cjs');
const ROOT=path.join(process.env.USERPROFILE,'HeavenzFire');
const DASH=path.join(ROOT,'UnifiedField','QuantumLab','UnifiedField-Dashboard.html');
const TASKDIR=path.join(ROOT,'144A','tasks');
const GUARDIAN=path.join(ROOT,'144A','guardian-state.json');
const LOCALAI=path.join(ROOT,'UnifiedField','QuantumLab','LocalAI');
const WORKER_SCRIPT=path.join(ROOT,'UnifiedField','QuantumLab','Invoke-LocalModelWorkerBatch.ps1');
let workerRun={running:false,pid:null,startedAt:null,finishedAt:null,exitCode:null,error:null};
function latestWorkerResults(minMtime=0){try{const files=fs.readdirSync(LOCALAI).filter(n=>n.toLowerCase().startsWith('worker-smoke-')&&n.toLowerCase().endsWith('.json')).map(n=>({name:n,mtime:fs.statSync(path.join(LOCALAI,n)).mtimeMs})).filter(x=>x.mtime>=minMtime).sort((a,b)=>b.mtime-a.mtime);if(!files.length)return null;return {file:files[0].name,results:readJson(path.join(LOCALAI,files[0].name))}}catch{return null}}
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
 if(req.method==='POST'&&req.url==='/api/worker/run'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  if(workerRun.running){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Worker run already active',workerRun}));}
  if(!fs.existsSync(WORKER_SCRIPT)){res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Worker script missing'}));}
  const child=cp.spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',WORKER_SCRIPT],{windowsHide:true,stdio:'ignore'});
  workerRun={running:true,pid:child.pid||null,startedAt:new Date().toISOString(),finishedAt:null,exitCode:null,error:null};
  child.on('error',e=>{workerRun={...workerRun,running:false,finishedAt:new Date().toISOString(),error:String(e.message||e)}});
  child.on('close',async code=>{const startedAt=workerRun.startedAt;workerRun={...workerRun,running:false,finishedAt:new Date().toISOString(),exitCode:code};const artifact=latestWorkerResults(Date.parse(startedAt||'')||Date.now());if(artifact){const journalPublish=await publishWorkerResultsToJournal(artifact);workerRun={...workerRun,journalPublish};}});
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
