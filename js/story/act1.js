/* Act 1: title .. street-subway (plan section 7, beats 0-4). OWNER: E2 (story).
 * Classic IIFE; registers beats only (data and async functions), touches neither THREE nor the DOM at load.
 * Every await goes through w; fire-and-forget work runs in w.fork. Timings mirror the beat table's target column. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  function K() { return JG.story; }
  function T(k) { return JG.text(k); }

  var ROOF = { area: 'roof', time: 'day', elevatorDoors: 'open' };

  // ---------------------------------------------------------------- 0. title (card, user-paced)
  JG.beats.register({
    id: 'title', kind: 'card', skippable: false, est: 0,
    stage: { scene: null, cast: {}, ui: { fade: 0, letterbox: false, radar: null, callerCard: null, stagePanel: false } },
    needs: { sfx: [] },
    play: async function (w) {
      var S = K(), go = !!(JG.boot && JG.boot.started);
      JG.input.setMode('ui');
      var off = JG.input.on('press', function (a) { if (a === 'start') go = true; });
      w.onCancel(off);
      // the start button calls inject('start'), which unlocks audio synchronously inside the click (core)
      S.ui('title.show', { onStart: function () { JG.input.inject('start', 'ui'); } });
      if (JG.boot && JG.boot.assetsReady) S.ui('title.enable');
      w.mark('title');
      if (w.auto) w.fork(async function (w2) { await w2.wait(0.5); JG.input.inject('start', 'auto'); });
      await w.until(function () { return go; });
      off();
      w.mark('start');
      // 2026-11-27: no theme sting here; the owner's gaming track starts on the click and carries on into rooftop-call
      w.music('intro', { fadeIn: 0.3, volume: 0.8 });
      await w.fadeOut(0.7);             // over the key art, then the call opens from black
      S.ui('title.hide');
    }
  });

  // ---------------------------------------------------------------- 1. rooftop-call (cine, 17.5 s)
  // Round 2: Roo opens on the couch at roof.couch, playing the console on the rooftop TV (props.tv; the footage slot is
  // assets/video/tv-game.mp4, lazily loaded by the set). The phone rings, he pauses the game (the PAUSED lettering on
  // the screen, the video frozen), puts the pad down, answers seated, stands up and strikes the hero pose.
  var callDef = {
    id: 'rooftop-call', kind: 'cine', skippable: true, est: 23,
    needs: {
      markers: ['roof.couch', 'roof.tv'], lines: ['lauren_problem', 'roo_got_you'], props: ['phone'],
      anims: ['roo.seatedGaming', 'roo.seatedIdle', 'roo.seatedPhone', 'roo.seatedPhoneFacepalm', 'roo.standUp', 'roo.idle', 'roo.heroCrossed'],
      sfx: ['ringtone', 'phone_click', 'ui_blip', 'sting_hero'],
      shots: ['rooftop-call.tv', 'rooftop-call.gamer', 'rooftop-call.paused', 'rooftop-call.wide', 'rooftop-call.phone', 'rooftop-call.stand', 'rooftop-call.hero']
    },
    play: async function (w) {
      var S = K(), roo = w.actor('roo'), tv = S.tv(), G = JG.gaming;
      function tvCall(fn) { try { fn(); } catch (e) { JG.error('rooftop-call tv', e); } }
      if (tv && tv.on) tvCall(function () { tv.on(true); if (tv.pause) tv.pause(false); });
      // the pad rides between his hands while he plays, then lies on the cushion beside him
      var pad = G && JG.world.kit ? G.controller(JG.world.kit, 1.6) : null, padHeld = true;
      if (pad) {
        JG.world.scene.add(pad);
        G.hold(pad, roo);
        w.scope.everyTick(function () { if (padHeld) G.hold(pad, roo); });
      }
      var paused = null;
      w.onCancel(function () {
        if (pad && pad.parent) pad.parent.remove(pad);
        if (paused) tvCall(function () { paused.remove(); });
        if (tv && tv.pause) tvCall(function () { tv.pause(false); });
      });
      // over his shoulder: the game on the TV, Roo a silhouette against it
      // (2026-11-26: the game gets 5 s before the first ring, 2.8 s on the screen and 2.2 s on the player; it was 1.8 s)
      w.cut('rooftop-call.tv');
      // the owner's intro track under the gaming opening; it fades out as the phone rings
      w.music('intro', { fadeIn: 0.8, volume: 0.8 });
      w.onCancel(function () { try { if (JG.audio && JG.audio.music) JG.audio.music.stop(0.3); } catch (e) { /* audio never gates */ } });
      w.fork(async function (w2) { await w2.fadeIn(0.8); });
      await w.wait(2.8);
      w.cut('rooftop-call.gamer');
      w.mark('gaming');
      await w.wait(2.2);
      // the phone rings over the game
      w.music(null, { fade: 1.5 });
      var ring = w.loop('ringtone');
      S.ui('callerCard.show', { name: T('callerName'), level: 1 });
      w.lettering(T('lettering.ring'), 'roo.head', 1.4);
      w.look(roo, 'camera');
      await w.wait(1.0);
      // he pauses the game and puts the pad down
      w.look(roo, null);
      w.sfx('ui_blip');
      // the game freezes on its last frame (props.tv.pause) and a pause menu goes over the screen
      if (tv) tvCall(function () {
        if (typeof tv.pause === 'function') tv.pause(true);
        if (tv.screen && G && G.pauseOverlay) paused = G.pauseOverlay(JG.world.kit, tv.screen, T('lettering.paused'));
        if (!paused && typeof tv.pause !== 'function' && tv.on) tv.on(false);
      });
      S.start(w, roo, 'seatedIdle', { fade: 0.3 });
      padHeld = false;
      if (pad) G.rest(pad, roo, [0.46, 0.5, -0.25]);
      w.cut('rooftop-call.paused');
      w.mark('paused');
      await w.wait(1.1);
      w.lettering(T('lettering.ring'), 'roo.head', 1.0);
      await w.cam('rooftop-call.wide', 1.5, 'inOutSine');
      // he answers without getting up
      ring.stop(0.05);
      w.sfx('phone_click');
      S.attach(roo, 'phone', 'handR');
      S.start(w, roo, 'seatedPhone', { fade: 0.25 });
      w.cut('rooftop-call.phone');
      w.mark('call');
      await w.say('lauren_problem', { gap: 0.15 });
      S.ui('callerCard.hide');
      w.express(roo, 'smirk');
      // “And please” starts 5.43 s into the trimmed 9.88 s take (2026-11-28 take). Keep the gesture
      // inside the reply even when a replacement recording has a different duration.
      var replyScale = JG.audio.vo.duration('roo_got_you') / 9.88;
      w.fork(async function (w2) {
        await w2.wait(5.43 * replyScale);
        await w2.play(roo, 'seatedPhoneFacepalm', { loop: false, fade: 0.15, speed: 1 / replyScale });
        // Resume the phone loop from the matching lap pose so the stand-up can crossfade as usual.
        await S.start(w2, roo, 'seatedPhone', { fade: 0.1 });
      });
      await w.say('roo_got_you', { actor: roo, gap: 0.2 });
      // hangs up, stands, hero pose
      w.sfx('phone_click');
      S.attach(roo, 'phone', false);
      S.cape(roo, 'sim');
      w.cut('rooftop-call.stand');
      await S.playFor(w, roo, 'standUp', 1.0, { loop: false, fade: 0.2 });
      S.start(w, roo, 'idle', { fade: 0.35 });
      await w.wait(0.45);
      w.sfx('sting_hero');
      S.cape(roo, 'drape:hero');
      w.cut('rooftop-call.hero');
      await w.pose(roo, 'heroCrossed', 0.3);
      w.mark('hero');
      // 2 s on the landed hero pose, then the beat ends (2026-11-26: it used to be padded out to 18 s, about 6 s here)
      await w.wait(2.0);
    }
  };
  callDef.stage = {
    scene: 'city', sceneState: ROOF,
    cast: { roo: { at: 'roof.couch', pose: 'seatedGaming', expr: 'smirk', cape: 'drape:seated' } },
    audio: { ambience: 'roof' },
    ui: { fade: 1, callerCard: null }
  };
  JG.beats.register(callDef);

  // ---------------------------------------------------------------- 2. rooftop-walk (play)
  // The optional couch gag (2026-11-26; a w.roam station like the office's: never in auto mode, and never while Roo is
  // in the goal zone, so its X and the jump's X cannot meet). Back behind the couch the prompt offers to continue
  // playing; X does not: Roo turns to the player and refuses, then control and the objective come back. Repeatable;
  // from the second time a NICE TRY goes up with it.
  function couchGag() {
    async function refuse(w2, o) {
      var S = K(), roo = w2.actor('roo'), shot = JG.shots['rooftop-walk.joking'](), p = roo.root.position;
      var clean = false;
      try {
        w2.sfx('ui_deny');
        // a cut, not a move: the follow camera sits behind him and a move to this front shot would swing through his cape
        w2.cut('rooftop-walk.joking');
        await w2.turnTo(roo, Math.atan2(shot.pos[0] - p.x, shot.pos[2] - p.z), 0.35);
        w2.look(roo, 'camera');
        w2.express(roo, 'worried');
        if (o.count) w2.lettering(T('niceTry'), 'roo.head', 1.3);
        S.start(w2, roo, 'youKidding', { loop: false, fade: 0.2 });
        await w2.say('gag_roo_joking', { actor: roo, gap: 0.25 });
        w2.look(roo, null);
        w2.express(roo, 'smirk');
        S.start(w2, roo, 'idle', { fade: 0.25 });
        clean = true;
      } finally {
        // cut off mid-run (watchdog, an error): the scope is cancelled, so put the actor back directly
        if (!clean) {
          try { roo.lookAt(JG.world.lookTarget(null)); } catch (e) { /* best effort */ }
          try { roo.setExpression('smirk'); } catch (e) { /* best effort */ }
          try { roo.pose('idle', 0.25); } catch (e) { /* best effort */ }
        }
      }
    }
    return [{ id: 'keepPlaying', zone: 'roof.console', action: 'x', text: T('prompts.keepPlaying'), limit: 14, run: refuse }];
  }
  JG.beats.register({
    id: 'rooftop-walk', kind: 'play', skippable: false, est: 12,
    stage: {
      scene: 'city', sceneState: ROOF,
      cast: { roo: { at: 'roof.spawn', pose: 'idle', expr: 'smirk', cape: 'sim' } },
      audio: { ambience: 'roof' }
    },
    needs: { markers: ['roof.spawn'], zones: ['roof.edge', 'roof.console'], sfx: ['step_hard', 'fallwind', 'ui_deny'], anims: ['roo.idle', 'roo.walk', 'roo.youKidding'],
      lines: ['gag_roo_joking'], shots: ['rooftop-walk.edge', 'rooftop-walk.joking'] },
    play: async function (w) {
      var roo = w.actor('roo'), S = K(), tv = S.tv(), G = JG.gaming, paused = null;
      // the game he left stays paused on the TV (the couch gag's shot sees the screen)
      function tvCall(fn) { try { fn(); } catch (e) { JG.error('rooftop-walk tv', e); } }
      if (tv && tv.pause) tvCall(function () {
        tv.pause(true);
        if (tv.screen && G && G.pauseOverlay) paused = G.pauseOverlay(JG.world.kit, tv.screen, T('lettering.paused'));
      });
      w.onCancel(function () {
        if (paused) tvCall(function () { paused.remove(); });
        if (tv && tv.pause) tvCall(function () { tv.pause(false); });
      });
      // 2026-11-28: no rising wind loop on the walk any more (the owner's breeze bed carries the roof); fallwind stays in rooftop-jump
      // a beat to take in the drop before control: the edge, then the follow camera
      w.cut('rooftop-walk.edge');
      await w.wait(1.0);
      await w.roam({ actor: 'roo', goal: { zone: 'roof.edge', action: 'x', text: T('prompts.jump') }, stations: couchGag() });
      w.mark('jump-pressed');
    }
  });

  // Roo's root motion shares the body clip's clock. Each key is [seconds, value, slope/second].
  // The forward track spans the distance between set markers. The height track rises in metres.
  var flightForward = [[0.90, 0, 0.37], [1.60, 0.376, 0.46], [2.72, 0.768, 0.24], [3.45, 0.89, 0.10], [5.30, 1, 0]];
  var flightRise = [[0.90, 0, 4], [1.54, 1.28, 0.63], [2.24, 1.45, 0], [2.85, 1.40, -0.12], [3.45, 1.18, -0.61]];
  function flightCurve(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (var i = 1; i < keys.length; i++) {
      var a = keys[i - 1], b = keys[i];
      if (t > b[0]) continue;
      var dt = b[0] - a[0], u = (t - a[0]) / dt, v = 1 - u;
      return (1 + 2 * u) * v * v * a[1] + u * v * v * dt * a[2]
        + (3 - 2 * u) * u * u * b[1] - u * u * v * dt * b[2];
    }
    return keys[keys.length - 1][1];
  }

  // ---------------------------------------------------------------- 3. rooftop-jump (skip lands on beat 4)
  JG.beats.register({
    id: 'rooftop-jump', kind: 'cine', skippable: true, est: 8.7,
    stage: {
      scene: 'city', sceneState: ROOF,
      cast: { roo: { at: 'roof.edgeStand', pose: 'idle', expr: 'smirk', cape: 'sim' } },
      audio: { ambience: 'roof' }
    },
    needs: {
      markers: ['roof.edgeStand', 'roof.jumpFrom', 'streetA.land'],
      lines: ['roo_up_up', 'roo_and_down', 'roo_into_subway'], anims: ['roo.rooftopFlight'],
      sfx: ['whoosh', 'cape_flap', 'fallwind', 'thud'], shots: ['rooftop-jump.edge']
    },
    play: async function (w) {
      var S = K(), roo = w.actor('roo');
      if (JG.crowd) JG.crowd.prewarm(w, 'street-subway');
      w.cut('rooftop-jump.edge');
      await w.moveTo(roo, 'roof.jumpFrom', { speed: 1.8, face: true });

      var ledge = JG.world.marker('roof.jumpFrom').pos, ground = JG.world.marker('streetA.land').pos;
      var fx = JG.world.current.props.rooftopLandingFX, contact = 5.30, duration = 7.65;
      if (fx) w.onCancel(fx.clear);
      await S.start(w, roo, 'rooftopFlight', { loop: false, fade: 0 });
      function speakAt(time, id) {
        return async function (w2) {
          await w2.wait(time);
          await w2.say(id, { actor: roo, gap: 0 });
        };
      }
      await w.parallel(
        function (w2) {
          return w2.tweenFn(duration, function (fraction) {
            var t = duration * fraction, p = roo.root.position;
            p.lerpVectors(ledge, ground, flightCurve(flightForward, t));
            p.x += 0.08 * Math.sin(Math.PI * window.THREE.MathUtils.smoothstep(t, 0.90, 4.90));
            if (t < 3.45) p.y = ledge.y + flightCurve(flightRise, t);
            else {
              var u = Math.min(1, (t - 3.45) / (contact - 3.45));
              p.y = ground.y + (ledge.y + 1.18 - ground.y) * (1 - u * u) - 1.13 * u * (1 - u);
            }
            w2.cut(S.rooftopFlightShot(t, p, ledge));
            if (fx) fx.update(p, t - contact);
          }, 'linear');
        },
        speakAt(0.73, 'roo_up_up'), speakAt(3.56, 'roo_and_down'), speakAt(5.96, 'roo_into_subway'),
        async function (w2) {
          var start = JG.clock.t;
          await w2.wait(0.90);
          w2.sfx('whoosh'); w2.sfx('cape_flap');
          await S.hold(w2, start, 3.45);
          w2.mark('fall');
          w2.express(roo, 'worried');
          var wind = w2.loop('fallwind');
          await S.hold(w2, start, contact);
          wind.stop(0.05);
          w2.sfx('thud'); w2.shake(0.07, 0.20);
          w2.setScene({ area: 'streetA' });
          w2.mark('land');
          w2.express(roo, 'smirk');
        }
      );
    }
  });

  // ---------------------------------------------------------------- 4. street-subway (play; stairs auto-walk + iris)
  JG.beats.register({
    id: 'street-subway', kind: 'play', skippable: false, est: 12,
    stage: {
      scene: 'city', sceneState: { area: 'streetA', time: 'day', elevatorDoors: 'open' },
      cast: { roo: { at: 'streetA.spawn', pose: 'idle', expr: 'smirk', cape: 'sim' } },
      audio: { ambience: 'street' }
    },
    needs: {
      markers: ['streetA.spawn', 'streetA.stairsTop', 'streetA.stairsBottom', 'streetA.barkSuper'], zones: ['streetA.stairsTop'],
      paths: ['streetA.stairsDown'], lines: ['bark_npc_superhero', 'bark_roo_keyboard'], sfx: ['step_hard'], anims: ['roo.idle', 'roo.walk'],
      shots: ['street-subway.stairs']
    },
    play: async function (w) {
      var S = K(), roo = w.actor('roo');
      // round 2: the street crowd, and the guy at streetA.barkSuper who calls out as Roo walks past (non-blocking)
      var crowd = JG.crowd ? JG.crowd.start(w) : null;
      if (crowd && crowd.barker) w.fork(async function (w2) {
        var guy = crowd.barker;
        await w2.until(function () { return crowd.passing(guy, 2.5, 4.0); });
        w2.mark('bark-super');
        crowd.watch(guy, true);
        guy.setExpression('talk');
        await w2.say('bark_npc_superhero', { actor: guy, gap: 0.15 });
        guy.setExpression('neutral');
        // Roo answers over his shoulder and keeps walking
        w2.look(roo, guy.anchors.head || guy.root);
        w2.express(roo, 'smirk');
        await w2.say('bark_roo_keyboard', { actor: roo, gap: 0.1 });
        w2.look(roo, null);
        await w2.wait(2.0);
        crowd.watch(guy, false);
      });
      // the "Take me there" chip completes this beat too: reaching the zone is the goal, no button
      await w.roam({ actor: 'roo', goal: { zone: 'streetA.stairsTop' } });
      w.mark('stairs');
      w.cut('street-subway.stairs');
      await w.moveTo(roo, 'streetA.stairsDown', { speed: 1.5 });
      // iris for subway entries; subway-ride opens from black
      await S.coverOut(w, 'iris', 0.6);
    }
  });
})();
