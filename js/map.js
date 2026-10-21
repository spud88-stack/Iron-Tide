'use strict';
// ---------- world map (Leaflet) ----------
const MapView = {
  map: null, ready: false,
  layers: {}, groups: {},
  heli: new Map(), routes: new Map(), battleMk: new Map(),
  pendingRefresh: false,
  sites: new Map(),
  seen: new Set(), seenInit: false,

  init() {
    const map = L.map('map', { zoomControl: false, worldCopyJump: true, minZoom: 2, maxZoom: 19, boxZoom: false, zoomSnap: 0.25, wheelPxPerZoomLevel: 90, attributionControl: true });
    MapView.map = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const esri = p => `https://server.arcgisonline.com/ArcGIS/rest/services/${p}/MapServer/tile/{z}/{y}/{x}`;
    // tactical: Esri dark canvas for the globe, dark-filtered OSM for street level
    MapView.layers.dark = L.layerGroup([
      L.tileLayer(esri('Canvas/World_Dark_Gray_Base'), { maxNativeZoom: 16, maxZoom: 16, attribution: 'Tiles &copy; Esri' }),
      L.tileLayer(esri('Canvas/World_Dark_Gray_Reference'), { maxNativeZoom: 16, maxZoom: 16, pane: 'overlayPane', opacity: 0.8 }),
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom: 16.25, maxNativeZoom: 19, maxZoom: 19, className: 'osm-dark', attribution: '&copy; OpenStreetMap contributors' }),
    ]);
    MapView.layers.sat = L.tileLayer(esri('World_Imagery'), { maxNativeZoom: 18, maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' });
    MapView.layers.labels = L.tileLayer(esri('Reference/World_Boundaries_and_Places'), { maxZoom: 19, maxNativeZoom: 18, pane: 'overlayPane', opacity: 0.85 });
    MapView.groups.static = L.layerGroup().addTo(map);
    MapView.groups.lines = L.layerGroup().addTo(map);
    MapView.groups.dyn = L.layerGroup().addTo(map);
    MapView.groups.battles = L.layerGroup().addTo(map);
    MapView.groups.zones = L.layerGroup();
    MapView.setLayer(false);
    map.setView([0, 30], 3);
    BRender.init(map);
    map.on('moveend', MapView.checkFocus);
    map.on('zoomend', () => {
      const z = map.getZoom();
      if (z >= 14.5) map.removeLayer(MapView.groups.battles); else if (!map.hasLayer(MapView.groups.battles)) map.addLayer(MapView.groups.battles);
      document.body.classList.toggle('zoomed-in', z >= 12);
    });
    map.on('popupclose', () => { if (MapView.pendingRefresh) { MapView.pendingRefresh = false; setTimeout(MapView.refreshStatic, 50); } });
    MapView.ready = true;
  },

  setLayer(sat) {
    const m = MapView.map;
    for (const k of ['dark', 'sat', 'labels']) if (m.hasLayer(MapView.layers[k])) m.removeLayer(MapView.layers[k]);
    if (sat) { MapView.layers.sat.addTo(m); MapView.layers.labels.addTo(m); }
    else MapView.layers.dark.addTo(m);
    if (G) G.settings.satellite = sat;
  },

  flyTo(lat, lng, zoom = 6, dur = 1.6) { MapView.map.flyTo([lat, lng], zoom, { duration: dur }); },

  icon(cls, html = '', size = 24) { return L.divIcon({ className: '', html: `<div class="mk ${cls}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] }); },

  refreshStatic() {
    if (!MapView.ready || !G) return;
    if (MapView.map._popup && MapView.map.hasLayer(MapView.map._popup)) { MapView.pendingRefresh = true; return; }
    const g = MapView.groups.static; g.clearLayers();
    // Mother Base
    const mb = L.marker([G.base.lat, G.base.lng], { icon: MapView.icon('mk-mb', '', 30), zIndexOffset: 1000 }).addTo(g);
    mb.bindTooltip(`<b>${U.esc(G.base.name)}</b> — Mother Base`, { className: 'tt', direction: 'top', offset: [0, -16] });
    mb.bindPopup(() => UI.popupMB(), { maxWidth: 320 });
    // FOBs
    for (const f of G.fobs) {
      const building = f.build && f.build.what === 'fob';
      const m = L.marker([f.lat, f.lng], { icon: MapView.icon('mk-fob' + (building ? ' building' : ''), '', 20), zIndexOffset: 900 }).addTo(g);
      m.bindTooltip(`<b>${U.esc(f.name)}</b> ${building ? '(under construction)' : ''}`, { className: 'tt', direction: 'top', offset: [0, -12] });
      m.bindPopup(() => UI.popupFob(f.id), { maxWidth: 320 });
    }
    // rival PFs
    for (const p of G.pfs) {
      const em = Art.emblem(p.emblem, p.initials);
      for (const f of p.fobs) {
        const icon = L.divIcon({ className: '', html: `<div class="mk mk-pf${p.known ? '' : ' unknown'}" style="background-image:url(${em})"></div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -13] });
        const m = L.marker([f.lat, f.lng], { icon }).addTo(g);
        m.bindTooltip(`<b>${U.esc(p.known ? p.name : 'Unidentified PF')}</b> — ${U.esc(f.name)}`, { className: 'tt', direction: 'top', offset: [0, -14] });
        m.bindPopup(() => UI.popupPF(f.id), { maxWidth: 340 });
      }
    }
    // contracts
    for (const c of G.contracts) {
      if (c.status !== 'open') continue;
      const fresh = MapView.seenInit && !MapView.seen.has(c.id);
      MapView.seen.add(c.id);
      const icon = L.divIcon({ className: '', html: `<div class="mk mk-ct${c.diff >= 7 ? ' hot' : ''}${fresh ? ' pop' : ''}">${c.diff}</div>${fresh ? '<div class="ctring"></div>' : ''}`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11] });
      const m = L.marker([c.lat, c.lng], { icon }).addTo(g);
      m.bindTooltip(`<b>${U.esc(c.title)}</b><br>${U.esc(c.city)}, ${U.esc(c.country)} · ${CONTRACT_TYPES[c.type].name}`, { className: 'tt', direction: 'top', offset: [0, -12] });
      m.bindPopup(() => UI.popupContract(c.id), { maxWidth: 340 });
    }
    MapView.seenInit = true;
    // battles
    const bg = MapView.groups.battles; bg.clearLayers(); MapView.battleMk.clear();
    for (const b of G.battles) {
      const m = L.marker([b.lat, b.lng], { icon: MapView.icon('mk-battle ' + MapView.battleCls(b), '<span>⚔</span>', 34), zIndexOffset: 2000 }).addTo(bg);
      m.bindTooltip(`<b>${U.esc(b.title)}</b><br>${U.esc(b.team)} — ${U.esc(b.place)}`, { className: 'tt', direction: 'top', offset: [0, -18] });
      m.on('click', () => UI.focusBattle(b.id));
      MapView.battleMk.set(b.id, m);
    }
    // deployment routes
    const lg = MapView.groups.lines; lg.clearLayers();
    for (const d of G.deps) {
      if (d.state === 'engaged') continue;
      L.polyline(U.gcLine(d.from.lat, d.from.lng, d.to.lat, d.to.lng), { color: d.state === 'inbound' ? '#78dc96' : '#5ec8ff', weight: 1.5, opacity: 0.6, dashArray: '6 6', interactive: false }).addTo(lg);
    }
    // threats
    for (const t of G.threats) {
      const p = PF.byId(t.pfId); if (!p) continue;
      const tgt = t.target === 'mb' ? G.base : G.fobs.find(f => f.id === t.target);
      if (!tgt) continue;
      L.circleMarker([tgt.lat, tgt.lng], { radius: 22, color: '#ff5a4e', weight: 2, dashArray: '4 4', fill: false, interactive: false }).addTo(lg);
    }
    MapView.updateDynamic(true);
  },

  battleCls(b) {
    return (b.alert === 2 ? '' : b.alert === 1 ? 'caution' : 'sneak') + (b.kind === 'defend' ? ' def' : '');
  },

  updateDynamic(force) {
    if (!MapView.ready || !G) return;
    const live = new Set();
    for (const d of G.deps) {
      if (d.state !== 'outbound' && d.state !== 'inbound') continue;
      live.add(d.id);
      let t, from, to;
      if (d.state === 'outbound') { t = (G.time - d.depart) / Math.max(1, d.arrive - d.depart); from = d.from; to = d.to; }
      else { t = 1 - (d.returnAt - G.time) / Math.max(1, d.travel); from = d.to; to = d.from; }
      t = U.clamp(t, 0, 1);
      const [la, lo] = U.gcInterp(from.lat, from.lng, to.lat, to.lng, t);
      const [la2, lo2] = U.gcInterp(from.lat, from.lng, to.lat, to.lng, Math.min(1, t + 0.01));
      const ang = Math.atan2(-(la2 - la), lo2 - lo) * 180 / Math.PI;
      let m = MapView.heli.get(d.id);
      const html = `<div class="mk-heli ${d.state === 'inbound' ? 'inbound' : ''}" style="transform:rotate(${ang}deg)">✈</div>`;
      if (!m) {
        m = L.marker([la, lo], { icon: L.divIcon({ className: '', html, iconSize: [20, 20], iconAnchor: [10, 10] }), interactive: true, zIndexOffset: 1500 }).addTo(MapView.groups.dyn);
        m.bindTooltip('', { className: 'tt', direction: 'top', offset: [0, -10] });
        MapView.heli.set(d.id, m);
      } else {
        m.setLatLng([la, lo]);
        const el = m.getElement(); if (el) { const h = el.querySelector('.mk-heli'); if (h) { h.style.transform = `rotate(${ang}deg)`; h.classList.toggle('inbound', d.state === 'inbound'); } }
      }
      const eta = d.state === 'outbound' ? d.arrive - G.time : d.returnAt - G.time;
      m.setTooltipContent(`<b>${U.esc(d.name)}</b> ${d.state === 'outbound' ? '→ ' + U.esc(d.to.name) : '→ ' + U.esc(d.from.name)}<br>ETA ${U.fmtDur(eta)}`);
    }
    for (const [id, m] of MapView.heli) if (!live.has(id)) { MapView.groups.dyn.removeLayer(m); MapView.heli.delete(id); }
    for (const b of G.battles) {
      const m = MapView.battleMk.get(b.id);
      if (!m) continue;
      const el = m.getElement(); if (!el) continue;
      const mk = el.querySelector('.mk-battle');
      if (mk) mk.className = 'mk mk-battle ' + MapView.battleCls(b);
    }
  },

  // auto focus when the player zooms into a battle; release when they zoom out
  checkFocus() {
    if (!G) return;
    const map = MapView.map, z = map.getZoom(), c = map.getCenter();
    if (UI.focused) {
      const b = Battle.byId(UI.focused);
      if (!b || z < 13.5 || U.haversine(c.lat, c.lng, b.lat, b.lng) > 1.5) { if (!UI.flying) UI.unfocus(); }
      return;
    }
    if (z >= 15.5) {
      const b = G.battles.find(b => b.phase !== 'done' && U.haversine(c.lat, c.lng, b.lat, b.lng) < 0.6);
      if (b) UI.focusBattle(b.id, { noFly: true });
    }
  },

  // choose a development zone for a new FOB
  pickZone(cb) {
    const g = MapView.groups.zones; g.clearLayers();
    for (const z of ZONES) {
      const taken = Base.zoneTaken(z.id);
      const m = L.marker([z.lat, z.lng], { icon: MapView.icon('mk-zone' + (taken ? ' taken' : ''), '', 14) }).addTo(g);
      const best = Object.entries(z.bias).sort((a, b) => b[1] - a[1])[0];
      m.bindTooltip(`<b>${z.name}</b><br>${taken ? 'Occupied by ' + U.esc(taken) : 'Rich in ' + RES_NAME[best[0]]}`, { className: 'tt', direction: 'top' });
      if (!taken) m.on('click', () => { MapView.endPick(); cb(z.id); });
    }
    g.addTo(MapView.map);
    MapView.map.flyTo([10, 40], 2.5, { duration: 1 });
    UI.banner('Select an open development zone (green) for the new FOB.', () => MapView.endPick());
  },
  endPick() { MapView.map.removeLayer(MapView.groups.zones); UI.banner(null); },

  // decorative platform layouts for our bases when zoomed in
  site(key, lat, lng, plat) {
    const k = key + ':' + plat;
    if (!MapView.sites.has(k)) {
      const s = { lat, lng, decks: [], obstacles: [], env: 'platform' };
      const saved = Math.random;
      const r = U.mulberry32(U.hash(k)); Math.random = r;
      try { Terrain.procPlatform(s, { plat }); } finally { Math.random = saved; }
      MapView.sites.set(k, s);
    }
    return MapView.sites.get(k);
  },
};

// draw our base platforms beneath the battles
(function () {
  const orig = BRender.draw;
  BRender.draw = function () {
    orig();
    if (!G || !MapView.ready || BRender.zooming) return;
    const map = MapView.map;
    if (map.getZoom() < 14) return;
    const ctx = BRender.ctx;
    ctx.save();
    ctx.setTransform(BRender.dpr, 0, 0, BRender.dpr, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    const bases = [{ key: 'mb', name: G.base.name, lat: G.base.lat, lng: G.base.lng, plat: U.clamp(Math.round(PLATFORM_KEYS.reduce((n, k) => n + G.base.plat[k], 0) / 3), 1, 4) }];
    for (const f of G.fobs) if (!(f.build && f.build.what === 'fob')) bases.push({ key: 'f' + f.id, name: f.name, lat: f.lat, lng: f.lng, plat: f.plat });
    for (const bs of bases) {
      if (G.battles.some(b => b.phase !== 'loading' && U.haversine(b.lat, b.lng, bs.lat, bs.lng) < 0.3)) continue;
      const s = MapView.site(bs.key, bs.lat, bs.lng, bs.plat);
      const T = BRender.xf(s);
      for (const o of s.obstacles) { BRender.poly(ctx, T, o.pts); ctx.fillStyle = o.kind === 'core' ? '#22303a' : o.kind === 'container' ? '#6b4b2e' : '#2c3330'; ctx.fill(); }
      for (const d of s.decks) { BRender.poly(ctx, T, d.pts); ctx.fillStyle = d.kind === 'bridge' ? '#3d4847' : '#4a5553'; ctx.fill(); ctx.strokeStyle = '#6f7d79'; ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
      const [px, py] = BRender.toScreen(T, 0, 50);
      BRender.label(ctx, bs.name.toUpperCase(), px, py, '#f2b33d', 14);
      ctx.globalCompositeOperation = 'destination-over';
    }
    ctx.restore();
  };
})();
