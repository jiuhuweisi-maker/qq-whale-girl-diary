import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {confirmedExpressionBlock} from '../compat/expression-style.mjs';import {qqPersona} from '../compat/conversation-logic.mjs';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]),src=fs.readFileSync(path.join(root,'plugins/surfcore/lib/scheduler.js'),'utf8'),a=src.indexOf('export function sanitizePersonaForBili'),b=src.indexOf('/** 人设卡：',a),c=src.indexOf('function personaCardBlock()'),d=src.indexOf('/** 身份对齐',c);assert(a>=0&&b>a&&c>b&&d>c);
const {composePersonaLayers}=await import(pathToFileURL(path.join(root,'src/persona-layers.js')));
const {buildPersonaIdentity,personaNameFromCard}=await import(pathToFileURL(path.join(root,'src/persona-identity.js')));
let style='可爱颜文字与小括号',card='身份底色\n'+('很长的人设正文'.repeat(900));
const env={readUnified:()=>({config:{persona:{compactChars:600}}}),resolvePersonaFile:()=>'/fixture/persona.md',readTextFile:()=>card,qqPersona,confirmedExpressionBlock,readConfiguredStyle:()=>style,path,QQ_STATE_DIR:'/fixture/state',composePersonaLayers,buildPersonaIdentity,personaNameFromCard,readPersonaLayerText:()=>''};
const render=new Function(...Object.keys(env),src.slice(a,b).replace('export function','function')+src.slice(c,d)+'return personaCardBlock();');
test('the actual Bili assembly keeps full shared preferences outside the persona truncation',()=>{const text=render(...Object.values(env));assert(text.includes(style));assert(text.indexOf(style)<text.indexOf('统一人设卡'));assert(text.length<1000);});
test('the actual Bili assembly reads changed preferences next time instead of an old embedded copy',()=>{render(...Object.values(env));style='新确认的emoji与情绪';const text=render(...Object.values(env));assert(text.includes(style));assert(!text.includes('可爱颜文字与小括号'));});
test('the shared preference block and persona keep public identity masking',()=>{style='账号87654321不会公开';card='身份底色\n## 群友QQ\n12345678\n## 性格\n可爱';const text=render(...Object.values(env));assert(!text.includes('87654321'));assert(!text.includes('12345678'));assert(text.includes('可爱'));});

test('the real Bili wake prompt permits social conversation and learns public usage without comment quotas as targets',()=>{
 const start=src.indexOf('function wakePrompt('),end=src.indexOf('\n/**',start);
 assert(start>=0&&end>start);
 const bindings={limitsNow:()=>({daily:0,globalMin:2,perUpMin:5,perVideoMin:5,taDaily:0,perThreadMin:60}),
  config:()=>({owner:{contactMode:'comment-mention'}}),kindsNow:()=>Object.fromEntries(['best','game','anime','gaming'].map(k=>[k,{slot:8,minLen:1,maxLen:80}])),interactEnabled:()=>true,
  identityContextLines:()=>['共享人设'],platformDir:()=>'/fixture/bili',path,fs:{existsSync:()=>true,readFileSync:()=>'{"last":null}'},
  silenceLines:()=>[],diaryPushLines:()=>[]};
 const wake=new Function(...Object.keys(bindings),src.slice(start,end)+'return wakePrompt;')(...Object.values(bindings));
 const text=wake({atText:'12:00'});
 for(const value of ['共享人设','评论区就按群聊','视频以外','journal --learn','疑似机器人','parent 填这次实际回应'])assert(text.includes(value));
 assert(!/额度要花完|每轮至少搭|还差.*条|一句话说完就走/.test(text));
 assert(!src.includes('bili-whale-ta-'));
 assert(text.includes('梗和反话'));assert(text.includes('疑似机器人可以略过'));
 assert(!/给鱼点赞|默认强制聚拢|--force-gather/.test(text));
});
