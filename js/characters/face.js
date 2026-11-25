/* JG.face: the comic face engine for the humans (plan section 9, "The face decal"). Engine only: per-character frames
 * and the face style come from the cast-*.js files through JG.characters.register data. Classic script; touches
 * neither THREE nor the DOM at load.
 *
 * STAGE 1b (2026-11-24, people pass): an inked comic face drawn on a canvas and shown on a decal that CONFORMS to the
 * head: a 10x12 grid laid over the front of the face and dropped onto the skin triangles (JG.dress gives them), 2.5 mm
 * proud of the skin, riding on the Head bone. One draw call, about 200 triangles, no hull (plan section 5 allows the
 * human budget to rise to 3 draw calls for the decal). The canvas is redrawn only when the expression, the mouth
 * state or the blink changes. ROUND 2c: the decal is lit with the skin's toon ramp and carries the skin's own normals
 * (JG.dress.surfaceNormals), so it shades exactly like the face under it instead of staying flat and unlit. STAGE 1d:
 * the eye whites (the canvas's pure white: whites, catchlights, teeth) keep a lighting floor, so they stay near white in
 * dim, warm light instead of going peach; the rest of the decal keeps the skin's shading. Features are placed in metres from the head landmarks, so they sit on the eyes, nose
 * and mouth of the mesh, and they read at mid shots and close-ups alike.
 *
 * Frames (data):
 *   { eyes: 'open'|'half'|'closed'|'wide'|'wink'|'down'|'happy'|'squeeze'|'sad', look: [dx, dy] (-1..1),
 *     brows: -1..1 (1 = worried, inner ends up; -1 = angry, inner ends down), browUp: -1..1 (both brows up or down),
 *     mouth: 'flat'|'smile'|'grin'|'smirk'|'frown'|'sad'|'o'|'open'|'talk'|'wail', tears: bool, blush: bool }
 *   Lip flap opens the current mouth: smile/grin/smirk -> an open smile with teeth, frown/sad -> an open sad mouth,
 *   o -> a wider O, flat/talk/open -> an open oval.
 * Style (per character): { skin, lid (eyelid colour for half-closed eyes), iris, brow, browW (metres), lips (colour),
 *   lipFill: bool (drawn lips), lashes: 'female'|'male', nose: 'soft'|'hook', wrinkles: bool, eyeW, eyeH (metres) }
 *
 *   JG.face.create(kit, { rig, frames, neutral, style?, landmarks, surface, base?, ink? })
 *     -> { root, set(name, fade), mouth(level), tick(dt), neutral, current() }
 * Unknown names keep the neutral frame and record a stub hit. Blinks are deterministic (a hash of the actor's base and
 * the blink count, never Math.random) and run on the game clock through tick(dt).
 */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};

  var DEF_STYLE = { skin: '#D9A887', lid: null, iris: '#5B3A22', brow: '#2B2420', browW: 0.0032, lips: '#B5524F', lipFill: false,
    lashes: 'male', nose: 'hook', wrinkles: false, eyeW: 0.0135, eyeH: 0.0082 };
  var WHITE_FLOOR = 0.84;   // linear: about 236/255 on screen, the eye whites' darkest in any light
  var INK = '#111111', MOUTH_IN = '#5A1220', TONGUE = '#E06A7A', TEETH = '#FFFFFF', TEAR = '#4FA3E8', BLUSH = 'rgba(224,33,138,0.42)';

  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')';
  }
  function hash01(s, n) {
    var h = 2166136261 >>> 0, str = s + ':' + n;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /**
   * draw(ctx, L, f, st, open, blink): L = layout in canvas pixels { s (px per metre), eyeL:[x,y], eyeR:[x,y], nose:[x,y],
   * mouth:[x,y], W, H, left (+1 if the body's left is +x, the canvas is drawn looking at the face) }.
   */
  function draw(ctx, L, f, st, open, blink) {
    var s = L.s;
    ctx.clearRect(0, 0, L.W, L.H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var kind = f.eyes || 'open';
    if (blink && kind !== 'closed' && kind !== 'happy' && kind !== 'squeeze') kind = 'closed';
    var b = f.brows || 0, up = f.browUp || 0, lid = st.lid || shade(st.skin, 0.86);
    var ew = st.eyeW * s, eh = st.eyeH * s;
    if (kind === 'wide') { ew *= 1.08; eh *= 1.35; }

    // ---- eyes: [side] -1 = the eye on the canvas left (the body's right), +1 = canvas right
    [-1, 1].forEach(function (side) {
      var c = side < 0 ? L.eyeA : L.eyeB, x = c[0], y = c[1], k = kind;
      if (k === 'wink' && side > 0) k = 'closed';
      else if (k === 'wink') k = 'open';
      // inner corner faces the nose: o = +1 toward the outer side
      var o = side;
      var xi = x - o * ew, xo = x + o * ew;
      function almond(path) {
        path.beginPath();
        path.moveTo(xi, y + eh * 0.05);
        path.bezierCurveTo(xi + o * ew * 0.35, y - eh * 1.2, xo - o * ew * 0.45, y - eh * 1.15, xo, y - eh * 0.15);
        path.bezierCurveTo(xo - o * ew * 0.35, y + eh * 0.95, xi + o * ew * 0.4, y + eh * 1.0, xi, y + eh * 0.05);
        path.closePath();
      }
      ctx.lineWidth = Math.max(2, 0.0026 * s); ctx.strokeStyle = INK;
      if (k === 'closed' || k === 'happy' || k === 'down') {
        ctx.beginPath();
        if (k === 'happy') { ctx.moveTo(xi, y + eh * 0.25); ctx.quadraticCurveTo(x, y - eh * 1.25, xo, y + eh * 0.15); }
        else if (k === 'down') { ctx.moveTo(xi, y + eh * 0.15); ctx.quadraticCurveTo(x, y + eh * 0.55, xo, y + eh * 0.05); }
        else { ctx.moveTo(xi, y); ctx.quadraticCurveTo(x, y + eh * 0.95, xo, y - eh * 0.1); }
        ctx.stroke();
        if (st.lashes === 'female' && k !== 'happy') {   // three lash ticks under the closed lid
          ctx.lineWidth = Math.max(1.5, 0.0016 * s);
          for (var q = 0; q < 3; q++) { var tx = x + o * ew * (0.15 + q * 0.32), ty = y + eh * (0.62 - q * 0.18); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + o * ew * 0.18, ty + eh * 0.5); ctx.stroke(); }
        }
        return;
      }
      if (k === 'squeeze') {   // ><
        ctx.lineWidth = Math.max(2.5, 0.003 * s);
        ctx.beginPath(); ctx.moveTo(xo, y - eh * 0.9); ctx.lineTo(xi + o * ew * 0.2, y); ctx.lineTo(xo, y + eh * 0.7); ctx.stroke();
        return;
      }
      // the white, the iris (clipped), the lids
      ctx.save();
      almond(ctx); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.clip();
      var look = f.look || [0, 0], ir = eh * (k === 'wide' ? 0.62 : 0.86);
      var ix = x + look[0] * ew * 0.35 * (L.left || 1), iy = y + eh * 0.05 + look[1] * eh * 0.3;
      ctx.fillStyle = st.iris; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(ix - ir * 0.32, iy - ir * 0.36, ir * 0.24, 0, Math.PI * 2); ctx.fill();
      var lidLine = null;
      if (k === 'half' || k === 'sad') {
        // the upper lid comes down: a skin-coloured lid over the top of the eye, tilted for sad
        var tilt = k === 'sad' ? -0.55 : 0.05, ly = y - eh * 0.1;
        ctx.fillStyle = lid; ctx.beginPath();
        ctx.moveTo(xi - o * 4, ly + o * 0 - tilt * eh * -1); ctx.lineTo(xo + o * 4, ly + tilt * eh);
        ctx.lineTo(xo + o * 4, y - eh * 2); ctx.lineTo(xi - o * 4, y - eh * 2); ctx.closePath(); ctx.fill();
        lidLine = [xi, ly - tilt * eh * -1, xo, ly + tilt * eh];
      }
      ctx.restore();
      // outline: thin all round, thick upper lash line
      ctx.lineWidth = Math.max(1.2, 0.0011 * s); almond(ctx); ctx.stroke();
      ctx.lineWidth = Math.max(2.5, (st.lashes === 'female' ? 0.0034 : 0.0026) * s);
      ctx.beginPath();
      if (lidLine) { ctx.moveTo(lidLine[0], lidLine[1]); ctx.lineTo(lidLine[2], lidLine[3]); }
      else { ctx.moveTo(xi, y + eh * 0.05); ctx.bezierCurveTo(xi + o * ew * 0.35, y - eh * 1.2, xo - o * ew * 0.45, y - eh * 1.15, xo, y - eh * 0.15); }
      ctx.stroke();
      if (st.lashes === 'female') {   // the flick at the outer corner
        var fx = lidLine ? lidLine[2] : xo, fy = lidLine ? lidLine[3] : y - eh * 0.15;
        ctx.beginPath(); ctx.moveTo(fx - o * ew * 0.2, fy + eh * 0.05); ctx.quadraticCurveTo(fx + o * ew * 0.25, fy - eh * 0.1, fx + o * ew * 0.42, fy - eh * 0.7); ctx.stroke();
      }
      if (st.wrinkles) {   // crow's feet
        ctx.lineWidth = Math.max(1, 0.0009 * s);
        for (var w = -1; w <= 1; w++) { ctx.beginPath(); ctx.moveTo(xo + o * ew * 0.25, y + w * eh * 0.45); ctx.lineTo(xo + o * ew * 0.6, y + w * eh * 0.75); ctx.stroke(); }
      }
    });

    // ---- brows: tapered strokes; b > 0 raises the inner ends (worried), b < 0 lowers them (angry)
    [-1, 1].forEach(function (side) {
      var c = side < 0 ? L.eyeA : L.eyeB, o = side, by = c[1] - eh * 1.9 - up * eh * 0.8;
      var xi = c[0] - o * ew * 1.05, xo = c[0] + o * ew * 1.15;
      var yi = by - b * eh * 0.9 + (b < 0 ? -b * eh * 0.2 : 0), yo = by + b * eh * 0.35, ym = by - eh * (0.45 - b * 0.15);
      var bw = st.browW * s;
      ctx.fillStyle = st.brow;
      ctx.beginPath();
      ctx.moveTo(xi, yi - bw * 0.55);
      ctx.quadraticCurveTo(c[0] + o * ew * 0.2, ym - bw * 0.9, xo, yo);
      ctx.quadraticCurveTo(c[0] + o * ew * 0.2, ym + bw * 0.25, xi, yi + bw * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = Math.max(1, 0.0006 * s); ctx.strokeStyle = INK; ctx.stroke();
    });

    // ---- nose hint
    var nx = L.nose[0], ny = L.nose[1];
    ctx.strokeStyle = shade(st.skin, 0.55); ctx.lineWidth = Math.max(1.5, 0.0015 * s);
    ctx.beginPath();
    if (st.nose === 'soft') { ctx.moveTo(nx - 0.004 * s, ny + 0.001 * s); ctx.quadraticCurveTo(nx, ny + 0.0045 * s, nx + 0.0045 * s, ny); }
    else { ctx.moveTo(nx + 0.002 * s, ny - 0.016 * s); ctx.quadraticCurveTo(nx + 0.0065 * s, ny - 0.002 * s, nx + 0.0025 * s, ny + 0.002 * s); ctx.lineTo(nx - 0.003 * s, ny + 0.0025 * s); }
    ctx.stroke();

    // ---- cheeks: blush, wrinkles
    if (f.blush) {
      ctx.fillStyle = BLUSH;
      [L.eyeA, L.eyeB].forEach(function (c, i) {
        var cx = c[0] + (i ? 1 : -1) * ew * 0.35, cy = c[1] + eh * 2.6;
        ctx.beginPath(); ctx.ellipse(cx, cy, ew * 0.85, eh * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(160,20,90,0.7)'; ctx.lineWidth = Math.max(1, 0.0009 * s);
        for (var q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(cx + q * ew * 0.4 - ew * 0.12, cy + eh * 0.35); ctx.lineTo(cx + q * ew * 0.4 + ew * 0.12, cy - eh * 0.35); ctx.stroke(); }
      });
    }
    var mx = L.mouth[0], my = L.mouth[1], mw = 0.021 * s;
    if (st.wrinkles) {
      ctx.strokeStyle = shade(st.skin, 0.6); ctx.lineWidth = Math.max(1, 0.0009 * s);
      [-1, 1].forEach(function (o) { ctx.beginPath(); ctx.moveTo(mx + o * mw * 0.75, my - 0.012 * s); ctx.quadraticCurveTo(mx + o * mw * 1.25, my - 0.002 * s, mx + o * mw * 1.15, my + 0.006 * s); ctx.stroke(); });
    }

    // ---- mouth
    var m = f.mouth || 'flat';
    if (open) m = { smile: 'openSmile', grin: 'openSmile', smirk: 'openSmile', frown: 'openSad', sad: 'openSad', o: 'bigO', wail: 'wail' }[m] || 'open';
    var lips = st.lips;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, 0.0021 * s);
    function lipShape(curve) {   // drawn lips (exec): an upper and a lower lip around a curved line
      ctx.fillStyle = lips;
      ctx.beginPath();
      ctx.moveTo(mx - mw, my - curve);
      ctx.quadraticCurveTo(mx - mw * 0.45, my - 0.0042 * s - curve * 0.3, mx, my - 0.0028 * s);
      ctx.quadraticCurveTo(mx + mw * 0.45, my - 0.0042 * s - curve * 0.3, mx + mw, my - curve);
      ctx.quadraticCurveTo(mx, my + 0.0072 * s + curve * 0.6, mx - mw, my - curve);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = Math.max(1, 0.0008 * s); ctx.stroke();
      ctx.lineWidth = Math.max(1.6, 0.0016 * s);
      ctx.beginPath(); ctx.moveTo(mx - mw * 0.98, my - curve); ctx.quadraticCurveTo(mx, my + curve * 0.9, mx + mw * 0.98, my - curve); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(mx + mw * 0.3, my + 0.0032 * s, mw * 0.18, 0.0009 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
    function openShape(top, bottom, w, teeth, tongue) {
      function path() {
        ctx.beginPath();
        ctx.moveTo(mx - w, my + top[0]);
        ctx.quadraticCurveTo(mx, my + top[1] * 2 - top[0], mx + w, my + top[0]);
        ctx.quadraticCurveTo(mx, my + bottom * 2, mx - w, my + top[0]);
        ctx.closePath();
      }
      path(); ctx.fillStyle = MOUTH_IN; ctx.fill();
      ctx.save(); path(); ctx.clip();
      if (teeth) { ctx.fillStyle = TEETH; ctx.fillRect(mx - w, my + top[1] - teeth * 0.2, w * 2, teeth); }
      if (tongue) { ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.ellipse(mx, my + bottom * 0.95, w * 0.62, Math.abs(bottom) * 0.45, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      path();
      ctx.strokeStyle = st.lipFill ? lips : INK; ctx.lineWidth = Math.max(2, (st.lipFill ? 0.0028 : 0.002) * s); ctx.stroke();
      if (st.lipFill) { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 0.0008 * s); ctx.stroke(); }
    }
    ctx.strokeStyle = INK;
    switch (m) {
      case 'smile': case 'grin':
        if (st.lipFill) lipShape(0.0045 * s);
        else { ctx.beginPath(); ctx.moveTo(mx - mw, my - 0.004 * s); ctx.quadraticCurveTo(mx, my + 0.0075 * s, mx + mw, my - 0.004 * s); ctx.stroke(); }
        [-1, 1].forEach(function (o) { ctx.lineWidth = Math.max(1.2, 0.0012 * s); ctx.beginPath(); ctx.moveTo(mx + o * mw * 1.02, my - 0.0062 * s); ctx.lineTo(mx + o * mw * 1.12, my - 0.0025 * s); ctx.stroke(); });
        break;
      case 'smirk':
        if (st.lipFill) { ctx.save(); ctx.translate(mx, my); ctx.rotate(-0.12 * (L.left || 1)); ctx.translate(-mx, -my); lipShape(0.0022 * s); ctx.restore(); }
        else { ctx.beginPath(); ctx.moveTo(mx - mw, my + 0.001 * s); ctx.quadraticCurveTo(mx + mw * 0.2, my + 0.004 * s, mx + mw, my - 0.006 * s); ctx.stroke(); }
        ctx.lineWidth = Math.max(1.2, 0.0012 * s); ctx.beginPath(); ctx.moveTo(mx + mw * 1.0, my - 0.0085 * s); ctx.lineTo(mx + mw * 1.1, my - 0.0035 * s); ctx.stroke();
        break;
      case 'frown': case 'sad':
        if (st.lipFill) lipShape(-0.004 * s);
        else { ctx.beginPath(); ctx.moveTo(mx - mw * 0.9, my + 0.005 * s); ctx.quadraticCurveTo(mx, my - 0.006 * s, mx + mw * 0.9, my + 0.005 * s); ctx.stroke(); }
        break;
      case 'o': case 'bigO': {
        var ow = mw * (m === 'o' ? 0.36 : 0.48), oh = (m === 'o' ? 0.0085 : 0.0115) * s;
        ctx.beginPath(); ctx.ellipse(mx, my + oh * 0.2, ow, oh, 0, 0, Math.PI * 2);
        ctx.fillStyle = MOUTH_IN; ctx.fill();
        ctx.strokeStyle = st.lipFill ? lips : INK; ctx.lineWidth = Math.max(2, (st.lipFill ? 0.003 : 0.002) * s); ctx.stroke();
        if (st.lipFill) { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 0.0008 * s); ctx.stroke(); }
        break;
      }
      case 'open': case 'talk':
        if (m === 'talk' && !open) { if (st.lipFill) lipShape(0.0005 * s); else { ctx.beginPath(); ctx.moveTo(mx - mw * 0.85, my); ctx.lineTo(mx + mw * 0.85, my); ctx.stroke(); } break; }
        openShape([-0.001 * s, -0.004 * s], 0.0115 * s, mw * 0.78, 0.0032 * s, 1); break;
      case 'openSmile': openShape([-0.0035 * s, -0.0028 * s], 0.0125 * s, mw * 1.0, 0.004 * s, 1); break;
      case 'openSad': openShape([0.003 * s, -0.007 * s], 0.006 * s, mw * 0.8, 0, 1); break;
      case 'wail': openShape([-0.0005 * s, -0.009 * s], 0.019 * s, mw * 1.05, 0.0035 * s, 1); break;
      default:
        if (st.lipFill) lipShape(0.001 * s);
        else { ctx.beginPath(); ctx.moveTo(mx - mw * 0.85, my); ctx.quadraticCurveTo(mx, my + 0.0016 * s, mx + mw * 0.85, my); ctx.stroke(); }
    }

    // ---- tears (over everything): a stream from each lower lid, and a drop
    if (f.tears) {
      [L.eyeA, L.eyeB].forEach(function (c, i) {
        var o = i ? 1 : -1, x0 = c[0] + o * ew * 0.25, y0 = c[1] + eh * 0.6, len = (m === 'wail' ? 0.05 : 0.036) * s, w = (m === 'wail' ? 0.0045 : 0.0032) * s;
        ctx.fillStyle = TEAR; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 0.0008 * s);
        ctx.beginPath(); ctx.moveTo(x0 - w, y0); ctx.quadraticCurveTo(x0 + o * w * 0.6, y0 + len * 0.5, x0 - w * 0.4, y0 + len);
        ctx.lineTo(x0 + w * 1.3, y0 + len); ctx.quadraticCurveTo(x0 + o * w * 1.4 + w, y0 + len * 0.5, x0 + w, y0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x0 + w * 0.45, y0 + len + w * 1.6, w * 1.1, w * 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(x0, y0 + len * 0.35, w * 0.3, w * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  /** the decal: a grid over the face, dropped onto the skin triangles along -z, in the bind frame */
  function decalGeometry(THREE, LM, surface, o) {
    var x0 = -0.066, x1 = 0.066, y0 = LM.chin.y - 0.016, y1 = LM.face.y + 0.042, NX = 10, NY = 12, lift = o.lift || 0.0025;
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(surface, 3));
    var target = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    target.updateMatrixWorld(true);
    var ray = new THREE.Raycaster(), dir = new THREE.Vector3(0, 0, -1), from = new THREE.Vector3();
    var pos = [], uv = [], ok = [], idx = [], nor = [];
    // the skin's own smooth normals under each grid point (JG.dress keeps them), so the decal takes the scene light
    // exactly like the skin round it: no flat, unlit patches (round 2c)
    var SN = JG.dress && JG.dress.surfaceNormals ? JG.dress.surfaceNormals(surface) : null;
    var tri = new THREE.Triangle(), bc = new THREE.Vector3(), na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
    for (var j = 0; j <= NY; j++) for (var i = 0; i <= NX; i++) {
      var u = i / NX, v = j / NY, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * v;
      from.set(x, y, LM.face.z + 0.3);
      ray.set(from, dir);
      var hit = surface.length ? ray.intersectObject(target, false)[0] : null;
      if (hit) {
        var n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1);
        if (n.z < 0) n.negate();
        pos.push(hit.point.x + n.x * lift, hit.point.y + n.y * lift, hit.point.z + n.z * lift);
        var sn = n;
        if (SN && hit.face) {
          var f = hit.face;
          tri.a.fromArray(surface, f.a * 3); tri.b.fromArray(surface, f.b * 3); tri.c.fromArray(surface, f.c * 3);
          tri.getBarycoord(hit.point, bc);
          na.fromArray(SN, f.a * 3); nb.fromArray(SN, f.b * 3); nc.fromArray(SN, f.c * 3);
          sn = na.multiplyScalar(bc.x).addScaledVector(nb, bc.y).addScaledVector(nc, bc.z);
          if (sn.lengthSq() < 1e-8) sn = n; else sn.normalize();
        }
        nor.push(sn.x, sn.y, sn.z);
        ok.push(hit.point.z > LM.head.z + 0.01);
      } else { pos.push(x, y, LM.face.z - 0.02); ok.push(false); nor.push(0, 0, 1); }
      uv.push(u, v);
    }
    // the grid's flat cells cut through convex features (lips, nose) between samples: raise each cell's corners
    // until every skin vertex under the cell is behind the decal by `lift`
    for (var pass = 0; pass < 2; pass++) {
      for (var t = 0; t < surface.length; t += 3) {
        var sx = surface[t], sy = surface[t + 1], sz = surface[t + 2];
        var fu = (sx - x0) / (x1 - x0) * NX, fv = (sy - y0) / (y1 - y0) * NY;
        if (fu < 0 || fv < 0 || fu >= NX || fv >= NY) continue;
        var ci = Math.floor(fu), cj = Math.floor(fv), du = fu - ci, dv = fv - cj;
        var k00 = cj * (NX + 1) + ci, k10 = k00 + 1, k01 = k00 + NX + 1, k11 = k01 + 1;
        if (!(ok[k00] && ok[k10] && ok[k01] && ok[k11])) continue;
        var zi = pos[k00 * 3 + 2] * (1 - du) * (1 - dv) + pos[k10 * 3 + 2] * du * (1 - dv) + pos[k01 * 3 + 2] * (1 - du) * dv + pos[k11 * 3 + 2] * du * dv;
        var need = sz + lift * 0.8 - zi;
        if (need > 0) [k00, k10, k01, k11].forEach(function (k) { pos[k * 3 + 2] += need; });
      }
    }
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
      var a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      if (ok[a] && ok[b] && ok[d]) idx.push(a, b, d);
      if (ok[a] && ok[d] && ok[c]) idx.push(a, d, c);
    }
    sg.dispose();
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return { geometry: g, rect: [x0, y0, x1, y1] };
  }

  function create(kit, o) {
    var THREE = kit.THREE, rig = o.rig, frames = o.frames || {}, neutral = o.neutral || Object.keys(frames)[0] || 'neutral';
    var st = Object.assign({}, DEF_STYLE, o.style || {});
    var LM = o.landmarks || (JG.dress && JG.dress.landmarks ? JG.dress.landmarks(kit, rig) : null);
    if (!LM) throw new Error('JG.face.create: no head landmarks');
    var made = decalGeometry(THREE, LM, o.surface || new Float32Array(0), o), rect = made.rect;
    var Wm = rect[2] - rect[0], Hm = rect[3] - rect[1];
    var W = o.res || 256, H = Math.round(W * Hm / Wm), s = W / Wm;
    // canvas x grows with bind x (u), canvas y grows downward (v = 1 at the top)
    function cx(x) { return (x - rect[0]) * s; }
    function cy(y) { return (rect[3] - y) * s; }
    var left = LM.left || 1;
    var eyeA = LM.eyeL.x < LM.eyeR.x ? LM.eyeL : LM.eyeR, eyeB = eyeA === LM.eyeL ? LM.eyeR : LM.eyeL;
    var lay = { s: s, W: W, H: H, eyeA: [cx(eyeA.x), cy(eyeA.y)], eyeB: [cx(eyeB.x), cy(eyeB.y)], nose: [cx(0), cy(LM.nose.y)],
      mouth: [cx(0), cy(LM.mouth.y)], left: left };
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    // lit with the skin's toon ramp (it used to be MeshBasicMaterial: the features stayed bright in shadow)
    var mat = kit.mat.toon({ map: tex });
    Object.assign(mat, { transparent: true, alphaTest: 0.03, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // stage 1d: the eye whites keep a lighting floor. Lit like the skin they went peach in dim, warm light; now the
    // canvas's pure-white texels (the whites, the catchlights and the teeth: nothing else on the decal is white) are
    // lifted to at least WHITE_FLOOR (linear) while the rest of the face keeps the toon shading
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.jgWhiteFloor = { value: WHITE_FLOOR };
      sh.fragmentShader = 'uniform float jgWhiteFloor;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
        '#ifdef USE_MAP\n\tfloat jgWhite = smoothstep( 0.88, 0.98, min( sampledDiffuseColor.r, min( sampledDiffuseColor.g, sampledDiffuseColor.b ) ) );\n' +
        '\toutgoingLight = mix( outgoingLight, max( outgoingLight, vec3( jgWhiteFloor ) ), jgWhite );\n#endif\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = function () { return 'jg-face-white-floor'; };
    var head = rig.byName.Head, rest = rig.rest.Head, inv = rest.Wb.clone().invert();
    var g = made.geometry, P = g.attributes.position, NA = g.attributes.normal, v = new THREE.Vector3();
    for (var i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).sub(rest.world).applyQuaternion(inv); P.setXYZ(i, v.x, v.y, v.z);
      v.fromBufferAttribute(NA, i).applyQuaternion(inv).normalize(); NA.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeBoundingSphere();
    var mesh = new THREE.Mesh(g, mat);
    mesh.name = 'face-decal'; mesh.renderOrder = 2;
    head.add(mesh);

    var cur = null, open = false, blinking = false, clock = 0, nextBlink = 1.2 + 2.5 * hash01(o.base || 'actor', 0), blinkN = 0, blinkEnd = 0;
    function redraw() { draw(ctx, lay, frames[cur] || frames[neutral] || {}, st, open, blinking); tex.needsUpdate = true; }
    var api = {
      root: mesh, neutral: neutral, style: st,
      set: function (name) {
        name = name || neutral;
        if (!frames[name]) { JG.track.stub('expression', (o.base || 'actor') + '.' + name, 'neutral'); name = neutral; }
        if (name === cur) return;
        cur = name; redraw();
      },
      mouth: function (level) {
        var on = level > 0.3;
        if (on === open) return;
        open = on; redraw();
      },
      /** the game clock's dt: blinks every 2-5.5 s for 0.13 s */
      tick: function (dt) {
        if (!(dt > 0)) return;
        clock += dt;
        if (!blinking && clock >= nextBlink) { blinking = true; blinkEnd = clock + 0.13; redraw(); }
        else if (blinking && clock >= blinkEnd) {
          blinking = false; blinkN++;
          nextBlink = clock + 2 + 3.5 * hash01(o.base || 'actor', blinkN);
          redraw();
        }
      },
      resetBlink: function () { clock = 0; blinkN = 0; nextBlink = 1.2 + 2.5 * hash01(o.base || 'actor', 0); if (blinking) { blinking = false; redraw(); } },
      current: function () { return cur; }
    };
    api.set(neutral);
    return api;
  }

  JG.face = { create: create, draw: draw };
})();
