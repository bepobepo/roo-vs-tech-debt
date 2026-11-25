/* Music (plan section 8 "Music slots"). OWNER: E6. Classic IIFE; touches neither THREE, the DOM nor Web Audio at load.
 * Pure sample math on the JG.synth kit from sfx.js (loaded first), so every tune renders the same in the browser and
 * in Node (dev/scratch/stage1/audio-check.mjs).
 *
 *   JG.musicLib.ids                               ['theme', 'elevator', 'montage']
 *   JG.musicLib.info(id) -> {bpm, bars, title, loopSec}
 *   JG.musicLib.render(id, sr, bars?) -> {ch: [L, R], sr, dur, loop: true, bpm, bars}   seamless loop (tails folded)
 *
 * The three procedural pieces, all original:
 *   theme     120 bpm brass fanfare on the June motif C5-E5-G5-C6 (bar 1), C | F | G | C, 4 bars. Also the end card.
 *   elevator  "Going Up": 104 bpm bossa-style muzak, 8 bars, vibes melody written for this game (it opens with a
 *             rising E5-G5-B5 arpeggio and quotes no standard), nylon-ish plucked comping, soft bass, rim and shaker;
 *             band-passed (300 Hz to 3.6 kHz) with a slow wow, as the plan asks. The Joth tracks are quarantined and
 *             never used.
 *   montage   stand-in "Roo's On It": 118 bpm synth-funk, four-on-the-floor kick, Dm7 | G7 | Bbmaj7 | C twice, a
 *             syncopated 16th bass, chord stabs on the beat and the 16th before it (no offbeat skank), claps on 2 and
 *             4, closed hats; no cowbell. A pentatonic synth hook in bars 5 to 8. It plays when
 *             assets/audio/music/montage.mp3 is tagged as a placeholder, missing, undecodable or under 8 s. */
(function () {
  'use strict';
  var JG = window.JG = window.JG || {};

  function S() { return JG.synth; }

  // ---------- instruments: (o = [L, R], sr, t0 sec, dur sec, note, vel 0..1, pan, rng) ----------
  var I = {
    brass: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'saw', uni: [-8, 0, 7], gain: 0.34 * v, a: 0.035, d: 0.18, s: 0.72, r: 0.1,
        lp: { f: 650, env: 2400 * (0.6 + 0.4 * v), q: 1.1 }, vib: { rate: 5.3, depth: 0.14, delay: 0.3 }, pan: pan });
    },
    strings: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'saw', uni: [-10, 9], gain: 0.12 * v, a: 0.25, d: 0.2, s: 0.9, r: 0.35, lp: { f: 1500, q: 0.7 }, vib: { rate: 4.8, depth: 0.08 }, pan: pan });
    },
    bass: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'saw', gain: 0.45 * v, a: 0.006, d: 0.15, s: 0.6, r: 0.05, lp: { f: 260, env: 700 * v, q: 1.3, tau: 0.08 }, pan: pan });
      S().tone(o, sr, t0, dur, { f: n, wave: 'sine', gain: 0.35 * v, a: 0.006, d: 0.15, s: 0.8, r: 0.05, pan: pan });
    },
    softBass: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'tri', gain: 0.5 * v, a: 0.01, d: 0.3, s: 0.5, r: 0.08, lp: { f: 500, q: 0.7 }, pan: pan });
    },
    synthBass: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'saw', uni: [0, 9], gain: 0.42 * v, a: 0.003, d: 0.12, s: 0.5, r: 0.03, lp: { f: 300, env: 1800 * v, q: 3, tau: 0.06 }, pan: pan });
      S().tone(o, sr, t0, dur, { f: n, wave: 'square', gain: 0.18 * v, a: 0.003, d: 0.1, s: 0.7, r: 0.03, lp: { f: 400, q: 0.7 }, pan: pan });
    },
    vibes: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, partials: [[1, 1, 1], [4, 0.12, 0.25], [10, 0.03, 0.1]], gain: 0.4 * v, a: 0.002, tau: 0.75, damp: 0.35, vib: { rate: 5.5, depth: 0.03 }, pan: pan });
    },
    stab: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'saw', uni: [-9, 8], gain: 0.2 * v, a: 0.004, d: 0.12, s: 0.35, r: 0.08, lp: { f: 900, env: 3200, q: 1.6, tau: 0.07 }, pan: pan });
    },
    pad: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'saw', uni: [-12, 11], gain: 0.07 * v, a: 0.3, d: 0.3, s: 0.9, r: 0.4, lp: { f: 1100, q: 0.7 }, pan: pan });
    },
    lead: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'square', uni: [-6, 6], gain: 0.2 * v, a: 0.005, d: 0.1, s: 0.7, r: 0.06, lp: { f: 1400, env: 2000, q: 1.4, tau: 0.12 }, vib: { rate: 5.8, depth: 0.15, delay: 0.18 }, pan: pan });
    },
    arp: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, dur, { f: n, wave: 'saw', gain: 0.12 * v, a: 0.002, d: 0.08, s: 0.1, r: 0.05, lp: { f: 1200, env: 2400, q: 2, tau: 0.05 }, pan: pan });
    },
    /** Karplus-Strong nylon-ish pluck */
    pluck: function (o, sr, t0, dur, n, v, pan, rng) {
      var f = fq(n), N = Math.max(2, Math.round(sr / f)), buf = new Float32Array(N), lp = 0, i;
      for (i = 0; i < N; i++) { lp += ((rng() * 2 - 1) - lp) * 0.45; buf[i] = lp; }
      var len = o[0].length, i0 = Math.floor(t0 * sr), n2 = Math.min(len - i0, Math.ceil((dur + 0.25) * sr)), idx = 0;
      var g = 0.32 * v, gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
      for (i = 0; i < n2; i++) {
        var x = buf[idx], nx = buf[(idx + 1) % N];
        buf[idx] = (x + nx) * 0.5 * 0.9985;
        idx = (idx + 1) % N;
        var t = i / sr, e = t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.25), s = x * g * e * Math.min(1, t / 0.002);
        o[0][i0 + i] += s * gl; o[1][i0 + i] += s * gr;
      }
    },
    // ---------- drums ----------
    kick: function (o, sr, t0, dur, n, v, pan, rng) {
      S().tone(o, sr, t0, 0.01, { f: 150, f1: 46, slide: 0.12, gain: 0.85 * v, a: 0.001, tau: 0.13, pan: pan });
      S().noise(o, sr, t0, 0.003, { rng: rng, type: 'bp', f: 3000, q: 1, gain: 0.15 * v, a: 0.0005, tau: 0.006, pan: pan });
    },
    softKick: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, 0.01, { f: 110, f1: 55, slide: 0.08, gain: 0.5 * v, a: 0.003, tau: 0.12, pan: pan });
    },
    snare: function (o, sr, t0, dur, n, v, pan, rng) {
      S().noise(o, sr, t0, 0.004, { rng: rng, type: 'hp', f: 1200, q: 0.7, gain: 0.55 * v, a: 0.001, tau: 0.09, pan: pan });
      S().tone(o, sr, t0, 0.01, { f: 210, f1: 170, slide: 0.05, gain: 0.35 * v, a: 0.001, tau: 0.05, pan: pan });
    },
    clap: function (o, sr, t0, dur, n, v, pan, rng) {
      [0, 0.011, 0.022].forEach(function (d, k) {
        S().noise(o, sr, t0 + d, 0.002, { rng: rng, type: 'bp', f: 1400, q: 1.3, gain: (k === 2 ? 0.7 : 0.45) * v, a: 0.0005, tau: k === 2 ? 0.07 : 0.008, pan: pan });
      });
    },
    hat: function (o, sr, t0, dur, n, v, pan, rng) {
      S().noise(o, sr, t0, 0.002, { rng: rng, type: 'hp', f: 7500, q: 0.7, gain: 0.3 * v, a: 0.0005, tau: 0.025, pan: pan });
    },
    shaker: function (o, sr, t0, dur, n, v, pan, rng) {
      S().noise(o, sr, t0, 0.02, { rng: rng, type: 'bp', f: 6000, q: 1.2, gain: 0.2 * v, a: 0.01, tau: 0.03, pan: pan });
    },
    rim: function (o, sr, t0, dur, n, v, pan, rng) {
      S().noise(o, sr, t0, 0.001, { rng: rng, type: 'bp', f: 1900, q: 7, gain: 0.9 * v, a: 0.0004, tau: 0.018, pan: pan });
    },
    crash: function (o, sr, t0, dur, n, v, pan, rng) {
      S().noise(o, sr, t0, 0.005, { rng: rng, type: 'hp', f: 4200, q: 0.7, gain: 0.3 * v, a: 0.002, tau: 0.7, pan: pan });
    },
    tom: function (o, sr, t0, dur, n, v, pan) {
      S().tone(o, sr, t0, 0.01, { f: fq(n) * 1.2, f1: fq(n), slide: 0.06, gain: 0.55 * v, a: 0.002, tau: 0.16, pan: pan });
    },
    timp: function (o, sr, t0, dur, n, v, pan, rng) {
      S().tone(o, sr, t0, 0.01, { f: fq(n) * 1.12, f1: fq(n), slide: 0.08, gain: 0.7 * v, a: 0.003, tau: 0.4, pan: pan });
      S().noise(o, sr, t0, 0.005, { rng: rng, type: 'lp', f: 450, gain: 0.3 * v, a: 0.002, tau: 0.05, pan: pan });
    }
  };

  // ---------- tune helpers ----------
  /** per-bar pattern -> events: pat = [[beatInBar, durBeats, note|notes, vel?]], bars = list of bar indices */
  function chordsOf(names, table) { return names.map(function (n) { return table[n]; }); }
  function ev(list, bar, beat, dur, note, vel) { list.push([bar * 4 + beat, dur, note, vel === undefined ? 1 : vel]); }
  function fq(n) { return typeof n === 'string' ? S().hz(n) : n; } // note name or Hz
  function transpose(n, semis) { return fq(n) * Math.pow(2, semis / 12); }

  // =================================================================================================================
  // theme: 120 bpm brass fanfare on the June motif
  // =================================================================================================================
  function theme() {
    var T = { bpm: 120, bars: 4, tracks: [], reverb: 0.22 };
    var mel = [], sec = [], str = [], bass = [], dr = [];
    // melody, beats absolute (bar 1 is the June motif C5-E5-G5-C6)
    [[0, 0.5, 'C5'], [0.5, 0.5, 'E5'], [1, 1, 'G5'], [2, 2, 'C6'],
     [4, 1, 'A5'], [5, 0.5, 'C6'], [5.5, 0.5, 'A5'], [6, 2, 'F5'],
     [8, 0.5, 'G5'], [8.5, 0.5, 'A5'], [9, 1, 'B5'], [10, 1, 'D6'], [11, 1, 'B5'],
     [12, 2, 'C6'], [14, 1, 'G5'], [15, 0.5, 'E5'], [15.5, 0.5, 'G4']].forEach(function (m) { mel.push([m[0], m[1], m[2], 1]); });
    var CH = { C: ['C4', 'E4', 'G4'], F: ['C4', 'F4', 'A4'], G: ['B3', 'D4', 'G4'] }, prog = chordsOf(['C', 'F', 'G', 'C'], CH);
    var roots = ['C2', 'F2', 'G2', 'C2'], fifths = ['G2', 'C3', 'D3', 'G2'];
    for (var b = 0; b < 4; b++) {
      [[0, 0.75, 0.9], [1.5, 0.5, 0.7], [3, 0.5, 0.75]].forEach(function (h) { prog[b].forEach(function (n) { ev(sec, b, h[0], h[1], n, h[2]); }); });
      prog[b].forEach(function (n) { ev(str, b, 0, 3.9, transpose(n, 12), 1); });
      ev(bass, b, 0, 1, roots[b]); ev(bass, b, 1.5, 0.5, transpose(roots[b], 12), 0.8); ev(bass, b, 2, 1, fifths[b]); ev(bass, b, 3, 0.5, roots[b], 0.9);
      ev(bass, b, 3.5, 0.5, b === 3 ? 'B1' : transpose(roots[b], 12), 0.7);
      ev(dr, b, 0, 0.1, 'kick'); ev(dr, b, 2, 0.1, 'kick'); if (b % 2) ev(dr, b, 2.5, 0.1, 'kick', 0.8);
      ev(dr, b, 1, 0.1, 'snare'); ev(dr, b, 3, 0.1, 'snare');
      for (var e = 0; e < 8; e++) ev(dr, b, e / 2, 0.1, 'hat', e % 2 ? 0.5 : 0.8);
    }
    ev(dr, 0, 0, 0.1, 'crash'); ev(dr, 0, 0, 0.1, 'timp:C2'); ev(dr, 2, 0, 0.1, 'timp:G2', 0.8);
    [['tom:G3', 3], ['tom:E3', 3.25], ['tom:C3', 3.5], ['tom:G2', 3.75]].forEach(function (t) { ev(dr, 3, t[1], 0.1, t[0], 0.8); });
    T.tracks = [
      { inst: 'brass', ev: mel, pan: 0.05, gain: 1.15, send: 0.3 },
      { inst: 'brass', ev: sec, pan: -0.25, gain: 0.55, send: 0.25 },
      { inst: 'strings', ev: str, pan: 0.3, gain: 0.9, send: 0.4 },
      { inst: 'bass', ev: bass, pan: 0, gain: 0.9, send: 0 },
      { inst: 'drums', ev: dr, pan: 0, gain: 0.9, send: 0.1 }
    ];
    return T;
  }

  // =================================================================================================================
  // elevator: "Going Up", 104 bpm bossa muzak
  // =================================================================================================================
  function elevator() {
    var T = { bpm: 104, bars: 8, tracks: [], reverb: 0.25, post: { hp: 300, lp: 3600, wowMs: 1.4, wowCycles: 8 } };
    var V = {
      Cmaj7: ['C3', 'G3', 'B3', 'E4'], Am7: ['A2', 'G3', 'C4', 'E4'], Dm7: ['D3', 'A3', 'C4', 'F4'], G7: ['G2', 'F3', 'B3', 'D4'],
      Em7: ['E3', 'B3', 'D4', 'G4'], A7: ['A2', 'G3', 'C#4', 'E4']
    };
    // chord per half bar (bar 7 is split)
    var prog = [['Cmaj7', 'Cmaj7'], ['Am7', 'Am7'], ['Dm7', 'Dm7'], ['G7', 'G7'], ['Em7', 'Em7'], ['A7', 'A7'], ['Dm7', 'G7'], ['Cmaj7', 'Cmaj7']];
    var gtr = [], bass = [], perc = [], vib = [];
    var clave = [0, 3, 6, 10, 13]; // eighth positions over two bars
    for (var b = 0; b < 8; b++) {
      clave.forEach(function (p) {
        var bar2 = Math.floor(p / 8); if (bar2 !== b % 2) return;
        var beat = (p % 8) / 2, ch = V[prog[b][beat < 2 ? 0 : 1]];
        ch.slice(1).forEach(function (n, k) { ev(gtr, b, beat + k * 0.012, 0.45, n, 0.8 - k * 0.05); });
        ev(perc, b, beat, 0.1, 'rim', 0.5);
      });
      var r1 = V[prog[b][0]][0], r2 = V[prog[b][1]][0];
      ev(bass, b, 0, 1.4, r1); ev(bass, b, 1.5, 0.45, transpose(r1, 7), 0.8);
      ev(bass, b, 2, 1.4, r2 === r1 ? transpose(r1, 7) : r2); ev(bass, b, 3.5, 0.45, r2, 0.8);
      ev(perc, b, 0, 0.1, 'softKick', 0.8); ev(perc, b, 2, 0.1, 'softKick', 0.6);
      for (var s = 0; s < 8; s++) ev(perc, b, s / 2, 0.1, 'shaker', s % 2 ? 0.45 : 0.75);
    }
    // the vibes melody, [bar, beat, dur, note]
    [[0, 0, 1, 'E5'], [0, 1, 0.5, 'G5'], [0, 1.5, 1.5, 'B5'], [0, 3, 1, 'A5'],
     [1, 0, 1.5, 'G5'], [1, 1.5, 0.5, 'E5'], [1, 2, 2, 'C5'],
     [2, 0, 0.5, 'D5'], [2, 0.5, 0.5, 'F5'], [2, 1, 1, 'A5'], [2, 2, 0.5, 'C6'], [2, 2.5, 1.5, 'B5'],
     [3, 0, 1, 'A5'], [3, 1, 1, 'F5'], [3, 2, 2, 'D5'],
     [4, 0, 1, 'B4'], [4, 1, 0.5, 'D5'], [4, 1.5, 1.5, 'G5'], [4, 3, 1, 'E5'],
     [5, 0, 1.5, 'C#5'], [5, 1.5, 0.5, 'E5'], [5, 2, 1, 'G5'], [5, 3, 1, 'A5'],
     [6, 0, 1, 'F5'], [6, 1, 1, 'A5'], [6, 2, 1, 'B5'], [6, 3, 1, 'D6'],
     [7, 0, 3, 'C6'], [7, 3, 0.5, 'B5'], [7, 3.5, 0.5, 'G5']].forEach(function (m) { ev(vib, m[0], m[1], m[2], m[3], 0.9); });
    T.tracks = [
      { inst: 'vibes', ev: vib, pan: 0.15, gain: 1.1, send: 0.35 },
      { inst: 'pluck', ev: gtr, pan: -0.3, gain: 0.8, send: 0.2 },
      { inst: 'softBass', ev: bass, pan: 0, gain: 1, send: 0 },
      { inst: 'drums', ev: perc, pan: 0.2, gain: 0.8, send: 0.15 }
    ];
    return T;
  }

  // =================================================================================================================
  // montage stand-in: "Roo's On It", 118 bpm synth-funk
  // =================================================================================================================
  function montage() {
    var T = { bpm: 118, bars: 8, tracks: [], reverb: 0.18 };
    var CH = { Dm7: ['D4', 'F4', 'A4', 'C5'], G7: ['D4', 'F4', 'G4', 'B4'], Bbmaj7: ['D4', 'F4', 'A4', 'Bb4'], C: ['C4', 'E4', 'G4', 'C5'] };
    var names = ['Dm7', 'G7', 'Bbmaj7', 'C'], roots = ['D2', 'G2', 'Bb1', 'C2'], fifth = { D2: 'A2', G2: 'D3', Bb1: 'F2', C2: 'G2' };
    var dr = [], bass = [], stab = [], pad = [], lead = [], arp = [];
    for (var b = 0; b < 8; b++) {
      var c = b % 4, R = roots[c], R2 = transpose(R, 12), F5 = fifth[R], b7 = transpose(R, 10);
      for (var q = 0; q < 4; q++) ev(dr, b, q, 0.1, 'kick');
      ev(dr, b, 1, 0.1, 'clap'); ev(dr, b, 3, 0.1, 'clap');
      for (var s = 0; s < 16; s++) ev(dr, b, s / 4, 0.1, 'hat', [0.8, 0.35, 0.6, 0.35][s % 4]);
      if (b % 2) ev(dr, b, 3.75, 0.1, 'snare', 0.35);
      // syncopated 16th bass: [16th, dur16, note, vel]
      [[0, 2, R, 1], [3, 1, R, 0.7], [6, 1, R2, 0.9], [8, 2, R, 0.95], [10, 1, b7, 0.7], [11, 1, R2, 0.85], [14, 2, F5, 0.8]].forEach(function (p) {
        ev(bass, b, p[0] / 4, p[1] / 4 * 0.9, p[2], p[3]);
      });
      // stabs on the downbeat, the 16th before beat 2 and beat 4 (never a run of offbeat chops)
      [[0, 0.4, 1], [0.75, 0.2, 0.7], [3, 0.4, 0.85]].forEach(function (h) { CH[names[c]].forEach(function (n) { ev(stab, b, h[0], h[1], n, h[2]); }); });
      CH[names[c]].forEach(function (n) { ev(pad, b, 0, 3.95, transpose(n, -12), 1); });
      if (b < 4) {
        var tones = CH[names[c]];
        for (var a = 0; a < 8; a++) ev(arp, b, a / 2, 0.22, transpose(tones[a % 4], 12), a % 2 ? 0.6 : 0.85);
      }
    }
    // the hook in bars 5-8, [bar, 16th, dur16, note]
    [[4, 0, 2, 'A4'], [4, 2, 2, 'C5'], [4, 4, 3, 'D5'], [4, 8, 2, 'F5'], [4, 10, 2, 'D5'], [4, 12, 4, 'C5'],
     [5, 0, 2, 'D5'], [5, 3, 1, 'F5'], [5, 4, 4, 'G5'], [5, 10, 2, 'F5'], [5, 12, 4, 'D5'],
     [6, 0, 3, 'F5'], [6, 4, 2, 'A5'], [6, 6, 2, 'G5'], [6, 8, 2, 'F5'], [6, 10, 2, 'D5'], [6, 12, 4, 'F5'],
     [7, 0, 4, 'G5'], [7, 6, 2, 'E5'], [7, 8, 2, 'C5'], [7, 10, 6, 'D5']].forEach(function (m) { ev(lead, m[0], m[1] / 4, m[2] / 4 * 0.92, m[3], 0.9); });
    ev(dr, 0, 0, 0.1, 'crash', 0.6); ev(dr, 4, 0, 0.1, 'crash', 0.5);
    T.tracks = [
      { inst: 'drums', ev: dr, pan: 0, gain: 1, send: 0.05 },
      { inst: 'synthBass', ev: bass, pan: 0, gain: 1, send: 0 },
      { inst: 'stab', ev: stab, pan: -0.2, gain: 0.8, send: 0.25 },
      { inst: 'pad', ev: pad, pan: 0.25, gain: 1, send: 0.3 },
      { inst: 'arp', ev: arp, pan: 0.35, gain: 0.8, send: 0.3 },
      { inst: 'lead', ev: lead, pan: 0.1, gain: 1, send: 0.3 }
    ];
    return T;
  }

  var TUNES = {
    theme: { title: 'June theme', make: theme },
    elevator: { title: 'Going Up', make: elevator },
    montage: { title: "Roo's On It", make: montage }
  };

  function render(id, sr, bars) {
    var tune = TUNES[id];
    if (!tune) return null;
    sr = sr || 44100;
    var syn = S(), T = tune.make(), spb = 60 / T.bpm, nb = bars || T.bars;
    var loopLen = Math.round(nb * 4 * spb * sr), n = loopLen + Math.round(2.5 * sr);
    var dry = [new Float32Array(n), new Float32Array(n)], send = [new Float32Array(n), new Float32Array(n)];
    var rng = syn.rngFor('music:' + id);
    T.tracks.forEach(function (tr) {
      var buf = [new Float32Array(n), new Float32Array(n)];
      for (var rep = 0; rep * T.bars < nb; rep++) {
        tr.ev.forEach(function (e) {
          var beat = e[0] + rep * T.bars * 4;
          if (beat >= nb * 4) return;
          var t0 = beat * spb, dur = e[1] * spb, notes = Array.isArray(e[2]) ? e[2] : [e[2]], vel = e[3];
          notes.forEach(function (note) {
            if (tr.inst === 'drums') {
              var parts = String(note).split(':'), fn = I[parts[0]];
              if (fn) fn(buf, sr, t0, dur, parts[1] || 'C2', vel, tr.pan, rng);
            } else I[tr.inst](buf, sr, t0, dur, note, vel, tr.pan, rng);
          });
        });
      }
      for (var c = 0; c < 2; c++) {
        var bc = buf[c], dc = dry[c], sc = send[c], tg = tr.gain, ts = tr.gain * (tr.send || 0);
        for (var i = 0; i < n; i++) { var v = bc[i]; if (v !== 0) { dc[i] += v * tg; sc[i] += v * ts; } }
      }
    });
    var wet = syn.reverb(send, sr, { size: 0.75, damp: 0.35, tail: 0 });
    for (var c2 = 0; c2 < 2; c2++) syn.mixInto(dry[c2], wet[c2], (T.reverb || 0.2) * 4);
    var out = syn.fold(dry, loopLen);
    if (T.post) {
      out.forEach(function (ch) {
        // filter the loop twice over so the filter state is settled at the seam
        var tmp = new Float32Array(loopLen * 2);
        tmp.set(ch, 0); tmp.set(ch, loopLen);
        syn.filt(tmp, 'hp', T.post.hp, 0.7, sr); syn.filt(tmp, 'lp', T.post.lp, 0.7, sr);
        ch.set(tmp.subarray(loopLen));
      });
      // slow wow: a cyclic variable delay whose period divides the loop, so the seam stays seamless
      var depth = T.post.wowMs / 1000 * sr, cyc = T.post.wowCycles;
      out = out.map(function (ch) {
        var o = new Float32Array(loopLen);
        for (var i = 0; i < loopLen; i++) {
          var d = depth * (1 + Math.sin(2 * Math.PI * cyc * i / loopLen)), p = i - d + loopLen;
          var i0 = p | 0, fr = p - i0, a = ch[i0 % loopLen], b2 = ch[(i0 + 1) % loopLen];
          o[i] = a + (b2 - a) * fr;
        }
        return o;
      });
    }
    out.forEach(function (ch) { syn.softclip(ch, 1.1); });
    syn.normalize(out, 0.86);
    return { ch: out, sr: sr, dur: loopLen / sr, loop: true, bpm: T.bpm, bars: nb };
  }

  JG.musicLib = {
    ids: Object.keys(TUNES),
    info: function (id) {
      var t = TUNES[id]; if (!t) return null;
      var T = t.make();
      return { title: t.title, bpm: T.bpm, bars: T.bars, loopSec: T.bars * 4 * 60 / T.bpm };
    },
    render: render
  };
})();
