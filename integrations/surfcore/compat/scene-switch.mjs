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
    const {at, video, intent = 'look'} = JSON.parse(fs.readFileSync(claimed, 'utf8'));
    if (!Number.isFinite(at) || now < at || now - at >= SCENE_SWITCH_WINDOW_MS) return null;
    if (typeof video !== 'string' || (video && !VIDEO_ID.test(video))) return null;
    if (!['look', 'speak'].includes(intent)) return null;
    return {at, video, intent};
  } finally {
    fs.unlinkSync(claimed);
  }
}

export function sceneSwitchPrompt(target, video = '', {intent = 'look', check = ''} = {}) {
  const audience = target === 'bili' ? 'B站公开场合' : target === 'group' ? '当前 QQ 群' : '主人的 QQ 私信';
  const topic = VIDEO_ID.test(video) ? `这个公开视频可以聊：https://www.bilibili.com/video/${video}。` : '';
  const opening = target === 'bili'
    ? (intent === 'speak'
      ? '你来这里是想公开聊一句。看看对应视频或评论区，用已有评论或动态工具挑合适的场合；没有合适的话题就先逛逛。'
      : '这次来逛逛，看到有意思的再决定要不要开口。')
    : (intent === 'speak'
      ? `你这次来是因为你已经决定在这里说一句。先用当前会话的 qq_send_message 实际发出，再按回执处理或收尾；不需要等有人 @你。${/^[0-9]{1,3}$/.test(check) ? `这是约好的测试，只发数字 ${check}，无需解释。` : '看一眼这里的近况，选一句符合话头的白话。没人聊也可以简单打个招呼。'}`
      : '这次来看看。先看看这里的人和话题，再决定要不要开口。有话就用当前会话的 qq_send_message，不用等有人先开口或 @你；没想说可以用 qq_close_conversation 自然收尾。');
  return `【换场】你现在在${audience}。${opening}${topic}用第一人称自然聊。跨场合可以用公开资料和自己的感受，私下聊过的原话、身份和账目留在原场合。发言是否发出以发送回执为准。`;
}
