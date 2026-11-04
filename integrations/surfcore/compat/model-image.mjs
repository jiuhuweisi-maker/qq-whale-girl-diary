import {createRequire} from 'node:module';

const DETAIL = { limit: 32768, edges: [1400, 1100, 850, 640, 480, 320, 240, 160], quality: 65 };
const CHAT = { limit: 12288, edges: [384, 256, 160], quality: 54 };
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function makePreview(bytes, dependencies, profile) {
  const require = createRequire(dependencies || process.env.WHALE_IMAGE_DEPENDENCIES || import.meta.url);
  const firstFrame = bytes.subarray(0, 3).toString() === 'GIF';
  try {
    let decoded;
    if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      if (bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 12000000) throw Error('pixel-limit');
      decoded = require('pngjs').PNG.sync.read(bytes, {checkCRC: true});
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      decoded = require('jpeg-js').decode(bytes, {useTArray: true, maxResolutionInMP: 12, maxMemoryUsageInMB: 128});
    } else if (firstFrame) {
      const gif = new (require('omggif').GifReader)(bytes);
      if (gif.width * gif.height > 12000000) throw Error('pixel-limit');
      const data = Buffer.alloc(gif.width * gif.height * 4);
      gif.decodeAndBlitFrameRGBA(0, data);
      decoded = {width: gif.width, height: gif.height, data};
    } else {
      throw Error('unsupported-preview');
    }

    if (profile === CHAT && Math.max(decoded.width, decoded.height) <= CHAT.edges[0] && bytes.length <= CHAT.limit) return null;

    const jpeg = require('jpeg-js');
    for (const edge of profile.edges) {
      const scale = Math.min(1, edge / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const data = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const fromX = Math.min(decoded.width - 1, Math.floor(x / scale));
          const fromY = Math.min(decoded.height - 1, Math.floor(y / scale));
          const from = (fromY * decoded.width + fromX) * 4;
          const to = (y * width + x) * 4;
          const alpha = decoded.data[from + 3] / 255;
          for (let c = 0; c < 3; c++) data[to + c] = Math.round(decoded.data[from + c] * alpha + 255 * (1 - alpha));
          data[to + 3] = 255;
        }
      }
      const output = jpeg.encode({data, width, height}, profile.quality).data;
      if (output.length <= profile.limit) {
        return {mimeType: 'image/jpeg', data: output.toString('base64'), preview: true, width, height, firstFrame};
      }
    }
  } catch (error) {
    throw new Error('这次未能生成模型可读的图片预览，原图仍保留；尚未看到图，不能判断内容或归因于用户的格式。', {cause: error});
  }
  throw Error('图片预览仍超出当前附件兼容范围，原图保留，尚未看到图。');
}

export async function modelImage(image, {dependencies} = {}) {
  const bytes = Buffer.from(image.data, 'base64');
  if (bytes.length <= DETAIL.limit) return image;
  return {...image, ...makePreview(bytes, dependencies, DETAIL)};
}

export function chatImagePreview(bytes, {dependencies} = {}) {
  return makePreview(bytes, dependencies, CHAT);
}
