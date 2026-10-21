'use strict';
// ---------- procedural audio: sound effects + adaptive soundtrack (Web Audio, no assets) ----------
const Sfx = {
  ctx: null, master: null, sfxBus: null, musicBus: null, noiseBuf: null,
  ready: false, last: {}, voices: 0,
  cfg: { master: 0.8, sfx: 0.8, music: 0.5, muted: false },

  loadCfg() {
    try { Object.assign(Sfx.cfg, JSON.parse(localStorage.getItem('irontide_audio') || '{}')); } catch (e) { }
  },
  saveCfg() { try { localStorage.setItem('irontide_audio', JSON.stringify(Sfx.cfg)); } catch (e) { } },

  // audio may only start after a user gesture
  init() {
    Sfx.loadCfg();
    const start = () => {
      if (Sfx.ctx) { if (Sfx.ctx.state === 'suspended') Sfx.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = Sfx.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      Sfx.master = ctx.createGain(); Sfx.master.connect(comp); comp.connect(ctx.destination);
      Sfx.sfxBus = ctx.createGain(); Sfx.sfxBus.connect(Sfx.master);
      Sfx.musicBus = ctx.createGain(); Sfx.musicBus.connect(Sfx.master);
      // shared reverb for music & big sounds
      Sfx.verb = ctx.createConvolver(); Sfx.verb.buffer = Sfx.impulse(2.6);
      Sfx.verbGain = ctx.createGain(); Sfx.verbGain.gain.value = 0.35;
      Sfx.verb.connect(Sfx.verbGain); Sfx.verbGain.connect(Sfx.master);
      const n = ctx.sampleRate * 2;
      Sfx.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = Sfx.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      Sfx.ready = true;
      Sfx.applyVol();
      Music.start();
    };
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, start, { capture: true }));
  },

  impulse(sec) {
    const ctx = Sfx.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return b;
  },

  applyVol() {
    if (!Sfx.ready) return;
    const t = Sfx.ctx.currentTime, c = Sfx.cfg;
    Sfx.master.gain.setTargetAtTime(c.muted ? 0 : c.master, t, 0.05);
    Sfx.sfxBus.gain.setTargetAtTime(c.sfx, t, 0.05);
    Sfx.musicBus.gain.setTargetAtTime(c.music * 0.6, t, 0.05);
  },
  toggleMute() { Sfx.cfg.muted = !Sfx.cfg.muted; Sfx.applyVol(); Sfx.saveCfg(); Game.notify(Sfx.cfg.muted ? 'AUDIO MUTED' : 'AUDIO ON', 'Press N to toggle.', 'info'); },

  // ---------- primitives ----------
  out(gain = 1, pan = 0, verb = 0) {
    const g = Sfx.ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (pan && Sfx.ctx.createStereoPanner) { const p = Sfx.ctx.createStereoPanner(); p.pan.value = U.clamp(pan, -1, 1); g.connect(p); node = p; }
    node.connect(Sfx.sfxBus);
    if (verb) { const v = Sfx.ctx.createGain(); v.gain.value = verb; node.connect(v); v.connect(Sfx.verb); }
    return g;
  },
  tone(dest, { type = 'sine', f0 = 440, f1 = null, dur = 0.2, gain = 0.3, attack = 0.005, at = 0, curve = 'exp' }) {
    const ctx = Sfx.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency[curve === 'exp' ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  },
  noise(dest, { dur = 0.2, gain = 0.3, type = 'bandpass', f0 = 1000, f1 = null, q = 1, attack = 0.002, at = 0 }) {
    const ctx = Sfx.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = Sfx.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },

  // ---------- sound library ----------
  play(name, { gain = 1, pan = 0 } = {}) {
    if (!Sfx.ready || Sfx.cfg.muted) return;
    const now = performance.now();
    const gap = { gun: 30, suppressed: 30, tranq: 40, mg: 25, click: 30, hover: 40 }[name] || 60;
    if (now - (Sfx.last[name] || 0) < gap) return;
    Sfx.last[name] = now;
    const r = () => U.rand(0.9, 1.1);
    const big = ['explosion', 'alert', 'win', 'fail', 'sniper'].includes(name);
    const o = Sfx.out(gain, pan, big ? 0.6 : 0.15);
    const T = (opt) => Sfx.tone(o, opt), N = (opt) => Sfx.noise(o, opt);
    switch (name) {
      case 'gun':
        N({ dur: 0.16, gain: 0.55, type: 'lowpass', f0: 4000 * r(), f1: 300 });
        T({ type: 'triangle', f0: 160 * r(), f1: 45, dur: 0.12, gain: 0.5 }); break;
      case 'mg':
        N({ dur: 0.09, gain: 0.45, type: 'lowpass', f0: 3200 * r(), f1: 400 });
        T({ type: 'triangle', f0: 140, f1: 50, dur: 0.07, gain: 0.35 }); break;
      case 'sniper':
        N({ dur: 0.5, gain: 0.7, type: 'lowpass', f0: 5000, f1: 120 });
        T({ type: 'sine', f0: 110, f1: 30, dur: 0.35, gain: 0.7 }); break;
      case 'suppressed':
        N({ dur: 0.06, gain: 0.3, type: 'highpass', f0: 1800 * r(), q: 0.7 });
        T({ type: 'square', f0: 420 * r(), f1: 200, dur: 0.03, gain: 0.08 }); break;
      case 'tranq':
        N({ dur: 0.07, gain: 0.25, type: 'bandpass', f0: 2600 * r(), q: 3 });
        T({ type: 'sine', f0: 1100 * r(), f1: 500, dur: 0.06, gain: 0.08 }); break;
      case 'hit':
        N({ dur: 0.05, gain: 0.25, type: 'bandpass', f0: 900, q: 2 }); break;
      case 'explosion':
        N({ dur: 1.4, gain: 0.9, type: 'lowpass', f0: 1400, f1: 60, attack: 0.004 });
        T({ type: 'sine', f0: 90, f1: 25, dur: 0.9, gain: 0.9 });
        N({ dur: 0.25, gain: 0.5, type: 'highpass', f0: 3000, at: 0.02 }); break;
      case 'smallboom':
        N({ dur: 0.6, gain: 0.6, type: 'lowpass', f0: 1800, f1: 90 });
        T({ type: 'sine', f0: 120, f1: 35, dur: 0.4, gain: 0.5 }); break;
      case 'fulton':
        T({ type: 'sine', f0: 180, f1: 1100, dur: 1.1, gain: 0.25, attack: 0.05 });
        N({ dur: 1.0, gain: 0.25, type: 'bandpass', f0: 300, f1: 3500, q: 1.5, attack: 0.1 });
        T({ type: 'square', f0: 1400, dur: 0.05, gain: 0.08, at: 0 }); break;
      case 'alert': // sharp "spotted!" stinger
        T({ type: 'square', f0: 1568, dur: 0.09, gain: 0.25 });
        T({ type: 'sawtooth', f0: 1046, f1: 1060, dur: 0.6, gain: 0.22, at: 0.07, curve: 'lin' });
        T({ type: 'square', f0: 523, dur: 0.6, gain: 0.12, at: 0.07 });
        N({ dur: 0.3, gain: 0.35, type: 'highpass', f0: 2500 }); break;
      case 'caution':
        T({ type: 'triangle', f0: 880, dur: 0.15, gain: 0.18 });
        T({ type: 'triangle', f0: 660, dur: 0.3, gain: 0.18, at: 0.16 }); break;
      case 'down':
        T({ type: 'sawtooth', f0: 330, f1: 110, dur: 0.6, gain: 0.18 });
        N({ dur: 0.25, gain: 0.4, type: 'lowpass', f0: 600, f1: 80 }); break;
      case 'sleep':
        T({ type: 'sine', f0: 600, f1: 300, dur: 0.35, gain: 0.08 }); break;
      case 'heli':
        for (let i = 0; i < 14; i++) N({ dur: 0.07, gain: 0.35 * (1 - Math.abs(i - 7) / 8), type: 'lowpass', f0: 500, at: i * 0.075 });
        T({ type: 'sawtooth', f0: 70, dur: 1.1, gain: 0.05, attack: 0.3 }); break;
      case 'radio':
        N({ dur: 0.12, gain: 0.18, type: 'bandpass', f0: 2200, q: 4 });
        T({ type: 'square', f0: 1200, dur: 0.05, gain: 0.05, at: 0.12 });
        T({ type: 'square', f0: 1600, dur: 0.05, gain: 0.05, at: 0.18 }); break;
      case 'select':
        T({ type: 'square', f0: 1300, dur: 0.04, gain: 0.05 });
        T({ type: 'square', f0: 1750, dur: 0.05, gain: 0.05, at: 0.045 }); break;
      case 'ack':
        N({ dur: 0.08, gain: 0.12, type: 'bandpass', f0: 1800, q: 5 });
        T({ type: 'triangle', f0: 990, dur: 0.07, gain: 0.1, at: 0.07 }); break;
      case 'click':
        T({ type: 'square', f0: 2200, dur: 0.018, gain: 0.04 }); break;
      case 'hover':
        T({ type: 'sine', f0: 3000, dur: 0.015, gain: 0.015 }); break;
      case 'open':
        T({ type: 'sine', f0: 380, f1: 820, dur: 0.12, gain: 0.08 });
        N({ dur: 0.1, gain: 0.05, type: 'highpass', f0: 4000 }); break;
      case 'close':
        T({ type: 'sine', f0: 700, f1: 320, dur: 0.1, gain: 0.07 }); break;
      case 'ok':
        T({ type: 'triangle', f0: 1046, dur: 0.12, gain: 0.12 });
        T({ type: 'triangle', f0: 1318, dur: 0.25, gain: 0.12, at: 0.09 }); break;
      case 'bad':
        T({ type: 'square', f0: 330, dur: 0.15, gain: 0.08 });
        T({ type: 'square', f0: 247, dur: 0.3, gain: 0.08, at: 0.13 }); break;
      case 'info':
        T({ type: 'sine', f0: 1500, dur: 0.08, gain: 0.07 }); break;
      case 'chime':
        [880, 1318, 1760].forEach((f, i) => T({ type: 'sine', f0: f, dur: 1.2, gain: 0.08, at: i * 0.07 })); break;
      case 'coin':
        T({ type: 'square', f0: 1318, dur: 0.07, gain: 0.06 });
        T({ type: 'square', f0: 1760, dur: 0.25, gain: 0.06, at: 0.07 }); break;
      case 'deploy':
        Sfx.play('radio'); setTimeout(() => Sfx.play('heli', { gain: 0.8 }), 200); break;
      case 'uplink':
        T({ type: 'sine', f0: 200, f1: 1600, dur: 0.45, gain: 0.08 });
        N({ dur: 0.5, gain: 0.08, type: 'bandpass', f0: 600, f1: 6000, q: 2 });
        T({ type: 'square', f0: 1760, dur: 0.06, gain: 0.05, at: 0.48 }); break;
      case 'win':
        [440, 523, 659, 880].forEach((f, i) => T({ type: 'triangle', f0: f, dur: 0.9 - i * 0.1, gain: 0.14, at: i * 0.11 }));
        [220, 330].forEach(f => T({ type: 'sawtooth', f0: f, dur: 1.6, gain: 0.04, attack: 0.2, at: 0.3 })); break;
      case 'fail':
        [330, 262, 220, 165].forEach((f, i) => T({ type: 'square', f0: f, dur: 0.5, gain: 0.07, at: i * 0.18 })); break;
      case 'objective':
        T({ type: 'triangle', f0: 784, dur: 0.15, gain: 0.12 });
        T({ type: 'triangle', f0: 1175, dur: 0.4, gain: 0.12, at: 0.12 }); break;
      case 'siren':
        for (let i = 0; i < 4; i++) T({ type: 'sawtooth', f0: i % 2 ? 620 : 880, f1: i % 2 ? 880 : 620, dur: 0.4, gain: 0.07, at: i * 0.4, curve: 'lin' });
        break;
      case 'type':
        T({ type: 'square', f0: 2600 + Math.random() * 600, dur: 0.012, gain: 0.02 }); break;
    }
  },

  // battle-space sound: audible when you're looking at that battle, panned by screen position
  at(b, x, y, name, opts = {}) {
    if (!Sfx.ready || !MapView.ready) return;
    const focused = UI.focused === b.id;
    const z = MapView.map.getZoom();
    if (!focused && z < 13) return;
    const T = BRender.xf(b);
    const [px, py] = BRender.toScreen(T, x, y);
    const W = window.innerWidth, H = window.innerHeight;
    const dx = px - W / 2, dy = py - H / 2;
    const d = Math.hypot(dx, dy) / Math.max(W, H);
    let g = U.clamp(1.15 - d * 1.3, 0, 1);
    if (!focused) g *= 0.5;
    if (g < 0.04) return;
    Sfx.play(name, { gain: g * (opts.gain || 1), pan: U.clamp(dx / (W / 2), -1, 1) * 0.7 });
  },
};

// ---------- generative soundtrack ----------
const Music = {
  mode: 'base', next: 'base', step: 0, nextT: 0, timer: null, bar: 0,
  midi: m => 440 * Math.pow(2, (m - 69) / 12),
  // chord roots/qualities per mode (midi notes)
  prog: {
    base: [[57, 60, 64], [53, 57, 60, 64], [50, 53, 57], [52, 55, 59]],        // Am  Fmaj7  Dm  Em
    sneak: [[57, 60, 64], [57, 60, 64], [58, 62, 65], [57, 60, 63]],           // Am  Am  Bb  Am(b3 color)
    alert: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],           // Am  F  G  E
  },
  bpm: { base: 68, sneak: 92, alert: 146 },

  start() {
    if (Music.timer) return;
    Music.nextT = Sfx.ctx.currentTime + 0.1;
    Music.timer = setInterval(Music.schedule, 50);
  },
  setMode(m) { Music.next = m; },

  schedule() {
    const ctx = Sfx.ctx; if (!ctx || Sfx.cfg.muted || Sfx.cfg.music <= 0) { if (ctx) Music.nextT = ctx.currentTime + 0.1; return; }
    while (Music.nextT < ctx.currentTime + 0.25) {
      if (Music.step % 16 === 0) {
        if (Music.next !== Music.mode) { Music.mode = Music.next; Music.bar = 0; }
        Music.barStart(Music.nextT);
      }
      Music.tick(Music.nextT, Music.step % 16);
      Music.nextT += 60 / Music.bpm[Music.mode] / 4;
      Music.step++;
    }
  },

  voice(t, { type, f, dur, gain, attack = 0.01, release = 0.3, cutoff = 2000, q = 1, detune = 0, verb = 0.3 }) {
    const ctx = Sfx.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(Sfx.musicBus);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v); v.connect(Sfx.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  },
  drum(t, kind, gain) {
    const ctx = Sfx.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(Sfx.musicBus); o.start(t); o.stop(t + 0.25);
    } else {
      const s = ctx.createBufferSource(); s.buffer = Sfx.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800; f.Q.value = kind === 'hat' ? 0.7 : 0.8;
      const g = ctx.createGain(); const d = kind === 'hat' ? 0.04 : 0.18;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f); f.connect(g); g.connect(Sfx.musicBus);
      if (kind === 'snare') { const v = ctx.createGain(); v.gain.value = 0.3; g.connect(v); v.connect(Sfx.verb); }
      s.start(t, Math.random()); s.stop(t + d + 0.02);
    }
  },
  chord() { const p = Music.prog[Music.mode]; return p[Music.bar % p.length]; },

  barStart(t) {
    const m = Music.mode, ch = Music.chord(), beat = 60 / Music.bpm[m];
    if (m === 'base') {
      for (const n of ch) for (const det of [-7, 7]) Music.voice(t, { type: 'sawtooth', f: Music.midi(n), dur: beat * 4.4, gain: 0.025, attack: 1.2, release: 1.4, cutoff: 900, detune: det, verb: 0.5 });
      Music.voice(t, { type: 'triangle', f: Music.midi(ch[0] - 24), dur: beat * 3.8, gain: 0.08, attack: 0.3, release: 1, cutoff: 400 });
    } else if (m === 'sneak') {
      Music.voice(t, { type: 'sine', f: Music.midi(ch[2] + 12), dur: beat * 4.2, gain: 0.025, attack: 1.5, release: 1.5, cutoff: 3000, verb: 0.6 });
    } else {
      for (const n of ch) Music.voice(t, { type: 'sawtooth', f: Music.midi(n), dur: beat * 0.9, gain: 0.04, attack: 0.005, release: 0.4, cutoff: 1600, verb: 0.2 });
    }
    Music.bar++;
  },

  tick(t, s) {
    const m = Music.mode, ch = Music.chord();
    if (m === 'base') {
      if (s % 2 === 0 && Math.random() < 0.45) {
        const n = U.pick(ch) + 12 + (Math.random() < 0.3 ? 12 : 0);
        Music.voice(t, { type: 'triangle', f: Music.midi(n), dur: 0.9, gain: 0.035, attack: 0.005, release: 0.8, cutoff: 3000, verb: 0.7 });
      }
    } else if (m === 'sneak') {
      if (s % 2 === 0) Music.voice(t, { type: 'triangle', f: Music.midi(ch[0] - 24), dur: 0.22, gain: s % 8 === 0 ? 0.11 : 0.07, attack: 0.005, release: 0.15, cutoff: 500 });
      if (Math.random() < 0.5) Music.drum(t, 'hat', 0.015);
      if (s === 10 && Math.random() < 0.5) Music.voice(t, { type: 'sine', f: Music.midi(ch[1] + 24), dur: 0.6, gain: 0.03, cutoff: 4000, verb: 0.8 });
    } else {
      if (s % 4 === 0) Music.drum(t, 'kick', 0.5);
      if (s === 4 || s === 12) Music.drum(t, 'snare', 0.22);
      if (s % 2 === 0) Music.drum(t, 'hat', 0.05);
      const bn = [0, 0, 12, 0, 7, 0, 12, 7][s % 8];
      Music.voice(t, { type: 'sawtooth', f: Music.midi(ch[0] - 24 + bn), dur: 0.12, gain: 0.07, attack: 0.003, release: 0.08, cutoff: 900, q: 4 });
      if (s === 14) Music.voice(t, { type: 'square', f: Music.midi(ch[2] + 12), dur: 0.15, gain: 0.03, cutoff: 2500, verb: 0.4 });
    }
  },

  // pick the soundtrack from what the player is looking at
  update() {
    if (!G) return;
    const b = UI.focused ? Battle.byId(UI.focused) : null;
    let m = 'base';
    if (b && b.phase !== 'done') m = b.alert === 2 ? 'alert' : 'sneak';
    else if (G.battles.some(x => x.alert === 2 && x.phase !== 'done') && MapView.map.getZoom() >= 13) m = 'alert';
    Music.setMode(m);
  },
};
