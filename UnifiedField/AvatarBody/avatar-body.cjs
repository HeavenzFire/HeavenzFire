'use strict';
const MAX_EVENTS=256, MAX_OBSERVATIONS=128, MAX_STEP=0.25;
const BOUNDS=Object.freeze({x:[-10,10],y:[0,5],z:[-10,10]});
const SENSOR_TYPES=new Set(['visual','audio','proximity','environment','system']);
const clone=v=>JSON.parse(JSON.stringify(v));
function createAvatarBody(options={}) {
 const now=typeof options.now==='function'?options.now:()=>new Date().toISOString();
 const events=[], observations=[];
 const state={schema:'heavenzfire.avatar-body.v1',avatarId:String(options.avatarId||'heavenzfire-avatar').slice(0,80),mode:'simulated',
  hardware:{camera:'not_connected',microphone:'not_connected',actuators:'not_connected'},
  pose:{position:{x:0,y:0,z:0},orientation:{yaw:0,pitch:0,roll:0}},
  perception:{latestAt:null,observationCount:0,latestByType:{}},
  motion:{sequence:0,lastActionAt:null,lastAction:null},
  safety:{maxStep:MAX_STEP,bounds:clone(BOUNDS),physicalActuationEnabled:false},updatedAt:now()};
 function emit(type,details={}) { const e={sequence:events.length?events[events.length-1].sequence+1:1,at:now(),type,details:clone(details)};events.push(e);if(events.length>MAX_EVENTS)events.shift();return e; }
 function getState(){return clone(state);}
 function getEvents(after=0){const c=Number.isInteger(after)&&after>=0?after:0;return events.filter(e=>e.sequence>c).map(clone);}
 function getObservations(limit=20){const n=Number.isInteger(limit)?Math.max(0,Math.min(50,limit)):20;return observations.slice(-n).map(clone);}
 function observe(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,error:'observation_must_be_an_object'};
  if(typeof input.sensorId!=='string'||!/^[a-zA-Z0-9._:-]{1,80}$/.test(input.sensorId))return{ok:false,error:'sensorId_invalid'};
  if(!SENSOR_TYPES.has(input.type))return{ok:false,error:'sensor_type_unsupported'};
  if(input.data===undefined||input.data===null||typeof input.data!=='object')return{ok:false,error:'observation_data_must_be_an_object'};
  let raw;try{raw=JSON.stringify(input.data);}catch{return{ok:false,error:'observation_data_not_serializable'};}
  if(Buffer.byteLength(raw,'utf8')>8192)return{ok:false,error:'observation_data_too_large'};
  const at=typeof input.observedAt==='string'&&!Number.isNaN(Date.parse(input.observedAt))?new Date(input.observedAt).toISOString():now();
  const item={id:'obs-'+(state.perception.observationCount+1),sensorId:input.sensorId,type:input.type,observedAt:at,receivedAt:now(),data:clone(input.data)};
  observations.push(item);if(observations.length>MAX_OBSERVATIONS)observations.shift();
  state.perception.observationCount++;state.perception.latestAt=item.receivedAt;
  state.perception.latestByType[input.type]={id:item.id,sensorId:item.sensorId,observedAt:item.observedAt};state.updatedAt=item.receivedAt;
  emit('perception.observed',{id:item.id,sensorId:item.sensorId,type:item.type});return{ok:true,observation:clone(item),state:getState()};
 }
 function move(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,error:'movement_must_be_an_object'};
  const d=input.delta;if(!d||typeof d!=='object'||Array.isArray(d))return{ok:false,error:'delta_must_be_an_object'};
  for(const a of ['x','y','z']){if(d[a]!==undefined&&(typeof d[a]!=='number'||!Number.isFinite(d[a])))return{ok:false,error:'delta_'+a+'_must_be_finite'};if(Math.abs(d[a]||0)>MAX_STEP)return{ok:false,error:'movement_step_exceeds_limit',maxStep:MAX_STEP,axis:a};}
  const p={x:state.pose.position.x+(d.x||0),y:state.pose.position.y+(d.y||0),z:state.pose.position.z+(d.z||0)};
  for(const a of ['x','y','z']){const [min,max]=BOUNDS[a];if(p[a]<min||p[a]>max)return{ok:false,error:'movement_out_of_bounds',axis:a,bounds:[min,max]};}
  const t=input.turn||{};for(const a of ['yaw','pitch','roll']){if(t[a]!==undefined&&(typeof t[a]!=='number'||!Number.isFinite(t[a])))return{ok:false,error:'turn_'+a+'_must_be_finite'};if(Math.abs(t[a]||0)>30)return{ok:false,error:'turn_exceeds_limit',axis:a,maxDegrees:30};}
  state.pose.position=p;for(const a of ['yaw','pitch','roll'])state.pose.orientation[a]=((state.pose.orientation[a]+(t[a]||0)+180)%360+360)%360-180;
  state.motion.sequence++;state.motion.lastActionAt=now();state.motion.lastAction={sequence:state.motion.sequence,delta:{x:d.x||0,y:d.y||0,z:d.z||0},turn:{yaw:t.yaw||0,pitch:t.pitch||0,roll:t.roll||0},source:String(input.source||'dashboard').slice(0,80)};
  state.updatedAt=state.motion.lastActionAt;emit('motion.simulated',state.motion.lastAction);return{ok:true,mode:'simulated',physicalActuation:false,state:getState()};
 }
 function setHardwareStatus(input){
  if(!input||typeof input!=='object')return{ok:false,error:'hardware_status_must_be_an_object'};
  const keys=['camera','microphone','actuators'],values=['not_connected','connected','degraded','error'];
  for(const k of keys)if(input[k]!==undefined&&!values.includes(input[k]))return{ok:false,error:'hardware_status_invalid',component:k};
  for(const k of keys)if(input[k]!==undefined)state.hardware[k]=input[k];state.updatedAt=now();emit('hardware.status_changed',state.hardware);return{ok:true,state:getState()};
 }
 emit('body.initialized',{mode:state.mode,physicalActuationEnabled:false});
 return{getState,getEvents,getObservations,observe,move,setHardwareStatus};
}
module.exports={createAvatarBody,MAX_STEP,BOUNDS,SENSOR_TYPES};
