/* Set building kit (E4, Stage 1): the shared builder every set file uses, and the city kit pieces from
 * kit-city.glb (Kenney City Kit Roads/Commercial + KayKit City Builder Bits, the family picked in Stage 0 step 7,
 * dev/out/kit-spike/DECISION.md), loaded through kit.gltf and restyled with kit.restyle (toon ramp, vertex colours,
 * kit.hullSet ink at 0.016 m).
 *
 *   JG.setkit.builder(kit) -> B        collects static geometry and merges it per group at build():
 *     B.box(x0, y0, z0, x1, y1, z1, color, o?)    axis-aligned box (o.group, o.hull = true, o.yaw about its centre)
 *     B.geo(geometry, matrix, color, o?)          any procedural geometry (o.hull: kit.hullSet of it)
 *     B.piece(name, o)                            a kit-city piece: o = {x | minX | maxX | cx, z | minZ | maxZ | cz,
 *                                                 y = 0 (its lowest point rests there), rot (degrees about Y), scale,
 *                                                 variant ('base' | 'brick' | 'cream' | 'dusty' | 'slate'), hull, group}
 *                                                 -> the placed world bounds {min:[x,y,z], max:[x,y,z]}
 *     B.quad(atlas, cellId, centre, w, h, yaw, o?) a sign quad textured from an atlas (o.group, default 'signs')
 *     B.build(root) -> {group: Mesh}             one vertex-coloured toon mesh per group plus one merged ink mesh
 *                                                 (child, userData.jgHull) for the hulled parts; sign groups become
 *                                                 one unlit mesh per atlas
 *     B.collider(x0, y0, z0, x1, y1, z1, o?)       a camera collider with no geometry (o.group gates it, o.thin)
 *     B.colliders() -> [{min, max, mesh, thin}]   after build(): the follow camera's colliders (SceneInstance
 *                                                 .camColliders). Every box, piece and solid geo is recorded as its
 *                                                 world AABB, gated by its group mesh's visibility; flat geometry (the
 *                                                 one-sided cutaway planes) and o.cam === false are not. thin (two
 *                                                 sides under 0.2 m: posts, rails; street lights, hydrants) only keeps
 *                                                 the camera out of it, it does not pull the camera in front of it.
 *   JG.setkit.atlas(kit, cells) -> {texture, rect(id), material}   cells [{id, w, h, draw(ctx, w, h)}] packed into
 *                                                 one CanvasTexture (fonts are registered before any set is built)
 *   JG.setkit.signCell(id, text, o)  JG.setkit.roundel(ctx, x, y, r)   canvas drawing helpers (Bangers lettering,
 *                                                 ink border, the June "J" disc as the roundel)
 *   JG.setkit.lighting / colours / applyLighting(L)  shared presets (cityRoof / cityA / cityB added in the look pass)
 *
 * Look pass (2026-11-24, city only; office and subway call builder(kit) unchanged):
 *   JG.setkit.builder(kit, {atlas: JG.setkit.facadeAtlas(kit)}) -> a textured builder: every group shares one toon
 *     material mapped with the facade atlas; untextured parts sample its white cell, so vertex colours still work. It
 *     adds B.tquad(origin, U, V, w, h, uvRect, o) (an atlas quad), B.hullBox(...) (ink only), B.building(o) (a facade
 *     shell: shopfront ground floor, ink-lined window strips, parapet, roof, setbacks; ~20 tris a floor-face), and
 *     B.geo's default hull becomes 'grow' (the same convex part scaled out by T: no extra triangles). B.piece also
 *     takes the Quaternius Downtown pieces (dt_*, kit-downtown.glb, real scale).
 *   JG.setkit.facadeAtlas(kit) -> {texture, rect(id), white}: 2048 x 2048 canvas cells (up:<style>:<0|1>,
 *     base:<style>, shop:<0-5>, tower:<0-3>, awn:<0-4>, gravel, paveA, paveB, walk, deck, rug, pizza, mags, white).
 *   JG.setkit.skyDome(kit, o) -> Mesh: the painted comic sky (the set keeps it centred on the camera).
 *
 * Classic script: data and functions only at load; THREE and the DOM are touched only inside build calls. Seeded
 * randomness only (kit.rng). Nothing here carries a real logo: every sign is our own canvas lettering. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  if (JG.manifest) { JG.manifest.add('kit-city', 'assets/models/kit-city.glb'); JG.manifest.add('kit-downtown', 'assets/models/kit-downtown.glb'); }

  var T = 0.016; // ink hull thickness in metres (plan section 13: 0.016 +-20%)

  // Bounds of each kit-city piece as built (probe of kit-city.glb, 2026-11-24), used for placement and as the
  // greybox fallback if the GLB is missing.
  var PIECES = {
    road_straight: [[-4.5, 0, -4.5], [4.5, 0.18, 4.5], 0x666677], road_crossroad: [[-4.5, 0, -4.5], [4.5, 0.18, 4.5], 0x666677],
    road_intersection: [[-4.5, 0, -4.5], [4.5, 0.18, 4.5], 0x666677], road_side: [[-4.5, 0, -7.29], [4.5, 0.18, 4.5], 0x666677],
    road_crossing: [[-4.5, 0, -4.5], [4.5, 0.18, 4.5], 0x666677], tile_low: [[-4.5, 0, -4.5], [4.5, 0.18, 4.5], 0x99aacc],
    light_square: [[-0.23, 0, -1.91], [0.23, 5.4, 0.22], 0x9999aa], building_a: [[-3.98, 0, -4.23], [3.98, 11.64, 4.23], 0xddddee],
    building_c: [[-3.98, 0, -4.91], [3.98, 8.04, 4.91], 0xddddee], building_f: [[-3.78, 0, -4.63], [3.78, 15.24, 4.63], 0xddddee],
    building_skyscraper_a: [[-6.12, 0, -6.12], [6.12, 25.92, 6.12], 0x99aacc], detail_awning_wide: [[-3.6, 0, 0.9], [3.6, 3.6, 2.23], 0x33aa77],
    detail_overhang: [[-2.25, 0, 0.45], [2.25, 3.6, 2.25], 0xddddee], kk_bench: [[-0.96, 0, -0.36], [0.96, 0.48, 0.36], 0xaa6644],
    kk_firehydrant: [[-0.24, 0, -0.23], [0.24, 0.81, 0.24], 0xcc2222], kk_streetlight: [[-1.34, 0, -0.19], [0.17, 5.38, 0.19], 0x777777],
    kk_trafficlight_a: [[-0.65, 0, -0.19], [0.19, 3.5, 0.53], 0x777777], kk_dumpster: [[-1.36, 0, -0.85], [1.36, 1.52, 0.85], 0x009955],
    kk_car_taxi: [[-1.01, -0.29, -2.27], [1.01, 1.79, 2.24], 0xeebb55], kk_watertower: [[-1.8, 0, -1.8], [1.8, 4.82, 1.8], 0x995544],
    detail_parasol_a: [[-1.56, 0, -1.8], [1.56, 4.05, 1.8], 0x33aa77],
    // Quaternius Downtown City MegaKit (kit-downtown.glb, real scale: 3 m floors)
    dt_doorframe_wooden: [[-1.15, 0, -0.26], [1.15, 3, 0.22], 0x6b4a32], dt_metal_firstfloor_window: [[-1, 0, -0.22], [1, 3, 0.04], 0x333333],
    dt_bollard: [[-0.11, 0, -0.11], [0.11, 0.89, 0.11], 0x333333], dt_planter: [[-1, 0, -1], [1, 0.6, 1], 0x888888],
    dt_manhole: [[-0.46, -0.01, -0.46], [0.46, 0.02, 0.46], 0x444444], dt_acunit: [[-0.6, 0, -0.45], [0.6, 1.05, 0.45], 0xbbbbbb]
  };
  // Palette variants for the Kenney facades (the white family), so a street of the same four buildings reads as
  // different buildings in the plan's muted city colours. Keys are the pack's sRGB vertex colours.
  var VARIANTS = {
    base: null,
    brick: { '#ffffff': '#c98a72', '#eeeeee': '#b97c66', '#ddddee': '#a86a5a', '#ccccdd': '#975f50', '#bbbbdd': '#8a5548' },
    cream: { '#ffffff': '#f3e6c8', '#eeeeee': '#e6d6b4', '#ddddee': '#d8c8a6', '#ccccdd': '#c8b896', '#bbbbdd': '#b9a987' },
    dusty: { '#ffffff': '#b7c2da', '#eeeeee': '#a9b5cf', '#ddddee': '#9aa7c4', '#ccccdd': '#8b98b6', '#bbbbdd': '#7d8aa8' },
    slate: { '#ffffff': '#a39cb8', '#eeeeee': '#958eab', '#ddddee': '#8a7d9e', '#ccccdd': '#7a6f8e', '#bbbbdd': '#6c6280' }
  };

  var C = {
    blue: 0x1F4FD8, yellow: 0xFFD21F, magenta: 0xE0218A, ink: 0x111111, paper: 0xFFF8E7,
    pavement: 0xb9b4aa, pavementDark: 0xa8a399, kerb: 0xd6d0c2, roadBase: 0x4d505a, roofDeck: 0x8b8580, parapet: 0xc9c1b2,
    brick: 0xa86a5a, brickDark: 0x8e5548, trim: 0xe8dcc0, glassDark: 0x34466b, glassLit: 0x9fc3e8, metal: 0x8a8f99,
    metalDark: 0x5b606b, brass: 0xc8a24a, brassDark: 0x9c7a2e, stone: 0xd8d0c0, dusty: 0x7d8aa8, purple: 0x8a7d9e, slate: 0x6b7896
  };

  var LIGHT = {
    day: { background: 0x9fc3e8, hemi: { sky: 0xffffff, ground: 0x8a8478, intensity: 1.2 }, sun: { color: 0xfff1d6, intensity: 2.2, pos: [-20, 40, 12] }, fog: { color: 0x9fc3e8, near: 70, far: 260 } },
    roof: { background: 0x9fc3e8, hemi: { sky: 0xffffff, ground: 0x8a8478, intensity: 1.25 }, sun: { color: 0xfff1d6, intensity: 2.2, pos: [-20, 40, 12] }, fog: { color: 0xa9c9ea, near: 80, far: 300 } },
    subway: { background: 0x1b1e26, hemi: { sky: 0xfff6e0, ground: 0x6b6a70, intensity: 1.55 }, sun: { color: 0xffffff, intensity: 1.1, pos: [2, 6, 3] }, fog: null },
    officeDay: { background: 0xbcd6ee, hemi: { sky: 0xffffff, ground: 0x8f8a80, intensity: 1.35 }, sun: { color: 0xffffff, intensity: 1.8, pos: [4, 10, 18] }, fog: { color: 0xbcd6ee, near: 60, far: 520 } },
    // city areas (E4 look pass): warm afternoon key from behind the usual camera, fog matched to the sky dome horizon
    cityRoof: { background: 0xcfe1ee, hemi: { sky: 0xfff4e2, ground: 0x7f766c, intensity: 1.15 }, sun: { color: 0xffe2bc, intensity: 2.35, pos: [-24, 34, 18] }, fog: { color: 0xcfe1ee, near: 90, far: 420 } },
    cityA: { background: 0xcfe1ee, hemi: { sky: 0xfff6e8, ground: 0x857a70, intensity: 1.2 }, sun: { color: 0xffeccc, intensity: 2.25, pos: [-20, 40, 14] }, fog: { color: 0xcfe1ee, near: 70, far: 380 } },
    cityB: { background: 0xcfe1ee, hemi: { sky: 0xfff6e8, ground: 0x857a70, intensity: 1.2 }, sun: { color: 0xffeccc, intensity: 2.25, pos: [16, 40, -24] }, fog: { color: 0xcfe1ee, near: 70, far: 380 } },
    officeDusk: { background: 0xf0a878, hemi: { sky: 0xffd9b8, ground: 0x6d5a6a, intensity: 1.2 }, sun: { color: 0xffa060, intensity: 2.0, pos: [10, 6, 30] }, fog: { color: 0xe89a74, near: 60, far: 520 } }
  };

  /* applyLighting(L): sets the persistent lights from a preset now (for set-state changes that are not an area
   * change; world applies area presets itself). Same rules as world's preset application. */
  function applyLighting(L) {
    var THREE = window.THREE, s = JG.world && JG.world.scene;
    if (!s || !L) return;
    if (L.background !== undefined) s.background = new THREE.Color(L.background);
    s.traverse(function (o) {
      if (o.isHemisphereLight && L.hemi) { o.color.set(L.hemi.sky); o.groundColor.set(L.hemi.ground); o.intensity = L.hemi.intensity; }
      if (o.isDirectionalLight && L.sun) { o.color.set(L.sun.color); o.intensity = L.sun.intensity; o.position.fromArray(L.sun.pos); }
    });
    if (L.fog) { if (!s.fog) s.fog = new THREE.Fog(0xffffff, 10, 100); s.fog.color.set(L.fog.color); s.fog.near = L.fog.near; s.fog.far = L.fog.far; }
    else if (L.fog === null) s.fog = null;
  }

  // ---------------------------------------------------------------------------------------------- canvas helpers
  var FONT = 'Bangers, Impact, sans-serif';
  function fit(ctx, text, maxW, size, font) {
    ctx.font = size + 'px ' + font;
    while (size > 8 && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = size + 'px ' + font; }
    return size;
  }
  /** the June "J" disc: yellow disc, ink ring, blue J (our roundel; no third-party mark) */
  function roundel(ctx, x, y, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#FFD21F'; ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.14); ctx.strokeStyle = '#111'; ctx.stroke();
    var s = fit(ctx, 'J', r * 1.2, Math.round(r * 1.45), FONT);
    ctx.fillStyle = '#1F4FD8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('J', x + r * 0.04, y + s * 0.06);
    ctx.restore();
  }
  /* signCell(id, text, o) -> atlas cell. o: {w = 512, h = 128, bg = '#FFF8E7', fg = '#111', border = 8, font, sub
   * (a smaller second line), roundel: 'left' | 'right' | 'both', brass (faux-brass plain lettering, no box)} */
  function signCell(id, text, o) {
    o = o || {};
    var w = o.w || 512, h = o.h || 128;
    return { id: id, w: w, h: h, draw: function (ctx) {
      var font = o.font || FONT;
      if (o.brass) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = o.bg || '#2b2f3a'; ctx.fillRect(0, 0, w, h);
        var g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.8);
        g.addColorStop(0, '#f2d27a'); g.addColorStop(0.5, '#c8a24a'); g.addColorStop(1, '#8f6d28');
        var sz = fit(ctx, text, w * 0.92, Math.round(h * 0.62), o.font || '"Inter", "Helvetica Neue", Arial, sans-serif');
        ctx.font = '600 ' + sz + 'px ' + (o.font || '"Inter", "Helvetica Neue", Arial, sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, sz * 0.05); ctx.strokeStyle = '#3a2a0c'; ctx.strokeText(text, w / 2, h / 2);
        ctx.fillStyle = g; ctx.fillText(text, w / 2, h / 2);
        return;
      }
      ctx.fillStyle = o.bg || '#FFF8E7'; ctx.fillRect(0, 0, w, h);
      var b = o.border === undefined ? 8 : o.border;
      if (b) { ctx.lineWidth = b; ctx.strokeStyle = o.fg || '#111'; ctx.strokeRect(b / 2, b / 2, w - b, h - b); }
      var left = b + 6, right = w - b - 6;
      if (o.roundel === 'left' || o.roundel === 'both') { roundel(ctx, left + h * 0.36, h / 2, h * 0.32); left += h * 0.76; }
      if (o.roundel === 'right' || o.roundel === 'both') { roundel(ctx, right - h * 0.36, h / 2, h * 0.32); right -= h * 0.76; }
      var mid = (left + right) / 2, avail = right - left;
      ctx.fillStyle = o.fg || '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (o.sub) {
        var s1 = fit(ctx, text, avail * 0.94, Math.round(h * 0.46), font);
        ctx.fillText(text, mid, h * 0.36);
        ctx.font = Math.round(fit(ctx, o.sub, avail * 0.94, Math.round(h * 0.2), '"Comic Neue", sans-serif')) + 'px "Comic Neue", sans-serif';
        ctx.fillText(o.sub, mid, h * 0.36 + s1 * 0.5 + h * 0.16);
      } else {
        var s2 = fit(ctx, text, avail * 0.94, Math.round(h * 0.64), font);
        ctx.fillText(text, mid, h / 2 + s2 * 0.04);
      }
    } };
  }
  /* atlas(kit, cells) -> {texture, rect(id) -> [u0, v0, u1, v1], material}: shelf-packed into a 2048-wide canvas */
  function atlas(kit, cells) {
    var W = 2048, x = 0, y = 0, rowH = 0, pos = {}, pad = 4;
    cells.forEach(function (c) {
      if (x + c.w > W) { x = 0; y += rowH + pad; rowH = 0; }
      pos[c.id] = [x, y, c.w, c.h];
      x += c.w + pad; rowH = Math.max(rowH, c.h);
    });
    var H = 1; while (H < y + rowH) H *= 2;
    var tex = kit.tex.canvas(W, H, function (ctx) {
      cells.forEach(function (c) {
        var p = pos[c.id];
        ctx.save(); ctx.translate(p[0], p[1]); ctx.beginPath(); ctx.rect(0, 0, p[2], p[3]); ctx.clip();
        try { c.draw(ctx, p[2], p[3]); } catch (e) { JG.error('sign ' + c.id, e); }
        ctx.restore();
      });
    });
    var THREE = kit.THREE;
    var inset = 0.5;
    return {
      texture: tex, W: W, H: H,
      rect: function (id) {
        var p = pos[id];
        if (!p) { JG.warn('atlas-' + id, 'setkit atlas: no cell ' + id); return [0, 0, 0.001, 0.001]; }
        return [(p[0] + inset) / W, 1 - (p[1] + p[3] - inset) / H, (p[0] + p[2] - inset) / W, 1 - (p[1] + inset) / H];
      },
      material: new THREE.MeshBasicMaterial({ map: tex, transparent: false, side: THREE.FrontSide })
    };
  }

  // ---------------------------------------------------------------------------------------------- facade atlas
  /* facadeAtlas(kit) -> {texture, rect(id), white}: one 2048 x 2048 canvas of comic facade strips (ink-lined windows,
   * lit and unlit, curtains, blinds, flower boxes, a fire escape), shopfronts, skyline tower faces, awning stripes,
   * pavings, roof gravel and a few prop faces. Every cell is drawn by our own code (no third-party image). Scale: 512 px
   * = 12 m (4 bays of 3 m), so 128 px = one 3 m floor and 192 px = the 4.5 m ground floor. */
  var FACADES = {
    brick: { wall: '#b4634c', line: '#9a5240', trim: 0xeadcbc, trimS: '#eadcbc', frame: '#f3ead6', kind: 'sash', lintel: true, bricks: true },
    cream: { wall: '#e6d4a8', line: '#cdb98c', trim: 0xfbf0d2, trimS: '#fbf0d2', frame: '#5d4636', kind: 'arch' },
    blue: { wall: '#8ea3c9', line: '#7b90b8', trim: 0xe3e9f4, trimS: '#e3e9f4', frame: '#f6f7fb', kind: 'wide' },
    slate: { wall: '#8a7ca4', line: '#77698f', trim: 0xddd4ea, trimS: '#ddd4ea', frame: '#efe9f6', kind: 'double' },
    teal: { wall: '#5e9d96', line: '#4f8a83', trim: 0xe3f1ec, trimS: '#e3f1ec', frame: '#f6f8f3', kind: 'sash', boxes: true },
    ochre: { wall: '#d6a043', line: '#bf8b33', trim: 0xfff1cc, trimS: '#fff1cc', frame: '#5a3c22', kind: 'wide', ac: true },
    glass: { wall: '#43638f', line: '#344f75', trim: 0xc9d6e8, trimS: '#c9d6e8', frame: '#2b3a52', kind: 'curtain' },
    brickFire: { wall: '#a65a46', line: '#8c4a38', trim: 0xe6d6b4, trimS: '#e6d6b4', frame: '#efe4cc', kind: 'sash', lintel: true, bricks: true, fire: true }
  };
  var SHOPS = ['#2f6b4f', '#a8322d', '#25386a', '#1e1e22', '#1f7d7a', '#6a2c5e'];
  var AWNINGS = ['#c8352e', '#2f8a57', '#1F4FD8', '#E0218A', '#e0a614'];
  function hash(n) {
    n = (Math.floor(n * 7.13) | 0) ^ 0x2545f491;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b); n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return (n ^ (n >>> 16)) >>> 0;
  }
  var INK = '#111';
  function inkRect(c, x, y, w, h, fill, lw) {
    c.fillStyle = fill; c.fillRect(x, y, w, h);
    c.lineWidth = lw || 3; c.strokeStyle = INK; c.strokeRect(x + c.lineWidth / 2, y + c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
  }
  /** a pane of glass: unlit (gradient, highlight), lit (warm, with curtains, blinds, a plant or a lamp) */
  function pane(c, x, y, w, h, lit, k, sky) {
    var g;
    if (!lit) {
      g = c.createLinearGradient(x, y, x, y + h);
      if (sky) { g.addColorStop(0, '#5f84ba'); g.addColorStop(1, '#a8c6e6'); } else { g.addColorStop(0, '#26365a'); g.addColorStop(1, '#4f74a8'); }
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath(); c.moveTo(x + w * 0.15, y + h); c.lineTo(x + w * 0.55, y); c.lineTo(x + w * 0.75, y); c.lineTo(x + w * 0.35, y + h); c.fill();
      return;
    }
    g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#ffe7a3'); g.addColorStop(1, '#ffbf4a');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    var m = k % 5, cc = ['#E0218A', '#2f8a57', '#c8352e', '#1F4FD8', '#7a4fb0'][k % 5];
    if (m === 0 || m === 3) { // curtains
      c.fillStyle = cc;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.32, y); c.quadraticCurveTo(x + w * 0.12, y + h * 0.5, x + w * 0.22, y + h); c.lineTo(x, y + h); c.fill();
      c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w * 0.68, y); c.quadraticCurveTo(x + w * 0.88, y + h * 0.5, x + w * 0.78, y + h); c.lineTo(x + w, y + h); c.fill();
    } else if (m === 1) { // blinds
      c.fillStyle = 'rgba(120,80,30,0.35)';
      for (var i = 0; i < h * 0.6; i += 6) c.fillRect(x, y + i, w, 3);
    } else if (m === 2) { // a plant on the sill
      c.fillStyle = '#b8643a'; c.fillRect(x + w * 0.35, y + h - 12, w * 0.3, 12);
      c.fillStyle = '#2f8a57'; c.beginPath(); c.arc(x + w * 0.5, y + h - 18, w * 0.2, 0, 7); c.fill();
    } else { // a lamp silhouette
      c.fillStyle = 'rgba(90,50,20,0.45)'; c.fillRect(x + w * 0.62, y + h * 0.35, 3, h * 0.65);
      c.beginPath(); c.moveTo(x + w * 0.5, y + h * 0.38); c.lineTo(x + w * 0.82, y + h * 0.38); c.lineTo(x + w * 0.74, y + h * 0.2); c.lineTo(x + w * 0.58, y + h * 0.2); c.fill();
    }
  }
  function bricks(c, x, y, w, h, line) {
    c.save(); c.globalAlpha = 0.35; c.fillStyle = line;
    for (var j = 0, yy = y + 4; yy < y + h; yy += 9, j++) {
      c.fillRect(x, yy, w, 1.5);
      for (var xx = x + (j % 2 ? 0 : 9); xx < x + w; xx += 18) c.fillRect(xx, yy - 7.5, 1.5, 7.5);
    }
    c.restore();
  }
  /** one 128 x 128 px bay (3 x 3 m) of an upper floor */
  function bay(c, x, y, st, lit, k, tall) {
    var H = tall ? 192 : 128, s = tall ? 1.5 : 1;
    if (st.kind === 'curtain') {
      c.fillStyle = '#2b3a52'; c.fillRect(x, y, 128, H);
      for (var p = 0; p < 2; p++) pane(c, x + 4 + p * 62, y + 4, 58, H - 34 * s, lit && p === k % 2, k + p, true);
      c.fillStyle = '#7f97bd'; c.fillRect(x, y + H - 26 * s, 128, 22 * s);
      c.fillStyle = INK; c.fillRect(x, y + H - 27 * s, 128, 2); c.fillRect(x + 63, y, 2, H - 27 * s);
      return;
    }
    c.fillStyle = st.wall; c.fillRect(x, y, 128, H);
    if (st.bricks) bricks(c, x, y, 128, H, st.line);
    var rects;
    if (st.kind === 'wide') rects = [[16, 30 * s, 96, 62 * s]];
    else if (st.kind === 'double') rects = [[22, 22 * s, 36, 76 * s], [70, 22 * s, 36, 76 * s]];
    else rects = [[36, 20 * s, 56, 76 * s]];
    rects.forEach(function (r, i) {
      var wx = x + r[0], wy = y + r[1], ww = r[2], wh = r[3];
      if (st.lintel) inkRect(c, wx - 5, wy - 9, ww + 10, 10, st.trimS, 2);
      if (st.kind === 'arch') {
        c.fillStyle = st.trimS; c.beginPath(); c.arc(wx + ww / 2, wy + 4, ww / 2 + 6, Math.PI, 0); c.fill();
        c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      }
      c.fillStyle = st.frame; c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      if (st.kind === 'arch') { c.beginPath(); c.arc(wx + ww / 2, wy + 4, ww / 2 + 3, Math.PI, 0); c.fill(); }
      pane(c, wx, wy, ww, wh, lit && (i === 0 || k % 3 === 0), k + i);
      if (st.kind === 'arch') {
        c.save(); c.beginPath(); c.arc(wx + ww / 2, wy + 4, ww / 2, Math.PI, 0); c.clip(); pane(c, wx, wy - ww / 2, ww, ww / 2 + 4, lit, k); c.restore();
        c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.arc(wx + ww / 2, wy + 4, ww / 2 + 3, Math.PI, 0); c.stroke();
      }
      // glazing bars and the ink frame
      c.fillStyle = st.frame; c.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      if (st.kind !== 'wide') c.fillRect(wx, wy + wh * 0.48, ww, 4);
      c.lineWidth = 3; c.strokeStyle = INK; c.strokeRect(wx - 1.5, wy - 1.5, ww + 3, wh + 3);
      inkRect(c, wx - 7, wy + wh + 1, ww + 14, 8, st.trimS, 2);   // sill
      if (st.boxes && (k + i) % 2 === 0) {
        inkRect(c, wx - 2, wy + wh - 6, ww + 4, 10, '#7a4a2c', 2);
        ['#E0218A', '#FFD21F', '#c8352e', '#FFF8E7'].forEach(function (f, j) { c.fillStyle = j % 2 ? '#2f8a57' : f; c.beginPath(); c.arc(wx + 6 + j * (ww - 10) / 3, wy + wh - 9, 6, 0, 7); c.fill(); });
      }
      if (st.ac && (k + i) % 3 === 1) { inkRect(c, wx + ww * 0.55, wy + wh * 0.55, ww * 0.38, wh * 0.38, '#cfd3d8', 2); c.fillStyle = '#8a9099'; for (var q = 0; q < 3; q++) c.fillRect(wx + ww * 0.6, wy + wh * 0.62 + q * 6, ww * 0.28, 2); }
    });
  }
  function fireEscape(c, x, y, w, h) {
    c.save(); c.strokeStyle = '#1b1b1b'; c.fillStyle = '#1b1b1b'; c.lineWidth = 3;
    var fx = x + w * 0.25, fw = w * 0.5;
    c.fillRect(fx, y + h - 10, fw, 5);                                   // platform
    c.lineWidth = 2; c.beginPath(); c.moveTo(fx, y + h - 34); c.lineTo(fx + fw, y + h - 34); c.stroke();   // rail
    for (var i = 0; i <= 12; i++) { c.beginPath(); c.moveTo(fx + i * fw / 12, y + h - 34); c.lineTo(fx + i * fw / 12, y + h - 8); c.stroke(); }
    c.lineWidth = 4; c.beginPath(); c.moveTo(fx + fw * 0.15, y + h - 8); c.lineTo(fx + fw * 0.6, y - 6); c.stroke();      // stair
    c.lineWidth = 2;
    for (var s = 1; s < 9; s++) { var t = s / 9, sx = fx + fw * (0.15 + 0.45 * t), sy = y + h - 8 - (h + 2) * t; c.beginPath(); c.moveTo(sx - 7, sy); c.lineTo(sx + 7, sy); c.stroke(); }
    c.restore();
  }
  function shopCell(c, x, y, v) {
    var fr = SHOPS[v % SHOPS.length];
    c.fillStyle = fr; c.fillRect(x, y, 512, 192);
    c.fillStyle = INK; c.fillRect(x, y + 44, 512, 4);
    var door = (v * 3 + 1) % 4;
    for (var b = 0; b < 4; b++) {
      var bx = x + b * 128;
      c.fillStyle = INK; c.fillRect(bx, y + 48, 3, 144);
      if (b === door) {
        var g = c.createLinearGradient(0, y + 60, 0, y + 186); g.addColorStop(0, '#ffe2a0'); g.addColorStop(1, '#e8a54a');
        c.fillStyle = g; c.fillRect(bx + 30, y + 62, 68, 126);
        c.lineWidth = 4; c.strokeStyle = INK; c.strokeRect(bx + 30, y + 62, 68, 126);
        c.fillStyle = '#d9b24a'; c.fillRect(bx + 84, y + 118, 6, 22);
        c.fillStyle = fr; c.fillRect(bx + 30, y + 160, 68, 28); c.strokeRect(bx + 30, y + 160, 68, 28);
        continue;
      }
      var gx = bx + 12, gy = y + 60, gw = 104, gh = 104;
      var gg = c.createLinearGradient(0, gy, 0, gy + gh); gg.addColorStop(0, '#fff0c4'); gg.addColorStop(1, '#f2c26a');
      c.fillStyle = gg; c.fillRect(gx, gy, gw, gh);
      // display: shelves with goods (our own shapes)
      var cols = ['#E0218A', '#1F4FD8', '#c8352e', '#2f8a57', '#FFD21F', '#7a4fb0'];
      for (var sh = 0; sh < 3; sh++) {
        c.fillStyle = '#8a5a34'; c.fillRect(gx, gy + 30 + sh * 32, gw, 4);
        for (var it = 0; it < 6; it++) {
          var hh = 10 + (hash(v * 97 + b * 13 + sh * 7 + it) % 14);
          c.fillStyle = cols[(v + b + sh + it) % cols.length];
          c.fillRect(gx + 6 + it * 16, gy + 30 + sh * 32 - hh, 11, hh);
        }
      }
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.moveTo(gx + 10, gy + gh); c.lineTo(gx + 50, gy); c.lineTo(gx + 66, gy); c.lineTo(gx + 26, gy + gh); c.fill();
      c.lineWidth = 4; c.strokeStyle = INK; c.strokeRect(gx, gy, gw, gh);
      c.fillStyle = fr; c.fillRect(bx + 3, y + 168, 125, 24); c.fillStyle = INK; c.fillRect(bx + 3, y + 167, 125, 3);
    }
    c.fillStyle = INK; c.fillRect(x + 509, y + 48, 3, 144);
  }
  function towerCell(c, x, y, v) {
    var walls = ['#7d8aa8', '#8a7d9e', '#a86a5a', '#5b6f99'], wall = walls[v % 4];
    c.fillStyle = wall; c.fillRect(x, y, 256, 512);
    for (var f = 0; f < 8; f++) for (var b = 0; b < 4; b++) {
      var lit = hash(v * 1000 + f * 17 + b * 5) % 7 === 0;
      if (v === 3) { c.fillStyle = lit ? '#ffe4a0' : (hash(f * 3 + b) % 2 ? '#8fb0dc' : '#6f90c0'); c.fillRect(x + b * 64 + 3, y + f * 64 + 3, 58, 46); continue; }
      c.fillStyle = lit ? '#ffe4a0' : '#3c4a68'; c.fillRect(x + b * 64 + 16, y + f * 64 + 14, 32, 36);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + b * 64 + 16, y + f * 64 + 50, 32, 4);
    }
  }
  function awningCell(c, x, y, v) {
    var col = AWNINGS[v % AWNINGS.length];
    for (var i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#FFF8E7' : col; c.fillRect(x + i * 32, y, 32, 128); }
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y + 92, 256, 8);
    c.fillStyle = INK; c.fillRect(x, y + 98, 256, 3);
  }
  function paving(c, x, y, kind) {
    var i, j;
    if (kind === 'paveA') {
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { var t = hash(i * 7 + j * 13) % 3; c.fillStyle = ['#cbc4b6', '#c3bcae', '#d1cbbd'][t]; c.fillRect(x + i * 64, y + j * 64, 64, 64); }
      c.fillStyle = '#9b9486'; for (i = 0; i <= 4; i++) { c.fillRect(x + i * 64 - 1, y, 2, 256); c.fillRect(x, y + i * 64 - 1, 256, 2); }
    } else if (kind === 'paveB') {
      c.fillStyle = '#9d6f5c'; c.fillRect(x, y, 256, 256);
      for (j = 0; j < 16; j++) for (i = -1; i < 9; i++) { c.fillStyle = ['#b98a72', '#ae7f68', '#c29580'][hash(i * 5 + j * 11) % 3]; c.fillRect(x + i * 32 + (j % 2) * 16 + 1, y + j * 16 + 1, 30, 14); }
    } else if (kind === 'walk') {
      c.fillStyle = '#c6c0b4'; c.fillRect(x, y, 256, 256);
      c.fillStyle = '#cfc9bd'; c.fillRect(x + 128, y, 128, 128); c.fillRect(x, y + 128, 128, 128);
      c.fillStyle = '#a49e92'; c.fillRect(x + 127, y, 2, 256); c.fillRect(x, y + 127, 256, 2); c.fillRect(x, y, 256, 2); c.fillRect(x, y, 2, 256);
    } else if (kind === 'gravel') {
      c.fillStyle = '#8f8b86'; c.fillRect(x, y, 256, 256);
      for (i = 0; i < 700; i++) { var h = hash(i * 31 + 7); c.fillStyle = h % 2 ? '#7e7a75' : '#a09c96'; c.fillRect(x + (h % 254), y + ((h >>> 8) % 254), 2, 2); }
      c.fillStyle = '#5f5c58'; c.fillRect(x, y + 85, 256, 3); c.fillRect(x, y + 170, 256, 3);
    } else if (kind === 'deck') {
      for (i = 0; i < 8; i++) { c.fillStyle = ['#b07c4c', '#a57246', '#b98656'][hash(i * 3) % 3]; c.fillRect(x + i * 32, y, 32, 256); c.fillStyle = '#4a3220'; c.fillRect(x + i * 32, y, 3, 256); }
      c.fillStyle = '#4a3220'; for (i = 0; i < 8; i++) c.fillRect(x + i * 32 + 3, y + (hash(i) % 200) + 20, 29, 2);
    } else if (kind === 'rug') {
      c.fillStyle = '#b8322d'; c.fillRect(x, y, 256, 256);
      c.fillStyle = '#FFF8E7'; c.fillRect(x + 14, y + 14, 228, 228); c.fillStyle = '#b8322d'; c.fillRect(x + 22, y + 22, 212, 212);
      c.strokeStyle = '#FFD21F'; c.lineWidth = 10;
      for (j = 0; j < 4; j++) { c.beginPath(); for (i = 0; i <= 8; i++) c.lineTo(x + 30 + i * 24.5, y + 60 + j * 46 + (i % 2 ? 16 : -6)); c.stroke(); }
      c.strokeStyle = '#1F4FD8'; c.lineWidth = 5; c.strokeRect(x + 34, y + 34, 188, 188);
    }
  }
  function pizzaCell(c, x, y) {
    c.fillStyle = '#efe6d2'; c.fillRect(x, y, 128, 128);
    c.fillStyle = '#d99a4a'; c.beginPath(); c.arc(x + 64, y + 64, 54, 0, 7); c.fill();
    c.fillStyle = '#f2c94c'; c.beginPath(); c.arc(x + 64, y + 64, 46, 0, 7); c.fill();
    c.fillStyle = '#efe6d2'; c.beginPath(); c.moveTo(x + 64, y + 64); c.arc(x + 64, y + 64, 58, -0.4, 0.75); c.fill();   // two slices gone
    c.fillStyle = '#c0392b'; [[40, 44], [78, 36], [52, 82], [36, 70], [64, 58], [86, 92]].forEach(function (p) { c.beginPath(); c.arc(x + p[0], y + p[1], 7, 0, 7); c.fill(); });
    c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.moveTo(x + 64, y + 64); c.arc(x + 64, y + 64, 54, 0.75, 2 * Math.PI - 0.4); c.closePath(); c.stroke();
  }
  function magsCell(c, x, y) {
    c.fillStyle = '#5a3d22'; c.fillRect(x, y, 256, 128);
    var cols = ['#E0218A', '#1F4FD8', '#FFD21F', '#2f8a57', '#c8352e', '#FFF8E7', '#7a4fb0'];
    for (var r = 0; r < 3; r++) for (var i = 0; i < 8; i++) {
      var cx = x + 4 + i * 31, cy = y + 6 + r * 40;
      c.fillStyle = cols[hash(r * 9 + i) % cols.length]; c.fillRect(cx, cy, 27, 36);
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(cx + 3, cy + 4, 21, 5);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(cx + 5, cy + 16, 17, 12);
      c.lineWidth = 2; c.strokeStyle = INK; c.strokeRect(cx, cy, 27, 36);
    }
  }
  var FA_CACHE = null;
  function facadeAtlas(kit) {
    if (FA_CACHE && FA_CACHE.kit === kit) return FA_CACHE.atlas;
    var slots = {}, P = 4;
    function slot(id, x, y, w, h, bg, draw) { slots[id] = { x: x, y: y, w: w, h: h, bg: bg, draw: draw }; }
    var styles = Object.keys(FACADES), i;
    for (i = 0; i < 4; i++) slot('tower:' + i, i * 256, 0, 256, 512, ['#7d8aa8', '#8a7d9e', '#a86a5a', '#5b6f99'][i], (function (v) { return function (c, x, y) { towerCell(c, x, y, v); }; })(i));
    // 16 upper strips: 8 at x 1024..2047 y 0..511, 8 at y 512..767
    styles.forEach(function (s, si) {
      [0, 1].forEach(function (v) {
        var n = si * 2 + v, x, y;
        if (n < 8) { x = 1024 + (n % 2) * 512; y = Math.floor(n / 2) * 128; } else { x = ((n - 8) % 4) * 512; y = 512 + Math.floor((n - 8) / 4) * 128; }
        slot('up:' + s + ':' + v, x, y, 512, 128, FACADES[s].wall, function (c, x0, y0) {
          for (var b = 0; b < 4; b++) { var k = hash(si * 101 + v * 31 + b * 7); bay(c, x0 + b * 128, y0, FACADES[s], k % 10 < (v ? 4 : 2), k); }
          if (FACADES[s].fire && v === 0) fireEscape(c, x0 + 128, y0, 256, 128);
        });
      });
    });
    for (i = 0; i < 6; i++) slot('shop:' + i, (i % 4) * 512, 768 + Math.floor(i / 4) * 192, 512, 192, SHOPS[i], (function (v) { return function (c, x, y) { shopCell(c, x, y, v); }; })(i));
    styles.forEach(function (s, si) {
      var n = si + 2, x = (n % 4) * 512, y = 960 + Math.floor(n / 4) * 192;
      slot('base:' + s, x, y, 512, 192, FACADES[s].wall, function (c, x0, y0) {
        for (var b = 0; b < 4; b++) { var k = hash(si * 53 + b * 11); bay(c, x0 + b * 128, y0, FACADES[s], k % 4 === 0, k, true); }
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x0, y0 + 176, 512, 16);
      });
    });
    // y 1536: pavings and gravel (256), then awnings, magazines, pizza, white (128)
    ['gravel', 'paveA', 'paveB', 'walk', 'deck', 'rug'].forEach(function (k, j) {
      slot(k, j * 256, 1536, 256, 256, { gravel: '#8f8b86', paveA: '#c7c0b2', paveB: '#b0826c', walk: '#c8c2b6', deck: '#a8764a', rug: '#b8322d' }[k], function (c, x, y) { paving(c, x, y, k); });
    });
    for (i = 0; i < 5; i++) slot('awn:' + i, 1536 + (i % 2) * 256, 1536 + Math.floor(i / 2) * 128, 256, 128, AWNINGS[i], (function (v) { return function (c, x, y) { awningCell(c, x, y, v); }; })(i));
    slot('mags', 1792, 1792, 256, 128, '#5a3d22', function (c, x, y) { magsCell(c, x, y); });
    slot('pizza', 0, 1792, 128, 128, '#efe6d2', function (c, x, y) { pizzaCell(c, x, y); });
    slot('white', 128, 1792, 128, 128, '#ffffff', function () {});
    var W = 2048, H = 2048;
    var tex = kit.tex.canvas(W, H, function (ctx) {
      ctx.fillStyle = '#8a8478'; ctx.fillRect(0, 0, W, H);
      Object.keys(slots).forEach(function (id) { var s = slots[id]; ctx.fillStyle = s.bg; ctx.fillRect(s.x, s.y, s.w, s.h); });
      Object.keys(slots).forEach(function (id) {
        var s = slots[id], x = s.x + P, y = s.y + P, w = s.w - 2 * P, h = s.h - 2 * P;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        // cells are drawn at their nominal size, scaled into the padded slot
        ctx.translate(x, y); ctx.scale(w / s.w, h / s.h);
        try { s.draw(ctx, 0, 0); } catch (e) { JG.error('facade ' + id, e); }
        ctx.restore();
      });
    });
    tex.anisotropy = 8;
    var atlas = {
      texture: tex,
      rect: function (id) {
        var s = slots[id];
        if (!s) { JG.warn('facade-' + id, 'setkit facade atlas: no cell ' + id); s = slots.white; }
        var x0 = s.x + P + 0.5, x1 = s.x + s.w - P - 0.5, y0 = s.y + P + 0.5, y1 = s.y + s.h - P - 0.5;
        return [x0 / W, 1 - y1 / H, x1 / W, 1 - y0 / H];
      }
    };
    var wr = atlas.rect('white');
    atlas.white = [(wr[0] + wr[2]) / 2, (wr[1] + wr[3]) / 2];
    FA_CACHE = { kit: kit, atlas: atlas };
    return atlas;
  }

  /* skyDome(kit, o) -> Mesh: an inside-out half sphere with a painted comic sky (gradient, ink-lined cumulus), drawn
   * first and without fog or depth writes; the set's update keeps it centred on the camera. o.horizon matches the fog. */
  function skyDome(kit, o) {
    o = o || {};
    var THREE = kit.THREE, TH = 0.62, hy = 512 * (0.5 / TH);
    var tex = kit.tex.canvas(1024, 512, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, 0, hy);
      g.addColorStop(0, o.top || '#3f78cf'); g.addColorStop(0.55, o.mid || '#86b6e6'); g.addColorStop(1, o.horizon || '#cfe1ee');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = o.horizon || '#cfe1ee'; c.fillRect(0, hy, w, h - hy);
      // cumulus: ink outline pass, then the fill pass, then a soft blue belly
      var clouds = [[60, 300, 1.0], [250, 250, 0.7], [410, 320, 1.2], [600, 270, 0.8], [770, 310, 1.1], [930, 240, 0.6], [1010, 330, 0.9], [150, 350, 0.6], [520, 360, 0.7], [860, 365, 0.55]];
      function puffs(cx, cy, s) {
        return [[0, 0, 34], [-40, 10, 24], [40, 8, 26], [-18, -20, 26], [20, -24, 30], [64, 14, 18], [-62, 16, 16]].map(function (p) { return [cx + p[0] * s, cy + p[1] * s, p[2] * s]; });
      }
      var all = [];
      clouds.forEach(function (cl) { [-1024, 0, 1024].forEach(function (dx) { all.push(puffs(cl[0] + dx, cl[1], cl[2])); }); });
      all.forEach(function (ps) { c.fillStyle = '#2b3550'; ps.forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], p[2] + 3, 0, 7); c.fill(); }); });
      all.forEach(function (ps) {
        c.fillStyle = '#ffffff'; ps.forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], p[2], 0, 7); c.fill(); });
        c.fillStyle = '#dbe7f5'; var b = ps[0]; c.fillRect(b[0] - b[2] * 2.1, b[1] + b[2] * 0.35, b[2] * 4.2, b[2] * 0.5);
      });
    });
    tex.wrapS = THREE.RepeatWrapping;
    var geo = new THREE.SphereGeometry(o.radius || 480, 32, 12, 0, Math.PI * 2, 0, Math.PI * TH);
    var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sky-dome'; mesh.renderOrder = -10; mesh.frustumCulled = false;
    return mesh;
  }

  // ---------------------------------------------------------------------------------------------- the builder
  function builder(kit, bo) {
    bo = bo || {};
    var THREE = kit.THREE, deg = THREE.MathUtils.degToRad;
    var groups = {}, quads = {}, variants = {}, cols = [], built = null;
    // textured builder (bo.atlas = facadeAtlas()): every group shares one toon material with the atlas as its map;
    // untextured parts sample the atlas's white cell, so vertex colours still work unchanged
    var FA = bo.atlas || null, WHITE = FA ? FA.white : null;
    var unitPlane = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    function grp(name) { return groups[name] || (groups[name] = { body: [], hull: [], dispose: [] }); }
    // camera colliders: world AABBs per group (thin: two sides under 0.2 m, or a pole-like kit piece)
    function col(x0, y0, z0, x1, y1, z1, o, thin) {
      if (o && o.cam === false) return;
      var a = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], b = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
      var small = 0; for (var i = 0; i < 3; i++) { if (b[i] - a[i] < 0.2) small++; }
      if (small === 3 || !isFinite(a[0] + a[1] + a[2] + b[0] + b[1] + b[2])) return;
      cols.push({ min: a, max: b, group: (o && o.group) || 'main', thin: !!(thin || (o && o.thin) || small >= 2) });
    }
    function colGeo(geometry, matrix, o) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      var bb = geometry.boundingBox.clone().applyMatrix4(matrix || new THREE.Matrix4()), s = bb.getSize(new THREE.Vector3());
      if (Math.min(s.x, s.y, s.z) < 1e-3) return;   // flat: a one-sided cutaway plane or a sign face
      col(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, o);
    }
    var THIN_PIECES = { kk_streetlight: 1, kk_trafficlight_a: 1, kk_firehydrant: 1, light_square: 1 };
    var M = new THREE.Matrix4(), Q = new THREE.Quaternion(), YAX = new THREE.Vector3(0, 1, 0);

    function variant(name, file) {
      file = file || 'kit-city';
      var vk = file + ':' + name;
      if (variants[vk] !== undefined) return variants[vk];
      var map = null;
      try {
        if (!JG.assets || !JG.assets.has || JG.assets.has(file)) {
          var g = kit.gltf(file);
          kit.restyle(g.scene, { palette: VARIANTS[name] || undefined, thickness: T });
          map = {};
          g.scene.traverse(function (o) { if (o.isMesh && !o.userData.jgHull) map[o.name] = o; });
        }
      } catch (e) {
        JG.warn(file + '-missing', 'setkit: ' + file + '.glb is not available (' + (e && e.message) + '); kit pieces fall back to boxes');
        map = null;
      }
      variants[vk] = map;
      return map;
    }
    function part(p) { if (WHITE && !p.uvRect && !p.uvPoint) p.uvPoint = WHITE; return p; }

    var B = {
      THREE: THREE, kit: kit, T: T, atlas: FA,
      box: function (x0, y0, z0, x1, y1, z1, color, o) {
        o = o || {};
        var sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
        if (sx < 1e-4 || sy < 1e-4 || sz < 1e-4) return;
        var m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        if (o.yaw) m.multiply(new THREE.Matrix4().makeRotationY(o.yaw));
        var gr = grp(o.group || 'main'), g = new THREE.BoxGeometry(sx, sy, sz);
        if (o.yaw) colGeo(g, m, o); else col(x0, y0, z0, x1, y1, z1, o);
        gr.body.push(part({ geometry: g, matrix: m, color: color, uvRect: o.uvRect }));
        gr.dispose.push(g);
        if (o.hull !== false) {
          // a mitred hull of a box is the box grown by t on every side: no need for hullSet here
          var h = new THREE.BoxGeometry(sx + 2 * T, sy + 2 * T, sz + 2 * T);
          gr.hull.push({ geometry: h, matrix: m });
          gr.dispose.push(h);
        }
      },
      geo: function (geometry, matrix, color, o) {
        o = o || {};
        var gr = grp(o.group || 'main');
        colGeo(geometry, matrix, o);
        gr.body.push(part({ geometry: geometry, matrix: matrix || new THREE.Matrix4(), color: color, uvRect: o.uvRect }));
        if (o.dispose !== false) gr.dispose.push(geometry);
        var hullMode = o.hull === undefined && FA ? 'grow' : o.hull;   // textured (city) builder: convex props grow
        if (hullMode === 'grow') {
          // a convex part: its hull is the same geometry grown by T about its bounds' centre (no extra triangles)
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          var bb = geometry.boundingBox, sz = bb.getSize(new THREE.Vector3()), ct = bb.getCenter(new THREE.Vector3()), ws = new THREE.Vector3().setFromMatrixScale(matrix || new THREE.Matrix4());
          var gm = new THREE.Matrix4().makeTranslation(ct.x, ct.y, ct.z)
            .multiply(new THREE.Matrix4().makeScale(1 + 2 * T / Math.max(1e-3, sz.x * ws.x), 1 + 2 * T / Math.max(1e-3, sz.y * ws.y), 1 + 2 * T / Math.max(1e-3, sz.z * ws.z)))
            .multiply(new THREE.Matrix4().makeTranslation(-ct.x, -ct.y, -ct.z));
          var hg = geometry.index ? geometry : geometry;   // position (and index) are all mergeHull reads
          gr.hull.push({ geometry: hg, matrix: (matrix || new THREE.Matrix4()).clone().multiply(gm) });
        } else if (hullMode !== false) gr.hull.push({ geometry: kit.hullOf(geometry, T / (o.scale || 1), true), matrix: matrix || new THREE.Matrix4() });
      },
      piece: function (name, o) {
        o = o || {};
        var bd = PIECES[name];
        if (!bd) { JG.warn('piece-' + name, 'setkit: unknown kit-city piece ' + name); return null; }
        var s = o.scale || 1;
        M.compose(new THREE.Vector3(), Q.setFromAxisAngle(YAX, deg(o.rot || 0)), new THREE.Vector3(s, s, s));
        var box = new THREE.Box3(new THREE.Vector3().fromArray(bd[0]), new THREE.Vector3().fromArray(bd[1])).applyMatrix4(M);
        var x = o.x !== undefined ? o.x : o.minX !== undefined ? o.minX - box.min.x : o.maxX !== undefined ? o.maxX - box.max.x : (o.cx !== undefined ? o.cx - (box.min.x + box.max.x) / 2 : 0);
        var z = o.z !== undefined ? o.z : o.minZ !== undefined ? o.minZ - box.min.z : o.maxZ !== undefined ? o.maxZ - box.max.z : (o.cz !== undefined ? o.cz - (box.min.z + box.max.z) / 2 : 0);
        var y = (o.y || 0) - (o.raw ? 0 : box.min.y);
        var m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.clone(), new THREE.Vector3(s, s, s));
        var gr = grp(o.group || 'main'), src = (variant(o.variant || 'base', /^dt_/.test(name) ? 'kit-downtown' : 'kit-city') || {})[name];
        if (src) {
          gr.body.push(part({ geometry: src.geometry, matrix: m, color: o.tint }));
          if (o.hull !== false) {
            var hc = src.children.filter(function (c) { return c.userData.jgHull; })[0];
            gr.hull.push({ geometry: s === 1 && hc ? hc.geometry : kit.hullOf(src.geometry, T / s, true), matrix: m });
          }
        } else {
          // greybox fallback: the piece's bounds as a box
          var b0 = new THREE.Box3(new THREE.Vector3().fromArray(bd[0]), new THREE.Vector3().fromArray(bd[1]));
          var sz = b0.getSize(new THREE.Vector3()), ct = b0.getCenter(new THREE.Vector3());
          var g = new THREE.BoxGeometry(sz.x, sz.y, sz.z).translate(ct.x, ct.y, ct.z);
          gr.body.push(part({ geometry: g, matrix: m, color: bd[2] })); gr.dispose.push(g);
        }
        var wb = new THREE.Box3(new THREE.Vector3().fromArray(bd[0]), new THREE.Vector3().fromArray(bd[1])).applyMatrix4(m);
        col(wb.min.x, wb.min.y, wb.min.z, wb.max.x, wb.max.y, wb.max.z, o, THIN_PIECES[name]);
        return { min: wb.min.toArray(), max: wb.max.toArray() };
      },
      collider: function (x0, y0, z0, x1, y1, z1, o) { col(x0, y0, z0, x1, y1, z1, o || {}); },
      /* tquad(origin, U, V, w, h, uvRect, o): a textured (atlas) quad, w along unit U, h along unit V from origin
       * (its bottom-left corner), facing U x V. No hull, no collider. o.color tints it (vertex colour). */
      tquad: function (origin, U, V, w, h, uvRect, o) {
        o = o || {};
        var N = new THREE.Vector3().crossVectors(U, V).normalize();
        var m = new THREE.Matrix4().makeBasis(U.clone().multiplyScalar(w), V.clone().multiplyScalar(h), N);
        m.setPosition(origin[0], origin[1], origin[2]);
        grp(o.group || 'main').body.push({ geometry: unitPlane, matrix: m, color: o.color, uvRect: uvRect });
      },
      /** hullBox(x0, y0, z0, x1, y1, z1, o): only the ink hull of a box (for quad-built shells) */
      hullBox: function (x0, y0, z0, x1, y1, z1, o) {
        o = o || {};
        var h = new THREE.BoxGeometry(Math.abs(x1 - x0) + 2 * T, Math.abs(y1 - y0) + 2 * T, Math.abs(z1 - z0) + 2 * T);
        var gr = grp(o.group || 'main');
        gr.hull.push({ geometry: h, matrix: new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) });
        gr.dispose.push(h);
      },
      /* building(o): a facade-atlas building shell (needs builder(kit, {atlas})). o: {x0, z0, x1, z1, y0 = 0, floors,
       * floorH = 3, groundH = 4.5, style (FACADES key), ground: 'shop' | 'plain' | 'none', shop: [face: variant] |
       * variant (front faces), front: 'nsew' subset (faces that get the shopfront; default 's'), faces: 'nsew' subset
       * to build (default all), group, hull = true, parapet = 0.7, setback: {inset, floors, style}, seed, roof:
       * 'gravel' | 'none'} -> {top, min, max}. Faces: n = +Z, s = -Z, e = +X, w = -X. */
      building: function (o) {
        if (!FA) throw new Error('setkit builder: building() needs builder(kit, {atlas})');
        var g = { group: o.group || 'main' }, y0 = o.y0 || 0, fh = o.floorH || 3, gh = o.ground === 'none' ? 0 : (o.groundH || 4.5);
        var floors = o.floors || 3, top = y0 + gh + floors * fh, st = FACADES[o.style] || FACADES.brick, seed = o.seed || 0;
        var fronts = o.front || 's', faces = o.faces || 'nsew';
        var Y = new THREE.Vector3(0, 1, 0);
        var F = {
          n: { U: new THREE.Vector3(1, 0, 0), o: [o.x0, o.z1 + 0.002], w: o.x1 - o.x0 },
          s: { U: new THREE.Vector3(-1, 0, 0), o: [o.x1, o.z0 - 0.002], w: o.x1 - o.x0 },
          e: { U: new THREE.Vector3(0, 0, -1), o: [o.x1 + 0.002, o.z1], w: o.z1 - o.z0 },
          w: { U: new THREE.Vector3(0, 0, 1), o: [o.x0 - 0.002, o.z0], w: o.z1 - o.z0 }
        };
        Object.keys(F).forEach(function (k, fi) {
          if (faces.indexOf(k) < 0) return;
          var f = F[k], bays = Math.max(1, Math.round(f.w / 3)), chunks = Math.ceil(bays / 4);
          function row(y, h, cellFor) {
            var done = 0;
            for (var c = 0; c < chunks; c++) {
              var nb = Math.min(4, bays - done), cell = cellFor(c), r = FA.rect(cell);
              var start = nb < 4 ? hash(seed + fi * 7 + c + y) % (5 - nb) : 0;
              var u0 = r[0] + (r[2] - r[0]) * start / 4, u1 = r[0] + (r[2] - r[0]) * (start + nb) / 4;
              var w = f.w * nb / bays, ox = f.o[0] + f.U.x * f.w * done / bays, oz = f.o[1] + f.U.z * f.w * done / bays;
              B.tquad([ox, y, oz], f.U, Y, w, h, [u0, r[1], u1, r[3]], g);
              done += nb;
            }
          }
          if (gh) {
            var shop = o.ground === 'shop' && fronts.indexOf(k) >= 0;
            var sv = typeof o.shop === 'object' ? (o.shop[k] || 0) : (o.shop || 0);
            row(y0, gh, function (c) { return shop ? 'shop:' + ((sv + c) % SHOPS.length) : 'base:' + (o.style || 'brick'); });
          }
          for (var i = 0; i < floors; i++) {
            row(y0 + gh + i * fh, fh, function (c) { return 'up:' + (o.style || 'brick') + ':' + (hash(seed * 13 + i * 5 + c * 3 + fi) % 2); });
          }
        });
        if (o.roof !== 'none') {
          var rr = FA.rect('gravel');
          B.tquad([o.x0, top, o.z1], new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), o.x1 - o.x0, o.z1 - o.z0, rr, g);
        }
        if (o.hull !== false) B.hullBox(o.x0, y0, o.z0, o.x1, top, o.z1, g);
        B.collider(o.x0, y0, o.z0, o.x1, top, o.z1, g);
        // parapet ring with a cornice lip (trim colour)
        var p = o.parapet === undefined ? 0.7 : o.parapet, t = 0.28, ho = { group: g.group, hull: o.hull !== false };
        if (p > 0) {
          B.box(o.x0 - 0.12, top - 0.25, o.z0 - 0.12, o.x1 + 0.12, top + p, o.z0 + t, st.trim, ho);
          B.box(o.x0 - 0.12, top - 0.25, o.z1 - t, o.x1 + 0.12, top + p, o.z1 + 0.12, st.trim, ho);
          B.box(o.x0 - 0.12, top - 0.25, o.z0 + t, o.x0 + t, top + p, o.z1 - t, st.trim, ho);
          B.box(o.x1 - t, top - 0.25, o.z0 + t, o.x1 + 0.12, top + p, o.z1 - t, st.trim, ho);
        }
        // string course over the ground floor
        if (gh && o.course !== false) B.box(o.x0 - 0.08, y0 + gh - 0.12, o.z0 - 0.08, o.x1 + 0.08, y0 + gh + 0.1, o.z1 + 0.08, st.trim, { group: g.group, hull: false, cam: false });
        var res = { top: top, min: [o.x0, y0, o.z0], max: [o.x1, top, o.z1] };
        if (o.setback) {
          var s = o.setback, ins = s.inset || 2;
          var r2 = B.building({ x0: o.x0 + ins, z0: o.z0 + ins, x1: o.x1 - ins, z1: o.z1 - ins, y0: top, ground: 'none', floors: s.floors || 3,
            style: s.style || o.style, group: g.group, hull: o.hull, seed: seed + 3, parapet: s.parapet, setback: s.setback });
          res.top = r2.top; res.max[1] = r2.top;
        }
        return res;
      },
      colliders: function () {
        return cols.map(function (c) { return { min: c.min, max: c.max, thin: c.thin, mesh: (built && built[c.group]) || null }; });
      },
      quad: function (at, cellId, centre, w, h, yaw, o) {
        o = o || {};
        var key = o.group || 'signs', q = quads[key] || (quads[key] = { atlas: at, parts: [] });
        var g = new THREE.PlaneGeometry(w, h);
        var m = new THREE.Matrix4().makeTranslation(centre[0], centre[1], centre[2]).multiply(new THREE.Matrix4().makeRotationY(yaw || 0));
        q.parts.push({ geometry: g, matrix: m, uvRect: at.rect(cellId) });
      },
      /** build(root) -> {name: Mesh}: merges every group (and sign group) and adds them to root */
      build: function (root) {
        var out = {}, mat = FA ? kit.mat.toon({ map: FA.texture, vertexColors: true }) : kit.mat.vertexToon(), inkMat = kit.mat.ink();
        Object.keys(groups).forEach(function (name) {
          var gr = groups[name];
          if (!gr.body.length) return;
          var geo = kit.geo.merge(gr.body);
          geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
          geo.computeBoundingSphere(); geo.computeBoundingBox();
          var mesh = new THREE.Mesh(geo, FA ? mat : (name === 'sky' || name === 'far' ? kit.mat.vertexToon() : mat));
          mesh.name = 'set-' + name;
          mesh.matrixAutoUpdate = false;
          if (gr.hull.length) {
            var hg = mergeHull(THREE, gr.hull);
            var h = new THREE.Mesh(hg, inkMat);
            h.name = mesh.name + '_hull'; h.userData.jgHull = true; h.matrixAutoUpdate = false;
            mesh.add(h);
          }
          gr.dispose.forEach(function (g) { g.dispose(); });
          root.add(mesh);
          mesh.updateMatrixWorld(true);
          out[name] = mesh;
        });
        Object.keys(quads).forEach(function (name) {
          var q = quads[name];
          var geo = kit.geo.merge(q.parts);
          ['skinIndex', 'skinWeight', 'color'].forEach(function (a) { geo.deleteAttribute(a); });
          q.parts.forEach(function (p) { p.geometry.dispose(); });
          var mesh = new THREE.Mesh(geo, q.atlas.material);
          mesh.name = 'set-' + name; mesh.matrixAutoUpdate = false;
          root.add(mesh);
          mesh.updateMatrixWorld(true);
          out[name] = mesh;
        });
        groups = {}; quads = {}; built = out;
        return out;
      }
    };
    return B;
  }
  /** merge hull parts [{geometry (position + index), matrix}] into one position-only indexed geometry */
  function mergeHull(THREE, parts) {
    var total = 0, totalI = 0;
    parts.forEach(function (p) { total += p.geometry.attributes.position.count; totalI += p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count; });
    var pos = new Float32Array(total * 3), idx = total > 65535 ? new Uint32Array(totalI) : new Uint16Array(totalI);
    var v = new THREE.Vector3(), base = 0, ib = 0;
    parts.forEach(function (p) {
      var P = p.geometry.attributes.position, I = p.geometry.index, m = p.matrix, flip = m.determinant() < 0;
      for (var i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m); pos[(base + i) * 3] = v.x; pos[(base + i) * 3 + 1] = v.y; pos[(base + i) * 3 + 2] = v.z; }
      var n = I ? I.count : P.count;
      for (var t = 0; t + 2 < n; t += 3) {
        var a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
        idx[ib++] = base + a; idx[ib++] = base + (flip ? c : b); idx[ib++] = base + (flip ? b : c);
      }
      base += P.count;
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  /* canvasPlane(kit, w, h, pw, ph, o) -> {mesh, canvas, ctx, texture, draw(fn)}: a live CanvasTexture on a plane
   * (monitors, floor displays). o.material: 'basic' (default) */
  function canvasPlane(kit, w, h, pw, ph) {
    var THREE = kit.THREE, cv = document.createElement('canvas');
    cv.width = pw; cv.height = ph;
    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    var ctx = cv.getContext('2d');
    return { mesh: mesh, canvas: cv, ctx: ctx, texture: tex, draw: function (fn) { fn(ctx, pw, ph); tex.needsUpdate = true; } };
  }

  /* tweenTo(obj, props, sec): JG.clock tween tagged 'beat' (cleanSlate stops it), or an immediate set at sec 0 */
  function tweenTo(obj, props, sec, ease) {
    if (sec > 0 && JG.clock && JG.clock.tween) return JG.clock.tween(obj, props, sec, ease || 'inOutQuad', 'beat');
    Object.keys(props).forEach(function (k) { obj[k] = props[k]; });
    return null;
  }

  /** walk-rectangle helper: rect(x0, z0, x1, z1) -> {min, max} with the corners sorted */
  function rect(x0, z0, x1, z1) { return { min: [Math.min(x0, x1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(z0, z1)] }; }

  JG.setkit = {
    T: T, PIECES: PIECES, VARIANTS: VARIANTS, colours: C, lighting: LIGHT,
    FACADES: FACADES, SHOPS: SHOPS, AWNINGS: AWNINGS, facadeAtlas: facadeAtlas, skyDome: skyDome, hash: hash,
    builder: builder, atlas: atlas, signCell: signCell, roundel: roundel, fitText: fit, FONT: FONT,
    canvasPlane: canvasPlane, applyLighting: applyLighting, tweenTo: tweenTo, rect: rect, mergeHull: mergeHull
  };
})();
