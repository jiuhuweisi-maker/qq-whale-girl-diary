// Run against the actual overlaid upstream bridge with fake DSH and OneBot peers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { createWhaleRuntime } from '../compat/runtime.mjs';
import { renderConversationMemory } from '../compat/memory-scope.mjs';
import { createLegacyReader,journalFocus } from '../compat/legacy-reader.mjs';
import { createFundPilot } from '../compat/fundpilot.mjs';
import { recordSessionResult,reserveGenerationRetry } from '../compat/session-recovery.mjs';
import {scopedToolGuide,qqPersona,conversationFocus,withConversationFocus,groupActivityView} from '../compat/conversation-logic.mjs';
import {relationshipBlock} from '../compat/relationships.mjs';
import {composeConfirmedPersona,contextualFollowUp,readConfirmedStyle} from '../compat/expression-style.mjs';
import {styleBlock,atomicJson,readJson,invalidateLanguageCache} from '../compat/language-style.mjs';
import {refreshReplyAllowance,pendingReplyCandidate} from '../compat/reply-continuity.mjs';
import {modelImage} from '../compat/model-image.mjs';
import {proactiveDelay} from '../compat/proactive-clock.mjs';
import {legacyMedia} from '../compat/legacy-media.mjs';
import {interactiveOwnerMessage,ownerMessageGuard,privateRestHint,nightRestPlan} from '../compat/private-availability.mjs';
import {extractMentions} from '../compat/message-mentions.mjs';
import {bootstrapToolContext,backgroundPromptRefresh} from '../compat/context-economy.mjs';
import {appendJournal} from '../compat/personal-journal.mjs';
import {collectWorkbench,WORKBENCH_HTML} from '../compat/workbench-panel.mjs';
import {claimBiliSceneOffer,sceneSwitchPrompt} from '../compat/scene-switch.mjs';
// 221: bridge.js 的 roleHintForMode 现在会读跨端事实块；VM harness 需要把它作为全局注入。
import {ownerAtReceiptBlock} from '../compat/owner-at-receipt.mjs';
// 225: bridge.js 顶层新导入了内部状态模块；VM harness 会剥掉 import，
// 这四个绑定必须由本测试显式注入，否则沙箱里会报 isOwnerPrivateKey is not defined。
import {stripInternalState,stripObjectStrings,publicSendLimitResult,isOwnerPrivateKey} from '../compat/internal-state.mjs';
// 226: bridge.js 顶层新导入了持续情绪状态模块；VM harness 会剥掉 import，
// 这个绑定必须由本测试显式注入，否则沙箱里会报 createEmotionStore is not defined。
import {createEmotionStore} from '../compat/emotion-state.mjs';
const root = path.resolve(process.argv[2]);
const stickerSemantics = await import(pathToFileURL(path.join(root,'src/sticker-semantics.js')));
const {serializeModelData}=await import(pathToFileURL(path.join(root,'src/qq-model-view.js')));
const contextSnapshot = await import(pathToFileURL(path.join(root,'src/context-snapshot.js')));
const { cleanOutput, requestedLiterals } = await import(pathToFileURL(path.join(root, 'whale-compat/hygiene.mjs')));
// Expose the same runtime in the upstream's existing VM harness; no replacement parser/router.
const harnessPath = path.join(root, 'scripts/audit-bridge-harness.mjs');
let original = fs.readFileSync(harnessPath, 'utf8');
if(!original.includes('whale, evaluateWakeTriggerV2, ensureSession,')) original=original.replace('    whale, ensureSession,','    whale, evaluateWakeTriggerV2, ensureSession,').replace('    ensureSession, ensureSlangLearnerSession,','    whale, evaluateWakeTriggerV2, ensureSession, ensureSlangLearnerSession,');
if(!original.includes('appendHistoryCatchupV2, historyCandidateFromRaw,')) original=original.replace('appendHistoryCatchupV2, fetchOneBotHistory,','appendHistoryCatchupV2, historyCandidateFromRaw, fetchOneBotHistory,');
if(!original.includes('loadSocialV2State, socialV2,')) original=original.replace('sendWakePromptV2, socialV2,','sendWakePromptV2, loadSocialV2State, socialV2,');
if(!original.includes('whale, fundpilot, evaluateWakeTriggerV2,')) original=original.replace('whale, evaluateWakeTriggerV2,','whale, fundpilot, evaluateWakeTriggerV2,');
assert.equal(original,fs.readFileSync(harnessPath, 'utf8'), 'latest harness must expose compatibility functions without modifying source');
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
let ownerDispatchFixture;
const h = await bridgeHarness({ onebotResponse: (action, body) => ownerDispatchFixture?.(action, body), config: { whaleCompat: { cutover: Math.floor(Date.now()/1000)-1,stickerDir:legacyDir }, purpose: { enabled: false }, social: { enabled: false }, voice: { enabled: false }, biliBridge: { enabled: false }, socialV2: { enabled: true, tokenGuard: { enabled: false }, send: { maxPerMinute: 100, maxPerHour: 500 } } }, globals: {
  collectWorkbench,WORKBENCH_HTML,detectImageInput:async()=>true,...stickerSemantics,...contextSnapshot,extractMentions,bootstrapToolContext,backgroundPromptRefresh,Date:SimDate,safeFetchBuffer:async url=>{assert.equal(url,'https://public.invalid/sticker');return{buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=','base64')};},createWhaleRuntime: options => createWhaleRuntime({ ...options, now:()=>SimDate.now(), disk, log:(...a)=>{options.log?.(...a);if(String(a[0]).startsWith('持久消息账本'))console.error('[fixture-ledger]',...a);}, control: async () => structuredClone(control) }),
  createFundPilot:options=>createFundPilot({...options,disk,research:{read:async fund=>({code:fund.code,name:fund.name,unitNav:1.2,asOf:'2026-10-30',measurement:'published_unit_nav',isRealtimePrice:false})},request:async(route,data)=>({mode:'paper',liveTrading:false,cashFen:100000,...(data?{order:data}:{})})}),recordSessionResult,
  renderConversationMemory, createLegacyReader, journalFocus, cleanOutput, requestedLiterals, reserveGenerationRetry, scopedToolGuide,qqPersona,conversationFocus,withConversationFocus,groupActivityView,relationshipBlock,composeConfirmedPersona,contextualFollowUp,readConfirmedStyle,styleBlock,refreshReplyAllowance,pendingReplyCandidate,modelImage,proactiveDelay,legacyMedia,interactiveOwnerMessage,ownerMessageGuard,privateRestHint,nightRestPlan,discoverDshSessionCookie: () => '', ownerAtReceiptBlock,
  stripInternalState, stripObjectStrings, publicSendLimitResult, isOwnerPrivateKey, createEmotionStore
} });
const server = h.startConsoleServer();
if (!server.listening) await new Promise(r => server.once('listening', r));
const base = 'http://127.0.0.1:' + server.address().port;
let serial = 0;
const event = (id, user, text, extra = []) => ({ time: Math.floor(Date.now()/1000), message_id: id, self_id: 999, group_id: 456, user_id: user, sender: { nickname: user === 123 ? '主人' : '同名群友' }, message: [{ type:'text',data:{text} }, ...extra] });
async function send(messages, { key = 'group:456', requestId, callId, quote, at } = {}) {
  const st = h.getSocialV2State(key), sessionId = await h.ensureSession(key);
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
  await test('automatic diagnostics and status commands stay off QQ without poisoning channel health',async()=>{
    const before=h.calls.http.length;
    for(const key of ['group:456','private:123']) {
      assert.equal((await h.sendToQQ(key,'SnowLuma 状态 版本 平台')).skipped,'console-only');
      await h.handleIncoming(key.split(':')[0],Number(key.split(':')[1]),{...event(88001,123,'/status'),...(key.startsWith('private:')?{message_type:'private'}:{})},h.cfg);
      await h.handleIncoming(key.split(':')[0],Number(key.split(':')[1]),event(88002,1002,'/status'),h.cfg);
    }
    assert.equal(h.calls.http.slice(before).filter(r=>/\/send_(group|private)_msg$/.test(r.url)).length,0);
    assert.equal(h.qqSendChannelStatus().ok,true);
  });
  await test('local rejections never mark QQ down and a real successful send clears stale failure state',async()=>{
    h.setSnowlumaHealth({connected:true,lastSendFailAt:0,lastSendOkAt:SimDate.now()});
    for(const reason of ['发送缺少有效的当前回合','发送与当前回合无法唯一关联','本轮已取消，不再补发','Token 防爆破：本轮接话还可发 0 条'])h.noteSendFailure('group:456',new Error(reason));
    assert.equal(h.qqSendChannelStatus().ok,true);
    h.noteSendFailure('group:456',new Error('fetch failed'));assert.equal(h.qqSendChannelStatus().ok,false);
    h.noteSendSuccess('group:456');assert.equal(h.qqSendChannelStatus().ok,true);
  });
  await test('fresh conversational group follow-ups reset reply and retry-loop counters once',async()=>{
    const key='group:456',st=h.getSocialV2State(key),sid=await h.ensureSession(key),now=SimDate.now();
    const originalUnread=st.unread;st.lastAiReplyAt=now-1000;st.tokenTurnSent=8;h.turnGuard.begin(sid,key);h.turnGuard.noteStep(sid);
    const m={messageId:'88003',seq:88003,time:now,userId:'123',plain:'然后呢'};st.unread=[m];
    h.noteModelMessagesV2(st,[m],key);assert.equal(st.tokenTurnSent,0);assert.equal(h.turnGuard.get(sid).steps,0);
    st.tokenTurnSent=8;h.turnGuard.noteStep(sid);h.noteModelMessagesV2(st,[m],key);assert.equal(st.tokenTurnSent,8);assert.equal(h.turnGuard.get(sid).steps,1);
    st.unread=originalUnread;h.turnGuard.end(sid);
  });
  await test('transient send channel gates retain and retry fresh addressed messages without running a model',async()=>{
    const key='group:456',st=h.getSocialV2State(key),now=SimDate.now(),before=h.calls.prompts.length,old=st.unread;
    st.unread=[{seq:88004,messageId:'88004',userId:'123',time:now,mentions:[{isSelf:true}]}];
    h.setSnowlumaHealth({connected:true,lastSendOkAt:now-1000,lastSendFailAt:now});
    await h.sendWakePromptV2(key,'atMention');assert(st.channelRetryTimer);const timer=st.channelRetryTimer;
    await h.sendWakePromptV2(key,'atMention');assert.equal(st.channelRetryTimer,timer);assert.equal(h.calls.prompts.length,before);
    clearTimeout(timer);st.channelRetryTimer=null;st.unread=old;h.setSnowlumaHealth({lastSendFailAt:0,lastSendOkAt:SimDate.now()});
  });
  await test('workbench routes require the console and remain read-only for actual agent tokens',async()=>{
    assert.equal((await fetch(base+'/api/whale-workbench')).status,401);
    const st=h.getSocialV2State('private:123');await h.ensureSession('private:123');
    for(const endpoint of ['/api/whale-workbench','/whale-workbench']){
      const denied=await fetch(base+endpoint,{headers:{'x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken}});assert.equal(denied.status,403);
      const allowed=await fetch(base+endpoint,{headers:{'x-console-token':'fixture-console-token'}});assert.equal(allowed.status,200);
      if(endpoint.startsWith('/api'))assert.equal((await allowed.json()).modelCalls,0);else assert((await allowed.text()).includes('textContent'));
    }
  });
  await test('actual bridge permits owner DM after 40 wakes but keeps background and group caps',async()=>{
    h.cfg.socialV2.tokenGuard.enabled=true;
    await h.handleIncoming('private',123,event(71,123,'早呀，醒了吗'),h.cfg);
    const st=h.getSocialV2State('private:123');st.wakeTimes=Array(40).fill(Date.now());st.wakeBudgetTimes=[...st.wakeTimes];
    assert.equal(h.tokenGuardWakeBlock('private:123',st,{direct:true,reason:'private'}),null);
    assert(h.buildWakePromptV2('private:123','private').includes('主人当前新私信不按后台次数截断'));
    assert.equal(h.tokenGuardWakeBlock('private:123',st,{direct:false,reason:'proactiveCheck'}).reason,'day');
    assert.equal(h.tokenGuardWakeBlock('group:456',st,{direct:false,reason:'proactiveCheck'}).reason,'day');
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
  await test('actual memory HTTP and MCP serializer rank the current stable sender with one body copy',async()=>{
    const key='group:456';await h.handleIncoming('group',456,event(1414,201,'说说那次约定'),h.cfg);
    const dir=path.join(h.temp,'dsh','surfcore','memory');appendJournal(dir,[{at:'2026-11-01T00:00:00Z',text:'排名验证约定本人',senderId:'201',sender:'旧昵称',conversationKey:key},{at:'2026-11-03T00:00:00Z',text:'排名验证约定同名别人',senderId:'202',sender:'旧昵称',conversationKey:key},{at:'2026-11-03T00:00:01Z',text:'排名验证约定私密',senderId:'201',conversationKey:'private:123'}]);
    const st=h.getSocialV2State(key),r=await fetch(base+'/api/socialV2/legacy-read',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-token':st.agentToken},body:JSON.stringify({key,kind:'memory',query:'排名验证约定',focus:{senderId:'202'}})}).then(r=>r.json());
    assert.equal(r.ok,true);assert.equal(r.results[0].senderId,'201');assert.equal(r.results.length,3);assert(!('entries'in r));
    const modelJson=serializeModelData(r);assert.equal(modelJson.split('排名验证约定本人').length-1,1);
    const privateRecall=r.results.find(row=>row.text==='排名验证约定私密');assert(privateRecall?.doNotPublish);assert.equal(privateRecall.senderId,'201');
  });
  await test('actual wake accepts a same-speaker short continuation without an at mention',async()=>{const st={wakeConfig:{triggers:{question:true}},recentMessages:[{userId:'201',time:Date.now()-2000},{isSelf:true,time:Date.now()-1000}]};assert.equal(h.evaluateWakeTriggerV2('group:456',st,event(80,201,'还有呢'),'group','还有呢','还有呢',false),'question');assert.equal(h.evaluateWakeTriggerV2('group:456',st,event(81,202,'还有呢'),'group','还有呢','还有呢',false),null);});
  await test('actual legacy sticker lookup returns a sendable item',async()=>{const key='group:456',token=h.getSocialV2State(key).agentToken;const r=await fetch(base+'/api/socialV2/legacy-read',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-token':token},body:JSON.stringify({key,kind:'stickers',query:'开心'})}).then(r=>r.json());assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.entries.length,1);});
  await test('actual legacy sticker send reaches the fake QQ image transport',async()=>{const key='group:456',st=h.getSocialV2State(key),sid=await h.ensureSession(key),id=++serial,args={key,token:st.agentToken,id:legacyMedia(h.cfg).search('开心')[0].id};h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'sticker'}});h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_send_legacy_sticker',callId:'sticker',arguments:JSON.stringify(args)}});const r=await fetch(base+'/api/socialV2/send-legacy-sticker',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'11111111-1111-1111-1111-'+String(id).padStart(12,'0'),'x-whale-tool':'qq_send_legacy_sticker','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify(args)}).then(r=>r.json());assert.equal(r.ok,true,JSON.stringify(r));assert(h.calls.http.filter(x=>x.url.endsWith('/send_group_msg')).at(-1).body.message.some(s=>s.type==='image'&&s.data.file.startsWith('base64://')));});
  await test('fund tool is routed through native call correlation and owner private scope',async()=>{
    h.cfg.whaleCompat.fundpilot={enabled:true};const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key),id=++serial;
    const args={key,token:st.agentToken,action:'status'};h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'fund'}});h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_fundpilot',callId:'fund-status',arguments:JSON.stringify(args)}});
    const r=await fetch(base+'/api/socialV2/fundpilot',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'11111111-1111-1111-1111-'+String(id).padStart(12,'0'),'x-whale-tool':'qq_fundpilot','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify(args)});assert.equal(r.status,200);assert.equal((await r.json()).cashFen,100000);
  });
  await test('fund tool cannot fall back to console credentials without a private token',async()=>{const r=await fetch(base+'/api/socialV2/fundpilot',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1'},body:JSON.stringify({key:'private:123',action:'status'})});assert.equal(r.status,403);});
  await test('actual owner QQ intake and correlated tool forward the original large money budget',async()=>{
    const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key),ev={...event(1430,123,'模拟买入易方达纳指ETF，100万元')};delete ev.group_id;await h.handleIncoming('private',123,ev,h.cfg);
    const args={key,token:st.agentToken,action:'order',messageId:'1430'};h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'large-paper'}});h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_fundpilot',callId:'large-paper',arguments:JSON.stringify(args)}});
    const r=await fetch(base+'/api/socialV2/fundpilot',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','x-whale-tool':'qq_fundpilot','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify(args)}),result=await r.json();assert.equal(r.status,200,JSON.stringify(result));assert.equal(result.order.amountFen,100000000);assert.equal(result.order.symbol,'159696.SZ');assert.equal(result.order.quantity,undefined);assert.equal(result.order.mode,'paper');
    const oldPersona=h.cfg.whaleCompat.personaFile,oldStyle=h.cfg.whaleCompat.styleFile;
    try{const persona=path.join(h.temp,'fixture-persona.md'),style=path.join(h.temp,'fixture-style.md');fs.writeFileSync(persona,'离线测试小鱼');fs.writeFileSync(style,'保持自然可爱🐟');fs.mkdirSync(path.join(h.temp,'whale-compat'),{recursive:true});fs.copyFileSync(path.join(root,'whale-compat/TOOL-GUIDE.md'),path.join(h.temp,'whale-compat/TOOL-GUIDE.md'));h.cfg.whaleCompat.personaFile=persona;h.cfg.whaleCompat.styleFile=style;const prompt=h.buildWakePromptV2(key,'private');assert(prompt.includes('capitalMode=elastic')&&prompt.includes('不设原1000元'));assert(!h.buildWakePromptV2('group:456','question').includes('capitalMode=elastic'));}finally{h.cfg.whaleCompat.personaFile=oldPersona;h.cfg.whaleCompat.styleFile=oldStyle;}
  });
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
    const before=h.calls.http.filter(r=>r.url.endsWith('/send_custom_face')).length,a=await send();assert(a.ok,JSON.stringify(a));const b=await send();assert(b.ok,JSON.stringify(b));
    assert.equal(h.calls.http.filter(r=>r.url.endsWith('/send_custom_face')).length-before,1);
    const receipt=h.whale.ledger.data.outbox[`${sid}:native-sticker:0`];assert.equal(receipt.status,'sent');assert(receipt.picture&&receipt.receipt.message_id);
  });
  await test('actual sticker endpoint allows a battle without consuming text quotas',async()=>{
    const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key),args={key,token:st.agentToken,stickerId:'fixture-sticker'};
    Object.assign(h.cfg.whaleCompat,{pictureCooldownMs:0,pictureGapMs:0,privatePicturesPerDay:0,groupPicturesPerHour:0});
    h.cfg.socialV2.tokenGuard.enabled=true;h.cfg.socialV2.tokenGuard.maxOutboundPerTurn=1;st.tokenTurnSent=20;
    h.cfg.socialV2.send.maxSendPerMinute=1;h.cfg.socialV2.send.maxSendPerHour=1;st.sendTimes=[Date.now()];
    h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'sticker-battle'}});
    const before=h.calls.http.filter(r=>r.url.endsWith('/send_custom_face')).length;
    for(let i=0;i<6;i++){
      const callId='battle-'+i;h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_send_sticker',callId,arguments:JSON.stringify(args)}});
      const r=await fetch(base+'/api/socialV2/send-sticker',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'dddddddd-dddd-dddd-dddd-'+String(i+1).padStart(12,'0'),'x-whale-tool':'qq_send_sticker','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},body:JSON.stringify({key,stickerId:args.stickerId})});
      assert.equal(r.status,200,JSON.stringify(await r.json()));
    }
    assert.equal(h.calls.http.filter(r=>r.url.endsWith('/send_custom_face')).length-before,6);assert(st.tokenTurnSent<=20);assert.equal(st.sendTimes.length,1);
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
  // 225：主人私聊的文字发送不再被每小时条数上限掐住（这正是 11-09 凌晨「喊三声没人应」的根因）。
  // 群聊和其它私聊的防刷屏上限保留；被挡时对外只回一句中性话，不把设置路径/额度/重试时间交给模型。
  await test('225 owner DM ignores text send caps; group sends still get a clean 429',async()=>{
    const ownerKey='private:123',groupKey='group:456';
    const ost=h.getSocialV2State(ownerKey),gst=h.getSocialV2State(groupKey);
    const now=SimDate.now(),sentBefore=h.calls.http.length;
    const saved={ownerTimes:ost.sendTimes,groupTimes:gst.sendTimes,ownerUnread:ost.unread,
      ownerIn:ost.lastIncomingAt,ownerOut:ost.lastAiReplyAt,
      maxHour:h.cfg.socialV2.send.maxSendPerHour,maxMinute:h.cfg.socialV2.send.maxSendPerMinute};
    try {
      h.cfg.socialV2.send.maxSendPerMinute=0;h.cfg.socialV2.send.maxSendPerHour=1;
      ost.sendTimes=[now-100];gst.sendTimes=[now-100];
      ost.lastIncomingAt=now;ost.lastAiReplyAt=now-5000;
      ost.unread=[{seq:2000,messageId:'2010',userId:'123',plain:'刚发的新问题',time:now}];
      h.setSnowlumaHealth({connected:true,lastSendFailAt:0,lastSendOkAt:now});
      // 主人私聊：唤醒前不再被 send-rate 掐掉，也不播报「发得太密」。
      await h.sendWakePromptV2(ownerKey,'private');
      await h.sendWakePromptV2(ownerKey,'private');
      assert.notEqual(ost.lastWakeBlock?.guardReason,'send-rate');
      const notices=h.calls.http.slice(sentBefore).filter(r=>r.url.endsWith('/send_private_msg'));
      assert(!notices.some(r=>JSON.stringify(r.body).includes('发得太密')),'主人私聊不该收到限流播报');
      // 文字发送接口对主人私聊照常放行。
      const ownerSend=await send(['这句照常发出去🐟'],{key:ownerKey});
      assert.equal(ownerSend.ok,true,JSON.stringify(ownerSend));
      // 群聊仍保留上限，但 429 对外没有任何内部状态可读。
      const groupSend=await send(['群里这条该被挡'],{key:groupKey});
      assert.equal(groupSend.ok,false,JSON.stringify(groupSend));
      assert.equal(groupSend.code,'SEND_RATE_LIMIT');
      const raw=JSON.stringify(groupSend);
      for(const leak of ['maxSendPer','retryAfterMs','setting','hint','每小时已经发了','去 QQ → 高级设置'])
        assert(!raw.includes(leak),'内部状态泄漏: '+leak+' '+raw);
      // 唤醒节奏本身没被改坏。
      const prompt=h.buildWakePromptV2(ownerKey,'private');
      assert(prompt.includes('接着你们刚说的事聊')&&!prompt.includes('【沉睡前强制等待】')&&!prompt.includes('先判断：群里在聊什么'));
      assert(h.buildWakePromptV2(groupKey,'question').includes('【沉睡前强制等待】'));
    } finally {
      ost.unread=saved.ownerUnread;ost.sendTimes=saved.ownerTimes;
      ost.lastIncomingAt=saved.ownerIn;ost.lastAiReplyAt=saved.ownerOut;
      gst.sendTimes=saved.groupTimes;
      h.cfg.socialV2.send.maxSendPerHour=saved.maxHour;
      h.cfg.socialV2.send.maxSendPerMinute=saved.maxMinute;
    }
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
  await test('only a new explicit owner DM can send an ordered group batch, with native mention and no replay',async()=>{
    h.setReady(true);
    h.setSnowlumaHealth({connected:true,lastSendFailAt:0});
    const start=h.calls.http.length;
    const line='再试试：去群里@全体成员，发出，然后再发一条111有人吗？发出，最后发一条怎么这么安静🐵💢';
    const dm=(id,user,text)=>{const e=event(id,user,text);delete e.group_id;return e;};
    const groupSends=()=>h.calls.http.slice(start).filter(row=>row.url.endsWith('/send_group_msg'));
    const groupEvent=event(1961,123,'/群发 456\n@全体成员\n测试',[]);
    await h.handleIncoming('group',456,groupEvent,h.cfg);
    await h.handleIncoming('private',123,dm(1962,234,'/群发 456\n@全体成员\n测试'),h.cfg);
    assert.equal(groupSends().length,0);
    h.socialV2.paused=false;
    h.setSnowlumaHealth({connected:true,lastSendFailAt:0,lastSendOkAt:SimDate.now()});
    ownerDispatchFixture=(action)=>action==='get_msg' ? {status:'ok',retcode:0,data:{message_type:'group',group_id:456,message:[{type:'at',data:{qq:'all'}}]}} : null;
    try {
      const input=dm(1963,123,line);
      await h.handleIncoming('private',123,input,h.cfg);
      await h.handleIncoming('private',123,input,h.cfg);
      assert.equal(groupSends().length,3,JSON.stringify(h.calls.http.slice(start)));
      assert.deepEqual(groupSends().map(row=>JSON.stringify(row.body.message)),[
        JSON.stringify([{type:'at',data:{qq:'all'}}]),
        JSON.stringify([{type:'text',data:{text:'111有人吗？'}}]),
        JSON.stringify([{type:'text',data:{text:'怎么这么安静🐵💢'}}]),
      ]);
      const report=h.calls.http.slice(start).filter(row=>row.url.endsWith('/send_private_msg'));
      assert.equal(report.length,1);
      assert(report[0].body.message[0].data.text.includes('按顺序发了 3 条'));
      assert.equal(Object.entries(h.whale.ledger.data.outbox).filter(([key,row])=>key.startsWith('owner-group:private:123:1963:group:')&&row.status==='sent'&&row.receipt?.message_id).length,3);
      const beforeRecovery=groupSends().length;
      const recovered=dm(1964,123,'/群发 456\n这条恢复后不能补发');
      h.whale.ledger.change(data=>{data.inbox['private:123:1964']={at:SimDate.now(),expiresAt:SimDate.now()+60000,stage:'buffered',key:'private:123',event:recovered};});
      await h.whale.recover(async()=>{await h.whale.ownerGroupOnce('private:123',recovered,'group:456',['恢复样本'],()=>{throw Error('必须拒绝恢复群发');},()=>{});},()=>false);
      assert.equal(groupSends().length,beforeRecovery);
      ownerDispatchFixture=(action,body)=>action==='send_group_msg'&&body.message[0]?.data?.text==='第二条被拒' ? {status:'failed',retcode:100} : null;
      await h.handleIncoming('private',123,dm(1965,123,'/群发 456\n第一条\n第二条被拒\n第三条'),h.cfg);
      assert.deepEqual(groupSends().slice(3).map(row=>row.body.message[0].data.text),['第一条','第二条被拒']);
      ownerDispatchFixture=null;
      await h.handleIncoming('private',123,dm(1966,123,'/群发 456\n@全体成员\n没有确认就不发'),h.cfg);
      assert.equal(groupSends().length,6);
      assert.equal(groupSends().at(-1).body.message[0].data.qq,'all');
    } finally { ownerDispatchFixture=null; }
  });
  await test('natural owner language can hand over exact words with no command and no historical or negated send',async()=>{
    h.setReady(true);
    h.setSnowlumaHealth({connected:true,lastSendFailAt:0,lastSendOkAt:SimDate.now()});
    const key='private:123',st=h.getSocialV2State(key),sid=await h.ensureSession(key);
    const dm=(id,text)=>{const e=event(id,123,text);delete e.group_id;return e;};
    const lines=['第一句嗨','第二句晚安'];
    let index=0;
    async function call(messageId,selected=lines){
      const args={key,token:st.agentToken,messageId,group:'456',lines:selected};
      const serial=String(++index).padStart(12,'0');
      h.whale.onEvent(key,sid,{type:'turn/start',data:{turn:'owner-natural-'+serial}});
      h.whale.onEvent(key,sid,{type:'tool/call',data:{name:'mcp__snowluma__qq_owner_group_send',callId:'owner-natural-'+serial,arguments:JSON.stringify(args)}});
      return fetch(base+'/api/socialV2/owner-group-send',{method:'POST',
        headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'b1c11111-1111-1111-1111-'+serial,'x-whale-tool':'qq_owner_group_send','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')},
        body:JSON.stringify(args)}).then(r=>r.json());
    }
    const before=h.calls.http.length;
    await h.handleIncoming('private',123,dm(1971,'别去群里发第一句嗨，然后说第二句晚安'),h.cfg);
    assert.equal((await call(1971)).ok,false);
    await h.handleIncoming('private',123,dm(1972,'鲸戒，能帮我去群里发“第一句嗨”，然后说“第二句晚安”吗'),h.cfg);
    assert.equal((await call(1971)).ok,false);
    assert.equal((await call(1972,['第二句晚安','第一句嗨'])).ok,false);
    const result=await call(1972);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal((await call(1972)).ok,false);
    assert.deepEqual(h.calls.http.slice(before).filter(r=>r.url.endsWith('/send_group_msg')).map(r=>r.body.message[0].data.text),lines);
    const atLines=['@全体成员','111','人呢😅'];
    await h.handleIncoming('private',123,dm(1981,'群里可以这样，过个一小时或者更久，就先单@全体成员，然后发“111”然后再发“人呢😅”这样的。'),h.cfg);
    assert.equal((await call(1981,atLines)).state,'not_sent');
    await h.handleIncoming('private',123,dm(1982,'我再发遍，你看看可不可以发了'),h.cfg);
    assert.equal((await call(1981,atLines)).state,'not_sent');
    await h.handleIncoming('private',123,dm(1983,'你现在就可以试试'),h.cfg);
    ownerDispatchFixture=(action)=>action==='get_msg' ? {status:'ok',retcode:0,data:{message_type:'group',group_id:456,message:[{type:'at',data:{qq:'all'}}]}} : null;
    try {
      const from=h.calls.http.length;
      const result=await call(1983,atLines);
      assert.equal(result.state,'sent',JSON.stringify(result));
      assert.equal((await call(1981,atLines)).state,'already_handled');
      assert.deepEqual(h.calls.http.slice(from).filter(r=>r.url.endsWith('/send_group_msg'))
        .map(r=>r.body.message[0].data.qq ?? r.body.message[0].data.text),['all','111','人呢😅']);
    } finally { ownerDispatchFixture=null; }
    await h.handleIncoming('private',123,dm(1984,'去群里发第一句嗨，然后说第二句晚安'),h.cfg);
    await h.handleIncoming('private',123,dm(1985,'先别发了'),h.cfg);
    await h.handleIncoming('private',123,dm(1986,'现在试试'),h.cfg);
    assert.equal((await call(1986)).state,'not_sent');
    for (const [offset, followUp] of ['去吧','那就去发吧','能帮我带过去吗？','麻烦把那句话发到群里吧','能帮我发一下吗'].entries()) {
      const id=1990+offset*2;
      const selected=['嗨'+offset];
      await h.handleIncoming('private',123,dm(id,'等我说可以了再去群里发“'+selected[0]+'”'),h.cfg);
      await h.handleIncoming('private',123,dm(id+1,followUp),h.cfg);
      const result=await call(id+1,selected);
      assert.equal(result.state,'sent',followUp+' '+JSON.stringify(result));
    }
    await h.handleIncoming('private',123,dm(2020,'去群里发“先说这句”'),h.cfg);
    await h.handleIncoming('private',123,dm(2021,'我说的是你要不要去看视频'),h.cfg);
    await h.handleIncoming('private',123,dm(2022,'去吧'),h.cfg);
    assert.equal((await call(2022,['先说这句'])).state,'not_sent');
    // 2026-11-04 线上回归：主人说「你试试能不能发了」「发呀」时，旧规则不认作确认，群里一条都没发。
    const retryLines=['@全体成员','111','tmd人都死哪去了🐵💢'];
    await h.handleIncoming('private',123,dm(2030,'群里可以这样，你闲的发慌的时候，就先单@全体成员，然后发“111”然后再发“tmd人都死哪去了🐵💢”这样的。'),h.cfg);
    await h.handleIncoming('private',123,dm(2031,'你试试能不能发了'),h.cfg);
    ownerDispatchFixture=(action)=>action==='get_msg' ? {status:'ok',retcode:0,data:{message_type:'group',group_id:456,message:[{type:'at',data:{qq:'all'}}]}} : null;
    try {
      const from=h.calls.http.length;
      const result=await call(2031,retryLines);
      assert.equal(result.state,'sent',JSON.stringify(result));
      assert.deepEqual(h.calls.http.slice(from).filter(r=>r.url.endsWith('/send_group_msg'))
        .map(r=>r.body.message[0].data.qq ?? r.body.message[0].data.text),['all','111','tmd人都死哪去了🐵💢']);
    } finally { ownerDispatchFixture=null; }
    // 中间隔着「我刚群里戳你了」的「发呀」也要接上带原话的那条
    await h.handleIncoming('private',123,dm(2032,'等我说可以了再去群里发“又一句”'),h.cfg);
    await h.handleIncoming('private',123,dm(2033,'我刚群里戳你了'),h.cfg);
    await h.handleIncoming('private',123,dm(2034,'发呀'),h.cfg);
    {
      const from=h.calls.http.length;
      const result=await call(2034,['又一句']);
      assert.equal(result.state,'sent',JSON.stringify(result));
      assert.equal(h.calls.http.slice(from).filter(r=>r.url.endsWith('/send_group_msg')).length,1);
    }
  });
  await test('a bare group number opens the destination and its own turn can send to that group',async()=>{
    h.setReady(true);
    const key='private:123', destination='group:457';
    h.cfg.allow.groups.push('457');
    const st=h.getSocialV2State(key),sourceId=await h.ensureSession(key);
    st.recentMessages=[{userId:'123',plain:'私聊样本内容不得跨场',time:Date.now()}];
    const args={key,token:st.agentToken,target:'group',group:'457',video:'BV1ab2cd3ef4',intent:'speak',check:'111'};
    const requestId='11111111-1111-1111-1111-000000019100';
    const headers={'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':requestId,'x-whale-tool':'qq_switch_scene','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')};
    const call=()=>fetch(base+'/api/socialV2/scene-switch',{method:'POST',headers,body:JSON.stringify(args)}).then(r=>r.json());
    h.whale.onEvent(key,sourceId,{type:'turn/start',data:{turn:'scene-fixture'}});
    h.whale.onEvent(key,sourceId,{type:'tool/call',data:{name:'mcp__snowluma__qq_switch_scene',callId:'scene-fixture',arguments:JSON.stringify(args)}});
    const before=h.calls.prompts.length,sends=h.calls.sent.length;
    const result=await call();
    assert.equal(result.state,'accepted',JSON.stringify(result));
    assert.equal(result.intent,'speak');
    assert(result.hint.includes('发言尚未确认') && !result.hint.includes('111'));
    const prompt=h.calls.prompts.at(-1);
    assert.equal(h.calls.prompts.length,before+1);
    assert.notEqual(prompt.sessionId,sourceId);
    assert(JSON.stringify(prompt.content).includes('www.bilibili.com/video/BV1ab2cd3ef4'));
    assert(!JSON.stringify(prompt.content).includes('私聊样本内容不得跨场'));
    assert(JSON.stringify(prompt.content).includes('只发数字 111'));
    assert(JSON.stringify(prompt.content).includes('先用当前会话的 qq_send_message 实际发出'));
    assert(!JSON.stringify(prompt.content).includes('【首回复节奏】'));
    assert.equal(h.calls.sent.length,sends);
    assert.equal((await call()).ok,false);
    assert.equal(h.calls.prompts.length,before+1);
    const delivery=await send(['111'],{key:destination});
    assert.equal(delivery.ok,true,JSON.stringify(delivery));
    assert.equal(delivery.sent,1);
    const sent=h.calls.http.filter(entry=>entry.url.endsWith('/send_group_msg')).at(-1);
    assert.equal(String(sent.body.group_id),'457');
    assert(sent.body.message.some(segment=>segment.data.text==='111'));
  });
  await test('only the owner sees observed group activity and same-name speakers remain distinct',async()=>{
    const group = h.getSocialV2State('group:456');
    const previous = group.recentMessages;
    const at = SimDate.now();
    const owner = h.getSocialV2State('private:123');
    const snapshot = (key, token) => fetch(base+'/api/socialV2/snapshot?key='+key, {
      headers: {'x-console-token':'fixture-console-token', ...(token ? {'x-agent-token':token} : {})},
    });
    const view = async () => {
      const response = await snapshot('private:123', owner.agentToken);
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).groupActivity;
    };
    h.setSnowlumaHealth({connected:true});
    try {
      group.recentMessages = Array.from({length:8}, (_,i) => ({
        messageId: String(i+1), userId: ['333','456','123'][i%3], sender: '同名',
        isOwner: i === 6, plain: '群消息'+i, time: at-1000+i,
      }));
      const activity = await view();
      const observed = activity.groups.find(item => item.status === 'busy');
      assert.equal(observed.messages, 8);
      assert.deepEqual(observed.excerpts.map(m => [m.speaker,m.role]), [['同名','member'],['同名','member']]);
      assert.notEqual(observed.excerpts[0].person, observed.excerpts[1].person);
      group.recentMessages.at(-1).userId = '123';
      assert.equal((await view()).groups[0].excerpts.at(-1).role,'owner');
      const prompt = h.buildWakePromptV2('private:123','private');
      assert(prompt.includes('【已开放群近况 · 仅背景】') && prompt.includes('群消息7'));
      assert(!h.buildWakePromptV2('group:456','question').includes('【已开放群近况 · 仅背景】'));
      assert(!(await (await snapshot('group:456', group.agentToken)).json()).groupActivity);
      assert(!(await (await snapshot('private:123')).json()).groupActivity);
      // 2026-11-06（201/210 主人定）：任一会话的活令牌可以读写**已允许**的场景 —— 群令牌读主人私聊不再 403。
      assert.equal((await snapshot('private:123', group.agentToken)).status, 200);
      // 边界没放宽：不在允许清单里的场景、或不是真实智能体会话的令牌，照旧 403。
      assert.equal((await snapshot('group:999', group.agentToken)).status, 403);
      assert.equal((await snapshot('private:123', 'not-a-live-agent-token')).status, 403);
      for (const message of group.recentMessages) message.time -= 601000;
      assert.equal((await view()).groups[0].status,'quiet');
      h.setSnowlumaHealth({connected:false});
      const unknown = (await view()).groups[0];
      assert.equal(unknown.status,'unknown');
      assert.deepEqual(unknown.excerpts, []);
    } finally {
      group.recentMessages = previous;
      h.setSnowlumaHealth({connected:true});
    }
  });
  await test('QQ and Bili can enter each others actual session without handing over a message',async()=>{
    const key='private:123',st=h.getSocialV2State(key),sourceId=await h.ensureSession(key);
    const args={key,token:st.agentToken,target:'bili',intent:'speak',video:'https://www.bilibili.com/video/BV1ab2cd3ef4/'};
    h.whale.onEvent(key,sourceId,{type:'turn/start',data:{turn:'bili-scene'}});
    h.whale.onEvent(key,sourceId,{type:'tool/call',data:{name:'mcp__snowluma__qq_switch_scene',callId:'bili-scene',arguments:JSON.stringify(args)}});
    const headers={'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'11111111-1111-1111-1111-000000019101','x-whale-tool':'qq_switch_scene','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')};
    const toBili=await fetch(base+'/api/socialV2/scene-switch',{method:'POST',headers,body:JSON.stringify(args)}).then(r=>r.json());
    assert.equal(toBili.state,'pending',JSON.stringify(toBili));
    const dir=path.join(h.temp,'dsh','surfcore','memory');
    const offer=claimBiliSceneOffer(dir);
    assert.equal(offer.video,'BV1ab2cd3ef4');
    assert.equal(offer.intent,'speak');
    // 222：主人私信里带视频去 B站 开口，服务端一律升级成 @ 主人的分享便条（不靠模型传 atOwner）。
    assert.equal(offer.atOwner,true,JSON.stringify(offer));
    const biliPrompt=sceneSwitchPrompt('bili',offer.video,offer);
    assert(biliPrompt.includes('这条视频是要 @ 他来看的') && biliPrompt.includes('--share --auto --owner-ok'));
    assert(!biliPrompt.includes('想公开聊一句'));
    // 普通 speak 提示本身没被改坏（非主人私信 / look 仍走这条路）。
    const plainBili=sceneSwitchPrompt('bili',offer.video,{intent:'speak'});
    assert(plainBili.includes('想公开聊一句') && !plainBili.includes('qq_send_message'));
    assert.equal(claimBiliSceneOffer(dir),null);
    h.cfg.allow.groups.push('458');
    const fromBili=(body,extra={})=>fetch(base+'/api/scene-switch-from-bili',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token',...extra},body:JSON.stringify(body)}).then(r=>r.json());
    assert.equal((await fromBili({target:'group'})).state,'choose');
    assert.equal((await fromBili({target:'group',group:459})).ok,false);
    assert.equal((await fromBili({target:'group',group:'group:458',video:'私信原话'})).ok,false);
    assert.equal((await fromBili({target:'group',group:'group:458',intent:'speak',check:'111'})).ok,false);
    assert.equal((await fromBili({target:'group',group:'group:458'},{'x-agent-token':st.agentToken})).ok,false);
    const before=h.calls.prompts.length;
    const switched=await fromBili({target:'group',group:'group:458'});
    assert.equal(switched.state,'accepted');
    assert.equal(switched.intent,'look');
    assert.equal(h.calls.prompts.length,before+1);
    assert(JSON.stringify(h.calls.prompts.at(-1).content).includes('你现在在当前 QQ 群'));
    assert(JSON.stringify(h.calls.prompts.at(-1).content).includes('再决定要不要开口'));
    h.cfg.allow.groups.push('460');
    const talk=await fromBili({target:'group',group:'460',intent:'speak'});
    assert.equal(talk.state,'accepted');
    assert.equal(talk.intent,'speak');
    assert(JSON.stringify(h.calls.prompts.at(-1).content).includes('先用当前会话的 qq_send_message 实际发出'));
  });
  await test('new real messages shown to the model renew the reply allowance, rereading cannot bypass it',async()=>{
    const key='private:123',st=h.getSocialV2State(key),saved=h.cfg.socialV2.tokenGuard.enabled;
    h.cfg.socialV2.tokenGuard.enabled=true;h.cfg.socialV2.tokenGuard.maxOutboundPerTurn=8;
    const m={messageId:'99001',seq:99001,userId:'123',time:Date.now(),plain:'还在吗'};st.unread=[m];st.tokenTurnSent=8;
    h.noteModelMessagesV2(st,[m],key);assert.equal(h.tokenGuardSendBlock(key,st,1),null);st.tokenTurnSent=8;
    h.noteModelMessagesV2(st,[m],key);assert.equal(h.tokenGuardSendBlock(key,st,1).remaining,0);
    h.noteModelMessagesV2(st,[{...m,messageId:'99002',seq:99002}],key);assert.equal(h.tokenGuardSendBlock(key,st,1),null);
    h.cfg.socialV2.tokenGuard.enabled=saved;
  });
  await test('actual authenticated image endpoint returns prepared preview and refuses wrong conversation tokens',async()=>{
    h.setImageInputSupport(true);
    const key='group:456',st=h.getSocialV2State(key);await h.handleIncoming('group',456,event(99003,123,'图',[{type:'image',data:{file:'preview.png'}}]),h.cfg);
    const route=base+'/api/images/message?key='+encodeURIComponent(key)+'&messageId=99003&preview=chat';
    const bad=await fetch(route,{headers:{'x-console-token':'fixture-console-token','x-agent-token':'wrong'}});assert.equal(bad.status,403);
    const r=await fetch(route,{headers:{'x-console-token':'fixture-console-token','x-agent-token':st.agentToken}}),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.images[0].previewPolicy,207,JSON.stringify(body));assert(Buffer.byteLength(body.images[0].data,'base64')<=12288);
  });
  await test('automatic rotation persists and schedules a fresh unanswered request; ordinary retirement does not',async()=>{
    const key='private:123',st=h.getSocialV2State(key),m={messageId:'99004',seq:99004,userId:'123',time:Date.now()+1000,plain:'继续刚刚那件事'};
    await h.ensureSession(key);st.lastAiReplyAt=0;st.recentMessages=[m];st.unread=[m];h.retireSession(key,{continuePending:true});assert.equal(st.pendingReply207.messageId,'99004');assert(st.replyResumeTimer207);assert(!h.state.sessions[key]);
    const stored=JSON.parse(fs.readFileSync(path.join(h.temp,'state/social-v2.json')));assert.equal(stored.conversations[key].pendingReply207.messageId,'99004');
    await new Promise(resolve=>setTimeout(resolve,1700));assert.equal(st.pendingReply207.attempts,1);assert(st.pendingWakeTimer);
    await h.ensureSession(key);h.retireSession(key);assert.equal(st.pendingReply207,null);assert.equal(st.replyResumeTimer207,null);
  });
  await test('enabled language reference reaches both actual QQ prompt paths without changing the persona file',async()=>{
    const home=path.join(h.temp,'state/whale-language'),pack=readJson(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../compat/language-pack.json'));
    atomicJson(path.join(home,'active-pack.json'),pack);atomicJson(path.join(home,'settings.json'),{enabled:true});invalidateLanguageCache();
    const personaFile=path.join(h.temp,'fixture-persona.md'),persona='身份与性格：原有测试人格，喜欢自己的兴趣。';fs.writeFileSync(personaFile,persona);h.cfg.whaleCompat.personaFile=personaFile;
    for(const key of ['group:456','private:123'])assert(h.currentRoleHintV2(key,'full').includes(pack.version));
    assert.equal(fs.readFileSync(personaFile,'utf8'),persona);
    assert.equal(h.whale.status().healthy,true);
  });
  await test('enabled language guard records a confirmed send and blocks a new near-copy before transport',async()=>{
    const first=await send(['刚准备收拾桌子结果外卖已经到了'],{key:'private:123'});assert.equal(first.ok,true,JSON.stringify(first));
    const before=h.calls.http.filter(r=>r.url.endsWith('/send_private_msg')).length,uncertain=h.whale.status().uncertain;
    const second=await send(['刚准备收拾桌子，结果外卖已经到了！'],{key:'private:123'});assert.equal(second.ok,false,JSON.stringify(second));
    assert(JSON.stringify(second).includes('近期表达'),JSON.stringify(second));
    assert.equal(h.calls.http.filter(r=>r.url.endsWith('/send_private_msg')).length,before);
    assert.equal(h.whale.status().uncertain,uncertain);
  });
  await test('disabling language enhancement restores literal sending without touching durable delivery guards',async()=>{
    atomicJson(path.join(h.temp,'state/whale-language/settings.json'),{enabled:false});invalidateLanguageCache();
    const r=await send(['刚准备收拾桌子，结果外卖已经到了！'],{key:'private:123'});assert.equal(r.ok,true,JSON.stringify(r));
    assert(h.whale.status().healthy);
  });
  console.log('PASS_ALL ' + passed);
} finally {await new Promise(r=>server.close(r)); await h.close();assert.equal(path.dirname(legacyDir),path.resolve(os.tmpdir()));fs.rmSync(legacyDir,{recursive:true});}
