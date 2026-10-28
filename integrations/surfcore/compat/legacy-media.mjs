import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
const idOf = name => crypto.createHash('sha256').update(name).digest('hex').slice(0, 20);
export function legacyMedia(config) {
  const root = path.resolve(config.whaleCompat.stickerDir);
  function entries() {
    const rows = fs.readFileSync(path.join(root, 'INDEX.tsv'), 'utf8').split(/\r?\n/).filter(l => l.includes('\t'));
    return rows.flatMap(line => {
      const [name, ...caption] = line.split('\t');
      if (path.basename(name) !== name || !/\.(?:png|jpe?g|gif|webp)$/i.test(name)) return [];
      const p = path.join(root, name);
      if (!fs.existsSync(p) || fs.realpathSync(p) !== p || fs.statSync(p).size > 5 * 1024 * 1024) return [];
      return [{ id: idOf(name), name, path: p, caption: caption.join(' ').slice(0, 160) }];
    });
  }
  function search(query = '') {
    const terms = String(query).toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8);
    return entries().filter(row => terms.every(t => row.caption.toLowerCase().includes(t) || row.name.toLowerCase().includes(t))).sort(() => Math.random() - 0.5).slice(0, 12).map(({ id, caption }) => ({ id, caption }));
  }
  function image(id) {
    const found = entries().find(row => row.id === id);
    if (!found) throw new Error('没有找到这张旧表情');
    return { type: 'image', data: { file: 'base64://' + fs.readFileSync(found.path).toString('base64') } };
  }
  async function draw(prompt) {
    // No shell, executable or script path can be selected by the model.
    const text = String(prompt || '').trim();
    if (!text || text.length > 1600) throw new Error('画面描述长度不合适');
    const result = await new Promise((resolve, reject) => execFile('/usr/bin/python3', ['/opt/qq-cs/draw.py', '可爱卡通贴纸风格，非写实非真人：' + text], { timeout: 250000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout) => error ? reject(new Error('这次没有画成，未发送图片')) : resolve(stdout.trim())));
    const p = path.resolve(result), gen = path.resolve(config.whaleCompat.generatedDir);
    if (!p.startsWith(gen + path.sep) || fs.realpathSync(p) !== p || !/\.png$/i.test(p) || fs.statSync(p).size > 5 * 1024 * 1024) throw new Error('生成结果未通过文件核对');
    return { type: 'image', data: { file: 'base64://' + fs.readFileSync(p).toString('base64') } };
  }
  return { search, image, draw };
}
