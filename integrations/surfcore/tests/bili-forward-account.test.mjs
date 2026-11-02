import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const source=process.env.SURFCORE_SOURCE;
test('forward readback uses the configured fish account, never the owner or a fixed account',{skip:!source},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bili-account184-')),old={DSH_HOME:process.env.DSH_HOME,HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE},fetchOld=globalThis.fetch;
 try{
  process.env.DSH_HOME=temp;process.env.HOME=temp;process.env.USERPROFILE=temp;
  const dir=path.join(temp,'surfcore');fs.mkdirSync(path.join(dir,'bili'),{recursive:true});
  fs.writeFileSync(path.join(dir,'bili.config.json'),JSON.stringify({self:{mid:'10001'},owner:{mid:'20002'}}));
  fs.writeFileSync(path.join(dir,'bili/credentials.json'),JSON.stringify({sessdata:'fixture',bili_jct:'fixture',buvid3:'fixture'}));
  const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return{ok:true,status:200,json:async()=>({code:0,data:{items:[{id_str:'88',type:'DYNAMIC_TYPE_FORWARD',orig:{modules:{module_dynamic:{major:{archive:{bvid:'BVfixture'}}}}}}]}})}};
  const mod=await import(pathToFileURL(path.join(source,'plugins/surfcore/tools/lib/forward.mjs')));
  assert.equal((await mod.verifyForward('88','BVfixture')).ok,true);assert.equal(calls.length,1);assert.equal(new URL(calls[0]).searchParams.get('host_mid'),'10001');
  assert.equal((await mod.verifyForward('88','BVwrong')).ok,false);
 }finally{globalThis.fetch=fetchOld;for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;assert(temp.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
});
