import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJson,readJson} from './language-style.mjs';
const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
export function legacyOwnerMentionUsed(log,now=Date.now()){
 return (log||[]).some(r=>r.share===true&&Number.isFinite(Date.parse(r.at))&&day(Date.parse(r.at))===day(now));
}
export function reserveOwnerMention(file,{now=Date.now(),legacyUsed=false}={}){
 fs.mkdirSync(path.dirname(file),{recursive:true});let lock;
 try{lock=fs.openSync(file+'.lock','wx');}catch(e){if(e.code==='EEXIST')throw Error('OWNER_MENTION_LIMIT：@主人检查正在进行，本次不发');throw e;}
 try{const prior=readJson(file,null),today=day(now);
  // 2026-11-06 主人钦定：取消「每天只能@一次主人」。
  // 只留一道 5 分钟防连发（同一次评论被重试时不要连点两次），不再按天封口。
  const lastAt=Number(prior?.at)||0;
  if(lastAt&&now-lastAt<5*60*1000)throw Error('OWNER_MENTION_COOLDOWN：刚试过@主人，5 分钟后再来，避免连点');
  const lease={day:today,at:now,id:crypto.randomUUID(),status:'reserved'};atomicJson(file,lease);return lease;
 }finally{fs.closeSync(lock);fs.unlinkSync(file+'.lock');}
}
export function finishOwnerMention(file,lease,status){
 const current=readJson(file,null);if(current?.id!==lease?.id)throw Error('Owner mention lease changed');
 atomicJson(file,{...current,status:['sent','failed','uncertain'].includes(status)?status:'uncertain'});
}
