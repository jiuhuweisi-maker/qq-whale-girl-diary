import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{appendJournal}from'../compat/personal-journal.mjs';import{createLegacyReader}from'../compat/legacy-reader.mjs';
test('model receives one body copy with provenance, privacy and continuation intact',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'memory-payload-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const body='只出现一次的回忆'+'正文'.repeat(2600);appendJournal(dir,[{id:'event-one',at:'2026-11-03T00:00:00Z',text:body,senderId:'2001',sender:'同名群友',conversationKey:'group:7001',privateOnly:true}]);
 const reader=createLegacyReader({config:{ownerQQ:'1001',allow:{groups:['7001']}},journalDir:()=>dir});
 const first=await reader.read({key:'private:1001',kind:'memory',query:'回忆'});
 assert.equal(first.entries,undefined);assert.equal(first.results.length,1);assert.equal(first.results[0].senderId,'2001');assert(first.results[0].id);assert(first.results[0].doNotPublish);assert(first.nextCursor);
 assert.equal(JSON.stringify(first).split('只出现一次的回忆').length-1,1);
 const next=await reader.read({key:'private:1001',kind:'memory',query:'回忆',cursor:first.nextCursor});assert.equal(first.results[0].text+next.results[0].text,body);
});
test('removing duplicate payload does not grant group access to private records',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'memory-private-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));appendJournal(dir,[{at:'2026-11-03T00:00:00Z',text:'私人约定',private:true}]);
 const reader=createLegacyReader({config:{ownerQQ:'1001',allow:{groups:['7001']}},journalDir:()=>dir});const r=await reader.read({key:'group:7001',kind:'memory',day:'2026-11-03'});assert.equal(r.results.length,0);assert.equal(r.withheld,1);
});
