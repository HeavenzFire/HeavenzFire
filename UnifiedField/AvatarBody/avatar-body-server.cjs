'use strict';
const http=require('node:http');
const {createAvatarBody}=require('./avatar-body.cjs');
const HOST='127.0.0.1',PORT=Number(process.env.HEAVENZFIRE_AVATAR_BODY_PORT||8799),body=createAvatarBody();
const ORIGINS=new Set(['http://127.0.0.1:8800','http://localhost:8800','http://127.0.0.1:8799','http://localhost:8799']);
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(JSON.stringify(value));}
async function readJson(req,max=16384){let raw='';for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw,'utf8')>max){const e=new Error('request_body_too_large');e.statusCode=413;throw e;}}try{return JSON.parse(raw||'{}');}catch{const e=new Error('invalid_json');e.statusCode=400;throw e;}}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://'+HOST+':'+PORT),p=url.pathname;
 if(req.method==='GET'&&p==='/health')return send(res,200,{ok:true,service:'heavenzfire-avatar-body',mode:'simulated',host:HOST,port:PORT,physicalActuationEnabled:false});
 if(req.method==='GET'&&p==='/api/state')return send(res,200,{ok:true,state:body.getState()});
 if(req.method==='GET'&&p==='/api/events'){const n=url.searchParams.get('after')||'0';return send(res,200,{ok:true,events:body.getEvents(/^\d+$/.test(n)?Number(n):0)});}
 if(req.method==='GET'&&p==='/api/observations'){const n=url.searchParams.get('limit')||'20';return send(res,200,{ok:true,observations:body.getObservations(/^\d+$/.test(n)?Number(n):20)});}
 if(req.method!=='POST')return send(res,405,{ok:false,error:'method_not_allowed'});
 if(req.headers.origin&&!ORIGINS.has(req.headers.origin))return send(res,403,{ok:false,error:'origin_not_allowed'});
 if(req.headers['content-type']&&!req.headers['content-type'].toLowerCase().includes('application/json'))return send(res,415,{ok:false,error:'application_json_required'});
 try{const input=await readJson(req);let r;
  if(p==='/api/perception')r=body.observe(input);
  else if(p==='/api/move')r=body.move(input);
  else if(p==='/api/hardware-status')r=body.setHardwareStatus(input);
  else return send(res,404,{ok:false,error:'not_found'});
  return send(res,r.ok?(p==='/api/perception'?201:200):400,r);
 }catch(e){return send(res,e.statusCode||400,{ok:false,error:e.message||'request_failed'});}
});
server.listen(PORT,HOST,()=>console.log('HeavenzFire Avatar Body listening at http://'+HOST+':'+PORT));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
