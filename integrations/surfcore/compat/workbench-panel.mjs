import path from 'node:path';
import {workbenchSnapshot,workbenchFile} from './experience-workbench.mjs';
import {operationSnapshot} from './bili-operations.mjs';
import {languageAudit} from './language-audit.mjs';

export function collectWorkbench({biliDir,accountDir,languageDir,health,now=Date.now()}={}){
  const out={at:now,health,errors:[],modelCalls:0};
  for(const [name,read]of Object.entries({experience:()=>workbenchSnapshot(workbenchFile(biliDir),{now}),
    operations:()=>operationSnapshot(path.join(accountDir,'comment-operations.json')),language:()=>languageAudit(languageDir,now)})){
    try{out[name]=read();}catch(error){out.errors.push({part:name,code:error.code==='ENOENT'?'missing':'local-data-unavailable'});}
  }
  return out;
}

export const WORKBENCH_HTML=String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>鲸戒 · 真实活动</title>
<style>
:root{font-family:system-ui,"Microsoft YaHei",sans-serif;color:#173446;background:#f3f7fb}*{box-sizing:border-box}body{max-width:1140px;margin:auto;padding:28px}header{display:flex;gap:16px;align-items:center;justify-content:space-between}h1{margin:0;font-size:27px}h2{font-size:17px;margin:0 0 14px}p{line-height:1.7;color:#526879}button,a{color:#135875}button{background:white;border:1px solid #bdd0dd;border-radius:9px;padding:10px 16px;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:22px}section{background:white;border:1px solid #dce6ed;border-radius:15px;padding:20px;min-width:0}.wide{grid-column:1/-1}.item{padding:12px 0;border-bottom:1px solid #edf1f4;overflow-wrap:anywhere}.item:last-child{border:0}.sub{font-size:13px;color:#647d8b;margin-top:6px}.badge{display:inline-block;padding:4px 10px;background:#e8f3f7;border-radius:20px;margin:3px 7px 3px 0}.bad{color:#a43b32}footer{font-size:13px;color:#647d8b;margin-top:24px}details{margin-top:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}#notice{min-height:24px}@media(max-width:500px){body{padding:16px}.grid{grid-template-columns:1fr}header{flex-wrap:wrap}}
</style><header><div><h1>鲸戒的真实活动</h1><p>已有来源、兴趣、小作品和待办，按实际记录展示。</p></div><div><a id="home">返回控制台</a> <button id="refresh">刷新</button></div></header>
<div id="notice" role="status">正在读取本地记录…</div><div class="grid">
<section class="wide"><h2>运行与整理额度</h2><div id="health"></div></section>
<section><h2>她明确记录的兴趣</h2><div id="interests"></div></section><section><h2>未完成的小项目</h2><div id="tasks"></div></section>
<section><h2>取得的字幕来源</h2><div id="sources"></div></section><section><h2>小作品与版本</h2><div id="works"></div></section>
<section><h2>B站评论与回复</h2><div id="operations"></div></section><section><h2>语言学习质量</h2><div id="language"></div></section>
</div><footer>此页只读，不调用模型、不自动刷新、不发送消息。取得字幕不代表看完视频；引文可回查不代表观点已证实。空白表示暂无记录，不补写经历。</footer>
<script>
const token=new URLSearchParams(location.search).get('token')||'';
document.getElementById('home').href='/?token='+encodeURIComponent(token);
const $=id=>document.getElementById(id),time=t=>t?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'暂无';
const label={sending:'发送结果待确认',accepted:'接口接受，待回读',verified:'内容回读匹配',uncertain:'结果待核实',rejected:'已拒绝',abandoned:'已人工结束',anonymous_seen:'匿名回读可见',unknown:'公开状态未知',ready:'可接续',paused:'已暂停',blocked:'暂不能推进',review:'等待阶段回看',completed:'已完成',cancelled:'已取消'};
function item(target,title,sub){const d=document.createElement('div');d.className='item';const a=document.createElement('div');a.textContent=title;d.append(a);if(sub){const b=document.createElement('div');b.className='sub';b.textContent=sub;d.append(b)}target.append(d)}
function list(id,rows,format){const box=$(id);box.replaceChildren();if(!rows?.length)item(box,'暂无记录');else rows.forEach(r=>{const [a,b]=format(r);item(box,a,b)})}
async function refresh(){const button=$('refresh');button.disabled=true;try{const r=await fetch('/api/whale-workbench',{headers:{'x-console-token':token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('未能读取，请从已登录的控制台进入');const s=await r.json(),e=s.experience||{};list('health',[s],x=>[(x.health?.healthy?'账本正常':'账本需检查')+' · 已加载版本 '+(x.health?.build?.revision||'未知')+' · QQ待核实发送 '+(x.health?.uncertain??'未知'), '本地语义整理 '+(e.budget?.semanticWrites||0)+' / 2 次（上海自然日）；独立后台模型任务：无。']);
list('interests',e.interests,r=>[r.topic,r.reason+' · 自己明确记录的感受，与主人的偏好分开']);
list('tasks',e.tasks,r=>[r.title+' · '+(label[r.status]||r.status),'阶段 '+r.stage+'/'+r.stageCount+' · '+r.nextStep+(r.interrupted?' · 上次未完成，可在原有回合接续':'')]);
list('sources',e.sources,r=>[r.title||r.bvid,r.bvid+' · '+time(r.at)+' · 字幕资料 '+r.coverage.from+'–'+r.coverage.to+' 秒'+(r.withdrawn?' · 已停用':'')]);
list('works',e.works,r=>[r.title,'版本 '+r.revision+' · '+(r.valid?'来源可回查，观点尚未独立核实':'来源已失效，暂停引用')]);
list('operations',s.operations?.recent,r=>[(label[r.status]||r.status)+' · '+(label[r.visibility]||r.visibility),time(r.at)+' · 回执 '+(r.receipt||'未取得')]);
list('language',s.language?[s.language]:[],r=>['样本 '+r.corpusCount+' · 来源 '+r.sources.length+' · 过期 '+r.expired+' · 重复 '+r.duplicateTexts, '停用来源 '+r.excludedSources.length+' · 文风包 '+(r.activePack?.ok?'通过本地检查':'暂无或需复查')]);
$('notice').textContent='更新于 '+time(s.at)+(s.errors.length?' · 部分本地资料暂不可读，未覆盖原件':'');$('notice').className=s.errors.length?'bad':'';
}catch(e){$('notice').textContent=e.message;$('notice').className='bad'}finally{button.disabled=false}}
$('refresh').addEventListener('click',refresh);refresh();
</script></html>`;
