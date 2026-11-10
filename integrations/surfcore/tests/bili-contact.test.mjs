import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerDmAllowed} from '../compat/bili-context.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

test('comment mention contact preference blocks the owner DM without disabling ordinary comments',()=>{
 const config={owner:{mid:'1001',contactMode:'comment-mention'}};
 assert.equal(ownerDmAllowed(config),false);
 assert.equal(ownerDmAllowed(config,1001),false);
 assert.equal(ownerDmAllowed(config,'1002'),true);
});
test('existing installations without the new preference retain their contact setting',()=>{
 assert.equal(ownerDmAllowed({owner:{mid:'1001'}}),true);
 assert.equal(ownerDmAllowed({owner:{mid:'1001',contactMode:'dm'}}),true);
});
test('actual DM command refuses owner contact before credentials or network access',{skip:!process.env.SURFCORE_SOURCE},t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bili-contact185-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const config=path.join(tmp,'config.json'),preload=path.join(tmp,'no-network.mjs'),marker=path.join(tmp,'network-touched');
 fs.writeFileSync(config,JSON.stringify({owner:{mid:'1001',contactMode:'comment-mention'}}));
 fs.writeFileSync(preload,`import fs from 'node:fs';globalThis.fetch=()=>{fs.writeFileSync(${JSON.stringify(marker)},'unexpected');throw Error('NETWORK_MUST_NOT_RUN')};`);
 const r=spawnSync(process.execPath,['--import',preload,path.join(process.env.SURFCORE_SOURCE,'plugins/surfcore/tools/commands/dm.mjs'),'--msg','offline-test','--go'],{encoding:'utf8',timeout:10000,env:{...process.env,HOME:tmp,USERPROFILE:tmp,SURFCORE_BILI_CONFIG:config}});
 assert.equal(r.status,3,r.stderr);assert.match(r.stderr,/本次未发送/);assert.equal(fs.existsSync(marker),false);
});
