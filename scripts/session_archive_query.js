#!/usr/bin/env node
// Search the previous DSH conversation without loading it into every new prompt.
const fs = require('node:fs');
const zlib = require('node:zlib');

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}

const pointer = option('--archive-file', '/opt/qq-cs/.dsh-archive-session');
const paths = fs.readFileSync(pointer, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
const keyword = option('--kw', '').toLocaleLowerCase();
const role = option('--role', 'all');
const limit = Math.min(30, Math.max(1, Number(option('--limit', '8')) || 8));

function messageText(message) {
  return (message?.content || [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const matches = [];
for (const path of paths) {
  const raw = zlib.zstdDecompressSync(fs.readFileSync(path)).toString('utf8');
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    if (record.type !== 'user/message' && record.type !== 'assistant/message') continue;
    const speaker = record.type === 'user/message' ? 'user' : 'assistant';
    if (role !== 'all' && role !== speaker) continue;
    const message = speaker === 'user' ? record.data : record.data?.message;
    const body = messageText(message);
    if (!body || (keyword && !body.toLocaleLowerCase().includes(keyword))) continue;
    matches.push({ time: record.time, speaker, body });
  }
}

const selected = matches.sort((a, b) => b.time - a.time).slice(0, limit);
for (const item of selected) {
  const time = new Date(item.time).toISOString();
  console.log(`${time} [${item.speaker}] ${item.body.slice(0, 400)}`);
}
if (!selected.length) console.log('旧会话中没有匹配的文字消息。');
