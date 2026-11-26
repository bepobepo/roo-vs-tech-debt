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
      w.music('theme');                 // the theme sting after the click
      await w.fadeOut(0.7);             // over the key art, then the call opens from black
      S.ui('title.hide');
    }
  });

  // ---------------------------------------------------------------- 1. rooftop-call (cine, 17.5 s)
  // Round 2: Roo opens on the couch at roof.couch, playing the console on the rooftop TV (props.tv; the footage slot is
  // assets/video/tv-game.mp4, lazily loaded by the set). The phone rings, he pauses the game (the PAUSED lettering on
  // the screen, the video frozen), puts the pad down, answers seated, stands up and strikes the hero pose.
  var callDef = {
    id: 'rooftop-call', kind: 'cine', skippable: true, est: 17.5,
    needs: {
      markers: ['roof.couch', 'roof.tv'], lines: ['lauren_problem', 'roo_got_you'], props: ['phone'],
      anims: ['roo.seatedGaming', 'roo.seatedIdle', 'roo.seatedPhone', 'roo.standUp', 'roo.idle', 'roo.heroCrossed'],
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
      w.fork(async function (w2) { await w2.fadeIn(0.8); });
      await w.wait(2.8);
      w.cut('rooftop-call.gamer');
      w.mark('gaming');
      await w.wait(2.2);
      // the phone rings over the game
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
      // wind rising toward the edge: a quiet fallwind loop whose level follows the distance to the edge zone
      w.fork(async function (w2) {
        var wind = w2.loop('fallwind', { volume: 0 }), c = JG.world.zoneCenter('roof.edge');
        if (!c) return;
        var d0 = Math.max(1, Math.hypot(roo.root.position.x - c.x, roo.root.position.z - c.z));
        for (;;) {
          await w2.wait(0.1);
          var d = Math.hypot(roo.root.position.x - c.x, roo.root.position.z - c.z), k = Math.max(0, Math.min(1, 1 - d / d0));
          try { if (wind.set) wind.set('volume', 0.08 + 0.4 * k); } catch (e) { /* audio never gates */ }
        }
      });
      // a beat to take in the drop before control: the edge, then the follow camera
      w.cut('rooftop-walk.edge');
      await w.wait(1.0);
      await w.roam({ actor: 'roo', goal: { zone: 'roof.edge', action: 'x', text: T('prompts.jump') }, stations: couchGag() });
      w.mark('jump-pressed');
    }
  });

  // ---------------------------------------------------------------- 3. rooftop-jump (cine, 8 s; skip lands on beat 4)
  JG.beats.register({
    id: 'rooftop-jump', kind: 'cine', skippable: true, est: 8.5,
    stage: {
      scene: 'city', sceneState: ROOF,
      cast: { roo: { at: 'roof.edgeStand', pose: 'idle', expr: 'smirk', cape: 'sim' } },
      audio: { ambience: 'roof' }
    },
    needs: {
      markers: ['roof.edgeStand', 'roof.jumpFrom', 'streetA.land'],
      anims: ['roo.jumpOff', 'roo.fallDive', 'roo.landHero', 'roo.idleHero'],
      sfx: ['whoosh', 'cape_flap', 'fallwind', 'thud'],
      shots: ['rooftop-jump.edge', 'rooftop-jump.front', 'rooftop-jump.fallTop', 'rooftop-jump.fall', 'rooftop-jump.land', 'rooftop-jump.rise']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo');
      if (JG.crowd) JG.crowd.prewarm(w, 'street-subway');   // builds street-subway's crowd a frame at a time (round 2)
      w.cut('rooftop-jump.edge');
      await w.moveTo(roo, 'roof.jumpFrom', { speed: 1.8, face: true });
      w.cut('rooftop-jump.front');
      await S.playFor(w, roo, 'jumpOff', 0.55);
      w.sfx('whoosh'); w.sfx('cape_flap');
      var wind = w.loop('fallwind');
      S.start(w, roo, 'fallDive', { fade: 0.1 });
      // the street is the same set: switch area lighting mid-air, then the low shot looking up at the fall
      w.setScene({ area: 'streetA' });
      w.cut('rooftop-jump.fallTop');
      w.mark('fall');
      await w.parallel(
        async function (w2) { await w2.cam('rooftop-jump.fall', 1.7, 'inQuad'); },
        async function (w2) { await w2.arc(roo, { to: 'streetA.land', height: 1.4, sec: 1.7, ease: 'inQuad' }); });
      // impact: flash, THOOM, shake and thud on the same frame (G2: within 50 ms)
      wind.stop(0.05);
      w.cut('rooftop-jump.land');
      var land = JG.world.marker('streetA.land');
      if (land) roo.root.rotation.y = land.yaw;
      S.ui('fade.to', 0.85, 0, '#ffffff');
      w.sfx('thud');
      w.shake(0.3, 0.5);
      w.lettering(T('lettering.thoom'), 'roo', 1.2);
      S.cape(roo, 'drape:hero');
      w.mark('land');
      w.fork(async function (w2) { await w2.fadeIn(0.2); });
      await S.playFor(w, roo, 'landHero', 1.5, { fade: 0.05 });
      w.cut('rooftop-jump.rise');
      S.cape(roo, 'sim');
      S.start(w, roo, 'idleHero', { fade: 0.4 });
      w.express(roo, 'smirk');
      await S.hold(w, t0, 8.5);
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
