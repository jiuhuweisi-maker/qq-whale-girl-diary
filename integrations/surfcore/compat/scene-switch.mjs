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
    // atOwner（220 起，222 放宽）：主人私信里带视频去 B站 一律按 @ 主人处理。
    // 严格只认真布尔，别让旧 offer 或别的来源捎带一个字符串就绕开分享闸门。
    // 222：reason/message 是 QQ 那端她自己说的话，B站 直发分享评论时当作理由与正文。
    const {at, video, intent = 'look', atOwner = false, reason = '', message = ''} = JSON.parse(fs.readFileSync(claimed, 'utf8'));
    if (!Number.isFinite(at) || now < at || now - at >= SCENE_SWITCH_WINDOW_MS) return null;
    if (typeof video !== 'string' || (video && !VIDEO_ID.test(video))) return null;
    if (!['look', 'speak'].includes(intent)) return null;
    return {at, video, intent, atOwner: atOwner === true,
      reason: String(reason).slice(0,160), message: String(message).slice(0,160)};
  } finally {
    fs.unlinkSync(claimed);
  }
}

export function sceneSwitchPrompt(target, video = '', {intent = 'look', check = '', atOwner = false} = {}) {
  const audience = target === 'bili' ? 'B站公开场合' : target === 'group' ? '当前 QQ 群' : '主人的 QQ 私信';
  const topic = VIDEO_ID.test(video) ? `这个公开视频可以聊：https://www.bilibili.com/video/${video}。` : '';
  // 以前 intent=speak 只说「公开聊一句」，B站那边就去跟路人搭话了；主人当场叫
  // 去 @ 的那次也落进同一条路，@ 的永远是路人。220 起把这条意图单列成分享型评论。
  const ownerShare = target === 'bili' && atOwner === true && VIDEO_ID.test(video)
    ? `这条视频是要 @ 他来看的：可能是他在 QQ 当场叫你去的，也可能是你在私信里自己想分享给他的。先用 recon 取这条视频的 aid，再 comment --oid <aid> --bvid ${video} --share --auto --owner-ok --reason "为什么值得叫他看（8 字以上）" --message "一句自然的话" 先 --dry 再 --go，真的把这条分享评论发出去；工具会自动在开头补 @主人，别自己写 @、别 @ 别人、别改成回复路人、别发动态、别凑评分。正文用私信那句带梗的白话，别写成报数据、复述内容、金句收尾的解说稿；发没发出以工具回执为准，没发出就停，不换文案重发。`
    : '';
  const opening = target === 'bili'
    ? (ownerShare || (intent === 'speak'
      ? '你来这里是想公开聊一句。看看对应视频或评论区，用已有评论或动态工具挑合适的场合；没有合适的话题就先逛逛。'
      : '这次来逛逛，看到有意思的再决定要不要开口。'))
    : (intent === 'speak'
      ? `你这次来是因为你已经决定在这里说一句。先用当前会话的 qq_send_message 实际发出，再按回执处理或收尾；不需要等有人 @你。${/^[0-9]{1,3}$/.test(check) ? `这是约好的测试，只发数字 ${check}，无需解释。` : '看一眼这里的近况，选一句符合话头的白话。没人聊也可以简单打个招呼。'}`
      : '这次来看看。先看看这里的人和话题，再决定要不要开口。有话就用当前会话的 qq_send_message，不用等有人先开口或 @你；没想说可以用 qq_close_conversation 自然收尾。');
  return `【换场】你现在在${audience}。${opening}${topic}用第一人称自然聊。跨场合可以用公开资料和自己的感受，私下聊过的原话、身份和账目留在原场合。发言是否发出以发送回执为准。`;
}
