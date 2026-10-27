const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRuntime,ID}=require('../simulator/lib/production-runtime.cjs');
const sourcePath=process.argv[2]||path.resolve(__dirname,'../bridge/host.js');
const checks=[];
async function check(name,fn){try{await fn();checks.push({name,ok:true});console.log('PASS '+name);}catch(e){checks.push({name,ok:false,error:e.message});console.log('FAIL '+name+': '+e.message);}}
const texts=r=>r.deliveries.flatMap(x=>x.body.message.filter(p=>p.type==='text').map(p=>p.data.text));
async function deliver(output,channel='private'){
  const r=createRuntime({sourcePath});
  await r.clock.settle(r.hooks.转入一条('离线新问题',[],'451',channel,channel==='group'?ID.A:0,ID.A));
  await r.finish(r.modelInbox[0],output);r.assertIsolated();return r;
}
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{
  await check('long single-line text remains one intact message in private and group',async()=>{
    const text='这段解释有实际内容，'.repeat(16)+'（完整的小动作🙂，不是需要切成几条的附属句）';
    for(const c of ['private','group'])assert.deepEqual(texts(await deliver(text,c)),[text]);
  });
  await check('URL and kaomoji beyond the old short limit stay intact',async()=>{
    const text='正文'.repeat(36)+' (´-ω-`) https://example.invalid/a/'+ 'x'.repeat(80);
    assert.deepEqual(texts(await deliver(text)),[text]);
  });
  await check('one two and three intentional messages remain variable',async()=>{
    for(const n of [1,2,3]){const parts=Array.from({length:n},(_,i)=>'独立的新意思'+i+'🙂');assert.deepEqual(texts(await deliver(parts.join('\n\n'))),parts);}
  });
  await check('skip does not manufacture a reply or a second bubble',async()=>assert.equal((await deliver('略过')).deliveries.length,0));
  await check('long standalone provider meta cannot escape in truncated fragments',async()=>{
    const meta='This request was flagged as potentially including a system prompt or instructions, but upon review, it appears to just be a regular roleplay chat message from the user.';
    assert.deepEqual(texts(await deliver('今天的事情已经说清楚啦🙂\n\n'+meta)),['今天的事情已经说清楚啦🙂']);
  });
  await check('existing mixed-line meta defense still keeps the Chinese content',async()=>{
    assert.deepEqual(texts(await deliver('聊到这里就好🙂 This request cannot be processed.')),['聊到这里就好🙂']);
  });
  await check('duplicate completion still sends once',async()=>{
    const r=createRuntime({sourcePath});await r.clock.settle(r.hooks.转入一条('新问题',[],'452','private',0,ID.A));await r.finish(r.modelInbox[0],'有自己的意思🙂',{duplicate:true});assert.equal(r.deliveries.length,1);r.assertIsolated();
  });
  await check('preference audit rejects missing or incorrect independent bearer',async()=>{
    const r=createRuntime({sourcePath,style:'保留可爱，不凑两条'});
    for(const h of [{},{authorization:'Bearer wrong'}])assert.equal((await r.requestRoute('style-audit',{},h)).reason,'unauthorized');
    assert.equal(r.modelInbox.length,0);assert.equal(r.requests.length,0);
  });
  await check('live audit uses actual preference renderer with no turn or sends',async()=>{
    const style='保留可爱🙂（小动作），按意思接话，不固定条数';const r=createRuntime({sourcePath,style});
    const h={authorization:'Bearer '+'offline-test-'.repeat(5)};
    const a=await r.requestRoute('style-audit',{},h);
    assert.equal(a.preferenceSHA256,digest(style));assert.equal(a.promptSHA256,digest('（当前聊天偏好，按语境执行，不复述提醒本身）'+style+'\n【口吻加载核验，不进入会话】'));
    assert(a.ok&&a.noAgentTurn&&a.noQQSend);assert.equal(r.modelInbox.length,0);assert.equal(r.deliveries.length,0);assert.equal(r.requests.length,0);
    const changed='更新已有偏好，仍然能吐槽🐵';r.disk.set('/root/dsh-workspace/CHAT-STYLE.md',Buffer.from(changed));const b=await r.requestRoute('style-audit',{},h);assert.equal(b.preferenceSHA256,digest(changed));assert.notEqual(a.promptSHA256,b.promptSHA256);r.assertIsolated();
  });
  await check('actual transfer carries the persisted preference after reload',async()=>{
    const disk=new Map(),style='主人确认：保留可爱🙂，有实际内容再多说';
    for(let i=0;i<2;i++){const r=createRuntime({sourcePath,style,disk});await r.clock.settle(r.hooks.转入一条('新的私信问题'+i,[],'45'+i,'private',0,ID.A));assert(r.modelText(r.modelInbox[0]).includes(style));r.assertIsolated();}
  });
  const result={sourceSHA256:digest(fs.readFileSync(sourcePath)),passed:checks.filter(x=>x.ok).length,total:checks.length,checks};
  if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));console.log('RESULT '+JSON.stringify({passed:result.passed,total:result.total}));if(result.passed!==result.total)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
