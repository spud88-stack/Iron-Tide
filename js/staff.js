'use strict';
// ---------- staff management ----------
const Staff = {
  levels: {},

  gen(o = {}) {
    const lvl = o.level ?? 10;
    const primary = o.primary || U.pick(DEPT_KEYS);
    const stats = {};
    for (const d of DEPT_KEYS) {
      const v = d === primary ? lvl + U.gauss(0, o.spread ?? 4) : lvl * U.rand(0.2, 0.85) + U.gauss(0, 3);
      stats[d] = U.clamp(Math.round(v * 10) / 10, 1, 120);
    }
    // occasional secondary specialty
    if (U.chance(0.18)) { const d2 = U.pick(DEPT_KEYS); stats[d2] = Math.max(stats[d2], U.clamp(lvl * U.rand(0.85, 1.05), 1, 120)); }
    const [nat, pool] = o.nat ? NATIONS.find(n => n[0] === o.nat) || U.pick(NATIONS) : U.pick(NATIONS);
    const np = NAME_POOLS[pool];
    const skills = o.skills ? [...o.skills] : [];
    if (!o.skills) {
      const nSk = U.chance(0.35 + lvl / 200) ? (U.chance(0.12 + lvl / 300) ? 2 : 1) : 0;
      const pool2 = Object.entries(SKILLS).filter(([, v]) => v.w > 0);
      for (let i = 0; i < nSk; i++) {
        const [id] = U.weighted(pool2, ([, v]) => v.w * (v.dept === primary ? 3 : 1));
        if (!skills.includes(id)) skills.push(id);
      }
      if (U.chance(o.troubleChance ?? 0.06)) skills.push('troublemaker');
    }
    let callsign;
    for (let i = 0; i < 20; i++) {
      callsign = `${U.pick(CALL_ADJ)} ${U.pick(CALL_NOUN)}`;
      if (!G || !G.staff.some(s => s.callsign === callsign)) break;
    }
    return {
      id: Game.id(),
      name: `${U.pick(np.f)} ${U.pick(np.l)}`,
      callsign,
      nat, age: U.randi(19, 52),
      stats, skills,
      dept: o.dept || 'waiting',
      status: 'active',
      morale: U.randi(55, 78),
      loyalty: o.loyalty ?? 100,
      origin: o.origin || 'volunteer',
      joined: G ? G.time : 0,
      kills: 0, sleeps: 0, missions: 0, fultons: 0,
      pseed: U.randi(1, 2e9),
      fav: false, sec: null, until: 0,
    };
  },

  byId(id) { return G.staff.find(s => s.id === id); },
  grade(v) { let g = 'E'; for (const [n, t] of GRADES) if (v >= t) g = n; return g; },
  gradeHtml(v) { const g = Staff.grade(v); return `<span class="g ${GRADE_CLASS[g]}">${g}</span>`; },
  best(s) { return DEPT_KEYS.reduce((a, d) => s.stats[d] > s.stats[a] ? d : a, DEPT_KEYS[0]); },
  bestVal(s) { return s.stats[Staff.best(s)]; },
  has(s, sk) { return s.skills.includes(sk); },
  portrait(s) { return Art.portrait(s.pseed); },

  eff(s, d) {
    let v = s.stats[d] * (0.85 + s.morale / 100 * 0.3);
    const bonus = { rnd: 'scientist', basedev: 'engineer', medical: 'surgeon', intel: 'analyst', support: 'quartermaster' }[d];
    if (bonus && Staff.has(s, bonus)) v += 10;
    return v;
  },

  cap(d) { return (G.base.plat[d] || 0) * 15; },
  inDept(d) { return G.staff.filter(s => s.dept === d); },
  count(d) { let n = 0; for (const s of G.staff) if (s.dept === d) n++; return n; },
  waitingCap() { return 20 + G.base.plat.command * 10; },
  levelCap(d) { return (G.base.plat[d] || 0) * 25; },
  level(d) { return Staff.levels[d] || 0; },
  total() { return G.staff.filter(s => s.dept !== 'brig').length; },

  recalc() {
    const sums = {};
    for (const d of DEPT_KEYS) sums[d] = 0;
    for (const s of G.staff) {
      if (!DEPTS[s.dept] || s.status === 'injured' || s.status === 'sick') continue;
      sums[s.dept] += Staff.eff(s, s.dept);
    }
    for (const d of DEPT_KEYS) Staff.levels[d] = Math.min(Staff.levelCap(d), Math.round(sums[d] / 25));
  },

  // squad-ready combat staff
  deployable(s) { return s.dept === 'combat' && s.status === 'active' && !s.sec; },

  assign(s, d, quiet) {
    if (s.dept === d) return true;
    if (s.status === 'deployed') { if (!quiet) Game.notify('UNAVAILABLE', `${s.name} is deployed.`, 'bad'); return false; }
    if (s.dept === 'brig') { if (!quiet) Game.notify('PRISONER', `${s.name} has not joined yet (loyalty ${Math.round(s.loyalty)}%).`, 'bad'); return false; }
    if (DEPTS[d] && Staff.count(d) >= Staff.cap(d)) { if (!quiet) Game.notify('DEPARTMENT FULL', `${DEPTS[d].name} is at capacity. Build more platforms.`, 'bad'); return false; }
    if (d === 'waiting' && Staff.count('waiting') >= Staff.waitingCap()) { if (!quiet) Game.notify('WAITING ROOM FULL', 'No room in the waiting room.', 'bad'); return false; }
    s.dept = d;
    if (d !== 'combat') s.sec = null;
    Staff.recalc();
    return true;
  },

  autoAssign(all = false) {
    const pool = G.staff.filter(s => s.dept !== 'brig' && s.status !== 'deployed' && !s.sec && (all || !s.fav));
    for (const s of pool) s.dept = 'waiting';
    pool.sort((a, b) => Staff.bestVal(b) - Staff.bestVal(a));
    const counts = {}; for (const d of DEPT_KEYS) counts[d] = Staff.count(d);
    for (const s of pool) {
      const order = [...DEPT_KEYS].sort((a, b) => s.stats[b] - s.stats[a]);
      for (const d of order) {
        if (counts[d] < Staff.cap(d)) { s.dept = d; counts[d]++; break; }
      }
    }
    Staff.recalc();
  },

  dismiss(s, why) {
    const i = G.staff.indexOf(s); if (i < 0) return;
    G.staff.splice(i, 1);
    if (why) Game.log(`${s.name} "${s.callsign}" ${why}.`, 'info');
    Staff.recalc();
  },

  kill(s, cause) {
    const i = G.staff.indexOf(s); if (i < 0) return;
    G.staff.splice(i, 1);
    G.memorial.unshift({ name: s.name, callsign: s.callsign, nat: s.nat, pseed: s.pseed, t: G.time, cause, best: Staff.grade(Staff.bestVal(s)) + ' ' + DEPTS[Staff.best(s)].short, missions: s.missions, kills: s.kills });
    G.stats.deaths++;
    G.moraleHit = Math.min(30, G.moraleHit + 5);
    Game.log(`KIA: ${s.name} "${s.callsign}" — ${cause}.`, 'bad');
    Staff.recalc();
  },

  medMult(s) {
    let m = G.base.plat.medical === 0 ? 1.6 : 1 - Math.min(0.6, Staff.level('medical') / 100);
    if (RnD.has('medbay')) m *= 0.5;
    if (Staff.has(s, 'hardy')) m *= 0.5;
    return m;
  },

  injure(s, hours, why) {
    s.status = 'injured';
    s.until = G.time + hours * 60 * Staff.medMult(s);
    if (why) Game.log(`${s.name} injured (${why}). Recovery ~${U.fmtDur(s.until - G.time)}.`, 'bad');
    Staff.recalc();
  },

  // add a new person to Mother Base (volunteer, fulton, prisoner)
  recruit(s, src) {
    if (s.dept === 'brig') { G.staff.push(s); return true; }
    s.dept = 'waiting';
    G.staff.push(s);
    const waiting = Staff.inDept('waiting');
    if (waiting.length > Staff.waitingCap()) {
      if (G.settings.autoDismiss) {
        waiting.sort((a, b) => Staff.bestVal(a) - Staff.bestVal(b));
        const worst = waiting.find(w => !w.fav);
        if (worst) { Staff.dismiss(worst); if (worst === s) return false; }
      }
    }
    return true;
  },

  moraleTarget(s, deptTrouble) {
    let t = 60;
    if (RnD.has('messhall')) t += 10;
    if (RnD.has('hydro')) t += Math.min(8, Staff.level('basedev') / 12);
    t += Math.min(15, G.staff.filter(x => x.dept !== 'brig' && Staff.has(x, 'cook')).length * 3);
    if (G.res.gmp < 0) t -= 25;
    t -= G.moraleHit;
    if (deptTrouble && deptTrouble[s.dept]) t -= 10;
    if (s.status === 'injured' || s.status === 'sick') t -= 5;
    return U.clamp(t, 5, 100);
  },

  troubleMap() {
    const m = {};
    for (const d of DEPT_KEYS) {
      const st = Staff.inDept(d);
      const tm = st.filter(s => Staff.has(s, 'troublemaker')).length;
      const dip = st.filter(s => Staff.has(s, 'diplomat')).length;
      m[d] = tm > dip ? tm - dip : 0;
    }
    return m;
  },

  hourly() {
    for (const s of G.staff) {
      if ((s.status === 'injured' || s.status === 'sick') && G.time >= s.until) {
        s.status = 'active';
        Game.log(`${s.name} has recovered and returned to duty.`, 'ok');
      }
    }
    if (G.outbreak && !G.staff.some(s => s.status === 'sick')) { G.outbreak = null; Game.log('Outbreak contained. Quarantine lifted.', 'ok'); }
  },

  daily() {
    const trouble = Staff.troubleMap();
    // morale drift
    for (const s of G.staff) {
      if (s.dept === 'brig') continue;
      const t = Staff.moraleTarget(s, trouble);
      s.morale = U.clamp(s.morale + (t - s.morale) * 0.3 + U.gauss(0, 2), 0, 100);
    }
    G.moraleHit *= 0.7;
    // fights
    for (const d of DEPT_KEYS) {
      if (!trouble[d] || !U.chance(0.3 + trouble[d] * 0.1)) continue;
      const pool = Staff.inDept(d).filter(s => s.status === 'active');
      const n = Math.min(pool.length, U.randi(1, 2));
      const hurt = U.shuffle(pool).slice(0, n);
      hurt.forEach(s => Staff.injure(s, U.randi(10, 40)));
      if (hurt.length) {
        Game.log(`Fight in ${DEPTS[d].name}! ${hurt.map(s => s.name).join(', ')} injured. A Diplomat would keep the peace.`, 'bad');
        Game.notify('BRAWL', `Troublemakers started a fight in ${DEPTS[d].name}.`, 'bad');
      }
    }
    // desertion
    for (const s of [...G.staff]) {
      if (s.dept !== 'brig' && s.status === 'active' && s.morale < 22 && !s.fav && U.chance(0.12)) {
        Staff.dismiss(s, 'deserted due to low morale');
        Game.notify('DESERTION', `${s.name} deserted. Morale is critically low.`, 'bad');
      }
    }
    // disease
    if (!G.outbreak && G.staff.length > 24 && U.chance(0.035)) {
      G.outbreak = { started: G.time };
      Game.notify('OUTBREAK', 'An infectious disease is spreading on Mother Base!', 'bad');
      Game.log('Disease outbreak detected. Build a Quarantine platform to contain it.', 'bad');
      Staff.infect(U.randi(2, 5));
    } else if (G.outbreak) {
      if (G.base.plat.quarantine === 0) Staff.infect(Math.ceil(G.staff.filter(s => s.status === 'sick').length * 0.6));
      else if (U.chance(0.25 / G.base.plat.quarantine)) Staff.infect(1);
    }
    // brig conversion
    const intelL = Staff.level('intel');
    const intelSt = Staff.inDept('intel');
    const interro = intelSt.filter(s => Staff.has(s, 'interrogator')).length * 4 + intelSt.filter(s => Staff.has(s, 'linguist')).length * 2;
    for (const s of G.staff) {
      if (s.dept !== 'brig') continue;
      s.loyalty += (6 + intelL * 0.5 + interro) * (RnD.has('interrog') ? 2 : 1) * (G.base.plat.intel ? 1 : 0.5);
      if (s.loyalty >= 100) {
        s.loyalty = 100; s.dept = 'waiting'; s.morale = 50;
        Game.log(`Prisoner ${s.name} "${s.callsign}" has joined ${G.base.name}.`, 'ok');
      }
    }
    // training & experience
    const train = RnD.has('training');
    for (const s of G.staff) {
      if (!DEPTS[s.dept] || s.status !== 'active') continue;
      s.stats[s.dept] = Math.min(120, s.stats[s.dept] + 0.05 + (train && s.dept === 'combat' ? 0.3 : 0));
    }
    // volunteers
    const n = Math.min(7, 1 + Math.floor(G.heroism / 2500) + (U.chance(0.5) ? 1 : 0));
    let joined = 0;
    for (let i = 0; i < n; i++) {
      const lvl = 6 + Math.min(32, G.heroism / 600) + G.base.plat.command * 2 + U.gauss(0, 5);
      if (Staff.recruit(Staff.gen({ level: Math.max(2, lvl) }), 'volunteer')) joined++;
    }
    if (joined) Game.log(`${joined} volunteer${joined > 1 ? 's' : ''} arrived at the waiting room.`, 'info');
    if (G.settings.autoAssignRecruits !== false) Staff.placeWaiting();
    Staff.recalc();
  },

  // move waiting-room staff into departments with free capacity (best fit first)
  placeWaiting() {
    const waiting = Staff.inDept('waiting').filter(s => !s.fav).sort((a, b) => Staff.bestVal(b) - Staff.bestVal(a));
    let placed = 0;
    for (const s of waiting) {
      const order = [...DEPT_KEYS].sort((a, b) => s.stats[b] - s.stats[a]);
      const d = order.find(d => Staff.count(d) < Staff.cap(d));
      if (d) { s.dept = d; placed++; }
    }
    return placed;
  },

  infect(n) {
    const pool = U.shuffle(G.staff.filter(s => s.status === 'active' && s.dept !== 'brig' && !Staff.has(s, 'hardy')));
    const q = G.base.plat.quarantine;
    pool.slice(0, n).forEach(s => {
      s.status = 'sick';
      s.until = G.time + U.randi(36, 96) * 60 * Staff.medMult(s) * (q ? 0.7 : 1);
    });
    if (n > 0) Game.log(`${Math.min(n, pool.length)} staff fell ill.`, 'bad');
    Staff.recalc();
  },

  // post-battle growth
  grow(s, amt) { s.stats.combat = Math.min(120, s.stats.combat + amt); },
};
