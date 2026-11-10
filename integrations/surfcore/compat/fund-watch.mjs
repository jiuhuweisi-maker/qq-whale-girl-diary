import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createDeliveryState} from './durable-state.cjs';
import {resolveFund} from './fund-catalog.mjs';

const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function count(value){
  if(/^\d+$/.test(value))return Number(value);
  const digits={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  if(value==='十')return 10;
  if(value.includes('十')){const [a,b]=value.split('十');return (digits[a]||1)*10+(digits[b]||0);}
  return digits[value]||0;
}
export function watchSettings(text) {
  const settings={},rules=[];
  const duration=/(?:持有|拿|放|看|观察|先拿|计划持有)?\s*(\d+|[一二三四五六七八九十两]+)(?:个)?(天|周|月|年)/.exec(text);
  if(duration){const days=count(duration[1])*({天:1,周:7,月:30,年:365}[duration[2]]);if(days>0&&days<=3650)settings.horizonDays=days;}
  if(/半年/.test(text))settings.horizonDays=180;
  const cost=/(?:成本(?:净值)?|买入净值|每份成本)\s*[是为:：]?\s*(\d+(?:\.\d{1,6})?)/.exec(text);
  if(cost&&Number(cost[1])>0)settings.costNav=Number(cost[1]);
  for(const m of text.matchAll(/净值\s*(低于|跌到|不高于|高于|涨到|不低于)\s*(\d+(?:\.\d{1,6})?)/g)){
    const value=Number(m[2]);if(value>0&&value<=10000)rules.push({type:['低于','跌到','不高于'].includes(m[1])?'navBelow':'navAbove',value});
  }
  for(const m of text.matchAll(/(?:从成本)?(?:跌|亏|亏损|涨|赚|盈利)(?:到|了|到达)?\s*(\d+(?:\.\d{1,2})?)\s*[%％]/g)){
    const value=Number(m[1]);if(value>0&&value<=1000)rules.push({type:/跌|亏/.test(m[0])?'costLossPct':'costGainPct',value});
  }
  if(rules.length)settings.rules=[...new Map(rules.map(r=>[JSON.stringify(r),r])).values()];
  return settings;
}
export function parseWatchMessage(raw) {
  const text=String(raw||'').trim().replace(/^(?:鲸戒[，, ]*)?(?:请\s*)?/,'');
  if(/^(?:如果|假如|假设|要是|不要|先不|先别|别帮我|不是|有人说|他说|她说)/u.test(text)||/不要提醒|别提醒|不提醒|不按|先不设/u.test(text))return null;
  const settings=watchSettings(text);
  let m=/^(?:我)?(?:准备|打算|想)(?:买入|购买|买|入手)\s*(.+)$/u.exec(text),phase,op='select';
  if(m)phase='planned';
  if(!m)m=/^(?:帮我|给我|替我)?(?:关注|盯着|盯一下|盯)\s*(.+)$/u.exec(text);
  if(!m){m=/^(?:我(?:已经)?(?:买了|买入了|持有了?)|已经(?:买了|买入了|持有了?)|买了|买入了)\s*(.+)$/u.exec(text);if(m)phase='held';}
  if(!m){m=/^(?:取消关注|停止关注|不用盯|别盯了|清仓了|卖完了)\s*(.+)$/u.exec(text);if(m)op='remove';}
  if(m){
    const query=m[1].split(/[，,。；;！!？?\n]/)[0].replace(/(?:帮我|你帮我|你给我|帮忙)(?:看看|查查|搜搜|搜一下|盯着|盯一下).*$/u,'').trim();
    if(!query||/^(?:哪个|什么|啥|基金|这只|这个|它)$/u.test(query))return {op:'configure',phase,settings};
    return {op,phase,query,settings};
  }
  if(Object.keys(settings).length&&/^(?:这只|这个|它|先|计划|持有|拿|成本|买入净值|净值|跌|涨|亏|赚|盈利)/u.test(text))return {op:'configure',settings};
  return null;
}
function readiness(plan){
  const missing=[];
  if(!plan.horizonDays)missing.push('持有期限');
  if(!plan.rules?.length)missing.push(plan.phase==='held'?'卖出/复查的提醒条件':'考虑买入的提醒条件');
  if(plan.rules?.some(r=>r.type.startsWith('cost'))&&!plan.costNav)missing.push('你记录的每份成本净值');
  if(plan.phase==='planned'&&plan.rules?.some(r=>r.type.startsWith('cost')))missing.push('尚未买入，先设买入观察条件；持有后再用成本涨跌条件');
  return missing;
}
export function evaluateWatchRules(plan,snapshot,now) {
  if(plan.status!=='watching'||snapshot?.unavailable||snapshot?.stale||snapshot?.isRealtimePrice!==false||!(snapshot.unitNav>0))return [];
  const events=[];
  for(const [index,rule] of (plan.rules||[]).entries()){
    const ratio=plan.costNav?(snapshot.unitNav/plan.costNav-1)*100:null;
    const hit=rule.type==='navBelow'?snapshot.unitNav<=rule.value:rule.type==='navAbove'?snapshot.unitNav>=rule.value:rule.type==='costLossPct'?ratio!==null&&ratio<=-rule.value:rule.type==='costGainPct'?ratio!==null&&ratio>=rule.value:false;
    if(hit)events.push({ruleId:String(index),condition:rule,observedNav:snapshot.unitNav,navChangeFromRecordedCostPct:ratio});
  }
  if(plan.phase==='held'&&plan.heldAt&&now>=plan.heldAt+plan.horizonDays*86400000)events.push({ruleId:'horizon',condition:{type:'holdingPeriodReview',days:plan.horizonDays}});
  return events;
}
export function createFundWatch({root,config,catalog,research,sourceMessage,notify,quiet=()=>false,now=Date.now,disk=fs,log=()=>{}}) {
  const key='private:'+String(config.ownerQQ),ledger=createDeliveryState({fs:disk,hash,basePath:path.join(root,'state/fund-watch').replaceAll('\\','/'),namespace:'whale-fund-watch-142',now,diag:log});
  const change=fn=>{if(!ledger.healthy||!ledger.change(fn))throw Error('基金关注记录暂时不可用，本次没有保存');};
  const view=p=>({code:p.code,name:p.name,phase:p.phase,status:p.status,horizonDays:p.horizonDays||null,costNav:p.costNav||null,rules:p.rules||[],missing:readiness(p),source:'主人私信确认的关注计划，非券商持仓',heldAt:p.heldAt||null});
  const list=()=>Object.values(ledger.data.plans||{}).map(view);
  async function handle(body,{includeResearch=true}={}) {
    if(body.key!==key||quiet(key))throw Error('只接受主人当前私信中的关注设置');
    const m=sourceMessage(key,String(body.messageId||''));
    if(!m||String(m.userId)!==String(config.ownerQQ)||m.isSelf||now()-Number(m.time)>600000||Number(m.time)>now()+5000)throw Error('请用当前私信确认基金及提醒条件，旧话和转述不改关注计划');
    let parsed=parseWatchMessage(m.plain||m.text);
    const pendingChoice=ledger.data.pendingChoice;
    if(!parsed&&pendingChoice&&now()-pendingChoice.at<=86400000){
      const raw=String(m.plain||m.text).trim(),share=/^(?:就|选)?\s*([AC])\s*(?:类|份额)?[。！!]?$/i.exec(raw);
      const candidates=catalog().filter(f=>pendingChoice.codes.includes(f.code)&&(!share||new RegExp(share[1]+'$','i').test(f.name)));
      const resolution=share&&candidates.length===1?{status:'found',fund:candidates[0]}:resolveFund(raw,candidates);
      if(resolution.status==='found'&&pendingChoice.codes.includes(resolution.fund.code))parsed={op:'select',phase:pendingChoice.phase,query:resolution.fund.name,settings:pendingChoice.settings};
    }
    if(!parsed)return {mode:'advisory',handled:false};
    if((parsed.op==='remove')!==(body.action==='unwatch'))throw Error('关注和取消关注的操作方向不一致，本次未保存');
    const commandId=hash([key,String(body.messageId)]),previous=ledger.data.commands?.[commandId];
    if(previous)return {...previous,replayed:true};
    let fund;
    if(parsed.query){const resolution=resolveFund(parsed.query,catalog());if(resolution.status!=='found'){
      change(d=>{d.focus=null;d.pendingChoice={at:now(),codes:(resolution.candidates||[]).map(f=>f.code),phase:parsed.phase,settings:parsed.settings};});
      return {mode:'advisory',handled:true,needsClarification:true,...resolution};
    }fund=resolution.fund;}
    else {
      const focus=ledger.data.focus;
      if(!focus||now()-focus.at>86400000||!ledger.data.plans?.[focus.code])return {mode:'advisory',handled:true,needsClarification:true,message:'这次条件是给哪只基金的？先确认名称或代码。'};
      fund=ledger.data.plans[focus.code];
    }
    const old=ledger.data.plans?.[fund.code]||{};
    const plan={...old,code:fund.code,name:fund.name,phase:parsed.op==='remove'?'closed':parsed.phase||old.phase||'planned',
      ...parsed.settings,updatedAt:now(),revision:(old.revision||0)+1};
    if(plan.phase==='held'&&(!old.heldAt||old.phase!=='held'))plan.heldAt=now();
    if(plan.phase==='closed')plan.status='closed';else plan.status=readiness(plan).length?'needs_confirmation':'watching';
    const rulesChanged=JSON.stringify([old.rules,old.horizonDays,old.costNav,old.phase])!==JSON.stringify([plan.rules,plan.horizonDays,plan.costNav,plan.phase]);
    plan.fired=rulesChanged?{}:old.fired||{};
    if(rulesChanged)plan.nextCheckAt=0;
    const result={mode:'advisory',liveTrading:false,handled:true,saved:true,plan:view(plan),monitoring:plan.status==='watching',needsClarification:plan.status==='needs_confirmation',note:'只保存关注/本人记录的持有计划，不代表真实或模拟成交；条件到达时提醒复查，由你决定买卖。'};
    change(d=>{(d.plans||={})[fund.code]=plan;(d.commands||={})[commandId]=result;d.focus={code:fund.code,at:now()};d.pendingChoice=null;d.pending=(d.pending||[]).filter(e=>e.code!==fund.code);if(parsed.op!=='remove')d.monitorEnabled=true;});
    return {...result,...(plan.phase==='closed'||!includeResearch?{}:{research:await research.read(fund)})};
  }
  let busy=false;
  async function poll(){
    if(busy||!ledger.healthy)return;busy=true;
    try{
      if(quiet(key)||ledger.data.monitorEnabled===false)return;
      for(const original of Object.values(ledger.data.plans||{})){
        if(original.status!=='watching'||(original.nextCheckAt||0)>now())continue;
        const revision=original.revision;
        change(d=>{d.plans[original.code].nextCheckAt=now()+1800000;});
        const snapshot=await research.read(original);
        const current=ledger.data.plans?.[original.code];
        if(!current||current.revision!==revision||current.status!=='watching')continue;
        for(const hit of evaluateWatchRules(current,snapshot,now())){
          if(ledger.data.plans[original.code].fired?.[hit.ruleId])continue;
          const event={id:hash([original.code,revision,hit.ruleId]),code:original.code,at:now(),revision,
            data:{kind:'FUND_WATCH_CONDITION',code:original.code,name:original.name,phase:current.phase,...hit,
              navAsOf:snapshot.asOf,measurement:snapshot.measurement,sourceUrl:snapshot.sourceUrl,recentDistribution:snapshot.recentDistribution,
              metricNote:'净值相对手工成本的变化，未计算分红、申赎费或真实收益；这不是自动买卖指令',
              meaning:current.phase==='held'?'达到本人设置的持有复查/卖出观察条件，不是系统确认必须清仓':'达到本人设置的买入观察条件，不是保证合适或自动买入'}};
          change(d=>{d.plans[original.code].fired[hit.ruleId]=event.id;(d.pending||=[]).push(event);});
        }
      }
      change(d=>{d.pending=(d.pending||[]).filter(e=>now()-e.at<21600000&&d.plans?.[e.code]?.revision===e.revision&&d.plans[e.code].status==='watching');});
      const pending=(ledger.data.pending||[]).filter(e=>!e.attempted).slice(0,5);
      if(!pending.length||quiet(key))return;
      change(d=>{for(const e of d.pending)if(pending.some(p=>p.id===e.id))e.attempted=true;});
      const accepted=await notify(key,{mode:'advisory',liveTrading:false,events:pending.map(e=>e.data),at:now()});
      if(accepted===false)change(d=>{for(const e of d.pending)if(pending.some(p=>p.id===e.id))delete e.attempted;});
      else change(d=>{d.pending=d.pending.filter(e=>!pending.some(p=>p.id===e.id));});
    }catch{log('基金关注本轮未完成；未把错误当掉线，不重登QQ或重复发送。');}
    finally{busy=false;}
  }
  return {handle,poll,list,ledger,hasPendingChoice:()=>!!ledger.data.pendingChoice&&now()-ledger.data.pendingChoice.at<=86400000,setMonitoring:enabled=>change(d=>{d.monitorEnabled=enabled;if(!enabled)d.pending=[];})};
}
