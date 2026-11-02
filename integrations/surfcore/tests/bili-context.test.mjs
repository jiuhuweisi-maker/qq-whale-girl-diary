import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ownerMentionMap, publicWatchFacts} from '../compat/bili-context.mjs';

test('only an explicit exact owner nickname gets a stable string UID mapping', () => {
  const owner={name:'小鱼(主人)',mid:'12345678901234567'};
  assert.deepEqual(ownerMentionMap('@小鱼(主人) 这个有点好笑呀',owner),{'小鱼(主人)':'12345678901234567'});
  assert.equal(ownerMentionMap('普通评论，不用喊人',owner),null);
  assert.equal(ownerMentionMap('@小鱼(主人)的冒牌号 不要误叫',owner),null);
  assert.equal(ownerMentionMap('@别的群友 哈哈',owner),null);
  assert.throws(()=>ownerMentionMap('@小鱼(主人) 看这里',{name:owner.name}),/未配置/);
  assert.equal(ownerMentionMap('@谁 空配置'),null);
});

test('watch metadata cannot become a full viewing claim or a made-up subtitle opinion', () => {
  const at='2026-11-01T03:00:00Z', now=Date.parse('2026-11-02T03:00:00Z');
  const rows=[{bvid:'BV1abcdefghA',title:'小猫打哈欠',at,mode:'meta'},
    {bvid:'BV1abcdefghB',title:'指数基金基础',at,mode:'full',subs:'recorded-subtitles.txt'},
    {bvid:'BV1abcdefghC',title:'鱼摆尾巴',at,mode:'frames',frames:true},
    {bvid:'BV1abcdefghD',title:'未来记录',at:'2030-01-01T00:00:00Z'},
    {bvid:'BV1abcdefghE',title:'未知日期',at,unknownDate:true}];
  const facts=publicWatchFacts(rows,now);assert.equal(facts.length,3);
  assert(facts[0].coverage.includes('仅浏览过'));
  assert(facts[1].coverage.includes('字幕'));
  assert(facts[2].coverage.includes('部分画面'));
  assert(!facts.some(f=>f.coverage.includes('已经看完')));
});

test('one video keeps the strongest confirmed coverage and invalid rows are ignored', () => {
  const base={bvid:'BV1abcdefghA',title:'同一条鱼',at:'2026-11-01T03:00:00Z'};
  const rows=[{...base,frames:true},{...base,at:'2026-11-02T03:00:00Z',mode:'meta'},null,{...base,bvid:'invalid'}];
  assert.equal(publicWatchFacts(rows,Date.parse('2026-11-03T03:00:00Z')).length,1);
  assert.equal(publicWatchFacts(rows,Date.parse('2026-11-03T03:00:00Z'))[0].depth,3);
});

function memoryFixture(t) {
  const tempRoot=path.resolve(os.tmpdir()),dir=fs.mkdtempSync(path.join(tempRoot,'bili-context-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),tempRoot);fs.rmSync(dir,{recursive:true,force:true});});
  const home=path.join(dir,'home'),bili=path.join(home,'.dsh/surfcore/characters/fish/bili'),account=path.join(home,'.dsh/surfcore/bili'),state=path.join(dir,'state');
  fs.mkdirSync(bili,{recursive:true});fs.mkdirSync(account,{recursive:true});fs.mkdirSync(state);
  const source=fs.readFileSync(new URL('../live-mirror/src/bili-memory.js',import.meta.url),'utf8');
  let network=0;
  const env={fs,os,path,fetchMyDynamics:async()=>{network++;throw Error('offline test network forbidden');},fetchVideoInfo:async()=>{network++;throw Error('offline test network forbidden');},resolveBiliPaths:h=>({home:h,bili:account,config:path.join(home,'.dsh/surfcore/bili.config.json')}),sleep:async()=>{},characterPersonaMeta:()=>null,readCurrentCharacter:()=>({id:'fish'}),activePlatformStateDir:()=>bili,publicWatchFacts};
  const api=new Function(...Object.keys(env),source.replace(/^import .*;\r?$/gm,'').replace(/^export function /gm,'function ')+'\nreturn {createBiliMemory,isBlockedContent};')(...Object.values(env));
  fs.writeFileSync(path.join(home,'.dsh/surfcore/bili.config.json'),JSON.stringify({self:{name:'测试小鱼'},preferences:{like:['可爱猫猫','金融']}}));
  const put=(n,v)=>fs.writeFileSync(path.join(bili,n),typeof v==='string'?v:JSON.stringify(v));
  return {api,bili,state,put,network:()=>network,memory:api.createBiliMemory({stateDir:state,home})};
}

test('actual memory builder reads the active character, includes public watch facts, and needs no network',async t=>{
  const f=memoryFixture(t);const at=new Date(Date.now()-60000).toISOString();
  f.put('watch-history.jsonl',JSON.stringify({bvid:'BV1abcdefghA',title:'小猫打哈欠',at,mode:'meta'})+'\n'+JSON.stringify({bvid:'BV1abcdefghB',title:'指数基金基础',at,mode:'full',subs:'subs.txt'})+'\nmalformed');
  f.put('scores.json',{[at.slice(0,10)]:[{bv:'BV1abcdefghB',score:15,reason:'解释了指数跟踪误差与费用的关系',at}]});
  f.put('dm-secret.json',{privateText:'秘密私信不得进入公开见闻'});
  f.put('whale-diary-private.md','秘密私信不得进入公开见闻');
  const result=await f.memory.refresh({force:true,offlineOnly:true});assert.equal(result.ok,true);assert.equal(result.watches,2);assert.equal(f.network(),0);
  const index=JSON.parse(fs.readFileSync(path.join(f.state,'bili-memory.json'),'utf8')),brief=fs.readFileSync(path.join(f.state,'bili-memory-brief.md'),'utf8');
  assert.equal(index.entries.length,2);assert(brief.includes('小猫打哈欠')&&brief.includes('BV1abcdefghA'));
  assert(brief.includes('仅浏览过标题')&&brief.includes('指数基金基础'));
  assert(!brief.includes('秘密私信')&&!brief.includes('mer'));
  assert.equal(index.entries.find(e=>e.bvid==='BV1abcdefghA').shareable,false);
  assert.equal(index.entries.find(e=>e.bvid==='BV1abcdefghB').shareable,true);
  assert(f.memory.briefBlock().includes('指数基金基础'));
});

test('offline refresh never replaces another character or private notes',async t=>{
  const f=memoryFixture(t);f.put('whale-diary-private.md','私人笔记保持原样');
  await f.memory.refresh({force:true,offlineOnly:true});assert.equal(fs.readFileSync(path.join(f.bili,'whale-diary-private.md'),'utf8'),'私人笔记保持原样');assert.equal(f.network(),0);
  assert.equal(f.api.isBlockedContent('基金基础和跟踪误差'),false);
  assert.equal(f.api.isBlockedContent('明星八卦'),true);
});

test('the actual comment form carries owner mapping without inserting a bare UID into public text',()=>{
  const src=fs.readFileSync(new URL('../live-mirror/plugins/surfcore/tools/commands/comment.mjs',import.meta.url),'utf8');
  const a=src.indexOf('const params = { type, oid:'),b=src.indexOf('if (root)',a);assert(a>=0&&b>a);
  const form=new Function('type','oid','message','cred','config','ownerMentionMap',src.slice(a,b)+'return params;')('1','123','@测试主人 看这个🐟',{bili_jct:'fixture'},()=>({owner:{name:'测试主人',mid:'1234567'}}),ownerMentionMap);
  assert.equal(form.message,'@测试主人 看这个🐟');assert.deepEqual(JSON.parse(form.at_name_to_mid),{'测试主人':'1234567'});
  assert(!form.message.includes('1234567'));
});
