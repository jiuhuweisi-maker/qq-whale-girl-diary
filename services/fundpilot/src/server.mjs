import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PaperEngine, SYMBOLS, shanghaiTime, inSession } from './engine.mjs';
import { fetchQuotes, fetchHistory } from './market.mjs';

export function createServer(engine, token, marketState) {
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (code, body) => { res.writeHead(code); res.end(JSON.stringify(body)); };
    const remote = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return send(403, { error: 'LOOPBACK_ONLY' });
    if (req.headers.origin) return send(403, { error: 'BROWSER_ORIGIN_REJECTED' });
    if (req.url === '/health' && req.method === 'GET') return send(200, { ok: true, mode: 'paper', liveTrading: false, brokerConnection: 'not_connected', market: marketState.status });
    const actual = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + token);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(401, { error: 'AUTH_REQUIRED' });
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/status') return send(200, { ...engine.snapshot(), market: marketState, config: {...engine.config,...(engine.config.capitalMode==='elastic'?{maxPositionFen:null,maxOrdersPerDay:null,stopEquityFen:null}: {})} });
      if (req.method === 'GET' && url.pathname === '/market') return send(200, { mode: 'paper', quotes: engine.quotes(), signals: Object.keys(SYMBOLS).map(symbol => engine.signal(symbol)), market: marketState });
      if (req.method === 'GET' && url.pathname === '/journal') return send(200, { mode: 'paper', events: engine.journal() });
      if (req.method !== 'POST' || !['/paper/cycle', '/paper/halt', '/paper/order'].includes(url.pathname)) return send(404, { error: 'NO_SUCH_ROUTE', liveTrading: false });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(415, { error: 'JSON_REQUIRED' });
      if (Number(req.headers['content-length']) > 4096) return send(413, { error: 'BODY_TOO_LARGE' });
      let raw = '';
      for await (const chunk of req) { raw += chunk.toString('utf8'); if (Buffer.byteLength(raw) > 4096) return send(413, { error: 'BODY_TOO_LARGE' }); }
      const data = JSON.parse(raw || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_BODY');
      if (url.pathname === '/paper/order') {
        if (Object.keys(data).some(key => !['requestId','symbol','side','quantity','amountFen','mode'].includes(key))) throw new Error('UNKNOWN_ORDER_FIELD');
        return send(200, engine.order(data));
      }
      if (Object.keys(data).length) throw new Error('NO_PARAMETERS_ACCEPTED');
      return send(200, url.pathname === '/paper/cycle' ? engine.cycle({ allowEntry: marketState.status === 'available' && Boolean(marketState.historyUpdatedAt) && shanghaiTime(Date.parse(marketState.historyUpdatedAt)).date === shanghaiTime().date }) : engine.halt());
    } catch (error) { return send(400, { error: error.message, mode: 'paper', liveTrading: false }); }
  });
}

async function main() {
  const root = path.resolve(process.env.FUNDPILOT_ROOT || fileURLToPath(new URL('..', import.meta.url)));
  const dataDir = path.resolve(process.env.FUNDPILOT_DATA || path.join(root, 'data'));
  const configPath = process.env.FUNDPILOT_CONFIG || path.join(root, 'config/paper.json');
  const tokenPath = process.env.FUNDPILOT_TOKEN_FILE || path.join(dataDir, 'service.token');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('INVALID_SERVICE_TOKEN');
  const engine = new PaperEngine(path.join(dataDir, 'paper.sqlite'), JSON.parse(fs.readFileSync(configPath, 'utf8')));
  const market = { status: 'starting', quoteUpdatedAt: null, historyUpdatedAt: null, lastError: null, brokerVerified: false };
  let historyDate = null, inProgress = false;
  async function tick() {
    if (inProgress) return;
    inProgress = true;
    try {
      const date = shanghaiTime().date;
      engine.setQuotes(await fetchQuotes());
      market.quoteUpdatedAt = new Date().toISOString();
      market.lastError = null;
      if (historyDate !== date) {
        try {
          const results = await Promise.all(Object.keys(SYMBOLS).map(async symbol => [symbol, await fetchHistory(symbol)]));
          for (const [symbol, bars] of results) engine.setHistory(symbol, bars);
          historyDate = date;
          market.historyUpdatedAt = new Date().toISOString();
        } catch (error) { market.lastError = /^(MARKET_|BAD_|INVALID_)/.test(error.message) ? error.message : error.name; }
      }
      market.status = historyDate !== date ? 'history_unavailable' : inSession(Date.now()) ? 'available' : 'market_closed';
      const cycle = engine.cycle({ allowEntry: historyDate === date });
      fs.mkdirSync(path.join(dataDir, 'reports'), { recursive: true, mode: 0o700 });
      const temporary = path.join(dataDir, 'reports/latest.json.tmp');
      fs.writeFileSync(temporary, JSON.stringify({ ...cycle, market }, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, path.join(dataDir, 'reports/latest.json'));
    } catch (error) {
      market.status = 'unavailable';
      market.lastError = /^(MARKET_|NO_VALID_|BAD_|INVALID_|FUTURE_|DUPLICATE_)/.test(error.message) ? error.message : error.name;
      console.error(JSON.stringify({ type: 'market_error', error: market.lastError }));
    } finally { inProgress = false; }
  }
  const server = createServer(engine, token, market);
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.listen(3092, '127.0.0.1', () => console.log(JSON.stringify({ event: 'ready', mode: 'paper', liveTrading: false, port: 3092 })));
  await tick();
  const timer = setInterval(tick, engine.config.pollIntervalMs);
  const shutdown = () => { clearInterval(timer); server.close(() => { engine.close(); process.exit(0); }); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exit(1); });
