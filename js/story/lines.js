/* VO manifest (plan section 8). Classic script, loaded with defer; touches neither THREE nor the DOM at load.
 * JG.LINES[id] = {speaker, text, file, est, fx?, loop?, branch?, placeholderSfx?}. Files live in
 * site/assets/audio/vo/. Scripted lines are numbered; gag lines are unnumbered so scripted ids never shift.
 * PROVISIONAL until the Stage 0 step 10 freeze. tools/check-vo.mjs evaluates this file in a Node vm sandbox, so it
 * must only assign window.JG.LINES (and JG.TEXT below, which is plain data too). Speaker ids are the keys of the voice
 * dict in tools/gen-vo.py.
 *
 * JG.TEXT (E2, Stage 1): every on-screen string core and the UI read through JG.text('a.b'). Keys match
 * JG.TEXT_DEFAULTS in core/ns.js one for one (prompts, objectives, card, banner and tagline are asserted verbatim by
 * the tests). `tagline` is the placeholder constant the user replaces; it is the only place the closing line lives. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};
  JG.LINES = {
    lauren_problem: { speaker: 'LAUREN', fx: 'phone', file: '01_lauren_problem.mp3', est: 8.3,
      text: "Roo, we got a problem. It's a big one. Massive. Like... the size of 10 YEARS of CRM changes." },
    roo_got_you: { speaker: 'ROO', file: '02_roo_got_you.mp3', est: 9.6,
      text: "You did the right thing by calling me Lauren! I got you! I'll be right there. And please, tell Eric to take a break from breaking changes!" },
    // street barks (round 2): non-blocking, played as Roo walks past a crowd NPC (act1 street-subway, act2 plaza-walk).
    // Unnumbered files so the scripted numbers never shift; listed here, in story order, because they always play
    // on the autopilot route (golden checks the played order against this manifest).
    bark_npc_superhero: { speaker: 'GUY', bark: true, file: 'bark_npc_superhero.mp3', est: 3.2,
      text: 'What are you? Like a superhero or something?' },
    bark_roo_keyboard: { speaker: 'ROO', bark: true, file: 'bark_roo_keyboard.mp3', est: 2.4,
      text: 'Get me a keyboard and find out.' },
    bark_npc_heybaby: { speaker: 'WOMAN', bark: true, file: 'bark_npc_heybaby.mp3', est: 2.4,
      text: 'Hey baby!' },
    ops_help: { speaker: 'OPS', file: '03_ops_help.mp3', est: 8.5,
      text: "Help! We have the best Ops team in the world, but there's just too much technical debt, and too many requests, and... and..." },
    ops_sob: { speaker: 'OPS', loop: true, placeholderSfx: 'sob', file: '04_ops_sob.mp3', est: 3.1,
      text: '(sobbing)' },
    roo_not_your_fault: { speaker: 'ROO', file: '05_roo_not_your_fault.mp3', est: 5.8,
      text: "It's not your fault. It's not your fault. It's not your fault." },
    ops_thank_you: { speaker: 'OPS', file: '06_ops_thank_you.mp3', est: 2.8,
      text: 'Thank you, Roo... thank you.' },
    roo_few_minutes: { speaker: 'ROO', file: '07_roo_few_minutes.mp3', est: 1.6,
      text: "I'll need a few minutes." },
    exec_how: { speaker: 'EXEC', file: '08_exec_how.mp3', est: 3.0,
      text: "But... how?? We thought it's impossible." },
    roo_good_at: { speaker: 'ROO', file: '09_roo_good_at.mp3', est: 2.4,
      text: "I'm just good at what I do, Ma'am." },
    roo_dont_need_me: { speaker: 'ROO', file: '10_roo_dont_need_me.mp3', est: 3.2,
      text: "But you have June.ai now. You don't need me here." },
    gag_roo_get_on: { speaker: 'ROO', branch: 'y', file: 'gag_roo_get_on.mp3', est: 3.9,
      text: "Aha... so... where do you want me to sit?" },
    gag_ops_wail: { speaker: 'OPS', branch: 'y', placeholderSfx: 'wail', file: 'gag_ops_wail.mp3', est: 3.5,
      text: '(sobs even louder)' },
    gag_roo_feelings: { speaker: 'ROO', branch: 'y', file: 'gag_roo_feelings.mp3', est: 3.4,
      text: '...Right. Feelings first.' },
    // office-walk's optional stations (2026-11-25): played only when the player uses one (never in auto mode), so
    // they carry branch 'station' (golden's scripted list skips branched lines); unnumbered stn_* files
    scanner_ok: { speaker: 'SCANNER', branch: 'station', file: 'stn_scanner_ok.mp3', est: 4.1,
      text: 'Face recognised. Kangaroo. Clearance: all of it.' },
    scanner_again: { speaker: 'SCANNER', branch: 'station', file: 'stn_scanner_again.mp3', est: 1.8,
      text: 'Still you. Still all of it.' },
    roo_obviously: { speaker: 'ROO', branch: 'station', file: 'stn_roo_obviously.mp3', est: 0.8,
      text: 'Obviously.' },
    gossip_brenda: { speaker: 'BRENDA', branch: 'station', file: 'stn_gossip_brenda.mp3', est: 4.5,
      text: 'Did you hear? Payroll runs on a spreadsheet called FINAL-final-v7.' },
    gossip_gary: { speaker: 'GARY', branch: 'station', file: 'stn_gossip_gary.mp3', est: 3.6,
      text: "That's nothing. The login code is so old, it's load-bearing." },
    roo_hold_cup: { speaker: 'ROO', branch: 'station', file: 'stn_roo_hold_cup.mp3', est: 1.3,
      text: 'Tech debt? Hold my cup.' },
    roo_rocket_fuel: { speaker: 'ROO', branch: 'station', file: 'stn_roo_rocket_fuel.mp3', est: 1.2,
      text: 'Ahh. Rocket fuel.' },
    // rooftop-walk's optional gag (2026-11-26): the player walks Roo back to the couch and asks to keep playing; he
    // turns to the player and refuses. A station line like the office's (branch 'station': never in auto mode, never
    // in golden's scripted list); an unnumbered gag_* file
    gag_roo_joking: { speaker: 'ROO', branch: 'station', file: 'gag_roo_joking.mp3', est: 4.8,
      text: "You're joking, right? These people need us! We're their only hope!" }
  };

  JG.TEXT = {
    title: 'Roo vs. Tech Debt',
    start: 'CLICK TO START',
    replay: 'Play again',
    credits: 'Credits',
    prompts: { jump: 'Press X to jump', calm: 'Push X to calm down', getOn: 'Press Y to get on with it', sit: 'Push X to sit down', keepPlaying: 'Push X to continue playing',
      scan: 'Push Y to scan your face', drink: 'Push Y for a drink', coffee: 'Push Y to make a coffee' },
    objectives: {
      'rooftop-walk': 'Get to the edge of the roof',
      'street-subway': 'Take the subway',
      'plaza-walk': 'Head into the Fortune 500 office \u2014 elevator to 56',
      'office-walk': 'Get to the computer'
    },
    card: '2 HOURS LATER',
    allClear: 'All clear \u2014 org is healthy and Agentforce agents are running',
    tagline: 'Tech debt: handled.',
    niceTry: 'NICE TRY',
    takeMeThere: 'Take me there',
    tapForSound: 'Tap for sound',
    clickForKeyboard: 'Click the game to use the keyboard',
    skip: 'Hold Enter to skip',
    skipTouch: 'Hold to skip',
    nowPlaying: 'NOW PLAYING',
    callerName: 'LAUREN',
    lettering: { ring: 'RING! RING!', thoom: 'THOOM!', ding: 'DING!', help: 'HELP!', waaah: 'WAAAH!', sniff: 'SNIFF', krassh: 'KRASSH!', paused: 'PAUSED',
      beep: 'BEEP!', glug: 'GLUG GLUG', brew: 'BRRRZZT!', ahh: 'AHHH...', bonk: 'BONK!' },
    nonAffiliation: 'Not affiliated with, or endorsed by, the makers of any game it nods to.',
    speakers: { ROO: 'ROO', LAUREN: 'LAUREN', OPS: 'OPS LEAD', EXEC: 'EXEC', GUY: 'GUY', WOMAN: 'WOMAN', BRENDA: 'BRENDA', GARY: 'GARY', SCANNER: 'SCANNER' },
    // office-walk's optional stations (the face scanner's and the coffee machine's screens, the side quest list)
    scanner: { idle: 'LOOK HERE', sign: 'FACE ID', scanning: 'SCANNING...', name: 'ROO', clearance: 'CLEARANCE: ALL OF IT', again: 'STILL ROO', againSub: 'STILL ALL OF IT' },
    coffee: { firmware: 'UPDATING FIRMWARE', step: '{n} OF 47', brewing: 'BREWING...' },
    sideQuests: { title: 'Side quests', short: 'SIDE QUESTS', coffee: 'Grab a coffee', cooler: 'Water-cooler gossip', scanner: 'Scan your face' },
    // story-only strings (not in TEXT_DEFAULTS): what Roo types into the browser at the desk
    typedUrl: 'june.ai'
  };
})();
