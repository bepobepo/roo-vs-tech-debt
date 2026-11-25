/* Interior pieces (E4, Stage 1) shared by subway.js and office.js: procedural furniture as single meshes with an ink
 * hull child (so kit.instanced can instance body and hull together), the canvas textures of the subway (tunnel and
 * station walls, scrolled by the set) and of the office (the dive-shaped broken pane, the wall dashboard).
 * The office furniture is kit-office.glb (officeKit below); the procedural desk, chair and monitor box lists stay as
 * office.js's fallback when that GLB is missing.
 *
 *   JG.interior.officeKit(kit) -> K | null            the kit-office pieces for JG.setkit's builder (see below)
 *   JG.interior.boxesMesh(kit, boxes, o?) -> Mesh   boxes [[x0, y0, z0, x1, y1, z1, color, {hull?}]]: one
 *                                                   vertex-coloured toon mesh, plus a merged hull child (each box
 *                                                   grown by the ink thickness: a mitred box hull)
 *   JG.interior.desk / chair / monitor / heroDesk     box lists in local space: the seated person sits at the origin
 *                                                   side (-Z) and faces +Z
 *   JG.interior.tunnelTexture(kit) / stationTexture(kit)   repeatable CanvasTextures (RepeatWrapping on S)
 *   JG.interior.drawBrokenPane(ctx, w, h)            glass tint with a Roo-dive-shaped hole (alpha 0) and cracks
 *   JG.interior.drawDashboard(ctx, w, h, mood)       the office wall screen: 'before' red, 'after' green
 * Classic script; THREE and the DOM only inside calls. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  if (JG.manifest) JG.manifest.add('kit-office', 'assets/models/kit-office.glb');

  function boxesMesh(kit, boxes, o) {
    o = o || {};
    var THREE = kit.THREE, T = JG.setkit.T, parts = [], hulls = [], dispose = [];
    boxes.forEach(function (b) {
      var sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2];
      var m = new THREE.Matrix4().makeTranslation((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      var g = new THREE.BoxGeometry(sx, sy, sz);
      parts.push({ geometry: g, matrix: m, color: b[6] }); dispose.push(g);
      if (o.hull !== false && !(b[7] && b[7].hull === false)) {
        var h = new THREE.BoxGeometry(sx + 2 * T, sy + 2 * T, sz + 2 * T);
        hulls.push({ geometry: h, matrix: m }); dispose.push(h);
      }
    });
    var geo = kit.geo.merge(parts);
    geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
    geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, o.material || kit.mat.vertexToon());
    mesh.name = o.name || 'boxes';
    if (hulls.length) {
      var hm = new THREE.Mesh(JG.setkit.mergeHull(THREE, hulls), o.ink || kit.mat.ink());
      hm.userData.jgHull = true; hm.name = mesh.name + '_hull';
      mesh.add(hm);
    }
    dispose.forEach(function (g) { g.dispose(); });
    return mesh;
  }

  var WOOD = 0xc9a26b, WOOD_D = 0xa9844f, GREY = 0x8d939e, DARK = 0x2d3038, KEY = 0x3a3f4a;
  // desk: top at 0.76, 1.6 x 0.8, centred 0.65 in front of the seat
  var DESK = [
    [-0.8, 0.72, 0.25, 0.8, 0.76, 1.05, WOOD], [-0.78, 0, 0.29, -0.72, 0.72, 1.01, GREY], [0.72, 0, 0.29, 0.78, 0.72, 1.01, GREY],
    [-0.72, 0.28, 0.95, 0.72, 0.72, 0.99, GREY], [-0.24, 0.76, 0.33, 0.24, 0.785, 0.47, KEY], [0.34, 0.76, 0.36, 0.42, 0.785, 0.46, KEY]
  ];
  var CHAIR = [
    [-0.26, 0.42, -0.24, 0.26, 0.5, 0.26, 0x41506b], [-0.25, 0.52, -0.33, 0.25, 1.06, -0.26, 0x41506b],
    [-0.03, 0.08, -0.03, 0.03, 0.42, 0.03, DARK], [-0.3, 0.02, -0.04, 0.3, 0.08, 0.04, DARK], [-0.04, 0.02, -0.3, 0.04, 0.08, 0.3, DARK],
    [-0.3, 0.6, -0.2, -0.26, 0.64, 0.18, DARK], [0.26, 0.6, -0.2, 0.3, 0.64, 0.18, DARK]
  ];
  var MONITOR = [
    [-0.31, 0.95, 0.78, 0.31, 1.33, 0.82, 0x1d2230], [-0.27, 0.98, 0.775, 0.27, 1.3, 0.78, 0x34507a, { hull: false }],
    [-0.03, 0.76, 0.82, 0.03, 0.96, 0.86, DARK], [-0.11, 0.76, 0.74, 0.11, 0.78, 0.92, DARK]
  ];
  // the hero desk (no instancing): the same desk with a wider monitor housing; the live screen is a canvas plane
  var HERO_DESK = DESK.concat([
    [-0.48, 0.75, -0.08 + 0.65 + 0.27, 0.48, 1.4, 0.0 + 0.65 + 0.35, 0x1d2230], [-0.05, 0.76, 0.98, 0.05, 0.9, 1.02, DARK],
    [0.55, 0.76, 0.5, 0.7, 0.87, 0.62, 0xffffff], [0.56, 0.87, 0.51, 0.69, 0.875, 0.61, 0x6b4a2a, { hull: false }]
  ]);

  function wrapTex(kit, w, h, draw) {
    var t = kit.tex.canvas(w, h, draw);
    t.wrapS = kit.THREE.RepeatWrapping;
    t.wrapT = kit.THREE.ClampToEdgeWrapping;
    return t;
  }
  /** the tunnel wall seen through the subway windows: dark concrete, a cable run, lamps that streak past */
  function tunnelTexture(kit) {
    return wrapTex(kit, 1024, 256, function (c, w, h) {
      c.fillStyle = '#20232b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2b2f39'; for (var i = 0; i < w; i += 128) c.fillRect(i, 0, 6, h);
      c.fillStyle = '#14161c'; c.fillRect(0, h * 0.62, w, 10); c.fillRect(0, h * 0.7, w, 6);
      // lamps (motion-blurred streaks)
      [140, 610].forEach(function (x) {
        var g = c.createLinearGradient(x - 120, 0, x + 120, 0);
        g.addColorStop(0, 'rgba(255,214,120,0)'); g.addColorStop(0.5, 'rgba(255,230,160,0.95)'); g.addColorStop(1, 'rgba(255,214,120,0)');
        c.fillStyle = g; c.fillRect(x - 120, h * 0.28, 240, 16);
      });
      // a painted stripe and a little ink
      c.fillStyle = '#1F4FD8'; c.fillRect(0, h * 0.84, w, 8);
      c.strokeStyle = '#0c0d10'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3);
    });
  }
  /** the HOP ST station wall for 'stopped': cream tiles, a name band with the roundel */
  function stationTexture(kit) {
    return wrapTex(kit, 1024, 256, function (c, w, h) {
      c.fillStyle = '#efe6cf'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
      for (var x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (var y = 0; y <= h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.fillStyle = '#3f7a5a'; c.fillRect(0, h * 0.18, w, 8); c.fillRect(0, h * 0.78, w, 8);
      c.fillStyle = '#111'; c.fillRect(300, h * 0.32, 424, 96);
      JG.setkit.roundel(c, 350, h * 0.32 + 48, 36);
      c.fillStyle = '#FFF8E7'; c.textAlign = 'center'; c.textBaseline = 'middle';
      JG.setkit.fitText(c, 'HOP ST', 300, 72, JG.setkit.FONT);
      c.fillText('HOP ST', 560, h * 0.32 + 50);
    });
  }
  /* the broken pane: glass tint (alpha 0.3) with a Roo-in-a-dive hole (alpha 0: alphaTest discards it) centred at
   * (cx, cy) in the canvas, and ink cracks around it. The pane is 2 m x 2.5 m on a 256 x 320 canvas. */
  function drawBrokenPane(c, w, h, cx, cy) {
    cx = cx === undefined ? w / 2 : cx; cy = cy === undefined ? h * 0.64 : cy;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(191,227,255,0.32)'; c.fillRect(0, 0, w, h);
    var s = w / 2; // pixels per metre
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.translate(cx, cy);
    function ell(x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x * s, -y * s, rx * s, ry * s, rot || 0, 0, Math.PI * 2); c.fill(); }
    ell(0, 0, 0.26, 0.42, 0);              // torso (seen from behind, diving away)
    ell(0, 0.5, 0.15, 0.16, 0);            // head
    ell(-0.09, 0.78, 0.05, 0.17, -0.15);   // ears
    ell(0.09, 0.78, 0.05, 0.17, 0.15);
    ell(-0.3, 0.42, 0.07, 0.36, 0.5);      // arms forward-up
    ell(0.3, 0.42, 0.07, 0.36, -0.5);
    ell(-0.14, -0.55, 0.09, 0.3, -0.12);   // legs
    ell(0.14, -0.55, 0.09, 0.3, 0.12);
    ell(0.24, -0.62, 0.05, 0.32, 0.9);     // tail
    ell(0, 0.05, 0.42, 0.3, 0);            // cape spread
    c.restore();
    // cracks
    c.strokeStyle = 'rgba(17,17,17,0.95)'; c.lineWidth = 2.5; c.lineCap = 'round';
    var rays = [[-1, -0.2], [-0.8, 0.9], [-0.2, 1], [0.6, 0.95], [1, 0.3], [0.9, -0.6], [0.2, -1], [-0.6, -0.9]];
    rays.forEach(function (r, i) {
      var len = s * (0.55 + (i % 3) * 0.25), x0 = cx + r[0] * s * 0.45, y0 = cy - r[1] * s * 0.6;
      c.beginPath(); c.moveTo(x0, y0);
      c.lineTo(x0 + r[0] * len * 0.5 + (i % 2 ? 6 : -6), y0 - r[1] * len * 0.5);
      c.lineTo(x0 + r[0] * len, y0 - r[1] * len); c.stroke();
    });
    c.lineWidth = 4; c.strokeStyle = '#111'; c.strokeRect(2, 2, w - 4, h - 4);
  }
  /** the wall dashboard: OPEN ISSUES 166 on red (before), 0 on green (after) */
  function drawDashboard(c, w, h, mood) {
    var after = mood === 'after';
    c.fillStyle = '#14161c'; c.fillRect(0, 0, w, h);
    c.fillStyle = after ? '#1FA971' : '#d6333f'; c.fillRect(10, 10, w - 20, 44);
    c.fillStyle = '#FFF8E7'; c.font = '30px ' + JG.setkit.FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(after ? 'ALL GOOD' : 'INCIDENTS', 22, 33);
    c.textAlign = 'right'; c.font = '16px "Comic Neue", sans-serif'; c.fillText('ORG HEALTH', w - 22, 33);
    c.textAlign = 'left'; c.font = '20px "Comic Neue", sans-serif'; c.fillStyle = '#c9cdd6'; c.fillText('OPEN ISSUES', 22, 82);
    c.font = '84px ' + JG.setkit.FONT; c.fillStyle = after ? '#1FA971' : '#ff5b66'; c.fillText(after ? '0' : '166', 22, 140);
    // bars
    var vals = after ? [0.08, 0.1, 0.06, 0.05, 0.04, 0.03, 0.02] : [0.4, 0.55, 0.5, 0.7, 0.66, 0.85, 0.95];
    vals.forEach(function (v, i) {
      var bx = w * 0.5 + i * (w * 0.065), bh = (h - 90) * v;
      c.fillStyle = after ? '#1FA971' : (v > 0.6 ? '#ff5b66' : '#FFD21F');
      c.fillRect(bx, h - 20 - bh, w * 0.045, bh);
    });
    c.strokeStyle = '#3a3f4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(w * 0.48, h - 19); c.lineTo(w - 14, h - 19); c.stroke();
  }

  /* officeKit(kit) -> K | null: the office furniture of kit-office.glb (tools/assets.config.json kits.office: Kenney
   * Furniture Kit 2.0 and the MrEliptik Office Low Poly Pack, both CC0, and the two VNB office sets, CC BY 4.0, pieces
   * "vnb_*"; colours baked into the office palettes at build time), for JG.setkit's builder. null (with a warning) when the GLB is not loaded: office.js then builds boxes.
   *   K.geo(name, o?) -> BufferGeometry   a piece's geometry (shared, never disposed by the builder), or a cached copy:
   *     o.lift [y0, dy]   every vertex above y0 moves up dy (a taller gas lift, longer desk legs: what sits above
   *                       keeps its size); o.drop y: triangles lying wholly below y are removed (a monitor's foot);
   *     o.palette {'#rrggbb': '#rrggbb'}  colour remap (as kit.restyle; nearest source colour within 4/255);
   *     o.cut [[x0, y0, z0, x1, y1, z1], ...]  removes triangles lying wholly inside a box (piece units, before lift)
   *   K.place(B, name, o) -> {min, max}   adds a piece to builder B and returns its world bounds. o: rot (degrees
   *     about Y), tilt (degrees about X, before rot), scale (uniform, on top of the built scale), x | minX | maxX
   *     (default: the footprint's centre at x), z | minZ | maxZ the same, y = the lowest point (default 0); o.raw: x, y,
   *     z translate the piece's own origin instead. group, hull (default true), cam (default false: camera collider)
   *     and the geo options above. o.frame (Matrix4): all of that is in this local frame (a workstation's: seat at
   *     the origin facing +Z), applied last; the returned bounds are the frame's AABB of them. Kenney pieces have their
   *     origin at a back corner and face +Z; MrEliptik's monitor faces +X; VNB pieces face +Z (set #2 is turned
   *     Y-up at build time, piece "upAxis": "z").
   *   K.dispose()                         frees the copies made by geo() (call after B.build). */
  function officeKit(kit) {
    var THREE = kit.THREE, src = {}, cache = {}, made = [];
    try {
      if (JG.assets && JG.assets.has && !JG.assets.has('kit-office')) throw new Error('not loaded');
      kit.gltf('kit-office').scene.traverse(function (o) { if (o.isMesh && !o.userData.jgHull) src[o.name] = o.geometry; });
    } catch (e) {
      JG.warn('kit-office-missing', 'interior: kit-office.glb is not available (' + (e && e.message) + '); the office falls back to boxes');
      return null;
    }
    var c = new THREE.Color();
    function remap(attr, table) {
      var to = Object.keys(table).map(function (k) { var h = parseInt(k.slice(1), 16); return [[h >> 16 & 255, h >> 8 & 255, h & 255], new THREE.Color(table[k])]; });
      for (var i = 0; i < attr.count; i++) {
        var h = c.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i), THREE.LinearSRGBColorSpace).getHex(THREE.SRGBColorSpace);
        var rgb = [h >> 16 & 255, h >> 8 & 255, h & 255];
        for (var k = 0; k < to.length; k++) {
          var f = to[k][0];
          if (Math.abs(f[0] - rgb[0]) <= 4 && Math.abs(f[1] - rgb[1]) <= 4 && Math.abs(f[2] - rgb[2]) <= 4) { attr.setXYZ(i, to[k][1].r, to[k][1].g, to[k][1].b); break; }
        }
      }
      attr.needsUpdate = true;
    }
    function geo(name, o) {
      o = o || {};
      var base = src[name];
      if (!base) { JG.warn('office-piece-' + name, 'interior: kit-office has no piece ' + name); return null; }
      if (!o.lift && o.drop === undefined && !o.palette && !o.cut) { if (!base.boundingBox) base.computeBoundingBox(); return base; }
      var key = name + '|' + JSON.stringify([o.lift || 0, o.drop === undefined ? null : o.drop, o.palette || 0, o.cut || 0]);
      if (cache[key]) return cache[key];
      var g = base.clone(), P = g.attributes.position;
      if (o.cut && g.index) {
        var CI = g.index, kept = [], inBox = function (v, b) { return P.getX(v) >= b[0] && P.getX(v) <= b[3] && P.getY(v) >= b[1] && P.getY(v) <= b[4] && P.getZ(v) >= b[2] && P.getZ(v) <= b[5]; };
        for (var ct = 0; ct + 2 < CI.count; ct += 3) {
          var v0 = CI.getX(ct), v1 = CI.getX(ct + 1), v2 = CI.getX(ct + 2);
          if (!o.cut.some(function (b) { return inBox(v0, b) && inBox(v1, b) && inBox(v2, b); })) kept.push(v0, v1, v2);
        }
        g.setIndex(kept);
      }
      if (o.lift) for (var i = 0; i < P.count; i++) if (P.getY(i) > o.lift[0]) P.setY(i, P.getY(i) + o.lift[1]);
      if (o.drop !== undefined && g.index) {
        var I = g.index, keep = [];
        for (var t = 0; t + 2 < I.count; t += 3) {
          var a = I.getX(t), b = I.getX(t + 1), d = I.getX(t + 2);
          if (Math.max(P.getY(a), P.getY(b), P.getY(d)) >= o.drop) keep.push(a, b, d);
        }
        g.setIndex(keep);
      }
      if (o.palette && g.attributes.color) remap(g.attributes.color, o.palette);
      g.computeBoundingBox(); g.computeBoundingSphere();
      made.push(g);
      return (cache[key] = g);
    }
    var deg = THREE.MathUtils.degToRad;
    function place(B, name, o) {
      o = o || {};
      var g = geo(name, o);
      if (!g) return null;
      var s = o.scale || 1;
      var R = new THREE.Matrix4().makeRotationY(deg(o.rot || 0));
      if (o.tilt) R.multiply(new THREE.Matrix4().makeRotationX(deg(o.tilt)));
      R.multiply(new THREE.Matrix4().makeScale(s, s, s));
      var bb = g.boundingBox.clone().applyMatrix4(R), tx, ty, tz;
      if (o.raw) { tx = o.x || 0; ty = o.y || 0; tz = o.z || 0; } else {
        tx = o.minX !== undefined ? o.minX - bb.min.x : o.maxX !== undefined ? o.maxX - bb.max.x : (o.x || 0) - (bb.min.x + bb.max.x) / 2;
        tz = o.minZ !== undefined ? o.minZ - bb.min.z : o.maxZ !== undefined ? o.maxZ - bb.max.z : (o.z || 0) - (bb.min.z + bb.max.z) / 2;
        ty = (o.y || 0) - bb.min.y;
      }
      var m = new THREE.Matrix4().makeTranslation(tx, ty, tz).multiply(R);
      if (o.frame) m.premultiply(o.frame);
      B.geo(g, m, undefined, { group: o.group, hull: o.hull, dispose: false, scale: s, cam: !!o.cam, thin: o.thin });
      bb.translate(new THREE.Vector3(tx, ty, tz));
      if (o.frame) bb.applyMatrix4(o.frame);
      return { min: bb.min.toArray(), max: bb.max.toArray() };
    }
    return {
      geo: geo, place: place, has: function (n) { return !!src[n]; },
      dispose: function () { made.forEach(function (g) { g.dispose(); }); made = []; cache = {}; }
    };
  }

  JG.interior = {
    officeKit: officeKit,
    boxesMesh: boxesMesh, desk: DESK, chair: CHAIR, monitor: MONITOR, heroDesk: HERO_DESK,
    tunnelTexture: tunnelTexture, stationTexture: stationTexture, drawBrokenPane: drawBrokenPane, drawDashboard: drawDashboard
  };
})();
