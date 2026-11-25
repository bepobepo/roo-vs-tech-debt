/* JG.world (plan sections 5 and 6): the one THREE.Scene, the sets (attach/detach), the cast manager, stage apply and
 * cleanSlate. Classic script; creates THREE objects only in init().
 *
 *   init(kit)                      builds the scene, the persistent lights and fog
 *   set(sceneId | null) -> SceneInstance | null     builds once (registered scene, else the greybox stub), attaches it
 *                                  and removes every other set from the scene graph
 *   inst(id?)  current  sceneState (merged canonical state of the current set)
 *   setState(patch, sec) -> {duration}   forwards to the current SceneInstance and records the merged state
 *   marker(name) -> {pos: Vector3, yaw} | null     looked up in the current set first, then every built set
 *   zone(name)  path(name) -> [Vector3]  zoneCenter(name)  inZone(name, pos)  walkRects(beatId)  camPreset(beatId)
 *   prop(name)  surfaceAt(x, z)
 *   actor(id) -> Actor              creates on first use: a registered character, else the stub (capsule or base body);
 *                                   ids like 'extra1' or 'extra:2' are instances of character 'extra'
 *   hasActor(id)  castIds()  addToStage(actor)  removeFromStage(actor)
 *   applyStage(stage, entryKind, beat)    the canonical entry state (section 6): scene, sceneState, cast, audio, ui
 *   cleanSlate()                   audio.reset, ui.reset, actor.reset, kill beat tweens and shake, input mode 'cine'
 *   update(dt)                     player, scene, staged actors
 *
 * Stage cast entry: {at: marker | [x,y,z], pose, expr?, props?: {headphones: 'head'}, look?, cape?}. pose names a
 * contract clip (played looping) or a pose (actor.pose). Entry 'jump' snaps and calls actor.teleport(); entry 'flow'
 * tweens an actor that is already on stage within 1.5 m of its mark over 0.3 s, and snaps otherwise.
 * stage.scene === undefined keeps the current set; null shows none. stage.cast === undefined keeps the cast.
 * stage.cam: an optional shot (anything camera.cut takes) applied after the cast, instead of the default framing.
 * stage.freeze: true (the tagline): entered by 'flow', applyStage/cleanSlate leave scene, cast, camera and the stage
 * panel exactly as the previous beat left them (audio and the rest of the UI are still reset and applied); entered
 * by a jump, the stage's scene, cast, cam and ui build the frozen frame from scratch. */
(function () {
  'use strict';
  var JG = window.JG;
  var V;

  var sets = {}, actors = {}, staged = {}, lights = null, qualityHooked = false;
  var world = JG.world = {
    scene: null, kit: null, current: null, currentId: null, sceneState: {},

    init: function (kit) {
      var THREE = window.THREE;
      V = THREE.Vector3;
      world.kit = kit;
      var s = world.scene = new THREE.Scene();
      s.background = new THREE.Color(0x9fb8d8);
      var hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.2);
      var sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-6, 12, 8);
      s.add(hemi); s.add(sun); s.add(sun.target);
      s.fog = new THREE.Fog(0x9fb8d8, 60, 260);
      lights = { hemi: hemi, sun: sun };
    },

    // ---------- sets ----------
    set: function (id) {
      if (id === undefined) return world.current;
      if (id === world.currentId && world.current) return world.current;
      if (world.current && world.current.root) world.scene.remove(world.current.root);
      world.current = null; world.currentId = null; world.sceneState = {};
      if (id === null) return null;
      var inst = world.inst(id);
      if (!inst) return null;
      if (inst.root) world.scene.add(inst.root);
      world.current = inst; world.currentId = id;
      applyLighting(inst.lighting);
      JG.emit('scene', id);
      return inst;
    },
    inst: function (id) {
      if (!id) return world.current;
      if (sets[id]) return sets[id];
      if (JG.CONTRACT) JG.track.check('scene', id, JG.CONTRACT.scenes);
      var def = JG.scenes.get(id), inst = null;
      if (def && !def.__stub) {
        try { inst = def.build(world.kit); } catch (e) { JG.error('scene ' + id + ' build', e); inst = null; }
      }
      if (!inst) { JG.track.stub('scene', id, 'greybox'); inst = JG.stubs.scene(id, world.kit); }
      normalise(inst, id);
      sets[id] = inst;
      return inst;
    },
    setState: function (patch, sec) {
      var inst = world.current;
      if (!inst || !patch) return { duration: 0 };
      checkState(world.currentId, patch);
      Object.assign(world.sceneState, patch);
      var r = null;
      try { r = inst.setState ? inst.setState(patch, sec || 0) : null; } catch (e) { JG.error('scene.setState', e); }
      if (patch.area && inst.areas && inst.areas[patch.area] && inst.areas[patch.area].lighting) applyLighting(inst.areas[patch.area].lighting);
      return r && typeof r.duration === 'number' ? r : { duration: sec || 0 };
    },

    // ---------- markers, zones, paths ----------
    marker: function (name) {
      var m = findIn('markers', name);
      if (!m) return null;
      return { pos: Array.isArray(m.pos) ? new V().fromArray(m.pos) : new V().copy(m.pos), yaw: m.yaw || 0, name: name };
    },
    zone: function (name) { return findIn('zones', name); },
    zoneCenter: function (name) {
      var z = world.zone(name);
      if (!z) return null;
      if (z.type === 'circle') return new V(z.center[0], 0, z.center.length > 2 ? z.center[2] : z.center[1]);
      return new V((z.min[0] + z.max[0]) / 2, 0, (z.min[1] + z.max[1]) / 2);
    },
    inZone: function (name, pos) {
      var z = world.zone(name);
      if (!z || !pos) return false;
      if (z.type === 'circle') {
        var cx = z.center[0], cz = z.center.length > 2 ? z.center[2] : z.center[1], dx = pos.x - cx, dz = pos.z - cz;
        return dx * dx + dz * dz <= z.r * z.r;
      }
      return pos.x >= z.min[0] && pos.x <= z.max[0] && pos.z >= z.min[1] && pos.z <= z.max[1];
    },
    path: function (name) {
      var p = findIn('paths', name);
      if (!p) return null;
      return p.map(function (pt) {
        if (typeof pt === 'string') { var m = world.marker(pt); if (!m) { JG.track.missing('marker', pt); return new V(); } return m.pos; }
        return new V().fromArray(pt);
      });
    },
    walkRects: function (beatId) { var c = world.current; return c && c.walk && c.walk[beatId] || null; },
    camPreset: function (beatId) { var c = world.current; return c && c.camPresets && c.camPresets[beatId] || null; },
    prop: function (name) {
      var c = world.current, p = c && c.props && c.props[name];
      if (p) return p;
      JG.track.stub('prop', name);
      return { object: null, anchors: {} };
    },
    surfaceAt: function (x, z) {
      var c = world.current;
      try { return c && c.surfaceAt ? c.surfaceAt(x, z) : 'hard'; } catch (e) { return 'hard'; }
    },

    // ---------- cast ----------
    actor: function (id) {
      if (actors[id]) return actors[id];
      var m = /^([a-z]+?)(?::?(\d+))?$/i.exec(id) || [id, id, ''];
      var base = m[1], instance = m[2] ? +m[2] : 0;
      if (JG.CONTRACT) JG.track.check('actor', base, JG.CONTRACT.actors);
      var reg = JG.characters.get(base), a = null;
      if (reg && !reg.__stub) {
        try { a = reg.factory(world.kit, { id: id, base: base, instance: instance, data: reg.data }); } catch (e) { JG.error('character ' + base, e); a = null; }
      }
      if (!a) { a = JG.stubs.actor(base, world.kit, { id: id, instance: instance }); }
      a.id = a.id || id;
      a.castId = id;
      a.base = base;
      actors[id] = a;
      if (a.on) a.on(function (ev) { onActorEvent(a, ev); });
      if (a.setQuality && JG.loop) call('actor.setQuality', function () { a.setQuality(JG.loop.quality); });
      if (!qualityHooked) { qualityHooked = true; JG.on('quality', function (tier) { Object.keys(actors).forEach(function (k) { call('actor.setQuality', function () { actors[k].setQuality(tier); }); }); }); }
      return a;
    },
    hasActor: function (id) { return !!actors[id]; },
    castIds: function () { return Object.keys(staged); },
    staged: function (id) { return !!staged[id]; },
    addToStage: function (a) { if (!a.root.parent) world.scene.add(a.root); staged[a.castId || a.id] = a; },
    removeFromStage: function (a) { if (a.root.parent) a.root.parent.remove(a.root); delete staged[a.castId || a.id]; },

    applyStage: function (stage, entryKind, beat, opts) {
      stage = stage || {};
      var jump = entryKind !== 'flow', freeze = !!(opts && opts.freeze);
      if (!freeze) {
        if (stage.scene !== undefined) world.set(stage.scene);
        if (stage.sceneState && world.current) {
          world.sceneState = {};
          world.setState(stage.sceneState, 0);
        }
        if (stage.cast !== undefined) stageCast(stage.cast || {}, jump);
      }
      var au = stage.audio, audio = JG.audio;
      if (au && audio) call('stage audio', function () {
        if (au.music !== undefined) { if (au.music) audio.music.play(au.music, {}); else audio.music.stop(0); }
        if (au.musicFx !== undefined) audio.music.fx(au.musicFx || null, 0);
        if (au.ambience !== undefined) audio.ambience(au.ambience || null, 0.5);
        (au.loops || []).forEach(function (id) { audio.loop(id, {}); });
      });
      var u = stage.ui, ui = JG.ui;
      if (u && ui) call('stage ui', function () {
        if (u.letterbox !== undefined) ui.letterbox.set(!!u.letterbox);
        if (u.fade !== undefined) ui.fade.to(+u.fade || 0, 0, u.fadeColor);
        if (u.radar !== undefined) { if (u.radar) { ui.radar.setState(u.radar); ui.radar.show(); } else ui.radar.hide(); }
        if (u.callerCard !== undefined) { if (u.callerCard) ui.callerCard.show(u.callerCard); else ui.callerCard.hide(); }
        if (u.stagePanel !== undefined && ui.stagePanel) ui.stagePanel(!!u.stagePanel);
      });
      // camera: stage.cam (a shot, as w.cut takes) if given; else follow Roo on play beats and frame the cast otherwise
      // (a beat's own cut replaces it). A frozen entry keeps the previous camera.
      var cam = JG.camera;
      if (cam && world.current && !freeze) {
        if (stage.cam) call('stage cam', function () { cam.cut(stage.cam); });
        else if (beat && beat.kind === 'play' && staged.roo) cam.follow(staged.roo, world.camPreset(beat.id) || undefined);
        else cam.frame(Object.keys(staged).map(function (k) { return staged[k]; }));
      }
    },

    /** opts.freeze (a stage.freeze beat entered by flow): keep actors, camera and the stage panel as they are */
    cleanSlate: function (opts) {
      var freeze = !!(opts && opts.freeze);
      call('audio.reset', function () { if (JG.audio) JG.audio.reset(); });
      call('ui.reset', function () { if (JG.ui) JG.ui.reset(freeze ? { keepStage: true } : undefined); });
      if (!freeze) Object.keys(actors).forEach(function (id) { call('actor.reset ' + id, function () { actors[id].reset(); }); });
      JG.clock.killTweens('beat');
      if (JG.camera) { JG.camera.stopShake(); if (!freeze) JG.camera.reset(); }
      if (JG.player) JG.player.stop();
      if (JG.input) JG.input.setMode('cine');
    },

    update: function (dt) {
      if (JG.player) JG.player.update(dt);
      var c = world.current;
      if (c && c.update) call('scene.update', function () { c.update(dt, JG.clock.t, { camera: JG.camera && JG.camera.object, quality: JG.loop && JG.loop.quality }); });
      var ctx = { t: JG.clock.t, camera: JG.camera && JG.camera.object };
      Object.keys(staged).forEach(function (id) { var a = staged[id]; call('actor.update ' + id, function () { a.update(dt, ctx); }); });
    },

    /** a snapshot of the declarative state, for __game.state() and the state hash */
    snapshot: function () {
      var cast = {};
      Object.keys(staged).sort().forEach(function (id) { // sorted, so a JSON state hash does not depend on entry history
        var a = staged[id], p = a.root.position;
        cast[id] = { pos: [r2(p.x), r2(p.y), r2(p.z)], yaw: r2(a.root.rotation.y), actions: a.debug ? a.debug().actions : undefined };
      });
      return { scene: world.currentId, sceneState: Object.assign({}, world.sceneState), cast: cast };
    }
  };
  function r2(x) { return Math.round(x * 100) / 100; }
  function call(where, fn) { try { fn(); } catch (e) { JG.error(where, e); } }

  function findIn(kind, name) {
    var c = world.current;
    if (c && c[kind] && c[kind][name]) return c[kind][name];
    var ids = Object.keys(sets);
    for (var i = 0; i < ids.length; i++) { var s = sets[ids[i]]; if (s[kind] && s[kind][name]) return s[kind][name]; }
    if (JG.CONTRACT) {
      var listed = false, lists = JG.CONTRACT[kind] || {};
      Object.keys(lists).forEach(function (k) { if (lists[k].indexOf(name) >= 0) listed = true; });
      if (!listed) JG.track.missing(kind.replace(/s$/, ''), name);
      else JG.track.stub(kind.replace(/s$/, ''), name, 'not provided by the set');
    }
    return null;
  }

  function checkState(sceneId, patch) {
    var C = JG.CONTRACT && JG.CONTRACT.sceneState && JG.CONTRACT.sceneState[sceneId];
    if (!C) return;
    Object.keys(patch).forEach(function (k) {
      if (!C[k]) { JG.track.missing('sceneState', sceneId + '.' + k); return; }
      var v = patch[k];
      if (C[k].indexOf(v) < 0 && !(typeof v === 'number' && C[k].length === 2 && typeof C[k][0] === 'number' && v >= C[k][0] && v <= C[k][1])) JG.track.missing('sceneState', sceneId + '.' + k + '=' + v);
    });
  }

  function normalise(inst, id) {
    inst.id = inst.id || id;
    ['markers', 'paths', 'zones', 'walk', 'camPresets', 'props', 'areas'].forEach(function (k) { inst[k] = inst[k] || {}; });
    Object.keys(inst.zones).forEach(function (k) { var z = inst.zones[k]; if (!z.type) z.type = z.r ? 'circle' : 'box'; });
  }

  var tmpFog = null;
  function applyLighting(L) {
    if (!L || !lights) return;
    var THREE = window.THREE, s = world.scene;
    if (L.background !== undefined) s.background = new THREE.Color(L.background);
    if (L.hemi) { if (L.hemi.sky !== undefined) lights.hemi.color.set(L.hemi.sky); if (L.hemi.ground !== undefined) lights.hemi.groundColor.set(L.hemi.ground); if (L.hemi.intensity !== undefined) lights.hemi.intensity = L.hemi.intensity; }
    if (L.sun) { if (L.sun.color !== undefined) lights.sun.color.set(L.sun.color); if (L.sun.intensity !== undefined) lights.sun.intensity = L.sun.intensity; if (L.sun.pos) lights.sun.position.fromArray(L.sun.pos); }
    if (L.fog) { if (!s.fog) s.fog = new THREE.Fog(0xffffff, 10, 100); s.fog.color.set(L.fog.color !== undefined ? L.fog.color : (L.background || 0xffffff)); s.fog.near = L.fog.near || 30; s.fog.far = L.fog.far || 200; }
    else if (L.fog === null) s.fog = null;
    tmpFog = s.fog;
  }

  function resolveLookTarget(t) {
    if (t === null || t === undefined) return null;
    if (t === 'camera') return JG.camera.object;
    if (typeof t === 'string') {
      if (actors[t]) return (actors[t].anchors && actors[t].anchors.head) || actors[t].root;
      var m = world.marker(t);
      return m ? m.pos.add(new V(0, 1.5, 0)) : null;
    }
    if (Array.isArray(t)) return new V().fromArray(t);
    return t;
  }
  world.lookTarget = resolveLookTarget;

  function stageCast(cast, jump) {
    var want = {};
    Object.keys(cast).forEach(function (id) { want[id] = true; });
    Object.keys(staged).forEach(function (id) { if (!want[id]) world.removeFromStage(staged[id]); });
    var THREE = window.THREE;
    Object.keys(cast).forEach(function (id) {
      var spec = cast[id] || {}, a = world.actor(id);
      var wasOn = !!staged[id];
      world.addToStage(a);
      var at = spec.at, pos = null, yaw = null;
      if (typeof at === 'string') { var m = world.marker(at); if (m) { pos = m.pos; yaw = m.yaw; } }
      else if (Array.isArray(at)) pos = new THREE.Vector3().fromArray(at);
      else if (at && at.pos) { pos = new THREE.Vector3().fromArray(at.pos); yaw = at.yaw; }
      if (spec.yaw !== undefined) yaw = spec.yaw;
      if (pos) {
        var soft = !jump && wasOn && a.root.position.distanceTo(pos) < 1.5;
        if (soft) {
          JG.clock.tween(a.root.position, { x: pos.x, y: pos.y, z: pos.z }, 0.3, 'inOutQuad', 'beat');
          if (yaw !== null && yaw !== undefined) a.root.rotation.y = yaw;
        } else {
          a.root.position.copy(pos);
          if (yaw !== null && yaw !== undefined) a.root.rotation.y = yaw;
          a.root.updateMatrixWorld(true);
          if (a.teleport) call('teleport', function () { a.teleport(); });
        }
      }
      call('stage pose ' + id, function () { stagePose(a, spec.pose || 'idle'); });
      if (spec.expr) call('expr', function () { a.setExpression(spec.expr, 0); });
      if (spec.props) Object.keys(spec.props).forEach(function (p) { call('attach', function () { a.attach(p, spec.props[p]); }); });
      if (spec.look !== undefined) call('look', function () { a.lookAt(resolveLookTarget(spec.look)); });
      if (spec.cape) call('cape', function () { a.setCape(spec.cape); });
    });
  }
  function stagePose(a, name) {
    var base = a.base || a.id, C = JG.CONTRACT;
    var isClip = C && C.clips && C.clips[base] && C.clips[base].indexOf(name) >= 0;
    if (isClip || name === 'idle') a.play(name, { loop: true, fade: 0 });
    else a.pose(name, 0);
  }

  function onActorEvent(a, ev) {
    if ((ev === 'footL' || ev === 'footR') && JG.audio && staged[a.castId || a.id]) {
      var p = a.root.position, surf = world.surfaceAt(p.x, p.z);
      call('footstep', function () { JG.audio.sfx(surf === 'carpet' ? 'step_carpet' : 'step_hard', { volume: 0.5 }); });
    }
  }
})();
