/* JG.player: the roam controller for play beats (plan section 6, Scenes: "Player movement"). Classic script; touches
 * THREE only when called.
 *
 *   start({actor, rects, spawn: {pos: Vector3, yaw}, speed?})   takes control of the actor (w.roam calls it)
 *   stop()      update(dt)      position() -> Vector3 | null      active      autopiloting
 *   autopilot(target: Vector3 | [x, y, z] | [points], {onArrive, speed, people}) -> {cancel()}   walks there,
 *               ignoring bounds, steering around other staged actors (see steer()); people: true also steers round the
 *               crowd NPCs (JG.crowd.bodies(), each at its own r)
 *   route(target) -> [Vector3...]   a walk from Roo's position to target that stays inside the walk rects (the
 *               "Take me there" hint: w.roam), or [target] when there are no rects or no way through them
 *   cancelAutopilot()      inBounds(x, z) -> bool
 *
 * Movement is camera-relative (+y on the stick walks away from the camera). Bounds are whitelist rectangles
 * ({min: [x, z], max: [x, z]}, from SceneInstance.walk[beatId]): a step is accepted if the new position is inside any
 * rectangle, else the x-only step, else the z-only step. A non-finite position resets to the spawn. No obstacle
 * colliders. Height is kept (stairs are scripted auto-walks). The actor's yaw turns towards the motion; its
 * locomotion speed is reported through actor.setLocomotion(speed).
 * People: under keyboard / stick control a step is pushed out of a BODY_R circle round every other staged cast actor
 * and every crowd NPC (JG.crowd.bodies()) at about the same height, so Roo slides round people instead of walking
 * through them (a crowd stander's circle is its own r, wide enough for its gesturing hands). One already nearer than
 * that (it walked up to him) only stops him getting nearer. Sorted ids, fixed order, no randomness. The autopilot
 * steers round cast at AVOID (auto mode's straight walks are unchanged); with people it also steers round the crowd.
 * route(): the rects are convex, so a straight line between two points inside one rect stays inside it. Nodes are the
 * start, the target (or the nearest rect point to it) and, for every pair of overlapping or touching rects, their
 * shared area's centre and two points 0.3 m in from its ends; edges join nodes that share a rect; Dijkstra (fixed
 * order) finds the shortest chain, then waypoints are dropped while the straight line past them stays inside the rects
 * (sampled every 5 cm) and 0.1 m clear of every person's circle. Deterministic, a few dozen nodes. */
(function () {
  'use strict';
  var JG = window.JG;
  var TURN = 10; // rad/s-ish smoothing rate for facing

  var st = { actor: null, rects: null, spawn: null, speed: 2.2, auto: null, active: false };
  var player = JG.player = {
    get active() { return st.active; },
    get autopiloting() { return !!(st.auto && !st.auto.dead); },
    get actor() { return st.actor; },
    start: function (o) {
      st.actor = o.actor;
      st.rects = o.rects && o.rects.length ? o.rects : null;
      var p = st.actor.root.position;
      st.spawn = o.spawn || { pos: p.clone(), yaw: st.actor.root.rotation.y };
      st.speed = o.speed || JG.config.walkSpeed;
      st.auto = null;
      st.active = true;
    },
    stop: function () {
      if (st.actor && st.actor.setLocomotion) st.actor.setLocomotion(0);
      st.active = false; st.auto = null;
    },
    position: function () { return st.actor ? st.actor.root.position : null; },
    inBounds: function (x, z) { return inside(x, z); },
    autopilot: function (target, opts) {
      opts = opts || {};
      var THREE = window.THREE;
      var pts = [];
      if (Array.isArray(target) && target.length && typeof target[0] !== 'number') pts = target.map(toV);
      else pts = [toV(target)];
      var a = { pts: pts, i: 0, onArrive: opts.onArrive || null, speed: opts.speed || st.speed, dead: false, people: !!opts.people };
      st.auto = a;
      return { cancel: function () { a.dead = true; if (st.auto === a) st.auto = null; } };
      function toV(p) { return p && p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p.length > 2 ? p[1] : 0, p.length > 2 ? p[2] : p[1]); }
    },
    cancelAutopilot: function () { st.auto = null; },
    route: function (target) { return route(target); },
    update: function (dt) {
      if (!st.active || !st.actor || dt <= 0) return;
      var root = st.actor.root, p = root.position, vx = 0, vz = 0, speed = 0;
      if (st.auto && !st.auto.dead) {
        var a = st.auto, tgt = a.pts[a.i];
        var dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.sqrt(dx * dx + dz * dz), stepLen = a.speed * dt;
        if (d <= Math.max(0.05, stepLen)) {
          p.x = tgt.x; p.z = tgt.z;
          if (++a.i >= a.pts.length) {
            st.auto = null; st.actor.setLocomotion(0);
            if (a.onArrive) { try { a.onArrive(); } catch (e) { JG.error('player.onArrive', e); } }
            return;
          }
        } else {
          var h = steer(p, dx / d, dz / d, d, a.speed * dt, a.people);
          vx = h[0] * a.speed; vz = h[1] * a.speed;
        }
        p.x += vx * dt; p.z += vz * dt;
        speed = a.speed;
      } else {
        var m = JG.input ? JG.input.move : { x: 0, y: 0 };
        var mag = Math.sqrt(m.x * m.x + m.y * m.y);
        if (mag > 0.05) {
          var yaw = JG.camera && JG.camera.yaw ? JG.camera.yaw() : 0;
          var fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
          vx = (fx * m.y + rx * m.x) * st.speed; vz = (fz * m.y + rz * m.x) * st.speed;
          var nx = p.x + vx * dt, nz = p.z + vz * dt, ox = p.x, oz = p.z, people = bodies(p);
          if (!tryStep(p, nx, nz, people) && !tryStep(p, nx, oz, people)) tryStep(p, ox, nz, people);
          vx = (p.x - ox) / dt; vz = (p.z - oz) / dt;
          speed = Math.sqrt(vx * vx + vz * vz);
        }
      }
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) {
        JG.warn('player-nan', 'player position was not finite; reset to the beat spawn');
        p.copy(st.spawn.pos); root.rotation.y = st.spawn.yaw || 0; speed = 0;
      }
      if (speed > 0.01) {
        var want = Math.atan2(vx, vz), cur = root.rotation.y;
        var diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        root.rotation.y = cur + diff * Math.min(1, TURN * dt);
      }
      st.actor.setLocomotion(speed);
    }
  };
  /** autopilot steering: turn the heading (hx, hz) just enough to pass every other staged actor nearer than the
   *  target at AVOID metres (root centres), away from its side; if that step would leave the walk bounds while the
   *  straight step would not, try the other side, else go straight. Staged ids sorted, no randomness. */
  var AVOID = 0.7;
  function steer(p, hx, hz, dTarget, stepLen, people) {
    var w = JG.world, ids = w && w.castIds ? w.castIds().slice().sort() : [], obs = [], i;
    for (i = 0; i < ids.length; i++) {
      var o = w.hasActor(ids[i]) ? w.actor(ids[i]) : null;
      if (o && o !== st.actor && o.root) obs.push({ q: o.root.position, r: AVOID });
    }
    if (people) {
      var cr = JG.crowd && JG.crowd.bodies ? JG.crowd.bodies() : [];
      for (i = 0; i < cr.length; i++) if (Math.abs(cr[i].y - p.y) < 1) obs.push({ q: cr[i], r: Math.max(AVOID, cr[i].r || 0) });
    }
    for (i = 0; i < obs.length; i++) {
      var q = obs[i].q, R = obs[i].r, rx = q.x - p.x, rz = q.z - p.z, dO = Math.sqrt(rx * rx + rz * rz);
      if (dO < 1e-4 || dO > dTarget || dO > R + 2) continue;
      var along = rx * hx + rz * hz;
      if (along <= 0) continue; // behind: already passing it
      var side = hx * rz - hz * rx; // > 0: the actor is on the heading's left (x toward z)
      var ang = Math.atan2(Math.abs(side), along), need = dO > R ? Math.asin(R / dO) : Math.PI / 2;
      if (ang >= need) continue;
      var turn = (need - ang) * (side >= 0 ? 1 : -1);
      var c = Math.cos(turn), s = Math.sin(turn), nx = hx * c + hz * s, nz = -hx * s + hz * c;
      if (st.rects && !inside(p.x + nx * stepLen, p.z + nz * stepLen) && inside(p.x + hx * stepLen, p.z + hz * stepLen)) {
        turn = (need + ang) * (side >= 0 ? -1 : 1);
        c = Math.cos(turn); s = Math.sin(turn); nx = hx * c + hz * s; nz = -hx * s + hz * c;
        if (!inside(p.x + nx * stepLen, p.z + nz * stepLen)) continue;
      }
      hx = nx; hz = nz;
    }
    return [hx, hz];
  }
  /** keyboard collision with people: the positions of every other staged cast actor (sorted ids) and every crowd NPC
   *  within 1 m of the player's height; a crowd stander brings its own radius (r: its gesturing hands' reach plus
   *  Roo's arm, JG.crowd.bodies()), everyone else BODY_R */
  var BODY_R = 0.75, OUT = [0, 0];   // Roo's shoulders and arms are wide: at 0.6 m they met a stander's gesturing hands
  function bodies(p) {
    var out = [], w = JG.world, ids = w && w.castIds ? w.castIds().slice().sort() : [], i, q;
    for (i = 0; i < ids.length; i++) {
      var o = w.hasActor(ids[i]) && w.staged && w.staged(ids[i]) ? w.actor(ids[i]) : null;
      if (o && o !== st.actor && o.root && Math.abs(o.root.position.y - p.y) < 1) out.push(o.root.position);
    }
    var cr = JG.crowd && JG.crowd.bodies ? JG.crowd.bodies() : [];
    for (i = 0; i < cr.length; i++) { q = cr[i]; if (Math.abs(q.y - p.y) < 1) out.push(q); }
    return out;
  }
  /** (x, z) pushed out of every body circle it would move into (two passes); OUT holds the result */
  function pushOut(p, x, z, people) {
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < people.length; i++) {
        var q = people[i], dx = x - q.x, dz = z - q.z, d = Math.sqrt(dx * dx + dz * dz);
        var d0 = Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z)), r = Math.min(q.r || BODY_R, d0);
        if (d >= r) continue;
        if (d < 1e-6) { dx = p.x - q.x; dz = p.z - q.z; d = d0; if (d < 1e-6) continue; }
        x = q.x + dx / d * r; z = q.z + dz / d * r;
      }
    }
    OUT[0] = x; OUT[1] = z;
    return OUT;
  }
  /** take the step to (x, z), pushed out of people, if it stays in bounds and clear of them; returns whether it did */
  function tryStep(p, x, z, people) {
    var c = people.length ? pushOut(p, x, z, people) : [x, z];
    if (!inside(c[0], c[1])) return false;
    for (var i = 0; i < people.length; i++) {
      var q = people[i], d = Math.sqrt((c[0] - q.x) * (c[0] - q.x) + (c[1] - q.z) * (c[1] - q.z));
      var d0 = Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z));
      if (d < Math.min(q.r || BODY_R, d0) - 1e-4) return false;
    }
    p.x = c[0]; p.z = c[1];
    return true;
  }
  /** route(): see the header. Returns world points (Vector3, the target's height) ending at target. */
  function route(target) {
    var THREE = window.THREE, T = target && target.isVector3 ? target.clone() : new THREE.Vector3(target[0], target.length > 2 ? target[1] : 0, target.length > 2 ? target[2] : target[1]);
    var rects = st.rects, p = st.actor && st.actor.root.position;
    if (!rects || !p) return [T];
    var EPS = 1e-6, nodes = [], i, j;
    function inR(r, x, z) { return x >= r.min[0] - EPS && x <= r.max[0] + EPS && z >= r.min[1] - EPS && z <= r.max[1] + EPS; }
    function clampIn(x, z) {   // the nearest point inside any rect
      var best = null, bd = Infinity;
      rects.forEach(function (r) {
        var cx = Math.min(r.max[0], Math.max(r.min[0], x)), cz = Math.min(r.max[1], Math.max(r.min[1], z)), d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
        if (d < bd) { bd = d; best = [cx, cz]; }
      });
      return best;
    }
    function add(x, z) { var n = { x: x, z: z, rs: [] }; rects.forEach(function (r, k) { if (inR(r, x, z)) n.rs.push(k); }); nodes.push(n); return n; }
    var s0 = clampIn(p.x, p.z), g0 = clampIn(T.x, T.z);
    var S = add(s0[0], s0[1]), G = add(g0[0], g0[1]);
    for (i = 0; i < rects.length; i++) for (j = i + 1; j < rects.length; j++) {
      var a = rects[i], b = rects[j];
      var x0 = Math.max(a.min[0], b.min[0]), x1 = Math.min(a.max[0], b.max[0]), z0 = Math.max(a.min[1], b.min[1]), z1 = Math.min(a.max[1], b.max[1]);
      if (x0 > x1 + EPS || z0 > z1 + EPS) continue;
      add((x0 + x1) / 2, (z0 + z1) / 2);
      // a long shared edge also gets points 0.3 m in from its ends (corner cuts)
      if (x1 - x0 > 0.6) { add(x0 + 0.3, (z0 + z1) / 2); add(x1 - 0.3, (z0 + z1) / 2); }
      if (z1 - z0 > 0.6) { add((x0 + x1) / 2, z0 + 0.3); add((x0 + x1) / 2, z1 - 0.3); }
    }
    var people = bodies(p);
    /** the segment A->B stays in the rects (sampled) and, with rectsToo false, only people are checked */
    function clear(A, B, rectsToo) {
      var L = Math.hypot(B.x - A.x, B.z - A.z), steps = Math.max(1, Math.ceil(L / 0.05));
      for (var q = 0; q <= steps; q++) {
        var x = A.x + (B.x - A.x) * q / steps, z = A.z + (B.z - A.z) * q / steps;
        if (rectsToo && !inside(x, z)) return false;
        for (var m = 0; m < people.length; m++) {
          var o = people[m], r = (o.r || BODY_R) + 0.1, d0 = Math.hypot(A.x - o.x, A.z - o.z);
          if (d0 < r) continue;   // already inside one (he stands next to it): only the rects count
          if (Math.hypot(x - o.x, z - o.z) < r) return false;
        }
      }
      return true;
    }
    // Dijkstra over nodes that share a rect, by edges clear of people (pass 0) or, if that finds no way, any (pass 1)
    for (var pass = 0; pass < 2; pass++) {
      var res = search(pass === 0);
      if (res) break;
    }
    if (!res) return [T];
    var chain = res;
    function search(avoid) {
      var n = nodes.length, dist = [], prev = [], done = [];
      for (i = 0; i < n; i++) { dist.push(Infinity); prev.push(-1); done.push(false); }
      var si = nodes.indexOf(S), gi = nodes.indexOf(G);
      dist[si] = 0;
      for (;;) {
        var u = -1;
        for (i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || u === gi) break;
        done[u] = true;
        for (j = 0; j < n; j++) {
          if (done[j]) continue;
          var share = false;
          for (var k = 0; k < nodes[u].rs.length && !share; k++) share = nodes[j].rs.indexOf(nodes[u].rs[k]) >= 0;
          if (!share) continue;
          if (avoid && !clear(nodes[u], nodes[j], false)) continue;
          var dd = dist[u] + Math.hypot(nodes[j].x - nodes[u].x, nodes[j].z - nodes[u].z);
          if (dd < dist[j] - EPS) { dist[j] = dd; prev[j] = u; }
        }
      }
      if (dist[gi] === Infinity) return null;
      var ch = [];
      for (i = gi; i >= 0; i = prev[i]) ch.unshift(nodes[i]);
      return ch;
    }
    // drop waypoints while the line past them stays in the rects and clear of people
    var out = [chain[0]], c = 0;
    while (c < chain.length - 1) {
      var far = c + 1;
      for (j = chain.length - 1; j > c + 1; j--) if (clear(chain[c], chain[j], true)) { far = j; break; }
      out.push(chain[far]); c = far;
    }
    var pts = out.slice(1).map(function (nd) { return new THREE.Vector3(nd.x, T.y, nd.z); });
    if (Math.hypot(g0[0] - T.x, g0[1] - T.z) > 1e-3) pts.push(T.clone());
    if (!pts.length) pts.push(T.clone());
    return pts;
  }
  function inside(x, z) {
    if (!st.rects) return true;
    for (var i = 0; i < st.rects.length; i++) {
      var r = st.rects[i];
      if (x >= r.min[0] && x <= r.max[0] && z >= r.min[1] && z <= r.max[1]) return true;
    }
    return false;
  }
})();
