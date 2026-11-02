import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {buildLatest} from '../build.mjs';import {OVERLAY_PATCH} from '../version.mjs';
const base=process.env.SURFCORE_BASE_SOURCE;
test('latest source is reproducible, includes cold-start fix, and never overwrites an installation',{skip:!base},t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'release184-'));t.after(()=>{assert(temp.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});});
 const root=path.join(temp,'source');fs.mkdirSync(root);const list=JSON.parse(fs.readFileSync(new URL('../release/upstream-files.json',import.meta.url)));
 for(const {file}of list){const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(base,file),p);}
 const result=buildLatest(root);assert.equal(result.patch,OVERLAY_PATCH);assert.equal(result.sends,0);assert.equal(result.activated,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'whale-overlay-manifest.json')));for(const [n,h]of Object.entries(manifest.sums))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex'),h);
 assert(fs.readFileSync(path.join(root,'whale-compat/durable-state.cjs'),'utf8').includes("'rejected', 'failed', 'uncertain'"));assert(fs.existsSync(path.join(root,'whale-compat/context-economy.mjs')));
 assert.throws(()=>buildLatest(root),/Existing installation/);
 const dirty=path.join(temp,'dirty');fs.mkdirSync(dirty);fs.writeFileSync(path.join(dirty,'config.json'),'original');assert.throws(()=>buildLatest(dirty),/Existing installation/);assert.equal(fs.readFileSync(path.join(dirty,'config.json'),'utf8'),'original');
});
