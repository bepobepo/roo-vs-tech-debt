/* Seats for the subway's 45 cm moulded pan. Fit the lower body to the car and keep the
 * existing upper-body performances, including Roo's wink and the lady's knitting. */
(function () {
  'use strict';
  var JG = window.JG, C = JG.clips;

  function fit(P, hipsY, hipsZ, feetZ, spread, sole) {
    JG.anim.P.sit(P, { y: hipsY, z: hipsZ, feet: feetZ, spread: spread, feetY: [sole, sole], arms: false });
  }
  C.define('roo.subwayLegs', { duration: 1, loop: true, keys: [{ t: 0, pose: function (P) {
    fit(P, 0.632, -0.246, [0.17, 0.20], 0.052, -0.016);
    // The root of the tail rests above the bench, then its length curls along the seat
    // beside him and over the front edge so the last section can hang towards the aisle.
    P.tail([-3, 3, 2, 10, 45, 70, 48], [100, 110, 125, 149, 146, 138, 134]);
  } }] });
  function ladyLegs(P) {
    fit(P, 0.69, -0.298, [0.115, 0.14], 0.021, -0.013);
  }
  C.define('oldlady.subwayLegs', { duration: 1, loop: true, keys: [{ t: 0, pose: ladyLegs }] });
  // Her hands meet the curved handle while the base of the handbag rests across her
  // thighs. The head tracks for noticing Roo and accepting his answer layer over this.
  function holdHandbag(P, breath) {
    var A = JG.anim.P;
    ladyLegs(P);
    A.spine(P, 0.13 + 0.008 * breath, 0, 0);
    ['l', 'r'].forEach(function (s) {
      var left = s === 'l';
      A.armTo(P, s, [left ? 0.095 : -0.096, 1.033, left ? -0.047 : -0.051], {
        elbow: [0.7, -0.6, -0.8], hand: { dir: [-0.62, -0.72, 0.31], palm: [0.12, -0.38, -1] }, curl: 0.48
      });
    });
  }
  C.define('oldlady.subwayPurse', { duration: 2.8, loop: true, keys: [
    { t: 0, pose: function (P) { holdHandbag(P, 0); } },
    { t: 1.4, pose: function (P) { holdHandbag(P, 1); } },
    { t: 2.8, pose: function (P) { holdHandbag(P, 0); } }
  ] });
  C.define('extra.subwayLegs', { duration: 1, loop: true, keys: [{ t: 0, pose: function (P) {
    var d = JG.anim.P.dims(P);
    fit(P, 0.532 + 2 * (d.hipY - d.thighY), -0.279, [0.125, 0.15], 0.047, -0.012);
  } }] });

  C.compose('roo.subwayIdle', { base: 'roo.subwayLegs', over: 'roo.seatedIdle', mask: 'upper' });
  C.compose('roo.subwayWink', { base: 'roo.subwayLegs', over: 'roo.seatedWink', mask: 'upper' });
  C.compose('oldlady.subwayKnit', { base: 'oldlady.subwayLegs', over: 'oldlady.seatedKnit', mask: 'upper' });
  C.compose('extra.subwayReader', { base: 'extra.subwayLegs', over: 'extra.seatedReader', mask: 'upper' });
})();
