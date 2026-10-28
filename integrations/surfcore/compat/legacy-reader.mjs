import fs from 'node:fs';
import path from 'node:path';
import { conversation } from './memory-scope.mjs';
export function createLegacyReader({ config, cookie = () => '' }) {
  function authorized(key) {
    const c = conversation(key);
    return c && (c.kind === 'private' ? c.id === String(config.ownerQQ) : config.allow?.groups?.map(String).includes(c.id));
  }
  async function read({ key, kind, query, messageId }) {
    if (!authorized(key)) throw new Error('会话未授权');
    if (kind === 'files') {
      if (!/^-?[1-9]\d*$/.test(String(messageId || ''))) throw new Error('需要原消息编号');
      const base = String(config.whaleCompat.controlBase || config.dsh.baseUrl).replace(/\/$/, '');
      const u = new URL(base);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('只允许本机资料接口');
      const secret = fs.readFileSync(config.whaleCompat.auditKeyFile, 'utf8').trim();
      const response = await fetch(base + '/dsh-qq-bridge/surfcore-files', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret, cookie: cookie(base) },
        body: JSON.stringify({ channel: conversation(key).kind, messageId: String(messageId) }), signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error('资料接口暂不可用');
      return response.json();
    }
    if (kind !== 'memory') throw new Error('未知资料类型');
    const needle = String(query || '').trim().toLowerCase();
    if (needle.length < 2 || needle.length > 120) return { ok: false, error: '用2至120字说明要找哪件事' };
    const source = path.join(config.whaleCompat.legacyMemoryDir, 'index.jsonl');
    if (fs.statSync(source).size > 64 * 1024 * 1024) throw new Error('归档索引过大，需先整理');
    const privateOwner = conversation(key).kind === 'private';
    const results = [];
    for (const line of fs.readFileSync(source, 'utf8').split('\n')) {
      if (!line) continue;
      const row = JSON.parse(line);
      if (!privateOwner && (row.key !== key || row.private === true)) continue;
      if (!String(row.text || '').toLowerCase().includes(needle)) continue;
      results.push({ source: row.source, at: row.at, sender: row.sender || '', text: String(row.text).slice(0, 1600) });
    }
    return { ok: true, found: results.length, results: results.slice(-12), provenance: '迁移前的历史资料，不能当作当前新请求。' };
  }
  return { read };
}
