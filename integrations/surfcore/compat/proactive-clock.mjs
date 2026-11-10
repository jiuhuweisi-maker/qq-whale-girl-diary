// The existing fsynced delivery ledger owns the clock too: restarting a bridge
// must not postpone every opportunity, and overdue opportunities are not replayed.
export function proactiveDelay(ledger,key,{min,max,now=Date.now(),random=Math.random,advance=false}={}) {
  if(!ledger?.healthy)return null;
  const lower=Math.max(60000,Number(min)||1800000),upper=Math.max(lower,Number(max)||5400000);
  const previous=ledger.data.proactiveClock?.[key]?.nextAt;
  if(!advance&&Number.isFinite(previous)&&previous>now&&previous<=now+upper)return previous-now;
  const nextAt=now+Math.floor(lower+Math.max(0,Math.min(1,random()))*(upper-lower));
  if(!ledger.change(d=>{(d.proactiveClock||={})[key]={nextAt};}))return null;
  return nextAt-now;
}
