/* Roo on the shared skeleton (Stage 0 step 6). Ported from spike/fable-v2/roo.js, the version all five blind judges
 * preferred after the fix pass. What changed from the spike, and nothing else:
 *   - the skeleton is the shared 65-joint UE/UAL one (JG.rig.create from a body GLB) with Roo's joint positions in
 *     his arms-down bind layout, plus extra bones: tail_01..tail_10, ear_01/02_l/r, jaw, cape_root;
 *   - the mesh is the spike's, built in the same bind space, with its skin indices renamed onto that skeleton;
 *   - the posing helpers (aim, rot, hand, fingers, leg, fromBind, ...) are thin name-mapping wrappers over the rig's
 *     ported helper set P, so the spike's poses and cape drape run unchanged on the new rig;
 *   - library clips play on rig.root (rest = the mannequin's local rotations).
 * Exposed as JG.roo.build(THREE, kit) -> { root, rig, P, anchors, pose(name), setJawOpening(0..1), body, ink, cape }.
 *
 * Original spike notes:
 *
 * Technique (see spike brief):
 *   - ONE SkinnedMesh for the body (rigid parts, with blended weights inside the speaking mouth),
 *     MeshToonMaterial with one canvas atlas (face, muscle ink, emblem) x vertex colour.
 *   - ONE ink hull SkinnedMesh on the same skeleton (kit.hull, back faces).
 *   - Cape: its own closed thin shell + its own hull, rebuilt per pose at build time
 *     from a strand drape with capsule collision (stand-in for the game's cloth sim).
 *   4 draw calls in total.
 *   The collar is one tube along collarAt() (part of the body mesh, chest bone); the cape's top row sits inside it.
 *   Shading is the kit's three-band ramp only: the suit texture carries flat colour and crisp ink lines, and the
 *   band edges are kept clean by authored shading normals (see "Cel shading normals" after the merge).
 *
 * Body parts are lofted tubes (super-ellipse rings, Catmull-Rom between key rings,
 * rounded caps). Big-bend joints (shoulder, elbow, knee, hip, ankle, fingers) are
 * overlapping ball ends; small-bend chains (spine, tail) are one continuous loft whose
 * rings are assigned to consecutive bones.
 */
(function () {
  'use strict';

  function build(THREE, kit, opts) {
    var V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4;
    var PI = Math.PI, TAU = PI * 2;
    function v3(x, y, z) { return new V3(x, y, z); }
    function arr3(a) { return new V3(a[0], a[1], a[2]); }
    function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
    function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
    function spow(c, e) { return c < 0 ? -Math.pow(-c, e) : Math.pow(c, e); }
    function deg(d) { return d * PI / 180; }
    function catmull(p0, p1, p2, p3, t) {
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    }

    var COL = {
      fur: '#EBA046', furD: '#B8722C', furL: '#F4CF96', earIn: '#F3BF86', nose: '#2A1A16', brow: '#4A2A12',
      blue: '#1F4FD8', navy: '#07124A', blueD: '#0E2A8C', blueL: '#4A78F2',
      yellow: '#FFD21F', magenta: '#E0218A', magD: '#C91C7C', ink: '#111111', white: '#FFF8E7'
    };

    /* ------------------------------------------------------------------ */
    /* skeleton (bind pose: everything hangs straight down, identity quats) */
    /* ------------------------------------------------------------------ */
    // The spike's skeleton survives only as a table of bind positions (spike names) for the mesh code below.
    var bones = [], B = {};
    function bone(name, parent, x, y, z) {
      var b = { name: name, parent: parent, userData: { bind: v3(x, y, z), index: bones.length } };
      bones.push(b); B[name] = b;
      return b;
    }
    var SIDES = [['L', 1], ['R', -1]];
    var FZ = [0.044, 0.015, -0.015, -0.044];        // finger offsets along the knuckle row
    var FL = [0.95, 1.05, 1.0, 0.85];               // finger length scale
    var ARM_X = 0.282, ARM_Z = -0.01, SH_Y = 1.41, EL_Y = 1.12, WR_Y = 0.86, KN_Y = 0.772, FING1 = 0.05, TH1 = 0.05;
    var HIP_X = 0.108, HIP_Y = 0.89, KNEE_Y = 0.48, ANK_Y = 0.085;
    var THUMB_DIR = v3(-0.25, -0.75, 0.6).normalize();   // left hand, bind
    var TAIL_N = 10, TAIL_SEG = 0.125, TAIL_Y = 0.875, TAIL_Z = -0.10, TAIL_LEN = TAIL_N * TAIL_SEG;

    bone('hips', null, 0, 0.93, 0);
    bone('waist', 'hips', 0, 1.03, 0);
    bone('waist2', 'waist', 0, 1.09, 0);   // port: the shared skeleton's spine_02 carries the rings between 1.09 and 1.15
    bone('chest', 'waist', 0, 1.15, 0);
    bone('neck', 'chest', 0, 1.49, -0.01);
    bone('head', 'neck', 0, 1.645, 0.02);
    bone('jaw', 'head', 0, 1.683, 0.0845);
    SIDES.forEach(function (s) {
      var n = s[0], k = s[1], i;
      bone('arm' + n, 'chest', ARM_X * k, SH_Y, ARM_Z);
      bone('fore' + n, 'arm' + n, ARM_X * k, EL_Y, ARM_Z);
      bone('hand' + n, 'fore' + n, ARM_X * k, WR_Y, ARM_Z);
      for (i = 0; i < 4; i++) {
        bone('f' + i + 'a' + n, 'hand' + n, ARM_X * k, KN_Y, ARM_Z + FZ[i]);
        bone('f' + i + 'b' + n, 'f' + i + 'a' + n, ARM_X * k, KN_Y - FING1 * FL[i], ARM_Z + FZ[i]);
      }
      var tb = v3((ARM_X - 0.008) * k, 0.832, 0.046);
      bone('thA' + n, 'hand' + n, tb.x, tb.y, tb.z);
      bone('thB' + n, 'thA' + n, tb.x + THUMB_DIR.x * TH1 * k, tb.y + THUMB_DIR.y * TH1, tb.z + THUMB_DIR.z * TH1);
      bone('thigh' + n, 'hips', HIP_X * k, HIP_Y, 0);
      bone('shin' + n, 'thigh' + n, HIP_X * k, KNEE_Y, 0);
      bone('foot' + n, 'shin' + n, HIP_X * k, ANK_Y, 0);
      bone('ball' + n, 'foot' + n, HIP_X * k, 0.04, 0.17);   // port: the front of the boot bends at the shared skeleton's ball joint
    });
    (function () {
      for (var i = 1; i <= TAIL_N; i++) bone('tail' + i, i === 1 ? 'hips' : 'tail' + (i - 1), 0, TAIL_Y - TAIL_SEG * (i - 1), TAIL_Z);
    })();

    /* ------------------------------------------------------------------ */
    /* texture atlas                                                       */
    /* ------------------------------------------------------------------ */
    var AW = 2048, AH = 2048, RECT = {};
    function rect(name, x, y, w, h) { RECT[name] = { x: x, y: y, w: w, h: h }; }
    rect('torsoF', 16, 16, 760, 1150);
    rect('torsoB', 808, 16, 380, 575);
    rect('headL', 808, 623, 600, 300);
    rect('headR', 808, 955, 600, 300);
    rect('ear', 1220, 16, 130, 290);
    rect('arm', 1382, 16, 300, 360);
    rect('thigh', 1714, 16, 300, 420);
    rect('collar', 572, 1300, 640, 128);
    rect('white', 1880, 1880, 120, 120);
    function uvOf(name, s, t) {
      var r = RECT[name];
      return [(r.x + clamp(s, 0, 1) * r.w) / AW, 1 - (r.y + clamp(t, 0, 1) * r.h) / AH];
    }
    var WHITE_UV = uvOf('white', 0.5, 0.5);

    function path(ctx, pts, close) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
      for (var i = 1; i < pts.length - 1; i++) {
        var last = i === pts.length - 2;
        var mx = last ? pts[i + 1][0] : (pts[i][0] + pts[i + 1][0]) / 2;
        var my = last ? pts[i + 1][1] : (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      if (close) ctx.closePath();
    }
    function stroke(ctx, pts, w, col) {
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      path(ctx, pts, false); ctx.stroke();
    }
    function poly(ctx, pts, col) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fill();
    }
    function blob(ctx, x, y, rx, ry, col, rot) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
    }

    /* Cape collar: ONE thick, soft roll (chest bind space). It stands behind the neck, lies on TOP of each
     * shoulder (out on the trapezius, against the deltoid, clear of the neck), comes forward over the front of
     * the shoulder and turns in along the collarbone, thinning all the way to a point. The neck and the upper
     * chest stay open.
     * Keys for the +x half, from behind the neck to the front end:
     * centre xyz, outward normal xyz, thickness (along the normal), half-width (across the roll). */
    var COLLAR_HALF = [
      [0.000, 1.548, -0.125, 0.00, 0.52, -0.85, 0.045, 0.060],     // behind the neck
      [0.105, 1.532, -0.097, 0.40, 0.66, -0.64, 0.046, 0.060],
      [0.160, 1.512, -0.066, 0.30, 0.90, -0.32, 0.047, 0.066],     // on the trapezius
      [0.198, 1.501, -0.026, 0.22, 0.97, -0.06, 0.048, 0.070],     // top of the shoulder, in the hollow against the deltoid
      [0.214, 1.490, 0.028, 0.27, 0.84, 0.47, 0.044, 0.058],       // over the front of the shoulder
      [0.194, 1.462, 0.079, 0.32, 0.74, 0.59, 0.036, 0.044],       // from here on it lies on the chest, along its normal,
      [0.158, 1.448, 0.114, 0.28, 0.70, 0.66, 0.028, 0.035],       // sunk half way in so no gap opens under its edges
      [0.126, 1.436, 0.130, 0.19, 0.65, 0.74, 0.018, 0.024]        // the point, on the collarbone
    ];   // keys are spaced evenly (about 6 cm) so the roll never folds over itself where it turns
    var COLLAR_K = (function () {
      var k = [], i;
      for (i = COLLAR_HALF.length - 1; i > 0; i--) { var q = COLLAR_HALF[i].slice(); q[0] = -q[0]; q[3] = -q[3]; k.push(q); }
      return k.concat(COLLAR_HALF);
    })();
    // t = -1 (right collarbone end) .. 0 (behind the neck) .. 1 (left collarbone end)
    function collarAt(t) {
      var n = COLLAR_K.length - 1, f = clamp((t + 1) / 2, 0, 1) * n, i = Math.min(Math.floor(f), n - 1), o = [], c;
      function K(q) { return COLLAR_K[clamp(q, 0, n)]; }
      for (c = 0; c < 8; c++) o.push(catmull(K(i - 1)[c], K(i)[c], K(i + 1)[c], K(i + 2)[c], f - i));
      return { c: v3(o[0], o[1], o[2]), n: v3(o[3], o[4], o[5]).normalize(), rn: o[6], rb: o[7] };
    }

    var SMIRK_LEFT = 0.009, SMIRK_RIGHT = 0.004;
    function mouthStroke(smirk) {
      return [[0.32, 1.690], [0.25, 1.690], [0.20, 1.688], [0.16, 1.686],
        [0.13, 1.688], [0.112, 1.697 + smirk], [0.103, 1.708 + smirk * 1.4]];
    }

    function drawHead(ctx, w, h, smirk) {
      var sx = w / 0.37, sy = h / 0.18;
      function Z(z) { return (z + 0.08) * sx; }
      function Y(y) { return (1.82 - y) * sy; }
      function P(a) { return a.map(function (p) { return [Z(p[0]), Y(p[1])]; }); }
      // lighter muzzle, chin and throat
      ctx.filter = 'blur(7px)';
      poly(ctx, P([[0.31, 1.722], [0.25, 1.717], [0.19, 1.709], [0.14, 1.701], [0.105, 1.69], [0.075, 1.672],
                   [0.03, 1.660], [-0.09, 1.652], [-0.09, 1.60], [0.31, 1.60]]), COL.furL);
      // darker fur along the top of the skull and the nose bridge
      ctx.globalAlpha = 0.45;
      poly(ctx, P([[-0.09, 1.83], [0.31, 1.83], [0.31, 1.752], [0.2, 1.748], [0.13, 1.757], [0.1, 1.772], [0.06, 1.797], [0.0, 1.803], [-0.09, 1.79]]), COL.furD);
      // eye socket shadow
      ctx.globalAlpha = 0.55;
      blob(ctx, Z(0.088), Y(1.756), 0.034 * sx, 0.017 * sy, COL.furD, -0.3);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      // mouth: long line with the corner pulled up into a smirk
      var m = smirk;
      stroke(ctx, P(mouthStroke(m)), 0.005 * sx, COL.ink);
      stroke(ctx, P([[0.098, 1.699 + m], [0.092, 1.712 + m * 1.3], [0.096, 1.724 + m * 1.3]]), 0.0026 * sx, COL.brow);
      // under-lip shadow and chin line
      stroke(ctx, P([[0.27, 1.676], [0.23, 1.673], [0.2, 1.675]]), 0.002 * sx, COL.furD);
      // eye: almond under a straight slanted lid (half-lidded)
      var inner = [0.114, 1.746], outer = [0.062, 1.765];
      ctx.save();
      path(ctx, P([inner, [0.088, 1.757], outer, [0.066, 1.738], [0.098, 1.733], inner]), true);
      ctx.fillStyle = COL.white; ctx.fill(); ctx.clip();
      blob(ctx, Z(0.0905), Y(1.750), 0.0102 * sx, 0.0102 * sy, '#4A2408');
      blob(ctx, Z(0.0915), Y(1.750), 0.0056 * sx, 0.0056 * sy, COL.ink);
      blob(ctx, Z(0.095), Y(1.7525), 0.002 * sx, 0.002 * sy, '#FFFFFF');
      ctx.restore();
      stroke(ctx, P([inner, [0.098, 1.7345], [0.07, 1.739], outer]), 0.002 * sx, COL.ink);          // lower lid
      stroke(ctx, P([[0.117, 1.744], [0.088, 1.7565], [0.058, 1.768]]), 0.006 * sx, COL.ink);        // upper lid
      // heavy brow
      stroke(ctx, P([[0.122, 1.755], [0.094, 1.769], [0.056, 1.779]]), 0.0075 * sx, COL.brow);
      stroke(ctx, P([[0.07, 1.777], [0.05, 1.782], [0.036, 1.781]]), 0.004 * sx, COL.brow);
      // cheek / jaw line
      stroke(ctx, P([[0.066, 1.70], [0.05, 1.684], [0.02, 1.674]]), 0.0022 * sx, COL.furD);
    }

    var atlas = kit.tex.canvas(AW, AH, function (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, AW, AH);
      function paint(name, base, fn) {
        var r = RECT[name], pad = 14;
        ctx.save();
        ctx.fillStyle = base;
        ctx.fillRect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad);
        ctx.beginPath(); ctx.rect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad); ctx.clip();
        ctx.translate(r.x, r.y);
        if (fn) fn(ctx, r.w, r.h);
        ctx.restore();
        ctx.filter = 'none'; ctx.globalAlpha = 1;
      }

      /* torso, front projection: x -0.27..0.27, y 1.56..0.74 */
      paint('torsoF', COL.blue, function (ctx, w, h) {
        var sx = w / 0.54, sy = h / 0.82;
        function X(x) { return (x + 0.27) * sx; }
        function Y(y) { return (1.56 - y) * sy; }
        function P(a) { return a.map(function (p) { return [X(p[0]), Y(p[1])]; }); }
        function L(a, wd, col) { stroke(ctx, P(a), wd * sx, col || COL.navy); }
        // flat suit colour: crisp ink muscle lines only, the toon ramp does the shading
        [1, -1].forEach(function (s) {
          L([[s * 0.016, 1.243], [s * 0.085, 1.22], [s * 0.155, 1.238], [s * 0.196, 1.288]], 0.013);   // pec underline
          L([[s * 0.196, 1.288], [s * 0.206, 1.33], [s * 0.2, 1.37]], 0.007);                          // pec / deltoid
          L([[s * 0.083, 1.214], [s * 0.092, 1.1], [s * 0.066, 0.985]], 0.0085);                         // outer edge of abs
          L([[s * 0.008, 1.172], [s * 0.045, 1.165], [s * 0.084, 1.174]], 0.0075);                       // ab rows
          L([[s * 0.008, 1.108], [s * 0.045, 1.1], [s * 0.088, 1.108]], 0.0075);
          L([[s * 0.008, 1.043], [s * 0.042, 1.034], [s * 0.08, 1.04]], 0.0075);
          L([[s * 0.112, 1.205], [s * 0.142, 1.186]], 0.0065);                                           // serratus ticks
          L([[s * 0.112, 1.165], [s * 0.138, 1.146]], 0.0065);
          L([[s * 0.11, 1.125], [s * 0.132, 1.106]], 0.0065);
          L([[s * 0.145, 1.03], [s * 0.1, 0.955], [s * 0.05, 0.885], [s * 0.012, 0.84]], 0.0095);          // hip crease
        });
        L([[0, 1.236], [0, 0.985]], 0.009);                                                             // linea alba
        L([[0, 0.985], [0, 0.93]], 0.006);
        // chest emblem: dark ring, yellow disc, black J
        var ex = X(0), ey = Y(1.312), R = 0.08 * sx;
        blob(ctx, ex, ey, R, R * sy / sx, COL.ink);
        blob(ctx, ex, ey, R * 0.86, R * 0.86 * sy / sx, COL.yellow);
        ctx.save();
        ctx.translate(ex, ey); ctx.scale(R, R * sy / sx); ctx.transform(1, 0, -0.1, 1, 0, 0);
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.25; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        ctx.beginPath(); ctx.moveTo(-0.2, -0.47); ctx.lineTo(0.31, -0.47); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0.185, -0.59); ctx.lineTo(0.185, 0.2);
        ctx.arc(-0.065, 0.2, 0.25, 0, PI * 0.93, false); ctx.stroke();
        ctx.restore();
        // fur above the neckline: a shallow scoop under the throat, well clear of the emblem, in the same flat
        // fur tone as the neck (no second throat colour, so nothing steps or stripes where neck meets chest)
        var nl = [[0, 1.446], [0.035, 1.447], [0.07, 1.453], [0.098, 1.468], [0.118, 1.49], [0.13, 1.508], [0.29, 1.508]];
        var fp = [], i;
        for (i = nl.length - 1; i > 0; i--) fp.push([-nl[i][0], nl[i][1]]);
        for (i = 0; i < nl.length; i++) fp.push(nl[i]);
        fp.push([0.29, 1.62]); fp.push([-0.29, 1.62]);
        path(ctx, P(fp), true); ctx.fillStyle = COL.fur; ctx.fill();
        stroke(ctx, P(nl.slice(0, 6).map(function (q) { return [-q[0], q[1]]; }).reverse().concat(nl.slice(1, 6))), 0.006 * sx, COL.navy);
      });

      /* torso, back projection (mirrored in x so it reads correctly from behind) */
      paint('torsoB', COL.blue, function (ctx, w, h) {
        var sx = w / 0.54, sy = h / 0.82;
        function X(x) { return (0.27 - x) * sx; }
        function Y(y) { return (1.56 - y) * sy; }
        function P(a) { return a.map(function (p) { return [X(p[0]), Y(p[1])]; }); }
        function L(a, wd, col) { stroke(ctx, P(a), wd * sx, col || COL.navy); }
        L([[0, 1.4], [0, 0.96]], 0.009);
        [1, -1].forEach(function (s) {
          L([[s * 0.04, 1.38], [s * 0.11, 1.33], [s * 0.15, 1.25], [s * 0.1, 1.2]], 0.006);
          L([[s * 0.17, 1.22], [s * 0.12, 1.12], [s * 0.06, 1.04]], 0.006);
          L([[s * 0.03, 0.95], [s * 0.1, 0.91], [s * 0.14, 0.85]], 0.005);
        });
        // fur above a level line that the back of the collar covers
        poly(ctx, P([[-0.29, 1.505], [0.29, 1.505], [0.29, 1.62], [-0.29, 1.62]]), COL.fur);
      });

      paint('headL', COL.fur, function (ctx, w, h) { drawHead(ctx, w, h, SMIRK_LEFT); });
      paint('headR', COL.fur, function (ctx, w, h) { drawHead(ctx, w, h, SMIRK_RIGHT); });

      /* inner ear: local x -0.05..0.05, local y 0.275..-0.02 */
      paint('ear', COL.fur, function (ctx, w, h) {
        function X(x) { return (x + 0.058) / 0.116 * w; }
        function Y(y) { return (0.285 - y) / 0.305 * h; }
        function leaf(hw, y0, y1, col) {
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(X(0), Y(y0));
          ctx.bezierCurveTo(X(hw * 1.25), Y(y0 + (y1 - y0) * 0.25), X(hw * 1.05), Y(y0 + (y1 - y0) * 0.7), X(0), Y(y1));
          ctx.bezierCurveTo(X(-hw * 1.05), Y(y0 + (y1 - y0) * 0.7), X(-hw * 1.25), Y(y0 + (y1 - y0) * 0.25), X(0), Y(y0));
          ctx.fill();
        }
        leaf(0.043, -0.01, 0.262, COL.furD);
        leaf(0.036, 0.0, 0.25, COL.earIn);
        ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.6;
        leaf(0.016, 0.0, 0.18, '#C98450');
      });

      /* upper arm, cylindrical: s 0 inner, .25 back, .5 outer, .75 front; t 0 top */
      paint('arm', COL.blue, function (ctx, w, h) {
        function P(a) { return a.map(function (p) { return [p[0] * w, p[1] * h]; }); }
        stroke(ctx, P([[0.25, 0.30], [0.37, 0.41], [0.5, 0.5], [0.63, 0.42], [0.75, 0.3]]), 9, COL.navy);
        stroke(ctx, P([[0.5, 0.5], [0.52, 0.66], [0.5, 0.83]]), 6, COL.navy);
        stroke(ctx, P([[0.64, 0.8], [0.75, 0.86], [0.87, 0.8]]), 6.5, COL.navy);
        stroke(ctx, P([[0.9, 0.42], [0.93, 0.6], [0.9, 0.76]]), 5, COL.navy);
        stroke(ctx, P([[0.24, 0.46], [0.29, 0.62], [0.25, 0.8]]), 5, COL.navy);
      });

      /* thigh, cylindrical, same layout */
      paint('thigh', COL.blue, function (ctx, w, h) {
        function P(a) { return a.map(function (p) { return [p[0] * w, p[1] * h]; }); }
        stroke(ctx, P([[0.78, 0.26], [0.81, 0.5], [0.77, 0.76]]), 7, COL.navy);
        stroke(ctx, P([[0.5, 0.26], [0.57, 0.52], [0.63, 0.76]]), 7, COL.navy);
        stroke(ctx, P([[0.93, 0.4], [0.91, 0.62], [0.87, 0.8]]), 5, COL.navy);
        stroke(ctx, P([[0.63, 0.86], [0.75, 0.81], [0.87, 0.86]]), 6.5, COL.navy);
        stroke(ctx, P([[0.24, 0.3], [0.27, 0.55], [0.25, 0.78]]), 5, COL.navy);
      });

      /* collar roll: s along the roll, t around it (0 top, .25 neck side, .5 underneath, .75 outer side).
       * White (the vertex colour is the magenta) with a few crisp fold lines. */
      paint('collar', '#FFFFFF', function (ctx, w, h) {
        function P(a) { return a.map(function (p) { return [p[0] * w, p[1] * h]; }); }
        var fold = '#B0B0B0';
        stroke(ctx, P([[0.05, 0.93], [0.2, 0.87], [0.5, 0.85], [0.8, 0.87], [0.95, 0.93]]), 4, fold);
        stroke(ctx, P([[0.16, 0.13], [0.24, 0.09], [0.34, 0.1]]), 3, fold);
        stroke(ctx, P([[0.84, 0.13], [0.76, 0.09], [0.66, 0.1]]), 3, fold);
        stroke(ctx, P([[0.42, 0.16], [0.5, 0.13], [0.58, 0.16]]), 3, fold);
      });
    });

    /* ------------------------------------------------------------------ */
    /* geometry helpers                                                    */
    /* ------------------------------------------------------------------ */
    function signedVolume(pos, idx) {
      var vol = 0, a = new V3(), b = new V3(), c = new V3();
      for (var i = 0; i < idx.length; i += 3) {
        a.fromArray(pos, idx[i] * 3); b.fromArray(pos, idx[i + 1] * 3); c.fromArray(pos, idx[i + 2] * 3);
        vol += a.dot(b.cross(c));
      }
      return vol / 6;
    }
    function fixWinding(pos, idx) {
      if (signedVolume(pos, idx) < 0) for (var i = 0; i < idx.length; i += 3) { var t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    // area-weighted normals, averaged across vertices that share a position
    function smoothNormals(pos, idx) {
      var n = pos.length / 3, acc = new Map(), keys = new Array(n), i, k, e;
      for (i = 0; i < n; i++) {
        k = Math.round(pos[i * 3] * 2e4) + ',' + Math.round(pos[i * 3 + 1] * 2e4) + ',' + Math.round(pos[i * 3 + 2] * 2e4);
        keys[i] = k;
        if (!acc.has(k)) acc.set(k, [0, 0, 0]);
      }
      var a = new V3(), b = new V3(), c = new V3(), ab = new V3(), ac = new V3();
      for (i = 0; i < idx.length; i += 3) {
        a.fromArray(pos, idx[i] * 3); b.fromArray(pos, idx[i + 1] * 3); c.fromArray(pos, idx[i + 2] * 3);
        ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac);
        for (k = 0; k < 3; k++) { e = acc.get(keys[idx[i + k]]); e[0] += ab.x; e[1] += ab.y; e[2] += ab.z; }
      }
      var out = new Float32Array(n * 3);
      for (i = 0; i < n; i++) {
        e = acc.get(keys[i]);
        var l = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]) || 1;
        out[i * 3] = e[0] / l; out[i * 3 + 1] = e[1] / l; out[i * 3 + 2] = e[2] / l;
      }
      return out;
    }
    function makeGeo(pos, idx, uv, col) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(smoothNormals(pos, idx), 3));
      if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      return g;
    }
    var tmpColor = new THREE.Color();

    /* loft(o): tube along local Y.
     *   o.rings   key rings [y, rx, rf, rb, xc, zc, n, tilt, sub]; rf/rb are the +z / -z radii,
     *             n the super-ellipse exponent, sub the Catmull-Rom steps to the next key
     *   o.seg     radial segments (even). The ring is built as two halves starting at o.th0,
     *             with duplicated seam vertices so each half can take its own uv rect
     *   o.capA/B  rounded cap heights before the first / after the last ring
     *   o.matrix  local -> model
     *   o.uv(i)   -> [u, v] atlas uv;  o.col(i) -> css colour;  o.boneFn(i) -> bone name
     */
    function loft(o) {
      var keys = o.rings.map(function (k) { return [k[0], k[1], k[2], k[3], k[4] || 0, k[5] || 0, k[6] || 2, k[7] || 0, k[8]]; });
      var defSub = o.sub || 2, seg = o.seg || 16, half = seg / 2, th0 = o.th0 || 0, capN = o.capN || 3;
      var rings = [], i, s, c, k, r, h, j;
      function K(q) { return keys[clamp(q, 0, keys.length - 1)]; }
      for (i = 0; i < keys.length - 1; i++) {
        var sub = keys[i][8] || defSub;
        for (s = 0; s < sub; s++) {
          var ring = [];
          for (c = 0; c < 8; c++) ring.push(catmull(K(i - 1)[c], K(i)[c], K(i + 1)[c], K(i + 2)[c], s / sub));
          rings.push(ring);
        }
      }
      rings.push(keys[keys.length - 1].slice(0, 8));
      var dir = rings[rings.length - 1][0] >= rings[0][0] ? 1 : -1;
      function capRings(base, hgt, sign) {
        var out = [], n = hgt > 0 ? capN : 1, rAvg = (base[1] + (base[2] + base[3]) / 2) / 2;
        for (k = 1; k <= n; k++) {
          var ph = k / n * PI / 2, sc = k === n ? 0 : Math.cos(ph), q = base.slice();
          q[0] = base[0] + sign * hgt * Math.sin(ph); q[1] *= sc; q[2] *= sc; q[3] *= sc;
          // for the shading normal: the radii of the ring the cap grows from, and the radial / axial weights
          q.nr = [0, base[1], base[2], base[3]];
          q.wr = hgt > 0 ? hgt * Math.cos(ph) : 0;
          q.wa = hgt > 0 ? sign * rAvg * Math.sin(ph) : sign;
          out.push(q);
        }
        return out;
      }
      rings = capRings(rings[0], o.capA || 0, -dir).reverse().concat(rings, capRings(rings[rings.length - 1], o.capB || 0, dir));
      var per = (half + 1) * 2, nR = rings.length, nV = nR * per;
      var pos = new Array(nV * 3), uv = new Array(nV * 2), col = new Array(nV * 3), vb = o.boneFn ? new Array(nV) : null;
      var p = new V3(), info = {}, y0 = rings[0][0], y1 = rings[nR - 1][0], vi = 0;
      var sn = o.shade ? new Float32Array(nV * 3) : null, sv = new V3();
      for (r = 0; r < nR; r++) {
        var R = rings[r], e = 2 / R[6];
        for (h = 0; h < 2; h++) for (j = 0; j <= half; j++) {
          var a = th0 + (h * half + j) * TAU / seg, ca = Math.cos(a), sa = Math.sin(a);
          if (Math.abs(ca) < 1e-9) ca = 0;
          if (Math.abs(sa) < 1e-9) sa = 0;
          var cx = spow(ca, e) * R[1], cz = (sa >= 0 ? R[2] : R[3]) * spow(sa, e);
          info.lx = R[4] + cx; info.ly = R[0] + cz * Math.sin(R[7]); info.lz = R[5] + cz * Math.cos(R[7]);
          p.set(info.lx, info.ly, info.lz);
          if (o.matrix) p.applyMatrix4(o.matrix);
          info.x = p.x; info.y = p.y; info.z = p.z; info.h = h; info.u = (h * half + j) / seg;
          info.ca = ca; info.sa = sa; info.ky = R[0]; info.t = (R[0] - y0) / ((y1 - y0) || 1);
          pos[vi * 3] = p.x; pos[vi * 3 + 1] = p.y; pos[vi * 3 + 2] = p.z;
          var q2 = o.uv ? o.uv(info) : WHITE_UV;
          uv[vi * 2] = q2[0]; uv[vi * 2 + 1] = q2[1];
          tmpColor.set(o.col ? o.col(info) : '#ffffff');
          col[vi * 3] = tmpColor.r; col[vi * 3 + 1] = tmpColor.g; col[vi * 3 + 2] = tmpColor.b;
          if (vb) vb[vi] = o.boneFn(info);
          if (sn) {
            // simplified shading normal: the cross-section's own normal, blind to the lumps along the tube
            var nr = R.nr || R, wr = R.wr === undefined ? 1 : R.wr;
            sv.set((sa >= 0 ? nr[2] : nr[3]) * Math.pow(Math.max(Math.abs(sa), 1e-4), e - 1) * ca, 0,
                   nr[1] * Math.pow(Math.max(Math.abs(ca), 1e-4), e - 1) * sa).normalize().multiplyScalar(wr);
            sv.y = R.wa || 0;
            sv.normalize();
            if (o.matrix) sv.transformDirection(o.matrix);
            sn[vi * 3] = sv.x; sn[vi * 3 + 1] = sv.y; sn[vi * 3 + 2] = sv.z;
          }
          if (o.post) { p.applyMatrix4(o.post); pos[vi * 3] = p.x; pos[vi * 3 + 1] = p.y; pos[vi * 3 + 2] = p.z; }
          vi++;
        }
      }
      var idx = [];
      for (r = 0; r < nR - 1; r++) for (h = 0; h < 2; h++) for (j = 0; j < half; j++) {
        var A = r * per + h * (half + 1) + j, Bq = A + per, Cq = A + 1, Dq = Bq + 1;
        if (r > 0) idx.push(A, Bq, Cq);            // ring 0 and the last ring are poles
        if (r < nR - 2) idx.push(Cq, Bq, Dq);
      }
      fixWinding(pos, idx);
      var g = makeGeo(pos, idx, uv, col);
      g.userData.vb = vb;
      g.userData.sn = sn;
      return g;
    }

    // the collar: an elliptical tube along collarAt(), rounded off at both ends
    function collarGeo() {
      var n = (COLLAR_K.length - 1) * 3, m = 10, capN = 3, rings = [], i, j, k;
      function ringAt(t) {
        var st = collarAt(t), T = collarAt(Math.min(t + 0.004, 1)).c.sub(collarAt(Math.max(t - 0.004, -1)).c).normalize();
        var N = st.n.addScaledVector(T, -st.n.dot(T)).normalize();
        return { c: st.c, T: T, N: N, B: new V3().crossVectors(T, N), rn: st.rn, rb: st.rb, u: (t + 1) / 2 };
      }
      function cap(r, sign) {
        var out = [];
        for (k = 1; k <= capN; k++) {
          var ph = k / capN * PI / 2, sc = k === capN ? 0 : Math.cos(ph);
          out.push({ c: r.c.clone().addScaledVector(r.T, sign * r.rb * 0.9 * Math.sin(ph)), T: r.T, N: r.N, B: r.B,
                     rn: r.rn * sc, rb: r.rb * sc, u: r.u });
        }
        return out;
      }
      for (i = 0; i <= n; i++) rings.push(ringAt(-1 + 2 * i / n));
      rings = cap(rings[0], -1).reverse().concat(rings, cap(rings[n], 1));
      var pos = [], uv = [], col = [], idx = [], p = new V3(), nR = rings.length;
      tmpColor.set(COL.magenta);
      for (i = 0; i < nR; i++) for (j = 0; j <= m; j++) {
        var r = rings[i], ps = (j % m) / m * TAU, q = uvOf('collar', r.u, j / m);
        p.copy(r.c).addScaledVector(r.N, r.rn * Math.cos(ps)).addScaledVector(r.B, r.rb * Math.sin(ps));
        pos.push(p.x, p.y, p.z); uv.push(q[0], q[1]); col.push(tmpColor.r, tmpColor.g, tmpColor.b);
      }
      for (i = 0; i < nR - 1; i++) for (j = 0; j < m; j++) {
        var a = i * (m + 1) + j, b = a + m + 1;
        if (i > 0) idx.push(a, b, a + 1);            // the first and last rings are poles
        if (i < nR - 2) idx.push(a + 1, b, b + 1);
      }
      fixWinding(pos, idx);
      return makeGeo(pos, idx, uv, col);
    }

    var parts = [];
    var MIRROR = new M4().makeScale(-1, 1, 1);
    function mirrorName(n) { return n.charAt(n.length - 1) === 'L' ? n.slice(0, -1) + 'R' : n; }
    function bi(n) { if (!B[n]) throw new Error('no bone ' + n); return B[n].userData.index; }
    // add(geometry, { bone, hs, hsFn(y), color, matrix, uvPoint, lr }): hs scales the ink hull, hsFn does so by bind height
    function add(g, o) {
      var names = g.userData.vb;
      function push(mirror) {
        var mx = o.matrix || null;
        if (mirror) mx = mx ? MIRROR.clone().multiply(mx) : MIRROR;
        var part = { geometry: g, bone: bi(mirror ? mirrorName(o.bone) : o.bone), hs: o.hs === undefined ? 1 : o.hs };
        if (mx) part.matrix = mx;
        if (o.color !== undefined) part.color = o.color;
        if (o.uvPoint) part.uvPoint = o.uvPoint;
        if (o.cel) part.cel = true;
        if (o.hsFn) part.hsFn = o.hsFn;
        if (names) part.vb = names.map(function (n) { return bi(mirror ? mirrorName(n) : n); });
        parts.push(part);
      }
      push(false);
      if (o.lr) push(true);
    }
    function planar(name, ax, a0, a1, ay, b0, b1) {
      return function (i) { return uvOf(name, (i[ax] - a0) / (a1 - a0), (i[ay] - b0) / (b1 - b0)); };
    }
    function cyl(name, yTop, yBot) {
      return function (i) { return uvOf(name, i.u, (yTop - i.ly) / (yTop - yBot)); };
    }
    function flat(colour) { return function () { return colour; }; }

    /* ------------------------------------------------------------------ */
    /* body parts                                                          */
    /* ------------------------------------------------------------------ */
    // torso: one loft from crotch to neck base, rings assigned to hips / waist / chest
    var torsoF = planar('torsoF', 'x', -0.27, 0.27, 'y', 1.56, 0.74);
    var torsoBk = planar('torsoB', 'x', 0.27, -0.27, 'y', 1.56, 0.74);
    add(loft({
      rings: [
        [0.80, 0.105, 0.085, 0.092, 0, -0.005, 2.3, 0, 3],
        [0.87, 0.178, 0.108, 0.130, 0, -0.005, 2.3, 0, 3],
        [0.94, 0.180, 0.110, 0.126, 0, 0, 2.3, 0, 2],
        [0.995, 0.152, 0.106, 0.106, 0, 0, 2.3, 0, 1],
        [1.06, 0.138, 0.104, 0.096, 0, 0, 2.3, 0, 2],
        [1.115, 0.148, 0.112, 0.100, 0, 0, 2.3, 0, 1],
        [1.18, 0.185, 0.136, 0.118, 0, 0, 2.4, 0, 2],
        [1.24, 0.232, 0.170, 0.136, 0, 0, 2.5, 0, 2],
        [1.30, 0.256, 0.190, 0.144, 0, 0, 2.5, 0, 2],
        [1.37, 0.260, 0.178, 0.144, 0, 0, 2.5, 0, 2],
        [1.43, 0.238, 0.136, 0.130, 0, 0, 2.4, 0, 2],
        [1.48, 0.170, 0.104, 0.110, 0, -0.004, 2.2, 0, 2],
        [1.52, 0.118, 0.096, 0.103, 0, -0.008, 2, 0, 1]
      ],
      seg: 24, capA: 0.05, capB: 0.02, shade: true,
      uv: function (i) { return i.h === 0 ? torsoF(i) : torsoBk(i); },
      boneFn: function (i) { return i.ky < 1.03 ? 'hips' : (i.ky < 1.09 ? 'waist' : (i.ky < 1.15 ? 'waist2' : 'chest')); }
    }), { bone: 'hips', cel: true, hsFn: function (y) { return 1 - 0.75 * sstep(1.415, 1.455, y); } });   // thin ink where the top runs under the collar

    // neck: one flat fur tone, no painted or vertex-colour bands (the toon ramp gives it its one shadow edge)
    add(loft({
      rings: [
        [1.45, 0.106, 0.100, 0.100, 0, -0.012],
        [1.52, 0.099, 0.094, 0.096, 0, -0.008],
        [1.60, 0.091, 0.087, 0.089, 0, 0.004],
        [1.65, 0.085, 0.082, 0.084, 0, 0.012],
        [1.69, 0.074, 0.072, 0.074, 0, 0.018]
      ],
      seg: 16, sub: 2, capA: 0.04, capB: 0.04, shade: true, col: flat(COL.fur)
    }), { bone: 'neck', cel: true, hsFn: function (y) { return 0.25 + 0.75 * sstep(1.50, 1.55, y); } });   // no ink slivers where the neck base sits in the collar

    // head: loft along the snout (local y -> model z, local z -> model -y)
    var HEAD_M = new M4().makeRotationX(PI / 2);
    // the head was authored around a joint at (0, 1.665, 0.02); HEAD_POST scales it up about the real joint
    var HEAD_POST = new M4().makeTranslation(0, 1.645, 0.02).multiply(new M4().makeScale(1.15, 1.15, 1.15)).multiply(new M4().makeTranslation(0, -1.665, -0.02));
    var headL = planar('headL', 'z', -0.08, 0.29, 'y', 1.82, 1.64);
    var headR = planar('headR', 'z', -0.08, 0.29, 'y', 1.82, 1.64);
    function hr(z, rx, ru, rd, yc, n) { return [z, rx, rd, ru, 0, -yc, n || 2.3]; }
    var snout = loft({
      rings: [
        hr(-0.03, 0.060, 0.050, 0.050, 1.738, 2.1),
        hr(0.02, 0.080, 0.062, 0.068, 1.738, 2.2),
        hr(0.065, 0.088, 0.058, 0.076, 1.738, 2.3),
        hr(0.105, 0.054, 0.042, 0.068, 1.728, 2.3),
        hr(0.15, 0.049, 0.037, 0.057, 1.718, 2.4),
        hr(0.20, 0.047, 0.036, 0.051, 1.713, 2.5),
        hr(0.245, 0.046, 0.036, 0.048, 1.711, 2.5)
      ],
      seg: 24, sub: 3, capA: 0.035, capB: 0.034, th0: -PI / 2, matrix: HEAD_M, post: HEAD_POST,
      uv: function (i) { return i.h === 0 ? headL(i) : headR(i); }
    });
    var mouth = splitMuzzle(snout);
    add(mouth.skin, { bone: 'head', hs: 0.6 });

    // Cut the original loft along the painted smirk. Interpolate its existing normals and
    // UVs at each cut so both lip edges meet along the original surface at rest.
    function splitMuzzle(source) {
      var shell = { pos: [], nor: [], uv: [], idx: [] }, skinBones = [];
      var lining = { pos: [], nor: [], uv: [], idx: [], col: [], jawMix: [] };
      var curveBack = [[-0.11, 1.55], [0.068, 1.63], [0.088, 1.651], [0.097, 1.683]];
      var left = curveBack.concat(mouthStroke(SMIRK_LEFT).reverse()), right = curveBack.concat(mouthStroke(SMIRK_RIGHT).reverse());
      var undoHead = HEAD_POST.clone().invert(), attributes = source.attributes, vertices = [], cuts = new Map();
      for (var i = 0; i < attributes.position.count; i++) {
        var p = v3().fromBufferAttribute(attributes.position, i), authored = p.clone().applyMatrix4(undoHead);
        var curve = p.x > 0 ? left : right, k = 1;
        while (k < curve.length - 1 && authored.z > curve[k][0]) k++;
        var lo = curve[k - 1], hi = curve[k], t = clamp((authored.z - lo[0]) / (hi[0] - lo[0]), 0, 1);
        vertices.push({ id: i, pos: p, nor: v3().fromBufferAttribute(attributes.normal, i),
          uv: new THREE.Vector2().fromBufferAttribute(attributes.uv, i), d: authored.y - (lo[1] + (hi[1] - lo[1]) * t) });
      }
      function crossing(a, b) {
        var key = Math.min(a.id, b.id) * vertices.length + Math.max(a.id, b.id);
        if (!cuts.has(key)) {
          var t = a.d / (a.d - b.d);
          cuts.set(key, { d: 0, pos: a.pos.clone().lerp(b.pos, t), nor: a.nor.clone().lerp(b.nor, t).normalize(),
            uv: a.uv.clone().lerp(b.uv, t) });
        }
        return cuts.get(key);
      }
      function shellVertex(v, boneName) {
        if (v[boneName] === undefined) {
          v[boneName] = shell.pos.length / 3;
          shell.pos.push(v.pos.x, v.pos.y, v.pos.z); shell.nor.push(v.nor.x, v.nor.y, v.nor.z);
          shell.uv.push(v.uv.x, v.uv.y); skinBones.push(boneName);
        }
        return v[boneName];
      }
      function face(points, boneName) {
        for (var j = 1; j < points.length - 1; j++) {
          shell.idx.push(shellVertex(points[0], boneName), shellVertex(points[j], boneName), shellVertex(points[j + 1], boneName));
        }
      }
      // At rest the lining folds into the muzzle. As the jaw turns, the intermediate
      // rows follow both bones, forming a recessed, closed cavity around the whole cut.
      var weights = [0, 0.32, 0.82, 1];
      var colours = ['#2B1820', '#381720', '#71303C', '#48212A'].map(function (c) { return new THREE.Color(c); });
      function rimRow(v) {
        if (v.rim !== undefined) return v.rim;
        v.rim = lining.pos.length / 3;
        weights.forEach(function (w, row) {
          var inset = Math.sin(w * PI), p = v.pos, c = colours[row];
          lining.pos.push(p.x * (1 - 0.26 * inset), p.y, p.z - Math.max(0, p.z - B.jaw.userData.bind.z) * 0.1 * inset);
          lining.nor.push(v.nor.x, v.nor.y, v.nor.z); lining.uv.push(WHITE_UV[0], WHITE_UV[1]);
          lining.col.push(c.r, c.g, c.b); lining.jawMix.push(w);
        });
        return v.rim;
      }
      var index = source.index.array;
      for (var tri = 0; tri < index.length; tri += 3) {
        var triangle = [vertices[index[tri]], vertices[index[tri + 1]], vertices[index[tri + 2]]], upper = [], lower = [];
        for (var e = 0; e < 3; e++) {
          var a = triangle[e], b = triangle[(e + 1) % 3];
          if (a.d >= 0) upper.push(a);
          if (a.d <= 0) lower.push(a);
          if (a.d * b.d < 0) { var cut = crossing(a, b); upper.push(cut); lower.push(cut); }
        }
        face(upper, 'head'); face(lower, 'jaw');
        if (upper.length < 3 || lower.length < 3) continue;
        for (var u = 0; u < upper.length; u++) {
          var from = upper[u], to = upper[(u + 1) % upper.length];
          if (from.d !== 0 || to.d !== 0) continue;
          var start = rimRow(from), end = rimRow(to);
          for (var r = 0; r < weights.length - 1; r++) {
            lining.idx.push(end + r, start + r, start + r + 1, end + r, start + r + 1, end + r + 1);
          }
        }
      }
      function geometry(data) {
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(data.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
        if (data.col) g.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3));
        g.setIndex(data.idx);
        return g;
      }
      var skin = geometry(shell), inside = geometry(lining);
      skin.userData.vb = skinBones;
      inside.userData.jawMix = lining.jawMix;
      return { skin: skin, inside: inside };
    }

    // nose pad and brow ridges
    function ellipsoid(px, py, pz, sx, sy, sz, rx, ry, rz) {
      return HEAD_POST.clone().multiply(new M4().compose(v3(px, py, pz), new Q4().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YZX')), v3(sx, sy, sz)));
    }
    var BALL = new THREE.SphereGeometry(1, 10, 7);
    add(BALL, { bone: 'head', hs: 0.35, color: COL.nose, uvPoint: WHITE_UV, matrix: ellipsoid(0, 1.733, 0.269, 0.027, 0.018, 0.018, -0.25, 0, 0) });
    add(BALL, { bone: 'head', hs: 0.35, color: '#C27C30', uvPoint: WHITE_UV, lr: true,
                matrix: ellipsoid(0.053, 1.778, 0.082, 0.035, 0.008, 0.013, 0, 0.75, 0.3) });

    // ears: cupped leaves, lighter inside
    var EAR_M = HEAD_POST.clone().multiply(new M4().makeTranslation(0.044, 1.777, -0.008))
      .multiply(new M4().makeRotationZ(-0.4)).multiply(new M4().makeRotationX(-0.13)).multiply(new M4().makeRotationY(0.5));
    var earBack = uvOf('ear', 0.03, 0.5);
    add(loft({
      rings: [
        [0.0, 0.024, 0.006, 0.021],
        [0.049, 0.040, -0.002, 0.022],
        [0.104, 0.052, -0.008, 0.020],
        [0.162, 0.046, -0.007, 0.017],
        [0.212, 0.030, -0.003, 0.012],
        [0.241, 0.016, 0.002, 0.008]
      ],
      seg: 12, sub: 2, capA: 0.02, capB: 0.022, capN: 2, matrix: EAR_M,
      uv: function (i) { return i.h === 0 ? uvOf('ear', (i.lx + 0.058) / 0.116, (0.285 - i.ly) / 0.305) : earBack; }
    }), { bone: 'head', hs: 0.55, lr: true });

    // cape collar: one soft roll over both shoulders and round the back of the neck (the cape hangs from it)
    add(collarGeo(), { bone: 'chest', hs: 0.6 });

    // arms
    var armUV = cyl('arm', 1.515, 1.05);
    add(loft({
      rings: [
        [1.42, 0.108, 0.104, 0.100, ARM_X + 0.008, ARM_Z],
        [1.36, 0.114, 0.106, 0.098, ARM_X + 0.012, ARM_Z],
        [1.30, 0.100, 0.102, 0.094, ARM_X + 0.008, ARM_Z],
        [1.24, 0.094, 0.108, 0.094, ARM_X + 0.004, ARM_Z],
        [1.18, 0.084, 0.096, 0.086, ARM_X + 0.002, ARM_Z],
        [1.12, 0.070, 0.072, 0.072, ARM_X, ARM_Z]
      ],
      seg: 16, sub: 2, capA: 0.095, capB: 0.07, th0: PI, uv: armUV, shade: true
    }), { bone: 'armL', lr: true, cel: true });
    add(loft({
      rings: [
        [1.12, 0.070, 0.072, 0.072, ARM_X, ARM_Z],
        [1.06, 0.080, 0.084, 0.074, ARM_X, ARM_Z],
        [1.00, 0.070, 0.072, 0.066, ARM_X, ARM_Z],
        [0.96, 0.056, 0.058, 0.056, ARM_X, ARM_Z]
      ],
      seg: 14, sub: 2, capA: 0.07, capB: 0.03, col: flat(COL.blue), shade: true
    }), { bone: 'foreL', lr: true, cel: true });
    add(loft({   // glove with a flared cuff at mid-forearm
      rings: [
        [1.012, 0.088, 0.088, 0.085, ARM_X, ARM_Z],
        [0.985, 0.082, 0.083, 0.078, ARM_X, ARM_Z],
        [0.94, 0.068, 0.069, 0.066, ARM_X, ARM_Z],
        [0.89, 0.057, 0.059, 0.056, ARM_X, ARM_Z],
        [0.86, 0.053, 0.055, 0.053, ARM_X, ARM_Z]
      ],
      seg: 14, sub: 2, capA: 0.012, capB: 0.045, capN: 2, col: flat(COL.yellow), shade: true
    }), { bone: 'foreL', lr: true, cel: true });
    add(loft({   // palm
      rings: [
        [0.852, 0.038, 0.050, 0.048, ARM_X, ARM_Z, 2.8],
        [0.81, 0.040, 0.062, 0.058, ARM_X, ARM_Z, 3],
        [0.776, 0.038, 0.062, 0.058, ARM_X, ARM_Z, 3]
      ],
      seg: 12, sub: 2, capA: 0.03, capB: 0.02, capN: 2, col: flat(COL.yellow)
    }), { bone: 'handL', hs: 0.75, lr: true, cel: true });
    (function () {
      for (var i = 0; i < 4; i++) {
        var z = ARM_Z + FZ[i], l1 = FING1 * FL[i], l2 = 0.038 * FL[i];
        add(loft({ rings: [[KN_Y, 0.017, 0.017, 0.017, ARM_X, z], [KN_Y - l1, 0.0162, 0.0162, 0.0162, ARM_X, z]],
                   seg: 8, sub: 1, capA: 0.017, capB: 0.0162, capN: 2, col: flat(COL.yellow) }), { bone: 'f' + i + 'aL', hs: 0.6, lr: true, cel: true });
        add(loft({ rings: [[KN_Y - l1, 0.0162, 0.0162, 0.0162, ARM_X, z], [KN_Y - l1 - l2, 0.015, 0.015, 0.015, ARM_X, z]],
                   seg: 8, sub: 1, capA: 0.0162, capB: 0.015, capN: 2, col: flat(COL.yellow) }), { bone: 'f' + i + 'bL', hs: 0.6, lr: true, cel: true });
      }
      var tq = new Q4().setFromUnitVectors(v3(0, -1, 0), THUMB_DIR);
      var tm = new M4().compose(B.thAL.userData.bind, tq, v3(1, 1, 1));
      add(loft({ rings: [[0, 0.0205, 0.0205, 0.0205], [-TH1, 0.0185, 0.0185, 0.0185]], seg: 8, sub: 1, capA: 0.0205, capB: 0.0185, capN: 2,
                 matrix: tm, col: flat(COL.yellow) }), { bone: 'thAL', hs: 0.6, lr: true, cel: true });
      add(loft({ rings: [[-TH1, 0.0185, 0.0185, 0.0185], [-TH1 - 0.036, 0.0168, 0.0168, 0.0168]], seg: 8, sub: 1, capA: 0.0185, capB: 0.0168, capN: 2,
                 matrix: tm, col: flat(COL.yellow) }), { bone: 'thBL', hs: 0.6, lr: true, cel: true });
    })();

    // legs
    var thighUV = cyl('thigh', 0.985, 0.412);
    add(loft({
      rings: [
        [0.90, 0.114, 0.120, 0.116, 0.122, 0],
        [0.80, 0.120, 0.130, 0.116, 0.126, 0],
        [0.70, 0.112, 0.124, 0.106, 0.122, 0],
        [0.60, 0.096, 0.106, 0.090, 0.116, 0],
        [0.53, 0.080, 0.088, 0.078, 0.111, 0],
        [0.48, 0.072, 0.078, 0.074, HIP_X, 0]
      ],
      seg: 16, sub: 2, capA: 0.085, capB: 0.07, th0: PI, uv: thighUV, shade: true
    }), { bone: 'thighL', lr: true, cel: true });
    add(loft({   // knee and upper shin (suit)
      rings: [
        [0.48, 0.072, 0.076, 0.074, HIP_X, 0],
        [0.42, 0.067, 0.065, 0.080, HIP_X, 0],
        [0.36, 0.062, 0.058, 0.082, HIP_X, 0],
        [0.31, 0.054, 0.050, 0.070, HIP_X, 0]
      ],
      seg: 14, sub: 2, capA: 0.07, capB: 0.02, col: flat(COL.blue), shade: true
    }), { bone: 'shinL', lr: true, cel: true });
    add(loft({   // boot shaft with a cuff below the knee
      rings: [
        [0.392, 0.081, 0.073, 0.100, HIP_X, 0],
        [0.365, 0.076, 0.068, 0.096, HIP_X, 0],
        [0.30, 0.069, 0.060, 0.089, HIP_X, 0],
        [0.20, 0.056, 0.053, 0.064, HIP_X, 0],
        [0.12, 0.049, 0.049, 0.053, HIP_X, 0],
        [0.085, 0.049, 0.050, 0.053, HIP_X, 0]
      ],
      seg: 14, sub: 2, capA: 0.012, capB: 0.045, capN: 2, col: flat(COL.yellow), shade: true
    }), { bone: 'shinL', lr: true, cel: true });
    function fr(z, rx, rd, ru, yc, n) { return [z, rx, rd, ru, HIP_X, -yc, n || 2.8]; }
    add(loft({   // long kangaroo foot
      rings: [
        fr(-0.045, 0.046, 0.040, 0.045, 0.045),
        fr(0.0, 0.054, 0.046, 0.066, 0.051),
        fr(0.07, 0.059, 0.042, 0.050, 0.046),
        fr(0.15, 0.060, 0.036, 0.036, 0.040),
        fr(0.22, 0.054, 0.032, 0.030, 0.036),
        fr(0.27, 0.043, 0.028, 0.026, 0.035)
      ],
      seg: 14, sub: 2, capA: 0.03, capB: 0.032, capN: 2, matrix: HEAD_M, col: flat(COL.yellow),
      boneFn: function (i) { return i.ky >= 0.17 ? 'ballL' : 'footL'; }
    }), { bone: 'footL', hs: 0.8, lr: true, cel: true });

    // tail: one loft on ten bones, thigh-thick at the root, smooth taper to a blunt tip
    function tailRad(s) { return 0.02 + 0.092 * Math.pow(1 - clamp(s / TAIL_LEN, 0, 1), 1.3); }
    (function () {
      var rings = [], n = TAIL_N * 3, i;
      for (i = 0; i <= n; i++) {
        var s = i / n * TAIL_LEN, r = tailRad(s);
        rings.push([TAIL_Y - s, r, r * 0.95, r * 1.05, 0, TAIL_Z, 2, 0, 1]);
      }
      add(loft({
        rings: rings, seg: 12, sub: 1, capA: 0.09, capB: 0.022,
        col: flat(COL.fur),
        boneFn: function (i) { return 'tail' + clamp(Math.floor((TAIL_Y - i.ky + 0.02) / TAIL_SEG) + 1, 1, TAIL_N); }
      }), { bone: 'tail1', hsFn: function (y) { return 0.65 + 0.35 * clamp((y - (TAIL_Y - TAIL_LEN)) / TAIL_LEN, 0, 1); } });   // finer ink on the slim end
    })();

    /* ------------------------------------------------------------------ */
    /* merge, skin, hull                                                   */
    /* ------------------------------------------------------------------ */
    add(mouth.inside, { bone: 'head', hs: 0 });
    var geo = kit.geo.merge(parts);
    (function () {
      var si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, hs = new Float32Array(si.count), base = 0, PY = geo.attributes.position;
      parts.forEach(function (p) {
        var n = p.geometry.attributes.position.count;
        for (var i = 0; i < n; i++) { hs[base + i] = p.hsFn ? p.hsFn(PY.getY(base + i)) : p.hs; if (p.vb) si.setX(base + i, p.vb[i]); }
        if (p.geometry === mouth.inside) {
          p.geometry.userData.jawMix.forEach(function (w, i) {
            si.setY(base + i, bi('jaw')); sw.setXY(base + i, 1 - w, w);
          });
        }
        base += n;
      });
      geo.setAttribute('hs', new THREE.BufferAttribute(hs, 1));
    })();
    var hullGeo = kit.hull(geo, 0.016, 'hs');     // the ink hull is inflated along the true surface normals
    // The inside of the mouth is already dark; outlining its recessed walls would cover the opening.
    hullGeo.setIndex(new THREE.BufferAttribute(geo.index.array.subarray(0, geo.index.count - mouth.inside.index.count), 1));
    /* Cel shading normals (suit, neck, gloves, boots). The toon ramp only has three flat bands, so what makes the
     * colour read flat and confident is where the band edges fall. Lofted parts are lit by their simplified
     * cross-section normal (no mottling from muscle lumps), and every `cel` part leans its normal a little towards
     * the upper front right, so the front of the figure is one clean lit tone with a single shadow edge down the
     * far side. Same ramp, same material: only the normal attribute is authored. */
    (function () {
      var N = geo.attributes.normal, base = 0, nm = new THREE.Matrix3(), n = new V3(), t = new V3();
      var WRAP = v3(-0.425, 0.68, 0.595).normalize().multiplyScalar(0.43);
      parts.forEach(function (p) {
        var cnt = p.geometry.attributes.position.count, sn = p.geometry.userData.sn, i;
        if (p.cel) {
          if (p.matrix) nm.getNormalMatrix(p.matrix);
          for (i = 0; i < cnt; i++) {
            if (sn) { n.set(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]); if (p.matrix) n.applyMatrix3(nm).normalize(); }
            else n.fromBufferAttribute(N, base + i);
            n.add(WRAP).normalize();
            N.setXYZ(base + i, n.x, n.y, n.z);
          }
        }
        base += cnt;
      });
    })();
    /* ------------------------------------------------------------------ */
    /* the shared skeleton: Roo's joints in the bind layout, extra bones    */
    /* ------------------------------------------------------------------ */
    var NAME = { hips: 'pelvis', waist: 'spine_01', waist2: 'spine_02', chest: 'spine_03', neck: 'neck_01', head: 'Head', jaw: 'jaw' };
    var UEF = ['index', 'middle', 'ring', 'pinky'];
    SIDES.forEach(function (sd) {
      var s = sd[0], u = s.toLowerCase();
      NAME['arm' + s] = 'upperarm_' + u; NAME['fore' + s] = 'lowerarm_' + u; NAME['hand' + s] = 'hand_' + u;
      for (var i = 0; i < 4; i++) { NAME['f' + i + 'a' + s] = UEF[i] + '_01_' + u; NAME['f' + i + 'b' + s] = UEF[i] + '_02_' + u; }
      NAME['thA' + s] = 'thumb_01_' + u; NAME['thB' + s] = 'thumb_02_' + u;
      NAME['thigh' + s] = 'thigh_' + u; NAME['shin' + s] = 'calf_' + u; NAME['foot' + s] = 'foot_' + u; NAME['ball' + s] = 'ball_' + u;
    });
    for (var ti = 1; ti <= TAIL_N; ti++) NAME['tail' + ti] = 'tail_' + (ti < 10 ? '0' : '') + ti;
    function ue(n) { var r = NAME[n && n.name ? n.name : n]; if (!r) throw new Error('roo: no shared bone for ' + (n && n.name || n)); return r; }
    function bp(n) { var p = B[n].userData.bind; return [p.x, p.y, p.z]; }
    var J = {};
    Object.keys(NAME).forEach(function (n) { if (!/^tail/.test(n)) J[NAME[n]] = bp(n); });
    J.root = [0, 0, 0];
    SIDES.forEach(function (sd) {
      var s = sd[0], k = sd[1], u = s.toLowerCase(), i;
      J['clavicle_' + u] = [0.05 * k, 1.40, 0.0];
      for (i = 0; i < 4; i++) {   // weightless third finger joint and tip: along the second segment
        var l1 = FING1 * FL[i], l2 = 0.038 * FL[i];
        J[UEF[i] + '_03_' + u] = [ARM_X * k, KN_Y - l1 - l2 * 0.6, ARM_Z + FZ[i]];
        J[UEF[i] + '_04_leaf_' + u] = [ARM_X * k, KN_Y - l1 - l2, ARM_Z + FZ[i]];
      }
      var t2 = B['thB' + s].userData.bind, td = v3(THUMB_DIR.x * k, THUMB_DIR.y, THUMB_DIR.z);
      J['thumb_03_' + u] = t2.clone().addScaledVector(td, 0.036 * 0.6).toArray();
      J['thumb_04_leaf_' + u] = t2.clone().addScaledVector(td, 0.036).toArray();
      J['ball_leaf_' + u] = [HIP_X * k, 0.035, 0.30];
    });
    var extra = [], primary = {};
    for (ti = 1; ti <= TAIL_N; ti++) {
      extra.push({ name: NAME['tail' + ti], parent: ti === 1 ? 'pelvis' : NAME['tail' + (ti - 1)], pos: bp('tail' + ti) });
      if (ti < TAIL_N) primary[NAME['tail' + ti]] = NAME['tail' + (ti + 1)];
    }
    SIDES.forEach(function (sd) {   // ears: base and middle of each ear loft (the ears stay skinned to Head for now)
      var u = sd[0].toLowerCase(), m = sd[1] < 0 ? MIRROR.clone().multiply(EAR_M) : EAR_M;
      extra.push({ name: 'ear_01_' + u, parent: 'Head', pos: v3(0, 0, 0).applyMatrix4(m).toArray() });
      extra.push({ name: 'ear_02_' + u, parent: 'ear_01_' + u, pos: v3(0, 0.12, 0).applyMatrix4(m).toArray() });
      primary['ear_01_' + u] = 'ear_02_' + u;
    });
    extra.push({ name: 'jaw', parent: 'Head', pos: bp('jaw') });
    extra.push({ name: 'cape_root', parent: 'spine_03', pos: [0, 1.45, -0.08] });
    var rig = JG.rig.create({
      kit: kit, from: (opts && opts.from) || 'body-male', dropMesh: true, bindJoints: J, extraBones: extra, primary: primary,
      axes: { hand_l: [0, -1, 0], hand_r: [0, -1, 0] },   // the spike's hand helper measures from straight down
      // rigid parts keep the mannequin's local rotation in the bind pose, or library clips tilt them by the difference
      // between the mannequin's axes and Roo's upright layout (step 6 review: hips 22 deg, feet 16 deg, shoulders)
      noSwing: ['root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']
    });
    var root = rig.root, P = rig.P;
    root.name = 'roo';
    // skin indices: spike bone order -> shared skeleton order (the hull shares the attribute)
    (function () {
      var map = bones.map(function (b) { return rig.bones.indexOf(rig.byName[ue(b.name)]); });
      var si = geo.attributes.skinIndex;
      for (var i = 0; i < si.count; i++) si.setXY(i, map[si.getX(i)], map[si.getY(i)]);
      si.needsUpdate = true;
    })();
    var body = kit.skin(root, rig.skeleton, geo, kit.mat.toon({ map: atlas, vertexColors: true }));
    body.name = 'roo-body';
    var ink = kit.skin(root, rig.skeleton, hullGeo, kit.mat.ink());
    ink.name = 'roo-ink';
    var jaw = rig.byName.jaw, jawRest = rig.rest.jaw;
    var jawAxis = v3(1, 0, 0).applyQuaternion(jawRest.Wb.clone().invert()), jawTurn = new Q4();
    function setJawOpening(openness) {
      jawTurn.setFromAxisAngle(jawAxis, deg(13) * clamp(openness || 0, 0, 1));
      jaw.quaternion.copy(jawRest.Lb).multiply(jawTurn);
    }
    var chestAnchor = new THREE.Object3D();
    chestAnchor.position.set(0, 1.312 - 1.15, 0.02).applyQuaternion(rig.rest.spine_03.Wb.clone().invert());
    rig.byName.spine_03.add(chestAnchor);

    /* ------------------------------------------------------------------ */
    /* posing helpers (all in root space; bind quaternions are identity)    */
    /* ------------------------------------------------------------------ */
    var DOWN = v3(0, -1, 0), FRONT = v3(0, 0, 1);
    // The spike's helper names, now wrappers over the rig's ported helper set P (spike bone names are mapped).
    // Everything is in root space and relative to the reference (bind) pose; P handles the rig's non-identity
    // reference rotations (rest.Wb), so worldQ keeps the spike's meaning: rotation relative to the bind pose.
    function worldQ(b) { return P.deltaQ(ue(b)); }
    function worldPos(b) { return P.worldPos(ue(b)); }
    function fromBind(name, a) { return P.fromRef(ue(name), a); }
    function orient(b, a0, a1, b0, b1) { P.orient(ue(b), a0, a1, b0, b1); }
    function aim(name, dir, pole) { orient(name, DOWN, arr3(dir), FRONT, arr3(pole || [0, 0, 1])); }
    function aimAt(name, target, pole) { orient(name, DOWN, target.clone().sub(worldPos(name)), FRONT, arr3(pole || [0, 0, 1])); }
    function mx(a, k) { return [a[0] * k, a[1], a[2]]; }
    function rot(name, x, y, z) { P.rotLocal(ue(name), x, y, z); }
    // hand: fingers along `dir`, palm facing `palm` (world)
    function hand(s, dir, palm) { P.hand(s.toLowerCase(), arr3(dir), arr3(palm)); }
    // fingers: curl at knuckle / mid joint, optional fan; thumb direction given for the left hand
    function fingers(s, a, b, spread, thumb) { P.fingers(s.toLowerCase(), a, b, spread, thumb); }
    function fist(s) { fingers(s, 1.5, 1.62, null, [-0.72, -0.66, 0.2]); }
    // two-bone leg IK to an ankle target; the foot is then laid flat (yaw / pitch in root space)
    function leg(s, ankle, kneeHint, yaw, pitch) { P.legIK(s.toLowerCase(), ankle, kneeHint, yaw, pitch); }
    // tail: elevation below the horizontal and heading (degrees, root space) given as control values along the
    // tail and resampled onto the bones; `k` steepens the hanging part (not the end that lies down)
    function tail(els, yaws, k) { P.tail(els, yaws, k); }
    function tailTip() { return fromBind('tail' + TAIL_N, [0, TAIL_Y - TAIL_LEN, TAIL_Z]); }
    // standing: the tail follows a curve through root-space points (after its root). It is walked along the curve
    // one bone length at a time, and no joint is allowed to sink the tail into the ground.
    function tailAlong(pts) {
      var P = [worldPos(B.tail1)].concat(pts.map(arr3)), S = [], i, k, n = P.length - 1;
      function K(q) { return P[clamp(q, 0, n)]; }
      for (i = 0; i < n; i++) for (k = 0; k < 32; k++) {
        var t = k / 32, a = K(i - 1), b = K(i), c = K(i + 1), d = K(i + 2);
        S.push(v3(catmull(a.x, b.x, c.x, d.x, t), catmull(a.y, b.y, c.y, d.y, t), catmull(a.z, b.z, c.z, d.z, t)));
      }
      S.push(P[n].clone());
      var J = worldPos(B.tail1), cur = 1, pole = v3(0, -0.5, 1), dir = new V3();
      for (i = 1; i <= TAIL_N; i++) {
        while (cur < S.length - 1 && S[cur].distanceTo(J) < TAIL_SEG) cur++;
        dir.subVectors(S[cur], J).normalize();
        var floor = tailRad(i * TAIL_SEG) + 0.014, ny = J.y + dir.y * TAIL_SEG;
        if (ny < floor) { dir.y = (floor - J.y) / TAIL_SEG; var h = Math.sqrt(Math.max(1 - dir.y * dir.y, 0) / Math.max(dir.x * dir.x + dir.z * dir.z, 1e-9)); dir.x *= h; dir.z *= h; }
        orient(B['tail' + i], DOWN, dir, FRONT, pole);
        J.addScaledVector(dir, TAIL_SEG);
      }
    }
    // The standing shape: down and back from the root, tucked behind the left leg and under the cape (so no strip
    // of fur shows between the legs from the front); it swings out to the left while still under the cape, then
    // turns towards the back in one long curve as it comes down (no vertical drop between the boots and no sharp
    // bend where it lands), so below the hem the oblique cameras see a slim sweeping curve and the front and back
    // cameras a slim slant beside the boot; the end lies on the ground behind him. A short piece of that end can
    // still be glimpsed between the legs from high in front. `w` widens it for a wider stance; `lean` tips the root further over so
    // nothing of it shows between the thighs when the legs are spread and the camera is low.
    function tailProp(w, lean) {
      lean = lean || 0;
      tailAlong([[0.135 + w + lean, 0.72, -0.145], [0.23 + w + lean * 0.5, 0.565, -0.165], [0.31 + w, 0.43, -0.195],
                 [0.365 + w, 0.31, -0.245], [0.405 + w, 0.205, -0.32], [0.435 + w, 0.125, -0.415], [0.455 + w, 0.07, -0.525],
                 [0.46 + w, 0.045, -0.64], [0.45 + w, 0.035, -0.755]]);
    }

    /* ------------------------------------------------------------------ */
    /* poses                                                               */
    /* ------------------------------------------------------------------ */
    var POSES = {
      rest: function () {
        P.hips([0, 0.936, 0]);
        rot('chest', -0.06, 0, 0); rot('neck', 0.1, -0.12, 0); rot('head', -0.12, -0.2, 0);
        SIDES.forEach(function (sd) {
          var s = sd[0], k = sd[1];
          aim('arm' + s, mx([0.22, -1, -0.06], k), mx([-0.25, 0, 1], k));
          aim('fore' + s, mx([0.1, -1, 0.26], k), mx([-0.25, 0, 1], k));
          fist(s);
          leg(s, [0.165 * k, ANK_Y, 0.0], [0.14 * k, 0, 1], 0.22 * k, 0);
        });
        tailProp(0);
      },
      heroCrossed: function () {
        P.hips([0, 0.93, 0]);
        rot('hips', 0, 0, 0); rot('waist', -0.04, 0, 0); rot('chest', -0.07, 0, 0);
        rot('neck', 0.06, 0.1, 0); rot('head', -0.16, 0.22, 0);
        // left forearm on top, its hand resting on the right forearm; right hand tucked under
        var eL = fromBind('chest', [0.2, 1.12, 0.2]), eR = fromBind('chest', [-0.2, 1.12, 0.2]);
        aimAt('armL', eL, [-1, 0, 0.3]);
        aimAt('armR', eR, [1, 0, 0.3]);
        aimAt('foreR', fromBind('chest', [0.03, 1.07, 0.218]), [0, 0.7, -0.7]);
        aimAt('foreL', fromBind('chest', [-0.04, 1.175, 0.28]), [0, 0.7, -0.7]);
        var cq = worldQ(B.chest);
        function cdir(a) { var v = arr3(a).applyQuaternion(cq); return [v.x, v.y, v.z]; }
        hand('L', cdir([-0.97, 0.05, -0.15]), cdir([-0.05, -0.55, -0.83]));
        fingers('L', 0.55, 0.65, null, [-0.3, -0.8, 0.5]);
        hand('R', cdir([0.85, -0.15, -0.5]), cdir([-0.3, 0.1, -1]));
        fist('R');
        SIDES.forEach(function (sd) {
          var s = sd[0], k = sd[1];
          leg(s, [0.2 * k, ANK_Y, 0.0], [0.2 * k, 0, 1], 0.3 * k, 0);
        });
        tailProp(0.035, 0.05);
      },
      crouch: function () {
        P.hips([0, 0.50, -0.20]);
        rot('hips', 0.70, 0, 0); rot('waist', 0.22, 0, 0); rot('chest', 0.2, 0, 0);
        rot('neck', -0.45, 0, 0); rot('head', -0.5, 0, 0);
        SIDES.forEach(function (sd) {
          var s = sd[0], k = sd[1];
          leg(s, [0.18 * k, ANK_Y, 0.02], [0.5 * k, 0, 1], 0.32 * k, 0);
          aim('arm' + s, mx([0.36, 0.28, -0.9], k), [0, -1, -0.2]);
          aim('fore' + s, mx([0.36, 0.1, -0.93], k), [0, -1, -0.2]);
          fist(s);
        });
        tail([33, 42, 42, 32, 13, 0, -10, -18], [0, 2, 5, 9, 14, 20, 26, 32]);
      },
      dive: function () {
        P.hips([0, 1.25, 0]);
        rot('hips', 0.62, 0, 0.12); rot('waist', -0.1, -0.14, 0); rot('chest', -0.16, -0.14, 0);
        rot('neck', -0.12, 0.1, 0); rot('head', -0.22, 0.12, 0);
        // left arm reaches forward with an open hand, right fist cocked back
        aim('armL', [0.58, -0.08, 0.82], [0, 1, 0.2]);
        aim('foreL', [0.46, 0.1, 0.9], [0, 1, 0]);
        hand('L', [0.3, 0.75, 0.55], [0.1, -0.45, 0.88]);
        fingers('L', 0.1, 0.12, [-0.26, -0.08, 0.1, 0.28], [-0.2, -0.45, 0.87]);
        aim('armR', [-0.8, -0.35, -0.25], [0, 0.3, 1]);
        aim('foreR', [0.15, 0.08, 1], [0, 1, 0]);
        fist('R');
        // right leg trails, left knee drives forward
        aim('thighR', [-0.22, -0.66, -0.72], [0, -0.72, 0.66]);
        aim('shinR', [-0.16, -0.36, -0.92], [0, -0.92, 0.36]);
        rot('footR', 0.9, 0, 0);
        aim('thighL', [0.25, -0.56, 0.79], [0, 0.8, 0.56]);
        aim('shinL', [0.1, -0.8, -0.59], [0, -0.59, 0.8]);
        rot('footL', 0.7, 0, 0);
        tail([34, 24, 15, 7, 1, -4, -8, -10], [-30, -44, -55, -63, -69, -73, -76, -78]);
      }
    };
    function applyPose(name) {
      P.reset();
      (POSES[name] || POSES.rest)();
      root.updateMatrixWorld(true);
    }

    /* ------------------------------------------------------------------ */
    /* cape: strand drape + capsule collision, one closed shell per pose    */
    /* ------------------------------------------------------------------ */
    var CAPE_NU = 22, CAPE_NV = 18, CAPE_T = 0.012, CAPE_SPAN = 0.355;   // the cape hangs from the collar between t = -SPAN and +SPAN
    var CAPE = {
      rest: {
        len: 1.3, b0: 0.03, b1: 0.24, d0: [-0.85, -0.5],
        G: function (u) { return v3(0.25 * u, -1, -0.17); },
        ripple: function (u, v) { return 0.036 * Math.pow(v, 1.2) * Math.sin(u * 7.5 + 0.6) + 0.012 * v * Math.sin(u * 17 + 1); }
      },
      heroCrossed: {
        len: 1.3, b0: 0.03, b1: 0.26, d0: [-0.85, -0.5],
        G: function (u, v) { return v3(0.32 * u - 0.24 * v, -1, -0.2 - 0.1 * v); },
        ripple: function (u, v) { return 0.05 * Math.pow(v, 1.2) * Math.sin(u * 7 + 1.4) + 0.014 * v * Math.sin(u * 15 + 0.3); }
      },
      crouch: {
        len: 1.25, b0: 0.25, b1: 0.6, d0: [-0.97, -0.25],
        G: function (u) { return v3(0.3 * u, -0.72, -0.7); },
        ripple: function (u, v) { return 0.04 * Math.pow(v, 1.2) * Math.sin(u * 7.5 + 0.2) + 0.03 * v * Math.sin(v * 7 + u * 2); }
      },
      dive: {
        len: 1.34, b0: 0.02, b1: 0.3, d0: [-0.2, -1],
        G: function (u, v) { return v3(1.05 * u - 0.3, 0.36 - 0.3 * v + 0.2 * Math.abs(u), -0.75); },
        ripple: function (u, v) { return 0.09 * v * Math.sin(u * 5 + 1 + v * 2) + 0.07 * v * Math.sin(v * 8 + u * 1.5); }
      }
    };
    // In the subway the long hem sweeps across the free seat on Roo's right. The cloth
    // reaches the cushion before it fans out; its other side stays clear of his tail.
    var subwayDrape = {
      strand: function (p, u) {
        return new THREE.CatmullRomCurve3([
          p, v3(p.x * 1.17, p.y - 0.14, p.z - 0.13), v3(p.x * 1.42, 0.85, -0.395 - 0.035 * (1 - u * u)),
          v3(p.x * 1.40 - 0.04, 0.65, -0.416), v3(p.x * 0.9 - 0.24, 0.495, -0.399 + 0.025 * u),
          v3(-0.47 + 0.068 * u, 0.479, -0.306 - 0.09 * u), v3(-0.72 + 0.057 * u, 0.472, -0.271 - 0.14 * u)
        ]);
      },
      ripple: function (u, v) { return 0.014 * Math.sin(u * 10 + 2 * v) * Math.sin(v * PI / 2); }
    };
    function capsules() {
      var list = [];
      function cap(a, b, r) { list.push({ a: a, b: b, r: r }); }
      cap(worldPos(B.hips), fromBind('chest', [0, 1.36, 0]), 0.15);
      cap(fromBind('chest', [-0.13, 1.31, -0.015]), fromBind('chest', [0.13, 1.31, -0.015]), 0.132);
      cap(fromBind('hips', [-0.07, 0.89, -0.01]), fromBind('hips', [0.07, 0.89, -0.01]), 0.128);
      SIDES.forEach(function (sd) {
        var s = sd[0];
        var sh = fromBind('arm' + s, [ARM_X * sd[1] + 0.008 * sd[1], 1.39, ARM_Z]);
        cap(sh, sh, 0.126);
        cap(worldPos(B['arm' + s]), worldPos(B['fore' + s]), 0.106);
        cap(worldPos(B['fore' + s]), worldPos(B['hand' + s]), 0.088);
        cap(worldPos(B['thigh' + s]), worldPos(B['shin' + s]), 0.13);
        cap(worldPos(B['shin' + s]), worldPos(B['foot' + s]), 0.09);
      });
      for (var i = 1; i <= TAIL_N; i++) {
        var a = worldPos(B['tail' + i]);
        var b = i < TAIL_N ? worldPos(B['tail' + (i + 1)]) : tailTip();
        cap(a, b, tailRad((i - 0.5) * TAIL_SEG) + 0.012);
      }
      return list;
    }
    function buildCape(cfg) {
      var cq = worldQ(B.chest), caps = capsules(), soft = 0.035;
      var NU = CAPE_NU, NV = CAPE_NV, P = [], iu, iv, i;
      for (iu = 0; iu <= NU; iu++) {
        var u = -1 + 2 * iu / NU, st = collarAt(u * CAPE_SPAN), col = [];
        var rad = v3(st.n.x, 0, st.n.z).normalize();
        var p = fromBind('chest', [st.c.x + 0.02 * rad.x, st.c.y - 0.02, st.c.z + 0.02 * rad.z]);   // under the roll's outer side
        if (cfg.strand) col = cfg.strand(p, u).getPoints(NV);
        else {
          var d0 = rad.multiplyScalar(0.3).add(v3(0, cfg.d0[0], cfg.d0[1])).normalize().applyQuaternion(cq);
          var step = cfg.len / NV * (1 - 0.05 * u * u);
          for (iv = 0; iv <= NV; iv++) {
            var v = iv / NV;
            col.push(p.clone());
            var g = cfg.G(u, v).normalize();
            if (cfg.local) g.applyQuaternion(cq);
            var d = d0.clone().lerp(g, sstep(cfg.b0, cfg.b1, v)).normalize();
            p.addScaledVector(d, step);
          }
        }
        P.push(col);
      }
      function normalAt(iu, iv) {
        var a = P[Math.min(iu + 1, NU)][iv].clone().sub(P[Math.max(iu - 1, 0)][iv]);
        var b = P[iu][Math.min(iv + 1, NV)].clone().sub(P[iu][Math.max(iv - 1, 0)]);
        return a.cross(b).normalize();
      }
      // folds
      var disp = [], fold = [], foldMax = 1e-6;
      for (iu = 0; iu <= NU; iu++) for (iv = 0; iv <= NV; iv++) {
        var uu = -1 + 2 * iu / NU, vv = iv / NV, rp = cfg.ripple(uu, vv) * sstep(0.04, 0.3, vv);
        disp.push(normalAt(iu, iv).multiplyScalar(rp));
        fold.push(rp); foldMax = Math.max(foldMax, Math.abs(rp));
      }
      for (iu = 0, i = 0; iu <= NU; iu++) for (iv = 0; iv <= NV; iv++) P[iu][iv].add(disp[i++]);
      // keep the cloth off the body and the tail, and off the ground
      var ab = new V3(), ap = new V3(), cl = new V3(), dv = new V3();
      for (var pass = 0; pass < 3; pass++) for (iu = 0; iu <= NU; iu++) for (iv = 1; iv <= NV; iv++) {
        var q = P[iu][iv];
        for (i = 0; i < caps.length; i++) {
          var c = caps[i], R = c.r + soft;
          ab.subVectors(c.b, c.a); ap.subVectors(q, c.a);
          var l2 = ab.lengthSq(), t = l2 > 1e-10 ? clamp(ap.dot(ab) / l2, 0, 1) : 0;
          cl.copy(c.a).addScaledVector(ab, t);
          dv.subVectors(q, cl);
          var dist = dv.length();
          if (dist < R) {
            if (dist < 1e-5) { dv.set(0, 0, -1); dist = 1; }
            var want = c.r + soft * Math.pow(dist / R, 2);
            q.copy(cl).addScaledVector(dv, want / dist);
          }
        }
        if (q.y < 0.03) q.y = 0.03;
      }
      // closed thin shell: outer layer, inner layer, rim
      var W = NV + 1, n1 = (NU + 1) * W, pos = [], colr = [], idx = [];
      var cOut = new THREE.Color(COL.magenta), cIn = new THREE.Color(COL.magD), cDark = new THREE.Color('#9C1560'), nrm = [], cc = new THREE.Color();
      for (iu = 0; iu <= NU; iu++) for (iv = 0; iv <= NV; iv++) nrm.push(normalAt(iu, iv));
      for (var layer = 0; layer < 2; layer++) for (iu = 0, i = 0; iu <= NU; iu++) for (iv = 0; iv <= NV; iv++, i++) {
        var pt = P[iu][iv].clone().addScaledVector(nrm[i], (layer === 0 ? 0.5 : -0.5) * CAPE_T);
        pos.push(pt.x, pt.y, pt.z);
        // ridges keep the full colour, valleys go darker (reads as folds even in flat shadow)
        var ridge = clamp(0.5 + (layer === 0 ? 0.9 : -0.9) * fold[i] / foldMax, 0, 1);
        cc.copy(cDark).lerp(layer === 0 ? cOut : cIn, sstep(0.15, 0.6, ridge));
        colr.push(cc.r, cc.g, cc.b);
      }
      function id(layer, iu, iv) { return layer * n1 + iu * W + iv; }
      for (iu = 0; iu < NU; iu++) for (iv = 0; iv < NV; iv++) {
        idx.push(id(0, iu, iv), id(0, iu + 1, iv), id(0, iu, iv + 1), id(0, iu + 1, iv), id(0, iu + 1, iv + 1), id(0, iu, iv + 1));
        idx.push(id(1, iu, iv), id(1, iu, iv + 1), id(1, iu + 1, iv), id(1, iu + 1, iv), id(1, iu, iv + 1), id(1, iu + 1, iv + 1));
      }
      var loop = [];
      for (iu = 0; iu < NU; iu++) loop.push([iu, 0]);
      for (iv = 0; iv < NV; iv++) loop.push([NU, iv]);
      for (iu = NU; iu > 0; iu--) loop.push([iu, NV]);
      for (iv = NV; iv > 0; iv--) loop.push([0, iv]);
      for (i = 0; i < loop.length; i++) {
        var A = loop[i], Bq = loop[(i + 1) % loop.length];
        var a0 = id(0, A[0], A[1]), b0 = id(0, Bq[0], Bq[1]), a1 = id(1, A[0], A[1]), b1 = id(1, Bq[0], Bq[1]);
        idx.push(b0, a0, a1, b0, a1, b1);
      }
      var g = makeGeo(pos, idx, null, colr);
      return { g: g, h: kit.hull(g, 0.013) };
    }
    var capeGeo = {};
    Object.keys(POSES).forEach(function (name) { applyPose(name); capeGeo[name] = buildCape(CAPE[name]); });
    var cape = new THREE.Mesh(capeGeo.rest.g, kit.mat.toon({ vertexColors: true }));
    cape.name = 'roo-cape'; cape.frustumCulled = false;
    var capeInk = new THREE.Mesh(capeGeo.rest.h, kit.mat.ink());
    capeInk.name = 'roo-cape-ink'; capeInk.frustumCulled = false;
    root.add(cape); root.add(capeInk);

    function pose(name) {
      if (!POSES[name]) name = 'rest';
      applyPose(name);
      cape.geometry = capeGeo[name].g;
      capeInk.geometry = capeGeo[name].h;
    }
    pose('rest');
    // Until secondary.js lands (Stage 1: tail springs), library clips carry the standing tail shape along with the
    // hips: the tail bones keep the local rotations they have in the rest pose.
    var TAIL_REST = [];
    for (var tr = 1; tr <= TAIL_N; tr++) TAIL_REST.push(rig.byName[NAME['tail' + tr]].quaternion.clone());
    function holdTail() { for (var i = 0; i < TAIL_N; i++) rig.byName[NAME['tail' + (i + 1)]].quaternion.copy(TAIL_REST[i]); }
    // With secondary.js loaded, update(dt) after the mixer gives the tail a lagged spring towards that shape.
    var tailSpring = null;
    // Keep the tail out of the floor: walk down the chain and pitch any bone whose far end dips below the tail's own
    // radius up just enough (the spike's tailAlong rule, applied after the mixer and the spring).
    var TB = []; for (var tb0 = 1; tb0 <= TAIL_N; tb0++) TB.push(NAME['tail' + tb0]);
    function floorTail() {
      for (var i = 0; i < TAIL_N; i++) {
        var a = P.worldPos(TB[i]), b = i < TAIL_N - 1 ? P.worldPos(TB[i + 1]) : tailTip();
        var floor = tailRad((i + 1) * TAIL_SEG) + 0.014;
        if (b.y >= floor) continue;
        var d = b.clone().sub(a), want = d.clone(); want.y = Math.min(Math.max(floor - a.y, -TAIL_SEG), TAIL_SEG);
        var h = Math.sqrt(Math.max(TAIL_SEG * TAIL_SEG - want.y * want.y, 0)), xz = Math.hypot(d.x, d.z) || 1e-6;
        want.x = d.x / xz * h; want.z = d.z / xz * h;
        P.setDelta(TB[i], new THREE.Quaternion().setFromUnitVectors(d.normalize(), want.normalize()).multiply(P.deltaQ(TB[i])));
      }
    }
    function update(dt) {
      if (!(dt > 0)) return;   // a zero step (the viewer's setPose) leaves an authored pose's tail alone
      if (!tailSpring && JG.secondary) {
        var tb = []; for (var i = 1; i <= TAIL_N; i++) tb.push(rig.byName[NAME['tail' + i]]);
        tailSpring = JG.secondary.chain(tb, TAIL_REST, { stiffness: 16, tipStiffness: 6 });
      }
      if (tailSpring) tailSpring.update(dt); else holdTail();
      floorTail();
    }
    function resetSecondary() { if (tailSpring) tailSpring.reset(); else holdTail(); }
    // Library clips: until the Verlet cape lands, the rest drape rides on cape_root so it follows the torso.
    // clipMode(true) puts Roo in the rest pose with the cape on cape_root; clipMode(false) hands it back to the root.
    var capeRoot = rig.byName.cape_root;
    function clipMode(on) {
      pose('rest');
      root.updateMatrixWorld(true);
      (on ? capeRoot : root).attach(cape); (on ? capeRoot : root).attach(capeInk);
      if (on) resetSecondary();
    }
    // Bake against the actual seated body once, then carry it on the same shoulder
    // attachment as the other clip drapes. Reuse it for the ride home.
    var subwayCape = null;
    function setSubwayCape(on) {
      if (on && !subwayCape) {
        root.updateWorldMatrix(true, true);
        var local = cape.matrixWorld.clone().invert().multiply(root.matrixWorld);
        subwayCape = buildCape(subwayDrape);
        subwayCape.g.applyMatrix4(local);
        subwayCape.h.applyMatrix4(local);
      }
      var drape = on ? subwayCape : capeGeo.rest;
      cape.geometry = drape.g; capeInk.geometry = drape.h;
    }
    // anchors (plan section 6 Actor.anchors), as bones or bone children
    function anchorAt(bone, point) {
      var o = new THREE.Object3D(), r = rig.rest[bone];
      o.position.copy(arr3(point).sub(r.world).applyQuaternion(r.Wb.clone().invert()));
      rig.byName[bone].add(o); return o;
    }
    var ANCH = {
      head: rig.byName.Head, eyes: anchorAt('Head', [0, 1.80, 0.12]), earR: rig.byName.ear_02_r, chest: chestAnchor,
      backUpper: anchorAt('spine_03', [0, 1.36, -0.14]), handL: rig.byName.hand_l, handR: rig.byName.hand_r,
      hip: rig.byName.pelvis, seat: anchorAt('pelvis', [0, 0.80, -0.06]), footR: rig.byName.foot_r
    };

    return {
      root: root, rig: rig, P: P, body: body, ink: ink, cape: cape, capeInk: capeInk,
      anchors: ANCH, setJawOpening: setJawOpening,
      pose: function (name) { if (cape.parent !== root) { root.attach(cape); root.attach(capeInk); } pose(name); },
      holdTail: function () { holdTail(); floorTail(); }, update: update, resetSecondary: resetSecondary, clipMode: clipMode, setSubwayCape: setSubwayCape,
      poses: Object.keys(POSES),
      _debug: { B: B, bones: bones, NAME: NAME, J: J, parts: parts, geo: geo, capeGeo: capeGeo, worldPos: worldPos, fromBind: fromBind, tailAlong: tailAlong, tailTip: tailTip, collarAt: collarAt }
    };
  }

  window.JG = window.JG || {};
  window.JG.roo = { build: build };
})();
