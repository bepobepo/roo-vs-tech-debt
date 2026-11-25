/* Roo as a game actor (plan sections 6 and 9). OWNER: E3. Wraps JG.roo.build (the Stage 0 port on the shared
 * skeleton) in the Actor API of JG.anim:
 *   - library and code clips play through one AnimationMixer on the port's root, in clipMode (the rest cape rides on
 *     cape_root until the Verlet cape lands);
 *   - the named poses rest, heroCrossed, crouch and dive are one-frame clips read from the port's own pose functions,
 *     so held poses and clips share one path (crossfades included); while one is held the cape shows that pose's
 *     drape shell;
 *   - the tail spring (secondary.js through port.update) runs after the mixer unless the base clip keys the tail;
 *   - breath runs as its own additive action, always;
 *   - expressions and the mouth are recorded only at Stage 1 (the face region of the atlas is Stage 2 look-dev).
 * Classic script; registers at load, builds nothing until the world asks for 'roo'. */
(function () {
  'use strict';
  var JG = window.JG;

  // the station cups in the right glove (anchor handR's reference frame; tuned by screenshot on drinkCup)
  var CUP = { along: 0, root: [0.012, -0.0486, 0.0084], rot: [1.4754, -0.016, -1.5571] };

  function build(kit, info) {
    var THREE = kit.THREE, port = JG.roo.build(THREE, kit), rig = port.rig;
    var poseClips = {}, capeOn = 'pose';

    /** a held pose as a one-frame clip, read from the port's pose function */
    function poseClip(name) {
      if ((port.poses || []).indexOf(name) < 0) return null;
      if (poseClips[name]) return poseClips[name];
      capeToRoot();
      port.pose(name);
      var tracks = rig.bones.map(function (b) { return new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', [0], b.quaternion.toArray()); });
      var h = rig.byName.pelvis.position;
      tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', [0], [h.x, h.y, h.z]));
      var clip = new THREE.AnimationClip('roo.pose.' + name, 1, tracks);
      clip.userData = { loop: true, pose: name };
      return (poseClips[name] = clip);
    }

    // the cape goes back to the root only from the rest pose, where cape_root sits where it was attached
    function capeToRoot() { if (capeOn === 'clip') { port.clipMode(false); capeOn = 'pose'; } }

    var face = { neutral: 'neutral', cur: 'neutral', level: 0,
      set: function (n) { face.cur = n || 'neutral'; }, mouth: function (l) { face.level = l; } };

    var a = JG.anim.actor(kit, {
      id: info.id, base: 'roo', kind: 'roo', height: 1.8, radius: 0.35, model: port.root, rig: rig, animRoot: port.root,
      anchors: port.anchors, headBone: rig.byName.Head, lookLimit: 1.1, defaultClip: 'idle', always: ['breath'],
      natural: { walk: 1.45 * (rig.legRatio || 1), run: 3.9 * (rig.legRatio || 1) },
      poseClip: poseClip, face: face,
      onBase: function (e) {
        if (e.pose) { capeToRoot(); port.pose(e.pose); }
        else if (capeOn !== 'clip') { port.clipMode(true); capeOn = 'clip'; }
      },
      afterMixer: function (dt, ctl, reset) {
        if (reset) { port.resetSecondary(); return; }
        if (!ctl || !ctl.baseHasTrack('tail_01.quaternion')) port.update(dt);
      },
      teleport: function () { port.resetSecondary(); },
      cape: function (mode) {
        // Stage 1: one drape that follows the torso; 'sim' and the drapes are Stage 2 (the Verlet cape)
        var show = mode !== 'off';
        if (port.cape) port.cape.visible = show;
        if (port.capeInk) port.capeInk.visible = show;
      },
      propOffset: function (prop, an) {
        if (prop === 'headphones') return { along: 0.14 };
        if (prop === 'phone') return { along: 0.1, root: [0, 0, 0.02] };
        // the office stations' cups (office-walk): held in the glove, upright while drinkCup brings them to the muzzle
        if (prop === 'coffee' || prop === 'paperCup') return CUP;
        return { along: 0.08 };
      }
    });
    a.port = port;
    return a;
  }

  JG.characters.register('roo', build);
})();
