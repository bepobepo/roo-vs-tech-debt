/* JG.scenes.register('office'): floor 56 of the FORTUNE 500 tower and its elevator (plan section 10), Stage 1
 * greybox-plus by E4, furnished from kit-office.glb (tools/assets.config.json kits.office) through
 * JG.interior.officeKit: screens, keyboards, shelves and small props from Kenney's Furniture Kit 2.0 and the
 * hero monitor from MrEliptik's Office Low Poly Pack (both CC0); the dressing pass of 2026-11-25 (pieces "vnb_*")
 * and the desks and office chairs (the cubicles' and the hero's; see DESK_LIFT for the measurements) from VNBP -
 * Leo's Low Poly 3D Office Set [VNB] and Office Set #2 [VNB] (CC BY 4.0, credited on the end card and in LICENSES).
 * PC towers, paper trays and mice in the cubicles are plain boxes (triangle budget).
 * The Stage 1 boxes remain as the fallback.
 *
 * Layout (metres): the lift car is x -1.3..1.3, z -2.4..0 (floor y = 0), its doors slide in the lift wall at z = 0;
 * the open-plan floor runs x -10..10, z 0..21 under a 3.2 m ceiling; the window wall is z = 21 with mullions every
 * 2 m and the breakable bay x 4..6 in front of the hero desk (chair at office.chair, monitor facing it). Desks
 * (SEATS, 2026-11-24 cubicles pass): the west block is three rows of three cubicles, a cubicle island (two
 * back-to-back pairs on a spine) splits the centre aisle into two lanes, three cubicles stand before the east
 * whiteboard wall, and the hero desk and its neighbour by the window stay open. Cubicle panels (PANELS) are boxes:
 * purple fabric, a trim cap, a dark kick; every workstation is dressed per mood (workstation(): a PC tower under
 * each desk, paper trays, phones). Dressing: kitchenette (coffee machine, microwave, cups, donuts, wall clock), printer
 * station, whiteboard, shelves, a cupboard and a bookshelf on the east wall; filing cabinets, the wall dashboard and a
 * bookshelf on the west wall (both bookshelves tan, with books and binders); a break corner (cafe table, three chairs)
 * west of the lift; paintings (flat comic art cards on the canvas), air conditioners and vents on the walls; a lounge
 * (sofa, armchair, rug, coffee table, floor lamp) in the west window corner; vases and bamboo planters in terracotta
 * pots (low ones under two window bays), healthy in mood 'after', sickly yellow-green in 'before'.
 * The office life pass (2026-11-25): office-walk's three optional stations (office-props.js builds them): a face scanner
 * kiosk right of the walk in from the lift, a water cooler against the cubicle island's lift-side end panel (the cork
 * board there moved east of it), and the kitchenette's coffee machine moved to the counter's front edge (the microwave
 * took its place by the wall); their stand marks and zones (office.scanStand / coolerStand / coffeeStand,
 * office.scanner / cooler / coffee); office-walk's crowd (crowdSpots: two gossipers either side of the cooler, a man on
 * the phone by the window); a third typist's island seat (office.extraDesk3) and extra2's spot at the printer; the
 * mug Roo brings to the hero desk (props.deskMug, shown by desk-sit, montage and two-hours-later when he kept his
 * coffee). The stations animate only in office-walk (props.live). Everything new stands outside the walk rects. Outside: a skyline seen from 56 floors up.
 * Roo's station is fitted to his seated typing pose (see DESK_TOP): lowered armless chair, a pull-out keyboard tray in
 * front of his knees, the monitor's lit face where the desk-sit shots expect it. His chair is its own mesh: pulled
 * out to his right while he is away from office.chair, swung in under him when he reaches it (heroChair).
 * Cutaway walls: the lift wall, the side walls and the ceiling are single-sided (no ink), so a shot from outside the
 * room looks through them; the lift car's walls hide while the camera is outside the car and behind the lift wall.
 * The follow camera does not go there: camColliders holds the room shell as solid slabs, plus desks, monitors,
 * shelves, cabinets and planters. Every static piece is merged into the builder's groups (main, before, after, ...):
 * no instancing (the hero chair and the stations' effects are the moving pieces).
 * State: floor 1..56 (lift displays, tweened), doors, mood before/after (paper stacks, wilted plants, red wall
 * dashboard / tidy, green), monitor (the hero monitor CanvasTexture; JG.ui.radar.drawMonitor(ctx, w, h, stage)
 * fills it, redrawn at most 10 times a second), window intact/broken (the dive-shaped hole placeholder and shards;
 * the three-pinata fracture comes in Stage 3), light day/dusk.
 * Markers keep the core greybox positions (JG.stubs.SETS.office), except office.extraStand (moved to the printer,
 * 2026-11-25); the stations' marks and office.extraDesk3 are new. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  var PI = Math.PI;

  var MARKERS = {
    'office.elevatorMark': { pos: [0, 0, -1.2], yaw: 0 }, 'office.elevatorOut': { pos: [0, 0, 1.6], yaw: 0 },
    'office.opsStart': { pos: [-5, 0, 12], yaw: PI }, 'office.opsPlea': { pos: [0, 0, 3.2], yaw: PI },
    'office.hug.roo': { pos: [0, 0, 2.29], yaw: 0 }, 'office.hug.ops': { pos: [0, 0, 2.71], yaw: PI },
    'office.spawn': { pos: [0, 0, 2.2], yaw: 0 }, 'office.deskStand': { pos: [5, 0, 13.6], yaw: 0 },
    'office.chair': { pos: [5, 0, 14.5], yaw: 0 }, 'office.execStand': { pos: [2.6, 0, 14.4], yaw: PI / 2 },
    'office.windowRun': { pos: [5, 0, 19.5], yaw: 0 }, 'office.windowHole': { pos: [5, 1.2, 21], yaw: 0 },
    // 2026-11-28: the "check the windows" station of office-walk: Roo stops at the glass behind the hero desk (inside the walk rects, z <= 20.2)
    'office.windowStand': { pos: [5, 0, 20.1], yaw: 0 },
    'office.extraDesk1': { pos: [-5, 0, 9], yaw: 0 }, 'office.extraDesk2': { pos: [-5, 0, 14], yaw: 0 },
    // the island seat facing its spine from the east lane (extra4); extra2 waits at the printer
    'office.extraDesk3': { pos: [1.11, 0, 9.5], yaw: -PI / 2 }, 'office.extraStand': { pos: [8.95, 0, 3.95], yaw: PI / 2 }
  };
  // the office-walk stations (office-props.js): where Roo stands to scan his face, to press the cooler's tap and the
  // coffee button (each derived from roo.reachPress's measured fingertip), and the zones that show their prompts
  var OP = JG.officeProps && JG.officeProps.LAYOUT;
  if (OP) ['scanStand', 'coolerStand', 'coffeeStand'].forEach(function (k) { MARKERS['office.' + k] = { pos: OP[k].pos.slice(), yaw: OP[k].yaw }; });
  var ZONES = { 'office.desk': { type: 'box', min: [4, 12.8], max: [6, 14.6] },
    'office.scanner': { type: 'box', min: [2.55, 3.70], max: [3.45, 4.30] }, 'office.cooler': { type: 'box', min: [-0.90, 7.10], max: [0.05, 7.81] },
    'office.coffee': { type: 'box', min: [8.25, 1.95], max: [8.78, 2.75] },
    'office.window': { type: 'box', min: [3.9, 19.0], max: [6.1, 20.2] } };
  var PATHS = {
    'office.toHug': ['office.opsStart', [-2, 0, 6], 'office.opsPlea'],
    'office.windowRun': ['office.chair', [5, 0, 17], 'office.windowRun', 'office.windowHole']
  };
  var DEFAULTS = { floor: 56, doors: 'open', mood: 'before', monitor: 'off', window: 'intact', light: 'day' };
  // Workstations [x, z, yaw]: the seat mark (yaw 0 faces +Z); the desk sits 0.25..1.03 m in front of it and a
  // cubicle's front panel at 1.08..1.14. West: three rows of three cubicles (extraDesk1 is (-5, 9), extraDesk2
  // (-5, 14)); the centre island: two back-to-back pairs facing its spine at x = 0; east: three cubicles before the
  // whiteboard wall; the hero's neighbour by the window, open like the hero desk (the desk-sit and montage shots look
  // across that row).
  var SEATS = [
    [-9, 4, 0], [-7, 4, 0], [-5, 4, 0], [-9, 9, 0], [-7, 9, 0], [-5, 9, 0], [-9, 14, 0], [-7, 14, 0], [-5, 14, 0],
    [-1.11, 9.5, PI / 2], [-1.11, 11.5, PI / 2], [1.11, 9.5, -PI / 2], [1.11, 11.5, -PI / 2],
    [5, 8, 0], [7, 8, 0], [9, 8, 0], [8, 14.5, 0, 'open']
  ];
  // seats an extra sits at (their chair stays put in both moods); 2: taken later (the island seat of extraDesk3), so
  // workstation() burns the rng draws its chairs and sheet made and the other seats' clutter stays where it was
  var TAKEN = { '-5,9': 1, '-5,14': 1, '1.11,9.5': 2 };
  // Cubicle panels [x0, z0, x1, z1] (world; 0.06 thick, 1.245 m tall with the cap): fabric, a top trim, a dark kick.
  // Row B's front panel stops at x -4.4 and has no aisle-end wing: the ops lead's run (office.toHug, (-5, 12) to
  // (-2, 6)) cuts that corner. No panel enters a walk rect; they are not camera colliders (the follow camera rides
  // above them).
  var PANELS = [];
  [4, 9, 14].forEach(function (s) {
    PANELS.push([-10, s + 1.08, s === 9 ? -4.4 : -3.97, s + 1.14]);
    (s === 9 ? [-8, -6] : [-8, -6, -4]).forEach(function (x) { PANELS.push([x - 0.03, s - 0.25, x + 0.03, s + 1.08]); });
  });
  PANELS.push([-0.03, 8.47, 0.03, 12.53]);
  [8.5, 10.5, 12.5].forEach(function (z) { PANELS.push([-1.25, z - 0.03, 1.25, z + 0.03]); });
  PANELS.push([3.97, 9.08, 10, 9.14]);
  [4, 6, 8].forEach(function (x) { PANELS.push([x - 0.03, 7.75, x + 0.03, 9.08]); });
  var HERO = [5, 14.5];
  // the hero chair is its own mesh: pulled out to Roo's right (seat-mark frame: offset and yaw) while he is not at
  // the seat mark, so his walk from office.deskStand is clear; it swings in under him as he arrives (heroChair)
  var CHAIR_OUT = { x: -0.54, z: 0.0, yaw: 0.8 }, CHAIR_SWING = 0.55;
  /* Desks and chairs (2026-11-25): VNB set 1 (CC BY 4.0), modelled at about 1.27x real scale (desk top 0.949, seat
   * 0.600), so only heights are corrected here; footprints stay VNB-sized. Measured from the source GLBs (metres,
   * Y-up, the piece faces +Z):
   *   Office_Desk_1 (vnb_desk, 54 tris): top slab y 0.874..0.949 (x +-0.738, z +-0.375); two side panels x
   *     +-(0.683..0.726), z -0.353..0.277, y 0..0.896; a modesty panel z -0.353..-0.288 (the back); and a hanging board
   *     x 0.132..0.175, y 0.527..0.896, z -0.288..0.277 (8 tris; the side of the separate drawer unit, which we do not
   *     use) that would stand in the knee hole 0.15 m to the sitter's right: cut (DESK_BOARD). No vertex lies between
   *     0.527 and 0.874, so DESK_LIFT (every vertex above 0.6 down 0.18) stretches and inverts nothing: the top lands at
   *     0.769 (= DESK_TOP), its underside at 0.694, the panels just get shorter. Turned 180 degrees the open side faces
   *     the sitter and the modesty panel the cubicle's front panel. The desk bakes to one walnut: it is placed twice,
   *     the top (DESK_TOP_ONLY) in tan and the panels (DESK_PANELS_ONLY) in a darker tan.
   *   Chair_Office_Base_B (vnb_chair_seat, 204 tris): seat y 0.539..0.600, z -0.255..0.255 (+-0.303 wide); backrest
   *     z -0.311..-0.252, y 0.75..1.092; arm loops at |x| 0.29..0.358 (122 tris: cut, ARMS_B); a thin stub under the
   *     seat from y 0.358 (r 0.031).
   *   Chair_Office_Bottom (vnb_chair_base, 170 tris): star legs y 0.073..0.10, z -0.304..0.367, x +-0.353; hub y
   *     0.184..0.244 (r 0.054), gas column 0.244..0.359 (r 0.042). Placed unlifted and unhulled: the seat's stub slides
   *     into the column, so neither the cubicle nor the hero seat height leaves a gap or an inverted column.
   * Both chair pieces share an origin, placed raw at (x, CHAIR_Y, z): the legs' feet on the floor (no wheels). */
  var DESK_LIFT = [0.6, -0.18];
  var DESK_BOARD = [0.12, 0.5, -0.30, 0.19, 0.90, 0.29];
  var DESK_TOP_ONLY = [[-0.73, -0.01, -0.36, 0.73, 0.90, 0.28]];                          // cuts the panels and the board
  var DESK_PANELS_ONLY = [[-0.74, 0.87, -0.38, 0.74, 0.95, 0.38], DESK_BOARD];            // cuts the top slab and the board
  var ARMS_B = [[0.29, 0.56, -0.30, 0.40, 0.80, 0.30], [-0.40, 0.56, -0.30, -0.29, 0.80, 0.30]];
  var CHAIR_Y = -0.073;
  // raw z of the chair origin in the seat-mark frame: seat front -0.035, backrest front -0.542, back -0.601 (the
  // Kenney chairs: seat front +0.05, upper backrest front about -0.49 in the cubicles)
  var CHAIR_Z = -0.29;
  var SEAT_LIFT = [0.30, -0.052];            // cubicle seat top 0.600 - 0.073 - 0.052 = 0.475 (the extras' seat height)
  var HERO_SEAT_LIFT = [0.30, -0.152];       // hero seat top 0.375 (Roo's butt 0.35..0.38)
  // the chair's black goes to a navy grey on the seat (so it does not dissolve into its ink) and a dark grey on the
  // unhulled star base; the desk's walnut to the office tan (the top) and a darker tan (the panels)
  var CHAIR_SEAT_PAL = { '#2d3038': '#3a4766' }, CHAIR_BASE_PAL = { '#2d3038': '#4a4f5c' };
  var DESK_WOOD = { top: { '#6e4c2e': '#c9a26b' }, panels: { '#6e4c2e': '#a8804f' } };
  // Desk height: the VNB desk lifted to the Kenney desk's top (plan 0.76).
  // Roo's station is built around his seated typing pose as it plays in the game (rAF, a render every tick), measured
  // 2026-11-24 in the chair frame (x left, z forward): pelvis joint 0.549 up / 0.336 back (JG.anim.P.seat), butt
  // 0.35..0.38 at z -0.45..-0.25, thighs up to 0.65, knee tops 0.54..0.58 at z 0.10..0.15, feet on the floor at z
  // 0.2..0.4, gloves 0.59..0.79 at z 0.10..0.25 (x +-0.29), forearms 0.65..0.86. So: an armless chair lowered to seat
  // top 0.375 (HERO_SEAT_LIFT; backrest front at z -0.542), a pull-out keyboard tray in front of his knees (top 0.565,
  // z 0.16..0.42) with the keyboard under his gloves, the desk's front edge at z 0.42 (the tray slides under its top,
  // underside 0.694, between its side panels at x +-0.68), and the monitor through the desk (foot dropped) with its lit
  // face where the shots expect it (centre 1.08 at z 0.825).
  var DESK_TOP = 0.769, HERO_TRAY = 0.565;
  // the hero monitor's lit face in the chair frame (canvas centre, size); the box fallback keeps the Stage 1 numbers
  var HERO_SCREEN = { kit: { y: 1.08, z: 0.825, w: 0.86, h: 0.5375 }, box: { y: 1.08, z: 0.825, w: 0.9, h: 0.56 } };
  var DOOR_X = { closed: [-0.6, 0.6], open: [-1.85, 1.85] };

  JG.scenes.register('office', { build: build });

  function build(kit) {
    var SK = JG.setkit, IN = JG.interior, THREE = kit.THREE, C = SK.colours, rect = SK.rect;
    var root = new THREE.Group();
    root.name = 'set-office';
    var B = SK.builder(kit);
    var WALL = 0xd8d2c4, CARPET = 0x6f7d8c, CEIL = 0xeeeeea, LIFT = 0xb09a6a, STEEL = 0xa9a9b0, MULL = 0x5b6475;
    var NOHULL = { hull: false }, NOCAM = { cam: false }, FABRIC = C.purple;

    // ---------------------------------------------------------------------------------------------- floor, walls, ceiling
    B.box(-10, -0.2, 0, 10, 0, 21.3, CARPET);
    B.box(-3, -0.2, 0, 3, 0.004, 1.3, 0xc9c1b2, NOHULL);                         // stone strip at the lift
    // cutaway planes: one-sided, no ink
    function plane(w, h, m, color, group) {
      B.geo(new THREE.PlaneGeometry(w, h), m, color, { hull: false, group: group || 'main' });
    }
    function at(x, y, z, yaw) { return new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw || 0)); }
    plane(8.8, 3.2, at(-5.6, 1.6, 0, 0), WALL); plane(8.8, 3.2, at(5.6, 1.6, 0, 0), WALL); plane(2.4, 0.7, at(0, 2.85, 0, 0), WALL);
    plane(21, 3.2, at(-10, 1.6, 10.5, PI / 2), WALL); plane(21, 3.2, at(10, 1.6, 10.5, -PI / 2), WALL);
    B.geo(new THREE.PlaneGeometry(20, 21.3).rotateX(PI / 2), at(0, 3.2, 10.65), CEIL, { hull: false });
    // lift portal trim and call buttons (inked boxes on the wall face)
    B.box(-1.38, 0, 0, -1.2, 2.66, 0.07, STEEL); B.box(1.2, 0, 0, 1.38, 2.66, 0.07, STEEL); B.box(-1.38, 2.5, 0, 1.38, 2.66, 0.07, STEEL);
    B.box(1.6, 1.0, 0, 1.78, 1.3, 0.04, 0x3a3f4a); B.box(1.65, 1.17, 0.04, 1.73, 1.25, 0.06, C.yellow, NOHULL);
    // skirting along the side walls
    B.box(-10, 0, 0, -9.94, 0.1, 21, 0x9a9488, NOHULL); B.box(9.94, 0, 0, 10, 0.1, 21, 0x9a9488, NOHULL);
    // ceiling light panels (unlit, facing down)
    for (var lz = 3; lz < 21; lz += 4) [-6, 0, 6].forEach(function (lx) {
      B.geo(new THREE.PlaneGeometry(1.2, 0.6).rotateX(PI / 2), at(lx, 3.19, lz), 0xfffcef, { hull: false, group: 'lights' });
    });

    // ---------------------------------------------------------------------------------------------- lift car (hidden from outside)
    var CAR = { group: 'car', hull: false };
    B.geo(new THREE.PlaneGeometry(2.6, 2.6), at(0, 1.3, -2.4, 0), LIFT, CAR);                // back, faces +Z
    B.geo(new THREE.PlaneGeometry(2.4, 2.6), at(-1.3, 1.3, -1.2, PI / 2), LIFT, CAR);        // left, faces +X
    B.geo(new THREE.PlaneGeometry(2.4, 2.6), at(1.3, 1.3, -1.2, -PI / 2), LIFT, CAR);        // right, faces -X
    B.geo(new THREE.PlaneGeometry(2.6, 2.4).rotateX(PI / 2), at(0, 2.6, -1.2), 0xe8e2d0, CAR); // ceiling, faces down
    B.geo(new THREE.PlaneGeometry(0.1, 2.6), at(-1.25, 1.3, -0.02, PI), STEEL, CAR);          // front frame, faces -Z
    B.geo(new THREE.PlaneGeometry(0.1, 2.6), at(1.25, 1.3, -0.02, PI), STEEL, CAR);
    B.geo(new THREE.PlaneGeometry(2.6, 0.1), at(0, 2.55, -0.02, PI), STEEL, CAR);
    B.box(-1.3, -0.2, -2.4, 1.3, 0.004, 0, 0x8b7d62, { group: 'car' });
    B.box(-1.2, 0.9, -2.36, 1.2, 0.95, -2.3, STEEL, { group: 'car' });                         // handrail
    B.box(-1.26, 0.9, -2.3, -1.2, 0.95, -0.3, STEEL, { group: 'car' }); B.box(1.2, 0.9, -2.3, 1.26, 0.95, -0.3, STEEL, { group: 'car' });
    B.box(0.95, 1.0, -0.12, 1.2, 1.5, -0.04, 0x3a3f4a, { group: 'car' });                      // panel by the doors
    B.box(-1.25, 2.2, -2.39, 1.25, 2.3, -2.35, C.brass, { group: 'car', hull: false });

    // ---------------------------------------------------------------------------------------------- window wall
    B.box(-10, 0, 21, 10, 0.3, 21.25, MULL); B.box(-10, 2.8, 21, 10, 3.2, 21.25, MULL);
    for (var mx = -10; mx <= 10.01; mx += 2) B.box(mx - 0.06, 0.3, 21.02, mx + 0.06, 2.8, 21.22, MULL);
    B.box(-10, 0.28, 20.85, 10, 0.34, 21.0, 0xbfb8a8);                                          // sill

    // ---------------------------------------------------------------------------------------------- furniture
    // Kit pieces (kit-office.glb) merged into the static groups like the city kit; boxes if the GLB is missing.
    // CR: the workstation dressing's stream (its sequence fixes the 'before' clutter and chair layout); CR2: the VNB
    // pieces added later draw from their own stream, so CR's sequence stays as it was
    var CR = JG.rng(5601), CR2 = JG.rng(5602);
    var STICKY = [0xffe45c, 0xff9fbf, 0x9fd8ff, 0xbdf08f], MUGS = [0xf4f1e8, C.blue, C.yellow, 0xd6333f, C.magenta, 0x3f7a5a];
    var PLANTS_SMALL = ['of_plant_small', 'of_plant_small2', 'of_plant_small3'];
    var K = IN.officeKit(kit);
    var chairBounds = [];                     // the cubicle chairs' world bounds (chair(); debug.chairs: the walk-rect check)
    var coffeeBounds = null;                  // the placed coffee machine's world bounds (office-props.js builds on it)
    if (K) furnish(K); else boxFurniture();
    // the hero chair (heroChair): its own builder; the box fallback keeps it in the instanced chairs
    var chairRoot = new THREE.Group(), chairK = 1;
    chairRoot.name = 'office-hero-chair';
    root.add(chairRoot);
    if (K) {
      var CB = SK.builder(kit);
      chair(CB, 0, CHAIR_Z, 0, { lift: HERO_SEAT_LIFT });
      CB.build(chairRoot);
    }

    // ---------------------------------------------------------------------------------------------- dressing
    // cubicle panels
    PANELS.forEach(function (p) {
      var x0 = p[0], z0 = p[1], x1 = p[2], z1 = p[3], ex = x1 - x0 < 0.2 ? 0.012 : 0, ez = z1 - z0 < 0.2 ? 0.012 : 0;
      B.box(x0 + ex, 0, z0 + ez, x1 - ex, 0.07, z1 - ez, 0x4a4f5c, { hull: false, cam: false });
      B.box(x0, 0.07, z0, x1, 1.2, z1, FABRIC, NOCAM);
      B.box(x0 - ex, 1.2, z0 - ez, x1 + ex, 1.245, z1 + ez, C.trim, NOCAM);
    });
    islandEnds();
    // the hero desk: a paper stack and a cup (before); the other desks are dressed in workstation()
    var htop = !K ? 0.76 : DESK_TOP, hpx = HERO[0] + (K ? 0.58 : -0.55), hpz = HERO[1] + (K ? 1.06 : 0.85);
    var hcx = K ? HERO[0] - 0.42 : hpx + 0.26, hcz = K ? HERO[1] + 0.62 : hpz;
    B.box(hpx - 0.15, htop, hpz - 0.1, hpx + 0.15, htop + 0.15, hpz + 0.11, 0xf4f1e8, { group: 'before' });
    B.box(hcx - 0.04, htop, hcz - 0.04, hcx + 0.04, htop + 0.1, hcz + 0.04, 0xffffff, { group: 'before' });
    B.box(-8.5, 0, 11.6, -8.1, 0.3, 11.9, 0xf4f1e8, { group: 'before' });                       // a dropped binder
    // the stations of office-walk (office-props.js): the face scanner kiosk, the water cooler at the island's lift-side
    // end, the coffee machine's button, screen, mug and steam (static parts merged here; moving parts their own meshes);
    // the mug Roo brings to the hero desk (front left of the monitor as he sits, in the desk-sit side shot)
    var props = JG.officeProps ? JG.officeProps.build(kit, B, root, { coffee: coffeeBounds, deskMug: [HERO[0] + 0.34, htop, HERO[1] + 0.5] }) : null;
    // dashboard frame on the west wall
    B.box(-9.98, 1.42, 9.6, -9.9, 2.78, 12.4, 0x1d2230);
    // whiteboard on the east wall: frame, board, tray and a marker chart (no kit piece)
    B.box(9.9, 0.98, 5.0, 9.98, 2.12, 7.2, 0xb8bcc4); B.box(9.88, 1.02, 5.04, 9.9, 2.08, 7.16, 0xfbfaf6, NOHULL);
    B.box(9.8, 0.96, 5.1, 9.98, 1.0, 7.1, 0xb8bcc4);
    // 2026-11-28: the marker chart is now a drawn plane on the board: "NUMBER GO UP!" over a rising line graph (see below)

    // ---------------------------------------------------------------------------------------------- skyline outside (no ink)
    var rng = kit.rng, cols = [C.dusty, C.purple, C.brick, C.slate, 0x9aa3bf];
    for (var i = 0; i < 64; i++) {
      var x = -230 + rng() * 460, z = 45 + rng() * 260, w = 14 + rng() * 24, d = 14 + rng() * 22, top = -60 + rng() * 105;
      if (Math.abs(x) < 26 && z < 70) z += 40;
      var col = cols[Math.floor(rng() * cols.length)];
      B.box(x - w / 2, -200, z - d / 2, x + w / 2, top, z + d / 2, col, { group: 'sky', hull: false });
      if (rng() < 0.5) B.box(x - w * 0.3, top, z - d * 0.3, x + w * 0.3, top + 6 + rng() * 14, z + d * 0.3, col, { group: 'sky', hull: false });
    }
    B.box(-600, -205, 22, 600, -200, 700, 0x6c7486, { group: 'sky', hull: false });

    // ---------------------------------------------------------------------------------------------- camera colliders
    // The follow camera stays inside the room: the cutaway planes are not colliders by themselves (flat), so the room
    // shell is given as solid slabs (the lift wall whole, doorway included: its trim, header and floor display sit on
    // it); desks, monitors, shelves, cabinets and planters are recorded by the builder (furnish: cam true; boxFurniture adds
    // the box desks' colliders itself).
    B.collider(-10.5, -0.2, -0.6, 10.5, 3.6, 0);           // lift wall
    B.collider(-10.6, -0.2, -0.6, -10, 3.6, 21.6);          // west wall
    B.collider(10, -0.2, -0.6, 10.6, 3.6, 21.6);            // east wall
    B.collider(-10.6, -0.2, 21, 10.6, 3.6, 21.6);           // window wall
    B.collider(-10.6, 3.2, -0.6, 10.6, 3.6, 21.6);          // ceiling

    var meshes = B.build(root);
    if (K) K.dispose(); else instancedBoxes();
    if (meshes.lights) meshes.lights.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide });

    // ---------------------------------------------------------------------------------------------- lift doors
    var doorMat = kit.mat.toon({ color: STEEL }), ink = kit.mat.ink();
    function door(x) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 0.06), doorMat);
      m.position.set(x, 1.25, -0.05);
      var h = new THREE.Mesh(new THREE.BoxGeometry(1.2 + 2 * SK.T, 2.5 + 2 * SK.T, 0.06 + 2 * SK.T), ink);
      h.userData.jgHull = true; m.add(h);
      root.add(m);
      return m;
    }
    var doorL = door(DOOR_X.closed[0]), doorR = door(DOOR_X.closed[1]);

    // ---------------------------------------------------------------------------------------------- displays (floor numbers)
    var disp = SK.canvasPlane(kit, 0.62, 0.3, 128, 64);
    disp.mesh.position.set(0, 2.9, 0.08); root.add(disp.mesh);
    var dispIn = new THREE.Mesh(disp.mesh.geometry, disp.mesh.material);
    // z -0.12: in front of the closed doors (z -0.08..-0.02, plus their ink), so the car's display shows from inside
    dispIn.position.set(0, 2.3, -0.12); dispIn.rotation.y = PI; root.add(dispIn);
    var floorVal = 56, floorShown = null;
    var floorProxy = { get v() { return floorVal; }, set v(x) { floorVal = x; } };
    function drawFloor() {
      var f = Math.max(1, Math.min(56, Math.round(floorVal)));
      if (f === floorShown) return;
      floorShown = f;
      disp.draw(function (c, w, h) {
        c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#FFD21F'; c.font = '44px ' + SK.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(f), w / 2 + 10, h / 2 + 2);
        c.beginPath(); c.moveTo(18, 40); c.lineTo(30, 22); c.lineTo(42, 40); c.closePath(); c.fill();
      });
    }

    // ---------------------------------------------------------------------------------------------- hero monitor
    var hs = HERO_SCREEN[K ? 'kit' : 'box'];
    var mon = SK.canvasPlane(kit, hs.w, hs.h, 480, 300);
    mon.mesh.position.set(HERO[0], hs.y, HERO[1] + hs.z); mon.mesh.rotation.y = PI;
    root.add(mon.mesh);
    var monT = 1;
    function drawMonitor() {
      mon.draw(function (ctx, w, h) {
        var ui = JG.ui;
        if (state.monitor !== 'off' && ui && ui.radar && ui.radar.drawMonitor) {
          try { ui.radar.drawMonitor(ctx, w, h, state.monitor); return; } catch (e) { JG.error('radar.drawMonitor', e); }
        }
        if (state.monitor === 'off') {
          ctx.fillStyle = '#0d0f14'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(w * 0.55, 0); ctx.lineTo(w * 0.75, 0); ctx.lineTo(w * 0.35, h); ctx.lineTo(w * 0.15, h); ctx.fill();
        } else { ctx.fillStyle = '#f6f7fb'; ctx.fillRect(0, 0, w, h); }
      });
    }

    // ---------------------------------------------------------------------------------------------- whiteboard marker drawing
    // transparent plane just in front of the board face (x 9.88), facing -X into the room; local +x is the viewer's right
    var wb = SK.canvasPlane(kit, 2.0, 1.0, 1024, 512);
    wb.mesh.material.transparent = true; wb.mesh.material.depthWrite = false; wb.mesh.renderOrder = 1;
    wb.mesh.position.set(9.873, 1.55, 6.12); wb.mesh.rotation.y = -PI / 2; wb.mesh.name = 'office-whiteboard'; root.add(wb.mesh);
    wb.draw(function (c, w, h) {
      c.clearRect(0, 0, w, h);
      c.lineCap = 'round'; c.lineJoin = 'round'; c.textAlign = 'center'; c.textBaseline = 'middle';
      // headline in blue marker
      var txt = 'NUMBER GO UP!', fs = 120;
      c.font = fs + 'px ' + SK.FONT;
      while (c.measureText(txt).width > w * 0.9 && fs > 40) { fs -= 4; c.font = fs + 'px ' + SK.FONT; }
      c.save(); c.translate(w * 0.5, h * 0.2); c.rotate(-0.025);
      c.fillStyle = '#1F4FD8'; c.fillText(txt, 0, 0);
      c.restore();
      // axes in black marker
      c.strokeStyle = '#111'; c.lineWidth = 9;
      c.beginPath(); c.moveTo(w * 0.1, h * 0.42); c.lineTo(w * 0.1, h * 0.9); c.lineTo(w * 0.92, h * 0.9); c.stroke();
      // the line goes up (red marker), with a wobble and an arrow head
      var pts = [[0.14, 0.82], [0.26, 0.77], [0.37, 0.8], [0.5, 0.65], [0.6, 0.68], [0.74, 0.55], [0.82, 0.57], [0.9, 0.46]];
      c.strokeStyle = '#d6333f'; c.lineWidth = 14;
      c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0] * w, p[1] * h); else c.moveTo(p[0] * w, p[1] * h); }); c.stroke();
      var a = pts[pts.length - 1], b = pts[pts.length - 2], ang = Math.atan2((a[1] - b[1]) * h, (a[0] - b[0]) * w), L = 58;
      c.beginPath();
      c.moveTo(a[0] * w + Math.cos(ang) * 14, a[1] * h + Math.sin(ang) * 14);
      c.lineTo(a[0] * w + Math.cos(ang + 2.5) * L, a[1] * h + Math.sin(ang + 2.5) * L);
      c.moveTo(a[0] * w + Math.cos(ang) * 14, a[1] * h + Math.sin(ang) * 14);
      c.lineTo(a[0] * w + Math.cos(ang - 2.5) * L, a[1] * h + Math.sin(ang - 2.5) * L);
      c.stroke();
    });

    // ---------------------------------------------------------------------------------------------- wall dashboard
    var dash = SK.canvasPlane(kit, 2.7, 1.25, 512, 236);
    dash.mesh.position.set(-9.89, 2.1, 11); dash.mesh.rotation.y = PI / 2; root.add(dash.mesh);

    // ---------------------------------------------------------------------------------------------- window glass
    var glassMat = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.22, depthWrite: false });
    var gparts = [];
    for (var gx = -10; gx < 10; gx += 2) if (gx !== 4) gparts.push({ geometry: new THREE.PlaneGeometry(2, 2.5), matrix: at(gx + 1, 1.55, 21.1, PI) });
    var gg = kit.geo.merge(gparts); ['skinIndex', 'skinWeight', 'color'].forEach(function (a) { gg.deleteAttribute(a); });
    gparts.forEach(function (p) { p.geometry.dispose(); });
    var glass = new THREE.Mesh(gg, glassMat); glass.name = 'office-glass'; glass.renderOrder = 2; root.add(glass);
    var pane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), glassMat);
    pane.position.set(5, 1.55, 21.1); pane.rotation.y = PI; pane.renderOrder = 2; pane.name = 'office-pane'; root.add(pane);
    var holeTex = kit.tex.canvas(256, 320, function (c, w, h) { IN.drawBrokenPane(c, w, h, w / 2, h * (1 - (1.2 - 0.3) / 2.5)); });
    var broken = new THREE.Group(); broken.name = 'office-broken';
    var holeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide }));
    holeMesh.position.copy(pane.position); holeMesh.rotation.y = PI; holeMesh.renderOrder = 2; broken.add(holeMesh);
    var shardMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff, side: THREE.DoubleSide });
    var shardParts = [];
    for (var s = 0; s < 14; s++) {
      var sg = new THREE.BufferGeometry();
      var r = 0.06 + rng() * 0.1;
      sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, r, 0, r * 0.3, r * 0.2, 0, r], 3));
      sg.computeVertexNormals();
      shardParts.push({ geometry: sg, matrix: at(3.9 + rng() * 2.2, 0.01, 19.6 + rng() * 1.2, rng() * PI * 2) });
    }
    var shg = kit.geo.merge(shardParts); ['skinIndex', 'skinWeight', 'color'].forEach(function (a) { shg.deleteAttribute(a); });
    broken.add(new THREE.Mesh(shg, shardMat));
    root.add(broken);

    // ---------------------------------------------------------------------------------------------- furniture helpers
    /* desk(Pf, x, minZ): a VNB desk turned to face the seat (open side towards the sitter), its front edge at minZ
     * (Pf: a placing function, P of furnish or of a workstation); both halves placed raw (their cut bounds differ),
     * the panels' half is the camera collider */
    function desk(Pf, x, minZ) {
      var o = { raw: true, rot: 180, x: x, y: 0, z: minZ + 0.375, lift: DESK_LIFT };
      Pf('vnb_desk', Object.assign({ cut: DESK_TOP_ONLY, palette: DESK_WOOD.top }, o));
      Pf('vnb_desk', Object.assign({ cut: DESK_PANELS_ONLY, palette: DESK_WOOD.panels, cam: true }, o));
    }
    /* chair(Bt, x, z, rot, o): a VNB office chair (seat with its arm loops cut, hulled; star base, unhulled) into
     * builder Bt with its origin at (x, z) (raw, degrees rot), in o.frame if given; o.lift: the seat's lift (default
     * SEAT_LIFT), o.group */
    function chair(Bt, x, z, rot, o) {
      o = o || {};
      var p = { raw: true, x: x, y: CHAIR_Y, z: z, rot: rot || 0, group: o.group, frame: o.frame };
      var a = K.place(Bt, 'vnb_chair_seat', Object.assign({ lift: o.lift || SEAT_LIFT, cut: ARMS_B, palette: CHAIR_SEAT_PAL }, p));
      var b = K.place(Bt, 'vnb_chair_base', Object.assign({ hull: false, palette: CHAIR_BASE_PAL }, p));
      if (a && b && Bt === B) chairBounds.push({ group: o.group || 'main', min: [0, 1, 2].map(function (k) { return Math.min(a.min[k], b.min[k]); }), max: [0, 1, 2].map(function (k) { return Math.max(a.max[k], b.max[k]); }) });
    }
    /* chairMinZ(minZ, rot): the origin z that puts a cubicle chair turned rot degrees with its union bounds' (seat and
     * base) back at minZ */
    function chairMinZ(minZ, rot) {
      var a = K.geo('vnb_chair_seat', { lift: SEAT_LIFT, cut: ARMS_B, palette: CHAIR_SEAT_PAL }).boundingBox;
      var b = K.geo('vnb_chair_base', { palette: CHAIR_BASE_PAL }).boundingBox;
      var x0 = Math.min(a.min.x, b.min.x), x1 = Math.max(a.max.x, b.max.x), z0 = Math.min(a.min.z, b.min.z), z1 = Math.max(a.max.z, b.max.z);
      var r = rot * PI / 180, sn = Math.sin(r), cs = Math.cos(r), m = Infinity;
      [[x0, z0], [x0, z1], [x1, z0], [x1, z1]].forEach(function (q) { m = Math.min(m, -q[0] * sn + q[1] * cs); });
      return minZ - m;
    }
    /* furnish(K): kit-office pieces. Desks (desk()): front edge 0.25 m ahead of the seat; screen, keyboard and mouse on
     * it; the chair's seat front 0.035 m behind the seat mark (the extras sit 0.31 m behind it). */
    function furnish(K) {
      var CAM = { cam: true };
      function P(name, o) { return K.place(B, name, o); }
      // the bookshelves' walnut goes to the desks' tan (the frame) and a darker tan (back and shelves)
      var SHELF_WOOD = { '#6e4c2e': '#c9a26b', '#8a6642': '#a8804f' };
      // the paintings' canvas bakes to a soft three-colour gradient (photo texture sampled per vertex): it is made one
      // flat colour here (the inner frame bevel goes to the frame's brown) and artCard() paints flat shapes on it
      var CANVAS = {
        sky: { '#e07a4f': '#9fc3e0', '#f4f1e8': '#9fc3e0', '#c24a7e': '#6e4c2e' },
        cream: { '#e07a4f': '#f4f1e8', '#9fc3e0': '#f4f1e8', '#c24a7e': '#6e4c2e' }
      };
      /* artCard(bounds, yaw, kind): flat comic art on a placed vnb_painting (canvas 1.07 x 0.518, 11 mm behind the
       * frame's face; yaw 0 faces +Z, PI / 2 faces +X): 'hills' (a sun and two hills on sky) or 'blocks' (a magenta
       * block, a mustard disc and a blue bar on cream). Unhulled, a few mm in front of the canvas. */
      function artCard(bb, yaw, kind) {
        if (!bb) return;
        var cy = (bb.min[1] + bb.max[1]) / 2;
        var F = yaw ? at(bb.max[0] - 0.009, cy, (bb.min[2] + bb.max[2]) / 2, yaw) : at((bb.min[0] + bb.max[0]) / 2, cy, bb.max[2] - 0.009, 0);
        var W = 0.535, H = 0.259;
        function shape(g, color, dz) { B.geo(g.translate(0, 0, dz), F.clone(), color, { hull: false }); }
        function poly(pts, color, dz) {
          var s = new THREE.Shape(); s.moveTo(pts[0], pts[1]);
          for (var k = 2; k < pts.length; k += 2) s.lineTo(pts[k], pts[k + 1]);
          shape(new THREE.ShapeGeometry(s), color, dz);
        }
        if (kind === 'hills') {
          shape(new THREE.CircleGeometry(0.1, 14).translate(0.24, 0.08, 0), 0xf2c14e, 0.002);
          poly([-W, -H, 0.12, -H, -0.22, 0.13], 0x2f56b8, 0.003);
          poly([-0.08, -H, W, -H, W, -0.02, 0.3, 0.05], 0xd9603b, 0.004);
        } else {
          shape(new THREE.PlaneGeometry(0.3, 0.36).translate(-0.26, 0.0, 0), 0xc24a7e, 0.002);
          shape(new THREE.CircleGeometry(0.11, 14).translate(0.2, 0.07, 0), 0xf2c14e, 0.003);
          shape(new THREE.PlaneGeometry(0.52, 0.07).translate(0.12, -0.16, 0), 0x2f56b8, 0.004);
        }
      }
      /* shelfBooks(dir, x, z): books inside a vnb_bookshelf (dir 1: the east wall's, facing -X; -1: the west wall's,
       * facing +X; x, z: its centre; shelf tops at 0.502, 0.941 and 1.38): a blue and a red binder on the top shelf
       * (the binders bake white), book piles on the two below (unhulled) */
      function shelfBooks(dir, x, z) {
        var r = dir > 0 ? -90 : 90;
        P('vnb_binders', { rot: r, x: x, z: z - 0.3 * dir, y: 1.38, palette: { '#ebe6da': '#4f86b8' }, hull: false });
        P('vnb_binders', { rot: r + 7, x: x, z: z + 0.3 * dir, y: 1.38, palette: { '#ebe6da': '#a8402a' }, hull: false });
        P('vnb_books1', { rot: r - 4, x: x, z: z + 0.18 * dir, y: 0.941, hull: false });
        P('vnb_books2', { rot: r + 6, x: x, z: z - 0.2 * dir, y: 0.502, hull: false });
      }
      SEATS.forEach(function (s, i) { workstation(K, s, i); });
      // the hero station (see the note at DESK_TOP): lowered armless chair (its own mesh: heroChair), keyboard tray,
      // the monitor through the desk
      var hx = HERO[0], hz = HERO[1];
      desk(P, hx, hz + 0.42);
      B.box(hx - 0.38, HERO_TRAY - 0.02, hz + 0.16, hx + 0.38, HERO_TRAY, hz + 0.72, 0x3a3f4a);      // tray
      [-1, 1].forEach(function (k) { B.box(hx + k * 0.35 - 0.015, HERO_TRAY, hz + 0.5, hx + k * 0.35 + 0.015, 0.65, hz + 0.7, 0x5b606b); });
      P('of_keyboard', { rot: 180, scale: 1.25, x: hx, minZ: hz + 0.17, y: HERO_TRAY });
      P('of_mouse', { rot: 180, x: hx - 0.33, z: hz + 0.3, y: HERO_TRAY });
      // monitor: faces +X in the kit; turned to face Roo, lit face at z 0.825, panel (0.13..0.68 in the piece) centred
      // at 1.08; its foot (below 0.08) is dropped and the neck goes into the desk like a grommet mount
      P('of_monitor', Object.assign({ raw: true, rot: 90, drop: 0.08, x: hx, y: 1.08 - 0.405, z: hz + 0.826 + 0.014 }, CAM));
      // the desk lamp stands in plain view at the desk's front corner on Roo's right (behind the monitor it poked out
      // past the bezel in desk-sit as a black bracket); mustard, so it reads as a lamp and not a post
      P('vnb_desk_lamp', { rot: 150, scale: 0.8, x: hx - 0.64, z: hz + 0.56, y: DESK_TOP, palette: { '#6b7280': '#f2c14e' } });
      P('of_plant_small', { x: hx + 0.6, z: hz + 0.62, y: DESK_TOP, group: 'after' });
      P('vnb_bin', { rot: 180, x: hx - 1.0, z: hz + 0.6 });
      P('vnb_pc', { rot: 180, x: hx - 0.57, z: hz + 0.8, hull: false });     // inside the desk's side panel (x -0.683)

      // plants (VNB): vases and bamboo planters in terracotta pots (POT: the planter body bakes to the vnb palette's
      // ink-dark #2d3038, which the clock ticks keep; its top becomes soil), healthy in 'after', sickly in 'before'
      // (WILT: the two greens of the vnb palette go yellow-green; upright, so they still read as plants; the bamboo
      // loses some height)
      var WILT = { '#6fae5a': '#a3a64a', '#5fa65a': '#a3a64a' };
      var POT = { '#2d3038': '#b5603a', '#6fae5a': '#6b3f22' }, VASE = { '#ebe6da': '#b5603a' };
      var VASE_WILT = Object.assign({}, VASE, WILT);
      // vases: by the kitchenette, west of the lift (the break corner's edge, clear of walk rect 1's x -5.6), at the
      // west aisle's edge (clear of rect 3's x -3.6), in the lounge corner
      [[9.45, 0.75], [-6.3, 0.42], [-4.3, 7.0], [-9.5, 20.45]].forEach(function (p, i) {
        P('vnb_vase', { x: p[0], z: p[1], rot: i * 67, palette: VASE, group: 'after', hull: false });
        P('vnb_vase', { x: p[0], z: p[1], rot: i * 67, scale: 0.9, palette: VASE_WILT, group: 'before', hull: false });
      });
      // bamboo planters [x, z, rot, planter]: by the lift (both sides), the east wall before the shelves, the east window
      // corner, low ones under two window bays (clear of the dive bay x 4..6 and office.windowRun)
      [[5.2, 0.17, 90], [-9.3, 0.17, 90], [9.69, 9.68, 0], [9.6, 19.9, 0],
        [-5.5, 20.69, 90, 'vnb_planter_low'], [8.0, 20.69, 90, 'vnb_planter_low']].forEach(function (p) {
        P(p[3] || 'vnb_planter', Object.assign({ x: p[0], z: p[1], rot: p[2], palette: POT }, CAM));
        P('vnb_bamboo', { x: p[0], z: p[1], rot: p[2], hull: false, group: 'after' });
        P('vnb_bamboo', { x: p[0], z: p[1], rot: p[2], scale: 0.85, palette: WILT, hull: false, group: 'before' });
      });
      // east wall: kitchenette (counters, coffee machine, microwave, cups, a plate of donuts, the clock above),
      // printer station, (whiteboard: boxes), shelves and a cupboard; all face -X (into the room)
      P('of_counter', { rot: -90, maxX: 9.98, z: 1.55 });
      P('of_counter', { rot: -90, maxX: 9.98, z: 2.41 });
      // the coffee machine at the counter's front edge (a station in office-walk: office-props.js), the microwave by the wall
      coffeeBounds = P('vnb_coffee_machine', { rot: -90, minX: 9.10, z: 2.50, y: 0.9 });
      P('vnb_microwave', { rot: -90, maxX: 9.95, z: 1.38, y: 0.9 });
      [[9.32, 1.78], [9.4, 1.88], [9.3, 1.93]].forEach(function (c) { P('vnb_cup', { x: c[0], z: c[1], y: 0.9, hull: false }); });
      P('vnb_plate', { x: 9.55, z: 2.0, y: 0.9, hull: false });
      P('vnb_donut', { rot: 20, x: 9.5, z: 1.97, y: 0.912, hull: false }); P('vnb_donut', { rot: 70, x: 9.6, z: 2.06, y: 0.912, group: 'after', hull: false });
      var clk = P('vnb_clock', { rot: -90, maxX: 9.99, z: 1.95, y: 2.05 });
      if (clk && K.has('vnb_clock_hand')) [[0.96, 0.62], [-1.05, 1]].forEach(function (h) {      // ten past ten
        var hand = K.geo('vnb_clock_hand'), hb = hand.boundingBox, cy = (clk.min[1] + clk.max[1]) / 2, cz = (clk.min[2] + clk.max[2]) / 2;
        B.geo(hand, at(clk.min[0] - 0.012, cy, cz, -PI / 2).multiply(new THREE.Matrix4().makeRotationZ(h[0]))
          .multiply(new THREE.Matrix4().makeScale(1, h[1], 1))
          .multiply(new THREE.Matrix4().makeTranslation(-(hb.min.x + hb.max.x) / 2, -0.012 - hb.min.y, -(hb.min.z + hb.max.z) / 2)),
          undefined, { hull: false, dispose: false });
      });
      // the printer station (was the MrEliptik copier, 1490 triangles): a low cabinet, the printer, paper beside it
      P('vnb_cabinet', Object.assign({ rot: -90, maxX: 9.98, z: 3.95 }, CAM));
      P('vnb_printer', { rot: -90, maxX: 9.96, z: 3.9, y: 0.76 });
      B.box(9.5, 0.76, 4.22, 9.78, 0.84, 4.32, 0xf4f1e8, NOHULL);
      P('of_shelf', Object.assign({ rot: -90, maxX: 9.98, minZ: 10.2 }, CAM));
      P('of_cupboard', Object.assign({ rot: -90, maxX: 9.98, minZ: 11.1 }, CAM));
      P('of_shelf', Object.assign({ rot: -90, maxX: 9.98, minZ: 12.0 }, CAM));
      P('of_books', { rot: -90, maxX: 9.9, z: 10.55, y: 1.936 }); P('of_books', { rot: -90, maxX: 9.9, z: 12.45, y: 1.936 });
      P('vnb_books2', { rot: -80, x: 9.6, z: 11.5, y: 1.87, hull: false });
      P('of_box', { rot: -78, x: 9.55, z: 13.3 }); P('of_box', { rot: -96, x: 9.6, z: 13.3, y: 0.562, group: 'before' });
      // east wall by the hero row: a bookshelf with book piles, an air conditioner and a vent high up
      P('vnb_bookshelf', Object.assign({ rot: -90, maxX: 9.98, z: 17.0, palette: SHELF_WOOD }, CAM));
      P('vnb_books1', { rot: -95, x: 9.68, z: 16.85, y: 1.84, hull: false }); P('vnb_binders', { rot: -90, x: 9.7, z: 17.3, y: 1.84, hull: false });
      shelfBooks(1, 9.7, 17.0);
      P('vnb_ac', { rot: -90, maxX: 9.99, z: 15.6, y: 2.55 });
      P('vnb_vent', { rot: -90, maxX: 9.99, z: 13.6, y: 2.45, hull: false });
      // west wall: filing cabinets between the desk rows (a printer and binders on top), one by the lounge; a
      // bookshelf and an air conditioner by the lift
      [6.25, 6.85, 7.45, 16.8].forEach(function (z) { P('vnb_filecab', Object.assign({ rot: 90, minX: -9.98, z: z }, CAM)); });
      P('vnb_books1', { rot: 80, x: -9.7, z: 6.85, y: 1.05, hull: false });
      P('vnb_binders', { rot: 90, minX: -9.9, z: 6.12, y: 1.05, hull: false }); P('vnb_binders', { rot: 84, minX: -9.88, z: 6.3, y: 1.05, hull: false });
      P('vnb_books2', { rot: 100, x: -9.7, z: 7.45, y: 1.05, group: 'before', hull: false });
      P('vnb_bookshelf', Object.assign({ rot: 90, minX: -9.98, z: 1.6, palette: SHELF_WOOD }, CAM));
      P('vnb_books1', { rot: 85, x: -9.68, z: 1.45, y: 1.84, hull: false });
      shelfBooks(-1, -9.7, 1.6);
      P('vnb_ac', { rot: 90, minX: -9.99, z: 3.4, y: 2.55 });
      P('vnb_vent', { rot: 90, minX: -9.99, z: 13.6, y: 2.45, hull: false });
      // lift wall: paintings either side, a coat rack by the lift
      artCard(P('vnb_painting', { minZ: 0.005, x: 7.6, y: 1.25, palette: CANVAS.cream }), 0, 'blocks');
      artCard(P('vnb_painting', { minZ: 0.005, x: -7.1, y: 1.3, palette: CANVAS.sky }), 0, 'hills');
      // break corner west of the lift (outside the walk rects): a cafe table, three chairs, coffee cups
      var CT = P('vnb_cafe_table', { x: -7.1, z: 2.0 });
      P('vnb_cafe_chair', { rot: 4, x: -7.1, maxZ: 1.62 }); P('vnb_cafe_chair', { rot: 172, x: -7.05, minZ: 2.4 });
      P('vnb_cafe_chair', { rot: 96, maxX: -7.42, z: 2.05 });
      if (CT) { P('vnb_cup', { x: -7.25, z: 1.88, y: CT.max[1], hull: false }); P('vnb_cup', { x: -6.95, z: 2.15, y: CT.max[1], hull: false }); }
      P('of_coat_rack', { x: 3.5, z: 0.55 });
      // lounge by the window (west): sofa against the wall under a painting, an armchair, rug, coffee table with a
      // laptop and donuts, floor lamp; not walkable (walk rects)
      P('of_rug', { rot: 90, x: -8.3, z: 18.45, hull: false });
      P('vnb_sofa', { rot: 90, minX: -9.98, z: 18.45 });
      artCard(P('vnb_painting', { rot: 90, minX: -9.995, z: 18.45, y: 1.3, palette: CANVAS.sky }), PI / 2, 'hills');
      P('vnb_armchair', { rot: 180, x: -8.05, maxZ: 20.75 });
      P('vnb_coffee_table', { rot: 90, x: -8.15, z: 18.45, y: 0.02 });
      P('of_laptop', { rot: -70, x: -8.1, z: 18.0, y: 0.34 });
      P('vnb_plate', { x: -8.12, z: 18.9, y: 0.34, hull: false }); P('vnb_donut', { rot: 40, x: -8.15, z: 18.88, y: 0.352, hull: false });
      P('vnb_floor_lamp', { x: -9.55, z: 19.75 });
    }
    /* workstation(K, s, i): one desk with screen, keyboard and mouse, its chair and its dressing, built in the seat's
     * frame (seat mark at the origin, facing +Z; local +X is the sitter's left). The chair: tucked in (after) or
     * shoved and swivelled (before; only one mood group is ever visible, so this costs no rendered triangles); one
     * chair in both moods where an extra sits (TAKEN). Dressing:
     *   always  the screen showing a page (lines; a red alert bar before, green after), a sheet pinned to the panel
     *   before  two paper stacks and loose sheets (one over the keyboard), a mug and maybe a tipped one, crumpled
     *           paper on the desk and the floor, sticky notes all over the panel, a bin or an open box on the floor
     *   after   one neat stack, a mug, a small plant (two desks in three), two sticky notes in a row
     * Sheets, notes and screen cards are unhulled; the dressing draws from its own rng stream (the skyline keeps
     * kit.rng's sequence). */
    function workstation(K, s, i) {
      var F = at(s[0], 0, s[1], s[2]), open = s[3] === 'open', taken = TAKEN[s[0] + ',' + s[1]] || 0;
      var T = DESK_TOP, pS = CR() < 0.5 ? 1 : -1, PANEL_Z = 1.074;
      function P(name, o) { return K.place(B, name, Object.assign({ frame: F }, o)); }
      function G(geo, x, y, z, yaw, color, o) { B.geo(geo, F.clone().multiply(at(x, y, z, yaw)), color, o); }
      function card(w, h, x, y, z, roll, color, group) {          // a flat card facing the sitter (-Z)
        var g = new THREE.PlaneGeometry(w, h); if (roll) g.rotateZ(roll);
        G(g, x, y, z, PI, color, { hull: false, group: group || 'main' });
      }
      function paper(x, z, yaw, h, group, y) {                      // a sheet lying flat, or a stack h tall
        G(new THREE.BoxGeometry(0.22, h, 0.3), x, (y === undefined ? T : y) + h / 2, z, yaw, 0xf4f1e8, { hull: false, group: group });
      }
      function mug(x, z, group, tipped) {
        var g = kit.geo.cyl(0.04, 0.036, 0.1, 6);
        if (tipped) g.translate(0, -0.05, 0).rotateZ(PI / 2).translate(0, 0.04, 0);
        G(g, x, T, z, CR() * PI, MUGS[Math.floor(CR() * MUGS.length)], { group: group });
      }
      function ball(x, y, z) { G(new THREE.IcosahedronGeometry(0.035, 0), x, y + 0.03, z, CR() * PI, 0xf4f1e8, { hull: false, group: 'before' }); }
      // furniture
      desk(P, 0, 0.25);
      P('of_screen', { rot: 180, x: 0, minZ: 0.66, y: T, cam: true });
      P('of_keyboard', { rot: 180, x: 0, minZ: 0.35, y: T, hull: false });
      G(new THREE.BoxGeometry(0.06, 0.03, 0.1), 0.38, T + 0.015, 0.45, 0, 0x5b606b, { hull: false });   // mouse
      // the before chair's back (its turned union bounds) never goes past 0.62 m behind the seat (walk rects and island
      // lanes). The draws keep CR's order (after: x, rot; before: x, back, turn sign, turn size); a seat taken later
      // (TAKEN 2) burns them, and the 'before' sheet's draw below, so the clutter of the seats after it stays put
      if (taken) {
        chair(B, 0, CHAIR_Z, 0, { frame: F });
        if (taken === 2) for (var bn = 0; bn < 6; bn++) CR();
      } else {
        var ax = (CR() - 0.5) * 0.06, ar = (CR() - 0.5) * 6;
        chair(B, ax, CHAIR_Z, ar, { frame: F, group: 'after' });
        var bx = (CR() - 0.5) * 0.24, bz = -0.58 - CR() * 0.04, br = (CR() < 0.5 ? 1 : -1) * (12 + CR() * 22);
        chair(B, bx, chairMinZ(bz, br), br, { frame: F, group: 'before' });
      }
      // the screen: the display face of of_screen is 0.717 in front of the seat, 0.606 x 0.37, centred 0.274 up
      var sy = T + 0.274;
      card(0.58, 0.35, 0, sy, 0.712, 0, 0xd5e3f3);
      [[0.38, 0.06], [0.3, 0.0], [0.42, -0.06], [0.22, -0.12]].forEach(function (l) { card(l[0], 0.02, -0.25 + l[0] / 2, sy + l[1], 0.709, 0, 0x5b606b); });
      card(0.58, 0.05, 0, sy + 0.15, 0.709, 0, 0xd6333f, 'before');
      card(0.58, 0.05, 0, sy + 0.15, 0.709, 0, 0x1FA971, 'after');
      // the front panel: a pinned sheet, sticky notes
      if (!open) {
        card(0.21, 0.28, pS * 0.6, 0.98, PANEL_Z + 0.002, (CR() - 0.5) * 0.12, 0xf7f4ea);
        var n = 4 + Math.floor(CR() * 4);
        for (var k = 0; k < n; k++) {
          var sx = (k % 2 ? 1 : -1) * (0.38 + CR() * 0.5), syk = 0.84 + CR() * 0.3;
          card(0.075, 0.075, sx, syk, PANEL_Z - 0.001 * (k % 3), (CR() - 0.5) * 0.6, STICKY[Math.floor(CR() * STICKY.length)], 'before');
        }
        card(0.075, 0.075, -pS * 0.62, 1.1, PANEL_Z, 0, STICKY[i % 4], 'after');
        card(0.075, 0.075, -pS * 0.72, 1.1, PANEL_Z, 0, STICKY[(i + 1) % 4], 'after');
      }
      // a paper tray (the stacks sit in it), the PC tower under the desk (right of the knees), a phone on every
      // third desk
      // (boxes, unhulled: the VNB tray and tower cost 100 and 115 triangles a desk; the tower stays clear of the desk's
      // side panel, inner face at x -0.683)
      var TRAY = 0.035;
      var tray = i % 2 === 0 ? TRAY : 0;
      if (tray) G(new THREE.BoxGeometry(0.25, 0.05, 0.32), pS * 0.55, T + 0.025, 0.83, 0, 0x4f86b8, { hull: false });
      G(new THREE.BoxGeometry(0.16, 0.42, 0.36), -0.58, 0.21, 0.78, (CR2() - 0.5) * 8 * PI / 180, 0x3a3f4a, { hull: false });
      if (i % 3 === 1) P('vnb_phone', { rot: 180 + pS * 15, x: -pS * 0.6, z: 0.8, y: T, hull: false });
      // before: the mess
      paper(pS * 0.55, 0.82, (CR() - 0.5) * 0.4, 0.05 + CR() * 0.12, 'before', T + tray);
      if (CR() < 0.6 && i % 3 !== 1) paper(-pS * 0.55, 0.84, (CR() - 0.5) * 0.6, 0.02 + CR() * 0.05, 'before');
      paper(-pS * 0.48, 0.5, (CR() - 0.5) * 1.2, 0.004, 'before');
      if (!taken) paper(0.05, 0.42, (CR() - 0.5) * 1.0, 0.004, 'before', T + 0.045);
      else if (taken === 2) CR();
      mug(-pS * 0.6, 0.38, 'before');
      if (CR() < 0.5) mug(pS * 0.62, 0.48, 'before', true);
      if (CR() < 0.5) ball((CR() - 0.5) * 1.2, T, 0.3 + CR() * 0.2);
      ball((CR() < 0.5 ? 1 : -1) * (0.45 + CR() * 0.35), 0, -0.45 + CR() * 0.6);
      if (i % 3 === 2) P('vnb_bin', { rot: CR2() * 40, x: pS * 0.78, z: -0.25 });
      else if (CR() < 0.35) P('of_box_open', { scale: 0.6, rot: (CR() - 0.5) * 30, x: pS * 0.74, z: -0.2, group: 'before' });
      // after: tidy
      paper(pS * 0.55, 0.85, 0, 0.03, 'after', T + tray);
      mug(-pS * 0.58, 0.45, 'after');
      if (i % 3 !== 1) P(PLANTS_SMALL[i % 3 ? 2 : 0], { x: -pS * 0.58, z: 0.88, y: T, group: 'after' });
    }
    /* the island's two end panels (facing the lift and the window): a cork board with notes pinned on it. On the lift
     * side the water cooler stands against the panel's west half (x -0.63..-0.29): the board is x -0.2..0.62 there and
     * the notes that would sit behind the cooler are left out (the panel frame F faces the lift: world x = -local x) */
    function islandEnds() {
      [[8.47, -1], [12.53, 1]].forEach(function (e) {
        var lift = e[1] < 0, z = e[0] + e[1] * 0.012, F = at(0, 0, z + e[1] * 0.01, e[1] > 0 ? 0 : PI);
        B.box(lift ? -0.2 : -0.62, 0.62, Math.min(z, z + e[1] * 0.02), 0.62, 1.12, Math.max(z, z + e[1] * 0.02), 0xc49a6c);
        [[-0.42, 1.0, 0xf7f4ea, 0.2, 0.26], [-0.12, 0.98, 0xffe45c, 0.1, 0.1], [0.12, 1.02, 0xf7f4ea, 0.2, 0.15], [0.38, 0.86, 0x9fd8ff, 0.1, 0.1],
          [-0.3, 0.76, 0xff9fbf, 0.1, 0.1], [0.05, 0.78, 0xf7f4ea, 0.24, 0.18], [0.42, 1.04, 0xbdf08f, 0.1, 0.1]].forEach(function (n, k) {
          if (lift && -n[0] - n[3] / 2 < -0.18) return;
          var g = new THREE.PlaneGeometry(n[3], n[4]).rotateZ((k % 3 - 1) * 0.08);
          B.geo(g, F.clone().multiply(at(n[0], n[1], 0.012, 0)), n[2], { hull: false });
        });
      });
    }

    /* heroChair: Roo's chair, built on its own (one mesh plus ink) so it can move. While Roo is not at office.chair it
     * stands pulled out to his right and swivelled (CHAIR_OUT), clear of his walk in from office.deskStand; when he
     * reaches the mark it swings in under him over CHAIR_SWING s (his sitDownChair runs 1.3 s), and out again when he
     * leaves. On a beat entry it snaps to where it belongs. */
    function poseChair() {
      var e = chairK * chairK * (3 - 2 * chairK), o = CHAIR_OUT;
      chairRoot.position.set(HERO[0] + o.x * (1 - e), 0, HERO[1] + o.z * (1 - e));
      chairRoot.rotation.y = o.yaw * (1 - e);
    }
    function rooAtSeat() {
      var W = JG.world;
      if (!W || !W.staged || !W.staged('roo')) return false;
      var p = W.actor('roo').root.position;
      return Math.abs(p.x - HERO[0]) < 0.12 && Math.abs(p.z - HERO[1]) < 0.12;
    }
    function heroChair(dt) {
      var target = rooAtSeat() ? 1 : 0;
      if (dt === undefined) chairK = target;
      else if (chairK !== target) chairK = target > chairK ? Math.min(1, chairK + dt / CHAIR_SWING) : Math.max(0, chairK - dt / CHAIR_SWING);
      poseChair();
    }

    /* boxFurniture / instancedBoxes: the Stage 1 procedural boxes, used only when kit-office.glb is missing */
    function boxFurniture() {
      IN.heroDesk.forEach(function (b) { B.box(HERO[0] + b[0], b[1], HERO[1] + b[2], HERO[0] + b[3], b[4], HERO[1] + b[5], b[6], b[7] || {}); });
      var PLANTS = [[-9.2, 20.3], [9.2, 20.3], [9.3, 0.8], [-3.2, 0.8]];
      PLANTS.forEach(function (p) { B.box(p[0] - 0.25, 0, p[1] - 0.25, p[0] + 0.25, 0.5, p[1] + 0.25, 0xc4643f); });
      PLANTS.forEach(function (p) {
        B.geo(kit.geo.sphere(0.45, 8), at(p[0], 0.95, p[1]), 0x4f9a5c, { group: 'after' });
        B.geo(kit.geo.cyl(0.03, 0.05, 0.5, 6), at(p[0], 0.5, p[1]), 0x6b4a2a, { group: 'before' });
        B.geo(kit.geo.sphere(0.22, 6), at(p[0] + 0.12, 0.75, p[1]), 0x9a7b3c, { group: 'before' });
      });
      SEATS.forEach(function (s) {
        var F = at(s[0], 0, s[1], s[2]);
        [[-0.8, 0, 0.25, 0.8, 0.76, 1.05], [-0.31, 0.76, 0.74, 0.31, 1.33, 0.92]].forEach(function (c) {   // desk, monitor
          var a = new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(F), b = new THREE.Vector3(c[3], c[4], c[5]).applyMatrix4(F);
          B.collider(a.x, a.y, a.z, b.x, b.y, b.z);
        });
      });
    }
    function instancedBoxes() {
      var deskM = IN.boxesMesh(kit, IN.desk, { name: 'desk' }), chairM = IN.boxesMesh(kit, IN.chair, { name: 'chair' }), monM = IN.boxesMesh(kit, IN.monitor, { name: 'monitor' });
      var seatT = SEATS.map(function (s) { return { pos: [s[0], 0, s[1]], yaw: s[2] }; });
      root.add(kit.instanced(deskM, seatT));
      root.add(kit.instanced(monM, seatT));
      root.add(kit.instanced(chairM, seatT.concat([{ pos: [HERO[0], 0, HERO[1]] }])));
    }

    // ---------------------------------------------------------------------------------------------- state
    var state = Object.assign({}, DEFAULTS);
    function applyMood() {
      var after = state.mood === 'after';
      if (meshes.before) meshes.before.visible = !after;
      if (meshes.after) meshes.after.visible = after;
      dash.draw(function (c, w, h) { IN.drawDashboard(c, w, h, state.mood); });
    }
    function applyLight() {
      var L = state.light === 'dusk' ? SK.lighting.officeDusk : SK.lighting.officeDay;
      inst.lighting = L;
      if (JG.world && JG.world.current === inst) SK.applyLighting(L);
    }
    var inst = {
      root: root, lighting: SK.lighting.officeDay, areas: {},
      markers: MARKERS, zones: ZONES, paths: PATHS,
      walk: {
        // the centre aisle splits into two lanes around the cubicle island (x -1.69..1.69, z 8.47..12.53). Every rect
        // keeps Roo's ~0.3 m body clear of the furniture: the scanner kiosk (x 2.82..3.18, z 4.56..4.86: the walk in
        // from the lift is split round it, x <= 2.52 between z 4.3 and 5.2), the water cooler at the island's lift-side
        // end (x -0.67..-0.29 with its cup tube, z 8.06..8.43: z <= 7.81 in front of it), the printer station's cabinet
        // on the east wall (vnb_cabinet, x >= 9.41, z 3.54..4.36), the desk rows south (z <= 9.03) and north (z >=
        // 14.66, the hero chair pulled out; the hero's neighbour's chair, x 7.55..8.44, z >= 13.89: x <= 7.25 or
        // z <= 13.6 there) of the east aisle, the vases west of the lift (x <= -5.93) and at the west
        // aisle (x <= -3.93, z 6.63..7.37); the kitchenette counters' front is x 9.08 (the coffee machine's stand pokes
        // out to x 8.78 for z 2.0..3.0); the break corner west of the lift (x < -5.6) and the low window planters
        // (z > 20.5) are outside them
        'office-walk': [rect(-5.6, 0.6, 2.1, 3.4), rect(2.1, 1.2, 8.55, 3.4), rect(8.55, 2.0, 8.78, 3.0),
          rect(-3.6, 1.2, 3.6, 4.3), rect(-3.6, 4.3, 2.52, 7.81), rect(-3.6, 5.2, 3.6, 7.81), rect(-3.6, 7.81, -0.97, 8.1), rect(0.05, 7.81, 3.6, 8.1),
          rect(-3.6, 8.1, -1.95, 12.9), rect(1.95, 8.1, 3.6, 12.9), rect(-3.6, 12.9, 3.6, 20.2), rect(-7.1, 16.2, 9, 20.2), rect(3.6, 9.4, 7.25, 14.35), rect(7.25, 9.4, 9, 13.6),
          rect(3.6, 3.4, 8.55, 7.4), rect(-9, 15.4, -3.6, 16.2)]
      },
      // office-walk's crowd (crowd.js): two colleagues gossiping either side of the water cooler (looking at each other,
      // not at Roo unless a beat watches them; 2.05 m apart, so no pair circle between them) and a man on the phone by
      // the window; their hulls show within 6 m of the camera
      crowdSpots: { 'office-walk': [
        { id: 'gossipA', pos: [-1.45, 0, 7.80], yaw: PI / 2 + 0.35, pose: 'talk', female: true, lookAt: 'gossipB', lookNear: 0,
          look: { skin: '#E0AC85', hair: '#3B2A20', hair2: false, top: '#5E8C8A', jacket: null, longSleeves: true, bottom: '#2F3A4A', skirt: null, legs: null, shoes: '#111111', height: 1.66, smile: true } },
        { id: 'gossipB', pos: [0.60, 0, 7.80], yaw: -PI / 2 - 0.35, pose: 'talk', female: false, lookAt: 'gossipA', lookNear: 0,
          look: { skin: '#C68B66', hair: '#1E1A18', hair2: false, bald: false, shorts: false, top: '#FFF8E7', jacket: '#5A3A22', longSleeves: false, bottom: '#3F4A56', shoes: '#5A3A22', height: 1.8, smile: false } },
        { id: 'phone', pos: [7.0, 0, 19.6], yaw: PI - 0.5, pose: 'phone', female: false,
          look: { skin: '#F1C9A5', hair: '#8A6A45', hair2: false, bald: false, shorts: false, top: '#6F8FAF', jacket: null, longSleeves: true, bottom: '#2A3550', height: 1.76 } }
      ] },
      crowdHullFar: 6,
      camPresets: { 'office-walk': { yaw: 0.35, dist: 5.5, height: 2.8, lookHeight: 1.1, lag: 0.25 } },
      camColliders: B.colliders(),
      props: Object.assign({ monitor: { object: mon.mesh, anchors: {} }, window: { object: pane, anchors: {} }, windowBroken: { object: broken, anchors: {} } },
        props ? { scanner: props.scanner, cooler: props.cooler, coffee: props.coffee, deskMug: props.deskMug } : {}),
      surfaceAt: function (x, z) { return z < 0.2 || (z < 1.3 && Math.abs(x) < 3) ? 'hard' : 'carpet'; },
      setState: function (patch, sec) {
        sec = sec || 0;
        Object.assign(state, patch);
        if (patch.doors) {
          var dx = DOOR_X[patch.doors === 'open' ? 'open' : 'closed'];
          SK.tweenTo(doorL.position, { x: dx[0] }, sec); SK.tweenTo(doorR.position, { x: dx[1] }, sec);
        }
        if (patch.floor !== undefined) {
          if (sec > 0 && JG.clock && JG.clock.tween) JG.clock.tween(floorProxy, { v: patch.floor }, sec, 'linear', 'beat');
          else floorVal = patch.floor;
          drawFloor();
        }
        if (patch.mood) applyMood();
        if (patch.light) applyLight();
        if (patch.window) { var b = patch.window === 'broken'; pane.visible = !b; broken.visible = b; }
        if (patch.monitor) { drawMonitor(); monT = 0; }
        return { duration: sec };
      },
      update: function (dt, t, ctx) {
        drawFloor();
        monT += dt;
        if (monT >= 0.1 && state.monitor !== 'off') { monT = 0; drawMonitor(); }
        // hide the lift car's walls when the camera is behind the lift wall but not inside the car
        var cam = ctx && ctx.camera;
        if (cam && meshes.car) {
          var p = cam.position, inCar = p.z > -2.4 && p.z < 0.05 && Math.abs(p.x) < 1.3 && p.y < 2.6;
          meshes.car.visible = inCar || p.z >= 0.05;
        }
        heroChair(dt);
        if (props) props.update(dt);
      },
      debug: { meshes: meshes, state: function () { return Object.assign({}, state); }, chair: function () { return chairK; }, chairs: function () { return chairBounds; } }
    };
    if (JG.on) JG.on('scene', function (id) { if (id === 'office' && JG.world.current === inst) SK.applyLighting(inst.lighting); });
    // the stations animate (screens redraw, steam puffs) only in office-walk; every beat starts them from rest
    if (JG.on) JG.on('beat', function (id) { if (JG.world && JG.world.current === inst) { heroChair(); if (props) { props.reset(); props.live(id === 'office-walk'); } } });
    inst.setState(Object.assign({}, DEFAULTS), 0);
    poseChair();
    return inst;
  }
})();
