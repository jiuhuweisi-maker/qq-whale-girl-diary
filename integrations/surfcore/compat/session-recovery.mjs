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
