import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
const source=process.env.SURFCORE_SOURCE;
test('own-post identity survives restriction, never borrows another post or account',{skip:!source},async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'whale-own-post135-')),previous={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,DSH_HOME:process.env.DSH_HOME},originalFetch=globalThis.fetch,originalNow=Date.now;
  Object.assign(process.env,{HOME:home,USERPROFILE:home,DSH_HOME:path.join(home,'.dsh')});
  t.after(()=>{globalThis.fetch=originalFetch;Date.now=originalNow;for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;fs.rmSync(home,{recursive:true,force:true});});
  const config=path.join(home,'.dsh/surfcore/bili.config.json');fs.mkdirSync(path.dirname(config),{recursive:true});fs.writeFileSync(config,JSON.stringify({self:{mid:'17'}}));
  const {biliState}=await import(pathToFileURL(path.resolve(source,'plugins/surfcore/tools/lib/state-paths.mjs')));
  const cache=biliState('my-dynamics.json');fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,JSON.stringify({at:1,mid:'17',ids:['known-own-comment-id']}));
  const mod=await import(pathToFileURL(path.resolve(source,'plugins/surfcore/tools/lib/my-dynamics.mjs'))),cred={sessdata:'fixture',bili_jct:'fixture',buvid3:'fixture'};
  globalThis.fetch=async()=>({ok:false,status:412,json:async()=>({code:-412})});
  const restricted=await mod.myDynamicCommentIds(cred,true);assert.equal(restricted.ok,false);assert(restricted.ids.has('known-own-comment-id'));
  Date.now=()=>originalNow()+86400000;
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({code:0,data:{items:[{id_str:'other-post',basic:{comment_id_str:'not-the-target'}}]}})});
  const wrong=await mod.rememberKind(cred,'requested-post','game');assert.equal(wrong.ok,false);assert.equal(fs.existsSync(biliState('dyn-kinds.json')),false);
  fs.writeFileSync(config,JSON.stringify({self:{mid:'18'}}));globalThis.fetch=async()=>({ok:false,status:412,json:async()=>({code:-412})});
  const switched=await mod.myDynamicCommentIds(cred,true);assert.equal(switched.ids.size,0);
});
