'use strict';
// ---------- Research & Development ----------
const RnD = {
  has(id) { return !!(G && G.rnd.done[id]); },

  slots() { return 1 + Math.floor(Staff.level('rnd') / 25); },

  cost(it) {
    const m = Base.costMult();
    const c = {};
    for (const k of RES_KEYS) if (it.cost && it.cost[k]) c[k] = Math.round(it.cost[k] * m);
    return c;
  },

  missing(it) {
    const out = [];
    for (const [d, v] of Object.entries(it.req || {})) if (Staff.level(d) < v) out.push(`${DEPTS[d].short} ${v}`);
    if (it.pre && !RnD.has(it.pre)) out.push(RD[it.pre].name);
    return out;
  },

  state(id) {
    if (RnD.has(id)) return 'done';
    if (G.rnd.active.some(a => a.id === id)) return 'active';
    return RnD.missing(RD[id]).length ? 'locked' : 'available';
  },

  canStart(id) {
    const it = RD[id];
    const st = RnD.state(id);
    if (st !== 'available') return st === 'locked' ? 'Requirements not met' : 'Already ' + st;
    if (G.rnd.active.length >= RnD.slots()) return 'All R&D teams busy';
    if (!Base.canAfford(RnD.cost(it))) return 'Insufficient resources';
    return null;
  },

  start(id) {
    const why = RnD.canStart(id);
    if (why) { Game.notify('CANNOT DEVELOP', why, 'bad'); return; }
    const it = RD[id];
    Base.spend(RnD.cost(it));
    G.rnd.active.push({ id, left: it.hours, total: it.hours });
    Game.log(`Development started: ${it.name}.`, 'info');
    UI.dirty();
  },

  cancel(id) {
    const i = G.rnd.active.findIndex(a => a.id === id);
    if (i < 0) return;
    G.rnd.active.splice(i, 1);
    Base.give(RnD.cost(RD[id]), 0.5);
    Game.log(`Development cancelled: ${RD[id].name} (50% refunded).`, 'info');
    UI.dirty();
  },

  queue() { return G.rnd.queue || (G.rnd.queue = []); },
  enqueue(id) {
    const q = RnD.queue();
    if (q.includes(id) || RnD.state(id) !== 'available') return;
    q.push(id);
    Game.log(`Queued for development: ${RD[id].name}.`, 'info');
    UI.dirty();
  },
  dequeue(id) { const q = RnD.queue(); const i = q.indexOf(id); if (i >= 0) q.splice(i, 1); UI.dirty(); },
  // start queued projects when a team frees up
  pump() {
    const q = RnD.queue();
    for (const id of [...q]) {
      if (G.rnd.active.length >= RnD.slots()) break;
      const st = RnD.state(id);
      if (st === 'done' || st === 'active') { q.splice(q.indexOf(id), 1); continue; }
      if (!RnD.canStart(id)) { q.splice(q.indexOf(id), 1); RnD.start(id); }
    }
  },

  speed() {
    const sci = Staff.inDept('rnd').filter(s => Staff.has(s, 'scientist')).length;
    return 1 + Staff.level('rnd') / 70 + Math.min(0.5, sci * 0.1);
  },

  hourly() {
    const sp = RnD.speed();
    for (const a of [...G.rnd.active]) {
      a.left -= sp;
      if (a.left <= 0) {
        G.rnd.active.splice(G.rnd.active.indexOf(a), 1);
        G.rnd.done[a.id] = 1;
        const it = RD[a.id];
        Game.log(`Development complete: ${it.name}.`, 'ok');
        Game.notify('DEVELOPMENT COMPLETE', it.name, 'ok', [], { sound: 'chime' });
      }
    }
    RnD.pump();
  },

  // derived gear values
  fultonLevel() { return RnD.has('fulton3') ? 3 : RnD.has('fulton2') ? 2 : 1; },
  fultonChance() { return [0, 0.7, 0.85, 1][RnD.fultonLevel()]; },
  fultonTime() { return [0, 5, 3.5, 2][RnD.fultonLevel()]; },
  armor() { return RnD.has('armor2') ? 0.38 : RnD.has('armor1') ? 0.2 : 0; },
  weapons() { return PLAYER_WEAPONS.filter(w => RnD.has(w)); },
};
