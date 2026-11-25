/* JG.input (plan section 6, Input). Keyboard, touch (through the UI's chips, joystick and hold-chip) and gamepad,
 * mapped to actions 'x', 'y', 'skip' (hold), 'start', 'mute'. Classic script; touches the DOM only in init().
 *
 *   init(root)  poll()  update(dt)  move: {x, y}  isDown(action)  on('press'|'release', fn(action, source)) -> off
 *   inject(action, source?) -> true if delivered     the single press path: keys, chips, gamepad and tests all use it
 *   setVirtualMove(x, y | null)   touch joystick or __game.move; overrides keys while set
 *   setSkipHold(on, source)       the UI hold-chip (pointer down/up); Enter does the same from the keyboard
 *   skipHold() -> 0..1            hold progress for the skip chip
 *   arm(sec = 0.3)                x/y presses are ignored until sec of game time have passed (called when a prompt shows)
 *   setMode('roam'|'cine'|'choice'|'ui')   mode    lastSource    idleSeconds    clear()
 *
 * inject('start') calls JG.audio.unlock() synchronously before delivering the press, so a keyboard or gamepad start
 * unlocks audio inside its own gesture just as the title click does.
 * Move is WASD and arrows by e.code; +y is "forward" (up on the stick). X and Y match e.key or KeyX/KeyY. Enter held
 * 0.5 s (real time) gives one 'skip' press; a short Enter press in 'ui' mode gives 'start'. M mutes. Space, E and Esc
 * are unbound; arrows and Space are preventDefault-ed. Presses are edge-triggered and ignore e.repeat. The gamepad is
 * optional and disabled for good after its first throw. On window blur, keys are cleared and 'input-blur' is emitted
 * (the UI shows "Click the game to use the keyboard"). */
(function () {
  'use strict';
  var JG = window.JG;
  var MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  var PREVENT = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };

  var keys = {}, down = {}, listeners = { press: [], release: [] };
  var virtual = null, padMove = { x: 0, y: 0 }, padDisabled = false, padPrev = {};
  var armUntil = -1, enterAt = 0, enterFired = false, chipHoldAt = 0;

  var input = JG.input = {
    move: { x: 0, y: 0 }, mode: 'cine', lastSource: 'none', idleSeconds: 0, ready: false,

    init: function (root) {
      if (input.ready) return;
      input.ready = true;
      window.addEventListener('keydown', onKeyDown, { passive: false });
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', function () { input.clear(); JG.emit('input-blur'); });
      window.addEventListener('focus', function () { JG.emit('input-focus'); });
      if (root) root.addEventListener('pointerdown', function () { input.idleSeconds = 0; JG.emit('input-focus'); });
    },
    poll: function () {
      if (padDisabled || !navigator.getGamepads) return;
      try {
        var pads = navigator.getGamepads(), pad = null;
        for (var i = 0; pads && i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
        if (!pad) { padMove.x = padMove.y = 0; return; }
        var ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
        padMove.x = Math.abs(ax) > 0.2 ? ax : 0;
        padMove.y = Math.abs(ay) > 0.2 ? -ay : 0;
        // A -> x, Y -> y, B/Start -> skip (held), Back -> mute
        padButton(pad, 0, 'x'); padButton(pad, 3, 'y'); padButton(pad, 8, 'mute');
        var hold = isPressed(pad, 1) || isPressed(pad, 9);
        if (hold && !padPrev.hold) { input.setSkipHold(true, 'gamepad'); if (input.mode === 'ui') input.inject('start', 'gamepad'); }
        if (!hold && padPrev.hold) input.setSkipHold(false, 'gamepad');
        padPrev.hold = hold;
      } catch (e) {
        padDisabled = true;
        JG.warn('gamepad-off', 'gamepad disabled after an error: ' + (e && e.message || e));
      }
    },
    update: function (dt) {
      var x = 0, y = 0;
      Object.keys(keys).forEach(function (c) { var m = MOVE[c]; if (keys[c] && m) { x += m[0]; y += m[1]; } });
      if (virtual) { x = virtual.x; y = virtual.y; }
      else if (!x && !y && (padMove.x || padMove.y)) { x = padMove.x; y = padMove.y; }
      var len = Math.sqrt(x * x + y * y);
      if (len > 1) { x /= len; y /= len; }
      input.move.x = x; input.move.y = y;
      if (len > 0.05) input.idleSeconds = 0; else input.idleSeconds += dt;
      // skip hold (real time, so it feels the same at every time scale)
      var t0 = holdStart();
      if (t0 && !enterFired && performance.now() - t0 >= JG.config.skipHoldSec * 1000) {
        enterFired = true;
        input.inject('skip', input.lastSource);
      }
    },
    isDown: function (a) { if (a === 'skip') return !!holdStart(); return !!down[a]; },
    on: function (type, fn) {
      var l = listeners[type];
      if (!l) throw new Error('JG.input.on: unknown event ' + type);
      l.push(fn);
      return function off() { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    },
    inject: function (action, source) {
      source = source || 'inject';
      if (JG.CONTRACT && JG.CONTRACT.actions && JG.CONTRACT.actions.indexOf(action) < 0) { JG.track.missing('action', action); return false; }
      input.idleSeconds = 0;
      input.lastSource = source;
      if ((action === 'x' || action === 'y') && !input.armed()) return false;
      // 'start' is the title's gesture: unlock audio synchronously here, inside the keydown / click / pad handler that
      // called inject, so every start path (click, Enter, gamepad Start, tests) unlocks it (plan beat 0).
      if (action === 'start' && JG.audio && JG.audio.unlock) {
        try { JG.audio.unlock(); } catch (e) { JG.error('audio.unlock', e); }
      }
      if (action === 'mute' && JG.audio && JG.audio.setMuted) {
        try { JG.audio.setMuted(!(JG.audio.debug && JG.audio.debug().muted)); } catch (e) { JG.error('mute', e); }
      }
      emit('press', action, source);
      return true;
    },
    setVirtualMove: function (x, y) {
      if (x === null || x === undefined) { virtual = null; return; }
      virtual = { x: +x || 0, y: +y || 0 };
      input.lastSource = 'touch';
    },
    setSkipHold: function (on, source) {
      if (on) { if (!chipHoldAt) { chipHoldAt = performance.now(); enterFired = false; } input.lastSource = source || 'touch'; }
      else { chipHoldAt = 0; if (!enterAt) enterFired = false; }
    },
    skipHold: function () {
      var t0 = holdStart();
      if (!t0 || enterFired) return 0;
      return Math.min(1, (performance.now() - t0) / (JG.config.skipHoldSec * 1000));
    },
    arm: function (sec) { armUntil = JG.clock.t + (sec === undefined ? JG.config.armSec : sec); },
    armed: function () { return JG.clock.t >= armUntil - 1e-9; },
    setMode: function (m) {
      input.mode = m;
      if (m !== 'roam') virtual = virtual && input.lastSource === 'touch' ? virtual : null;
      if (JG.ui && JG.ui.setInputMode) { try { JG.ui.setInputMode(m); } catch (e) { JG.error('ui.setInputMode', e); } }
    },
    clear: function () { keys = {}; down = {}; enterAt = 0; chipHoldAt = 0; enterFired = false; input.move.x = input.move.y = 0; }
  };

  function holdStart() { return enterAt || chipHoldAt; }
  function emit(type, action, source) {
    listeners[type].slice().forEach(function (fn) { try { fn(action, source); } catch (e) { JG.error('input.' + type, e); } });
  }
  function isPressed(pad, i) { var b = pad.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); }
  function padButton(pad, i, action) {
    var p = isPressed(pad, i);
    if (p && !padPrev[i]) { down[action] = true; input.inject(action, 'gamepad'); }
    if (!p && padPrev[i]) { down[action] = false; emit('release', action, 'gamepad'); }
    padPrev[i] = p;
  }
  function editable(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }

  function onKeyDown(e) {
    if (editable(e.target)) return;
    if (PREVENT[e.code]) e.preventDefault();
    input.lastSource = 'keyboard';
    input.idleSeconds = 0;
    if (MOVE[e.code]) { keys[e.code] = true; return; }
    if (e.repeat) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'x' || e.code === 'KeyX') { down.x = true; input.inject('x', 'keyboard'); return; }
    if (k === 'y' || e.code === 'KeyY') { down.y = true; input.inject('y', 'keyboard'); return; }
    if (k === 'm' || e.code === 'KeyM') { input.inject('mute', 'keyboard'); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || k === 'enter') {
      if (input.mode === 'ui') { input.inject('start', 'keyboard'); return; }
      if (!enterAt) { enterAt = performance.now(); enterFired = false; }
    }
  }
  function onKeyUp(e) {
    if (MOVE[e.code]) { keys[e.code] = false; return; }
    var k = (e.key || '').toLowerCase();
    if (k === 'x' || e.code === 'KeyX') { down.x = false; emit('release', 'x', 'keyboard'); }
    if (k === 'y' || e.code === 'KeyY') { down.y = false; emit('release', 'y', 'keyboard'); }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || k === 'enter') { enterAt = 0; if (!chipHoldAt) enterFired = false; }
  }
})();
