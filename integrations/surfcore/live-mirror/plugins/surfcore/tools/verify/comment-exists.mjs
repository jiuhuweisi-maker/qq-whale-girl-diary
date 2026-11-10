// Read-only, bounded verification; preserves the original positional interface.
import fs from 'node:fs';
import {accountBili} from '../lib/state-paths.mjs';
import {verifyComment} from '../../../../whale-compat/bili-verification.mjs';
const [rpid,oid,bvid,...args]=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?'':String(args[i+1]||'');};
let cookie='';
try{const c=JSON.parse(fs.readFileSync(accountBili('credentials.json'),'utf8'));cookie=`SESSDATA=${c.sessdata}; bili_jct=${c.bili_jct}; buvid3=${c.buvid3}`;}catch{/* Anonymous verification still works without credentials. */}
try{
  const result=await verifyComment({file:accountBili('comment-operations.json'),rpid,oid,root:option('--root'),type:option('--type')||'1',
    referer:/^BV[0-9A-Za-z]{10}$/.test(bvid||'')?`https://www.bilibili.com/video/${bvid}/`:'https://www.bilibili.com/',cookie});
  console.log(JSON.stringify(result));
}catch(error){console.error('复核未完成（'+String(error.name||'Error')+'）；发布结果仍待核实，不重发。');process.exitCode=2;}
