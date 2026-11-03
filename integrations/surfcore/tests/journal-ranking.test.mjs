import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {appendJournal,readJournal} from '../compat/personal-journal.mjs';
import {createLegacyReader,journalFocus} from '../compat/legacy-reader.mjs';
const at='2026-11-03T00:00:00Z',base={key:'private:1001',ownerQQ:'1001',query:'约定',focus:{senderId:'2001'}};
function fixture(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'journal-rank-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
function row(text,senderId,key='group:7001',time=at){return{at:time,text:'约定'+text,senderId,sender:'同名',conversationKey:key};}
function all(d,opts){let cursor=null,result=[],pages=0;do{const r=readJournal(d,{...opts,cursor});result.push(...r.entries);cursor=r.nextCursor;assert(++pages<200);}while(cursor);return result;}
test('ranking searches older days globally before unrelated recent same-word records',t=>{
 const d=fixture(t);appendJournal(d,[row('旧的本人','2001','group:7002','2026-11-01T00:00:00Z'),row('当前私信','1001','private:1001'),...Array.from({length:16},(_,i)=>row('其他人'+i,'2002'))]);
 const r=readJournal(d,{...base,limit:2});assert.deepEqual(r.entries.map(r=>r.text),['约定旧的本人','约定当前私信']);assert(r.nextCursor);
});
test('same nickname and changed nickname use stable identity, never numeric Bili collisions',t=>{
 const d=fixture(t);appendJournal(d,[{...row('本人改名','2001'),sender:'新名字'},row('同名别人','2002'),{...row('另平台同号','2001'),platform:'bili'}]);
 assert.deepEqual(all(d,{...base,limit:1}).map(r=>r.text),['约定本人改名','约定另平台同号','约定同名别人']);
});
test('focus is frozen and all file fences exclude new and backdated appends across pages',t=>{
 const d=fixture(t);appendJournal(d,[row('一','2001','group:7001','2026-11-01T00:00:00Z'),row('二','2002'),row('三','2003')]);
 const r=readJournal(d,{...base,limit:1});assert.equal(r.entries[0].text,'约定一');
 appendJournal(d,[row('新同日','2001'),row('回填旧日','2002','group:7001','2026-11-01T01:00:00Z'),row('新日期','2001','group:7001','2026-11-04T01:00:00Z')]);
 let cursor=r.nextCursor,rest=[];while(cursor){const p=readJournal(d,{...base,focus:{senderId:'2002'},limit:1,cursor});rest.push(...p.entries);cursor=p.nextCursor;}
 assert.deepEqual(rest.map(r=>r.text),['约定三','约定二']);assert.equal(all(d,base).length,6);
});
test('ranking never broadens group/private visibility even for the focused person',t=>{
 const d=fixture(t);appendJournal(d,[row('私信','2001','private:1001'),row('别群','2001','group:7002'),row('本群','2002'),{...row('公开B站','2003',''),platform:'bili'}]);
 const r=all(d,{...base,key:'group:7001'});assert.deepEqual(r.map(r=>r.text),['约定本群','约定公开B站']);assert(r.every(r=>!r.doNotPublish));
 const privatePage=readJournal(d,{...base,query:'私信',limit:1});assert(privatePage.entries[0].doNotPublish);
 assert.throws(()=>readJournal(d,{...base,query:'私信',key:'group:7001',cursor:privatePage.nextCursor}),/分页/);
});
test('long ranked records, scan limits, and pagination retain every body exactly once',t=>{
 const d=fixture(t),text='约定'+'长'.repeat(13000);appendJournal(d,[{...row('','2001'),text,detail:'完整细节'},row('其他','2002'),row('自己','1001','private:1001')]);
 const entries=all(d,{...base,maxLines:2,limit:1}),chunks=entries.filter(r=>r.senderId==='2001');
 assert.equal(chunks.map(r=>r.text).join(''),text+'\n【原记录详情】完整细节');assert.equal(entries.filter(r=>r.senderId!=='2001').length,2);
 assert(chunks.every(r=>r.text.length<=4000));assert.deepEqual(chunks.map(r=>r.part.start),[0,4000,8000,12000]);
});
test('date browsing stays chronological and query changes cannot reuse a ranked cursor',t=>{
 const d=fixture(t);appendJournal(d,[row('本人','2001'),row('最新','2002',undefined,'2026-11-03T01:00:00Z')]);
 assert.equal(readJournal(d,{...base,day:'2026-11-03'}).entries[0].text,'约定最新');
 const r=readJournal(d,{...base,limit:1});assert.throws(()=>readJournal(d,{...base,query:'别的',cursor:r.nextCursor}),/分页/);
});
test('a partial final line stays excluded after a later writer completes recovery',t=>{
 const d=fixture(t);appendJournal(d,[row('一','2001'),row('二','2002')]);const file=path.join(d,'journal','2026-11-03.jsonl');fs.appendFileSync(file,'{"unfinished":');
 const first=readJournal(d,{...base,limit:1});appendJournal(d,[row('后来','2003')]);
 const rest=all(d,{...base});assert.equal(rest.length,3);
 let c=first.nextCursor,seen=[];while(c){const p=readJournal(d,{...base,cursor:c});seen.push(...p.entries);c=p.nextCursor;}assert.deepEqual(seen.map(r=>r.text),['约定二']);
});
test('trusted focus ignores self, stale messages and spoofed tool focus',async t=>{
 const d=fixture(t),now=Date.parse(at);assert.deepEqual(journalFocus({recentMessages:[{userId:'2001',time:now-1000},{isSelf:true,userId:'999',time:now} ]},now),{senderId:'2001'});
 assert.deepEqual(journalFocus({recentMessages:[{userId:'2001',time:now-600001}]},now),{});
 appendJournal(d,[row('本人','2001'),row('别人','2002')]);const reader=createLegacyReader({config:{ownerQQ:'1001'},journalDir:()=>d,focus:()=>({senderId:'2001'})});
 const r=await reader.read({key:base.key,kind:'memory',query:'约定',focus:{senderId:'2002'}});assert.equal(r.results[0].text,'约定本人');assert(!('entries'in r));
});
test('old v3 continuation remains valid after ranked searches are enabled',t=>{
 const d=fixture(t);appendJournal(d,[row('一','2001'),row('二','2002')]);const first=readJournal(d,{...base,focus:null,limit:1});
 assert.equal(JSON.parse(Buffer.from(first.nextCursor,'base64url')).version,3);
 assert.equal(readJournal(d,{...base,cursor:first.nextCursor}).entries[0].text,'约定一');
});
test('no current person skips the empty identity phase instead of spending the scan budget',t=>{
 const d=fixture(t);appendJournal(d,[row('别人','2001'),row('本人私信','1001','private:1001')]);
 const r=readJournal(d,{...base,focus:{},maxLines:1});assert.equal(r.entries[0].text,'约定本人私信');assert.equal(r.scanned,1);
});
