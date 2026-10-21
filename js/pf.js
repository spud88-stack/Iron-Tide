'use strict';
// ---------- rival Private Forces ----------
const PF = {
  byId(id) { return G.pfs.find(p => p.id === id); },
  fobById(fid) { for (const p of G.pfs) { const f = p.fobs.find(f => f.id === fid); if (f) return [p, f]; } return [null, null]; },

  genName() {
    for (let i = 0; i < 30; i++) {
      const n = `${U.pick(PF_ADJ)} ${U.pick(PF_NOUN)}`;
      if (!G.pfs.some(p => p.name.startsWith(n))) return `${n} ${U.pick(PF_SUFFIX)}`;
    }
    return `Unit ${U.randi(100, 999)} ${U.pick(PF_SUFFIX)}`;
  },

  generateAll(n) {
    const free = U.shuffle(ZONES.filter(z => z.id !== G.base.zone).map(z => z.id));
    for (let i = 0; i < n; i++) {
      const tier = U.clamp(Math.round(1 + (i / n) * 9 + U.gauss(0, 0.8)), 1, 10);
      const p = PF.gen(tier);
      const nf = U.clamp(Math.round(tier / 3 + U.rand(0, 1.2)), 1, 4);
      for (let k = 0; k < nf && free.length; k++) p.fobs.push(PF.genFob(p, free.pop(), k));
      G.pfs.push(p);
    }
  },

  gen(tier) {
    const name = PF.genName();
    const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('');
    const np = NAME_POOLS[U.pick(NATIONS)[1]];
    return {
      id: Game.id(), name, initials, tier,
      emblem: U.randi(1, 2e9),
      leader: { name: `${U.pick(np.f)} ${U.pick(np.l)}`, callsign: `${U.pick(CALL_ADJ)} ${U.pick(CALL_NOUN)}` },
      points: Math.round(tier * 1200 + U.rand(-300, 500)),
      aggression: U.rand(0.2, 1),
      hostility: U.randi(0, 25),
      staff: Math.round(30 + tier * 25 + U.rand(0, 40)),
      res: { gmp: Math.round(100000 * tier * U.rand(0.6, 1.4)), fuel: 600 * tier, bio: 400 * tier, common: 1500 * tier, minor: 500 * tier, precious: 120 * tier },
      fobs: [],
      known: tier <= 3 || U.chance(0.4),
      wins: 0, losses: 0,
      motto: U.pick(['No flag. No nation.', 'Profit is the only truth.', 'We are the tide.', 'Paid in full.', 'The contract is sacred.', 'Leave no witness.', 'For the soldiers, not the states.', 'War is a market.']),
    };
  },

  genFob(p, zoneId, idx) {
    const z = ZONE[zoneId];
    const plat = U.clamp(Math.round(1 + p.tier / 3 + U.rand(-0.5, 1)), 1, 4);
    const t = p.tier;
    return {
      id: Game.id(), name: idx === 0 ? `${p.initials} Main` : `${p.initials} FOB-${idx}`, zone: zoneId,
      lat: z.lat + U.rand(-0.6, 0.6), lng: z.lng + U.rand(-0.6, 0.6),
      plat,
      sec: Math.round(3 + plat * 1.5 + t * 0.5),
      secLvl: Math.round(8 + t * 8 + U.rand(-4, 6)),
      cams: t >= 2 ? plat * U.randi(1, 2) + Math.floor(t / 3) : 0,
      uavs: t >= 4 ? Math.ceil(plat / 2) + Math.floor(t / 6) : 0,
      mines: t >= 3 ? plat * U.randi(2, 4) : 0,
      lethal: U.chance(0.3 + t * 0.05),
      scouted: false, lastRaid: -99999,
    };
  },

  league(points) { let l = LEAGUES[0][1]; for (const [p, n] of LEAGUES) if (points >= p) l = n; return l; },

  leaderboard() {
    const rows = G.pfs.map(p => ({ name: p.name, points: p.points, pf: p, emblem: Art.emblem(p.emblem, p.initials) }));
    rows.push({ name: G.base.name, points: G.points, me: true, emblem: Art.emblem(G.base.emblemSeed, PF.myInitials()) });
    rows.sort((a, b) => b.points - a.points);
    return rows;
  },
  myInitials() { return G.base.name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase(); },
  myRank() { return PF.leaderboard().findIndex(r => r.me) + 1; },

  // what intel reveals about a rival FOB
  revealed(f) { return f.scouted || RnD.has('satnet'); },

  scoutCost(p) { return { gmp: 8000 + p.tier * 3000, fuel: 60 }; },
  scout(fid) {
    const [p, f] = PF.fobById(fid); if (!f) return;
    if (G.base.plat.intel === 0) { Game.notify('NO INTEL TEAM', 'Build an Intel platform first.', 'bad'); return; }
    const c = PF.scoutCost(p);
    if (!Base.canAfford(c)) { Game.notify('INSUFFICIENT', 'Not enough resources to scout.', 'bad'); return; }
    if (G.scouts.some(s => s.fid === fid)) return;
    Base.spend(c);
    const hrs = Math.max(1, 6 - Staff.level('intel') / 8);
    G.scouts.push({ fid, at: G.time + hrs * 60 });
    p.known = true;
    Game.log(`Intel team dispatched to scout ${f.name} (${p.name}). ETA ${U.fmtDur(hrs * 60)}.`, 'info');
    UI.dirty();
  },

  hourly() {
    // scouting results
    for (const s of [...G.scouts]) {
      if (G.time < s.at) continue;
      G.scouts.splice(G.scouts.indexOf(s), 1);
      const [p, f] = PF.fobById(s.fid);
      if (f) { f.scouted = true; Game.log(`Scouting report: ${f.name} — ${f.sec} guards (≈${Staff.grade(f.secLvl)}), ${f.cams} cameras, ${f.uavs} UAVs, ${f.mines} mines.`, 'ok'); Game.notify('SCOUTING COMPLETE', `${f.name} defenses revealed.`, 'ok'); MapView.refreshStatic(); }
    }
    // incoming threats
    for (const t of [...G.threats]) {
      if (G.time < t.at) continue;
      G.threats.splice(G.threats.indexOf(t), 1);
      PF.launchInvasion(t);
    }
    // grow & plot
    const myTargets = [...G.fobs.filter(f => !f.build).map(f => f.id)];
    for (const p of G.pfs) {
      p.res.gmp += 1500 * p.tier;
      for (const k of MAT_KEYS) p.res[k] += Math.round(10 * p.tier);
      if (G.threats.some(t => t.pfId === p.id)) continue;
      const h = p.hostility / 100;
      let chance = p.aggression * (0.0015 + h * h * 0.03);
      if (!myTargets.length) chance = h > 0.6 ? chance * 0.5 : 0;   // without FOBs, only enraged PFs strike Mother Base
      if (G.time < 1440 * 1.5) chance = 0;                       // grace period
      if (U.chance(chance)) {
        const target = (myTargets.length && (h < 0.75 || U.chance(0.6))) ? U.pick(myTargets) : 'mb';
        if (G.battles.some(b => b.kind === 'defend' && b.target === target)) continue;
        const warn = 10 + Staff.level('intel') * 0.6 + (RnD.has('intercept') ? 30 : 0);
        G.threats.push({ pfId: p.id, target, at: G.time + warn });
        const tname = target === 'mb' ? G.base.name : G.fobs.find(f => f.id === target).name;
        Game.log(`Signal intercepted: ${p.name} is preparing an incursion against ${tname}. ETA ${U.fmtDur(warn)}.`, 'bad');
        Game.notify('INCURSION WARNING', `${p.name} → ${tname}. ETA ${U.fmtDur(warn)}. Assign security now.`, 'bad', [{ label: 'Security', act: 'openPanel', args: { p: 'online' } }]);
      }
    }
  },

  daily() {
    for (const p of G.pfs) {
      p.hostility = Math.max(0, p.hostility - 3);
      p.points += Math.round(U.rand(-20, 60) + p.tier * 8);
      // PF-vs-PF flavor
      if (U.chance(0.06 * p.aggression)) {
        const v = U.pick(G.pfs.filter(q => q !== p));
        if (v) {
          const win = U.chance(0.5 + (p.tier - v.tier) * 0.08);
          if (win) { p.points += 120; v.points = Math.max(0, v.points - 80); p.wins++; v.losses++; }
          else { v.points += 100; p.points = Math.max(0, p.points - 60); p.losses++; v.wins++; }
          Game.log(`${p.name} ${win ? 'successfully raided' : 'was repelled from'} a ${v.name} FOB.`, 'info');
        }
      }
      // FOB defenses improve slowly
      if (U.chance(0.1)) { const f = U.pick(p.fobs); if (f) { f.secLvl += 1; if (U.chance(0.3)) f.sec++; } }
    }
  },

  launchInvasion(t) {
    const p = PF.byId(t.pfId); if (!p) return;
    const fob = t.target === 'mb' ? null : G.fobs.find(f => f.id === t.target);
    if (t.target !== 'mb' && !fob) return;
    Battle.createDefense(p, t.target);
  },

  // FOB security / intruders as unit specs for battles
  pfStaffLevel(p, f) { return f ? f.secLvl : 10 + p.tier * 8; },
};
