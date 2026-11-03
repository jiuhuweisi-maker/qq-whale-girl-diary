// Server-local migration only. Original memories stay in place; output is counts.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {appendJournal,syncBiliDiaries} from './compat/personal-journal.mjs';
const root=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(path.join(root,'whale-overlay-manifest.json')))throw Error('Provide an installed SurfCore source root');
const {activeMemoryPaths,activeBiliDir}=await import(pathToFileURL(path.join(root,'src/character-persona.js'))),m=activeMemoryPaths(),cfg=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
const batches=[],counts={};
for(const name of ['json','fullJsonl','inbox'])for(const file of name==='inbox'?[m.inbox,m.inbox+'.1']:[m[name]]){
 if(!fs.existsSync(file))continue;if(fs.statSync(file).size>64*1024*1024)throw Error('Source needs a streaming migration; original retained');
 const text=fs.readFileSync(file,'utf8'),rows=file.endsWith('.json')?JSON.parse(text).records:text.split('\n').filter(Boolean).map(s=>JSON.parse(s));
 if(!Array.isArray(rows))throw Error('Unrecognized memory source; original retained');
 counts[name]=(counts[name]||0)+rows.length;batches.push({source:name==='inbox'?'qq-conversation':'memory-card',rows});
}
const legacy=path.join(cfg.whaleCompat.legacyMemoryDir,'index.jsonl');let unknownDates=0;
if(fs.existsSync(legacy)){
 if(fs.statSync(legacy).size>64*1024*1024)throw Error('Legacy index needs a streaming migration; original retained');
 const fallback=fs.statSync(legacy).mtime.toISOString(),rows=fs.readFileSync(legacy,'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s));counts.legacy=rows.length;
 batches.push({source:'legacy-mixed',rows:rows.map(row=>{const valid=(typeof row.at==='number'&&Number.isFinite(row.at))||/^\d{10,13}$/.test(String(row.at))||Number.isFinite(Date.parse(row.at||''));if(!valid)unknownDates++;return{...row,source:'legacy-mixed',sourceId:JSON.stringify([row.id||'',row.source||'']),privateOnly:true,...(!valid?{at:fallback,dateBasis:'original-date-unknown',timePrecision:'unknown'}:{})};})});
}
const run=()=>{const added={};for(const batch of batches)added[batch.source]=(added[batch.source]||0)+appendJournal(m.dir,batch.rows,{source:batch.source}).added;added.biliDiary=syncBiliDiaries(m.dir,activeBiliDir()).added;return added;};
const first=run(),repeat=run();if(Object.values(repeat).some(n=>n!==0))throw Error('Import not idempotent; originals retained');
console.log(JSON.stringify({ok:true,counts,firstAdded:first,repeatAdded:repeat,unknownDates,originalsRetained:true,modelCalls:0,testSends:0}));
