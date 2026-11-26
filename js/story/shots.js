/* JG.shots: every authored camera shot of the story (plan section 6, Camera), plus JG.story, the small helper set
 * the act files share. OWNER: E2 (story). Classic IIFE; data and functions only, touches neither THREE nor the DOM
 * at load.
 *
 * Shot = {pos, look, fov, rel?, fit?}. Every shot is relative to a contract marker (or, for the few that follow an
 * actor after it has turned, the actor's root), so E4 can move the sets without touching this file:
 *   - rel frame: x and z are rotated by the marker's yaw, then translated; +z is the way the marker faces (the way an
 *     actor standing on it looks), +y is up from the marker's floor height;
 *   - fov is the vertical FOV at 16:9 (camera.js widens it for narrower aspects);
 *   - fit pulls the camera back along its view line until the listed anchors fit.
 * Naming: '<beatId>.<what>'. A beat may also reuse a shot from another beat.
 *
 * JG.story (shared by act1..act4.js):
 *   T(key)                         JG.text
 *   hold(w, t0, total)             waits until `total` seconds of game time have passed since t0 (beat pacing)
 *   playFor(w, a, clip, sec, o)    starts a clip (never waits on its own length) and waits `sec`; timing stays fixed
 *                                  whatever length the library, code or stub clip has
 *   start(w, a, clip, o)           starts a clip and returns at once (loop by default)
 *   ui(path, ...args)              calls JG.ui.<path>(...) if it exists, never throws (beats' direct UI calls)
 *   at(marker, [x, y, z])          a world point [x, y, z] in a marker's frame (same convention as shots)
 *   spot(marker, [x, y, z], dyaw)  {pos, yaw} in a marker's frame, for w.place
 *   lerp(markerA, markerB, k, dy)  a world point between two markers
 *   cape(a, mode)  attach(a, prop, anchor)  safe actor calls (stub actors may lack them)
 *   coverOut(w, kind, sec)         plays the 'in' half of a transition (cover) at the end of a beat and waits; the
 *                                  next beat's stage starts with ui.fade 1 and opens with w.fadeIn (see report)
 *   couch(v)  couchSpot()          (round 2) a world point in the roof.couch frame; the stage placement on the couch
 *   tvPoint(v)  tv()               (round 2) the TV screen centre (roof.tv); the city's props.tv or null (no stub hit) */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};

  var S = {
    // ---------------------------------------------------------------- city / roof
    // round 2: Roo on the couch at roof.couch (+z the way he faces: the TV at roof.tv). Function shots, so the couch and
    // TV frames fall back cleanly while a set lacks the markers (see couchFrame below)
    'rooftop-call.tv': function () { var S = JG.story; return { pos: S.couch([-0.62, 1.4, -1.5]), look: S.tvPoint([0, -0.08, 0]), fov: 44 }; },
    'rooftop-call.gamer': function () { var S = JG.story; return { pos: S.couch([-1.05, 1.12, 1.7]), look: S.couch([0.05, 0.99, 0]), fov: 40 }; },   // headroom over the ears for the RING! lettering
    'rooftop-call.paused': function () { var S = JG.story; return { pos: S.couch([0.95, 1.62, -1.75]), look: S.tvPoint([0, -0.12, 0]), fov: 46 }; },
    'rooftop-call.wide': function () { var S = JG.story; return { pos: S.couch([2.5, 1.85, 2.6]), look: S.couch([0, 0.75, 0.2]), fov: 44 }; },
    'rooftop-call.phone': function () { var S = JG.story; return { pos: S.couch([1.0, 1.15, 1.55]), look: S.couch([0, 0.95, -0.25]), fov: 36, fit: ['roo.head', 'roo.handR'] }; },
    'rooftop-call.stand': function () { var S = JG.story; return { pos: S.couch([2.0, 1.45, 2.0]), look: S.couch([0, 1.05, 0]), fov: 42 }; },
    'rooftop-call.hero': function () { var S = JG.story; return { pos: S.couch([-1.7, 0.45, 2.1]), look: S.couch([0, 1.4, 0]), fov: 42 }; },

    'rooftop-walk.edge': { rel: 'roof.spawn', pos: [0.9, 2.1, -1.8], look: [0, 0.6, 6], fov: 50 },
    // the couch gag (2026-11-26): from the middle of the roof, back at Roo wherever he stands behind the couch, the
    // couch, the paused TV and the console behind him. A function shot in his own frame (he may stand anywhere in
    // roof.console); fit keeps his head and both hands in a portrait frame
    'rooftop-walk.joking': function () {
      var p = JG.world.actor('roo').root.position;
      return { pos: [p.x + 1.55, p.y + 1.5, p.z - 2.75], look: [p.x - 0.1, p.y + 1.22, p.z], fov: 40, fit: ['roo.head', 'roo.handL', 'roo.handR'] };
    },
    'rooftop-jump.edge': { rel: 'roof.edgeStand', pos: [-1.1, 1.95, -2.7], look: [0.2, 0.4, 5.5], fov: 48 },
    'rooftop-jump.front': { rel: 'roof.jumpFrom', pos: [1.4, -0.7, 3.6], look: [0, 1.0, 0], fov: 44 },
    // the fall: a fixed camera on the street that tilts from the jump point down to the landing mark with the arc
    'rooftop-jump.fallTop': function () { var S = JG.story; return { pos: S.at('streetA.land', [-6, 2.2, 7.5]), look: S.at('roof.jumpFrom', [0, 0.9, 0]), fov: 50 }; },
    'rooftop-jump.fall': { rel: 'streetA.land', pos: [-6, 2.2, 7.5], look: [0, 1.0, 0], fov: 50 },
    'rooftop-jump.land': { rel: 'streetA.land', pos: [1.3, 0.5, 3.4], look: [0, 0.8, 0], fov: 40 },
    'rooftop-jump.rise': { rel: 'streetA.land', pos: [1.8, 1.2, 4.2], look: [0, 1.3, 0], fov: 40 },

    // ---------------------------------------------------------------- city / streetA, streetB
    'street-subway.stairs': { rel: 'streetA.stairsTop', pos: [1.5, 2.5, -1.9], look: [0, -1.4, 3.2], fov: 50 },
    'plaza-walk.exit': { rel: 'streetB.spawn', pos: [2.2, 1.7, 3.6], look: [0, -0.8, -2.8], fov: 48 },
    'plaza-walk.doors': { rel: 'streetB.elevatorMark', pos: [0.8, 1.65, 5.4], look: [0, 1.35, 0], fov: 44 },

    // ---------------------------------------------------------------- subway
    'subway-ride.wide': { rel: 'subway.rooSeat', pos: [4.2, 1.5, 1.2], look: [-0.5, 0.95, 1.2], fov: 50 },
    'subway-ride.two': { rel: 'subway.rooSeat', pos: [2.0, 1.3, 1.2], look: [0, 0.9, 1.2], fov: 55 },
    'subway-ride.roo': { rel: 'subway.rooSeat', pos: [0.3, 1.15, 1.6], look: [0, 1.05, 0], fov: 36, fit: ['roo.head'] },
    'subway-ride.lady': { rel: 'subway.ladySeat', pos: [-0.3, 1.05, 1.6], look: [0, 0.95, 0], fov: 36 },
    'subway-wink.wide': { rel: 'subway.rooSeat', pos: [2.4, 1.35, 1.2], look: [0, 0.9, 1.2], fov: 52 },
    'subway-wink.close': { rel: 'subway.rooSeat', pos: [0.15, 1.15, 2.0], look: [0, 1.0, 0], fov: 34 },

    // ---------------------------------------------------------------- office / elevator
    'elevator-ride.corner': { rel: 'office.elevatorMark', pos: [0.85, 1.95, 0.95], look: [0, 1.3, 0], fov: 62 },
    // the car's floor display hangs over the doors at about [0, 2.3, 1.14] in this frame and faces Roo:
    // display = a low angle from his front right, Roo looking up at the count; floor = the insert on the display alone
    'elevator-ride.display': { rel: 'office.elevatorMark', pos: [1.1, 1.0, 0.1], look: [-0.2, 1.95, 0.75], fov: 55 },
    'elevator-ride.floor': { rel: 'office.elevatorMark', pos: [0.55, 1.45, 0.25], look: [0, 2.1, 1.08], fov: 42 },
    'elevator-ride.face': { rel: 'office.elevatorMark', pos: [0.25, 1.6, 0.95], look: [0, 1.55, 0], fov: 40 },

    // ---------------------------------------------------------------- office / plea, choice, hug
    'ops-plea.doors': { rel: 'office.elevatorOut', pos: [0.7, 1.55, 3.4], look: [0, 1.3, -1.5], fov: 45 },
    'ops-plea.run': { rel: 'office.opsPlea', pos: [-0.6, 1.75, 2.4], look: [2, 1.0, -4], fov: 50 },
    'ops-plea.two': { rel: 'office.opsPlea', pos: [-3.2, 1.5, 0.8], look: [0, 1.25, 0.8], fov: 40, fit: ['roo.head', 'ops.head'] },
    'ops-plea.ops': { rel: 'office.opsPlea', pos: [0.75, 1.95, 3.0], look: [0, 1.4, 0], fov: 34 },
    'ops-plea.roo': { rel: 'office.elevatorOut', pos: [-0.4, 1.65, 2.2], look: [0, 1.5, 0], fov: 36 },
    'choice.two': { rel: 'office.opsPlea', pos: [-2.8, 1.45, 0.8], look: [0, 1.2, 0.8], fov: 40, fit: ['roo.head', 'ops.head'] },
    'choice.wide': { rel: 'office.opsPlea', pos: [-4.2, 2.2, 0.2], look: [0, 1.1, 0.8], fov: 44 },
    'office-walk.thanks': { rel: 'office.opsPlea', pos: [-2.6, 1.5, 0.6], look: [0, 1.3, 0.6], fov: 40, fit: ['roo.head', 'ops.head'] },
    // office-walk's stations (2026-11-25): the face scanner from his front left (his face, the beam, the kiosk), the
    // insert on its readout over his left shoulder; the cooler over his right shoulder (the tap, both gossipers), then
    // from the room for the drink and the gossip; the coffee machine from his left, along the counter (the button, the
    // screen, the mug, his face)
    'office-walk.scan': { rel: 'office.scanStand', pos: [1.2, 1.7, -0.6], look: [0, 1.6, 0.3], fov: 38 },
    'office-walk.scanScreen': { rel: 'office.scanStand', pos: [0.45, 1.68, -0.25], look: [0, 1.62, 0.45], fov: 42 },
    // cooler: the walk to the stand (over his right shoulder, both gossipers); coolerTap: the mug parked, the press and
    // the glug, a front three-quarter from his left at about eye level (his face, his glove on the tap, the bottle,
    // Brenda small beyond the cooler); coolerSip: the drink, the same camera trucked a little towards the cooler and
    // tilted up with the cup (the beat turns him a little towards it), so the cup reaches his muzzle in front of his
    // face, Brenda's face stays clear of his arm and the GLUG GLUG over his left shoulder stays in frame;
    // coolerHand: the cup handed to Gary, a closer two-shot from the room (the cup reads in Gary's hand)
    'office-walk.cooler': { rel: 'office.coolerStand', pos: [-1.0, 1.85, -1.9], look: [-0.05, 1.2, 0.45], fov: 42 },
    'office-walk.coolerTap': { rel: 'office.coolerStand', pos: [0.95, 1.62, 0.84], look: [-0.05, 1.38, 0.28], fov: 48 },
    'office-walk.coolerSip': { rel: 'office.coolerStand', pos: [0.8, 1.62, 0.84], look: [0.0, 1.56, 0.05], fov: 46 },
    'office-walk.coolerTalk': { rel: 'office.coolerStand', pos: [0.35, 1.72, -2.75], look: [-0.05, 1.22, 0.35], fov: 46 },
    'office-walk.coolerHand': { rel: 'office.coolerStand', pos: [0.62, 1.5, -1.85], look: [0.52, 1.32, 0.15], fov: 36 },
    // the coffee shot: from his left, about chest high and nearly level, so the red button on the drip tray's front
    // shows under his fingertip (from higher up the tray hides it), his ears and the raised mug sit inside the frame,
    // and extra2 (at the printer, behind the counter) stands between the machine and him, clear of his snout; coffeeScreen: the insert
    // on the machine's firmware screen (it faces -X), from in front of it and a little to Roo's right
    'office-walk.coffee': { rel: 'office.coffeeStand', pos: [1.5, 1.5, 0.4], look: [-0.05, 1.5, 0.35], fov: 46 },
    'office-walk.coffeeScreen': function () {
      var W = JG.world, cf = W && W.current && W.current.props && W.current.props.coffee, THREE = window.THREE;
      var p = cf && cf.anchors.screen ? cf.anchors.screen.getWorldPosition(new THREE.Vector3()) : null;
      if (!p) return { rel: 'office.coffeeStand', pos: [-0.42, 1.36, 0.22], look: [-0.18, 1.27, 0.54], fov: 26 };
      return { pos: [p.x - 0.32, p.y + 0.08, p.z + 0.1], look: [p.x, p.y - 0.004, p.z], fov: 28 };
    },
    'comfort.overRoo': { rel: 'office.hug.roo', pos: [-1.25, 1.7, -0.55], look: [0, 1.5, 0.42], fov: 36 }, // core/stubs.js names it
    'comfort.overOps': { rel: 'office.hug.ops', pos: [0.5, 1.75, -0.75], look: [0, 1.55, 0.45], fov: 38 },
    // the hug from Roo's right: his snout clears her head, which rests beside it (the beat sets her 0.52 m out, 0.2 m
    // to his left); side pushes in to sideClose while the hug holds
    'comfort.side': { rel: 'office.hug.roo', pos: [-1.55, 1.6, 0.3], look: [0, 1.45, 0.3], fov: 34 },
    'comfort.sideClose': { rel: 'office.hug.roo', pos: [-1.1, 1.66, 0.32], look: [0, 1.55, 0.3], fov: 30 },
    // after the release (Roo a step back): her tear wipe from his right, her thanks from his left, the closing two-shot
    'comfort.wipe': { rel: 'office.hug.roo', pos: [-0.6, 1.62, 0.25], look: [0.2, 1.52, 0.55], fov: 34 },
    'comfort.thanks': { rel: 'office.hug.roo', pos: [0.55, 1.6, -0.15], look: [0.15, 1.5, 0.55], fov: 32 },
    'comfort.two': { rel: 'office.hug.roo', pos: [-2.1, 1.5, 0.35], look: [0.05, 1.3, 0.3], fov: 36, fit: ['roo.head', 'ops.head'] },

    // ---------------------------------------------------------------- office / desk
    'desk-sit.side': { rel: 'office.chair', pos: [2.3, 1.4, 0.4], look: [0, 0.95, 0.3], fov: 42 },
    // the hero monitor's lit face is at about [0, 1.08, 0.825] in the chair frame, facing Roo. Every typing shot looks
    // from his left (+x) so his arm never covers the address bar (top left of the screen as he sees it).
    // screen: the whole lit monitor with his glove at the right edge; glove: the insert on his left glove against the
    // lit screen, address bar in frame; typed: closer on the address bar so "june.ai" reads as it is typed
    'desk-sit.screen': { rel: 'office.chair', pos: [1.1, 1.2, -0.1], look: [0.0, 0.95, 0.6], fov: 42 },   // monitor + glove on the tray keyboard
    'desk-sit.glove': { rel: 'office.chair', pos: [0.62, 1.08, -0.02], look: [0.08, 0.86, 0.5], fov: 44 },
    'desk-sit.typed': { rel: 'office.chair', pos: [0.85, 1.42, 0.2], look: [0.2, 1.2, 0.83], fov: 32 },
    'desk-sit.monitor': { rel: 'office.chair', pos: [-0.45, 1.5, -0.4], look: [0, 1.05, 1.1], fov: 36 },
    'montage.bob': { rel: 'office.chair', pos: [-1.9, 1.4, 0.9], look: [0, 1.15, 0], fov: 40, fit: ['roo.head'] },
    'montage.push': { rel: 'office.chair', pos: [-0.25, 1.3, 0.2], look: [0, 1.1, 1.1], fov: 30 },
    'two-hours-later.wide': { rel: 'office.chair', pos: [-2.2, 1.8, -2.6], look: [0, 1.0, 1.0], fov: 44 },
    'two-hours-later.close': { rel: 'office.chair', pos: [-0.9, 1.55, 1.0], look: [0, 1.4, 0], fov: 36, fit: ['roo.head', 'roo.chest'] },
    'all-clear.monitor': { rel: 'office.chair', pos: [-0.45, 1.5, -0.4], look: [0, 1.05, 1.1], fov: 36 },

    // ---------------------------------------------------------------- office / exec, window
    'how.two': { rel: 'office.chair', pos: [-1.0, 1.6, -3.0], look: [-1.2, 1.15, 0], fov: 42, fit: ['roo.head', 'exec.head'] },
    'how.exec': { rel: 'office.execStand', pos: [0.4, 1.45, 2.9], look: [0, 1.5, 0], fov: 34 },
    'how.roo': { rel: 'roo', pos: [0.35, 1.35, 1.5], look: [0, 1.25, 0], fov: 34, fit: ['roo.head'] },
    'how.salute': { rel: 'roo', pos: [-0.5, 1.55, 2.3], look: [0, 1.45, 0], fov: 36 },
    'window-exit.run': { rel: 'office.windowRun', pos: [3.5, 1.6, -4], look: [0, 1.2, 1], fov: 50 },
    'window-exit.dive': { rel: 'office.windowHole', pos: [-2.2, 0.6, -2.4], look: [0, 0, 0.3], fov: 50 },
    'window-exit.hole': { rel: 'office.windowHole', pos: [0.35, 0.35, -4.2], look: [0, 0, 0], fov: 40 },
    'window-exit.exec': { rel: 'office.execStand', pos: [0.4, 1.6, 1.7], look: [0, 1.5, 0], fov: 36 }
  };
  JG.shots = Object.assign(JG.shots || {}, S);

  // ---------------------------------------------------------------------------------------------------------------
  // JG.story: helpers shared by the act files (functions only; nothing runs at load)
  // ---------------------------------------------------------------------------------------------------------------
  function T(k) { return JG.text(k); }
  function hold(w, t0, total) {
    var left = total - (JG.clock.t - t0);
    return left > 0.001 ? w.wait(left) : w.frame();
  }
  function start(w, a, clip, o) {
    o = Object.assign({ loop: true, wait: false }, o || {});
    return w.play(a, clip, o);
  }
  function playFor(w, a, clip, sec, o) {
    o = Object.assign({ wait: false }, o || {});
    return w.play(a, clip, o).then(function () { return w.wait(sec); });
  }
  function ui(path) {
    var args = [].slice.call(arguments, 1), parts = path.split('.'), o = JG.ui, self = null;
    for (var i = 0; i < parts.length; i++) { if (!o) return undefined; self = o; o = o[parts[i]]; }
    if (typeof o !== 'function') return undefined;
    try { return o.apply(self, args); } catch (e) { JG.error('story ui.' + path, e); return undefined; }
  }
  function markerOf(name) { var m = JG.world && JG.world.marker(name); return m || { pos: { x: 0, y: 0, z: 0 }, yaw: 0 }; }
  function at(name, v) {
    var m = markerOf(name), c = Math.cos(m.yaw), s = Math.sin(m.yaw);
    v = v || [0, 0, 0];
    return [m.pos.x + v[0] * c + v[2] * s, m.pos.y + v[1], m.pos.z - v[0] * s + v[2] * c];
  }
  /** a placement {pos, yaw} in a marker's frame (for w.place): v as in at(), yaw = the marker's yaw + dyaw */
  function spot(name, v, dyaw) { return { pos: at(name, v), yaw: markerOf(name).yaw + (dyaw || 0) }; }
  function lerp(a, b, k, dy) {
    var A = markerOf(a).pos, B = markerOf(b).pos;
    return [A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k + (dy || 0), A.z + (B.z - A.z) * k];
  }
  function safe(a, fn, where) { try { fn(); } catch (e) { JG.error('story ' + where, e); } }
  function cape(a, mode) { if (a && typeof a.setCape === 'function') safe(a, function () { a.setCape(mode); }, 'setCape'); }
  function attach(a, prop, anchor) { if (a && typeof a.attach === 'function') safe(a, function () { a.attach(prop, anchor); }, 'attach'); }
  /** world point [x,y,z] of an actor's anchor, or null */
  function anchor(actorId, name) {
    var W = JG.world, a = W && W.hasActor(actorId) ? W.actor(actorId) : null, o = a && a.anchors && a.anchors[name];
    if (!o || !o.getWorldPosition) return null;
    var p = o.getWorldPosition(new window.THREE.Vector3());
    return [p.x, p.y, p.z];
  }
  /** the midpoint of an actor's hands */
  function hands(actorId) {
    var l = anchor(actorId, 'handL'), r = anchor(actorId, 'handR');
    if (!l || !r) return l || r;
    return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
  }
  /** base + v rotated into an actor's root frame (+z is the way it faces) */
  function offset(actorId, base, v) {
    var W = JG.world, a = W && W.hasActor(actorId) ? W.actor(actorId) : null, yaw = a ? a.root.rotation.y : 0, c = Math.cos(yaw), s = Math.sin(yaw);
    return [base[0] + v[0] * c + v[2] * s, base[1] + v[1], base[2] - v[0] * s + v[2] * c];
  }
  // round 2: the couch frame and the TV point, from the city set's roof.couch / roof.tv markers
  function setMarker(name) {
    var W = JG.world, c = W && W.inst && JG.scenes.has('city') ? W.inst('city') : null, m = c && c.markers && c.markers[name];
    if (!m) return null;
    var p = Array.isArray(m.pos) ? { x: m.pos[0], y: m.pos[1], z: m.pos[2] } : m.pos;
    return { pos: p, yaw: m.yaw || 0 };
  }
  var NO_FRAME = { pos: { x: 0, y: 0, z: 0 }, yaw: 0 };
  function couchFrame() { return setMarker('roof.couch') || NO_FRAME; }
  /** the stage placement for Roo on the couch (the contract marker) */
  function couchSpot() { return 'roof.couch'; }
  /** a world point [x, y, z] in the couch frame (same convention as at()) */
  function couch(v) {
    var m = couchFrame(), c = Math.cos(m.yaw), s = Math.sin(m.yaw);
    v = v || [0, 0, 0];
    return [m.pos.x + v[0] * c + v[2] * s, m.pos.y + v[1], m.pos.z - v[0] * s + v[2] * c];
  }
  /** the TV screen centre (+ v in world axes): roof.tv, else the TV prop's screen, else in front of the couch */
  function tvPoint(v) {
    v = v || [0, 0, 0];
    var m = setMarker('roof.tv'), p = m ? m.pos : null;
    if (!p) {
      var c = JG.world && JG.world.current, tv = c && c.props && c.props.tv;
      if (tv && tv.screen && tv.screen.getWorldPosition) { var q = tv.screen.getWorldPosition(new window.THREE.Vector3()); p = { x: q.x, y: q.y, z: q.z }; }
    }
    if (!p) { var f = couch([0, 1.0, 2.6]); p = { x: f[0], y: f[1], z: f[2] }; }
    return [p.x + v[0], p.y + v[1], p.z + v[2]];
  }
  /** the city's TV (props.tv = {on(bool), video, screen}) or null; never records a stub hit */
  function tv() { var c = JG.world && JG.world.current; return c && c.props && c.props.tv ? c.props.tv : null; }

  function coverOut(w, kind, sec) {
    sec = sec || 0.45;
    ui('transition.play', kind || 'wipe', 'in', sec);
    return w.wait(sec);
  }

  JG.story = { T: T, hold: hold, start: start, playFor: playFor, ui: ui, at: at, spot: spot, lerp: lerp, anchor: anchor, hands: hands, offset: offset, cape: cape, attach: attach, coverOut: coverOut,
    couch: couch, couchSpot: couchSpot, tvPoint: tvPoint, tv: tv };
})();
