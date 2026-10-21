'use strict';
// ---------- battle terrain: OSM buildings, procedural maps, FOB platforms, grid, LOS, pathfinding ----------
const Terrain = {
  SIZE: 300,
  CELL: 2.5,
  get W() { return Math.round(this.SIZE / this.CELL); },
  cache: new Map(),
  ENDPOINTS: ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],

  key(lat, lng) { return lat.toFixed(4) + ',' + lng.toFixed(4); },

  prefetch(lat, lng) {
    if (!G.settings.osm) return null;
    const k = Terrain.key(lat, lng);
    if (!Terrain.cache.has(k)) Terrain.cache.set(k, Terrain.fetchOSM(lat, lng));
    return Terrain.cache.get(k);
  },

  async fetchOSM(lat, lng) {
    const half = Terrain.SIZE / 2 + 15;
    const dLat = half / 111320, dLng = half / (111320 * Math.cos(lat * Math.PI / 180));
    const q = `[out:json][timeout:20];way["building"](${(lat - dLat).toFixed(6)},${(lng - dLng).toFixed(6)},${(lat + dLat).toFixed(6)},${(lng + dLng).toFixed(6)});out geom;`;
    // public Overpass mirrors are often slow: query them in parallel and take the first good answer
    const ctls = [];
    const attempt = async ep => {
      const ctl = new AbortController(); ctls.push(ctl);
      const to = setTimeout(() => ctl.abort(), Terrain.FETCH_TIMEOUT);
      try {
        const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const js = await res.json();
        const polys = [];
        for (const el of js.elements || []) {
          if (!el.geometry || el.geometry.length < 4) continue;
          const pts = el.geometry.map(g => { const [x, y] = U.ll2m(lat, lng, g.lat, g.lon); return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]; });
          pts.pop(); // closed ring duplicate
          polys.push(pts);
        }
        return polys;
      } finally { clearTimeout(to); }
    };
    try {
      const polys = await Promise.any(Terrain.ENDPOINTS.map(attempt));
      ctls.forEach(c => c.abort());
      return polys;
    } catch (e) { return null; }
  },
  FETCH_TIMEOUT: 45000,

  // ---------- generation ----------
  async build(b, spec) {
    b.obstacles = []; b.decks = [];
    if (spec.platform) {
      Terrain.procPlatform(b, spec.platform);
    } else {
      let polys = null;
      if (G.settings.osm) {
        const p = Terrain.prefetch(b.lat, b.lng);
        polys = p ? await Promise.race([p, new Promise(r => setTimeout(() => r(null), Terrain.FETCH_TIMEOUT + 2000))]) : null;
        if (!polys) Terrain.cache.delete(Terrain.key(b.lat, b.lng));
      }
      if (polys && polys.length >= 6) {
        b.env = 'osm';
        b.obstacles = polys.map(pts => ({ pts, kind: 'building' }));
      } else if (spec.urban) {
        b.env = 'urban';
        Terrain.procUrban(b);
      } else {
        b.env = 'rural';
        Terrain.procRural(b);
      }
    }
    Terrain.makeGrid(b);
  },

  procUrban(b) {
    const S = Terrain.SIZE, ang = U.rand(0, Math.PI / 2);
    const rot = (x, y) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
    const blk = U.randi(40, 52), street = U.randi(9, 13);
    const off = U.rand(0, blk);
    for (let bx = -S; bx < S; bx += blk) for (let by = -S; by < S; by += blk) {
      if (U.chance(0.12)) continue; // plaza / lot
      const x0 = bx + off + street / 2, y0 = by + off + street / 2, sz = blk - street;
      const split = U.randi(1, 3);
      for (let i = 0; i < split; i++) for (let j = 0; j < split; j++) {
        if (split > 1 && U.chance(0.18)) continue;
        const cw = sz / split, w = cw * U.rand(0.62, 0.92), h = cw * U.rand(0.62, 0.92);
        const cx = x0 + cw * i + cw / 2, cy = y0 + cw * j + cw / 2;
        const [rx, ry] = rot(cx, cy);
        if (Math.abs(rx) > S / 2 + 20 || Math.abs(ry) > S / 2 + 20) continue;
        b.obstacles.push({ pts: U.rectPoly(rx, ry, w, h, ang), kind: 'building' });
      }
    }
  },

  procRural(b) {
    const cw = U.randi(50, 70), ch = U.randi(45, 65);
    const ox = U.rand(-30, 30), oy = U.rand(-30, 30);
    // compound walls with gates
    const t = 1.6, gate = 8;
    const walls = [
      [ox, oy + ch / 2, cw, t], [ox, oy - ch / 2, cw, t], [ox - cw / 2, oy, t, ch], [ox + cw / 2, oy, t, ch],
    ];
    walls.forEach(([x, y, w, h], i) => {
      const horiz = w > h; const len = horiz ? w : h;
      const gp = U.rand(-len / 4, len / 4);
      const a = (len / 2 + gp - gate / 2), bl = (len / 2 - gp - gate / 2);
      if (horiz) {
        b.obstacles.push({ pts: U.rectPoly(x - len / 2 + a / 2, y, a, h), kind: 'wall' });
        b.obstacles.push({ pts: U.rectPoly(x + len / 2 - bl / 2, y, bl, h), kind: 'wall' });
      } else {
        b.obstacles.push({ pts: U.rectPoly(x, y - len / 2 + a / 2, w, a), kind: 'wall' });
        b.obstacles.push({ pts: U.rectPoly(x, y + len / 2 - bl / 2, w, bl), kind: 'wall' });
      }
    });
    // buildings inside compound
    for (let i = 0; i < U.randi(3, 5); i++) {
      b.obstacles.push({ pts: U.rectPoly(ox + U.rand(-cw / 3, cw / 3), oy + U.rand(-ch / 3, ch / 3), U.randi(7, 13), U.randi(6, 10), U.chance(.5) ? 0 : Math.PI / 2), kind: 'building' });
    }
    // village huts & sheds
    for (let i = 0; i < U.randi(10, 18); i++) {
      const x = U.rand(-140, 140), y = U.rand(-140, 140);
      if (Math.abs(x - ox) < cw / 2 + 8 && Math.abs(y - oy) < ch / 2 + 8) continue;
      b.obstacles.push({ pts: U.rectPoly(x, y, U.randi(5, 11), U.randi(5, 9), U.rand(0, Math.PI)), kind: 'building' });
    }
    // rocks, trees, crates
    for (let i = 0; i < 46; i++) {
      const x = U.rand(-145, 145), y = U.rand(-145, 145), r = U.rand(1.2, 3);
      const pts = []; for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; pts.push([x + Math.cos(a) * r * U.rand(.75, 1.2), y + Math.sin(a) * r * U.rand(.75, 1.2)]); }
      b.obstacles.push({ pts, kind: U.chance(.6) ? 'tree' : 'rock' });
    }
  },

  procPlatform(b, spec) {
    b.env = 'platform';
    const n = U.clamp(spec.plat || 1, 1, 4);
    const R = 108, P = 52, C = 72;
    const a0 = U.rand(0, Math.PI * 2);
    b.decks.push({ pts: U.rectPoly(0, 0, C, C), kind: 'deck' });
    b.pads = [];
    // core: four corner blocks leaving a cross of corridors to the core
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.obstacles.push({ pts: U.rectPoly(sx * 10, sy * 10, 11, 11), kind: 'core' });
    for (let i = 0; i < n; i++) {
      const a = a0 + i * Math.PI * 2 / Math.max(n, 2) + (n === 1 ? 0 : 0);
      const cx = Math.cos(a) * R, cy = Math.sin(a) * R;
      b.decks.push({ pts: U.rectPoly(cx, cy, P, P, a), kind: 'deck' });
      // bridge
      const bl = R - C / 2 - P / 2 + 8, bm = C / 2 - 4 + bl / 2;
      b.decks.push({ pts: U.rectPoly(Math.cos(a) * bm, Math.sin(a) * bm, bl, 7, a), kind: 'bridge' });
      b.pads.push({ x: Math.cos(a) * (R + P / 2 - 4), y: Math.sin(a) * (R + P / 2 - 4), a, cx, cy });
      // containers / sheds off the main axis
      for (let k = 0; k < U.randi(4, 7); k++) {
        const lx = U.rand(-P / 2 + 5, P / 2 - 5), ly = U.rand(-P / 2 + 5, P / 2 - 5);
        if (Math.abs(ly) < 7) continue; // keep axis corridor clear
        const big = U.chance(0.25);
        const w = big ? U.randi(9, 13) : 6, h = big ? U.randi(7, 9) : 2.6;
        const la = U.chance(.5) ? 0 : Math.PI / 2;
        const wx = cx + lx * Math.cos(a) - ly * Math.sin(a), wy = cy + lx * Math.sin(a) + ly * Math.cos(a);
        b.obstacles.push({ pts: U.rectPoly(wx, wy, w, h, a + la), kind: big ? 'building' : 'container' });
      }
    }
    // center deck clutter away from corridors
    for (let k = 0; k < 8; k++) {
      const x = U.rand(-C / 2 + 4, C / 2 - 4), y = U.rand(-C / 2 + 4, C / 2 - 4);
      if (Math.abs(x) < 20 && Math.abs(y) < 20) continue;
      let blocked = false;
      for (const p of b.pads) { const d = Math.abs(-Math.sin(p.a) * x + Math.cos(p.a) * y); if (d < 7) blocked = true; }
      if (blocked) continue;
      b.obstacles.push({ pts: U.rectPoly(x, y, 6, 2.6, U.chance(.5) ? 0 : Math.PI / 2), kind: 'container' });
    }
    b.core = { x: 0, y: 0 };
  },

  // ---------- grid ----------
  makeGrid(b) {
    const W = Terrain.W, S = Terrain.SIZE, C = Terrain.CELL;
    const g = new Uint8Array(W * W);
    const fillPoly = (pts, val, onlyIf) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const cx0 = Math.max(0, Math.floor((x0 + S / 2) / C)), cx1 = Math.min(W - 1, Math.floor((x1 + S / 2) / C));
      const cy0 = Math.max(0, Math.floor((y0 + S / 2) / C)), cy1 = Math.min(W - 1, Math.floor((y1 + S / 2) / C));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const px = cx * C - S / 2 + C / 2, py = cy * C - S / 2 + C / 2;
        if (U.pointInPoly(px, py, pts) && (onlyIf === undefined || g[cy * W + cx] === onlyIf)) g[cy * W + cx] = val;
      }
    };
    if (b.env === 'platform') {
      g.fill(2);
      for (const d of b.decks) fillPoly(d.pts, 0);
    }
    for (const o of b.obstacles) fillPoly(o.pts, 1, b.env === 'platform' ? 0 : undefined);
    b.grid = g;
  },

  cell(x, y) { const S = Terrain.SIZE, C = Terrain.CELL; return [Math.floor((x + S / 2) / C), Math.floor((y + S / 2) / C)]; },
  center(cx, cy) { const S = Terrain.SIZE, C = Terrain.CELL; return [cx * C - S / 2 + C / 2, cy * C - S / 2 + C / 2]; },
  inb(cx, cy) { const W = Terrain.W; return cx >= 0 && cy >= 0 && cx < W && cy < W; },
  free(b, cx, cy) { return Terrain.inb(cx, cy) && b.grid[cy * Terrain.W + cx] === 0; },
  freeAt(b, x, y) { const [cx, cy] = Terrain.cell(x, y); return Terrain.free(b, cx, cy); },
  solid(b, cx, cy) { return Terrain.inb(cx, cy) && b.grid[cy * Terrain.W + cx] === 1; },

  // line of sight: walls (1) block, water (2) doesn't
  los(b, x1, y1, x2, y2) {
    const C = Terrain.CELL;
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / (C * 0.5));
    const W = Terrain.W, S = Terrain.SIZE, g = b.grid;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor((x1 + (x2 - x1) * t + S / 2) / C), cy = Math.floor((y1 + (y2 - y1) * t + S / 2) / C);
      if (cx < 0 || cy < 0 || cx >= W || cy >= W) continue;
      if (g[cy * W + cx] === 1) return false;
    }
    return true;
  },

  walkLine(b, x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / (Terrain.CELL * 0.4));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      // check a little width so units don't clip corners
      if (!Terrain.freeAt(b, x, y)) return false;
    }
    return true;
  },

  cover(b, x, y) {
    const [cx, cy] = Terrain.cell(x, y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && Terrain.solid(b, cx + dx, cy + dy)) return true;
    return false;
  },

  nearestFree(b, x, y, needReach) {
    const [sx, sy] = Terrain.cell(x, y);
    const W = Terrain.W;
    for (let r = 0; r < W; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = sx + dx, cy = sy + dy;
        if (Terrain.free(b, cx, cy) && (!needReach || !b.reach || b.reach[cy * W + cx])) return Terrain.center(cx, cy);
      }
    }
    return [x, y];
  },

  flood(b, x, y) {
    const W = Terrain.W;
    const reach = new Uint8Array(W * W);
    const [sx, sy] = Terrain.cell(x, y);
    if (!Terrain.free(b, sx, sy)) return reach;
    const q = [sy * W + sx]; reach[q[0]] = 1;
    let n = 0;
    while (q.length) {
      const i = q.pop(); n++;
      const cx = i % W, cy = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!Terrain.free(b, nx, ny)) continue;
        const j = ny * W + nx;
        if (!reach[j]) { reach[j] = 1; q.push(j); }
      }
    }
    reach.count = n;
    return reach;
  },

  randomReachable(b, x0, y0, r0, r1, tries = 200) {
    const W = Terrain.W;
    for (let i = 0; i < tries; i++) {
      const a = U.rand(0, Math.PI * 2), r = U.rand(r0, r1);
      const x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r;
      const [cx, cy] = Terrain.cell(x, y);
      if (Terrain.free(b, cx, cy) && (!b.reach || b.reach[cy * W + cx]) && Math.abs(x) < Terrain.SIZE / 2 - 4 && Math.abs(y) < Terrain.SIZE / 2 - 4) return Terrain.center(cx, cy);
    }
    return Terrain.nearestFree(b, x0, y0, true);
  },

  // A* on 8-connected grid (no corner cutting), then string-pulled
  findPath(b, sx, sy, tx, ty) {
    const W = Terrain.W, g = b.grid;
    let [scx, scy] = Terrain.cell(sx, sy);
    let [tcx, tcy] = Terrain.cell(tx, ty);
    if (!Terrain.free(b, scx, scy)) { const p = Terrain.nearestFree(b, sx, sy); [scx, scy] = Terrain.cell(p[0], p[1]); }
    if (!Terrain.free(b, tcx, tcy)) { const p = Terrain.nearestFree(b, tx, ty, true); [tcx, tcy] = Terrain.cell(p[0], p[1]); tx = p[0]; ty = p[1]; }
    if (b.reach && !b.reach[tcy * W + tcx]) { const p = Terrain.nearestFree(b, tx, ty, true); [tcx, tcy] = Terrain.cell(p[0], p[1]); tx = p[0]; ty = p[1]; }
    if (Terrain.walkLine(b, sx, sy, tx, ty)) return [[tx, ty]];
    const N = W * W;
    const gs = Terrain._gs || (Terrain._gs = new Float32Array(N));
    const from = Terrain._from || (Terrain._from = new Int32Array(N));
    const closed = Terrain._closed || (Terrain._closed = new Uint8Array(N));
    gs.fill(Infinity); from.fill(-1); closed.fill(0);
    const start = scy * W + scx, goal = tcy * W + tcx;
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = (cx, cy) => { const dx = Math.abs(cx - tcx), dy = Math.abs(cy - tcy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    gs[start] = 0; push(start, h(scx, scy));
    let found = false, it = 0;
    while (heap.length && it++ < 16000) {
      const [, i] = pop();
      if (closed[i]) continue;
      if (i === goal) { found = true; break; }
      closed[i] = 1;
      const cx = i % W, cy = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const j = ny * W + nx;
        if (g[j] !== 0 || closed[j]) continue;
        if (dx && dy && (g[cy * W + nx] !== 0 || g[ny * W + cx] !== 0)) continue;
        const ng = gs[i] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < gs[j]) { gs[j] = ng; from[j] = i; push(j, ng + h(nx, ny)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i !== -1 && i !== start; i = from[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map(i => Terrain.center(i % W, (i / W) | 0));
    pts[pts.length - 1] = [tx, ty];
    // string pulling
    const out = [];
    let cx = sx, cy = sy, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (Terrain.walkLine(b, cx, cy, pts[m][0], pts[m][1])) { far = m; break; }
      out.push(pts[far]); [cx, cy] = pts[far]; k = far + 1;
    }
    return out;
  },
};
