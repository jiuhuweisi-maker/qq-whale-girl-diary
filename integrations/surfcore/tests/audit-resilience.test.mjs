import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {biliReadFetch} from '../compat/bili-read.mjs';
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'whale-audit135-'));
const url='https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=17';

test('412 backs off across restarts without another HTTP request',async t=>{
  const home=tmp();t.after(()=>fs.rmSync(home,{recursive:true,force:true}));let now=1000,calls=0;
  const opts={home,now:()=>now,fetchImpl:async()=>{calls++;return{ok:false,status:412,json:async()=>({code:412,message:'raw private remote error'})}}};
  assert.equal((await(await biliReadFetch(url,{},opts)).json()).code,412);
  assert.equal((await biliReadFetch(url,{},opts)).backoff,true);
  const restarted=await import(pathToFileURL(path.resolve('repo/integrations/surfcore/compat/bili-read.mjs')).href+'?fresh='+Date.now());
  assert.equal((await restarted.biliReadFetch(url,{},opts)).backoff,true);
  assert.equal(calls,1);now+=900001;
  await biliReadFetch(url,{},opts);assert.equal(calls,2);
  now+=900001;assert.equal((await biliReadFetch(url,{},opts)).backoff,true);assert.equal(calls,2);
});

test('concurrent reads coalesce; raw errors never enter the result',async t=>{
  const home=tmp();t.after(()=>fs.rmSync(home,{recursive:true,force:true}));let calls=0,finish;
  const fetchImpl=async()=>{calls++;await new Promise(r=>finish=r);throw Error('cookie=secret; internal-url')};
  const a=biliReadFetch(url,{}, {home,fetchImpl}),b=biliReadFetch(url,{}, {home,fetchImpl});finish();
  const results=await Promise.all([a,b]);assert.equal(calls,1);
  for(const r of results)assert.doesNotMatch(JSON.stringify(await r.json()),/secret|internal-url/);
});

test('only documented read requests are accepted',async()=>{
  await assert.rejects(biliReadFetch('https://example.com/private'),/范围/);
  await assert.rejects(biliReadFetch(url,{method:'POST'}),/范围/);
});
test('changing an UP ID cannot bypass endpoint cooldown',async t=>{
  const home=tmp();t.after(()=>fs.rmSync(home,{recursive:true,force:true}));let calls=0;
  const opts={home,fetchImpl:async()=>{calls++;return{ok:false,status:412,json:async()=>({code:412})}}};
  await biliReadFetch(url,{},opts);assert.equal((await biliReadFetch(url.replace('17','18'),{},opts)).backoff,true);assert.equal(calls,1);
});

const source=process.env.SURFCORE_SOURCE;
test('dynamic sync stop cancels initial timer and in-flight callbacks',{skip:!source},async t=>{
  const {createBiliDynamicsSync}=await import(pathToFileURL(path.resolve(source,'src/bili-dynamics.js')));
  const stateDir=tmp();t.after(()=>fs.rmSync(stateDir,{recursive:true,force:true}));const callbacks=new Map();let next=0,fetches=0,sends=0,finish;
  const timers={setTimeout:f=>{callbacks.set(++next,f);return next},clearTimeout:n=>callbacks.delete(n),setInterval:f=>{callbacks.set(++next,f);return next},clearInterval:n=>callbacks.delete(n)};
  const sync=createBiliDynamicsSync({stateDir,groups:['17'],timers,sendToQQ:async()=>{sends++},fetchDynamics:async()=>{fetches++;return new Promise(r=>finish=r)}});
  sync.start();sync.stop();assert.equal(callbacks.size,0);assert.equal(fetches,0);
  const pending=sync.pollOnce();sync.stop();finish({ok:true,items:[]});assert.equal((await pending).skipped,true);assert.equal(sends,0);
});

test('ambiguous dynamic sends are visible and never replayed after restart',{skip:!source},async t=>{
  const {createBiliDynamicsSync}=await import(pathToFileURL(path.resolve(source,'src/bili-dynamics.js')));
  const stateDir=tmp();t.after(()=>fs.rmSync(stateDir,{recursive:true,force:true}));let items=[{id:'old',pubTs:1,text:'old'}],attempts=0;
  const options={stateDir,groups:['17'],fetchDynamics:async()=>({ok:true,items}),sendToQQ:async()=>{attempts++;throw Error('timeout after remote accepted')}};
  const first=createBiliDynamicsSync(options);await first.pollOnce();items=[{id:'new',pubTs:2,text:'new'}];
  const result=await first.pollOnce();assert.equal(result.ok,false);assert.equal(result.sent,0);assert.equal(result.uncertain,1);
  const second=createBiliDynamicsSync(options);await second.pollOnce();assert.equal(attempts,1);assert.equal(second.status().uncertain,1);
});
