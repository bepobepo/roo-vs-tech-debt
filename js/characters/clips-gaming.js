/* Roo on the rooftop couch (round 2, rooftop-call): the gaming clips and the stand-in game controller. OWNER: the
 * story/crowd agent (round 2). Data only at load: JG.clips bakes the clips per rig on first use; the controller mesh
 * is built only when a beat asks for it.
 *   roo.seatedGaming   code: seated (JG.anim.P.seat, the library sit's hips, so it cuts with seatedIdle), leaning in,
 *                      both hands forward at the belly holding a controller, thumbs working, head on the TV
 *   roo.seatedPhone    code (round 2c): the chair sit, the right hand bringing the phone to the side of his head (the
 *                      library phone arm over the sit stopped short of it), the left hand on his thigh
 *   roo.standUp        the library Sitting_Exit as a contract clip (a compose of the clip with itself: the clip
 *                      engine plays library clips by contract id only through the asset map or a compose)
 *   JG.gaming.controller(kit, scale) -> Group   a small unbranded gamepad (one merged vertex-coloured mesh and its hull;
 *                                        scale 1 is a human-size pad, Roo's gloves want about 1.6)
 *   JG.gaming.hold(ctl, actor)           puts the pad between the actor's hands (call every tick while held)
 *   JG.gaming.rest(ctl, actor, [x,y,z])  puts the pad down at a point in the actor's root frame
 *   JG.gaming.pauseOverlay(kit, screen, text) -> {mesh, remove()}   a pause menu over a TV screen mesh */
(function () {
  'use strict';
  var JG = window.JG, C = JG.clips, R = JG.anim.route;
  function A() { return JG.anim.P; }
  function D(P) { return JG.anim.P.dims(P); }

  // ---------------------------------------------------------------- roo.seatedGaming
  // b in 0..1 alternates the thumbs (a small wrist roll per hand) and a slight lean of the whole upper body
  function gaming(P, b, c) {
    A().seat(P, { arms: false, recline: -0.1 - 0.015 * c });
    // round 2c: the wrists sit apart at the pad's grips (they used to meet and the gloves overlapped), the palms turned
    // in and up round the grips so the thumbs rest on the face of the pad
    var d = D(P), x = -(d.shoulderX - GRIP_X);
    ['l', 'r'].forEach(function (s, i) {
      var k = i === 0 ? b : 1 - b;
      A().arm(P, s, [x, -0.3 + 0.008 * c, 0.3], {
        elbow: [1, -0.6, -0.35],
        hand: { dir: [0.02, 0.26 + 0.06 * k, 1], palm: [-0.8, 0.6, 0] },
        curl: 0.42
      });
      try { P.rotLocal('hand_' + s, 0.05 * k, 0, 0); } catch (e) { /* rig without that helper */ }
    });
    A().head(P, 0.02 + 0.02 * c, 0, 0);
  }
  var GRIP_X = 0.17;   // the wrists' distance from the centre line, metres (the 1.6 pad's grips are 0.32 m apart)
  C.define('roo.seatedGaming', { duration: 1.2, loop: true, keys: [
    { t: 0, pose: function (P) { gaming(P, 0, 0); } },
    { t: 0.3, pose: function (P) { gaming(P, 1, 0.5); } },
    { t: 0.6, pose: function (P) { gaming(P, 0, 1); } },
    { t: 0.9, pose: function (P) { gaming(P, 1, 0.5); } },
    { t: 1.2, pose: function (P) { gaming(P, 0, 0); } }
  ] });

  // ---------------------------------------------------------------- roo.seatedPhone, roo.standUp
  // round 2c: a code clip, so the phone reaches the side of his head (the library phone arm over the sit stopped a few
  // cm short of it): the same chair sit as the library clips, the left hand on his thigh, the right wrist under the
  // jaw hinge with the phone in the palm against the cheek, the head tipped into it, a slow nod while he listens
  function phoneTalk(P, c) {
    A().seat(P, { arms: false, recline: -0.06 });
    A().arm(P, 'l', [0.0, -0.44, 0.3], { elbow: [0.5, -0.4, -0.7], hand: { dir: [-0.2, -0.35, 1], palm: [-0.3, -1, 0] }, curl: 0.3 });
    A().head(P, 0.03 + 0.04 * c, 0.06, -0.1);
    A().armTo(P, 'r', A().headPoint(P, PHONE_AT, 'r'), { elbow: [0.55, -1, 0.15], clav: [0.12, 0.05], hand: { dir: [0.05, 1, 0.3], palm: [-1, 0, 0.25] }, curl: 0.45 });
  }
  var PHONE_AT = [0.095, -0.08, 0.015];   // the right wrist from the Head joint (outward, down, forward), metres
  C.define('roo.seatedPhone', { duration: 2.4, loop: true, keys: [
    { t: 0, pose: function (P) { phoneTalk(P, 0); } },
    { t: 1.2, pose: function (P) { phoneTalk(P, 1); } },
    { t: 2.4, pose: function (P) { phoneTalk(P, 0); } }
  ] });
  C.compose('roo.standUp.clip', { base: 'Sitting_Exit', over: 'Sitting_Exit', mask: 'upper' });
  R('roo.standUp', { clip: 'roo.standUp.clip' });

  // ---------------------------------------------------------------- the controller (built on demand)
  var COL = { body: 0x2B2F3A, grip: 0x22252E, stick: 0x111111, a: 0x2FA36B, b: 0xE0218A, x: 0x1F4FD8, y: 0xFFD21F, pad: 0xC9CED8 };
  function controller(kit, scale) {
    var THREE = kit.THREE, parts = [], sc = scale || 1;
    function add(geo, color, x, y, z, rx, ry, rz) {
      var g = geo.index ? geo.toNonIndexed() : geo;
      var m = new THREE.Matrix4().compose(new THREE.Vector3((x || 0) * sc, (y || 0) * sc, (z || 0) * sc),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sc, sc, sc));
      g.applyMatrix4(m);
      parts.push({ g: g, c: new THREE.Color(color) });
    }
    // pad frame: x across the pad, y up (the face with the buttons), z away from the player
    add(new THREE.BoxGeometry(0.105, 0.026, 0.052), COL.body, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.021, 0.017, 0.07, 10), COL.grip, -0.05, -0.006, -0.03, 1.15, 0, 0.25);
    add(new THREE.CylinderGeometry(0.021, 0.017, 0.07, 10), COL.grip, 0.05, -0.006, -0.03, 1.15, 0, -0.25);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10), COL.stick, -0.026, 0.017, -0.006);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10), COL.stick, 0.012, 0.017, -0.014);
    add(new THREE.BoxGeometry(0.018, 0.006, 0.006), COL.pad, -0.03, 0.015, 0.012);
    add(new THREE.BoxGeometry(0.006, 0.006, 0.018), COL.pad, -0.03, 0.015, 0.012);
    [['a', 0.034, 0.002], ['b', 0.043, 0.011], ['x', 0.025, 0.011], ['y', 0.034, 0.02]].forEach(function (k) {
      add(new THREE.SphereGeometry(0.0045, 8, 6), COL[k[0]], k[1], 0.015, k[2]);
    });
    var n = 0;
    parts.forEach(function (p) { n += p.g.attributes.position.count; });
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), o = 0;
    parts.forEach(function (p) {
      var P = p.g.attributes.position, N = p.g.attributes.normal;
      for (var i = 0; i < P.count; i++, o++) {
        pos[o * 3] = P.getX(i); pos[o * 3 + 1] = P.getY(i); pos[o * 3 + 2] = P.getZ(i);
        nor[o * 3] = N.getX(i); nor[o * 3 + 1] = N.getY(i); nor[o * 3 + 2] = N.getZ(i);
        col[o * 3] = p.c.r; col[o * 3 + 1] = p.c.g; col[o * 3 + 2] = p.c.b;
      }
      p.g.dispose();
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    var grp = new THREE.Group();
    grp.name = 'prop-controller';
    var mesh = new THREE.Mesh(geo, kit.mat.vertexToon());
    grp.add(mesh);
    try { var h = new THREE.Mesh(kit.hull(geo, 0.004 * sc), kit.mat.ink()); h.userData.jgHull = true; mesh.add(h); } catch (e) { /* no hull */ }
    return grp;
  }

  var tmpA = null, tmpB = null, tmpQ = null;
  /** the pad between the actor's hands, its face turned up and toward the actor's front */
  function hold(pad, actor) {
    var THREE = window.THREE, an = actor && actor.anchors;
    if (!pad || !an || !an.handL || !an.handR) return;
    tmpA = tmpA || new THREE.Vector3(); tmpB = tmpB || new THREE.Vector3(); tmpQ = tmpQ || new THREE.Quaternion();
    actor.root.updateMatrixWorld(true);
    an.handL.getWorldPosition(tmpA); an.handR.getWorldPosition(tmpB);
    pad.position.addVectors(tmpA, tmpB).multiplyScalar(0.5);
    // a little in front of the wrists and up, where the palms close round the grips
    var yaw = actor.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    pad.position.x += fx * 0.07; pad.position.z += fz * 0.07; pad.position.y += 0.035;
    pad.rotation.set(-0.5, 0, 0, 'YXZ');
    pad.rotation.y = yaw;
  }
  /** the pad put down at v = [x, y, z] in the actor's root frame (+z its front, +x its left), lying flat */
  function rest(pad, actor, v) {
    if (!pad || !actor) return;
    var yaw = actor.root.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw), p = actor.root.position;
    pad.position.set(p.x + v[0] * c + v[2] * s, p.y + v[1], p.z - v[0] * s + v[2] * c);
    pad.rotation.set(0, yaw + 0.5, 0, 'YXZ');
  }

  /** a pause menu laid over a TV screen mesh (a child of it, a few mm in front): the picture dimmed, PAUSED and two
   *  menu lines in our own comic lettering. The screen keeps whatever it shows underneath (the set's API has no freeze). */
  function pauseOverlay(kit, screen, text) {
    var THREE = kit.THREE, prm = screen && screen.geometry && screen.geometry.parameters;
    if (!prm || !prm.width) return null;
    var W = 512, H = Math.max(64, Math.round(W * prm.height / prm.width));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.fillStyle = 'rgba(8,10,16,0.72)'; c.fillRect(0, 0, W, H);
    var fs = Math.round(H * 0.2);
    c.font = '400 ' + fs + 'px "Bangers", "Impact", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = Math.max(4, fs * 0.14); c.strokeStyle = '#111111';
    c.strokeText(text || 'PAUSED', W / 2, H * 0.38);
    c.fillStyle = '#FFD21F'; c.fillText(text || 'PAUSED', W / 2, H * 0.38);
    c.font = '700 ' + Math.round(H * 0.075) + 'px "Comic Neue", sans-serif';
    c.fillStyle = '#FFF8E7';
    c.fillText('\u25B6 RESUME', W / 2, H * 0.62);
    c.fillStyle = 'rgba(255,248,231,0.6)';
    c.fillText('OPTIONS', W / 2, H * 0.74);
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(prm.width, prm.height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: false, depthWrite: false }));
    m.name = 'tv-paused';
    m.position.z = 0.004;
    m.renderOrder = 3;
    screen.add(m);
    return {
      mesh: m,
      remove: function () { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); tex.dispose(); }
    };
  }

  JG.gaming = { controller: controller, hold: hold, rest: rest, pauseOverlay: pauseOverlay };
})();
