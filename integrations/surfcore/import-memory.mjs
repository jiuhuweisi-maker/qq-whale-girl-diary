// Run on the server with a private JSON settings file. Never writes original memory files.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const settings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const target = path.resolve(settings.target), manifestPath = path.join(target, 'manifest.private.json');
fs.mkdirSync(target, { recursive: true, mode: 0o700 });
function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true }).map(name => path.join(root, name)).filter(p => fs.lstatSync(p).isFile());
}
const files = [...walk(settings.sessions), ...walk(settings.archives), ...walk(settings.publicHistory), ...settings.documents.filter(p => fs.existsSync(p))].filter(p => !p.endsWith('.lock'));
const signatures = files.map(p => ({ path: p, bytes: fs.statSync(p).size, sha256: sha(fs.readFileSync(p)) }));
const inputHash = sha(JSON.stringify(signatures));
if (fs.existsSync(manifestPath)) {
  const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (old.inputHash !== inputHash) throw new Error('Legacy inputs changed: create a new import snapshot instead of overwriting this one');
  if (sha(fs.readFileSync(path.join(target, 'index.jsonl'))) !== old.indexSha256) throw new Error('Legacy index checksum mismatch');
  console.log(JSON.stringify({ ok: true, alreadyImported: true, sources: old.sources, rows: old.rows }));
  process.exit(0);
}
const rows = [], seen = new Set(); let malformed = 0;
function add({ text, at, sender, key, source, private: privateFlag }) {
  const cleaned = String(text || '').replace(/Bearer\s+[A-Za-z0-9_./+=-]{12,}/gi, 'Bearer [已隐藏]').replace(/([?&](?:token|access_token|api_key)=)[^\s&"<>]+/gi, '$1[已隐藏]').replace(/((?:API_KEY|PASSWORD|SECRET|ACCESS_TOKEN)\s*[=:]\s*)[^\s"']+/gi, '$1[已隐藏]');
  if (!cleaned.trim()) return;
  for (let start = 0; start < cleaned.length; start += 1400) {
    const body = cleaned.slice(start, start + 1600), id = sha([key, source, at, start, body].join('|'));
    if (seen.has(id)) continue; seen.add(id);
    rows.push({ id, text: body, at: at || '', sender: String(sender || ''), key, source, private: Boolean(privateFlag) });
  }
}
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(p => p?.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n');
}
for (const file of files) {
  let bytes = fs.readFileSync(file), source = 'legacy:' + sha(file).slice(0, 12);
  if (file.endsWith('.zstd')) bytes = zlib.zstdDecompressSync(bytes);
  if (file.endsWith('.gz')) bytes = zlib.gunzipSync(bytes);
  const text = bytes.toString('utf8');
  if (settings.documents.includes(file) || /\.(?:md|txt)$/.test(file)) { add({ text, key: `private:${settings.ownerQQ}`, source, private: true }); continue; }
  const publicFile = file.startsWith(path.resolve(settings.publicHistory) + path.sep);
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row; try { row = JSON.parse(line); } catch { malformed++; continue; }
    if (publicFile) {
      if (!('text' in row) || !('mid' in row)) continue;
      const at = Number(row.t) > 0 ? new Date(Number(row.t) * (Number(row.t) < 1e12 ? 1000 : 1)).toISOString() : '';
      add({ text: row.text, at, sender: row.uid || row.nick, key: `group:${settings.groupId}`, source, private: false });
    } else if (['user/message', 'assistant/message'].includes(row.type)) {
      const data = row.data?.message || row.data || {};
      add({ text: textOf(data.content), at: row.time, sender: row.type === 'assistant/message' ? '鲸戒' : '历史来信', key: `private:${settings.ownerQQ}`, source, private: true });
    }
  }
}
const serialized = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
if (Buffer.byteLength(serialized) > 64 * 1024 * 1024) throw new Error('Index exceeds bounded search size');
fs.writeFileSync(path.join(target, 'index.jsonl'), serialized, { mode: 0o600 });
const memory = await import(pathToFileURL(path.join(settings.surfcoreRoot, 'src/memory-card.js')));
const memoryPaths = memory.resolveMemoryCardPaths(settings.cardDir);
fs.mkdirSync(settings.cardDir, { recursive: true, mode: 0o700 });
if (fs.existsSync(memoryPaths.json)) fs.copyFileSync(memoryPaths.json, memoryPaths.json + '.before-import-114');
const card = memory.loadMemoryCard(memoryPaths) || memory.createEmptyCard();
const publicRows = rows.filter(row => !row.private);
const firstOwner = publicRows.filter(row => row.sender === String(settings.ownerQQ) && row.at).sort((a,b) => a.at.localeCompare(b.at))[0];
const chosen = [...(firstOwner ? [firstOwner] : []), ...publicRows.slice(-80), ...rows.filter(row => row.private && settings.documents.some(p => row.source === 'legacy:' + sha(p).slice(0,12))).slice(-45)];
for (const row of chosen) memory.addMemoryRecord(card, { source: row.private ? 'legacy-mixed' : 'qq', sourceId: row.id, text: row.text.slice(0,600), title: '迁移前的记忆', scope:'qq',platform:'qq',private:row.private,conversationKey:row.key,groupId:row.private?'':settings.groupId,senderId:row.sender,isOwner:row.sender===String(settings.ownerQQ),manual:true,manualImportance:row.private?90:45,tags:['legacy-import'],createdAt:row.at || new Date().toISOString(),lastSeenAt:row.at || new Date().toISOString() }, {maxRecords:600});
memory.saveMemoryCardOutputs(memoryPaths, card, {enabled:true,fullMaxRecords:0,fullMaxBytes:10*1024*1024*1024});
const manifest = { inputHash, indexSha256: sha(serialized), sources: files.length, rows: rows.length, publicRows: publicRows.length, privateRows: rows.length-publicRows.length, activeRecords:card.records.length, malformed, originals: signatures, createdAt: new Date().toISOString() };
fs.writeFileSync(manifestPath, JSON.stringify(manifest,null,2), {mode:0o600});
for (const f of signatures) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw new Error('Original changed while importing; re-snapshot before cutover');
console.log(JSON.stringify({ok:true,sources:manifest.sources,rows:manifest.rows,publicRows:manifest.publicRows,privateRows:manifest.privateRows,activeRecords:manifest.activeRecords,malformed:manifest.malformed,originalsUnchanged:true,indexSha256:manifest.indexSha256}));
