// Server-local/passive: ignores message bodies and produces aggregate timings.
const time=e=>typeof e.time==='number'?e.time:Date.parse(e.time);
export function summarizeSession(events,{limit=20}={}) {
 const turns=[];let current=null;const calls=new Map();
 for(const e of events){const at=time(e),d=e.data||{};if(!Number.isFinite(at))continue;
  if(e.type==='turn/start'){current={start:at,end:null,steps:0,retries:0,usageSamples:0,usageCounters:{},providerErrors:{},modelWindows:[],toolWindows:[],firstSendAttempt:null,pendingSteps:new Map()};turns.push(current);continue;}
  if(!current||current.end!==null)continue;
  if(e.type==='turn/end'){current.end=at;continue;}
  if(e.type==='step/start'){current.steps++;current.pendingSteps.set(String(d.step),at);}
  if(e.type==='assistant/message'){const start=current.pendingSteps.get(String(d.step));if(start!==undefined){current.modelWindows.push([start,at]);current.pendingSteps.delete(String(d.step));}if(d.usage){current.usageSamples++;for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens'])if(Number.isFinite(d.usage[key]))current.usageCounters[key]=(current.usageCounters[key]||0)+d.usage[key];}}
  if(e.type==='llm/retry'){current.retries++;const status=String(d.failure?.status||d.failure?.code||'unknown');current.providerErrors[status]=(current.providerErrors[status]||0)+1;}
  if(e.type==='tool/call'){const name=String(d.name||'').split('__').at(-1);calls.set(String(d.callId),{turn:current,name,at});if(/^qq_(send_message|reply|send_sticker|send_legacy_sticker)$/.test(name)&&current.firstSendAttempt===null)current.firstSendAttempt=at;}
  if(e.type==='tool/result'){const id=String(d.message?.toolCallId??d.callId),call=calls.get(id);if(call){call.turn.toolWindows.push({name:call.name,start:call.at,end:at});calls.delete(id);}}
 }
 const union=windows=>{let total=0,last=-Infinity;for(const[a,b]of windows.filter(([a,b])=>b>=a).sort((x,y)=>x[0]-y[0])){total+=Math.max(0,b-Math.max(a,last));last=Math.max(last,b);}return total;};
 return turns.slice(-Math.max(1,Math.min(100,limit))).map(t=>({startedAt:t.start,endedAt:t.end,complete:t.end!==null,totalMs:t.end===null?null:t.end-t.start,firstSendAttemptMs:t.firstSendAttempt===null?null:t.firstSendAttempt-t.start,modelSteps:t.steps,failedRetries:t.retries,usageSamples:t.usageSamples,usageCounters:t.usageCounters,providerErrors:t.providerErrors,modelIncludingRetriesMs:union(t.modelWindows),waitingToolMs:union(t.toolWindows.filter(w=>w.name==='qq_wait_for_messages').map(w=>[w.start,w.end])),otherToolsMs:union(t.toolWindows.filter(w=>w.name!=='qq_wait_for_messages').map(w=>[w.start,w.end])),tools:t.toolWindows.reduce((r,w)=>(r[w.name]=(r[w.name]||0)+1,r),{})}));
}
