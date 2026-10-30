import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {initialize} from './init.mjs';
import {OVERLAY_PATCH} from '../integrations/surfcore/version.mjs';
const source=process.env.SURFCORE_SOURCE;
test('fresh generation is complete, private and never activates services',{skip:!source},async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whale-install135-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'source'),dshHome=path.join(temp,'dsh'),manifest=JSON.parse(fs.readFileSync(path.join(source,'whale-overlay-manifest.json')));
  for(const name of [...Object.keys(manifest.sums),'config.example.json','whale-overlay-manifest.json']){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(source,name),file);}
  const tokenFile=path.join(temp,'onebot.token');fs.writeFileSync(tokenFile,'fixture-onebot-token');
  const settings={surfcoreRoot:root,dshHome,ownerQQ:'10001',botQQ:'10004',groupQQ:'70001',provider:'test-provider',model:'test-model',onebotHttp:'http://127.0.0.1:3000',onebotWs:'ws://127.0.0.1:3003',onebotTokenFile:tokenFile,dshBase:'http://127.0.0.1:3080'};
  const result=initialize(settings);assert.equal(result.activated,false);assert.equal(result.modelCalls,0);assert.equal(result.sends,0);
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'config.json')));assert.equal(cfg.ownerQQ,'10001');assert.deepEqual(cfg.allow,{private:['10001'],groups:['70001']});
  assert.equal(cfg.role.maxInjectChars,20000);assert.equal(cfg.voice.enabled,false);assert.equal(cfg.socialV2.tools.sendVoice,false);assert.equal(cfg.snowluma.accessToken,'fixture-onebot-token');
  assert.equal(cfg.socialV2.tokenGuard.privateMaxWakesPerDay,0);
  assert.equal(cfg.socialV2.tokenGuard.maxWakesPerDay,0);
  for(const key of ['pictureCooldownMs','pictureGapMs','privatePicturesPerDay','groupPicturesPerHour'])assert.equal(cfg.whaleCompat[key],0);
  const control=await import(pathToFileURL(path.join(result.controlPackage,'lib/host.js')));assert.equal(typeof control.apply,'function');assert(control.inject.includes('sessions'));
  const before=fs.readFileSync(path.join(root,'config.json'),'utf8');assert.throws(()=>initialize(settings),/已有文件/);assert.equal(fs.readFileSync(path.join(root,'config.json'),'utf8'),before);
  const legacy=JSON.parse(fs.readFileSync(path.join(dshHome,'qq-bridge-config.json')));assert.equal(legacy.聊天后端,'surfcore');assert.equal(legacy.余额通知方向,'private');
  const manifestPath=path.join(root,'whale-overlay-manifest.json');fs.writeFileSync(manifestPath,JSON.stringify({...manifest,patch:OVERLAY_PATCH-1}));
  assert.throws(()=>initialize(settings),/先构建固定上游/);
});
