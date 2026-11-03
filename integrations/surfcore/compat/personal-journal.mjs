import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {withJournalLock,readJournalForAppend} from './journal-storage.mjs';

const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=x=>{let t=typeof x==='number'?x:/^\d{10,13}$/.test(String(x))?Number(x):Date.parse(x||'');if(t>0&&t<1e11)t*=1000;return Number.isFinite(t)?new Date(t).toISOString():null;};
const dateOf=x=>new Date(x).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
const journalDir=dir=>path.join(dir,'journal');
const dayName=/^\d{4}-\d{2}-\d{2}\.jsonl$/;

function normalize(row,source) {
 if(!row||typeof row!=='object'||row.deleted===true||row.deletedAt||row.forgotten===true)return null;
 const at=iso(row.at??row.createdAt??row.time),text=String(row.text??row.note??row.content??row.title??'').trim();
 if(!at||!text)return null;
 const platform=row.platform==='bili'||String(row.source||source).startsWith('bili')?'bili':'qq';
 const key=String(row.conversationKey??row.key??(row.groupId?'group:'+row.groupId:''));
 const privateOnly=row.privateOnly===true||row.private===true||row.isPrivate===true||row.sensitive===true||key.startsWith('private:')||row.source==='legacy-mixed'||(platform==='qq'&&!key.startsWith('group:')&&row.scope!=='shared');
 const r={at,platform,source:String(row.source||source||platform).slice(0,80),key,speaker:String(row.speaker??row.sender??(row.isSelf?'自己':'')).slice(0,80),senderId:String(row.senderId??row.userId??row.speakerId??'').slice(0,120),text,privateOnly,pinned:row.pinned===true||row.firstMet===true,timePrecision:row.timePrecision||'recorded',dateBasis:row.dateBasis||'source-record'};
 r.sourceRecordId=String(row.sourceId??row.id??'');r.detail=String(row.detail||'');r.botReply=String(row.botReply||'');
 r.identityVerified=!!r.senderId;
 if(Buffer.byteLength(r.text+r.detail+r.botReply)>1024*1024)throw Error('单条历史记录过大，原件保留，需分段整理');
 r.id=sha(row.id||row.sourceId?[r.source,row.id||row.sourceId,r.key,r.senderId,r.text]:[r.at,r.source,r.key,r.senderId||r.speaker,r.text]);
 if(r.detail||r.botReply)r.id=sha([r.id,r.detail,r.botReply]);
 return r;
}

export function syncBiliDiaries(dir,biliDir) {
 let added=0;
 for(const name of ['whale-diary.md','whale-diary-private.md']) {
  const file=path.join(biliDir,name);let stat;try{stat=fs.statSync(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(stat.size>8*1024*1024)throw Error('原日记过大，保留原件，需分段整理');
  let date=null;const rows=[];
  for(const block of fs.readFileSync(file,'utf8').split(/\n\s*\n/)) {
   const found=block.match(/(?:^|\n)#{1,6}\s.*?(20\d{2}-\d{2}-\d{2})/);if(found)date=found[1];
   if(!block.trim()||/^#{1,6}\s[^\n]+\s*$/.test(block))continue;
   for(let i=0;i<block.length;i+=4000)rows.push({at:date?date+'T00:00:00+08:00':stat.mtime.toISOString(),source:'bili-personal-diary',sourceId:sha([name,block,i]),platform:'bili',private:true,text:block.slice(i,i+4000),speaker:'自己',timePrecision:date?'day':'file-updated',dateBasis:date?'diary-heading':'original-date-unknown'});
  }
  added+=appendJournal(dir,rows,{source:'bili-personal-diary'}).added;
 }
 return{added};
}

// Same character directory in both processes. Append-only daily files survive
// memory-card decay; reading them never turns an old conversation into a task.
export function appendJournal(dir,rows,{source='memory'}={}) {
 const target=journalDir(dir),normalized=(rows||[]).map(raw=>normalize(raw,source)).filter(Boolean);
 return withJournalLock(target,()=>{let added=0;
  const groups=new Map(),unknown=normalized.filter(r=>r.dateBasis==='original-date-unknown');
  if(unknown.length){
   const mapFile=path.join(target,'.source-dates.jsonl'),dates={},pendingDates=[];
   for(const row of readJournalForAppend(mapFile)){if(!iso(row.at))throw Error('日记日期索引无效');if(!dates[row.id])dates[row.id]=row.at;}
   if(!fs.existsSync(mapFile))for(const name of fs.readdirSync(target).filter(n=>dayName.test(n)).sort())for(const row of readJournalForAppend(path.join(target,name)))if(row.dateBasis==='original-date-unknown'&&!dates[row.id]){dates[row.id]=row.at;pendingDates.push({id:row.id,at:row.at});}
   for(const row of unknown){if(!dates[row.id]){dates[row.id]=row.at;pendingDates.push({id:row.id,at:row.at});}row.at=dates[row.id];}
   // Persist the first observed date before appending. A crash cannot move an
   // undated paragraph to tomorrow and import it a second time.
   if(pendingDates.length){const fd=fs.openSync(mapFile,'a',0o600);try{fs.writeFileSync(fd,pendingDates.map(r=>JSON.stringify(r)).join('\n')+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  }
  for(const row of normalized){const day=dateOf(row.at);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(row);}
  for(const[day,records]of groups){const file=path.join(target,day+'.jsonl'),ids=new Set(readJournalForAppend(file).map(r=>r.id)),pending=[];
   for(const row of records)if(!ids.has(row.id)){ids.add(row.id);pending.push(JSON.stringify(row));}
   if(!pending.length)continue;
   const fd=fs.openSync(file,'a',0o600);try{fs.writeFileSync(fd,pending.join('\n')+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}added+=pending.length;
  }return{added};});
}

export function readJournal(dir,{query='',day='',key='',ownerQQ='',platform='qq',internal=false,limit=12,cursor=null,maxLines=20000}={}) {
 const ownerPrivate=key==='private:'+String(ownerQQ)&&!!ownerQQ;
 if(platform==='qq'&&!ownerPrivate&&!/^group:[1-9]\d*$/.test(key))throw Error('日记读取缺少有效会话');
 if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('日期须为YYYY-MM-DD');
 const needle=String(query).trim().toLocaleLowerCase();if(needle.length>120)throw Error('查询过长');
 const scope=sha([key,platform,needle,day]);
 let position=null;if(cursor){try{position=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{throw Error('日记分页无效');}if(!position||position.version!==3||position.scope!==scope||!dayName.test(position.file)||!Number.isSafeInteger(position.before)||position.before<0||!Number.isSafeInteger(position.offset)||position.offset<0)throw Error('日记分页无效');}
 let files=[];try{files=fs.readdirSync(journalDir(dir)).filter(n=>dayName.test(n)&&(!day||n===day+'.jsonl')).sort().reverse();}catch(e){if(e.code!=='ENOENT')throw e;}
 const index=files.slice(0,31).map(n=>({day:n.slice(0,10),bytes:fs.statSync(path.join(journalDir(dir),n)).size}));
 if(!needle&&!day&&!cursor)return{ok:true,days:index,entries:[],hint:'按日期或话题读同一本日记；旧记录不是当前任务，标为私密的内容不得公开转述。'};
 const pageLimit=Math.max(1,Math.min(20,Number(limit)||12)),entries=[];let scanned=0,withheld=0,nextCursor=null,chars=0;
 // Use absolute positions in append-only files. Reverse-array offsets move
 // whenever the other process appends and would repeat or skip old entries.
 const continuation=(file,before,offset=0)=>Buffer.from(JSON.stringify({version:3,file,before,offset,scope})).toString('base64url');
 outer:for(const file of files){if(position&&file>position.file)continue;const raw=fs.readFileSync(path.join(journalDir(dir),file),'utf8'),lines=raw.split('\n');
  const before=position&&file===position.file?Math.min(position.before,lines.length):lines.length;
  for(let i=before-1;i>=0;i--){if(!lines[i]||(i===lines.length-1&&!raw.endsWith('\n')))continue;
   if(scanned>=maxLines||entries.length>=pageLimit){nextCursor=continuation(file,i+1);break outer;}scanned++;
   let r;try{r=JSON.parse(lines[i]);}catch{throw Error('日记存在损坏行，未猜测内容');}
   const body=[r.text,r.detail?'【原记录详情】'+r.detail:'',r.botReply?'【当时自己的回复】'+r.botReply:''].filter(Boolean).join('\n');
   if(needle&&!`${body} ${r.speaker}`.toLocaleLowerCase().includes(needle))continue;
   const localGroup=key.startsWith('group:')&&r.key===key;
   const visible=ownerPrivate||(platform==='bili'&&internal)||(!r.privateOnly&&(r.platform==='bili'||!r.key||localGroup));
   if(!visible){withheld++;continue;}
   const offset=position&&file===position.file&&i===position.before-1?position.offset:0,chunk=body.slice(offset,offset+4000);
   if(entries.length&&chars+chunk.length>10000){nextCursor=continuation(file,i+1,offset);break outer;}
   chars+=chunk.length;const{detail,botReply,...visibleRow}=r;
   entries.push({...visibleRow,text:chunk,part:{start:offset,end:offset+chunk.length,total:body.length},doNotPublish:r.privateOnly===true});
   if(offset+chunk.length<body.length){nextCursor=continuation(file,i+1,offset+chunk.length);break outer;}
  }
 }
 entries.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.at.localeCompare(a.at));
 return{ok:true,entries,matched:entries.length,withheld,scanned,nextCursor,provenance:'个人日记，QQ/B站同一角色共用；保留谁在何时说过什么，不自动证明事实或产生新任务。私密记录仅供私下回想。'};
}
