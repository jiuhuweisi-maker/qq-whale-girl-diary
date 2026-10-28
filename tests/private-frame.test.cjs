const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRuntime,ID}=require('../simulator/lib/production-runtime.cjs');
const sourcePath=process.argv[2]||path.resolve(__dirname,'../bridge/host.js');
let passed=0,failed=0;const results=[];
async function check(name,fn){try{await fn();passed++;results.push({name,ok:true});console.log('PASS '+name);}catch(e){failed++;results.push({name,ok:false,error:e.message});console.log('FAIL '+name+': '+e.message);}}
async function receive(rows,channel='private',style=''){
 const r=createRuntime({sourcePath,style});
 for(let i=0;i<rows.length;i++){const row=typeof rows[i]==='string'?{text:rows[i]}:rows[i];r.add({id:710+i,sender:'A',time:r.clock.now+i,text:'',at:channel==='group'?['W']:[],replyTo:null,images:[],channel,...row});}
 await r.clock.advance(100);await r.clock.settle(r.hooks.轮询收消息());await r.clock.advance(7000);await r.clock.settle(r.hooks.冲缓冲(r.config));r.assertIsolated();return r;
}
const sends=r=>r.deliveries.flatMap(d=>d.body.message);
(async()=>{
 await check('private trailing emoji never becomes an automatic quote for the full batch',async()=>{const r=await receive(['饭已经做好了，你觉得先吃哪个？','🐵💢']);await r.finish(r.modelInbox[0],'先吃热的那个🙂');assert(!sends(r).some(x=>x.type==='reply'&&x.data.id==='711'));});
 await check('private batch preserves message boundaries with individually selectable real text',async()=>{const r=await receive(['我问的是那个蓝色杯子','不是桌子','😤']);const c=r.modelText(r.modelInbox[0]);assert(c.includes('|q1】'));assert(c.includes('|q2】'));assert(c.includes('|q3】'));const route=r.hooks.轮路由.get(r.modelInbox[0].turn);assert.deepEqual(Array.from(route.replyChoices,x=>x.mid),['710','711']);});
 await check('private selected substantive quote survives the real output path',async()=>{const r=await receive(['这张桌子怎么样','我问的是杯子','🐵']);await r.finish(r.modelInbox[0],'【回复:q2】杯子颜色挺好看的（点头）');assert(sends(r).some(x=>x.type==='reply'&&x.data.id==='711'));assert(!sends(r).some(x=>x.type==='text'&&x.data.text.includes('回复:q')));});
 await check('private forged quote and emoji quote are both removed',async()=>{for(const marker of ['q3','q999']){const r=await receive(['刚才问的杯子','我喜欢蓝色','🐵']);await r.finish(r.modelInbox[0],'【回复:'+marker+'】蓝色确实不错');assert(!sends(r).some(x=>x.type==='reply'));}});
 await check('private multi-message reply without a selection does not guess an anchor',async()=>{const r=await receive(['杯子好看吗','蓝色还是红色']);await r.finish(r.modelInbox[0],'蓝色吧');assert(!sends(r).some(x=>x.type==='reply'));});
 await check('single message keeps its original route',async()=>{const r=await receive(['我买了蓝色杯子']);const route=r.hooks.轮路由.get(r.modelInbox[0].turn);assert.equal(route.mid,'710');assert.equal(route.话,ID.A);assert.equal(route.来路,'private');});
 await check('emoji-only single message remains visible and answerable',async()=>{const r=await receive(['🐵💢']);assert(r.modelText(r.modelInbox[0]).includes('🐵💢'));assert.equal(r.hooks.轮路由.get(r.modelInbox[0].turn).mid,'710');});
 await check('native QQ face after text cannot steal the automatic quote',async()=>{const r=await receive(['你觉得这个名字怎么样',{segments:[{type:'face',data:{id:14}}]}]);await r.finish(r.modelInbox[0],'这名字挺可爱');assert(!sends(r).some(x=>x.type==='reply'&&x.data.id==='711'));});
 await check('image messages remain eligible substantive choices',async()=>{const r=await receive([{images:[{id:'new-image',description:'蓝色杯子'}]},{text:'这张怎么样'}]);const route=r.hooks.轮路由.get(r.modelInbox[0].turn);assert.equal(route.replyChoices.length,2);assert.equal(r.admitted.length,1);});
 await check('inherited image context cannot make a later emoji a new quote target',async()=>{const r=await receive([{images:[{id:'old-image',description:'蓝色杯子'}]},'🐵']);const route=r.hooks.轮路由.get(r.modelInbox[0].turn);assert.deepEqual(Array.from(route.replyChoices,x=>x.mid),['710']);});
 await check('file messages keep their own attachment identity and quote choice',async()=>{const r=await receive([{segments:[{type:'file',data:{name:'menu.md',file_id:'offline-file'}}]},'看看这个文件']);const route=r.hooks.轮路由.get(r.modelInbox[0].turn);assert.equal(route.replyChoices.length,2);assert(r.modelText(r.modelInbox[0]).includes('menu.md'));});
 await check('restarting a buffered batch preserves substantive quote eligibility',async()=>{const r=createRuntime({sourcePath});r.add({id:710,sender:'A',time:r.clock.now,text:'今天买哪个杯子',channel:'private'});r.add({id:711,sender:'A',time:r.clock.now,text:'🐵',channel:'private'});await r.clock.settle(r.hooks.轮询收消息());const resumed=createRuntime({sourcePath,disk:r.disk,clock:r.clock});await resumed.clock.advance(7000);await resumed.clock.settle(resumed.hooks.冲缓冲(resumed.config));const route=resumed.hooks.轮路由.get(resumed.modelInbox[0].turn);assert.deepEqual(Array.from(route.replyChoices,x=>x.mid),['710']);assert.equal(route.mid,'');resumed.assertIsolated();});
 for(const channel of ['private','group']){
  await check(channel+' speech request distinguishes requested speaker from current user',async()=>{const r=await receive(['你可以说：我今天要第一个吃饭'],channel);assert(r.modelText(r.modelInbox[0]).includes('台词里的“我”'));});
  await check(channel+' correction of speech attribution is scoped to the present request',async()=>{const r=await receive(['我的意思是，让你说后面那句话'],channel);assert(r.modelText(r.modelInbox[0]).includes('指定的说话者'));});
  await check(channel+' quoted third-party suggestion is not a live speech request',async()=>{const r=await receive(['他刚才说“你可以说：我是第一名”，这句话什么意思？'],channel);assert(!r.modelText(r.modelInbox[0]).includes('台词里的“我”'));});
 }
 await check('clarification keeps precedence over speech assistance',async()=>{const r=await receive(['你说“我今天要第一个吃饭”是什么意思']);const s=r.modelText(r.modelInbox[0]);assert(s.includes('当前问的是你自己上一句话'));assert(!s.includes('台词里的“我”'));});
 await check('ordinary disagreement preserves tone without speech-request instructions',async()=>{const r=await receive(['我不喜欢这个杯子']);assert(!r.modelText(r.modelInbox[0]).includes('台词里的“我”'));});
 await check('quotes in private are still included verbatim inside a framed current message',async()=>{const r=await receive([{text:'你看错的是这句',replyTo:799},{text:'🐵'}]);assert(r.modelText(r.modelInbox[0]).includes('原文暂时取不到'));});
 await check('group and private same message IDs remain isolated',async()=>{const r=createRuntime({sourcePath});for(const channel of ['private','group'])r.add({id:710,sender:'A',time:r.clock.now,text:channel==='private'?'私信杯子':'群聊桌子',at:channel==='group'?['W']:[],channel});await r.clock.settle(r.hooks.轮询收消息());await r.clock.advance(7000);await r.clock.settle(r.hooks.冲缓冲(r.config));assert(r.modelText(r.modelInbox[0]).includes('私信杯子'));assert(!r.modelText(r.modelInbox[0]).includes('群聊桌子'));await r.finish(r.modelInbox[0],'蓝色杯子');assert(r.deliveries.every(d=>d.action==='send_private_msg'&&d.body.user_id===ID.A));r.assertIsolated();});
 if(process.env.WHALE_TEST_REPORT)fs.writeFileSync(process.env.WHALE_TEST_REPORT,JSON.stringify({passed,failed,results},null,2));
 console.log('PASS_ALL '+passed);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
