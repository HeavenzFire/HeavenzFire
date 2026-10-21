'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),vm=require('node:vm');
const HOST='127.0.0.1',PORT=8800;
const WORKER_MODEL_ALLOWLIST=Object.freeze(['heavenzfire-qwen-0.5b']);
const {publishWorkerResultsToJournal}=require('./uf-model-worker-journal-publisher.cjs');
const {OfflineTaskJournal}=require('./uf-bridge-journal.cjs');
const {createBlueprint,validateBlueprint,buildEvaluationMatrix,REQUIRED_ADVERSARIAL_PROFILES}=require('./worker-forge.cjs');
const {latestWorkerResults}=require('./worker-result-store.cjs');
const {draftWorkerBlueprint}=require('./worker-forge-drafter.cjs');
const {runAdversarialSmokeSuite}=require('./worker-forge-adversarial.cjs');
const {createWorkerRegistry}=require('./worker-registry.cjs');
const {remediateBlueprint}=require('./worker-forge-remediation.cjs');
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
const BUILD_MODEL=path.join(ROOT,'UnifiedField','QuantumLab','UnifiedField-BuildModel.json');
const TASKDIR=path.join(ROOT,'144A','tasks');
const BUILD_JOURNAL=new OfflineTaskJournal(path.join(ROOT,'UnifiedField','QuantumLab','data','bridge-tasks.jsonl'));
const BUILD_TARGETS=Object.freeze(['UnifiedField-Dashboard-Server.cjs','UnifiedField-Dashboard.html','heavenzfire-mesh-bridge.cjs','uf-local-worker.cjs','uf-bridge-journal.cjs','worker-forge.cjs','worker-forge-drafter.cjs','worker-forge-adversarial.cjs','worker-forge-remediation.cjs','worker-registry.cjs','worker-result-store.cjs','uf-model-worker-journal-publisher.cjs','UnifiedField-Dashboard.test.cjs','HeavenzFire-DigitalBrain-Server.cjs','HeavenzFire-DigitalBrain.html','embodied-avatar.integration.test.cjs','../AvatarBody/avatar-body-server.cjs','../AvatarBody/avatar-body.cjs','../AvatarBody/avatar-body.test.cjs','heavenzfire-ai-gateway.test.cjs','uf-local-worker.test.cjs','uf-bridge-journal.test.cjs','worker-forge.test.cjs','worker-forge-drafter.test.cjs','worker-forge-adversarial.test.cjs','worker-forge-remediation.test.cjs','worker-registry.test.cjs','worker-result-store.test.cjs','uf-model-worker-journal-publisher.test.cjs']);
const GUARDIAN=path.join(ROOT,'144A','guardian-state.json');
const LOCALAI=path.join(ROOT,'UnifiedField','QuantumLab','LocalAI');
const workerRegistry=createWorkerRegistry(path.join(LOCALAI,'worker-registry.json'));
const WORKER_SCRIPT=path.join(ROOT,'UnifiedField','QuantumLab','Invoke-LocalModelWorkerBatch.ps1');
let workerRun={running:false,pid:null,startedAt:null,finishedAt:null,exitCode:null,error:null};
let forgeEvaluationRun={running:false,startedAt:null,finishedAt:null,error:null,result:null,artifact_file:null};
let forgeDraftRunning=false;
function modelWorkloadBusy(){return workerRun.running||forgeEvaluationRun.running||forgeDraftRunning;}
function modelWorkloadAdmission(){return require('node:os').freemem()>=1024*1024*1024;}
const endpoints=[
 {id:'browserbridge',name:'144A BrowserBridge',url:'http://127.0.0.1:18795/health'},
 {id:'localruntime',name:'HeavenzFire direct local inference',url:'http://127.0.0.1:11801/health'},
 {id:'ollama',name:'Legacy Ollama compatibility API',url:'http://127.0.0.1:11434/api/tags'},
 {id:'gateway',name:'HeavenzFire AI gateway',url:'http://127.0.0.1:11800/health'},
 {id:'legacygateway',name:'Legacy gateway compatibility',url:'http://127.0.0.1:8787/health'},
 {id:'orchestrator',name:'HeavenzFire orchestrator',url:'http://127.0.0.1:8788/health'},
 {id:'agent',name:'HeavenzFire agent service',url:'http://127.0.0.1:8790/health'},
 {id:'senses',name:'Senses Console',url:'http://127.0.0.1:8794/health'},
 {id:'discovery',name:'Open-source model discovery',url:'http://127.0.0.1:8795/api/discover'},
 {id:'voice',name:'Research / voice service',url:'http://127.0.0.1:8796/health'},
 {id:'brain',name:'Digital Brain runtime',url:'http://127.0.0.1:8797/api/health'},
 {id:'avatarvision',name:'Avatar local vision (OpenCV)',url:'http://127.0.0.1:11802/health'},
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
function compressionStatus(){
 const root=path.join(ROOT,'UnifiedField','QuantumLab','CompressionArtifacts');
 const manifestPath=path.join(root,'benchmark.json.hfqloss.manifest.json');
 const manifest=readJson(manifestPath);
 const actualPath=path.join(root,'benchmark.json.hfqloss');
 let actualContainerBytes=null;try{actualContainerBytes=fs.statSync(actualPath).size}catch{}
 return {ok:!!(manifest&&manifest.ok&&manifest.round_trip_exact&&manifest.verified_from_disk&&actualContainerBytes===manifest.container_bytes),codec:manifest&&manifest.codec||'HFQLOSS1',mode:manifest&&manifest.mode||'lossless',source_bytes:manifest&&manifest.original_bytes||null,container_bytes:actualContainerBytes,reduction_percent:manifest&&manifest.reduction_percent||null,round_trip_exact:!!(manifest&&manifest.round_trip_exact),verified_from_disk:!!(manifest&&manifest.verified_from_disk),source_sha256:manifest&&manifest.original_sha256||null,manifest:manifestPath};
}
function compressionResearchStatus(){
 const lab=path.join(process.env.USERPROFILE,'heavenzfire-capsule-v02','gyroid-compression-lab');
 const inspect=path.join(lab,'HeavenzFire-LLM-Inspection-20261015-234726');
 const files=[['SRAC syntropic loop',path.join(inspect,'srac-engine.js')],['Gyroid/toroid tensor sweep',path.join(lab,'tensor_gyroid_toroid.py')],['Toroid/gyroid sweep',path.join(lab,'toroid_gyroid_sweep.py')],['Predictive structure validation',path.join(lab,'field-validation','predictive-structure-test-02.json')],['Lossless sweep',path.join(lab,'compression_sweep.py')],['Fair codec benchmark',path.join(lab,'fair_benchmark.py')],['Lossy reconstruction v08',path.join(lab,'reconstruct_v08_99pct.py')]];
 const components=files.map(([name,p])=>{try{const s=fs.statSync(p);return {name,path:p,exists:true,bytes:s.size,modified:s.mtime.toISOString()}}catch{return {name,path:p,exists:false,bytes:0,modified:null}}});
 const artifacts=[];try{for(const f of fs.readdirSync(lab)){if(/\.(hfq|hfq2|hfq3|hf13|hftopo|zdict|f64|bin)$/i.test(f)){try{const s=fs.statSync(path.join(lab,f));artifacts.push({name:f,bytes:s.size})}catch{}}}}catch{}
 const v=readJson(path.join(lab,'field-validation','predictive-structure-test-02.json'));
 return {ok:components.some(x=>x.name==='SRAC syntropic loop'&&x.exists),lab,components,artifact_count:artifacts.length,artifacts:artifacts.sort((a,b)=>a.bytes-b.bytes).slice(0,30),predictive_validation:v?{held_out_model_rmse:v.HeldOutModelRMSE,held_out_null_rmse:v.HeldOutNullRMSE,improvement_percent:v.ImprovementPercent,physical_field_verified:v.PhysicalFieldVerified,source_hash_unchanged:v.OriginalHashUnchanged}:null,interpretation:'Research inventory only. Predictive-model evidence is not proof of general-purpose compression or physical-field verification.'};
}
function buildTargetStatus(){
 return BUILD_TARGETS.map(name=>{const file=path.join(ROOT,'UnifiedField','QuantumLab',name);try{const st=fs.lstatSync(file);return {name,exists:st.isFile()&&!st.isSymbolicLink(),bytes:st.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}}catch{return {name,exists:false,bytes:0,sha256:null}}});
}
function buildTestTargets(name){
 if(['HeavenzFire-DigitalBrain-Server.cjs','HeavenzFire-DigitalBrain.html'].includes(name))return ['embodied-avatar.integration.test.cjs'];
 if(name.startsWith('../AvatarBody/'))return ['../AvatarBody/avatar-body.test.cjs','embodied-avatar.integration.test.cjs'];
 if(['UnifiedField-Dashboard-Server.cjs','UnifiedField-Dashboard.html','UnifiedField-Dashboard.test.cjs'].includes(name))return ['UnifiedField-Dashboard.test.cjs','heavenzfire-ai-gateway.test.cjs'];
 if(name==='heavenzfire-mesh-bridge.cjs')return ['Test-HeavenzFireMeshAdversarial.ps1'];
 if(['uf-local-worker.cjs','uf-local-worker.test.cjs'].includes(name))return ['uf-local-worker.test.cjs','uf-bridge-journal.test.cjs'];
 if(['uf-bridge-journal.cjs','uf-bridge-journal.test.cjs'].includes(name))return ['uf-bridge-journal.test.cjs','uf-local-worker.test.cjs'];
 if(name.startsWith('worker-forge')||name==='worker-registry.cjs'||name==='worker-registry.test.cjs')return ['worker-forge.test.cjs','worker-forge-drafter.test.cjs','worker-forge-adversarial.test.cjs','worker-forge-remediation.test.cjs','worker-registry.test.cjs'];
 if(name.startsWith('uf-model-worker-journal-publisher'))return ['uf-model-worker-journal-publisher.test.cjs','uf-bridge-journal.test.cjs'];
 return ['worker-result-store.test.cjs'];
}
function validateBuildContent(name,content){
 if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>262144)throw Error('content must be text no larger than 256 KiB');
 if(name.endsWith('.json'))JSON.parse(content);
 if(name.endsWith('.cjs')||name.endsWith('.js'))new vm.Script(content,{filename:name});
 if(name.endsWith('.html')){const matches=[...content.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];for(const m of matches){if(m[1].trim())new vm.Script(m[1],{filename:name+' inline script'});}}
 if(name==='UnifiedField-Dashboard-Server.cjs'&&!content.includes("server.listen(PORT,HOST"))throw Error('dashboard must retain its existing loopback listener');
 if(name==='heavenzfire-mesh-bridge.cjs'&&!content.includes("server.listen(PORT,HOST"))throw Error('mesh bridge must retain its existing loopback listener');
}
function applyScopedBuild(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('JSON object required');
 const name=body.file;
 if(typeof name!=='string'||!BUILD_TARGETS.includes(name))throw Error('file_not_allowlisted');
 if(body.approved!==true)throw Error('explicit_approval_required');
 if(typeof body.expected_sha256!=='string'||!/^[a-f0-9]{64}$/.test(body.expected_sha256))throw Error('expected_sha256_required');
 if(typeof body.content!=='string')throw Error('content_required');
 const file=path.join(ROOT,'UnifiedField','QuantumLab',name),st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>1048576)throw Error('target_not_regular_or_exceeds_1MiB');
 const before=fs.readFileSync(file),currentHash=crypto.createHash('sha256').update(before).digest('hex');
 if(currentHash!==body.expected_sha256)return {ok:false,conflict:true,error:'source_changed_since_review',file,current_sha256:currentHash};
 validateBuildContent(name,body.content);
 const afterHash=crypto.createHash('sha256').update(body.content,'utf8').digest('hex');
 if(afterHash===currentHash)return {ok:true,unchanged:true,file,sha256:currentHash,message:'No changes needed'};
 const taskId='hfbuild-'+Date.now().toString(36)+'-'+crypto.randomBytes(4).toString('hex');
 const idempotency=crypto.createHash('sha256').update([name,currentHash,afterHash].join('|')).digest('hex');
 const task={task_id:taskId,objective:'Apply explicitly approved, hash-pinned patch to existing '+name+' and run fixed local regression tests.',risk_class:'MEDIUM',idempotency_key:idempotency,scope:[name],dependencies:[],evidence_refs:[currentHash,afterHash],target_commit_sha:null};
 const prior=BUILD_JOURNAL.inspect().tasks.find(t=>t.idempotency_key===idempotency);
 if(prior&&prior.status!=='FAILED'&&prior.status!=='CONFLICT')return {ok:false,duplicate:true,error:'patch_task_already_journaled',task:prior};
 if(prior)task.idempotency_key=crypto.createHash('sha256').update(idempotency+'|retry|'+Date.now()).digest('hex');
 const enqueued=BUILD_JOURNAL.enqueue(task);
 if(enqueued.duplicate)return {ok:false,duplicate:true,error:'patch_task_already_journaled',task:enqueued.task};
 BUILD_JOURNAL.setState(taskId,'RUNNING',{attempts:1});
 const backup=file+'.bak-build-'+new Date().toISOString().replace(/[:.]/g,'-'),temporary=file+'.tmp-build-'+process.pid;
 try{
  fs.copyFileSync(file,backup);
  fs.writeFileSync(temporary,body.content,{encoding:'utf8',flag:'wx'});
  validateBuildContent(name,fs.readFileSync(temporary,'utf8'));
  fs.copyFileSync(temporary,file);fs.unlinkSync(temporary);
  const tests=buildTestTargets(name);let testResult;
  if(tests[0]==='Test-HeavenzFireMeshAdversarial.ps1'){
   const ps=path.join(ROOT,'UnifiedField','QuantumLab',tests[0]),powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
   const run=cp.spawnSync(powershell,['-NoLogo','-NoProfile','-File',ps],{cwd:path.dirname(ps),encoding:'utf8',timeout:45000,windowsHide:true});
   testResult={command:'fixed mesh adversarial test',exitCode:run.status,stdout:String(run.stdout||'').slice(-6000),stderr:String(run.stderr||'').slice(-3000)};
  }else{
   const args=['--test',...tests.map(t=>path.join(ROOT,'UnifiedField','QuantumLab',t))];
   const run=cp.spawnSync(process.execPath,args,{cwd:path.join(ROOT,'UnifiedField','QuantumLab'),encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:2*1024*1024});
   testResult={command:'node fixed regression suite',exitCode:run.status,stdout:String(run.stdout||'').slice(-10000),stderr:String(run.stderr||'').slice(-5000)};
  }
  if(testResult.exitCode!==0){fs.copyFileSync(backup,file);BUILD_JOURNAL.setState(taskId,'FAILED',{attempts:1,last_error:'regression_failed_rollback_applied'});return {ok:false,rolled_back:true,file,task_id:taskId,backup:path.basename(backup),sha256_restored:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),tests:testResult};}
  BUILD_JOURNAL.setState(taskId,'DONE',{attempts:1});
  return {ok:true,file,task_id:taskId,backup:path.basename(backup),before_sha256:currentHash,after_sha256:afterHash,tests:testResult};
 }catch(err){
  try{if(fs.existsSync(backup))fs.copyFileSync(backup,file)}catch{}
  try{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}catch{}
  try{BUILD_JOURNAL.setState(taskId,'FAILED',{attempts:1,last_error:String(err.message||err).slice(0,300)})}catch{}
  throw err;
 }
}
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
 if(req.method==='POST'&&req.url==='/api/forge/draft'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  if(modelWorkloadBusy()){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'another local model workload is active'}));}
  if(!modelWorkloadAdmission()){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'model drafting paused: available RAM is below 1 GiB'}));}
  forgeDraftRunning=true;
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>4096){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Blueprint draft request exceeds 4 KiB'}));}}
   const body=JSON.parse(raw||'{}');
   const result=await draftWorkerBlueprint({model:body.model,role:body.role,objective:body.objective},{axes:FORGE_AXES});
   res.writeHead(result.ok?200:502,{'Content-Type':'application/json'});
   return res.end(JSON.stringify(result));
  }catch(err){
   res.writeHead(400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));
  }finally{forgeDraftRunning=false;}
 }
 if(req.method==='GET'&&req.url==='/api/forge/registry'){
  try{res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,...workerRegistry.list()}));}
  catch(err){res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));}
 }
 if(req.method==='POST'&&req.url==='/api/forge/register'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>32768){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Registry request exceeds 32 KiB'}));}}
   const body=JSON.parse(raw||'{}');
   const result=workerRegistry.register(body.blueprint,body.source||'manual');
   res.writeHead(result.ok?200:400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify(result));
  }catch(err){
   res.writeHead(400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));
  }
 }
 if(req.method==='POST'&&req.url==='/api/forge/remediate'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>32768){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Remediation request exceeds 32 KiB'}));}}
   const body=JSON.parse(raw||'{}');
   const file=body.artifact_file;
   if(typeof file!=='string'||!file||file!==path.basename(file)||!file.startsWith('worker-forge-eval-')||!file.endsWith('.json')){
    res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'artifact_file must name a local Worker Forge evaluation artifact'}));
   }
   const artifactPath=path.join(LOCALAI,file);
   if(!fs.existsSync(artifactPath)){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'artifact_not_found'}));}
   let artifact;
   try{artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8').replace(/^\uFEFF/,''));}
   catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'artifact_json_invalid'}));}
   const current=workerRegistry.list().workers.find(worker=>worker.blueprint_hash===artifact.blueprint_hash);
   if(!current){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'source_worker_not_registered'}));}
   const result=remediateBlueprint(body.blueprint,artifact,file);
   if(!result.ok){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));}
   if(current.blueprint_hash!==result.source_blueprint_hash){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'registered_blueprint_hash_mismatch'}));}
   const registered=workerRegistry.register(result.blueprint,'remediation',{parent_blueprint_hash:result.source_blueprint_hash,remediation:result.report});
   if(!registered.ok){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify(registered));}
   res.writeHead(200,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({...result,registered:true,duplicate:registered.duplicate,worker:registered.worker}));
  }catch(err){
   res.writeHead(400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));
  }
 }
 if(req.method==='POST'&&req.url==='/api/forge/attach-artifact'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>4096){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Artifact reference request exceeds 4 KiB'}));}}
   const body=JSON.parse(raw||'{}');
   const file=body.artifact_file;
   if(typeof file!=='string'||!file||file!==path.basename(file)||!file.startsWith('worker-forge-eval-')||!file.endsWith('.json')){
    res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'artifact_file must name a local Worker Forge evaluation artifact'}));
   }
   const artifactPath=path.join(LOCALAI,file);
   if(!fs.existsSync(artifactPath)){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'artifact_not_found'}));}
   let artifact;
   try{artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8').replace(/^\uFEFF/,''));}
   catch{res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'artifact_json_invalid'}));}
   if(!artifact||artifact.mode!=='adversarial_smoke_only'||artifact.qualified!==false){
    res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'artifact_not_adversarial_smoke_evidence'}));
   }
   const result=workerRegistry.recordSmoke(artifact.blueprint_hash,artifact,file);
   res.writeHead(result.ok?200:400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify(result.ok?{ok:true,attached:true,worker_id:result.worker.worker_id,last_smoke:result.worker.last_smoke}:{ok:false,error:result.error}));
  }catch(err){
   res.writeHead(400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));
  }
 }
 if(req.method==='POST'&&req.url==='/api/forge/evaluate'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  if(modelWorkloadBusy()){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'another local model workload is active'}));}
  if(!modelWorkloadAdmission()){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'adversarial evaluation paused: available RAM is below 1 GiB'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>32768){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Evaluation request exceeds 32 KiB'}));}}
   const body=JSON.parse(raw||'{}');
   const validation=validateBlueprint(body.blueprint);
   if(!validation.ok){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'blueprint_invalid',errors:validation.errors}));}
   if(!WORKER_MODEL_ALLOWLIST.includes(body.model)){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'model_not_allowlisted'}));}
   const startedAt=new Date().toISOString();
   forgeEvaluationRun={running:true,startedAt,finishedAt:null,error:null,result:null,artifact_file:null,model:body.model,worker_id:body.blueprint.id,blueprint_hash:createBlueprint(body.blueprint).blueprint_hash,progress:{completed:0,total:10,profile:null,passed:null}};
   setImmediate(async()=>{
    try{
     const result=await runAdversarialSmokeSuite({model:body.model,blueprint:body.blueprint},{timeoutMs:20000,onProgress:progress=>{forgeEvaluationRun={...forgeEvaluationRun,progress};}});
     const file='worker-forge-eval-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
     fs.mkdirSync(LOCALAI,{recursive:true});
     fs.writeFileSync(path.join(LOCALAI,file),JSON.stringify(result,null,2),'utf8');
     const registryUpdate=workerRegistry.recordSmoke(result.blueprint_hash,result,file);
     forgeEvaluationRun={...forgeEvaluationRun,running:false,finishedAt:new Date().toISOString(),result,artifact_file:file,registryUpdate:{ok:registryUpdate.ok,error:registryUpdate.error||null}};
    }catch(err){
     forgeEvaluationRun={...forgeEvaluationRun,running:false,finishedAt:new Date().toISOString(),error:String(err&&err.message||err)};
    }
   });
   res.writeHead(202,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:true,accepted:true,run:{running:true,startedAt,model:body.model,worker_id:body.blueprint.id,mode:'adversarial_smoke_only'}}));
  }catch(err){
   res.writeHead(400,{'Content-Type':'application/json'});
   return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));
  }
 }
 if(req.method==='GET'&&req.url==='/api/forge/evaluation-status'){
  res.writeHead(200,{'Content-Type':'application/json'});
  return res.end(JSON.stringify({ok:true,...forgeEvaluationRun}));
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
  if(modelWorkloadBusy()){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'another local model workload is active'}));}
  if(!modelWorkloadAdmission()){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'model worker admission paused: available RAM is below 1 GiB'}));}
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
  if(modelWorkloadBusy()){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'another local model workload is active',workerRun}));}
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
 if(req.url==='/api/mesh/tasks'&&req.method==='GET'){
  try{const r=await fetch('http://127.0.0.1:8081/api/mesh/tasks',{signal:AbortSignal.timeout(1800)});const data=await r.json();res.writeHead(r.status,{'Content-Type':'application/json'});return res.end(JSON.stringify(data));}
  catch(err){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'mesh_unavailable: '+String(err.message||err)}));}
 }
 if(req.url==='/api/mesh/enqueue'&&req.method==='POST'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>4096){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Task request exceeds 4 KiB'}));}}
   const b=JSON.parse(raw||'{}');
   if(!b||typeof b!=='object'||Array.isArray(b)||!['hash_task','model_task'].includes(b.type)){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Only bounded hash_task and model_task are available'}));}
   const p=b.payload||{};
   if(b.type==='hash_task'&&(typeof p.input!=='string'||p.input.length>2000||!Number.isInteger(p.rounds||1)||(p.rounds||1)<1||(p.rounds||1)>100000)){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Hash task requires input <= 2000 chars and rounds 1-100000'}));}
   if(b.type==='model_task'&&(typeof p.prompt!=='string'||p.prompt.trim().length<1||p.prompt.length>3000)){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Model task requires a prompt of 1-3000 characters'}));}
   const upstream=await fetch('http://127.0.0.1:8081/api/mesh/enqueue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:b.type,payload:p}),signal:AbortSignal.timeout(2500)});
   const data=await upstream.json();res.writeHead(upstream.status,{'Content-Type':'application/json'});return res.end(JSON.stringify(data));
  }catch(err){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));}
 }
 if((req.url==='/api/avatar/health'||req.url==='/api/avatar/vision-health')&&req.method==='GET'){
  const target=req.url==='/api/avatar/health'?'http://127.0.0.1:8797/api/health':'http://127.0.0.1:11802/health';
  try{const r=await fetch(target,{signal:AbortSignal.timeout(1800)});const data=await r.json();res.writeHead(r.status,{'Content-Type':'application/json'});return res.end(JSON.stringify(data));}
  catch(err){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));}
 }
 if(req.method==='GET'&&req.url==='/api/build/targets'){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  return res.end(JSON.stringify({ok:true,targets:buildTargetStatus(),journal:BUILD_JOURNAL.inspect()}));
 }
 if(req.method==='GET'&&req.url.startsWith('/api/build/source?')){
  const u=new URL(req.url,'http://127.0.0.1:8800'),name=u.searchParams.get('file');
  if(typeof name!=='string'||!BUILD_TARGETS.includes(name)){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'file_not_allowlisted'}));}
  try{const file=path.join(ROOT,'UnifiedField','QuantumLab',name),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>1048576)throw Error('target_not_regular_or_exceeds_1MiB');const content=fs.readFileSync(file,'utf8');return res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}),res.end(JSON.stringify({ok:true,file:name,content,sha256:crypto.createHash('sha256').update(Buffer.from(content,'utf8')).digest('hex')}));}
  catch(err){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));}
 }
 if(req.method==='POST'&&req.url==='/api/build/apply'){
  const origin=req.headers.origin||'';
  if(origin&&origin!=='http://127.0.0.1:8800'&&origin!=='http://localhost:8800'){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Cross-origin request denied'}));}
  let raw='';
  try{
   for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>300000){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'Patch request exceeds 300 KiB'}));}}
   const result=applyScopedBuild(JSON.parse(raw||'{}'));
   res.writeHead(result.ok?200:(result.conflict?409:400),{'Content-Type':'application/json; charset=utf-8'});
   return res.end(JSON.stringify(result));
  }catch(err){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({ok:false,error:String(err.message||err)}));}
 }
 if(req.method==='GET'&&req.url==='/api/build/tasks'){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  return res.end(JSON.stringify({ok:true,...BUILD_JOURNAL.inspect()}));
 }
 if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'text/plain'});return res.end('GET only');}
 if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,service:'heavenzfire-unified-field-dashboard',host:HOST,port:PORT,mode:'local fixed-worker control'}));}
 if(req.url==='/api/compression/status'&&req.method==='GET'){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  return res.end(JSON.stringify(compressionStatus()));
 }
 if(req.url==='/api/compression/research'&&req.method==='GET'){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  return res.end(JSON.stringify(compressionResearchStatus()));
 }
 if(req.url==='/api/build-model'){
  const targets=[
   {id:'momentumq',name:'MomentumQ IDE',url:'http://127.0.0.1:11810/api/health'},
   {id:'gateway',name:'HeavenzFire inference gateway',url:'http://127.0.0.1:11800/health'},
   {id:'runtime',name:'HeavenzFire llama.cpp runtime',url:'http://127.0.0.1:11801/health'},
   {id:'voice',name:'Tesla / Einstein voice console',url:'http://127.0.0.1:8796/health'},
   {id:'brain',name:'Digital Brain',url:'http://127.0.0.1:8797/api/health'},
   {id:'research',name:'Einstein / Tesla R&D',url:'http://127.0.0.1:8765/'},
   {id:'vision',name:'Local OpenCV vision',url:'http://127.0.0.1:11802/health'},
   {id:'dashboard',name:'Unified Field dashboard',url:'http://127.0.0.1:8800/health'},
   {id:'mesh',name:'Mesh bridge',url:'http://127.0.0.1:8081/health'},
   {id:'journal',name:'Local task journal worker',url:'http://127.0.0.1:8798/health'}
  ];
  const services=await Promise.all(targets.map(probe));
  let reg={count:0,workers:[],error:null};try{reg=workerRegistry.list()}catch(e){reg={count:0,workers:[],error:String(e.message||e)}}
  const workers=Array.isArray(reg.workers)?reg.workers:[];
  const qualified=workers.filter(w=>w.qualification&&w.qualification.state==='qualified').length;
  const weightPath=path.join(ROOT,'UnifiedField','QuantumLab','Runtime','Models','qwen2.5-0.5b-instruct-q4_k_m.gguf');
  let weightBytes=null;try{weightBytes=fs.statSync(weightPath).size}catch{}
  const names=['Start-UnifiedField.ps1','heavenzfire-ide.html','heavenzfire-ide-server.cjs','heavenzfire-ai-gateway.cjs','Start-HeavenzFireLocalRuntime.ps1','HeavenzFire-DigitalBrain-Server.cjs','HeavenzFire-DigitalBrain.html','HeavenzFire-Avatar-Vision.py','hfq_compression_bridge.py','Invoke-LocalModelWorkerBatch.ps1','worker-forge.cjs','worker-forge-drafter.cjs','worker-forge-adversarial.cjs','uf-bridge-journal.cjs','heavenzfire-mesh-bridge.cjs'];
  const files=names.map(name=>({name,exists:fs.existsSync(path.join(ROOT,'UnifiedField','QuantumLab',name))}));
  const compression=compressionStatus();
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
  return res.end(JSON.stringify({ok:true,model:readJson(BUILD_MODEL),inference:{model:'heavenzfire-qwen-0.5b',weights:weightPath,weightBytes,api:'http://127.0.0.1:11800/v1',provider:'llama.cpp',usesOllamaApi:false},services,files,compression,compressionResearch:compressionResearchStatus(),workers:{count:reg.count||workers.length,qualified,unqualified:Math.max(0,workers.length-qualified),registry_error:reg.error||null,registry:workers.map(w=>({worker_id:w.worker_id,role:w.role,state:w.state,qualification:w.qualification&&w.qualification.state||'not_qualified',last_smoke:w.last_smoke&&w.last_smoke.state||null}))},forge:{plan_cases:buildEvaluationMatrix(FORGE_AXES,{maxCases:2048}).cell_count,qualification_requires_independent_approval:true},at:new Date().toISOString()}));
 }
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
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self' https://api.github.com; connect-src 'self' http://127.0.0.1:* https://api.github.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'self' http://127.0.0.1:8797; frame-ancestors 'none'"});
  return fs.createReadStream(DASH).pipe(res);
 }
 res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Not found'}));
});
server.listen(PORT,HOST,()=>console.log('HeavenzFire Unified Field Dashboard listening at http://'+HOST+':'+PORT));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));