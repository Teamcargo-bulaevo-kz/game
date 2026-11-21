/* Степной снайпер — симулятор дальней стрельбы.
   Мир: ось -Z — направление стрельбы (север), +X — вправо (восток), +Y — вверх. Стрелок стартует в (0,0). */
(function () {
'use strict';

if (!window.THREE) { showErr('Не удалось загрузить графический движок (js/three.min.js).'); return; }
const V3 = THREE.Vector3;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
function showErr(msg) { const e = document.getElementById('err'); if (e) { e.textContent = msg; e.hidden = false; } }

const IS_TOUCH = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || ('ontouchstart' in window);

/* ---------------- шум и рельеф ---------------- */
function hash2(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s / 0.9375;
}
function terrainH(x, z) {
  const ax = Math.abs(x);
  const corr = smooth(45, 260, ax);           // 0 — коридор стрельбища, 1 — вне его
  const big = (fbm(x * 0.0035 + 11, z * 0.0035 - 7) - 0.5) * 22;
  const small = (fbm(x * 0.025 + 3, z * 0.025 + 5) - 0.5) * 0.9 * (0.2 + 0.8 * corr);
  let h = big * (0.06 + 0.94 * corr) + small;
  h += clamp(-z, 0, 1800) * 0.006;           // стрельбище плавно поднимается к мишеням
  const r = Math.hypot(x * 0.8, z + 900);
  h += smooth(2000, 3400, r) * (40 + 50 * fbm(x * 0.0015, z * 0.0015));
  h += 1.2 * (1 - smooth(9, 26, Math.hypot(x * 0.35, z - 2)));   // огневой рубеж на насыпи
  return h;
}

/* ---------------- баллистика ---------------- */
// Стандартная функция сопротивления G7 (Cd от числа Маха)
const G7M = [0, 0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];
const G7C = [0.1198, 0.1197, 0.1196, 0.1213, 0.1257, 0.1402, 0.2129, 0.3803, 0.4043, 0.4014, 0.3884, 0.3725, 0.3403, 0.3053, 0.2809, 0.2490, 0.2294, 0.2040, 0.1900];
function g7(m) {
  if (m <= 0) return G7C[0];
  for (let i = 1; i < G7M.length; i++) if (m < G7M[i]) { const t = (m - G7M[i - 1]) / (G7M[i] - G7M[i - 1]); return G7C[i - 1] + (G7C[i] - G7C[i - 1]) * t; }
  return G7C[G7C.length - 1];
}
// ускорение пули: сопротивление относительно воздуха (с ветром) + гравитация
function accel(vx, vy, vz, wx, wz, rho, snd, bcSI, out) {
  const rx = vx - wx, rz = vz - wz;
  const vr = Math.sqrt(rx * rx + vy * vy + rz * rz);
  const k = rho * g7(vr / snd) * Math.PI / (8 * bcSI) * vr;
  out[0] = -k * rx; out[1] = -k * vy - 9.80665; out[2] = -k * rz;
}
const STD = { rho: 1.225, snd: 340.3, t: 15 };
function airDensity(tC, pmm, hum) {
  const T = tC + 273.15, P = pmm * 133.322;
  const ps = 610.78 * Math.pow(10, 7.5 * tC / (tC + 237.3));
  const pv = hum / 100 * ps;
  return (P - pv) / (287.05 * T) + pv / (461.5 * T);
}
const spinDrift = (rf, t) => 0.0254 * 1.25 * (rf.sg + 1.2) * Math.pow(t, 1.83);

// Плоская траектория: x — дальность, y — вверх, z — вправо. cross — боковой ветер (м/с, вправо)
function simFlat(rf, ang, cross, rho, snd, mv, maxD, step) {
  const bcSI = rf.bc * 703.07, dt = 0.0005, A = [0, 0, 0];
  let x = 0, y = 0, z = 0, vx = mv * Math.cos(ang), vy = mv * Math.sin(ang), vz = 0, t = 0;
  const out = []; let next = step;
  while (t < 9) {
    const px = x, py = y, pz = z, pt = t, pv = Math.sqrt(vx * vx + vy * vy + vz * vz);
    accel(vx, vy, vz, 0, cross, rho, snd, bcSI, A);
    const hx = vx + A[0] * dt * 0.5, hy = vy + A[1] * dt * 0.5, hz = vz + A[2] * dt * 0.5;
    accel(hx, hy, hz, 0, cross, rho, snd, bcSI, A);
    const nx = vx + A[0] * dt, ny = vy + A[1] * dt, nz = vz + A[2] * dt;
    x += (vx + nx) * 0.5 * dt; y += (vy + ny) * 0.5 * dt; z += (vz + nz) * 0.5 * dt;
    vx = nx; vy = ny; vz = nz; t += dt;
    while (x >= next) {
      const f = (next - px) / (x - px);
      out.push({ D: next, y: py + (y - py) * f, z: pz + (z - pz) * f, t: pt + (t - pt) * f, v: pv + (Math.sqrt(vx * vx + vy * vy + vz * vz) - pv) * f });
      next += step;
      if (next > maxD) return out;
    }
  }
  return out;
}
function zeroAngle(rf) {
  if (rf._zero != null) return rf._zero;
  let lo = -0.002, hi = 0.012;
  for (let i = 0; i < 36; i++) {
    const m = (lo + hi) / 2;
    const r = simFlat(rf, m, 0, STD.rho, STD.snd, rf.mv, 100, 100);
    const y = r.length ? r[0].y : -9;
    if (y > rf.sh) hi = m; else lo = m;
  }
  return (rf._zero = (lo + hi) / 2);
}
// поправка по вертикали (рад) для стандартных условий — по ней размечен барабан ПСО и шевроны
function stdElev(rf, D) {
  if (!rf._std) rf._std = simFlat(rf, zeroAngle(rf), 0, STD.rho, STD.snd, rf.mv, 2000, 50);
  const tb = rf._std;
  if (D <= 50) return 0;
  const i = Math.min(tb.length - 1, Math.max(1, Math.floor(D / 50) - 1));
  const a = tb[i - 1] || tb[0], b = tb[i];
  const f = clamp((D - a.D) / (b.D - a.D || 1), 0, 1);
  const y = lerp(a.y, b.y, f) - rf.sh;
  return Math.atan(-y / D);
}

/* ---------------- данные: винтовки, прицелы, погода ---------------- */
const UNIT = { mrad: 0.001, moa: Math.PI / 180 / 60, thou: TAU / 6000 };
const UNAME = { mrad: 'мрад', moa: 'MOA', thou: 'тыс.' };
const SCOPES = {
  pso:    { id: 'pso',    name: 'ПСО-1 4×',          min: 4, max: 4,  unit: 'thou', click: 0.5,  maxW: 10, ret: 'pso',  note: 'тысячные, дальномерная шкала, барабан в сотнях метров' },
  mildot: { id: 'mildot', name: 'Mil-Dot 3–12×',     min: 3, max: 12, unit: 'mrad', click: 0.1,  maxE: 25, maxW: 10, ret: 'mildot', note: 'точки через 1 мрад, щелчок 0,1 мрад' },
  moa:    { id: 'moa',    name: 'MOA 4–16×',         min: 4, max: 16, unit: 'moa',  click: 0.25, maxE: 90, maxW: 30, ret: 'moa', note: 'риски через 2 MOA, щелчок 1/4 MOA' },
  tree:   { id: 'tree',   name: 'MRAD «Ёлка» 5–25×', min: 5, max: 25, unit: 'mrad', click: 0.1,  maxE: 30, maxW: 10, ret: 'tree', note: 'сетка выносов 0,2 мрад, ёлка на 10 мрад' },
};
const RIFLES = [
  { id: 'svd',   name: 'СВД',          full: 'Снайперская винтовка Драгунова', org: 'RU',   cal: '7,62×54R · 7Н1, 9,8 г',        mv: 830, bc: 0.187, g: 9.8,  sh: 0.065, mag: 10, cycle: 0.32, semi: true,  recoil: 1.0,  sg: 1.5, scope: 'pso',    disp: 0.30, look: 'svd' },
  { id: 'sv98',  name: 'СВ-98',        full: 'Магазинная снайперская винтовка', org: 'RU',  cal: '7,62×54R · 7Н14, 9,8 г',       mv: 820, bc: 0.205, g: 9.8,  sh: 0.055, mag: 10, cycle: 1.05, semi: false, recoil: 0.9,  sg: 1.6, scope: 'mildot', disp: 0.18, look: 'sv98' },
  { id: 't5000', name: 'ORSIS T-5000', full: 'Высокоточная винтовка', org: 'RU',              cal: '.338 Lapua Mag · 16,2 г',      mv: 900, bc: 0.322, g: 16.2, sh: 0.06,  mag: 5,  cycle: 1.15, semi: false, recoil: 1.45, sg: 1.9, scope: 'tree',   disp: 0.12, look: 't5000' },
  { id: 'm24',   name: 'M24 SWS',      full: 'Снайперская система, США', org: 'NATO',         cal: '7,62×51 NATO · M118LR, 11,3 г', mv: 790, bc: 0.243, g: 11.3, sh: 0.055, mag: 5,  cycle: 1.0,  semi: false, recoil: 0.95, sg: 1.7, scope: 'moa',    disp: 0.16, look: 'm24' },
  { id: 'awm',   name: 'AI AWM',       full: 'Магазинная винтовка, Великобритания', org: 'NATO', cal: '.338 Lapua Mag · 19,4 г',   mv: 830, bc: 0.381, g: 19.4, sh: 0.06,  mag: 5,  cycle: 1.15, semi: false, recoil: 1.55, sg: 2.0, scope: 'tree',   disp: 0.12, look: 'awm' },
  { id: 'm107',  name: 'Barrett M107', full: 'Крупнокалиберная самозарядная, США', org: 'NATO', cal: '12,7×99 NATO · 48,6 г',     mv: 855, bc: 0.50,  g: 48.6, sh: 0.075, mag: 10, cycle: 0.42, semi: true,  recoil: 2.1,  sg: 2.2, scope: 'mildot', disp: 0.25, look: 'm107' },
];
const WEATHER = {
  clear:  { name: 'Ясно',     t: 22,  p: 745, h: 40, fog: 0.00020, top: 0x4f86c6, hor: 0xc8d5dd, sun: 1.05, hemi: 0.75, clouds: 0.35, rain: 0 },
  cloudy: { name: 'Облачно',  t: 13,  p: 738, h: 68, fog: 0.00036, top: 0x8693a1, hor: 0xbcc2c7, sun: 0.45, hemi: 0.9,  clouds: 1,    rain: 0 },
  fog:    { name: 'Туман',    t: 6,   p: 742, h: 97, fog: 0.0016,  top: 0xb5bbbd, hor: 0xc3c7c6, sun: 0.3,  hemi: 0.95, clouds: 0,    rain: 0 },
  rain:   { name: 'Дождь',    t: 10,  p: 731, h: 92, fog: 0.0008,  top: 0x5d666f, hor: 0x8f979c, sun: 0.25, hemi: 0.75, clouds: 1,    rain: 1 },
  heat:   { name: 'Жара',     t: 36,  p: 741, h: 18, fog: 0.00028, top: 0x5d8fc9, hor: 0xdcd9c6, sun: 1.2,  hemi: 0.72, clouds: 0.15, rain: 0 },
  cold:   { name: 'Мороз',    t: -14, p: 768, h: 75, fog: 0.00025, top: 0x6d95c4, hor: 0xd3dde5, sun: 0.85, hemi: 0.8,  clouds: 0.4,  rain: 0 },
};
const WINDS = {
  calm: { name: 'Штиль', base: [0, 1] }, light: { name: 'Слабый', base: [1.5, 3.5] },
  moderate: { name: 'Умеренный', base: [3.5, 6.5] }, strong: { name: 'Сильный', base: [7, 11] }, random: { name: 'Случайный', base: [0, 11] },
};
const QUALITY = {
  low:  { name: 'Низкая',  pr: 0.75, aa: false, grass: 3000,  terr: 150, bushes: 350 },
  mid:  { name: 'Средняя', pr: 1.25,  aa: false, grass: 6500,  terr: 200, bushes: 550 },
  high: { name: 'Высокая', pr: 1.6,  aa: true,  grass: 14000, terr: 256, bushes: 800 },
};

/* ---------------- настройки ---------------- */
const DEF = { rifle: 0, weather: 'clear', wind: 'moderate', mode: 'train', tracers: true, bcam: false, sound: true, sens: 1, quality: IS_TOUCH ? 'mid' : 'high', scopes: {} };
let S = Object.assign({}, DEF);
try { const raw = localStorage.getItem('stepSniper'); if (raw) S = Object.assign({}, DEF, JSON.parse(raw)); } catch (e) { /* нет хранилища */ }
function save() { try { localStorage.setItem('stepSniper', JSON.stringify(S)); } catch (e) { /* ignore */ } }
const Q = QUALITY[S.quality] || QUALITY.mid;

const TUR = {};   // состояние барабанов на каждую винтовку
RIFLES.forEach((r) => { TUR[r.id] = { e: 0, w: 0, drum: 1, zoom: null, ammo: r.mag }; });
const curRifle = () => RIFLES[S.rifle];
const scopeOf = (rf) => SCOPES[S.scopes[rf.id] || rf.scope];
const curScope = () => scopeOf(curRifle());
const curTur = () => TUR[curRifle().id];
function elevRad() { const sc = curScope(), st = curTur(); return sc.unit === 'thou' ? stdElev(curRifle(), st.drum * 100) : st.e * sc.click * UNIT[sc.unit]; }
function windRad() { const sc = curScope(), st = curTur(); return st.w * sc.click * UNIT[sc.unit]; }

/* ---------------- условия ---------------- */
const COND = { t: 20, p: 745, h: 40, rho: 1.2, snd: 343 };
const WIND = { base: 4, dir: 1.3, gust: 0.3, vr: 0.28 };
function applyConditions() {
  const w = WEATHER[S.weather];
  COND.t = w.t + Math.round(gauss() * 1.5); COND.p = w.p + Math.round(gauss() * 3); COND.h = clamp(w.h + Math.round(gauss() * 4), 5, 100);
  COND.rho = airDensity(COND.t, COND.p, COND.h);
  COND.snd = 331.3 * Math.sqrt(1 + COND.t / 273.15);
}
function newWind() {
  const b = WINDS[S.wind].base;
  WIND.base = lerp(b[0], b[1], Math.random());
  WIND.dir = Math.random() * TAU;
  WIND.gust = S.wind === 'calm' ? 0.6 : 0.22 + Math.random() * 0.15;
}
const mvNow = (rf) => rf.mv + (COND.t - 15) * 0.9;   // термочувствительность пороха
const _w = [0, 0, 0, 0];
// ветер в точке (z — по дальности), ang — куда дует (0 — от стрелка к мишеням, по часовой)
function windAt(z, t) {
  const g = (vnoise(t * 0.2 - z * 0.0015, 7.3) - 0.5) * 2;
  const d = (vnoise(t * 0.06 - z * 0.0008, 19.1) - 0.5) * 2;
  const sp = Math.max(0, WIND.base * (1 + g * WIND.gust * 1.6));
  const ang = WIND.dir + d * WIND.vr;
  _w[0] = Math.sin(ang) * sp; _w[1] = -Math.cos(ang) * sp; _w[2] = sp; _w[3] = ang;
  return _w;
}

/* ---------------- рендер ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: Q.aa, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (e) { showErr('WebGL недоступен в этом браузере. Откройте игру в Chrome.'); return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 20000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const camB = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.02, 20000);
scene.fog = new THREE.FogExp2(0xc8d5dd, 0.0002);

const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x4d5c2c, 0.75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.0); sun.position.set(-0.45, 0.75, 0.55); scene.add(sun);
const SUN_DIR = new V3(-0.45, 0.5, 0.55).normalize();

// небо
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: SUN_DIR }, sunI: { value: 1 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
  fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform float sunI; varying vec3 vD;' +
    'void main(){ float h = max(vD.y, 0.0); vec3 c = mix(hor, top, pow(h, 0.5)); if (vD.y < 0.0) c = hor * 0.92;' +
    ' float s = max(dot(normalize(vD), sunDir), 0.0); c += vec3(1.0,0.95,0.85) * (pow(s, 900.0) * 3.0 + pow(s, 10.0) * 0.22) * sunI;' +
    ' gl_FragColor = vec4(c, 1.0); }',
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

/* текстуры, нарисованные в canvas */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); return t; }
const glowTex = canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
const puffTex = canvasTex(64, 64, (c) => {
  for (let i = 0; i < 14; i++) { const x = 32 + gauss() * 7, y = 32 + gauss() * 7, r = 8 + Math.random() * 12; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
});
const cloudTex = canvasTex(256, 128, (c) => {
  for (let i = 0; i < 40; i++) { const x = 128 + gauss() * 45, y = 70 + gauss() * 12, r = 18 + Math.random() * 30; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 128); }
});
const groundTex = canvasTex(128, 128, (c) => {
  const im = c.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const n = 0.55 * vnoise(x / 6, y / 6) + 0.3 * vnoise(x / 2.3 + 9, y / 2.3) + 0.15 * Math.random();
    const v = 180 + n * 75; const i = (y * 128 + x) * 4;
    im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v * 0.95; im.data[i + 3] = 255;
  }
  c.putImageData(im, 0, 0);
});
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;

/* ---------------- земля ---------------- */
(function buildTerrain() {
  const N = Q.terr, EXT = 6000, P = 1.9, n1 = N + 1;
  const pos = new Float32Array(n1 * n1 * 3), col = new Float32Array(n1 * n1 * 3), uv = new Float32Array(n1 * n1 * 2);
  const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), P) * EXT;
  let k = 0;
  for (let j = 0; j < n1; j++) {
    const z = warp(j / N * 2 - 1);
    for (let i = 0; i < n1; i++) {
      const x = warp(i / N * 2 - 1);
      const h = terrainH(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 5; uv[k * 2 + 1] = z / 5;
      const lush = fbm(x * 0.002 + 3, z * 0.002), dry = smooth(0.55, 0.8, fbm(x * 0.012 + 40, z * 0.012));
      let r = lerp(0.27, 0.42, lush), g = lerp(0.43, 0.56, lush), b = lerp(0.15, 0.2, lush);
      r = lerp(r, 0.62, dry * 0.55); g = lerp(g, 0.6, dry * 0.55); b = lerp(b, 0.33, dry * 0.55);
      const ridge = smooth(10, 60, h - clamp(-z, 0, 1800) * 0.006);
      r = lerp(r, 0.42, ridge * 0.4); g = lerp(g, 0.48, ridge * 0.4); b = lerp(b, 0.3, ridge * 0.4);
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
      k++;
    }
  }
  const idx = new Uint32Array(N * N * 6); let q = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }));
  m.name = 'terrain';
  scene.add(m);
})();

/* ---------------- трава вокруг игрока ---------------- */
const GRASS_PATCH = 70;
const grassU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uNear: { value: 2.6 } };
const grass = (function () {
  const blades = 4, pos = [], col = [];
  for (let b = 0; b < blades; b++) {
    const a = Math.random() * Math.PI, ox = gauss() * 0.06, oz = gauss() * 0.06, w = 0.022 + Math.random() * 0.02, hgt = 0.4 + Math.random() * 0.4, lean = gauss() * 0.15;
    const ca = Math.cos(a), sa = Math.sin(a);
    pos.push(ox - ca * w, 0, oz - sa * w, ox + ca * w, 0, oz + sa * w, ox + lean * sa, hgt, oz + lean * ca);
    const dry = Math.random() < 0.25;
    col.push(0.16, 0.28, 0.07, 0.16, 0.28, 0.07, dry ? 0.78 : 0.48, dry ? 0.74 : 0.66, dry ? 0.45 : 0.22);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassU.uTime; sh.uniforms.uWind = grassU.uWind; sh.uniforms.uNear = grassU.uNear;
    sh.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\nuniform float uNear;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      'vec3 transformed = vec3(position);\n' +
      '#ifdef USE_INSTANCING\n vec3 wp = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;\n#else\n vec3 wp = vec3(0.0);\n#endif\n' +
      'float bend = position.y * position.y;\n' +
      'float gst = 0.55 + 0.45 * sin(uTime * 1.9 + wp.x * 0.17 + wp.z * 0.13) * sin(uTime * 0.7 + wp.z * 0.05);\n' +
      'transformed.xz += uWind * bend * gst + vec2(sin(uTime*3.1+wp.x), cos(uTime*2.7+wp.z)) * 0.03 * bend;\n' +
      'float dc = length(wp.xz - cameraPosition.xz);\n' +
      'transformed.y *= smoothstep(0.6, uNear, dc);\n' +
      'float mwx = 1.0 - smoothstep(13.0, 18.0, abs(wp.x));\n' +
      'float mwz = smoothstep(-36.0, -26.0, wp.z) * (1.0 - smoothstep(9.0, 13.0, wp.z));\n' +
      'transformed.y *= 1.0 - 0.75 * mwx * mwz;\n');
  };
  const N = Q.grass;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  const offs = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { offs[i * 3] = Math.random() * GRASS_PATCH; offs[i * 3 + 1] = Math.random() * GRASS_PATCH; offs[i * 3 + 2] = 0.5 + Math.random() * 0.45; }
  scene.add(mesh);
  return { mesh, offs, N, cx: 1e9, cz: 1e9 };
})();
const _m4 = new THREE.Matrix4();
function updateGrass(px, pz) {
  if (Math.abs(px - grass.cx) < 3 && Math.abs(pz - grass.cz) < 3) return;
  grass.cx = px; grass.cz = pz;
  const P = GRASS_PATCH, o = grass.offs;
  for (let i = 0; i < grass.N; i++) {
    const x = o[i * 3] + P * Math.round((px - o[i * 3]) / P);
    const z = o[i * 3 + 1] + P * Math.round((pz - o[i * 3 + 1]) / P);
    const s = o[i * 3 + 2];
    _m4.makeScale(s, s, s); _m4.setPosition(x, terrainH(x, z) - 0.02, z);
    grass.mesh.setMatrixAt(i, _m4);
  }
  grass.mesh.instanceMatrix.needsUpdate = true;
}

/* ---------------- кусты и деревья ---------------- */
(function buildVegetation() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshPhongMaterial({ color: 0x3b5422, flatShading: true, shininess: 0 }), Q.bushes);
  const col = new THREE.Color();
  let n = 0, guard = 0;
  while (n < Q.bushes && guard++ < 20000) {
    const x = (Math.random() * 2 - 1) * 1600, z = -2600 + Math.random() * 3300;
    if (Math.abs(x) < 50 && z < 40 && z > -1750) continue;
    if (Math.hypot(x, z) < 35) continue;
    const s = 0.6 + Math.random() * 1.8;
    _m4.makeScale(s * 1.2, s * 0.65, s); _m4.setPosition(x, terrainH(x, z) + s * 0.25, z);
    mesh.setMatrixAt(n, _m4);
    col.setRGB(0.18 + Math.random() * 0.12, 0.28 + Math.random() * 0.12, 0.1 + Math.random() * 0.05);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  scene.add(mesh);
  // одиночные деревья (вяз/тополь) по краям поля
  const trunkM = new THREE.MeshLambertMaterial({ color: 0x4a3a28 }), crownM = new THREE.MeshPhongMaterial({ color: 0x35501f, flatShading: true, shininess: 0 });
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1, x = side * (90 + Math.random() * 600), z = 80 - Math.random() * 2200;
    const g = new THREE.Group(), h = 5 + Math.random() * 6;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 6), trunkM); tr.position.y = h / 2; g.add(tr);
    for (let c = 0; c < 3; c++) { const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 + Math.random() * 1.6, 0), crownM); cr.position.set(gauss() * 0.9, h + gauss() * 0.8, gauss() * 0.9); g.add(cr); }
    g.position.set(x, terrainH(x, z) - 0.2, z);
    scene.add(g);
  }
})();

/* ---------------- облака ---------------- */
const clouds = [];
for (let i = 0; i < 26; i++) {
  const m = new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
  const s = new THREE.Sprite(m);
  const a = Math.random() * TAU, r = 3500 + Math.random() * 3500;
  s.position.set(Math.cos(a) * r, 500 + Math.random() * 1200, Math.sin(a) * r - 800);
  const sc = 900 + Math.random() * 1500; s.scale.set(sc, sc * 0.4, 1);
  s.renderOrder = -5; scene.add(s); clouds.push(s);
}

/* ---------------- стрельбище: огневой рубеж ---------------- */
(function buildFiringLine() {
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 2.2), new THREE.MeshLambertMaterial({ color: 0x3f4a2e }));
  mat.position.set(0, terrainH(0, 0) + 0.02, 0.3); scene.add(mat);
  const bagM = new THREE.MeshLambertMaterial({ color: 0x9a8a66 });
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.32), bagM); b.position.set(-7 + i * 0.6, terrainH(-7 + i * 0.6, -1.5) + 0.12, -1.5); b.rotation.y = gauss() * 0.1; scene.add(b); }
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a6040 });
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.8), wood); top.position.y = 0.9; table.add(top);
  [[-0.7, -0.33], [0.7, -0.33], [-0.7, 0.33], [0.7, 0.33]].forEach((p) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), wood); l.position.set(p[0], 0.45, p[1]); table.add(l); });
  table.position.set(3.2, terrainH(3.2, 1.2), 1.2); scene.add(table);
})();

/* ---------------- мишени ---------------- */
const targets = [];
const targetMeshes = [];
const woodM = new THREE.MeshLambertMaterial({ color: 0x6b5236 });
const steelFrameM = new THREE.MeshLambertMaterial({ color: 0x34372f });
const SIL = [[-0.25, 0], [0.25, 0], [0.25, 0.95], [0.2, 1.1], [0.09, 1.17], [0.1, 1.3], [0.065, 1.43], [0, 1.47], [-0.065, 1.43], [-0.1, 1.3], [-0.09, 1.17], [-0.2, 1.1], [-0.25, 0.95]];
function inPoly(x, y, P) {
  let ins = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function faceShooter(g, x, z) { g.rotation.y = Math.atan2(-x, -z); }
function frameVectors(T, g) {
  const th = g.rotation.y;
  T.n = new V3(Math.sin(th), 0, Math.cos(th));
  T.u = new V3(Math.cos(th), 0, -Math.sin(th));
}
function makeSign(D, x, z) {
  const c = canvasTex(256, 128, (ctx) => { ctx.fillStyle = '#efe9d2'; ctx.fillRect(0, 0, 256, 128); ctx.strokeStyle = '#222'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 120); ctx.fillStyle = '#1d1d1d'; ctx.font = 'bold 84px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(D), 128, 70); });
  const w = Math.max(0.6, D * 0.0016);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshLambertMaterial({ map: c }));
  const g = new THREE.Group(); g.add(m); m.position.y = w / 4 + 0.25;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), woodM); post.position.y = 0.12; g.add(post);
  g.position.set(x, terrainH(x, z), z); faceShooter(g, x, z);
  scene.add(g);
  return g;
}
const signs = [];
function makeRing(D, x, R) {
  const z = -D, S = R * 1.15;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const g = new THREE.Group();
  const gy = terrainH(x, z), cy = 1.0 + S;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2 * S, 2 * S), new THREE.MeshLambertMaterial({ map: tex }));
  board.position.y = cy; g.add(board);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2 * S + 0.06, 2 * S + 0.06, 0.03), woodM); back.position.set(0, cy, -0.025); g.add(back);
  [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, cy + S + 0.5, 0.07), woodM); p.position.set(s * (S + 0.06), (cy + S - 0.5) / 2, -0.05); g.add(p); });
  g.position.set(x, gy, z); faceShooter(g, x, z); scene.add(g);
  const T = { kind: 'ring', D, R, S, g, mesh: board, cv, ctx, tex, c: new V3(x, gy + cy, z), hits: [], score: 0 };
  frameVectors(T, g);
  board.userData.T = T; targetMeshes.push(board);
  paintRing(T);
  targets.push(T);
  signs.push(makeSign(D, x + S + 0.9 + D * 0.001, z));
}
function paintRing(T) {
  const c = T.ctx, P = 256 / 1.15;
  c.fillStyle = '#d6cdb0'; c.fillRect(0, 0, 512, 512);
  for (let k = 1; k <= 10; k++) {
    const r = P * (11 - k) / 10;
    c.beginPath(); c.arc(256, 256, r, 0, TAU);
    c.fillStyle = k <= 6 ? '#f3f0e4' : '#1c1c1a'; c.fill();
    c.lineWidth = 2; c.strokeStyle = k <= 6 ? '#2a2a28' : '#d8d6cc'; c.stroke();
  }
  c.fillStyle = '#2a2a28'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let k = 1; k <= 8; k++) { const r = P * (10.5 - k) / 10; if (k >= 7) c.fillStyle = '#e6e4da'; c.fillText(String(k), 256, 256 - r); c.fillText(String(k), 256, 256 + r); }
  c.strokeStyle = '#e6e4da'; c.lineWidth = 2; c.beginPath(); c.moveTo(250, 256); c.lineTo(262, 256); c.moveTo(256, 250); c.lineTo(256, 262); c.stroke();
  const hr = Math.max(3, 0.016 / T.S * 256);
  T.hits.forEach((h, i) => {
    const px = 256 + h.a / T.S * 256, py = 256 - h.b / T.S * 256;
    const last = i === T.hits.length - 1;
    c.beginPath(); c.arc(px, py, hr, 0, TAU); c.fillStyle = '#050505'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#8a8270'; c.stroke();
    if (last) { c.beginPath(); c.arc(px, py, hr * 2.6, 0, TAU); c.lineWidth = 4; c.strokeStyle = '#ff8a1c'; c.stroke(); }
  });
  T.tex.needsUpdate = true;
}
function makeSteel(D, x) {
  const z = -D;
  const g = new THREE.Group();
  const gy = terrainH(x, z);
  [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.15, 0.06), steelFrameM); p.position.set(s * 0.5, 1.0, 0); g.add(p); });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), steelFrameM); bar.position.y = 2.05; g.add(bar);
  const pivot = new THREE.Group(); pivot.position.y = 2.0; g.add(pivot);
  const shape = new THREE.Shape(); SIL.forEach((p, i) => (i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1])));
  const geo = new THREE.ShapeGeometry(shape);
  const uv = geo.attributes.uv, pp = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + 0.3) / 0.6, pp.getY(i) / 1.5);
  geo.translate(0, -1.57, 0);
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 320;
  const ctx = cv.getContext('2d'); const tex = new THREE.CanvasTexture(cv);
  const plate = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  pivot.add(plate);
  [-0.12, 0.12].forEach((s) => { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.01), steelFrameM); ch.position.set(s, -0.05, 0); pivot.add(ch); });
  g.position.set(x, gy, z); faceShooter(g, x, z); scene.add(g);
  // центр пластины (в состоянии покоя): низ на высоте 0.43 м
  const T = { kind: 'steel', D, g, pivot, mesh: plate, cv, ctx, tex, c: new V3(x, gy + 0.43 + 0.735, z), bottom: 0.43, swing: 0, swingV: 0, hits: [], score: 0 };
  frameVectors(T, g);
  plate.userData.T = T; targetMeshes.push(plate);
  paintSteel(T);
  targets.push(T);
  signs.push(makeSign(D, x + 1.1 + D * 0.001, z));
}
function paintSteel(T) {
  const c = T.ctx;
  c.fillStyle = '#e9ebe4'; c.fillRect(0, 0, 128, 320);
  c.strokeStyle = '#b7bbb0'; c.lineWidth = 3; c.strokeRect(2, 2, 124, 316);
  T.hits.forEach((h, i) => {
    const px = (h.a + 0.3) / 0.6 * 128, py = 320 - h.b / 1.5 * 320;
    const last = i === T.hits.length - 1;
    c.fillStyle = '#4c4f4a'; c.beginPath(); c.arc(px, py, 5, 0, TAU); c.fill();
    c.fillStyle = 'rgba(80,82,78,.55)';
    for (let s = 0; s < 6; s++) { const a = Math.random() * TAU, r = 6 + Math.random() * 5; c.beginPath(); c.arc(px + Math.cos(a) * r, py + Math.sin(a) * r, 1.8, 0, TAU); c.fill(); }
    if (last) { c.beginPath(); c.arc(px, py, 12, 0, TAU); c.lineWidth = 3; c.strokeStyle = '#ff8a1c'; c.stroke(); }
  });
  T.tex.needsUpdate = true;
}
// раскладка: углы мишеней разнесены, чтобы ближние не закрывали дальние
[[100, -8, 0.25], [200, 8, 0.25], [300, -14, 0.3], [400, 14, 0.4], [500, -4, 0.5], [600, -30, 0.5], [700, -22, 0.6], [800, 6, 0.6], [1000, -16, 0.75], [1200, 20, 0.9], [1500, 0, 1.0]]
  .forEach((t) => makeRing(t[0], t[1], t[2]));
[[150, 16], [250, -24], [350, 4], [450, -28], [650, 30], [900, -22], [1100, 28]].forEach((t) => makeSteel(t[0], t[1]));

/* ---------------- ветроуказатели ---------------- */
const socks = [];
(function buildSocks() {
  const tex = canvasTex(32, 128, (c) => { for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#f2f0ea' : '#f06a1d'; c.fillRect(0, i * 25.6, 32, 25.6); } });
  const geo = new THREE.CylinderGeometry(0.09, 0.24, 1.4, 12, 1, true);
  geo.translate(0, -0.7, 0);  // широкая часть у мачты
  geo.rotateZ(Math.PI / 2);   // вдоль +X
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  [[-30, -60], [32, -300], [-36, -600], [38, -900], [-40, -1200], [30, -1480]].forEach((p) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.5, 6), steelFrameM); pole.position.y = 2.25; g.add(pole);
    const pv = new THREE.Group(); pv.position.y = 4.4; pv.rotation.order = 'YZX'; g.add(pv);
    const sock = new THREE.Mesh(geo, mat); pv.add(sock);
    g.position.set(p[0], terrainH(p[0], p[1]), p[1]);
    scene.add(g);
    socks.push({ pv, z: p[1], ph: Math.random() * 10 });
  });
})();

/* ---------------- дождь ---------------- */
const RAIN_N = IS_TOUCH ? 900 : 2200;
const rain = (function () {
  const pos = new Float32Array(RAIN_N * 6);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaab4bd, transparent: true, opacity: 0.45 }));
  l.frustumCulled = false; l.visible = false; scene.add(l);
  const seeds = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) { seeds[i * 3] = Math.random() * 40 - 20; seeds[i * 3 + 1] = Math.random() * 20; seeds[i * 3 + 2] = Math.random() * 40 - 20; }
  return { l, pos, seeds, geo };
})();

/* ---------------- погода: применение к сцене ---------------- */
function applyWeatherVisuals() {
  const w = WEATHER[S.weather];
  skyU.top.value.setHex(w.top); skyU.hor.value.setHex(w.hor); skyU.sunI.value = w.sun;
  scene.fog.color.setHex(w.hor); scene.fog.density = w.fog;
  sun.intensity = w.sun; hemi.intensity = w.hemi;
  clouds.forEach((c, i) => { c.visible = i / clouds.length < w.clouds + 0.05; c.material.color.setHex(w.rain ? 0x8a9097 : w.clouds > 0.9 ? 0xc5c9cc : 0xffffff); c.material.opacity = w.clouds > 0.9 ? 0.95 : 0.8; });
  rain.l.visible = !!w.rain;
  renderer.setClearColor(w.hor);
}

/* ---------------- модель винтовки в руках ---------------- */
const rifleHolder = new THREE.Group();
camera.add(rifleHolder);
rifleHolder.position.set(0.16, -0.17, -0.32);
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
function buildRifle(look) {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); g.add(m); return m; };
  const cyl = (r1, r2, l, c, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, 12), M(c)); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; };
  const C = {
    svd:   { stock: 0x7a4a26, body: 0x26282a, hand: 0x7a4a26, len: 1.0, scopeX: -0.035, mag: 0x1e1f20 },
    sv98:  { stock: 0x2b2d2a, body: 0x1d1f1e, hand: 0x2b2d2a, len: 0.95, scopeX: 0, mag: 0x1c1c1c, bip: 1 },
    t5000: { stock: 0xb39a6c, body: 0x2a2a27, hand: 0xb39a6c, len: 1.05, scopeX: 0, mag: 0x222, bip: 1 },
    m24:   { stock: 0x4b5a35, body: 0x202220, hand: 0x4b5a35, len: 0.95, scopeX: 0, mag: 0x202220 },
    awm:   { stock: 0x5f6b46, body: 0x262826, hand: 0x5f6b46, len: 1.0, scopeX: 0, mag: 0x222, bip: 1, brake: 1 },
    m107:  { stock: 0x3a3c3a, body: 0x2f312f, hand: 0x3a3c3a, len: 1.15, scopeX: 0, mag: 0x2a2a2a, bip: 1, brake: 2 },
  }[look];
  const big = look === 'm107' ? 1.35 : 1;
  box(0.07 * big, 0.12 * big, 0.36, C.stock, 0, -0.08, 0.3);              // приклад
  box(0.055 * big, 0.07 * big, 0.34, C.body, 0, -0.04, -0.05);            // ствольная коробка
  box(0.06 * big, 0.06, 0.32, C.hand, 0, -0.05, -0.36);                   // цевьё
  box(0.035, 0.11, 0.05, C.stock, 0, -0.12, 0.06);                         // рукоять
  const mg = box(0.04 * big, look === 'svd' || look === 'sv98' ? 0.16 : 0.1, 0.09, C.mag, 0, -0.13, -0.07);
  if (look === 'svd') mg.rotation.x = -0.25;
  cyl(0.011 * big, 0.013 * big, C.len, 0x161616, 0, -0.03, -0.25 - C.len / 2); // ствол
  if (C.brake) box(0.05 * C.brake, 0.035 * C.brake, 0.09, 0x1a1a1a, 0, -0.03, -0.25 - C.len);
  if (look === 'svd') cyl(0.016, 0.016, 0.08, 0x111, 0, -0.03, -0.25 - C.len);
  // прицел
  cyl(0.02, 0.02, 0.3, 0x141414, C.scopeX, 0.04, -0.05);
  cyl(0.026, 0.023, 0.08, 0x141414, C.scopeX, 0.04, -0.23);
  cyl(0.022, 0.026, 0.06, 0x141414, C.scopeX, 0.04, 0.12);
  box(0.02, 0.03, 0.03, 0x141414, C.scopeX, 0.07, -0.05);
  box(0.02, 0.05, 0.03, 0x111, C.scopeX, 0.0, -0.12);
  box(0.02, 0.05, 0.03, 0x111, C.scopeX, 0.0, 0.03);
  if (C.bip) { [-1, 1].forEach((s) => { const l = box(0.012, 0.22, 0.012, 0x1a1a1a, s * 0.03, -0.15, -0.5); l.rotation.z = s * 0.15; l.rotation.x = -0.3; }); }
  return g;
}
const rifleModels = {};
function showRifleModel() {
  while (rifleHolder.children.length) rifleHolder.remove(rifleHolder.children[0]);
  const rf = curRifle();
  if (!rifleModels[rf.look]) { const m = buildRifle(rf.look); m.scale.setScalar(0.62); m.rotation.y = 0.05; rifleModels[rf.look] = m; }
  rifleHolder.add(rifleModels[rf.look]);
  flash.position.set(0, -0.02, -(0.25 + 1.1) * 0.62); flash.scale.set(0.25, 0.25, 1);
  rifleHolder.add(flash);
}

/* ---------------- эффекты: трассеры, пыль, искры ---------------- */
const effects = [];
function spawnPuff(p, color, size, life, n, rise, spread) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: 0.95 });
    const s = new THREE.Sprite(m);
    s.position.copy(p); s.position.x += gauss() * spread; s.position.z += gauss() * spread; s.position.y += Math.random() * spread * 0.6;
    scene.add(s);
    effects.push({ o: s, t: 0, life: life * (0.7 + Math.random() * 0.6), s0: size * 0.3, s1: size * (0.8 + Math.random() * 0.6), v: new V3(gauss() * 0.4, rise * (0.5 + Math.random()), gauss() * 0.4), a0: 0.95 });
  }
}
function spawnSpark(p, size) {
  const m = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); s.position.copy(p); scene.add(s);
  effects.push({ o: s, t: 0, life: 0.18, s0: size, s1: size * 1.6, v: new V3(), a0: 1 });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    const k = e.t / e.life;
    if (k >= 1) { scene.remove(e.o); e.o.material.dispose(); effects.splice(i, 1); continue; }
    const s = lerp(e.s0, e.s1, 1 - Math.pow(1 - k, 2)); e.o.scale.set(s, s, 1);
    e.o.material.opacity = e.a0 * (1 - k) * (1 - k * 0.3);
    e.o.position.addScaledVector(e.v, dt); e.v.multiplyScalar(1 - dt * 1.2);
  }
}

/* ---------------- звук (синтез WebAudio) ---------------- */
let AC = null, noiseBuf = null, windGain = null, rainGain = null;
function audioInit() {
  if (!S.sound) return;
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const mk = (type, f, q) => { const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = AC.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(AC.destination); src.start(); return g; };
      windGain = mk('bandpass', 420, 0.6); rainGain = mk('highpass', 2500, 0.5);
    } else if (AC.state === 'suspended') AC.resume();
  } catch (e) { AC = null; }
}
function noiseHit(t0, dur, type, f, gain, q) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
  const g = AC.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  src.connect(fl); fl.connect(g); g.connect(AC.destination); src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
}
function tone(t0, f, dur, gain, type, f2) {
  const o = AC.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
function sndShot(power) {
  if (!AC || !S.sound) return; const t = AC.currentTime;
  noiseHit(t, 0.06, 'highpass', 1500, 0.9 * power);
  noiseHit(t, 0.55 + power * 0.3, 'lowpass', 900, 1.0 * power);
  tone(t, 90, 0.35, 0.8 * power, 'sine', 35);
  noiseHit(t + 0.25, 1.4, 'lowpass', 300, 0.25 * power); // эхо степи
}
function sndBolt(delay) {
  if (!AC || !S.sound) return; const t = AC.currentTime + delay;
  noiseHit(t, 0.05, 'bandpass', 2600, 0.35, 3); noiseHit(t + 0.22, 0.06, 'bandpass', 1900, 0.4, 3); noiseHit(t + 0.42, 0.05, 'bandpass', 3000, 0.35, 3);
}
function sndClick() { if (!AC || !S.sound) return; noiseHit(AC.currentTime, 0.025, 'bandpass', 3500, 0.25, 4); }
function sndImpact(kind, delay, dist) {
  if (!AC || !S.sound) return; const t = AC.currentTime + delay; const v = clamp(300 / (dist + 150), 0.08, 0.9);
  if (kind === 'steel') { tone(t, 1250, 1.1, 0.5 * v, 'triangle'); tone(t, 1870, 0.7, 0.25 * v, 'sine'); }
  else if (kind === 'paper') noiseHit(t, 0.08, 'bandpass', 800, 0.4 * v, 1);
  else noiseHit(t, 0.18, 'lowpass', 500, 0.6 * v);
}
function sndBeep() { if (!AC || !S.sound) return; tone(AC.currentTime, 2400, 0.08, 0.12, 'square'); }

/* ---------------- игрок ---------------- */
const P = { x: 0, z: 0.6, yaw: 0, pitch: 0.01, stance: 0, eye: 1.62, moving: 0, bob: 0 };
const STANCE = [
  { eye: 1.62, speed: 3.4, sway: 3.0, tremor: 0.55, kick: 1.6, name: 'Стоя' },
  { eye: 1.0,  speed: 1.7, sway: 1.6, tremor: 0.32, kick: 1.2, name: 'Сидя' },
  { eye: 0.42, speed: 0.6, sway: 0.5, tremor: 0.11, kick: 0.65, name: 'Лёжа' },
];
const AIM = { mode: 'hip', zoom: 4, binoZoom: 10 };     // hip | scope | bino
const BR = { hold: false, stamina: 1, factor: 1, gasp: 0, phase: 0 };
const REC = { k: 0, v: 0 };
const SW = { x: 0, y: 0 };
let cycleT = 0, reloadT = 0, simT = 0;
const STATS = { shots: 0, hits: 0, points: 0 };
const input = { mx: 0, my: 0, keys: {} };

function setStance(s) {
  P.stance = P.stance === s ? 0 : s;
  $('bCrouch').classList.toggle('on', P.stance === 1);
  $('bProne').classList.toggle('on', P.stance === 2);
}
function fovFor(mode) {
  if (mode === 'scope') return 30 / AIM.zoom;
  if (mode === 'bino') return 70 / AIM.binoZoom;
  return 65;
}
function setAim(mode) {
  if (AIM.mode === mode) mode = 'hip';
  AIM.mode = mode;
  const sc = curScope();
  if (mode === 'scope') { const st = curTur(); AIM.zoom = st.zoom || sc.min; }
  $('bScope').classList.toggle('on', mode === 'scope');
  $('bBino').classList.toggle('on', mode === 'bino');
  rifleHolder.visible = mode === 'hip';
  updateAimUI();
}
function updateAimUI() {
  const m = AIM.mode, sc = curScope();
  $('tur').hidden = m !== 'scope';
  $('bBreath').hidden = m !== 'scope';
  $('stamina').hidden = m !== 'scope';
  const zoomable = (m === 'scope' && sc.max > sc.min) || m === 'bino';
  $('zoom').hidden = !zoomable;
  if (IS_TOUCH) { $('joy').hidden = m !== 'hip'; $('bFireL').hidden = m !== 'hip'; }
  $('weapon').hidden = m === 'scope';
  $('bFire').querySelector('span').textContent = m === 'bino' ? 'ЛАЗЕР' : 'ОГОНЬ';
  updateZoomUI(); updateTurUI();
}
function setZoomFrac(f) {
  f = clamp(f, 0, 1);
  if (AIM.mode === 'bino') AIM.binoZoom = Math.round(lerp(7, 25, f) * 2) / 2;
  else { const sc = curScope(); AIM.zoom = Math.round(lerp(sc.min, sc.max, f) * 2) / 2; curTur().zoom = AIM.zoom; }
  updateZoomUI();
}
function zoomFrac() {
  if (AIM.mode === 'bino') return (AIM.binoZoom - 7) / 18;
  const sc = curScope(); return sc.max > sc.min ? (AIM.zoom - sc.min) / (sc.max - sc.min) : 0;
}
function updateZoomUI() {
  const f = zoomFrac(), h = 170 - 24 - 24;
  $('zoomKnob').style.top = (12 + (1 - f) * h) + 'px';
  $('zoomTxt').textContent = (AIM.mode === 'bino' ? AIM.binoZoom : AIM.zoom).toFixed(AIM.mode === 'bino' ? 0 : 1).replace('.0', '') + '×';
}
function fmt(v, d) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d); }
function updateTurUI() {
  const sc = curScope(), st = curTur();
  if (sc.unit === 'thou') {
    $('turE').textContent = 'ПРИЦЕЛ ' + st.drum;
    $('turW').textContent = 'БОК ' + fmt(st.w * sc.click, 1);
  } else {
    const d = sc.unit === 'moa' ? 2 : 1;
    $('turE').textContent = 'ВЕРТ ' + fmt(st.e * sc.click, d);
    $('turW').textContent = 'ГОР ' + fmt(st.w * sc.click, d);
  }
  $('turU').textContent = UNAME[sc.unit];
}
function turretStep(t) {
  const sc = curScope(), st = curTur();
  if (t === '0') { st.e = 0; st.w = 0; st.drum = 1; }
  else if (t === 'e+' || t === 'e-') {
    const d = t === 'e+' ? 1 : -1;
    if (sc.unit === 'thou') st.drum = clamp(st.drum + d, 1, 10);
    else st.e = clamp(st.e + d, -Math.round(2 / sc.click), Math.round(sc.maxE / sc.click));
  } else {
    const d = t === 'w+' ? 1 : -1;
    st.w = clamp(st.w + d, -Math.round(sc.maxW / sc.click), Math.round(sc.maxW / sc.click));
  }
  sndClick(); updateTurUI();
}

function updateWeaponUI() {
  const rf = curRifle(), st = curTur();
  $('wName').textContent = rf.name;
  $('wCal').textContent = rf.cal + ' · ' + scopeOf(rf).name;
  $('wAmmo').textContent = reloadT > 0 ? '···' : st.ammo + '/' + rf.mag;
}
function selectRifle(i) {
  if (i === S.rifle && rifleModels[curRifle().look]) return;
  S.rifle = (i + RIFLES.length) % RIFLES.length; save();
  cycleT = 0.6; reloadT = 0;
  const m = AIM.mode; AIM.mode = 'hip'; showRifleModel(); if (m !== 'hip') setAim(m); else setAim('hip');
  updateWeaponUI(); updateTurUI();
}
function reload() {
  const rf = curRifle(), st = curTur();
  if (reloadT > 0 || st.ammo === rf.mag) return;
  reloadT = rf.semi ? 2.6 : 3.2;
  if (AC && S.sound) { const t = AC.currentTime; noiseHit(t + 0.3, 0.07, 'bandpass', 1500, 0.4, 2); noiseHit(t + reloadT - 0.6, 0.08, 'bandpass', 2000, 0.45, 2); }
  updateWeaponUI();
}

/* ---------------- пули ---------------- */
const bullets = [];
const bulletMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0045, 0.035, 8), new THREE.MeshLambertMaterial({ color: 0xc27a3a }));
bulletMesh.geometry.rotateX(Math.PI / 2); bulletMesh.visible = false; bulletMesh.scale.setScalar(3); scene.add(bulletMesh);
const BCAM = { b: null, hold: 0 };

const _tmp = new V3(), _tmp2 = new V3();
function aimedTarget(origin, dir) {
  let best = null, bestA = 0.02;
  for (const T of targets) {
    _tmp.subVectors(T.c, origin); const d = _tmp.length(); if (d < 5) continue;
    const a = Math.acos(clamp(_tmp.dot(dir) / d, -1, 1));
    if (a < bestA) { bestA = a; best = T; }
  }
  return best;
}
function fire() {
  audioInit();
  if (AIM.mode === 'bino') { laser(); return; }
  const rf = curRifle(), st = curTur();
  if (reloadT > 0) return;
  if (st.ammo <= 0) { reload(); return; }
  if (cycleT > 0) { if (rf.semi) return; sndClick(); return; }
  st.ammo--; cycleT = rf.cycle;
  STATS.shots++;
  const q = camera.quaternion;
  const dir = new V3(0, 0, -1).applyQuaternion(q), up = new V3(0, 1, 0).applyQuaternion(q), right = new V3(1, 0, 0).applyQuaternion(q);
  const origin = camera.position.clone().addScaledVector(up, -rf.sh).addScaledVector(dir, 0.5);
  const d = dir.clone();
  const el = zeroAngle(rf) + elevRad() + gauss() * rf.disp * 0.001;
  const wd = windRad() + gauss() * rf.disp * 0.001;
  d.applyAxisAngle(right, el); d.applyAxisAngle(up, -wd);
  const mv = mvNow(rf) + gauss() * 2.5;
  const hr = new V3(-d.z, 0, d.x).normalize();
  const b = {
    rf, p: origin.clone(), v: d.multiplyScalar(mv), t: 0, right: hr, last: origin.clone(), cur: origin.clone(), alive: true,
    aim: aimedTarget(origin, dir), aimPass: null, paper: new Set(), reported: false, origin: origin.clone(), trail: [], acc: 0,
    aimDir: dir.clone(), mv,
  };
  // трассер
  if (S.tracers) {
    b.spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a3c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: false }));
    b.spr.scale.set(0.018, 0.018, 1); scene.add(b.spr);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    b.line = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false }));
    b.line.frustumCulled = false; scene.add(b.line);
  }
  bullets.push(b);
  // отдача, звук, вспышка
  const sk = STANCE[P.stance].kick * rf.recoil;
  REC.v += 0.75 * sk;
  P.yaw += gauss() * 0.0025 * sk * (P.stance === 2 ? 0.4 : 1);
  sndShot(clamp(0.55 + rf.recoil * 0.25, 0.5, 1));
  if (!rf.semi) sndBolt(0.45);
  flash.material.opacity = 1;
  if (P.stance === 2) { const mp = camera.position.clone().addScaledVector(dir, 1.2); mp.y = terrainH(mp.x, mp.z) + 0.05; spawnPuff(mp, 0xa89a7c, 0.9 * rf.recoil, 1.2, 4, 0.4, 0.3); }
  if (S.bcam && b.aim && b.aim.D >= 250 && !BCAM.b) { BCAM.b = b; BCAM.hold = 0; }
  updateWeaponUI();
}
function updateBullets(dt) {
  const DT = 0.001;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.alive) {
      b.acc += dt;
      while (b.acc >= DT && b.alive) { b.acc -= DT; stepBullet(b, DT); }
      if (b.alive && (b.t > 8 || b.cur.y < -100)) killBullet(b, null);
    }
    if (b.spr) {
      b.spr.position.copy(b.cur);
      b.trail.unshift(b.cur.x, b.cur.y, b.cur.z); if (b.trail.length > 48) b.trail.length = 48;
      const arr = b.line.geometry.attributes.position.array;
      for (let k = 0; k < 16; k++) { const j = Math.min(k, b.trail.length / 3 - 1) * 3; arr[k * 3] = b.trail[j]; arr[k * 3 + 1] = b.trail[j + 1]; arr[k * 3 + 2] = b.trail[j + 2]; }
      b.line.geometry.attributes.position.needsUpdate = true;
      const sz = AIM.mode === 'hip' ? 0.012 : 0.02;
      b.spr.scale.set(sz, sz, 1);
      if (!b.alive) { b.fade = (b.fade || 1) - dt * 4; b.spr.material.opacity = Math.max(0, b.fade); b.line.material.opacity = Math.max(0, b.fade) * 0.85; }
    }
    if (!b.alive && (!b.spr || b.fade <= 0) && BCAM.b !== b) {
      if (b.spr) { scene.remove(b.spr); scene.remove(b.line); b.spr.material.dispose(); b.line.geometry.dispose(); b.line.material.dispose(); }
      bullets.splice(i, 1);
    }
  }
}
const _A = [0, 0, 0];
function stepBullet(b, dt) {
  const rf = b.rf, bc = rf.bc * 703.07;
  const w = windAt(b.p.z, simT);
  const wx = w[0], wz = w[1];
  const v = b.v;
  accel(v.x, v.y, v.z, wx, wz, COND.rho, COND.snd, bc, _A);
  const hx = v.x + _A[0] * dt * 0.5, hy = v.y + _A[1] * dt * 0.5, hz = v.z + _A[2] * dt * 0.5;
  accel(hx, hy, hz, wx, wz, COND.rho, COND.snd, bc, _A);
  const nx = v.x + _A[0] * dt, ny = v.y + _A[1] * dt, nz = v.z + _A[2] * dt;
  b.p.x += (v.x + nx) * 0.5 * dt; b.p.y += (v.y + ny) * 0.5 * dt; b.p.z += (v.z + nz) * 0.5 * dt;
  v.set(nx, ny, nz);
  b.t += dt;
  const dr = spinDrift(rf, b.t);
  b.cur.set(b.p.x + b.right.x * dr, b.p.y, b.p.z + b.right.z * dr);
  collide(b, b.last, b.cur);
  b.last.copy(b.cur);
}
function collide(b, p0, p1) {
  for (const T of targets) {
    const d0 = (p0.x - T.c.x) * T.n.x + (p0.z - T.c.z) * T.n.z;
    const d1 = (p1.x - T.c.x) * T.n.x + (p1.z - T.c.z) * T.n.z;
    if (d0 > 0 && d1 <= 0) {
      const f = d0 / (d0 - d1);
      const px = p0.x + (p1.x - p0.x) * f, py = p0.y + (p1.y - p0.y) * f, pz = p0.z + (p1.z - p0.z) * f;
      const a = (px - T.c.x) * T.u.x + (pz - T.c.z) * T.u.z, bb = py - T.c.y;
      if (T === b.aim && !b.aimPass) b.aimPass = { a, b: bb, t: b.t, v: b.v.length() };
      if (T.kind === 'ring') {
        if (Math.abs(a) <= T.S && Math.abs(bb) <= T.S && !b.paper.has(T)) { b.paper.add(T); hitRing(b, T, a, bb, new V3(px, py, pz)); }
      } else if (T.kind === 'steel') {
        const ly = bb + 0.735;
        if (Math.abs(a) < 0.3 && ly > -0.05 && ly < 1.55 && inPoly(a, ly, SIL)) { hitSteel(b, T, a, ly, new V3(px, py, pz)); return; }
      }
    }
  }
  const g1 = terrainH(p1.x, p1.z);
  if (p1.y <= g1) {
    const g0 = terrainH(p0.x, p0.z);
    const e0 = p0.y - g0, e1 = p1.y - g1, f = e0 > 0 ? e0 / (e0 - e1) : 0;
    const pt = new V3(lerp(p0.x, p1.x, f), lerp(p0.y, p1.y, f), lerp(p0.z, p1.z, f));
    killBullet(b, pt);
  }
}
function energy(b) { const v = b.v.length(); return 0.5 * b.rf.g / 1000 * v * v; }
function hitRing(b, T, a, bb, pt) {
  const r = Math.hypot(a, bb);
  const score = r <= T.R ? Math.max(1, 10 - Math.floor(r / T.R * 10)) : 0;
  T.hits.push({ a, b: bb, score }); T.score += score;
  paintRing(T);
  spawnPuff(pt.clone().addScaledVector(T.n, -0.1), 0xe8e2d0, 0.25 + T.D * 0.0004, 0.8, 2, 0.2, 0.05);
  const dist = pt.distanceTo(camera.position);
  sndImpact('paper', dist / 343, dist);
  if (!b.reported) { b.reported = true; STATS.hits++; STATS.points += score; report({ kind: 'ring', T, a, b: bb, score, t: b.t, v: b.v.length(), E: energy(b) }); }
}
function hitSteel(b, T, a, ly, pt) {
  T.hits.push({ a, b: ly }); T.score += 5;
  T.swingV += clamp(b.rf.g * b.v.length() / 9000, 0.3, 4) * (0.6 + Math.random() * 0.4);
  paintSteel(T);
  spawnSpark(pt, 0.35 + T.D * 0.0012);
  spawnPuff(pt, 0xc9c6bb, 0.4 + T.D * 0.0006, 0.6, 3, 0.4, 0.08);
  const dist = pt.distanceTo(camera.position);
  sndImpact('steel', dist / 343, dist);
  b.alive = false; b.cur.copy(pt);
  if (!b.reported) { b.reported = true; STATS.hits++; STATS.points += 5; report({ kind: 'steel', T, a, b: ly - 0.735, t: b.t, v: b.v.length(), E: energy(b) }); }
  if (BCAM.b === b) BCAM.hold = 0.9;
}
function killBullet(b, pt) {
  b.alive = false;
  if (pt) {
    b.cur.copy(pt);
    const dist = pt.distanceTo(camera.position);
    const sz = 0.7 + clamp(dist / 1000, 0, 1.6) + b.rf.g * 0.012;
    spawnPuff(pt, 0x9b8a68, sz, 1.8, 6, 0.6, 0.25);
    sndImpact('ground', dist / 343, dist);
  }
  if (!b.reported) {
    b.reported = true;
    if (b.aim && b.aimPass) report({ kind: 'miss', T: b.aim, a: b.aimPass.a, b: b.aimPass.b, t: b.aimPass.t, v: b.aimPass.v });
    else if (b.aim && pt) {
      const short = b.aim.c.distanceTo(b.origin) - pt.distanceTo(b.origin);
      report({ kind: 'short', T: b.aim, short });
    } else report({ kind: 'none' });
  }
  if (BCAM.b === b) BCAM.hold = 0.9;
}

/* ---------------- сообщение о попадании ---------------- */
let toastT = 0;
function report(r) {
  updateStats();
  if (S.mode !== 'train') return;
  const sc = curScope(), u = UNIT[sc.unit], un = UNAME[sc.unit];
  let h = '', body = '';
  const offs = (a, bb, D) => {
    const v = Math.round(bb * 100), hz = Math.round(a * 100);
    const s1 = (v >= 0 ? 'выше ' : 'ниже ') + Math.abs(v) + ' см', s2 = (hz >= 0 ? 'правее ' : 'левее ') + Math.abs(hz) + ' см';
    const ce = -bb / D / u, cw = -a / D / u;
    return s1 + ', ' + s2 + '<br>поправка: ' + (ce >= 0 ? '▲' : '▼') + Math.abs(ce).toFixed(sc.unit === 'moa' ? 1 : 2) + ' ' + (cw >= 0 ? '▶' : '◀') + Math.abs(cw).toFixed(sc.unit === 'moa' ? 1 : 2) + ' ' + un;
  };
  if (r.kind === 'ring') {
    h = '<div class="h hit">Попадание · ' + r.T.D + ' м · ' + (r.score ? r.score + ' очк.' : 'в щит') + '</div>';
    body = offs(r.a, r.b, r.T.D) + '<br>' + r.t.toFixed(2) + ' с · ' + Math.round(r.v) + ' м/с · ' + Math.round(r.E) + ' Дж';
  } else if (r.kind === 'steel') {
    h = '<div class="h steel">Дзынь! Гонг ' + r.T.D + ' м</div>';
    body = offs(r.a, r.b, r.T.D) + '<br>' + r.t.toFixed(2) + ' с · ' + Math.round(r.v) + ' м/с · ' + Math.round(r.E) + ' Дж';
  } else if (r.kind === 'miss') {
    h = '<div class="h miss">Промах · цель ' + r.T.D + ' м</div>';
    body = offs(r.a, r.b, r.T.D) + '<br>' + r.t.toFixed(2) + ' с · ' + Math.round(r.v) + ' м/с';
  } else if (r.kind === 'short') {
    h = '<div class="h miss">Недолёт · цель ' + r.T.D + ' м</div>';
    body = 'пуля упала примерно в ' + Math.max(1, Math.round(r.short)) + ' м до цели — добавьте вертикальную поправку';
  } else {
    h = '<div class="h miss">Мимо</div>'; body = 'цель не определена — наведитесь на мишень';
  }
  const el = $('toast'); el.innerHTML = h + body; el.classList.add('show'); toastT = 6;
}
function updateStats() {
  $('stats').innerHTML = 'выстр <b>' + STATS.shots + '</b> · попад <b>' + STATS.hits + '</b> · очки <b>' + STATS.points + '</b>';
}

/* ---------------- дальномер ---------------- */
const LRF = { d: null, t: 0, ang: 0, T: null };
const ray = new THREE.Raycaster();
function laser() {
  const o = camera.position.clone(), dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = Infinity, bestT = null;
  ray.set(o, dir); ray.far = 4000;
  const hits = ray.intersectObjects(targetMeshes, false);
  if (hits.length) { best = hits[0].distance; bestT = hits[0].object.userData.T; }
  let s = 1, prev = 0;
  while (s < Math.min(best, 4000)) {
    const x = o.x + dir.x * s, y = o.y + dir.y * s, z = o.z + dir.z * s;
    if (y < terrainH(x, z)) {
      let lo = prev, hi = s;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (o.y + dir.y * m < terrainH(o.x + dir.x * m, o.z + dir.z * m)) hi = m; else lo = m; }
      if (hi < best) { best = hi; bestT = null; }
      break;
    }
    prev = s; s += Math.max(0.5, s * 0.01);
  }
  LRF.d = best < 4000 ? best : null; LRF.t = 6; LRF.ang = Math.asin(clamp(dir.y, -1, 1)) / DEG; LRF.T = bestT;
  sndBeep();
}

/* ---------------- управление ---------------- */
const touch = $('touch');
const joyEl = $('joy'), knob = $('knob');
const JOY = { id: null, ox: 0, oy: 0 };
const LOOK = { id: null, x: 0, y: 0 };
const MDRAG = { id: null, x: 0, y: 0 };
function lookDelta(dx, dy, kind) {
  const k = (kind === 'mouse' ? 0.0022 : 0.0046) * S.sens * (camera.fov / 65) * (AIM.mode === 'hip' ? 1 : 0.85);
  P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k, -1.4, 1.4);
}
function joyStart(e) {
  JOY.id = e.pointerId; JOY.ox = e.clientX; JOY.oy = e.clientY;
  joyEl.style.left = (e.clientX - 65) + 'px'; joyEl.style.top = (e.clientY - 65) + 'px'; joyEl.style.bottom = 'auto';
}
function joyMove(e) {
  let dx = e.clientX - JOY.ox, dy = e.clientY - JOY.oy; const l = Math.hypot(dx, dy), m = 52;
  if (l > m) { dx *= m / l; dy *= m / l; }
  knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  input.mx = dx / m; input.my = -dy / m;
}
function joyEnd() { JOY.id = null; input.mx = 0; input.my = 0; knob.style.transform = ''; joyEl.style.left = ''; joyEl.style.top = ''; joyEl.style.bottom = ''; }

touch.addEventListener('pointerdown', (e) => {
  audioInit();
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement === touch) { if (e.button === 0) fire(); else if (e.button === 2) setAim('scope'); return; }
    try { const r = touch.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* нет захвата курсора */ }
    MDRAG.id = e.pointerId; MDRAG.x = e.clientX; MDRAG.y = e.clientY;
    return;
  }
  if (JOY.id === null && e.clientX < innerWidth * 0.42) { joyStart(e); joyMove(e); }
  else if (LOOK.id === null) { LOOK.id = e.pointerId; LOOK.x = e.clientX; LOOK.y = e.clientY; }
  try { touch.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
touch.addEventListener('pointermove', (e) => {
  if (e.pointerId === JOY.id) joyMove(e);
  else if (e.pointerId === LOOK.id) { lookDelta(e.clientX - LOOK.x, e.clientY - LOOK.y, 'touch'); LOOK.x = e.clientX; LOOK.y = e.clientY; }
  else if (e.pointerId === MDRAG.id && document.pointerLockElement !== touch) { lookDelta(e.clientX - MDRAG.x, e.clientY - MDRAG.y, 'mouse'); MDRAG.x = e.clientX; MDRAG.y = e.clientY; }
});
const endPtr = (e) => { if (e.pointerId === JOY.id) joyEnd(); if (e.pointerId === LOOK.id) LOOK.id = null; if (e.pointerId === MDRAG.id) MDRAG.id = null; };
touch.addEventListener('pointerup', endPtr); touch.addEventListener('pointercancel', endPtr);
document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === touch) lookDelta(e.movementX, e.movementY, 'mouse'); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
touch.addEventListener('wheel', (e) => { if (AIM.mode !== 'hip') { setZoomFrac(zoomFrac() - Math.sign(e.deltaY) * 0.06); } e.preventDefault(); }, { passive: false });

// кнопка огня: нажатие — выстрел, далее палец можно тянуть для доводки (как в мобильных шутерах)
function fireButton(el) {
  let id = null, x = 0, y = 0;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; x = e.clientX; y = e.clientY; try { el.setPointerCapture(id); } catch (err) { /* ignore */ } fire(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; lookDelta(e.clientX - x, e.clientY - y, e.pointerType === 'mouse' ? 'mouse' : 'touch'); x = e.clientX; y = e.clientY; });
  const up = (e) => { if (e.pointerId === id) id = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
fireButton($('bFire')); fireButton($('bFireL'));
function tapButton(el, fn) { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audioInit(); fn(); }); }
tapButton($('bScope'), () => setAim('scope'));
tapButton($('bBino'), () => setAim('bino'));
tapButton($('bCrouch'), () => setStance(1));
tapButton($('bProne'), () => setStance(2));
tapButton($('bReload'), reload);
tapButton($('weapon'), () => selectRifle(S.rifle + 1));
const bBreath = $('bBreath');
bBreath.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); BR.hold = true; bBreath.classList.add('on'); try { bBreath.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
const brUp = () => { BR.hold = false; bBreath.classList.remove('on'); };
bBreath.addEventListener('pointerup', brUp); bBreath.addEventListener('pointercancel', brUp);
// барабанчики с автоповтором
document.querySelectorAll('#tur .tb').forEach((b) => {
  let rep = null, del = null;
  const stop = () => { clearTimeout(del); clearInterval(rep); rep = del = null; };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audioInit(); const t = b.dataset.t; turretStep(t); if (t !== '0') del = setTimeout(() => { rep = setInterval(() => turretStep(t), 70); }, 380); });
  b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('pointerleave', stop);
});
// ползунок кратности
(function () {
  const z = $('zoom'); let id = null;
  const setFromY = (y) => { const r = z.getBoundingClientRect(); setZoomFrac(1 - (y - r.top - 12) / (r.height - 24)); };
  z.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; try { z.setPointerCapture(id); } catch (err) { /* ignore */ } setFromY(e.clientY); });
  z.addEventListener('pointermove', (e) => { if (e.pointerId === id) setFromY(e.clientY); });
  z.addEventListener('pointerup', () => { id = null; }); z.addEventListener('pointercancel', () => { id = null; });
})();
$('bMenu').addEventListener('click', openMenu);
$('bCard').addEventListener('click', openCard);
$('cardClose').addEventListener('click', () => { $('card').hidden = true; });

window.addEventListener('keydown', (e) => {
  if (!$('menu').hidden) { if (e.code === 'Enter') startGame(); return; }
  const k = e.code; input.keys[k] = true;
  if (k === 'Space') { e.preventDefault(); fire(); }
  else if (k === 'KeyQ') setAim('scope');
  else if (k === 'KeyB') setAim('bino');
  else if (k === 'KeyC') setStance(1);
  else if (k === 'KeyZ') setStance(2);
  else if (k === 'KeyR') reload();
  else if (k === 'KeyF') { audioInit(); laser(); }
  else if (k === 'ShiftLeft' || k === 'ShiftRight') BR.hold = true;
  else if (k === 'ArrowUp') { e.preventDefault(); turretStep('e+'); }
  else if (k === 'ArrowDown') { e.preventDefault(); turretStep('e-'); }
  else if (k === 'ArrowLeft') { e.preventDefault(); turretStep('w-'); }
  else if (k === 'ArrowRight') { e.preventDefault(); turretStep('w+'); }
  else if (k === 'KeyX') turretStep('0');
  else if (k === 'Tab') { e.preventDefault(); if ($('card').hidden) openCard(); else $('card').hidden = true; }
  else if (k === 'KeyM' || k === 'Escape') openMenu();
  else if (/^Digit[1-6]$/.test(k)) selectRifle(+k.slice(5) - 1);
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') BR.hold = false; });

/* ---------------- обновление игрока, качание, отдача ---------------- */
function updatePlayer(dt) {
  let mx = input.mx, my = input.my;
  const K = input.keys;
  if (K.KeyW) my += 1; if (K.KeyS) my -= 1; if (K.KeyA) mx -= 1; if (K.KeyD) mx += 1;
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  const st = STANCE[P.stance];
  const sp = st.speed * (AIM.mode === 'hip' ? 1 : 0.45);
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  P.x += (mx * cy - my * sy) * sp * dt;
  P.z += (-mx * sy - my * cy) * sp * dt;
  P.x = clamp(P.x, -160, 160); P.z = clamp(P.z, -320, 90);
  P.moving = lerp(P.moving, Math.min(1, Math.hypot(mx, my)), dt * 6);
  P.eye = lerp(P.eye, st.eye, dt * 5);
  P.bob += dt * sp * 2.2 * P.moving;
}
function updateSway(dt) {
  const st = STANCE[P.stance];
  if (BR.hold && BR.stamina > 0 && BR.gasp <= 0) {
    BR.factor = lerp(BR.factor, 0.1, dt * 3);
    BR.stamina -= dt / 7;
    if (BR.stamina <= 0) { BR.stamina = 0; BR.gasp = 2.5; }
  } else {
    const target = BR.gasp > 0 ? 2.2 : (BR.stamina < 0.3 ? 1.4 : 1);
    BR.factor = lerp(BR.factor, target, dt * 2);
    if (!BR.hold || BR.gasp > 0) BR.stamina = Math.min(1, BR.stamina + dt / 9);
    BR.gasp = Math.max(0, BR.gasp - dt);
  }
  const rate = (BR.gasp > 0 ? 2.2 : 1) * (1 + P.moving * 0.8);
  BR.phase += dt * TAU / 4.2 * rate;
  const amp = st.sway * (1 + P.moving * 2.5) * BR.factor;
  const tr = st.tremor * (0.45 + 0.55 * BR.factor) * (1 + P.moving);
  const tt = simT;
  const heart = Math.pow(Math.max(0, Math.sin(tt * TAU * 1.25)), 12) * 0.25 * st.tremor;
  SW.x = amp * (Math.sin(BR.phase) * 0.8 + 0.3 * Math.sin(BR.phase * 2.7 + 1.3)) + tr * (vnoise(tt * 5, 1.1) - 0.5) * 2;
  SW.y = amp * Math.sin(BR.phase * 2) * 0.45 + tr * (vnoise(tt * 5, 7.7) - 0.5) * 2 + heart;
  // отдача: затухающая пружина
  REC.v += (-120 * REC.k - 19 * REC.v) * dt;
  REC.k += REC.v * dt;
  cycleT = Math.max(0, cycleT - dt);
  if (reloadT > 0) { reloadT -= dt; if (reloadT <= 0) { reloadT = 0; curTur().ammo = curRifle().mag; updateWeaponUI(); } }
}
function applyCamera() {
  const gy = terrainH(P.x, P.z);
  const bob = AIM.mode === 'hip' ? Math.sin(P.bob * 2) * 0.035 * P.moving : 0;
  camera.position.set(P.x, gy + P.eye + bob, P.z);
  camera.rotation.y = P.yaw - SW.x * 0.001;
  camera.rotation.x = P.pitch + SW.y * 0.001 + REC.k;
  camera.rotation.z = 0;
  const fov = fovFor(AIM.mode);
  if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  rifleHolder.position.set(0.16 + Math.sin(P.bob) * 0.01 * P.moving, -0.17 + Math.abs(Math.cos(P.bob)) * 0.01 * P.moving, -0.32 + REC.k * 0.6);
  rifleHolder.rotation.x = REC.k * 2;
}

/* ---------------- окружение ---------------- */
function updateEnv(dt) {
  const w = windAt(P.z, simT);
  grassU.uTime.value = simT;
  grassU.uNear.value = lerp(grassU.uNear.value, P.stance === 2 ? 6 : P.stance === 1 ? 3.2 : 2.4, dt * 3);
  grassU.uWind.value.set(w[0] * 0.035, w[1] * 0.035);
  updateGrass(P.x, P.z);
  sky.position.copy(camera.position);
  for (const s of socks) {
    const ww = windAt(s.z, simT);
    const sp = ww[2];
    const yaw = Math.atan2(-ww[1], ww[0]);
    const droop = (1 - smooth(0.3, 8, sp)) * 1.25;
    const fl = Math.sin(simT * (3 + sp) + s.ph) * (0.04 + sp * 0.012);
    s.pv.rotation.set(0, yaw + fl, -droop + fl * 0.5);
  }
  for (const T of targets) if (T.kind === 'steel' && (T.swing || T.swingV)) {
    T.swingV += (-25 * T.swing - 1.2 * T.swingV) * dt;
    T.swing += T.swingV * dt;
    if (Math.abs(T.swing) < 1e-4 && Math.abs(T.swingV) < 1e-3) { T.swing = 0; T.swingV = 0; }
    T.pivot.rotation.x = -T.swing;
  }
  if (rain.l.visible) {
    const p = rain.pos, sd = rain.seeds, c = camera.position, fall = (simT * 11) % 20;
    for (let i = 0; i < RAIN_N; i++) {
      let y = sd[i * 3 + 1] - fall; if (y < 0) y += 20;
      const x = c.x + sd[i * 3] + w[0] * 0.06 * y, z = c.z + sd[i * 3 + 2] + w[1] * 0.06 * y, yy = c.y - 6 + y;
      p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x - w[0] * 0.03; p[i * 6 + 4] = yy - 0.45; p[i * 6 + 5] = z - w[1] * 0.03;
    }
    rain.geo.attributes.position.needsUpdate = true;
  }
  if (AC && windGain && S.sound) {
    windGain.gain.setTargetAtTime(Math.min(0.25, 0.01 + w[2] * 0.018), AC.currentTime, 0.3);
    rainGain.gain.setTargetAtTime(rain.l.visible ? 0.06 : 0, AC.currentTime, 0.5);
  }
  flash.material.opacity = Math.max(0, flash.material.opacity - dt * 14);
}

/* ---------------- HUD ---------------- */
const compass = $('compass'), cctx = compass.getContext('2d');
const DIRS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
function drawCompass(bearing) {
  const W = compass.width, H = compass.height; cctx.clearRect(0, 0, W, H);
  cctx.fillStyle = 'rgba(14,18,11,.45)'; cctx.fillRect(0, 0, W, H);
  const span = 90, pxd = W / span;
  cctx.strokeStyle = '#e6ebd6'; cctx.fillStyle = '#e6ebd6'; cctx.textAlign = 'center'; cctx.font = '600 20px sans-serif'; cctx.lineWidth = 2;
  const start = Math.floor((bearing - span / 2) / 5) * 5;
  for (let d = start; d <= bearing + span / 2; d += 5) {
    const x = W / 2 + (d - bearing) * pxd, dd = ((d % 360) + 360) % 360;
    const big = dd % 45 === 0, mid = dd % 15 === 0;
    cctx.beginPath(); cctx.moveTo(x, H); cctx.lineTo(x, H - (big ? 18 : mid ? 12 : 6)); cctx.stroke();
    if (big) { cctx.fillStyle = dd === 0 ? '#f2a93b' : '#e6ebd6'; cctx.fillText(DIRS[dd / 45], x, 24); }
    else if (mid) { cctx.fillStyle = '#a7b08f'; cctx.font = '16px sans-serif'; cctx.fillText(String(dd), x, 22); cctx.font = '600 20px sans-serif'; }
  }
  cctx.fillStyle = '#f2a93b'; cctx.beginPath(); cctx.moveTo(W / 2 - 8, H); cctx.lineTo(W / 2 + 8, H); cctx.lineTo(W / 2, H - 12); cctx.fill();
}
let wxT = 0;
function updateHUD(dt) {
  const bearing = ((-P.yaw / DEG) % 360 + 360) % 360;
  drawCompass(bearing);
  $('stamina').firstChild.style.transform = 'scaleX(' + BR.stamina.toFixed(3) + ')';
  $('stamina').firstChild.style.background = BR.gasp > 0 ? '#ff7a5c' : '#cfe3a8';
  const st = [STANCE[P.stance].name];
  if (reloadT > 0) st.push('перезарядка'); else if (cycleT > 0 && !curRifle().semi) st.push('затвор');
  if (BR.hold && BR.gasp <= 0 && AIM.mode === 'scope') st.push('дыхание задержано');
  if (BR.gasp > 0) st.push('отдышка');
  $('state').textContent = st.join(' · ');
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (LRF.t > 0) LRF.t -= dt;
  wxT -= dt;
  if (wxT <= 0) {
    wxT = 0.25;
    const w = windAt(P.z, simT);
    const from = w[3] + Math.PI;
    let clock = Math.round(((from / TAU) * 12) % 12); if (clock <= 0) clock += 12;
    const toDeg = w[3] / DEG;
    const train = S.mode === 'train';
    $('wx').innerHTML =
      '<div class="k">' + WEATHER[S.weather].name + '</div>' +
      (train
        ? '<div class="wind"><svg viewBox="0 0 20 20" style="transform:rotate(' + (toDeg - bearing).toFixed(0) + 'deg)"><path d="M10 17V3M5 8l5-5 5 5"/></svg>' + w[2].toFixed(1) + ' м/с · на ' + clock + ' ч</div>'
        : '<div class="wind">ветер — по флажкам</div>') +
      COND.t + '°C · ' + COND.p + ' мм · ' + COND.h + '%<br>ρ ' + COND.rho.toFixed(3) + ' кг/м³';
  }
}

/* ---------------- оверлей: прицел, бинокль ---------------- */
const ov = $('ov'), o = ov.getContext('2d');
let OVD = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  camB.aspect = w / h; camB.updateProjectionMatrix();
  OVD = Math.min(window.devicePixelRatio || 1, 2);
  ov.width = Math.round(w * OVD); ov.height = Math.round(h * OVD);
}
window.addEventListener('resize', resize);
function mrPx() { return (ov.height / 2) / Math.tan(camera.fov * DEG / 2) * 0.001; } // пикселей на 1 мрад
function line(cx, cy, k, x1, y1, x2, y2) { o.beginPath(); o.moveTo(cx + x1 * k, cy + y1 * k); o.lineTo(cx + x2 * k, cy + y2 * k); o.stroke(); }
function dot(cx, cy, k, x, y, r) { o.beginPath(); o.arc(cx + x * k, cy + y * k, Math.max(r * k, 1.3 * OVD), 0, TAU); o.fill(); }
function label(cx, cy, k, x, y, t, size) { o.font = (size || 10) * OVD + 'px sans-serif'; o.fillText(t, cx + x * k, cy + y * k); }

function drawReticle(type, cx, cy, k, R) {
  const lw = 1.2 * OVD;
  o.lineWidth = lw; o.strokeStyle = 'rgba(8,8,8,.95)'; o.fillStyle = 'rgba(8,8,8,.95)'; o.textAlign = 'center'; o.textBaseline = 'middle';
  const E = R / k + 5;  // до края поля зрения, мрад
  if (type === 'mildot') {
    line(cx, cy, k, -E, 0, E, 0); line(cx, cy, k, 0, -E, 0, E);
    o.lineWidth = Math.max(lw, 0.5 * k);
    line(cx, cy, k, -E, 0, -5, 0); line(cx, cy, k, 5, 0, E, 0); line(cx, cy, k, 0, 5, 0, E); line(cx, cy, k, 0, -E, 0, -5);
    for (let i = -4; i <= 4; i++) if (i) { dot(cx, cy, k, i, 0, 0.125); dot(cx, cy, k, 0, i, 0.125); }
  } else if (type === 'moa') {
    const m = UNIT.moa / 0.001;
    line(cx, cy, k, -E, 0, E, 0); line(cx, cy, k, 0, -E, 0, E);
    for (let i = -30; i <= 30; i += 2) if (i) {
      const big = i % 10 === 0, s = big ? 1.2 : 0.6;
      line(cx, cy, k, i * m, -s * m, i * m, s * m); line(cx, cy, k, -s * m, i * m, s * m, i * m);
      if (big && k * m > 1.2 * OVD) { label(cx, cy, k, i * m, -3 * m, String(Math.abs(i))); label(cx, cy, k, -3.5 * m, i * m, String(Math.abs(i))); }
    }
    o.lineWidth = Math.max(lw, 1.2 * m * k);
    line(cx, cy, k, -E, 0, -32 * m, 0); line(cx, cy, k, 32 * m, 0, E, 0); line(cx, cy, k, 0, 32 * m, 0, E); line(cx, cy, k, 0, -E, 0, -32 * m);
  } else if (type === 'tree') {
    o.lineWidth = lw * 0.9;
    line(cx, cy, k, -10, 0, -0.3, 0); line(cx, cy, k, 0.3, 0, 10, 0); line(cx, cy, k, 0, -5, 0, -0.3); line(cx, cy, k, 0, 0.3, 0, 10);
    dot(cx, cy, k, 0, 0, 0.05);
    for (let i = -50; i <= 50; i++) if (i) {
      const v = i / 5, big = i % 5 === 0;
      const s = big ? 0.25 : 0.1;
      line(cx, cy, k, v, -s, v, s);
      if (v > -5) line(cx, cy, k, -s, v, s, v);
      if (big && i % 10 === 0 && k > 6 * OVD) { label(cx, cy, k, v, -0.6, String(Math.abs(v)), 9); if (v > 0) label(cx, cy, k, -0.7, v, String(v), 9); }
    }
    for (let r = 1; r <= 10; r++) { const n = Math.min(r + 1, 7); for (let j = -n; j <= n; j++) if (j) dot(cx, cy, k, j, r, 0.06); }
    o.lineWidth = Math.max(lw * 2.5, 0.35 * k);
    line(cx, cy, k, -E, 0, -12, 0); line(cx, cy, k, 12, 0, E, 0); line(cx, cy, k, 0, 12, 0, E); line(cx, cy, k, 0, -E, 0, -7);
  } else if (type === 'pso') {
    const t = UNIT.thou / 0.001; // тысячная в мрад
    // боковая шкала поправок
    for (let i = -10; i <= 10; i++) if (i) {
      const big = i % 5 === 0;
      line(cx, cy, k, i * t, (big ? -1 : -0.5) * t, i * t, 0);
      if (i % 10 === 0) label(cx, cy, k, i * t, -1.8 * t, '10', 11);
    }
    // дальномерная шкала под цель 1,7 м (200–1000 м)
    const bx = -11 * t, by = 8 * t;
    o.lineWidth = lw; line(cx, cy, k, bx, by, bx + 8 * t, by);
    o.setLineDash([2 * OVD, 2 * OVD]); o.beginPath();
    for (let D = 200; D <= 1000; D += 25) { const x = bx + (D - 200) / 800 * 8 * t, h = 1.7 / D * 1000; const X = cx + x * k, Y = cy + (by - h) * k; if (D === 200) o.moveTo(X, Y); else o.lineTo(X, Y); }
    o.stroke(); o.setLineDash([]);
    for (let D = 200; D <= 1000; D += 200) { const x = bx + (D - 200) / 800 * 8 * t; line(cx, cy, k, x, by, x, by + 0.4 * t); label(cx, cy, k, x, by + 1.3 * t, String(D / 100), 10); }
    // главный и дополнительные угольники (подсветка)
    o.strokeStyle = 'rgba(255,70,30,.95)'; o.lineWidth = Math.max(lw * 1.6, 0.25 * k);
    const chev = (y, s) => { o.beginPath(); o.moveTo(cx - s * k, cy + (y + 1.6 * s) * k); o.lineTo(cx, cy + y * k); o.lineTo(cx + s * k, cy + (y + 1.6 * s) * k); o.stroke(); };
    chev(0, 1.05);
    o.lineWidth = lw; line(cx, cy, k, 0, 1.68, 0, 4.0);
    const rf = curRifle(), base = stdElev(rf, 1000);
    [1100, 1200, 1300].forEach((D) => { const off = (stdElev(rf, D) - base) * 1000; chev(off, 0.55); });
  }
}
function drawOverlay() {
  const W = ov.width, H = ov.height;
  o.clearRect(0, 0, W, H);
  const k = mrPx();
  if (AIM.mode === 'scope') {
    const R = Math.min(W, H) * 0.47;
    const cx = W / 2 + REC.k * 900 * OVD * 0, cy = H / 2 - REC.k * 2200 * OVD * 0.3;
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'destination-out'; o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.fill(); o.globalCompositeOperation = 'source-over';
    const vg = o.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.85)'); o.fillStyle = vg; o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.fill();
    o.save(); o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.clip();
    drawReticle(curScope().ret, W / 2, H / 2, k, R);
    o.restore();
    // подписи под окуляром
    const sc = curScope(), st = curTur();
    o.fillStyle = 'rgba(242,169,59,.95)'; o.textAlign = 'center'; o.font = '600 ' + 12 * OVD + 'px monospace'; o.shadowColor = 'rgba(0,0,0,.9)'; o.shadowBlur = 4 * OVD;
    const ev = sc.unit === 'thou' ? 'ПРИЦЕЛ ' + st.drum : '▲' + fmt(st.e * sc.click, sc.unit === 'moa' ? 2 : 1);
    const am = reloadT > 0 ? 'перезарядка' : st.ammo + '/' + curRifle().mag;
    o.fillText(am + '   ' + AIM.zoom.toFixed(1).replace('.0', '') + '×   ' + ev + '   ◀▶' + fmt(st.w * sc.click, 1) + ' ' + UNAME[sc.unit], W / 2, cy + R * 0.86); o.shadowBlur = 0;
  } else if (AIM.mode === 'bino') {
    const R = Math.min(W * 0.3, H * 0.47), dx = R * 0.62, cx = W / 2, cy = H / 2;
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'destination-out'; [-dx, dx].forEach((ox) => { o.beginPath(); o.arc(cx + ox, cy, R, 0, TAU); o.fill(); }); o.globalCompositeOperation = 'source-over';
    o.save(); o.beginPath(); o.arc(cx - dx, cy, R, 0, TAU); o.clip(); o.beginPath(); o.rect(0, 0, W, H); o.arc(cx + dx, cy, R, 0, TAU, true); o.clip(); { const vg = o.createRadialGradient(cx - dx, cy, R * 0.8, cx - dx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.8)'); o.fillStyle = vg; o.fillRect(0, 0, W, H); } o.restore();
    o.save(); o.beginPath(); o.arc(cx + dx, cy, R, 0, TAU); o.clip(); o.beginPath(); o.rect(0, 0, W, H); o.arc(cx - dx, cy, R, 0, TAU, true); o.clip(); { const vg = o.createRadialGradient(cx + dx, cy, R * 0.8, cx + dx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.8)'); o.fillStyle = vg; o.fillRect(0, 0, W, H); } o.restore();
    // угломерная сетка бинокля (мрад)
    o.strokeStyle = 'rgba(10,10,10,.85)'; o.fillStyle = 'rgba(10,10,10,.85)'; o.lineWidth = 1.1 * OVD; o.textAlign = 'center'; o.textBaseline = 'middle';
    for (let i = -40; i <= 40; i += 5) { const s = i % 10 === 0 ? 1.6 : 0.8; line(cx, cy, k, i, -s, i, s); if (i && i % 20 === 0) label(cx, cy, k, i, -3.2, String(Math.abs(i)), 10); }
    for (let i = 5; i <= 20; i += 5) line(cx, cy, k, -0.8, i, 0.8, i);
    line(cx, cy, k, 0, -2.5, 0, 20);
    o.strokeStyle = 'rgba(255,60,40,.9)'; o.lineWidth = 1.4 * OVD; o.strokeRect(cx - 7 * OVD, cy - 7 * OVD, 14 * OVD, 14 * OVD);
    // табло дальномера
    o.textAlign = 'center'; o.fillStyle = 'rgba(255,72,48,.95)'; o.font = '600 ' + 18 * OVD + 'px monospace';
    const ty = cy + R * 0.7;
    if (LRF.t > 0) {
      o.fillText(LRF.d ? Math.round(LRF.d) + ' м' : '----', cx, ty);
      o.font = 11 * OVD + 'px monospace';
      o.fillText('угол ' + (LRF.ang >= 0 ? '+' : '') + LRF.ang.toFixed(1) + '°', cx, ty + 18 * OVD);
    } else { o.font = 11 * OVD + 'px monospace'; o.fillText('ЛАЗЕР — кнопка огня / F', cx, ty); }
    o.font = 11 * OVD + 'px monospace'; o.fillStyle = 'rgba(242,169,59,.95)';
    o.fillText(AIM.binoZoom + '×', cx, cy - R * 0.82);
    // мишень под перекрестием: её пробоины
    const T = binoTarget();
    if (T) {
      const pts = T.kind === 'ring' ? T.hits.reduce((s, h) => s + h.score, 0) : T.hits.length * 5;
      const last = T.hits.length ? T.hits[T.hits.length - 1] : null;
      const txt = (T.kind === 'ring' ? 'Мишень' : 'Гонг') + (S.mode === 'train' ? ' ' + T.D + ' м' : '') + ' · пробоин ' + T.hits.length + ' · очков ' + pts + (last && T.kind === 'ring' ? ' · последняя ' + (last.score || 'щит') : '');
      o.fillStyle = 'rgba(14,18,11,.7)'; const tw = o.measureText(txt).width + 20 * OVD;
      o.fillRect(cx - tw / 2, cy + R * 0.32 - 12 * OVD, tw, 24 * OVD);
      o.fillStyle = '#ecf0dc'; o.fillText(txt, cx, cy + R * 0.32);
    }
  } else if (!BCAM.b) {
    o.fillStyle = 'rgba(255,255,255,.85)'; o.beginPath(); o.arc(W / 2, H / 2, 2 * OVD, 0, TAU); o.fill();
    o.strokeStyle = 'rgba(0,0,0,.5)'; o.lineWidth = 1 * OVD; o.stroke();
  }
}
let binoCache = { t: 0, T: null };
function binoTarget() {
  if (simT - binoCache.t < 0.15) return binoCache.T;
  binoCache.t = simT;
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  ray.set(camera.position, dir); ray.far = 4000;
  let T = null;
  const h = ray.intersectObjects(targetMeshes, false);
  if (h.length) T = h[0].object.userData.T;
  else { const a = aimedTarget(camera.position, dir); if (a) { _tmp2.subVectors(a.c, camera.position).normalize(); if (Math.acos(clamp(_tmp2.dot(dir), -1, 1)) < 0.004) T = a; } }
  binoCache.T = T;
  return T;
}

/* ---------------- таблица поправок ---------------- */
function openCard() {
  const rf = curRifle(), sc = curScope(), u = UNIT[sc.unit], un = UNAME[sc.unit];
  const mv = mvNow(rf), z0 = zeroAngle(rf);
  const base = simFlat(rf, z0, 0, COND.rho, COND.snd, mv, 1500, 50);
  const wind = simFlat(rf, z0, 1, COND.rho, COND.snd, mv, 1500, 50);
  const d = sc.unit === 'moa' ? 1 : 2;
  let html = '<thead><tr><th>Дальн., м</th><th>Верт., ' + un + '</th><th>' + (sc.unit === 'thou' ? 'Прицел' : 'Щелчков') + '</th><th>Снижение, см</th><th>Ветер 1 м/с, ' + un + '</th><th>Деривация, ' + un + '</th><th>Время, с</th><th>Скорость, м/с</th><th>Энергия, Дж</th></tr></thead><tbody>';
  base.forEach((r, i) => {
    if (r.D % 100) return;
    const elev = Math.atan(-(r.y - rf.sh) / r.D);
    const wd = wind[i] ? wind[i].z / r.D : 0;
    const sd = spinDrift(rf, r.t) / r.D;
    const clicks = sc.unit === 'thou' ? (r.D <= 1000 ? String(r.D / 100) : '10+') : String(Math.round(elev / u / sc.click));
    html += '<tr><td>' + r.D + '</td><td>' + (elev / u).toFixed(d) + '</td><td>' + clicks + '</td><td>' + ((r.y - rf.sh) * 100).toFixed(0) + '</td><td>' + (wd / u).toFixed(d) + '</td><td>' + (sd / u).toFixed(d) + '</td><td>' + r.t.toFixed(2) + '</td><td>' + Math.round(r.v) + '</td><td>' + Math.round(0.5 * rf.g / 1000 * r.v * r.v) + '</td></tr>';
  });
  $('cardTable').innerHTML = html + '</tbody>';
  $('cardTitle').textContent = 'Таблица поправок · ' + rf.name;
  $('cardSub').textContent = rf.cal + ' · пристрелка 100 м · ' + sc.name + ' · условия сейчас: ' + COND.t + '°C, ' + COND.p + ' мм рт. ст., ' + COND.h + '%, ρ=' + COND.rho.toFixed(3) + ', V0=' + Math.round(mv) + ' м/с. Ветер: боковой 1 м/с слева направо (умножайте на скорость ветра). Деривация уводит вправо.';
  $('card').hidden = false;
}

/* ---------------- меню ---------------- */
function chips(el, items, cur, onPick) {
  el.innerHTML = '';
  items.forEach(([id, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (id === cur ? ' on' : ''); b.textContent = label;
    b.addEventListener('click', () => { onPick(id); });
    el.appendChild(b);
  });
}
function renderMenu() {
  const g = $('mRifles'); g.innerHTML = '';
  RIFLES.forEach((r, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rc' + (i === S.rifle ? ' on' : '');
    b.innerHTML = '<div class="t"><span class="n">' + r.name + '</span><span class="o ' + (r.org === 'RU' ? 'ru' : 'nato') + '">' + (r.org === 'RU' ? 'РОССИЯ' : 'НАТО') + '</span></div>' +
      '<div class="c">' + r.cal + '</div>' +
      '<div class="d">V0 ' + r.mv + ' м/с · БК G7 ' + r.bc.toFixed(3) + '<br>' + (r.semi ? 'самозарядная' : 'продольно-скользящий затвор') + ' · ' + r.mag + ' патр.</div>';
    b.addEventListener('click', () => { S.rifle = i; save(); renderMenu(); });
    g.appendChild(b);
  });
  const rf = curRifle();
  chips($('mScopes'), Object.values(SCOPES).map((s) => [s.id, s.name]), scopeOf(rf).id, (id) => { S.scopes[rf.id] = id; const st = TUR[rf.id]; st.e = 0; st.w = 0; st.drum = 1; st.zoom = null; save(); renderMenu(); });
  chips($('mWeather'), Object.entries(WEATHER).map(([k, w]) => [k, w.name + ' ' + (w.t > 0 ? '+' : '') + w.t + '°']), S.weather, (id) => { S.weather = id; save(); applyConditions(); applyWeatherVisuals(); renderMenu(); });
  chips($('mWind'), Object.entries(WINDS).map(([k, w]) => [k, w.name]), S.wind, (id) => { S.wind = id; save(); newWind(); renderMenu(); });
  chips($('mMode'), [['train', 'Тренировка'], ['real', 'Реализм']], S.mode, (id) => { S.mode = id; save(); applyMode(); renderMenu(); });
  $('modeNote').textContent = S.mode === 'train'
    ? 'Показываются скорость ветра, таблички дистанций и разбор каждого выстрела с нужной поправкой.'
    : 'Ветер читайте по флажкам и траве, дистанцию — дальномером, попадания ищите в бинокль.';
  chips($('mQual'), Object.entries(QUALITY).map(([k, q]) => [k, q.name]), S.quality, (id) => { if (id === S.quality) return; S.quality = id; save(); location.reload(); });
  chips($('mOpts'), [['tracers', 'Трассеры ' + (S.tracers ? 'вкл' : 'выкл')], ['bcam', 'Камера пули ' + (S.bcam ? 'вкл' : 'выкл')], ['sound', 'Звук ' + (S.sound ? 'вкл' : 'выкл')]], null, (id) => { S[id] = !S[id]; save(); renderMenu(); });
  $('mOpts').querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', [S.tracers, S.bcam, S.sound][i]));
  $('mSens').value = S.sens; $('mSensV').textContent = (+S.sens).toFixed(2);
}
$('mSens').addEventListener('input', (e) => { S.sens = +e.target.value; $('mSensV').textContent = S.sens.toFixed(2); save(); });
function applyMode() { signs.forEach((s) => { s.visible = S.mode === 'train'; }); if (S.mode !== 'train') $('toast').classList.remove('show'); }
function openMenu() {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
  renderMenu(); $('menu').hidden = false; $('hud').classList.add('off'); $('bStart').textContent = started ? 'Продолжить' : 'В бой';
}
let started = false;
function startGame() {
  audioInit();
  $('menu').hidden = true; $('hud').classList.remove('off');
  started = true;
  showRifleModel(); updateWeaponUI(); setAim('hip'); updateStats();
  if (IS_TOUCH) {
    try { const el = document.documentElement; const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null; if (r && r.then) r.then(() => { try { const s = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (s && s.catch) s.catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {}); } catch (e) { /* ignore */ }
  }
}
$('bStart').addEventListener('click', startGame);
$('bResetT').addEventListener('click', () => { targets.forEach((T) => { T.hits = []; T.score = 0; if (T.kind === 'ring') paintRing(T); else paintSteel(T); }); STATS.shots = STATS.hits = STATS.points = 0; updateStats(); });
$('bNewWind').addEventListener('click', () => { newWind(); applyConditions(); });
$('bFull').addEventListener('click', () => { try { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* ignore */ } });
$('joy').hidden = !IS_TOUCH; $('bFireL').hidden = !IS_TOUCH;

/* ---------------- главный цикл ---------------- */
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
  const ts = BCAM.b ? 0.3 : 1, sdt = dt * ts;
  simT += sdt;
  if (started && $('menu').hidden) updatePlayer(dt);
  updateSway(dt);
  applyCamera();
  updateBullets(sdt);
  updateEffects(sdt);
  updateEnv(dt);
  if (started) updateHUD(dt);
  let cam = camera;
  if (BCAM.b) {
    const b = BCAM.b;
    const vd = b.alive ? b.v.clone().normalize() : b.aimDir;
    camB.position.copy(b.cur).addScaledVector(vd, -1.6).add(new V3(0.25, 0.25, 0));
    camB.lookAt(b.cur);
    bulletMesh.visible = b.alive; bulletMesh.position.copy(b.cur); bulletMesh.lookAt(b.cur.clone().add(vd));
    cam = camB; rifleHolder.visible = false;
    if (!b.alive) { BCAM.hold -= dt; if (BCAM.hold <= 0) { BCAM.b = null; bulletMesh.visible = false; rifleHolder.visible = AIM.mode === 'hip'; } }
  }
  renderer.render(scene, cam);
  drawOverlay();
}

/* ---------------- старт ---------------- */
applyConditions(); newWind(); applyWeatherVisuals(); applyMode();
resize();
P.yaw = 0; P.pitch = 0.004;
updateGrass(P.x, P.z);
showRifleModel(); updateWeaponUI(); updateAimUI(); updateStats();
$('hud').classList.add('off');
renderMenu();
requestAnimationFrame(loop);
window.__game = { camera, fire, setAim, setStance, P, targets, STATS, COND, WIND, laser, AIM, turretStep, startGame, openCard, LRF };
})();
