'use strict';
// ---------- procedural portraits & emblems ----------
const Art = (() => {
  const cache = new Map();

  function portrait(seed, tint) {
    const key = 'p' + seed + (tint || '');
    if (cache.has(key)) return cache.get(key);
    const r = U.mulberry32(seed >>> 0);
    const P = a => a[Math.floor(r() * a.length)];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    // background
    x.fillStyle = tint || P(['#1d2a24', '#232a33', '#2b2420', '#1f2430', '#262626', '#22281f']);
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,.035)';
    for (let i = -64; i < 64; i += 6) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke(); }
    const skin = P(['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#d4a07a', '#a86b3c']);
    const uni = P(['#3b4a32', '#4a4a3a', '#2e3b44', '#3d3d3d', '#5a4a32', '#28332b', '#4b3b2f', '#3a3f4a']);
    const hairC = P(['#1a1410', '#2b1d12', '#4a3020', '#6b4a2b', '#888', '#c9a46a', '#111']);
    // shoulders & vest
    x.fillStyle = uni; x.beginPath(); x.ellipse(32, 68, 30, 20, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(20, 52, 6, 12); x.fillRect(38, 52, 6, 12);
    if (r() < .5) { x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(14, 56, 36, 3); }
    // neck & head
    x.fillStyle = skin; x.fillRect(27, 38, 10, 12);
    x.beginPath(); x.ellipse(32, 29, 11.5, 14, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(20.5, 30, 2.5, 4, 0, 0, Math.PI * 2); x.ellipse(43.5, 30, 2.5, 4, 0, 0, Math.PI * 2); x.fill();
    const head = P(['hair', 'hair', 'beret', 'helmet', 'cap', 'balaclava', 'bandana', 'bald', 'long', 'boonie']);
    // eyes
    const ey = 29;
    x.fillStyle = '#111'; x.fillRect(26, ey, 4, 2); x.fillRect(34, ey, 4, 2);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(25, ey - 3, 6, 1.5); x.fillRect(33, ey - 3, 6, 1.5);
    // mouth & nose
    x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(31, 32, 2, 4); x.fillRect(28, 38, 8, 1.5);
    // facial hair
    if (r() < .3) { x.fillStyle = hairC; x.globalAlpha = .85; x.beginPath(); x.ellipse(32, 39, 9, 5, 0, 0, Math.PI); x.fill(); x.fillRect(27, 36, 10, 2); x.globalAlpha = 1; }
    // headgear
    switch (head) {
      case 'hair': x.fillStyle = hairC; x.beginPath(); x.ellipse(32, 20, 12, 7, 0, Math.PI, 0); x.fill(); x.fillRect(20, 18, 24, 5); break;
      case 'long': x.fillStyle = hairC; x.beginPath(); x.ellipse(32, 21, 13, 8, 0, Math.PI, 0); x.fill(); x.fillRect(19, 19, 5, 22); x.fillRect(40, 19, 5, 22); break;
      case 'beret': x.fillStyle = P(['#7a1f1f', '#2b4a2b', '#1f2b4a', '#111', '#6b5a1f']); x.beginPath(); x.ellipse(30, 18, 15, 6, -.15, 0, Math.PI * 2); x.fill(); break;
      case 'helmet': x.fillStyle = P(['#4a5236', '#3d4436', '#555', '#5b4f3a']); x.beginPath(); x.ellipse(32, 21, 15, 11, 0, Math.PI, 0); x.fill(); x.fillRect(16, 20, 32, 4); break;
      case 'cap': x.fillStyle = P(['#333', '#4a5236', '#2e3b44', '#5a4a32']); x.beginPath(); x.ellipse(32, 19, 12.5, 7, 0, Math.PI, 0); x.fill(); x.fillRect(30, 17, 18, 4); break;
      case 'balaclava': x.fillStyle = P(['#222', '#2d2d2d', '#3b4a32']); x.beginPath(); x.ellipse(32, 29, 12.5, 15, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = skin; x.fillRect(24, 26, 16, 7); x.fillStyle = '#111'; x.fillRect(26, ey, 4, 2); x.fillRect(34, ey, 4, 2); break;
      case 'bandana': x.fillStyle = hairC; x.beginPath(); x.ellipse(32, 20, 12, 7, 0, Math.PI, 0); x.fill(); x.fillStyle = P(['#8b1a1a', '#22334a', '#3b4a32', '#000']); x.fillRect(20, 20, 24, 4); x.fillRect(42, 21, 6, 3); break;
      case 'boonie': x.fillStyle = P(['#5b5a3a', '#4a5236', '#6b5f45']); x.beginPath(); x.ellipse(32, 20, 19, 4, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(32, 18, 11, 7, 0, Math.PI, 0); x.fill(); break;
      default: break;
    }
    // accessories
    const acc = r();
    if (acc < .1) { x.fillStyle = '#111'; x.fillRect(24, 27, 16, 5); x.fillStyle = 'rgba(120,200,255,.25)'; x.fillRect(25, 28, 6, 3); x.fillRect(33, 28, 6, 3); }
    else if (acc < .15) { x.fillStyle = '#111'; x.beginPath(); x.ellipse(28, 30, 3.5, 3, 0, 0, Math.PI * 2); x.fill(); x.fillRect(20, 26, 20, 1.2); }
    else if (acc < .25) { x.strokeStyle = 'rgba(120,40,30,.7)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(36, 24); x.lineTo(40, 35); x.stroke(); }
    if (r() < .35 && head !== 'balaclava') { x.fillStyle = 'rgba(30,30,20,.35)'; x.fillRect(24, 33, 3, 2); x.fillRect(37, 31, 3, 2); }
    const url = c.toDataURL();
    cache.set(key, url);
    return url;
  }

  const PALETTES = [
    ['#111', '#f2b33d', '#fff'], ['#1b1b1b', '#c62f2f', '#e8e8e8'], ['#0e2233', '#5ec8ff', '#fff'], ['#1c2a16', '#8fd14f', '#f0f0d0'],
    ['#2a0f1f', '#ff4fa5', '#fff'], ['#1a1430', '#b58cff', '#fff'], ['#2a1a0a', '#ff8a2a', '#fff2d0'], ['#e8e2d0', '#1b1b1b', '#9b1c1c'],
    ['#0a2a28', '#2fd1b5', '#e0fff8'], ['#301010', '#ffcc33', '#ffffff'], ['#222', '#9a9a9a', '#ff5a4e'], ['#0b1d3a', '#e8c547', '#fff'],
  ];

  function emblem(seed, initials = '') {
    const key = 'e' + seed + initials;
    if (cache.has(key)) return cache.get(key);
    const r = U.mulberry32(seed >>> 0);
    const P = a => a[Math.floor(r() * a.length)];
    const [bg, fg, hi] = P(PALETTES);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.translate(64, 64);
    const shape = P(['circle', 'shield', 'hex', 'diamond', 'circle', 'shield']);
    const path = () => {
      x.beginPath();
      if (shape === 'circle') x.arc(0, 0, 58, 0, Math.PI * 2);
      else if (shape === 'hex') for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 60, Math.sin(a) * 60); }
      else if (shape === 'diamond') { x.moveTo(0, -62); x.lineTo(62, 0); x.lineTo(0, 62); x.lineTo(-62, 0); }
      else { x.moveTo(-52, -56); x.lineTo(52, -56); x.lineTo(52, 0); x.quadraticCurveTo(48, 40, 0, 62); x.quadraticCurveTo(-48, 40, -52, 0); }
      x.closePath();
    };
    path(); x.fillStyle = bg; x.fill();
    x.lineWidth = 5; x.strokeStyle = fg; x.stroke();
    x.save(); path(); x.clip();
    // background motif
    const motif = r();
    x.globalAlpha = .18; x.fillStyle = fg;
    if (motif < .33) for (let i = -70; i < 70; i += 14) x.fillRect(i, -70, 6, 140);
    else if (motif < .66) { x.beginPath(); x.arc(0, 0, 40, 0, Math.PI * 2); x.lineWidth = 8; x.strokeStyle = fg; x.stroke(); }
    else { x.rotate(Math.PI / 4); x.fillRect(-70, -6, 140, 12); x.rotate(-Math.PI / 2); x.fillRect(-70, -6, 140, 12); x.rotate(Math.PI / 4); }
    x.globalAlpha = 1;
    // symbol
    const sym = P(['skull', 'wings', 'blades', 'star', 'eye', 'bolt', 'anchor', 'claw', 'fang', 'crown', 'trident', 'sun']);
    x.fillStyle = fg; x.strokeStyle = fg; x.lineWidth = 6; x.lineCap = 'round';
    const ty = initials ? -8 : 0;
    x.save(); x.translate(0, ty);
    switch (sym) {
      case 'skull':
        x.beginPath(); x.arc(0, -6, 26, 0, Math.PI * 2); x.fill(); x.fillRect(-15, 12, 30, 16);
        x.fillStyle = bg; x.beginPath(); x.arc(-10, -6, 7, 0, Math.PI * 2); x.arc(10, -6, 7, 0, Math.PI * 2); x.fill();
        x.beginPath(); x.moveTo(0, 2); x.lineTo(-4, 10); x.lineTo(4, 10); x.fill();
        for (let i = -10; i <= 10; i += 6.5) x.fillRect(i - 1.2, 18, 2.6, 10); break;
      case 'wings':
        for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(s * (14 + i * 7), -4 + i * 5, 22 - i * 3, 5, s * (0.5 - i * 0.12), 0, Math.PI * 2); x.fill(); }
        x.beginPath(); x.arc(0, -4, 10, 0, Math.PI * 2); x.fillStyle = hi; x.fill(); break;
      case 'blades':
        for (const a of [-.7, .7]) { x.save(); x.rotate(a); x.beginPath(); x.moveTo(0, -46); x.lineTo(6, -30); x.lineTo(5, 26); x.lineTo(-5, 26); x.lineTo(-6, -30); x.closePath(); x.fill(); x.fillRect(-14, 24, 28, 5); x.fillRect(-3, 28, 6, 14); x.restore(); } break;
      case 'star':
        x.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? 16 : 40, a = i * Math.PI / 5 - Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); break;
      case 'eye':
        x.beginPath(); x.moveTo(0, -40); x.lineTo(38, 26); x.lineTo(-38, 26); x.closePath(); x.lineWidth = 6; x.stroke();
        x.beginPath(); x.ellipse(0, 6, 18, 10, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = bg; x.beginPath(); x.arc(0, 6, 6, 0, Math.PI * 2); x.fill(); break;
      case 'bolt':
        x.beginPath(); x.moveTo(8, -44); x.lineTo(-20, 6); x.lineTo(-2, 6); x.lineTo(-10, 44); x.lineTo(22, -8); x.lineTo(4, -8); x.closePath(); x.fill(); break;
      case 'anchor':
        x.beginPath(); x.arc(0, -32, 8, 0, Math.PI * 2); x.stroke(); x.fillRect(-3, -24, 6, 56); x.fillRect(-18, -14, 36, 6);
        x.beginPath(); x.arc(0, 8, 26, 0.15, Math.PI - 0.15); x.stroke(); break;
      case 'claw':
        for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(i * 16 - 14, -36); x.quadraticCurveTo(i * 16 + 10, 0, i * 16 - 2, 40); x.lineWidth = 8; x.stroke(); } break;
      case 'fang':
        x.beginPath(); x.moveTo(-30, -26); x.lineTo(-10, -26); x.lineTo(-18, 34); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(30, -26); x.lineTo(10, -26); x.lineTo(18, 34); x.closePath(); x.fill(); x.fillRect(-36, -34, 72, 8); break;
      case 'crown':
        x.beginPath(); x.moveTo(-34, 20); x.lineTo(-34, -20); x.lineTo(-17, 0); x.lineTo(0, -30); x.lineTo(17, 0); x.lineTo(34, -20); x.lineTo(34, 20); x.closePath(); x.fill(); x.fillRect(-34, 24, 68, 8); break;
      case 'trident':
        x.fillRect(-3, -20, 6, 62); x.beginPath(); x.moveTo(-26, -40); x.lineTo(-26, -10); x.quadraticCurveTo(0, 6, 26, -10); x.lineTo(26, -40); x.stroke();
        x.beginPath(); x.moveTo(0, -46); x.lineTo(0, -16); x.stroke(); break;
      default: // sun
        x.beginPath(); x.arc(0, 0, 18, 0, Math.PI * 2); x.fill();
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.beginPath(); x.moveTo(Math.cos(a) * 24, Math.sin(a) * 24); x.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); x.stroke(); }
    }
    x.restore();
    if (initials) {
      x.fillStyle = hi; x.font = '700 22px Rajdhani, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.strokeStyle = bg; x.lineWidth = 5; x.strokeText(initials, 0, 42); x.fillText(initials, 0, 42);
    }
    x.restore();
    const url = c.toDataURL();
    cache.set(key, url);
    return url;
  }

  return { portrait, emblem };
})();
