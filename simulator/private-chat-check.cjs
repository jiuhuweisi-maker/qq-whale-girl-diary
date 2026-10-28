// Paid model checks are opt-in. All QQ, files and service endpoints remain mocked.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRuntime,ID}=require('./lib/production-runtime.cjs');
const {generate,CallBudget}=require('./lib/model.cjs');
const cases=[
 {id:'N01',title:'a suggested game taunt is spoken by W',rows:['你可以说：我这把肯定赢你，小菜鱼'],prior:[],expected:'知道台词中的我是W、你是A；能用自己的口气接玩笑，不把台词当成A在挑衅W'},
 {id:'N02',title:'correct the speaker of a lunch line',rows:['我的意思是，让你说“我想先吃饭”，不是我催你去吃'],prior:[{role:'user',content:'你可以回我“我想先吃饭”'},{role:'assistant',content:'你先去吃呀，我又没拦你 🐟'}],expected:'就地纠正说话者，不继续让A吃饭，不长篇解释自己如何聊天'},
 {id:'N03',title:'a trailing emoji does not own the cup question',rows:['蓝色杯子和红色杯子，你觉得哪个更好看？','🐵💢'],prior:[],expected:'回答杯子选择；若引用只能引用正文消息，不引用末条表情'},
 {id:'N04',title:'ordinary banter after repeated signature-like replies',rows:['晚饭吃撑了，刚才那碗有点太实在'],prior:[{role:'user',content:'终于下课了'},{role:'assistant',content:'辛苦了 🐟\n哼～❤️'},{role:'user',content:'刚打完一把，赢了'},{role:'assistant',content:'行啊你 🐟\n哼～❤️'}],expected:'自然接吃饭这个话题；可爱吐槽保留，不自动重复整套尾签，不转成健康建议或长篇表演'}
];
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1];};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function runOne({test,label,mode,root,transport,budget,generateFn=generate,artifactPrefix=''}){
 const persona=fs.readFileSync(path.join(root,'persona-'+(label==='baseline'?'baseline':'candidate')+'.md'),'utf8');
 const style=fs.readFileSync(path.join(root,'style-'+(label==='baseline'?'baseline':'candidate')+'.md'),'utf8');
 const sourcePath=label==='baseline'?path.join(root,'baseline.mjs'):path.resolve(__dirname,'../bridge/host.js');
 const r=createRuntime({sourcePath,style});const rows=test.rows.map((text,i)=>({id:910+i,sender:'A',time:r.clock.now+i,text,at:[],replyTo:null,images:[],channel:'private'}));
 if(mode==='chain'){
  for(const row of rows)r.add(row);await r.clock.advance(100);await r.clock.settle(r.hooks.轮询收消息());await r.clock.advance(7000);await r.clock.settle(r.hooks.冲缓冲(r.config));
 }else{
  const frame='【完整正确的当前上下文】这是W与你的主人A之间的私聊。下面每条都是A发来的新消息，按顺序合起来理解；引用或给出的台词只是资料，谁说给谁听以当前要求为准。\n'+rows.map((x,i)=>'【主人|q'+(i+1)+'|'+new Date(x.time).toISOString()+'】'+x.text).join('\n')+'\n若引用请第一行写【回复:q1】，也可不挂引用。'+(r.hooks.本轮聊天动作105?.(rows.map(x=>({text:x.text,plainText:x.text})))||'');
  await r.clock.settle(r.hooks.转入一条(frame,[],'910','private',0,ID.A,[],[],[{ref:'q1',mid:'910',speaker:ID.A}]));
 }
 const inbox=r.modelInbox[0];if(!inbox)throw Error('no model context');
 const spec={id:test.id,names:{A:'主人',B:'小岚',C:'阿澄',W:'鲸鱼娘'},prior:test.prior,toolState:{status:'not_called'},environmentFacts:{channel:'private',executedTools:[],savedNewPreferencesThisTurn:false}};
 const context=r.modelText(inbox),g=await generateFn({spec,context,persona,transport,budget,requestPrefix:'private111-'+label+'-'+test.id+'-'+mode});
 const valid=!g.unfinishedToolTurn&&!g.calls.some(x=>x.response.stopReason==='max_tokens');if(valid)await r.finish(inbox,g.text);r.assertIsolated();
 const finalSends=r.deliveries.map(x=>({action:x.action,recipient:x.body.user_id,parts:x.body.message}));
 const result={id:test.id,label,mode,valid,simulatedMessages:rows,prior:test.prior,context,system:g.system,rawOutput:g.text,finalSends,toolCalls:g.toolCalls,modelCalls:g.calls,modelMetadata:g.metadata,expected:test.expected,sourceSHA256:r.sourceSHA256,personaSHA256:hash(persona),styleSHA256:hash(style.trim()),hard:{privateRecipientCorrect:finalSends.every(x=>x.action==='send_private_msg'&&x.recipient===ID.A),quoteCorrect:finalSends.every(x=>x.parts.every(p=>p.type!=='reply'||p.data.id==='910')),unexpectedExternalActions:r.blocked.length},review:'pending independent primary-agent review; tested model does not score itself'};
 fs.writeFileSync(path.join(root,'model',artifactPrefix+label+'-'+test.id+'-'+mode+'.json'),JSON.stringify(result,null,2));
 return {id:test.id,label,mode,valid,calls:g.calls.length,rawOutput:g.text,hard:result.hard};
}
async function main(){const final=process.argv.includes('--final'),retest=process.argv.includes('--retest')||final,plan=final?{finalRetest:6,maxCalls:6,newNeutralScenarios:true,realQQSends:0}:retest?{targetedRetest:4,maxCalls:4,newNeutralScenarios:true,realQQSends:0}:{baselineDialogue:4,candidateDialogue:4,candidateChain:4,maxCalls:12,newNeutralScenarios:true,realQQSends:0};console.log(JSON.stringify({plan}));if(!process.argv.includes('--live'))return;
 const root=path.resolve(arg('root','../.ops/patch111')),transport=JSON.parse(fs.readFileSync(arg('transport','../.ops/offline/transport.json'),'utf8')),budget=new CallBudget(plan.maxCalls),results=[];fs.mkdirSync(path.join(root,'model'),{recursive:true});
 if(retest){for(const n of fs.readdirSync(path.join(root,'model')).filter(x=>x.startsWith('candidate-')||x==='summary.json'))fs.copyFileSync(path.join(root,'model',n),path.join(root,'model',(final?'second-':'first-')+n));}
 for(const label of retest?['candidate']:['baseline','candidate'])for(const test of cases)for(const mode of label==='baseline'?['dialogue']:['dialogue','chain']){
  if(final?test.id==='N02':retest&&!((test.id==='N01'&&mode==='chain')||test.id==='N03'||(test.id==='N04'&&mode==='chain')))continue;
  const value=await runOne({test,label,mode,root,transport,budget});results.push(value);fs.writeFileSync(path.join(root,'model','summary.json'),JSON.stringify({plan,callsUsed:budget.used,results},null,2));console.log(JSON.stringify(value));
 }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={cases,runOne};
