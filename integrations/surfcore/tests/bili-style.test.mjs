import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {confirmedExpressionBlock} from '../compat/expression-style.mjs';import {qqPersona} from '../compat/conversation-logic.mjs';
import {styleBlock} from '../compat/language-style.mjs';
import {compactBrowseInstructions} from '../compat/bili-wake-economy.mjs';
import {continuationHint,workbenchFile} from '../compat/experience-workbench.mjs';
import {pathToFileURL} from 'node:url';
import os from 'node:os';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]),src=fs.readFileSync(path.join(root,'plugins/surfcore/lib/scheduler.js'),'utf8'),a=src.indexOf('export function sanitizePersonaForBili'),b=src.indexOf('/** 人设卡：',a),c=src.indexOf('function personaCardBlock()'),d=src.indexOf('/** 身份对齐',c);assert(a>=0&&b>a&&c>b&&d>c);
const {composePersonaLayers}=await import(pathToFileURL(path.join(root,'src/persona-layers.js')));
const {buildPersonaIdentity,personaNameFromCard}=await import(pathToFileURL(path.join(root,'src/persona-identity.js')));
let style='可爱颜文字与小括号',card='身份底色\n'+('很长的人设正文'.repeat(900));
const env={readUnified:()=>({config:{persona:{compactChars:600}}}),resolvePersonaFile:()=>'/fixture/persona.md',readTextFile:()=>card,qqPersona,confirmedExpressionBlock,readConfiguredStyle:()=>style,path,QQ_STATE_DIR:'/fixture/state',composePersonaLayers,buildPersonaIdentity,personaNameFromCard,readPersonaLayerText:()=>''};
const render=new Function(...Object.keys(env),src.slice(a,b).replace('export function','function')+src.slice(c,d)+'return personaCardBlock();');
// 220: the permanent rules grew to ~2.3k chars after the owner added
// "don't invent progress" and "give the link when you mention a video".
// The shared block stays intact and the persona card is still capped at 600
// chars, so the budget is 3.6k. Rules are never compressed to fit a fixture.
test('the actual Bili assembly keeps full shared preferences outside the persona truncation',()=>{const text=render(...Object.values(env));assert(text.includes(style));assert(text.indexOf(style)<text.indexOf('统一人设卡'));assert(text.includes('主人永久规则'));assert(text.length<4300);});
test('the actual Bili assembly reads changed preferences next time instead of an old embedded copy',()=>{render(...Object.values(env));style='新确认的emoji与情绪';const text=render(...Object.values(env));assert(text.includes(style));assert(!text.includes('可爱颜文字与小括号'));});
test('the shared preference block and persona keep public identity masking',()=>{style='账号87654321不会公开';card='身份底色\n## 群友QQ\n12345678\n## 性格\n可爱';const text=render(...Object.values(env));assert(!text.includes('87654321'));assert(!text.includes('12345678'));assert(text.includes('可爱'));});

test('the real Bili wake prompt permits social conversation and learns public usage without comment quotas as targets',()=>{
 const start=src.indexOf('function wakePrompt('),end=src.indexOf('\n/**',start);
 assert(start>=0&&end>start);
 const bindings={styleBlock,compactBrowseInstructions,continuationHint,workbenchFile,limitsNow:()=>({daily:0,globalMin:2,perUpMin:5,perVideoMin:5,taDaily:0,perThreadMin:60}),
  config:()=>({owner:{contactMode:'comment-mention'}}),kindsNow:()=>Object.fromEntries(['best','game','anime','gaming'].map(k=>[k,{slot:8,minLen:1,maxLen:80}])),interactEnabled:()=>true,
  identityContextLines:()=>['共享人设'],platformDir:()=>'/fixture/bili',path,fs:{existsSync:()=>true,readFileSync:()=>'{"last":null}'},
  silenceLines:()=>[],diaryPushLines:()=>[]};
 const wake=new Function(...Object.keys(bindings),src.slice(start,end)+'return wakePrompt;')(...Object.values(bindings));
 const text=wake({atText:'12:00'});
 assert(text.length<3400,'procedural prompt stays compact without truncating identity (222 评论区玩法不压缩)');
 for(const value of ['共享人设','评论区就按群聊','视频以外','journal --learn','疑似机器人','parent 填这次实际回应'])assert(text.includes(value));
 assert(!/额度要花完|每轮至少搭|还差.*条|一句话说完就走/.test(text));
 assert(!src.includes('bili-whale-ta-'));
 assert(text.includes('梗和反话'));assert(text.includes('疑似机器人可以略过'));
 assert(!/给鱼点赞|默认强制聚拢|--force-gather/.test(text));
});
test('actual compact debrief reuses fetched subtitles, limits output and exposes the same local source through life CLI',t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'bili-debrief-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const dir=path.join(home,'.dsh/surfcore/bili');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'credentials.json'),JSON.stringify({sessdata:'fixture',bili_jct:'fixture',buvid3:'fixture'}));
 const preloader=path.join(home,'fake-network.mjs');fs.writeFileSync(preloader,`
 import fs from 'node:fs';import path from 'node:path';
 globalThis.fetch=async(url,opts={})=>{
  const u=String(url);
  if(opts.method==='POST'&&u.startsWith('https://api.bilibili.com/x/v2/reply/add?')){
   fs.appendFileSync(path.join(process.env.DSH_HOME,'fake-post-count'),'1');return Response.json({code:0,data:{rpid_str:'987'}});
  }
  if(opts.method&&opts.method!=='GET')throw Error('writes forbidden');
  if(u==='https://media.invalid/cover')return new Response('fixture');
  if(u==='https://media.invalid/subs')return Response.json({body:[{from:3,to:8,content:'实际取得的字幕原文，需要结合前后语境理解，不能仅凭标题就假定自己看懂了。'}]});
  if(u.startsWith('https://comment.bilibili.com/'))return new Response('<i></i>');
  if(u.includes('/nav'))return Response.json({code:0,data:{mid:123,uname:'离线测试',wbi_img:{img_url:'https://media.invalid/abcdefghijklmnopqrstuvwxyz012345.png',sub_url:'https://media.invalid/abcdefghijklmnopqrstuvwxyz012345.png'}}});
  if(u.includes('/web-interface/view'))return Response.json({code:0,data:{title:'测试视频',aid:456,cid:123,duration:8,pic:'https://media.invalid/cover',owner:{name:'来源作者',mid:789},stat:{view:10,like:2,danmaku:0,reply:9}}});
  if(u.includes('/player/wbi/v2'))return Response.json({data:{subtitle:{subtitles:[{lan:'zh-CN',subtitle_url:'https://media.invalid/subs'}]}}});
  if(u.includes('/reply/main'))return Response.json({code:0,data:{replies:Array.from({length:9},(_,i)=>({rpid:i+1,like:1,member:{uname:'路人'},content:{message:'这是假评论编号'+(i+1)}}))}});
  throw Error('unknown network request');
 };`);
 const env={...process.env,HOME:home,USERPROFILE:home,DSH_HOME:path.join(home,'.dsh'),SURFCORE_BILI_CONFIG:path.join(home,'bili.config.json'),WHALE_LANGUAGE_HOME:path.join(home,'language')};
 fs.writeFileSync(env.SURFCORE_BILI_CONFIG,'{}');
 const debrief=path.join(root,'plugins/surfcore/tools/commands/debrief.mjs');
 const run=flags=>execFileSync(process.execPath,['--import',pathToFileURL(preloader).href,debrief,'BVaaaaaaaaaa','--no-frames','--no-history',...flags],{env,encoding:'utf8',timeout:15000});
 const full=run([]),compact=run(['--compact']);assert(compact.length<full.length);assert(compact.includes('这是假评论编号5'));assert(!compact.includes('这是假评论编号6'));
 const cli=path.join(root,'plugins/surfcore/tools/bili.mjs'),status=JSON.parse(execFileSync(process.execPath,[cli,'life','status'],{env,encoding:'utf8',timeout:10000}));assert.equal(status.counts.sources,1);
 const state=JSON.parse(fs.readFileSync(path.join(dir,'experience-workbench.json'))),id=Object.keys(state.sources)[0];
 const src=JSON.parse(execFileSync(process.execPath,[cli,'life','source',id],{env,encoding:'utf8',timeout:10000}));assert.equal(src.rows[0].from,3);assert.equal(src.wholeVideoWatched,false);
 const commentArgs=['--import',pathToFileURL(preloader).href,path.join(root,'plugins/surfcore/tools/commands/comment.mjs'),'--oid','456','--bvid','BVaaaaaaaaaa','--message','这是一次离线模拟评论','--go'];
 const sent=execFileSync(process.execPath,commentArgs,{env,encoding:'utf8',timeout:15000});assert(sent.includes('接口已接受'));assert(!sent.includes('✅ 已发布'));
 assert.throws(()=>execFileSync(process.execPath,commentArgs,{env,encoding:'utf8',timeout:15000,stdio:'pipe'}));
 assert.equal(fs.readFileSync(path.join(env.DSH_HOME,'fake-post-count'),'utf8'),'1');
 assert.equal(Object.values(JSON.parse(fs.readFileSync(path.join(dir,'comment-operations.json'))).operations)[0].status,'accepted');
});
