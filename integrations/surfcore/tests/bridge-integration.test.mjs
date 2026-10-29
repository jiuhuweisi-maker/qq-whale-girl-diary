// Run against the actual overlaid upstream bridge with fake DSH and OneBot peers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createWhaleRuntime } from '../compat/runtime.mjs';
import { renderConversationMemory } from '../compat/memory-scope.mjs';
import { createLegacyReader } from '../compat/legacy-reader.mjs';
import { createFundPilot } from '../compat/fundpilot.mjs';
import { recordSessionResult,reserveGenerationRetry } from '../compat/session-recovery.mjs';
import {scopedToolGuide,qqPersona,conversationFocus,withConversationFocus} from '../compat/conversation-logic.mjs';
import {relationshipBlock} from '../compat/relationships.mjs';
import {composeConfirmedPersona,contextualFollowUp} from '../compat/expression-style.mjs';
import {proactiveDelay} from '../compat/proactive-clock.mjs';
import {legacyMedia} from '../compat/legacy-media.mjs';
const root = path.resolve(process.argv[2]);
const { cleanOutput, requestedLiterals } = await import(pathToFileURL(path.join(root, 'whale-compat/hygiene.mjs')));
// Expose the same runtime in the upstream's existing VM harness; no replacement parser/router.
const harnessPath = path.join(root, 'scripts/audit-bridge-harness.mjs');
let original = fs.readFileSync(harnessPath, 'utf8');
if(!original.includes('whale, evaluateWakeTriggerV2, ensureSession,')) {original=original.replace('    whale, ensureSession,','    whale, evaluateWakeTriggerV2, ensureSession,').replace('    ensureSession, ensureSlangLearnerSession,','    whale, evaluateWakeTriggerV2, ensureSession, ensureSlangLearnerSession,');fs.writeFileSync(harnessPath,original);}
const { bridgeHarness } = await import(pathToFileURL(harnessPath));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
let control = { ok: true, epoch: 0, quietUntil: 0, privateQuietUntil: 0, privateQuietForever: false };
const descriptors = new Set();
// Windows cannot fsync a directory descriptor. Only that OS operation is simulated;
// production/Linux still uses the original fsynced engine and the real filesystem.
const disk = { ...fs, openSync(file, mode, ...args) { if (mode === 'r' && fs.statSync(file).isDirectory() && process.platform === 'win32') { const fd = -1000 - descriptors.size; descriptors.add(fd); return fd; } return fs.openSync(file, mode, ...args); }, fsyncSync(fd) { if (!descriptors.has(fd)) fs.fsyncSync(fd); }, closeSync(fd) { if (descriptors.has(fd)) descriptors.delete(fd); else fs.closeSync(fd); } };
const legacyDir=fs.mkdtempSync(path.join(os.tmpdir(),'whale-stickers-'));fs.writeFileSync(path.join(legacyDir,'happy.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=','base64'));fs.writeFileSync(path.join(legacyDir,'INDEX.tsv'),'happy.png\t开心测试图\n');
const h = await bridgeHarness({ config: { whaleCompat: { cutover: Math.floor(Date.now()/1000)-1,stickerDir:legacyDir }, purpose: { enabled: false }, social: { enabled: false }, voice: { enabled: false }, biliBridge: { enabled: false }, socialV2: { enabled: true, tokenGuard: { enabled: false }, send: { maxPerMinute: 100, maxPerHour: 500 } } }, globals: {
  createWhaleRuntime: options => createWhaleRuntime({ ...options, disk, control: async () => structuredClone(control) }),
  createFundPilot:options=>createFundPilot({...options,disk,request:async(route,data)=>({mode:'paper',liveTrading:false,cashFen:100000,...(data?{order:data}:{})})}),recordSessionResult,
  renderConversationMemory, createLegacyReader, cleanOutput, requestedLiterals, reserveGenerationRetry, scopedToolGuide,qqPersona,conversationFocus,withConversationFocus,relationshipBlock,composeConfirmedPersona,contextualFollowUp,proactiveDelay,legacyMedia,discoverDshSessionCookie: () => ''
} });
const server = h.startConsoleServer();
if (!server.listening) await new Promise(r => server.once('listening', r));
const base = 'http://127.0.0.1:' + server.address().port;
let serial = 0;
const event = (id, user, text, extra = []) => ({ time: Math.floor(Date.now()/1000), message_id: id, self_id: 999, group_id: 456, user_id: user, sender: { nickname: user === 123 ? '主人' : '同名群友' }, message: [{ type:'text',data:{text} }, ...extra] });
async function send(messages, { requestId, callId, quote, at } = {}) {
  const key = 'group:456', st = h.getSocialV2State(key), sessionId = await h.ensureSession(key);
  const id = ++serial;
  const args = { key, token: st.agentToken, messages, ...(quote ? {replyToMessageId:quote} : {}), ...(at ? {atUserId:at} : {}) };
  h.whale.onEvent(key, sessionId, { type:'turn/start',data:{turn: 't' + id} });
  h.whale.onEvent(key, sessionId, { type:'tool/call',data:{name:'mcp__snowluma__qq_send_message',callId:callId || 'c' + id,arguments:JSON.stringify(args)} });
  const response = await fetch(base + '/api/socialV2/send-message', {method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':requestId || ('11111111-1111-1111-1111-' + String(id).padStart(12,'0')),'x-whale-tool':'qq_send_message','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify(args)});
  return response.json();
}
try {
  h.setMode('reserved2'); h.setSelfIdentity('鲸戒',999);
  await test('actual bridge initializes with the compatibility runtime healthy', async()=> assert(h.whale.status().healthy && h.whale.status().ready));
  await test('actual intake preserves same-name stable users and order', async()=> { await h.handleIncoming('group',456,event(51,201,'玩游戏吗'),h.cfg); await h.handleIncoming('group',456,event(52,202,'晚上吃啥'),h.cfg); await h.handleIncoming('group',456,event(53,201,'我说周六'),h.cfg); const m=h.getSocialV2State('group:456').recentMessages; assert.deepEqual(Array.from(m.slice(-3),x=>String(x.userId)),['201','202','201']); assert(m.at(-1).plain.includes('周六')); });
  await test('actual intake duplicate does not enter unread twice', async()=> {const before=h.getSocialV2State('group:456').unread.length; await h.handleIncoming('group',456,event(53,201,'我说周六'),h.cfg); assert.equal(h.getSocialV2State('group:456').unread.length,before);});
  await test('actual file message keeps its name and its source message id', async()=> {await h.handleIncoming('group',456,event(54,123,'', [{type:'file',data:{name:'notes.md',file_id:'fake'}}]),h.cfg); const m=h.getSocialV2State('group:456').recentMessages.at(-1); assert(m.text.includes('notes.md')); assert.equal(String(m.messageId),'54');});
  await test('actual ignored sender never enters recent or unread', async()=> {h.cfg.deny.users=['203']; await h.handleIncoming('group',456,event(55,203,'@鲸戒'),h.cfg); assert(!h.getSocialV2State('group:456').recentMessages.some(m=>String(m.messageId)==='55'));});
  await test('actual quiet boundary suppresses group intake and pokes without an acknowledgement', async()=> {control.epoch++; control.quietUntil=Date.now()+600000; await h.whale.syncControl(); const before=h.getSocialV2State('group:456').unread.length; await h.handleIncoming('group',456,event(56,201,'你还在吗'),h.cfg); await h.handlePokeNotice({post_type:'notice',sub_type:'poke',group_id:456,self_id:999,user_id:201,target_id:999}); assert.equal(h.getSocialV2State('group:456').unread.length,before); assert.equal(h.calls.sent.length,0); control.quietUntil=0; await h.whale.syncControl();});
  await test('actual HTTP send reaches the fake OneBot transport with cute text intact', async()=> {const result=await send(['好耶🐟（探头）(｡･ω･｡)']); assert.equal(result.ok,true,JSON.stringify(result)); const q=h.calls.http.filter(x=>x.url.endsWith('/send_group_msg')).at(-1); assert.equal(q.body.group_id,456); assert(q.body.message.some(s=>s.type==='text'&&s.data.text.includes('🐟（探头）')));});
  await test('actual send does not leak an English internal status notice', async()=> {const before=h.calls.http.filter(x=>x.url.endsWith('/send_group_msg')).length; const result=await send(['This request cannot be processed.']); assert.equal(result.ok,false); assert.equal(h.calls.http.filter(x=>x.url.endsWith('/send_group_msg')).length,before);});
  await test('actual valid English remains available', async()=> {const result=await send(['Good night 🐟']); assert.equal(result.ok,true);});
  await test('actual quote resolver rejects an unrelated message id', async()=> {const before=h.calls.http.filter(x=>x.url.endsWith('/send_group_msg')).length; const result=await send(['这句回你'],{quote:'8888888',at:'201'}); assert.equal(result.ok,false); assert.equal(h.calls.http.filter(x=>x.url.endsWith('/send_group_msg')).length,before);});
  await test('actual role and memory API uses explicit scope', async()=> {assert.equal(h.memoryCardPromptBlock('invalid'),''); assert.equal(h.memoryCardPromptBlock('private:201'),'');});
  await test('actual wake attributes an old quote once without rewriting stored memory',async()=>{const dir=path.join(h.temp,'dsh','surfcore','memory');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'memory-card.json'),raw=JSON.stringify({records:[{id:'recall-fixture',text:'我是群里维护服务器的小鱼',speaker:'群友B',source:'qq-group',conversationKey:'group:456',pinned:true,createdAt:new Date().toISOString()}]});fs.writeFileSync(file,raw);const wake=h.buildWakePromptV2('group:456','message');assert.equal(wake.split('【历史记录 · 发言按来源引用】').length-1,1);assert(wake.includes('【历史发言·群友B】'));assert.equal(fs.readFileSync(file,'utf8'),raw);});
  await test('actual recent-message response includes the fresh conversation focus',async()=>{const r=await fetch(base+'/api/socialV2/recent?key=group:456',{headers:{'x-console-token':'fixture-console-token'}}).then(r=>r.json());assert(r.messages.length);assert(r.currentThread.includes('person-'));});
  await test('actual wake accepts a same-speaker short continuation without an at mention',async()=>{const st={wakeConfig:{triggers:{question:true}},recentMessages:[{userId:'201',time:Date.now()-2000},{isSelf:true,time:Date.now()-1000}]};assert.equal(h.evaluateWakeTriggerV2('group:456',st,event(80,201,'还有呢'),'group','还有呢','还有呢',false),'question');assert.equal(h.evaluateWakeTriggerV2('group:456',st,event(81,202,'还有呢'),'group','还有呢','还有呢',false),null);});
  await test('actual legacy sticker lookup returns a sendable item',async()=>{const key='group:456',token=h.getSocialV2State(key).agentToken;const r=await fetch(base+'/api/socialV2/legacy-read',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-token':token},body:JSON.stringify({key,kind:'stickers',query:'开心'})}).then(r=>r.json());assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.entries.length,1);});
  await test('actual legacy sticker send reaches the fake QQ image transport',async()=>{const key='group:456',st=h.getSocialV2State(key),sid=await h.ensureSession(key),id=++serial,args={key,token:st.agentToken,id:legacyMedia(h.cfg).search('开心')[0].id};h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'sticker'}});h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_send_legacy_sticker',callId:'sticker',arguments:JSON.stringify(args)}});const r=await fetch(base+'/api/socialV2/send-legacy-sticker',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'11111111-1111-1111-1111-'+String(id).padStart(12,'0'),'x-whale-tool':'qq_send_legacy_sticker','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify(args)}).then(r=>r.json());assert.equal(r.ok,true,JSON.stringify(r));assert(h.calls.http.filter(x=>x.url.endsWith('/send_group_msg')).at(-1).body.message.some(s=>s.type==='image'&&s.data.file.startsWith('base64://')));});
  await test('fund tool is routed through native call correlation and owner private scope',async()=>{
    h.cfg.whaleCompat.fundpilot={enabled:true};const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key),id=++serial;
    const args={key,token:st.agentToken,action:'status'};h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'fund'}});h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_fundpilot',callId:'fund-status',arguments:JSON.stringify(args)}});
    const r=await fetch(base+'/api/socialV2/fundpilot',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'11111111-1111-1111-1111-'+String(id).padStart(12,'0'),'x-whale-tool':'qq_fundpilot','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify(args)});assert.equal(r.status,200);assert.equal((await r.json()).cashFen,100000);
  });
  await test('fund tool cannot fall back to console credentials without a private token',async()=>{const r=await fetch(base+'/api/socialV2/fundpilot',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1'},body:JSON.stringify({key:'private:123',action:'status'})});assert.equal(r.status,403);});
} finally {await new Promise(r=>server.close(r)); await h.close();assert.equal(path.dirname(legacyDir),path.resolve(os.tmpdir()));fs.rmSync(legacyDir,{recursive:true});}
console.log('PASS_ALL ' + passed);
