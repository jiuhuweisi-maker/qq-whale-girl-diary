import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const directories = ['src','config','tests','scripts','dsh-plugin','deploy','docs'];
const names = ['package.json','README.md','AGENTS.md'];
function walk(directory) {
  for (const item of fs.readdirSync(path.join(root,directory),{withFileTypes:true})) {
    if (item.name === 'node_modules' || item.name.startsWith('.')) continue;
    const relative = path.posix.join(directory,item.name);
    if (item.isDirectory()) walk(relative);
    else if (item.isFile()) names.push(relative);
  }
}
directories.filter(name=>fs.existsSync(path.join(root,name))).forEach(walk);
const files = Object.fromEntries(names.sort().map(relative => {
  const content = fs.readFileSync(path.join(root,relative));
  return [relative,{base64:content.toString('base64'),sha256:createHash('sha256').update(content).digest('hex')}];
}));
const bundle = { version:'0.2.0', files };
const payload = deflateSync(Buffer.from(JSON.stringify(bundle))).toString('base64');
const install = fs.readFileSync(path.join(root,'deploy/install.py'),'utf8');
const destination = path.resolve(process.argv[2] || 'fundpilot-install.py');
fs.writeFileSync(destination,`import json, base64, zlib\nBUNDLE = json.loads(zlib.decompress(base64.b64decode('${payload}')))\n`+install);
console.log(JSON.stringify({files:names.length,bytes:fs.statSync(destination).size,destination}));
