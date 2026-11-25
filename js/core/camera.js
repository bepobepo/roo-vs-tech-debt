/* JG.camera (plan section 6, Camera). One PerspectiveCamera; cinematic shots, roam rails, shake, aspect-aware FOV.
 * Classic script; creates THREE objects only in init().
 *
 * Shot = {scene?, pos: [x,y,z], look: [x,y,z], fov = 40, rel?: markerName | actorId, fit?: [anchor refs]}
 *   - shots live in JG.shots (E2's shots.js) by id; an unknown id gets a stub framing (JG.stubs.shot) and a stub hit;
 *   - with rel, pos and look are in the marker's (or actor root's) frame: rotated by its yaw, then translated;
 *   - fit: ['roo.head', 'ops.chest', ...] (actorId.anchor) pulls the camera back along its view line until every
 *     anchor is inside the frame with a 10% margin.
 * FollowPreset = {yaw, dist, height, lookHeight, lag, rail?}: the camera sits dist behind the target along yaw
 *   (yaw = the direction the camera looks; 0 looks along +Z), height above its feet, looking at lookHeight; lag is the
 *   smoothing time constant in seconds. No pointer lock or orbit; the yaw never changes. rail is ignored at Stage 1.
 * Follow collision: the current set's camColliders ([{min, max, thin?, mesh?}] world AABBs, built by JG.setkit's
 *   builder; mesh gates it by visibility) keep the follow camera out of the set. Each tick a sphere (0.3 m) is cast
 *   level from above Roo, at the wanted height, back to the wanted position and the camera pulls in to the first
 *   solid hit, so it keeps its height; if Roo's chest or head cannot see that spot, the cast runs from the look point
 *   instead and pulls in front of whatever would hide his head. Pulled in, the aim rises toward his head (as far as
 *   keeps it in frame) and within 1.2 m of it the fov opens by up to 10 degrees. Pulling in eases fast (0.1 s), letting out slowly
 *   (0.45 s), and a hard 0.12 m cast from the look point clamps the camera at once so it is never inside a collider.
 *   Thin colliders (posts, rails, street lights) only keep the camera out of themselves. Shots and moves ignore it.
 *   A handful of casts per tick against the set's AABBs only (never actors); deterministic.
 * FOV: a shot's fov is the vertical FOV at 16:9. At narrower aspects the horizontal FOV is held (vertical grows),
 *   capped at 90 degrees vertical; wider aspects keep the vertical FOV.
 *
 *   init()  setAspect(a)  cut(shot)  move(shot, sec, ease) -> {duration, stop()}  follow(actor, preset)  unfollow()
 *   shake(amp, sec) -> {duration, stop()}  stopShake()  frame(actors)  resolve(shot) -> {pos, look, fov}
 *   update(dt)  yaw() -> radians  state() -> {pos, look, fov, mode}  object */
(function () {
  'use strict';
  var JG = window.JG;
  var DEG = Math.PI / 180, REF_ASPECT = 16 / 9;

  var V = null, cur = null, mv = null, fol = null, shk = null;
  var cam = JG.camera = {
    object: null, aspect: REF_ASPECT, mode: 'cut',
    init: function () {
      var THREE = window.THREE;
      V = THREE.Vector3;
      cam.object = new THREE.PerspectiveCamera(40, cam.aspect, 0.05, 600);
      cur = { pos: new V(0, 2, 6), look: new V(0, 1, 0), fov: 40 };
      apply();
    },
    setAspect: function (a) { cam.aspect = a || REF_ASPECT; if (cam.object) { cam.object.aspect = cam.aspect; apply(); } },
    resolve: resolve,
    cut: function (shot) {
      var s = resolve(shot);
      mv = null; fol = null; cam.mode = 'cut';
      cur.pos.copy(s.pos); cur.look.copy(s.look); cur.fov = s.fov;
      apply();
      return { duration: 0, stop: function () {} };
    },
    move: function (shot, sec, ease) {
      var s = resolve(shot);
      fol = null; cam.mode = 'move';
      var m = mv = { from: { pos: cur.pos.clone(), look: cur.look.clone(), fov: cur.fov }, to: s };
      var h = JG.clock.tweenFn(sec, function (k) {
        if (mv !== m) return;
        cur.pos.lerpVectors(m.from.pos, m.to.pos, k);
        cur.look.lerpVectors(m.from.look, m.to.look, k);
        cur.fov = m.from.fov + (m.to.fov - m.from.fov) * k;
      }, ease || 'inOutSine', 'beat');
      return { duration: sec, done: h.done, stop: function () { h.stop(false); if (mv === m) mv = null; } };
    },
    follow: function (actor, preset) {
      mv = null;
      var p = Object.assign({ yaw: 0, dist: 5, height: 2.4, lookHeight: 1.2, lag: 0.25 }, preset || {});
      fol = { actor: actor, p: p, snapped: false, ideal: new V(), off: new V(), aim: new V(), fovAdd: 0 };
      cam.mode = 'follow';
      followStep(0, true);
      apply(); // the camera object takes the follow pose and fov now, not on the next tick
    },
    unfollow: function () { fol = null; if (cam.mode === 'follow') cam.mode = 'cut'; },
    shake: function (amp, sec) {
      var s = shk = { amp: amp || 0.1, sec: sec || 0.4, t: 0 };
      return { duration: s.sec, stop: function () { if (shk === s) shk = null; } };
    },
    stopShake: function () { shk = null; },
    /** default framing of a set of actors (stage entry for cine beats until a beat cuts) */
    frame: function (actors, opts) {
      opts = opts || {};
      actors = (actors || []).filter(function (a) { return a && a.root && a.root.parent; });
      if (!actors.length) return;
      var c = new V(), n = 0, minY = Infinity, maxY = -Infinity;
      actors.forEach(function (a) { var p = a.root.getWorldPosition(new V()); c.add(p); n++; minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + (a.height || 1.7)); });
      c.multiplyScalar(1 / n);
      var spread = 0;
      actors.forEach(function (a) { spread = Math.max(spread, a.root.getWorldPosition(new V()).distanceTo(c)); });
      // in front of the lead actor (it faces +Z at yaw 0), a little to one side
      var lead = actors[0], yaw = lead.root.rotation.y + (opts.side !== undefined ? opts.side : 0.45);
      var dist = Math.max(3.2, spread * 2.2 + 2.6), look = new V(c.x, minY + Math.min(1.25, (maxY - minY) * 0.6), c.z);
      var pos = new V(look.x + Math.sin(yaw) * dist, look.y + 0.5, look.z + Math.cos(yaw) * dist);
      // a set may name a default camera spot '<sceneId>.cam' (the subway does: its walls are close)
      var w = JG.world, inst = w && w.current, cm = inst && inst.markers && inst.markers[w.currentId + '.cam'];
      if (cm) pos.fromArray(cm.pos);
      cam.cut({ pos: pos.toArray(), look: look.toArray(), fov: 40 });
    },
    yaw: function () {
      var dx = cur.look.x - cur.pos.x, dz = cur.look.z - cur.pos.z;
      if (fol) return fol.p.yaw;
      return Math.atan2(dx, dz);
    },
    update: function (dt) {
      if (!cam.object) return;
      if (fol) followStep(dt, false);
      apply(dt);
    },
    reset: function () { mv = null; fol = null; shk = null; cam.mode = 'cut'; },
    state: function () {
      return { pos: cur ? cur.pos.toArray().map(r3) : null, look: cur ? cur.look.toArray().map(r3) : null, fov: cam.object ? r3(cam.object.fov) : null, mode: cam.mode };
    }
  };
  function r3(x) { return Math.round(x * 1000) / 1000; }

  function followStep(dt, snap) {
    var a = fol.actor, p = fol.p;
    if (!a || !a.root) return;
    var t = a.root.getWorldPosition(new V());
    var want = new V(t.x - Math.sin(p.yaw) * p.dist, t.y + p.height, t.z - Math.cos(p.yaw) * p.dist);
    var look = new V(t.x, t.y + p.lookHeight, t.z);
    var first = snap || !fol.snapped;
    fol.trueLook = look;
    var k = first ? 1 : 1 - Math.exp(-dt / Math.max(0.01, p.lag));
    fol.snapped = true;
    if (first) fol.ideal.copy(want); else fol.ideal.lerp(want, k);
    cur.look.lerp(look, k);
    // The lagged look point trails Roo and can slide into a collider he walks around; cast() ignores a collider
    // that holds the ray origin, so the camera could then end up inside it. Keep the look point on Roo's side:
    // clamp it to the free part of the segment from his true look point.
    var w = JG.world, inst = w && w.current, list = inst && inst.camColliders;
    if (list && list.length && !first) {
      prepColliders(list, look);
      var gap = look.distanceTo(cur.look);
      if (gap > 1e-4) {
        var free = freeLen(list, look, cur.look, 0);
        if (free < gap) cur.look.lerpVectors(look, cur.look, Math.max(0, free - 0.05) / gap);
      }
      if (insideSolid(list, cur.look)) cur.look.copy(look);
    }
    cur.pos.copy(fol.ideal);
    collide(a, t, first, dt);
    cur.fov = (p.fov || 45) + (fol.fovAdd || 0);
  }

  // ---------- follow collision (see the header) ----------
  var COL_R = 0.3, HARD_R = 0.12, HEAD_R = 0.1, MIN_D = 0.6, IN_TC = 0.22, OUT_TC = 0.45; // IN_TC 0.1 read as a jump cut past the plaza arch
  var O = [0, 0, 0], D = [0, 0, 0], T0 = 0, T1 = 0;
  /** colliders in play this frame: visible ones, minus any that hold Roo's own look point (a prop he can walk into;
   *  cast() ignores a box holding the ray origin, so it would otherwise pull the camera onto the look point) */
  function prepColliders(list, look) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      c.on = !c.mesh || shown(c.mesh);
      if (c.on && look && look.x > c.min[0] && look.x < c.max[0] && look.y > c.min[1] && look.y < c.max[1] && look.z > c.min[2] && look.z < c.max[2]) c.on = false;
    }
  }
  function shown(o) { for (; o; o = o.parent) { if (!o.visible) return false; } return true; }
  /** slab test of the ray O + s D against the box grown by r; sets T0, T1 */
  function rayBox(mn, mx, r) {
    var t0 = -Infinity, t1 = Infinity;
    for (var i = 0; i < 3; i++) {
      var lo = mn[i] - r, hi = mx[i] + r;
      if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo || O[i] > hi) return false; continue; }
      var u = (lo - O[i]) / D[i], v = (hi - O[i]) / D[i];
      if (u > v) { var x = u; u = v; v = x; }
      if (u > t0) t0 = u;
      if (v < t1) t1 = v;
      if (t0 > t1 || t1 < 0) return false;
    }
    T0 = t0; T1 = t1;
    return true;
  }
  /** distance along the ray (O, D) to the first solid collider grown by r, up to len. A collider whose grown box
   *  holds the origin is tested ungrown; one whose own box holds it (the ray starts inside) is ignored. */
  function cast(list, len, r) {
    var best = len;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.thin || !c.on) continue;
      if (!rayBox(c.min, c.max, r)) continue;
      if (T0 <= 0) { if (!r || !rayBox(c.min, c.max, 0) || T0 <= 0) continue; }
      if (T0 < best) best = T0;
    }
    return best;
  }
  /** a thin collider (grown by r) holding the camera at distance d pushes it to its near face; returns d */
  function pushThin(list, d, r) {
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c.thin || !c.on || !rayBox(c.min, c.max, r)) continue;
        if (T0 > 0 && d > T0 && d < T1) { d = T0; moved = true; }
      }
      if (!moved) break;
    }
    return d;
  }
  function setRay(from, dir) { O[0] = from.x; O[1] = from.y; O[2] = from.z; D[0] = dir.x; D[1] = dir.y; D[2] = dir.z; }
  /** the free length of the segment from -> to for a sphere of radius r (solid colliders) */
  function freeLen(list, from, to, r) {
    var d = new V().subVectors(to, from), l = d.length();
    if (l < 1e-4) return 0;
    setRay(from, d.multiplyScalar(1 / l));
    return cast(list, l, r);
  }
  function insideSolid(list, p) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.thin && c.on && p.x > c.min[0] && p.x < c.max[0] && p.y > c.min[1] && p.y < c.max[1] && p.z > c.min[2] && p.z < c.max[2]) return true;
    }
    return false;
  }
  /** where the camera may stand: first along the level line from above Roo (the pivot, at the wanted height) back to
   *  the wanted spot, which keeps the preset's height and pitch; if the chest or head cannot see that spot, along
   *  the line from the look point instead, pulled in front of whatever hides the head */
  function resolveSpot(list, o, ideal, head) {
    var pv = new V(o.x, ideal.y, o.z), lv = ideal.distanceTo(pv), level = null;
    if (!insideSolid(list, pv)) {
      var c = pv.clone().lerp(ideal, lv > 1e-4 ? freeLen(list, pv, ideal, COL_R) / lv : 1);
      var lc = c.distanceTo(o), lh = c.distanceTo(head);
      if (freeLen(list, o, c, HEAD_R) >= lc - 1e-4 && freeLen(list, head, c, HEAD_R) >= lh - 1e-4) level = c;
    }
    if (level && level.distanceToSquared(ideal) < 1e-6) return level;
    var dir = new V().subVectors(ideal, o), len = dir.length();
    if (len < 1e-4) return ideal.clone();
    dir.multiplyScalar(1 / len);
    var want = freeLen(list, o, ideal, COL_R), cand = o.clone().addScaledVector(dir, want);
    var hd = new V().subVectors(cand, head), hl = hd.length();
    if (hl > 1e-4) {
      hd.multiplyScalar(1 / hl);
      setRay(head, hd);
      var hh = cast(list, hl, HEAD_R);
      if (hh < hl) want = Math.min(want, Math.max(MIN_D, head.clone().addScaledVector(hd, hh).sub(o).dot(dir) - COL_R));
    }
    var slant = o.clone().addScaledVector(dir, want);
    // the nearer of the two to the wanted spot (both see Roo)
    return level && level.distanceToSquared(ideal) <= slant.distanceToSquared(ideal) ? level : slant;
  }
  /** fol.off (camera minus look point) eases toward the resolved spot: fast when it comes in, slowly when it goes
   *  back out; then a hard cast from the look point clamps it out of every collider at once */
  function collide(a, t, snap, dt) {
    var w = JG.world, inst = w && w.current, list = inst && inst.camColliders, o = cur.look;
    fol.aim.copy(o);
    if (!list || !list.length) { fol.off.subVectors(fol.ideal, o); fol.fovAdd = 0; return; }
    prepColliders(list, fol.trueLook);
    var head = a.anchors && a.anchors.head ? a.anchors.head.getWorldPosition(new V()) : new V(t.x, t.y + (a.height || 1.7) * 0.92, t.z);
    var tgt = resolveSpot(list, o, fol.ideal, head).sub(o);
    if (snap) fol.off.copy(tgt);
    else fol.off.lerp(tgt, 1 - Math.exp(-(dt || 0) / (tgt.lengthSq() < fol.off.lengthSq() - 1e-6 ? IN_TC : OUT_TC)));
    var len = fol.off.length();
    if (len > 1e-4) {
      var dir = fol.off.clone().multiplyScalar(1 / len);
      setRay(o, dir);
      var d = pushThin(list, Math.min(len, cast(list, len, HARD_R)), HARD_R);
      if (d < len) fol.off.copy(dir).multiplyScalar(d);
    }
    cur.pos.copy(o).add(fol.off);
    // pulled in, the aim rises toward the head so a close camera still frames his head
    var full = fol.ideal.distanceTo(o), k = full > 1e-4 ? Math.max(0, Math.min(1, 1 - fol.off.length() / full)) : 0;
    fol.aim.copy(o).lerp(head, k * 0.6);
    // very close (a roof edge, a monitor): the fov opens up to FOV_CLOSE degrees within CLOSE_D of the head, and the
    // aim rises further toward the middle of the head, just as far as keeps it inside the frame's inner HEAD_IN
    var hc = head.clone(); hc.y += HEAD_UP;
    fol.fovAdd = FOV_CLOSE * Math.max(0, Math.min(1, (CLOSE_D - cur.pos.distanceTo(hc)) / (CLOSE_D - 0.4)));
    if (!headInView(hc, fol.aim)) {
      var lo = k * 0.6, hi = 1, s = new V();
      for (var it = 0; it < 10; it++) { var mid = (lo + hi) / 2; if (headInView(hc, s.copy(o).lerp(hc, mid))) hi = mid; else lo = mid; }
      fol.aim.copy(o).lerp(hc, hi);
    }
  }
  var HV_F = null, HV_R = null, HV_U = null, HV_D = null, HEAD_IN = 0.7, HEAD_UP = 0.1, FOV_CLOSE = 10, CLOSE_D = 1.2;
  /** does the head project inside the inner HEAD_IN of the frame with the camera at cur.pos looking at aim? */
  function headInView(head, aim) {
    if (!HV_F) { HV_F = new V(); HV_R = new V(); HV_U = new V(); HV_D = new V(); }
    HV_F.subVectors(aim, cur.pos);
    if (HV_F.lengthSq() < 1e-8) return false;
    HV_F.normalize();
    HV_R.set(0, 1, 0).cross(HV_F).negate();
    if (HV_R.lengthSq() < 1e-8) return false;
    HV_R.normalize(); HV_U.crossVectors(HV_R, HV_F);
    HV_D.subVectors(head, cur.pos);
    var z = HV_D.dot(HV_F);
    if (z <= 0.05) return false;
    var vf = effFov(((fol && fol.p.fov) || 45) + ((fol && fol.fovAdd) || 0)) * DEG, tv = Math.tan(vf / 2), th = tv * cam.aspect;
    return Math.abs(HV_D.dot(HV_U) / z) <= tv * HEAD_IN && Math.abs(HV_D.dot(HV_R) / z) <= th * HEAD_IN;
  }

  function effFov(fov) {
    var a = cam.aspect;
    if (a >= REF_ASPECT) return fov;
    var h = 2 * Math.atan(Math.tan(fov * DEG / 2) * REF_ASPECT);
    var v = 2 * Math.atan(Math.tan(h / 2) / a);
    return Math.min(90, v / DEG);
  }

  var tmpPos = null;
  function apply(dt) {
    var o = cam.object;
    if (!o) return;
    if (!tmpPos) tmpPos = new V();
    tmpPos.copy(cur.pos);
    if (shk) {
      shk.t += dt || 0;
      var k = 1 - shk.t / shk.sec;
      if (k <= 0) shk = null;
      else {
        var a = shk.amp * k * k;
        tmpPos.x += (JG.random() * 2 - 1) * a; tmpPos.y += (JG.random() * 2 - 1) * a; tmpPos.z += (JG.random() * 2 - 1) * a;
      }
    }
    o.position.copy(tmpPos);
    o.lookAt(fol && cam.mode === 'follow' ? fol.aim : cur.look);
    var f = effFov(cur.fov);
    if (Math.abs(o.fov - f) > 1e-4 || o.aspect !== cam.aspect) { o.fov = f; o.aspect = cam.aspect; o.updateProjectionMatrix(); }
    o.updateMatrixWorld(true);
  }

  // ---------- shots ----------
  function lookupShot(shot) {
    if (shot && typeof shot === 'object') return shot;
    var s = JG.shots && JG.shots[shot];
    if (s) return s;
    return JG.stubs && JG.stubs.shot ? JG.stubs.shot(shot) : { pos: [0, 2, 6], look: [0, 1, 0] };
  }
  function relFrame(rel) {
    if (!rel) return null;
    var w = JG.world;
    if (w && w.hasActor && w.hasActor(rel)) { var a = w.actor(rel); return { pos: a.root.getWorldPosition(new V()), yaw: a.root.rotation.y }; }
    if (w && w.marker) { var m = w.marker(rel); if (m) return { pos: m.pos.clone(), yaw: m.yaw || 0 }; }
    return null;
  }
  function toWorld(arr, frame) {
    var v = new V().fromArray(arr || [0, 0, 0]);
    if (!frame) return v;
    var c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
    return new V(frame.pos.x + v.x * c + v.z * s, frame.pos.y + v.y, frame.pos.z - v.x * s + v.z * c);
  }
  function resolve(shot) {
    var s = lookupShot(shot);
    if (typeof s === 'function') s = s();
    var frame = relFrame(s.rel);
    var pos = toWorld(s.pos || [0, 2, 6], frame), look = toWorld(s.look || [0, 1, 0], frame), fov = s.fov || 40;
    if (s.fit && s.fit.length && JG.world) {
      var pts = [];
      s.fit.forEach(function (ref) {
        var parts = String(ref).split('.'), a = JG.world.hasActor(parts[0]) ? JG.world.actor(parts[0]) : null;
        if (!a) return;
        var o = (a.anchors && a.anchors[parts[1] || 'head']) || a.root;
        pts.push(o.getWorldPosition(new V()));
      });
      if (pts.length) fit(pos, look, fov, pts);
    }
    return { pos: pos, look: look, fov: fov };
  }
  /** move pos back along look->pos until all points fit within the (aspect-aware) frustum with a margin */
  function fit(pos, look, fov, pts) {
    var dir = new V().subVectors(pos, look), dist0 = dir.length() || 1;
    dir.normalize();
    var vf = effFov(fov) * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    var tv = Math.tan(vf / 2) * 0.9, th = Math.tan(hf / 2) * 0.9;
    var fwd = dir.clone().negate(), up = new V(0, 1, 0), right = new V().crossVectors(fwd, up).normalize();
    up.crossVectors(right, fwd).normalize();
    var need = dist0;
    pts.forEach(function (p) {
      var d = new V().subVectors(p, look);
      var x = Math.abs(d.dot(right)), y = Math.abs(d.dot(up)), z = d.dot(fwd);
      need = Math.max(need, x / th + z, y / tv + z);
    });
    pos.copy(look).addScaledVector(dir, need);
  }
})();
