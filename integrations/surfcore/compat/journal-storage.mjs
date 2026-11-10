import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const pause = new Int32Array(new SharedArrayBuffer(4));
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'ESRCH' ? false : true; }
}

export function withJournalLock(dir, operation, {timeoutMs = 1500} = {}) {
  fs.mkdirSync(dir, {recursive:true,mode:0o700});
  const lock = path.join(dir,'.write-lock'), nonce = crypto.randomUUID(), until = Date.now()+timeoutMs;
  let fd;
  while (fd === undefined) {
    try {
      fd=fs.openSync(lock,'wx',0o600);
      fs.writeFileSync(fd,JSON.stringify({pid:process.pid,nonce,at:Date.now()}));fs.fsyncSync(fd);
    } catch(error) {
      if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);throw error;}
      if(error.code!=='EEXIST')throw error;
      try {
        const before=fs.statSync(lock);let owner=null;try{owner=JSON.parse(fs.readFileSync(lock,'utf8'));}catch{}
        if(alive(owner?.pid)===false || (!owner&&Date.now()-before.mtimeMs>30000)) {
          const after=fs.statSync(lock);
          if(before.ino===after.ino&&before.mtimeMs===after.mtimeMs){fs.unlinkSync(lock);continue;}
        }
      }catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(Date.now()>=until)throw Error('个人日记正被其他进程整理，原收件仍保留，稍后再读写');
      Atomics.wait(pause,0,0,15);
    }
  }
  try{return operation();}
  finally {
    fs.closeSync(fd);
    try{if(JSON.parse(fs.readFileSync(lock,'utf8')).nonce===nonce)fs.unlinkSync(lock);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
}

// Only an incomplete final write is recoverable automatically. Interior damage
// fails closed. Keep exact partial bytes before truncating under the writer lock.
export function readJournalForAppend(file) {
  let bytes;try{bytes=fs.readFileSync(file);}catch(error){if(error.code==='ENOENT')return[];throw error;}
  if(bytes.length&&bytes.at(-1)!==10) {
    const boundary=bytes.lastIndexOf(10)+1,tail=bytes.subarray(boundary);
    let complete=false;try{JSON.parse(tail.toString('utf8'));complete=true;}catch{}
    if(complete){const fd=fs.openSync(file,'a');try{fs.writeSync(fd,'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}bytes=Buffer.concat([bytes,Buffer.from('\n')]);}
    else {
      const recovery=path.join(path.dirname(file),'.recovered');fs.mkdirSync(recovery,{recursive:true,mode:0o700});
      const saved=path.join(recovery,path.basename(file)+'.'+crypto.randomUUID()+'.partial');
      const save=fs.openSync(saved,'wx',0o600);try{fs.writeFileSync(save,tail);fs.fsyncSync(save);}finally{fs.closeSync(save);}
      const fd=fs.openSync(file,'r+');try{fs.ftruncateSync(fd,boundary);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}bytes=bytes.subarray(0,boundary);
    }
  }
  return bytes.toString('utf8').split('\n').filter(Boolean).map(line=>{
    try{const row=JSON.parse(line);if(!row||typeof row.id!=='string')throw Error();return row;}
    catch{throw Error('个人日记存在损坏行，原件保留，需检查');}
  });
}
