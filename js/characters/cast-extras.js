/* The extras (plan section 9: regular male and female bases, posed once and frozen, no mixer, hull off on the low
 * tier). OWNER: E7. Data only: the build runs in JG.anim.human with mixer: false; a play or pose samples the clip once
 * onto the bones. Instance n (cast ids extra1, extra2, extra3 or extra:3) picks its body and outfit from the tables
 * below; the default pose is per instance (1 seated reader, 2 standing, 3 typing, 4 seated reader), so a beat names
 * the pose it wants. In the office (2026-11-25): extra1, extra3 (lavender jacket) and extra4 (mustard blouse) type at
 * office.extraDesk1..3, extra2 waits at the printer.
 * STAGE 1b (2026-11-24, people pass): the bodies' real clothes and hair, recoloured per instance, plus a simple comic
 * face (open eyes, neutral mouth, blinking).
 * STAGE 1d (2026-11-24): the extras moved from the principals' bodies (body-female / body-male, 10-11k triangles each
 * with the hull) onto the light crowd bodies (body-crowd-female / body-crowd-male, about 2.5k + 2.5k hull), the plan's
 * 5k per-extra budget. Same looks, painted onto the crowd bodies' tee and jeans the way crowd.js paints its NPCs: even
 * instances a blouse and trousers in the old blouse and skirt colours, a ponytail (the old skirt and bob did not carry over:
 * see the notes in the tables below); odd instances an open jacket over a shirt, trousers, short hair. Both crowd bodies share the
 * principals' skeleton, so the extra clips (seatedReader, standing, typing) are unchanged. */
(function () {
  'use strict';
  var JG = window.JG;
  var TOPS = ['#6F8FAF', '#8FB39A', '#B5656B', '#A59ACF', '#C9B458', '#5E8C8A', '#D08A4E'];
  var INNER = ['#FFF8E7', '#E8E4D8', '#F2D7A0', '#FFFFFF', '#DCE6F0', '#F0E0E8', '#E8E4D8'];
  var BOTTOMS = ['#4A4F5C', '#5A5348', '#3F4A56', '#55505E', '#4B5248', '#2F3A4A', '#5C4A3E'];
  var SKINS = ['#D9A887', '#B57C5A', '#EBC3A8', '#8C5A3C', '#E0B08E', '#C68B66', '#F0C8A8'];
  var HAIRS = ['#2B2420', '#5A3A22', '#1B1B1E', '#7A6A55', '#3B2A20', '#A0522D', '#C8A060'];
  var IRIS = ['#5B3A22', '#3A5A7A', '#4A6A3A', '#2B2420', '#5B3A22', '#3A5A7A', '#4A6A3A'];
  var POSES = ['standing', 'seatedReader', 'standing', 'typing', 'seatedReader'];
  var SHOES = '#222226', HEM = 0.53;   // the top's hem, a fraction of the bind height (crowd.js HEM)
  function n(i) { return i % TOPS.length; }
  function female(i) { return i % 2 === 0; }

  /** paint rules on the crowd bodies (JG.dress; y, z, x are fractions of the body's bind height): the garment is one
   *  tee-and-jeans piece ('cloth'), trainers ('cloth2'), hair1 / hair2; the body under the clothes takes the clothes'
   *  colours so it never shows through as a skin patch */
  function paint(i) {
    var k = n(i), skin = SKINS[k], top = TOPS[k], inner = INNER[k], bottom = BOTTOMS[k], R = [];
    R.push({ part: 'hair', color: HAIRS[k] });
    R.push({ part: 'cloth2', color: SHOES });
    // the hem level at HEM (as crowd.js: spine_01 also weights the trousers' waistband at the centre front and back,
    // and the /^spine_/ rules below would otherwise pull a V of the top's colour down into the trousers there)
    R.push({ part: 'cloth', bones: /^spine_01$/, yMax: HEM, color: bottom });
    if (female(i)) {
      // the blouse and office trousers (on body-female they wore a pencil skirt; painted to the knee on the crowd
      // body's jeans it read as shorts, so the jeans stay full length in the skirt's colour)
      R.push({ part: 'cloth', bones: /^(spine_|clavicle|upperarm|lowerarm|neck_01)/, color: top });
      R.push({ part: 'cloth', bones: /^(pelvis|spine_01)$/, yMin: HEM, color: top });
      R.push({ part: 'cloth', yMin: HEM, color: top });
      R.push({ part: 'cloth', color: bottom });
    } else {
      // the open jacket over the shirt (a strip of shirt down the front), trousers
      R.push({ part: 'cloth', bones: /^(spine_|neck_01)/, yMin: 0.6, zMin: 0.02, xMax: 0.035, color: inner });
      R.push({ part: 'cloth', bones: /^(spine_|clavicle|upperarm|lowerarm|neck_01)/, color: top });
      R.push({ part: 'cloth', bones: /^(pelvis|spine_01)$/, yMin: HEM, color: top });
      R.push({ part: 'cloth', yMin: HEM, color: top });
      R.push({ part: 'cloth', color: bottom });
    }
    // the body: a hair-coloured scalp under the hair, skin at the head, neck and hands, everything under the clothes in
    // the clothes' colours
    R.push({ bones: /^Head$/, yMin: female(i) ? 0.955 : 0.962, color: HAIRS[k] });
    // the open shirt collar: the skin at the base of the neck, in front, inside the tee's round neckline
    if (!female(i)) R.push({ part: 'skin', bones: /^(spine_0[23]|clavicle_[lr])$/, zMin: 0.0, xMax: 0.04, color: inner });
    R.push({ bones: /^(Head|neck_01)$/, color: skin });
    R.push({ bones: /^(hand_|index|middle|ring|pinky|thumb)/, color: skin });
    R.push({ bones: /^spine_01$/, yMax: HEM, color: bottom });
    R.push({ bones: /^(spine_|clavicle|upperarm|lowerarm)/, color: top });
    R.push({ bones: /^pelvis$/, yMin: 0.56, color: top });
    R.push({ bones: /^(foot|ball)/, color: SHOES });
    R.push({ bones: /^(pelvis|thigh|calf)/, color: bottom });
    return { base: skin, rules: R };
  }
  var DATA = {
    from: function (i) { return female(i) ? 'body-crowd-female' : 'body-crowd-male'; },
    height: null, scale: 1, kind: 'extra', perInstance: true, mixer: false, lowHull: false,
    // female: the ponytail (the crowd body's bob has a deep fringe that hides the face of a seated or reading extra);
    // male: the short hair (hair2 is the afro)
    hide: function () { return ['hair2']; },
    paint: paint,
    face: function (i) {
      var k = n(i);
      return { neutral: 'neutral', style: { skin: SKINS[k], iris: IRIS[k], brow: HAIRS[k], lashes: female(i) ? 'female' : 'male', nose: female(i) ? 'soft' : 'hook', lips: female(i) ? '#B5524F' : '#9A5A50', lipFill: false },
        frames: { neutral: { eyes: 'open', brows: 0, mouth: 'flat' } } };
    }
  };
  JG.characters.register('extra', function (kit, info) {
    var i = info.instance || 0;
    var d = Object.assign({}, DATA, { defaultClip: POSES[i % POSES.length] });
    return JG.anim.human(kit, info, d);
  }, DATA);
})();
