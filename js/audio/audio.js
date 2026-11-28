/* JG.audio: the full Audio API (plan section 6 "Audio", section 8 "At load" and "Music slots"). OWNER: E6.
 * Classic IIFE; touches neither THREE, the DOM nor Web Audio at load (the AudioContext is created inside unlock(),
 * which core calls synchronously inside the start gesture). Never throws and never gates progress: every public
 * member is wrapped, durations fall back to max(est, 1.2 s), and with no AudioContext at all every call still keeps
 * its logical state (debug(), the golden state hash and the director's timing do not depend on sound).
 *
 *   init()  preload(onProgress)  unlock()  reset()  update(dt)  setMuted(b)  setRate(n)  suspend()  resume()  debug()
 *   vo: { duration(id), play(id) -> {duration, stop()}, loop(id, {gap}) -> {duration: Infinity, stop()},
 *         levelAt(id, t) -> 0..1, isPlaceholder(id), stopAll() }
 *   sfx(id, {volume, rate, pan}) -> {duration, stop()}
 *   loop(id, {volume, rate, fade}) -> {duration: Infinity, stop(fade), set('volume'|'rate'|'intensity', v)}
 *   ambience(id | null, fade)        music: { play(id, {fade, volume, restart}) -> {duration: Infinity, stop(fade)},
 *                                             stop(fade), fx('muffled'|'leak'|null, fade), source(id = 'montage') }
 *
 * Sources: sfx.js (JG.sfxLib: every frozen SFX id, the three loops, five ambiences) and music.js (JG.musicLib: theme,
 * elevator "Going Up", the montage stand-in "Roo's On It") render pure Float32 sample data; this file turns it into
 * AudioBuffers. SFX and loops render at preload (about 0.25 s on a desktop), ambiences and music render one per tick
 * from a background queue once the game loop runs (title screen), or on demand the first time they are needed.
 *
 * VO at load (section 8): fetch through JG.assets (so an --embed build works), check the ID3 title for
 * JUNE_PLACEHOLDER, decode with an OfflineAudioContext (no gesture needed), mix to mono, Lauren's phone filter baked in,
 * trim below -45 dBFS, normalise the speech RMS toward -20 dBFS (clamped to +-12 dB; placeholders a further -6 dB),
 * store a 30 Hz RMS envelope for levelAt. Tagged non-verbal slots (placeholderSfx 'sob' / 'wail') use their
 * procedural sound instead of the file's silence. A missing or broken file: one console.warn, and the line runs its
 * subtitle for max(est, 1.2 s) in silence with seeded 5.5 Hz pseudo-syllables for the lip-flap.
 *
 * Bus graph: vo, sfx (and loops), music (in -> hp -> lp -> fx gain -> duck -> bus), ambience (-> duck -> bus), all into
 * master (mute) -> compressor (safety limiter) -> destination. Music ducks about 9 dB and ambience 4 dB under VO.
 * Rate (setRate, the game time scale) applies to VO and SFX playback so a line ends with its subtitle; music,
 * ambience and loops keep their pitch.
 *
 * reset() (every beat entry) stops VO and loops at once but only marks music, music fx and ambience as unwanted; the
 * beat's stage then asks for what it wants in the same tick, and update() reconciles, so music and a bed that carry
 * over between beats keep playing instead of restarting. debug() reports the logical (wanted) state. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};

  var VO_DIR = 'assets/audio/vo/', MONTAGE_URL = 'assets/audio/music/montage.mp3', INTRO_URL = 'assets/audio/music/intro.mp3', ELEVATOR_URL = 'assets/audio/music/elevator.mp3',
      AMB_FILES = { roof: 'assets/audio/ambience/roof.mp3', street: 'assets/audio/ambience/street.mp3', subway: 'assets/audio/ambience/subway.mp3', office: 'assets/audio/ambience/office.mp3' };   // recorded beds (seamless loops); the code-made bed plays if one is missing
  var BUS = { master: 0.9, vo: 1.0, sfx: 0.8, music: 0.5, amb: 0.4 };
  var DUCK = { music: 0.35, amb: 0.65 };
  var FX = {
    none: { hp: 10, lp: 20000, g: 1 },
    muffled: { hp: 60, lp: 380, g: 0.9 },   // the song through Roo's headphones, heard from outside
    leak: { hp: 1500, lp: 7000, g: 0.18 }   // the tinny leak once the headphones are off
  };
  var GATE_DB = -45, TARGET_DB = -20, MAX_ADJ = 12, PLACEHOLDER_DB = -6, ENV_HZ = 30, SR = 44100;

  function noop() {}
  function now() { try { return performance.now(); } catch (e) { return 0; } }
  function dbg(e) { return String(e && e.message || e); }
  function est(id) { var L = JG.LINES && JG.LINES[id]; return Math.max((L && L.est) || 0, 1.2); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function AC() { return window.AudioContext || window.webkitAudioContext || null; }
  function OAC() { return window.OfflineAudioContext || window.webkitOfflineAudioContext || null; }
  function warn(key, msg) { if (JG.warn) JG.warn(key, msg); else console.warn(msg); }

  // =================================================================================================================
  // state
  // =================================================================================================================
  var st = {
    inited: false, ctx: null, noCtx: false, everRan: false, unlocked: false, muted: false, rate: 1, T: 0, userSuspended: false,
    n: null,                     // nodes
    data: {},                    // 'sfx:id' | 'loop:id' | 'ambience:id' | 'music:id' | 'vo:id' -> {ch: [Float32Array], sr, dur}
    abuf: {},                    // same keys -> AudioBuffer for st.ctx
    queue: [], qTick: 0,
    lines: {},                   // id -> {status, dur, env, gainDb, trim, sfx, placeholder}
    preloading: null, ready: false, loadMs: 0,
    vo: [],                      // active VO: {id, end (game s), src, loop}
    oneShots: [],                // {src, end}
    loops: [],                   // {id, vol, rate, src, g}
    played: [], sfxCount: {}, rnd: null,
    music: { want: null, opts: {}, cur: null, fade: 0.6, fxWant: null, fxCur: 'none', fxFade: 0 },
    amb: { want: null, cur: null, fade: 1 },
    montage: { state: 'idle', reason: null, abuf: null, dur: 0 },
    intro: { state: 'idle', decoded: null },   // file-only music slot (the owner's intro track); silent when missing
    ambFile: {},                // id -> {state: 'loading'|'file'|'missing', decoded}: recorded ambience beds
    elevator: { state: 'idle', decoded: null }, // the owner's elevator track (plays once, 9.3 s); the code-made "Going Up" plays if it is missing
    errors: 0
  };

  function guard(name, fn, fallback) {
    return function () {
      try { return fn.apply(null, arguments); }
      catch (e) { st.errors++; warn('audio-err:' + name, 'JG.audio.' + name + ' failed (' + dbg(e) + '); continuing silently'); return typeof fallback === 'function' ? fallback.apply(null, arguments) : fallback; }
    };
  }

  // =================================================================================================================
  // rendering (JG.sfxLib / JG.musicLib -> Float32 -> AudioBuffer)
  // =================================================================================================================
  function renderData(kind, id) {
    var key = kind + ':' + id;
    if (st.data[key]) return st.data[key];
    var r = null, t0 = now();
    if (kind === 'music') r = JG.musicLib && JG.musicLib.render(id, SR);
    else r = JG.sfxLib && JG.sfxLib.render(kind, id, SR);
    if (!r) return null;
    r.ms = Math.round(now() - t0);
    st.data[key] = r;
    var qi = st.queue.indexOf(key); if (qi >= 0) st.queue.splice(qi, 1);
    return r;
  }
  function toBuffer(d) {
    var ctx = st.ctx, len = Math.max(1, d.ch[0].length), b = ctx.createBuffer(d.ch.length, len, d.sr);
    for (var c = 0; c < d.ch.length; c++) {
      if (b.copyToChannel) b.copyToChannel(d.ch[c], c); else b.getChannelData(c).set(d.ch[c]);
    }
    return b;
  }
  function buffer(kind, id) {
    if (!st.ctx) return null;
    var key = kind + ':' + id;
    if (st.abuf[key]) return st.abuf[key];
    var d = kind === 'vo' ? st.data[key] : renderData(kind, id);
    if (!d) return null;
    return (st.abuf[key] = toBuffer(d));
  }
  function dur(kind, id) {
    var d = st.data[kind + ':' + id];
    if (d) return d.dur;
    var m = JG.sfxLib && JG.sfxLib.meta(kind, id);
    return m ? m.dur : 0.3;
  }

  // =================================================================================================================
  // graph
  // =================================================================================================================
  function createCtx() {
    var C = AC();
    if (!C) { st.noCtx = true; warn('audio-noctx', 'JG.audio: no AudioContext in this browser; the game runs silent'); return; }
    try { st.ctx = new C({ latencyHint: 'interactive' }); }
    catch (e) { try { st.ctx = new C(); } catch (e2) { st.noCtx = true; warn('audio-noctx', 'JG.audio: AudioContext failed (' + dbg(e2) + '); the game runs silent'); return; } }
    var ctx = st.ctx, n = st.n = {};
    function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
    n.comp = ctx.createDynamicsCompressor();
    try { n.comp.threshold.value = -10; n.comp.knee.value = 6; n.comp.ratio.value = 8; n.comp.attack.value = 0.003; n.comp.release.value = 0.15; } catch (e) { /* old engines */ }
    n.master = gain(st.muted ? 0 : BUS.master);
    n.master.connect(n.comp); n.comp.connect(ctx.destination);
    n.vo = gain(BUS.vo); n.vo.connect(n.master);
    n.sfx = gain(BUS.sfx); n.sfx.connect(n.master);
    n.music = gain(BUS.music); n.music.connect(n.master);
    n.musicDuck = gain(1); n.musicDuck.connect(n.music);
    n.musicFx = gain(1); n.musicFx.connect(n.musicDuck);
    n.musicLp = ctx.createBiquadFilter(); n.musicLp.type = 'lowpass'; n.musicLp.frequency.value = FX.none.lp; n.musicLp.Q.value = 0.8; n.musicLp.connect(n.musicFx);
    n.musicHp = ctx.createBiquadFilter(); n.musicHp.type = 'highpass'; n.musicHp.frequency.value = FX.none.hp; n.musicHp.Q.value = 0.7; n.musicHp.connect(n.musicLp);
    n.musicIn = n.musicHp;
    n.amb = gain(BUS.amb); n.amb.connect(n.master);
    n.ambDuck = gain(1); n.ambDuck.connect(n.amb);
    n.duck = 1;
    ctx.onstatechange = function () {
      if (ctx.state !== 'running') return;
      st.everRan = true;
      // one-shots queued while suspended whose moment has passed must not all fire at once now
      st.oneShots = st.oneShots.filter(function (o) { if (o.end <= st.T) { try { o.src.stop(); } catch (e) { /* done */ } return false; } return true; });
    };
    if (ctx.state === 'running') st.everRan = true;
    var Z = JG.vendor && JG.vendor.ZZFX;
    if (Z) {
      try {
        var old = Z.audioContext;
        Z.audioContext = ctx;
        if (old && old !== ctx && old.close) { var p = old.close(); if (p && p.catch) p.catch(noop); }
      } catch (e) { /* ZzFX is optional */ }
    }
  }
  /** one-shots play only on a running context (or a fresh one that has never run yet: it is about to resume) */
  function canShoot() { var c = st.ctx; return !!c && (c.state === 'running' || (c.state === 'suspended' && !st.everRan && !st.userSuspended)); }
  function ramp(param, v, sec) {
    var t = st.ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      if (!(sec > 0)) param.setValueAtTime(v, t);
      else { param.setValueAtTime(param.value, t); param.setTargetAtTime(v, t, Math.max(0.005, sec / 3)); }
    } catch (e) { param.value = v; }
  }
  function startSrc(ab, dest, o) {
    var ctx = st.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), node = g;
    src.buffer = ab; src.loop = !!o.loop;
    if (o.rate) src.playbackRate.value = o.rate;
    var vol = o.vol === undefined ? 1 : o.vol;
    if (o.fade > 0) { g.gain.value = 0; ramp(g.gain, vol, o.fade); } else g.gain.value = vol;
    src.connect(g);
    if (o.pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); node = p; }
    node.connect(dest);
    src.start(0);
    return { src: src, g: g };
  }
  function stopSrc(h, fade) {
    if (!h || !h.src) return;
    var src = h.src;
    h.src = null;
    try {
      if (fade > 0 && st.ctx) { ramp(h.g.gain, 0, fade); src.stop(st.ctx.currentTime + fade + 0.05); }
      else src.stop();
    } catch (e) { /* already stopped */ }
  }

  // =================================================================================================================
  // VO at load
  // =================================================================================================================
  function isTagged(buf) {
    try {
      var b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)), s = '';
      for (var i = 0; i < b.length; i++) s += b[i] >= 32 && b[i] < 127 ? String.fromCharCode(b[i]) : ' ';
      return s.indexOf('JUNE_PLACEHOLDER') >= 0;
    } catch (e) { return false; }
  }
  var decoder = null;
  function decode(buf) {
    if (!decoder) {
      var O = OAC();
      if (!O) return Promise.reject(new Error('no OfflineAudioContext'));
      decoder = new O(1, 1, SR);
    }
    return new Promise(function (res, rej) {
      var p = decoder.decodeAudioData(buf, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }
  function phoneFx(x, sr) {
    var S = JG.synth;
    S.filt(x, 'hp', 320, 0.9, sr); S.filt(x, 'lp', 3300, 0.9, sr);
    var k = Math.tanh(2.2);
    for (var i = 0; i < x.length; i++) x[i] = Math.tanh(2.2 * x[i]) / k * 0.8;
    return x;
  }
  /** trim, normalise and envelope one mono line; null if it is all below the gate */
  function processVo(mono, sr, placeholder) {
    var thr = Math.pow(10, GATE_DB / 20), win = Math.max(1, Math.round(sr * 0.005)), n = mono.length, first = -1, last = -1, i, j;
    for (i = 0; i < n; i += win) {
      var pk = 0;
      for (j = i; j < i + win && j < n; j++) { var a = Math.abs(mono[j]); if (a > pk) pk = a; }
      if (pk > thr) { if (first < 0) first = i; last = Math.min(n, i + win); }
    }
    if (first < 0) return null;
    var start = Math.max(0, first - win * 2), end = Math.min(n, last + win * 6), seg = mono.slice(start, end);
    var hop = Math.max(1, Math.round(sr / ENV_HZ)), frames = Math.ceil(seg.length / hop), env = new Float32Array(frames), sum = 0, cnt = 0, peak = 0;
    for (var f = 0; f < frames; f++) {
      var s2 = 0, m = 0;
      for (j = f * hop; j < (f + 1) * hop && j < seg.length; j++) { s2 += seg[j] * seg[j]; m++; var av = Math.abs(seg[j]); if (av > peak) peak = av; }
      env[f] = Math.sqrt(s2 / Math.max(1, m));
      if (env[f] > thr) { sum += s2; cnt += m; }
    }
    var rms = Math.sqrt(sum / Math.max(1, cnt)) || thr, rmsDb = 20 * Math.log10(rms);
    var gainDb = clamp(TARGET_DB - rmsDb, -MAX_ADJ, MAX_ADJ) + (placeholder ? PLACEHOLDER_DB : 0), g = Math.pow(10, gainDb / 20);
    if (peak * g > 0.98) { g = 0.98 / peak; gainDb = 20 * Math.log10(g); }
    var emax = 0;
    for (i = 0; i < seg.length; i++) seg[i] *= g;
    for (f = 0; f < frames; f++) if (env[f] > emax) emax = env[f];
    for (f = 0; f < frames; f++) env[f] = emax > 0 ? env[f] / emax : 0;
    return { ch: [seg], sr: sr, dur: seg.length / sr, env: env, gainDb: Math.round(gainDb * 10) / 10, trim: [+(start / sr).toFixed(3), +(end / sr).toFixed(3)], rmsDb: Math.round(rmsDb * 10) / 10 };
  }
  function fail(id, status, why) {
    var L = JG.LINES[id];
    st.lines[id] = { status: status, dur: est(id), why: why };
    warn('vo-' + status + ':' + id, 'JG.audio: VO "' + id + '" (' + (L && L.file) + ') ' + status + ': ' + why + '; its subtitle runs ' + est(id).toFixed(1) + ' s in silence');
  }
  function loadLine(id) {
    var L = JG.LINES[id], url = VO_DIR + L.file, tagged = false;
    st.lines[id] = { status: 'pending', dur: est(id) };
    if (!OAC()) { st.lines[id] = { status: 'nodecoder', dur: est(id) }; return Promise.resolve(); }
    var name = 'vo:' + id, m = {}; m[name] = url;
    return JG.assets.load(m).then(function () {
      var buf = JG.assets.get(name).buffer;
      tagged = isTagged(buf);
      if (tagged && L.placeholderSfx) return null; // non-verbal placeholder: the procedural sound replaces the file
      return decode(buf.slice(0)).catch(function (e) { throw { broken: true, e: e }; });
    }).then(function (ab) {
      var mono, sr, sfxKind = null;
      if (!ab) {
        sfxKind = JG.sfxLib.has('sfx', L.placeholderSfx) ? 'sfx' : 'loop';
        var d = renderData(sfxKind, L.placeholderSfx);
        if (!d) throw { broken: true, e: new Error('no procedural sound "' + L.placeholderSfx + '"') };
        mono = d.ch[0].slice(0); sr = d.sr;
      } else {
        sr = ab.sampleRate; mono = new Float32Array(ab.length);
        for (var c = 0; c < ab.numberOfChannels; c++) { var ch = ab.getChannelData(c); for (var i = 0; i < mono.length; i++) mono[i] += ch[i] / ab.numberOfChannels; }
        if (L.fx === 'phone') phoneFx(mono, sr);
      }
      var p = processVo(mono, sr, tagged);
      if (!p) { fail(id, 'broken', 'silent below ' + GATE_DB + ' dBFS'); return; }
      st.data['vo:' + id] = p;
      delete st.abuf['vo:' + id];
      st.lines[id] = { status: tagged ? 'placeholder' : 'ok', placeholder: tagged, dur: p.dur, gainDb: p.gainDb, rmsDb: p.rmsDb, trim: p.trim, sfx: sfxKind ? L.placeholderSfx : undefined };
    }).catch(function (e) {
      if (e && e.broken) fail(id, 'broken', 'could not decode (' + dbg(e.e) + ')');
      else fail(id, 'missing', dbg(e));
    });
  }

  // montage slot: the user's licensed file if it is real, else the stand-in
  function loadMontage() {
    var M = st.montage;
    if (M.state !== 'idle') return;
    M.state = 'loading';
    var m = { 'music:montage': MONTAGE_URL };
    Promise.resolve().then(function () { return JG.assets.load(m); }).then(function () {
      var buf = JG.assets.get('music:montage').buffer;
      if (isTagged(buf)) { M.state = 'standin'; M.reason = 'placeholder file'; return; }
      return decode(buf.slice(0)).then(function (ab) {
        if (ab.duration < 8) { M.state = 'standin'; M.reason = 'file under 8 s'; return; }
        M.decoded = ab; M.dur = ab.duration; M.state = 'file'; M.reason = null;
      });
    }).catch(function (e) {
      M.state = 'standin'; M.reason = 'missing or undecodable';
      warn('montage-file', 'JG.audio: ' + MONTAGE_URL + ' could not be used (' + dbg(e) + '); the stand-in plays');
    });
  }
  // intro slot: the owner's track under the gaming opening of rooftop-call. No stand-in: without the file, silence.
  function loadIntro() {
    var I = st.intro;
    if (I.state !== 'idle') return;
    I.state = 'loading';
    Promise.resolve().then(function () { return JG.assets.load({ 'music:intro': INTRO_URL }); }).then(function () {
      return decode(JG.assets.get('music:intro').buffer.slice(0));
    }).then(function (ab) { I.decoded = ab; I.state = 'file'; if (st.music.want === 'intro') syncMusic(); })
      .catch(function (e) { I.state = 'missing'; warn('intro-file', 'JG.audio: ' + INTRO_URL + ' could not be used (' + dbg(e) + '); the intro plays without music'); });
  }
  // elevator slot: the owner's track if it decodes, else the stand-in "Going Up" (syncMusic waits while this loads)
  function loadElevator() {
    var E = st.elevator;
    if (E.state !== 'idle') return;
    E.state = 'loading';
    Promise.resolve().then(function () { return JG.assets.load({ 'music:elevator': ELEVATOR_URL }); }).then(function () {
      return decode(JG.assets.get('music:elevator').buffer.slice(0));
    }).then(function (ab) { E.decoded = ab; E.state = 'file'; })
      .catch(function (e) { E.state = 'missing'; warn('elevator-file', 'JG.audio: ' + ELEVATOR_URL + ' could not be used (' + dbg(e) + '); the stand-in plays'); })
      .then(function () { if (st.music.want === 'elevator') syncMusic(); });
  }
  // recorded ambience bed (roof): the owner's file if it decodes, else the code-made bed (syncAmb waits while it loads)
  function loadAmbFile(id) {
    var url = AMB_FILES[id];
    if (!url || st.ambFile[id]) return;
    var A = st.ambFile[id] = { state: 'loading', decoded: null };
    Promise.resolve().then(function () { return JG.assets.load({ ['ambience:' + id]: url }); }).then(function () {
      return decode(JG.assets.get('ambience:' + id).buffer.slice(0));
    }).then(function (ab) { A.decoded = ab; A.state = 'file'; })
      .catch(function (e) { A.state = 'missing'; warn('amb-file:' + id, 'JG.audio: ' + url + ' could not be used (' + dbg(e) + '); the code-made bed plays'); })
      .then(function () { if (st.amb.want === id) syncAmb(); });
  }
  function montageBuffer() {
    var M = st.montage;
    if (M.state !== 'file' || !M.decoded || !st.ctx) return null;
    if (M.abuf) return M.abuf;
    // an OfflineAudioContext-decoded buffer plays in any context; copy only if the engine refuses it
    M.abuf = M.decoded;
    return M.abuf;
  }

  // =================================================================================================================
  // reconcile music, music fx and ambience (wanted vs playing)
  // =================================================================================================================
  function syncMusic() {
    var M = st.music, cur = M.cur;
    if (!st.ctx) return;
    if (cur && cur.id === M.want && !M.restart) return;
    M.restart = false;
    if (cur) { stopSrc(cur, M.fade); M.cur = null; }
    if (!M.want) return;
    if (M.want === 'elevator') { loadElevator(); if (st.elevator.state === 'loading') return; }
    var file = M.want === 'montage' ? montageBuffer() : (M.want === 'intro' ? st.intro.decoded : (M.want === 'elevator' ? st.elevator.decoded : null)), ab = file || (M.want === 'intro' ? null : buffer('music', M.want));
    if (!ab) return;
    var vol = M.opts.volume === undefined ? 1 : M.opts.volume;
    // the owner's elevator track is a single 9.3 s run that ends before the dings; every other music loops
    var h = startSrc(ab, st.n.musicIn, { loop: !(file && M.want === 'elevator'), vol: vol, fade: M.opts.fadeIn === undefined ? 0.05 : M.opts.fadeIn });
    h.id = M.want; h.file = !!file;
    M.cur = h;
  }
  function syncFx() {
    var M = st.music, want = M.fxWant || 'none';
    if (!st.ctx || M.fxCur === want) return;
    var p = FX[want] || FX.none, n = st.n, s = M.fxFade || 0;
    ramp(n.musicHp.frequency, p.hp, s); ramp(n.musicLp.frequency, p.lp, s); ramp(n.musicFx.gain, p.g, s);
    M.fxCur = want;
  }
  function syncAmb() {
    var A = st.amb, cur = A.cur;
    if (!st.ctx) return;
    if (cur && cur.id === A.want) return;
    if (cur) { stopSrc(cur, A.fade || 0.5); A.cur = null; }
    if (!A.want) return;
    if (AMB_FILES[A.want]) { loadAmbFile(A.want); if (st.ambFile[A.want].state === 'loading') return; }
    var af = AMB_FILES[A.want] && st.ambFile[A.want].decoded, ab = af || buffer('ambience', A.want);
    if (!ab) return;
    var h = startSrc(ab, st.n.ambDuck, { loop: true, vol: 1, fade: A.fade || 0.5 });
    h.id = A.want; h.file = !!af;
    A.cur = h;
  }
  function syncLoops() {
    if (!st.ctx) return;
    st.loops.forEach(function (l) {
      if (l.src) return;
      var ab = buffer('loop', l.id);
      if (!ab) return;
      var h = startSrc(ab, st.n.sfx, { loop: true, vol: l.vol, rate: l.rate, fade: l.fade || 0.02 });
      l.src = h.src; l.g = h.g;
    });
  }
  function syncAll() { syncMusic(); syncFx(); syncAmb(); syncLoops(); }

  // =================================================================================================================
  // VO playback
  // =================================================================================================================
  function voDur(id) {
    var d = st.data['vo:' + id];
    return d ? d.dur : est(id);
  }
  function voStart(id, loop, gap) {
    var e = { id: id, end: loop ? Infinity : st.T + voDur(id), src: null, loop: loop };
    st.played.push(id);
    st.vo.push(e);
    if (st.data['vo:' + id] && canShoot()) {
      var ab = loop ? loopBuffer(id, gap) : buffer('vo', id);
      if (ab) {
        var h = startSrc(ab, st.n.vo, { loop: loop, rate: st.rate });
        e.src = h.src; e.g = h.g;
        if (!loop) st.oneShots.push({ src: h.src, end: e.end });
      }
    }
    duck();
    return e;
  }
  /** a line padded with `gap` seconds of silence, looping (sayLoop) */
  function loopBuffer(id, gap) {
    var key = 'vo:' + id + '@' + gap.toFixed(2);
    if (st.abuf[key]) return st.abuf[key];
    var d = st.data['vo:' + id], pad = Math.round(gap * d.sr), src = d.ch[0], out = new Float32Array(src.length + pad);
    out.set(src, 0);
    return (st.abuf[key] = toBuffer({ ch: [out], sr: d.sr }));
  }
  function voStop(e, fade) {
    var i = st.vo.indexOf(e);
    if (i >= 0) st.vo.splice(i, 1);
    if (e.src) stopSrc(e, fade === undefined ? 0.04 : fade);
    duck();
  }
  function duck() {
    if (!st.ctx || !st.n) return;
    var on = st.vo.length > 0 ? 1 : 0;
    if (on === st.n.ducked) return;
    st.n.ducked = on;
    ramp(st.n.musicDuck.gain, on ? DUCK.music : 1, on ? 0.08 : 0.5);
    ramp(st.n.ambDuck.gain, on ? DUCK.amb : 1, on ? 0.08 : 0.5);
  }
  function levelAt(id, t) {
    if (!(t >= 0)) return 0;
    var d = st.data['vo:' + id];
    if (d && d.env) {
      if (t > d.dur) return 0;
      var x = t * ENV_HZ, i = Math.floor(x), fr = x - i, e = d.env, a = e[Math.min(i, e.length - 1)] || 0, b = e[Math.min(i + 1, e.length - 1)] || 0;
      var v = a + (b - a) * fr;
      return Math.pow(clamp((v - 0.08) / 0.92, 0, 1), 0.75);
    }
    // no decoded buffer: seeded 5.5 Hz pseudo-syllables (plan section 9 "Lip-flap")
    if (t > est(id)) return 0;
    var s = Math.sin(2 * Math.PI * 5.5 * t + hash(id) * 6.283);
    return s > 0 ? 0.25 + 0.6 * s : 0.05;
  }

  // =================================================================================================================
  // public API
  // =================================================================================================================
  var api = {};
  api.init = guard('init', function () {
    if (st.inited) return;
    st.inited = true;
    st.rnd = (JG.rng || JG.synth.mulberry)(0xA0D10);
    if (JG.on) {
      JG.on('visibility', function (visible) {
        if (!st.ctx) return;
        try {
          var p = visible ? (!st.userSuspended && st.unlocked ? st.ctx.resume() : null) : st.ctx.suspend();
          if (p && p.catch) p.catch(noop);
        } catch (e) { /* ignore */ }
      });
      // the montage file decodes lazily from desk-sit (or a jump to the beats that use it)
      JG.on('beat', function (id) { if (id === 'desk-sit' || id === 'montage' || id === 'two-hours-later') loadMontage(); if (id === 'title' || id === 'rooftop-call') loadIntro(); if (id === 'plaza-walk' || id === 'elevator-ride') loadElevator(); if (id === 'title' || id === 'rooftop-call') loadAmbFile('roof'); if (id === 'rooftop-walk' || id === 'rooftop-jump' || id === 'street-subway') loadAmbFile('street'); if (id === 'street-subway' || id === 'subway-ride' || id === 'subway-wink') loadAmbFile('subway'); if (id === 'elevator-ride' || id === 'ops-plea') loadAmbFile('office'); });
    }
  });

  api.preload = function (onProgress) {
    if (st.preloading) return st.preloading;
    var t0 = now();
    st.preloading = Promise.resolve().then(function () {
      var ids = Object.keys(JG.LINES || {}), done = 0, hasAudio = !!(AC() || OAC());
      if (hasAudio && JG.sfxLib) {
        // SFX and loops now (small); ambiences and music from the background queue once the loop runs
        JG.sfxLib.ids.sfx.forEach(function (id) { renderData('sfx', id); });
        JG.sfxLib.ids.loops.forEach(function (id) { renderData('loop', id); });
        st.queue = ['ambience:roof', 'music:theme', 'ambience:street', 'ambience:subway', 'ambience:elevator', 'music:elevator', 'ambience:office', 'music:montage']
          .filter(function (k) { return !st.data[k]; });
      }
      if (!OAC() && ids.length) warn('audio-nodecoder', 'JG.audio: no OfflineAudioContext; VO lines run as timed subtitles in silence');
      return Promise.all(ids.map(function (id) {
        return loadLine(id).then(function () { done++; if (onProgress) try { onProgress(done / ids.length); } catch (e) { /* ui */ } });
      }));
    }).then(function () {
      st.ready = true; st.loadMs = Math.round(now() - t0);
    }).catch(function (e) {
      st.ready = true; st.loadMs = Math.round(now() - t0);
      warn('audio-preload', 'JG.audio.preload: ' + dbg(e));
    });
    return st.preloading;
  };

  api.unlock = guard('unlock', function () {
    st.unlocked = true;
    if (!st.ctx && !st.noCtx) createCtx();
    var ctx = st.ctx;
    if (!ctx) return;
    st.userSuspended = false;
    if (ctx.state !== 'running') { try { var p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* resume may never resolve; nothing waits on it */ } }
    try { // the iOS unlock: a one-sample buffer started inside the gesture
      var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { /* fine */ }
    syncAll();
  });

  api.reset = guard('reset', function () {
    st.vo.slice().forEach(function (e) { voStop(e, 0.03); });
    st.vo = [];
    st.loops.forEach(function (l) { stopSrc(l, 0.05); });
    st.loops = [];
    st.music.want = null; st.music.fade = 0.4; st.music.opts = {};
    st.music.fxWant = null; st.music.fxFade = 0.3;
    st.amb.want = null; st.amb.fade = 0.6;
    duck();
  });

  api.update = guard('update', function (dt) {
    if (dt > 0 && isFinite(dt)) st.T += dt;
    if (st.vo.length) {
      var T = st.T, live = st.vo.filter(function (e) { return e.end > T; });
      if (live.length !== st.vo.length) { st.vo = live; duck(); }
    }
    if (st.oneShots.length > 32) st.oneShots = st.oneShots.filter(function (o) { return o.end > st.T - 5; });
    syncAll();
    // background renders: one job every other tick
    if (st.queue.length && (++st.qTick & 1) === 0) {
      var k = st.queue.shift(), i = k.indexOf(':');
      renderData(k.slice(0, i), k.slice(i + 1));
    }
  });

  api.setMuted = guard('setMuted', function (b) {
    st.muted = !!b;
    if (st.n) ramp(st.n.master.gain, st.muted ? 0 : BUS.master, 0.03);
  });
  api.setRate = guard('setRate', function (n) {
    n = +n;
    if (!(n > 0) || !isFinite(n)) return;
    st.rate = clamp(n, 0.25, 16);
    st.vo.forEach(function (e) { if (e.src) try { e.src.playbackRate.value = st.rate; } catch (x) { /* ended */ } });
  });
  api.suspend = guard('suspend', function () {
    st.userSuspended = true;
    if (st.ctx) { var p = st.ctx.suspend(); if (p && p.catch) p.catch(noop); }
  });
  api.resume = guard('resume', function () {
    st.userSuspended = false;
    if (st.ctx && st.unlocked) { var p = st.ctx.resume(); if (p && p.catch) p.catch(noop); }
  });

  api.vo = {
    duration: guard('vo.duration', function (id) { return voDur(id); }, function (id) { return est(id); }),
    play: guard('vo.play', function (id) {
      var e = voStart(id, false, 0);
      return { duration: voDur(id), stop: function () { try { voStop(e); } catch (x) { /* ignore */ } } };
    }, function (id) { return { duration: est(id), stop: noop }; }),
    loop: guard('vo.loop', function (id, o) {
      var gap = o && o.gap !== undefined ? +o.gap : 0.4, e = voStart(id, true, gap);
      return { duration: Infinity, stop: function () { try { voStop(e, 0.08); } catch (x) { /* ignore */ } } };
    }, function () { return { duration: Infinity, stop: noop }; }),
    levelAt: guard('vo.levelAt', levelAt, 0),
    isPlaceholder: guard('vo.isPlaceholder', function (id) { var l = st.lines[id]; return !!(l && l.placeholder); }, false),
    stopAll: guard('vo.stopAll', function () { st.vo.slice().forEach(function (e) { voStop(e, 0.03); }); st.vo = []; duck(); })
  };

  api.sfx = guard('sfx', function (id, o) {
    o = o || {};
    if (!JG.sfxLib || !JG.sfxLib.has('sfx', id)) { warn('sfx-unknown:' + id, 'JG.audio.sfx: unknown id "' + id + '"'); return { duration: 0, stop: noop }; }
    st.sfxCount[id] = (st.sfxCount[id] || 0) + 1;
    var d = dur('sfx', id), h = null;
    if (canShoot()) {
      var ab = buffer('sfx', id);
      if (ab) {
        // footsteps vary a little (seeded), everything else is exactly as designed
        var vary = id === 'step_hard' || id === 'step_carpet' ? 0.94 + 0.12 * st.rnd() : 1;
        var vol = o.volume === undefined ? 1 : +o.volume;
        h = startSrc(ab, st.n.sfx, { vol: vol * (id.indexOf('step_') === 0 ? 0.92 + 0.08 * st.rnd() : 1), rate: st.rate * (o.rate || 1) * vary, pan: o.pan });
        st.oneShots.push({ src: h.src, end: st.T + d });
      }
    }
    return { duration: d, stop: function () { if (h) stopSrc(h, 0.02); } };
  }, function () { return { duration: 0, stop: noop }; });

  api.loop = guard('loop', function (id, o) {
    o = o || {};
    if (!JG.sfxLib || !JG.sfxLib.has('loop', id)) {
      warn('loop-unknown:' + id, 'JG.audio.loop: unknown id "' + id + '"');
      return { duration: Infinity, stop: noop, set: noop };
    }
    var l = { id: id, vol: o.volume === undefined ? 1 : +o.volume, rate: o.rate || 1, fade: o.fade || 0.02, src: null, g: null };
    st.loops.push(l);
    syncLoops();
    return {
      duration: Infinity,
      stop: function (fade) {
        try { var i = st.loops.indexOf(l); if (i >= 0) st.loops.splice(i, 1); stopSrc(l, fade === undefined ? 0.05 : fade); } catch (e) { /* ignore */ }
      },
      set: function (param, v) {
        try {
          v = +v; if (!isFinite(v)) return;
          if (param === 'volume' || param === 'intensity') { l.vol = param === 'intensity' ? clamp(v, 0, 1.5) : v; if (l.g) ramp(l.g.gain, l.vol, 0.1); }
          if (param === 'rate' || param === 'intensity') { l.rate = param === 'intensity' ? 0.8 + 0.4 * clamp(v, 0, 1.5) : clamp(v, 0.25, 4); if (l.src) ramp(l.src.playbackRate, l.rate, 0.1); }
        } catch (e) { /* ignore */ }
      }
    };
  }, function () { return { duration: Infinity, stop: noop, set: noop }; });

  api.ambience = guard('ambience', function (id, fade) {
    if (id && (!JG.sfxLib || !JG.sfxLib.has('ambience', id))) { warn('amb-unknown:' + id, 'JG.audio.ambience: unknown id "' + id + '"'); id = null; }
    st.amb.want = id || null;
    st.amb.fade = fade === undefined ? 1 : +fade || 0.05;
    syncAmb();
    return { duration: st.amb.fade, stop: function () { if (st.amb.want === id) { st.amb.want = null; syncAmb(); } } };
  }, function () { return { duration: 0, stop: noop }; });

  api.music = {
    play: guard('music.play', function (id, o) {
      o = o || {};
      if (id === 'intro') loadIntro();
      else if (!JG.musicLib || JG.musicLib.ids.indexOf(id) < 0) { warn('music-unknown:' + id, 'JG.audio.music: unknown id "' + id + '"'); return { duration: Infinity, stop: noop }; }
      if (id === 'montage') loadMontage();
      var M = st.music;
      if (M.want !== id || o.restart) M.restart = !!o.restart && !!(M.cur && M.cur.id === id);
      M.want = id;
      M.opts = o;
      M.fade = o.fade === undefined ? 0.6 : +o.fade;
      syncMusic();
      if (M.cur && M.cur.id === id && o.volume !== undefined) ramp(M.cur.g.gain, +o.volume, 0.2);
      return { duration: Infinity, stop: function (fade) { if (M.want === id) { M.want = null; M.fade = fade === undefined ? 0.6 : +fade; syncMusic(); } } };
    }, function () { return { duration: Infinity, stop: noop }; }),
    stop: guard('music.stop', function (fade) {
      st.music.want = null; st.music.fade = fade === undefined ? 0.6 : +fade;
      syncMusic();
      return { duration: st.music.fade, stop: noop };
    }),
    fx: guard('music.fx', function (fx, fade) {
      if (fx && !FX[fx]) { warn('musicfx-unknown:' + fx, 'JG.audio.music.fx: unknown fx "' + fx + '"'); fx = null; }
      st.music.fxWant = fx || null;
      st.music.fxFade = +fade || 0;
      syncFx();
      return { duration: st.music.fxFade, stop: noop };
    }),
    source: guard('music.source', function (id) {
      if ((id || 'montage') !== 'montage') return 'standin';
      return st.montage.state === 'file' ? 'file' : 'standin';
    }, 'standin')
  };

  api.debug = guard('debug', function () {
    var lines = {};
    Object.keys(st.lines).forEach(function (id) { var l = st.lines[id]; lines[id] = { status: l.status, dur: +(+l.dur).toFixed(3), gainDb: l.gainDb, sfx: l.sfx }; });
    var vo = [];
    st.vo.forEach(function (e) { if (vo.indexOf(e.id) < 0) vo.push(e.id); });
    var renders = {};
    Object.keys(st.data).forEach(function (k) { if (k.indexOf('vo:') !== 0) renders[k] = st.data[k].ms; });
    return {
      stub: false, ctx: st.ctx ? st.ctx.state : st.noCtx ? 'none' : 'not created', unlocked: st.unlocked, muted: st.muted, rate: st.rate,
      ready: st.ready, loadMs: st.loadMs, voPlayed: st.played.slice(), sfx: Object.assign({}, st.sfxCount),
      loops: st.loops.map(function (l) { return l.id; }), music: st.music.want, musicFx: st.music.fxWant, ambience: st.amb.want, vo: vo,
      playing: { music: st.music.cur ? st.music.cur.id + (st.music.cur.file ? ' (file)' : '') : null, ambience: st.amb.cur ? st.amb.cur.id + (st.amb.cur.file ? ' (file)' : '') : null, fx: st.music.fxCur },
      montage: { source: api.music.source('montage'), state: st.montage.state, reason: st.montage.reason },
      lines: lines, renders: renders, queue: st.queue.slice(), errors: st.errors
    };
  }, function () { return { stub: false, error: true, loops: [], vo: [], music: null, musicFx: null, ambience: null }; });

  /** dev/test only: the pure processing step, so checks can feed it synthetic lines (no state touched) */
  api._processVo = processVo;

  JG.audio = api;
})();
