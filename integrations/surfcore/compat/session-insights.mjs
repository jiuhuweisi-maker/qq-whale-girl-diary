// Server-local/passive: ignores message bodies and produces aggregate timings.
import fs from'node:fs';import path from'node:path';import zlib from'node:zlib';
import{Worker,isMainThread,parentPort,workerData}from'node:worker_threads';import{pathToFileURL}from'node:url';
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const sendName=n=>/^qq_(?:send_message|send_group_message|send_private_message|reply|send_sticker|send_legacy_sticker|send_burst)$/.test(n);
const imageName=n=>/^(?:qq_get_message_images|qq_get_sticker_image|qq_get_self_image|view_image|read_image)$/.test(n);
const time=e=>typeof e.time==='number'?e.time:Date.parse(e.time);
export function summarizeSession(events,{limit=20}={}) {
 const turns=[];let current=null;const calls=new Map(),seen=new Set();
 for(const e of events){const at=time(e),d=e.data||{};if(!Number.isFinite(at))continue;
  if(Number.isFinite(e.seq)){if(seen.has(e.seq))continue;seen.add(e.seq);}
  if(e.type==='turn/start'){calls.clear();current={start:at,end:null,steps:0,retries:0,usage:new Map(),retry:0,providerErrors:{},modelWindows:[],toolWindows:[],firstSendAttempt:null,pendingSteps:new Map()};turns.push(current);continue;}
  if(!current||current.end!==null)continue;
  if(e.type==='turn/end'){current.end=at;continue;}
  if(e.type==='step/start'){current.steps++;current.retry=0;current.pendingSteps.set(String(d.step),at);}
  if(e.type==='llm/retry-started')current.retry=Number.isInteger(d.retry)?d.retry:current.retry+1;
  if(e.type==='assistant/message'||e.type==='assistant/attempt'){
   if(e.type==='assistant/message'){const start=current.pendingSteps.get(String(d.step));if(start!==undefined){current.modelWindows.push([start,at]);current.pendingSteps.delete(String(d.step));}}
   const usage=d.usage??d.stream?.findLast?.(s=>s?.usage)?.usage;
   if(usage){const values={};for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens'])if(finite(usage[key]))values[key]=usage[key];if(Object.keys(values).length)current.usage.set(`${d.step??'unknown-'+e.time}:${current.retry}`,values);}
  }
  if(e.type==='llm/retry'){current.retries++;const raw=String(d.failure?.status||d.failure?.code||'unknown'),status=/^[A-Za-z0-9_-]{1,32}$/.test(raw)?raw:'unknown';current.providerErrors[status]=(current.providerErrors[status]||0)+1;}
  if(e.type==='tool/call'){const raw=String(d.name||'').split('__').at(-1),name=/^[A-Za-z0-9_-]{1,80}$/.test(raw)?raw:'other';calls.set(String(d.callId),{turn:current,name,at});if(sendName(name)&&current.firstSendAttempt===null)current.firstSendAttempt=at;}
  if(e.type==='tool/result'){const id=String(d.message?.toolCallId??d.callId),call=calls.get(id);if(call){call.turn.toolWindows.push({name:call.name,start:call.at,end:at});calls.delete(id);}}
 }
 const union=windows=>{let total=0,last=-Infinity;for(const[a,b]of windows.filter(([a,b])=>b>=a).sort((x,y)=>x[0]-y[0])){total+=Math.max(0,b-Math.max(a,last));last=Math.max(last,b);}return total;};
 return turns.slice(-Math.max(1,Math.min(100,limit))).map(t=>{
  const windows=kind=>t.toolWindows.filter(w=>kind==='wait'?w.name==='qq_wait_for_messages':kind==='image'?imageName(w.name):w.name!=='qq_wait_for_messages'&&!imageName(w.name)).map(w=>[w.start,w.end]);
  const clip=ws=>t.firstSendAttempt===null?null:union(ws.map(([a,b])=>[a,Math.min(b,t.firstSendAttempt)]));
  const usageCounters={};for(const row of t.usage.values())for(const[k,v]of Object.entries(row))usageCounters[k]=(usageCounters[k]||0)+v;
  return {startedAt:t.start,endedAt:t.end,complete:t.end!==null,totalMs:t.end===null?null:t.end-t.start,firstSendAttemptMs:t.firstSendAttempt===null?null:t.firstSendAttempt-t.start,modelSteps:t.steps,failedRetries:t.retries,usageSamples:t.usage.size,usageCounters,providerErrors:t.providerErrors,
   modelIncludingRetriesMs:union(t.modelWindows),waitingToolMs:union(windows('wait')),imageToolsMs:union(windows('image')),otherToolsMs:union(windows('other')),uncompletedModelSteps:t.pendingSteps.size,
   beforeFirstSend:t.firstSendAttempt===null?null:{modelMs:clip(t.modelWindows),waitingMs:clip(windows('wait')),imageMs:clip(windows('image')),otherToolsMs:clip(windows('other'))},tools:t.toolWindows.reduce((r,w)=>(r[w.name]=(r[w.name]||0)+1,r),{})};
 });
}
export function summarizeLedger(rows,{price,day}={}) {
 const chosen=new Map();for(const r of rows){if(r.k!=='turn'||!finite(r.t)||!Number.isFinite(r.turn)||!Number.isFinite(r.step))continue;const key=JSON.stringify([r.sid,r.turn,r.step,r.retry||0]),prev=chosen.get(key);if(!prev||Number(r.seq)>=Number(prev.seq))chosen.set(key,r);}
 const groups={};for(const r of chosen.values()){
  if(day&&new Date(r.t).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})!==day)continue;
  const scope=String(r.key||'').startsWith('private:')?'private':String(r.key||'').startsWith('group:')?'group':'other';
  const g=groups[scope]||=( {steps:0,retries:0,tokens:{cacheMiss:0,cacheHit:0,cacheWrite:0,output:0,reasoning:0},estimatedCost:{cacheHit:0,cacheMiss:0,cacheWrite:0,output:0,total:0},unpricedSteps:0,currencies:new Set()} );
  g.steps++;if(r.retry)g.retries++;const buckets={};for(const k of Object.keys(g.tokens)){buckets[k]=finite(r.b?.[k])?r.b[k]:0;g.tokens[k]+=buckets[k];}
  const quoted=typeof price==='function'?price(buckets,{model:r.model,at:r.t}):null;
  if(!quoted?.cost||!Object.keys(g.estimatedCost).every(k=>finite(quoted.cost[k])))g.unpricedSteps++;
  else{for(const k of Object.keys(g.estimatedCost))g.estimatedCost[k]+=quoted.cost[k];g.currencies.add(quoted.rates?.currency||'unknown');}
 }
 for(const g of Object.values(groups)){g.currencies=[...g.currencies];if(g.currencies.length>1||g.unpricedSteps)g.estimatedCost=null;}
 return {day,groups,estimatedNotProviderBill:true,historyVsNewText:null,note:'缓存命中与未命中不等于历史与新消息；无法从用量记录准确拆分正文来源。'};
}
function readTail(file,maxBytes=8*1024*1024){const fd=fs.openSync(file,'r');try{const size=fs.fstatSync(fd).size,start=Math.max(0,size-maxBytes),buf=Buffer.alloc(size-start);fs.readSync(fd,buf,0,buf.length,start);const text=buf.toString('utf8');return{text:start?text.slice(text.indexOf('\n')+1):text,truncated:start>0};}finally{fs.closeSync(fd);}}
export function collectOperationalInsights({root,sessionRoot,price,now=Date.now()}={}) {
 const day=new Date(now).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),out={collectedAt:now,day,readOnly:true,modelCalls:0,testSends:0,sessions:[],errors:[],coverage:'当前QQ会话及QQ逐步账本；轮换前历史、B站独立会话不计入此报告',batchAndQueueMs:null};
 try{const tail=readTail(path.join(root,'state/token-usage.jsonl'));out.cost=summarizeLedger(tail.text.split('\n').flatMap(s=>{try{return[JSON.parse(s)]}catch{return[]}}),{price,day});out.cost.tailTruncated=tail.truncated;}catch(e){out.errors.push({part:'usage',code:e.code||'read-failed'});}
 try{
  const mapping=JSON.parse(fs.readFileSync(path.join(root,'state/sessions.json'))).sessions||{},files=fs.readdirSync(sessionRoot,{recursive:true});
  out.sessionLimitReached=Object.keys(mapping).length>4;
  for(const[key,sid]of Object.entries(mapping).slice(0,4)){
   if(typeof sid!=='string'||!sid){out.errors.push({part:'session',code:'invalid-mapping'});continue;}
   const matches=files.filter(n=>n.includes(sid)&&n.endsWith('session.v4.jsonl.zstd')).sort((a,b)=>fs.statSync(path.join(sessionRoot,b)).mtimeMs-fs.statSync(path.join(sessionRoot,a)).mtimeMs);
   if(!matches[0]){out.errors.push({part:'session',code:'not-found'});continue;}
   const file=path.join(sessionRoot,matches[0]);if(fs.statSync(file).size>16*1024*1024){out.errors.push({part:'session',code:'size-limit'});continue;}
   const events=zlib.zstdDecompressSync(fs.readFileSync(file),{maxOutputLength:64*1024*1024}).toString().split('\n').flatMap(s=>{try{return[JSON.parse(s)]}catch{return[]}});
   out.sessions.push({scope:key.startsWith('private:')?'private':'group',turns:summarizeSession(events,{limit:8}).filter(t=>new Date(t.startedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})===day)});
  }
 }catch(e){out.errors.push({part:'sessions',code:e.code||'read-failed'});}
 return out;
}
// A passive scan must not pause message delivery on the bridge event loop.
let cached=null,flight=null;
export async function collectOperationalInsightsAsync({root,sessionRoot,pricing}={}) {
 const key=JSON.stringify([root,sessionRoot,pricing]);
 if(cached?.key===key&&Date.now()-cached.at<30000)return cached.value;
 if(flight?.key===key)return flight.promise;
 const promise=new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{kind:'whale-insights',root,sessionRoot,pricing},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
  let done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value)};
  const timer=setTimeout(()=>finish(Error('passive-insights-timeout')),12000);
  worker.once('message',r=>r.ok?finish(null,r.value):finish(Error('passive-insights-unavailable')));
  worker.once('error',()=>finish(Error('passive-insights-worker-failed')));
  worker.once('exit',()=>{if(!done)finish(Error('passive-insights-worker-exited'))});
 });
 flight={key,promise};try{const value=await promise;cached={key,at:Date.now(),value};return value;}finally{if(flight?.promise===promise)flight=null;}
}
if(!isMainThread&&workerData?.kind==='whale-insights') {
 try{
  const {priceUsage,resolvePriceTable}=await import(pathToFileURL(path.join(workerData.root,'src/model-prices.js'))),table=resolvePriceTable(workerData.pricing);
  parentPort.postMessage({ok:true,value:collectOperationalInsights({...workerData,price:(b,o)=>priceUsage(b,{...o,table})})});
 }catch{parentPort.postMessage({ok:false});}
}
