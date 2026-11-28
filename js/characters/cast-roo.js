/* Roo as a game actor (plan sections 6 and 9). OWNER: E3. Wraps JG.roo.build (the Stage 0 port on the shared
 * skeleton) in the Actor API of JG.anim:
 *   - library and code clips play through one AnimationMixer on the port's root, in clipMode (the rest cape rides on
 *     cape_root until the Verlet cape lands);
 *   - the named poses rest, heroCrossed, crouch and dive are one-frame clips read from the port's own pose functions,
 *     so held poses and clips share one path (crossfades included); while one is held the cape shows that pose's
 *     drape shell;
 *   - the tail spring (secondary.js through port.update) runs after the mixer unless the base clip keys the tail;
 *   - breath runs as its own additive action, always;
 *   - the jaw follows the speaker's voice level and the wink closes his right eyelid independently of the body clip.
 * Classic script; registers at load, builds nothing until the world asks for 'roo'. */
(function () {
  'use strict';
  var JG = window.JG;

  // the station cups in the right glove (anchor handR's reference frame; tuned by screenshot on drinkCup)
  var CUP = { along: 0, root: [0.012, -0.0486, 0.0084], rot: [1.4754, -0.016, -1.5571] };

  function build(kit, info) {
    var THREE = kit.THREE, port = JG.roo.build(THREE, kit), rig = port.rig;
    var poseClips = {}, capeOn = 'pose', subwayDrape = false;

    /** a held pose as a one-frame clip, read from the port's pose function */
    function poseClip(name) {
      if ((port.poses || []).indexOf(name) < 0) return null;
      if (poseClips[name]) return poseClips[name];
      // reading the pose writes it into the rig (so does taking the cape back to the root): the bones go back
      // afterwards (onBase applies a pose that snaps), or the first use of a blended pose showed it finished for one
      // frame before the blend began
      var keep = keepBones();
      capeToRoot();
      port.pose(name);
      var tracks = rig.bones.map(function (b) { return new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', [0], b.quaternion.toArray()); });
      var h = rig.byName.pelvis.position;
      tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', [0], [h.x, h.y, h.z]));
      keep();
      var clip = new THREE.AnimationClip('roo.pose.' + name, 1, tracks);
      clip.userData = { loop: true, pose: name };
      return (poseClips[name] = clip);
    }

    /** remembers every bone's rotation and the pelvis position; the returned function puts them back */
    function keepBones() {
      var q = rig.bones.map(function (b) { return b.quaternion.clone(); }), hp = rig.byName.pelvis.position.clone();
      return function () { rig.bones.forEach(function (b, i) { b.quaternion.copy(q[i]); }); rig.byName.pelvis.position.copy(hp); };
    }
    // the cape goes back to the root only from the rest pose, where cape_root sits where it was attached
    function capeToRoot() { if (capeOn === 'clip') { port.clipMode(false); capeOn = 'pose'; } }

    var jawOpening = 0, wink = 0, winkTarget = 0, winkRate = 0;
    var face = {
      neutral: 'neutral', cur: 'neutral',
      set: function (n, fade) {
        face.cur = n || 'neutral';
        winkTarget = face.cur === 'wink' ? 1 : 0;
        if (fade > 0) winkRate = 1 / fade;
        else { wink = winkTarget; port.setWink(wink); }
      },
      mouth: function (level) {
        // levelAt already gates and normalises the recorded voice. The silent half of its
        // fallback syllable is 0.05. Let an emphatic syllable reach the full authored opening.
        var target = level > 0.05 ? Math.min(1, level * 1.3) : 0;
        var dt = JG.clock && JG.clock.dt;
        if (!level || !dt) {
          // Explicit stop/skip, or direct input from the paused character viewer.
          jawOpening = target;
          port.setJawOpening(jawOpening);
        } else {
          // Match the preview's quick attack and softer release at any update rate.
          var rate = target > jawOpening ? 44 : 20;
          jawOpening += (target - jawOpening) * (1 - Math.exp(-rate * dt));
        }
      }
    };

    var a = JG.anim.actor(kit, {
      id: info.id, base: 'roo', kind: 'roo', height: 1.8, radius: 0.35, model: port.root, rig: rig, animRoot: port.root,
      anchors: port.anchors, headBone: rig.byName.Head, lookLimit: 1.1, defaultClip: 'idle', always: ['breath'],
      natural: { walk: 1.45 * (rig.legRatio || 1), run: 3.9 * (rig.legRatio || 1) },
      poseClip: poseClip, face: face,
      onBase: function (e, fade) {
        // A blended pose (fade > 0) keeps the bones where they are: port.pose() writes the whole pose into the rig at
        // once, after this tick's mixer update, so the frame of the call showed the finished pose and the next one
        // fell back to the start of the blend (rooftop-call: the hero pose flashed on the first frame of its shot,
        // then Roo took it a second time). The mixer blends the pose clip in from the next tick.
        if (e.pose) {
          var keep = fade > 0 ? keepBones() : null;
          capeToRoot();
          port.pose(e.pose);
          if (keep) keep();
        }
        else if (capeOn !== 'clip') { port.clipMode(true); capeOn = 'clip'; }
      },
      afterMixer: function (dt, ctl, reset) {
        if (wink !== winkTarget) {
          var step = winkRate * dt;
          wink = winkTarget ? Math.min(1, wink + step) : Math.max(0, wink - step);
          port.setWink(wink);
        }
        // Held poses key every bone. Apply the current opening after they have been sampled.
        port.setJawOpening(jawOpening);
        if (reset) { port.resetSecondary(); return; }
        if (!ctl || !ctl.baseHasTrack('tail_01.quaternion')) port.update(dt);
        if (subwayDrape) port.setSubwayCape(true);
      },
      teleport: function () { port.resetSecondary(); },
      cape: function (mode) {
        // Stage 1: one drape that follows the torso; 'sim' and the drapes are Stage 2 (the Verlet cape)
        if (subwayDrape && mode !== 'drape:subway') port.setSubwayCape(false);
        subwayDrape = mode === 'drape:subway';
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
