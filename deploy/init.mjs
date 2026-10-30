// Fresh-install generator. Never overwrites a running installation or its memory.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SURFCORE_UPSTREAM,OVERLAY_PATCH} from '../integrations/surfcore/version.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'..');
export function initialize(settings) {
  for(const key of ['ownerQQ','botQQ','groupQQ'])if(!/^[1-9]\d{4,11}$/.test(String(settings[key]||'')))throw Error('填写有效的 '+key);
  for(const key of ['provider','model'])if(!settings[key]||/^REPLACE/.test(settings[key]))throw Error('填写 DSH 中实际可用的 '+key);
  const root=path.resolve(settings.surfcoreRoot),dshHome=path.resolve(settings.dshHome);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'whale-overlay-manifest.json'),'utf8'));
  if(manifest.upstream!==SURFCORE_UPSTREAM||manifest.patch!==OVERLAY_PATCH)throw Error('先构建固定上游的 patch'+OVERLAY_PATCH);
  for(const [file,expected] of Object.entries(manifest.sums))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==expected)throw Error('安装文件哈希不符: '+file);
  for(const [key,scheme] of [['onebotHttp','http:'],['onebotWs','ws:'],['dshBase','http:']]){
    const u=new URL(settings[key]);if(u.protocol!==scheme||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search)throw Error(key+' 必须是无凭据的本机地址');
  }
  const secret=()=>crypto.randomBytes(32).toString('hex'),character=path.join(dshHome,'surfcore/characters/whale'),legacy=path.join(dshHome,'whale-private/legacy-memory');
  const control=path.join(dshHome,'plugins/whale-control');
  const config=JSON.parse(fs.readFileSync(path.join(root,'config.example.json'),'utf8'));
  config.ownerQQ=String(settings.ownerQQ);config.allow={private:[String(settings.ownerQQ)],groups:[String(settings.groupQQ)]};
  config.dsh={...config.dsh,baseUrl:settings.dshBase,provider:settings.provider,model:settings.model,reasoningEffort:settings.reasoningEffort||'low'};
  const onebotToken=fs.readFileSync(path.resolve(settings.onebotTokenFile),'utf8').trim();
  if(!onebotToken||/[\r\n]/.test(onebotToken))throw Error('OneBot token file is empty or invalid');
  config.snowluma={...config.snowluma,httpUrl:settings.onebotHttp,wsUrl:settings.onebotWs,accessToken:onebotToken,followDiscoveredEndpoint:false,allowLaunch:false};
  config.consolePort=Number(settings.consolePort)||13100;config.consoleToken=secret();config.consoleHost='127.0.0.1';
  config.role={...config.role,maxInjectChars:20000};config.admin={uin:String(settings.ownerQQ),displayName:'主人',gentle:false};
  config.voice={...config.voice,enabled:false};config.socialV2.tools.sendVoice=false;
  config.socialV2.tokenGuard={...config.socialV2.tokenGuard,privateMaxWakesPerDay:0};
  config.whaleCompat={controlBase:settings.dshBase,auditKeyFile:path.join(dshHome,'qq-bridge-audit-key'),
    personaFile:path.join(character,'persona.md'),styleFile:path.join(character,'CHAT-STYLE.md'),
    relationshipFile:path.join(character,'important-people.json'),legacyMemoryDir:legacy,cutover:Math.floor(Date.now()/1000)};
  const legacyConfig={'NapCat':settings.onebotHttp,'聊天后端':'surfcore','私聊QQ':String(settings.ownerQQ),'她的QQ':String(settings.botQQ),
    '群号':String(settings.groupQQ),'转群':true,'转私聊':true,'总开关':true,'试运行':false,'余额通知方向':'private','接管起点':config.whaleCompat.cutover};
  const packageJson={name:'whale-control',version:'0.1.0',private:true,type:'module',main:'./lib/host.js',dsh:{bundle:{patch:['./cordis.patch.yml']}}};
  const json=v=>JSON.stringify(v,null,2)+'\n';
  const files=new Map([
    [path.join(root,'config.json'),json(config)],
    [path.join(root,'state/mode.json'),json({mode:'reserved2'})],
    [path.join(dshHome,'qq-bridge-config.json'),json(legacyConfig)],
    [config.whaleCompat.auditKeyFile,secret()+'\n'],
    [config.whaleCompat.personaFile,fs.readFileSync(path.join(here,'persona.example.md'))],
    [config.whaleCompat.styleFile,fs.readFileSync(path.join(here,'CHAT-STYLE.example.md'))],
    [config.whaleCompat.relationshipFile,json({version:1,people:[]})],
    [path.join(character,'character.json'),json({version:1,id:'whale',name:'鲸戒',createdAt:new Date().toISOString()})],
    [path.join(dshHome,'surfcore/characters/current.json'),json({id:'whale'})],
    [path.join(dshHome,'surfcore/config.json'),json({platforms:{start:{qq:true,bili:false}},bridge:{autoStart:true},persona:{file:config.whaleCompat.personaFile},updates:{enabled:false,checkOnStart:false},voice:{enabled:false},pet:{enabled:false}})],
    [path.join(legacy,'index.jsonl'),''],
    [path.join(legacy,'manifest.private.json'),json({version:1,sources:0,rows:0,indexSha256:crypto.createHash('sha256').update('').digest('hex')})],
    [path.join(control,'lib/host.js'),fs.readFileSync(path.join(repo,'bridge/host.js'))],
    [path.join(control,'lib/selfupdate.mjs'),fs.readFileSync(path.join(repo,'bridge/selfupdate.mjs'))],
    [path.join(control,'package.json'),json(packageJson)],
    [path.join(control,'cordis.patch.yml'),'- insert:\n    - id: whale-control\n      name: whale-control\n      config: {}\n'],
  ]);
  for(const file of files.keys())if(fs.existsSync(file))throw Error('已有文件，停止以保护配置和记忆: '+file);
  for(const [file,data] of files){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,data,{flag:'wx',mode:0o600});}
  return{ok:true,files:files.size,root,dshHome,controlPackage:control,activated:false,modelCalls:0,sends:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Usage: node deploy/init.mjs /absolute/private-settings.json');
  console.log(JSON.stringify(initialize(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
}
