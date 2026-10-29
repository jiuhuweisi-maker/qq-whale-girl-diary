import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createDeliveryState } from './durable-state.cjs';

const symbols = ['159696.SZ', '588080.SH'];
const hash = v => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const symbolOf = text => symbols.find(s => text.includes(s.slice(0, 6)));
export function parseFundCommand(raw) {
  const text = String(raw || '').trim().replace(/^(?:鲸戒[，, ]*)?(?:请|帮我|给我)?\s*/, '');
  let m = /^模拟(买入|卖出)\s*(159696|588080)(?:\.(SZ|SH))?\s*[，,：: ]+\s*(\d+)\s*份[。！!]?$/i.exec(text);
  if (m) {
    const symbol = symbolOf(text);
    if (m[3] && !symbol.endsWith(m[3].toUpperCase())) throw Error('代码和交易所不一致，先核对一下');
    const quantity = Number(m[4]);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity % 100 || quantity > 10000) throw Error('模拟买卖按100份的整数倍来，数量再确认一下');
    return { action: 'order', symbol, side: m[1] === '买入' ? 'buy' : 'sell', quantity };
  }
  if (/^(?:暂停|停止)模拟(?:交易|买卖)[。！!]?$/u.test(text)) return { action: 'halt' };
  if (/^(?:停止|取消)盯盘[。！!]?$/u.test(text)) return { action: 'unwatch' };
  if (/^(?:开始|开启|继续)?盯盘[。！!]?$/u.test(text)) return { action: 'watch' };
  m = /^(?:盯着?|关注)\s*(159696|588080)\s*[，,：: ]*\s*(高于|低于|涨到|跌到)\s*(\d+(?:\.\d{1,3})?)\s*元?\s*(?:就)?提醒我[。！!]?$/u.exec(text);
  if (m) {
    const priceMills = Math.round(Number(m[3]) * 1000);
    if (priceMills <= 0 || priceMills > 1000000) throw Error('提醒价格需要是有效的正数');
    return { action: 'watch', symbol: symbolOf(text), direction: ['高于','涨到'].includes(m[2]) ? 'above' : 'below', priceMills };
  }
  return null;
}

const messages = {
  MARKET_CLOSED:'现在收盘了，这笔还没模拟成交，开盘后再下就行🐟', STALE_QUOTE:'报价有点旧，这笔先没动，等新行情。',
  ACCOUNT_HALTED_OR_UNVALUED:'模拟账户已经暂停或暂时估不了值，这笔先没买。', POSITION_LIMIT:'这笔超过模拟仓位上限了，先减点数量。',
  ONE_POSITION_ONLY:'模拟账户现在只允许持有一只，先处理现有持仓。', INSUFFICIENT_POSITION:'模拟持仓没这么多份，数量再看一下？',
  T_PLUS_ONE_SELL_BLOCKED:'这只是T+1，今天买的还不能模拟卖，得等下个交易日。', INSUFFICIENT_CASH:'模拟余额不够这笔和手续费。',
  DAILY_ORDER_LIMIT:'今天的模拟开仓次数已经用完了，先歇一歇。', SPREAD_TOO_WIDE:'买卖价差有点大，这笔先没买。',
};
export function createFundPilot({root, config, sourceMessage, quiet=()=>false, notify=async()=>false, now=Date.now, request:override, disk=fs, log=()=>{}}) {
  disk.mkdirSync(path.join(root,'state'),{recursive:true});
  const ledger=createDeliveryState({fs:disk,hash,basePath:path.join(root,'state/fundpilot').replaceAll('\\','/'),namespace:'whale-fundpilot-116',now,diag:log});
  const ownerKey='private:'+String(config.ownerQQ);
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
  async function handle(body) {
    if (!enabled()||body.key!==ownerKey||quiet(ownerKey))throw Error('基金助手只在主人自己的私信里使用');
    if (['status','market','journal'].includes(body.action))return request('/'+body.action);
    const m=sourceMessage(body.key,String(body.messageId||''));
    if(!m||String(m.userId)!==String(config.ownerQQ)||m.isSelf||now()-Number(m.time)>600000||Number(m.time)>now()+5000)throw Error('需要你当前私信里的明确指令，旧话和引用不算下单');
    const command=parseFundCommand(m.plain||m.text);
    if(!command||command.action!==body.action)throw Error('这句我还不能确定要怎么操作。模拟买卖请说代码和份数，盯盘请说提醒条件。');
    const id='qq:'+hash(ownerKey).slice(0,16)+':'+String(body.messageId);
    const old=ledger.data.commands?.[id];
    if(old){if(old.result)return {...old.result,replayed:true};throw Error('这条指令已经尝试过，结果还待核对，先不重复执行');}
    save(d=>(d.commands||={})[id]={at:now(),status:'attempting'});
    try {
      let result;
      if(command.action==='order')result=await request('/paper/order',{symbol:command.symbol,side:command.side,quantity:command.quantity,mode:'paper',requestId:id});
      else if(command.action==='halt')result=await request('/paper/halt',{});
      else {save(d=>{d.monitorEnabled=command.action==='watch';if(command.symbol){d.rules||={};d.rules[hash(command).slice(0,24)]={...command,at:now(),fired:false};}});result={mode:'paper',monitoring:command.action==='watch',rule:command.symbol?command:undefined};}
      save(d=>d.commands[id]={at:now(),status:'done',action:command.action,result});return result;
    }catch(e){save(d=>d.commands[id].status='uncertain');throw e;}
  }
  async function poll() {
    if(!enabled()||busy||!ledger.healthy)return;
    busy=true;
    try {
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
  return {handle,poll,ledger,status:()=>({enabled:enabled(),healthy:ledger.healthy,monitoring:ledger.data.monitorEnabled!==false,pending:ledger.data.pending?.length||0})};
}
