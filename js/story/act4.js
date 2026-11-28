/* Act 4: how .. tagline (plan section 7, beats 16-19). OWNER: E2 (story).
 * Classic IIFE; registers beats only, touches neither THREE nor the DOM at load. Every await goes through w;
 * fire-and-forget work runs in w.fork. Timings mirror the beat table's target column. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  function K() { return JG.story; }
  function T(k) { return JG.text(k); }

  var AFTER = { floor: 56, doors: 'open', mood: 'after', monitor: 'after', window: 'intact', light: 'dusk' };
  var KNIT = { lady: 'knitting', motion: 'moving' };

  // ---------------------------------------------------------------- 16. how (cine, 13 s)
  JG.beats.register({
    id: 'how', kind: 'cine', skippable: true, est: 14,
    stage: {
      scene: 'office', sceneState: AFTER,
      cast: {
        roo: { at: 'office.chair', pose: 'seatedIdle', expr: 'smile', cape: 'drape:seated' },
        exec: { at: 'office.execStand', pose: 'armsCrossedIdle', expr: 'confident' }
      },
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.chair', 'office.chairExit', 'office.execStand'], lines: ['exec_how', 'roo_good_at', 'roo_dont_need_me'],
      anims: ['exec.walk', 'exec.armsCrossedIdle', 'exec.disbelief', 'roo.seatedSmileNod', 'roo.standFromDesk', 'roo.idle', 'roo.twoFingerSalute'],
      sfx: ['step_carpet', 'chair'], shots: ['how.two', 'how.exec', 'how.roo', 'how.rise', 'how.salute']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo'), exec = w.actor('exec');
      // the exec walks up the last steps to her mark (placed before the first frame renders)
      var stand = JG.world.marker('office.execStand');
      w.place(exec, S.at('office.execStand', [0, 0, -1.4]));
      if (stand) exec.root.rotation.y = stand.yaw;
      w.cut('how.two');
      await w.parallel(
        async function (w2) { await w2.moveTo(exec, 'office.execStand', { speed: 1.0, face: true }); },
        async function (w2) {
          await w2.wait(0.6);
          w2.sfx('chair');
          var chair = w2.prop('chair'), yaw = JG.world.marker('office.chairExit').yaw;
          if (chair.swivel) await w2.tweenFn(0.7, function (k) { chair.swivel(roo, yaw * k); }, 'inOutSine');
          else await w2.turnTo(roo, 'exec', 0.7);
        });
      K().start(w, exec, 'armsCrossedIdle', { fade: 0.3 });
      w.look(exec, 'roo');
      w.look(roo, 'exec');
      w.cut('how.exec');
      w.express(exec, 'shock');
      K().start(w, exec, 'disbelief', { loop: false, fade: 0.2 });
      await w.say('exec_how', { actor: exec });
      w.cut('how.roo');
      w.express(roo, 'smirk');
      S.start(w, roo, 'seatedSmileNod', { loop: false, fade: 0.2 });
      await w.say('roo_good_at', { actor: roo });
      // Hold the full figure while he leans over his planted feet and pushes off the chair.
      w.cut('how.rise');
      K().start(w, exec, 'armsCrossedIdle', { fade: 0.4 });
      w.express(exec, 'talk');
      await w.wait(0.15);
      w.mark('stand');
      w.sfx('chair');
      await w.play(roo, 'standFromDesk', { loop: false, speed: 0.8, fade: 0.15 });
      S.cape(roo, 'sim');
      S.start(w, roo, 'idle', { fade: 0.25 });
      await w.wait(0.2);
      w.cut('how.salute');
      await w.say('roo_dont_need_me', { actor: roo, gap: 0.15 });
      w.express(exec, 'halfSmile');
      w.mark('salute');
      await S.playFor(w, roo, 'twoFingerSalute', 1.4, { loop: false, fade: 0.15 });
      w.express(roo, 'smirk');
      await S.hold(w, t0, 14);
    }
  });

  // ---------------------------------------------------------------- 17. window-exit (cine, 8 s)
  JG.beats.register({
    id: 'window-exit', kind: 'cine', skippable: true, est: 8.5,
    stage: {
      scene: 'office', sceneState: AFTER,
      cast: {
        roo: { at: 'office.chairExit', pose: 'idle', expr: 'smirk', cape: 'sim' },
        exec: { at: 'office.execStand', pose: 'armsCrossedIdle', expr: 'halfSmile' }
      },
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.chairExit', 'office.execStand', 'office.windowRun', 'office.windowHole'], paths: ['office.windowRun'],
      anims: ['roo.runDive', 'roo.dive', 'exec.disbelief'], sfx: ['glass', 'whoosh'],
      shots: ['window-exit.run', 'window-exit.dive', 'window-exit.hole', 'window-exit.exec']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo'), exec = w.actor('exec');
      var V = window.THREE.Vector3;
      var pts = (JG.world.path('office.windowRun') || []).slice();
      if (pts.length < 2) { var h0 = JG.world.marker('office.windowHole'); pts = [roo.root.position.clone(), h0 ? h0.pos : roo.root.position.clone().add(new V(0, 1.2, 4))]; }
      var n = pts.length, hole = pts[n - 1], runEnd = n >= 3 ? pts[n - 2] : roo.root.position.clone().lerp(hole, 0.6).setY(roo.root.position.y);
      var hopStart = n >= 4 ? pts[n - 3] : null, run = n >= 4 ? pts.slice(1, n - 2) : [];
      w.cut('window-exit.run');
      w.look(exec, 'roo');
      // the run (along the set's path, round the desk), then three bounding hops
      if (run.length) await w.moveTo(roo, run.map(function (p) { return p.toArray(); }), { speed: 4.5, clip: 'runDive' });
      else S.start(w, roo, 'runDive');
      var from = (hopStart || roo.root.position).clone();
      for (var i = 1; i <= 3; i++) {
        var to = from.clone().lerp(runEnd, i / 3);
        if (to.x !== roo.root.position.x || to.z !== roo.root.position.z) roo.root.rotation.y = Math.atan2(to.x - roo.root.position.x, to.z - roo.root.position.z);
        await w.arc(roo, { to: to.toArray(), height: 0.35, sec: 0.3, ease: 'linear' });
      }
      // the dive through the closed glass
      w.mark('dive');
      w.cut('window-exit.dive');
      w.sfx('whoosh');
      w.pose(roo, 'dive', 0.1);
      await w.arc(roo, { to: hole.toArray(), height: 0.35, sec: 0.32, ease: 'outQuad' });
      w.sfx('glass');
      w.setScene({ window: 'broken' });
      w.shake(0.18, 0.4);
      w.lettering(T('lettering.krassh'), 'office.windowHole', 1.3);
      w.mark('glass');
      var dir = new V(hole.x - runEnd.x, 0, hole.z - runEnd.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      var beyond = hole.clone().addScaledVector(dir, 3.2).setY(hole.y - 2.6);
      await w.arc(roo, { to: beyond.toArray(), height: 0.3, sec: 0.55, ease: 'inQuad' });
      // the Roo-shaped hole, then the exec's face, then black
      w.cut('window-exit.hole');
      await w.wait(1.3);
      w.cut('window-exit.exec');
      w.express(exec, 'shock');
      S.start(w, exec, 'disbelief', { loop: false, fade: 0.2 });
      await S.hold(w, t0, 7.7);
      await w.fadeOut(0.8);
    }
  });

  // ---------------------------------------------------------------- 18. subway-wink (cine, 8 s)
  JG.beats.register({
    id: 'subway-wink', kind: 'cine', skippable: true, est: 8.5,
    stage: {
      scene: 'subway', sceneState: KNIT,
      cast: {
        roo: { at: 'subway.rooSeat', pose: 'subwayIdle', expr: 'smirk', cape: 'drape:subway' },
        oldlady: { at: 'subway.ladySeat', pose: 'subwayKnit', expr: 'deadpan', props: { knitting: 'handR' } }
      },
      audio: { ambience: 'subway' },
      ui: { fade: 1 }
    },
    needs: {
      markers: ['subway.rooSeat', 'subway.ladySeat'], props: ['knitting'],
      anims: ['roo.subwayIdle', 'roo.subwayWink', 'oldlady.subwayKnit'], sfx: ['ting'],
      shots: ['subway-wink.wide', 'subway-wink.knitting', 'subway-wink.close']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo');
      w.cut('subway-wink.wide');
      await w.fadeIn(0.8);
      await w.wait(1.4);
      // she is knitting a tiny magenta cape
      w.cut('subway-wink.knitting');
      await w.wait(1.6);
      w.cut('subway-wink.close');
      await w.wait(0.7);
      w.look(roo, 'camera');
      await w.wait(0.6);
      w.express(roo, 'wink');
      w.sfx('ting');
      w.mark('wink');
      await S.playFor(w, roo, 'subwayWink', 1.0, { loop: false, fade: 0.15 });
      // the stage shrinks to an inked panel; the tagline freezes this frame
      S.ui('stagePanel', true);
      await S.hold(w, t0, 8.5);
    }
  });

  // ---------------------------------------------------------------- 19. tagline (card over the frozen frame)
  JG.beats.register({
    id: 'tagline', kind: 'card', skippable: false, est: 0,
    // freeze: entered by flow, subway-wink's last frame and inked panel stay as they are; entered by a jump (goto,
    // hash, replay tests), this stage rebuilds that frame
    stage: {
      freeze: true, scene: 'subway', sceneState: KNIT,
      cast: {
        roo: { at: 'subway.rooSeat', pose: 'subwayIdle', expr: 'wink', look: 'camera', cape: 'drape:subway' },
        oldlady: { at: 'subway.ladySeat', pose: 'subwayKnit', expr: 'deadpan', props: { knitting: 'handR' } }
      },
      cam: 'subway-wink.close',
      ui: { stagePanel: true }
    },
    needs: { markers: ['subway.rooSeat', 'subway.ladySeat'], sfx: ['sting_end'], shots: ['subway-wink.close'] },
    play: async function (w) {
      var S = K(), replay = false;
      JG.input.setMode('ui');
      w.sfx('sting_end');
      w.music('ending', { volume: 0.8 });   // 2026-11-28: the owner's G-funk track, looped (the code-made theme plays only if ending.mp3 is missing)
      S.ui('end.show', { onReplay: function () { replay = true; } });
      var off = JG.input.on('press', function (a) { if (a === 'start') replay = true; });
      w.onCancel(off);
      w.mark('tagline');
      await w.until(function () { return replay; });
      off();
      S.ui('end.hide');
      return 'rooftop-call';
    }
  });
})();
