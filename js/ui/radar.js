/* JG.ui, part 4 of 4 (E5): the Radar close-up and the office monitor (plan section 6 "Radar content").
 * Classic IIFE; builds its DOM lazily (first show), never at load.
 *   radar.setState({stage: 'off'|'newtab'|'typing'|'loading'|'before'|'after', typed?, instant?})
 *   radar.show() / hide()          the close-up covers the whole viewport (DOM only; the 3D stage keeps its layout), under the dock
 *   radar.drawMonitor(ctx, w, h, stage?)   the same states drawn into the office monitor's canvas (the scene owns the
 *                                  CanvasTexture and redraws at most 10 Hz; stage defaults to the close-up's)
 *   radar.state()                  {stage, typed, sweep}
 * States: off (dark screen), newtab (blank tab), typing (address bar fills with `typed`, or types "june.ai" by itself),
 * loading (progress bar and skeleton), before (51 of 100, burnt orange), after (the arc sweeps to 100 in green over
 * 1.2 s, then the banner JG.text('allClear'), "Running" pills and "RESOLVED" stamps; {instant: true} skips the sweep).
 * A browser window with generic chrome: tab, address bar, no real logos. The org picker uses a generic cloud glyph; the
 * JUNE wordmark is plain text. Three layouts at fixed design widths, zoomed to fit like a monitor close-up: 'wide'
 * (1000 px, with the sidebar, matching refs/radar-screenshot.webp), 'land' (800 px) and 'port' (370 px). */
(function () {
  'use strict';
  var JG = window.JG;
  var ui = JG.ui = JG.ui || {};
  var H = ui._ = ui._ || {};
  H.hooks = H.hooks || { build: [], update: [], reset: [], mode: [], layout: [] };
  var el = H.el = H.el || {};

  var URL_RADAR = 'june.ai/radar', TYPED = 'june.ai', SWEEP = 1.0, ORANGE = '#C8571B', GREEN = '#1FA971';
  var NAV = ['Home', 'Board', 'Projects', 'Integrations'], DISCOVER = ['Radar', 'Map', 'Processes'];
  var RECENTS = ['POS and inventory p…', 'Shop network and u…', 'Notion Connection R…', 'CRM Setup for Bouti…', 'Customer loyalty pro…',
    'Consent-based clien…', 'Wholesale B2B sale…', 'Customer complaint…', 'Shop performance r…'];
  var SIGNALS = [
    { cat: 'IT', sub: 'Change Management', t: 'Setup Change Explainer Agent', d: 'Your org logged about 3,131 setup changes in 90 days across a doz…' },
    { cat: 'Security', sub: 'Compliance', t: 'Data Access Audit Agent', d: 'Compliance questions like "who can read customer SSNs?" or "whi…' },
    { cat: 'Service', sub: 'Case Management', t: 'Case Status and Update Self-Service Agent', d: 'When customers ask "what\'s happening with my case?", your team…' }
  ];
  var TAGS = [
    { k: 'SECURITY EXPOSURE', bg: '#FDE2EC', fg: '#A3154B', t: 'Close the security gaps that leave the org open to account takeover', d: 'Five security controls Salesforce itself rates high-risk are off or weakened…' },
    { k: 'AI READINESS GAP', bg: '#ECE6FB', fg: '#5B3FB0', t: 'Make reusable automation easy for your team to understand and safely…', d: 'Eight pieces of reusable automation that other processes call — including…' },
    { k: 'REVENUE AT RISK', bg: '#E2ECFB', fg: '#1D4E9E', t: 'Opportunity Coach Agent', d: 'Your pipeline hygiene surfaces only at manager 1:1s and QBRs, so stalled deals…' },
    { k: 'OPERATIONAL FRICTION', bg: '#E0F4E9', fg: '#1C7A4A', t: 'Assessment Response Summarizer Agent', d: 'Your system is fully set up to run assessments with open-ended answers,…' }
  ];
  var LEGEND = [['High', 25, '#D64545'], ['Medium', 107, '#E08A2E'], ['Low', 34, '#9A9A9A']];
  var GAUGE = 'M23.4 92.6 A49 49 0 1 1 92.6 92.6';
  var CLOUD = '<path d="M9 22a7 7 0 0 1-1-13.9A9 9 0 0 1 25 6a7.5 7.5 0 1 1 2 16z" fill="#8fb5e8"/>';
  var ICONS = {
    Home: '<path d="M3 9.5L10 4l7 5.5V16H3z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>',
    Board: '<rect x="4" y="3" width="12" height="14" rx="2" fill="none" stroke="#333" stroke-width="1.5"/><path d="M7 8h6M7 11h6M7 14h4" stroke="#333" stroke-width="1.3"/>',
    Projects: '<rect x="3" y="6" width="11" height="10" rx="2" fill="none" stroke="#333" stroke-width="1.5"/><path d="M6 6V4h11v10h-3" fill="none" stroke="#333" stroke-width="1.5"/>',
    Integrations: '<rect x="3" y="3" width="6" height="6" rx="1" fill="none" stroke="#333" stroke-width="1.5"/><rect x="11" y="11" width="6" height="6" rx="1" fill="none" stroke="#333" stroke-width="1.5"/><rect x="3" y="11" width="6" height="6" rx="1" fill="none" stroke="#333" stroke-width="1.5"/><path d="M14 3v6M11 6h6" stroke="#333" stroke-width="1.5"/>',
    Radar: '<circle cx="10" cy="10" r="7" fill="none" stroke="#111" stroke-width="1.6"/><circle cx="10" cy="10" r="3.5" fill="none" stroke="#111" stroke-width="1.6"/><circle cx="10" cy="10" r="1" fill="#111"/>',
    Map: '<path d="M4 16V4M4 16h12M7 13l3-4 2 2 3-5" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>',
    Processes: '<rect x="3" y="3" width="6" height="6" rx="1.5" fill="none" stroke="#333" stroke-width="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5" fill="none" stroke="#333" stroke-width="1.5"/><path d="M6 9v5h5" fill="none" stroke="#333" stroke-width="1.5"/>',
    recent: '<path d="M4 16l8-8M12 4v2M15 7h-2M14 4.5l-1 1M16 10l-1.5-.5M9 3.5l.5 1.5" fill="none" stroke="#555" stroke-width="1.4" stroke-linecap="round"/>'
  };

  var CSS = [
    '.jg-radar{position:absolute;inset:0;z-index:6;overflow:hidden;background:#D9D7D0;color:#1b1b1b;font:400 13px/1.35 Inter,system-ui,sans-serif;pointer-events:none}',
    '.jg-radar *{box-sizing:border-box}',
    '.jg-ui.radar-on .jg-tr .jg-mute{display:none}',
    '.jg-ui.radar-on .jg-sb{width:100%;height:100%}',
    '.rz-fit{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:calc(8px + var(--sat)) calc(10px + var(--sar)) calc(8px + var(--sab)) calc(10px + var(--sal))}',
    '.jg-ui[data-ui-layout=narrow] .rz-fit{padding-bottom:calc(74px + var(--sab));align-items:flex-start}',
    '.rz-win{flex:none;width:370px;display:flex;flex-direction:column;background:#F3F3F1;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.18),0 10px 30px rgba(0,0,0,.25)}',
    '.jg-radar[data-v=land] .rz-win{width:800px}.jg-radar[data-v=wide] .rz-win{width:1000px}',
    // browser chrome (generic)
    '.rz-chrome{flex:none;background:#E4E3DE;border-bottom:1px solid #cfcdc6}',
    '.rz-tabbar{display:flex;align-items:flex-end;gap:10px;height:30px;padding:0 10px}',
    '.rz-lights{display:flex;gap:6px;align-self:center}.rz-lights i{width:10px;height:10px;border-radius:50%;background:#c9c7c0}',
    '.rz-tab{display:flex;align-items:center;gap:7px;height:25px;max-width:220px;padding:0 10px;background:#F7F7F5;border-radius:8px 8px 0 0;font:400 11.5px/1 Inter,system-ui,sans-serif;color:#333;white-space:nowrap;overflow:hidden}',
    '.rz-tab .fav{flex:none;width:13px;height:13px;border-radius:50%;background:#FFD21F;border:1.5px solid #111;display:grid;place-items:center;font:600 7px/1 Inter,sans-serif;color:#111}',
    '.rz-tab .fav.blank{background:#ddd;border-color:#bbb;color:transparent}',
    '.rz-tab .fav.spin{background:none;border:2px solid #c9c7c0;border-top-color:#1F4FD8;animation:rz-spin .7s linear infinite}',
    '.rz-tab .tt{overflow:hidden;text-overflow:ellipsis}',
    '.rz-bar{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;background:#F7F7F5}',
    '.rz-nav{display:flex;gap:9px;color:#777;font:400 15px/1 Inter,sans-serif}',
    '.rz-url{flex:1 1 auto;display:flex;align-items:center;gap:7px;height:24px;padding:0 10px;background:#ECEBE7;border-radius:999px;font:400 12.5px/1 Inter,sans-serif;color:#222;white-space:nowrap;overflow:hidden}',
    '.rz-url.focus{background:#fff;box-shadow:0 0 0 2px #1F4FD8}',
    '.rz-url .lock{flex:none;width:9px;height:11px}',
    '.rz-url .ph{color:#888}',
    '.rz-caret{display:inline-block;width:1.5px;height:14px;margin-left:-6px;background:#1F4FD8;vertical-align:-2px;animation:rz-blink 1s steps(1) infinite}',
    '.rz-prog{height:3px;background:transparent}.rz-prog i{display:block;height:100%;width:0;background:#1F4FD8}',
    // page area
    '.rz-view{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#F3F3F1}',
    '.rz-off{position:absolute;inset:0;background:#0d0f14}',
    '.rz-ntp{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:60px 20px;min-height:340px;background:#fff}',
    '.rz-ntp .box{width:min(420px,90%);height:40px;border-radius:999px;border:1px solid #dcdcd8;display:flex;align-items:center;padding:0 16px;color:#999;font:400 13px/1 Inter,sans-serif}',
    '.rz-ntp .tiles{display:flex;gap:14px}.rz-ntp .tiles i{width:44px;height:44px;border-radius:12px;background:#F1F1EE}',
    '.rz-sugg{position:absolute;left:44px;right:20px;top:0;background:#fff;border:1px solid #dcdcd8;border-top:0;border-radius:0 0 10px 10px;box-shadow:0 8px 18px rgba(0,0,0,.12);font:400 12.5px/1 Inter,sans-serif;z-index:2}',
    '.rz-sugg div{display:flex;align-items:center;gap:8px;padding:9px 12px}.rz-sugg div.hi{background:#EEF2FD}',
    '.rz-sugg b{font-weight:600}.rz-sugg span{color:#888}',
    '.rz-skel{padding:14px;display:flex;flex-direction:column;gap:10px;min-height:340px;background:#F3F3F1}',
    '.rz-skel i{display:block;border-radius:10px;background:linear-gradient(90deg,#e9e8e4 0,#f4f3f0 40%,#e9e8e4 80%);background-size:200% 100%;animation:rz-shim 1.1s linear infinite}',
    // the app
    '.rz-app{display:flex;gap:0}',
    '.rz-side{display:none}',
    '.rz-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:7px;padding:8px 10px 10px}',
    '.rz-top{display:flex;align-items:center;gap:10px;min-height:32px}',
    '.rz-burger{width:18px;height:12px;border-top:2px solid #555;border-bottom:2px solid #555;position:relative}',
    '.rz-burger::after{content:"";position:absolute;left:0;right:0;top:3px;border-top:2px solid #555}',
    '.rz-mark{font:600 17px/1 Inter,sans-serif;letter-spacing:.12em}',
    '.rz-title{font:600 15px/1 Inter,sans-serif;color:#333;padding-left:10px;border-left:1px solid #d9d9d6}',
    '.rz-more{margin-left:auto;color:#555;letter-spacing:1px;font-weight:600}',
    '.rz-org{display:flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid #dcdcd8;border-radius:8px;background:#fff;font:600 12px/1 Inter,sans-serif;white-space:nowrap}',
    '.rz-org svg{width:18px;height:12px}',
    '.rz-tabs{display:flex;align-items:center;gap:6px}',
    '.rz-tabs span{padding:6px 12px;border-radius:999px;border:1px solid #dcdcd8;background:#fff;font:600 12px/1.2 Inter,sans-serif}',
    '.rz-tabs span.on{background:#151515;border-color:#151515;color:#fff}',
    '.rz-tabs .exp{display:none;margin-left:auto;border:0;background:none;font-weight:500}',
    '.rz-banner{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;background:#1FA971;color:#fff;font:600 14px/1.3 Inter,sans-serif;animation:rz-in .35s ease-out}',
    '.rz-banner i{flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#fff;color:#1FA971;font:600 14px/1 Inter,sans-serif;font-style:normal}',
    '.rz-grid{display:flex;flex-direction:column;gap:7px}',
    '.jg-radar[data-v=land] .rz-grid{display:grid;grid-template-columns:1fr 1.12fr;grid-template-areas:"score signals" "tags signals";gap:8px 10px;align-items:start}',
    '.jg-radar[data-v=land] .rz-score{grid-area:score}.jg-radar[data-v=land] .rz-signals{grid-area:signals}.jg-radar[data-v=land] .rz-tags{grid-area:tags}',
    '.rz-card{position:relative;background:#fff;border:1px solid #e3e3df;border-radius:12px;padding:10px 12px}',
    '.rz-score{display:grid;grid-template-columns:116px 1fr;grid-template-areas:"g hd" "g info";column-gap:12px;align-items:center}',
    '.rz-score .hd{grid-area:hd;align-self:end}.rz-score .rz-gauge{grid-area:g}.rz-score .info{grid-area:info;align-self:start}',
    '.rz-gauge{position:relative;flex:none;width:116px;height:104px}',
    '.rz-gauge svg{position:absolute;left:0;top:0;width:116px;height:116px}',
    '.rz-gauge .num{position:absolute;left:0;right:0;top:34px;text-align:center;font:600 34px/1 Inter,sans-serif}',
    '.rz-gauge .of{position:absolute;left:0;right:0;top:70px;text-align:center;font:400 11px/1 Inter,sans-serif;color:#777}',
    '.rz-score .lab{font:400 12px/1.2 Inter,sans-serif;color:#666;margin-bottom:4px}',
    '.rz-score .see{display:none}',
    '.rz-score .meta{font:400 12px/1.35 Inter,sans-serif;color:#444;margin-bottom:6px}',
    '.rz-legend{display:flex;flex-wrap:wrap;gap:4px 10px;font:400 12px/1.2 Inter,sans-serif}',
    '.rz-legend span::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px;background:var(--c)}',
    '.rz-h{display:flex;justify-content:space-between;font:400 12px/1.2 Inter,sans-serif;color:#666;margin-bottom:4px}',
    '.rz-sig{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #efefec}',
    '.rz-sig:first-of-type{border-top:0}',
    '.rz-sig .n{flex:none;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1px solid #ddd;font:400 11px/1 Inter,sans-serif;color:#666}',
    '.rz-sig .body{flex:1 1 auto;min-width:0}',
    '.rz-sig .cat{font:400 11px/1.2 Inter,sans-serif;color:#777}.rz-sig .cat b{color:#333;font-weight:600}',
    '.rz-sig .t{font:600 13px/1.25 Inter,sans-serif}',
    '.rz-sig .d{font:400 11.5px/1.3 Inter,sans-serif;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rz-btn{flex:none;padding:5px 10px;border:1px solid #d6d6d2;border-radius:7px;background:#fff;font:600 12px/1.2 Inter,sans-serif;white-space:nowrap}',
    '.rz-btn.run{border-color:#1FA971;color:#127a51;background:#E7F7EF;border-radius:999px;animation:rz-in .3s ease-out}',
    '.rz-btn.run::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#1FA971;margin-right:5px;vertical-align:1px}',
    '.rz-tags{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.rz-tag{overflow:hidden;display:flex;flex-direction:column}',
    '.rz-tag .k{align-self:flex-start;display:inline-block;padding:3px 7px;border-radius:6px;font:600 10px/1.2 Inter,sans-serif;letter-spacing:.04em;background:var(--k);color:var(--kt);margin-bottom:5px}',
    '.rz-tag .t{font:600 12.5px/1.3 Inter,sans-serif}',
    '.rz-tag .d,.rz-tag .foot{display:none}',
    '.rz-stamp{position:absolute;right:6px;bottom:5px;padding:2px 6px;border:2px solid #1FA971;border-radius:4px;color:#1FA971;font:600 11px/1.1 Inter,sans-serif;',
    '  letter-spacing:.1em;transform:rotate(-8deg);background:rgba(255,255,255,.88);animation:rz-stamp .3s ease-out}',
    '.rz-tag.done{padding-bottom:30px}',
    '.rz-invest{display:none}',
    // wide: the full page with the sidebar, at the screenshot's proportions (1000 x 546 CSS px of page)
    '.jg-radar[data-v=wide] .rz-view{height:546px}',
    '.jg-radar[data-v=wide] .rz-app{height:100%;background:#F7F7F5}',
    '.jg-radar[data-v=wide] .rz-side{display:flex;flex-direction:column;flex:none;width:167px;padding:12px 10px 8px 10px;font:400 9.6px/1.2 Inter,sans-serif;color:#222}',
    '.rz-side .sm{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 12px}',
    '.rz-side .sm b{font:700 11px/1 Inter,sans-serif;letter-spacing:.02em}',
    '.rz-side .sm span{display:flex;gap:9px}.rz-side .sm svg{width:11px;height:11px}',
    '.rz-side .it{display:flex;align-items:center;gap:7px;height:24px;padding:0 6px;border-radius:6px;white-space:nowrap;overflow:hidden}',
    '.rz-side .it svg{flex:none;width:11px;height:11px}',
    '.rz-side .it.on{background:#ECECE8;font-weight:600}',
    '.rz-side .lb{display:flex;justify-content:space-between;padding:12px 6px 5px;color:#777;font-size:8.4px}',
    '.rz-side hr{border:0;border-top:1px solid #e3e3df;margin:6px 0 0}',
    '.rz-side .rec{flex:1 1 auto;min-height:0;overflow:hidden}',
    '.rz-side .usr{display:flex;align-items:center;gap:8px;padding:8px 6px 0;border-top:1px solid #e3e3df}',
    '.rz-side .usr i{flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#1C9A78;color:#fff;font:500 8.5px/1 Inter,sans-serif;font-style:normal}',
    '.rz-side .usr div{flex:1 1 auto;line-height:1.25}.rz-side .usr small{display:block;color:#777;font-size:8px}',
    '.jg-radar[data-v=wide] .rz-main{margin:6px 8px 8px 0;padding:0;gap:0;background:#fff;border:1px solid #e6e5e1;border-radius:10px;overflow:hidden}',
    '.jg-radar[data-v=wide] .rz-top{min-height:43px;padding:0 16px;border-bottom:1px solid #eeede9}',
    '.jg-radar[data-v=wide] .rz-burger,.jg-radar[data-v=wide] .rz-mark{display:none}',
    '.jg-radar[data-v=wide] .rz-title{border:0;padding:0;font:500 9.8px/1 Inter,sans-serif;color:#111}',
    '.jg-radar[data-v=wide] .rz-org{border:0;background:none;font:500 9.6px/1 Inter,sans-serif;padding:4px 0 4px 14px;border-left:1px solid #e3e3df;border-radius:0}',
    '.jg-radar[data-v=wide] .rz-tabs{padding:9px 16px 0}',
    '.jg-radar[data-v=wide] .rz-tabs span{padding:5px 10px;font:500 9.6px/1.2 Inter,sans-serif}',
    '.jg-radar[data-v=wide] .rz-tabs .exp{display:inline-flex;gap:4px}',
    '.jg-radar[data-v=wide] .rz-banner{margin:8px 16px 0;padding:7px 12px;font-size:11px}',
    '.jg-radar[data-v=wide] .rz-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-areas:"score signals" "tags tags" "inv inv";gap:12px 11px;padding:10px 16px 0}',
    '.jg-radar[data-v=wide] .rz-score{grid-area:score;display:flex;flex-direction:column;align-items:stretch;gap:0;height:225px;padding:12px 16px;',
    '  background:radial-gradient(ellipse at 85% 0%,#FBF0E8 0,#fff 55%)}',
    '.jg-radar[data-v=wide] .rz-signals{grid-area:signals;height:225px;padding:12px 16px}',
    '.jg-radar[data-v=wide] .rz-tags{grid-area:tags;grid-template-columns:repeat(4,1fr);gap:11px}',
    '.jg-radar[data-v=wide] .rz-invest{grid-area:inv;display:block;height:120px;padding:12px 16px}',
    '.jg-radar[data-v=wide] .rz-score .hd{display:flex;justify-content:space-between;align-items:center;align-self:stretch}',
    '.jg-radar[data-v=wide] .rz-score .info{align-self:stretch}',
    '.jg-radar[data-v=wide] .rz-score .lab{font-size:9px;margin:0}.jg-radar[data-v=wide] .rz-score .see{display:block;font-size:9px;color:#666}',
    '.jg-radar[data-v=wide] .rz-gauge{align-self:center;width:130px;height:118px;margin-top:6px}',
    '.jg-radar[data-v=wide] .rz-gauge svg{width:130px;height:130px}',
    '.jg-radar[data-v=wide] .rz-gauge .num{top:36px;font-size:38px}.jg-radar[data-v=wide] .rz-gauge .of{top:79px;font-size:9px}',
    '.jg-radar[data-v=wide] .rz-score .info{text-align:center;margin-top:10px}',
    '.jg-radar[data-v=wide] .rz-score .meta{font-size:9px;color:#555;margin-bottom:8px}',
    '.jg-radar[data-v=wide] .rz-legend{justify-content:center;gap:4px 16px;font-size:9.4px}',
    '.jg-radar[data-v=wide] .rz-h{font-size:9px;margin-bottom:10px}',
    '.jg-radar[data-v=wide] .rz-sig{padding:9px 0;gap:12px;border-top-color:#f0efeb}',
    '.jg-radar[data-v=wide] .rz-sig .n{width:18px;height:18px;font-size:8.5px}',
    '.jg-radar[data-v=wide] .rz-sig .cat{font-size:8px;margin-bottom:2px}',
    '.jg-radar[data-v=wide] .rz-sig .t{font-size:10px}',
    '.jg-radar[data-v=wide] .rz-sig .d{font-size:8.6px;margin-top:2px}',
    '.jg-radar[data-v=wide] .rz-btn{font:500 9.4px/1.2 Inter,sans-serif;padding:6px 8px}',
    '.jg-radar[data-v=wide] .rz-tag{height:132px;padding:11px 11px 9px}',
    '.jg-radar[data-v=wide] .rz-tag .k{font:500 7.8px/1.2 Inter,sans-serif;padding:3px 6px;margin-bottom:8px}',
    '.jg-radar[data-v=wide] .rz-tag .t{font-size:10px;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
    '.jg-radar[data-v=wide] .rz-tag .d{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font:400 8.6px/1.35 Inter,sans-serif;color:#888;margin-top:4px}',
    '.jg-radar[data-v=wide] .rz-ntp,.jg-radar[data-v=wide] .rz-skel{height:100%}',
    '.jg-radar[data-v=wide] .rz-tag .foot{display:flex;justify-content:flex-end;margin-top:auto;padding-top:7px;border-top:1px solid #f0efeb}',
    '.jg-radar[data-v=wide] .rz-tag.done{padding-bottom:9px}',
    '.jg-radar[data-v=wide] .rz-stamp{right:auto;left:11px;bottom:12px;font-size:9px}',
    '.rz-invest .h{font:400 9px/1 Inter,sans-serif;color:#666;margin-bottom:12px}',
    '.rz-invest .row{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;padding-left:48px}',
    '.rz-invest .qw{padding:12px;border-radius:10px;background:#F2F5FC;font:600 9.6px/1 Inter,sans-serif}',
    '.rz-invest .qw small{color:#777;font-weight:400}.rz-invest .qw em{font-style:normal;margin-left:5px;padding:2px 5px;border-radius:4px;background:#DCE6F8;color:#1D4E9E;font-size:7.6px}',
    '.rz-invest .sf{padding:12px 0;font:600 9.6px/1 Inter,sans-serif}.rz-invest .sf small{color:#777;font-weight:400}',
    '@keyframes rz-blink{50%{opacity:0}}',
    '@keyframes rz-spin{to{transform:rotate(360deg)}}',
    '@keyframes rz-shim{0%{background-position:100% 0}100%{background-position:-100% 0}}',
    '@keyframes rz-in{0%{transform:translateY(-6px);opacity:0}100%{transform:none;opacity:1}}',
    '@keyframes rz-stamp{0%{transform:rotate(-8deg) scale(1.8);opacity:0}100%{transform:rotate(-8deg) scale(1);opacity:1}}'
  ].join('\n');

  // ---------------------------------------------------------------- state
  var st = { stage: 'off', typed: null };
  var view = { stage: null, typedShown: null, sweepT: -1, sweepDone: true, typeT: 0, loadT: 0, v: null, visible: false, built: false, fitKey: '', score: null, done: null };
  var mon = { stage: null, t0: 0, sweep0: -1 };
  var r = {}; // radar DOM refs

  function mk(tag, cls, parent, attrs) { return H.mk(tag, cls, parent, attrs); }
  function tx(e, s) { return H.text(e, s); }
  function svg(parent, cls, markup, vb) { return H.svg(parent, cls, markup, { viewBox: vb }); }

  function build() {
    if (view.built) return;
    view.built = true;
    JG.css('ui-radar', CSS);
    var root = r.root = mk('div', 'jg-radar', el.radarSlot || el.sb, { 'data-ui': 'radar', 'data-v': 'port', 'aria-label': 'Radar' });
    root.hidden = true;
    var fit = r.fit = mk('div', 'rz-fit', root);
    var win = r.win = mk('div', 'rz-win', fit);
    // chrome
    var ch = mk('div', 'rz-chrome', win), tb = mk('div', 'rz-tabbar', ch);
    var lights = mk('span', 'rz-lights', tb); mk('i', '', lights); mk('i', '', lights); mk('i', '', lights);
    var tab = mk('span', 'rz-tab', tb);
    r.fav = mk('span', 'fav', tab); r.tabTitle = mk('span', 'tt', tab);
    var bar = mk('div', 'rz-bar', ch);
    tx(mk('span', 'rz-nav', bar, { 'aria-hidden': 'true' }), '‹ › ↻');
    r.url = mk('div', 'rz-url', bar);
    r.lock = svg(r.url, 'lock', '<rect x="1" y="5" width="8" height="6" rx="1.2" fill="#666"/><path d="M2.8 5V3.6a2.2 2.2 0 0 1 4.4 0V5" fill="none" stroke="#666" stroke-width="1.4"/>', '0 0 10 12');
    r.urlText = mk('span', 'u', r.url);
    r.caret = mk('span', 'rz-caret', r.url);
    r.prog = mk('div', 'rz-prog', ch); r.progBar = mk('i', '', r.prog);
    // page
    var v = r.view = mk('div', 'rz-view', win);
    r.off = mk('div', 'rz-off', v);
    var ntp = r.ntp = mk('div', 'rz-ntp', v);
    tx(mk('div', 'box', ntp), 'Search or type a URL');
    var tiles = mk('div', 'tiles', ntp); for (var i = 0; i < 5; i++) mk('i', '', tiles);
    r.sugg = mk('div', 'rz-sugg', v);
    var s1 = mk('div', 'hi', r.sugg); tx(mk('b', '', s1), TYPED); tx(mk('span', '', s1), '— Radar');
    var s2 = mk('div', '', r.sugg); tx(mk('span', '', s2), TYPED + '/radar');
    var sk = r.skel = mk('div', 'rz-skel', v);
    [[34, '40%'], [26, '60%'], [150, '100%'], [90, '100%']].forEach(function (b) { var e = mk('i', '', sk); e.style.height = b[0] + 'px'; e.style.width = b[1]; });
    buildApp(v);
  }

  function buildApp(v) {
    var app = r.app = mk('div', 'rz-app', v);
    // sidebar (wide only)
    var side = mk('div', 'rz-side', app);
    var sm = mk('div', 'sm', side);
    tx(mk('b', '', sm), 'JUNE');
    var smi = mk('span', '', sm);
    svg(smi, '', '<circle cx="5" cy="5" r="3.6" fill="none" stroke="#333" stroke-width="1.4"/><path d="M8 8l2.5 2.5" stroke="#333" stroke-width="1.4"/>', '0 0 11 11');
    svg(smi, '', '<rect x="1" y="1.5" width="9" height="8" rx="1.5" fill="none" stroke="#333" stroke-width="1.3"/><path d="M4 1.5v8" stroke="#333" stroke-width="1.3"/>', '0 0 11 11');
    NAV.forEach(function (n) { var it = mk('div', 'it', side); svg(it, '', ICONS[n], '0 0 20 20'); tx(mk('span', '', it), n); });
    mk('hr', '', side);
    tx(mk('div', 'lb', side), 'Discover');
    DISCOVER.forEach(function (n) { var it = mk('div', 'it' + (n === 'Radar' ? ' on' : ''), side); svg(it, '', ICONS[n], '0 0 20 20'); tx(mk('span', '', it), n); });
    mk('hr', '', side);
    var rl = mk('div', 'lb', side); tx(mk('span', '', rl), 'Recents'); tx(mk('span', '', rl), '≡');
    var rec = mk('div', 'rec', side);
    RECENTS.forEach(function (n) { var it = mk('div', 'it', rec); svg(it, '', ICONS.recent, '0 0 20 20'); tx(mk('span', '', it), n); });
    var usr = mk('div', 'usr', side);
    tx(mk('i', '', usr), 'BE');
    var ud = mk('div', '', usr); tx(mk('span', '', ud), 'Benji'); tx(mk('small', '', ud), 'JuneDemo');
    tx(mk('span', '', usr), '⌄');
    // main
    var main = mk('div', 'rz-main', app);
    var top = mk('div', 'rz-top', main);
    mk('span', 'rz-burger', top, { 'aria-hidden': 'true' });
    tx(mk('span', 'rz-mark', top), 'JUNE');
    tx(mk('span', 'rz-title', top), 'Radar');
    tx(mk('span', 'rz-more', top), '···');
    var org = mk('span', 'rz-org', top);
    svg(org, '', CLOUD, '0 0 36 24');
    tx(mk('span', '', org), 'JuneDemo ▾');
    var tabs = r.tabs = mk('div', 'rz-tabs', main);
    tx(mk('span', 'on', tabs), 'Summary'); tx(mk('span', '', tabs), 'Signals'); tx(mk('span', '', tabs), 'Tech debt');
    tx(mk('span', 'exp', tabs), '⤓ Export');
    r.banner = mk('div', 'rz-banner', main, { 'data-ui': 'banner' });
    tx(mk('i', '', r.banner), '✓');
    r.bannerText = mk('span', '', r.banner);
    r.banner.hidden = true;
    var grid = mk('div', 'rz-grid', main);
    // score
    var sc = mk('div', 'rz-card rz-score', grid, { 'data-ui': 'score' });
    var hd = mk('div', 'hd', sc); tx(mk('div', 'lab', hd), 'Score ⓘ'); tx(mk('div', 'see', hd), 'See all ›');
    var g = mk('div', 'rz-gauge', sc, { 'data-ui': 'gauge' });
    var gs = svg(g, '', '<path d="' + GAUGE + '" fill="none" stroke="#ECEAE6" stroke-width="7" stroke-linecap="round" pathLength="100"/>' +
      '<path class="arc" d="' + GAUGE + '" fill="none" stroke="' + ORANGE + '" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="51 200"/>', '0 0 116 116');
    r.arc = gs.querySelector('.arc');
    r.num = mk('div', 'num', g); tx(mk('div', 'of', g), 'of 100');
    var info = mk('div', 'info', sc);
    r.meta = mk('div', 'meta', info);
    r.legend = mk('div', 'rz-legend', info);
    // signals
    var sg = mk('div', 'rz-card rz-signals', grid, { 'data-ui': 'signals' });
    var sh = mk('div', 'rz-h', sg); tx(mk('span', '', sh), 'Top business signals'); tx(mk('span', '', sh), 'See all ›');
    r.sigBtns = SIGNALS.map(function (s, i) {
      var row = mk('div', 'rz-sig', sg);
      tx(mk('span', 'n', row), String(i + 1));
      var body = mk('div', 'body', row), cat = mk('div', 'cat', body);
      tx(mk('b', '', cat), s.cat); cat.appendChild(document.createTextNode(' · ' + s.sub));
      tx(mk('div', 't', body), s.t); tx(mk('div', 'd', body), s.d);
      return mk('span', 'rz-btn', row);
    });
    // tags
    var tg = mk('div', 'rz-tags', grid, { 'data-ui': 'tags' });
    r.tagCards = TAGS.map(function (t) {
      var c = mk('div', 'rz-card rz-tag', tg);
      var k = tx(mk('span', 'k', c), t.k); k.style.setProperty('--k', t.bg); k.style.setProperty('--kt', t.fg);
      tx(mk('div', 't', c), t.t); tx(mk('div', 'd', c), t.d);
      var foot = mk('div', 'foot', c);
      return { card: c, btn: mk('span', 'rz-btn', foot), stamp: null };
    });
    // where to invest first (wide only, cut off by the window like the screenshot)
    var inv = mk('div', 'rz-card rz-invest', grid);
    tx(mk('div', 'h', inv), 'Where to invest first');
    var row = mk('div', 'row', inv);
    var qw = mk('div', 'qw', row); qw.appendChild(document.createTextNode('Quick wins ')); tx(mk('small', '', qw), '· 127'); tx(mk('em', '', qw), 'RECOMMENDED');
    var sf = mk('div', 'sf', row); sf.appendChild(document.createTextNode('Strategic fixes ')); tx(mk('small', '', sf), '· 5');
  }

  // ---------------------------------------------------------------- render (DOM)
  function variant() {
    var R = H.rect(), W = R.W || R.w, Hh = R.H || R.h;
    if (W >= 900 && Hh >= 520) return 'wide';
    return W > Hh ? 'land' : 'port';
  }
  function sweep01() {
    if (st.stage !== 'after') return 0;
    if (view.sweepT < 0) return 1;
    return H.easeInOut(Math.min(1, view.sweepT / SWEEP));
  }
  function setScore(p) {
    var after = st.stage === 'after', score = after ? Math.round(51 + 49 * p) : 51;
    var done = after && p >= 1;
    if (view.score !== score) {
      view.score = score;
      tx(r.num, String(score));
      r.arc.setAttribute('stroke-dasharray', score + ' 200');
      r.arc.setAttribute('stroke', after ? GREEN : ORANGE);
    }
    if (view.done === done) return;
    view.done = done;
    tx(r.meta, done ? '▲ 49 since last scan · Scanned just now' : 'No change since last scan · Scanned 1 day ago');
    r.legend.innerHTML = '';
    LEGEND.forEach(function (L) { var s = tx(mk('span', '', r.legend), (done ? 0 : L[1]) + ' ' + L[0]); s.style.setProperty('--c', L[2]); });
    tx(r.bannerText, H.T('allClear'));
    r.banner.hidden = !done;
    r.tabs.hidden = done && view.v !== 'wide';
    r.sigBtns.forEach(function (b) { tx(b, done ? 'Running' : 'Review'); b.classList.toggle('run', done); });
    r.tagCards.forEach(function (c) {
      tx(c.btn, done ? 'Running' : 'Review'); c.btn.classList.toggle('run', done);
      c.card.classList.toggle('done', done);
      if (done && !c.stamp) c.stamp = tx(mk('span', 'rz-stamp', c.card), 'RESOLVED');
      if (!done && c.stamp) { c.stamp.remove(); c.stamp = null; }
    });
    fit(true);
  }
  function typedText() {
    if (typeof st.typed === 'string') return st.typed;
    return TYPED.slice(0, Math.min(TYPED.length, Math.floor(view.typeT / 0.18) + 1));
  }
  /** the "june.ai" autocomplete row shows only once the typed text is a prefix of it, 2 characters or more */
  function suggests(u) { return typeof u === 'string' && u.length >= 2 && TYPED.indexOf(u) === 0; }
  function render() {
    if (!view.built) return;
    var s = st.stage, page = s === 'before' || s === 'after';
    if (view.stage !== s) {
      view.stage = s;
      r.off.hidden = s !== 'off';
      r.ntp.hidden = !(s === 'newtab' || s === 'typing');
      r.skel.hidden = s !== 'loading';
      r.app.hidden = !page;
      r.prog.style.visibility = s === 'loading' ? 'visible' : 'hidden';
      r.fav.className = 'fav' + (s === 'loading' ? ' spin' : (page ? '' : ' blank'));
      tx(r.fav, page ? 'J' : '');
      tx(r.tabTitle, page ? 'Radar | JUNE' : (s === 'loading' ? TYPED : 'New Tab'));
      r.url.classList.toggle('focus', s === 'newtab' || s === 'typing');
      r.lock.style.display = page || s === 'loading' ? '' : 'none';
      view.typedShown = null; view.score = null; view.done = null;
      fit(true);
    }
    var u = page ? URL_RADAR : (s === 'loading' ? TYPED : (s === 'typing' ? typedText() : ''));
    if (u !== view.typedShown) {
      view.typedShown = u;
      r.urlText.className = u ? 'u' : 'u ph';
      tx(r.urlText, u || (s === 'off' ? '' : 'Search or type a URL'));
      r.caret.style.display = s === 'newtab' || s === 'typing' ? '' : 'none';
      r.sugg.hidden = !(s === 'typing' && suggests(u));
    }
    if (s === 'loading') r.progBar.style.width = Math.round(100 * Math.min(0.92, 1 - Math.exp(-view.loadT * 2.2))) + '%';
    if (page) setScore(sweep01());
  }
  /** zoom the window to fit the safe area (a monitor close-up scales as one piece); reads layout, so only on changes */
  function fit(force) {
    if (!view.visible) return;
    var v = variant();
    if (v !== view.v) { view.v = v; r.root.setAttribute('data-v', v); force = true; view.done = null; }
    var R = H.rect(), key = v + (R.W || R.w) + 'x' + (R.H || R.h);
    if (!force && key === view.fitKey) return;
    view.fitKey = key;
    var win = r.win, cs = getComputedStyle(r.fit);
    win.style.zoom = '';
    var aw = r.fit.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var ah = r.fit.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!(aw > 0 && ah > 0)) return;
    var z = Math.min(aw / win.offsetWidth, ah / win.offsetHeight, v === 'port' ? 1.15 : 1.6);
    for (var i = 0; i < 3; i++) {
      win.style.zoom = String(Math.floor(z * 1000) / 1000);
      var b = win.getBoundingClientRect();
      if (b.height <= ah + 0.5 && b.width <= aw + 0.5) break;
      z *= Math.min(ah / b.height, aw / b.width) * 0.998;
    }
  }

  // ---------------------------------------------------------------- API
  ui.radar = {
    setState: function (s) {
      s = s || {};
      var prev = st.stage;
      if (s.stage !== undefined) st.stage = s.stage;
      if (s.typed !== undefined) st.typed = s.typed;
      if (st.stage !== prev) {
        if (st.stage === 'typing') view.typeT = 0;
        if (st.stage === 'loading') view.loadT = 0;
        if (st.stage === 'after') { view.sweepT = s.instant ? -1 : 0; }
        if (prev === 'typing' && s.typed === undefined) st.typed = null;
      } else if (st.stage === 'after' && s.instant) view.sweepT = -1;
      render();
    },
    show: function () {
      H.dom(); build();
      view.visible = true;
      r.root.hidden = false;
      el.ui.classList.add('radar-on');
      H.radarOn = true;
      // the close-up covers the whole viewport in the DOM only (the stage box grows to the viewport while it shows);
      // the 3D stage keeps its portrait 1:1 panel behind it, so nothing relayouts the canvas
      H.relayout();
      view.stage = null;
      render();
      fit(true);
    },
    hide: function () {
      if (!view.built || !view.visible) return;
      view.visible = false;
      r.root.hidden = true;
      el.ui.classList.remove('radar-on');
      H.radarOn = false;
      H.relayout();
    },
    state: function () { return { stage: st.stage, typed: st.typed, sweep: sweep01(), visible: view.visible }; },
    drawMonitor: drawMonitor
  };

  H.hooks.update.push(function (dt) {
    if (st.stage === 'typing') view.typeT += dt;
    if (st.stage === 'loading') view.loadT += dt;
    if (st.stage === 'after' && view.sweepT >= 0 && view.sweepT < SWEEP) view.sweepT = Math.min(SWEEP, view.sweepT + dt);
    if (view.visible) render();
  });
  H.hooks.layout.push(function () { if (view.visible) fit(false); });
  H.hooks.reset.push(function (keep) {
    ui.radar.hide();
    st.stage = 'off'; st.typed = null; view.sweepT = -1; view.stage = null;
  });

  // ---------------------------------------------------------------- the office monitor (canvas)
  function now() { return (JG.clock && JG.clock.t) || H.t || 0; }
  function rr(ctx, x, y, w, h, rad) {
    rad = Math.min(rad, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
  }
  function font(px, wt) { return (wt || 400) + ' ' + Math.max(4, Math.round(px)) + 'px Inter, system-ui, sans-serif'; }
  function fitText(ctx, s, maxW, px, wt) {
    ctx.font = font(px, wt);
    var w = ctx.measureText(s).width;
    if (w > maxW && w > 0) { px *= maxW / w; ctx.font = font(px, wt); }
    return px;
  }
  /** drawMonitor(ctx, w, h, stage?): the Radar states for the office monitor's canvas (redrawn <= 10 Hz by the scene) */
  function drawMonitor(ctx, w, h, stage) {
    stage = stage || st.stage || 'off';
    var t = now();
    if (stage !== mon.stage) { mon.stage = stage; mon.t0 = t; }
    var dt = Math.max(0, t - mon.t0);
    ctx.save();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (stage === 'off') { ctx.fillStyle = '#0d0f14'; ctx.fillRect(0, 0, w, h); ctx.restore(); return; }
    // window chrome
    var ch = Math.round(h * 0.13);
    ctx.fillStyle = '#F3F3F1'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#E4E3DE'; ctx.fillRect(0, 0, w, ch);
    for (var i = 0; i < 3; i++) { ctx.fillStyle = '#c9c7c0'; ctx.beginPath(); ctx.arc(ch * 0.4 + i * ch * 0.32, ch / 2, ch * 0.1, 0, Math.PI * 2); ctx.fill(); }
    var ux = ch * 1.45, uw = w - ux - ch * 0.4, uh = ch * 0.62, uy = (ch - uh) / 2;
    var focus = stage === 'newtab' || stage === 'typing';
    ctx.fillStyle = focus ? '#fff' : '#ECEBE7'; rr(ctx, ux, uy, uw, uh, uh / 2); ctx.fill();
    if (focus) { ctx.strokeStyle = '#1F4FD8'; ctx.lineWidth = Math.max(1, ch * 0.05); ctx.stroke(); }
    var url = stage === 'before' || stage === 'after' ? URL_RADAR : (stage === 'loading' ? TYPED : (stage === 'typing' ? (typeof st.typed === 'string' ? st.typed : TYPED.slice(0, Math.min(TYPED.length, Math.floor(dt / 0.18) + 1))) : ''));
    ctx.font = font(uh * 0.55); ctx.fillStyle = url ? '#222' : '#999';
    var tx0 = ux + uh * 0.6;
    ctx.fillText(url || 'Search or type a URL', tx0, ch / 2 + 0.5);
    if (focus && Math.floor(t * 2) % 2 === 0) { var cw = url ? ctx.measureText(url).width : 0; ctx.fillStyle = '#1F4FD8'; ctx.fillRect(tx0 + cw + 1, ch / 2 - uh * 0.3, Math.max(1, uh * 0.06), uh * 0.6); }
    var py = ch, ph = h - ch;
    if (stage === 'newtab' || stage === 'typing') {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, py, w, ph);
      ctx.strokeStyle = '#dcdcd8'; ctx.lineWidth = Math.max(1, h * 0.006);
      rr(ctx, w * 0.22, py + ph * 0.38, w * 0.56, ph * 0.13, ph * 0.065); ctx.stroke();
      for (i = 0; i < 4; i++) { ctx.fillStyle = '#F1F1EE'; rr(ctx, w * 0.31 + i * w * 0.1, py + ph * 0.62, w * 0.07, w * 0.07, w * 0.015); ctx.fill(); }
      if (stage === 'typing' && suggests(url)) {
        ctx.fillStyle = '#fff'; rr(ctx, ux, py, uw, ph * 0.2, 6); ctx.fill();
        ctx.strokeStyle = '#dcdcd8'; ctx.stroke();
        ctx.fillStyle = '#EEF2FD'; ctx.fillRect(ux + 1, py + 1, uw - 2, ph * 0.1);
        ctx.fillStyle = '#111'; ctx.font = font(ph * 0.055, 600); ctx.fillText(TYPED, ux + uh * 0.6, py + ph * 0.05);
      }
      ctx.restore(); return;
    }
    if (stage === 'loading') {
      var lp = Math.min(0.92, 1 - Math.exp(-dt * 2.2));
      ctx.fillStyle = '#1F4FD8'; ctx.fillRect(0, py, w * lp, Math.max(2, h * 0.012));
      ctx.fillStyle = '#e6e5e1';
      rr(ctx, w * 0.04, py + ph * 0.08, w * 0.35, ph * 0.08, 4); ctx.fill();
      rr(ctx, w * 0.04, py + ph * 0.22, w * 0.44, ph * 0.42, 8); ctx.fill();
      rr(ctx, w * 0.52, py + ph * 0.22, w * 0.44, ph * 0.42, 8); ctx.fill();
      rr(ctx, w * 0.04, py + ph * 0.7, w * 0.92, ph * 0.24, 8); ctx.fill();
      ctx.restore(); return;
    }
    // before / after: sidebar + score + signals + tags (the same page as the close-up, simplified)
    var after = stage === 'after';
    if (after && mon.sweep0 < 0) mon.sweep0 = t;
    if (!after) mon.sweep0 = -1;
    var sp = after ? H.easeInOut(Math.min(1, (t - mon.sweep0) / SWEEP)) : 0, done = after && sp >= 1;
    var sw = w * 0.17;
    ctx.fillStyle = '#F7F7F5'; ctx.fillRect(0, py, w, ph);
    ctx.fillStyle = '#111'; ctx.font = font(ph * 0.06, 700); ctx.fillText('JUNE', sw * 0.12, py + ph * 0.07);
    for (i = 0; i < 7; i++) { ctx.fillStyle = i === 4 ? '#d9d9d4' : '#e2e2dd'; rr(ctx, sw * 0.12, py + ph * (0.16 + i * 0.075), sw * (i === 4 ? 0.78 : 0.6), ph * 0.03, 2); ctx.fill(); }
    var mx = sw, mw = w - sw - w * 0.012, my = py + ph * 0.02, mh = ph * 0.96;
    ctx.fillStyle = '#fff'; rr(ctx, mx, my, mw, mh, 6); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = font(ph * 0.05, 600); ctx.fillText('Radar', mx + mw * 0.03, my + ph * 0.06);
    var gy = my + ph * 0.13;
    if (done) {
      ctx.fillStyle = GREEN; rr(ctx, mx + mw * 0.03, gy - ph * 0.005, mw * 0.94, ph * 0.09, 5); ctx.fill();
      ctx.fillStyle = '#fff'; fitText(ctx, H.T('allClear'), mw * 0.88, ph * 0.045, 600); ctx.fillText(H.T('allClear'), mx + mw * 0.06, gy + ph * 0.04);
      gy += ph * 0.11;
    }
    // score card
    var cw2 = mw * 0.455, chh = ph * (done ? 0.42 : 0.5);
    ctx.strokeStyle = '#e3e3df'; ctx.lineWidth = 1; ctx.fillStyle = '#fff';
    rr(ctx, mx + mw * 0.03, gy, cw2, chh, 6); ctx.fill(); ctx.stroke();
    var gx = mx + mw * 0.03 + cw2 / 2, gcy = gy + chh * 0.48, gr = Math.min(cw2, chh) * 0.3;
    ctx.lineCap = 'round'; ctx.lineWidth = gr * 0.2;
    ctx.strokeStyle = '#ECEAE6'; ctx.beginPath(); ctx.arc(gx, gcy, gr, 0.75 * Math.PI, 2.25 * Math.PI); ctx.stroke();
    var score = after ? Math.round(51 + 49 * sp) : 51;
    ctx.strokeStyle = after ? GREEN : ORANGE; ctx.beginPath(); ctx.arc(gx, gcy, gr, 0.75 * Math.PI, (0.75 + 1.5 * score / 100) * Math.PI); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#111'; ctx.font = font(gr * 0.85, 600); ctx.fillText(String(score), gx, gcy - gr * 0.05);
    ctx.fillStyle = '#777'; ctx.font = font(gr * 0.25); ctx.fillText('of 100', gx, gcy + gr * 0.55);
    ctx.textAlign = 'left';
    // signals card
    var sx = mx + mw * 0.515;
    ctx.fillStyle = '#fff'; rr(ctx, sx, gy, cw2, chh, 6); ctx.fill(); ctx.strokeStyle = '#e3e3df'; ctx.stroke();
    for (i = 0; i < 3; i++) {
      var ry = gy + chh * (0.2 + i * 0.27);
      ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(sx + cw2 * 0.08, ry, chh * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333'; rr(ctx, sx + cw2 * 0.15, ry - chh * 0.05, cw2 * 0.45, chh * 0.04, 2); ctx.fill();
      ctx.fillStyle = '#ccc'; rr(ctx, sx + cw2 * 0.15, ry + chh * 0.03, cw2 * 0.5, chh * 0.03, 2); ctx.fill();
      ctx.fillStyle = done ? '#E7F7EF' : '#fff'; ctx.strokeStyle = done ? GREEN : '#d6d6d2';
      rr(ctx, sx + cw2 * 0.73, ry - chh * 0.06, cw2 * 0.22, chh * 0.12, done ? chh * 0.06 : 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = done ? '#127a51' : '#333'; fitText(ctx, done ? 'Running' : 'Review', cw2 * 0.18, chh * 0.06, 600); ctx.fillText(done ? 'Running' : 'Review', sx + cw2 * 0.755, ry + 0.5);
    }
    // tag cards
    var ty = gy + chh + ph * 0.035, th = my + mh - ty - ph * 0.03, tw = (mw * 0.94 - 3 * mw * 0.015) / 4;
    TAGS.forEach(function (tg, k) {
      var x = mx + mw * 0.03 + k * (tw + mw * 0.015);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e3e3df'; rr(ctx, x, ty, tw, th, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tg.bg; rr(ctx, x + tw * 0.08, ty + th * 0.12, tw * 0.6, th * 0.16, 3); ctx.fill();
      ctx.fillStyle = '#333'; rr(ctx, x + tw * 0.08, ty + th * 0.42, tw * 0.8, th * 0.08, 2); ctx.fill();
      if (done) {
        ctx.save(); ctx.translate(x + tw * 0.5, ty + th * 0.75); ctx.rotate(-0.14);
        ctx.strokeStyle = GREEN; ctx.lineWidth = Math.max(1, th * 0.03); ctx.strokeRect(-tw * 0.32, -th * 0.1, tw * 0.64, th * 0.2);
        ctx.fillStyle = GREEN; ctx.textAlign = 'center'; fitText(ctx, 'RESOLVED', tw * 0.56, th * 0.13, 600); ctx.fillText('RESOLVED', 0, 0.5);
        ctx.restore();
      }
    });
    ctx.restore();
  }
})();
