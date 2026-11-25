/* JG.debug and window.__game, the test hook (plan sections 5, 6 "Test hook" and 13). Classic script; defines functions
 * at load; boot.js calls JG.debug.install() once the game is up.
 *
 * Boot config (read once by boot.js through JG.debug.readBoot()): window.__JG_BOOT = {auto, timeScale, mute, seed,
 * quality, beat, fixed} set before load (Playwright addInitScript), then the hash: #auto (auto: true), #auto=y-first,
 * #debug (badge), #<beatId> (start there, as a jump). No query parameters. Whenever __JG_BOOT is present the loop
 * runs fixed 1/60 ticks (set fixed: false to opt out).
 *
 * window.__game = { ready, beats(), state(), goto(id), next(), skip(), press(action), move(x, y), timeScale(n),
 *   auto(mode), pause(b), step(nTicks) -> Promise, waitFor(beatId, ms) -> Promise<bool>, mute(b),
 *   contract() -> {missing, stubHits}, log, assets() -> {glb: {name: {bytes, triangles}}, clips, unresolvedTracks,
 *   ledgerMissing}, voLog, marks }
 * state() = {beat, phase, entry, mark, scene, sceneState, cast, t, flags, player, prompt, station, subtitle, objective, camera,
 *   fps, drawCalls, tris, quality, audio, errors, timeScale, auto}. */
(function () {
  'use strict';
  var JG = window.JG;
  var dbg = JG.debug = { ledger: null, badge: null };

  dbg.readBoot = function () {
    var b = Object.assign({}, window.__JG_BOOT || {}), hasBoot = !!window.__JG_BOOT;
    var hash = (location.hash || '').replace(/^#/, '');
    hash.split('&').forEach(function (part) {
      if (!part) return;
      var kv = part.split('='), k = decodeURIComponent(kv[0]), v = kv.length > 1 ? decodeURIComponent(kv[1]) : null;
      if (k === 'auto') b.auto = v === 'y-first' ? 'y-first' : true;
      else if (k === 'debug') b.debug = true;
      else if (k === 'mute') b.mute = true;
      else if (JG.CONTRACT && JG.CONTRACT.beats.indexOf(k) >= 0) b.beat = k;
    });
    b.fixed = b.fixed !== undefined ? !!b.fixed : hasBoot;
    b.timeScale = +b.timeScale > 0 ? +b.timeScale : 1;
    b.seed = b.seed !== undefined ? b.seed >>> 0 : 1;
    return b;
  };

  function r3(x) { return Math.round(x * 1000) / 1000; }
  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  function contract() {
    var C = JG.CONTRACT || {}, rep = JG.track.report(), missing = rep.missing.slice(), stubHits = rep.stubHits.slice();
    function all(map) { var out = []; Object.keys(map || {}).forEach(function (k) { out = out.concat(map[k]); }); return out; }
    var markers = all(C.markers), zones = all(C.zones), paths = all(C.paths);
    JG.beats.ids().forEach(function (id) {
      var d = JG.beats.get(id);
      if (!d || d.__stub) return;
      if ((C.beats || []).indexOf(id) < 0) missing.push('beat:' + id);
      var n = d.needs || {};
      (n.markers || []).forEach(function (m) { if (markers.indexOf(m) < 0) missing.push('marker:' + m); });
      (n.zones || []).forEach(function (m) { if (zones.indexOf(m) < 0) missing.push('zone:' + m); });
      (n.paths || []).forEach(function (m) { if (paths.indexOf(m) < 0) missing.push('path:' + m); });
      (n.lines || []).forEach(function (m) { if ((C.lines || []).indexOf(m) < 0) missing.push('line:' + m); });
      (n.sfx || []).forEach(function (m) { if ((C.sfx || []).indexOf(m) < 0 && (C.loops || []).indexOf(m) < 0) missing.push('sfx:' + m); });
      (n.props || []).forEach(function (m) { if ((C.props || []).indexOf(m) < 0) missing.push('prop:' + m); });
      (n.anims || []).forEach(function (m) {
        var p = String(m).split('.'), list = p.length > 1 ? [].concat((C.clips || {})[p[0]] || [], (C.additive || {})[p[0]] || [], (C.poses || {})[p[0]] || []) : all(C.clips);
        if (list.indexOf(p[p.length - 1]) < 0) missing.push('clip:' + m);
      });
    });
    // registered (non-stub) sets must provide every contract marker, zone and path for their scene
    (C.scenes || []).forEach(function (sid) {
      if (!JG.scenes.has(sid) || !JG.world || !JG.world.inst) return;
      var inst = JG.world.inst(sid);
      if (!inst || inst.stub) return;
      ['markers', 'zones', 'paths'].forEach(function (kind) {
        ((C[kind] || {})[sid] || []).forEach(function (n) { if (!inst[kind] || !inst[kind][n]) stubHits.push(kind.replace(/s$/, '') + ':' + n + ' (not in set ' + sid + ')'); });
      });
    });
    return { missing: uniq(missing), stubHits: uniq(stubHits) };
  }

  function assets() {
    var out = { glb: {}, clips: [], unresolvedTracks: [], ledgerMissing: [] }, stats = JG.assets.stats();
    var refBones = {};
    Object.keys(stats).forEach(function (name) {
      var e = JG.assets.get(name), tris = 0;
      if (e.gltf) {
        e.gltf.scene.traverse(function (o) {
          if (o.isMesh && o.geometry) { var g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
          if (o.isBone && /^body-/.test(name)) refBones[o.name] = true;
        });
        (e.gltf.animations || []).forEach(function (c) { out.clips.push(name + ':' + c.name); });
      }
      out.glb[name] = { bytes: e.bytes, triangles: Math.round(tris) };
      var path = String(e.url).replace(/^\.\//, '').replace(/^.*?\bsite\//, '');
      if (dbg.ledger && !dbg.ledger[path]) out.ledgerMissing.push(path);
    });
    // every track of every library clip must resolve on the shared skeleton (and on Roo's rig when it is built)
    var THREE = window.THREE, rigs = [];
    if (Object.keys(refBones).length) rigs.push({ name: 'shared', has: function (n) { return !!refBones[n]; } });
    if (JG.world && JG.world.hasActor && JG.world.hasActor('roo')) {
      var roo = JG.world.actor('roo');
      if (roo.port && roo.port.rig) rigs.push({ name: 'roo', has: function (n) { return !!roo.port.rig.byName[n]; } });
    }
    ['clips-ual1', 'clips-ual2'].forEach(function (lib) {
      if (!JG.assets.has(lib)) return;
      JG.assets.get(lib).gltf.animations.forEach(function (c) {
        c.tracks.forEach(function (t) {
          var node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
          rigs.forEach(function (r) { if (!r.has(node)) out.unresolvedTracks.push(r.name + ':' + lib + ':' + c.name + ':' + t.name); });
        });
      });
    });
    out.unresolvedTracks = uniq(out.unresolvedTracks);
    return out;
  }

  function state() {
    var s = JG.director.snapshot(), w = JG.world.snapshot(), loop = JG.loop, p = JG.player && JG.player.active && JG.player.position();
    var audio = null;
    try { audio = JG.audio && JG.audio.debug ? JG.audio.debug() : null; } catch (e) { audio = { error: String(e) }; }
    return Object.assign(s, {
      scene: w.scene, sceneState: w.sceneState, cast: w.cast,
      player: p ? { pos: [r3(p.x), r3(p.y), r3(p.z)], inBounds: JG.player.inBounds(p.x, p.z) } : null,
      camera: JG.camera.state(), fps: loop.info.fps, drawCalls: loop.info.calls, tris: loop.info.tris, ticks: loop.info.ticks,
      quality: loop.quality, audio: audio, errors: JG.errors.slice(), timeScale: loop.timeScale, auto: JG.director.auto,
      layout: loop.stageRect()
    });
  }

  dbg.install = function () {
    var g = window.__game = {
      ready: false,
      beats: function () {
        return JG.director.order().map(function (id) {
          var d = JG.beats.get(id) || {};
          return { id: id, kind: d.kind, skippable: !!d.skippable, skipTo: d.skipTo || null, est: d.est, stub: !!d.__stub };
        });
      },
      state: state,
      goto: function (id) { return JG.director.goto(id); },
      next: function () { return JG.director.next(); },
      skip: function () { return JG.director.skip(); },
      press: function (a) { return JG.input.inject(a, 'test'); },
      move: function (x, y) { JG.input.setVirtualMove(x === null || x === undefined ? null : x, y); },
      timeScale: function (n) { JG.loop.setTimeScale(n); return JG.loop.timeScale; },
      auto: function (m) { JG.director.setAuto(m); return JG.director.auto; },
      pause: function (b) { JG.loop.pause(b === undefined ? true : b); },
      step: function (n) { return JG.loop.step(n || 1); },
      waitFor: function (id, ms) {
        ms = ms || 30000;
        return new Promise(function (resolve) {
          var t0 = Date.now();
          (function check() {
            if (JG.director.state.beat === id && JG.director.state.phase === 'play') return resolve(true);
            if (Date.now() - t0 > ms) return resolve(false);
            setTimeout(check, 20);
          })();
        });
      },
      mute: function (b) { if (JG.audio && JG.audio.setMuted) JG.audio.setMuted(b === undefined ? true : !!b); },
      contract: contract,
      assets: assets
    };
    Object.defineProperty(g, 'log', { get: function () { return JG.director.log; } });
    Object.defineProperty(g, 'voLog', { get: function () { return JG.director.voLog; } });
    Object.defineProperty(g, 'marks', { get: function () { return JG.director.marks; } });
    return g;
  };

  /** #debug badge: beat, phase, fps, draw calls, triangles, quality, placeholder VO */
  dbg.showBadge = function (root) {
    if (dbg.badge) return;
    JG.css('debug', '.jg-debug{position:absolute;left:8px;bottom:8px;z-index:30;background:rgba(17,17,17,.8);color:#FFD21F;font:12px/1.35 Menlo,monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre}');
    var el = dbg.badge = document.createElement('div');
    el.className = 'jg-debug';
    root.appendChild(el);
    var acc = 0;
    JG.clock.everyTick(function (dt) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      var s = JG.director.state, L = JG.loop.info, ph = [];
      try { Object.keys(JG.LINES || {}).forEach(function (id) { if (JG.audio.vo.isPlaceholder(id)) ph.push(id); }); } catch (e) { /* audio may be partial */ }
      el.textContent = s.beat + ' / ' + s.phase + (s.mark ? ' / ' + s.mark : '') + '\n' + L.fps + ' fps  ' + L.calls + ' calls  ' + L.tris + ' tris  ' + JG.loop.quality +
        '\nplaceholder VO: ' + ph.length + '  stub hits: ' + JG.track.report().stubHits.length;
    });
  };
})();
