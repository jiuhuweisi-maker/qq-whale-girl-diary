// Count conversational replies, not a whole long-lived model turn. Only actual
// fresh messages shown to the model open a new allowance. Active group replies
// need not repeat @ on every sentence; other people's conversations stay excluded.
export function refreshReplyAllowance(state,messages,{key,ownerQQ,now=Date.now(),direct=()=>false}={}) {
 const fresh=messages.filter(m=>m&&!m.isSelf&&!m.history&&Number.isSafeInteger(m.seq)&&m.seq>Number(state.tokenInputThrough207||0)&&Number(m.time)<=now+5000&&now-Number(m.time)<600000);
 if(!fresh.length)return false;
 // Advance even for background speech so rereading it later cannot renew credit.
 state.tokenInputThrough207=Math.max(...fresh.map(m=>m.seq));
 const addressed=fresh.some(m=>key===`private:${ownerQQ}`?String(m.userId)===String(ownerQQ):String(key).startsWith('group:')&&!m.fish&&(direct(m)||
  (!(m.mentions||[]).length&&!m.quoteTargetIsOther&&Number(state.lastAiReplyAt)>0&&Number(m.time)>=Number(state.lastAiReplyAt)&&Number(m.time)-Number(state.lastAiReplyAt)<300000)));
 if(!addressed)return false;
 state.tokenTurnSent=0;return true;
}
export function pendingReplyCandidate({key,ownerQQ,messages=[],lastReplyAt=0,now=Date.now(),outbox={},direct=()=>false}={}) {
 const fresh=messages.filter(m=>m&&!m.isSelf&&!m.history&&m.messageId&&Number(m.time)>lastReplyAt&&Number(m.time)<=now+5000&&now-Number(m.time)<600000&&
  (key===`private:${ownerQQ}`?String(m.userId)===String(ownerQQ):String(key).startsWith('group:')&&direct(m))).sort((a,b)=>Number(b.time)-Number(a.time));
 const last=fresh[0];if(!last)return null;
 // Known or uncertain side effects never become replay requests after rotation.
 if(Object.values(outbox).some(r=>r.key===key&&Number(r.at)>=Number(last.time)&&['sent','sending','uncertain'].includes(r.status)))return null;
 return last;
}
