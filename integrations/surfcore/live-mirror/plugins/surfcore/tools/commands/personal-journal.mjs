import {activeMemoryPaths,activeBiliDir} from '../../../../src/character-persona.js';
import {readJournal,syncBiliDiaries} from '../../../../whale-compat/personal-journal.mjs';
const opts={};for(let i=2;i<process.argv.length;i++)if(process.argv[i].startsWith('--'))opts[process.argv[i].slice(2)]=process.argv[++i];
try {
 syncBiliDiaries(activeMemoryPaths().dir,activeBiliDir());
 const result=readJournal(activeMemoryPaths().dir,{platform:'bili',internal:true,query:opts.query||'',day:opts.day||'',cursor:opts.cursor||null});
 console.log(JSON.stringify(result));
}catch(error){console.error('个人日记未读到内容：'+error.message);process.exitCode=1;}
