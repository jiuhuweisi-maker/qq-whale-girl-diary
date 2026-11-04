import fs from 'node:fs';
import path from 'node:path';

export const SCENE_SWITCH_WINDOW_MS = 120000;
const VIDEO_ID = /^BV[0-9A-Za-z]{10}$/;

export function sceneGroupKey(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
  const match = /^(?:group:)?([1-9]\d{0,19})$/.exec(String(value ?? '').trim());
  return match ? `group:${match[1]}` : '';
}

export function publicVideoId(value) {
  const text = String(value ?? '').trim();
  if (VIDEO_ID.test(text)) return text;
  return /^https:\/\/www\.bilibili\.com\/video\/(BV[0-9A-Za-z]{10})\/?$/.exec(text)?.[1] ?? '';
}

export function sceneOfferFile(dir) {
  return path.join(dir, 'scene-switch-bili.json');
}

export function claimBiliSceneOffer(dir, now = Date.now()) {
  const file = sceneOfferFile(dir);
  const claimed = `${file}.claimed-${process.pid}`;
  try {
    fs.renameSync(file, claimed);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const {at, video} = JSON.parse(fs.readFileSync(claimed, 'utf8'));
    if (!Number.isFinite(at) || now < at || now - at >= SCENE_SWITCH_WINDOW_MS) return null;
    if (typeof video !== 'string' || (video && !VIDEO_ID.test(video))) return null;
    return {at, video};
  } finally {
    fs.unlinkSync(claimed);
  }
}

export function sceneSwitchPrompt(target, video = '') {
  const audience = target === 'bili' ? 'B站公开场合' : target === 'group' ? '当前 QQ 群' : '主人的 QQ 私信';
  const topic = VIDEO_ID.test(video) ? `你刚才有兴趣聊这个公开视频：https://www.bilibili.com/video/${video}。` : '你刚才想来这边看看。';
  return `【换场】你现在在${audience}。${topic}先看看这里的人和话题，再决定要不要分享、接话或安静离开。可以说自己的看法，照这里的说话习惯聊。跨场合可以用公开资料和自己的感受，私下聊过的原话、身份和账目留在原场合。这里用自己的发送工具，按真实回执判断是否发出。`;
}
