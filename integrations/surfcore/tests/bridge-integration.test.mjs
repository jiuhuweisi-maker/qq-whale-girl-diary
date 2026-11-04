// Run against the actual overlaid upstream bridge with fake DSH and OneBot peers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createWhaleRuntime } from '../compat/runtime.mjs';
import { renderConversationMemory } from '../compat/memory-scope.mjs';
import { createLegacyReader,journalFocus } from '../compat/legacy-reader.mjs';
import { createFundPilot } from '../compat/fundpilot.mjs';
import { recordSessionResult,reserveGenerationRetry } from '../compat/session-recovery.mjs';
import {scopedToolGuide,qqPersona,conversationFocus,withConversationFocus,groupActivityView} from '../compat/conversation-logic.mjs';
import {relationshipBlock} from '../compat/relationships.mjs';
import {composeConfirmedPersona,contextualFollowUp} from '../compat/expression-style.mjs';
import {proactiveDelay} from '../compat/proactive-clock.mjs';
import {legacyMedia} from '../compat/legacy-media.mjs';
import {interactiveOwnerMessage,ownerMessageGuard,privateRestHint,nightRestPlan} from '../compat/private-availability.mjs';
import {extractMentions} from '../compat/message-mentions.mjs';
import {bootstrapToolContext,backgroundPromptRefresh} from '../compat/context-economy.mjs';
import {appendJournal} from '../compat/personal-journal.mjs';
import {claimBiliSceneOffer} from '../compat/scene-switch.mjs';
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
const h = await bridgeHarness({ config: { whaleCompat: { cutover: Math.floor(Date.now()/1000)-1,stickerDir:legacyDir }, purpose: { enabled: false }, social: { enabled: false }, voice: { enabled: false }, biliBridge: { enabled: false }, socialV2: { enabled: true, tokenGuard: { enabled: false }, send: { maxPerMinute: 100, maxPerHour: 500 } } }, globals: {
  ...stickerSemantics,...contextSnapshot,extractMentions,bootstrapToolContext,backgroundPromptRefresh,Date:SimDate,safeFetchBuffer:async url=>{assert.equal(url,'https://public.invalid/sticker');return{buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=','base64')};},createWhaleRuntime: options => createWhaleRuntime({ ...options, now:()=>SimDate.now(), disk, log:(...a)=>{options.log?.(...a);if(String(a[0]).startsWith('持久消息账本'))console.error('[fixture-ledger]',...a);}, control: async () => structuredClone(control) }),
  createFundPilot:options=>createFundPilot({...options,disk,research:{read:async fund=>({code:fund.code,name:fund.name,unitNav:1.2,asOf:'2026-10-30',measurement:'published_unit_nav',isRealtimePrice:false})},request:async(route,data)=>({mode:'paper',liveTrading:false,cashFen:100000,...(data?{order:data}:{})})}),recordSessionResult,
  renderConversationMemory, createLegacyReader, journalFocus, cleanOutput, requestedLiterals, reserveGenerationRetry, scopedToolGuide,qqPersona,conversationFocus,withConversationFocus,groupActivityView,relationshipBlock,composeConfirmedPersona,contextualFollowUp,proactiveDelay,legacyMedia,interactiveOwnerMessage,ownerMessageGuard,privateRestHint,nightRestPlan,discoverDshSessionCookie: () => ''
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
    assert.equal(r.ok,true);assert.equal(r.results[0].senderId,'201');assert.equal(r.results.length,2);assert(!('entries'in r));
    const modelJson=serializeModelData(r);assert.equal(modelJson.split('排名验证约定本人').length-1,1);assert(!modelJson.includes('排名验证约定私密'));
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
      assert.equal((await snapshot('private:123', group.agentToken)).status, 403);
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
    const args={key,token:st.agentToken,target:'bili',video:'https://www.bilibili.com/video/BV1ab2cd3ef4/'};
    h.whale.onEvent(key,sourceId,{type:'turn/start',data:{turn:'bili-scene'}});
    h.whale.onEvent(key,sourceId,{type:'tool/call',data:{name:'mcp__snowluma__qq_switch_scene',callId:'bili-scene',arguments:JSON.stringify(args)}});
    const headers={'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken,'x-whale-request-id':'11111111-1111-1111-1111-000000019101','x-whale-tool':'qq_switch_scene','x-whale-args':Buffer.from(JSON.stringify(args)).toString('base64')};
    const toBili=await fetch(base+'/api/socialV2/scene-switch',{method:'POST',headers,body:JSON.stringify(args)}).then(r=>r.json());
    assert.equal(toBili.state,'pending',JSON.stringify(toBili));
    const dir=path.join(h.temp,'dsh','surfcore','memory');
    assert.equal(claimBiliSceneOffer(dir).video,'BV1ab2cd3ef4');
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
  });
  console.log('PASS_ALL ' + passed);
} finally {await new Promise(r=>server.close(r)); await h.close();assert.equal(path.dirname(legacyDir),path.resolve(os.tmpdir()));fs.rmSync(legacyDir,{recursive:true});}
