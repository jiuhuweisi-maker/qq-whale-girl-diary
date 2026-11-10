// Popular discovery with a smaller personal-interest slot; pure, no extra requests.
export function popularMix(candidates,entries,{n=5,select,seed=0}={}){
 const total=Math.max(1,Math.min(30,Math.floor(n))),wanted=Math.ceil(total*.6),picked=[],ups=new Set();
 const trending=candidates.filter(x=>['热门','排行'].includes(x.kw)).sort((a,b)=>(b._score||0)-(a._score||0)||String(a.bv).localeCompare(String(b.bv)));
 for(const x of trending){if(picked.length>=wanted)break;if(x.up&&ups.has(x.up))continue;picked.push({...x,_via:'热门/排行'});if(x.up)ups.add(x.up);}
 const seen=new Set(picked.map(x=>x.bv)),rest=candidates.filter(x=>!seen.has(x.bv));
 const tail=select(rest,entries,{n:total-picked.length,perPref:1,generic:total,seed});
 for(const x of tail.picked){if(picked.length>=total)break;if(!seen.has(x.bv)){picked.push(x);seen.add(x.bv);}}
 return {...tail,picked};
}
