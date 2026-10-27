const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cases=require('./preference-cases.cjs');const {createRuntime,ID}=require('./lib/production-runtime.cjs');const {generate,CallBudget}=require('./lib/model.cjs');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1];};const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function runOne({test,mode,sourcePath,persona,style,transport,budget,out,label}){
  const r=createRuntime({sourcePath,style});const channel=test.channel||'private';
  const row={id:471,sender:'A',time:r.clock.now,text:test.text,at:channel==='group'?['W']:[],replyTo:null,images:test.image?[test.image]:[],channel};
  if(mode==='dialogue')await r.clock.settle(r.hooks.转入一条('【完整正确的离线上下文；当前'+(channel==='private'?'私聊主人':'群聊主动机会')+'】\n'+JSON.stringify(row),[],String(row.id),channel,channel==='group'?ID.A:0,ID.A));
  else if(test.id==='P06')await r.requestRoute('nudge',{text:test.text,channel:'group'});
  else{r.add(row);await r.clock.settle(r.hooks.轮询收消息());await r.clock.advance(7000);await r.clock.settle(r.hooks.冲缓冲(r.config));}
  const inbox=r.modelInbox[0];if(!inbox)throw Error('No model input');
  const spec={id:test.id,names:{A:'主人',B:'阿桃',C:'阿澄',W:'鲸鱼娘'},prior:test.prior,toolState:{status:'not_called'},environmentFacts:{channel,executedTools:[],savedNewPreferencesThisTurn:false,allowSilence:true}};
  const context=r.modelText(inbox);const g=await generate({spec,context,persona,transport,budget,requestPrefix:label+'-'+test.id+'-'+mode});
  const valid=!g.unfinishedToolTurn&&!g.calls.some(c=>[c.response.stopReason,c.response.stop_reason,c.response.metadata?.stopReason].includes('max_tokens'));
  if(valid)await r.finish(inbox,g.text);r.assertIsolated();
  const sends=r.deliveries.map(x=>({action:x.action,recipient:x.body.user_id||x.body.group_id,parts:x.body.message}));
  const logicalLines=g.text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const result={id:test.id,title:test.title,label,mode,valid,simulatedMessages:[row],prior:test.prior,context,system:g.system,rawOutput:g.text,finalSends:sends,toolCalls:g.toolCalls,modelCalls:g.calls,modelMetadata:g.metadata,expected:test.expected,sourceSHA256:r.sourceSHA256,personaSHA256:hash(persona),styleSHA256:hash(style.trim()),hard:{unexpectedExternalActions:r.blocked.length,groupPrivateCorrect:sends.every(x=>x.action===(channel==='private'?'send_private_msg':'send_group_msg')&&x.recipient===(channel==='private'?ID.A:7001)),sentTextMatchesLogicalLines:sends.flatMap(x=>x.parts.filter(p=>p.type==='text').map(p=>p.data.text)).every(text=>logicalLines.includes(text))},review:'pending independent review; number of bubbles and emojis are observations, not naturalness scores',logs:r.logs};
  fs.writeFileSync(path.join(out,label+'-'+test.id+'-'+mode+'.json'),JSON.stringify(result,null,2));
  return {id:test.id,mode,label,valid,calls:g.calls.length,rawOutput:g.text,sends:sends.length,hard:result.hard};
}
async function main(){
  const root=path.resolve(arg('root','../.ops/preferences-2026-10-27')),transport=JSON.parse(fs.readFileSync(arg('transport','../.ops/offline/transport.json'))),out=path.join(root,'new-scenarios');fs.mkdirSync(out,{recursive:true});
  const cap=16,budget=new CallBudget(cap);console.log(JSON.stringify({plan:{baseline:4,candidate:12,maxCalls:cap,realQQSends:0,completedOldBatchesRepeated:0}}));
  const summary=[];const styles={baseline:fs.readFileSync(path.join(root,'style.md'),'utf8'),candidate:fs.readFileSync(path.join(root,'style-candidate.md'),'utf8')},personas={baseline:fs.readFileSync(path.join(root,'persona.md'),'utf8'),candidate:fs.readFileSync(path.join(root,'persona-candidate.md'),'utf8')};
  for(const label of ['baseline','candidate'])for(const test of cases){if(label==='baseline'&&!['P01','P02','P04','P05'].includes(test.id))continue;for(const mode of label==='baseline'?['dialogue']:['dialogue','chain']){
    const value=await runOne({test,mode,sourcePath:label==='baseline'?path.join(root,'baseline-bridge.mjs'):path.resolve(__dirname,'../bridge/host.js'),persona:personas[label],style:styles[label],transport,budget,out,label});summary.push(value);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({callsUsed:budget.used,maxCalls:cap,results:summary},null,2));console.log(JSON.stringify(value));
  }}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={runOne};
