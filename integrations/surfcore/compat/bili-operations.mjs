// Account-scoped comment/reply receipts. Never repost an uncertain write.
import {readLocal,transact,sha} from './local-store.mjs';
const empty = {schema:1, operations:{}, cooldownUntil:0, lastFailure:null};
const idOf = r => String(r?.rpid_str ?? r?.rpid ?? '');
const textHash = s => sha(String(s).replaceAll('\r\n','\n').trim());
// 2026-11-06（213）：@ 映射要能回查 —— 主人验收时就看这条记录有没有 at_name_to_mid。
//   只留「昵称 → 数字 mid」，别的一概不收；没有映射就不写字段（旧记录形状不变 ✓）。
const cleanMentions = m => {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const rows = Object.entries(m)
    .filter(([name, mid]) => String(name).trim() && /^[1-9]\d{0,19}$/.test(String(mid ?? '').trim()))
    .map(([name, mid]) => [String(name).trim().slice(0, 40), String(mid).trim()]);
  return rows.length ? Object.fromEntries(rows) : null;
};
export function classifyBiliFailure({code,http,error}={}) {
  if (http === 412 || [-352,-509,12015].includes(Number(code))) return 'risk';
  if ([-101,-102,-111].includes(Number(code))) return 'login';
  if (error || http >= 500 || http === 429) return 'transport';
  return 'rejected';
}
export function beginComment(file, {account,oid,type='1',root='',parent='',message,atMentions=null,now=Date.now()}={}) {
  if (!/^\d{1,22}$/.test(String(account)) || !/^\d{1,22}$/.test(String(oid)) || !['1','11','17'].includes(String(type)) || !String(message||'').trim()) throw Error('BILI_OPERATION_INVALID');
  const target = {account:String(account),oid:String(oid),type:String(type),root:String(root||''),parent:String(parent||'')};
  if ([target.root,target.parent].some(s=>s&&!/^\d{1,22}$/.test(s))) throw Error('BILI_OPERATION_INVALID');
  const contentHash = textHash(message), id = sha(JSON.stringify([target,contentHash]));
  const mentions = cleanMentions(atMentions);
  return transact(file,empty,state=>{
    if(state.schema!==1||!state.operations)throw Error('BILI_OPERATION_CORRUPT');
    if(state.cooldownUntil>now)throw Error('BILI_OPERATION_COOLDOWN：上次遇到风控或网络异常，先等待，不重复发送');
    // Keep every unresolved write. Only confirmed terminal records age out.
    for(const [key,row]of Object.entries(state.operations))if(['verified','rejected','abandoned'].includes(row.status)&&now-row.at>90*86400000)delete state.operations[key];
    const previous=state.operations[id];
    if(previous)throw Error('BILI_OPERATION_DUPLICATE：相同目标和正文已有记录（'+previous.status+'），不会再次POST');
    if(Object.keys(state.operations).length>=4000)throw Error('BILI_OPERATION_CAPACITY：请先核对旧记录');
    const lease={id,...target,contentHash,at:now,status:'sending',receipt:null,visibility:'unknown',...(mentions?{atMentions:mentions}:{})};
    state.operations[id]=lease;return structuredClone(lease);
  });
}
export function finishComment(file, lease, {code,http,rpid,error,now=Date.now()}={}) {
  return transact(file,empty,state=>{
    const row=state.operations[lease.id];if(!row||row.status!=='sending')throw Error('BILI_OPERATION_LEASE_CHANGED');
    const accepted=code===0&&http>=200&&http<300;
    row.status=accepted?'accepted':error||!Number.isFinite(code)||http>=500?'uncertain':'rejected';
    row.finishedAt=now;
    if(accepted&&/^\d{1,22}$/.test(String(rpid||'')))row.receipt=String(rpid);
    if(!accepted){
      const category=classifyBiliFailure({code,http,error});row.failure=category;
      row.code=Number.isFinite(code)?code:null;row.http=Number.isFinite(http)?http:null;
      state.lastFailure={at:now,category,code:row.code,http:row.http};
      if(category==='risk')state.cooldownUntil=Math.max(state.cooldownUntil||0,now+3600000);
      if(category==='transport')state.cooldownUntil=Math.max(state.cooldownUntil||0,now+600000);
    }
    return {id:row.id,status:row.status,receipt:row.receipt,visibility:row.visibility};
  });
}
export function observeCommentRows(file,{oid,type='1',rows=[],anonymous=true,now=Date.now()}={}) {
  if(!rows.length)return {verified:0};
  // Only exact target, receipt, author, body and nesting prove a recorded write.
  return transact(file,empty,state=>{
    let verified=0;
    for(const op of Object.values(state.operations)){
      if(op.oid!==String(oid)||op.type!==String(type)||!['sending','uncertain','accepted','verified'].includes(op.status))continue;
      const matches=rows.filter(r=>r&&String(r.member?.mid??r.mid??'')===op.account
        &&textHash(r.content?.message??'')===op.contentHash
        &&String(r.root_str??r.root??'0')===(op.root||'0')
        &&String(r.parent_str??r.parent??'0')===(op.parent||'0')
        &&/^\d{1,22}$/.test(idOf(r))
        &&(op.receipt?idOf(r)===op.receipt:Math.abs(Number(r.ctime)*1000-op.at)<=120000));
      if(matches.length!==1)continue;
      op.receipt=idOf(matches[0]);op.status='verified';op.verifiedAt=now;
      if(anonymous)op.visibility='anonymous_seen';
      verified++;
    }
    return {verified};
  });
}
export function operationSnapshot(file) {
  const state=readLocal(file,empty);if(state.schema!==1||!state.operations)throw Error('BILI_OPERATION_CORRUPT');
  const rows=Object.values(state.operations),counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
  return {counts,cooldownUntil:state.cooldownUntil,lastFailure:state.lastFailure,
    recent:rows.sort((a,b)=>b.at-a.at).slice(0,12).map(r=>({id:r.id,at:r.at,type:r.type,status:r.status,receipt:r.receipt,visibility:r.visibility,failure:r.failure,atMentions:r.atMentions??null})),
    scope:'comment/reply',repostOnUncertainty:false};
}
