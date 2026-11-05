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
test('authorized internal recall includes private records with publication markers',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'memory-private-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));appendJournal(dir,[{at:'2026-11-03T00:00:00Z',text:'私人约定',private:true}]);
 const reader=createLegacyReader({config:{ownerQQ:'1001',allow:{groups:['7001']}},journalDir:()=>dir});const r=await reader.read({key:'group:7001',kind:'memory',day:'2026-11-03'});assert.equal(r.results.length,1);assert.equal(r.withheld,0);assert(r.results[0].doNotPublish);assert(r.results[0].privateOnly);
 await assert.rejects(reader.read({key:'group:7999',kind:'memory',day:'2026-11-03'}),/未授权/);
});
test('confirmed relationships outside the prompt remain searchable through the real memory reader',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relationship-search-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const relationshipFile=path.join(dir,'people.json');fs.writeFileSync(relationshipFile,JSON.stringify({version:1,people:[{userId:'2001',names:['同名'],groups:['7001'],fact:'第一个人',confirmed:true,source:{kind:'owner-confirmed'}},{userId:'2002',names:['同名'],groups:['7001'],fact:'第二个人',confirmed:true,source:{kind:'owner-confirmed'}}]}));
 const reader=createLegacyReader({config:{ownerQQ:'1001',allow:{groups:['7001']},whaleCompat:{relationshipFile}},journalDir:()=>dir});
 const r=await reader.read({key:'group:7001',kind:'memory',query:'同名'});assert(r.relationships.includes('第一个人'));assert(r.relationships.includes('第二个人'));assert(!r.relationships.includes('2001'));assert.equal(r.results.length,0);
 await assert.rejects(reader.read({key:'group:9999',kind:'memory',query:'同名'}),/未授权/);
});
