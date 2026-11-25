/* JG.clips: clips per rig (plan section 6, "Clips are baked per rig" and "Layering"). Engine only: it holds no
 * per-character data; clips-*.js files call define() and events(). Classic script; touches nothing at load.
 *
 *   library(name, rig)   a library clip for this rig: rotation tracks unchanged (they write the mannequin's local
 *                        rotations, rig.restQ; rig.rest is the reference/bind pose the helpers use), the hips position
 *                        track x rig.legRatio. Cached per rig. Tracks on bones the rig lacks are dropped, recorded in
 *                        JG.clips.unresolved[name] (for __game.assets().unresolvedTracks) and warned once.
 *   define(id, { duration, loop, additive?, keys: [{ t, pose: (P) => void }], ease? })
 *                        a code clip: each key's pose function runs on the rig's helper set P from reset()
 *   bake(id, rig)        runs each key's pose on the rig, reads every bone's local quaternion (and the hips position),
 *                        and returns an ordinary AnimationClip (additive ones through AnimationUtils.makeClipAdditive)
 *   compose(id, { base, over, mask })   a masked override baked into one base clip: base tracks for the bones outside
 *                        the mask, overlay tracks inside it, looping at the overlay's length
 *   mask(clip, 'upper' | 'lower' | [bones])   track filter
 *   events(clipId, [{ t, name }])   event table (footL, footR, impact, attach, shatter), library and code clips alike
 *   eventsFor(clipId)    the table, or []
 *   get(id, rig)         the clip for a contract id "<actor>.<clip>" (e.g. "roo.idle"): a library clip when the asset
 *                        build mapped it (clips GLB extras.contract, from tools/assets.config.json), else a composed
 *                        or code clip; cached per rig. Unknown ids warn once and return a 1 s rest-pose stub.
 * Clip names: library clips keep their library names; code and composed clips are named by their id. */
(function () {
  'use strict';
  var JG = window.JG;
  var LIBS = ['clips-ual1', 'clips-ual2'];
  var defs = {}, composes = {}, eventTables = {}, unresolved = {};
  var cache = new WeakMap();
  var UPPER_ROOTS = ['spine_01'], LOWER = ['root', 'pelvis', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'ball_leaf_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r', 'ball_leaf_r'];

  function per(rig) { var p = cache.get(rig); if (!p) cache.set(rig, p = {}); return p; }
  function libs() { return LIBS.filter(function (n) { return JG.assets && JG.assets.has(n); }).map(function (n) { return JG.assets.get(n).gltf; }); }
  function findLibrary(name) {
    var L = libs();
    for (var i = 0; i < L.length; i++) { var c = L[i].animations.find(function (a) { return a.name === name; }); if (c) return c; }
    return null;
  }
  function contractToLibrary(id) {
    var L = libs();
    for (var i = 0; i < L.length; i++) { var m = (L[i].scene.userData || {}).contract || {}; if (m[id]) return m[id]; }
    return null;
  }

  function library(name, rig) {
    var p = per(rig), key = 'lib:' + name;
    if (p[key]) return p[key];
    var src = findLibrary(name);
    if (!src) throw new Error('JG.clips.library: no library clip "' + name + '"');
    var clip = src.clone(), k = rig.legRatio || 1, dropped = [];
    clip.tracks.forEach(function (t) { if (t.name === 'pelvis.position') t.values = t.values.map(function (v) { return v * k; }); });
    clip.tracks = clip.tracks.filter(function (t) {
      var parts = t.name.split('.'), ok = !!rig.byName[parts[0]] && (parts[1] === 'quaternion' || t.name === 'pelvis.position');
      if (!ok && !rig.byName[parts[0]]) dropped.push(t.name);
      return ok;
    });
    if (dropped.length) {
      unresolved[name] = dropped;
      if (JG.warn) JG.warn('clip-unresolved:' + name, 'JG.clips.library(' + name + '): ' + dropped.length + ' tracks name bones this rig lacks: ' + dropped.slice(0, 4).join(', '));
    }
    return (p[key] = clip);
  }

  function define(id, def) {
    if (!def || !def.keys || !def.keys.length) throw new Error('JG.clips.define(' + id + '): keys required');
    defs[id] = def;
  }

  function bake(id, rig) {
    var THREE = window.THREE, def = defs[id];
    if (!def) throw new Error('JG.clips.bake: no code clip "' + id + '"');
    var P = rig.P, bones = rig.bones, keys = def.keys.slice().sort(function (a, b) { return a.t - b.t; });
    var times = keys.map(function (k) { return k.t; });
    var q = bones.map(function () { return []; }), hips = [];
    keys.forEach(function (k) {
      P.reset();
      k.pose(P);
      bones.forEach(function (b, i) { q[i].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); });
      var h = rig.byName.pelvis.position; hips.push(h.x, h.y, h.z);
    });
    P.reset();
    var tracks = [];
    bones.forEach(function (b, i) {
      var v = q[i], moved = false;
      for (var j = 4; j < v.length && !moved; j++) if (Math.abs(v[j] - v[j % 4]) > 1e-6) moved = true;
      var r = rig.rest[b.name].Lb;
      if (!moved && Math.abs(v[0] - r.x) + Math.abs(v[1] - r.y) + Math.abs(v[2] - r.z) + Math.abs(v[3] - r.w) < 1e-6) return;
      tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, v, def.ease === 'step' ? THREE.InterpolateDiscrete : undefined));
    });
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, hips));
    var clip = new THREE.AnimationClip(id, def.duration || times[times.length - 1] || 1, tracks);
    clip.userData = { loop: !!def.loop, code: true };
    if (def.additive) clip = THREE.AnimationUtils.makeClipAdditive(clip);
    return clip;
  }

  function maskSet(rig, m) {
    if (Array.isArray(m)) return new Set(m);
    var set = new Set();
    if (m === 'lower') LOWER.forEach(function (n) { set.add(n); });
    else if (m === 'upper') UPPER_ROOTS.forEach(function (n) { var b = rig.byName[n]; if (b) b.traverse(function (o) { if (o.isBone) set.add(o.name); }); });
    else throw new Error('JG.clips.mask: unknown mask ' + m);
    return set;
  }
  function mask(clip, m, rig) {
    var set = maskSet(rig || { byName: {} }, m), out = clip.clone();
    out.tracks = out.tracks.filter(function (t) { return set.has(t.name.split('.')[0]); });
    return out;
  }

  function compose(id, spec) { composes[id] = spec; }
  function bakeCompose(id, rig) {
    var THREE = window.THREE, spec = composes[id];
    var base = get(spec.base, rig), over = get(spec.over, rig), set = maskSet(rig, spec.mask);
    var T = over.duration || 1, fps = 30, n = Math.max(2, Math.round(T * fps) + 1), times = [], i;
    for (i = 0; i < n; i++) times.push(i * T / (n - 1));
    var tracks = over.tracks.filter(function (t) { return set.has(t.name.split('.')[0]); }).map(function (t) { return t.clone(); });
    // base tracks outside the mask, resampled over the overlay's length, wrapping at the base's own length
    base.tracks.forEach(function (t) {
      if (set.has(t.name.split('.')[0])) return;
      var it = t.createInterpolant(), size = t.getValueSize(), vals = new Float32Array(n * size);
      for (i = 0; i < n; i++) { var r = it.evaluate(base.duration ? times[i] % base.duration : 0); vals.set(r, i * size); }
      tracks.push(new t.constructor(t.name, times.slice(), vals));
    });
    var clip = new THREE.AnimationClip(id, T, tracks);
    clip.userData = { loop: true, composed: spec };
    return clip;
  }

  function events(clipId, table) { eventTables[clipId] = (table || []).slice().sort(function (a, b) { return a.t - b.t; }); }
  function eventsFor(clipId) { return eventTables[clipId] || []; }

  function stub(id, rig) {
    if (JG.warn) JG.warn('clip-stub:' + id, 'JG.clips.get: no clip for "' + id + '"; using a 1 s rest-pose stub');
    var THREE = window.THREE;
    var clip = new THREE.AnimationClip(id, 1, [new THREE.QuaternionKeyframeTrack('pelvis.quaternion', [0], rig.rest.pelvis.Lb.toArray())]);
    clip.userData = { stub: true, loop: true };
    return clip;
  }

  function get(id, rig) {
    var p = per(rig);
    if (p[id]) return p[id];
    var clip, lib = contractToLibrary(id);
    if (lib) { clip = library(lib, rig).clone(); clip.name = id; clip.userData = { library: lib, loop: /_Loop$/.test(lib) }; }
    else if (composes[id]) clip = bakeCompose(id, rig);
    else if (defs[id]) clip = bake(id, rig);
    else if (findLibrary(id)) { clip = library(id, rig); }
    else clip = stub(id, rig);
    return (p[id] = clip);
  }
  function has(id) { return !!(contractToLibrary(id) || composes[id] || defs[id]); }

  JG.clips = { unresolved: unresolved, library: library, define: define, bake: bake, compose: compose, mask: mask, events: events, eventsFor: eventsFor, get: get, has: has,
    _defs: defs, _composes: composes };
})();
