import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PaperEngine, validateConfig, inSession } from '../src/engine.mjs';

const start = Date.parse('2026-10-29T10:00:00+08:00');
function fixture(t, options = {}) {
  let now = options.now || start;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fundpilot-test-'));
  const db = path.join(dir, 'paper.sqlite');
  const e = new PaperEngine(db, options.config, () => now);
  t.after(() => { try { e.close(); } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'fundpilot-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  } });
  return { e, db, setTime: value => { now = value; }, quote: (symbol = '159696.SZ', priceMills = 2000, extra = {}) => ({ symbol, priceMills, bidMills: priceMills - 1, askMills: priceMills + 1, timestamp: now, source: 'TEST_FIXTURE', ...extra }) };
}
const buy = (e, overrides = {}) => e.order({ requestId: 'buy-1', symbol: '159696.SZ', side: 'buy', quantity: 200, ...overrides });

test('live mode, changed capital budget and unexpected config fail closed', () => {
  assert.throws(() => validateConfig({ mode: 'live' }), /LIVE_TRADING/);
  assert.throws(() => validateConfig({ stopEquityFen: 80000 }), /RISK_BUDGET/);
  assert.throws(() => validateConfig({ brokerUrl: 'http://example.com' }), /UNKNOWN_CONFIG/);
  assert.throws(() => validateConfig({ maxPositionFen: 100000 }), /EXCEEDS/);
});
test('Shanghai trading windows reject weekends and lunch break', () => {
  assert.equal(inSession(start), true);
  for (const date of ['2026-10-29T12:00:00+08:00','2026-10-29T09:00:00+08:00','2026-10-29T14:57:00+08:00','2026-10-31T10:00:00+08:00']) assert.equal(inSession(Date.parse(date)), false);
});
test('initial account is virtual cash and never connected to a broker', t => {
  const { e } = fixture(t), s = e.snapshot();
  assert.equal(s.equityFen, 100000);
  assert.equal(s.liveTrading, false);
  assert.equal(s.brokerConnection, 'not_connected');
  assert.equal(s.stopIsGuarantee, false);
});
test('buy and sell include spread and both commissions', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]);
  const b = buy(e);
  assert.equal(b.amountFen, 40020);
  assert.equal(e.snapshot().cashFen, 59480);
  assert.equal(e.snapshot().estimatedLiquidationFen, 98960);
  const sold = e.order({ requestId: 'sell-1', symbol: '159696.SZ', side: 'sell', quantity: 200 });
  assert.equal(sold.amountFen, 39980);
  assert.equal(e.snapshot().cashFen, 98960);
  assert.equal(e.positions().length, 0);
});
test('idempotency survives restart and rejects a changed order with the same key', t => {
  const { e, quote, db } = fixture(t);
  e.setQuotes([quote()]);
  buy(e);
  const cash = e.snapshot().cashFen;
  const second = new PaperEngine(db, {}, () => start);
  try {
    assert.equal(buy(second).replayed, true);
    assert.equal(second.snapshot().cashFen, cash);
    assert.throws(() => buy(second, { quantity: 100 }), /IDEMPOTENCY_CONFLICT/);
  } finally { second.close(); }
});
test('no leverage, invalid lots, unknown symbols, and a second position are rejected', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote(), quote('588080.SH', 1000)]);
  for (const quantity of [1, 101, -100, 100000]) assert.throws(() => buy(e, { quantity }), /LOT_SIZE/);
  assert.throws(() => buy(e, { mode: 'live' }), /LIVE_TRADING/);
  assert.throws(() => buy(e, { symbol: 'UNKNOWN' }), /INVALID_ORDER/);
  assert.throws(() => buy(e, { quantity: 300 }), /POSITION_LIMIT/);
  buy(e);
  assert.throws(() => buy(e, { requestId: 'buy-2', symbol: '588080.SH', quantity: 100 }), /ONE_POSITION/);
});
test('stale, future, crossed, and duplicate quotes cannot become executable prices', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote('159696.SZ', 2000, { timestamp: start - 100000 })]);
  assert.throws(() => buy(e), /STALE_QUOTE/);
  assert.throws(() => e.setQuotes([quote('159696.SZ', 2000, { timestamp: start + 10000 })]), /FUTURE_QUOTE/);
  assert.throws(() => e.setQuotes([quote('159696.SZ', 2000, { bidMills: 2100 })]), /INVALID_QUOTE/);
  assert.throws(() => e.setQuotes([quote(), quote()]), /DUPLICATE_SYMBOL/);
});
test('older quotes do not replace newer quotes', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]);
  e.setQuotes([quote('159696.SZ', 1900, { timestamp: start - 1000 })]);
  assert.equal(e.quote('159696.SZ').priceMills, 2000);
});
test('wide spread is rejected on entry but does not block emergency exits', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote('159696.SZ', 2000, { askMills: 2100 })]);
  assert.throws(() => buy(e), /SPREAD_TOO_WIDE/);
  e.setQuotes([quote()]); buy(e);
  e.setQuotes([quote('159696.SZ', 1990, { askMills: 2100 })]);
  assert.equal(e.order({ requestId:'exit', symbol:'159696.SZ', side:'sell', quantity:200 }).side, 'sell');
});
test('account floor is based on cash plus liquidation estimate, not free cash', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]); buy(e);
  assert.ok(e.snapshot().cashFen < 90000);
  assert.equal(e.snapshot().halted, false);
  e.setQuotes([quote('159696.SZ', 1552)]);
  assert.equal(e.snapshot().halted, true);
  assert.equal(e.snapshot().haltReason, 'ACCOUNT_STOP_900');
  assert.throws(() => buy(e, { requestId: 'never-rebuy' }), /HALTED/);
});
test('a price gap can cross the floor; sells are still allowed while halted', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]); buy(e);
  e.setQuotes([quote('159696.SZ', 1200)]);
  const cycle = e.cycle();
  assert.equal(cycle.actions[0].side, 'sell');
  assert.equal(e.snapshot().halted, true);
  assert.ok(e.snapshot().equityFen < 90000);
  assert.equal(e.positions().length, 0);
});
test('halt persists across process restart and cannot be reset through trading calls', t => {
  const { e, db } = fixture(t);
  e.halt();
  const second = new PaperEngine(db, {}, () => start);
  try {
    assert.equal(second.snapshot().halted, true);
    assert.equal(typeof second.resume, 'undefined');
  } finally { second.close(); }
});
test('T+1 position cannot sell the same day, including emergency floor events', t => {
  const { e, quote, setTime } = fixture(t);
  e.setQuotes([quote('588080.SH', 1000)]);
  buy(e, { symbol: '588080.SH', quantity: 400 });
  assert.throws(() => e.order({ requestId:'sell1', symbol:'588080.SH', side:'sell', quantity:400 }), /T_PLUS_ONE/);
  e.setQuotes([quote('588080.SH', 700)]);
  assert.equal(e.cycle().actions[0].reason, 'T_PLUS_ONE_SELL_BLOCKED');
  assert.equal(e.snapshot().halted, true);
  setTime(Date.parse('2026-10-30T10:00:00+08:00'));
  e.setQuotes([quote('588080.SH', 700)]);
  assert.equal(e.cycle().actions[0].side, 'sell');
  assert.equal(e.snapshot().halted, true);
});
test('per-position stop runs before the account loses its entire 100 yuan budget', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]); buy(e);
  e.setQuotes([quote('159696.SZ', 1920)]);
  assert.equal(e.cycle().actions[0].side, 'sell');
  assert.ok(e.snapshot().equityFen > 90000);
});
test('trailing exit records profit after a rise and subsequent retracement', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]); buy(e);
  e.setQuotes([quote('159696.SZ', 2200)]);
  assert.equal(e.cycle().actions.length, 0);
  e.setQuotes([quote('159696.SZ', 2140)]);
  assert.equal(e.cycle().actions[0].side, 'sell');
  assert.ok(e.snapshot().equityFen > 100000);
});
test('partial sales preserve cost allocation and cannot oversell', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]); buy(e);
  e.order({ requestId:'partial', symbol:'159696.SZ', side:'sell', quantity:100 });
  assert.equal(e.positions()[0].quantity, 100);
  assert.equal(e.positions()[0].cost_fen, 20260);
  assert.throws(() => e.order({ requestId:'oversell', symbol:'159696.SZ', side:'sell', quantity:200 }), /INSUFFICIENT_POSITION/);
});
test('signals exclude the current incomplete daily bar and all future bars', t => {
  const { e } = fixture(t);
  const bars = Array.from({ length: 70 }, (_, i) => ({ date: new Date(Date.parse('2026-10-28') - (69 - i) * 86400000).toISOString().slice(0,10), closeMills: 1800 + i * 5 }));
  e.setHistory('159696.SZ', bars);
  const before = e.signal();
  e.setHistory('159696.SZ', [...bars, {date:'2026-10-29', closeMills:1}, {date:'2026-10-30',closeMills:1}]);
  assert.deepEqual(e.signal(), before);
  assert.equal(before.action, 'entry_candidate');
});
test('automatic paper entries are once per day, timed, and idempotent', t => {
  const { e, quote, setTime } = fixture(t, { now: Date.parse('2026-10-29T14:51:00+08:00') });
  const bars = Array.from({ length: 70 }, (_, i) => ({ date: new Date(Date.parse('2026-10-28') - (69 - i) * 86400000).toISOString().slice(0,10), closeMills: 1800 + i * 3 }));
  e.setHistory('159696.SZ', bars);
  e.setQuotes([quote('159696.SZ', 2010)]);
  assert.equal(e.cycle().actions[0].side, 'buy');
  assert.equal(e.cycle().actions.length, 0);
  e.order({ requestId:'exit-today',symbol:'159696.SZ',side:'sell',quantity:e.positions()[0].quantity });
  assert.equal(e.cycle().actions.length, 0);
  setTime(Date.parse('2026-10-29T16:00:00+08:00'));
  assert.equal(e.cycle().actions.length, 0);
});
test('rejected orders do not consume cash or leave partial database writes', t => {
  const { e, quote } = fixture(t);
  e.setQuotes([quote()]);
  assert.throws(() => buy(e, { quantity:300 }), /POSITION_LIMIT/);
  assert.equal(e.snapshot().cashFen, 100000);
  assert.equal(e.positions().length, 0);
  assert.equal(e.journal().length, 0);
});
test('outdated history blocks entries and missing history never blocks risk exits', t => {
  const { e, quote } = fixture(t);
  const bars = Array.from({ length: 70 }, (_, i) => ({ date:new Date(Date.parse('2026-07-01') + i * 86400000).toISOString().slice(0,10), closeMills:1800+i*3 }));
  e.setHistory('159696.SZ',bars);
  assert.equal(e.signal().reason,'HISTORY_STALE');
  e.setQuotes([quote()]); buy(e);
  e.setQuotes([quote('159696.SZ',1920)]);
  assert.equal(e.cycle({allowEntry:false}).actions[0].side,'sell');
});
