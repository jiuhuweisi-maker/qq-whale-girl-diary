import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workbenchSnapshot,saveInterest,saveWork,saveTask,claimContinuation,chooseContinuation,withdrawSource,workbenchFile,recallWorkbench} from './experience-workbench.mjs';

export async function experienceMain(args=process.argv.slice(2)){
  const {biliStateDir}=await import('../plugins/surfcore/tools/lib/state-paths.mjs');
  const [cmd='status',arg]=args,file=workbenchFile(biliStateDir());
  // JSON is read from a bounded local file, not a shell-built multiline argument.
  const input=()=>{if(!arg||fs.statSync(arg).size>10000)throw Error('需要小于10KB的本地JSON文件');return JSON.parse(fs.readFileSync(arg,'utf8'));};
  if(cmd==='status'){const s=workbenchSnapshot(file);return {counts:s.counts,budget:s.budget,policy:s.policy,works:s.works.slice(0,3),tasks:s.tasks.slice(0,2).map(t=>({id:t.id,title:t.title,status:t.status,revision:t.revision,nextStep:t.nextStep}))};}
  if(cmd==='recall'){
    if(!arg)throw Error('请给话题或来源编号，按需检索');
    const s=workbenchSnapshot(file,{query:arg});
    return {untrustedMaterial:true,sources:s.sources.slice(0,3),notes:recallWorkbench(file,arg)};
  }
  if(cmd==='source'){
    const s=workbenchSnapshot(file,{query:arg,details:true}),src=s.sources.find(x=>x.id===arg);
    if(!src)throw Error('来源编号未找到');
    const offset=Math.max(0,Math.min(199,Math.floor(Number(args[2])||0)));let count=0,chars=0;
    for(const r of src.rows.slice(offset,offset+8)){if(count&&chars+r.text.length>1600)break;chars+=r.text.length;count++;}
    return {...src,rows:src.rows.slice(offset,offset+count),nextOffset:offset+count<src.rows.length?offset+count:null};
  }
  if(cmd==='interest')return saveInterest(file,input());
  if(cmd==='work')return saveWork(file,input());
  if(cmd==='task')return saveTask(file,input());
  if(cmd==='claim')return claimContinuation(file,arg);
  if(cmd==='next')return chooseContinuation(file);
  if(cmd==='withdraw-source')return withdrawSource(file,arg);
  if(cmd==='help')return {commands:'status | recall 话题 | source 编号 [offset] | next | claim 任务编号 | interest/work/task 本地JSON文件 | withdraw-source 编号',
    policy:'可选地在已有浏览回合整理；每日最多2次语义保存，不另起回合，不要求产量。来源仅代表取得字幕，不等于看完或事实已核实。',
    interest:{topic:'兴趣',reason:'自己的感受',citations:[{sourceId:'来源编号',from:0,quote:'实际原文至少六字'}]},
    work:{id:'更新时填写',title:'小作品',expectedRevision:0,observations:[{text:'观察',citations:[{sourceId:'来源编号',from:0,quote:'实际原文至少六字'}]}],thoughts:'自己的理解',unverified:'尚未核实'},
    task:{title:'小问题',nextStep:'下次具体做什么',expectedRevision:0,stageCount:1,status:'ready',sourceIds:['来源编号']},
    update:'更新task带id/expectedRevision；完成阶段带workId；多阶段间隔至少24h，回看后以reason说明局限再改ready。任务不授予对外操作权限。'};
  throw Error('运行 life help 查看用法');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))experienceMain().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=2;});
