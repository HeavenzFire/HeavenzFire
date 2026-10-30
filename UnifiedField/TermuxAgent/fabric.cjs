'use strict';
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path'), crypto=require('node:crypto');
const LOOPBACK=new Set(['127.0.0.1','localhost','::1','[::1]']);
const TRANSITIONS={queued:new Set(['running','failed']),running:new Set(['succeeded','failed']),succeeded:new Set(),failed:new Set(['queued'])};
function validateBackendEndpoint(value,remoteHosts=[]){
 let u; try{u=new URL(value)}catch{throw Error('Backend endpoint must be a valid URL')}
 if(u.username||u.password||u.search||u.hash)throw Error('Backend endpoint cannot contain credentials, query, or fragment');
 const local=u.protocol==='http:'&&LOOPBACK.has(u.hostname), remote=u.protocol==='https:'&&remoteHosts.includes(u.hostname.toLowerCase());
 if(!local&&!remote)throw Error('Backend must use loopback HTTP or an explicitly allowlisted HTTPS host');
 return u;
}
class RuntimeRegistry{
 constructor({remoteHosts=[],fetchImpl=fetch,probeTimeoutMs=2500}={}){this.remoteHosts=remoteHosts.map(x=>String(x).toLowerCase());this.fetch=fetchImpl;this.probeTimeoutMs=probeTimeoutMs;this.backends=new Map()}
 register(input){
  if(!input||typeof input.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.id))throw Error('Backend id is invalid');
  if(this.backends.has(input.id))throw Error('Backend already registered: '+input.id);
  const url=validateBackendEndpoint(input.endpoint,this.remoteHosts),priority=input.priority??100,maxParallel=input.maxParallel??1;
  if(!Number.isInteger(priority)||priority<0||priority>10000)throw Error('Backend priority must be 0..10000');
  if(!Number.isInteger(maxParallel)||maxParallel<1||maxParallel>64)throw Error('Backend maxParallel must be 1..64');
  const b={id:input.id,endpoint:url.origin,kind:LOOPBACK.has(url.hostname)?'local':'remote',model:String(input.model||'unknown-model'),capabilities:Array.isArray(input.capabilities)?[...new Set(input.capabilities)]:['chat'],priority,maxParallel,state:'unknown',lastCheckedAt:null,lastError:null};
  if(!b.capabilities.includes('chat'))throw Error('Backend must advertise chat capability');
  this.backends.set(b.id,b);return {...b,capabilities:[...b.capabilities]};
 }
 get(id){const b=this.backends.get(id);return b?{...b,capabilities:[...b.capabilities]}:null}
 list(){return [...this.backends.values()].map(b=>({...b,capabilities:[...b.capabilities]})).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))}
 async probe(id){
  const b=this.backends.get(id);if(!b)throw Error('Unknown backend: '+id);
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),this.probeTimeoutMs);
  try{const r=await this.fetch(new URL('/health',b.endpoint),{method:'GET',redirect:'error',signal:c.signal});if(!r.ok)throw Error('health_http_'+r.status);b.state='healthy';b.lastError=null}
  catch(e){b.state='unhealthy';b.lastError=e.name==='AbortError'?'health_timeout':String(e.message||e)}
  finally{clearTimeout(timer)}
  b.lastCheckedAt=new Date().toISOString();return this.get(id);
 }
 async probeAll(){return Promise.all(this.list().map(b=>this.probe(b.id)))}
 healthy(capability='chat'){return this.list().filter(b=>b.state==='healthy'&&b.capabilities.includes(capability))}
}
async function readResourceSnapshot({meminfoPath='/proc/meminfo',statfs=fs.statfs,home=os.homedir(),loadavg=os.loadavg}={}){
 const s={capturedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,cpuCount:os.cpus().length,load1m:loadavg()[0],memory:null,storage:null};
 try{const raw=await fs.readFile(meminfoPath,'utf8'),v=Object.fromEntries([...raw.matchAll(/^(\w+):\s+(\d+)\s+kB$/gm)].map(m=>[m[1],Number(m[2])*1024]));s.memory={totalBytes:v.MemTotal??null,availableBytes:v.MemAvailable??null,freeBytes:v.MemFree??null,swapFreeBytes:v.SwapFree??null}}
 catch{s.memory={totalBytes:null,availableBytes:null,freeBytes:null,swapFreeBytes:null}}
 try{const x=await statfs(home);s.storage={totalBytes:Number(x.blocks)*Number(x.bsize),availableBytes:Number(x.bavail)*Number(x.bsize)}}
 catch{s.storage={totalBytes:null,availableBytes:null}}
 return s;
}
class TaskLedger{
 constructor(file){this.file=path.resolve(file);this.events=[];this.states=new Map();this.loaded=false}
 async open(){
  if(this.loaded)return this;await fs.mkdir(path.dirname(this.file),{recursive:true});let raw='';
  try{raw=await fs.readFile(this.file,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
  const lines=raw.split('\n');if(lines.length&&lines[lines.length-1]!=='')lines.pop();
  for(const line of lines){if(!line)continue;let event;try{event=JSON.parse(line)}catch{throw Error('Ledger contains a malformed complete event')}this._apply(event)}
  this.loaded=true;return this;
 }
 _apply(event){
  if(!event||typeof event.taskId!=='string'||!TRANSITIONS[event.state])throw Error('Invalid ledger event');
  const previous=this.states.get(event.taskId);
  if(!previous){if(event.state!=='queued')throw Error('First task event must be queued')}
  else if(!TRANSITIONS[previous.state].has(event.state))throw Error('Invalid task transition: '+previous.state+' -> '+event.state);
  this.states.set(event.taskId,event);this.events.push(event);return event;
 }
 async append(taskId,state,details={}){
  if(!this.loaded)await this.open();const event={eventId:crypto.randomUUID(),taskId,state,at:new Date().toISOString(),...details};
  this._apply(event);await fs.appendFile(this.file,JSON.stringify(event)+'\n',{encoding:'utf8',mode:0o600});return event;
 }
 async create(taskId,input={}){
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(taskId))throw Error('Invalid task id');
  if(this.states.has(taskId))throw Error('Task already exists: '+taskId);
  return this.append(taskId,'queued',{input});
 }
 async transition(taskId,state,details={}){if(!this.states.has(taskId))throw Error('Unknown task: '+taskId);return this.append(taskId,state,details)}
 get(id){return this.states.get(id)||null}
 list(){return [...this.states.values()]}
 async recoverRunning(){if(!this.loaded)await this.open();const out=[];for(const t of this.list())if(t.state==='running')out.push(await this.transition(t.taskId,'failed',{error:'process_interrupted',recoverable:true}));return out}
}
async function invokeChat(backend,prompt,{fetchImpl=fetch,timeoutMs=60000}={}){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeoutMs);
 try{
  const r=await fetchImpl(new URL('/v1/chat/completions',backend.endpoint),{method:'POST',redirect:'error',signal:c.signal,headers:{'content-type':'application/json'},body:JSON.stringify({model:backend.model,stream:false,messages:[{role:'system',content:'You are a bounded analysis worker. Do not claim external tool use or verification.'},{role:'user',content:prompt}]})});
  if(!r.ok)throw Error('inference_http_'+r.status);const p=await r.json(),a=p?.choices?.[0]?.message?.content;
  if(typeof a!=='string'||!a.trim())throw Error('inference_empty_response');return a.trim();
 }catch(e){if(e.name==='AbortError')throw Error('inference_timeout');throw e}finally{clearTimeout(timer)}
}
class FabricScheduler{
 constructor({registry,ledger,resourceProvider=readResourceSnapshot,invoke=invokeChat,reserveMemoryMB=512,memoryPerTaskMB=256,maxParallel=16,timeoutMs=60000}={}){
  if(!registry||!ledger)throw Error('Scheduler requires registry and ledger');
  this.registry=registry;this.ledger=ledger;this.resourceProvider=resourceProvider;this.invoke=invoke;this.reserveMemoryMB=reserveMemoryMB;this.memoryPerTaskMB=memoryPerTaskMB;this.maxParallel=maxParallel;this.timeoutMs=timeoutMs;
 }
 async capacity(requested){
  const snapshot=await this.resourceProvider(),available=snapshot.memory?.availableBytes;
  const memorySlots=Number.isFinite(available)?Math.max(0,Math.floor((available/1048576-this.reserveMemoryMB)/this.memoryPerTaskMB)):1;
  const backendSlots=this.registry.healthy().reduce((n,b)=>n+b.maxParallel,0);
  return {snapshot,parallelism:Math.max(1,Math.min(requested,this.maxParallel,memorySlots||1,backendSlots||1)),memorySlots,backendSlots};
 }
 async run(tasks,{parallelism=4}={}){
  if(!Array.isArray(tasks)||tasks.length<1||tasks.length>64)throw Error('Provide 1..64 tasks');
  if(!Number.isInteger(parallelism)||parallelism<1||parallelism>16)throw Error('parallelism must be 1..16');
  const ids=new Set();for(const t of tasks){if(!t||typeof t.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(t.id)||ids.has(t.id))throw Error('Task ids must be valid and unique');if(typeof t.prompt!=='string'||!t.prompt.trim()||t.prompt.length>8000)throw Error('Task prompt must contain 1..8000 characters');ids.add(t.id)}
  await this.ledger.open();const backends=this.registry.healthy(),cap=await this.capacity(parallelism);
  for(const t of tasks)await this.ledger.create(t.id,{prompt:t.prompt});
  const results=new Array(tasks.length);let next=0;
  const worker=async()=>{
   while(true){const i=next++;if(i>=tasks.length)return;const t=tasks[i],startedAt=new Date().toISOString(),started=Date.now();
    await this.ledger.transition(t.id,'running',{startedAt});let answer,selected,errors=[];
    for(const b of backends){try{answer=await this.invoke(b,t.prompt,{timeoutMs:this.timeoutMs});selected=b;break}catch(e){errors.push({backendId:b.id,error:String(e.message||e)})}}
    if(selected){const d={backendId:selected.id,model:selected.model,durationMs:Date.now()-started};await this.ledger.transition(t.id,'succeeded',d);results[i]={id:t.id,status:'succeeded',...d,answer,failoverErrors:errors}}
    else{const error=backends.length?'all_backends_failed':'no_healthy_backend';await this.ledger.transition(t.id,'failed',{error,attempts:errors,durationMs:Date.now()-started});results[i]={id:t.id,status:'failed',error,attempts:errors,durationMs:Date.now()-started}}
   }
  };
  await Promise.all(Array.from({length:Math.min(cap.parallelism,tasks.length)},worker));
  return {schema:'heavenzfire.inference-fabric-run.v1',runId:crypto.randomUUID(),finishedAt:new Date().toISOString(),requestedParallelism:parallelism,effectiveParallelism:Math.min(cap.parallelism,tasks.length),capacity:{memorySlots:cap.memorySlots,backendSlots:cap.backendSlots,availableMemoryBytes:cap.snapshot.memory?.availableBytes??null},backends:backends.map(b=>({id:b.id,model:b.model,kind:b.kind})),taskCount:results.length,succeeded:results.filter(x=>x.status==='succeeded').length,failed:results.filter(x=>x.status==='failed').length,results};
 }
}
module.exports={RuntimeRegistry,readResourceSnapshot,TaskLedger,FabricScheduler,invokeChat,validateBackendEndpoint,TRANSITIONS};
