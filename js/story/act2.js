/* Act 2: subway-ride .. comfort (plan section 7, beats 5-10). OWNER: E2 (story).
 * Classic IIFE; registers beats only, touches neither THREE nor the DOM at load. Every await goes through w;
 * fire-and-forget work runs in w.fork. Timings mirror the beat table's target column. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  function K() { return JG.story; }
  function T(k) { return JG.text(k); }

  var OFFICE56 = { floor: 56, doors: 'open', mood: 'before', monitor: 'off', window: 'intact', light: 'day' };
  // the office at work: three typists (the second west row, the back row, the island's east seat) and one waiting at
  // the printer (2026-11-25: extra3 and extra4 added, extra2 moved to the printer)
  var EXTRAS = { extra1: { at: 'office.extraDesk1', pose: 'typing' }, extra2: { at: 'office.extraStand', pose: 'standing' },
    extra3: { at: 'office.extraDesk2', pose: 'typing' }, extra4: { at: 'office.extraDesk3', pose: 'typing' } };
  var EXTRA_MARKERS = ['office.extraDesk1', 'office.extraDesk2', 'office.extraDesk3', 'office.extraStand'];
  function withExtras(cast) { return Object.assign({}, cast, EXTRAS); }

  // ---------------------------------------------------------------- 5. subway-ride (cine, 12 s)
  JG.beats.register({
    id: 'subway-ride', kind: 'cine', skippable: true, est: 13,
    stage: {
      scene: 'subway', sceneState: { lady: 'plain', motion: 'moving' },
      cast: {
        roo: { at: 'subway.rooSeat', pose: 'seatedIdle', expr: 'smirk', cape: 'drape:seated' },
        oldlady: { at: 'subway.ladySeat', pose: 'seatedPurseIdle', expr: 'deadpan', props: { handbag: 'handL' } },
        extra1: { at: 'subway.extraSeat1', pose: 'seatedReader' },
        extra2: { at: 'subway.extraSeat2', pose: 'seatedReader' }
      },
      audio: { ambience: 'subway' },
      ui: { fade: 1 }
    },
    needs: {
      markers: ['subway.rooSeat', 'subway.ladySeat', 'subway.extraSeat1', 'subway.extraSeat2'], props: ['handbag'],
      anims: ['roo.seatedIdle', 'roo.seatedSmileNod', 'oldlady.seatedPurseIdle', 'oldlady.seatedLadyReact', 'extra.seatedReader'],
      sfx: ['subway_screech', 'subway_chime'],
      shots: ['subway-ride.wide', 'subway-ride.two', 'subway-ride.roo', 'subway-ride.lady']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo'), lady = w.actor('oldlady');
      if (JG.crowd) JG.crowd.prewarm(w, 'plaza-walk');   // builds plaza-walk's crowd a frame at a time (round 2)
      w.cut('subway-ride.wide');
      w.fork(async function (w2) { await w2.fadeIn(0.6); });
      // 2026-11-28: no code-made wheel screech over the owner's subway recording (subway_chime stays at 9.2 s)
      await w.cam('subway-ride.two', 2.6, 'inOutSine');
      // Roo notices the old lady across the aisle and smiles; she stares; he nods; she smiles back
      w.cut('subway-ride.roo');
      w.look(roo, 'oldlady');
      await w.wait(1.0);
      w.express(roo, 'smile');
      await w.wait(0.8);
      w.cut('subway-ride.lady');
      w.look(lady, 'roo');
      await w.wait(1.6);
      w.cut('subway-ride.roo');
      await S.playFor(w, roo, 'seatedSmileNod', 1.6, { fade: 0.2 });
      w.cut('subway-ride.lady');
      w.express(lady, 'smile');
      S.start(w, lady, 'seatedLadyReact', { loop: false, fade: 0.2 });
      w.mark('smile-back');
      await w.wait(1.6);
      w.cut('subway-ride.two');
      w.look(roo, null); w.look(lady, null);
      w.sfx('subway_chime');
      await S.hold(w, t0, 12.55);
      await S.coverOut(w, 'wipe', 0.45);
    }
  });

  // ---------------------------------------------------------------- 6. plaza-walk (play; climb out, walk, elevator)
  JG.beats.register({
    id: 'plaza-walk', kind: 'play', skippable: false, est: 18,
    stage: {
      scene: 'city', sceneState: { area: 'streetB', time: 'day', elevatorDoors: 'open' },
      cast: { roo: { at: 'streetB.subwayExit', pose: 'idle', expr: 'smirk', cape: 'sim' } },
      audio: { ambience: 'street' },
      ui: { fade: 1 }
    },
    needs: {
      markers: ['streetB.subwayExit', 'streetB.spawn', 'streetB.elevatorMark', 'streetB.barkBaby'], zones: ['streetB.elevator'], paths: ['streetB.subwayUp'],
      lines: ['bark_npc_heybaby'], anims: ['roo.idle', 'roo.walk'], sfx: ['step_hard', 'door_slide'], shots: ['plaza-walk.exit', 'plaza-walk.doors']
    },
    play: async function (w) {
      var S = K(), roo = w.actor('roo');
      // round 2: the plaza crowd, and the woman at streetB.barkBaby who calls out once as Roo walks past
      var crowd = JG.crowd ? JG.crowd.start(w) : null;
      if (crowd && crowd.barker) w.fork(async function (w2) {
        var her = crowd.barker;
        await w2.until(function () { return crowd.passing(her, 2.5, 4.0); });
        w2.mark('bark-baby');
        crowd.watch(her, true);
        her.setExpression('talk');
        await w2.say('bark_npc_heybaby', { actor: her, gap: 0.05 });
        her.setExpression('neutral');
        // Roo's reaction: a glance back at her and a grin, then eyes front
        w2.look(roo, her.anchors.head || her.root);
        w2.express(roo, 'smile');
        await w2.wait(1.1);
        w2.look(roo, null);
        w2.express(roo, 'smirk');
        await w2.wait(2.0);
        crowd.watch(her, false);
      });
      w.cut('plaza-walk.exit');
      w.fork(async function (w2) { await w2.fadeIn(0.4); });
      // the scripted 3 s climb out of the subway
      await w.moveTo(roo, 'streetB.subwayUp', { speed: 1.4 });
      w.mark('climbed');
      await w.roam({ actor: 'roo', goal: { zone: 'streetB.elevator' } });
      // auto-walk to the mark before the doors move
      await w.moveTo(roo, 'streetB.elevatorMark', { speed: 1.4, face: true });
      w.cut('plaza-walk.doors');
      w.express(roo, 'smirk');
      await w.wait(0.3);
      w.sfx('door_slide');
      await w.setScene({ elevatorDoors: 'closed' }, 1.2);
      w.mark('doors-closed');
      await S.coverOut(w, 'wipe', 0.45);
    }
  });

  // ---------------------------------------------------------------- 7. elevator-ride (cine, 13 s; skip snaps to 56)
  JG.beats.register({
    id: 'elevator-ride', kind: 'cine', skippable: true, est: 13,
    stage: {
      scene: 'office', sceneState: { floor: 1, doors: 'closed', mood: 'before', monitor: 'off', window: 'intact', light: 'day' },
      cast: { roo: { at: 'office.elevatorMark', pose: 'elevatorStand', expr: 'neutral', cape: 'drape:hero' } },
      audio: { music: 'elevator', ambience: null },   // 2026-11-28: no lift hum under the track; the street bed stops on entry
      ui: { fade: 1 }
    },
    needs: {
      markers: ['office.elevatorMark'], anims: ['roo.elevatorStand', 'roo.footTap', 'roo.shrugCheckWrist'],
      sfx: ['floor_blip', 'ding'], shots: ['elevator-ride.corner', 'elevator-ride.display', 'elevator-ride.face', 'elevator-ride.floor']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo');
      w.cut('elevator-ride.corner');
      w.fork(async function (w2) { await w2.fadeIn(0.4); });
      var blips = w.fork(async function (w2) { for (;;) { await w2.wait(0.95); w2.sfx('floor_blip', { volume: 0.6 }); } });
      // the display counts 1 -> 56 over 10 s (the set animates it)
      var ride = w.fork(async function (w2) { await w2.setScene({ floor: 56 }, 10); });
      await w.wait(1.0);
      S.start(w, roo, 'footTap', { additive: true });
      await w.wait(2.0);
      w.cut('elevator-ride.face');
      await S.playFor(w, roo, 'shrugCheckWrist', 1.8, { fade: 0.25 });
      S.start(w, roo, 'elevatorStand', { fade: 0.3 });
      // a low angle: Roo looks up at the floor count over the doors
      w.cut('elevator-ride.display');
      w.look(roo, S.at('office.elevatorMark', [0, 2.3, 1.1]));
      await w.wait(2.6);
      w.look(roo, null);
      w.express(roo, 'smirk');
      w.cut('elevator-ride.corner');
      await ride.done;
      blips.cancel();
      // the insert on the display reading 56, "DING!" just under it
      w.cut('elevator-ride.floor');
      w.sfx('ding');
      w.lettering(T('lettering.ding'), S.at('office.elevatorMark', [0, 1.8, 1.05]), 1.2);
      w.mark('floor-56');
      await w.wait(0.4);
      w.sfx('ding');
      await w.wait(0.9);
      w.cut('elevator-ride.corner');
      await S.hold(w, t0, 13);
    }
  });

  // ---------------------------------------------------------------- 8. ops-plea (cine, 14 s)
  JG.beats.register({
    id: 'ops-plea', kind: 'cine', skippable: true, est: 14,
    stage: {
      scene: 'office', sceneState: Object.assign({}, OFFICE56, { doors: 'closed' }),
      cast: withExtras({
        roo: { at: 'office.elevatorMark', pose: 'idle', expr: 'smirk', cape: 'drape:hero' },
        ops: { at: 'office.opsStart', pose: 'idle', expr: 'worried' }
      }),
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.elevatorMark', 'office.elevatorOut', 'office.opsStart', 'office.opsPlea'].concat(EXTRA_MARKERS),
      paths: ['office.toHug'], lines: ['ops_help', 'ops_sob'],
      anims: ['roo.idle', 'roo.walk', 'ops.runPanic', 'ops.pleadTalk', 'ops.breakdown', 'ops.cryLoop', 'extra.typing', 'extra.standing'],
      sfx: ['door_slide', 'step_carpet'],
      shots: ['ops-plea.doors', 'ops-plea.run', 'ops-plea.two', 'ops-plea.ops', 'ops-plea.roo']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo'), ops = w.actor('ops');
      w.cut('ops-plea.doors');
      w.sfx('door_slide');
      await w.setScene({ doors: 'open' }, 1);
      await w.parallel(
        async function (w2) { await w2.moveTo(roo, 'office.elevatorOut', { speed: 1.2, face: true }); w2.express(roo, 'worried'); },
        async function (w2) {
          await w2.wait(0.3);
          w2.lettering(T('lettering.help'), 'ops.head', 1.3);
          w2.express(ops, 'plead');
          await w2.wait(0.2);
          w2.cut('ops-plea.run');
          await w2.moveTo(ops, 'office.toHug', { speed: 3.2, clip: 'runPanic' });
        });
      await w.turnTo(ops, 'roo', 0.2);
      S.start(w, ops, 'pleadTalk', { fade: 0.2 });
      w.cut('ops-plea.ops');
      w.mark('plea');
      w.fork(async function (w2) {
        await w2.wait(3.2);
        w2.cut('ops-plea.roo');
        await w2.wait(2.0);
        w2.cut('ops-plea.ops');
      });
      await w.say('ops_help', { actor: ops, gap: 0.2 });
      w.cut('ops-plea.two');
      w.express(ops, 'cry');
      await S.playFor(w, ops, 'breakdown', 1.8, { loop: false, fade: 0.2 });
      S.start(w, ops, 'cryLoop', { fade: 0.3 });
      w.sayLoop('ops_sob', { actor: ops });
      await S.hold(w, t0, 14);
    }
  });

  // ---------------------------------------------------------------- 9. choice (not skippable; never times out)
  JG.beats.register({
    id: 'choice', kind: 'choice', skippable: false, est: 4,
    stage: {
      scene: 'office', sceneState: OFFICE56,
      cast: withExtras({
        roo: { at: 'office.elevatorOut', pose: 'idle', expr: 'worried', cape: 'drape:hero' },
        ops: { at: 'office.opsPlea', pose: 'cryLoop', expr: 'cry' }
      }),
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.elevatorOut', 'office.opsPlea', 'office.deskStand'].concat(EXTRA_MARKERS),
      lines: ['ops_sob', 'gag_roo_get_on', 'gag_ops_wail', 'gag_roo_feelings'],
      anims: ['roo.idle', 'ops.cryLoop', 'ops.wailLoud'],
      sfx: ['ui_blip', 'ui_confirm', 'ui_deny', 'wail'],
      shots: ['choice.two', 'choice.wide']
    },
    play: async function (w) {
      var roo = w.actor('roo'), ops = w.actor('ops'), yUsed = false;
      w.cut('choice.wide');
      w.look(roo, 'ops');
      var sob = w.sayLoop('ops_sob', { actor: ops });
      // a slow push in on the sobbing while the prompt is already up (presses count from the first frame)
      w.cam('choice.two', 1.6, 'inOutSine');
      for (;;) {
        w.mark('choice');
        var r = await w.choose({ options: [
          { action: 'x', text: T('prompts.calm'), primary: true },
          { action: 'y', text: T('prompts.getOn'), struck: yUsed ? T('niceTry') : false }
        ] });
        if (r === 'x') { sob.stop(); w.sfx('ui_confirm'); w.mark('calm'); return; }
        // Y works once: the gag, then back to the choice with Y struck through "NICE TRY" (it then only shakes and buzzes)
        yUsed = true;
        w.flags.yGag = (w.flags.yGag || 0) + 1;
        sob.stop();
        w.mark('y-gag');
        w.look(roo, null);
        w.express(roo, 'neutral');
        await w.turnTo(roo, 'office.deskStand', 0.4);
        await w.say('gag_roo_get_on', { actor: roo });
        w.sfx('wail');
        w.cut('choice.wide');
        w.shake(0.08, 0.6);
        w.lettering(T('lettering.waaah'), 'ops.head', 1.4);
        w.express(ops, 'wail');
        K().start(w, ops, 'wailLoud', { fade: 0.15 });
        await w.say('gag_ops_wail', { actor: ops });
        await w.turnTo(roo, 'ops', 0.3);
        w.express(roo, 'worried');
        w.cut('choice.two');
        await w.say('gag_roo_feelings', { actor: roo });
        K().start(w, ops, 'cryLoop', { fade: 0.3 });
        w.express(ops, 'cry');
        w.look(roo, 'ops');
        sob = w.sayLoop('ops_sob', { actor: ops });
      }
    }
  });

  // ---------------------------------------------------------------- 10. comfort (cine, 12.5 s)
  JG.beats.register({
    id: 'comfort', kind: 'cine', skippable: true, est: 12.5,
    stage: {
      scene: 'office', sceneState: OFFICE56,
      cast: withExtras({
        roo: { at: 'office.hug.roo', pose: 'idle', expr: 'worried', cape: 'drape:hero' },
        ops: { at: 'office.hug.ops', pose: 'cryLoop', expr: 'cry' }
      }),
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.hug.roo', 'office.hug.ops'].concat(EXTRA_MARKERS), lines: ['roo_not_your_fault', 'ops_thank_you'],
      anims: ['roo.hugHold', 'roo.pat', 'ops.hugReceive', 'ops.wipeTears', 'ops.thankful'],
      sfx: ['pat', 'swish'], shots: ['comfort.side', 'comfort.sideClose', 'comfort.overOps', 'comfort.wipe', 'comfort.thanks', 'comfort.two']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo'), ops = w.actor('ops');
      if (JG.crowd) JG.crowd.prewarm(w, 'office-walk');   // office-walk's gossipers and phone guy, a frame at a time
      // the hug starts before line 05 and holds past it, with pats on a fixed cadence. w.hug snaps the pair 0.42 m
      // apart, where his snout goes through her forehead: she stands 0.52 m out and 0.2 m to his left instead, turned
      // a little, so her head rests beside his snout and his arms still close round her back
      var hug = w.hug(roo, ops);
      w.place(roo, S.spot('office.hug.roo', [0, 0, 0], -0.1));
      w.place(ops, S.spot('office.hug.roo', [0.2, 0, 0.52], Math.PI + 0.25));
      w.cut('comfort.side');
      w.mark('hug');
      var pats = w.fork(async function (w2) { for (;;) { await w2.wait(0.8); hug.pat(); } });
      await w.wait(0.5);
      w.express(roo, 'neutral');
      var cuts = w.fork(async function (w2) {
        await w2.wait(1.7);
        w2.cut('comfort.overOps');
        await w2.wait(2.2);
        w2.cut('comfort.side');
        await w2.cam('comfort.sideClose', 2.6, 'inOutSine');
      });
      await w.say('roo_not_your_fault', { actor: roo, gap: 0.3 });
      // the hug holds on the slow push in
      await S.hold(w, t0, 6.6);
      pats.cancel(); cuts.cancel();
      // release on a cut: Roo a step back, the two facing; her tear wipe over his shoulder
      hug.release();
      w.place(roo, S.spot('office.hug.roo', [0, 0, -0.25]));
      await w.turnTo(roo, 'ops', 0);
      await w.turnTo(ops, 'roo', 0);
      w.cut('comfort.wipe');
      w.sfx('swish');
      var oh = S.anchor('ops', 'head');
      w.lettering(T('lettering.sniff'), oh ? [oh[0], oh[1] + 0.12, oh[2]] : 'ops.head', 1.0);
      await S.playFor(w, ops, 'wipeTears', 1.8, { loop: false, fade: 0.2 });
      w.express(ops, 'relieved');
      S.start(w, ops, 'thankful', { fade: 0.3 });
      w.cut('comfort.thanks');
      await w.say('ops_thank_you', { actor: ops });
      w.cut('comfort.two');
      w.look(roo, 'ops'); w.look(ops, 'roo');
      w.express(roo, 'smile');
      await S.hold(w, t0, 12.5);
      w.look(roo, null); w.look(ops, null);
    }
  });
})();
