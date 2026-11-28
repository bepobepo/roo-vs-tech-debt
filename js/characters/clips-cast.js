/* Supporting-cast code clips, composes, routes and events: ops lead, old lady, extras (plan section 9). OWNER: E7.
 * Data only; key poses over JG.anim.P, baked per rig by JG.clips on first use.
 * FIRST VERSIONS (Stage 1, 2026-11-24):
 *   ops    library: pleadTalk base (Idle_Talking_Loop), runPanic base (Sprint_Loop)
 *          composed: pleadTalk = code pleading arms (hands clasped, raised) over the library talk, ARMS mask;
 *                    runPanic = code flailing arms and an upright spine over the library sprint, 'upper' mask (the
 *                    step 6 verdict: widen the override to the spine to cut the 35-44 degree sprint lean)
 *          code: breakdown (one-shot), cryLoop, wailLoud, hugReceive, thankful (loops), wipeTears (one-shot)
 *   oldlady composed: seatedPurseIdle = code hands-together-on-the-lap over Sitting_Idle_Loop, ARMS mask
 *          code: seatedLadyReact (one-shot), seatedKnit (loop); 'idle' routes to seatedPurseIdle
 *   extra  code poses (posed once, no mixer): seatedReader, standing, typing; 'idle' routes to standing
 * Knees-together for the old lady (the verdict) and the hunch additive are Stage 3. */
(function () {
  'use strict';
  var JG = window.JG, C = JG.clips, R = JG.anim.route;
  function A() { return JG.anim.P; }
  function D(P) { return JG.anim.P.dims(P); }
  function seat(P, o) { JG.anim.P.seat(P, o); }
  /** a hand to the face: off is the wrist from the Head joint in the head's own frame (x mirrored per side),
   *  fingers up over the eyes, palm towards the face */
  function face(P, s, off, o) {
    return A().armTo(P, s, A().headPoint(P, off, s), Object.assign({ elbow: [0.6, -1, -0.2], hand: { dir: [-0.15, 1, 0.1], palm: [0, 0, -1] }, curl: 0.35 }, o || {}));
  }

  // ================================================================ ops
  function pleadArms(P, b) {
    A().stand(P, { arms: false });
    ['l', 'r'].forEach(function (s) {
      A().arm(P, s, [-0.15, -0.14 + 0.03 * b, 0.32], { clav: [0.12, 0.05], elbow: [0.7, -1, -0.2], hand: { dir: [-0.6, 0.6, 0.4], palm: [-1, 0, -0.3] }, curl: 0.7 });
    });
  }
  C.define('ops.pleadArms', { duration: 2.9333, loop: true, keys: [0, 1, 0, 1, 0].map(function (b, i) {
    return { t: i * 2.9333 / 4, pose: function (P) { pleadArms(P, b); } };
  }) });
  C.compose('ops.pleadTalk.arms', { base: 'ops.pleadTalk', over: 'ops.pleadArms', mask: JG.anim.ARMS });
  R('ops.pleadTalk', { clip: 'ops.pleadTalk.arms' });

  function flail(P, f) {
    A().stand(P, { arms: false, lean: 0.05 });
    A().head(P, -0.2, 0.1 * (f ? 1 : -1), 0);
    var hi = [0.25, 0.42, 0.12], lo = [0.3, -0.05, 0.3];
    A().arm(P, 'l', f ? hi : lo, { elbow: [1, 0.3, -0.4], curl: 0.1, hand: { dir: [0.2, 1, 0.2], palm: [0, 0, 1] } });
    A().arm(P, 'r', f ? lo : hi, { elbow: [1, 0.3, -0.4], curl: 0.1, hand: { dir: [0.2, 1, 0.2], palm: [0, 0, 1] } });
  }
  C.define('ops.flail', { duration: 0.6667, loop: true, keys: [
    { t: 0, pose: function (P) { flail(P, 0); } }, { t: 0.3333, pose: function (P) { flail(P, 1); } }, { t: 0.6667, pose: function (P) { flail(P, 0); } }
  ] });
  C.compose('ops.runPanic.flail', { base: 'ops.runPanic', over: 'ops.flail', mask: 'upper' });
  R('ops.runPanic', { clip: 'ops.runPanic.flail' });

  function hunch(P, lean, clav) {
    A().stand(P, { lean: lean, drop: 0.04, arms: false, z: [0.03, -0.04], spread: 0.02 });
    A().head(P, 0.3, 0, 0);
    ['l', 'r'].forEach(function (s) { face(P, s, [0.045, -0.02, 0.16], { clav: [clav || 0, 0.04] }); });
  }
  C.define('ops.breakdown', { duration: 2.4, loop: false, keys: [
    { t: 0, pose: function (P) { A().stand(P); } },
    { t: 0.6, pose: function (P) { A().stand(P, { lean: 0.25, drop: 0.03 }); A().head(P, 0.35, 0, 0); } },
    { t: 1.2, pose: function (P) { hunch(P, 0.38, 0.1); } },
    { t: 2.4, pose: function (P) { hunch(P, 0.45, 0.04); } }
  ] });
  C.define('ops.cryLoop', { duration: 1.6, loop: true, keys: [
    { t: 0, pose: function (P) { hunch(P, 0.42, 0); } }, { t: 0.4, pose: function (P) { hunch(P, 0.36, 0.14); } },
    { t: 0.8, pose: function (P) { hunch(P, 0.44, 0); } }, { t: 1.2, pose: function (P) { hunch(P, 0.37, 0.12); } },
    { t: 1.6, pose: function (P) { hunch(P, 0.42, 0); } }
  ] });

  function wail(P, f) {
    A().stand(P, { lean: -0.14, arms: false, spread: 0.06, tilt: 0.05 * f });
    A().head(P, -0.5, 0.06 * f, 0.08 * f);
    ['l', 'r'].forEach(function (s) { A().arm(P, s, [0.3, -0.42, 0.12], { elbow: [0.4, -0.2, -1], clav: [0.1, 0], curl: 0.15, hand: { palm: [0, 0, 1] } }); });
  }
  C.define('ops.wailLoud', { duration: 1.2, loop: true, keys: [
    { t: 0, pose: function (P) { wail(P, -1); } }, { t: 0.6, pose: function (P) { wail(P, 1); } }, { t: 1.2, pose: function (P) { wail(P, -1); } }
  ] });

  // the comfort hug: posed against Roo where the beat stands them (JG.anim.hug; roo.hugHold turns his chest to her).
  // She leans in, hips forward, and her arms go round his waist under his arms, hands on his sides, palms in. Targets are
  // in Roo's root frame (metres), converted to her rig space.
  var RECEIVE_HAND = {
    l: { at: [-0.235, 1.08, 0.2], dir: [0.15, -0.2, -1], palm: [1, 0, 0] },    // her left hand on his right side
    r: { at: [0.24, 1.06, 0.1], dir: [-0.15, -0.2, -1], palm: [-1, 0, 0] }    // her right hand on his left side
  };
  function receiveArm(P, s, b) {
    var H = JG.anim.hug, k = s === 'l' ? 1 : -1, h = RECEIVE_HAND[s], sc = 1 / H.opsScale;
    var at = H.toOps([h.at[0], h.at[1] + 0.01 * b, h.at[2]]), dir = H.toOps(h.dir, 0), palm = H.toOps(h.palm, 0);
    A().armTo(P, s, [at[0] * sc, at[1] * sc, at[2] * sc], { clav: [-0.08, -0.03], elbow: [0.35, -1, -0.1], hand: { dir: [dir[0] * k, dir[1], dir[2]], palm: [palm[0] * k, palm[1], palm[2]] }, curl: 0.3 });
  }
  function receive(P, b) {
    A().stand(P, { lean: 0.2, hz: 0.09, arms: false, z: [0.03, -0.05], spread: 0.03 });
    receiveArm(P, 'l', b); receiveArm(P, 'r', b);
    A().head(P, 0.22 + 0.04 * b, -0.3, -0.2);
  }
  C.define('ops.hugReceive', { duration: 2.0, loop: true, keys: [
    { t: 0, pose: function (P) { receive(P, 0); } }, { t: 1.0, pose: function (P) { receive(P, 1); } }, { t: 2.0, pose: function (P) { receive(P, 0); } }
  ] });

  function wipe(P, k) {
    A().stand(P, { lean: 0.1, arms: false });
    A().armDown(P, 'l');
    A().head(P, 0.2, k === 2 ? 0.15 : -0.05, 0);
    if (k === 0) A().armDown(P, 'r');
    else face(P, 'r', [k === 1 ? 0.05 : -0.03, 0.02, 0.15], { hand: { dir: [-1, 0.35, 0.1], palm: [0, 0, -1] }, curl: 0.5 });
  }
  C.define('ops.wipeTears', { duration: 1.6, loop: false, keys: [
    { t: 0, pose: function (P) { wipe(P, 0); } }, { t: 0.45, pose: function (P) { wipe(P, 1); } }, { t: 0.9, pose: function (P) { wipe(P, 2); } }, { t: 1.6, pose: function (P) { wipe(P, 0); } }
  ] });

  function thanks(P, b) {
    A().stand(P, { lean: 0.06 + 0.16 * b, arms: false });
    ['l', 'r'].forEach(function (s) { A().arm(P, s, [-0.16, -0.22, 0.27], { elbow: [0.6, -1, -0.3], hand: { dir: [-0.5, 0.7, 0.4], palm: [-1, 0, -0.2] }, curl: 0.6 }); });
    A().head(P, 0.05 + 0.18 * b, 0, 0);
  }
  C.define('ops.thankful', { duration: 2.0, loop: true, keys: [
    { t: 0, pose: function (P) { thanks(P, 0); } }, { t: 0.7, pose: function (P) { thanks(P, 1); } }, { t: 1.2, pose: function (P) { thanks(P, 1); } }, { t: 2.0, pose: function (P) { thanks(P, 0); } }
  ] });

  C.events('ops.walk', [{ t: 0.02, name: 'footL' }, { t: 0.6867, name: 'footR' }]);
  C.events('ops.runPanic', [{ t: 0.02, name: 'footL' }, { t: 0.3533, name: 'footR' }]);

  // ================================================================ old lady
  function purse(P, b) {
    seat(P, { arms: false, spread: 0.01 });
    ['l', 'r'].forEach(function (s) { A().arm(P, s, [-0.1, -0.4 + 0.01 * b, 0.27], { elbow: [0.5, -0.6, -1], hand: { dir: [-0.6, -0.4, 0.6], palm: [0, -1, 0] }, curl: 0.5 }); });
  }
  C.define('oldlady.purseArms', { duration: 1.6667, loop: true, keys: [
    { t: 0, pose: function (P) { purse(P, 0); } }, { t: 0.8333, pose: function (P) { purse(P, 1); } }, { t: 1.6667, pose: function (P) { purse(P, 0); } }
  ] });
  C.compose('oldlady.seatedPurseIdle.arms', { base: 'oldlady.seatedPurseIdle', over: 'oldlady.purseArms', mask: JG.anim.ARMS });
  R('oldlady.seatedPurseIdle', { clip: 'oldlady.seatedPurseIdle.arms' });
  R('oldlady.idle', { clip: 'oldlady.seatedPurseIdle' });
  R('oldlady.rest', { clip: 'oldlady.seatedPurseIdle' });

  function react(P, k) {
    seat(P, { arms: false, spread: 0.01, recline: 0.12 * k });
    A().arm(P, 'l', [-0.1, -0.4, 0.27], { elbow: [0.5, -0.6, -1], hand: { dir: [-0.6, -0.4, 0.6], palm: [0, -1, 0] }, curl: 0.5 });
    if (k > 0.5) A().arm(P, 'r', [-0.18, -0.12, 0.16], { elbow: [0.6, -1, -0.3], hand: { dir: [-1, 0.3, 0], palm: [0, 0, -1] }, curl: 0.3 });
    else A().arm(P, 'r', [-0.1, -0.4, 0.27], { elbow: [0.5, -0.6, -1], hand: { dir: [-0.6, -0.4, 0.6], palm: [0, -1, 0] }, curl: 0.5 });
    A().head(P, -0.05 * k, -0.7 * k, 0.05 * k);
  }
  C.define('oldlady.seatedLadyReact', { duration: 1.6, loop: false, keys: [
    { t: 0, pose: function (P) { react(P, 0); } }, { t: 0.35, pose: function (P) { react(P, 0.4); } }, { t: 0.7, pose: function (P) { react(P, 1); } }, { t: 1.6, pose: function (P) { react(P, 1); } }
  ] });

  // These two gestures ride on her seated purse pose so both hands keep the bag on her lap.
  var headBones = ['neck_01', 'Head'];
  function headKey(t, pitch, yaw, tilt) {
    return { t: t, pose: function (P) { A().head(P, pitch, yaw, tilt); } };
  }
  C.define('oldlady.noticeHead', { duration: 2.65, keys: [
    headKey(0, 0.46, 0.20, -0.03), headKey(1.7, 0.46, 0.20, -0.03),
    headKey(1.95, 0.31, 0.13, -0.02), headKey(2.35, -0.23, -0.02, 0.065),
    headKey(2.65, -0.19, 0, 0.04)
  ] });
  C.compose('oldlady.subwayNotice', { base: 'oldlady.subwayPurse', over: 'oldlady.noticeHead', mask: headBones });
  C.define('oldlady.acceptHead', { duration: 1.5, keys: [
    headKey(0, -0.19, 0, 0.04), headKey(0.2, -0.17, -0.20, 0.05),
    headKey(0.49, -0.15, 0.22, -0.025), headKey(0.8, -0.125, -0.12, 0.02),
    headKey(1.08, -0.075, 0.045, 0.015), headKey(1.5, -0.14, 0, 0.025)
  ] });
  C.compose('oldlady.subwayAccept', { base: 'oldlady.subwayPurse', over: 'oldlady.acceptHead', mask: headBones });

  function knit(P, f) {
    seat(P, { arms: false, spread: 0.01 });
    A().arm(P, 'l', [-0.13, -0.33 + 0.02 * f, 0.3], { elbow: [0.5, -0.6, -1], hand: { dir: [-0.5, 0.3, 0.8], palm: [0, -0.3, -1] }, curl: 0.6 });
    A().arm(P, 'r', [-0.13, -0.33 - 0.02 * f, 0.3 + 0.015 * f], { elbow: [0.5, -0.6, -1], hand: { dir: [-0.5, 0.3, 0.8], palm: [0, -0.3, -1] }, curl: 0.6 });
    A().head(P, 0.3, 0, 0);
  }
  C.define('oldlady.seatedKnit', { duration: 1.2, loop: true, keys: [
    { t: 0, pose: function (P) { knit(P, -1); } }, { t: 0.3, pose: function (P) { knit(P, 1); } }, { t: 0.6, pose: function (P) { knit(P, -1); } },
    { t: 0.9, pose: function (P) { knit(P, 1); } }, { t: 1.2, pose: function (P) { knit(P, -1); } }
  ] });

  // ================================================================ extras (sampled once at t = 0)
  C.define('extra.seatedReader', { duration: 1, loop: true, keys: [{ t: 0, pose: function (P) {
    seat(P, { arms: false, recline: 0.05 });
    ['l', 'r'].forEach(function (s) { A().arm(P, s, [-0.02, -0.26, 0.34], { elbow: [0.6, -1, -0.4], hand: { dir: [0, 1, 0.3], palm: [-1, 0, -0.4] }, curl: 0.6 }); });
    A().head(P, 0.32, 0, 0);
  } }] });
  C.define('extra.standing', { duration: 1, loop: true, keys: [{ t: 0, pose: function (P) {
    A().stand(P, { hx: 0.03, spread: 0.03, tilt: 0.03, arms: false, z: [0.05, -0.03] });
    A().armDown(P, 'l');
    A().arm(P, 'r', [0.08, -0.38, -0.04], { elbow: [1, 0, -0.4], hand: { dir: [0, -1, 0.3], palm: [-1, 0, 0] }, curl: 0.5 });
    A().head(P, 0.05, 0.25, 0);
  } }] });
  C.define('extra.typing', { duration: 1, loop: true, keys: [{ t: 0, pose: function (P) {
    seat(P, { arms: false, recline: -0.05 });
    ['l', 'r'].forEach(function (s) { A().arm(P, s, [-0.08, -0.2, 0.42], { elbow: [0.6, -0.5, -1], hand: { dir: [0, -0.25, 1], palm: [0, -1, 0] }, curl: 0.55 }); });
    A().head(P, 0.15, 0, 0);
  } }] });
  R('extra.idle', { clip: 'extra.standing' });
  R('extra.rest', { clip: 'extra.standing' });
})();
