/* JG.stubs (plan section 12: "stubs.js covers any unregistered name, so nobody edits another owner's file to stay
 * green"). Classic script; defines functions only and touches neither THREE nor the DOM at load. Every use of a stub
 * is recorded with JG.track.stub (reported by __game.contract().stubHits; Gate G3 wants none).
 *
 *   JG.stubs.install()             at boot, after every script has loaded: fills JG.audio and JG.ui (whole objects or
 *                                  just their missing members) and registers a stub beat for every beat id in
 *                                  JG.CONTRACT / JG.STORY_ORDER that no act file registered
 *   JG.stubs.scene(id, kit)        a greybox SceneInstance providing every marker, zone, path and camPreset that
 *                                  JG.CONTRACT names for that scene (city, subway, office)
 *   JG.stubs.actor(base, kit, {id, instance})   the full Actor API: the real Roo (JG.roo.build) for 'roo', an
 *                                  undressed base body playing library clips for the humans, a capsule if those fail
 *   JG.stubs.shot(id)              a framing of the staged cast for a shot id missing from JG.shots
 *   JG.stubs.audio()  JG.stubs.ui()  JG.stubs.beat(id)   the factories
 *   JG.stubs.STAGES                the canonical stage of every beat as the stubs use it (a reference for E2)
 */
(function () {
  'use strict';
  var JG = window.JG;
  var PI = Math.PI;
  function T(k) { return JG.text(k); }
  function call(where, fn) { try { return fn(); } catch (e) { JG.error(where, e); } }

  // =================================================================================================================
  // Greybox sets
  // =================================================================================================================
  var DAY = { background: 0x9fc3e8, hemi: { sky: 0xffffff, ground: 0x8a8478, intensity: 1.2 }, sun: { color: 0xfff1d6, intensity: 2.2, pos: [-20, 40, 12] }, fog: { color: 0x9fc3e8, near: 70, far: 260 } };
  var SUBWAY_L = { background: 0x2a2f3a, hemi: { sky: 0xfff6e0, ground: 0x6b6a70, intensity: 1.5 }, sun: { color: 0xffffff, intensity: 1.2, pos: [2, 6, 3] }, fog: null };
  var OFFICE_DAY = { background: 0xdfe9f2, hemi: { sky: 0xffffff, ground: 0x8f8a80, intensity: 1.35 }, sun: { color: 0xffffff, intensity: 1.8, pos: [4, 10, 18] }, fog: null };
  var OFFICE_DUSK = { background: 0xf0a878, hemi: { sky: 0xffd9b8, ground: 0x6d5a6a, intensity: 1.2 }, sun: { color: 0xffa060, intensity: 2.0, pos: [10, 6, 30] }, fog: null };
  var BRICK = 0xa86a5a, DUSTY = 0x7d8aa8, PURPLE = 0x8a7d9e, ROAD = 0x55585f, WALK = 0xb9b4aa, ROOF = 0xc9c1b2;

  var SETS = {
    city: {
      lighting: DAY, areas: { roof: { lighting: DAY }, streetA: { lighting: DAY }, streetB: { lighting: DAY } },
      defaults: { area: 'roof', time: 'day', elevatorDoors: 'open' },
      markers: {
        'roof.spawn': { pos: [0, 20, 3], yaw: PI }, 'roof.phoneStand': { pos: [2, 20, 4], yaw: PI },
        'roof.edgeStand': { pos: [0, 20, -6.6], yaw: PI }, 'roof.jumpFrom': { pos: [0, 20.6, -7.9], yaw: PI },
        'streetA.land': { pos: [0, 0, -12], yaw: PI }, 'streetA.spawn': { pos: [0, 0, -12.5], yaw: PI },
        'streetA.stairsTop': { pos: [8, 0, -21.5], yaw: PI }, 'streetA.stairsBottom': { pos: [8, -3, -26], yaw: PI },
        'streetB.subwayExit': { pos: [60, -3, -4.5], yaw: 0 }, 'streetB.spawn': { pos: [60, 0, -0.5], yaw: 0 },
        'streetB.elevatorMark': { pos: [60, 0, 13.7], yaw: PI }
      },
      zones: {
        'roof.edge': { type: 'box', min: [-3, -7.6], max: [3, -5.6] }, 'roof.console': { type: 'box', min: [-5.5, 2.2], max: [-2.5, 3.4] },
        'streetA.stairsTop': { type: 'box', min: [7, -22.5], max: [9, -20.5] },
        'streetB.elevator': { type: 'box', min: [58.5, 11], max: [61.5, 13] }
      },
      paths: {
        'streetA.stairsDown': ['streetA.stairsTop', [8, -1.5, -23.8], 'streetA.stairsBottom'],
        'streetB.subwayUp': ['streetB.subwayExit', [60, -1.5, -2.5], 'streetB.spawn']
      },
      walk: {
        'rooftop-walk': [{ min: [-7.4, -7.5], max: [7.4, 7.4] }],
        'street-subway': [{ min: [-10, -27], max: [14, -10] }],
        'plaza-walk': [{ min: [54, -1], max: [66, 13] }]
      },
      camPresets: {
        'rooftop-walk': { yaw: PI, dist: 5.5, height: 2.8, lookHeight: 1.1, lag: 0.25 },
        'street-subway': { yaw: PI - 0.3, dist: 6, height: 3, lookHeight: 1.1, lag: 0.25 },
        'plaza-walk': { yaw: 0, dist: 6, height: 3, lookHeight: 1.1, lag: 0.25 }
      },
      boxes: [
        [-8, 0, -8, 8, 20, 8, PURPLE], [-8, 20, -8.2, 8, 20.6, -7.7, ROOF], [-8.2, 20, -8, -7.7, 20.6, 8, ROOF],
        [7.7, 20, -8, 8.2, 20.6, 8, ROOF], [-8, 20, 7.7, 8, 20.6, 8.2, ROOF], [-8, 19.9, -8, 8, 20, 8, ROOF],
        [4, 20, 3, 6, 23, 5, BRICK], [1.2, 20, 4.6, 2.8, 20.45, 5.6, 0xE0218A],
        // ground with two stair holes
        [-30, -0.1, -45, 7, 0, 30, ROAD], [9, -0.1, -45, 59, 0, 30, ROAD], [61, -0.1, -45, 90, 0, 30, ROAD],
        [7, -0.1, -45, 9, 0, -27, ROAD], [7, -0.1, -21, 9, 0, 30, ROAD], [59, -0.1, -45, 61, 0, -5.5, ROAD], [59, -0.1, -0.8, 61, 0, 30, ROAD],
        [7, -3.2, -27, 9, -3, -21, 0x333333], [59, -3.2, -5.5, 61, -3, -0.8, 0x333333],
        [6.8, 0, -27, 7, 1, -21, 0xFFD21F], [9, 0, -27, 9.2, 1, -21, 0xFFD21F],
        [-12, 0, -8, -9, 0.15, 8, WALK], [9, 0, -8, 12, 0.15, 8, WALK],
        // skyline
        [-30, 0, -45, -12, 30, -32, DUSTY], [12, 0, -48, 30, 40, -32, BRICK], [20, 0, -20, 30, 25, -9, PURPLE], [-26, 0, -20, -13, 18, -9, DUSTY],
        [40, 0, 20, 50, 35, 30, DUSTY], [70, 0, -12, 82, 45, 8, PURPLE], [38, 0, -24, 52, 20, -10, BRICK],
        // Fortune 500 building with the lobby recess (doors are separate)
        [52, 0, 14.5, 68, 60, 26, 0x5b6f99], [52, 0, 13, 58.5, 4, 14.5, 0x5b6f99], [61.5, 0, 13, 68, 4, 14.5, 0x5b6f99], [58.5, 2.6, 13, 61.5, 4, 14.5, 0x5b6f99],
        [58.5, 0, 14.3, 61.5, 2.6, 14.5, 0x9a9488]
      ],
      surface: 'hard'
    },
    subway: {
      lighting: SUBWAY_L, defaults: { lady: 'plain', motion: 'moving' },
      markers: {
        'subway.rooSeat': { pos: [0, 0, -1.2], yaw: 0 }, 'subway.ladySeat': { pos: [0, 0, 1.2], yaw: PI },
        'subway.extraSeat1': { pos: [-3.5, 0, -1.2], yaw: 0 }, 'subway.extraSeat2': { pos: [3.5, 0, 1.2], yaw: PI },
        'subway.cam': { pos: [4.5, 1.5, 0], yaw: -PI / 2 }
      },
      zones: {}, paths: {}, walk: {}, camPresets: {},
      boxes: [
        [-10, -0.1, -1.6, 10, 0, 1.6, 0x6b6f78], [-10, 2.4, -1.6, 10, 2.5, 1.6, 0xd9d6cc],
        [-10, 0, -1.7, 10, 2.4, -1.6, 0xb8bcc4], [-10, 0, 1.6, 10, 2.4, 1.7, 0xb8bcc4],
        [-10.1, 0, -1.6, -10, 2.4, 1.6, 0x9aa0aa], [10, 0, -1.6, 10.1, 2.4, 1.6, 0x9aa0aa],
        [-9, 0, -1.6, 9, 0.45, -1.1, 0x1F4FD8], [-9, 0, 1.1, 9, 0.45, 1.6, 0x1F4FD8],
        [-9, 1.1, -1.6, 9, 1.9, -1.58, 0x20242c], [-9, 1.1, 1.58, 9, 1.9, 1.6, 0x20242c],
        [-6, 0, -0.03, -5.94, 2.4, 0.03, 0xFFD21F], [6, 0, -0.03, 6.06, 2.4, 0.03, 0xFFD21F]
      ],
      surface: 'hard'
    },
    office: {
      lighting: OFFICE_DAY, areas: {},
      defaults: { floor: 56, doors: 'open', mood: 'before', monitor: 'off', window: 'intact', light: 'day' },
      markers: {
        'office.elevatorMark': { pos: [0, 0, -1.2], yaw: 0 }, 'office.elevatorOut': { pos: [0, 0, 1.6], yaw: 0 },
        'office.opsStart': { pos: [-5, 0, 12], yaw: PI }, 'office.opsPlea': { pos: [0, 0, 3.2], yaw: PI },
        'office.hug.roo': { pos: [0, 0, 2.29], yaw: 0 }, 'office.hug.ops': { pos: [0, 0, 2.71], yaw: PI },
        'office.spawn': { pos: [0, 0, 2.2], yaw: 0 }, 'office.deskStand': { pos: [5, 0, 13.6], yaw: 0 },
        'office.chair': { pos: [5, 0, 14.5], yaw: 0 }, 'office.execStand': { pos: [2.6, 0, 14.4], yaw: PI / 2 },
        'office.windowRun': { pos: [5, 0, 19.5], yaw: 0 }, 'office.windowHole': { pos: [5, 1.2, 21], yaw: 0 },
        'office.extraDesk1': { pos: [-5, 0, 9], yaw: 0 }, 'office.extraDesk2': { pos: [-5, 0, 14], yaw: 0 },
        // the office life pass (2026-11-25, scenes/office.js and office-props.js): extra2 at the printer, the island's
        // east seat, the stand marks of office-walk's three stations and their zones
        'office.extraStand': { pos: [8.95, 0, 3.95], yaw: PI / 2 }, 'office.extraDesk3': { pos: [1.11, 0, 9.5], yaw: -PI / 2 },
        'office.scanStand': { pos: [3.0, 0, 4.15], yaw: 0 }, 'office.coolerStand': { pos: [-0.42, 0, 7.61], yaw: 0 },
        'office.coffeeStand': { pos: [8.6, 0, 2.32], yaw: PI / 2 }
      },
      zones: { 'office.desk': { type: 'box', min: [4, 12.8], max: [6, 14.6] },
        'office.scanner': { type: 'box', min: [2.55, 3.70], max: [3.45, 4.30] }, 'office.cooler': { type: 'box', min: [-0.90, 7.10], max: [0.05, 7.81] },
        'office.coffee': { type: 'box', min: [8.25, 1.95], max: [8.78, 2.75] } },
      paths: {
        'office.toHug': ['office.opsStart', [-2, 0, 6], 'office.opsPlea'],
        'office.windowRun': ['office.chair', [5, 0, 17], 'office.windowRun', 'office.windowHole']
      },
      walk: { 'office-walk': [{ min: [-9, 0.6], max: [9, 20.5] }] },
      camPresets: { 'office-walk': { yaw: 0.35, dist: 5.5, height: 2.8, lookHeight: 1.1, lag: 0.25 } },
      boxes: [
        [-10, -0.1, -3, 10, 0, 22, 0x7f8c9a], [-10, 3.2, 0, 10, 3.3, 22, 0xeeeeea],
        [-10.1, 0, 0, -10, 3.2, 22, 0xd8d2c4], [10, 0, 0, 10.1, 3.2, 22, 0xd8d2c4], [-10, 0, 22, 10, 3.2, 22.1, 0xd8d2c4],
        [-10, 0, -0.1, -1.2, 3.2, 0.1, 0xd8d2c4], [1.2, 0, -0.1, 10, 3.2, 0.1, 0xd8d2c4], [-1.2, 2.5, -0.1, 1.2, 3.2, 0.1, 0xd8d2c4],
        [-1.3, 0, -2.4, 1.3, 2.6, -2.3, 0xb09a6a], [-1.3, 0, -2.4, -1.2, 2.6, 0, 0xb09a6a], [1.2, 0, -2.4, 1.3, 2.6, 0, 0xb09a6a], [-1.3, 2.5, -2.4, 1.3, 2.6, 0, 0xb09a6a],
        [4, 0, 15, 6, 0.75, 16, 0xc9a26b], [4.6, 0, 14.2, 5.4, 0.48, 14.8, 0x333333],
        [-6, 0, 9.5, -4, 0.75, 10.5, 0xc9a26b], [-6, 0, 14.5, -4, 0.75, 15.5, 0xc9a26b], [-6, 0, 3.5, -4, 0.75, 4.5, 0xc9a26b],
        [-10, 0, 20.9, 2, 3.2, 21.1, 0x8899aa], [8, 0, 20.9, 10, 3.2, 21.1, 0x8899aa], [2, 0, 20.9, 8, 0.3, 21.1, 0x8899aa], [2, 2.8, 20.9, 8, 3.2, 21.1, 0x8899aa]
      ],
      surface: 'carpet'
    }
  };

  function buildScene(id, kit) {
    var THREE = kit.THREE, S = SETS[id];
    if (!S) { S = { lighting: DAY, markers: {}, zones: {}, paths: {}, walk: {}, camPresets: {}, boxes: [[-10, -0.1, -10, 10, 0, 10, ROAD]], defaults: {} }; }
    // provide any contract name the table lacks (a marker at the origin, a small zone around it), so nothing is missing
    var C = JG.CONTRACT || {};
    function fill(kind, make) { ((C[kind] && C[kind][id]) || []).forEach(function (n) { if (!S[kind][n]) S[kind][n] = make(n); }); }
    fill('markers', function () { return { pos: [0, 0, 0], yaw: 0 }; });
    fill('zones', function () { return { type: 'box', min: [-1, -1], max: [1, 1] }; });
    fill('paths', function () { return [[0, 0, 0]]; });
    (C.camPresets || []).forEach(function (b) { if (S.walk[b] && !S.camPresets[b]) S.camPresets[b] = { yaw: 0, dist: 5, height: 2.6, lookHeight: 1.1, lag: 0.25 }; });

    var root = new THREE.Group();
    root.name = 'greybox-' + id;
    var parts = S.boxes.map(function (b) {
      var sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2];
      var m = new THREE.Matrix4().makeTranslation((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      return { geometry: new THREE.BoxGeometry(sx, sy, sz), matrix: m, color: b[6] };
    });
    var geo = kit.geo.merge(parts);
    parts.forEach(function (p) { p.geometry.dispose(); });
    geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
    var mesh = new THREE.Mesh(geo, kit.mat.vertexToon());
    mesh.name = 'greybox-static';
    root.add(mesh);
    // marker pads (tiny, flat) so the layout reads in screenshots
    var padGeo = new THREE.CircleGeometry(0.18, 12).rotateX(-PI / 2), padMat = kit.mat.flat({ color: 0xE0218A });
    Object.keys(S.markers).forEach(function (n) {
      var mk = S.markers[n];
      if (/cam$/.test(n)) return;
      var pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(mk.pos[0], mk.pos[1] + 0.01, mk.pos[2]);
      root.add(pad);
    });

    var state = Object.assign({}, S.defaults), dyn = {};
    function box(x0, y0, z0, x1, y1, z1, color, mat) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat || kit.mat.toon({ color: color }));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      root.add(m);
      return m;
    }
    var props = {};
    if (id === 'city') {
      dyn.doorL = box(58.5, 0, 12.9, 60, 2.5, 13.05, 0, kit.mat.toon({ color: 0xc8b070 }));
      dyn.doorR = box(60, 0, 12.9, 61.5, 2.5, 13.05, 0, kit.mat.toon({ color: 0xc8b070 }));
      dyn.sign = signMesh(kit, 'FORTUNE 500', 3.2, 0.5); dyn.sign.position.set(60, 3.3, 12.95); root.add(dyn.sign);
      dyn.stairSign = signMesh(kit, 'HOP ST', 1.6, 0.4); dyn.stairSign.position.set(8, 1.6, -20.9); root.add(dyn.stairSign);
    } else if (id === 'subway') {
      dyn.knitting = box(0.1, 0.45, 0.9, 0.35, 0.55, 1.05, 0xE0218A);
    } else if (id === 'office') {
      dyn.doorL = box(-1.2, 0, -0.05, 0, 2.5, 0.05, 0, kit.mat.toon({ color: 0xa9a9b0 }));
      dyn.doorR = box(0, 0, -0.05, 1.2, 2.5, 0.05, 0, kit.mat.toon({ color: 0xa9a9b0 }));
      dyn.display = canvasPlane(kit, 0.8, 0.4, 128, 64);
      dyn.display.mesh.position.set(0, 2.85, 0.12); root.add(dyn.display.mesh);
      dyn.monitor = canvasPlane(kit, 0.9, 0.56, 320, 200);
      dyn.monitor.mesh.position.set(5, 1.08, 15.38); dyn.monitor.mesh.rotation.y = PI; root.add(dyn.monitor.mesh);
      box(4.52, 0.75, 15.42, 5.48, 1.4, 15.5, 0x222222);
      var glassMat = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.35, depthWrite: false });
      dyn.glass = box(2, 0.3, 20.97, 8, 2.8, 21.03, 0, glassMat);
      props.monitor = { object: dyn.monitor.mesh, anchors: {} };
      props.window = { object: dyn.glass, anchors: {} };
    }
    var floorShown = null, monitorT = 0, floorVal = state.floor || 1;
    function drawDisplay() {
      var f = Math.round(floorVal);
      if (f === floorShown || !dyn.display) return;
      floorShown = f;
      dyn.display.draw(function (ctx, w, h) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#FFD21F'; ctx.font = 'bold 44px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(f), w / 2, h / 2 + 2); });
    }
    function drawMonitor() {
      if (!dyn.monitor) return;
      dyn.monitor.draw(function (ctx, w, h) {
        var ui = JG.ui;
        if (state.monitor !== 'off' && ui && ui.radar && ui.radar.drawMonitor) { try { ui.radar.drawMonitor(ctx, w, h, state.monitor); return; } catch (e) { JG.error('radar.drawMonitor', e); } }
        ctx.fillStyle = state.monitor === 'off' ? '#0d0f14' : '#ffffff'; ctx.fillRect(0, 0, w, h);
      });
    }
    function slideDoors(open, sec, xl, xr) {
      [[dyn.doorL, open ? xl[1] : xl[0]], [dyn.doorR, open ? xr[1] : xr[0]]].forEach(function (d) {
        if (!d[0]) return;
        if (sec > 0) JG.clock.tween(d[0].position, { x: d[1] }, sec, 'inOutQuad', 'beat'); else d[0].position.x = d[1];
      });
    }
    var inst = {
      root: root, lighting: S.lighting, areas: S.areas || {}, markers: S.markers, zones: S.zones, paths: S.paths, walk: S.walk,
      camPresets: S.camPresets, props: props, stub: true,
      surfaceAt: function (x, z) { return id === 'office' && z > 0.2 ? 'carpet' : 'hard'; },
      setState: function (patch, sec) {
        sec = sec || 0;
        Object.assign(state, patch);
        if (id === 'city' && patch.elevatorDoors) slideDoors(patch.elevatorDoors === 'open', sec, [59.25, 57.8], [60.75, 62.2]);
        if (id === 'office') {
          if (patch.doors) slideDoors(patch.doors === 'open', sec, [-0.6, -1.85], [0.6, 1.85]);
          if (patch.floor !== undefined) { if (sec > 0) JG.clock.tween({ get v() { return floorVal; }, set v(x) { floorVal = x; } }, { v: patch.floor }, sec, 'linear', 'beat'); else floorVal = patch.floor; }
          if (patch.window && dyn.glass) dyn.glass.visible = patch.window !== 'broken';
          if (patch.light || patch.mood) JG.world && JG.world.current === inst && applyOfficeLight();
          if (patch.monitor) drawMonitor();
        }
        if (id === 'subway' && patch.lady && dyn.knitting) dyn.knitting.visible = patch.lady === 'knitting';
        return { duration: sec };
      },
      update: function (dt) {
        drawDisplay();
        monitorT += dt;
        if (monitorT >= 0.1) { monitorT = 0; if (state.monitor && state.monitor !== 'off') drawMonitor(); }
      }
    };
    function applyOfficeLight() {
      var L = state.light === 'dusk' ? OFFICE_DUSK : OFFICE_DAY;
      inst.lighting = L;
      var s = JG.world.scene;
      s.background = new THREE.Color(L.background);
      s.traverse(function (o) {
        if (o.isHemisphereLight) { o.color.set(L.hemi.sky); o.groundColor.set(L.hemi.ground); o.intensity = L.hemi.intensity; }
        if (o.isDirectionalLight) { o.color.set(L.sun.color); o.intensity = L.sun.intensity; o.position.fromArray(L.sun.pos); }
      });
    }
    if (id === 'office') JG.on('scene', function (sid) { if (sid === 'office') applyOfficeLight(); });
    inst.setState(Object.assign({}, S.defaults), 0);
    drawMonitor();
    return inst;
  }
  function canvasPlane(kit, w, h, pw, ph) {
    var THREE = kit.THREE, cv = document.createElement('canvas');
    cv.width = pw; cv.height = ph;
    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    return { mesh: mesh, draw: function (fn) { fn(cv.getContext('2d'), pw, ph); tex.needsUpdate = true; } };
  }
  function signMesh(kit, text, w, h) {
    var THREE = kit.THREE, tex = kit.tex.sign ? kit.tex.sign(text, { w: 512, h: Math.round(512 * h / w) }) : null;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0xFFD21F, side: THREE.DoubleSide }));
  }

  // =================================================================================================================
  // Actors
  // =================================================================================================================
  var BODY = { exec: { from: 'body-female', height: 1.74, color: 0x1F4FD8 }, ops: { from: 'body-male', height: 1.68, color: 0xE6E1D3 },
    oldlady: { from: 'body-female', height: 1.55, color: 0xB9A3D9 }, extra: { from: 'body-male', height: 1.72, color: 0x9AA3AD } };
  var EXTRA_TINTS = [0x9AA3AD, 0x8FB39A, 0xC9A27E, 0xA59ACF];
  var CAPSULE = { roo: { height: 1.8, color: 0xEBA046 }, exec: BODY.exec, ops: BODY.ops, oldlady: BODY.oldlady, extra: BODY.extra };

  function contractMap() {
    var out = {};
    ['clips-ual1', 'clips-ual2'].forEach(function (n) {
      if (!JG.assets.has(n)) return;
      var ud = JG.assets.get(n).gltf.scene.userData || {};
      Object.assign(out, ud.contract || {});
    });
    return out;
  }
  function libClip(name) {
    var libs = ['clips-ual1', 'clips-ual2'];
    for (var i = 0; i < libs.length; i++) {
      if (!JG.assets.has(libs[i])) continue;
      var c = JG.assets.get(libs[i]).gltf.animations.find(function (a) { return a.name === name; });
      if (c) return c;
    }
    return null;
  }
  var cmap = null;
  /** contract clip id -> library clip name (the config's map, carried in the clip GLBs' scene extras) */
  function libraryNameFor(base, clipId) {
    if (!cmap) cmap = contractMap();
    var key = base + '.' + clipId;
    if (cmap[key]) return { name: cmap[key] };
    var DEF = { idle: 'Idle_Loop', walk: base === 'exec' ? 'Walk_Formal_Loop' : 'Walk_Loop', run: 'Jog_Fwd_Loop', rest: 'Idle_Loop' };
    if (DEF[clipId]) return { name: DEF[clipId] };
    if (libClip(clipId)) return { name: clipId };
    var n = clipId.toLowerCase();
    var f = /seat|sit|type|knit|chair|purse|reader|wink/.test(n) ? 'Sitting_Idle_Loop' : /run|dive|panic/.test(n) ? 'Sprint_Loop' :
      /land/.test(n) ? 'NinjaJump_Land' : /jump|fall/.test(n) ? 'Jump_Loop' : /talk|plead|thank|disbelief/.test(n) ? 'Idle_Talking_Loop' :
      /arms|cross/.test(n) ? 'Idle_FoldArms_Loop' : 'Idle_Loop';
    JG.track.stub('clip', key, 'library ' + f);
    return { name: f, stub: true };
  }
  JG.stubs = JG.stubs || {};
  JG.stubs.libraryNameFor = libraryNameFor;

  function propMesh(kit, name) {
    var THREE = kit.THREE, g, c;
    if (name === 'phone') { g = new THREE.BoxGeometry(0.07, 0.14, 0.012); c = 0x222222; }
    else if (name === 'headphones') { g = new THREE.TorusGeometry(0.13, 0.025, 6, 16, PI); c = 0xE0218A; }
    else if (name === 'handbag') { g = new THREE.BoxGeometry(0.28, 0.2, 0.1); c = 0x7a3b5a; }
    else { g = new THREE.BoxGeometry(0.2, 0.08, 0.12); c = 0xE0218A; }
    var m = new THREE.Mesh(g, kit.mat.toon({ color: c }));
    var h = new THREE.Mesh(kit.hull(g, 0.008), kit.mat.ink());
    m.add(h);
    m.name = 'prop-' + name;
    return m;
  }

  /** shared Actor API shell; impl supplies playClip, poseFn, mouth, express, afterUpdate, headBone */
  function makeActor(kit, o) {
    var THREE = kit.THREE, root = new THREE.Group();
    root.name = 'actor-' + o.id;
    var listeners = [], props = {}, look = { target: null, w: 0 }, loco = 0, quality = 'high';
    var UP = new THREE.Vector3(0, 1, 0), tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), hp = new THREE.Vector3(), tp = new THREE.Vector3();
    var a = {
      id: o.id, root: root, height: o.height, radius: o.radius || 0.3, anchors: {}, kind: o.kind,
      update: function (dt, ctx) {
        if (a._update) a._update(dt, ctx, loco);
        if (a.headBone && (look.target || look.w > 0.01)) applyLook(dt);
      },
      reset: function () {
        loco = 0; look.target = null; look.w = 0;
        Object.keys(props).forEach(function (p) { if (props[p].parent) props[p].parent.remove(props[p]); });
        if (a._reset) a._reset();
      },
      teleport: function () { if (a._teleport) a._teleport(); },
      setQuality: function (tier) { quality = tier; if (a._quality) a._quality(tier); },
      setLocomotion: function (speed) { loco = speed || 0; },
      pose: function (name, blend) { if (a._pose) a._pose(name, blend === undefined ? 0.2 : blend); },
      play: function (clip, opts) { return a._play ? a._play(clip, opts || {}) : { duration: 1, stop: function () {} }; },
      pulse: function (name) { JG.track.stub('pulse', o.base + '.' + name); },
      lookAt: function (target) { look.target = target || null; },
      setExpression: function (name) { a.expression = name; if (a._express) a._express(name); else JG.track.stub('expression', o.base + '.' + name); },
      setMouth: function (level) { if (a._mouth) a._mouth(level); },
      attach: function (prop, anchorName) {
        var m = props[prop];
        if (anchorName === false || anchorName === null) { if (m && m.parent) m.parent.remove(m); return; }
        if (!m) m = props[prop] = propMesh(kit, prop);
        var anchor = a.anchors[anchorName] || a.anchors[{ head: 'head', hand: 'handR' }[anchorName]] || (prop === 'headphones' ? a.anchors.head : a.anchors.handR) || root;
        anchor.add(m);
        anchor.updateMatrixWorld(true);
        var ws = anchor.getWorldScale(new THREE.Vector3());
        m.scale.set(1 / (ws.x || 1), 1 / (ws.y || 1), 1 / (ws.z || 1));
        m.position.set(0, prop === 'headphones' ? 0.06 / (ws.y || 1) : 0, 0);
        emit('attach');
      },
      setCape: function (mode) { a.capeMode = mode; },
      on: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
      debug: function () { return { kind: o.kind, actions: a._actions ? a._actions() : [], expression: a.expression || null }; }
    };
    function emit(ev) { listeners.slice().forEach(function (fn) { try { fn(ev); } catch (e) { JG.error('actor event', e); } }); }
    a._emit = emit;
    function applyLook(dt) {
      look.w += ((look.target ? 1 : 0) - look.w) * Math.min(1, dt * 6);
      var tgt = look.target || look.last;
      if (!tgt) return;
      look.last = tgt;
      var head = a.headBone;
      root.updateMatrixWorld(true);
      head.getWorldPosition(hp);
      if (tgt.isVector3) tp.copy(tgt); else tgt.getWorldPosition(tp);
      var yaw = Math.atan2(tp.x - hp.x, tp.z - hp.z) - root.rotation.y;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      var lim = o.lookLimit || 1.0;
      yaw = Math.max(-lim, Math.min(lim, yaw)) * look.w;
      tq.setFromAxisAngle(UP, yaw);
      head.parent.getWorldQuaternion(pq);
      var q = pq.clone().invert().multiply(tq).multiply(pq);
      head.quaternion.premultiply(q);
    }
    return a;
  }

  /** mixer-driven actor over a skinned rig (Roo port or a base body) */
  function mixerActor(kit, o) {
    var THREE = kit.THREE, a = makeActor(kit, o);
    a.root.add(o.model);
    var mixer = new THREE.AnimationMixer(o.animRoot);
    var actions = {}, current = null, explicit = null, locoAct = null, prevPh = 0;
    function action(id) {
      if (actions[id]) return actions[id];
      var lib = libraryNameFor(o.base, id), clip = null;
      try { clip = JG.clips.library(lib.name, o.rig); } catch (e) { JG.warn('clip-lib:' + lib.name, 'library clip ' + lib.name + ' unavailable: ' + e.message); }
      if (!clip) return null;
      var act = mixer.clipAction(clip);
      act.__id = id; act.__lib = lib.name;
      return (actions[id] = act);
    }
    function fadeTo(act, fade, loop) {
      if (!act) return;
      act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      act.clampWhenFinished = !loop;
      if (current === act) { if (!loop) { act.reset().play(); } return; }
      act.enabled = true;
      act.reset();
      if (fade > 0 && current) { act.setEffectiveWeight(1); act.fadeIn(fade).play(); current.fadeOut(fade); }
      else { mixer.stopAllAction(); act.setEffectiveWeight(1); act.play(); }
      current = act;
    }
    a._play = function (clip, opts) {
      if (opts.additive) { JG.track.stub('additive', o.base + '.' + clip); return { duration: 1, stop: function () {} }; }
      if (o.onClip) o.onClip(true);
      var act = action(clip);
      if (!act) return { duration: 1, stop: function () {} };
      act.timeScale = opts.speed || 1;
      var loop = opts.loop !== undefined ? !!opts.loop : /_Loop$/.test(act.__lib);
      explicit = { act: act, loop: loop };
      fadeTo(act, opts.fade === undefined ? 0.2 : opts.fade, loop);
      var mine = explicit;
      return { duration: act.getClip().duration, stop: function (f) { if (explicit === mine) { explicit = null; fadeTo(action('idle'), f === undefined ? 0.2 : f, true); } } };
    };
    a._pose = function (name, blend) {
      if (o.poseFn && o.poseFn(name)) { mixer.stopAllAction(); current = null; explicit = { pose: name }; return; }
      var C = JG.CONTRACT, isClip = C && C.clips[o.base] && C.clips[o.base].indexOf(name) >= 0;
      if (!isClip && name !== 'idle') JG.track.stub('pose', o.base + '.' + name, 'idle');
      a._play(isClip ? name : 'idle', { loop: true, fade: blend });
    };
    a._update = function (dt, ctx, loco) {
      var want = null;
      if (loco > 0.05 && !(explicit && explicit.pose)) {
        var run = loco > 2.8;
        want = action(run ? 'run' : 'walk');
        if (want) want.timeScale = Math.max(0.5, Math.min(2.2, loco / (run ? 3.6 : 1.5)));
        if (want !== current) { if (o.onClip) o.onClip(true); fadeTo(want, 0.15, true); }
        locoAct = want;
      } else if (locoAct && current === locoAct) {
        locoAct = null;
        if (explicit && explicit.act) fadeTo(explicit.act, 0.2, explicit.loop); else if (explicit && explicit.pose) { a._pose(explicit.pose, 0); } else fadeTo(action('idle'), 0.2, true);
      }
      mixer.update(dt);
      if (o.afterMixer) o.afterMixer();
      if (locoAct && current === locoAct) {
        var d = locoAct.getClip().duration || 1, ph = (locoAct.time % d) / d;
        if (prevPh < 0.5 && ph >= 0.5) a._emit('footR');
        if (ph < prevPh) a._emit('footL');
        prevPh = ph;
      }
    };
    a._reset = function () {
      mixer.stopAllAction(); current = null; explicit = null; locoAct = null;
      if (o.onReset) o.onReset();
      fadeTo(action('idle'), 0, true);
      mixer.update(0);
    };
    a._actions = function () {
      // one AnimationAction can serve several contract ids (stub fallbacks share a library clip): list each once
      var seen = [], out = [];
      Object.keys(actions).forEach(function (k) {
        var x = actions[k];
        if (seen.indexOf(x) >= 0 || !x.isRunning() || x.getEffectiveWeight() <= 0.01) return;
        seen.push(x); out.push(x.__lib);
      });
      return out.sort();
    };
    a.mixer = mixer;
    return a;
  }

  function rooActor(kit, info) {
    var THREE = kit.THREE, port = JG.roo.build(THREE, kit);
    var B = port.rig.byName;
    function bone() { for (var i = 0; i < arguments.length; i++) if (B[arguments[i]]) return B[arguments[i]]; return port.root; }
    var capeOn = true;
    function cape(on) { capeOn = on; if (port.cape) port.cape.visible = on; if (port.capeInk) port.capeInk.visible = on; }
    var a = mixerActor(kit, {
      id: info.id, base: 'roo', kind: 'roo-port', height: 1.8, radius: 0.35, model: port.root, animRoot: port.root, rig: port.rig, lookLimit: 1.1,
      poseFn: function (name) { if ((port.poses || []).indexOf(name) < 0) return false; port.pose(name); cape(true); return true; },
      onClip: function (playing) { if (playing && capeOn) cape(false); },
      afterMixer: function () { if (!capeOn && port.holdTail) port.holdTail(); },
      onReset: function () { port.pose('rest'); cape(true); }
    });
    a.anchors = { head: bone('Head'), eyes: bone('Head'), earR: bone('Head'), chest: bone('spine_03'), backUpper: bone('spine_03', 'spine_02'),
      handL: bone('hand_l'), handR: bone('hand_r'), hip: bone('pelvis'), seat: bone('pelvis') };
    Object.keys(port.anchors || {}).forEach(function (k) { if (port.anchors[k] && port.anchors[k].isObject3D) a.anchors[k] = port.anchors[k]; });
    a.headBone = B.Head || null;
    a.port = port;
    return a;
  }

  function bodyActor(kit, base, info) {
    var THREE = kit.THREE, spec = BODY[base] || BODY.extra;
    var g = kit.gltf(spec.from);
    var tint = base === 'extra' ? EXTRA_TINTS[(info.instance || 0) % EXTRA_TINTS.length] : spec.color;
    kit.restyle(g.scene, { color: tint, hull: true, thickness: 0.012 });
    var srcH = g.userData.height || 1.7, s = spec.height / srcH;
    var model = new THREE.Group();
    model.add(g.scene);
    model.scale.setScalar(s);
    var byName = {};
    g.scene.traverse(function (n) { if (n.isBone) byName[n.name] = n; });
    var rig = { byName: byName, legRatio: g.userData.hipsScale || 1 };
    var a = mixerActor(kit, { id: info.id, base: base, kind: 'base-body', height: spec.height, radius: 0.3, model: model, animRoot: g.scene, rig: rig, lookLimit: base === 'exec' ? 0.61 : 1.0 });
    function b(n) { return byName[n] || g.scene; }
    a.anchors = { head: b('Head'), eyes: b('Head'), earR: b('Head'), chest: b('spine_03'), backUpper: b('spine_03'), handL: b('hand_l'), handR: b('hand_r'), hip: b('pelvis'), seat: b('pelvis') };
    a.headBone = byName.Head || null;
    a._quality = function (tier) { if (base === 'extra') g.scene.traverse(function (n) { if (n.userData.jgHull) n.visible = tier !== 'low'; }); };
    return a;
  }

  function capsuleActor(kit, base, info) {
    var THREE = kit.THREE, spec = CAPSULE[base] || CAPSULE.extra, h = spec.height, r = 0.26;
    var a = makeActor(kit, { id: info.id, base: base, kind: 'capsule', height: h, radius: r });
    var body = new THREE.Group();
    var geo = new THREE.CapsuleGeometry(r, h - 2 * r, 4, 12).translate(0, h / 2, 0);
    var mesh = new THREE.Mesh(geo, kit.mat.toon({ color: spec.color }));
    mesh.add(new THREE.Mesh(kit.hull(geo, 0.015), kit.mat.ink()));
    var nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), kit.mat.toon({ color: 0x111111 }));
    nose.position.set(0, h - 0.25, r);
    var mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.02), kit.mat.flat({ color: 0x111111 }));
    mouth.position.set(0, h - 0.36, r + 0.01);
    body.add(mesh); body.add(nose); body.add(mouth);
    a.root.add(body);
    var head = new THREE.Object3D(); head.position.set(0, h - 0.2, 0); body.add(head);
    var hand = new THREE.Object3D(); hand.position.set(r + 0.05, h * 0.5, 0.1); body.add(hand);
    var chest = new THREE.Object3D(); chest.position.set(0, h * 0.7, r); body.add(chest);
    a.anchors = { head: head, eyes: head, earR: head, chest: chest, backUpper: chest, handL: hand, handR: hand, hip: body, seat: body };
    var seated = false, t = 0, cur = 'idle';
    a._play = function (clip, opts) {
      var lib = libraryNameFor(base, clip), src = libClip(lib.name);
      cur = clip;
      seated = /Sitting/.test(lib.name);
      return { duration: src ? src.duration : 1.2, stop: function () { if (cur === clip) { cur = 'idle'; seated = false; } } };
    };
    a._pose = function (name) { seated = /seat|sit/i.test(name); cur = name; JG.track.stub('pose', base + '.' + name, 'capsule'); };
    a._mouth = function (l) { mouth.scale.y = 1 + 4 * (l || 0); };
    a._update = function (dt, ctx, loco) {
      t += dt;
      body.scale.y = seated ? 0.62 : 1;
      body.position.y = loco > 0.05 ? Math.abs(Math.sin(t * 9)) * 0.05 : 0;
      if (loco > 0.05) { var ph = (t * 9 / PI) % 2; if (ph < a._ph) a._emit('footL'); a._ph = ph; }
    };
    a._reset = function () { seated = false; cur = 'idle'; body.scale.y = 1; mouth.scale.y = 1; };
    a._actions = function () { return [cur]; };
    a._ph = 0;
    return a;
  }

  JG.stubs.actor = function (base, kit, info) {
    info = info || {};
    var id = info.id || base, a = null;
    JG.track.stub('actor', base);
    if (base === 'roo' && JG.roo && JG.rig && JG.assets.has('body-male')) {
      try { a = rooActor(kit, { id: id }); } catch (e) { JG.error('stub roo (JG.roo.build)', e); a = null; }
    }
    if (!a && base !== 'roo' && BODY[base] && JG.assets.has(BODY[base].from) && JG.clips && JG.clips.library) {
      try { a = bodyActor(kit, base, info); } catch (e) { JG.error('stub body ' + base, e); a = null; }
    }
    if (!a) a = capsuleActor(kit, base, info);
    a.base = base;
    a.reset();
    return a;
  };

  // =================================================================================================================
  // Shots
  // =================================================================================================================
  JG.stubs.shot = function (id) {
    JG.track.stub('shot', String(id));
    return function () {
      var V = window.THREE.Vector3, ids = JG.world.castIds(), lead = JG.world.staged('roo') ? JG.world.actor('roo') : (ids.length ? JG.world.actor(ids[0]) : null);
      if (!lead) return { pos: [0, 2, 6], look: [0, 1, 0], fov: 40 };
      var c = new V(), n = 0;
      ids.forEach(function (k) { c.add(JG.world.actor(k).root.getWorldPosition(new V())); n++; });
      c.multiplyScalar(1 / Math.max(1, n));
      var spread = 0;
      ids.forEach(function (k) { spread = Math.max(spread, JG.world.actor(k).root.getWorldPosition(new V()).distanceTo(c)); });
      var yaw = lead.root.rotation.y + 0.5, dist = Math.min(9, Math.max(3.4, spread * 1.8 + 2.8));
      var look = new V(c.x, c.y + 1.1, c.z);
      var inst = JG.world.current, cm = inst && inst.markers && inst.markers[JG.world.currentId + '.cam'];
      if (cm) return { pos: cm.pos.slice(), look: look.toArray(), fov: 50 };
      return { pos: [look.x + Math.sin(yaw) * dist, look.y + 0.45, look.z + Math.cos(yaw) * dist], look: look.toArray(), fov: 40 };
    };
  };

  // =================================================================================================================
  // Audio: silent, full API (plan section 6, Audio). vo.duration comes from JG.LINES est.
  // =================================================================================================================
  JG.stubs.audio = function () {
    var muted = false, rate = 1, unlocked = false, played = [], sfxCount = {}, loops = {}, music = null, fx = null, amb = null, voActive = {};
    function est(id) { var L = JG.LINES && JG.LINES[id]; return Math.max(L && L.est || 0, 1.2); }
    function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; }
    var api = {
      stub: true,
      init: function () {},
      preload: function (onProgress) { if (onProgress) onProgress(1); return Promise.resolve(); },
      unlock: function () { unlocked = true; },
      reset: function () { loops = {}; music = null; fx = null; amb = null; voActive = {}; },
      update: function () {},
      setMuted: function (b) { muted = !!b; },
      setRate: function (n) { rate = n; },
      suspend: function () {}, resume: function () {},
      debug: function () { return { stub: true, muted: muted, rate: rate, unlocked: unlocked, voPlayed: played.slice(), sfx: Object.assign({}, sfxCount), loops: Object.keys(loops), music: music, musicFx: fx, ambience: amb, vo: Object.keys(voActive) }; },
      vo: {
        duration: function (id) { return est(id); },
        play: function (id) { played.push(id); voActive[id] = true; return { duration: est(id), stop: function () { delete voActive[id]; } }; },
        loop: function (id) { played.push(id); voActive[id] = true; return { stop: function () { delete voActive[id]; } }; },
        levelAt: function (id, t) {
          if (t < 0 || t > est(id)) return 0;
          var s = Math.sin(2 * PI * 5.5 * t + hash(id) * 6.283);
          return s > 0 ? 0.25 + 0.6 * s : 0.05;
        },
        isPlaceholder: function () { return true; },
        stopAll: function () { voActive = {}; }
      },
      sfx: function (id) { sfxCount[id] = (sfxCount[id] || 0) + 1; return { duration: 0.3, stop: function () {} }; },
      loop: function (id) { loops[id] = true; return { duration: Infinity, stop: function () { delete loops[id]; }, set: function () {} }; },
      ambience: function (id) { amb = id || null; },
      music: {
        play: function (id) { music = id; return { duration: Infinity, stop: function () { if (music === id) music = null; } }; },
        stop: function () { music = null; },
        fx: function (f) { fx = f || null; },
        position: function () { return null; },
        source: function () { return 'standin'; }
      }
    };
    return api;
  };

  // =================================================================================================================
  // UI: plain DOM, full API (plan section 6, UI). Comic look is E5's; this keeps every string verbatim and every
  // control reachable, inside the viewport and at least 44 px. Elements carry data-ui="…" for the tests.
  // =================================================================================================================
  JG.stubs.ui = function () {
    var root = null, el = {}, fade = { a: 0, from: 0, to: 0, t: 0, sec: 0 }, trans = { a: 0, from: 0, to: 0, t: 0, sec: 0 };
    var card = null, letters = [], beaconPos = null, titleOpts = null, endOpts = null, promptGen = 0, mode = 'cine';
    var CSS = [
      '.jg-ui{position:absolute;inset:0;pointer-events:none;font-family:"Comic Neue","Comic Sans MS",system-ui,sans-serif;color:#111;z-index:2}',
      '.jg-ui button{pointer-events:auto;font:inherit;cursor:pointer}',
      '.jg-ui [hidden]{display:none!important}',
      '.jg-lb{position:absolute;left:0;right:0;height:var(--lb,0px);background:#111;z-index:3}',
      '.jg-lb.top{top:0}.jg-lb.bot{top:calc(var(--stage-h) - var(--lb,0px))}',
      '.jg-objective{position:absolute;left:12px;top:12px;max-width:min(60%,420px);background:#FFF8E7;border:3px solid #111;border-radius:6px;padding:6px 10px;font-weight:700;font-size:16px;z-index:4}',
      '.jg-caller{position:absolute;left:50%;top:12px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:#fff;border:3px solid #111;border-radius:10px;padding:6px 14px 6px 6px;font-weight:700;z-index:4}',
      '.jg-caller i{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#E0218A;color:#fff;font-style:normal;font-family:Bangers,Impact,sans-serif;font-size:22px}',
      '.jg-now{position:absolute;right:12px;top:70px;background:#111;color:#FFD21F;border-radius:999px;padding:4px 12px;font-weight:700;font-size:13px;z-index:4}',
      '.jg-letter{position:absolute;transform:translate(-50%,-100%);font-family:Bangers,Impact,sans-serif;font-size:40px;color:#FFD21F;-webkit-text-stroke:2px #111;text-shadow:3px 3px 0 #111;white-space:nowrap;z-index:3}',
      '.jg-beacon{position:absolute;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-top:24px solid #E0218A;filter:drop-shadow(2px 2px 0 #111);transform:translate(-50%,-100%);z-index:3}',
      '.jg-beacon.edge{border-top-color:#E0218A;opacity:.85}',
      '.jg-radar{position:absolute;left:0;top:0;width:var(--stage-w);height:var(--stage-h);background:#f6f7fb;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:5}',
      '.jg-radar[hidden]{display:none}',
      '.jg-radar .score{font-size:64px;font-weight:600}.jg-radar .of{font-size:16px;color:#555}',
      '.jg-radar .banner{background:#1FA971;color:#fff;font-weight:600;padding:10px 16px;border-radius:8px;max-width:calc(100% - 24px);text-align:center;font-size:16px}',
      '.jg-fade{position:absolute;inset:0;background:#000;opacity:0;z-index:6}',
      '.jg-trans{position:absolute;inset:0;background:#111;opacity:0;z-index:6}',
      '.jg-card{position:absolute;left:50%;top:calc(var(--stage-h) / 2);transform:translate(-50%,-50%);z-index:7;font-family:Bangers,Impact,sans-serif;letter-spacing:1px;text-align:center;max-width:calc(100% - 32px)}',
      '.jg-card.timecard{background:#FFD21F;border:4px solid #111;padding:14px 26px;font-size:44px;box-shadow:6px 6px 0 #111}',
      '.jg-card.caption{left:16px;top:16px;transform:none;background:#FFF8E7;border:3px solid #111;padding:8px 12px;font-size:22px}',
      '.jg-dock{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);width:min(calc(100% - 24px),760px);display:flex;flex-direction:column;align-items:center;gap:10px;z-index:8}',
      '#game[data-layout=portrait] .jg-dock{top:calc(var(--stage-h) + 12px);bottom:auto}',
      '.jg-sub{background:#fff;border:3px solid #111;border-radius:14px;padding:10px 14px;font-weight:700;font-size:18px;line-height:1.3;max-width:100%;box-shadow:4px 4px 0 #111}',
      '.jg-sub b{display:inline-block;background:#1F4FD8;color:#fff;border-radius:6px;padding:1px 8px;margin-right:8px;font-size:14px;vertical-align:2px}',
      '.jg-chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}',
      '.jg-chip{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:6px 18px 6px 8px;border:3px solid #111;border-radius:999px;background:#FFD21F;font-weight:700;font-size:18px;color:#111;box-shadow:3px 3px 0 #111}',
      '.jg-chip .disc{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#fff;border:2px solid #111;font-family:system-ui,sans-serif;font-weight:800}',
      '.jg-chip.struck .txt{text-decoration:line-through}.jg-chip em{font-style:normal;color:#E0218A;font-family:Bangers,Impact,sans-serif;font-size:20px}',
      '.jg-chip.pulse{animation:jgpulse 0.9s ease-in-out infinite}@keyframes jgpulse{50%{transform:scale(1.08)}}',
      '.jg-chip.shake{animation:jgshake 0.35s linear}@keyframes jgshake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}',
      '.jg-hint{min-height:44px;padding:6px 16px;border:3px solid #111;border-radius:999px;background:#fff;font-weight:700;font-size:16px}',
      '.jg-skip{position:absolute;right:10px;top:10px;min-height:44px;min-width:44px;padding:6px 12px;border:2px solid #111;border-radius:999px;background:rgba(255,248,231,.92);font-weight:700;font-size:14px;overflow:hidden;z-index:8}',
      '.jg-skip i{position:absolute;left:0;bottom:0;height:4px;background:#E0218A;width:0}',
      '#game[data-layout=portrait] .jg-skip{top:auto;bottom:16px;right:12px}',
      '.jg-title,.jg-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#FFF8E7;z-index:20;padding:16px;box-sizing:border-box;text-align:center}',
      '.jg-title img{max-width:100%;max-height:55%;object-fit:contain}',
      '.jg-title h1,.jg-end .tag{font-family:Bangers,Impact,sans-serif;font-size:44px;margin:0;letter-spacing:1px}',
      '.jg-big{min-height:52px;padding:8px 26px;border:3px solid #111;border-radius:999px;background:#FFD21F;font-weight:700;font-size:20px;box-shadow:4px 4px 0 #111}',
      '.jg-big[disabled]{opacity:.5;cursor:default}',
      '.jg-bar{width:min(320px,80%);height:8px;border:2px solid #111;border-radius:6px;overflow:hidden}.jg-bar i{display:block;height:100%;width:0;background:#1F4FD8}',
      '.jg-end{background:rgba(17,17,17,.82);color:#fff}.jg-end small{opacity:.8;max-width:420px}',
      '.jg-link{min-height:44px;background:none;border:none;color:#FFD21F;text-decoration:underline;font-weight:700}',
      '.jg-credits{position:absolute;inset:10%;background:#fff;color:#111;border:3px solid #111;padding:16px;overflow:auto;z-index:21;pointer-events:auto}',
      '.jg-panel{position:absolute;inset:0;border:8px solid #111;pointer-events:none;z-index:3}'
    ].join('\n');

    function mk(tag, cls, parent, attrs) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      (parent || el.ui).appendChild(e);
      return e;
    }
    function dom() {
      if (el.ui) return el;
      root = root || document.getElementById('game') || document.body;
      JG.css('ui-stub', CSS);
      el.ui = mk('div', 'jg-ui', root, { id: 'jg-ui' });
      el.lbTop = mk('div', 'jg-lb top'); el.lbBot = mk('div', 'jg-lb bot');
      el.panel = mk('div', 'jg-panel'); el.panel.hidden = true;
      el.objective = mk('div', 'jg-objective', null, { 'data-ui': 'objective' }); el.objective.hidden = true;
      el.caller = mk('div', 'jg-caller', null, { 'data-ui': 'caller' }); el.caller.hidden = true;
      el.now = mk('div', 'jg-now', null, { 'data-ui': 'now-playing' }); el.now.hidden = true;
      el.letters = mk('div', '', null);
      el.beacon = mk('div', 'jg-beacon', null, { 'data-ui': 'beacon' }); el.beacon.hidden = true;
      el.radar = mk('div', 'jg-radar', null, { 'data-ui': 'radar' }); el.radar.hidden = true;
      el.fade = mk('div', 'jg-fade', null, { 'data-ui': 'fade' });
      el.trans = mk('div', 'jg-trans', null, { 'data-ui': 'transition' });
      el.card = mk('div', 'jg-card', null, { 'data-ui': 'card' }); el.card.hidden = true;
      el.dock = mk('div', 'jg-dock', null, { 'data-ui': 'dock' });
      el.sub = mk('div', 'jg-sub', el.dock, { 'data-ui': 'subtitle' }); el.sub.hidden = true;
      el.chips = mk('div', 'jg-chips', el.dock, { 'data-ui': 'prompt' });
      el.hint = mk('button', 'jg-hint', el.dock, { 'data-ui': 'hint', type: 'button' }); el.hint.hidden = true;
      el.skip = mk('button', 'jg-skip', null, { 'data-ui': 'skip', type: 'button' }); el.skip.hidden = true;
      el.skip.textContent = T('skip');
      el.skipBar = mk('i', '', el.skip);
      ['pointerdown'].forEach(function (ev) { el.skip.addEventListener(ev, function (e) { e.preventDefault(); JG.input.setSkipHold(true, 'touch'); }); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { el.skip.addEventListener(ev, function () { JG.input.setSkipHold(false, 'touch'); }); });
      el.title = mk('div', 'jg-title', null, { 'data-ui': 'title' }); el.title.hidden = true;
      el.end = mk('div', 'jg-end', null, { 'data-ui': 'end' }); el.end.hidden = true;
      el.credits = mk('div', 'jg-credits', null, { 'data-ui': 'credits' }); el.credits.hidden = true;
      return el;
    }
    function text(e, s) { e.textContent = s; }
    function anim(o, dt) {
      if (o.sec <= 0) { o.a = o.to; return; }
      o.t = Math.min(o.sec, o.t + dt);
      o.a = o.from + (o.to - o.from) * (o.t / o.sec);
    }
    function project(p, cam, rect) {
      var v = p.clone().project(cam);
      return { x: (v.x + 1) / 2 * rect.w, y: (1 - v.y) / 2 * rect.h, behind: v.z > 1, on: v.z <= 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
    }
    var api = {
      stub: true,
      init: function (r) { root = r; dom(); },
      update: function (dt, ctx) {
        if (!el.ui) return;
        anim(fade, dt); el.fade.style.opacity = fade.a;
        anim(trans, dt); el.trans.style.opacity = trans.a;
        if (card) { card.left -= dt; if (card.left <= 0) { el.card.hidden = true; card = null; } }
        var cam = ctx && ctx.camera, rect = (ctx && ctx.rect) || (JG.loop && JG.loop.stageRect());
        letters = letters.filter(function (L) {
          L.left -= dt;
          if (L.left <= 0) { L.e.remove(); return false; }
          if (cam && rect) { var s = project(L.pos, cam, rect); L.e.style.left = s.x + 'px'; L.e.style.top = s.y + 'px'; L.e.hidden = s.behind; }
          L.e.style.opacity = Math.min(1, L.left / 0.3);
          return true;
        });
        if (beaconPos && cam && rect) {
          var s = project(beaconPos, cam, rect), x = s.x, y = s.y;
          if (!s.on) { x = Math.max(20, Math.min(rect.w - 20, s.behind ? rect.w - x : x)); y = Math.max(30, Math.min(rect.h - 10, s.behind ? rect.h - 10 : y)); }
          el.beacon.className = 'jg-beacon' + (s.on ? '' : ' edge');
          el.beacon.style.left = x + 'px'; el.beacon.style.top = y + 'px';
          el.beacon.hidden = false;
        }
      },
      // opts.keepStage (a stage.freeze beat entered by flow): keep the stage panel, letterbox and full-stage layout
      reset: function (opts) {
        if (!el.ui) return;
        var keep = !!(opts && opts.keepStage);
        api.subtitles.hide(); api.objective.hide(); api.beacon.set(null); api.hint.hide(); api.skip.hide(); api.callerCard.hide(); api.nowPlaying.hide();
        api.radar.hide(); if (!keep) api.letterbox.set(false); api.title.hide(); api.end.hide(); api.credits.hide();
        el.chips.innerHTML = ''; promptGen++;
        el.card.hidden = true; card = null;
        letters.forEach(function (L) { L.e.remove(); }); letters = [];
        fade.a = fade.to = fade.from = 0; fade.sec = 0; el.fade.style.opacity = 0;
        trans.a = trans.to = trans.from = 0; trans.sec = 0; el.trans.style.opacity = 0;
        if (keep) return;
        el.panel.hidden = true;
        if (JG.loop && JG.loop.fullStage) JG.loop.setFullStage(false);
      },
      setInputMode: function (m) { mode = m; dom(); el.ui.setAttribute('data-input', m); },
      stagePanel: function (on) { dom(); el.panel.hidden = !on; },
      title: {
        show: function (o) {
          dom(); titleOpts = o || {};
          var t = el.title;
          t.innerHTML = '';
          var img = mk('img', '', t, { src: JG.assets.url('assets/img/keyart.webp'), alt: '' });
          img.addEventListener('error', function () { img.remove(); });
          text(mk('h1', '', t), T('title'));
          var b = mk('button', 'jg-big', t, { type: 'button', 'data-ui': 'start' });
          text(b, T('start'));
          b.disabled = !api.title._ready;
          b.addEventListener('click', function () { if (titleOpts && titleOpts.onStart) titleOpts.onStart(); });
          el.titleBtn = b;
          var bar = mk('div', 'jg-bar', t); el.titleBar = mk('i', '', bar);
          el.titleBar.style.width = Math.round((api.loading._p || 0) * 100) + '%';
          t.hidden = false;
        },
        hide: function () { if (el.title) el.title.hidden = true; },
        enable: function () { api.title._ready = true; if (el.titleBtn) el.titleBtn.disabled = false; },
        _ready: false
      },
      loading: { set: function (p) { api.loading._p = p; if (el.titleBar) el.titleBar.style.width = Math.round(p * 100) + '%'; if (p >= 1) api.title.enable(); }, _p: 0 },
      end: {
        show: function (o) {
          dom(); endOpts = o || {};
          var e = el.end;
          e.innerHTML = '';
          text(mk('div', 'tag', e, { 'data-ui': 'tagline' }), T('tagline'));
          var b = mk('button', 'jg-big', e, { type: 'button', 'data-ui': 'replay' });
          text(b, T('replay'));
          b.addEventListener('click', function () { if (endOpts && endOpts.onReplay) endOpts.onReplay(); });
          var c = mk('button', 'jg-link', e, { type: 'button', 'data-ui': 'credits-open' });
          text(c, T('credits'));
          c.addEventListener('click', function () { api.credits.show(); });
          text(mk('small', '', e), T('nonAffiliation'));
          e.hidden = false;
        },
        hide: function () { if (el.end) el.end.hidden = true; }
      },
      credits: {
        show: function () {
          dom();
          var c = el.credits;
          c.innerHTML = '';
          text(mk('h2', '', c), T('credits'));
          var list = JG.CREDITS || [];
          if (list.length) list.forEach(function (x) { text(mk('p', '', c), typeof x === 'string' ? x : (x.text || JSON.stringify(x))); });
          else text(mk('p', '', c), 'Third-party files and their licences: see the LICENSES folder.');
          var a = mk('a', '', c, { href: 'LICENSES/', target: '_blank', rel: 'noopener' }); text(a, 'LICENSES/');
          var x = mk('button', 'jg-big', c, { type: 'button' }); text(x, 'Close');
          x.addEventListener('click', function () { api.credits.hide(); });
          c.hidden = false;
        },
        hide: function () { if (el.credits) el.credits.hidden = true; }
      },
      subtitles: {
        show: function (o) {
          dom(); el.sub.innerHTML = '';
          if (o.speaker) text(mk('b', '', el.sub), o.speaker);
          text(mk('span', 'txt', el.sub), o.text);
          el.sub.hidden = false;
        },
        hide: function () { if (el.sub) el.sub.hidden = true; }
      },
      objective: {
        show: function (s) { dom(); text(el.objective, s); el.objective.hidden = false; },
        hide: function () { if (el.objective) el.objective.hidden = true; }
      },
      beacon: { set: function (p) { dom(); beaconPos = p ? p.clone() : null; if (!p) el.beacon.hidden = true; } },
      prompt: {
        show: function (o) {
          dom();
          var gen = ++promptGen, chips = {};
          el.chips.innerHTML = '';
          (o.options || []).forEach(function (op) {
            var b = mk('button', 'jg-chip', el.chips, { type: 'button', 'data-ui': 'chip', 'data-action': op.action });
            text(mk('span', 'disc', b), op.action.toUpperCase());
            text(mk('span', 'txt', b), op.text);
            b.addEventListener('pointerdown', function (e) { e.preventDefault(); JG.input.inject(op.action, 'touch'); });
            chips[op.action] = b;
          });
          function live() { return gen === promptGen; }
          return {
            hide: function () { if (live()) { el.chips.innerHTML = ''; promptGen++; } },
            strike: function (action, tag) { var b = chips[action]; if (!b || !live()) return; b.classList.add('struck'); if (!b.querySelector('em')) text(mk('em', '', b), tag || T('niceTry')); },
            shake: function (action) { var b = chips[action]; if (!b || !live()) return; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); },
            pulse: function (action) { var b = chips[action]; if (b && live()) b.classList.add('pulse'); }
          };
        }
      },
      hint: {
        show: function (s, o) {
          dom(); o = o || {};
          text(el.hint, s); el.hint.hidden = false;
          el.hint.onpointerdown = function (e) {
            e.preventDefault();
            if (typeof o.tap === 'function') o.tap(); else if (o.tap) JG.input.inject(o.tap, 'touch');
          };
        },
        hide: function () { if (el.hint) { el.hint.hidden = true; el.hint.onpointerdown = null; } }
      },
      skip: {
        show: function () {
          dom();
          // touch players skip with the chip itself, so the label does not mention Enter
          var touch = JG.input.lastSource === 'touch' || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
          el.skip.firstChild.nodeValue = T(touch ? 'skipTouch' : 'skip');
          el.skip.hidden = false; el.skipBar.style.width = '0';
        },
        hide: function () { if (el.skip) el.skip.hidden = true; },
        setProgress: function (p) { if (el.skipBar) el.skipBar.style.width = Math.round(p * 100) + '%'; }
      },
      fade: {
        to: function (a, sec, color) {
          dom();
          fade.from = fade.a; fade.to = a; fade.t = 0; fade.sec = sec || 0;
          el.fade.style.background = color || '#000';
          if (!sec) { fade.a = a; el.fade.style.opacity = a; }
          return { duration: sec || 0, stop: function () { fade.sec = 0; fade.a = fade.to; } };
        }
      },
      transition: {
        play: function (kind, dir, sec) {
          dom();
          trans.from = trans.a; trans.to = dir === 'out' ? 0 : 1; trans.t = 0; trans.sec = sec || 0.4;
          el.trans.setAttribute('data-kind', kind || 'fade');
          return { duration: trans.sec, stop: function () { trans.sec = 0; trans.a = trans.to; } };
        }
      },
      letterbox: { set: function (on) { dom(); root.style.setProperty('--lb', on ? Math.round((JG.loop ? JG.loop.stageRect().h : 400) * 0.1) + 'px' : '0px'); } },
      card: {
        show: function (o, sec) {
          dom();
          el.card.className = 'jg-card ' + (o.style || 'caption');
          text(el.card, o.text);
          el.card.hidden = false;
          var me = card = { left: sec === undefined ? 2 : sec };
          return { duration: me.left, stop: function () { if (card === me) { card = null; el.card.hidden = true; } } };
        }
      },
      lettering: {
        show: function (s, pos, sec) {
          dom();
          var e = mk('div', 'jg-letter', el.letters, { 'data-ui': 'lettering' });
          text(e, s);
          var L = { e: e, pos: pos ? pos.clone() : new window.THREE.Vector3(), left: sec || 1.2 };
          letters.push(L);
          return { duration: L.left, stop: function () { L.left = 0; } };
        }
      },
      callerCard: {
        show: function (o) { dom(); el.caller.innerHTML = ''; text(mk('i', '', el.caller), (o.name || 'L').charAt(0)); text(mk('span', '', el.caller), o.name || ''); el.caller.hidden = false; },
        hide: function () { if (el.caller) el.caller.hidden = true; }
      },
      nowPlaying: {
        show: function (s) { dom(); text(el.now, s); el.now.hidden = false; },
        hide: function () { if (el.now) el.now.hidden = true; }
      },
      radar: {
        _state: { stage: 'off' },
        setState: function (s) { api.radar._state = Object.assign({}, api.radar._state, s); if (el.radar && !el.radar.hidden) api.radar.show(); },
        show: function () {
          dom();
          var s = api.radar._state, r = el.radar, after = s.stage === 'after';
          r.innerHTML = '';
          text(mk('div', 'of', r), 'Radar');
          text(mk('div', 'score', r, { 'data-ui': 'score' }), after ? '100' : '51');
          text(mk('div', 'of', r), 'of 100');
          if (after) text(mk('div', 'banner', r, { 'data-ui': 'banner' }), T('allClear'));
          r.hidden = false;
        },
        hide: function () { if (el.radar) el.radar.hidden = true; },
        drawMonitor: function (ctx, w, h, stage) {
          stage = stage || api.radar._state.stage;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#e9ebf2'; ctx.fillRect(0, 0, w * 0.22, h);
          ctx.fillStyle = '#111'; ctx.font = 'bold ' + Math.round(h * 0.09) + 'px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('JUNE', w * 0.03, h * 0.12);
          if (stage === 'newtab' || stage === 'typing') {
            ctx.strokeStyle = '#999'; ctx.strokeRect(w * 0.3, h * 0.4, w * 0.6, h * 0.12);
            ctx.fillText(stage === 'typing' ? 'june.ai' : '', w * 0.32, h * 0.49);
            return;
          }
          if (stage === 'loading') { ctx.fillText('…', w * 0.55, h * 0.5); return; }
          var after = stage === 'after';
          ctx.lineWidth = h * 0.05; ctx.strokeStyle = after ? '#1FA971' : '#C8642A';
          ctx.beginPath(); ctx.arc(w * 0.6, h * 0.5, h * 0.25, 0.75 * PI, (0.75 + 1.5 * (after ? 1 : 0.51)) * PI); ctx.stroke();
          ctx.textAlign = 'center'; ctx.fillStyle = '#111'; ctx.font = 'bold ' + Math.round(h * 0.16) + 'px sans-serif';
          ctx.fillText(after ? '100' : '51', w * 0.6, h * 0.56);
        }
      }
    };
    return api;
  };

  // =================================================================================================================
  // Beats: a stub for every contract beat no act file registers. Each stages its cast, shows its prompt (play and
  // choice beats) or plays its lines and waits its est (cinematics), then advances. The canonical stages below are
  // a first proposal for E2 (story) and E4 (sets).
  // =================================================================================================================
  var OFFICE56 = { floor: 56, doors: 'open', mood: 'before', monitor: 'off', window: 'intact', light: 'day' };
  function st(o) { return o; }
  var STAGES = JG.stubs.STAGES = {
    'title': st({ scene: null, cast: {}, ui: { fade: 0 } }),
    'rooftop-call': st({ scene: 'city', sceneState: { area: 'roof', time: 'day', elevatorDoors: 'open' }, cast: { roo: { at: 'roof.phoneStand', pose: 'idleChill' } }, audio: { ambience: 'roof' } }),
    'rooftop-walk': st({ scene: 'city', sceneState: { area: 'roof', time: 'day', elevatorDoors: 'open' }, cast: { roo: { at: 'roof.spawn', pose: 'idle' } }, audio: { ambience: 'roof' } }),
    'rooftop-jump': st({ scene: 'city', sceneState: { area: 'roof', time: 'day', elevatorDoors: 'open' }, cast: { roo: { at: 'roof.edgeStand', pose: 'idle' } }, audio: { ambience: 'roof' } }),
    'street-subway': st({ scene: 'city', sceneState: { area: 'streetA', time: 'day', elevatorDoors: 'open' }, cast: { roo: { at: 'streetA.spawn', pose: 'idle' } }, audio: { ambience: 'street' } }),
    'subway-ride': st({ scene: 'subway', sceneState: { lady: 'plain', motion: 'moving' }, cast: { roo: { at: 'subway.rooSeat', pose: 'seatedIdle' }, oldlady: { at: 'subway.ladySeat', pose: 'seatedPurseIdle', props: { handbag: 'handL' } }, extra1: { at: 'subway.extraSeat1', pose: 'seatedReader' }, extra2: { at: 'subway.extraSeat2', pose: 'seatedReader' } }, audio: { ambience: 'subway' } }),
    'plaza-walk': st({ scene: 'city', sceneState: { area: 'streetB', time: 'day', elevatorDoors: 'open' }, cast: { roo: { at: 'streetB.subwayExit', pose: 'idle' } }, audio: { ambience: 'street' } }),
    'elevator-ride': st({ scene: 'office', sceneState: { floor: 1, doors: 'closed', mood: 'before', monitor: 'off', window: 'intact', light: 'day' }, cast: { roo: { at: 'office.elevatorMark', pose: 'elevatorStand' } }, audio: { music: 'elevator', ambience: 'elevator' } }),
    'ops-plea': st({ scene: 'office', sceneState: { floor: 56, doors: 'closed', mood: 'before', monitor: 'off', window: 'intact', light: 'day' }, cast: { roo: { at: 'office.elevatorMark', pose: 'idle' }, ops: { at: 'office.opsStart', pose: 'idle' }, extra1: { at: 'office.extraDesk1', pose: 'typing' }, extra2: { at: 'office.extraStand', pose: 'standing' }, extra3: { at: 'office.extraDesk2', pose: 'typing' }, extra4: { at: 'office.extraDesk3', pose: 'typing' } }, audio: { ambience: 'office' } }),
    'choice': st({ scene: 'office', sceneState: OFFICE56, cast: { roo: { at: 'office.elevatorOut', pose: 'idle' }, ops: { at: 'office.opsPlea', pose: 'cryLoop' }, extra1: { at: 'office.extraDesk1', pose: 'typing' }, extra2: { at: 'office.extraStand', pose: 'standing' }, extra3: { at: 'office.extraDesk2', pose: 'typing' }, extra4: { at: 'office.extraDesk3', pose: 'typing' } }, audio: { ambience: 'office' } }),
    'comfort': st({ scene: 'office', sceneState: OFFICE56, cast: { roo: { at: 'office.hug.roo', pose: 'idle' }, ops: { at: 'office.hug.ops', pose: 'cryLoop' }, extra1: { at: 'office.extraDesk1', pose: 'typing' }, extra2: { at: 'office.extraStand', pose: 'standing' }, extra3: { at: 'office.extraDesk2', pose: 'typing' }, extra4: { at: 'office.extraDesk3', pose: 'typing' } }, audio: { ambience: 'office' } }),
    'office-walk': st({ scene: 'office', sceneState: OFFICE56, cast: { roo: { at: 'office.spawn', pose: 'idle' }, ops: { at: 'office.opsPlea', pose: 'thankful' }, extra1: { at: 'office.extraDesk1', pose: 'typing' }, extra2: { at: 'office.extraStand', pose: 'standing' }, extra3: { at: 'office.extraDesk2', pose: 'typing' }, extra4: { at: 'office.extraDesk3', pose: 'typing' } }, audio: { ambience: 'office' } }),
    'desk-sit': st({ scene: 'office', sceneState: { floor: 56, doors: 'open', mood: 'before', monitor: 'newtab', window: 'intact', light: 'day' }, cast: { roo: { at: 'office.deskStand', pose: 'idle' }, extra1: { at: 'office.extraDesk1', pose: 'typing' } }, audio: { ambience: 'office' } }),
    'montage': st({ scene: 'office', sceneState: { floor: 56, doors: 'open', mood: 'before', monitor: 'before', window: 'intact', light: 'day' }, cast: { roo: { at: 'office.chair', pose: 'seatedIdle' }, extra1: { at: 'office.extraDesk1', pose: 'typing' } }, audio: { ambience: 'office' } }),
    'two-hours-later': st({ scene: 'office', sceneState: { floor: 56, doors: 'open', mood: 'after', monitor: 'before', window: 'intact', light: 'dusk' }, cast: { roo: { at: 'office.chair', pose: 'seatedIdle', props: { headphones: 'head' } } }, audio: { music: 'montage', musicFx: 'muffled', ambience: 'office' }, ui: { fade: 1 } }),
    'all-clear': st({ scene: 'office', sceneState: { floor: 56, doors: 'open', mood: 'after', monitor: 'after', window: 'intact', light: 'dusk' }, cast: { roo: { at: 'office.chair', pose: 'seatedIdle' } }, audio: { ambience: 'office' }, ui: { radar: { stage: 'after' } } }),
    'how': st({ scene: 'office', sceneState: { floor: 56, doors: 'open', mood: 'after', monitor: 'after', window: 'intact', light: 'dusk' }, cast: { roo: { at: 'office.chair', pose: 'seatedIdle' }, exec: { at: 'office.execStand', pose: 'armsCrossedIdle' } }, audio: { ambience: 'office' } }),
    'window-exit': st({ scene: 'office', sceneState: { floor: 56, doors: 'open', mood: 'after', monitor: 'after', window: 'intact', light: 'dusk' }, cast: { roo: { at: 'office.chair', pose: 'idle' }, exec: { at: 'office.execStand', pose: 'armsCrossedIdle' } }, audio: { ambience: 'office' } }),
    'subway-wink': st({ scene: 'subway', sceneState: { lady: 'knitting', motion: 'moving' }, cast: { roo: { at: 'subway.rooSeat', pose: 'seatedIdle' }, oldlady: { at: 'subway.ladySeat', pose: 'seatedKnit' } }, audio: { ambience: 'subway' } }),
    // freeze: entered by flow, the wink's last frame and inked panel stay under the end card; entered by a jump
    // (goto, hash), this stage rebuilds that frame
    'tagline': st({ freeze: true, scene: 'subway', sceneState: { lady: 'knitting', motion: 'moving' }, cast: { roo: { at: 'subway.rooSeat', pose: 'seatedIdle', expr: 'wink', look: 'camera' }, oldlady: { at: 'subway.ladySeat', pose: 'seatedKnit' } }, cam: { rel: 'subway.rooSeat', pos: [0, 1.2, 2.2], look: [0, 1.0, 0], fov: 36 }, ui: { stagePanel: true } })
  };
  var EST = { title: 0, 'rooftop-call': 15, 'rooftop-walk': 12, 'rooftop-jump': 7, 'street-subway': 9, 'subway-ride': 11, 'plaza-walk': 14, 'elevator-ride': 13, 'ops-plea': 14, choice: 4, comfort: 14, 'office-walk': 8, 'desk-sit': 13, montage: 9, 'two-hours-later': 6, 'all-clear': 8, how: 12, 'window-exit': 7, 'subway-wink': 7, tagline: 0 };
  var SKIP = { 'rooftop-call': 1, 'rooftop-jump': 1, 'subway-ride': 1, 'elevator-ride': 1, 'ops-plea': 1, comfort: 1, 'desk-sit': 1, montage: 1, 'two-hours-later': 1, how: 1, 'window-exit': 1, 'subway-wink': 1 };
  var LINES_OF = { 'rooftop-call': ['lauren_problem', 'roo_got_you'], 'ops-plea': ['ops_help'], choice: ['ops_sob', 'gag_roo_get_on', 'gag_ops_wail', 'gag_roo_feelings'], comfort: ['roo_not_your_fault', 'ops_thank_you'], montage: ['roo_few_minutes'], how: ['exec_how', 'roo_good_at', 'roo_dont_need_me'] };

  function restOf(w, est, t0) { var left = est - (JG.clock.t - t0); return left > 0 ? w.wait(left) : Promise.resolve(); }

  var PLAY = {
    'title': async function (w) {
      var go = !!(JG.boot && JG.boot.started);
      JG.input.setMode('ui');
      var off = JG.input.on('press', function (a) { if (a === 'start') go = true; });
      w.onCancel(off);
      JG.ui.title.show({ onStart: function () { try { JG.audio.unlock(); } catch (e) { JG.error('audio.unlock', e); } JG.input.inject('start', 'ui'); } });
      if (JG.boot && JG.boot.assetsReady) JG.ui.title.enable && JG.ui.title.enable();
      w.mark('title');
      if (w.auto) w.fork(async function (w2) { await w2.wait(0.5); try { JG.audio.unlock(); } catch (e) { /* stub */ } JG.input.inject('start', 'auto'); });
      await w.until(function () { return go; });
      off();
      JG.ui.title.hide();
      w.music('theme');
    },
    'rooftop-call': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo');
      w.cut('rooftop-call.wide');
      JG.ui.callerCard.show({ name: T('callerName'), level: 1 });
      var ring = w.loop('ringtone');
      w.lettering(T('lettering.ring'), 'roo.head', 1.5);
      await w.wait(1.5);
      ring.stop(0.1);
      w.sfx('phone_click');
      roo.attach('phone', 'handR');
      await w.play(roo, 'phoneHold', { loop: true });
      await w.say('lauren_problem');
      JG.ui.callerCard.hide();
      await w.say('roo_got_you', { actor: roo });
      roo.attach('phone', false);
      w.sfx('sting_hero');
      await w.pose(roo, 'heroCrossed', 0.3);
      await restOf(w, EST['rooftop-call'], t0);
    },
    'rooftop-walk': async function (w) {
      await w.roam({ actor: 'roo', goal: { zone: 'roof.edge', action: 'x', text: T('prompts.jump') } });
    },
    'rooftop-jump': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo');
      w.cut('rooftop-jump.edge');
      await w.moveTo(roo, 'roof.jumpFrom', { speed: 2, face: true });
      await w.play(roo, 'jumpOff');
      w.sfx('whoosh'); w.sfx('cape_flap');
      var wind = w.loop('fallwind');
      w.setScene({ area: 'streetA' });
      w.cut({ pos: [9, 4, -20], look: [0, 6, -10], fov: 50 });
      await w.arc(roo, { to: 'streetA.land', height: 2, sec: 1.6 });
      wind.stop(0.1);
      w.sfx('thud'); w.shake(0.25, 0.5);
      w.lettering(T('lettering.thoom'), 'roo', 1.2);
      await w.play(roo, 'landHero');
      await restOf(w, EST['rooftop-jump'], t0);
    },
    'street-subway': async function (w) {
      var roo = w.actor('roo');
      await w.roam({ actor: 'roo', goal: { zone: 'streetA.stairsTop' } });
      await w.moveTo(roo, 'streetA.stairsDown', { speed: 1.6 });
      await w.fadeOut(0.4);
    },
    'subway-ride': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo'), lady = w.actor('oldlady');
      w.cut('subway-ride.two');
      w.sfx('subway_screech');
      await w.wait(3);
      w.express(roo, 'smile');
      await w.wait(2);
      w.express(lady, 'smile');
      w.play(lady, 'seatedLadyReact', { wait: false });
      w.sfx('subway_chime');
      await restOf(w, EST['subway-ride'], t0);
    },
    'plaza-walk': async function (w) {
      var roo = w.actor('roo');
      await w.moveTo(roo, 'streetB.subwayUp', { speed: 1.4 });
      await w.roam({ actor: 'roo', goal: { zone: 'streetB.elevator' } });
      await w.moveTo(roo, 'streetB.elevatorMark', { speed: 1.4, face: true });
      w.sfx('door_slide');
      await w.setScene({ elevatorDoors: 'closed' }, 1.2);
    },
    'elevator-ride': async function (w) {
      var t0 = JG.clock.t;
      w.cut({ rel: 'office.elevatorMark', pos: [0.6, 1.5, 2.2], look: [0, 1.3, 0], fov: 50 });
      w.fork(async function (w2) { for (;;) { await w2.wait(1); w2.sfx('floor_blip'); } });
      await w.setScene({ floor: 56 }, 10);
      w.sfx('ding');
      w.lettering(T('lettering.ding'), [0, 2.9, 0.2], 1.2);
      await w.wait(0.4);
      w.sfx('ding');
      await restOf(w, EST['elevator-ride'], t0);
    },
    'ops-plea': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo'), ops = w.actor('ops');
      w.cut('ops-plea.doors');
      w.sfx('door_slide');
      await w.setScene({ doors: 'open' }, 1);
      await w.moveTo(roo, 'office.elevatorOut', { speed: 1.2, face: true });
      w.lettering(T('lettering.help'), 'ops.head', 1.2);
      await w.moveTo(ops, 'office.toHug', { speed: 3.2, clip: 'runPanic' });
      await w.turnTo(ops, 'roo', 0.2);
      w.play(ops, 'pleadTalk', { loop: true });
      await w.say('ops_help', { actor: ops });
      await w.play(ops, 'breakdown');
      await restOf(w, EST['ops-plea'], t0);
    },
    'choice': async function (w) {
      var roo = w.actor('roo'), ops = w.actor('ops'), yUsed = false;
      w.cut('choice.two');
      var sob = w.sayLoop('ops_sob', { actor: ops });
      for (;;) {
        w.mark('choice');
        var r = await w.choose({ options: [{ action: 'x', text: T('prompts.calm'), primary: true }, { action: 'y', text: T('prompts.getOn'), struck: yUsed ? T('niceTry') : false }] });
        if (r === 'x') { sob.stop(); w.sfx('ui_confirm'); return; }
        yUsed = true;
        w.flags.yGag = (w.flags.yGag || 0) + 1;
        sob.stop();
        w.mark('y-gag');
        await w.say('gag_roo_get_on', { actor: roo });
        w.sfx('wail');
        w.lettering(T('lettering.waaah'), 'ops.head', 1.4);
        w.play(ops, 'wailLoud', { loop: true });
        await w.say('gag_ops_wail', { actor: ops });
        await w.say('gag_roo_feelings', { actor: roo });
        w.play(ops, 'cryLoop', { loop: true });
        sob = w.sayLoop('ops_sob', { actor: ops });
      }
    },
    'comfort': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo'), ops = w.actor('ops');
      w.cut('comfort.overRoo');
      var hug = w.hug(roo, ops);
      var pats = w.fork(async function (w2) { for (;;) { await w2.wait(0.8); hug.pat(); } });
      await w.say('roo_not_your_fault', { actor: roo });
      pats.cancel();
      hug.release();
      w.play(ops, 'wipeTears', { wait: false });
      w.sfx('swish');
      w.lettering(T('lettering.sniff'), 'ops.head', 1);
      await w.wait(1);
      await w.say('ops_thank_you', { actor: ops });
      await restOf(w, EST.comfort, t0);
    },
    'office-walk': async function (w) {
      await w.roam({ actor: 'roo', goal: { zone: 'office.desk', action: 'x', text: T('prompts.sit') } });
    },
    'desk-sit': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo');
      w.cut('desk-sit.side');
      await w.moveTo(roo, 'office.chair', { speed: 1, face: true });
      w.sfx('chair');
      await w.play(roo, 'sitDownChair');
      w.play(roo, 'seatedType', { loop: true });
      await w.setScene({ monitor: 'typing' });
      for (var i = 0; i < 7; i++) { w.sfx('key'); await w.wait(0.25); }
      w.sfx('key_enter');
      await w.setScene({ monitor: 'loading' });
      await w.wait(1);
      await w.setScene({ monitor: 'before' });
      w.mark('radar-before');
      await w.wait(2);
      await restOf(w, EST['desk-sit'], t0);
    },
    'montage': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo');
      w.cut('montage.monitor');
      await w.say('roo_few_minutes', { actor: roo });
      roo.attach('headphones', 'head');
      w.sfx('hp_on');
      w.music('montage');
      w.musicFx('muffled', 0.3);
      JG.ui.nowPlaying.show(T('nowPlaying'));
      await restOf(w, EST.montage - 1, t0);
      await w.fadeOut(1);
    },
    'two-hours-later': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo');
      w.cut('two-hours-later.wide');
      w.sfx('time_tick');
      await w.card({ text: T('card'), style: 'timecard' }, 2.2);
      await w.fadeIn(0.8);
      roo.attach('headphones', false);
      w.sfx('hp_off');
      w.musicFx('leak', 0);
      await w.wait(0.4);
      w.music(null, { fade: 0.25 });
      await restOf(w, EST['two-hours-later'], t0);
    },
    'all-clear': async function (w) {
      var t0 = JG.clock.t;
      for (var i = 0; i < 3; i++) { w.sfx('tick'); await w.wait(0.4); }
      w.sfx('allclear');
      w.mark('banner');
      await w.wait(3);
      await restOf(w, EST['all-clear'], t0);
    },
    'how': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo'), exec = w.actor('exec');
      w.cut('how.two');
      w.look(exec, 'roo');
      await w.say('exec_how', { actor: exec });
      w.play(exec, 'disbelief', { wait: false });
      await w.say('roo_good_at', { actor: roo });
      await w.say('roo_dont_need_me', { actor: roo });
      await w.play(roo, 'twoFingerSalute');
      await restOf(w, EST.how, t0);
    },
    'window-exit': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo');
      w.cut({ rel: 'office.windowRun', pos: [3.5, 1.6, -4], look: [0, 1.2, 1], fov: 50 });
      await w.moveTo(roo, 'office.windowRun', { speed: 4.5, clip: 'runDive' });
      w.sfx('glass');
      w.lettering(T('lettering.krassh'), 'office.windowHole', 1.2);
      w.setScene({ window: 'broken' });
      w.sfx('whoosh');
      await w.arc(roo, { to: [5, -2, 27], height: 1, sec: 0.8 });
      await w.fadeOut(0.6);
      await restOf(w, EST['window-exit'], t0);
    },
    'subway-wink': async function (w) {
      var t0 = JG.clock.t, roo = w.actor('roo');
      w.cut({ rel: 'subway.rooSeat', pos: [0, 1.2, 2.2], look: [0, 1.0, 0], fov: 36 });
      await w.wait(2);
      w.look(roo, 'camera');
      await w.wait(0.6);
      w.express(roo, 'wink');
      w.sfx('ting');
      await w.play(roo, 'seatedWink');
      if (JG.ui.stagePanel) JG.ui.stagePanel(true);
      await restOf(w, EST['subway-wink'], t0);
    },
    'tagline': async function (w) {
      var replay = false;
      JG.input.setMode('ui');
      w.sfx('sting_end');
      w.music('theme');
      JG.ui.end.show({ onReplay: function () { replay = true; } });
      var off = JG.input.on('press', function (a) { if (a === 'start') replay = true; });
      w.onCancel(off);
      w.mark('tagline');
      await w.until(function () { return replay; });
      off();
      JG.ui.end.hide();
      return 'rooftop-call';
    }
  };

  JG.stubs.beat = function (id) {
    var kinds = (JG.CONTRACT && JG.CONTRACT.beatKinds) || {};
    var est = EST[id] !== undefined ? EST[id] : 5;
    return {
      id: id, kind: kinds[id] || 'cine', skippable: !!SKIP[id], skipTo: id === 'two-hours-later' ? 'all-clear' : undefined, est: est,
      stage: STAGES[id] || { cast: undefined },
      needs: { lines: LINES_OF[id] && id !== 'choice' ? LINES_OF[id] : [] },
      play: PLAY[id] || async function (w) {
        var lines = LINES_OF[id] || [], t0 = JG.clock.t;
        for (var i = 0; i < lines.length; i++) await w.say(lines[i]);
        await restOf(w, est, t0);
      }
    };
  };

  // =================================================================================================================
  // install
  // =================================================================================================================
  function fill(real, stub, path) {
    Object.keys(stub).forEach(function (k) {
      if (k === 'stub' || k.charAt(0) === '_') return;
      if (real[k] === undefined) { real[k] = stub[k]; JG.track.stub(path, k); }
      else if (stub[k] && typeof stub[k] === 'object' && typeof real[k] === 'object') fill(real[k], stub[k], path + '.' + k);
    });
  }
  JG.stubs.install = function () {
    var a = JG.stubs.audio();
    if (!JG.audio || typeof JG.audio !== 'object') { JG.audio = a; JG.track.stub('audio', 'all', 'silent'); } else fill(JG.audio, a, 'audio');
    var u = JG.stubs.ui();
    if (!JG.ui || typeof JG.ui !== 'object') { JG.ui = u; JG.track.stub('ui', 'all', 'plain DOM'); }
    else { if (!JG.ui.title || !JG.ui.title.enable) { /* the title enable hook is core-only */ } fill(JG.ui, u, 'ui'); }
    JG.shots = JG.shots || {};
    var ids = [].concat((JG.CONTRACT && JG.CONTRACT.beats) || [], JG.STORY_ORDER || []);
    ids.forEach(function (id) {
      if (JG.beats.has(id)) return;
      if (JG.beats.get(id)) return;
      JG.beats._stub(JG.stubs.beat(id));
      JG.track.stub('beat', id);
    });
  };
  JG.stubs.scene = function (id, kit) { return buildScene(id, kit); };
  JG.stubs.SETS = SETS;
})();
