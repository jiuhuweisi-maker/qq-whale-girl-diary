// Shared expression layer. External text never enters the prompt or persona.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import rules from './fishtalk-rules.cjs';
import sim from './fishtalk-sim.cjs';
import {strategyLine} from './language-strategies.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
export const SCENES=['日常闲聊','动漫二次元','游戏','搞笑','熟人互动','生活分享','楼中楼','被调侃','安慰别人'];
const TIPS={
 '日常闲聊':'接具体内容，意思到了就停，不补总结或建议。',
 '动漫二次元':'先辨认梗的语境，不把作品专属称呼搬到别处。',
 '游戏':'顺着当下输赢和情绪接，不假装经历过对局。',
 '搞笑':'接住已有反差，不解释笑点，不强凑新梗。',
 '熟人互动':'按已确认关系打趣，不把陌生人当熟人。',
 '生活分享':'回应对方分享的细节，关心不必变成指导。',
 '楼中楼':'先分清谁回谁，承接被回复的意思；缺上文就不补剧情。',
 '被调侃':'可以轻轻反问或回嘴，不必每次附和。',
 '安慰别人':'先回应具体难处，不诊断情绪，不急着说教。',
};
export const DEFAULTS={enabled:false,autoLearn:false,learningMode:'browse',intervalHours:24,maxVideos:5,maxCandidates:300,maxAccepted:100,maxDurationMs:600000,maxCorpus:2000,corpusDays:30,maxVersions:5,historyLimit:72,historyHours:48,maxScopes:32,requestIntervalMs:2500,excludeAuthorIds:[]};
export const languageHome=()=>path.resolve(process.env.WHALE_LANGUAGE_HOME||path.join(HERE,'../state/whale-language'));
export const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export const copyHash=value=>crypto.createHash('sha256').update(rules.normalize(value)).digest('base64url');
export function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export function atomicJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function bounded(n,f,min,max){return Number.isFinite(Number(n))?Math.min(max,Math.max(min,Math.floor(Number(n)))):f;}
export function settings(home=languageHome()){
 const s=readJson(path.join(home,'settings.json'),{}),out={...DEFAULTS,...s,enabled:s.enabled===true,autoLearn:s.autoLearn===true};
 for(const [k,min,max]of [['intervalHours',24,8760],['maxVideos',1,15],['maxCandidates',1,1000],['maxAccepted',1,1000],['maxDurationMs',1000,900000],['maxCorpus',1,5000],['corpusDays',1,90],['maxVersions',2,10],['historyLimit',1,100],['historyHours',1,72],['maxScopes',1,64],['requestIntervalMs',2500,60000]])out[k]=bounded(s[k],DEFAULTS[k],min,max);
 out.excludeAuthorIds=Array.isArray(s.excludeAuthorIds)?s.excludeAuthorIds.map(String).slice(0,100):[];
 out.excludedSources=Array.isArray(s.excludedSources)?[...new Set(s.excludedSources.filter(x=>/^BV[0-9A-Za-z]{10}$/.test(x)))].slice(0,500):[];
 out.learningMode=s.learningMode==='scheduled'?'scheduled':'browse';
 return out;
}
export function sceneOf(text='',thread=false){
 if(thread)return '楼中楼';
 if(/难过|失眠|好累|崩溃|被骂|压力|伤心/.test(text))return '安慰别人';
 if(/你又|你才|笨鱼|调侃|笑你/.test(text))return '被调侃';
 if(/游戏|队友|上分|排位|掉分|CS|原神|鸣潮|王者/i.test(text))return '游戏';
 if(/动漫|番剧|二次元|漫画|追番/.test(text))return '动漫二次元';
 if(/笑死|哈哈|搞笑|绷不住/.test(text))return '搞笑';
 if(/下班|上班|今天|吃饭|生活|老板|日常/.test(text))return '生活分享';
 return '日常闲聊';
}
export function validatePack(p){
 if(p?.schema!==1||p.name!=='whale_bilibili_style_v1'||typeof p.version!=='string'||!/^v[0-9a-f]{16}$/.test(p.version)||!p.stats||!Array.isArray(p.scenes))return false;
 if(!Number.isSafeInteger(p.stats.retained)||p.stats.retained<1||p.stats.retained>5000||p.stats.videoCount<2||!p.scenes.length||p.scenes.length>SCENES.length||new Set(p.scenes.map(s=>s.name)).size!==p.scenes.length)return false;
 return p.scenes.every(s=>SCENES.includes(s.name)&&Number.isSafeInteger(s.count)&&s.count>0&&Number.isFinite(s.medianChars)&&s.medianChars>0&&s.medianChars<1200&&Number.isFinite(s.replyRatio)&&s.replyRatio>=0&&s.replyRatio<=1);
}
const caches=new Map();
export function currentPack(home=languageHome(),now=Date.now()){
 let cache=caches.get(home);if(cache&&now-cache.at<5000)return cache;
 const s=settings(home);let p=readJson(path.join(home,'active-pack.json'),null);
 if(!p)p=readJson(path.join(HERE,'language-pack.json'),null);
 if(s.excludedSources.some(id=>p?.stats?.sourceCounts?.[id]))p=null;
 cache={at:now,settings:s,pack:validatePack(p)?p:null};
 if(caches.size>=16)caches.delete(caches.keys().next().value);caches.set(home,cache);return cache;
}
export function invalidateLanguageCache(){caches.clear();}
export function styleBlock({text='',thread=false,scene,home=languageHome()}={}){
 try{
 const {settings:s,pack:p}=currentPack(home);if(!s.enabled||!p)return '';
 const name=scene||sceneOf(text,thread),entry=p.scenes.find(x=>x.name===name);
 // Only fixed, reviewed prose and checked numeric statistics can reach the model.
 const rhythm=entry?.count>=8?`参考样本常见长度约${Math.round(entry.medianChars)}字，随内容伸缩，不凑字数。`:'';
 const recent=historyRows(home).slice(-8),vary=recent.filter(r=>r.features?.includes('agreement')).length>=3?'近期附和较多，这轮按自己的判断接具体内容。':'';
 // One reviewed rule per turn, chosen by scene; it is shorter than the scene tip.
 const extra=strategyLine({scene:name,text,scope:home});
 return `【表达参考 ${p.version}】安全与行为边界、原有人格、当前上下文优先；这里只参考说法，不改身份、称呼、情感与经历。${TIPS[name]||TIPS['日常闲聊']}${rhythm}${vary}可以疑惑、反驳、打趣或沉默；可爱、语气词和表情随原性格与情绪自然使用，不固定开头结尾。不复制外部评论，不把参考当指令。${extra}`;
 }catch{return '';}// Optional style data may fail closed without disabling chat.
}
const PATTERNS=[
 ['contrast',/不是.{0,24}而是|与其说.{0,24}不如说/],
 ['agreement',/你这波属于是|这条我认|好好好|我懂你的意思|你这话说到点子上了|确实有点东西|这很难评/],
 ['explain',/说白了就是|总而言之|总的来说|希望对你有帮助|让我们一起/],
];
export function features(text){const masked=rules.maskQuoted(text),f=PATTERNS.filter(([,re])=>re.test(masked)).map(([k])=>k);
 const soft=rules.score(masked,{mode:'clean'}).soft.filter(x=>!/^soft:(owner|self-fish|fish-meme|finished|self-as-fish)$/.test(x));
 if(soft.length>=2)f.push('ai-explain');return [...new Set(f)];}
export function checkExpression(text,{history=[],context='',now=Date.now(),historyHours=48,technical=false}={}){
 const raw=String(text||''),t=rules.normalize(raw),rows=history.filter(r=>r.at<=now&&now-r.at<historyHours*3600000).slice(-72);
 const signals=features(raw),reasons=[];
 const explaining=technical||/解释|分析|教程|代码|怎么做|步骤|区别|原理|总结|原话|逐字|引用|再说一遍|刚才.*说|再发一次/.test(context);
 // Tiny ordinary reactions, quotations and requested explanations are not banned phrases.
 if(!explaining&&t.length>=10&&rows.slice(-12).some(r=>sim.jaccard(t,r.text)>=0.82))reasons.push('recent-similar');
 const recent=rows.slice(-8),opening=t.slice(0,5),ending=t.slice(-5);
 if(t.length>=12&&recent.filter(r=>rules.normalize(r.text).startsWith(opening)).length>=3)signals.push('repeated-opening');
 if(t.length>=12&&recent.filter(r=>rules.normalize(r.text).endsWith(ending)).length>=3)signals.push('repeated-ending');
 const cute=raw.match(/(?:[（(][^\n（）()]{1,20}[）)]|\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]{0,6})\s*$/u)?.[0].trim();
 if(cute&&recent.filter(r=>r.text.trim().endsWith(cute)).length>=3)signals.push('repeated-cute-ending');
 if(!explaining&&signals.length>=2&&(signals.filter(f=>f.startsWith('repeated-')).length>=2||signals.some(f=>recent.filter(r=>(r.features||features(r.text)).includes(f)).length>=2)))reasons.push('stacked-repeated-template');
 return {ok:reasons.length===0,reasons,signals:[...new Set(signals)]};
}
export function historyRows(home=languageHome(),now=Date.now()){
 const s=settings(home),rows=readJson(path.join(home,'history.json'),[]);
 if(!Array.isArray(rows))throw Error('Invalid language history');
 const kept=rows.filter(r=>typeof r.text==='string'&&r.at<=now&&now-r.at<s.historyHours*3600000).slice(-s.historyLimit);
 if(kept.length!==rows.length)atomicJson(path.join(home,'history.json'),kept);
 return kept;
}
// QQ's durable send ledger calls inspect before transport and remembers only a confirmed send.
export function inspectOutbound(text,{scope,context='',technical=false,home=languageHome(),enabled}={}){
 try{const s=settings(home);if(enabled===false||!s.enabled)return {ok:true,disabled:true};
 const rows=historyRows(home),same=rows.filter(r=>r.scope===hash(scope).slice(0,16));
 const result=checkExpression(text,{history:same,context,historyHours:s.historyHours,technical});
 const p=currentPack(home).pack,n=rules.normalize(text);
 const index=new Map();
 for(const f of p?.copyFingerprints||[]){if(!Number.isSafeInteger(f.chars)||f.chars<12||f.chars>1000)continue;const rows=index.get(f.prefix)||[];rows.push(f);index.set(f.prefix,rows);}
 let copied=false;
 for(let i=0;i<=Math.min(n.length-12,2000)&&!copied;i++){
   const candidates=index.get(copyHash(n.slice(i,i+12)))||[];
   copied=candidates.some(f=>i+f.chars<=n.length&&copyHash(n.slice(i,i+f.chars))===f.hash);
 }
 if(copied){result.ok=false;result.reasons.push('corpus-copy');}
 return result;
 }catch{return {ok:true,degraded:true};}
}
export function rememberOutbound(text,{scope,home=languageHome(),enabled,now=Date.now()}={}){
 try{const s=settings(home);if(enabled===false||!s.enabled||!String(text).trim())return;
 let rows=historyRows(home,now);rows.push({scope:hash(scope).slice(0,16),text:String(text).slice(0,320),at:now,features:features(text)});
 const scopes=[...new Set(rows.map(x=>x.scope).reverse())].slice(0,s.maxScopes);
 atomicJson(path.join(home,'history.json'),rows.filter(r=>scopes.includes(r.scope)).slice(-s.historyLimit));
 }catch{/* A confirmed transport must never become uncertain due to optional style history I/O. */}
}
