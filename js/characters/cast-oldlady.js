/* The subway passenger wears a lavender cardigan and plum glasses. Her swept silver hair and low bun are
 * fitted to body-female in the Head joint's bind frame and follow her gaze and knitting poses. */
(function () {
  'use strict';
  var JG = window.JG;
  var SKIN = '#EBC3A8', SILVER = '#B9B5BB', GLINT = '#DCD6D3', PART = '#918993', CARDIGAN = '#B9A3D9', BLOUSE = '#FFF8E7',
    SKIRT = '#5E4E78', TIGHTS = '#6E5C70', SHOES = '#3A2A30', FRAMES = '#805368';

  // Angle from the forehead (radians), height of the hairline (metres); the rise at the side clears the ear.
  var hairline = [[0, 0.097], [0.52, 0.099], [0.88, 0.088], [1.13, 0.067], [1.32, 0.040],
    [1.58, 0.060], [1.80, 0.054], [2.14, 0.019], [2.70, -0.001], [Math.PI, -0.004]];

  function hairlineAngle(angle) {
    var a = Math.atan2(Math.sin(angle), Math.cos(angle)), side = Math.abs(a), i = 1;
    while (i < hairline.length - 1 && side > hairline[i][0]) i++;
    var p = hairline[i - 1], q = hairline[i];
    var rim = p[1] + (q[1] - p[1]) * (side - p[0]) / (q[0] - p[0]);
    rim += 0.011 * Math.exp(-14 * (a + 0.48) ** 2) - 0.009 * Math.exp(-7 * (a - 0.50) ** 2);
    return Math.asin((rim - 0.053) / 0.111);
  }
  function hairPoint(THREE, angle, latitude, lift) {
    var ring = Math.cos(latitude), top = Math.sin(latitude);
    return new THREE.Vector3((0.086 + lift) * ring * Math.sin(angle) + 0.003 * top,
      0.053 + (0.111 + lift) * top, -0.006 + (0.115 + lift) * ring * Math.cos(angle));
  }

  // Closed rings share vertices so the highlights and the outline pass cleanly across the centre front.
  function sweptHair(THREE) {
    var positions = [], indices = [], segments = 28, levels = [0, 0, 0.20, 0.42, 0.64, 0.83];
    levels.forEach(function (height, row) {
      for (var col = 0; col < segments; col++) {
        var angle = 2 * Math.PI * col / segments;
        var rim = hairlineAngle(angle);
        var p = hairPoint(THREE, angle, rim + (Math.PI / 2 - rim) * height, row === 0 ? -0.008 : 0);
        if (row === 0) p.y += 0.002;
        positions.push(p.x, p.y, p.z);
        var a = row * segments + col, b = row * segments + (col + 1) % segments;
        if (row + 1 < levels.length) indices.push(a, b, b + segments, a, b + segments, a + segments);
        else indices.push(a, b, segments * levels.length);
      }
    });
    positions.push(0.003, 0.164, -0.006);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  function ribbon(THREE, segments, point) {
    var g = new THREE.PlaneGeometry(1, 1, segments, 1), pos = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < pos.count; i++) {
      var t = uv.getX(i), p = point(t, (uv.getY(i) - 0.5) * Math.sin(Math.PI * t));
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    return g;
  }
  // Tapered ribbons sweep from the part around the cap. Offset across the curve in its own surface.
  function strand(start, end, arch, width) {
    return function (THREE) {
      return ribbon(THREE, 14, function (t, side) {
        var da = end[0] - start[0], dh = end[1] - start[1];
        var tangentH = dh + Math.PI * arch * Math.cos(Math.PI * t);
        var offset = side * width / Math.hypot(da, tangentH);
        var angle = start[0] + t * da - tangentH * offset;
        return hairPoint(THREE, angle, start[1] + t * dh + arch * Math.sin(Math.PI * t) + da * offset, 0.0016);
      });
    };
  }

  function bunPoint(THREE, x, y, z, lift) {
    var coil = 1 + 0.08 * (1 - z * z) * Math.cos(3 * Math.atan2(y, x) - 2.4 * z);
    return new THREE.Vector3((0.063 + lift) * x * coil, (0.052 + lift) * y * coil, (0.048 + lift) * z);
  }
  function woundBun(THREE) {
    var g = new THREE.SphereGeometry(1, 18, 10), pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var p = bunPoint(THREE, pos.getX(i), pos.getY(i), pos.getZ(i), 0);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    return g;
  }
  function bunTwist(THREE) {
    return ribbon(THREE, 22, function (t, side) {
      var a = -0.90 + 5.9 * t, r = 0.98 - 0.73 * t + 0.12 * side;
      return bunPoint(THREE, r * Math.cos(a), r * Math.sin(a), -Math.sqrt(1 - r * r), 0.0014);
    });
  }
  var DATA = {
    from: 'body-female', scale: 0.88, kind: 'oldlady', lookLimit: 1.0, defaultClip: 'seatedPurseIdle',
    hide: ['hair'],
    paint: {
      base: SKIN,
      rules: [
        { part: 'cloth2', comp: { topMin: 0.1 }, color: TIGHTS },
        { part: 'cloth2', color: SHOES },
        { part: 'skin', bones: /^(thigh|calf|foot|ball)/, color: TIGHTS },
        { part: 'skin', bones: /^(clavicle|upperarm)/, xMin: 0.038, color: CARDIGAN },
        { part: 'skin', bones: /^(spine_0[123]|clavicle|neck_01)$/, zMax: -0.005, yMax: 0.845, color: CARDIGAN },
        { part: 'skin', bones: /^(spine_0[23]|clavicle|neck_01)$/, yMax: 0.835, color: BLOUSE },
        { part: 'cloth', comp: { topMax: 0.66 }, color: SKIRT },
        { part: 'cloth', color: CARDIGAN }
      ]
    },
    shells: [
      { makeGeometry: sweptHair, at: 'head', color: SILVER, ink: 0.46 },
      { makeGeometry: strand([-0.48, 0.54], [-0.74, 1.42], 0, 0.074), at: 'head', color: PART, ink: 0 },
      { makeGeometry: strand([-0.47, 0.55], [1.78, 0.37], -0.025, 0.21), at: 'head', color: '#C9C2C5', ink: 0 },
      { makeGeometry: strand([-0.46, 0.56], [2.42, 0.29], 0.32, 0.058), at: 'head', color: GLINT, ink: 0 },
      { makeGeometry: strand([-0.56, 0.63], [-2.42, 0.25], 0.19, 0.046), at: 'head', color: GLINT, ink: 0 },
      { makeGeometry: woundBun, at: 'head', offset: [0.012, 0.038, -0.119], color: '#ADA6AF', ink: 0.48 },
      { makeGeometry: bunTwist, at: 'head', offset: [0.012, 0.038, -0.119], color: '#CCC5C8', ink: 0 },
      { shape: 'torus', at: 'eyeL', offset: [0, 0.003, 0.022], r: 0.020, tube: 0.0017, scale: [1.21, 0.94, 1], seg: 20, color: FRAMES, ink: 0, mirror: true },
      { shape: 'tube', at: 'face', points: [[-0.008, 0.003, 0.010], [0, 0.007, 0.015], [0.008, 0.003, 0.010]], r: 0.0017, seg: 6, color: FRAMES, ink: 0 },
      { shape: 'tube', at: 'face', points: [[0.055, 0.004, 0.010], [0.060, 0.006, 0], [0.072, 0.006, -0.044], [0.079, -0.003, -0.087]], r: 0.0018, seg: 8, color: FRAMES, ink: 0, mirror: true }
    ],
    face: {
      neutral: 'deadpan',
      style: { skin: SKIN, iris: '#546571', brow: '#756B73', browW: 0.003, lips: '#A76A69', lipFill: true,
        lashes: 'female', nose: 'soft', wrinkles: true, fitMouth: true, mouthOffsetY: 0.010 },
      frames: {
        deadpan: { eyes: 'half', brows: -0.1, mouth: 'flat' },
        curious: { eyes: 'open', brows: 0.26, browUp: 0.48, mouth: 'flat' },
        talking: { eyes: 'open', brows: 0.25, browUp: 0.42, mouth: 'talk' },
        amused: { eyes: 'open', brows: 0.08, browUp: 0.12, mouth: 'smirk' },
        smile: { eyes: 'happy', brows: 0.3, mouth: 'smile', blush: true }
      }
    },
    // Hold the arch with both hands. The broad base sits across the top of her thighs.
    props: { handbag: { root: [0.1278, -0.0417, 0.0133], rot: [-2.099, 0.592, 2.297] }, knitting: { along: 0.07 } }
  };
  JG.characters.register('oldlady', function (kit, info) { return JG.anim.human(kit, info, DATA); }, DATA);
})();
