'use strict';
// ---------- generic helpers ----------
const U = {};
(function () {
  U.mulberry32 = function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  U.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  U.chance = p => Math.random() < p;
  U.gauss = (m = 0, s = 1) => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  U.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  U.weighted = (items, wf) => {
    let tot = 0; for (const it of items) tot += Math.max(0, wf(it));
    let r = Math.random() * tot;
    for (const it of items) { r -= Math.max(0, wf(it)); if (r <= 0) return it; }
    return items[items.length - 1];
  };
  U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  U.hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  U.fmt = n => Math.round(n).toLocaleString('en-US');
  U.fmtShort = n => {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(0) + 'K';
    if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.round(n) + '';
  };
  U.pad = n => String(n).padStart(2, '0');
  U.fmtClock = mins => {
    const d = Math.floor(mins / 1440) + 1, h = Math.floor(mins % 1440 / 60), m = Math.floor(mins % 60);
    return `DAY ${d} <small>${U.pad(h)}:${U.pad(m)} UTC</small>`;
  };
  U.fmtDur = mins => {
    mins = Math.max(0, Math.round(mins));
    const d = Math.floor(mins / 1440), h = Math.floor(mins % 1440 / 60), m = mins % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${U.pad(m)}m`;
    return `${m}m`;
  };
  U.fmtSec = s => `${Math.floor(s / 60)}:${U.pad(Math.floor(s % 60))}`;
  U.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.haversine = (la1, lo1, la2, lo2) => {
    const R = 6371, r = Math.PI / 180;
    const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };
  // great-circle interpolation
  U.gcInterp = (la1, lo1, la2, lo2, t) => {
    const r = Math.PI / 180;
    const v1 = [Math.cos(la1 * r) * Math.cos(lo1 * r), Math.cos(la1 * r) * Math.sin(lo1 * r), Math.sin(la1 * r)];
    const v2 = [Math.cos(la2 * r) * Math.cos(lo2 * r), Math.cos(la2 * r) * Math.sin(lo2 * r), Math.sin(la2 * r)];
    const dot = U.clamp(v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2], -1, 1);
    const d = Math.acos(dot);
    if (d < 1e-7) return [la1, lo1];
    const A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
    const x = A * v1[0] + B * v2[0], y = A * v1[1] + B * v2[1], z = A * v1[2] + B * v2[2];
    return [Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r];
  };
  // polyline along a great circle, longitudes unwrapped so Leaflet doesn't draw across the whole map
  U.gcLine = (la1, lo1, la2, lo2, n = 48) => {
    const pts = []; let prev = null;
    for (let i = 0; i <= n; i++) {
      let [la, lo] = U.gcInterp(la1, lo1, la2, lo2, i / n);
      if (prev !== null) { while (lo - prev > 180) lo -= 360; while (lo - prev < -180) lo += 360; }
      prev = lo; pts.push([la, lo]);
    }
    return pts;
  };
  U.m2ll = (lat0, lng0, x, y) => [lat0 + y / 111320, lng0 + x / (111320 * Math.cos(lat0 * Math.PI / 180))];
  U.ll2m = (lat0, lng0, lat, lng) => [(lng - lng0) * 111320 * Math.cos(lat0 * Math.PI / 180), (lat - lat0) * 111320];
  U.pointInPoly = (x, y, pts) => {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  };
  U.rectPoly = (x, y, w, h, a = 0) => {
    const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hh = h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
  };
  // local solar hour at a longitude
  U.localHour = (mins, lng) => (((mins / 60 + lng / 15) % 24) + 24) % 24;
  U.isNight = (mins, lng) => { const h = U.localHour(mins, lng); return h < 5.5 || h > 19.5; };
  U.costStr = (cost, have) => {
    const parts = [];
    for (const k of ['gmp', 'fuel', 'bio', 'common', 'minor', 'precious']) {
      if (!cost[k]) continue;
      const short = have && (have[k] || 0) < cost[k];
      parts.push(`<span class="${short ? 'short' : ''}">${RES_LABEL[k]} ${U.fmtShort(cost[k])}</span>`);
    }
    return parts.join(' · ');
  };
})();

const Bus = {
  h: {},
  on(e, f) { (this.h[e] || (this.h[e] = [])).push(f); },
  emit(e, ...a) { (this.h[e] || []).forEach(f => { try { f(...a); } catch (err) { console.error(err); } }); }
};

// global click-action registry (data-act="name")
const ACT = {};
