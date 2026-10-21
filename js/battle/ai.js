'use strict';
// ---------- battle AI: enemy guards, intruders, delegated squads, FOB defenders ----------
const BAI = {
  think(b) {
    for (const u of b.units) {
      if (!ALIVE(u)) continue;
      if (u.side === 'enemy') {
        if (u.kind === 'intruder') BAI.intruder(b, u);
        else if (u.kind !== 'camera' && u.kind !== 'uav') BAI.enemy(b, u);
      }
    }
    if (b.kind === 'defend') BAI.defenders(b);
    else BAI.squad(b);
    for (const u of b.units) if (u.side === 'player' && ALIVE(u)) BAI.exec(b, u);
  },

  // (re)plans a route; returns true once the unit has finished its route to (roughly) this target
  repath(b, u, x, y, tol = 3) {
    if (u.ptx && u.path && U.dist(u.ptx[0], u.ptx[1], x, y) <= tol) return u.path.length === 0;
    u.path = Terrain.findPath(b, u.x, u.y, x, y);
    u.ptx = [x, y];
    return !u.path;
  },

  // ----- hostile guards -----
  enemy(b, e) {
    const ai = e.ai;
    switch (ai.mode) {
      case 'guard': {
        if (!ai.post) ai.post = { x: e.x, y: e.y, face: e.face };
        if (U.dist(e.x, e.y, ai.post.x, ai.post.y) > 2.5 && !BAI.repath(b, e, ai.post.x, ai.post.y)) break;
        ai.faceT = ai.post.face + Math.sin(b.time * 0.35 + e.uid) * 1.1;
        break;
      }
      case 'patrol': {
        if (ai.pause > 0) { ai.pause -= 0.5; ai.faceT = (ai.faceT ?? e.face) + U.rand(-0.6, 0.6); break; }
        const wp = ai.wps[ai.wpi % ai.wps.length];
        if (U.dist(e.x, e.y, wp[0], wp[1]) < 2.5 || BAI.repath(b, e, wp[0], wp[1])) { ai.wpi = (ai.wpi + 1) % ai.wps.length; ai.pause = U.rand(1, 4); e.path = null; }
        break;
      }
      case 'investigate': {
        if (!ai.inv) { ai.mode = ai.home || 'guard'; break; }
        const d = U.dist(e.x, e.y, ai.inv.x, ai.inv.y);
        if (d > 2.5 && ai.look > 0 && !ai.arrived) {
          if (BAI.repath(b, e, ai.inv.x, ai.inv.y)) ai.arrived = true;
        } else {
          ai.arrived = true; e.path = null;
          ai.look -= 0.5;
          ai.faceT = U.rand(-Math.PI, Math.PI);
          if (ai.wake) {
            const s = Battle.unit(b, ai.wake);
            if (s && s.state === 'asleep' && U.dist(e.x, e.y, s.x, s.y) < 4) { s.state = 'ok'; s.sleepT = 0; s.stun = 0; s.ai.mode = 'investigate'; s.ai.inv = { x: s.x, y: s.y }; s.ai.look = 3; s.ai.arrived = true; Battle.icon(s, '!'); }
            ai.wake = null;
          }
          if (ai.look <= 0) { ai.mode = ai.home || 'guard'; ai.aware = 0; ai.arrived = false; ai.inv = null; }
        }
        break;
      }
      case 'search': {
        if (b.alert < 2) { ai.mode = ai.home === 'search' ? 'patrol' : (ai.home || 'guard'); if (ai.mode === 'patrol' && !ai.wps) { ai.wps = [[e.x, e.y], Terrain.randomReachable(b, e.x, e.y, 20, 60)]; ai.wpi = 1; ai.pause = 0; } e.path = null; break; }
        const lk = ai.inv || b.lastKnown;
        if (!lk) break;
        if (!e.path || !e.path.length) {
          const p = Terrain.randomReachable(b, lk.x, lk.y, 0, 18, 30);
          e.path = Terrain.findPath(b, e.x, e.y, p[0], p[1]); e.ptx = p;
          ai.inv = null;
        }
        break;
      }
      case 'combat': {
        let t = Battle.unit(b, ai.target);
        if (!t || t.state !== 'ok') {
          // switch to another visible hostile
          t = null;
          for (const o of b.units) if (o.side === 'player' && o.state === 'ok' && o.kind !== 'camera' && o.kind !== 'uav' && Battle.canSee(b, e, o, e.vision)) { t = o; break; }
          if (t) ai.target = t.uid;
          else { ai.mode = 'search'; e.path = null; break; }
        }
        const w = WEAPONS[e.weapon];
        const d = U.dist(e.x, e.y, t.x, t.y);
        const seen = Battle.canSee(b, e, t, e.vision * 1.3);
        if (seen) ai.lastSeen = { x: t.x, y: t.y, t: b.time };
        if (seen && d <= w.range * 0.85) { e.path = null; }
        else if (e.kind === 'sniper' && seen) { e.path = null; }
        else if (ai.lastSeen) {
          const there = BAI.repath(b, e, ai.lastSeen.x, ai.lastSeen.y, 5);
          if (there && b.time - ai.lastSeen.t > 6) { ai.mode = 'search'; e.path = null; }
        } else { ai.mode = 'search'; e.path = null; }
        break;
      }
    }
  },

  // ----- rival PF intruders on our FOB -----
  intruder(b, e) {
    const pad = b.intruderPad;
    if (b.coreHacked || e.ai.exfil) {
      if (U.dist(e.x, e.y, pad.x, pad.y) < 4) { e.state = 'extracted'; b.fx.push({ type: 'heli', x: e.x, y: e.y, t: 0, life: 2 }); return; }
      BAI.repath(b, e, pad.x, pad.y);
      e.stance = 'assault';
      return;
    }
    if (e.act) return;
    e.stance = b.alert === 2 ? 'assault' : 'stealth';
    if (e.ai.delay > 0) { e.ai.delay -= 0.5; return; }
    // steal sleeping staff if nobody is watching
    const guards = b.units.filter(u => u.side === 'player' && u.state === 'ok' && u.kind !== 'camera' && u.kind !== 'uav' && U.dist(u.x, u.y, e.x, e.y) < 22);
    let sleeper = null, sd = 16;
    for (const u of b.units) {
      if (!Battle.fultonable(b, e, u)) continue;
      const d = U.dist(u.x, u.y, e.x, e.y);
      if (d < sd) { sd = d; sleeper = u; }
    }
    if (sleeper && !guards.length) {
      if (sd < 2.5) Battle.startAct(b, e, 'fulton', sleeper.uid, 4);
      else BAI.repath(b, e, sleeper.x, sleeper.y);
      return;
    }
    if (e.ai.via && b.alert < 2) {
      const [vx, vy] = e.ai.via;
      if (U.dist(e.x, e.y, vx, vy) < 4 || BAI.repath(b, e, vx, vy)) { e.ai.via = null; e.path = null; }
      else return;
    }
    const d = U.dist(e.x, e.y, 0, 0);
    if (d < 4) { Battle.startAct(b, e, 'hack', null, Math.max(10, 20 - e.lvl / 10)); return; }
    BAI.repath(b, e, 0, 0);
  },

  // ----- our squad when delegated -----
  squad(b) {
    const sq = b.units.filter(u => u.side === 'player' && u.kind === 'op' && ALIVE(u));
    if (!sq.length) return;
    const free = u => !u.manual && !u.act && (!u.order || u.order.ai);
    const aiOrder = (u, ord) => {
      const o = u.order;
      if (o && o.ai && o.type === ord.type) {
        if (ord.tid !== undefined && o.tid === ord.tid) return;
        if (ord.oid !== undefined && o.oid === ord.oid) return;
        if (ord.type === 'move' && U.dist(o.x, o.y, ord.x, ord.y) < 6) return;
      }
      Battle.order(b, [u.uid], ord, true);
    };
    for (const u of sq) if (!u.manual && !u.stanceLocked) u.stance = b.alert === 2 ? 'assault' : (b.opts.stance || 'stealth');

    const used = new Set();
    for (const u of sq) { if (u.order && u.order.tid) used.add(u.order.tid); if (u.act && u.act.ref) used.add(u.act.ref); }
    const nearestFree = (x, y, maxD = Infinity) => {
      let best = null, bd = maxD;
      for (const u of sq) { if (!free(u)) continue; const d = U.dist(u.x, u.y, x, y); if (d < bd) { bd = d; best = u; } }
      return best;
    };
    const hostileNear = (x, y, r) => b.units.some(e => e.side === 'enemy' && ALIVE(e) && e.ai && e.ai.mode === 'combat' && U.dist(e.x, e.y, x, y) < r && e.kind !== 'camera');

    // downed / sleeping squadmates
    for (const a of b.units) {
      if (a.side !== 'player' || a.kind !== 'op' || !(a.state === 'down' || a.state === 'asleep') || used.has(a.uid)) continue;
      const u = nearestFree(a.x, a.y, 80); if (!u) continue;
      const useF = a.state === 'down' && RnD.fultonLevel() >= 2 && hostileNear(a.x, a.y, 30);
      aiOrder(u, { type: useF ? 'fulton' : 'revive', tid: a.uid }); used.add(a.uid);
    }
    // supply drop for the wounded
    if (!b.commanded && !Battle.supportReady(b, 'supply')) {
      const hurt = sq.filter(u => u.hp < u.maxHp * 0.5);
      if (hurt.length >= 2) { const cx = hurt.reduce((s, u) => s + u.x, 0) / hurt.length, cy = hurt.reduce((s, u) => s + u.y, 0) / hurt.length; Battle.useSupport(b, 'supply', cx, cy); }
    }
    // exfil
    if (b.phase === 'exfil' || b.abort) {
      for (const u of sq) if (free(u)) aiOrder(u, { type: 'move', x: b.lz.x + U.rand(-3, 3), y: b.lz.y + U.rand(-3, 3) });
      return;
    }
    // fulton sleepers (always the contract target)
    for (const e of b.units) {
      if (e.side !== 'enemy' || e.state !== 'asleep' || used.has(e.uid) || e.kind === 'camera' || e.kind === 'uav') continue;
      if (!e.target && !b.opts.fulton) continue;
      if (!(e.marked || e.vis)) continue;
      if (hostileNear(e.x, e.y, 22)) continue;
      const u = nearestFree(e.x, e.y, e.target ? 200 : 35); if (!u) continue;
      aiOrder(u, { type: 'fulton', tid: e.uid }); used.add(e.uid);
    }
    // silent takedowns of nearby unaware guards with quiet weapons
    if (b.alert < 2) {
      for (const u of sq) {
        if (!free(u)) continue;
        const w = WEAPONS[u.weapon];
        if (!w || w.noise > 20) continue;
        if (u.order && u.order.type === 'attack') continue;
        let best = null, bd = Math.min(32, w.range * 0.95);
        for (const e of b.units) {
          if (e.side !== 'enemy' || !ALIVE(e) || !e.vis || e.kind === 'camera' || e.kind === 'uav' || used.has(e.uid)) continue;
          const d = U.dist(u.x, u.y, e.x, e.y);
          if (d < bd && Battle.canSee(b, u, e, w.range)) { bd = d; best = e; }
        }
        if (best) { aiOrder(u, { type: 'attack', tid: best.uid }); used.add(best.uid); }
      }
    }
    // objectives
    const cx = sq.reduce((s, u) => s + u.x, 0) / sq.length, cy = sq.reduce((s, u) => s + u.y, 0) / sq.length;
    const open = b.objectives.filter(o => !o.done && !(o.type === 'sabotage' && o.planted));
    open.sort((a, c) => U.dist(cx, cy, a.x, a.y) - U.dist(cx, cy, c.x, c.y));
    const obj = open[0];
    if (obj) {
      let worker = null;
      if (obj.type === 'eliminate') {
        const t = Battle.unit(b, obj.tid);
        if (t && ALIVE(t)) for (const u of sq) if (free(u) && (t.vis || t.marked) && U.dist(u.x, u.y, t.x, t.y) < 90) aiOrder(u, { type: 'attack', tid: t.uid });
      } else if (obj.type === 'extract') {
        const t = Battle.unit(b, obj.tid);
        if (t && !used.has(t.uid)) { worker = nearestFree(t.x, t.y); if (worker) aiOrder(worker, { type: 'fulton', tid: t.uid }); }
      } else if (obj.type === 'hold') {
        sq.forEach((u, i) => { if (free(u) && U.dist(u.x, u.y, obj.x, obj.y) > obj.r * 0.7) { const a = i / sq.length * Math.PI * 2; const p = Terrain.nearestFree(b, obj.x + Math.cos(a) * 6, obj.y + Math.sin(a) * 6, true); aiOrder(u, { type: 'move', x: p[0], y: p[1] }); } });
      } else {
        const busy = sq.some(u => (u.act && u.act.ref === obj.id) || (u.order && u.order.oid === obj.id));
        if (!busy) { worker = nearestFree(obj.x, obj.y); if (worker) aiOrder(worker, { type: 'interact', oid: obj.id }); }
      }
      // escort: the rest stay near the objective
      for (const u of sq) {
        if (!free(u) || u === worker) continue;
        if (u.order && (u.order.type === 'attack' || u.order.type === 'fulton' || u.order.type === 'interact')) continue;
        if (U.dist(u.x, u.y, obj.x, obj.y) > 14) {
          const p = Terrain.randomReachable(b, obj.x, obj.y, 4, 9, 20);
          aiOrder(u, { type: 'move', x: p[0], y: p[1] });
        }
      }
    }
  },

  // ----- our base security -----
  defenders(b) {
    const intr = b.units.filter(u => u.kind === 'intruder' && ALIVE(u) && (u.vis || u.marked));
    const guards = b.units.filter(u => u.side === 'player' && ALIVE(u) && (u.kind === 'sentry' || u.kind === 'op'));
    const free = u => !u.manual && !u.act && (!u.order || u.order.ai);
    const delegated = () => true;
    const used = new Set();
    for (const u of guards) {
      if (!delegated(u) || !free(u)) continue;
      // wake a sleeping comrade
      const sl = b.units.find(a => a.side === 'player' && a.kind === 'op' && (a.state === 'asleep' || a.state === 'down') && !used.has(a.uid) && U.dist(a.x, a.y, u.x, u.y) < 25);
      if (sl) { used.add(sl.uid); if (!(u.order && u.order.tid === sl.uid)) Battle.order(b, [u.uid], { type: 'revive', tid: sl.uid }, true); continue; }
      if (b.alert === 2 && intr.length) {
        const t = intr.reduce((a, c) => U.dist(u.x, u.y, a.x, a.y) < U.dist(u.x, u.y, c.x, c.y) ? a : c);
        if (!(u.order && u.order.tid === t.uid)) Battle.order(b, [u.uid], { type: 'attack', tid: t.uid }, true);
      } else if (b.alert >= 1 && b.lastKnown && b.time - b.lastKnown.t < 40) {
        if (!(u.order && u.order.type === 'move' && U.dist(u.order.x, u.order.y, b.lastKnown.x, b.lastKnown.y) < 12)) {
          const p = Terrain.randomReachable(b, b.lastKnown.x, b.lastKnown.y, 0, 8, 20);
          Battle.order(b, [u.uid], { type: 'move', x: p[0], y: p[1] }, true);
        }
      } else if (u.post && U.dist(u.x, u.y, u.post.x, u.post.y) > 30 && !(u.order && u.order.type === 'move')) {
        Battle.order(b, [u.uid], { type: 'move', x: u.post.x, y: u.post.y }, true);
      } else if (!u.order) {
        // routine: look around, sentries wander their beat
        if (U.chance(0.3)) u.ai.faceT = (u.ai.faceT ?? u.face) + U.rand(-1.4, 1.4);
        if (u.kind === 'sentry' && u.post && U.chance(0.08)) { const p = Terrain.randomReachable(b, u.post.x, u.post.y, 5, 25, 20); Battle.order(b, [u.uid], { type: 'move', x: p[0], y: p[1] }, true); }
      }
    }
  },

  // ----- carry out the current order -----
  exec(b, u) {
    const o = u.order;
    if (!o || u.act) return;
    switch (o.type) {
      case 'move':
        if (!u.path || !u.path.length) {
          if (U.dist(u.x, u.y, o.x, o.y) < 3 || o.tried) u.order = null;
          else { u.path = Terrain.findPath(b, u.x, u.y, o.x, o.y); o.tried = true; }
        }
        break;
      case 'hold': u.path = null; break;
      case 'attack': {
        const t = Battle.unit(b, o.tid);
        if (!t || t.state !== 'ok') { u.order = null; u.path = null; break; }
        const w = WEAPONS[u.weapon];
        if (U.dist(u.x, u.y, t.x, t.y) <= w.range * 0.9 && Battle.canSee(b, u, t, w.range)) u.path = null;
        else BAI.repath(b, u, t.x, t.y, 4);
        break;
      }
      case 'fulton': {
        const t = Battle.unit(b, o.tid);
        if (!Battle.fultonable(b, u, t)) { u.order = null; break; }
        if (U.dist(u.x, u.y, t.x, t.y) <= 2.6) Battle.startAct(b, u, 'fulton', t.uid, RnD.fultonTime() / (u.skills.includes('fulton') ? 2 : 1));
        else BAI.repath(b, u, t.x, t.y, 2);
        break;
      }
      case 'revive': {
        const t = Battle.unit(b, o.tid);
        if (!t || !(t.state === 'down' || t.state === 'asleep')) { u.order = null; break; }
        if (U.dist(u.x, u.y, t.x, t.y) <= 2.2) {
          const tot = t.state === 'asleep' ? 2 : 6 * (u.skills.includes('medic') ? 0.5 : 1) * (RnD.has('trauma') ? 0.6 : 1);
          Battle.startAct(b, u, 'revive', t.uid, tot);
        } else BAI.repath(b, u, t.x, t.y, 2);
        break;
      }
      case 'interact': {
        const ob = b.objectives.find(x => x.id === o.oid);
        if (!ob || ob.done || ob.planted) { u.order = null; break; }
        if (U.dist(u.x, u.y, ob.x, ob.y) <= 2.6) {
          const base = { sabotage: 5, intel: 9, core: 14 }[ob.type] || 6;
          const fast = (ob.type === 'sabotage' && u.skills.includes('demo')) || (ob.type !== 'sabotage' && u.skills.includes('hacker'));
          Battle.startAct(b, u, 'interact', ob.id, base / (fast ? 2 : 1));
        } else BAI.repath(b, u, ob.x, ob.y, 2);
        break;
      }
    }
  },
};
