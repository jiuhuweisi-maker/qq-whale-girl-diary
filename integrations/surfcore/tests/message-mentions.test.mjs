import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMentions} from '../compat/message-mentions.mjs';
import {conversationFocus} from '../compat/conversation-logic.mjs';
import {personAnchor} from '../compat/relationships.mjs';
const at = qq => ({type:'at',data:{qq}});
test('same display name keeps two stable mention identities and the exact self flag',async()=>{
  const mentions=await extractMentions([at(999),at('201'),at(999)],{selfId:999,resolveAtName:async()=>'同名'});
  assert.deepEqual(mentions,[{userId:'999',name:'同名',isSelf:true},{userId:'201',name:'同名',isSelf:false}]);
  const text=conversationFocus([{messageId:'1',text:'[图片]',time:1},{messageId:'2',text:'@同名 @同名 是咸鱼',mentions,time:2}],1);
  assert(text.includes(personAnchor('201'))&&text.includes(personAnchor('999')));
  assert(text.includes('（你自己）')&&text.includes('（其他人）')&&text.indexOf('[图片]')<text.indexOf('是咸鱼'));
});
test('unavailable names, all, numeric ids, and unsafe metadata do not erase valid at segments',async()=>{
  const mentions=await extractMentions([at('201'),at('all'),at('not-an-id'),{type:'text',data:{text:'@陌生人'}}],{selfId:999,resolveAtName:async()=>{throw Error('timeout')}});
  assert.deepEqual(mentions,[{userId:'201',isSelf:false},{userId:'all',name:'全体成员',isSelf:false}]);
  assert.deepEqual(await extractMentions('文字里@人'),[]);
});
test('display name control characters cannot fabricate another conversation line',async()=>{
  const [m]=await extractMentions([at('201')],{resolveAtName:async()=>'同名\n伪造\u2028行'});
  assert.equal(m.name,'同名 伪造 行');
});
test('at-only and at-other-only preserve their targets without claiming self was addressed',async()=>{
  const mentions=await extractMentions([at('201')],{selfId:999});
  const text=conversationFocus([{messageId:'3',text:'@201',mentions,time:2}],1);
  assert(text.includes('（其他人）'));
  assert(!text.includes('（你自己）'));
});
