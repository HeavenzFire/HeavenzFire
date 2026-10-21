'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const os=require('node:os');
const HOST='127.0.0.1',PORT=8081;
const RUNTIME='http://127.0.0.1:11801';
const ALLOWED=new Set(['qwen2.5:0.5b','heavenzfire-runtime:latest','heavenzfire:latest','llama3.2:1b','heavenzfire-qwen-0.5b']);
const tasks=new Map();
function send(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));}
function readBody(req){return new Promise((resolve,reject)=>{let raw='',bytes=0;req.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192){reject(Object.assign(new Error('request exceeds 8 KiB'),{status:413}));req.destroy();return;}raw+=chunk.toString('utf8')});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(Object.assign(new Error('invalid JSON'),{status:400}))}});req.on('error',reject)})}
function taskView(t){return {task_id:t.task_id,type:t.type,status:t.status,created_at:t.created_at,started_at:t.started_at||null,finished_at:t.finished_at||null,result:t.result||null,error:t.error||null}}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'heavenzfire-local-mesh-bridge',host:HOST,port:PORT,model_runtime:RUNTIME,queue_size:tasks.size,mode:'loopback bounded queue'});
 if(req.method==='GET'&&url.pathname==='/api/mesh/tasks')return send(res,200,{ok:true,tasks:[...tasks.values()].map(taskView).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,20)}); if(req.method==='GET'&&url.pathname==='/api/mesh/task') {const id=url.searchParams.get('task_id');const t=tasks.get(id);return t?send(res,200,{ok:true,task:taskView(t)}):send(res,404,{ok:false,error:'task_not_found'});}
 if(req.method==='POST'&&url.pathname==='/api/mesh/enqueue'){
  let b;try{b=await readBody(req)}catch(e){return send(res,e.status||400,{ok:false,error:e.message})}
  if(!b||typeof b!=='object'||Array.isArray(b))return send(res,400,{ok:false,error:'JSON object required'});
  if(tasks.size>=1000){for(const [id,t] of tasks){if(t.status==='completed'||t.status==='failed')tasks.delete(id);if(tasks.size<800)break;}if(tasks.size>=1000)return send(res,503,{ok:false,error:'queue capacity reached'});}
  const id='hfmesh-'+Date.now().toString(36)+'-'+crypto.randomBytes(4).toString('hex');
  const t={task_id:id,type:b.type,status:'queued',created_at:new Date().toISOString()};tasks.set(id,t);
  setImmediate(async()=>{t.status='running';t.started_at=new Date().toISOString();try{
   if(b.type==='hash_task'){
    const p=b.payload||{},input=p.input,rounds=p.rounds===undefined?1:p.rounds;
    if(typeof input!=='string'||input.length>2000||!Number.isInteger(rounds)||rounds<1||rounds>100000)throw Error('invalid hash task bounds');
    let digest=Buffer.from(input,'utf8');for(let i=0;i<rounds;i++)digest=crypto.createHash('sha256').update(digest).digest();
    t.result={algorithm:'iterated-sha256',rounds,digest:digest.toString('hex'),input_bytes:Buffer.byteLength(input)};
   }else if(b.type==='model_task'){
    const p=b.payload||{},prompt=p.prompt,model=p.model||'heavenzfire-qwen-0.5b';
    if(typeof prompt!=='string'||prompt.trim().length<1||prompt.length>3000)throw Error('prompt must contain 1-3000 characters');
    if(!ALLOWED.has(model))throw Error('model is not allowlisted');
    if(os.freemem()<1024*1024*1024)throw Error('model task paused: available RAM below 1 GiB');
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),90000);
    try{const r=await fetch(RUNTIME+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'heavenzfire-qwen-0.5b',messages:[{role:'user',content:prompt}],max_tokens:256,temperature:0.1}),signal:ctl.signal});const data=await r.json();if(!r.ok)throw Error('local inference HTTP '+r.status+': '+JSON.stringify(data).slice(0,400));t.result={model:'heavenzfire-qwen-0.5b',provider:'HeavenzFire llama.cpp runtime',response:data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content||'',usage:data.usage||null};}finally{clearTimeout(timer)}
   }else throw Error('unsupported task type');
   t.status='completed';
  }catch(e){t.status='failed';t.error=String(e.message||e)}finally{t.finished_at=new Date().toISOString()}});
  return send(res,202,{ok:true,task_id:id,status:'queued'});
 }
 return send(res,404,{ok:false,error:'not_found'});
});
server.listen(PORT,HOST,()=>console.log(JSON.stringify({event:'ready',service:'heavenzfire-local-mesh-bridge',host:HOST,port:PORT,runtime:RUNTIME})));
server.on('error',e=>{console.error('mesh bridge error: '+e.message);process.exitCode=1});