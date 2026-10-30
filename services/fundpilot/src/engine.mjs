import { DatabaseSync } from 'node:sqlite';

export const SYMBOLS = Object.freeze({
  '159696.SZ': Object.freeze({ name: '易方达纳斯达克100ETF', tPlusOne: false }),
  '588080.SH': Object.freeze({ name: '易方达科创50ETF', tPlusOne: true }),
});
export const DEFAULT_CONFIG = Object.freeze({
  mode: 'paper', capitalMode: 'fixed', initialCashFen: 100000, stopEquityFen: 90000,
  maxPositionFen: 50000, maxOrdersPerDay: 2, commissionRate: 0.0003,
  minimumCommissionFen: 500, maxSpreadBps: 35, maxQuoteAgeMs: 90000,
  positionStopLossRate: 0.03, trailingActivationRate: 0.04,
  trailingDrawdownRate: 0.02, activeSymbol: '159696.SZ', autoPaper: true,
  pollIntervalMs: 60000,
});

export function validateConfig(input = {}) {
  if (Object.keys(input).some(key => !(key in DEFAULT_CONFIG))) throw new Error('UNKNOWN_CONFIG_KEY');
  const c = { ...DEFAULT_CONFIG, ...input };
  if (c.mode !== 'paper') throw new Error('LIVE_TRADING_NOT_IMPLEMENTED');
  if(!['fixed','elastic'].includes(c.capitalMode))throw Error('INVALID_CAPITAL_MODE');
  if(c.capitalMode==='elastic'&&c.autoPaper)throw Error('ELASTIC_MODE_IS_MANUAL_ONLY');
  if (c.initialCashFen !== 100000 || c.stopEquityFen !== 90000) throw new Error('RISK_BUDGET_FIXED_1000_900');
  for (const key of ['maxPositionFen', 'maxOrdersPerDay', 'minimumCommissionFen', 'maxQuoteAgeMs', 'pollIntervalMs']) {
    if (!Number.isSafeInteger(c[key]) || c[key] <= 0) throw new Error('INVALID_CONFIG_' + key);
  }
  if (c.maxPositionFen > 50000 || c.maxOrdersPerDay > 4 || c.maxQuoteAgeMs > 120000 || c.pollIntervalMs < 30000) throw new Error('CONFIG_EXCEEDS_PAPER_LIMITS');
  for (const key of ['commissionRate', 'positionStopLossRate', 'trailingActivationRate', 'trailingDrawdownRate']) {
    if (!Number.isFinite(c[key]) || c[key] <= 0 || c[key] > 0.15) throw new Error('INVALID_CONFIG_' + key);
  }
  if (!Number.isFinite(c.maxSpreadBps) || c.maxSpreadBps <= 0 || c.maxSpreadBps > 100) throw new Error('INVALID_SPREAD_LIMIT');
  if (!(c.activeSymbol in SYMBOLS) || typeof c.autoPaper !== 'boolean') throw new Error('INVALID_STRATEGY_CONFIG');
  return Object.freeze(c);
}

export function shanghaiTime(when = Date.now()) {
  const d = new Date(when + 8 * 3600000);
  return { date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}
export function inSession(when) {
  const { minute, weekday } = shanghaiTime(when);
  return weekday !== 0 && weekday !== 6 && ((minute >= 570 && minute < 690) || (minute >= 780 && minute < 897));
}
export function valueFen(quantity, priceMills) {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(priceMills) || priceMills <= 0) throw new Error('INVALID_PRICE_OR_QUANTITY');
  return safeInteger(BigInt(quantity)*BigInt(priceMills)/10n);
}
function safeInteger(value){if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))throw Error('AMOUNT_OVERFLOW');return Number(value);}
const add=(a,b)=>safeInteger(BigInt(a)+BigInt(b));
function fraction(value){const [base,exponent='0']=String(value).toLowerCase().split('e'),places=(base.split('.')[1]||'').length-Number(exponent);let numerator=BigInt(base.replace('.','')),denominator=1n;if(places>=0)denominator=10n**BigInt(places);else numerator*=10n**BigInt(-places);return [numerator,denominator];}
export function validateQuote(q) {
  if (!q || !(q.symbol in SYMBOLS)) throw new Error('UNKNOWN_SYMBOL');
  for (const key of ['priceMills', 'bidMills', 'askMills']) {
    if (!Number.isSafeInteger(q[key]) || q[key] <= 0 || q[key] > 1000000) throw new Error('INVALID_QUOTE');
  }
  if (q.bidMills > q.askMills || !Number.isSafeInteger(q.timestamp) || q.timestamp <= 0 || typeof q.source !== 'string') throw new Error('INVALID_QUOTE');
  return q;
}

export class PaperEngine {
  constructor(dbPath, config = {}, clock = () => Date.now()) {
    this.config = validateConfig(config);
    this.clock = clock;
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK(id=1), cash_fen INTEGER NOT NULL CHECK(cash_fen>=0), halted INTEGER NOT NULL, halt_reason TEXT);
      CREATE TABLE IF NOT EXISTS positions (symbol TEXT PRIMARY KEY, quantity INTEGER NOT NULL CHECK(quantity>0), cost_fen INTEGER NOT NULL, purchase_date TEXT NOT NULL, peak_mills INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quotes (symbol TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history (symbol TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, json TEXT NOT NULL, date TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if(!this.db.prepare('PRAGMA table_info(account)').all().some(c=>c.name==='contributed_fen'))this.db.exec('ALTER TABLE account ADD COLUMN contributed_fen INTEGER NOT NULL DEFAULT 100000');
    this.db.exec('CREATE TABLE IF NOT EXISTS position_lots (id TEXT PRIMARY KEY,symbol TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),cost_fen INTEGER NOT NULL,purchase_date TEXT NOT NULL)');
    const marker = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('mode');
    if (marker && marker.value !== 'paper') throw new Error('DATABASE_MODE_MISMATCH');
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('mode', 'paper');
    this.db.prepare('INSERT OR IGNORE INTO account (id,cash_fen,halted,halt_reason,contributed_fen) VALUES (1,?,0,NULL,?)').run(this.config.initialCashFen,this.config.initialCashFen);
    for(const p of this.positions())if(!this.db.prepare('SELECT 1 FROM position_lots WHERE symbol=?').get(p.symbol))this.db.prepare('INSERT INTO position_lots VALUES (?,?,?,?,?)').run('legacy:'+p.symbol,p.symbol,p.quantity,p.cost_fen,p.purchase_date);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  event(kind, data) {
    this.db.prepare('INSERT INTO events(timestamp,kind,json) VALUES (?,?,?)').run(new Date(this.clock()).toISOString(), kind, JSON.stringify(data));
  }
  fee(amountFen) { const [n,d]=fraction(this.config.commissionRate);return Math.max(this.config.minimumCommissionFen,safeInteger((BigInt(amountFen)*n+d-1n)/d)); }
  quotes() { return this.db.prepare('SELECT json FROM quotes').all().map(row => JSON.parse(row.json)); }
  quote(symbol) { const row = this.db.prepare('SELECT json FROM quotes WHERE symbol=?').get(symbol); return row ? JSON.parse(row.json) : null; }
  positions() { return this.db.prepare('SELECT * FROM positions ORDER BY symbol').all(); }
  setQuotes(quotes) {
    const now = this.clock();
    quotes.forEach(validateQuote);
    if (new Set(quotes.map(q => q.symbol)).size !== quotes.length) throw new Error('DUPLICATE_SYMBOL');
    this.transaction(() => {
      for (const q of quotes) {
        if (q.timestamp > now + 5000) throw new Error('FUTURE_QUOTE');
        const previous = this.quote(q.symbol);
        if (previous && q.timestamp < previous.timestamp) continue;
        this.db.prepare('INSERT OR REPLACE INTO quotes VALUES (?,?)').run(q.symbol, JSON.stringify(q));
        this.db.prepare('UPDATE positions SET peak_mills=MAX(peak_mills,?) WHERE symbol=?').run(q.priceMills, q.symbol);
      }
      const s = this.snapshot();
      if (this.config.capitalMode==='fixed'&&s.valuationComplete && s.estimatedLiquidationFen <= this.config.stopEquityFen && !s.halted) this.haltUnsafe('ACCOUNT_STOP_900');
    });
  }
  setHistory(symbol, bars) {
    if (!(symbol in SYMBOLS) || !Array.isArray(bars) || bars.length > 500) throw new Error('INVALID_HISTORY');
    const dates = new Set();
    for (const b of bars) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date)) || dates.has(b.date) || !Number.isSafeInteger(b.closeMills) || b.closeMills <= 0 || b.closeMills > 1000000) throw new Error('INVALID_BAR');
      dates.add(b.date);
    }
    const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
    this.db.prepare('INSERT OR REPLACE INTO history VALUES (?,?)').run(symbol, JSON.stringify(sorted));
  }
  history(symbol) { const r = this.db.prepare('SELECT json FROM history WHERE symbol=?').get(symbol); return r ? JSON.parse(r.json) : []; }
  quoteProblem(q, when = this.clock()) {
    if (!q) return 'NO_QUOTE';
    if (!inSession(when)) return 'MARKET_CLOSED';
    if (shanghaiTime(q.timestamp).date !== shanghaiTime(when).date || when - q.timestamp > this.config.maxQuoteAgeMs || q.timestamp > when + 5000) return 'STALE_QUOTE';
    return null;
  }
  snapshot() {
    const a = this.db.prepare('SELECT * FROM account WHERE id=1').get();
    let equity = a.cash_fen, liquidation = a.cash_fen, complete = true;
    const positions = this.positions().map(p => {
      const q = this.quote(p.symbol);
      if (!q) { complete = false; return { ...p, valuation: null }; }
      const mark = valueFen(p.quantity, q.priceMills);
      equity = add(equity,mark);
      liquidation = add(liquidation,Math.max(0, valueFen(p.quantity, q.bidMills) - this.fee(valueFen(p.quantity, q.bidMills))));
      const date=shanghaiTime(this.clock()).date,lots=this.db.prepare('SELECT * FROM position_lots WHERE symbol=?').all(p.symbol),sellableQuantity=lots.filter(l=>!SYMBOLS[p.symbol].tPlusOne||l.purchase_date<date).reduce((sum,l)=>add(sum,l.quantity),0);
      return { ...p, marketValueFen: mark, unrealizedPnlFen: mark - p.cost_fen, sellableQuantity,quoteTimestamp: q.timestamp, quoteProblem: this.quoteProblem(q) };
    });
    return { mode: 'paper', label: '模拟资金，非证券账户', liveTrading: false, brokerConnection: 'not_connected',
      initialCashFen: this.config.initialCashFen, stopEquityFen: this.config.capitalMode==='fixed'?this.config.stopEquityFen:null,
      capitalMode:this.config.capitalMode,virtualCapitalUnlimited:this.config.capitalMode==='elastic',contributedFen:a.contributed_fen,
      additionalFundingFen:a.contributed_fen-this.config.initialCashFen,
      effectiveLimits:{maxPositionFen:this.config.capitalMode==='fixed'?this.config.maxPositionFen:null,maxOrdersPerDay:this.config.capitalMode==='fixed'?this.config.maxOrdersPerDay:null,maxOrderQuantity:this.config.capitalMode==='fixed'?10000:null,automaticTrading:this.config.capitalMode==='fixed'&&this.config.autoPaper},
      cashFen: a.cash_fen, equityFen: complete ? equity : null, estimatedLiquidationFen: complete ? liquidation : null,
      pnlFen: complete ? equity - a.contributed_fen : null, valuationComplete: complete,
      halted: Boolean(a.halted), haltReason: a.halt_reason, positions,
      feeAssumption: { rate: this.config.commissionRate, minimumFen: this.config.minimumCommissionFen, verifiedBrokerRate: false },
      stopIsGuarantee: false, strategyValidated: false, timestamp: new Date(this.clock()).toISOString() };
  }
  haltUnsafe(reason) {
    this.db.prepare('UPDATE account SET halted=1,halt_reason=? WHERE id=1').run(reason);
    this.event('HALT', { reason, liveTrading: false });
  }
  halt(reason = 'MANUAL_PAPER_HALT') {
    this.transaction(() => this.haltUnsafe(reason));
    return this.snapshot();
  }
  order({ requestId, symbol, side, quantity, amountFen:budgetFen, mode = 'paper' }, { riskExit = false } = {}) {
    if (mode !== 'paper') throw new Error('LIVE_TRADING_NOT_IMPLEMENTED');
    if (!(symbol in SYMBOLS) || !['buy', 'sell'].includes(side)) throw new Error('INVALID_ORDER');
    if((quantity===undefined)===(budgetFen===undefined))throw Error('SPECIFY_QUANTITY_OR_AMOUNT');
    if(quantity!==undefined&&(!Number.isSafeInteger(quantity)||quantity<=0||quantity%100||(this.config.capitalMode==='fixed'&&quantity>10000)))throw Error('INVALID_LOT_SIZE');
    if(budgetFen!==undefined&&(side!=='buy'||!Number.isSafeInteger(budgetFen)||budgetFen<=0))throw Error('INVALID_ORDER_BUDGET');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(requestId)) throw new Error('INVALID_REQUEST_ID');
    const fingerprint = JSON.stringify({ symbol, side, quantity, amountFen:budgetFen, mode });
    const legacyFingerprint = JSON.stringify({ symbol, side, quantity, mode });
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM orders WHERE request_id=?').get(requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint && !(budgetFen===undefined&&previous.fingerprint===legacyFingerprint)) throw new Error('IDEMPOTENCY_CONFLICT');
        return { ...JSON.parse(previous.json), replayed: true };
      }
      const s = this.snapshot(), q = this.quote(symbol);
      const problem = this.quoteProblem(q);
      if (problem) throw new Error(problem);
      const date = shanghaiTime(this.clock()).date;
      if (side === 'buy' && (!s.valuationComplete || s.halted || (this.config.capitalMode==='fixed'&&s.estimatedLiquidationFen <= this.config.stopEquityFen))) throw new Error('ACCOUNT_HALTED_OR_UNVALUED');
      const count = this.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE date=?').get(date).n;
      if (this.config.capitalMode==='fixed'&&side === 'buy' && count >= this.config.maxOrdersPerDay) throw new Error('DAILY_ORDER_LIMIT');
      const p = this.positions().find(item => item.symbol === symbol);
      const priceMills = side === 'buy' ? q.askMills : q.bidMills;
      if(budgetFen!==undefined){
        let low=0n,high=BigInt(budgetFen)*10n/(BigInt(priceMills)*100n);high=high<BigInt(Number.MAX_SAFE_INTEGER)/100n?high:BigInt(Number.MAX_SAFE_INTEGER)/100n;
        while(low<high){const mid=(low+high+1n)/2n,qnty=safeInteger(mid*100n),cost=valueFen(qnty,priceMills);if(BigInt(cost)+BigInt(this.fee(cost))<=BigInt(budgetFen))low=mid;else high=mid-1n;}
        quantity=safeInteger(low*100n);if(!quantity)throw Error('BUDGET_BELOW_ONE_LOT');
        if(this.config.capitalMode==='fixed'&&quantity>10000)throw Error('INVALID_LOT_SIZE');
      }
      const amountFen = valueFen(quantity, priceMills), feeFen = this.fee(amountFen),totalFen=add(amountFen,feeFen);
      let autoFundingFen=0;
      if (side === 'buy') {
        if (this.config.capitalMode==='fixed'&&(s.positions.length || p)) throw new Error('ONE_POSITION_ONLY');
        if ((q.askMills - q.bidMills) / q.priceMills * 10000 > this.config.maxSpreadBps) throw new Error('SPREAD_TOO_WIDE');
        if(this.config.capitalMode==='fixed'){
          if(totalFen>this.config.maxPositionFen)throw Error('POSITION_LIMIT');
          if(totalFen>s.cashFen)throw Error('INSUFFICIENT_CASH');
          const liquidationAfter=s.cashFen-totalFen+Math.max(0,valueFen(quantity,q.bidMills)-this.fee(valueFen(quantity,q.bidMills)));
          if(liquidationAfter<=this.config.stopEquityFen)throw Error('POST_TRADE_RISK_LIMIT');
        }else if(totalFen>s.cashFen){
          autoFundingFen=totalFen-s.cashFen;const contributed=add(s.contributedFen,autoFundingFen),cash=add(s.cashFen,autoFundingFen);
          this.db.prepare('UPDATE account SET cash_fen=?,contributed_fen=? WHERE id=1').run(cash,contributed);
          this.event('VIRTUAL_FUNDING',{requestId,amountFen:autoFundingFen,contributedFen:contributed,mode:'paper',liveTrading:false});
        }
        const newQuantity=add(p?.quantity||0,quantity),newCost=add(p?.cost_fen||0,totalFen);
        this.db.prepare('UPDATE account SET cash_fen=cash_fen-? WHERE id=1').run(totalFen);
        this.db.prepare('INSERT OR REPLACE INTO positions VALUES (?,?,?,?,?)').run(symbol,newQuantity,newCost,p?.purchase_date||date,Math.max(p?.peak_mills||0,priceMills));
        this.db.prepare('INSERT INTO position_lots VALUES (?,?,?,?,?)').run('buy:'+requestId,symbol,quantity,totalFen,date);
      } else {
        if (!p || quantity > p.quantity) throw new Error('INSUFFICIENT_POSITION');
        const lots=this.db.prepare('SELECT * FROM position_lots WHERE symbol=? ORDER BY purchase_date,rowid').all(symbol).filter(l=>!SYMBOLS[symbol].tPlusOne||l.purchase_date<date);
        if(lots.reduce((sum,l)=>add(sum,l.quantity),0)<quantity)throw Error('T_PLUS_ONE_SELL_BLOCKED');
        if (feeFen > amountFen) throw new Error('PROCEEDS_BELOW_FEE');
        this.db.prepare('UPDATE account SET cash_fen=? WHERE id=1').run(add(s.cashFen,amountFen-feeFen));
        let remaining=quantity,removedCost=0;
        for(const lot of lots){if(!remaining)break;const take=Math.min(lot.quantity,remaining),cost=safeInteger(BigInt(lot.cost_fen)*BigInt(take)/BigInt(lot.quantity));removedCost=add(removedCost,cost);remaining-=take;if(take===lot.quantity)this.db.prepare('DELETE FROM position_lots WHERE id=?').run(lot.id);else this.db.prepare('UPDATE position_lots SET quantity=?,cost_fen=? WHERE id=?').run(lot.quantity-take,lot.cost_fen-cost,lot.id);}
        if (quantity === p.quantity) this.db.prepare('DELETE FROM positions WHERE symbol=?').run(symbol);
        else {const first=this.db.prepare('SELECT MIN(purchase_date) AS date FROM position_lots WHERE symbol=?').get(symbol);this.db.prepare('UPDATE positions SET quantity=?,cost_fen=?,purchase_date=? WHERE symbol=?').run(p.quantity-quantity,p.cost_fen-removedCost,first.date,symbol);}
      }
      const result = { mode: 'paper', liveTrading: false, requestId, symbol, side, quantity, priceMills, amountFen, feeFen, date, riskExit,capitalMode:this.config.capitalMode,autoFundingFen,...(budgetFen!==undefined?{requestedBudgetFen:budgetFen,unspentBudgetFen:budgetFen-totalFen}:{}), fillModel: '即时买卖一档、假定全部成交；不是实盘回执，不验证该数量的真实市场深度' };
      this.db.prepare('INSERT INTO orders VALUES (?,?,?,?)').run(requestId, fingerprint, JSON.stringify(result), date);
      this.event('PAPER_FILL', result);
      const after = this.snapshot();
      if (this.config.capitalMode==='fixed'&&!after.halted && after.valuationComplete && after.estimatedLiquidationFen <= this.config.stopEquityFen) this.haltUnsafe('ACCOUNT_STOP_900');
      return result;
    });
  }
  signal(symbol = this.config.activeSymbol) {
    if (!(symbol in SYMBOLS)) throw new Error('UNKNOWN_SYMBOL');
    const date = shanghaiTime(this.clock()).date;
    const bars = this.history(symbol).filter(b => b.date < date);
    if (bars.length < 60) return { symbol, action: 'wait', reason: 'NEED_60_COMPLETED_BARS', bars: bars.length, validated: false };
    if (Date.parse(date) - Date.parse(bars.at(-1).date) > 14 * 86400000) return { symbol, action: 'wait', reason: 'HISTORY_STALE', lastCompletedDate: bars.at(-1).date, validated: false };
    const average = count => bars.slice(-count).reduce((sum, b) => sum + b.closeMills, 0) / count;
    const ma20 = average(20), ma60 = average(60), close = bars.at(-1).closeMills;
    return { symbol, action: ma20 > ma60 && close > ma20 ? 'entry_candidate' : 'wait', reason: 'DAILY_TREND_20_60', ma20Mills: ma20, ma60Mills: ma60, lastCompletedDate: bars.at(-1).date, validated: false, usesTodaysIncompleteBar: false };
  }
  cycle({ allowEntry = true } = {}) {
    if(this.config.capitalMode==='elastic')return {mode:'paper',actions:[],signal:this.signal(),manualOnly:true,snapshot:this.snapshot()};
    const actions = [], now = this.clock(), { date, minute } = shanghaiTime(now);
    for (const p of this.positions()) {
      const q = this.quote(p.symbol);
      if (this.quoteProblem(q, now)) continue;
      const s = this.snapshot(), net = valueFen(p.quantity, q.bidMills) - this.fee(valueFen(p.quantity, q.bidMills));
      const lossExit = net <= p.cost_fen * (1 - this.config.positionStopLossRate);
      const peakNet = valueFen(p.quantity, p.peak_mills) - this.fee(valueFen(p.quantity, p.peak_mills));
      const trailExit = peakNet >= p.cost_fen * (1 + this.config.trailingActivationRate) && q.bidMills <= p.peak_mills * (1 - this.config.trailingDrawdownRate);
      if (s.halted || lossExit || trailExit) {
        try { actions.push(this.order({ requestId: `risk:${date}:${p.symbol}:${p.quantity}:${q.timestamp}`, symbol: p.symbol, side: 'sell', quantity: p.quantity }, { riskExit: true })); }
        catch (e) { actions.push({ symbol: p.symbol, action: 'exit_blocked', reason: e.message }); }
      }
    }
    const s = this.snapshot(), symbol = this.config.activeSymbol, q = this.quote(symbol), signal = this.signal(symbol);
    if (allowEntry && this.config.autoPaper && !s.halted && !s.positions.length && !this.quoteProblem(q) && minute >= 890 && minute < 897 && signal.action === 'entry_candidate') {
      const todayOrders = this.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE date=?').get(date).n;
      if (!todayOrders && q.askMills >= signal.ma20Mills && q.askMills <= signal.ma20Mills * 1.03) {
        let quantity = Math.floor(this.config.maxPositionFen / (q.askMills * 10)) * 100;
        while (quantity > 0 && valueFen(quantity, q.askMills) + this.fee(valueFen(quantity, q.askMills)) > this.config.maxPositionFen) quantity -= 100;
        if (quantity > 0) {
          try { actions.push(this.order({ requestId: `entry:${date}:${symbol}`, symbol, side: 'buy', quantity })); }
          catch (e) { actions.push({ symbol, action: 'entry_blocked', reason: e.message }); }
        }
      }
    }
    return { mode: 'paper', actions, signal, snapshot: this.snapshot() };
  }
  journal(limit = 30) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_LIMIT');
    return this.db.prepare('SELECT id,timestamp,kind,json FROM events ORDER BY id DESC LIMIT ?').all(limit).map(r => ({ id: r.id, timestamp: r.timestamp, kind: r.kind, data: JSON.parse(r.json) }));
  }
}
