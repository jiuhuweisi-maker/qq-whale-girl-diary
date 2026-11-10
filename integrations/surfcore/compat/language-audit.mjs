import path from 'node:path';
import {readJson,settings,hash} from './language-style.mjs';
import {qualityPack} from './language-learning.mjs';
// Diagnostics only; no raw comment bodies, account identities or model calls.
export function languageAudit(home,now=Date.now()){
  const rows=readJson(path.join(home,'corpus.json'),[]),s=settings(home),sources={},topics={},duplicates=new Set(),seen=new Set();let expired=0,invalid=0;
  for(const r of rows){
    sources[r.source]=(sources[r.source]||0)+1;topics[r.topic]=(topics[r.topic]||0)+1;
    const h=hash(String(r.text||'').replace(/[\s\p{P}]/gu,''));if(seen.has(h))duplicates.add(h);seen.add(h);
    if(!Number.isFinite(r.at)||now-r.at>s.corpusDays*86400000)expired++;
    if(!/^BV[0-9A-Za-z]{10}$/.test(r.source||'')||!r.text)invalid++;
  }
  const pack=readJson(path.join(home,'active-pack.json'),null),state=readJson(path.join(home,'learning.json'),{});
  return {corpusCount:rows.length,expired,invalid,duplicateTexts:duplicates.size,
    sources:Object.entries(sources).sort((a,b)=>b[1]-a[1]).map(([source,count])=>({source,count,share:count/Math.max(1,rows.length)})),
    topics,excludedSources:s.excludedSources,activePack:pack?{version:pack.version,...qualityPack(pack)}:null,
    browse:state.browse?{day:state.browse.day,candidates:state.browse.candidates,retained:state.browse.retained,filtered:state.browse.filtered,reasons:state.browse.reasons}:null,
    extraRequests:0,extraModelCalls:0};
}
