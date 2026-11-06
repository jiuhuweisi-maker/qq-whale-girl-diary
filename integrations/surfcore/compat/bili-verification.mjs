import {observeCommentRows} from './bili-operations.mjs';
const rid=r=>String(r?.rpid_str??r?.rpid??'');
// Explicit readback only. No added POST-time polling and no negative inference
// from a partial page. HTTP failures stop the bounded verification pass.
export async function verifyComment({file,oid,rpid,root='',type='1',referer='https://www.bilibili.com/',cookie='',fetchImpl=fetch}={}){
  if(![oid,rpid].every(x=>/^\d{1,22}$/.test(String(x)))||root&&!/^\d{1,22}$/.test(String(root))||!['1','11','17'].includes(String(type)))throw Error('评论复核参数无效');
  let requests=0,publicSeen=false,accountSeen=false,blocked=false,accountProof=false;
  const deadline=Date.now()+45000;
  async function scan(authenticated){
    for(let pn=1;pn<=3&&Date.now()<deadline;pn++){
      const query=root?`reply/reply?type=${type}&oid=${oid}&root=${root}&pn=${pn}&ps=20`:`reply?type=${type}&oid=${oid}&pn=${pn}&ps=20&sort=2`;
      const headers={'user-agent':'Mozilla/5.0',referer,...(authenticated&&cookie?{cookie}:{})};
      requests++;
      const response=await fetchImpl('https://api.bilibili.com/x/v2/'+query,{headers,signal:AbortSignal.timeout(Math.max(1,Math.min(12000,deadline-Date.now())))});
      if(!response.ok){blocked=true;return false;}
      const json=await response.json();if(json.code!==0){blocked=true;return false;}
      const list=[json.data?.root,...(json.data?.replies||[])].filter(Boolean),hit=list.find(r=>rid(r)===String(rpid));
      if(hit){
        const result=observeCommentRows(file,{oid,type,rows:[hit],anonymous:!authenticated});
        // Visibility can be observed for any requested rpid; ledger proof still
        // requires exact author, target, content and parent matching.
        return {seen:true,ledgerVerified:result.verified>0};
      }
      if((json.data?.replies||[]).length<20)break;
    }
    return false;
  }
  const anon=await scan(false);publicSeen=!!anon;
  if(!publicSeen&&!blocked&&cookie){const result=await scan(true);accountSeen=!!result;accountProof=!!result?.ledgerVerified;}
  return {rpid:String(rpid),visibility:publicSeen?'anonymous_seen':accountSeen?'account_seen_public_unknown':'unknown',
    publicSeen,accountSeen,ledgerVerified:!!anon?.ledgerVerified||accountProof,requests,blocked,
    resendAllowed:false,message:publicSeen?'这次匿名回读看到了该评论。':accountSeen?'登录态看到了，匿名本次未找到；公开状态仍待核实，不重发。':'本次有限回读未确认；不能据此认定没有发布，不重发。'};
}
