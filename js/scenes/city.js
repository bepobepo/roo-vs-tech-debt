/* JG.scenes.register('city'): roof, streetA, streetB (plan section 10), E4. Stage 1 greybox-plus, then the look pass
 * of 2026-11-24 (user request: a richer, lived-in comic city, more people, Roo's rooftop gaming corner).
 *
 * Layout (metres; y up, yaw 0 faces +Z). Pavement tops are y = 0 everywhere; Kenney road tiles sit at y = -0.18 so
 * their kerbs meet the pavement. The kit grid is 9 m: road R1 runs along X at z = -33, roads R2 and R3 along Z at
 * x = -16.5 and x = 28.5.
 *   roof     Roo's building (x/z +-8, deck at y = 20, parapet to 20.6; the jump-off stands on it). Stair hut with the
 *            KayKit water tower on top, Downtown AC units, vents, and in the north-west corner (outside every
 *            rooftop-walk rectangle) Roo's gaming corner: deck platform, rug, couch facing north, coffee table with
 *            snacks (Roo brings his own pad), TV on a stand (screen = props.tv), an unbranded console on the stand's shelf and
 *            its cable to an outlet on the parapet.
 *   streetA  the plaza south of the roof building (z -28.5..-8) with the HOP ST subway entrance; trees, benches,
 *            planters, a newsstand, a food cart, a bus stop on R3, cafe tables; across R1 a row of shops (fronts at
 *            z = -42) with awnings, signs, a bus stop and billboards; block W across R2 (fronts at x = -24).
 *   streetB  the plaza at x 54..66 between the HOP ST exit and the FORTUNE 500 tower (podium, lobby recess, elevator
 *            doors at z ~13.05, the cab behind them), with tree-lined sidewalks either side (buildings at x 50 / 70).
 * Buildings are facade-atlas shells (JG.setkit building(): ink-lined windows, shopfronts, parapets, 12-24 tris a
 * floor-face) with an ink hull box each; street furniture is Kenney/KayKit (kit-city.glb), Quaternius Downtown
 * (kit-downtown.glb: AC units, bollards, planters, manholes, a door frame) and procedural props. A painted sky dome
 * and two rings of untextured-hull skyline towers give depth. Every sign is our own canvas lettering (no brand).
 * Markers, zones, paths, walk rectangles and camPresets keep the positions the beats were written against.
 *
 * Crowd data (for the story/crowd owner): SceneInstance.crowd[beatId] = [{id, points: [[x, z], ...], loop, count,
 * lane?, lat?}] (loop true: a closed loop; false: walk to the end and back), crowdSpots[beatId] = [{id, pos, yaw, pose}]
 * and barkGates[beatId] = [{min: [x, z], max: [x, z]}], for street-subway and plaza-walk. Every path stays on pavement
 * and off the furniture.
 * props.tv = {object, anchors, screen, video, on(bool), isOn(), pause(bool), state()}: assets/video/tv-game.mp4 (muted, looped) as a
 * VideoTexture, fetched lazily as bytes (a blob URL, so no media range requests), with an animated canvas game frame
 * whenever the video is missing, still loading or refuses to play. The TV is switched on at every area change.
 * Classic script; THREE and the DOM are touched only inside build(). No timers: the fallback redraws in update(). */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var PI = Math.PI;
  var DECK = 20.1;   // the gaming corner's platform top (roof deck 20.0 + 0.1)

  var MARKERS = {
    'roof.spawn': { pos: [0, 20, 3], yaw: PI }, 'roof.phoneStand': { pos: [2, 20, 4], yaw: PI },
    'roof.edgeStand': { pos: [0, 20, -6.6], yaw: PI }, 'roof.jumpFrom': { pos: [0, 20.6, -7.9], yaw: PI },
    'streetA.land': { pos: [0, 0, -12], yaw: PI }, 'streetA.spawn': { pos: [0, 0, -12.5], yaw: PI },
    'streetA.stairsTop': { pos: [8, 0, -21.5], yaw: PI }, 'streetA.stairsBottom': { pos: [8, -3, -26], yaw: PI },
    'streetB.subwayExit': { pos: [60, -3, -4.5], yaw: 0 }, 'streetB.spawn': { pos: [60, 0, -0.5], yaw: 0 },
    'streetB.elevatorMark': { pos: [60, 0, 13.7], yaw: PI },
    // new (look pass): Roo on the couch facing the TV (root at the seat's front edge, hips over the cushions), the TV
    // screen centre (facing the couch), and the two bark NPCs, each a step off Roo's straight route
    'roof.couch': { pos: [-4.4, DECK, 4.8], yaw: 0 }, 'roof.tv': { pos: [-4.4, DECK + 1.01, 7.215], yaw: PI },
    'streetA.barkSuper': { pos: [2.6, 0, -17.6], yaw: 1.17 }, 'streetB.barkBaby': { pos: [61.7, 0, 4.8], yaw: -PI / 2 }
  };
  var ZONES = {
    'roof.edge': { type: 'box', min: [-3, -7.6], max: [3, -5.6] },
    // rooftop-walk's optional gag (2026-11-26): the strip of roof behind the couch, inside the walk rects (the deck
    // itself is outside them), where "continue playing" is offered; far from roof.edge, so the two X prompts never meet
    'roof.console': { type: 'box', min: [-5.5, 2.2], max: [-2.5, 3.4] },
    'streetA.stairsTop': { type: 'box', min: [7, -22.5], max: [9, -20.5] },
    'streetB.elevator': { type: 'box', min: [58.5, 11], max: [61.5, 13] }
  };
  var PATHS = {
    'streetA.stairsDown': ['streetA.stairsTop', [8, -1.5, -23.8], 'streetA.stairsBottom'],
    'streetB.subwayUp': ['streetB.subwayExit', [60, -1.5, -2.5], 'streetB.spawn']
  };
  var CAM = {
    'rooftop-walk': { yaw: PI, dist: 5.5, height: 2.8, lookHeight: 1.1, lag: 0.25 },
    'street-subway': { yaw: 2.1, dist: 5.8, height: 3.0, lookHeight: 1.1, lag: 0.25 },
    'plaza-walk': { yaw: 0, dist: 6, height: 3, lookHeight: 1.1, lag: 0.25 }
  };
  // pedestrians: walking paths and standing spots per play beat. Checked by script against the set's colliders (body
  // radius 0.3 m): every lane, and every sidestep the path's lat range allows, keeps the body clear of posts, rails,
  // props and walls, and heads clear of the tree canopies. Path fields (JG.crowd): lane = the walking lane's offset
  // from the line (default 0.45, clamped to lat; the kerb paths keep 0.35, clear of the lamp posts), lat = [min, max]
  // the lateral range a walker may use to make room, in the path's left normal frame (+ = left of the point order),
  // default [-1.1, 1.1].
  var CROWD = {
    'street-subway': [
      { id: 'aFarWalk', points: [[-11.0, -40.1], [23.0, -40.1], [23.0, -40.9], [-11.0, -40.9]], loop: true, count: 3, lat: [-0.35, 0.35] },   // shops across R1
      { id: 'aEastPlaza', points: [[15.3, -25.8], [15.3, -11.6], [21, -11.6], [21, -25.8]], loop: true, count: 2, lat: [-0.45, 0.55] },          // east of the plaza
      // the plaza's kerb, either side of the subway stairs (the lamp posts and the hydrant stand at z -28.1 and beyond)
      { id: 'aSouthKerbW', points: [[-9.6, -27.25], [6.2, -27.25]], loop: false, count: 1, lane: 0.35, lat: [-0.5, 0.5] },
      { id: 'aSouthKerbE', points: [[9.8, -27.25], [22.2, -27.25]], loop: false, count: 1, lane: 0.35, lat: [-0.5, 0.5] },
      { id: 'aWestBlock', points: [[-22.1, -27.5], [-22.1, 12]], loop: false, count: 1, lane: 0.25, lat: [-0.3, 0.3] }                         // block W across R2
    ],
    'plaza-walk': [
      { id: 'bWestWalk', points: [[52.6, -9.8], [52.6, 9.2]], loop: false, count: 2, lat: [-0.5, 0.5] },
      { id: 'bEastWalk', points: [[67.4, -9.8], [67.4, 9.2]], loop: false, count: 2, lat: [-0.5, 0.5] },
      // the cross street south of the plaza, through the alleys between the side blocks (z -12..-10)
      { id: 'bSouthWalk', points: [[42, -11], [78, -11]], loop: false, count: 2, lat: [-0.6, 0.6] },
      // from the podium corners down the sidewalks and off into the alleys
      { id: 'bTowerWalkW', points: [[52.6, 9.0], [52.6, -11], [43, -11]], loop: false, count: 1, lat: [-0.5, 0.5] },
      { id: 'bTowerWalkE', points: [[67.4, 9.0], [67.4, -11], [77, -11]], loop: false, count: 1, lat: [-0.5, 0.5] }
    ],
    'rooftop-walk': []
  };
  var CROWD_SPOTS = {
    'street-subway': [
      { id: 'aPhone', pos: [16.0, 0, -10.2], yaw: PI, pose: 'phone' },
      { id: 'aChat1', pos: [18.5, 0, -20.9], yaw: PI / 2, pose: 'talk' },
      { id: 'aChat2', pos: [19.65, 0, -20.9], yaw: -PI / 2, pose: 'talk' },
      { id: 'aLean', pos: [-5.6, 0, -8.35], yaw: PI, pose: 'lean' },
      { id: 'aBus', pos: [8.0, 0, -38.5], yaw: 0, pose: 'idle' }
    ],
    'plaza-walk': [
      { id: 'bPhone', pos: [65.9, 0, 9.4], yaw: PI, pose: 'phone' },
      { id: 'bChat1', pos: [57.55, 0, 5.6], yaw: -2.16, pose: 'talk' },
      { id: 'bChat2', pos: [56.6, 0, 4.96], yaw: 0.98, pose: 'talk' },
      { id: 'bLean', pos: [50.3, 0, -2.5], yaw: PI / 2, pose: 'lean' },
      { id: 'bWait', pos: [66.3, 0, -15.6], yaw: PI / 2, pose: 'idle' }   // at the food cart
    ],
    'rooftop-walk': []
  };
  // bark gates (JG.crowd): the beat's bark also fires once Roo walks into one of these rectangles, so a route that
  // keeps away from the bark NPC still hears it. Each gate lies past the point where the auto route's bark fires, and
  // within about 7 m of the NPC (who then turns and steps towards Roo as he calls, JG.crowd), and every route to the
  // goal zone crosses one: streetA's stairs are only reached through x 7..9 at z -21..-20.5, the elevator only through
  // the gap at z 8.05, x 56.3..63.7. The third street gate catches a player who heads west from the spawn (the long
  // way round by x -9 and the south kerb): he hears the call there, 7-10 m from the NPC with him in view, instead of
  // 20 s later at the stairs with the NPC behind the camera. The fourth catches the east side the same way: walking
  // east from the spawn the NPC is in view (about 5.4 m off), while once Roo turns down x 8 the camera looks away from
  // him, so the call starts early enough to end before that turn. The auto route never goes west of x -1.5, runs
  // diagonally (it passes x 1.6 at z -14.3, below the z -13.6 strip) and its bark fires (x 2.4) before x 3.5.
  var BARK_GATES = {
    'street-subway': [{ min: [-1.5, -22], max: [7.5, -15.8] }, { min: [7.5, -21.2], max: [9.4, -15.8] }, { min: [-7, -16], max: [-1.5, -8] },
      { min: [1.6, -13.6], max: [7.5, -8] }, { min: [3.5, -15.8], max: [7.5, -8] }],
    'plaza-walk': [{ min: [56, 4.6], max: [66, 9.5] }]
  };
  var DEFAULTS = { area: 'roof', time: 'day', elevatorDoors: 'open' };
  // elevator door panels (x centres): closed / open (slid into the wall pockets)
  var DOOR_L = [59.25, 57.75], DOOR_R = [60.75, 62.25];
  var VIDEO = 'assets/video/tv-game.mp4';

  JG.scenes.register('city', { build: build });

  function build(kit) {
    var SK = JG.setkit, THREE = kit.THREE, C = SK.colours, L = SK.lighting, rect = SK.rect;
    var root = new THREE.Group();
    root.name = 'set-city';
    var FA = SK.facadeAtlas(kit);
    var B = SK.builder(kit, { atlas: FA }), rng = kit.rng;

    // ------------------------------------------------------------------------------------------- sign atlas
    var cells = [
      SK.signCell('hop', 'HOP ST', { w: 512, h: 128, roundel: 'left' }),
      SK.signCell('street', '56TH & DEBT', { w: 512, h: 96, bg: '#1F4FD8', fg: '#FFF8E7', border: 6 }),
      SK.signCell('hopBlade', 'HOP ST', { w: 512, h: 96, bg: '#1F4FD8', fg: '#FFF8E7', border: 6 }),
      SK.signCell('f500', 'FORTUNE 500', { w: 1024, h: 128, brass: true, bg: '#3a3f4c' }),
      SK.signCell('bb1', "ONE MORE TRIGGER WON'T HURT.", { w: 1024, h: 384, bg: '#FFD21F', sub: '- every org, ever', border: 14 }),
      SK.signCell('bb2', 'NOW HIRING: ADMINS WHO READ THE RELEASE NOTES', { w: 1024, h: 384, bg: '#FFF8E7', sub: 'all three of them', border: 14 }),
      SK.signCell('bb3', 'SANDBOX REFRESH? IN THIS ECONOMY?', { w: 1024, h: 384, bg: '#E0218A', fg: '#FFF8E7', sub: 'Tech debt: the only thing that compounds daily', border: 14 }),
      SK.signCell('bb4', 'SPRING CLEANING: DELETE ONE FIELD TODAY.', { w: 1024, h: 384, bg: '#1F4FD8', fg: '#FFF8E7', sub: 'nobody has used it since 2014', border: 14 }),
      SK.signCell('totem', 'DEPRECATED?', { w: 256, h: 512, bg: '#1F4FD8', fg: '#FFF8E7', sub: 'not on our watch', border: 10 }),
      SK.signCell('exit', 'EXIT', { w: 256, h: 96, bg: '#111', fg: '#FFD21F', border: 4 }),
      // shop signs (original names)
      SK.signCell('s_coffee', 'REFACTORY COFFEE', { w: 512, h: 96, bg: '#2f6b4f', fg: '#FFF8E7', border: 5 }),
      SK.signCell('s_bagel', 'BYTE & BAGEL', { w: 512, h: 96, bg: '#FFF8E7', fg: '#a8322d', border: 5 }),
      SK.signCell('s_cache', 'CACHE & CARRY', { w: 512, h: 96, bg: '#FFD21F', fg: '#111', border: 5 }),
      SK.signCell('s_laundry', 'LEGACY LAUNDROMAT', { w: 512, h: 96, bg: '#25386a', fg: '#FFF8E7', border: 5 }),
      SK.signCell('s_pizza', 'NULL POINTER PIZZA', { w: 512, h: 96, bg: '#a8322d', fg: '#FFD21F', border: 5 }),
      SK.signCell('s_books', 'BACKLOG BOOKS', { w: 512, h: 96, bg: '#1f7d7a', fg: '#FFF8E7', border: 5 }),
      SK.signCell('s_donuts', 'DEPRECATED DONUTS', { w: 512, h: 96, bg: '#E0218A', fg: '#FFF8E7', border: 5 }),
      SK.signCell('s_records', 'ROLLBACK RECORDS', { w: 512, h: 96, bg: '#111', fg: '#FFD21F', border: 5 }),
      SK.signCell('s_bar', 'THE TRIGGER BAR', { w: 512, h: 96, bg: '#6a2c5e', fg: '#FFD21F', border: 5 }),
      SK.signCell('s_tattoo', 'MERGE CONFLICT TATTOO', { w: 512, h: 96, bg: '#1e1e22', fg: '#E0218A', border: 5 }),
      SK.signCell('s_toys', 'SANDBOX TOYS', { w: 512, h: 96, bg: '#FFD21F', fg: '#1F4FD8', border: 5 }),
      SK.signCell('s_burger', 'SCRUM & BURGERS', { w: 512, h: 96, bg: '#c8352e', fg: '#FFF8E7', border: 5 }),
      SK.signCell('s_hardware', 'HOTFIX HARDWARE', { w: 512, h: 96, bg: '#e0a614', fg: '#111', border: 5 }),
      SK.signCell('s_deli', 'STANDUP DELI', { w: 512, h: 96, bg: '#FFF8E7', fg: '#2f6b4f', border: 5 }),
      SK.signCell('s_open', 'OPEN', { w: 256, h: 96, bg: '#E0218A', fg: '#FFF8E7', border: 5 }),
      SK.signCell('news', 'NEWS', { w: 256, h: 96, bg: '#FFD21F', fg: '#111', border: 5 }),
      SK.signCell('dogs', 'DEBUG DOGS', { w: 512, h: 96, bg: '#c8352e', fg: '#FFD21F', border: 5 }),
      SK.signCell('bus', 'BUS  -  ROUTE 56  -  SANDBOX PARK', { w: 512, h: 64, bg: '#1F4FD8', fg: '#FFF8E7', border: 4 }),
      SK.signCell('busAd', 'PAPERLESS? PROVE IT.', { w: 256, h: 384, bg: '#FFF8E7', fg: '#111', sub: 'ask your inbox', border: 10 }),
      SK.signCell('board', 'TODAY: PATCH TUESDAY SPECIAL', { w: 256, h: 256, bg: '#1e2a24', fg: '#FFF8E7', border: 10 })
    ];
    var at = SK.atlas(kit, cells);

    // ------------------------------------------------------------------------------------------- ground
    // the far ground slab (top at y -0.42), cut open over the two subway stairwells (2026-11-26): it used to run
    // straight through both wells, a flat sheet of lit grey 0.4 m down that hid every step (and that Roo sank through).
    // Six pieces around the two openings, each the stairwell's outer wall line (stairs() below).
    var WELLS = [[6.7, -27.3, 9.3, -21], [58.7, -5.8, 61.3, -0.8]], gx = -320;
    WELLS.forEach(function (h) {
      B.box(gx, -0.62, -320, h[0], -0.42, 300, 0x5a5d66, { group: 'far', hull: false, cam: false });
      B.box(h[0], -0.62, -320, h[2], -0.42, h[1], 0x5a5d66, { group: 'far', hull: false, cam: false });
      B.box(h[0], -0.62, h[3], h[2], -0.42, 300, 0x5a5d66, { group: 'far', hull: false, cam: false });
      gx = h[2];
    });
    B.box(gx, -0.62, -320, 420, -0.42, 300, 0x5a5d66, { group: 'far', hull: false, cam: false });
    // pavement blocks: [x0, z0, x1, z1, group, tile cell or null]; tiled blocks sit 2 cm low under their quads
    var PAVE = [
      [-44, -28.5, -21, 34.5, 'gA', 'walk'], [-44, -64.5, -21, -37.5, 'gA', null],
      [-12, -8, 24, 34.5, 'gA', null], [-12, -28.5, 7, -8, 'gA', 'paveA'], [9, -28.5, 24, -8, 'gA', 'paveA'],
      [7, -21, 9, -8, 'gA', 'paveA'], [7, -28.5, 9, -27.3, 'gA', 'paveA'],
      [-12, -42.5, 24, -37.5, 'gA', 'walk'], [-12, -64.5, 24, -42.5, 'gA', null],
      [33, -0.8, 50, 34.5, 'gB', null], [50, -0.8, 70, 10, 'gB', 'paveB'], [70, -0.8, 87, 34.5, 'gB', null], [50, 10, 70, 34.5, 'gB', null],
      [33, -28.5, 59, -0.8, 'gB', 'walk'], [61, -28.5, 87, -0.8, 'gB', 'walk'], [59, -28.5, 61, -5.8, 'gB', 'walk'],
      [33, -64.5, 87, -37.5, 'gB', null]
    ];
    PAVE.forEach(function (p) {
      B.box(p[0], -0.4, p[1], p[2], p[5] ? -0.02 : 0, p[3], C.pavement, { group: p[4], hull: !p[5] });
      if (p[5]) tile(p[0], p[1], p[2], p[3], p[5], p[4]);
    });
    // the stairs-A top landing (pavement colour, flush) sits in the paved strip's gap
    function tile(x0, z0, x1, z1, cell, group) {
      var r = FA.rect(cell), S = 3;
      for (var x = x0; x < x1 - 1e-3; x += S) for (var z = z0; z < z1 - 1e-3; z += S) {
        var w = Math.min(S, x1 - x), d = Math.min(S, z1 - z);
        B.tquad([x, 0, z + d], new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), w, d,
          [r[0], r[1] + (r[3] - r[1]) * (1 - d / S), r[0] + (r[2] - r[0]) * (w / S), r[3]], { group: group });
      }
    }
    // roads: R1 along X at z -33; R2, R3 along Z at x -16.5 and 28.5; crossroads where they meet
    var RX = [-16.5, 28.5], RZ = -33;
    for (var x = -34.5; x <= 82.6; x += 9) {
      var cross = RX.indexOf(x) >= 0;
      B.piece(cross ? 'road_crossroad' : (x === -7.5 || x === 37.5 || x === 64.5 ? 'road_crossing' : 'road_straight'), { x: x, z: RZ, y: -0.18, raw: true, hull: false, group: x > 33 ? 'gB' : 'gA' });
    }
    RX.forEach(function (rx) {
      for (var z = -60; z <= 30.1; z += 9) {
        if (z === RZ) continue;
        B.piece(z === -24 ? 'road_crossing' : 'road_straight', { x: rx, z: z, y: -0.18, rot: 90, raw: true, hull: false, group: rx > 0 ? 'gB' : 'gA' });
      }
    });
    // manholes (Downtown) on the roads
    [[-3, -32.2], [16, -34.3], [28.5, -15], [45, -32.6], [66, -34], [-16.5, -8]].forEach(function (p) { B.piece('dt_manhole', { x: p[0], z: p[1], y: 0.0, raw: true, hull: false, group: p[0] > 33 ? 'gB' : 'gA', cam: false }); });

    // ------------------------------------------------------------------------------------------- roof building
    roofBuilding(B, C, at);
    roofProps(B, C);
    var tvParts = gamingCorner(B, C, FA);

    // ------------------------------------------------------------------------------------------- streetA
    stairs(B, C, at, { x0: 7, x1: 9, zTop: -21.5, zBottom: -26, zEnd: -27, dir: -1, group: 'fA' });
    plazaFurniture(B, C, at, FA);
    // buildings: east of the plaza (fronts face -Z onto it), north of the roof, south across R1, west across R2
    var bld = function (o) { return B.building(o); };
    var E1 = bld({ x0: 8.7, z0: -9.4, x1: 15.5, z1: 5, floors: 4, style: 'cream', ground: 'shop', shop: 1, front: 's', group: 'bE', seed: 11 });
    var E2 = bld({ x0: 16.0, z0: -9.4, x1: 22.6, z1: 7, floors: 7, style: 'ochre', ground: 'shop', shop: { s: 4, e: 2 }, front: 'se', group: 'bE', seed: 12 });
    shopSign(B, at, 's_bagel', 's', 12.1, -9.4, 5.2);
    shopSign(B, at, 's_cache', 's', 19.3, -9.4, 5.2);
    shopSign(B, at, 's_deli', 'e', 22.6, -1, 5.6);
    awning(B, FA, 's', 9.2, 15.0, -9.4, 0, { group: 'bE' });
    awning(B, FA, 's', 16.5, 22.1, -9.4, 1, { group: 'bE' });
    B.piece('kk_watertower', { x: 12.6, z: 0.5, y: E1.top, hull: false, group: 'bE' });
    B.piece('dt_acunit', { x: 18, z: 3, y: E2.top, rot: 0, group: 'bE', hull: false });
    B.piece('dt_acunit', { x: 20, z: 3, y: E2.top, rot: 0, group: 'bE', hull: false });
    bld({ x0: -6, z0: 11, x1: 6, z1: 23, floors: 12, style: 'glass', ground: 'shop', shop: 3, front: 's', group: 'bN', seed: 21, setback: { inset: 2, floors: 3 } });
    var N2 = bld({ x0: 8.7, z0: 8, x1: 22.6, z1: 20, floors: 6, style: 'brickFire', ground: 'plain', group: 'bN', seed: 22 });
    var N3 = bld({ x0: -12, z0: 8.6, x1: -6.6, z1: 20, floors: 3, style: 'teal', ground: 'shop', shop: 5, front: 'w', group: 'bN', seed: 23 });
    bld({ x0: -12, z0: 24, x1: -0.5, z1: 34, floors: 8, style: 'slate', ground: 'plain', group: 'bN', seed: 24, hull: false });
    bld({ x0: 0, z0: 24, x1: 22.6, z1: 34, floors: 10, style: 'blue', ground: 'plain', group: 'bN', seed: 25, hull: false, setback: { inset: 3, floors: 2 } });
    B.piece('kk_watertower', { x: 18.5, z: 14, y: N2.top, hull: false, group: 'bN' });
    B.piece('kk_watertower', { x: -9.3, z: 14.5, y: N3.top, hull: false, group: 'bN' });
    billboard(B, C, at, 'bb4', 15.6, N2.top, 9.0, 8.4, 3.15, PI, { group: 'bN', hull: false, sg: 'signsCity' });
    // south row across R1 (fronts face +Z at z -42, towards the plaza)
    var S = [
      { x0: -12, x1: -4.6, floors: 5, style: 'brick', shop: 0, sign: 's_laundry', awn: 2 },
      { x0: -4.3, x1: 3.6, floors: 8, style: 'cream', shop: 1, sign: 's_pizza', awn: 0, setback: { inset: 1.6, floors: 2 } },
      { x0: 3.9, x1: 11.2, floors: 3, style: 'teal', shop: 4, sign: 's_books', awn: 1 },
      { x0: 11.5, x1: 18.1, floors: 6, style: 'slate', shop: 5, sign: 's_donuts', awn: 3 },
      { x0: 18.4, x1: 24, floors: 9, style: 'ochre', shop: 3, sign: 's_records', setback: { inset: 1.5, floors: 2 } }
    ].map(function (s, i) {
      var r = bld({ x0: s.x0, z0: -54, x1: s.x1, z1: -42, floors: s.floors, style: s.style, ground: 'shop', shop: s.shop, front: 'n', group: 'bS', seed: 30 + i, setback: s.setback });
      shopSign(B, at, s.sign, 'n', (s.x0 + s.x1) / 2, -42, 5.2);
      if (s.awn !== undefined) awning(B, FA, 'n', s.x0 + 0.5, s.x1 - 0.5, -42, s.awn, { group: 'bS' });
      return r;
    });
    billboard(B, C, at, 'bb1', 7.55, S[2].top, -47.5, 7.0, 2.6, 0, { hull: false, group: 'bS', sg: 'signsCity' });
    billboard(B, C, at, 'bb3', -8.3, S[0].top, -47.5, 7.2, 2.7, 0, { hull: false, group: 'bS', sg: 'signsCity' });
    B.piece('kk_watertower', { x: 14.8, z: -49, y: S[3].top, hull: false, group: 'bS' });
    B.piece('dt_acunit', { x: 21, z: -48, y: S[4].top, group: 'bS', hull: false });
    // block W across R2 (fronts face +X at x -24)
    [
      { z0: -28, z1: -17, floors: 6, style: 'ochre', shop: 2, sign: 's_bar', awn: 4 },
      { z0: -16.6, z1: -6.5, floors: 4, style: 'brick', shop: 0, sign: 's_tattoo' },
      { z0: -6.1, z1: 6, floors: 9, style: 'slate' },
      { z0: 6.4, z1: 20, floors: 5, style: 'cream' },
      { z0: 20.4, z1: 34, floors: 7, style: 'blue' },
      { z0: -60, z1: -42, floors: 7, style: 'teal' }
    ].forEach(function (s, i) {
      bld({ x0: -36, z0: s.z0, x1: -24, z1: s.z1, floors: s.floors, style: s.style, ground: s.sign ? 'shop' : 'plain', shop: s.shop, front: 'e', group: 'bW', seed: 40 + i, hull: i < 4 });
      if (s.sign) shopSign(B, at, s.sign, 'e', -24, (s.z0 + s.z1) / 2, 5.2);
      if (s.awn !== undefined) awning(B, FA, 'e', s.z0 + 0.5, s.z1 - 0.5, -24, s.awn, { group: 'bW' });
    });

    // ------------------------------------------------------------------------------------------- streetB
    // the arch's posts stand 4.5 m either side of the stairs' centre and 0.6 m behind the walk rect's edge (z -0.5),
    // so the follow camera that climbs out behind Roo is well clear of them
    stairs(B, C, at, { x0: 59, x1: 61, zTop: -0.8, zBottom: -4.5, zEnd: -5.5, dir: 1, group: 'fB', archY: 3.45, archOut: 3.5, archZ: -1.1 });
    fortune500(B, C, at);
    var BW2 = bld({ x0: 37, z0: -10, x1: 50, z1: 9, floors: 5, style: 'brick', ground: 'shop', shop: { e: 1, w: 2 }, front: 'ew', group: 'bB', seed: 51 });
    shopSign(B, at, 's_toys', 'e', 50, -4.6, 5.2); shopSign(B, at, 's_hardware', 'e', 50, 4.6, 5.2);
    awning(B, FA, 'e', -9.5, -0.2, 50, 3, { group: 'bB' }); awning(B, FA, 'e', 0.2, 8.5, 50, 4, { group: 'bB' });
    billboard(B, C, at, 'bb2', 45.5, BW2.top, -0.5, 8, 3, PI / 2, { group: 'bB', sg: 'signsCity' });
    var BE1 = bld({ x0: 70, z0: -10, x1: 84, z1: 9, floors: 6, style: 'teal', ground: 'shop', shop: { w: 4 }, front: 'w', group: 'bB', seed: 52 });
    shopSign(B, at, 's_burger', 'w', 70, -4.6, 5.2); shopSign(B, at, 's_open', 'w', 70, 4.6, 5.2, 2.2);
    awning(B, FA, 'w', -9.5, 0, 70, 0, { group: 'bB' });
    B.piece('kk_watertower', { x: 78, z: 2, y: BE1.top, hull: false, group: 'bB' });
    bld({ x0: 36, z0: -26, x1: 49.5, z1: -12, floors: 10, style: 'glass', ground: 'shop', shop: 3, front: 'e', group: 'bB', seed: 53, setback: { inset: 2, floors: 3 } });
    bld({ x0: 70, z0: -26, x1: 84, z1: -12, floors: 8, style: 'cream', ground: 'plain', group: 'bB', seed: 54 });
    bld({ x0: 36, z0: 12, x1: 49.5, z1: 30, floors: 8, style: 'slate', ground: 'plain', group: 'bB', seed: 55, hull: false });
    bld({ x0: 70.5, z0: 12, x1: 84, z1: 30, floors: 11, style: 'ochre', ground: 'plain', group: 'bB', seed: 56, hull: false, setback: { inset: 2, floors: 2 } });
    // the south row across R1 for streetB's look back
    [[33, 44.6, 6, 'brick', 2], [45, 55.6, 4, 'cream', 3], [56, 67.6, 9, 'blue', 0], [68, 79.6, 5, 'teal', 5], [80, 87, 7, 'slate', 1]].forEach(function (s, i) {
      bld({ x0: s[0], z0: -54, x1: s[1], z1: -42, floors: s[2], style: s[3], ground: 'shop', shop: s[4], front: 'n', group: 'bB', seed: 60 + i, hull: false });
    });
    streetBFurniture(B, C, at);

    // ------------------------------------------------------------------------------------------- distant skyline
    skyline(B, FA, rng);

    var meshes = B.build(root);
    // per-area visibility: the street furniture and signs of one plaza are never in a shot of the other
    function showArea(area) {
      var b = area === 'streetB';
      ['fA', 'signs'].forEach(function (k) { if (meshes[k]) meshes[k].visible = !b; });
      ['fB', 'signsB'].forEach(function (k) { if (meshes[k]) meshes[k].visible = b; });
      if (doorL) { doorL.visible = b; doorR.visible = b; }
    }
    // the sky dome follows the camera
    var dome = SK.skyDome(kit, { horizon: '#cfe1ee' });
    root.add(dome);

    // ------------------------------------------------------------------------------------------- dynamic: lift doors
    var doorMat = kit.mat.toon({ color: C.brass }), ink = kit.mat.ink();
    function doorPanel(xc) {
      var g = new THREE.BoxGeometry(1.5, 2.6, 0.06);
      var m = new THREE.Mesh(g, doorMat);
      m.position.set(xc, 1.3, 13.05);
      var hg = new THREE.BoxGeometry(1.5 + 2 * SK.T, 2.6 + 2 * SK.T, 0.06 + 2 * SK.T);
      var h = new THREE.Mesh(hg, ink); h.userData.jgHull = true; m.add(h);
      var p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), kit.mat.toon({ color: C.brassDark }));
      p.position.set(0, 0.05, -0.031); p.rotation.y = PI; m.add(p);
      root.add(m);
      return m;
    }
    var doorL = doorPanel(DOOR_L[0]), doorR = doorPanel(DOOR_R[0]);

    // ------------------------------------------------------------------------------------------- dynamic: the TV
    var tv = makeTV(kit, root, tvParts);

    var state = Object.assign({}, DEFAULTS);
    var inst = {
      root: root,
      lighting: L.cityRoof,
      areas: { roof: { lighting: L.cityRoof, origin: [0, 20, 0] }, streetA: { lighting: L.cityA, origin: [0, 0, -18] }, streetB: { lighting: L.cityB, origin: [60, 0, 6] } },
      markers: MARKERS, zones: ZONES, paths: PATHS,
      walk: {
        'rooftop-walk': [rect(-6.2, -7.5, 6.2, 3.4), rect(-7.4, -7.5, 7.4, -4.4), rect(-1.2, 3.4, 3.2, 7.4)],
        // x > 8.75: kept clear of the building front (z > -10.73) and the cafe tables with Roo's ~0.3 m body
        'street-subway': [rect(-10, -21, 8.75, -10), rect(8.75, -21, 12.0, -11.05), rect(-10, -27, 6.6, -21), rect(9.4, -27, 12.0, -21)],
        // z <= 8.05 in front of the podium planters (z 8.5..9.9) with Roo's ~0.3 m body
        'plaza-walk': [rect(54, -0.5, 66, 8.05), rect(56.3, 8.05, 63.7, 13)]
      },
      crowd: CROWD, crowdSpots: CROWD_SPOTS, barkGates: BARK_GATES,
      camPresets: CAM,
      camColliders: B.colliders(),   // the follow camera's colliders: every box and piece, gated by its group's visibility
      props: { tv: tv.api },
      surfaceAt: function () { return 'hard'; },
      setState: function (patch, sec) {
        sec = sec || 0;
        Object.assign(state, patch);
        if (patch.elevatorDoors) {
          var open = patch.elevatorDoors === 'open';
          SK.tweenTo(doorL.position, { x: open ? DOOR_L[1] : DOOR_L[0] }, sec);
          SK.tweenTo(doorR.position, { x: open ? DOOR_R[1] : DOOR_R[0] }, sec);
        }
        if (patch.area && inst.areas[patch.area]) { inst.lighting = inst.areas[patch.area].lighting; showArea(patch.area); tv.api.on(true); }
        return { duration: sec };
      },
      update: function (dt, t, o) {
        var cam = (o && o.camera) || (JG.camera && JG.camera.object);
        if (cam) dome.position.copy(cam.position);
        tv.update(t, state.area === 'roof');
      },
      debug: { meshes: meshes, state: function () { return Object.assign({}, state); }, tv: tv }
    };
    inst.setState(Object.assign({}, DEFAULTS), 0);
    if (JG.on) JG.on('scene', function (id) { if (id !== 'city') tv.pause(); });
    return inst;
  }

  // --------------------------------------------------------------------------------------------- local-frame helpers
  /** lbox(B, M, x0, y0, z0, x1, y1, z1, color, o): a box in the frame M (a Matrix4) */
  function lbox(B, M, x0, y0, z0, x1, y1, z1, color, o) {
    var THREE = B.THREE, g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    B.geo(g, M.clone().multiply(new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), color, o);
  }
  function frame(B, x, y, z, yaw) { var T = B.THREE; return new T.Matrix4().makeTranslation(x, y, z).multiply(new T.Matrix4().makeRotationY(yaw || 0)); }
  /** a face's outward normal and the in-plane axis for a sign or an awning */
  var FACE = { n: [0, 1, 0], s: [0, -1, PI], e: [1, 0, PI / 2], w: [-1, 0, -PI / 2] };   // [nx, nz, yaw facing out]

  /* shopSign(B, at, cell, face, x, z, y, w?): a sign board on the facade facing `face`, centred at (x, z) on the wall
   * line, lit (unlit atlas) and stood 0.07 m off the wall on a black backing a little larger than the board */
  function shopSign(B, at, cell, face, px, pz, y, w) {
    var f = FACE[face];
    var x = px + f[0] * 0.07, z = pz + f[1] * 0.07;
    w = w || 4.4;
    var h = w * (96 / 512) * (cell === 's_open' ? 2 : 1);
    var M = frame(B, x, y, z, f[2]);
    lbox(B, M, -w / 2 - 0.07, -h / 2 - 0.07, -0.07, w / 2 + 0.07, h / 2 + 0.07, 0.02, 0x111111, { group: 'landmark', hull: false, cam: false });
    B.quad(at, cell, [x + f[0] * 0.025, y, z + f[1] * 0.025], w, h, f[2], { group: 'signsCity' });
  }
  /* awning(B, FA, face, a, b, line, v, o): a striped awning from u = a..b along a facade line, 1.4 m deep, sloping
   * down from 4.1 m to 3.3 m, with a valance */
  function awning(B, FA, face, a, b, line, v, o) {
    var THREE = B.THREE, f = FACE[face], ns = face === 'n' || face === 's', w = b - a, mid = (a + b) / 2;
    var x = ns ? mid : line, z = ns ? line : mid;
    var M = frame(B, x, 0, z, f[2]);   // local +Z points out of the wall
    var r = FA.rect('awn:' + v), slope = Math.atan2(0.8, 1.4);
    var top = new THREE.BoxGeometry(w, 0.05, 1.62);
    B.geo(top, M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 3.7, 0.7)).multiply(new THREE.Matrix4().makeRotationX(slope)),
      0xffffff, { group: o.group, uvRect: [r[0], r[1] + (r[3] - r[1]) * 0.25, r[2], r[3]] });
    var val = new THREE.BoxGeometry(w, 0.3, 0.03);
    B.geo(val, M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 3.15, 1.4)), 0xffffff, { group: o.group, uvRect: [r[0], r[1], r[2], r[1] + (r[3] - r[1]) * 0.3] });
  }
  /** billboard on a roof: posts, a frame and the board facing yaw (default 0: faces +Z) */
  function billboard(B, C, at, cell, x, y, z, w, h, yaw, o) {
    o = o || {};
    yaw = yaw || 0;
    var THREE = B.THREE, M = frame(B, x, y, z, yaw);
    [-w * 0.32, w * 0.32].forEach(function (u) { lbox(B, M, u - 0.1, 0, -0.5, u + 0.1, 1.4, -0.3, C.metalDark, o); });
    lbox(B, M, -w / 2 - 0.12, 1.3, -0.3, w / 2 + 0.12, 1.42 + h + 0.12, -0.12, C.metalDark, o);
    var c = new THREE.Vector3(0, 1.36 + h / 2 + 0.06, -0.11).applyMatrix4(M);
    B.quad(at, cell, [c.x, c.y, c.z], w, h, yaw, { group: o.sg || (o.group === 'bB' ? 'signsB' : 'signs') });
  }

  // --------------------------------------------------------------------------------------------- small props
  function tree(B, x, z, s, o) {
    var THREE = B.THREE, g = o && o.group || 'fA';
    s = s || 1;
    B.geo(B.kit.geo.cyl(0.11 * s, 0.15 * s, 2.3 * s, 6), new THREE.Matrix4().makeTranslation(x, 0, z), 0x6b4a32, { group: g, hull: 'grow' });
    [[0, 2.7, 0, 1.25, 0x3f8f4f], [0.55, 3.2, 0.3, 0.9, 0x4fa35a], [-0.5, 3.1, -0.35, 0.85, 0x377d45], [0.1, 3.6, -0.2, 0.7, 0x5bb066]].forEach(function (b, i) {
      var ico = new THREE.IcosahedronGeometry(b[3] * s, 0);
      B.geo(ico, new THREE.Matrix4().makeTranslation(x + b[0] * s, b[1] * s, z + b[2] * s).multiply(new THREE.Matrix4().makeRotationY(i * 0.9)), b[4], { group: g, hull: 'grow' });
    });
    if (!o || o.grate !== false) B.box(x - 0.6, -0.01, z - 0.6, x + 0.6, 0.015, z + 0.6, 0x4a4d55, { group: g, hull: false, cam: false });
  }
  function bush(B, x, y, z, r, o) {
    var THREE = B.THREE;
    [[0, 0, 0, 1], [0.45, -0.1, 0.2, 0.7], [-0.4, -0.1, -0.2, 0.75]].forEach(function (b, i) {
      B.geo(new THREE.IcosahedronGeometry(r * b[3], 0), new THREE.Matrix4().makeTranslation(x + b[0] * r, y + r * 0.6 + b[1] * r, z + b[2] * r).multiply(new THREE.Matrix4().makeRotationY(i)), [0x3f8f4f, 0x4fa35a, 0x377d45][i], Object.assign({ hull: 'grow' }, o));
    });
  }
  function planterBush(B, x, z, s, o) {
    B.piece('dt_planter', Object.assign({ x: x, z: z, scale: s }, o));
    bush(B, x, 0.55 * s, z, 0.55 * s, o);
  }
  function bollard(B, x, z, o) {
    var THREE = B.THREE;
    B.geo(B.kit.geo.cyl(0.1, 0.11, 0.85, 8), new THREE.Matrix4().makeTranslation(x, 0, z), 0x2b3550, o);
    B.geo(B.kit.geo.cyl(0.115, 0.115, 0.06, 8), new THREE.Matrix4().makeTranslation(x, 0.62, z), 0xFFD21F, Object.assign({ hull: false }, o));
  }
  function bin(B, x, z, o) {
    var THREE = B.THREE;
    B.geo(B.kit.geo.cyl(0.27, 0.24, 0.85, 8), new THREE.Matrix4().makeTranslation(x, 0, z), 0x2f5f4a, Object.assign({ hull: 'grow' }, o));
    B.geo(B.kit.geo.cyl(0.3, 0.3, 0.07, 8), new THREE.Matrix4().makeTranslation(x, 0.85, z), 0x24493a, Object.assign({ hull: 'grow' }, o));
  }
  function cafeTable(B, x, z, o) {
    var THREE = B.THREE;
    B.geo(B.kit.geo.cyl(0.04, 0.04, 0.72, 6), new THREE.Matrix4().makeTranslation(x, 0, z), 0x333333, o);
    B.geo(B.kit.geo.cyl(0.34, 0.34, 0.04, 10), new THREE.Matrix4().makeTranslation(x, 0.72, z), 0xf3ead6, o);
    [-1, 1].forEach(function (s) {
      var M = frame(B, x + s * 0.55, 0, z, s * PI / 2);
      lbox(B, M, -0.2, 0.42, -0.2, 0.2, 0.46, 0.2, 0xc8352e, o);
      lbox(B, M, -0.2, 0.46, -0.22, 0.2, 0.86, -0.18, 0xc8352e, o);
      lbox(B, M, -0.18, 0, -0.18, -0.15, 0.42, -0.15, 0x333333, Object.assign({ hull: false }, o));
      lbox(B, M, 0.15, 0, 0.15, 0.18, 0.42, 0.18, 0x333333, Object.assign({ hull: false }, o));
    });
  }
  /* busStop: shelter 3.4 x 1.4, open towards local +Z, an ad panel at one end and a bench */
  function busStop(B, at, x, z, yaw, o) {
    var M = frame(B, x, 0, z, yaw), POST = 0x2b3550, GL = 0xa9c3d8;
    [[-1.65, -0.65], [1.65, -0.65], [-1.65, 0.65], [1.65, 0.65]].forEach(function (p) { lbox(B, M, p[0] - 0.05, 0, p[1] - 0.05, p[0] + 0.05, 2.45, p[1] + 0.05, POST, o); });
    lbox(B, M, -1.8, 2.45, -0.8, 1.8, 2.55, 0.85, 0x1F4FD8, o);
    lbox(B, M, -1.6, 0.25, -0.68, 1.6, 2.3, -0.62, GL, o);
    lbox(B, M, 1.6, 0.25, -0.6, 1.66, 2.3, 0.55, GL, o);
    lbox(B, M, -1.2, 0.42, -0.6, 1.0, 0.48, -0.25, 0xb8834e, o);
    lbox(B, M, -1.66, 0.2, -0.62, -1.6, 2.3, 0.6, 0x111111, o);   // ad case
    var T = B.THREE, c = new T.Vector3(-1.59, 1.25, 0).applyMatrix4(M), c2 = new T.Vector3(-1.67, 1.25, 0).applyMatrix4(M);
    B.quad(at, 'busAd', [c.x, c.y, c.z], 1.1, 1.65, yaw + PI / 2, { group: o.group === 'fB' ? 'signsB' : 'signs' });
    B.quad(at, 'busAd', [c2.x, c2.y, c2.z], 1.1, 1.65, yaw - PI / 2, { group: o.group === 'fB' ? 'signsB' : 'signs' });
    var s = new T.Vector3(0, 2.5, 0.86).applyMatrix4(M);
    B.quad(at, 'bus', [s.x, s.y, s.z], 3.2, 0.4, yaw, { group: o.group === 'fB' ? 'signsB' : 'signs' });
  }
  /* newsstand: a green kiosk 1.6 x 2.2, its counter and magazine rack facing local +Z */
  function newsstand(B, at, FA, x, z, yaw, o) {
    var THREE = B.THREE, M = frame(B, x, 0, z, yaw);
    lbox(B, M, -1.1, 0, -0.8, 1.1, 2.3, 0.6, 0x2f6b4f, o);
    lbox(B, M, -1.25, 2.3, -0.95, 1.25, 2.45, 0.95, 0xFFD21F, o);
    lbox(B, M, -1.0, 0.85, 0.6, 1.0, 0.95, 0.85, 0xb8834e, o);
    var r = FA.rect('mags'), org = new THREE.Vector3(-1.0, 1.0, 0.605).applyMatrix4(M);
    var U = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw), V = new THREE.Vector3(0, 1, 0);
    B.tquad(org.toArray(), U, V, 2.0, 1.0, r, { group: o.group });
    var s = new THREE.Vector3(0, 2.0, 0.62).applyMatrix4(M);
    B.quad(at, 'news', [s.x, s.y, s.z], 1.1, 0.4, yaw, { group: o.group === 'fB' ? 'signsB' : 'signs' });
  }
  function foodCart(B, at, x, z, yaw, o) {
    var THREE = B.THREE, M = frame(B, x, 0, z, yaw);
    lbox(B, M, -0.8, 0.35, -0.4, 0.8, 1.0, 0.4, 0xd0d4da, o);
    lbox(B, M, -0.85, 1.0, -0.45, 0.85, 1.06, 0.45, 0x8a9099, o);
    [-0.55, 0.55].forEach(function (u) { B.geo(B.kit.geo.cyl(0.28, 0.28, 0.08, 10), M.clone().multiply(new THREE.Matrix4().makeTranslation(u, 0.28, 0.42)).multiply(new THREE.Matrix4().makeRotationX(PI / 2)), 0x222222, o); });
    var p = new THREE.Vector3(0, 0, 0).applyMatrix4(M);
    B.piece('detail_parasol_a', Object.assign({ x: p.x, z: p.z, scale: 0.6, rot: 0 }, o));
    var s = new THREE.Vector3(0, 0.7, 0.41).applyMatrix4(M);
    B.quad(at, 'dogs', [s.x, s.y, s.z], 1.4, 0.26, yaw, { group: o.group === 'fB' ? 'signsB' : 'signs' });
  }

  // --------------------------------------------------------------------------------------------- streetA furniture
  function plazaFurniture(B, C, at, FA) {
    var o = { group: 'fA' };
    // the plaza's south kerb
    [-6, 4, 15, 21].forEach(function (x) { B.piece('kk_streetlight', { x: x, z: -28.25, rot: -90, group: 'fA', hull: false }); });
    B.piece('kk_trafficlight_a', { x: -11.4, z: -28.2, rot: -90, group: 'fA', hull: false });
    B.piece('kk_trafficlight_a', { x: 23.4, z: -28.2, rot: -90, group: 'fA', hull: false });
    B.piece('kk_firehydrant', { x: 2.5, z: -28.3, group: 'fA' });
    streetSign(B, C, at, -11.2, -27.6, o);
    // west strip (x -12..-10)
    B.piece('kk_bench', { x: -11.35, z: -16, rot: -90, group: 'fA' });
    planterBush(B, -11.2, -24.5, 0.75, o); planterBush(B, -11.2, -20.5, 0.75, o);
    tree(B, -11.1, -12.4, 1, o); bin(B, -11.4, -26.6, o);
    B.piece('kk_dumpster', { cx: -10.4, cz: 2.5, rot: 90, group: 'fA' });
    // east zone (x 12..24): trees, benches, newsstand, food cart, bus stop on R3, bollards, cafe tables
    B.piece('kk_bench', { x: 13.6, z: -14, rot: 90, group: 'fA' });
    B.piece('kk_bench', { x: 13.6, z: -18.5, rot: 90, group: 'fA' });
    [-11.3, -16.25, -21.0, -25.4].forEach(function (z) { tree(B, 13.35, z, 0.95, o); });
    newsstand(B, at, FA, 18, -23.9, -PI / 2, o);
    foodCart(B, at, 18, -14.6, -PI / 2, o);
    busStop(B, at, 23.3, -18.5, PI / 2, o);
    [-12, -13.5, -24, -25.5].forEach(function (z) { bollard(B, 23.7, z, o); });
    cafeTable(B, 9.7, -10.3, o); cafeTable(B, 11.3, -10.3, o);
    bin(B, 12.5, -9.95, o);
    planterBush(B, 22.0, -10.1, 0.5, o);
    totem(B, C, at, 12.9, -10.8, PI);
    // across R1: the shops' sidewalk (z -42..-37.5)
    [-9, -0.5, 13.5, 21.5].forEach(function (x) { tree(B, x, -38.3, 1, o); });
    [-4.5, 3.0, 17.5].forEach(function (x) { B.piece('kk_streetlight', { x: x, z: -37.85, rot: 90, group: 'fA', hull: false }); });
    busStop(B, at, 8.8, -38.6, 0, o);
    B.piece('kk_firehydrant', { x: 1, z: -37.9, group: 'fA' });
    bin(B, 5.6, -38.0, o);
    [[-6.6, 0xc8352e], [-6.0, 0x1F4FD8], [-5.4, 0xFFD21F]].forEach(function (n) { B.box(n[0] - 0.24, 0, -38.25, n[0] + 0.24, 1.05, -37.85, n[1], o); });   // newspaper boxes
    // sandwich board by the pizza place
    var M = frame(B, -1.2, 0, -41.72, 0.3);   // against the shopfront, clear of the far walkers' lane
    lbox(B, M, -0.32, 0, -0.18, 0.32, 0.95, -0.12, 0x1e2a24, o);
    var c = new B.THREE.Vector3(0, 0.55, -0.11).applyMatrix4(M);
    B.quad(at, 'board', [c.x, c.y, c.z], 0.56, 0.56, 0.3, { group: 'signs' });
    // block W sidewalk (x -24..-21)
    [-20, -2, 14].forEach(function (z) { tree(B, -23.5, z, 1, { group: 'fA', grate: false }); });
    [-12, 6].forEach(function (z) { B.piece('kk_streetlight', { x: -21.15, z: z, rot: 180, group: 'fA', hull: false }); });   // at the kerb: the walkers' lane is x -22.1
    // parked taxis
    B.piece('kk_car_taxi', { x: 2, z: -34.8, rot: 90, group: 'gA', hull: false });
    B.piece('kk_car_taxi', { x: 30.6, z: -14, rot: 0, group: 'gB', hull: false });
  }

  // --------------------------------------------------------------------------------------------- streetB furniture
  function streetBFurniture(B, C, at) {
    var o = { group: 'fB' };
    [-7, -1.2, 5.6].forEach(function (z) { tree(B, 51.0, z, 1, o); tree(B, 69.0, z, 1, o); });
    [-4.1, 2.2].forEach(function (z) { B.piece('kk_bench', { x: 51.2, z: z, rot: -90, group: 'fB' }); B.piece('kk_bench', { x: 68.8, z: z, rot: 90, group: 'fB' }); });
    [-3, 6].forEach(function (z) { B.piece('kk_streetlight', { x: 53.7, z: z, rot: 180, group: 'fB', hull: false }); B.piece('kk_streetlight', { x: 66.3, z: z, rot: 0, group: 'fB', hull: false }); });
    B.piece('kk_firehydrant', { x: 69.7, z: -2.9, group: 'fB' });   // by the shopfront, off the east sidewalk's lanes
    planterBush(B, 55.2, 9.2, 0.7, o); planterBush(B, 64.8, 9.2, 0.7, o);
    foodCart(B, at, 67.6, -15.6, -PI / 2, o);   // on the open pavement south of the cross street (bWait queues at it)
    streetSign(B, C, at, 53.8, -2.6, o);
    // the open pavement south of the exit
    [[52, -14], [58, -16.5], [64, -14], [68, -20.5], [54, -22]].forEach(function (p) { tree(B, p[0], p[1], 1.05, o); });
    B.piece('kk_bench', { x: 61, z: -14, rot: 0, group: 'fB' });
    B.piece('kk_bench', { x: 56, z: -20, rot: 180, group: 'fB' });
    bin(B, 62.6, -14.2, o);
    busStop(B, at, 48, -27.6, PI, o);
    [[55, -28.2], [65, -28.2]].forEach(function (p) { B.piece('kk_streetlight', { x: p[0], z: p[1], rot: -90, group: 'fB', hull: false }); });
    B.piece('kk_trafficlight_a', Object.assign({ x: 33.6, z: -27.9, rot: -90, hull: false }, o));
    B.piece('kk_car_taxi', Object.assign({ x: 50, z: -31.2, rot: -90, hull: false }, o));
      }

  // --------------------------------------------------------------------------------------------- pieces of the city
  function roofBuilding(B, C, at) {
    var g = { group: 'roof' };
    // facade shell (brick, the REFACTORY COFFEE shopfront on the plaza side), cornice, string course
    B.building({ x0: -8, z0: -8, x1: 8, z1: 8, floors: 5, floorH: 3.06, style: 'brick', ground: 'shop', shop: 0, front: 's', group: 'roof', seed: 1, parapet: 0, roof: 'none' });
    B.box(-8.3, 19.4, -8.3, 8.3, 19.8, 8.3, C.trim, g);       // cornice
    // roof deck and parapet (coping on top, flush with the jump-off at 20.6)
    B.box(-7.75, 19.8, -7.75, 7.75, 19.98, 7.75, C.roofDeck, g);
    // roof deck pavers: atlas slabs, tinted warm grey, 2 cm over the deck box
    var THREE = B.THREE, pr = B.atlas.rect('paveA'), X = new THREE.Vector3(1, 0, 0), mZ = new THREE.Vector3(0, 0, -1);
    for (var px = -7.75; px < 7.749; px += 3.1) for (var pz = -7.75; pz < 7.749; pz += 3.1) B.tquad([px, 20, pz + 3.1], X, mZ, 3.1, 3.1, pr, { group: 'roof', color: 0xb3a796 });
    B.box(-8.15, 19.8, -8.15, 8.15, 20.56, -7.75, C.parapet, g); B.box(-8.15, 19.8, 7.75, 8.15, 20.56, 8.15, C.parapet, g);
    B.box(-8.15, 19.8, -7.75, -7.75, 20.56, 7.75, C.parapet, g); B.box(7.75, 19.8, -7.75, 8.15, 20.56, 7.75, C.parapet, g);
    B.box(-8.2, 20.56, -8.2, 8.2, 20.6, -7.7, C.trim, g); B.box(-8.2, 20.56, 7.7, 8.2, 20.6, 8.2, C.trim, g);
    B.box(-8.2, 20.56, -7.7, -7.7, 20.6, 7.7, C.trim, g); B.box(7.7, 20.56, -7.7, 8.2, 20.6, 7.7, C.trim, g);
    // the coffee shop: sign, awning, the Downtown door frame at its door
    shopSign(B, at, 's_coffee', 's', 3.2, -8, 5.2, 4.6);
    awning(B, B.atlas, 's', 1.6, 7.6, -8, 2, g);
    awning(B, B.atlas, 's', -7.6, -2.4, -8, 2, g);
    B.piece('dt_doorframe_wooden', { x: 3.2, z: -8.04, rot: 180, group: 'roof', hull: false });   // frames the shop cell's door bay (x 1.6..4.8)
  }

  function roofProps(B, C) {
    var THREE = B.THREE, g = { group: 'roof' };
    // stair hut with a door facing -Z, the KayKit water tower on its roof
    B.box(3.4, 20, 4.6, 6.6, 22.8, 7.6, C.brickDark, g);
    B.box(3.2, 22.8, 4.4, 6.8, 23.0, 7.8, C.trim, g);
    B.box(4.5, 20, 4.52, 5.5, 22.05, 4.6, C.blue, g);
    B.box(4.95, 22.25, 4.45, 5.05, 22.45, 4.6, C.yellow, g);
    B.piece('kk_watertower', { x: 5.0, z: 6.1, y: 23.0, scale: 0.78, group: 'roof' });
    // Downtown AC units, vents
    B.piece('dt_acunit', { x: 7.1, z: -0.6, y: 20, rot: -90, scale: 1.3, group: 'roof' });
    B.piece('dt_acunit', { x: -7.0, z: -3.1, y: 20, rot: 90, scale: 1.3, group: 'roof' });
    [[-0.6, 7.45], [2.9, 7.45]].forEach(function (p) {
      B.geo(B.kit.geo.cyl(0.12, 0.12, 1.0, 10), new THREE.Matrix4().makeTranslation(p[0], 20, p[1]), C.metal, g);
      B.geo(B.kit.geo.cyl(0.2, 0.2, 0.08, 10), new THREE.Matrix4().makeTranslation(p[0], 21.0, p[1]), C.metalDark, g);
    });
  }

  /* gamingCorner: the north-west corner of the roof (x -7.4..-1.6, z 3.6..7.4), outside every rooftop-walk rectangle.
   * Returns the TV screen's placement for makeTV. */
  function gamingCorner(B, C, FA) {
    var THREE = B.THREE, g = { group: 'roof' }, P = DECK, X = new THREE.Vector3(1, 0, 0), mZ = new THREE.Vector3(0, 0, -1);
    // pallet deck: a 0.1 m platform, boards on top (four atlas quads)
    B.box(-7.4, 20, 3.6, -1.6, P - 0.004, 7.4, 0x7a5636, g);
    var dr = FA.rect('deck');
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) B.tquad([-7.4 + i * 2.9, P, 3.6 + (j + 1) * 1.9], X, mZ, 2.9, 1.9, dr, g);
    B.tquad([-5.8, P + 0.006, 6.55], X, mZ, 2.8, 1.75, FA.rect('rug'), g);
    // couch (facing +Z): plinth, cushions, back, arms, feet, two throw pillows
    var TEAL = 0x2f8f8f, TEALD = 0x226e6e;
    B.box(-5.45, P + 0.06, 3.85, -3.35, P + 0.28, 4.88, TEALD, g);
    B.box(-5.27, P + 0.28, 4.08, -4.42, P + 0.44, 4.9, TEAL, g); B.box(-4.38, P + 0.28, 4.08, -3.53, P + 0.44, 4.9, TEAL, g);
    B.box(-5.45, P + 0.28, 3.85, -3.35, P + 0.95, 4.08, TEALD, g);
    B.box(-5.25, P + 0.44, 4.06, -4.42, P + 0.88, 4.28, TEAL, g); B.box(-4.38, P + 0.44, 4.06, -3.55, P + 0.88, 4.28, TEAL, g);
    B.box(-5.45, P + 0.28, 3.85, -5.25, P + 0.66, 4.9, TEALD, g); B.box(-3.55, P + 0.28, 3.85, -3.35, P + 0.66, 4.9, TEALD, g);
    [[-5.4, 3.9], [-3.45, 3.9], [-5.4, 4.8], [-3.45, 4.8]].forEach(function (p) { B.box(p[0] - 0.04, P, p[1] - 0.04, p[0] + 0.04, P + 0.06, p[1] + 0.04, 0x3a2a1c, { group: 'roof', hull: false }); });
    B.geo(new THREE.BoxGeometry(0.34, 0.3, 0.12), frameM(B, -5.05, P + 0.6, 4.3, 0.35, -0.25), C.magenta, g);
    B.geo(new THREE.BoxGeometry(0.3, 0.28, 0.12), frameM(B, -3.8, P + 0.6, 4.3, -0.3, -0.25), C.yellow, g);
    // coffee table: top and legs; pizza box, two cans, a bowl of chips (no pad on it: Roo holds his own controller)
    var WOOD = 0xb07c4c;
    B.box(-5.0, P + 0.38, 5.35, -3.8, P + 0.43, 5.95, WOOD, g);
    [[-4.94, 5.41], [-3.86, 5.41], [-4.94, 5.89], [-3.86, 5.89]].forEach(function (p) { B.box(p[0] - 0.03, P, p[1] - 0.03, p[0] + 0.03, P + 0.38, p[1] + 0.03, 0x6b4a32, g); });
    B.box(-4.95, P + 0.43, 5.42, -4.55, P + 0.47, 5.82, 0xefe6d2, g);
    B.tquad([-4.94, P + 0.472, 5.81], X, mZ, 0.38, 0.38, FA.rect('pizza'), g);
    [[-4.2, 5.48, 0xc8352e], [-4.07, 5.56, 0x1f7d7a]].forEach(function (c) {
      B.geo(B.kit.geo.cyl(0.033, 0.033, 0.12, 10), new THREE.Matrix4().makeTranslation(c[0], P + 0.43, c[1]), c[2], g);
      B.geo(B.kit.geo.cyl(0.034, 0.034, 0.02, 10), new THREE.Matrix4().makeTranslation(c[0], P + 0.48, c[1]), 0xf3ead6, { group: 'roof', hull: false });
    });
    B.geo(B.kit.geo.lathe([[0.001, 0], [0.08, 0.005], [0.13, 0.07], [0.125, 0.075]], 10), new THREE.Matrix4().makeTranslation(-4.35, P + 0.43, 5.78), 0xf3ead6, g);
    [[0.02, 0.05], [-0.04, 0.03], [0.05, -0.04], [-0.03, -0.05], [0, 0]].forEach(function (p, k) {
      B.geo(new THREE.IcosahedronGeometry(0.035, 0), new THREE.Matrix4().makeTranslation(-4.35 + p[0], P + 0.49 + (k === 4 ? 0.02 : 0), 5.78 + p[1]), 0xf2c94c, { group: 'roof', hull: false });
    });
    // TV stand (x -5.5..-3.3, z 6.95..7.4): top, bottom shelf, sides, back; the console on the open shelf
    var STAND = 0x3b3f48;
    B.box(-5.5, P + 0.48, 6.95, -3.3, P + 0.54, 7.4, STAND, g);
    B.box(-5.5, P + 0.04, 6.95, -3.3, P + 0.1, 7.4, STAND, g);
    B.box(-5.5, P, 6.95, -5.44, P + 0.48, 7.4, STAND, g); B.box(-3.36, P, 6.95, -3.3, P + 0.48, 7.4, STAND, g);
    B.box(-4.42, P + 0.1, 6.97, -4.38, P + 0.48, 7.4, STAND, g);
    B.box(-5.44, P + 0.1, 7.36, -3.36, P + 0.48, 7.4, 0x2b2e35, { group: 'roof', hull: false });
    // the console (our own shape: a low flat slab, a raised top plate, a yellow accent line and a blue light; no logo)
    B.box(-4.32, P + 0.1, 7.0, -3.84, P + 0.165, 7.32, 0x2a2d33, g);
    B.box(-4.28, P + 0.165, 7.03, -3.88, P + 0.185, 7.29, 0x3a3e46, g);
    B.box(-4.31, P + 0.128, 6.994, -3.85, P + 0.138, 7.0, C.yellow, { group: 'roof', hull: false, cam: false });
    B.box(-3.92, P + 0.142, 6.994, -3.9, P + 0.156, 7.0, 0x6fc3ff, { group: 'roof', hull: false, cam: false });
    // a few games on the left shelf
    [0xE0218A, 0x1F4FD8, 0x2f8a57, 0xFFD21F].forEach(function (c, k) { B.box(-5.35 + k * 0.05, P + 0.1, 7.1, -5.31 + k * 0.05, P + 0.32, 7.3, c, { group: 'roof', hull: false }); });
    // TV: feet, body (ink hull); the screen is a separate mesh (makeTV)
    B.box(-4.95, P + 0.54, 7.18, -4.75, P + 0.57, 7.32, 0x15171c, g); B.box(-4.05, P + 0.54, 7.18, -3.85, P + 0.57, 7.32, 0x15171c, g);
    B.box(-4.62, P + 0.57, 7.24, -4.18, P + 0.6, 7.28, 0x15171c, g);
    B.box(-5.12, P + 0.6, 7.22, -3.68, P + 1.42, 7.31, 0x15171c, g);
    // cable: console back -> floor -> the outlet box on the west parapet
    var curve = new THREE.CatmullRomCurve3([[-4.0, P + 0.13, 7.33], [-4.0, P + 0.03, 7.5], [-5.2, P + 0.012, 7.58], [-6.6, P + 0.012, 7.5], [-7.4, P + 0.05, 7.1], [-7.68, P + 0.3, 6.9]].map(function (p) { return new THREE.Vector3().fromArray(p); }));
    B.geo(new THREE.TubeGeometry(curve, 36, 0.013, 5, false), new THREE.Matrix4(), 0x15171c, { group: 'roof', hull: false, cam: false });
    B.box(-7.75, P + 0.2, 6.75, -7.66, P + 0.42, 7.05, 0xd8d0c0, g);
    // extras: floor lamp, cooler, potted plant
    B.geo(B.kit.geo.cyl(0.02, 0.02, 1.5, 6), new THREE.Matrix4().makeTranslation(-5.85, P, 4.15), 0x222222, { group: 'roof', hull: false });
    B.geo(B.kit.geo.cyl(0.14, 0.2, 0.06, 10), new THREE.Matrix4().makeTranslation(-5.85, P, 4.15), 0x222222, g);
    B.geo(B.kit.geo.cyl(0.13, 0.24, 0.3, 10), new THREE.Matrix4().makeTranslation(-5.85, P + 1.42, 4.15), C.yellow, g);
    B.box(-6.95, P, 4.95, -6.35, P + 0.42, 5.4, 0x1F4FD8, g); B.box(-6.97, P + 0.42, 4.93, -6.33, P + 0.48, 5.42, 0xFFF8E7, g);
    B.box(-7.3, P, 3.75, -6.8, P + 0.45, 4.25, 0xb8643a, g);
    bush(B, -7.05, P + 0.4, 4.0, 0.42, g);
    return { center: [-4.4, P + 1.01, 7.215], w: 1.36, h: 0.765 };
  }
  function frameM(B, x, y, z, yaw, pitch) {
    var T = B.THREE;
    return new T.Matrix4().makeTranslation(x, y, z).multiply(new T.Matrix4().makeRotationY(yaw)).multiply(new T.Matrix4().makeRotationX(pitch));
  }
  /* makeTV(kit, root, place) -> {api, update(t, visible), pause()}: the screen mesh; a canvas fallback game frame
   * (sky, skyline, a road, a little car, a minimap circle, a health bar and the mission line), redrawn at ~10 Hz of
   * game time while it shows; the video (fetched as bytes, played from a blob URL) replaces it once it plays. */
  function makeTV(kit, root, place) {
    var THREE = kit.THREE;
    var cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
    var ctx = cv.getContext('2d');
    var fallback = new THREE.CanvasTexture(cv); fallback.colorSpace = THREE.SRGBColorSpace;
    var mat = new THREE.MeshBasicMaterial({ map: fallback, toneMapped: false, fog: false });
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(place.w, place.h), mat);
    screen.name = 'tv-screen';
    screen.position.fromArray(place.center); screen.rotation.y = PI;
    root.add(screen);
    var on = true, video = null, vtex = null, playing = false, failed = false, lastDraw = -1, visible = false;
    var frozen = false, held = false;   // pause(true): the picture stops on its last frame (video or canvas)
    drawFallback(ctx, 0); fallback.needsUpdate = true;

    function fail(why) {
      if (!failed) JG.info && JG.info('tv: video unavailable (' + why + '); showing the canvas game frame');
      failed = true; playing = false; api.video = null; apply();
    }
    // the video: bytes -> blob URL (no media range requests), muted, looped, inline; never blocks boot
    try {
      if (typeof document !== 'undefined' && JG.assets && JG.assets.bytes && window.URL && URL.createObjectURL) {
        video = document.createElement('video');
        video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
        video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.preload = 'auto';
        video.addEventListener('playing', function () { playing = true; apply(); });
        video.addEventListener('pause', function () { held = frozen && playing; playing = false; apply(); });
        video.addEventListener('error', function () { fail('media error'); });
        JG.assets.bytes(VIDEO).then(function (buf) {
          if (!video) return;
          video.src = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
          vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace;
          want();
        }).catch(function (e) { fail(e && e.message || 'fetch'); });
      }
    } catch (e) { fail(e && e.message || 'setup'); }

    function want() {
      if (!video || failed || !vtex) return;
      var should = on && visible && !frozen;
      if (should && video.paused) {
        var p = null;
        try { p = video.play(); } catch (e) { p = null; }
        if (p && p.catch) p.catch(function () { /* autoplay refused: the canvas frame stays */ });
      } else if (!should && !video.paused) video.pause();
    }
    function apply() {
      if (!on) { mat.map = null; mat.color.set(0x0c0e13); }
      else { mat.color.set(0xffffff); mat.map = (playing || held) && vtex && !failed ? vtex : fallback; }
      mat.needsUpdate = true;
    }
    var api = {
      object: screen, anchors: {}, screen: screen, video: video,
      on: function (b) { on = b !== false; apply(); want(); },
      isOn: function () { return on; },
      /** pause(true) holds the current frame (the video, or the canvas frame); pause(false) plays on */
      pause: function (b) { frozen = b !== false; if (!frozen) held = false; apply(); want(); },
      state: function () { return { on: on, playing: playing, failed: failed, hasVideo: !!video, paused: frozen }; }
    };
    apply();
    return {
      api: api,
      update: function (t, vis) {
        if (vis !== visible) { visible = vis; want(); }
        if (on && vis && !frozen && !(playing && vtex) && t - lastDraw > 0.1) { lastDraw = t; drawFallback(ctx, t); fallback.needsUpdate = true; }
      },
      pause: function () { visible = false; want(); }
    };
  }
  /** the fallback frame: an original open-city game, drawn in canvas (no third-party marks, no wanted stars) */
  function drawFallback(c, t) {
    var W = 320, H = 180, i;
    var g = c.createLinearGradient(0, 0, 0, H * 0.55); g.addColorStop(0, '#f0915a'); g.addColorStop(1, '#ffd79a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // skyline layers scrolling at two speeds
    [[0.35, '#7a5f8c', 0.55, 46], [0.8, '#4b3f63', 0.62, 30]].forEach(function (L, li) {
      c.fillStyle = L[1];
      var off = (t * 40 * L[0]) % 64;
      for (i = -1; i < 7; i++) {
        var bx = i * 64 - off, h = 30 + ((i + li * 3 + Math.floor(t * 40 * L[0] / 64)) * 37 % 5) * 9;
        c.fillRect(bx, H * L[2] - h, 52, h);
        c.fillStyle = '#ffe08a';
        for (var w = 0; w < 3; w++) c.fillRect(bx + 8 + w * 14, H * L[2] - h + 8, 6, 6);
        c.fillStyle = L[1];
      }
    });
    // road in perspective, dashes moving towards the viewer
    c.fillStyle = '#3c3f48'; c.beginPath(); c.moveTo(W * 0.42, H * 0.62); c.lineTo(W * 0.58, H * 0.62); c.lineTo(W, H); c.lineTo(0, H); c.fill();
    c.fillStyle = '#6d7a52'; c.beginPath(); c.moveTo(0, H * 0.62); c.lineTo(W * 0.42, H * 0.62); c.lineTo(0, H); c.fill();
    c.beginPath(); c.moveTo(W, H * 0.62); c.lineTo(W * 0.58, H * 0.62); c.lineTo(W, H); c.fill();
    c.fillStyle = '#ffd21f';
    for (i = 0; i < 6; i++) { var p = ((i / 6) + t * 0.9) % 1, y = H * 0.62 + p * p * H * 0.38, wd = 1 + p * 5; c.fillRect(W / 2 - wd / 2, y, wd, 2 + p * 9); }
    // the player's car (a small yellow coupe, from behind), bobbing
    var bob = Math.sin(t * 9) * 1.2, cx = W / 2 + Math.sin(t * 0.8) * 22, cy = H * 0.84 + bob;
    c.fillStyle = '#111'; c.fillRect(cx - 30, cy - 4, 60, 18);
    c.fillStyle = '#FFD21F'; c.fillRect(cx - 28, cy - 2, 56, 14); c.fillRect(cx - 18, cy - 14, 36, 13);
    c.fillStyle = '#3d5a8a'; c.fillRect(cx - 14, cy - 12, 28, 8);
    c.fillStyle = '#E0218A'; c.fillRect(cx - 26, cy + 2, 8, 4); c.fillRect(cx + 18, cy + 2, 8, 4);
    // HUD: minimap circle, health bar, mission line
    c.fillStyle = 'rgba(17,17,17,0.55)'; c.beginPath(); c.arc(30, H - 30, 22, 0, 7); c.fill();
    c.strokeStyle = '#FFF8E7'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#9aa3b5'; c.lineWidth = 3; c.beginPath(); c.moveTo(12, H - 30); c.lineTo(48, H - 30); c.moveTo(30, H - 48); c.lineTo(30, H - 12); c.stroke();
    c.fillStyle = '#FFD21F'; c.beginPath(); c.moveTo(30, H - 36); c.lineTo(34, H - 26); c.lineTo(26, H - 26); c.fill();
    c.fillStyle = 'rgba(17,17,17,0.6)'; c.fillRect(W - 92, 10, 82, 10);
    c.fillStyle = '#2f8a57'; c.fillRect(W - 90, 12, 60 + Math.sin(t) * 6, 6);
    c.fillStyle = 'rgba(17,17,17,0.65)'; c.fillRect(W / 2 - 78, 8, 156, 18);
    c.fillStyle = '#FFF8E7'; c.font = 'bold 11px "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('MISSION: FIX THE BUILD', W / 2, 17.5);
  }

  /* stairs(B, C, at, {x0, x1, zTop, zBottom, zEnd, dir, group}): a 3 m stairwell. dir -1: the stairs go down towards
   * -Z (streetA); +1: they come up towards +Z (streetB), so zTop > zBottom. 16 risers of 0.1875 m, a landing at the
   * bottom to zEnd with a dark tunnel mouth, walls, railings and an arch with the HOP ST sign on both faces (board
   * bottom at archY, default 2.35). */
  function stairs(B, C, at, s) {
    var o = { group: s.group || 'main' }, n = 16, rise = 3 / n, run = (s.zBottom - s.zTop) / n, i;
    var zTopEdge = s.dir < 0 ? -21 : s.zTop;   // the pavement edge (stairs A start 0.5 m in from it)
    if (s.dir < 0) B.box(s.x0, -0.25, zTopEdge, s.x1, 0, s.zTop, C.pavement, o);
    // 2026-11-26: a dark, shadowed well (it was pavement and stone, light all the way down). The steps go from a mid
    // grey under the street to near-dark at the landing, every other one a touch lighter so the treads still count
    // under their ink lines; the walls are two dark bands under a light stone coping flush with the pavement.
    var STEP_HI = new B.THREE.Color(0x6e7079), STEP_LO = new B.THREE.Color(0x2e3038), sc = new B.THREE.Color();
    var WALL_HI = 0x4b4e58, WALL_LO = 0x34363f, FLOOR = 0x2a2c33, COPE = 0.06, BAND = -1.3;
    for (i = 0; i < n; i++) {
      var za = s.zTop + i * run, zb = s.zTop + (i + 1) * run, top = -(i + 1) * rise;
      sc.copy(STEP_HI).lerp(STEP_LO, i / (n - 1));
      if (i % 2) sc.multiplyScalar(1.16);
      B.box(s.x0, top - 0.25, Math.min(za, zb), s.x1, top, Math.max(za, zb), sc.getHex(), o);
    }
    B.box(s.x0, -3.25, Math.min(s.zBottom, s.zEnd), s.x1, -3, Math.max(s.zBottom, s.zEnd), FLOOR, o);
    var zw = s.zEnd, sg = s.dir < 0 ? -1 : 1;
    // in: how far the dark bands stand proud of the coping on the well side (6 mm on the side walls: the pavement
    // blocks' own side faces lie in the wall plane down to y -0.4 and would flicker light through a flush dark face)
    function wall(x0, z0, x1, z1, inL, inR) {
      B.box(x0 - (inL || 0), -3.25, z0, x1 + (inR || 0), BAND, z1, WALL_LO, o);
      B.box(x0 - (inL || 0), BAND, z0, x1 + (inR || 0), -COPE, z1, WALL_HI, o);
      B.box(x0, -COPE, z0, x1, 0, z1, C.stone, o);
    }
    wall(s.x0 - 0.3, s.zEnd - 0.3, s.x1 + 0.3, s.zEnd);
    B.box(s.x0 + 0.2, -3, zw - 0.02 * sg, s.x1 - 0.2, -0.9, zw + 0.03, 0x0c0d11, Object.assign({ hull: false }, o));
    var zMin = Math.min(zTopEdge, s.zEnd) - 0.3, zMax = Math.max(zTopEdge, s.zEnd);
    wall(s.x0 - 0.3, zMin, s.x0, zMax, 0, 0.006);
    wall(s.x1, zMin, s.x1 + 0.3, zMax, 0.006, 0);
    B.box(s.x0 - 0.02, -2.2, zMin + 0.3, s.x0 + 0.01, -1.9, zMax - 0.1, 0x3f7a5a, Object.assign({ hull: false }, o));
    B.box(s.x1 - 0.01, -2.2, zMin + 0.3, s.x1 + 0.02, -1.9, zMax - 0.1, 0x3f7a5a, Object.assign({ hull: false }, o));
    var RAIL = 0x2f4a3a, rz0 = Math.min(zTopEdge, s.zEnd), rz1 = Math.max(zTopEdge, s.zEnd);
    var zOpen = rz1, zClosed = rz0;
    [s.x0 - 0.15, s.x1 + 0.15].forEach(function (x) {
      B.box(x - 0.03, 0.95, zClosed - 0.15, x + 0.03, 1.02, zOpen - 0.35, RAIL, o);
      B.box(x - 0.025, 0.45, zClosed - 0.15, x + 0.025, 0.5, zOpen - 0.35, RAIL, o);
      for (var z = zClosed - 0.15; z <= zOpen - 0.3; z += 1.4) B.box(x - 0.04, 0, z - 0.04, x + 0.04, 1.02, z + 0.04, RAIL, o);
    });
    B.box(s.x0 - 0.18, 0.95, zClosed - 0.18, s.x1 + 0.18, 1.02, zClosed - 0.12, RAIL, o);
    B.box(s.x0 - 0.18, 0.45, zClosed - 0.18, s.x1 + 0.18, 0.5, zClosed - 0.12, RAIL, o);
    // the arch: sign board from ay to ay + 0.6. StreetB's stands higher (s.archY) so the plaza-walk follow camera
    // (3 m up, 6 m behind Roo, who walks out under it) passes beneath the board instead of brushing behind it
    // (the camera passes between the posts there too: s.archOut sets them that far out from the stairwell, s.archZ
    // moves the arch, and a crossbar carries the board out to them)
    var za2 = s.archZ !== undefined ? s.archZ : s.dir < 0 ? -21.1 : -0.7, ay = s.archY || 2.35;
    var xa = s.x0 - (s.archOut || 0.25), xb = s.x1 + (s.archOut || 0.25), ba = s.x0 - 0.25, bb = s.x1 + 0.25;
    [xa, xb].forEach(function (x) {
      B.box(x - 0.07, 0, za2 - 0.07, x + 0.07, ay + 0.6, za2 + 0.07, RAIL, o);
      B.geo(B.kit.geo.sphere(0.2, 12), new B.THREE.Matrix4().makeTranslation(x, ay + 0.77, za2), C.yellow, o);
    });
    if (xa < ba - 0.1) B.box(xa, ay + 0.22, za2 - 0.035, xb, ay + 0.38, za2 + 0.035, RAIL, o);
    xa = ba; xb = bb;
    B.box(xa - 0.1, ay, za2 - 0.05, xb + 0.1, ay + 0.6, za2 + 0.05, C.paper, o);
    var sq = { group: s.group === 'fB' ? 'signsB' : 'signs' };
    B.quad(at, 'hop', [(xa + xb) / 2, ay + 0.3, za2 + 0.056], xb - xa + 0.1, 0.56, 0, sq);
    B.quad(at, 'hop', [(xa + xb) / 2, ay + 0.3, za2 - 0.056], xb - xa + 0.1, 0.56, PI, sq);
  }

  function streetSign(B, C, at, x, z, o) {
    o = o || {};
    B.box(x - 0.05, 0, z - 0.05, x + 0.05, 3.3, z + 0.05, C.metalDark, o);
    B.box(x - 0.9, 2.86, z - 0.03, x + 0.9, 3.18, z + 0.03, C.blue, o);
    var sq = { group: o.group === 'fB' ? 'signsB' : 'signs' };
    B.quad(at, 'street', [x, 3.02, z + 0.034], 1.78, 0.3, 0, sq);
    B.quad(at, 'street', [x, 3.02, z - 0.034], 1.78, 0.3, PI, sq);
    B.box(x - 0.03, 2.46, z - 0.8, x + 0.03, 2.78, z + 0.8, C.blue, o);
    B.quad(at, 'hopBlade', [x + 0.034, 2.62, z], 1.58, 0.3, PI / 2, sq);
    B.quad(at, 'hopBlade', [x - 0.034, 2.62, z], 1.58, 0.3, -PI / 2, sq);
  }
  function totem(B, C, at, x, z, yaw) {
    var o = { group: 'fA' };
    B.box(x - 0.45, 0, z - 0.2, x + 0.45, 2.2, z + 0.2, C.metalDark, o);
    var dz = Math.cos(yaw) * 0.205, dx = Math.sin(yaw) * 0.205;
    B.quad(at, 'totem', [x + dx, 1.25, z + dz], 0.8, 1.6, yaw);
    B.quad(at, 'totem', [x - dx, 1.25, z - dz], 0.8, 1.6, yaw + PI);
  }

  function fortune500(B, C, at) {
    var o = { group: 'f500' }, STONE = 0xcfc6b4, GLASS = 0x5b6f99;
    // podium (y 0..6) around the lobby recess x 56..64, z 10..13, and the cab x 58.5..61.5, z 13..14.6
    B.box(50, 0, 10, 56, 6, 28, STONE, o); B.box(64, 0, 10, 70, 6, 28, STONE, o);
    B.box(56, 0, 14.6, 64, 6, 28, STONE, o);
    B.box(56, 0, 13, 58.5, 6, 14.6, STONE, o); B.box(61.5, 0, 13, 64, 6, 14.6, STONE, o);
    B.box(58.5, 2.6, 13, 61.5, 6, 14.6, STONE, o);
    B.box(56, 4.6, 10, 64, 6, 13, STONE, o);                       // lintel over the recess (the lettering sits on it)
    B.box(49.9, 0, 9.9, 70.1, 0.45, 10.0, 0xa89f8c, o);
    B.box(50.6, 0.8, 9.92, 55.4, 4.2, 10.0, GLASS, o); B.box(64.6, 0.8, 9.92, 69.4, 4.2, 10.0, GLASS, o);
    B.box(49.8, 5.9, 9.8, 70.2, 6.3, 28.2, 0xa89f8c, o);           // podium cornice
    // the podium's lobby glazing either side of the recess: curtain-wall cells (lit lobby panes) on the glass boxes
    var gr = B.atlas.rect('base:glass'), mX = new B.THREE.Vector3(-1, 0, 0), Yv = new B.THREE.Vector3(0, 1, 0);
    [[55.4, 50.6], [69.4, 64.6]].forEach(function (g) { B.tquad([g[0], 0.8, 9.915], mX, Yv, g[0] - g[1], 3.4, gr, o); });
    // recess: polished floor, brass trims, cab lining
    var r = { group: 'fB' };
    B.box(56, 0, 10, 64, 0.02, 14.6, 0xe2dccd, Object.assign({ hull: false }, r));
    B.box(56, 4.45, 10, 64, 4.6, 10.15, C.brass, r);
    B.box(58.25, 0, 12.92, 58.5, 2.85, 13.0, C.brass, r); B.box(61.5, 0, 12.92, 61.75, 2.85, 13.0, C.brass, r);
    B.box(58.25, 2.6, 12.92, 61.75, 2.85, 13.0, C.brass, r);
    B.box(58.6, 0.1, 14.5, 61.4, 2.5, 14.6, C.brassDark, Object.assign({ hull: false }, r));
    B.box(59.5, 3.0, 12.94, 60.5, 3.35, 13.0, 0x111111, r);
    B.box(59.6, 3.07, 12.92, 59.75, 3.28, 12.94, C.yellow, Object.assign({ hull: false }, r));
    [56.15, 63.85].forEach(function (x) { B.box(x - 0.1, 2.6, 11.4, x + 0.1, 3.1, 11.8, C.yellow, r); });
    B.quad(at, 'f500', [60, 5.3, 9.985], 7.4, 0.92, PI, { group: 'signsCity' });
    // tower above the podium: a glass curtain-wall shell with a crown (always visible)
    var t = B.building({ x0: 51, z0: 11, x1: 69, z1: 27, y0: 6.3, ground: 'none', floors: 22, style: 'glass', group: 'landmark', seed: 500, parapet: 1.2,
      setback: { inset: 3, floors: 2, parapet: 0.8 } });
    B.box(57, t.top, 17, 63, t.top + 5, 21, 0x3c4a6b, { group: 'landmark' });
    B.box(59.9, t.top + 5, 18.9, 60.1, t.top + 14, 19.1, 0x3c4a6b, { group: 'landmark' });
  }

  /* skyline: towers in two rings around the city (no outline; tower atlas faces stretched per 24 m band) */
  function skyline(B, FA, rng) {
    var THREE = B.THREE, cx = 22, cz = -12, i;
    var walls = [0x7d8aa8, 0x8a7d9e, 0xa86a5a, 0x5b6f99];
    function tower(x, z, w, d, h, v, group, base) {
      base = base || 0;
      var r = FA.rect('tower:' + v), x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, Y = new THREE.Vector3(0, 1, 0);
      var faces = [[new THREE.Vector3(1, 0, 0), [x0, z1 + 0.01], w], [new THREE.Vector3(-1, 0, 0), [x1, z0 - 0.01], w], [new THREE.Vector3(0, 0, -1), [x1 + 0.01, z1], d], [new THREE.Vector3(0, 0, 1), [x0 - 0.01, z0], d]];
      faces.forEach(function (f) {
        for (var y = 0; y < h - 0.01; y += 24) {
          var hh = Math.min(24, h - y);
          B.tquad([f[1][0], base + y, f[1][1]], f[0], Y, f[2], hh, [r[0], r[1] + (r[3] - r[1]) * (1 - hh / 24), r[2], r[3]], { group: group });
        }
      });
      B.box(x0 - 0.4, base + h, z0 - 0.4, x1 + 0.4, base + h + 1.2, z1 + 0.4, walls[v], { group: group, hull: false, cam: false });
    }
    // the near ring (85..115 m): bigger, with setbacks
    for (i = 0; i < 22; i++) {
      var a = (i / 22) * PI * 2 + 0.11, r1 = 92 + rng() * 22;
      var x = cx + Math.cos(a) * r1 * 1.1, z = cz + Math.sin(a) * r1;
      var w = 14 + rng() * 12, d = 14 + rng() * 10, h = 36 + rng() * 60, v = Math.floor(rng() * 4);
      tower(x, z, w, d, h, v, 'sky');
      if (rng() < 0.6) tower(x, z, w * 0.62, d * 0.62, 12 + Math.floor(rng() * 2) * 12, v, 'sky', h + 1.2);
      if (rng() < 0.3) B.box(x - 0.4, h, z - 0.4, x + 0.4, h + 14 + rng() * 10, z + 0.4, 0x5a5d66, { group: 'sky', hull: false, cam: false });
    }
    // the far ring (130..220 m)
    for (i = 0; i < 44; i++) {
      var a2 = (i / 44) * PI * 2 + rng() * 0.05, r2 = 130 + rng() * 90;
      tower(cx + Math.cos(a2) * r2, cz + Math.sin(a2) * r2, 12 + rng() * 18, 12 + rng() * 16, 22 + rng() * 90, Math.floor(rng() * 4), 'sky');
    }
  }
})();
