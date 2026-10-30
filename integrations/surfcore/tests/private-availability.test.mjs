import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {interactiveOwnerMessage,ownerMessageGuard,nightRestPlan,privateRestHint,availabilityNotice} from '../compat/private-availability.mjs';
const {evaluateWakeBudget}=await import(pathToFileURL(path.join(process.env.SURFCORE_SOURCE,'src/token-guard.js')));
const at=s=>Date.parse(s+'+08:00'),now=at('2026-10-30T10:53:00');
const fresh={userId:'1001',isSelf:false,time:now-1000},input={key:'private:1001',ownerQQ:'1001',reason:'private',unread:[fresh],now};
const guard={privateMaxWakesPerDay:40,maxWakesPerDay:20,minWakeGapMs:120000,directBypassGap:true,maxDailyCostCNY:8};
test('forty overnight wakes do not suppress a fresh morning owner DM',()=>{
  const adjusted=ownerMessageGuard(guard,input),wakeTimes=Array.from({length:40},()=>now-3600000);
  assert.equal(evaluateWakeBudget({key:input.key,now,wakeTimes,guard:adjusted,direct:true}).blocked,false);
  assert.equal(evaluateWakeBudget({key:input.key,now,wakeTimes,guard:adjusted,direct:true,cost:8}).reason,'cost');
  assert.equal(guard.privateMaxWakesPerDay,40);
});
for(const [label,change] of [
  ['another account',{key:'private:1002'}],['group chat',{key:'group:1001'}],
  ['background timer',{reason:'proactiveCheck'}],['admin wake',{reason:'admin'}],
  ['old unread',{unread:[{...fresh,time:now-600001}]}],['self message',{unread:[{...fresh,isSelf:true}]}],
  ['wrong author',{unread:[{...fresh,userId:'1002'}]}],['future event',{unread:[{...fresh,time:now+5001}]}],
  ['empty unread',{unread:[]}]
]) test(label+' does not get the interactive owner exception',()=>assert.equal(interactiveOwnerMessage({...input,...change}),false));
test('canceled daily count remains active for proactive checks',()=>{
  assert.equal(evaluateWakeBudget({key:input.key,now,wakeTimes:Array(40).fill(now-3600000),guard:ownerMessageGuard(guard,{...input,reason:'proactiveCheck'})}).reason,'day');
});
test('zero private daily limit permits background wakes but preserves cost, gap and group guards',()=>{
  const unlimited={...guard,privateMaxWakesPerDay:0},wakeTimes=Array(1000).fill(now-3600000);
  assert.equal(evaluateWakeBudget({key:input.key,now,wakeTimes,guard:unlimited}).blocked,false);
  assert.equal(evaluateWakeBudget({key:input.key,now,wakeTimes,guard:unlimited,cost:8}).reason,'cost');
  assert.equal(evaluateWakeBudget({key:input.key,now,wakeTimes:[now-1000],guard:unlimited}).reason,'gap');
  assert.equal(evaluateWakeBudget({key:'group:7001',now,wakeTimes,guard:unlimited}).reason,'day');
});
const night=at('2026-10-30T00:45:00'),morning=at('2026-10-30T08:00:00');
const state={lastIncomingAt:night-30000,recentMessages:[{isSelf:true,plain:'明早见，晚安呀 (｡･ω･｡)',time:night-1000}]};
const next={mode:'diving',infinite:true,sleepUntil:null,triggers:{question:true}};
test('genuine goodnight plus sleep config ends at the coming morning',()=>{
  const p=nightRestPlan({key:'private:1001',ownerQQ:'1001',state,next,now:night});
  assert(p.rest&&p.saidGoodnight);assert.equal(Date.parse(p.next.sleepUntil),morning);assert(!p.next.infinite);assert(next.infinite);
});
test('ordinary nighttime diving is not labeled as going to bed',()=>{
  const p=nightRestPlan({key:'private:1001',ownerQQ:'1001',state:{...state,recentMessages:[{isSelf:true,plain:'哈哈，有点意思',time:night-1000}]},next,now:night});assert(!p.rest);assert(p.next.infinite);
});
test('a new owner message arriving after the farewell prevents rest notice',()=>{
  assert(!nightRestPlan({key:'private:1001',ownerQQ:'1001',state:{...state,lastIncomingAt:night},next,now:night}).rest);
});
test('a deliberate overnight plan can say goodnight when the model omitted it',()=>{
  const p=nightRestPlan({key:'private:1001',ownerQQ:'1001',state:{...state,recentMessages:[{isSelf:true,plain:'我先歇会儿',time:night-1000}]},next:{...next,infinite:false,sleepUntil:new Date(morning).toISOString()},now:night});assert(p.rest);assert(!p.saidGoodnight);
});
test('morning and group chat never receive private night prompts',()=>{assert.equal(privateRestHint('group:7001','1001',night),'');assert.equal(privateRestHint(input.key,'1001',now),'');assert.equal(availabilityNotice('night-rest',now),null);});
test('23:55 and 00:05 belong to one rest notice, not two calendar days',()=>{assert.equal(availabilityNotice('night-rest',at('2026-10-29T23:55:00')).label,availabilityNotice('night-rest',night).label);});
test('short naps and arbitrary notice kinds are not goodnight events',()=>{
  assert.equal(availabilityNotice('send_group_msg',night),null);
  assert(!nightRestPlan({key:input.key,ownerQQ:'1001',state,next:{...next,infinite:false,sleepUntil:new Date(night+1800000).toISOString()},now:night}).rest);
});
