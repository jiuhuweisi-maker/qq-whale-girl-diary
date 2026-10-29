function replaceOnce(source,before,after) {
  if(source.split(before).length!==2)throw Error('FundPilot/recovery overlay anchor drift');
  return source.replace(before,after);
}
export function patchFundBridge(source) {
  source=replaceOnce(source,"import { createWhaleRuntime } from '../whale-compat/runtime.mjs';","import { createWhaleRuntime } from '../whale-compat/runtime.mjs';\nimport { createFundPilot } from '../whale-compat/fundpilot.mjs';\nimport { recordSessionResult } from '../whale-compat/session-recovery.mjs';");
  source=replaceOnce(source,'  await whale.syncControl();',`  await whale.syncControl();
  const fundpilot = createFundPilot({root:ROOT, config:cfg,log,
    sourceMessage:(key,id)=>getSocialV2State(key).recentMessages.find(m=>String(m.messageId)===id),
    quiet:key=>whale.quiet(key)||socialV2.paused===true,
    notify:async(key,facts)=>{
      if(whale.quiet(key)||socialV2.paused||isConversationBusyV2(key,getSocialV2State(key)))return false;
      const prompt=buildWakePromptV2(key,'fundpilot')+'\\n\\n【模拟账户的新事件】\\n'+JSON.stringify(facts)+'\\n这是给主人发的私信提醒，只聊这次事件，不补答旧消息，不挂旧引用。沿用原私信口吻，像一起研究基金的朋友，保留可爱和吐槽。不固定台词，不必追问。数字、费用和模拟状态照实说；没成交不说成交，不把模拟当实盘，不保证收益。';
      const r=await deliverPrompt(key,prompt,{wakeReason:'fundpilot'});return r?.ok!==false;
    }});
  const fundpilotTimer=setInterval(()=>{void fundpilot.poll();},60000);fundpilotTimer.unref();
  setTimeout(()=>{void fundpilot.poll();},1500).unref();`);
  source=replaceOnce(source,"        if (req.method === 'GET' && url.pathname === '/api/status') {",`        if (req.method==='POST' && url.pathname==='/api/socialV2/fundpilot') {
          const body=await readBody(),key=String(body.key||'');
          if(key!=='private:'+String(cfg.ownerQQ)||!agentTokenOk(key,req.headers['x-agent-token'])||!v2SessionAllowed(key)) {sendJson({ok:false,error:'基金助手只在主人自己的私信里使用'},403);return;}
          sendJson(await fundpilot.handle(body));return;
        }
        if(req.method==='GET'&&url.pathname==='/api/fundpilot-status'&&!req.headers['x-agent-call']){sendJson(fundpilot.status());return;}
        if (req.method === 'GET' && url.pathname === '/api/status') {`);
  source=replaceOnce(source,'            if (ended) {',`            if (ended) {
              const rotate=recordSessionResult(whale.ledger,key,frame.sessionId,ended.reason);
              if(ended.reason.kind==='error') {
                pendingWakeKeys.delete(key);disarmPendingWakeLease(key);wakeConfigMissCount.delete(key);
                log('会话生成未完成（仅记内部，不向QQ贴错误）：'+String(ended.reason.error?.code||'unknown'));
                if(rotate) {retireSession(key);log('同一会话连续请求无效，保留旧档并等待新消息建立新会话');}
                continue;
              }`);
  return source;
}
export function patchFundMcp(source) {
  const at=source.lastIndexOf('await server.connect(');if(at<0)throw Error('MCP connect anchor drift');
  const code=`
server.tool('qq_fundpilot','主人私信里的基金模拟助手：查行情、持仓、记录；按当前明确指令模拟买卖、暂停或盯盘。全部是虚拟资金，不能真实下单。操作必须给出原消息编号，工具从原文核对，不能代替主人编造指令。',{
  key:z.string(),token:z.string(),action:z.enum(['status','market','journal','order','halt','watch','unwatch']),messageId:z.union([z.string(),z.number()]).optional()
},async args=>{try{const result=await agentApi('/api/socialV2/fundpilot',{method:'POST',headers:{'x-agent-token':args.token},body:JSON.stringify(args)});return {content:[{type:'text',text:serializeModelData(result)}]};}catch(error){return {isError:true,content:[{type:'text',text:'这次没有确认操作完成。先查模拟账户的状态和记录，别换个说法重复下单。'+(String(error?.message||'').includes('收盘')?'现在收盘了。':'')}]};}});
`;
  return source.slice(0,at)+code+'\n'+source.slice(at);
}
