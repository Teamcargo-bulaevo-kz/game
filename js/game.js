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
let MAPM = 'range';
// лесные массивы и лесополосы карты боя (круги: x, z, r)
const FORESTS = [];
// сетка препятствий (стволы, камни): вертикальные цилиндры {x, z, r, y0, y1}
const OB = new Map(), OBC = 20, _obk = [];
function addObst(o) {
  for (let i = Math.floor((o.x - o.r) / OBC); i <= Math.floor((o.x + o.r) / OBC); i++) for (let j = Math.floor((o.z - o.r) / OBC); j <= Math.floor((o.z + o.r) / OBC); j++) { const k = i * 100003 + j; let a = OB.get(k); if (!a) OB.set(k, a = []); a.push(o); }
}
function obstHit(p0, p1) {
  if (!OB.size) return null;
  const dx = p1.x - p0.x, dz = p1.z - p0.z, A = dx * dx + dz * dz; if (A < 1e-8) return null;
  const n = Math.max(1, Math.ceil(Math.sqrt(A) / 9)); let best = null; _obk.length = 0;
  for (let i = 0; i <= n; i++) {
    const k = Math.floor((p0.x + dx * i / n) / OBC) * 100003 + Math.floor((p0.z + dz * i / n) / OBC);
    if (_obk.indexOf(k) >= 0) continue; _obk.push(k);
    const a = OB.get(k); if (!a) continue;
    for (const o of a) {
      const fx = p0.x - o.x, fz = p0.z - o.z, Bq = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - o.r * o.r, D = Bq * Bq - 4 * A * C;
      if (D < 0) continue;
      const t = (-Bq - Math.sqrt(D)) / (2 * A); if (t < 0 || t > 1) continue;
      const y = p0.y + (p1.y - p0.y) * t; if (y < o.y0 || y > o.y1) continue;
      if (best == null || t < best) best = t;
    }
  }
  return best;
}
(function () {
  [[-430, -1120, 170], [-290, -520, 105], [390, -1320, 190], [540, -470, 120], [-120, -1720, 150], [160, 380, 130], [-260, 300, 90], [640, -900, 110], [-650, -820, 120]].forEach((f) => FORESTS.push({ x: f[0], z: f[1], r: f[2] }));
  for (let x = -700; x <= 650; x += 22) if (Math.abs(x - 40) > 60) FORESTS.push({ x, z: -1540 + Math.sin(x / 90) * 6, r: 13, belt: true });   // дальняя лесополоса
  for (let x = -640; x <= -160; x += 22) FORESTS.push({ x, z: -330 + Math.sin(x / 70) * 5, r: 12, belt: true });                     // ближняя лесополоса (запад)
  for (let z = -255; z <= -35; z += 13) FORESTS.push({ x: 285 + 8 * Math.sin(z / 50), z, r: 9, belt: true, n: 10 });                 // густая посадка справа от высоты
})();
const KURGANS = [[-600, -430, 46, 5], [330, -600, 55, 6.5], [-160, -980, 40, 4.5], [520, -1150, 62, 7.5], [-600, -1450, 52, 6], [120, -1880, 46, 5], [680, -320, 40, 4], [-380, -700, 34, 3.5]];
const riverZ = (x) => -760 + 70 * Math.sin(x / 310) + 25 * Math.sin(x / 97);
const gullyX = (z) => 230 + 90 * Math.sin(z / 240);
function battleH(x, z) {
  let h = 5 + (fbm(x * 0.003 + 5, z * 0.003 - 2) - 0.5) * 10 + (fbm(x * 0.02 + 1, z * 0.02 + 9) - 0.5) * 1.4;
  // главная высота — холм с плато, траншеи на северном склоне
  const r = Math.hypot(x * 0.85, z - 40);
  h += 34 * (1 - smooth(95, 370, r)) + 4 * (1 - smooth(0, 140, r));
  // балка: от дальних холмов к восточному склону высоты
  const gm = smooth(-1900, -1700, z) * (1 - smooth(-430, -250, z));
  h -= 7 * (1 - smooth(5, 36, Math.abs(x - gullyX(z)))) * gm;
  // дальние холмы, откуда выходят роботы
  h += 26 * smooth(1500, 2300, -z) * fbm(x * 0.002, z * 0.002 + 3);
  // степь не плоская: увалы, гряды поперёк подхода (мёртвые зоны) и курганы
  const far = smooth(620, 900, r);
  h += far * ((fbm(x * 0.007 + 3, z * 0.007 - 4) - 0.5) * 7 + 3.6 * Math.pow(Math.max(0, Math.sin(z / 230 + Math.sin(x / 420) * 1.3)), 3));
  for (const k of KURGANS) { const dd = Math.hypot(x - k[0], z - k[1]); if (dd < k[2]) h += k[3] * Math.pow(1 - smooth(0, k[2], dd), 1.4); }
  // река
  const d = Math.abs(z - riverZ(x));
  h = lerp(-2.7, h, smooth(8, 42, d));
  return h;
}
function terrainH(x, z) { return MAPM === 'battle' ? battleH(x, z) : rangeH(x, z); }
function rangeH(x, z) {
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
RIFLES.forEach((r) => { r.type = 'sniper'; });
RIFLES.push(
  { id: 'ak',  name: 'АК-74М', full: 'Автомат Калашникова', org: 'RU', type: 'auto', cal: '5,45×39 · 7Н6, 3,4 г', mv: 900, bc: 0.168, g: 3.4, sh: 0.045, mag: 30, rpm: 650, recoil: 0.3, sg: 1.4, scope: 'iron_ak', disp: 0.9, look: 'ak' },
  { id: 'pkm', name: 'ПКМ', full: 'Пулемёт Калашникова', org: 'RU', type: 'auto', cal: '7,62×54R · ЛПС, 9,6 г', mv: 825, bc: 0.19, g: 9.6, sh: 0.05, mag: 100, rpm: 650, recoil: 0.5, sg: 1.5, scope: 'iron_pkm', disp: 1.0, look: 'pkm' },
  { id: 'm4',  name: 'M4A1', full: 'Карабин, США', org: 'NATO', type: 'auto', cal: '5,56×45 NATO · M855, 4 г', mv: 910, bc: 0.151, g: 4.0, sh: 0.065, mag: 30, rpm: 800, recoil: 0.28, sg: 1.3, scope: 'iron_m4', disp: 0.8, look: 'm4' },
  { id: 'rpg', name: 'РПГ-7В', full: 'Ручной гранатомёт', org: 'RU', type: 'rocket', cal: 'ПГ-7ВЛ · кумулятивная граната', mv: 117, bc: 0.1, g: 2600, sh: 0, mag: 1, recoil: 0.6, sg: 0, scope: 'pgo', disp: 1.2, look: 'rpg' },
);
RIFLES.push(
  { id: 'rr',  name: 'Р-12 «Штурм»', full: 'Винтовка боевого робота', org: 'BOT', type: 'auto', cal: '7,62 мм · 9,5 г', mv: 820, bc: 0.2, g: 9.5, sh: 0.08, mag: 40, rpm: 600, recoil: 0.22, sg: 1.5, scope: 'holo', disp: 0.7, look: 'bot_rifle' },
  { id: 'rmg', name: 'П-30 «Вал»', full: 'Пулемёт тяжёлого робота', org: 'BOT', type: 'auto', cal: '7,62 мм · 12 г', mv: 850, bc: 0.25, g: 12, sh: 0.08, mag: 150, rpm: 720, recoil: 0.3, sg: 1.5, scope: 'holo', disp: 1.0, look: 'bot_mg' },
  { id: 'rsn', name: 'Р-50 «Жало»', full: 'Снайперская винтовка робота-разведчика', org: 'BOT', type: 'sniper', semi: true, cal: '8,6 мм · 14 г', mv: 1000, bc: 0.36, g: 14, sh: 0.08, mag: 8, cycle: 0.6, recoil: 0.6, sg: 2, scope: 'holo', disp: 0.15, look: 'bot_rifle' },
  { id: 'rrk', name: 'РК-4 «Залп»', full: 'Наплечная ракетная установка', org: 'BOT', type: 'rocket', cal: 'реактивная граната · 2,6 кг', mv: 117, bc: 0.1, g: 2600, sh: 0, mag: 4, recoil: 0.35, sg: 0, scope: 'holo_rk', disp: 1.0, look: 'bot_rk' },
);
RIFLES.push(
  { id: 'vss',  name: 'ВСС «Винторез»', full: 'Бесшумная снайперская винтовка', org: 'RU', type: 'sniper', silent: true, cal: '9×39 · СП-5, 16 г', mv: 290, bc: 0.19, g: 16.2, sh: 0.06, mag: 10, cycle: 0.25, semi: true, recoil: 0.45, sg: 1.5, scope: 'pso', disp: 0.45, look: 'vss' },
  { id: 'ksvk', name: 'КСВК', full: 'Крупнокалиберная снайперская винтовка', org: 'RU', type: 'sniper', cal: '12,7×108 · 7Н34, 59 г', mv: 840, bc: 0.36, g: 59, sh: 0.075, mag: 5, cycle: 1.4, semi: false, recoil: 2.3, sg: 2.0, scope: 'posp', disp: 0.3, look: 'ksvk' },
  { id: 'rpk', name: 'РПК-16', full: 'Ручной пулемёт', org: 'RU', type: 'auto', cal: '5,45×39 · 7Н24, барабан 95', mv: 930, bc: 0.17, g: 3.6, sh: 0.05, mag: 95, rpm: 700, recoil: 0.3, sg: 1.4, scope: 'iron_ak', disp: 0.8, look: 'rpk' },
);
RIFLES.push({ id: 'rpgs', name: 'РПГ-26 «Дым»', full: 'Одноразовый гранатомёт с дымовой гранатой', org: 'RU', type: 'rocket', smoke: true, cal: 'дымовая граната · завеса 30 м', mv: 117, bc: 0.1, g: 2600, sh: 0, mag: 1, recoil: 0.5, sg: 0, scope: 'pgo', disp: 1.2, look: 'rpg' });
RIFLES.push({ id: 'm82', name: 'Миномёт 82 мм', full: 'Батальонный миномёт', org: 'RU', type: 'mortar', mounted: true, cal: 'осколочная мина 3,1 кг', mv: 211, bc: 1, g: 3100, sh: 0, mag: 1, cycle: 3, recoil: 0, sg: 0, scope: 'iron_ak', disp: 0, look: 'm82' });
RIFLES.push({ id: 'kord', name: '«Корд» 12,7', full: 'Станковый крупнокалиберный пулемёт', org: 'RU', type: 'auto', mounted: true, cal: '12,7×108 · Б-32, 48 г', mv: 820, bc: 0.33, g: 48, sh: 0.1, mag: 150, rpm: 650, recoil: 0.18, sg: 1.8, scope: 'iron_kord', disp: 0.55, look: 'kord' });
Object.assign(SCOPES, {
  reddot: { id: 'reddot', name: 'Коллиматор', iron: true, dot: true, min: 1, max: 1, unit: 'thou', click: 0.5, maxW: 0, drumMax: 10, fov: 50 },
  holosight: { id: 'holosight', name: 'Голографический', iron: true, dot: true, holo: true, min: 1, max: 1, unit: 'thou', click: 0.5, maxW: 0, drumMax: 10, fov: 44 },
  acog: { id: 'acog', name: 'ACOG 4×', min: 4, max: 4, unit: 'thou', click: 0.5, maxW: 0, drumMax: 8, ret: 'acog' },
  lpvo: { id: 'lpvo', name: 'Оптика 2–6×', min: 2, max: 6, unit: 'thou', click: 0.5, maxW: 0, drumMax: 10, ret: 'lpvo' },
  posp:   { id: 'posp',   name: 'ПОСП 8×42', min: 8, max: 8, unit: 'thou', click: 0.5, maxW: 10, ret: 'pso' },
  thermo: { id: 'thermo', name: 'Тепловизор 3–12×', min: 3, max: 12, unit: 'mrad', click: 0.1, maxE: 25, maxW: 10, ret: 'mildot', thermal: true },
  iron_kord: { id: 'iron_kord', name: 'Прицел «Корда» 1–20', iron: true, min: 1, max: 1, unit: 'thou', click: 0.5, maxW: 0, drumMax: 20, fov: 26 },
  holo:    { id: 'holo',    name: 'Цифровой прицел 2–6×', min: 2, max: 6, unit: 'mrad', click: 0.1, maxE: 20, maxW: 5, ret: 'holo' },
  holo_rk: { id: 'holo_rk', name: 'Цифровой прицел 2–6×', min: 2, max: 6, unit: 'mrad', click: 0.1, maxE: 0, maxW: 0, ret: 'holo', rocket: true },
  iron_ak:  { id: 'iron_ak',  name: 'Открытый прицел 1–10',  iron: true, min: 1, max: 1, unit: 'thou', click: 0.5, maxW: 0, drumMax: 10, fov: 28 },
  iron_pkm: { id: 'iron_pkm', name: 'Открытый прицел 1–15',  iron: true, min: 1, max: 1, unit: 'thou', click: 0.5, maxW: 0, drumMax: 15, fov: 27 },
  iron_m4:  { id: 'iron_m4',  name: 'Диоптр 1–6',            iron: true, min: 1, max: 1, unit: 'thou', click: 0.5, maxW: 0, drumMax: 6,  fov: 29 },
  pgo:      { id: 'pgo',      name: 'ПГО-7 2,7×', rocket: true, min: 2.7, max: 2.7, unit: 'thou', click: 0.5, maxW: 0, ret: 'pgo' },
});
const WEATHER = {
  clear:  { name: 'Ясно',     t: 22,  p: 745, h: 40, fog: 0.00020, top: 0x4f86c6, hor: 0xc8d5dd, sun: 1.05, hemi: 0.75, clouds: 0.35, rain: 0 },
  cloudy: { name: 'Облачно',  t: 13,  p: 738, h: 68, fog: 0.00036, top: 0x8693a1, hor: 0xbcc2c7, sun: 0.45, hemi: 0.9,  clouds: 1,    rain: 0 },
  fog:    { name: 'Туман',    t: 6,   p: 742, h: 97, fog: 0.0016,  top: 0xb5bbbd, hor: 0xc3c7c6, sun: 0.3,  hemi: 0.95, clouds: 0,    rain: 0 },
  rain:   { name: 'Дождь',    t: 10,  p: 731, h: 92, fog: 0.0008,  top: 0x5d666f, hor: 0x8f979c, sun: 0.25, hemi: 0.75, clouds: 1,    rain: 1 },
  heat:   { name: 'Жара',     t: 36,  p: 741, h: 18, fog: 0.00028, top: 0x5d8fc9, hor: 0xdcd9c6, sun: 1.2,  hemi: 0.72, clouds: 0.15, rain: 0 },
  cold:   { name: 'Мороз',    t: -14, p: 768, h: 75, fog: 0.00025, top: 0x6d95c4, hor: 0xd3dde5, sun: 0.85, hemi: 0.8,  clouds: 0.4,  rain: 0 },
  night:  { name: 'Ночь',     t: 7,   p: 746, h: 70, fog: 0.0011,  top: 0x02050c, hor: 0x111a26, sun: 0.16, hemi: 0.16, clouds: 0.25, rain: 0, sd: [0.35, 0.55, -0.5], sc: 0x9fb4d8, cc: 0x2a3340, night: 1 },
  dark:   { name: 'Кромешная ночь', t: 4, p: 748, h: 85, fog: 0.0019, top: 0x000000, hor: 0x020304, sun: 0.025, hemi: 0.04, clouds: 0.7, rain: 0, sd: [0.3, 0.45, -0.5], sc: 0x5a6a90, cc: 0x07080a, night: 1, dark: 1 },
  dusk:   { name: 'Закат',    t: 15,  p: 744, h: 55, fog: 0.00034, top: 0x34507e, hor: 0xe9a674, sun: 1.0,  hemi: 0.5,  clouds: 0.55, rain: 0, sd: [-0.8, 0.13, -0.3], sc: 0xffa462, cc: 0xffc29a },
};
const WINDS = {
  calm: { name: 'Штиль', base: [0, 1] }, light: { name: 'Слабый', base: [1.5, 3.5] },
  moderate: { name: 'Умеренный', base: [3.5, 6.5] }, strong: { name: 'Сильный', base: [7, 11] }, random: { name: 'Случайный', base: [0, 11] },
};
const QUALITY = {
  low:  { name: 'Низкая',  pr: 0.75, aa: false, grass: 3000,  terr: 150, bushes: 350, sh: 0 },
  mid:  { name: 'Средняя', pr: 1.15, aa: false, grass: 6000,  terr: 200, bushes: 550, sh: 1024 },
  high: { name: 'Высокая', pr: 1.6,  aa: true,  grass: 14000, terr: 256, bushes: 800, sh: 2048 },
};

/* ---------------- настройки ---------------- */
const DEF = { gmode: 'range', teamN: 6, nH: 18, nR: 6, scen: 'def', role: 'rifle', dynres: true, side: 'h', vibro: true, assist: true, rifle: 0, weather: 'clear', wind: 'moderate', mode: 'train', tracers: true, bcam: false, sound: true, mortars: true, foe: 'bot', dmgE: 5, dmgF: 5, sens: 1, sensS: 1, gyro: 'off', gyroS: 1, gyroInv: false, vol: 0.85, fov: 65, labels: true, shake: true, fps: false, cap30: false, quality: IS_TOUCH ? 'mid' : 'high', scopes: {} };
let S = Object.assign({}, DEF);
try { const raw = localStorage.getItem('stepSniper'); if (raw) S = Object.assign({}, DEF, JSON.parse(raw)); } catch (e) { /* нет хранилища */ }
if (!(S.rifle >= 0 && S.rifle < RIFLES.length)) S.rifle = 0;
const HOOK = {};
const SHAKE = { a: 0 };
const HM = { t: 0, kind: '' };
let fireHeld = false;
// подавление: когда пули свистят рядом — звук глохнет, руки дрожат, края темнеют, стучит сердце
const SUP = { v: 0, hb: 0 };
function suppress(a) { SUP.v = Math.min(1.6, SUP.v + a); SHAKE.a += a * 0.012; }
function updateSuppression(dt) {
  SUP.v = Math.max(0, SUP.v - dt * 0.22);
  if (MUFF && AC) MUFF.frequency.setTargetAtTime(20000 - Math.min(1, SUP.v) * 17800, AC.currentTime, 0.12);
  if (AC && S.sound && SUP.v > 0.55) { SUP.hb -= dt; if (SUP.hb <= 0) { SUP.hb = 0.95 - Math.min(0.35, SUP.v * 0.25); const t = AC.currentTime; tone(t, 52, 0.12, 0.35 * Math.min(1, SUP.v), 'sine', 38); tone(t + 0.16, 48, 0.1, 0.22 * Math.min(1, SUP.v), 'sine', 36); } }
}
// гильзы: латунь вылетает вправо, падает и звякает
const CAS = { list: [], pool: [] };
function ejectCasing() {
  if (!flash || AIM.mode === 'bino' || (AIM.mode === 'scope' && !curScope().iron)) return;
  let c = CAS.pool.pop();
  if (!c) { if (CAS.list.length > 40) c = CAS.list.shift(); else { const g = new THREE.CylinderGeometry(0.005, 0.005, 0.028, 6); g.rotateZ(Math.PI / 2); c = { m: new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xc9a33a, emissive: 0x2a1e06 })) }; scene.add(c.m); } }
  rifleHolder.updateMatrixWorld(true); flash.getWorldPosition(c.m.position);
  const q = camera.quaternion, right = new V3(1, 0, 0).applyQuaternion(q), up = new V3(0, 1, 0).applyQuaternion(q), fw = new V3(0, 0, -1).applyQuaternion(q);
  c.m.position.addScaledVector(fw, -0.45).addScaledVector(right, 0.04).addScaledVector(up, 0.02);
  c.v = right.multiplyScalar(1.8 + Math.random() * 1.2).addScaledVector(up, 1.4 + Math.random()).addScaledVector(fw, -0.3);
  c.s = new V3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30); c.t = 0; c.b = 0; c.m.visible = true; CAS.list.push(c);
}
function updateCasings(dt) {
  for (let i = CAS.list.length - 1; i >= 0; i--) {
    const c = CAS.list[i]; c.t += dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.s.x * dt; c.m.rotation.y += c.s.y * dt; c.m.rotation.z += c.s.z * dt;
    const gy = terrainH(c.m.position.x, c.m.position.z) + 0.01;
    if (c.m.position.y < gy) { c.m.position.y = gy; if (c.b < 2 && c.v.y < -1) { c.v.y = -c.v.y * 0.3; c.v.x *= 0.4; c.v.z *= 0.4; c.s.multiplyScalar(0.5); c.b++; } else { c.v.set(0, 0, 0); c.s.set(0, 0, 0); } }
    if (c.t > 4) { c.m.visible = false; CAS.list.splice(i, 1); CAS.pool.push(c); }
  }
}
// дым из ствола после длинной очереди
const BRL = { n: 0, last: -9, acc: 0 };
function updateBarrelSmoke(dt) {
  if (simT - BRL.last > 0.5 && BRL.n < 6) BRL.n = 0;
  if (BRL.n >= 6 && simT - BRL.last < 1.8 && simT - BRL.last > 0.15 && (BRL.acc += dt) > 0.11) {
    BRL.acc = 0; rifleHolder.updateMatrixWorld(true); const p = new V3(); flash.getWorldPosition(p);
    fxPuff(p, 0xd8d4cc, 0.05, 0.4, 1.1, new V3((Math.random() - 0.5) * 0.15, 0.45, (Math.random() - 0.5) * 0.15), 0.3 * (1 - (simT - BRL.last) / 1.8));
  } else if (simT - BRL.last > 1.8) BRL.n = 0;
}
let PUNCH = 0;
const LASER = { on: false, line: null, dot: null, d: 60, f: 0 };
function save() { try { localStorage.setItem('stepSniper', JSON.stringify(S)); } catch (e) { /* ignore */ } }
const Q = QUALITY[S.quality] || QUALITY.mid;
MAPM = S.gmode === 'battle' ? 'battle' : 'range';

const TUR = {};   // состояние барабанов на каждую винтовку
RIFLES.forEach((r) => { TUR[r.id] = { e: 0, w: 0, drum: 1, zoom: null, ammo: r.mag, reserve: null, mags: null }; });
const curRifle = () => RIFLES[S.rifle];
const AUTO_SC = ['reddot', 'holosight', 'acog', 'lpvo', 'pso'];
const scopeOf = (rf) => (rf.type === 'sniper' ? SCOPES[S.scopes[rf.id] || rf.scope] : rf.type === 'auto' && !rf.mounted && rf.org !== 'BOT' && AUTO_SC.indexOf(S.scopes[rf.id]) >= 0 ? SCOPES[S.scopes[rf.id]] : SCOPES[rf.scope]) || SCOPES[rf.scope];
const curScope = () => scopeOf(curRifle());
const curTur = () => TUR[curRifle().id];
function elevRad() { const sc = curScope(), st = curTur(); if (sc.rocket) return 0; return sc.unit === 'thou' ? stdElev(curRifle(), st.drum * 100) : st.e * sc.click * UNIT[sc.unit]; }
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
if (Q.sh) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = Q.sh > 1024 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false; }
const DR = { base: Math.min(window.devicePixelRatio || 1, Q.pr), pr: Math.min(window.devicePixelRatio || 1, Q.pr), acc: 0, n: 0, t: 0, frame: 0 };
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 20000);
camera.rotation.order = 'YXZ';
scene.add(camera);
const camB = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.02, 20000);
scene.fog = new THREE.FogExp2(0xc8d5dd, 0.0002);

const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x4d5c2c, 0.75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.0); sun.position.set(-0.45, 0.75, 0.55); scene.add(sun); scene.add(sun.target);
const SUN_DIR = new V3(-0.45, 0.5, 0.55).normalize();
if (Q.sh) {
  sun.castShadow = true; sun.shadow.mapSize.set(Q.sh, Q.sh);
  const sc = sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 10; sc.far = 500;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
}

// небо
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: SUN_DIR }, sunI: { value: 1 }, night: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
  fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform float sunI; uniform float night; varying vec3 vD;' +
    'float hs(vec3 p){ p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }' +
    'void main(){ float h = max(vD.y, 0.0); vec3 c = mix(hor, top, pow(h, 0.5)); if (vD.y < 0.0) c = hor * 0.92;' +
    ' float s = max(dot(normalize(vD), sunDir), 0.0);' +
    ' if (night > 0.5) { c += vec3(0.9,0.93,1.0) * (pow(s, 2000.0) * 2.5 + pow(s, 60.0) * 0.08); vec3 q = floor(normalize(vD) * 420.0); float st = step(0.996, hs(q)) * smoothstep(0.02, 0.25, vD.y); c += vec3(st * 0.8); }' +
    ' else c += vec3(1.0,0.95,0.85) * (pow(s, 900.0) * 3.0 + pow(s, 10.0) * 0.22) * sunI;' +
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
const BRG = { x0: -760, x1: 760, z0: -2350, z1: 600 };   // область детальной сетки карты боя
function colorAt(x, z, h, out) {
  const lush = fbm(x * 0.002 + 3, z * 0.002), dry = smooth(0.55, 0.8, fbm(x * 0.012 + 40, z * 0.012));
  let r = lerp(0.27, 0.42, lush), g = lerp(0.43, 0.56, lush), b = lerp(0.15, 0.2, lush);
  r = lerp(r, 0.62, dry * 0.55); g = lerp(g, 0.6, dry * 0.55); b = lerp(b, 0.33, dry * 0.55);
  if (MAPM === 'battle') {
    const d = Math.abs(z - riverZ(x)); const mud = 1 - smooth(10, 30, d);
    r = lerp(r, 0.36, mud); g = lerp(g, 0.33, mud); b = lerp(b, 0.24, mud);
    for (const f of FORESTS) { const k = 1 - smooth(f.r * 0.6, f.r * 1.05, Math.hypot(x - f.x, z - f.z)); if (k > 0) { r = lerp(r, 0.2, k * 0.6); g = lerp(g, 0.3, k * 0.6); b = lerp(b, 0.12, k * 0.6); } }
    const top = smooth(25, 36, h); r = lerp(r, 0.5, top * 0.35); g = lerp(g, 0.52, top * 0.35); b = lerp(b, 0.28, top * 0.35);
  } else {
    const ridge = smooth(10, 60, h - clamp(-z, 0, 1800) * 0.006);
    r = lerp(r, 0.42, ridge * 0.4); g = lerp(g, 0.48, ridge * 0.4); b = lerp(b, 0.3, ridge * 0.4);
  }
  out[0] = r; out[1] = g; out[2] = b;
}
function gridMesh(xs, zs, skip) {
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), c3 = [0, 0, 0];
  let k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i], z = zs[j], h = terrainH(x, z);
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = x / 5; uv[k * 2 + 1] = z / 5;
    colorAt(x, z, h, c3); col[k * 3] = c3[0]; col[k * 3 + 1] = c3[1]; col[k * 3 + 2] = c3[2]; k++;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (skip && skip((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)) continue;
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }));
  m.receiveShadow = !!Q.sh; scene.add(m);
  return m;
}
if (MAPM === 'battle') {
  const step = Q.terr >= 256 ? 7 : Q.terr >= 200 ? 9 : 12;
  const xs = [], zs = [];
  for (let x = BRG.x0; x <= BRG.x1 + 0.1; x += step) xs.push(x);
  for (let z = BRG.z0; z <= BRG.z1 + 0.1; z += step) zs.push(z);
  const CX = 6, CZ = 12;
  for (let a = 0; a < CX; a++) for (let c = 0; c < CZ; c++) {
    const i0 = Math.floor(a * (xs.length - 1) / CX), i1 = Math.floor((a + 1) * (xs.length - 1) / CX), j0 = Math.floor(c * (zs.length - 1) / CZ), j1 = Math.floor((c + 1) * (zs.length - 1) / CZ);
    const m = gridMesh(xs.slice(i0, i1 + 1), zs.slice(j0, j1 + 1), null); m.geometry.computeBoundingSphere();
  }
  const N = 120, wx = [], wz = [];
  for (let i = 0; i <= N; i++) { const u = i / N * 2 - 1; wx.push(Math.sign(u) * Math.pow(Math.abs(u), 1.7) * 6000); wz.push(Math.sign(u) * Math.pow(Math.abs(u), 1.7) * 6000 - 800); }
  gridMesh(wx, wz, (x, z) => x > BRG.x0 + 40 && x < BRG.x1 - 40 && z > BRG.z0 + 40 && z < BRG.z1 - 40);
  // река
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3200, 420), new THREE.MeshLambertMaterial({ color: 0x3e5d6a, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -1.25, -760); scene.add(water);
}
if (MAPM === 'range') (function buildTerrain() {
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
  m.name = 'terrain'; m.receiveShadow = !!Q.sh;
  scene.add(m);
})();

/* ---------------- трава вокруг игрока ---------------- */
const GRASS_PATCH = 70;
const grassU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uNear: { value: 2.6 }, uMow: { value: MAPM === 'range' ? 1 : 0 } };
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
    sh.uniforms.uTime = grassU.uTime; sh.uniforms.uWind = grassU.uWind; sh.uniforms.uNear = grassU.uNear; sh.uniforms.uMow = grassU.uMow;
    sh.vertexShader = 'uniform float uTime;\nuniform vec2 uWind;\nuniform float uNear;\nuniform float uMow;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      'vec3 transformed = vec3(position);\n' +
      '#ifdef USE_INSTANCING\n vec3 wp = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;\n#else\n vec3 wp = vec3(0.0);\n#endif\n' +
      'float bend = position.y * position.y;\n' +
      'float gst = 0.55 + 0.45 * sin(uTime * 1.9 + wp.x * 0.17 + wp.z * 0.13) * sin(uTime * 0.7 + wp.z * 0.05);\n' +
      'transformed.xz += uWind * bend * gst + vec2(sin(uTime*3.1+wp.x), cos(uTime*2.7+wp.z)) * 0.03 * bend;\n' +
      'float dc = length(wp.xz - cameraPosition.xz);\n' +
      'transformed.y *= smoothstep(0.6, uNear, dc);\n' +
      'float mwx = 1.0 - smoothstep(13.0, 18.0, abs(wp.x));\n' +
      'float mwz = smoothstep(-36.0, -26.0, wp.z) * (1.0 - smoothstep(9.0, 13.0, wp.z));\n' +
      'transformed.y *= 1.0 - 0.75 * mwx * mwz * uMow;\n');
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
    const gy = terrainH(x, z);
    const sc = gy < -1.1 ? 0 : s;
    _m4.makeScale(sc, sc, sc); _m4.setPosition(x, gy - 0.02, z);
    grass.mesh.setMatrixAt(i, _m4);
  }
  grass.mesh.instanceMatrix.needsUpdate = true;
}

/* ---------------- кусты и деревья ---------------- */
if (MAPM === 'battle') (function buildForests() {
  const trunkG = new THREE.CylinderGeometry(0.16, 0.28, 1, 6); trunkG.translate(0, 0.5, 0);
  const pineG = new THREE.ConeGeometry(1, 1, 7); pineG.translate(0, 0.5, 0);
  const leafG = new THREE.IcosahedronGeometry(1, 0);
  const cnt = FORESTS.reduce((s, f) => s + (f.n || Math.min(140, Math.round(f.r * f.r / 160) + (f.belt ? 3 : 0))), 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x4a3a28 }), cnt);
  const pines = new THREE.InstancedMesh(pineG, new THREE.MeshPhongMaterial({ color: 0x2f4a22, flatShading: true, shininess: 0 }), cnt);
  const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshPhongMaterial({ color: 0x3d5a26, flatShading: true, shininess: 0 }), cnt);
  const col = new THREE.Color(); let nt = 0, np = 0, nl = 0;
  for (const f of FORESTS) {
    const n = f.n || Math.min(140, Math.round(f.r * f.r / 160) + (f.belt ? 3 : 0));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * f.r;
      const x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr, gy = terrainH(x, z);
      if (gy < -0.8) continue;
      const h = 7 + Math.random() * 9, pine = Math.random() < 0.45;
      _m4.makeScale(1, h * (pine ? 0.45 : 0.6), 1); _m4.setPosition(x, gy - 0.2, z); trunks.setMatrixAt(nt++, _m4);
      addObst({ x, z, r: 0.24, y0: gy - 0.5, y1: gy - 0.2 + h * (pine ? 0.45 : 0.6) });
      col.setRGB(0.75 + Math.random() * 0.35, 0.8 + Math.random() * 0.35, 0.75 + Math.random() * 0.3);
      if (pine) { const w = 2 + Math.random() * 1.6; _m4.makeScale(w, h * 0.8, w); _m4.setPosition(x, gy + h * 0.25, z); pines.setMatrixAt(np, _m4); pines.setColorAt(np++, col); }
      else { const w = 2.6 + Math.random() * 2.2; _m4.makeScale(w, w * 0.85, w); _m4.setPosition(x, gy + h * 0.62, z); leaves.setMatrixAt(nl, _m4); leaves.setColorAt(nl++, col); }
    }
  }
  trunks.count = nt; pines.count = np; leaves.count = nl;
  [trunks, pines, leaves].forEach((m) => { m.castShadow = !!Q.sh; scene.add(m); });
})();
(function buildVegetation() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshPhongMaterial({ color: 0x3b5422, flatShading: true, shininess: 0 }), Q.bushes);
  const col = new THREE.Color();
  let n = 0, guard = 0;
  while (n < Q.bushes && guard++ < 20000) {
    const x = (Math.random() * 2 - 1) * 1600, z = -2600 + Math.random() * 3300;
    if (MAPM === 'range' && Math.abs(x) < 50 && z < 40 && z > -1750) continue;
    if (MAPM === 'range' && Math.hypot(x, z) < 35) continue;
    if (MAPM === 'battle' && (Math.hypot(x * 0.85, z - 40) < 260 || terrainH(x, z) < -0.5)) continue;
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
  for (let i = 0; i < (MAPM === 'range' ? 16 : 0); i++) {
    const side = i % 2 ? 1 : -1, x = side * (90 + Math.random() * 600), z = 80 - Math.random() * 2200;
    const g = new THREE.Group(), h = 5 + Math.random() * 6;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 6), trunkM); tr.position.y = h / 2; g.add(tr);
    for (let c = 0; c < 3; c++) { const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 + Math.random() * 1.6, 0), crownM); cr.position.set(gauss() * 0.9, h + gauss() * 0.8, gauss() * 0.9); g.add(cr); }
    g.position.set(x, terrainH(x, z) - 0.2, z);
    g.traverse((c) => { c.castShadow = !!Q.sh; });
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
if (MAPM === 'range') (function buildFiringLine() {
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
  skyU.top.value.setHex(w.top); skyU.hor.value.setHex(w.hor); skyU.sunI.value = w.sun; skyU.night.value = w.dark ? 0.3 : w.night ? 1 : 0;
  const sd = w.sd || [-0.45, 0.5, 0.55]; SUN_DIR.set(sd[0], sd[1], sd[2]).normalize(); sun.color.setHex(w.sc || 0xfff1d6);
  hemi.color.setHex(w.sd ? 0xc9b8d0 : 0xd6e6ff);
  scene.fog.color.setHex(w.hor); scene.fog.density = w.fog;
  sun.intensity = w.sun; hemi.intensity = w.hemi;
  clouds.forEach((c, i) => { c.visible = i / clouds.length < w.clouds + 0.05; c.material.color.setHex(w.cc || (w.rain ? 0x8a9097 : w.clouds > 0.9 ? 0xc5c9cc : 0xffffff)); c.material.opacity = w.clouds > 0.9 ? 0.95 : 0.8; });
  rain.l.visible = !!w.rain;
  renderer.setClearColor(w.hor);
  if (typeof VIS !== 'undefined') setVision(VIS.mode);
}

/* ---------------- приборы ночного видения ---------------- */
const VIS = { mode: 'off' };
function setVision(m) {
  VIS.mode = m; HOOK.vision = m;
  const w = WEATHER[S.weather] || {};
  const f = m === 'nvg' ? (w.dark ? 'brightness(6) contrast(1.2) grayscale(1) sepia(1) hue-rotate(58deg) saturate(3.2)' : 'brightness(3.4) contrast(1.15) grayscale(1) sepia(1) hue-rotate(58deg) saturate(3.2)') : m === 'thermal' ? 'grayscale(1) brightness(1.5) contrast(1.9)' : w.night ? '' : 'contrast(1.07) saturate(1.15)';
  $('gl').style.filter = f;
  const b = $('bVision'); if (b) { b.classList.toggle('on', m !== 'off'); b.querySelector('span').textContent = m === 'nvg' ? 'ПНВ' : m === 'thermal' ? 'ТЕПЛО' : 'ОПТИКА'; }
  if (HOOK.onVision) HOOK.onVision(m);
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
    vss:   { stock: 0x2a2a28, body: 0x1e1f1e, hand: 0x3a2a20, len: 0.5, scopeX: -0.035, mag: 0x1e1f20 },
    ksvk:  { stock: 0x3a3e32, body: 0x2a2d28, hand: 0x3a3e32, len: 1.1, scopeX: 0, mag: 0x222, bip: 1, brake: 2 },
  }[look];
  const big = look === 'm107' || look === 'ksvk' ? 1.35 : 1;
  if (look === 'vss') cyl(0.028, 0.028, 0.5, 0x161616, 0, -0.03, -0.55);
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
function buildIron(look) {
  const g = new THREE.Group();
  const mats = {};
  const M = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); g.add(m); return m; };
  const cyl = (r1, r2, l, c, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, 12), M(c)); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; };
  const BLK = 0x1a1b1b, DARK = 0x262422;
  if (look === 'ak' || look === 'pkm' || look === 'rpk') {
    const pk = look === 'pkm', L = pk ? 1.0 : look === 'rpk' ? 0.95 : 0.85;
    if (look === 'rpk') { const dr = cyl(0.07, 0.07, 0.07, 0x1d1d1b, 0, -0.17, -0.3); dr.rotation.set(0, 0, Math.PI / 2); }
    box(0.05, 0.065, 0.36, BLK, 0, -0.075, -0.3);                        // ствольная коробка
    box(0.046, 0.012, 0.34, 0x222322, 0, -0.04, -0.3);                   // крышка
    box(0.056, 0.055, 0.2, pk ? BLK : 0x3a2a22, 0, -0.06, -0.55);        // цевьё
    box(0.03, 0.024, 0.22, BLK, 0, -0.024, -0.56);                       // газовая трубка
    cyl(0.009, 0.009, L - 0.42, BLK, 0, -0.045, -0.42 - (L - 0.42) / 2);  // ствол
    box(0.034, 0.12, 0.05, DARK, 0, -0.14, -0.14).rotation.x = 0.25;     // рукоять
    box(0.03, 0.032, 0.05, DARK, 0, -0.038, -0.64);                       // газовый блок
    cyl(0.0125, 0.0125, 0.045, BLK, 0, -0.045, -L + 0.01);               // дульный тормоз
    box(0.006, 0.006, 0.36, 0x8c8a82, 0, -0.082, -0.58);                  // шомпол
    box(0.012, 0.022, 0.04, 0x2a2a28, 0.034, -0.062, -0.28);              // затворная рукоять
    box(0.052, 0.004, 0.3, 0x2b2b29, 0, -0.1, -0.30);                     // нижняя кромка коробки
    for (let i = 0; i < 4; i++) box(0.058, 0.006, 0.02, 0x2a1e18, 0, -0.045, -0.5 - i * 0.04); // вентиляционные прорези цевья
    box(0.05, 0.095, 0.012, 0x1c1c1b, 0, -0.1, 0.115);                    // затылок приклада
    box(0.03, 0.014, 0.034, BLK, 0, -0.0065, -0.285);                     // подушка целика
    box(0.05, 0.09, 0.22, pk ? 0x2a2a28 : 0x3a2a22, 0, -0.1, 0.0);       // приклад
    // целик: планка с прорезью
    box(0.026, 0.014, 0.03, BLK, 0, -0.016, -0.24);
    box(0.0075, 0.009, 0.006, BLK, -0.0052, -0.0045, -0.24); box(0.0075, 0.009, 0.006, BLK, 0.0052, -0.0045, -0.24);
    box(0.008, 0.012, 0.016, BLK, -0.014, -0.012, -0.245); box(0.008, 0.012, 0.016, BLK, 0.014, -0.012, -0.245); // плечи целика
    box(0.02, 0.004, 0.06, 0x2b2b2a, 0, -0.019, -0.265).rotation.x = -0.05;   // планка целика
    // мушка с намушником
    const fz = -L + 0.03;
    box(0.026, 0.03, 0.03, BLK, 0, -0.03, fz);
    box(0.0028, 0.018, 0.003, 0x111111, 0, -0.009, fz);
    box(0.004, 0.026, 0.008, BLK, -0.011, -0.012, fz); box(0.004, 0.026, 0.008, BLK, 0.011, -0.012, fz);
    if (pk) { box(0.09, 0.11, 0.12, 0x3d4a2c, 0.02, -0.14, -0.26); [-1, 1].forEach((sd) => { const l = box(0.01, 0.2, 0.01, BLK, sd * 0.02, -0.07, -0.78); l.rotation.x = -1.3; }); }
    else { const mg = box(0.034, 0.17, 0.07, 0x5a3424, 0, -0.15, -0.3); mg.rotation.x = 0.35; }
    g.userData.muzzle = new V3(0, -0.045, -L - 0.02);
  } else if (look === 'm4') {
    box(0.05, 0.07, 0.34, 0x2b2c2a, 0, -0.085, -0.28);
    box(0.03, 0.012, 0.36, BLK, 0, -0.044, -0.34);                       // планка
    box(0.06, 0.06, 0.26, 0x2b2c2a, 0, -0.055, -0.52);
    cyl(0.009, 0.009, 0.25, BLK, 0, -0.06, -0.78);
    box(0.034, 0.11, 0.045, BLK, 0, -0.12, -0.1).rotation.x = 0.3;
    box(0.045, 0.08, 0.2, 0x2b2c2a, 0, -0.11, 0.0);
    box(0.03, 0.16, 0.06, 0x3a3a36, 0, -0.15, -0.28).rotation.x = 0.1;
    for (let i = 0; i < 6; i++) box(0.03, 0.004, 0.008, 0x1a1a1a, 0, -0.0415, -0.2 - i * 0.05);  // пазы планки
    box(0.012, 0.03, 0.03, 0x2b2c2a, 0.034, -0.06, -0.3);                 // толкатель затвора
    box(0.062, 0.058, 0.01, 0x222322, 0, -0.055, -0.4); box(0.062, 0.058, 0.01, 0x222322, 0, -0.055, -0.62);  // тепловые накладки
    cyl(0.013, 0.013, 0.07, BLK, 0, -0.06, -0.92);                        // пламегаситель
    box(0.05, 0.016, 0.07, 0x33342f, 0, -0.04, -0.2);                     // ручка-переноска (основание)
    // диоптр
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0045, 0.0018, 6, 18), M(BLK)); ring.position.set(0, 0, -0.2); g.add(ring);
    box(0.016, 0.03, 0.01, BLK, 0, -0.021, -0.2);
    // треугольная мушка
    box(0.003, 0.03, 0.004, 0x111111, 0, -0.015, -0.62);
    box(0.004, 0.03, 0.01, BLK, -0.012, -0.016, -0.62); box(0.004, 0.03, 0.01, BLK, 0.012, -0.016, -0.62);
    box(0.028, 0.012, 0.012, BLK, 0, -0.034, -0.62);
    g.userData.muzzle = new V3(0, -0.06, -0.92);
  } else if (look === 'bot_rifle' || look === 'bot_mg' || look === 'bot_rk') {
    const AR = 0x5f656c, DK = 0x2c3036, JT = 0x1b1e22, mg = look === 'bot_mg', rk = look === 'bot_rk';
    box(0.13, 0.13, 0.42, AR, 0.05, -0.12, 0.08);                         // предплечье
    box(0.1, 0.06, 0.3, 0x8a9096, 0.05, -0.04, 0.05);
    box(0.12, 0.12, 0.12, JT, 0.05, -0.12, -0.16);                        // кисть
    if (rk) {
      box(0.2, 0.18, 0.6, DK, 0.02, -0.06, -0.35);
      for (let i = 0; i < 4; i++) cyl(0.035, 0.035, 0.05, 0x111, -0.03 + (i % 2) * 0.09, -0.02 - Math.floor(i / 2) * 0.08, -0.66);
      g.userData.muzzle = new V3(0.02, -0.06, -0.7);
    } else {
      box(mg ? 0.13 : 0.1, mg ? 0.17 : 0.13, mg ? 0.75 : 0.62, DK, 0.03, -0.08, -0.38);
      box(0.05, 0.05, 0.16, JT, 0.03, 0.0, -0.3);
      cyl(mg ? 0.035 : 0.022, mg ? 0.035 : 0.022, 0.4, JT, 0.03, -0.06, -0.85);
      box(0.06, 0.06, 0.07, JT, 0.03, -0.06, -1.06);
      if (mg) box(0.16, 0.2, 0.2, AR, 0.1, -0.2, -0.32); else box(0.05, 0.18, 0.09, AR, 0.03, -0.2, -0.3);
      g.userData.muzzle = new V3(0.03, -0.06, -1.1);
    }
  } else if (look === 'm82') {
    const t = cyl(0.045, 0.045, 1.2, 0x2f3a2a, 0.12, -0.25, -0.55); t.rotation.x = Math.PI / 2 - 0.85;
    box(0.4, 0.04, 0.4, 0x252a24, 0.12, -0.7, -0.2);
    g.userData.muzzle = new V3(0.12, 0.15, -0.95);
  } else if (look === 'kord') {
    box(0.11, 0.14, 0.62, BLK, 0, -0.14, -0.42);
    box(0.09, 0.025, 0.55, 0x222322, 0, -0.06, -0.45);
    cyl(0.028, 0.03, 1.05, 0x141414, 0, -0.08, -1.2);
    box(0.07, 0.07, 0.12, 0x141414, 0, -0.08, -1.75);
    box(0.2, 0.22, 0.24, 0x3d4a2c, 0.17, -0.18, -0.4);
    box(0.36, 0.04, 0.04, 0x1a1a1a, 0, -0.12, 0.02);
    box(0.03, 0.12, 0.03, 0x1a1a1a, -0.16, -0.18, 0.04); box(0.03, 0.12, 0.03, 0x1a1a1a, 0.16, -0.18, 0.04);
    box(0.03, 0.02, 0.03, BLK, 0, -0.018, -0.12);
    box(0.0075, 0.012, 0.006, BLK, -0.006, -0.004, -0.12); box(0.0075, 0.012, 0.006, BLK, 0.006, -0.004, -0.12);
    box(0.003, 0.03, 0.004, 0x111111, 0, -0.016, -1.6); box(0.005, 0.034, 0.01, BLK, -0.013, -0.018, -1.6); box(0.005, 0.034, 0.01, BLK, 0.013, -0.018, -1.6);
    g.userData.muzzle = new V3(0, -0.08, -1.82);
  } else if (look === 'rpg') {
    cyl(0.04, 0.04, 0.95, 0x4b5636, 0, -0.07, -0.2);
    cyl(0.05, 0.05, 0.12, 0x2a2a28, 0, -0.07, 0.28);
    cyl(0.045, 0.085, 0.2, 0x55633b, 0, -0.07, -0.78);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 12), M(0x55633b)); cone.rotation.x = -Math.PI / 2; cone.position.set(0, -0.07, -0.97); g.add(cone);
    box(0.03, 0.1, 0.04, BLK, 0, -0.14, -0.05);
    box(0.03, 0.05, 0.14, BLK, -0.05, -0.03, -0.1);
    g.userData.muzzle = new V3(0, -0.07, -0.7);
  }
  return g;
}
const HIP_S = new V3(0.16, -0.17, -0.32), HIP_I = new V3(0.15, -0.12, -0.16), HIP_R = new V3(0.17, -0.03, 0.05), ADS = new V3(0, 0, -0.1);
const rifleModels = {};
function showRifleModel() {
  while (rifleHolder.children.length) rifleHolder.remove(rifleHolder.children[0]);
  const rf = curRifle();
  if (!rifleModels[rf.look]) {
    let m;
    if (rf.type === 'sniper' && rf.org !== 'BOT') { m = buildRifle(rf.look); m.scale.setScalar(0.62); m.rotation.y = 0.05; m.userData.muzzle = new V3(0, -0.02, -(0.25 + 1.1) * 0.62); }
    else m = buildIron(rf.look);
    rifleModels[rf.look] = m;
  }
  const mdl = rifleModels[rf.look];
  rifleHolder.add(mdl);
  flash.position.copy(mdl.userData.muzzle); flash.scale.set(0.25, 0.25, 1);
  rifleHolder.add(flash);
}

/* ---------------- эффекты: трассеры, пыль, искры ---------------- */
const PS_VS = 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aMin;\n' +
  'uniform float uScale; uniform float uFogD; varying vec3 vC; varying float vA; varying float vF;\n#include <common>\n#include <logdepthbuf_pars_vertex>\n' +
  'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(-mv.z, 0.05);\n' +
  ' float px = aSize * uScale / d; gl_PointSize = aAlpha <= 0.0 ? 0.0 : clamp(max(px, aMin), 0.0, 900.0); vC = aColor; vA = aAlpha; vF = 1.0 - exp(-uFogD * uFogD * d * d);\n#include <logdepthbuf_vertex>\n}';
const PS_FS = 'uniform sampler2D map; uniform vec3 uFogC; uniform float uAdd; varying vec3 vC; varying float vA; varying float vF;\n#include <logdepthbuf_pars_fragment>\n' +
  'void main(){\n#include <logdepthbuf_fragment>\n vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; vec3 c = vC * t.rgb;\n' +
  ' if (uAdd > 0.5) a *= 1.0 - vF; else c = mix(c, uFogC, vF); if (a < 0.004) discard; gl_FragColor = vec4(c, a); }';
function makePS(tex, additive, cap) {
  const geo = new THREE.BufferGeometry();
  const A = (n, k) => { const a = new THREE.BufferAttribute(new Float32Array(cap * k), k); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a.array; };
  const ps = { cap, head: 0, geo, pos: A('position', 3), col: A('aColor', 3), size: A('aSize', 1), alpha: A('aAlpha', 1), mn: A('aMin', 1),
    vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap), t: new Float32Array(cap), life: new Float32Array(cap), s0: new Float32Array(cap), s1: new Float32Array(cap),
    a0: new Float32Array(cap), g: new Uint8Array(cap), floor: new Float32Array(cap), on: new Uint8Array(cap), dirty: false };
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uScale: { value: 500 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 }, uAdd: { value: additive ? 1 : 0 } },
    vertexShader: PS_VS, fragmentShader: PS_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  ps.pts = new THREE.Points(geo, mat); ps.pts.frustumCulled = false; ps.pts.renderOrder = additive ? 4 : 3; scene.add(ps.pts);
  return ps;
}
const PSY = { puff: makePS(puffTex, false, IS_TOUCH ? 1100 : 3000), glow: makePS(glowTex, true, IS_TOUCH ? 1000 : 2200) };
const _pc = new THREE.Color();
function emit(ps, x, y, z, vx, vy, vz, s0, s1, life, color, a0, grav, floor, minPx) {
  const i = ps.head; ps.head = (ps.head + 1) % ps.cap;
  ps.on[i] = 1; ps.t[i] = 0; ps.life[i] = life; ps.s0[i] = s0; ps.s1[i] = s1; ps.a0[i] = a0; ps.g[i] = grav ? 1 : 0; ps.floor[i] = floor || -1e9;
  ps.pos[i * 3] = x; ps.pos[i * 3 + 1] = y; ps.pos[i * 3 + 2] = z; ps.vx[i] = vx; ps.vy[i] = vy; ps.vz[i] = vz;
  _pc.setHex(color); ps.col[i * 3] = _pc.r; ps.col[i * 3 + 1] = _pc.g; ps.col[i * 3 + 2] = _pc.b;
  ps.mn[i] = minPx || 0; ps.size[i] = s0; ps.alpha[i] = a0; ps.dirty = true;
}
function updatePS(ps, dt) {
  if (!ps.dirty && !ps.live) return;
  let live = 0;
  const P_ = ps.pos;
  for (let i = 0; i < ps.cap; i++) {
    if (!ps.on[i]) continue;
    const t = ps.t[i] += dt, k = t / ps.life[i];
    if (k >= 1) { ps.on[i] = 0; ps.alpha[i] = 0; continue; }
    live++;
    P_[i * 3] += ps.vx[i] * dt; P_[i * 3 + 1] += ps.vy[i] * dt; P_[i * 3 + 2] += ps.vz[i] * dt;
    if (ps.g[i]) { ps.vy[i] -= 9.8 * dt; if (P_[i * 3 + 1] < ps.floor[i]) { P_[i * 3 + 1] = ps.floor[i]; ps.vx[i] = ps.vy[i] = ps.vz[i] = 0; } }
    else { const dr = 1 - dt * 1.2; ps.vx[i] *= dr; ps.vy[i] *= dr; ps.vz[i] *= dr; }
    const e = 1 - (1 - k) * (1 - k);
    ps.size[i] = ps.s0[i] + (ps.s1[i] - ps.s0[i]) * e;
    ps.alpha[i] = ps.a0[i] * (1 - k) * (1 - k * 0.3);
  }
  ps.live = live; ps.dirty = false;
  const at = ps.geo.attributes;
  at.position.needsUpdate = true; at.aSize.needsUpdate = true; at.aAlpha.needsUpdate = true; at.aColor.needsUpdate = true; at.aMin.needsUpdate = true;
}
// совместимые обёртки
function fxPuff(p, color, s0, s1, life, v, a0, grav, floor, minPx) { emit(PSY.puff, p.x, p.y, p.z, v ? v.x : 0, v ? v.y : 0, v ? v.z : 0, s0, s1, life, color, a0 == null ? 0.95 : a0, grav, floor, minPx); }
function fxGlow(p, color, s0, s1, life, v, a0, grav, floor, minPx) { emit(PSY.glow, p.x, p.y, p.z, v ? v.x : 0, v ? v.y : 0, v ? v.z : 0, s0, s1, life, color, a0 == null ? 1 : a0, grav, floor, minPx); }
function spawnPuff(p, color, size, life, n, rise, spread) {
  for (let i = 0; i < n; i++) emit(PSY.puff, p.x + gauss() * spread, p.y + Math.random() * spread * 0.6, p.z + gauss() * spread, gauss() * 0.4, rise * (0.5 + Math.random()), gauss() * 0.4,
    size * 0.3, size * (0.8 + Math.random() * 0.6), life * (0.7 + Math.random() * 0.6), color, 0.95, 0, 0, 0);
}
function spawnSpark(p, size) { emit(PSY.glow, p.x, p.y, p.z, 0, 0, 0, size, size * 1.6, 0.18, 0xffd27a, 1, 0, 0, 2); }
function updateEffects(dt) {
  updatePS(PSY.puff, dt); updatePS(PSY.glow, dt);
}
function syncPS(cam) {
  const sc = renderer.domElement.height / (2 * Math.tan(cam.fov * DEG / 2));
  for (const k in PSY) { const u = PSY[k].pts.material.uniforms; u.uScale.value = sc; u.uFogC.value.copy(scene.fog.color); u.uFogD.value = scene.fog.density; }
}

/* ---------------- звук (синтез WebAudio) ---------------- */
let AC = null, noiseBuf = null, windGain = null, rainGain = null, rumbleGain = null, OUT = null, MASTER = null, MUFF = null, REV = null, REVIN = null, voices = 0;
const MAXV = IS_TOUCH ? 18 : 32;
function audioInit() {
  if (!S.sound) return;
  try {
    if (!AC) {
      const ACtx = window.AudioContext || window.webkitAudioContext;
      try { AC = new ACtx({ latencyHint: 'balanced' }); } catch (e) { AC = new ACtx(); }
      // общий компрессор: без хрипа и перегрузки, когда стреляют все сразу
      OUT = AC.createDynamicsCompressor(); OUT.threshold.value = -18; OUT.knee.value = 12; OUT.ratio.value = 6; OUT.attack.value = 0.004; OUT.release.value = 0.2;
      MASTER = AC.createGain(); MASTER.gain.value = (S.vol != null ? S.vol : 0.85) * 1.35; MUFF = AC.createBiquadFilter(); MUFF.type = 'lowpass'; MUFF.frequency.value = 20000; OUT.connect(MUFF); MUFF.connect(MASTER); MASTER.connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const mk = (type, f, q) => { const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = AC.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(OUT); src.start(); return g; };
      // эхо открытой степи: свёртка со сгенерированным откликом
      REV = AC.createConvolver(); { const n = Math.floor(AC.sampleRate * 2.4), ir = AC.createBuffer(2, n, AC.sampleRate);
        for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.35 - 0.3 * t); d[i] = lp * Math.pow(1 - t, 2.6) * (i < AC.sampleRate * 0.04 ? i / (AC.sampleRate * 0.04) : 1); } }
        REV.buffer = ir; }
      REVIN = AC.createGain(); REVIN.gain.value = 0.55; REVIN.connect(REV); REV.connect(OUT);
      windGain = mk('bandpass', 420, 0.6); rainGain = mk('highpass', 2500, 0.5); rumbleGain = mk('lowpass', 75, 0.7);
      document.addEventListener('visibilitychange', () => { if (!AC) return; if (document.hidden) AC.suspend(); else AC.resume(); });
    } else if (AC.state === 'suspended') AC.resume();
  } catch (e) { AC = null; }
}
// ограничение голосов: тихие звуки отбрасываются первыми, чтобы не было заиканий
function voiceOk(gain) { if (voices >= MAXV || (voices > MAXV * 0.6 && gain < 0.12)) return false; voices++; return true; }
function noiseHit(t0, dur, type, f, gain, q, rev) {
  if (!voiceOk(gain)) return;
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
  const g = AC.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  src.connect(fl); fl.connect(g); g.connect(OUT); if (rev && REVIN) { const sg = AC.createGain(); sg.gain.value = rev; g.connect(sg); sg.connect(REVIN); } src.onended = () => { voices--; }; src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
}
function tone(t0, f, dur, gain, type, f2, rev) {
  if (!voiceOk(gain)) return;
  const o = AC.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  o.connect(g); g.connect(OUT); if (rev && REVIN) { const sg = AC.createGain(); sg.gain.value = rev; g.connect(sg); sg.connect(REVIN); } o.onended = () => { voices--; }; o.start(t0); o.stop(t0 + dur + 0.05);
}
let sndBudget = 0;
// параметры «голоса» оружия: ударная волна, тело, низкий гул, шипение, механика
const SHOTK = {
  ak:      { dur: 0.42, n: 0.0011, fc: 2100, tau: 0.045, f: 120, ftau: 0.05, body: 1.0, low: 0.55, hiss: 0.55, mech: 0.035 },
  mg:      { dur: 0.5,  n: 0.0014, fc: 1600, tau: 0.065, f: 92,  ftau: 0.07, body: 1.1, low: 0.75, hiss: 0.5,  mech: 0.04 },
  sniper:  { dur: 0.7,  n: 0.0018, fc: 1300, tau: 0.09,  f: 72,  ftau: 0.1,  body: 1.15, low: 0.95, hiss: 0.45, mech: 0 },
  big:     { dur: 0.95, n: 0.0024, fc: 950,  tau: 0.13,  f: 54,  ftau: 0.14, body: 1.25, low: 1.2, hiss: 0.4,  mech: 0 },
  silent:  { dur: 0.2,  n: 0,      fc: 900,  tau: 0.018, f: 190, ftau: 0.02, body: 0.45, low: 0.2, hiss: 0.25, mech: 0.03 },
  robot:   { dur: 0.45, n: 0.0012, fc: 2400, tau: 0.04,  f: 140, ftau: 0.05, body: 0.9, low: 0.5, hiss: 0.6,  mech: 0, ring: 1750 },
  robotmg: { dur: 0.5,  n: 0.0014, fc: 1700, tau: 0.06,  f: 100, ftau: 0.07, body: 1.0, low: 0.7, hiss: 0.5,  mech: 0, ring: 1250 },
  rocket:  { dur: 1.3,  n: 0.002,  fc: 600,  tau: 0.45,  f: 60,  ftau: 0.2,  body: 1.0, low: 0.7, hiss: 0.9,  mech: 0 },
};
const SBUF = {};
function mkBuf(dur, fill) {
  const n = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  fill(d, AC.sampleRate); let m = 1e-6; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] /= m; return b;
}
function synthShot(P, seed) {
  return mkBuf(P.dur, (d, sr) => {
    let s0 = seed * 7919 + 13; const R = () => { s0 = (s0 * 16807) % 2147483647; return s0 / 1073741823.5 - 1; };
    const a = 1 - Math.exp(-2 * Math.PI * P.fc / sr); let l1 = 0, l2 = 0, l3 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, w = R();
      let s = P.n && t < P.n ? (1 - 2 * t / P.n) * 1.4 : 0;                            // N-волна
      l1 += (w - l1) * a; l2 += (l1 - l2) * a; l3 += (l2 - l3) * a * 0.5;
      s += (l2 * 2.6 + l3 * 3.5) * Math.exp(-t / P.tau) * (1 - Math.exp(-t / 0.0006)) * P.body;   // тело выстрела
      s += Math.sin(2 * Math.PI * P.f * t * (1 - t * 0.9)) * Math.exp(-t / P.ftau) * P.low;          // низкий удар
      s += w * Math.exp(-t / 0.005) * P.hiss;                                                        // шипение газов
      if (P.ring) s += Math.sin(2 * Math.PI * P.ring * t) * Math.exp(-t / 0.05) * 0.18;              // металл робота
      if (P.mech) { const tm = t - P.mech; if (tm > 0 && tm < 0.03) s += w * 0.3 * Math.exp(-tm / 0.004) + Math.sin(2 * Math.PI * 3100 * tm) * 0.12 * Math.exp(-tm / 0.006); }
      // хвост: отражения от увалов степи
      [0.18, 0.41, 0.77].forEach((e, k) => { const te = t - e; if (te > 0) s += l3 * 2.2 * Math.exp(-te / (0.12 + k * 0.08)) * (0.32 - k * 0.08) * P.body; });
      d[i] = s;
    }
  });
}
function shotBuf(kind) {
  if (!SBUF[kind]) SBUF[kind] = [0, 1, 2].map((k) => synthShot(SHOTK[kind], k + kind.length * 31));
  const a = SBUF[kind]; return a[(Math.random() * a.length) | 0];
}
function playBuf(buf, t, gain, rate, lpF, rev) {
  if (!voiceOk(gain)) return;
  const s = AC.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate || 1; let node = s;
  if (lpF && lpF < 16000) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpF; s.connect(f); node = f; }
  const gg = AC.createGain(); gg.gain.value = gain; node.connect(gg); gg.connect(OUT);
  if (rev && REVIN) { const sg = AC.createGain(); sg.gain.value = rev; gg.connect(sg); sg.connect(REVIN); }
  s.onended = () => { voices--; }; s.start(t);
}
const shotKind = (rf, heavy, robot) => (rf ? (rf.silent ? 'silent' : rf.type === 'rocket' ? 'rocket' : rf.org === 'BOT' ? (rf.id === 'rmg' ? 'robotmg' : 'robot') : rf.g > 40 ? 'big' : rf.type === 'sniper' ? 'sniper' : rf.id === 'pkm' || rf.id === 'rpk' ? 'mg' : 'ak') : robot ? (heavy ? 'robotmg' : 'robot') : heavy ? 'mg' : 'ak');
function sndShot(power, auto) {
  if (!AC || !S.sound) return; const t = AC.currentTime, rf = curRifle(), kind = shotKind(rf);
  playBuf(shotBuf(kind), t, 1.5 * power, 0.96 + Math.random() * 0.08, null, kind === 'silent' ? 0.1 : 0.55);
  if (rf.type !== 'rocket' && Math.random() < (auto ? 0.35 : 0.9)) { const tc = t + 0.38 + Math.random() * 0.2; tone(tc, 3800 + Math.random() * 900, 0.06, 0.06, 'triangle', 3000); tone(tc + 0.09, 4300, 0.04, 0.035, 'triangle'); }
}
function sndShotOld(power, auto) {
  if (!AC || !S.sound) return; const t = AC.currentTime, rf = curRifle();
  const sil = !!rf.silent, big = rf.g > 30;
  // хлопок дульной волны, «тело» выстрела, низкий удар, механика затвора, эхо
  noiseHit(t, 0.045, 'highpass', 2200, (sil ? 0.25 : 1.0) * power, 0, 0.5);
  noiseHit(t, auto ? 0.22 : 0.42 + power * 0.25, 'lowpass', big ? 700 : 1100, (sil ? 0.3 : 1.05) * power, 0, 0.9);
  tone(t, big ? 48 : 70, auto ? 0.16 : 0.3, (sil ? 0.2 : 0.85) * power, 'sine', 30);
  noiseHit(t + 0.004, 0.03, 'bandpass', 3400, 0.22, 4);
  if (!sil && (!auto || Math.random() < 0.35)) { noiseHit(t + 0.32, 1.6, 'lowpass', 380, 0.22 * power, 0, 0.6); noiseHit(t + 0.9, 1.4, 'lowpass', 260, 0.1 * power); }
  // гильза звякает о землю
  if (rf.type !== 'rocket' && Math.random() < (auto ? 0.4 : 0.9)) { const tc = t + 0.38 + Math.random() * 0.2; tone(tc, 3800 + Math.random() * 900, 0.06, 0.05, 'triangle', 3000); tone(tc + 0.09, 4300, 0.04, 0.03, 'triangle'); }
}
// выстрел где-то на поле: громкость и задержка по расстоянию
function sndShotFar(dist, heavy, robot) {
  if (!AC || !S.sound || sndBudget > 7) return;
  const v = clamp(30 / (dist + 30), 0.03, 0.8), t = AC.currentTime + dist / 343;
  if (v < 0.05 && Math.random() < 0.6) return;
  sndBudget++;
  playBuf(shotBuf(shotKind(null, heavy, robot)), t, 1.35 * v, 0.94 + Math.random() * 0.1, clamp(12000 / (1 + dist / 70), 450, 14000), dist > 150 ? 0.9 : 0.4);
}
function sndCrack(v) { if (!AC || !S.sound) return; const t = AC.currentTime; noiseHit(t, 0.03, 'highpass', 3000, 0.9 * v); noiseHit(t + 0.01, 0.06, 'bandpass', 1800, 0.5 * v, 2); tone(t, 2600 + Math.random() * 1400, 0.16, 0.08 * v, 'sine', 700 + Math.random() * 300); }
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
function say() { /* голоса ИИ отключены */ }
function sndBeep() { if (!AC || !S.sound) return; tone(AC.currentTime, 2400, 0.08, 0.12, 'square'); }

/* ---------------- лазерный целеуказатель на оружии игрока ---------------- */
function initLaser() {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  LASER.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  LASER.line.frustumCulled = false; LASER.line.visible = false; scene.add(LASER.line);
  LASER.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  LASER.dot.visible = false; scene.add(LASER.dot);
}
function toggleLaser() { LASER.on = !LASER.on; $('bLaser').classList.toggle('on', LASER.on); if (HOOK.toast) HOOK.toast('Лазер ' + (LASER.on ? 'включён' : 'выключен')); }
HOOK.laserOn = () => LASER.on && !HOOK.dead;
const _ld = new V3(), _lo = new V3(), _lr = new V3(), _lu = new V3();
function updateLaserBeam() {
  if (!LASER.line) initLaser();
  const rf = curRifle();
  const vis = LASER.on && !HOOK.dead && started && (AIM.mode === 'hip' || (AIM.mode === 'scope' && curScope().iron)) && !rf.mounted && rf.type !== 'mortar';
  LASER.line.visible = LASER.dot.visible = vis; if (!vis) return;
  const q = camera.quaternion, p = camera.position;
  _ld.set(0, 0, -1).applyQuaternion(q); _lr.set(1, 0, 0).applyQuaternion(q); _lu.set(0, 1, 0).applyQuaternion(q);
  if ((LASER.f++ & 1) === 0) {
    let best = HOOK.rayUnits ? HOOK.rayUnits(p, _ld, 500) : Infinity;
    const tr = marchTerrain(p, _ld, Math.min(best, 500)); if (tr < best) best = tr;
    LASER.d = best < 500 ? best : 500;
  }
  rifleHolder.updateMatrixWorld(true); flash.getWorldPosition(_lo);
  if (_lo.distanceTo(p) > 2) { const k = 1 - AIM.blend * 0.85; _lo.copy(p).addScaledVector(_ld, 0.6).addScaledVector(_lr, 0.1 * k).addScaledVector(_lu, -0.11 * k); }
  const hx = p.x + _ld.x * LASER.d, hy = p.y + _ld.y * LASER.d, hz = p.z + _ld.z * LASER.d;
  const a = LASER.line.geometry.attributes.position.array; a[0] = _lo.x; a[1] = _lo.y; a[2] = _lo.z; a[3] = hx; a[4] = hy; a[5] = hz;
  LASER.line.geometry.attributes.position.needsUpdate = true;
  const night = !!(WEATHER[S.weather] && WEATHER[S.weather].night);
  LASER.line.material.opacity = night ? 0.8 : 0.22; LASER.dot.material.opacity = night ? 1 : 0.85;
  LASER.dot.position.set(hx - _ld.x * 0.05, hy - _ld.y * 0.05, hz - _ld.z * 0.05);
  const sz = 0.05 + LASER.d * 0.0065; LASER.dot.scale.set(sz, sz, 1);
}

/* ---------------- игрок ---------------- */
let landDip = 0;
const P = { x: 0, z: 0.6, yaw: 0, pitch: 0.01, stance: 0, eye: 1.62, moving: 0, bob: 0, jy: 0, vy: 0, runLock: false, lean: 0, leanV: 0 };
function setLean(d) { P.lean = P.lean === d ? 0 : d; $('bLeanL').classList.toggle('on', P.lean === -1); $('bLeanR').classList.toggle('on', P.lean === 1); }
function jump() {
  if (HOOK.dead || P.jy > 0.01 || P.stance === 2 || AIM.mode !== 'hip' || curRifle().mounted || (HOOK.noJump && HOOK.noJump())) return;
  if (P.stance === 1) { setStance(1); return; }
  P.vy = P.robot ? 9.6 : 6.9; P.jy = 0.001;
}
const STANCE = [
  { eye: 1.62, speed: 3.6, sway: 3.0, tremor: 0.55, kick: 1.6, name: 'Стоя' },
  { eye: 1.0,  speed: 1.7, sway: 1.6, tremor: 0.32, kick: 1.2, name: 'Сидя' },
  { eye: 0.3, speed: 0.7, sway: 0.45, tremor: 0.1, kick: 0.6, name: 'Лёжа' },
];
const RSTANCE = [
  { eye: 2.15, speed: 4.2, sway: 0.9, tremor: 0.12, kick: 0.9, name: 'Стоя' },
  { eye: 1.6,  speed: 2.2, sway: 0.6, tremor: 0.1,  kick: 0.7, name: 'Присед' },
  { eye: 1.15, speed: 0.9, sway: 0.4, tremor: 0.08, kick: 0.5, name: 'На колене' },
];
const stOf = () => (P.robot ? RSTANCE : STANCE)[P.stance];
const AIM = { mode: 'hip', zoom: 4, binoZoom: 10, blend: 0 };     // hip | scope | bino
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
  return S.fov || 65;
}
function setAim(mode) {
  if (AIM.mode === mode) mode = 'hip';
  if (mode === 'scope' && curRifle().type === 'mortar') mode = 'hip';
  AIM.mode = mode;
  const sc = curScope();
  if (mode === 'scope') { const st = curTur(); AIM.zoom = st.zoom || sc.min; }
  $('bScope').classList.toggle('on', mode === 'scope'); $('bScopeL').classList.toggle('on', mode === 'scope');
  $('bBino').classList.toggle('on', mode === 'bino');
  document.body.classList.toggle('aiming', mode !== 'hip');
  rifleHolder.visible = mode === 'hip' || (mode === 'scope' && sc.iron);
  if (sc.thermal && mode === 'scope') { VIS.prev = VIS.mode; setVision('thermal'); }
  else if (VIS.prev != null && mode !== 'scope') { setVision(VIS.prev); VIS.prev = null; }
  updateAimUI();
}
function updateAimUI() {
  const m = AIM.mode, sc = curScope();
  const mortar = curRifle().type === 'mortar';
  $('tur').hidden = (m !== 'scope' || !!sc.rocket) && !mortar;
  $('tur').classList.toggle('iron', !!sc.iron || mortar);
  if (HOOK.aimUI) HOOK.aimUI(m);
  $('bBreath').hidden = m !== 'scope' || !!P.robot;
  $('stamina').hidden = m !== 'scope';
  const zoomable = (m === 'scope' && sc.max > sc.min) || m === 'bino';
  $('zoom').hidden = !zoomable;
  if (IS_TOUCH) $('joy').hidden = m !== 'hip';
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
  if (curRifle().type === 'mortar' && HOOK.mortarInfo) { const mi = HOOK.mortarInfo(); $('turE').textContent = 'ДАЛЬН ' + mi.range; $('turW').textContent = mi.tof + ' с'; $('turU').textContent = 'м'; return; }
  if (sc.iron) {
    $('turE').textContent = 'ПРИЦЕЛ ' + st.drum;
    $('turW').textContent = (st.drum * 100) + ' м';
  } else if (sc.unit === 'thou') {
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
  if (curRifle().type === 'mortar') { if (HOOK.mortarAdj && (t === 'e+' || t === 'e-')) HOOK.mortarAdj(t === 'e+' ? 25 : -25); if (HOOK.mortarAdj && t === '0') HOOK.mortarAdj(0); sndClick(); updateTurUI(); return; }
  if (t === '0') { st.e = 0; st.w = 0; st.drum = 1; }
  else if (t === 'e+' || t === 'e-') {
    const d = t === 'e+' ? 1 : -1;
    if (sc.rocket) return;
    if (sc.unit === 'thou') st.drum = clamp(st.drum + d, 1, sc.drumMax || 10);
    else st.e = clamp(st.e + d, -Math.round(2 / sc.click), Math.round(sc.maxE / sc.click));
  } else {
    const d = t === 'w+' ? 1 : -1;
    if (!sc.maxW) return;
    st.w = clamp(st.w + d, -Math.round(sc.maxW / sc.click), Math.round(sc.maxW / sc.click));
  }
  sndClick(); updateTurUI();
}

function updateWeaponUI() {
  const rf = curRifle(), st = curTur();
  $('wName').textContent = rf.name;
  $('wCal').textContent = rf.cal + ' · ' + scopeOf(rf).name;
  $('wAmmo').textContent = reloadT > 0 ? '···' : ammoText(rf, st);
  if (!$('wList').hidden) renderWeaponList();
}
function ammoText(rf, st) { return rf.type === 'rocket' ? st.ammo + ' + ' + (st.reserve == null ? '∞' : st.reserve) : st.ammo + '/' + rf.mag + (st.mags != null ? ' · ' + st.mags : ''); }
let wlT = 0;
function weaponChoices() {
  const l = HOOK.weapons ? HOOK.weapons() : null; if (l) return l;
  const a = []; RIFLES.forEach((r, i) => { if (!r.mounted && r.org !== 'BOT') a.push(i); }); return a;
}
function renderWeaponList() {
  const el = $('wList'); el.innerHTML = '';
  weaponChoices().forEach((i, n) => {
    const r = RIFLES[i], st = TUR[r.id], b = document.createElement('button'); b.type = 'button'; b.className = 'wi' + (i === S.rifle ? ' on' : '');
    b.innerHTML = '<span class="k">' + (n + 1) + '</span><span class="n">' + r.name + '</span><span class="s">' + scopeOf(r).name + '</span><span class="a">' + ammoText(r, st) + '</span>';
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); selectRifle(i); el.hidden = true; });
    el.appendChild(b);
  });
}
function toggleWeaponList() {
  const el = $('wList'); if (!el.hidden) { el.hidden = true; return; }
  if (HOOK.canSwitch && !HOOK.canSwitch()) return;
  renderWeaponList(); el.hidden = false; clearTimeout(wlT); wlT = setTimeout(() => { el.hidden = true; }, 7000);
}
document.addEventListener('pointerdown', (e) => {
  if (!$('wList').hidden && !e.target.closest('#wList,#weapon')) $('wList').hidden = true;
  if (!$('morePanel').hidden && !e.target.closest('#morePanel,#bMore')) $('morePanel').hidden = true;
}, true);
function selectRifle(i) {
  if (HOOK.dead) return;
  if (i === S.rifle && rifleModels[curRifle().look]) return;
  S.rifle = (i + RIFLES.length) % RIFLES.length; save();
  cycleT = 0.6; reloadT = 0;
  const m = AIM.mode; AIM.mode = 'hip'; showRifleModel(); if (m !== 'hip') setAim(m); else setAim('hip');
  updateWeaponUI(); updateTurUI();
}
let reloadDur = 1;
function reload() {
  const rf = curRifle(), st = curTur();
  if (reloadT > 0 || st.ammo === rf.mag || HOOK.dead) return;
  if (st.reserve === 0) return;
  if (st.mags === 0) { if (HOOK.noAmmo) HOOK.noAmmo(); return; }
  reloadT = rf.type === 'rocket' ? 3.6 : rf.id === 'pkm' ? 5.5 : rf.type === 'auto' ? 2.4 : rf.semi ? 2.6 : 3.2;
  reloadDur = reloadT;
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
const tracerMats = {};
function spawnBullet(o) {
  if (bullets.length > 260) return null;
  const d = o.dir;
  const b = {
    rf: o.rf, team: o.team || 'h', player: !!o.player, owner: o.owner || null,
    p: o.origin.clone(), v: d.clone().multiplyScalar(o.mv), t: 0, right: o.rico ? new V3() : new V3(-d.z, 0, d.x).normalize(),
    last: o.origin.clone(), cur: o.origin.clone(), alive: true, aim: o.aim || null, aimPass: null, paper: new Set(), reported: !o.player,
    origin: o.origin.clone(), trail: [], acc: 0, aimDir: (o.aimDir || d).clone(), dt: o.dt || 0.001, rico: !!o.rico,
  };
  if (o.tracer) { b.tc = o.tracer; b.fxp = o.origin.clone(); }
  bullets.push(b);
  return b;
}
function fire() {
  audioInit();
  if (AIM.mode === 'bino') { laser(); return; }
  if (HOOK.dead) return;
  const rf = curRifle(), st = curTur();
  if (rf.type === 'mortar') { if (cycleT > 0) return; cycleT = rf.cycle; if (HOOK.fireMortar) HOOK.fireMortar(); return; }
  if (reloadT > 0) return;
  if (st.ammo <= 0) { if (rf.type !== 'auto' || !fireHeld || cycleT <= 0) reload(); return; }
  if (cycleT > 0) { if (rf.type === 'sniper' && !rf.semi) sndClick(); return; }
  if (P.sprint) return;
  st.ammo--; cycleT = rf.type === 'auto' ? 60 / rf.rpm : rf.type === 'rocket' ? 0.6 : rf.cycle;
  if (HOOK.fired) HOOK.fired(!!rf.silent);
  STATS.shots++;
  const q = camera.quaternion;
  const dir = new V3(0, 0, -1).applyQuaternion(q), up = new V3(0, 1, 0).applyQuaternion(q), right = new V3(1, 0, 0).applyQuaternion(q);
  const origin = camera.position.clone().addScaledVector(up, -rf.sh).addScaledVector(dir, 0.5);
  const hipK = AIM.mode === 'hip' ? (rf.type === 'sniper' ? 3 : 1.6) * (LASER.on ? 0.65 : 1) : 1;
  const disp = rf.disp * hipK * (rf.type === 'auto' && P.stance === 2 ? 0.6 : 1) * 0.001 * (HOOK.dispMul || 1);
  if (S.vibro && navigator.vibrate) { try { navigator.vibrate(rf.type === 'auto' ? 7 : 18); } catch (e) { /* ignore */ } }
  const d = dir.clone();
  const ae = HOOK.autoElev ? HOOK.autoElev(dir, rf) : 0;
  if (rf.type === 'rocket') {
    d.applyAxisAngle(right, gauss() * disp + ae); d.applyAxisAngle(up, gauss() * disp);
    if (HOOK.launchRocket) HOOK.launchRocket(camera.position.clone().addScaledVector(up, -0.07).addScaledVector(dir, 0.9), d, HOOK.playerTeam || 'h', true, !!rf.smoke);
    REC.v += 0.5 * rf.recoil;
    flash.material.opacity = 1;
    updateWeaponUI();
    return;
  }
  const el = zeroAngle(rf) + elevRad() + gauss() * disp + ae;
  const wd = windRad() + gauss() * disp;
  d.applyAxisAngle(right, el); d.applyAxisAngle(up, -wd);
  const mv = mvNow(rf) + gauss() * 2.5;
  const auto = rf.type === 'auto';
  const tr = S.tracers && (!auto || STATS.shots % (rf.id === 'pkm' ? 2 : 3) === 0) ? 0xff9a3c : 0;
  const b = spawnBullet({ team: HOOK.playerTeam || 'h', player: true, rf, origin, dir: d, mv, tracer: tr, aim: aimedTarget(origin, dir), aimDir: dir });
  // отдача, звук, вспышка
  const sk = stOf().kick * rf.recoil;
  REC.v += 0.75 * sk * (auto ? 0.6 : 1);
  P.yaw += gauss() * (auto ? 0.0012 : 0.0025) * sk * (P.stance === 2 ? 0.4 : 1);
  if (rf.silent) { if (AC && S.sound) { noiseHit(AC.currentTime, 0.08, 'bandpass', 1800, 0.35, 1.5); noiseHit(AC.currentTime + 0.02, 0.12, 'lowpass', 600, 0.25); } }
  else sndShot(clamp(0.55 + rf.recoil * 0.25, 0.45, 1), auto);
  // мощь оружия: тряска и пороховой дым у дула
  SHAKE.a += (auto ? 0.0025 : 0.006) + rf.recoil * (auto ? 0.002 : 0.006);
  if (rf.type !== 'rocket') ejectCasing();
  BRL.n++; BRL.last = simT; PUNCH = Math.min(1.5, PUNCH + (auto ? 0.35 : 1) * (0.5 + rf.recoil * 0.5));
  if (!rf.silent) { const mz2 = camera.position.clone().addScaledVector(dir, 1.6).addScaledVector(up, -0.12); fxPuff(mz2, 0xe2ddd2, 0.12, 0.9 + rf.recoil * 0.6, 0.9, dir.clone().multiplyScalar(2.2), 0.22); }
  if (!rf.silent && (!auto || STATS.shots % 3 === 0)) { const mz = camera.position.clone().addScaledVector(dir, 1.4).addScaledVector(up, -0.15); fxPuff(mz, 0xd8d4cc, 0.15, 0.9 + rf.recoil * 0.4, 1.2, dir.clone().multiplyScalar(1.5).add(new V3(0, 0.4, 0)), 0.35); }
  if (rf.type === 'sniper' && !rf.semi) sndBolt(0.45);
  flash.material.opacity = 1;
  if (P.stance === 2 && (!auto || STATS.shots % 4 === 0)) { const mp = camera.position.clone().addScaledVector(dir, 1.2); mp.y = terrainH(mp.x, mp.z) + 0.05; spawnPuff(mp, 0xa89a7c, 0.9 * rf.recoil, 1.2, auto ? 2 : 4, 0.4, 0.3); }
  if (b && S.bcam && rf.type === 'sniper' && b.aim && b.aim.D >= 250 && !BCAM.b) { BCAM.b = b; BCAM.hold = 0; }
  updateWeaponUI();
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.alive) {
      b.acc += dt;
      const DT = b.dt;
      while (b.acc >= DT && b.alive) { b.acc -= DT; stepBullet(b, DT); }
      if (b.alive && (b.t > 8 || b.cur.y < -100)) killBullet(b, null);
    }
    if (b.tc && b.alive) {
      // трассер: цепочка коротко живущих светящихся частиц от прошлого кадра до текущего
      const L = b.fxp.distanceTo(b.cur), n = Math.min(5, 1 + Math.floor(L / 6));
      const px = AIM.mode === 'hip' ? 3.2 : 4.5, sz = b.rf.g > 30 ? 0.35 : 0.22;
      for (let k = 1; k <= n; k++) { const f = k / n; emit(PSY.glow, lerp(b.fxp.x, b.cur.x, f), lerp(b.fxp.y, b.cur.y, f), lerp(b.fxp.z, b.cur.z, f), 0, 0, 0, sz, sz * 0.5, 0.11, b.tc, 1, 0, 0, px * (b.player ? 1 : 0.85)); }
      b.fxp.copy(b.cur);
    }
    if (!b.alive && BCAM.b !== b) bullets.splice(i, 1);
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
  if (!HOOK.battle) for (const T of targets) {
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
  let best = HOOK.collide ? HOOK.collide(b, p0, p1) : null;
  const g1 = terrainH(p1.x, p1.z);
  if (p1.y <= g1) {
    const g0 = terrainH(p0.x, p0.z);
    const e0 = p0.y - g0, e1 = p1.y - g1, f = e0 > 0 ? e0 / (e0 - e1) : 0;
    if (!best || f < best.t) best = { t: f, fn: () => groundHit(b, new V3(lerp(p0.x, p1.x, f), lerp(p0.y, p1.y, f), lerp(p0.z, p1.z, f))) };
  }
  if (best) best.fn();
}
// рикошет от земли при пологом угле встречи
function groundHit(b, pt) {
  const v = b.v, sp = v.length();
  const sinI = -v.y / sp;
  if (!b.rico && sp > 250 && sinI < 0.13 && Math.random() < 0.55) {
    b.rico = true; b.right.set(0, 0, 0);
    const k = 0.5 + Math.random() * 0.15;
    v.set(v.x * k, Math.abs(v.y) * (0.25 + Math.random() * 0.4) + sp * 0.02 * Math.random(), v.z * k);
    v.applyAxisAngle(new V3(0, 1, 0), gauss() * 0.12);
    pt.y += 0.03; b.p.copy(pt); b.cur.copy(pt); b.last.copy(pt);
    spawnPuff(pt, 0x9b8a68, 0.35 + b.rf.g * 0.01, 1.0, b.player ? 3 : 1, 0.4, 0.1);
    return;
  }
  killBullet(b, pt);
}
function targetSeg(p0, p1) {
  if (HOOK.battle) return null;
  for (const T of targets) {
    const d0 = (p0.x - T.c.x) * T.n.x + (p0.z - T.c.z) * T.n.z, d1 = (p1.x - T.c.x) * T.n.x + (p1.z - T.c.z) * T.n.z;
    if (d0 > 0 && d1 <= 0) {
      const f = d0 / (d0 - d1), pt = new V3().lerpVectors(p0, p1, f);
      const a = (pt.x - T.c.x) * T.u.x + (pt.z - T.c.z) * T.u.z, bb = pt.y - T.c.y;
      const inside = T.kind === 'ring' ? Math.abs(a) <= T.S && Math.abs(bb) <= T.S : (Math.abs(a) < 0.3 && bb + 0.735 > 0 && bb + 0.735 < 1.5 && inPoly(a, bb + 0.735, SIL));
      if (inside) return { T, a, b: bb, pt, f };
    }
  }
  return null;
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
function killBullet(b, pt, quiet) {
  b.alive = false;
  if (pt) {
    b.cur.copy(pt);
    const dist = pt.distanceTo(camera.position);
    if (!quiet) {
      const sz = 0.7 + clamp(dist / 1000, 0, 1.6) + Math.min(b.rf.g, 50) * 0.012;
      spawnPuff(pt, 0x9b8a68, sz, 1.8, b.player ? 6 : 2, 0.6, 0.25);
      if (b.player || dist < 120) sndImpact('ground', dist / 343, dist);
    }
  }
  if (!b.reported) {
    b.reported = true;
    if (HOOK.battle) { /* в бою разбор выстрела не показываем */ }
    else if (b.aim && b.aimPass) report({ kind: 'miss', T: b.aim, a: b.aimPass.a, b: b.aimPass.b, t: b.aimPass.t, v: b.aimPass.v });
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
const LRF = { d: null, t: 0, ang: 0, T: null, pt: null };
const ray = new THREE.Raycaster();
function marchTerrain(o, dir, maxD) {
  let s = 1, prev = 0;
  while (s < maxD) {
    const x = o.x + dir.x * s, y = o.y + dir.y * s, z = o.z + dir.z * s;
    if (y < terrainH(x, z)) {
      let lo = prev, hi = s;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (o.y + dir.y * m < terrainH(o.x + dir.x * m, o.z + dir.z * m)) hi = m; else lo = m; }
      return hi;
    }
    prev = s; s += Math.max(0.5, s * 0.01);
  }
  return Infinity;
}
function rangeAt() {
  const o = camera.position, dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = HOOK.rayUnits ? HOOK.rayUnits(o, dir, 2500) : Infinity;
  best = Math.min(best, marchTerrain(o, dir, Math.min(best, 2500)));
  return best < 2500 ? best : null;
}
function laser() {
  const o = camera.position.clone(), dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = Infinity, bestT = null;
  ray.set(o, dir); ray.far = 4000;
  const hits = HOOK.battle ? [] : ray.intersectObjects(targetMeshes, false);
  if (hits.length) { best = hits[0].distance; bestT = hits[0].object.userData.T; }
  if (HOOK.rayUnits) { const u = HOOK.rayUnits(o, dir, Math.min(best, 4000)); if (u < best) { best = u; bestT = null; } }
  const tr = marchTerrain(o, dir, Math.min(best, 4000));
  if (tr < best) { best = tr; bestT = null; }
  LRF.d = best < 4000 ? best : null; LRF.t = 6; LRF.pt = LRF.d ? o.clone().addScaledVector(dir, LRF.d) : null; LRF.ang = Math.asin(clamp(dir.y, -1, 1)) / DEG; LRF.T = bestT;
  sndBeep();
}

/* ---------------- управление ---------------- */
const touch = $('touch');
const joyEl = $('joy'), knob = $('knob');
const JOY = { id: null, ox: 0, oy: 0 };
const LOOK = { id: null, x: 0, y: 0 };
const MDRAG = { id: null, x: 0, y: 0 };
// гироскоп: поворот телефона = поворот взгляда (как в PUBG Mobile)
const GYRO = { yaw: 0, pitch: 0, seen: false };
window.addEventListener('devicemotion', (e) => {
  const r = e.rotationRate; if (!r || r.beta == null || S.gyro === 'off') return;
  GYRO.seen = true;
  let it = e.interval || 16; if (it < 1) it *= 1000;
  const dt = Math.min(0.1, it / 1000);
  const ang = (screen.orientation && screen.orientation.angle != null) ? screen.orientation.angle : (window.orientation || 90);
  const sg = (ang === 270 || ang === -90) ? -1 : 1, inv = S.gyroInv ? -1 : 1;
  GYRO.yaw += r.beta * sg * dt * inv; GYRO.pitch += -r.gamma * sg * dt * inv;
});
function applyGyro() {
  const on = S.gyro === 'always' || (S.gyro === 'scope' && AIM.mode !== 'hip');
  if (on && !HOOK.dead) {
    const k = DEG * (S.gyroS || 1) * (0.35 + 0.65 * camera.fov / 65);
    P.yaw += GYRO.yaw * k; P.pitch = clamp(P.pitch + GYRO.pitch * k, -1.4, 1.4);
  }
  GYRO.yaw = 0; GYRO.pitch = 0;
}
function lookDelta(dx, dy, kind) {
  const k = (kind === 'mouse' ? 0.0022 : 0.0046) * S.sens * (camera.fov / 65) * (AIM.mode === 'hip' ? 1 : 0.85 * (S.sensS || 1)) * (HOOK.lookScale ? HOOK.lookScale() : 1);
  P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k, -1.4, 1.4);
}
function joyStart(e) {
  JOY.id = e.pointerId; JOY.ox = e.clientX; JOY.oy = e.clientY;
  const js = joyEl.offsetWidth || 130;
  joyEl.style.left = (e.clientX - js / 2) + 'px'; joyEl.style.top = (e.clientY - js / 2) + 'px'; joyEl.style.bottom = 'auto';
}
function joyMove(e) {
  let dx = e.clientX - JOY.ox, dy = e.clientY - JOY.oy; const l = Math.hypot(dx, dy), m = (joyEl.offsetWidth || 130) * 0.4;
  if (l > m) { dx *= m / l; dy *= m / l; }
  knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  input.mx = dx / m; input.my = -dy / m;
}
function joyEnd() { JOY.id = null; input.mx = 0; input.my = 0; knob.style.transform = ''; if (window.HUD) window.HUD.apply(); else { joyEl.style.left = ''; joyEl.style.top = ''; joyEl.style.bottom = ''; } }

touch.addEventListener('pointerdown', (e) => {
  audioInit();
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement === touch) { if (e.button === 0) { fireHeld = true; fire(); } else if (e.button === 2) setAim('scope'); return; }
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
document.addEventListener('mouseup', (e) => { if (e.button === 0) fireHeld = false; });
touch.addEventListener('wheel', (e) => { if (AIM.mode !== 'hip') { setZoomFrac(zoomFrac() - Math.sign(e.deltaY) * 0.06); } e.preventDefault(); }, { passive: false });

// кнопка огня: нажатие — выстрел, далее палец можно тянуть для доводки (как в мобильных шутерах)
function fireButton(el) {
  let id = null, x = 0, y = 0;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; x = e.clientX; y = e.clientY; try { el.setPointerCapture(id); } catch (err) { /* ignore */ } fireHeld = true; fire(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; lookDelta(e.clientX - x, e.clientY - y, e.pointerType === 'mouse' ? 'mouse' : 'touch'); x = e.clientX; y = e.clientY; });
  const up = (e) => { if (e.pointerId === id) { id = null; fireHeld = false; } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
fireButton($('bFire')); fireButton($('bFireL'));
function tapButton(el, fn) { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audioInit(); fn(); }); }
tapButton($('bScope'), () => setAim('scope'));
tapButton($('bScopeL'), () => setAim('scope'));
tapButton($('bBino'), () => setAim('bino'));
tapButton($('bCrouch'), () => setStance(1));
tapButton($('bProne'), () => setStance(2));
tapButton($('bReload'), reload);
tapButton($('bJump'), jump);
tapButton($('bLaser'), toggleLaser);
tapButton($('bLeanL'), () => setLean(-1));
tapButton($('bLeanR'), () => setLean(1));
// граната: нужно удержать кнопку ~0,3 с — случайно не бросишь
(function () {
  const el = $('bGren'); let tm = null;
  const cancel = () => { if (tm) { clearTimeout(tm); tm = null; } el.classList.remove('on'); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audioInit(); cancel(); el.classList.add('on'); tm = setTimeout(() => { tm = null; el.classList.remove('on'); if (HOOK.grenade) HOOK.grenade(); }, 320); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, cancel));
})();
tapButton($('bVision'), () => setVision(VIS.mode === 'off' ? 'nvg' : VIS.mode === 'nvg' ? 'thermal' : 'off'));
tapButton($('bSquad'), () => { if (HOOK.squadMenu) HOOK.squadMenu(); });
tapButton($('bMed'), () => { if (HOOK.medkit) HOOK.medkit(); });
tapButton($('bUse'), () => { if (HOOK.use) HOOK.use(); });
tapButton($('weapon'), toggleWeaponList);
tapButton($('bMore'), () => { $('morePanel').hidden = !$('morePanel').hidden; });
$('morePanel').addEventListener('pointerup', () => { setTimeout(() => { $('morePanel').hidden = true; }, 160); });
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
  if (k === 'Space') { e.preventDefault(); if (!e.repeat) { fireHeld = true; fire(); } }
  else if (k === 'KeyQ') setAim('scope');
  else if (k === 'KeyE') jump();
  else if (k === 'KeyO') setLean(-1);
  else if (k === 'KeyP') setLean(1);
  else if (k === 'KeyK' && HOOK.grenade) HOOK.grenade();
  else if (k === 'KeyN') setVision(VIS.mode === 'off' ? 'nvg' : VIS.mode === 'nvg' ? 'thermal' : 'off');
  else if (k === 'KeyH' && HOOK.medkit) HOOK.medkit();
  else if (k === 'KeyT' && HOOK.squadMenu) HOOK.squadMenu();
  else if (k === 'KeyU' && HOOK.use) HOOK.use();
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
  else if (/^Digit[0-9]$/.test(k)) { if (HOOK.canSwitch && !HOOK.canSwitch()) return; if (HOOK.battle) { const l = weaponChoices(), i = l[(+k.slice(5) + 9) % 10]; if (i != null) selectRifle(i); } else { const i = (+k.slice(5) + 9) % 10; if (!RIFLES[i].mounted) selectRifle(i); } }
  else if (k === 'KeyG' && HOOK.callArt) HOOK.callArt();
  else if (k === 'KeyL') toggleLaser();
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; if (e.code === 'Space') fireHeld = false; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') BR.hold = false; });

/* ---------------- обновление игрока, качание, отдача ---------------- */
function updatePlayer(dt) {
  let mx = input.mx, my = input.my;
  const K = input.keys;
  if (K.KeyW) my += 1; if (K.KeyS) my -= 1; if (K.KeyA) mx -= 1; if (K.KeyD) mx += 1;
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  const st = stOf();
  if (HOOK.dead) { mx = 0; my = 0; }
  const wantRun = (K.ShiftLeft || K.ShiftRight || P.runLock || (IS_TOUCH && input.my > 0.95)) && my > 0.5 && AIM.mode === 'hip' && P.stance === 0;
  P.sprint = wantRun && Math.hypot(mx, my) > 0.3;
  const sp = (P.sprint ? (P.robot ? 9.5 : 7.4) : st.speed * (AIM.mode === 'hip' ? 1 : 0.45)) * (HOOK.speedMul || 1);
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  P.x += (mx * cy - my * sy) * sp * dt;
  P.z += (-mx * sy - my * cy) * sp * dt;
  if (HOOK.battle) { P.x = clamp(P.x, -700, 700); P.z = clamp(P.z, -2300, 560); } else { P.x = clamp(P.x, -160, 160); P.z = clamp(P.z, -320, 90); }
  if (HOOK.chute) { P.vy = -5.5; P.jy = Math.max(0, P.jy - 5.5 * dt); if (P.jy <= 0) { landDip = 0.22; P.vy = 0; if (HOOK.land) HOOK.land(); } }
  else if (P.jy > 0 || P.vy > 0) { P.vy -= (P.vy > 0 ? 24 : 38) * dt; P.jy += P.vy * dt; if (P.jy <= 0) { landDip = clamp(-P.vy * 0.022, 0.05, 0.24); SHAKE.a += 0.012; P.jy = 0; P.vy = 0; if (HOOK.land) HOOK.land(); } }
  if (HOOK.move) HOOK.move();
  P.moving = lerp(P.moving, Math.min(1, Math.hypot(mx, my)), dt * 6);
  P.eye = lerp(P.eye, st.eye, Math.min(1, dt * (st.eye < P.eye ? 16 : 9)));
  const pb = P.bob; P.bob += dt * sp * 2.2 * P.moving;
  if (AC && S.sound && P.moving > 0.3 && P.jy <= 0 && Math.floor(pb / Math.PI) !== Math.floor(P.bob / Math.PI)) {
    const t = AC.currentTime, k = P.sprint ? 1.4 : P.stance ? 0.5 : 1;
    if (P.robot) { noiseHit(t, 0.09, 'lowpass', 260, 0.35 * k); tone(t + 0.01, 1900 + Math.random() * 400, 0.05, 0.05 * k, 'triangle'); tone(t, 900, 0.06, 0.04 * k, 'square', 600); }
    else { noiseHit(t, 0.09, 'bandpass', 900 + Math.random() * 500, 0.16 * k, 1.2); noiseHit(t + 0.03, 0.12, 'highpass', 3000, 0.05 * k); }
  }
}
function updateSway(dt) {
  const st = stOf();
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
  const amp = st.sway * (1 + P.moving * 2.5) * BR.factor * (curRifle().mounted ? 0.15 : 1) * (1 + SUP.v * 0.9);
  const tr = st.tremor * (0.45 + 0.55 * BR.factor) * (1 + P.moving);
  const tt = simT;
  const heart = Math.pow(Math.max(0, Math.sin(tt * TAU * 1.25)), 12) * 0.25 * st.tremor;
  SW.x = amp * (Math.sin(BR.phase) * 0.8 + 0.3 * Math.sin(BR.phase * 2.7 + 1.3)) + tr * (vnoise(tt * 5, 1.1) - 0.5) * 2;
  SW.y = amp * Math.sin(BR.phase * 2) * 0.45 + tr * (vnoise(tt * 5, 7.7) - 0.5) * 2 + heart;
  // отдача: затухающая пружина
  REC.v += (-120 * REC.k - 19 * REC.v) * dt;
  REC.k += REC.v * dt;
  cycleT = Math.max(0, cycleT - dt);
  if (reloadT > 0) { reloadT -= dt; if (reloadT <= 0) { reloadT = 0; const st = curTur(); st.ammo = curRifle().mag; if (st.reserve != null) st.reserve = Math.max(0, st.reserve - 1); else if (st.mags != null) st.mags = Math.max(0, st.mags - 1); updateWeaponUI(); } }
}
function applyCamera(dt) {
  const gy = terrainH(P.x, P.z);
  const run = P.sprint ? 2.2 : 1;
  const bob = AIM.mode === 'hip' ? Math.sin(P.bob * 2) * 0.035 * P.moving * run : 0;
  const sc = curScope(), rf = curRifle();
  const ironT = AIM.mode === 'scope' && sc.iron ? 1 : 0;
  AIM.blend += (ironT - AIM.blend) * Math.min(1, dt * 11);
  SHAKE.a *= Math.exp(-dt * 3.5);
  const shk = S.shake === false ? 0 : SHAKE.a;
  const shx = (vnoise(simT * 23, 3.1) - 0.5) * shk, shy = (vnoise(simT * 23, 8.7) - 0.5) * shk;
  P.leanV += ((P.stance === 2 || curRifle().mounted ? 0 : P.lean) - P.leanV) * Math.min(1, dt * 8);
  const lx = Math.cos(P.yaw) * 0.38 * P.leanV, lz = -Math.sin(P.yaw) * 0.38 * P.leanV;
  landDip *= Math.exp(-dt * 13);
  camera.position.set(P.x + lx, gy + P.eye + bob + P.jy - landDip - Math.abs(P.leanV) * 0.06 + (HOOK.camDY || 0) + (HOOK.climbY ? HOOK.climbY(P.x, P.z) : 0), P.z + lz);
  camera.rotation.y = P.yaw - SW.x * 0.001 + shx;
  camera.rotation.x = P.pitch + SW.y * 0.001 + REC.k + shy;
  camera.rotation.z = (HOOK.camRoll || 0) - P.leanV * 0.17;
  PUNCH *= Math.exp(-dt * 10);
  let fov = fovFor(AIM.mode) * (1 + PUNCH * 0.012);
  if (sc.iron && (AIM.mode === 'scope' || AIM.blend > 0.01)) fov = lerp(S.fov || 65, sc.fov, AIM.blend);
  if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const hip = rf.type === 'sniper' ? HIP_S : rf.type === 'rocket' ? HIP_R : HIP_I;
  const k = AIM.blend, mv = P.moving * (1 - k) * run;
  if (AIM.mode === 'scope' && sc.iron && !sc.dot) rifleHolder.visible = AIM.blend < 0.8;
  rifleHolder.position.set(
    lerp(hip.x, ADS.x, k) + Math.sin(P.bob) * 0.012 * mv,
    lerp(hip.y, ADS.y, k) + Math.abs(Math.cos(P.bob)) * 0.012 * mv - (P.sprint ? 0.06 : 0),
    lerp(hip.z, ADS.z, k) + REC.k * (k > 0.5 ? 0.25 : 0.6));
  rifleHolder.rotation.set(REC.k * (k > 0.5 ? 0.6 : 2) + (P.sprint ? -0.5 : 0), P.sprint ? 0.6 : 0, 0);
  { // перезарядка: оружие уходит вниз и набок, магазин меняется; у магазинных винтовок — ход затвора
    const rl = reloadT > 0 ? Math.sin(Math.PI * clamp(1 - reloadT / reloadDur, 0, 1)) : 0;
    const bolt = rf.type === 'sniper' && !rf.semi && cycleT > 0 && rf.cycle ? Math.sin(Math.PI * clamp(1 - cycleT / rf.cycle, 0, 1)) : 0;
    rifleHolder.rotation.z += rl * 0.6 + bolt * 0.25; rifleHolder.rotation.x -= rl * 0.4 + bolt * 0.08;
    rifleHolder.position.y -= rl * 0.08; rifleHolder.position.x -= rl * 0.035;
  }
}

/* ---------------- окружение ---------------- */
const AMB = { t: 3 };
function ambience(dt) {
  if (!AC || !S.sound || !started) return;
  AMB.t -= dt; if (AMB.t > 0) return;
  const W = WEATHER[S.weather] || {}, t = AC.currentTime;
  if (!W.night && !W.rain) {
    AMB.t = 7 + Math.random() * 14;
    const f0 = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(t + i * (0.09 + Math.random() * 0.05), f0 * (1 + (Math.random() - 0.5) * 0.15), 0.07, 0.014, 'sine', f0 * (0.75 + Math.random() * 0.5));
    if (Math.random() < 0.25) { const f = 1100 + Math.random() * 300; tone(t + 0.6, f, 0.35, 0.02, 'sine', f * 1.6); tone(t + 1.0, f * 1.5, 0.3, 0.015, 'sine', f); }
  } else if (W.night) {
    AMB.t = 0.8 + Math.random() * 2.2;
    for (let i = 0; i < 3; i++) tone(t + i * 0.07, 4300 + Math.random() * 500, 0.035, 0.012, 'sine');
  } else AMB.t = 5;
}
function updateEnv(dt) {
  ambience(dt);
  const w = windAt(P.z, simT);
  grassU.uTime.value = simT;
  grassU.uNear.value = lerp(grassU.uNear.value, P.stance === 2 ? 6 : P.stance === 1 ? 3.2 : 2.4, dt * 3);
  grassU.uWind.value.set(w[0] * 0.035, w[1] * 0.035);
  updateGrass(P.x, P.z);
  sky.position.copy(camera.position);
  if (Q.sh) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), st = 96 / Q.sh * 4;
    const cx = Math.round((camera.position.x + fx * 26) / st) * st, cz = Math.round((camera.position.z + fz * 26) / st) * st;
    sun.target.position.set(cx, terrainH(cx, cz), cz);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 220);
  } else sun.position.copy(SUN_DIR);
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
  const st = [stOf().name];
  if (reloadT > 0) st.push('перезарядка'); else if (cycleT > 0 && !curRifle().semi) st.push('затвор');
  if (P.sprint) st.push('бег');
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
  if (type === 'mildot' || type === 'lpvo') {
    line(cx, cy, k, -E, 0, E, 0); line(cx, cy, k, 0, -E, 0, E);
    o.lineWidth = Math.max(lw, 0.5 * k);
    line(cx, cy, k, -E, 0, -5, 0); line(cx, cy, k, 5, 0, E, 0); line(cx, cy, k, 0, 5, 0, E); line(cx, cy, k, 0, -E, 0, -5);
    for (let i = -4; i <= 4; i++) if (i) { dot(cx, cy, k, i, 0, 0.125); dot(cx, cy, k, 0, i, 0.125); }
    if (type === 'lpvo') { o.fillStyle = 'rgba(255,50,30,.95)'; o.shadowColor = 'rgba(255,50,30,.8)'; o.shadowBlur = 5 * OVD; o.beginPath(); o.arc(cx, cy, Math.max(1.6 * OVD, 0.18 * k), 0, TAU); o.fill(); o.shadowBlur = 0; }
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
  } else if (type === 'acog') {
    const rf = curRifle(), st = curTur(), base = stdElev(rf, st.drum * 100);
    o.lineWidth = Math.max(lw * 2.4, 0.3 * k); line(cx, cy, k, -E, 0, -7, 0); line(cx, cy, k, 7, 0, E, 0); line(cx, cy, k, 0, 7, 0, E);
    o.lineWidth = lw; line(cx, cy, k, -7, 0, -1.6, 0); line(cx, cy, k, 1.6, 0, 7, 0); line(cx, cy, k, 0, 1.6, 0, 7);
    for (let i = 1; i <= 6; i++) { line(cx, cy, k, i, -0.35, i, 0.35); line(cx, cy, k, -i, -0.35, -i, 0.35); }
    // отметки превышения для следующих сотен метров от выставленной дальности
    for (let n = 1; n <= 4; n++) {
      const D = (st.drum + n) * 100; if (st.drum + n > (curScope().drumMax || 8)) break;
      const off = (stdElev(rf, D) - base) * 1000 + 1.6; line(cx, cy, k, -1.1, off, 1.1, off);
      o.font = Math.max(9, 10 * OVD) + 'px sans-serif'; o.fillText(String(st.drum + n), cx + 2.2 * k, cy + off * k);
    }
    o.strokeStyle = 'rgba(255,60,30,.97)'; o.shadowColor = 'rgba(255,60,30,.9)'; o.shadowBlur = 7 * OVD; o.lineWidth = Math.max(lw * 1.8, 0.28 * k);
    o.beginPath(); o.moveTo(cx - 1.5 * k, cy + 1.9 * k); o.lineTo(cx, cy); o.lineTo(cx + 1.5 * k, cy + 1.9 * k); o.stroke(); o.shadowBlur = 0;
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
function drawPGO(cx, cy, k) {
  const t = UNIT.thou / 0.001;
  o.strokeStyle = 'rgba(12,12,12,.95)'; o.fillStyle = 'rgba(12,12,12,.95)'; o.lineWidth = 1.3 * OVD; o.textAlign = 'center'; o.textBaseline = 'middle';
  const el = HOOK.rocketElev || (() => 0);
  line(cx, cy, k, 0, -6 * t, 0, el(500) * 1000 + 3 * t);
  for (let D = 100; D <= 500; D += 100) {
    const y = el(D) * 1000;
    o.beginPath(); o.moveTo(cx - 1.4 * t * k, cy + (y + 1.4 * t) * k); o.lineTo(cx, cy + y * k); o.lineTo(cx + 1.4 * t * k, cy + (y + 1.4 * t) * k); o.stroke();
    if (D > 100) label(cx, cy, k, -3.2 * t, y + 0.6 * t, String(D / 100), 11);
    if (D % 200 === 0 || D === 300 || D === 500) for (let i = -3; i <= 3; i++) if (i) line(cx, cy, k, i * 10 * t, y, i * 10 * t, y + (i % 2 ? 0.8 : 1.5) * t);
  }
  // дальномерная шкала под цель высотой 2,4 м (боевой робот)
  const bx = -28 * t, by = 22 * t; line(cx, cy, k, bx, by, bx + 16 * t, by);
  o.beginPath();
  for (let D = 200; D <= 500; D += 20) { const x = bx + (D - 200) / 300 * 16 * t, h = 2.4 / D * 1000; const X = cx + x * k, Y = cy + (by - h) * k; if (D === 200) o.moveTo(X, Y); else o.lineTo(X, Y); }
  o.stroke();
  for (let D = 200; D <= 500; D += 100) { const x = bx + (D - 200) / 300 * 16 * t; line(cx, cy, k, x, by, x, by + 0.6 * t); label(cx, cy, k, x, by + 1.8 * t, String(D / 100), 10); }
}
const HOLO = { t: -1, d: null };
function drawHolo(W, H, k) {
  const cx = W / 2, cy = H / 2;
  const vg = o.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(255,90,40,0.03)'); vg.addColorStop(1, 'rgba(40,8,0,0.6)'); o.fillStyle = vg; o.fillRect(0, 0, W, H);
  o.fillStyle = 'rgba(255,120,60,0.05)'; for (let y = 0; y < H; y += 4 * OVD) o.fillRect(0, y, W, OVD);
  const col = 'rgba(255,150,80,0.95)';
  o.strokeStyle = col; o.fillStyle = col; o.lineWidth = 1.4 * OVD; o.textAlign = 'center'; o.textBaseline = 'middle';
  o.beginPath(); o.arc(cx, cy, 6 * k, 0, TAU); o.stroke();
  o.beginPath(); o.arc(cx, cy, 1.4 * OVD, 0, TAU); o.fill();
  [-1, 1].forEach((sg) => { line(cx, cy, k, sg * 8, 0, sg * 30, 0); line(cx, cy, k, 0, sg * 8, 0, sg * (sg > 0 ? 30 : 14)); for (let i = 10; i <= 30; i += 5) line(cx, cy, k, sg * i, -0.8, sg * i, 0.8); });
  for (let i = 10; i <= 30; i += 5) line(cx, cy, k, -0.8, i, 0.8, i);
  if (simT - HOLO.t > 0.2 || simT < HOLO.t) { HOLO.t = simT; HOLO.d = rangeAt(); }
  const rf = curRifle();
  o.font = '600 ' + 13 * OVD + 'px monospace';
  if (HOLO.d) {
    const need = rf.type === 'rocket' ? (HOOK.rocketElev ? HOOK.rocketElev(HOLO.d) : 0) : stdElev(rf, HOLO.d) + zeroAngle(rf) - zeroAngle(rf);
    const off = (need - elevRad()) * 1000;
    const y = cy + off * k;
    o.beginPath(); o.moveTo(cx, y - 6 * OVD); o.lineTo(cx + 6 * OVD, y); o.lineTo(cx, y + 6 * OVD); o.lineTo(cx - 6 * OVD, y); o.closePath(); o.stroke();
    o.fillText('Д ' + Math.round(HOLO.d) + ' м', cx + 70 * OVD, cy - 22 * OVD);
    o.fillText('▼ ' + off.toFixed(1) + ' мрад', cx + 70 * OVD, cy - 6 * OVD);
  } else o.fillText('Д ---', cx + 70 * OVD, cy - 22 * OVD);
  const st = curTur();
  o.fillText(AIM.zoom.toFixed(1).replace('.0', '') + '×   ' + (reloadT > 0 ? 'ПЕРЕЗАРЯДКА' : st.ammo + '/' + rf.mag), cx, H - 34 * OVD);
  o.font = 11 * OVD + 'px monospace'; o.fillText('БАЛЛИСТИЧЕСКИЙ ВЫЧИСЛИТЕЛЬ · ◆ — точка попадания', cx, 70 * OVD);
}
function rrPath(x, y, w, h, r) { o.moveTo(x + r, y); o.arcTo(x + w, y, x + w, y + h, r); o.arcTo(x + w, y + h, x, y + h, r); o.arcTo(x, y + h, x, y, r); o.arcTo(x, y, x + w, y, r); o.closePath(); }
// настоящий коллиматор: корпус с окном, стекло с бликом, подсвеченная марка с параллаксом
function drawCollimator(W, H) {
  const a = clamp((AIM.blend - 0.3) / 0.7, 0, 1); if (a < 0.02) return;
  const sc = curScope(), holo = !!sc.holo, cx = W / 2, cy = H / 2;
  const ww = H * (holo ? 0.92 : 0.78), wh = H * (holo ? 0.52 : 0.44), f = H * 0.016, r = H * 0.045;
  const night = !!(WEATHER[S.weather] && WEATHER[S.weather].night);
  o.save(); o.globalAlpha = a;
  o.beginPath(); rrPath(cx - ww / 2 - f, cy - wh / 2 - f, ww + 2 * f, wh + 2 * f, r + f); rrPath(cx - ww / 2, cy - wh / 2, ww, wh, r);
  const mg = o.createLinearGradient(0, cy - wh / 2 - f, 0, cy + wh / 2 + f); mg.addColorStop(0, '#34373b'); mg.addColorStop(0.5, '#151618'); mg.addColorStop(1, '#26282b');
  o.fillStyle = mg; o.fill('evenodd');
  o.beginPath(); rrPath(cx - ww / 2, cy - wh / 2, ww, wh, r); o.strokeStyle = 'rgba(170,180,190,.3)'; o.lineWidth = 1.3 * OVD; o.stroke();
  o.fillStyle = 'rgba(110,150,200,.05)'; o.fill();
  o.save(); o.clip(); const gl = o.createLinearGradient(cx - ww / 2, cy - wh / 2, cx - ww * 0.1, cy + wh / 2); gl.addColorStop(0, 'rgba(255,255,255,.13)'); gl.addColorStop(0.35, 'rgba(255,255,255,0)'); o.fillStyle = gl; o.fillRect(cx - ww / 2, cy - wh / 2, ww, wh); o.restore();
  // марка: небольшой параллакс от отдачи и тряски
  const px = cx + SW.x * 0.06 * OVD, py = cy - REC.k * 260 * OVD + SW.y * 0.06 * OVD;
  o.shadowColor = 'rgba(255,40,28,.95)'; o.shadowBlur = (night ? 12 : 7) * OVD; o.fillStyle = 'rgba(255,48,32,.97)'; o.strokeStyle = 'rgba(255,48,32,.95)';
  o.beginPath(); o.arc(px, py, (holo ? 2.2 : 3.8) * OVD, 0, TAU); o.fill();
  if (holo) {
    const rr = H * 0.085; o.lineWidth = 2 * OVD; o.beginPath(); o.arc(px, py, rr, 0, TAU); o.stroke();
    o.lineWidth = 2 * OVD; [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([x, y]) => { o.beginPath(); o.moveTo(px + x * rr, py + y * rr); o.lineTo(px + x * (rr + H * 0.028), py + y * (rr + H * 0.028)); o.stroke(); });
  }
  o.restore();
}
// открытый прицел: размытый целик крупным планом и чёткая мушка с намушником
function drawIronSights(W, H) {
  const a = clamp((AIM.blend - 0.35) / 0.65, 0, 1); if (a < 0.02) return;
  const id = curScope().id, cx = W / 2, cy = H / 2 + REC.k * 120 * OVD, u = H / 78;
  const night = !!(WEATHER[S.weather] && WEATHER[S.weather].night), lit = night ? 0.55 : 1;
  o.save(); o.globalAlpha = a;
  const shade = (y0, y1) => { const g = o.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgb(' + (46 * lit | 0) + ',' + (45 * lit | 0) + ',' + (43 * lit | 0) + ')'); g.addColorStop(0.18, 'rgb(' + (24 * lit | 0) + ',' + (24 * lit | 0) + ',' + (23 * lit | 0) + ')'); g.addColorStop(1, 'rgb(10,10,10)'); return g; };
  if (id === 'iron_m4') {
    // диоптр: кольцо вокруг отверстия, мушка в треугольном щитке
    const R0 = 3.3 * u, R1 = 17 * u;
    const rg = o.createRadialGradient(cx, cy, R0 * 0.8, cx, cy, R1); rg.addColorStop(0, 'rgba(8,8,8,0)'); rg.addColorStop(0.2, 'rgba(8,8,8,.5)'); rg.addColorStop(0.3, 'rgba(10,10,10,.96)'); rg.addColorStop(1, 'rgba(14,14,14,.98)');
    o.fillStyle = rg; o.beginPath(); o.arc(cx, cy, R1, 0, TAU); o.fill();
    o.fillStyle = shade(cy, cy + 30 * u); o.beginPath(); rrPath(cx - 14 * u, cy + 12 * u, 28 * u, 30 * u, 4 * u); o.fill();
    o.fillStyle = '#0b0b0b'; o.fillRect(cx - 0.55 * u, cy - 0.2 * u, 1.1 * u, 6.5 * u);
    o.fillRect(cx - 3.3 * u, cy - 3 * u, 1.1 * u, 9 * u); o.fillRect(cx + 2.2 * u, cy - 3 * u, 1.1 * u, 9 * u);
    o.fillStyle = 'rgba(190,190,180,.25)'; o.fillRect(cx - 0.55 * u, cy - 0.2 * u, 0.25 * u, 6 * u);
  } else {
    const hood = id === 'iron_pkm' || id === 'iron_kord';
    const sh = 12.5 * u, nw = 3.1 * u, nd = 5.4 * u;
    o.shadowColor = 'rgba(0,0,0,.8)'; o.shadowBlur = 5 * OVD;
    o.fillStyle = shade(cy, H);
    o.beginPath(); o.moveTo(cx - sh, cy); o.lineTo(cx - nw, cy); o.lineTo(cx - nw * 0.55, cy + nd); o.lineTo(cx + nw * 0.55, cy + nd); o.lineTo(cx + nw, cy); o.lineTo(cx + sh, cy); o.lineTo(cx + sh + 0.8 * u, cy + 1.2 * u); o.lineTo(cx + sh * 1.5, H); o.lineTo(cx - sh * 1.5, H); o.lineTo(cx - sh - 0.8 * u, cy + 1.2 * u); o.closePath(); o.fill();
    o.shadowBlur = 0;
    // блик на кромке и риски шкалы дальности
    o.strokeStyle = 'rgba(200,200,190,.28)'; o.lineWidth = 1.2 * OVD; o.beginPath(); o.moveTo(cx - sh, cy + 0.4 * u); o.lineTo(cx - nw, cy + 0.4 * u); o.moveTo(cx + nw, cy + 0.4 * u); o.lineTo(cx + sh, cy + 0.4 * u); o.stroke();
    o.strokeStyle = 'rgba(230,230,220,.16)'; o.lineWidth = 1 * OVD;
    for (let i = 0; i < 6; i++) { const x = cx + (nw + 2.2 * u + i * 2 * u); o.beginPath(); o.moveTo(x, cy + 2.2 * u); o.lineTo(x, cy + (i % 2 ? 3.2 : 4.2) * u); o.moveTo(2 * cx - x, cy + 2.2 * u); o.lineTo(2 * cx - x, cy + (i % 2 ? 3.2 : 4.2) * u); o.stroke(); }
    // мушка и намушник
    o.fillStyle = '#0a0a0a'; o.fillRect(cx - 0.65 * u, cy, 1.3 * u, nd + 0.5 * u);
    o.fillStyle = 'rgba(200,200,190,.3)'; o.fillRect(cx - 0.65 * u, cy, 0.25 * u, nd);
    o.fillStyle = '#0d0d0d'; o.fillRect(cx - 2.9 * u, cy - 2.2 * u, 1.0 * u, nd + 2.2 * u); o.fillRect(cx + 1.9 * u, cy - 2.2 * u, 1.0 * u, nd + 2.2 * u);
    if (hood) { o.strokeStyle = '#0b0b0b'; o.lineWidth = 1.2 * u; o.beginPath(); o.arc(cx, cy + 2.4 * u, 3.5 * u, Math.PI * 1.05, Math.PI * 1.95); o.stroke(); }
  }
  o.restore();
}
function drawOverlay() {
  const W = ov.width, H = ov.height;
  o.clearRect(0, 0, W, H);
  const k = mrPx();
  const isc = curScope();
  if (AIM.mode === 'scope' && isc.iron && isc.dot) drawCollimator(W, H);
  else if (AIM.mode === 'scope' && isc.iron) drawIronSights(W, H);
  if (AIM.mode === 'scope' && isc.iron) {
    // открытый прицел: только лёгкое затемнение краёв
    const vg = o.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + ((isc.dot ? 0.18 : 0.3) * AIM.blend).toFixed(3) + ')'); o.fillStyle = vg; o.fillRect(0, 0, W, H);
    const st = curTur(); o.textAlign = 'center'; o.font = '600 ' + 11 * OVD + 'px monospace';
    { const tx = (isc.dot ? '' : 'ПРИЦЕЛ ' + st.drum + ' (' + st.drum * 100 + ' м)   ') + (reloadT > 0 ? 'перезарядка' : st.ammo + '/' + curRifle().mag + (st.mags != null ? ' · ' + st.mags : '')), tw = o.measureText(tx).width + 20 * OVD, ty = H - 20 * OVD; o.fillStyle = 'rgba(8,10,6,.5)'; o.beginPath(); rrPath(W / 2 - tw / 2, ty - 10 * OVD, tw, 20 * OVD, 10 * OVD); o.fill(); o.fillStyle = 'rgba(242,169,59,.95)'; o.textBaseline = 'middle'; o.fillText(tx, W / 2, ty); }
  } else if (AIM.mode === 'scope' && isc.ret === 'holo') {
    drawHolo(W, H, k);
  } else if (AIM.mode === 'scope') {
    const R = Math.min(W, H) * 0.47;
    const cx = W / 2 + REC.k * 900 * OVD * 0, cy = H / 2 - REC.k * 2200 * OVD * 0.3;
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'destination-out'; o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.fill(); o.globalCompositeOperation = 'source-over';
    const vg = o.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.85)'); o.fillStyle = vg; o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.fill();
    // обод окуляра, блик и лёгкий оттенок линзы
    { const rimW = R * 0.07, rg = o.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rg.addColorStop(0, '#41454b'); rg.addColorStop(0.5, '#141518'); rg.addColorStop(1, '#2d3035');
      o.strokeStyle = rg; o.lineWidth = rimW; o.beginPath(); o.arc(cx, cy, R + rimW / 2 - 1, 0, TAU); o.stroke();
      o.strokeStyle = 'rgba(175,185,200,.38)'; o.lineWidth = 1.5 * OVD; o.beginPath(); o.arc(cx, cy, R - 1, 0, TAU); o.stroke();
      const gl = o.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 1, cx - R * 0.45, cy - R * 0.5, R * 0.55); gl.addColorStop(0, 'rgba(255,255,255,.11)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      o.fillStyle = gl; o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.fill();
      o.fillStyle = 'rgba(120,170,210,.035)'; o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.fill(); }
    o.save(); o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.clip();
    if (isc.ret === 'pgo') drawPGO(W / 2, H / 2, k); else drawReticle(isc.ret, W / 2, H / 2, k, R);
    o.restore();
    // подписи под окуляром
    const sc = curScope(), st = curTur();
    o.textAlign = 'center'; o.font = '600 ' + 12 * OVD + 'px monospace';
    const ev = sc.rocket ? 'ПГО-7' : sc.unit === 'thou' ? 'ПРИЦЕЛ ' + st.drum : '▲' + fmt(st.e * sc.click, sc.unit === 'moa' ? 2 : 1);
    const am = reloadT > 0 ? 'перезарядка' : st.ammo + '/' + curRifle().mag + (st.mags != null ? ' · ' + st.mags : '');
    const tx = am + '   ' + AIM.zoom.toFixed(1).replace('.0', '') + '×   ' + ev + (sc.maxW ? '   ◀▶' + fmt(st.w * sc.click, 1) + ' ' + UNAME[sc.unit] : '');
    { const tw = o.measureText(tx).width + 22 * OVD, ty = cy + R * 0.88; o.fillStyle = 'rgba(8,10,6,.6)'; o.beginPath(); rrPath(W / 2 - tw / 2, ty - 11 * OVD, tw, 22 * OVD, 11 * OVD); o.fill(); o.fillStyle = 'rgba(242,169,59,.97)'; o.textBaseline = 'middle'; o.fillText(tx, W / 2, ty); }
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
    const T = HOOK.battle ? null : binoTarget();
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
  if (HM.t > 0) {
    const a = Math.min(1, HM.t * 3), r1 = 7 * OVD, r2 = 15 * OVD, cx = W / 2, cy = H / 2;
    o.strokeStyle = HM.kind === 'kill' ? 'rgba(255,70,50,' + a + ')' : HM.kind === 'ric' ? 'rgba(255,210,90,' + a + ')' : 'rgba(255,255,255,' + a + ')';
    o.lineWidth = (HM.kind === 'kill' ? 3 : 2) * OVD;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sy]) => { o.beginPath(); o.moveTo(cx + sx * r1, cy + sy * r1); o.lineTo(cx + sx * r2, cy + sy * r2); o.stroke(); });
  }
  if (SUP.v > 0.05 && AIM.mode !== 'scope') {
    const a = Math.min(0.55, SUP.v * 0.38), vg = o.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.42 - Math.min(0.2, SUP.v * 0.12)), W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,4,' + a.toFixed(3) + ')'); o.fillStyle = vg; o.fillRect(0, 0, W, H);
  }
  if (HOOK.drawOverlay) HOOK.drawOverlay(o, W, H, OVD);
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
    if (r.mounted) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rc' + (i === S.rifle ? ' on' : '');
    const kind = r.org === 'BOT' ? 'робот' : r.type === 'auto' ? (r.id === 'pkm' ? 'пулемёт' : 'автомат') : r.type === 'rocket' ? 'гранатомёт' : 'снайперская';
    const desc = r.org === 'BOT' ? (r.type === 'rocket' ? '4 ракеты в пакете · до 500 м<br>цифровой прицел с вычислителем' : r.type === 'sniper' ? 'V0 ' + r.mv + ' м/с · полуавтомат<br>цифровой прицел' : 'V0 ' + r.mv + ' м/с · ' + r.rpm + ' выстр/мин<br>цифровой прицел с вычислителем') :
      r.type === 'rocket' ? 'V0 117 → 295 м/с · до 500 м<br>ПГО-7, кумулятивная граната' :
      r.type === 'auto' ? 'V0 ' + r.mv + ' м/с · ' + r.rpm + ' выстр/мин<br>открытый прицел (мушка) · ' + r.mag + ' патр.' :
      'V0 ' + r.mv + ' м/с · БК G7 ' + r.bc.toFixed(3) + '<br>' + (r.semi ? 'самозарядная' : 'продольно-скользящий затвор') + ' · ' + r.mag + ' патр.';
    b.innerHTML = '<div class="t"><span class="n">' + r.name + '</span><span class="o ' + (r.org === 'RU' ? 'ru' : r.org === 'BOT' ? 'bot' : 'nato') + '">' + kind + '</span></div>' +
      '<div class="c">' + r.cal + '</div>' +
      '<div class="d">' + desc + '</div>';
    b.addEventListener('click', () => { S.rifle = i; save(); renderMenu(); });
    g.appendChild(b);
  });
  const rf = curRifle();
  if (rf.type === 'sniper') chips($('mScopes'), Object.values(SCOPES).filter((s) => !s.iron && !s.rocket).map((s) => [s.id, s.name]), scopeOf(rf).id, (id) => { S.scopes[rf.id] = id; const st = TUR[rf.id]; st.e = 0; st.w = 0; st.drum = 1; st.zoom = null; save(); renderMenu(); });
  else if (rf.type === 'auto' && rf.org !== 'BOT') chips($('mScopes'), [[rf.scope, SCOPES[rf.scope].name + ' (штатный)']].concat(AUTO_SC.map((k) => [k, SCOPES[k].name + (k === 'pso' ? ' 4×' : '')])), scopeOf(rf).id, (id) => { S.scopes[rf.id] = id === rf.scope ? null : id; save(); renderMenu(); });
  else chips($('mScopes'), [[scopeOf(rf).id, scopeOf(rf).name + ' — штатный']], scopeOf(rf).id, () => {});
  chips($('mGmode'), [['range', 'Стрельбище'], ['battle', 'Бой: высота против роботов']], S.gmode, (id) => { if (id === S.gmode) return; S.gmode = id; S.autostart = true; save(); location.reload(); });
  $('teamRow').hidden = S.gmode !== 'battle';
  chips($('mFoe'), [['bot', 'Люди против роботов'], ['man', 'Люди против людей']], S.foe || 'bot', (id) => { S.foe = id; save(); renderMenu(); });
  const pvp = S.foe === 'man';
  chips($('mSide'), pvp ? [['h', 'Играть за зелёных'], ['r', 'Играть за серых']] : [['h', 'Играть за людей'], ['r', 'Играть за роботов']], S.side, (id) => { S.side = id; save(); renderMenu(); });
  if ($('mMap')) { $('mMap').hidden = S.scen !== 'wall'; if (HOOK.wmaps) chips($('mMap'), Object.entries(HOOK.wmaps).filter(([k, v]) => !v.hidden).map(([k, v]) => [k, 'Карта: ' + v.name]), S.map || 'field', (id) => { S.map = id; save(); renderMenu(); }); }
  chips($('mScen'), [['def', pvp ? 'Зелёные обороняют высоту' : 'Люди обороняют высоту'], ['att', pvp ? 'Зелёные штурмуют (десант за 500 м)' : 'Люди штурмуют (десант за 500 м)'], ['wall', 'Стенка на стенку (поле)'], ['points', 'Война за точки (А–Е)']], S.scen || 'def', (id) => { S.scen = id; save(); renderMenu(); });
  const roles = S.side === 'r' && S.foe !== 'man' ? [['assault', 'Штурмовик'], ['heavy', 'Тяжёлый пулемётчик'], ['rocket', 'Ракетчик'], ['scout', 'Разведчик-снайпер']] : [['rifle', 'Стрелок'], ['mg', 'Пулемётчик'], ['sniper', 'Снайпер'], ['rpg', 'Гранатомётчик'], ['medic', 'Санитар'], ['mortar', 'Миномётчик'], ['lead', 'Командир тройки'], ['captain', 'Капитан взвода']];
  if (!roles.some((r) => r[0] === S.role)) S.role = roles[0][0];
  chips($('mRole'), roles, S.role, (id) => { S.role = id; save(); renderMenu(); });
  $('mRoleNote').textContent = HOOK.roleInfo ? HOOK.roleInfo(S.side, S.role) : '';
  $('mNH').value = S.nH || 18; $('mNR').value = S.nR || 6;

  if ($('mNH').previousSibling) $('mNH').previousSibling.textContent = pvp ? 'Зелёных ' : 'Людей '; if ($('mNR').previousSibling) $('mNR').previousSibling.textContent = pvp ? 'Серых ' : 'Роботов ';
  $('gmodeNote').textContent = S.gmode === 'battle'
    ? 'Высота с траншеями, лагерь, «Корды» и миномёты. Оборона: тревога, люди бегут из лагеря по позициям, роботы подходят из-за холмов в 2 км под дымом. Штурм: артподготовка, дымовая стена и десант людей в 500 м. Выберите сторону, численность (до 50) и роль со своей задачей.'
    : 'Мишени от 100 до 1500 м, разбор каждого выстрела.';
  $('bRestart').hidden = !(started && S.gmode === 'battle');
  chips($('mWeather'), Object.entries(WEATHER).map(([k, w]) => [k, w.name + ' ' + (w.t > 0 ? '+' : '') + w.t + '°']), S.weather, (id) => { S.weather = id; save(); applyConditions(); applyWeatherVisuals(); renderMenu(); });
  chips($('mWind'), Object.entries(WINDS).map(([k, w]) => [k, w.name]), S.wind, (id) => { S.wind = id; save(); newWind(); renderMenu(); });
  chips($('mMode'), [['train', 'Тренировка'], ['real', 'Реализм']], S.mode, (id) => { S.mode = id; save(); applyMode(); renderMenu(); });
  $('modeNote').textContent = S.mode === 'train'
    ? 'Показываются скорость ветра, таблички дистанций и разбор каждого выстрела с нужной поправкой.'
    : 'Ветер читайте по флажкам и траве, дистанцию — дальномером, попадания ищите в бинокль.';
  chips($('mQual'), Object.entries(QUALITY).map(([k, q]) => [k, q.name]), S.quality, (id) => { if (id === S.quality) return; S.quality = id; save(); location.reload(); });
  $('bVision').hidden = false;
  const OPT = [['tracers', 'Трассеры'], ['bcam', 'Камера пули'], ['sound', 'Звук'], ['vibro', 'Вибро'], ['assist', 'Помощник прицеливания'], ['labels', 'Подписи кнопок'], ['shake', 'Тряска камеры'], ['dynres', 'Авто-разрешение'], ['cap30', 'Экономия: 30 к/с'], ['fps', 'Показывать FPS'], ['gyroInv', 'Инверсия гироскопа'], ['mortars', 'Миномёты и артобстрел ИИ']];
  chips($('mOpts'), OPT.map(([k, n]) => [k, n + ' ' + (S[k] !== false && S[k] ? 'вкл' : 'выкл')]), null, (id) => { S[id] = !(S[id] !== false && S[id]); save(); applyUiPrefs(); renderMenu(); });
  $('mOpts').querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', !!(S[OPT[i][0]] !== false && S[OPT[i][0]])));
  chips($('mGyro'), [['off', 'Гироскоп выкл'], ['scope', 'Гироскоп в прицеле'], ['always', 'Гироскоп всегда']], S.gyro || 'off', (id) => { S.gyro = id; save(); renderMenu(); });
  [['mSensS', 'sensS', 2], ['mGyroS', 'gyroS', 2], ['mVol', 'vol', 2], ['mFov', 'fov', 0], ['mDmgE', 'dmgE', 0], ['mDmgF', 'dmgF', 0]].forEach(([el, k, d]) => { $(el).value = S[k]; $(el + 'V').textContent = (+S[k]).toFixed(d); });
  { const bat = S.gmode === 'battle';
    ['secRifles', 'secMode', 'bResetT', 'bNewWind'].forEach((id) => { const e = $(id); if (e) e.hidden = bat; });
    $('secScopesH').textContent = bat ? 'Прицел на автомат (АК, РПК, M4)' : 'Прицел';
    if (bat) { const cur = S.scopes.ak || 'iron'; chips($('mScopes'), [['iron', 'Мушка (открытый)']].concat(AUTO_SC.map((k) => [k, SCOPES[k].name])), cur, (id) => { ['ak', 'm4', 'rpk'].forEach((w) => { S.scopes[w] = id === 'iron' ? null : id; }); save(); renderMenu(); }); } }
  $('mSens').value = S.sens; $('mSensV').textContent = (+S.sens).toFixed(2);
}
['mNH', 'mNR'].forEach((id) => $(id).addEventListener('change', (e) => { const v = Math.max(1, Math.min(100, Math.round(+e.target.value || 1))); e.target.value = v; S[id === 'mNH' ? 'nH' : 'nR'] = v; save(); }));
$('mSens').addEventListener('input', (e) => { S.sens = +e.target.value; $('mSensV').textContent = S.sens.toFixed(2); save(); });
[['mSensS', 'sensS', 2], ['mGyroS', 'gyroS', 2], ['mVol', 'vol', 2], ['mFov', 'fov', 0], ['mDmgE', 'dmgE', 0], ['mDmgF', 'dmgF', 0]].forEach(([el, k, d]) => $(el).addEventListener('input', (e) => { S[k] = +e.target.value; $(el + 'V').textContent = S[k].toFixed(d); save(); if (k === 'vol' && MASTER) MASTER.gain.value = S.vol * 1.35; }));
function applyUiPrefs() { document.body.classList.toggle('nolabels', S.labels === false); }
applyUiPrefs();
function applyMode() { signs.forEach((s) => { s.visible = S.mode === 'train' && !HOOK.battle; }); if (S.mode !== 'train') $('toast').classList.remove('show'); }
function openMenu() {
  fireHeld = false;
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
  renderMenu(); $('menu').hidden = false; $('hud').classList.add('off'); $('bStart').textContent = started && !(HOOK.battle && HOOK.over) && (S.gmode === 'battle') === !!HOOK.battle ? 'Продолжить' : 'В бой';
}
let started = false;
function setRangeVisible(v) { targets.forEach((T) => { T.g.visible = v; }); signs.forEach((sg) => { sg.visible = v && S.mode === 'train'; }); }
function startGame(fresh) {
  audioInit();
  $('menu').hidden = true; $('hud').classList.remove('off');
  started = true;
  if (S.gmode === 'battle') { if (HOOK.startBattle && (fresh === true || !HOOK.battle || HOOK.over)) HOOK.startBattle(); }
  else { if (HOOK.battle && HOOK.stopBattle) HOOK.stopBattle(); setRangeVisible(true); }
  showRifleModel(); updateWeaponUI(); setAim('hip'); updateStats();
  if (IS_TOUCH) {
    try { const el = document.documentElement; const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null; if (r && r.then) r.then(() => { try { const s = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (s && s.catch) s.catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {}); } catch (e) { /* ignore */ }
  }
}
$('bStart').addEventListener('click', () => startGame(false));
$('bRestart').addEventListener('click', () => startGame(true));
window.__back = () => { if (!$('card').hidden) $('card').hidden = true; else if ($('menu').hidden) openMenu(); else if (started) startGame(false); };
$('bResetT').addEventListener('click', () => { targets.forEach((T) => { T.hits = []; T.score = 0; if (T.kind === 'ring') paintRing(T); else paintSteel(T); }); STATS.shots = STATS.hits = STATS.points = 0; updateStats(); });
$('bNewWind').addEventListener('click', () => { newWind(); applyConditions(); });
$('bHud').addEventListener('click', () => { if (window.HUD) { $('menu').hidden = true; $('hud').classList.remove('off'); window.HUD.edit(() => openMenu()); } });
$('bFull').addEventListener('click', () => { try { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* ignore */ } });
$('joy').hidden = !IS_TOUCH; $('bFireL').hidden = !IS_TOUCH;

/* ---------------- главный цикл ---------------- */
let lastT = performance.now();
const FPSC = { n: 0, t: 0, el: null };
function loop(now) {
  requestAnimationFrame(loop);
  if (S.cap30 && now - lastT < 30) return;
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
  applyGyro();
  if (S.fps) { FPSC.n++; FPSC.t += dt; if (FPSC.t > 0.5) { if (!FPSC.el) { FPSC.el = document.createElement('div'); FPSC.el.id = 'fpsBox'; document.body.appendChild(FPSC.el); } FPSC.el.hidden = false; FPSC.el.textContent = Math.round(FPSC.n / FPSC.t) + ' к/с · ' + Math.round(DR.pr * 100) / 100 + 'x'; FPSC.n = 0; FPSC.t = 0; } } else if (FPSC.el) FPSC.el.hidden = true;
  const ts = BCAM.b ? 0.3 : 1, sdt = dt * ts;
  simT += sdt;
  sndBudget = Math.max(0, sndBudget - dt * 14);
  if (started && $('menu').hidden) updatePlayer(dt);
  if (fireHeld && curRifle().type === 'auto' && started && $('menu').hidden) fire();
  if (HM.t > 0) HM.t -= dt;
  if (HOOK.update) HOOK.update(dt, sdt);
  updateSway(dt);
  applyCamera(dt);
  updateLaserBeam();
  updateSuppression(dt); updateCasings(dt); updateBarrelSmoke(dt);
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
  DR.frame++;
  if (Q.sh) renderer.shadowMap.needsUpdate = Q.sh > 1024 || DR.frame % 2 === 0;
  syncPS(cam);
  renderer.render(scene, cam);
  drawOverlay();
  // динамическое разрешение: держим плавность
  const aimed = AIM.mode !== 'hip';
  if (aimed && DR.pr < DR.base) { DR.pr = DR.base; renderer.setPixelRatio(DR.pr); renderer.setSize(innerWidth, innerHeight, false); DR.acc = 0; DR.n = 0; DR.t = 0; }
  if (S.dynres !== false && started && !aimed) {
    DR.acc += dt; DR.n++; DR.t += dt;
    if (DR.t > 1.5) {
      const avg = DR.acc / DR.n; DR.acc = 0; DR.n = 0; DR.t = 0;
      let pr = DR.pr;
      if (avg > 1 / 26) pr = Math.max(DR.base * 0.7, pr * 0.9); else if (avg < 1 / 48) pr = Math.min(DR.base, pr * 1.08);
      if (Math.abs(pr - DR.pr) > 0.02) { DR.pr = pr; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); }
    }
  }
}

window.SS = {
  THREE, V3, scene, camera, terrainH, S, P, AIM, STANCE, HOOK, SHAKE, HM, LRF, COND, RIFLES, TUR, STATS, UNIT, BR,
  clamp, lerp, smooth, gauss, vnoise, windAt, stdElev, zeroAngle, mvNow, spawnBullet, killBullet, spawnPuff, spawnSpark, fxPuff, fxGlow,
  say,
  setWeather: (id) => { if (!WEATHER[id]) return; S.weather = id; applyConditions(); applyWeatherVisuals(); },
  suppress, toggleWeaponList,
  setRumble: (v) => { if (AC && rumbleGain) rumbleGain.gain.setTargetAtTime(S.sound ? v : 0, AC.currentTime, 1.5); },
  obstHit, addObst, KURGANS,
  glowTex, puffTex, noiseHit, tone, getAC: () => (S.sound ? AC : null), audioInit, sndShotFar, sndCrack, sndImpact,
  curRifle, curTur, scopeOf, selectRifle, setAim, setStance, updateWeaponUI, setRangeVisible, openMenu, renderMenu, targetSeg, paintRing, paintSteel, inPoly, SIL,
  IS_TOUCH, getSimT: () => simT, reload, rifleHolder, report, updateStats,
  shadows: !!Q.sh, SUN_DIR, RSTANCE, rangeAt, marchTerrain, WIDX: (id) => RIFLES.findIndex((r) => r.id === id),
  MAPM, FORESTS, riverZ, gullyX, VIS, setVision, sun, hemi, WEATHER, jump, input, SW, REC, Q, elevRad, emit, PSY, DR, setLean, updateTurUI, curScope,
};
/* ---------------- старт ---------------- */
applyConditions(); newWind(); applyWeatherVisuals(); applyMode();
resize();
P.yaw = 0; P.pitch = 0.004;
updateGrass(P.x, P.z);
showRifleModel(); updateWeaponUI(); updateAimUI(); updateStats();
$('hud').classList.add('off');
renderMenu();
requestAnimationFrame(loop);
if (S.autostart) { S.autostart = false; save(); setTimeout(() => startGame(true), 60); }
window.__game = { camera, fire, setAim, setStance, P, targets, STATS, COND, WIND, laser, AIM, turretStep, startGame, openCard, LRF };
// отладка: ускоренная симуляция без отрисовки
window.__game.sim = function (n, dt) { dt = dt || 0.033; for (let i = 0; i < n; i++) { simT += dt; if (HOOK.update) HOOK.update(dt, dt); updateBullets(dt); updateEffects(dt); } };
})();
