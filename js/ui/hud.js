'use strict';
// ---------- battle HUD (shown while a battle is focused) ----------
const HUD = {
  b: null, last: 0, unitKey: '',

  el() { return document.getElementById('battle-hud'); },

  show(b) {
    HUD.b = b;
    const el = HUD.el();
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="bh-top">
        <span class="ttl" id="bh-ttl"></span><span class="dim" id="bh-place"></span>
        <span class="alertb" id="bh-alert"></span><span class="mono" id="bh-time"></span><span id="bh-night" class="dim"></span>
        <span class="grow"></span>
        <button class="sm" data-act="bhRelease" id="bh-assist" data-tip="Units you give orders to switch to MANUAL. Release hands the selected units (or all) back to the squad AI (Q).">Release to AI</button>
        <button class="sm" data-act="bhFollow" id="bh-follow" data-tip="Keep the camera on the selected operatives (F)">Follow</button>
        <button class="sm" data-act="bhReport" id="bh-report" style="display:none">Report</button>
        <button class="sm" data-act="bhLeave" data-tip="Hand control to the squad AI and zoom out (Esc). The battle continues.">Leave ⟶</button>
      </div>
      <div class="bh-main">
        <div class="bh-obj" id="bh-obj"></div>
        <div class="bh-units" id="bh-units"></div>
        <div class="bh-act" id="bh-act"></div>
      </div>
      <div class="bh-hint" id="bh-hint"></div>`;
    HUD.unitKey = '';
    HUD.update(true);
  },

  hide() { HUD.b = null; HUD.follow = false; const el = HUD.el(); el.classList.add('hidden'); el.innerHTML = ''; },
  refresh() { HUD.update(true); },

  tick(now) {
    if (!HUD.b) return;
    if (!G.battles.includes(HUD.b)) { UI.unfocus(); return; }
    // camera follow keeps the selected squad centered
    if (HUD.follow && now - (HUD.lastFollow || 0) > 250 && !BRender.drag) {
      HUD.lastFollow = now;
      const sel = [...BRender.sel].map(id => Battle.unit(HUD.b, id)).filter(u => u && ALIVE(u));
      if (sel.length) {
        const x = sel.reduce((s, u) => s + u.x, 0) / sel.length, y = sel.reduce((s, u) => s + u.y, 0) / sel.length;
        MapView.map.panTo(U.m2ll(HUD.b.lat, HUD.b.lng, x, y), { animate: true, duration: 0.25, easeLinearity: 1 });
      }
    }
    if (now - HUD.last > 200) { HUD.last = now; HUD.update(); }
  },

  ops(b) { return b.units.filter(u => u.side === 'player' && (u.kind === 'op' || u.kind === 'sentry')); },

  update(force) {
    const b = HUD.b; if (!b) return;
    const $ = id => document.getElementById(id);
    if (!$('bh-ttl')) return;
    $('bh-ttl').textContent = b.title.toUpperCase();
    $('bh-place').textContent = `${b.team} · ${b.place}`;
    const al = $('bh-alert');
    if (b.phase === 'loading') { al.className = 'alertb a0'; al.textContent = 'INSERTING'; }
    else if (b.phase === 'done') { al.className = 'alertb ' + (b.result.success ? 'a0' : 'a2'); al.textContent = b.result.success ? 'COMPLETE' : 'FAILED'; }
    else {
      al.className = 'alertb a' + b.alert;
      al.textContent = b.kind === 'defend' ? ['SECURE', 'CAUTION', 'INTRUDERS'][b.alert] : b.phase === 'exfil' ? 'EXFIL' : ['SNEAKING', 'CAUTION', 'ALERT'][b.alert];
    }
    $('bh-time').textContent = U.fmtSec(b.time) + (b.alert && b.phase !== 'done' ? ` · ${Math.ceil(b.alertT)}s` : '');
    $('bh-night').textContent = b.night ? '☾ NIGHT' : '☀ DAY';
    const as = $('bh-assist');
    const nMan = HUD.ops(b).filter(u => ALIVE(u) && u.manual).length;
    as.textContent = nMan ? `Release to AI (${nMan} manual)` : 'AI in control';
    as.disabled = !nMan;
    as.style.display = b.phase === 'done' ? 'none' : '';
    $('bh-report').style.display = b.phase === 'done' ? '' : 'none';
    $('bh-follow').classList.toggle('on', !!HUD.follow);

    // objectives + feed
    const objs = b.objectives.map(o => {
      let extra = '';
      if (o.type === 'hold' && o.started && !o.done) extra = ` ${Math.floor(o.prog)}/${o.need}s`;
      else if ((o.type === 'intel' || o.type === 'core' || o.type === 'defend') && o.prog && !o.done) extra = ` ${Math.round(Math.min(1, o.prog / o.need) * 100)}%`;
      else if (o.planted && !o.done) extra = ` (${Math.ceil(o.boomT)}s)`;
      return `<div class="o ${o.done ? 'done' : ''} ${o.failed ? 'bad' : ''}">${o.done ? '✔' : o.failed ? '✖' : '◇'} ${U.esc(o.label)}${extra}</div>`;
    }).join('');
    const exfil = b.kind !== 'defend' && (b.phase === 'exfil' || b.abort) ? `<div class="o ok">➜ Extract at the LZ</div>` : '';
    const feed = (b.log || []).slice(0, 3).map(l => `<div class="${l.type === 'bad' ? 'bad' : l.type === 'ok' ? 'ok' : 'dim'}" style="font-size:12px">${U.esc(l.msg)}</div>`).join('');
    $('bh-obj').innerHTML = `<div class="dim" style="font-size:11px;letter-spacing:.14em">OBJECTIVES</div>${objs}${exfil}<div style="margin-top:4px;border-top:1px solid var(--line);padding-top:3px">${feed}</div>`;

    // unit cards
    const ops = HUD.ops(b);
    const key = ops.map(u => u.uid + u.state).join(',') + [...BRender.sel].join(',');
    const unitsEl = $('bh-units');
    if (force || key !== HUD.unitKey) {
      HUD.unitKey = key;
      unitsEl.innerHTML = ops.slice(0, 12).map((u, i) => {
        const out = !ALIVE(u) && u.state !== 'down' && u.state !== 'asleep';
        const img = u.pseed ? Art.portrait(u.pseed) : Art.portrait(u.uid * 7919, '#1b2a33');
        return `<div class="uc ${BRender.sel.has(u.uid) ? 'sel' : ''} ${u.state === 'down' ? 'down' : ''} ${out ? 'out' : ''}" data-act="bhSel" data-uid="${u.uid}">
          <span class="k">${i + 1}</span><img src="${img}"><div class="n">${U.esc(u.name)}</div>
          <div class="bar ok" data-hp="${u.uid}"><i></i></div><div class="st" data-st="${u.uid}"></div></div>`;
      }).join('');
    }
    const nowMs = performance.now();
    for (const u of ops) {
      const hp = unitsEl.querySelector(`[data-hp="${u.uid}"] i`); if (!hp) continue;
      const card = hp.closest('.uc');
      const hit = u.hitAt && nowMs - u.hitAt < 400;
      if (hit && !card.classList.contains('hit')) { card.classList.add('hit'); setTimeout(() => card.classList.remove('hit'), 400); }
      const f = U.clamp(u.hp / u.maxHp, 0, 1);
      hp.style.width = f * 100 + '%';
      hp.style.background = f > .5 ? 'var(--ok)' : f > .25 ? 'var(--acc)' : 'var(--red)';
      const st = unitsEl.querySelector(`[data-st="${u.uid}"]`);
      let s = '';
      if (u.state === 'down') s = `<span class="bad">DOWN ${Math.ceil(u.bleedT)}s</span>`;
      else if (u.state === 'asleep') s = '<span class="blue">UNCONSCIOUS</span>';
      else if (u.state === 'dead') s = '<span class="bad">KIA</span>';
      else if (u.state === 'extracted') s = '<span class="ok">EXTRACTED</span>';
      else if (u.state === 'fultoned') s = '<span class="ok">FULTONED</span>';
      else if (u.state === 'captured') s = '<span class="bad">CAPTURED</span>';
      else if (u.act) s = `<span class="acc">${{ fulton: 'FULTON', revive: 'REVIVING', interact: 'WORKING' }[u.act.type] || 'BUSY'} ${Math.round(u.act.t / u.act.total * 100)}%</span>`;
      else s = `${u.manual ? '<span class="acc">◆ MANUAL</span>' : '<span class="blue">AI</span>'} · ${u.stance === 'stealth' ? '◌ stealth' : '● assault'}`;
      if (st.innerHTML !== s) st.innerHTML = s;
    }

    // actions
    const act = $('bh-act');
    if (b.phase === 'done') { act.innerHTML = `<button class="sm pri" data-act="bhReport">View report</button><button class="sm" data-act="bhLeave">Leave</button>`; }
    else {
      const sel = [...BRender.sel].map(id => Battle.unit(b, id)).filter(u => u && ALIVE(u));
      const stealthy = sel.length && sel.every(u => u.stance === 'stealth');
      const sup = Object.entries(SUPPORT_ABILITIES).map(([k, ab]) => {
        const why = Battle.supportReady(b, k);
        const hk = { supply: 'Z', smoke: 'C', sleepgas: 'V', strike: 'G' }[k];
        if (why === 'Not developed') return '';
        return `<button class="${BRender.targeting === k ? 'tgt' : ''}" data-act="bhSupport" data-k="${k}" ${why ? 'disabled' : ''} data-tip="${ab.name} — ${U.fmt(Battle.supportCost(k))} GMP · cooldown ${ab.cd}s">${hk} ${ab.name}${why && why !== 'Not developed' ? ' ' + why : ''}</button>`;
      }).join('');
      const html = `
        <button data-act="bhStance" ${sel.length ? '' : 'disabled'} data-tip="Stealth: slower, much harder to detect, holds fire. Assault: fast, fires at will. (S)">S ${stealthy ? 'Go Assault' : 'Go Stealth'}</button>
        <button data-act="bhHold" ${sel.length ? '' : 'disabled'} data-tip="Stop and hold position (H)">H Hold</button>
        ${b.kind !== 'defend' ? `<button data-act="bhRecall" data-tip="Send selected (or all) operatives to the LZ (X). They extract once objectives are complete — or if you abort.">X To LZ</button>
        <button class="danger" data-act="bhAbort" ${b.abort ? 'disabled' : ''} data-tip="Abort the mission: everyone heads to the LZ for extraction.">Abort</button>` : ''}
        ${sup}`;
      if (force || act._html !== html) { act.innerHTML = html; act._html = html; }
    }
    $('bh-hint').textContent = BRender.targeting ? `Click on the map to target ${SUPPORT_ABILITIES[BRender.targeting].name} · right-click or Esc to cancel`
      : 'Right-click: move · attack · fulton · revive · interact (ordered units go MANUAL)   |   Q: release to AI   |   Shift+drag: select   |   zoom out to leave';
  },

  key(e) {
    const b = HUD.b; if (!b) return false;
    const k = e.key.toLowerCase();
    const ops = HUD.ops(b).filter(ALIVE);
    if (/^[1-9]$/.test(k)) {
      const u = HUD.ops(b)[+k - 1];
      if (u && ALIVE(u)) { if (!e.shiftKey) BRender.sel.clear(); BRender.sel.add(u.uid); HUD.refresh(); }
      return true;
    }
    if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); BRender.sel = new Set(ops.map(u => u.uid)); HUD.refresh(); return true; }
    const map = { s: 'bhStance', h: 'bhHold', x: 'bhRecall', q: 'bhRelease', f: 'bhFollow' };
    if (map[k]) { ACT[map[k]]({}); return true; }
    const sup = { z: 'supply', c: 'smoke', v: 'sleepgas', g: 'strike' }[k];
    if (sup) { ACT.bhSupport({ k: sup }); return true; }
    if (k === 'tab') { e.preventDefault(); if (ops.length) { const ids = ops.map(u => u.uid); const cur = [...BRender.sel][0]; const n = ids[(ids.indexOf(cur) + 1) % ids.length]; BRender.sel = new Set([n]); const u = Battle.unit(b, n); MapView.map.panTo(U.m2ll(b.lat, b.lng, u.x, u.y)); HUD.refresh(); } return true; }
    return false;
  },
};

Object.assign(ACT, {
  bhLeave: () => UI.unfocus(true),
  bhFollow: () => { HUD.follow = !HUD.follow; Game.notify(HUD.follow ? 'CAMERA FOLLOW ON' : 'CAMERA FOLLOW OFF', 'Press F to toggle.', 'info', [], { ttl: 2 }); HUD.refresh(); },
  bhRelease: () => {
    const b = HUD.b; if (!b) return;
    let ids = [...BRender.sel].filter(id => { const u = Battle.unit(b, id); return u && u.manual; });
    if (!ids.length) ids = HUD.ops(b).map(u => u.uid);
    Battle.release(b, ids); HUD.refresh();
  },
  bhReport: () => { const b = HUD.b; if (b) ACT.showReport({ id: b.id }); },
  bhSel: (d, el, e) => {
    const b = HUD.b; if (!b) return;
    const uid = +d.uid; const u = Battle.unit(b, uid);
    if (!u) return;
    if (BRender.sel.size === 1 && BRender.sel.has(uid)) { MapView.map.panTo(U.m2ll(b.lat, b.lng, u.x, u.y)); return; }
    if (!e.shiftKey) BRender.sel.clear();
    if (ALIVE(u) || u.state === 'down' || u.state === 'asleep') BRender.sel.add(uid);
    HUD.refresh();
  },
  bhStance: () => {
    const b = HUD.b; if (!b) return;
    const sel = [...BRender.sel].map(id => Battle.unit(b, id)).filter(u => u && ALIVE(u));
    const to = sel.every(u => u.stance === 'stealth') ? 'assault' : 'stealth';
    Battle.setStance(b, sel.map(u => u.uid), to); HUD.refresh();
  },
  bhHold: () => { const b = HUD.b; if (b) { Battle.order(b, [...BRender.sel], { type: 'hold' }); HUD.refresh(); } },
  bhRecall: () => {
    const b = HUD.b; if (!b || !b.lz) return;
    let ids = [...BRender.sel];
    if (!ids.length) ids = HUD.ops(b).filter(ALIVE).map(u => u.uid);
    Battle.order(b, ids, { type: 'move', x: b.lz.x, y: b.lz.y });
    HUD.refresh();
  },
  bhAbort: () => {
    const b = HUD.b; if (!b) return;
    if (!confirm('Abort the mission? The squad will extract without completing objectives.')) return;
    b.abort = true; Battle.say(b, 'Mission aborted. All units to the LZ.', 'bad');
    ACT.bhRecall();
  },
  bhSupport: d => {
    const b = HUD.b; if (!b) return;
    if (BRender.targeting === d.k) { BRender.targeting = null; HUD.refresh(); return; }
    const why = Battle.supportReady(b, d.k);
    if (why) { Game.notify('UNAVAILABLE', `${SUPPORT_ABILITIES[d.k].name}: ${why}`, 'bad'); return; }
    BRender.targeting = d.k; HUD.refresh();
  },
});
