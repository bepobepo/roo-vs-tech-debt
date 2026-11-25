/* JG.assets: the only loader (plan section 5). Relative fetch to an ArrayBuffer, then GLTFLoader.parse() with the
 * meshopt decoder for GLBs. Stage 0 step 5 covers GLBs and raw bytes; images, fonts and audio arrive with their
 * owners. An --embed build reads <script type="application/octet-stream" data-path> blocks first; JG.assets.url()
 * turns such a block into a blob URL for <img>, FontFace and CSS. */
(function () {
  'use strict';
  var JG = window.JG;
  var store = {}; // name -> {url, bytes, gltf?, buffer?}
  var blobUrls = {}; // path -> blob URL of an embedded file

  function embedded(url) {
    var els = document.querySelectorAll('script[type="application/octet-stream"][data-path]');
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute('data-path') === url) return b64ToBuffer(els[i].textContent);
    return null;
  }

  function b64ToBuffer(text) {
    var bin = atob(text.replace(/\s+/g, '')), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  /* A "<file>.b64.txt" URL holds the file as base64 text: the Artifact host does not serve .glb (found at the
   * Stage 0 step 5 smoke publish), so the publish build writes models that way and they are decoded here. */
  function fetchBytes(url) {
    return Promise.resolve().then(function () {
      var e = embedded(url);
      if (e) return e;
      // the Artifact publish set (pack.mjs --artifact) sets this flag and ships every .glb as <name>.glb.b64.txt
      var src = window.__JG_GLB_AS_TEXT && /\.glb$/i.test(url) ? url + '.b64.txt' : url;
      return fetch(src).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + src);
        return /\.b64\.txt$/i.test(src) ? r.text().then(b64ToBuffer) : r.arrayBuffer();
      });
    });
  }

  // extensionsUsed from the GLB's JSON chunk (header 12 bytes, then chunk length and type, then the JSON)
  function glbExtensions(buffer) {
    try {
      var dv = new DataView(buffer), len = dv.getUint32(12, true);
      var json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, len)));
      return json.extensionsUsed || [];
    } catch (e) { return []; }
  }

  /* The meshopt decoder needs WebAssembly. It is awaited only for files that use EXT_meshopt_compression, so the
   * plan's quantisation-only fallback build loads where WebAssembly is blocked. */
  function parseGLB(buffer, url) {
    var THREE = window.THREE, D = THREE.MeshoptDecoder;
    var needsMeshopt = glbExtensions(buffer).indexOf('EXT_meshopt_compression') >= 0;
    var ready = !needsMeshopt ? Promise.resolve()
      : (!D || D.supported === false || !D.ready) ? Promise.reject(new Error('WebAssembly unavailable: ' + url + ' needs the meshopt decoder'))
      : D.ready.catch(function (e) { throw new Error('WebAssembly unavailable: ' + url + ' needs the meshopt decoder (' + (e && e.message || e) + ')'); });
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        var loader = new THREE.GLTFLoader();
        if (D) loader.setMeshoptDecoder(D);
        loader.parse(buffer, url.replace(/[^/]*$/, ''), resolve, reject);
      });
    }).catch(function (e) { JG.error('assets', e); throw e; });
  }

  JG.assets = {
    /** load({name: url}, onProgress(p01)) -> Promise of {name: entry}. GLBs are parsed; anything else stays bytes. */
    load: function (manifest, onProgress) {
      var names = Object.keys(manifest), done = 0;
      return Promise.all(names.map(function (name) {
        var url = manifest[name];
        return fetchBytes(url).then(function (buf) {
          var entry = store[name] = { url: url, bytes: buf.byteLength };
          var p = /\.glb(\.b64\.txt)?$/i.test(url) ? parseGLB(buf, url).then(function (g) { entry.gltf = g; }) : Promise.resolve(entry.buffer = buf);
          return p.then(function () {
            done++;
            if (onProgress) onProgress(done / names.length);
            return entry;
          });
        });
      })).then(function () { return store; });
    },
    get: function (name) {
      if (!store[name]) throw new Error('JG.assets: "' + name + '" is not loaded');
      return store[name];
    },
    has: function (name) { return !!store[name]; },
    /** bytes(url) -> Promise of ArrayBuffer: an embedded block first (--embed build), else a relative fetch */
    bytes: fetchBytes,
    /** url(path) -> a URL for <img src> / FontFace / CSS: a blob URL when the --embed build carries the file inline,
     * else the relative path unchanged. Call it at use time (after the DOM exists), never at load. */
    url: function (path) {
      if (blobUrls[path]) return blobUrls[path];
      var e = embedded(path);
      if (!e || !window.URL || !URL.createObjectURL) return path;
      var ext = (path.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      var type = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2', mp3: 'audio/mpeg', json: 'application/json' }[ext.toLowerCase()] || 'application/octet-stream';
      return (blobUrls[path] = URL.createObjectURL(new Blob([e], { type: type })));
    },
    stats: function () {
      var out = {};
      Object.keys(store).forEach(function (k) { out[k] = { url: store[k].url, bytes: store[k].bytes }; });
      return out;
    }
  };
})();
