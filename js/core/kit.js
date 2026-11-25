/* JG.makeKit(): the only source of the toon look (plan sections 5 and 6, "Kit"). Ported from spike/harness/kit.js
 * (toon ramp, ink hull, rigid skinning, merge, canvas textures) plus, new at Stage 0 step 5:
 *   kit.gltf(name)            a dequantised clone of a GLB loaded by JG.assets
 *   kit.restyle(obj, opts)    replaces imported materials with the toon look and adds ink hulls
 * and, at Stage 1 (E4): kit.hullSet (the step 7 hull fix for set pieces), kit.hullOf (cached hulls), kit.worldScale
 * Classic script: defines JG.makeKit at load and touches THREE only when it is called. */
(function () {
  'use strict';
  var JG = window.JG;

  JG.makeKit = function makeKit(opts) {
    opts = opts || {};
    var THREE = window.THREE;
    var PALETTE = { blue: 0x1F4FD8, yellow: 0xFFD21F, magenta: 0xE0218A, ink: 0x111111, paper: 0xFFF8E7 };
    var IDENT = new THREE.Matrix4();

    // Three-band ramp, RGBA 4x1, NearestFilter. The toon shader reads .r at u = dot(N, L) * 0.5 + 0.5,
    // so texels 0-1 are shadow, 2 is mid, 3 is lit.
    var ramp = new THREE.DataTexture(new Uint8Array([89, 89, 89, 255, 89, 89, 89, 255, 173, 173, 173, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;

    function toon(o) {
      o = o || {};
      var m = new THREE.MeshToonMaterial({
        color: o.color !== undefined ? o.color : 0xffffff, gradientMap: ramp,
        vertexColors: !!o.vertexColors, side: o.side !== undefined ? o.side : THREE.FrontSide
      });
      if (o.map) m.map = o.map;
      return m;
    }
    function vertexToon(o) { o = o || {}; o.vertexColors = true; return toon(o); }
    function flat(o) {
      o = o || {};
      var m = new THREE.MeshBasicMaterial({ color: o.color !== undefined ? o.color : 0xffffff, vertexColors: !!o.vertexColors, side: o.side !== undefined ? o.side : THREE.FrontSide });
      if (o.map) m.map = o.map;
      return m;
    }
    // Ink hull material: back faces only, unlit, no custom shader.
    function ink(color) { return new THREE.MeshBasicMaterial({ color: color !== undefined ? color : PALETTE.ink, side: THREE.BackSide }); }

    function canvasTex(w, h, draw) {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      if (draw) draw(cv.getContext('2d'), w, h);
      var t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }

    /* merge(parts) -> BufferGeometry with position, normal, uv, color, skinIndex, skinWeight and an index.
     * part = { geometry, matrix?, bone?, color?, uvRect?: [u0,v0,u1,v1], uvPoint?: [u,v] } (as in the spike). */
    function merge(parts) {
      var pos = [], nor = [], uv = [], col = [], si = [], sw = [], idx = [];
      var v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3(), c = new THREE.Color();
      var base = 0;
      parts.forEach(function (p) {
        var g = p.geometry, m = p.matrix || IDENT;
        if (!g.attributes.normal) g.computeVertexNormals();
        var P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
        nm.getNormalMatrix(m);
        var flip = m.determinant() < 0;
        c.set(p.color !== undefined ? p.color : 0xffffff);
        var r = p.uvRect, pt = p.uvPoint, bone = p.bone | 0;
        for (var i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
          n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
          var uu = U ? U.getX(i) : 0, vv = U ? U.getY(i) : 0;
          if (pt) { uu = pt[0]; vv = pt[1]; } else if (r) { uu = r[0] + uu * (r[2] - r[0]); vv = r[1] + vv * (r[3] - r[1]); }
          uv.push(uu, vv);
          if (C) col.push(C.getX(i) * c.r, C.getY(i) * c.g, C.getZ(i) * c.b); else col.push(c.r, c.g, c.b);
          si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0);
        }
        var I = g.index, count = I ? I.count : P.count;
        for (var t = 0; t + 2 < count; t += 3) {
          var a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, d = I ? I.getX(t + 2) : t + 2;
          if (flip) idx.push(base + a, base + d, base + b); else idx.push(base + a, base + b, base + d);
        }
        base += P.count;
      });
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      out.setIndex(idx);
      return out;
    }

    /* hull(geometry, thickness, scaleAttr?) -> BufferGeometry pushed out along normals by `thickness` metres.
     * Normals are averaged across vertices that share a position, so hard edges stay closed. scaleAttr names an
     * optional 1-component attribute scaling thickness per vertex (0 for decals). Skin attributes and index are
     * shared with the source. The source must be dequantised (kit.gltf does it), or metres mean nothing. */
    function hull(geometry, thickness, scaleAttr) {
      var P = geometry.attributes.position, N = geometry.attributes.normal;
      if (P.normalized || !(P.array instanceof Float32Array)) JG.warn('hull-quantised:' + geometry.uuid, 'kit.hull: quantised positions on ' + (geometry.name || geometry.uuid) + '; the thickness is not in metres (dequantise first with kit.gltf)');
      var S = scaleAttr ? geometry.attributes[scaleAttr] : null;
      var acc = new Map(), keys = new Array(P.count), i, k, a;
      for (i = 0; i < P.count; i++) {
        k = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4);
        keys[i] = k;
        a = acc.get(k);
        if (!a) { a = [0, 0, 0]; acc.set(k, a); }
        a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i);
      }
      var out = new Float32Array(P.count * 3);
      for (i = 0; i < P.count; i++) {
        a = acc.get(keys[i]);
        var x = a[0], y = a[1], z = a[2], len = Math.sqrt(x * x + y * y + z * z);
        if (len < 1e-6) { x = N.getX(i); y = N.getY(i); z = N.getZ(i); len = Math.sqrt(x * x + y * y + z * z) || 1; }
        var t = thickness * (S ? S.getX(i) : 1) / len;
        out[i * 3] = P.getX(i) + x * t; out[i * 3 + 1] = P.getY(i) + y * t; out[i * 3 + 2] = P.getZ(i) + z * t;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(out, 3));
      if (geometry.attributes.skinIndex) g.setAttribute('skinIndex', geometry.attributes.skinIndex);
      if (geometry.attributes.skinWeight) g.setAttribute('skinWeight', geometry.attributes.skinWeight);
      if (geometry.index) g.setIndex(geometry.index);
      return g;
    }

    /* hullSet(geometry, thickness, opts?) -> BufferGeometry: the hull for set pieces and props (Stage 0 step 7 fix,
     * ported by E4 from dev/kit/corner.js fixedHull; see dev/out/kit-spike/DECISION.md). kit.hull stays as it is for
     * characters. Differences from kit.hull:
     *  1. Tolerance weld: vertices within opts.weld (1 mm) share one offset (spatial hash + union-find).
     *  2. Direction: angle-weighted sum of the welded vertex's face normals, from the triangles (zero-area triangles
     *     count for nothing). If they cancel (a zero-thickness double-sided sheet), each copy keeps its own.
     *  3. Mitred length: t / min(dot(dir, face normal)) over the incident faces (capped at 2.5 t), so every flat face
     *     moves out by the full thickness (kit.hull moves box faces 0.58 t at corners).
     *  4. Open parts are solidified: a connected component with open edges (used by one triangle, or "fin" edges
     *     whose two triangles face opposite ways) gets an outer sheet at +t, an inner sheet at -t with reversed winding
     *     and rim quads along the open edges (pushed outward in the face plane by t), so it is a closed shell whose
     *     back faces cover the body from any side. Closed components keep the plain outer sheet.
     * opts: {dirs: 'face'|'stored', weld: 1e-3, mitre: true, solidify: true}. Skin attributes are carried (doubled
     * when solidified). Returns a geometry with position and index; userData {solidified, openEdges}. */
    var HULLSET_DEFAULTS = { dirs: 'face', weld: 1e-3, mitre: true, solidify: true };
    function hullSet(geometry, thickness, opts) {
      opts = Object.assign({}, HULLSET_DEFAULTS, opts || {});
      var P = geometry.attributes.position, I = geometry.index, n = P.count, tol = opts.weld, MITER_MAX = 2.5, i, k, t;
      if (P.normalized || !(P.array instanceof Float32Array)) JG.warn('hullset-quantised:' + geometry.uuid, 'kit.hullSet: quantised positions on ' + (geometry.name || geometry.uuid) + '; the thickness is not in metres (dequantise first with kit.gltf)');
      var vix = function (tri, j) { return I ? I.getX(3 * tri + j) : 3 * tri + j; };
      // 1. weld
      var parent = new Int32Array(n); for (i = 0; i < n; i++) parent[i] = i;
      var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      var cells = new Map(), v = new THREE.Vector3(), w = new THREE.Vector3();
      for (i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i);
        var cx = Math.floor(v.x / tol), cy = Math.floor(v.y / tol), cz = Math.floor(v.z / tol);
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
          var l = cells.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)); if (!l) continue;
          for (var q = 0; q < l.length; q++) { w.fromBufferAttribute(P, l[q]); if (v.distanceToSquared(w) <= tol * tol) { var ra = find(i), rb = find(l[q]); if (ra !== rb) parent[ra] = rb; } }
        }
        var ck = cx + ',' + cy + ',' + cz, cl = cells.get(ck); if (!cl) cells.set(ck, cl = []); cl.push(i);
      }
      var root = new Int32Array(n); for (i = 0; i < n; i++) root[i] = find(i);
      // 2. face normals, angle-weighted vertex directions, welded edges
      var tris = I ? I.count / 3 : n / 3, fn = new Array(tris), acc = new Float64Array(n * 3), own = new Float64Array(n * 3);
      var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
      var edgeFaces = new Map();
      for (t = 0; t < tris; t++) {
        var vs = [vix(t, 0), vix(t, 1), vix(t, 2)];
        a.fromBufferAttribute(P, vs[0]); b.fromBufferAttribute(P, vs[1]); c.fromBufferAttribute(P, vs[2]);
        nn.subVectors(b, a).cross(e2.subVectors(c, a));
        var area2 = nn.length(); if (area2 < 1e-10) { fn[t] = null; continue; }
        nn.divideScalar(area2); fn[t] = nn.clone();
        var ps = [a, b, c];
        for (k = 0; k < 3; k++) {
          e1.subVectors(ps[(k + 1) % 3], ps[k]).normalize(); e2.subVectors(ps[(k + 2) % 3], ps[k]).normalize();
          var ang = Math.acos(Math.max(-1, Math.min(1, e1.dot(e2)))), r = root[vs[k]];
          if (opts.dirs === 'face') {
            acc[3 * r] += nn.x * ang; acc[3 * r + 1] += nn.y * ang; acc[3 * r + 2] += nn.z * ang;
            own[3 * vs[k]] += nn.x * ang; own[3 * vs[k] + 1] += nn.y * ang; own[3 * vs[k] + 2] += nn.z * ang;
          }
          var r0 = root[vs[k]], r1 = root[vs[(k + 1) % 3]];
          if (r0 !== r1) { var ek = r0 < r1 ? r0 + '_' + r1 : r1 + '_' + r0, lst = edgeFaces.get(ek); if (!lst) edgeFaces.set(ek, lst = []); lst.push([t, vs[k], vs[(k + 1) % 3], vs[(k + 2) % 3]]); }
        }
      }
      var NA = geometry.attributes.normal;
      if (opts.dirs === 'stored' && NA) for (i = 0; i < n; i++) { // kit.hull's directions: plain sum of the stored normals
        var rs = root[i]; acc[3 * rs] += NA.getX(i); acc[3 * rs + 1] += NA.getY(i); acc[3 * rs + 2] += NA.getZ(i);
        own[3 * i] = NA.getX(i); own[3 * i + 1] = NA.getY(i); own[3 * i + 2] = NA.getZ(i);
      }
      var dir = new Float64Array(n * 3), useOwn = new Uint8Array(n), cancelTol = opts.dirs === 'stored' ? 1e-6 : 1e-3;
      for (i = 0; i < n; i++) {
        var rr = root[i];
        v.set(acc[3 * rr], acc[3 * rr + 1], acc[3 * rr + 2]);
        if (v.length() < cancelTol) { v.set(own[3 * i], own[3 * i + 1], own[3 * i + 2]); useOwn[i] = 1; }
        if (v.length() < 1e-9) { if (NA) v.fromBufferAttribute(NA, i); else v.set(0, 1, 0); useOwn[i] = 1; }
        v.normalize(); dir[3 * i] = v.x; dir[3 * i + 1] = v.y; dir[3 * i + 2] = v.z;
      }
      // 3. mitre: smallest cosine between the direction and the incident faces (per weld group, or per copy)
      var cosR = new Float64Array(n).fill(1), cosV = new Float64Array(n).fill(1);
      for (t = 0; t < tris; t++) {
        if (!fn[t]) continue;
        for (k = 0; k < 3; k++) {
          var vi = vix(t, k), d0 = dir[3 * vi] * fn[t].x + dir[3 * vi + 1] * fn[t].y + dir[3 * vi + 2] * fn[t].z;
          if (useOwn[vi]) cosV[vi] = Math.min(cosV[vi], d0); else cosR[root[vi]] = Math.min(cosR[root[vi]], d0);
        }
      }
      // 4. open edges, components, rim push
      var fparent = new Int32Array(tris); for (t = 0; t < tris; t++) fparent[t] = t;
      var ffind = function (x) { while (fparent[x] !== x) { fparent[x] = fparent[fparent[x]]; x = fparent[x]; } return x; };
      var boundary = [], rim = new Float64Array(n * 3);
      edgeFaces.forEach(function (lst) {
        lst = lst.filter(function (f) { return fn[f[0]]; });
        if (!lst.length) return;
        var fin = lst.length === 2 && fn[lst[0][0]].dot(fn[lst[1][0]]) < -0.9;
        if (lst.length === 1 || fin) { lst.forEach(function (f) { boundary.push(f); }); return; }
        for (var j = 1; j < lst.length; j++) { var fa = ffind(lst[0][0]), fb = ffind(lst[j][0]); if (fa !== fb) fparent[fa] = fb; }
      });
      var openComp = new Set();
      boundary.forEach(function (f) {
        openComp.add(ffind(f[0]));
        a.fromBufferAttribute(P, f[1]); b.fromBufferAttribute(P, f[2]); c.fromBufferAttribute(P, f[3]);
        var out = new THREE.Vector3().subVectors(b, a).cross(fn[f[0]]).normalize();
        if (out.dot(e1.subVectors(c, a)) > 0) out.negate();
        [f[1], f[2]].forEach(function (x) { var q2 = root[x]; rim[3 * q2] += out.x; rim[3 * q2 + 1] += out.y; rim[3 * q2 + 2] += out.z; });
      });
      // 5. positions: outer sheet 0..n-1, inner sheet n..2n-1 (used only by open components)
      var solid = opts.solidify && openComp.size > 0, outPos = new Float32Array((solid ? 2 : 1) * n * 3), rv = new THREE.Vector3();
      for (i = 0; i < n; i++) {
        var cosm = useOwn[i] ? cosV[i] : cosR[root[i]], len = opts.mitre ? thickness / Math.max(cosm, 1 / MITER_MAX) : thickness, q3 = root[i];
        rv.set(rim[3 * q3], rim[3 * q3 + 1], rim[3 * q3 + 2]);
        if (!solid) rv.set(0, 0, 0); else if (rv.lengthSq() > 1e-12) rv.normalize().multiplyScalar(thickness);
        for (var s2 = 0; s2 < (solid ? 2 : 1); s2++) {
          var sg = s2 ? -1 : 1, o = 3 * (i + s2 * n);
          outPos[o] = P.getX(i) + sg * dir[3 * i] * len + rv.x; outPos[o + 1] = P.getY(i) + sg * dir[3 * i + 1] * len + rv.y; outPos[o + 2] = P.getZ(i) + sg * dir[3 * i + 2] * len + rv.z;
        }
      }
      var idx = [];
      for (t = 0; t < tris; t++) idx.push(vix(t, 0), vix(t, 1), vix(t, 2));
      if (solid) {
        for (t = 0; t < tris; t++) if (fn[t] && openComp.has(ffind(t))) idx.push(n + vix(t, 0), n + vix(t, 2), n + vix(t, 1));
        boundary.forEach(function (f) { var A = f[1], B = f[2]; idx.push(A, n + A, n + B, A, n + B, B); });
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
      ['skinIndex', 'skinWeight'].forEach(function (name) {
        var src = geometry.attributes[name]; if (!src) return;
        if (!solid) { g.setAttribute(name, src); return; }
        var arr = new src.array.constructor(src.array.length * 2); arr.set(src.array); arr.set(src.array, src.array.length);
        g.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize, src.normalized));
      });
      g.setIndex(idx);
      g.userData = { solidified: solid, openEdges: boundary.length };
      return g;
    }

    /* skin(root, bonesOrSkeleton, geometry, material) -> SkinnedMesh, for code-built meshes only.
     * The bones must already be parented under `root` in their bind pose. */
    function skin(root, bonesOrSkeleton, geometry, material) {
      root.updateMatrixWorld(true);
      var mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.frustumCulled = false;
      root.add(mesh);
      mesh.updateMatrixWorld(true);
      var skeleton = Array.isArray(bonesOrSkeleton) ? new THREE.Skeleton(bonesOrSkeleton) : bonesOrSkeleton;
      mesh.bind(skeleton, mesh.matrixWorld);
      return mesh;
    }

    // ---------- dequantisation (plan section 5, "Dequantise first") ----------
    // Normalised integer attributes become Float32 before any matrix is applied (writing into an Int16 attribute
    // clamps). skinIndex is an integer index, not normalised, and stays as it is.
    function toFloat(attr) {
      if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) return attr;
      // getX..getW de-normalise and read interleaved data directly (no clone, which logs a notice)
      var n = attr.count, s = attr.itemSize, out = new Float32Array(n * s), get = [attr.getX, attr.getY, attr.getZ, attr.getW];
      for (var i = 0; i < n; i++) for (var c = 0; c < s; c++) out[i * s + c] = get[c].call(attr, i);
      return new THREE.BufferAttribute(out, s);
    }
    function floatGeometry(g) {
      Object.keys(g.attributes).forEach(function (name) {
        if (name === 'skinIndex') return;
        var a = g.attributes[name], f = toFloat(a);
        if (f !== a) g.setAttribute(name, f);
      });
    }
    var M1 = new THREE.Matrix4();
    /* Static meshes: bake the node matrix (which carries the dequantisation scale/offset) into the geometry and
     * reset the node to identity; children keep their world placement. Skinned meshes: the rest skinning transform
     * E = bindMatrixInverse x boneWorld x boneInverse x bindMatrix must be the same for every bone (the file sits at
     * its bind pose); positions become E x q and each boneInverse becomes boneInverse x bindMatrix x E^-1 x
     * bindMatrixInverse, so rest skinning is the identity and animation is unchanged. Inverses are never
     * recomputed with calculateInverses(). Returns a list of warnings. */
    function dequantise(scene) {
      var warnings = [], seen = new Set();
      scene.updateMatrixWorld(true);
      var meshes = [];
      scene.traverse(function (o) { if (o.isMesh) meshes.push(o); });
      // Pass 1: float attributes and, for skinned meshes, the rest skinning transform E, measured before any
      // inverse is changed (meshes may share one skin's inverse matrices).
      var plans = meshes.map(function (mesh) {
        // r160's BufferGeometry.clone shares the userData object, so give the copy its own
        if (seen.has(mesh.geometry)) { var cg = mesh.geometry.clone(); cg.userData = {}; mesh.geometry = cg; }
        seen.add(mesh.geometry);
        floatGeometry(mesh.geometry);
        if (Object.keys(mesh.geometry.morphAttributes).length) warnings.push(mesh.name + ': morph targets are not dequantised (none are expected)');
        if (!mesh.isSkinnedMesh) return { mesh: mesh };
        var sk = mesh.skeleton, E = null, worst = 0;
        sk.bones.forEach(function (b, i) {
          M1.copy(mesh.bindMatrixInverse).multiply(b.matrixWorld).multiply(sk.boneInverses[i]).multiply(mesh.bindMatrix);
          if (!E) { E = M1.clone(); return; }
          for (var k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(M1.elements[k] - E.elements[k]));
        });
        if (worst > 1e-4) { warnings.push(mesh.name + ': file not at its bind pose (rest skinning differs by ' + worst.toExponential(1) + '); left quantised'); return { mesh: mesh, skip: true }; }
        return { mesh: mesh, E: E };
      });
      // Pass 2: apply.
      var doneInverse = new Set();
      plans.forEach(function (pl) {
        var mesh = pl.mesh, g = mesh.geometry;
        if (mesh.isSkinnedMesh) {
          mesh.frustumCulled = false;
          if (!pl.skip && !isIdentity(pl.E)) {
            g.applyMatrix4(pl.E); // positions and normals (normal matrix, renormalised)
            var C = new THREE.Matrix4().copy(mesh.bindMatrix).multiply(M1.copy(pl.E).invert()).multiply(mesh.bindMatrixInverse);
            mesh.skeleton.boneInverses.forEach(function (inv) { if (!doneInverse.has(inv)) { inv.multiply(C); doneInverse.add(inv); } });
          }
        } else {
          mesh.updateMatrix();
          if (!isIdentity(mesh.matrix)) {
            var M = mesh.matrix.clone();
            g.applyMatrix4(M);
            if (M.determinant() < 0 && g.index) { // a mirrored bake turns faces inside out: reverse the winding
              var ix = g.index.array; for (var t = 0; t + 2 < ix.length; t += 3) { var tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
              g.index.needsUpdate = true;
            }
            mesh.children.forEach(function (c) { c.applyMatrix4(M); });
            mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1); mesh.updateMatrix();
          }
        }
        g.computeBoundingBox(); g.computeBoundingSphere();
      });
      scene.updateMatrixWorld(true);
      return warnings;
    }
    function isIdentity(m) { var e = m.elements, I = IDENT.elements; for (var i = 0; i < 16; i++) if (Math.abs(e[i] - I[i]) > 1e-7) return false; return true; }

    /* gltf(name) -> { scene, animations, userData, source } : a fresh clone of the scene of a GLB that JG.assets
     * loaded, dequantised once per source. Clones share geometry and inverse binds (SkeletonUtils.clone). */
    function gltf(name) {
      var entry = JG.assets.get(name), g = entry.gltf;
      if (!g) throw new Error('kit.gltf: "' + name + '" is not a GLB');
      if (!g.scene.userData.__jgDequantised) {
        var w = dequantise(g.scene);
        w.forEach(function (m) { JG.warn('dq-' + name + m, 'kit.gltf(' + name + '): ' + m); });
        g.scene.userData.__jgDequantised = true;
      }
      var scene = THREE.SkeletonUtils.clone(g.scene);
      scene.userData = Object.assign({}, g.scene.userData);
      return { scene: scene, animations: g.animations, userData: g.scene.userData, source: g };
    }

    // Per-geometry caches live here, never in geometry.userData (r160 clones share userData).
    var hullCache = new WeakMap();   // source geometry -> Map(kind + thickness -> hull geometry)
    var paletteSource = new WeakMap(); // per-mesh palette copy -> the shared geometry it was copied from
    /* hullFor(g, thickness, set?): the cached hull of a source geometry: kit.hull (characters, set falsy) or
     * kit.hullSet (set pieces and props, set true), once per geometry and thickness. */
    function hullFor(g, thickness, set) {
      var byT = hullCache.get(g);
      if (!byT) {
        hullCache.set(g, byT = new Map());
        g.addEventListener('dispose', function () { byT.forEach(function (h) { h.dispose(); }); byT.clear(); });
      }
      var key = (set ? 's' : 'p') + thickness.toFixed(7);
      var h = byT.get(key);
      if (!h) { h = set ? hullSet(g, thickness) : hull(g, thickness); byT.set(key, h); }
      return h;
    }
    var M2 = new THREE.Matrix4();
    /** the uniform scale of an object in the world: the cube root of |det| of its world matrix (1 if degenerate) */
    function worldScale(obj) {
      obj.updateWorldMatrix(true, false);
      var d = Math.abs(M2.copy(obj.matrixWorld).determinant());
      return d > 1e-12 ? Math.cbrt(d) : 1;
    }

    /* restyle(object, { color?, palette?: {'#rrggbb': '#rrggbb'}, hull?: true, thickness?: 0.016, inkColor?, merge? })
     * Replaces every imported material with the toon material (vertex colours when the geometry has them), sets
     * frustumCulled = false on skinned meshes and gives each mesh one ink hull: a SkinnedMesh child bound to the
     * body's skeleton and bindMatrix, or a Mesh child. A palette remaps vertex colours on this object only: the mesh
     * gets its own colour attribute (positions, normals, index and skin stay shared with the source), always remapped
     * from the source colours. Calling restyle again replaces the hull instead of stacking a second one; hull: false
     * removes it. Input must come from kit.gltf (dequantised), or the hull thickness is not in metres.
     * Hulls (Stage 1, E4):
     *   - skinned meshes (characters) keep kit.hull at `thickness`, exactly as before;
     *   - static meshes get kit.hullSet (weld, mitre, solidify) at thickness / the mesh's world scale at the time of
     *     the call, so the ink reads `thickness` metres in the world however the piece is scaled (place and scale the
     *     object, or its parent, before restyling it). o.hullSet: false gives static meshes kit.hull instead.
     * The default thickness is 0.016 (plan section 13 checks 0.016 +-20%; Roo's hull is 0.016).
     * Returns { meshes, hulls }. `merge` is not implemented yet (Stage 1). */
    function restyle(object, o) {
      o = o || {};
      if (o.merge) JG.warn('restyle-merge', 'kit.restyle: merge is not implemented yet');
      var thickness = o.thickness !== undefined ? o.thickness : 0.016;
      var meshes = [], hulls = [], cache = {};
      object.traverse(function (n) { if (n.isMesh && !n.userData.jgHull) meshes.push(n); });
      meshes.forEach(function (m) {
        var src = paletteSource.get(m.geometry) || m.geometry, hasColor = !!src.attributes.color;
        if (o.palette && hasColor) {
          var pg = new THREE.BufferGeometry();
          pg.setIndex(src.index);
          Object.keys(src.attributes).forEach(function (n) { pg.setAttribute(n, src.attributes[n]); });
          pg.setAttribute('color', src.attributes.color.clone());
          src.groups.forEach(function (gr) { pg.addGroup(gr.start, gr.count, gr.materialIndex); });
          pg.boundingBox = src.boundingBox; pg.boundingSphere = src.boundingSphere;
          remap(pg.attributes.color, o.palette);
          paletteSource.set(pg, src);
          m.geometry = pg;
        }
        var key = (hasColor ? 'v' : 'c') + (o.color !== undefined ? o.color : '');
        m.material = cache[key] || (cache[key] = toon({ color: o.color !== undefined ? o.color : 0xffffff, vertexColors: hasColor }));
        if (m.isSkinnedMesh) m.frustumCulled = false;
        var old = m.children.filter(function (c) { return c.userData.jgHull; });
        old.forEach(function (c) { m.remove(c); });
        if (o.hull === false) return;
        var P = src.attributes.position;
        if (P.normalized || !(P.array instanceof Float32Array)) { JG.warn('restyle-quantised:' + src.uuid, 'kit.restyle: ' + (m.name || 'mesh') + ' is still quantised; no hull (load it through kit.gltf)'); return; }
        var inkMat = cache.ink || (cache.ink = ink(o.inkColor)), h;
        var hg = m.isSkinnedMesh ? hullFor(src, thickness) : hullFor(src, thickness / worldScale(m), o.hullSet !== false);
        if (m.isSkinnedMesh) {
          h = new THREE.SkinnedMesh(hg, inkMat);
          m.add(h);
          h.bind(m.skeleton, m.bindMatrix);
          h.frustumCulled = false;
        } else {
          h = new THREE.Mesh(hg, inkMat);
          m.add(h);
        }
        h.name = m.name + '_hull';
        h.userData.jgHull = true;
        hulls.push(h);
      });
      return { meshes: meshes, hulls: hulls };
    }
    function remap(attr, table) {
      var c = new THREE.Color(), map = {};
      Object.keys(table).forEach(function (k) { map[k.toLowerCase()] = new THREE.Color(table[k]); });
      for (var i = 0; i < attr.count; i++) {
        c.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i), THREE.LinearSRGBColorSpace);
        var to = map['#' + c.getHexString(THREE.SRGBColorSpace)];
        if (to) attr.setXYZ(i, to.r, to.g, to.b);
      }
      attr.needsUpdate = true;
    }

    // ---------- Stage 1 additions (E1): geo helpers, instanced, blobShadow, tex.sign ----------
    /* geo.*: plain BufferGeometry makers with the base at y = 0 where it matters, so scene code places by feet.
     *   box(w, h, d, {base?}) cyl(rTop, rBot, h, seg?) sphere(r, seg?) capsule(r, h, seg?) (h = total height, base at 0)
     *   lathe(points [[r, y], ...], seg?) extrude(shape points [[x, y], ...], depth, {bevel?}) */
    var geoH = {
      merge: merge,
      box: function (w, h, d, o) { var g = new THREE.BoxGeometry(w, h, d); if (o && o.base) g.translate(0, h / 2, 0); return g; },
      cyl: function (rt, rb, h, seg) { return new THREE.CylinderGeometry(rt, rb, h, seg || 16).translate(0, h / 2, 0); },
      sphere: function (r, seg) { return new THREE.SphereGeometry(r, seg || 16, Math.max(6, Math.round((seg || 16) * 0.66))); },
      capsule: function (r, h, seg) { return new THREE.CapsuleGeometry(r, Math.max(0, h - 2 * r), 4, seg || 12).translate(0, h / 2, 0); },
      lathe: function (pts, seg) { return new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg || 24); },
      extrude: function (pts, depth, o) {
        var s = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }));
        return new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: !!(o && o.bevel), bevelSize: (o && o.bevel) || 0, bevelThickness: (o && o.bevel) || 0, bevelSegments: 1 });
      }
    };
    /* instanced(mesh, transforms) -> InstancedMesh sharing mesh's geometry and material. transforms: [{pos, rot?: [x,y,z]
     * | yaw?, scale?}] or Matrix4s. A hull child (userData.jgHull) is instanced the same way. */
    function instanced(mesh, transforms) {
      var mats = transforms.map(function (t) {
        if (t && t.isMatrix4) return t;
        var q = new THREE.Quaternion();
        if (t.rot) q.setFromEuler(new THREE.Euler(t.rot[0], t.rot[1], t.rot[2])); else if (t.yaw) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw);
        var s = t.scale === undefined ? 1 : t.scale;
        return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(t.pos || [0, 0, 0]), q, Array.isArray(s) ? new THREE.Vector3().fromArray(s) : new THREE.Vector3(s, s, s));
      });
      function make(m) {
        var im = new THREE.InstancedMesh(m.geometry, m.material, mats.length);
        mats.forEach(function (x, i) { im.setMatrixAt(i, x); });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.name = (m.name || 'mesh') + '_inst';
        return im;
      }
      var out = make(mesh);
      mesh.children.forEach(function (c) { if (c.isMesh && c.userData.jgHull) { var h = make(c); h.userData.jgHull = true; out.add(h); } });
      return out;
    }
    var blobTex = null;
    /** blobShadow(radius = 0.4, opacity = 0.35) -> a flat Mesh at y = 0.01 with a soft radial dark spot (no lights) */
    function blobShadow(radius, opacity) {
      if (!blobTex) blobTex = canvasTex(64, 64, function (c, w, h) {
        var g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      });
      var r = radius || 0.4;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: opacity === undefined ? 0.35 : opacity, depthWrite: false }));
      m.position.y = 0.01;
      m.renderOrder = -1;
      m.name = 'blob-shadow';
      return m;
    }
    /** tex.sign(text, {w = 512, h = 128, bg = '#FFF8E7', fg = '#111', font = 'Bangers, Impact, sans-serif', border = 6})
     * -> CanvasTexture with centred, auto-fitted text and an ink border (fonts must be registered before it is called). */
    function sign(text, o) {
      o = o || {};
      var w = o.w || 512, h = o.h || 128;
      return canvasTex(w, h, function (c) {
        c.fillStyle = o.bg || '#FFF8E7'; c.fillRect(0, 0, w, h);
        var b = o.border === undefined ? 6 : o.border;
        if (b) { c.lineWidth = b; c.strokeStyle = o.fg || '#111'; c.strokeRect(b / 2, b / 2, w - b, h - b); }
        var size = Math.round(h * 0.62);
        c.font = size + 'px ' + (o.font || 'Bangers, Impact, sans-serif');
        while (size > 8 && c.measureText(text).width > w * 0.88) { size -= 2; c.font = size + 'px ' + (o.font || 'Bangers, Impact, sans-serif'); }
        c.fillStyle = o.fg || '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, w / 2, h / 2 + size * 0.04);
      });
    }

    return {
      THREE: THREE, quality: opts.quality || 'high', rng: JG.rng(opts.seed !== undefined ? opts.seed : 1), PALETTE: PALETTE, ramp: ramp,
      mat: { toon: toon, vertexToon: vertexToon, flat: flat, ink: ink },
      tex: { canvas: canvasTex, sign: sign },
      geo: geoH,
      instanced: instanced, blobShadow: blobShadow,
      hull: hull, hullSet: hullSet, hullOf: hullFor, worldScale: worldScale, skin: skin, gltf: gltf, restyle: restyle,
      _dequantise: dequantise
    };
  };
})();
