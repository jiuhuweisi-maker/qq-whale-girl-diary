// Small local transactions. No model, network, credentials or background loop.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export const shanghaiDay = at => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
export function readLocal(file, fallback) {
  try {
    if (fs.statSync(file).size > 8 * 1024 * 1024) throw Error('LOCAL_STORE_TOO_LARGE');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
}
export function writeLocal(file, value) {
  const serialized=JSON.stringify(value)+'\n';if(Buffer.byteLength(serialized)>8*1024*1024)throw Error('LOCAL_STORE_TOO_LARGE');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, serialized); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
    if (process.platform !== 'win32') {
      const dir = fs.openSync(path.dirname(file), 'r');
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    }
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function transact(file, initial, edit) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  let lock;
  try { lock = fs.openSync(file + '.lock', 'wx', 0o600); }
  catch (error) {
    if(error.code!=='EEXIST')throw error;
    // Recover only a positively identified dead local process. Serialize recovery
    // and reread the lock inside it; never unlink a live/replaced/unknown lock.
    let recovery;
    try{
      recovery=fs.openSync(file+'.recovery.lock','wx',0o600);
      const owner=readLocal(file+'.lock',null);
      let dead=false;
      if(Number.isInteger(owner?.pid)&&owner.pid>0&&Date.now()-owner.at>30000){
        try{process.kill(owner.pid,0);}catch(e){dead=e.code==='ESRCH';}
      }
      if(!dead)throw Error('busy');fs.unlinkSync(file+'.lock');
    }catch{throw Error('LOCAL_STORE_BUSY：本地记录正被占用或锁状态无法核实');}
    finally{if(recovery!==undefined){fs.closeSync(recovery);fs.unlinkSync(file+'.recovery.lock');}}
    try{lock=fs.openSync(file+'.lock','wx',0o600);}catch{throw Error('LOCAL_STORE_BUSY：另一进程已接手');}
  }
  try {
    fs.writeFileSync(lock, JSON.stringify({pid:process.pid, at:Date.now()})); fs.fsyncSync(lock);
    const state = readLocal(file, initial), result = edit(state);
    writeLocal(file, state); return result;
  } finally { fs.closeSync(lock); fs.unlinkSync(file + '.lock'); }
}
