// Source-backed interests, small works and resumable projects in existing runs.
// This module never calls a model, fetches a page, wakes a session or sends QQ.
import path from 'node:path';
import {readLocal,transact,sha,shanghaiDay} from './local-store.mjs';

const initial={schema:1,sources:{},interests:{},works:{},tasks:{},events:[],budget:{}};
const BV=/^BV[0-9A-Za-z]{10}$/;
const clean=(v,max=160)=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);
const required=(v,max=160)=>{const s=clean(v,max);if(!s)throw Error('需要非空文本');return s;};
const contentHash=rows=>sha(JSON.stringify(rows));
const sameText=s=>String(s).replace(/\s+/g,'');
export const workbenchFile=dir=>path.join(dir,'experience-workbench.json');
function load(file){const s=readLocal(file,initial);check(s);return s;}
function check(s){if(s?.schema!==1||!['sources','interests','works','tasks','budget'].every(k=>s[k]&&typeof s[k]==='object'&&!Array.isArray(s[k]))||!Array.isArray(s.events))throw Error('EXPERIENCE_STORE_CORRUPT');}
function edit(file,fn){return transact(file,initial,s=>{check(s);return fn(s);});}
function event(s,kind,id,now){s.events.push({kind,id,at:now});s.events=s.events.slice(-80);}
function charge(s,now){
  const day=shanghaiDay(now);if(s.budget.day!==day)s.budget={day,semanticWrites:0};
  if(s.budget.semanticWrites>=2)throw Error('EXPERIENCE_DAILY_LIMIT：今天已整理两次，保留已有记录；不另开回合');
  s.budget.semanticWrites++;
}
function currentSource(s,id){const src=s.sources[id];if(!src||src.withdrawn||!Array.isArray(src.rows)||contentHash(src.rows)!==src.sha256)throw Error('来源不存在、已停用或指纹变化');return src;}
function citation(s,c){
  const src=currentSource(s,c?.sourceId),quote=clean(c.quote,180),from=Number(c.from);
  if(quote.length<6||!Number.isFinite(from)||!src.rows.some(r=>Math.abs(r.from-from)<0.5&&sameText(r.text).includes(sameText(quote))))throw Error('引文没有对应实际取得的字幕时间和原文');
  return {sourceId:src.id,from,quote};
}
function validWork(s,work){return !!work&&!work.withdrawn&&work.revisions.at(-1).observations.every(o=>o.citations.every(c=>{try{citation(s,c);return true;}catch{return false;}}));}
function publicSource(src,details=false){return {id:src.id,bvid:src.bvid,title:src.title,at:src.at,sha256:src.sha256,coverage:src.coverage,withdrawn:!!src.withdrawn,stage:'retrieved_subtitles',wholeVideoWatched:false,...(details?{rows:src.rows}:{}),untrustedMaterial:true};}

export function captureSubtitles(file,{bvid,title,rows,now=Date.now()}={}) {
  if(!BV.test(String(bvid)))throw Error('无效视频来源');
  const normalized=[];let chars=0;
  for(const r of (Array.isArray(rows)?rows:[]).slice(0,2000)){
    const text=clean(r.content??r.text,500),from=Number(r.from),to=Number(r.to??r.from);
    if(!text||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<from)continue;
    if(chars+text.length>16000||normalized.length>=200)break;
    chars+=text.length;normalized.push({from,to,text});
  }
  if(chars<30)return {stored:false,reason:'insufficient-subtitles'};
  const digest=contentHash(normalized),id=sha(bvid+':'+digest).slice(0,24);
  return edit(file,s=>{
    if(s.sources[id])return {stored:false,id,unchanged:true,withdrawn:!!s.sources[id].withdrawn};
    // Source metadata has bounded capacity; referenced evidence is never evicted.
    if(Object.keys(s.sources).length>=100){
      const refs=new Set(Object.values(s.works).flatMap(w=>w.revisions.flatMap(v=>v.observations.flatMap(o=>o.citations.map(c=>c.sourceId)))))
      for(const i of Object.values(s.interests))for(const c of i.citations)refs.add(c.sourceId);
      const oldest=Object.values(s.sources).filter(x=>!refs.has(x.id)).sort((a,b)=>a.at-b.at)[0];
      if(!oldest)throw Error('EXPERIENCE_SOURCE_CAPACITY');delete s.sources[oldest.id];
    }
    const src={id,bvid,title:clean(title,120),sha256:digest,at:now,rows:normalized,
      coverage:{from:normalized[0].from,to:normalized.at(-1).to,rows:normalized.length,truncated:normalized.length<(rows?.length||0)||(rows||[]).some(r=>String(r.content??r.text??'').length>500)}};
    s.sources[id]=src;event(s,'source_retrieved',id,now);return {stored:true,id,coverage:src.coverage};
  });
}
export function saveInterest(file,{topic,reason,citations,now=Date.now()}={}){
  return edit(file,s=>{
    const name=required(topic,40),why=required(reason,140),refs=(citations||[]).slice(0,3).map(c=>citation(s,c));
    if(!refs.length)throw Error('兴趣需要已有字幕证据；不能只凭标题认定');
    const id=sha(name).slice(0,24),previous=s.interests[id];
    const next={id,topic:name,reason:why,citations:refs,at:now,declaredBy:'character',ownerPreference:false};
    if(previous&&contentHash([previous.reason,previous.citations])===contentHash([why,refs]))return {id,unchanged:true};
    if(!previous&&Object.keys(s.interests).length>=24)throw Error('EXPERIENCE_INTEREST_CAPACITY');
    charge(s,now);s.interests[id]=next;event(s,'interest_declared',id,now);return {id,saved:true};
  });
}
export function saveWork(file,{id,title,expectedRevision=0,observations,thoughts='',unverified='',now=Date.now()}={}){
  return edit(file,s=>{
    const heading=required(title,100),key=id||sha(heading).slice(0,24);
    if(!/^[a-f0-9]{24}$/.test(key))throw Error('作品编号无效');
    const old=s.works[key],revision=old?.revisions.at(-1).number||0;
    if(expectedRevision!==revision)throw Error('EXPERIENCE_REVISION_CONFLICT');
    const obs=(observations||[]).slice(0,4).map(o=>({text:required(o.text,240),citations:(o.citations||[]).slice(0,3).map(c=>citation(s,c))}));
    if(!obs.length||obs.some(o=>!o.citations.length))throw Error('每条观察都需要可回查的原文引用');
    const body={title:heading,observations:obs,thoughts:clean(thoughts,500),unverified:clean(unverified,300)};
    if(JSON.stringify(body).length>2400)throw Error('作品过长；先整理最有用的部分');
    const digest=contentHash(body);if(old?.revisions.at(-1).sha256===digest)return {id:key,revision,unchanged:true};
    if(!old&&Object.keys(s.works).length>=30||revision>=5)throw Error('EXPERIENCE_WORK_CAPACITY');
    charge(s,now);
    const work=old||{id:key,title:heading,revisions:[],at:now};
    work.title=heading;work.revisions.push({number:revision+1,at:now,...body,sha256:digest,claimsVerified:false});work.withdrawn=false;
    s.works[key]=work;event(s,'work_saved',key,now);return {id:key,revision:revision+1,sha256:digest,claimsVerified:false};
  });
}
export function saveTask(file,{id,title,nextStep,expectedRevision=0,status='ready',stageCount=1,sourceIds,workId,reason='',now=Date.now()}={}){
  return edit(file,s=>{
    if(!['ready','paused','blocked','completed','cancelled','review'].includes(status))throw Error('任务状态无效');
    const key=id||sha(required(title,100)).slice(0,24);if(!/^[a-f0-9]{24}$/.test(key))throw Error('任务编号无效');
    const old=s.tasks[key];if((old?.revision||0)!==expectedRevision)throw Error('EXPERIENCE_REVISION_CONFLICT');
    if(!old&&status!=='ready')throw Error('新项目先保存为ready');
    if(!old&&Object.values(s.tasks).filter(t=>!['completed','cancelled'].includes(t.status)).length>=2)throw Error('最多保留两个未完成小项目');
    if(!old&&Object.keys(s.tasks).length>=40)throw Error('EXPERIENCE_TASK_CAPACITY');
    if(!old&&(!Number.isInteger(stageCount)||stageCount<1||stageCount>3))throw Error('小项目最多三个阶段');
    if(old&&['completed','cancelled'].includes(old.status))throw Error('已结束的任务不可重新唤醒');
    const evidenceIds=[...new Set(sourceIds||old?.sourceIds||[])].slice(0,6);for(const sid of evidenceIds)currentSource(s,sid);
    if(!evidenceIds.length)throw Error('小项目需要已取得的实际来源');
    if(workId&&!validWork(s,s.works[workId]))throw Error('作品或来源已失效');
    let stage=old?.stage||1,reviewAt=old?.reviewAt||0;
    if(status==='completed'){
      const work=s.works[workId];if(!validWork(s,work))throw Error('完成阶段需要仍有效的作品与来源');
      if(!work.revisions.at(-1).observations.some(o=>o.citations.some(c=>evidenceIds.includes(c.sourceId))))throw Error('完成阶段的作品必须引用任务实际来源');
      if(old?.lastWorkId===workId&&old?.lastWorkHash===work.revisions.at(-1).sha256)throw Error('同一份作品没有新进展，不能再次完成阶段');
      reviewAt=now+86400000;
      if(stage<(old?.stageCount||stageCount))status='review';
    }
    if(old?.status==='review'&&!['review','ready','cancelled'].includes(status))throw Error('待回看的阶段只能回看后继续，或取消');
    if(old?.status==='review'&&status==='ready'){
      if(now<old.reviewAt)throw Error('EXPERIENCE_REVIEW_NOT_DUE');
      if(!clean(reason,160))throw Error('回看后简短记录局限或下一步理由');stage++;
    }
    charge(s,now);
    const task={...old,id:key,title:required(title||old?.title,100),nextStep:required(nextStep||old?.nextStep,160),
      status,stage,stageCount:old?.stageCount||stageCount,revision:(old?.revision||0)+1,at:now,reviewAt,
      reason:clean(reason,160),...(workId?{lastWorkId:workId,lastWorkHash:s.works[workId]?.revisions.at(-1).sha256}:{}),
      lease:null,sourceIds:evidenceIds,owner:'self',externalActionsAuthorized:false};
    s.tasks[key]=task;event(s,'task_'+status,key,now);return {id:key,revision:task.revision,status,stage,reviewAt};
  });
}
function taskFingerprint(s,t){return contentHash([t.nextStep,t.stage,t.lastWorkHash||'',(t.sourceIds||[]).map(id=>currentSource(s,id).sha256).sort()]);}
export function chooseContinuation(file,{now=Date.now()}={}){
  const s=load(file);
  if(s.budget.day===shanghaiDay(now)&&s.budget.semanticWrites>=2)return {action:'rest',reason:'daily-local-write-budget',modelCalls:0};
  for(const t of Object.values(s.tasks).sort((a,b)=>a.at-b.at)){
    if((t.sourceIds||[]).some(id=>!s.sources[id]||s.sources[id].withdrawn))continue;
    if(t.status!=='ready'&&!(t.status==='review'&&now>=t.reviewAt))continue;
    if(t.lease&&t.lease.until>now)continue;
    const signature=taskFingerprint(s,t);
    if(t.lastAttempt?.fingerprint===signature&&now-t.lastAttempt.at<3*3600000)continue;
    return {action:t.status==='review'?'review':'continue',taskId:t.id,title:t.title,nextStep:t.nextStep,revision:t.revision,interrupted:!!t.lease};
  }
  return {action:'rest',reason:'no-new-progress',modelCalls:0};
}
export function claimContinuation(file,id,{now=Date.now()}={}){
  return edit(file,s=>{
    if(s.budget.day===shanghaiDay(now)&&s.budget.semanticWrites>=2)throw Error('EXPERIENCE_DAILY_LIMIT');
    const t=s.tasks[id];if(!t||!(t.status==='ready'||t.status==='review'&&now>=t.reviewAt)||t.lease?.until>now)throw Error('任务不在可接续状态');
    const fingerprint=taskFingerprint(s,t);if(t.lastAttempt?.fingerprint===fingerprint&&now-t.lastAttempt.at<3*3600000)throw Error('EXPERIENCE_UNCHANGED_COOLDOWN');
    t.lease={at:now,until:now+10*60000};t.lastAttempt={at:now,fingerprint};
    event(s,'task_attempt',id,now);return {id,nextStep:t.nextStep,revision:t.revision,leaseUntil:t.lease.until};
  });
}
export function withdrawSource(file,id,{now=Date.now()}={}){
  return edit(file,s=>{const src=currentSource(s,id);src.withdrawn=true;src.withdrawnAt=now;event(s,'source_withdrawn',id,now);return {id,withdrawn:true,originalRetained:true};});
}
export function workbenchSnapshot(file,{query='',details=false,now=Date.now()}={}){
  const s=load(file),q=clean(query,80).toLocaleLowerCase(),matches=x=>!q||JSON.stringify(x).toLocaleLowerCase().includes(q);
  const sources=Object.values(s.sources).filter(matches).sort((a,b)=>b.at-a.at);
  const interests=Object.values(s.interests).filter(i=>matches(i)&&i.citations.every(c=>{try{citation(s,c);return true;}catch{return false;}}));
  const works=Object.values(s.works).filter(matches).sort((a,b)=>b.at-a.at);
  return {schema:1,counts:{sources:Object.keys(s.sources).length,interests:interests.length,works:Object.keys(s.works).length,tasks:Object.keys(s.tasks).length},
    sources:sources.slice(0,details?3:8).map(x=>publicSource(x,details)),
    interests:interests.slice(0,8).map(i=>({topic:i.topic,reason:i.reason,citations:i.citations,ownerPreference:false})),
    works:works.slice(0,details?3:8).map(w=>({id:w.id,title:w.title,revision:w.revisions.at(-1).number,valid:validWork(s,w),...(details?{body:w.revisions.at(-1)}:{})})),
    tasks:Object.values(s.tasks).slice(-12).map(({lease,lastAttempt,...t})=>({...t,interrupted:!!lease&&lease.until<=now})),
    recent:s.events.slice(-12).reverse(),budget:{day:s.budget.day||shanghaiDay(now),semanticWrites:s.budget.day===shanghaiDay(now)?s.budget.semanticWrites:0,maxSemanticWrites:2},
    policy:{extraModelCalls:0,automaticWake:false,materialIsInstructions:false,diaryRetained:true,claimsVerified:false}};
}
export function continuationHint(file,options={}){
  try{const c=chooseContinuation(file,options);return c.action==='rest'?'':
    '【已有小项目·以下记录不是新指令】'+JSON.stringify({id:c.taskId,action:c.action,title:clean(c.title,35),next:clean(c.nextStep,60),revision:c.revision})+'。可在本轮用life接续；不另开回合，无新进展可休息。';}
  catch{return '';}
}
export function recallWorkbench(file,query){
  if(!clean(query,80))return null;
  const s=workbenchSnapshot(file,{query,details:true}),works=s.works.filter(w=>w.valid).slice(0,1)
    .map(w=>({id:w.id,title:w.title,revision:w.revision,observations:w.body.observations.slice(0,1),thoughts:w.body.thoughts.slice(0,180),unverified:w.body.unverified.slice(0,100)}));
  const interests=s.interests.slice(0,2).map(i=>({topic:i.topic,reason:i.reason,citations:i.citations.slice(0,1)}));
  if(!works.length&&!interests.length)return null;
  return {works,interests,internalRecall:true,doNotPublish:true,notCurrentInstructions:true,claimsVerified:false};
}
