/* JG.loop: the pump (plan sections 5, 13, 14 #14). Owns the WebGLRenderer, the stage layout (portrait rule), the
 * two quality tiers, dynamic resolution, and the tick order. Classic script; touches THREE and the DOM only in init().
 *
 * Two pumps:
 *   - normal: one tick per requestAnimationFrame, dt = min(real dt, 1/20 s) x timeScale;
 *   - fixed-step (tests: on whenever window.__JG_BOOT is set, or timeScale != 1): ticks of exactly 1/60 s, each in
 *     its own macrotask, paced at timeScale x real time (slower if the machine cannot keep up), so flows see the same
 *     ticks at every time scale. Rendering is throttled to about 30 fps of real time.
 * Tick order: input.poll/update, clock.tick (timers resolve flow promises; their continuations run as microtasks
 * after the tick), world.update (player, scene, actors), director.update, camera.update (then the 'camera-updated'
 * event: JG.on handlers that cull against this frame's camera), ui.update, audio.update.
 *
 *   JG.loop.init(root, {quality})  start()  stop()  pause(b)  step(n) -> Promise  setTimeScale(n)  setFixed(b)
 *   setQuality('high'|'low')  setRendering(b)  stageRect() -> {x, y, w, h, portrait}  setFullStage(b)
 *   render()  info -> {fps, calls, tris}  renderer  canvas
 * Portrait rule: when the viewport is taller than wide, the 3D stage is a top panel no narrower than 1:1 (its height
 * is at most its width); the paper area below holds subtitles, chips and the joystick. #game gets data-layout and
 * the CSS variables --stage-w / --stage-h. setFullStage(true) (Radar close-up) uses the whole viewport instead. */
(function () {
  'use strict';
  var JG = window.JG;
  var STEP = 1 / 60;

  var loop = JG.loop = {
    renderer: null, canvas: null, root: null, stage: null,
    running: false, paused: false, hidden: false, rendering: true,
    timeScale: 1, fixed: false, quality: 'high', fullStage: false,
    info: { fps: 0, calls: 0, tris: 0, frames: 0, ticks: 0 },
    rect: { x: 0, y: 0, w: 1, h: 1, portrait: false },

    init: function (root, opts) {
      opts = opts || {};
      var THREE = window.THREE;
      loop.root = root;
      loop.quality = opts.quality || autoQuality();
      JG.css('loop', [
        '#game{position:relative;overflow:hidden;background:var(--paper,#FFF8E7);touch-action:none;user-select:none;-webkit-user-select:none}',
        '#jg-stage{position:absolute;left:0;top:0;overflow:hidden;background:#111}',
        '#jg-stage canvas{display:block;width:100%;height:100%}'
      ].join('\n'));
      var stage = loop.stage = document.createElement('div');
      stage.id = 'jg-stage';
      root.insertBefore(stage, root.firstChild);
      var canvas = loop.canvas = document.createElement('canvas');
      stage.appendChild(canvas);
      var r = loop.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: loop.quality === 'high', powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.info.autoReset = false;
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); loop.contextLost = true; JG.warn('ctx-lost', 'WebGL context lost; rendering paused'); });
      canvas.addEventListener('webglcontextrestored', function () { loop.contextLost = false; JG.emit('context-restored'); });
      window.addEventListener('resize', layout);
      document.addEventListener('visibilitychange', function () { loop.hidden = document.hidden; if (!loop.hidden) lastReal = performance.now(); JG.emit('visibility', !loop.hidden); });
      loop.hidden = document.hidden;
      applyQuality();
      layout();
    },
    start: function () {
      if (loop.running) return;
      loop.running = true;
      lastReal = performance.now();
      if (loop.fixed) scheduleFixed(); else requestAnimationFrame(rafPump);
    },
    stop: function () { loop.running = false; },
    pause: function (b) { loop.paused = !!b; lastReal = performance.now(); budget = 0; },
    /** run n fixed ticks (paused or not), each in its own macrotask, then render once */
    step: function (n) {
      n = Math.max(1, n | 0);
      return new Promise(function (resolve) {
        var i = 0;
        function one() {
          if (i++ >= n) { loop.render(); resolve(n); return; }
          tick(STEP);
          macro(one);
        }
        macro(one);
      });
    },
    setTimeScale: function (n) {
      n = +n;
      if (!(n > 0)) return;
      loop.timeScale = n;
      if (n !== 1 && !loop.fixed) loop.setFixed(true);
      if (JG.audio && JG.audio.setRate) safe('audio.setRate', function () { JG.audio.setRate(n); });
    },
    setFixed: function (b) {
      b = !!b;
      if (b === loop.fixed) return;
      loop.fixed = b;
      budget = 0;
      lastReal = performance.now();
      if (loop.running) { if (b) scheduleFixed(); else requestAnimationFrame(rafPump); }
    },
    setQuality: function (tier) { loop.quality = tier === 'low' ? 'low' : 'high'; applyQuality(); JG.emit('quality', loop.quality); },
    setRendering: function (b) { loop.rendering = !!b; },
    // relayout only on a change: setSize clears the canvas, which would blank a frozen frame
    setFullStage: function (b) { b = !!b; if (b === loop.fullStage) return; loop.fullStage = b; layout(); },
    stageRect: function () { return loop.rect; },
    layout: function () { layout(); },
    render: function () {
      if (!loop.renderer || loop.contextLost || !JG.world || !JG.world.scene || !JG.camera || !JG.camera.object) return;
      var r = loop.renderer;
      r.info.reset();
      try { r.render(JG.world.scene, JG.camera.object); } catch (e) { JG.error('render', e); loop.rendering = false; return; }
      loop.info.calls = r.info.render.calls;
      loop.info.tris = r.info.render.triangles;
      loop.info.frames++;
      frameCount++;
    },
    tick: function (dt) { tick(dt); }
  };

  function safe(where, fn) { try { fn(); } catch (e) { JG.error(where, e); } }

  function autoQuality() {
    var q = JG.config.quality;
    if (q === 'high' || q === 'low') return q;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var small = Math.min(window.innerWidth, window.innerHeight) < 500;
    return coarse && small ? 'low' : 'high';
  }
  var maxRatio = 2;
  function applyQuality() {
    if (!loop.renderer) return;
    maxRatio = loop.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1);
    dynRatio = maxRatio;
    loop.renderer.setPixelRatio(dynRatio);
    if (loop.root) loop.root.setAttribute('data-quality', loop.quality);
    layout();
  }

  function layout() {
    var root = loop.root;
    if (!root || !loop.renderer) return;
    var W = Math.max(1, root.clientWidth), H = Math.max(1, root.clientHeight);
    var portrait = W < H && !loop.fullStage;
    var w = W, h = portrait ? Math.min(W, H) : H;
    loop.rect = { x: 0, y: 0, w: w, h: h, portrait: portrait, W: W, H: H };
    loop.stage.style.width = w + 'px';
    loop.stage.style.height = h + 'px';
    root.setAttribute('data-layout', portrait ? 'portrait' : 'landscape');
    root.style.setProperty('--stage-w', w + 'px');
    root.style.setProperty('--stage-h', h + 'px');
    loop.renderer.setSize(w, h, false);
    if (JG.camera && JG.camera.setAspect) JG.camera.setAspect(w / h);
    JG.emit('layout', loop.rect);
    if (!loop.rendering) loop.render(); // setSize cleared the canvas: redraw once so a stopped (card) frame stays visible
  }

  // ---------- tick ----------
  function tick(dt) {
    loop.info.ticks++;
    var input = JG.input, ui = JG.ui, audio = JG.audio;
    if (input) safe('input', function () { if (input.poll) input.poll(); if (input.update) input.update(dt); });
    JG.clock.tick(dt);
    if (JG.world && JG.world.update) safe('world', function () { JG.world.update(dt); });
    if (JG.director && JG.director.update) safe('director', function () { JG.director.update(dt); });
    if (JG.camera && JG.camera.update) safe('camera', function () { JG.camera.update(dt); });
    // 'camera-updated': work that needs this frame's camera (view culling), after cuts and follow moves are applied
    JG.emit('camera-updated', dt);
    if (ui && ui.update) safe('ui', function () { ui.update(dt, { camera: JG.camera && JG.camera.object, rect: loop.rect }); });
    if (audio && audio.update) safe('audio', function () { audio.update(dt); });
  }

  // fps and dynamic resolution (normal pump only; 2 s hysteresis)
  var frameCount = 0, fpsT0 = 0, dynRatio = 1, lowFor = 0, highFor = 0;
  function measure(now) {
    if (!fpsT0) fpsT0 = now;
    if (now - fpsT0 < 500) return;
    var fps = frameCount * 1000 / (now - fpsT0);
    loop.info.fps = Math.round(fps * 10) / 10;
    var span = (now - fpsT0) / 1000;
    frameCount = 0; fpsT0 = now;
    if (loop.fixed || !loop.renderer || !loop.rendering) return;
    if (fps < 45) { lowFor += span; highFor = 0; } else if (fps > 57) { highFor += span; lowFor = 0; } else { lowFor = highFor = 0; }
    if (lowFor >= 2 && dynRatio > 0.75) {
      dynRatio = Math.max(0.75, dynRatio - 0.25); lowFor = 0;
      loop.renderer.setPixelRatio(dynRatio); layout();
    } else if (highFor >= 2 && dynRatio < maxRatio) {
      dynRatio = Math.min(maxRatio, dynRatio + 0.25); highFor = 0;
      loop.renderer.setPixelRatio(dynRatio); layout();
    }
  }

  var lastReal = 0, budget = 0, lastRender = 0;
  function rafPump(now) {
    if (!loop.running || loop.fixed) return;
    requestAnimationFrame(rafPump);
    var dt = Math.min((now - lastReal) / 1000, 1 / 20);
    lastReal = now;
    if (loop.paused || loop.hidden) return;
    if (dt > 0) tick(dt * loop.timeScale);
    if (loop.rendering) loop.render();
    measure(now);
  }

  // fixed-step pump: one tick per macrotask
  var channel = null, queue = [];
  function macro(fn) {
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = function () { var f = queue.shift(); if (f) f(); };
    }
    queue.push(fn);
    channel.port2.postMessage(0);
  }
  var fixedScheduled = false;
  function scheduleFixed() {
    if (fixedScheduled) return;
    fixedScheduled = true;
    macro(fixedPump);
  }
  function fixedPump() {
    fixedScheduled = false;
    if (!loop.running || !loop.fixed) return;
    var now = performance.now();
    var real = Math.min((now - lastReal) / 1000, 0.25);
    lastReal = now;
    if (!loop.paused && !loop.hidden) {
      budget = Math.min(budget + real * loop.timeScale, 0.5);
      if (budget >= STEP) { budget -= STEP; tick(STEP); }
      if (loop.rendering && now - lastRender >= 33) { lastRender = now; loop.render(); }
      measure(now);
    }
    if (budget >= STEP && !loop.paused && !loop.hidden) scheduleFixed();
    else setTimeout(scheduleFixed, loop.paused || loop.hidden ? 50 : 2);
  }
})();
