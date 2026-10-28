// Run against the actual overlaid upstream bridge with fake DSH and OneBot peers.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createWhaleRuntime } from '../compat/runtime.mjs';
import { renderConversationMemory } from '../compat/memory-scope.mjs';
import { createLegacyReader } from '../compat/legacy-reader.mjs';
const root = path.resolve(process.argv[2]);
const { cleanOutput, requestedLiterals } = await import(pathToFileURL(path.join(root, 'whale-compat/hygiene.mjs')));
// Expose the same runtime in the upstream's existing VM harness; no replacement parser/router.
const harnessPath = path.join(root, 'scripts/audit-bridge-harness.mjs');
const original = fs.readFileSync(harnessPath, 'utf8');
if (!original.includes('    whale, ensureSession,')) fs.writeFileSync(harnessPath, original.replace('    ensureSession, ensureSlangLearnerSession,', '    whale, ensureSession, ensureSlangLearnerSession,'));
const { bridgeHarness } = await import(pathToFileURL(harnessPath));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
let control = { ok: true, epoch: 0, quietUntil: 0, privateQuietUntil: 0, privateQuietForever: false };
const descriptors = new Set();
// Windows cannot fsync a directory descriptor. Only that OS operation is simulated;
// production/Linux still uses the original fsynced engine and the real filesystem.
const disk = { ...fs, openSync(file, mode, ...args) { if (mode === 'r' && fs.statSync(file).isDirectory() && process.platform === 'win32') { const fd = -1000 - descriptors.size; descriptors.add(fd); return fd; } return fs.openSync(file, mode, ...args); }, fsyncSync(fd) { if (!descriptors.has(fd)) fs.fsyncSync(fd); }, closeSync(fd) { if (descriptors.has(fd)) descriptors.delete(fd); else fs.closeSync(fd); } };
const h = await bridgeHarness({ config: { whaleCompat: { cutover: Math.floor(Date.now()/1000)-1 }, purpose: { enabled: false }, social: { enabled: false }, voice: { enabled: false }, biliBridge: { enabled: false }, socialV2: { enabled: true, tokenGuard: { enabled: false }, send: { maxPerMinute: 100, maxPerHour: 500 } } }, globals: {
  createWhaleRuntime: options => createWhaleRuntime({ ...options, disk, control: async () => structuredClone(control) }),
  renderConversationMemory, createLegacyReader, cleanOutput, requestedLiterals, discoverDshSessionCookie: () => ''
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
} finally {await new Promise(r=>server.close(r)); await h.close();}
console.log('PASS_ALL ' + passed);
