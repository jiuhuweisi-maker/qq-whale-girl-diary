import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {captureSubtitles,saveInterest,saveWork,saveTask,claimContinuation,chooseContinuation,withdrawSource,workbenchSnapshot,continuationHint,recallWorkbench} from '../compat/experience-workbench.mjs';
import {collectWorkbench,WORKBENCH_HTML} from '../compat/workbench-panel.mjs';
import {transact,readLocal} from '../compat/local-store.mjs';
import {createLegacyReader} from '../compat/legacy-reader.mjs';
const at=Date.parse('2026-11-06T02:00:00Z'),day=86400000;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'experience-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'experience.json');return {dir,file};}
function source(file,bvid='BVaaaaaaaaaa',text='实际取得的字幕原文，需要结合前后语境理解，不能仅凭标题就假定自己看懂了。'){return captureSubtitles(file,{bvid,title:'来源标题',rows:[{from:3,to:8,content:text}],now:at});}
function ref(id){return {sourceId:id,from:3,quote:'实际取得的字幕原文'};}
function work(file,id,now=at,extra={}){return saveWork(file,{title:'关于语境的小笔记',observations:[{text:'这是一条待核实观察',citations:[ref(id)]}],thoughts:'自己的理解',unverified:'尚未验证作者的结论',now,...extra});}

test('sources are bounded retrieved material, unchanged retrieval is not new experience',t=>{
 const {file}=fixture(t),a=source(file);assert(a.stored);assert(source(file).unchanged);
 const s=workbenchSnapshot(file,{details:true,now:at});assert.equal(s.counts.sources,1);assert.equal(s.sources[0].stage,'retrieved_subtitles');assert.equal(s.sources[0].wholeVideoWatched,false);assert.equal(s.recent.length,1);
 const long=captureSubtitles(file,{bvid:'BVbbbbbbbbbb',rows:Array.from({length:300},(_,i)=>({from:i,to:i+1,content:'词'.repeat(500)})),now:at});assert(long.coverage.truncated);assert(long.coverage.rows<=200);
});
test('interest requires real exact quotes and remains distinct from owner preference',t=>{
 const {file}=fixture(t),a=source(file);assert.throws(()=>saveInterest(file,{topic:'语境',reason:'想继续了解',citations:[],now:at}));
 assert.throws(()=>saveInterest(file,{topic:'语境',reason:'想继续了解',citations:[{...ref(a.id),quote:'从未出现的内容'}],now:at}));
 saveInterest(file,{topic:'语境',reason:'想继续了解',citations:[ref(a.id)],now:at});const s=workbenchSnapshot(file,{now:at});assert.equal(s.interests[0].ownerPreference,false);assert.equal(s.budget.semanticWrites,1);
 assert(saveInterest(file,{topic:'语境',reason:'想继续了解',citations:[ref(a.id)],now:at}).unchanged);assert.equal(workbenchSnapshot(file,{now:at}).budget.semanticWrites,1);
});
test('immutable work versions reject stale edits and retain doubts separately',t=>{
 const {file}=fixture(t),a=source(file),w=work(file,a.id);assert.equal(w.revision,1);assert.equal(w.claimsVerified,false);
 assert.throws(()=>work(file,a.id,at,{id:w.id,expectedRevision:0}),/REVISION_CONFLICT/);
 assert(work(file,a.id,at,{id:w.id,expectedRevision:1}).unchanged);
 const v=work(file,a.id,at,{id:w.id,expectedRevision:1,thoughts:'修改后的理解'});assert.equal(v.revision,2);
 assert.equal(readLocal(file).works[w.id].revisions.length,2);assert.equal(workbenchSnapshot(file,{details:true}).works[0].body.unverified,'尚未验证作者的结论');
});
test('two semantic saves per Shanghai day, failure and unchanged do not consume slots',t=>{
 const {file}=fixture(t),a=source(file);work(file,a.id);
 saveInterest(file,{topic:'语境',reason:'想继续了解',citations:[ref(a.id)],now:at});
 assert.throws(()=>saveTask(file,{title:'下一步',nextStep:'核对原文',sourceIds:[a.id],now:at}),/DAILY_LIMIT/);
 const midnight=Date.parse('2026-11-06T15:59:59Z');
 assert.equal(workbenchSnapshot(file,{now:midnight}).budget.semanticWrites,2);
 saveTask(file,{title:'下一步',nextStep:'核对原文',sourceIds:[a.id],now:midnight+2000});assert.equal(workbenchSnapshot(file,{now:midnight+2000}).budget.semanticWrites,1);
});
test('interrupted tasks resume only in existing runs and unchanged attempts cool down',t=>{
 const {file}=fixture(t),a=source(file),g=saveTask(file,{title:'语境问题',nextStep:'核对原文',sourceIds:[a.id],now:at});
 assert.equal(chooseContinuation(file,{now:at}).taskId,g.id);claimContinuation(file,g.id,{now:at});
 assert.equal(chooseContinuation(file,{now:at+600001}).action,'rest');
 source(file,'BVbbbbbbbbbb','与这个任务无关的另一条字幕原文，不应让重试冷却失效。');
 assert.equal(chooseContinuation(file,{now:at+600002}).action,'rest');
 const next=chooseContinuation(file,{now:at+3*3600000+1});assert(next.interrupted);assert.equal(next.taskId,g.id);
 assert(continuationHint(file,{now:at+3*3600000+1}).length<300);
 assert.equal(workbenchSnapshot(file).policy.extraModelCalls,0);
});
test('project stages require valid new work and a real next-day review',t=>{
 const {file}=fixture(t),a=source(file),w=work(file,a.id),g=saveTask(file,{title:'小项目',nextStep:'比较资料',sourceIds:[a.id],stageCount:2,now:at});
 const done=saveTask(file,{id:g.id,expectedRevision:1,status:'completed',workId:w.id,now:at+day});assert.equal(done.status,'review');
 assert.throws(()=>saveTask(file,{id:g.id,expectedRevision:2,status:'ready',reason:'核对局限',now:at+day+1}),/REVIEW_NOT_DUE/);
 assert.equal(chooseContinuation(file,{now:at+2*day}).action,'review');
 const next=saveTask(file,{id:g.id,expectedRevision:2,status:'ready',reason:'先核对作者观点，再比较另一来源',now:at+2*day});assert.equal(next.stage,2);
 assert.throws(()=>saveTask(file,{id:g.id,expectedRevision:3,status:'completed',workId:w.id,now:at+3*day}),/没有新进展/);
});
test('withdrawn source invalidates related interest, work, project and prompt recall but preserves originals',t=>{
 const {file}=fixture(t),a=source(file),w=work(file,a.id);saveInterest(file,{topic:'语境',reason:'想继续了解',citations:[ref(a.id)],now:at});
 saveTask(file,{title:'小项目',nextStep:'比较资料',sourceIds:[a.id],now:at+day});assert(recallWorkbench(file,'语境'));
 withdrawSource(file,a.id,{now:at+day});const s=workbenchSnapshot(file,{now:at+day});assert.equal(s.interests.length,0);assert.equal(s.works[0].valid,false);assert.equal(chooseContinuation(file,{now:at+day}).action,'rest');assert.equal(recallWorkbench(file,'语境'),null);
 assert.equal(readLocal(file).works[w.id].revisions.length,1);assert.equal(readLocal(file).sources[a.id].rows.length,1);assert(source(file).withdrawn);
});
test('workbench and existing QQ topic recall make no network or model calls',async t=>{
 const {dir,file}=fixture(t),a=source(file);work(file,a.id);
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('no network');};t.after(()=>{globalThis.fetch=old;});
 const reader=createLegacyReader({config:{ownerQQ:'123',allow:{groups:['456']},whaleCompat:{}},workbench:()=>file});
 const result=await reader.read({key:'private:123',kind:'memory',query:'语境'});assert(result.experience);assert(result.experience.doNotPublish);assert(JSON.stringify(result.experience).length<2000);
 await assert.rejects(reader.read({key:'private:999',kind:'memory',query:'语境'}),/未授权/);
 const s=collectWorkbench({biliDir:dir,accountDir:dir,languageDir:path.join(dir,'language'),health:{healthy:true},now:at});assert.equal(s.modelCalls,0);assert.equal(s.errors.length,0);
});
test('local corruption fails closed; a failed edit never overwrites good state',t=>{
 const {file}=fixture(t);transact(file,{v:1},()=>{});assert.throws(()=>transact(file,{},s=>{s.v=2;throw Error('stop');}));assert.equal(readLocal(file).v,1);
 fs.writeFileSync(file,'broken');assert.throws(()=>captureSubtitles(file,{bvid:'BVaaaaaaaaaa',rows:[{from:1,to:2,content:'字幕内容足够长'.repeat(8)}]}));assert.equal(fs.readFileSync(file,'utf8'),'broken');assert.equal(continuationHint(file),'');
 assert(!WORKBENCH_HTML.includes('innerHTML'));assert(!WORKBENCH_HTML.includes('setInterval'));assert(WORKBENCH_HTML.includes('textContent'));
});
test('restart recovers only a positively dead local lock and protects live locks',t=>{
 const {file}=fixture(t);fs.writeFileSync(file+'.lock',JSON.stringify({pid:process.pid,at:Date.now()-60000}));
 assert.throws(()=>transact(file,{v:0},s=>s.v++),/BUSY/);assert(fs.existsSync(file+'.lock'));
 fs.writeFileSync(file+'.lock',JSON.stringify({pid:2**31-1,at:Date.now()-60000}));transact(file,{v:0},s=>s.v++);assert.equal(readLocal(file).v,1);assert(!fs.existsSync(file+'.lock'));
});
