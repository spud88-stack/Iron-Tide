'use strict';
// ---------- UI core ----------
const PANELS = {};
const UI = {
  focused: null, flying: false, panel: null, ps: {}, _dirty: true, lastPanel: 0, lastTop: 0, lastStrip: 0, lastDyn: 0, mouseAt: 0,

  init() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const fn = ACT[el.dataset.act];
      if (!fn) return;
      e.preventDefault();
      if (el.tagName === 'BUTTON' && !['openPanel', 'closePanel'].includes(el.dataset.act)) Sfx.play('click');
      fn(el.dataset, el, e);
    });
    document.addEventListener('change', e => {
      const el = e.target.closest('[data-chg]');
      if (!el) return;
      const fn = ACT[el.dataset.chg];
      if (fn) fn(el.dataset, el, e);
    });
    document.addEventListener('input', e => {
      const el = e.target.closest('[data-inp]');
      if (!el) return;
      const fn = ACT[el.dataset.inp];
      if (fn) fn(el.dataset, el, e);
    });
    document.addEventListener('mousedown', () => { UI.mouseAt = performance.now(); });
    document.addEventListener('keydown', UI.key);
    // tooltips
    const tip = document.getElementById('tooltip');
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      UI.tipEl = el;
      if (!el) { tip.classList.add('hidden'); return; }
      tip.innerHTML = el.dataset.tip;
      tip.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, r.left) + 'px';
      tip.style.top = (r.bottom + 6 + tip.offsetHeight > window.innerHeight ? r.top - tip.offsetHeight - 6 : r.bottom + 6) + 'px';
    });
    document.addEventListener('mousemove', e => {
      if (tip.classList.contains('hidden')) return;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 14) + 'px';
      tip.style.top = Math.min(window.innerHeight - h - 8, e.clientY + 14) + 'px';
    });
    Bus.on('log', e => { UI.dirty(); if (e && e.type === 'bad' && UI.panel !== 'log') UI.unread = (UI.unread || 0) + 1; });
    Sfx.init();
    Bus.on('speed', () => UI.renderTop());
  },

  dirty() { UI._dirty = true; },

  tick(now) {
    if (!G) return;
    const dt = Math.min(0.1, (now - (UI.lastTick || now)) / 1000); UI.lastTick = now;
    Fx.tick(dt);
    Music.update();
    if (UI.tipEl && !UI.tipEl.isConnected) { UI.tipEl = null; document.getElementById('tooltip').classList.add('hidden'); }
    if (now - UI.lastTop > 250) { UI.lastTop = now; UI.renderTop(); }
    if (now - UI.lastStrip > 400) { UI.lastStrip = now; UI.renderStrip(); }
    if (now - UI.lastDyn > 150) { UI.lastDyn = now; MapView.updateDynamic(); }
    if (UI.panel) {
      const live = PANELS[UI.panel].live && now - UI.lastPanel > 1500;
      const busy = now - UI.mouseAt < 400 || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);
      if ((UI._dirty || live) && !busy) UI.renderPanel();
    }
    HUD.tick(now);
  },

  // ----- top bar (built once, then patched in place so tooltips & animations survive) -----
  renderTop() {
    const top = document.getElementById('topbar');
    if (!UI.topBuilt || top.dataset.base !== G.base.name + G.base.emblemSeed) {
      UI.topBuilt = true; top.dataset.base = G.base.name + G.base.emblemSeed;
      top.innerHTML = `
        <div class="brand" data-act="openPanel" data-p="base" style="cursor:pointer"><img src="${Art.emblem(G.base.emblemSeed, PF.myInitials())}"><span class="nm">${U.esc(G.base.name)}</span></div>
        <div class="clock" id="tb-clock"></div>
        <div class="speed">${SPEEDS.map((s, i) => `<button data-act="speed" data-i="${i}" data-tip="${i === 0 ? 'Pause (Space)' : s + 'x speed (' + i + ')'}">${i === 0 ? '❚❚' : '▶'.repeat(i)}</button>`).join('')}</div>
        <span id="tb-warn"></span>
        <div class="resbar">
          ${RES_KEYS.map(k => `<div class="res ${k !== 'gmp' && k !== 'fuel' ? 'opt' : ''}" id="tb-${k}"><b></b><i>${RES_LABEL[k]}</i></div>`).join('')}
          <div class="res" id="tb-hero" data-tip="Heroism — attracts better volunteers"><b></b><i>HEROISM</i></div>
          <div class="res" id="tb-league"><b></b><i></i></div>
          <div class="res" id="tb-staff"><b></b><i>STAFF</i></div>
        </div>`;
      UI.prevRes = { ...G.res };
    }
    const set = (el, prop, v) => { if (el && el[prop] !== v) el[prop] = v; };
    set(document.getElementById('tb-clock'), 'innerHTML', U.fmtClock(G.time));
    top.querySelectorAll('.speed button').forEach((b, i) => b.classList.toggle('on', i === G.speedIdx));
    const warn = (G.threats.length ? `<span class="pill red" data-tip="Incoming PF incursion">⚠ INCURSION ${U.fmtDur(Math.min(...G.threats.map(t => t.at)) - G.time)}</span> ` : '') + (G.outbreak ? `<span class="pill red" data-tip="Disease outbreak — build Quarantine">☣ OUTBREAK</span>` : '');
    set(document.getElementById('tb-warn'), 'innerHTML', warn);
    const now = performance.now();
    for (const k of RES_KEYS) {
      const el = document.getElementById('tb-' + k), v = G.res[k];
      const d = v - (UI.prevRes[k] ?? v);
      if ((k === 'gmp' && Math.abs(d) >= 2000) || (k !== 'gmp' && Math.abs(d) >= 150)) {
        const r = el.getBoundingClientRect();
        if (r.width) Fx.float(`${d > 0 ? '+' : '−'}${U.fmtShort(Math.abs(d))} ${RES_LABEL[k]}`, d > 0 ? 'var(--ok)' : 'var(--red)', r.left - 10, r.bottom + 2);
        el.dataset.flash = now + 900; el.dataset.fc = d > 0 ? 'ok' : 'bad';
        if (k === 'gmp' && d >= 10000) Sfx.play('coin');
      }
      UI.prevRes[k] = v;
      const flash = +(el.dataset.flash || 0) > now ? (el.dataset.fc === 'ok' ? ' flash' : ' flashbad') : '';
      const cls = `res${v < 0 ? ' neg' : ''}${k !== 'gmp' && k !== 'fuel' ? ' opt' : ''}${flash}`;
      if (el.className !== cls) el.className = cls;
      set(el.querySelector('b'), 'textContent', U.fmtShort(Fx.tween(k, v, 0.1)));
      el.dataset.tip = k === 'gmp' ? `GMP — daily net ${U.fmt(Base.dailyBreakdown().net)}` : `${RES_NAME[k]}<br>Processed: ${U.fmt(v)}<br>Unprocessed: ${U.fmt(G.raw[k])}<br>Processing ${Math.round(Base.processRate(k))}/h`;
    }
    set(document.querySelector('#tb-hero b'), 'textContent', U.fmtShort(Fx.tween('hero', G.heroism, 0.1)));
    const lg = document.getElementById('tb-league');
    set(lg.querySelector('b'), 'textContent', U.fmtShort(Fx.tween('pts', G.points, 0.1)));
    set(lg.querySelector('i'), 'textContent', PF.league(G.points).toUpperCase());
    lg.dataset.tip = `League: ${PF.league(G.points)} · Rank #${PF.myRank()}`;
    const st = document.getElementById('tb-staff');
    set(st.querySelector('b'), 'textContent', String(Staff.total()));
    st.dataset.tip = `Staff (injured/sick: ${G.staff.filter(s => s.status === 'injured' || s.status === 'sick').length})`;
  },

  // sidenav badges: things that want your attention
  renderBadges() {
    const idleRnd = G.rnd.active.length < RnD.slots() && RD_ITEMS.some(i => !RnD.canStart(i.id));
    const b = {
      staff: Staff.count('waiting') ? [Staff.count('waiting'), 'warn', 'staff waiting for assignment'] : null,
      rnd: idleRnd ? ['!', 'warn', 'R&D team idle — projects available'] : null,
      ops: Contracts.open().length ? [Contracts.open().length, '', 'open contracts'] : null,
      online: G.threats.length ? ['!', '', 'incursion incoming'] : null,
      log: UI.unread ? [UI.unread > 9 ? '9+' : UI.unread, '', 'new alerts'] : null,
    };
    for (const [p, v] of Object.entries(b)) {
      const btn = document.querySelector(`#sidenav button[data-p="${p}"]`); if (!btn) continue;
      let el = btn.querySelector('.badge');
      const key = v ? v.join('|') : '';
      if (btn.dataset.badge === key) continue;
      btn.dataset.badge = key;
      if (el) el.remove();
      if (v) { el = document.createElement('span'); el.className = 'badge ' + v[1]; el.textContent = v[0]; el.title = v[2]; btn.appendChild(el); }
    }
  },

  renderStrip() {
    const el = document.getElementById('opstrip');
    const chips = [];
    for (const b of G.battles) {
      const cls = b.phase === 'done' ? '' : b.alert === 2 ? 'alert' : b.alert === 1 ? 'caution' : '';
      const ph = b.phase === 'loading' ? 'DEPLOYING' : b.phase === 'done' ? (b.result && b.result.success ? 'COMPLETE' : 'FAILED') : b.kind === 'defend' ? ['SECURE', 'CAUTION', 'INTRUDERS'][b.alert] : ['SNEAKING', 'CAUTION', 'ALERT'][b.alert];
      chips.push(`<div class="opchip ${cls} ${UI.focused === b.id ? 'focus' : ''}" data-act="focusBattle" data-id="${b.id}" data-tip="${U.esc(b.title)}<br>Click to take command"><span class="dot"></span><b>${U.esc(b.team.toUpperCase())}</b> ${U.esc(b.place)} · ${ph}${b.commanded ? ' · CMD' : ''}</div>`);
    }
    for (const d of G.deps) {
      if (d.state === 'engaged') continue;
      const eta = d.state === 'outbound' ? d.arrive - G.time : d.returnAt - G.time;
      chips.push(`<div class="opchip travel" data-act="flyDep" data-id="${d.id}"><span class="dot"></span><b>${U.esc(d.name.toUpperCase())}</b> ${d.state === 'outbound' ? '→ ' + U.esc(d.to.name) : '⟲ RTB'} · ${U.fmtDur(eta)}</div>`);
    }
    for (const t of G.threats) {
      const p = PF.byId(t.pfId);
      chips.push(`<div class="opchip alert" data-act="openPanel" data-p="online"><span class="dot"></span><b>INCURSION</b> ${U.esc(p ? p.name : '?')} · ${U.fmtDur(t.at - G.time)}</div>`);
    }
    const html = chips.join('');
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    UI.renderBadges();
  },

  // ----- toasts -----
  toast(title, msg, type = 'info', actions = [], opts = {}) {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    const acts = actions.map(a => `<button class="sm" data-act="${a.act}" ${Object.entries(a.args || {}).map(([k, v]) => `data-${k}="${U.esc(v)}"`).join(' ')}>${a.label}</button>`).join('');
    t.innerHTML = `<div class="tt">${U.esc(title)}</div><div>${U.esc(msg)}</div>${acts ? `<div class="acts">${acts}</div>` : ''}`;
    const leave = () => { if (t.classList.contains('leave')) return; t.classList.add('leave'); setTimeout(() => t.remove(), 300); };
    t.addEventListener('click', e => { setTimeout(leave, e.target.closest('button') ? 50 : 0); });
    box.prepend(t);
    while (box.children.length > 6) box.lastChild.remove();
    setTimeout(leave, (opts.ttl || 6) * 1000);
    if (!opts.silent) Sfx.play(opts.sound || (type === 'ok' ? 'ok' : type === 'bad' ? 'bad' : 'info'));
  },

  // ----- modal -----
  modal(html, cls = '') {
    const r = document.getElementById('modal-root');
    r.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    r.classList.add('open');
    r.onclick = e => { if (e.target === r) UI.closeModal(); };
  },
  closeModal() { const r = document.getElementById('modal-root'); r.classList.remove('open'); r.innerHTML = ''; UI.modalUpdate = null; },
  modalOpen() { return document.getElementById('modal-root').classList.contains('open'); },

  banner(text, onCancel) {
    const el = document.getElementById('map-banner');
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = `<span>${text}</span><button class="sm" data-act="bannerCancel">Cancel</button>`;
    el.classList.remove('hidden');
    UI.bannerCancel = onCancel;
  },

  // ----- side panels -----
  openPanel(p) {
    if (UI.panel === p) { UI.closePanel(); return; }
    UI.panel = p;
    UI.ps[p] = UI.ps[p] || {};
    if (p === 'log') UI.unread = 0;
    Sfx.play('open');
    document.getElementById('panel').classList.remove('hidden');
    document.querySelectorAll('#sidenav button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    UI.renderPanel(true);
  },
  closePanel() {
    if (UI.panel) Sfx.play('close');
    UI.panel = null;
    document.getElementById('panel').classList.add('hidden');
    document.querySelectorAll('#sidenav button').forEach(b => b.classList.remove('on'));
  },
  renderPanel(reset) {
    if (!UI.panel) return;
    const P = PANELS[UI.panel];
    const body = document.getElementById('panel-body');
    const st = reset ? 0 : body.scrollTop;
    document.getElementById('panel-title').textContent = P.title;
    body.innerHTML = P.render(UI.ps[UI.panel]);
    body.scrollTop = st;
    UI._dirty = false; UI.lastPanel = performance.now();
  },

  // ----- battle focus (seamless command) -----
  focusBattle(id, opts = {}) {
    const b = Battle.byId(+id);
    if (!b) return;
    if (UI.focused && UI.focused !== b.id) UI.unfocus();
    UI.focused = b.id;
    b.commanded = true;
    BRender.targeting = null;
    BRender.sel = new Set(b.units.filter(u => u.side === 'player' && u.kind === 'op' && ALIVE(u)).map(u => u.uid));
    if (!BRender.sel.size) BRender.sel = new Set(b.units.filter(u => u.side === 'player' && u.kind === 'sentry' && ALIVE(u)).map(u => u.uid));
    UI.closePanel();
    if (UI.modalOpen()) UI.closeModal();
    if (!opts.noFly) {
      UI.flying = true;
      const c = MapView.map.getCenter();
      const far = U.haversine(c.lat, c.lng, b.lat, b.lng);
      MapView.map.flyTo([b.lat, b.lng], 17.5, { duration: U.clamp(0.8 + far / 3000, 1, 3.2) });
      MapView.map.once('moveend', () => { UI.flying = false; });
      setTimeout(() => { UI.flying = false; }, 4000);
    }
    if (G.speedIdx > 1) Game.setSpeed(1);
    if (!opts.noFly || !opts.quiet) { Fx.uplink(`${b.team.toUpperCase()} — ${b.place.toUpperCase()}`); Sfx.play('uplink'); }
    HUD.show(b);
    UI.renderStrip();
  },
  unfocus(zoomOut) {
    const b = Battle.byId(UI.focused);
    if (b) { b.commanded = false; Battle.release(b, b.units.filter(u => u.side === 'player').map(u => u.uid)); }
    UI.focused = null;
    BRender.sel.clear(); BRender.targeting = null;
    HUD.hide();
    UI.renderStrip();
    if (zoomOut && b) MapView.map.flyTo([b.lat, b.lng], 6, { duration: 1.4 });
  },

  // ----- keyboard -----
  key(e) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) return;
    if (!G || !document.getElementById('start-screen').classList.contains('gone')) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); Game.setSpeed(G.speedIdx === 0 ? (UI.lastSpeed || 1) : (UI.lastSpeed = G.speedIdx, 0)); return; }
    if (k === 'Escape') {
      if (BRender.targeting) { BRender.targeting = null; HUD.refresh(); return; }
      if (UI.modalOpen()) { UI.closeModal(); return; }
      if (UI.panel) { UI.closePanel(); return; }
      if (UI.focused) { UI.unfocus(true); return; }
      return;
    }
    if (k === '+' || k === '=') { Game.setSpeed(G.speedIdx + 1); return; }
    if (k === '-') { Game.setSpeed(G.speedIdx - 1); return; }
    if (k === 'm' || k === 'M') { ACT.layerToggle(); return; }
    if (k === 'n' || k === 'N') { Sfx.toggleMute(); return; }
    if (!UI.focused && /^[1-3]$/.test(k)) { Game.setSpeed(+k); return; }
    if (UI.focused && HUD.key(e)) return;
    const map = { b: 'base', t: 'staff', r: 'rnd', o: 'ops', f: 'online', l: 'log' };
    if (map[k.toLowerCase()] && !e.ctrlKey && !e.metaKey) UI.openPanel(map[k.toLowerCase()]);
  },

  // ----- map popups -----
  popupMB() {
    const L2 = DEPT_KEYS.map(d => `<span class="pill" style="color:${DEPTS[d].color}">${DEPTS[d].short} ${Staff.level(d)}</span>`).join(' ');
    return `<div class="col"><div class="row"><img src="${Art.emblem(G.base.emblemSeed, PF.myInitials())}" width="40"><div><b style="font-size:17px">${U.esc(G.base.name)}</b><div class="dim">Mother Base · ${ZONE[G.base.zone].name}</div></div></div>
      <div class="row wrap">${L2}</div>
      <div class="dim">${Staff.total()} staff · ${Base.security('mb').length} security · ${G.battles.filter(b => b.target === 'mb').length ? '<span class="bad">UNDER ATTACK</span>' : 'secure'}</div>
      <div class="row"><button class="sm" data-act="openPanel" data-p="base">Manage</button><button class="sm" data-act="zoomTo" data-lat="${G.base.lat}" data-lng="${G.base.lng}">Inspect</button></div></div>`;
  },
  popupFob(id) {
    const f = G.fobs.find(f => f.id === id); if (!f) return '';
    const bld = f.build ? `<div class="bar"><i style="width:${(1 - f.build.left / f.build.total) * 100}%"></i></div><div class="dim">${f.build.what === 'fob' ? 'Under construction' : 'Expanding'} — ${U.fmtDur(f.build.left * 60 / Base.buildSpeed())}</div>` : '';
    return `<div class="col"><b style="font-size:17px">${U.esc(f.name)}</b><div class="dim">${ZONE[f.zone].name} · ${f.plat} platform${f.plat > 1 ? 's' : ''}</div>${bld}
      <div class="dim">Security: ${Base.security(f.id).length}/${Base.secCap(f.id)} · Defended ${f.defended} · Breached ${f.lost}</div>
      <div class="row"><button class="sm" data-act="openPanel" data-p="online">Manage</button><button class="sm" data-act="zoomTo" data-lat="${f.lat}" data-lng="${f.lng}">Inspect</button></div></div>`;
  },
  popupPF(fid) {
    const [p, f] = PF.fobById(fid); if (!f) return '';
    const rev = PF.revealed(f);
    const scouting = G.scouts.some(s => s.fid === fid);
    const def = rev ? `<div class="kv"><dt>Security</dt><dd>${f.sec} × ${Staff.gradeHtml(f.secLvl)}</dd><dt>Cameras</dt><dd>${f.cams}</dd><dt>UAVs</dt><dd>${f.uavs}</dd><dt>Mines</dt><dd>${f.mines}</dd><dt>Weapons</dt><dd>${f.lethal ? '<span class="bad">LETHAL</span>' : 'non-lethal'}</dd></div>` : `<div class="dim">Defenses unknown — scout with Intel.</div>`;
    return `<div class="col"><div class="row"><img src="${Art.emblem(p.emblem, p.initials)}" width="44"><div><b style="font-size:16px">${U.esc(p.known ? p.name : 'Unidentified PF')}</b><div class="dim">${U.esc(f.name)} · ${PF.league(p.points)} · Tier ${p.tier}</div></div></div>
      <div class="dim">${f.plat} platforms · Hostility <span class="${p.hostility > 60 ? 'bad' : ''}">${Math.round(p.hostility)}</span></div>${def}
      <div class="row">${rev ? '' : `<button class="sm" data-act="scout" data-id="${fid}" ${scouting ? 'disabled' : ''}>${scouting ? 'Scouting…' : 'Scout'}</button>`}<button class="sm pri" data-act="planInfiltrate" data-id="${fid}">Infiltrate</button><button class="sm" data-act="zoomTo" data-lat="${f.lat}" data-lng="${f.lng}">Inspect</button></div></div>`;
  },
  popupContract(id) {
    const c = Contracts.byId(id); if (!c) return '';
    const o = Contracts.nearestOrigin(c.lat, c.lng);
    return `<div class="col"><div class="row"><span class="mono d${c.diff}" style="font-size:24px">${c.diff}</span><div><b style="font-size:16px">${U.esc(c.title)}</b><div class="dim">${U.esc(c.city)}, ${U.esc(c.country)} · ${CONTRACT_TYPES[c.type].name}</div></div></div>
      <div class="note">${CONTRACT_TYPES[c.type].desc}</div>
      <div class="kv"><dt>Client</dt><dd>${U.esc(c.client)}</dd><dt>Opposition</dt><dd>${U.esc(c.faction)}</dd><dt>Intel</dt><dd>${Contracts.intel(c)}</dd><dt>Reward</dt><dd class="acc">${U.fmt(c.reward.gmp)} GMP</dd><dt>Distance</dt><dd>${U.fmt(o.d)} km · ${U.fmtDur(Contracts.travelMins(o.d))}</dd><dt>Expires</dt><dd>${U.fmtDur(c.expires - G.time)}</dd><dt>Local time</dt><dd>${U.pad(Math.floor(U.localHour(G.time, c.lng)))}:00 ${U.isNight(G.time, c.lng) ? '☾ night' : '☀ day'}</dd></div>
      <div class="row"><button class="sm pri" data-act="planContract" data-id="${c.id}">Plan deployment</button><button class="sm" data-act="zoomTo" data-lat="${c.lat}" data-lng="${c.lng}" data-z="16">Recon city</button></div></div>`;
  },
};

// ----- global actions -----
Object.assign(ACT, {
  openPanel: d => { if (UI.focused) UI.unfocus(); UI.openPanel(d.p); MapView.map.closePopup(); },
  closePanel: () => UI.closePanel(),
  closeModal: () => UI.closeModal(),
  speed: d => { Game.setSpeed(+d.i); },
  layerToggle: () => { MapView.setLayer(!G.settings.satellite); },
  zoomTo: d => { MapView.map.closePopup(); MapView.map.flyTo([+d.lat, +d.lng], +(d.z || 16), { duration: 2 }); },
  focusBattle: d => { MapView.map.closePopup(); UI.focusBattle(+d.id); },
  bannerCancel: () => { if (UI.bannerCancel) UI.bannerCancel(); UI.banner(null); },
  flyDep: d => {
    const dep = Contracts.dep(+d.id); if (!dep) return;
    const m = MapView.heli.get(dep.id);
    if (m) MapView.map.flyTo(m.getLatLng(), 5, { duration: 1.5 });
  },
  scout: d => { PF.scout(+d.id); MapView.map.closePopup(); },
});
