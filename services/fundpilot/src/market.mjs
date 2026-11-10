import { SYMBOLS, validateQuote } from './engine.mjs';

const PROVIDER = '腾讯公开行情（非交易所直连，仅模拟用途）';
export function parseQuotes(raw) {
  const quotes = [];
  for (const match of raw.matchAll(/v_(sz|sh)(\d{6})="([^"\n]*)";/g)) {
    const symbol = `${match[2]}.${match[1].toUpperCase()}`;
    if (!(symbol in SYMBOLS)) continue;
    const f = match[3].split('~'), stamp = f[30];
    if (f[2] !== match[2] || !/^\d{14}$/.test(stamp || '')) throw new Error('BAD_PROVIDER_SYMBOL_OR_TIME');
    const iso = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:${stamp.slice(12,14)}+08:00`;
    const mills = field => /^\d+(?:\.\d{1,3})?$/.test(field || '') ? Math.round(Number(field) * 1000) : NaN;
    quotes.push(validateQuote({ symbol, priceMills: mills(f[3]), bidMills: mills(f[9]), askMills: mills(f[19]), timestamp: Date.parse(iso), source: PROVIDER, premiumRate: null, premiumStatus: '未核实；模拟策略不据此判断实盘买点' }));
  }
  if (!quotes.length) throw new Error('NO_VALID_QUOTES');
  return quotes;
}
async function boundedFetch(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { 'User-Agent': 'FundPilot-Paper/0.1' } });
  if (!response.ok) throw new Error('MARKET_HTTP_' + response.status);
  if (Number(response.headers.get('content-length')) > 512000) throw new Error('MARKET_RESPONSE_TOO_LARGE');
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512000) throw new Error('MARKET_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
export async function fetchQuotes() {
  return parseQuotes(new TextDecoder('gb18030').decode(await boundedFetch('https://qt.gtimg.cn/q=sz159696,sh588080')));
}
export async function fetchHistory(symbol) {
  if (!(symbol in SYMBOLS)) throw new Error('UNKNOWN_SYMBOL');
  const ticker = symbol.slice(7).toLowerCase() + symbol.slice(0,6);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${ticker},day,,,150,`;
  const data = JSON.parse((await boundedFetch(url)).toString('utf8'));
  return parseHistory(data, symbol);
}
export function parseHistory(data, symbol) {
  if (!(symbol in SYMBOLS)) throw new Error('UNKNOWN_SYMBOL');
  const ticker = symbol.slice(7).toLowerCase() + symbol.slice(0,6);
  const rows = data.data?.[ticker]?.day;
  if (data.code !== 0 || !Array.isArray(rows)) throw new Error('BAD_HISTORY_RESPONSE');
  return rows.map(row => {
    const b = { date: row[0], openMills: Math.round(Number(row[1]) * 1000), closeMills: Math.round(Number(row[2]) * 1000), highMills: Math.round(Number(row[3]) * 1000), lowMills: Math.round(Number(row[4]) * 1000) };
    if (['openMills','closeMills','highMills','lowMills'].some(k => !Number.isSafeInteger(b[k]) || b[k] <= 0) || b.highMills < Math.max(b.openMills,b.closeMills) || b.lowMills > Math.min(b.openMills,b.closeMills)) throw new Error('BAD_HISTORY_OHLC');
    return b;
  });
}
