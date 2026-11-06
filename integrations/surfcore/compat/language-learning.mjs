// Bounded, read-only learning. No model, browser, shell, credential or write API.
import fs from 'node:fs';
import path from 'node:path';
import bili from './fishtalk-bili.cjs';
import discovery from './fishtalk-discovery.cjs';
import rules from './fishtalk-rules.cjs';
import sim from './fishtalk-sim.cjs';
import {SCENES,settings,languageHome,readJson,atomicJson,hash,copyHash,sceneOf,features,validatePack,invalidateLanguageCache,historyRows} from './language-style.mjs';

const STATE=home=>path.join(home,'learning.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const roleName=/(?:机器人|智能体|智能助手|大肥鱼|鲸鱼娘|本鱼|bot\b|chatgpt|deepseek|claude|\bai\b)/i;
const unsafe=/(?:忽略|无视|覆盖).{0,12}(?:指令|规则|提示)|system\s*prompt|你现在(?:是|扮演)|执行.{0,8}(?:命令|代码)|泄露|开盒|人肉|加[微薇Vv]|私信.{0,6}(?:领|赚)|进群|优惠券|返利|代练|博彩|自杀吧|去死|支那|黑鬼|纳粹|杀光|操你|傻[逼屄]|废物|畜生|贱人|狗东西/iu;
const privacy=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)\d{7,}(?!\d)|(?:QQ|微信|住址|身份证|手机号)\s*[:：]?\s*[\w-]{5,}|[一-龥]{2,6}(?:省|市)[一-龥]{0,8}(?:区|县)[一-龥\d]{0,12}(?:路|街|道|巷)[一-龥\d]{0,8}\d+号)/iu;
const cleanText=t=>String(t||'').replace(/回复\s*@[^:：\n]{1,60}[:：]\s*/g,'').replace(/@[^\s:：，。！？]{1,60}/g,'').replace(/\[[^\]\n]{1,32}\]/g,'').trim();
export function assessCandidate(item,{known=[],own=[]}={}){
 const text=cleanText(item.text),n=rules.normalize(text);
 if(!n||!/[\p{L}\p{N}]/u.test(n))return {trust:'unknown',reason:'empty'};
 if(text.length>1000)return {trust:'unknown',reason:'size-bound'};
 if(String(item.context||'').length>1000)return {trust:'unknown',reason:'context-size-bound'};
 if(unsafe.test(text)||unsafe.test(item.context||''))return {trust:'low',reason:'unsafe-or-instruction'};
 if(privacy.test(text)||privacy.test(item.context||''))return {trust:'low',reason:'privacy-or-promotion'};
 if(item.suspectedBot||item.isSelf)return {trust:'low',reason:'suspected-role-or-self'};
 if(/(.)\1{7,}/u.test(n))return {trust:'low',reason:'spam'};
 if(own.some(x=>rules.normalize(x.text)===n||(n.length>=10&&sim.jaccard(text,x.text)>.85)))return {trust:'low',reason:'own-reply'};
 if(known.some(x=>rules.normalize(x.text)===n||(n.length>=10&&sim.jaccard(text,x.text)>.88)))return {trust:'low',reason:'duplicate'};
 // Even fishtalk's hard phrases are only evidence, never human/AI certification.
 const r=rules.score(text,{mode:'clean'}),f=features(text);
 if(r.hard.length+f.length>=2)return {trust:'low',reason:'stacked-ai-signals'};
 if(r.hard.length||f.length)return {trust:'unknown',reason:'uncertain-style'};
 const context=cleanText(item.context||'');
 if(context&&privacy.test(context))return {trust:'low',reason:'context-privacy'};
 return {trust:context&&item.contextRelation==='direct'?'high':'medium',reason:context?'interaction-evidence':'public-comment-only',text,context};
}
export function decodeComments(data,bvid,meta,exclude=[]){
 const roots=[...(data.top?[data.top]:[]),...(data.replies||[])].filter(x=>x&&typeof x==='object'),map=new Map(),out=[];
 for(const root of roots){map.set(String(root.rpid_str||root.rpid),root);for(const r of root.replies||[])map.set(String(r.rpid_str||r.rpid),r);}
 for(const root of roots)for(const r of [root,...(root.replies||[])]){
  const id=String(r.rpid_str||r.rpid||'');if(!id)continue;
  const parent=String(r.parent_str||r.parent||''),target=map.get(parent);
  const author=String(r.mid??r.member?.mid??''),text=r.content?.message||'';
  if(author===String(meta.owner))continue; // Keep fishtalk's UP promotion exclusion.
  out.push({id:hash(bvid+':'+id),source:bvid,url:`https://www.bilibili.com/video/${bvid}`,text,
   context:target&&target!==r?target.content?.message||'':'',contextRelation:target&&target!==r?'direct':'none',
   reply:r!==root,scene:sceneOf(meta.title+' '+text,r!==root),topic:meta.topic,
   author:hash(author),up:hash(String(meta.owner||'unknown:'+bvid)),popularity:meta.popularity,
   suspectedBot:roleName.test(r.member?.uname||'')||roleName.test(target?.member?.uname||'')||exclude.includes(author)||exclude.includes(String(target?.mid??target?.member?.mid??'')),
   // Context from a role account is excluded along with its reply.
   isSelf:exclude.includes(author)});
 }
 return out;
}
export function distillPack(corpus,run={},now=Date.now()){
 if(!corpus.length)return null;
 const counts={};for(const r of corpus)counts[r.source]=(counts[r.source]||0)+1;
 const topics={};for(const r of corpus)topics[r.topic]=(topics[r.topic]||0)+1;
 const upCounts={};for(const r of corpus)upCounts[r.up]=(upCounts[r.up]||0)+1;
 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const profile=rows=>({count:rows.length,medianChars:median(rows.map(x=>[...x.text].length)),replyRatio:+(rows.filter(x=>x.reply).length/rows.length).toFixed(3),questionRatio:+(rows.filter(x=>/[?？]/.test(x.text)).length/rows.length).toFixed(3),noEndPunctRatio:+(rows.filter(x=>!/[。？！!?]$/.test(x.text)).length/rows.length).toFixed(3)});
 const genre={'动漫二次元':'动画区','游戏':'游戏区','搞笑':'鬼畜区','生活分享':'生活区'};
 const scenes=SCENES.flatMap(name=>{const rows=corpus.filter(x=>x.scene===name||x.topic===genre[name]);return rows.length?[{name,...profile(rows)}]:[];});
 // No copied phrases, titles, user names, comments or arbitrary instructions.
 const pack={schema:1,name:'whale_bilibili_style_v1',createdAt:new Date(now).toISOString(),
  method:'local-statistics; expression evidence only, no human identity certification',
  stats:{retained:corpus.length,videoCount:Object.keys(counts).length,high:corpus.filter(x=>x.trust==='high').length,medium:corpus.filter(x=>x.trust==='medium').length,topics,sourceCounts:counts,largestUpShare:Math.max(...Object.values(upCounts))/corpus.length},
  rhythm:profile(corpus),scenes,filterStats:run,copyFingerprints:corpus.map(x=>rules.normalize(x.text)).filter(x=>x.length>=12).map(x=>({chars:x.length,prefix:copyHash(x.slice(0,12)),hash:copyHash(x)})),
  interactionFeatures:['承接明确的回复对象','先回应具体细节','反差与反问按语境使用','话题结束可以停'],
  avoid:['反复套用同一种开头与结尾','脱离上下文搬运热梗','机械附和或说教','照抄外部评论'],
  priority:['safety','existing-persona','current-context','scene-style','wording']};
 const {createdAt,filterStats,...content}=pack;
 pack.version='v'+hash(JSON.stringify(content)).slice(0,16);
 return pack;
}
export function qualityPack(pack){
 if(!validatePack(pack))return {ok:false,reason:'schema-or-insufficient-sources'};
 const {retained:n,sourceCounts,topics}=pack.stats;
 if(Math.max(...Object.values(sourceCounts))/n>.55)return {ok:false,reason:'single-source-dominance'};
 if(pack.stats.largestUpShare>.55)return {ok:false,reason:'single-up-dominance'};
 if(Object.keys(topics).length<2||Math.max(...Object.values(topics))/n>.75)return {ok:false,reason:'topic-dominance'};
 return {ok:true};
}
export function publishPack(home,pack,s=settings(home)){
 const check=qualityPack(pack);if(!check.ok)return check;
 fs.mkdirSync(path.join(home,'versions'),{recursive:true});
 const old=readJson(path.join(home,'active-pack.json'),null);
 if(validatePack(old))atomicJson(path.join(home,'versions',old.version+'.json'),old);
 atomicJson(path.join(home,'versions',pack.version+'.json'),pack);
 atomicJson(path.join(home,'active-pack.json'),pack);invalidateLanguageCache();
 const files=fs.readdirSync(path.join(home,'versions')).filter(x=>/^v[0-9a-f]{16}\.json$/.test(x)).sort((a,b)=>fs.statSync(path.join(home,'versions',b)).mtimeMs-fs.statSync(path.join(home,'versions',a)).mtimeMs);
 for(const f of files.slice(s.maxVersions))if(f!==pack.version+'.json')fs.unlinkSync(path.join(home,'versions',f));
 return {ok:true,version:pack.version};
}
export function rollbackPack(home,version){
 if(!/^v[0-9a-f]{16}$/.test(version||''))throw Error('Invalid version');
 const pack=readJson(path.join(home,'versions',version+'.json'),null);
 if(!qualityPack(pack).ok)throw Error('Rollback pack failed validation');
 atomicJson(path.join(home,'active-pack.json'),pack);invalidateLanguageCache();return version;
}
export async function learnOnce({home=languageHome(),initial=false,automatic=false,excludeAuthorIds=[],fetchImpl=globalThis.fetch,now=Date.now,onProgress=()=>{}}={}){
 const s=settings(home),start=now(),previous=readJson(STATE(home),{});
 if(automatic&&(!s.autoLearn||!s.enabled))return {skipped:'disabled'};
 if(start-Number(previous.lastAttempt||0)<s.intervalHours*3600000)return {skipped:'daily-limit',lastAttempt:previous.lastAttempt};
 if(Number(previous.blockedUntil||0)>start)return {skipped:'cooldown'};
 fs.mkdirSync(home,{recursive:true});let lock;
 let state={...previous,lastAttempt:start};
 const limit=initial?{videos:12,candidates:800,accepted:400,ms:900000}:{videos:s.maxVideos,candidates:s.maxCandidates,accepted:s.maxAccepted,ms:s.maxDurationMs};
 const deadline=start+limit.ms;
 const stats={startedAt:new Date(start).toISOString(),videosDiscovered:0,videosAttempted:0,videosCollected:0,candidates:0,filtered:0,retained:0,trust:{high:0,medium:0,low:0,unknown:0},reasons:{},requests:0,errors:[]};
 let lastRequest=0,networkBlocked=false;
 const stop=()=>{if(now()>=deadline)throw Object.assign(Error('time-budget'),{code:'time-budget'});if(automatic&&!settings(home).autoLearn)throw Object.assign(Error('paused'),{code:'paused'});};
 // One rate gate and deadline covers discovery AND collection, including fetch body reads.
 const request=async(url,options={})=>{
  stop();if(networkBlocked)throw new bili.BiliError('rate_limited','public-access-blocked');
  const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='api.bilibili.com')throw Error('Unexpected public endpoint');
  const wait=Math.max(0,lastRequest+s.requestIntervalMs-now());if(now()+wait>=deadline)throw Object.assign(Error('time-budget'),{code:'time-budget'});if(wait)await sleep(wait);stop();
  lastRequest=now();stats.requests++;
  const signal=AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-now())));
  const res=await fetchImpl(url,{...options,method:'GET',redirect:'error',signal});
  if([401,403,412,429].includes(res.status)){networkBlocked=true;throw new bili.BiliError('rate_limited','http-block-'+res.status);}
  if(!res.ok)throw Object.assign(Error('http-error'),{code:'http-'+res.status});
  const raw=await res.text();if(Buffer.byteLength(raw)>4*1024*1024)throw Error('response-size');
  let data;try{data=JSON.parse(raw);}catch{throw Error('invalid-json');}
  if([-352,-412,-509,-401,-403].includes(data.code)){networkBlocked=true;throw new bili.BiliError('rate_limited','api-block-'+data.code);}
  return new Response(raw,{status:res.status,headers:{'content-type':'application/json'}});
 };
 let corpus=readJson(path.join(home,'corpus.json'),[]).filter(x=>start-x.at<s.corpusDays*86400000).slice(-s.maxCorpus);
 let seen=readJson(path.join(home,'seen.json'),[]).filter(x=>start-x.at<90*86400000).slice(-6000);
 const seenIds=new Set(seen.map(x=>x.id)),own=historyRows(home,start),sources=new Set(),ups=new Set();
 try{lock=fs.openSync(path.join(home,'learning.lock'),'wx');}catch(e){if(e.code==='EEXIST')return {skipped:'in-progress'};throw e;}
 try{
  atomicJson(STATE(home),state);
  const topics=['动画区','游戏区','生活区','鬼畜区'];
  // Rotate discovery by day; sample across reply/popularity ranks, not just the top.
  const offset=Math.floor(start/86400000)%topics.length,ordered=topics.slice(offset).concat(topics.slice(0,offset)),videos=[];
  for(const topic of ordered){
   stop();try{const links=await discovery.discover(topic,{limit:20,fetch:request,intervalMs:0,timeoutMs:15000});
    for(const i of [1,7,15])if(links[i])videos.push({bvid:bili.normalizeBvid(links[i]),topic});
   }catch(e){stats.errors.push({phase:'discover',code:e.code||'network'});if(e.code==='rate_limited'||e.code==='time-budget')throw e;}
  }
  stats.videosDiscovered=videos.length;
  // Round-robin the themes so an early candidate cap cannot select a single topic.
  const ranked=videos.map((v,i)=>({...v,rank:i%3})).sort((a,b)=>a.rank-b.rank);
  for(const video of ranked){
   stop();if(stats.videosAttempted>=limit.videos||stats.candidates>=limit.candidates)break;
   if(sources.has(video.bvid))continue;
   stats.videosAttempted++;let meta={topic:video.topic},decoded=[];
   try{
    await bili.collect(video.bvid,{includeDanmaku:false,retries:0,intervalMs:0,timeoutMs:15000,fetch:async(url,opts)=>{
     const res=await request(url,opts),j=await res.clone().json();
     if(String(url).includes('/view?')){meta={...meta,title:j.data?.title||'',owner:j.data?.owner?.mid,popularity:j.data?.stat?.view||0};
      if(ups.has(hash(String(meta.owner))))throw Object.assign(Error('duplicate-up'),{code:'duplicate-up'});}
  if(String(url).includes('/reply/main?'))decoded=decodeComments(j.data||{},video.bvid,meta,[...s.excludeAuthorIds,...excludeAuthorIds.map(String)]);
     return res;
    }});
    sources.add(video.bvid);ups.add(hash(String(meta.owner)));stats.videosCollected++;
    for(const item of decoded){
     if(stats.candidates>=limit.candidates)break;stats.candidates++;
     const prior=seenIds.has(item.id),assessment=prior?{trust:'low',reason:'seen-source'}:assessCandidate(item,{known:corpus,own});
     stats.trust[assessment.trust]++;
     if(!prior){seen.push({id:item.id,at:start});seenIds.add(item.id);}
     const sourceN=corpus.filter(x=>x.source===item.source).length,authorN=corpus.filter(x=>x.author===item.author).length;
     const cap=stats.retained>=limit.accepted?'accepted-cap':sourceN>=Math.max(15,Math.floor(limit.accepted/4))?'source-cap':authorN>=5?'author-cap':'';
     if(['high','medium'].includes(assessment.trust)&&!cap){
      // Retain public text only in the private, bounded local corpus. Never publish it to Git/prompts.
      const {suspectedBot,isSelf,...safe}=item;
      corpus.push({...safe,text:assessment.text,context:assessment.context,trust:assessment.trust,at:start});stats.retained++;
     }else{stats.filtered++;const reason=cap||assessment.reason;stats.reasons[reason]=(stats.reasons[reason]||0)+1;}
    }
    onProgress({videos:stats.videosCollected,candidates:stats.candidates,retained:stats.retained});
   }catch(e){stats.errors.push({phase:'collect',source:video.bvid,code:e.code||'network'});if(['rate_limited','time-budget','paused'].includes(e.code))throw e;}
  }
 }catch(e){stats.stopped=e.code||'error';if(e.code==='rate_limited')state.blockedUntil=now()+Math.max(600000,s.intervalHours*3600000);}
 finally{
  try{
   corpus=corpus.slice(-s.maxCorpus);seen=seen.slice(-6000);
   atomicJson(path.join(home,'corpus.json'),corpus);atomicJson(path.join(home,'seen.json'),seen);
   stats.durationMs=now()-start;
   const pack=distillPack(corpus,{...stats},now());stats.publication=pack?publishPack(home,pack,s):{ok:false,reason:'no-corpus'};
   state={...state,lastCompleted:now(),stats,corpusCount:corpus.length};atomicJson(STATE(home),state);
  }finally{fs.closeSync(lock);fs.unlinkSync(path.join(home,'learning.lock'));}
 }
 return stats;
}
let background=null;
export function maybeLearn({log=()=>{},home=languageHome(),excludeAuthorIds=[]}={}){
 if(background)return;
 try{const s=settings(home);if(!s.enabled||!s.autoLearn||s.learningMode!=='scheduled')return;const state=readJson(STATE(home),{});if(Date.now()-Number(state.lastAttempt||0)<s.intervalHours*3600000)return;
 background=learnOnce({home,automatic:true,excludeAuthorIds}).then(r=>log('[文风学习] '+JSON.stringify(r))).catch(e=>log('[文风学习] '+String(e.code||e.name))).finally(()=>{background=null;});
 }catch(e){log('[文风学习] 配置不可读：'+String(e.code||e.name));}
}
export const shanghaiDay=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
// Consume only comments already read by the normal Bili tools. This path has no fetch.
export function learnFromBrowse({bvid,data,meta={},excludeAuthorIds=[],home=languageHome(),now=Date.now()}={}){
 const s=settings(home);if(!s.enabled||!s.autoLearn||s.learningMode!=='browse')return {skipped:'disabled'};
 if(!/^BV[0-9A-Za-z]{10}$/.test(bvid||''))return {skipped:'invalid-source'};
 fs.mkdirSync(home,{recursive:true});let lock;
 try{lock=fs.openSync(path.join(home,'learning.lock'),'wx');}catch(e){if(e.code==='EEXIST')return {skipped:'in-progress'};throw e;}
 try{
  const old=readJson(STATE(home),{}),day=shanghaiDay(now);
  const budget=old.browse?.day===day?old.browse:{day,videos:[],candidates:0,retained:0,filtered:0,elapsedMs:0,reasons:{}};
  if(budget.candidates>=s.maxCandidates||budget.retained>=s.maxAccepted||budget.elapsedMs>=s.maxDurationMs)return {skipped:'daily-limit',budget};
  if(!budget.videos.includes(bvid)&&budget.videos.length>=s.maxVideos)return {skipped:'video-limit',budget};
  const began=Date.now(),deadline=began+Math.min(1500,s.maxDurationMs-budget.elapsedMs);
  const corpus=readJson(path.join(home,'corpus.json'),[]).filter(x=>now-x.at<s.corpusDays*86400000).slice(-s.maxCorpus);
  const seen=readJson(path.join(home,'seen.json'),[]).filter(x=>now-x.at<90*86400000).slice(-6000),ids=new Set(seen.map(x=>x.id));
  const own=historyRows(home,now),topic=meta.topic||({1:'动画区',4:'游戏区',119:'鬼畜区',160:'生活区'}[meta.tid])||'热门综合';
  const decoded=decodeComments(data||{},bvid,{...meta,topic},[...s.excludeAuthorIds,...excludeAuthorIds.map(String)]);
  if(!decoded.length)return {skipped:'empty'};
  if(!budget.videos.includes(bvid))budget.videos.push(bvid);
  let added=0;
  for(const item of decoded){
   if(Date.now()>=deadline||budget.candidates>=s.maxCandidates||budget.retained>=s.maxAccepted)break;
   if(ids.has(item.id))continue;
   budget.candidates++;seen.push({id:item.id,at:now});ids.add(item.id);
   const assessment=assessCandidate(item,{known:corpus,own});
   const cap=corpus.filter(x=>x.source===bvid).length>=Math.max(15,Math.floor(s.maxAccepted/4))?'source-cap':corpus.filter(x=>x.author===item.author).length>=5?'author-cap':'';
   if(['high','medium'].includes(assessment.trust)&&!cap){
    const {suspectedBot,isSelf,...safe}=item;corpus.push({...safe,text:assessment.text,context:assessment.context,trust:assessment.trust,at:now});budget.retained++;added++;
   }else{budget.filtered++;const reason=cap||assessment.reason;budget.reasons[reason]=(budget.reasons[reason]||0)+1;}
  }
  budget.elapsedMs+=Date.now()-began;
  const kept=corpus.slice(-s.maxCorpus);atomicJson(path.join(home,'corpus.json'),kept);atomicJson(path.join(home,'seen.json'),seen.slice(-6000));
  const stats={mode:'browse',day,videosCollected:budget.videos.length,candidates:budget.candidates,retained:budget.retained,filtered:budget.filtered,reasons:budget.reasons,requests:0,durationMs:budget.elapsedMs};
  // Unchanged/empty observations do not churn the active version.
  const pack=added?distillPack(kept,stats,now):null;
  const publication=pack?publishPack(home,pack,s):{ok:true,unchanged:true};
  atomicJson(STATE(home),{...old,initialStats:old.initialStats||(old.stats?.mode!=='browse'?old.stats:undefined),lastAttempt:now,lastCompleted:now,browse:budget,stats:{...stats,publication},corpusCount:kept.length});
  return {...stats,added,publication};
 }finally{fs.closeSync(lock);fs.unlinkSync(path.join(home,'learning.lock'));}
}
