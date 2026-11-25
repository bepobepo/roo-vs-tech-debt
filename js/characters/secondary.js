/* JG.secondary: secondary motion applied after the mixer (plan section 9: "Tail and ears: springs in secondary.js,
 * applied after the mixer"). Engine only; actors pass their chains. Classic script; touches nothing at load.
 *
 * FIRST VERSION (Stage 0 step 6, 2026-11-24): lagged angular springs. Each bone of a chain has a target local rotation
 * (e.g. Roo's standing tail shape); every frame it starts from where inertia would keep it (its previous world
 * rotation, seen from its parent's new frame) and eases towards the target with a stiffness that rises along the chain
 * root -> tip falling. So the tail trails the hips when Roo turns or jumps and settles back to its shape. The cape's
 * Verlet sheet (5x8, plan section 9) is later work.
 *
 *   const s = JG.secondary.chain(bones, targets, { stiffness: 18, tipStiffness: 7 })
 *   s.update(dt)   after mixer.update(dt) and before render;  s.reset() snaps to the targets (teleport, beat entry)
 */
(function () {
  'use strict';
  var JG = window.JG;

  function chain(bones, targets, opts) {
    var THREE = window.THREE, Q = THREE.Quaternion;
    opts = opts || {};
    var k0 = opts.stiffness || 18, k1 = opts.tipStiffness || 7;
    var prev = bones.map(function () { return new Q(); }), primed = false;
    var tmp = new Q(), pw = new Q(), carry = new Q();
    function worldQ(o, out) { o.getWorldQuaternion(out); return out; }
    function snap() {
      bones.forEach(function (b, i) { b.quaternion.copy(targets[i]); });
      if (bones[0].parent) bones[0].parent.updateMatrixWorld(true);
      bones.forEach(function (b, i) { worldQ(b, prev[i]); });
      primed = true;
    }
    return {
      reset: snap,
      update: function (dt) {
        if (!primed || !(dt > 0)) { snap(); return; }
        dt = Math.min(dt, 0.05);
        if (bones[0].parent) bones[0].parent.updateMatrixWorld(true);
        for (var i = 0; i < bones.length; i++) {
          var b = bones[i], f = bones.length > 1 ? i / (bones.length - 1) : 0;
          var k = k0 + (k1 - k0) * f, a = 1 - Math.exp(-k * dt);
          worldQ(b.parent, pw);
          carry.copy(pw).invert().multiply(prev[i]);          // where inertia keeps it, in the parent's new frame
          b.quaternion.copy(carry).slerp(targets[i], a);
          b.updateMatrixWorld(true);
          worldQ(b, prev[i]);
        }
      }
    };
  }

  JG.secondary = { chain: chain };
})();
