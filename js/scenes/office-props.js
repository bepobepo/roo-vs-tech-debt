/* JG.officeProps: the office's three optional stations for office-walk (2026-11-25, the office life pass): a face
 * scanner kiosk, a water cooler and the kitchenette coffee machine's working bits. Classic script; at load it only
 * defines the layout and the builder (office.js calls build() from its own build()).
 *
 *   JG.officeProps.LAYOUT          positions (metres, world; office.js reads its stand markers and zones from it)
 *   JG.officeProps.build(kit, B, root, opts) -> {scanner, cooler, coffee, deskMug, update(dt), reset(), live(on)}
 *     B: office.js's builder (static parts go into its merged, inked 'main' group); root: the set's root (moving parts
 *     are their own meshes under it); opts.coffee: the placed vnb_coffee_machine's world bounds {min, max} or null;
 *     opts.deskMug: [x, y, z] of the mug Roo brings to the hero desk (its base).
 *   Props (the shape world.prop() returns: {object, anchors}, plus methods; anchors are Object3Ds, world positions):
 *     scanner {anchors: {screen, lens, sign, beep}, state('idle'|'scan'|'ok', variant 'first'|'again'),
 *              sweep(getFace, sec), reset(), now()}
 *     cooler  {anchors: {tap, top, cups}, glug(sec), parkMug(on), reset(), parked()}
 *     coffee  {anchors: {spout, button, screen, top}, firmware(step | 'brew'), brew(sec), take(), reset(), now()}
 *     deskMug {anchors: {}, show(on), shown()}: the coffee he made in office-walk, on the hero desk (desk-sit onwards)
 * Effects (the scan beam and its fan, bubbles, the mug, steam) are hidden when idle, so they cost no draw calls; the
 * bubbles are one merged mesh moved as a whole, the steam three sprites. Everything runs on update(dt) (game time),
 * and only while live (office.js: the office-walk beat); outside it the screens keep their last (reset) frame, nothing
 * redraws and the machine never puffs.
 *
 * Reach (roo.reachPress, clips-roo.js): his right index tip lands TIP.f ahead of his root, TIP.h up and TIP.s to his
 * right, measured in the game. TIP is the one copy (LAYOUT.tip; clips-roo.js, loaded later, publishes it as
 * JG.anim.REACH_TIP). The cooler's blue tap and the coffee button are built at that height and each stand marker is
 * the press point minus that offset, so one clip presses both. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var PI = Math.PI;
  var TIP = { f: 0.50, h: 1.00, s: 0.10 };   // the one copy (clips-roo.js publishes it as JG.anim.REACH_TIP)

  // the kiosk: free-standing right of the walk in from the lift, its screen facing -Z (the follow camera sees it head
  // on); the cooler against the cubicle island's lift-side end panel (z 8.47), facing -Z; the coffee machine on the
  // east kitchenette counter (office.js places it: rot -90, front at x 9.10, centred z 2.50), its button on the drip
  // tray's front at the press height
  var K = { x: 3.0, z0: 4.60, z1: 4.90, lensY: 1.75 };
  var CO = { tapX: -0.52, tapZ: 8.11, x0: -0.63, x1: -0.29, z0: 8.13, z1: 8.43, top: 1.05 };
  var CF = { button: [9.10, TIP.h, 2.42], z: 2.50, minX: 9.10 };
  /** the stand {pos, yaw} from which the fingertip lands on (x, z): his root frame has +X on his left, so the tip is
   *  at (-s, f) in it, turned by the yaw */
  function standFor(x, z, yaw) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    return { pos: [x - (-TIP.s * c + TIP.f * s), 0, z - (TIP.s * s + TIP.f * c)], yaw: yaw };
  }
  var LAYOUT = {
    tip: TIP, standFor: standFor,
    kiosk: K, cooler: CO, coffee: CF,
    scanStand: { pos: [K.x, 0, 3.98], yaw: 0 },          // his snout tip stops about 12 cm short of the lens
    coolerStand: standFor(CO.tapX, CO.tapZ, 0),          // (-0.42, 7.61)
    coffeeStand: standFor(CF.button[0], CF.button[2], PI / 2)   // (8.60, 2.32)
  };

  function T(k) { return JG.text(k); }
  function fitFont(c, text, maxW, size, font) {
    for (var s = size; s > 8; s -= 2) { c.font = s + 'px ' + font; if (c.measureText(text).width <= maxW) return s; }
    return 8;
  }

  function build(kit, B, root, opts) {
    opts = opts || {};
    var THREE = kit.THREE, SK = JG.setkit, C = SK.colours, FONT = SK.FONT, NOHULL = { hull: false, cam: false };
    function at(x, y, z, yaw) { return new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw || 0)); }
    function anchor(name, x, y, z) { var o = new THREE.Object3D(); o.name = 'office-' + name; o.position.set(x, y, z); root.add(o); return o; }
    function inked(geo, color, parent) {
      var m = new THREE.Mesh(geo, kit.mat.toon({ color: color }));
      m.add(new THREE.Mesh(kit.hull(geo, 0.006), kit.mat.ink()));
      if (parent) parent.add(m);
      return m;
    }

    // ============================================================================================== scanner kiosk
    var KX = K.x;
    B.box(KX - 0.18, 0, K.z0 - 0.02, KX + 0.18, 0.02, K.z1 - 0.02, 0x3a3f4a);                  // base plate
    B.box(KX - 0.05, 0.02, K.z0 + 0.06, KX + 0.05, 1.34, K.z0 + 0.16, 0x3a3f4a);               // column
    B.box(KX - 0.16, 1.34, K.z0, KX + 0.16, 2.0, K.z0 + 0.08, 0x262a33);                       // head unit
    B.box(KX - 0.16, 2.0, K.z0, KX + 0.16, 2.025, K.z0 + 0.08, C.yellow, NOHULL);               // a yellow cap
    // the lens: a black disc with a cyan ring, at Roo's eye height
    B.geo(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 14).rotateX(PI / 2), at(KX, K.lensY, K.z0 - 0.012), 0x111111);
    B.geo(new THREE.TorusGeometry(0.05, 0.007, 4, 16), at(KX, K.lensY, K.z0 - 0.022), 0x3fe0ff, NOHULL);
    // "stand here": two yellow footprints on the carpet
    [-0.09, 0.09].forEach(function (dx) {
      B.geo(new THREE.PlaneGeometry(0.1, 0.22).rotateX(-PI / 2), at(KX + dx, 0.006, LAYOUT.scanStand.pos[2] + 0.02), C.yellow, NOHULL);
    });
    // the face canvas (0.28 x 0.56, 192 x 384: 686 px/m): the sign band (FACE ID, a blinking dot) at the top, the lens
    // in the middle, the readout at the bottom (y 1.40..1.62)
    var KW = 0.28, KH = 0.56, KY = 1.67;
    var scr = SK.canvasPlane(kit, KW, KH, 192, 384);
    scr.mesh.position.set(KX, KY, K.z0 - 0.002); scr.mesh.rotation.y = PI; scr.mesh.name = 'office-scanner-screen';
    root.add(scr.mesh);
    var PXM = 384 / KH, lensPy = (KY + KH / 2 - K.lensY) * PXM;
    // the scan light (hidden when idle; no ink): a thin glowing line on Roo's face, laid along his snout and turned to
    // the camera (a soft cyan glow round a pale core, faded at both ends, additive, so it reads as light on the fur), moving down his face; a faint wedge of light from the lens over the whole face and a brighter
    // ray from the lens to the line (vertex-coloured additive triangles: bright at the lens, falling off to the face);
    // a soft glow on the lens itself
    var lineTex = kit.tex.canvas(64, 32, function (c, w, h) {
      var img = c.createImageData(w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var v = Math.abs((y + 0.5) / h - 0.5) * 2, u = (x + 0.5) / w, end = Math.min(1, Math.min(u, 1 - u) / 0.22);
        end = end * end * (3 - 2 * end);
        var halo = Math.exp(-v * v * 9) * 0.55, core = Math.max(0, 1 - v / 0.12), i = (y * w + x) * 4;
        d[i] = Math.round(40 + 160 * core); d[i + 1] = 255; d[i + 2] = Math.round(215 + 40 * core);
        d[i + 3] = Math.round(255 * Math.min(1, halo + core) * end);
      }
      c.putImageData(img, 0, 0);
    });
    var beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthFunc: THREE.GreaterDepth, side: THREE.DoubleSide }));
    beam.renderOrder = 4; beam.visible = false; beam.frustumCulled = false; beam.matrixAutoUpdate = false; beam.name = 'office-scan-beam'; root.add(beam);
    var fanGeo = new THREE.BufferGeometry();
    fanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    var FAN_COL = [0.016, 0.055, 0.06, 0, 0.006, 0.007, 0, 0.006, 0.007, 0.05, 0.17, 0.17, 0.006, 0.025, 0.025, 0.006, 0.025, 0.025];
    fanGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FAN_COL), 3));
    var fanMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    var fan = new THREE.Mesh(fanGeo, fanMat);
    fan.renderOrder = 3; fan.visible = false; fan.frustumCulled = false; fan.name = 'office-scan-fan'; root.add(fan);
    var lensGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: kit.tex.canvas(32, 32, function (c, w, h) {
      var g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(160,255,240,0.9)'); g.addColorStop(0.35, 'rgba(63,224,255,0.45)'); g.addColorStop(1, 'rgba(63,224,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lensGlow.position.set(KX, K.lensY, K.z0 - 0.026); lensGlow.rotation.y = PI; lensGlow.renderOrder = 3; lensGlow.visible = false; lensGlow.name = 'office-scan-lens';
    root.add(lensGlow);
    var bA = new THREE.Vector3(), bN = new THREE.Vector3(), bU = new THREE.Vector3(), bP = new THREE.Vector3(), bC = new THREE.Vector3(), bM = new THREE.Matrix4();
    var sc = { state: 'idle', variant: 'first', t: 0, okT: 0, sweepT: -1, sweepDur: 1.6, getFace: null, drawT: 1, key: '' };
    var kioskGroup = new THREE.Group(); kioskGroup.name = 'office-scanner'; root.add(kioskGroup);
    var lensWorld = new THREE.Vector3(KX, K.lensY, K.z0 - 0.02);

    function drawKiosk(force) {
      var blink = Math.floor(sc.t * 2) % 2 === 0, prog = sc.sweepT >= 0 ? Math.min(1, sc.sweepT / sc.sweepDur) : (sc.state === 'ok' ? 1 : 0);
      var key = sc.state + sc.variant + blink + Math.round(prog * 20);
      if (!force && key === sc.key) return;
      sc.key = key;
      scr.draw(function (c, w, h) {
        c.fillStyle = '#20242e'; c.fillRect(0, 0, w, h);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        // sign band
        c.fillStyle = '#111'; c.fillRect(0, 0, w, 62);
        c.fillStyle = '#FFD21F'; fitFont(c, T('scanner.sign'), w - 50, 36, FONT); c.fillText(T('scanner.sign'), w / 2 - 12, 34);
        c.fillStyle = blink ? (sc.state === 'ok' ? '#2FD27A' : '#E0218A') : '#3a3f4a';
        c.beginPath(); c.arc(w - 22, 31, 9, 0, PI * 2); c.fill();
        // the lens guide
        c.strokeStyle = sc.state === 'scan' ? '#3fe0ff' : 'rgba(63,224,255,.45)'; c.lineWidth = 4;
        c.beginPath(); c.arc(w / 2, lensPy, 46, 0, PI * 2); c.stroke();
        // the readout
        var x0 = 10, y0 = 222, rw = w - 20, rh = 156;
        c.fillStyle = sc.state === 'ok' ? '#1FA971' : '#0f2a4a'; c.fillRect(x0, y0, rw, rh);
        c.strokeStyle = '#111'; c.lineWidth = 4; c.strokeRect(x0, y0, rw, rh);
        c.fillStyle = '#fff';
        if (sc.state === 'idle') {
          c.strokeStyle = '#fff'; c.lineWidth = 4;
          c.beginPath(); c.ellipse(w / 2, y0 + 58, 28, 36, 0, 0, PI * 2); c.stroke();
          c.beginPath(); c.arc(w / 2 - 10, y0 + 52, 4, 0, PI * 2); c.arc(w / 2 + 10, y0 + 52, 4, 0, PI * 2); c.fill();
          fitFont(c, T('scanner.idle'), rw - 16, 28, FONT); c.fillText(T('scanner.idle'), w / 2, y0 + 126);
        } else if (sc.state === 'scan') {
          fitFont(c, T('scanner.scanning'), rw - 16, 30, FONT); c.fillText(T('scanner.scanning'), w / 2, y0 + 48);
          c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(x0 + 16, y0 + 88, rw - 32, 24);
          c.fillStyle = '#3fe0ff'; c.fillRect(x0 + 19, y0 + 91, (rw - 38) * prog, 18);
        } else {
          var again = sc.variant === 'again', big = T(again ? 'scanner.again' : 'scanner.name'), small = T(again ? 'scanner.againSub' : 'scanner.clearance');
          c.fillStyle = '#FFD21F'; c.strokeStyle = '#111'; c.lineWidth = 6;
          fitFont(c, big, rw - 14, 76, FONT); c.strokeText(big, w / 2, y0 + 64); c.fillText(big, w / 2, y0 + 64);
          c.fillStyle = '#fff'; fitFont(c, small, rw - 12, 22, FONT); c.fillText(small, w / 2, y0 + 128);
        }
      });
    }
    function showBeam(on) { beam.visible = fan.visible = lensGlow.visible = !!on; }
    function placeBeam(k) {
      var f = sc.getFace ? sc.getFace() : null, cam = JG.camera && JG.camera.object;
      if (!f || !cam) { showBeam(false); return; }
      // two passes down his face, brow to chin (the eyes anchor sits at his brow: -0.05 .. -0.165), each fading in and out
      var u = (k * 2) % 1, y = f.y - 0.05 - 0.115 * u, fade = Math.min(1, u / 0.08, (1 - u) / 0.08);
      // a: his facing (eyes to lens, level); the line runs along it, from behind the eye past the snout tip, and is
      // turned about it to face the camera. It is drawn only where something nearer than its plane covers it (depthFunc
      // Greater: the plane runs through the middle of his head, so only over his face, never in the air beside it)
      bA.set(lensWorld.x - f.x, 0, lensWorld.z - f.z).normalize();
      bP.set(f.x, y, f.z).addScaledVector(bA, 0.07);
      bN.copy(cam.position).sub(bP); bN.addScaledVector(bA, -bN.dot(bA)).normalize();
      bU.crossVectors(bN, bA);
      bM.makeBasis(bA, bU, bN).scale(bC.set(0.40, 0.05, 1)).setPosition(bP);
      beam.matrix.copy(bM); beam.matrixWorldNeedsUpdate = true;
      beam.material.opacity = fade;
      // the wedge (lens to the front of his face, brow to chin) and the ray (lens to the line)
      var p = fanGeo.attributes.position, fx = f.x + bA.x * 0.17, fz = f.z + bA.z * 0.17;
      p.setXYZ(0, lensWorld.x, lensWorld.y, lensWorld.z);
      p.setXYZ(1, fx, f.y - 0.04, fz);
      p.setXYZ(2, fx, f.y - 0.19, fz);
      p.setXYZ(3, lensWorld.x, lensWorld.y, lensWorld.z);
      p.setXYZ(4, f.x + bA.x * 0.22, y, f.z + bA.z * 0.22);
      p.setXYZ(5, f.x - bA.x * 0.04, y, f.z - bA.z * 0.04);
      p.needsUpdate = true;
      var c = fanGeo.attributes.color;
      for (var i = 3; i < 6; i++) c.setXYZ(i, FAN_COL[i * 3] * fade, FAN_COL[i * 3 + 1] * fade, FAN_COL[i * 3 + 2] * fade);
      c.needsUpdate = true;
      showBeam(true);
    }
    var scanner = {
      object: kioskGroup,
      // beep: the BEEP! lettering's anchor, past the kiosk's +X edge (away from Roo in the readout insert)
      anchors: { screen: anchor('scanner-screen', KX, 1.51, K.z0 - 0.01), lens: anchor('scanner-lens', KX, K.lensY, K.z0 - 0.02), sign: anchor('scanner-sign', KX, 1.91, K.z0 - 0.01),
        beep: anchor('scanner-beep', KX + 0.36, 1.35, K.z0 - 0.01) },
      state: function (s, variant) { sc.state = s; if (variant) sc.variant = variant; sc.okT = 0; if (s !== 'scan') { sc.sweepT = -1; showBeam(false); } drawKiosk(true); },
      sweep: function (getFace, sec) { sc.getFace = getFace; sc.sweepDur = sec || 1.6; sc.sweepT = 0; sc.state = 'scan'; placeBeam(0); drawKiosk(true); },
      now: function () { return sc.state; },
      reset: function () { sc.state = 'idle'; sc.variant = 'first'; sc.okT = 0; sc.sweepT = -1; sc.getFace = null; showBeam(false); drawKiosk(true); }
    };
    function updateScanner(dt) {
      sc.t += dt;
      if (sc.sweepT >= 0) {
        sc.sweepT += dt;
        if (sc.sweepT >= sc.sweepDur) { sc.sweepT = -1; showBeam(false); }
        else placeBeam(sc.sweepT / sc.sweepDur);
      }
      if (sc.state === 'ok') { sc.okT += dt; if (sc.okT >= 4) { sc.state = 'idle'; sc.okT = 0; } }
      sc.drawT += dt;
      if (sc.drawT >= 0.1) { sc.drawT = 0; drawKiosk(false); }
    }

    // ============================================================================================== water cooler
    var cx = (CO.x0 + CO.x1) / 2, cz = (CO.z0 + CO.z1) / 2;
    B.box(CO.x0, 0, CO.z0, CO.x1, CO.top, CO.z1, 0xeeeef2);                                     // cabinet
    B.box(CO.x0 + 0.03, 0.84, CO.z0 - 0.004, CO.x1 - 0.03, 1.03, CO.z0, 0xb8c4d2, NOHULL);         // the dispensing recess
    B.box(CO.x0 + 0.03, 0.85, CO.z0 - 0.07, CO.x1 - 0.03, 0.875, CO.z0, 0x3a3f4a);                 // drip tray
    var tapY = TIP.h, redX = CO.tapX + 0.12;
    B.box(CO.tapX - 0.022, tapY - 0.02, CO.tapZ - 0.012, CO.tapX + 0.022, tapY + 0.02, CO.z0, C.blue);   // cold tap
    B.box(redX - 0.022, tapY - 0.02, CO.tapZ - 0.012, redX + 0.022, tapY + 0.02, CO.z0, 0xd6333f);      // hot tap
    B.geo(kit.geo.cyl(0.09, 0.09, 0.04, 12), at(cx, CO.top, cz), 0xc9ced8);                       // collar
    B.geo(kit.geo.cyl(0.06, 0.06, 0.06, 10), at(cx, CO.top + 0.03, cz), 0x8ec9f0);                 // the bottle's neck
    B.geo(kit.geo.cyl(0.15, 0.15, 0.40, 12), at(cx, CO.top + 0.08, cz), 0x8ec9f0);                 // the bottle
    B.geo(kit.geo.cyl(0.152, 0.152, 0.03, 12), at(cx, CO.top + 0.26, cz), 0x6fb3e0, NOHULL);       // a ridge
    B.geo(kit.geo.cyl(0.035, 0.035, 0.4, 8), at(CO.x0 - 0.035, 0.55, cz), 0xf7f7f2);               // paper-cup tube
    // bubbles: four small icosahedra, one mesh, rising in the bottle while it glugs
    var bparts = [[0.03, 0, 0.02, 0.022], [-0.05, 0.07, -0.03, 0.016], [0.06, 0.15, -0.02, 0.019], [-0.02, 0.22, 0.05, 0.014]].map(function (b) {
      return { geometry: new THREE.IcosahedronGeometry(b[3], 0), matrix: new THREE.Matrix4().makeTranslation(b[0], b[1], b[2]) };
    });
    var bg = kit.geo.merge(bparts); ['skinIndex', 'skinWeight', 'color'].forEach(function (a) { if (bg.getAttribute(a)) bg.deleteAttribute(a); });
    bparts.forEach(function (p) { p.geometry.dispose(); });
    var bubbles = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    bubbles.visible = false; bubbles.name = 'office-cooler-bubbles'; root.add(bubbles);
    // the coffee Roo forgets on the cooler (parkMug)
    var mugGeo = new THREE.CylinderGeometry(0.036, 0.032, 0.085, 8).translate(0, 0.0425, 0);
    var parked = new THREE.Group(); parked.name = 'office-cooler-mug';
    inked(mugGeo, 0xF4F1E8, parked);
    inked(new THREE.TorusGeometry(0.022, 0.007, 4, 8).translate(0.04, 0.045, 0), 0xF4F1E8, parked);
    var parkedTop = new THREE.Mesh(new THREE.CircleGeometry(0.031, 8).rotateX(-PI / 2).translate(0, 0.078, 0), kit.mat.toon({ color: 0x6B3F22 })); parked.add(parkedTop);
    parked.position.set(CO.x1 - 0.026, CO.top, CO.z0 + 0.026); parked.rotation.y = -2.2; parked.visible = false; root.add(parked);
    var gl = { t: -1, dur: 0 };
    var cooler = {
      object: parked,
      anchors: { tap: anchor('cooler-tap', CO.tapX, tapY, CO.tapZ), top: anchor('cooler-top', cx, CO.top + 0.55, cz), cups: anchor('cooler-cups', CO.x0 - 0.035, 0.95, cz) },
      glug: function (sec) { gl.t = 0; gl.dur = sec || 1.2; bubbles.visible = true; },
      parkMug: function (on) { parked.visible = !!on; },
      parked: function () { return parked.visible; },
      reset: function () { gl.t = -1; bubbles.visible = false; parked.visible = false; }
    };
    function updateCooler(dt) {
      if (gl.t < 0) return;
      gl.t += dt;
      if (gl.t >= gl.dur) { gl.t = -1; bubbles.visible = false; return; }
      bubbles.position.set(cx, CO.top + 0.12 + ((gl.t * 1.7) % 1) * 0.12, cz);
    }

    // ============================================================================================== coffee machine
    // the placed piece's bounds (rot -90: its front faces -X); the head unit's front and the spout from the source's
    // profile (CoffeeMachine.glb at 0.72: drip tray top 0.144 above the counter, the head's front 0.05 behind the tray's)
    var cm = opts.coffee || { min: [CF.minX, 0.9, CF.z - 0.145], max: [CF.minX + 0.48, 1.36, CF.z + 0.145] };
    var trayY = cm.min[1] + 0.144, headX = cm.min[0] + 0.037, spoutX = cm.min[0] + 0.085, topY = cm.max[1], midX = (cm.min[0] + cm.max[0]) / 2;
    var bz = CF.button[2];
    B.box(CF.button[0] - 0.015, CF.button[1] - 0.02, bz - 0.02, CF.button[0], CF.button[1] + 0.02, bz + 0.02, 0xd6333f);   // the button
    // the screen: 2 cm higher, on a dark housing (no ink) that stands out to the drip tray's front, so it is in front
    // of the spout bracket and its ink (which reach to the tray's front) and no ink line crosses the text in the insert
    // (office-walk.coffeeScreen looks at it from close up); its canvas is drawn at 3x (384 x 216) so the insert is crisp
    var csY = cm.min[1] + 0.39, csX = cm.min[0] - 0.007, CSW = 0.13, CSH = 0.073, CSS = 3;
    B.box(csX + 0.0015, csY - CSH / 2 - 0.008, CF.z - CSW / 2 - 0.008, headX + 0.004, csY + CSH / 2 + 0.008, CF.z + CSW / 2 + 0.008, 0x1a1c22, NOHULL);
    var cs = SK.canvasPlane(kit, CSW, CSH, 128 * CSS, 72 * CSS);
    cs.mesh.position.set(csX, csY, CF.z); cs.mesh.rotation.y = -PI / 2; cs.mesh.name = 'office-coffee-screen';
    root.add(cs.mesh);
    var cof = { step: 1, brew: false, t: 0, drawT: 1, key: '', fillT: -1, fillDur: 2.2, puffT: 0 };
    function drawCoffee(force) {
      var crawl = Math.floor(cof.t * 3) % 4, key = cof.step + ':' + cof.brew + ':' + crawl + ':' + (cof.fillT >= 0 ? Math.round(cof.fillT * 5) : -1);
      if (!force && key === cof.key) return;
      cof.key = key;
      cs.draw(function (c) {
        var w = 128, h = 72;   // drawn in 128 x 72 units, scaled to the canvas
        c.setTransform(CSS, 0, 0, CSS, 0, 0);
        c.fillStyle = '#0d1a12'; c.fillRect(0, 0, w, h);
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#7CFF9A';
        if (cof.brew) {
          fitFont(c, T('coffee.brewing'), w - 10, 26, FONT); c.fillText(T('coffee.brewing'), w / 2, 26);
          var k = cof.fillT >= 0 ? Math.min(1, cof.fillT / cof.fillDur) : 1;
          c.strokeStyle = '#7CFF9A'; c.lineWidth = 2; c.strokeRect(10, 46, w - 20, 14); c.fillRect(12, 48, (w - 24) * k, 10);
        } else {
          fitFont(c, T('coffee.firmware'), w - 8, 15, FONT); c.fillText(T('coffee.firmware'), w / 2, 16);
          var st = String(T('coffee.step')).replace('{n}', cof.step);
          fitFont(c, st, w - 10, 24, FONT); c.fillText(st, w / 2, 38);
          for (var i = 0; i < 4; i++) { c.fillStyle = i === crawl ? '#7CFF9A' : '#24452f'; c.fillRect(24 + i * 22, 56, 16, 8); }
        }
      });
    }
    // the mug: appears under the spout, coffee rising in it
    var mug = new THREE.Group(); mug.name = 'office-coffee-mug';
    inked(mugGeo, 0xF4F1E8, mug);
    inked(new THREE.TorusGeometry(0.022, 0.007, 4, 8).translate(0.04, 0.045, 0), 0xF4F1E8, mug);
    var fill = new THREE.Mesh(new THREE.CircleGeometry(0.031, 8).rotateX(-PI / 2), kit.mat.toon({ color: 0x6B3F22 }));
    mug.add(fill);
    mug.position.set(spoutX, trayY, CF.z); mug.rotation.y = PI * 0.75; mug.visible = false; root.add(mug);
    // steam: three soft sprites
    var puffTex = kit.tex && kit.tex.canvas ? kit.tex.canvas(64, 64, function (c, w, h) {
      var g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }) : null;
    var steam = [0, 1, 2].map(function (i) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.name = 'office-steam-' + i; root.add(s);
      return { s: s, t: -1, from: new THREE.Vector3() };
    });
    function puff(i, x, y, z, delay) { var p = steam[i]; p.t = -(delay || 0); p.from.set(x, y, z); }
    function updateSteam(dt) {
      steam.forEach(function (p, i) {
        if (p.t === -1 && !p.s.visible) return;
        p.t += dt;
        if (p.t < 0) return;
        var k = p.t / 1.6;
        if (k >= 1) { p.t = -1; p.s.visible = false; return; }
        p.s.visible = true;
        p.s.position.set(p.from.x + Math.sin(k * 5 + i) * 0.02, p.from.y + k * 0.28, p.from.z + Math.cos(k * 4 + i) * 0.015);
        var sz = 0.05 + k * 0.14; p.s.scale.set(sz, sz, sz);
        p.s.material.opacity = 0.6 * Math.sin(PI * Math.min(1, k * 1.2));
      });
    }
    var coffee = {
      object: mug,
      anchors: { spout: anchor('coffee-spout', spoutX, trayY + 0.12, CF.z), button: anchor('coffee-button', CF.button[0], CF.button[1], bz),
        screen: anchor('coffee-screen', csX, csY, CF.z), top: anchor('coffee-top', midX, topY + 0.05, CF.z) },
      firmware: function (step) { if (step === 'brew') cof.brew = true; else { cof.brew = false; cof.step = step; } drawCoffee(true); },
      brew: function (sec) {
        cof.brew = true; cof.fillDur = sec || 2.2; cof.fillT = 0; mug.visible = true; fill.position.y = 0.012;
        puff(0, midX, topY, CF.z, 0); puff(1, spoutX, trayY + 0.1, CF.z, 0.7); puff(2, midX, topY, CF.z, 1.3);
        drawCoffee(true);
      },
      take: function () { mug.visible = false; cof.fillT = -1; },
      now: function () { return cof.brew ? (mug.visible ? 'brewing' : 'brewed') : 'firmware ' + cof.step; },
      reset: function () { cof.step = 1; cof.brew = false; cof.fillT = -1; cof.puffT = 0; mug.visible = false; steam.forEach(function (p) { p.t = -1; p.s.visible = false; }); drawCoffee(true); }
    };
    function updateCoffee(dt) {
      cof.t += dt;
      if (cof.fillT >= 0) {
        cof.fillT += dt;
        var k = Math.min(1, cof.fillT / cof.fillDur);
        fill.position.y = 0.012 + 0.066 * k;
        if (k >= 1) cof.fillT = -1;
      }
      // an idle steam puff from the machine every 6 s (it is always warming up)
      cof.puffT += dt;
      if (cof.puffT >= 6) { cof.puffT = 0; if (!steam[0].s.visible && steam[0].t === -1) puff(0, midX, topY, CF.z, 0); }
      updateSteam(dt);
      cof.drawT += dt;
      if (cof.drawT >= 0.1) { cof.drawT = 0; drawCoffee(false); }
    }

    // ============================================================================================== the desk mug
    // the coffee he made, on the hero desk from desk-sit on (the beats show it when office-walk ended with it in hand)
    var dm = opts.deskMug || [0, 0, 0];
    var deskMugG = new THREE.Group(); deskMugG.name = 'office-desk-mug';
    inked(mugGeo, 0xF4F1E8, deskMugG);
    inked(new THREE.TorusGeometry(0.022, 0.007, 4, 8).translate(0.04, 0.045, 0), 0xF4F1E8, deskMugG);
    deskMugG.add(new THREE.Mesh(new THREE.CircleGeometry(0.031, 8).rotateX(-PI / 2).translate(0, 0.07, 0), kit.mat.toon({ color: 0x6B3F22 })));
    deskMugG.position.set(dm[0], dm[1], dm[2]); deskMugG.rotation.y = -2.4; deskMugG.visible = false; root.add(deskMugG);
    var deskMug = {
      object: deskMugG, anchors: {},
      show: function (on) { deskMugG.visible = !!on; },
      shown: function () { return deskMugG.visible; },
      reset: function () { deskMugG.visible = false; }
    };

    var live = false;
    drawKiosk(true); drawCoffee(true);
    return {
      scanner: scanner, cooler: cooler, coffee: coffee, deskMug: deskMug,
      update: function (dt) { if (!live) return; updateScanner(dt); updateCooler(dt); updateCoffee(dt); },
      reset: function () { scanner.reset(); cooler.reset(); coffee.reset(); deskMug.reset(); },
      live: function (on) { live = !!on; }
    };
  }

  JG.officeProps = { LAYOUT: LAYOUT, build: build };
})();
