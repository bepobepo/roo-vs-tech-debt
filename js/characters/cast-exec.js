/* The exec (plan section 9: 1.74 m, regular female base). OWNER: E3. Data only: the build runs in JG.anim.human
 * (rig + dress + face engines).
 * STAGE 1b (2026-11-24, people pass), after the arms-crossed key art: body-female carries MakeHuman CC0 clothes and
 * hair (a fitted long-sleeve top with a V neck over a pencil skirt, shoes, and long hair), recoloured here into a sharp
 * royal-blue suit: jacket over a white top, deeper blue trousers (round 2c, after the key art: body-female's optional
 * cloth3 trousers shown, the pencil skirt and the skin under the trousers hidden), black shoes; long
 * purple-brown hair with violet highlights; gold hoop earrings; the comic face with red lips, lashes and violet lids.
 * Paint rules are matched per triangle (dress.js); y/z/x bounds are fractions of the body's height. */
(function () {
  'use strict';
  var JG = window.JG;
  var SKIN = '#C68B66', HAIR = '#3A1E3E', HAIR_HI = '#6E3683', BLAZER = '#1F4FD8', TOP = '#FFF8E7', TROUSERS = '#1A3FB8',
    GOLD = '#FFD21F', SHOES = '#111111', CREASE = '#0F2A85';
  var HEM_BONES = /^(pelvis|spine_01|thigh_[lr])$/;   // the jacket's open edge at the hem (not the cuffs or the neckline)
  var DATA = {
    from: 'body-female', height: 1.74, kind: 'exec', lookLimit: 0.61, defaultClip: 'idle',
    hide: ['hair2'],   // body-female's second hairstyle is the extras' bob
    paint: {
      base: SKIN,
      show: ['cloth3'],
      hideRules: [
        { part: 'cloth1', comp: { topMax: 0.66 } },          // the pencil skirt (the low piece of the suit)
        { part: 'skin', bones: /^(thigh|calf|foot|ball)/ }   // the legs and feet, inside the trousers and shoes
      ],
      rules: [
        { part: 'hair', yMin: 0.93, zMin: -0.01, color: HAIR_HI },
        { part: 'hair', yMin: 0.86, xMin: 0.045, zMin: -0.03, color: HAIR_HI },
        { part: 'hair', color: HAIR },
        { part: 'cloth2', comp: { topMin: 0.1 }, color: TROUSERS },   // the shoes' sock tops, under the trouser hems
        { part: 'cloth2', color: SHOES },
        // the white top in the V of the jacket
        { part: 'skin', bones: /^(spine_0[23]|clavicle|neck_01)$/, yMax: 0.835, color: TOP },
        // the trousers, and the jacket (the piece with sleeves)
        { part: 'cloth3', color: TROUSERS },
        // a thin navy hem line along the jacket's bottom edge (the same ink as the creases): a hem, not a belt
        { part: 'cloth1', comp: { topMin: 0.66 }, rimBand: 0.005, rimBones: HEM_BONES, color: CREASE },
        { part: 'cloth', color: BLAZER },
        { part: 'shell', bones: /^Head$/, color: GOLD }
      ],
      // stage 1d, after the key art: tailored suit trousers, not leggings. The slim cloth3 legs are loosened into a
      // straight leg (5 mm of ease, at least 5.6 cm round the leg axis from the knee down, 6.4 cm at the hem, so the
      // hem breaks over the shoe), with a pressed crease down the front of each leg in a darker blue
      legs: { part: 'cloth3', ease: 0.005, knee: 0.056, hem: 0.064, top: 0.82, fwd: 0.012, waist: { from: 0.84, top: 1.0 },
        crease: { color: CREASE, r: 0.0016, top: 0.76 } },
      // the jacket's hem: a thin ink line. It read as a thick black belt: a see-through ring under the open hem (the
      // leggings' waist dips at the front; legs.waist raises it) showing the hull's far side, plus the full hull at the hem
      inkRules: [
        { part: 'cloth1', comp: { topMin: 0.66 }, rimBand: 0.02, rimBones: HEM_BONES, ink: 0.45 }
      ]
    },
    shells: [
      { shape: 'torus', at: 'earL', offset: [0.006, -0.034, 0.006], r: 0.011, tube: 0.0022, rot: [0, Math.PI / 2, 0], color: GOLD, ink: 0.35, mirror: true }
    ],
    face: {
      neutral: 'confident',
      style: { skin: SKIN, lid: '#8A4E86', iris: '#4A2A1A', brow: '#2A1424', browW: 0.0029, lips: '#C0213A', lipFill: true, lashes: 'female', nose: 'soft' },
      frames: {
        confident: { eyes: 'half', brows: -0.25, mouth: 'smirk', look: [0.2, 0] },
        talk: { eyes: 'open', brows: 0.1, mouth: 'talk' },
        shock: { eyes: 'wide', brows: 0.9, browUp: 0.7, mouth: 'o' },
        halfSmile: { eyes: 'half', brows: 0.15, mouth: 'smile' }
      }
    },
    props: {}
  };
  JG.characters.register('exec', function (kit, info) { return JG.anim.human(kit, info, DATA); }, DATA);
})();
