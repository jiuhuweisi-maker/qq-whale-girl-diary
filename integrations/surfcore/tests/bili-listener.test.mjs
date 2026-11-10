import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {patchBiliListener} from '../bili-listener-patch.mjs';
const root = path.resolve(process.argv[2]);
const original = fs.readFileSync(path.join(root,'plugins/surfcore/lib/scheduler.js'),'utf8');
const patched = original.includes('      const quotas = limitsNow()') ? original : patchBiliListener(original);
const section = patched.slice(patched.indexOf('  async function listenTick() {'), patched.indexOf('\n  // ── 直播间监听',patched.indexOf('  async function listenTick() {')));
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
async function run({baseline=0,scope='both',onlyOwner=false,blocked=false,fail=false,useOriginal=false}={}) {
  const feeds=[],prompts=[],errors=[],writes=[];
  const cfg={listen:{comment:true,scope,onlyOwner,allDay:true,commentIntervalSec:300},owner:{mid:'owner'}};
  const env={budgetBlockedNow:async()=>blocked,fs:{readFileSync:p=>JSON.stringify(p==='cfg'?cfg:{})},CFG_FILE_REF:'cfg',CRED_REF:'cred',inWindow:()=>true,
    makeHeaders:()=>({}),readL:()=>({lastSeen:baseline}),writeL:v=>writes.push(v),
    pullFeed:async kind=>{feeds.push(kind);if(fail)throw Error('simulated timeout');return {items:kind==='reply'?[{t:110,who:'B',mid:'peer',kind:'reply'},{t:120,who:'A',mid:'owner',kind:'reply'}]:[]}},
    limitsNow:()=>({replyDaily:12,mineDaily:4,minePerPerson:1}),ensureSession:async()=>{},promptBili:async p=>prompts.push(p),identityContextLines:()=>['鲸戒'],toolLine:()=>'',log:e=>errors.push(e),ctx:{sessionController:{}},sessionId:'fixture',Date,AbortController};
  await new AsyncFunction(...Object.keys(env),'let listening=false,lastListenAt=0;'+(useOriginal?badSection:section)+';await listenTick();')(...Object.values(env));
  return {feeds,prompts,errors,writes};
}
// Reproduce the original lexical collision with exactly the same fixture.
const badSection=original.includes('      const quotas = limitsNow()')?section.replace('const quotas = limitsNow()','const L = limitsNow()').replaceAll('${quotas.','${L.'):original.slice(original.indexOf('  async function listenTick() {'),original.indexOf('\n  // ── 直播间监听',original.indexOf('  async function listenTick() {')));
assert(badSection.includes('const L = limitsNow()'));
let r=await run({useOriginal:true});assert.equal(r.errors.length,1);assert(r.errors[0].includes("Cannot access 'L' before initialization"));
r=await run();assert.deepEqual(r.feeds,['reply','at']);assert.equal(r.errors.length,0);assert.equal(r.prompts.length,0);assert(r.writes[0].lastSeen>0);
r=await run({scope:'reply'});assert.deepEqual(r.feeds,['reply']);
r=await run({baseline:100});assert.equal(r.prompts.length,1);assert(r.prompts[0].content[0].text.includes('2 条新消息'));assert.equal(r.writes[0].lastSeen,120);
r=await run({baseline:100,onlyOwner:true});assert(r.prompts[0].content[0].text.includes('1 条新消息：A'));assert(!r.prompts[0].content[0].text.includes('B（'));
r=await run({blocked:true});assert.equal(r.feeds.length,0);assert.equal(r.prompts.length,0);
r=await run({fail:true});assert.equal(r.errors.length,1);assert.equal(r.prompts.length,0);assert.equal(r.writes.length,0);
assert.throws(()=>patchBiliListener(patched),/anchor drift/);
console.log('PASS_ALL 8 (original bug reproduced; mock feeds, no models or public sends)');
