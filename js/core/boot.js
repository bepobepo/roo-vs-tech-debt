/* boot.js: the last defer script (plan section 5). Checks window.THREE first. If it is missing, shows a notice and
 * returns: on file:// the "run tools/serve.mjs" notice (ES modules do not run from disk in a normal browser), on a
 * served page a generic load error, logged to JG.errors. Otherwise it starts JG.main(root) if a page defined one (the
 * dev pages do), else the game: JG.gameMain(root).
 *
 * JG.gameMain: boot config (JG.debug.readBoot: __JG_BOOT and the hash) -> JG.stubs.install() -> ui/input/audio init ->
 * title cover with a loading bar (the button enables when assets are ready, or after 6 s) -> preload (JG.manifest
 * GLBs, fonts, audio capped at 5 s, LEDGER.json for __game.assets) -> kit, camera, loop, world -> director.start()
 * (the 'title' beat, or the beat named by __JG_BOOT.beat / #<beatId>) -> __game.ready = true.
 * A click on the title before the director runs unlocks audio inside the gesture and is remembered
 * (JG.boot.started), so the title beat continues at once. */
(function () {
  'use strict';
  var JG = window.JG || { errors: [], error: function (w, e) { console.error('[JG] ' + w + ': ' + (e && e.message || e)); } };
  var SERVE = '<strong>This game needs a local web server.</strong><br>Run <code>node tools/serve.mjs</code> in the project folder and open the address it prints.';
  function notice(html) {
    var root = document.getElementById('game') || document.body;
    var div = document.createElement('div');
    div.className = 'jg-notice';
    div.innerHTML = html;
    root.appendChild(div);
  }

  var BASE_ASSETS = {
    'body-male': 'assets/models/body-male.glb',
    'body-female': 'assets/models/body-female.glb',
    'clips-ual1': 'assets/models/clips-ual1.glb',
    'clips-ual2': 'assets/models/clips-ual2.glb'
  };
  var FONTS = [['Bangers', 'assets/fonts/bangers-400.woff2', '400'], ['Comic Neue', 'assets/fonts/comic-neue-700.woff2', '700'],
    ['Inter', 'assets/fonts/inter-400.woff2', '400'], ['Inter', 'assets/fonts/inter-600.woff2', '600']];

  function capped(p, sec) {
    return Promise.race([Promise.resolve(p), new Promise(function (res) { setTimeout(res, sec * 1000); })]);
  }
  function loadFonts() {
    if (!window.FontFace || !document.fonts) return Promise.resolve();
    return Promise.all(FONTS.map(function (f) {
      try {
        var ff = new FontFace(f[0], 'url(' + JG.assets.url(f[1]) + ')', { weight: f[2] });
        document.fonts.add(ff);
        return ff.load().catch(function (e) { JG.warn('font:' + f[1], 'font ' + f[1] + ' did not load: ' + (e && e.message || e)); });
      } catch (e) { return null; }
    }));
  }

  JG.gameMain = function (root) {
    var cfg = JG.debug.readBoot();
    Object.assign(JG.config, { seed: cfg.seed, quality: cfg.quality || JG.config.quality, timeScale: cfg.timeScale, fixedStep: cfg.fixed, auto: cfg.auto || false, mute: !!cfg.mute, debug: !!cfg.debug });
    JG.reseed(cfg.seed);
    var boot = JG.boot = { started: false, assetsReady: false, cfg: cfg };
    JG.stubs.install();
    root.setAttribute('data-phase', 'loading');
    JG.ui.init(root);
    JG.input.init(root);
    JG.audio.init();
    if (cfg.mute) JG.audio.setMuted(true);
    JG.director.setAuto(cfg.auto);
    var game = JG.debug.install();
    if (!cfg.beat) {
      JG.ui.title.show({ onStart: function () {
        try { JG.audio.unlock(); } catch (e) { JG.error('audio.unlock', e); }
        boot.started = true;
        JG.input.inject('start', 'ui');
      } });
      JG.input.setMode('ui');
    }
    JG.ui.loading.set(0);
    var enableTimer = setTimeout(function () { boot.titleEnabled = true; if (JG.ui.title.enable) JG.ui.title.enable(); }, 6000);
    // Enter / gamepad Start on an enabled title before the director runs: remembered like the click (input.inject
    // has already unlocked audio inside that keydown)
    if (!cfg.beat) JG.input.on('press', function (a) { if (a === 'start' && boot.titleEnabled) boot.started = true; });

    Object.keys(BASE_ASSETS).forEach(function (k) { if (!JG.manifest.all()[k]) JG.manifest.add(k, BASE_ASSETS[k]); });
    var manifest = JG.manifest.all(), names = Object.keys(manifest), done = 0;
    var jobs = names.map(function (name) {
      var one = {};
      one[name] = manifest[name];
      return JG.assets.load(one).then(function () { done++; JG.ui.loading.set(0.9 * done / names.length); })
        .catch(function (e) { JG.error('asset ' + name, e); });
    });
    jobs.push(capped(loadFonts(), 3));
    jobs.push(capped(Promise.resolve().then(function () { return JG.audio.preload(function () {}); }).catch(function (e) { JG.error('audio.preload', e); }), 5));
    jobs.push(JG.assets.bytes('LEDGER.json').then(function (b) { return JSON.parse(new TextDecoder().decode(b)); }).then(function (j) { JG.debug.ledger = j; }).catch(function () { JG.debug.ledger = null; }));

    return Promise.all(jobs).then(function () {
      clearTimeout(enableTimer);
      boot.assetsReady = true; boot.titleEnabled = true;
      JG.ui.loading.set(1);
      if (JG.ui.title.enable) JG.ui.title.enable();
      var kit = JG.kit = JG.makeKit({ seed: cfg.seed, quality: cfg.quality || undefined });
      JG.camera.init();
      JG.loop.init(root, { quality: cfg.quality });
      kit.quality = JG.loop.quality;
      JG.world.init(kit);
      JG.loop.setFixed(cfg.fixed);
      JG.loop.setTimeScale(cfg.timeScale);
      JG.loop.start();
      if (cfg.debug) JG.debug.showBadge(root);
      JG.director.start(cfg.beat || null);
      game.ready = true;
      JG.emit('ready');
    });
  };

  function start() {
    var root = document.getElementById('game');
    if (!window.THREE) {
      if (location.protocol === 'file:') {
        notice(SERVE);
      } else {
        JG.error('boot', 'three.js did not load (window.THREE missing): module scripts or the import map failed');
        notice('<strong>The game could not load.</strong><br>Its 3D engine did not start in this browser.');
      }
      if (root) root.setAttribute('data-phase', 'error');
      return;
    }
    if (root) root.setAttribute('data-phase', 'boot');
    var main = typeof JG.main === 'function' ? JG.main : (JG.director && JG.gameMain && root ? JG.gameMain : null);
    if (main) {
      Promise.resolve().then(function () { return main(root); }).catch(function (e) {
        JG.error('main', e);
        if (location.protocol === 'file:') notice(SERVE);
        else notice('<strong>The game could not load.</strong><br>' + String(e && e.message || e).replace(/[<>&]/g, ''));
        if (root) root.setAttribute('data-phase', 'error');
      });
    }
  }
  // Defer scripts run before DOMContentLoaded; the module ran before us in document order.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
