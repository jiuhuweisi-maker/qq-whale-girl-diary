function replaceOnce(source,before,after) {
  if(source.split(before).length!==2)throw Error('FundPilot/recovery overlay anchor drift');
  return source.replace(before,after);
}
export function patchFundBridge(source) {
  source=replaceOnce(source,"import { createWhaleRuntime } from '../whale-compat/runtime.mjs';","import { createWhaleRuntime } from '../whale-compat/runtime.mjs';\nimport { createFundPilot } from '../whale-compat/fundpilot.mjs';\nimport { recordSessionResult,reserveGenerationRetry } from '../whale-compat/session-recovery.mjs';\nimport {scopedToolGuide,qqPersona,conversationFocus} from '../whale-compat/conversation-logic.mjs';");
  source=replaceOnce(source,"    const antiAiLine = '【反AI味】你不是客服：不用有求必应，可以装傻、已读乱回、拒绝推荐；少用“一绝/真管用/保证/绝对”这类词。\\n\\n';","    const antiAiLine = '【相处】自然、可爱、有自己的想法，认真提问就认真接；吐槽和玩笑按关系与语境来，普通昵称、拍一拍不代表挑衅。\\n\\n'+conversationFocus(getSocialV2State(key).recentMessages,getSocialV2State(key).lastAiReplyAt)+'\\n\\n';");
  source=replaceOnce(source,'  function roleRawContent() {','  function roleRawContent(conversationKey = \'\') {');
  source=replaceOnce(source,"return [fs.readFileSync(cfg.whaleCompat.personaFile, 'utf8'), fs.readFileSync(cfg.whaleCompat.styleFile, 'utf8'), fs.readFileSync(path.join(ROOT, 'whale-compat/TOOL-GUIDE.md'), 'utf8')].join('\\n\\n');","return [qqPersona(fs.readFileSync(cfg.whaleCompat.personaFile, 'utf8')), fs.readFileSync(cfg.whaleCompat.styleFile, 'utf8')].join('\\n\\n');");
  source=replaceOnce(source,'const selected = selectRoleText(roleRawContent(), mode);','const selected = selectRoleText(roleRawContent(conversationKey), mode);');
  source=replaceOnce(source,"return [base, adminBlock, biliBrief, memoryBlock].filter(Boolean).join('\\n\\n');","const guide = cfg.whaleCompat.personaFile ? scopedToolGuide(fs.readFileSync(path.join(ROOT,'whale-compat/TOOL-GUIDE.md'),'utf8'),conversationKey,cfg.ownerQQ) : '';\n    return [base, guide, adminBlock, biliBrief, memoryBlock].filter(Boolean).join('\\n\\n');");
  source=replaceOnce(source,"import {scopedToolGuide,qqPersona,conversationFocus} from '../whale-compat/conversation-logic.mjs';","import {scopedToolGuide,qqPersona,conversationFocus} from '../whale-compat/conversation-logic.mjs';\nimport {relationshipBlock} from '../whale-compat/relationships.mjs';");
  source=replaceOnce(source,"return [base, guide, adminBlock, biliBrief, memoryBlock].filter(Boolean).join('\\n\\n');","const people=relationshipBlock(cfg.whaleCompat.relationshipFile,{key:conversationKey,ownerQQ:cfg.ownerQQ,allowedGroups:cfg.allow.groups,messages:getSocialV2State(conversationKey).recentMessages});\n    return [base, people, guide, adminBlock, biliBrief, memoryBlock].filter(Boolean).join('\\n\\n');");
  source=replaceOnce(source,"import {scopedToolGuide,qqPersona,conversationFocus} from '../whale-compat/conversation-logic.mjs';","import {scopedToolGuide,qqPersona,conversationFocus,withConversationFocus} from '../whale-compat/conversation-logic.mjs';");
  source=replaceOnce(source,'      const sendJson = (obj, status = 200) => {',`      const sendJson = (obj, status = 200) => {
        if (status === 200 && typeof obj?.key === 'string' && isSessionAllowedInCurrentMode(obj.key)) obj=withConversationFocus(obj,getSocialV2State(obj.key).lastAiReplyAt);`);
  source=replaceOnce(source,' + adminLine + biliLine + memoryCardLine + tokenLine',' + (biliRecall ? biliRecall + \'\\n\\n\' : \'\') + tokenLine');
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
                const retry=reserveGenerationRetry(whale.ledger,{key,reason:ended.reason,messages:getSocialV2State(key).unread,lastReplyAt:getSocialV2State(key).lastAiReplyAt,pendingSend:!!pendingSendToolCalls.get(frame.sessionId)?.size});
                pendingWakeKeys.delete(key);disarmPendingWakeLease(key);wakeConfigMissCount.delete(key);
                v2TurnStartAt.delete(frame.sessionId);turnLeaseNoted.delete(frame.sessionId);sendToolSucceededSessions.delete(frame.sessionId);pendingSendToolCalls.delete(frame.sessionId);toolCallNames.delete(frame.sessionId);
                log('会话生成未完成（仅记内部，不向QQ贴错误）：'+String(ended.reason.error?.code||'unknown'));
                if(rotate) {retireSession(key);log('同一会话连续请求无效，保留旧档并等待新消息建立新会话');}
                if(retry)setTimeout(()=>{if(!whale.quiet(key)&&!socialV2.paused)scheduleWakeV2(key,key.startsWith('private:')?'private':'question');},1500).unref();
                continue;
              }`);
  return source;
}
export function patchFundMcp(source) {
  const at=source.lastIndexOf('await server.connect(');if(at<0)throw Error('MCP connect anchor drift');
  const code=`
server.tool('qq_fundpilot','主人私信里的基金助手：resolve按名称或简称核对基金；learning查已保存的金融学习笔记；study通过既有B站插件搜索或读取BV字幕；note保存带实际字幕引文的笔记。也可查行情持仓、按当前原消息模拟买卖或盯盘。认得基金不等于模拟盘支持。歧义先确认。全部虚拟资金，不能真实下单。',{
  key:z.string(),token:z.string(),action:z.enum(['status','market','journal','order','halt','watch','unwatch','resolve','learning','study','note']),query:z.string().max(160).optional(),note:z.object({summary:z.string().max(1200),topic:z.string().optional(),citations:z.array(z.object({from:z.number(),quote:z.string().max(100)})).max(4)}).optional(),messageId:z.union([z.string(),z.number()]).optional()
},async args=>{try{const result=await agentApi('/api/socialV2/fundpilot',{method:'POST',headers:{'x-agent-token':args.token},body:JSON.stringify(args)});return {content:[{type:'text',text:serializeModelData(result)}]};}catch(error){return {isError:true,content:[{type:'text',text:'这次没有确认操作完成。先查模拟账户的状态和记录，别换个说法重复下单。'+(String(error?.message||'').includes('收盘')?'现在收盘了。':'')}]};}});
`;
  return source.slice(0,at)+code+'\n'+source.slice(at);
}
