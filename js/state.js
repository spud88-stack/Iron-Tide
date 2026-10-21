'use strict';
// ---------- game state, clock, save/load ----------
let G = null;
const SAVE_KEY = 'irontide_save_v1';

const Game = {
  newGame({ name, zoneId, emblemSeed }) {
    const z = ZONE[zoneId] || ZONES[0];
    G = {
      v: 1,
      time: 8 * 60,
      nextHour: 9 * 60,
      speedIdx: 1,
      nid: 1,
      base: {
        name: name || 'Mother Base', emblemSeed: emblemSeed || U.randi(1, 1e9), zone: z.id, lat: z.lat, lng: z.lng,
        plat: { command: 1, combat: 1, rnd: 1, basedev: 1, support: 1, intel: 0, medical: 0, quarantine: 0 },
        builds: [],
      },
      res: { gmp: 260000, fuel: 900, bio: 450, common: 3200, minor: 650, precious: 160 },
      raw: { fuel: 400, bio: 300, common: 1400, minor: 300, precious: 60 },
      heroism: 600,
      points: 0,
      moraleHit: 0,
      staff: [], memorial: [],
      rnd: { done: {}, active: [] },
      fobs: [], pfs: [], contracts: [], deps: [], battles: [], threats: [], scouts: [],
      log: [],
      stats: { missions: 0, success: 0, kills: 0, sleeps: 0, fultons: 0, deaths: 0, infiltrations: 0, defenses: 0 },
      settings: { autoDismiss: true, autoAssignRecruits: true, pauseOnInvasion: true, osm: true, satellite: false, focusOnArrival: false },
      dayStats: { income: 0, upkeep: 0 },
      outbreak: null,
    };
    for (const it of RD_ITEMS) if (it.start) G.rnd.done[it.id] = 1;
    // starting staff
    const prim = ['combat', 'combat', 'combat', 'combat', 'combat', 'combat', 'combat', 'combat', 'rnd', 'rnd', 'rnd', 'rnd', 'rnd', 'basedev', 'basedev', 'basedev', 'basedev', 'basedev', 'support', 'support', 'support', 'support', 'intel', 'intel', 'medical', 'medical'];
    for (const p of prim) G.staff.push(Staff.gen({ level: U.randi(9, 22), primary: p }));
    // two veterans
    G.staff.push(Staff.gen({ level: 34, primary: 'combat', skills: ['leader'] }));
    G.staff.push(Staff.gen({ level: 30, primary: 'combat', skills: ['sharpshooter'] }));
    Staff.autoAssign(true);
    PF.generateAll(14);
    Contracts.fill(true);
    Game.log(`${G.base.name} established at ${z.name}. All departments report ready.`, 'ok');
    Game.log('Contracts are flowing in. Open OPS to deploy a squad — or zoom right into any city on the map.', 'info');
    Staff.recalc();
  },

  id() { return G.nid++; },

  log(msg, type = 'info') {
    G.log.unshift({ t: G.time, msg, type });
    if (G.log.length > 400) G.log.length = 400;
    Bus.emit('log', G.log[0]);
  },

  notify(title, msg, type = 'info', actions = [], opts = {}) {
    if (typeof UI !== 'undefined') UI.toast(title, msg, type, actions, opts);
  },

  speed() { return SPEEDS[G.speedIdx]; },
  setSpeed(i) { G.speedIdx = U.clamp(i, 0, SPEEDS.length - 1); Bus.emit('speed'); },

  advance(mins) {
    G.time += mins;
    let guard = 0;
    while (G.time >= G.nextHour && guard++ < 100) {
      const hourAt = G.nextHour;
      G.nextHour += 60;
      Game.hourly(hourAt);
    }
  },

  hourly(at) {
    Staff.recalc();
    Base.hourly();
    RnD.hourly();
    Staff.hourly();
    PF.hourly();
    Contracts.hourly();
    if (at % 1440 === 0) Game.daily();
    if (at % 360 === 0) Game.save(true);
    Bus.emit('hour');
    UI.dirty();
  },

  daily() {
    Base.daily();
    Staff.daily();
    PF.daily();
    const d = Math.floor(G.time / 1440) + 1;
    Game.log(`Day ${d} report — income ${U.fmt(G.dayStats.income)} GMP, upkeep ${U.fmt(G.dayStats.upkeep)} GMP.`, G.dayStats.income >= G.dayStats.upkeep ? 'info' : 'bad');
  },

  serialize() {
    const battles = G.battles.map(b => Battle.serialize(b));
    return JSON.stringify({ ...G, battles });
  },

  save(auto = false) {
    if (!G) return;
    try {
      localStorage.setItem(SAVE_KEY, Game.serialize());
      if (!auto) Game.notify('SAVED', 'Game state written to local storage.', 'ok');
    } catch (e) {
      console.error(e);
      // battles with large building sets can blow the quota: retry without terrain detail
      try {
        const lite = JSON.parse(Game.serialize());
        lite.battles = [];
        localStorage.setItem(SAVE_KEY, JSON.stringify(lite));
      } catch (e2) { if (!auto) Game.notify('SAVE FAILED', String(e2), 'bad'); }
    }
  },

  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      G = d;
      G.battles = (d.battles || []).map(b => Battle.deserialize(b)).filter(Boolean);
      // deployments whose battle could not be restored resolve as returning
      for (const dep of G.deps) {
        if (dep.state === 'engaged' && !G.battles.find(b => b.id === dep.battleId)) Contracts.orphanedDeployment(dep);
      }
      Staff.recalc();
      return true;
    } catch (e) { console.error(e); return false; }
  },

  wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } },
};
