import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {mergeEverydayPrompt}from'../compat/prompt-preferences.mjs';
test('both shipped presets remove performative misanswering while retaining autonomy and cute expression',()=>{
 for(const file of ['dsh/agent-presets/qq-chat-v2/agent.cordis.yml','plugins/surfcore/presets/qq-chat-v2.patch.yml']){
  const text=fs.readFileSync(new URL('../live-mirror/'+file,import.meta.url),'utf8');
  assert(!/装唐装傻|已读乱回|离谱\/没用的答案|coding agent powered/.test(text));
  for(const phrase of ['【日常交流】','【保持主体性】','颜文字','主动'])assert(text.includes(phrase));
  assert.equal(mergeEverydayPrompt(text),text);
 }
});
