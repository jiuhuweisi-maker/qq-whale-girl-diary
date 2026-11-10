import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStickerRecognitionReader} from '../compat/sticker-recognition.mjs';

const md5='A'.repeat(32);
function fixture(){let version=1,data={version:1,entries:[{md5,note:'一只小猫捧着碗，图上写「饭呢」，适合催饭',source:'cached_vision'}]},reads=0;const disk={statSync:()=>({mtimeMs:version,size:JSON.stringify(data).length}),readFileSync:()=>{reads++;return JSON.stringify(data);}};return{read:createStickerRecognitionReader({file:'/fixture/recognition.json',disk}),change:d=>{data=d;version++;},reads:()=>reads};}
test('known fingerprints resolve across filename and native emoji handles without a network request',()=>{const f=fixture();assert(f.read({file:md5.toLowerCase()+'.gif'}).note.includes('小猫'));assert(f.read({emojiId:'fake_0_0_0_'+md5}).note.includes('小猫'));assert.equal(f.read({md5:'B'.repeat(32)}),null);assert.equal(f.reads(),1);});
test('cache follows an atomic data update and owner annotations remain distinct',()=>{const f=fixture();f.read({md5});f.change({version:1,entries:[{md5,note:'主人手写的备注',source:'owner_note'}]});const r=f.read({md5});assert.equal(r.note,'主人手写的备注');assert(r.ownerNote);assert.equal(f.reads(),2);});
test('corrupt or oversized data fails closed and never turns a random URL token into a fact',()=>{const f=fixture();assert.equal(f.read({file:'https://cdn.invalid/'+md5+'.png'}),null);f.change({version:99,entries:[]});assert.equal(f.read({md5}),null);f.change({version:1,entries:[{md5:'not-a-hash',note:'bad'}]});assert.equal(f.read({md5}),null);});
test('the actual compact model view retains recognition while removing transport URLs and preserving raw messages',()=>{
  const f=fixture(),src=fs.readFileSync(new URL('../live-mirror/src/qq-model-view.js',import.meta.url),'utf8');
  const compact=new Function('recognizeStickerMedia',src.replace(/^import .*;\r?$/gm,'').replace(/^export function /gm,'function ')+'\nreturn compactModelMessage;')(f.read);
  const raw={seq:5,messageId:'42',media:[{kind:'sticker',file:md5+'.gif',url:'https://private.invalid/asset'}]},before=JSON.stringify(raw),result=compact(raw);
  assert.equal(result.media[0].url,undefined);assert.equal(result.media[0].file,undefined);assert(result.media[0].recognition.description.includes('饭呢'));assert.equal(result.media[0].index,1);assert.equal(JSON.stringify(raw),before);
  assert.equal(compact({seq:6,media:[{file:'unknown.jpg'}]}).media[0].recognition,undefined);
});
