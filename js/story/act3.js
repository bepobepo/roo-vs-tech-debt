/* Act 3: office-walk .. all-clear (plan section 7, beats 11-15). OWNER: E2 (story).
 * Classic IIFE; registers beats only, touches neither THREE nor the DOM at load. Every await goes through w;
 * fire-and-forget work runs in w.fork. Timings mirror the beat table's target column. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  function K() { return JG.story; }
  function T(k) { return JG.text(k); }

  function office(patch) { return Object.assign({ floor: 56, doors: 'open', mood: 'before', monitor: 'off', window: 'intact', light: 'day' }, patch || {}); }
  var TYPIST = { at: 'office.extraDesk1', pose: 'typing' };
  // the other two typists (2026-11-25), on stage wherever extra1 types: the back row's seat and the island's east seat
  var TYPISTS = { extra1: TYPIST, extra3: { at: 'office.extraDesk2', pose: 'typing' }, extra4: { at: 'office.extraDesk3', pose: 'typing' } };
  var TYPIST_MARKERS = ['office.extraDesk1', 'office.extraDesk2', 'office.extraDesk3'];
  function withTypists(cast) { return Object.assign({}, cast, TYPISTS); }
  // the coffee Roo made in office-walk and still held when he sat down (w.flags.mugOnDesk, set only then: never in
  // auto mode) stands on the hero desk from desk-sit on (office-props deskMug; every beat hides it again)
  function deskMug(w) {
    if (!w.flags.mugOnDesk) return;
    var m = w.prop('deskMug');
    if (m && m.show) m.show(true);
  }

  // ---------------------------------------------------------------- office-walk's optional stations (2026-11-25)
  // Side quests on the way to the computer (w.roam stations; never in auto mode, never on the X path): scan Roo's face
  // at the kiosk (repeatable), a drink and the gossip at the water cooler, a coffee from the machine that is always
  // updating its firmware. Every wait is timed (no clip events); ctx holds the beat's crowd handle and what Roo carries.
  function stationsFor(ctx) {
    var THREE = window.THREE;
    function stand(w2, roo, marker) { return w2.moveTo(roo, marker, { speed: 1.2, face: true }); }
    async function scan(w2, o) {
      var S = K(), roo = w2.actor('roo'), sc = w2.prop('scanner'), first = !o.count, eyes = roo.anchors.eyes || roo.anchors.head;
      w2.cam('office-walk.scan', 0.45, 'inOutSine');
      await stand(w2, roo, 'office.scanStand');
      S.start(w2, roo, 'idleHero', { fade: 0.25 });
      w2.express(roo, 'smirk');
      w2.look(roo, sc.anchors.lens);
      sc.sweep(function () { return eyes.getWorldPosition(new THREE.Vector3()); }, 1.6);
      w2.sfx('scan_sweep');
      await w2.wait(1.6);
      w2.sfx('scan_beep');
      sc.state('ok', first ? 'first' : 'again');
      w2.cut('office-walk.scanScreen');
      w2.lettering(T('lettering.beep'), sc.anchors.beep || sc.anchors.sign, 0.9);
      await w2.say(first ? 'scanner_ok' : 'scanner_again', { gap: 0.15 });
      w2.cut('office-walk.scan');
      w2.look(roo, null);
      if (first) {
        w2.express(roo, 'wink');
        await w2.say('roo_obviously', { actor: roo, gap: 0.3 });
      }
      w2.express(roo, 'smirk');
      S.start(w2, roo, ctx.holding ? 'holdCup' : 'idle', { fade: 0.25 });
    }
    async function cooler(w2) {
      var S = K(), roo = w2.actor('roo'), co = w2.prop('cooler'), crowd = ctx.crowd;
      var brenda = crowd && crowd.spot('gossipA'), gary = crowd && crowd.spot('gossipB');
      function watch(on) { if (brenda) crowd.watch(brenda, on); if (gary) crowd.watch(gary, on); }
      w2.onCancel(function () { watch(false); if (brenda) brenda.setExpression('neutral'); if (gary) gary.setExpression('neutral'); });
      w2.cam('office-walk.cooler', 0.45, 'inOutSine');
      watch(true);
      await stand(w2, roo, 'office.coolerStand');
      // everything at the cooler itself (the mug parked, the press, the glug, the drink) from in front of him, above
      // the island's end (his face, his glove, the cup), so a coffee he brings never holds the walk-in's back view
      w2.cut('office-walk.coolerTap');
      // the coffee, if he made one first, goes on the cooler (and stays there: he forgets it)
      if (ctx.holding === 'coffee') {
        S.start(w2, roo, 'reachPress', { loop: false, fade: 0.15 });
        await w2.wait(0.45);
        S.attach(roo, 'coffee', false); ctx.holding = null; co.parkMug(true); w2.sfx('pat');
        await w2.wait(0.4);
      }
      S.start(w2, roo, 'reachPress', { loop: false, fade: 0.15 });
      await w2.wait(0.45);
      co.glug(1.2); w2.sfx('glug');
      S.attach(roo, 'paperCup', 'handR'); ctx.holding = 'paperCup';
      await w2.wait(0.45);
      // the drink: the camera tilts up with the cup (coolerSip) and he turns a little to his left, towards it, so the
      // cup comes up at his muzzle in front of his face and his arm stays clear of Brenda beyond the cooler
      var y0 = roo.root.rotation.y;
      w2.cam('office-walk.coolerSip', 0.6, 'inOutSine');
      w2.fork(async function (w3) { await w3.turnTo(roo, y0 + 0.3, 0.35); });
      S.start(w2, roo, 'drinkCup', { loop: false, fade: 0.2 });
      await w2.wait(0.7);
      w2.sfx('sip');
      w2.lettering(T('lettering.glug'), 'roo.head', 1.0);
      await w2.wait(0.8);
      await w2.wait(0.5);
      S.start(w2, roo, 'holdCup', { fade: 0.25 });
      // the gossip from the room, turned to Brenda (she starts as he lowers the cup); he turns to Gary by way of the room
      w2.cut('office-walk.coolerTalk');
      w2.fork(async function (w3) { await w3.turnTo(roo, -Math.PI / 2, 0.35); });
      if (brenda) {
        brenda.setExpression('talk'); w2.look(roo, brenda.anchors.head);
        await w2.say('gossip_brenda', { actor: brenda, gap: 0.15 });
        brenda.setExpression('neutral');
      }
      if (gary) {
        gary.setExpression('talk'); w2.look(roo, gary.anchors.head);
        w2.fork(async function (w3) { await w3.turnTo(roo, -1.5 * Math.PI, 0.6); });
        await w2.say('gossip_gary', { actor: gary, gap: 0.15 });
        gary.setExpression('neutral');
      }
      // the quip, and Gary is left holding the cup: both of them from the room; Roo, turned to Gary, holds the cup out
      // during the line and it changes hands before the line ends; the shot holds on Gary with it
      w2.cut('office-walk.coolerHand');
      w2.look(roo, 'camera'); w2.express(roo, 'smirk');
      await w2.turnTo(roo, Math.PI / 2, 0.25);
      w2.fork(async function (w3) {
        await w3.wait(0.15);
        S.start(w3, roo, 'offerCup', { loop: false, fade: 0.2 });
        w3.look(roo, gary ? gary.anchors.head : null);
        await w3.wait(0.6);
        S.attach(roo, 'paperCup', false); ctx.holding = null;
        if (gary) { gary.attach('paperCup', 'handR'); gary.setExpression('talk'); }
        await w3.wait(0.2);
        S.start(w3, roo, 'idle', { fade: 0.3 });
      });
      await w2.say('roo_hold_cup', { actor: roo, gap: 0.1 });
      await w2.wait(0.6);
      if (gary) gary.setExpression('neutral');
      S.start(w2, roo, 'idle', { fade: 0.25 });
      w2.look(roo, null);
      watch(false);
    }
    async function coffee(w2) {
      var S = K(), roo = w2.actor('roo'), cf = w2.prop('coffee');
      w2.cam('office-walk.coffee', 0.45, 'inOutSine');
      await stand(w2, roo, 'office.coffeeStand');
      S.start(w2, roo, 'reachPress', { loop: false, fade: 0.15 });
      await w2.wait(0.45);
      w2.sfx('ui_blip'); cf.firmware(2);
      await w2.wait(0.3);
      // the insert on its screen: "UPDATING FIRMWARE 2 OF 47"
      w2.cut('office-walk.coffeeScreen');
      await w2.wait(1.5);
      w2.cut('office-walk.coffee');
      // still updating: a look at the camera, then a whack
      w2.look(roo, 'camera'); w2.express(roo, 'neutral');
      await w2.wait(0.8);
      w2.look(roo, null); w2.express(roo, 'smirk');
      S.start(w2, roo, 'reachPress', { loop: false, fade: 0.1, speed: 1.6 });
      await w2.wait(0.28);
      w2.sfx('thud', { volume: 0.55 }); w2.shake(0.03, 0.2);
      w2.lettering(T('lettering.bonk'), cf.anchors.button, 0.4);   // gone before BRRRZZT! (same screen area)
      cf.firmware('brew');
      await w2.wait(0.45);
      cf.brew(2.2); w2.sfx('brew');
      w2.lettering(T('lettering.brew'), cf.anchors.top, 1.2);
      await w2.wait(2.3);
      cf.take(); S.attach(roo, 'coffee', 'handR'); ctx.holding = 'coffee';
      S.start(w2, roo, 'drinkCup', { loop: false, fade: 0.2 });
      await w2.wait(0.7);
      w2.sfx('sip');
      w2.lettering(T('lettering.ahh'), 'roo.head', 1.0);
      await w2.wait(1.3);
      // he keeps it (holdCup: the cup on his palm whenever he stands still)
      S.start(w2, roo, 'holdCup', { fade: 0.25 });
      await w2.say('roo_rocket_fuel', { actor: roo, gap: 0.1 });
    }
    // the glass behind the hero desk: a press with the flat of the glove, then the verdict (2026-11-28)
    async function windows(w2) {
      var S = K(), roo = w2.actor('roo');
      w2.cam('office-walk.window', 0.45, 'inOutSine');
      await stand(w2, roo, 'office.windowStand');
      S.start(w2, roo, 'reachPress', { loop: false, fade: 0.15 });
      await w2.wait(0.45);
      w2.sfx('thud', { volume: 0.3 });
      await w2.wait(0.35);
      w2.express(roo, 'smirk');
      await w2.say('roo_sturdy', { actor: roo, gap: 0.1 });
      await w2.wait(0.3);
      S.start(w2, roo, ctx.holding ? 'holdCup' : 'idle', { fade: 0.25 });
    }
    return [
      { id: 'scanner', zone: 'office.scanner', stand: 'office.scanStand', action: 'y', text: T('prompts.scan'), side: T('sideQuests.scanner'), once: false, run: scan },
      // the cooler's run is the longest (two gossip lines, about 14 s): its watchdog leaves room for real recordings
      { id: 'cooler', zone: 'office.cooler', stand: 'office.coolerStand', action: 'y', text: T('prompts.drink'), side: T('sideQuests.cooler'), once: true, limit: 24, run: cooler },
      { id: 'coffee', zone: 'office.coffee', stand: 'office.coffeeStand', action: 'y', text: T('prompts.coffee'), side: T('sideQuests.coffee'), once: true, run: coffee },
      { id: 'window', zone: 'office.window', stand: 'office.windowStand', action: 'y', text: T('prompts.window'), side: T('sideQuests.window'), once: true, run: windows }
    ];
  }

  // ---------------------------------------------------------------- 11. office-walk (play)
  JG.beats.register({
    id: 'office-walk', kind: 'play', skippable: false, est: 10,
    stage: {
      scene: 'office', sceneState: office(),
      cast: withTypists({
        roo: { at: 'office.spawn', pose: 'idle', expr: 'smirk', cape: 'sim' },
        ops: { at: 'office.opsPlea', pose: 'thankful', expr: 'relieved' },
        extra2: { at: 'office.extraStand', pose: 'standing' }
      }),
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.spawn', 'office.opsPlea', 'office.extraStand', 'office.scanStand', 'office.coolerStand', 'office.coffeeStand', 'office.windowStand'].concat(TYPIST_MARKERS),
      zones: ['office.desk', 'office.scanner', 'office.cooler', 'office.coffee', 'office.window'],
      anims: ['roo.idle', 'roo.walk', 'ops.thankful', 'roo.reachPress', 'roo.drinkCup', 'roo.holdCup', 'roo.offerCup', 'roo.idleHero'],
      sfx: ['step_carpet', 'scan_sweep', 'scan_beep', 'glug', 'brew', 'sip', 'ui_blip', 'thud', 'pat'],
      lines: ['scanner_ok', 'scanner_again', 'roo_obviously', 'gossip_brenda', 'gossip_gary', 'roo_hold_cup', 'roo_rocket_fuel', 'roo_sturdy'],
      props: ['coffee', 'paperCup'],
      shots: ['office-walk.thanks', 'office-walk.scan', 'office-walk.scanScreen', 'office-walk.cooler', 'office-walk.coolerTap', 'office-walk.coolerSip', 'office-walk.coolerTalk',
        'office-walk.coolerHand', 'office-walk.coffee', 'office-walk.coffeeScreen', 'office-walk.window']
    },
    play: async function (w) {
      var ops = w.actor('ops'), roo = w.actor('roo');
      // the office at work: the gossipers at the water cooler and the man on the phone (crowd.js), the typists' hulls
      // by camera distance; started before the first cut so the first frame already has them
      var ctx = { crowd: JG.crowd ? JG.crowd.start(w) : null, holding: null };
      if (JG.crowd && JG.crowd.lod) JG.crowd.lod(w, ['extra1', 'extra2', 'extra3', 'extra4'], 6, { cull: ['ops', 'extra1', 'extra2', 'extra3', 'extra4'] });
      w.onCancel(function () { K().attach(roo, 'coffee', false); K().attach(roo, 'paperCup', false); });
      w.look(ops, 'roo');
      // the ops lead, recovered, waves Roo on toward the computer before control returns
      w.cut('office-walk.thanks');
      await w.wait(1.4);
      await w.roam({ actor: 'roo', goal: { zone: 'office.desk', action: 'x', text: T('prompts.sit') }, stations: stationsFor(ctx) });
      if (ctx.holding === 'coffee') w.flags.mugOnDesk = true;
      w.mark('sit-pressed');
    }
  });

  // ---------------------------------------------------------------- 12. desk-sit (cine, 14 s; skip lands on 13 with Radar before)
  JG.beats.register({
    id: 'desk-sit', kind: 'cine', skippable: true, est: 13.5,
    stage: {
      scene: 'office', sceneState: office({ monitor: 'newtab' }),
      cast: withTypists({ roo: { at: 'office.deskStand', pose: 'idle', expr: 'smirk', cape: 'sim' } }),
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.deskStand', 'office.chair'].concat(TYPIST_MARKERS),
      anims: ['roo.sitDownChair', 'roo.seatedType', 'roo.seatedIdle'],
      sfx: ['chair', 'key', 'key_enter'], shots: ['desk-sit.side', 'desk-sit.screen', 'desk-sit.glove', 'desk-sit.typed']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo'), url = String(T('typedUrl') || 'june.ai');
      deskMug(w);
      w.cut('desk-sit.side');
      await w.wait(0.4);
      await w.moveTo(roo, 'office.chair', { speed: 1.0, face: true });
      w.sfx('chair');
      S.cape(roo, 'drape:seated');
      await S.playFor(w, roo, 'sitDownChair', 1.3, { loop: false, fade: 0.15 });
      S.start(w, roo, 'seatedType', { fade: 0.3 });
      // a new tab on the monitor (from Roo's left, so his arm never covers the address bar), then the glove-typing
      // insert for the first keys, then closer on the address bar so "june.ai" reads as it is typed
      w.cut('desk-sit.screen');
      await w.wait(0.9);
      w.cut('desk-sit.glove');
      // the empty address bar first, so the monitor never draws its self-typing "j" before the first key
      S.ui('radar.setState', { stage: 'typing', typed: '' });
      await w.setScene({ monitor: 'typing' });
      await w.wait(0.35);
      for (var i = 1; i <= url.length; i++) {
        if (i === 4) w.cut('desk-sit.typed');
        w.sfx('key');
        S.ui('radar.setState', { stage: 'typing', typed: url.slice(0, i) });
        await w.wait(0.28);
      }
      w.sfx('key_enter');
      w.cut('desk-sit.screen');
      await w.setScene({ monitor: 'loading' });
      S.ui('radar.setState', { stage: 'loading', typed: url });
      await w.wait(1.5);
      // the Radar close-up: "before" (51 of 100), built and held 2 s, then back to the room
      await w.setScene({ monitor: 'before' });
      S.ui('radar.setState', { stage: 'before', typed: url });
      S.ui('radar.show');
      w.mark('radar-before');
      await w.wait(2.4);
      S.ui('radar.hide');
      w.cut('desk-sit.side');
      w.express(roo, 'smirk');
      await S.hold(w, t0, 13.5);
    }
  });

  // ---------------------------------------------------------------- 13. montage (cine, 10 s; skip lands on the time card)
  JG.beats.register({
    id: 'montage', kind: 'cine', skippable: true, est: 10.5,
    stage: {
      scene: 'office', sceneState: office({ monitor: 'before' }),
      cast: withTypists({ roo: { at: 'office.chair', pose: 'seatedIdle', expr: 'smirk', cape: 'drape:seated' } }),
      audio: { ambience: 'office' }
    },
    needs: {
      markers: ['office.chair'].concat(TYPIST_MARKERS), lines: ['roo_few_minutes'], props: ['headphones'],
      anims: ['roo.seatedIdle', 'roo.headphonesOn', 'roo.seatedType', 'roo.grooveBob'],
      sfx: ['hp_on'], shots: ['desk-sit.monitor', 'montage.bob', 'montage.push']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo');
      deskMug(w);
      w.cut('montage.bob');
      w.mark('montage');
      w.look(roo, 'camera');
      await w.say('roo_few_minutes', { actor: roo, gap: 0.15 });
      w.look(roo, null);
      // headphones on: the prop attaches mid-clip
      w.fork(async function (w2) { await w2.wait(0.45); S.attach(roo, 'headphones', 'head'); w2.sfx('hp_on'); });
      await S.playFor(w, roo, 'headphonesOn', 0.9, { loop: false, fade: 0.15 });
      w.music('montage');
      w.musicFx('muffled', 0.3);
      S.ui('nowPlaying.show', T('nowPlaying'));
      S.start(w, roo, 'seatedType', { fade: 0.3 });
      S.start(w, roo, 'grooveBob', { additive: true });
      w.mark('song');
      await w.wait(2.2);
      // the monitor push (the score stays at 51 until the time card)
      w.cut('desk-sit.monitor');
      await w.cam('montage.push', 2.6, 'inOutSine');
      await S.hold(w, t0, 9.5);
      await w.fadeOut(1);
    }
  });

  // ---------------------------------------------------------------- 14. two-hours-later (cine, 6.5 s; skipTo all-clear)
  JG.beats.register({
    id: 'two-hours-later', kind: 'cine', skippable: true, skipTo: 'all-clear', est: 7,
    stage: {
      scene: 'office', sceneState: office({ mood: 'after', monitor: 'before', light: 'dusk' }),
      cast: { roo: { at: 'office.chair', pose: 'seatedType', expr: 'smirk', cape: 'drape:seated', props: { headphones: 'head' } } },
      audio: { music: 'montage', musicFx: 'muffled', ambience: 'office' },
      ui: { fade: 1 }
    },
    needs: {
      markers: ['office.chair'], props: ['headphones'], anims: ['roo.seatedType', 'roo.headphonesOff', 'roo.seatedIdle'],
      sfx: ['time_tick', 'hp_off'], shots: ['two-hours-later.wide', 'two-hours-later.close']
    },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t, roo = w.actor('roo');
      deskMug(w);
      w.cut('two-hours-later.wide');
      w.sfx('time_tick');
      w.mark('card');
      await w.card({ text: T('card'), style: 'timecard' }, 2.2);
      await w.fadeIn(0.8);
      w.cut('two-hours-later.close');
      S.start(w, roo, 'seatedIdle', { fade: 0.3 });
      await w.wait(0.5);
      // headphones off: a 0.4 s tinny leak, then the song fades in 250 ms
      w.fork(async function (w2) { await w2.wait(0.3); S.attach(roo, 'headphones', false); });
      S.start(w, roo, 'headphonesOff', { loop: false, fade: 0.15 });
      w.sfx('hp_off');
      w.musicFx('leak', 0);
      await w.wait(0.4);
      w.music(null, { fade: 0.25 });
      w.express(roo, 'smile');
      await S.hold(w, t0, 7);
    }
  });

  // ---------------------------------------------------------------- 15. all-clear (cine, 8 s; not skippable)
  JG.beats.register({
    id: 'all-clear', kind: 'cine', skippable: false, est: 8.5,
    stage: {
      scene: 'office', sceneState: office({ mood: 'after', monitor: 'before', light: 'dusk' }),
      cast: { roo: { at: 'office.chair', pose: 'seatedIdle', expr: 'smile', cape: 'drape:seated' } },
      audio: { ambience: 'office' },
      ui: { radar: { stage: 'before', typed: 'june.ai' } }
    },
    needs: { markers: ['office.chair'], anims: ['roo.seatedIdle'], sfx: ['tick', 'allclear'], shots: ['all-clear.monitor'] },
    play: async function (w) {
      var S = K(), t0 = JG.clock.t;
      w.cut('all-clear.monitor');
      // three ticks, then the arc sweeps to 100 and the banner shows (held 3 s and more)
      for (var i = 0; i < 3; i++) { w.sfx('tick'); await w.wait(0.3); }
      await w.setScene({ monitor: 'after' });
      S.ui('radar.setState', { stage: 'after' });
      S.ui('radar.show');
      w.sfx('allclear');
      w.mark('banner');
      await w.wait(3.0);
      await S.hold(w, t0, 8.5);
    }
  });
})();
