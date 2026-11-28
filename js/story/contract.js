/* JG.CONTRACT: the frozen id lists every owner codes against (plan sections 6-9, Stage 0 step 10).
 * Names change only here, by request to E2. stubs.js covers any registered name that has no implementation yet,
 * and __game.contract() reports names used but not listed here. Classic script; data only.
 *
 * FIRST VERSION (Stage 0 step 10, 2026-11-24): beats, clips, expressions, sfx, music and the VO ids come straight
 * from the plan. Scene-state keys, markers, zones and paths were not named in the plan; they are a first proposal
 * derived from the beat table, for E4 (sets) and E2 (story) to confirm in Stage 1 week one. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};

  var BEATS = ['title', 'rooftop-call', 'rooftop-walk', 'rooftop-jump', 'street-subway', 'subway-ride', 'plaza-walk',
    'elevator-ride', 'ops-plea', 'choice', 'comfort', 'office-walk', 'desk-sit', 'montage', 'two-hours-later',
    'all-clear', 'how', 'window-exit', 'subway-wink', 'tagline'];

  JG.CONTRACT = {
    version: '0.2-round2',
    beats: BEATS,
    beatKinds: {
      title: 'card', 'rooftop-call': 'cine', 'rooftop-walk': 'play', 'rooftop-jump': 'cine', 'street-subway': 'play',
      'subway-ride': 'cine', 'plaza-walk': 'play', 'elevator-ride': 'cine', 'ops-plea': 'cine', choice: 'choice',
      comfort: 'cine', 'office-walk': 'play', 'desk-sit': 'cine', montage: 'cine', 'two-hours-later': 'cine',
      'all-clear': 'cine', how: 'cine', 'window-exit': 'cine', 'subway-wink': 'cine', tagline: 'card'
    },
    actors: ['roo', 'exec', 'ops', 'oldlady', 'extra'],

    // contract clip ids per actor (plan section 9); the library/code mapping lives in tools/assets.config.json
    clips: {
      roo: ['idle', 'walk', 'run', 'seatedIdle', 'sitDownChair', 'phoneHold', 'jumpOff', 'landHero', 'elevatorStand',
        'seatedType', 'runDive', 'idleChill', 'idleHero', 'fallDive', 'rooftopFlight', 'hugHold', 'seatedSmileNod', 'seatedWink',
        'subwayIdle', 'subwayWave', 'subwayWink',
        'shrugCheckWrist', 'headphonesOn', 'headphonesOff', 'twoFingerSalute',
        // round 2 (rooftop-call on the couch): clips-gaming.js
        'seatedGaming', 'seatedPhone', 'seatedPhoneFacepalm', 'standUp',
        // office-walk's stations (2026-11-25): clips-roo.js
        'reachPress', 'drinkCup', 'holdCup', 'offerCup',
        // rooftop-walk's couch gag (2026-11-26): clips-roo.js
        'youKidding'],
      exec: ['walk', 'armsCrossedIdle', 'disbelief'],
      ops: ['runPanic', 'pleadTalk', 'breakdown', 'cryLoop', 'wailLoud', 'hugReceive', 'wipeTears', 'thankful'],
      oldlady: ['seatedPurseIdle', 'seatedLadyReact', 'seatedKnit', 'subwayPurse', 'subwayNotice', 'subwayAccept', 'subwayKnit'],
      extra: ['seatedReader', 'subwayReader', 'standing', 'typing']
    },
    additive: { roo: ['breath', 'footTap', 'pat', 'keyPress', 'grooveBob'] },
    clipEvents: ['footL', 'footR', 'impact', 'attach', 'shatter'],
    poses: { roo: ['rest', 'heroCrossed', 'crouch', 'dive'] },

    expressions: {
      roo: ['neutral', 'smirk', 'smile', 'worried', 'wink'],
      exec: ['confident', 'talk', 'shock', 'halfSmile'],
      ops: ['worried', 'plead', 'cry', 'wail', 'relieved'],
      oldlady: ['deadpan', 'smile', 'curious', 'talking', 'amused']
    },
    props: ['phone', 'headphones', 'handbag', 'knitting', 'coffee', 'paperCup'],

    // frozen SFX ids (plan section 6, Audio)
    sfx: ['ui_blip', 'ui_confirm', 'ui_deny',
      'step_hard', 'step_carpet', 'whoosh', 'cape_flap', 'thud', 'glass',
      'phone_click', 'subway_chime', 'subway_screech', 'door_slide', 'ding', 'floor_blip',
      'wail', 'swish', 'pat', 'chair', 'key', 'key_enter', 'hp_on', 'hp_off', 'time_tick', 'tick', 'allclear',
      'ting', 'sting_hero', 'sting_end',
      // office-walk's stations (2026-11-25)
      'scan_sweep', 'scan_beep', 'glug', 'brew', 'sip'],
    loops: ['ringtone', 'sob', 'fallwind'],
    ambience: ['roof', 'street', 'subway', 'elevator', 'office'],
    music: ['theme', 'elevator', 'montage', 'montageInstrumental', 'intro', 'ending'],
    musicFx: ['muffled', 'leak'],

    // VO ids: the keys of JG.LINES (site/js/story/lines.js), in manifest order
    lines: ['lauren_problem', 'roo_got_you', 'roo_up_up', 'roo_and_down', 'roo_into_subway', 'bark_npc_superhero', 'bark_roo_keyboard', 'subway_lady_kangaroo', 'subway_roo_yep',
      'bark_npc_heybaby', 'ops_help', 'ops_sob', 'roo_not_your_fault', 'ops_thank_you',
      'roo_few_minutes', 'exec_how', 'roo_good_at', 'roo_dont_need_me', 'gag_roo_get_on', 'gag_ops_wail', 'gag_roo_feelings',
      'scanner_ok', 'scanner_again', 'roo_obviously', 'gossip_brenda', 'gossip_gary', 'roo_hold_cup', 'roo_rocket_fuel', 'roo_sturdy', 'gag_roo_joking'],
    actions: ['x', 'y', 'skip', 'start', 'mute'],

    scenes: ['city', 'subway', 'office'],
    // scene-state keys and their allowed values (setState patches use only these)
    sceneState: {
      city: { area: ['roof', 'streetA', 'streetB'], time: ['day'], elevatorDoors: ['open', 'closed'] },
      subway: { lady: ['plain', 'knitting'], motion: ['moving', 'stopped'] },
      office: { floor: [1, 56], doors: ['open', 'closed'], mood: ['before', 'after'], monitor: ['off', 'newtab', 'typing', 'loading', 'before', 'after'],
        window: ['intact', 'broken'], light: ['day', 'dusk'] }
    },
    // markers {pos, yaw}, zones and paths each scene must provide (first proposal, from the beat table)
    markers: {
      city: ['roof.spawn', 'roof.phoneStand', 'roof.edgeStand', 'roof.jumpFrom', 'streetA.land', 'streetA.spawn', 'streetA.stairsTop',
        'streetA.stairsBottom', 'streetB.subwayExit', 'streetB.spawn', 'streetB.elevatorMark',
        // round 2: the couch and TV on the roof (rooftop-call), the two bark NPCs' spots
        'roof.couch', 'roof.tv', 'streetA.barkSuper', 'streetB.barkBaby'],
      subway: ['subway.rooSeat', 'subway.ladySeat', 'subway.extraSeat1', 'subway.extraSeat2', 'subway.cam'],
      office: ['office.elevatorMark', 'office.elevatorOut', 'office.opsStart', 'office.opsPlea', 'office.hug.roo', 'office.hug.ops',
        'office.spawn', 'office.deskStand', 'office.chair', 'office.execStand', 'office.windowRun', 'office.windowHole',
        'office.extraDesk1', 'office.extraDesk2', 'office.extraStand',
        // the office life pass (2026-11-25): the third typist's island seat, the three stations' stand marks
        'office.extraDesk3', 'office.scanStand', 'office.coolerStand', 'office.coffeeStand', 'office.windowStand']
    },
    zones: { city: ['roof.edge', 'roof.console', 'streetA.stairsTop', 'streetB.elevator'], office: ['office.desk', 'office.scanner', 'office.cooler', 'office.coffee', 'office.window'] },
    paths: { city: ['streetA.stairsDown', 'streetB.subwayUp'], office: ['office.toHug', 'office.windowRun'] },
    camPresets: ['rooftop-walk', 'street-subway', 'plaza-walk', 'office-walk'],
    anchors: ['head', 'eyes', 'earR', 'chest', 'backUpper', 'handL', 'handR', 'hip', 'seat'],

    // round 2: the street crowd (site/js/characters/crowd.js). Crowd NPCs are not cast members (never staged, never in
    // the state hash); a set provides SceneInstance.crowd[beatId] (walker paths) and crowdSpots[beatId] (standers).
    // The bark NPCs stand at the markers above; their lines are the bark_* VO ids.
    crowd: {
      beats: ['street-subway', 'plaza-walk', 'office-walk'],
      poses: ['idle', 'phone', 'lean', 'talk'],
      clips: ['idle', 'walk', 'phone', 'lean', 'talk'],
      barks: { 'street-subway': { spot: 'streetA.barkSuper', lines: ['bark_npc_superhero', 'bark_roo_keyboard'] },
        'plaza-walk': { spot: 'streetB.barkBaby', lines: ['bark_npc_heybaby'] } }
    },
    // round 2: the rooftop TV (city SceneInstance.props.tv = {on(bool), video, screen}); the footage slot is
    // assets/video/tv-game.mp4, loaded lazily by the set, never by the boot manifest
    sceneProps: { city: ['tv'], office: ['monitor', 'window', 'windowBroken', 'scanner', 'cooler', 'coffee', 'deskMug'] }
  };
})();
