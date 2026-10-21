'use strict';
// ---------- deployment planning & mission reports ----------
const Plan = {
  st: null,

  defaultWeapon(stance) {
    const w = RnD.weapons();
    if (stance === 'assault') return ['ar3', 'ar2', 'ar1'].find(x => w.includes(x));
    return ['tranq_rifle', 'tranq_pistol'].find(x => w.includes(x));
  },

  open(kind, id) {
    MapView.map.closePopup();
    if (kind === 'contract') {
      const c = Contracts.byId(id); if (!c || c.status !== 'open') { Game.notify('UNAVAILABLE', 'Contract no longer available.', 'bad'); return; }
      Terrain.prefetch(c.lat, c.lng); // start pulling real building footprints early
    }
    Plan.st = { kind, id, squad: [], opts: { fulton: true, stance: 'stealth' } };
    // pre-select a sensible squad
    const max = kind === 'contract' ? 4 : 3;
    const avail = G.staff.filter(Staff.deployable).sort((a, b) => b.stats.combat - a.stats.combat);
    for (const s of avail.slice(0, max)) Plan.st.squad.push({ sid: s.id, weapon: Plan.defaultWeapon('stealth') });
    Plan.render();
  },

  info() {
    const st = Plan.st;
    if (st.kind === 'contract') {
      const c = Contracts.byId(st.id);
      return { title: c.title, lat: c.lat, lng: c.lng, place: `${c.city}, ${c.country}`, max: 6, threat: c.enemies * (6 + c.diff * 7), c };
    }
    const [p, f] = PF.fobById(st.id);
    return { title: `Infiltrate ${f.name}`, lat: f.lat, lng: f.lng, place: `${f.name} — ${ZONE[f.zone].name}`, max: 4, threat: f.sec * f.secLvl * 0.9 + f.cams * 10 + f.uavs * 25, p, f };
  },

  render() {
    const st = Plan.st; if (!st) return;
    const I = Plan.info();
    const o = Contracts.nearestOrigin(I.lat, I.lng);
    const travel = Contracts.travelMins(o.d, st.squad);
    const cost = Contracts.deployCost(o.d, st.squad.length);
    const night = U.isNight(G.time + travel, I.lng);
    const weapons = RnD.weapons();
    const chosen = new Set(st.squad.map(m => m.sid));
    const power = st.squad.reduce((n, m) => { const s = Staff.byId(m.sid); return n + (s ? Staff.eff(s, 'combat') : 0); }, 0) * (1 + RnD.armor()) * (st.opts.stance === 'stealth' ? 1.25 : 1);
    const ratio = power / Math.max(1, I.threat * 0.55);
    const est = ratio > 1.6 ? ['FAVORABLE', 'ok'] : ratio > 1.0 ? ['EVEN', 'acc'] : ratio > 0.6 ? ['RISKY', 'bad'] : ['SUICIDAL', 'bad'];
    let brief;
    if (I.c) {
      const c = I.c;
      brief = `<div class="note" style="margin-bottom:6px">${CONTRACT_TYPES[c.type].desc}</div>
        <dl class="kv"><dt>Type</dt><dd>${CONTRACT_TYPES[c.type].name} · difficulty <span class="d${c.diff}">${c.diff}</span></dd><dt>Client</dt><dd>${U.esc(c.client)}</dd>
        <dt>Opposition</dt><dd>${U.esc(c.faction)}</dd><dt>Intel</dt><dd>${Contracts.intel(c)}</dd>
        <dt>Reward</dt><dd class="acc">${U.fmt(c.reward.gmp)} GMP ${Object.entries(c.reward.res).map(([k, v]) => `+ ${v} ${RES_LABEL[k]}`).join(' ')}</dd>
        <dt>Expires</dt><dd>${U.fmtDur(c.expires - G.time)}</dd></dl>`;
    } else {
      const { p, f } = I;
      const rev = PF.revealed(f);
      brief = `<div class="row" style="margin-bottom:6px"><img src="${Art.emblem(p.emblem, p.initials)}" width="48"><div><b>${U.esc(p.name)}</b><div class="dim">${PF.league(p.points)} · Tier ${p.tier} · hostility ${Math.round(p.hostility)}</div></div></div>
        <div class="note">Insert at a helipad, reach the core and hack it to steal ~${Math.round((0.08 + p.tier * 0.006) * 100)}% of their stockpile. Fulton sleeping guards to steal staff (≈${Staff.grade(f.secLvl)} grade). Raiding raises their hostility — expect retaliation.</div>
        <dl class="kv" style="margin-top:6px">${rev ? `<dt>Security</dt><dd>${f.sec} guards (≈${Staff.grade(f.secLvl)}) ${f.lethal ? '<span class="bad">LETHAL</span>' : 'non-lethal'}</dd><dt>Devices</dt><dd>${f.cams} cameras · ${f.uavs} UAVs · ${f.mines} mines</dd>` : '<dt>Defenses</dt><dd class="bad">UNKNOWN — scout first</dd>'}
        <dt>Stockpile</dt><dd>${rev ? U.fmtShort(p.res.gmp) + ' GMP' : '?'}</dd></dl>`;
    }
    const squadRows = st.squad.map((m, i) => {
      const s = Staff.byId(m.sid); if (!s) return '';
      return `<tr><td><img src="${Staff.portrait(s)}"></td><td>${U.esc(s.callsign)}<div class="dim" style="font-size:12px">${U.esc(s.name)}</div></td><td>${Staff.gradeHtml(s.stats.combat)}</td><td>${skillIcons(s)}</td>
        <td><select data-chg="planWeapon" data-i="${i}">${weapons.map(w => `<option value="${w}" ${m.weapon === w ? 'selected' : ''}>${WEAPONS[w].name}${WEAPONS[w].lethal ? '' : ' (NL)'}</option>`).join('')}</select></td>
        <td><button class="sm danger" data-act="planToggle" data-id="${s.id}">✕</button></td></tr>`;
    }).join('');
    const avail = G.staff.filter(s => Staff.deployable(s) && !chosen.has(s.id)).sort((a, b) => b.stats.combat - a.stats.combat);
    const availRows = avail.map(s => `<tr data-act="planToggle" data-id="${s.id}"><td><img src="${Staff.portrait(s)}"></td><td>${U.esc(s.callsign)}</td><td>${Staff.gradeHtml(s.stats.combat)}</td><td>${skillIcons(s)}</td><td>${moraleBar(s.morale)}</td></tr>`).join('');
    const full = st.squad.length >= I.max;
    UI.modal(`
      <div class="mh"><h2>DEPLOYMENT PLAN — ${U.esc(I.title.toUpperCase())}</h2><button class="x" data-act="closeModal">✕</button></div>
      <div class="mb"><div class="grid2">
        <div class="col">
          <div class="card">${brief}
            <dl class="kv" style="margin-top:6px"><dt>Location</dt><dd>${U.esc(I.place)}</dd><dt>Launch from</dt><dd>${U.esc(o.name)} · ${U.fmt(o.d)} km</dd><dt>Travel</dt><dd>${U.fmtDur(travel)} · arrives ${night ? '<span class="blue">☾ at night</span>' : '☀ in daylight'}</dd>
            <dt>Cost</dt><dd>${U.costStr(cost, G.res)}</dd></dl>
          </div>
          <div class="card"><div class="row wrap">
            <span class="dim">Approach:</span>
            <button class="sm ${st.opts.stance === 'stealth' ? 'on' : ''}" data-act="planStance" data-v="stealth" data-tip="Move slowly, hold fire until spotted. Better detection avoidance.">Stealth</button>
            <button class="sm ${st.opts.stance === 'assault' ? 'on' : ''}" data-act="planStance" data-v="assault" data-tip="Move fast, engage on sight.">Assault</button>
            <span class="grow"></span>
            <label class="row" style="cursor:pointer"><span class="selbox ${st.opts.fulton ? 'on' : ''}" data-act="planFulton"></span><span data-act="planFulton">Fulton sleeping enemies</span></label>
          </div><div class="note" style="margin-top:4px">These are the squad AI's standing orders. You can zoom in and take command at any time.</div></div>
          <h3>Squad (${st.squad.length}/${I.max})</h3>
          ${st.squad.length ? `<table class="stbl">${squadRows}</table>` : '<div class="empty">Select operatives from the right.</div>'}
        </div>
        <div class="col"><h3>Available combat staff (${avail.length})</h3>
          <div class="squadpick">${avail.length ? `<table class="stbl"><tr><th></th><th>Callsign</th><th>CMB</th><th>Skills</th><th>Morale</th></tr>${availRows}</table>` : '<div class="empty">No combat staff available. Assign staff to Combat, or wait for deployed squads to return.</div>'}</div>
          ${full ? `<div class="note acc">Squad is full.</div>` : ''}
        </div>
      </div></div>
      <div class="mf"><span class="dim">Assessment:</span><b class="${est[1]}" style="letter-spacing:.1em">${est[0]}</b><span class="grow"></span>
        <button data-act="closeModal">Cancel</button><button class="pri" data-act="planGo" ${st.squad.length && Base.canAfford(cost) ? '' : 'disabled'}>Deploy ${st.squad.length ? '(' + st.squad.length + ')' : ''}</button></div>`);
  },
};

Object.assign(ACT, {
  planContract: d => Plan.open('contract', +d.id),
  planInfiltrate: d => {
    if (G.battles.some(b => b.kind === 'infiltrate' && b.pfFobId === +d.id) || G.deps.some(x => x.pfFobId === +d.id)) { Game.notify('IN PROGRESS', 'A team is already assigned to that FOB.', 'bad'); return; }
    Plan.open('infiltrate', +d.id);
  },
  planToggle: d => {
    const st = Plan.st; const id = +d.id;
    const i = st.squad.findIndex(m => m.sid === id);
    if (i >= 0) st.squad.splice(i, 1);
    else if (st.squad.length < Plan.info().max) st.squad.push({ sid: id, weapon: Plan.defaultWeapon(st.opts.stance) });
    Plan.render();
  },
  planWeapon: (d, el) => { Plan.st.squad[+d.i].weapon = el.value; },
  planStance: d => {
    const st = Plan.st; const prev = st.opts.stance; st.opts.stance = d.v;
    for (const m of st.squad) if (m.weapon === Plan.defaultWeapon(prev)) m.weapon = Plan.defaultWeapon(d.v);
    Plan.render();
  },
  planFulton: () => { Plan.st.opts.fulton = !Plan.st.opts.fulton; Plan.render(); },
  planGo: () => {
    const st = Plan.st;
    const dep = Contracts.deploy({ kind: st.kind, contractId: st.kind === 'contract' ? st.id : null, pfFobId: st.kind === 'infiltrate' ? st.id : null, squad: st.squad.map(m => ({ ...m })), opts: { ...st.opts } });
    if (dep) { UI.closeModal(); Plan.st = null; Game.notify('DEPLOYED', `${dep.name} is en route. ETA ${U.fmtDur(dep.travel)}.`, 'info'); }
  },
  showReport: d => {
    const r = (G.reports || []).find(r => r.id === +d.id); if (!r) return;
    const pay = r.payout && Object.keys(r.payout).length ? Object.entries(r.payout).filter(([, v]) => v).map(([k, v]) => `<span class="pill ok">+${U.fmt(v)} ${RES_LABEL[k]}</span>`).join(' ') : '<span class="dim">None</span>';
    const lost = r.lost ? Object.entries(r.lost).filter(([, v]) => v).map(([k, v]) => `<span class="pill red">−${U.fmt(v)} ${RES_LABEL[k]}</span>`).join(' ') : '';
    const gcol = { S: 'var(--vio)', A: 'var(--ok)', B: 'var(--blue)', C: 'var(--acc)', D: '#ff8a4e', E: 'var(--red)' }[r.grade];
    UI.modal(`<div class="mh"><h2>MISSION REPORT</h2><button class="x" data-act="closeModal">✕</button></div>
      <div class="mb"><div class="row" style="gap:20px;align-items:center">
        <div class="report-grade" style="color:${gcol}">${r.grade}</div>
        <div><div style="font-size:20px;font-weight:700">${U.esc(r.title)}</div><div class="${r.success ? 'ok' : 'bad'}" style="letter-spacing:.14em;font-weight:700">${r.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</div><div class="dim">Score ${r.score} · ${U.fmtSec(r.time)} · Day ${Math.floor(r.t / 1440) + 1}</div></div></div>
        <dl class="kv" style="margin-top:12px">
          <dt>Alerts</dt><dd>${r.alerts}${r.alerts === 0 ? ' <span class="ok">(no traces)</span>' : ''}</dd>
          <dt>Neutralized</dt><dd>${r.kills} killed · ${r.sleeps} tranquilized</dd>
          <dt>Rewards</dt><dd>${pay}</dd>
          ${lost ? `<dt>Losses</dt><dd>${lost}</dd>` : ''}
          <dt>Recruited</dt><dd>${r.recruits.length ? r.recruits.map(U.esc).join('<br>') : '<span class="dim">—</span>'}</dd>
          <dt>Injured</dt><dd>${r.injured.length ? r.injured.map(U.esc).join(', ') : '—'}</dd>
          <dt>KIA</dt><dd class="${r.kia.length ? 'bad' : ''}">${r.kia.length ? r.kia.map(U.esc).join(', ') : 'None'}</dd>
          ${r.mia.length ? `<dt>Captured</dt><dd class="bad">${r.mia.map(U.esc).join(', ')}</dd>` : ''}
        </dl></div>
      <div class="mf"><button class="pri" data-act="closeModal">Close</button></div>`, 'narrow');
  },
});
