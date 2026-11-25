/* Sound effects, loops and ambiences (plan section 6 "Audio", section 9 "Sound sources"). OWNER: E6.
 * Classic IIFE; touches neither THREE nor the DOM at load, and never touches Web Audio: everything here is pure sample
 * math on Float32Arrays, so the same recipes render in the browser (audio.js turns them into AudioBuffers at preload)
 * and in Node (dev/scratch/stage1/audio-check.mjs renders every one offline and checks it).
 *
 *   JG.synth                      the small synth kit (oscillators, biquads, envelopes, noise, reverb, loop folding),
 *                                 shared with music.js
 *   JG.sfxLib.ids                 {sfx: [...frozen ids], loops: [...], ambience: [...]}
 *   JG.sfxLib.render(kind, id, sr) -> {ch: [Float32Array, ...], sr, dur, loop}   kind = 'sfx'|'loop'|'ambience'
 *   JG.sfxLib.has(kind, id)
 *
 * Determinism: every recipe draws its noise and its random choices from a seeded generator keyed by its id (JG.rng
 * when core is loaded, the same mulberry32 otherwise), so a render is identical every time. No Math.random, no timers.
 * Every recipe is peak-normalised to its own `peak` (all <= 0.9), so loudness balance lives in one number per sound.
 * Nothing here is a sample of anything: melodic sounds (ringtone, ding, chimes, ting, stings) are original motifs, and
 * the ringtone is a generic two-tone warble rather than any phone maker's tone (section 11 "Deliberately avoided"). */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var TAU = Math.PI * 2;

  // =================================================================================================================
  // Synth kit
  // =================================================================================================================
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function rngFor(key) { return (JG.rng || mulberry)(hashStr(String(key))); }

  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  /** 'C5', 'F#4', 'Bb3' or a midi number -> Hz */
  function hz(n) {
    if (typeof n === 'number') return 440 * Math.pow(2, (n - 69) / 12);
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
    if (!m) return 440;
    var midi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function midiOf(n) { return Math.round(69 + 12 * Math.log(hz(n) / 440) / Math.LN2); }
  function db(x) { return Math.pow(10, x / 20); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  /** RBJ biquad; type lp|hp|bp|peak|notch; set() may be called per block for sweeps */
  function Biquad(type, f, q, sr, gainDb) { this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q, gainDb); }
  Biquad.prototype.set = function (type, f, q, gainDb) {
    this.type = type;
    f = clamp(f, 10, this.sr * 0.45); q = q || 0.707;
    var w = TAU * f / this.sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, (gainDb || 0) / 40);
    var b0, b1, b2, a0, a1, a2;
    if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  };
  Biquad.prototype.run = function (x) {
    var y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  };
  /** filter a whole array in place; f may be a function of t (seconds), updated every 32 samples */
  function filt(a, type, f, q, sr, from, to) {
    from = from || 0; to = to === undefined ? a.length : to;
    var dyn = typeof f === 'function', bq = new Biquad(type, dyn ? f(0) : f, q, sr);
    for (var i = from; i < to; i++) {
      if (dyn && (i & 31) === 0) bq.set(type, f((i - from) / sr), q);
      a[i] = bq.run(a[i]);
    }
    return a;
  }

  /** band-limited-ish oscillator (polyBLEP saw and square) */
  function blep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }
  // sine table (4096 points, linear interpolation: error under 1e-6, far below 16-bit)
  var SIN_N = 4096, SIN = new Float32Array(SIN_N + 1);
  for (var si = 0; si <= SIN_N; si++) SIN[si] = Math.sin(TAU * si / SIN_N);
  function Osc(wave, sr, phase) { this.w = wave === 'saw' ? 1 : wave === 'square' ? 2 : wave === 'tri' ? 3 : 0; this.sr = sr; this.p = phase || 0; }
  Osc.prototype.next = function (f) {
    var dt = f / this.sr, p = this.p, v, w = this.w;
    if (w === 0) { var x = p * SIN_N, xi = x | 0; v = SIN[xi] + (SIN[xi + 1] - SIN[xi]) * (x - xi); }
    else if (w === 1) v = 2 * p - 1 - blep(p, dt);
    else if (w === 2) v = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
    else v = 4 * Math.abs(p - 0.5) - 1;
    p += dt; if (p >= 1) p -= Math.floor(p);
    this.p = p;
    return v;
  };

  /** ADSR level at t for a note gated for `hold` seconds (release starts at hold, from the level reached) */
  function adsr(t, a, d, s, r, hold) {
    function lvl(x) { return x < a ? x / a : x < a + d ? 1 - (1 - s) * (x - a) / d : s; }
    if (t < 0) return 0;
    if (t < hold) return lvl(t);
    var l0 = lvl(hold), k = (t - hold) / Math.max(r, 1e-4);
    return k >= 1 ? 0 : l0 * (1 - k) * (1 - k);
  }
  /** percussive: linear attack, exponential decay (tau seconds) */
  function perc(t, a, tau) { return t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / tau); }

  /**
   * tone(out, sr, t0, dur, o): adds one note to `out` (mono Float32Array, or [L, R] with o.pan in -1..1).
   * o: f (Hz or note name), f1 (slide target), slide (sec), wave, gain, a, d, s, r (ADSR gated for dur; or percussive
   *    with tau: attack a then exponential decay), vib {rate, depth (semitones), delay}, uni [cents...] (unison
   *    detune), lp {f, q, env (Hz added at the envelope peak, or decaying with lp.tau)}, partials [[ratio, gain,
   *    tauScale]] for bell-like sine stacks (overrides wave), damp (sec after dur at which a percussive note is
   *    choked over 60 ms, like a vibraphone damper). Envelopes are incremental (no exp per sample) and a
   *    percussive note stops rendering once it has decayed below -70 dB.
   */
  function tone(out, sr, t0, dur, o) {
    var stereo = Array.isArray(out), len = stereo ? out[0].length : out.length;
    var f0 = typeof o.f === 'string' ? hz(o.f) : o.f, f1 = o.f1 === undefined ? f0 : (typeof o.f1 === 'string' ? hz(o.f1) : o.f1);
    var a = o.a === undefined ? 0.005 : o.a, d = o.d === undefined ? 0.1 : o.d, s = o.s === undefined ? 0.8 : o.s, r = o.r === undefined ? 0.08 : o.r;
    var tau = o.tau, tail = tau ? tau * 8 : r, i0 = Math.max(0, Math.floor(t0 * sr)), n = Math.min(len - i0, Math.ceil((dur + tail) * sr));
    if (n <= 0) return;
    var g = o.gain === undefined ? 0.3 : o.gain, pan = o.pan || 0;
    var gl = stereo ? Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2 : 1, gr = stereo ? Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2 : 0;
    var L = stereo ? out[0] : out, R = stereo ? out[1] : null;
    var parts = o.partials, k, np, oscs = [], pe = [], pk = [], mul = [], pg = [];
    if (parts) {
      for (k = 0; k < parts.length; k++) {
        oscs.push(new Osc('sine', sr, (k * 0.13) % 1)); mul.push(parts[k][0]); pg.push(parts[k][1]);
        pe.push(0); pk.push(Math.exp(-1 / (sr * (tau || 0.5) * (parts[k][2] || 1))));
      }
    } else {
      var uni = o.uni || [0];
      for (k = 0; k < uni.length; k++) { oscs.push(new Osc(o.wave || 'sine', sr, (k * 0.37) % 1)); mul.push(Math.pow(2, uni[k] / 1200)); pg.push(1 / Math.sqrt(uni.length)); }
    }
    np = oscs.length;
    var aN = Math.max(1, a * sr), dN = Math.max(1, d * sr), holdN = dur * sr, rN = Math.max(1, r * sr), relFrom = -1;
    var slideN = Math.max(1, (o.slide || dur) * sr), ratio = f1 !== f0 ? Math.pow(f1 / f0, 1 / slideN) : 1, fr = f0;
    var vib = o.vib, vibF = 1, vd = vib ? (vib.delay || 0) * sr : 0;
    var lp = o.lp ? new Biquad('lp', o.lp.f, o.lp.q || 0.8, sr) : null, lpk = o.lp && o.lp.tau ? Math.exp(-32 / (sr * o.lp.tau)) : 0, lpe = 1;
    var e = 0, ek = tau ? Math.exp(-1 / (sr * tau)) : 0, dampN = o.damp !== undefined ? (dur + o.damp) * sr : 0;
    for (var i = 0; i < n; i++) {
      if (ratio !== 1 && i < slideN) fr *= ratio;
      if (vib && (i & 15) === 0) vibF = i > vd ? Math.pow(2, vib.depth / 12 * Math.sin(TAU * vib.rate * (i - vd) / sr) * Math.min(1, (i - vd) / (0.15 * sr))) : 1;
      var f = fr * vibF, v = 0;
      if (parts) {
        var peak = 0;
        for (k = 0; k < np; k++) {
          var lv = i < aN ? i / aN : pe[k] * pk[k];
          if (i >= aN && pe[k] === 0) lv = 1;
          pe[k] = lv; if (lv > peak) peak = lv;
          v += oscs[k].next(f * mul[k]) * pg[k] * lv;
        }
        if (i > aN && (i & 255) === 0 && peak < 3e-4) break;
        if (dampN && i > dampN) { var dq = 1 - (i - dampN) / (0.06 * sr); if (dq <= 0) break; v *= dq; }
      } else {
        if (tau) {
          e = i < aN ? i / aN : (i < aN + 1 ? 1 : e * ek);
          if (i > aN && (i & 255) === 0 && e < 3e-4) break;
          if (dampN && i > dampN) { var dq2 = 1 - (i - dampN) / (0.06 * sr); if (dq2 <= 0) break; e *= dq2; }
        }
        else if (i < holdN) e = i < aN ? i / aN : i < aN + dN ? 1 - (1 - s) * (i - aN) / dN : s;
        else { if (relFrom < 0) relFrom = e; var q = 1 - (i - holdN) / rN; e = q <= 0 ? 0 : relFrom * q * q; if (q <= 0) break; }
        for (k = 0; k < np; k++) v += oscs[k].next(f * mul[k]) * pg[k];
        v *= e;
      }
      if (lp) {
        if ((i & 31) === 0) { if (lpk) lpe *= lpk; lp.set('lp', o.lp.f + (o.lp.env || 0) * (lpk ? lpe : (parts ? 1 : e)), o.lp.q || 0.8); }
        v = lp.run(v);
      }
      v *= g;
      if (R) { L[i0 + i] += v * gl; R[i0 + i] += v * gr; } else L[i0 + i] += v;
    }
  }

  /** noise(out, sr, t0, dur, o): filtered noise burst. o: gain, a, tau (percussive) or ADSR gated for dur (d, s, r),
   *  type lp|hp|bp, f (Hz or fn(t)), q, type2/f2/q2 (a second fixed filter), brown, env fn(t) overriding the envelope
   *  (sampled every 16 samples), pan, rng */
  function noise(out, sr, t0, dur, o) {
    var stereo = Array.isArray(out), len = stereo ? out[0].length : out.length;
    var rnd = o.rng || rngFor('noise' + t0 + dur), i0 = Math.max(0, Math.floor(t0 * sr)), tau = o.tau, tail = tau ? tau * 8 : (o.r || 0.02);
    var n = Math.min(len - i0, Math.ceil((dur + (o.env ? 0 : tail)) * sr));
    if (n <= 0) return;
    var g = o.gain === undefined ? 0.3 : o.gain, aN = Math.max(1, (o.a === undefined ? 0.002 : o.a) * sr);
    var dyn = typeof o.f === 'function', bq = o.type ? new Biquad(o.type, dyn ? o.f(0) : o.f, o.q || 0.8, sr) : null;
    var bq2 = o.type2 ? new Biquad(o.type2, o.f2, o.q2 || 0.7, sr) : null, br = 0;
    var pan = o.pan || 0, gl = stereo ? Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2 : 1, gr = stereo ? Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2 : 0;
    var L = stereo ? out[0] : out, R = stereo ? out[1] : null;
    var dN = Math.max(1, (o.d || 0.05) * sr), sv = o.s === undefined ? 1 : o.s, holdN = dur * sr, rN = Math.max(1, (o.r || 0.02) * sr);
    var e = 0, ek = tau ? Math.exp(-1 / (sr * tau)) : 0, relFrom = -1, envFn = o.env;
    for (var i = 0; i < n; i++) {
      var x = rnd() * 2 - 1;
      if (o.brown) { br = (br + 0.02 * x) * 0.998; x = br * 3.5; }
      if (bq) { if (dyn && (i & 31) === 0) bq.set(o.type, o.f(i / sr), o.q || 0.8); x = bq.run(x); }
      if (bq2) x = bq2.run(x);
      if (envFn) { if ((i & 15) === 0) e = envFn(i / sr); }
      else if (tau) { e = i < aN ? i / aN : (i < aN + 1 ? 1 : e * ek); if (i > aN && (i & 255) === 0 && e < 3e-4) break; }
      else if (i < holdN) e = i < aN ? i / aN : i < aN + dN ? 1 - (1 - sv) * (i - aN) / dN : sv;
      else { if (relFrom < 0) relFrom = e; var q = 1 - (i - holdN) / rN; if (q <= 0) break; e = relFrom * q * q; }
      var v = x * e * g;
      if (R) { L[i0 + i] += v * gl; R[i0 + i] += v * gr; } else L[i0 + i] += v;
    }
  }

  function peakOf(chs) { var p = 0; chs.forEach(function (c) { for (var i = 0; i < c.length; i++) { var v = Math.abs(c[i]); if (v > p) p = v; } }); return p; }
  function normalize(chs, peak) {
    var p = peakOf(chs);
    if (!(p > 0) || !isFinite(p)) return chs;
    var g = peak / p;
    chs.forEach(function (c) { for (var i = 0; i < c.length; i++) c[i] *= g; });
    return chs;
  }
  /** tanh-like soft clip (rational approximation, exact enough and ten times cheaper), unity at the drive's peak */
  function sat(x) { if (x > 3) return 1; if (x < -3) return -1; var x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
  function softclip(c, drive) { var k = sat(drive); for (var i = 0; i < c.length; i++) c[i] = sat(c[i] * drive) / k; return c; }
  function fadeEdges(c, sr, fin, fout) {
    var a = Math.floor(fin * sr), b = Math.floor(fout * sr), n = c.length, i;
    for (i = 0; i < a && i < n; i++) c[i] *= i / a;
    for (i = 0; i < b && i < n; i++) c[n - 1 - i] *= i / b;
    return c;
  }
  /** fold everything past loopLen samples back onto the start (exact for note tails and reverb) */
  function fold(chs, loopLen) {
    return chs.map(function (c) {
      var o = new Float32Array(loopLen);
      for (var i = 0; i < c.length; i++) o[i % loopLen] += c[i];
      return o;
    });
  }
  /** seamless loop for noise beds: render loopLen + xf, equal-power crossfade the extra tail over the head */
  function xfadeLoop(chs, loopLen, xf) {
    return chs.map(function (c) {
      var o = new Float32Array(loopLen);
      for (var i = 0; i < loopLen; i++) o[i] = c[i];
      for (var j = 0; j < xf && loopLen + j < c.length; j++) {
        var k = j / xf;
        o[j] = c[j] * Math.sin(k * Math.PI / 2) + c[loopLen + j] * Math.cos(k * Math.PI / 2);
      }
      return o;
    });
  }
  /** small Schroeder/Freeverb-style stereo reverb; returns wet [L, R] to add (input mono or [L, R]) */
  function reverb(input, sr, o) {
    o = o || {};
    var size = o.size || 0.8, damp = o.damp || 0.35, n = (Array.isArray(input) ? input[0] : input).length + Math.floor((o.tail || 1.2) * sr);
    var src = Array.isArray(input) ? input : [input, input];
    var combs = [1116, 1188, 1277, 1356, 1422, 1491], aps = [556, 441, 341], sc = sr / 44100;
    var out = [new Float32Array(n), new Float32Array(n)];
    for (var ch = 0; ch < 2; ch++) {
      var spread = ch ? 23 : 0, inp = src[ch], o2 = out[ch];
      var cb = combs.map(function (L) { return { b: new Float32Array(Math.floor((L + spread) * sc)), i: 0, f: 0 }; });
      var ab = aps.map(function (L) { return { b: new Float32Array(Math.floor((L + spread) * sc)), i: 0 }; });
      var fb = 0.7 + 0.28 * size;
      for (var i = 0; i < n; i++) {
        var x = i < inp.length ? inp[i] * 0.015 : 0, y = 0;
        for (var k = 0; k < cb.length; k++) {
          var c = cb[k], v = c.b[c.i];
          c.f = v * (1 - damp) + c.f * damp;
          c.b[c.i] = x + c.f * fb;
          if (++c.i >= c.b.length) c.i = 0;
          y += v;
        }
        for (k = 0; k < ab.length; k++) {
          var a = ab[k], bv = a.b[a.i];
          a.b[a.i] = y + bv * 0.5;
          y = bv - y;
          if (++a.i >= a.b.length) a.i = 0;
        }
        o2[i] = y;
      }
    }
    return out;
  }
  function mixInto(dst, src, g, at) { at = at || 0; for (var i = 0; i < src.length && at + i < dst.length; i++) dst[at + i] += src[i] * g; return dst; }
  function stats(chs) {
    var nan = 0, peak = 0, sum = 0, n = 0;
    chs.forEach(function (c) { for (var i = 0; i < c.length; i++) { var v = c[i]; if (v !== v || !isFinite(v)) { nan++; continue; } var a = Math.abs(v); if (a > peak) peak = a; sum += v * v; n++; } });
    var rms = Math.sqrt(sum / Math.max(1, n));
    return { nan: nan, peak: peak, rms: rms, peakDb: 20 * Math.log10(peak || 1e-12), rmsDb: 20 * Math.log10(rms || 1e-12), samples: n };
  }

  /** a voice for crying and wailing: glottal saw + breath through three formants */
  function voice(out, sr, t0, dur, o) {
    var len = out.length, i0 = Math.floor(t0 * sr), n = Math.min(len - i0, Math.ceil(dur * sr));
    var rnd = o.rng, osc = new Osc('saw', sr), osc2 = new Osc('saw', sr, 0.3);
    var fm = o.formants || [[700, 1, 6], [1150, 0.6, 8], [2700, 0.25, 10]];
    var bqs = fm.map(function (f) { return new Biquad('bp', f[0], f[2], sr); }), breathBq = new Biquad('bp', 1800, 0.7, sr);
    var g = o.gain || 0.4, lpf = new Biquad('lp', 3800, 0.7, sr);
    for (var i = 0; i < n; i++) {
      var t = i / sr, f = o.pitch(t), e = o.env(t);
      var src = osc.next(f) * 0.7 + osc2.next(f * 1.004) * 0.3, br = breathBq.run(rnd() * 2 - 1) * (o.breath ? o.breath(t) : 0.25);
      var v = 0;
      for (var k = 0; k < bqs.length; k++) v += bqs[k].run(src + br * 0.6) * fm[k][1];
      out[i0 + i] += lpf.run(v + br * 0.15) * e * g;
    }
  }

  JG.synth = {
    TAU: TAU, hz: hz, midiOf: midiOf, db: db, clamp: clamp, rngFor: rngFor, mulberry: mulberry, hashStr: hashStr,
    Biquad: Biquad, Osc: Osc, adsr: adsr, perc: perc, filt: filt, tone: tone, noise: noise, voice: voice,
    normalize: normalize, softclip: softclip, fadeEdges: fadeEdges, fold: fold, xfadeLoop: xfadeLoop, reverb: reverb,
    mixInto: mixInto, stats: stats, peakOf: peakOf
  };

  // =================================================================================================================
  // Recipes. make(o, sr, rng) writes into o (mono Float32Array, or [L, R] when stereo). dur in seconds; peak is the
  // normalised peak (loudness balance). Loops and ambiences say how they loop: 'fold' (tails wrap) or xf seconds.
  // =================================================================================================================
  var SFX = {}, LOOPS = {}, AMB = {};

  // ---------- UI ----------
  SFX.ui_blip = { dur: 0.1, peak: 0.45, make: function (o, sr) {
    tone(o, sr, 0, 0.06, { f: 1320, f1: 1760, slide: 0.04, wave: 'tri', gain: 0.5, a: 0.003, d: 0.05, s: 0.3, r: 0.03 });
  } };
  SFX.ui_confirm = { dur: 0.32, peak: 0.5, make: function (o, sr) {
    tone(o, sr, 0, 0.07, { f: 'E6', wave: 'tri', gain: 0.4, a: 0.003, tau: 0.08 });
    tone(o, sr, 0.075, 0.12, { f: 'B6', wave: 'tri', gain: 0.45, a: 0.003, tau: 0.12 });
    tone(o, sr, 0.075, 0.12, { f: 'B5', wave: 'sine', gain: 0.25, a: 0.003, tau: 0.14 });
  } };
  SFX.ui_deny = { dur: 0.3, peak: 0.45, make: function (o, sr) {
    tone(o, sr, 0, 0.09, { f: 196, f1: 175, wave: 'square', gain: 0.3, a: 0.004, d: 0.05, s: 0.6, r: 0.03, lp: { f: 1400, q: 0.7 } });
    tone(o, sr, 0.12, 0.12, { f: 175, f1: 147, wave: 'square', gain: 0.3, a: 0.004, d: 0.05, s: 0.6, r: 0.05, lp: { f: 1200, q: 0.7 } });
  } };

  // ---------- movement and stunts ----------
  SFX.step_hard = { dur: 0.14, peak: 0.42, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.002, { rng: rng, type: 'bp', f: 1900, q: 1.2, gain: 0.9, a: 0.0015, tau: 0.018 });
    noise(o, sr, 0.004, 0.002, { rng: rng, type: 'lp', f: 600, q: 0.8, gain: 0.8, a: 0.002, tau: 0.03 });
    tone(o, sr, 0, 0.01, { f: 110, f1: 70, slide: 0.05, gain: 0.5, a: 0.002, tau: 0.035 });
  } };
  SFX.step_carpet = { dur: 0.16, peak: 0.3, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.004, { rng: rng, type: 'lp', f: 520, q: 0.7, gain: 1, a: 0.006, tau: 0.04 });
    noise(o, sr, 0.01, 0.004, { rng: rng, type: 'bp', f: 1300, q: 0.9, gain: 0.25, a: 0.01, tau: 0.03 });
  } };
  SFX.whoosh = { dur: 0.75, peak: 0.6, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.7, { rng: rng, type: 'bp', q: 1.6, gain: 1,
      f: function (t) { return t < 0.3 ? 260 * Math.pow(2200 / 260, t / 0.3) : 2200 * Math.pow(500 / 2200, Math.min(1, (t - 0.3) / 0.4)); },
      env: function (t) { var x = t / 0.7; return x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * Math.pow(x, 0.8)), 1.6); } });
  } };
  SFX.cape_flap = { dur: 0.5, peak: 0.5, make: function (o, sr, rng) {
    [0, 0.085, 0.165, 0.25, 0.33].forEach(function (t, k) {
      noise(o, sr, t, 0.02, { rng: rng, type: 'lp', f: 1100 - k * 120, q: 1.1, gain: 1 - k * 0.17, a: 0.004, tau: 0.035 });
      noise(o, sr, t + 0.004, 0.01, { rng: rng, type: 'bp', f: 320, q: 2, gain: 0.5 - k * 0.08, a: 0.003, tau: 0.03 });
    });
  } };
  SFX.thud = { dur: 0.75, peak: 0.85, make: function (o, sr, rng) {
    tone(o, sr, 0, 0.02, { f: 120, f1: 40, slide: 0.28, gain: 0.9, a: 0.002, tau: 0.16 });
    noise(o, sr, 0, 0.01, { rng: rng, type: 'lp', f: 380, q: 0.9, gain: 1.4, a: 0.002, tau: 0.07 });
    noise(o, sr, 0.002, 0.01, { rng: rng, type: 'bp', f: 1500, q: 1, gain: 0.3, a: 0.001, tau: 0.02 });
    noise(o, sr, 0.05, 0.3, { rng: rng, type: 'lp', f: 900, q: 0.7, gain: 0.08, a: 0.02, tau: 0.12 }); // debris
    softclip(o, 1.6);
  } };
  SFX.glass = { dur: 1.3, peak: 0.8, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.02, { rng: rng, type: 'hp', f: 2600, q: 0.7, gain: 1.2, a: 0.001, tau: 0.09 });
    noise(o, sr, 0, 0.02, { rng: rng, type: 'bp', f: 900, q: 0.8, gain: 0.5, a: 0.001, tau: 0.05 });
    for (var k = 0; k < 26; k++) {
      var t = Math.pow(rng(), 1.8) * 0.85, f = 2400 + rng() * 5200, g = 0.18 * (1 - t) + 0.04;
      tone(o, sr, t, 0.01, { partials: [[1, 1, 1], [1.52, 0.5, 0.7], [2.31, 0.3, 0.5]], f: f, gain: g, a: 0.001, tau: 0.04 + rng() * 0.12 });
      noise(o, sr, t, 0.005, { rng: rng, type: 'hp', f: 4000, q: 0.7, gain: g * 0.6, a: 0.0005, tau: 0.008 });
    }
  } };

  // ---------- phone, transit, elevator ----------
  SFX.phone_click = { dur: 0.12, peak: 0.45, make: function (o, sr, rng) {
    [0, 0.045].forEach(function (t, k) {
      noise(o, sr, t, 0.002, { rng: rng, type: 'bp', f: 2800, q: 2.5, gain: k ? 0.6 : 1, a: 0.0005, tau: 0.006 });
      tone(o, sr, t, 0.005, { f: 1250 + k * 300, gain: 0.25, a: 0.0005, tau: 0.012 });
    });
  } };
  // door chime: the plan's G5-C6-E6 motif, soft electronic bell
  SFX.subway_chime = { dur: 1.9, peak: 0.55, make: function (o, sr) {
    ['G5', 'C6', 'E6'].forEach(function (n, k) {
      tone(o, sr, k * 0.3, 0.01, { f: n, partials: [[1, 1, 1], [2, 0.25, 0.5], [3, 0.08, 0.3]], gain: 0.4, a: 0.004, tau: 0.32 + k * 0.08 });
    });
  } };
  SFX.subway_screech = { dur: 2.6, peak: 0.6, make: function (o, sr, rng) {
    var n = o.length, wander = new Float32Array(n), w = 0, wv = 0;
    for (var i = 0; i < n; i++) { if ((i & 255) === 0) wv = rng() * 2 - 1; w += (wv - w) * 0.0004; wander[i] = w; }
    var env = function (t) { return t < 0.35 ? t / 0.35 : t < 1.7 ? 1 - 0.25 * Math.sin(t * 9) * 0.3 : Math.max(0, 1 - (t - 1.7) / 0.85); };
    [[2150, 0.5], [3240, 0.35], [4410, 0.22], [5980, 0.1]].forEach(function (p, k) {
      var osc = new Osc('sine', sr, k * 0.2);
      for (var i2 = 0; i2 < n; i2++) {
        var t = i2 / sr, f = p[0] * (1 + 0.025 * wander[i2] + 0.004 * Math.sin(TAU * (13 + k * 3) * t));
        o[i2] += osc.next(f) * p[1] * env(t) * (0.8 + 0.2 * Math.sin(TAU * (6.5 + k) * t));
      }
    });
    noise(o, sr, 0, 2.5, { rng: rng, type: 'bp', f: 4000, q: 1.2, gain: 0.12, env: env });
    noise(o, sr, 0, 2.5, { rng: rng, type: 'lp', f: 180, q: 0.7, brown: true, gain: 0.5, env: function (t) { return Math.min(1, t / 0.2) * Math.max(0, 1 - t / 2.55); } });
  } };
  SFX.door_slide = { dur: 1.05, peak: 0.55, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.12, { rng: rng, type: 'hp', f: 1600, q: 0.7, type2: 'lp', f2: 6500, gain: 0.7, a: 0.01, tau: 0.16 }); // pneumatic hiss
    noise(o, sr, 0.05, 0.7, { rng: rng, type: 'lp', f: 320, q: 1, gain: 0.9, env: function (t) { return Math.sin(Math.PI * Math.min(1, t / 0.7)) * (0.8 + 0.2 * Math.sin(TAU * 23 * t)); } });
    tone(o, sr, 0.05, 0.7, { f: 62, gain: 0.12, a: 0.1, d: 0.1, s: 1, r: 0.15 });
    tone(o, sr, 0.78, 0.01, { f: 95, f1: 60, slide: 0.08, gain: 0.5, a: 0.002, tau: 0.05 });
    noise(o, sr, 0.78, 0.01, { rng: rng, type: 'lp', f: 700, gain: 0.5, a: 0.001, tau: 0.03 });
  } };
  SFX.ding = { dur: 1.8, peak: 0.6, make: function (o, sr) {
    tone(o, sr, 0, 0.01, { f: 'E6', partials: [[1, 1, 1], [2, 0.35, 0.55], [2.76, 0.14, 0.35], [5.4, 0.05, 0.2]], gain: 0.5, a: 0.002, tau: 0.45 });
  } };
  SFX.floor_blip = { dur: 0.14, peak: 0.32, make: function (o, sr) {
    tone(o, sr, 0, 0.07, { f: 'B5', partials: [[1, 1, 1], [2, 0.12, 0.6]], gain: 0.5, a: 0.005, tau: 0.035 });
  } };

  // ---------- office and desk ----------
  // the ops lead's loud wail (also the placeholder sound of the gag_ops_wail VO slot)
  SFX.wail = { dur: 2.3, peak: 0.7, make: function (o, sr, rng) {
    voice(o, sr, 0, 2.3, { rng: rng, gain: 0.6,
      formants: [[760, 1, 5], [1180, 0.55, 7], [2650, 0.22, 9]],
      pitch: function (t) {
        var base = t < 0.45 ? 230 + (400 - 230) * (t / 0.45) : 400 * Math.pow(0.62, (t - 0.45) / 1.6);
        return base * Math.pow(2, 0.6 / 12 * Math.sin(TAU * 6.2 * t) * Math.min(1, t / 0.3));
      },
      env: function (t) {
        var e = t < 0.06 ? t / 0.06 : t < 1.9 ? 1 : Math.max(0, 1 - (t - 1.9) / 0.35);
        // three sob catches in the falling half
        [0.95, 1.3, 1.62].forEach(function (c) { var d = Math.abs(t - c); if (d < 0.05) e *= 0.2 + 0.8 * d / 0.05; });
        return e;
      },
      breath: function (t) { return 0.25 + 0.2 * Math.max(0, t - 1.4); } });
  } };
  SFX.swish = { dur: 0.3, peak: 0.4, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.24, { rng: rng, type: 'bp', q: 2, gain: 1, f: function (t) { return 1500 * Math.pow(3, t / 0.24); },
      env: function (t) { var x = t / 0.24; return x >= 1 ? 0 : Math.sin(Math.PI * x); } });
  } };
  SFX.pat = { dur: 0.14, peak: 0.45, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.004, { rng: rng, type: 'lp', f: 260, q: 0.9, gain: 1.2, a: 0.003, tau: 0.04 });
    tone(o, sr, 0, 0.01, { f: 150, f1: 95, slide: 0.05, gain: 0.35, a: 0.002, tau: 0.035 });
    noise(o, sr, 0.002, 0.003, { rng: rng, type: 'bp', f: 1100, q: 1, gain: 0.15, a: 0.002, tau: 0.02 });
  } };
  SFX.chair = { dur: 0.75, peak: 0.5, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.02, { rng: rng, type: 'lp', f: 300, gain: 0.8, a: 0.003, tau: 0.06 }); // seat thump
    noise(o, sr, 0.03, 0.25, { rng: rng, type: 'bp', f: 3200, q: 1.5, gain: 0.25, a: 0.02, tau: 0.12 }); // gas lift
    var bq = new Biquad('bp', 780, 9, sr), bq2 = new Biquad('bp', 1530, 12, sr), t = 0.12, n = o.length;
    // creak: stick-slip pulses, rate rising then falling
    while (t < 0.62) {
      var i = Math.floor(t * sr);
      if (i < n) o[i] += 1.6 * (0.6 + 0.4 * Math.sin(Math.PI * (t - 0.12) / 0.5));
      t += 1 / (45 + 40 * Math.sin(Math.PI * (t - 0.12) / 0.5) + rng() * 8);
    }
    for (var j = Math.floor(0.11 * sr); j < n; j++) { var x = o[j]; o[j] = x * 0.05 + bq.run(x) * 0.5 + bq2.run(x) * 0.3; }
  } };
  SFX.key = { dur: 0.08, peak: 0.38, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.001, { rng: rng, type: 'hp', f: 2200, gain: 1, a: 0.0004, tau: 0.004 });
    noise(o, sr, 0.0005, 0.002, { rng: rng, type: 'bp', f: 4300, q: 6, gain: 1.4, a: 0.0005, tau: 0.012 });
    noise(o, sr, 0.032, 0.001, { rng: rng, type: 'bp', f: 3600, q: 5, gain: 0.6, a: 0.0004, tau: 0.008 });
  } };
  SFX.key_enter = { dur: 0.14, peak: 0.5, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.002, { rng: rng, type: 'bp', f: 2300, q: 4, gain: 1.4, a: 0.0005, tau: 0.016 });
    noise(o, sr, 0.001, 0.003, { rng: rng, type: 'lp', f: 650, gain: 1, a: 0.001, tau: 0.035 });
    noise(o, sr, 0.06, 0.002, { rng: rng, type: 'bp', f: 2000, q: 4, gain: 0.6, a: 0.0005, tau: 0.012 });
  } };
  SFX.hp_on = { dur: 0.42, peak: 0.45, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.12, { rng: rng, type: 'bp', f: 2100, q: 0.9, gain: 0.35, env: function (t) { return t < 0.12 ? Math.sin(Math.PI * t / 0.12) : 0; } });
    noise(o, sr, 0.12, 0.01, { rng: rng, type: 'lp', f: 280, gain: 1.1, a: 0.004, tau: 0.05 }); // cushion on the ear
    tone(o, sr, 0.2, 0.01, { f: 70, gain: 0.25, a: 0.002, tau: 0.03 }); // tiny driver pop
  } };
  SFX.hp_off = { dur: 0.4, peak: 0.4, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.01, { rng: rng, type: 'lp', f: 350, gain: 0.6, a: 0.003, tau: 0.04 });
    noise(o, sr, 0.02, 0.3, { rng: rng, type: 'bp', q: 1.3, gain: 0.6, f: function (t) { return 3200 * Math.pow(0.35, t / 0.3); },
      env: function (t) { var x = t / 0.3; return x >= 1 ? 0 : Math.sin(Math.PI * Math.pow(x, 0.6)); } });
  } };
  // the "2 HOURS LATER" card: a clock's tick-tock, four strokes
  SFX.time_tick = { dur: 1.3, peak: 0.5, make: function (o, sr, rng) {
    for (var k = 0; k < 4; k++) {
      noise(o, sr, k * 0.3, 0.001, { rng: rng, type: 'bp', f: k % 2 ? 1700 : 2500, q: 9, gain: 2.2, a: 0.0005, tau: 0.03 });
      tone(o, sr, k * 0.3, 0.005, { f: k % 2 ? 900 : 1200, gain: 0.12, a: 0.001, tau: 0.02 });
    }
  } };
  SFX.tick = { dur: 0.07, peak: 0.35, make: function (o, sr, rng) {
    tone(o, sr, 0, 0.01, { f: 2400, gain: 0.5, a: 0.001, tau: 0.012 });
    noise(o, sr, 0, 0.001, { rng: rng, type: 'hp', f: 3000, gain: 0.4, a: 0.0004, tau: 0.004 });
  } };
  SFX.allclear = { dur: 1.6, peak: 0.6, make: function (o, sr) {
    ['G5', 'B5', 'D6', 'G6'].forEach(function (n, k) {
      tone(o, sr, k * 0.07, 0.01, { f: n, partials: [[1, 1, 1], [2, 0.2, 0.6], [3, 0.07, 0.4]], gain: 0.3, a: 0.003, tau: 0.5 - k * 0.05 });
    });
    ['G4', 'D5', 'G5', 'B5'].forEach(function (n) {
      tone(o, sr, 0.28, 0.8, { f: n, wave: 'tri', gain: 0.1, a: 0.06, d: 0.2, s: 0.6, r: 0.4 });
    });
  } };

  // ---------- office-walk's stations (2026-11-25): the face scanner, the water cooler, the coffee machine ----------
  // the scanner's sweep: a soft sine hum gliding up 600 -> 900 Hz with a light 12 Hz tremolo
  SFX.scan_sweep = { dur: 1.6, peak: 0.5, make: function (o, sr) {
    var osc = new Osc('sine', sr), osc2 = new Osc('sine', sr, 0.25), n = o.length;
    for (var i = 0; i < n; i++) {
      var t = i / sr, f = 600 * Math.pow(1.5, Math.min(1, t / 1.5)), e = Math.min(1, t / 0.08) * Math.min(1, Math.max(0, (1.6 - t) / 0.15));
      o[i] += (osc.next(f) + 0.3 * osc2.next(f * 2.01)) * e * (0.75 + 0.25 * Math.sin(TAU * 12 * t)) * 0.4;
    }
  } };
  // the scanner's match: two short friendly beeps, 1760 then 2350 Hz, low-passed (not the ui_deny buzz)
  SFX.scan_beep = { dur: 0.35, peak: 0.5, make: function (o, sr) {
    tone(o, sr, 0, 0.09, { f: 1760, wave: 'square', gain: 0.3, a: 0.004, d: 0.03, s: 0.8, r: 0.02, lp: { f: 3200, q: 0.7 } });
    tone(o, sr, 0.14, 0.12, { f: 2350, wave: 'square', gain: 0.3, a: 0.004, d: 0.03, s: 0.8, r: 0.04, lp: { f: 3600, q: 0.7 } });
  } };
  // the cooler: four "blub"s (low sine chirps 180 -> 320 Hz, 70 ms each) with a little band-passed noise
  SFX.glug = { dur: 1.0, peak: 0.6, make: function (o, sr, rng) {
    [0.04, 0.27, 0.48, 0.72].forEach(function (t, k) {
      tone(o, sr, t, 0.07, { f: 180 + k * 12, f1: 320 + k * 15, slide: 0.07, gain: 0.6, a: 0.006, d: 0.03, s: 0.7, r: 0.04 });
      noise(o, sr, t + 0.01, 0.05, { rng: rng, type: 'bp', f: 700 + k * 90, q: 3, gain: 0.12, a: 0.005, tau: 0.03 });
    });
  } };
  // the coffee machine: a 0.8 s grinder (band-passed noise, 30 Hz amplitude modulation), then a gurgle and a hiss
  SFX.brew = { dur: 2.2, peak: 0.55, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.8, { rng: rng, type: 'bp', f: 1400, q: 0.9, gain: 0.8,
      env: function (t) { return (t < 0.05 ? t / 0.05 : t > 0.72 ? Math.max(0, (0.8 - t) / 0.08) : 1) * (0.6 + 0.4 * Math.sin(TAU * 30 * t)); } });
    for (var k = 0; k < 7; k++) {
      var t0 = 0.95 + k * 0.13 + rng() * 0.04;
      tone(o, sr, t0, 0.05, { f: 160 + rng() * 80, f1: 260 + rng() * 90, slide: 0.05, gain: 0.35, a: 0.005, d: 0.02, s: 0.6, r: 0.03 });
    }
    noise(o, sr, 1.0, 1.15, { rng: rng, type: 'hp', f: 3500, q: 0.7, gain: 0.25, env: function (t) { return Math.min(1, t / 0.2) * Math.max(0, 1 - t / 1.15); } });
  } };
  // a short slurp: band-passed noise sweeping up 800 -> 2500 Hz
  SFX.sip = { dur: 0.45, peak: 0.45, make: function (o, sr, rng) {
    noise(o, sr, 0, 0.4, { rng: rng, type: 'bp', q: 3, gain: 1, f: function (t) { return 800 * Math.pow(2500 / 800, Math.min(1, t / 0.35)); },
      env: function (t) { var x = t / 0.4; return x >= 1 ? 0 : Math.sin(Math.PI * x) * (0.7 + 0.3 * Math.sin(TAU * 18 * t)); } });
  } };

  // ---------- stings ----------
  function brass(o, sr, t0, dur, n, g, pan) {
    tone(o, sr, t0, dur, { f: n, wave: 'saw', uni: [-7, 0, 6], gain: g, a: 0.03, d: 0.15, s: 0.75, r: 0.12,
      lp: { f: 700, env: 2600, q: 1.1 }, vib: { rate: 5.4, depth: 0.12, delay: 0.25 }, pan: pan });
  }
  function timp(o, sr, t0, f, g, rng) {
    tone(o, sr, t0, 0.01, { f: f * 1.15, f1: f, slide: 0.08, gain: g, a: 0.003, tau: 0.35 });
    noise(o, sr, t0, 0.01, { rng: rng, type: 'lp', f: 500, gain: g * 0.6, a: 0.002, tau: 0.06 });
  }
  // the hero sting quotes the June motif C5-E5-G5-C6 (the theme's head) as a quick brass run
  SFX.sting_hero = { dur: 1.8, peak: 0.85, make: function (o, sr, rng) {
    [['C5', 0], ['E5', 0.1], ['G5', 0.2]].forEach(function (p) { brass(o, sr, p[1], 0.09, p[0], 0.4); });
    brass(o, sr, 0.3, 0.85, 'C6', 0.5);
    ['C4', 'G4', 'E5'].forEach(function (n) { brass(o, sr, 0.3, 0.85, n, 0.3); });
    tone(o, sr, 0.3, 0.9, { f: 'C2', wave: 'saw', gain: 0.3, a: 0.01, d: 0.3, s: 0.6, r: 0.2, lp: { f: 300, env: 400 } });
    timp(o, sr, 0.3, 65.4, 0.9, rng);
    noise(o, sr, 0.3, 0.01, { rng: rng, type: 'hp', f: 5000, gain: 0.12, a: 0.002, tau: 0.4 });
    var wet = reverb(o, sr, { size: 0.6, damp: 0.4, tail: 0 });
    mixInto(o, wet[0], 0.25);
  } };
  SFX.sting_end = { dur: 2.6, peak: 0.88, make: function (o, sr, rng) {
    ['B4', 'D5', 'G5'].forEach(function (n) { brass(o, sr, 0, 0.22, n, 0.32); });
    tone(o, sr, 0, 0.22, { f: 'G2', wave: 'saw', gain: 0.3, a: 0.01, d: 0.1, s: 0.7, r: 0.05, lp: { f: 300, env: 300 } });
    ['C4', 'G4', 'C5', 'E5', 'G5', 'C6'].forEach(function (n, k) { brass(o, sr, 0.3, 1.6, n, k === 5 ? 0.4 : 0.28); });
    tone(o, sr, 0.3, 1.6, { f: 'C2', wave: 'saw', gain: 0.35, a: 0.01, d: 0.3, s: 0.6, r: 0.5, lp: { f: 280, env: 400 } });
    for (var k = 0; k < 6; k++) timp(o, sr, k * 0.045, 98, 0.25, rng); // short roll on G
    timp(o, sr, 0.3, 65.4, 1, rng);
    noise(o, sr, 0.3, 0.01, { rng: rng, type: 'hp', f: 4500, gain: 0.18, a: 0.003, tau: 0.6 }); // crash
    var wet = reverb(o, sr, { size: 0.7, damp: 0.4, tail: 0 });
    mixInto(o, wet[0], 0.3);
  } };
  SFX.ting = { dur: 1.2, peak: 0.5, make: function (o, sr) {
    tone(o, sr, 0, 0.01, { f: 3520, partials: [[1, 1, 1], [2.01, 0.25, 0.5], [2.98, 0.1, 0.3]], gain: 0.4, a: 0.001, tau: 0.28, vib: { rate: 9, depth: 0.05 } });
    tone(o, sr, 0.045, 0.01, { f: 5274, partials: [[1, 1, 1]], gain: 0.2, a: 0.001, tau: 0.15 });
  } };

  // ---------- loops (handles: audio.loop) ----------
  // generic two-tone warble ring (not any phone maker's tone): ring-ring, pause
  LOOPS.ringtone = { dur: 3.0, peak: 0.5, loop: 'cut', make: function (o, sr) {
    // one phase-continuous oscillator gliding between the two tones (no clicks at the 25 Hz switch)
    [0, 1.1].forEach(function (t0) {
      var osc = new Osc('sine', sr), osc2 = new Osc('sine', sr), i0 = Math.floor(t0 * sr), n = Math.floor(0.85 * sr), f = 1180;
      for (var i = 0; i < n; i++) {
        var t = i / sr, target = Math.floor(t * 25) % 2 ? 1180 : 1420, e = Math.min(1, t / 0.01) * Math.min(1, (0.85 - t) / 0.03);
        f += (target - f) * 0.02;
        o[i0 + i] += (osc.next(f) + 0.25 * osc2.next(2 * f)) * e * 0.5;
      }
    });
  } };
  // three sobs and a shaky inhale (also the placeholder sound of the ops_sob VO slot)
  LOOPS.sob = { dur: 2.5, peak: 0.6, loop: 'cut', make: function (o, sr, rng) {
    [0.05, 0.36, 0.64].forEach(function (t0, k) {
      voice(o, sr, t0, 0.26, { rng: rng, gain: 0.55 - k * 0.06, formants: [[620, 1, 5], [1050, 0.5, 7], [2500, 0.18, 9]],
        pitch: function (t) { return (300 - k * 15) * Math.pow(0.7, t / 0.22); },
        env: function (t) { return t < 0.02 ? t / 0.02 : Math.max(0, 1 - (t - 0.02) / 0.22) * (1 - 0.5 * Math.max(0, Math.sin(TAU * 18 * t))); },
        breath: function () { return 0.45; } });
    });
    // inhale: rising breathy noise with a catch
    noise(o, sr, 1.05, 0.7, { rng: rng, type: 'bp', q: 1.4, gain: 0.35, f: function (t) { return 900 + 1400 * t; },
      env: function (t) { var x = t / 0.7, c = Math.abs(t - 0.35); return x >= 1 ? 0 : Math.sin(Math.PI * x) * (c < 0.05 ? 0.3 + 0.7 * c / 0.05 : 1); } });
    voice(o, sr, 1.95, 0.35, { rng: rng, gain: 0.3, formants: [[500, 1, 5], [900, 0.4, 7], [2400, 0.15, 9]],
      pitch: function (t) { return 240 * Math.pow(0.85, t / 0.3); },
      env: function (t) { return t < 0.04 ? t / 0.04 : Math.max(0, 1 - (t - 0.04) / 0.3); }, breath: function () { return 0.6; } });
  } };
  LOOPS.fallwind = { dur: 4, peak: 0.6, loop: 'xf', xf: 0.6, stereo: true, make: function (o, sr, rng) {
    // LFO rates are multiples of 1/4 Hz, so the filter motion repeats exactly over the 4 s loop
    noise(o, sr, 0, 4.6, { rng: rng, type: 'bp', q: 0.9, gain: 1.1, pan: -0.4, f: function (t) { return 700 + 450 * Math.sin(TAU * 0.5 * t) + 200 * Math.sin(TAU * 1.25 * t); }, env: function () { return 1; } });
    noise(o, sr, 0, 4.6, { rng: rng, type: 'bp', q: 0.9, gain: 1.1, pan: 0.4, f: function (t) { return 800 + 400 * Math.sin(TAU * 0.75 * t + 1) + 250 * Math.sin(TAU * 1.5 * t); }, env: function () { return 1; } });
    noise(o, sr, 0, 4.6, { rng: rng, type: 'lp', f: 160, brown: true, gain: 0.9, env: function () { return 1; } });
    noise(o, sr, 0, 4.6, { rng: rng, type: 'hp', f: 3500, gain: 0.12, env: function (t) { return 0.6 + 0.4 * Math.sin(TAU * 1 * t); } });
  } };

  // ---------- ambiences (stereo beds, 8 s, crossfaded loops) ----------
  function bed(o, sr, rng, type, f, q, gain, pan, mod) {
    noise(o, sr, 0, 9, { rng: rng, type: type, f: f, q: q, gain: gain, pan: pan, brown: type === 'brown', env: mod || function () { return 1; } });
  }
  AMB.roof = { dur: 8, peak: 0.5, loop: 'xf', xf: 1, stereo: true, make: function (o, sr, rng) {
    noise(o, sr, 0, 9, { rng: rng, type: 'lp', f: function (t) { return 450 + 250 * Math.sin(TAU * t / 8 * 2); }, q: 0.7, gain: 0.8, pan: -0.3, env: function (t) { return 0.7 + 0.3 * Math.sin(TAU * t / 8 + 1); } });
    noise(o, sr, 0, 9, { rng: rng, type: 'lp', f: function (t) { return 500 + 250 * Math.sin(TAU * t / 8 * 3 + 2); }, q: 0.7, gain: 0.8, pan: 0.3, env: function (t) { return 0.7 + 0.3 * Math.sin(TAU * t / 8 * 2); } });
    noise(o, sr, 0, 9, { rng: rng, type: 'lp', f: 110, q: 0.7, brown: true, gain: 1.2 }); // city far below
    // two distant birds
    [[1.7, -0.6], [5.2, 0.5]].forEach(function (b) {
      for (var k = 0; k < 2; k++) tone(o, sr, b[0] + k * 0.16, 0.08, { f: 3400, f1: 4200, slide: 0.07, gain: 0.05, a: 0.01, d: 0.04, s: 0.5, r: 0.03, pan: b[1] });
    });
  } };
  AMB.street = { dur: 8, peak: 0.5, loop: 'xf', xf: 1, stereo: true, make: function (o, sr, rng) {
    bed(o, sr, rng, 'lp', 260, 0.7, 1.0, -0.2);
    bed(o, sr, rng, 'lp', 300, 0.7, 1.0, 0.2);
    // two cars passing (filtered swell panning across)
    [[0.8, -1], [4.6, 1]].forEach(function (c) {
      noise(o, sr, c[0], 2.6, { rng: rng, type: 'bp', q: 1, gain: 0.9, pan: 0,
        f: function (t) { return 900 - 350 * (t / 2.6); },
        env: function (t) { var x = t / 2.6; return x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), 2); } });
    });
    // murmur of passers-by: band noise with syllable-rate wobble
    noise(o, sr, 0, 9, { rng: rng, type: 'bp', f: 600, q: 1.2, gain: 0.35, pan: 0.4, env: function (t) { return 0.5 + 0.5 * Math.abs(Math.sin(TAU * 1.75 * t) * Math.sin(TAU * 0.625 * t)); } });
  } };
  AMB.subway = { dur: 8, peak: 0.55, loop: 'xf', xf: 0.5, stereo: true, make: function (o, sr, rng) {
    bed(o, sr, rng, 'lp', 130, 0.8, 1.6, -0.1);
    bed(o, sr, rng, 'lp', 150, 0.8, 1.6, 0.1);
    noise(o, sr, 0, 9, { rng: rng, type: 'bp', f: 1000, q: 0.8, gain: 0.18, env: function (t) { return 0.8 + 0.2 * Math.sin(TAU * t / 2); } });
    tone(o, sr, 0, 9, { f: 410, gain: 0.025, a: 0.5, d: 0.1, s: 1, r: 0.5, vib: { rate: 0.25, depth: 0.15 } }); // motor whine
    // clack-clack of the rail joints every 2 s (period divides the loop)
    for (var t = 0.4; t < 8.4; t += 2) {
      [0, 0.13].forEach(function (dt, k) {
        noise(o, sr, t + dt, 0.003, { rng: rng, type: 'bp', f: 700, q: 1.5, gain: 0.8 - k * 0.2, a: 0.001, tau: 0.04, pan: k ? 0.3 : -0.3 });
        tone(o, sr, t + dt, 0.01, { f: 90, gain: 0.3, a: 0.002, tau: 0.05 });
      });
    }
  } };
  AMB.elevator = { dur: 8, peak: 0.4, loop: 'xf', xf: 1, stereo: true, make: function (o, sr, rng) {
    tone(o, sr, 0, 9, { f: 100, gain: 0.08, a: 0.4, d: 0.1, s: 1, r: 0.4 });
    tone(o, sr, 0, 9, { f: 200, gain: 0.025, a: 0.4, d: 0.1, s: 1, r: 0.4 });
    bed(o, sr, rng, 'lp', 1400, 0.7, 0.18, -0.4);
    bed(o, sr, rng, 'lp', 1400, 0.7, 0.18, 0.4);
    noise(o, sr, 0, 9, { rng: rng, type: 'bp', f: 520, q: 3, gain: 0.25, env: function (t) { return 0.6 + 0.4 * Math.sin(TAU * t / 4); } }); // cable whir
  } };
  AMB.office = { dur: 8, peak: 0.4, loop: 'xf', xf: 1, stereo: true, make: function (o, sr, rng) {
    bed(o, sr, rng, 'lp', 650, 0.7, 0.55, -0.3);
    bed(o, sr, rng, 'lp', 700, 0.7, 0.55, 0.3);
    noise(o, sr, 0, 9, { rng: rng, type: 'bp', f: 550, q: 1.3, gain: 0.12, pan: -0.5, env: function (t) { return 0.4 + 0.6 * Math.abs(Math.sin(TAU * 1.5 * t) * Math.sin(TAU * 0.375 * t)); } });
    // someone typing across the room, in two bursts
    [[1.2, 0.6], [5.0, -0.5]].forEach(function (b) {
      for (var k = 0; k < 9; k++) {
        var t = b[0] + k * (0.11 + rng() * 0.08);
        noise(o, sr, t, 0.001, { rng: rng, type: 'bp', f: 3500 + rng() * 800, q: 4, gain: 0.12, a: 0.0005, tau: 0.01, pan: b[1] });
      }
    });
  } };

  // =================================================================================================================
  // render
  // =================================================================================================================
  var TABLES = { sfx: SFX, loop: LOOPS, ambience: AMB };
  function render(kind, id, sr) {
    var r = TABLES[kind] && TABLES[kind][id];
    if (!r) return null;
    sr = sr || 44100;
    var rng = rngFor(kind + ':' + id), loopLen = Math.round(r.dur * sr);
    var extra = r.loop === 'xf' ? Math.round((r.xf || 0.5) * sr) + Math.round(0.3 * sr) : 0;
    var n = loopLen + extra, chs = r.stereo ? [new Float32Array(n), new Float32Array(n)] : [new Float32Array(n)];
    r.make(r.stereo ? chs : chs[0], sr, rng);
    if (r.loop === 'xf') chs = xfadeLoop(chs, loopLen, Math.round((r.xf || 0.5) * sr));
    else if (!r.loop) chs.forEach(function (c) { fadeEdges(c, sr, 0, 0.01); });
    normalize(chs, r.peak || 0.6);
    return { ch: chs, sr: sr, dur: chs[0].length / sr, loop: !!r.loop };
  }
  JG.sfxLib = {
    ids: { sfx: Object.keys(SFX), loops: Object.keys(LOOPS), ambience: Object.keys(AMB) },
    has: function (kind, id) { return !!(TABLES[kind] && TABLES[kind][id]); },
    meta: function (kind, id) { var r = TABLES[kind] && TABLES[kind][id]; return r ? { dur: r.dur, peak: r.peak, loop: r.loop || false, stereo: !!r.stereo } : null; },
    render: render
  };
})();
