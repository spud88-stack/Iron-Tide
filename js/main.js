'use strict';
// ---------- boot, start screen, main loop ----------
const Main = {
  started: false,
  last: performance.now(),
  ss: { seed: U.randi(1, 2e9) },

  boot() {
    MapView.init();
    UI.init();
    if (sessionStorage.getItem('it_autoload')) {
      sessionStorage.removeItem('it_autoload');
      if (Game.load()) { Main.start(false); requestAnimationFrame(Main.frame); return; }
    }
    Main.startScreen();
    requestAnimationFrame(Main.frame);
  },

  startScreen() {
    const el = document.getElementById('start-screen');
    const has = Game.hasSave();
    const name = Main.ss.name ?? 'Outer Tide';
    const zone = Main.ss.zone ?? 'seychelles';
    const init = name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    el.innerHTML = `<canvas id="start-bg"></canvas><div class="start">
      <h1>IRON TIDE</h1><div class="sub">PRIVATE FORCES COMMAND</div>
      <div class="bootlog" id="bootlog"></div>
      <div class="note">Build a sea-borne army without a nation. Recruit and manage staff, develop weapons, take contracts anywhere on Earth, raid rival Private Forces' FOBs — and drop into any fight to command it yourself.</div>
      <label>FORCE NAME</label><input id="ss-name" maxlength="28" value="${U.esc(name)}" data-inp="ssName">
      <label>MOTHER BASE LOCATION</label><select id="ss-zone" data-chg="ssZone">${ZONES.map(z => `<option value="${z.id}" ${z.id === zone ? 'selected' : ''}>${z.name}</option>`).join('')}</select>
      <label>EMBLEM</label><div class="emb"><img id="ss-emb" src="${Art.emblem(Main.ss.seed, init)}"><button data-act="ssReroll">Redesign</button></div>
      <div class="btns">${has ? '<button class="pri" data-act="ssContinue">Continue</button>' : ''}<button class="${has ? '' : 'pri'}" data-act="ssNew">New Game</button></div>
      ${has ? '<div class="note" style="margin-top:8px">Starting a new game overwrites your save.</div>' : ''}
    </div>`;
    el.classList.remove('gone');
    MapView.map.setView([ZONE[zone].lat, ZONE[zone].lng], 3);
    Main.boot2();
  },

  // typed boot log + radar sweep behind the start screen
  boot2() {
    const lines = ['> SECURE UPLINK ........ OK', `> SATELLITE GRID ....... ${ZONES.length} ZONES`, '> OPEN CONTRACT FEED ... ONLINE', '> HOSTILE PRIVATE FORCES DETECTED', '> AWAITING COMMANDER_'];
    const log = document.getElementById('bootlog');
    if (Main.bootTimer) clearInterval(Main.bootTimer);
    const NL = String.fromCharCode(10);
    if (Main.booted) { log.textContent = lines.join(NL); }
    else {
      let li = 0, ci = 0;
      Main.bootTimer = setInterval(() => {
        const el = document.getElementById('bootlog'); if (!el || li >= lines.length) { clearInterval(Main.bootTimer); Main.booted = true; return; }
        ci++;
        if (ci > lines[li].length) { li++; ci = 0; }
        el.textContent = lines.slice(0, li).join(NL) + (li < lines.length ? (li ? NL : '') + lines[li].slice(0, ci) : '');
        if (ci % 2) Sfx.play('type');
      }, 22);
    }
    const cv = document.getElementById('start-bg');
    const ctx = cv.getContext('2d');
    const blips = Array.from({ length: 18 }, () => ({ a: Math.random() * Math.PI * 2, r: U.rand(0.15, 0.95), red: Math.random() < 0.4 }));
    const draw = t => {
      if (!document.getElementById('start-bg') || document.getElementById('start-screen').classList.contains('gone')) return;
      cv.width = innerWidth; cv.height = innerHeight;
      const cx = cv.width / 2, cy = cv.height / 2, R = Math.hypot(cx, cy);
      ctx.strokeStyle = 'rgba(242,179,61,.10)'; ctx.lineWidth = 1;
      for (let i = 1; i <= 6; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 6, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      const sw = (t / 2600) % (Math.PI * 2) * 1;
      const ang = (t / 1000 * 0.9) % (Math.PI * 2);
      const g = ctx.createConicGradient ? ctx.createConicGradient(ang - 0.9, cx, cy) : null;
      if (g) { g.addColorStop(0, 'rgba(242,179,61,0)'); g.addColorStop(0.14, 'rgba(242,179,61,.16)'); g.addColorStop(0.15, 'rgba(242,179,61,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height); }
      for (const b of blips) {
        const d = ((ang - b.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const a = Math.max(0, 1 - d / 2.5);
        if (a <= 0) continue;
        ctx.fillStyle = b.red ? `rgba(255,90,78,${a})` : `rgba(120,220,150,${a})`;
        ctx.beginPath(); ctx.arc(cx + Math.cos(b.a) * b.r * R * 0.7, cy + Math.sin(b.a) * b.r * R * 0.7, 3, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  },

  start(isNew) {
    document.getElementById('start-screen').classList.add('gone');
    Main.started = true;
    MapView.setLayer(G.settings.satellite);
    MapView.refreshStatic();
    UI.renderTop();
    MapView.map.flyTo([G.base.lat, G.base.lng], 4, { duration: 2 });
    if (isNew) {
      Game.save(true);
      setTimeout(() => UI.modal(`<div class="mh"><h2>WELCOME, COMMANDER</h2><button class="x" data-act="closeModal">✕</button></div>
        <div class="mb"><div class="col" style="gap:10px;font-size:15px;line-height:1.4">
          <div><b class="acc">${U.esc(G.base.name)}</b> is online in the ${ZONE[G.base.zone].name}. ${Staff.total()} volunteers are aboard, and ${G.pfs.length} rival Private Forces are already operating around the world.</div>
          <div><b>The loop:</b> take <span class="acc">contracts</span> (yellow diamonds on the map) → earn GMP & materials → build platforms and <span class="acc">R&amp;D</span> → grow your staff with volunteers and Fulton recruits → build <span class="acc">FOBs</span> and raid rival PFs, while defending your own.</div>
          <div><b>Battles are live on the map.</b> When a squad lands, the fight plays out at the real location — city battles use the actual buildings. Zoom in to take command; zoom out and the squad AI carries on. Every battle keeps running whether you watch or not.</div>
          <div><b>Staff matter.</b> Every operative is a person with stats, skills and morale. Operatives who go down bleed out unless revived or Fultoned. The dead go on the memorial wall.</div>
          <h3>Controls</h3>${HELP_HTML}
        </div></div><div class="mf"><button class="pri" data-act="closeModal">Begin</button></div>`), 600);
    }
  },

  frame(now) {
    const dt = Math.min(0.1, (now - Main.last) / 1000);
    Main.last = now;
    if (G && Main.started) {
      const sp = SPEEDS[G.speedIdx];
      if (sp > 0) {
        Game.advance(dt * sp * GAME_MIN_PER_SEC);
        Battle.updateAll(dt * Math.min(sp, 3));
        Contracts.update();
      }
      BRender.draw();
      UI.tick(now);
    }
    requestAnimationFrame(Main.frame);
  },
};

Object.assign(ACT, {
  ssName: (d, el) => { Main.ss.name = el.value; const init = el.value.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase(); document.getElementById('ss-emb').src = Art.emblem(Main.ss.seed, init); },
  ssZone: (d, el) => { Main.ss.zone = el.value; const z = ZONE[el.value]; MapView.map.flyTo([z.lat, z.lng], 4, { duration: 1.2 }); },
  ssReroll: () => { Main.ss.seed = U.randi(1, 2e9); const n = document.getElementById('ss-name').value; Main.ss.name = n; Main.startScreen(); },
  ssNew: () => {
    const name = (document.getElementById('ss-name').value || 'Outer Tide').trim();
    const zoneId = document.getElementById('ss-zone').value;
    Sfx.play('uplink');
    Game.newGame({ name, zoneId, emblemSeed: Main.ss.seed });
    Main.start(true);
  },
  ssContinue: () => { if (Game.load()) Main.start(false); else Game.notify('LOAD FAILED', 'Save could not be read.', 'bad'); },
  loadGame: () => { sessionStorage.setItem('it_autoload', '1'); window.__noSave = true; location.reload(); },
});

window.addEventListener('beforeunload', () => { if (G && Main.started && !window.__noSave) Game.save(true); });
window.addEventListener('load', Main.boot);
