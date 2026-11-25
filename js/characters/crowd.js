/* JG.crowd: the street crowd for the play beats street-subway and plaza-walk (round 2). OWNER: the story/crowd agent.
 * Classic script; at load it only registers the two light crowd bodies with the boot manifest. Nothing is built until
 * a beat calls JG.crowd.start(w).
 *
 * Crowd NPCs are NOT cast members: they are never staged, never in world.snapshot() or the state hash, and the
 * autopilot does not steer round them (they make room instead). Everything they do is driven from the beat's scope,
 * so a skip, goto or finish removes them on the same frame.
 *
 *   JG.crowd.start(w, beatId?) -> handle     spawns the beat's walkers and standers, updates them every tick of the
 *                                            beat's scope, and takes them off the scene when the scope ends
 *     handle.barker -> Actor | null          the NPC standing at the beat's bark marker (contract crowd.barks)
 *     handle.dist(actor) -> metres           Roo's distance to an NPC (xz)
 *     handle.passing(actor, near, by) -> bool  true once Roo is within `near` m, or has come within `by` m and is
 *                                            moving away again (he walked past)
 *     handle.watch(actor, on)                the NPC's head follows Roo whatever the distance (a bark); the bark
 *                                            NPC also turns to face him, and walks a few steps towards him when the
 *                                            call starts far off (stepBarker), then goes back to his spot
 *     handle.npcs                            [{id, actor, kind: 'walker'|'stander'|'barker'}]
 *     handle.spot(id) -> Actor | null        the stander standing at crowdSpots entry `id` (the office gossipers)
 *   JG.crowd.bodies() -> [{x, y, z, r}]      the crowd NPCs on the scene now (the keyboard player's push-out
 *                                            collision, JG.player; r: a stander's radius, its hands' reach + Roo's arm)
 *   JG.crowd.lod(w, castIds, far, {cull})    for the rest of w's scope, the named cast extras' ink hulls show only on
 *                                            the high tier and within `far` m of the camera (the crowd NPCs' rule),
 *                                            and the cast ids in cull hide while outside the view; restored on cancel
 *
 * Sources, per beat: the current SceneInstance's crowd[beatId] (walker paths: {id, points: [[x,z],...], loop, count,
 * lane?, lat?: [min, max]}), crowdSpots[beatId] (standers: {id, pos: [x,y,z], yaw, pose: 'idle'|'phone'|'lean'|
 * 'talk'}), barkGates[beatId] ([{min: [x,z], max: [x,z]}]) and the bark marker named in JG.CONTRACT.crowd.barks. A beat
 * whose set provides none of these gets no crowd. The set is the beat's stage scene (any registered set; the office
 * has the gossipers and the phone guy of office-walk). Opt-in spot keys (the office's; the street spots use none, so
 * their NPCs are unchanged): female (the sex draw is still made, its result overridden), look (merged over the drawn
 * look afterwards, so the rng sequence is unchanged), lookAt: '<spot id>' (the head follows that stander instead of
 * Roo), lookNear (the distance under which the head turns to Roo on its own; 0: never, only when watched). A set may
 * also give crowdHullFar (metres; default HULL_FAR). handle.passing(barker, ...) is also true once Roo is inside a bark
 * gate, so a route that keeps away from the bark NPC still hears the bark.
 *
 * Walkers keep to their lane (path.lane, default LANE 0.45 m, by walking direction on a there-and-back path) and step
 * aside within the path's lat range (the set checks that range against its furniture). Nobody walks through anybody:
 * a walker follows one ahead going its way, steps round one coming the other way or standing, gives way at a crossing
 * (closest-approach prediction: the one with the other more in front of it yields), and a hard check never lets a
 * step bring it nearer than SEP to another NPC or Roo. Corners blend the lane's normal over CORNER m, so the lateral
 * offset never jumps. SEP 0.75 m keeps walkers sharing a pavement a shoulder apart.
 * Standers (and walkers when they pause) hold a standing clip (standClip): the library pose's upper body, the torso
 * set upright, and a relaxed stance below (weight on one leg, the other foot a little forward, knees soft, feet
 * planted), solved per NPC.
 *
 * Determinism: one JG.rng per beat (seeded from the beat id, never the shared JG.random stream): the same NPCs, looks,
 * positions and phases on every entry, whatever came before. Pooling: an NPC is built the first time its beat runs
 * (JG.anim.human on the light crowd body, dressed by JG.dress, a small face) and kept for later entries; leaving the
 * beat stops it and takes it off the scene.
 * Budget (plan section 5, extras): one body and one hull draw call (2.5k + 2.5k triangles) plus the face strip; the
 * hull is off beyond HULL_FAR m and on the low tier, the face beyond FACE_FAR m. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var BODY = { f: 'body-crowd-female', m: 'body-crowd-male' };
  if (JG.manifest) Object.keys(BODY).forEach(function (k) { JG.manifest.add(BODY[k], 'assets/models/' + BODY[k] + '.glb'); });

  var LIB = { idle: 'Idle_Loop', phone: 'Idle_TalkingPhone_Loop', lean: 'Idle_FoldArms_Loop', talk: 'Idle_Talking_Loop' };
  var HULL_FAR = 10, FACE_FAR = 14, LOOK_NEAR = 4.5, ROO_CLEAR = 2.4, LANE = 0.45, LAT = 1.1, CORNER = 0.8, SEP = 0.75, SIDESTEP = 0.8;
  // the bark NPC's call (stepBarker); the player's collision radius round a stander: its hands' reach plus Roo's arm
  var CALL = { from: 4.2, stop: 3.4, max: 2.2, speed: 1.0, r: 0.3 }, STAND_R = 0.75, ROO_ARM = 0.48;
  var live = [];   // the NPCs of the running beat (bodies())

  // ------------------------------------------------------------------------------------------------ looks
  var SKINS = ['#F1C9A5', '#E0AC85', '#C68B66', '#A86F4C', '#8A5638', '#6B4128'];
  var HAIRS = ['#1E1A18', '#3B2A20', '#5A3A22', '#8A6A45', '#C9A36A', '#2B2420', '#7A2E1E', '#A8A8A8'];
  var TOPS = ['#1F4FD8', '#FFD21F', '#2FA36B', '#F26B3A', '#6F8FAF', '#FFF8E7', '#B5656B', '#A59ACF', '#3FB3C9', '#C9B458', '#30343B'];
  var JACKETS = ['#30343B', '#5A3A22', '#2A3550', '#8C2F39', '#4E5A3A', '#6B6F78'];
  var BOTTOMS = ['#2A3550', '#3F4A56', '#1C1C22', '#5A5348', '#6B7A8F', '#7A5C3E', '#2E4D3A'];
  // no magenta tops: it is Roo's cape colour (and the plaza bark woman's)
  var SKIRTS = ['#1C1C22', '#8C2F39', '#2A3550', '#C9B458', '#5A5348'];
  var SHOES = ['#111111', '#F2F2F2', '#5A3A22', '#B5302E', '#22262E'];
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  // the tee / jacket hem (fraction of the bind height): one height for every bone, the same as the "above the belt"
  // rule, so the colour border on the jeans' waistband is level (at 0.515 for pelvis and spine_01 but 0.53 for the
  // thigh-weighted triangles beside them, it dipped in a V at the centre front)
  var HEM = 0.53;

  /** paint rules for JG.dress (first match wins; y, z, x are fractions of the body's bind height). The crowd bodies
   *  carry CC0 MakeHuman clothes (a tee and jeans: part 'cloth'), trainers ('cloth2') and two hairstyles ('hair1',
   *  'hair2'; one is hidden per NPC). The skin under the clothes is painted like the clothes over it, so where the
   *  light body pokes through it never shows a skin-coloured patch. */
  function outfit(o) {
    var R = [], top = o.jacket || o.top;
    // hair and shoes
    R.push({ part: 'hair', color: o.hair });
    R.push({ part: 'cloth2', color: o.shoes });
    // the garment: an open jacket over the tee, or the tee alone (long sleeves are painted onto the forearms below).
    // The hem is level at HEM: spine_01 also weights the jeans' waistband at the centre front and back, so without
    // this rule /^spine_/ below would pull a V of the top's colour down into the jeans there
    R.push({ part: 'cloth', bones: /^spine_01$/, yMax: HEM, color: o.skirt || o.bottom });
    if (o.jacket) {
      R.push({ part: 'cloth', bones: /^(spine_|neck_01)/, yMin: 0.6, zMin: 0.02, xMax: 0.035, color: o.top });
      R.push({ part: 'cloth', bones: /^(spine_|clavicle|upperarm|lowerarm|neck_01)/, color: o.jacket });
      R.push({ part: 'cloth', bones: /^(pelvis|spine_01)$/, yMin: HEM, color: o.jacket });
    } else {
      R.push({ part: 'cloth', bones: /^(spine_|clavicle|upperarm|lowerarm|neck_01)/, color: o.top });
      R.push({ part: 'cloth', bones: /^(pelvis|spine_01)$/, yMin: HEM, color: o.top });
    }
    R.push({ part: 'cloth', yMin: HEM, color: o.jacket || o.top });   // anything of the garment above the belt is the top
    if (o.shorts || o.skirt) {
      R.push({ part: 'cloth', bones: /^calf/, color: o.legs || o.skin });
      R.push({ part: 'cloth', bones: /^thigh/, yMax: o.skirt ? 0.36 : 0.4, color: o.legs || o.skin });
    }
    R.push({ part: 'cloth', color: o.skirt || o.bottom });
    // the body: a hair-coloured scalp under the hair, skin at the head, neck and hands, forearms bare unless the
    // sleeves are long, and everything under the clothes in the clothes' colours
    if (!o.bald) R.push({ bones: /^Head$/, yMin: o.female ? 0.955 : 0.962, color: o.hair });
    R.push({ bones: /^(Head|neck_01)$/, color: o.skin });
    R.push({ bones: /^(hand_|index|middle|ring|pinky|thumb)/, color: o.skin });
    R.push({ bones: /^lowerarm/, color: o.longSleeves || o.jacket ? top : o.skin });
    R.push({ bones: /^spine_01$/, yMax: HEM, color: o.skirt || o.bottom });
    R.push({ bones: /^(spine_|clavicle|upperarm)/, color: top });
    R.push({ bones: /^pelvis$/, yMin: 0.56, color: top });
    R.push({ bones: /^(foot|ball)/, color: o.shoes });
    if (o.shorts || o.skirt) R.push({ bones: /^(calf)/, color: o.legs || o.skin });
    R.push({ bones: /^(pelvis|thigh|calf)/, color: o.skirt || o.bottom });
    return { base: o.skin, rules: R };
  }
  /** which hairstyle shows: hair1 (ponytail / short), hair2 (bob / afro), or none */
  function hideOf(o) { return o.bald ? ['hair'] : [o.hair2 ? 'hair1' : 'hair2']; }
  function randomLook(r, female) {
    var o = { female: female, skin: pick(r, SKINS), hair: pick(r, HAIRS), top: pick(r, TOPS), bottom: pick(r, BOTTOMS), shoes: pick(r, SHOES) };
    o.jacket = r() < 0.35 ? pick(r, JACKETS) : null;
    o.longSleeves = !o.jacket && r() < 0.4;
    o.hair2 = r() < (female ? 0.45 : 0.3);
    if (female) { o.skirt = r() < 0.3 ? pick(r, SKIRTS) : null; if (o.skirt && r() < 0.5) o.legs = '#1C1C22'; }
    else { o.bald = r() < 0.1; o.shorts = r() < 0.12; }
    o.height = female ? 1.58 + 0.14 * r() : 1.7 + 0.16 * r();
    o.smile = r() < 0.5;
    return o;
  }
  // the two bark NPCs: a young guy with an afro in a green long-sleeved tee, jeans and white trainers; a woman with a
  // ponytail in magenta, dark skirt and tights, red shoes
  var BARK_LOOK = {
    'street-subway': { female: false, skin: '#C68B66', hair: '#1E1A18', hair2: true, top: '#2FA36B', longSleeves: true, bottom: '#2A3550', shoes: '#F2F2F2', height: 1.78, smile: true },
    'plaza-walk': { female: true, skin: '#E0AC85', hair: '#3B2A20', top: '#E0218A', skirt: '#1C1C22', legs: '#1C1C22', shoes: '#B5302E', height: 1.68, smile: true, lips: '#C0213A' }
  };
  function faceOf(o) {
    var style = { skin: o.skin, brow: o.bald ? '#3B2A20' : o.hair, lashes: o.female ? 'female' : 'male', nose: 'soft' };
    if (o.lips) { style.lips = o.lips; style.lipFill = true; }
    return { neutral: 'neutral', style: style, frames: {
      neutral: { eyes: 'open', brows: 0, mouth: o.smile ? 'smile' : 'flat' },
      talk: { eyes: 'open', brows: 0.3, browUp: 0.3, mouth: 'grin' }
    } };
  }

  // ------------------------------------------------------------------------------------------------ pool
  var pool = {}, serial = 0;
  function build(kit, key, look) {
    var n = ++serial;
    var d = { from: look.female ? BODY.f : BODY.m, height: look.height, kind: 'crowd', perInstance: true, lowHull: false,
      paint: outfit(look), hide: hideOf(look), face: faceOf(look), defaultClip: 'idle', lookLimit: 1.05, mixer: true,
      // the cooler cup Roo hands to Gary (office-walk): turned in the talking hand so it stands upright, its blue band
      // and rim to the camera (unturned it points at the lens and reads as a blue disc)
      props: { paperCup: { along: 0.08, rot: [1.389, 0.336, 0.402] } } };
    var a = JG.anim.human(kit, { id: 'crowd' + n, base: 'crowd', instance: n }, d);
    a.root.name = 'crowd-' + key;
    a.crowdKey = key;
    return a;
  }
  function libClip(a, pose) {
    try { return JG.clips.library(LIB[pose] || LIB.idle, a.rig); } catch (e) { return null; }
  }
  /** the standing clip for a pose, cached per actor (the library idles stand in a wide, mid-stride stance on these
   *  bodies, so the legs are rebuilt): the library clip's tracks above the hips; its pelvis turn, set upright (the
   *  torso's mean lean against the bind pose taken out, and its swing about that mean scaled by SWAY[pose], so the
   *  talk clip's forward bend reads as standing straight); and a relaxed stance below, solved per sample (STANCE_HZ)
   *  with a two-bone leg IK so the feet stay planted whatever the pelvis does: the weight on one leg (the hips
   *  shifted over it, its knee just soft), the other foot a little forward and turned out with the knee bent more,
   *  the hips lowered just enough that both legs keep a slight bend. Which leg takes the weight is fixed per NPC
   *  (hashed from its key). Also records a.crowdReach[pose]: the farthest the hands get from the root (xz), for the
   *  player's collision radius round this NPC (bodies()). */
  var LEGS = /^(thigh|calf|foot|ball)_/, STANCE_HZ = 15, SWAY = { talk: 0.45 };
  var ST = { shift: 0.035, fwd: 0.12, out: 0.015, toeW: 0.07, toeF: 0.26, reach: 0.988, drop: 0.012 };   // x leg length
  function standClip(a, pose) {
    var cache = a.crowdStand || (a.crowdStand = {});
    if (cache[pose] !== undefined) return cache[pose];
    var src = libClip(a, pose), rig = a.rig;
    if (!src || !rig || !rig.rest || !rig.rest.pelvis) return (cache[pose] = src);
    var B = rig.byName;
    if (!B.pelvis || !B.pelvis.parent || !B.thigh_l || !B.calf_l || !B.foot_l || !B.thigh_r || !B.calf_r || !B.foot_r || !B.neck_01) return (cache[pose] = src);
    var c = src.clone();
    try { stance(a, pose, src, c); } catch (e) { JG.error('crowd stance', e); return (cache[pose] = src); }
    c.name = 'crowdStand:' + (LIB[pose] || LIB.idle);
    return (cache[pose] = c);
  }
  function stance(a, pose, src, c) {
    var THREE = window.THREE, V = THREE.Vector3, Q = THREE.Quaternion, rig = a.rig, B = rig.byName, R = rig.rest;
    var saved = rig.bones.map(function (b) { return [b.quaternion.clone(), b.position.clone()]; });
    var root = rig.root || a.root;
    function refPose() { rig.bones.forEach(function (b) { if (R[b.name]) { b.quaternion.copy(R[b.name].Lb); b.position.copy(R[b.name].pos); } }); }
    function wp(b) { return b.getWorldPosition(new V()); }
    function wq(b) { return b.getWorldQuaternion(new Q()); }
    // upper-body tracks that move the torso (the lean measure) and every hand bone (the reach measure)
    var upper = {}, pt = null, hands = ['hand_l', 'hand_r', 'middle_01_l', 'middle_01_r'].filter(function (n) { return B[n]; });
    c.tracks = c.tracks.filter(function (t) {
      var b = t.name.split('.')[0];
      if (t.name === 'pelvis.quaternion') { pt = t; return false; }
      if (LEGS.test(b) || b === 'pelvis') return false;
      if (B[b] && t.name.split('.')[1] === 'quaternion') upper[b] = t.createInterpolant();
      return true;
    });
    var pI = pt ? pt.createInterpolant() : null;
    // the reference (bind) pose: actor axes, leg lengths, the planted feet
    refPose(); root.updateMatrixWorld(true);
    var rq = wq(root), U = new V(0, 1, 0).applyQuaternion(rq), F = new V(0, 0, 1).applyQuaternion(rq), X = new V(1, 0, 0).applyQuaternion(rq);
    var pel0 = wp(B.pelvis), refQ = {}, leg = {};
    ['l', 'r'].forEach(function (s) {
      var h = wp(B['thigh_' + s]), k = wp(B['calf_' + s]), f = wp(B['foot_' + s]);
      leg[s] = { a: h.distanceTo(k), b: k.distanceTo(f), foot: f, side: Math.sign(h.clone().sub(pel0).dot(X)) || (s === 'l' ? 1 : -1),
        dT: k.clone().sub(h).normalize(), dC: f.clone().sub(k).normalize(), qT: wq(B['thigh_' + s]), qC: wq(B['calf_' + s]), qF: wq(B['foot_' + s]) };
    });
    var L = leg.l.a + leg.l.b, lean0 = wp(B.neck_01).sub(pel0);
    var pitch0 = Math.atan2(lean0.dot(F), lean0.dot(U)), roll0 = Math.atan2(lean0.dot(X), lean0.dot(U));
    var parentQ = wq(B.pelvis.parent), parentQi = parentQ.clone().invert();
    // the stance: weight leg w, free leg f (hashed per NPC)
    var w = (hashStr(a.crowdKey || a.root.name || '') & 1) ? 'l' : 'r', f = w === 'l' ? 'r' : 'l';
    var shiftV = X.clone().multiplyScalar(leg[w].side * ST.shift * L);
    leg[w].T = leg[w].foot.clone();
    leg[f].T = leg[f].foot.clone().addScaledVector(F, ST.fwd * L).addScaledVector(X, leg[f].side * ST.out * L);
    leg[w].toe = leg[w].side * ST.toeW; leg[f].toe = leg[f].side * ST.toeF;
    leg[w].pole = F.clone(); leg[f].pole = F.clone().addScaledVector(X, leg[f].side * 0.25).normalize();
    // the samples: the clip's pelvis turn and torso at each, the lean (pitch, roll of neck over pelvis) taken out
    var dur = src.duration || 1, N = Math.max(2, Math.ceil(dur * STANCE_HZ)), times = [], i, k, s;
    for (i = 0; i <= N; i++) times.push(dur * i / N);
    function poseUpper(t) {
      refPose();
      for (var n in upper) B[n].quaternion.fromArray(upper[n].evaluate(t));
      if (pI) B.pelvis.quaternion.fromArray(pI.evaluate(t));
    }
    var pitch = [], roll = [], mp = 0, mr = 0;
    for (i = 0; i <= N; i++) {
      poseUpper(times[i]); root.updateMatrixWorld(true);
      var v = wp(B.neck_01).sub(wp(B.pelvis));
      pitch.push(Math.atan2(v.dot(F), v.dot(U)) - pitch0); roll.push(Math.atan2(v.dot(X), v.dot(U)) - roll0);
      if (i < N) { mp += pitch[i] / N; mr += roll[i] / N; }
    }
    var sway = SWAY[pose] !== undefined ? SWAY[pose] : 1;
    var pq = [], qa = new Q(), qb = new Q();
    for (i = 0; i <= N; i++) {
      poseUpper(times[i]);
      // world correction about the pelvis joint: pitch about X, roll about F, to (swing about the mean) x sway
      var cp = -(pitch[i] - (pitch[i] - mp) * sway), cr = (roll[i] - (roll[i] - mr) * sway);
      qa.setFromAxisAngle(X, cp); qb.setFromAxisAngle(F, cr); qa.multiply(qb);
      var pw = parentQ.clone().multiply(B.pelvis.quaternion);
      pq.push(parentQi.clone().multiply(qa).multiply(pw));
    }
    // the hips' drop: low enough that both legs reach their feet with a slight bend at every sample
    var drop = ST.drop * L;
    for (k = 0; k < 6; k++) {
      var worst = 0;
      for (i = 0; i <= N; i++) {
        refPose(); B.pelvis.quaternion.copy(pq[i]);
        B.pelvis.position.copy(B.pelvis.parent.worldToLocal(pel0.clone().add(shiftV).addScaledVector(U, -drop)));
        root.updateMatrixWorld(true);
        for (s in leg) worst = Math.max(worst, wp(B['thigh_' + s]).distanceTo(leg[s].T) - ST.reach * (leg[s].a + leg[s].b));
      }
      if (worst <= 1e-4) break;
      drop += worst + 1e-4;
    }
    // solve each sample: pelvis, then per leg the knee (two-bone IK, bending towards the pole), the thigh and calf
    // turned from the bind pose onto the new bone directions (same twist frame), the foot flat with its toe out
    var tr = { pelvis: [], pos: [] }, reach = 0, m0 = new THREE.Matrix4();
    ['l', 'r'].forEach(function (s2) { tr['thigh_' + s2] = []; tr['calf_' + s2] = []; tr['foot_' + s2] = []; });
    function frame(d, pole) { var p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize(); return m0.clone().makeBasis(d, p, new V().crossVectors(d, p)); }
    function turn(d0, d1, pole0, pole1) { var A = frame(d0, pole0), Bm = frame(d1, pole1); return new Q().setFromRotationMatrix(Bm.multiply(A.transpose())); }
    for (i = 0; i <= N; i++) {
      poseUpper(times[i]);
      B.pelvis.quaternion.copy(pq[i]);
      B.pelvis.position.copy(B.pelvis.parent.worldToLocal(pel0.clone().add(shiftV).addScaledVector(U, -drop)));
      root.updateMatrixWorld(true);
      tr.pelvis.push(B.pelvis.quaternion.x, B.pelvis.quaternion.y, B.pelvis.quaternion.z, B.pelvis.quaternion.w);
      if (i === 0) tr.pos.push(B.pelvis.position.x, B.pelvis.position.y, B.pelvis.position.z);
      var pwq = wq(B.pelvis);
      ['l', 'r'].forEach(function (s2) {
        var g = leg[s2], hip = wp(B['thigh_' + s2]), D = g.T.clone().sub(hip), dist = Math.min(D.length(), (g.a + g.b) * 0.9999);
        var u = D.normalize(), x = (g.a * g.a - g.b * g.b + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, g.a * g.a - x * x));
        var pp = g.pole.clone().addScaledVector(u, -g.pole.dot(u)).normalize();
        var knee = hip.clone().addScaledVector(u, x).addScaledVector(pp, h), ankle = hip.clone().addScaledVector(u, dist);
        var dT = knee.clone().sub(hip).normalize(), dC = ankle.clone().sub(knee).normalize();
        var qT = turn(g.dT, dT, F, g.pole).multiply(g.qT), qC = turn(g.dC, dC, F, g.pole).multiply(g.qC);
        var qF = new Q().setFromAxisAngle(U, g.toe).multiply(g.qF);
        var lT = pwq.clone().invert().multiply(qT), lC = qT.clone().invert().multiply(qC), lF = qC.clone().invert().multiply(qF);
        tr['thigh_' + s2].push(lT.x, lT.y, lT.z, lT.w); tr['calf_' + s2].push(lC.x, lC.y, lC.z, lC.w); tr['foot_' + s2].push(lF.x, lF.y, lF.z, lF.w);
      });
      // hand reach (xz from the root, with this sample's arms)
      var rp = wp(root);
      hands.forEach(function (n) { var hp = wp(B[n]); reach = Math.max(reach, Math.hypot(hp.x - rp.x, hp.z - rp.z)); });
    }
    var T = new Float32Array(times);
    c.tracks.push(new THREE.QuaternionKeyframeTrack('pelvis.quaternion', T, tr.pelvis));
    c.tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', [0], tr.pos));
    rig.bones.forEach(function (b) {
      if (!LEGS.test(b.name)) return;
      if (tr[b.name]) c.tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', T, tr[b.name]));
      else if (R[b.name]) c.tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', [0], R[b.name].Lb.toArray()));
    });
    (a.crowdReach || (a.crowdReach = {}))[pose] = reach;
    a.crowdStance = { weight: w, drop: drop, lean: [mp, mr], sway: sway, reach: reach, L: L };
    rig.bones.forEach(function (b, j) { b.quaternion.copy(saved[j][0]); b.position.copy(saved[j][1]); });
    root.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------------------------------------------ paths
  function Path(points, loop, o) {
    o = o || {};
    var P = points.map(function (p) { return { x: p[0], z: p[1] }; });
    if (loop && P.length > 2) P.push({ x: P[0].x, z: P[0].z });
    var cum = [0], T = [];
    for (var i = 1; i < P.length; i++) {
      var l = Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z) || 1e-3;
      cum.push(cum[i - 1] + l);
      T.push({ x: (P[i].x - P[i - 1].x) / l, z: (P[i].z - P[i - 1].z) / l, l: l });
    }
    this.P = P; this.cum = cum; this.T = T; this.L = cum[cum.length - 1] || 0.001; this.loop = !!loop && P.length > 2;
    this.lane = o.lane !== undefined ? o.lane : LANE;
    this.latMin = o.lat ? o.lat[0] : -LAT; this.latMax = o.lat ? o.lat[1] : LAT;
  }
  /** point and unit tangent at arc length s (clamped, or wrapped on a loop). The point is on the polyline; within
   *  CORNER m of a corner the tangent blends into the next segment's, so a lane offset along its normal turns the
   *  corner smoothly */
  Path.prototype.at = function (s, out) {
    var P = this.P, cum = this.cum, L = this.L, T = this.T, n = T.length;
    if (this.loop) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
    var i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    var g = i - 1, a = P[g], t = T[g] || { x: 0, z: 1, l: 1 }, k = (s - cum[g]) / t.l;
    var tx = t.x, tz = t.z, from = s - cum[g], to = cum[i] - s;
    var prev = g > 0 ? g - 1 : (this.loop ? n - 1 : -1), next = g < n - 1 ? g + 1 : (this.loop ? 0 : -1), B, w;
    if (prev >= 0 && from < (B = Math.min(CORNER, t.l / 2, T[prev].l / 2))) { w = 0.5 - 0.5 * from / B; tx = t.x * (1 - w) + T[prev].x * w; tz = t.z * (1 - w) + T[prev].z * w; }
    else if (next >= 0 && to < (B = Math.min(CORNER, t.l / 2, T[next].l / 2))) { w = 0.5 - 0.5 * to / B; tx = t.x * (1 - w) + T[next].x * w; tz = t.z * (1 - w) + T[next].z * w; }
    var tl = Math.hypot(tx, tz);
    if (tl < 1e-4) { tx = t.x; tz = t.z; tl = 1; }
    out.x = a.x + t.x * t.l * k; out.z = a.z + t.z * t.l * k; out.tx = tx / tl; out.tz = tz / tl;
    return out;
  };

  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function wrapAngle(x) { return Math.atan2(Math.sin(x), Math.cos(x)); }

  // ------------------------------------------------------------------------------------------------ plan
  /** the beat's NPCs, deterministic: [{key, kind, look, path?, s?, dir?, speed?, ph, pos?, yaw?, pose?}] */
  function plan(beatId, inst) {
    inst = inst || {};
    var paths = inst.crowd && inst.crowd[beatId] ? inst.crowd[beatId] : [];
    var spots = inst.crowdSpots && inst.crowdSpots[beatId] ? inst.crowdSpots[beatId] : [];
    var barkSpec = JG.CONTRACT && JG.CONTRACT.crowd && JG.CONTRACT.crowd.barks && JG.CONTRACT.crowd.barks[beatId];
    var rng = JG.rng(hashStr('crowd:' + beatId)), out = [];
    // walkers: spaced along their paths, alternating directions on ping-pong paths
    paths.forEach(function (p) {
      var path = new Path(p.points || [], p.loop, p), cnt = Math.max(1, p.count || 1);
      for (var j = 0; j < cnt; j++) {
        var look = randomLook(rng, rng() < 0.5);
        var s = path.L * ((j + 0.15 + 0.5 * rng()) / cnt), dir = path.loop || j % 2 === 0 ? 1 : -1;
        out.push({ key: beatId + ':w:' + p.id + ':' + j, kind: 'walker', look: look, path: path, s: s, dir: dir, speed: 1.15 + 0.35 * rng(), ph: rng() });
      }
    });
    spots.forEach(function (sp) {
      var fem = rng() < 0.5;
      if (sp.female !== undefined) fem = !!sp.female;
      var look = randomLook(rng, fem);
      if (sp.look) Object.assign(look, sp.look);
      out.push({ key: beatId + ':s:' + sp.id, kind: 'stander', look: look, pos: sp.pos, yaw: sp.yaw || 0, pose: sp.pose || 'idle', ph: rng(),
        spot: sp.id, lookAt: sp.lookAt || null, lookNear: sp.lookNear });
    });
    // the bark NPC stands on the contract marker
    if (barkSpec) {
      var m = inst.markers && inst.markers[barkSpec.spot], at = m ? { pos: m.pos, yaw: m.yaw || 0 } : null;
      if (at) {
        var bp = Array.isArray(at.pos) ? at.pos : [at.pos.x, at.pos.y, at.pos.z];
        out.push({ key: beatId + ':bark', kind: 'barker', look: BARK_LOOK[beatId] || randomLook(rng, false), pos: bp, yaw: at.yaw || 0, pose: 'idle', ph: 0.37 });
      }
    }
    return out;
  }
  function get(kit, key, look) { return pool[key] || (pool[key] = build(kit, key, look)); }
  /** the SceneInstance of a beat's stage scene (city for the street beats, office for office-walk) */
  function sceneFor(beatId) {
    var b = JG.beats && JG.beats.get(beatId), id = (b && b.stage && b.stage.scene) || 'city';
    return JG.world && JG.world.inst && JG.scenes && JG.scenes.has(id) ? JG.world.inst(id) : null;
  }

  /** builds a beat's NPCs and their standing clips ahead of time, one per frame, inside a beat (call from the
   *  cinematic before it) */
  function prewarm(w, beatId) {
    return w.fork(async function (w2) {
      var kit = JG.world.kit, list = plan(beatId, sceneFor(beatId));
      for (var k = 0; k < list.length; k++) {
        var e = list[k], pose = e.kind === 'walker' ? 'idle' : e.pose, a = pool[e.key];
        if (a && a.crowdStand && a.crowdStand[pose] !== undefined) continue;
        // the body (and dress) one frame, its standing clip (the stance solve) the next
        if (!a) { try { a = get(kit, e.key, e.look); } catch (err) { JG.error('crowd prewarm', err); return; } await w2.frame(); }
        standClip(a, pose);
        await w2.frame();
      }
    });
  }

  // ------------------------------------------------------------------------------------------------ start
  function start(w, beatId) {
    beatId = beatId || w.beat;
    var W = JG.world, kit = W.kit, inst = W.current || {};
    var roo = W.hasActor('roo') ? W.actor('roo') : null;
    var npcs = [], tmp = {}, barker = null;
    var gates = (inst.barkGates && inst.barkGates[beatId]) || [];

    function place(a, x, y, z, yaw) {
      a.root.position.set(x, y, z); a.root.rotation.y = yaw;
      a.root.updateMatrixWorld(true);
      if (!a.root.parent) W.scene.add(a.root);
    }
    function phase(a, k) {
      var b = a.ctl && a.ctl.base && a.ctl.base();
      if (b && b.act) b.act.time = k * (b.act.getClip().duration || 1);
    }
    function hold(a, pose) {
      var c = standClip(a, pose);
      if (c && a.ctl) a.ctl.hold(c, 0, pose); else a.pose('idle', 0);
      if (pose === 'phone') a.attach('phone', 'handR');
    }
    function laneOf(path, dir) { return clampLat(path, path.loop ? path.lane : dir * path.lane); }
    function clampLat(path, l) { return Math.max(path.latMin, Math.min(path.latMax, l)); }

    plan(beatId, inst).forEach(function (e) {
      var a = get(kit, e.key, e.look);
      a.reset();
      if (e.kind === 'walker') {
        var lane = laneOf(e.path, e.dir);
        var n = { id: e.key, actor: a, kind: 'walker', path: e.path, s: e.s, dir: e.dir, speed: e.speed, v: e.speed, pause: 0, lat: lane, latT: lane,
          ph: e.ph, hx: 0, hz: 1, blk: 0, idx: npcs.length };
        e.path.at(e.s, tmp);
        place(a, tmp.x - tmp.tz * n.lat, 0, tmp.z + tmp.tx * n.lat, Math.atan2(tmp.tx * e.dir, tmp.tz * e.dir));
        hold(a, 'idle');   // what a walker shows when it stops (turning round, waiting for someone to pass)
        npcs.push(n);
      } else {
        place(a, e.pos[0], e.pos[1] || 0, e.pos[2], e.yaw);
        hold(a, e.pose);
        phase(a, e.ph);
        npcs.push({ id: e.key, actor: a, kind: e.kind, pose: e.pose, yaw: e.yaw, idx: npcs.length, v: 0, home: { x: e.pos[0], z: e.pos[2], yaw: e.yaw },
          r: Math.max(STAND_R, ((a.crowdReach && a.crowdReach[e.pose]) || 0) + ROO_ARM), spot: e.spot || null, lookAtSpot: e.lookAt || null,
          lookNear: e.lookNear !== undefined ? e.lookNear : LOOK_NEAR });
        if (e.kind === 'barker') barker = a;
      }
    });
    live = npcs;
    // a stander that looks at another (lookAt: its spot id)
    npcs.forEach(function (n) { if (n.lookAtSpot) npcs.forEach(function (o) { if (o.spot === n.lookAtSpot) n.partner = o; }); });
    var hullFar = inst.crowdHullFar || HULL_FAR;
    npcs.forEach(function (n) { n.actor.update(0, {}); });
    npcs.forEach(function (n, k) { if (n.kind === 'walker') { stepWalker(n, 0); n.actor.update(0, {}); phase(n.actor, n.ph); } });

    var watched = {}, rooHead = roo && roo.anchors && (roo.anchors.head || roo.root);
    var hist = {};

    function rooPos() { return roo && W.staged('roo') ? roo.root.position : null; }
    /** would standing at (x, z) bring n nearer than SEP to anyone (another NPC, or Roo) than it is now? */
    function crowds(n, x, z) {
      var p = n.actor.root.position, r = rooPos();
      for (var k = 0; k <= npcs.length; k++) {
        var q = k < npcs.length ? (npcs[k] === n ? null : npcs[k].actor.root.position) : r;
        if (!q) continue;
        var dn = Math.hypot(x - q.x, z - q.z);
        if (dn < SEP && dn < Math.hypot(p.x - q.x, p.z - q.z) - 1e-6) return true;
      }
      return false;
    }
    function stepWalker(n, dt) {
      var a = n.actor, path = n.path, r = rooPos(), p = a.root.position;
      path.at(n.s, tmp);
      var hx = tmp.tx * n.dir, hz = tmp.tz * n.dir;
      if (n.pause > 0) {
        n.pause -= dt; n.v = 0;
        a.setLocomotion(0);
        var want = Math.atan2(hx, hz);
        a.root.rotation.y += wrapAngle(want - a.root.rotation.y) * Math.min(1, dt * 4);
        var pl = n.lat + (n.latT - n.lat) * Math.min(1, dt * 2), px = tmp.x - tmp.tz * pl, pz = tmp.z + tmp.tx * pl;
        if (!crowds(n, px, pz)) { n.lat = pl; a.root.position.set(px, p.y, pz); }
        return;
      }
      var v = n.speed, latT = laneOf(path, n.dir);
      // make room for Roo: slow down and step to the side of the path away from him when he is ahead and close
      if (r) {
        var dx = r.x - p.x, dz = r.z - p.z, d = Math.hypot(dx, dz) || 0.001, ahead = (dx * hx + dz * hz) / d;
        if (d < ROO_CLEAR && ahead > -0.3) {
          var side = dx * -tmp.tz + dz * tmp.tx;           // + when Roo is on the path's +normal side
          latT = (side > 0 ? -1 : 1) * 1.0;
          if (ahead > 0.2) v *= Math.max(0, Math.min(1, (d - 0.75) / 1.1));
        }
      }
      // never walk through anyone: follow a walker ahead going the same way at its pace; step round anyone else
      // ahead (oncoming walkers on the same path already keep to their own lane); give way at a crossing
      for (var k = 0; k < npcs.length; k++) {
        var o = npcs[k];
        if (o === n) continue;
        var q = o.actor.root.position, ox = q.x - p.x, oz = q.z - p.z, od = Math.hypot(ox, oz);
        if (od > 3.5 || od < 1e-4) continue;
        var moving = o.kind === 'walker' && o.pause <= 0 && o.v > 0.1, fwd = (ox * hx + oz * hz) / od, same = o.hx * hx + o.hz * hz;
        if (moving && Math.abs(same) < 0.85) {
          // crossing paths: closest approach over the next 2 s at the current velocities
          var rvx = o.hx * o.v - hx * n.speed, rvz = o.hz * o.v - hz * n.speed, rr = rvx * rvx + rvz * rvz;
          var tc = rr > 1e-6 ? Math.max(0, Math.min(2, -(ox * rvx + oz * rvz) / rr)) : 0, mx = ox + rvx * tc, mz = oz + rvz * tc;
          if (mx * mx + mz * mz < 0.8 * 0.8) {
            var oFwd = -(ox * o.hx + oz * o.hz) / od;   // how far in front of the other one I am
            if (fwd > oFwd + 1e-3 || (Math.abs(fwd - oFwd) <= 1e-3 && n.idx < o.idx)) v = Math.min(v, n.speed * Math.max(0, Math.min(1, (od - 0.9) / 1.2)));
          }
        }
        if (od > 1.3 || fwd < 0.4) continue;
        if (moving && same > 0.3) { if (od < 1.15) v = Math.min(v, o.v * 0.95); continue; }
        var lateral = ox * -hz + oz * hx;                 // + when the other one is on my left
        if (Math.abs(lateral) < SIDESTEP) { latT = n.lat + (lateral > 0 ? -1 : 1) * 0.8 * (path.loop ? 1 : n.dir); v *= 0.7; }
      }
      latT = clampLat(path, latT);
      n.v += (v - n.v) * Math.min(1, dt * 4);
      n.hx = hx; n.hz = hz;
      n.latT = latT;
      var lat = n.lat + (latT - n.lat) * Math.min(1, dt * 2.2), s = n.s + n.dir * n.v * dt, turn = false;
      if (!path.loop && (s >= path.L || s <= 0)) { s = Math.max(0, Math.min(path.L, s)); turn = true; }
      // the hard check: a step that brings this walker nearer than SEP to anyone is not taken (the sidestep alone
      // may still be); a walker held up this way for 2 s turns back (a there-and-back path) or waits (a loop)
      path.at(s, tmp);
      var cx = tmp.x - tmp.tz * lat, cz = tmp.z + tmp.tx * lat;
      if (dt > 0 && crowds(n, cx, cz)) {
        s = n.s; turn = false; n.v = 0;
        path.at(s, tmp);
        cx = tmp.x - tmp.tz * lat; cz = tmp.z + tmp.tx * lat;
        if (crowds(n, cx, cz)) { lat = n.lat; cx = p.x; cz = p.z; }
        n.blk += dt;
        if (n.blk > 2 && !path.loop) { turn = true; n.blk = 0; }
      } else if (n.v > 0.1) n.blk = 0;
      else if (dt > 0 && v < 0.05) {
        // stopped by the soft rules (Roo standing in the lane, a sidestep that cannot clear him): after 3 s a
        // there-and-back walker turns round instead of waiting in front of him for as long as he stays
        n.blk += dt;
        if (n.blk > 3 && !path.loop) { turn = true; n.blk = 0; }
      }
      n.s = s; n.lat = lat;
      if (turn) { n.dir = -n.dir; n.pause = 0.5 + 0.9 * rng01(n); n.latT = laneOf(path, n.dir); }
      a.root.position.set(cx, p.y, cz);
      var wantYaw = Math.atan2(tmp.tx * n.dir, tmp.tz * n.dir);
      a.root.rotation.y += wrapAngle(wantYaw - a.root.rotation.y) * Math.min(1, dt * 6);
      a.setLocomotion(n.v > 0.08 ? n.v : 0);
    }
    // a per-walker deterministic sequence for the turn-round pauses
    function rng01(n) { n.ph = (n.ph * 7.13 + 0.371) % 1; return n.ph; }

    /** the bark NPC while watched (the bark): the body turns to face Roo; if he called from farther than CALL.from,
     *  he also walks a few steps towards Roo (at most CALL.max m, stopping CALL.stop m from him, never off the walk
     *  rects, into furniture or nearer than SEP to anyone). Unwatched again, he walks back to his spot and turns back
     *  to its yaw. */
    var walkRects = (inst.walk && inst.walk[beatId]) || null, cols = inst.camColliders || [];
    function onWalk(x, z) {
      if (!walkRects) return true;
      for (var k = 0; k < walkRects.length; k++) { var q = walkRects[k]; if (x >= q.min[0] && x <= q.max[0] && z >= q.min[1] && z <= q.max[1]) return true; }
      return false;
    }
    function shown(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
    function clearAt(x, y, z) {
      for (var k = 0; k < cols.length; k++) {
        var c = cols[k];
        if (c.max[1] < y + 0.1 || c.min[1] > y + 1.8) continue;
        if (x + CALL.r < c.min[0] || x - CALL.r > c.max[0] || z + CALL.r < c.min[2] || z - CALL.r > c.max[2]) continue;
        if (c.mesh && !shown(c.mesh)) continue;
        return false;
      }
      return true;
    }
    function stepBarker(n, dt, r) {
      var a = n.actor, p = a.root.position, on = !!(watched[n.id] && r), want, tx = null, tz = null, vT = 0;
      if (on && !n.call) {
        var d0 = Math.hypot(r.x - p.x, r.z - p.z);
        n.go = d0 > CALL.from ? Math.min(CALL.max, d0 - CALL.stop) : 0; n.walked = 0;
      }
      n.call = on;
      if (on) {
        want = Math.atan2(r.x - p.x, r.z - p.z);
        if (n.walked < n.go - 0.02 && Math.hypot(r.x - p.x, r.z - p.z) > CALL.stop) { tx = r.x; tz = r.z; }
      } else {
        var dh = Math.hypot(n.home.x - p.x, n.home.z - p.z);
        if (dh > 0.03) { want = Math.atan2(n.home.x - p.x, n.home.z - p.z); tx = n.home.x; tz = n.home.z; }
        else want = n.home.yaw;
      }
      var err = wrapAngle(want - a.root.rotation.y);
      // walk once roughly facing the way (turn first)
      if (tx !== null && Math.abs(err) < 0.7) vT = CALL.speed;
      n.v += (vT - n.v) * Math.min(1, dt * 5);
      if (n.v > 0.02 && tx !== null) {
        var dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1e-3;
        var st = Math.min(n.v * dt, d, on ? n.go - n.walked : d), nx = p.x + dx / d * st, nz = p.z + dz / d * st;
        if (onWalk(nx, nz) && clearAt(nx, p.y, nz) && !crowds(n, nx, nz)) {
          p.x = nx; p.z = nz;
          if (on) n.walked += st;
        } else if (on) n.go = n.walked;   // blocked: call from here
        else n.v = 0;
      }
      if (tx === null && n.v < 0.05) n.v = 0;
      a.root.rotation.y += err * Math.min(1, dt * (n.v > 0.1 ? 6 : 3.5));
      // a turn on the spot of more than a quarter turn is taken in small steps (the walk cycle, slowly)
      a.setLocomotion(n.v > 0.08 ? n.v : Math.abs(err) > 0.6 ? 0.35 : 0);
    }

    // view culling: the rigs' skinned meshes are never frustum-culled by three (frustumCulled false), so an NPC whose
    // bounding sphere is outside the camera's view is hidden here (its body, hull, face and props draw nothing)
    var THREE = window.THREE, frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1.25);
    function update(dt) {
      var cam = JG.camera && JG.camera.object, cp = cam ? cam.position : null, high = !JG.loop || JG.loop.quality !== 'low';
      var r = rooPos();
      if (cam) { cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pm); }
      for (var k = 0; k < npcs.length; k++) {
        var n = npcs[k], a = n.actor;
        if (n.kind === 'walker') stepWalker(n, dt);
        else if (n.kind === 'barker') stepBarker(n, dt, r);
        if (cam) { sph.center.set(a.root.position.x, a.root.position.y + 0.9, a.root.position.z); a.root.visible = frustum.intersectsSphere(sph); }
        // heads turn toward Roo when he is close (and always for a watched NPC); else to its partner (lookAt) or front
        if (r && rooHead) {
          var d = Math.hypot(r.x - a.root.position.x, r.z - a.root.position.z);
          var want = watched[n.id] || (d < n.lookNear && n.kind !== 'walker') || (d < 2.6 && n.kind === 'walker');
          var tgt = want ? rooHead : (n.partner ? (n.partner.actor.anchors.head || n.partner.actor.root) : null);
          if (tgt !== (n.lookT || null)) { a.lookAt(tgt); n.lookT = tgt; }
        }
        a.update(dt, {});
        if (cp) {
          var dc = cp.distanceTo(a.root.position);
          if (a.dress && a.dress.hull) a.dress.hull.visible = high && dc < hullFar;
          if (a.face && a.face.root) a.face.root.visible = dc < FACE_FAR;
        }
      }
    }
    // settle once now (view culling, hull and face distance, low-tier hull off) so the first rendered frame of the
    // beat never shows the whole crowd with every hull on
    update(0);
    var tk = w.scope.everyTick(function (dt) { update(dt); });
    w.onCancel(function () {
      if (tk && tk.cancel) tk.cancel();
      if (live === npcs) live = [];
      npcs.forEach(function (n) {
        var a = n.actor;
        try { a.setLocomotion(0); a.lookAt(null); a.attach('phone', false); a.attach('paperCup', false); a.setMouth(0); a.setExpression('neutral', 0); } catch (e) { /* never block the exit */ }
        a.root.visible = true;
        if (a.root.parent) a.root.parent.remove(a.root);
      });
    });

    function idOf(a) { for (var k = 0; k < npcs.length; k++) if (npcs[k].actor === a) return npcs[k].id; return null; }
    function inGate() {
      var r = rooPos();
      if (!r) return false;
      for (var k = 0; k < gates.length; k++) { var g = gates[k]; if (r.x >= g.min[0] && r.x <= g.max[0] && r.z >= g.min[1] && r.z <= g.max[1]) return true; }
      return false;
    }
    var handle = {
      npcs: npcs.map(function (n) { return { id: n.id, actor: n.actor, kind: n.kind }; }),
      barker: barker,
      dist: function (a) { var r = rooPos(); return r && a ? Math.hypot(r.x - a.root.position.x, r.z - a.root.position.z) : Infinity; },
      passing: function (a, near, by) {
        var d = handle.dist(a), id = idOf(a) || 'x', h = hist[id] || (hist[id] = { min: Infinity, up: 0 });
        if (d < near) return true;
        if (a && a === barker && inGate()) return true;
        if (d < h.min - 1e-3) { h.min = d; h.up = 0; } else if (d > h.min + 0.05) h.up++;
        return h.min < by && h.up > 3;
      },
      watch: function (a, on) { var id = idOf(a); if (id) watched[id] = !!on; },
      spot: function (id) { for (var k = 0; k < npcs.length; k++) if (npcs[k].spot === id) return npcs[k].actor; return null; }
    };
    return handle;
  }

  /** the cast extras' hulls by camera distance (the crowd's rule), for the rest of w's scope; o.cull: cast ids hidden
   *  while their bounding sphere is outside the camera's view (the crowd NPCs' view culling: skinned meshes are never
   *  frustum-culled by three, so an off-screen principal still costs its whole body) */
  function lod(w, ids, far, o) {
    var W = JG.world, THREE = window.THREE, cull = (o && o.cull) || [], fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1.25);
    function staged(id) { return W.hasActor(id) && W.staged(id) ? W.actor(id) : null; }
    function apply() {
      var cam = JG.camera && JG.camera.object, high = !JG.loop || JG.loop.quality !== 'low';
      if (!cam) return;
      ids.forEach(function (id) { var a = staged(id); if (a && a.dress && a.dress.hull) a.dress.hull.visible = high && cam.position.distanceTo(a.root.position) < far; });
      if (!cull.length) return;
      cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      cull.forEach(function (id) { var a = staged(id); if (!a) return; sph.center.set(a.root.position.x, a.root.position.y + 0.9, a.root.position.z); a.root.visible = fr.intersectsSphere(sph); });
    }
    // after the camera moves (loop.js 'camera-updated'), so a cut is culled against the new view on its first frame
    apply();
    var off = JG.on('camera-updated', apply);
    w.onCancel(function () {
      off();
      var high = !JG.loop || JG.loop.quality !== 'low';
      ids.forEach(function (id) { var a = W.hasActor(id) ? W.actor(id) : null; if (a && a.dress && a.dress.hull) a.dress.hull.visible = high; });
      cull.forEach(function (id) { if (W.hasActor(id)) W.actor(id).root.visible = true; });
    });
  }

  /** the crowd NPCs on the scene now, for the keyboard player's collision: [{x, y, z, r}], r the radius to keep Roo's
   *  centre out of (standers and the bark NPC: their hands' reach plus Roo's arm, at least STAND_R; walkers: none, the
   *  player's own) */
  function bodies() {
    var out = [];
    for (var k = 0; k < live.length; k++) {
      var n = live[k], p = n.actor.root.position;
      if (n.actor.root.parent) out.push({ x: p.x, y: p.y, z: p.z, r: n.r });
    }
    // two standers close together (a chat pair) also get a circle at their midpoint, so Roo goes round the pair
    // instead of squeezing between them into their gesturing hands
    for (var i = 0; i < live.length; i++) {
      var A = live[i];
      if (A.kind !== 'stander' || !A.actor.root.parent) continue;
      for (var j = i + 1; j < live.length; j++) {
        var B = live[j];
        if (B.kind !== 'stander' || !B.actor.root.parent) continue;
        var pa = A.actor.root.position, pb = B.actor.root.position, gap = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        if (gap < 2 * STAND_R + 0.3) out.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2, r: Math.max(A.r || STAND_R, B.r || STAND_R) });
      }
    }
    return out;
  }

  JG.crowd = { start: start, prewarm: prewarm, plan: plan, bodies: bodies, lod: lod, stand: standClip, pool: function () { return pool; }, BODY: BODY };
})();
