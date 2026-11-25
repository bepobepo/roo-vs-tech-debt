/* JG.ui, part 2 of 4 (E5): touch and input affordances. Classic IIFE; builds its DOM through the hud's build hook.
 *   - The touch joystick (plan section 6: JG.input.setVirtualMove): shown in 'roam' mode on touch devices; bottom-left
 *     of the paper area in portrait, bottom-left over the stage in landscape. +y is forward (up on the stick).
 *   - The mute button (M on the keyboard does the same): bottom-right of the paper in portrait, top-right of the stage
 *     in landscape. Its icon follows JG.audio.debug().muted.
 *   - Notices in the dock: "Tap for sound" while audio is still locked after a jump entry (any tap or key unlocks it,
 *     inside that gesture), and "Click the game to use the keyboard" after the window loses focus.
 *   JG.ui.joystick.{show(), hide(), active}   JG.ui.notice.{show(text, {tap}), hide()} */
(function () {
  'use strict';
  var JG = window.JG;
  var ui = JG.ui = JG.ui || {};
  var H = ui._ = ui._ || {};
  H.hooks = H.hooks || { build: [], update: [], reset: [], mode: [], layout: [] };

  var CSS = [
    '.jg-joy{position:absolute;z-index:12;width:116px;height:116px;border-radius:50%;pointer-events:auto;touch-action:none;',
    '  background:radial-gradient(circle,rgba(31,79,216,.12) 0 55%,rgba(31,79,216,.05) 56%);border:3px solid var(--ink);',
    '  box-shadow:inset 0 0 0 7px var(--paper),inset 0 0 0 9px rgba(17,17,17,.25),3px 3px 0 var(--ink);animation:jg-pop .2s ease-out}',
    '.jg-ui[data-ui-layout=portrait] .jg-joy,.jg-ui[data-ui-layout=narrow] .jg-joy{left:calc(16px + var(--sal));bottom:calc(16px + var(--sab))}',
    '.jg-ui[data-ui-layout=wide] .jg-joy{left:calc(18px + var(--sal));bottom:calc(18px + var(--sab));background:radial-gradient(circle,rgba(255,248,231,.6) 0 55%,rgba(255,248,231,.38) 56%)}',
    '.jg-joy .knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;pointer-events:none;',
    '  background:radial-gradient(circle at 35% 30%,#5D82EA 0 22%,var(--blue) 24%);border:3px solid var(--ink);box-shadow:2px 3px 0 var(--ink)}',
    '.jg-joy .tk{position:absolute;width:0;height:0;border:6px solid transparent;pointer-events:none}',
    '.jg-joy .n{left:50%;top:9px;margin-left:-6px;border-bottom-color:var(--ink);border-top:0}',
    '.jg-joy .s{left:50%;bottom:9px;margin-left:-6px;border-top-color:var(--ink);border-bottom:0}',
    '.jg-joy .w{top:50%;left:9px;margin-top:-6px;border-right-color:var(--ink);border-left:0}',
    '.jg-joy .e{top:50%;right:9px;margin-top:-6px;border-left-color:var(--ink);border-right:0}',
    '.jg-mute{display:grid;place-items:center;width:46px;height:46px;padding:0;border-radius:50%;background:#fff;border:3px solid var(--ink);box-shadow:2px 2px 0 var(--ink)}',
    '.jg-mute svg{width:22px;height:22px}',
    '.jg-mute.paper{position:absolute;z-index:12;right:calc(12px + var(--sar));bottom:calc(16px + var(--sab))}',
    '.jg-mute .off{display:none}.jg-mute.muted .on{display:none}.jg-mute.muted .off{display:block}',
    '.jg-note{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:5px 16px 5px 6px;background:var(--ink);color:#fff;border:3px solid var(--ink);',
    '  border-radius:999px;box-shadow:3px 3px 0 var(--magenta);font:700 15px/1.1 var(--comic);animation:jg-pop .22s ease-out}',
    '.jg-note i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--yellow)}',
    '.jg-note svg{width:17px;height:17px}'
  ].join('\n');
  var SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="#111"/>';
  var WAVES = '<path d="M16 8.5c1.6 1.8 1.6 5.2 0 7M18.6 6c2.9 3.3 2.9 8.7 0 12" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>';
  var CROSS = '<path d="M16.5 9.5l5 5m0-5l-5 5" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>';
  var KEYS = '<rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="#111" stroke-width="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10" stroke="#111" stroke-width="2" stroke-linecap="round"/>';

  var el = H.el = H.el || {};
  var joy = { on: false, pid: null, x: 0, y: 0, R: 46 }, muteT = 0, mutedShown = null, noteKind = null, mode = 'cine', touchSeen = false, checkT = 0;

  function build() {
    JG.css('ui-touch', CSS);
    var mk = H.mk;
    // joystick
    var j = el.joy = mk('div', 'jg-joy', el.ui, { 'data-ui': 'joystick', role: 'application', 'aria-label': 'Move' });
    ['n', 's', 'w', 'e'].forEach(function (d) { mk('span', 'tk ' + d, j); });
    el.knob = mk('span', 'knob', j);
    j.hidden = true;
    j.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      joy.pid = e.pointerId;
      try { j.setPointerCapture(e.pointerId); } catch (x) { /* not capturable */ }
      steer(e);
    });
    j.addEventListener('pointermove', function (e) { if (e.pointerId === joy.pid) { e.preventDefault(); steer(e); } });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { j.addEventListener(ev, function (e) { if (e.pointerId === joy.pid) release(); }); });
    j.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // mute
    var m = el.mute = mk('button', 'jg-mute', el.ui, { type: 'button', 'data-ui': 'mute', 'aria-label': 'Mute' });
    H.svg(m, 'on', SPEAKER + WAVES, { viewBox: '0 0 24 24' });
    H.svg(m, 'off', SPEAKER + CROSS, { viewBox: '0 0 24 24' });
    m.addEventListener('pointerdown', function (e) { e.preventDefault(); JG.input.inject('mute', H.src(e)); muteT = 1; });
    m.addEventListener('click', function (e) { if (e.detail === 0) { JG.input.inject('mute', 'keyboard'); muteT = 1; } });
    // notice (in the dock, under the chips)
    var n = el.note = mk('button', 'jg-note', el.dock, { type: 'button', 'data-ui': 'notice' });
    n.hidden = true;
    n.addEventListener('pointerdown', function (e) { e.preventDefault(); var f = n._tap; if (f) f(); });
    // any gesture on the game unlocks audio while it is still locked (inside that gesture)
    var root = H.root;
    if (root) root.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') touchSeen = true; unlockAudio(); }, true);
    window.addEventListener('keydown', function () { unlockAudio(); }, true);
    JG.on('input-blur', function () { if (playing() && !H.isTouch()) ui.notice.show(H.T('clickForKeyboard'), { kind: 'keys', tap: function () { try { window.focus(); } catch (x) { /* ignore */ } ui.notice.hide('keys'); } }); });
    JG.on('input-focus', function () { ui.notice.hide('keys'); });
    placeMute();
  }
  function steer(e) {
    var r = el.joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy, R = joy.R, len = Math.sqrt(dx * dx + dy * dy);
    if (len > R) { dx *= R / len; dy *= R / len; len = R; }
    var x = dx / R, y = -dy / R;
    if (len / R < 0.12) { x = 0; y = 0; }
    joy.on = true; joy.x = x; joy.y = y;
    el.knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    JG.input.setVirtualMove(x, y);
  }
  function release() {
    joy.pid = null;
    if (!joy.on) return;
    joy.on = false; joy.x = joy.y = 0;
    if (el.knob) el.knob.style.transform = '';
    JG.input.setVirtualMove(null);
  }
  function playing() {
    var g = H.root, b = g && g.getAttribute('data-beat');
    return !!b && b !== 'title' && !(el.title && !el.title.hidden);
  }
  function audioState() {
    var a = JG.audio;
    if (!a || typeof a.debug !== 'function') return null;
    try { return a.debug() || null; } catch (e) { return null; }
  }
  function unlockAudio() {
    var d = audioState();
    if (!d || d.unlocked) return;
    try { JG.audio.unlock(); } catch (e) { JG.error('audio.unlock', e); }
  }
  function placeMute() {
    if (!el.mute) return;
    var wide = el.ui.getAttribute('data-ui-layout') === 'wide';
    if (wide && el.mute.parentNode !== el.tr) el.tr.insertBefore(el.mute, el.tr.firstChild);
    if (!wide && el.mute.parentNode !== el.ui) el.ui.appendChild(el.mute);
    el.mute.classList.toggle('paper', !wide);
  }
  function joyWanted() { return mode === 'roam' && (touchSeen || H.isTouch()); }
  function syncJoy() {
    if (!el.joy) return;
    var want = joyWanted();
    if (want === !el.joy.hidden) return;
    el.joy.hidden = !want;
    if (!want) release();
  }

  ui.joystick = {
    show: function () { H.dom(); el.joy.hidden = false; },
    hide: function () { if (el.joy) { el.joy.hidden = true; release(); } },
    get active() { return joy.on; }
  };
  ui.notice = {
    show: function (text, o) {
      H.dom(); o = o || {};
      var n = el.note;
      n.innerHTML = '';
      var i = H.mk('i', '', n, { 'aria-hidden': 'true' });
      H.svg(i, '', o.kind === 'keys' ? KEYS : SPEAKER + WAVES, { viewBox: '0 0 24 24' });
      H.text(H.mk('span', 'txt', n), text);
      n._tap = o.tap || null;
      noteKind = o.kind || 'other';
      n.hidden = false;
    },
    hide: function (kind) {
      if (!el.note || (kind && kind !== noteKind)) return;
      el.note.hidden = true; el.note._tap = null; noteKind = null;
    }
  };

  H.hooks.build.push(build);
  H.hooks.layout.push(function () { placeMute(); });
  H.hooks.mode.push(function (m) { mode = m; syncJoy(); });
  H.hooks.reset.push(function () { ui.notice.hide('sound'); });
  H.hooks.update.push(function (dt) {
    checkT -= dt;
    muteT -= dt;
    if (checkT > 0 && muteT <= 0) return;
    checkT = 0.25;
    syncJoy();
    var d = audioState();
    if (d && el.mute) {
      var muted = !!d.muted;
      if (muted !== mutedShown) { mutedShown = muted; el.mute.classList.toggle('muted', muted); el.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); }
    }
    // "Tap for sound": audio still locked during play (a jump entry with no title click), unless muted on purpose
    var locked = d && !d.unlocked && !(JG.config && JG.config.mute) && playing();
    if (locked && !noteKind) ui.notice.show(H.T('tapForSound'), { kind: 'sound', tap: function () { unlockAudio(); ui.notice.hide('sound'); } });
    else if (!locked && noteKind === 'sound') ui.notice.hide('sound');
  });
})();
