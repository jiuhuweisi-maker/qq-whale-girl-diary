// Run after upstream setup-dsh.mjs, on a NEW deployment. Keeps unrelated bundles.
import fs from 'node:fs';import path from 'node:path';
const [dshHome,profile='web']=process.argv.slice(2);
if(!dshHome||!/^[-\w]+$/.test(profile))throw Error('Usage: node deploy/register-control.mjs DSH_HOME PROFILE');
const root=path.resolve(dshHome),dir=path.join(root,'profiles',profile),file=path.join(dir,'package.json'),control=path.join(root,'plugins/whale-control');
if(!fs.existsSync(path.join(control,'package.json')))throw Error('先运行 deploy/init.mjs');
const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
pkg.dependencies||={};pkg.dsh||={};pkg.dsh.profile||={};pkg.dsh.profile.bundles||=[];
const link='link:'+control.replaceAll('\\','/');
if(pkg.dependencies['whale-control']&&pkg.dependencies['whale-control']!==link)throw Error('已有不同的控制插件，不覆盖');
const moduleDir=path.join(dir,'node_modules');fs.mkdirSync(moduleDir,{recursive:true});
const target=path.join(moduleDir,'whale-control');
try { if(fs.realpathSync(target)!==fs.realpathSync(control))throw Error('控制模块链接指向别处，不覆盖'); }
catch(error){if(error.code!=='ENOENT')throw error;if(fs.existsSync(target)||(()=>{try{return fs.lstatSync(target).isSymbolicLink()}catch{return false}})())throw Error('已有无效控制模块链接，先核对路径');}
const registered=pkg.dsh.profile.bundles.includes('whale-control')&&pkg.dependencies['whale-control']===link;
if(!registered){
  fs.copyFileSync(file,file+'.before-whale-control-'+Date.now());
  pkg.dependencies['whale-control']=link;if(!pkg.dsh.profile.bundles.includes('whale-control'))pkg.dsh.profile.bundles.push('whale-control');
  const temp=file+'.whale-control.tmp',fd=fs.openSync(temp,'w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(pkg,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
}
if(!fs.existsSync(target))fs.symlinkSync(control,target,process.platform==='win32'?'junction':'dir');
console.log('whale-control registered; restart DSH manually after completing configuration');
