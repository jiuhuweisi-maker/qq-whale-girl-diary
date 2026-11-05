import {activeMemoryPaths,activeBiliDir} from '../../../../src/character-persona.js';
import {readJournal,syncBiliDiaries,rememberCommunityUsage} from '../../../../whale-compat/personal-journal.mjs';
import {isFishComment} from '../lib/fish-guard.mjs';
import {config} from '../lib/config.mjs';
import {configuredBiliRelationships} from '../../../../whale-compat/relationships.mjs';
import {QQ_CONFIG} from '../../lib/paths.js';
const opts={};for(let i=2;i<process.argv.length;i++)if(process.argv[i].startsWith('--'))opts[process.argv[i].slice(2)]=process.argv[++i];
try {
 if(opts.learn){
  const isBot=opts['suspected-bot']==='true'||isFishComment({mid:opts['author-mid'],uname:opts['author-name']||''},config().fishGuard);
  console.log(JSON.stringify(rememberCommunityUsage(activeMemoryPaths().dir,{meaning:opts.learn,usage:opts.usage,bvid:opts.bvid,root:opts.root,authorMid:opts['author-mid'],isBot})));
  process.exit(0);
 }
 syncBiliDiaries(activeMemoryPaths().dir,activeBiliDir());
 const result=readJournal(activeMemoryPaths().dir,{platform:'bili',internal:true,query:opts.query||'',day:opts.day||'',cursor:opts.cursor||null});
 const relationships=opts.query?configuredBiliRelationships(QQ_CONFIG,{query:opts.query}):'';
 console.log(JSON.stringify({...result,...(relationships?{relationships}:{})}));
}catch(error){console.error('个人日记未读到内容：'+error.message);process.exitCode=1;}
