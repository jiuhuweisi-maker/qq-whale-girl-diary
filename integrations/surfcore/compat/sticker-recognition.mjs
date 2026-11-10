import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Recognition is read-only data. It is deliberately separate from sendable QQ
// favorites, so a favorite sync cannot delete notes or add images to an account.
export function createStickerRecognitionReader({file,disk=fs}={}) {
  let stamp='',entries=new Map();
  function refresh() {
    try {
      const stat=disk.statSync(file),next=stat.mtimeMs+':'+stat.size;
      if(next===stamp)return;
      if(stat.size>8*1024*1024)throw Error('recognition-index-too-large');
      const data=JSON.parse(disk.readFileSync(file,'utf8'));
      if(data.version!==1||!Array.isArray(data.entries)||data.entries.length>10000)throw Error('invalid-recognition-index');
      const fresh=new Map();
      for(const row of data.entries){
        const md5=String(row?.md5||'').toUpperCase();
        const note=String(row?.note||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,240);
        if(!/^[A-F0-9]{32}$/.test(md5)||!note)continue;
        fresh.set(md5,{note,uncertain:row.uncertain===true,ownerNote:row.source==='owner_note'});
      }
      entries=fresh;stamp=next;
    } catch { entries=new Map();stamp=''; }
  }
  return media=>{
    if(!media||typeof media!=='object')return null;
    const refs=[media.md5,media.file,media.emojiId].filter(v=>typeof v==='string'&&!/^https?:/i.test(v));
    const ids=refs.flatMap(v=>[...v.matchAll(/(?:^|[^a-f0-9])([a-f0-9]{32})(?=$|[^a-f0-9])/ig)].map(m=>m[1].toUpperCase()));
    if(!ids.length)return null;
    refresh();
    for(const id of ids)if(entries.has(id))return entries.get(id);
    return null;
  };
}

const read=createStickerRecognitionReader({file:fileURLToPath(new URL('../state/sticker-recognition.json',import.meta.url))});
export const recognizeStickerMedia=media=>read(media);
