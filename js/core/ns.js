/* JG namespace (plan sections 5 and 6). Classic script, loaded with defer after three-boot.mjs; touches neither THREE
 * nor the DOM at load. Holds: logging, JG.css, the seeded RNG, the event bus, the registries every owner registers
 * into (beats, scenes, characters), JG.config, the asset manifest, the text defaults and the contract tracker.
 *
 *   JG.beats.register(def)             def = {id, kind, skippable, skipTo?, est, stage, needs, play(w)}   (section 6)
 *   JG.scenes.register(id, {build(kit) -> SceneInstance})
 *   JG.characters.register(id, factory(kit, info) -> Actor, data?)    data is passed through to engines (dress/face)
 *   JG.on(name, fn) -> off      JG.emit(name, ...args)
 *   JG.manifest.add(name, url)  assets boot loads before the title enables (JG.assets names)
 *   JG.text('prompts.jump')     JG.TEXT (E2, story) first, then JG.TEXT_DEFAULTS below
 *   JG.track.stub(kind, name)   records a stub hit (reported by __game.contract().stubHits)
 *   JG.track.missing(kind, name) records a name used but absent from JG.CONTRACT (__game.contract().missing)
 */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  JG.version = 'stage1';
  JG.errors = JG.errors || [];
  var warned = {};
  JG.log = function () { console.log.apply(console, ['[JG]'].concat([].slice.call(arguments))); };
  /** Warns once per key. */
  JG.warn = function (key, msg) {
    if (warned[key]) return;
    warned[key] = true;
    console.warn('[JG] ' + (msg || key));
  };
  JG.error = function (where, err) {
    var e = { where: where, message: String(err && err.message || err), t: JG.clock ? +JG.clock.t.toFixed(3) : 0 };
    JG.errors.push(e);
    console.error('[JG] ' + where + ': ' + e.message + (err && err.stack ? '\n' + err.stack : ''));
  };
  /** The only way to add CSS (no .css files): one <style> per id, replaced on repeat. */
  JG.css = function (id, text) {
    var el = document.getElementById('css-' + id);
    if (!el) { el = document.createElement('style'); el.id = 'css-' + id; document.head.appendChild(el); }
    el.textContent = text;
  };
  /** Seeded RNG (mulberry32); scene code never uses Math.random. */
  JG.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- event bus ----------
  var handlers = {};
  JG.on = function (name, fn) {
    (handlers[name] = handlers[name] || []).push(fn);
    return function off() { var l = handlers[name]; if (l) { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
  };
  JG.emit = function (name) {
    var args = [].slice.call(arguments, 1), l = handlers[name];
    if (!l) return;
    l.slice().forEach(function (fn) { try { fn.apply(null, args); } catch (e) { JG.error('event ' + name, e); } });
  };

  // ---------- registries ----------
  function registry(kind) {
    var items = {}, order = [];
    return {
      _set: function (id, value) {
        if (typeof id !== 'string' || !id) throw new Error('JG.' + kind + '.register: an id string is required');
        if (items[id] && !items[id].__stub) JG.warn(kind + '-dup:' + id, 'JG.' + kind + ': "' + id + '" registered twice; the later one wins');
        if (!items[id]) order.push(id);
        items[id] = value;
        return value;
      },
      get: function (id) { return items[id] || null; },
      has: function (id) { return !!items[id] && !items[id].__stub; },
      ids: function () { return order.slice(); }
    };
  }

  var beats = registry('beats');
  JG.beats = {
    /** def = {id, kind:'cine'|'play'|'choice'|'card', skippable, skipTo?, est, stage, needs?, play(w)} */
    register: function (def) {
      if (!def || typeof def.play !== 'function') throw new Error('JG.beats.register: def.play(w) is required (' + (def && def.id) + ')');
      def.kind = def.kind || 'cine';
      return beats._set(def.id, def);
    },
    get: beats.get, has: beats.has, ids: beats.ids,
    /** used by stubs.js only: a stub never replaces a real registration */
    _stub: function (def) { if (beats.has(def.id)) return beats.get(def.id); def.__stub = true; return beats._set(def.id, def); }
  };

  var scenes = registry('scenes');
  JG.scenes = {
    /** register(id /* city|subway|office *\/, { build(kit) -> SceneInstance }) */
    register: function (id, def) {
      if (!def || typeof def.build !== 'function') throw new Error('JG.scenes.register: {build(kit)} is required (' + id + ')');
      return scenes._set(id, def);
    },
    get: scenes.get, has: scenes.has, ids: scenes.ids
  };

  var characters = registry('characters');
  JG.characters = {
    /** register(id /* roo|exec|ops|oldlady|extra *\/, factory(kit, {instance}) -> Actor, data?) */
    register: function (id, factory, data) {
      if (typeof factory !== 'function' && !(factory && typeof factory.build === 'function')) throw new Error('JG.characters.register: a factory(kit) is required (' + id + ')');
      return characters._set(id, { factory: typeof factory === 'function' ? factory : factory.build.bind(factory), data: data || (factory && factory.data) || null });
    },
    get: characters.get, has: characters.has, ids: characters.ids
  };

  // ---------- config ----------
  JG.config = Object.assign({
    EXEC_IS_LAUREN: false,   // plan section 15: Lauren is a separate, voice-only caller
    seed: 1,
    quality: null,           // 'high' | 'low' | null (auto)
    timeScale: 1,
    fixedStep: false,        // 1/60 ticks as separate macrotasks (tests)
    auto: false,             // false | true | 'y-first'
    mute: false,
    debug: false,
    idleHintSec: 12,         // G-play "Take me there" chip
    pulseSec: 15,            // choice: X pulses after 15 s
    armSec: 0.3,             // presses arm 300 ms after a prompt shows
    skipHoldSec: 0.5,        // hold Enter 0.5 s
    walkSpeed: 2.2, runSpeed: 4.0
  }, JG.config || {});

  // ---------- asset manifest (names are JG.assets names; boot loads them all before the director starts) ----------
  var manifest = {};
  JG.manifest = {
    add: function (name, url) { manifest[name] = url; },
    all: function () { return Object.assign({}, manifest); }
  };

  // ---------- text ----------
  /* Read through JG.text(path). JG.TEXT (E2's story file) wins; these defaults keep Stage 1 running until it lands.
   * E2: please use these keys, or tell E1 which ones change. The tagline is a placeholder constant the user replaces. */
  JG.TEXT_DEFAULTS = {
    title: 'Roo vs. Tech Debt',
    start: 'CLICK TO START',
    replay: 'Play again',
    credits: 'Credits',
    prompts: { jump: 'Press X to jump', calm: 'Push X to calm down', getOn: 'Press Y to get on with it', sit: 'Push X to sit down', keepPlaying: 'Push X to continue playing',
      scan: 'Push Y to scan your face', drink: 'Push Y for a drink', coffee: 'Push Y to make a coffee', window: 'Push Y to check the windows', fix: 'Let June identify and fix' },
    objectives: {
      'rooftop-walk': 'Get to the edge of the roof',
      'street-subway': 'Take the subway',
      'plaza-walk': 'Head into the Fortune 500 office — elevator to 56',
      'office-walk': 'Get to the computer'
    },
    card: '2 HOURS LATER',
    allClear: 'All clear — org is healthy and Agentforce agents are running',
    tagline: 'Tech debt: handled.',
    niceTry: 'NICE TRY',
    takeMeThere: 'Take me there',
    tapForSound: 'Tap for sound',
    clickForKeyboard: 'Click the game to use the keyboard',
    skip: 'Hold Enter to skip',
    skipTouch: 'Hold to skip',
    nowPlaying: 'NOW PLAYING',
    callerName: 'LAUREN',
    lettering: { ring: 'RING! RING!', thoom: 'THOOM!', ding: 'DING!', help: 'HELP!', waaah: 'WAAAH!', sniff: 'SNIFF', krassh: 'KRASSH!',
      beep: 'BEEP!', glug: 'GLUG GLUG', brew: 'BRRRZZT!', ahh: 'AHHH...', bonk: 'BONK!' },
    nonAffiliation: 'Not affiliated with, or endorsed by, the makers of any game it nods to.',
    speakers: { ROO: 'ROO', LAUREN: 'LAUREN', OPS: 'OPS LEAD', EXEC: 'EXEC', BRENDA: 'BRENDA', GARY: 'GARY', SCANNER: 'SCANNER' },
    scanner: { idle: 'LOOK HERE', sign: 'FACE ID', scanning: 'SCANNING...', name: 'ROO', clearance: 'CLEARANCE: ALL OF IT', again: 'STILL ROO', againSub: 'STILL ALL OF IT' },
    coffee: { firmware: 'UPDATING FIRMWARE', step: '{n} OF 47', brewing: 'BREWING...' },
    sideQuests: { title: 'Side quests', short: 'SIDE QUESTS', coffee: 'Grab a coffee', cooler: 'Water-cooler gossip', scanner: 'Scan your face', window: 'Check the windows' }
  };
  function dig(obj, path) {
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) { if (obj == null) return undefined; obj = obj[parts[i]]; }
    return obj;
  }
  JG.text = function (path) {
    var v = dig(JG.TEXT, path);
    if (v === undefined || v === null) v = dig(JG.TEXT_DEFAULTS, path);
    return v === undefined ? path : v;
  };

  // ---------- contract tracker ----------
  var stubHits = {}, missing = {};
  JG.track = {
    stub: function (kind, name, note) {
      var k = kind + ':' + name;
      if (stubHits[k]) { stubHits[k]++; return; }
      stubHits[k] = 1;
      console.info('[JG stub] ' + k + (note ? ' (' + note + ')' : ''));
    },
    missing: function (kind, name) {
      var k = kind + ':' + name;
      if (missing[k]) return;
      missing[k] = 1;
      JG.warn('missing-' + k, 'name not in JG.CONTRACT: ' + k);
    },
    /** check(kind, name, list) -> true if listed; records it as missing otherwise */
    check: function (kind, name, list) {
      if (!list || list.indexOf(name) >= 0) return true;
      JG.track.missing(kind, name);
      return false;
    },
    report: function () { return { missing: Object.keys(missing), stubHits: Object.keys(stubHits) }; }
  };
})();
