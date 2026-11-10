// Rotate only repeatedly invalid conversation state, never log in QQ or replay a turn.
export function recordSessionResult(ledger,key,sessionId,reason,now=Date.now()) {
  if(!ledger.healthy) return false;
  let rotate=false;
  ledger.change(d=>{
    const rows=d.sessionRecovery||={},old=rows[key]||{},same=old.sessionId===sessionId;
    const bad=reason?.kind==='error'&&reason.error?.status===400&&reason.error?.code==='INVALID_REQUEST';
    const count=bad?(same?Number(old.count||0)+1:1):0;
    rotate=bad&&count>=2&&now-Number(old.rotatedAt||0)>3600000;
    rows[key]={sessionId,count,rotatedAt:rotate?now:Number(old.rotatedAt||0),at:now};
  });
  return rotate;
}

// Retry generation, never an outbound action. Reservation survives process restarts.
export function reserveGenerationRetry(ledger,{key,reason,messages=[],lastReplyAt=0,pendingSend=false,now=Date.now()}) {
  if(!ledger.healthy||reason?.kind!=='error'||reason.error?.code!=='MALFORMED_RESPONSE'||pendingSend)return false;
  const fresh=messages.filter(m=>!m.isSelf&&m.time>lastReplyAt&&m.time<=now+5000&&now-m.time<600000);
  const latest=fresh.at(-1);if(!latest?.messageId)return false;
  const effects=Object.values(ledger.data.outbox||{}).some(r=>r.key===key&&r.at>=latest.time&&['sent','sending','uncertain'].includes(r.status));
  const mutations=Object.values(ledger.data.calls||{}).some(r=>r.key===key&&now-r.at<600000&&r.name==='qq_fundpilot'&&['order','halt','watch','unwatch'].includes(r.args?.action));
  const old=ledger.data.generationRetry?.[key];
  if(effects||mutations||old?.messageId===String(latest.messageId)||now-Number(old?.at||0)<60000)return false;
  return ledger.change(d=>{(d.generationRetry||={})[key]={messageId:String(latest.messageId),at:now};});
}
