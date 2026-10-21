'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=__dirname,HOST='127.0.0.1',PORT=8797,MODEL='heavenzfire-qwen-0.5b';
const INFERENCE='http://127.0.0.1:11800/v1/chat/completions',MEMORY=path.join(ROOT,'brain-memory.jsonl'),STATEFILE=path.join(ROOT,'brain-state.json');
let tick=0,requests=0,lastEvent='boot',lastInference=null,goals=[],workingMemory=[],lastPlan=[],lastSensorAt=null,lastSensorSummary='No sensor observations yet';
const regions=['SENSORY','ASSOCIATION','PLANNING','EVALUATION','MEMORY','LANGUAGE','AVATAR','HEART'];
function gyroid(x,y,z){return Math.sin(x)*Math.cos(y)+Math.sin(y)*Math.cos(z)+Math.sin(z)*Math.cos(x)}
function makeNodes(){
 const c=[];for(let ix=0;ix<13;ix++)for(let iy=0;iy<13;iy++)for(let iz=0;iz<13;iz++){const x=-Math.PI+ix*Math.PI/6,y=-Math.PI+iy*Math.PI/6,z=-Math.PI+iz*Math.PI/6;c.push({x,y,z,score:Math.abs(gyroid(x,y,z))})}
 c.sort((a,b)=>a.score-b.score);const chosen=[];
 for(const p of c){if(chosen.every(q=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)>1.05)){chosen.push(p);if(chosen.length===64)break}}
 return chosen.map((p,i)=>({id:'g'+String(i).padStart(2,'0'),region:regions[i%regions.length],x:Number(p.x.toFixed(3)),y:Number(p.y.toFixed(3)),z:Number(p.z.toFixed(3)),surfaceError:Number(p.score.toFixed(4)),weight:Number((.35+((i*17)%61)/100).toFixed(2)),activation:0}));
}
const nodes=makeNodes(),edges=[];
function connect(a,b,kind,w){if(a===b||edges.some(e=>e.a===a&&e.b===b))return;edges.push({a,b,kind,w:Number(w.toFixed(3))})}
for(let i=0;i<nodes.length;i++){
 const near=nodes.map((n,j)=>({j,d:Math.hypot(n.x-nodes[i].x,n.y-nodes[i].y,n.z-nodes[i].z)})).filter(o=>o.j!==i).sort((a,b)=>a.d-b.d).slice(0,3);
 near.forEach(o=>connect(nodes[i].id,nodes[o.j].id,'spatial',Math.max(.15,1/(.25+o.d))));
 connect(nodes[i].id,nodes[(i+13)%nodes.length].id,'recurrent',.42);
}
function state(){return {ok:true,service:'HeavenzFire Cognitive Runtime',host:HOST,port:PORT,model:MODEL,topology:'64 sampled nodes near the gyroid implicit level set; spatial + recurrent directed graph',equation:'sin(x)cos(y)+sin(y)cos(z)+sin(z)cos(x)=0',nodes:nodes.map(n=>({...n})),edges,tick,requests,lastEvent,lastInference,regions,goals,workingMemory:workingMemory.slice(-8),lastPlan,memoryCount:readMemory().length,sensory:{last_observation_at:lastSensorAt,summary:lastSensorSummary,connected:!!lastSensorAt},modules:[{name:'Perception',status:lastSensorAt?'receiving local observations':'awaiting camera or user input'},{name:'Association',status:'active'},{name:'Working memory',status:'active'},{name:'Episodic retrieval',status:'active'},{name:'Goal manager',status:'active'},{name:'Planner',status:'active'},{name:'Response evaluator',status:'active'},{name:'Avatar / heart state',status:'active'}]};}
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'null'});res.end(JSON.stringify(obj))}
function parse(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>16000){reject(Error('Request too large'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}})})}
function readMemory(){try{return fs.readFileSync(MEMORY,'utf8').split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x))}catch(e){return []}}
function record(role,content,meta={}){const row={at:new Date().toISOString(),role,content:String(content).slice(0,5000),...meta};fs.appendFileSync(MEMORY,JSON.stringify(row)+'\n',{encoding:'utf8',flag:'a'});return row}
function persist(){try{fs.writeFileSync(STATEFILE,JSON.stringify({goals,workingMemory:workingMemory.slice(-30),lastPlan,tick,requests},null,2),'utf8')}catch(e){lastEvent='state persistence warning: '+e.message}}
function loadState(){try{const x=JSON.parse(fs.readFileSync(STATEFILE,'utf8'));goals=Array.isArray(x.goals)?x.goals:[];workingMemory=Array.isArray(x.workingMemory)?x.workingMemory:[];lastPlan=Array.isArray(x.lastPlan)?x.lastPlan:[];tick=Number(x.tick)||0;requests=Number(x.requests)||0}catch(e){}}
function pulse(text,role='input'){
 tick++;const seed=crypto.createHash('sha256').update(String(text)+':'+tick+':'+role).digest();
 const old=nodes.map(n=>n.activation);
 nodes.forEach((n,i)=>{const input=seed[i%seed.length]/255;let recurrent=0,weight=0,count=0;for(const e of edges){if(e.b===n.id){const j=nodes.findIndex(k=>k.id===e.a);if(j>=0){recurrent+=old[j]*e.w;weight+=e.w;count++}}}const spread=count?recurrent/Math.max(weight,.01):0;n.activation=Number(Math.max(0,Math.min(1,input*.55+spread*.3+n.weight*.12)).toFixed(3))});
 lastEvent=role+' propagated through '+nodes.length+' surface nodes / '+edges.length+' pathways';persist();
}
function terms(s){return String(s).toLowerCase().match(/[a-z0-9]{3,}/g)||[]}
function retrieve(q){const qs=new Set(terms(q));return readMemory().filter(r=>r.role==='user'||r.role==='assistant'||r.role==='sensor').map(r=>{const ts=terms(r.content);return {r,score:ts.reduce((n,t)=>n+(qs.has(t)?1:0),0)}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4).map(x=>({role:x.r.role,content:x.r.content,at:x.r.at,score:x.score}))}
async function infer(messages,opts={}){const started=Date.now();const response=await fetch(INFERENCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,stream:false,messages,temperature:opts.temperature??.25,max_tokens:Math.min(320,opts.num_predict??320)}),signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('HeavenzFire gateway HTTP '+response.status);const data=await response.json(),answer=String(data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content||'').trim();if(!answer)throw Error('Empty local model response');return {answer,duration_ms:Date.now()-started}}
const server=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(path.join(ROOT,'HeavenzFire-DigitalBrain.html')).pipe(res)}
 if(req.method==='GET'&&req.url==='/api/health')return send(res,200,{ok:true,service:'HeavenzFire Cognitive Runtime',model:MODEL,inference:'http://127.0.0.1:11800/v1',memoryFile:MEMORY,requests,graphNodes:nodes.length,graphEdges:edges.length});
 if(req.method==='GET'&&req.url==='/api/state')return send(res,200,state());
 if(req.method==='GET'&&req.url==='/api/vision/health'){
  try{const vr=await fetch('http://127.0.0.1:11802/health',{signal:AbortSignal.timeout(1500)});const vd=await vr.json();return send(res,vr.status,{...vd,via:'digital-brain-loopback-proxy'})}
  catch(e){return send(res,503,{ok:false,service:'local-opencv-avatar-vision',error:String(e.message||e)})}
}
if(req.method==='POST'&&req.url==='/api/vision/analyze'){
  if(!/^image\/jpeg(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))return send(res,415,{ok:false,error:'Content-Type must be image/jpeg'});
  try{
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>262144)return send(res,413,{ok:false,error:'frame must be at most 262144 bytes'});chunks.push(chunk)}
    if(bytes<1)return send(res,400,{ok:false,error:'empty camera frame'});
    const vr=await fetch('http://127.0.0.1:11802/analyze',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:Buffer.concat(chunks),signal:AbortSignal.timeout(3500)});
    let vd;try{vd=await vr.json()}catch{vd={ok:false,error:'invalid vision response'}}
    return send(res,vr.status,vd)
  }catch(e){return send(res,503,{ok:false,error:'local vision request failed: '+String(e.message||e).slice(0,160)})}
}if(req.method==='POST'&&req.url==='/api/sense'){
  let b;try{b=await parse(req)}catch(e){return send(res,400,{ok:false,error:'Invalid observation'})}
  const observation=String(b.observation||'').trim().slice(0,800);
  if(!observation)return send(res,400,{ok:false,error:'Observation required'});
  lastSensorAt=new Date().toISOString();lastSensorSummary=observation;const mm=b.metrics&&typeof b.metrics==='object'?b.metrics:{};const safeMetrics={vision:mm.vision===true,x:Number.isFinite(Number(mm.x))?Math.max(-10000,Math.min(10000,Number(mm.x))):0,y:Number.isFinite(Number(mm.y))?Math.max(-10000,Math.min(10000,Number(mm.y))):0,scene:String(mm.scene||'').slice(0,180)};record('sensor',observation,{source:String(b.source||'avatar').slice(0,40),metrics:safeMetrics});
  workingMemory.push({kind:'sensory_observation',text:observation.slice(0,500),at:new Date().toISOString()});workingMemory=workingMemory.slice(-30);
  pulse(observation,'sensory observation');persist();
  return send(res,200,{ok:true,accepted:true,state:state()});
 }
 if(req.method==='GET'&&req.url==='/api/memory')return send(res,200,{ok:true,count:readMemory().length,items:readMemory().slice(-30)});
 if(req.method==='POST'&&req.url==='/api/goal'){let b;try{b=await parse(req)}catch(e){return send(res,400,{ok:false,error:'Invalid request'})}const goal=String(b.goal||'').trim();if(!goal||goal.length>500)return send(res,400,{ok:false,error:'Goal must be 1-500 characters'});const g={id:crypto.randomUUID(),goal,status:'active',createdAt:new Date().toISOString()};goals.push(g);record('goal',goal,{goalId:g.id});workingMemory.push({kind:'goal',text:goal,at:g.createdAt});persist();pulse(goal,'goal');return send(res,200,{ok:true,goal:g,state:state()})}
 if(req.method==='POST'&&req.url==='/api/chat'){
  let body;try{body=await parse(req)}catch(e){return send(res,400,{ok:false,error:'Invalid or oversized request'})}
  const prompt=String(body.message||'').trim();if(!prompt||prompt.length>4000)return send(res,400,{ok:false,error:'Message must be 1-4000 characters'});
  pulse(prompt,'perception');requests++;const relevant=retrieve(prompt),active=nodes.filter(n=>n.activation>.55).sort((a,b)=>b.activation-a.activation).slice(0,12).map(n=>({id:n.id,region:n.region,activation:n.activation}));
  workingMemory.push({kind:'turn',text:prompt.slice(0,1000),at:new Date().toISOString()});workingMemory=workingMemory.slice(-30);
  lastPlan=['Perceive input','Retrieve relevant episodes','Update recurrent gyroid graph','Select active goal and context','Generate local response','Evaluate response constraints','Feed response back into graph'];
  record('user',prompt,{activeNodes:active.map(n=>n.id)});persist();
  const system='You are the local HeavenzFire avatar assistant in a cognitive software prototype. Be honest, useful, and clear. Do not claim to be conscious, biological, or human. Separate facts from hypotheses. Use current message, relevant prior episodes, active goals, and graph activity as context. If uncertain, say so. Do not pretend a tool or action was executed unless the system reports it. The graph is a computational routing/memory aid, not proof of human-like intelligence.\nACTIVE GOALS:\n'+(goals.filter(g=>g.status==='active').map(g=>'- '+g.goal).join('\n')||'(none)')+'\nWORKING MEMORY:\n'+workingMemory.slice(-8).map(x=>'- '+x.kind+': '+x.text).join('\n')+'\nRETRIEVED EPISODES:\n'+(relevant.map(x=>'- ['+x.role+'] '+x.content).join('\n')||'(no keyword-matched episodes)')+'\nACTIVE GRAPH NODES:\n'+JSON.stringify(active)+'\nGRAPH: '+nodes.length+' nodes sampled near the gyroid implicit surface; '+edges.length+' spatial/recurrent directed connections.';
  try{
   const result=await infer([{role:'system',content:system},{role:'user',content:prompt}],{});
   record('assistant',result.answer,{model:MODEL,retrievedEpisodes:relevant.map(x=>x.at)});workingMemory.push({kind:'answer',text:result.answer.slice(0,1200),at:new Date().toISOString()});workingMemory=workingMemory.slice(-30);
   lastInference={at:new Date().toISOString(),model:MODEL,duration_ms:result.duration_ms,retrievedEpisodes:relevant.length,answer_preview:result.answer.slice(0,240)};
   pulse(result.answer,'response');persist();return send(res,200,{ok:true,answer:result.answer,model:MODEL,retrieved:relevant.length,state:state()});
  }catch(e){lastEvent='local inference failed: '+e.message;persist();return send(res,502,{ok:false,error:'Local inference failed: '+e.message,state:state()})}
 }
 send(res,404,{ok:false,error:'Not found'});
});
loadState();server.listen(PORT,HOST,()=>console.log('HeavenzFire Cognitive Runtime listening at http://'+HOST+':'+PORT));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));