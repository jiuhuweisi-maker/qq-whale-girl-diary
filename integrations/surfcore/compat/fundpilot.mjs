import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createDeliveryState } from './durable-state.cjs';
import {BASE_FUNDS,resolveFund,mergeFundCatalog,parsePublicFundCatalog} from './fund-catalog.mjs';
import {createFinanceLearning} from './finance-learning.mjs';
import {createFundResearch} from './fund-research.mjs';
import {createFundWatch,parseWatchMessage} from './fund-watch.mjs';

const symbols = ['159696.SZ', '588080.SH'];
const hash = v => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const symbolOf = text => symbols.find(s => text.includes(s.slice(0, 6)));
function sizedOrder(text,catalog){
  const m=/^模拟(买入|卖出)\s*(.+?)[，,：: ]+\s*(\d+(?:\.\d{1,2})?)\s*(万|亿)?\s*(份|元|块(?:钱)?|人民币)[。！!]?$/u.exec(text);
  if(!m)return null;
  const query=m[2].trim(),numeric=/^(\d{6})(?:\.(SZ|SH))?$/i.exec(query);let symbol;
  if(numeric){symbol=symbols.find(s=>s.startsWith(numeric[1]+'.'));if(!symbol)return null;if(numeric[2]&&!symbol.endsWith(numeric[2].toUpperCase()))throw Error('代码和交易所不一致，先核对一下');}
  else {const r=resolveFund(query,catalog);if(r.status!=='found'||!r.fund.paperSupported){const e=Error(r.fund?'这只我认得，但目前模拟盘还没支持它。':r.message);e.resolution={...r,message:e.message};throw e;}symbol=r.fund.symbol;}
  const scale=m[4]==='万'?10000n:m[4]==='亿'?100000000n:1n,command={action:'order',symbol,side:m[1]==='买入'?'buy':'sell'};
  if(m[5]==='份'){
    if(!/^\d+$/.test(m[3]))throw Error('份数请用100份的整数倍');
    const quantity=BigInt(m[3])*scale;if(quantity<=0n||quantity%100n||quantity>BigInt(Number.MAX_SAFE_INTEGER))throw Error('份数请用可精确记账的100份整数倍');
    return {...command,quantity:Number(quantity)};
  }
  if(command.side!=='buy')throw Error('模拟卖出请指定份数，金额买入才按预算换算');
  const [whole,decimals='']=m[3].split('.'),amountFen=(BigInt(whole)*100n+BigInt(decimals.padEnd(2,'0')))*scale;
  if(amountFen<=0n||amountFen>BigInt(Number.MAX_SAFE_INTEGER))throw Error('这个金额超出可精确记账范围，请核对一下');
  return {...command,amountFen:Number(amountFen)};
}
export function parseFundCommand(raw,catalog=BASE_FUNDS) {
  const text = String(raw || '').trim().replace(/^(?:鲸戒[，, ]*)?(?:请|帮我|给我)?\s*/, '');
  const order=sizedOrder(text,catalog);if(order)return order;
  if (/^(?:暂停|停止)模拟(?:交易|买卖)[。！!]?$/u.test(text)) return { action: 'halt' };
  if (/^(?:停止|取消)盯盘[。！!]?$/u.test(text)) return { action: 'unwatch' };
  if (/^(?:开始|开启|继续)?盯盘[。！!]?$/u.test(text)) return { action: 'watch' };
  const m = /^(?:盯着?|关注)\s*(159696|588080)\s*[，,：: ]*\s*(高于|低于|涨到|跌到)\s*(\d+(?:\.\d{1,3})?)\s*元?\s*(?:就)?提醒我[。！!]?$/u.exec(text);
  if (m) {
    const priceMills = Math.round(Number(m[3]) * 1000);
    if (priceMills <= 0 || priceMills > 1000000) throw Error('提醒价格需要是有效的正数');
    return { action: 'watch', symbol: symbolOf(text), direction: ['高于','涨到'].includes(m[2]) ? 'above' : 'below', priceMills };
  }
  const namedWatch=/^(?:盯着?|关注)\s*(.+?)[，,：: ]*\s*(高于|低于|涨到|跌到)\s*(\d+(?:\.\d{1,3})?)\s*元?\s*(?:就)?提醒我[。！!]?$/u.exec(text);
  const named=namedWatch;
  if(named){
    const query=named[1];
    if(/^\d{6}(?:\.(?:SH|SZ))?$/i.test(query))return null;
    const resolution=resolveFund(query,catalog);
    if(resolution.status!=='found'||!resolution.fund.paperSupported){const e=Error(resolution.fund?'这只我认得，但目前模拟盘还没支持它。':resolution.message);e.resolution={...resolution,message:e.message};throw e;}
    const canonical=`盯${resolution.fund.code}，${named[2]}${named[3]}元提醒我`;
    return parseFundCommand(canonical,catalog);
  }
  return null;
}

const messages = {
  MARKET_CLOSED:'现在收盘了，这笔还没模拟成交，开盘后再下就行🐟', STALE_QUOTE:'报价有点旧，这笔先没动，等新行情。',
  ACCOUNT_HALTED_OR_UNVALUED:'模拟账户已经暂停或暂时估不了值，这笔先没买。', POSITION_LIMIT:'这笔超过模拟仓位上限了，先减点数量。',
  ONE_POSITION_ONLY:'模拟账户现在只允许持有一只，先处理现有持仓。', INSUFFICIENT_POSITION:'模拟持仓没这么多份，数量再看一下？',
  T_PLUS_ONE_SELL_BLOCKED:'这只是T+1，今天买的还不能模拟卖，得等下个交易日。', INSUFFICIENT_CASH:'模拟余额不够这笔和手续费。',
  DAILY_ORDER_LIMIT:'今天的模拟开仓次数已经用完了，先歇一歇。', SPREAD_TOO_WIDE:'买卖价差有点大，这笔先没买。',
  BUDGET_BELOW_ONE_LOT:'这笔预算还不够100份和模拟手续费，暂时没成交。',AMOUNT_OVERFLOW:'这个数超过系统可精确记账范围了，这笔没有执行。',
};
export function createFundPilot({root, config, sourceMessage, quiet=()=>false, notify=async()=>false, now=Date.now, request:override, research:researchOverride, disk=fs, log=()=>{}}) {
  disk.mkdirSync(path.join(root,'state'),{recursive:true});
  const ledger=createDeliveryState({fs:disk,hash,basePath:path.join(root,'state/fundpilot').replaceAll('\\','/'),namespace:'whale-fundpilot-116',now,diag:log});
  const ownerKey='private:'+String(config.ownerQQ);
  const learning=createFinanceLearning({root,config,disk,now});
  const catalogFile=path.join(root,'state/fund-catalog.json');
  const catalog=()=>{try{return mergeFundCatalog(JSON.parse(disk.readFileSync(catalogFile,'utf8')).funds)}catch{return BASE_FUNDS}};
  const research=researchOverride||createFundResearch({root,disk,now});
  const watches=createFundWatch({root,config,catalog,research,sourceMessage,notify,quiet,now,disk,log});
  async function refreshCatalog(){const r=await fetch('https://fund.eastmoney.com/js/fundcode_search.js',{signal:AbortSignal.timeout(6000),redirect:'error'});if(!r.ok)throw Error('名录暂时没取到');const chunks=[];let size=0;for await(const b of r.body){size+=b.byteLength;if(size>8000000){await r.body.cancel().catch(()=>{});throw Error('名录过大');}chunks.push(Buffer.from(b));}const text=Buffer.concat(chunks).toString('utf8');const funds=parsePublicFundCatalog(text);disk.writeFileSync(catalogFile+'.tmp',JSON.stringify({fetchedAt:new Date(now()).toISOString(),funds}),{mode:0o600});disk.renameSync(catalogFile+'.tmp',catalogFile);return funds.length;}
  let catalogFlight;
  async function ensureCatalog(){try{const cache=JSON.parse(disk.readFileSync(catalogFile,'utf8'));if(now()-Date.parse(cache.fetchedAt)<86400000)return;}catch{}if(catalogFlight)return catalogFlight;catalogFlight=refreshCatalog().catch(()=>{log('基金名录这次没更新，沿用已核对名称，不猜代码');}).finally(()=>{catalogFlight=null;});return catalogFlight;}
  const enabled=()=>config.whaleCompat?.fundpilot?.enabled===true;
  const save=fn=>{if(!ledger.healthy||!ledger.change(fn))throw Error('模拟账户的本地记录暂时不可用，先不动它');};
  async function request(route, data) {
    if (override) return override(route,data);
    const token=disk.readFileSync(config.whaleCompat?.fundpilot?.tokenFile || '/var/lib/fundpilot/service.token','utf8').trim();
    const r=await fetch('http://127.0.0.1:3092'+route,{method:data===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),redirect:'error',signal:AbortSignal.timeout(10000)});
    const body=await r.json();
    if(!r.ok)throw Error(messages[body.error]||'模拟账户这次没有完成操作，先别重复下单，我查一下状态。');
    if(body.mode!=='paper'||body.liveTrading===true)throw Error('账户模式校验没通过，已停止操作');
    return body;
  }
  let busy=false;
  async function captureOwnerMessage(key,messageId){
    if(!enabled()||key!==ownerKey||quiet(key))return null;
    const m=sourceMessage(key,String(messageId));
    if(!m||String(m.userId)!==String(config.ownerQQ)||m.isSelf||(!parseWatchMessage(m.plain||m.text)&&!watches.hasPendingChoice()))return null;
    const parsed=parseWatchMessage(m.plain||m.text);
    await ensureCatalog();
    try{return await watches.handle({key,messageId,action:parsed?.op==='remove'?'unwatch':'watch'},{includeResearch:false});}
    catch{log('当前基金计划未确认保存，不向QQ输出内部错误');return null;}
  }
  function context(key){
    if(key!==ownerKey||!enabled())return '';
    const plans=watches.list().filter(p=>p.status!=='closed');
    return plans.length?'【已保存的基金关注计划】以下是本地实际保存结果，不是成交；缺什么就接着确认，别把待确认说成正在盯，也别反复问已经保存的条件。\n'+JSON.stringify(plans.slice(-10))+'\n\n':'';
  }
  async function handle(body) {
    if (!enabled()||body.key!==ownerKey||quiet(ownerKey))throw Error('基金助手只在主人自己的私信里使用');
    if(body.action==='resolve'||(body.action==='market'&&String(body.query||'').trim())){
      await ensureCatalog();const resolution=resolveFund(body.query,catalog());
      return {mode:'advisory',liveTrading:false,...resolution,...(resolution.status==='found'?{research:await research.read(resolution.fund),watchPlan:watches.list().find(p=>p.code===resolution.fund.code)||null}:{})};
    }
    if(body.action==='learning')return {mode:'paper',...learning.notes(body.query)};
    if(body.action==='study')return {mode:'paper',...(String(body.query||'').includes('BV')?await learning.collect(body.query):await learning.search(body.query))};
    if(body.action==='note')return {mode:'paper',...learning.record(body.query,body.note)};
    if (['status','market','journal'].includes(body.action)){const result=await request('/'+body.action);return body.action==='status'?{...result,watchPlans:watches.list()}:result;}
    const m=sourceMessage(body.key,String(body.messageId||''));
    if(!m||String(m.userId)!==String(config.ownerQQ)||m.isSelf||now()-Number(m.time)>600000||Number(m.time)>now()+5000)throw Error('需要你当前私信里的明确指令，旧话和引用不算下单');
    let command;try{command=parseFundCommand(m.plain||m.text,catalog());}catch(e){
      if(['watch','unwatch'].includes(body.action)){await ensureCatalog();const watched=await watches.handle(body);if(watched.handled)return watched;}
      if(e.resolution)return {mode:'paper',ok:false,needsClarification:true,...e.resolution};throw e;
    }
    if(!command&&['watch','unwatch'].includes(body.action)){await ensureCatalog();const watched=await watches.handle(body);if(watched.handled)return watched;}
    if(!command||command.action!==body.action)throw Error('这句我还不能确定要怎么操作。模拟买卖请说清基金和份数，盯盘请说提醒条件。');
    const id='qq:'+hash(ownerKey).slice(0,16)+':'+String(body.messageId);
    const old=ledger.data.commands?.[id];
    if(old){if(old.result)return {...old.result,replayed:true};throw Error('这条指令已经尝试过，结果还待核对，先不重复执行');}
    save(d=>(d.commands||={})[id]={at:now(),status:'attempting'});
    try {
      let result;
      if(command.action==='order')result=await request('/paper/order',{symbol:command.symbol,side:command.side,...(command.amountFen!==undefined?{amountFen:command.amountFen}:{quantity:command.quantity}),mode:'paper',requestId:id});
      else if(command.action==='halt')result=await request('/paper/halt',{});
      else {save(d=>{d.monitorEnabled=command.action==='watch';if(command.symbol){d.rules||={};d.rules[hash(command).slice(0,24)]={...command,at:now(),fired:false};}});watches.setMonitoring(command.action==='watch');result={mode:'paper',monitoring:command.action==='watch',rule:command.symbol?command:undefined};}
      save(d=>d.commands[id]={at:now(),status:'done',action:command.action,result});return result;
    }catch(e){save(d=>d.commands[id].status='uncertain');throw e;}
  }
  async function poll() {
    if(!enabled()||busy||!ledger.healthy)return;
    busy=true;
    try {
      await watches.poll();
      const journal=await request('/journal'),status=await request('/status');
      const events=journal.events||[],max=Math.max(0,...events.map(e=>e.id));
      if(ledger.data.cursor===undefined){save(d=>{d.cursor=max;d.monitorEnabled??=true;});return;}
      const fresh=events.filter(e=>e.id>ledger.data.cursor&&now()-Date.parse(e.timestamp)<600000&&Date.parse(e.timestamp)<=now()+5000);
      const notes=fresh.filter(e=>{
        if(!['PAPER_FILL','HALT'].includes(e.kind))return false;
        if(e.kind==='PAPER_FILL'&&ledger.data.commands?.[e.data?.requestId]?.status==='done')return false;
        if(e.kind==='HALT'&&e.data?.reason==='MANUAL_PAPER_HALT'&&Object.values(ledger.data.commands||{}).some(c=>c.action==='halt'&&c.status==='done'&&Math.abs(c.at-Date.parse(e.timestamp))<10000))return false;
        return true;
      }).sort((a,b)=>a.id-b.id).map(e=>({id:'event:'+e.id,at:Date.parse(e.timestamp),data:e}));
      for(const [id,r] of Object.entries(ledger.data.rules||{})){
        if(r.fired||ledger.data.monitorEnabled===false)continue;
        const market=await request('/market'),quote=market.quotes?.find(q=>q.symbol===r.symbol);
        if(!quote||now()-quote.timestamp>90000||quote.timestamp>now()+5000||market.market?.status!=='available')continue;
        if((r.direction==='above'&&quote.priceMills>=r.priceMills)||(r.direction==='below'&&quote.priceMills<=r.priceMills)){notes.push({id:'rule:'+id,at:now(),data:{kind:'PRICE',symbol:r.symbol,priceMills:quote.priceMills,threshold:r.priceMills,quoteTimestamp:quote.timestamp}});save(d=>d.rules[id].fired=true);}
      }
      save(d=>{d.cursor=Math.max(d.cursor,max);d.pending=d.monitorEnabled===false?[]:[...(d.pending||[]),...notes].filter(e=>now()-e.at<600000).slice(-10);});
      if(ledger.data.monitorEnabled===false||quiet(ownerKey)||!ledger.data.pending?.length)return;
      const pending=ledger.data.pending.filter(n=>!n.attempted);
      if(!pending.length)return;
      save(d=>{for(const n of d.pending)if(pending.some(p=>p.id===n.id))n.attempted=true;});
      // notify returns false if busy; thrown/accepted delivery is not retried blindly.
      const accepted=await notify(ownerKey,{mode:'paper',events:pending.map(n=>n.data),account:{cashFen:status.cashFen,equityFen:status.equityFen,pnlFen:status.pnlFen,halted:status.halted},at:now()});
      if(accepted!==false)save(d=>{d.pending=d.pending.filter(n=>!pending.some(p=>p.id===n.id));d.lastSubmittedAt=now();});
      else save(d=>{for(const n of d.pending)if(pending.some(p=>p.id===n.id))delete n.attempted;});
    }catch(e){log('基金助手本轮未完成检查：'+String(e.message).slice(0,100));}finally{busy=false;}
  }
  return {handle,poll,ledger,watches,refreshCatalog,captureOwnerMessage,context,status:()=>({enabled:enabled(),healthy:ledger.healthy&&watches.ledger.healthy,monitoring:ledger.data.monitorEnabled!==false,pending:ledger.data.pending?.length||0,watchPlans:watches.list().length,watching:watches.list().filter(p=>p.status==='watching').length})};
}
