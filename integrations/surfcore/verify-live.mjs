// Read-only maintenance verification. Run on the server, never paste credentials into argv.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2] || process.env.SURFCORE_ROOT || '/opt/whale-surfcore/staging-c174ed0');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const { discoverDshSessionCookie } = await import(pathToFileURL(path.join(root, 'src/dsh-client.js')));
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'whale-overlay-manifest.json'), 'utf8'));
const files = Object.entries(manifest.sums).map(([file, hash]) => ({ file, matches: sha(fs.readFileSync(path.join(root, file))) === hash }));
async function get(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error('health_http_' + response.status);
  return response.json();
}
const health = await get('http://127.0.0.1:3080/dsh-surfcore/health', { cookie: discoverDshSessionCookie('http://127.0.0.1:3080') });
const headers = { 'x-console-token': cfg.consoleToken };
const status = await get('http://127.0.0.1:13100/api/status', headers);
const safety = await get('http://127.0.0.1:13100/api/whale-status', headers);
const unified = JSON.parse(fs.readFileSync('/root/.dsh/surfcore/config.json', 'utf8'));
const old = JSON.parse(fs.readFileSync('/root/.dsh/qq-bridge-config.json', 'utf8'));
const memory = JSON.parse(fs.readFileSync(path.join(cfg.whaleCompat.legacyMemoryDir, 'manifest.private.json'), 'utf8'));
const result = { at: new Date().toISOString(), upstream: manifest.upstream, plugin: health.version,
  overlayFiles: files, oldChatDisabled: old.聊天后端 === 'surfcore', mode: status.mode, dshReady: status.dshReady,
  qqOnline: status.snowluma?.accountOnline, wsConnected: status.snowluma?.connected, receiveHealthy: status.snowluma?.good,
  safety, oldPictureCooldowns: (() => { const slots = [0,1].map(n => path.join(root, 'state/whale-delivery.' + n)).filter(p => fs.existsSync(p)).map(p => JSON.parse(fs.readFileSync(p,'utf8'))).sort((a,b)=>b.revision-a.revision); return slots[0]?.data.migration114 || null; })(),
  personaHash: sha(fs.readFileSync(cfg.whaleCompat.personaFile)), styleHash: sha(fs.readFileSync(cfg.whaleCompat.styleFile)),
  legacyMemory: { sources: memory.sources, rows: memory.rows, indexMatches: memory.indexSha256 === sha(fs.readFileSync(path.join(cfg.whaleCompat.legacyMemoryDir, 'index.jsonl'))) },
  voiceDisabled: cfg.voice?.enabled === false && cfg.socialV2?.tools?.sendVoice === false,
  automaticUpdatesDisabled: unified.updates?.enabled === false, biliEnabled: unified.platforms?.start?.bili === true,
  ownerDisplay: cfg.admin?.displayName, forcedGentleMode: cfg.admin?.gentle === true };
result.ok = files.every(f => f.matches) && health.ok && result.oldChatDisabled && result.mode === 'reserved2' && result.dshReady && result.qqOnline && result.wsConnected && result.receiveHealthy && safety.healthy && safety.ready && result.legacyMemory.indexMatches && result.voiceDisabled && result.automaticUpdatesDisabled;
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
