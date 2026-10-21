'use strict';
// ---------- contracts, deployments, mission results ----------
const Contracts = {
  byId(id) { return G.contracts.find(c => c.id === id); },
  dep(id) { return G.deps.find(d => d.id === id); },
  open() { return G.contracts.filter(c => c.status === 'open'); },

  gen(maxDiff) {
    const day = G.time / 1440;
    const city = U.weighted(CITIES, c => 0.3 + c[4] * 1.6);
    const type = U.weighted(Object.keys(CONTRACT_TYPES), t => CONTRACT_TYPES[t].w);
    let diff = U.clamp(Math.round(city[4] * 6 + U.rand(-1.5, 2.5) + Math.min(3, day / 6)), 1, 10);
    if (maxDiff) diff = Math.min(diff, maxDiff);
    const known = G.pfs.filter(p => p.known);
    const pf = known.length && U.chance(0.16) ? U.pick(known) : null;
    const faction = pf ? pf.name : U.pick(ENEMY_FACTIONS);
    let subject, title;
    switch (type) {
      case 'eliminate': subject = U.pick(TARGET_ROLES); title = `Eliminate the ${subject}`; break;
      case 'extract': subject = U.pick(HOSTAGE_ROLES); title = `Extract the ${subject}`; break;
      case 'sabotage': subject = U.pick(SABOTAGE_TARGETS); title = `Sabotage the ${subject}`; break;
      case 'intel': subject = U.pick(INTEL_TARGETS); title = `Recover ${subject}`; break;
      default: subject = U.pick(['a safehouse', 'a relay station', 'an embassy annex', 'a field hospital', 'a fuel depot']); title = `Hold ${subject}`;
    }
    const gmp = Math.round((16000 + diff * diff * 8500) * U.rand(0.85, 1.25) / 1000) * 1000;
    const res = {};
    const mats = U.shuffle([...MAT_KEYS]).slice(0, U.randi(1, 2));
    for (const m of mats) res[m] = Math.round(diff * (m === 'precious' ? 25 : m === 'minor' ? 60 : 120) * U.rand(0.7, 1.3));
    return {
      id: Game.id(), type, title, subject,
      client: U.pick(CLIENTS), faction, pfId: pf ? pf.id : null,
      city: city[0], country: city[1],
      lat: city[2] + U.rand(-0.018, 0.018), lng: city[3] + U.rand(-0.018, 0.018),
      diff, enemies: Math.round(4 + diff * 1.3 + U.rand(0, 2)),
      reward: { gmp, res, heroism: diff * 45, points: diff * 30 },
      created: G.time, expires: G.time + U.randi(20, 64) * 60,
      status: 'open',
    };
  },

  fill(initial) {
    const target = 11;
    let guard = 0;
    while (Contracts.open().length < target && guard++ < 40) {
      G.contracts.push(Contracts.gen(initial && Contracts.open().length < 5 ? 3 : null));
    }
    MapView && MapView.refreshStatic && MapView.ready && MapView.refreshStatic();
  },

  hourly() {
    let changed = false;
    for (const c of [...G.contracts]) {
      if (c.status === 'open' && G.time > c.expires) { G.contracts.splice(G.contracts.indexOf(c), 1); changed = true; }
      if (c.status === 'closed') { G.contracts.splice(G.contracts.indexOf(c), 1); changed = true; }
    }
    if (Contracts.open().length < 11 && U.chance(0.55)) { G.contracts.push(Contracts.gen()); changed = true; }
    if (changed) MapView.refreshStatic();
  },

  // intel estimate text
  intel(c) {
    const lvl = Staff.level('intel') + Staff.inDept('intel').filter(s => Staff.has(s, 'linguist')).length * 3;
    const exact = RnD.has('satnet') || lvl >= c.diff * 5;
    if (exact) return `${c.enemies} hostiles`;
    const spread = Math.max(2, Math.round(8 - lvl / 4));
    return `${Math.max(2, c.enemies - spread)}–${c.enemies + spread} hostiles (est.)`;
  },

  // ----- deployments -----
  origins() {
    const o = [{ id: 'mb', name: G.base.name, lat: G.base.lat, lng: G.base.lng }];
    for (const f of G.fobs) if (!f.build || f.build.what !== 'fob') o.push({ id: f.id, name: f.name, lat: f.lat, lng: f.lng });
    return o;
  },
  nearestOrigin(lat, lng) {
    return Contracts.origins().reduce((best, o) => {
      const d = U.haversine(o.lat, o.lng, lat, lng);
      return !best || d < best.d ? { ...o, d } : best;
    }, null);
  },
  travelMins(km, squad) {
    let m = 30 + km / 22;
    if (squad && squad.some(s => { const st = Staff.byId(s.sid); return st && Staff.has(st, 'pilot'); })) m *= 0.75;
    m *= 1 - Math.min(0.3, Staff.level('support') / 200);
    return Math.min(420, Math.round(m));
  },
  deployCost(km, n) {
    const sup = 1 - Math.min(0.4, Staff.level('support') / 120);
    return { gmp: Math.round((3000 + n * 1200) * sup), fuel: Math.round((40 + km / 30 + n * 10) * sup) };
  },

  deploy({ kind, contractId, pfFobId, squad, opts }) {
    let to, title, pfId = null;
    if (kind === 'contract') {
      const c = Contracts.byId(contractId);
      if (!c || c.status !== 'open') { Game.notify('UNAVAILABLE', 'Contract no longer available.', 'bad'); return null; }
      to = { lat: c.lat, lng: c.lng, name: c.city };
      title = c.title;
    } else {
      const [p, f] = PF.fobById(pfFobId);
      if (!f) return null;
      to = { lat: f.lat, lng: f.lng, name: f.name };
      title = `Infiltrate ${f.name}`;
      pfId = p.id;
    }
    if (!squad.length) { Game.notify('NO SQUAD', 'Select at least one operative.', 'bad'); return null; }
    for (const m of squad) { const s = Staff.byId(m.sid); if (!s || !Staff.deployable(s)) { Game.notify('UNAVAILABLE', 'An operative is no longer available.', 'bad'); return null; } }
    const o = Contracts.nearestOrigin(to.lat, to.lng);
    const cost = Contracts.deployCost(o.d, squad.length);
    if (!Base.canAfford(cost)) { Game.notify('INSUFFICIENT', 'Not enough GMP or fuel for this deployment.', 'bad'); return null; }
    Base.spend(cost);
    const travel = Contracts.travelMins(o.d, squad);
    const used = new Set(G.deps.map(d => d.name));
    const name = 'Team ' + (NATO.find(n => !used.has('Team ' + n)) || G.deps.length + 1);
    const dep = {
      id: Game.id(), name, kind, title, contractId: contractId || null, pfFobId: pfFobId || null, pfId,
      squad, opts, from: { lat: o.lat, lng: o.lng, name: o.name }, to,
      depart: G.time, arrive: G.time + travel, travel, state: 'outbound', battleId: null,
    };
    G.deps.push(dep);
    for (const m of squad) Staff.byId(m.sid).status = 'deployed';
    if (kind === 'contract') { const c = Contracts.byId(contractId); c.status = 'taken'; c.depId = dep.id; Terrain.prefetch(c.lat, c.lng); }
    Game.log(`${name} departed ${o.name} for ${to.name} (${title}). ETA ${U.fmtDur(travel)}.`, 'info');
    Staff.recalc();
    MapView.refreshStatic();
    UI.dirty();
    return dep;
  },

  // per-frame checks
  update() {
    for (const dep of [...G.deps]) {
      if (dep.state === 'outbound' && G.time >= dep.arrive) {
        dep.state = 'engaged';
        let b;
        if (dep.kind === 'contract') b = Battle.createContract(dep, Contracts.byId(dep.contractId));
        else { const [p, f] = PF.fobById(dep.pfFobId); b = p ? Battle.createInfiltration(dep, p, f) : null; }
        if (!b) { Contracts.orphanedDeployment(dep); continue; }
        dep.battleId = b.id;
        Game.notify(`${dep.name.toUpperCase()} ON SITE`, `${dep.title} — ${dep.to.name}. The squad AI will proceed unless you take command.`, 'info',
          [{ label: 'Take Command', act: 'focusBattle', args: { id: b.id } }], { ttl: 14 });
        if (G.settings.focusOnArrival) UI.focusBattle(b.id);
        MapView.refreshStatic();
      } else if (dep.state === 'inbound' && G.time >= dep.returnAt) {
        for (const m of dep.squad) { const s = Staff.byId(m.sid); if (s && s.status === 'deployed') s.status = 'active'; }
        G.deps.splice(G.deps.indexOf(dep), 1);
        Game.log(`${dep.name} has returned to ${dep.from.name}.`, 'info');
        Staff.recalc();
        MapView.refreshStatic();
        UI.dirty();
      }
    }
  },

  orphanedDeployment(dep) {
    dep.state = 'inbound';
    dep.returnAt = G.time + 30;
    if (dep.contractId) { const c = Contracts.byId(dep.contractId); if (c) c.status = 'closed'; }
  },

  missionScore(b, success) {
    const r = b.result;
    let s = success ? 60 : 15;
    if (b.stats.alerts === 0) s += 15;
    if (b.stats.kills === 0) s += 5;
    s += Math.min(10, r.recruits.length * 2);
    s -= r.kia.length * 15 + r.injured.length * 4;
    if (b.time < 240) s += 10; else if (b.time < 420) s += 5;
    s = U.clamp(s, 0, 100);
    const grade = s >= 90 ? 'S' : s >= 75 ? 'A' : s >= 60 ? 'B' : s >= 45 ? 'C' : s >= 30 ? 'D' : 'E';
    return { score: s, grade };
  },

  // ----- result application -----
  onBattleEnd(b) {
    const r = b.result;
    const success = r.success;
    // operatives
    const kia = [], injured = [], mia = [];
    for (const u of b.units) {
      if (u.side !== 'player' || !u.staffId) continue;
      const s = Staff.byId(u.staffId); if (!s) continue;
      s.kills += u.kills || 0; s.sleeps += u.sleeps || 0; s.fultons += u.fultons || 0; s.missions++;
      if (u.state === 'dead') { kia.push(s.name); Staff.kill(s, `killed in action — ${b.title}`); continue; }
      if (u.state === 'captured') { mia.push(s.name); Staff.kill(s, `captured by ${b.enemyName} — ${b.title}`); continue; }
      const xp = (success ? 1.2 : 0.6) + (u.kills + u.sleeps) * 0.15;
      Staff.grow(s, xp);
      const hurt = u.state === 'down' || u.state === 'fultoned' || u.hp < u.maxHp * 0.5;
      if (hurt) { injured.push(s.name); Staff.injure(s, u.state === 'down' || u.state === 'fultoned' ? U.randi(24, 60) : U.randi(6, 18)); }
      else if (b.kind === 'defend') s.status = 'active';
      s.morale = U.clamp(s.morale + (success ? 6 : -8), 0, 100);
    }
    r.kia = kia; r.injured = injured; r.mia = mia;
    // recruits from fulton
    const recruits = [];
    for (const f of r.fultoned) {
      if (f.kind === 'ally') continue;
      const host = f.kind === 'hostage';
      const st = Staff.gen({ level: f.lvl, origin: host ? 'rescued' : 'fulton', dept: host ? 'waiting' : 'brig', loyalty: host ? 100 : U.randi(10, 45), troubleChance: host ? 0.03 : 0.1 });
      if (host && !U.chance(0.6)) continue;
      if (Staff.recruit(st)) recruits.push(st);
    }
    r.recruits = recruits;
    G.stats.kills += b.stats.kills; G.stats.sleeps += b.stats.sleeps; G.stats.fultons += r.fultoned.length;

    const sc = Contracts.missionScore(b, success);
    r.score = sc.score; r.grade = sc.grade;
    r.payout = {};

    if (b.kind === 'contract') {
      G.stats.missions++;
      const c = Contracts.byId(b.contractId);
      if (c) {
        c.status = 'closed';
        if (success) {
          G.stats.success++;
          const neg = Math.min(0.25, G.staff.filter(s => s.dept !== 'brig' && Staff.has(s, 'negotiator')).length * 0.05);
          let mult = (0.7 + sc.score / 200) * (1 + neg);
          if (c.type === 'eliminate' && r.targetFulton) mult *= 1.5;
          r.payout = { gmp: Math.round(c.reward.gmp * mult), ...c.reward.res };
          Base.give(r.payout);
          G.heroism += c.reward.heroism;
          G.points += c.reward.points;
          if (c.pfId) { const p = PF.byId(c.pfId); if (p) { p.hostility = Math.min(100, p.hostility + 12); p.points = Math.max(0, p.points - 40); } }
        } else {
          G.heroism = Math.max(0, G.heroism - c.diff * 20);
          G.points = Math.max(0, G.points - c.diff * 10);
        }
      }
      if (b.stats.kills > 6) G.heroism = Math.max(0, G.heroism - (b.stats.kills - 6) * 5);
    } else if (b.kind === 'infiltrate') {
      G.stats.infiltrations++;
      const p = PF.byId(b.pfId);
      const [, f] = PF.fobById(b.pfFobId);
      if (p) {
        p.hostility = Math.min(100, p.hostility + (success ? 35 : 20));
        if (f) f.lastRaid = G.time;
        if (success) {
          const pct = 0.08 + p.tier * 0.006;
          r.payout = {};
          for (const k of RES_KEYS) { const amt = Math.round(p.res[k] * pct); r.payout[k] = amt; p.res[k] -= amt; }
          Base.give(r.payout);
          G.points += 150 + p.tier * 90;
          p.points = Math.max(0, p.points - (60 + p.tier * 30));
          p.losses++;
          G.heroism += 150;
        } else {
          G.points = Math.max(0, G.points - 60);
          p.points += 80; p.wins++;
        }
        p.staff = Math.max(10, p.staff - r.fultoned.length);
      }
    } else if (b.kind === 'defend') {
      G.stats.defenses++;
      const p = PF.byId(b.pfId);
      const fob = G.fobs.find(f => f.id === b.target);
      if (success) {
        G.points += 160 + (p ? p.tier * 40 : 0);
        G.heroism += 120;
        if (p) { p.points = Math.max(0, p.points - 50); p.losses++; p.hostility = Math.max(0, p.hostility - 20); }
        if (fob) fob.defended++;
      } else {
        const pct = r.coreHacked ? 0.12 : 0.04;
        r.lost = {};
        for (const k of RES_KEYS) { const amt = Math.round(Math.max(0, G.res[k]) * pct); r.lost[k] = amt; G.res[k] -= amt; if (p) p.res[k] += amt; }
        G.points = Math.max(0, G.points - 120);
        if (p) { p.points += 140; p.wins++; p.hostility = Math.max(0, p.hostility - 30); }
        if (fob) fob.lost++;
      }
      for (const u of b.units) if (u.side === 'player' && u.staffId) { const s = Staff.byId(u.staffId); if (s && s.status === 'deployed') s.status = 'active'; }
    }

    // deployment heads home
    const dep = G.deps.find(d => d.battleId === b.id);
    if (dep) { dep.state = 'inbound'; dep.returnAt = G.time + dep.travel; dep.result = success; }

    const verdict = success ? 'MISSION COMPLETE' : 'MISSION FAILED';
    Game.log(`${verdict}: ${b.title} — grade ${sc.grade}. ${kia.length ? 'KIA: ' + kia.join(', ') + '.' : ''}`, success ? 'ok' : 'bad');
    Game.notify(verdict, `${b.title} — grade ${sc.grade}`, success ? 'ok' : 'bad', [{ label: 'Report', act: 'showReport', args: { id: b.id } }], { ttl: 12 });
    G.reports = G.reports || [];
    G.reports.unshift({ id: b.id, title: b.title, kind: b.kind, t: G.time, success, grade: sc.grade, score: sc.score, payout: r.payout, lost: r.lost || null, kia, injured, mia, recruits: recruits.map(s => `${s.name} (${Staff.grade(Staff.bestVal(s))} ${DEPTS[Staff.best(s)].short}${s.dept === 'brig' ? ', brig' : ''})`), kills: b.stats.kills, sleeps: b.stats.sleeps, alerts: b.stats.alerts, time: b.time, stolenStaff: r.stolenStaff || [] });
    if (G.reports.length > 30) G.reports.length = 30;
    Staff.recalc();
    MapView.refreshStatic();
    UI.dirty();
  },
};
