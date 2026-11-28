/* JG.ui, part 1 of 4 (E5, plan sections 6 "UI" and 11): the in-game HUD, in the look of dev/portrait/mock.html.
 * Classic IIFE; touches neither THREE nor the DOM at load (everything is built in init()).
 *
 *   init(root)  update(dt, {camera, rect})  reset({keepStage})  setInputMode(mode)  stagePanel(on)
 *   subtitles.show({speaker, text}) / hide()        speech box with a coloured speaker tab (tail points at the stage)
 *   objective.show(text, {side?}) / hide()          yellow caption box, top-left of the stage; side: [{id, text, done}]
 *                                                   adds the side quests under it (the full list in 'wide'; one compact
 *                                                   "SIDE QUESTS 1/3" line with tick boxes on the phone layouts; a tick
 *                                                   is a re-show with the item done, as w.roam does)
 *   beacon.set(worldPos | null)                     magenta comic arrow over the goal; an edge arrow when off-screen
 *   prompt.show({options}) -> {hide, strike(action, tag), shake(action), pulse(action)}   yellow pill chips, plain
 *                                                   letter discs, fire on pointerdown
 *   hint.show(text, {tap}) / hide()                 the "Take me there" chip (tap: a function or an action)
 *   skip.show() / hide() / setProgress(p)           the hold chip (ring fills while held)
 *   fade.to(a, sec, color)  transition.play('wipe'|'iris'|'fade', 'in'|'out', sec)  letterbox.set(on)
 *   card.show({text, style: 'timecard'|'caption'}, sec)   lettering.show(text, worldPos | Object3D, sec)
 *   speechBalloon.show(text, headAnchor, sec, keepClearAnchor?)  dialogue that follows its speaker
 *   callerCard.show({name, level}) / hide()         comic inset, generic "L" avatar, jagged "RING! RING!" while level > 0
 *   nowPlaying.show(text) / hide()
 * Parts 2-4 (touch.js, title-end.js, radar.js) add the joystick, mute and notices; title, loading, end and credits;
 * and radar. They share JG.ui._ (helpers and hooks: build, update, reset, mode, layout).
 *
 * Layout: core's #game carries data-layout and --stage-w/--stage-h. The UI root carries data-ui-layout:
 *   'portrait'  the stage is the top 1:1 panel; the dock (subtitle, chips, hint) sits on the paper below it
 *   'wide'      landscape (or full-stage) at least 600 px wide: the dock overlays the bottom of the stage
 *   'narrow'    full-stage (Radar close-up) on a portrait phone: the dock overlays the bottom, full width
 * Every string comes from JG.text / JG.LINES (verbatim; no CSS text-transform on script text). Fire-and-forget
 * members return {duration, stop()}. Times are game time (ui.update's dt), so transitions follow the time scale. */
(function () {
  'use strict';
  var JG = window.JG;
  var PI = Math.PI;

  var ui = JG.ui = JG.ui || {};
  var H = ui._ = ui._ || {};
  H.hooks = H.hooks || { build: [], update: [], reset: [], mode: [], layout: [] };
  H.el = H.el || {};
  var el = H.el;

  // ---------------------------------------------------------------- helpers shared by the four ui files
  H.T = function (k) { return JG.text(k); };
  /** an optional JG.TEXT key with a local fallback (JG.text returns the key itself when it is missing) */
  H.opt = function (k, fallback) { var v = JG.text(k); return v === k ? fallback : v; };
  H.mk = function (tag, cls, parent, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent !== false) (parent || el.ui).appendChild(e);
    return e;
  };
  H.text = function (e, s) { e.textContent = s == null ? '' : String(s); return e; };
  H.svg = function (parent, cls, markup, attrs) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (cls) s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    s.innerHTML = markup;
    if (parent) parent.appendChild(s);
    return s;
  };
  H.handle = function (duration, stop) { return { duration: duration || 0, stop: stop || function () {} }; };
  H.easeOut = function (x) { x = Math.max(0, Math.min(1, x)); return 1 - (1 - x) * (1 - x) * (1 - x); };
  H.easeInOut = function (x) { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  /** touch affordances: a coarse pointer, or the last input came from a touch */
  H.isTouch = function () {
    if (JG.input && JG.input.lastSource === 'touch') return true;
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  };
  /** pointer source for JG.input.inject: 'touch' for fingers and pens, 'mouse' otherwise */
  H.src = function (e) { return e && e.pointerType === 'mouse' ? 'mouse' : 'touch'; };
  H.rect = function () {
    var L = JG.loop;
    if (L && L.renderer && L.rect) return L.rect;
    var W = window.innerWidth || 1, Hh = window.innerHeight || 1;
    return { x: 0, y: 0, w: W, h: Hh, W: W, H: Hh, portrait: false };
  };
  H.built = false;
  H.t = 0; // UI time (game time while the loop runs)

  // ---------------------------------------------------------------- CSS
  var CSS = [
    '.jg-ui{position:absolute;inset:0;pointer-events:none;z-index:2;color:#111;font:700 16px/1.3 "Comic Neue","Comic Sans MS",system-ui,sans-serif;',
    '  --sw:var(--stage-w,100%);--sh:var(--stage-h,100%);--sat:env(safe-area-inset-top,0px);--sar:env(safe-area-inset-right,0px);',
    '  --sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px);--blue:#1F4FD8;--yellow:#FFD21F;--magenta:#E0218A;--ink:#111;--paper:#FFF8E7;',
    '  --display:Bangers,"Comic Neue",Impact,sans-serif;--comic:"Comic Neue","Comic Sans MS",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}',
    '.jg-ui *{box-sizing:border-box}',
    '.jg-ui [hidden]{display:none!important}',
    '.jg-ui button{pointer-events:auto;font:inherit;color:inherit;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none;margin:0}',
    '.jg-ui svg{display:block}',
    // stage box: the 3D stage rect; everything that belongs to the picture is clipped to it
    '.jg-sb{position:absolute;left:0;top:0;width:var(--sw);height:var(--sh);overflow:hidden}',
    '.jg-fx{position:absolute;inset:0;z-index:1}',
    '.jg-fx .ht{position:absolute;inset:0;mix-blend-mode:multiply;background-image:radial-gradient(rgba(17,17,17,.12) 1px,transparent 1.3px);background-size:5px 5px;',
    '  -webkit-mask-image:linear-gradient(160deg,transparent 40%,#000 100%);mask-image:linear-gradient(160deg,transparent 40%,#000 100%)}',
    '.jg-fx .vg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 60%,rgba(17,17,17,.26) 100%)}',
    '#game[data-quality=low] .jg-fx{display:none}',
    // paper area under the portrait stage
    '.jg-paper{display:none;position:absolute;left:0;right:0;top:var(--sh);bottom:0;z-index:0;border-top:3px solid var(--ink);',
    '  background-color:var(--paper);background-image:radial-gradient(rgba(17,17,17,.075) 1.1px,transparent 1.4px);background-size:7px 7px}',
    '.jg-ui[data-ui-layout=portrait] .jg-paper{display:block}',
    // letterbox and stage panel
    '.jg-lb{position:absolute;left:0;right:0;height:0;background:var(--ink);z-index:4;transition:height .35s ease}',
    '.jg-lb.top{top:0}.jg-lb.bot{bottom:0}',
    '.jg-ui.lb-on .jg-lb{height:calc(var(--sh) * .11)}',
    '.jg-panel{position:absolute;inset:0;z-index:5;border:0 solid var(--paper);box-shadow:inset 0 0 0 5px var(--ink)}',
    // top stacks and the caller card
    '.jg-tl{position:absolute;z-index:9;left:calc(10px + var(--sal));top:calc(10px + var(--sat));display:flex;flex-direction:column;align-items:flex-start;gap:8px;',
    '  max-width:min(calc(100% - 96px),400px);transition:top .25s ease}',
    '.jg-tr{position:absolute;z-index:9;right:calc(10px + var(--sar));top:calc(10px + var(--sat));display:flex;flex-direction:column;align-items:flex-end;gap:8px;transition:top .25s ease}',
    '.jg-ui.caller-on .jg-tl,.jg-ui.caller-on .jg-tr{top:calc(88px + var(--sat))}',
    '.jg-cap{position:relative;padding:5px 10px 5px;background:var(--yellow);border:3px solid var(--ink);box-shadow:3px 3px 0 var(--ink);font:700 14px/1.2 var(--comic);',
    '  animation:jg-drop .28s ease-out}',
    '.jg-cap b{display:block;margin-bottom:2px;font:400 12px/1 var(--display);letter-spacing:.09em;color:var(--blue)}',
    '.jg-cap.caption{background:var(--paper);font:400 20px/1.05 var(--display);letter-spacing:.04em;padding:6px 12px 4px}',
    // side quests under the objective: a list in 'wide', one compact line otherwise
    '.jg-cap .sq{margin-top:5px;padding-top:4px;border-top:2px dashed rgba(17,17,17,.35)}',
    '.jg-cap .sq b{margin-bottom:3px;color:var(--magenta)}',
    '.jg-cap .sq ul{list-style:none;margin:0;padding:0;font:700 13px/1.25 var(--comic)}',
    '.jg-cap .sq li{display:flex;align-items:center;gap:6px}',
    '.jg-cap .sq i{flex:none;display:inline-block;width:12px;height:12px;border:2px solid var(--ink);background:#fff;border-radius:2px;position:relative}',
    '.jg-cap .sq li.done i,.jg-cap .sq .tk.done{background:var(--blue)}',
    '.jg-cap .sq li.done i::after,.jg-cap .sq .tk.done::after{content:"";position:absolute;left:2px;top:-1px;width:4px;height:7px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(40deg)}',
    '.jg-cap .sq li.done span{text-decoration:line-through 2px var(--magenta);color:#555}',
    '.jg-cap .sq .line{display:none;align-items:center;gap:5px;font:400 12px/1 var(--display);letter-spacing:.08em;color:var(--magenta)}',
    '.jg-ui:not([data-ui-layout=wide]) .jg-cap .sq{margin-top:3px;padding-top:3px}',
    '.jg-ui:not([data-ui-layout=wide]) .jg-cap .sq b,.jg-ui:not([data-ui-layout=wide]) .jg-cap .sq ul{display:none}',
    '.jg-ui:not([data-ui-layout=wide]) .jg-cap .sq .line{display:flex}',
    '.jg-caller{position:absolute;z-index:9;left:50%;top:calc(10px + var(--sat));display:flex;align-items:center;gap:10px;padding:6px 16px 6px 6px;background:#fff;',
    '  border:3px solid var(--ink);border-radius:14px;box-shadow:4px 4px 0 var(--ink);transform:translateX(-50%) rotate(-1.5deg);animation:jg-caller-in .3s ease-out}',
    '.jg-caller .av{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--magenta);border:3px solid var(--ink);color:#fff;',
    '  font:400 27px/1 var(--display);padding-top:2px}',
    '.jg-caller .nm{font:400 25px/1 var(--display);letter-spacing:.07em;padding-top:2px}',
    '.jg-caller .ph{flex:none;width:24px;height:24px}',
    '.jg-caller.ringing .ph{animation:jg-buzz .18s linear infinite}',
    '.jg-caller .ring{position:absolute;left:calc(100% - 22px);top:-14px;width:118px;height:74px;display:none;transform:rotate(8deg);animation:jg-buzz .22s linear infinite}',
    '.jg-caller.ringing .ring{display:block}',
    '.jg-caller .ring svg{position:absolute;inset:0;width:100%;height:100%}',
    '.jg-caller .ring span{position:absolute;inset:0;display:grid;place-items:center;font:400 18px/1 var(--display);letter-spacing:.04em;color:var(--magenta);',
    '  -webkit-text-stroke:1px var(--ink);paint-order:stroke fill;padding:4px 6px 0;white-space:nowrap}',
    '.jg-now{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 5px 10px;background:var(--ink);color:var(--yellow);border-radius:999px;',
    '  box-shadow:2px 2px 0 var(--magenta);font:400 15px/1 var(--display);letter-spacing:.08em;animation:jg-drop .3s ease-out;max-width:260px}',
    '.jg-now i{display:inline-flex;align-items:flex-end;gap:2px;height:13px}',
    '.jg-now i b{display:block;width:3px;background:var(--yellow);animation:jg-eq .7s ease-in-out infinite alternate}',
    '.jg-now i b:nth-child(2){animation-delay:-.25s}.jg-now i b:nth-child(3){animation-delay:-.5s}',
    // in-world lettering and the beacon
    '.jg-lets{position:absolute;inset:0;z-index:3}',
    '.jg-let{position:absolute;left:0;top:0;white-space:nowrap;font:400 clamp(30px,calc(var(--sh) * .115),76px)/1 var(--display);letter-spacing:.03em;color:var(--c,var(--yellow));',
    '  -webkit-text-stroke:2px var(--ink);paint-order:stroke fill;text-shadow:3px 3px 0 var(--ink);will-change:transform,opacity}',
    '.jg-balloon{position:absolute;left:0;top:0;padding:.4em .75em .78em;white-space:nowrap;color:var(--ink);',
    '  font:700 clamp(18px,min(calc(var(--sw) * .05),calc(var(--sh) * .072)),52px)/1 var(--comic);will-change:transform,opacity}',
    '.jg-balloon svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(2px 2px 0 var(--ink))}',
    '.jg-balloon[data-side=left] svg{transform:scaleX(-1)}.jg-balloon[data-side=below] svg{transform:scaleY(-1)}',
    '.jg-balloon[data-side=below]{padding-top:.78em;padding-bottom:.4em}.jg-balloon span{position:relative}',
    '.jg-beacon{position:absolute;left:0;top:0;width:36px;height:44px;margin:-22px 0 0 -18px;z-index:3;will-change:transform}',
    '.jg-beacon svg{width:100%;height:100%;overflow:visible}',
    // time card
    '.jg-card{position:absolute;z-index:10;left:50%;top:50%;max-width:calc(100% - 32px);text-align:center;padding:12px 26px 8px;background:var(--yellow);',
    '  border:4px solid var(--ink);box-shadow:6px 6px 0 var(--ink),6px 6px 0 3px var(--blue);font:400 clamp(28px,calc(var(--sh) * .1),64px)/1 var(--display);white-space:nowrap;',
    '  letter-spacing:.05em;transform:translate(-50%,-50%) rotate(-2deg) scale(var(--s,1));opacity:var(--o,1)}',
    // covers: fade and transitions
    '.jg-fade{position:absolute;inset:0;z-index:7;background:#000;opacity:0}',
    '.jg-trans{position:absolute;inset:0;z-index:8;opacity:0;overflow:hidden}',
    '.jg-trans[data-kind=fade]{background:var(--ink)}',
    '.jg-wipe{position:absolute;left:0;top:0;height:100%;display:flex;will-change:transform}',
    '.jg-wipe i{display:block;height:100%;flex:none;transform:skewX(-20deg)}',
    '.jg-wipe i.m{background:var(--magenta)}.jg-wipe i.y{background:var(--yellow)}',
    '.jg-wipe i.p{background-color:var(--blue);background-image:radial-gradient(rgba(255,255,255,.16) 1.4px,transparent 1.7px);background-size:9px 9px;margin:0 -1px}',
    '.jg-iris{position:absolute;left:50%;top:50%;border-radius:50%;border:6px solid var(--magenta);box-shadow:0 0 0 3px var(--ink),0 0 0 300vmax var(--ink)}',
    // dock: subtitle, chips, hint, notices
    '.jg-dock{position:absolute;z-index:12;display:flex;flex-direction:column;align-items:center;gap:10px}',
    '.jg-ui[data-ui-layout=portrait] .jg-dock{left:calc(12px + var(--sal));right:calc(12px + var(--sar));top:calc(var(--sh) + 16px)}',
    '.jg-ui[data-ui-layout=wide] .jg-dock{left:50%;width:min(760px,calc(100% - 340px));bottom:calc(14px + var(--sab));transform:translateX(-50%)}',
    '.jg-ui[data-ui-layout=narrow] .jg-dock{left:calc(12px + var(--sal));right:calc(12px + var(--sar));bottom:calc(76px + var(--sab))}',
    '.jg-sub{position:relative;max-width:100%;margin-top:14px;padding:17px 16px 10px;background:#fff;border:3px solid var(--ink);border-radius:16px;',
    '  box-shadow:4px 4px 0 var(--ink);font:700 18px/1.32 var(--comic);text-align:left;animation:jg-pop .18s ease-out}',
    '.jg-ui[data-ui-layout=portrait] .jg-sub{align-self:stretch;font-size:17px}',
    '.jg-sub::before{content:"";position:absolute;right:18px;top:-21px;width:30px;height:19px;background:var(--ink);clip-path:polygon(100% 0,62% 100%,0 100%)}',
    '.jg-sub::after{content:"";position:absolute;right:24px;top:-12px;width:19px;height:12px;background:#fff;clip-path:polygon(100% 0,64% 100%,0 100%)}',
    '.jg-sub.phone{border-style:dashed}',
    '.jg-sub.phone::before,.jg-sub.phone::after{display:none}',
    '.jg-sub .tab{position:absolute;left:12px;top:-15px;padding:3px 10px 1px;background:var(--tab,var(--blue));color:var(--tabt,#fff);border:3px solid var(--ink);',
    '  border-radius:6px;transform:rotate(-2deg);font:400 16px/1 var(--display);letter-spacing:.08em;white-space:nowrap}',
    '.jg-sub .dir{font-style:italic;color:#555}',
    '.jg-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;width:100%}',
    '.jg-ui[data-ui-layout=portrait] .jg-chips{flex-direction:column;align-items:stretch}',
    '.jg-chip{position:relative;display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:6px 20px 6px 7px;background:var(--yellow);border:3px solid var(--ink);',
    '  border-radius:999px;box-shadow:3px 3px 0 var(--ink);font:700 18px/1.15 var(--comic);text-align:left;animation:jg-pop .22s ease-out}',
    '.jg-chip:not(.primary){background:#FFE36E}',
    '.jg-chip:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink)}',
    '.jg-chip .disc{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#fff;border:3px solid var(--ink);font:700 19px/1 var(--comic)}',
    '.jg-chip.struck{background:#EAE3CF;color:#6b6b6b;box-shadow:3px 3px 0 #6b6b6b}',
    '.jg-chip.struck .disc{background:#f4f1e8;color:#6b6b6b}',
    '.jg-chip.struck .txt{text-decoration:line-through 3px var(--magenta)}',
    '.jg-chip em{flex:none;margin-left:auto;padding:3px 8px 1px;background:var(--magenta);color:#fff;border:3px solid var(--ink);transform:rotate(6deg);',
    '  font:400 18px/1 var(--display);font-style:normal;letter-spacing:.06em;white-space:nowrap;animation:jg-stamp .25s ease-out}',
    '.jg-chip.pulse{animation:jg-pulse .9s ease-in-out infinite}',
    '.jg-chip.shake{animation:jg-shake .35s linear}',
    '.jg-hint{display:inline-flex;align-items:center;gap:9px;min-height:48px;padding:5px 18px 5px 6px;background:#fff;border:3px solid var(--ink);border-radius:999px;',
    '  box-shadow:3px 3px 0 var(--ink);font:700 16px/1.1 var(--comic);animation:jg-pop .22s ease-out}',
    '.jg-hint .disc{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--magenta);border:3px solid var(--ink)}',
    '.jg-hint .disc svg{width:16px;height:16px}',
    // skip hold chip
    '.jg-skip{position:absolute;z-index:12;display:inline-flex;align-items:center;gap:7px;min-height:44px;min-width:44px;padding:4px 14px 4px 5px;',
    '  background:rgba(255,248,231,.95);border:3px solid var(--ink);border-radius:999px;box-shadow:2px 2px 0 var(--ink);font:700 14px/1 var(--comic);touch-action:none}',
    '.jg-skip svg{flex:none;width:30px;height:30px}',
    '.jg-skip .pr{transition:stroke-dashoffset .05s linear}',
    '.jg-ui[data-ui-layout=portrait] .jg-skip{right:calc(70px + var(--sar));bottom:calc(16px + var(--sab))}',
    '.jg-ui[data-ui-layout=wide] .jg-skip{right:calc(14px + var(--sar));bottom:calc(14px + var(--sab))}',
    '.jg-ui[data-ui-layout=narrow] .jg-skip{right:calc(70px + var(--sar));bottom:calc(16px + var(--sab))}',
    // keyframes
    '@keyframes jg-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.05);opacity:1}100%{transform:scale(1)}}',
    '@keyframes jg-drop{0%{transform:translateY(-10px);opacity:0}100%{transform:none;opacity:1}}',
    '@keyframes jg-caller-in{0%{transform:translateX(-50%) translateY(-24px) rotate(-6deg);opacity:0}100%{transform:translateX(-50%) rotate(-1.5deg);opacity:1}}',
    '@keyframes jg-buzz{0%,100%{translate:0 0}25%{translate:-1.5px 1px}50%{translate:1.5px -1px}75%{translate:-1px -1px}}',
    '@keyframes jg-eq{0%{height:3px}100%{height:13px}}',
    '@keyframes jg-pulse{0%,100%{box-shadow:3px 3px 0 var(--ink),0 0 0 0 rgba(224,33,138,0)}50%{box-shadow:3px 3px 0 var(--ink),0 0 0 8px rgba(224,33,138,.4)}}',
    '@keyframes jg-shake{20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(4px)}}',
    '@keyframes jg-stamp{0%{transform:rotate(6deg) scale(2);opacity:0}100%{transform:rotate(6deg) scale(1);opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.jg-ui *{animation-duration:.01s!important;animation-iteration-count:1!important}}'
  ].join('\n');

  // speaker tab colours: the June three on the heroes, teal (the ops lead's tie) for the ops lead
  var TABS = { ROO: ['#1F4FD8', '#fff'], LAUREN: ['#E0218A', '#fff'], OPS: ['#0E8C8C', '#fff'], EXEC: ['#FFD21F', '#111'],
    // office-walk's gossipers (their tops) and the face scanner (its beam)
    BRENDA: ['#5E8C8A', '#fff'], GARY: ['#5A3A22', '#fff'], SCANNER: ['#3fe0ff', '#111'], LADY: ['#B9A3D9', '#111'] };
  var ARROW = '<path d="M9 2h18v19h8L18 42 1 21h8z" fill="#E0218A" stroke="#111" stroke-width="3.2" stroke-linejoin="round"/>' +
    '<path d="M13 6h4v15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".65"/>';
  var PHONE = '<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" fill="#111"/>';
  var BURST = '<polygon points="4,30 18,22 10,8 30,14 38,1 50,12 66,2 72,15 92,6 90,20 114,18 102,32 116,44 98,48 108,66 86,58 78,72 64,60 50,72 44,58 24,68 26,52 4,52 14,40" fill="#FFD21F" stroke="#111" stroke-width="3" stroke-linejoin="round"/>';

  // ---------------------------------------------------------------- state
  var fade = { a: 0, from: 0, to: 0, t: 0, sec: 0, shown: -1 };
  var trans = { a: 0, from: 0, to: 0, t: 0, sec: 0, dir: 'in', kind: 'fade', shown: -1, W: 0, H: 0 };
  var card = null, letters = [], beacon = { pos: null, obj: null, x: -1, y: -1 }, promptGen = 0, panel = { on: false, p: 0 };
  var layoutKey = '', v3 = null, v3b = null;

  function E() { return el; }
  function dom() {
    if (H.built) return el;
    var root = H.root = H.root || document.getElementById('game') || document.body;
    JG.css('ui-hud', CSS);
    var mk = H.mk;
    el.ui = mk('div', 'jg-ui', root, { id: 'jg-ui', 'data-ui-layout': 'wide', 'data-input': 'cine' });
    el.paper = mk('div', 'jg-paper', el.ui, { 'aria-hidden': 'true' });
    el.sb = mk('div', 'jg-sb', el.ui, { 'data-ui': 'stagebox' });
    el.fx = mk('div', 'jg-fx', el.sb, { 'aria-hidden': 'true' });
    mk('div', 'ht', el.fx); mk('div', 'vg', el.fx);
    el.letters = mk('div', 'jg-lets', el.sb, { 'aria-hidden': 'true' });
    el.speech = mk('div', 'jg-lets', el.sb, { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    el.beacon = mk('div', 'jg-beacon', el.sb, { 'data-ui': 'beacon' }); el.beacon.hidden = true;
    H.svg(el.beacon, '', ARROW, { viewBox: '0 0 36 44' });
    el.lbTop = mk('div', 'jg-lb top', el.sb); el.lbBot = mk('div', 'jg-lb bot', el.sb);
    el.panel = mk('div', 'jg-panel', el.sb, { 'data-ui': 'panel' }); el.panel.hidden = true;
    el.radarSlot = mk('div', '', el.sb); el.radarSlot.style.display = 'contents';
    el.card = mk('div', 'jg-card', el.sb, { 'data-ui': 'card', role: 'status' }); el.card.hidden = true;
    el.tl = mk('div', 'jg-tl', el.sb);
    el.objective = mk('div', 'jg-cap', el.tl, { 'data-ui': 'objective' }); el.objective.hidden = true;
    el.caption = mk('div', 'jg-cap caption', el.tl, { 'data-ui': 'card' }); el.caption.hidden = true;
    el.caller = mk('div', 'jg-caller', el.sb, { 'data-ui': 'caller' }); el.caller.hidden = true;
    el.tr = mk('div', 'jg-tr', el.sb);
    el.now = mk('div', 'jg-now', el.tr, { 'data-ui': 'now-playing' }); el.now.hidden = true;
    el.fade = mk('div', 'jg-fade', el.sb, { 'data-ui': 'fade' });
    el.trans = mk('div', 'jg-trans', el.sb, { 'data-ui': 'transition', 'data-kind': 'fade' });
    el.dock = mk('div', 'jg-dock', el.ui, { 'data-ui': 'dock' });
    el.sub = mk('div', 'jg-sub', el.dock, { 'data-ui': 'subtitle', 'aria-live': 'polite' }); el.sub.hidden = true;
    el.chips = mk('div', 'jg-chips', el.dock, { 'data-ui': 'prompt' });
    el.hint = mk('button', 'jg-hint', el.dock, { 'data-ui': 'hint', type: 'button' }); el.hint.hidden = true;
    el.skip = mk('button', 'jg-skip', el.ui, { 'data-ui': 'skip', type: 'button' }); el.skip.hidden = true;
    buildSkip();
    H.built = true;
    relayout();
    H.hooks.build.forEach(function (fn) { safe('ui build', fn); });
    JG.on('layout', relayout);
    return el;
  }
  H.dom = dom;
  function safe(where, fn) { try { return fn(); } catch (e) { JG.error(where, e); } }

  function relayout() {
    if (!el.ui) return;
    // the Radar close-up covers the whole viewport: a portrait phone then docks at the bottom like 'narrow'
    var r = H.rect(), W = r.W || r.w, mode = r.portrait && !H.radarOn ? 'portrait' : (W >= 600 ? 'wide' : 'narrow');
    var key = mode + ':' + r.w + 'x' + r.h + ':' + (r.W || 0) + 'x' + (r.H || 0);
    if (key === layoutKey) return;
    layoutKey = key;
    el.ui.setAttribute('data-ui-layout', mode);
    trans.W = 0; // re-measure the wipe
    H.hooks.layout.forEach(function (fn) { safe('ui layout', function () { fn(r, mode); }); });
  }
  H.relayout = relayout;

  // ---------------------------------------------------------------- projection (world -> stage pixels)
  function project(p, cam, r) {
    v3 = v3 || new window.THREE.Vector3();
    v3.copy(p).project(cam);
    var behind = v3.z > 1;
    return { x: (v3.x + 1) / 2 * r.w, y: (1 - v3.y) / 2 * r.h, behind: behind, on: !behind && Math.abs(v3.x) <= 1 && Math.abs(v3.y) <= 1 };
  }
  function worldOf(L) {
    if (L.obj) { v3b = v3b || new window.THREE.Vector3(); return L.obj.getWorldPosition(v3b); }
    return L.pos;
  }

  // ---------------------------------------------------------------- in-world lettering placement
  // Lettering sits beside its anchor (a head, usually) but never on it, always whole on the stage and clear of the
  // HUD chips: above the anchor if it fits there, else to its right, its left or below it, scaled down only when no
  // side has room. LETTER_R is the anchor's keep-out radius in metres (a head with a snout and ears).
  var LETTER_R = 0.3, v3c = null;
  function headRadius(p, cam, r, q) {
    v3c = v3c || new window.THREE.Vector3();
    v3c.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(LETTER_R).add(p);
    var e = project(v3c, cam, r);
    return Math.max(18, Math.min(r.h * 0.45, Math.hypot(e.x - q.x, e.y - q.y)));
  }
  /** the text's rotated box and the HUD chips to keep clear of, measured once per layout */
  function letterBoxes(L, r) {
    var key = r.w + 'x' + r.h;
    if (L.key === key) return;
    L.key = key; L.side = null;
    var w = L.e.offsetWidth || 1, h = L.e.offsetHeight || 1, a = Math.abs(L.rot) * PI / 180;
    L.bw = w * Math.cos(a) + h * Math.sin(a); L.bh = w * Math.sin(a) + h * Math.cos(a);
    L.obs = [];
    var sb = el.sb.getBoundingClientRect();
    el.ui.querySelectorAll('[data-ui="caller"],[data-ui="mute"],[data-ui="skip"],[data-ui="objective"],[data-ui="now-playing"]').forEach(function (n) {
      if (n.hidden || !n.getClientRects().length) return;
      var b = n.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return;
      L.obs.push([b.left - sb.left - 6, b.top - sb.top - 6, b.right - sb.left + 6, b.bottom - sb.top + 6]);
    });
  }
  /** the centre and scale of a lettering: q is the anchor on the stage, rad its keep-out radius in pixels */
  function placeLetter(L, q, rad, r, pop, avoid) {
    letterBoxes(L, r);
    var m = 10, lift = Math.min(14, L.t * 10), cands = [], first = null;
    var obstacles = avoid ? L.obs.concat([avoid]) : L.obs;
    function clear(x, y, bw, bh) { return !obstacles.some(function (o) { return x + bw > o[0] && x - bw < o[2] && y + bh > o[1] && y - bh < o[3]; }); }
    var sides = L.speech ? ['right', 'above', 'left', 'below'] : ['above', 'right', 'left', 'below'];
    sides.forEach(function (k) {
      var g;
      if (k === 'above') g = [m, m, r.w - m, q.y - rad * 1.35];   // a head's ears reach higher than its sides
      else if (k === 'right') g = [q.x + rad, m, r.w - m, r.h - m];
      else if (k === 'left') g = [m, m, q.x - rad, r.h - m];
      else g = [m, q.y + rad, r.w - m, r.h - m];
      var gw = g[2] - g[0], gh = g[3] - g[1];
      var fit = gw > 0 && gh > 0 ? Math.min(gw / L.bw, gh / L.bh) : 0, s = Math.min(1, fit);
      if (s <= 0) return;
      var e = Math.min(s * pop, fit), bw = L.bw * e / 2, bh = L.bh * e / 2, x, y;   // the pop overshoots only where it fits
      if (k === 'above') { x = q.x; y = g[3] - L.bh * s / 2 - lift; }
      else if (k === 'below') { x = q.x; y = g[1] + L.bh * s / 2; }
      else {
        x = k === 'right' ? g[0] + L.bw * s / 2 : g[2] - L.bw * s / 2;
        y = q.y - (L.speech ? Math.max(rad * 0.7, L.bh * s * 0.72) : rad * 0.35 + lift);
      }
      // inside the stage and its side's region (the pop's overshoot included)
      var x0 = Math.max(m, g[0]) + bw, x1 = Math.min(r.w - m, g[2]) - bw, y0 = Math.max(m, g[1]) + bh, y1 = Math.min(r.h - m, g[3]) - bh;
      if (x0 > x1) x0 = x1 = (x0 + x1) / 2;
      if (y0 > y1) y0 = y1 = (y0 + y1) / 2;
      x = Math.max(x0, Math.min(x1, x)); y = Math.max(y0, Math.min(y1, y));
      var ok = clear(x, y, bw, bh);
      if (!ok) {   // slide past the chip in the way, to the nearest clear spot inside the region
        var bestD = Infinity, nx = x, ny = y;
        obstacles.forEach(function (o) {
          [[x, o[3] + bh], [x, o[1] - bh], [o[2] + bw, y], [o[0] - bw, y]].forEach(function (t) {
            if (t[0] < x0 - 0.5 || t[0] > x1 + 0.5 || t[1] < y0 - 0.5 || t[1] > y1 + 0.5 || !clear(t[0], t[1], bw - 0.5, bh - 0.5)) return;
            var d = Math.hypot(t[0] - x, t[1] - y);
            if (d < bestD) { bestD = d; nx = t[0]; ny = t[1]; }
          });
        });
        if (bestD < Infinity) { x = nx; y = ny; ok = true; }
      }
      var c = { x: x, y: y, s: s, e: e, k: k, score: s - (ok ? 0 : 0.6) - (k === 'below' ? 0.3 : 0) + (k === L.side ? 0.05 : 0) };
      cands.push(c);
      if (!first && s >= 0.999 && ok && k !== 'below') first = c;
    });
    var pick = first && (!L.side || first.k === L.side || !cands.some(function (c) { return c.k === L.side && c.s >= 0.999 && c.score >= 0.999; })) ? first : null;
    if (!pick) cands.forEach(function (c) { if (!pick || c.score > pick.score) pick = c; });
    pick = pick || { x: Math.max(m, Math.min(r.w - m, q.x)), y: Math.max(m, q.y - rad), s: 0.6, e: 0.6 * pop, k: null };
    L.side = pick.k;
    return pick;
  }

  // ---------------------------------------------------------------- skip chip
  function buildSkip() {
    var s = el.skip;
    H.svg(s, '', '<circle cx="15" cy="15" r="12.5" fill="#fff" stroke="#111" stroke-width="2.5"/>' +
      '<circle class="pr" cx="15" cy="15" r="12.5" fill="none" stroke="#E0218A" stroke-width="4" stroke-dasharray="78.6" stroke-dashoffset="78.6" transform="rotate(-90 15 15)"/>' +
      '<path d="M9 10l6 5-6 5zM15 10l6 5-6 5z" fill="#111"/>', { viewBox: '0 0 30 30' });
    el.skipRing = s.querySelector('.pr');
    el.skipLabel = H.mk('span', 'lbl', s);
    H.text(el.skipLabel, H.T('skip'));
    s.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { s.setPointerCapture(e.pointerId); } catch (x) { /* not capturable */ }
      JG.input.setSkipHold(true, H.src(e));
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { s.addEventListener(ev, function () { JG.input.setSkipHold(false); }); });
    s.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ---------------------------------------------------------------- animation helpers
  function anim(o, dt) {
    if (o.sec <= 0) { o.a = o.to; return; }
    o.t = Math.min(o.sec, o.t + dt);
    o.a = o.from + (o.to - o.from) * H.easeInOut(o.t / o.sec);
  }
  function drawTrans() {
    var a = trans.a, k = trans.kind;
    if (k === 'fade' || !k) { if (trans.shown !== a) { el.trans.style.opacity = a; trans.shown = a; } return; }
    var vis = a > 0.001;
    el.trans.style.opacity = vis ? 1 : 0;
    trans.shown = -1;
    if (!vis) return;
    var r = H.rect(), W = r.w, Hh = r.h;
    if (k === 'iris') {
      var R = Math.sqrt(W * W + Hh * Hh) / 2 + 12, rad = Math.max(0, (1 - a) * R);
      var iris = el.iris;
      iris.style.width = iris.style.height = (2 * rad) + 'px';
      iris.style.marginLeft = iris.style.marginTop = (-rad) + 'px';
      iris.style.borderWidth = rad < 8 ? '0' : '6px';
      return;
    }
    // wipe: three bands (magenta, yellow, then the blue panel) sweep left to right; out continues to the right
    if (trans.W !== W || trans.H !== Hh) {
      trans.W = W; trans.H = Hh;
      var kk = Hh * Math.tan(20 * PI / 180), s = Math.max(14, W * 0.05), P = W + kk + 4;
      trans.geo = { k: kk, s: s, P: P, T: P + 4 * s };
      var bands = el.wipe.children;
      for (var i = 0; i < bands.length; i++) bands[i].style.width = (i === 2 ? P : s) + 'px';
    }
    var g = trans.geo, u = trans.dir === 'out' ? 2 - a : a;
    var L0 = -g.k / 2 - g.T, L1 = -g.k / 2 - 2 * g.s, L2 = W + g.k / 2, L;
    L = u <= 1 ? L0 + (L1 - L0) * u : L1 + (L2 - L1) * (u - 1);
    el.wipe.style.transform = 'translateX(' + L.toFixed(1) + 'px)';
  }
  function setTransKind(kind) {
    kind = kind === 'wipe' || kind === 'iris' ? kind : 'fade';
    if (trans.kind === kind && (kind === 'fade' || el.trans.firstChild)) return;
    trans.kind = kind;
    el.trans.setAttribute('data-kind', kind);
    el.trans.innerHTML = '';
    el.wipe = el.iris = null;
    if (kind === 'wipe') {
      el.wipe = H.mk('div', 'jg-wipe', el.trans);
      ['m', 'y', 'p', 'y', 'm'].forEach(function (c) { H.mk('i', c, el.wipe); });
      trans.W = 0;
    } else if (kind === 'iris') {
      el.iris = H.mk('div', 'jg-iris', el.trans);
    }
  }

  function speakerId(name) {
    if (!name) return null;
    var keys = Object.keys(Object.assign({}, (JG.TEXT_DEFAULTS && JG.TEXT_DEFAULTS.speakers) || {}, (JG.TEXT && JG.TEXT.speakers) || {}));
    for (var i = 0; i < keys.length; i++) if (JG.text('speakers.' + keys[i]) === name || keys[i] === name) return keys[i];
    return null;
  }
  function letterColour(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return { c: h % 3 === 1 ? '#E0218A' : (h % 3 === 2 ? '#FFFFFF' : '#FFD21F'), rot: ((h >> 3) % 2 ? -1 : 1) * (5 + (h >> 5) % 5) };
  }

  // ---------------------------------------------------------------- API
  ui.init = function (root) { H.root = root || H.root; dom(); };

  ui.update = function (dt, ctx) {
    if (!H.built) return;
    dt = dt || 0;
    H.t += dt;
    relayout();
    var r = (ctx && ctx.rect) || H.rect(), cam = ctx && ctx.camera;
    var camReady = false;
    function camOk() { if (!camReady && cam) { cam.updateMatrixWorld(); camReady = true; } return !!cam; }
    // fade and transition covers
    anim(fade, dt);
    if (fade.shown !== fade.a) { el.fade.style.opacity = fade.a; fade.shown = fade.a; }
    anim(trans, dt);
    drawTrans();
    // time card: pop in, hold, fade out
    if (card) {
      card.t += dt;
      var left = card.sec - card.t, s = card.t < 0.25 ? 0.6 + 0.4 * H.easeOut(card.t / 0.25) + Math.sin(Math.min(1, card.t / 0.25) * PI) * 0.08 : 1;
      if (card.kind === 'timecard') { el.card.style.setProperty('--s', s.toFixed(3)); el.card.style.setProperty('--o', Math.max(0, Math.min(1, left / 0.25)).toFixed(3)); }
      if (left <= 0) { card.e.hidden = true; card = null; }
    }
    // in-world lettering
    if (letters.length) {
      letters = letters.filter(function (L) {
        L.t += dt;
        var left = L.sec - L.t;
        if (left <= 0) { L.e.remove(); return false; }
        var p = worldOf(L);
        if (camOk() && p) {
          var q = project(p, cam, r);
          if (q.behind) { L.e.style.opacity = 0; return true; }
          var pop = L.t < 0.18 ? 0.3 + 0.95 * H.easeOut(L.t / 0.18) : (L.t < 0.3 ? 1.25 - 0.25 * (L.t - 0.18) / 0.12 : 1);
          var rad = headRadius(p, cam, r, q), avoid = null;
          if (L.speech) {
            pop = 0.86 + 0.14 * H.easeOut(L.t / 0.12);
            if (L.keepClear) {
              var hand = project(L.keepClear.getWorldPosition(v3b), cam, r), pad = rad * 0.65;
              if (hand.on) avoid = [hand.x - pad, hand.y - pad, hand.x + pad, hand.y + pad];
            }
          }
          var at = placeLetter(L, q, rad, r, pop, avoid);
          if (L.speech && L.e.dataset.side !== at.k) L.e.dataset.side = at.k;
          L.e.style.transform = 'translate(' + at.x.toFixed(1) + 'px,' + at.y.toFixed(1) + 'px) translate(-50%,-50%) rotate(' + L.rot + 'deg) scale(' + at.e.toFixed(3) + ')';
          L.e.style.opacity = (L.speech ? Math.min(1, L.t / 0.12, left / 0.1) : Math.min(1, left / 0.3)).toFixed(3);
        }
        return true;
      });
    }
    // beacon: bobbing arrow over the goal, or an edge arrow pointing at it
    if (beacon.pos && camOk()) {
      var q = project(beacon.pos, cam, r), m = 30, x, y, rot = 0;
      if (q.on && q.x > m && q.x < r.w - m && q.y > m + 20 && q.y < r.h - m) {
        x = q.x; y = q.y - 22 - Math.abs(Math.sin(H.t * 3.2)) * 10;
      } else {
        var cx = r.w / 2, cy = r.h / 2, dx = q.x - cx, dy = q.y - cy;
        if (q.behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1 && Math.abs(dx) < 1) dy = r.h; }
        var sx = (r.w / 2 - m) / Math.max(1e-6, Math.abs(dx)), sy = (r.h / 2 - m) / Math.max(1e-6, Math.abs(dy)), sc = Math.min(sx, sy);
        x = cx + dx * sc; y = cy + dy * sc;
        rot = Math.atan2(-dx, dy) * 180 / PI;
        var pulse = 1 + Math.sin(H.t * 6) * 0.06;
        el.beacon.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg) scale(' + (0.85 * pulse).toFixed(3) + ')';
        el.beacon.hidden = false;
        x = null;
      }
      if (x !== null) { el.beacon.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; el.beacon.hidden = false; }
    }
    // stage panel: paper margin grows in (the stage "shrinks to an inked panel")
    if (panel.on && panel.p < 1) {
      panel.p = Math.min(1, panel.p + dt / 0.5);
      el.panel.style.borderWidth = (H.easeOut(panel.p) * Math.max(8, Math.min(r.w, r.h) * 0.045)).toFixed(1) + 'px';
    }
    var hk = H.hooks.update;
    for (var i = 0; i < hk.length; i++) { try { hk[i](dt, ctx || {}, r); } catch (e) { JG.error('ui update', e); } }
  };

  ui.reset = function (opts) {
    if (!H.built) return;
    var keep = !!(opts && opts.keepStage);
    ui.subtitles.hide(); ui.objective.hide(); ui.beacon.set(null); ui.hint.hide(); ui.skip.hide(); ui.callerCard.hide(); ui.nowPlaying.hide();
    el.chips.innerHTML = ''; promptGen++;
    if (card) { card.e.hidden = true; card = null; }
    el.card.hidden = true; el.caption.hidden = true;
    letters.forEach(function (L) { L.e.remove(); }); letters = [];
    fade.a = fade.to = fade.from = 0; fade.sec = 0; fade.shown = -1; el.fade.style.opacity = 0;
    trans.a = trans.to = trans.from = 0; trans.sec = 0; trans.shown = -1; el.trans.style.opacity = 0;
    H.hooks.reset.forEach(function (fn) { safe('ui reset', function () { fn(keep); }); });
    if (keep) return;
    ui.letterbox.set(false);
    ui.stagePanel(false);
    if (JG.loop && JG.loop.fullStage) JG.loop.setFullStage(false);
  };

  ui.setInputMode = function (m) {
    dom();
    el.ui.setAttribute('data-input', m);
    H.hooks.mode.forEach(function (fn) { safe('ui mode', function () { fn(m); }); });
  };

  ui.stagePanel = function (on) {
    dom();
    on = !!on;
    if (on === panel.on) return;
    panel.on = on; panel.p = 0;
    el.panel.style.borderWidth = '0px';
    el.panel.hidden = !on;
  };

  ui.subtitles = {
    show: function (o) {
      dom(); o = o || {};
      var s = el.sub, id = speakerId(o.speaker), tab = TABS[id] || TABS.ROO;
      s.innerHTML = '';
      s.className = 'jg-sub' + (id === 'LAUREN' ? ' phone' : '');
      if (o.speaker) {
        var t = H.text(H.mk('span', 'tab', s), o.speaker);
        t.style.setProperty('--tab', tab[0]); t.style.setProperty('--tabt', tab[1]);
      }
      var line = String(o.text == null ? '' : o.text);
      var p = H.mk('span', 'txt', s);
      // stage directions in parentheses read as asides: "(sobbing)"
      if (/^\(.*\)$/.test(line.trim())) p.className = 'txt dir';
      H.text(p, line);
      s.hidden = false;
      // restart the pop
      s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
    },
    hide: function () { if (el.sub) el.sub.hidden = true; }
  };

  ui.objective = {
    show: function (s, opts) {
      dom();
      var o = el.objective;
      o.innerHTML = '';
      H.text(H.mk('b', '', o), H.opt('objectiveLabel', 'OBJECTIVE'));
      H.text(H.mk('span', 'txt', o), s);
      var side = opts && opts.side;
      if (side && side.length) {
        var box = H.mk('div', 'sq', o, { 'data-ui': 'side-quests' }), ul;
        H.text(H.mk('b', '', box), H.T('sideQuests.title'));
        ul = H.mk('ul', '', box);
        side.forEach(function (q) {
          var li = H.mk('li', q.done ? 'done' : '', ul, { 'data-quest': q.id });
          H.mk('i', '', li, { 'aria-hidden': 'true' });
          H.text(H.mk('span', '', li), q.text);
        });
        var line = H.mk('div', 'line', box, { 'aria-hidden': 'true' });
        H.mk('span', 'lbl', line);
        side.forEach(function (q) { H.mk('i', 'tk' + (q.done ? ' done' : ''), line, { 'data-quest': q.id }); });
        countSide(box);
      }
      o.hidden = false;
    },
    hide: function () { if (el.objective) el.objective.hidden = true; }
  };
  function countSide(box) {
    var all = box.querySelectorAll('li').length, n = box.querySelectorAll('li.done').length, lbl = box.querySelector('.line .lbl');
    if (lbl) H.text(lbl, H.T('sideQuests.short') + ' ' + n + '/' + all);
  }

  ui.beacon = {
    set: function (p) {
      dom();
      if (!p) { beacon.pos = null; el.beacon.hidden = true; return; }
      beacon.pos = p.clone ? p.clone() : new window.THREE.Vector3(p[0] || p.x || 0, p[1] || p.y || 0, p[2] || p.z || 0);
    }
  };

  ui.prompt = {
    show: function (o) {
      dom(); o = o || {};
      var gen = ++promptGen, chips = {};
      el.chips.innerHTML = '';
      (o.options || []).forEach(function (op) {
        var b = H.mk('button', 'jg-chip' + (op.primary ? ' primary' : ''), el.chips, { type: 'button', 'data-ui': 'chip', 'data-action': op.action });
        H.text(H.mk('span', 'disc', b, { 'aria-hidden': 'true' }), String(op.action || '').toUpperCase());
        H.text(H.mk('span', 'txt', b), op.text);
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); JG.input.inject(op.action, H.src(e)); });
        // keyboard activation of a focused chip (Space / Enter via click with no pointer) also presses it
        b.addEventListener('click', function (e) { if (e.detail === 0) JG.input.inject(op.action, 'keyboard'); });
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        chips[op.action] = b;
      });
      function live() { return gen === promptGen; }
      return {
        hide: function () { if (live()) { el.chips.innerHTML = ''; promptGen++; } },
        strike: function (action, tag) {
          var b = chips[action]; if (!b || !live()) return;
          b.classList.add('struck'); b.classList.remove('pulse');
          if (!b.querySelector('em')) H.text(H.mk('em', '', b), tag || H.T('niceTry'));
        },
        shake: function (action) { var b = chips[action]; if (!b || !live()) return; b.classList.remove('shake', 'pulse'); void b.offsetWidth; b.classList.add('shake'); },
        pulse: function (action) { var b = chips[action]; if (b && live() && !b.classList.contains('struck')) b.classList.add('pulse'); }
      };
    }
  };

  ui.hint = {
    show: function (s, o) {
      dom(); o = o || {};
      var h = el.hint;
      h.innerHTML = '';
      var d = H.mk('span', 'disc', h, { 'aria-hidden': 'true' });
      H.svg(d, '', '<path d="M3 8h8M8 4l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>', { viewBox: '0 0 16 16' });
      H.text(H.mk('span', 'txt', h), s);
      h.hidden = false;
      h.onpointerdown = function (e) {
        e.preventDefault();
        if (typeof o.tap === 'function') o.tap(); else if (o.tap) JG.input.inject(o.tap, H.src(e));
      };
    },
    hide: function () { if (el.hint) { el.hint.hidden = true; el.hint.onpointerdown = null; } }
  };

  ui.skip = {
    show: function () {
      dom();
      // touch players skip with the chip itself, so the label does not mention Enter
      H.text(el.skipLabel, H.T(H.isTouch() ? 'skipTouch' : 'skip'));
      el.skip.setAttribute('aria-label', el.skipLabel.textContent);
      ui.skip.setProgress(0);
      el.skip.hidden = false;
    },
    hide: function () { if (el.skip) el.skip.hidden = true; },
    setProgress: function (p) {
      if (!el.skipRing) return;
      p = Math.max(0, Math.min(1, +p || 0));
      el.skipRing.setAttribute('stroke-dashoffset', (78.6 * (1 - p)).toFixed(1));
    }
  };

  ui.fade = {
    to: function (a, sec, color) {
      dom();
      fade.from = fade.a; fade.to = +a || 0; fade.t = 0; fade.sec = sec || 0;
      el.fade.style.background = color || '#000';
      if (!sec) { fade.a = fade.to; fade.shown = -1; el.fade.style.opacity = fade.a; }
      return H.handle(sec || 0, function () { fade.sec = 0; fade.a = fade.to; });
    }
  };

  ui.transition = {
    play: function (kind, dir, sec) {
      dom();
      setTransKind(kind);
      trans.dir = dir === 'out' ? 'out' : 'in';
      trans.from = trans.a; trans.to = trans.dir === 'out' ? 0 : 1; trans.t = 0; trans.sec = sec === undefined ? 0.45 : sec;
      if (trans.dir === 'in' && trans.a <= 0.001) trans.from = trans.a = 0;
      if (!trans.sec) { trans.a = trans.to; drawTrans(); }
      return H.handle(trans.sec, function () { trans.sec = 0; trans.a = trans.to; });
    }
  };

  ui.letterbox = {
    set: function (on) { dom(); el.ui.classList.toggle('lb-on', !!on); }
  };

  ui.card = {
    show: function (o, sec) {
      dom(); o = o || {};
      sec = sec === undefined ? 2 : sec;
      var kind = o.style === 'timecard' ? 'timecard' : 'caption';
      if (card) { card.e.hidden = true; card = null; }
      var e = kind === 'timecard' ? el.card : el.caption;
      H.text(e, o.text);
      e.hidden = false;
      if (kind === 'timecard') { e.style.setProperty('--s', '0.6'); e.style.setProperty('--o', '1'); }
      var me = card = { e: e, kind: kind, t: 0, sec: sec };
      return H.handle(sec, function () { if (card === me) { card = null; e.hidden = true; } });
    }
  };

  ui.lettering = {
    show: function (s, pos, sec) {
      dom();
      sec = sec === undefined ? 1.2 : sec;
      var e = H.mk('div', 'jg-let', el.letters, { 'data-ui': 'lettering' });
      H.text(e, s);
      var c = letterColour(String(s));
      e.style.setProperty('--c', c.c);
      e.style.opacity = 0;
      var L = { e: e, t: 0, sec: sec, rot: c.rot, pos: null, obj: null };
      if (pos && pos.isObject3D) L.obj = pos;
      else if (pos && pos.clone) L.pos = pos.clone();
      else if (Array.isArray(pos)) L.pos = new window.THREE.Vector3(pos[0], pos[1], pos[2]);
      else L.pos = new window.THREE.Vector3();
      letters.push(L);
      return H.handle(sec, function () { L.sec = Math.min(L.sec, L.t + 0.15); });
    }
  };

  ui.speechBalloon = {
    show: function (text, head, sec, keepClear) {
      dom();
      letters = letters.filter(function (L) { if (!L.speech) return true; L.e.remove(); return false; });
      var e = H.mk('div', 'jg-balloon', el.speech, { 'data-ui': 'speech-balloon' });
      H.svg(e, '', '<path d="M8 67 C3 61 1 53 1 45 C1 21 23 2 50 2 S99 21 99 45 S77 88 50 88 Q35 88 24 82 L8 99 L13 74 Z" fill="#FFF8E7" stroke="#111" stroke-width="2.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>', { viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
      H.text(H.mk('span', '', e), text);
      e.style.opacity = 0;
      var L = { e: e, t: 0, sec: sec === undefined ? 2 : sec, rot: 0, obj: head, speech: true, keepClear: keepClear };
      letters.push(L);
      return H.handle(L.sec, function () { L.sec = 0; e.remove(); });
    }
  };

  ui.callerCard = {
    show: function (o) {
      dom(); o = o || {};
      var c = el.caller, name = o.name || H.T('callerName');
      if (!c.firstChild) {
        H.mk('span', 'av', c, { 'aria-hidden': 'true' });
        H.mk('span', 'nm', c);
        H.svg(c, 'ph', PHONE, { viewBox: '0 0 24 24' });
        var ring = H.mk('span', 'ring', c, { 'aria-hidden': 'true' });
        H.svg(ring, '', BURST, { viewBox: '0 0 118 74', preserveAspectRatio: 'none' });
        el.ringText = H.mk('span', '', ring);
      }
      H.text(c.querySelector('.av'), String(name).charAt(0) || 'L');
      H.text(c.querySelector('.nm'), name);
      H.text(el.ringText, H.T('lettering.ring'));
      var ringing = o.level === undefined ? true : +o.level > 0;
      c.classList.toggle('ringing', ringing);
      if (c.hidden) { c.hidden = false; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
      el.ui.classList.add('caller-on');
    },
    hide: function () { if (el.caller) { el.caller.hidden = true; el.ui.classList.remove('caller-on'); } }
  };

  ui.nowPlaying = {
    show: function (s) {
      dom();
      var n = el.now;
      n.innerHTML = '';
      var eq = H.mk('i', '', n, { 'aria-hidden': 'true' });
      H.mk('b', '', eq); H.mk('b', '', eq); H.mk('b', '', eq);
      H.text(H.mk('span', 'txt', n), s == null ? H.T('nowPlaying') : s);
      n.hidden = false;
    },
    hide: function () { if (el.now) el.now.hidden = true; }
  };

  H.E = E;
})();
