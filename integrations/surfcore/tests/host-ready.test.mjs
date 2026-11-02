import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {waitForDshBind} from '../compat/host-ready.mjs';

test('delayed host bind waits before returning ready without a real timeout',async()=>{
  let t=0,probes=0;const result=await waitForDshBind('http://127.0.0.1:3080',{now:()=>t,sleep:async ms=>t+=ms,probe:async(port,host)=>{assert.equal(port,3080);assert.equal(host,'127.0.0.1');return ++probes===3;}});
  assert(result.ready);assert.equal(probes,3);assert.equal(t,1000);
});
test('unbound host times out without starting anything; unknown or external URLs do not get probed',async()=>{
  let t=0,probes=0;const opts={timeoutMs:1300,now:()=>t,sleep:async ms=>t+=ms,probe:async()=>{probes++;return false;}};
  assert.equal((await waitForDshBind('http://localhost:3080',opts)).reason,'host-not-bound');assert.equal(t,1300);const before=probes;
  for(const url of ['', 'https://remote.invalid:3080','file:///tmp/foo'])assert.equal((await waitForDshBind(url,opts)).ready,false);
  assert.equal(probes,before);
});

function startFixture({bound=true,already=false}={}) {
  const source=fs.readFileSync(new URL('../live-mirror/plugins/bridge.js',import.meta.url),'utf8');
  const a=source.indexOf('let startInFlight182='),b=source.indexOf('export async function stop()',a);assert(a>=0&&b>a);
  let live=already,spawns=0,waits=0;
  const env={portOpen:async()=>live,readJson:()=>({dsh:{baseUrl:'http://127.0.0.1:3080'}}),QQ_CONFIG:'/fixture/config.json',waitForDshBind:async()=>{waits++;await Promise.resolve();return{ready:bound};},appendSupervisorLog:()=>{},process:{env:{}},findNodeExe:()=>'/opt/node/bin/node',path,spawn:()=>{spawns++;live=true;return{pid:42,unref(){}};},QQBOT_ROOT:'/fixture/surfcore',BRIDGE_SUPERVISOR_LOG:'/fixture/supervisor.log',setTimeout:fn=>{queueMicrotask(fn);}};
  const start=new Function(...Object.keys(env),source.slice(a,b).replace('export async function','async function')+'\nreturn start;')(...Object.values(env));
  return{start,spawns:()=>spawns,waits:()=>waits};
}
test('actual plugin start serializes parallel requests and spawns just one bridge after readiness',async()=>{
  const f=startFixture();const r=await Promise.all([f.start(),f.start(),f.start()]);assert(r.every(v=>v.ok));assert.equal(f.spawns(),1);assert.equal(f.waits(),1);
});
test('actual plugin cannot spawn while the host is unbound and retains an already-running bridge',async()=>{
  const f=startFixture({bound:false});assert.equal((await f.start()).retryable,true);assert.equal(f.spawns(),0);
  const running=startFixture({already:true,bound:false});assert.equal((await running.start()).already,true);assert.equal(running.waits(),0);assert.equal(running.spawns(),0);
});
