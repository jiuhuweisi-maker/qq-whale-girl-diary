// Latest, reproducible source overlay. No accounts, model calls or activation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SURFCORE_UPSTREAM,OVERLAY_PATCH} from './version.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const readList=name=>JSON.parse(fs.readFileSync(path.join(HERE,'release',name),'utf8'));
export function buildLatest(target) {
  if(!target)throw Error('Usage: node integrations/surfcore/build.mjs NEW_PINNED_SOURCE_ROOT');
  const root=path.resolve(target),join=n=>path.join(root,n);
  for(const n of ['config.json','whale-overlay-manifest.json','state/whale-delivery.0','state/whale-delivery.1'])if(fs.existsSync(join(n)))throw Error('Existing installation or overlay; use a fresh pinned source directory');
  const baseline=readList('upstream-files.json');
  // Validate actual files, not just a revision label. Dirty and wrong upstream
  // directories must fail before any write to the supplied source directory.
  for(const {file,sha256}of baseline){const p=join(file);if(!fs.existsSync(p)||sha(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n'))!==sha256)throw Error('Pinned upstream source mismatch: '+file);}
  const writes=new Map();
  for(const n of readList('runtime-files.json'))writes.set(n,fs.readFileSync(path.join(HERE,'live-mirror',n)));
  for(const n of fs.readdirSync(path.join(HERE,'compat'))){const p=path.join(HERE,'compat',n);if(fs.statSync(p).isFile())writes.set('whale-compat/'+n,fs.readFileSync(p));}
  for(const [n,bytes]of writes){fs.mkdirSync(path.dirname(join(n)),{recursive:true});fs.writeFileSync(join(n),bytes);}
  const files=[...new Set([...baseline.map(r=>r.file),...writes.keys()])].sort();
  const sums=Object.fromEntries(files.map(n=>[n,sha(fs.readFileSync(join(n)))]));
  const manifest={upstream:SURFCORE_UPSTREAM,patch:OVERLAY_PATCH,source:'reviewed-live-source-overlay',sums};
  fs.writeFileSync(join('whale-overlay-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return{patch:OVERLAY_PATCH,sourceFiles:files.length,overlaidFiles:writes.size,modelCalls:0,sends:0,activated:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildLatest(process.argv[2])));
