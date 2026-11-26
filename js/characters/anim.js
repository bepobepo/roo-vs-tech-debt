/* JG.anim: the per-actor animation engine and the shared Actor shell (plan section 6, "Characters" and "Layering").
 * Engine only: it holds no per-character data. cast-*.js files build actors with JG.anim.actor(kit, spec); clips-*.js
 * files add routes (JG.anim.route) next to their JG.clips.define / compose / events calls. Classic script; touches
 * neither THREE nor the DOM at load.
 *
 *   JG.anim.route(id, { clip?, additive?: [ids] })
 *        what a contract clip id plays: another clip id (a composed or helper clip, e.g. roo.phoneHold ->
 *        roo.phoneHold.arm) and/or additive layers started and stopped with it (roo.elevatorStand = roo.idle + footTap).
 *        Routes chain (at most 4 hops); additive lists accumulate.
 *   JG.anim.controller({ rig, root, base, emit, defaultClip, always, natural }) -> ctl
 *        One AnimationMixer per actor, advanced only by ctl.update(dt) from the game clock. Base clips crossfade; any
 *        number of additive actions run on top; held poses are one-frame clips on the same path. Events come from
 *        JG.clips.eventsFor(<actor>.<clip>) (footL/footR fall back to the loop's phase for walk and run).
 *   JG.anim.actor(kit, spec) -> Actor            the full Actor API of section 6 over a rig and a controller
 *   JG.anim.human(kit, info, data) -> Actor       a human base body (rig + dress + face + scale) from cast-file data
 *   JG.anim.props.make(kit, name)                 stand-in prop meshes (phone, headphones, handbag, knitting; the
 *                                                 office stations' coffee and paperCup)
 *   JG.anim.ARMS / RIGHT_ARM / armBones(side)     bone lists for clips.compose masks
 *   JG.anim.P                                     generic pose helpers over a rig's helper set P, for clip authors:
 *        dims, stand, sit, seat, arm, armTo, headPoint, armDown, fist, open, spine, head, body (x is mirrored per side, so
 *        positive x is "outward" for both arms; offsets for arm targets are from the shoulder joint).
 *
 * Resolution of a clip name for an actor of base B (play('walk'), pose('idle'), ...):
 *   route(B.name) -> JG.clips.has(id) ? JG.clips.get(id, rig) : generic library default (idle, walk, run, rest)
 *   -> else a stub hit (JG.track.stub) and the actor's default clip.
 * Conventions: positive rotLocal x leans/nods forward (+Z is the actor's front), positive y turns to the actor's left
 * (+X), positive z leans to its right. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var routes = {};
  var GENERIC = { idle: 'Idle_Loop', rest: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop' };

  function route(id, spec) { routes[id] = spec || {}; }

  /** resolve "<base>.<name>" for a rig -> { id, clip, additive: [ids], loop } or null */
  function resolve(base, name, rig) {
    var id = base + '.' + name, add = [], hops = 0, r;
    while ((r = routes[id]) && hops++ < 4) {
      if (r.additive) add = add.concat(r.additive);
      if (!r.clip || r.clip === id) break;
      id = r.clip;
    }
    var clip = null;
    if (JG.clips && JG.clips.has(id)) clip = JG.clips.get(id, rig);
    else if (GENERIC[name] && JG.clips) { try { clip = JG.clips.library(GENERIC[name], rig); } catch (e) { clip = null; } }
    if (!clip) return null;
    var ud = clip.userData || {};
    var loop = ud.loop !== undefined ? !!ud.loop : /_Loop$/.test(clip.name);
    if (ud.library && !ud.code) loop = /_Loop$/.test(ud.library);
    return { id: base + '.' + name, clipId: id, clip: clip, additive: add, loop: loop };
  }

  // ===============================================================================================================
  // controller
  // ===============================================================================================================
  function controller(o) {
    var THREE = window.THREE;
    var mixer = new THREE.AnimationMixer(o.root);
    var base = null, explicit = null, loco = 0, locoOn = false, layerActs = [], extra = {}, always = o.always || [];
    var cache = {}, known = [], evPrev = 0, evAct = null, held = null;
    var natural = Object.assign({ walk: 1.45, run: 3.9 }, o.natural || {});

    function entry(name) {
      if (cache[name] !== undefined) return cache[name];
      var e = null;
      // a code clip bakes on first use by posing this rig's live bones and leaving them at the reference pose; the
      // mixer rewrites a bone only when its value changes, so a held (constant) track of the running clip would stay
      // at the reference (the hug lost its hips on the first pat). Put the live pose back after resolving.
      var bones = (o.rig && o.rig.bones) || [], snap = bones.map(function (b) { return [b.quaternion.clone(), b.position.clone()]; });
      try { e = resolve(o.base, name, o.rig); } catch (err) { JG.error('anim.resolve ' + o.base + '.' + name, err); e = null; }
      bones.forEach(function (b, i) { b.quaternion.copy(snap[i][0]); b.position.copy(snap[i][1]); });
      return (cache[name] = e);
    }
    function action(clip) {
      var a = mixer.clipAction(clip);
      if (known.indexOf(a) < 0) known.push(a);
      return a;
    }
    function stopLayers() { layerActs.forEach(function (a) { a.fadeOut(0.2); }); layerActs = []; }
    function startAdditive(id, opts) {
      opts = opts || {};
      var e = entry(id);
      if (!e) { JG.track.stub('additive', o.base + '.' + id); return null; }
      var a = action(e.clip);
      a.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
      a.timeScale = opts.speed || 1;
      a.enabled = true;
      a.reset().setEffectiveWeight(opts.weight === undefined ? 1 : opts.weight);
      if (opts.fade) a.fadeIn(opts.fade);
      a.play();
      return a;
    }

    /** make e the base clip */
    function setBase(e, fade, loop, speed) {
      var a = action(e.clip);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.timeScale = speed || 1;
      if (base && base.act === a) {
        if (!loop || !a.isRunning()) { a.enabled = true; a.reset().setEffectiveWeight(1).play(); }
      } else {
        a.enabled = true;
        a.reset();
        a.setEffectiveWeight(1);
        if (fade > 0 && base && base.act.isRunning()) { a.crossFadeFrom(base.act, fade, false); a.play(); }
        else {
          known.forEach(function (k) { if (k.getClip().blendMode !== THREE.AdditiveAnimationBlendMode && k !== a) k.stop(); });
          a.play();
        }
      }
      var prevLayers = base ? base.e.additive.join() : '';
      base = { e: e, act: a, loop: loop };
      if (prevLayers !== e.additive.join()) {
        stopLayers();
        e.additive.forEach(function (id) { var la = startAdditive(id.replace(/^[a-z]+\./, ''), { fade: fade }); if (la) layerActs.push(la); });
      }
      evAct = a; evPrev = a.time;
      if (o.onBase) o.onBase(e, fade);
    }

    var ctl = {
      mixer: mixer,
      entry: entry,
      has: function (name) { return !!entry(name); },
      /** play a base clip; returns {duration, stop(fade)} */
      play: function (name, opts) {
        opts = opts || {};
        if (opts.additive) {
          var aa = startAdditive(name, { speed: opts.speed, fade: opts.fade, once: opts.loop === false });
          if (!aa) return { duration: 0, stop: function () {} };
          extra[name] = aa;
          return { duration: aa.getClip().duration, stop: function (f) { if (extra[name] === aa) { delete extra[name]; aa.fadeOut(f === undefined ? 0.2 : f); } } };
        }
        var e = entry(name);
        if (!e) {
          JG.track.stub('clip', o.base + '.' + name, 'default ' + (o.defaultClip || 'idle'));
          e = entry(o.defaultClip || 'idle');
          if (!e) return { duration: 0, stop: function () {} };
        }
        var loop = opts.loop !== undefined ? !!opts.loop : e.loop;
        held = null;
        var mine = explicit = { name: name, e: e, loop: loop, speed: opts.speed || 1 };
        if (!locoOn) setBase(e, opts.fade === undefined ? 0.2 : opts.fade, loop, mine.speed);
        return {
          duration: e.clip.duration,
          stop: function (f) {
            if (explicit !== mine) return;
            explicit = null;
            if (!locoOn) { var d = entry(o.defaultClip || 'idle'); if (d) setBase(d, f === undefined ? 0.2 : f, true, 1); }
          }
        };
      },
      /** hold a one-frame clip (a named pose) */
      hold: function (clip, blend, name) {
        var e = { id: o.base + '.' + name, clipId: clip.name, clip: clip, additive: [], loop: true, pose: name };
        held = name;
        explicit = { name: name, e: e, loop: true, speed: 1 };
        if (!locoOn) setBase(e, blend || 0, true, 1);
      },
      held: function () { return held; },
      pulse: function (name) {
        var a = startAdditive(name, { once: true });
        return a ? { duration: a.getClip().duration, stop: function () { a.stop(); } } : { duration: 0, stop: function () {} };
      },
      setLocomotion: function (speed) { loco = speed > 0 ? speed : 0; },
      update: function (dt) {
        // locomotion: walk or run over whatever was asked for, which resumes when the actor stops
        var want = loco > 0.05;
        if (want) {
          var run = loco > natural.walk * 1.85 && entry('run');
          var e = run ? entry('run') : entry('walk');
          if (e) {
            var nat = run ? natural.run : natural.walk;
            var ts = Math.max(0.5, Math.min(2.2, loco / nat));
            if (!locoOn || base.e !== e) setBase(e, 0.15, true, ts);
            base.act.timeScale = ts;
            locoOn = true;
          }
        } else if (locoOn) {
          locoOn = false;
          if (explicit && explicit.loop) setBase(explicit.e, 0.2, true, explicit.speed);
          else { var d = entry(o.defaultClip || 'idle'); if (d) setBase(d, 0.2, true, 1); }
        }
        mixer.update(dt);
        fireEvents();
      },
      reset: function () {
        mixer.stopAllAction();
        base = null; explicit = null; loco = 0; locoOn = false; layerActs = []; extra = {}; held = null;
        var d = entry(o.defaultClip || 'idle');
        if (d) setBase(d, 0, true, 1);
        always.forEach(function (id) { startAdditive(id); });
        mixer.update(0);
      },
      /** base clip id and running action names, for __game.state().cast and the state hash */
      actions: function () {
        var out = [];
        // running, or finished and clamped on its last frame (a held one-shot still shows)
        known.forEach(function (a) { if (a.isScheduled() && a.enabled && a.getEffectiveWeight() > 0.01 && out.indexOf(a.getClip().name) < 0) out.push(a.getClip().name); });
        return out.sort();
      },
      base: function () { return base; },
      baseHasTrack: function (name) {
        if (!base) return false;
        var c = base.act.getClip();
        if (c.__jgTracks === undefined) { c.__jgTracks = {}; c.tracks.forEach(function (t) { c.__jgTracks[t.name] = true; }); }
        return !!c.__jgTracks[name];
      }
    };

    function fireEvents() {
      if (!base || !o.emit) return;
      var a = base.act;
      if (a !== evAct) { evAct = a; evPrev = a.time; return; }
      if (a.getEffectiveWeight() < 0.5) { evPrev = a.time; return; }
      var c = a.getClip(), d = c.duration || 1, t = a.time, p = evPrev;
      evPrev = t;
      if (t === p) return;
      var table = JG.clips.eventsFor(base.e.id);
      if (!table.length && base.e.clipId !== base.e.id) table = JG.clips.eventsFor(base.e.clipId);
      if (!table.length && /\.(walk|run)$/.test(base.e.id)) table = [{ t: 0, name: 'footL' }, { t: d / 2, name: 'footR' }];
      table.forEach(function (ev) {
        var et = ev.t;
        var hit = t > p ? (et > p && et <= t) : (et > p || et <= t);
        if (hit) o.emit(ev.name);
      });
    }
    return ctl;
  }

  // ===============================================================================================================
  // props (stand-ins until the props GLB): simple toon meshes with a hull
  // ===============================================================================================================
  var props = {
    make: function (kit, name) {
      var THREE = kit.THREE, g, c, grp = new THREE.Group();
      // o.hull: false leaves a part without its ink hull (thin steam squiggles, the paper cup's cone)
      function part(geo, color, x, y, z, o) {
        var m = new THREE.Mesh(geo, kit.mat.toon({ color: color }));
        m.position.set(x || 0, y || 0, z || 0);
        if (!o || o.hull !== false) m.add(new THREE.Mesh(kit.hull(geo, 0.006), kit.mat.ink()));
        grp.add(m);
        return m;
      }
      /** a thin S-shaped steam squiggle (a tube along a little sine), unhulled */
      function squiggle(x, z, ph) {
        var pts = [];
        for (var i = 0; i <= 6; i++) pts.push(new THREE.Vector3(Math.sin(i / 6 * Math.PI * 2 + ph) * 0.012, i / 6 * 0.09, 0));
        part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0035, 4, false), 0xf4f4f4, x, 0.105, z, { hull: false });
      }
      if (name === 'phone') part(new THREE.BoxGeometry(0.075, 0.15, 0.014), 0x222630);
      else if (name === 'headphones') {
        g = new THREE.TorusGeometry(0.135, 0.018, 6, 18, Math.PI);
        part(g, 0xE0218A);
        part(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateZ(Math.PI / 2), 0x111111, 0.135, 0, 0);
        part(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateZ(Math.PI / 2), 0x111111, -0.135, 0, 0);
      } else if (name === 'handbag') {
        part(new THREE.BoxGeometry(0.26, 0.18, 0.09), 0x7A3B5A, 0, -0.12, 0);
        part(new THREE.TorusGeometry(0.07, 0.012, 5, 12, Math.PI), 0x4A2238, 0, -0.03, 0);
      } else if (name === 'knitting') {
        part(new THREE.BoxGeometry(0.16, 0.012, 0.12), 0xE0218A, 0, 0, 0.02);
        c = part(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 5), 0xC9C9C9, 0.03, 0.02, 0.02); c.rotation.z = 1.2;
        c = part(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 5), 0xC9C9C9, -0.03, 0.02, 0.02); c.rotation.z = -1.2;
      } else if (name === 'coffee') {
        // the office coffee (office-walk's machine): a white mug with a coffee top and two steam squiggles; its base at
        // the group origin, up +Y
        part(new THREE.CylinderGeometry(0.036, 0.032, 0.085, 8).translate(0, 0.0425, 0), 0xF4F1E8);
        part(new THREE.TorusGeometry(0.022, 0.007, 4, 8).translate(0.04, 0.045, 0), 0xF4F1E8);
        part(new THREE.CircleGeometry(0.031, 8).rotateX(-Math.PI / 2).translate(0, 0.078, 0), 0x6B3F22, 0, 0, 0, { hull: false });
        squiggle(-0.012, 0, 0); squiggle(0.014, 0.004, 1.7);
      } else if (name === 'paperCup') {
        // a white paper cone, point down, its rim at the group origin + 0.112 (10 cm across: a big cooler cone, sized so
        // it reads in the hand-over two-shot), with a blue band under the rim so it reads as a cooler cup at a distance
        part(new THREE.ConeGeometry(0.05, 0.112, 8, 1, false).rotateX(Math.PI).translate(0, 0.056, 0), 0xF7F7F2, 0, 0, 0, { hull: false });
        part(new THREE.CylinderGeometry(0.0478, 0.0395, 0.033, 8, 1, true).translate(0, 0.0895, 0), 0x2F6FD6, 0, 0, 0, { hull: false });
        part(new THREE.CircleGeometry(0.0437, 8).rotateX(-Math.PI / 2).translate(0, 0.114, 0), 0x9FD8FF, 0, 0, 0, { hull: false });
      } else part(new THREE.BoxGeometry(0.15, 0.1, 0.1), 0xFFD21F);
      grp.name = 'prop-' + name;
      return grp;
    }
  };

  // ===============================================================================================================
  // generic pose helpers for clip authors (all over the rig's helper set P; root space, +Z forward, +Y up)
  // ===============================================================================================================
  var dimsCache = new WeakMap();
  function V(a) { return new window.THREE.Vector3(a[0], a[1], a[2]); }
  function K(s) { return s === 'l' ? 1 : -1; }
  var A = {
    /** measurements of the rig in its reference pose (cached per P) */
    dims: function (P) {
      var d = dimsCache.get(P);
      if (d) return d;
      P.reset();
      var w = function (n) { return P.worldPos(n); };
      var hip = w('pelvis'), th = w('thigh_l'), ca = w('calf_l'), ft = w('foot_l'), ua = w('upperarm_l'), la = w('lowerarm_l'), ha = w('hand_l'), hd = w('Head');
      d = {
        hipY: hip.y, hipZ: hip.z, thighX: Math.abs(th.x), thighY: th.y, ankleY: ft.y, ankleZ: ft.z,
        legL: th.distanceTo(ca) + ca.distanceTo(ft), shoulderX: Math.abs(ua.x), shoulderY: ua.y,
        upper: ua.distanceTo(la), fore: la.distanceTo(ha), headY: hd.y, height: hd.y + 0.17, head: [hd.x, hd.y, hd.z]
      };
      dimsCache.set(P, d);
      return d;
    },
    /** standing legs and hips. o: drop, lean (spine x), twist (spine y), tilt (spine z), spread, z: [l, r] foot z,
     *  hz (hips z), hx (hips x shift), knee (forward hint), arms: false to leave the arms at the reference */
    stand: function (P, o) {
      o = o || {};
      var d = A.dims(P), drop = o.drop || 0, sp = o.spread || 0, fz = o.z || [0, 0];
      P.hips([o.hx || 0, d.hipY - drop, d.hipZ + (o.hz || 0)]);
      if (o.hipRot) P.rotLocal('pelvis', o.hipRot[0], o.hipRot[1], o.hipRot[2]);
      ['l', 'r'].forEach(function (s, i) {
        var k = K(s);
        P.legIK(s, [k * (d.thighX + sp + 0.01) + (o.hx || 0) * 0.3, d.ankleY, d.ankleZ + fz[i]], [k * 0.12, 0, 1]);
      });
      A.spine(P, o.lean || 0, o.twist || 0, o.tilt || 0);
      if (o.arms !== false) { A.armDown(P, 'l'); A.armDown(P, 'r'); }
    },
    /** seated: hips at seat height y (root space), z back; feet forward. o: y, z, recline, spread, feet ([l,r] z), feetY */
    sit: function (P, o) {
      o = o || {};
      var d = A.dims(P), y = o.y !== undefined ? o.y : d.hipY * 0.6, z = o.z !== undefined ? o.z : -0.3, sp = o.spread === undefined ? 0.04 : o.spread;
      var fz = o.feet || [0.12, 0.12], fy = o.feetY || [0, 0];
      P.hips([0, y, z]);
      ['l', 'r'].forEach(function (s, i) {
        var k = K(s);
        P.legIK(s, [k * (d.thighX + sp), d.ankleY + fy[i], fz[i]], [k * 0.15, 0.6, 1], 0, o.footPitch || 0);
      });
      A.spine(P, -(o.recline || 0), o.twist || 0, o.tilt || 0);
      if (o.arms !== false) { A.armDown(P, 'l'); A.armDown(P, 'r'); }
    },
    /** the chair sit shared by seated code clips: hips where the library Sitting_Idle_Loop puts them, so code and
     *  library seated clips cut cleanly. Measured: hips at 0.59 x and 0.36 x the standing hips height (up, back), the
     *  torso about 10 degrees forward (Roo 0.549 / -0.336 m; body-female 0.552 / -0.34 m in rig space). */
    seat: function (P, o) {
      var d = A.dims(P);
      o = Object.assign({ y: d.hipY * 0.59, z: -d.hipY * 0.36, feet: [0.12, 0.12], spread: 0.06 }, o || {});
      o.recline = (o.recline || 0) - 0.18;
      A.sit(P, o);
    },
    /** spread a rotation over spine_01..03 */
    spine: function (P, x, y, z) {
      ['spine_01', 'spine_02', 'spine_03'].forEach(function (n) { P.rotLocal(n, x / 3, y / 3, z / 3); });
    },
    /** neck and head: x nod (positive down), y turn (positive to the actor's left), z tilt */
    head: function (P, x, y, z) {
      P.rotLocal('neck_01', x * 0.4, y * 0.4, (z || 0) * 0.4);
      P.rotLocal('Head', x * 0.6, y * 0.6, (z || 0) * 0.6);
    },
    /** two-bone arm IK: the wrist to the shoulder joint + rel (x mirrored: positive is outward). o: elbow hint
     *  [x out, y, z] (default out, down and back), hand: {dir, palm} (mirrored), fist, open, clav: [up, fwd] */
    arm: function (P, s, rel, o) {
      return A.armTo(P, s, function (S, k) { return V([rel[0] * k, rel[1], rel[2]]).add(S); }, o);
    },
    /** where a point riding on the head is now: off from the Head joint in the reference pose (x mirrored for side s) */
    headPoint: function (P, off, s) {
      var h = A.dims(P).head, k = s ? K(s) : 1;
      return P.fromRef('Head', [h[0] + off[0] * k, h[1] + off[1], h[2] + off[2]]);
    },
    /** two-bone arm IK to a root-space wrist target T (a Vector3, an array, or fn(shoulder, k) -> Vector3) */
    armTo: function (P, s, target, o) {
      o = o || {};
      var THREE = window.THREE, k = K(s), d = A.dims(P);
      if (o.clav) P.rotLocal('clavicle_' + s, 0, -(o.clav[1] || 0) * k, (o.clav[0] || 0) * k);
      var ua = 'upperarm_' + s, la = 'lowerarm_' + s;
      var S = P.worldPos(ua);
      var T = typeof target === 'function' ? target(S, k) : (target.isVector3 ? target.clone() : V(target));
      var L1 = d.upper, L2 = d.fore, dv = T.clone().sub(S), dist = Math.min(Math.max(dv.length(), 0.05), L1 + L2 - 0.002), dh = dv.normalize();
      var ca = Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))), a = Math.acos(ca);
      var hint = o.elbow ? V([o.elbow[0] * k, o.elbow[1], o.elbow[2]]) : V([0.35 * k, -0.3, -1]);
      var nrm = hint.addScaledVector(dh, -hint.dot(dh));
      if (nrm.lengthSq() < 1e-8) nrm = V([0, 0, -1]).addScaledVector(dh, -dh.z);
      nrm.normalize();
      var Kp = S.clone().addScaledVector(dh, L1 * Math.cos(a)).addScaledVector(nrm, L1 * Math.sin(a));
      var Ap = S.clone().addScaledVector(dh, dist);
      var u = Kp.clone().sub(S), f = Ap.clone().sub(Kp);
      var pu = f.clone().addScaledVector(u, -f.dot(u) / u.lengthSq());
      if (pu.lengthSq() < 1e-6) pu = o.pole ? V([o.pole[0] * k, o.pole[1], o.pole[2]]) : V([0, 0, 1]);
      P.aim(ua, u, pu.normalize());
      var pf = u.clone().negate(); pf.addScaledVector(f, -pf.dot(f) / f.lengthSq());
      if (pf.lengthSq() < 1e-6) pf = pu.clone();
      P.aim(la, f, pf.normalize());
      var hd = o.hand && o.hand.dir ? V([o.hand.dir[0] * k, o.hand.dir[1], o.hand.dir[2]]) : f.clone().normalize();
      var palm = o.hand && o.hand.palm ? V([o.hand.palm[0] * k, o.hand.palm[1], o.hand.palm[2]]) : V([-k, 0, 0]);
      palm.addScaledVector(hd.clone().normalize(), -palm.dot(hd) / hd.lengthSq());
      if (palm.lengthSq() < 1e-6) palm = V([0, -1, 0]);
      P.hand(s, hd, palm.normalize());
      if (o.fist) A.fist(P, s); else if (o.open !== false) A.open(P, s, o.curl);
      return Ap;
    },
    /** arm hanging at the side, slightly out and bent. o: out, fwd, bend */
    armDown: function (P, s, o) {
      o = o || {};
      var d = A.dims(P), L = d.upper + d.fore;
      A.arm(P, s, [o.out === undefined ? 0.06 : o.out, -L * 0.94, o.fwd === undefined ? 0.06 : o.fwd], { elbow: [0.2, 0, -1], hand: { palm: [-1, 0, 0.15] }, curl: 0.35 });
    },
    fist: function (P, s) { try { P.fingers(s, 1.25, 1.35, null, null, 0.9); } catch (e) { /* rig without fingers */ } },
    open: function (P, s, c) { c = c === undefined ? 0.25 : c; try { P.fingers(s, c, c * 1.1, null, null, c * 0.6); } catch (e) { /* rig without fingers */ } },
    /** a whole-body pitch about the hips (fall, dive): x radians, positive pitches the head forward/down */
    body: function (P, x, y, z) { P.rotLocal('pelvis', x || 0, y || 0, z || 0); }
  };

  // ===============================================================================================================
  // the Actor shell
  // ===============================================================================================================
  /**
   * spec = { id, base, height, radius, model (Object3D under root), rig, animRoot, anchors: {name: Object3D},
   *   headBone, lookLimit, defaultClip, always: [additive ids], natural: {walk, run},
   *   mixer: false (posed once, no mixer: extras), poseClip(name) -> AnimationClip | null (named poses),
   *   onBase(entry), afterMixer(dt, ctl), teleport(), quality(tier), face: {set(name), mouth(level)}, cape(mode),
   *   propOffset(prop) -> [x,y,z] in the anchor's local frame }
   */
  function actor(kit, spec) {
    var THREE = kit.THREE, root = new THREE.Group();
    root.name = 'actor-' + spec.id;
    if (spec.model) root.add(spec.model);
    var listeners = [], propMeshes = {}, look = { target: null, w: 0, last: null };
    var UP = new THREE.Vector3(0, 1, 0), tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), hp = new THREE.Vector3(), tp = new THREE.Vector3();
    function emit(ev) { listeners.slice().forEach(function (fn) { try { fn(ev); } catch (e) { JG.error('actor event', e); } }); }
    var ctl = spec.mixer === false ? null : controller({
      rig: spec.rig, root: spec.animRoot, base: spec.base, emit: emit, defaultClip: spec.defaultClip, always: spec.always,
      natural: spec.natural, onBase: spec.onBase
    });
    var staticMixer = null, staticName = null;
    /** extras: sample a clip once onto the bones, then drop the mixer */
    function posedOnce(name) {
      var e = resolve(spec.base, name, spec.rig);
      if (!e) {
        if (name !== 'idle' && name !== 'rest') JG.track.stub('clip', spec.base + '.' + name, 'default ' + (spec.defaultClip || 'idle'));
        e = resolve(spec.base, spec.defaultClip || 'idle', spec.rig);
      }
      if (!e) return { duration: 0, stop: function () {} };
      staticName = name;
      spec.rig.P.reset();
      e.clip.tracks.forEach(function (t) {
        var i = t.name.lastIndexOf('.'), b = spec.rig.byName[t.name.slice(0, i)], prop = t.name.slice(i + 1);
        if (!b || !b[prop]) return;
        b[prop].fromArray(t.createInterpolant().evaluate(0));
      });
      staticMixer = e.clip.name;
      return { duration: e.clip.duration, stop: function () {} };
    }

    var a = {
      id: spec.id, base: spec.base, root: root, height: spec.height, radius: spec.radius || 0.3, anchors: spec.anchors || {},
      rig: spec.rig, expression: null, capeMode: null, ctl: ctl,
      update: function (dt, ctx) {
        if (ctl) ctl.update(dt);
        if (spec.afterMixer) spec.afterMixer(dt, ctl);
        if (spec.headBone && (look.target || look.w > 0.01)) applyLook(dt);
      },
      reset: function () {
        look.target = null; look.w = 0; look.last = null; look.in = null; look.out = null;
        Object.keys(propMeshes).forEach(function (p) { if (propMeshes[p].parent) propMeshes[p].parent.remove(propMeshes[p]); });
        if (ctl) ctl.reset(); else posedOnce(spec.defaultClip || 'idle');
        a.expression = null;
        if (spec.face) spec.face.set(spec.face.neutral || null, 0);
        if (spec.face) spec.face.mouth(0);
        if (spec.cape) spec.cape('reset');
        if (spec.afterMixer) spec.afterMixer(0, ctl, true);
      },
      teleport: function () { if (spec.teleport) spec.teleport(); },
      setQuality: function (tier) { if (spec.quality) spec.quality(tier); },
      setLocomotion: function (speed) { if (ctl) ctl.setLocomotion(speed); },
      pose: function (name, blend) {
        blend = blend === undefined ? 0.2 : blend;
        if (!ctl) { posedOnce(name); return; }
        var clip = spec.poseClip ? spec.poseClip(name) : null;
        if (clip) { ctl.hold(clip, blend, name); return; }
        if (ctl.has(name)) { ctl.play(name, { loop: true, fade: blend }); return; }
        JG.track.stub('pose', spec.base + '.' + name, spec.defaultClip || 'idle');
        ctl.play(spec.defaultClip || 'idle', { loop: true, fade: blend });
      },
      play: function (clip, opts) {
        if (!ctl) return posedOnce(clip);
        return ctl.play(clip, opts || {});
      },
      pulse: function (name) { return ctl ? ctl.pulse(name) : { duration: 0, stop: function () {} }; },
      lookAt: function (target) { look.target = target || null; },
      setExpression: function (name, fade) { a.expression = name; if (spec.face) spec.face.set(name, fade === undefined ? 0.15 : fade); },
      setMouth: function (level) { if (spec.face) spec.face.mouth(level || 0); },
      attach: function (prop, anchorName) {
        var m = propMeshes[prop];
        if (anchorName === false || anchorName === null) { if (m && m.parent) m.parent.remove(m); return; }
        if (!m) m = propMeshes[prop] = props.make(kit, prop);
        var an = typeof anchorName === 'string' ? anchorName : (prop === 'headphones' ? 'head' : 'handR');
        var anchor = a.anchors[an] || a.anchors[{ hand: 'handR' }[an]] || root;
        anchor.add(m);
        // the prop sits in the anchor's reference frame (the rig's reference pose, rotated into the actor's upright
        // frame), pushed along the bone by `along` metres, then offset by `root` metres in that upright frame
        var ws = new THREE.Vector3(1, 1, 1), o2 = anchor, rs = spec.rig && spec.rig.rest && spec.rig.rest[anchor.name];
        while (o2 && o2 !== root) { ws.multiply(o2.scale); o2 = o2.parent; }
        m.scale.set(1 / (ws.x || 1), 1 / (ws.y || 1), 1 / (ws.z || 1));
        var off = spec.propOffset ? spec.propOffset(prop, an) || {} : {};
        if (rs) {
          var inv = rs.Wb.clone().invert();
          m.quaternion.copy(inv);
          var p = new THREE.Vector3().fromArray(off.root || [0, 0, 0]).applyQuaternion(inv);
          p.addScaledVector(rs.axis, off.along || 0);
          m.position.copy(p).divide(ws);
        } else { m.quaternion.identity(); m.position.fromArray(off.root || [0, 0, 0]).divide(ws); }
        if (off.rot) m.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(off.rot[0], off.rot[1], off.rot[2])));
        emit('attach');
      },
      setCape: function (mode) { a.capeMode = mode; if (spec.cape) spec.cape(mode); },
      on: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      debug: function () {
        return { kind: spec.kind || 'actor', actions: ctl ? ctl.actions() : (staticMixer ? [staticMixer] : []), expression: a.expression,
          held: ctl ? ctl.held() : staticName };
      }
    };
    a._emit = emit;
    a.reset();   // the world may stage an actor right after creating it, without a cleanSlate in between
    function applyLook(dt) {
      look.w += ((look.target ? 1 : 0) - look.w) * Math.min(1, dt * 6);
      var tgt = look.target || look.last;
      if (!tgt) return;
      look.last = tgt;
      var head = spec.headBone;
      root.updateMatrixWorld(true);
      head.getWorldPosition(hp);
      if (tgt.isVector3) tp.copy(tgt); else tgt.getWorldPosition(tp);
      var ry = root.getWorldQuaternion(pq); // yaw of the actor in world
      var fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ry);
      var yaw = Math.atan2(tp.x - hp.x, tp.z - hp.z) - Math.atan2(fwd.x, fwd.z);
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      var lim = spec.lookLimit || 1.0;
      yaw = Math.max(-lim, Math.min(lim, yaw)) * look.w;
      tq.setFromAxisAngle(UP, yaw);
      head.parent.getWorldQuaternion(pq);
      var q = pq.clone().invert().multiply(tq).multiply(pq);
      // When nothing rewrote the head this frame (a finished, non-looping clip, a held pose), its quaternion is still
      // last frame's output: undo last frame's look first, or the yaw accumulates and the head spins.
      if (look.out && look.in && head.quaternion.angleTo(look.out) < 1e-5) head.quaternion.copy(look.in);
      look.in = (look.in || new THREE.Quaternion()).copy(head.quaternion);
      head.quaternion.premultiply(q);
      look.out = (look.out || new THREE.Quaternion()).copy(head.quaternion);
    }
    return a;
  }

  // ===============================================================================================================
  // human base bodies (exec, ops, old lady, extras): rig + dress + face + scale, from the cast file's data
  // ===============================================================================================================
  /**
   * d = { from: 'body-female'|'body-male' | (instance) -> id, height?: metres | scale?: factor, kind,
   *   paint: {base, rules} | (instance) -> {base, rules}, perInstance: bool, thickness,
   *   shells: [shell] | (instance) -> [shell], hide: ['hair'|'cloth'] | (instance) -> [...] (JG.dress),
   *   face: {frames, neutral, style} | (instance) -> {frames, neutral, style}, defaultClip, lookLimit, mixer: false, lowHull: false (hide the hull on the low tier),
   *   props: {prop: {along, root, rot}} }
   */
  function human(kit, info, d) {
    var inst = info.instance || 0;
    var from = typeof d.from === 'function' ? d.from(inst) : d.from;
    var rig = JG.rig.create({ kit: kit, from: from });
    var paint = typeof d.paint === 'function' ? d.paint(inst) : (d.paint || {});
    var shells = typeof d.shells === 'function' ? d.shells(inst) : d.shells, hide = typeof d.hide === 'function' ? d.hide(inst) : d.hide;
    var dr = JG.dress.apply(kit, rig, Object.assign({ key: info.base + (d.perInstance ? ':' + inst : ''), thickness: d.thickness, shells: shells, hide: hide }, paint));
    var fd = typeof d.face === 'function' ? d.face(inst) : d.face;
    var face = fd && JG.face ? JG.face.create(kit, { rig: rig, mesh: rig.mesh, frames: fd.frames, neutral: fd.neutral, style: fd.style,
      landmarks: dr.landmarks, surface: dr.faceSurface, base: info.base + (inst ? ':' + inst : '') }) : null;
    var srcH = (rig.root.userData && rig.root.userData.height) || 1.7;
    var s = d.scale || (d.height ? d.height / srcH : 1);
    rig.root.scale.setScalar(s);
    var B = rig.byName;
    var anchors = { head: B.Head, eyes: B.Head, earR: B.Head, chest: B.spine_03, backUpper: B.spine_03, handL: B.hand_l, handR: B.hand_r, hip: B.pelvis, seat: B.pelvis };
    var k = s * (rig.legRatio || 1);
    var a = actor(kit, {
      id: info.id, base: info.base, kind: d.kind || 'human', height: srcH * s, radius: 0.28, model: rig.root, rig: rig, animRoot: rig.root,
      anchors: anchors, headBone: B.Head, lookLimit: d.lookLimit || 1.0, defaultClip: d.defaultClip || 'idle', mixer: d.mixer,
      natural: { walk: 1.45 * k, run: 3.9 * k }, face: face,
      afterMixer: face ? function (dt, ctl, reset) { if (reset) face.resetBlink(); else face.tick(dt); } : null,
      quality: function (tier) { if (d.lowHull === false && dr.hull) dr.hull.visible = tier !== 'low'; },
      propOffset: function (prop, an) {
        var P = (d.props && d.props[prop]) || {};
        if (P.along !== undefined || P.root) return P;
        return prop === 'headphones' ? { along: 0.13 } : (an === 'handL' || an === 'handR' ? { along: 0.08 } : {});
      }
    });
    a.dress = dr;
    a.face = face;
    a.scale = s;
    return a;
  }

  // bone lists for clips.compose masks
  var FING = ['index', 'middle', 'ring', 'pinky', 'thumb'];
  function armBones(s) {
    var out = ['clavicle_' + s, 'upperarm_' + s, 'lowerarm_' + s, 'hand_' + s];
    FING.forEach(function (f) { for (var i = 1; i <= 4; i++) out.push(f + (i === 4 ? '_04_leaf_' : '_0' + i + '_') + s); });
    return out;
  }

  /** the comfort hug's staging, shared by roo.hugHold and ops.hugReceive (their key poses reach for each other's bodies).
   *  The beat (story/act2.js comfort) stands Roo on office.hug.roo turned -0.1 and the ops lead at [0.2, 0, 0.52] from
   *  it turned PI + 0.25: in Roo's root frame she stands at (x, 0, z) turned yaw. opsScale is her rig's root scale
   *  (cast-ops height 1.68 m over body-male's 1.66 m, hair included since the Stage 1b people pass), for targets in her rig space. Points are [x, y, z] arrays. */
  var hug = {
    x: 0.2 * Math.cos(0.1) + 0.52 * Math.sin(0.1), z: -0.2 * Math.sin(0.1) + 0.52 * Math.cos(0.1), yaw: Math.PI + 0.35, opsScale: 1.68 / 1.66,
    /** a point (w = 1) or direction (w = 0) from her root frame (metres) to Roo's */
    toRoo: function (p, w) {
      var c = Math.cos(hug.yaw), s = Math.sin(hug.yaw), o = w === 0 ? 0 : 1;
      return [hug.x * o + p[0] * c + p[2] * s, p[1], hug.z * o - p[0] * s + p[2] * c];
    },
    /** a point (w = 1) or direction (w = 0) from Roo's root frame (metres) to her root frame (metres) */
    toOps: function (p, w) {
      var c = Math.cos(hug.yaw), s = Math.sin(hug.yaw), o = w === 0 ? 0 : 1, dx = p[0] - hug.x * o, dz = p[2] - hug.z * o;
      return [dx * c - dz * s, p[1], dx * s + dz * c];
    }
  };

  JG.anim = { armBones: armBones, ARMS: armBones('l').concat(armBones('r')), RIGHT_ARM: armBones('r'), route: route, routes: routes, resolve: resolve, controller: controller, actor: actor, human: human, props: props, P: A, GENERIC: GENERIC, hug: hug };
})();
