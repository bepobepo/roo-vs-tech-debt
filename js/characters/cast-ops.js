/* The ops lead (plan section 9: 1.68 m, regular male base). OWNER: E7. Data only: the build runs in JG.anim.human.
 * STAGE 1b (2026-11-24, people pass): body-male carries MakeHuman CC0 clothes and hair. The ops lead shows the second
 * hairstyle (hair tied back in a ponytail) and wears the open jacket recoloured as a teal cardigan over a white shirt,
 * dark jeans and brown shoes, less saturated than the heroes, with an "OPS" badge on a magenta lanyard (shells). The comic
 * face carries the five contract expressions; cry and wail squeeze the eyes shut with tear streams. */
(function () {
  'use strict';
  var JG = window.JG;
  var SKIN = '#D9A887', HAIR = '#3B2A20', HAIR_HI = '#5A4030', CARDIGAN = '#2E7D84', CARDIGAN_DK = '#235F66', SHIRT = '#EDEAE0',
    JEANS = '#3F4B63', SHOES = '#4A3426', LANYARD = '#E0218A', BADGE = '#FFF8E7';
  var DATA = {
    from: 'body-male', height: 1.68, kind: 'ops', lookLimit: 1.0, defaultClip: 'idle',
    hide: ['hair1'],
    paint: {
      base: SKIN,
      rules: [
        { part: 'hair', yMin: 0.95, zMin: 0.0, color: HAIR_HI },
        { part: 'hair', color: HAIR },
        // The fitted ponytail touches the scalp at the crown. Match its base colour inside the hairline.
        { part: 'skin', bones: /^Head$/, yMin: 0.982, xMax: 0.045, zMin: -0.039, zMax: 0.004, color: HAIR },
        { part: 'cloth2', comp: { topMin: 0.1 }, color: '#2A2E3A' },   // socks
        { part: 'cloth2', color: SHOES },
        // the shirt in the V of the cardigan; under the cardigan's back the skin is cardigan-coloured (no poke-through)
        { part: 'skin', bones: /^(spine_0[23]|clavicle)$/, zMin: 0.0, yMax: 0.82, color: SHIRT },
        { part: 'skin', bones: /^(spine_0[123]|clavicle|pelvis)$/, zMax: 0.0, color: CARDIGAN },
        // the jeans (the low piece), the shirt and its collar (the narrow pieces), the cardigan (the piece with sleeves)
        { part: 'cloth', comp: { topMax: 0.66 }, color: JEANS },
        { part: 'cloth', comp: { wideMax: 0.13, bottomMin: 0.62 }, color: CARDIGAN_DK },   // the cardigan's collar
        { part: 'cloth', comp: { wideMax: 0.13 }, color: SHIRT },
        { part: 'cloth', bones: /^(lowerarm|hand)/, yMax: 0.62, color: CARDIGAN_DK },
        { part: 'cloth', color: CARDIGAN }
      ]
    },
    shells: [
      { shape: 'tube', at: 'chest', bone: 'spine_03', points: [[0.06, 0.12, -0.05], [0.055, 0.07, 0.0], [0.03, 0.0, 0.012], [0.006, -0.05, 0.016]], r: 0.0035, seg: 10, color: LANYARD, ink: 0.4, mirror: true },
      { shape: 'box', at: 'chest', bone: 'spine_03', offset: [0, -0.095, 0.02], w: 0.05, h: 0.068, d: 0.004, color: BADGE, ink: 0.5 },
      { shape: 'box', at: 'chest', bone: 'spine_03', offset: [0, -0.07, 0.024], w: 0.05, h: 0.016, d: 0.003, color: LANYARD, ink: 0.3 }
    ],
    face: {
      neutral: 'worried',
      style: { skin: SKIN, iris: '#3A5A7A', brow: HAIR, browW: 0.0036, lips: '#A5574F', lashes: 'male', nose: 'hook' },
      frames: {
        worried: { eyes: 'open', brows: 0.85, mouth: 'frown', look: [0, 0.1] },
        plead: { eyes: 'wide', brows: 1, browUp: 0.4, mouth: 'o' },
        cry: { eyes: 'squeeze', brows: 1, mouth: 'sad', tears: true },
        wail: { eyes: 'squeeze', brows: 1, browUp: 0.3, mouth: 'wail', tears: true },
        relieved: { eyes: 'happy', brows: 0.5, mouth: 'smile', blush: true }
      }
    }
  };
  JG.characters.register('ops', function (kit, info) { return JG.anim.human(kit, info, DATA); }, DATA);
})();
