// Names describe products; they never expand the paper engine's trade whitelist.
export const PAPER_CODES = new Set(['159696','588080']);
export const BASE_FUNDS = [
  {code:'159696',exchange:'SZ',name:'易方达纳斯达克100ETF（QDII）',aliases:['纳指ETF易方达','易方达纳指ETF','易方达纳斯达克100ETF'],family:'nasdaq',source:'https://www.efunds.com.cn/fund/159696.shtml'},
  {code:'588080',exchange:'SH',name:'易方达上证科创板50ETF',aliases:['易方达科创50ETF','易方达科创板50ETF','易方达上证科创板50成份ETF'],family:'star50',source:'https://www.efunds.com.cn/fund/588080.shtml'},
  {code:'159941',exchange:'SZ',name:'广发纳斯达克100ETF',aliases:['广发纳指ETF'],family:'nasdaq',source:'https://www.gffunds.com.cn/funds/?fundcode=159941'},
  {code:'513100',exchange:'SH',name:'国泰纳斯达克100ETF',aliases:['国泰纳指ETF'],family:'nasdaq',source:'https://www.gtfund.com/product/productlist/haiwai/513100/index.html'},
  {code:'588000',exchange:'SH',name:'华夏上证科创板50成份ETF',aliases:['华夏科创50ETF','华夏科创板50ETF'],family:'star50',source:'https://f.chinaamc.com/fund/588000/'},
  {code:'005827',name:'易方达蓝筹精选混合',aliases:['易方达蓝筹精选','易方达蓝筹'],source:'https://www.efunds.com.cn/fund/005827.shtml'},
];
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s（）()\[\]【】·，,。]/g,'');
const productName=s=>norm(s).replace(/lof|qdii/g,'');
export function mergeFundCatalog(rows=[]) {
  const merged=new Map(rows.map(r=>[r.code,{...r,aliases:r.aliases||[]} ]));
  for(const base of BASE_FUNDS)merged.set(base.code,{...merged.get(base.code),...base});
  return [...merged.values()];
}
export function parsePublicFundCatalog(raw) {
  const match=String(raw).match(/^\s*var\s+r\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if(!match)throw Error('基金名录格式未通过校验');
  const rows=JSON.parse(match[1]);
  if(!Array.isArray(rows)||rows.length>50000)throw Error('基金名录条数异常');
  return rows.filter(r=>Array.isArray(r)&&/^\d{6}$/.test(r[0])&&typeof r[2]==='string').map(r=>({code:r[0],name:r[2].slice(0,150),kind:String(r[3]||'').slice(0,50),aliases:[],source:'https://fund.eastmoney.com/js/fundcode_search.js',issuerVerified:false}));
}
export function resolveFund(query,rows=BASE_FUNDS) {
  const text=norm(query),catalog=mergeFundCatalog(rows),codes=[...new Set(text.match(/(?<!\d)\d{6}(?!\d)/g)||[])];
  const view=r=>({...r,symbol:r.exchange?r.code+'.'+r.exchange:r.code,paperSupported:PAPER_CODES.has(r.code),sourceCheckedAt:r.sourceCheckedAt||'2026-10-29'});
  if(codes.length>1)return {status:'ambiguous',message:'这里有不止一个代码，先确认是哪一只。',candidates:catalog.filter(r=>codes.includes(r.code)).map(view)};
  if(codes.length===1){
    const row=catalog.find(r=>r.code===codes[0]);if(!row)return {status:'unknown',query,candidates:[]};
    const rest=text.replace(codes[0],'').replace(/\.(?:sz|sh)$/i,'');
    if(/\.(?:sz|sh)$/i.test(text)&&row.exchange&&!text.endsWith('.'+row.exchange.toLowerCase()))return {status:'conflict',message:'名称、代码或交易所对不上，先核对一下。',candidates:[view(row)]};
    if(rest&&!([row.name,...row.aliases].some(a=>norm(a)===rest)))return {status:'conflict',message:'名称和代码没有对上，先确认你说的是哪只。',candidates:[view(row)]};
    return {status:'found',fund:view(row),candidates:[view(row)]};
  }
  if(!text||text.length>100)return {status:'unknown',query,candidates:[]};
  const exact=catalog.filter(r=>[r.name,...r.aliases].some(a=>productName(a)===productName(text)));
  const family=/纳指|纳斯达克|nasdaq/.test(text)?'nasdaq':/科创(?:板)?50/.test(text)?'star50':null;
  const provider=['易方达','广发','国泰','华夏','招商','南方','富国','嘉实','博时','汇添富','华安','鹏华','天弘','工银瑞信','景顺长城','华泰柏瑞','交银施罗德'].find(n=>text.includes(n));
  const found=exact.length?exact:catalog.filter(r=>productName(r.name).includes(productName(text))||(family&&(r.family===family||new RegExp(family==='nasdaq'?'纳斯达克|纳指':'科创(?:板)?50').test(r.name))&&(!provider||r.name.includes(provider))));
  // A shortened theme name is a candidate, never authority to select a trade.
  if(!found.length&&provider){const key=productName(text.replace(provider,''));for(const r of catalog.filter(r=>r.name.includes(provider))){let at=0;const name=productName(r.name.replace(provider,''));if([...key].every(c=>{const i=name.indexOf(c,at);at=i+1;return i>=0;}))found.push(r);}}
  return exact.length===1?{status:'found',fund:view(exact[0]),candidates:[view(exact[0])]}:{status:found.length?'ambiguous':'unknown',query,message:found.length?'找到可能对应的基金，先确认具体哪只和份额。':'暂时没核对到这只基金，别猜代码。',candidates:found.slice(0,12).map(view),candidateCount:found.length};
}
