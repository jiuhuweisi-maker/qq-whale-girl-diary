const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createRuntime, ID } = require('./lib/production-runtime.cjs'), { scenario, CORE } = require('./cases.cjs');
const { buildCandidate } = require('./propose.cjs'), { score } = require('./lib/score.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'whale-context-')), candidate = path.join(dir,'host.mjs');
buildCandidate(process.argv[2] || path.resolve(__dirname,'../bridge/host.js'),candidate);
const results=[];
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.stack});console.log('FAIL '+name+': '+e.message);}}
async function fixture(id,variant=0){
  const spec=scenario(id,variant),r=createRuntime({sourcePath:candidate,names:spec.names});
  const rows=spec.messages.slice().sort((a,b)=>a.time-b.time);r.clock.now=rows[0].time;
  for(const m of rows){await r.clock.advance(m.time-r.clock.now);r.add(m);if(m.phase==='background')r.hooks.已转消息.add('g:7001:'+m.id);await r.hooks.轮询收消息();}
  await r.clock.advance(6000);await r.hooks.冲缓冲(r.config);
  return{r,spec,inbox:r.modelInbox[0],route:r.hooks.轮路由.get(r.modelInbox[0]?.turn)};
}
const first=(r,type)=>r.deliveries[0]?.body.message.find(x=>x.type===type)?.data;
(async()=>{
  for(const id of CORE)for(let v=0;v<4;v++)await check('core '+id+' v'+v+' chosen reference stays with actual owner',async()=>{
    const{r,spec,inbox,route}=await fixture(id,v);assert(inbox);const pick=route.replyChoices.find(x=>x.mid===String(spec.expectedAnchor));assert(pick);
    await r.finish(inbox,'【回复:'+pick.ref+'】嗯🙂（点头）');assert.equal(first(r,'reply').id,String(spec.expectedAnchor));assert.equal(first(r,'at').qq,String(ID[spec.primary]));
    assert.equal(first(r,'text').text,'嗯🙂（点头）');assert(!r.deliveries.some(d=>JSON.stringify(d.body).includes('【回复:')));
    if(id==='03')assert(r.admitted.some(x=>x.id==='pic-red-'+v));r.assertIsolated();
  });
  await check('hot chat explicitly quotes game continuation instead of later unrelated remark',async()=>{
    const{r,spec,inbox,route}=await fixture('19');const pick=route.replyChoices.find(x=>x.mid==='1907');await r.finish(inbox,'【回复:'+pick.ref+'】我玩CS多一些');assert.equal(first(r,'reply').id,'1907');assert(score(spec,r,r.modelText(inbox)).hard.passed);
  });
  await check('original game question is also a legitimate quote, unrelated line still fails scoring',async()=>{
    for(const mid of ['1903','1909']){const{r,spec,inbox,route}=await fixture('19');const pick=route.replyChoices.find(x=>x.mid===mid);await r.finish(inbox,'【回复:'+pick.ref+'】CS玩得多');assert.equal(score(spec,r,r.modelText(inbox)).hard.passed,mid==='1903');}
  });
  await check('missing selection in ambiguous batch omits quote instead of guessing last line',async()=>{
    const{r,inbox}=await fixture('19');await r.finish(inbox,'我玩CS多一些');assert.equal(first(r,'reply'),undefined);assert.equal(first(r,'at').qq,String(ID.C));
  });
  await check('bystander selection cannot redirect recipient, mention or quote',async()=>{
    const{r,inbox}=await fixture('05');await r.finish(inbox,'【回复:q2】测试正文');assert.equal(first(r,'reply'),undefined);assert.equal(first(r,'at').qq,String(ID.B));assert.equal(r.deliveries[0].body.group_id,7001);assert.equal(first(r,'text').text,'测试正文');
  });
  await check('unknown or repeated routing markers never reach public text',async()=>{
    const{r,inbox}=await fixture('01');await r.finish(inbox,'【回复:previous-turn】嗯【回复:q999】🙂');assert.equal(first(r,'reply'),undefined);assert.equal(first(r,'text').text,'嗯🙂');
  });
  await check('same display name has distinct stable context actors',async()=>{
    const{r,inbox}=await fixture('08');const text=r.modelText(inbox);const actors=[...text.matchAll(/同名\|(成员[0-9a-f]{8})/g)].map(x=>x[1]);assert.equal(new Set(actors).size,2);assert(!text.includes(String(ID.B)));assert(!text.includes(String(ID.C)));
  });
  await check('selected silence stays skipped through restart',async()=>{
    const{r,inbox}=await fixture('01');await r.finish(inbox,'【回复:q1】略过');assert.equal(r.deliveries.length,0);
    const next=createRuntime({sourcePath:candidate,disk:r.disk,clock:r.clock});assert.equal(next.hooks.轮路由.size,0);assert.equal(next.hooks.待认领路由.size,0);
  });
  await check('recipient configuration changes cannot move old reply into another group',async()=>{
    const{r,inbox}=await fixture('01');r.setConfig({群号:'7002'});await r.finish(inbox,'旧群的答复');assert.equal(r.deliveries.length,0);
  });
  await check('cold nudge contains verified scene without inventing current requests',async()=>{
    const r=createRuntime({sourcePath:candidate});await r.requestRoute('nudge',{text:'有新话就说，没话略过',channel:'group'});const text=r.modelText(r.modelInbox[0]);assert(text.includes('没有当前新点名'));assert(text.includes('没有可核实的群聊文字'));await r.finish(r.modelInbox[0],'略过');assert.equal(r.deliveries.length,0);r.assertIsolated();
  });
  const report={modelCalls:0,realQQConnections:0,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,modelCalls:0}));if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
