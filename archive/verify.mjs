// Integrity check only; never imports or executes archived source.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),manifest=JSON.parse(fs.readFileSync(path.join(repo,'archive/2026-10-30/MANIFEST.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),failures=[];
for(const item of manifest.entries){
 const archived=path.resolve(repo,item.archived),original=path.resolve(repo,item.original);
 if(!archived.startsWith(path.join(repo,'archive')+path.sep)||!original.startsWith(repo+path.sep))throw Error('Path outside repository');
 if(sha(fs.readFileSync(archived))!==item.sha256)failures.push(item.archived);
 if(item.originalEntry==='inactive-pointer'&&sha(fs.readFileSync(original))!==item.pointerSha256)failures.push(item.original);
 if(item.originalEntry==='moved-to-archive'&&fs.existsSync(original))failures.push(item.original+' unexpectedly reactivated');
}
console.log(JSON.stringify({ok:!failures.length,archivedOriginals:manifest.entries.length,inactivePointers:manifest.entries.filter(e=>e.originalEntry==='inactive-pointer').length,failures,modelCalls:0,sends:0}));
process.exitCode=failures.length?1:0;
