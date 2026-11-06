import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCENES,languageHome,settings,readJson,atomicJson,currentPack,styleBlock,invalidateLanguageCache} from './language-style.mjs';
import {learnOnce,distillPack,publishPack,rollbackPack} from './language-learning.mjs';

export async function main(args=process.argv.slice(2)){
 const [cmd='status',arg]=args,home=languageHome();
 const save=patch=>{atomicJson(path.join(home,'settings.json'),{...settings(home),...patch});invalidateLanguageCache();return patch;};
 if(['enable','disable','resume','pause'].includes(cmd))return save(cmd==='enable'?{enabled:true}:cmd==='disable'?{enabled:false,autoLearn:false}:cmd==='resume'?{autoLearn:true}:{autoLearn:false});
 if(cmd==='learn')return learnOnce({home,initial:arg==='--initial',onProgress:r=>console.error(JSON.stringify(r))});
 if(cmd==='status'){
  const s=settings(home),state=readJson(path.join(home,'learning.json'),{}),p=currentPack(home).pack;
  return {home,enabled:s.enabled,autoLearn:s.autoLearn,version:p?.version||null,packName:p?.name||null,scenes:p?.scenes?.map(x=>({name:x.name,count:x.count}))||[],corpusCount:state.corpusCount||0,lastAttempt:state.lastAttempt?new Date(state.lastAttempt).toISOString():null,lastCompleted:state.lastCompleted?new Date(state.lastCompleted).toISOString():null,learningLockPresent:fs.existsSync(path.join(home,'learning.lock')),stats:state.stats||null,limits:s,versions:fs.existsSync(path.join(home,'versions'))?fs.readdirSync(path.join(home,'versions')).filter(x=>/^v[0-9a-f]{16}\.json$/.test(x)):[]};
 }
 if(cmd==='pack'){if(arg&&!SCENES.includes(arg))throw Error('未知场景；请运行 status 查看已有场景');return styleBlock({home,scene:arg});}
 if(cmd==='rollback')return {version:rollbackPack(home,arg)};
 if(cmd==='forget-source'){
  if(!/^BV[0-9A-Za-z]{10}$/.test(arg||''))throw Error('Expected exact BV source');
  if(fs.existsSync(path.join(home,'learning.lock')))throw Error('Learning in progress; pause and wait');
  const corpus=readJson(path.join(home,'corpus.json'),[]),removed=corpus.filter(x=>x.source===arg),kept=corpus.filter(x=>x.source!==arg);
  // Preserve a local backup for recovery; no irreversible whole-corpus delete.
  atomicJson(path.join(home,'forgotten-backup.json'),removed);
  atomicJson(path.join(home,'corpus.json'),kept);
  const pack=distillPack(kept),publication=pack?publishPack(home,pack):{ok:false,reason:'insufficient-corpus'};
  if(!publication.ok){save({enabled:false});if(fs.existsSync(path.join(home,'active-pack.json')))fs.unlinkSync(path.join(home,'active-pack.json'));}
  const state=readJson(path.join(home,'learning.json'),{});atomicJson(path.join(home,'learning.json'),{...state,corpusCount:kept.length});
  return {removed:removed.length,remaining:kept.length,publication};
 }
 throw Error('Commands: status | enable | disable | pause | resume | learn [--initial] | pack [场景] | forget-source BV... | rollback v...');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(r=>console.log(typeof r==='string'?r:JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
