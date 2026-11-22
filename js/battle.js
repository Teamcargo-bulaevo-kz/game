/* Бой за высоту: взвод людей (втрое больше) держит траншеи на холме, штурмовые группы роботов идут с дальних холмов.
   Обнаружение (взгляд, свет, дым, лес, шум), отделения и группы с доктриной, санитары, расчёты «Корд» и миномётов,
   тройка игрока с командами, дымовые завесы, лазеры, осветительные ракеты, урон по деталям. */
(function () {
'use strict';
const SS = window.SS;
if (!SS) return;
const { THREE, V3, scene, camera, terrainH, S, P, AIM, HOOK, LRF, COND, RIFLES, TUR, STATS, SHAKE, HM, clamp, lerp, gauss } = SS;
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const W_ = (id) => RIFLES.find((r) => r.id === id);
const WIDX = (id) => RIFLES.findIndex((r) => r.id === id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pickR = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SHD = !!SS.shadows;
const BATTLE_MAP = SS.MAPM === 'battle';
const _v = new V3(), _v2 = new V3(), _v3 = new V3(), _a = new V3(), _b = new V3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const smoothS = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/* ================= геометрия ================= */
function BX(w, h, d, x, y, z, c, rx, ry, rz) { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return [g, c]; }
function CY(r1, r2, h, x, y, z, c, rx, ry, rz, seg) { const g = new THREE.CylinderGeometry(r1, r2, h, seg || 8); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return [g, c]; }
function HS(r, x, y, z, c, sx, sy, sz) { const g = new THREE.SphereGeometry(r, 9, 5, 0, TAU, 0, Math.PI / 2); g.scale(sx || 1, sy || 1, sz || 1); g.translate(x, y, z); return [g, c]; }
function merge(items) {
  let n = 0;
  const gs = items.map(([g, c]) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return [ng, c]; });
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const cc = new THREE.Color(); let o = 0;
  for (const [g, c] of gs) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    cc.setHex(c);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b; }
    o += cnt;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}
const lamV = new THREE.MeshLambertMaterial({ vertexColors: true });

/* ================= высота: траншеи, гнёзда, миномёты ================= */
const HILL = { cz: 40 };
const arcPt = (r, th) => [r * Math.sin(th) / 0.85, HILL.cz - r * Math.cos(th)];
const PH = 1.15;
const fieldGroup = new THREE.Group(); fieldGroup.visible = false; scene.add(fieldGroup);
const parapets = [], slots = { front: [], rear: [] }, nests = [], mortars = [];
const bagMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.2, 0.34), new THREE.MeshLambertMaterial({ color: 0xa08f6a }), 2600);
bagMesh.count = 0; bagMesh.castShadow = SHD; bagMesh.receiveShadow = SHD; fieldGroup.add(bagMesh);
let nBags = 0;
const dummy = new THREE.Object3D();
function bag(x, y, z, yaw) { if (nBags >= 2600) return; dummy.position.set(x, y, z); dummy.rotation.set(0, yaw + gauss() * 0.08, gauss() * 0.03); dummy.updateMatrix(); bagMesh.setMatrixAt(nBags++, dummy.matrix); }
const kordGeo = merge([BX(0.12, 0.16, 0.9, 0, 0, -0.2, 0x262a24), CY(0.03, 0.03, 1.1, 0, 0.02, -1.1, 0x161816, Math.PI / 2), BX(0.06, 0.06, 0.12, 0, 0.02, -1.66, 0x161816), BX(0.16, 0.18, 0.2, 0.14, -0.06, -0.15, 0x3d4a2c),
  BX(0.04, 0.12, 0.04, 0, 0.12, -0.05, 0x111111), BX(0.3, 0.04, 0.04, 0, -0.05, 0.32, 0x222222)]);
const tripodGeo = merge([BX(0.08, 0.5, 0.08, 0, 0.75, 0, 0x222622), BX(0.05, 0.9, 0.05, -0.4, 0.4, 0.3, 0x222622, 0.4, 0, -0.45), BX(0.05, 0.9, 0.05, 0.4, 0.4, 0.3, 0x222622, 0.4, 0, 0.45), BX(0.05, 0.9, 0.05, 0, 0.4, -0.45, 0x222622, -0.5)]);
const mortarGeo = merge([CY(0.045, 0.045, 1.25, 0, 0.55, 0, 0x2f3a2a, 0.6), BX(0.5, 0.05, 0.5, 0, 0.03, 0.32, 0x252a24), BX(0.03, 0.7, 0.03, -0.18, 0.33, -0.25, 0x252a24, 0.3, 0, -0.3), BX(0.03, 0.7, 0.03, 0.18, 0.33, -0.25, 0x252a24, 0.3, 0, 0.3)]);
if (BATTLE_MAP) (function buildHill() {
  const earthM = new THREE.MeshLambertMaterial({ color: 0x6e5c3f });
  const floorM = new THREE.MeshLambertMaterial({ color: 0x45392a });
  const postM = new THREE.MeshLambertMaterial({ color: 0x5f4a32 });
  const shape = new THREE.Shape();
  shape.moveTo(-1.3, -0.6); shape.lineTo(1.05, -0.6); shape.lineTo(0.35, PH); shape.lineTo(-0.5, PH); shape.lineTo(-1.3, -0.6);
  const L = 7.2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2); geo.rotateY(Math.PI / 2); geo.computeVertexNormals();
  const postGeo = new THREE.BoxGeometry(0.08, 1.15, 0.08);
  const floorGeo = new THREE.PlaneGeometry(L, 1.6);
  [['front', 150, 0.85], ['rear', 100, 0.95]].forEach(([name, r, span]) => {
    const n = Math.floor(2 * span * r / 7.5);
    for (let i = 0; i <= n; i++) {
      const th = -span + 2 * span * i / n + (i % 2 ? 0.004 : -0.004);
      const [cx, cz] = arcPt(r + (i % 2 ? 0.9 : -0.9), th);
      const ang = -th * 0.9;
      const gy = terrainH(cx, cz);
      const m = new THREE.Mesh(geo, earthM); m.position.set(cx, gy, cz); m.rotation.y = ang; m.castShadow = SHD; m.receiveShadow = SHD; fieldGroup.add(m);
      const u = new V3(Math.cos(ang), 0, -Math.sin(ang)), nn = new V3(Math.sin(ang), 0, Math.cos(ang));
      const pp = { c: new V3(cx, gy, cz), u, n: nn, L: L / 2, name, mn: [-L / 2, -0.6, -1.0], mx: [L / 2, PH + 0.12, 1.0] };
      parapets.push(pp);
      for (let x = -L / 2 + 0.35; x < L / 2 - 0.2; x += 0.6) bag(cx + u.x * x, gy + PH + 0.1, cz + u.z * x, ang);
      const fl = new THREE.Mesh(floorGeo, floorM); fl.rotation.set(-Math.PI / 2, 0, ang);
      const fx = cx + nn.x * 1.9, fz = cz + nn.z * 1.9; fl.position.set(fx, terrainH(fx, fz) + 0.04, fz); fl.receiveShadow = SHD; fieldGroup.add(fl);
      for (const x of [-3.4, -1.2, 1.2, 3.4]) { const p = new THREE.Mesh(postGeo, postM); p.position.set(cx + u.x * x + nn.x * 1.05, gy + 0.45, cz + u.z * x + nn.z * 1.05); fieldGroup.add(p); }
      [-2.4, 0, 2.4].forEach((s) => { const x = cx + u.x * s + nn.x * 1.85, z = cz + u.z * s + nn.z * 1.85; slots[name].push({ pos: new V3(x, terrainH(x, z), z), yaw: ang, pp, used: null, kind: name }); });
    }
  });
  // гнёзда «Корд»
  [-0.42, 0.42].forEach((th) => {
    const [x, z] = arcPt(132, th), gy = terrainH(x, z), yaw = -th * 0.9;
    for (let k = 0; k < 14; k++) { const a = -Math.PI * 0.85 + k / 13 * Math.PI * 1.7; const bx = x + Math.sin(a + yaw) * -1.7, bz = z - Math.cos(a + yaw) * 1.7; bag(bx, terrainH(bx, bz) + 0.1, bz, a + yaw + Math.PI / 2); bag(bx, terrainH(bx, bz) + 0.3, bz, a + yaw + Math.PI / 2); bag(bx, terrainH(bx, bz) + 0.5, bz, a + yaw + Math.PI / 2); }
    const tri = new THREE.Mesh(tripodGeo, lamV); tri.position.set(x, gy, z); tri.rotation.y = yaw; tri.castShadow = SHD; fieldGroup.add(tri);
    const piv = new THREE.Group(); piv.position.set(x, gy + 1.0, z); piv.rotation.order = 'YXZ'; piv.rotation.y = yaw; fieldGroup.add(piv);
    const gun = new THREE.Mesh(kordGeo, lamV); gun.castShadow = SHD; piv.add(gun);
    const n = { pos: new V3(x, gy, z), yaw, piv, crew: [], th };
    nests.push(n);
    parapets.push({ c: new V3(x - Math.sin(yaw) * 1.6, gy, z - Math.cos(yaw) * 1.6), u: new V3(Math.cos(yaw), 0, -Math.sin(yaw)), n: new V3(Math.sin(yaw), 0, Math.cos(yaw)), L: 1.6, name: 'nest', mn: [-1.6, -0.6, -0.3], mx: [1.6, 0.62, 0.3] });
  });
  // миномётные позиции за гребнем
  [-34, 34].forEach((x) => {
    const z = 92, gy = terrainH(x, z);
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; const bx = x + Math.cos(a) * 2.2, bz = z + Math.sin(a) * 2.2; bag(bx, terrainH(bx, bz) + 0.1, bz, a + Math.PI / 2); bag(bx, terrainH(bx, bz) + 0.3, bz, a + Math.PI / 2); }
    const mm = new THREE.Mesh(mortarGeo, lamV); mm.position.set(x, gy, z); mm.castShadow = SHD; fieldGroup.add(mm);
    mortars.push({ pos: new V3(x, gy, z), mesh: mm, crew: [], cool: rnd(8, 14), tgt: null, spread: 45, shots: 0 });
  });
  bagMesh.count = nBags; bagMesh.instanceMatrix.needsUpdate = true;
})();

/* ================= укрытия, леса, дым ================= */
const covers = [];
const FOREST = SS.FORESTS || [];
const forestSpots = [];
if (BATTLE_MAP) (function buildCovers() {
  let seed = 11;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rockM = new THREE.MeshLambertMaterial({ color: 0x86827a, flatShading: true });
  const wreckGeo = merge([
    BX(2.5, 1.0, 6.2, 0, 0.75, 0, 0x4d3f31), BX(2.3, 0.5, 4.2, 0, 1.45, 0.4, 0x3e332a), BX(1.3, 0.5, 1.6, 0, 1.95, -0.2, 0x36302a),
    CY(0.07, 0.07, 1.8, 0, 2.0, -1.6, 0x2a2622, Math.PI / 2 + 0.25), BX(2.6, 0.12, 6.3, 0, 0.27, 0, 0x2b2621),
    ...[-2.2, -0.8, 0.8, 2.2].flatMap((z) => [CY(0.45, 0.45, 0.3, -1.25, 0.45, z, 0x1f1d1b, 0, 0, Math.PI / 2, 10), CY(0.45, 0.45, 0.3, 1.25, 0.45, z, 0x1f1d1b, 0, 0, Math.PI / 2, 10)]),
  ]);
  const blockGeo = merge([BX(0.7, 0.95, 2.4, -0.9, 0.475, 0, 0x9d9a91), BX(0.7, 0.95, 2.4, 0.0, 0.475, 0.2, 0x938f86, 0, 0.1), BX(0.7, 0.95, 2.4, 0.9, 0.475, -0.1, 0xa29f96, 0, -0.08)]);
  const hayGeo = merge([CY(0.75, 0.75, 1.3, 0, 0.75, 0, 0xb59a52, 0, 0, Math.PI / 2, 12), CY(0.75, 0.75, 1.3, 1.45, 0.75, 0.3, 0xa88f4a, 0, 0, Math.PI / 2, 12)]);
  const logGeo = merge([CY(0.22, 0.22, 3.6, 0, 0.22, 0, 0x6a4c30, 0, 0, Math.PI / 2), CY(0.22, 0.22, 3.6, 0, 0.22, 0.45, 0x5f442b, 0, 0, Math.PI / 2), CY(0.22, 0.22, 3.6, 0, 0.6, 0.22, 0x6f5034, 0, 0, Math.PI / 2)]);
  let tries = 0;
  while (covers.length < 58 && tries++ < 2000) {
    const x = (R() - 0.5) * 1200, z = -230 - R() * 1650;
    if (Math.abs(z - SS.riverZ(x)) < 45) continue;
    if (FOREST.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 6)) continue;
    if (covers.some((c) => Math.hypot(c.c.x - x, c.c.z - z) < 40)) continue;
    const t = R(), yaw = (R() - 0.5) * 1.2;
    let mesh, hx, hz, h;
    if (t < 0.35) { const sx = 1.2 + R() * 1.6, sy = 0.9 + R() * 0.8, sz = 1.0 + R() * 1.2; mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), rockM); mesh.scale.set(sx, sy, sz); mesh.rotation.set(R(), R() * 3, R() * 0.4); hx = sx * 0.85; hz = sz * 0.85; h = sy * 0.95; }
    else if (t < 0.52) { mesh = new THREE.Mesh(wreckGeo, lamV); hx = 1.3; hz = 3.1; h = 2.1; }
    else if (t < 0.68) { mesh = new THREE.Mesh(blockGeo, lamV); hx = 1.3; hz = 1.3; h = 0.95; }
    else if (t < 0.86) { mesh = new THREE.Mesh(hayGeo, lamV); hx = 1.4; hz = 0.8; h = 1.5; }
    else { mesh = new THREE.Mesh(logGeo, lamV); hx = 1.8; hz = 0.55; h = 0.85; }
    const gy = terrainH(x, z);
    mesh.position.set(x, gy - (t < 0.35 ? 0.15 : 0), z); if (t >= 0.35) mesh.rotation.y = yaw;
    mesh.castShadow = SHD; mesh.receiveShadow = SHD; fieldGroup.add(mesh);
    const ang = t < 0.35 ? 0 : yaw;
    const u = new V3(Math.cos(ang), 0, -Math.sin(ang)), nn = new V3(Math.sin(ang), 0, Math.cos(ang));
    const cv = { c: new V3(x, gy, z), u, n: nn, mn: [-hx, -0.3, -hz], mx: [hx, h, hz], h, pts: { h: [], r: [] } };
    const ext = Math.abs(hz * Math.cos(ang)) + Math.abs(hx * Math.sin(ang));
    const wx = Math.max(0.6, Math.abs(hx * Math.cos(ang)) * 0.6);
    [-wx, 0, wx].forEach((o) => { cv.pts.h.push({ pos: new V3(x + o, 0, z + ext + 0.8), used: null }); cv.pts.r.push({ pos: new V3(x + o * 1.3, 0, z - ext - 1.1), used: null }); });
    cv.pts.h.concat(cv.pts.r).forEach((p) => { p.pos.y = terrainH(p.pos.x, p.pos.z); });
    covers.push(cv);
  }
  // точки на южных опушках лесов — роботы прячутся за деревьями
  for (const f of FOREST) {
    if (f.belt) { if (Math.random() < 0.35) { const x = f.x, z = f.z + 4; forestSpots.push({ pos: new V3(x, terrainH(x, z), z), used: null, forest: true }); } continue; }
    for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + 0.7 * k / 6); const x = f.x + Math.cos(a) * f.r * 0.8, z = f.z + Math.sin(a) * f.r * 0.8; if (terrainH(x, z) < -0.5) continue; forestSpots.push({ pos: new V3(x, terrainH(x, z), z), used: null, forest: true }); }
  }
})();
function segBox(bx, p0, p1) {
  const ox = p0.x - bx.c.x, oz = p0.z - bx.c.z, oy = p0.y - bx.c.y;
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const S_ = [ox * bx.u.x + oz * bx.u.z, oy, ox * bx.n.x + oz * bx.n.z], E_ = [dx * bx.u.x + dz * bx.u.z, dy, dx * bx.n.x + dz * bx.n.z];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const s = S_[i], e = E_[i];
    if (Math.abs(e) < 1e-9) { if (s < bx.mn[i] || s > bx.mx[i]) return null; continue; }
    let a = (bx.mn[i] - s) / e, b = (bx.mx[i] - s) / e;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return t0;
}
function nearBox(bx, p0, p1, r) { return !((p0.z - bx.c.z > r && p1.z - bx.c.z > r) || (p0.z - bx.c.z < -r && p1.z - bx.c.z < -r) || (p0.x - bx.c.x > r + 4 && p1.x - bx.c.x > r + 4) || (p0.x - bx.c.x < -r - 4 && p1.x - bx.c.x < -r - 4)); }
function staticHit(p0, p1) {
  let best = null;
  for (const pp of parapets) if (nearBox(pp, p0, p1, 2.5)) { const t = segBox(pp, p0, p1); if (t != null && (best == null || t < best)) best = t; }
  for (const cv of covers) if (nearBox(cv, p0, p1, 4)) { const t = segBox(cv, p0, p1); if (t != null && (best == null || t < best)) best = t; }
  return best;
}
// длина пути отрезка внутри круга (лес)
function chordLen(f, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz; if (L2 < 1e-6) return 0;
  const fx = a.x - f.x, fz = a.z - f.z;
  const B2 = fx * dx + fz * dz, C = fx * fx + fz * fz - f.r * f.r, disc = B2 * B2 - L2 * C;
  if (disc <= 0) return 0;
  const sq = Math.sqrt(disc); const t0 = clamp((-B2 - sq) / L2, 0, 1), t1 = clamp((-B2 + sq) / L2, 0, 1);
  return (t1 - t0) * Math.sqrt(L2);
}
function forestBetween(a, b) { let s = 0; for (const f of FOREST) { if (Math.abs(f.x - (a.x + b.x) / 2) > f.r + Math.abs(a.x - b.x) / 2 + 2) continue; s += chordLen(f, a, b); if (s > 40) return s; } return s; }
function inForest(p) { for (const f of FOREST) if ((p.x - f.x) * (p.x - f.x) + (p.z - f.z) * (p.z - f.z) < f.r * f.r * 0.85) return true; return false; }
const smokes = [];
function smokeBetween(a, b) {
  let k = 0;
  for (const s of smokes) {
    if (s.dens < 0.25) continue;
    const c = _v.set(s.pos.x, s.pos.y + s.r * 0.35, s.pos.z);
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
    let t = L2 > 0 ? ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / L2 : 0; t = clamp(t, 0, 1);
    const ex = a.x + dx * t - c.x, ey = a.y + dy * t - c.y, ez = a.z + dz * t - c.z;
    if (ex * ex + ey * ey + ez * ez < s.r * s.r * 0.6) k = Math.max(k, s.dens);
  }
  return k;
}
// прямая видимость: рельеф, брустверы, укрытия; лес и дым — отдельно (влияют на обнаружение)
function los(a, b) {
  const L = a.distanceTo(b);
  for (const pp of parapets) { if (!nearBox(pp, a, b, 2.5) && L < 400) continue; const t = segBox(pp, a, b); if (t != null && t * L > 1.2 && (1 - t) * L > 1.2) return false; }
  for (const cv of covers) { const t = segBox(cv, a, b); if (t != null && t * L > 1.2 && (1 - t) * L > 1.5) return false; }
  const n = Math.min(14, 3 + Math.floor(L / 60));
  for (let i = 1; i < n; i++) { const f = i / n; const x = lerp(a.x, b.x, f), y = lerp(a.y, b.y, f), z = lerp(a.z, b.z, f); if (y < terrainH(x, z) + 0.2) return false; }
  return true;
}
function coveredFrom(pos, blast) {
  for (const pp of parapets) {
    const lx = (pos.x - pp.c.x) * pp.u.x + (pos.z - pp.c.z) * pp.u.z, lz = (pos.x - pp.c.x) * pp.n.x + (pos.z - pp.c.z) * pp.n.z;
    if (Math.abs(lx) <= pp.L + 0.5 && lz > 0.6 && lz < 3.2) return ((blast.x - pp.c.x) * pp.n.x + (blast.z - pp.c.z) * pp.n.z) < -0.9;
  }
  return false;
}
function inTrench(pos) {
  for (const pp of parapets) {
    const lx = (pos.x - pp.c.x) * pp.u.x + (pos.z - pp.c.z) * pp.u.z, lz = (pos.x - pp.c.x) * pp.n.x + (pos.z - pp.c.z) * pp.n.z;
    if (Math.abs(lx) <= pp.L + 0.4 && lz > 0.6 && lz < 3.2) return true;
  }
  return false;
}
function climbY(x, z) {
  for (const pp of parapets) {
    if (Math.abs(z - pp.c.z) > 4 || Math.abs(x - pp.c.x) > pp.L + 4) continue;
    const lx = (x - pp.c.x) * pp.u.x + (z - pp.c.z) * pp.u.z, lz = (x - pp.c.x) * pp.n.x + (z - pp.c.z) * pp.n.z;
    if (Math.abs(lx) <= pp.L && Math.abs(lz) < 1.2) return PH * Math.cos(lz / 1.2 * Math.PI / 2);
  }
  return 0;
}
HOOK.climbY = (x, z) => (B.active ? climbY(x, z) : 0);

/* ================= модели ================= */
const PT = {};
const MAXH = 40, MAXR = 14;
const unitMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
function defPart(key, geo, mult, glow) {
  const max = (key[0] === 'h' ? MAXH : MAXR) * (mult || 1);
  const m = new THREE.InstancedMesh(geo, glow ? glowMat : unitMat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
  m.frustumCulled = false; m.count = 0; m.castShadow = SHD && !glow;
  scene.add(m);
  PT[key] = { mesh: m, n: 0, max, geo };
}
const HC = { uni: 0x5d6b40, uniD: 0x4c5834, vest: 0x3d4630, pouch: 0x4a5538, skin: 0xc79c7a, helm: 0x4d5733, boot: 0x2a2622, glove: 0x2f2e29, pack: 0x56603f, metal: 0x1f201f, wood: 0x4a2e22 };
defPart('h_pelvis', merge([BX(0.34, 0.2, 0.22, 0, 0, 0, HC.uniD), BX(0.36, 0.05, 0.24, 0, 0.09, 0, 0x2b2b25), BX(0.07, 0.09, 0.05, 0.13, 0.02, -0.12, HC.pouch), BX(0.07, 0.09, 0.05, -0.13, 0.02, -0.12, HC.pouch)]));
defPart('h_torso', merge([BX(0.36, 0.26, 0.2, 0, 0.12, 0, HC.uni), BX(0.4, 0.28, 0.22, 0, 0.38, 0, HC.uni), BX(0.42, 0.36, 0.28, 0, 0.32, 0, HC.vest), BX(0.09, 0.11, 0.06, -0.12, 0.22, -0.17, HC.pouch), BX(0.09, 0.11, 0.06, 0, 0.22, -0.17, HC.pouch), BX(0.09, 0.11, 0.06, 0.12, 0.22, -0.17, HC.pouch),
  BX(0.22, 0.06, 0.2, 0, 0.53, 0, HC.vest), BX(0.32, 0.36, 0.15, 0, 0.32, 0.21, HC.pack), BX(0.3, 0.08, 0.17, 0, 0.52, 0.21, 0x4a5236), CY(0.006, 0.006, 0.45, 0.1, 0.64, 0.25, 0x111111), BX(0.14, 0.1, 0.08, -0.16, 0.12, 0.13, HC.pouch)]));
defPart('h_head', merge([BX(0.09, 0.08, 0.09, 0, 0.02, 0, HC.skin), BX(0.16, 0.2, 0.18, 0, 0.13, 0, HC.skin), BX(0.03, 0.04, 0.03, 0, 0.11, -0.1, 0xb8896a), HS(0.14, 0, 0.16, 0, HC.helm, 1, 0.95, 1.05),
  BX(0.29, 0.03, 0.29, 0, 0.16, 0, HC.helm), BX(0.17, 0.035, 0.03, 0, 0.215, -0.13, 0x222222), BX(0.15, 0.025, 0.02, 0, 0.16, -0.095, 0x2a1f18), BX(0.04, 0.05, 0.06, 0.12, 0.2, -0.06, 0x1a1a1a)]));
defPart('h_uarm', merge([BX(0.1, 0.3, 0.11, 0, -0.15, 0, HC.uni), BX(0.115, 0.09, 0.125, 0, -0.03, 0, HC.vest)]), 2);
defPart('h_farm', merge([BX(0.09, 0.26, 0.1, 0, -0.13, 0, HC.uni), BX(0.08, 0.09, 0.09, 0, -0.3, 0, HC.glove)]), 2);
defPart('h_thigh', merge([BX(0.15, 0.45, 0.16, 0, -0.23, 0, HC.uniD), BX(0.04, 0.12, 0.11, 0.09, -0.25, 0, HC.pouch)]), 2);
defPart('h_shin', merge([BX(0.13, 0.42, 0.14, 0, -0.21, 0, HC.uniD), BX(0.12, 0.1, 0.04, 0, -0.03, -0.08, 0x2b2b25), BX(0.13, 0.1, 0.27, 0, -0.43, -0.05, HC.boot)]), 2);
defPart('h_ak', merge([BX(0.05, 0.075, 0.36, 0, 0, -0.2, HC.metal), BX(0.045, 0.08, 0.26, 0, -0.025, 0.08, HC.wood), BX(0.055, 0.06, 0.18, 0, 0, -0.46, HC.wood), CY(0.011, 0.011, 0.32, 0, 0.01, -0.7, HC.metal, Math.PI / 2),
  BX(0.04, 0.16, 0.07, 0, -0.1, -0.26, 0x5a3424, 0.3), BX(0.035, 0.1, 0.045, 0, -0.07, -0.06, 0x2b2522, 0.3)]));
defPart('h_pkm', merge([BX(0.06, 0.09, 0.42, 0, 0, -0.22, HC.metal), BX(0.05, 0.09, 0.28, 0, -0.02, 0.1, 0x2a2a28), CY(0.014, 0.014, 0.5, 0, 0.01, -0.68, HC.metal, Math.PI / 2), BX(0.1, 0.11, 0.12, 0.03, -0.12, -0.2, 0x3d4a2c),
  BX(0.012, 0.2, 0.012, -0.03, -0.1, -0.78, HC.metal, -0.4), BX(0.012, 0.2, 0.012, 0.03, -0.1, -0.78, HC.metal, -0.4)]));
defPart('h_svd', merge([BX(0.045, 0.07, 0.4, 0, 0, -0.2, HC.metal), BX(0.04, 0.1, 0.3, 0, -0.02, 0.1, HC.wood), BX(0.05, 0.05, 0.22, 0, 0, -0.5, HC.wood), CY(0.01, 0.01, 0.45, 0, 0.01, -0.82, HC.metal, Math.PI / 2),
  CY(0.022, 0.022, 0.3, -0.03, 0.08, -0.15, 0x141414, Math.PI / 2), BX(0.035, 0.14, 0.06, 0, -0.1, -0.22, 0x2a2a2a, 0.2)]));
defPart('h_rpg', merge([CY(0.04, 0.04, 1.0, 0, 0, -0.1, 0x4b5636, Math.PI / 2), CY(0.045, 0.085, 0.2, 0, 0, -0.7, 0x55633b, Math.PI / 2), CY(0.01, 0.045, 0.18, 0, 0, -0.89, 0x55633b, Math.PI / 2), BX(0.03, 0.1, 0.04, 0, -0.07, -0.05, 0x1a1a1a)]));
defPart('h_medbag', merge([BX(0.22, 0.2, 0.12, 0, 0, 0, 0xd8d4c8), BX(0.06, 0.14, 0.01, 0, 0, -0.065, 0xb3261e), BX(0.14, 0.05, 0.01, 0, 0, -0.066, 0xb3261e)]));
const RC = { ar: 0x5a6068, dk: 0x30353c, lt: 0x868c93, jt: 0x16181c, ac: 0x9a2a1c };
defPart('r_pelvis', merge([BX(0.48, 0.24, 0.32, 0, 0, 0, RC.dk), BX(0.18, 0.24, 0.06, -0.14, -0.09, -0.18, RC.ar), BX(0.18, 0.24, 0.06, 0.14, -0.09, -0.18, RC.ar), BX(0.4, 0.08, 0.28, 0, 0.14, 0, RC.jt)]));
defPart('r_torso', merge([BX(0.5, 0.36, 0.34, 0, 0.18, 0, RC.jt), BX(0.7, 0.42, 0.44, 0, 0.5, 0, RC.ar), BX(0.6, 0.32, 0.09, 0, 0.5, -0.25, RC.lt, 0.12), BX(0.44, 0.44, 0.24, 0, 0.42, 0.32, RC.dk),
  BX(0.07, 0.3, 0.05, -0.12, 0.42, 0.45, RC.jt), BX(0.07, 0.3, 0.05, 0.12, 0.42, 0.45, RC.jt), BX(0.28, 0.1, 0.28, 0, 0.74, 0, RC.jt), BX(0.04, 0.24, 0.02, -0.18, 0.5, -0.3, RC.ac), BX(0.04, 0.24, 0.02, 0.18, 0.5, -0.3, RC.ac),
  CY(0.01, 0.01, 0.55, -0.2, 0.98, 0.36, RC.jt), BX(0.5, 0.06, 0.3, 0, 0.0, 0, RC.ar)]));
defPart('r_head', merge([BX(0.26, 0.2, 0.3, 0, 0.11, 0.02, RC.ar), BX(0.3, 0.06, 0.34, 0, 0.23, 0.02, RC.dk), BX(0.2, 0.1, 0.2, 0, 0.0, -0.08, RC.dk), BX(0.05, 0.14, 0.16, -0.16, 0.12, 0.02, RC.jt), BX(0.05, 0.14, 0.16, 0.16, 0.12, 0.02, RC.jt), BX(0.08, 0.05, 0.2, 0, 0.28, 0.06, RC.lt)]));
defPart('r_eye', merge([BX(0.22, 0.035, 0.02, 0, 0.13, -0.135, 0xff2a14), BX(0.04, 0.04, 0.02, 0.07, 0.04, -0.18, 0xff6a2a)]), 1, true);
defPart('r_pad', merge([BX(0.26, 0.16, 0.36, 0, 0.04, 0, RC.ar), BX(0.28, 0.04, 0.38, 0, -0.04, 0, RC.dk), BX(0.04, 0.05, 0.3, 0, 0.13, 0, RC.ac)]), 2);
defPart('r_uarm', merge([BX(0.14, 0.42, 0.14, 0, -0.22, 0, RC.dk), CY(0.025, 0.025, 0.32, 0.09, -0.22, 0, RC.lt), BX(0.16, 0.1, 0.16, 0, -0.42, 0, RC.jt)]), 2);
defPart('r_farm', merge([BX(0.15, 0.4, 0.15, 0, -0.2, 0, RC.ar), BX(0.1, 0.3, 0.04, 0, -0.2, -0.09, RC.lt), BX(0.13, 0.12, 0.12, 0, -0.44, 0, RC.jt)]), 2);
defPart('r_thigh', merge([BX(0.2, 0.54, 0.22, 0, -0.28, 0, RC.ar), BX(0.04, 0.32, 0.18, 0.12, -0.25, 0, RC.lt), BX(0.18, 0.12, 0.18, 0, -0.57, 0, RC.jt)]), 2);
defPart('r_shin', merge([BX(0.17, 0.52, 0.19, 0, -0.27, 0, RC.dk), BX(0.15, 0.38, 0.06, 0, -0.22, -0.11, RC.ar), CY(0.02, 0.02, 0.4, 0, -0.26, 0.11, RC.lt), BX(0.24, 0.09, 0.42, 0, -0.57, -0.08, RC.jt), BX(0.22, 0.06, 0.12, 0, -0.59, -0.32, RC.dk)]), 2);
defPart('r_rifle', merge([BX(0.1, 0.13, 0.75, 0, 0, -0.3, RC.dk), CY(0.026, 0.026, 0.45, 0, 0.02, -0.85, RC.jt, Math.PI / 2), BX(0.06, 0.2, 0.1, 0, -0.14, -0.2, RC.ar), BX(0.05, 0.06, 0.2, 0, 0.1, -0.2, RC.jt), BX(0.07, 0.07, 0.08, 0, 0.02, -1.08, RC.jt), BX(0.03, 0.03, 0.1, 0.06, 0.04, -0.6, 0x441010)]));
defPart('r_mg', merge([BX(0.15, 0.2, 0.9, 0, 0, -0.35, RC.dk), CY(0.05, 0.05, 0.6, 0, 0.02, -1.05, RC.jt, Math.PI / 2), BX(0.18, 0.22, 0.22, 0.13, -0.12, -0.2, RC.ar), BX(0.04, 0.04, 0.5, -0.08, 0.1, -0.5, RC.lt)]));
defPart('r_long', merge([BX(0.08, 0.12, 0.95, 0, 0, -0.35, RC.dk), CY(0.022, 0.022, 0.9, 0, 0.02, -1.25, RC.jt, Math.PI / 2), BX(0.06, 0.08, 0.32, 0, 0.12, -0.3, RC.jt), BX(0.05, 0.16, 0.08, 0, -0.12, -0.2, RC.ar)]));
defPart('r_pod', merge([BX(0.34, 0.3, 0.56, 0, 0, 0, RC.dk), BX(0.36, 0.04, 0.58, 0, 0.17, 0, RC.ac), ...[0, 1, 2, 3].map((i) => CY(0.05, 0.05, 0.03, -0.08 + (i % 2) * 0.16, -0.06 + Math.floor(i / 2) * 0.12, -0.29, 0x111111, Math.PI / 2))]));
defPart('r_smk', merge([CY(0.05, 0.05, 0.22, -0.08, 0, 0, RC.dk, 0.9), CY(0.05, 0.05, 0.22, 0.08, 0, 0, RC.dk, 0.9), BX(0.26, 0.06, 0.12, 0, -0.06, 0.05, RC.ar)]));
// хитбоксы: [cx, cy, cz, hx, hy, hz] в координатах сустава
const HB = {
  h_pelvis: [0, 0, 0, 0.18, 0.12, 0.12], h_torso: [0, 0.3, 0.02, 0.21, 0.3, 0.17], h_head: [0, 0.14, 0, 0.11, 0.15, 0.12],
  h_uarm: [0, -0.15, 0, 0.06, 0.16, 0.065], h_farm: [0, -0.17, 0, 0.055, 0.18, 0.055], h_thigh: [0, -0.23, 0, 0.085, 0.24, 0.085], h_shin: [0, -0.23, -0.03, 0.075, 0.25, 0.11],
  r_pelvis: [0, 0, 0, 0.25, 0.14, 0.17], r_torso: [0, 0.4, 0.04, 0.34, 0.38, 0.28], r_head: [0, 0.12, 0, 0.15, 0.14, 0.17], r_pad: [0, 0.03, 0, 0.14, 0.09, 0.19],
  r_uarm: [0, -0.22, 0, 0.09, 0.25, 0.09], r_farm: [0, -0.24, 0, 0.09, 0.26, 0.09], r_thigh: [0, -0.29, 0, 0.12, 0.32, 0.12], r_shin: [0, -0.3, -0.05, 0.12, 0.33, 0.19],
};
function J(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); if (parent) parent.add(o); return o; }
const GUNKEY = { lead: 'h_ak', rifle: 'h_ak', medic: 'h_ak', mg: 'h_pkm', sniper: 'h_svd', rpg: 'h_rpg', hmg: 'h_ak', mortar: 'h_ak' };
function rigHuman(cls) {
  const root = J(null, 0, 0, 0); root.rotation.order = 'YXZ';
  const tilt = J(root, 0, 0, 0), hips = J(tilt, 0, 0.95, 0), torso = J(hips, 0, 0.1, 0), head = J(torso, 0, 0.58, 0);
  const shL = J(torso, -0.25, 0.5, 0), shR = J(torso, 0.25, 0.5, 0), faL = J(shL, 0, -0.3, 0), faR = J(shR, 0, -0.3, 0);
  const thL = J(hips, -0.1, -0.05, 0), thR = J(hips, 0.1, -0.05, 0), snL = J(thL, 0, -0.46, 0), snR = J(thR, 0, -0.46, 0);
  const gun = cls === 'rpg' ? J(torso, 0.16, 0.62, 0.05) : J(torso, 0.12, 0.36, -0.16);
  const P_ = (key, o, zone) => ({ key, o, zone, hb: HB[key] || null });
  const parts = [P_('h_pelvis', hips, 'pelvis'), P_('h_torso', torso, 'torso'), P_('h_head', head, 'head'), P_('h_uarm', shL, 'uarmL'), P_('h_uarm', shR, 'uarmR'),
    P_('h_farm', faL, 'farmL'), P_('h_farm', faR, 'farmR'), P_('h_thigh', thL, 'thighL'), P_('h_thigh', thR, 'thighR'), P_('h_shin', snL, 'shinL'), P_('h_shin', snR, 'shinR'), P_(GUNKEY[cls], gun, 'gun')];
  if (cls === 'medic') { const mb = J(hips, -0.2, 0.0, 0.08); parts.push(P_('h_medbag', mb, 'pelvis')); }
  return { root, tilt, hips, torso, head, shL, shR, faL, faR, thL, thR, snL, snR, gun, parts };
}
const RGUN = { assault: 'r_rifle', heavy: 'r_mg', rocket: 'r_rifle', scout: 'r_long' };
function rigRobot(cls) {
  const root = J(null, 0, 0, 0); root.rotation.order = 'YXZ';
  const tilt = J(root, 0, 0, 0), hips = J(tilt, 0, 1.2, 0), torso = J(hips, 0, 0.12, 0), head = J(torso, 0, 0.8, 0);
  const shL = J(torso, -0.46, 0.64, 0), shR = J(torso, 0.46, 0.64, 0), faL = J(shL, 0, -0.44, 0), faR = J(shR, 0, -0.44, 0);
  const thL = J(hips, -0.17, -0.06, 0), thR = J(hips, 0.17, -0.06, 0), snL = J(thL, 0, -0.58, 0), snR = J(thR, 0, -0.58, 0);
  const gun = J(faR, 0, -0.44, -0.05);
  if (cls === 'heavy') gun.scale.setScalar(1.15);
  const P_ = (key, o, zone) => ({ key, o, zone, hb: HB[key] || null });
  const parts = [P_('r_pelvis', hips, 'pelvis'), P_('r_torso', torso, 'torso'), P_('r_head', head, 'head'), P_('r_eye', head, 'head'),
    P_('r_pad', shL, 'uarmL'), P_('r_pad', shR, 'uarmR'), P_('r_uarm', shL, 'uarmL'), P_('r_uarm', shR, 'uarmR'), P_('r_farm', faL, 'farmL'), P_('r_farm', faR, 'farmR'),
    P_('r_thigh', thL, 'thighL'), P_('r_thigh', thR, 'thighR'), P_('r_shin', snL, 'shinL'), P_('r_shin', snR, 'shinR'), P_(RGUN[cls], gun, 'gun')];
  let pod = null;
  if (cls === 'rocket') { pod = J(torso, -0.28, 0.92, 0.1); parts.push(P_('r_pod', pod, 'torso')); }
  const smk = J(torso, 0.26, 0.86, 0.18); parts.push(P_('r_smk', smk, 'torso'));
  return { root, tilt, hips, torso, head, shL, shR, faL, faR, thL, thR, snL, snR, gun, pod, parts };
}
const DEP = { head: ['head'], uarmL: ['uarmL', 'farmL'], uarmR: ['uarmR', 'farmR', 'gun'], farmL: ['farmL'], farmR: ['farmR', 'gun'], thighL: ['thighL', 'shinL'], thighR: ['thighR', 'shinR'], shinL: ['shinL'], shinR: ['shinR'], gun: ['gun'] };
const RZ = { head: [2600, 55], torso: [4200, 175], pelvis: [3600, 130], uarmL: [2500, 60], uarmR: [2500, 60], farmL: [2300, 50], farmR: [2300, 50], thighL: [3000, 85], thighR: [3000, 85], shinL: [2800, 70], shinR: [2800, 70] };
const ZNAME = { head: 'голова', torso: 'корпус', pelvis: 'таз', uarmL: 'левое плечо', uarmR: 'правое плечо', farmL: 'левая рука', farmR: 'оружейная рука', thighL: 'левое бедро', thighR: 'правое бедро', shinL: 'левая голень', shinR: 'правая голень' };

/* ================= юниты ================= */
const RW = {
  assault: { id: 'r_assault', mv: 840, bc: 0.21, g: 9.5, sh: 0, sg: 1.5, rpm: 650, burst: [3, 6], pause: [0.5, 1.1], spread: 1.5, mag: 40 },
  heavy:   { id: 'r_heavy',   mv: 860, bc: 0.25, g: 12, sh: 0, sg: 1.5, rpm: 780, burst: [10, 18], pause: [0.7, 1.4], spread: 2.4, mag: 150 },
  scout:   { id: 'r_scout',   mv: 950, bc: 0.32, g: 13, sh: 0, sg: 1.8, rpm: 60, burst: [1, 1], pause: [2.0, 3.5], spread: 0.35, mag: 8 },
};
RW.rocket = RW.assault;
const units = [];
let uid = 0;
const PL = { isPlayer: true, team: 'h', robot: false, alive: true, hp: 100, pos: new V3(), vel: new V3(), right: new V3(1, 0, 0), lastHit: -99, Z: null, crouch: 0, kit: 1, firedT: -99, squad: null, id: -1, cls: 'player' };
const B = { active: false, over: false, N: 6, t: 0, rumbleT: 8, artLeft: 3, kills: 0, lost: 0, robotsKilled: 0, humansDown: 0, hitsE: 0,
  loadout: [], deadT: 0, dmgA: 0, dirs: [], hudT: 0, shells: [], startShots: 0, brainT: 0, phaseH: 'hold', side: 'h', wave: 1, contactT: -99, lullSaid: false, flareT: 20, rMortarT: 60, spect: false };
const squads = [];
const TK = { h: new Map(), r: new Map() };   // знание стороны: враг → {pos, t}
const HCLS = { lead: 'командир', rifle: 'стрелок', mg: 'пулемётчик', sniper: 'снайпер', rpg: 'гранатомётчик', medic: 'санитар', hmg: 'расчёт «Корда»', mortar: 'миномётчик' };
const RCLS = { assault: 'штурмовик', heavy: 'тяжёлый', rocket: 'ракетный', scout: 'разведчик' };
const clsName = (c) => HCLS[c] || RCLS[c] || c;

function makeUnit(team, cls, pos, yaw) {
  const rig = team === 'h' ? rigHuman(cls) : rigRobot(cls);
  const u = {
    id: uid++, team, cls, rig, pos: pos.clone(), yaw, aimYaw: yaw, pitch: 0, alive: true, down: false, vel: new V3(), right: new V3(1, 0, 0),
    hp: 100, gone: new Set(), state: 'pos', dest: null, spot: null, slot: null, target: null, aimZone: 'torso', aimT: 0, cool: rnd(0.5, 2), burst: 0, st: rnd(0, 2), mag: 30, reloadT: 0,
    supp: 0, rangeErr: gauss() * 0.04, mv: 0, ph: Math.random() * TAU, kick: 0, crouch: team === 'h' ? 1 : 0, crouchT: team === 'h' ? 1 : 0, pv: null, T: {},
    fall: null, slide: new V3(), buckle: 0, crawl: false, pose: null, writhe: false, rocketCool: rnd(6, 12), moveDelay: 0, squad: null, expT: 0, bc: new V3(), stagger: 0, staggerPh: 0,
    aw: new Map(), pt: Math.random() * 0.5, head: 0, scan: Math.random() * TAU, firedT: -99, kits: team === 'h' ? (cls === 'medic' ? 4 : 1) : 0, healT: 0, patient: null, run: false, jumpT: 0, smokes: team === 'r' ? 2 : 0, nvg: cls === 'lead' || cls === 'sniper' || cls === 'hmg',
  };
  if (team === 'r') {
    const k = cls === 'heavy' ? 1.3 : cls === 'scout' ? 0.85 : 1;
    u.Z = {};
    for (const z in RZ) u.Z[z] = { armor: RZ[z][0] * k, hp: RZ[z][1] * k, max: RZ[z][1] * k, int: 1 };
    u.wp = RW[cls]; u.mag = u.wp.mag;
    u.speed = cls === 'heavy' ? 4.2 : cls === 'scout' ? 6.0 : 5.5;
  } else {
    u.wp = W_(cls === 'mg' ? 'pkm' : cls === 'sniper' ? 'svd' : cls === 'rpg' ? 'rpg' : 'ak');
    u.mag = cls === 'mg' ? 100 : cls === 'sniper' ? 10 : cls === 'rpg' ? 1 : 30;
    u.speed = 4.6;
  }
  units.push(u);
  return u;
}
const faceYaw = (dx, dz) => Math.atan2(-dx, -dz);
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
const canShoot = (u) => !u.gone.has('farmR') && !u.gone.has('uarmR') && !u.gone.has('gun');
function zonePoint(u, zone, out) {
  out = out || new V3();
  const p = u.rig.parts.find((q) => q.zone === zone && q.hb && !u.gone.has(zone)) || u.rig.parts[1];
  const hb = p.hb;
  return out.set(hb[0], hb[1], hb[2]).applyMatrix4(p.o.matrixWorld);
}
function aimPointOf(t, zone, out) {
  if (t.isPlayer) return out.set(camera.position.x, camera.position.y - (t.robot ? 0.45 : 0.12), camera.position.z);
  return zonePoint(t, zone || 'torso', out);
}
function eyeOf(u, out) {
  if (u.isPlayer) return out.copy(camera.position);
  return out.set(u.pos.x, u.pos.y + (u.team === 'r' ? (u.crawl ? 0.6 : 2.1 - u.crouch * 0.6) : 1.6 - u.crouch * 0.55), u.pos.z);
}
const enemyTeam = (t) => (t === 'h' ? 'r' : 'h');
const isFriend = (team) => team === B.side;

/* ================= эффекты ================= */
function flashFX(p, big) {
  SS.addEffect({ o: new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color: 0xffc46a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: false })),
    t: 0, life: 0.07, s0: big ? 0.022 : 0.013, s1: big ? 0.032 : 0.019, v: new V3(), a0: 1 }).o.position.copy(p);
}
function sparks(p, n, size) {
  SS.spawnSpark(p, size || 0.35);
  for (let i = 0; i < n; i++) {
    const e = SS.addEffect({ o: new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })),
      t: 0, life: rnd(0.25, 0.6), s0: 0.12, s1: 0.04, v: new V3(gauss() * 4, rnd(1, 5), gauss() * 4), a0: 1, g: true, floor: terrainH(p.x, p.z) });
    e.o.position.copy(p);
  }
}
const smokers = [];
const craterTex = (function () { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(25,20,15,.95)'); g.addColorStop(0.55, 'rgba(55,45,32,.8)'); g.addColorStop(0.8, 'rgba(90,75,52,.45)'); g.addColorStop(1, 'rgba(90,75,52,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const craterMat = new THREE.MeshLambertMaterial({ map: craterTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const craterGeo = new THREE.PlaneGeometry(1, 1); craterGeo.rotateX(-Math.PI / 2);
const craters = [];
const debris = [];
const debrisMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8c8580 });
function spawnDebris(u, zones, imp) {
  const rootPart = u.rig.parts.find((p) => p.zone === zones[0]);
  if (!rootPart) return;
  const base = rootPart.o.matrixWorld, inv = _m.copy(base).invert();
  const grp = new THREE.Group();
  for (const p of u.rig.parts) {
    if (zones.indexOf(p.zone) < 0 || u.gone.has(p.zone)) continue;
    const mesh = new THREE.Mesh(PT[p.key].geo, p.key === 'r_eye' ? glowMat : debrisMat);
    mesh.matrixAutoUpdate = false; mesh.matrix.multiplyMatrices(inv, p.o.matrixWorld); mesh.castShadow = SHD;
    grp.add(mesh);
  }
  base.decompose(grp.position, grp.quaternion, grp.scale);
  scene.add(grp);
  const v = imp ? imp.clone().setY(0).normalize().multiplyScalar(rnd(2.5, 6)) : new V3(gauss() * 2, 0, gauss() * 2); v.y = rnd(2.5, 5.5);
  debris.push({ g: grp, v, w: new V3(gauss() * 8, gauss() * 8, gauss() * 8), t: 0, rest: false });
  while (debris.length > 45) { const d = debris.shift(); scene.remove(d.g); }
}
function updateDebris(dt) {
  for (const d of debris) {
    d.t += dt;
    if (d.rest) continue;
    d.v.y -= 9.8 * dt;
    d.g.position.addScaledVector(d.v, dt);
    const wl = d.w.length();
    if (wl > 0.01) { _q.setFromAxisAngle(_v.copy(d.w).divideScalar(wl), wl * dt); d.g.quaternion.premultiply(_q); }
    const gy = terrainH(d.g.position.x, d.g.position.z) + 0.1;
    if (d.g.position.y < gy) {
      d.g.position.y = gy;
      if (Math.abs(d.v.y) > 1.2) SS.spawnPuff(d.g.position, 0x8a7a5c, 0.6, 1.2, 1, 0.3, 0.1);
      d.v.y = -d.v.y * 0.3; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5);
      if (d.v.length() < 0.6) d.rest = true;
    }
  }
}

/* ================= дымовые завесы ================= */
function makeSmoke(pos, r, life) {
  const s = { pos: pos.clone(), r, t: 0, life, dens: 0, sprites: [] };
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.puffTex, color: 0xbdbcb4, transparent: true, depthWrite: false, opacity: 0 }));
    sp.userData.o = new V3(gauss() * r * 0.45, Math.abs(gauss()) * r * 0.35 + 1, gauss() * r * 0.45);
    sp.userData.s = rnd(0.9, 1.5) * r;
    scene.add(sp); s.sprites.push(sp);
  }
  smokes.push(s);
  const d = pos.distanceTo(camera.position); const AC = SS.getAC(); if (AC && d < 600) SS.noiseHit(AC.currentTime + d / 343, 1.2, 'lowpass', 600, clamp(20 / (d + 20), 0.03, 0.4));
}
function updateSmokes(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.t += dt;
    const w = SS.windAt(s.pos.z, SS.getSimT());
    s.pos.x += w[0] * dt * 0.35; s.pos.z += w[1] * dt * 0.35;
    s.dens = Math.min(1, s.t / 3) * (1 - smoothS(s.life - 12, s.life, s.t));
    const grow = 0.55 + 0.45 * Math.min(1, s.t / 6);
    for (const sp of s.sprites) {
      sp.position.set(s.pos.x + sp.userData.o.x * grow, s.pos.y + sp.userData.o.y * grow, s.pos.z + sp.userData.o.z * grow);
      const sc = sp.userData.s * grow; sp.scale.set(sc, sc, 1);
      sp.material.opacity = 0.82 * s.dens;
    }
    if (s.t > s.life) { s.sprites.forEach((sp) => { scene.remove(sp); sp.material.dispose(); }); smokes.splice(i, 1); }
  }
}
function throwSmoke(u, at) {
  if (u.smokes <= 0) return;
  u.smokes--;
  const from = u.pos.clone().add(_v.set(0, 2.2, 0));
  sparks(from, 0, 0.2);
  const p = at.clone(); p.y = terrainH(p.x, p.z);
  setTimeout(() => { if (B.active) makeSmoke(p, rnd(11, 15), rnd(55, 75)); }, 1200);
}

/* ================= звуки ================= */
function boom(dist, power) {
  const AC = SS.getAC(); if (!AC) return;
  const t = AC.currentTime + dist / 343, v = clamp(60 * power / (dist + 40), 0.05, 1.2);
  SS.noiseHit(t, 1.6 + power * 0.4, 'lowpass', 180 + 200 / (1 + dist / 100), v);
  SS.tone(t, 55, 1.0, v * 0.9, 'sine', 28);
  if (dist < 150) SS.noiseHit(t, 0.12, 'highpass', 1200, v * 0.7);
  SS.noiseHit(t + 0.4, 2.2, 'lowpass', 140, v * 0.3);
}
function thud(dist, heavy) { const AC = SS.getAC(); if (!AC || dist > 250) return; const v = clamp(25 / (dist + 20), 0.03, 0.6) * (heavy ? 1 : 0.5); const t = AC.currentTime + dist / 343; SS.noiseHit(t, 0.35, 'lowpass', 220, v); if (heavy) SS.tone(t, 70, 0.3, v * 0.7, 'triangle', 40); }
function whistle(dist) { const AC = SS.getAC(); if (!AC) return; SS.tone(AC.currentTime, 1700, 1.5, clamp(25 / (dist + 25), 0.02, 0.25), 'sine', 450); }
function ring(v) { const AC = SS.getAC(); if (!AC) return; SS.tone(AC.currentTime, 3600, 2.5, 0.05 * v, 'sine'); }
function clank(pt) { const AC = SS.getAC(); const dist = pt.distanceTo(camera.position); if (AC && dist < 300) SS.tone(AC.currentTime + dist / 343, rnd(1800, 3200), 0.12, clamp(8 / (dist + 8), 0.02, 0.3), 'triangle', rnd(900, 1500)); }
function mortarThump(dist) { const AC = SS.getAC(); if (!AC) return; const t = AC.currentTime + dist / 343, v = clamp(30 / (dist + 30), 0.05, 0.8); SS.noiseHit(t, 0.5, 'lowpass', 300, v); SS.tone(t, 90, 0.25, v * 0.6, 'sine', 45); }

/* ================= сообщения ================= */
let lastFeed = '';
function feed(text, cls) {
  if (text === lastFeed) return; lastFeed = text;
  const f = $('feed'); const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls;
  f.insertBefore(d, f.firstChild);
  while (f.children.length > 3) f.removeChild(f.lastChild);
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 700); }, 5000);
}
function dirWord(p) {
  const a = Math.atan2(p.x - PL.pos.x, -(p.z - PL.pos.z)) * 180 / Math.PI;
  const w = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'];
  return w[((Math.round(a / 45) % 8) + 8) % 8];
}

/* ================= падение и позы ================= */
function startFall(u, dirWorld, w0, max, L) {
  const dx = dirWorld.x, dz = dirWorld.z, l = Math.hypot(dx, dz) || 1;
  const c = Math.cos(u.yaw), s = Math.sin(u.yaw);
  const lx = (dx * c - dz * s) / l, lz = (dx * s + dz * c) / l;
  u.fall = { th: 0.02, w: w0, max, L, ax: new V3(lz, 0, -lx), done: false, bounced: 0 };
}
function updateFall(u, dt) {
  const f = u.fall; if (!f || f.done) return;
  f.w += (9.8 / f.L) * Math.sin(f.th + 0.06) * dt;
  f.th += f.w * dt;
  if (f.th >= f.max) {
    f.th = f.max;
    if (Math.abs(f.w) < 0.5 || f.bounced > 2) { f.w = 0; f.done = true; }
    else {
      if (!f.bounced) { const d = u.pos.distanceTo(camera.position); thud(d, u.team === 'r'); SS.spawnPuff(_v.set(u.pos.x, u.pos.y + 0.2, u.pos.z), 0x8a7a5c, u.team === 'r' ? 1.6 : 0.8, 1.6, u.team === 'r' ? 3 : 2, 0.4, 0.6); if (u.team === 'r' && d < 60) SHAKE.a += 0.008; }
      f.w = -f.w * 0.22; f.bounced++;
    }
  }
  if (f.th < 0) { f.th = 0; f.w = Math.abs(f.w) * 0.5; }
  u.pos.addScaledVector(u.slide, dt); u.slide.multiplyScalar(Math.exp(-dt * 2.5));
  u.pos.y = terrainH(u.pos.x, u.pos.z);
}
const PV_H = ['hipsY', 'thL', 'thR', 'snL', 'snR', 'torX', 'torY', 'headX', 'headY', 'shLx', 'shLz', 'shRx', 'shRz', 'faL', 'faR', 'gunX'];
const DOWN_H = {
  back:  { hipsY: 0.95, thL: 0.25, thR: 0.6, snL: -0.3, snR: -1.0, torX: 0.15, torY: 0, headX: -0.35, headY: 0.4, shLx: 2.7, shLz: -0.7, shRx: 1.0, shRz: 0.9, faL: 0.3, faR: 1.1, gunX: 0, fall: 'back', max: 1.52 },
  front: { hipsY: 0.95, thL: -0.1, thR: 0.25, snL: -0.25, snR: -0.7, torX: 0.05, torY: 0.2, headX: 0.5, headY: -0.6, shLx: 3.0, shLz: -0.3, shRx: 2.4, shRz: 0.4, faL: 0.4, faR: 0.9, gunX: 0, fall: 'front', max: 1.5 },
  side:  { hipsY: 0.95, thL: 1.2, thR: 0.9, snL: -1.7, snR: -1.3, torX: -0.55, torY: 0, headX: 0.3, headY: 0.2, shLx: 1.5, shLz: 0, shRx: 1.0, shRz: 0.2, faL: 1.4, faR: 1.0, gunX: 0, fall: 'side', max: 1.5 },
  sit:   { hipsY: 0.24, thL: 1.35, thR: 1.2, snL: -0.35, snR: -0.75, torX: -0.3, torY: 0.25, headX: 0.75, headY: 0.3, shLx: 0.35, shLz: -0.25, shRx: 0.7, shRz: 0.25, faL: 0.6, faR: 1.0, gunX: 0, fall: 'back', max: 0.42 },
  knees: { hipsY: 0.52, thL: 0.0, thR: 0.15, snL: -1.6, snR: -1.5, torX: -1.0, torY: 0, headX: 0.6, headY: 0, shLx: 0.5, shLz: -0.2, shRx: 0.9, shRz: 0.25, faL: 1.4, faR: 1.2, gunX: 0, fall: 'front', max: 0.3 },
};
function initPV(keys, src) { const o = {}; keys.forEach((k) => { o[k] = src[k] || 0; }); return o; }
function blendPV(u, keys, rate) { const k = Math.min(1, rate); for (const key of keys) u.pv[key] += ((u.T[key] || 0) - u.pv[key]) * k; }

function downHuman(u, by, dir, blast) {
  if (!u.alive) return;
  u.alive = false; u.down = true; u.state = 'down'; B.humansDown++;
  if (u.spot) { u.spot.used = null; u.spot = null; }
  if (u.nest) { u.nest.crew = u.nest.crew.filter((c) => c !== u); u.nest = null; }
  if (u.mortar) { u.mortar.crew = u.mortar.crew.filter((c) => c !== u); u.mortar = null; }
  const fwd = new V3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw));
  const fromFront = dir ? fwd.dot(dir) < 0 : true;
  const inT = inTrench(u.pos);
  const opts = blast ? ['back', 'side', 'front'] : fromFront ? (inT ? ['sit', 'knees', 'back', 'side'] : ['back', 'knees', 'side', 'back']) : ['front', 'side', 'front'];
  u.pose = pickR(opts);
  const D = DOWN_H[u.pose];
  if (u.pose === 'sit' && inT) u.yaw += Math.PI;
  const f2 = new V3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw));
  const fd = D.fall === 'back' ? f2.clone().negate() : D.fall === 'front' ? f2.clone() : new V3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
  startFall(u, fd, blast ? rnd(2, 3.5) : rnd(0.3, 0.9), D.max, 0.9);
  if (blast && dir) u.slide.copy(dir).setY(0).normalize().multiplyScalar(rnd(2, 4));
  u.writhe = Math.random() < 0.55;
  if (!u.gone.has('gun')) { spawnDebris(u, ['gun'], fwd.clone().multiplyScalar(0.5)); u.gone.add('gun'); }
  SS.spawnPuff(_v2.set(u.pos.x, u.pos.y + 1.1, u.pos.z), 0x6b0d0d, 0.45, 0.9, 2, 0.1, 0.05);
  if (isFriend('h')) {
    B.lost++;
    const mine = u.squad && PL.squad === u.squad;
    const lines = ['Санитара! Ранен ' + clsName(u.cls), clsName(u.cls) + ' выбыл', 'Ранен ' + clsName(u.cls) + '! Прикрыть!'];
    if (by === 'player') feed('Вы попали по своему!', 'bad'); else if (mine || Math.random() < 0.35) feed((mine ? 'Тройка: ' : '') + pickR(lines), 'bad');
  } else if (by === 'player') { B.kills++; HM.t = 0.45; HM.kind = 'kill'; feed('Человек выведен из строя (' + clsName(u.cls) + ')', 'me'); }
}
function killRobot(u, by, dir, blast) {
  if (!u.alive) return;
  u.alive = false; u.state = 'dead'; B.robotsKilled++;
  if (u.spot) { u.spot.used = null; u.spot = null; }
  const mv = u.vel.length();
  const fd = mv > 0.3 ? u.vel.clone().setY(0).normalize() : (dir ? dir.clone().setY(0).normalize() : new V3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)));
  if (dir && mv > 0.3) fd.addScaledVector(dir.clone().setY(0).normalize(), 0.5).normalize();
  if (!u.crawl) { startFall(u, fd, (blast ? 1.6 : 0.25) + mv * 0.3, 1.42, 1.3); u.slide.copy(u.vel).multiplyScalar(0.8); }
  u.buckle = 0.001;
  const p = zonePoint(u, 'torso', new V3());
  explode(p.clone(), 0.45, { noDamage: true, ground: false });
  sparks(p, 12, 0.9);
  smokers.push({ u, zone: 'torso', t: 40, acc: 0, big: true });
  if (by === 'player') { B.kills++; HM.t = 0.45; HM.kind = 'kill'; feed('Робот уничтожен (' + SS.curRifle().name + ', ' + Math.round(u.pos.distanceTo(PL.pos)) + ' м)', 'me'); }
  else feed((isFriend('r') ? 'Потерян ' : 'Уничтожен ') + clsName(u.cls) + (isFriend('r') ? '' : ' робот'), isFriend('r') ? 'bad' : '');
  if (isFriend('r')) B.lost++;
}
function partDamage(u, zone, dmg, wear, by, dir) {
  if (!u.alive) return;
  const Z = u.Z[zone]; if (!Z || u.gone.has(zone)) return;
  Z.hp -= dmg; Z.int = Math.max(0, Z.int - wear);
  if (Z.hp > 0) return;
  if (zone === 'torso' || zone === 'pelvis') { killRobot(u, by, dir); return; }
  const dep = DEP[zone].filter((z) => !u.gone.has(z));
  const pt = zonePoint(u, zone, new V3());
  spawnDebris(u, dep, dir || new V3(gauss(), 0, gauss()));
  dep.forEach((z) => u.gone.add(z));
  sparks(pt, 10, 0.7); SS.spawnPuff(pt, 0x2e2c2a, 1.0, 2.5, 2, 0.6, 0.15);
  smokers.push({ u, zone: zone.startsWith('farm') || zone.startsWith('uarm') || zone === 'head' ? 'torso' : 'pelvis', t: 20, acc: 0 });
  if (by === 'player') feed('Робот: ' + (zone === 'head' ? 'голова сбита' : ZNAME[zone] + ' оторвана'), 'me');
  if ((zone.startsWith('thigh') || zone.startsWith('shin')) && !u.crawl) {
    u.crawl = true; u.state = 'pos'; u.vel.set(0, 0, 0);
    if (u.spot) { u.spot.used = null; u.spot = null; }
    const side = zone.endsWith('L') ? -1 : 1;
    const fd = new V3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)).addScaledVector(new V3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)), side * 0.6).normalize();
    startFall(u, fd, 0.4, 1.38, 1.3);
  }
}
function robotBullet(u, zone, E, b, pt) {
  const Z = u.Z[zone]; if (!Z) return;
  const thr = Z.armor * Z.int;
  const by = b.player ? 'player' : '';
  const dir = b.v.clone().normalize();
  if (E > thr) {
    sparks(pt, 2, 0.3); SS.spawnPuff(pt, 0x2a2826, 0.4, 1.2, 1, 0.5, 0.05);
    if (b.player) { HM.t = 0.25; HM.kind = 'pen'; }
    partDamage(u, zone, (E - thr * 0.5) / 28, 0.12, by, dir);
  } else {
    sparks(pt, 3, 0.3);
    if (b.player) { HM.t = 0.2; HM.kind = 'ric'; }
    clank(pt);
    if (!b.rico && Math.random() < 0.6) {
      const n = _v.set(gauss(), Math.abs(gauss()) * 0.6, gauss()).normalize();
      const d = dir.clone().sub(n.multiplyScalar(2 * dir.dot(n))).normalize();
      SS.spawnBullet({ team: b.team, rf: b.rf, origin: pt.clone().addScaledVector(d, 0.6), dir: d, mv: b.v.length() * rnd(0.3, 0.5), tracer: Math.random() < 0.5 ? 0xffc870 : 0, rico: true, dt: 0.003, owner: u });
    }
    partDamage(u, zone, E / 600, 0.045 * E / 1000 * (zone === 'torso' ? 1 : 1.2), by, dir);
  }
  // по роботу стреляют — он знает откуда
  if (b.owner && b.owner.alive) know(u, b.owner, 0.8); else if (b.player) know(u, PL, 0.8);
}
function humanDamage(zone, E) {
  if (zone === 'head') return E < 1900 && Math.random() < 0.45 ? 25 : 100;
  if (zone === 'torso') { const plate = Math.random() < 0.65; return plate && E < 3200 ? 15 + E / 300 : 45 + E / 40; }
  if (zone === 'pelvis') return 30 + E / 60;
  if (zone.startsWith('thigh')) return 25 + E / 90;
  return 16 + E / 130;
}
function hurtHuman(u, dmg, by, dir, blast) {
  if (!u.alive) return;
  u.hp -= dmg; u.supp += 2.5; u.hitT = B.t;
  if (u.hp <= 0) downHuman(u, by, dir, blast);
  else if (u.hp < 70 && isFriend('h') && u.squad === PL.squad && Math.random() < 0.4) feed('Тройка: ' + clsName(u.cls) + ' ранен!', 'bad');
}

/* ================= игрок как цель ================= */
const PZ_DEF = { head: [2600, 70], torso: [4300, 240], armL: [2500, 80], armR: [2500, 80], legs: [3000, 140] };
function hurtPlayer(dmg, from) {
  if (!PL.alive || !B.active) return;
  PL.hp -= dmg; PL.lastHit = B.t;
  B.dmgA = Math.min(1, B.dmgA + dmg / 45);
  SHAKE.a += 0.02;
  if (from) B.dirs.push({ a: Math.atan2(from.x - P.x, -(from.z - P.z)) + P.yaw, t: 1.6 });
  if (PL.hp <= 0) playerDie();
  else if (PL.hp < 60 && !PL.calledMedic) { PL.calledMedic = true; feed('Вы ранены. Санитар идёт к вам', 'bad'); }
}
function hurtPlayerRobot(zone, E, from, dmgOverride) {
  if (!PL.alive || !B.active) return;
  const Z = PL.Z[zone];
  if (dmgOverride != null) { Z.hp -= dmgOverride; Z.int = Math.max(0, Z.int - 0.2); B.dmgA = Math.min(1, B.dmgA + dmgOverride / 80); }
  else {
    const thr = Z.armor * Z.int;
    if (E > thr) { Z.hp -= (E - thr * 0.5) / 28; Z.int = Math.max(0, Z.int - 0.12); B.dmgA = Math.min(1, B.dmgA + 0.35); }
    else { Z.int = Math.max(0, Z.int - 0.045 * E / 1000); Z.hp -= E / 600; B.dmgA = Math.min(1, B.dmgA + 0.06); const AC = SS.getAC(); if (AC) SS.tone(AC.currentTime, rnd(2000, 3000), 0.1, 0.12, 'triangle', 1200); }
  }
  PL.lastHit = B.t; SHAKE.a += 0.01;
  if (from) B.dirs.push({ a: Math.atan2(from.x - P.x, -(from.z - P.z)) + P.yaw, t: 1.6 });
  HOOK.speedMul = PL.Z.legs.hp <= 0 ? 0.3 : PL.Z.legs.hp < PL.Z.legs.max * 0.4 ? 0.65 : 1;
  HOOK.dispMul = PL.Z.armR.hp <= 0 ? 4 : PL.Z.armR.hp < PL.Z.armR.max * 0.4 ? 1.8 : 1;
  PL.hp = Math.max(0, PL.Z.torso.hp / PL.Z.torso.max * 100);
  if (PL.Z.torso.hp <= 0 || PL.Z.head.hp <= -40) playerDie();
}
function playerDie() {
  if (!PL.alive) return;
  PL.alive = false; PL.hp = 0; HOOK.dead = true; B.deadT = 0;
  if (B.mounted) dismount();
  SS.setAim('hip');
  feed(PL.robot ? 'Ваш робот уничтожен' : 'Вы тяжело ранены и выбыли из боя', 'bad');
}
function playerZoneHit(p0, p1) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z, dy = p1.y - p0.y;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 1e-9 ? ((P.x - p0.x) * dx + (P.z - p0.z) * dz) / L2 : 0; t = clamp(t, 0, 1);
  const cx = p0.x + dx * t - P.x, cz = p0.z + dz * t - P.z, hd = Math.hypot(cx, cz);
  if (hd > (PL.robot ? 0.55 : 0.32)) return null;
  const base = camera.position.y - P.eye;
  const H = P.eye + (PL.robot ? 0.25 : 0.14);
  const h = p0.y + dy * t - base; if (h < 0 || h > H) return null;
  const f = h / H, lat = cx * PL.right.x + cz * PL.right.z;
  let zone;
  if (PL.robot) zone = f > 0.86 ? 'head' : f > 0.5 ? (Math.abs(lat) > 0.34 ? (lat > 0 ? 'armR' : 'armL') : 'torso') : 'legs';
  else { zone = f > 0.87 ? 'head' : f > 0.5 ? (Math.abs(lat) > 0.2 ? 'farmR' : 'torso') : 'thighL'; if (zone === 'head' && hd > 0.13) return null; }
  return { t, zone };
}

/* ================= взрыв ================= */
function explode(pt, power, opts) {
  opts = opts || {};
  const dist = pt.distanceTo(camera.position);
  const add = (color, s0, s1, life) => SS.addEffect({ o: new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })), t: 0, life, s0, s1, v: new V3(), a0: 1 }).o.position.copy(pt).add(_v.set(0, 0.4 * power, 0));
  add(0xfff0c8, 2.5 * power, 6 * power, 0.18);
  add(0xff8a2a, 2 * power, 5 * power, 0.5);
  if (opts.ground !== false) {
    SS.spawnPuff(pt, 0x8a7a5c, 3.5 * power, 3.2, Math.round(5 + 4 * power), 1.3, 1.4 * power);
    for (let i = 0; i < Math.round(8 * power); i++) {
      const e = SS.addEffect({ o: new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.puffTex, color: 0x3a3025, transparent: true, depthWrite: false })), t: 0, life: rnd(1.5, 2.6), s0: rnd(0.25, 0.6), s1: rnd(0.2, 0.5), v: new V3(gauss() * 4 * power, rnd(5, 13) * Math.sqrt(power), gauss() * 4 * power), a0: 1, g: true, floor: terrainH(pt.x, pt.z) });
      e.o.position.copy(pt);
    }
    if (power >= 0.8) {
      const c = new THREE.Mesh(craterGeo, craterMat); const r = 1.4 * power + 0.6;
      c.scale.set(r * 2, 1, r * 2); c.position.set(pt.x, terrainH(pt.x, pt.z) + 0.04, pt.z); c.rotation.y = Math.random() * TAU; c.receiveShadow = SHD;
      scene.add(c); craters.push(c); if (craters.length > 70) scene.remove(craters.shift());
    }
  }
  SS.spawnPuff(_v.copy(pt).add(_v2.set(0, 1, 0)), 0x37332e, 4 * power, 6, Math.round(3 + 3 * power), 2.0, 1.0);
  boom(dist, power);
  SHAKE.a += clamp(power * 1.4 / (dist + 4), 0, 0.12);
  if (dist < 10 * power && PL.alive) ring(1);
  if (opts.noDamage) return;
  const R = 4 + 4.5 * power;
  for (const u of units) {
    if (!u.alive) continue;
    const c = _v2.set(u.pos.x, u.pos.y + (u.team === 'r' ? 1.2 : 0.9), u.pos.z);
    const d = c.distanceTo(pt); if (d > R) continue;
    let k = Math.pow(1 - d / R, 1.5);
    const dir = new V3().subVectors(u.pos, pt).setY(0.3).normalize();
    if (u.team === 'h') {
      if (u.crouch > 0.5 && coveredFrom(u.pos, pt)) k *= 0.15;
      hurtHuman(u, 140 * power * k, opts.by, dir, true);
      u.supp += 4;
    } else {
      for (const z in u.Z) {
        if (u.gone.has(z) || !u.alive) continue;
        const low = z.startsWith('shin') || z.startsWith('thigh') ? 1.3 : 1;
        partDamage(u, z, 38 * power * k * low * rnd(0.7, 1.3), 0.22 * k * power, opts.by, dir);
      }
      u.stagger = Math.min(1.5, u.stagger + k * power * 1.5);
    }
  }
  for (const u of units) if (u.alive && u.team === 'r' && u.squad && u.pos.distanceTo(pt) < 35) u.squad.underFire = B.t;
  if (opts.direct) {
    const u = opts.direct.u;
    if (u.alive && u.team === 'r') partDamage(u, opts.direct.zone === 'gun' ? 'farmR' : opts.direct.zone, 420, 1, opts.by, new V3(0, 0, -1));
  }
  if (PL.alive && B.active) {
    const d = pt.distanceTo(_v2.set(P.x, PL.pos.y + 0.9, P.z));
    if (d < R) {
      let k = Math.pow(1 - d / R, 1.5); if (P.eye < 1.2 && coveredFrom(PL.pos, pt)) k *= 0.15;
      if (PL.robot) ['torso', 'legs', 'armL', 'armR', 'head'].forEach((z) => hurtPlayerRobot(z, 0, pt, 55 * power * k));
      else hurtPlayer(130 * power * k, pt);
    }
  }
}

/* ================= попадания (хук ядра) ================= */
const _inv = new THREE.Matrix4(), _la = new V3(), _lb = new V3();
function obbT(hb, mw, p0, p1) {
  _inv.copy(mw).invert();
  _la.copy(p0).applyMatrix4(_inv); _lb.copy(p1).applyMatrix4(_inv);
  let t0 = 0, t1 = 1;
  const s = [_la.x, _la.y, _la.z], e = [_lb.x - _la.x, _lb.y - _la.y, _lb.z - _la.z];
  for (let i = 0; i < 3; i++) {
    const mn = hb[i] - hb[i + 3], mx = hb[i] + hb[i + 3];
    if (Math.abs(e[i]) < 1e-9) { if (s[i] < mn || s[i] > mx) return null; continue; }
    let a = (mn - s[i]) / e[i], b = (mx - s[i]) / e[i];
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return t0;
}
function segSphere(c, r, p0, p1) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, L2 = dx * dx + dy * dy + dz * dz;
  let t = L2 > 0 ? ((c.x - p0.x) * dx + (c.y - p0.y) * dy + (c.z - p0.z) * dz) / L2 : 0; t = clamp(t, 0, 1);
  const ex = p0.x + dx * t - c.x, ey = p0.y + dy * t - c.y, ez = p0.z + dz * t - c.z;
  return ex * ex + ey * ey + ez * ez <= r * r;
}
function unitHitTest(u, p0, p1) {
  if (!segSphere(u.bc, u.team === 'r' ? 1.9 : 1.2, p0, p1)) return null;
  let best = null;
  for (const p of u.rig.parts) {
    if (!p.hb || u.gone.has(p.zone)) continue;
    const t = obbT(p.hb, p.o.matrixWorld, p0, p1);
    if (t != null && (!best || t < best.t)) best = { t, zone: p.zone };
  }
  if (best) best.pt = new V3().lerpVectors(p0, p1, best.t);
  return best;
}
HOOK.collide = function (b, p0, p1) {
  if (!B.active) return null;
  let best = null;
  if (b.team !== PL.team && !b.cracked && PL.alive && !b.player) {
    if (segSphere(camera.position, 3, p0, p1)) { b.cracked = true; if (b.v.length() > 360) SS.sndCrack(0.7); PL.suppT = B.t; if (b.owner) know(PL, b.owner, 0.25); }
  }
  // подавление: пуля прошла рядом с головой — пригнуться, и понять, откуда стреляют
  for (const u of units) {
    if (!u.alive || u.team === b.team || Math.abs(u.pos.z - p1.z) > 2.5 || Math.abs(u.pos.x - p1.x) > 2.5) continue;
    _v.set(u.pos.x, u.pos.y + 1.4, u.pos.z);
    if (segSphere(_v, 1.6, p0, p1)) { u.supp += u.team === 'r' ? 0.05 : 0.3; if (b.owner && b.owner.alive) know(u, b.owner, 0.12); else if (b.player) know(u, PL, 0.12); }
  }
  const st = staticHit(p0, p1);
  if (st != null) best = { t: st, fn: () => hitStatic(b, new V3().lerpVectors(p0, p1, st)) };
  for (const u of units) {
    if (!u.alive || u === b.owner) continue;
    if ((u.pos.z - p0.z > 2.6 && u.pos.z - p1.z > 2.6) || (u.pos.z - p0.z < -2.6 && u.pos.z - p1.z < -2.6)) continue;
    if ((u.pos.x - p0.x > 2.6 && u.pos.x - p1.x > 2.6) || (u.pos.x - p0.x < -2.6 && u.pos.x - p1.x < -2.6)) continue;
    const h = unitHitTest(u, p0, p1);
    if (h && (!best || h.t < best.t)) best = { t: h.t, fn: () => bulletHitsUnit(b, u, h) };
  }
  if (PL.alive && !b.player && b.team !== PL.team) {
    const h = playerZoneHit(p0, p1);
    if (h && (!best || h.t < best.t)) best = { t: h.t, fn: () => {
      const v = b.v.length(), E = 0.5 * b.rf.g / 1000 * v * v;
      if (PL.robot) { sparks(new V3().lerpVectors(p0, p1, h.t), 2, 0.2); hurtPlayerRobot(h.zone, E, b.origin); }
      else hurtPlayer(humanDamage(h.zone, E) * 0.7, b.origin);
      SS.killBullet(b, null);
    } };
  }
  return best;
};
function hitStatic(b, pt) {
  SS.killBullet(b, pt, false);
  for (const u of units) if (u.alive && u.team !== b.team && Math.abs(u.pos.x - pt.x) < 3 && Math.abs(u.pos.z - pt.z) < 3.5) u.supp += u.team === 'h' ? 0.7 : 0.1;
}
function bulletHitsUnit(b, u, h) {
  const v = b.v.length(), E = 0.5 * b.rf.g / 1000 * v * v;
  SS.killBullet(b, null);
  const dir = b.v.clone().normalize();
  if (u.team === 'h') {
    SS.spawnPuff(h.pt, 0x6b0d0d, 0.3, 0.5, 1, 0.1, 0.03);
    if (b.player) { HM.t = 0.25; HM.kind = 'pen'; B.hitsE++; }
    hurtHuman(u, humanDamage(h.zone, E), b.player ? 'player' : '', dir, false);
    if (b.owner && b.owner.alive) know(u, b.owner, 0.5);
  } else {
    if (b.player) B.hitsE++;
    robotBullet(u, h.zone, E, b, h.pt);
  }
}
HOOK.rayUnits = function (o, dir, maxD) {
  if (!B.active) return Infinity;
  const p1 = new V3().copy(o).addScaledVector(dir, maxD);
  let best = Infinity;
  for (const u of units) {
    if (!u.alive && !u.down) continue;
    const h = unitHitTest(u, o, p1);
    if (h && h.t * maxD < best) best = h.t * maxD;
  }
  const st = staticHit(o, p1);
  if (st != null && st * maxD < best) best = st * maxD;
  return best;
};

/* ================= ракеты ================= */
const rockets = [];
const rkBody = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8); rkBody.rotateX(Math.PI / 2);
const rkHead = new THREE.ConeGeometry(0.045, 0.22, 8); rkHead.rotateX(-Math.PI / 2); rkHead.translate(0, 0, -0.38);
const rkM = new THREE.MeshLambertMaterial({ color: 0x4f5a3a }), rkM2 = new THREE.MeshLambertMaterial({ color: 0x3a3f33 });
function rocketMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rkBody, rkM2)); g.add(new THREE.Mesh(rkHead, rkM));
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  fl.scale.set(0.6, 0.6, 1); fl.position.z = 0.35; g.add(fl); g.userData.fl = fl;
  return g;
}
function launchRocket(origin, dir, team, player, owner) {
  const r = { p: origin.clone(), v: dir.clone().normalize().multiplyScalar(117), t: 0, team, player, owner: owner || null, mesh: rocketMesh(), acc: 0, sm: 0 };
  scene.add(r.mesh); rockets.push(r);
  const dist = origin.distanceTo(camera.position);
  const AC = SS.getAC();
  if (AC) { const t = AC.currentTime + dist / 343, v = clamp(20 / (dist + 20), 0.05, 1); SS.noiseHit(t, 0.4, 'lowpass', 700, 0.9 * v); SS.noiseHit(t + 0.05, 1.0, 'bandpass', 900, 0.4 * v, 1); }
  if (player) { SHAKE.a += 0.02; SS.spawnPuff(origin.clone().addScaledVector(dir, -2.2), 0xcfc8b8, 2.2, 2.5, 5, 0.4, 0.6); PL.firedT = B.t; }
  if (owner) owner.firedT = B.t;
}
HOOK.launchRocket = (o, d, team, player) => launchRocket(o, d, team, player, null);
const RK_K = 0.0006;
function rocketStep(r, dt) {
  const v = r.v, sp = v.length();
  const w = SS.windAt(r.p.z, SS.getSimT());
  const rx = v.x - w[0], rz = v.z - w[1], rs = Math.sqrt(rx * rx + v.y * v.y + rz * rz);
  const k = RK_K * COND.rho / 1.225 * rs;
  let ax = -k * rx, ay = -k * v.y - 9.81, az = -k * rz;
  if (r.t > 0.06 && r.t < 0.56) {
    ax += v.x / sp * 390; ay += v.y / sp * 390; az += v.z / sp * 390;
    const wd = (w[0] * v.x + w[1] * v.z) / sp;
    ax -= (w[0] - v.x / sp * wd) * 2.2; az -= (w[1] - v.z / sp * wd) * 2.2;
  }
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  r.p.addScaledVector(v, dt);
  r.t += dt;
}
const _rp0 = new V3();
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.acc += dt;
    let hit = null;
    while (r.acc >= 0.004 && !hit) {
      r.acc -= 0.004;
      _rp0.copy(r.p); rocketStep(r, 0.004);
      const p0 = _rp0, p1 = r.p;
      let best = null;
      if (B.active) {
        const st = staticHit(p0, p1); if (st != null) best = { t: st };
        for (const u of units) {
          if (!u.alive || u === r.owner) continue;
          if (Math.abs(u.pos.z - p1.z) > 3 || Math.abs(u.pos.x - p1.x) > 3) continue;
          const h = unitHitTest(u, p0, p1);
          if (h && (!best || h.t < best.t)) best = { t: h.t, u, zone: h.zone };
        }
        if (r.team !== PL.team && PL.alive) { const h = playerZoneHit(p0, p1); if (h && (!best || h.t < best.t)) best = { t: h.t }; }
      } else {
        const tg = SS.targetSeg(p0, p1);
        if (tg && (!best || tg.f < best.t)) best = { t: tg.f, tg };
      }
      const g1 = terrainH(p1.x, p1.z);
      if (p1.y <= g1) { const g0 = terrainH(p0.x, p0.z), e0 = p0.y - g0, e1 = p1.y - g1, f = e0 > 0 ? e0 / (e0 - e1) : 0; if (!best || f < best.t) best = { t: f }; }
      if (best) hit = { pt: new V3().lerpVectors(p0, p1, best.t), u: best.u, zone: best.zone, tg: best.tg };
      else if (r.t > 4.5) hit = { pt: r.p.clone(), air: true };
    }
    if (hit) {
      if (hit.tg) { const T = hit.tg.T; T.hits.push({ a: hit.tg.a, b: T.kind === 'steel' ? hit.tg.b + 0.735 : hit.tg.b, score: 10 }); if (T.kind === 'ring') SS.paintRing(T); else { SS.paintSteel(T); T.swingV += 6; } }
      explode(hit.pt, 1.0, { by: r.player ? 'player' : '', direct: hit.u ? { u: hit.u, zone: hit.zone } : null, ground: !hit.air });
      scene.remove(r.mesh); rockets.splice(i, 1);
      continue;
    }
    r.mesh.position.copy(r.p);
    r.mesh.lookAt(_v.copy(r.p).sub(r.v));
    r.mesh.userData.fl.visible = r.t > 0.06 && r.t < 0.56;
    r.sm += dt;
    if (r.sm > 0.03) { r.sm = 0; SS.spawnPuff(r.p, r.t < 0.56 ? 0xd9d4c8 : 0xa9a49a, 0.5, 2.2, 1, 0.15, 0.03); }
  }
}
const RK_TABLE = (function () {
  const tb = [];
  for (let a = 0; a <= 0.09; a += 0.0005) {
    const p = new V3(), v = new V3(0, Math.sin(a), -Math.cos(a)).multiplyScalar(117); let t = 0, D = 0;
    for (let i = 0; i < 2000; i++) {
      const sp = v.length(), k = RK_K * sp;
      let ax = -k * v.x, ay = -k * v.y - 9.81, az = -k * v.z;
      if (t > 0.06 && t < 0.56) { ax += v.x / sp * 390; ay += v.y / sp * 390; az += v.z / sp * 390; }
      v.x += ax * 0.004; v.y += ay * 0.004; v.z += az * 0.004; p.addScaledVector(v, 0.004); t += 0.004;
      if ((p.y < 0 && t > 0.05) || t > 4.5) { D = -p.z; break; }
    }
    tb.push([a, D]);
  }
  return tb;
})();
HOOK.rocketElev = function (D) {
  for (let i = 1; i < RK_TABLE.length; i++) if (RK_TABLE[i][1] >= D) { const a = RK_TABLE[i - 1], b = RK_TABLE[i]; return lerp(a[0], b[0], (D - a[1]) / (b[1] - a[1] || 1)); }
  return RK_TABLE[RK_TABLE.length - 1][0];
};

/* ================= артиллерия и миномёты ================= */
function callArtillery(center, count, spread, team, delay, power, byPlayer) {
  for (let i = 0; i < count; i++) B.shells.push({ t: delay + i * rnd(0.3, 0.7) + Math.random() * 0.5, pos: new V3(center.x + gauss() * spread, 0, center.z + gauss() * spread * 1.2), team, wh: false, power: power || 1.6, byPlayer: !!byPlayer });
}
function updateShells(dt) {
  for (let i = B.shells.length - 1; i >= 0; i--) {
    const s = B.shells[i]; s.t -= dt;
    if (!s.wh && s.t < 1.5) { s.wh = true; whistle(s.pos.distanceTo(PL.pos)); }
    if (s.t <= 0) { s.pos.y = terrainH(s.pos.x, s.pos.z); explode(s.pos, s.power, { by: s.byPlayer ? 'player' : '' }); B.shells.splice(i, 1); }
  }
}
HOOK.callArt = function () {
  if (!B.active || !PL.alive) return;
  if (B.artLeft <= 0) { feed('Артиллерия: заявки исчерпаны'); return; }
  if (!LRF.pt || LRF.t <= 0) { feed('Сначала измерьте дальность лазером (бинокль)'); return; }
  const d = LRF.pt.distanceTo(PL.pos);
  if (d < 120) { feed('Слишком близко к своим — нужна цель дальше 120 м', 'bad'); return; }
  B.artLeft--;
  callArtillery(LRF.pt, 6, 16, B.side, 9, 2.3, true);
  feed((PL.robot ? 'Удар: ' : 'Батарея: огонь! ') + '6 снарядов, ' + Math.round(d) + ' м, подлёт 9 с', 'me');
  updateArtBtn();
};
function updateArtBtn() { $('artTxt').textContent = 'АРТ ' + B.artLeft; $('bArt').disabled = B.artLeft <= 0; }
$('bArt').addEventListener('pointerdown', (e) => { if (document.body.classList.contains('editing')) return; e.preventDefault(); e.stopPropagation(); SS.audioInit(); HOOK.callArt(); });
// миномёты людей бьют по разведанным роботам
function updateMortars(dt) {
  for (const m of mortars) {
    m.crew = m.crew.filter((c) => c.alive);
    if (!m.crew.length) continue;
    m.cool -= dt;
    if (m.cool > 0) continue;
    // цель — скопление известных роботов 250–2100 м
    let best = null, bs = 0;
    for (const [e, k] of TK.h) {
      if (!e.alive || B.t - k.t > 25) continue;
      const d = k.pos.distanceTo(m.pos); if (d < 250 || d > 2100) continue;
      let sc = 1; for (const [e2, k2] of TK.h) if (e2 !== e && e2.alive && k2.pos.distanceTo(k.pos) < 30) sc++;
      sc += Math.random() * 0.5;
      if (sc > bs) { bs = sc; best = k; }
    }
    if (!best) { m.cool = 2; continue; }
    if (m.tgt && m.tgt.distanceTo(best.pos) < 40) m.spread = Math.max(15, m.spread * 0.75); else m.spread = 45;
    m.tgt = best.pos.clone();
    const d = best.pos.distanceTo(m.pos);
    const tof = 7 + d / 260;
    callArtillery(best.pos, 1, m.spread, 'h', tof, 1.3, false);
    m.cool = m.crew.length > 1 ? rnd(7, 9) : rnd(11, 14);
    m.shots++;
    mortarThump(m.pos.distanceTo(camera.position));
    SS.spawnPuff(m.pos.clone().add(_v.set(0, 1.3, 0)), 0xcfcac0, 1.2, 2, 2, 0.6, 0.2);
    m.crew.forEach((c) => { c.kick = 1; });
    if (m.shots === 1 && isFriend('h')) feed('Миномёты открыли огонь по противнику, ' + Math.round(d) + ' м');
  }
}

/* ================= ночь: осветительные ракеты, лазеры ================= */
const flareLight = new THREE.PointLight(0xffe8c0, 0, 900, 1.3); scene.add(flareLight);
const flareSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color: 0xfff0d0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); flareSpr.visible = false; scene.add(flareSpr);
const FL = { on: false, pos: new V3(), t: 0 };
const isNight = () => !!(SS.WEATHER[S.weather] && SS.WEATHER[S.weather].night);
function launchFlare(at) {
  FL.on = true; FL.t = 0; FL.pos.set(at.x, terrainH(at.x, at.z) + 190, at.z);
  const AC = SS.getAC(); if (AC) SS.noiseHit(AC.currentTime, 0.5, 'bandpass', 1800, 0.2, 2);
  if (isFriend('h')) feed('Осветительная ракета!');
}
function updateFlare(dt) {
  if (!FL.on) { flareLight.intensity = 0; flareSpr.visible = false; return; }
  FL.t += dt; FL.pos.y -= 3.2 * dt;
  const k = FL.t < 1 ? FL.t : FL.t > 22 ? Math.max(0, 1 - (FL.t - 22) / 3) : 1;
  flareLight.position.copy(FL.pos); flareLight.intensity = 3.2 * k * (0.9 + Math.random() * 0.2);
  flareSpr.visible = true; flareSpr.position.copy(FL.pos); flareSpr.scale.set(18 * k + 2, 18 * k + 2, 1);
  if (FL.t > 25) FL.on = false;
}
function lightAt(p) {
  if (!isNight()) return 1;
  if (FL.on && Math.hypot(p.x - FL.pos.x, p.z - FL.pos.z) < 420) return 0.95;
  return 0.18;
}
const laserMat = new THREE.LineBasicMaterial({ color: 0xff2414, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
function laserFor(u) {
  if (u.laser) return u.laser;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const l = new THREE.Line(g, laserMat); l.frustumCulled = false; scene.add(l);
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color: 0xff3020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); dot.scale.set(0.5, 0.5, 1); scene.add(dot);
  u.laser = { l, dot };
  return u.laser;
}
function updateLaser(u) {
  const on = u.alive && canShoot(u) && (u.target || u.engaged) && (isNight() || HOOK.vision === 'nvg' || u.cls === 'scout');
  const L = u.laser;
  if (!on) { if (L) { L.l.visible = false; L.dot.visible = false; } return; }
  const lz = laserFor(u);
  const g = u.rig.gun;
  const o = g.localToWorld(_v.set(0.06, 0.04, -0.6));
  const tip = g.localToWorld(_v2.set(0.06, 0.04, -2));
  const dir = tip.sub(o).normalize();
  let d = u.target ? Math.min(600, o.distanceTo(u.target.pos) + 2) : 160;
  const end = _v3.copy(o).addScaledVector(dir, d);
  const st = staticHit(o, end); if (st != null) end.lerpVectors(o, end, st);
  const a = lz.l.geometry.attributes.position.array;
  a[0] = o.x; a[1] = o.y; a[2] = o.z; a[3] = end.x; a[4] = end.y; a[5] = end.z;
  lz.l.geometry.attributes.position.needsUpdate = true;
  lz.l.visible = true; lz.dot.visible = true; lz.dot.position.copy(end);
}

/* ================= обнаружение ================= */
function enemiesOf(team) {
  const list = units.filter((u) => u.team !== team && u.alive);
  if (PL.alive && PL.team !== team) list.push(PL);
  return list;
}
function friendsOf(team) { return units.filter((u) => u.team === team && u.alive); }
function share(team, e, who) {
  const pos = e.isPlayer ? PL.pos.clone() : e.pos.clone();
  const k = TK[team].get(e);
  if (k) { k.pos.copy(pos); k.t = B.t; return; }
  TK[team].set(e, { pos, t: B.t });
  if (team === 'h' && isFriend('h') && B.t - B.contactT > 25) {
    feed('Контакт! Роботы — ' + dirWord(pos) + ', ' + Math.round(pos.distanceTo(PL.pos)) + ' м', 'bad');
  }
  if (team === 'h') B.contactT = B.t;
  if (team === 'r') B.rContactT = B.t;
}
function know(u, e, amount) {
  if (!e || !e.alive || !u.aw) return;
  const c = Math.min(2, (u.aw.get(e) || 0) + amount);
  u.aw.set(e, c);
  if (c >= 1) share(u.team, e, u);
}
const _pe = new V3(), _pt = new V3();
function perceive(u, dt) {
  u.pt -= dt; if (u.pt > 0) return;
  const tick = rnd(0.35, 0.55); u.pt = tick;
  const robot = u.team === 'r';
  const night = isNight();
  const maxR = robot ? 1500 : night ? 1000 : 1400;
  eyeOf(u, _pe);
  for (const e of enemiesOf(u.team)) {
    const ep = e.isPlayer ? PL.pos : e.pos;
    const dx = ep.x - u.pos.x, dz = ep.z - u.pos.z, d = Math.hypot(dx, dz);
    let c = u.aw.get(e) || 0;
    if (d > maxR) { if (c) u.aw.set(e, Math.max(0, c - 0.1 * tick)); continue; }
    const ang = Math.abs(angDiff(faceYaw(dx, dz), u.yaw + u.head));
    const fired = B.t - (e.firedT || -99) < 2.5;
    const near = d < 16;
    if (!near && ang > (robot ? 1.2 : 1.0) && !(fired && d < 450)) { u.aw.set(e, Math.max(0, c - 0.15 * tick)); continue; }
    if (e.isPlayer) _pt.copy(camera.position); else if (e.team === 'r') zonePoint(e, 'torso', _pt); else zonePoint(e, 'head', _pt);
    if (!los(_pe, _pt)) { u.aw.set(e, Math.max(0, c - 0.2 * tick)); continue; }
    let rate = (robot ? 2.4 : 1.7) * (Math.pow(Math.max(0, 1 - d / maxR), 1.2) + (near ? 3 : 0));
    let ex = 1;
    if (e.isPlayer) ex = P.stance === 2 ? 0.35 : P.stance === 1 ? 0.6 : 1;
    else if (e.team === 'h') ex = e.crouch > 0.5 ? 0.3 : 1;
    else ex = e.crawl ? 0.5 : e.crouch > 0.5 ? 0.6 : 1;
    if (inForest(ep)) ex *= 0.35;
    const fb = forestBetween(_pe, _pt); if (fb > 35) ex *= 0.08; else if (fb > 14) ex *= 0.4;
    const sm = smokeBetween(_pe, _pt); ex *= robot ? 1 - sm * 0.5 : 1 - sm * 0.97;
    const mv = e.isPlayer ? P.moving : Math.min(1, e.vel.length() / 3);
    ex *= 1 + mv * 0.8;
    if (fired) ex *= 3;
    if (!robot) { let li = lightAt(ep); if (u.nvg) li = Math.max(li, 0.65); if (e.laser && e.laser.l.visible) li = Math.max(li, 0.85); ex *= li; }
    if (ang > 0.6 && !near) ex *= 0.5;
    c = Math.min(2, c + rate * ex * tick);
    u.aw.set(e, c);
    if (c >= 1) share(u.team, e, u);
  }
}
// цель: кого вижу сейчас из известных, с учётом угрозы и распределения по отделению
function threat(t, from) {
  const p = t.isPlayer ? PL.pos : t.pos;
  const d = p.distanceTo(from.pos);
  let s = (1500 - d) / 1500;
  if (t.isPlayer) return s + 0.3;
  if (t.team === 'r') { s += t.cls === 'rocket' ? 0.4 : t.cls === 'heavy' ? 0.35 : t.cls === 'scout' ? 0.3 : 0; s += (1 - t.Z.torso.int) * 0.6; if (d < 200) s += 0.8; }
  else { s += t.cls === 'hmg' ? 1.4 : t.cls === 'mg' ? 0.6 : t.cls === 'rpg' ? 0.5 : t.cls === 'sniper' ? 0.45 : 0; if (t.crouch < 0.5) s += 0.4; }
  return s;
}
const EFF = { lead: 420, rifle: 420, medic: 380, mg: 800, sniper: 1100, rpg: 320, hmg: 800, mortar: 300, assault: 850, heavy: 950, rocket: 850, scout: 1400 };
function visibleNow(u, t) {
  eyeOf(u, _pe);
  if (t.isPlayer) _pt.copy(camera.position); else aimPointOf(t, t.team === 'r' ? 'torso' : 'head', _pt);
  if (!los(_pe, _pt)) return false;
  if (u.team === 'h' && smokeBetween(_pe, _pt) > 0.6) return false;
  return true;
}
function pickTarget(u, load) {
  let best = null, bs = -1e9;
  const rng = EFF[u.cls] || 500;
  for (const [e, c] of u.aw) {
    if (c < 1 || !e.alive) continue;
    const p = e.isPlayer ? PL.pos : e.pos;
    const d = p.distanceTo(u.pos); if (d > rng) continue;
    let s = threat(e, u) - (load ? (load.get(e) || 0) * 0.35 : 0);
    if (u.squad && u.squad.focus === e) s += 0.5;
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}
function chooseZone(m, t) {
  if (t.isPlayer) return 'torso';
  if (t.team === 'h') return m.cls === 'scout' ? 'head' : t.crouch > 0.5 ? 'head' : (Math.random() < 0.5 ? 'head' : 'torso');
  if (m.cls === 'sniper') return t.gone.has('head') ? 'torso' : 'head';
  if (m.cls === 'mg' || m.cls === 'rpg' || m.cls === 'hmg') return 'torso';
  // стрелки бьют в самую изношенную зону — вместе продавливают броню
  let best = 'torso', bs = Infinity;
  for (const z of ['torso', 'thighL', 'thighR', 'farmR', 'head']) { if (t.gone.has(z)) continue; const Z = t.Z[z]; const sc = Z.armor * Z.int + Z.hp * 8 + (z === 'torso' ? -300 : 0); if (sc < bs) { bs = sc; best = z; } }
  return best;
}

/* ================= стрельба ИИ ================= */
function muzzle(u, out) { return u.rig.gun.localToWorld(out.set(0, 0, u.team === 'r' ? (u.cls === 'heavy' ? -1.35 : u.cls === 'scout' ? -1.7 : -1.15) : -0.75)); }
function shootDir(org, tp, wp, D, err, spreadMrad) {
  const dir = tp.clone().sub(org).normalize();
  dir.applyAxisAngle(_v3.set(-dir.z, 0, dir.x).normalize(), SS.zeroAngle(wp) + SS.stdElev(wp, D * (1 + err)));
  const s = spreadMrad * 0.001; dir.x += gauss() * s; dir.y += gauss() * s; dir.z += gauss() * s;
  return dir.normalize();
}
function npcFireAt(u, tp, vel, spreadMrad, tracer, org) {
  const wp = u.wp;
  org = org || muzzle(u, new V3());
  const D = org.distanceTo(tp);
  const p = tp.clone(); if (vel) p.addScaledVector(vel, D / (wp.mv * 0.8));
  const dir = shootDir(org, p, wp, D, u.rangeErr, spreadMrad);
  SS.spawnBullet({ team: u.team, rf: wp, origin: org, dir, mv: wp.mv + gauss() * 3, tracer, owner: u, dt: 0.003 });
  flashFX(org, wp.g > 10);
  u.kick = 1; u.mag--; u.firedT = B.t;
  SS.sndShotFar(org.distanceTo(camera.position), wp.g > 10 || u.cls === 'mg', u.team === 'r');
}
function launchAt(u, tgtPoint, D, spread) {
  const org = u.rig.pod ? u.rig.pod.localToWorld(new V3(0, 0.05, -0.35)) : muzzle(u, new V3()).addScaledVector(_v.set(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)), 0.5);
  const dir = tgtPoint.clone().sub(org).normalize();
  dir.applyAxisAngle(_v3.set(-dir.z, 0, dir.x).normalize(), HOOK.rocketElev(D * (1 + u.rangeErr)));
  dir.x += gauss() * spread; dir.y += gauss() * spread * 0.7; dir.normalize();
  launchRocket(org, dir, u.team, false, u);
  u.kick = 1;
}

/* ================= передвижение ================= */
function sendTo(u, spot, delay, pos) {
  if (u.spot && u.spot !== spot) u.spot.used = null;
  u.spot = spot || null; if (spot) spot.used = u;
  u.slot = spot && spot.pp ? spot : null;
  u.dest = spot ? spot.pos.clone() : pos ? pos.clone() : null;
  if (!u.dest) return;
  u.state = 'move'; u.moveDelay = delay || 0; u.moveT = 0;
}
function moveUnit(u, dt, speed) {
  const d = _v.set(u.dest.x - u.pos.x, 0, u.dest.z - u.pos.z);
  const L = d.length();
  u.moveT = (u.moveT || 0) + dt;
  if (L < 0.7 || u.moveT > 45) { u.state = 'pos'; u.vel.set(0, 0, 0); u.moveT = 0; return true; }
  d.divideScalar(L);
  for (const o of units) if (o !== u && o.alive && o.team === u.team && Math.abs(o.pos.x - u.pos.x) < 3 && Math.abs(o.pos.z - u.pos.z) < 3) { const ex = u.pos.x - o.pos.x, ez = u.pos.z - o.pos.z, d2 = ex * ex + ez * ez; if (d2 < 4 && d2 > 1e-4) { d.x += ex / d2 * 0.6; d.z += ez / d2 * 0.6; } }
  const ax = u.pos.x + d.x * 1.8, az = u.pos.z + d.z * 1.8;
  for (const cv of covers) {
    if (Math.abs(cv.c.x - ax) > 6 || Math.abs(cv.c.z - az) > 6) continue;
    const lx = (ax - cv.c.x) * cv.u.x + (az - cv.c.z) * cv.u.z, lz = (ax - cv.c.x) * cv.n.x + (az - cv.c.z) * cv.n.z;
    if (Math.abs(lx) < cv.mx[0] + 0.5 && Math.abs(lz) < cv.mx[2] + 0.5 && L > 2.5) { const s = lx >= 0 ? 1 : -1; d.x += cv.u.x * s * 1.5; d.z += cv.u.z * s * 1.5; }
  }
  d.normalize();
  const gy = terrainH(u.pos.x, u.pos.z);
  const wade = gy < -0.6 ? 0.6 : 1;
  u.vel.set(d.x * speed * wade, 0, d.z * speed * wade);
  u.pos.x += u.vel.x * dt; u.pos.z += u.vel.z * dt;
  const cy = climbY(u.pos.x, u.pos.z);
  u.pos.y = terrainH(u.pos.x, u.pos.z) + cy * (u.team === 'h' ? 1 : 1.25);
  u.yaw += angDiff(faceYaw(d.x, d.z), u.yaw) * Math.min(1, dt * 6);
  return false;
}
function spotNear(team, from, toward, minD, maxD, lane) {
  let best = null, bs = Infinity;
  const pool = [];
  for (const cv of covers) for (const p of (team === 'h' ? cv.pts.h : cv.pts.r)) pool.push(p);
  if (team === 'r') for (const p of forestSpots) pool.push(p);
  if (team === 'h') { for (const p of slots.front) pool.push(p); for (const p of slots.rear) pool.push(p); }
  const tx = toward.x - from.x, tz = toward.z - from.z, tl = Math.hypot(tx, tz) || 1;
  for (const p of pool) {
    if (p.used) continue;
    const ox = p.pos.x - from.x, oz = p.pos.z - from.z;
    const along = (ox * tx + oz * tz) / tl;
    if (along < minD || along > maxD) continue;
    const side = Math.abs(p.pos.x - (lane != null ? lane : from.x));
    if (side > 70) continue;
    const sc = Math.abs(along - (minD + maxD) / 2) * 0.5 + side * 1.0 + (p.forest ? -12 : 0) + Math.random() * 8;
    if (sc < bs) { bs = sc; best = p; }
  }
  return best;
}

/* ================= люди ================= */
function findPatient(u) {
  let best = null, bd = 1e9;
  const cand = units.filter((h) => h.team === 'h' && h.alive && h !== u && h.hp < 70 && !h.healer);
  if (PL.team === 'h' && PL.alive && !PL.robot && PL.hp < 70 && !PL.healer) cand.push(PL);
  for (const h of cand) {
    const p = h.isPlayer ? PL.pos : h.pos;
    const d = p.distanceTo(u.pos);
    const lim = u.cls === 'medic' ? 90 : (h.isPlayer || h.squad === u.squad ? 25 : 0);
    if (d > lim) continue;
    const sc = d - (h.isPlayer ? 30 : 0) - (100 - h.hp) * 0.2;
    if (sc < bd) { bd = sc; best = h; }
  }
  return best;
}
function doHeal(u, dt) {
  const pt = u.patient;
  if (!pt || !pt.alive) { u.patient = null; if (pt) pt.healer = null; u.state = 'pos'; if (u.home) sendTo(u, u.home, 0.3); return; }
  const pp = pt.isPlayer ? PL.pos : pt.pos;
  u.dest = pp.clone().add(_v.set(0.8, 0, 0.6));
  if (u.pos.distanceTo(pp) > 1.6) { u.crouchT = 0.3; moveUnit(u, dt, u.speed * 0.9); u.state = 'heal'; u.mv = lerp(u.mv, 1, dt * 5); return; }
  u.mv = lerp(u.mv, 0, dt * 6); u.vel.set(0, 0, 0); u.crouchT = 1; u.healing = true;
  u.yaw += angDiff(faceYaw(pp.x - u.pos.x, pp.z - u.pos.z), u.yaw) * Math.min(1, dt * 4);
  u.healT += dt;
  if (u.healT > 3.2) {
    u.healT = 0; u.healing = false; u.kits--;
    if (pt.isPlayer) { PL.hp = Math.min(100, PL.hp + 25); PL.calledMedic = false; feed(clsName(u.cls) + ' перевязал вас: +25', 'me'); }
    else { pt.hp = Math.min(100, pt.hp + 25); if (pt.squad === PL.squad || Math.random() < 0.3) feed(clsName(u.cls) + ' перевязал бойца (' + clsName(pt.cls) + ')'); }
    pt.healer = null; u.patient = null; u.state = 'pos';
    if (u.home) sendTo(u, u.home, 0.5);
  }
}
function updateHuman(u, dt) {
  perceive(u, dt);
  u.cool -= dt; u.supp = Math.max(0, u.supp - dt * 0.8); u.reloadT = Math.max(0, u.reloadT - dt); u.st -= dt;
  if (u.reloadT <= 0 && u.mag <= 0) { u.reloadT = u.cls === 'mg' ? 5.5 : u.cls === 'rpg' ? 4 : 2.6; u.mag = u.cls === 'mg' ? 100 : u.cls === 'sniper' ? 10 : u.cls === 'rpg' ? 1 : 30; }
  // расчёты
  if (u.nest) { hmgCrew(u, dt); return; }
  if (u.mortar) { u.crouchT = 0.75; u.mv = 0; const m = u.mortar; u.yaw += angDiff(faceYaw(-m.pos.x * 0 + 0, -1), u.yaw) * 0.05; if (u.healT > 0) u.healT = 0; return; }
  // перевязка
  if (u.patient || u.state === 'heal') { doHeal(u, dt); return; }
  if (u.kits > 0 && u.supp < 2 && (u.cls === 'medic' || Math.random() < 0.02)) {
    const p = findPatient(u);
    if (p && (u.cls === 'medic' || p.isPlayer || p.hp < 45)) { u.patient = p; p.healer = u; u.home = u.spot; if (u.spot) { u.spot.used = null; u.spot = null; } u.state = 'heal'; u.healT = 0; if (p.isPlayer && isFriend('h')) feed(clsName(u.cls) + ': держись, иду к тебе!', 'me'); return; }
  }
  // раненый отходит
  if (u.hp < 35 && !u.retreated && u.state !== 'move' && !inRear(u)) {
    const s = slots.rear.filter((q) => !q.used).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos))[0];
    if (s) { sendTo(u, s, 0); u.retreated = true; }
  }
  // приказы тройке игрока
  const sq = u.squad;
  if (sq && sq.player && sq.order === 'follow' && u.state !== 'move' && B.t - (u.followT || 0) > 1.2) {
    u.followT = B.t;
    const off = sq.members.indexOf(u);
    const fx = PL.pos.x + Math.cos(P.yaw) * (off - 1) * 3.2 + Math.sin(P.yaw) * 3.5, fz = PL.pos.z - Math.sin(P.yaw) * (off - 1) * 3.2 + Math.cos(P.yaw) * 3.5;
    if (Math.hypot(u.pos.x - fx, u.pos.z - fz) > 4) {
      const s = slotsNear(fx, fz, 6);
      if (s) sendTo(u, s, off * 0.3); else sendTo(u, null, off * 0.3, new V3(fx, 0, fz));
    }
  }
  if (u.state === 'move') {
    if (u.moveDelay > 0) { u.moveDelay -= dt; u.crouchT = 1; u.mv = lerp(u.mv, 0, dt * 6); return; }
    u.crouchT = u.supp > 1.5 ? 0.45 : 0;
    const sp = u.speed * (u.hp < 40 ? 0.45 : 1) * (u.supp > 1.5 ? 0.7 : 1);
    if (moveUnit(u, dt, sp)) { u.st = rnd(0.3, 1); u.crouchT = 1; }
    u.mv = lerp(u.mv, 1, dt * 5);
    return;
  }
  u.mv = lerp(u.mv, 0, dt * 6); u.vel.set(0, 0, 0);
  // голова: осмотр сектора или слежение за целью
  const t = u.target && u.target.alive ? u.target : null;
  u.scan += dt * (0.5 + 0.2 * Math.sin(u.id));
  const baseYaw = u.slot ? u.slot.yaw : u.yaw;
  const inCover = !!u.spot;
  // огонь по точке / подавление по приказу
  if (sq && sq.player && (sq.order === 'fire' || sq.order === 'cover') && B.t < sq.orderT && u.reloadT <= 0 && u.supp < 3.5) {
    let pt = null;
    if (sq.order === 'fire' && sq.firePt) pt = sq.firePt.clone().add(_v.set(gauss() * 4, 1 + Math.random(), gauss() * 4));
    else { const k = [...TK.h.values()].filter((q) => B.t - q.t < 30).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos))[0]; if (k) pt = k.pos.clone().add(_v.set(gauss() * 3, 1.4, gauss() * 3)); }
    if (pt) {
      u.crouchT = 0;
      u.yaw += angDiff(faceYaw(pt.x - u.pos.x, pt.z - u.pos.z), u.yaw) * Math.min(1, dt * 5); u.head = lerp(u.head, 0, dt * 4);
      if (u.crouch < 0.3 && u.cool <= 0 && u.cls !== 'rpg') {
        if (u.burst <= 0) u.burst = u.cls === 'mg' ? Math.round(rnd(6, 10)) : Math.round(rnd(2, 4));
        npcFireAt(u, pt, null, 5, S.tracers && Math.random() < (u.cls === 'mg' ? 0.5 : 0.25) ? 0xff9a3c : 0);
        u.burst--; u.cool = u.burst > 0 ? 60 / u.wp.rpm : rnd(0.6, 1.2);
      }
      return;
    }
  }
  if (!t || u.reloadT > 0 || u.supp > 3 || u.st > 0) {
    u.crouchT = inCover ? 1 : 0.6; u.aimT = 0;
    // часовой: выглядывает и осматривает сектор
    if (u.sentry && u.supp < 1.5 && u.reloadT <= 0) u.crouchT = Math.sin(u.scan * 0.37 + u.id) > 0.3 ? 0.15 : 1;
    u.head = lerp(u.head, Math.sin(u.scan) * 0.95, dt * 3);
    u.yaw += angDiff(baseYaw, u.yaw) * Math.min(1, dt * 2);
    if (!t || !t.alive) u.target = pickTarget(u, B.load);
    return;
  }
  u.crouchT = 0;
  const tp = aimPointOf(t, u.aimZone, _v3);
  const want = faceYaw(tp.x - u.pos.x, tp.z - u.pos.z);
  u.yaw += angDiff(want, u.yaw) * Math.min(1, dt * 5);
  u.head = lerp(u.head, 0, dt * 6);
  const D = Math.hypot(tp.x - u.pos.x, tp.z - u.pos.z);
  u.pitch = Math.atan2(tp.y - (u.pos.y + 1.45), D);
  if (u.crouch > 0.3) return;
  u.aimT += dt; u.expT += dt;
  if (u.expT > (u.cls === 'mg' ? 6 : 4) && inCover) { u.expT = 0; u.st = rnd(1.5, 3.5); return; }
  if (u.cool > 0 || u.aimT < (u.cls === 'sniper' ? 1.2 : 0.55)) return;
  if (!visibleNow(u, t)) { u.cool = 0.5; u.target = null; return; }
  const acc = 1 + 1.6 * Math.exp(-u.aimT * 1.5);
  const base = ({ rifle: 2.6, lead: 2.5, medic: 2.8, mg: 3.2, sniper: 0.55, rpg: 1 }[u.cls] || 2.6) * acc * (1 + D / 700);
  const size = t.isPlayer ? 0.6 : t.team === 'r' ? 0.7 : 0.45;
  const pHit = Math.min(1, Math.pow(size / (base * 0.001 * D + 1e-3), 2));
  if (pHit < 0.035 && u.cls !== 'mg') { u.cool = 0.6; return; }
  const vel = t.isPlayer ? PL.vel : t.vel;
  if (u.cls === 'rpg') {
    if (D > 320 || D < 25) { u.cool = 1; return; }
    launchAt(u, aimPointOf(t, 'torso', new V3()), D, 0.006); u.mag--; u.cool = rnd(5, 7); u.expT = 99; u.firedT = B.t;
  } else if (u.cls === 'sniper') {
    npcFireAt(u, aimPointOf(t, u.aimZone, new V3()), vel, base, S.tracers && Math.random() < 0.5 ? 0xff9a3c : 0); u.cool = rnd(2.5, 4); u.aimT = 0.6;
  } else {
    if (u.burst <= 0) u.burst = u.cls === 'mg' ? Math.round(rnd(5, 9)) : Math.round(rnd(2, 3));
    npcFireAt(u, aimPointOf(t, u.aimZone, new V3()), vel, base, S.tracers && Math.random() < (u.cls === 'mg' ? 0.5 : 0.25) ? 0xff9a3c : 0);
    u.burst--;
    u.cool = u.burst > 0 ? 60 / u.wp.rpm : rnd(0.45, 0.9) * (u.cls === 'mg' ? 1.3 : 1);
  }
}
const inRear = (u) => u.pos.z > HILL.cz - 75;
function slotsNear(x, z, r) {
  let best = null, bd = r;
  for (const s of slots.front.concat(slots.rear)) { if (s.used) continue; const d = Math.hypot(s.pos.x - x, s.pos.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
// расчёт «Корда»
function hmgCrew(u, dt) {
  const n = u.nest;
  const gunner = n.crew[0] === u && !(B.mounted === n);
  const back = _v.set(Math.sin(n.yaw), 0, Math.cos(n.yaw));
  const want = gunner ? n.pos.clone().addScaledVector(back, 0.95) : n.pos.clone().addScaledVector(back, 1.6).add(_v2.set(Math.cos(n.yaw) * 0.9, 0, -Math.sin(n.yaw) * 0.9));
  u.pos.x = want.x; u.pos.z = want.z; u.pos.y = terrainH(u.pos.x, u.pos.z);
  u.mv = 0; u.vel.set(0, 0, 0);
  if (!gunner) { u.crouchT = 0.8; u.yaw = n.yaw; u.head = lerp(u.head, Math.sin(u.scan += dt * 0.6) * 0.8, dt * 3); return; }
  u.crouchT = 0.35;
  let t = u.target && u.target.alive ? u.target : null;
  if (!t || Math.random() < 0.01) t = u.target = pickTarget(u, null);
  let aimP = null;
  if (t && t.pos.distanceTo(n.pos) < 800 && visibleNow(u, t)) aimP = aimPointOf(t, 'torso', new V3());
  else {
    // подавление по последним известным (только вблизи)
    const k = [...TK.h.entries()].filter(([e, q]) => e.alive && B.t - q.t < 15 && q.pos.distanceTo(n.pos) < 600).sort((a, b) => a[1].pos.distanceTo(n.pos) - b[1].pos.distanceTo(n.pos))[0];
    if (k && Math.random() < 0.5) aimP = k[1].pos.clone().add(_v3.set(gauss() * 3, 1.5, gauss() * 3));
  }
  if (!aimP) { n.piv.rotation.y += angDiff(n.yaw + Math.sin(u.scan += dt * 0.4) * 0.6, n.piv.rotation.y) * dt * 2; n.piv.rotation.x = lerp(n.piv.rotation.x, 0, dt * 2); u.yaw = n.piv.rotation.y; return; }
  const org = n.piv.position;
  const D = org.distanceTo(aimP);
  const wy = faceYaw(aimP.x - org.x, aimP.z - org.z), wp = Math.atan2(aimP.y - org.y, Math.hypot(aimP.x - org.x, aimP.z - org.z));
  n.piv.rotation.y += angDiff(wy, n.piv.rotation.y) * Math.min(1, dt * 3);
  n.piv.rotation.x = lerp(n.piv.rotation.x, wp + SS.stdElev(n.wp, D), Math.min(1, dt * 3));
  u.yaw = n.piv.rotation.y; u.pitch = n.piv.rotation.x * 0.5;
  if (Math.abs(angDiff(wy, n.piv.rotation.y)) > 0.05 || u.cool > 0) return;
  if (u.burst <= 0) u.burst = Math.round(rnd(8, 18));
  const muz = n.piv.localToWorld(new V3(0, 0.02, -1.75));
  const dir = new V3(0, 0, -1).applyQuaternion(n.piv.quaternion);
  const spr = 0.0022 * (1 + D / 900);
  dir.x += gauss() * spr; dir.y += gauss() * spr; dir.normalize();
  SS.spawnBullet({ team: 'h', rf: n.wp, origin: muz, dir, mv: n.wp.mv, tracer: S.tracers ? 0xff5a26 : 0, owner: u, dt: 0.003 });
  flashFX(muz, true); u.firedT = B.t; n.firedT = B.t;
  SS.sndShotFar(muz.distanceTo(camera.position), true, false);
  u.burst--; u.cool = u.burst > 0 ? 60 / n.wp.rpm : rnd(0.8, 1.6);
}

/* ================= роботы ================= */
function updateRobot(u, dt) {
  perceive(u, dt);
  u.cool -= dt; u.rocketCool -= dt; u.reloadT = Math.max(0, u.reloadT - dt);
  u.stagger = Math.max(0, u.stagger - dt * 0.8);
  if (u.mag <= 0 && u.reloadT <= 0) { u.reloadT = u.cls === 'heavy' ? 4 : 2.4; u.mag = u.wp.mag; }
  const g = u.squad;
  const armed = canShoot(u);
  let t = u.target && u.target.alive ? u.target : null;
  if (!t || Math.random() < 0.04) { t = u.target = pickTarget(u, B.loadR); if (t) u.aimZone = chooseZone(u, t); }
  u.engaged = !!t;
  // движение
  const marching = g && g.phase === 'march';
  if (u.crawl) { u.vel.set(0, 0, 0); u.mv = 0; }
  else if (u.state === 'move' && u.dest) {
    if (u.moveDelay > 0) { u.moveDelay -= dt; u.vel.set(0, 0, 0); u.mv = lerp(u.mv, 0, dt * 4); }
    else {
      const sp = u.speed * (marching ? 1.8 : u.rush ? 1.7 : g && g.phase === 'assault' ? 1.2 : 1) * (u.Z.thighL.int < 0.4 || u.Z.thighR.int < 0.4 ? 0.6 : 1) * (1 - Math.min(0.4, u.stagger));
      moveUnit(u, dt, sp);
      u.mv = lerp(u.mv, Math.min(1.6, sp / 3), dt * 4);
    }
  } else { u.vel.set(0, 0, 0); u.mv = lerp(u.mv, 0, dt * 4); }
  const inCover = !!u.spot && u.state === 'pos';
  u.crouchT = inCover && (u.reloadT > 0 || u.cool > 0.7 || !t) ? 1 : 0;
  u.scan += dt * 0.8;
  if (!t) { u.head = lerp(u.head, Math.sin(u.scan) * 1.0, dt * 3); if (u.state !== 'move') u.aimYaw = u.yaw + u.head * 0.5; else u.aimYaw = u.yaw; u.pitch = lerp(u.pitch, 0, dt * 2); }
  if (!armed) return;
  // подавление тяжёлыми по известным позициям
  if (!t) {
    if (u.cls === 'heavy' && u.state === 'pos' && u.reloadT <= 0 && u.cool <= 0 && g && g.phase !== 'march') {
      const k = [...TK.r.entries()].filter(([e, q]) => e.alive && B.t - q.t < 25 && q.pos.distanceTo(u.pos) < 750)[0];
      if (k) {
        const pt = k[1].pos.clone().add(_v.set(gauss() * 2, 1.3, gauss() * 2));
        u.aimYaw = faceYaw(pt.x - u.pos.x, pt.z - u.pos.z); u.yaw += angDiff(u.aimYaw, u.yaw) * 0.5; u.head = 0;
        u.pitch = Math.atan2(pt.y - (u.pos.y + 1.8), pt.distanceTo(u.pos));
        if (u.burst <= 0) u.burst = Math.round(rnd(8, 14));
        npcFireAt(u, pt, null, 4, S.tracers && Math.random() < 0.5 ? 0x7dff86 : 0);
        u.burst--; u.cool = u.burst > 0 ? 60 / u.wp.rpm : rnd(1.0, 2.0);
      }
    }
    return;
  }
  const tp = aimPointOf(t, u.aimZone, _v3);
  const D = Math.hypot(tp.x - u.pos.x, tp.z - u.pos.z);
  u.aimYaw = faceYaw(tp.x - u.pos.x, tp.z - u.pos.z);
  u.pitch = Math.atan2(tp.y - (u.pos.y + 1.85), D);
  u.head = lerp(u.head, clamp(angDiff(u.aimYaw, u.yaw), -1, 1), dt * 6);
  if (u.state !== 'move') u.yaw += angDiff(u.aimYaw, u.yaw) * Math.min(1, dt * 3);
  if (marching && D > 320) return;
  if (u.reloadT > 0 || u.crouch > 0.4) return;
  if (u.cls === 'rocket' && u.rocketCool <= 0 && D < 470 && D > 40 && !u.crawl) { launchAt(u, tp.clone().setY(tp.y - 0.4), D, 0.008); u.rocketCool = rnd(8, 12); return; }
  if (u.cool > 0 || D > (EFF[u.cls] || 650)) return;
  if (u.state === 'move' && u.cls !== 'assault') return;
  if (!visibleNow(u, t)) { u.cool = 0.35; return; }
  const wp = u.wp;
  if (u.burst <= 0) u.burst = Math.round(rnd(wp.burst[0], wp.burst[1]));
  const moving = u.state === 'move' ? 1.7 : 1;
  const vel = t.isPlayer ? PL.vel : t.vel;
  npcFireAt(u, tp.clone(), vel, wp.spread * (u.gone.has('head') ? 5 : 1) * (1 + D / 650) * moving, S.tracers && Math.random() < 0.6 ? 0x7dff86 : 0);
  u.burst--;
  u.cool = u.burst > 0 ? 60 / wp.rpm : rnd(wp.pause[0], wp.pause[1]);
}

/* ================= командир роботов: штурмовые группы ================= */
const ROUTES = [
  [[-470, -2150], [-440, -1700], [-430, -1250], [-400, -990], [-380, -820], [-300, -560], [-330, -380], [-230, -250], [-120, -150]],
  [[0, -2150], [40, -1700], [40, -1540], [10, -1150], [-20, -800], [0, -520], [10, -300], [0, -160]],
  [[300, -2150], [0, -1800], [0, -1500], [0, -1200], [0, -900], [0, -600], [0, -400], [150, -230], [90, -150]].map((p, i) => (i >= 1 && i <= 6 ? [SS.gullyX(p[1]), p[1]] : p)),
  [[620, -2100], [460, -1500], [390, -1320], [620, -900], [540, -470], [330, -260], [150, -150]],
];
function groupCenter(g) { const al = g.members.filter((m) => m.alive && !m.crawl); if (!al.length) return null; const c = new V3(); al.forEach((m) => c.add(m.pos)); return c.divideScalar(al.length); }
function brainRobots() {
  const hsAlive = units.filter((u) => u.team === 'h' && u.alive).length + (PL.alive && PL.team === 'h' ? 1 : 0);
  const rAlive = units.filter((u) => u.team === 'r' && u.alive).length + (PL.alive && PL.team === 'r' ? 1 : 0);
  for (const g of squads) {
    if (g.team !== 'r') continue;
    const al = g.members.filter((m) => m.alive && !m.crawl);
    if (!al.length) continue;
    const c = groupCenter(g);
    const toHill = Math.hypot(c.x, c.z - HILL.cz);
    if (g.phase === 'wait') { if (B.t > g.release || rAlive < B.N * 0.55) { g.phase = 'march'; if (isFriend('h') && B.wave < 2) { B.wave = 2; feed('Новая волна роботов выходит из-за холмов!', 'bad'); } } continue; }
    const spotted = al.some((m) => { const k = TK.h.get(m); return k && B.t - k.t < 6; });
    const sees = [...TK.r.values()].some((q) => B.t - q.t < 8 && q.pos.distanceTo(c) < 900);
    if (g.phase === 'march') {
      if (toHill < 780 || ((spotted || sees) && toHill < 950)) { g.phase = 'deploy'; al.forEach((m) => { m.state = 'pos'; m.dest = null; }); if (isFriend('r')) feed(g.name + ': контакт, развёртываемся'); }
      else {
        const wp = g.route[g.wi];
        if (!wp) { g.phase = 'deploy'; continue; }
        if (Math.hypot(c.x - wp[0], c.z - wp[1]) < 25) g.wi++;
        al.forEach((m, i) => { const o = (i - (al.length - 1) / 2) * 5; m.dest = new V3(wp[0] + o, 0, wp[1] - i * 3); m.state = 'move'; m.moveDelay = 0; if (m.spot) { m.spot.used = null; m.spot = null; } });
      }
      continue;
    }
    if (g.phase === 'deploy') {
      // дымовая завеса перед открытым участком
      if (!g.smoked && al.length) {
        const dir = new V3(-c.x, 0, HILL.cz - c.z).normalize();
        const n = Math.min(3, al.filter((m) => m.smokes > 0).length);
        for (let i = 0; i < n; i++) { const m = al[i]; const at = c.clone().addScaledVector(dir, rnd(70, 120)).add(_v.set(-dir.z * (i - 1) * 26, 0, dir.x * (i - 1) * 26)); throwSmoke(m, at); }
        g.smoked = true;
        if (n && isFriend('h')) feed('Роботы ставят дымовую завесу!', 'bad');
        if (n && isFriend('r')) feed(g.name + ': ставим дым, вперёд');
      }
      g.phase = 'bound'; g.turn = 0;
    }
    if (g.phase === 'bound') {
      const lossF = 1 - al.length / g.members.length;
      if (lossF >= 0.6 && !g.regrouped) { g.phase = 'regroup'; g.regroupT = B.t + rnd(30, 45); g.regrouped = true; const back = new V3(c.x, 0, c.z - 160); al.forEach((m, i) => { const sp = spotNear('r', m.pos, back, 40, 220, m.pos.x); if (sp) sendTo(m, sp, i * 0.3); }); if (isFriend('h')) feed('Роботы отходят на перегруппировку'); continue; }
      if (toHill < 300 && (rAlive * 3.2 > hsAlive || toHill < 200)) { g.phase = 'assault'; feed(isFriend('h') ? 'Роботы идут на штурм высоты!' : g.name + ': штурм!', isFriend('h') ? 'bad' : 'me'); continue; }
      const rush = toHill > 450 || B.t - (g.underFire || -99) < 4;
      if (rush) {
        const wpn = g.route[Math.min(g.wi, g.route.length - 1)];
        if (Math.hypot(c.x - wpn[0], c.z - wpn[1]) < 90 && g.wi < g.route.length - 1) g.wi++;
        const toward = new V3(wpn[0], 0, wpn[1]);
        {
          al.forEach((m, i) => { if (m.state === 'move' || (m.cls === 'scout' && toHill < 900)) return; const sp = spotNear('r', m.pos, toward, 80, 170, lerp(m.pos.x, toward.x, 0.6) + (i - 1) * 6); if (sp) sendTo(m, sp, i * 0.2); else { const d = toward.clone().sub(m.pos).setY(0).normalize(); sendTo(m, null, i * 0.2, m.pos.clone().addScaledVector(d, 110).add(_v.set((i - 1) * 6, 0, 0))); } m.rush = true; });
        }
        continue;
      }
      al.forEach((m) => { m.rush = false; });
      const moving = al.filter((m) => m.state === 'move').length;
      if (moving <= Math.floor(al.length / 3)) {
        const wpn = g.route[Math.min(g.wi, g.route.length - 1)];
        const toward = new V3(wpn[0], 0, wpn[1]);
        if (Math.hypot(c.x - wpn[0], c.z - wpn[1]) < 70 && g.wi < g.route.length - 1) g.wi++;
        al.filter((m, i) => i % 2 === g.turn).forEach((m, i) => {
          if (m.state === 'move' || m.cls === 'scout' && toHill < 750) return;
          const sp = spotNear('r', m.pos, toward, 35, 120, lerp(m.pos.x, toward.x, 0.5));
          if (sp) sendTo(m, sp, i * 0.4);
          else { const d = toward.clone().sub(m.pos).setY(0).normalize(); sendTo(m, null, i * 0.4, m.pos.clone().addScaledVector(d, 60)); }
        });
        g.turn = 1 - g.turn;
      }
    }
    if (g.phase === 'regroup' && B.t > g.regroupT) { g.phase = 'bound'; if (isFriend('h')) feed('Роботы снова наступают'); }
    if (g.phase === 'assault') {
      al.forEach((m) => {
        if (m.state === 'move' && m.dest && m.dest.z > HILL.cz - 170) return;
        if (m.cls === 'scout') return;
        const s = slots.front.filter((q) => !q.used || q.used.team === 'r').sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0];
        const p = s ? s.pos.clone().add(_v.set(gauss() * 2, 0, rnd(-1, 4))) : new V3(m.pos.x, 0, HILL.cz - 150);
        sendTo(m, null, Math.random() * 0.6, p);
      });
    }
  }
  // миномёт роботов по известным позициям
  B.rMortarT -= 1.5;
  if (B.rMortarT <= 0 && !isFriend('r')) {
    const ks = [...TK.r.entries()].filter(([e, q]) => e.alive && B.t - q.t < 20);
    if (ks.length) { const k = pickR(ks)[1]; callArtillery(k.pos, 3, 16, 'r', 2, 1.4); }
    B.rMortarT = rnd(45, 65);
  }
}
/* ================= командир людей ================= */
function brainHumans() {
  const robots = units.filter((u) => u.team === 'r' && u.alive);
  const rAlive = robots.length + (PL.alive && PL.team === 'r' ? 1 : 0);
  const near = robots.reduce((m, r) => Math.min(m, Math.hypot(r.pos.x, r.pos.z - HILL.cz)), 9999);
  // распределение целей: не больше 2–3 стрелков на одного робота
  B.load = new Map();
  for (const u of units) if (u.team === 'h' && u.alive && u.target && u.target.alive) B.load.set(u.target, (B.load.get(u.target) || 0) + 1);
  B.loadR = new Map();
  for (const u of units) if (u.team === 'r' && u.alive && u.target && u.target.alive) B.loadR.set(u.target, (B.loadR.get(u.target) || 0) + 1);
  // затишье
  if (B.contactT > 0 && B.t - B.contactT > 35 && !B.lullSaid && isFriend('h')) { B.lullSaid = true; feed('Затишье. Перезарядиться, перевязать раненых, смотреть в оба'); }
  if (B.t - B.contactT < 5) B.lullSaid = false;
  // контратака, когда роботов почти не осталось
  if (B.phaseH !== 'attack' && rAlive > 0 && rAlive <= Math.max(1, Math.round(B.N * 0.25)) && near > 120) {
    B.phaseH = 'attack'; feed('Командир: добить оставшихся! Отделения — вперёд перебежками', isFriend('h') ? 'me' : 'bad');
  }
  for (const sq of squads) {
    if (sq.team !== 'h' || sq.player) continue;
    const al = sq.members.filter((m) => m.alive && !m.nest && !m.mortar);
    if (!al.length) continue;
    // фокус отделения
    const foc = al.map((m) => m.target).filter((x) => x && x.alive);
    sq.focus = foc.length ? foc[0] : null;
    // отход при прорыве
    const lost = 1 - sq.members.filter((m) => m.alive).length / sq.members.length;
    const front = al.filter((m) => !inRear(m));
    const danger = robots.filter((r) => front.some((m) => m.pos.distanceTo(r.pos) < 45)).length;
    if (sq.order === 'hold' && front.length && (danger >= 2 || (lost >= 0.5 && near < 200))) {
      sq.order = 'fallback';
      al.forEach((m, i) => { const s = slots.rear.filter((q) => !q.used).sort((a, b) => Math.abs(a.pos.x - m.pos.x) - Math.abs(b.pos.x - m.pos.x))[0]; if (s) sendTo(m, s, (i % 2) * 2); });
      if (isFriend('h')) feed(sq.name + ': отходим во вторую траншею, прикрывайте!');
    }
    if (sq.order === 'fallback' && al.every((m) => m.state !== 'move')) sq.order = 'hold';
    if (B.phaseH === 'attack' && sq.order !== 'attack') { sq.order = 'attack'; sq.turn = 0; }
    if (sq.order === 'attack') {
      const moving = al.some((m) => m.state === 'move');
      if (!moving && robots.length) {
        al.filter((m, i) => i % 2 === sq.turn && m.cls !== 'medic').forEach((m, i) => {
          const tgt = robots.reduce((a, r) => (r.pos.distanceTo(m.pos) < a.pos.distanceTo(m.pos) ? r : a), robots[0]);
          if (m.pos.distanceTo(tgt.pos) < 60) return;
          const sp = spotNear('h', m.pos, tgt.pos, 20, 80, lerp(m.pos.x, tgt.pos.x, 0.4));
          if (sp) sendTo(m, sp, i * 0.4);
        });
        sq.turn = 1 - sq.turn;
      }
    }
    // часовые: по одному в отделении постоянно осматривают сектор
    al.forEach((m, i) => { m.sentry = i === 0; });
  }
  // ночью — осветительные ракеты над известными роботами
  B.flareT -= 1.5;
  if (isNight() && !FL.on && B.flareT <= 0 && !isFriend('r') || isNight() && !FL.on && B.flareT <= 0 && isFriend('r')) {
    const ks = [...TK.h.values()].filter((q) => B.t - q.t < 30);
    const at = ks.length ? pickR(ks).pos : new V3(gauss() * 200, 0, HILL.cz - rnd(450, 900));
    launchFlare(at); B.flareT = rnd(26, 38);
  }
  // если игрок за роботов — люди сами вызывают артиллерию
  if (isFriend('r')) {
    B.hArtT = (B.hArtT || 50) - 1.5;
    if (B.hArtT <= 0) { const ks = [...TK.h.values()].filter((q) => B.t - q.t < 20); if (ks.length) { callArtillery(pickR(ks).pos, 4, 18, 'h', 6, 2.0); feed('Люди вызвали артиллерию!', 'bad'); } B.hArtT = rnd(45, 65); }
  }
}

/* ================= тройка игрока: команды ================= */
HOOK.squadMenu = function () { const p = $('sqPanel'); p.hidden = !p.hidden; };
document.querySelectorAll('#sqPanel button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); squadCmd(b.dataset.c); $('sqPanel').hidden = true; }));
function squadCmd(c) {
  const sq = PL.squad; if (!sq || !B.active) return;
  const al = sq.members.filter((m) => m.alive);
  if (!al.length) { feed('В тройке никого не осталось', 'bad'); return; }
  sq.order = c; sq.orderT = B.t + 25;
  if (c === 'fire') {
    if (!LRF.pt || LRF.t <= 0) { feed('Наведите бинокль и измерьте дальность — это точка огня'); sq.order = 'hold'; return; }
    sq.firePt = LRF.pt.clone(); feed('Тройка: принял, огонь по точке ' + Math.round(LRF.pt.distanceTo(PL.pos)) + ' м', 'me');
  } else if (c === 'follow') feed('Тройка: за тобой!', 'me');
  else if (c === 'hold') { al.forEach((m) => { if (m.state === 'move') { m.state = 'pos'; m.dest = null; } }); feed('Тройка: держим позицию', 'me'); }
  else if (c === 'cover') feed('Тройка: прикрываем, подавляем!', 'me');
  else if (c === 'advance') {
    const toward = LRF.pt && LRF.t > 0 ? LRF.pt.clone() : PL.pos.clone().add(_v.set(-Math.sin(P.yaw) * 100, 0, -Math.cos(P.yaw) * 100));
    al.forEach((m, i) => { const sp = spotNear(sq.team, m.pos, toward, 15, 70, lerp(m.pos.x, toward.x, 0.3)); if (sp) sendTo(m, sp, (i % 2) * 2.5); else sendTo(m, null, (i % 2) * 2.5, m.pos.clone().lerp(toward, 0.3)); });
    feed('Тройка: вперёд перебежками, по двое!', 'me'); sq.order = 'hold';
  } else if (c === 'back') {
    al.forEach((m, i) => { const s = slots.rear.filter((q) => !q.used).sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0]; if (s) sendTo(m, s, i * 0.6); else sendTo(m, null, i * 0.6, m.pos.clone().add(_v.set(0, 0, 60))); });
    feed('Тройка: отходим!', 'me'); sq.order = 'hold';
  }
}
HOOK.medkit = function () {
  if (!B.active || !PL.alive || PL.robot) return;
  if (PL.kit > 0 && PL.hp < 100) { PL.kit--; PL.hp = Math.min(100, PL.hp + 25); feed('Вы перевязались: +25', 'me'); }
  else if (PL.hp < 100) { PL.calledMedic = false; PL.hp = Math.min(PL.hp, 69); feed('Санитара! — зовёте помощь'); }
  updateMedBtn();
};
function updateMedBtn() { $('medTxt').textContent = 'АПТЕЧКА ' + PL.kit; }
// станковый пулемёт: сесть / слезть
function nearNest() { if (PL.team !== 'h' || PL.robot) return null; for (const n of nests) if (Math.hypot(n.pos.x - P.x, n.pos.z - P.z) < 3.2) return n; return null; }
function mount(n) {
  B.mounted = n; B.prevW = S.rifle;
  SS.selectRifle(WIDX('kord'));
  const back = _v.set(Math.sin(n.yaw), 0, Math.cos(n.yaw));
  P.x = n.pos.x + back.x * 0.9; P.z = n.pos.z + back.z * 0.9; P.stance = 0; P.yaw = n.yaw; P.pitch = 0;
  n.piv.visible = false;
  feed('Вы за «Кордом». Длинными очередями — по роботам', 'me');
}
function dismount() {
  const n = B.mounted; if (!n) return;
  n.piv.visible = true; B.mounted = null;
  SS.selectRifle(B.prevW != null ? B.prevW : B.loadout[0]);
}
HOOK.use = function () { if (!B.active || !PL.alive) return; if (B.mounted) dismount(); else { const n = nearNest(); if (n) mount(n); } };
HOOK.move = function () {
  if (!B.active) return;
  if (B.mounted) { const n = B.mounted; const back = _v.set(Math.sin(n.yaw), 0, Math.cos(n.yaw)); P.x = n.pos.x + back.x * 0.9; P.z = n.pos.z + back.z * 0.9; P.yaw = n.yaw + clamp(angDiff(P.yaw, n.yaw), -1.2, 1.2); }
};
HOOK.fired = function () { PL.firedT = B.t; };

/* ================= анимация ================= */
function poseHuman(u, dt) {
  const r = u.rig, T = u.T;
  if (!u.pv) u.pv = initPV(PV_H, { hipsY: 0.95 });
  if (u.down) {
    const D = DOWN_H[u.pose];
    for (const k of PV_H) T[k] = D[k];
    if (u.writhe) { const w = SS.getSimT() + u.id; T.shLx += Math.sin(w * 1.3) * 0.25; T.faL += Math.sin(w * 1.7) * 0.3; T.headX += Math.sin(w * 0.9) * 0.15; T.thL += Math.sin(w * 0.6) * 0.12; }
    blendPV(u, PV_H, dt * 3);
  } else {
    u.crouch = lerp(u.crouch, u.crouchT, Math.min(1, dt * 6));
    const c = u.crouch, run = Math.min(1, u.mv);
    u.ph += dt * (2.6 + run * 7);
    const sw = Math.sin(u.ph) * run;
    T.hipsY = lerp(0.95, 0.42, c) - run * 0.06 + Math.abs(Math.sin(u.ph)) * 0.05 * run;
    T.thL = 1.25 * c + sw * 0.8 + run * 0.15; T.thR = 1.25 * c - sw * 0.8 + run * 0.15;
    T.snL = -2.1 * c - Math.max(0, Math.sin(u.ph + 1.6)) * 1.3 * run - run * 0.2;
    T.snR = -2.1 * c - Math.max(0, Math.sin(u.ph + 1.6 + Math.PI)) * 1.3 * run - run * 0.2;
    u.kick *= Math.exp(-dt * 12);
    T.torX = -0.5 * c - 0.3 * run + (1 - run) * u.pitch * 0.5 + u.kick * 0.08;
    T.torY = Math.sin(u.ph) * 0.12 * run + u.head * 0.25; T.headX = u.pitch * 0.3 * (1 - run) + run * 0.25; T.headY = u.head * 0.75;
    if (u.cls === 'rpg') { T.shRx = 2.4; T.shRz = 0.2; T.faR = 1.2; T.shLx = 1.3; T.shLz = -0.3; T.faL = 0.4; T.gunX = u.pitch * 0.4; }
    else if (run > 0.3) { T.shRx = 0.9; T.shRz = 0; T.faR = 1.1; T.shLx = 1.1; T.shLz = -0.4; T.faL = 0.9; T.gunX = 0.7; }
    else { T.shRx = 1.3 + u.pitch * 0.5; T.shRz = 0; T.faR = 0.35; T.shLx = 1.45 + u.pitch * 0.5; T.shLz = -0.35; T.faL = 0.2; T.gunX = u.pitch * 0.5 - c * 0.6 + u.kick * 0.05; }
    if (u.reloadT > 0) { T.shLx = 0.7; T.faL = 1.4; T.gunX -= 0.4; }
    if (u.healing) { T.hipsY = 0.5; T.thL = 1.5; T.snL = -1.6; T.thR = 0.2; T.snR = -1.7; T.torX = -0.7; T.shLx = 1.1; T.shRx = 1.0; T.faL = 0.6 + Math.sin(B.t * 6) * 0.3; T.faR = 0.8; T.gunX = -0.9; }
    if (u.mortar) { T.shLx = 0.9 + u.kick * 0.8; T.shRx = 0.9 + u.kick * 0.8; T.faL = 0.8; T.faR = 0.8; T.gunX = -0.9; }
    blendPV(u, PV_H, dt * 11);
  }
  const v = u.pv;
  r.hips.position.y = v.hipsY;
  r.thL.rotation.set(v.thL, 0, 0); r.thR.rotation.set(v.thR, 0, 0);
  r.snL.rotation.set(v.snL, 0, 0); r.snR.rotation.set(v.snR, 0, 0);
  r.torso.rotation.set(v.torX, v.torY, 0); r.head.rotation.set(v.headX, v.headY, 0);
  r.shL.rotation.set(v.shLx, 0, v.shLz); r.shR.rotation.set(v.shRx, 0, v.shRz);
  r.faL.rotation.set(v.faL, 0, 0); r.faR.rotation.set(v.faR, 0, 0);
  r.gun.rotation.set(v.gunX, 0, 0);
  if (u.fall) updateFall(u, dt);
  r.root.rotation.set(0, u.yaw, 0); r.root.position.copy(u.pos);
  if (u.fall) r.tilt.quaternion.setFromAxisAngle(u.fall.ax, u.fall.th); else r.tilt.quaternion.identity();
}
const PV_R = ['hipsY', 'thL', 'thR', 'snL', 'snR', 'torX', 'torY', 'torZ', 'headX', 'headY', 'shLx', 'shLz', 'shRx', 'shRz', 'faL', 'faR'];
function poseRobot(u, dt) {
  const r = u.rig, T = u.T;
  if (!u.pv) u.pv = initPV(PV_R, { hipsY: 1.2 });
  if (u.alive) u.crouch = lerp(u.crouch, u.crouchT || 0, Math.min(1, dt * 4));
  const m = Math.min(1.6, u.mv), c = u.crouch, runK = clamp((m - 1) / 0.6, 0, 1);
  if (u.alive && !u.crawl) u.ph += dt * TAU * (0.9 + m * 0.75);
  const sw = Math.sin(u.ph) * (0.5 + 0.25 * runK) * Math.min(1, m);
  const limpL = u.Z.thighL.int < 0.4 ? 0.5 : 1, limpR = u.Z.thighR.int < 0.4 ? 0.5 : 1;
  u.kick *= Math.exp(-dt * 12);
  T.hipsY = 1.2 - Math.abs(Math.cos(u.ph)) * (0.06 + 0.06 * runK) * Math.min(1, m) - c * 0.5;
  T.thL = sw * limpL + c * 1.25 + runK * 0.15; T.thR = -sw * limpR + c * 1.25 + runK * 0.15;
  T.snL = -Math.max(0, Math.sin(u.ph + 1.3)) * (0.8 + runK * 0.6) * Math.min(1, m) - c * 1.7; T.snR = -Math.max(0, Math.sin(u.ph + 1.3 + Math.PI)) * (0.8 + runK * 0.6) * Math.min(1, m) - c * 1.7;
  T.torX = -0.08 * Math.min(1, m) - 0.28 * runK - c * 0.15 + u.pitch * 0.3 + u.kick * 0.05; T.torY = clamp(angDiff(u.aimYaw, u.yaw), -0.9, 0.9) * 0.7; T.torZ = Math.sin(u.ph) * 0.04 * Math.min(1, m);
  T.headX = u.pitch * 0.4; T.headY = clamp(u.head - T.torY, -1, 1) * 0.8;
  T.shLx = -sw * (0.6 + runK * 0.6) + 0.2; T.shLz = -0.08; T.faL = 0.35 + runK * 0.6;
  T.shRx = 1.35; T.shRz = 0; T.faR = 0.25;
  if (u.crawl) { T.hipsY = 1.2; T.thL = 0.05; T.thR = -0.05; T.snL = -0.1; T.snR = -0.2; T.torX = 0.25; T.torY = 0; T.shLx = 2.9; T.shRx = 2.7; T.faL = 0.2; T.faR = 0.1; T.headX = -0.9; }
  if (!u.alive) {
    u.buckle = Math.min(1, u.buckle + dt * 2.2);
    const bk = u.buckle;
    T.hipsY = 1.2 - 0.35 * bk; T.thL += 0.7 * bk; T.thR += 0.9 * bk; T.snL -= 1.1 * bk; T.snR -= 1.3 * bk;
    T.shLx = 0.2 + 1.6 * bk; T.shLz = -0.5 * bk; T.shRx = 0.4 + 1.2 * bk; T.shRz = 0.6 * bk; T.faL = 0.4; T.faR = 0.3; T.headX = 0.5 * bk; T.torX = -0.4 * bk; T.headY = 0;
  }
  blendPV(u, PV_R, dt * (u.alive ? 10 : 6));
  const v = u.pv;
  r.hips.position.y = v.hipsY;
  r.thL.rotation.set(v.thL, 0, 0); r.thR.rotation.set(v.thR, 0, 0);
  r.snL.rotation.set(v.snL, 0, 0); r.snR.rotation.set(v.snR, 0, 0);
  r.torso.rotation.set(v.torX, v.torY, v.torZ); r.head.rotation.set(v.headX, v.headY, 0);
  r.shL.rotation.set(v.shLx, 0, v.shLz); r.shR.rotation.set(v.shRx, 0, v.shRz);
  r.faL.rotation.set(v.faL, 0, 0); r.faR.rotation.set(v.faR, 0, 0);
  if (u.fall) updateFall(u, dt);
  u.staggerPh += dt * 13;
  r.root.rotation.set(0, u.yaw, u.alive ? Math.sin(u.staggerPh) * u.stagger * 0.1 : 0);
  r.root.position.copy(u.pos);
  if (u.fall) r.tilt.quaternion.setFromAxisAngle(u.fall.ax, u.fall.th); else r.tilt.quaternion.identity();
}
function aimRobotGun(u) {
  if (!u.alive || !canShoot(u)) return;
  const g = u.rig.gun;
  g.parent.matrixWorld.decompose(_v, _q2, _v2);
  _e.set(u.pitch, u.aimYaw, 0, 'YXZ'); _q.setFromEuler(_e);
  g.quaternion.copy(_q2.invert().multiply(_q));
  g.updateMatrixWorld(true);
}
const SCORCH = new THREE.Color(0x231d18), _c = new THREE.Color(), DEADC = new THREE.Color(0x3a382f), WHITE = new THREE.Color(1, 1, 1), VOFF = new THREE.Color(0.15, 0.03, 0.02);
function renderUnits(dt) {
  for (const k in PT) PT[k].n = 0;
  const flick = (SS.getSimT() * 17) % 1 > 0.5;
  for (const u of units) {
    if (u.team === 'h') poseHuman(u, dt); else poseRobot(u, dt);
    u.right.set(Math.cos(u.yaw), 0, -Math.sin(u.yaw));
    u.rig.root.updateMatrixWorld(true);
    if (u.team === 'r') { aimRobotGun(u); updateLaser(u); }
    u.rig.hips.getWorldPosition(u.bc);
    for (const p of u.rig.parts) {
      if (u.gone.has(p.zone)) continue;
      const pt = PT[p.key]; if (pt.n >= pt.max) continue;
      pt.mesh.setMatrixAt(pt.n, p.o.matrixWorld);
      _c.copy(WHITE);
      if (u.team === 'r') {
        const Z = u.Z[p.zone];
        if (p.key === 'r_eye') { if (!u.alive || (Z && Z.hp < Z.max * 0.5 && flick)) _c.copy(VOFF); }
        else { if (Z) _c.lerp(SCORCH, (1 - Z.int) * 0.7); if (!u.alive) _c.lerp(SCORCH, 0.45); }
      } else if (u.down) _c.lerp(DEADC, 0.25);
      pt.mesh.setColorAt(pt.n, _c);
      pt.n++;
    }
  }
  for (const k in PT) { const p = PT[k]; p.mesh.count = p.n; p.mesh.instanceMatrix.needsUpdate = true; p.mesh.instanceColor.needsUpdate = true; }
}
HOOK.onVision = function (m) {
  const hot = m === 'thermal';
  unitMat.emissive.setRGB(hot ? 0.55 : 0, hot ? 0.55 : 0, hot ? 0.55 : 0);
  laserMat.opacity = m === 'nvg' ? 1 : 0.8;
};

/* ================= ход боя ================= */
function clearBattle() {
  units.forEach((u) => { if (u.laser) { scene.remove(u.laser.l); scene.remove(u.laser.dot); } });
  units.length = 0; squads.length = 0; smokers.length = 0; B.shells.length = 0;
  TK.h.clear(); TK.r.clear();
  rockets.forEach((r) => scene.remove(r.mesh)); rockets.length = 0;
  craters.forEach((c) => scene.remove(c)); craters.length = 0;
  debris.forEach((d) => scene.remove(d.g)); debris.length = 0;
  smokes.forEach((s) => s.sprites.forEach((sp) => scene.remove(sp))); smokes.length = 0;
  for (const k in PT) PT[k].mesh.count = 0;
  slots.front.concat(slots.rear).forEach((s) => { s.used = null; });
  covers.forEach((cv) => cv.pts.h.concat(cv.pts.r).forEach((p) => { p.used = null; }));
  forestSpots.forEach((p) => { p.used = null; });
  nests.forEach((n) => { n.crew = []; n.piv.visible = true; });
  mortars.forEach((m) => { m.crew = []; m.cool = rnd(8, 14); m.spread = 45; m.shots = 0; m.tgt = null; });
  FL.on = false;
}
const SQN = ['1-е отделение', '2-е отделение', '3-е отделение', '4-е отделение', '5-е отделение', '6-е отделение', '7-е отделение'];
const RSQN = ['Штурмовая группа «Альфа»', 'Группа «Бета»', 'Группа «Гамма»', 'Группа «Дельта»', 'Группа «Эпсилон»', 'Группа «Дзета»'];
function startBattle() {
  if (!BATTLE_MAP) { S.gmode = 'battle'; S.autostart = true; try { localStorage.setItem('stepSniper', JSON.stringify(S)); } catch (e) { /* ignore */ } location.reload(); return; }
  clearBattle();
  const N = clamp(S.teamN || 6, 4, 12);
  B.side = S.side === 'r' ? 'r' : 'h';
  Object.assign(B, { N, active: true, over: false, t: 0, rumbleT: 6, artLeft: 3, kills: 0, lost: 0, robotsKilled: 0, humansDown: 0, hitsE: 0, wave: 1, contactT: -99, rContactT: -99, lullSaid: false,
    startShots: STATS.shots, deadT: 0, dmgA: 0, dirs: [], brainT: 0, phaseH: 'hold', flareT: rnd(10, 20), rMortarT: rnd(70, 90), hArtT: rnd(50, 70), mounted: null, spect: false, load: new Map(), loadR: new Map() });
  HOOK.battle = true; HOOK.over = false; HOOK.dead = false; HOOK.camRoll = 0; HOOK.camDY = 0; HOOK.speedMul = 1; HOOK.dispMul = 1;
  HOOK.playerTeam = B.side;
  fieldGroup.visible = true; SS.setRangeVisible(false);
  PL.team = B.side; PL.robot = B.side === 'r'; PL.alive = true; PL.hp = 100; PL.lastHit = -99; PL.kit = 1; PL.calledMedic = false; PL.healer = null; PL.firedT = -99; PL.squad = null;
  P.robot = PL.robot;
  if (PL.robot) { PL.Z = {}; for (const z in PZ_DEF) PL.Z[z] = { armor: PZ_DEF[z][0], hp: PZ_DEF[z][1], max: PZ_DEF[z][1], int: 1 }; }
  const nH = 3 * N - (B.side === 'h' ? 1 : 0);
  const nR = N - (B.side === 'r' ? 1 : 0);
  // --- люди
  const fs = slots.front.slice().sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x));
  let left = nH;
  const take = () => fs.find((q) => !q.used) || slots.rear.find((q) => !q.used);
  const place = (cls, s) => { const u = makeUnit('h', cls, s.pos, s.yaw); s.used = u; u.spot = s; u.slot = s; u.home = s; return u; };
  if (B.side === 'h') {
    const ps = fs[0]; ps.used = PL; P.x = ps.pos.x; P.z = ps.pos.z + 0.3; P.yaw = 0; P.pitch = 0.02;
    const trio = { id: 'trio', team: 'h', name: 'Тройка', members: [], order: 'hold', player: true, orderT: 0 };
    ['rifle', 'mg', 'medic'].forEach((c) => { const s = fs.filter((q) => !q.used).sort((a, b) => a.pos.distanceTo(ps.pos) - b.pos.distanceTo(ps.pos))[0]; const u = place(c, s); u.squad = trio; trio.members.push(u); left--; });
    squads.push(trio); PL.squad = trio;
  }
  const crewN = nH >= 14 ? 2 : nH >= 6 ? 1 : 0;
  for (let i = 0; i < crewN && left >= 2; i++) { const n = nests[i]; for (let k = 0; k < 2; k++) { const u = makeUnit('h', 'hmg', n.pos, n.yaw); u.nest = n; n.crew.push(u); left--; } n.wp = W_('kord'); }
  const morN = nH >= 20 ? 2 : nH >= 9 ? 1 : 0;
  for (let i = 0; i < morN && left >= 2; i++) { const m = mortars[i]; for (let k = 0; k < 2; k++) { const p = m.pos.clone().add(_v.set(k ? 1.1 : -1.1, 0, 0.6)); p.y = terrainH(p.x, p.z); const u = makeUnit('h', 'mortar', p, Math.PI); u.mortar = m; m.crew.push(u); left--; } }
  const snN = nH >= 16 ? 2 : nH >= 8 ? 1 : 0;
  for (let i = 0; i < snN && left > 0; i++) { const s = slots.rear.filter((q) => !q.used).sort((a, b) => Math.abs(a.pos.x - (i ? 40 : -40)) - Math.abs(b.pos.x - (i ? 40 : -40)))[0]; if (s) { place('sniper', s); left--; } }
  const roles = ['lead', 'mg', 'rpg', 'medic', 'rifle', 'rifle'];
  let k = 0;
  while (left > 0) {
    const sq = { id: 'h' + k, team: 'h', name: SQN[k] || (k + 1) + '-е отделение', members: [], order: 'hold', turn: 0 };
    for (let i = 0; i < 6 && left > 0; i++) { const s = take(); if (!s) { left = 0; break; } const u = place(roles[i], s); u.squad = sq; sq.members.push(u); left--; }
    if (sq.members.length) squads.push(sq);
    k++;
  }
  // --- роботы: штурмовые группы на дальних холмах
  const comps = [['assault', 'heavy', 'assault', 'rocket'], ['assault', 'scout', 'assault'], ['assault', 'heavy', 'rocket'], ['assault', 'assault', 'scout', 'heavy']];
  const gN = Math.max(1, Math.round((nR + (B.side === 'r' ? 1 : 0)) / 3.3));
  let made = 0;
  for (let gi = 0; gi < gN; gi++) {
    const n = gi === gN - 1 ? nR - made : Math.min(nR - made, Math.round((nR + (B.side === 'r' ? 1 : 0)) / gN));
    if (n <= 0) continue;
    const route = ROUTES[gi % ROUTES.length];
    const wave = gi < Math.ceil(gN * 0.6) ? 1 : 2;
    const g = { id: 'r' + gi, team: 'r', name: RSQN[gi] || 'Группа ' + (gi + 1), members: [], phase: wave === 1 ? 'march' : 'wait', release: rnd(85, 110), route, wi: 1, turn: 0, smoked: false };
    const comp = comps[gi % comps.length];
    for (let i = 0; i < n; i++) {
      const x = route[0][0] + (i - (n - 1) / 2) * 6, z = route[0][1] - i * 4 - (wave === 2 ? 60 : 0);
      const u = makeUnit('r', comp[i % comp.length], new V3(x, terrainH(x, z), z), 0);
      u.squad = g; g.members.push(u); made++;
    }
    squads.push(g);
  }
  if (B.side === 'r') {
    const g = squads.find((q) => q.team === 'r');
    const r0 = g.route[0]; P.x = r0[0] - 8; P.z = r0[1] + 6; P.yaw = 0; P.pitch = 0.02; PL.squad = g; g.player = false;
  }
  P.stance = 0; P.eye = PL.robot ? 2.15 : 1.62; P.jy = 0; P.vy = 0;
  PL.pos.set(P.x, terrainH(P.x, P.z), P.z);
  // снаряжение
  B.loadout = [];
  const ld = B.side === 'r' ? ['rr', 'rmg', 'rrk'] : [null, 'ak', 'rpg'];
  ld.forEach((id) => { const i = id ? WIDX(id) : (RIFLES[S.rifle].org === 'BOT' || RIFLES[S.rifle].mounted ? WIDX('ak') : S.rifle); if (i >= 0 && B.loadout.indexOf(i) < 0) B.loadout.push(i); });
  RIFLES.forEach((r) => { TUR[r.id].ammo = r.mag; TUR[r.id].reserve = r.type === 'rocket' ? (r.org === 'BOT' ? 3 : 4) : null; });
  SS.selectRifle(B.loadout[0]);
  ['bbar', 'hp', 'feed'].forEach((id) => { $(id).hidden = false; });
  $('bSquad').hidden = B.side !== 'h'; $('bMed').hidden = B.side !== 'h';
  $('feed').innerHTML = ''; $('endScr').hidden = true;
  $('bHl').textContent = B.side === 'h' ? 'ЛЮДИ' : 'РОБОТЫ'; $('bRl').textContent = B.side === 'h' ? 'РОБОТЫ' : 'ЛЮДИ';
  updateArtBtn(); updateMedBtn();
  if (isNight() && SS.VIS.mode === 'off' && B.side === 'r') SS.setVision('thermal');
  feed(B.side === 'h' ? 'Вы — в тройке на первой траншее. Ждём роботов с севера. Наблюдать!' : 'Вы — в штурмовой группе. Цель: высота с траншеями. Вперёд!', 'me');
  SS.updateWeaponUI();
}
function stopBattle() {
  clearBattle();
  B.active = false; HOOK.battle = false; HOOK.dead = false; HOOK.camRoll = 0; HOOK.camDY = 0; HOOK.speedMul = 1; HOOK.dispMul = 1; HOOK.playerTeam = 'h';
  P.robot = false; PL.robot = false;
  fieldGroup.visible = false;
  ['bbar', 'hp', 'feed', 'bArt', 'bSquad', 'bMed', 'bUse', 'sqPanel'].forEach((id) => { $(id).hidden = true; });
  $('endScr').hidden = true; $('dmg').style.opacity = '0';
  RIFLES.forEach((r) => { TUR[r.id].reserve = null; });
  if (RIFLES[S.rifle].org === 'BOT' || RIFLES[S.rifle].mounted) SS.selectRifle(0);
  P.x = 0; P.z = 0.6; P.yaw = 0; P.eye = 1.62;
}
function endBattle(win, why, final) {
  if (B.over) return;
  if (final) { B.over = true; HOOK.over = true; }
  const shots = STATS.shots - B.startShots;
  const mm = Math.floor(B.t / 60), ss = Math.round(B.t % 60);
  const hAll = units.filter((u) => u.team === 'h').length, rAll = units.filter((u) => u.team === 'r').length;
  $('endE').textContent = final ? (win ? (B.side === 'h' ? 'Высота удержана, противник уничтожен' : 'Высота взята') : 'Бой проигран') : 'Вы выбыли из боя';
  $('endT').textContent = final ? (win ? 'Победа' : why) : why;
  $('endP').innerHTML = 'Длительность: ' + mm + ' мин ' + ss + ' с<br>Роботов уничтожено: ' + B.robotsKilled + ' из ' + rAll + (B.side === 'r' ? ' (+ вы)' : '') + '<br>Людей выбыло: ' + B.humansDown + ' из ' + hAll + (B.side === 'h' ? ' (+ вы)' : '') +
    '<br>Лично вами: ' + B.kills + '<br>Ваши выстрелы: ' + shots + ', попаданий: ' + B.hitsE + (shots ? ' (' + Math.round(B.hitsE / shots * 100) + '%)' : '') + (final ? '' : '<br><br>Бой продолжается без вас.');
  $('endWatch').hidden = !!final;
  setTimeout(() => { $('endScr').hidden = false; try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } }, win ? 1500 : 400);
}
$('endAgain').addEventListener('click', () => { $('endScr').hidden = true; startBattle(); SS.setAim('hip'); });
$('endMenu').addEventListener('click', () => { $('endScr').hidden = true; SS.openMenu(); });
$('endWatch').addEventListener('click', () => {
  $('endScr').hidden = true; B.spect = true; HOOK.camRoll = 0; HOOK.camDY = 0;
  P.x = 0; P.z = HILL.cz - 60; P.eye = 3; P.yaw = 0; P.pitch = -0.05;
});

HOOK.startBattle = startBattle;
HOOK.stopBattle = stopBattle;
HOOK._dbg = { units, B, PL, explode, squads, covers, partDamage, hurtHuman, TK, smokes, nests, mortars, squadCmd };
HOOK.nextWeapon = function () {
  if (!B.active) { SS.selectRifle(S.rifle + 1); return; }
  if (B.mounted) return;
  const i = (B.loadout.indexOf(S.rifle) + 1) % B.loadout.length;
  SS.selectRifle(B.loadout[i]);
};
HOOK.aimUI = function (m) { $('bArt').hidden = !(B.active && m === 'bino'); };
HOOK.lookScale = function () { return B.assistNear ? 0.6 : 1; };

HOOK.update = function (dt, sdt) {
  updateRockets(sdt);
  updateDebris(sdt);
  updateSmokes(sdt);
  if (!B.active) { if (units.length) renderUnits(dt); return; }
  if (!$('menu').hidden) { renderUnits(0); return; }
  B.t += dt;
  const gy = terrainH(P.x, P.z);
  PL.vel.set((P.x - PL.pos.x) / Math.max(dt, 1e-3), 0, (P.z - PL.pos.z) / Math.max(dt, 1e-3));
  PL.pos.set(P.x, gy, P.z);
  PL.right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  PL.crouch = P.stance > 0 ? 1 : 0;
  if (!B.over) {
    B.brainT -= sdt;
    if (B.brainT <= 0) { B.brainT = 1.5; brainHumans(); brainRobots(); }
    for (const u of units) {
      if (!u.alive) continue;
      if (u.team === 'h') updateHuman(u, sdt); else updateRobot(u, sdt);
    }
    updateShells(sdt);
    updateMortars(sdt);
    B.rumbleT -= dt;
    if (B.rumbleT <= 0) { B.rumbleT = rnd(7, 16); const AC = SS.getAC(); if (AC) SS.noiseHit(AC.currentTime, 2.5, 'lowpass', 120, 0.18); }
    if (PL.alive && PL.robot && B.t - PL.lastHit > 6) { for (const z in PL.Z) { const Z = PL.Z[z]; if (Z.hp > 0 && Z.hp < Z.max) Z.hp = Math.min(Z.max, Z.hp + dt * Z.max * 0.01); } PL.hp = PL.Z.torso.hp / PL.Z.torso.max * 100; }
    // итоги
    const hAlive = units.some((u) => u.team === 'h' && u.alive) || (PL.alive && PL.team === 'h');
    const rAlive = units.some((u) => u.team === 'r' && u.alive) || (PL.alive && PL.team === 'r');
    const rInTrench = units.filter((u) => u.team === 'r' && u.alive && !u.crawl && Math.hypot(u.pos.x, u.pos.z - HILL.cz) < 160).length;
    const hHold = units.filter((u) => u.team === 'h' && u.alive && Math.hypot(u.pos.x, u.pos.z - HILL.cz) < 170).length + (PL.alive && PL.team === 'h' ? 1 : 0);
    if (!rAlive) endBattle(B.side === 'h', 'Все роботы уничтожены', true);
    else if (!hAlive || (rInTrench >= 2 && hHold <= 2)) endBattle(B.side === 'r', 'Высота потеряна', true);
  }
  if (!PL.alive && !B.spect) {
    B.deadT += dt;
    HOOK.camRoll = lerp(HOOK.camRoll || 0, 0.7, Math.min(1, dt * 2));
    HOOK.camDY = lerp(HOOK.camDY || 0, -(P.eye - 0.3), Math.min(1, dt * 2));
    if (B.deadT > 2.5 && !B.over && $('endScr').hidden && !B.diedShown) { B.diedShown = true; endBattle(false, PL.robot ? 'Робот уничтожен' : 'Вы тяжело ранены', false); }
  }
  if (PL.alive) B.diedShown = false;
  updateFlare(dt);
  for (let i = smokers.length - 1; i >= 0; i--) {
    const s = smokers[i]; s.t -= dt; s.acc += dt;
    if (s.t <= 0) { smokers.splice(i, 1); continue; }
    if (s.acc > (s.big ? 0.22 : 0.45)) { s.acc = 0; const p = zonePoint(s.u, s.zone, new V3()); SS.spawnPuff(p, s.big ? 0x2b2926 : 0x4a4744, s.big ? 1.6 : 0.7, s.big ? 5 : 3, 1, s.big ? 1.6 : 0.9, 0.1); if (s.big && Math.random() < 0.2) sparks(p, 2, 0.25); }
  }
  renderUnits(dt);
  if (B.mounted) { const n = B.mounted; n.piv.rotation.y = P.yaw; n.piv.rotation.x = P.pitch; }
  // HUD
  B.dmgA = Math.max(0, B.dmgA - dt * 0.6);
  const low = PL.alive && PL.hp < 35 ? 0.25 + 0.15 * Math.sin(B.t * 6) : 0;
  $('dmg').style.opacity = Math.min(1, B.dmgA + low).toFixed(3);
  $('dmg').classList.toggle('bot', PL.robot);
  B.dirs = B.dirs.filter((d) => (d.t -= dt) > 0);
  B.hudT -= dt;
  if (B.hudT <= 0) {
    B.hudT = 0.25;
    $('bH').textContent = units.filter((u) => u.team === B.side && u.alive).length + (PL.alive ? 1 : 0);
    $('bR').textContent = units.filter((u) => u.team !== B.side && u.alive).length;
    $('hpFill').style.transform = 'scaleX(' + (Math.max(0, PL.hp) / 100).toFixed(3) + ')';
    $('hpFill').style.background = PL.hp < 35 ? '#ff7a5c' : PL.hp < 65 ? '#f2c94c' : '#9fdc7a';
    $('hpTxt').textContent = Math.max(0, Math.round(PL.hp));
    const nn = nearNest();
    $('bUse').hidden = !(B.mounted || nn);
    $('useTxt').textContent = B.mounted ? 'СЛЕЗТЬ' : 'ЗА ПУЛЕМЁТ';
    updateArtBtn();
  }
};
// помощник прицеливания и метки противника
const _sp = new V3();
function toScreen(p, W, H) { _sp.copy(p).project(camera); if (_sp.z > 1 || _sp.z < -1) return null; return [(_sp.x + 1) / 2 * W, (1 - _sp.y) / 2 * H]; }
HOOK.drawOverlay = function (o, W, H, D) {
  if (!B.active) return;
  B.assistNear = false;
  const assist = S.assist || PL.robot;
  if (assist && PL.alive) {
    const rf = SS.curRifle();
    let bestE = null, bd = 70 * D, bestS = null;
    for (const [e, k] of TK[PL.team]) {
      if (!e.alive || B.t - k.t > 6 || e.isPlayer) continue;
      const head = aimPointOf(e, e.team === 'r' ? 'head' : 'head', new V3()); head.y += e.team === 'r' ? 0.45 : 0.3;
      const s = toScreen(head, W, H); if (!s || s[0] < 0 || s[0] > W || s[1] < 0 || s[1] > H) continue;
      const d = e.pos.distanceTo(PL.pos);
      o.fillStyle = PL.robot ? 'rgba(255,140,60,.9)' : 'rgba(255,70,50,.85)';
      o.beginPath(); o.moveTo(s[0], s[1] + 6 * D); o.lineTo(s[0] - 5 * D, s[1] - 2 * D); o.lineTo(s[0] + 5 * D, s[1] - 2 * D); o.closePath(); o.fill();
      if (d < 1600) { o.font = 10 * D + 'px monospace'; o.textAlign = 'center'; o.fillText(Math.round(d) + ' м', s[0], s[1] - 8 * D); }
      const body = toScreen(aimPointOf(e, 'torso', new V3()), W, H);
      if (body) { const dc = Math.hypot(body[0] - W / 2, body[1] - H / 2); if (dc < bd) { bd = dc; bestE = e; bestS = body; } }
    }
    if (bestE && rf.type !== 'rocket' || bestE && HOOK.rocketElev) {
      // точка, куда навести: с учётом падения пули и упреждения
      const tp = aimPointOf(bestE, 'torso', new V3());
      const Dm = tp.distanceTo(camera.position);
      const need = rf.type === 'rocket' ? HOOK.rocketElev(Dm) : SS.stdElev(rf, Dm) - (SS.elevRad ? SS.elevRad() : 0);
      const tof = Dm / ((rf.type === 'rocket' ? 230 : rf.mv) * 0.85);
      const ap = tp.clone().addScaledVector(bestE.vel || _v.set(0, 0, 0), tof); ap.y += need * Dm;
      const s = toScreen(ap, W, H);
      if (s) {
        o.strokeStyle = 'rgba(120,255,140,.95)'; o.lineWidth = 1.6 * D;
        o.beginPath(); o.moveTo(s[0], s[1] - 7 * D); o.lineTo(s[0] + 7 * D, s[1]); o.lineTo(s[0], s[1] + 7 * D); o.lineTo(s[0] - 7 * D, s[1]); o.closePath(); o.stroke();
        o.beginPath(); o.moveTo(bestS[0], bestS[1]); o.lineTo(s[0], s[1]); o.setLineDash([3 * D, 3 * D]); o.stroke(); o.setLineDash([]);
        if (Math.hypot(s[0] - W / 2, s[1] - H / 2) < 24 * D) B.assistNear = true;
      }
    }
  }
  if (PL.robot && PL.alive) {
    o.fillStyle = 'rgba(255,90,30,0.035)'; o.fillRect(0, 0, W, H);
    if (PL.Z.head.hp <= 0 || (PL.Z.head.hp < PL.Z.head.max * 0.3 && Math.random() < 0.3)) { o.fillStyle = 'rgba(200,200,200,' + (0.08 + Math.random() * 0.1) + ')'; for (let i = 0; i < 40; i++) o.fillRect(Math.random() * W, Math.random() * H, 30 * D, 2 * D); }
    const x0 = 14 * D, y0 = 92 * D, s = 6 * D;
    const col = (z) => { const Z = PL.Z[z]; const f = Math.max(0, Z.hp / Z.max); return Z.hp <= 0 ? 'rgba(60,60,60,.8)' : 'rgba(' + Math.round(255 - 150 * f) + ',' + Math.round(80 + 140 * f) + ',60,.85)'; };
    o.fillStyle = col('head'); o.fillRect(x0 + s * 1.5, y0, s * 1.6, s * 1.4);
    o.fillStyle = col('torso'); o.fillRect(x0 + s, y0 + s * 1.6, s * 2.6, s * 3);
    o.fillStyle = col('armL'); o.fillRect(x0, y0 + s * 1.6, s * 0.8, s * 3);
    o.fillStyle = col('armR'); o.fillRect(x0 + s * 3.8, y0 + s * 1.6, s * 0.8, s * 3);
    o.fillStyle = col('legs'); o.fillRect(x0 + s, y0 + s * 4.8, s * 1.1, s * 3); o.fillRect(x0 + s * 2.5, y0 + s * 4.8, s * 1.1, s * 3);
  }
  // тройка: метки своих бойцов
  if (PL.squad && PL.alive && !PL.robot) {
    for (const m of PL.squad.members) {
      if (!m.alive) continue;
      const s = toScreen(_v.set(m.pos.x, m.pos.y + 2.1, m.pos.z), W, H); if (!s) continue;
      o.fillStyle = 'rgba(120,200,255,.85)'; o.font = 600 * 1 + ' ' + 10 * D + 'px monospace'; o.textAlign = 'center';
      o.fillText(m.cls === 'medic' ? '✚' : '▼', s[0], s[1]);
    }
  }
  const R = Math.min(W, H) * 0.32;
  for (const d of B.dirs) {
    const a = d.a - Math.PI / 2;
    o.strokeStyle = 'rgba(255,60,40,' + Math.min(1, d.t).toFixed(2) + ')'; o.lineWidth = 6 * D;
    o.beginPath(); o.arc(W / 2, H / 2, R, a - 0.25, a + 0.25); o.stroke();
  }
};
})();
