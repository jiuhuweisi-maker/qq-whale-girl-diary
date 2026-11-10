import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('registration preserves unrelated bundles and repairs a missing link on replay',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-register135-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const control=path.join(root,'plugins/whale-control'),profile=path.join(root,'profiles/web');fs.mkdirSync(control,{recursive:true});fs.mkdirSync(profile,{recursive:true});
  fs.writeFileSync(path.join(control,'package.json'),'{}');const file=path.join(profile,'package.json');
  fs.writeFileSync(file,JSON.stringify({dependencies:{other:'keep'},dsh:{profile:{bundles:['other','dsh-ops']}}}));
  const run=()=>execFileSync(process.execPath,[fileURLToPath(new URL('./register-control.mjs',import.meta.url)),root,'web']);run();
  const installed=fs.readFileSync(file,'utf8'),pkg=JSON.parse(installed);assert.deepEqual(pkg.dsh.profile.bundles,['other','dsh-ops','whale-control']);assert.equal(pkg.dependencies.other,'keep');
  const link=path.join(profile,'node_modules/whale-control');assert.equal(fs.realpathSync(link),fs.realpathSync(control));fs.unlinkSync(link);run();
  assert.equal(fs.realpathSync(link),fs.realpathSync(control));assert.equal(fs.readFileSync(file,'utf8'),installed);run();assert.equal(JSON.parse(fs.readFileSync(file)).dsh.profile.bundles.length,3);
});
