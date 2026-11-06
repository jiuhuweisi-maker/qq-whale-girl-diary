import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {atomicJson,readJson} from '../compat/language-style.mjs';
import {learnFromBrowse,maybeLearn} from '../compat/language-learning.mjs';
import {popularMix} from '../compat/bili-browse.mjs';
import {reserveOwnerMention,finishOwnerMention,legacyOwnerMentionUsed} from '../compat/bili-owner-mention.mjs';

function home(t,extra={}){const h=fs.mkdtempSync(path.join(os.tmpdir(),'browse-language-'));t.after(()=>fs.rmSync(h,{recursive:true,force:true}));atomicJson(path.join(h,'settings.json'),{enabled:true,autoLearn:true,learningMode:'browse',...extra});return h;}
const comments={replies:[{rpid:'a',mid:'A',member:{uname:'普通路人甲'},content:{message:'下班才发现钥匙落在家里了'},replies:[{rpid:'b',parent:'a',mid:'B',member:{uname:'普通路人乙'},content:{message:'那你今晚是不是回不去了'}},{rpid:'c',parent:'a',mid:'C',member:{uname:'普通路人丙'},content:{message:'加微信 abcdefgh 来领优惠券'}}]}]};
test('browse learning uses supplied comments with zero requests and obeys the daily candidate cap',t=>{
 const h=home(t,{maxCandidates:3,maxAccepted:5}),old=globalThis.fetch;globalThis.fetch=()=>{throw Error('browse must not fetch');};t.after(()=>{globalThis.fetch=old;});
 const r=learnFromBrowse({home:h,bvid:'BVcccccccccc',data:comments,meta:{owner:'UP',tid:160}});assert.equal(r.requests,0);assert.equal(r.candidates,3);assert.equal(r.retained,2);assert.equal(r.filtered,1);
 assert.equal(learnFromBrowse({home:h,bvid:'BVdddddddddd',data:comments}).skipped,'daily-limit');
 const rows=readJson(path.join(h,'corpus.json'));assert.equal(rows[1].context,rows[0].text);assert.equal(rows[1].trust,'high');
 maybeLearn({home:h});assert.equal(fs.existsSync(path.join(h,'learning.lock')),false);
});
test('passive video cap, accepted cap, deduplication and pause survive separate calls',t=>{
 const h=home(t,{maxVideos:1,maxAccepted:5});let r=learnFromBrowse({home:h,bvid:'BVcccccccccc',data:comments});assert.equal(r.added,2);
 r=learnFromBrowse({home:h,bvid:'BVcccccccccc',data:comments});assert.equal(r.added,0);assert.equal(r.candidates,3);
 assert.equal(learnFromBrowse({home:h,bvid:'BVdddddddddd',data:comments}).skipped,'video-limit');
 atomicJson(path.join(h,'settings.json'),{enabled:true,autoLearn:false});assert.equal(learnFromBrowse({home:h,bvid:'BVcccccccccc',data:comments}).skipped,'disabled');
 const bounded=home(t,{maxAccepted:1});r=learnFromBrowse({home:bounded,bvid:'BVcccccccccc',data:comments});assert.equal(r.retained,1);assert.equal(learnFromBrowse({home:bounded,bvid:'BVcccccccccc',data:comments}).skipped,'daily-limit');
});
test('browse budget rolls over on Shanghai calendar midnight rather than the server timezone',t=>{
 const h=home(t,{maxVideos:1}),at=Date.parse('2026-11-06T15:59:59Z');
 learnFromBrowse({home:h,bvid:'BVcccccccccc',data:comments,now:at});
 const r=learnFromBrowse({home:h,bvid:'BVdddddddddd',data:comments,now:at+2000});assert.equal(r.day,'2026-11-07');assert.equal(r.videosCollected,1);
});
test('popular mix reserves the majority for trending videos while preserving interest slots',()=>{
 const trending=[0,1,2,3].map(i=>({bv:'hot'+i,kw:i%2?'排行':'热门',up:'up'+i,_score:10-i})),interest=[0,1,2].map(i=>({bv:'interest'+i,kw:'DeepSeek',up:'other'+i,_score:100-i}));
 const r=popularMix([...interest,...trending],[],{n:5,select:(rows,entries,{n})=>({picked:rows.slice(0,n),quotas:new Map(),counts:new Map(),shortfall:[]})});
 assert.equal(r.picked.length,5);assert.equal(r.picked.filter(x=>x._via==='热门/排行').length,3);assert.equal(new Set(r.picked.map(x=>x.bv)).size,5);
});
test('owner mention is reserved before sending, stays a 5-minute anti-double-click window and never caps a day',t=>{
 const h=home(t),file=path.join(h,'mention.json'),at=Date.parse('2026-11-06T15:59:59Z');
 const lease=reserveOwnerMention(file,{now:at});assert.equal(readJson(file).status,'reserved');
 assert.throws(()=>reserveOwnerMention(file,{now:at}),/OWNER_MENTION_COOLDOWN/);finishOwnerMention(file,lease,'uncertain');assert.throws(()=>reserveOwnerMention(file,{now:at+60000}),/OWNER_MENTION_COOLDOWN/);
 const next=reserveOwnerMention(file,{now:at+5*60000+1});finishOwnerMention(file,next,'sent');assert.equal(readJson(file).day,'2026-11-07');assert.equal(readJson(file).status,'sent');
 const third=reserveOwnerMention(file,{now:at+11*60000});finishOwnerMention(file,third,'sent');assert.equal(readJson(file).status,'sent');
});
test('212 receipts are audit-only, and corrupt ledgers or concurrent checks still fail closed',t=>{
 const h=home(t),file=path.join(h,'mention.json'),at=Date.parse('2026-11-06T12:00:00Z');
 assert(legacyOwnerMentionUsed([{share:true,at:new Date(at).toISOString()}],at));assert(!legacyOwnerMentionUsed([{share:true,at:new Date(at-86400000).toISOString()}],at));
 const lease=reserveOwnerMention(file,{now:at,legacyUsed:true});assert.equal(readJson(file).status,'reserved');finishOwnerMention(file,lease,'sent');
 fs.writeFileSync(file,'corrupt');assert.throws(()=>reserveOwnerMention(file,{now:at}));fs.unlinkSync(file);
 fs.writeFileSync(file+'.lock','');assert.throws(()=>reserveOwnerMention(file,{now:at}),/正在进行/);
});
