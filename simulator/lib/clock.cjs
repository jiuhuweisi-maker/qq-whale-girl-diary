const { setImmediate: yieldIO } = require('node:timers/promises');
class SimClock {
  constructor(now = Date.parse('2026-10-26T10:00:00Z')) { this.now = now; this.jobs = new Map(); this.id = 0; }
  setTimeout(fn, ms = 0, ...args) { const id = ++this.id; this.jobs.set(id, { at: this.now + Math.max(0, Number(ms) || 0), fn: () => fn(...args) }); return id; }
  clearTimeout(id) { this.jobs.delete(id); }
  async microtasks() { for (let i = 0; i < 5; i++) await yieldIO(); }
  async advance(ms) {
    const target = this.now + ms; let steps = 0;
    while (true) {
      await this.microtasks();
      const next = [...this.jobs].filter(([, j]) => j.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      if (++steps > 10000) throw new Error('simulated timer runaway');
      this.now = Math.max(this.now, next[1].at); this.jobs.delete(next[0]); next[1].fn();
    }
    this.now = target; await this.microtasks();
  }
  async settle(promise, maxMs = 180000) {
    let done = false, value, failure; const until = this.now + maxMs;
    Promise.resolve(promise).then(x => { done = true; value = x; }, e => { done = true; failure = e; });
    for (let n = 0; n < 10000 && !done; n++) {
      await this.microtasks(); if (done) break;
      const at = Math.min(...[...this.jobs.values()].map(j => j.at));
      if (!Number.isFinite(at) || at > until) throw new Error('unresolved simulated operation');
      await this.advance(Math.max(0, at - this.now));
    }
    if (!done) throw new Error('simulated operation exceeded step budget');
    if (failure) throw failure; return value;
  }
  async drain() {
    for (let i = 0; i < 100; i++) {
      await this.microtasks(); if (!this.jobs.size) return;
      const at = Math.min(...[...this.jobs.values()].map(j => j.at));
      await this.advance(Math.max(0, at - this.now));
    }
    throw new Error('simulated queue did not drain');
  }
  dateClass() {
    const clock = this;
    return class SimDate extends Date {
      constructor(...args) { super(...(args.length ? args : [clock.now])); }
      static now() { return clock.now; }
      getHours() { return new Date(this.getTime() + 8 * 3600000).getUTCHours(); }
    };
  }
}
module.exports = { SimClock };
