'use strict';
// ---------- iDroid panels ----------
const tabs = (cur, list, act) => `<div class="tabs">${list.map(([k, label, cnt]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-k="${k}">${label}${cnt !== undefined ? `<span class="cnt">${cnt}</span>` : ''}</button>`).join('')}</div>`;
const bar = (f, cls = '') => `<div class="bar ${cls}"><i style="width:${U.clamp(f, 0, 1) * 100}%"></i></div>`;
const moraleBar = m => `<span class="mor" data-tip="Morale ${Math.round(m)}"><i style="width:${m}%;background:${m > 60 ? 'var(--ok)' : m > 35 ? 'var(--acc)' : 'var(--red)'}"></i></span>`;
const skillIcons = s => s.skills.map(k => `<span class="sk ${SKILLS[k].neg ? 'neg' : ''}" data-tip="<b>${SKILLS[k].name}</b><br>${SKILLS[k].desc}">${SKILLS[k].icon}</span>`).join('');
const assignName = s => s.dept === 'brig' ? 'Brig' : s.dept === 'waiting' ? 'Waiting Room' : DEPTS[s.dept].name;
const statusHtml = s => {
  if (s.dept === 'brig') return `<span class="status bad">PRISONER ${Math.round(s.loyalty)}%</span>`;
  if (s.status === 'deployed') return '<span class="status blue">DEPLOYED</span>';
  if (s.status === 'injured') return `<span class="status bad" data-tip="Recovers in ${U.fmtDur(s.until - G.time)}">INJURED</span>`;
  if (s.status === 'sick') return `<span class="status bad" data-tip="Recovers in ${U.fmtDur(s.until - G.time)}">SICK</span>`;
  if (s.sec) return `<span class="status acc">SECURITY</span>`;
  return '<span class="status dim">ON DUTY</span>';
};

// ===================== MOTHER BASE =====================
PANELS.base = {
  title: 'MOTHER BASE', live: true,
  render() {
    const brk = Base.dailyBreakdown();
    const avgM = G.staff.filter(s => s.dept !== 'brig').reduce((n, s) => n + s.morale, 0) / Math.max(1, Staff.total());
    const deptCard = k => {
      const isDept = !!DEPTS[k];
      const n = G.base.plat[k], max = Base.maxPlat(k);
      const bld = G.base.builds.find(b => b.k === k);
      const why = Base.canBuild(k);
      const cost = n < 4 ? Base.buildCost(k, n + 1) : null;
      const plats = Array.from({ length: k === 'quarantine' ? 2 : 4 }, (_, i) => `<i class="${i < n ? 'on' : bld && i === n ? 'bld' : ''}"></i>`).join('');
      const desc = isDept ? DEPTS[k].desc : k === 'command' ? 'Each Command platform allows one more platform per department, +10 waiting room, +1 FOB slot and better volunteers.' : 'Isolates sick staff. Contains disease outbreaks.';
      return `<div class="dept">
        <div class="dh"><b style="color:${isDept ? DEPTS[k].color : 'var(--text)'}">${PLATFORM_NAME[k].toUpperCase()}</b>${isDept ? `<span class="lvl" data-tip="Department level (cap ${Staff.levelCap(k)})">${Staff.level(k)}</span>` : ''}</div>
        <div class="plats">${plats}</div>
        ${isDept ? `<div class="row dim" style="font-size:13px"><span>Staff ${Staff.count(k)}/${Staff.cap(k)}</span><span class="grow"></span><span>Lv cap ${Staff.levelCap(k)}</span></div>` : ''}
        <div class="note">${desc}</div>
        ${bld ? `${bar(1 - bld.left / bld.total, 'live')}<div class="dim" style="font-size:12px">Building platform ${bld.n} — ${U.fmtDur(bld.left * 60 / Base.buildSpeed())}</div>`
          : cost ? `<div class="cost">${U.costStr(cost, G.res)} · ${cost.hours}h</div><button class="sm" data-act="build" data-k="${k}" ${why ? `disabled data-tip="${why}"` : ''}>Build platform ${n + 1}</button>` : '<div class="dim" style="font-size:12px">Fully expanded</div>'}
      </div>`;
    };
    const proc = MAT_KEYS.map(k => `<tr><td>${RES_NAME[k]}</td><td class="mono">${U.fmt(G.raw[k])}</td><td class="mono">${Math.round(Base.processRate(k))}/h</td><td class="mono">${U.fmt(G.res[k])}</td></tr>`).join('');
    const canParty = !G.lastParty || G.time - G.lastParty > 1440;
    return `
      <div class="row" style="gap:14px;margin-bottom:12px">
        <img src="${Art.emblem(G.base.emblemSeed, PF.myInitials())}" width="72" data-act="rerollEmblem" style="cursor:pointer" data-tip="Click to redesign emblem">
        <div class="grow"><div style="font-size:24px;font-weight:700;letter-spacing:.06em">${U.esc(G.base.name)}</div>
        <div class="dim">${ZONE[G.base.zone].name} · ${Staff.total()} staff · ${G.fobs.length} FOB${G.fobs.length === 1 ? '' : 's'} · ${PF.league(G.points)} (rank #${PF.myRank()})</div>
        <div class="row" style="margin-top:4px"><span class="dim">Morale</span>${moraleBar(avgM)}<span class="mono">${Math.round(avgM)}</span>
        <button class="sm" data-act="party" ${canParty && G.res.gmp >= 25000 ? '' : 'disabled'} data-tip="Throw a base-wide barbecue: +12 morale for everyone. 25K GMP, 150 bio. Once per day.">Hold Celebration</button></div></div>
      </div>
      <h3>Platforms & Departments <span style="float:right" class="dim">Construction crews ${Base.activeBuilds()}/${Base.buildSlots()}</span></h3>
      <div class="grid3">${PLATFORM_KEYS.map(deptCard).join('')}</div>
      <h3>Economy (daily)</h3>
      <div class="grid2">
        <div class="card"><dl class="kv">
          <dt>Base Dev income</dt><dd class="ok">+${U.fmt(brk.income)}</dd>
          <dt>Staff salaries</dt><dd class="bad">−${U.fmt(brk.salaries)}</dd>
          <dt>Platform upkeep</dt><dd class="bad">−${U.fmt(brk.platUpkeep)}</dd>
          <dt>Net / day</dt><dd class="${brk.net >= 0 ? 'ok' : 'bad'}">${brk.net >= 0 ? '+' : ''}${U.fmt(brk.net)} GMP</dd>
        </dl><div class="note" style="margin-top:6px">Contracts and FOB raids are your real income. Unpaid debts crush morale.</div></div>
        <div class="card"><table class="stbl"><tr><th>Material</th><th>Raw</th><th>Processing</th><th>Usable</th></tr>${proc}</table></div>
      </div>
      <h3>Memorial</h3>
      ${G.memorial.length ? `<div class="row wrap">${G.memorial.slice(0, 24).map(m => `<img src="${Art.portrait(m.pseed)}" width="36" style="filter:grayscale(1)" data-tip="<b>${U.esc(m.name)}</b> &quot;${U.esc(m.callsign)}&quot;<br>${m.best} · ${m.missions} missions<br>${U.esc(m.cause)}">`).join('')}</div>` : '<div class="empty">No one has fallen. Yet.</div>'}`;
  },
};
Object.assign(ACT, {
  build: d => Base.startBuild(d.k),
  rerollEmblem: () => { G.base.emblemSeed = U.randi(1, 2e9); UI.dirty(); },
  party: () => {
    if (G.res.gmp < 25000) return;
    G.res.gmp -= 25000; G.res.bio = Math.max(0, G.res.bio - 150); G.lastParty = G.time;
    for (const s of G.staff) if (s.dept !== 'brig') s.morale = Math.min(100, s.morale + 12);
    Game.log('A base-wide celebration was held. Spirits are high.', 'ok');
    Game.notify('CELEBRATION', 'Morale +12 across Mother Base.', 'ok');
    UI.dirty();
  },
});

// ===================== STAFF =====================
PANELS.staff = {
  title: 'STAFF MANAGEMENT', live: true,
  render(st) {
    st.tab = st.tab || 'all'; st.sort = st.sort || 'best'; st.dir = st.dir || -1; st.sel = st.sel || new Set();
    const counts = { all: Staff.total(), waiting: Staff.count('waiting'), brig: Staff.count('brig'), sick: G.staff.filter(s => s.status === 'injured' || s.status === 'sick').length };
    const tabList = [['all', 'All', counts.all], ...DEPT_KEYS.map(d => [d, DEPTS[d].short, `${Staff.count(d)}/${Staff.cap(d)}`]), ['waiting', 'Waiting', `${counts.waiting}/${Staff.waitingCap()}`], ['sick', 'Sickbay', counts.sick], ['brig', 'Brig', counts.brig], ['memorial', 'Memorial', G.memorial.length]];
    let html = tabs(st.tab, tabList, 'staffTab');
    if (st.tab === 'memorial') {
      return html + (G.memorial.length ? `<table class="stbl"><tr><th></th><th>Name</th><th>Specialty</th><th>Missions</th><th>Kills</th><th>Fate</th><th>When</th></tr>${G.memorial.map(m => `<tr><td><img src="${Art.portrait(m.pseed)}" style="filter:grayscale(1)"></td><td>${U.esc(m.name)}<div class="dim" style="font-size:12px">"${U.esc(m.callsign)}" · ${U.esc(m.nat)}</div></td><td>${m.best}</td><td class="mono">${m.missions}</td><td class="mono">${m.kills}</td><td style="white-space:normal;font-size:13px">${U.esc(m.cause)}</td><td class="mono dim">Day ${Math.floor(m.t / 1440) + 1}</td></tr>`).join('')}</table>` : '<div class="empty">The memorial wall is empty.</div>');
    }
    let list = G.staff.filter(s => {
      if (st.tab === 'all') return s.dept !== 'brig';
      if (st.tab === 'sick') return s.status === 'injured' || s.status === 'sick';
      return s.dept === st.tab;
    });
    if (st.q) {
      const q = st.q.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.callsign.toLowerCase().includes(q) || s.nat.toLowerCase().includes(q) || s.skills.some(k => SKILLS[k].name.toLowerCase().includes(q)));
    }
    const key = st.sort;
    const val = s => key === 'best' ? Staff.bestVal(s) : key === 'name' ? s.name : key === 'morale' ? s.morale : s.stats[key];
    list.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * st.dir; });
    // detail
    const sel = st.detail ? Staff.byId(st.detail) : null;
    if (sel) html += PANELS.staff.detail(sel);
    // toolbar
    const nsel = [...st.sel].filter(id => Staff.byId(id)).length;
    html += `<div class="row wrap" style="margin:8px 0">
      <input id="staff-q" data-inp="staffSearch" placeholder="Search name, callsign, skill…" value="${U.esc(st.q || '')}" style="width:190px">
      <button data-act="autoAssign" data-tip="Assign everyone (except ★ locked staff) to the department that fits them best.">Auto-assign</button>
      <span class="dim" style="margin-left:8px">${nsel} selected</span>
      <select data-chg="bulkAssign" ${nsel ? '' : 'disabled'}><option value="">Move selected to…</option>${DEPT_KEYS.map(d => `<option value="${d}">${DEPTS[d].name} (${Staff.count(d)}/${Staff.cap(d)})</option>`).join('')}<option value="waiting">Waiting Room</option><option value="dismiss">✕ Dismiss</option></select>
      ${nsel ? '<button class="sm" data-act="selNone">Clear</button>' : ''}
      <span class="grow"></span><span class="dim" style="font-size:13px">Click headers to sort · Click a row for details</span></div>`;
    const th = (k, label) => `<th class="${st.sort === k ? 'on' : ''}" data-act="staffSort" data-k="${k}">${label}${st.sort === k ? (st.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
    const rows = list.slice(0, 350).map(s => `<tr class="${st.detail === s.id ? 'sel' : ''}" data-act="staffDetail" data-id="${s.id}">
        <td data-act="staffSel" data-id="${s.id}"><span class="selbox ${st.sel.has(s.id) ? 'on' : ''}"></span></td>
        <td><img src="${Staff.portrait(s)}"></td>
        <td>${s.fav ? '<span class="acc">★</span> ' : ''}${U.esc(s.name)}<div class="dim" style="font-size:12px">"${U.esc(s.callsign)}"</div></td>
        ${DEPT_KEYS.map(d => `<td data-tip="${DEPTS[d].name} ${Math.floor(s.stats[d])}">${Staff.gradeHtml(s.stats[d])}${s.dept === d ? '<span class="acc">•</span>' : ''}</td>`).join('')}
        <td>${skillIcons(s)}</td><td>${moraleBar(s.morale)}</td>
        <td style="font-size:13px">${assignName(s)}</td><td>${statusHtml(s)}</td></tr>`).join('');
    html += list.length ? `<table class="stbl"><tr><th></th><th></th>${th('name', 'Name')}${DEPT_KEYS.map(d => th(d, DEPTS[d].short)).join('')}<th>Skills</th>${th('morale', 'Mor')}<th>Assigned</th><th>Status</th></tr>${rows}</table>` : '<div class="empty">Nobody here.</div>';
    return html;
  },
  detail(s) {
    const best = Staff.best(s);
    const stats = DEPT_KEYS.map(d => `<div class="statrow"><span style="color:${DEPTS[d].color}">${DEPTS[d].name}</span>${Staff.gradeHtml(s.stats[d])}${bar(s.stats[d] / 120)}<span class="mono dim">${Math.floor(s.stats[d])}</span></div>`).join('');
    const opts = [...DEPT_KEYS.map(d => [d, `${DEPTS[d].name} (${Staff.count(d)}/${Staff.cap(d)})`]), ['waiting', 'Waiting Room']].map(([v, l]) => `<option value="${v}" ${s.dept === v ? 'selected' : ''}>${l}</option>`).join('');
    const secOpts = s.dept === 'combat' ? `<select data-chg="assignSec" data-id="${s.id}"><option value="">Not on security</option><option value="mb" ${s.sec === 'mb' ? 'selected' : ''}>${U.esc(G.base.name)} security (${Base.security('mb').length}/${Base.secCap('mb')})</option>${G.fobs.filter(f => !(f.build && f.build.what === 'fob')).map(f => `<option value="${f.id}" ${s.sec === f.id ? 'selected' : ''}>${U.esc(f.name)} security (${Base.security(f.id).length}/${Base.secCap(f.id)})</option>`).join('')}</select>` : '';
    return `<div class="card" style="margin-bottom:10px"><div class="sdetail"><img src="${Staff.portrait(s)}">
      <div class="col">
        <div class="row"><b style="font-size:20px">${U.esc(s.name)}</b><span class="acc">"${U.esc(s.callsign)}"</span><span class="grow"></span><button class="sm x" data-act="staffDetail" data-id="0">✕</button></div>
        <div class="dim">${U.esc(s.nat)} · age ${s.age} · ${s.origin} · joined day ${Math.floor(s.joined / 1440) + 1} · best: ${Staff.grade(s.stats[best])} ${DEPTS[best].name}</div>
        <div class="row wrap">${s.skills.map(k => `<span class="pill ${SKILLS[k].neg ? 'red' : 'acc'}" data-tip="${SKILLS[k].desc}">${SKILLS[k].icon} ${SKILLS[k].name}</span>`).join('') || '<span class="dim">No special skills</span>'}</div>
        <div class="row dim" style="font-size:13px">Missions ${s.missions} · Kills ${s.kills} · Tranqs ${s.sleeps} · Fultons ${s.fultons} · Morale ${Math.round(s.morale)} ${statusHtml(s)}</div>
      </div></div>
      <div class="grid2" style="margin-top:8px"><div class="col">${stats}</div>
      <div class="col">
        ${s.dept === 'brig' ? `<div class="note">Prisoner. Loyalty ${Math.round(s.loyalty)}% — rises daily with Intel level, Interrogators and Linguists in Intel.</div>${bar(s.loyalty / 100, 'red')}<button class="sm" data-act="release" data-id="${s.id}" data-tip="Release them. +Heroism.">Release prisoner</button>`
        : `<label class="dim" style="font-size:12px">ASSIGNMENT</label><select data-chg="assignOne" data-id="${s.id}" ${s.status === 'deployed' ? 'disabled' : ''}>${opts}</select>${secOpts}
        <div class="row"><button class="sm ${s.fav ? 'on' : ''}" data-act="fav" data-id="${s.id}" data-tip="Locked staff are skipped by auto-assign and never auto-dismissed.">★ ${s.fav ? 'Locked' : 'Lock'}</button>
        <button class="sm danger" data-act="dismissOne" data-id="${s.id}" ${s.status === 'deployed' ? 'disabled' : ''}>Dismiss</button></div>
        <div class="note">Effective ${DEPTS[s.dept] ? DEPTS[s.dept].short + ' ' + Math.round(Staff.eff(s, s.dept)) : '—'} (morale-adjusted). Staff slowly improve in their assigned department.</div>`}
      </div></div></div>`;
  },
};
Object.assign(ACT, {
  staffTab: d => { const st = UI.ps.staff; st.tab = d.k; st.detail = null; UI.renderPanel(true); },
  staffSort: d => { const st = UI.ps.staff; if (st.sort === d.k) st.dir *= -1; else { st.sort = d.k; st.dir = d.k === 'name' ? 1 : -1; } UI.renderPanel(); },
  staffDetail: (d, el, e) => { if (e.target.closest('[data-act="staffSel"]') && el.dataset.act !== 'staffSel') return; const st = UI.ps.staff; st.detail = +d.id || null; UI.renderPanel(+d.id ? true : false); },
  staffSel: (d, el, e) => { e.stopPropagation(); const st = UI.ps.staff; const id = +d.id; st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); UI.renderPanel(); },
  selNone: () => { UI.ps.staff.sel.clear(); UI.renderPanel(); },
  staffSearch: (d, el) => {
    UI.ps.staff.q = el.value; UI.renderPanel();
    const i = document.getElementById('staff-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  },
  autoAssign: () => { Staff.autoAssign(); Game.notify('AUTO-ASSIGN', 'Staff reassigned to their best departments.', 'ok'); UI.renderPanel(); },
  bulkAssign: (d, el) => {
    const v = el.value; if (!v) return;
    const st = UI.ps.staff;
    const list = [...st.sel].map(id => Staff.byId(id)).filter(Boolean);
    if (v === 'dismiss') { if (!confirm(`Dismiss ${list.length} staff?`)) { el.value = ''; return; } list.forEach(s => s.status !== 'deployed' && Staff.dismiss(s)); }
    else { let moved = 0; for (const s of list) if (Staff.assign(s, v, true)) moved++; if (moved < list.length) Game.notify('PARTIAL', `${moved}/${list.length} moved (capacity or availability).`, 'info'); }
    st.sel.clear(); UI.renderPanel();
  },
  assignOne: (d, el) => { const s = Staff.byId(+d.id); if (s) Staff.assign(s, el.value); UI.renderPanel(); },
  assignSec: (d, el) => {
    const s = Staff.byId(+d.id); if (!s) return;
    const v = el.value === '' ? null : el.value === 'mb' ? 'mb' : +el.value;
    if (v !== null && Base.security(v).length >= Base.secCap(v)) { Game.notify('FULL', 'Security team is full.', 'bad'); UI.renderPanel(); return; }
    if (s.status === 'deployed') { Game.notify('DEPLOYED', 'Operative is deployed.', 'bad'); UI.renderPanel(); return; }
    s.sec = v; UI.renderPanel();
  },
  fav: d => { const s = Staff.byId(+d.id); if (s) s.fav = !s.fav; UI.renderPanel(); },
  dismissOne: d => { const s = Staff.byId(+d.id); if (s && confirm(`Dismiss ${s.name}?`)) { Staff.dismiss(s, 'was dismissed'); UI.ps.staff.detail = null; UI.renderPanel(); } },
  release: d => { const s = Staff.byId(+d.id); if (s) { Staff.dismiss(s, 'was released from the brig'); G.heroism += 40; UI.ps.staff.detail = null; UI.renderPanel(); } },
});

// ===================== R&D =====================
PANELS.rnd = {
  title: 'RESEARCH & DEVELOPMENT', live: true,
  render(st) {
    st.cat = st.cat || 'Weapons';
    const act = G.rnd.active.map(a => `<div class="rdi"><div><div class="nm">${RD[a.id].name}</div>${bar(1 - a.left / a.total, 'blue live')}<div class="dim" style="font-size:12px">${U.fmtDur(a.left * 60 / RnD.speed())} remaining</div></div><div><button class="sm danger" data-act="rdCancel" data-id="${a.id}" data-tip="Refunds 50%">Cancel</button></div></div>`).join('');
    const levels = DEPT_KEYS.map(d => `<span class="pill" style="color:${DEPTS[d].color}">${DEPTS[d].short} ${Staff.level(d)}</span>`).join(' ');
    let html = `<div class="row wrap" style="margin-bottom:8px">${levels}<span class="grow"></span><span class="dim">Teams ${G.rnd.active.length}/${RnD.slots()} · speed ×${RnD.speed().toFixed(2)}</span></div>`;
    if (act) html += `<h3>In Development</h3>${act}`;
    const q = RnD.queue();
    if (q.length) html += `<h3>Queue</h3>` + q.map((id, i) => `<div class="rdi"><div><div class="nm"><span class="dim mono">#${i + 1}</span> ${RD[id].name}</div><div class="cost">${U.costStr(RnD.cost(RD[id]), G.res)} · starts when a team is free${Base.canAfford(RnD.cost(RD[id])) ? '' : ' <span class="bad">(insufficient resources)</span>'}</div></div><div><button class="sm danger" data-act="rdDequeue" data-id="${id}">Remove</button></div></div>`).join('');
    const cnt = c => RD_ITEMS.filter(i => i.cat === c && RnD.state(i.id) === 'available').length;
    html += tabs(st.cat, RD_CATS.map(c => [c, c, cnt(c) || undefined]), 'rdCat');
    const items = RD_ITEMS.filter(i => i.cat === st.cat);
    const order = { available: 0, active: 1, locked: 2, done: 3 };
    items.sort((a, b) => order[RnD.state(a.id)] - order[RnD.state(b.id)]);
    html += items.map(it => {
      const s = RnD.state(it.id);
      const miss = RnD.missing(it);
      const req = Object.entries(it.req || {}).map(([d, v]) => `<span class="${Staff.level(d) < v ? 'miss' : ''}">${DEPTS[d].short} ${v}</span>`).concat(it.pre ? [`<span class="${RnD.has(it.pre) ? '' : 'miss'}">${RD[it.pre].name}</span>`] : []).join(' · ');
      const why = RnD.canStart(it.id);
      const queued = q.includes(it.id);
      const busy = s === 'available' && G.rnd.active.length >= RnD.slots();
      const right = s === 'done' ? '<span class="pill ok">DEVELOPED</span>' : s === 'active' ? '<span class="pill blue">IN PROGRESS</span>' : queued ? `<span class="pill acc">QUEUED #${q.indexOf(it.id) + 1}</span>` :
        busy ? `<button class="sm" data-act="rdQueue" data-id="${it.id}" data-tip="All teams busy — start automatically when one frees up">Queue</button>` :
        `<button class="sm ${s === 'available' && !why ? 'pri' : ''}" data-act="rdStart" data-id="${it.id}" ${why ? `disabled data-tip="${why}"` : ''}>Develop</button>`;
      return `<div class="rdi ${s}"><div><div class="nm">${it.name}</div><div class="note">${it.desc}</div>
        ${s !== 'done' && !it.start ? `<div class="req dim">Requires: ${req || '—'}</div><div class="cost">${U.costStr(RnD.cost(it), G.res)} · ${it.hours}h base</div>` : ''}</div><div>${right}</div></div>`;
    }).join('');
    return html;
  },
};
Object.assign(ACT, {
  rdCat: d => { UI.ps.rnd.cat = d.k; UI.renderPanel(); },
  rdStart: d => { RnD.start(d.id); UI.renderPanel(); },
  rdCancel: d => { RnD.cancel(d.id); RnD.pump(); UI.renderPanel(); },
  rdQueue: d => { RnD.enqueue(d.id); UI.renderPanel(); },
  rdDequeue: d => { RnD.dequeue(d.id); UI.renderPanel(); },
});

// ===================== OPERATIONS =====================
PANELS.ops = {
  title: 'OPERATIONS', live: true,
  render(st) {
    st.tab = st.tab || 'contracts'; st.sort = st.sort || 'dist';
    const active = G.deps.length + G.battles.filter(b => b.kind === 'defend').length;
    let html = tabs(st.tab, [['contracts', 'Contracts', Contracts.open().length], ['active', 'Active Ops', active], ['reports', 'Reports', (G.reports || []).length]], 'opsTab');
    if (st.tab === 'contracts') {
      const avail = G.staff.filter(Staff.deployable).length;
      html += `<div class="row" style="margin-bottom:8px"><span class="dim">Sort:</span>${['dist', 'diff', 'reward', 'expires'].map(k => `<button class="sm ${st.sort === k ? 'on' : ''}" data-act="opsSort" data-k="${k}">${{ dist: 'Distance', diff: 'Difficulty', reward: 'Reward', expires: 'Expiring' }[k]}</button>`).join('')}<span class="grow"></span><span class="dim">${avail} operatives ready</span></div>`;
      const list = Contracts.open().map(c => ({ c, d: Contracts.nearestOrigin(c.lat, c.lng).d }));
      const f = { dist: x => x.d, diff: x => -x.c.diff, reward: x => -x.c.reward.gmp, expires: x => x.c.expires }[st.sort];
      list.sort((a, b) => f(a) - f(b));
      html += list.map(({ c, d }) => `<div class="ct" data-act="locateContract" data-id="${c.id}">
        <div class="diff d${c.diff}">${c.diff}<small>DIFF</small></div>
        <div><div class="t">${U.esc(c.title)}</div><div class="dim" style="font-size:13px">${CONTRACT_TYPES[c.type].name} · ${U.esc(c.city)}, ${U.esc(c.country)} · ${U.fmt(d)} km · ${U.esc(c.faction)}${c.pfId ? ' <span class="pill red">PF</span>' : ''} · ${U.isNight(G.time, c.lng) ? '☾' : '☀'}</div>
        <div class="dim" style="font-size:12px">${Contracts.intel(c)} · expires ${U.fmtDur(c.expires - G.time)}</div></div>
        <div class="col" style="align-items:flex-end"><span class="mono acc">${U.fmtShort(c.reward.gmp)} GMP</span><button class="sm pri" data-act="planContract" data-id="${c.id}">Deploy</button></div></div>`).join('') || '<div class="empty">No contracts on offer. More arrive every few hours.</div>';
    } else if (st.tab === 'active') {
      const rows = [];
      for (const b of G.battles) {
        const ops = b.units.filter(u => u.side === 'player' && u.kind === 'op');
        rows.push(`<div class="ct" data-act="focusBattle" data-id="${b.id}"><div class="diff ${b.alert === 2 ? 'bad' : b.alert === 1 ? 'acc' : 'blue'}">⚔</div>
          <div><div class="t">${U.esc(b.title)}</div><div class="dim" style="font-size:13px">${U.esc(b.team)} · ${U.esc(b.place)} · ${b.phase === 'loading' ? 'inserting…' : ['Sneaking', 'Caution', 'ALERT'][b.alert]} · ${U.fmtSec(b.time)} · ${ops.filter(ALIVE).length}/${ops.length} active</div></div>
          <div><button class="sm pri" data-act="focusBattle" data-id="${b.id}">${b.commanded ? 'Commanding' : 'Take Command'}</button></div></div>`);
      }
      for (const d of G.deps) {
        if (d.state === 'engaged') continue;
        const eta = d.state === 'outbound' ? d.arrive - G.time : d.returnAt - G.time;
        rows.push(`<div class="ct" data-act="flyDep" data-id="${d.id}"><div class="diff dim">✈</div><div><div class="t">${U.esc(d.name)} — ${U.esc(d.title)}</div>
          <div class="dim" style="font-size:13px">${d.state === 'outbound' ? 'En route to ' + U.esc(d.to.name) : 'Returning to ' + U.esc(d.from.name)} · ETA ${U.fmtDur(eta)} · ${d.squad.map(m => { const s = Staff.byId(m.sid); return s ? U.esc(s.callsign) : '—'; }).join(', ')}</div></div><div></div></div>`);
      }
      html += rows.join('') || '<div class="empty">No active operations.</div>';
    } else {
      html += (G.reports || []).map(r => `<div class="ct" data-act="showReport" data-id="${r.id}"><div class="diff ${r.success ? 'ok' : 'bad'}">${r.grade}</div><div><div class="t">${U.esc(r.title)}</div><div class="dim" style="font-size:13px">Day ${Math.floor(r.t / 1440) + 1} · ${r.success ? 'Success' : 'Failure'} · ${U.fmtSec(r.time)} · ${r.kills} kills · ${r.sleeps} tranq · ${r.recruits.length} recruited${r.kia.length ? ' · <span class="bad">' + r.kia.length + ' KIA</span>' : ''}</div></div><div></div></div>`).join('') || '<div class="empty">No missions completed yet.</div>';
    }
    return html;
  },
};
Object.assign(ACT, {
  opsTab: d => { UI.ps.ops.tab = d.k; UI.renderPanel(true); },
  opsSort: d => { UI.ps.ops.sort = d.k; UI.renderPanel(); },
  locateContract: (d, el, e) => { if (e.target.closest('button')) return; const c = Contracts.byId(+d.id); if (c) MapView.map.flyTo([c.lat, c.lng], 9, { duration: 1.5 }); },
});

// ===================== FOB / ONLINE =====================
PANELS.online = {
  title: 'FOB & PRIVATE FORCES', live: true,
  render(st) {
    st.tab = st.tab || 'fobs';
    let html = '';
    if (G.threats.length) html += G.threats.map(t => { const p = PF.byId(t.pfId); const tn = t.target === 'mb' ? G.base.name : (G.fobs.find(f => f.id === t.target) || {}).name; return `<div class="card" style="border-color:var(--red);margin-bottom:8px"><b class="bad">⚠ INCURSION INBOUND</b> — ${U.esc(p.name)} → ${U.esc(tn)} in ${U.fmtDur(t.at - G.time)}. Assign security staff now.</div>`; }).join('');
    html += tabs(st.tab, [['fobs', 'My Bases', G.fobs.length + 1], ['pfs', 'Rival PFs', G.pfs.length], ['league', 'League']], 'onTab');
    if (st.tab === 'fobs') {
      const def = Base.defenses(1);
      html += `<div class="note" style="margin-bottom:8px">Rival PFs raid FOBs (and Mother Base, when enraged). Assign combat staff as security — anyone left asleep can be fultoned away by intruders. Defenses come from R&D: cameras ${RnD.has('cam1') ? '✔' : '✖'} · UAVs ${RnD.has('uav1') ? '✔' : '✖'} · mines ${RnD.has('mines1') ? '✔' : '✖'} · security gear Mk${def.gear}.</div>`;
      const secBlock = (where, name) => {
        const sec = Base.security(where);
        const cand = G.staff.filter(s => s.dept === 'combat' && !s.sec && s.status === 'active').sort((a, b) => b.stats.combat - a.stats.combat);
        return `<div class="row wrap" style="margin-top:6px">${sec.map(s => `<span class="pill acc" data-tip="${Staff.grade(s.stats.combat)} combat">${U.esc(s.callsign)} ${Staff.gradeHtml(s.stats.combat)} <a data-act="unSec" data-id="${s.id}" style="cursor:pointer" class="bad">✕</a></span>`).join('') || '<span class="dim">No security assigned</span>'}
          ${sec.length < Base.secCap(where) && cand.length ? `<select data-chg="addSec" data-where="${where}"><option value="">+ Add (${sec.length}/${Base.secCap(where)})</option>${cand.slice(0, 40).map(s => `<option value="${s.id}">${U.esc(s.callsign)} — CMB ${Staff.grade(s.stats.combat)}</option>`).join('')}</select>` : ''}</div>`;
      };
      html += `<div class="card" style="margin-bottom:8px"><div class="row"><b style="font-size:17px">${U.esc(G.base.name)}</b><span class="dim">Mother Base · ${ZONE[G.base.zone].name}</span><span class="grow"></span><button class="sm" data-act="zoomTo" data-lat="${G.base.lat}" data-lng="${G.base.lng}">Inspect</button></div>
        <div class="note">If no security is assigned, the strongest available combat staff respond to an attack.</div>${secBlock('mb')}</div>`;
      for (const f of G.fobs) {
        const bld = f.build;
        const c = f.plat < 4 ? Base.fobPlatCost(f) : null;
        html += `<div class="card" style="margin-bottom:8px"><div class="row"><b style="font-size:17px">${U.esc(f.name)}</b><span class="dim">${ZONE[f.zone].name} · ${f.plat} platform${f.plat > 1 ? 's' : ''} · defended ${f.defended} / breached ${f.lost}</span><span class="grow"></span><button class="sm" data-act="zoomTo" data-lat="${f.lat}" data-lng="${f.lng}">Inspect</button></div>
          ${bld ? `${bar(1 - bld.left / bld.total)}<div class="dim">${bld.what === 'fob' ? 'Under construction' : 'Adding platform'} — ${U.fmtDur(bld.left * 60 / Base.buildSpeed())}</div>` : `<div class="row"><span class="dim" style="font-size:13px">Produces ~${U.fmt(f.plat * 3500)} GMP/day + materials (${Object.entries(ZONE[f.zone].bias).filter(([, v]) => v > 1.15).map(([k]) => RES_NAME[k]).join(', ') || 'balanced'})</span><span class="grow"></span>${c ? `<button class="sm" data-act="expandFob" data-id="${f.id}" data-tip="${U.esc(U.costStr(c, G.res) + " · " + c.hours + "h")}">Add platform</button>` : ''}</div>`}
          ${bld && bld.what === 'fob' ? '' : secBlock(f.id)}</div>`;
      }
      const why = Base.canBuildFob();
      const fc = Base.fobCost();
      html += `<div class="card"><div class="row"><b>Establish new FOB</b><span class="grow"></span><button class="sm pri" data-act="newFob" ${why ? `disabled data-tip="${why}"` : ''}>Choose zone…</button></div><div class="cost">${U.costStr(fc, G.res)} · ${fc.hours}h · ${G.fobs.length}/${Base.maxFobs()} FOBs</div><div class="note">FOBs generate GMP and materials daily, act as forward deployment points, and attract rival raids.</div></div>`;
    } else if (st.tab === 'pfs') {
      const list = [...G.pfs].sort((a, b) => b.points - a.points);
      html += list.map(p => `<div class="card" style="margin-bottom:8px"><div class="row" style="align-items:flex-start">
        <img src="${Art.emblem(p.emblem, p.initials)}" width="56">
        <div class="grow"><div class="row"><b style="font-size:17px">${U.esc(p.known ? p.name : 'Unidentified PF')}</b><span class="pill">${PF.league(p.points)}</span><span class="pill">Tier ${p.tier}</span></div>
          <div class="dim" style="font-size:13px">${p.known ? `Led by ${U.esc(p.leader.name)} "${U.esc(p.leader.callsign)}" · ${p.staff} staff · "${U.esc(p.motto)}"` : 'Identity unknown — scout one of their FOBs.'}</div>
          <div class="row"><span class="dim" style="font-size:12px">Hostility</span><div class="bar red" style="width:140px"><i style="width:${p.hostility}%"></i></div><span class="mono" style="font-size:12px">${Math.round(p.hostility)}</span><span class="dim" style="font-size:12px">· W${p.wins}/L${p.losses}</span></div>
          ${p.fobs.map(f => { const rev = PF.revealed(f); const sc = G.scouts.some(s => s.fid === f.id); return `<div class="row" style="margin-top:4px;font-size:14px"><span>⬢ ${U.esc(f.name)}</span><span class="dim">${ZONE[f.zone].name} · ${f.plat}P · ${rev ? `${f.sec} sec ${Staff.grade(f.secLvl)} · ${f.cams} cam · ${f.uavs} UAV · ${f.mines} mines${f.lethal ? ' · <span class="bad">lethal</span>' : ''}` : 'defenses unknown'}</span><span class="grow"></span>
            ${rev ? '' : `<button class="sm" data-act="scout" data-id="${f.id}" ${sc ? 'disabled' : ''} data-tip="${U.esc(U.costStr(PF.scoutCost(p), G.res))}">${sc ? 'Scouting…' : 'Scout'}</button>`}
            <button class="sm" data-act="zoomTo" data-lat="${f.lat}" data-lng="${f.lng}" data-z="6">Locate</button><button class="sm pri" data-act="planInfiltrate" data-id="${f.id}">Infiltrate</button></div>`; }).join('')}
        </div></div></div>`).join('');
    } else {
      const lb = PF.leaderboard();
      html += `<table class="stbl"><tr><th>#</th><th></th><th>Private Force</th><th>League</th><th>Points</th></tr>${lb.map((r, i) => `<tr style="${r.me ? 'color:var(--acc)' : ''}"><td class="mono">${i + 1}</td><td><img src="${r.emblem}"></td><td>${U.esc(r.me || r.pf.known ? r.name : 'Unidentified PF')}${r.me ? ' (you)' : ''}</td><td>${PF.league(r.points)}</td><td class="mono">${U.fmt(r.points)}</td></tr>`).join('')}</table>`;
    }
    return html;
  },
};
Object.assign(ACT, {
  onTab: d => { UI.ps.online.tab = d.k; UI.renderPanel(true); },
  unSec: d => { const s = Staff.byId(+d.id); if (s) s.sec = null; UI.renderPanel(); },
  addSec: (d, el) => {
    const s = Staff.byId(+el.value); if (!s) return;
    const where = d.where === 'mb' ? 'mb' : +d.where;
    if (Base.security(where).length >= Base.secCap(where)) return;
    s.sec = where; UI.renderPanel();
  },
  expandFob: d => { const f = G.fobs.find(f => f.id === +d.id); if (f) Base.expandFob(f); UI.renderPanel(); },
  newFob: () => { UI.closePanel(); MapView.pickZone(z => { Base.buildFob(z); UI.openPanel('online'); }); },
});

// ===================== LOG =====================
PANELS.log = {
  title: 'INTEL LOG', live: false,
  render(st) {
    st.f = st.f || 'all';
    let html = tabs(st.f, [['all', 'All'], ['bad', 'Alerts'], ['ok', 'Success'], ['info', 'Info']], 'logTab');
    const list = G.log.filter(l => st.f === 'all' || l.type === st.f).slice(0, 250);
    html += list.map(l => `<div style="display:grid;grid-template-columns:118px 1fr;gap:8px;padding:4px 0;border-bottom:1px solid #18221d;font-size:14px"><span class="mono dim" style="font-size:12px">D${Math.floor(l.t / 1440) + 1} ${U.pad(Math.floor(l.t % 1440 / 60))}:${U.pad(Math.floor(l.t % 60))}</span><span class="${l.type === 'bad' ? 'bad' : l.type === 'ok' ? 'ok' : ''}">${U.esc(l.msg)}</span></div>`).join('');
    return html;
  },
};
ACT.logTab = d => { UI.ps.log.f = d.k; UI.renderPanel(); };

// ===================== SYSTEM =====================
PANELS.system = {
  title: 'SYSTEM', live: false,
  render() {
    const t = (k, label, tip) => `<label class="row" style="cursor:pointer" data-tip="${tip}"><span class="selbox ${G.settings[k] ? 'on' : ''}" data-act="setting" data-k="${k}"></span><span data-act="setting" data-k="${k}">${label}</span></label>`;
    return `<h3>Game</h3><div class="row wrap"><button class="pri" data-act="saveGame">Save</button><button data-act="loadGame">Load last save</button><button class="danger" data-act="newGameConfirm">New game</button></div>
      <div class="note" style="margin-top:6px">The game autosaves every 6 in-game hours and when you close the tab.</div>
      <h3>Settings</h3><div class="col">
      ${t('osm', 'Real building footprints in city battles (OpenStreetMap)', 'Battles use real buildings fetched from OpenStreetMap. Turn off for procedural cities.')}
      ${t('pauseOnInvasion', 'Slow to 1x when a FOB is invaded', '')}
      ${t('focusOnArrival', 'Auto-focus squads on arrival', 'Fly to the battle and take command as soon as a squad lands.')}
      ${t('autoDismiss', 'Auto-dismiss weakest recruit when waiting room is full', '')}
      ${t('autoAssignRecruits', 'Auto-place new volunteers into departments with free slots', 'New arrivals go straight to the department that suits them best, if there is room.')}
      ${t('satellite', 'Satellite imagery (M)', '')}
      </div>
      <h3>Audio</h3><div class="col">
      ${['master', 'sfx', 'music'].map(k => `<label class="range"><span>${{ master: 'Master', sfx: 'Effects', music: 'Music' }[k]}</span><input type="range" min="0" max="100" value="${Math.round(Sfx.cfg[k] * 100)}" data-inp="audioVol" data-k="${k}"><span class="mono" id="vol-${k}">${Math.round(Sfx.cfg[k] * 100)}</span></label>`).join('')}
      <label class="row" style="cursor:pointer"><span class="selbox ${Sfx.cfg.muted ? 'on' : ''}" data-act="audioMute"></span><span data-act="audioMute">Mute all (N)</span></label>
      <div class="note">All sound is synthesized live. The soundtrack adapts: calm at base, tense while sneaking, driving when a squad you're watching is on alert.</div></div>
      <h3>Controls</h3>${HELP_HTML}`;
  },
};
const HELP_HTML = `<table class="help">
  <tr><td><kbd>Space</kbd></td><td>Pause / resume · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> or <kbd>+</kbd>/<kbd>-</kbd> set speed (outside battles)</td></tr>
  <tr><td><kbd>N</kbd></td><td>Mute / unmute audio</td></tr>
  <tr><td><kbd>B</kbd> <kbd>T</kbd> <kbd>R</kbd> <kbd>O</kbd> <kbd>F</kbd> <kbd>L</kbd></td><td>Base · sTaff · R&amp;D · Ops · FOB · Log panels</td></tr>
  <tr><td><kbd>M</kbd></td><td>Toggle satellite imagery</td></tr>
  <tr><td>Zoom in on a battle</td><td>Opens the command HUD seamlessly — the squad AI keeps fighting until you give orders. Zoom out or <kbd>Esc</kbd> to leave; the battle carries on.</td></tr>
  <tr><td>Left click</td><td>Select operative · <kbd>Shift</kbd>+click add · <kbd>Shift</kbd>+drag box select · drag to pan</td></tr>
  <tr><td>Right click</td><td>Move · on enemy: attack · on sleeping enemy/hostage: Fulton · on downed ally: revive · on objective: interact</td></tr>
  <tr><td><kbd>1</kbd>–<kbd>8</kbd></td><td>Select operative (<kbd>Shift</kbd> adds) · <kbd>Ctrl</kbd>+<kbd>A</kbd> select all</td></tr>
  <tr><td><kbd>S</kbd> / <kbd>H</kbd> / <kbd>X</kbd></td><td>Toggle stealth/assault · Hold position · Recall to LZ</td></tr>
  <tr><td><kbd>Z</kbd> <kbd>C</kbd> <kbd>V</kbd> <kbd>G</kbd></td><td>Support: supply drop · smoke · sleep gas · precision strike (then click target)</td></tr>
  <tr><td><kbd>Q</kbd></td><td>Units you order go MANUAL — Q hands them back to the squad AI (leaving the battle does too)</td></tr>
  <tr><td><kbd>Tab</kbd> / <kbd>F</kbd></td><td>Cycle and center on operatives · toggle camera follow</td></tr>
  <tr><td>Hover a unit</td><td>Shows health, weapon, status and what a right-click will do</td></tr></table>`;
Object.assign(ACT, {
  setting: d => {
    G.settings[d.k] = !G.settings[d.k];
    if (d.k === 'satellite') MapView.setLayer(G.settings.satellite);
    UI.renderPanel();
  },
  saveGame: () => Game.save(),
  audioVol: (d, el) => { Sfx.cfg[d.k] = el.value / 100; Sfx.applyVol(); Sfx.saveCfg(); const o = document.getElementById('vol-' + d.k); if (o) o.textContent = el.value; },
  audioMute: () => { Sfx.toggleMute(); UI.renderPanel(); },
  loadGame: () => { if (Game.load()) { location.reload(); } else Game.notify('NO SAVE', 'No saved game found.', 'bad'); },
  newGameConfirm: () => { if (confirm('Abandon this Mother Base and start over? Your save will be overwritten.')) { Game.wipe(); window.__noSave = true; location.reload(); } },
});
