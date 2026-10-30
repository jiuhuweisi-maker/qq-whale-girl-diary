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
import {interactiveOwnerMessage,ownerMessageGuard,privateRestHint,nightRestPlan} from '../compat/private-availability.mjs';
import {extractMentions} from '../compat/message-mentions.mjs';
const root = path.resolve(process.argv[2]);
const stickerSemantics = await import(pathToFileURL(path.join(root,'src/sticker-semantics.js')));
const { cleanOutput, requestedLiterals } = await import(pathToFileURL(path.join(root, 'whale-compat/hygiene.mjs')));
// Expose the same runtime in the upstream's existing VM harness; no replacement parser/router.
const harnessPath = path.join(root, 'scripts/audit-bridge-harness.mjs');
let original = fs.readFileSync(harnessPath, 'utf8');
if(!original.includes('whale, evaluateWakeTriggerV2, ensureSession,')) original=original.replace('    whale, ensureSession,','    whale, evaluateWakeTriggerV2, ensureSession,').replace('    ensureSession, ensureSlangLearnerSession,','    whale, evaluateWakeTriggerV2, ensureSession, ensureSlangLearnerSession,');
if(!original.includes('appendHistoryCatchupV2, historyCandidateFromRaw,')) original=original.replace('appendHistoryCatchupV2, fetchOneBotHistory,','appendHistoryCatchupV2, historyCandidateFromRaw, fetchOneBotHistory,');
if(!original.includes('loadSocialV2State, socialV2,')) original=original.replace('sendWakePromptV2, socialV2,','sendWakePromptV2, loadSocialV2State, socialV2,');
if(!original.includes('whale, fundpilot, evaluateWakeTriggerV2,')) original=original.replace('whale, evaluateWakeTriggerV2,','whale, fundpilot, evaluateWakeTriggerV2,');
fs.writeFileSync(harnessPath,original);
const { bridgeHarness } = await import(pathToFileURL(harnessPath));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
let control = { ok: true, epoch: 0, quietUntil: 0, privateQuietUntil: 0, privateQuietForever: false };
const descriptors = new Set();
let clockOffset = 0;
class SimDate extends Date {
  constructor(...args) { super(...(args.length ? args : [Date.now() + clockOffset])); }
  static now() { return Date.now() + clockOffset; }
}
// Windows cannot fsync a directory descriptor. Only that OS operation is simulated;
// production/Linux still uses the original fsynced engine and the real filesystem.
const disk = { ...fs, openSync(file, mode, ...args) { if (mode === 'r' && fs.statSync(file).isDirectory() && process.platform === 'win32') { const fd = -1000 - descriptors.size; descriptors.add(fd); return fd; } return fs.openSync(file, mode, ...args); }, fsyncSync(fd) { if (!descriptors.has(fd)) fs.fsyncSync(fd); }, closeSync(fd) { if (descriptors.has(fd)) descriptors.delete(fd); else fs.closeSync(fd); } };
const legacyDir=fs.mkdtempSync(path.join(os.tmpdir(),'whale-stickers-'));fs.writeFileSync(path.join(legacyDir,'happy.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=','base64'));fs.writeFileSync(path.join(legacyDir,'INDEX.tsv'),'happy.png\t开心测试图\n');
const h = await bridgeHarness({ config: { whaleCompat: { cutover: Math.floor(Date.now()/1000)-1,stickerDir:legacyDir }, purpose: { enabled: false }, social: { enabled: false }, voice: { enabled: false }, biliBridge: { enabled: false }, socialV2: { enabled: true, tokenGuard: { enabled: false }, send: { maxPerMinute: 100, maxPerHour: 500 } } }, globals: {
  ...stickerSemantics,extractMentions,Date:SimDate,safeFetchBuffer:async url=>{assert.equal(url,'https://public.invalid/sticker');return{buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=','base64')};},createWhaleRuntime: options => createWhaleRuntime({ ...options, now:()=>SimDate.now(), disk, control: async () => structuredClone(control) }),
  createFundPilot:options=>createFundPilot({...options,disk,research:{read:async fund=>({code:fund.code,name:fund.name,unitNav:1.2,asOf:'2026-10-30',measurement:'published_unit_nav',isRealtimePrice:false})},request:async(route,data)=>({mode:'paper',liveTrading:false,cashFen:100000,...(data?{order:data}:{})})}),recordSessionResult,
  renderConversationMemory, createLegacyReader, cleanOutput, requestedLiterals, reserveGenerationRetry, scopedToolGuide,qqPersona,conversationFocus,withConversationFocus,relationshipBlock,composeConfirmedPersona,contextualFollowUp,proactiveDelay,legacyMedia,interactiveOwnerMessage,ownerMessageGuard,privateRestHint,nightRestPlan,discoverDshSessionCookie: () => ''
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
  await test('actual bridge permits owner DM after 40 wakes but keeps background and group caps',async()=>{
    h.cfg.socialV2.tokenGuard.enabled=true;
    await h.handleIncoming('private',123,event(71,123,'早呀，醒了吗'),h.cfg);
    const st=h.getSocialV2State('private:123');st.wakeTimes=Array(40).fill(Date.now());
    assert.equal(h.tokenGuardWakeBlock('private:123',st,{direct:true,reason:'private'}),null);
    assert(h.buildWakePromptV2('private:123','private').includes('主人当前新私信不按后台次数截断'));
    assert.equal(h.tokenGuardWakeBlock('private:123',st,{direct:true,reason:'proactiveCheck'}).reason,'day');
    assert.equal(h.tokenGuardWakeBlock('group:456',st,{direct:true,reason:'private'}).reason,'day');
    h.cfg.socialV2.tokenGuard.maxWakesPerDay=0;h.cfg.socialV2.tokenGuard.privateMaxWakesPerDay=0;
    assert(h.buildWakePromptV2('group:456','question').includes('本会话不设每日唤醒次数上限'));
    assert(h.buildWakePromptV2('private:123','private').includes('本会话不设每日唤醒次数上限'));
    h.cfg.socialV2.tokenGuard.maxWakesPerDay=20;h.cfg.socialV2.tokenGuard.privateMaxWakesPerDay=40;
    h.cfg.socialV2.tokenGuard.enabled=false;
  });
  await test('actual intake preserves same-name stable users and order', async()=> { await h.handleIncoming('group',456,event(51,201,'玩游戏吗'),h.cfg); await h.handleIncoming('group',456,event(52,202,'晚上吃啥'),h.cfg); await h.handleIncoming('group',456,event(53,201,'我说周六'),h.cfg); const m=h.getSocialV2State('group:456').recentMessages; assert.deepEqual(Array.from(m.slice(-3),x=>String(x.userId)),['201','202','201']); assert(m.at(-1).plain.includes('周六')); });
  await test('actual intake duplicate does not enter unread twice', async()=> {const before=h.getSocialV2State('group:456').unread.length; await h.handleIncoming('group',456,event(53,201,'我说周六'),h.cfg); assert.equal(h.getSocialV2State('group:456').unread.length,before);});
  await test('actual file message keeps its name and its source message id', async()=> {await h.handleIncoming('group',456,event(54,123,'', [{type:'file',data:{name:'notes.md',file_id:'fake'}}]),h.cfg); const m=h.getSocialV2State('group:456').recentMessages.at(-1); assert(m.text.includes('notes.md')); assert.equal(String(m.messageId),'54');});
  await test('actual intake and compact wake keep self and other at identities after an image',async()=>{
    await h.handleIncoming('group',456,event(1410,123,'',[{type:'image',data:{file:'fixture.png'}}]),h.cfg);
    await h.handleIncoming('group',456,event(1411,123,'是咸鱼',[{type:'at',data:{qq:'999'}},{type:'at',data:{qq:'201'}}]),h.cfg);
    const st=h.getSocialV2State('group:456'),msg=st.recentMessages.at(-1);
    assert.deepEqual(Array.from(msg.mentions,m=>[m.userId,m.isSelf]),[['999',true],['201',false]]);
    const snapshot=h.buildWakeSnapshotV2('group:456'),shown=snapshot.messages.find(m=>String(m.messageId)==='1411');
    assert.deepEqual(Array.from(shown.mentions,m=>[m.userId,m.isSelf]),[['999',true],['201',false]]);
    const prompt=h.buildWakePromptV2('group:456','atMention');assert(prompt.includes('明确@：')&&prompt.includes('（其他人）')&&prompt.includes('（你自己）'));
  });
  await test('real history parser and catchup retain numeric at targets without name requests',async()=>{
    const raw=event(1412,201,'是这个',[{type:'at',data:{qq:202}}]),candidate=await h.historyCandidateFromRaw(raw);
    assert.deepEqual(Array.from(candidate.mentions,m=>[m.userId,m.isSelf]),[['202',false]]);
    h.appendHistoryCatchupV2('group:456',[candidate],{maxAgeMs:600000,fetched:1});
    const msg=h.getSocialV2State('group:456').recentMessages.find(m=>String(m.messageId)==='1412');
    assert(msg&&msg.mentions[0].userId==='202');
  });
  await test('long body truncation and a state reload cannot lose the at-other target',async()=>{
    await h.handleIncoming('group',456,event(1413,123,'长话'.repeat(130),[{type:'at',data:{qq:'202'}}]),h.cfg);
    let msg=h.getSocialV2State('group:456').recentMessages.at(-1);assert(!msg.text.includes('@202'));assert.equal(msg.mentions[0].userId,'202');
    h.socialV2.conversations.clear();h.loadSocialV2State();
    msg=h.getSocialV2State('group:456').recentMessages.find(m=>String(m.messageId)==='1413');
    assert.equal(msg.mentions[0].userId,'202');assert.equal(msg.mentions[0].isSelf,false);
  });
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
  await test('actual authenticated fund tool saves an unsupported-paper fund and confirms its own conditions',async()=>{
    fs.writeFileSync(path.join(h.temp,'state/fund-catalog.json'),JSON.stringify({fetchedAt:new Date().toISOString(),funds:[]}));
    const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key);
    for(const [index,bodyText]of ['我准备买易方达蓝筹精选混合','这只持有三个月，净值低于1.2提醒我'].entries()){
      const messageId=String(1420+index),ev={...event(Number(messageId),123,bodyText)};delete ev.group_id;await h.handleIncoming('private',123,ev,h.cfg);
      const args={key,token:st.agentToken,action:'watch',messageId};h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'watch-'+index}});h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_fundpilot',callId:'watch-'+index,arguments:JSON.stringify(args)}});
      const r=await fetch(base+'/api/socialV2/fundpilot',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'cccccccc-cccc-cccc-cccc-'+String(index+1).padStart(12,'0'),'x-whale-tool':'qq_fundpilot','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify(args)}),result=await r.json();assert.equal(r.status,200,JSON.stringify(result));assert.equal(result.plan.code,'005827');assert.equal(result.monitoring,index===1);assert.equal(result.mode,'advisory');
    }
  });
  await test('owner intake saves a pending plan before any model tool call and loads it into the wake',async()=>{
    const ev={...event(1422,123,'我准备买广发纳斯达克100ETF')};delete ev.group_id;
    await h.handleIncoming('private',123,ev,h.cfg);
    assert.equal(h.fundpilot.watches.list().find(p=>p.code==='159941').status,'needs_confirmation');
    const prompt=h.buildWakePromptV2('private:123','private');assert(prompt.includes('【已保存的基金关注计划】')&&prompt.includes('159941'));
    assert(!h.buildWakePromptV2('group:456','question').includes('【已保存的基金关注计划】'));
  });
  await test('native QQ sticker uses the durable transport and a replay never resends',async()=>{
    const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key),args={key,token:st.agentToken,stickerId:'fixture-sticker'};
    h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'native-sticker'}});
    const headers={ 'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','x-whale-tool':'qq_send_sticker','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')};
    h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_send_sticker',callId:'native-sticker',arguments:JSON.stringify(args)}});
    const send=()=>fetch(base+'/api/socialV2/send-sticker',{method:'POST',headers,body:JSON.stringify({key,stickerId:args.stickerId})}).then(r=>r.json());
    const before=h.calls.http.filter(r=>r.url.endsWith('/send_private_msg')).length,a=await send();assert(a.ok,JSON.stringify(a));const b=await send();assert(b.ok,JSON.stringify(b));
    assert.equal(h.calls.http.filter(r=>r.url.endsWith('/send_private_msg')).length-before,1);
    const receipt=h.whale.ledger.data.outbox[`${sid}:native-sticker:0`];assert.equal(receipt.status,'sent');assert(receipt.picture&&receipt.receipt.message_id);
  });
  await test('actual sticker endpoint allows a battle without consuming text quotas',async()=>{
    const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key),args={key,token:st.agentToken,stickerId:'fixture-sticker'};
    Object.assign(h.cfg.whaleCompat,{pictureCooldownMs:0,pictureGapMs:0,privatePicturesPerDay:0,groupPicturesPerHour:0});
    h.cfg.socialV2.tokenGuard.enabled=true;h.cfg.socialV2.tokenGuard.maxOutboundPerTurn=1;st.tokenTurnSent=20;
    h.cfg.socialV2.send.maxSendPerMinute=1;h.cfg.socialV2.send.maxSendPerHour=1;st.sendTimes=[Date.now()];
    h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'sticker-battle'}});
    const before=h.calls.http.filter(r=>r.url.endsWith('/send_private_msg')).length;
    for(let i=0;i<6;i++){
      const callId='battle-'+i;h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_send_sticker',callId,arguments:JSON.stringify(args)}});
      const r=await fetch(base+'/api/socialV2/send-sticker',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'dddddddd-dddd-dddd-dddd-'+String(i+1).padStart(12,'0'),'x-whale-tool':'qq_send_sticker','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify({key,stickerId:args.stickerId})});
      assert.equal(r.status,200,JSON.stringify(await r.json()));
    }
    assert.equal(h.calls.http.filter(r=>r.url.endsWith('/send_private_msg')).length-before,6);assert(st.tokenTurnSent<=20);assert.equal(st.sendTimes.length,1);
    h.cfg.socialV2.tokenGuard.enabled=false;h.cfg.socialV2.send.maxSendPerMinute=100;h.cfg.socialV2.send.maxSendPerHour=500;
  });
  await test('actual financial limit still blocks generation and explains it once in owner DM',async()=>{
    const st=h.getSocialV2State('private:123');h.cfg.socialV2.tokenGuard.enabled=true;
    const day=new Date().toLocaleDateString('sv-SE'),usageFile=path.join(h.temp,'dsh/surfcore/token-usage-daily.json');
    fs.writeFileSync(usageFile,JSON.stringify({version:1,day,at:Date.now(),qq:{cost:9,tokens:100},bili:{cost:0,tokens:0},other:{cost:0,tokens:0},total:{cost:9,tokens:100}}));
    assert.equal(h.tokenGuardWakeBlock('private:123',st,{direct:true,reason:'private'}).reason,'budget');
    const prompts=h.calls.prompts.length,before=h.calls.http.length;
    await h.sendWakePromptV2('private:123','private');await h.sendWakePromptV2('private:123','private');
    const sent=h.calls.http.slice(before).filter(r=>r.url.endsWith('/send_private_msg'));
    assert.equal(h.calls.prompts.length,prompts);assert.equal(sent.length,1);assert.equal(sent[0].body.user_id,123);assert(sent[0].body.message[0].data.text.includes('费用'));
    fs.unlinkSync(usageFile);h.cfg.socialV2.tokenGuard.enabled=false;
  });
  await test('actual overnight wake-config sends one owner goodnight and ends at morning',async()=>{
    const night=Date.parse('2026-10-30T00:45:00+08:00');clockOffset=night-Date.now();
    const st=h.getSocialV2State('private:123');st.lastIncomingAt=night-600000;st.recentMessages=[{isSelf:true,plain:'那我先歇一会儿',time:night-1000}];
    assert(h.buildWakePromptV2('private:123','private').includes('【夜间私信】'));
    const body={key:'private:123',config:{mode:'diving',infinite:false,sleepUntil:'2026-10-30T08:00:00+08:00'}};
    const call=()=>fetch(base+'/api/socialV2/wake-config',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token'},body:JSON.stringify(body)}).then(r=>r.json());
    const before=h.calls.http.length;const a=await call();assert(a.ok,JSON.stringify(a));const b=await call();assert(b.ok,JSON.stringify(b));
    const sent=h.calls.http.slice(before).filter(r=>r.url.endsWith('/send_private_msg'));
    assert.equal(sent.length,1);assert.equal(sent[0].body.user_id,123);assert(sent[0].body.message[0].data.text.includes('晚安'));assert(!st.wakeConfig.infinite);
    clockOffset=Date.parse('2026-10-30T10:53:00+08:00')-Date.now();
    assert(!h.buildWakePromptV2('private:123','private').includes('【夜间私信】'));clockOffset=0;
  });
  console.log('PASS_ALL ' + passed);
} finally {await new Promise(r=>server.close(r)); await h.close();assert.equal(path.dirname(legacyDir),path.resolve(os.tmpdir()));fs.rmSync(legacyDir,{recursive:true});}
