/* The exec's code clips and clip events (plan section 9). OWNER: E3. Data only.
 * FIRST VERSIONS (Stage 1, 2026-11-24):
 *   library (asset build map): walk (Walk_Formal_Loop), armsCrossedIdle (Idle_FoldArms_Loop, the key-art pose)
 *   code: disbelief: a recoil with palms out, hands to the temples, a slow head shake, then held (one-shot, 2.2 s) */
(function () {
  'use strict';
  var JG = window.JG, C = JG.clips;
  function A() { return JG.anim.P; }

  var HAIR_OUT = 0.13;   // the wrist's distance from the head's centre line, metres (skull 0.075 + hair + palm)
  function disbelief(P, k, shake) {
    A().stand(P, { lean: -0.1 * Math.min(k, 1), spread: 0.06, arms: false, z: [0, -0.06 * Math.min(k, 1)] });
    if (k === 0) { A().armDown(P, 'l'); A().armDown(P, 'r'); }
    else if (k === 1) ['l', 'r'].forEach(function (s) {
      A().arm(P, s, [0.04, -0.2, 0.3], { elbow: [0.8, -1, -0.2], hand: { dir: [0, 1, 0.2], palm: [0, 0, 1] }, curl: 0.1 });
    });
    A().head(P, -0.08 * Math.min(k, 1), shake || 0, 0);
    // hands to the sides of the head, elbows out and a little forward. Round 2c: the palms rest ON the long hair (the
    // wrists sit HAIR_OUT outside the skull, the fingers open), where they used to sink into it, and the elbows come
    // forward so the upper arms pass in front of the locks that hang past the shoulders instead of through them
    if (k === 2) ['l', 'r'].forEach(function (s) {
      A().armTo(P, s, A().headPoint(P, [HAIR_OUT, -0.005, 0.045], s), { elbow: [0.75, 0.0, 0.65], hand: { dir: [-0.15, 0.75, -0.65], palm: [-1, 0, 0] }, curl: 0.25 });
    });
  }
  C.define('exec.disbelief', { duration: 2.2, loop: false, keys: [
    { t: 0, pose: function (P) { disbelief(P, 0); } },
    { t: 0.3, pose: function (P) { disbelief(P, 1); } },
    { t: 0.85, pose: function (P) { disbelief(P, 2, 0.18); } },
    { t: 1.2, pose: function (P) { disbelief(P, 2, -0.18); } },
    { t: 1.55, pose: function (P) { disbelief(P, 2, 0.12); } },
    { t: 2.2, pose: function (P) { disbelief(P, 2, 0); } }
  ] });

  C.events('exec.walk', [{ t: 0.02, name: 'footL' }, { t: 0.6867, name: 'footR' }]);
})();
