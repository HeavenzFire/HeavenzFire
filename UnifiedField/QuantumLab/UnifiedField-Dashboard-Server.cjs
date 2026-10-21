'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const {classifyWorkerHealth}=require('./uf-dashboard-health.cjs');
const HOST='127.0.0.1',PORT=8800;
const ROOT=path.join(process.env.USERPROFILE,'HeavenzFire');
const DASH=path.join(ROOT,'UnifiedField','QuantumLab','UnifiedField-Dashboard.html');
const TASKDIR=path.join(ROOT,'144A','tasks');
const GUARDIAN=path.join(ROOT,'144A','guardian-state.json');
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
 {id:'worker',name:'Unified Field local worker',url:'http://127.0.0.1:8798/health'},
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
  const state=e.id==='worker'?classifyWorkerHealth(r.ok,r.status,data):(!ok?('HTTP '+r.status):'healthy');
  return {id:e.id,name:e.name,url:e.url,state,latencyMs:Date.now()-start,data};
 }catch(err){return {id:e.id,name:e.name,url:e.url,state:'unreachable',latencyMs:Date.now()-start,error:String(err.message||err)}}
}
function readJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''))}catch{return null}}
function tasks(){
 try{return fs.readdirSync(TASKDIR).filter(n=>/^HF-.*\.json$/i.test(n)).map(n=>readJson(path.join(TASKDIR,n))).filter(Boolean).map(t=>({id:t.id,title:t.title,goal:t.goal,status:t.status,updated:t.updated||t.created||null,leadAgentName:t.leadAgentName})).sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||''))).slice(0,8)}catch{return []}
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'text/plain'});return res.end('GET only');}
 if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,service:'heavenzfire-unified-field-dashboard',host:HOST,port:PORT,mode:'read-only'}));}
 if(req.url==='/api/overview'){
  const [sv]=await Promise.all([Promise.all(endpoints.map(probe))]);
  const guardian=readJson(GUARDIAN);
  const brain=sv.find(s=>s.id==='brain');
  let state=null;try{const r=await fetch('http://127.0.0.1:8797/api/state',{signal:AbortSignal.timeout(1700)});if(r.ok)state=await r.json()}catch{}
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  return res.end(JSON.stringify({ok:true,at:new Date().toISOString(),services:sv,guardian,tasks:tasks(),brain:state|| (brain&&brain.data)||null,mode:'read-only monitor',host:HOST}));
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
