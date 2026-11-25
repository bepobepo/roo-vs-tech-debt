/* The old lady (plan section 9: the regular female base scaled x0.88 on the rig root). OWNER: E7. Data only: the
 * build runs in JG.anim.human.
 * STAGE 1b (2026-11-24, people pass): body-female's clothes recoloured as a lavender cardigan over a white blouse, a
 * plum skirt, mauve tights and dark shoes; both hairstyles hidden, the scalp painted grey with a bun shell; round glasses (shells); the comic face
 * with grey brows and crow's feet (deadpan, smile). Handbag and knitting stand-in props. Her default clip is the seated
 * purse idle (she is only ever seen seated on the subway). The hunch additive under all her clips is Stage 3. */
(function () {
  'use strict';
  var JG = window.JG;
  var SKIN = '#EBC3A8', HAIR = '#C9C9CE', HAIR_DK = '#A9A9B2', CARDIGAN = '#B9A3D9', BLOUSE = '#FFF8E7',
    SKIRT = '#5E4E78', TIGHTS = '#6E5C70', SHOES = '#3A2A30', FRAMES = '#4A2238';
  var DATA = {
    from: 'body-female', scale: 0.88, kind: 'oldlady', lookLimit: 1.0, defaultClip: 'seatedPurseIdle',
    hide: ['hair'],
    paint: {
      base: SKIN,
      rules: [
        { part: 'skin', bones: /^Head$/, yMin: 0.967, color: HAIR },
        { part: 'skin', bones: /^Head$/, zMax: -0.012, yMin: 0.9, color: HAIR_DK },
        { part: 'cloth2', comp: { topMin: 0.1 }, color: TIGHTS },
        { part: 'cloth2', color: SHOES },
        { part: 'skin', bones: /^(thigh|calf|foot|ball)/, color: TIGHTS },
        { part: 'skin', bones: /^(spine_0[23]|clavicle|neck_01)$/, yMax: 0.835, color: BLOUSE },
        { part: 'cloth', comp: { topMax: 0.66 }, color: SKIRT },
        { part: 'cloth', color: CARDIGAN },
        { part: 'cloth', color: SKIRT }
      ]
    },
    shells: [
      { shape: 'sphere', at: 'crown', offset: [0, -0.022, -0.05], r: 0.04, scale: [1, 0.82, 0.9], seg: 10, color: HAIR },
      { shape: 'torus', at: 'eyeL', offset: [0, 0.002, 0.02], r: 0.0165, tube: 0.0018, seg: 14, color: FRAMES, ink: 0.3, mirror: true },
      { shape: 'cylinder', at: 'face', offset: [0, 0.003, 0.024], r: 0.0015, h: 0.026, seg: 5, rot: [0, 0, Math.PI / 2], color: FRAMES, ink: 0.3 },
      { shape: 'box', at: 'eyeL', offset: [0.03, 0.004, -0.03], w: 0.003, h: 0.003, d: 0.085, color: FRAMES, ink: 0.3, mirror: true }
    ],
    face: {
      neutral: 'deadpan',
      style: { skin: SKIN, iris: '#5A6A7A', brow: HAIR_DK, browW: 0.003, lips: '#B5656B', lashes: 'female', nose: 'soft', wrinkles: true },
      frames: {
        deadpan: { eyes: 'half', brows: -0.1, mouth: 'flat' },
        smile: { eyes: 'happy', brows: 0.3, mouth: 'smile', blush: true }
      }
    },
    props: { handbag: { along: 0.06 }, knitting: { along: 0.07 } }
  };
  JG.characters.register('oldlady', function (kit, info) { return JG.anim.human(kit, info, DATA); }, DATA);
})();
