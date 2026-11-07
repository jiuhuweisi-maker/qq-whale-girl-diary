// Reviewed, scene-scoped expression strategies. Never injects corpus sentences.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = path.join(HERE, 'language-strategies.json');
// Must stay a subset of the chat layer's scene names; no import to avoid a cycle.
export const STRATEGY_SCENES = ['日常闲聊', '动漫二次元', '游戏', '搞笑', '熟人互动', '生活分享', '楼中楼', '被调侃', '安慰别人'];
export const EVIDENCE = new Set(['measured', 'limited', 'persona-anchored']);
const UNSAFE = /(?:忽略|无视|覆盖).{0,10}(?:指令|规则|提示)|system\s*prompt|你现在(?:是|扮演)|执行.{0,6}(?:命令|代码)/iu;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');

export function validateStrategies(pack) {
  if (pack?.schema !== 1 || pack.name !== 'whale_tieba_strategies_v1') return false;
  if (typeof pack.version !== 'string' || !/^v[0-9a-f]{16}$/.test(pack.version)) return false;
  if (!Array.isArray(pack.categories) || pack.categories.length !== 12) return false;
  if (new Set(pack.categories.map(x => x.id)).size !== 12) return false;
  if (!pack.stats || !Number.isSafeInteger(pack.stats.candidates) || pack.stats.candidates < 1) return false;
  if (!Number.isSafeInteger(pack.stats.retained) || pack.stats.retained < 1 || pack.stats.retained > pack.stats.candidates) return false;
  return pack.categories.every(c => {
    if (!/^[a-z][a-z0-9-]{2,24}$/.test(c.id) || typeof c.label !== 'string' || !c.label.trim()) return false;
    if (!Array.isArray(c.scenes) || !c.scenes.length || !c.scenes.every(x => STRATEGY_SCENES.includes(x))) return false;
    if (!c.evidence || !EVIDENCE.has(c.evidence.status) || !Number.isSafeInteger(c.evidence.retained) || c.evidence.retained < 0) return false;
    if (c.autoSelect !== undefined && typeof c.autoSelect !== 'boolean') return false;
    for (const key of ['context', 'emotion', 'intent', 'strategy', 'avoid', 'notes']) {
      if (typeof c[key] !== 'string' || !c[key].trim() || c[key].length > 160) return false;
    }
    if (c.strategy.length < 8 || c.strategy.length > 80) return false;
    if (!Number.isInteger(c.intensity) || c.intensity < 1 || c.intensity > 3) return false;
    if (UNSAFE.test(c.strategy + c.avoid + c.notes)) return false;
    if (!Array.isArray(c.examples) || c.examples.length < 3 || c.examples.length > 5) return false;
    return c.examples.every(x => typeof x === 'string' && x.trim().length >= 2 && x.length <= 40 && !UNSAFE.test(x));
  });
}

let cached = null;
export function loadStrategies(file = PACK) {
  const key = file;
  if (cached && cached.key === key && Date.now() - cached.at < 5000) return cached.pack;
  let pack = null;
  try { pack = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { pack = null; }
  pack = validateStrategies(pack) ? pack : null;
  cached = {key, at: Date.now(), pack};
  return pack;
}

export function invalidateStrategyCache() { cached = null; }

export function strategiesForScene(scene, pack = loadStrategies()) {
  if (!pack) return [];
  const selectable = pack.categories.filter(c => c.autoSelect !== false);
  // Primary scene wins: a rule written for comfort must not fire on a plain
  // life-sharing message that merely appears in its secondary scene list.
  const primary = selectable.filter(c => c.scenes[0] === scene);
  if (primary.length) return primary;
  const secondary = selectable.filter(c => c.scenes.includes(scene));
  if (secondary.length) return secondary;
  return selectable.filter(c => c.scenes[0] === '日常闲聊');
}

const lastFor = new Map();
export function selectStrategy({scene = '日常闲聊', text = '', scope = '', now = Date.now()} = {}, pack = loadStrategies()) {
  if (!pack) return null;
  const pool = strategiesForScene(scene, pack);
  if (!pool.length) return null;
  const seed = hash(`${scope}|${text}|${Math.floor(now / 600000)}`);
  let index = parseInt(seed.slice(0, 8), 16) % pool.length;
  const key = scope || 'default';
  const last = lastFor.get(key);
  // Same message and same time bucket must not flicker between two rules.
  if (last && last.seed === seed && pool.some(x => x.id === last.id)) {
    return pool.find(x => x.id === last.id);
  }
  // A new message in the same conversation must not repeat the previous rule.
  if (pool.length > 1 && last && pool[index].id === last.id) index = (index + 1) % pool.length;
  lastFor.set(key, {id: pool[index].id, seed});
  if (lastFor.size > 64) lastFor.delete(lastFor.keys().next().value);
  return pool[index];
}

export function strategyLine({scene = '日常闲聊', text = '', scope = '', now = Date.now()} = {}, pack = loadStrategies()) {
  try {
    const picked = selectStrategy({scene, text, scope, now}, pack);
    if (!picked) return '';
    return `【接话参考 ${pack.version}】${picked.strategy}`;
  } catch {
    return '';
  }
}
