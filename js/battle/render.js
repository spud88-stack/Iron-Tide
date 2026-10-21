'use strict';
// ---------- tactical overlay: draws battles onto the live map and handles RTS input ----------
const BRender = {
  cv: null, ctx: null, dpr: 1,
  sel: new Set(),
  targeting: null,      // support ability key awaiting a click
  drag: null,
  hover: null,
  zooming: false,

  init(map) {
    const cv = document.createElement('canvas');
    cv.id = 'tactical';
    map.getContainer().appendChild(cv);
    BRender.cv = cv; BRender.ctx = cv.getContext('2d');
    const resize = () => {
      const r = map.getContainer().getBoundingClientRect();
      BRender.dpr = window.devicePixelRatio || 1;
      cv.width = r.width * BRender.dpr; cv.height = r.height * BRender.dpr;
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    map.on('zoomanim', () => { BRender.zooming = true; });
    map.on('zoomend', () => { BRender.zooming = false; });
    BRender.bindInput(map);
  },

  // meters → screen transform for a battle
  xf(b) {
    const map = MapView.map;
    const p0 = map.latLngToContainerPoint([b.lat, b.lng]);
    const ll = U.m2ll(b.lat, b.lng, 100, 100);
    const p1 = map.latLngToContainerPoint(ll);
    return { ox: p0.x, oy: p0.y, sx: (p1.x - p0.x) / 100, sy: (p1.y - p0.y) / 100 };
  },
  toScreen(T, x, y) { return [T.ox + x * T.sx, T.oy + y * T.sy]; },
  toWorld(T, px, py) { return [(px - T.ox) / T.sx, (py - T.oy) / T.sy]; },

  focusedBattle() { return UI.focused ? Battle.byId(UI.focused) : null; },

  draw() {
    const cv = BRender.cv; if (!cv || !G) return;
    const ctx = BRender.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (BRender.zooming) return;
    const map = MapView.map;
    if (map.getZoom() < 14) return;
    ctx.setTransform(BRender.dpr, 0, 0, BRender.dpr, 0, 0);
    const W = cv.width / BRender.dpr, H = cv.height / BRender.dpr;
    for (const b of G.battles) {
      if (b.phase === 'loading') continue;
      const T = BRender.xf(b);
      const half = Terrain.SIZE / 2 * T.sx;
      if (T.ox + half < 0 || T.ox - half > W || T.oy + half < 0 || T.oy - half > H) continue;
      BRender.drawBattle(ctx, b, T, b.id === UI.focused);
    }
    // drag box
    if (BRender.drag && BRender.drag.box) {
      const d = BRender.drag;
      ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
      ctx.fillStyle = 'rgba(242,179,61,.08)'; ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
      ctx.setLineDash([]);
    }
  },

  poly(ctx, T, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const [px, py] = BRender.toScreen(T, x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.closePath();
  },

  drawBattle(ctx, b, T, focused) {
    const S = Terrain.SIZE / 2;
    const ppm = T.sx;
    const [ax, ay] = BRender.toScreen(T, -S, S), [bx, by] = BRender.toScreen(T, S, -S);
    // area
    ctx.save();
    if (b.env === 'platform') {
      ctx.fillStyle = 'rgba(4,14,22,.35)'; ctx.fillRect(ax, ay, bx - ax, by - ay);
    }
    if (b.night) { ctx.fillStyle = 'rgba(5,10,40,.32)'; ctx.fillRect(ax, ay, bx - ax, by - ay); }
    ctx.strokeStyle = focused ? 'rgba(242,179,61,.75)' : 'rgba(242,179,61,.35)';
    ctx.setLineDash([8, 6]); ctx.lineWidth = 1.5;
    ctx.strokeRect(ax, ay, bx - ax, by - ay);
    ctx.setLineDash([]);
    // decks
    for (const d of b.decks) {
      BRender.poly(ctx, T, d.pts);
      ctx.fillStyle = d.kind === 'bridge' ? '#3d4847' : '#4a5553';
      ctx.fill();
      ctx.strokeStyle = '#6f7d79'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (b.env === 'platform') {
      // helipad markings
      for (const p of b.pads || []) { const [px, py] = BRender.toScreen(T, p.x, p.y); ctx.strokeStyle = 'rgba(242,179,61,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 6 * ppm, 0, Math.PI * 2); ctx.stroke(); }
    }
    // obstacles
    for (const o of b.obstacles) {
      BRender.poly(ctx, T, o.pts);
      if (b.env === 'osm') { ctx.fillStyle = 'rgba(160,170,165,.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,210,205,.45)'; ctx.lineWidth = 1; ctx.stroke(); continue; }
      ctx.fillStyle = { building: '#2c3330', wall: '#55524a', tree: '#1f3a22', rock: '#4a4740', container: '#6b4b2e', core: '#22303a' }[o.kind] || '#333';
      ctx.fill();
      ctx.strokeStyle = o.kind === 'core' ? '#5ec8ff' : 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // fog of war (darken what the squad can't see)
    const ops = b.units.filter(u => u.side === 'player' && ALIVE(u) && u.kind !== 'camera' && u.kind !== 'uav');
    if (b.phase !== 'done') {
      ctx.beginPath();
      ctx.rect(ax, ay, bx - ax, by - ay);
      for (const u of ops) {
        const [px, py] = BRender.toScreen(T, u.x, u.y);
        const r = u.vision * Battle.nightMult(b, u) * ppm;
        ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, Math.PI * 2, true);
      }
      ctx.fillStyle = 'rgba(0,0,0,.30)';
      ctx.fill('evenodd');
    }
    // LZ / pads
    if (b.lz) {
      const [px, py] = BRender.toScreen(T, b.lz.x, b.lz.y);
      ctx.strokeStyle = (b.phase === 'exfil' || b.abort) ? '#78dc96' : 'rgba(120,220,150,.55)';
      ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(px, py, b.lz.r * ppm, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      BRender.label(ctx, 'LZ', px, py - b.lz.r * ppm - 6, '#78dc96');
    }
    // mines
    for (const m of b.mines) {
      if (!m.armed || !(m.known || m.side === 'player')) continue;
      const [px, py] = BRender.toScreen(T, m.x, m.y);
      ctx.fillStyle = m.side === 'player' ? 'rgba(94,200,255,.8)' : 'rgba(255,90,78,.9)';
      ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 5, py); ctx.lineTo(px, py + 5); ctx.lineTo(px - 5, py); ctx.closePath(); ctx.fill();
    }
    // objectives
    for (const o of b.objectives) {
      if (o.type === 'eliminate' || o.type === 'extract') continue;
      const [px, py] = BRender.toScreen(T, o.x, o.y);
      const col = o.done ? '#78dc96' : '#f2b33d';
      if (o.type === 'hold') {
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, o.r * ppm, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(242,179,61,.08)'; ctx.fill();
        if (o.started && !o.done) { ctx.beginPath(); ctx.arc(px, py, o.r * ppm + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o.prog / o.need); ctx.strokeStyle = '#78dc96'; ctx.lineWidth = 3; ctx.stroke(); }
      } else {
        const s = 8;
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(-s, -s, s * 2, s * 2);
        if (o.prog && !o.done) { ctx.fillStyle = 'rgba(242,179,61,.35)'; ctx.fillRect(-s, s - 2 * s * Math.min(1, o.prog / o.need), s * 2, 2 * s * Math.min(1, o.prog / o.need)); }
        ctx.restore();
        if (o.planted && !o.done) BRender.label(ctx, Math.ceil(o.boomT) + 's', px, py + 20, '#ff5a4e');
      }
      if (!o.done || o.type === 'defend') BRender.label(ctx, o.type === 'defend' ? 'CORE' : o.label.toUpperCase(), px, py - 16, col);
    }
    // smoke & gas
    for (const s of b.smokes) { const [px, py] = BRender.toScreen(T, s.x, s.y); const a = Math.min(1, s.t / 4); ctx.fillStyle = `rgba(190,195,200,${0.55 * a})`; ctx.beginPath(); ctx.arc(px, py, s.r * ppm, 0, Math.PI * 2); ctx.fill(); }
    for (const s of b.gas) { const [px, py] = BRender.toScreen(T, s.x, s.y); const a = Math.min(1, s.t / 4); ctx.fillStyle = `rgba(200,120,255,${0.35 * a})`; ctx.beginPath(); ctx.arc(px, py, s.r * ppm, 0, Math.PI * 2); ctx.fill(); }
    // vision cones of known hostiles
    const showEnemy = u => u.side !== 'enemy' || u.vis || u.marked || b.phase === 'done';
    for (const u of b.units) {
      if (u.side !== 'enemy' || !ALIVE(u) || !showEnemy(u) || u.kind === 'uav') continue;
      if (u.kind === 'intruder') continue;
      const [px, py] = BRender.toScreen(T, u.x, u.y);
      const vr = u.vision * Battle.nightMult(b, u) * ppm;
      const fov = u.kind === 'camera' ? 0.6 : (b.alert === 2 ? 1.3 : 1.0);
      const aw = U.clamp(u.ai.aware || 0, 0, 1);
      const col = u.ai.mode === 'combat' ? '255,70,60' : aw > 0.3 ? '255,190,60' : '255,255,255';
      const g = ctx.createRadialGradient(px, py, 0, px, py, vr);
      g.addColorStop(0, `rgba(${col},${0.20 + aw * 0.15})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      // screen y is flipped: world angle a maps to screen angle -a
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, vr, -u.face - fov, -u.face + fov); ctx.closePath(); ctx.fill();
    }
    // our cameras' cones (defense)
    for (const u of b.units) {
      if (u.side !== 'player' || u.kind !== 'camera' || !ALIVE(u)) continue;
      const [px, py] = BRender.toScreen(T, u.x, u.y);
      ctx.fillStyle = 'rgba(94,200,255,.12)';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, u.vision * ppm, -u.face - 0.6, -u.face + 0.6); ctx.closePath(); ctx.fill();
    }
    // paths of selected units
    if (focused) {
      for (const u of b.units) {
        if (!BRender.sel.has(u.uid) || !u.path || !u.path.length || !ALIVE(u)) continue;
        ctx.strokeStyle = 'rgba(94,200,255,.5)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
        ctx.beginPath(); let [px, py] = BRender.toScreen(T, u.x, u.y); ctx.moveTo(px, py);
        for (const [x, y] of u.path) { [px, py] = BRender.toScreen(T, x, y); ctx.lineTo(px, py); }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(94,200,255,.8)'; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // units
    const R = U.clamp(0.9 * ppm, 5, 11);
    for (const u of b.units) {
      if (u.state === 'fultoned' || u.state === 'extracted' || u.state === 'captured') continue;
      if (!showEnemy(u)) continue;
      BRender.drawUnit(ctx, b, T, u, R, focused);
    }
    // fx
    for (const f of b.fx) BRender.drawFx(ctx, T, f, ppm);
    // targeting preview
    if (focused && BRender.targeting && BRender.hover) {
      const ab = SUPPORT_ABILITIES[BRender.targeting];
      const [hx, hy] = BRender.hover;
      ctx.strokeStyle = '#f2b33d'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy, ab.radius * ppm, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // header label when zoomed further out
    if (ppm < 1.2) BRender.label(ctx, `${b.title.toUpperCase()} — ${b.place}`, (ax + bx) / 2, ay - 8, '#f2b33d');
    if (b.phase === 'done') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(ax, ay, bx - ax, by - ay);
      const ok = b.result && b.result.success;
      BRender.label(ctx, ok ? 'MISSION COMPLETE' : 'MISSION FAILED', (ax + bx) / 2, (ay + by) / 2, ok ? '#78dc96' : '#ff5a4e', 26);
    }
    ctx.restore();
  },

  drawUnit(ctx, b, T, u, R, focused) {
    const [px, py] = BRender.toScreen(T, u.x, u.y);
    const sel = focused && BRender.sel.has(u.uid);
    const alive = ALIVE(u);
    let col = u.side === 'player' ? (u.kind === 'sentry' ? '#7fb8d6' : '#5ec8ff') : u.side === 'neutral' ? '#ffd36b' : '#ff5a4e';
    if (u.kind === 'intruder') col = '#ff4fa5';
    const ghost = u.side === 'enemy' && !u.vis && alive;
    ctx.globalAlpha = ghost ? 0.55 : 1;
    if (u.kind === 'camera') {
      ctx.fillStyle = alive ? col : '#555';
      ctx.save(); ctx.translate(px, py); ctx.rotate(-u.face);
      ctx.fillRect(-4, -3, 9, 6); ctx.restore();
      ctx.globalAlpha = 1; return;
    }
    if (u.kind === 'uav') {
      ctx.strokeStyle = alive ? col : '#555'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py + 6); ctx.moveTo(px + 6, py - 6); ctx.lineTo(px - 6, py + 6); ctx.stroke();
      for (const [dx, dy] of [[-6, -6], [6, 6], [6, -6], [-6, 6]]) { ctx.beginPath(); ctx.arc(px + dx, py + dy, 3, 0, Math.PI * 2); ctx.stroke(); }
      if (alive && u.side === 'player') { ctx.strokeStyle = 'rgba(94,200,255,.25)'; ctx.beginPath(); ctx.arc(px, py, u.vision * T.sx, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; return;
    }
    if (sel) { ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, R + 4, 0, Math.PI * 2); ctx.stroke(); }
    if (u.state === 'dead') {
      ctx.strokeStyle = u.side === 'player' ? '#5ec8ff' : '#7a3a36'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px - R * .7, py - R * .7); ctx.lineTo(px + R * .7, py + R * .7); ctx.moveTo(px + R * .7, py - R * .7); ctx.lineTo(px - R * .7, py + R * .7); ctx.stroke();
      ctx.globalAlpha = 1; return;
    }
    // body
    ctx.fillStyle = u.state === 'ok' ? col : u.state === 'down' ? '#ff9a3c' : '#8a8f95';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (u.kind === 'officer' || u.target) { ctx.rect(px - R, py - R, R * 2, R * 2); }
    else if (u.kind === 'heavy') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](px + Math.cos(a) * R * 1.15, py + Math.sin(a) * R * 1.15); } ctx.closePath(); }
    else ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (u.state === 'ok' && u.kind !== 'hostage') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(-u.face) * R * 1.6, py + Math.sin(-u.face) * R * 1.6); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(-u.face) * R * 1.6, py + Math.sin(-u.face) * R * 1.6); ctx.stroke();
    }
    if (u.side === 'player' && u.stance === 'stealth' && u.state === 'ok') { ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(px, py, R + 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    // hp
    if ((u.side === 'player' || u.hp < u.maxHp) && u.state !== 'dead' && u.kind !== 'hostage') {
      const w = R * 2.4, f = U.clamp(u.hp / u.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(px - w / 2, py - R - 7, w, 3);
      ctx.fillStyle = f > .5 ? '#78dc96' : f > .25 ? '#f2b33d' : '#ff5a4e'; ctx.fillRect(px - w / 2, py - R - 7, w * f, 3);
      if (u.stun > 0 && u.state === 'ok') { ctx.fillStyle = '#b58cff'; ctx.fillRect(px - w / 2, py - R - 4, w * Math.min(1, u.stun / u.maxStun), 2); }
    }
    // state glyphs
    if (u.state === 'asleep') BRender.label(ctx, 'Zz', px + R + 4, py - R, '#c9c9ff', 11);
    if (u.state === 'down') BRender.label(ctx, `✚ ${Math.ceil(u.bleedT)}s`, px, py + R + 10, '#ff9a3c', 11);
    if (u.icon) BRender.label(ctx, u.icon, px, py - R - 12, u.icon === '!' ? '#ff5a4e' : '#f2b33d', 16);
    if (u.act) {
      const f = Math.min(1, u.act.t / u.act.total);
      ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, R + 6, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    }
    if (T.sx > 1.6 && (u.side === 'player' || u.target || u.kind === 'hostage')) BRender.label(ctx, u.name, px, py + R + (u.state === 'down' ? 22 : 11), u.side === 'player' ? '#bfe9ff' : '#ffe3a3', 10);
    if (u.target && u.state === 'ok') { ctx.strokeStyle = '#ff5a4e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, R + 8 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },

  drawFx(ctx, T, f, ppm) {
    if (f.t < 0) return;
    const a = 1 - f.t / f.life;
    if (f.type === 'tracer') {
      const [x1, y1] = BRender.toScreen(T, f.x1, f.y1), [x2, y2] = BRender.toScreen(T, f.x2, f.y2);
      ctx.strokeStyle = f.nl ? `rgba(181,140,255,${a})` : f.side === 'player' ? `rgba(160,230,255,${a})` : `rgba(255,200,120,${a})`;
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (f.type === 'hit' || f.type === 'dart') {
      const [x, y] = BRender.toScreen(T, f.x, f.y);
      ctx.fillStyle = f.type === 'hit' ? `rgba(255,80,60,${a})` : `rgba(181,140,255,${a})`;
      ctx.beginPath(); ctx.arc(x, y, 3 + (1 - a) * 4, 0, Math.PI * 2); ctx.fill();
    } else if (f.type === 'boom') {
      const [x, y] = BRender.toScreen(T, f.x, f.y);
      const r = f.r * ppm * (0.4 + (1 - a) * 0.8);
      ctx.fillStyle = f.nl ? `rgba(181,140,255,${a * 0.6})` : `rgba(255,150,50,${a * 0.7})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,200,${a})`; ctx.lineWidth = 2; ctx.stroke();
    } else if (f.type === 'fulton') {
      const [x, y] = BRender.toScreen(T, f.x, f.y);
      const p = f.t / f.life;
      const by = y - 10 - p * p * 160;
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - Math.max(0, p - 0.3) * 200); ctx.lineTo(x, by); ctx.stroke();
      if (f.ok || p < 0.5) { ctx.fillStyle = `rgba(242,179,61,${a})`; ctx.beginPath(); ctx.ellipse(x, by - 7, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); }
      else BRender.label(ctx, 'FAILED', x, y - 20, '#ff5a4e', 12);
    } else if (f.type === 'heli') {
      const [x, y] = BRender.toScreen(T, f.x, f.y);
      ctx.strokeStyle = `rgba(120,220,150,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 10 + (1 - a) * 20, 0, Math.PI * 2); ctx.stroke();
    } else if (f.type === 'incoming') {
      const [x, y] = BRender.toScreen(T, f.x, f.y);
      ctx.strokeStyle = f.key === 'supply' ? 'rgba(120,220,150,.8)' : 'rgba(255,90,78,.8)';
      ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, f.r * ppm, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      BRender.label(ctx, Math.max(0, f.life - f.t).toFixed(1), x, y, '#fff', 12);
    } else if (f.type === 'crate') {
      const [x, y] = BRender.toScreen(T, f.x, f.y);
      ctx.fillStyle = `rgba(120,220,150,${a})`; ctx.fillRect(x - 5, y - 5, 10, 10);
    } else if (f.type === 'alert') {
      // flash handled by HUD
    }
  },

  label(ctx, txt, x, y, col = '#fff', size = 12) {
    ctx.font = `700 ${size}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = col; ctx.fillText(txt, x, y);
  },

  // ---------- input ----------
  unitAt(b, T, px, py, pred) {
    let best = null, bd = 16;
    for (const u of b.units) {
      if (u.state === 'fultoned' || u.state === 'extracted' || u.state === 'captured') continue;
      if (u.side === 'enemy' && !u.vis && !u.marked) continue;
      if (pred && !pred(u)) continue;
      const [x, y] = BRender.toScreen(T, u.x, u.y);
      const d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  inArea(b, T, px, py) {
    const [x, y] = BRender.toWorld(T, px, py);
    return Math.abs(x) <= Terrain.SIZE / 2 && Math.abs(y) <= Terrain.SIZE / 2;
  },

  bindInput(map) {
    const el = map.getContainer();
    const pt = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('mousedown', e => {
      const b = BRender.focusedBattle();
      if (!b || e.button !== 0 || !e.shiftKey || b.phase === 'loading') return;
      e.stopPropagation(); e.preventDefault();
      const [x, y] = pt(e);
      BRender.drag = { x0: x, y0: y, x1: x, y1: y, box: true };
      const move = ev => { const [mx, my] = pt(ev); BRender.drag.x1 = mx; BRender.drag.y1 = my; };
      const up = () => {
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
        const d = BRender.drag; BRender.drag = null;
        if (!d) return;
        const T = BRender.xf(b);
        const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
        if (x1 - x0 < 4 && y1 - y0 < 4) return;
        for (const u of b.units) {
          if (u.side !== 'player' || !ALIVE(u) || (u.kind !== 'op' && u.kind !== 'sentry')) continue;
          const [ux, uy] = BRender.toScreen(T, u.x, u.y);
          if (ux >= x0 && ux <= x1 && uy >= y0 && uy <= y1) BRender.sel.add(u.uid);
        }
        HUD.refresh();
      };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    }, true);
    el.addEventListener('mousemove', e => { BRender.hover = pt(e); });

    map.on('click', e => {
      const b = BRender.focusedBattle(); if (!b || b.phase === 'loading' || b.phase === 'done') return;
      const T = BRender.xf(b);
      const [px, py] = [e.containerPoint.x, e.containerPoint.y];
      if (BRender.targeting) {
        if (!BRender.inArea(b, T, px, py)) return;
        const [x, y] = BRender.toWorld(T, px, py);
        if (Battle.useSupport(b, BRender.targeting, x, y)) BRender.targeting = null;
        HUD.refresh();
        return;
      }
      if (!BRender.inArea(b, T, px, py)) return;
      const u = BRender.unitAt(b, T, px, py, u => u.side === 'player' && (u.kind === 'op' || u.kind === 'sentry'));
      if (!e.originalEvent.shiftKey && !e.originalEvent.ctrlKey) BRender.sel.clear();
      if (u) { if (BRender.sel.has(u.uid) && (e.originalEvent.ctrlKey)) BRender.sel.delete(u.uid); else BRender.sel.add(u.uid); }
      HUD.refresh();
    });

    map.on('contextmenu', e => {
      const b = BRender.focusedBattle(); if (!b || b.phase === 'loading' || b.phase === 'done') return;
      if (BRender.targeting) { BRender.targeting = null; HUD.refresh(); return; }
      const T = BRender.xf(b);
      const [px, py] = [e.containerPoint.x, e.containerPoint.y];
      if (!BRender.inArea(b, T, px, py)) return;
      const ids = [...BRender.sel].filter(id => { const u = Battle.unit(b, id); return u && ALIVE(u); });
      if (!ids.length) return;
      BRender.commandAt(b, T, ids, px, py);
    });
  },

  commandAt(b, T, ids, px, py) {
    const [x, y] = BRender.toWorld(T, px, py);
    const first = Battle.unit(b, ids[0]);
    const t = BRender.unitAt(b, T, px, py, u => !ids.includes(u.uid));
    let ord = null, mark = '#5ec8ff';
    if (t) {
      if (Battle.fultonable(b, first, t)) { ord = { type: 'fulton', tid: t.uid }; mark = '#f2b33d'; }
      else if (t.side === 'player' && (t.state === 'down' || t.state === 'asleep')) ord = { type: 'revive', tid: t.uid };
      else if (t.side === 'enemy' && t.state === 'ok') { ord = { type: 'attack', tid: t.uid }; mark = '#ff5a4e'; }
    }
    if (!ord) {
      const o = b.objectives.find(o => !o.done && !o.planted && (o.type === 'sabotage' || o.type === 'intel' || o.type === 'core') && Math.hypot(...BRender.toScreen(T, o.x, o.y).map((v, i) => v - [px, py][i])) < 18);
      if (o) { ord = { type: 'interact', oid: o.id }; mark = '#f2b33d'; }
    }
    if (ord && ord.type !== 'attack') {
      // single specialist does the job
      const best = ids.map(id => Battle.unit(b, id)).sort((a, c) => U.dist(a.x, a.y, x, y) - U.dist(c.x, c.y, x, y))[0];
      Battle.order(b, [best.uid], ord);
      const rest = ids.filter(id => id !== best.uid);
      if (rest.length) Battle.order(b, rest, { type: 'move', x, y });
    } else if (ord) Battle.order(b, ids, ord);
    else Battle.order(b, ids, { type: 'move', x, y });
    b.fx.push({ type: 'hit', x, y, t: 0, life: 0.35 });
    HUD.refresh();
  },
};
