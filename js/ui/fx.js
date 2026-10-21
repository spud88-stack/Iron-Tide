'use strict';
// ---------- screen-space effects: shake, vignette, banners, uplink transition, floating text ----------
const Fx = {
  shakeT: 0, shakeAmp: 0,

  shake(amp = 6, dur = 0.35) {
    Fx.shakeAmp = Math.max(Fx.shakeAmp, amp);
    Fx.shakeT = Math.max(Fx.shakeT, dur);
  },

  tick(dt) {
    const el = document.getElementById('map');
    if (Fx.shakeT > 0) {
      Fx.shakeT -= dt;
      const a = Fx.shakeAmp * Math.max(0, Fx.shakeT) * 3;
      el.style.transform = `translate(${U.rand(-a, a)}px,${U.rand(-a, a)}px)`;
      if (Fx.shakeT <= 0) { el.style.transform = ''; Fx.shakeAmp = 0; }
    }
    // vignette follows the focused battle's alert phase
    const v = document.getElementById('vignette');
    const b = UI.focused ? Battle.byId(UI.focused) : null;
    const cls = !b || b.phase === 'done' ? '' : b.alert === 2 ? 'alert' : b.alert === 1 ? 'caution' : 'sneak';
    if (v.dataset.c !== cls) { v.className = cls; v.dataset.c = cls; }
    document.body.classList.toggle('paused', G && G.speedIdx === 0);
  },

  // big animated center text
  banner(title, sub = '', color = 'var(--acc)', opts = {}) {
    const el = document.createElement('div');
    el.className = 'cbanner' + (opts.small ? ' small' : '');
    el.style.setProperty('--c', color);
    el.innerHTML = `<div class="cb-line"></div><div class="cb-t">${U.esc(title)}</div>${sub ? `<div class="cb-s">${sub}</div>` : ''}<div class="cb-line"></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), (opts.ttl || 2.2) * 1000);
    setTimeout(() => el.remove(), (opts.ttl || 2.2) * 1000 + 600);
  },

  // grade stamp for mission results
  result(success, grade, title) {
    const gcol = { S: 'var(--vio)', A: 'var(--ok)', B: 'var(--blue)', C: 'var(--acc)', D: '#ff8a4e', E: 'var(--red)' }[grade] || 'var(--acc)';
    document.querySelectorAll('.cbanner,.cresult').forEach(e => e.remove());
    const el = document.createElement('div');
    el.className = 'cresult';
    el.innerHTML = `<div class="cr-t" style="color:${success ? 'var(--ok)' : 'var(--red)'}">${success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</div>
      <div class="cr-s">${U.esc(title)}</div><div class="cr-g" style="color:${gcol}">${grade}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3900);
  },

  // "establishing uplink" wipe when dropping into a battle
  uplink(text) {
    const el = document.createElement('div');
    el.className = 'uplink';
    el.innerHTML = `<div class="ul-box"><div class="ul-t">ESTABLISHING UPLINK</div><div class="ul-s">${U.esc(text)}</div><div class="ul-bar"><i></i></div></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1300);
    setTimeout(() => el.remove(), 1800);
  },

  // floating text near the top bar resources (e.g. +120K GMP)
  float(text, color = 'var(--ok)', x, y) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.style.color = color;
    el.textContent = text;
    el.style.left = (x ?? window.innerWidth - 330) + 'px';
    el.style.top = (y ?? 52) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  },

  // tweened numbers for the resource bar
  shown: {},
  tween(k, v, dt) {
    const s = Fx.shown[k];
    if (s === undefined || Math.abs(v - s) < 1) { Fx.shown[k] = v; return v; }
    Fx.shown[k] = s + (v - s) * Math.min(1, dt * 6);
    return Fx.shown[k];
  },
};
