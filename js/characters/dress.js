/* JG.dress: dressing human base bodies in code (plan section 9, "Dressed in code"). Engine only: the paint rules and
 * accessory shells come from each cast-*.js file through JG.characters.register data. Classic script; touches neither
 * THREE nor the DOM at load.
 *
 * STAGE 1b (2026-11-24, people pass): the body GLBs now carry real MakeHuman CC0 clothes and hair baked into the one
 * skinned mesh (tools/blender/mpfb_body.py), each part marked by a small weight on the Root joint (hair 0.03, clothes
 * 0.06, a second hairstyle 0.09, a second garment 0.12, skin none). Per character this engine:
 *   1. reads the part of every vertex and strips the marker weight (the Root joint never moves, but it is not skin);
 *   2. drops the triangles of hidden parts (the old lady hides the long hair and wears a bun shell instead);
 *   3. paints each TRIANGLE by the first matching rule at its centre and splits vertices where colours meet, so
 *      region borders are crisp comic edges instead of soft vertex-colour gradients;
 *   4. merges small accessory shells (earrings, glasses, bun, ponytail, lanyard and badge, buckle), each rigidly
 *      skinned to one bone, into the same geometry: still one SkinnedMesh with one toon material, plus one ink hull;
 *   5. builds the ink hull with a per-vertex thickness scale, thin on the face (no ink poking through the nose and
 *      mouth creases, which the face decal would otherwise have to hide) and per shell.
 *
 *   JG.dress.apply(kit, rig, { key, base: '#hex', rules: [rule], hide: [part name], show: [optional part name],
 *                              hideRules: [rule without color], shells: [shell], hull: true, thickness: 0.012,
 *                              faceInk: 0.15, inkRules: [rule with ink instead of color], legs: {...} })
 *                              -> { mesh, hull, landmarks }
 *   rule  = { part?: 'skin'|'hair'|'hair1'|'hair2'|'cloth'|'cloth1'|'cloth2'|'shell', bones?: RegExp, yMin?, yMax?, zMin?, zMax?, xMin?, xMax?,
 *             side?: 'l'|'r', comp?: { topMin, topMax, bottomMin, bottomMax, wideMin, wideMax },
 *             rimBand?: metres, rimBones?: RegExp, color }
 *           rimBand (stage 1d) matches within that distance of the piece's open edge, counting only edges whose two
 *           vertices' dominant bones match rimBones (a jacket's hem, not its cuffs). inkRules scale the hull thickness
 *           per vertex (ink: factor). legs (stage 1d, see legOffsets) loosens a slim garment's legs into straight
 *           trousers, raises its waist edge and adds pressed creases.
 *           y, z and x (|x|) bounds are fractions of the body's bind height measured at the triangle's centre (z from
 *           the body's centre line, positive to the front); bones tests the triangle's dominant bone; comp tests the
 *           extent of the connected piece the triangle belongs to (its top, bottom and widest |x|, same fractions), so
 *           a rule can pick the trousers, the shirt under a jacket or the shoes as whole pieces. Rules are tried
 *           in order and the first match wins; base is the fallback. Shells take their own colour unless a rule with
 *           part: 'shell' matches.
 *   shell = { shape: 'sphere'|'box'|'cylinder'|'torus'|'tube', at: landmark | bone name, offset: [x,y,z] metres in the
 *             body's bind frame (+x is the body's left, +z its front), bone?: bone the shell rides on (default: the
 *             landmark's bone), size params (r, tube, w, h, d, r2, arc, seg), scale?: [x,y,z], rot?: [x,y,z] (radians),
 *             points?: [[x,y,z]...] (tube, relative to the landmark), color, ink?: hull thickness scale (default 1),
 *             mirror?: true (also builds the shell mirrored in x) }
 *   landmarks (bind frame): head (the Head joint), crown, back (of the skull), face (the front of the face at eye
 *             height), eyeL/eyeR, nose, mouth, chin, earL/earR, neck, chest (front of the chest), waist (front), and
 *             every bone name (its joint).
 * The painted geometry and its hull are cached by key (e.g. 'ops' or 'extra:1') and the source geometry, so several
 * actors with the same key share them.
 */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var cache = {}, analysed = new WeakMap(), inkMat = null;
  // part ids: 0 skin, 1 hair, 2 cloth, 3 shell, 4 hair2 (a second hairstyle), 5 cloth2, 6 cloth3 (round 2c: an optional
  // garment, hidden unless the character lists it in `show`, e.g. the exec's trousers on body-female). Names in rules
  // and hide lists stand for sets: 'hair' is both hairstyles, 'hair1' the first only; 'cloth' does not include cloth3.
  var PART = { skin: [0], hair: [1, 4], hair1: [1], hair2: [4], cloth: [2, 5], cloth1: [2], cloth2: [5], cloth3: [6], shell: [3] };
  var PART_NAME = ['skin', 'hair1', 'cloth1', 'shell', 'hair2', 'cloth2', 'cloth3'];
  var OPTIONAL = [6];
  // the face layout on the MPFB bodies, from the Head joint (measured 2026-11-24 on body-female and body-male)
  var EYE_UP = 0.058, MOUTH_UP = -0.019, NOSE_UP = 0.02, CHIN_UP = -0.05, EYE_X = 0.031;

  /** per source geometry: bind-frame positions, part and dominant bone per vertex, skin weights without the marker */
  function analyse(THREE, mesh, rig) {
    var src = mesh.geometry, hit = analysed.get(src);
    if (hit) return hit;
    var P = src.attributes.position, SI = src.attributes.skinIndex, SW = src.attributes.skinWeight, n = P.count;
    var bones = mesh.skeleton.bones, root = -1, i, k;
    for (i = 0; i < bones.length; i++) if (bones[i].name === 'root') root = i;
    var pos = new Float32Array(n * 3), part = new Uint8Array(n), bone = new Int16Array(n), sw = new Float32Array(n * 4);
    var v = new THREE.Vector3(), bb = new THREE.Box3();
    for (i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      bb.expandByPoint(v);
      var r = 0, best = 0, bw = -1, sum = 0;
      for (k = 0; k < 4; k++) {
        var j = SI.getComponent(i, k), w = SW.getComponent(i, k);
        if (j === root && root >= 0) { r += w; sw[i * 4 + k] = 0; continue; }
        sw[i * 4 + k] = w; sum += w;
        if (w > bw) { bw = w; best = j; }
      }
      if (sum > 0) for (k = 0; k < 4; k++) sw[i * 4 + k] /= sum;
      part[i] = r < 0.015 ? 0 : r < 0.045 ? 1 : r < 0.07 ? 2 : r < 0.095 ? 4 : r < 0.14 ? 5 : 6;
      bone[i] = best;
    }
    var H = bb.max.y - bb.min.y || 1;
    // the body's height without the hair (the soles to the top of the skull): the hair must not change the paint bands,
    // which are fractions of this height; z is centred on the skin
    var sb = new THREE.Box3(), lo = Infinity;
    for (i = 0; i < n; i++) {
      if (part[i] === 0) sb.expandByPoint(v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
      if (part[i] !== 1 && part[i] !== 4 && part[i] !== 6) lo = Math.min(lo, pos[i * 3 + 1]);
    }
    if (!sb.isEmpty()) sb.min.y = Math.min(sb.min.y, lo);
    var index = src.index ? Array.from(src.index.array) : Array.from({ length: n }, function (_, q) { return q; });
    // connected components within each part (vertices welded by position), so a rule can tell a jacket from the
    // shirt under it or the trousers below it by the component's extent
    var par = new Int32Array(n), first = new Map();
    for (i = 0; i < n; i++) par[i] = i;
    function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    function unite(x, y) { x = find(x); y = find(y); if (x !== y) par[x] = y; }
    for (i = 0; i < n; i++) {
      var pkey = part[i] + '/' + Math.round(pos[i * 3] * 1e4) + ',' + Math.round(pos[i * 3 + 1] * 1e4) + ',' + Math.round(pos[i * 3 + 2] * 1e4);
      if (first.has(pkey)) unite(i, first.get(pkey)); else first.set(pkey, i);
    }
    for (i = 0; i + 2 < index.length; i += 3) { unite(index[i], index[i + 1]); unite(index[i], index[i + 2]); }
    var comp = new Int32Array(n), stats = new Map();
    for (i = 0; i < n; i++) {
      var cr = find(i), st = stats.get(cr);
      if (!st) { st = { id: stats.size, lo: Infinity, hi: -Infinity, wide: 0, n: 0 }; stats.set(cr, st); }
      comp[i] = st.id; st.n++;
      st.lo = Math.min(st.lo, pos[i * 3 + 1]); st.hi = Math.max(st.hi, pos[i * 3 + 1]); st.wide = Math.max(st.wide, Math.abs(pos[i * 3]));
    }
    var comps = [];
    stats.forEach(function (st) { comps[st.id] = st; });
    var a = { n: n, index: index, comp: comp, comps: comps, pos: pos, part: part, bone: bone, sw: sw, minY: sb.isEmpty() ? bb.min.y : sb.min.y, H: sb.isEmpty() ? H : (sb.max.y - sb.min.y) || H,
      zc: sb.isEmpty() ? (bb.max.z + bb.min.z) / 2 : (sb.max.z + sb.min.z) / 2, root: root, landmarks: landmarks(THREE, rig, pos, part, bone, bones) };
    analysed.set(src, a);
    return a;
  }

  /** landmarks in the bind frame, measured on the skin of the head and chest */
  function landmarks(THREE, rig, pos, part, bone, bones) {
    var R = rig.rest, head = R.Head.world, hi = bones.indexOf(rig.byName.Head), n = part.length, i;
    var L = {};
    Object.keys(R).forEach(function (b) { L[b] = R[b].world.clone(); });
    var top = -Infinity, back = Infinity, earX = 0, front = -Infinity, frontM = -Infinity, chest = -Infinity, waist = -Infinity, topZ = head.z;
    var eyeY = head.y + EYE_UP, mouthY = head.y + MOUTH_UP, chestY = R.spine_03.world.y + 0.04, waistY = R.spine_01.world.y;
    for (i = 0; i < n; i++) {
      if (part[i] !== 0) continue;
      var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ax = Math.abs(x);
      if (bone[i] === hi) {
        if (y > top) { top = y; topZ = z; }
        if (ax < 0.02 && Math.abs(y - (head.y + 0.06)) < 0.025 && z < back) back = z;
        if (Math.abs(y - (head.y + 0.035)) < 0.02 && z < head.z + 0.04 && ax > earX) earX = ax;
        if (ax < 0.05 && Math.abs(y - eyeY) < 0.012 && z > front) front = z;
        if (ax < 0.02 && Math.abs(y - mouthY) < 0.01 && z > frontM) frontM = z;
      }
    }
    // the chest and waist fronts: every part counts there (the clothes cover the skin)
    for (i = 0; i < n; i++) {
      var yy = pos[i * 3 + 1], zz = pos[i * 3 + 2];
      if (Math.abs(pos[i * 3]) < 0.04 && Math.abs(yy - chestY) < 0.02 && part[i] !== 1 && part[i] !== 4 && part[i] !== 6 && zz > chest) chest = zz;
      if (Math.abs(pos[i * 3]) < 0.04 && Math.abs(yy - waistY) < 0.02 && part[i] !== 1 && part[i] !== 4 && part[i] !== 6 && zz > waist) waist = zz;
    }
    if (!isFinite(top)) top = head.y + 0.15;
    if (!isFinite(back)) back = head.z - 0.1;
    if (!isFinite(front)) front = head.z + 0.1;
    if (!isFinite(frontM)) frontM = front;
    if (!isFinite(chest)) chest = R.spine_03.world.z + 0.12;
    if (!isFinite(waist)) waist = R.spine_01.world.z + 0.1;
    var left = (R.hand_l && R.hand_l.world.x < 0) ? -1 : 1;   // the sign of x on the body's left
    var V = THREE.Vector3;
    L.head = head.clone();
    L.crown = new V(0, top, topZ);
    L.back = new V(0, head.y + 0.06, back);
    L.face = new V(0, eyeY, front);
    L.eyeL = new V(left * EYE_X, eyeY, front - 0.012);
    L.eyeR = new V(-left * EYE_X, eyeY, front - 0.012);
    L.nose = new V(0, head.y + NOSE_UP, Math.max(front, frontM) + 0.01);
    L.mouth = new V(0, mouthY, frontM);
    L.chin = new V(0, head.y + CHIN_UP, frontM - 0.01);
    L.earL = new V(left * (earX || 0.075), head.y + 0.035, head.z + 0.01);
    L.earR = new V(-left * (earX || 0.075), head.y + 0.035, head.z + 0.01);
    L.neck = R.neck_01.world.clone();
    L.chest = new V(0, chestY, chest);
    L.waist = new V(0, waistY, waist);
    L.left = left;
    return L;
  }
  var LANDMARK_BONE = { head: 'Head', crown: 'Head', back: 'Head', face: 'Head', eyeL: 'Head', eyeR: 'Head', nose: 'Head', mouth: 'Head',
    chin: 'Head', earL: 'Head', earR: 'Head', neck: 'neck_01', chest: 'spine_03', waist: 'spine_01' };

  /** the leg axis at height y on one side (bind frame): the thigh joint to the knee to the ankle; the lower leg's axis
   *  is moved forward by `fwd` m at the ankle (the shin and the trouser crease sit ahead of the ankle joint) */
  function legAxis(rig, side, y, fwd) {
    var T = rig.rest['thigh_' + side].world, K = rig.rest['calf_' + side].world, F = rig.rest['foot_' + side].world, t;
    if (y >= K.y) { t = Math.min(1, (y - K.y) / Math.max(1e-4, T.y - K.y)); return { x: K.x + (T.x - K.x) * t, z: K.z + (T.z - K.z) * t }; }
    t = Math.min(1, (K.y - y) / Math.max(1e-4, K.y - F.y));
    return { x: K.x + (F.x - K.x) * t, z: K.z + (F.z - K.z) * t + fwd * t };
  }
  function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  /** spec.legs offsets per source vertex (bind frame, flat xyz) */
  function legOffsets(THREE, A, rig, o) {
    var parts = PART[o.part || 'cloth3'] || [6], off = new Float32Array(A.n * 3), top = o.top !== undefined ? o.top : 0.8;
    var Kl = rig.rest.calf_l.world, xl = Kl.x, Ky = Kl.y, Fy = rig.rest.foot_l.world.y, hemY = Infinity, i;
    for (i = 0; i < A.n; i++) if (parts.indexOf(A.part[i]) >= 0) hemY = Math.min(hemY, A.pos[i * 3 + 1]);
    if (!isFinite(hemY)) return null;
    var ease = o.ease || 0, knee = o.knee || 0, hem = o.hem !== undefined ? o.hem : knee, fwd = o.fwd || 0;
    for (i = 0; i < A.n; i++) {
      if (parts.indexOf(A.part[i]) < 0) continue;
      var x = A.pos[i * 3], y = A.pos[i * 3 + 1], z = A.pos[i * 3 + 2];
      if (y >= top) continue;
      var side = (x * xl >= 0) ? 'l' : 'r', c = legAxis(rig, side, y, fwd);
      var dx = x - c.x, dz = z - c.z, r = Math.sqrt(dx * dx + dz * dz);
      if (r < 1e-5) continue;
      var w = smooth(top, top - 0.08, y);
      var R = y >= Ky ? knee * smooth(Ky + 0.18, Ky, y) : knee + (hem - knee) * Math.min(1, (Ky - y) / Math.max(1e-4, Ky - Math.min(Fy, hemY)));
      var r2 = Math.max(r + ease * w, R * w);
      if (r2 <= r) continue;
      off[i * 3] = dx / r * (r2 - r); off[i * 3 + 2] = dz / r * (r2 - r);
    }
    // o.waist = { from, top }: the garment's open top edge (vertices above `from` on an edge with one triangle) is
    // raised to `top`, so the trousers reach up under the jacket: the leggings' waist dips to the crotch at the front,
    // and with the skirt and the body under it gone that left a see-through ring under the jacket's hem
    if (o.waist) {
      var key = function (q) { return Math.round(A.pos[q * 3] * 1e4) + ',' + Math.round(A.pos[q * 3 + 1] * 1e4) + ',' + Math.round(A.pos[q * 3 + 2] * 1e4); };
      var edges = new Map(), idx = A.index, ek = function (p, q) { var a = key(p), b = key(q); return a < b ? a + '|' + b : b + '|' + a; };
      for (i = 0; i + 2 < idx.length; i += 3) {
        if (parts.indexOf(A.part[idx[i]]) < 0) continue;
        for (var e = 0; e < 3; e++) { var kk = ek(idx[i + e], idx[i + (e + 1) % 3]); edges.set(kk, (edges.get(kk) || 0) + 1); }
      }
      var rim = new Set();
      edges.forEach(function (c, kk) { if (c === 1) kk.split('|').forEach(function (p) { rim.add(p); }); });
      for (i = 0; i < A.n; i++) {
        if (parts.indexOf(A.part[i]) < 0) continue;
        var yy = A.pos[i * 3 + 1];
        if (yy > o.waist.from && yy < o.waist.top && rim.has(key(i))) off[i * 3 + 1] = o.waist.top - yy;
      }
    }
    return off;
  }
  /** the pressed creases: a thin tube down the front of each trouser leg, on the moved surface (found by casting rays
   *  at the moved garment), one tube on the thigh down to the knee and one on the calf down to the hem */
  function creaseShells(THREE, A, rig, o, off) {
    var parts = PART[o.part || 'cloth3'] || [6], cr = o.crease, tri = [], i, k, idx = A.index;
    for (i = 0; i + 2 < idx.length; i += 3) {
      if (parts.indexOf(A.part[idx[i]]) < 0) continue;
      for (k = 0; k < 3; k++) { var j = idx[i + k]; tri.push(A.pos[j * 3] + off[j * 3], A.pos[j * 3 + 1] + off[j * 3 + 1], A.pos[j * 3 + 2] + off[j * 3 + 2]); }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    var target = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), ray = new THREE.Raycaster();
    target.updateMatrixWorld(true);
    var hemY = Infinity;
    for (i = 1; i < tri.length; i += 3) hemY = Math.min(hemY, tri[i]);
    var out = [], Ky = rig.rest.calf_l.world.y, top = cr.top !== undefined ? cr.top : 0.74, lift = cr.lift || 0.0015;
    ['l', 'r'].forEach(function (side) {
      [['thigh_' + side, top, Ky], ['calf_' + side, Ky, hemY + 0.03]].forEach(function (seg) {
        var anchor = rig.rest[seg[0]].world, pts = [], n = 7;
        for (var q = 0; q <= n; q++) {
          var y = seg[1] + (seg[2] - seg[1]) * q / n, c = legAxis(rig, side, y, o.fwd || 0);
          ray.set(new THREE.Vector3(c.x, y, c.z + 1), new THREE.Vector3(0, 0, -1));
          var hit = ray.intersectObject(target, false)[0];
          if (hit) pts.push([c.x - anchor.x, y - anchor.y, hit.point.z + lift - anchor.z]);
        }
        if (pts.length >= 3) out.push({ shape: 'tube', at: seg[0], bone: seg[0], points: pts, r: cr.r || 0.0016, seg: cr.seg || 8, color: cr.color || '#111111', ink: 0 });
      });
    });
    g.dispose();
    return out;
  }

  function shellGeometry(THREE, s) {
    var g;
    switch (s.shape) {
      case 'box': g = new THREE.BoxGeometry(s.w || 0.02, s.h || 0.02, s.d || 0.02); break;
      case 'cylinder': g = new THREE.CylinderGeometry(s.r || 0.01, s.r2 !== undefined ? s.r2 : (s.r || 0.01), s.h || 0.02, s.seg || 10, 1, false); break;
      case 'torus': g = new THREE.TorusGeometry(s.r || 0.02, s.tube || 0.003, 4, s.seg || 10, s.arc || Math.PI * 2); break;
      case 'tube': {
        var pts = (s.points || []).map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
        g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), s.seg || 16, s.r || 0.004, 4, false);
        break;
      }
      default: g = new THREE.SphereGeometry(s.r || 0.03, s.seg || 10, Math.max(6, Math.round((s.seg || 10) * 0.7)));
    }
    return g;
  }

  function build(THREE, mesh, rig, spec, split) {
    var A = analyse(THREE, mesh, rig), src = mesh.geometry, N = src.attributes.normal, I = src.index;
    var bones = mesh.skeleton.bones, names = bones.map(function (b) { return b.name; });
    var hide = {}; (spec.hide || []).forEach(function (p) { (PART[p] || []).forEach(function (q) { hide[q] = true; }); });
    var shown = {}; (spec.show || []).forEach(function (p) { (PART[p] || []).forEach(function (q) { shown[q] = true; }); });
    OPTIONAL.forEach(function (q) { if (!shown[q]) hide[q] = true; });
    // hideRules: triangles to drop, matched like paint rules at the triangle's centre (the skirt where trousers are
    // worn, the skin under them)
    var hideRules = (spec.hideRules || []).map(function (r) { return Object.assign({}, r, { c: true, p: r.part !== undefined ? (PART[r.part] || [-1]) : undefined }); });
    var rules = (spec.rules || []).map(function (r) { return Object.assign({}, r, { c: new THREE.Color(r.color), p: r.part !== undefined ? (PART[r.part] || [-1]) : undefined }); });
    // inkRules (stage 1d): per-vertex hull thickness factors, matched like paint rules at the vertex (the exec's jacket
    // hem gets a thin line, not a belt-thick band of the hull seen under the open hem)
    var inkRules = (spec.inkRules || []).map(function (r) { return Object.assign({}, r, { c: r.ink, p: r.part !== undefined ? (PART[r.part] || [-1]) : undefined }); });
    var baseC = new THREE.Color(spec.base || '#cccccc'), H = A.H, minY = A.minY, zc = A.zc, left = A.landmarks.left;
    // rimBand (stage 1d): a rule can match within rimBand metres of its connected piece's open edge (the edges with
    // one triangle), counting only the edges whose two vertices' dominant bones match rimBones: the jacket's hem
    // (pelvis / spine_01), not its cuffs or neckline. Distances are in the bind frame, to the edge segments.
    var rims = {};
    function rimDist(ci, re, x, y, z) {
      var rk = ci + '/' + (re ? re.source : '');
      var segs = rims[rk];
      if (!segs) {
        segs = rims[rk] = [];
        var cnt = new Map(), idx = A.index, pk = function (q) { return Math.round(A.pos[q * 3] * 1e4) + ',' + Math.round(A.pos[q * 3 + 1] * 1e4) + ',' + Math.round(A.pos[q * 3 + 2] * 1e4); };
        for (var t0 = 0; t0 + 2 < idx.length; t0 += 3) {
          if (A.comp[idx[t0]] !== ci) continue;
          for (var e = 0; e < 3; e++) {
            var p = idx[t0 + e], q = idx[t0 + (e + 1) % 3], kp = pk(p), kq = pk(q), ek = kp < kq ? kp + '|' + kq : kq + '|' + kp;
            var rec = cnt.get(ek);
            if (rec) rec.n++; else cnt.set(ek, { n: 1, p: p, q: q });
          }
        }
        cnt.forEach(function (rec) {
          if (rec.n !== 1) return;
          if (re && !(re.test(names[A.bone[rec.p]] || '') && re.test(names[A.bone[rec.q]] || ''))) return;
          segs.push([A.pos[rec.p * 3], A.pos[rec.p * 3 + 1], A.pos[rec.p * 3 + 2], A.pos[rec.q * 3], A.pos[rec.q * 3 + 1], A.pos[rec.q * 3 + 2]]);
        });
      }
      var best = Infinity;
      for (var s = 0; s < segs.length; s++) {
        var S = segs[s], ux = S[3] - S[0], uy = S[4] - S[1], uz = S[5] - S[2], L2 = ux * ux + uy * uy + uz * uz;
        var tt = L2 > 0 ? Math.max(0, Math.min(1, ((x - S[0]) * ux + (y - S[1]) * uy + (z - S[2]) * uz) / L2)) : 0;
        var dx = S[0] + ux * tt - x, dy = S[1] + uy * tt - y, dz = S[2] + uz * tt - z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best);
    }
    var palette = [], palIndex = {};
    function colourId(c) { var k = c.getHexString(); if (palIndex[k] === undefined) { palIndex[k] = palette.length; palette.push(c); } return palIndex[k]; }
    function paint(part, bn, x, y, z, fallback, ci, list) {
      var fy = (y - minY) / H, fz = (z - zc) / H, fx = Math.abs(x) / H, name = names[bn] || '';
      var C = ci !== undefined ? A.comps[ci] : null;
      list = list || rules;
      for (var r = 0; r < list.length; r++) {
        var R = list[r];
        if (R.comp) {
          if (!C) continue;
          var K = R.comp, top = (C.hi - minY) / H, bot = (C.lo - minY) / H, wide = C.wide / H;
          if ((K.topMin !== undefined && top < K.topMin) || (K.topMax !== undefined && top > K.topMax) ||
            (K.bottomMin !== undefined && bot < K.bottomMin) || (K.bottomMax !== undefined && bot > K.bottomMax) ||
            (K.wideMin !== undefined && wide < K.wideMin) || (K.wideMax !== undefined && wide > K.wideMax)) continue;
        }
        if (R.p !== undefined ? R.p.indexOf(part) < 0 : part === 3) continue;
        if (R.bones && !R.bones.test(name)) continue;
        if (R.yMin !== undefined && fy < R.yMin) continue;
        if (R.yMax !== undefined && fy > R.yMax) continue;
        if (R.zMin !== undefined && fz < R.zMin) continue;
        if (R.zMax !== undefined && fz > R.zMax) continue;
        if (R.xMax !== undefined && fx > R.xMax) continue;
        if (R.xMin !== undefined && fx < R.xMin) continue;
        if (R.side && (R.side === 'l' ? x * left < 0 : x * left > 0)) continue;
        if (R.rimBand !== undefined && (ci === undefined || rimDist(ci, R.rimBones, x, y, z) > R.rimBand)) continue;
        return R.c;
      }
      return list === rules ? (fallback || baseC) : null;
    }

    // face region for the thin ink: skin on the Head bone, in front of the ears, between the chin and the brow
    var L = A.landmarks, hi = names.indexOf('Head');
    function faceInk(i) {
      if (A.part[i] !== 0 || A.bone[i] !== hi) return 1;
      var x = A.pos[i * 3], y = A.pos[i * 3 + 1], z = A.pos[i * 3 + 2];
      if (y < L.chin.y - 0.02 || y > L.face.y + 0.035 || Math.abs(x) > 0.062 || z < L.head.z + 0.02) return 1;
      return spec.faceInk !== undefined ? spec.faceInk : 0.15;
    }
    var inkCache = inkRules.length ? new Float32Array(A.n).fill(-1) : null;
    function inkAt(i) {
      if (!inkCache) return faceInk(i);
      if (inkCache[i] < 0) {
        var k = paint(A.part[i], A.bone[i], A.pos[i * 3], A.pos[i * 3 + 1], A.pos[i * 3 + 2], null, A.comp[i], inkRules);
        inkCache[i] = faceInk(i) * (k === null ? 1 : k);
      }
      return inkCache[i];
    }

    // trouser legs (stage 1d): spec.legs = { part, ease, knee, hem, top, crease?: {color, r, top} } loosens a slim
    // garment's legs into straight suit trousers: below `top` (metres, bind frame) each vertex moves out from its leg's
    // axis (the thigh, calf and foot joints) by `ease`, and from the knee down the leg's cross-section is at least `knee`
    // metres round the axis, widening to `hem` at the bottom (a straight leg with a slight break over the shoe). The
    // offsets are per source vertex in the bind frame; paint rules still test the unmoved positions. crease adds a
    // pressed-crease line down the front of each leg (thin tube shells on the thigh and calf, no hull).
    var off = null;
    if (spec.legs && rig.rest.thigh_l && rig.rest.calf_l && rig.rest.foot_l) off = legOffsets(THREE, A, rig, spec.legs);
    var offLocal = null;
    if (off) {
      offLocal = new Float32Array(off.length);
      var lm = new THREE.Matrix3().setFromMatrix4(mesh.bindMatrixInverse), ov = new THREE.Vector3();
      for (var oi = 0; oi < A.n; oi++) {
        if (!off[oi * 3] && !off[oi * 3 + 1] && !off[oi * 3 + 2]) continue;
        ov.set(off[oi * 3], off[oi * 3 + 1], off[oi * 3 + 2]).applyMatrix3(lm);
        offLocal[oi * 3] = ov.x; offLocal[oi * 3 + 1] = ov.y; offLocal[oi * 3 + 2] = ov.z;
      }
    }
    function px(i, k) { return SP.getComponent(i, k) + (offLocal ? offLocal[i * 3 + k] : 0); }
    var shells = (spec.shells || []).slice();
    if (off && spec.legs.crease) creaseShells(THREE, A, rig, spec.legs, off).forEach(function (s) { shells.push(s); });

    // 1-3: kept triangles, one colour each, vertices split where colours meet. ROUND 2c: a triangle whose corners
    // paint differently (a hem, a cuff, a neckline crossing it) is CUT along the colour border instead of taking its
    // centre's colour, so hems are clean lines instead of the decimated mesh's saw-tooth. The border point on each
    // edge is found by bisection with the same rules (the position and the dominant bone of the blended skin weights),
    // shared by the triangles on both sides of the edge. Triangles whose corners agree keep the centre rule (so a
    // paint band narrower than a triangle still shows), and so do triangles with three colours. The ink hull is built
    // from the uncut triangles (split: false), so it costs no extra triangles.
    var outPos = [], outNor = [], outSI = [], outSW = [], outCol = [], outInk = [], outIdx = [], remap = new Map();
    var SP = src.attributes.position, SIa = src.attributes.skinIndex;
    function vert(i, cid) {
      var key = i * 64 + cid, o = remap.get(key);
      if (o !== undefined) return o;
      o = outPos.length / 3; remap.set(key, o);
      outPos.push(px(i, 0), px(i, 1), px(i, 2));
      outNor.push(N.getX(i), N.getY(i), N.getZ(i));
      for (var k = 0; k < 4; k++) { outSI.push(SIa.getComponent(i, k)); outSW.push(A.sw[i * 4 + k]); }
      var c = palette[cid]; outCol.push(c.r, c.g, c.b);
      outInk.push(inkAt(i));
      return o;
    }
    // colour at a point blended between vertices i and j (t from i): the rules at the blended position and bone
    var wsum = {};
    function blendBone(i, j, t) {
      var k, best = -1, bw = -1, key;
      for (key in wsum) delete wsum[key];
      for (k = 0; k < 4; k++) {
        var wi = A.sw[i * 4 + k] * (1 - t), wj = A.sw[j * 4 + k] * t, bi = SIa.getComponent(i, k), bj = SIa.getComponent(j, k);
        if (wi > 0) wsum[bi] = (wsum[bi] || 0) + wi;
        if (wj > 0) wsum[bj] = (wsum[bj] || 0) + wj;
      }
      for (key in wsum) if (wsum[key] > bw) { bw = wsum[key]; best = +key; }
      return best < 0 ? A.bone[i] : best;
    }
    function colourAt(i, j, t) {
      var x = A.pos[i * 3] + (A.pos[j * 3] - A.pos[i * 3]) * t, y = A.pos[i * 3 + 1] + (A.pos[j * 3 + 1] - A.pos[i * 3 + 1]) * t,
        z = A.pos[i * 3 + 2] + (A.pos[j * 3 + 2] - A.pos[i * 3 + 2]) * t;
      return colourId(paint(A.part[i], blendBone(i, j, t), x, y, z, null, A.comp[i]));
    }
    var vcol = new Int32Array(A.n).fill(-1);
    function vertColour(i) {
      if (vcol[i] < 0) vcol[i] = colourId(paint(A.part[i], A.bone[i], A.pos[i * 3], A.pos[i * 3 + 1], A.pos[i * 3 + 2], null, A.comp[i]));
      return vcol[i];
    }
    function pkey(i) { return Math.round(A.pos[i * 3] * 1e5) + ',' + Math.round(A.pos[i * 3 + 1] * 1e5) + ',' + Math.round(A.pos[i * 3 + 2] * 1e5); }
    var cuts = new Map();
    /** the border point on edge i-j (colour ci at i, cj at j), as an output vertex of colour cid */
    function cut(i, j, ci, cj, cid) {
      var ki = pkey(i), kj = pkey(j), flip = ki > kj, a0 = flip ? j : i, a1 = flip ? i : j, c0 = flip ? cj : ci;
      var ek = flip ? kj + '|' + ki : ki + '|' + kj, e = cuts.get(ek);
      if (!e) {
        var lo = 0, hi = 1;
        for (var it = 0; it < 8; it++) { var mid = (lo + hi) / 2; if (colourAt(a0, a1, mid) === c0) lo = mid; else hi = mid; }
        e = { t: (lo + hi) / 2, a0: a0, a1: a1, v: {} };
        cuts.set(ek, e);
      }
      if (e.v[cid] !== undefined) return e.v[cid];
      var t = e.t, p = e.a0, q = e.a1, o = outPos.length / 3, k;
      outPos.push(px(p, 0) + (px(q, 0) - px(p, 0)) * t, px(p, 1) + (px(q, 1) - px(p, 1)) * t, px(p, 2) + (px(q, 2) - px(p, 2)) * t);
      var nx = N.getX(p) + (N.getX(q) - N.getX(p)) * t, ny = N.getY(p) + (N.getY(q) - N.getY(p)) * t, nz = N.getZ(p) + (N.getZ(q) - N.getZ(p)) * t,
        nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      outNor.push(nx / nl, ny / nl, nz / nl);
      var ws = [];
      for (k = 0; k < 4; k++) {
        ws.push([SIa.getComponent(p, k), A.sw[p * 4 + k] * (1 - t)]);
        ws.push([SIa.getComponent(q, k), A.sw[q * 4 + k] * t]);
      }
      var merged = {};
      ws.forEach(function (w) { if (w[1] > 0) merged[w[0]] = (merged[w[0]] || 0) + w[1]; });
      var top = Object.keys(merged).map(function (b) { return [+b, merged[b]]; }).sort(function (u, w) { return w[1] - u[1]; }).slice(0, 4), sum = 0;
      top.forEach(function (w) { sum += w[1]; });
      for (k = 0; k < 4; k++) { outSI.push(top[k] ? top[k][0] : 0); outSW.push(top[k] ? top[k][1] / (sum || 1) : 0); }
      var c = palette[cid]; outCol.push(c.r, c.g, c.b);
      outInk.push(inkAt(p) + (inkAt(q) - inkAt(p)) * t);
      e.v[cid] = o;
      return o;
    }
    var count = I ? I.count : A.n;
    for (var t = 0; t < count; t += 3) {
      var a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
      var part = A.part[a];
      if (hide[part] || hide[A.part[b]] || hide[A.part[c]]) continue;
      var bn = A.bone[a] === A.bone[b] || A.bone[a] === A.bone[c] ? A.bone[a] : A.bone[b] === A.bone[c] ? A.bone[b] : A.bone[a];
      var x = (A.pos[a * 3] + A.pos[b * 3] + A.pos[c * 3]) / 3, y = (A.pos[a * 3 + 1] + A.pos[b * 3 + 1] + A.pos[c * 3 + 1]) / 3,
        z = (A.pos[a * 3 + 2] + A.pos[b * 3 + 2] + A.pos[c * 3 + 2]) / 3;
      if (hideRules.length && paint(part, bn, x, y, z, null, A.comp[a], hideRules)) continue;
      var cid = colourId(paint(part, bn, x, y, z, null, A.comp[a]));
      if (split) {
        var ca = vertColour(a), cb = vertColour(b), cc = vertColour(c);
        if (ca !== cb || ca !== cc) {
          var X = -1, Y, Z, cx, cy;
          if (cb === cc && ca !== cb) { X = a; Y = b; Z = c; cx = ca; cy = cb; }
          else if (ca === cc && cb !== ca) { X = b; Y = c; Z = a; cx = cb; cy = cc; }
          else if (ca === cb && cc !== ca) { X = c; Y = a; Z = b; cx = cc; cy = ca; }
          if (X >= 0) {
            var pxyX = cut(X, Y, cx, cy, cx), pxyY = cut(X, Y, cx, cy, cy), pxzX = cut(X, Z, cx, cy, cx), pxzY = cut(X, Z, cx, cy, cy);
            outIdx.push(vert(X, cx), pxyX, pxzX);
            outIdx.push(pxyY, vert(Y, cy), vert(Z, cy));
            outIdx.push(pxyY, vert(Z, cy), pxzY);
            continue;
          }
        }
      }
      outIdx.push(vert(a, cid), vert(b, cid), vert(c, cid));
    }

    // 4: shells, rigid on one bone, built in the bind frame and moved into the mesh's local frame
    var inv = mesh.bindMatrixInverse, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    shells.forEach(function (s) {
      if (!split && s.ink === 0) return;   // no hull at all for this shell (the trouser creases)
      var copies = s.mirror ? [1, -1] : [1];
      copies.forEach(function (mx) {
        var g = shellGeometry(THREE, s);
        var anchor = L[s.at] || L[s.bone] || L.head;
        var boneName = s.bone || LANDMARK_BONE[s.at] || (rig.byName[s.at] ? s.at : 'Head'), bi = names.indexOf(boneName);
        if (bi < 0) bi = hi;
        var off = s.offset || [0, 0, 0];
        var p0 = new THREE.Vector3(anchor.x + off[0] * mx, anchor.y + off[1], anchor.z + off[2]);
        if (s.at && s.at.slice(-1) === 'L' && mx < 0) p0.x = -anchor.x - off[0];   // mirror a left landmark onto the right
        var rot = s.rot || [0, 0, 0];
        q.setFromEuler(new THREE.Euler(rot[0], rot[1] * mx, rot[2] * mx));
        var sc = s.scale || [1, 1, 1];
        m4.compose(p0, q, new THREE.Vector3(sc[0] * mx, sc[1], sc[2]));
        if (s.shape === 'tube') m4.compose(new THREE.Vector3(anchor.x, anchor.y, anchor.z), new THREE.Quaternion(), new THREE.Vector3(mx, 1, 1));
        m4.premultiply(inv);
        nm.getNormalMatrix(m4);
        var gp = g.attributes.position, gn = g.attributes.normal, gi = g.index, base = outPos.length / 3, flip = mx < 0;
        var col = paint(3, bi, p0.x, p0.y, p0.z, new THREE.Color(s.color || '#888888')), cid = colourId(col), cc = palette[cid];
        for (var k = 0; k < gp.count; k++) {
          v.fromBufferAttribute(gp, k).applyMatrix4(m4); outPos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(gn, k).applyMatrix3(nm).normalize(); outNor.push(v.x, v.y, v.z);
          outSI.push(bi, 0, 0, 0); outSW.push(1, 0, 0, 0);
          outCol.push(cc.r, cc.g, cc.b);
          outInk.push(s.ink !== undefined ? s.ink : 1);
        }
        var cnt = gi ? gi.count : gp.count;
        for (k = 0; k + 2 < cnt; k += 3) {
          var i0 = gi ? gi.getX(k) : k, i1 = gi ? gi.getX(k + 1) : k + 1, i2 = gi ? gi.getX(k + 2) : k + 2;
          if (flip) outIdx.push(base + i0, base + i2, base + i1); else outIdx.push(base + i0, base + i1, base + i2);
        }
        g.dispose();
      });
    });

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(outNor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(outSI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(outSW, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(outCol, 3));
    g.setAttribute('inkScale', new THREE.Float32BufferAttribute(outInk, 1));
    g.setIndex(outIdx);
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.name = (src.name || 'body') + ':' + spec.key;
    return g;
  }

  /** the skin triangles of the front of the head (bind frame, flat xyz triples), for the face decal to conform to.
   *  Round 2c: their smooth vertex normals (bind frame, same layout) are kept beside them (JG.dress.surfaceNormals),
   *  so the decal can be lit exactly like the skin under it. */
  var surfNormals = new WeakMap();
  function faceSurface(A, mesh) {
    if (A.faceTris) return A.faceTris;
    var THREE = window.THREE, out = [], nout = [], L = A.landmarks, idx = A.index, n = idx.length, N = mesh.geometry.attributes.normal;
    var nm = new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix), v = new THREE.Vector3();
    for (var t = 0; t < n; t += 3) {
      var ok = true;
      for (var k = 0; k < 3 && ok; k++) {
        var i = idx[t + k];
        if (A.part[i] !== 0 || A.pos[i * 3 + 2] < L.head.z || A.pos[i * 3 + 1] < L.chin.y - 0.05 || A.pos[i * 3 + 1] > L.face.y + 0.09) ok = false;
      }
      if (!ok) continue;
      for (k = 0; k < 3; k++) {
        var j = idx[t + k];
        out.push(A.pos[j * 3], A.pos[j * 3 + 1], A.pos[j * 3 + 2]);
        if (N) { v.fromBufferAttribute(N, j).applyMatrix3(nm).normalize(); nout.push(v.x, v.y, v.z); } else nout.push(0, 0, 1);
      }
    }
    A.faceTris = new Float32Array(out);
    surfNormals.set(A.faceTris, new Float32Array(nout));
    return A.faceTris;
  }

  function apply(kit, rig, spec) {
    var THREE = kit.THREE, mesh = rig.mesh;
    if (!mesh) throw new Error('JG.dress.apply: rig has no mesh');
    var key = (spec.key || 'body') + '@' + (mesh.geometry.uuid);
    var A = analyse(THREE, mesh, rig);
    var entry = cache[key];
    if (!entry) {
      var g = build(THREE, mesh, rig, spec, true);
      entry = cache[key] = { geometry: g, hullSrc: build(THREE, mesh, rig, spec, false), hulls: {} };
    }
    mesh.geometry = entry.geometry;
    kit.restyle(rig.root, { color: 0xffffff, hull: false });
    var hull = null;
    if (spec.hull !== false) {
      var th = spec.thickness || 0.012, hk = th.toFixed(5);
      var hg = entry.hulls[hk] || (entry.hulls[hk] = kit.hull(entry.hullSrc, th, 'inkScale'));
      hull = new THREE.SkinnedMesh(hg, inkMat || (inkMat = kit.mat.ink()));
      mesh.add(hull);
      hull.bind(mesh.skeleton, mesh.bindMatrix);
      hull.frustumCulled = false;
      hull.name = (mesh.name || 'body') + '_hull';
      hull.userData.jgHull = true;
    }
    return { mesh: mesh, hull: hull, landmarks: A.landmarks, faceSurface: faceSurface(A, mesh), parts: PART_NAME };
  }

  JG.dress = { apply: apply, landmarks: function (kit, rig) { return analyse(kit.THREE, rig.mesh, rig).landmarks; },
    surfaceNormals: function (surface) { return surfNormals.get(surface) || null; } };
})();
