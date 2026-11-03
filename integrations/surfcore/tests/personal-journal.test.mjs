import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {appendJournal,readJournal,syncBiliDiaries}from'../compat/personal-journal.mjs';
import {spawn}from'node:child_process';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'journal186-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const at='2026-11-03T00:00:00Z';
test('QQ and Bili read one append-only diary with stable attribution and no duplicate import',t=>{const d=fixture(t),rows=[{at,platform:'qq',text:'柱间就是静',conversationKey:'group:7001',sender:'主人'},{at,platform:'bili',text:'看到一个基金费率视频'}];assert.equal(appendJournal(d,rows).added,2);assert.equal(appendJournal(d,rows).added,0);const a=readJournal(d,{key:'private:1001',ownerQQ:'1001',day:'2026-11-03'}),b=readJournal(d,{platform:'bili',internal:true,day:'2026-11-03'});assert.deepEqual(a.entries,b.entries);assert.equal(a.entries.find(e=>e.text==='柱间就是静').speaker,'主人');});
test('knowing private events does not expose them to a public group',t=>{const d=fixture(t);appendJournal(d,[{at,text:'秘密约定',conversationKey:'private:1001'},{at,text:'本群约定',conversationKey:'group:7001'},{at,text:'别群约定',conversationKey:'group:7002'},{at,platform:'bili',text:'公开视频约定'}]);const r=readJournal(d,{key:'group:7001',ownerQQ:'1001',query:'约定'});assert.equal(r.withheld,2);assert.deepEqual(r.entries.map(x=>x.text).sort(),['公开视频约定','本群约定']);assert.equal(readJournal(d,{platform:'bili',internal:true,query:'秘密'}).entries[0].doNotPublish,true);});
test('calendar uses Beijing dates, rejects traversal and pages without losing earlier entries',t=>{const d=fixture(t);appendJournal(d,[1,2,3].map(n=>({at:'2026-11-02T20:00:0'+n+'Z',text:'话题'+n,conversationKey:'group:7001'})));const opts={key:'private:1001',ownerQQ:'1001',query:'话题',maxLines:1};const a=readJournal(d,opts),b=readJournal(d,{...opts,cursor:a.nextCursor});assert(a.nextCursor);assert.notEqual(a.entries[0].id,b.entries[0].id);assert.equal(readJournal(d,{...opts,query:'',day:'2026-11-03',maxLines:20}).matched,3);assert.throws(()=>readJournal(d,{...opts,day:'../../secret'}));});
test('important events remain searchable after reloading the module and changing the memory card',async t=>{const d=fixture(t);appendJournal(d,[{at,text:'长期关系',pinned:true,conversationKey:'group:7001'}]);fs.writeFileSync(path.join(d,'memory-card.json'),'{}');const fresh=await import('../compat/personal-journal.mjs?cold=1');assert.equal(fresh.appendJournal(d,[{at,text:'长期关系',pinned:true,conversationKey:'group:7001'}]).added,0);assert.equal(fresh.readJournal(d,{key:'private:1001',ownerQQ:'1001',query:'长期关系'}).entries.length,1);});
test('display limits provide a continuation so diary entries are not silently dropped',t=>{const d=fixture(t);appendJournal(d,[1,2,3,4,5].map(n=>({at:'2026-11-03T00:00:0'+n+'Z',text:'分页经历'+n,conversationKey:'group:7001'})));let cursor=null;const ids=new Set();do{const r=readJournal(d,{key:'private:1001',ownerQQ:'1001',query:'分页',limit:2,cursor});for(const e of r.entries)ids.add(e.id);cursor=r.nextCursor;}while(cursor);assert.equal(ids.size,5);});
test('long diary pages and numeric timestamps retain all entries without overflowing prompt budgets',t=>{const d=fixture(t);appendJournal(d,[1,2,3,4].map(n=>({at:String(Date.parse(at)+n*1000),text:'长日记'+n+'鱼'.repeat(3900),conversationKey:'group:7001'})));let cursor=null;const ids=new Set();do{const r=readJournal(d,{key:'private:1001',ownerQQ:'1001',query:'长日记',cursor});assert(r.entries.reduce((n,x)=>n+x.text.length,0)<=10000);for(const e of r.entries)ids.add(e.id);cursor=r.nextCursor;}while(cursor);assert.equal(ids.size,4);});
test('existing Bili diaries join the same journal, stay private and import unchanged paragraphs once',t=>{const d=fixture(t),b=path.join(d,'bili');fs.mkdirSync(b);const file=path.join(b,'whale-diary-private.md');fs.writeFileSync(file,'# 2026-11-03\n\n今天和主人讨论了费率。');assert.equal(syncBiliDiaries(d,b).added,1);fs.appendFileSync(file,'\n\n下次记得看持有期限。');assert.equal(syncBiliDiaries(d,b).added,1);const owner=readJournal(d,{key:'private:1001',ownerQQ:'1001',query:'费率'});assert.equal(owner.entries.length,1);assert(owner.entries[0].doNotPublish);assert.equal(readJournal(d,{key:'group:7001',ownerQQ:'1001',query:'费率'}).entries.length,0);});
test('equal nicknames remain distinct and renaming cannot duplicate the same stable event',t=>{
 const d=fixture(t),rows=['2001','2002'].map(senderId=>({at,senderId,sender:'同名群友',conversationKey:'group:7001',text:'相同内容'}));
 assert.equal(appendJournal(d,rows).added,2);
 assert.equal(appendJournal(d,[{...rows[0],sender:'新昵称'}]).added,0);
 const result=readJournal(d,{key:'private:1001',ownerQQ:'1001',day:'2026-11-03'});
 assert.deepEqual(result.entries.map(r=>r.senderId).sort(),['2001','2002']);
});

test('undated Bili paragraphs keep the first import date after the source file changes days',t=>{
 const d=fixture(t),b=path.join(d,'bili');fs.mkdirSync(b);const file=path.join(b,'whale-diary.md');fs.writeFileSync(file,'没有日期的旧经历。');
 fs.utimesSync(file,new Date('2026-11-01T00:00:00Z'),new Date('2026-11-01T00:00:00Z'));
 assert.equal(syncBiliDiaries(d,b).added,1);
 fs.appendFileSync(file,'\n\n新补充。');fs.utimesSync(file,new Date('2026-11-03T00:00:00Z'),new Date('2026-11-03T00:00:00Z'));
 assert.equal(syncBiliDiaries(d,b).added,1);assert.equal(syncBiliDiaries(d,b).added,0);
 assert.equal(readJournal(d,{key:'private:1001',ownerQQ:'1001',query:'旧经历'}).entries.length,1);
});
test('append during pagination never repeats or loses entries from the first-page snapshot',t=>{
 const d=fixture(t),opts={key:'private:1001',ownerQQ:'1001',day:'2026-11-03',query:'翻页',limit:1};
 appendJournal(d,[1,2,3].map(n=>({at:`2026-11-03T00:00:0${n}Z`,text:'翻页经历'+n,conversationKey:'group:7001'})));
 const first=readJournal(d,opts),seen=first.entries.map(r=>r.text);
 appendJournal(d,[{at:'2026-11-03T00:00:04Z',text:'翻页经历4',conversationKey:'group:7001'}]);
 let cursor=first.nextCursor;
 while(cursor){const page=readJournal(d,{...opts,cursor});seen.push(...page.entries.map(r=>r.text));cursor=page.nextCursor;}
 assert.deepEqual(seen,['翻页经历3','翻页经历2','翻页经历1']);
 assert.equal(readJournal(d,opts).entries[0].text,'翻页经历4');
});
test('long original records and details are read in bounded pages without losing text',t=>{
 const d=fixture(t),text='长记录'+'鱼'.repeat(14000),detail='原始细节',opts={key:'private:1001',ownerQQ:'1001',query:'长记录'};
 appendJournal(d,[{at,text,detail,conversationKey:'group:7001'}]);let cursor=null,actual='';
 do{const r=readJournal(d,{...opts,cursor});assert(r.entries.every(e=>e.text.length<=4000));actual+=r.entries.map(e=>e.text).join('');cursor=r.nextCursor;}while(cursor);
 assert.equal(actual,text+'\n【原记录详情】'+detail);
});
test('an interrupted final write is kept for inspection and cannot corrupt the next append',t=>{
 const d=fixture(t);appendJournal(d,[{at,text:'已落盘',conversationKey:'group:7001'}]);const file=path.join(d,'journal','2026-11-03.jsonl');fs.appendFileSync(file,'{"id":"unfinished');
 assert.equal(readJournal(d,{key:'private:1001',ownerQQ:'1001',day:'2026-11-03'}).entries.length,1);
 appendJournal(d,[{at,text:'恢复以后',conversationKey:'group:7001'}]);
 assert.equal(readJournal(d,{key:'private:1001',ownerQQ:'1001',day:'2026-11-03'}).entries.length,2);
 assert.equal(fs.readdirSync(path.join(d,'journal','.recovered')).length,1);
});
test('two actual writer processes deduplicate shared events instead of racing their local caches',async t=>{
 const d=fixture(t),moduleUrl=new URL('../compat/personal-journal.mjs',import.meta.url).href;
 const code=`import {appendJournal} from ${JSON.stringify(moduleUrl)};const rows=Array.from({length:60},(_,n)=>({at:${JSON.stringify(at)},id:'event-'+n,senderId:'2001',text:'并发'+n,conversationKey:'group:7001'}));for(const row of rows)appendJournal(process.argv[1],[row]);`;
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,d],{stdio:['ignore','pipe','pipe'],windowsHide:true});let err='';child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('close',n=>n===0?resolve():reject(Error(err)));});
 await Promise.all([run(),run()]);
 const rows=fs.readFileSync(path.join(d,'journal','2026-11-03.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));assert.equal(rows.length,60);assert.equal(new Set(rows.map(r=>r.id)).size,60);
});
test('a lock left by an exited writer is recovered without clearing a live writer lock',async t=>{
 const d=fixture(t),dir=path.join(d,'journal');fs.mkdirSync(dir);
 const code=`import fs from 'node:fs';import path from 'node:path';fs.writeFileSync(path.join(process.argv[1],'.write-lock'),JSON.stringify({pid:process.pid,nonce:'dead-writer'}));`;
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,dir],{windowsHide:true});child.on('error',reject);child.on('close',n=>n===0?resolve():reject(Error('worker failed')));});
 assert.equal(appendJournal(d,[{at,text:'重启恢复',conversationKey:'group:7001'}]).added,1);assert(!fs.existsSync(path.join(dir,'.write-lock')));
});
test('explicitly deleted and private source records cannot reappear in a group import',t=>{
 const d=fixture(t);assert.equal(appendJournal(d,[{at,text:'已删除',deleted:true},{at,text:'保密记录',platform:'bili',privateOnly:true}]).added,1);
 assert.equal(readJournal(d,{key:'group:7001',ownerQQ:'1001',day:'2026-11-03'}).entries.length,0);
});

test('archived and current versions retain changed original details and replies',t=>{
 const d=fixture(t),row={id:'same-event',at,text:'约定',detail:'原详情',botReply:'原回话',private:true};
 assert.equal(appendJournal(d,[row]).added,1);
 assert.equal(appendJournal(d,[{...row,detail:'后来补充的详情'}]).added,1);
 assert.equal(appendJournal(d,[row]).added,0);
 assert.equal(readJournal(d,{key:'private:1001',ownerQQ:'1001',query:'约定'}).entries.length,2);
});
