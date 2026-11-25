/* JG.rig: the shared skeleton per actor, and the pose helper set P (plan section 6, "The rig" and "The pose helpers").
 * Classic script; defines JG.rig at load and touches THREE only when called.
 *
 * Two poses are recorded on every rig:
 *   rest       every bone at the library mannequin's exact local rotation (UAL1). Library clips write local
 *              rotations in these frames, so they play unchanged; the hips track is scaled by rig.legRatio.
 *   reference  the pose the helpers measure from, and the pose the mesh is bound in. Humans: their rest pose.
 *              Roo: the spike's arms-down layout (every limb hanging straight down), built from bindJoints.
 *
 * With bindJoints (Roo), each bone not in noSwing is swung, parents first, by the shortest arc that takes its rest
 * axis (towards its primary child, measured on the opts.from body's skeleton) onto the bind direction between the
 * given joint positions; other bones follow their parent with the mannequin's local rotation. Bone offsets are then
 * set so the joints sit exactly at bindJoints in that pose; for swung bones they lie along the source skeleton's
 * bone axes, so a library clip bends Roo's limbs the way it bends a human's. rest.Lb / rest.Wb are this reference
 * (bind) pose; rig.restQ holds the mannequin's local rotations that library tracks write.
 *
 * Helper conventions (ported from spike/fable-v2/roo.js, which assumed identity bind rotations): every direction is
 * in the actor's root space (+Z forward, +Y up). A bone's world rotation is written as R x Wb, where Wb is its world
 * rotation in the reference pose and R is the rotation the spike computed, so a pose written for the spike gives the
 * same world-space result on any rig. Local Euler offsets are applied in reference-world axes, conjugated into the
 * bone's frame. Every pose starts from reset(), which puts each bone at its reference rotation and position.
 */
(function () {
  'use strict';
  var JG = window.JG;

  var PRIMARY = {
    root: 'pelvis', pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'Head',
    thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l', ball_l: 'ball_leaf_l',
    thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r', ball_r: 'ball_leaf_r'
  };
  ['l', 'r'].forEach(function (s) {
    PRIMARY['clavicle_' + s] = 'upperarm_' + s; PRIMARY['upperarm_' + s] = 'lowerarm_' + s;
    PRIMARY['lowerarm_' + s] = 'hand_' + s; PRIMARY['hand_' + s] = 'middle_01_' + s;
    ['index', 'middle', 'ring', 'pinky', 'thumb'].forEach(function (f) {
      PRIMARY[f + '_01_' + s] = f + '_02_' + s; PRIMARY[f + '_02_' + s] = f + '_03_' + s; PRIMARY[f + '_03_' + s] = f + '_04_leaf_' + s;
    });
  });
  var FINGERS = ['index', 'middle', 'ring', 'pinky'];

  /**
   * create(opts) -> rig
   *   kit          the kit (for kit.gltf)
   *   from         JG.assets name of a body GLB whose skeleton is the shared one (its mesh is kept unless dropMesh)
   *   dropMesh     true for code-built actors (Roo)
   *   bindJoints   { bone: [x,y,z] } joint positions in the reference (bind) pose, root space; omit for humans
   *   extraBones   [{ name, parent, pos: [x,y,z] }] extra bones, positioned in the reference pose
   *   axes         { bone: [x,y,z] } reference-world along-bone axis overrides (e.g. Roo's hands point straight down)
   *   primary      { bone: childName } primary-child overrides and additions (extra bone chains)
 *   noSwing      [bones] keep the mannequin's local rotation in the bind pose (no swing): use it for rigid parts whose
 *                bind direction differs from the mannequin's on purpose (Roo's upright hips and spine, collarbones,
 *                calves, flat feet), or library clips tilt those parts by the difference
   * rig = { root, armature, bones, byName, skeleton, legRatio, rest: { bone: { Lb, Wb, pos, axis, pole } },
   *         restQ: { bone: Quaternion }, mesh (humans), P }
   */
  function create(opts) {
    var THREE = window.THREE, kit = opts.kit;
    var Q = THREE.Quaternion, V = THREE.Vector3;
    var src = kit.gltf(opts.from);
    var srcMesh = null;
    src.scene.traverse(function (o) { if (o.isSkinnedMesh && !srcMesh) srcMesh = o; });
    if (!srcMesh) throw new Error('rig.create: ' + opts.from + ' has no skinned mesh');
    var srcBones = srcMesh.skeleton.bones;
    var primary = Object.assign({}, PRIMARY, opts.primary || {});
    var noSwing = {}; (opts.noSwing || []).forEach(function (n) { noSwing[n] = true; });

    // world (actor root space) rotations and positions of the source skeleton at rest
    src.scene.updateMatrixWorld(true);
    var rootInv = new THREE.Matrix4().copy(src.scene.matrixWorld).invert();
    function restWorld(b) {
      var m = new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld), p = new V(), q = new Q(), s = new V();
      m.decompose(p, q, s);
      return { p: p, q: q };
    }

    var root, armature, bones = [], byName = {}, mesh = null;
    if (opts.dropMesh) {
      root = new THREE.Group();
      var top = srcBones[0].parent; // the armature node
      armature = new THREE.Object3D();
      armature.name = top && !top.isBone ? top.name : 'Armature';
      if (top && !top.isBone) { armature.position.copy(top.position); armature.quaternion.copy(top.quaternion); armature.scale.copy(top.scale); }
      root.add(armature);
      srcBones.forEach(function (sb) {
        var b = new THREE.Bone();
        b.name = sb.name; b.position.copy(sb.position); b.quaternion.copy(sb.quaternion);
        bones.push(b); byName[b.name] = b;
      });
      srcBones.forEach(function (sb, i) { var p = sb.parent; (p && p.isBone ? byName[p.name] : armature).add(bones[i]); });
    } else {
      root = src.scene; mesh = srcMesh; bones = srcBones.slice();
      bones.forEach(function (b) { byName[b.name] = b; });
      armature = bones[0].parent;
    }
    // the helpers and the bind maths assume no scale between the rig root and the bones
    (function () { var o = armature; while (o && o !== root) { if (Math.abs(o.scale.x - 1) + Math.abs(o.scale.y - 1) + Math.abs(o.scale.z - 1) > 1e-6) throw new Error('rig.create: ' + o.name + ' is scaled; bake the scale into the asset or scale rig.root instead'); o = o.parent; } })();
    var restQ = {};
    bones.forEach(function (b) { restQ[b.name] = b.quaternion.clone(); });
    root.updateMatrixWorld(true);
    var R0 = {};
    srcBones.forEach(function (sb) { R0[sb.name] = restWorld(sb); });

    // extra bones (Roo: tail, ears, jaw, cape root): identity local rotation, placed later
    (opts.extraBones || []).forEach(function (e) {
      var b = new THREE.Bone(); b.name = e.name;
      byName[e.parent].add(b);
      bones.push(b); byName[e.name] = b; restQ[e.name] = new Q();
    });
    var parentOf = function (b) { return b.parent && b.parent.isBone ? b.parent : null; };

    // ---- reference (bind) pose ----
    var Wb = {}, Pb = {};
    var armQ = new Q(); armature.updateMatrixWorld(true);
    (function () { var p = new V(), s = new V(); armature.matrix.decompose(p, armQ, s); })();
    if (opts.bindJoints) {
      var J = {};
      Object.keys(opts.bindJoints).forEach(function (k) { J[k] = new V().fromArray(opts.bindJoints[k]); });
      (opts.extraBones || []).forEach(function (e) { J[e.name] = new V().fromArray(e.pos); });
      bones.forEach(function (b) {   // parent-first (source order is parent-first; extras come after their parents)
        var p = parentOf(b), pq = p ? Wb[p.name] : armQ;
        var cand = pq.clone().multiply(restQ[b.name]);
        if (!J[b.name]) {
          // a joint not given: the mannequin's offset, scaled by the parent's bone-length ratio
          var gp = p && parentOf(p), ratio = 1;
          if (p && gp && R0[p.name] && R0[gp.name] && J[p.name] && J[gp.name]) ratio = J[p.name].distanceTo(J[gp.name]) / Math.max(1e-6, R0[p.name].p.distanceTo(R0[gp.name].p));
          J[b.name] = p ? b.position.clone().multiplyScalar(ratio).applyQuaternion(pq).add(J[p.name]) : b.position.clone();
        }
        var c = primary[b.name] && byName[primary[b.name]];
        if (noSwing[b.name]) c = null;   // keeps the mannequin's local rotation: rigid parts stay put under clips
        if (c && opts.bindJoints[c.name] !== undefined || c && (opts.extraBones || []).some(function (e) { return e.name === c.name; })) {
          var axisRest = (R0[c.name] && R0[b.name]) ? R0[c.name].p.clone().sub(R0[b.name].p).applyQuaternion(R0[b.name].q.clone().invert()).normalize()
            : new V(0, -1, 0).applyQuaternion(cand.clone().invert());
          var cur = axisRest.clone().applyQuaternion(cand), want = J[c.name].clone().sub(J[b.name]).normalize();
          if (cur.lengthSq() > 1e-10 && want.lengthSq() > 1e-10) cand = new Q().setFromUnitVectors(cur.normalize(), want).multiply(cand);
        }
        Wb[b.name] = cand; Pb[b.name] = J[b.name];
      });
      // offsets: joints exactly at J in the bind pose
      bones.forEach(function (b) {
        var p = parentOf(b);
        var pq = p ? Wb[p.name] : armQ, pp = p ? Pb[p.name] : new V().setFromMatrixPosition(armature.matrix);
        b.position.copy(Pb[b.name]).sub(pp).applyQuaternion(pq.clone().invert());
        b.quaternion.copy(pq.clone().invert().multiply(Wb[b.name]));
      });
    } else {
      bones.forEach(function (b) { b.updateMatrixWorld(true); });
      root.updateMatrixWorld(true);
      bones.forEach(function (b) {
        var r = R0[b.name] || (function () { var m = new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld), p = new V(), q = new Q(), s = new V(); m.decompose(p, q, s); return { p: p, q: q }; })();
        Wb[b.name] = r.q.clone(); Pb[b.name] = r.p.clone();
      });
    }
    root.updateMatrixWorld(true);

    // ---- per-bone reference data ----
    var rest = {}, DOWN = new V(0, -1, 0), FRONT = new V(0, 0, 1);
    bones.forEach(function (b) {
      var W = Wb[b.name], Wi = W.clone().invert();
      var c = primary[b.name] && byName[primary[b.name]];
      if (!c) c = b.children.find(function (x) { return x.isBone; });
      var axis;
      if (opts.axes && opts.axes[b.name]) axis = new V().fromArray(opts.axes[b.name]).normalize().applyQuaternion(Wi);
      else if (c) axis = c.position.clone().normalize();
      else axis = DOWN.clone().applyQuaternion(Wi);
      var pole = FRONT.clone().applyQuaternion(Wi);
      pole.addScaledVector(axis, -pole.dot(axis));
      if (pole.lengthSq() < 1e-6) { pole = DOWN.clone().applyQuaternion(Wi); pole.addScaledVector(axis, -pole.dot(axis)); }
      pole.normalize();
      rest[b.name] = { Lb: b.quaternion.clone(), Wb: W.clone(), pos: b.position.clone(), world: Pb[b.name].clone(), axis: axis, pole: pole };
    });

    var skeleton = new THREE.Skeleton(bones);   // inverses computed in the reference pose
    // legRatio scales the library hips track: this rig's hips height over the CLIP SOURCE's (the mannequin's, recorded by
    // the asset build as sourceHipsHeight), not over the body the skeleton was copied from
    var srcHips = src.userData.sourceHipsHeight || (R0.pelvis ? R0.pelvis.p.y - (R0.root ? R0.root.p.y : 0) : 1);
    var rig = {
      root: root, armature: armature, bones: bones, byName: byName, skeleton: skeleton, mesh: mesh, rest: rest, restQ: restQ,
      legRatio: (Pb.pelvis.y - (Pb.root ? Pb.root.y : 0)) / srcHips, source: opts.from, sourceHipsHeight: srcHips
    };
    if (mesh) { mesh.bind(skeleton, mesh.matrixWorld); mesh.frustumCulled = false; }
    rig.P = makeP(rig);
    return rig;
  }

  /* The pose helper set P for one rig. Names are the shared skeleton's (upperarm_l, ...). */
  function makeP(rig) {
    var THREE = window.THREE, V = THREE.Vector3, Q = THREE.Quaternion, M = THREE.Matrix4;
    var B = rig.byName, rest = rig.rest;
    function bone(n) { var b = B[n]; if (!b) throw new Error('rig: no bone ' + n); return b; }
    function arr3(a) { return a && a.isVector3 ? a.clone() : new V(a[0], a[1], a[2]); }
    function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
    function topQ() { var q = new Q(), o = rig.armature; var chain = []; while (o && o !== rig.root) { chain.push(o); o = o.parent; } for (var i = chain.length - 1; i >= 0; i--) q.multiply(chain[i].quaternion); return q; }
    function topP() { rig.armature.updateMatrix(); var m = new M(), o = rig.armature, chain = []; while (o && o !== rig.root) { chain.push(o); o = o.parent; } for (var i = chain.length - 1; i >= 0; i--) { chain[i].updateMatrix(); m.multiply(chain[i].matrix); } return new V().setFromMatrixPosition(m); }
    function parentQ(b) {
      var q = topQ(), chain = [], p = b.parent;
      while (p && p.isBone) { chain.push(p); p = p.parent; }
      for (var i = chain.length - 1; i >= 0; i--) q.multiply(chain[i].quaternion);
      return q;
    }
    function worldQ(n) { var b = typeof n === 'string' ? bone(n) : n; return parentQ(b).multiply(b.quaternion); }
    function worldPos(n) {
      var b = typeof n === 'string' ? bone(n) : n, p = b.parent;
      if (!p || !p.isBone) return b.position.clone().applyQuaternion(topQ()).add(topP());
      return b.position.clone().applyQuaternion(worldQ(p)).add(worldPos(p));
    }
    /** the rotation the spike would report for this bone: current world rotation relative to the reference */
    function deltaQ(n) { return worldQ(n).multiply(rest[typeof n === 'string' ? n : n.name].Wb.clone().invert()); }
    function setWorldQ(n, q) { var b = bone(n); b.quaternion.copy(parentQ(b).invert().multiply(q)); }
    /** set the bone's delta (spike world rotation) */
    function setDelta(n, R) { setWorldQ(n, R.clone().multiply(rest[n].Wb)); }
    function frame(a, b) {
      var x = a.clone().normalize();
      var y = b.clone().addScaledVector(x, -b.dot(x));
      if (y.lengthSq() < 1e-8) { y.set(1, 0, 0).addScaledVector(x, -x.x); if (y.lengthSq() < 1e-8) y.set(0, 0, 1); }
      y.normalize();
      return new M().makeBasis(x, y, new V().crossVectors(x, y));
    }
    /** spike orient(): the delta that takes reference axis a0 onto a1 and reference axis b0 as near as possible to b1 */
    function orient(n, a0, a1, b0, b1) {
      setDelta(n, new Q().setFromRotationMatrix(frame(arr3(a1), arr3(b1)).multiply(frame(arr3(a0), arr3(b0)).transpose())));
    }
    function refAxis(n) { return rest[n].axis.clone().applyQuaternion(rest[n].Wb); }
    function refPole(n) { return rest[n].pole.clone().applyQuaternion(rest[n].Wb); }
    var EULER = new THREE.Euler();
    function conj(n, q) { var W = rest[n].Wb; return W.clone().invert().multiply(q).multiply(W); }

    var P = {
      reset: function () {
        rig.bones.forEach(function (b) { var r = rest[b.name]; b.quaternion.copy(r.Lb); b.position.copy(r.pos); });
      },
      worldQ: worldQ, worldPos: worldPos, deltaQ: deltaQ, setWorldQ: setWorldQ, setDelta: setDelta, orient: orient,
      /** aim(bone, dir, pole): the bone's reference axis points along dir, its reference pole towards pole */
      aim: function (n, dir, pole) { orient(n, refAxis(n), dir, refPole(n), pole || [0, 0, 1]); },
      aimAt: function (n, target, pole) { P.aim(n, arr3(target).sub(worldPos(n)), pole); },
      /** rotLocal(bone, x, y, z): offset from the reference local rotation, Euler XYZ in reference-world axes */
      rotLocal: function (n, x, y, z, order) { EULER.set(x, y, z, order || 'XYZ'); bone(n).quaternion.copy(rest[n].Lb).multiply(conj(n, new Q().setFromEuler(EULER))); },
      rotLocalQ: function (n, q) { bone(n).quaternion.copy(rest[n].Lb).multiply(conj(n, q)); },
      /** hips(pos): the pelvis joint at a root-space position */
      hips: function (pos) {
        var b = bone('pelvis'), p = arr3(pos);
        b.position.copy(p.sub(worldPos(b.parent)).applyQuaternion(worldQ(b.parent).invert()));
      },
      /** where a reference-pose point riding on the bone is now */
      fromRef: function (n, a) { return arr3(a).sub(rest[n].world).applyQuaternion(deltaQ(n)).add(worldPos(n)); },
      /** hand(side, dir, palm): fingers along dir, palm facing palm (root space) */
      hand: function (s, dir, palm) {
        var n = 'hand_' + s;
        orient(n, refAxis(n), dir, P.palmRef(s), palm);
      },
      /** the palm normal of the hand in the reference pose (root space) */
      palmRef: function (s) {
        var ax = refAxis('hand_' + s), k = s === 'l' ? 1 : -1;
        return Math.abs(ax.y) > 0.7 ? new V(-k, 0, 0) : new V(0, -1, 0);   // hanging hand: palm inwards; T-pose: palm down
      },
      /** fingers(side, curlA, curlB, spread[4]?, thumbDir?, curlC?): the spike's convention (left-hand values, mirrored) */
      fingers: function (s, a, b, spread, thumb, c) {
        var k = s === 'l' ? 1 : -1;
        FINGERS.forEach(function (f, i) {
          P.rotLocal(f + '_01_' + s, spread ? spread[i] : 0, 0, -k * a * (i === 3 ? 1.05 : 1));
          P.rotLocal(f + '_02_' + s, 0, 0, -k * b);
          P.rotLocal(f + '_03_' + s, 0, 0, -k * (c || 0));
        });
        var bindDir = refAxis('thumb_01_' + s).normalize();
        var t = thumb ? new V(thumb[0] * k, thumb[1], thumb[2]).normalize() : bindDir;
        P.rotLocalQ('thumb_01_' + s, new Q().setFromUnitVectors(bindDir, t));
        P.rotLocal('thumb_02_' + s, 0, 0, -k * (thumb ? 0.35 : 0));
      },
      /** legIK(side, ankle, kneeHint, yaw?, pitch?): two-bone IK to a root-space ankle target, foot laid flat */
      legIK: function (s, ankle, kneeHint, yaw, pitch) {
        var th = 'thigh_' + s, ca = 'calf_' + s, ft = 'foot_' + s;
        var L1 = rest[ca].world.distanceTo(rest[th].world), L2 = rest[ft].world.distanceTo(rest[ca].world);
        var H = worldPos(th), d = arr3(ankle).sub(H);
        d.y += 0.012;   // the spike's allowance, so the sole rests on the ground rather than in it
        var dist = Math.min(d.length(), L1 + L2 - 0.003), dh = d.clone().normalize();
        var a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
        var hint = arr3(kneeHint), nrm = hint.addScaledVector(dh, -hint.dot(dh)).normalize();
        var K = H.clone().addScaledVector(dh, L1 * Math.cos(a)).addScaledVector(nrm, L1 * Math.sin(a));
        var A = H.clone().addScaledVector(dh, dist);
        orient(th, refAxis(th), K.clone().sub(H), refPole(th), nrm);
        orient(ca, refAxis(ca), A.sub(K), refPole(ca), nrm);
        setDelta(ft, new Q().setFromEuler(new THREE.Euler(pitch || 0, yaw || 0, 0, 'YXZ')));
      },
      /** tail(els, yaws?, k?): the spike's tail helper for a tail_NN chain. Elevation below the horizontal and heading
       *  (degrees, root space) as control values along the tail, resampled onto the bones; k steepens the hanging part.
       *  Does nothing on a rig without a tail. */
      tail: function (els, yaws, k) {
        var tb = rig.bones.filter(function (b) { return /^tail_\d+$/.test(b.name); }).map(function (b) { return b.name; }).sort();
        var N = tb.length, n = els.length - 1, D = Math.PI / 180;
        for (var i = 0; i < N; i++) {
          var f = i / Math.max(1, N - 1) * n, a = Math.min(Math.floor(f), n - 1), t = f - a;
          var x = clamp(((i + 0.5) / N - 0.5) / 0.35, 0, 1), w = 1 - x * x * (3 - 2 * x);
          var el = Math.min(els[a] + (els[a + 1] - els[a]) * t + (k || 0) * w, 86) * D;
          var yw = (yaws ? yaws[a] + (yaws[a + 1] - yaws[a]) * t : 0) * D;
          orient(tb[i], refAxis(tb[i]), new V(Math.cos(el) * Math.sin(yw), -Math.sin(el), -Math.cos(el) * Math.cos(yw)),
                 refPole(tb[i]), new V(-Math.sin(el) * Math.sin(yw), -Math.cos(el), Math.sin(el) * Math.cos(yw)));
        }
      },
      refAxis: refAxis, refPole: refPole
    };
    return P;
  }

  JG.rig = { create: create, PRIMARY: PRIMARY };
})();
