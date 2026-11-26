/* Roo's code clips, composes, routes and clip events (plan section 9, clip sources). OWNER: E3. Data only: JG.clips
 * bakes each clip per rig from these key poses (JG.anim.P helpers over the rig's P), on first use.
 *
 * FIRST VERSIONS (Stage 1, 2026-11-24): readable key poses, a few keys each, for timing and staging; Stage 2 polishes
 * them in script order (G2: jumpOff, landHero and the superhero landing; hugHold with ops.hugReceive).
 *   library (asset build map): idle, walk, run, seatedIdle, sitDownChair, jumpOff, landHero, runDive
 *   code: idleChill (deck-chair lounge), idleHero, fallDive, hugHold, seatedSmileNod, seatedWink, shrugCheckWrist,
 *         headphonesOn, headphonesOff, twoFingerSalute; reachPress, drinkCup and holdCup (office-walk's stations,
 *         2026-11-25)
 *   additive (code): breath (always on), footTap, pat, keyPress, grooveBob
 *   composed: phoneHold = Idle_TalkingPhone_Loop's RIGHT ARM ONLY over idleChill (step 6 verdict);
 *             seatedType = Sitting_Idle_Loop with code arms to the keyboard (step 6 verdict) + keyPress
 *   routed: elevatorStand = idle + footTap
 * Seated code clips use JG.anim.P.seat (the library sit's hips), so they cut cleanly with seatedIdle. */
(function () {
  'use strict';
  var JG = window.JG, C = JG.clips, R = JG.anim.route;
  function A() { return JG.anim.P; }
  function D(P) { return JG.anim.P.dims(P); }
  var RIGHT_ARM = JG.anim.RIGHT_ARM, ARMS = JG.anim.ARMS;
  function seat(P, o) { JG.anim.P.seat(P, o); }
  function lap(P) { A().arm(P, 'l', [0.0, -0.44, 0.3], { curl: 0.3 }); A().arm(P, 'r', [0.0, -0.44, 0.3], { curl: 0.3 }); }

  // ---------------------------------------------------------------- code clips
  function lounge(P, b) {
    var d = D(P);
    A().sit(P, { y: d.hipY * 0.42, z: -0.42, recline: 0.62 + 0.03 * b, arms: false, feet: [0.6, 0.62], spread: 0 });
    P.legIK('l', [-0.03, d.ankleY + 0.07, 0.66], [0.2, 0.6, 1]);   // ankles crossed, left over right
    P.legIK('r', [-0.09, d.ankleY, 0.62], [-0.2, 0.6, 1]);
    A().head(P, 0.3, 0.12, 0.05);
    A().arm(P, 'l', [-0.12, 0.3, -0.12], { elbow: [1, 0.5, 0.2], hand: { dir: [-1, 0.2, -0.3], palm: [0, 0, -1] }, curl: 0.5 });
    A().arm(P, 'r', [0.16, -0.3, 0.08], { elbow: [0.6, -0.1, -1], curl: 0.45 });
  }
  C.define('roo.idleChill', { duration: 2.9333, loop: true, keys: [
    { t: 0, pose: function (P) { lounge(P, 0); } },
    { t: 1.4667, pose: function (P) { lounge(P, 1); } },
    { t: 2.9333, pose: function (P) { lounge(P, 0); } }
  ] });

  function hero(P, b) {
    A().stand(P, { spread: 0.1, lean: -0.08 - 0.02 * b, arms: false });
    ['l', 'r'].forEach(function (s) {
      A().arm(P, s, [0.05, -0.36 + 0.01 * b, -0.02], { elbow: [1, 0, -0.25], hand: { dir: [-0.4, -1, 0.15], palm: [-1, 0, 0] }, fist: true });
    });
    A().head(P, -0.12, 0.18, 0);
  }
  C.define('roo.idleHero', { duration: 3.0, loop: true, keys: [
    { t: 0, pose: function (P) { hero(P, 0); } }, { t: 1.5, pose: function (P) { hero(P, 1); } }, { t: 3.0, pose: function (P) { hero(P, 0); } }
  ] });

  function dive(P, f) {
    var d = D(P), L = d.upper + d.fore;
    P.hips([0, d.hipY, 0]);
    A().body(P, 1.2, 0, 0.05 * f);
    var c = Math.cos(1.2), s = Math.sin(1.2);
    P.aim('thigh_l', [0.1, -c + 0.1 * f, -s], [0, -s, c]); P.aim('calf_l', [0.08, -c * 0.4 + 0.3 * f, -1], [0, -1, 0]);
    P.aim('thigh_r', [-0.1, -c - 0.1 * f, -s], [0, -s, c]); P.aim('calf_r', [-0.08, -c * 0.4 - 0.2 * f, -1], [0, -1, 0]);
    A().head(P, -0.55, 0, 0);
    A().arm(P, 'l', [0.12 * L, c * L * 0.9, s * L * 0.9], { elbow: [0.3, 1, -0.2], hand: { dir: [0.1, c, s], palm: [0, -s, c] }, curl: 0.1 });
    A().arm(P, 'r', [0.2 * L, c * L * 0.7, s * L * 0.85], { elbow: [0.3, 1, -0.2], fist: true });
  }
  C.define('roo.fallDive', { duration: 0.8, loop: true, keys: [
    { t: 0, pose: function (P) { dive(P, 0); } }, { t: 0.4, pose: function (P) { dive(P, 1); } }, { t: 0.8, pose: function (P) { dive(P, 0); } }
  ] });

  // the comfort hug, posed against the ops lead where the beat stands her (JG.anim.hug: 0.5 m out, 0.25 m to his left,
  // turned 0.35 rad from square). Her chest is 0.37 m wide and 0.27 m deep there, so Roo steps his hips in and turns
  // his chest to her, and his wrists come to rest just behind her back's corners with the hands laid flat across her
  // back (palms in, fingers relaxed, pointing to her spine). Targets are in her root frame (metres, +Z her front, +X
  // her left); ops.hugReceive leans her in by the amount these assume.
  var HUG_HAND = {
    l: { at: [-0.235, 1.2, -0.075], dir: [1, -0.15, -0.1] },   // his left hand round her right side, below the shoulder blade
    r: { at: [0.23, 1.22, -0.08], dir: [-1, -0.15, -0.08] }    // his right hand round her left side (roo.pat lifts it off)
  };
  // (her deltoids still meet his forearms where they cross her shoulders: a couple of cm, arm on arm; measured with the
  // comfort hug probes, about 10 Roo vertices inside her near her head against about 500 before)
  function hugArm(P, s, b) {
    var H = JG.anim.hug, k = s === 'l' ? 1 : -1, h = HUG_HAND[s];
    var at = H.toRoo([h.at[0], h.at[1] + 0.008 * b, h.at[2]]), dir = H.toRoo(h.dir, 0), palm = H.toRoo([0, 0, 1], 0);
    A().armTo(P, s, at, { clav: [0.06, 0.14], elbow: [1, -0.1, 0.15], hand: { dir: [dir[0] * k, dir[1], dir[2]], palm: [palm[0] * k, palm[1], palm[2]] }, open: false });
    P.fingers(s, 0.22, 0.24, [0.04, 0, -0.04, -0.08], [0, -1, 0.05], 0.12);   // relaxed, thumb laid along the fingers
  }
  function hug(P, b) {
    A().stand(P, { lean: 0.22, twist: 0.12 + 0.02 * (b - 0.5), hipRot: [0, 0.12, 0], hz: 0.09, spread: 0.04, arms: false, z: [0.06, -0.04] });
    hugArm(P, 'l', b); hugArm(P, 'r', b);
    A().head(P, 0.2, -0.3, 0.1);
  }
  C.define('roo.hugHold', { duration: 2.0, loop: true, keys: [
    { t: 0, pose: function (P) { hug(P, 0); } }, { t: 1.0, pose: function (P) { hug(P, 1); } }, { t: 2.0, pose: function (P) { hug(P, 0); } }
  ] });

  C.define('roo.seatedSmileNod', { duration: 1.6, loop: false, keys: [0, 0.22, 0, 0.14, 0].map(function (n, i) {
    return { t: i * 0.4, pose: function (P) { seat(P, { arms: false }); lap(P); A().head(P, n, 0.08, 0.04); } };
  }) });

  function winkPose(P, k) {
    seat(P, { arms: false, tilt: -0.05 * k });
    lap(P);
    A().head(P, 0.05 * k, 0.22 * k, 0.16 * k);
  }
  C.define('roo.seatedWink', { duration: 1.2, loop: false, keys: [
    { t: 0, pose: function (P) { winkPose(P, 0); } }, { t: 0.35, pose: function (P) { winkPose(P, 1); } }, { t: 1.2, pose: function (P) { winkPose(P, 1); } }
  ] });

  function shrug(P, k, w) {
    A().stand(P, { lean: -0.02, arms: false });
    if (w) {
      A().arm(P, 'l', [-0.14, -0.2, 0.34], { elbow: [0.6, -0.6, -0.4], hand: { dir: [-1, 0, 0.25], palm: [0, -1, 0] }, fist: true });
      A().armDown(P, 'r');
      A().head(P, 0.38, 0.25, 0);
      return;
    }
    ['l', 'r'].forEach(function (s) {
      A().arm(P, s, [0.1 + 0.18 * k, -0.42 + 0.12 * k, 0.06 + 0.16 * k], { clav: [0.22 * k, 0], elbow: [0.5, -1, -0.3], hand: { dir: [0.5, 0, 1], palm: [0, 1, 0] }, curl: 0.15 });
    });
    A().head(P, -0.05 * k, 0, 0.18 * k);
  }
  C.define('roo.shrugCheckWrist', { duration: 2.4, loop: false, keys: [
    { t: 0, pose: function (P) { shrug(P, 0); } }, { t: 0.45, pose: function (P) { shrug(P, 1); } }, { t: 0.9, pose: function (P) { shrug(P, 1); } },
    { t: 1.3, pose: function (P) { shrug(P, 0.2); } }, { t: 1.75, pose: function (P) { shrug(P, 0, true); } }, { t: 2.4, pose: function (P) { shrug(P, 0, true); } }
  ] });

  function phones(P, k) {
    seat(P, { arms: false });
    if (k <= 0) { lap(P); return; }
    var d = D(P), up = d.headY - d.shoulderY + 0.08;
    ['l', 'r'].forEach(function (s) {
      A().arm(P, s, [-(d.shoulderX - 0.11), up * k - 0.35 * (1 - k), 0.02], { elbow: [1, -0.2, -0.1], hand: { dir: [0, 1, 0], palm: [-1, 0, 0] }, curl: 0.4 });
    });
  }
  C.define('roo.headphonesOn', { duration: 1.2, loop: false, keys: [
    { t: 0, pose: function (P) { phones(P, 0); } }, { t: 0.5, pose: function (P) { phones(P, 1); } }, { t: 0.75, pose: function (P) { phones(P, 0.92); } }, { t: 1.2, pose: function (P) { phones(P, 0); } }
  ] });
  C.define('roo.headphonesOff', { duration: 1.2, loop: false, keys: [
    { t: 0, pose: function (P) { phones(P, 0); } }, { t: 0.4, pose: function (P) { phones(P, 0.92); } }, { t: 0.6, pose: function (P) { phones(P, 1); } }, { t: 1.2, pose: function (P) { phones(P, 0); } }
  ] });

  function salute(P, k) {
    A().stand(P, { arms: false, spread: 0.04 });
    A().armDown(P, 'l');
    var d = D(P), up = d.headY - d.shoulderY + 0.1;
    if (k === 0) A().armDown(P, 'r');
    else if (k === 1) A().arm(P, 'r', [-0.16, up, 0.14], { elbow: [1, 0.1, 0.1], hand: { dir: [-1, 0.35, 0.1], palm: [0, -0.2, 1] }, curl: 0.05 });
    else A().arm(P, 'r', [0.2, up + 0.02, 0.32], { elbow: [1, 0, -0.2], hand: { dir: [0.4, 0.4, 1], palm: [-0.5, 0, 0.5] }, curl: 0.05 });
    A().head(P, -0.05, 0.12 * (k ? 1 : 0), 0.06 * (k ? 1 : 0));
  }
  C.define('roo.twoFingerSalute', { duration: 1.4, loop: false, keys: [
    { t: 0, pose: function (P) { salute(P, 0); } }, { t: 0.4, pose: function (P) { salute(P, 1); } }, { t: 0.65, pose: function (P) { salute(P, 1); } },
    { t: 0.9, pose: function (P) { salute(P, 2); } }, { t: 1.4, pose: function (P) { salute(P, 0); } }
  ] });

  // rooftop-walk's couch gag (2026-11-26, "You're joking, right? These people need us! We're their only hope!"):
  // both palms turned up and out (k: 0 arms down .. 1 the full "seriously?"), then the left arm thrown out at the
  // city he is needed in (p: 0..1; the left, so in the gag's shot he points away from the TV) while the right stays half open, then both hands open at the chest (h: 0..1)
  function kidding(P, k, p, h) {
    A().stand(P, { lean: 0.03 * k - 0.02 * p, arms: false, spread: 0.03 });
    if (!k && !p && !h) { A().armDown(P, 'l'); A().armDown(P, 'r'); A().head(P, 0, 0, 0); return; }
    var open = function (s, a) {
      A().arm(P, s, [0.1 + 0.26 * a, -0.42 + 0.2 * a, 0.06 + 0.24 * a], { clav: [0.2 * a, 0], elbow: [0.5, -1, -0.3], hand: { dir: [0.6, 0.1, 1], palm: [0, 1, 0] }, curl: 0.1 });
    };
    if (h) {
      ['l', 'r'].forEach(function (s) {
        A().arm(P, s, [0.02, -0.2 + 0.03 * h, 0.3], { elbow: [0.8, -0.8, -0.2], hand: { dir: [-0.3, 0.5, 1], palm: [-0.5, 0.6, -0.3] }, curl: 0.2 });
      });
      A().head(P, 0.08 * h, 0, 0);
      return;
    }
    open('r', p ? 0.45 : k);
    if (p) A().arm(P, 'l', [0.34 * p, -0.04, 0.5], { clav: [0.1, 0.25 * p], elbow: [1, -0.5, -0.2], hand: { dir: [0.5, 0, 1], palm: [0, -1, 0] }, curl: 0.05 });
    else open('l', k);
    A().head(P, p ? 0.02 : -0.06 * k, p ? 0.16 * p : 0, p ? 0 : 0.16 * k);
  }
  C.define('roo.youKidding', { duration: 3.7, loop: false, keys: [
    { t: 0, pose: function (P) { kidding(P, 0, 0, 0); } }, { t: 0.3, pose: function (P) { kidding(P, 1, 0, 0); } },
    { t: 1.0, pose: function (P) { kidding(P, 0.9, 0, 0); } }, { t: 1.3, pose: function (P) { kidding(P, 0, 1, 0); } },
    { t: 2.05, pose: function (P) { kidding(P, 0, 0.92, 0); } }, { t: 2.4, pose: function (P) { kidding(P, 0, 0, 1); } },
    { t: 3.2, pose: function (P) { kidding(P, 0, 0, 0.9); } }, { t: 3.7, pose: function (P) { kidding(P, 0, 0, 0); } }
  ] });

  // overlay for the composed seatedType: forearms to a keyboard (only the arm tracks are used)
  function typing(P, b) {
    seat(P, { arms: false });
    A().arm(P, 'l', [-0.08, -0.2 + 0.01 * b, 0.42], { elbow: [0.6, -0.5, -1], hand: { dir: [0, -0.25, 1], palm: [0, -1, 0] }, curl: 0.55 });
    A().arm(P, 'r', [-0.08, -0.2 - 0.01 * b, 0.42], { elbow: [0.6, -0.5, -1], hand: { dir: [0, -0.25, 1], palm: [0, -1, 0] }, curl: 0.55 });
  }
  C.define('roo.typeArms', { duration: 1.6667, loop: true, keys: [
    { t: 0, pose: function (P) { typing(P, 0); } }, { t: 0.8333, pose: function (P) { typing(P, 1); } }, { t: 1.6667, pose: function (P) { typing(P, 0); } }
  ] });

  // ---------------------------------------------------------------- office stations (2026-11-25, the office life pass)
  // roo.reachPress: a standing reach with the right index finger out, one fingertip target for the water cooler's tap
  // and the coffee machine's button. REACH is the wrist target in root space (+X his left, +Z forward); measured
  // in the game (root at the origin, yaw 0, 0.45 s in): the index tip lands at REACH_TIP (forward f, height h, right s),
  // which office-props.js and the stand markers in office.js are built around.
  var REACH = [-0.138, 1.01, 0.327];
  // one copy: office-props.js (loaded earlier) owns the measurement; this only publishes it
  JG.anim.REACH_TIP = (JG.officeProps && JG.officeProps.LAYOUT && JG.officeProps.LAYOUT.tip) || { f: 0.50, h: 1.00, s: 0.10 };
  function reach(P, k) {
    A().stand(P, { spread: 0.04, lean: 0.07 * k, arms: false });
    A().armDown(P, 'l');
    if (k <= 0) { A().armDown(P, 'r'); return; }
    A().armTo(P, 'r', REACH, { elbow: [0.7, -0.5, -0.5], hand: { dir: [0, -0.18, 1], palm: [-0.35, -1, 0] }, fist: true });
    // the index out, straight
    ['index_01_r', 'index_02_r', 'index_03_r'].forEach(function (n) { try { P.rotLocal(n, 0, 0, 0); } catch (e) { /* no finger */ } });
    A().head(P, 0.18 * k, 0, 0);
  }
  C.define('roo.reachPress', { duration: 1.1, loop: false, keys: [
    { t: 0, pose: function (P) { reach(P, 0); } }, { t: 0.32, pose: function (P) { reach(P, 1); } }, { t: 0.58, pose: function (P) { reach(P, 1); } },
    { t: 1.1, pose: function (P) { reach(P, 0); } }
  ] });
  // roo.drinkCup: the cup on his right palm (palm up, fingers forward) comes up to the tip of the muzzle, the head tips
  // back (0.6..1.4 s) and the cup with it, hand down by 2.0 s (the sip at about 0.7 s). The wrist targets put the cup's rim at
  // the muzzle tip (measured: the tip at about [0, 1.74, 0.38] with the head level, [0, 1.80, 0.23] tipped back)
  function drink(P, k, tip) {
    A().stand(P, { spread: 0.04, lean: -0.05 * tip, arms: false });
    A().armDown(P, 'l');
    A().head(P, -0.25 * tip, 0, 0);
    if (k <= 0) { A().armDown(P, 'r'); return; }
    var hi = [-0.005, 1.655 + 0.052 * tip, 0.39 - 0.152 * tip], lo = [-0.16, 1.05, 0.26];
    var T = [lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k];
    A().armTo(P, 'r', T, { elbow: [0.9, -0.7, -0.1], hand: { dir: [-0.1, 0.15, 1], palm: [0, 1, -0.2 - 0.5 * tip] }, curl: 0.45 });
  }
  // roo.holdCup: standing with the cup on his palm at the belly (drinkCup's first and last pose), a small sway; the
  // idle that follows a drink while he still holds it (the walk swings it at his side)
  C.define('roo.holdCup', { duration: 3.2, loop: true, keys: [
    { t: 0, pose: function (P) { drink(P, 0.35, 0); } }, { t: 1.6, pose: function (P) { drink(P, 0.37, 0.06); } }, { t: 3.2, pose: function (P) { drink(P, 0.35, 0); } }
  ] });
  // roo.offerCup: the cup held out on his palm, arm forward at chest height (the water cooler's hand-over to Gary):
  // out by 0.45 s, held to the end (the beat swaps the cup to Gary's hand and starts another clip)
  function offer(P, k) {
    A().stand(P, { spread: 0.04, lean: 0.04 * k, arms: false });
    A().armDown(P, 'l');
    var lo = [-0.106, 1.262, 0.306], hi = [-0.09, 1.2, 0.5];   // lo: holdCup's pose
    var T = [lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k];
    A().armTo(P, 'r', T, { elbow: [0.9, -0.7, -0.1], hand: { dir: [-0.1, 0.15, 1], palm: [0, 1, -0.2] }, curl: 0.45 });
  }
  C.define('roo.offerCup', { duration: 1.2, loop: false, keys: [
    { t: 0, pose: function (P) { offer(P, 0); } }, { t: 0.45, pose: function (P) { offer(P, 1); } }, { t: 1.2, pose: function (P) { offer(P, 1); } }
  ] });
  C.define('roo.drinkCup', { duration: 2.0, loop: false, keys: [
    { t: 0, pose: function (P) { drink(P, 0.35, 0); } }, { t: 0.55, pose: function (P) { drink(P, 1, 0); } }, { t: 0.8, pose: function (P) { drink(P, 1, 1); } },
    { t: 1.4, pose: function (P) { drink(P, 1, 1); } }, { t: 1.7, pose: function (P) { drink(P, 0.6, 0.2); } }, { t: 2.0, pose: function (P) { drink(P, 0.35, 0); } }
  ] });

  // ---------------------------------------------------------------- additive (frame 0 is the reference: no change)
  function nothing() {}
  C.define('roo.breath', { duration: 3.2, loop: true, additive: true, keys: [
    { t: 0, pose: nothing },
    { t: 1.6, pose: function (P) { P.rotLocal('spine_03', -0.035, 0, 0); P.rotLocal('clavicle_l', 0, 0, 0.03); P.rotLocal('clavicle_r', 0, 0, -0.03); } },
    { t: 3.2, pose: nothing }
  ] });
  C.define('roo.footTap', { duration: 0.5, loop: true, additive: true, keys: [
    { t: 0, pose: nothing }, { t: 0.14, pose: function (P) { P.rotLocal('foot_r', -0.35, 0, 0); } }, { t: 0.28, pose: nothing }, { t: 0.5, pose: nothing }
  ] });
  // the hug's pat: the right hand lifts about 5 cm off her back and comes down (the old signs pressed it into her)
  C.define('roo.pat', { duration: 0.45, loop: false, additive: true, keys: [
    { t: 0, pose: nothing }, { t: 0.16, pose: function (P) { P.rotLocal('lowerarm_r', 0.1, 0, 0); P.rotLocal('hand_r', 0.35, 0, 0); } }, { t: 0.3, pose: nothing }, { t: 0.45, pose: nothing }
  ] });
  C.define('roo.keyPress', { duration: 0.3, loop: true, additive: true, keys: [
    { t: 0, pose: nothing }, { t: 0.075, pose: function (P) { P.rotLocal('hand_l', 0.22, 0, 0); } }, { t: 0.15, pose: nothing },
    { t: 0.225, pose: function (P) { P.rotLocal('hand_r', 0.22, 0, 0); } }, { t: 0.3, pose: nothing }
  ] });
  C.define('roo.grooveBob', { duration: 0.5, loop: true, additive: true, keys: [
    { t: 0, pose: nothing }, { t: 0.25, pose: function (P) { P.rotLocal('neck_01', 0.14, 0, 0); P.rotLocal('Head', 0.08, 0, 0); P.rotLocal('spine_03', 0.04, 0, 0); } }, { t: 0.5, pose: nothing }
  ] });

  // ---------------------------------------------------------------- composes and routes
  C.compose('roo.phoneHold.arm', { base: 'roo.idleChill', over: 'roo.phoneHold', mask: RIGHT_ARM });
  R('roo.phoneHold', { clip: 'roo.phoneHold.arm' });
  C.compose('roo.seatedType.arms', { base: 'roo.seatedIdle', over: 'roo.typeArms', mask: ARMS });
  R('roo.seatedType', { clip: 'roo.seatedType.arms', additive: ['roo.keyPress'] });
  R('roo.elevatorStand', { clip: 'roo.idle', additive: ['roo.footTap'] });

  // ---------------------------------------------------------------- events (seconds into the clip)
  C.events('roo.walk', [{ t: 0.02, name: 'footL' }, { t: 0.6867, name: 'footR' }]);
  C.events('roo.run', [{ t: 0.02, name: 'footL' }, { t: 0.4867, name: 'footR' }]);
  C.events('roo.runDive', [{ t: 0.02, name: 'footL' }, { t: 0.3533, name: 'footR' }]);
  C.events('roo.landHero', [{ t: 0.1, name: 'impact' }]);
  C.events('roo.jumpOff', [{ t: 0.05, name: 'footL' }]);
  C.events('roo.headphonesOn', [{ t: 0.6, name: 'attach' }]);
  C.events('roo.headphonesOff', [{ t: 0.5, name: 'attach' }]);
  // (the office stations' clips carry no events: act3.js times the press, the sip and the hand-over with waits)
})();
