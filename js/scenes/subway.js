/* JG.scenes.register('subway'): the subway car (plan section 10), Stage 1 greybox-plus by E4.
 *
 * Car interior x -10..10, z -1.6..1.6, floor y = 0, ceiling 2.4. Benches along both walls (seat top 0.45), doors at
 * x = +-6 on both sides, poles and grab rails, ceiling light strips, an ad and route-map band over the windows. The
 * windows look onto two tunnel planes just outside the walls whose CanvasTexture scrolls while motion is 'moving'
 * and switches to the HOP ST station wall when 'stopped'. Roo sits at x = 0 facing +Z, the old lady opposite;
 * lady: 'knitting' shows her knitting basket on the seat beside her.
 * Markers keep the core greybox positions (JG.stubs.SETS.subway). Every camera is inside the car. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var PI = Math.PI;

  var MARKERS = {
    'subway.rooSeat': { pos: [0, 0, -1.2], yaw: 0 }, 'subway.ladySeat': { pos: [0, 0, 1.2], yaw: PI },
    'subway.extraSeat1': { pos: [-3.5, 0, -1.2], yaw: 0 }, 'subway.extraSeat2': { pos: [3.5, 0, 1.2], yaw: PI },
    'subway.cam': { pos: [4.5, 1.5, 0], yaw: -PI / 2 }
  };
  var DEFAULTS = { lady: 'plain', motion: 'moving' };
  var WINDOWS = [[-9.3, -7.1], [-4.9, -2.3], [-1.5, 1.5], [2.3, 4.9], [7.1, 9.3]];
  var DOORS = [[-6.7, -5.3], [5.3, 6.7]];
  var SCROLL = 0.9; // texture repeats per second while moving

  JG.scenes.register('subway', { build: build });

  function build(kit) {
    var SK = JG.setkit, IN = JG.interior, THREE = kit.THREE, C = SK.colours;
    var root = new THREE.Group();
    root.name = 'set-subway';
    var B = SK.builder(kit);
    var WALL = 0xb8bcc4, WALL_D = 0x9aa0aa, CEIL = 0xe6e2d6, FLOOR = 0x6b6f78, SEAT = C.blue, POLE = C.yellow, RAIL = 0xc0c4cc;

    // ---------------------------------------------------------------------------------------------- atlas
    var cells = [
      SK.signCell('route', 'HOP ST  -  56TH & DEBT  -  LEGACY JCT  -  BACKLOG AVE  -  SANDBOX PARK', { w: 1536, h: 96, bg: '#FFF8E7', border: 6, roundel: 'left' }),
      SK.signCell('ad1', 'REFACTOR TODAY.', { w: 512, h: 128, bg: '#FFD21F', sub: 'Your Q4 self says thanks.', border: 8 }),
      SK.signCell('ad2', 'HARD-CODED IDs?', { w: 512, h: 128, bg: '#E0218A', fg: '#FFF8E7', sub: 'We need to talk.', border: 8 }),
      SK.signCell('ad3', 'ONE ADMIN. 3,131 CHANGES.', { w: 512, h: 128, bg: '#1F4FD8', fg: '#FFF8E7', sub: 'Somebody hug that admin.', border: 8 }),
      SK.signCell('ad4', 'DOCUMENTED IT YET?', { w: 512, h: 128, bg: '#FFF8E7', sub: '(neither have we)', border: 8 }),
      SK.signCell('door', 'STAND CLEAR', { w: 256, h: 64, bg: '#111', fg: '#FFD21F', border: 3 }),
      SK.signCell('car', 'CAR 56', { w: 256, h: 96, bg: '#FFF8E7', border: 5, roundel: 'left' })
    ];
    var at = SK.atlas(kit, cells);

    // ---------------------------------------------------------------------------------------------- shell
    B.box(-10.1, -0.2, -1.75, 10.1, 0, 1.75, FLOOR);
    B.box(-9.9, 0, -0.35, 9.9, 0.004, 0.35, 0x5d616a, { hull: false });                 // aisle mat
    B.box(-10.1, 2.4, -1.75, 10.1, 2.55, 1.75, CEIL);
    [-1, 1].forEach(function (side) {
      var z0 = side < 0 ? -1.72 : 1.6, z1 = side < 0 ? -1.6 : 1.72;
      // lower and upper wall bands, piers between windows and doors
      var cuts = WINDOWS.concat(DOORS).sort(function (a, b) { return a[0] - b[0]; });
      var x = -10;
      cuts.forEach(function (cut) { if (cut[0] > x) B.box(x, 0, z0, cut[0], 2.4, z1, WALL); x = cut[1]; });
      if (x < 10) B.box(x, 0, z0, 10, 2.4, z1, WALL);
      WINDOWS.forEach(function (w) { B.box(w[0], 0, z0, w[1], 1.05, z1, WALL); B.box(w[0], 1.95, z0, w[1], 2.4, z1, WALL); });
      DOORS.forEach(function (d) {
        B.box(d[0], 2.1, z0, d[1], 2.4, z1, WALL_D);
        // closed door leaves with windows (the car never opens its doors on camera)
        var zz = side < 0 ? [-1.66, -1.62] : [1.62, 1.66];
        var mid = (d[0] + d[1]) / 2;
        B.box(d[0], 0, zz[0], mid - 0.01, 2.1, zz[1], 0xa3a9b3); B.box(mid + 0.01, 0, zz[0], d[1], 2.1, zz[1], 0xa3a9b3);
        B.box(d[0] + 0.12, 1.2, zz[0] - 0.005, mid - 0.12, 1.85, zz[1] + 0.005, 0x20242c, { hull: false });
        B.box(mid + 0.12, 1.2, zz[0] - 0.005, d[1] - 0.12, 1.85, zz[1] + 0.005, 0x20242c, { hull: false });
        B.box(d[0], 0, zz[0] - 0.01, d[1], 0.03, zz[1] + 0.01, C.yellow, { hull: false });
        B.quad(at, 'door', [mid, 2.25, side < 0 ? -1.598 : 1.598], 0.9, 0.22, side < 0 ? 0 : PI);
      });
      // window frames (thin ink-lined sills)
      WINDOWS.forEach(function (w) {
        var zi = side < 0 ? [-1.62, -1.56] : [1.56, 1.62];
        B.box(w[0], 1.0, zi[0], w[1], 1.06, zi[1], WALL_D); B.box(w[0], 1.94, zi[0], w[1], 2.0, zi[1], WALL_D);
      });
      // benches between the doors and at both ends
      [[-9.7, -6.9], [-5.1, 5.1], [6.9, 9.7]].forEach(function (b) {
        var zs = side < 0 ? [-1.6, -1.1] : [1.1, 1.6], zb = side < 0 ? [-1.6, -1.48] : [1.48, 1.6];
        B.box(b[0], 0, zs[0] + (side < 0 ? 0.08 : 0), b[1], 0.32, zs[1] - (side < 0 ? 0 : 0.08), 0x4a4f5a);
        B.box(b[0], 0.32, zs[0], b[1], 0.45, zs[1], SEAT);
        B.box(b[0], 0.45, zb[0], b[1], 1.0, zb[1], SEAT);
      });
      // ad / route band over the windows
      var zq = side < 0 ? -1.555 : 1.555, yaw = side < 0 ? 0 : PI;
      B.box(-9.8, 2.0, side < 0 ? -1.6 : 1.555, 9.8, 2.34, side < 0 ? -1.555 : 1.6, 0xd9d6cc, { hull: false });
      B.quad(at, 'route', [0, 2.17, zq + (side < 0 ? 0.002 : -0.002)], 4.6, 0.29, yaw);
      [[-7.6, side < 0 ? 'ad1' : 'ad3'], [-3.4, side < 0 ? 'ad2' : 'ad4'], [3.4, side < 0 ? 'ad3' : 'ad1'], [7.6, side < 0 ? 'ad4' : 'ad2']].forEach(function (a) {
        B.quad(at, a[1], [a[0], 2.17, zq + (side < 0 ? 0.002 : -0.002)], 1.25, 0.31, yaw);
      });
    });
    // end walls with the through-door windows
    [-1, 1].forEach(function (e) {
      var x0 = e < 0 ? -10.1 : 10, x1 = e < 0 ? -10 : 10.1;
      B.box(x0, 0, -1.6, x1, 2.4, -0.5, WALL_D); B.box(x0, 0, 0.5, x1, 2.4, 1.6, WALL_D); B.box(x0, 2.0, -0.5, x1, 2.4, 0.5, WALL_D);
      B.box(x0 + (e < 0 ? 0.04 : -0.04), 0, -0.5, x1 + (e < 0 ? 0.04 : -0.04), 2.0, 0.5, 0x7e848f);
      B.box(e < 0 ? -9.99 : 9.98, 1.1, -0.32, e < 0 ? -9.98 : 9.99, 1.8, 0.32, 0x20242c, { hull: false });
      B.quad(at, 'car', [e < 0 ? -9.975 : 9.975, 2.17, 1.05], 0.8, 0.3, e < 0 ? PI / 2 : -PI / 2);
    });
    // poles at the doors, grab rails along the ceiling with straps
    [-6, 6].forEach(function (x) { B.geo(kit.geo.cyl(0.032, 0.032, 2.4, 10), new THREE.Matrix4().makeTranslation(x, 0, 0), POLE); });
    [-8.3, 8.3].forEach(function (x) { B.geo(kit.geo.cyl(0.032, 0.032, 2.4, 10), new THREE.Matrix4().makeTranslation(x, 0, 0), POLE); });
    [-0.75, 0.75].forEach(function (z) {
      B.box(-9.6, 1.98, z - 0.025, 9.6, 2.03, z + 0.025, RAIL);
      for (var x = -9; x <= 9.01; x += 0.9) if (Math.abs(Math.abs(x) - 6) > 0.5) B.box(x - 0.05, 1.8, z - 0.012, x + 0.05, 1.98, z + 0.012, 0x3a3f4a, { hull: false });
    });
    // ceiling light strips (unlit group)
    [-0.5, 0.5].forEach(function (z) { B.box(-9.4, 2.34, z - 0.12, 9.4, 2.4, z + 0.12, 0xfffbe8, { group: 'lights', hull: false }); });

    var meshes = B.build(root);
    if (meshes.lights) { meshes.lights.material = new THREE.MeshBasicMaterial({ vertexColors: true }); }

    // ---------------------------------------------------------------------------------------------- tunnel planes
    var tunnel = IN.tunnelTexture(kit), station = IN.stationTexture(kit);
    tunnel.repeat.set(3, 1); station.repeat.set(2, 1);
    var outMat = new THREE.MeshBasicMaterial({ map: tunnel });
    var outGeo = kit.geo.merge([
      { geometry: new THREE.PlaneGeometry(20, 2.0), matrix: new THREE.Matrix4().makeTranslation(0, 1.45, -2.1) },
      { geometry: new THREE.PlaneGeometry(20, 2.0), matrix: new THREE.Matrix4().makeTranslation(0, 1.45, 2.1).multiply(new THREE.Matrix4().makeRotationY(PI)) }
    ]);
    ['skinIndex', 'skinWeight', 'color'].forEach(function (a) { outGeo.deleteAttribute(a); });
    var outside = new THREE.Mesh(outGeo, outMat);
    outside.name = 'subway-outside';
    root.add(outside);

    // ---------------------------------------------------------------------------------------------- the lady's knitting basket
    var basket = IN.boxesMesh(kit, [
      [-0.2, 0.45, -0.14, 0.2, 0.62, 0.14, 0xb8834e], [-0.21, 0.6, -0.15, 0.21, 0.64, 0.15, 0x9c6d3d]
    ], { name: 'knit-basket' });
    var yarn = new THREE.Mesh(kit.geo.sphere(0.09, 10), kit.mat.toon({ color: C.magenta }));
    yarn.position.set(0.05, 0.7, 0); basket.add(yarn);
    var yarn2 = new THREE.Mesh(kit.geo.sphere(0.07, 10), kit.mat.toon({ color: C.yellow }));
    yarn2.position.set(-0.1, 0.68, 0.03); basket.add(yarn2);
    [yarn, yarn2].forEach(function (y) { var h = new THREE.Mesh(kit.hullSet(y.geometry, SK.T), kit.mat.ink()); h.userData.jgHull = true; y.add(h); });
    var needles = IN.boxesMesh(kit, [[-0.01, 0.62, -0.1, 0.01, 0.64, 0.16, 0xe8dcc0], [0.04, 0.62, -0.12, 0.06, 0.64, 0.14, 0xe8dcc0]], { hull: false });
    basket.add(needles);
    basket.position.set(-0.75, 0, 1.33);
    basket.rotation.y = 0.2;
    root.add(basket);

    var state = Object.assign({}, DEFAULTS), offset = 0, t0 = 0;
    var inst = {
      root: root, lighting: SK.lighting.subway, areas: {},
      markers: MARKERS, zones: {}, paths: {}, walk: {}, camPresets: {}, camColliders: B.colliders(),
      props: { basket: { object: basket, anchors: {} } },
      surfaceAt: function () { return 'hard'; },
      setState: function (patch, sec) {
        Object.assign(state, patch);
        if (patch.lady) basket.visible = patch.lady === 'knitting';
        if (patch.motion) { outMat.map = patch.motion === 'stopped' ? station : tunnel; outMat.needsUpdate = true; }
        return { duration: sec || 0 };
      },
      update: function (dt, t) {
        if (state.motion === 'moving') {
          offset = (offset + dt * SCROLL) % 1;
          tunnel.offset.x = offset;
          // the light strips flicker very slightly as lamps pass (seeded by time, no randomness)
          if (meshes.lights) { var f = 0.94 + 0.06 * Math.max(0, Math.sin((t || 0) * 7.3) * Math.sin((t || 0) * 2.1)); meshes.lights.material.color.setScalar(f); }
        } else if (meshes.lights) meshes.lights.material.color.setScalar(1);
        t0 = t;
      },
      debug: { meshes: meshes, state: function () { return Object.assign({}, state); } }
    };
    inst.setState(Object.assign({}, DEFAULTS), 0);
    return inst;
  }
})();
