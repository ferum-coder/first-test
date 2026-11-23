// Iskra — realistic night sky (northern hemisphere, pole-centred stereographic map).
// Star & constellation data: d3-celestial by Olaf Frohn (BSD-3-Clause), see /CREDITS.txt.

/* ---------- analytics adapter (no-op until a service is chosen) ---------- */
export function track(event) {
  try {
    if (typeof window.plausible === 'function') window.plausible(event);
    else if (typeof window.gtag === 'function') window.gtag('event', event);
  } catch { /* analytics must never break the button */ }
}
document.getElementById('cta')?.addEventListener('click', () => track('cta_click'));

/* ---------- tunables ---------- */
// poleX/poleY: screen position of Polaris (fractions of W/H); scale: k = scale * hypot(W, H);
// phi0: initial rotation in degrees. Picked from screenshots, see REPORT.md.
const PRESETS = {
  landscape: { poleX: 0.275, poleY: 0.475, scale: 0.22, phi0: 350 },
  portrait:  { poleX: 0.45, poleY: 0.55, scale: 0.19, phi0: 95 },
};
const ROTATION_PERIOD_S = 600;
const DPR_MAX = 2;
const TWINKLE_SHARE = 0.25;
const TWINKLE_MAG = 4.5;
const METEOR_INTERVAL_S = [10, 20];
const MIN_DEC = -35;
const LINE_ALPHA = 0.18;
const LINE_ALPHA_HOVER = 0.55;
const DRAW_IN_S = 1.2;
const DRAW_IN_GAP_S = 0.25;
const COLUMN = 720; // central text column, px

const NAMES = {
  UMa: 'Велика Ведмедиця',
  UMi: 'Мала Ведмедиця',
  Cas: 'Кассіопея',
  Ori: 'Оріон',
  Cyg: 'Лебідь',
  Lyr: 'Ліра',
};
const ORDER = ['UMi', 'UMa', 'Cas', 'Cyg', 'Lyr', 'Ori'];
const PLEIADES = { ra: 56.75, dec: 24.12, radius: 1.2, name: 'Плеяди' };
const POLARIS = { ra: 37.95, dec: 89.26, name: 'Полярна зірка' };

// Galactic north pole & longitude of the NCP (J2000)
const GAL = { ra: 192.85948, dec: 27.12825, lNcp: 122.93192 };

const BV_TABLE = [
  [-0.3, [0x9b, 0xb0, 0xff]],
  [0.0, [0xca, 0xd7, 0xff]],
  [0.3, [0xf8, 0xf7, 0xff]],
  [0.6, [0xff, 0xf4, 0xea]],
  [0.9, [0xff, 0xe2, 0xbe]],
  [1.2, [0xff, 0xcc, 0x8f]],
  [1.6, [0xff, 0xb4, 0x6b]],
];

/* ---------- helpers ---------- */
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bvColor(bv) {
  let rgb = BV_TABLE[BV_TABLE.length - 1][1];
  if (bv <= BV_TABLE[0][0]) rgb = BV_TABLE[0][1];
  else {
    for (let i = 0; i < BV_TABLE.length - 1; i++) {
      const [b0, c0] = BV_TABLE[i];
      const [b1, c1] = BV_TABLE[i + 1];
      if (bv <= b1) {
        const t = (bv - b0) / (b1 - b0);
        rgb = c0.map((c, j) => c + (c1[j] - c) * t);
        break;
      }
    }
  }
  // mix 25% white to avoid acidic colours
  return rgb.map((c) => Math.round(c * 0.75 + 255 * 0.25));
}

function galToEq(l, b) {
  const dG = GAL.dec * DEG, dl = (GAL.lNcp - l) * DEG, bb = b * DEG;
  const sinDec = Math.sin(bb) * Math.sin(dG) + Math.cos(bb) * Math.cos(dG) * Math.cos(dl);
  const dec = Math.asin(clamp(sinDec, -1, 1)) / DEG;
  const ra = GAL.ra + Math.atan2(
    Math.cos(bb) * Math.sin(dl),
    Math.sin(bb) * Math.cos(dG) - Math.cos(bb) * Math.sin(dG) * Math.cos(dl),
  ) / DEG;
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/* ---------- state ---------- */
const canvas = document.getElementById('sky');
const tooltip = document.getElementById('sky-tooltip');
const params = new URLSearchParams(location.search);
const STILL = params.has('still');
const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
const hoverMq = window.matchMedia('(hover: hover) and (pointer: fine)');

let ctx, data;
let W = 0, H = 0, dpr = 1, k = 1, P = { x: 0, y: 0 }, R = 0, phi0 = 0;
let staticLayer = null;
let twinklers = [];
let constellations = []; // { id, name, polylines: [[{x,y}...]], lengths: [], hl }
let pleiades = null, polaris = null;
let elapsed = 0, lastNow = 0, rafId = 0, running = false;
let meteor = null, nextMeteorAt = 0;
let pointer = null; // {x, y} in screen px
let hovered = null;
const rand = mulberry32(7);

function isStatic() { return STILL || reduceMq.matches; }

/** Unrotated sky coordinates (pole at origin) for RA/Dec in degrees, scale kk. */
function project(ra, dec, kk = k) {
  const theta = (90 - dec) * DEG;
  const r = kk * 2 * Math.tan(theta / 2);
  const a = ra * DEG;
  return { x: r * Math.sin(a), y: -r * Math.cos(a), theta };
}

// On small screens the sky sits behind the text, so it does not rotate there (saves CPU/battery);
// stars still twinkle and meteors still fly.
function isSmallScreen() { return Math.min(W, H) < 600; }

function phiAt(t) {
  return phi0 + (isStatic() || isSmallScreen() ? 0 : (t * 2 * Math.PI) / ROTATION_PERIOD_S);
}

/** Sky coords -> screen coords for rotation phi (canvas rotate(-phi)). */
function toScreen(p, phi) {
  const c = Math.cos(-phi), s = Math.sin(-phi);
  return { x: P.x + p.x * c - p.y * s, y: P.y + p.x * s + p.y * c };
}

/** Screen coords -> sky coords (inverse rotation by +phi). */
function toSky(x, y, phi) {
  const dx = x - P.x, dy = y - P.y;
  const c = Math.cos(phi), s = Math.sin(phi);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/* ---------- layout ---------- */
// Building the static layer is split into ~8 ms slices so it never blocks the main thread
// (keeps Total Blocking Time low on slow phones). The new geometry is committed only when
// the layer is complete, so stars and constellation lines never disagree.
let buildToken = 0;

function computeGeometry() {
  const gW = window.innerWidth, gH = window.innerHeight;
  const preset = gW >= gH ? PRESETS.landscape : PRESETS.portrait;
  const gP = { x: preset.poleX * gW, y: preset.poleY * gH };
  return {
    W: gW,
    H: gH,
    dpr: Math.min(window.devicePixelRatio || 1, DPR_MAX),
    P: gP,
    k: preset.scale * Math.hypot(gW, gH),
    phi0: preset.phi0 * DEG,
    R: Math.ceil(Math.max(
      Math.hypot(gP.x, gP.y), Math.hypot(gW - gP.x, gP.y),
      Math.hypot(gP.x, gH - gP.y), Math.hypot(gW - gP.x, gH - gP.y),
    )) + 8,
  };
}

async function runSliced(gen, token) {
  for (;;) {
    const start = performance.now();
    let r;
    do { r = gen.next(); } while (!r.done && performance.now() - start < 8);
    if (r.done) return r.value;
    await new Promise((res) => setTimeout(res, 0));
    if (token !== buildToken) return null; // superseded by a newer resize
  }
}

async function layout() {
  const token = ++buildToken;
  const g = computeGeometry();
  const built = await runSliced(buildStaticLayer(g), token);
  if (!built || token !== buildToken) return false;

  W = g.W; H = g.H; dpr = g.dpr; P = g.P; k = g.k; R = g.R; phi0 = g.phi0;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  staticLayer = built.layer;
  twinklers = built.twinklers;
  bgPhi = NaN; // invalidate the rotated cache
  buildConstellations();
  return true;
}

function buildConstellations() {
  constellations = ORDER.map((id) => {
    const polylines = data.lines[id].map((seg) => seg.map(([ra, dec]) => project(ra, dec)));
    const lengths = polylines.map((pl) => {
      let L = 0;
      for (let i = 1; i < pl.length; i++) L += Math.hypot(pl[i].x - pl[i - 1].x, pl[i].y - pl[i - 1].y);
      return L;
    });
    const old = constellations.find((c) => c.id === id);
    return { id, name: NAMES[id], polylines, lengths, hl: old ? old.hl : 0 };
  });
  const pc = project(PLEIADES.ra, PLEIADES.dec);
  const pr = project(PLEIADES.ra, PLEIADES.dec + PLEIADES.radius);
  pleiades = { p: pc, r: Math.max(10, Math.hypot(pr.x - pc.x, pr.y - pc.y)) };
  polaris = { p: project(POLARIS.ra, POLARIS.dec) };
}

function* buildStaticLayer(g) {
  const magLimit = Math.min(g.W, g.H) < 600 ? 5.0 : 6.0;
  const sizeMul = g.W < 600 ? 0.85 : 1;
  const small = Math.min(g.W, g.H) < 600;
  const scale = Math.min(small ? Math.min(g.dpr, 1.5) : g.dpr, 4096 / (2 * g.R));
  const layer = document.createElement('canvas');
  layer.width = Math.ceil(2 * g.R * scale);
  layer.height = Math.ceil(2 * g.R * scale);
  const s = layer.getContext('2d');
  s.setTransform(scale, 0, 0, scale, g.R * scale, g.R * scale);

  yield* drawMilkyWay(s, g);

  const tw = mulberry32(11);
  const twinkling = [];
  let n = 0;
  for (const [ra, dec, mag, bv] of data.stars) {
    if (mag > magLimit) break; // sorted by magnitude
    if (++n % 150 === 0) yield;
    if (dec < MIN_DEC) continue;
    const p = project(ra, dec, g.k);
    if (Math.hypot(p.x, p.y) > g.R) continue;
    const r = clamp(0.55 * (6.3 - mag), 0.35, 3.2) * sizeMul;
    const alpha = clamp((6.5 - mag) / 5, 0.18, 1);
    const [cr, cg, cb] = bvColor(bv);
    const star = { x: p.x, y: p.y, r, alpha, color: `${cr},${cg},${cb}`, glow: mag < 1.5 };
    if (mag < TWINKLE_MAG && tw() < TWINKLE_SHARE) {
      star.amp = 0.15 + tw() * 0.2;
      star.period = 2 + tw() * 4;
      star.phase = tw() * Math.PI * 2;
      twinkling.push(star);
    } else {
      drawStar(s, star, star.alpha);
    }
  }
  return { layer, twinklers: twinkling };
}

function drawStar(c, st, alpha) {
  if (st.glow) {
    const g = c.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.r * 4);
    g.addColorStop(0, `rgba(${st.color},${0.25 * alpha})`);
    g.addColorStop(1, `rgba(${st.color},0)`);
    c.fillStyle = g;
    c.beginPath();
    c.arc(st.x, st.y, st.r * 4, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = `rgba(${st.color},${alpha})`;
  if (st.r < 0.6) {
    c.fillRect(st.x - st.r, st.y - st.r, st.r * 2, st.r * 2);
  } else {
    c.beginPath();
    c.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    c.fill();
  }
}

function* drawMilkyWay(c, g) {
  const mw = mulberry32(7);
  const colors = ['167,139,250', '108,124,255'];
  for (let l = 0; l < 360; l += 2) {
    if (l % 8 === 0) yield;
    // brighter towards Cygnus (l ≈ 80°), dimmer towards the anticentre (Orion/Auriga)
    const bright = 0.55 + 0.45 * Math.cos((l - 80) * DEG);
    for (let j = 0; j < 3; j++) {
      const b = (mw() - 0.5) * 12;
      const { ra, dec } = galToEq(l + (mw() - 0.5) * 2, b);
      const radDeg = 5 + mw() * 5;
      const alpha = (0.035 + mw() * 0.035) * bright;
      if (dec < MIN_DEC) continue;
      const p = project(ra, dec, g.k);
      if (Math.hypot(p.x, p.y) > g.R + 200) continue;
      const rpx = (radDeg * DEG * g.k) / Math.cos(p.theta / 2) ** 2;
      const col = colors[(l / 2 + j) % 2];
      const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rpx);
      gr.addColorStop(0, `rgba(${col},${alpha})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = gr;
      c.beginPath();
      c.arc(p.x, p.y, rpx, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/* ---------- frame ---------- */
// The sky turns slowly (far corner moves ~1 px per 80–100 ms), so the rotated static layer is
// re-rendered into a screen-sized cache only when it has turned by ~1 px; frames just blit it.
let bgCache = null, bgCtx = null, bgPhi = NaN;

function ensureBgCache() {
  const w = Math.round(W * dpr), h = Math.round(H * dpr);
  if (!bgCache || bgCache.width !== w || bgCache.height !== h) {
    bgCache = document.createElement('canvas');
    bgCache.width = w;
    bgCache.height = h;
    bgCtx = bgCache.getContext('2d');
    bgPhi = NaN;
  }
}

function renderBg(phi) {
  ensureBgCache();
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgCtx.clearRect(0, 0, W, H);
  bgCtx.translate(P.x, P.y);
  bgCtx.rotate(-phi);
  bgCtx.drawImage(staticLayer, -R, -R, 2 * R, 2 * R);
  bgPhi = phi;
}

function drawFrame(t) {
  const target = phiAt(t);
  if (Number.isNaN(bgPhi) || Math.abs(target - bgPhi) * R >= 1) renderBg(target);
  const phi = bgPhi;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgCache, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.rotate(-phi);

  const still = isStatic();
  for (const st of twinklers) {
    const f = still ? 1 : 1 - st.amp * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / st.period + st.phase));
    drawStar(ctx, st, st.alpha * f);
  }

  ctx.lineWidth = 0.8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  constellations.forEach((c, i) => {
    const target = hovered === c.id ? 1 : 0;
    c.hl += (target - c.hl) * (still ? 1 : 0.2);
    const progress = still ? 1 : clamp((t - 0.4 - i * (DRAW_IN_S + DRAW_IN_GAP_S)) / DRAW_IN_S, 0, 1);
    if (progress <= 0) return;
    const alpha = LINE_ALPHA + (LINE_ALPHA_HOVER - LINE_ALPHA) * c.hl;
    ctx.strokeStyle = `rgba(191,246,255,${alpha})`;
    c.polylines.forEach((pl, j) => {
      const L = c.lengths[j];
      if (progress < 1) ctx.setLineDash([L * progress, L + 1]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pl[0].x, pl[0].y);
      for (let n = 1; n < pl.length; n++) ctx.lineTo(pl[n].x, pl[n].y);
      ctx.stroke();
    });
  });
  ctx.setLineDash([]);
  ctx.restore();

  if (!still) drawMeteor(t);
}

function columnBounds() {
  const half = Math.min(COLUMN, W) / 2;
  return [W / 2 - half, W / 2 + half];
}

function spawnMeteor(t) {
  const [cl, cr] = columnBounds();
  const sides = [];
  if (cl > 140) sides.push([0, cl - 40]);
  if (W - cr > 140) sides.push([cr + 40, W]);
  let x0, y0;
  if (sides.length) {
    const [a, b] = sides[Math.floor(rand() * sides.length)];
    x0 = a + rand() * (b - a);
    y0 = rand() * H * 0.4;
  } else {
    x0 = rand() * W;
    y0 = rand() * H * 0.12;
  }
  const len = 120 + rand() * 100;
  const ang = (20 + rand() * 25) * DEG;
  const dir = x0 < W / 2 ? 1 : -1;
  meteor = { x0, y0, dx: Math.cos(ang) * dir, dy: Math.sin(ang), len, start: t, dur: 0.6 + rand() * 0.3 };
}

function drawMeteor(t) {
  if (!meteor) {
    if (t >= nextMeteorAt) {
      spawnMeteor(t);
      const [a, b] = METEOR_INTERVAL_S;
      nextMeteorAt = t + a + rand() * (b - a);
    }
    return;
  }
  const p = (t - meteor.start) / meteor.dur;
  if (p >= 1) { meteor = null; return; }
  const travel = meteor.len * 1.6 * p;
  const hx = meteor.x0 + meteor.dx * travel, hy = meteor.y0 + meteor.dy * travel;
  const tail = meteor.len * Math.min(1, p * 2);
  const tx = hx - meteor.dx * tail, ty = hy - meteor.dy * tail;
  const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  const g = ctx.createLinearGradient(hx, hy, tx, ty);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
  g.addColorStop(0.3, `rgba(46,197,224,${0.6 * fade})`);
  g.addColorStop(1, 'rgba(46,197,224,0)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx, hy);
  ctx.stroke();
}

/* ---------- interaction ---------- */
function distToSegment(px, py, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - a.x) * vx + (py - a.y) * vy) / len2, 0, 1);
  return Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
}

function hitTest(x, y) {
  const q = toSky(x, y, phiAt(elapsed));
  if (Math.hypot(q.x - polaris.p.x, q.y - polaris.p.y) < 10) return { id: 'polaris', name: POLARIS.name };
  if (Math.hypot(q.x - pleiades.p.x, q.y - pleiades.p.y) < pleiades.r) return { id: 'pleiades', name: PLEIADES.name };
  for (const c of constellations) {
    for (const pl of c.polylines) {
      for (let i = 1; i < pl.length; i++) {
        if (distToSegment(q.x, q.y, pl[i - 1], pl[i]) < 14) return { id: c.id, name: c.name };
      }
    }
  }
  return null;
}

function updateHover() {
  if (!pointer || !hoverMq.matches) { hovered = null; tooltip.hidden = true; return; }
  const hit = pointer.overHero ? null : hitTest(pointer.x, pointer.y);
  hovered = hit ? hit.id : null;
  if (hit) {
    tooltip.textContent = hit.name;
    tooltip.style.left = `${pointer.x}px`;
    tooltip.style.top = `${pointer.y}px`;
    tooltip.hidden = false;
  } else {
    tooltip.hidden = true;
  }
  if (isStatic()) drawFrame(elapsed);
}

window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const content = e.target instanceof Element && e.target.closest('.hero > *');
  pointer = { x: e.clientX, y: e.clientY, overHero: !!content };
  updateHover();
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer = null; updateHover(); });

/* ---------- loop ---------- */
function tick(now) {
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  elapsed += dt;
  drawFrame(elapsed);
  rafId = requestAnimationFrame(tick);
}

function start() {
  if (running || isStatic() || document.hidden) return;
  running = true;
  lastNow = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stop() {
  running = false;
  cancelAnimationFrame(rafId);
}

function refresh() {
  stop();
  if (isStatic()) drawFrame(elapsed);
  else start();
}

function reportVisibility() {
  const phi = phiAt(elapsed);
  const visible = {};
  for (const c of constellations) {
    visible[c.id] = c.polylines.every((pl) => pl.every((p) => {
      const s = toScreen(p, phi);
      return s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= H;
    }));
  }
  window.__sky = { ready: true, visible, W, H };
}

async function init() {
  if (!canvas) return;
  try {
    const res = await fetch('/data/sky.json');
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return; // keep the CSS background
  }
  ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (!(await layout())) return;
  drawFrame(elapsed);
  reportVisibility();
  canvas.classList.add('is-ready');
  nextMeteorAt = 4 + rand() * 4;
  start();

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      if (await layout()) {
        drawFrame(elapsed);
        reportVisibility();
      }
    }, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else refresh();
  });
  reduceMq.addEventListener?.('change', refresh);
}

// The sky is decoration: start it only after the page has loaded and the browser is idle.
function whenIdle() {
  return new Promise((resolve) => {
    const go = () => ('requestIdleCallback' in window
      ? requestIdleCallback(() => resolve(), { timeout: 1000 })
      : setTimeout(resolve, 200));
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  });
}

whenIdle().then(init);
