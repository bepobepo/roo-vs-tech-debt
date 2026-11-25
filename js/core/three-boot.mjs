// The only module (plan section 5). Imports three r160 and the addons through the import map, then sets
// window.THREE synchronously, before any `defer` script runs. No top-level await: it would let the defer scripts
// run first. MeshoptDecoder.ready is awaited inside JG.assets.
import * as THREE_NS from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as Pinata from 'three-pinata';

// A copy, because a module namespace is read-only; the classes are the same objects, so instanceof still works.
// Breaker is three-pinata's module namespace (DestructibleMesh, FractureOptions, SliceOptions): Stage 0 step 5.
window.THREE = Object.assign({}, THREE_NS, { GLTFLoader, SkeletonUtils, BufferGeometryUtils, OutlineEffect, MeshoptDecoder, Breaker: Pinata });
// ZzFX (site/vendor/zzfx.js, MIT) is an ES module, so classic scripts cannot import it: it is exposed as JG.vendor.
// Its ZZFX object runs `new AudioContext` at import, which throws where Web Audio is missing, so it is loaded by a
// guarded dynamic import (a path relative to this module, so the Stage 0 dev pages work without an import map entry)
// and never blocks THREE. The game's audio (E6) does not use it; audio.js only re-points ZZFX.audioContext if present.
// JG is created here if ns.js has not run yet (it keeps an existing JG).
window.JG = window.JG || {};
window.JG.vendor = window.JG.vendor || {};
if (typeof window.AudioContext === 'function') {
  import('../../vendor/zzfx.js').then((m) => { Object.assign(window.JG.vendor, { zzfx: m.zzfx, ZZFX: m.ZZFX }); }, () => {});
}
console.log('JG boot ok r' + THREE_NS.REVISION);
