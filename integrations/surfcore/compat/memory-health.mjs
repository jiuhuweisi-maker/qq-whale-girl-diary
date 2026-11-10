import fs from'node:fs';
import{inspectConfirmedStyle}from'./expression-style.mjs';
import{inspectRelationships}from'./relationships.mjs';
// Admin-only diagnostics contain counts/status, never persona, paths or names.
export function memoryHealth(config,{disk=fs}={}) {
 const cfg=config.whaleCompat||{},style=inspectConfirmedStyle(cfg.styleFile,{disk}),relations=inspectRelationships(cfg.relationshipFile,{disk});
 let persona='unconfigured';if(cfg.personaFile){try{persona=disk.readFileSync(cfg.personaFile,'utf8').trim()?'loaded':'empty';}catch(e){persona=e.code==='ENOENT'?'missing':'error';}}
 const healthy=style.status==='loaded'&&relations.status==='loaded'&&persona==='loaded';
 return {healthy,summary:healthy?'人物卡、确认偏好和关系文件正常加载':style.status==='fallback'?'确认偏好正在使用代码兜底，请检查偏好文件':'记忆来源存在异常，请检查后台状态',persona,
  preferences:{status:style.status,reason:style.reason||null},relationships:{status:relations.status,confirmed:relations.people.length,perPrompt:12,onDemand:true}};
}
