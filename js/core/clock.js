/* JG.clock: the one game clock (plan section 1, sentence 2). Everything timed in the game runs on it: timers, per-tick
 * waiters, tweens. JG.loop advances it with scaled dt; nothing here reads wall time. Also: JG.ease (easing functions),
 * JG.random() (the seeded RNG, reseeded at boot), JG.Cancel and JG.Scope (cancellable flows). Classic script; touches
 * neither THREE nor the DOM.
 *
 *   JG.clock.after(sec, fn, tag?) -> {cancel()}          one-shot timer on game time
 *   JG.clock.everyTick(fn(dt, t), tag?) -> {cancel()}    per tick until fn returns true or cancel()
 *   JG.clock.tween(obj, props, sec, ease?, tag?) -> {duration, stop(toEnd?), done: Promise}
 *   JG.clock.tweenFn(sec, fn(k), ease?, tag?)   -> {duration, stop(toEnd?), done: Promise}
 *   JG.clock.killTweens(tag)                             stops tweens and timers carrying that tag
 *
 * Scope (the sequencer's unit of cancellation; a beat runs in one, w.fork/parallel/race make children):
 *   s = new JG.Scope(parent?, name?)   s.child(name)   s.cancel(reason)   s.cancelled   s.check() (throws Cancel)
 *   s.onCancel(fn) -> off    s.guard(promise)    s.wait(sec)    s.frame()    s.until(fn, {timeout}) -> true|false
 *   s.tween(...) / s.tweenFn(...) -> Promise (stopped on cancel)    s.after(sec, fn)    s.everyTick(fn)    s.dispose()
 * Every promise a scope hands out rejects with a JG.Cancel when the scope is cancelled; JG.isCancel(e) tells them
 * apart from real errors. Scope promises are pre-marked as handled, so a cancelled flow nobody awaits never logs an
 * "uncaught (in promise)". */
(function () {
  'use strict';
  var JG = window.JG;
  function noop() {}

  // ---------- Cancel ----------
  function Cancel(reason) {
    this.name = 'Cancel';
    this.message = 'cancelled' + (reason ? ': ' + reason : '');
    this.reason = reason || null;
  }
  Cancel.prototype = Object.create(Error.prototype);
  Cancel.prototype.constructor = Cancel;
  Cancel.prototype.isCancel = true;
  JG.Cancel = Cancel;
  JG.isCancel = function (e) { return !!(e && e.isCancel); };

  // ---------- easing ----------
  var PI = Math.PI;
  JG.ease = {
    linear: function (k) { return k; },
    inQuad: function (k) { return k * k; },
    outQuad: function (k) { return k * (2 - k); },
    inOutQuad: function (k) { return k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k; },
    inCubic: function (k) { return k * k * k; },
    outCubic: function (k) { var m = k - 1; return m * m * m + 1; },
    inOutCubic: function (k) { return k < 0.5 ? 4 * k * k * k : (k - 1) * (2 * k - 2) * (2 * k - 2) + 1; },
    inOutSine: function (k) { return -(Math.cos(PI * k) - 1) / 2; },
    outSine: function (k) { return Math.sin(k * PI / 2); },
    inSine: function (k) { return 1 - Math.cos(k * PI / 2); },
    outBack: function (k) { var c1 = 1.70158, c3 = c1 + 1, m = k - 1; return 1 + c3 * m * m * m + c1 * m * m; },
    inBack: function (k) { var c1 = 1.70158; return (c1 + 1) * k * k * k - c1 * k * k; },
    outElastic: function (k) { return k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * PI / 3)) + 1; },
    outBounce: function (k) {
      var n1 = 7.5625, d1 = 2.75;
      if (k < 1 / d1) return n1 * k * k;
      if (k < 2 / d1) { k -= 1.5 / d1; return n1 * k * k + 0.75; }
      if (k < 2.5 / d1) { k -= 2.25 / d1; return n1 * k * k + 0.9375; }
      k -= 2.625 / d1; return n1 * k * k + 0.984375;
    }
  };
  function easeFn(e) {
    if (typeof e === 'function') return e;
    if (e && JG.ease[e]) return JG.ease[e];
    if (e) JG.warn('ease:' + e, 'unknown ease "' + e + '", using inOutQuad');
    return JG.ease.inOutQuad;
  }
  JG.easeFn = easeFn;

  // ---------- RNG ----------
  var rand = JG.rng(1);
  /** The game's only random source outside kit.rng: seeded at boot from JG.config.seed. */
  JG.random = function () { return rand(); };
  JG.reseed = function (seed) { rand = JG.rng(seed >>> 0); };

  // ---------- clock ----------
  var timers = [], tickers = [], tweens = [];
  var clock = JG.clock = {
    t: 0, frame: 0, dt: 0,
    after: function (sec, fn, tag) {
      var tm = { due: clock.t + Math.max(0, +sec || 0), fn: fn, tag: tag || null, dead: false };
      timers.push(tm);
      return { cancel: function () { tm.dead = true; } };
    },
    everyTick: function (fn, tag) {
      var tk = { fn: fn, tag: tag || null, dead: false };
      tickers.push(tk);
      return { cancel: function () { tk.dead = true; } };
    },
    tween: function (obj, props, sec, ease, tag) {
      var keys = Object.keys(props), from = null;
      return clock.tweenFn(sec, function (k) {
        if (!from) { from = {}; keys.forEach(function (key) { from[key] = +obj[key] || 0; }); }
        keys.forEach(function (key) { obj[key] = from[key] + (props[key] - from[key]) * k; });
      }, ease, tag);
    },
    tweenFn: function (sec, fn, ease, tag) {
      sec = Math.max(0, +sec || 0);
      var tw = { t0: clock.t, sec: sec, fn: fn, ease: easeFn(ease), tag: tag || null, dead: false, resolve: null };
      tw.done = new Promise(function (res) { tw.resolve = res; });
      if (sec === 0) { safe(function () { fn(1); }); tw.dead = true; tw.resolve(true); }
      else { safe(function () { fn(0); }); tweens.push(tw); }
      return {
        duration: sec, done: tw.done,
        stop: function (toEnd) {
          if (tw.dead) return;
          tw.dead = true;
          if (toEnd) safe(function () { fn(1); });
          tw.resolve(false);
        }
      };
    },
    killTweens: function (tag) {
      tweens.forEach(function (tw) { if (!tag || tw.tag === tag) { if (!tw.dead) { tw.dead = true; tw.resolve(false); } } });
      timers.forEach(function (tm) { if (!tag || tm.tag === tag) tm.dead = true; });
      tickers.forEach(function (tk) { if (!tag || tk.tag === tag) tk.dead = true; });
    },
    /** advance game time by dt seconds (already time-scaled) */
    tick: function (dt) {
      clock.dt = dt;
      clock.t += dt;
      clock.frame++;
      var now = clock.t, i;
      // timers, in due order; timers added while firing wait for the next tick
      var due = [];
      for (i = 0; i < timers.length; i++) if (!timers[i].dead && timers[i].due <= now + 1e-9) due.push(timers[i]);
      due.sort(function (a, b) { return a.due - b.due; });
      due.forEach(function (tm) { if (tm.dead) return; tm.dead = true; safe(tm.fn); });
      // tweens
      for (i = 0; i < tweens.length; i++) {
        var tw = tweens[i];
        if (tw.dead) continue;
        var k = Math.min(1, (now - tw.t0) / tw.sec);
        safe(function () { tw.fn(tw.ease(k)); });
        if (k >= 1) { tw.dead = true; tw.resolve(true); }
      }
      // per-tick waiters
      var list = tickers.slice();
      for (i = 0; i < list.length; i++) {
        var tk = list[i];
        if (tk.dead) continue;
        var stop = false;
        safe(function () { stop = tk.fn(dt, now) === true; });
        if (stop) tk.dead = true;
      }
      if (clock.frame % 30 === 0) compact();
    },
    reset: function () { clock.t = 0; clock.frame = 0; clock.killTweens(); compact(); },
    stats: function () { return { timers: timers.length, tickers: tickers.length, tweens: tweens.length }; }
  };
  function compact() {
    timers = timers.filter(function (x) { return !x.dead; });
    tickers = tickers.filter(function (x) { return !x.dead; });
    tweens = tweens.filter(function (x) { return !x.dead; });
  }
  function safe(fn) { try { fn(); } catch (e) { JG.error('clock', e); } }

  // ---------- Scope ----------
  function handled(p) { p.catch(noop); return p; }

  function Scope(parent, name) {
    this.name = name || 'scope';
    this.parent = parent || null;
    this.cancelled = false;
    this.reason = null;
    this.children = [];
    this.listeners = [];
    if (parent) {
      if (parent.cancelled) { this.cancelled = true; this.reason = parent.reason; }
      else parent.children.push(this);
    }
  }
  Scope.prototype.child = function (name) { return new Scope(this, name); };
  Scope.prototype.cancel = function (reason) {
    if (this.cancelled) return;
    this.cancelled = true;
    this.reason = reason || 'cancelled';
    var kids = this.children.slice();
    this.children.length = 0;
    kids.forEach(function (c) { c.cancel(reason); });
    var ls = this.listeners.slice().reverse();
    this.listeners.length = 0;
    ls.forEach(function (fn) { try { fn(reason); } catch (e) { JG.error('scope.onCancel', e); } });
    this.detach();
  };
  Scope.prototype.detach = function () {
    if (!this.parent) return;
    var i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
  };
  /** finished normally: drop listeners and leave the parent (does not cancel children still running) */
  Scope.prototype.dispose = function () { this.listeners.length = 0; this.detach(); };
  Scope.prototype.onCancel = function (fn) {
    var self = this;
    if (this.cancelled) { try { fn(this.reason); } catch (e) { JG.error('scope.onCancel', e); } return noop; }
    this.listeners.push(fn);
    return function off() { var i = self.listeners.indexOf(fn); if (i >= 0) self.listeners.splice(i, 1); };
  };
  Scope.prototype.check = function () { if (this.cancelled) throw new Cancel(this.reason); };
  /** a promise for (resolve, reject, onCancelCleanup) that rejects with Cancel when the scope is cancelled */
  Scope.prototype.promise = function (executor) {
    var self = this;
    return handled(new Promise(function (resolve, reject) {
      if (self.cancelled) return reject(new Cancel(self.reason));
      var cleanup = noop, settled = false;
      var off = self.onCancel(function (r) { if (settled) return; settled = true; try { cleanup(); } catch (e) { JG.error('scope', e); } reject(new Cancel(r)); });
      function res(v) { if (settled) return; settled = true; off(); try { cleanup(); } catch (e) { JG.error('scope', e); } resolve(v); }
      function rej(e) { if (settled) return; settled = true; off(); try { cleanup(); } catch (e2) { JG.error('scope', e2); } reject(e); }
      try { cleanup = executor(res, rej) || noop; } catch (e) { rej(e); }
    }));
  };
  Scope.prototype.guard = function (p) {
    return this.promise(function (res, rej) { Promise.resolve(p).then(res, rej); });
  };
  Scope.prototype.wait = function (sec) {
    var tag = this;
    return this.promise(function (res) {
      var tm = clock.after(sec, function () { res(); }, tag);
      return function () { tm.cancel(); };
    });
  };
  Scope.prototype.after = function (sec, fn) {
    var self = this, tm = clock.after(sec, function () { if (!self.cancelled) fn(); });
    this.onCancel(function () { tm.cancel(); });
    return tm;
  };
  Scope.prototype.everyTick = function (fn) {
    var self = this, tk = clock.everyTick(function (dt, t) { return self.cancelled ? true : fn(dt, t); });
    this.onCancel(function () { tk.cancel(); });
    return tk;
  };
  Scope.prototype.frame = function () {
    return this.promise(function (res) {
      var tk = clock.everyTick(function () { res(); return true; });
      return function () { tk.cancel(); };
    });
  };
  /** resolves true once fn() is truthy (checked now, then every tick), or false after opts.timeout seconds */
  Scope.prototype.until = function (fn, opts) {
    var timeout = opts && opts.timeout;
    return this.promise(function (res, rej) {
      var t0 = clock.t;
      try { if (fn()) { res(true); return; } } catch (e) { rej(e); return; }
      var tk = clock.everyTick(function () {
        var ok;
        try { ok = fn(); } catch (e) { rej(e); return true; }
        if (ok) { res(true); return true; }
        if (timeout !== undefined && clock.t - t0 >= timeout) { res(false); return true; }
      });
      return function () { tk.cancel(); };
    });
  };
  Scope.prototype.tweenFn = function (sec, fn, ease) {
    return this.promise(function (res) {
      var h = clock.tweenFn(sec, fn, ease, 'beat');
      h.done.then(function () { res(); });
      return function () { h.stop(false); };
    });
  };
  Scope.prototype.tween = function (obj, props, sec, ease) {
    return this.promise(function (res) {
      var h = clock.tween(obj, props, sec, ease, 'beat');
      h.done.then(function () { res(); });
      return function () { h.stop(false); };
    });
  };
  JG.Scope = Scope;
})();
