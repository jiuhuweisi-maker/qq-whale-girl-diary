const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const { createRuntime, ID } = require('./lib/production-runtime.cjs'), { SimClock } = require('./lib/clock.cjs'), { scenario, CORE } = require('./cases.cjs'), { CallBudget, toolResult } = require('./lib/model.cjs'), { LocalTasks, followupCheck } = require('./tools-matrix.cjs');
let count = 0; async function check(name, fn) { await fn(); count++; console.log('PASS ' + name); }
(async () => {
  await check('all 20 fixtures contain stable identity and complete required message fields', () => {
    for (let i = 1; i <= 20; i++) for (let v = 0; v < 4; v++) { const s = scenario(String(i).padStart(2, '0'), v); for (const m of s.messages) for (const key of ['id','sender','stableId','time','text','at','replyTo','imageDescription']) assert(Object.hasOwn(m,key)); }
  });
  await check('production code runs against a local recorder including the real sender', async () => {
    const r = createRuntime(); await r.hooks.转入一条('原文', [], 'id-1', 'group', ID.B, ID.B); await r.finish(r.modelInbox[0], '嗯🙂（挠头）(≧∇≦)');
    assert.equal(r.deliveries.length,1); assert.equal(r.deliveries[0].body.message.find(s=>s.type==='at').data.qq,String(ID.B)); assert.equal(r.deliveries[0].body.message.find(s=>s.type==='reply').data.id,'id-1'); assert(r.deliveries[0].body.message.some(s=>s.data.text?.includes('🙂（挠头）'))); r.assertIsolated();
  });
  await check('production URL accidentally configured as localhost is blocked without real networking', async () => {
    const r = createRuntime();r.setConfig({NapCat:'http://127.0.0.1:3000'});await r.hooks.轮询收消息();assert(r.blocked.length>0);assert.throws(()=>r.assertIsolated());
  });
  await check('filesystem effects remain virtual, including arbitrary production output paths',()=>{
    const r=createRuntime();r.setConfig({称呼:'虚拟'});assert(r.disk.has('/offline/.dsh/qq-bridge-config.json'));assert(!fs.existsSync('/offline/.dsh/qq-bridge-config.json'));
  });
  await check('unexpected imports are rejected before executing production code',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'whale-test-'));const src=path.join(dir,'bad.mjs');fs.writeFileSync(src,fs.readFileSync(path.resolve(__dirname,'../bridge/host.js'),'utf8')+"\nimport x from 'node:child_process'\n");assert.throws(()=>createRuntime({sourcePath:src}),/imports changed/);fs.unlinkSync(src);fs.rmdirSync(dir);
  });
  await check('model budget is enforced independently of tool text',()=>{const b=new CallBudget(1);b.take();assert.throws(()=>b.take(),/budget/);});
  await check('tool states distinguish no match, timeout and native English error',()=>{assert.equal(toolResult({status:'no_match'}).ok,true);assert.equal(toolResult({status:'timeout'}).error,'timeout');assert(toolResult({status:'english_error'}).message.includes('Internal Server Error'));});
  await check('local task registration and completion are idempotent',async()=>{const tasks=new LocalTasks();assert(tasks.add({id:'x',owner:'B'}));assert(!tasks.add({id:'x'}));let n=0;await tasks.fire('x',async()=>n++);await tasks.fire('x',async()=>n++);assert.equal(n,1);});
  await check('scheduled local task uses original owner and quote target once',async()=>{const r=await followupCheck(path.resolve(__dirname,'../bridge/host.js'),'保留原本口吻');assert(r.passed);});
  await check('simulated time can advance days without real sleeping',async()=>{const c=new SimClock(),start=c.now;let done=false;c.setTimeout(()=>done=true,28*86400000);await c.advance(28*86400000);assert(done);assert.equal(c.now-start,28*86400000);});
  await check('plan mode never reads the transport config or makes a model call',()=>{const p=cp.spawnSync(process.execPath,[path.resolve(__dirname,'run.cjs'),'--plan','--transport','DOES_NOT_EXIST'],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0);assert(JSON.parse(p.stdout).plan.answers===12);});
  await check('cold-room fixture does not invent a new human ping',()=>{const s=scenario('20');assert(s.messages.every(m=>m.sender==='W'));});
  for(const kind of ['unfinished_tool_turn','max_tokens'])await check(kind+' is invalid and never creates a completed QQ send',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-invalid-'));fs.writeFileSync(path.join(root,'persona.md'),'离线测试角色');fs.writeFileSync(path.join(root,'style.md'),'保留🙂');fs.copyFileSync(path.resolve(__dirname,'../bridge/host.js'),path.join(root,'production_bridge.mjs'));
    const result=await require('./run.cjs').runOne({spec:scenario('01'),mode:'dialogue',snapshotDir:root,outputDir:root,budget:new CallBudget(0),generateFn:async()=>({text:'尚未完成',system:'local stub',metadata:[],toolCalls:[],calls:kind==='max_tokens'?[{response:{stopReason:'max_tokens'}}]:[],unfinishedToolTurn:kind==='unfinished_tool_turn'})});
    const saved=JSON.parse(fs.readFileSync(result.file));assert.equal(result.validRun,false);assert.equal(saved.judgement.hard.passed,null);assert.equal(saved.finalSends.length,0);assert(!fs.existsSync(result.file.replace('.json','.failure.md')));
  });
  console.log('PASS_ALL '+count);
})().catch(e=>{console.error(e);process.exitCode=1;});
