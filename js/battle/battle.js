'use strict';
// ---------- RTS battle simulation ----------
const STEP = 0.05;
const ALIVE = u => u.state === 'ok';
const ACTIVE = u => u.state === 'ok' || u.state === 'asleep' || u.state === 'down';

const Battle = {
  byId(id) { return G.battles.find(b => b.id === id); },
  unit(b, uid) { return b.units.find(u => u.uid === uid); },

  skeleton(kind, title, lat, lng, extra = {}) {
    return {
      id: Game.id(), kind, title, lat, lng, phase: 'loading', time: 0, realT: 0,
      units: [], objectives: [], fx: [], smokes: [], gas: [], mines: [], drops: [], strikes: [],
      lz: null, alert: 0, alertT: 0, lastKnown: null, commanded: false, aiAssist: false,
      stats: { kills: 0, sleeps: 0, alerts: 0 }, result: null, uidN: 1, waves: 0, maxWaves: 2, reinfT: null,
      timeLimit: 1200, abort: false, cd: {}, aiT: 0, percT: 0, nightT: 0,
      night: U.isNight(G.time, lng), env: 'rural', opts: { fulton: true, stance: 'stealth' },
      ...extra,
    };
  },

  // ---------- creation ----------
  createContract(dep, c) {
    if (!c) return null;
    const b = Battle.skeleton('contract', c.title, c.lat, c.lng, {
      contractId: c.id, depId: dep.id, ctype: c.type, diff: c.diff, enemyName: c.faction, place: c.city,
      squad: dep.squad, opts: { ...dep.opts }, enemies: c.enemies, subject: c.subject, team: dep.name,
      maxWaves: c.diff >= 7 ? 3 : 2,
    });
    G.battles.push(b);
    Battle.init(b, { urban: true });
    return b;
  },

  createInfiltration(dep, p, f) {
    const b = Battle.skeleton('infiltrate', `Infiltrate ${f.name}`, f.lat, f.lng, {
      pfId: p.id, pfFobId: f.id, depId: dep.id, diff: Math.min(10, p.tier + 1), enemyName: p.name, place: f.name,
      squad: dep.squad, opts: { ...dep.opts }, team: dep.name, maxWaves: 1, timeLimit: 1100,
    });
    G.battles.push(b);
    Battle.init(b, { platform: { plat: f.plat } });
    return b;
  },

  createDefense(p, target) {
    const fob = target === 'mb' ? null : G.fobs.find(f => f.id === target);
    const lat = fob ? fob.lat : G.base.lat, lng = fob ? fob.lng : G.base.lng;
    const plat = fob ? fob.plat : U.clamp(Math.round(PLATFORM_KEYS.reduce((n, k) => n + G.base.plat[k], 0) / 3), 1, 4);
    const place = fob ? fob.name : G.base.name;
    const b = Battle.skeleton('defend', `Defend ${place}`, lat, lng, {
      pfId: p.id, target, plat, diff: p.tier, enemyName: p.name, place, team: 'Security', timeLimit: 900,
      opts: { fulton: true, stance: 'assault' },
    });
    G.battles.push(b);
    Battle.init(b, { platform: { plat } });
    Game.log(`INTRUDERS: ${p.name} operatives have breached ${place}!`, 'bad');
    Game.notify('FOB INCURSION', `${p.name} intruders at ${place}. Security is responding.`, 'bad', [{ label: 'Take Command', act: 'focusBattle', args: { id: b.id } }], { ttl: 20, sound: 'siren' });
    if (G.settings.pauseOnInvasion && G.speedIdx > 1) Game.setSpeed(1);
    MapView.refreshStatic();
    return b;
  },

  async init(b, spec) {
    try {
      await Terrain.build(b, spec);
      if (!G.battles.includes(b)) return;
      if (b.kind === 'contract') Battle.setupContract(b);
      else if (b.kind === 'infiltrate') Battle.setupInfiltration(b);
      else Battle.setupDefense(b);
      b.phase = 'active';
      MapView.refreshStatic();
      UI.dirty();
    } catch (e) {
      console.error('battle init failed', e);
      G.battles.splice(G.battles.indexOf(b), 1);
      const dep = G.deps.find(d => d.battleId === b.id);
      if (dep) Contracts.orphanedDeployment(dep);
    }
  },

  // ---------- units ----------
  mk(b, o) {
    const u = {
      uid: b.uidN++, side: 'enemy', kind: 'soldier', name: 'Guard', staffId: null, lvl: 10,
      x: 0, y: 0, face: U.rand(0, Math.PI * 2), hp: 100, maxHp: 100, stun: 0, maxStun: 100, armor: 0,
      weapon: null, acc: 0.4, speed: 3, vision: 44, state: 'ok', sleepT: 0, bleedT: 0,
      path: null, moving: false, order: null, tgt: null, cool: U.rand(0, 1), stance: 'assault', skills: [],
      ai: { mode: 'guard', aware: 0 }, vis: false, marked: false, act: null, kills: 0, sleeps: 0, fultons: 0,
      supp: 0, underFire: 0, icon: null, iconT: 0, lzT: 0,
      ...o,
    };
    b.units.push(u);
    return u;
  },

  fromStaff(b, s, weapon, x, y) {
    const c = Staff.eff(s, 'combat');
    const iron = Staff.has(s, 'ironwill');
    const hp = Math.round(170 + c * 1.2 + (iron ? 40 : 0));
    return Battle.mk(b, {
      side: 'player', kind: 'op', name: s.callsign, staffId: s.id, lvl: c, pseed: s.pseed,
      x, y, hp, maxHp: hp, maxStun: iron ? 200 : 130, armor: RnD.armor(), weapon: weapon || 'tranq_pistol',
      acc: 0.45 + c / 200, speed: 3 + c / 200, vision: 50 * (Staff.has(s, 'recon') ? 1.25 : 1),
      skills: [...s.skills], stance: b.opts.stance || 'stealth', ai: {},
    });
  },

  enemy(b, kind, lvl, x, y, extra = {}) {
    const base = { soldier: ['Guard', 'e_rifle', 1, 44], heavy: ['Heavy', 'e_lmg', 1.7, 40], sniper: ['Sniper', 'e_sniper', 0.9, 75], officer: ['Officer', 'e_pistol', 1.2, 44], security: ['Security', 'sec_rifle', 1.1, 46], intruder: ['Intruder', 'sec_tranq', 1.4, 50] }[kind];
    const hp = Math.round((80 + lvl * 0.3) * base[2]);
    return Battle.mk(b, {
      side: 'enemy', kind, name: base[0], lvl, x, y, hp, maxHp: hp, weapon: base[1],
      acc: 0.22 + lvl / 300, speed: 3.1, vision: base[3], armor: kind === 'heavy' ? 0.25 : 0,
      maxStun: kind === 'heavy' ? 150 : 100, ai: { mode: 'guard', aware: 0 }, ...extra,
    });
  },

  device(b, kind, side, x, y, extra = {}) {
    const isCam = kind === 'camera';
    return Battle.mk(b, {
      side, kind, name: isCam ? 'Camera' : 'UAV', x, y, hp: isCam ? 30 : 45, maxHp: isCam ? 30 : 45, maxStun: 1e9,
      weapon: isCam ? null : 'uav_dart', acc: 0.6, vision: isCam ? 34 : 18, speed: 0, ai: { mode: 'device', aware: 0, t: U.rand(0, 10) }, ...extra,
    });
  },

  // ---------- setups ----------
  pickLZ(b) {
    const sides = U.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    for (const [sx, sy] of sides) {
      const off = U.rand(-60, 60);
      const p = Terrain.nearestFree(b, sx * 128 + (sy ? off : 0), sy * 128 + (sx ? off : 0));
      const reach = Terrain.flood(b, p[0], p[1]);
      if (reach.count > Terrain.W * Terrain.W * 0.25) { b.lz = { x: p[0], y: p[1], r: 12 }; b.reach = reach; return; }
    }
    const p = Terrain.nearestFree(b, 0, -128);
    b.lz = { x: p[0], y: p[1], r: 12 }; b.reach = Terrain.flood(b, p[0], p[1]);
  },

  spawnSquad(b, at) {
    const n = b.squad.length;
    b.squad.forEach((m, i) => {
      const s = Staff.byId(m.sid); if (!s) return;
      const a = i / n * Math.PI * 2;
      const p = Terrain.nearestFree(b, at.x + Math.cos(a) * 3, at.y + Math.sin(a) * 3, true);
      const u = Battle.fromStaff(b, s, m.weapon, p[0], p[1]);
      u.face = Math.atan2(-at.y, -at.x);
    });
  },

  objectivePoint(b, minD = 120) {
    for (let i = 0; i < 400; i++) {
      const p = Terrain.randomReachable(b, 0, 0, 0, 95, 1);
      if (U.dist(p[0], p[1], b.lz.x, b.lz.y) >= minD) return p;
    }
    return Terrain.randomReachable(b, -b.lz.x * 0.5, -b.lz.y * 0.5, 0, 30);
  },

  placeGuards(b, n, lvl, center, opts = {}) {
    const diff = b.diff || 3;
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      let kind = 'soldier';
      if (diff >= 4 && roll < 0.12 + diff * 0.015) kind = 'heavy';
      else if (diff >= 3 && roll > 0.9) kind = 'sniper';
      const r = i / n;
      let p;
      if (r < 0.4) p = Terrain.randomReachable(b, center[0], center[1], 6, 32);
      else p = Terrain.randomReachable(b, 0, 0, 10, 135);
      for (let tries = 0; tries < 10 && U.dist(p[0], p[1], b.lz.x, b.lz.y) < 60; tries++) p = Terrain.randomReachable(b, 0, 0, 10, 135);
      const e = Battle.enemy(b, kind, lvl + U.gauss(0, 4), p[0], p[1], opts);
      if (kind === 'sniper' || r < 0.4 || U.chance(0.3)) {
        e.ai = { mode: 'guard', home: 'guard', post: { x: p[0], y: p[1], face: U.rand(0, Math.PI * 2) }, aware: 0 };
      } else {
        const wps = [[p[0], p[1]]];
        for (let k = 0; k < U.randi(2, 4); k++) {
          let w = Terrain.randomReachable(b, p[0], p[1], 20, 70);
          for (let tries = 0; tries < 8 && U.dist(w[0], w[1], b.lz.x, b.lz.y) < 55; tries++) w = Terrain.randomReachable(b, p[0], p[1], 20, 70);
          if (U.dist(w[0], w[1], b.lz.x, b.lz.y) >= 55) wps.push(w);
        }
        e.ai = { mode: 'patrol', home: 'patrol', wps, wpi: 1, aware: 0, pause: 0 };
      }
    }
  },

  setupContract(b) {
    Battle.pickLZ(b);
    const lvl = 6 + b.diff * 7;
    const obj = Battle.objectivePoint(b);
    b.objCenter = obj;
    switch (b.ctype) {
      case 'eliminate': {
        const t = Battle.enemy(b, 'officer', lvl + 8, obj[0], obj[1], { name: U.esc(b.subject.replace(/^\w/, c => c.toUpperCase())), target: true });
        t.ai = { mode: 'patrol', home: 'patrol', wps: [obj, Terrain.randomReachable(b, obj[0], obj[1], 10, 30), Terrain.randomReachable(b, obj[0], obj[1], 10, 30)], wpi: 1, aware: 0, pause: 0 };
        t.marked = true;
        b.objectives.push({ id: 1, type: 'eliminate', tid: t.uid, label: `Neutralize the ${b.subject}`, done: false, x: obj[0], y: obj[1] });
        break;
      }
      case 'extract': {
        const h = Battle.mk(b, { side: 'neutral', kind: 'hostage', name: b.subject.replace(/^\w/, c => c.toUpperCase()), x: obj[0], y: obj[1], hp: 80, maxHp: 80, speed: 0, vision: 0, marked: true, ai: { mode: 'idle' } });
        b.objectives.push({ id: 1, type: 'extract', tid: h.uid, label: `Fulton the ${b.subject}`, done: false, x: obj[0], y: obj[1] });
        break;
      }
      case 'sabotage': {
        const n = b.diff >= 5 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const p = i === 0 ? obj : Terrain.randomReachable(b, obj[0], obj[1], 18, 45);
          b.objectives.push({ id: i + 1, type: 'sabotage', label: `Plant charge ${String.fromCharCode(65 + i)}`, x: p[0], y: p[1], need: 5, prog: 0, done: false, planted: false });
        }
        break;
      }
      case 'intel':
        b.objectives.push({ id: 1, type: 'intel', label: `Download ${b.subject}`, x: obj[0], y: obj[1], need: 9, prog: 0, done: false });
        break;
      default:
        b.objectives.push({ id: 1, type: 'hold', label: `Hold ${b.subject}`, x: obj[0], y: obj[1], r: 16, need: 100, prog: 0, done: false });
    }
    // defense contracts are mostly about the incoming waves, so the standing garrison is lighter
    Battle.placeGuards(b, b.ctype === 'hold' ? Math.ceil(b.enemies * 0.45) : b.enemies, lvl, obj);
    Battle.spawnSquad(b, b.lz);
    Battle.preMark(b);
  },

  setupInfiltration(b) {
    const [p, f] = PF.fobById(b.pfFobId);
    const pad = U.pick(b.pads);
    b.lz = { x: pad.x, y: pad.y, r: 10 };
    b.reach = Terrain.flood(b, pad.x, pad.y);
    b.objectives.push({ id: 1, type: 'core', label: 'Hack the FOB core', x: 0, y: 0, need: 14, prog: 0, done: false });
    const weapon = f.lethal ? 'sec_rifle' : 'sec_tranq';
    Battle.populateFob(b, { side: 'enemy', n: f.sec, lvl: f.secLvl, weapon, cams: f.cams, uavs: f.uavs, mines: f.mines, avoidPad: pad });
    Battle.spawnSquad(b, b.lz);
    if (PF.revealed(f)) {
      for (const u of b.units) if (u.kind === 'camera' || u.kind === 'uav') u.marked = true;
      for (const m of b.mines) m.known = true;
    }
    Battle.preMark(b);
  },

  setupDefense(b) {
    const p = PF.byId(b.pfId);
    b.reach = Terrain.flood(b, 0, 14);
    b.objectives.push({ id: 1, type: 'defend', label: 'Neutralize all intruders', x: 0, y: 0, need: 18, prog: 0, done: false });
    const def = Base.defenses(b.plat);
    // defenders: assigned security staff start on post; on Mother Base, unassigned combat staff scramble later
    const sec = Base.security(b.target).filter(s => s.status === 'active');
    if (!sec.length && b.target === 'mb') {
      b.responders = G.staff.filter(s => Staff.deployable(s)).sort((a, c) => c.stats.combat - a.stats.combat).slice(0, 4).map(s => s.id);
      b.respondAt = 70;
    }
    const posts = [[0, 16], [16, 0], [0, -16], [-16, 0]];
    sec.forEach((s, i) => {
      const pp = posts[i % 4];
      const pt = Terrain.nearestFree(b, pp[0] + U.rand(-3, 3), pp[1] + U.rand(-3, 3), true);
      const u = Battle.fromStaff(b, s, Battle.secWeapon(), pt[0], pt[1]);
      u.stance = 'assault';
      u.post = { x: pt[0], y: pt[1] };
      s.status = 'deployed';
    });
    const combatL = Staff.level('combat');
    const sentries = 2 + b.plat + (def.gear ? 1 : 0);
    for (let i = 0; i < sentries; i++) {
      const pt = Terrain.randomReachable(b, 0, 0, 12, 120);
      const u = Battle.mk(b, {
        side: 'player', kind: 'sentry', name: `Sentry-${i + 1}`, x: pt[0], y: pt[1], lvl: 10 + combatL * 0.5,
        hp: 90 + def.gear * 20, maxHp: 90 + def.gear * 20, armor: def.gear * 0.12, weapon: def.gear ? 'sec_rifle' : 'e_rifle',
        acc: 0.35 + combatL / 300, speed: 3, vision: 46, stance: 'assault', ai: {}, post: { x: pt[0], y: pt[1] },
      });
    }
    // intruders insert at the platform edge farthest from our people
    const guards = b.units.filter(u => u.side === 'player');
    const pad = b.pads.reduce((best, pd) => {
      const md = Math.min(...guards.map(g => U.dist(g.x, g.y, pd.x, pd.y)), 999);
      return !best || md > best.md ? { ...pd, md } : best;
    }, null);
    b.intruderPad = { x: pad.x, y: pad.y };
    // our defenses
    Battle.placeDevices(b, 'player', def.cams, def.uavs, def.mines, pad);
    const n = U.clamp(2 + Math.floor(p.tier / 3) + (U.chance(0.3) ? 1 : 0), 2, 5);
    const lvl = 20 + p.tier * 8;
    const anyLethal = p.fobs.some(f => f.lethal);
    for (let i = 0; i < n; i++) {
      const pt = Terrain.nearestFree(b, pad.x + U.rand(-4, 4), pad.y + U.rand(-4, 4));
      const e = Battle.enemy(b, 'intruder', lvl + U.gauss(0, 5), pt[0], pt[1], { weapon: anyLethal && U.chance(0.5) ? 'sec_rifle' : 'sec_tranq', stance: 'stealth', speed: 3.2 });
      e.acc += 0.12; e.armor = 0.25 + p.tier * 0.02; e.maxHp = e.hp = Math.round(e.hp * 1.3); e.maxStun = 130 + p.tier * 8;
      // each operator takes their own flanking route before converging on the core
      const fa = Math.atan2(pad.y, pad.x) + (i - (n - 1) / 2) * 0.9;
      e.ai = { mode: 'intrude', aware: 0, via: Terrain.nearestFree(b, Math.cos(fa) * 55, Math.sin(fa) * 55, true), delay: i * U.rand(4, 9) };
      e.name = `${p.initials}-${i + 1}`;
    }
  },

  secWeapon() {
    const w = RnD.weapons();
    return w.includes('tranq_rifle') ? 'tranq_rifle' : w.includes('ar2') ? 'ar2' : 'ar1';
  },

  // unassigned combat staff arrive at the core once the alarm sounds
  stepResponders(b) {
    if (!b.responders || !b.responders.length) return;
    if (b.alert === 2 && !b.respondSet) { b.respondSet = true; b.respondAt = Math.min(b.respondAt, b.time + 22); }
    if (b.time < b.respondAt) return;
    const ids = b.responders; b.responders = null;
    let n = 0;
    ids.forEach((id, i) => {
      const s = Staff.byId(id);
      if (!s || !Staff.deployable(s)) return;
      const a = i * Math.PI / 2;
      const pt = Terrain.nearestFree(b, Math.cos(a) * 14, Math.sin(a) * 14, true);
      const u = Battle.fromStaff(b, s, Battle.secWeapon(), pt[0], pt[1]);
      u.stance = 'assault'; u.post = { x: pt[0], y: pt[1] };
      s.status = 'deployed'; n++;
    });
    if (n) Battle.say(b, `${n} combat staff scrambled to the core.`, 'info');
  },

  populateFob(b, o) {
    const posts = [[0, 17], [17, 0], [0, -17], [-17, 0]];
    for (let i = 0; i < o.n; i++) {
      let pt;
      const mode = i < 4 ? 'guard' : U.chance(0.55) ? 'patrol' : 'guard';
      if (i < 4) pt = Terrain.nearestFree(b, posts[i][0], posts[i][1], true);
      else pt = Terrain.randomReachable(b, 0, 0, 20, 135);
      if (o.avoidPad && U.dist(pt[0], pt[1], o.avoidPad.x, o.avoidPad.y) < 30) pt = Terrain.randomReachable(b, 0, 0, 20, 70);
      const e = Battle.enemy(b, 'security', o.lvl + U.gauss(0, 5), pt[0], pt[1], { weapon: o.weapon });
      if (mode === 'guard') e.ai = { mode: 'guard', home: 'guard', post: { x: pt[0], y: pt[1], face: Math.atan2(pt[1], pt[0]) }, aware: 0 };
      else {
        const wps = [[pt[0], pt[1]]];
        for (let k = 0; k < 3; k++) wps.push(Terrain.randomReachable(b, pt[0], pt[1], 25, 90));
        e.ai = { mode: 'patrol', home: 'patrol', wps, wpi: 1, aware: 0, pause: 0 };
      }
    }
    Battle.placeDevices(b, 'enemy', o.cams, o.uavs, o.mines, o.avoidPad);
  },

  placeDevices(b, side, cams, uavs, mines, pad) {
    const decks = b.decks.filter(d => d.kind === 'deck');
    for (let i = 0; i < cams; i++) {
      const d = decks[i % decks.length];
      const corner = d.pts[U.randi(0, 3)];
      const cx = d.pts.reduce((s, p) => s + p[0], 0) / 4, cy = d.pts.reduce((s, p) => s + p[1], 0) / 4;
      const x = corner[0] + (cx - corner[0]) * 0.08, y = corner[1] + (cy - corner[1]) * 0.08;
      const base = Math.atan2(cy - y, cx - x);
      Battle.device(b, 'camera', side, x, y, { face: base, device: { base, sweep: 0.7 }, vision: RnD.has('cam2') && side === 'player' ? 42 : 34 });
    }
    for (let i = 0; i < uavs; i++) {
      const d = decks[i % decks.length];
      const cx = d.pts.reduce((s, p) => s + p[0], 0) / 4, cy = d.pts.reduce((s, p) => s + p[1], 0) / 4;
      Battle.device(b, 'uav', side, cx, cy, { device: { cx, cy, r: U.rand(14, 26), w: U.rand(0.15, 0.3) * (U.chance(.5) ? 1 : -1), t: U.rand(0, 6) } });
    }
    const bridges = b.decks.filter(d => d.kind === 'bridge');
    for (let i = 0; i < mines; i++) {
      let x, y;
      if (bridges.length && U.chance(0.6)) {
        const d = U.pick(bridges); const t = U.rand(0.15, 0.85);
        const p0 = [(d.pts[0][0] + d.pts[3][0]) / 2, (d.pts[0][1] + d.pts[3][1]) / 2], p1 = [(d.pts[1][0] + d.pts[2][0]) / 2, (d.pts[1][1] + d.pts[2][1]) / 2];
        x = p0[0] + (p1[0] - p0[0]) * t + U.rand(-1.5, 1.5); y = p0[1] + (p1[1] - p0[1]) * t + U.rand(-1.5, 1.5);
      } else { [x, y] = Terrain.randomReachable(b, 0, 0, 18, 60); }
      if (pad && U.dist(x, y, pad.x, pad.y) < 14) continue;
      b.mines.push({ x, y, side, known: side === 'player', armed: true });
    }
  },

  preMark(b) {
    if (!RnD.has('sat')) return;
    const frac = Math.min(0.9, 0.2 + Staff.level('intel') / 60);
    for (const u of b.units) if (u.side === 'enemy' && U.chance(frac)) u.marked = true;
  },

  // ---------- orders (from player input or AI) ----------
  order(b, uids, ord, fromAI) {
    const units = uids.map(id => Battle.unit(b, id)).filter(u => u && u.side === 'player' && ALIVE(u));
    units.forEach((u, i) => {
      const o = { ...ord, ai: !!fromAI };
      if (!fromAI) u.manual = true;   // the player has taken direct control of this unit
      if (o.type === 'move' && units.length > 1) {
        const a = i / units.length * Math.PI * 2, r = 2.5 + units.length * 0.6;
        const p = Terrain.nearestFree(b, ord.x + Math.cos(a) * r, ord.y + Math.sin(a) * r, true);
        o.x = p[0]; o.y = p[1];
      }
      u.order = o; u.act = null; u.path = null; u.ptx = null;
      if (o.type === 'move') u.path = Terrain.findPath(b, u.x, u.y, o.x, o.y);
      if (o.type === 'hold') u.path = null;
    });
  },

  setStance(b, uids, st) { for (const id of uids) { const u = Battle.unit(b, id); if (u) { u.stance = st; u.stanceLocked = true; } } },
  release(b, uids) {
    for (const id of uids) { const u = Battle.unit(b, id); if (u) { u.manual = false; u.stanceLocked = false; if (u.order && !u.order.ai) u.order = null; } }
  },

  // ---------- main update ----------
  updateAll(dt) {
    for (const b of [...G.battles]) {
      if (b.phase === 'done') { b.doneT = (b.doneT || 0) + dt; if (b.doneT > 5) { G.battles.splice(G.battles.indexOf(b), 1); MapView.refreshStatic(); Bus.emit('battleRemoved', b.id); } continue; }
      if (b.phase === 'loading') continue;
      b.acc = (b.acc || 0) + dt;
      let n = 0;
      while (b.acc >= STEP && n++ < 8) { b.acc -= STEP; Battle.step(b, STEP); if (b.phase === 'done') break; }
      if (n >= 8) b.acc = 0;
    }
  },

  step(b, h) {
    b.time += h;
    // fx decay
    for (const f of b.fx) { f.t += h; if (!f.snd && f.t >= 0) { f.snd = true; Battle.fxEvent(b, f); } }
    b.fx = b.fx.filter(f => f.t < (f.life || 0.5));
    // night update
    b.nightT += h; if (b.nightT > 20) { b.nightT = 0; b.night = U.isNight(G.time, b.lng); }
    // smoke & gas
    for (const s of b.smokes) s.t -= h;
    b.smokes = b.smokes.filter(s => s.t > 0);
    for (const s of b.gas) s.t -= h;
    b.gas = b.gas.filter(s => s.t > 0);
    Battle.stepSupport(b, h);

    for (const u of b.units) Battle.stepUnitTimers(b, u, h);
    b.percT += h;
    if (b.percT >= 0.2) { Battle.perceive(b, b.percT); b.percT = 0; }
    b.aiT += h;
    if (b.aiT >= 0.5) { b.aiT = 0; BAI.think(b); }
    for (const u of b.units) {
      if (!ALIVE(u)) { u.moving = false; continue; }
      if (u.kind === 'uav') Battle.stepUav(b, u, h);
      else if (u.kind === 'camera') { u.ai.t += h; u.face = u.device.base + Math.sin(u.ai.t * 0.45) * u.device.sweep; }
      else Battle.move(b, u, h);
      Battle.stepAct(b, u, h);
      Battle.stepFire(b, u, h);
    }
    Battle.stepMines(b);
    Battle.stepObjectives(b, h);
    Battle.stepAlert(b, h);
    Battle.stepPhase(b, h);
    Battle.watch(b);
  },

  stepUnitTimers(b, u, h) {
    if (u.iconT > 0) { u.iconT -= h; if (u.iconT <= 0) u.icon = null; }
    if (u.supp > 0) u.supp -= h;
    if (u.underFire > 0) u.underFire -= h;
    if (u.state === 'asleep') {
      u.sleepT -= h;
      if (u.sleepT <= 0) {
        u.state = 'ok'; u.stun = 0;
        if (u.side === 'enemy' && u.ai.mode !== 'intrude') { u.ai.mode = 'investigate'; u.ai.inv = { x: u.x, y: u.y }; u.ai.look = 4; Battle.caution(b); Battle.icon(u, '?'); }
      }
    } else if (u.state === 'down') {
      u.bleedT -= h;
      if (u.bleedT <= 0) { u.state = 'dead'; Battle.say(b, `${u.name} has bled out.`, 'bad'); }
    }
    if (u.state === 'ok' && u.side === 'player' && u.skills.includes('medic')) {
      for (const o of b.units) if (o !== u && o.side === 'player' && o.state === 'ok' && o.hp < o.maxHp && U.dist(u.x, u.y, o.x, o.y) < 6) o.hp = Math.min(o.maxHp, o.hp + 1.2 * h);
    }
    // gas exposure
    if (u.state === 'ok' && b.gas.length && u.kind !== 'camera' && u.kind !== 'uav') {
      if (b.gas.some(g => g.t < g.life - 1.5 && U.dist(u.x, u.y, g.x, g.y) < g.r)) {
        u.gasT = (u.gasT || 0) + h;
        if (u.gasT > (u.skills.includes('ironwill') ? 3 : 1.5)) Battle.sleep(b, u, b.gasBy ? Battle.unit(b, b.gasBy) : null);
      }
    }
  },

  move(b, u, h) {
    if (!u.path || !u.path.length) {
      u.moving = false;
      if (u.ai && u.ai.faceT != null && !u.tgt) u.face = Battle.turn(u.face, u.ai.faceT, 1.4 * h);
      return;
    }
    const [tx, ty] = u.path[0];
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    let sp = u.speed;
    if (u.side === 'player') sp *= u.stance === 'stealth' ? 0.65 : 1;
    else if (u.ai.mode === 'patrol') sp = 1.3;
    else if (u.ai.mode === 'investigate') sp = 1.9;
    else if (u.kind === 'intruder' && u.stance === 'stealth') sp = 2.4;
    if (u.supp > 0) sp *= 0.6;
    sp *= h;
    if (d <= sp) { u.x = tx; u.y = ty; u.path.shift(); }
    else { u.x += dx / d * sp; u.y += dy / d * sp; }
    if (!u.tgt) u.face = Battle.turn(u.face, Math.atan2(dy, dx), 8 * h);
    u.moving = true;
  },

  turn(a, target, max) { const d = U.angDiff(a, target); return a + U.clamp(d, -max, max); },

  stepUav(b, u, h) {
    const d = u.device;
    d.t += h * d.w;
    const tx = d.cx + Math.cos(d.t) * d.r, ty = d.cy + Math.sin(d.t) * d.r;
    u.face = Math.atan2(ty - u.y, tx - u.x);
    u.x = tx; u.y = ty; u.moving = true;
  },

  // ---------- perception ----------
  nightMult(b, u) {
    if (!b.night) return 1;
    if (u.side === 'player' && (RnD.has('nvg') || u.skills.includes('nightowl'))) return 1;
    return u.side === 'player' ? 0.6 : 0.65;
  },

  smokeBlocks(b, x1, y1, x2, y2) {
    for (const s of b.smokes) {
      const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1;
      const t = U.clamp(((s.x - x1) * vx + (s.y - y1) * vy) / l2, 0, 1);
      if (U.dist(x1 + vx * t, y1 + vy * t, s.x, s.y) < s.r) return true;
    }
    return false;
  },

  canSee(b, a, t, range) {
    const d = U.dist(a.x, a.y, t.x, t.y);
    if (d > range) return false;
    if (a.kind === 'uav' || t.kind === 'uav') return !Battle.smokeBlocks(b, a.x, a.y, t.x, t.y);
    return Terrain.los(b, a.x, a.y, t.x, t.y) && !Battle.smokeBlocks(b, a.x, a.y, t.x, t.y);
  },

  perceive(b, dt) {
    const players = b.units.filter(u => u.side === 'player' && ALIVE(u));
    const others = b.units.filter(u => u.side !== 'player' && u.state !== 'fultoned' && u.state !== 'extracted');
    // player-side sight & marking
    for (const e of others) {
      e.vis = false;
      if (b.kind === 'defend' && e.kind === 'intruder' && ALIVE(e)) { Battle.defenderPerceive(b, e, players, dt); continue; }
      for (const p of players) {
        if (p.kind === 'uav' || p.kind === 'camera') continue;
        const vr = p.vision * Battle.nightMult(b, p);
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d < 7 || Battle.canSee(b, p, e, vr)) { e.vis = true; break; }
      }
      if (e.vis && e.side === 'enemy' && !e.marked) {
        e.marked = true;
        if (b.kind === 'defend' && ALIVE(e)) Battle.raiseAlert(b, e.x, e.y, null, true);
      }
    }
    // mines spotted by recon specialists
    for (const m of b.mines) {
      if (m.known || m.side === 'player') continue;
      for (const p of players) if (p.skills.includes('recon') && U.dist(p.x, p.y, m.x, m.y) < 10) m.known = true;
      if (!m.known) for (const p of players) if (U.dist(p.x, p.y, m.x, m.y) < 3.5 && U.chance(0.15)) m.known = true;
    }
    for (const u of b.units) {
      if (!ALIVE(u)) continue;
      if (u.kind === 'camera' || u.kind === 'uav') Battle.devicePerceive(b, u, dt);
      else if (u.side === 'enemy' && u.kind !== 'intruder') Battle.guardPerceive(b, u, dt);
      else if (u.side === 'player' && b.kind === 'defend') {
        // defenders who can see a living intruder raise the alarm
        for (const e of others) if (e.kind === 'intruder' && ALIVE(e) && e.vis && U.dist(u.x, u.y, e.x, e.y) < u.vision) { Battle.raiseAlert(b, e.x, e.y, null, true); break; }
      }
    }
  },

  // our security has to actually look at a sneaking intruder to notice them
  defenderPerceive(b, e, players, dt) {
    let best = 0;
    for (const p of players) {
      if (p.kind === 'camera' || p.kind === 'uav') continue;
      const vr = p.vision * Battle.nightMult(b, p);
      const d = U.dist(p.x, p.y, e.x, e.y);
      if (d > vr) continue;
      const fov = d < 5 ? Math.PI : b.alert === 2 ? 1.5 : 1.05;
      if (Math.abs(U.angDiff(p.face, Math.atan2(e.y - p.y, e.x - p.x))) > fov) continue;
      if (!Battle.canSee(b, p, e, vr)) continue;
      best = Math.max(best, Battle.detectRate(b, p, e, d, vr));
    }
    if (best > 0) e.ai.seenBy = (e.ai.seenBy || 0) + best * dt;
    else e.ai.seenBy = Math.max(0, (e.ai.seenBy || 0) - 0.2 * dt);
    if (e.marked) e.vis = best > 0;
    else if (e.ai.seenBy >= 1) { e.marked = true; e.vis = true; Battle.raiseAlert(b, e.x, e.y, null, true); }
  },

  detectRate(b, obs, p, d, vr) {
    let rate = Math.max(0.05, 1.25 - d / vr) * 1.25;
    if (p.side === 'player') {
      if (p.stance === 'stealth') rate *= p.moving ? 0.5 : 0.35;
      else if (p.moving) rate *= 1.25;
      if (p.skills.includes('ghost')) rate *= 0.65;
      if (RnD.has('camo')) rate *= 0.7;
      if (obs.kind === 'camera' && p.skills.includes('hacker')) rate *= 0.5;
    } else if (p.kind === 'intruder') {
      rate *= (p.stance === 'stealth' ? (p.moving ? 0.45 : 0.3) : 1) * 0.75; // elite operators with camo
    }
    if (Terrain.cover(b, p.x, p.y)) rate *= 0.7;
    if (p.state !== 'ok') rate *= 1.4;
    if (b.alert === 2) rate *= 2.5; else if (b.alert === 1) rate *= 1.4;
    return rate;
  },

  guardPerceive(b, e, dt) {
    const vr = e.vision * Battle.nightMult(b, e) * (b.alert === 2 ? 1.15 : 1);
    let best = null, bestRate = 0;
    for (const p of b.units) {
      if (p.side !== 'player' || !(p.state === 'ok' || p.state === 'down' || p.state === 'asleep')) continue;
      if (p.kind === 'sentry' || p.kind === 'camera' || p.kind === 'uav') continue;
      const d = U.dist(e.x, e.y, p.x, p.y);
      if (d > vr) continue;
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      const fov = d < 6 ? Math.PI : (b.alert === 2 ? 1.3 : 1.0);
      if (Math.abs(U.angDiff(e.face, ang)) > fov) continue;
      if (!Battle.canSee(b, e, p, vr)) continue;
      const r = Battle.detectRate(b, e, p, d, vr);
      if (r > bestRate) { bestRate = r; best = p; }
    }
    if (best) {
      e.ai.aware = (e.ai.aware || 0) + bestRate * dt;
      e.ai.lastSeen = { x: best.x, y: best.y, t: b.time };
      if (e.ai.mode === 'combat') { if (best.state === 'ok') e.ai.target = best.uid; }
      else if (e.ai.aware >= 1) {
        e.ai.mode = 'combat'; e.ai.target = best.uid; e.path = null;
        e.cool = Math.max(e.cool, U.rand(0.7, 1.5)); // reaction time before the first shot
        Battle.icon(e, '!');
        Battle.raiseAlert(b, best.x, best.y, e);
      } else if (e.ai.aware >= 0.35 && (e.ai.mode === 'patrol' || e.ai.mode === 'guard')) {
        e.ai.mode = 'investigate'; e.ai.inv = { x: best.x, y: best.y }; e.ai.look = 3; e.path = null;
        Battle.icon(e, '?');
      } else if (e.ai.mode !== 'combat') {
        e.face = Battle.turn(e.face, Math.atan2(best.y - e.y, best.x - e.x), 2 * dt);
      }
    } else if (e.ai.mode !== 'combat') {
      e.ai.aware = Math.max(0, (e.ai.aware || 0) - 0.12 * dt);
    }
    // discovering bodies
    if (b.alert < 2 && e.ai.mode !== 'combat') {
      for (const o of b.units) {
        if (o.side !== 'enemy' || o.found || !(o.state === 'asleep' || o.state === 'dead') || o.kind === 'camera' || o.kind === 'uav') continue;
        const d = U.dist(e.x, e.y, o.x, o.y);
        if (d > vr * 0.8) continue;
        if (Math.abs(U.angDiff(e.face, Math.atan2(o.y - e.y, o.x - e.x))) > 1.0) continue;
        if (!Battle.canSee(b, e, o, vr)) continue;
        o.found = true;
        e.ai.mode = 'investigate'; e.ai.inv = { x: o.x, y: o.y }; e.ai.look = 3; e.ai.wake = o.state === 'asleep' ? o.uid : null; e.path = null;
        Battle.icon(e, '!');
        if (o.state === 'dead') Battle.raiseAlert(b, o.x, o.y, e); else Battle.caution(b);
        break;
      }
    }
  },

  devicePerceive(b, d, dt) {
    const foe = d.side === 'enemy' ? 'player' : 'enemy';
    const isCam = d.kind === 'camera';
    let best = null, bestRate = 0;
    for (const p of b.units) {
      if (p.side !== foe || p.state !== 'ok' || p.kind === 'camera' || p.kind === 'uav' || p.kind === 'sentry') continue;
      const dd = U.dist(d.x, d.y, p.x, p.y);
      if (dd > d.vision) continue;
      if (isCam && Math.abs(U.angDiff(d.face, Math.atan2(p.y - d.y, p.x - d.x))) > 0.6) continue;
      if (!Battle.canSee(b, d, p, d.vision)) continue;
      const r = Battle.detectRate(b, d, p, dd, d.vision) * (isCam ? 1.2 : 1);
      if (r > bestRate) { bestRate = r; best = p; }
    }
    if (best) {
      d.ai.aware += bestRate * dt;
      if (d.ai.aware >= 1) {
        d.ai.aware = 1; d.ai.target = best.uid;
        if (d.side === 'enemy') { if (b.alert < 2) Battle.icon(d, '!'); Battle.raiseAlert(b, best.x, best.y, d); }
        else { best.marked = true; Battle.raiseAlert(b, best.x, best.y, null, true); }
      }
    } else { d.ai.aware = Math.max(0, d.ai.aware - 0.3 * dt); if (d.ai.aware < 0.5) d.ai.target = null; }
  },

  icon(u, ic) { u.icon = ic; u.iconT = 2.5; },

  caution(b) { if (b.alert < 1) { b.alert = 1; b.alertT = 60; Battle.ui(b, 'caution'); } else if (b.alert === 1) b.alertT = 60; },

  // UI-level sound for a battle: full volume when you're commanding it, spatial otherwise
  ui(b, name) {
    if (UI.focused === b.id) Sfx.play(name);
    else Sfx.at(b, b.lz ? b.lz.x : 0, b.lz ? b.lz.y : 0, name, { gain: 0.7 });
  },

  // one-shot audio/visual side effects when an fx starts playing
  fxEvent(b, f) {
    const focused = UI.focused === b.id;
    if (f.type === 'boom') {
      Sfx.at(b, f.x, f.y, f.r >= 8 ? 'explosion' : 'smallboom');
      if (!f.nl) for (let i = 0; i < 3; i++) b.fx.push({ type: 'puff', x: f.x + U.rand(-f.r / 3, f.r / 3), y: f.y + U.rand(-f.r / 3, f.r / 3), r: f.r * U.rand(0.5, 0.9), t: -i * 0.1, life: 3.5, snd: true });
      f.seed = U.randi(1, 1e6);
      if (focused) Fx.shake(f.r >= 8 ? 7 : 3, f.r >= 8 ? 0.45 : 0.25);
    } else if (f.type === 'fulton') Sfx.at(b, f.x, f.y, 'fulton');
    else if (f.type === 'heli') Sfx.at(b, f.x, f.y, 'heli', { gain: 0.8 });
    else if (f.type === 'crate') Sfx.at(b, f.x, f.y, 'smallboom', { gain: 0.4 });
  },

  // objective / phase changes worth a fanfare
  watch(b) {
    const n = b.objectives.filter(o => o.done).length;
    if (b._doneN === undefined) b._doneN = n;
    if (n > b._doneN && b.phase !== 'done') {
      b._doneN = n;
      Battle.ui(b, 'objective');
      if (UI.focused === b.id && b.kind !== 'defend') Fx.banner('OBJECTIVE COMPLETE', b.phase === 'exfil' ? 'PROCEED TO THE LZ' : `${n}/${b.objectives.length}`, 'var(--ok)', { small: true, ttl: 1.8 });
    }
  },

  raiseAlert(b, x, y, by, defenders) {
    const first = b.alert < 2;
    b.alert = 2; b.alertT = 70; b.lastKnown = { x, y, t: b.time };
    if (!first) return;
    b.stats.alerts++;
    Battle.ui(b, 'alert');
    if (UI.focused === b.id) { Fx.banner('!  ALERT  !', defenders ? 'INTRUDERS SPOTTED' : 'YOU HAVE BEEN SPOTTED', 'var(--red)', { small: true, ttl: 1.6 }); Fx.shake(3, 0.25); }
    if (defenders) {
      Battle.say(b, 'Intruder spotted! Security converging.', 'bad');
      return;
    }
    Battle.say(b, `${b.team} compromised — ALERT!`, 'bad');
    b.fx.push({ type: 'alert', t: 0, life: 2 });
    if (UI.focused !== b.id) Game.notify('COMPROMISED', `${b.team} spotted at ${b.place}. Enemy is on alert.`, 'bad', [{ label: 'Take Command', act: 'focusBattle', args: { id: b.id } }], { ttl: 10 });
    if (b.waves < b.maxWaves && b.kind !== 'defend' && b.ctype !== 'hold' && !b.reinfT) b.reinfT = b.time + 25;
    for (const e of b.units) {
      if (e.side !== 'enemy' || !ALIVE(e) || e.kind === 'camera' || e.kind === 'uav' || e.kind === 'intruder') continue;
      if (e.ai.mode !== 'combat' && e.ai.mode !== 'idle') { e.ai.mode = 'search'; e.ai.inv = null; e.path = null; }
    }
  },

  noise(b, x, y, r, side) {
    if (r <= 0 || side !== 'player') return;
    let heard = false;
    for (const e of b.units) {
      if (e.side !== 'enemy' || !ALIVE(e) || e.kind === 'camera' || e.kind === 'uav' || e.kind === 'intruder') continue;
      if (U.dist(e.x, e.y, x, y) > r) continue;
      heard = true;
      if (e.ai.mode === 'patrol' || e.ai.mode === 'guard') { e.ai.mode = 'investigate'; e.ai.inv = { x: x + U.rand(-8, 8), y: y + U.rand(-8, 8) }; e.ai.look = 4; e.path = null; Battle.icon(e, '?'); }
    }
    if (heard) Battle.caution(b);
  },

  say(b, msg, type = 'info') {
    b.log = b.log || [];
    b.log.unshift({ t: b.time, msg, type });
    if (b.log.length > 30) b.log.length = 30;
  },

  // ---------- combat ----------
  validTarget(u, t) {
    if (!t || t.state !== 'ok') return false;
    if (t.side === u.side || t.side === 'neutral') return false;
    const w = WEAPONS[u.weapon];
    if ((t.kind === 'camera' || t.kind === 'uav') && w && !w.lethal) return false;
    return true;
  },

  pickTarget(b, u) {
    const w = WEAPONS[u.weapon]; if (!w) return null;
    const range = w.range;
    const inRange = t => Battle.validTarget(u, t) && U.dist(u.x, u.y, t.x, t.y) <= range && Battle.canSee(b, u, t, range);
    if (u.side === 'player') {
      if (u.order && u.order.type === 'attack') { const t = Battle.unit(b, u.order.tid); if (inRange(t)) return t; }
      const free = u.stance === 'assault' || b.alert === 2 || u.underFire > 0 || b.kind === 'defend';
      if (!free) return null;
      let best = null, bd = Infinity;
      for (const t of b.units) {
        if (t.side !== 'enemy' || !(t.vis || t.marked)) continue;
        if ((t.kind === 'camera' || t.kind === 'uav') && !(u.order && u.order.tid === t.uid) && b.alert < 2) continue;
        if (!inRange(t)) continue;
        const d = U.dist(u.x, u.y, t.x, t.y);
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }
    if (u.kind === 'uav' || u.kind === 'camera') {
      if (u.kind === 'camera') return null;
      const t = Battle.unit(b, u.ai.target);
      return inRange(t) ? t : null;
    }
    if (u.kind === 'intruder') {
      let best = null, bd = Infinity;
      for (const t of b.units) {
        if (t.side !== 'player' || t.kind === 'camera') continue;
        if (!inRange(t)) continue;
        const d = U.dist(u.x, u.y, t.x, t.y);
        if (t.kind === 'uav' && d > 20) continue;
        if (b.alert < 2 && !u.marked && d > 22) continue;   // stay hidden: only silent close-range takedowns
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }
    if (u.ai.mode !== 'combat') return null;
    const t = Battle.unit(b, u.ai.target);
    if (inRange(t)) return t;
    let best = null, bd = Infinity;
    for (const o of b.units) {
      if (o.side !== 'player' || o.kind === 'camera' || o.kind === 'uav') continue;
      if (!inRange(o)) continue;
      const d = U.dist(u.x, u.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) u.ai.target = best.uid;
    return best;
  },

  stepFire(b, u, h) {
    if (!u.weapon || u.act) { u.tgt = null; return; }
    u.cool -= h;
    const t = Battle.pickTarget(b, u);
    u.tgt = t ? t.uid : null;
    if (!t) return;
    if (u.kind !== 'uav') u.face = Battle.turn(u.face, Math.atan2(t.y - u.y, t.x - u.x), 10 * h);
    if (u.cool > 0) return;
    Battle.shoot(b, u, t);
  },

  shoot(b, u, t) {
    const w = WEAPONS[u.weapon];
    u.cool = (1 / w.rof) * U.rand(0.85, 1.15);
    const d = U.dist(u.x, u.y, t.x, t.y);
    let p = u.acc * w.acc * (1 - 0.55 * (d / w.range) ** 2);
    const hz = b.ctype === 'hold' && t.side === 'player' ? b.objectives[0] : null;
    const fortified = hz && U.dist(t.x, t.y, hz.x, hz.y) < hz.r;
    if (Terrain.cover(b, t.x, t.y) || fortified) p *= 0.65;
    if (t.moving) p *= 0.85;
    if (u.moving) p *= 0.75;
    if (u.supp > 0) p *= 0.6;
    if (u.skills.includes('sharpshooter')) p *= 1.2;
    if (u.skills.includes('cqc') && d < 12) p *= 1.5;
    if (u.side === 'player' && b.units.some(o => o !== u && o.side === 'player' && ALIVE(o) && o.skills.includes('leader') && U.dist(o.x, o.y, u.x, u.y) < 25)) p *= 1.1;
    const unaware = (t.side === 'enemy' && t.ai && t.ai.mode !== 'combat' && t.kind !== 'intruder') ||
      (u.kind === 'intruder' && b.alert < 2 && !u.marked);
    if (unaware) p *= 1.3;
    if (t.kind === 'uav') p *= 0.6;
    p = U.clamp(p, 0.04, 0.96);
    const hit = Math.random() < p;
    const jx = hit ? 0 : U.rand(-3, 3), jy = hit ? 0 : U.rand(-3, 3);
    b.fx.push({ type: 'tracer', x1: u.x, y1: u.y, x2: t.x + jx, y2: t.y + jy, t: 0, life: 0.14, nl: !w.lethal, side: u.side });
    b.fx.push({ type: 'flash', x: u.x, y: u.y, a: Math.atan2(t.y - u.y, t.x - u.x), t: 0, life: 0.07, nl: !w.lethal, snd: true });
    Sfx.at(b, u.x, u.y, !w.lethal ? 'tranq' : w.noise <= 20 ? 'suppressed' : w.dmg >= 50 ? 'sniper' : w.rof > 4 ? 'mg' : 'gun', { gain: u.side === 'player' ? 0.8 : 0.6 });
    Battle.noise(b, u.x, u.y, w.noise, u.side);
    if (w.suppress) t.supp = 1.5;
    t.underFire = 2;
    if (hit) Battle.damage(b, t, u, w, unaware);
    // security that gets hit may spot where it came from
    if (u.kind === 'intruder' && !u.marked && t.side === 'player' && ALIVE(t) && U.chance(0.35) && Battle.canSee(b, t, u, t.vision * 1.2)) {
      u.marked = true; Battle.raiseAlert(b, u.x, u.y, null, true);
    }
    // being shot at reveals the shooter's direction
    if (t.side === 'enemy' && ALIVE(t) && t.ai && t.kind !== 'camera' && t.kind !== 'uav' && t.kind !== 'intruder' && t.ai.mode !== 'combat') {
      if (Battle.canSee(b, t, u, t.vision * 1.4)) { t.ai.mode = 'combat'; t.ai.target = u.uid; t.path = null; t.cool = Math.max(t.cool, U.rand(0.6, 1.3)); Battle.icon(t, '!'); Battle.raiseAlert(b, u.x, u.y, t); }
      else if (w.noise > 0 || hit) { t.ai.mode = 'investigate'; t.ai.inv = { x: u.x, y: u.y }; t.ai.look = 3; t.path = null; Battle.icon(t, '?'); Battle.caution(b); }
    }
  },

  damage(b, t, src, w, unaware) {
    if (w.lethal) {
      let dmg = w.dmg * U.rand(0.8, 1.2) * (1 - (t.armor || 0));
      if (unaware && src) dmg *= 2.2;   // shots on unaware targets are lethal precision shots
      t.hp -= dmg;
      b.fx.push({ type: 'hit', x: t.x, y: t.y, t: 0, life: 0.25 });
      if (t.side === 'player') { t.hitAt = performance.now(); if (UI.focused === b.id) Sfx.at(b, t.x, t.y, 'hit', { gain: 0.6 }); }
      if (t.hp <= 0) Battle.incapacitate(b, t, src);
    } else {
      if (t.kind === 'camera' || t.kind === 'uav') return;
      // a dart into an unaware guard is a clean knockout (MGS-style headshot)
      t.stun += w.stun * U.rand(0.85, 1.15) * (t.skills && t.skills.includes('ironwill') ? 0.6 : 1) * (unaware && src ? 2.2 : 1);
      b.fx.push({ type: 'dart', x: t.x, y: t.y, t: 0, life: 0.3 });
      if (t.stun >= t.maxStun) Battle.sleep(b, t, src);
    }
  },

  incapacitate(b, t, src) {
    t.hp = 0; t.path = null; t.act = null; t.order = null; t.moving = false;
    if (t.side === 'player' && t.kind === 'op') {
      t.state = 'down'; t.bleedT = RnD.has('trauma') ? 150 : 90;
      Sfx.at(b, t.x, t.y, 'down');
      Battle.say(b, `${t.name} is down! Bleeding out.`, 'bad');
      if (UI.focused !== b.id) Game.notify('OPERATIVE DOWN', `${t.name} (${b.team}) is bleeding out at ${b.place}.`, 'bad', [{ label: 'Take Command', act: 'focusBattle', args: { id: b.id } }], { ttl: 8 });
    } else {
      t.state = 'dead'; t.deadAt = b.time;
      if (t.kind === 'camera' || t.kind === 'uav') b.fx.push({ type: 'boom', x: t.x, y: t.y, r: 4, t: 0, life: 0.6 });
      if (src && src.side === 'player' && t.side === 'enemy' && t.kind !== 'camera' && t.kind !== 'uav') { src.kills++; b.stats.kills++; }
      if (t.target) Battle.say(b, `Target neutralized.`, 'ok');
    }
  },

  sleep(b, t, src) {
    if (t.state !== 'ok') return;
    t.state = 'asleep'; t.sleepT = t.side === 'player' ? U.rand(35, 55) : U.rand(80, 140); t.stun = 0; t.sleptAt = b.time;
    Sfx.at(b, t.x, t.y, 'sleep', { gain: 0.6 });
    t.path = null; t.act = null; t.moving = false; t.found = false; t.gasT = 0;
    if (src && src.side === 'player' && t.side === 'enemy') { src.sleeps++; b.stats.sleeps++; }
    if (t.side === 'player') Battle.say(b, `${t.name} was knocked out.`, 'bad');
  },

  // ---------- actions (fulton, revive, interact) ----------
  fultonable(b, by, t) {
    if (!t) return false;
    if (by.side === 'player') {
      if (t.side === 'enemy') return t.state === 'asleep' && t.kind !== 'camera' && t.kind !== 'uav';
      if (t.side === 'neutral') return t.state === 'ok';
      if (t.side === 'player') return t.kind === 'op' && (t.state === 'down' || t.state === 'asleep') && RnD.fultonLevel() >= 2;
    } else {
      return t.side === 'player' && t.kind === 'op' && t.state === 'asleep';
    }
    return false;
  },

  startAct(b, u, type, ref, total) {
    u.act = { type, ref, t: 0, total };
    u.path = null; u.moving = false;
  },

  stepAct(b, u, h) {
    if (!u.act) return;
    const a = u.act;
    a.t += h;
    if (a.type === 'fulton') {
      const t = Battle.unit(b, a.ref);
      if (!Battle.fultonable(b, u, t) || U.dist(u.x, u.y, t.x, t.y) > 3.5) { u.act = null; return; }
      if (a.t >= a.total) { u.act = null; Battle.fulton(b, u, t); }
    } else if (a.type === 'revive') {
      const t = Battle.unit(b, a.ref);
      if (!t || !(t.state === 'down' || t.state === 'asleep') || U.dist(u.x, u.y, t.x, t.y) > 3) { u.act = null; return; }
      if (a.t >= a.total) {
        u.act = null;
        if (t.state === 'down') t.hp = t.maxHp * 0.35;
        t.state = 'ok'; t.stun = 0; t.sleepT = 0;
        Battle.say(b, `${u.name} got ${t.name} back on their feet.`, 'ok');
        if (u.order && u.order.type === 'revive') u.order = null;
      }
    } else if (a.type === 'interact') {
      const o = b.objectives.find(o => o.id === a.ref);
      if (!o || o.done || (o.type === 'sabotage' && o.planted) || U.dist(u.x, u.y, o.x, o.y) > 4) { u.act = null; return; }
      o.prog = a.t; o.need = a.total;
      if (a.t >= a.total) {
        u.act = null;
        if (u.order && u.order.type === 'interact') u.order = null;
        if (o.type === 'sabotage') { o.planted = true; o.boomT = 8; Battle.say(b, `Charge ${o.label.slice(-1)} planted. Detonation in 8s.`, 'ok'); }
        else if (o.type === 'core' && u.side === 'enemy') { o.hacked = true; }
        else { o.done = true; Battle.say(b, `${o.label} — complete.`, 'ok'); }
      }
    } else if (a.type === 'hack') {   // intruder hacking our core
      const o = b.objectives[0];
      if (U.dist(u.x, u.y, 0, 0) > 6) { u.act = null; return; }
      o.prog = a.t;
      if (a.t >= a.total) { u.act = null; b.coreHacked = true; Battle.say(b, 'The core has been compromised! Intruders are withdrawing.', 'bad'); }
    }
  },

  fulton(b, by, t) {
    let chance = RnD.fultonChance() + (by.skills.includes('fulton') ? 0.1 : 0);
    if (t.side === 'neutral' || t.side === 'player') chance = Math.max(chance, 0.95);
    if (by.side === 'enemy') chance = 0.9;
    b.fx.push({ type: 'fulton', x: t.x, y: t.y, t: 0, life: 3, ok: Math.random() < chance });
    const ok = b.fx[b.fx.length - 1].ok;
    // fulton balloons are visible
    for (const e of b.units) if (e.side === 'enemy' && ALIVE(e) && e.kind !== 'intruder' && e.ai && e.ai.mode !== 'combat' && U.dist(e.x, e.y, t.x, t.y) < 40 && Terrain.los(b, e.x, e.y, t.x, t.y)) { Battle.caution(b); Battle.icon(e, '?'); e.ai.mode = 'investigate'; e.ai.inv = { x: t.x, y: t.y }; e.ai.look = 3; e.path = null; }
    if (!ok) { t.state = 'dead'; Battle.say(b, `Fulton failed — ${t.name} didn't survive.`, 'bad'); return; }
    if (by.side === 'enemy') {
      t.state = 'captured';
      Battle.say(b, `${t.name} was fultoned by the intruders!`, 'bad');
      b.stolen = (b.stolen || 0) + 1;
      return;
    }
    t.state = 'fultoned';
    by.fultons++;
    b.result = b.result || {};
    b.fultoned = b.fultoned || [];
    b.fultoned.push({ kind: t.side === 'neutral' ? 'hostage' : t.side === 'player' ? 'ally' : 'enemy', lvl: Math.max(3, t.lvl || 10), uid: t.uid });
    if (t.side === 'player') Battle.say(b, `${t.name} extracted to Mother Base for treatment.`, 'ok');
    else Battle.say(b, `${t.name} extracted by Fulton.`, 'ok');
    for (const o of b.objectives) if (o.tid === t.uid) { o.done = true; if (o.type === 'eliminate') b.targetFulton = true; }
    if (by.order && by.order.type === 'fulton') by.order = null;
  },

  // ---------- support ----------
  supportCost(key) {
    const q = Staff.inDept('support').some(s => Staff.has(s, 'quartermaster')) ? 0.85 : 1;
    return Math.round(SUPPORT_ABILITIES[key].cost * q);
  },
  supportReady(b, key) {
    const ab = SUPPORT_ABILITIES[key];
    if (!RnD.has(ab.item)) return 'Not developed';
    if (b.kind === 'defend' && key === 'strike') return 'Not on our own base';
    if ((b.cd[key] || 0) > b.time) return `${Math.ceil(b.cd[key] - b.time)}s`;
    if (G.res.gmp < Battle.supportCost(key)) return 'No GMP';
    return null;
  },
  useSupport(b, key, x, y) {
    const why = Battle.supportReady(b, key);
    if (why) return false;
    const ab = SUPPORT_ABILITIES[key];
    G.res.gmp -= Battle.supportCost(key);
    b.cd[key] = b.time + ab.cd;
    const delay = { supply: 3, smoke: 2, sleepgas: 2.5, strike: 6 }[key];
    b.strikes.push({ key, x, y, at: b.time + delay });
    b.fx.push({ type: 'incoming', x, y, r: ab.radius, t: 0, life: delay, key });
    Battle.ui(b, 'radio');
    Battle.say(b, `${ab.name} inbound.`, 'info');
    return true;
  },
  stepSupport(b) {
    for (const s of [...b.strikes]) {
      if (b.time < s.at) continue;
      b.strikes.splice(b.strikes.indexOf(s), 1);
      const r = SUPPORT_ABILITIES[s.key].radius;
      if (s.key === 'supply') {
        b.fx.push({ type: 'crate', x: s.x, y: s.y, t: 0, life: 2.5 });
        for (const u of b.units) if (u.side === 'player' && u.state === 'ok' && U.dist(u.x, u.y, s.x, s.y) < r) u.hp = Math.min(u.maxHp, u.hp + 60);
      } else if (s.key === 'smoke') {
        for (let i = 0; i < 4; i++) b.smokes.push({ x: s.x + U.rand(-6, 6), y: s.y + U.rand(-6, 6), r: 8, t: 30, life: 30 });
      } else if (s.key === 'sleepgas') {
        for (let i = 0; i < 3; i++) b.gas.push({ x: s.x + U.rand(-5, 5), y: s.y + U.rand(-5, 5), r: 9, t: 20, life: 20 });
        b.gasBy = (b.units.find(u => u.side === 'player' && ALIVE(u)) || {}).uid;
      } else if (s.key === 'strike') {
        const src = b.units.find(u => u.side === 'player' && u.kind === 'op');
        for (let i = 0; i < 6; i++) {
          const ex = s.x + U.rand(-r * 0.7, r * 0.7), ey = s.y + U.rand(-r * 0.7, r * 0.7);
          b.fx.push({ type: 'boom', x: ex, y: ey, r: 8, t: -i * 0.25, life: 0.9 + i * 0.25 });
          for (const u of b.units) {
            if (!ACTIVE(u) || U.dist(u.x, u.y, ex, ey) > 7) continue;
            u.hp -= 90 * (1 - (u.armor || 0));
            if (u.hp <= 0 && u.state !== 'dead') Battle.incapacitate(b, u, src);
          }
        }
        Battle.noise(b, s.x, s.y, 250, 'player');
        if (b.alert < 2) { const any = b.units.find(u => u.side === 'enemy' && ALIVE(u)); if (any) Battle.raiseAlert(b, s.x, s.y, any); }
      }
    }
  },

  stepMines(b) {
    for (const m of b.mines) {
      if (!m.armed) continue;
      for (const u of b.units) {
        if (u.side === m.side || u.state !== 'ok' || u.kind === 'uav' || u.side === 'neutral') continue;
        if (U.dist(u.x, u.y, m.x, m.y) > 1.8) continue;
        m.armed = false;
        b.fx.push({ type: 'boom', x: m.x, y: m.y, r: 4, t: 0, life: 0.6, nl: true });
        for (const o of b.units) if (o.state === 'ok' && o.kind !== 'uav' && o.kind !== 'camera' && U.dist(o.x, o.y, m.x, m.y) < 4) Battle.sleep(b, o, null);
        if (m.side === 'enemy') { Battle.noise(b, m.x, m.y, 50, 'player'); Battle.say(b, 'Stun mine triggered!', 'bad'); }
        else { Battle.raiseAlert(b, m.x, m.y, null, true); Battle.say(b, 'An intruder triggered a stun mine.', 'ok'); }
        break;
      }
    }
  },

  // ---------- objectives / alert / phase ----------
  stepObjectives(b, h) {
    for (const o of b.objectives) {
      if (o.done) continue;
      if (o.type === 'eliminate') {
        const t = Battle.unit(b, o.tid);
        if (t && t.state === 'dead') { o.done = true; }
        if (t && ALIVE(t)) { o.x = t.x; o.y = t.y; }
      } else if (o.type === 'extract') {
        const t = Battle.unit(b, o.tid);
        if (t && t.state === 'dead') { o.failed = true; o.done = false; }
      } else if (o.type === 'sabotage' && o.planted) {
        o.boomT -= h;
        if (o.boomT <= 0) {
          o.done = true;
          b.fx.push({ type: 'boom', x: o.x, y: o.y, r: 12, t: 0, life: 1.2 });
          for (const u of b.units) if (ACTIVE(u) && U.dist(u.x, u.y, o.x, o.y) < 8) { u.hp -= 120; if (u.hp <= 0 && u.state !== 'dead') Battle.incapacitate(b, u, null); }
          Battle.noise(b, o.x, o.y, 160, 'player');
          Battle.caution(b);
          Battle.say(b, 'Charge detonated. Asset destroyed.', 'ok');
        }
      } else if (o.type === 'hold') {
        const inZone = b.units.filter(u => u.side === 'player' && ALIVE(u) && U.dist(u.x, u.y, o.x, o.y) < o.r).length;
        if (inZone) {
          o.prog += h;
          if (!o.started) { o.started = true; o.waveT = b.time + 8; Battle.say(b, 'Position secured. Hold until relief arrives!', 'info'); if (b.alert < 2) { const any = b.units.find(u => u.side === 'enemy' && ALIVE(u)); if (any) Battle.raiseAlert(b, o.x, o.y, any); } }
          if (o.prog >= o.need) { o.done = true; Battle.say(b, 'Relief force has arrived. Position held.', 'ok'); }
        }
        if (o.started && !o.done && b.time >= o.waveT) { o.waveT = b.time + 38; Battle.spawnWave(b, 1 + Math.ceil(b.diff / 3), o); }
      } else if (o.type === 'defend') {
        const intruders = b.units.filter(u => u.kind === 'intruder');
        if (intruders.every(u => u.state !== 'ok' && u.state !== 'extracted')) o.done = true;
      }
    }
    if (b.reinfT && b.time >= b.reinfT) {
      b.reinfT = null;
      if (b.alert === 2 && b.waves < b.maxWaves) { b.waves++; Battle.spawnWave(b, 2 + Math.ceil(b.diff / 2)); if (b.waves < b.maxWaves) b.reinfT = b.time + 50; }
    }
  },

  spawnWave(b, n, zone) {
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([sx, sy]) => U.dist(sx * 140, sy * 140, b.lz ? b.lz.x : 0, b.lz ? b.lz.y : 0) > 100);
    const [sx, sy] = U.pick(sides.length ? sides : [[1, 0]]);
    const lvl = 6 + (b.diff || 3) * 7;
    for (let i = 0; i < n; i++) {
      const p = Terrain.nearestFree(b, sx * 140 + (sy ? U.rand(-60, 60) : 0), sy * 140 + (sx ? U.rand(-60, 60) : 0), true);
      const e = Battle.enemy(b, U.chance(0.2) ? 'heavy' : 'soldier', lvl, p[0], p[1]);
      e.ai = { mode: 'search', home: 'search', aware: 0, inv: zone ? { x: zone.x, y: zone.y } : null };
      if (zone) { e.ai.mode = 'combat'; e.ai.lastSeen = { x: zone.x, y: zone.y, t: b.time }; e.ai.target = null; }
    }
    Battle.say(b, `Enemy reinforcements inbound (${n}).`, 'bad');
  },

  stepAlert(b, h) {
    if (b.kind === 'defend') {
      if (b.alert === 2) { b.alertT -= h; if (b.units.some(u => u.kind === 'intruder' && ALIVE(u) && u.vis)) b.alertT = 40; if (b.alertT <= 0) { b.alert = 1; b.alertT = 30; } }
      else if (b.alert === 1) { b.alertT -= h; if (b.alertT <= 0) b.alert = 0; }
      return;
    }
    if (b.alert === 2) {
      const engaged = b.units.some(e => e.side === 'enemy' && ALIVE(e) && e.ai && e.ai.mode === 'combat' && e.ai.lastSeen && b.time - e.ai.lastSeen.t < 4);
      if (engaged) b.alertT = 70;
      else b.alertT -= h;
      if (b.alertT <= 0) {
        b.alert = 1; b.alertT = 60;
        Battle.say(b, 'Enemy has lost contact. Evasion → Caution.', 'info');
        for (const e of b.units) if (e.side === 'enemy' && e.ai && (e.ai.mode === 'search' || e.ai.mode === 'combat')) { e.ai.mode = e.ai.home || 'guard'; e.ai.aware = 0; e.path = null; }
      }
    } else if (b.alert === 1) {
      b.alertT -= h;
      if (b.alertT <= 0) { b.alert = 0; Battle.say(b, 'Enemy has stood down.', 'info'); }
    }
  },

  primaryDone(b) {
    const objs = b.objectives;
    if (b.kind === 'defend') return objs[0].done;
    return objs.length > 0 && objs.every(o => o.done);
  },

  stepPhase(b, h) {
    const ops = b.units.filter(u => u.side === 'player' && u.kind === 'op');
    if (b.kind === 'defend') {
      Battle.stepResponders(b);
      const intr = b.units.filter(u => u.kind === 'intruder');
      if (Battle.primaryDone(b)) return Battle.end(b, true);
      if (intr.every(u => u.state === 'extracted' || u.state === 'dead' || u.state === 'asleep' || u.state === 'fultoned') && intr.some(u => u.state === 'extracted')) return Battle.end(b, false);
      if (b.time > b.timeLimit) return Battle.end(b, !b.coreHacked);
      return;
    }
    // extraction failure states
    const ext = b.objectives.find(o => o.type === 'extract' && o.failed);
    if (ext && !b.abort) { b.abort = true; Battle.say(b, 'The hostage is dead. Mission failed — return to the LZ.', 'bad'); }
    if (b.phase === 'active' && Battle.primaryDone(b)) {
      b.phase = 'exfil';
      Battle.say(b, 'All objectives complete. Head to the LZ for extraction.', 'ok');
      if (UI.focused !== b.id) Game.notify('OBJECTIVES COMPLETE', `${b.team} is moving to exfil at ${b.place}.`, 'ok', [], { ttl: 6 });
    }
    if (b.time > b.timeLimit && !b.abort && b.phase !== 'exfil') { b.abort = true; Battle.say(b, 'Operation window closed. Aborting — return to the LZ.', 'bad'); }
    if (b.phase === 'exfil' || b.abort) {
      for (const u of ops) {
        if (u.state !== 'ok') continue;
        if (U.dist(u.x, u.y, b.lz.x, b.lz.y) < b.lz.r) { u.lzT += h; if (u.lzT > 2) { u.state = 'extracted'; u.path = null; b.fx.push({ type: 'heli', x: u.x, y: u.y, t: 0, life: 2 }); } }
        else u.lzT = 0;
      }
    }
    const standing = ops.filter(u => u.state === 'ok' || u.state === 'asleep');
    if (!standing.length || b.time > b.timeLimit + 300) {
      const success = Battle.primaryDone(b) && !b.objectives.some(o => o.failed);
      Battle.end(b, success);
    }
  },

  end(b, success) {
    if (b.phase === 'done') return;
    b.phase = 'done';
    // left-behind operatives
    for (const u of b.units) {
      if (u.side !== 'player' || u.kind !== 'op') continue;
      if (b.kind === 'defend') { if (u.state === 'asleep') u.state = 'ok'; else if (u.state === 'down') u.state = 'fultoned'; continue; }
      if (u.state === 'down' || u.state === 'asleep' || (u.state === 'ok' && b.kind !== 'defend' && b.time > b.timeLimit + 300)) {
        // left behind: recovered if we won or have Fulton Mk2; otherwise a coin flip between an emergency pickup and capture
        if (success || RnD.fultonLevel() >= 2 || u.state === 'ok' || U.chance(0.6)) u.state = u.state === 'ok' ? 'extracted' : 'fultoned';
        else u.state = 'captured';
      }
    }
    const fultoned = [...(b.fultoned || [])];
    if (b.kind === 'defend' && success) for (const u of b.units) if (u.kind === 'intruder' && u.state === 'asleep') fultoned.push({ kind: 'enemy', lvl: u.lvl, uid: u.uid });
    b.result = { success, fultoned, targetFulton: !!b.targetFulton, coreHacked: !!b.coreHacked };
    Battle.say(b, success ? 'MISSION COMPLETE' : 'MISSION FAILED', success ? 'ok' : 'bad');
    Contracts.onBattleEnd(b);
    if (UI.focused === b.id) {
      Sfx.play(success ? 'win' : 'fail');
      Fx.result(success, b.result.grade, b.title);
      setTimeout(() => { if (!UI.modalOpen() && (UI.focused === b.id || !UI.focused)) ACT.showReport({ id: b.id }); }, 3900);
    } else Sfx.at(b, 0, 0, success ? 'win' : 'fail', { gain: 0.6 });
    Bus.emit('battleEnd', b);
  },

  // ---------- persistence ----------
  serialize(b) {
    const o = { ...b };
    delete o.grid; delete o.reach; o.fx = [];
    return o;
  },
  deserialize(o) {
    if (o.phase === 'loading' || o.phase === 'done') return null;
    const b = { ...o };
    Terrain.makeGrid(b);
    const anchor = b.lz || { x: 0, y: 14 };
    b.reach = Terrain.flood(b, anchor.x, anchor.y);
    b.fx = []; b.acc = 0;
    return b;
  },
};
