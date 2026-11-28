/* JG.director: the sequencer (plan sections 1, 6 and 7). The only owner of flow promises. Classic script; touches the
 * DOM only through #game's data attributes once start() is called.
 *
 * Runner per beat: a new JG.Scope; world.cleanSlate(); world.applyStage(beat.stage, entry, beat); then
 * `await beat.play(w)`. play returns undefined (go to the next beat in JG.STORY_ORDER) or a beat id. Entering any beat
 * (finish, skip, goto, replay, context loss) cancels the previous beat's scope first, so every path is "abort, then
 * enter a beat from its canonical stage". Entry kind: 'flow' (the story continued) or 'jump' (skip, goto, hash).
 *
 *   start(id?)   goto(id) -> bool   next()   skip() -> true | false   update(dt)   setAuto(false|true|'y-first')
 *   log (beat ids in entry order)   voLog (VO ids in first-play order per say/sayLoop)   marks   flags   state
 *   snapshot() -> {beat, phase, entry, mark, prompt, station, subtitle, objective, t, flags}   (station: an optional
 *                station's prompt in w.roam, else null; st.prompt is only ever the goal's or a choice's)
 *
 * Skip (G-cine): only 'cine' beats with skippable: true. Hold Enter 0.5 s (or the hold-chip, gamepad B/Start, or
 * __game.skip()). It lands on beat.skipTo || the next beat, entered as 'jump'. A skip during setup is ignored. A skip
 * while a w.transition covers the screen is applied at once: the cover is cancelled with the beat's scope and the
 * target is entered from its canonical stage (which resets the cover), so every skip lands within a frame.
 * Flags (w.flags) are cleared on every 'jump' entry and at the start of a run, so a jump equals a cold start.
 * stage.freeze: on a 'flow' entry the previous frame is kept (see enter()); rendering stops at once.
 * Watchdog: cine beats only, 2.5 x est + the durations of needs.lines; on expiry it logs an error and advances.
 * Card beats: rendering stops 2 s after entry (title and end cards) and restarts on the next beat.
 * Errors: a non-Cancel error from play() is logged to JG.errors (__game.state().errors) and the story advances.
 *
 * Auto mode (__JG_BOOT.auto, #auto, __game.auto): w.roam autopilots to the goal zone and presses its action (its
 * optional stations never show or run); w.choose presses X (with 'y-first', Y once first); the title stub presses
 * start. Cinematics are never skipped by auto. */
(function () {
  'use strict';
  var JG = window.JG;
  var cur = null, lastSkipP = -1;
  var st = { beat: null, phase: 'loading', entry: null, mark: null, prompt: null, station: null, subtitle: null, objective: null, covered: false };

  var dir = JG.director = {
    log: [], voLog: [], marks: [], flags: {}, auto: false, autoState: {}, state: st,
    order: function () { return (JG.STORY_ORDER || (JG.CONTRACT && JG.CONTRACT.beats) || []).slice(); },
    current: function () { return cur ? cur.id : null; },
    start: function (id) {
      var order = dir.order();
      if (!dir._listening) {
        dir._listening = true;
        JG.input.on('press', function (a) { if (a === 'skip') dir.skip(); });
        JG.on('context-restored', function () { if (cur) enter(cur.id, 'jump'); });
      }
      enter(id || order[0], id && id !== order[0] ? 'jump' : 'flow');
    },
    goto: function (id) {
      if (!JG.beats.get(id)) { JG.track.missing('beat', id); JG.warn('goto:' + id, 'goto: no beat "' + id + '"'); return false; }
      enter(id, 'jump');
      return true;
    },
    next: function () { var n = cur && nextOf(cur.id); if (n) enter(n, 'jump'); return n || null; },
    skip: function () {
      if (!cur) return false;
      var d = cur.def;
      if (d.kind !== 'cine' || !d.skippable) return false;
      if (st.phase !== 'play') return false; // ignored during setup (G-cine)
      doSkip(); // also under a w.transition cover: enter() cancels the cover and rebuilds the target's canonical stage
      return true;
    },
    canSkip: function () { return !!(cur && cur.def.kind === 'cine' && cur.def.skippable); },
    setAuto: function (m) { dir.auto = m === 'y-first' ? 'y-first' : !!m; },
    update: function () {
      if (!cur) return;
      var d = cur.def;
      if (d.kind === 'cine' && d.skippable && JG.ui && JG.ui.skip) {
        var p = JG.input.skipHold();
        if (p !== lastSkipP) { lastSkipP = p; try { JG.ui.skip.setProgress(p); } catch (e) { JG.error('ui.skip', e); } }
      }
    },
    snapshot: function () {
      return { beat: st.beat, phase: st.phase, entry: st.entry, mark: st.mark, prompt: st.prompt, station: st.station, subtitle: st.subtitle,
        objective: st.objective, covered: st.covered, t: +JG.clock.t.toFixed(3), flags: JSON.parse(JSON.stringify(dir.flags)) };
    }
  };

  function nextOf(id) {
    var order = dir.order(), i = order.indexOf(id);
    return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
  }
  function setPhase(p) {
    st.phase = p;
    var root = document.getElementById('game');
    if (root) { root.setAttribute('data-phase', p); root.setAttribute('data-beat', st.beat || ''); }
  }
  function call(where, fn) { try { return fn(); } catch (e) { JG.error(where, e); } }

  function doSkip() {
    var from = cur.id, target = cur.def.skipTo || nextOf(from);
    JG.emit('skip', from, target);
    if (target) enter(target, 'jump');
  }

  function enter(id, kind) {
    var def = JG.beats.get(id);
    if (!def) { JG.error('director', 'no beat "' + id + '"'); return; }
    var prev = cur;
    if (prev) { prev.scope.cancel('leave ' + prev.id); JG.emit('beat-exit', prev.id); }
    var order = dir.order();
    // flags are story memory of one uninterrupted run: a fresh run (the first beat, or flowing into the second) and
    // every jump (skip, goto, hash route, context restore) clear them, so a jump entry equals a cold start (section 13)
    if (kind !== 'flow' || id === order[0] || id === order[1]) { dir.flags = {}; dir.autoState = {}; }
    var scope = new JG.Scope(null, 'beat:' + id);
    var c = cur = { id: id, def: def, scope: scope, kind: kind, t0: JG.clock.t };
    dir.log.push(id);
    st.beat = id; st.entry = kind; st.mark = null; st.prompt = null; st.station = null; st.subtitle = null; st.objective = null; st.covered = false;
    lastSkipP = -1;
    setPhase('setup');
    // stage.freeze (the tagline): entered by flow, the previous beat's last frame stays as it is (no actor reset, no
    // camera move, stage panel kept) and rendering stops at once, so the DOM sits over a frozen frame. Entered by a
    // jump, the stage's own scene, cast, cam and ui build that frame instead.
    var freeze = !!(def.stage && def.stage.freeze && kind === 'flow' && prev);
    if (JG.loop) JG.loop.setRendering(!freeze);
    call('cleanSlate', function () { JG.world.cleanSlate({ freeze: freeze }); });
    call('stage ' + id, function () { JG.world.applyStage(def.stage, kind, def, { freeze: freeze }); });
    if (cur !== c) return; // a stage callback re-entered
    setPhase('play');
    JG.emit('beat', id, kind);
    if (def.kind === 'cine' && def.skippable && JG.ui && JG.ui.skip) call('ui.skip', function () { JG.ui.skip.show(); });
    if (def.kind === 'cine') {
      var limit = 2.5 * (def.est || 10);
      ((def.needs && def.needs.lines) || []).forEach(function (l) { limit += voDuration(l); });
      var scriptedTime = 0;
      scope.everyTick(function (dt) {
        // A cine can hand control to the player. The time they spend choosing has no story deadline.
        if (st.prompt) return;
        scriptedTime += dt;
        if (scriptedTime < limit) return;
        JG.error('watchdog', 'beat "' + id + '" ran past ' + limit.toFixed(1) + ' s of game time; advancing');
        finish(c, undefined);
        return true;
      });
    }
    if (def.kind === 'card') scope.after(2, function () { if (cur === c && JG.loop) JG.loop.setRendering(false); });
    var w = makeW(c, scope);
    var p;
    try { p = Promise.resolve(def.play(w)); } catch (e) { p = Promise.reject(e); }
    p.then(function (ret) { if (cur === c) finish(c, ret); }, function (e) {
      if (cur !== c || JG.isCancel(e)) return;
      JG.error('beat ' + id, e);
      finish(c, undefined);
    });
  }

  function finish(c, ret) {
    if (cur !== c) return;
    c.scope.cancel('done');
    var next = typeof ret === 'string' ? ret : nextOf(c.id);
    if (typeof ret === 'string' && !JG.beats.get(ret)) { JG.track.missing('beat', ret); next = nextOf(c.id); }
    if (!next) { setPhase('done'); JG.emit('story-end', c.id); return; }
    enter(next, 'flow');
  }

  function line(id) {
    var L = JG.LINES && JG.LINES[id];
    if (JG.CONTRACT) JG.track.check('line', id, JG.CONTRACT.lines);
    return L || { speaker: '', text: id, est: 1.2 };
  }
  function voDuration(id, handle) {
    if (handle && handle.duration > 0 && isFinite(handle.duration)) return handle.duration;
    var d = 0;
    try { d = JG.audio && JG.audio.vo && JG.audio.vo.duration(id); } catch (e) { d = 0; }
    if (d > 0 && isFinite(d)) return d;
    return Math.max((JG.LINES && JG.LINES[id] && JG.LINES[id].est) || 0, 1.2);
  }
  var SPEAKER_ACTOR = { ROO: 'roo', OPS: 'ops', EXEC: 'exec' };

  // ---------------------------------------------------------------------------------------------------------------
  // w: the helper set a beat's play(w) gets (plan section 6). Everything is cancellable through the beat scope and runs
  // on the game clock. Helpers that take time return Promises; fire-and-forget ones return handles {duration, stop()}.
  // ---------------------------------------------------------------------------------------------------------------
  function makeW(c, scope) {
    var V = window.THREE.Vector3, world = JG.world, ui = JG.ui, audio = JG.audio, clock = JG.clock, beat = c.def;
    var w = {};
    function chk() { scope.check(); }
    function act(a) { if (typeof a === 'string') { var x = world.actor(a); if (!world.staged(a)) world.addToStage(x); return x; } return a; }
    function point(p, actorFor) {
      if (p == null) return null;
      if (p.isVector3) return p.clone();
      if (Array.isArray(p)) return new V().fromArray(p);
      if (typeof p === 'string') {
        // 'roo' or 'roo.head' (an actor or one of its anchors), 'camera', else a marker name
        var dot = p.indexOf('.'), base = dot > 0 ? p.slice(0, dot) : p;
        if (world.hasActor(base) && (dot < 0 || p.indexOf('.', dot + 1) < 0)) {
          var a = world.actor(base), o = (dot > 0 && a.anchors && a.anchors[p.slice(dot + 1)]) || a.root;
          return o.getWorldPosition(new V());
        }
        if (p === 'camera') return JG.camera.object.position.clone();
        var m = world.marker(p);
        return m ? m.pos : (actorFor ? actorFor.root.position.clone() : new V());
      }
      if (p.root) return p.root.getWorldPosition(new V());
      if (p.pos) return point(p.pos);
      if (p.isObject3D) return p.getWorldPosition(new V());
      return null;
    }
    function pointsOf(target, a) {
      if (typeof target === 'string') {
        var path = findPath(target);
        if (path) return path;
        return [point(target, a)];
      }
      if (Array.isArray(target) && target.length && typeof target[0] !== 'number') return target.map(function (p) { return point(p, a); });
      return [point(target, a)];
    }
    function findPath(name) {
      // a path name is never also a marker name in the contract; try paths first, quietly
      var inst = world.current, has = inst && inst.paths && inst.paths[name];
      if (!has && JG.CONTRACT && JG.CONTRACT.paths) Object.keys(JG.CONTRACT.paths).forEach(function (k) { if (JG.CONTRACT.paths[k].indexOf(name) >= 0) has = true; });
      return has ? world.path(name) : null;
    }
    function yawTo(a, target) {
      if (typeof target === 'number') return target;
      var p = point(target, a);
      if (!p) return a.root.rotation.y;
      var dx = p.x - a.root.position.x, dz = p.z - a.root.position.z;
      if (dx * dx + dz * dz < 1e-4) { var m = typeof target === 'string' && world.marker(target); return m ? m.yaw : a.root.rotation.y; }
      return Math.atan2(dx, dz);
    }
    function sfx(id, opts) {
      if (JG.CONTRACT) JG.track.check('sfx', id, JG.CONTRACT.sfx);
      return call('audio.sfx', function () { return audio.sfx(id, opts || {}); }) || { stop: function () {} };
    }

    w.scope = scope;
    w.beat = beat.id;
    w.flags = dir.flags;
    w.entry = { kind: c.kind };
    Object.defineProperty(w, 'quality', { get: function () { return JG.loop ? JG.loop.quality : 'high'; } });
    Object.defineProperty(w, 'auto', { get: function () { return dir.auto; } });
    w.text = JG.text;

    // ----- time / flow -----
    w.wait = function (sec) { return scope.wait(sec); };
    w.frame = function () { return scope.frame(); };
    w.until = function (fn, opts) { return scope.until(fn, opts); };
    w.guard = function (p) { return scope.guard(p); };
    w.onCancel = function (fn) { return scope.onCancel(fn); };
    w.mark = function (name) {
      st.mark = name;
      dir.marks.push({ beat: beat.id, name: name, t: +clock.t.toFixed(3) });
      JG.emit('mark', beat.id, name);
    };
    function runChild(fn, kid) { return Promise.resolve().then(function () { kid.check(); return fn(makeW(c, kid)); }); }
    w.parallel = function () {
      chk();
      var fns = [].slice.call(arguments), kids = fns.map(function () { return scope.child('parallel'); });
      return scope.guard(Promise.all(fns.map(function (fn, i) { return runChild(fn, kids[i]); })))
        .catch(function (e) { kids.forEach(function (k) { k.cancel('parallel'); }); throw e; });
    };
    w.race = function () {
      chk();
      var fns = [].slice.call(arguments), kids = fns.map(function () { return scope.child('race'); });
      var ps = fns.map(function (fn, i) { return runChild(fn, kids[i]).then(function (v) { return { i: i, v: v }; }); });
      return scope.guard(Promise.race(ps)).then(function (r) {
        kids.forEach(function (k, j) { if (j !== r.i) k.cancel('race lost'); });
        return r.v;
      }, function (e) { kids.forEach(function (k) { k.cancel('race'); }); throw e; });
    };
    w.fork = function (fn) {
      chk();
      var kid = scope.child('fork');
      var done = runChild(fn, kid).catch(function (e) { if (!JG.isCancel(e)) JG.error('fork in ' + beat.id, e); });
      return { cancel: function () { kid.cancel('fork cancelled'); }, done: done };
    };
    w.tween = function (obj, props, sec, ease) { chk(); return scope.tween(obj, props, sec, ease); };
    w.tweenFn = function (sec, fn, ease) { chk(); return scope.tweenFn(sec, fn, ease); };

    // ----- dialogue -----
    var subToken = 0, balloon = null;
    function showSub(L, anchor, duration, avoid) {
      var tok = ++subToken;
      st.subtitle = L.text;
      if (balloon) { balloon.stop(); balloon = null; }
      if (anchor && ui.speechBalloon) balloon = ui.speechBalloon.show(L.text, anchor, duration, avoid);
      else call('ui.subtitles', function () { ui.subtitles.show({ speaker: JG.text('speakers.' + L.speaker) || L.speaker, text: L.text }); });
      return tok;
    }
    function hideSub(tok) {
      if (tok !== subToken) return;
      st.subtitle = null;
      if (balloon) { balloon.stop(); balloon = null; }
      else call('ui.subtitles', function () { ui.subtitles.hide(); });
    }
    function speaker(L, a) {
      if (a) return act(a);
      var id = SPEAKER_ACTOR[L.speaker] || (L.speaker === 'LAUREN' && JG.config.EXEC_IS_LAUREN ? 'exec' : null);
      return id && world.staged(id) ? world.actor(id) : null;
    }
    function logVo(id) { if (dir.voLog[dir.voLog.length - 1] !== id || !JG.LINES || !JG.LINES[id] || !JG.LINES[id].loop) dir.voLog.push(id); }
    w.say = function (id, o) {
      chk();
      o = o || {};
      var L = line(id), a = speaker(L, o.actor);
      if (o.lookAt && a) call('lookAt', function () { a.lookAt(world.lookTarget(o.lookAt)); });
      var h = call('vo.play', function () { return audio.vo.play(id); }) || {};
      var dur = voDuration(id, h), gap = o.gap === undefined ? 0.25 : o.gap;
      var anchors = o.balloon && a && a.anchors;
      var tok = showSub(L, anchors && anchors.head, dur, anchors && anchors.handR), t0 = clock.t;
      logVo(id);
      var tk = scope.everyTick(function () { if (a) a.setMouth(level(id, clock.t - t0)); });
      function end(stopVo) { tk.cancel(); if (a) call('setMouth', function () { a.setMouth(0); }); hideSub(tok); if (stopVo && h.stop) call('vo.stop', function () { h.stop(); }); }
      var off = scope.onCancel(function () { end(true); });
      return scope.wait(dur).then(function () { off(); end(false); return gap > 0 ? scope.wait(gap) : undefined; });
    };
    w.sayLoop = function (id, o) {
      chk();
      o = o || {};
      var L = line(id), a = speaker(L, o.actor), gap = o.gap === undefined ? 0.4 : o.gap;
      var h = call('vo.loop', function () { return audio.vo.loop(id, { gap: gap }); }) || {};
      var tok = showSub(L), t0 = clock.t, period = voDuration(id) + gap, stopped = false;
      logVo(id);
      var tk = scope.everyTick(function () { if (a) a.setMouth(level(id, (clock.t - t0) % period)); });
      function stop() {
        if (stopped) return;
        stopped = true; off(); tk.cancel();
        if (a) call('setMouth', function () { a.setMouth(0); });
        hideSub(tok);
        if (h.stop) call('vo.loop.stop', function () { h.stop(); });
      }
      var off = scope.onCancel(stop);
      return { duration: Infinity, stop: stop };
    };
    function level(id, t) { try { return audio.vo.levelAt(id, t) || 0; } catch (e) { return 0; } }

    // ----- actors -----
    w.actor = function (id) { chk(); return act(id); };
    w.place = function (a, marker) {
      chk(); a = act(a);
      var p = point(marker, a), m = typeof marker === 'string' && world.marker(marker);
      if (p) a.root.position.copy(p);
      if (m) a.root.rotation.y = m.yaw;
      else if (marker && marker.yaw !== undefined) a.root.rotation.y = marker.yaw;
      a.root.updateMatrixWorld(true);
      if (a.teleport) call('teleport', function () { a.teleport(); });
      return a;
    };
    w.moveTo = function (a, target, o) {
      chk(); a = act(a); o = o || {};
      var speed = o.speed || 1.4, pts = pointsOf(target, a).filter(Boolean), i = 0;
      var endMarker = typeof target === 'string' && !findPath(target) && !world.hasActor(target) ? world.marker(target) : null;
      if (o.clip && a.play) a.play(o.clip, { loop: true });
      return scope.promise(function (res) {
        var tk = clock.everyTick(function (dt) {
          var p = a.root.position, tgt = pts[i];
          if (!tgt) { res(); return true; }
          var dx = tgt.x - p.x, dy = tgt.y - p.y, dz = tgt.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), stepLen = speed * dt;
          if (d <= stepLen || d < 1e-4) { p.copy(tgt); i++; if (i >= pts.length) { res(); return true; } return; }
          p.x += dx / d * stepLen; p.y += dy / d * stepLen; p.z += dz / d * stepLen;
          if (dx * dx + dz * dz > 1e-6) {
            var want = Math.atan2(dx, dz), cur = a.root.rotation.y, diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
            a.root.rotation.y = cur + diff * Math.min(1, 12 * dt);
          }
          if (!o.clip) a.setLocomotion(speed);
        });
        return function () { tk.cancel(); if (!o.clip) a.setLocomotion(0); };
      }).then(function () {
        if (o.face === undefined || o.face === false) return;
        var yaw = o.face === true ? (endMarker ? endMarker.yaw : a.root.rotation.y) : yawTo(a, o.face);
        return w.turnTo(a, yaw, 0.25);
      });
    };
    w.turnTo = function (a, target, sec) {
      chk(); a = act(a);
      var y0 = a.root.rotation.y, y1 = yawTo(a, target), diff = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0));
      return scope.tweenFn(sec === undefined ? 0.3 : sec, function (k) { a.root.rotation.y = y0 + diff * k; }, 'inOutSine');
    };
    w.play = function (a, clip, opts) {
      chk(); a = act(a); opts = opts || {};
      checkClip(a, clip);
      var h = call('actor.play', function () { return a.play(clip, opts); }) || { duration: 0, stop: function () {} };
      var d = h.duration / (opts.speed || 1);
      if (opts.loop || opts.wait === false || !(d > 0) || !isFinite(d)) return Promise.resolve(h);
      return scope.wait(d).then(function () { return h; });
    };
    w.pose = function (a, name, blend) {
      chk(); a = act(a);
      blend = blend === undefined ? 0.2 : blend;
      checkClip(a, name, true);
      call('actor.pose', function () { a.pose(name, blend); });
      return blend > 0 ? scope.wait(blend) : Promise.resolve();
    };
    w.look = function (a, target) { chk(); a = act(a); call('actor.lookAt', function () { a.lookAt(world.lookTarget(target)); }); };
    w.express = function (a, name) {
      chk(); a = act(a);
      var C = JG.CONTRACT && JG.CONTRACT.expressions && JG.CONTRACT.expressions[a.base || a.id];
      if (C) JG.track.check('expression', (a.base || a.id) + '.' + name, C.map(function (e) { return (a.base || a.id) + '.' + e; }));
      call('actor.setExpression', function () { a.setExpression(name); });
    };
    w.arc = function (a, o) {
      chk(); a = act(a); o = o || {};
      var from = a.root.position.clone(), to = point(o.to, a) || from.clone(), h = o.height === undefined ? 1 : o.height, p = a.root.position;
      return scope.tweenFn(o.sec || 1, function (k) {
        p.lerpVectors(from, to, k);
        p.y += 4 * h * k * (1 - k);
      }, o.ease || 'linear');
    };
    w.hug = function (a, b) {
      chk(); a = act(a); b = act(b);
      var ma = world.marker('office.hug.roo'), mb = world.marker('office.hug.ops');
      if (ma && mb) { a.root.position.copy(ma.pos); b.root.position.copy(mb.pos); }
      else { var f = new V(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)); b.root.position.copy(a.root.position).addScaledVector(f, 0.42); }
      a.root.rotation.y = Math.atan2(b.root.position.x - a.root.position.x, b.root.position.z - a.root.position.z);
      b.root.rotation.y = a.root.rotation.y + Math.PI;
      var ha = a.play('hugHold', { loop: true, fade: 0.25 }), hb = b.play('hugReceive', { loop: true, fade: 0.25 });
      var released = false;
      function release() {
        if (released) return;
        released = true;
        call('hug.release', function () { if (ha && ha.stop) ha.stop(0.3); if (hb && hb.stop) hb.stop(0.3); a.play('idle', { loop: true, fade: 0.3 }); });
      }
      scope.onCancel(release);
      return {
        duration: Infinity,
        pat: function () { call('pulse', function () { a.pulse('pat'); }); sfx('pat'); },
        release: release, stop: release
      };
    };
    function checkClip(a, name, isPose) {
      var C = JG.CONTRACT, base = a.base || a.id;
      if (!C || !name) return;
      var ok = (C.clips[base] || []).indexOf(name) >= 0 || ((C.additive && C.additive[base]) || []).indexOf(name) >= 0 ||
        ((C.poses && C.poses[base]) || []).indexOf(name) >= 0 || name === 'idle' || name === 'walk' || name === 'rest';
      if (!ok) JG.track.missing(isPose ? 'pose' : 'clip', base + '.' + name);
    }

    // ----- camera / screen -----
    w.cut = function (shot) { chk(); return JG.camera.cut(shot); };
    w.cam = function (shot, sec, ease) {
      chk();
      var h = JG.camera.move(shot, sec === undefined ? 1 : sec, ease);
      var ended = false;
      return scope.promise(function (res) {
        h.done.then(function () { ended = true; res(); });
        return function () { if (!ended && h.stop) h.stop(); }; // a cancelled race/fork branch stops its camera move
      });
    };
    w.camFollow = function (a, preset) {
      chk(); a = act(a);
      var p = preset && typeof preset === 'object' ? preset : world.camPreset(preset || beat.id);
      JG.camera.follow(a, p || undefined);
    };
    w.shake = function (amp, sec) { chk(); return JG.camera.shake(amp, sec); };
    w.fadeOut = function (sec, color) {
      chk(); sec = sec === undefined ? 0.5 : sec;
      call('ui.fade', function () { ui.fade.to(1, sec, color); });
      return scope.wait(sec);
    };
    w.fadeIn = function (sec) {
      chk(); sec = sec === undefined ? 0.5 : sec;
      call('ui.fade', function () { ui.fade.to(0, sec); });
      return scope.wait(sec);
    };
    w.transition = function (kind, fn, sec) {
      chk(); sec = sec || 0.45;
      call('ui.transition', function () { ui.transition.play(kind, 'in', sec); });
      return scope.wait(sec).then(function () {
        st.covered = true;
        return Promise.resolve().then(function () { return fn ? fn(w) : undefined; });
      }).then(function (v) {
        st.covered = false;
        call('ui.transition', function () { ui.transition.play(kind, 'out', sec); });
        return scope.wait(sec).then(function () { return v; });
      }, function (e) { st.covered = false; throw e; });
    };
    w.card = function (spec, sec) {
      chk(); sec = sec === undefined ? 2 : sec;
      call('ui.card', function () { ui.card.show(spec, sec); });
      return scope.wait(sec);
    };
    w.letterbox = function (on) { chk(); call('ui.letterbox', function () { ui.letterbox.set(!!on); }); };
    w.lettering = function (text, anchor, sec) {
      chk();
      var p = point(anchor) || (JG.camera && JG.camera.object.position.clone());
      return call('ui.lettering', function () { return ui.lettering.show(text, p, sec === undefined ? 1.2 : sec); }) || { duration: 0, stop: function () {} };
    };

    // ----- world / audio -----
    w.setScene = function (patch, sec) {
      chk();
      var r = world.setState(patch, sec || 0);
      return r.duration > 0 ? scope.wait(r.duration) : Promise.resolve();
    };
    w.prop = function (name) { chk(); return world.prop(name); };
    w.sfx = function (id, opts) { chk(); return sfx(id, opts); };
    w.loop = function (id, opts) {
      chk();
      if (JG.CONTRACT) JG.track.check('loop', id, JG.CONTRACT.loops);
      var h = call('audio.loop', function () { return audio.loop(id, opts || {}); }) || { stop: function () {}, set: function () {} };
      scope.onCancel(function () { call('loop.stop', function () { h.stop(0); }); });
      return h;
    };
    w.music = function (id, opts) {
      chk(); opts = opts || {};
      if (!id) return call('music.stop', function () { audio.music.stop(opts.fade || 0); });
      if (JG.CONTRACT) JG.track.check('music', id, JG.CONTRACT.music);
      return call('music.play', function () { return audio.music.play(id, opts); });
    };
    w.musicFx = function (fx, fade) { chk(); call('music.fx', function () { audio.music.fx(fx || null, fade || 0); }); };
    w.ambience = function (id) {
      chk();
      if (id && JG.CONTRACT) JG.track.check('ambience', id, JG.CONTRACT.ambience);
      call('ambience', function () { audio.ambience(id || null, 1); });
    };

    // ----- gameplay -----
    /* w.roam({actor, goal: {zone, action?, text?}, path?, cam?, objective?, stations?}): player control until the goal.
     * stations (optional side quests, office-walk): [{id, zone, action, text, side, once, stand?, limit?, run(w2, {count})}].
     * Never in auto mode (no prompt, no side list, no run). Outside the goal zone, with no "Take me there" autopilot
     * running, Roo inside a station's zone (one not used up) shows its prompt (st.station, never st.prompt) and arms
     * input; its action runs the station: player control, objective, side list and beacon off, mark 'station:<id>',
     * then run() in a child scope with a watchdog (station.limit, default 18 s); afterwards (also on error or watchdog) control, camera and
     * HUD come back, and on success mark 'station-done:<id>', dir.flags['station:<id>'] = uses, the side item ticked.
     * While a station runs the goal's action and the idle hint are off. */
    var STATION_DOG = 18;
    w.roam = function (o) {
      chk(); o = o || {};
      var a = act(o.actor || 'roo'), goal = o.goal || {}, cfg = JG.config;
      var rects = world.walkRects(beat.id), camPreset = (o.cam && typeof o.cam === 'object') ? o.cam : (world.camPreset(o.cam || beat.id) || undefined);
      JG.player.start({ actor: a, rects: rects, spawn: { pos: a.root.position.clone(), yaw: a.root.rotation.y } });
      JG.input.setMode('roam');
      JG.camera.follow(a, camPreset);
      var stations = (o.stations || []).filter(function (s) { return s && s.id && s.zone && s.run; });
      var used = {}, sideOn = function () { return stations.length && !dir.auto; };
      function sideList() { return stations.filter(function (s) { return s.side; }).map(function (s) { return { id: s.id, text: s.side, done: !!used[s.id] }; }); }
      var objective = o.objective !== undefined ? o.objective : JG.text('objectives.' + beat.id);
      var hasObjective = !!(objective && objective !== 'objectives.' + beat.id);
      function showObjective() {
        if (!hasObjective) return;
        st.objective = objective;
        call('ui.objective', function () { ui.objective.show(objective, sideOn() ? { side: sideList() } : undefined); });
      }
      showObjective();
      var center = goal.zone ? world.zoneCenter(goal.zone) : null;
      if (center) center.y = a.root.position.y;
      function showBeacon() { if (center) call('ui.beacon', function () { ui.beacon.set(center.clone().setY(center.y + 1.2)); }); }
      showBeacon();
      var target = o.path ? world.path(o.path) : center;
      // idle time only counts from roam start: time spent watching the cinematic before it is not idling
      var promptH = null, hint = false, hintPilot = false, autoT = 0, autoGo = false, finished = false, roamT0 = clock.t;
      var stH = null, stCur = null, busy = false;
      return scope.promise(function (res) {
        function inside() { return goal.zone ? world.inZone(goal.zone, a.root.position) : false; }
        function done() { if (!finished) { finished = true; res(); } }
        function hideStation() { if (stH) { call('ui.prompt', function () { stH.hide(); }); } stH = null; stCur = null; st.station = null; }
        function stationAt() {
          for (var i = 0; i < stations.length; i++) {
            var s = stations[i];
            if (s.once && used[s.id]) continue;
            if (world.inZone(s.zone, a.root.position)) return s;
          }
          return null;
        }
        function stationTick(ins) {
          var s = dir.auto || ins || hintPilot || !stations.length ? null : stationAt();
          if (s === stCur) return;
          hideStation();
          if (!s) return;
          stCur = s;
          stH = call('ui.prompt', function () { return ui.prompt.show({ options: [{ action: s.action || 'y', text: s.text, primary: true }] }); }) || { hide: function () {} };
          JG.input.arm(); st.station = [s.text];
        }
        function runStation(s) {
          busy = true;
          var n = used[s.id] || 0, ok = false;
          hideStation();
          if (hint) { hint = false; call('ui.hint', function () { ui.hint.hide(); }); }
          st.objective = null;
          call('ui.station-start', function () { ui.objective.hide(); ui.beacon.set(null); });
          w.mark('station:' + s.id);
          JG.player.stop(); JG.input.setVirtualMove(null); JG.input.setMode('cine');
          var kid = scope.child('station:' + s.id);
          var lim = s.limit || STATION_DOG;
          var dog = scope.after(lim, function () { JG.error('station ' + s.id, 'watchdog: ran past ' + lim + ' s'); kid.cancel('station watchdog'); });
          Promise.resolve().then(function () { kid.check(); return s.run(makeW(c, kid), { count: n }); })
            .then(function () { ok = !kid.cancelled; }, function (e) { if (!JG.isCancel(e)) JG.error('station ' + s.id, e); })
            .then(function () {
              dog.cancel();
              kid.cancel('station end');
              if (finished || scope.cancelled) return;
              // control back, wherever the run left him (inside the walk rects: else on the stand marker)
              var p = a.root.position, m = s.stand && world.marker(s.stand);
              if (rects && !inRects(p.x, p.z) && m) { p.x = m.pos.x; p.z = m.pos.z; }
              JG.player.start({ actor: a, rects: rects, spawn: { pos: p.clone(), yaw: a.root.rotation.y } });
              JG.input.setMode('roam');
              JG.camera.follow(a, camPreset);
              roamT0 = clock.t; JG.input.idleSeconds = 0;
              if (ok) {
                used[s.id] = n + 1;
                dir.flags['station:' + s.id] = n + 1;
                w.mark('station-done:' + s.id);
              }
              showObjective(); showBeacon();
              busy = false;
            });
        }
        function inRects(x, z) {
          for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (x >= r.min[0] && x <= r.max[0] && z >= r.min[1] && z <= r.max[1]) return true; }
          return false;
        }
        var offPress = JG.input.on('press', function (action) {
          if (finished || busy) return;
          if (goal.action && action === goal.action && promptH && inside()) { done(); return; }
          if (stH && stCur && !dir.auto && action === (stCur.action || 'y') && world.inZone(stCur.zone, a.root.position)) runStation(stCur);
        });
        var tk = clock.everyTick(function (dt) {
          if (finished) return true;
          if (busy) return;   // a station runs: no goal prompt, no station prompt, no idle hint
          var ins = inside();
          if (!goal.action) { if (ins) { done(); return true; } }
          else if (ins && !promptH) {
            hideStation();
            promptH = call('ui.prompt', function () { return ui.prompt.show({ options: [{ action: goal.action, text: goal.text, primary: true }] }); }) || { hide: function () {} };
            JG.input.arm(); st.prompt = [goal.text];
          } else if (!ins && promptH) { promptH.hide(); promptH = null; st.prompt = null; }
          stationTick(ins);
          if (!hint && target && Math.min(JG.input.idleSeconds, clock.t - roamT0) >= cfg.idleHintSec) {
            hint = true;
            call('ui.hint', function () {
              ui.hint.show(JG.text('takeMeThere'), { tap: function () {
                call('ui.hint', function () { ui.hint.hide(); });
                hintPilot = true;
                // a walk that keeps to the walk rects and steers round people (the crowd too); a path is walked as given
                var way = target.isVector3 && JG.player.route ? JG.player.route(target) : target;
                JG.player.autopilot(way, { people: true, onArrive: function () { hintPilot = false; } });
              } });
            });
          }
          if (dir.auto) {
            autoT += dt;
            if (!autoGo && autoT >= 0.3 && target) { autoGo = true; JG.player.autopilot(target); }
            if (goal.action && ins && promptH && autoT >= 0.6 && JG.input.armed()) JG.input.inject(goal.action, 'auto');
          }
        });
        return function () {
          finished = true; tk.cancel(); offPress(); JG.player.stop();
          if (promptH) promptH.hide();
          hideStation();
          st.prompt = null; st.objective = null;
          call('ui.roam-cleanup', function () { ui.objective.hide(); ui.beacon.set(null); if (hint) ui.hint.hide(); });
          JG.input.setMode('cine');
        };
      });
    };
    w.choose = function (o) {
      chk();
      var options = (o && o.options) || [], cfg = JG.config;
      return scope.promise(function (res) {
        JG.input.setMode('choice');
        var h = Object.assign({ hide: function () {}, strike: function () {}, shake: function () {}, pulse: function () {} },
          call('ui.prompt', function () { return ui.prompt.show({ options: options.map(function (op) { return { action: op.action, alternate: op.alternate, text: op.text, primary: !!op.primary }; }) }); }) || {});
        options.forEach(function (op) { if (op.struck) call('prompt.strike', function () { h.strike(op.action, op.struck === true ? JG.text('niceTry') : op.struck); }); });
        JG.input.arm();
        st.prompt = options.map(function (op) { return op.text; });
        var t0 = clock.t, pulsed = false, autoDone = false, settled = false;
        var off = JG.input.on('press', function (action) {
          if (settled) return;
          var op = null;
          options.forEach(function (x) { if (x.action === action || x.alternate === action) op = x; });
          if (!op) return;
          if (op.struck) { call('prompt.shake', function () { h.shake(op.action); }); sfx('ui_deny'); return; }
          settled = true;
          sfx('ui_blip');
          res(op.action);
        });
        var tk = clock.everyTick(function () {
          var prim = null;
          options.forEach(function (x) { if (x.primary && !x.struck) prim = x; });
          if (!pulsed && prim && clock.t - t0 >= cfg.pulseSec) { pulsed = true; call('prompt.pulse', function () { h.pulse(prim.action); }); }
          if (dir.auto && !autoDone && JG.input.armed() && clock.t - t0 >= 0.45) {
            var pick = pickAuto(options);
            if (pick) autoDone = JG.input.inject(pick, 'auto');
          }
        });
        return function () { settled = true; off(); tk.cancel(); call('prompt.hide', function () { h.hide(); }); st.prompt = null; JG.input.setMode('cine'); };
      });
    };
    function pickAuto(options) {
      var avail = options.filter(function (x) { return !x.struck; }).map(function (x) { return x.action; });
      if (dir.auto === 'y-first' && !dir.autoState.yDone && avail.indexOf('y') >= 0) { dir.autoState.yDone = true; return 'y'; }
      if (avail.indexOf('x') >= 0) return 'x';
      return avail[0] || null;
    }
    return w;
  }
})();
