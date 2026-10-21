'use strict';
// ---------- Mother Base, platforms, resources, FOBs ----------
const Base = {
  maxPlat(k) {
    if (k === 'command') return 4;
    if (k === 'quarantine') return 2;
    return Math.min(4, G.base.plat.command + 1);
  },

  costMult() { return RnD.has('autofab') ? 0.85 : 1; },

  buildCost(k, n) {
    const m = k === 'command' ? 1.8 : k === 'quarantine' ? 0.6 : 1;
    const cm = Base.costMult();
    return {
      gmp: Math.round(55000 * m * Math.pow(n, 1.75) * cm),
      common: Math.round(600 * m * n * cm),
      minor: Math.round((n > 1 ? 160 * m * n : 0) * cm),
      precious: Math.round((n > 2 ? 45 * m * n : 0) * cm),
      hours: Math.round(3 * m * n + 2),
    };
  },

  canAfford(cost) { return RES_KEYS.every(k => !cost[k] || G.res[k] >= cost[k]); },
  spend(cost) { for (const k of RES_KEYS) if (cost[k]) G.res[k] -= cost[k]; Bus.emit('res'); },
  give(res, mult = 1) { for (const k of RES_KEYS) if (res[k]) G.res[k] += Math.round(res[k] * mult); Bus.emit('res'); },

  buildSlots() { return 1 + Math.floor(Staff.level('basedev') / 25); },
  activeBuilds() { return G.base.builds.length + G.fobs.reduce((n, f) => n + (f.build ? 1 : 0), 0); },

  buildSpeed() {
    const eng = Staff.inDept('basedev').filter(s => Staff.has(s, 'engineer')).length;
    return 1 + Staff.level('basedev') / 80 + Math.min(0.5, eng * 0.1);
  },

  canBuild(k) {
    const n = G.base.plat[k] + 1;
    if (G.base.builds.some(b => b.k === k)) return 'Already under construction';
    if (n > Base.maxPlat(k)) return k === 'command' ? 'Maximum platforms' : 'Requires more Command platforms';
    if (Base.activeBuilds() >= Base.buildSlots()) return 'All construction crews busy';
    if (!Base.canAfford(Base.buildCost(k, n))) return 'Insufficient resources';
    return null;
  },

  startBuild(k) {
    const why = Base.canBuild(k);
    if (why) { Game.notify('CANNOT BUILD', why, 'bad'); return; }
    const n = G.base.plat[k] + 1;
    const c = Base.buildCost(k, n);
    Base.spend(c);
    G.base.builds.push({ k, n, left: c.hours, total: c.hours });
    Game.log(`Construction started: ${PLATFORM_NAME[k]} platform ${n}.`, 'info');
    UI.dirty();
  },

  processRate(k) {
    let r = 12 + Staff.level('basedev') * 1.6;
    if (RnD.has('refinery')) r *= 1.5;
    const st = Staff.inDept('basedev');
    if ((k === 'common' || k === 'minor' || k === 'precious') && st.some(s => Staff.has(s, 'metallurgist'))) r *= 1.15;
    if ((k === 'fuel' || k === 'bio') && st.some(s => Staff.has(s, 'biochemist'))) r *= 1.15;
    if (k === 'precious') r *= 0.25; else if (k === 'minor') r *= 0.5;
    return r;
  },

  hourly() {
    const sp = Base.buildSpeed();
    for (const b of [...G.base.builds]) {
      b.left -= sp;
      if (b.left <= 0) {
        G.base.builds.splice(G.base.builds.indexOf(b), 1);
        G.base.plat[b.k] = b.n;
        Game.log(`${PLATFORM_NAME[b.k]} platform ${b.n} completed.`, 'ok');
        Game.notify('CONSTRUCTION COMPLETE', `${PLATFORM_NAME[b.k]} platform ${b.n} is operational.`, 'ok', [], { sound: 'chime' });
        Staff.recalc();
      }
    }
    for (const f of G.fobs) {
      if (!f.build) continue;
      f.build.left -= sp;
      if (f.build.left <= 0) {
        const what = f.build.what;
        f.build = null;
        if (what === 'fob') { Game.log(`FOB ${f.name} is online.`, 'ok'); Game.notify('FOB ONLINE', `${f.name} established in the ${ZONE[f.zone].name}.`, 'ok'); }
        else { f.plat++; Game.log(`${f.name}: platform ${f.plat} completed.`, 'ok'); }
        MapView.refreshStatic();
      }
    }
    // processing
    for (const k of MAT_KEYS) {
      const amt = Math.min(G.raw[k], Base.processRate(k));
      G.raw[k] -= amt; G.res[k] += amt;
    }
  },

  dailyBreakdown() {
    const devL = Staff.level('basedev');
    const fobPlat = G.fobs.filter(f => !f.build).reduce((n, f) => n + f.plat, 0);
    const income = Math.round(4000 + devL * 450 + fobPlat * 3500);
    const salaries = Math.round(G.staff.reduce((n, s) => n + (s.dept === 'brig' ? 15 : 25 + Staff.bestVal(s) * 2.2), 0));
    const platCount = PLATFORM_KEYS.reduce((n, k) => n + G.base.plat[k], 0) + fobPlat;
    const upkeep = salaries + platCount * 450;
    return { income, salaries, platUpkeep: platCount * 450, upkeep, net: income - upkeep };
  },

  daily() {
    const b = Base.dailyBreakdown();
    G.res.gmp += b.net;
    G.dayStats = { income: b.income, upkeep: b.upkeep };
    // raw collection: Mother Base & FOBs
    const devL = Staff.level('basedev');
    const z = ZONE[G.base.zone];
    const mbYield = { fuel: 40 + devL * 6, bio: 30 + devL * 5, common: 80 + devL * 10, minor: 20 + devL * 3, precious: 5 + devL * 0.8 };
    if (RnD.has('hydro')) mbYield.bio += devL * 3;
    for (const k of MAT_KEYS) G.raw[k] += Math.round(mbYield[k] * (z ? z.bias[k] : 1));
    for (const f of G.fobs) {
      if (f.build && f.build.what === 'fob') continue;
      const zb = ZONE[f.zone].bias;
      const y = { fuel: 160, bio: 120, common: 260, minor: 80, precious: 24 };
      for (const k of MAT_KEYS) G.raw[k] += Math.round(y[k] * f.plat * zb[k]);
    }
    if (G.res.gmp < 0) {
      Game.notify('GMP DEFICIT', 'Mother Base is in debt. Morale is falling.', 'bad');
    }
  },

  // ----- FOBs -----
  fobCost() {
    const n = G.fobs.length;
    const cm = Base.costMult();
    return { gmp: Math.round(350000 * (n + 1) * cm), common: Math.round(3000 * (n + 1) * cm), minor: Math.round(900 * (n + 1) * cm), precious: Math.round(250 * (n + 1) * cm), hours: 18 + n * 6 };
  },
  fobPlatCost(f) {
    const n = f.plat + 1, cm = Base.costMult();
    return { gmp: Math.round(120000 * n * cm), common: Math.round(1600 * n * cm), minor: Math.round(500 * n * cm), precious: Math.round(120 * n * cm), hours: 6 * n };
  },
  maxFobs() { return Math.min(4, G.base.plat.command); },
  zoneTaken(id) {
    if (G.base.zone === id) return 'Mother Base';
    const f = G.fobs.find(f => f.zone === id); if (f) return f.name;
    for (const p of G.pfs) for (const pf of p.fobs) if (pf.zone === id) return p.name;
    return null;
  },
  canBuildFob() {
    if (G.fobs.length >= Base.maxFobs()) return `Max FOBs (${Base.maxFobs()}) — build Command platforms`;
    if (Base.activeBuilds() >= Base.buildSlots()) return 'All construction crews busy';
    if (!Base.canAfford(Base.fobCost())) return 'Insufficient resources';
    return null;
  },
  buildFob(zoneId) {
    const why = Base.canBuildFob(); if (why) { Game.notify('CANNOT BUILD FOB', why, 'bad'); return; }
    if (Base.zoneTaken(zoneId)) { Game.notify('ZONE OCCUPIED', 'Another force holds that zone.', 'bad'); return; }
    const c = Base.fobCost();
    Base.spend(c);
    const z = ZONE[zoneId];
    const f = { id: Game.id(), name: `FOB ${NATO[G.fobs.length + 1] || G.fobs.length + 1}`, zone: zoneId, lat: z.lat, lng: z.lng, plat: 1, build: { what: 'fob', left: c.hours, total: c.hours }, defended: 0, lost: 0 };
    G.fobs.push(f);
    Game.log(`Construction of ${f.name} begun in the ${z.name}.`, 'info');
    MapView.refreshStatic();
    UI.dirty();
  },
  expandFob(f) {
    if (f.build) return;
    if (f.plat >= 4) { Game.notify('MAXED', 'FOB is at maximum size.', 'bad'); return; }
    if (Base.activeBuilds() >= Base.buildSlots()) { Game.notify('BUSY', 'All construction crews busy.', 'bad'); return; }
    const c = Base.fobPlatCost(f);
    if (!Base.canAfford(c)) { Game.notify('INSUFFICIENT', 'Not enough resources.', 'bad'); return; }
    Base.spend(c);
    f.build = { what: 'plat', left: c.hours, total: c.hours };
    UI.dirty();
  },
  // FOB security staff
  security(where) { return G.staff.filter(s => s.sec === where); },
  secCap(where) { if (where === 'mb') return 8; const f = G.fobs.find(f => f.id === where); return f ? 2 + f.plat * 2 : 0; },

  // defensive layout values used when a base is attacked
  defenses(plat) {
    return {
      cams: RnD.has('cam1') ? plat * (RnD.has('cam2') ? 3 : 1) + 1 : 0,
      uavs: RnD.has('uav1') ? Math.ceil(plat / 2) * (RnD.has('uav2') ? 2 : 1) : 0,
      mines: RnD.has('mines1') ? plat * (RnD.has('mines2') ? 6 : 3) : 0,
      gear: RnD.has('secgear2') ? 2 : RnD.has('secgear1') ? 1 : 0,
    };
  },

  heroismAdd(n, why) {
    G.heroism = Math.max(0, G.heroism + n);
  },
};
