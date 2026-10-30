import fs from 'node:fs';
import path from 'node:path';

const day = t => new Date(t).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
// Only JSON/string assignments are read. Never execute downloaded JavaScript.
function assignment(source, name) {
  const match = new RegExp('\\bvar\\s+'+name+'\\s*=\\s*').exec(source);
  if (!match) throw Error('基金数据缺少'+name);
  const start=match.index+match[0].length;
  let quoted=false,escaped=false,depth=0;
  for(let i=start;i<source.length;i++){
    const c=source[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==='['||c==='{')depth++;
    if(c===']'||c==='}')depth--;
    if(c===';'&&depth===0)return JSON.parse(source.slice(start,i).trim());
  }
  throw Error('基金数据未完整返回');
}
export function parseFundNav(source, fund, now=Date.now()) {
  if(assignment(source,'fS_code')!==fund.code)throw Error('基金代码与返回资料不一致');
  const sourceName=assignment(source,'fS_name');
  if(typeof sourceName!=='string'||!sourceName.trim())throw Error('基金名称缺失');
  const raw=assignment(source,'Data_netWorthTrend');
  if(!Array.isArray(raw)||raw.length>50000)throw Error('基金净值记录异常');
  const points=raw.filter(r=>Number.isFinite(r?.x)&&Number.isFinite(r?.y)&&r.y>0&&r.x<=now+5000).sort((a,b)=>a.x-b.x);
  if(!points.length)throw Error('没有可用的已公布净值');
  const last=points.at(-1),previous=points.at(-2),window=points.slice(-20),peak=Math.max(...window.map(p=>p.y));
  const asOf=day(last.x),ageDays=Math.round((Date.parse(day(now))-Date.parse(asOf))/86400000);
  if(ageDays<0)throw Error('净值日期在未来');
  return {code:fund.code,name:fund.name,sourceName,productType:/ETF/.test(fund.name)?'exchange_traded_fund':'fund',
    shareClassSuffix:/([ABC])$/i.exec(fund.name)?.[1]?.toUpperCase()||null,otherShareClassesChecked:false,portfolioHoldingsVerified:false,riskRatingVerified:false,
    unitNav:last.y,asOf,navTimestamp:last.x,fetchedAt:now,stale:ageDays>7,
    measurement:'published_unit_nav',isRealtimePrice:false,
    dailyChangePct:Number.isFinite(last.equityReturn)?last.equityReturn:previous?(last.y/previous.y-1)*100:null,
    drawdown20ObservationsPct:(last.y/peak-1)*100,
    recentDistribution:window.some(p=>String(p.unitMoney||'').trim()),
    source:'天天基金公开净值资料',sourceUrl:'https://fund.eastmoney.com/pingzhongdata/'+fund.code+'.js',
    productUrl:'https://fund.eastmoney.com/'+fund.code+'.html',paperSupported:fund.paperSupported===true,
    note:'这是已公布的单位净值，不是实时成交价或盘中估值；净值相对成本的变化不等于含分红、费用的实际收益。'};
}
export function createFundResearch({root,disk=fs,now=Date.now,fetcher=fetch}) {
  const dir=path.join(root,'state/fund-research');disk.mkdirSync(dir,{recursive:true});
  const inFlight=new Map();
  const fileFor=code=>{if(!/^\d{6}$/.test(code))throw Error('基金代码无效');return path.join(dir,code+'.json');};
  async function read(fund,{force=false}={}) {
    const file=fileFor(fund.code);let cached;
    try{cached=JSON.parse(disk.readFileSync(file,'utf8'));}catch{}
    if(!force&&cached?.snapshot&&now()-cached.at<1800000)return {...cached.snapshot,cache:true};
    if(cached?.retryAfter>now())return cached.snapshot?{...cached.snapshot,stale:true,unavailable:true,retryAfter:cached.retryAfter}:{code:fund.code,name:fund.name,unavailable:true,retryAfter:cached.retryAfter};
    if(inFlight.has(fund.code))return inFlight.get(fund.code);
    const task=(async()=>{
      try{
        const url='https://fund.eastmoney.com/pingzhongdata/'+fund.code+'.js';
        const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(6000)});
        if(!response.ok)throw Error('public_data_http_'+response.status);
        const chunks=[];let size=0;
        for await(const b of response.body){size+=b.byteLength;if(size>8000000)throw Error('public_data_too_large');chunks.push(Buffer.from(b));}
        const snapshot=parseFundNav(Buffer.concat(chunks).toString('utf8'),fund,now());
        disk.writeFileSync(file+'.tmp',JSON.stringify({at:now(),snapshot}),{mode:0o600});disk.renameSync(file+'.tmp',file);
        return snapshot;
      }catch{
        const retryAfter=now()+3600000;
        disk.writeFileSync(file+'.tmp',JSON.stringify({at:cached?.at||0,snapshot:cached?.snapshot,retryAfter}),{mode:0o600});disk.renameSync(file+'.tmp',file);
        return cached?.snapshot?{...cached.snapshot,stale:true,unavailable:true,retryAfter}:{code:fund.code,name:fund.name,unavailable:true,retryAfter,note:'本次没有取得可用净值，不能据此判断买卖。'};
      }
    })();
    inFlight.set(fund.code,task);
    try{return await task;}finally{inFlight.delete(fund.code);}
  }
  return {read};
}
