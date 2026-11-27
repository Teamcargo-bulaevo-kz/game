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
const bagTex = (function () {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#a8977a'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) { x.fillStyle = 'rgba(60,45,25,.12)'; x.fillRect(i, 0, 1, 64); x.fillRect(0, i, 64, 1); }
  for (let i = 0; i < 160; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(40,30,15,.18)' : 'rgba(255,245,220,.12)'; x.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 3, 1 + Math.random() * 2); }
  const g = x.createRadialGradient(32, 32, 10, 32, 32, 46); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,20,10,.45)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(50,35,20,.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(4, 8); x.lineTo(60, 8); x.stroke();
  return new THREE.CanvasTexture(c);
})();
const bagMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.2, 0.34), new THREE.MeshLambertMaterial({ color: 0xe8e0d0, map: bagTex }), 4400);
bagMesh.count = 0; bagMesh.castShadow = SHD; bagMesh.receiveShadow = SHD; fieldGroup.add(bagMesh);
let nBags = 0;
const dummy = new THREE.Object3D();
const _bc = new THREE.Color();
function bag(x, y, z, yaw) { if (nBags >= 4400) return; dummy.position.set(x, y, z); dummy.rotation.set(0, yaw + gauss() * 0.08, gauss() * 0.03); dummy.scale.set(1 + gauss() * 0.05, 1 + gauss() * 0.08, 1); dummy.updateMatrix(); bagMesh.setMatrixAt(nBags, dummy.matrix); const k = 0.82 + Math.random() * 0.2; _bc.setRGB(k, k * (0.97 + Math.random() * 0.05), k * (0.92 + Math.random() * 0.08)); nBags++; }
// процедурная текстура земли: комья, трещины, следы лопаты
function earthTex(base, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  let r = seed || 1; const R = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < 900; i++) { const v = Math.floor(R() * 60 - 30); x.fillStyle = 'rgba(' + (v > 0 ? '255,240,210,' + v / 300 : '20,12,6,' + -v / 160) + ')'; const s = 1 + R() * 4; x.fillRect(R() * 128, R() * 128, s, s * (0.5 + R())); }
  x.strokeStyle = 'rgba(25,16,8,.35)'; x.lineWidth = 1;
  for (let i = 0; i < 14; i++) { x.beginPath(); let px = R() * 128, py = R() * 128; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += R() * 16 - 8; py += R() * 10; x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(70,90,40,' + (0.25 + R() * 0.3) + ')'; x.fillRect(R() * 128, R() * 30, 1, 2 + R() * 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const kordGeo = merge([BX(0.12, 0.16, 0.9, 0, 0, -0.2, 0x262a24), CY(0.03, 0.03, 1.1, 0, 0.02, -1.1, 0x161816, Math.PI / 2), BX(0.06, 0.06, 0.12, 0, 0.02, -1.66, 0x161816), BX(0.16, 0.18, 0.2, 0.14, -0.06, -0.15, 0x3d4a2c),
  BX(0.04, 0.12, 0.04, 0, 0.12, -0.05, 0x111111), BX(0.3, 0.04, 0.04, 0, -0.05, 0.32, 0x222222)]);
const tripodGeo = merge([BX(0.08, 0.5, 0.08, 0, 0.75, 0, 0x222622), BX(0.05, 0.9, 0.05, -0.4, 0.4, 0.3, 0x222622, 0.4, 0, -0.45), BX(0.05, 0.9, 0.05, 0.4, 0.4, 0.3, 0x222622, 0.4, 0, 0.45), BX(0.05, 0.9, 0.05, 0, 0.4, -0.45, 0x222622, -0.5)]);
const mortarGeo = merge([CY(0.045, 0.045, 1.25, 0, 0.55, 0, 0x2f3a2a, 0.6), BX(0.5, 0.05, 0.5, 0, 0.03, 0.32, 0x252a24), BX(0.03, 0.7, 0.03, -0.18, 0.33, -0.25, 0x252a24, 0.3, 0, -0.3), BX(0.03, 0.7, 0.03, 0.18, 0.33, -0.25, 0x252a24, 0.3, 0, 0.3)]);
let CAMPFIRE = null;
const crates = [];
const drops = [];
const dropGeoH = merge([BX(0.06, 0.08, 0.75, 0, 0.05, 0, 0x1d1e1c), BX(0.04, 0.12, 0.05, 0, 0.0, 0.12, 0x3a2a22), BX(0.05, 0.07, 0.22, 0, 0.04, 0.34, 0x3a2a22)]);
const dropGeoR = merge([BX(0.12, 0.13, 0.95, 0, 0.07, 0, 0x30353c), BX(0.05, 0.05, 0.3, 0, 0.1, -0.55, 0x16181c), BX(0.06, 0.16, 0.08, 0, 0.0, 0.2, 0x5a6068)]);
const DROPW = { assault: 'rr', heavy: 'rmg', scout: 'rsn', rocket: 'rrk', mortar: 'rr', mg: 'pkm', sniper: 'svd', rpg: 'rpg' };
function addDrop(u) {
  const id = DROPW[u.cls] || 'ak', bot = isBot(u);
  const m = new THREE.Mesh(bot ? dropGeoR : dropGeoH, lamV);
  const x = u.pos.x + gauss() * 0.6, z = u.pos.z + gauss() * 0.6;
  m.position.set(x, terrainH(x, z) + 0.04, z); m.rotation.set(0, Math.random() * TAU, Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) * 0.95); scene.add(m);
  drops.push({ id, pos: new V3(x, terrainH(x, z), z), mesh: m });
  if (drops.length > 40) scene.remove(drops.shift().mesh);
}
function nearDrop() { if (!B.active || !PL.alive) return null; let b = null, bd = 2.4; for (const d of drops) { const dd = Math.hypot(d.pos.x - P.x, d.pos.z - P.z); if (dd < bd) { bd = dd; b = d; } } return b; }
function pickDrop(d) {
  const i = WIDX(d.id), r = RIFLES[i], t = TUR[r.id]; if (i < 0) return;
  scene.remove(d.mesh); drops.splice(drops.indexOf(d), 1);
  if (B.loadout.indexOf(i) >= 0) {
    if (r.type === 'rocket') t.reserve = (t.reserve || 0) + 2; else if (t.mags != null) t.mags += 2; else t.ammo = r.mag;
    feed('Подобраны патроны к ' + r.name, 'me'); SS.updateWeaponUI(); return;
  }
  if (B.loadout.length >= 4) {
    const cur = B.loadout.indexOf(S.rifle), out = cur >= 0 ? cur : B.loadout.length - 1, old = RIFLES[B.loadout[out]];
    if (old) { const m = new THREE.Mesh(old.org === 'BOT' ? dropGeoR : dropGeoH, lamV); m.position.set(P.x + 0.6, terrainH(P.x + 0.6, P.z) + 0.04, P.z); m.rotation.z = 1.5; scene.add(m); drops.push({ id: old.id, pos: new V3(P.x + 0.6, terrainH(P.x + 0.6, P.z), P.z), mesh: m }); }
    B.loadout[out] = i;
  } else B.loadout.push(i);
  t.ammo = r.mag;
  if (r.type === 'rocket') t.reserve = Math.max(t.reserve || 0, 2); else if (r.org === 'BOT') t.mags = null; else t.mags = 2;
  SS.selectRifle(i);
  feed('Подобрано: ' + r.name, 'me');
}
const crateGeo = merge([BX(0.8, 0.42, 0.5, 0, 0.22, 0, 0x4a5232), BX(0.84, 0.05, 0.54, 0, 0.45, 0, 0x39402a), BX(0.5, 0.03, 0.02, 0, 0.3, 0.26, 0xc8b070), BX(0.02, 0.4, 0.02, -0.3, 0.22, 0.26, 0x2a2a22), BX(0.02, 0.4, 0.02, 0.3, 0.22, 0.26, 0x2a2a22)]);
function addCrate(x, z, yaw, dyn) {
  const m = new THREE.Mesh(crateGeo, lamV); const y = terrainH(x, z); m.position.set(x, y, z); m.rotation.y = yaw || 0; m.castShadow = SHD; (dyn ? scene : fieldGroup).add(m);
  const c = { pos: new V3(x, y, z), mesh: m, dyn: !!dyn }; crates.push(c); return c;
}
const tentGeo = merge([BX(3.4, 0.05, 2.1, 0, 0.76, 0.74, 0x55603c, 0.78), BX(3.4, 0.05, 2.1, 0, 0.76, -0.74, 0x4e5937, -0.78), BX(0.06, 1.5, 0.06, 1.6, 0.75, 0, 0x4a3a28), BX(0.06, 1.5, 0.06, -1.6, 0.75, 0, 0x4a3a28)]);
const logGeo = merge([CY(0.09, 0.09, 1.1, 0, 0.09, 0, 0x3a2a1c, 0, 0, Math.PI / 2), CY(0.09, 0.09, 1.1, 0, 0.12, 0, 0x33251a, 0, Math.PI / 2, Math.PI / 2), CY(0.2, 0.25, 0.08, 0, 0.03, 0, 0x2a2622)]);
if (BATTLE_MAP) (function buildHill() {
  const et = earthTex('#7a664a', 7); et.repeat.set(0.45, 0.45);
  const earthM = new THREE.MeshLambertMaterial({ color: 0xd8d0c0, map: et });
  const ft = earthTex('#4f4130', 13); ft.repeat.set(0.4, 0.8);
  const floorM = new THREE.MeshLambertMaterial({ color: 0xc8c0b0, map: ft });
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
  [[-34, 92], [34, 92], [-70, 100], [70, 100]].forEach(([x, z]) => {
    const gy = terrainH(x, z);
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; const bx = x + Math.cos(a) * 2.2, bz = z + Math.sin(a) * 2.2; bag(bx, terrainH(bx, bz) + 0.1, bz, a + Math.PI / 2); bag(bx, terrainH(bx, bz) + 0.3, bz, a + Math.PI / 2); }
    const mm = new THREE.Mesh(mortarGeo, lamV); mm.position.set(x, gy, z); mm.castShadow = SHD; fieldGroup.add(mm);
    mortars.push({ pos: new V3(x, gy, z), mesh: mm, crew: [], cool: rnd(8, 14), tgt: null, spread: 45, shots: 0, team: 'h', fixed: true });
  });
  // ящики с боеприпасами: лагерь и траншеи
  const nearX0 = (arr) => arr.reduce((a, q) => (Math.abs(q.pos.x) < Math.abs(a.pos.x) ? q : a), arr[0]);
  [slots.front, slots.rear].forEach((arr) => { const q = nearX0(arr); addCrate(q.pos.x + Math.cos(q.yaw) * 3.3, q.pos.z - Math.sin(q.yaw) * 3.3, q.yaw, false); });
  addCrate(6, 119, 0.3, false);
  nests.forEach((n) => addCrate(n.pos.x + Math.sin(n.yaw) * 2.6 + Math.cos(n.yaw) * 1.6, n.pos.z + Math.cos(n.yaw) * 2.6 - Math.sin(n.yaw) * 1.6, n.yaw, false));
  [slots.front, slots.rear].forEach((arr) => [-1, 1].forEach((sd) => { const q = arr.reduce((a, s) => (Math.abs(s.pos.x - sd * 95) < Math.abs(a.pos.x - sd * 95) ? s : a), arr[0]); addCrate(q.pos.x + Math.cos(q.yaw) * 1.2, q.pos.z - Math.sin(q.yaw) * 1.2, q.yaw, false); }));
  // лагерь за высотой: палатки и костёр
  CAMPFIRE = new V3(0, terrainH(0, 118), 118);
  const lg = new THREE.Mesh(logGeo, lamV); lg.position.copy(CAMPFIRE); fieldGroup.add(lg);
  [[-17, 110, 0.3], [17, 111, -0.3], [-12, 133, 0.1], [13, 132, -0.15], [0, 140, 0]].forEach(([x, z, r]) => { const t = new THREE.Mesh(tentGeo, lamV); t.position.set(x, terrainH(x, z), z); t.rotation.y = r; t.castShadow = SHD; t.receiveShadow = SHD; fieldGroup.add(t); });
  bagMesh.count = nBags; bagMesh.instanceMatrix.needsUpdate = true;
})();

/* ================= укрытия, леса, дым ================= */
const covers = [];
const FOREST = SS.FORESTS || [];
const forestSpots = [];
const ROCKSP = { h: [], r: [] };   // места за валунами
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
  while (covers.length < 100 && tries++ < 3000) {
    const x = (R() - 0.5) * 1200, z = -230 - R() * 1650;
    if (Math.abs(z - SS.riverZ(x)) < 45) continue;
    if (FOREST.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 6)) continue;
    if (covers.some((c) => Math.hypot(c.c.x - x, c.c.z - z) < 30)) continue;
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
  // каменные россыпи и валуны — укрытие, пуля не пробивает
  { const geo = new THREE.IcosahedronGeometry(1, 0), N = 260; const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, N); let k = 0; const col = new THREE.Color(), dm = new THREE.Object3D();
    const put = (x, z, s) => { if (k >= N) return; const gy = terrainH(x, z); if (gy < -0.6) return; const sx = s * (0.8 + R() * 0.6), sy = s * (0.55 + R() * 0.4), sz = s * (0.8 + R() * 0.6);
      dm.position.set(x, gy + sy * 0.35, z); dm.rotation.set(R() * 0.5, R() * TAU, R() * 0.5); dm.scale.set(sx, sy, sz); dm.updateMatrix(); im.setMatrixAt(k, dm.matrix);
      const v = 0.42 + R() * 0.22; col.setRGB(v * (0.98 + R() * 0.06), v * (0.95 + R() * 0.05), v * (0.88 + R() * 0.06)); im.setColorAt(k++, col);
      SS.addObst({ x, z, r: Math.min(sx, sz) * 0.85, y0: gy - 0.5, y1: gy + sy * 1.2 });
      if (sy > 0.75 && Math.min(sx, sz) > 0.9) { const o = Math.min(sx, sz) * 0.85 + 0.7; ROCKSP.h.push({ pos: new V3(x, terrainH(x, z + o), z + o), used: null }); ROCKSP.r.push({ pos: new V3(x, terrainH(x, z - o), z - o), used: null }); } };
    for (let c = 0; c < 9; c++) { const cx = (R() - 0.5) * 1200, cz = -260 - R() * 1500; if (Math.abs(cz - SS.riverZ(cx)) < 50 || FOREST.some((f) => Math.hypot(cx - f.x, cz - f.z) < f.r + 8)) continue; for (let i = 0; i < 18; i++) put(cx + (R() - 0.5) * 60, cz + (R() - 0.5) * 40, 0.5 + R() * 1.1); }
    for (let i = 0; i < 90; i++) { const x = (R() - 0.5) * 1300, z = -200 - R() * 1800; if (Math.abs(z - SS.riverZ(x)) < 40 || FOREST.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 4)) continue; put(x, z, 0.6 + R() * 1.2); }
    im.count = k; im.castShadow = SHD; im.receiveShadow = SHD; fieldGroup.add(im); }
  // точки на южных опушках лесов — роботы прячутся за деревьями
  for (const f of FOREST) {
    if (f.belt) { if (Math.random() < 0.35) { const x = f.x, z = f.z + 4; forestSpots.push({ pos: new V3(x, terrainH(x, z), z), used: null, forest: true }); } continue; }
    for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + 0.7 * k / 6); const x = f.x + Math.cos(a) * f.r * 0.8, z = f.z + Math.sin(a) * f.r * 0.8; if (terrainH(x, z) < -0.5) continue; forestSpots.push({ pos: new V3(x, terrainH(x, z), z), used: null, forest: true }); }
  }
})();
/* ================= расширение карты: лагерь-укрепление, деревня, мельница, позиции противника ================= */
const SOLID = [];          // сплошные стены (игрок не проходит)
const ELEV = [];           // площадки с лестницей (мельница)
const POI = {};            // именованные позиции для приказов
const CCP = [];            // медпункты: сюда тащат раненых
const VILL = new V3(-35, 0, 292), EVILL = new V3(0, 0, -1985);
let ARMORY = null, MILLB = null;
function wallCover(x, z, ang, len, thick, h, o) {
  o = o || {};
  const gy = o.gy != null ? o.gy : terrainH(x, z);
  const u = new V3(Math.cos(ang), 0, -Math.sin(ang)), nn = new V3(Math.sin(ang), 0, Math.cos(ang));
  const cv = { c: new V3(x, gy, z), u, n: nn, mn: [-len / 2, -0.5, -thick / 2], mx: [len / 2, h, thick / 2], h, pts: { h: [], r: [] }, ns: !!o.ns, struct: true };
  covers.push(cv);
  if (o.solid !== false) SOLID.push({ c: cv.c, u, n: nn, hx: len / 2, hz: thick / 2, elev: o.elev || null });
  if (o.bags) {
    const rows = Math.round(h / 0.2);
    for (let r = 0; r < rows; r++) for (let s = -len / 2 + 0.3 + (r % 2) * 0.28; s < len / 2 - 0.25; s += 0.56) {
      for (let t = 0; t < Math.max(1, Math.round(thick / 0.36)); t++) { const off = (t - (Math.round(thick / 0.36) - 1) / 2) * 0.34; bag(x + u.x * s + nn.x * off, gy + 0.1 + r * 0.2, z + u.z * s + nn.z * off, ang); }
    }
  }
  return cv;
}
function spotAt(x, z, yaw, extra) { const y = terrainH(x, z); return Object.assign({ pos: new V3(x, y, z), yaw: yaw || 0, used: null }, extra || {}); }
if (BATTLE_MAP) (function buildWorld() {
  const plank = 0x6b5238, plankD = 0x4f3c29, white = 0xcfc7b4, roofC = 0x5d3a2c, roofS = 0x6f6f6a, glass = 0x1b2024;
  // дом: стены, окна, дверь, двускатная крыша, труба
  function houseGeo(w, d, h, wall, roof) {
    const it = [BX(w + 0.2, 0.6, d + 0.2, 0, -0.1, 0, 0x6b6458), BX(w, h, d, 0, h / 2, 0, wall)];
    for (const sx of [-1, 1]) for (let k = 0; k < Math.max(1, Math.floor(w / 2.6)); k++) { const ox = -w / 2 + (k + 0.5) * w / Math.max(1, Math.floor(w / 2.6)); it.push(BX(0.8, 0.9, 0.06, ox, h * 0.58, sx * (d / 2 + 0.02), glass)); it.push(BX(0.96, 0.08, 0.1, ox, h * 0.58 - 0.5, sx * (d / 2 + 0.04), white)); }
    it.push(BX(0.06, 0.9, 0.8, w / 2 + 0.02, h * 0.58, 0, glass), BX(0.06, 0.9, 0.8, -w / 2 - 0.02, h * 0.58, 0, glass));
    it.push(BX(0.95, 1.9, 0.08, w * 0.25, 0.95, d / 2 + 0.03, plankD));
    const rh = Math.min(2.2, d * 0.4), sl = Math.hypot(d / 2 + 0.35, rh), a = Math.atan2(rh, d / 2 + 0.35);
    it.push(BX(w + 0.7, 0.12, sl, 0, h + rh / 2, (d / 2 + 0.35) / 2, roof, a), BX(w + 0.7, 0.12, sl, 0, h + rh / 2, -(d / 2 + 0.35) / 2, roof, -a));
    const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rh); tri.lineTo(-d / 2, 0);
    for (const sx of [-1, 1]) { const g = new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(sx * w / 2 - (sx > 0 ? 0.12 : 0), h, 0); it.push([g, wall]); }
    it.push(BX(0.5, 1.4, 0.5, -w * 0.3, h + rh * 0.6, d * 0.15, 0x7a6e62));
    return merge(it);
  }
  function house(x, z, w, d, yaw, wall, roof) {
    let gy = Infinity; for (const sx of [-1, 1]) for (const sz of [-1, 1]) gy = Math.min(gy, terrainH(x + sx * w / 2, z + sz * d / 2));
    const m = new THREE.Mesh(houseGeo(w, d, 2.8, wall, roof), lamV); m.position.set(x, gy, z); m.rotation.y = yaw; m.castShadow = SHD; m.receiveShadow = SHD; fieldGroup.add(m);
    wallCover(x, z, yaw, w, d, 2.8, { gy });
    return { x, z, w, d, yaw, gy };
  }
  function shed(x, z, w, d, yaw, open) {
    const gy = terrainH(x, z), it = [BX(w, 0.08, d, 0, 0.04, 0, plankD), BX(w, 2.4, 0.1, 0, 1.2, -d / 2, plank), BX(0.1, 2.4, d, -w / 2, 1.2, 0, plank), BX(0.1, 2.4, d, w / 2, 1.2, 0, plank)];
    if (!open) it.push(BX(w * 0.55, 2.4, 0.1, -w * 0.22, 1.2, d / 2, plank));
    for (let i = -w / 2 + 0.4; i < w / 2; i += 0.8) it.push(BX(0.04, 2.38, 0.02, i, 1.2, -d / 2 - 0.06, plankD));
    it.push(BX(w + 0.5, 0.1, d + 0.6, 0, 2.55, 0, roofS, 0.08));
    const m = new THREE.Mesh(merge(it), lamV); m.position.set(x, gy, z); m.rotation.y = yaw; m.castShadow = SHD; m.receiveShadow = SHD; fieldGroup.add(m);
    const u = new V3(Math.cos(yaw), 0, -Math.sin(yaw)), nn = new V3(Math.sin(yaw), 0, Math.cos(yaw));
    const W = (lx, lz, len, th, a) => wallCover(x + u.x * lx + nn.x * lz, z + u.z * lx + nn.z * lz, yaw + (a || 0), len, th, 2.4, { gy });
    W(0, -d / 2, w, 0.2); W(-w / 2, 0, d, 0.2, Math.PI / 2); W(w / 2, 0, d, 0.2, Math.PI / 2); if (!open) W(-w * 0.22, d / 2, w * 0.55, 0.2);
    return { m, gy, u, nn };
  }

  // ===== лагерь: укрытие из мешков в 2 м (две комнаты), склад, оружейка =====
  { const cx = -36, cz = 123, W2 = 6, D2 = 4, H = 2.0;
    wallCover(cx, cz - D2, 0, W2 * 2 + 0.5, 0.7, H, { bags: true });                        // северная стена (к противнику)
    wallCover(cx - W2, cz, Math.PI / 2, D2 * 2, 0.7, H, { bags: true });                    // западная
    wallCover(cx + W2, cz, Math.PI / 2, D2 * 2, 0.7, H, { bags: true });                    // восточная
    wallCover(cx, cz - 0.9, Math.PI / 2, D2 * 2 - 2.2, 0.4, H, { bags: true, gy: terrainH(cx, cz) });   // перегородка с проходом
    wallCover(cx - 4.1, cz + D2, 0, 3.8, 0.7, H, { bags: true }); wallCover(cx + 4.1, cz + D2, 0, 3.8, 0.7, H, { bags: true });   // южная, два входа
    const net = new THREE.Mesh(new THREE.PlaneGeometry(W2 * 2 + 1, D2 * 2 + 1), new THREE.MeshLambertMaterial({ color: 0x4d5a33, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    net.rotation.x = -Math.PI / 2; net.position.set(cx, terrainH(cx, cz) + 2.35, cz); fieldGroup.add(net);
    for (const [px, pz] of [[-W2, -D2], [W2, -D2], [-W2, D2], [W2, D2]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), new THREE.MeshLambertMaterial({ color: 0x4a3a28 })); p.position.set(cx + px, terrainH(cx + px, cz + pz) + 1.2, cz + pz); fieldGroup.add(p); }
    POI.camp = { name: 'Лагерь (укрытие)', spots: [[-3.5, -2.3], [-1.8, -2.3], [1.8, -2.3], [3.5, -2.3], [-3.5, 1.5], [3.5, 1.5]].map(([dx, dz]) => spotAt(cx + dx, cz + dz, 0)) };
    CCP.push({ pos: new V3(cx - 3, terrainH(cx - 3, cz + 1), cz + 1), name: 'медпункт в лагере' });
    shed(30, 124, 6, 4.2, 0.05, false);                                                    // склад
    for (let i = 0; i < 4; i++) addCrate(26.5 + i * 1.3, 128.2, 0.05, false);
    const ar = shed(31, 142, 4.2, 3, Math.PI, true);                                        // оружейка (открыта к лагерю)
    const rackGeo = merge([BX(3.2, 0.08, 0.3, 0, 1.0, 0, plankD), BX(3.2, 0.08, 0.3, 0, 0.35, 0, plankD), ...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => BX(0.06, 1.0, 0.08, x, 0.95, -0.05, 0x1f1f1f, 0.12)), ...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => BX(0.07, 0.35, 0.06, x, 0.55, -0.02, 0x4a2e22, 0.12))]);
    const rack = new THREE.Mesh(rackGeo, lamV); rack.position.set(31, ar.gy, 142 + 1.1); rack.rotation.y = Math.PI; fieldGroup.add(rack);
    ARMORY = new V3(31, ar.gy, 142 - 2.2);
  }

  // ===== медпост за гребнем высоты =====
  { const x = 6, z = 66, gy = terrainH(x, z);
    for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; if (Math.abs(a - Math.PI / 2) < 0.4) continue; const bx = x + Math.cos(a) * 2.6, bz = z + Math.sin(a) * 2.6; for (let r = 0; r < 3; r++) bag(bx, terrainH(bx, bz) + 0.1 + r * 0.2, bz, a + Math.PI / 2); }
    const fl = new THREE.Mesh(merge([BX(0.05, 2.6, 0.05, 0, 1.3, 0, 0x4a3a28), BX(0.9, 0.6, 0.02, 0.47, 2.25, 0, 0xffffff), BX(0.55, 0.14, 0.03, 0.47, 2.25, 0, 0xc62020), BX(0.14, 0.45, 0.03, 0.47, 2.25, 0, 0xc62020)]), lamV);
    fl.position.set(x + 2.9, gy, z); fieldGroup.add(fl);
    CCP.push({ pos: new V3(x, gy, z), name: 'медпост за гребнем' }); }
  // ===== деревня — опорный пункт при отходе =====
  { const H_ = [[-82, 262, 7, 5, 0.1, 0xd9cfb8, roofC], [-50, 257, 6, 5, -0.05, 0xc8c3b4, roofS], [-14, 262, 6, 5, 0.08, 0xd2c6a6, roofC], [16, 271, 5, 4.5, 0, 0xb9b2a0, roofS],
      [-96, 300, 6, 5, 0.2, 0xcabfa4, roofS], [-62, 304, 7, 5, 0, 0xd8cfba, roofC], [-22, 300, 6, 5, -0.1, 0xc4bca9, roofC], [8, 310, 5, 5, 0.05, 0xd5cbb3, roofS], [-42, 336, 9, 6, 0, 0xe0d8c8, 0x55301f]];
    const hs = H_.map((h) => house(...h));
    const sp = [];
    hs.forEach((h) => { const u = new V3(Math.cos(h.yaw), 0, -Math.sin(h.yaw)), nn = new V3(Math.sin(h.yaw), 0, Math.cos(h.yaw));
      for (const sx of [-1, 1]) { const lx = sx * (h.w / 2 + 0.8), lz = -h.d / 2 + 0.6; sp.push(spotAt(h.x + u.x * lx + nn.x * lz, h.z + u.z * lx + nn.z * lz, 0)); } });
    // мешки на северной окраине
    [[-86, 246], [-46, 243], [-6, 247], [26, 252]].forEach(([x, z]) => { wallCover(x, z, 0, 6, 0.7, 1.2, { bags: true, solid: false }); for (const o of [-2, 0, 2]) sp.push(spotAt(x + o, z + 1.4, 0)); });
    // забор
    const fence = merge([...Array(12)].map((_, i) => BX(0.08, 1.1, 0.08, -5.5 + i, 0.55, 0, plankD)).concat([BX(12, 0.08, 0.04, 0, 0.8, 0, plank), BX(12, 0.08, 0.04, 0, 0.4, 0, plank)]));
    [[-110, 280, Math.PI / 2], [-110, 318, Math.PI / 2], [30, 292, Math.PI / 2], [-70, 352, 0], [-20, 352, 0]].forEach(([x, z, a]) => { const f = new THREE.Mesh(fence, lamV); f.position.set(x, terrainH(x, z), z); f.rotation.y = a; fieldGroup.add(f); });
    // колодец
    { const w = new THREE.Mesh(merge([CY(0.8, 0.85, 0.9, 0, 0.45, 0, 0x8a8478, 0, 0, 0, 10), BX(0.1, 1.6, 0.1, -0.7, 1.2, 0, plankD), BX(0.1, 1.6, 0.1, 0.7, 1.2, 0, plankD), BX(1.8, 0.1, 1.2, 0, 2.05, 0, roofS, 0.15)]), lamV); w.position.set(-40, terrainH(-40, 282), 282); fieldGroup.add(w); }
    POI.vil = { name: 'Деревня', spots: sp };
    CCP.push({ pos: new V3(-42, terrainH(-42, 344), 344), name: 'медпункт в деревне' });
  }

  // ===== мельница слева: площадка на 7 м, лестница с юга =====
  { const x = -285, z = -45, gy = terrainH(x, z) - 0.2, top = 7.2, hx = 1.9;
    const it = [BX(4.0, 1.0, 4.0, 0, 0.3, 0, 0x7d7464), BX(3.8, top - 0.2, 3.8, 0, top / 2, 0, 0xb3a690), BX(4.6, 0.2, 4.6, 0, top, 0, plankD)];
    for (const [px, pz, w, d] of [[0, -2.25, 4.6, 0.1], [-2.25, 0, 0.1, 4.6], [2.25, 0, 0.1, 4.6]]) it.push(BX(w, 0.9, d, px, top + 0.55, pz, plank));
    for (const sx of [-0.45, 0.45]) it.push(BX(0.07, top + 0.9, 0.07, sx, (top + 0.9) / 2, 2.35, plankD));
    for (let y = 0.35; y < top; y += 0.35) it.push(BX(0.9, 0.05, 0.05, 0, y, 2.35, plankD));
    const m = new THREE.Mesh(merge(it), lamV); m.position.set(x, gy, z); m.castShadow = SHD; m.receiveShadow = SHD; fieldGroup.add(m);
    const bl = new THREE.Group(); bl.position.set(x, gy + top - 1.6, z - 2.05); fieldGroup.add(bl);
    { const parts = []; for (let k = 0; k < 4; k++) { const g = new THREE.BoxGeometry(0.55, 5.0, 0.06); g.translate(0, 2.7, 0); g.rotateZ(k * Math.PI / 2); parts.push([g, 0xd8d0bc]); const g2 = new THREE.BoxGeometry(0.08, 5.2, 0.1); g2.translate(0.3, 2.6, 0.04); g2.rotateZ(k * Math.PI / 2); parts.push([g2, 0x5f4a32]); }
      bl.add(new THREE.Mesh(merge(parts), lamV)); }
    bl.rotation.z = 0.4; MILLB = bl;
    const e = { c: new V3(x, gy, z), u: new V3(1, 0, 0), n: new V3(0, 0, 1), hx, hz: hx, top, lad: [0.55, hx, hx + 1.7] };
    ELEV.push(e);
    wallCover(x, z, 0, 3.8, 3.8, top - 0.1, { gy, elev: e, ns: true });
    const rail = { c: new V3(x, gy, z - 2.25), u: new V3(1, 0, 0), n: new V3(0, 0, 1), mn: [-2.3, top, -0.08], mx: [2.3, top + 1.0, 0.08], h: top + 1, pts: { h: [], r: [] }, struct: true, ns: true }; covers.push(rail);
    const via = new V3(x, terrainH(x, z + hx + 2.4), z + hx + 2.4);
    POI.mill = { name: 'Мельница (верх)', spots: [[-0.9, -1.2], [0.9, -1.2], [0, 0.4]].map(([dx, dz]) => Object.assign(spotAt(x + dx, z + dz, 0), { via, mill: true })) };
    POI.mill.spots.forEach((s) => { s.pos.y = gy + 0.2 + top; });
  }

  // ===== густая посадка справа (деревья — в game.js) =====
  POI.belt = { name: 'Посадка справа', spots: [] };
  for (let zz = -235; zz <= -45; zz += 24) { const x = 285 + 8 * Math.sin(zz / 50) - 6; POI.belt.spots.push(spotAt(x, zz - 6, 0, { forest: true })); }

  // ===== противник: деревня и укрепления у дальних холмов =====
  { const H_ = [[-70, -2005, 7, 5, Math.PI, 0xb8b0a0, roofS], [-30, -2012, 6, 5, Math.PI + 0.1, 0xc2b8a4, roofC], [12, -2000, 6, 5, Math.PI - 0.05, 0xb3ad9e, roofS], [52, -2010, 7, 5, Math.PI, 0xc9bfa8, roofC], [-45, -2045, 8, 6, Math.PI, 0xa9a394, roofS], [25, -2048, 6, 5, Math.PI, 0xbdb4a2, roofC]];
    const ehs = H_.map((h) => house(...h)), esp = [];
    ehs.forEach((h) => { const u = new V3(Math.cos(h.yaw), 0, -Math.sin(h.yaw)), nn = new V3(Math.sin(h.yaw), 0, Math.cos(h.yaw));
      for (const sx of [-1, 1]) { const lx = sx * (h.w / 2 + 0.8), lz = -h.d / 2 + 0.6; esp.push(spotAt(h.x + u.x * lx + nn.x * lz, h.z + u.z * lx + nn.z * lz, Math.PI)); } });
    POI.evil = { name: 'Деревня противника', spots: esp };
    [[-110, -1905], [-60, -1900], [-10, -1898], [40, -1902], [90, -1908]].forEach(([x, z]) => { const cv = wallCover(x, z, 0, 7, 0.7, 1.2, { bags: true, solid: false }); for (const o of [-2.4, 0, 2.4]) cv.pts.r.push({ pos: new V3(x + o, terrainH(x + o, z - 1.4), z - 1.4), used: null }); });
    POI.efort = { name: 'Позиции противника', spots: [] };
  }
  bagMesh.count = nBags; bagMesh.instanceMatrix.needsUpdate = true;
})();
// склейка неподвижной геометрии поля: сотни отдельных мешей → несколько крупных по участкам 300×300 м (меньше вызовов отрисовки)
if (BATTLE_MAP) (function batchStatic() {
  fieldGroup.updateMatrixWorld(true);
  const groups = new Map(), drop = [];
  for (const m of fieldGroup.children) {
    if (!m.isMesh || m.isInstancedMesh || m.children.length || m.material.transparent) continue;
    const g0 = m.geometry; if (!g0.attributes.position) continue;
    const at = ['position', 'normal'].concat(g0.attributes.uv && m.material.map ? ['uv'] : [], g0.attributes.color && m.material.vertexColors ? ['color'] : []);
    if (!g0.attributes.normal) continue;
    const ck = Math.floor(m.position.x / 300) + ':' + Math.floor(m.position.z / 300);
    const key = m.material.uuid + '|' + at.join(',') + '|' + ck;
    let G = groups.get(key); if (!G) groups.set(key, G = { mat: m.material, at, list: [], cast: false });
    G.list.push(m); G.cast = G.cast || m.castShadow; drop.push(m);
  }
  for (const G of groups.values()) {
    if (G.list.length < 2) { G.list.forEach((m) => drop.splice(drop.indexOf(m), 1)); continue; }
    const parts = G.list.map((m) => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(m.matrixWorld); return g; });
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
    for (const name of G.at) {
      const sz = parts[0].attributes[name].itemSize, arr = new Float32Array(n * sz); let o = 0;
      for (const g of parts) { const A = g.attributes[name]; arr.set(A.array.length === A.count * sz ? A.array : Float32Array.from({ length: A.count * sz }, (_, i) => A.array[i]), o); o += A.count * sz; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
    }
    out.computeBoundingSphere();
    const mm = new THREE.Mesh(out, G.mat); mm.castShadow = G.cast; mm.receiveShadow = SHD; mm.matrixAutoUpdate = false; fieldGroup.add(mm);
  }
  drop.forEach((m) => fieldGroup.remove(m));
})();
// площадки (мельница): высота над землёй
function elevY(x, z) {
  for (const e of ELEV) {
    const lx = (x - e.c.x) * e.u.x + (z - e.c.z) * e.u.z, lz = (x - e.c.x) * e.n.x + (z - e.c.z) * e.n.z;
    if (Math.abs(lx) <= e.hx + 0.25 && Math.abs(lz) <= e.hz + 0.25) return e.top + 0.2 + e.c.y - terrainH(x, z);
    if (Math.abs(lx) <= e.lad[0] && lz > e.lad[1] && lz < e.lad[2]) return (e.top + 0.2 + e.c.y - terrainH(x, z)) * (1 - (lz - e.lad[1]) / (e.lad[2] - e.lad[1]));
  }
  return 0;
}
// игрок не проходит сквозь стены и дома; на мельницу — только по лестнице
function solidPush() {
  const cy = elevY(P.x, P.z);
  for (const s of SOLID) {
    const lx = (P.x - s.c.x) * s.u.x + (P.z - s.c.z) * s.u.z, lz = (P.x - s.c.x) * s.n.x + (P.z - s.c.z) * s.n.z;
    const px = s.hx + 0.32 - Math.abs(lx), pz = s.hz + 0.32 - Math.abs(lz);
    if (px <= 0 || pz <= 0) continue;
    if (s.elev && (B.pElev || 0) > 4.5) continue;            // уже наверху
    if (px < pz) { const k = px * Math.sign(lx || 1); P.x += s.u.x * k; P.z += s.u.z * k; }
    else { const k = pz * Math.sign(lz || 1); P.x += s.n.x * k; P.z += s.n.z * k; }
  }
  // наверху и на лестнице: перила не пускают, слезть можно только по лестнице
  if ((B.pElev || 0) > 0.3) for (const e of ELEV) {
    let lx = (P.x - e.c.x) * e.u.x + (P.z - e.c.z) * e.u.z, lz = (P.x - e.c.x) * e.n.x + (P.z - e.c.z) * e.n.z;
    if (Math.abs(lx) > e.hx + 2.5 || lz < -e.hz - 2.5 || lz > e.lad[2] + 1) continue;
    if (lz <= e.hz) { lx = clamp(lx, -(e.hx + 0.05), e.hx + 0.05); lz = Math.max(lz, -(e.hz + 0.05)); }
    else if (Math.abs(lx) > e.lad[0]) { if (lz < e.hz + 0.45) lz = e.hz; else lx = clamp(lx, -e.lad[0] + 0.02, e.lad[0] - 0.02); }
    P.x = e.c.x + e.u.x * lx + e.n.x * lz; P.z = e.c.z + e.u.z * lx + e.n.z * lz;
  }
  B.pElev = elevY(P.x, P.z);
  if (MILLB) MILLB.rotation.z += 0.004;
}

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
  const ot = SS.obstHit(p0, p1); if (ot != null && (best == null || ot < best)) best = ot;
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
  const x0 = Math.min(a.x, b.x) - 8, x1 = Math.max(a.x, b.x) + 8, z0 = Math.min(a.z, b.z) - 8, z1 = Math.max(a.z, b.z) + 8;
  for (const pp of parapets) { if (pp.c.x < x0 || pp.c.x > x1 || pp.c.z < z0 || pp.c.z > z1) continue; const t = segBox(pp, a, b); if (t != null && t * L > 1.2 && (1 - t) * L > 1.2) return false; }
  for (const cv of covers) { if (cv.c.x < x0 || cv.c.x > x1 || cv.c.z < z0 || cv.c.z > z1) continue; const t = segBox(cv, a, b); if (t != null && t * L > 1.2 && (1 - t) * L > 1.5) return false; }
  { const ot = SS.obstHit(a, b); if (ot != null && ot * L > 1.2 && (1 - ot) * L > 1.2) return false; }
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
  if (ELEV.length) { const e = elevY(x, z); if (e) return e; }
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
const MAXH = 210, MAXR = 110;
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
defPart('h_pelvis_l', merge([BX(0.34, 0.2, 0.22, 0, 0, 0, HC.uniD), BX(0.36, 0.05, 0.24, 0, 0.09, 0, 0x2b2b25), BX(0.07, 0.09, 0.05, 0.13, 0.02, -0.12, HC.pouch), BX(0.07, 0.09, 0.05, -0.13, 0.02, -0.12, HC.pouch)]));
defPart('h_torso_l', merge([BX(0.36, 0.26, 0.2, 0, 0.12, 0, HC.uni), BX(0.4, 0.28, 0.22, 0, 0.38, 0, HC.uni), BX(0.42, 0.36, 0.28, 0, 0.32, 0, HC.vest), BX(0.09, 0.11, 0.06, -0.12, 0.22, -0.17, HC.pouch), BX(0.09, 0.11, 0.06, 0, 0.22, -0.17, HC.pouch), BX(0.09, 0.11, 0.06, 0.12, 0.22, -0.17, HC.pouch),
  BX(0.22, 0.06, 0.2, 0, 0.53, 0, HC.vest), BX(0.32, 0.36, 0.15, 0, 0.32, 0.21, HC.pack), BX(0.3, 0.08, 0.17, 0, 0.52, 0.21, 0x4a5236), CY(0.006, 0.006, 0.45, 0.1, 0.64, 0.25, 0x111111), BX(0.14, 0.1, 0.08, -0.16, 0.12, 0.13, HC.pouch)]));
defPart('h_head_l', merge([BX(0.09, 0.08, 0.09, 0, 0.02, 0, HC.skin), BX(0.16, 0.2, 0.18, 0, 0.13, 0, HC.skin), BX(0.03, 0.04, 0.03, 0, 0.11, -0.1, 0xb8896a), HS(0.14, 0, 0.16, 0, HC.helm, 1, 0.95, 1.05),
  BX(0.29, 0.03, 0.29, 0, 0.16, 0, HC.helm), BX(0.17, 0.035, 0.03, 0, 0.215, -0.13, 0x222222), BX(0.15, 0.025, 0.02, 0, 0.16, -0.095, 0x2a1f18), BX(0.04, 0.05, 0.06, 0.12, 0.2, -0.06, 0x1a1a1a)]));
defPart('h_uarm_l', merge([BX(0.1, 0.3, 0.11, 0, -0.15, 0, HC.uni), BX(0.115, 0.09, 0.125, 0, -0.03, 0, HC.vest)]), 2);
defPart('h_farm_l', merge([BX(0.09, 0.26, 0.1, 0, -0.13, 0, HC.uni), BX(0.08, 0.09, 0.09, 0, -0.3, 0, HC.glove)]), 2);
defPart('h_thigh_l', merge([BX(0.15, 0.45, 0.16, 0, -0.23, 0, HC.uniD), BX(0.04, 0.12, 0.11, 0.09, -0.25, 0, HC.pouch)]), 2);
defPart('h_shin_l', merge([BX(0.13, 0.42, 0.14, 0, -0.21, 0, HC.uniD), BX(0.12, 0.1, 0.04, 0, -0.03, -0.08, 0x2b2b25), BX(0.13, 0.1, 0.27, 0, -0.43, -0.05, HC.boot)]), 2);

// ---------- детальные модели (low-poly, вблизи) ----------
function PR(g, c, t, s, r) { if (s) g.scale(s[0], s[1], s[2]); if (r) { if (r[0]) g.rotateX(r[0]); if (r[1]) g.rotateY(r[1]); if (r[2]) g.rotateZ(r[2]); } g.translate(t[0], t[1], t[2]); return [g, c]; }
const gC = (r1, r2, h, seg) => new THREE.CylinderGeometry(r1, r2, h, seg || 8);
const gS = (r, w, hh) => new THREE.SphereGeometry(r, w || 8, hh || 6);
const gB = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const gHelm = (r) => new THREE.SphereGeometry(r, 12, 6, 0, TAU, 0, Math.PI * 0.56);
// ===== солдаты: детальные модели (вблизи) — v2 =====
const CM = { a: 0x4b5534, b: 0x6e7a4c, c: 0x3b4128, d: 0x7d7a55 };   // пятна камуфляжа
// камуфляжные пятна на цилиндрической поверхности радиуса rx×rz: [угол, высота, ширина, высота пятна, цвет]
function camo(rx, rz, y0, spots) { return spots.map(([a, y, w, h, c]) => { const g = gB(w, h, 0.012); g.rotateY(-a); g.translate(Math.sin(a) * rx, y0 + y, -Math.cos(a) * rz); return [g, c]; }); }
defPart('h_pelvis', merge([
  PR(gC(0.15, 0.14, 0.2, 10), HC.uniD, [0, -0.01, 0], [1.15, 1, 0.82]), PR(gB(0.2, 0.1, 0.14), HC.uniD, [0, -0.1, 0]),
  PR(gC(0.165, 0.165, 0.05, 12), 0x2b2b25, [0, 0.085, 0], [1.15, 1, 0.84]), PR(gB(0.065, 0.05, 0.02), 0x8a8270, [0, 0.085, -0.142]),   // ремень, пряжка
  PR(gB(0.08, 0.1, 0.06), HC.pouch, [0.16, 0.01, -0.07]), PR(gB(0.08, 0.1, 0.06), HC.pouch, [-0.16, 0.01, -0.07]),                   // подсумки
  PR(gB(0.05, 0.14, 0.09), 0x22221e, [0.19, -0.04, 0.03]), PR(gB(0.03, 0.05, 0.05), 0x161614, [0.19, 0.04, 0.0]),                    // кобура
  PR(gC(0.035, 0.035, 0.12, 8), 0x4a4a3a, [-0.17, 0.0, 0.08]), PR(gB(0.16, 0.12, 0.07), HC.pouch, [0, -0.02, 0.15]),                  // граната, сброс
  ...camo(0.17, 0.12, -0.06, [[0.4, 0, 0.07, 0.05, CM.a], [-0.9, 0.02, 0.06, 0.04, CM.c], [2.6, -0.01, 0.08, 0.05, CM.b]]),
]));
// бронежилет-плитоноска: плиты, камербанд, подсумки с магазинами, рация
const vestParts = (col, pouch) => [
  PR(gB(0.33, 0.3, 0.05), col, [0, 0.36, -0.13]), PR(gB(0.3, 0.27, 0.04), col, [0, 0.37, 0.13]),                                     // плиты
  PR(gB(0.05, 0.17, 0.25), col, [-0.17, 0.28, 0]), PR(gB(0.05, 0.17, 0.25), col, [0.17, 0.28, 0]),                                    // камербанд
  PR(gB(0.07, 0.05, 0.27), col, [-0.11, 0.53, 0]), PR(gB(0.07, 0.05, 0.27), col, [0.11, 0.53, 0]),                                    // лямки
  PR(gB(0.09, 0.045, 0.02), col, [-0.11, 0.54, -0.14]), PR(gB(0.09, 0.045, 0.02), col, [0.11, 0.54, -0.14]),
  ...[-0.1, 0, 0.1].flatMap((x) => [PR(gB(0.075, 0.12, 0.055), pouch, [x, 0.27, -0.18]), PR(gB(0.05, 0.05, 0.03), 0x2a2620, [x, 0.35, -0.18], null, [0.15, 0, 0])]),   // подсумки + магазины
  PR(gB(0.1, 0.07, 0.035), pouch, [-0.09, 0.44, -0.165]), PR(gB(0.06, 0.09, 0.04), 0x222222, [0.11, 0.45, -0.165]),                 // админка, рация
  PR(gC(0.004, 0.004, 0.28, 4), 0x111111, [0.13, 0.63, -0.16]),
  PR(gB(0.08, 0.1, 0.05), pouch, [-0.19, 0.22, -0.06]), PR(gB(0.06, 0.08, 0.05), pouch, [0.19, 0.22, -0.06]),                        // боковые
];
const torsoCore = (c) => [
  PR(gC(0.15, 0.16, 0.27, 10), c, [0, 0.135, 0], [1.12, 1, 0.74]), PR(gC(0.2, 0.155, 0.3, 10), c, [0, 0.4, 0], [1.08, 1, 0.7]),
  PR(gS(0.1, 10, 8), c, [-0.21, 0.51, 0], [1, 0.78, 1]), PR(gS(0.1, 10, 8), c, [0.21, 0.51, 0], [1, 0.78, 1]),
  PR(gC(0.055, 0.062, 0.1, 8), HC.skin, [0, 0.6, 0]), PR(gC(0.08, 0.072, 0.05, 10), c, [0, 0.56, 0]),                                 // шея, воротник
  ...camo(0.2, 0.15, 0.1, [[1.6, 0.05, 0.07, 0.08, CM.a], [-1.6, 0.12, 0.06, 0.07, CM.c], [2.9, 0.08, 0.09, 0.06, CM.b]]),
];
defPart('h_torso', merge([...torsoCore(HC.uni), ...vestParts(HC.vest, HC.pouch),
  PR(gB(0.29, 0.33, 0.13), HC.pack, [0, 0.34, 0.225]), PR(gB(0.25, 0.12, 0.06), 0x4a5236, [0, 0.24, 0.3]),                          // рюкзак
  PR(gC(0.055, 0.055, 0.3, 8), 0x6a6650, [0, 0.54, 0.22], null, [0, 0, Math.PI / 2]), PR(gB(0.03, 0.3, 0.02), 0x2b2b25, [-0.09, 0.36, 0.295]), PR(gB(0.03, 0.3, 0.02), 0x2b2b25, [0.09, 0.36, 0.295]),
  PR(gC(0.006, 0.006, 0.45, 4), 0x111111, [0.1, 0.65, 0.27]),
]));
// без рюкзака: гидратор
defPart('h_torso2', merge([...torsoCore(HC.uni), ...vestParts(0x4b5233, 0x56603d),
  PR(gB(0.17, 0.26, 0.06), 0x3d4630, [0, 0.36, 0.17]), PR(gC(0.008, 0.008, 0.3, 4), 0x222222, [0.12, 0.45, -0.05], null, [0.3, 0, 0.2]),
]));
// «горка»: куртка песочного оттенка, капюшон за спиной
defPart('h_torso3', merge([...torsoCore(0x6b6a4a), ...vestParts(HC.vest, HC.pouch),
  PR(gS(0.12, 8, 6), 0x5f5e42, [0, 0.55, 0.11], [1.1, 0.7, 0.8]), PR(gB(0.26, 0.28, 0.12), HC.pack, [0, 0.33, 0.21]),
]));
// голова: лицо с бровями, носом, скулами и подбородком
const headBase = [
  PR(gS(0.1, 12, 10), HC.skin, [0, 0.12, -0.005], [0.93, 1.12, 1.02]), PR(gB(0.11, 0.05, 0.07), HC.skin, [0, 0.045, -0.045]),            // череп, челюсть
  PR(gB(0.03, 0.05, 0.035), 0xb8896a, [0, 0.11, -0.105], null, [-0.15, 0, 0]), PR(gB(0.02, 0.012, 0.015), 0x9a6f55, [0, 0.087, -0.118]),   // нос
  PR(gB(0.034, 0.012, 0.008), 0x1a1612, [-0.035, 0.143, -0.097]), PR(gB(0.034, 0.012, 0.008), 0x1a1612, [0.035, 0.143, -0.097]),      // глаза
  PR(gB(0.04, 0.01, 0.012), 0x3a2a1c, [-0.035, 0.16, -0.098]), PR(gB(0.04, 0.01, 0.012), 0x3a2a1c, [0.035, 0.16, -0.098]),            // брови
  PR(gB(0.045, 0.01, 0.008), 0x7a4e3c, [0, 0.067, -0.098]), PR(gB(0.04, 0.04, 0.03), 0xbd9070, [-0.06, 0.1, -0.08]), PR(gB(0.04, 0.04, 0.03), 0xbd9070, [0.06, 0.1, -0.08]),   // рот, скулы
  PR(gB(0.02, 0.045, 0.035), HC.skin, [-0.098, 0.12, 0]), PR(gB(0.02, 0.045, 0.035), HC.skin, [0.098, 0.12, 0]),                       // уши
];
const helmet = (c, cover) => [
  PR(gHelm(0.142), c, [0, 0.14, 0.005], [1, 0.95, 1.08]), PR(gC(0.145, 0.152, 0.025, 14), c, [0, 0.14, 0.005], [1, 1, 1.08]),
  PR(gC(0.143, 0.143, 0.022, 14), cover, [0, 0.19, 0.005], [1, 1, 1.06]),                                                              // резинка кавера
  PR(gB(0.05, 0.045, 0.025), 0x1a1a1a, [0, 0.21, -0.14]), PR(gB(0.018, 0.05, 0.08), 0x262626, [-0.142, 0.17, 0]), PR(gB(0.018, 0.05, 0.08), 0x262626, [0.142, 0.17, 0]),   // крепление ПНВ, рельсы
  PR(gB(0.012, 0.1, 0.012), 0x2a2a22, [-0.085, 0.085, -0.055], null, [0, 0, 0.25]), PR(gB(0.012, 0.1, 0.012), 0x2a2a22, [0.085, 0.085, -0.055], null, [0, 0, -0.25]),   // ремешок
];
defPart('h_head', merge(headBase.map(([g, c]) => [g.clone(), c]).concat(helmet(HC.helm, 0x3a3a2a), [
  PR(gB(0.17, 0.035, 0.03), 0x222222, [0, 0.215, -0.12]), PR(gB(0.04, 0.05, 0.05), 0x1a1a1a, [0.13, 0.19, -0.05]),                      // очки на шлеме, фонарь
])));
defPart('h_head2', merge(headBase.map(([g, c]) => [g.clone(), c]).concat(helmet(0x6b6a4f, 0x4d4c38), [
  PR(gB(0.2, 0.04, 0.05), 0x1c1c1c, [0, 0.165, -0.1]), PR(gB(0.07, 0.035, 0.012), 0x5a7a8a, [-0.04, 0.165, -0.127]), PR(gB(0.07, 0.035, 0.012), 0x5a7a8a, [0.04, 0.165, -0.127]),   // очки на глазах
])));
defPart('h_head3', merge([PR(gS(0.104, 12, 10), 0x2a2b26, [0, 0.12, -0.005], [0.95, 1.14, 1.04]), PR(gB(0.1, 0.03, 0.012), HC.skin, [0, 0.145, -0.1]),   // балаклава
  PR(gB(0.034, 0.012, 0.01), 0x1a1612, [-0.033, 0.146, -0.107]), PR(gB(0.034, 0.012, 0.01), 0x1a1612, [0.033, 0.146, -0.107]),
  PR(new THREE.SphereGeometry(0.117, 12, 6, 0, TAU, 0, Math.PI * 0.5), 0x3e4a2c, [0, 0.165, 0], [1, 0.7, 1.05]), PR(gB(0.17, 0.015, 0.11), 0x3e4a2c, [0, 0.17, -0.12]),   // кепи
  PR(gB(0.05, 0.03, 0.01), 0x8a8a70, [0, 0.2, -0.118]),
]));
// руки: рукав с карманом и шевроном, налокотник; перчатка
defPart('h_uarm', merge([PR(gS(0.072, 10, 8), HC.uni, [0, -0.01, 0]), PR(gC(0.06, 0.05, 0.3, 10), HC.uni, [0, -0.15, 0]),
  PR(gB(0.03, 0.08, 0.06), 0x55603b, [-0.058, -0.09, 0]), PR(gB(0.012, 0.035, 0.045), 0x8a2a20, [-0.062, -0.05, 0]),               // карман, шеврон
  PR(gS(0.05, 8, 6), 0x2b2b25, [0, -0.3, 0.01], [1, 0.8, 1]), PR(gB(0.065, 0.06, 0.03), 0x2b2b25, [0, -0.29, 0.045]),                // налокотник
  ...camo(0.058, 0.058, -0.1, [[1.2, 0, 0.04, 0.06, CM.a], [-2, -0.06, 0.035, 0.05, CM.c]]),
]), 2);
defPart('h_farm', merge([PR(gC(0.05, 0.042, 0.26, 10), HC.uni, [0, -0.13, 0]), PR(gC(0.047, 0.047, 0.05, 10), HC.uniD, [0, -0.235, 0]),
  PR(gB(0.065, 0.075, 0.085), HC.glove, [0, -0.295, -0.005]), PR(gB(0.06, 0.03, 0.07), HC.glove, [0, -0.345, -0.02], null, [0.5, 0, 0]),   // ладонь, пальцы
  PR(gB(0.02, 0.05, 0.03), HC.glove, [-0.04, -0.29, -0.035]), PR(gB(0.066, 0.015, 0.06), 0x1a1a18, [0, -0.27, -0.01]),
  ...camo(0.048, 0.048, -0.12, [[0.6, 0, 0.035, 0.05, CM.b]]),
]), 2);
// ноги: карман, наколенник, камуфляж; ботинок со шнуровкой и каблуком
defPart('h_thigh', merge([PR(gC(0.09, 0.067, 0.46, 10), HC.uniD, [0, -0.23, 0], [1, 1, 1.05]), PR(gB(0.04, 0.13, 0.11), HC.pouch, [0.088, -0.24, 0]),
  PR(gB(0.035, 0.02, 0.1), 0x3d4630, [0.09, -0.17, 0]),
  PR(gS(0.07, 8, 6), 0x2b2b25, [0, -0.45, -0.045], [1.05, 1, 0.65]), PR(gB(0.1, 0.09, 0.035), 0x22221e, [0, -0.45, -0.07]),          // наколенник
  ...camo(0.085, 0.09, -0.25, [[0.5, 0.05, 0.05, 0.09, CM.a], [-0.7, -0.05, 0.05, 0.07, CM.c], [2.8, 0, 0.06, 0.08, CM.b]]),
]), 2);
defPart('h_shin', merge([PR(gC(0.067, 0.05, 0.36, 10), HC.uniD, [0, -0.18, 0]), PR(gC(0.064, 0.07, 0.1, 10), HC.boot, [0, -0.37, 0]),
  PR(gB(0.11, 0.1, 0.25), HC.boot, [0, -0.44, -0.05]), PR(gB(0.12, 0.03, 0.28), 0x161412, [0, -0.495, -0.05]), PR(gB(0.11, 0.035, 0.07), 0x161412, [0, -0.49, 0.06]),   // подошва, каблук
  PR(gB(0.1, 0.03, 0.06), HC.boot, [0, -0.42, -0.17], null, [0.4, 0, 0]), ...[0, 1, 2].map((i) => PR(gB(0.07, 0.008, 0.012), 0x5a5040, [0, -0.33 - i * 0.03, -0.072])),   // носок, шнуровка
  ...camo(0.065, 0.065, -0.15, [[0.3, 0, 0.04, 0.07, CM.a], [3.0, 0.03, 0.04, 0.06, CM.c]]),
]), 2);
// ===== оружие =====
const AKM = 0x1c1d1c, AKW = 0x5a3424;
defPart('h_ak', merge([
  PR(gB(0.05, 0.075, 0.36), AKM, [0, 0, -0.2]), PR(gB(0.044, 0.02, 0.3), 0x252625, [0, 0.045, -0.18]),                               // ствольная коробка, крышка
  PR(gB(0.045, 0.07, 0.22), AKW, [0, -0.02, 0.1], null, [0.08, 0, 0]), PR(gB(0.04, 0.11, 0.05), AKW, [0, -0.05, 0.2]),               // приклад
  PR(gB(0.055, 0.055, 0.17), AKW, [0, -0.008, -0.45]), PR(gB(0.045, 0.03, 0.14), AKW, [0, 0.04, -0.43]),                              // цевьё, накладка
  PR(gC(0.009, 0.009, 0.12, 6), 0x2a2a2a, [0, 0.03, -0.38], null, [Math.PI / 2, 0, 0]),                                               // газовая трубка
  PR(gC(0.011, 0.011, 0.3, 8), AKM, [0, 0.01, -0.66], null, [Math.PI / 2, 0, 0]), PR(gC(0.016, 0.016, 0.07, 8), AKM, [0, 0.01, -0.83], null, [Math.PI / 2, 0, 0]),   // ствол, ДТК
  PR(gB(0.012, 0.045, 0.012), AKM, [0, 0.04, -0.6]), PR(gB(0.02, 0.022, 0.03), AKM, [0, 0.055, -0.3]),                               // мушка, целик
  PR(gB(0.038, 0.1, 0.045), 0x2b2522, [0, -0.08, -0.06], null, [0.35, 0, 0]),                                                          // пистолетная рукоять
  PR(gB(0.035, 0.09, 0.06), 0x3a2a20, [0, -0.08, -0.24], null, [0.18, 0, 0]), PR(gB(0.035, 0.08, 0.058), 0x3a2a20, [0, -0.16, -0.21], null, [0.45, 0, 0]),   // изогнутый магазин
  PR(gB(0.01, 0.03, 0.05), AKM, [0, -0.035, -0.13]),                                                                                    // спуск
]));
defPart('h_pkm', merge([
  PR(gB(0.06, 0.09, 0.42), AKM, [0, 0, -0.22]), PR(gB(0.05, 0.09, 0.28), 0x2a2a28, [0, -0.02, 0.1]), PR(gB(0.03, 0.06, 0.1), 0x2a2a28, [0, -0.06, 0.2]),   // коробка, рамочный приклад
  PR(gC(0.015, 0.015, 0.46, 8), AKM, [0, 0.01, -0.66], null, [Math.PI / 2, 0, 0]), PR(gC(0.02, 0.017, 0.07, 8), AKM, [0, 0.01, -0.9], null, [Math.PI / 2, 0, 0]),   // ствол, пламегаситель
  PR(gB(0.06, 0.03, 0.06), AKM, [0, 0.06, -0.42]), PR(gC(0.008, 0.008, 0.12, 6), 0x222222, [0, 0.09, -0.42], null, [0, 0, Math.PI / 2]),   // ручка переноски
  PR(gB(0.1, 0.11, 0.12), 0x3d4a2c, [0.03, -0.12, -0.2]), PR(gB(0.02, 0.03, 0.1), 0xb08a40, [-0.04, -0.04, -0.2], null, [0, 0, 0.4]),   // короб, лента
  PR(gB(0.04, 0.1, 0.045), 0x2b2522, [0, -0.08, -0.05], null, [0.3, 0, 0]),
  PR(gB(0.012, 0.22, 0.012), AKM, [-0.03, -0.06, -0.74], null, [-1.3, 0, 0]), PR(gB(0.012, 0.22, 0.012), AKM, [0.03, -0.06, -0.74], null, [-1.3, 0, 0]),   // сошки сложены
]));
defPart('h_svd', merge([
  PR(gB(0.045, 0.07, 0.4), AKM, [0, 0, -0.2]), PR(gB(0.04, 0.035, 0.32), AKW, [0, 0.03, 0.1]), PR(gB(0.04, 0.035, 0.3), AKW, [0, -0.06, 0.11], null, [-0.12, 0, 0]),   // рамочный приклад
  PR(gB(0.035, 0.12, 0.03), AKW, [0, -0.01, 0.24]), PR(gB(0.05, 0.05, 0.24), AKW, [0, 0, -0.5]),
  PR(gC(0.01, 0.01, 0.46, 8), AKM, [0, 0.01, -0.84], null, [Math.PI / 2, 0, 0]), PR(gC(0.014, 0.014, 0.06, 8), AKM, [0, 0.01, -1.08], null, [Math.PI / 2, 0, 0]),
  PR(gC(0.019, 0.019, 0.22, 10), 0x141414, [-0.03, 0.085, -0.17], null, [Math.PI / 2, 0, 0]), PR(gC(0.026, 0.02, 0.05, 10), 0x141414, [-0.03, 0.085, -0.3], null, [Math.PI / 2, 0, 0]),   // ПСО
  PR(gC(0.024, 0.019, 0.05, 10), 0x141414, [-0.03, 0.085, -0.04], null, [Math.PI / 2, 0, 0]), PR(gB(0.03, 0.04, 0.1), 0x1c1c1c, [-0.02, 0.05, -0.17]),
  PR(gB(0.035, 0.1, 0.06), 0x2a2a2a, [0, -0.08, -0.22], null, [0.15, 0, 0]), PR(gB(0.034, 0.09, 0.04), 0x2b2522, [0, -0.07, -0.04], null, [0.3, 0, 0]),
]));
defPart('h_rpg', merge([
  PR(gC(0.04, 0.04, 1.0, 10), 0x4b5636, [0, 0, -0.1], null, [Math.PI / 2, 0, 0]), PR(gC(0.05, 0.045, 0.06, 10), 0x2f3524, [0, 0, 0.38], null, [Math.PI / 2, 0, 0]),   // труба, раструб
  PR(gC(0.022, 0.03, 0.18, 10), 0x55633b, [0, 0, -0.66], null, [Math.PI / 2, 0, 0]), PR(gC(0.045, 0.085, 0.2, 12), 0x55633b, [0, 0, -0.84], null, [Math.PI / 2, 0, 0]),   // выстрел
  PR(gC(0.01, 0.045, 0.16, 12), 0x55633b, [0, 0, -1.02], null, [Math.PI / 2, 0, 0]), PR(gC(0.005, 0.005, 0.04, 6), 0x222222, [0, 0, -1.12], null, [Math.PI / 2, 0, 0]),
  PR(gB(0.03, 0.1, 0.04), 0x1a1a1a, [0, -0.07, -0.05], null, [0.3, 0, 0]), PR(gB(0.03, 0.09, 0.04), 0x1a1a1a, [0, -0.07, -0.3], null, [0.2, 0, 0]),   // рукояти
  PR(gB(0.03, 0.05, 0.12), 0x1c1c1c, [-0.06, 0.04, -0.15]), PR(gC(0.014, 0.014, 0.04, 8), 0x111111, [-0.06, 0.05, -0.08], null, [Math.PI / 2, 0, 0]),   // ПГО-7
  PR(gB(0.11, 0.025, 0.03), 0x6b4a30, [0, 0.045, 0.1]),                                                                                 // теплозащитная накладка
]));
defPart('h_medbag', merge([BX(0.22, 0.2, 0.12, 0, 0, 0, 0xd8d4c8), BX(0.06, 0.14, 0.01, 0, 0, -0.065, 0xb3261e), BX(0.14, 0.05, 0.01, 0, 0, -0.066, 0xb3261e)]));
const RC = { ar: 0x7d858e, dk: 0x474d55, lt: 0xa6adb4, jt: 0x24272c, ac: 0xb03020 };
defPart('r_pelvis', merge([BX(0.48, 0.24, 0.32, 0, 0, 0, RC.dk), BX(0.18, 0.24, 0.06, -0.14, -0.09, -0.18, RC.ar), BX(0.18, 0.24, 0.06, 0.14, -0.09, -0.18, RC.ar), BX(0.4, 0.08, 0.28, 0, 0.14, 0, RC.jt)]));
defPart('r_torso', merge([BX(0.5, 0.36, 0.34, 0, 0.18, 0, RC.jt), BX(0.7, 0.42, 0.44, 0, 0.5, 0, RC.ar), BX(0.6, 0.32, 0.09, 0, 0.5, -0.25, RC.lt, 0.12), BX(0.44, 0.44, 0.24, 0, 0.42, 0.32, RC.dk),
  BX(0.07, 0.3, 0.05, -0.12, 0.42, 0.45, RC.jt), BX(0.07, 0.3, 0.05, 0.12, 0.42, 0.45, RC.jt), BX(0.28, 0.1, 0.28, 0, 0.74, 0, RC.jt), BX(0.04, 0.24, 0.02, -0.18, 0.5, -0.3, RC.ac), BX(0.04, 0.24, 0.02, 0.18, 0.5, -0.3, RC.ac),
  CY(0.01, 0.01, 0.55, -0.2, 0.98, 0.36, RC.jt), BX(0.5, 0.06, 0.3, 0, 0.0, 0, RC.ar)]));
defPart('r_head', merge([BX(0.26, 0.2, 0.3, 0, 0.11, 0.02, RC.ar), BX(0.3, 0.06, 0.34, 0, 0.23, 0.02, RC.dk), BX(0.2, 0.1, 0.2, 0, 0.0, -0.08, RC.dk), BX(0.05, 0.14, 0.16, -0.16, 0.12, 0.02, RC.jt), BX(0.05, 0.14, 0.16, 0.16, 0.12, 0.02, RC.jt), BX(0.08, 0.05, 0.2, 0, 0.28, 0.06, RC.lt)]));
defPart('r_joint', merge([PR(gS(0.1, 8, 6), RC.jt, [0, 0, 0]), PR(gC(0.035, 0.035, 0.5, 6), RC.lt, [0, -0.22, 0.12], null, [0.12, 0, 0])]), 6);
defPart('r_spine', merge([PR(gC(0.11, 0.13, 0.32, 8), RC.jt, [0, 0.18, 0.02]), ...[0, 1, 2].map((i) => PR(gC(0.16, 0.16, 0.035, 8), RC.dk, [0, 0.07 + i * 0.1, 0.02], [1.3, 1, 1]))]));
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
  h_pelvis: [[0, -0.01, 0, 0.17, 0.1, 0.12], [0, -0.1, 0, 0.1, 0.06, 0.07]],
  h_torso: [[0, 0.4, 0, 0.21, 0.16, 0.16], [0, 0.135, 0, 0.17, 0.13, 0.13], [0, 0.6, 0, 0.06, 0.05, 0.06]],
  h_head: [[0, 0.12, -0.005, 0.095, 0.115, 0.105], [0, 0.18, 0.005, 0.14, 0.07, 0.15]],
  h_uarm: [0, -0.15, 0, 0.06, 0.165, 0.06], h_farm: [[0, -0.13, 0, 0.05, 0.14, 0.05], [0, -0.3, 0, 0.04, 0.05, 0.05]],
  h_thigh: [0, -0.23, 0, 0.088, 0.245, 0.092], h_shin: [[0, -0.2, 0, 0.066, 0.2, 0.068], [0, -0.44, -0.05, 0.06, 0.06, 0.13]],
  r_pelvis: [0, 0, 0, 0.25, 0.14, 0.17], r_torso: [[0, 0.5, 0.02, 0.36, 0.22, 0.24], [0, 0.18, 0.02, 0.18, 0.16, 0.14], [0, 0.42, 0.33, 0.22, 0.22, 0.12]], r_head: [0, 0.12, 0, 0.15, 0.14, 0.17], r_pad: [0, 0.03, 0, 0.14, 0.09, 0.19],
  r_uarm: [0, -0.22, 0, 0.09, 0.25, 0.09], r_farm: [0, -0.24, 0, 0.09, 0.26, 0.09], r_thigh: [0, -0.29, 0, 0.12, 0.32, 0.12], r_shin: [0, -0.3, -0.05, 0.12, 0.33, 0.19],
};
// часть тела: ключ модели, сустав, зона; hbs — список коробок-хитбоксов, hb — главная (для прицеливания)
function mkPart(key, o, zone) {
  const raw = HB[key] || HB[key.replace(/\d$/, '')] || null;
  const hbs = raw ? (Array.isArray(raw[0]) ? raw : [raw]) : null;
  const base = key.replace(/\d$/, '');
  return { key, o, zone, hb: hbs ? hbs[0] : null, hbs, lod: PT[key + '_l'] ? key + '_l' : PT[base + '_l'] ? base + '_l' : null };
}
function J(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); if (parent) parent.add(o); return o; }
const GUNKEY = { lead: 'h_ak', rifle: 'h_ak', medic: 'h_ak', mg: 'h_pkm', sniper: 'h_svd', rpg: 'h_rpg', hmg: 'h_ak', mortar: 'h_ak' };
function rigHuman(cls) {
  const root = J(null, 0, 0, 0); root.rotation.order = 'YXZ';
  const tilt = J(root, 0, 0, 0), hips = J(tilt, 0, 0.95, 0), torso = J(hips, 0, 0.1, 0), head = J(torso, 0, 0.58, 0);
  const shL = J(torso, -0.25, 0.5, 0), shR = J(torso, 0.25, 0.5, 0), faL = J(shL, 0, -0.3, 0), faR = J(shR, 0, -0.3, 0);
  const thL = J(hips, -0.1, -0.05, 0), thR = J(hips, 0.1, -0.05, 0), snL = J(thL, 0, -0.46, 0), snR = J(thR, 0, -0.46, 0);
  const gun = cls === 'rpg' ? J(torso, 0.16, 0.62, 0.05) : J(torso, 0.12, 0.36, -0.16); gun.userData.p0 = gun.position.clone();
  const P_ = mkPart;
  const hk = ['h_head', 'h_head', 'h_head2', 'h_head3'][(uid * 7 + 3) % 4], tk = cls === 'medic' || cls === 'lead' ? 'h_torso' : ['h_torso', 'h_torso2', 'h_torso3', 'h_torso'][(uid * 5 + 1) % 4];
  const parts = [P_('h_pelvis', hips, 'pelvis'), P_(tk, torso, 'torso'), P_(hk, head, 'head'), P_('h_uarm', shL, 'uarmL'), P_('h_uarm', shR, 'uarmR'),
    P_('h_farm', faL, 'farmL'), P_('h_farm', faR, 'farmR'), P_('h_thigh', thL, 'thighL'), P_('h_thigh', thR, 'thighR'), P_('h_shin', snL, 'shinL'), P_('h_shin', snR, 'shinR'), P_(GUNKEY[cls], gun, 'gun')];
  if (cls === 'medic') { const mb = J(hips, -0.2, 0.0, 0.08); parts.push(P_('h_medbag', mb, 'pelvis')); }
  return { root, tilt, hips, torso, head, shL, shR, faL, faR, thL, thR, snL, snR, gun, parts };
}
const RGUN = { assault: 'r_rifle', heavy: 'r_mg', rocket: 'r_rifle', scout: 'r_long', mortar: 'r_rifle' };
function rigRobot(cls) {
  const root = J(null, 0, 0, 0); root.rotation.order = 'YXZ';
  const tilt = J(root, 0, 0, 0), hips = J(tilt, 0, 1.2, 0), torso = J(hips, 0, 0.12, 0), head = J(torso, 0, 0.8, 0);
  const shL = J(torso, -0.46, 0.64, 0), shR = J(torso, 0.46, 0.64, 0), faL = J(shL, 0, -0.44, 0), faR = J(shR, 0, -0.44, 0);
  const thL = J(hips, -0.17, -0.06, 0), thR = J(hips, 0.17, -0.06, 0), snL = J(thL, 0, -0.58, 0), snR = J(thR, 0, -0.58, 0);
  const gun = J(torso, 0.22, 0.6, -0.4);
  if (cls === 'heavy') gun.scale.setScalar(1.15);
  const P_ = mkPart;
  const parts = [P_('r_pelvis', hips, 'pelvis'), P_('r_spine', torso, 'torso'), P_('r_joint', shL, 'uarmL'), P_('r_joint', shR, 'uarmR'), P_('r_joint', snL, 'shinL'), P_('r_joint', snR, 'shinR'), P_('r_joint', faL, 'farmL'), P_('r_joint', faR, 'farmR'), P_('r_torso', torso, 'torso'), P_('r_head', head, 'head'), P_('r_eye', head, 'head'),
    P_('r_pad', shL, 'uarmL'), P_('r_pad', shR, 'uarmR'), P_('r_uarm', shL, 'uarmL'), P_('r_uarm', shR, 'uarmR'), P_('r_farm', faL, 'farmL'), P_('r_farm', faR, 'farmR'),
    P_('r_thigh', thL, 'thighL'), P_('r_thigh', thR, 'thighR'), P_('r_shin', snL, 'shinL'), P_('r_shin', snR, 'shinR'), P_(RGUN[cls], gun, 'gun')];
  let pod = null;
  if (cls === 'rocket' || cls === 'mortar') { pod = J(torso, -0.28, 0.92, 0.1); parts.push(P_('r_pod', pod, 'torso')); }
  const smk = J(torso, 0.26, 0.86, 0.18); parts.push(P_('r_smk', smk, 'torso'));
  return { root, tilt, hips, torso, head, shL, shR, faL, faR, thL, thR, snL, snR, gun, pod, parts };
}
// ===== хват оружия: руки тянутся к рукояти и цевью (IK из двух звеньев) =====
// точки в координатах оружия: b — затыльник (упирается в плечо), r — пистолетная рукоять, l — цевьё, m — магазин
const GRIP = {
  h_ak:  { b: [0, 0.0, 0.2],  r: [0.012, -0.095, -0.07], l: [-0.01, -0.06, -0.36], m: [0, -0.17, -0.27] },
  h_pkm: { b: [0, 0.0, 0.23], r: [0.012, -0.09, -0.02],  l: [-0.01, -0.07, -0.4],  m: [0.03, -0.17, -0.2] },
  h_svd: { b: [0, 0.0, 0.24], r: [0.012, -0.08, -0.04],  l: [-0.01, -0.05, -0.42], m: [0, -0.17, -0.22] },
  h_rpg: { b: [0, 0.0, 0.26], r: [0.01, -0.12, -0.05],   l: [-0.01, -0.08, -0.36], m: [0, -0.12, -0.2] },
  r_rifle: { b: [0, 0.0, 0.07], r: [0.02, -0.22, -0.2], l: [-0.02, -0.1, -0.42], m: [0, -0.2, -0.3] },
  r_mg:    { b: [0, 0.0, 0.1],  r: [0.02, -0.2, -0.15], l: [-0.02, -0.12, -0.45], m: [0.13, -0.2, -0.2] },
  r_long:  { b: [0, 0.0, 0.12], r: [0.02, -0.2, -0.2],  l: [-0.02, -0.08, -0.5], m: [0, -0.18, -0.3] },
};
const IKV = { a: new V3(), b: new V3(), c: new V3(), d: new V3(), e: new V3(), f: new V3(), x: new V3(), y: new V3(), z: new V3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), up: new V3(0, 1, 0) };
// плечо sh (сустав в торсе), предплечье fa; цель — в координатах торса; pole — куда смотрит локоть
function solveArm(sh, fa, target, L1, L2, pole) {
  const t = IKV.a.copy(target).sub(sh.position);
  let d = t.length(); if (d < 1e-4) return;
  const dir = t.multiplyScalar(1 / d); d = clamp(d, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.999);
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pp = IKV.b.copy(pole).addScaledVector(dir, -pole.dot(dir)); if (pp.lengthSq() < 1e-6) pp.set(0, -1, 0); pp.normalize();
  const up = IKV.c.copy(dir).multiplyScalar(cosA).addScaledVector(pp, sinA).normalize();           // плечевая кость
  const fd = IKV.d.copy(dir).multiplyScalar(d).addScaledVector(up, -L1).normalize();                 // предплечье
  const bend = Math.acos(clamp(up.dot(fd), -1, 1));
  const Y = IKV.y.copy(up).negate();
  const Z = IKV.z.copy(fd).addScaledVector(up, -fd.dot(up)); if (Z.lengthSq() < 1e-6) Z.copy(pp); Z.normalize().negate();
  const X = IKV.x.crossVectors(Y, Z).normalize();
  sh.quaternion.setFromRotationMatrix(IKV.m.makeBasis(X, Y, Z));
  fa.rotation.set(bend, 0, 0);
}
const POLE_R = new V3(0.7, -1, 0.25), POLE_L = new V3(-0.45, -1, 0.1), RPOLE_R = new V3(0.8, -1, 0.3), RPOLE_L = new V3(-0.8, -1, 0.3);
const LOWDIR = new V3(-0.5, -0.33, -0.8).normalize(), RELDIR = new V3(-0.3, -0.4, -0.86).normalize(), _gT = new V3(), _gq = new THREE.Quaternion(), _hR = new V3();
// mode: aim | low | reload; pocket — точка плеча в торсе; aimDir в мире (для aim)
function holdGun(u, bot, mode, dt) {
  const r = u.rig, g = r.gun; if (r.gk === undefined) r.gk = GRIP[(r.parts.find((p) => p.zone === 'gun') || {}).key] || null; const gk = r.gk;
  if (!gk) return;
  r.root.updateMatrixWorld(true);
  // направление ствола в координатах торса
  const yaw = bot ? u.aimYaw : u.yaw;
  if (mode === 'aim') { const p = clamp(u.pitch + (u.kick || 0) * 0.07, -1.2, 1.2), cp = Math.cos(p); _gT.set(-Math.sin(yaw) * cp, Math.sin(p), -Math.cos(yaw) * cp); }
  else _gT.copy(mode === 'low' ? LOWDIR : RELDIR).applyAxisAngle(IKV.up, yaw);   // в осях тела, независимо от наклона корпуса
  r.torso.getWorldQuaternion(IKV.q2); _gT.applyQuaternion(IKV.q2.invert());
  const Zg = IKV.z.copy(_gT).negate().normalize(), Xg = IKV.x.crossVectors(IKV.up, Zg); if (Xg.lengthSq() < 1e-6) Xg.set(1, 0, 0); Xg.normalize();
  const Yg = IKV.y.crossVectors(Zg, Xg);
  _gq.setFromRotationMatrix(IKV.m.makeBasis(Xg, Yg, Zg));
  if (!u.gq) { u.gq = _gq.clone(); u.gp = new V3(); }
  const k = 1 - Math.exp(-dt * (mode === 'aim' ? 16 : 9));
  u.gq.slerp(_gq, u.gq.angleTo(_gq) > 2 ? 1 : k);
  const sc = g.scale.x;
  const pk = bot ? IKV.e.set(0.2, 0.6, -0.36) : mode === 'aim' ? (u.cls === 'rpg' ? IKV.e.set(0.17, 0.62, 0.02) : IKV.e.set(0.14, 0.5, -0.17)) : mode === 'low' ? IKV.e.set(0.16, 0.44, -0.2) : IKV.e.set(0.13, 0.42, -0.22);
  pk.z += (u.kick || 0) * 0.05;
  const bp = IKV.f.fromArray(gk.b).multiplyScalar(sc).applyQuaternion(u.gq);
  const tgt = pk.sub(bp);
  if (u.gp.lengthSq() === 0) u.gp.copy(tgt); else u.gp.lerp(tgt, k);
  g.position.copy(u.gp); g.quaternion.copy(u.gq);
  const L = bot ? 0.44 : 0.3;
  const hR = IKV.f.fromArray(gk.r).multiplyScalar(sc).applyQuaternion(u.gq).add(u.gp);
  solveArm(r.shR, r.faR, _hR.copy(hR), L, L, bot ? RPOLE_R : POLE_R);
  if (u.hp < 45 && !bot && mode !== 'reload' && !u.target && !u.mv) return;   // раненый держится за бок левой рукой
  const hl = mode === 'reload' ? gk.m : gk.l;
  const hL = IKV.f.fromArray(hl).multiplyScalar(sc).applyQuaternion(u.gq).add(u.gp);
  if (mode === 'reload') { const ph = (B.t * 1.6 + u.id) % 1; hL.y -= Math.sin(ph * Math.PI) * 0.18; hL.x -= Math.sin(ph * Math.PI) * 0.06; }
  solveArm(r.shL, r.faL, hL, L, L, bot ? RPOLE_L : POLE_L);
}
const DEP = { head: ['head'], uarmL: ['uarmL', 'farmL'], uarmR: ['uarmR', 'farmR', 'gun'], farmL: ['farmL'], farmR: ['farmR', 'gun'], thighL: ['thighL', 'shinL'], thighR: ['thighR', 'shinR'], shinL: ['shinL'], shinR: ['shinR'], gun: ['gun'] };
const RZ = { head: [2600, 55], torso: [4200, 175], pelvis: [3600, 130], uarmL: [2500, 60], uarmR: [2500, 60], farmL: [2300, 50], farmR: [2300, 50], thighL: [3000, 85], thighR: [3000, 85], shinL: [2800, 70], shinR: [2800, 70] };
const ZNAME = { head: 'голова', torso: 'корпус', pelvis: 'таз', uarmL: 'левое плечо', uarmR: 'правое плечо', farmL: 'левая рука', farmR: 'оружейная рука', thighL: 'левое бедро', thighR: 'правое бедро', shinL: 'левая голень', shinR: 'правая голень' };

/* ================= юниты ================= */
const RW = {
  assault: { id: 'r_assault', mv: 840, bc: 0.21, g: 9.5, sh: 0, sg: 1.5, rpm: 650, burst: [3, 6], pause: [0.35, 0.8], spread: 1.25, mag: 40 },
  heavy:   { id: 'r_heavy',   mv: 860, bc: 0.25, g: 12, sh: 0, sg: 1.5, rpm: 780, burst: [10, 18], pause: [0.55, 1.1], spread: 2.5, mag: 150 },
  scout:   { id: 'r_scout',   mv: 950, bc: 0.32, g: 13, sh: 0, sg: 1.8, rpm: 60, burst: [1, 1], pause: [2.0, 3.5], spread: 0.35, mag: 8 },
};
RW.rocket = RW.assault; RW.mortar = RW.assault;
const units = [];
const isBot = (u) => u.team === 'r' && !u.man;
const OPFOR = new THREE.Color(0.5, 0.56, 0.7);
let uid = 0;
const PL = { isPlayer: true, team: 'h', robot: false, alive: true, hp: 100, pos: new V3(), vel: new V3(), right: new V3(1, 0, 0), lastHit: -99, Z: null, crouch: 0, kit: 1, firedT: -99, squad: null, id: -1, cls: 'player' };
const B = { pvp: false, active: false, over: false, N: 6, t: 0, rumbleT: 8, artLeft: 3, kills: 0, lost: 0, robotsKilled: 0, humansDown: 0, hitsE: 0,
  loadout: [], deadT: 0, dmgA: 0, dirs: [], hudT: 0, shells: [], startShots: 0, brainT: 0, phaseD: 'hold', side: 'h', scen: 'def', wave: 1, contactT: -99, lullSaid: false, flareT: 20, spect: false, kc: {}, kw: {}, healed: 0, trioKills: 0, announced: new Set(), sitT: 60, horizT: 5, cricketT: 1, fireT: 0, smokeSaid: 0 };
const squads = [];
const TK = { h: new Map(), r: new Map() };   // знание стороны: враг → {pos, t}
const HCLS = { lead: 'командир', rifle: 'стрелок', mg: 'пулемётчик', sniper: 'снайпер', rpg: 'гранатомётчик', medic: 'санитар', hmg: 'расчёт «Корда»', mortar: 'миномётчик' };
const RCLS = { assault: 'штурмовик', heavy: 'тяжёлый', rocket: 'ракетный', scout: 'разведчик', mortar: 'миномётный' };
const clsName = (c) => HCLS[c] || RCLS[c] || c;

function makeUnit(team, cls, pos, yaw) {
  const man = team === 'h' || !!B.pvp;
  const rig = man ? rigHuman(cls) : rigRobot(cls);
  const u = {
    id: uid++, team, cls, rig, pos: pos.clone(), yaw, aimYaw: yaw, pitch: 0, alive: true, down: false, vel: new V3(), right: new V3(1, 0, 0),
    hp: 100, gone: new Set(), state: 'pos', dest: null, spot: null, slot: null, target: null, aimZone: 'torso', aimT: 0, cool: rnd(0.5, 2), burst: 0, st: rnd(0, 2), mag: 30, reloadT: 0,
    supp: 0, rangeErr: gauss() * 0.04, mv: 0, ph: Math.random() * TAU, kick: 0, crouch: man ? 1 : 0, crouchT: man ? 1 : 0, pv: null, T: {}, man,
    fall: null, slide: new V3(), buckle: 0, crawl: false, pose: null, writhe: false, rocketCool: rnd(6, 12), moveDelay: 0, squad: null, expT: 0, bc: new V3(), stagger: 0, staggerPh: 0,
    aw: new Map(), pt: Math.random() * 0.5, head: 0, scan: Math.random() * TAU, firedT: -99, kits: man ? (cls === 'medic' ? 4 : 1) : 0, healT: 0, patient: null, run: false, jumpT: 0, smokes: team === 'r' && !man ? 2 : 0, nvg: cls === 'lead' || cls === 'sniper' || cls === 'hmg',
  };
  if (!man) {
    const k = cls === 'heavy' ? 1.3 : cls === 'scout' ? 0.85 : 1;
    u.Z = {};
    for (const z in RZ) u.Z[z] = { armor: RZ[z][0] * k, hp: RZ[z][1] * k, max: RZ[z][1] * k, int: 1 };
    u.wp = RW[cls]; u.mag = u.wp.mag;
    u.speed = cls === 'heavy' ? 4.6 : cls === 'scout' ? 6.4 : 6.0;
    u.gren = cls === 'assault' ? 2 : 0;
  } else {
    u.wp = W_(cls === 'mg' ? 'pkm' : cls === 'sniper' ? 'svd' : cls === 'rpg' ? 'rpg' : 'ak');
    u.mag = cls === 'mg' ? 100 : cls === 'sniper' ? 10 : cls === 'rpg' ? 1 : 30;
    u.speed = 4.8;
    u.gren = cls === 'rifle' || cls === 'lead' ? 2 : 1;
    if (cls === 'lead') u.smokes = 2; else if (cls === 'rifle' || cls === 'medic') u.smokes = 1;
  }
  u.smokeRk = cls === 'rpg' || cls === 'rocket' ? 1 : 0;
  units.push(u);
  return u;
}
const faceYaw = (dx, dz) => Math.atan2(-dx, -dz);
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
const canShoot = (u) => !u.gone.has('farmR') && !u.gone.has('uarmR') && !u.gone.has('gun');
function zonePoint(u, zone, out) {
  out = out || new V3();
  const p = u.rig.parts.find((q) => q.zone === zone && q.hb && !u.gone.has(zone)) || u.rig.parts.find((q) => q.hb && q.zone === 'torso') || u.rig.parts.find((q) => q.hb);
  const hb = p.hb;
  return out.set(hb[0], hb[1], hb[2]).applyMatrix4(p.o.matrixWorld);
}
function aimPointOf(t, zone, out) {
  if (t.isPlayer) return out.set(camera.position.x, camera.position.y - (t.robot ? 0.45 : 0.12), camera.position.z);
  return zonePoint(t, zone || 'torso', out);
}
function eyeOf(u, out) {
  if (u.isPlayer) return out.copy(camera.position);
  return out.set(u.pos.x, u.pos.y + (isBot(u) ? (u.crawl ? 0.6 : 2.1 - u.crouch * 0.6) : lerp(1.6 - u.crouch * 0.55, 0.38, u.proneK || 0)), u.pos.z);
}
const enemyTeam = (t) => (t === 'h' ? 'r' : 'h');
const isFriend = (team) => team === B.side;

/* ================= эффекты ================= */
function flashFX(p, big) { SS.fxGlow(p, 0xffc46a, big ? 0.6 : 0.4, big ? 0.9 : 0.6, 0.07, null, 1, 0, 0, big ? 9 : 6); }
function sparks(p, n, size) {
  SS.spawnSpark(p, size || 0.35);
  const fl = terrainH(p.x, p.z);
  for (let i = 0; i < n; i++) SS.fxGlow(p, 0xffd27a, 0.12, 0.04, rnd(0.25, 0.6), _v.set(gauss() * 4, rnd(1, 5), gauss() * 4), 1, 1, fl, 1.5);
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
function makeSmoke(pos, r, life, np, fixed) {
  const s = { pos: pos.clone(), r, t: 0, life, dens: 0, fixed };
  const w = fixed ? [0, 0] : SS.windAt(pos.z, SS.getSimT());
  for (let i = 0; i < (np == null ? 12 : np); i++) {
    const p = _v.set(pos.x + gauss() * r * 0.4, pos.y + Math.abs(gauss()) * r * (fixed ? 0.35 : 0.2) + (fixed ? 0.8 : 2), pos.z + gauss() * r * 0.4);
    SS.fxSmoke(p, 0xbdbcb4, r * (fixed ? 1.05 : 1.2), r * (fixed ? rnd(1.4, 1.6) : rnd(2, 2.5)), life * rnd(0.85, 1.1), _v2.set(w[0] * 0.35 + gauss() * 0.2, 0.15, w[1] * 0.35 + gauss() * 0.2), 0.9, 0, 0, 0);
  }
  smokes.push(s);
  const d = pos.distanceTo(camera.position); const AC = SS.getAC(); if (AC && d < 600) SS.noiseHit(AC.currentTime + d / 343, 1.2, 'lowpass', 600, clamp(20 / (d + 20), 0.03, 0.4));
}
function updateSmokes(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.t += dt;
    const w = SS.windAt(s.pos.z, SS.getSimT());
    if (!s.fixed) { s.pos.x += w[0] * dt * 0.35; s.pos.z += w[1] * dt * 0.35; }
    s.dens = Math.min(1, s.t / 3) * (1 - smoothS(s.life * 0.6, s.life, s.t));
    // шашка дымит ещё долго: плотные клубы у земли
    if (!s.fixed && s.t < s.life * 0.55 && (s.acc = (s.acc || 0) + dt) > 1.6 && Math.abs(s.pos.x - camera.position.x) + Math.abs(s.pos.z - camera.position.z) < 1400) {
      s.acc = 0; const k = 1 - s.t / (s.life * 0.55);
      for (let j = 0; j < 1; j++) SS.fxSmoke(_v.set(s.pos.x + gauss() * s.r * 0.3, s.pos.y + 1.5 + Math.random() * 2, s.pos.z + gauss() * s.r * 0.3), 0xc4c3bb, s.r * 1.1, s.r * rnd(2.1, 2.6), rnd(18, 24), _v2.set(w[0] * 0.3 + gauss() * 0.3, 0.25, w[1] * 0.3 + gauss() * 0.3), 0.75 + 0.2 * k, 0, 0, 0);
    }
    if (s.t > s.life) smokes.splice(i, 1);
  }
}
// дымовая завеса стеной: несколько облаков поперёк направления
function smokeWall(pt, dirV, n) {
  const d = _v3.set(dirV.x, 0, dirV.z); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
  const px = -d.z, pz = d.x;
  for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 11 + gauss() * 1.5; const x = pt.x + px * o + d.x * gauss() * 2, z = pt.z + pz * o + d.z * gauss() * 2; makeSmoke(new V3(x, terrainH(x, z), z), rnd(12, 15), rnd(75, 95), 10, false); }
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
  SS.noiseHit(t, 1.6 + power * 0.4, 'lowpass', 180 + 200 / (1 + dist / 100), v, 0, 0.9);
  SS.tone(t, 52, 1.1, v * 0.95, 'sine', 24);
  if (dist < 180) { SS.noiseHit(t, 0.12, 'highpass', 1200, v * 0.75); SS.noiseHit(t + 0.02, 0.5, 'bandpass', 2400, v * 0.25, 1.5); }
  if (dist < 120) for (let i = 0; i < 5; i++) SS.noiseHit(t + 0.35 + Math.random() * 0.9, 0.06, 'bandpass', 700 + Math.random() * 900, v * 0.18, 2);
  SS.noiseHit(t + 0.4, 2.6, 'lowpass', 120, v * 0.32, 0, 0.7);
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
  while (f.children.length > 2) f.removeChild(f.lastChild);
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 700); }, 4500);
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
      if (!f.bounced) { const d = u.pos.distanceTo(camera.position); thud(d, isBot(u)); SS.spawnPuff(_v.set(u.pos.x, u.pos.y + 0.2, u.pos.z), 0x8a7a5c, isBot(u) ? 1.6 : 0.8, 1.6, isBot(u) ? 3 : 2, 0.4, 0.6); if (isBot(u) && d < 60) SHAKE.a += 0.008; }
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
  u.alive = false; u.down = true; u.state = 'down'; u.downT = B.t; B.humansDown++; u.prone = false; u.proneK = 0;
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
  if (!u.gone.has('gun')) { u.gone.add('gun'); addDrop(u); }
  SS.spawnPuff(_v2.set(u.pos.x, u.pos.y + 1.1, u.pos.z), 0x6b0d0d, 0.45, 0.9, 2, 0.1, 0.05);
  if (isFriend(u.team)) {
    vSay(pickR(['Санитара сюда!', 'Брат, держись!', 'Человек упал!']), u, { force: true });
    B.lost++;
    const mine = u.squad && PL.squad === u.squad;
    const lines = ['Санитара! Ранен ' + clsName(u.cls), clsName(u.cls) + ' выбыл', 'Ранен ' + clsName(u.cls) + '! Прикрыть!'];
    if (by === 'player') feed('Вы попали по своему!', 'bad'); else if (mine || Math.random() < 0.35) feed((mine ? 'Тройка: ' : '') + pickR(lines), 'bad');
  } else if (by === 'player') { if (Math.random() < 0.5) vSay(pickR(['Готов!', 'Есть один!', 'Минус один!']), null, { pitch: 1.05 }); B.kills++; B.kc[u.cls] = (B.kc[u.cls] || 0) + 1; if (B.curWeap) B.kw[B.curWeap] = (B.kw[B.curWeap] || 0) + 1; HM.t = 0.45; HM.kind = 'kill'; feed('' + (B.pvp ? 'Противник' : 'Человек') + ' выведен из строя (' + clsName(u.cls) + ')', 'me'); }
}
function killRobot(u, by, dir, blast) {
  if (!u.alive) return;
  u.alive = false; u.state = 'dead'; B.robotsKilled++;
  if (u.spot) { u.spot.used = null; u.spot = null; }
  if (!u.gone.has('gun') && !u.gone.has('farmR')) { u.gone.add('gun'); addDrop(u); }
  const mv = u.vel.length();
  const fd = mv > 0.3 ? u.vel.clone().setY(0).normalize() : (dir ? dir.clone().setY(0).normalize() : new V3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)));
  if (dir && mv > 0.3) fd.addScaledVector(dir.clone().setY(0).normalize(), 0.5).normalize();
  if (!u.crawl) { startFall(u, fd, (blast ? 1.6 : 0.25) + mv * 0.3, 1.42, 1.3); u.slide.copy(u.vel).multiplyScalar(0.8); }
  u.buckle = 0.001;
  const p = zonePoint(u, 'torso', new V3());
  explode(p.clone(), 0.45, { noDamage: true, ground: false });
  sparks(p, 12, 0.9);
  smokers.push({ u, zone: 'torso', t: 40, acc: 0, big: true });
  if (by === 'player') { B.kills++; B.kc[u.cls] = (B.kc[u.cls] || 0) + 1; if (B.curWeap) B.kw[B.curWeap] = (B.kw[B.curWeap] || 0) + 1; HM.t = 0.45; HM.kind = 'kill'; feed('Робот уничтожен (' + (B.curWeap === 'mortar' ? 'миномёт' : B.curWeap === 'grenade' ? 'граната' : SS.curRifle().name) + ', ' + Math.round(u.pos.distanceTo(PL.pos)) + ' м)', 'me'); }
  else feed((isFriend('r') ? 'Потерян ' : 'Уничтожен ') + clsName(u.cls) + (isFriend('r') ? '' : ' робот'), isFriend('r') ? 'bad' : '');
  if (isFriend('r')) B.lost++;
}
const dmgK = (team) => clamp(+(team === B.side ? S.dmgF : S.dmgE) || 5, 1, 10) / 5;
function partDamage(u, zone, dmg, wear, by, dir) {
  if (!u.alive) return;
  B.dmgT = B.dmgT || {}; B.dmgT[u.team] = B.t;
  { const k = dmgK(u.team); dmg *= k; wear *= k; }
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
  dmg *= dmgK(u.team);
  if (!u.alive) return;
  u.flinch = 1; u.flinchS = Math.random() < 0.5 ? -1 : 1;
  u.hp -= dmg; u.supp += 2.5; u.hitT = B.t; if (dir && !blast) { if (!u.fear) u.fear = new V3(); u.fear.copy(u.pos).addScaledVector(dir, -120); u.fearT = B.t; } u.st = Math.max(u.st || 0, rnd(1, 2.2)); B.dmgT = B.dmgT || {}; B.dmgT[u.team] = B.t; u.cause = blast ? "blast" : "bullet";
  if (u.hp <= 0) downHuman(u, by, dir, blast);
  else if (isFriend(u.team) && Math.random() < 0.5) vSay(pickR(['Санитар!', 'Меня зацепило!', 'Ранен!', 'А-а, чёрт!']), u);
  if (u.alive && u.hp < 70 && isFriend(u.team) && u.squad === PL.squad && Math.random() < 0.4) feed('Тройка: ' + clsName(u.cls) + ' ранен!', 'bad');
}

/* ================= игрок как цель ================= */
const PZ_DEF = { head: [2600, 70], torso: [4300, 240], armL: [2500, 80], armR: [2500, 80], legs: [3000, 140] };
function playerDown() {
  if ((PL.revives || 0) >= 2) { feed('Третье тяжёлое ранение — вас уносят с поля. Вы выбыли', 'bad'); playerDie(); return; }
  PL.downed = true; PL.downT = B.t; PL.hp = 1; P.stance = 2; HOOK.speedMul = 0.2; B.dmgA = 1;
  if (B.mounted) dismount();
  feed('ТЯЖЁЛОЕ РАНЕНИЕ! 15 секунд: отстреливайтесь лёжа и ждите санитара', 'bad');
}
function revivePlayer(hp, by) {
  PL.revives = (PL.revives || 0) + 1;
  PL.downed = false; PL.hp = hp; HOOK.speedMul = 1; PL.healer = null; PL.calledMedic = false;
  feed((by ? clsName(by.cls) : 'Вы') + ' вытащил вас: +' + hp + '. В строй!', 'me');
}
function reviveUnit(u, hp, by) {
  u.revives = (u.revives || 0) + 1; u.stab = false; u.sheltered = false; u.smoked = 0; u.carryTo = null; u.rescueT = 0;
  u.alive = true; u.down = false; u.state = 'pos'; u.hp = hp; u.fall = null; u.pose = null; u.writhe = false; u.slide.set(0, 0, 0); u.pv = null; u.crouchT = 1;
  u.gone.delete('gun'); u.healer = null; B.humansDown = Math.max(0, B.humansDown - 1); if (isFriend(u.team)) B.lost = Math.max(0, B.lost - 1);
  if (isFriend(u.team) && (u.squad === PL.squad || (by && by.isPlayer) || Math.random() < 0.4)) feed((by && !by.isPlayer ? clsName(by.cls) : 'Вы') + ' спас бойца (' + clsName(u.cls) + '): +' + hp, 'me');
}
function hurtPlayer(dmg, from) {
  dmg *= dmgK(PL.team);
  if (!PL.alive || !B.active) return;
  if (PL.downed) { PL.hp = 0; playerDie(); return; }
  PL.hp -= dmg; PL.lastHit = B.t; SS.suppress(0.5);
  if (S.vibro && navigator.vibrate) { try { navigator.vibrate(dmg > 30 ? 70 : 35); } catch (e) { /* ignore */ } }
  B.dmgA = Math.min(1, B.dmgA + dmg / 45);
  SHAKE.a += 0.02;
  if (from) B.dirs.push({ a: Math.atan2(from.x - P.x, -(from.z - P.z)) + P.yaw, t: 1.6 });
  if (PL.hp <= 0) { if (!PL.robot && dmg < 140) playerDown(); else playerDie(); }
  else if (PL.hp < 60 && !PL.calledMedic) { PL.calledMedic = true; feed('Вы ранены. Санитар идёт к вам', 'bad'); }
}
function hurtPlayerRobot(zone, E, from, dmgOverride) {
  if (!PL.alive || !B.active) return;
  const Z = PL.Z[zone];
  const kD = dmgK(PL.team);
  if (dmgOverride != null) { dmgOverride *= kD; Z.hp -= dmgOverride; Z.int = Math.max(0, Z.int - 0.2); B.dmgA = Math.min(1, B.dmgA + dmgOverride / 80); }
  else {
    const thr = Z.armor * Z.int;
    if (E > thr) { Z.hp -= (E - thr * 0.5) / 28 * kD; Z.int = Math.max(0, Z.int - 0.12); B.dmgA = Math.min(1, B.dmgA + 0.35); }
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
  PL.alive = false; PL.hp = 0; HOOK.dead = true; B.deadT = 0; PL.downed = false; HOOK.speedMul = 1;
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
const fxLight = new THREE.PointLight(0xffa046, 0, 140, 2); fxLight.visible = (SS.Q && SS.Q.sh) ? true : false; scene.add(fxLight);
let fxL = 0;
function flashLight(p, k) { if (!fxLight.visible) return; if (k >= fxL || p.distanceTo(camera.position) < fxLight.position.distanceTo(camera.position)) fxLight.position.copy(p); fxL = Math.max(fxL, k); }
// очаги огня после взрывов
const fires = [];
function updateFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t -= dt; f.acc += dt;
    if (f.t <= 0) { fires.splice(i, 1); continue; }
    if (f.acc > 0.09) { f.acc = 0; const k = Math.min(1, f.t / 4);
      SS.fxGlow(_v.set(f.pos.x + gauss() * 0.6, f.pos.y + 0.2, f.pos.z + gauss() * 0.6), Math.random() < 0.5 ? 0xff7a26 : 0xffb347, 0.7 * k, 0.15, 0.6, _v2.set(gauss() * 0.3, 1.6, gauss() * 0.3), 0.95, 0, 0, 0);
      if (Math.random() < 0.18) SS.fxPuff(_v.set(f.pos.x, f.pos.y + 1, f.pos.z), 0x2e2a26, 0.8, 4, 5, _v2.set(0, 1.4, 0), 0.5 * k); }
    for (const u of units) if (u.alive && !isBot(u) && Math.abs(u.pos.x - f.pos.x) < 1.8 && Math.abs(u.pos.z - f.pos.z) < 1.8) { hurtHuman(u, 4 * dt, '', null, true); if (u.state !== 'move') { const d = _v.set(u.pos.x - f.pos.x, 0, u.pos.z - f.pos.z); if (d.lengthSq() < 0.01) d.set(1, 0, 0); d.normalize(); sendTo(u, null, 0, u.pos.clone().addScaledVector(d, 4.5)); u.run = true; } }
    if (PL.alive && !PL.robot && Math.abs(PL.pos.x - f.pos.x) < 1.4 && Math.abs(PL.pos.z - f.pos.z) < 1.4) hurtPlayer(7 * dt, f.pos);
  }
}
function explode(pt, power, opts) {
  opts = opts || {};
  flashLight(_v.copy(pt).setY(pt.y + 1.5), 3.5 * power);
  { const dd = pt.distanceTo(camera.position); if (dd < 45 && PL.alive) SS.suppress(power * (1 - dd / 45) * 0.9); }
  if (opts.ground !== false && power >= 1.1 && Math.random() < 0.2 && fires.length < 12 && terrainH(pt.x, pt.z) > -0.5 && !inTrench(pt)) fires.push({ pos: pt.clone(), t: rnd(14, 26), acc: 0 });
  if (opts.ground !== false) {
    // кольцо пыли и столб дыма
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + Math.random() * 0.3; SS.fxPuff(pt, 0x9a8a68, 0.8 * power, 3.4 * power, rnd(1.4, 2.4), _v2.set(Math.cos(a) * 8 * power, 0.5, Math.sin(a) * 8 * power), 0.65, 0, 0, 0); }
    SS.fxPuff(_v.copy(pt).setY(pt.y + 1.5), 0x2b2622, 2 * power, 7 * power, 5.5, _v2.set(0, 2.2, 0), 0.7);
  }
  const dist = pt.distanceTo(camera.position);
  const up = _v.copy(pt); up.y += 0.4 * power;
  SS.fxGlow(up, 0xfff0c8, 2.5 * power, 6 * power, 0.18, null, 1, 0, 0, 6);
  SS.fxGlow(up, 0xff8a2a, 2 * power, 5 * power, 0.5, null, 1, 0, 0, 4);
  if (isNight()) SS.fxGlow(up, 0xff7a20, 8 * power, 14 * power, 0.35, null, 0.55, 0, 0, 0);
  if (opts.ground !== false) {
    SS.spawnPuff(pt, 0x8a7a5c, 3.5 * power, 3.2, Math.round(3 + 2 * power), 1.3, 1.4 * power);
    const fl = terrainH(pt.x, pt.z);
    for (let i = 0; i < Math.round(4 * power); i++) SS.fxPuff(pt, 0x3a3025, rnd(0.25, 0.6), rnd(0.2, 0.5), rnd(1.5, 2.6), _v2.set(gauss() * 4 * power, rnd(5, 13) * Math.sqrt(power), gauss() * 4 * power), 1, 1, fl, 1);
    if (power >= 0.8) {
      const c = new THREE.Mesh(craterGeo, craterMat); const r = 1.4 * power + 0.6;
      c.scale.set(r * 2, 1, r * 2); c.position.set(pt.x, terrainH(pt.x, pt.z) + 0.04, pt.z); c.rotation.y = Math.random() * TAU; c.receiveShadow = SHD;
      scene.add(c); craters.push(c); if (craters.length > 70) scene.remove(craters.shift());
    }
  }
  SS.spawnPuff(_v.copy(pt).add(_v2.set(0, 1, 0)), 0x37332e, 4 * power, 6, Math.round(2 + 2 * power), 2.0, 1.0);
  boom(dist, power);
  SHAKE.a += clamp(power * 1.4 / (dist + 4), 0, 0.12);
  if (dist < 10 * power && PL.alive) ring(1);
  if (opts.noDamage) return;
  B.curWeap = opts.weap || (opts.by === 'player' ? 'boom' : null);
  const R = 4 + 4.5 * power;
  for (const u of units) if (u.down && !u.alive && !u.dead && !u.evac && u.pos.distanceTo(pt) < R * 0.45) killDowned(u, 'blast', opts.by);
  for (const u of units) {
    if (!u.alive) continue;
    const c = _v2.set(u.pos.x, u.pos.y + (isBot(u) ? 1.2 : 0.9), u.pos.z);
    const d = c.distanceTo(pt); if (d > R) continue;
    let k = Math.pow(1 - d / R, 1.5);
    const dir = new V3().subVectors(u.pos, pt).setY(0.3).normalize();
    if (!isBot(u)) {
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
  for (const u of units) if (u.alive && u.squad && u.pos.distanceTo(pt) < 35) u.squad.underFire = B.t;
  if (opts.direct) {
    const u = opts.direct.u;
    if (u.alive && isBot(u)) partDamage(u, opts.direct.zone === 'gun' ? 'farmR' : opts.direct.zone, 420, 1, opts.by, new V3(0, 0, -1));
  }
  if (PL.alive && B.active) {
    const d = pt.distanceTo(_v2.set(P.x, PL.pos.y + 0.9, P.z));
    if (d < R) {
      let k = Math.pow(1 - d / R, 1.5); if (P.eye < 1.2 && coveredFrom(PL.pos, pt)) k *= 0.15;
      if (PL.robot) ['torso', 'legs', 'armL', 'armR', 'head'].forEach((z) => hurtPlayerRobot(z, 0, pt, 55 * power * k));
      else hurtPlayer(130 * power * k, pt);
    }
  }
  B.curWeap = null;
  if (B.active && pt.distanceTo(_v.set(0, pt.y, HILL.cz)) < 260) raiseAlarm('взрыв на высоте');
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
  if (!segSphere(u.bc, isBot(u) ? 1.9 : 1.2, p0, p1)) return null;
  let best = null;
  for (const p of u.rig.parts) {
    if (!p.hbs || u.gone.has(p.zone)) continue;
    for (const hb of p.hbs) { const t = obbT(hb, p.o.matrixWorld, p0, p1); if (t != null && (!best || t < best.t)) best = { t, zone: p.zone }; }
  }
  if (best) best.pt = new V3().lerpVectors(p0, p1, best.t);
  return best;
}
HOOK.collide = function (b, p0, p1) {
  if (!B.active) return null;
  let best = null;
  if (b.team !== PL.team && !b.cracked && PL.alive && !b.player) {
    if (segSphere(camera.position, 3, p0, p1)) { b.cracked = true; if (b.v.length() > 360) SS.sndCrack(0.7); PL.suppT = B.t; SS.suppress(b.rf.g > 30 ? 0.4 : 0.22); if (b.owner) know(PL, b.owner, 0.25); }
  }
  // подавление: пуля прошла рядом с головой — пригнуться, и понять, откуда стреляют
  gridQuery(p0, p1, 3, _cand);
  for (const u of _cand) {
    if (!u.alive || u.team === b.team || Math.abs(u.pos.z - p1.z) > 2.5 || Math.abs(u.pos.x - p1.x) > 2.5) continue;
    _v.set(u.pos.x, u.pos.y + 1.4, u.pos.z);
    if (segSphere(_v, 1.6, p0, p1)) { u.supp += isBot(u) ? (B.scen === 'att' ? 0.35 : 0.05) : 0.3; fearFrom(u, b); if (b.owner && b.owner.alive) know(u, b.owner, 0.12); else if (b.player) know(u, PL, 0.12); }
  }
  const st = staticHit(p0, p1);
  if (st != null) best = { t: st, fn: () => hitStatic(b, new V3().lerpVectors(p0, p1, st)) };
  for (const u of _cand) {
    if ((!u.alive && !(u.down && !u.dead && !u.evac)) || u === b.owner) continue;
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
function fearFrom(u, b) {
  const src = b.owner && b.owner.alive ? b.owner.pos : b.player ? PL.pos : null;
  if (src) { if (!u.fear) u.fear = new V3(); u.fear.copy(src); } else if (b.v) { if (!u.fear) u.fear = new V3(); u.fear.copy(u.pos).addScaledVector(b.v, -0.3); }
  u.fearT = B.t;
}
function hitStatic(b, pt) {
  SS.killBullet(b, pt, false);
  if (!b.player && PL.alive && b.team !== PL.team && pt.distanceTo(camera.position) < 4) SS.suppress(0.18);
  for (const u of units) if (u.alive && u.team !== b.team && Math.abs(u.pos.x - pt.x) < 3 && Math.abs(u.pos.z - pt.z) < 3.5) { u.supp += isBot(u) ? 0.1 : 0.7; fearFrom(u, b); }
}
function bulletHitsUnit(b, u, h) {
  const v = b.v.length(), E = 0.5 * b.rf.g / 1000 * v * v;
  SS.killBullet(b, null);
  const dir = b.v.clone().normalize();
  if (!isBot(u) && !u.alive) { SS.spawnPuff(h.pt, 0x6b0d0d, 0.3, 0.5, 1, 0.1, 0.03); if (b.player || b.aimDown || Math.random() < 0.3) killDowned(u, 'finish', b.player ? 'player' : ''); else u.downT -= 3; return; }
  if (!isBot(u)) {
    SS.spawnPuff(h.pt, 0x6b0d0d, 0.3, 0.5, 1, 0.1, 0.03);
    u.hitBy = b.owner ? [Math.round(b.owner.pos.distanceTo(u.pos)), b.owner.cls, h.zone] : null;
    if (b.player) { HM.t = 0.25; HM.kind = 'pen'; B.hitsE++; }
    const was0 = u.alive;
    hurtHuman(u, humanDamage(h.zone, E), b.player ? 'player' : '', dir, false);
    if (was0 && !u.alive && b.owner && PL.squad && b.owner.squad === PL.squad) B.trioKills++;
    if (b.owner && b.owner.alive) know(u, b.owner, 0.5);
  } else {
    if (b.player) B.hitsE++;
    const was = u.alive;
    robotBullet(u, h.zone, E, b, h.pt);
    if (was && !u.alive && b.owner && PL.squad && b.owner.squad === PL.squad) B.trioKills++;
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
function launchRocket(origin, dir, team, player, owner, smoke) {
  const r = { p: origin.clone(), v: dir.clone().normalize().multiplyScalar(117), t: 0, team, player, owner: owner || null, mesh: rocketMesh(), acc: 0, sm: 0, smoke: !!smoke };
  scene.add(r.mesh); rockets.push(r);
  const dist = origin.distanceTo(camera.position);
  const AC = SS.getAC();
  if (AC) { const t = AC.currentTime + dist / 343, v = clamp(20 / (dist + 20), 0.05, 1); SS.noiseHit(t, 0.4, 'lowpass', 700, 0.9 * v); SS.noiseHit(t + 0.05, 1.0, 'bandpass', 900, 0.4 * v, 1); }
  if (player) { SHAKE.a += 0.02; SS.spawnPuff(origin.clone().addScaledVector(dir, -2.2), 0xcfc8b8, 2.2, 2.5, 5, 0.4, 0.6); PL.firedT = B.t; }
  if (owner) owner.firedT = B.t;
}
HOOK.launchRocket = (o, d, team, player, smoke) => launchRocket(o, d, team, player, null, smoke);
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
      if (r.smoke) { SS.spawnPuff(hit.pt, 0xcfcac0, 1.5, 3, 6, 1.2, 0.5); smokeWall(hit.pt, r.v, 3); scene.remove(r.mesh); rockets.splice(i, 1); continue; }
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
function callArtillery(center, count, spread, team, delay, power, byPlayer, weap) {
  for (let i = 0; i < count; i++) B.shells.push({ t: delay + i * rnd(0.3, 0.7) + Math.random() * (count > 1 ? 0.5 : 0), pos: new V3(center.x + gauss() * spread, 0, center.z + gauss() * spread * 1.2), team, wh: false, power: power || 1.6, byPlayer: !!byPlayer, weap: weap || 'art' });
}
function updateShells(dt) {
  for (let i = B.shells.length - 1; i >= 0; i--) {
    const s = B.shells[i]; s.t -= dt;
    if (!s.wh && s.t < 1.5) { s.wh = true; whistle(s.pos.distanceTo(PL.pos)); }
    if (s.t <= 0) { s.pos.y = terrainH(s.pos.x, s.pos.z); explode(s.pos, s.power, { by: s.byPlayer ? 'player' : '', weap: s.weap }); B.shells.splice(i, 1); }
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
function friendNear(team, p, r) {
  for (const u of units) if (u.team === team && u.alive && Math.abs(u.pos.x - p.x) < r && Math.abs(u.pos.z - p.z) < r) return true;
  return PL.alive && PL.team === team && Math.abs(PL.pos.x - p.x) < r && Math.abs(PL.pos.z - p.z) < r;
}
function updateMortars(dt) {
  if (S.mortars === false) return;
  for (const m of mortars) {
    if (m.player || !m.team) continue;
    m.crew = m.crew.filter((c) => c.alive);
    if (!m.crew.length) continue;
    if (m.team === 'h' && B.scen === 'def' && !B.alarm) continue;
    if (B.t < (B.prepT || 0) && m.team === defTeam()) continue;
    m.cool -= dt;
    if (m.cool > 0) continue;
    // цель — скопление известных врагов 150–2100 м, не ближе 40 м к своим
    const K = TK[m.team];
    let best = null, bs = 0;
    for (const [e, k] of K) {
      if (!e.alive || B.t - k.t > 25) continue;
      const d = k.pos.distanceTo(m.pos); if (d < 150 || d > 2100) continue;
      if (friendNear(m.team, k.pos, 40)) continue;
      let sc = 1; for (const [e2, k2] of K) if (e2 !== e && e2.alive && k2.pos.distanceTo(k.pos) < 30) sc++;
      if (inTrench(k.pos)) sc += 1;
      sc += Math.random() * 0.5;
      if (sc > bs) { bs = sc; best = k; }
    }
    if (!best) { m.cool = 2; continue; }
    const rob = m.crew.some(isBot);
    if (m.tgt && m.tgt.distanceTo(best.pos) < 40) m.spread = Math.max(rob ? 9 : 14, m.spread * (rob ? 0.6 : 0.75)); else m.spread = rob ? 35 : 45;
    m.tgt = best.pos.clone();
    const d = best.pos.distanceTo(m.pos);
    const tof = 7 + d / 260;
    callArtillery(best.pos, 1, m.spread, m.team, tof, rob ? 1.6 : 1.3, false, 'mortar');
    m.cool = rob ? rnd(5.5, 7.5) : m.crew.length > 1 ? rnd(7, 9) : rnd(10, 13);
    m.shots++;
    mortarThump(m.pos.distanceTo(camera.position));
    SS.fxPuff(_v.copy(m.pos).setY(m.pos.y + 1.4), 0xcfcac0, 0.6, 3, 2, _v2.set(0, 1.2, 0), 0.6);
    m.crew.forEach((c) => { c.kick = 1; });
    if (m.shots === 1) { if (isFriend(m.team)) feed('Наши миномёты открыли огонь, ' + Math.round(d) + ' м'); else cmdSay('Противник бьёт из миномётов! Не скучиваться!'); }
  }
}

/* ================= ночь: осветительные ракеты, лазеры ================= */
const flareLight = new THREE.PointLight(0xffe8c0, 0, 900, 1.3); scene.add(flareLight);
const flareSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color: 0xfff0d0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); flareSpr.visible = false; scene.add(flareSpr);
const FL = { on: false, pos: new V3(), t: 0 };
const isNight = () => !!(SS.WEATHER[S.weather] && SS.WEATHER[S.weather].night);
const isDark = () => !!(SS.WEATHER[S.weather] && SS.WEATHER[S.weather].dark);
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
  return isDark() ? 0.07 : 0.18;
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
  const on = isNight() && u.alive && canShoot(u) && (u.target || u.engaged) && !u.mortar;
  const L = u.laser;
  if (!on) { if (L) { L.l.visible = false; L.dot.visible = false; } return; }
  const lz = laserFor(u);
  const g = u.rig.gun;
  const o = g.localToWorld(_v.set(0.06, 0.04, -0.6));
  const tip = g.localToWorld(_v2.set(0.06, 0.04, -2));
  const dir = tip.sub(o).normalize();
  const d = u.target ? Math.min(700, o.distanceTo(u.target.isPlayer ? PL.pos : u.target.pos) + 2) : 180;
  const end = _v3.copy(o).addScaledVector(dir, d);
  const st = staticHit(o, end); if (st != null) end.lerpVectors(o, end, st);
  const a = lz.l.geometry.attributes.position.array;
  a[0] = o.x; a[1] = o.y; a[2] = o.z; a[3] = end.x; a[4] = end.y; a[5] = end.z;
  lz.l.geometry.attributes.position.needsUpdate = true;
  lz.l.visible = true; lz.dot.visible = isNight() || HOOK.vision === 'nvg'; lz.dot.position.copy(end);
}

/* ================= сетка для попаданий ================= */
const GRID = new Map(), GC = 8, _cand = [], _sep = [], _sep2 = [], _lodD = [];
function gridBuild() {
  GRID.clear();
  for (const u of units) { if (!u.alive && !(u.down && !u.dead && !u.evac)) continue; const k = Math.floor(u.pos.x / GC) * 100003 + Math.floor(u.pos.z / GC); let a = GRID.get(k); if (!a) GRID.set(k, a = []); a.push(u); }
}
function gridQuery(p0, p1, pad, out) {
  out.length = 0;
  const x0 = Math.floor((Math.min(p0.x, p1.x) - pad) / GC), x1 = Math.floor((Math.max(p0.x, p1.x) + pad) / GC);
  const z0 = Math.floor((Math.min(p0.z, p1.z) - pad) / GC), z1 = Math.floor((Math.max(p0.z, p1.z) + pad) / GC);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const a = GRID.get(i * 100003 + j); if (a) for (const u of a) out.push(u); }
  return out;
}
const attTeam = () => (B.scen === 'att' ? 'h' : 'r');
const WALL = () => B.scen === 'wall' || B.scen === 'points';
const POINTS = () => B.scen === 'points';
const WMAPS = {
  field:    { name: 'Поле за рекой', h: [0, -880], r: [0, -1460] },
  crossing: { name: 'Переправа', h: [0, -640], r: [0, -1080], hold: 'h' },
  kurgans:  { name: 'Курганы', h: [470, -960], r: [520, -1390] },
  forest:   { name: 'Лесополоса', h: [-250, -1290], r: [-260, -1760] },
  points:   { name: 'Поле точек', h: [0, -860], r: [0, -1480], hidden: true },
};
HOOK.wmaps = WMAPS;
const defTeam = () => (B.scen === 'att' ? 'r' : 'h');

/* ================= командир: квадраты, приказы ================= */
const GCOL = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';
function grid(p) { const c = clamp(Math.floor((p.x + 1000) / 100), 0, GCOL.length - 1), r = Math.floor((-p.z + 600) / 100) + 1; return GCOL[c] + '-' + r; }
const vSay = () => {};  // голоса ИИ отключены по просьбе игрока
function cmdSay(text) {
  vSay(text.replace(/кв\. ([А-Я])-(\d+)/g, 'квадрат $1 $2').replace(/\(.*?\)/g, ''), null, { force: true, rate: 1.22 });
  feed((B.side === 'r' ? 'Штаб: ' : 'Командир: ') + text, 'cmd');
  const AC = SS.getAC(); if (AC) { SS.tone(AC.currentTime, 1400, 0.06, 0.05, 'square'); SS.tone(AC.currentTime + 0.08, 1800, 0.06, 0.05, 'square'); SS.noiseHit(AC.currentTime + 0.15, 0.35, 'bandpass', 2500, 0.05, 1); }
}
function siren() {
  const AC = SS.getAC(); if (!AC) return;
  for (let k = 0; k < 6; k++) SS.tone(AC.currentTime + k * 0.62, k % 2 ? 1150 : 620, 0.6, 0.11, 'sawtooth', k % 2 ? 620 : 1150);
}
function raiseAlarm(why) {
  if (B.alarm || !B.active || B.scen !== 'def') return;
  B.alarm = true;
  if (isFriend('h')) { siren(); vSay('Тревога! К бою!', null, { force: true, rate: 1.3 }); cmdSay('ТРЕВОГА! ' + (why ? why + '. ' : '') + 'Все по местам, рассредоточиться!'); }
  for (const u of units) if (u.team === 'h' && u.alive && u.state === 'camp') { sendTo(u, u.home, rnd(0.2, 3.5)); u.run = true; }
  if (B.side === 'h' && PL.alive && B.pslot && PL.pos.distanceTo(B.pslot.pos) > 8) B.obj2 = { pos: B.pslot.pos.clone(), text: B.pslot.text + ', кв. ' + grid(B.pslot.pos) };
}
function commander() {
  const me = B.side, foe = enemyTeam(me);
  const known = TK[me];
  for (const g of squads) {
    if (g.team !== foe || B.announced.has(g)) continue;
    const seen = g.members.find((m) => m.alive && known.has(m) && B.t - known.get(m).t < 5);
    if (!seen) continue;
    B.announced.add(g);
    const p = seen.pos, d = Math.round(p.distanceTo(PL.pos));
    let txt = (B.pvp ? 'Группа противника' : foe === 'r' ? 'Группа роботов' : 'Группа людей') + ', кв. ' + grid(p) + ', дальность ' + d + ', направление — ' + dirWord(p) + '.';
    if (B.scen === 'def' && foe === 'r') {
      if (p.x > 160) txt += ' Обходят справа по балке — «Корд-2», перенести огонь!';
      else if (p.x < -160) txt += ' Обходят слева через лес — пулемётам левого фланга внимание!';
      else txt += ' Миномётам — огонь по квадрату!';
      if (Math.abs(p.x) > 160 && d < 900 && PL.squad && PL.alive && !PL.robot) { const side = p.x > 0 ? 1 : -1; const s = slots.front.filter((q) => !q.used && Math.sign(q.pos.x) === side && Math.abs(q.pos.x) > 60).sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x))[0]; if (s) { B.obj2 = { flank: true, pos: s.pos.clone(), text: 'Тройке: выдвинуться на ' + (side > 0 ? 'правый' : 'левый') + ' фланг, кв. ' + grid(s.pos) + ', прикрыть' }; txt += ' Тройка — на ' + (side > 0 ? 'правый' : 'левый') + ' фланг!'; } }
    }
    cmdSay(txt);
    return;
  }
  if (smokes.length > B.smokeSaid) { B.smokeSaid = smokes.length; const s = smokes[smokes.length - 1]; if (s.pos.distanceTo(PL.pos) < 1500) cmdSay('Дым в квадрате ' + grid(s.pos) + ' — противник готовит рывок, наблюдать!'); }
  const assaulting = squads.find((g) => g.team === foe && g.phase === 'assault' && g.members.some((m) => m.alive));
  if (assaulting && !B.assaultSaid) { B.assaultSaid = true; cmdSay(foe === 'r' && !B.pvp ? 'Роботы идут на штурм! Гранаты к бою, бить в упор!' : 'Противник идёт на штурм высоты! Гранаты к бою, всем — огонь!'); }
  B.sitT -= 1.5;
  if (B.sitT <= 0) {
    B.sitT = rnd(55, 75);
    const mine = units.filter((u) => u.team === me && u.alive).length + (PL.alive ? 1 : 0);
    const wnd = units.filter((u) => u.team === me && u.alive && u.hp < 60).length;
    const ks = [...known.keys()].filter((e) => e.alive).length;
    cmdSay('Доклад: в строю ' + mine + (me === 'h' ? ', раненых ' + wnd : '') + '. Противника замечено: ' + ks + '.');
  }
  if (B.obj2 && PL.alive && PL.pos.distanceTo(B.obj2.pos) < 10) { feed('Выполнено: ' + B.obj2.text, 'me'); if (PL.squad && B.obj2.flank) squadCmd('follow'); B.obj2 = null; }
}

/* ================= гранаты ================= */
const grenades = [];
const grenGeo = new THREE.SphereGeometry(0.05, 8, 6), grenMat = new THREE.MeshLambertMaterial({ color: 0x3d4a2c });
function throwGrenade(from, vel, team, byPlayer, owner) {
  const m = new THREE.Mesh(grenGeo, grenMat); m.position.copy(from); scene.add(m);
  grenades.push({ p: from.clone(), v: vel.clone(), t: 0, fuse: rnd(3.0, 3.8), team, byPlayer, owner, mesh: m });
}
function lobVel(from, to, t) { return new V3((to.x - from.x) / t, (to.y - from.y + 0.5 * 9.8 * t * t) / t, (to.z - from.z) / t); }
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i]; g.t += dt;
    const p0 = g.p.clone();
    g.v.y -= 9.8 * dt; g.p.addScaledVector(g.v, dt);
    const st = B.active ? staticHit(p0, g.p) : null;
    if (st != null) { g.p.lerpVectors(p0, g.p, st); g.v.multiplyScalar(-0.3); }
    const gy = terrainH(g.p.x, g.p.z) + 0.05;
    if (g.p.y < gy) { g.p.y = gy; g.v.y = Math.abs(g.v.y) * 0.3; g.v.x *= 0.5; g.v.z *= 0.5; }
    g.mesh.position.copy(g.p); g.mesh.rotation.x += dt * 8;
    if (g.t > g.fuse) { explode(g.p.clone(), 0.7, { by: g.byPlayer ? 'player' : '', weap: 'grenade' }); scene.remove(g.mesh); grenades.splice(i, 1); }
  }
}
function updateGrenBtn() { const b = $('bGren'); if (b) { $('grenTxt').textContent = 'ГРАНАТА ' + (PL.gren || 0); b.disabled = !(PL.gren > 0); } }
HOOK.grenade = function () {
  if (!PL.alive || !(PL.gren > 0) || HOOK.dead) return;
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const from = camera.position.clone().addScaledVector(dir, 0.6);
  throwGrenade(from, dir.multiplyScalar(PL.robot ? 19 : 15).add(_v.set(0, 3.5, 0)).add(PL.vel), PL.team, true, null);
  PL.gren--; updateGrenBtn();
  const AC = SS.getAC(); if (AC) SS.noiseHit(AC.currentTime, 0.12, 'bandpass', 900, 0.2, 1.5);
};

/* ================= десант ================= */
const chuteGeo = (function () { const g = new THREE.SphereGeometry(3.6, 10, 6, 0, TAU, 0, Math.PI / 2.3); g.scale(1, 0.55, 1); return g; })();
const chuteMat = new THREE.MeshLambertMaterial({ color: 0x5a6640, side: THREE.DoubleSide });
function addChute(u) { u.chute = { mesh: new THREE.Mesh(chuteGeo, chuteMat), ph: Math.random() * TAU }; scene.add(u.chute.mesh); }
function updateChutes(dt) {
  for (const u of units) {
    if (!u.chute) continue;
    const ch = u.chute;
    if (!u.alive) { scene.remove(ch.mesh); u.chute = null; continue; }
    const w = SS.windAt(u.pos.z, SS.getSimT());
    u.pos.x += w[0] * 0.3 * dt; u.pos.z += w[1] * 0.3 * dt; u.pos.y -= 5.5 * dt;
    ch.ph += dt;
    ch.mesh.position.set(u.pos.x + Math.sin(ch.ph) * 0.3, u.pos.y + 5.4, u.pos.z); ch.mesh.rotation.z = Math.sin(ch.ph * 0.8) * 0.08;
    const gy = terrainH(u.pos.x, u.pos.z);
    if (u.pos.y <= gy) { u.pos.y = gy; scene.remove(ch.mesh); u.chute = null; u.state = 'pos'; u.crouchT = 1; SS.spawnPuff(u.pos, 0x8a7a5c, 0.8, 1.2, 2, 0.3, 0.3); }
  }
  if (B.pchute) {
    B.pchute.position.set(camera.position.x, camera.position.y + 5.2, camera.position.z);
    if (P.jy <= 0.01) { scene.remove(B.pchute); B.pchute = null; HOOK.chute = false; feed('Приземлились! К бою!', 'me'); }
  }
}

/* ================= атмосфера ================= */
function atmosphere(dt) {
  const night = isNight();
  B.horizT -= dt;
  if (B.horizT <= 0) {
    B.horizT = rnd(night ? 9 : 16, night ? 18 : 30);
    const a = rnd(-1.2, 1.2) + (Math.random() < 0.5 ? 0 : Math.PI), r = rnd(3200, 5200);
    const p = _v.set(Math.sin(a) * r, 40 + Math.random() * 60, HILL.cz - Math.cos(a) * r);
    SS.fxGlow(p, Math.random() < 0.5 ? 0xffb060 : 0xfff0d0, 120, 380, rnd(0.3, 0.7), null, night ? 0.8 : 0.25, 0, 0, 0);
    const AC = SS.getAC(); if (AC) SS.noiseHit(AC.currentTime + r / 343 * 0.3, 2.2, 'lowpass', 110, 0.12);
  }
  if (night && B.scen === 'def' && !B.alarm) {
    B.cricketT -= dt;
    if (B.cricketT <= 0) { B.cricketT = rnd(0.6, 2.2); const AC = SS.getAC(); if (AC) for (let k = 0; k < 3; k++) SS.tone(AC.currentTime + k * 0.07, rnd(4200, 4800), 0.035, 0.012, 'sine'); }
  }
  if (B.scen === 'def' && CAMPFIRE) {
    B.fireT -= dt;
    if (B.fireT <= 0) { B.fireT = 0.09; SS.fxGlow(_v.set(CAMPFIRE.x + gauss() * 0.2, CAMPFIRE.y + 0.3, CAMPFIRE.z + gauss() * 0.2), 0xff8a30, 0.5, 0.15, 0.6, _v2.set(0, 1.2, 0), night ? 0.9 : 0.5, 0, 0, 0); if (Math.random() < 0.2) SS.fxPuff(_v.set(CAMPFIRE.x, CAMPFIRE.y + 1, CAMPFIRE.z), 0x6a6660, 0.6, 2.2, 4, _v2.set(0, 0.8, 0), 0.4); }
  }
}

/* ================= мини-карта ================= */
const MM = $('minimap'), mmc = MM ? MM.getContext('2d') : null;
let mmBig = false;
if (MM) MM.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); mmBig = !mmBig; MM.classList.toggle('big', mmBig); });
function drawMinimap() {
  if (!mmc) return;
  const W = MM.width, H = MM.height, c = mmc;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(18,24,14,.78)'; c.fillRect(0, 0, W, H);
  const R = mmBig ? 1350 : 600, cx = mmBig ? 0 : PL.pos.x, cz = mmBig ? -760 : PL.pos.z, k = W / (2 * R);
  const X = (x) => W / 2 + (x - cx) * k, Y = (z) => H / 2 + (z - cz) * k;
  const step = mmBig ? 200 : 100;
  c.strokeStyle = 'rgba(220,230,200,.08)'; c.lineWidth = 1;
  for (let x = Math.ceil((cx - R) / step) * step; x < cx + R; x += step) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), H); c.stroke(); }
  for (let z = Math.ceil((cz - R) / step) * step; z < cz + R; z += step) { c.beginPath(); c.moveTo(0, Y(z)); c.lineTo(W, Y(z)); c.stroke(); }
  c.fillStyle = 'rgba(40,70,30,.6)';
  for (const f of FOREST) { if (Math.abs(f.x - cx) > R + f.r || Math.abs(f.z - cz) > R + f.r) continue; c.beginPath(); c.arc(X(f.x), Y(f.z), Math.max(1.5, f.r * k), 0, TAU); c.fill(); }
  c.strokeStyle = 'rgba(90,140,170,.9)'; c.lineWidth = Math.max(2, 22 * k); c.beginPath();
  for (let x = -1000; x <= 1000; x += 25) { const z = SS.riverZ(x); if (x === -1000) c.moveTo(X(x), Y(z)); else c.lineTo(X(x), Y(z)); } c.stroke();
  c.strokeStyle = 'rgba(200,180,120,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(X(0), Y(HILL.cz), 330 * k, 0, TAU); c.stroke();
  c.beginPath(); c.arc(X(0), Y(HILL.cz), 120 * k, 0, TAU); c.stroke();
  c.fillStyle = 'rgba(150,120,80,.9)'; for (const pp of parapets) c.fillRect(X(pp.c.x) - 1, Y(pp.c.z) - 1, 2, 2);
  c.fillStyle = '#e8c25a'; for (const cr of crates) c.fillRect(X(cr.pos.x) - 2.5, Y(cr.pos.z) - 2.5, 5, 5);
  c.fillStyle = 'rgba(160,160,150,.5)'; for (const cv of covers) c.fillRect(X(cv.c.x) - 1, Y(cv.c.z) - 1, 2, 2);
  c.fillStyle = 'rgba(190,190,180,.35)'; for (const s of smokes) { c.beginPath(); c.arc(X(s.pos.x), Y(s.pos.z), Math.max(3, s.r * k), 0, TAU); c.fill(); }
  const me = B.side;
  for (const u of units) {
    const x = X(u.pos.x), y = Y(u.pos.z); if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
    if (u.team === me) { if (!u.alive) { if (u.down) { c.fillStyle = 'rgba(255,90,70,.8)'; c.fillRect(x - 1.5, y - 1.5, 3, 3); } continue; } c.fillStyle = PL.squad && u.squad === PL.squad ? '#7ff0ff' : '#6fa8ff'; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); }
  }
  for (const [e, q] of TK[me]) { if (!e.alive || e.isPlayer) continue; const age = B.t - q.t; if (age > 25) continue; c.fillStyle = 'rgba(255,70,50,' + (1 - age / 30).toFixed(2) + ')'; const x = X(q.pos.x), y = Y(q.pos.z); c.fillRect(x - 2.5, y - 2.5, 5, 5); }
  if (B.pts) for (const p of B.pts) { const x = X(p.pos.x), y = Y(p.pos.z); c.fillStyle = p.own ? (p.own === B.side ? '#5aa2ff' : '#ff5a46') : '#bdbdbd'; c.beginPath(); c.arc(x, y, 8, 0, TAU); c.fill(); c.fillStyle = '#111'; c.font = '700 11px sans-serif'; c.textAlign = 'center'; c.fillText(p.n, x, y + 4); }
  if (!WALL()) { c.font = '700 10px sans-serif'; c.textAlign = 'center';
    for (const cc of CCP) { const x = X(cc.pos.x), y = Y(cc.pos.z); c.fillStyle = '#fff'; c.fillRect(x - 5, y - 5, 10, 10); c.fillStyle = '#d33'; c.fillRect(x - 4, y - 1.2, 8, 2.4); c.fillRect(x - 1.2, y - 4, 2.4, 8); }
    for (const k of ['mill', 'belt', 'vil']) { const p = POI[k]; if (!p || !p.spots.length) continue; const s0 = p.spots[0].pos; c.fillStyle = 'rgba(240,220,150,.9)'; c.fillText(k === 'mill' ? 'М' : k === 'belt' ? 'П' : 'Д', X(s0.x), Y(s0.z) + 4); } }
  if (B.mark) { const x = X(B.mark.pos.x), y = Y(B.mark.pos.z); c.strokeStyle = '#5dff7a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.stroke(); }
  if (B.obj2) { const x = X(B.obj2.pos.x), y = Y(B.obj2.pos.z); c.strokeStyle = '#f2c94c'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.stroke(); }
  if (B.lastMortar) { const x = X(B.lastMortar.pos.x), y = Y(B.lastMortar.pos.z); c.strokeStyle = 'rgba(255,200,80,.9)'; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.stroke(); }
  c.save(); c.translate(X(PL.pos.x), Y(PL.pos.z)); c.rotate(-P.yaw); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill(); c.restore();
  c.fillStyle = 'rgba(236,240,220,.85)'; c.font = '600 ' + (mmBig ? 13 : 15) + 'px monospace'; c.textAlign = 'left';
  c.fillText('кв. ' + grid(PL.pos), 6, H - 8);
  c.textAlign = 'right'; c.fillText(isNight() ? (isDark() ? 'ТЬМА' : 'НОЧЬ') : 'С ↑', W - 6, 16);
}

/* ================= роли и задачи ================= */
const ROLES_H = {
  rifle:  { w: ['ak', 'rpg'], gren: 3, kits: 1, rockets: 2, text: 'Стрелок: АК-74М (по умолчанию с коллиматором), РПГ с 2 гранатами, 3 ручные гранаты.', obj: 'Уничтожить 2 робота', need: 2, val: () => B.kills },
  mg:     { w: ['pkm', 'rpk'], gren: 1, kits: 1, text: 'Пулемётчик: ПКМ и РПК-16. Прижимать противника, прикрывать перебежки.', obj: 'Уничтожить 2 робота', need: 2, val: () => B.kills },
  sniper: { w: ['svd', 'vss', 'ksvk'], gren: 0, kits: 1, text: 'Снайпер: СВД, бесшумный «Винторез», КСВК 12,7. Ночью — тепловизор.', obj: 'Уничтожить 2 разведчика, ракетчика или миномётчика', need: 2, val: () => (B.kc.scout || 0) + (B.kc.rocket || 0) + (B.kc.mortar || 0) },
  rpg:    { w: ['rpg', 'rpgs', 'ak'], gren: 1, kits: 1, rockets: 6, text: 'Гранатомётчик: РПГ-7 (6 гранат) и АК.', obj: 'Уничтожить 2 тяжёлых или ракетных робота', need: 2, val: () => (B.kc.heavy || 0) + (B.kc.rocket || 0) },
  medic:  { w: ['ak'], gren: 1, kits: 5, text: 'Санитар: 5 аптечек. Кнопка «АПТЕЧКА» рядом с раненым перевязывает его (+25).', obj: 'Перевязать 4 раненых', need: 4, val: () => B.healed },
  mortar: { w: ['ak'], gren: 1, kits: 1, text: 'Миномётчик: свой 82-мм миномёт на позиции (кнопка «К МИНОМЁТУ»). Бинокль → лазер → «СБР» берёт дальность и азимут, ▲▼ ±25 м.', obj: 'Уничтожить миномётом 3 робота', need: 3, val: () => B.kw.mortar || 0 },
  captain: { w: ['ak', 'rpg'], gren: 2, kits: 2, rockets: 2, art: 5, text: 'Капитан взвода: командует всеми отделениями («ЕЩЁ» → команды: взвод вперёд, держать рубеж, отход), 5 заявок на артиллерию, своя тройка.', obj: 'Победить, сохранив больше половины взвода', need: 1, val: () => (B.capOK ? 1 : 0) },
  lead:   { w: ['ak', 'rpg'], gren: 2, kits: 1, rockets: 3, art: 4, text: 'Командир тройки: АК, РПГ, 4 заявки на артиллерию, команды тройке.', obj: 'Уничтожить 5 роботов силами тройки', need: 5, val: () => B.kills + B.trioKills },
};
const ROLES_R = {
  assault: { w: ['rr'], gren: 2, text: 'Штурмовик: винтовка Р-12, 2 гранаты, быстрый бег.', obj: 'Ворваться в первую траншею', need: 1, val: () => (B.reachedTrench ? 1 : 0) },
  heavy:   { w: ['rmg', 'rr'], gren: 0, text: 'Тяжёлый: пулемёт П-30 на 150 патронов.', obj: 'Вывести из строя 4 человек', need: 4, val: () => B.kills },
  rocket:  { w: ['rrk', 'rr'], gren: 1, text: 'Ракетчик: РК-4 (4 ракеты в пакете) и винтовка.', obj: 'Уничтожить расчёты «Корда» или миномётов (2)', need: 2, val: () => (B.kc.hmg || 0) + (B.kc.mortar || 0) },
  scout:   { w: ['rsn', 'rr'], gren: 0, text: 'Разведчик: снайперская Р-50 «Жало» с цифровым прицелом.', obj: 'Вывести из строя 3 человек', need: 3, val: () => B.kills },
};
HOOK.roleInfo = function (side, role) { const pv = S.foe === 'man', R = (side === 'r' && !pv ? ROLES_R : ROLES_H)[role]; const t = R ? R.text + ' Задача: ' + R.obj + '.' : ''; return pv ? t.replace(/роботов|робота|робот/g, 'противников') : t; };
function roleOf() {
  if (!B.pvp) return (B.side === 'r' ? ROLES_R : ROLES_H)[S.role] || (B.side === 'r' ? ROLES_R.assault : ROLES_H.rifle);
  const R = ROLES_H[S.role] || ROLES_H.rifle;
  if (S.role === 'medic' || S.role === 'mortar') return Object.assign({}, R, { obj: R.obj.replace(/роботов|робота|робот/g, 'противников') });
  return Object.assign({}, R, { obj: 'Вывести из строя ' + R.need + ' противников', val: () => B.kills });
}

/* ================= миномёт игрока ================= */
function nearCrate() { if (!B.active || !PL.alive) return null; for (const c of crates) if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) < 3) return c; return null; }
const magDefault = (r) => (r.mounted || r.org === 'BOT' ? null : r.type === 'auto' ? (r.mag >= 90 ? 4 : 8) : r.type === 'sniper' ? 7 : null);
function resupply() {
  const R = roleOf();
  RIFLES.forEach((r) => { const t = TUR[r.id]; if (t.mags != null) t.mags = magDefault(r); if (r.type === 'rocket' && r.org !== 'BOT') t.reserve = R.rockets != null ? R.rockets : 2; });
  PL.gren = Math.max(PL.gren || 0, R.gren || 0); PL.kit = Math.max(PL.kit, R.kits || 1);
  updateGrenBtn(); updateMedBtn(); $('bGren').hidden = !(PL.gren > 0); SS.updateWeaponUI();
  feed('Боеприпасы, гранаты и аптечки пополнены', 'me');
}
HOOK.weapons = () => (B.active ? B.loadout.slice() : null);
HOOK.canSwitch = () => !(B.active && (B.mounted || B.mortarMode));
HOOK.toast = (t) => feed(t);
HOOK.noAmmo = () => { let c = null, d = 1e9; for (const q of crates) { const dd = q.pos.distanceTo(PL.pos); if (dd < d) { d = dd; c = q; } } feed('Нет магазинов. Подберите оружие у павших или ящик: ' + (c ? Math.round(d) + ' м, ' + dirWord(c.pos) : 'нет рядом'), 'bad'); };
function nearMortar() { if (!B.active || !PL.alive) return null; for (const m of mortars) if (Math.hypot(m.pos.x - P.x, m.pos.z - P.z) < 3.2 && !m.crew.some((c) => c.alive && c.team !== PL.team)) return m; return null; }
function mountMortar(m) {
  B.mortarMode = m; m.player = true; B.prevW = S.rifle;
  if (!m.range) m.range = 800;
  SS.selectRifle(WIDX('m82'));
  P.x = m.pos.x; P.z = m.pos.z + 1.2; P.stance = 0;
  if (LRF.pt && LRF.t > 0) HOOK.mortarAdj(0);
  feed('Вы у миномёта. ▲▼ — дальность, «СБР» — по дальномеру, огонь — выстрел', 'me');
  SS.updateTurUI();
}
function dismountMortar() { const m = B.mortarMode; if (!m) return; m.player = false; B.mortarMode = null; SS.selectRifle(B.prevW != null && RIFLES[B.prevW].type !== 'mortar' ? B.prevW : WIDX('ak')); }
HOOK.mortarAdj = function (d) {
  const m = B.mortarMode; if (!m) return;
  if (d === 0) {
    if (LRF.pt && LRF.t > 0) { m.range = clamp(Math.round(LRF.pt.distanceTo(m.pos) / 5) * 5, 100, 2400); P.yaw = faceYaw(LRF.pt.x - m.pos.x, LRF.pt.z - m.pos.z); feed('Данные с дальномера: ' + m.range + ' м, кв. ' + grid(LRF.pt), 'me'); }
    else feed('Сначала измерьте дальность биноклем');
  } else m.range = clamp(m.range + d, 100, 2400);
  SS.updateTurUI();
};
HOOK.mortarInfo = function () { const m = B.mortarMode; const r = m ? m.range : 0; return { range: r, tof: Math.round(7 + r / 260) }; };
HOOK.fireMortar = function () {
  const m = B.mortarMode; if (!m) return;
  const dir = _v.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const tgt = m.pos.clone().addScaledVector(dir, m.range);
  const tof = 7 + m.range / 260;
  const w = SS.windAt(tgt.z, SS.getSimT());
  tgt.x += w[0] * tof * 0.25; tgt.z += w[1] * tof * 0.25;
  callArtillery(tgt, 1, 4 + m.range * 0.012, PL.team, tof, 1.5, true, 'mortar');
  B.lastMortar = { pos: tgt.clone(), t: B.t + tof };
  mortarThump(0); SHAKE.a += 0.03;
  SS.fxPuff(m.pos.clone().add(_v2.set(0, 1.4, 0)), 0xcfcac0, 0.6, 3, 2, _v3.set(0, 1.2, 0), 0.7);
  feed('Выстрел! ' + m.range + ' м, азимут ' + Math.round(((-P.yaw * 180 / Math.PI) % 360 + 360) % 360) + '°, подлёт ' + Math.round(tof) + ' с');
};
HOOK.noJump = () => !!(B.mounted || B.mortarMode || HOOK.chute || PL.downed);

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
  if (team === 'h' && !B.alarm) raiseAlarm('Противник, кв. ' + grid(pos) + ', ' + Math.round(pos.distanceTo(new V3(0, 0, HILL.cz))) + ' м');
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
  const robot = isBot(u);
  const night = isNight();
  const maxR = robot ? 1500 : night ? 1000 : 1400;
  eyeOf(u, _pe);
  const list = enemiesOf(u.team);
  let budget = 9;
  const n0 = Math.floor(Math.random() * Math.max(1, list.length));
  for (let li = 0; li < list.length; li++) {
    const e = list[(li + n0) % list.length];
    const ep = e.isPlayer ? PL.pos : e.pos;
    const dx = ep.x - u.pos.x, dz = ep.z - u.pos.z, d = Math.hypot(dx, dz);
    let c = u.aw.get(e) || 0;
    if (d > maxR) { if (c) u.aw.set(e, Math.max(0, c - 0.1 * tick)); continue; }
    if (budget <= 0 && d > 40 && c < 1) continue;
    if (d > 650 && c < 0.3 && Math.random() < 0.45) continue;
    budget--;
    const ang = Math.abs(angDiff(faceYaw(dx, dz), u.yaw + u.head));
    const fired = B.t - (e.firedT || -99) < 2.5;
    const near = d < 16;
    if (!near && ang > (robot ? 1.2 : 1.0) && !(fired && d < 450)) { u.aw.set(e, Math.max(0, c - 0.15 * tick)); continue; }
    if (e.isPlayer) _pt.copy(camera.position); else if (isBot(e)) zonePoint(e, 'torso', _pt); else zonePoint(e, 'head', _pt);
    if (!los(_pe, _pt)) { u.aw.set(e, Math.max(0, c - 0.2 * tick)); continue; }
    let rate = (robot ? 2.4 : 1.7) * (Math.pow(Math.max(0, 1 - d / maxR), 1.2) + (near ? 3 : 0));
    let ex = 1;
    if (e.isPlayer) ex = P.stance === 2 ? 0.35 : P.stance === 1 ? 0.6 : 1;
    else if (!isBot(e)) ex = e.crouch > 0.5 ? 0.3 : 1;
    else ex = e.crawl ? 0.5 : e.crouch > 0.5 ? 0.6 : 1;
    if (inForest(ep)) ex *= 0.35;
    const fb = forestBetween(_pe, _pt); if (fb > 35) ex *= 0.08; else if (fb > 14) ex *= 0.4;
    const sm = smokeBetween(_pe, _pt); ex *= robot ? 1 - sm * 0.85 : 1 - sm * 0.97;
    const mv = e.isPlayer ? P.moving : Math.min(1, e.vel.length() / 3);
    ex *= 1 + mv * 0.8;
    if (fired) ex *= 3;
    if (!robot) { let lt = lightAt(ep); if (u.nvg) lt = Math.max(lt, isDark() ? 0.45 : 0.65); if (e.laser && e.laser.l.visible) lt = Math.max(lt, 0.85); ex *= lt; }
    else if (isDark() && !e.isPlayer && e.team === 'h' && e.chute) ex *= 1.5;
    if (ang > 0.6 && !near) ex *= 0.5;
    c = Math.min(2, c + rate * ex * tick);
    u.aw.set(e, c);
    if (c >= 1) share(u.team, e, u);
  }
}
// цель: кого вижу сейчас из известных, с учётом угрозы и распределения по отделению
// игрок на бегу, пригнувшись, лёжа или в наклоне — по нему труднее попасть
const pEvade = () => 1 + 0.9 * P.moving + (P.sprint ? 0.6 : 0) + (P.stance === 2 ? 0.35 : P.stance === 1 ? 0.15 : 0) + (Math.abs(P.leanV) > 0.3 ? 0.3 : 0);
function threat(t, from) {
  const p = t.isPlayer ? PL.pos : t.pos;
  const d = p.distanceTo(from.pos);
  let s = (1500 - d) / 1500;
  if (t.isPlayer) return s;
  if (isBot(t)) { s += t.cls === 'rocket' ? 0.4 : t.cls === 'heavy' ? 0.35 : t.cls === 'scout' ? 0.3 : 0; s += (1 - t.Z.torso.int) * 0.6; if (d < 200) s += 0.8; }
  else { s += t.cls === 'hmg' ? 1.4 : t.cls === 'mg' ? 0.6 : t.cls === 'rpg' ? 0.5 : t.cls === 'sniper' ? 0.45 : 0; if (t.crouch < 0.5) s += 0.4; }
  return s;
}
const EFF = { lead: 420, rifle: 420, medic: 380, mg: 800, sniper: 1100, rpg: 320, hmg: 800, mortar: 300, assault: 850, heavy: 950, rocket: 850, scout: 1400 };
function visibleNow(u, t) {
  eyeOf(u, _pe);
  if (t.isPlayer) _pt.copy(camera.position); else aimPointOf(t, isBot(t) ? 'torso' : 'head', _pt);
  if (!los(_pe, _pt)) return false;
  const sm = smokeBetween(_pe, _pt);
  if (sm > (isBot(u) ? 0.8 : 0.6)) return false;
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
  if (!isBot(t)) return m.cls === 'scout' ? 'head' : t.crouch > 0.5 ? (Math.random() < 0.6 ? 'head' : 'torso') : (Math.random() < 0.5 ? 'head' : 'torso');
  if (m.cls === 'sniper') return t.gone.has('head') ? 'torso' : 'head';
  if (m.cls === 'mg' || m.cls === 'rpg' || m.cls === 'hmg') return 'torso';
  // стрелки бьют в самую изношенную зону — вместе продавливают броню
  let best = 'torso', bs = Infinity;
  for (const z of ['torso', 'thighL', 'thighR', 'farmR', 'head']) { if (t.gone.has(z)) continue; const Z = t.Z[z]; const sc = Z.armor * Z.int + Z.hp * 8 + (z === 'torso' ? -300 : 0); if (sc < bs) { bs = sc; best = z; } }
  return best;
}

/* ================= стрельба ИИ ================= */
function muzzle(u, out) { return u.rig.gun.localToWorld(out.set(0, 0, isBot(u) ? (u.cls === 'heavy' ? -1.35 : u.cls === 'scout' ? -1.7 : -1.15) : -0.75)); }
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
  const bb = SS.spawnBullet({ team: u.team, rf: wp, origin: org, dir, mv: wp.mv + gauss() * 3, tracer, owner: u, dt: 0.003 }); if (bb && B.finishing) bb.aimDown = true;
  flashFX(org, wp.g > 10);
  if (Math.random() < 0.22 && Math.abs(org.x - camera.position.x) + Math.abs(org.z - camera.position.z) < 60) SS.fxPuff(org, 0xd8d4cc, 0.1, 0.55, 0.8, dir.clone().multiplyScalar(1.5), 0.25);
  u.kick = 1; u.mag--; u.firedT = B.t;
  SS.sndShotFar(org.distanceTo(camera.position), wp.g > 10 || u.cls === 'mg', isBot(u));
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
function sendTo(u, spot, delay, pos, force) {
  if (!force && u.orderT && B.t < u.orderT) return;
  if (u.carry) return;
  u.prone = false;
  if (u.spot && u.spot !== spot) u.spot.used = null;
  u.spot = spot || null; if (spot) spot.used = u;
  u.slot = spot && spot.pp ? spot : null;
  u.dest = spot ? spot.pos.clone() : pos ? pos.clone() : null;
  if (!u.dest) return;
  u.after = null;
  const onTop = ELEV.length && elevY(u.pos.x, u.pos.z) > 4;
  if (spot && spot.via && !onTop) { u.after = u.dest; u.dest = spot.via.clone(); }
  else if (onTop && !(spot && spot.mill)) { const e = ELEV[0]; u.after = u.dest; u.dest = new V3(e.c.x, 0, e.c.z + e.lad[2] + 0.8); }
  u.state = 'move'; u.moveDelay = delay || 0; u.moveT = 0;
}
function moveUnit(u, dt, speed) {
  const d = _v.set(u.dest.x - u.pos.x, 0, u.dest.z - u.pos.z);
  const L = d.length();
  u.moveT = (u.moveT || 0) + dt;
  if (L < 0.7 || u.moveT > 45 || (L < 3.5 && u.moveT > 6)) { if (u.after) { u.dest = u.after; u.after = null; u.moveT = 0; return false; } u.state = 'pos'; u.vel.set(0, 0, 0); u.moveT = 0; return true; }
  d.divideScalar(L);
  gridQuery(u.pos, u.pos, 3, _sep);
  for (const o of _sep) if (o !== u && o.alive && o.team === u.team && Math.abs(o.pos.x - u.pos.x) < 3 && Math.abs(o.pos.z - u.pos.z) < 3) { const ex = u.pos.x - o.pos.x, ez = u.pos.z - o.pos.z, d2 = ex * ex + ez * ez; if (d2 < 4 && d2 > 1e-4) { d.x += ex / d2 * 0.6; d.z += ez / d2 * 0.6; } }
  const ax = u.pos.x + d.x * 1.8, az = u.pos.z + d.z * 1.8;
  for (const cv of covers) {
    if (cv.ns || Math.abs(cv.c.x - ax) > 9 || Math.abs(cv.c.z - az) > 9) continue;
    const lx = (ax - cv.c.x) * cv.u.x + (az - cv.c.z) * cv.u.z, lz = (ax - cv.c.x) * cv.n.x + (az - cv.c.z) * cv.n.z;
    if (Math.abs(lx) < cv.mx[0] + 0.5 && Math.abs(lz) < cv.mx[2] + 0.5 && L > 2.5) { if (u.stCv !== cv) { u.stCv = cv; u.stS = lx >= 0 ? 1 : -1; } const s = u.stS; d.x += cv.u.x * s * 1.5; d.z += cv.u.z * s * 1.5; }
  }
  d.normalize();
  const gy = terrainH(u.pos.x, u.pos.z);
  const wade = gy < -0.6 ? 0.6 : 1;
  u.cs = lerp(u.cs || 0, speed * wade, Math.min(1, dt * 3.5));
  u.vel.set(d.x * u.cs, 0, d.z * u.cs);
  u.pos.x += u.vel.x * dt; u.pos.z += u.vel.z * dt;
  const cy = climbY(u.pos.x, u.pos.z);
  u.pos.y = terrainH(u.pos.x, u.pos.z) + cy * (isBot(u) ? 1.25 : 1);
  u.yaw += angDiff(faceYaw(d.x, d.z), u.yaw) * Math.min(1, dt * 6);
  return false;
}
function spotNear(team, from, toward, minD, maxD, lane) {
  let best = null, bs = Infinity;
  const wall = WALL(), att = wall || team === attTeam(), side = wall ? (team === 'h' ? 'h' : 'r') : (team === attTeam() ? 'r' : 'h');
  const tx = toward.x - from.x, tz = toward.z - from.z, tl = Math.hypot(tx, tz) || 1;
  const test = (p) => {
    if (p.used) return;
    const ox = p.pos.x - from.x, oz = p.pos.z - from.z;
    const along = (ox * tx + oz * tz) / tl;
    if (along < minD || along > maxD) return;
    const side = Math.abs(p.pos.x - (lane != null ? lane : from.x));
    if (side > 70) return;
    const sc = Math.abs(along - (minD + maxD) / 2) * 0.5 + side * 1.0 + (p.forest ? -12 : 0) + Math.random() * 8;
    if (sc < bs) { bs = sc; best = p; }
  };
  for (const cv of covers) { if (Math.abs(cv.c.x - from.x) > maxD + 80 || Math.abs(cv.c.z - from.z) > maxD + 80) continue; for (const p of cv.pts[side]) test(p); }
  if (att) for (const p of forestSpots) test(p);
  for (const p of ROCKSP[side]) if (Math.abs(p.pos.x - from.x) < maxD + 80 && Math.abs(p.pos.z - from.z) < maxD + 80) test(p);
  else if (!wall) { for (const p of slots.front) test(p); for (const p of slots.rear) test(p); }
  return best;
}

/* ================= люди ================= */
function findPatient(u) {
  let best = null, bd = 1e9;
  const cand = units.filter((h) => h.team === u.team && h !== u && !h.healer && !h.carrier && ((h.alive && h.hp < 70) || (h.down && !h.alive && (canRevive(h, 13) || (u.cls === 'medic' && !h.stab && !h.dead && !h.evac)))));
  if (PL.team === u.team && PL.alive && PL.downed && !PL.healer) cand.push(PL);
  else if (PL.team === u.team && PL.alive && !PL.robot && PL.hp < 70 && !PL.healer) cand.push(PL);
  for (const h of cand) {
    const p = h.isPlayer ? PL.pos : h.pos;
    const d = p.distanceTo(u.pos);
    const dn = h.isPlayer ? PL.downed : !h.alive;
    const lim = u.cls === 'medic' ? 90 : (h.isPlayer || h.squad === u.squad ? 25 : dn ? 12 : 0);
    if (d > lim) continue;
    const sc = d - (h.isPlayer ? 30 : 0) - (100 - h.hp) * 0.2;
    if (sc < bd) { bd = sc; best = h; }
  }
  return best;
}
function doHeal(u, dt) {
  const pt = u.patient;
  const ok = pt && (pt.isPlayer ? PL.alive : pt.alive || (pt.down && !pt.dead && !pt.evac && !pt.carrier && (canRevive(pt) || (u.cls === 'medic' && !pt.stab))));
  if (!ok) { u.patient = null; if (pt) pt.healer = null; u.state = 'pos'; if (u.home) sendTo(u, u.home, 0.3); return; }
  const pp = pt.isPlayer ? PL.pos : pt.pos;
  if (!pt.isPlayer && !pt.alive && !pt.smoked && u.smokes > 0 && !sheltered(pt.pos)) { const th = threatNear(pt, 250); if (th) { pt.smoked = B.t; const dir = th.clone().sub(pp).setY(0).normalize(); throwSmoke(u, pp.clone().addScaledVector(dir, 14)); if (isFriend(u.team) && Math.random() < 0.6) feed(clsName(u.cls) + ': дым! Иду к раненому!', 'me'); } }
  u.dest = pp.clone().add(_v.set(0.6, 0, 0.45));
  if (Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z) > 2.3) { u.crouchT = 0.3; moveUnit(u, dt, u.speed * 0.9); u.state = 'heal'; u.mv = lerp(u.mv, 1, dt * 5); return; }
  u.mv = lerp(u.mv, 0, dt * 6); u.vel.set(0, 0, 0); u.crouchT = 1; u.healing = true;
  u.yaw += angDiff(faceYaw(pp.x - u.pos.x, pp.z - u.pos.z), u.yaw) * Math.min(1, dt * 4);
  u.healT += dt;
  if (u.healT > 3.2) {
    u.healT = 0; u.healing = false; u.kits--;
    const amt = u.cls === 'medic' ? 25 : 10;
    if (pt.isPlayer && PL.downed) revivePlayer(amt, u);
    else if (!pt.isPlayer && !pt.alive && canRevive(pt)) reviveUnit(pt, amt, u);
    else if (!pt.isPlayer && !pt.alive) { pt.stab = true; if (isFriend(pt.team)) feed(clsName(u.cls) + ' остановил кровь (' + clsName(pt.cls) + '). Тащите его в медпункт', 'me'); }
    else if (pt.isPlayer) { PL.hp = Math.min(100, PL.hp + amt); PL.calledMedic = false; feed(clsName(u.cls) + ' перевязал вас: +' + amt, 'me'); }
    else { pt.hp = Math.min(100, pt.hp + amt); if (pt.squad === PL.squad || Math.random() < 0.3) feed(clsName(u.cls) + ' перевязал бойца (' + clsName(pt.cls) + ')'); }
    pt.healer = null; u.patient = null; u.state = 'pos';
    if (u.home) sendTo(u, u.home, 0.5);
  }
}
function updateHuman(u, dt) {
  perceive(u, dt);
  if (u.chute) { u.mv = 0; u.vel.set(0, 0, 0); u.crouchT = 0; return; }
  if (u.carry) { carryStep(u, dt); return; }
  if (u.state === 'camp') { u.crouchT = 1; u.mv = lerp(u.mv, 0, dt * 6); u.vel.set(0, 0, 0); u.scan += dt * 0.3; u.head = lerp(u.head, Math.sin(u.scan + u.id) * 0.6, dt * 2); return; }
  u.cool -= dt; u.supp = Math.max(0, u.supp - dt * 0.8); u.reloadT = Math.max(0, u.reloadT - dt); u.st -= dt;
  if (u.reloadT <= 0 && u.mag <= 0) { u.reloadT = u.cls === 'mg' ? 5.5 : u.cls === 'rpg' ? 4 : 2.6; u.mag = u.cls === 'mg' ? 100 : u.cls === 'sniper' ? 10 : u.cls === 'rpg' ? 1 : 30; }
  // расчёты
  if (u.nest) { hmgCrew(u, dt); return; }
  if (u.mortar) { u.crouchT = 0.75; u.mv = 0; const m = u.mortar; u.yaw += angDiff(faceYaw(-m.pos.x * 0 + 0, -1), u.yaw) * 0.05; if (u.healT > 0) u.healT = 0; return; }
  // перевязка
  if (u.patient || u.state === 'heal') { doHeal(u, dt); return; }
  if (u.kits > 0 && u.supp < 2 && (u.cls === 'medic' || Math.random() < 0.02)) {
    const p = findPatient(u);
    if (p && (u.cls === 'medic' || p.isPlayer || p.hp < 45)) { u.patient = p; p.healer = u; u.home = u.spot; if (u.spot) { u.spot.used = null; u.spot = null; } u.state = 'heal'; u.healT = 0; if (p.isPlayer && isFriend(u.team)) feed(clsName(u.cls) + ': держись, иду к тебе!', 'me'); return; }
  }
  // раненый отходит
  if (!WALL() && u.team === defTeam() && u.hp < 35 && !u.retreated && u.state !== 'move' && !inRear(u)) {
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
    if (u.supp > 3.5 && !(u.orderT > B.t) && !u.carry && B.t > (u.hideT || 0) && u.dest && u.pos.distanceTo(u.dest) > 15) {
      u.hideT = B.t + rnd(6, 10);
      const sp = nearCover(u, 14); if (sp) { sendTo(u, sp, 0); u.run = true; if (isFriend(u.team) && u.squad === PL.squad && Math.random() < 0.5) feed('Тройка: ' + clsName(u.cls) + ' — плотный огонь, залёг!'); return; }
    }
    const sp = u.speed * (u.run ? 1.5 : 1) * (u.hp < 40 ? 0.45 : 1) * (u.supp > 1.5 ? 0.7 : 1);
    if (moveUnit(u, dt, sp)) { u.st = rnd(0.3, 1); u.crouchT = 1; u.run = false; }
    u.mv = lerp(u.mv, 1, dt * 5);
    // огонь на ходу в ближнем бою (неприцельно, короткими)
    const mt = u.target && u.target.alive ? u.target : null;
    if (mt && u.cls !== 'sniper' && u.cls !== 'rpg' && u.cls !== 'medic' && u.reloadT <= 0 && u.mag > 0) {
      u.cool -= 0; if (u.cool <= 0) {
        const tq = aimPointOf(mt, 'torso', new V3()), Dm = tq.distanceTo(u.pos);
        if (Dm < 60 && visibleNow(u, mt)) { if (u.burst <= 0) u.burst = Math.round(rnd(2, 4)); npcFireAt(u, tq, mt.isPlayer ? PL.vel : mt.vel, 7 * (1 + Dm / 60) * (mt.isPlayer ? pEvade() : 1), S.tracers && Math.random() < 0.25 ? 0xff9a3c : 0); u.burst--; u.cool = u.burst > 0 ? 60 / u.wp.rpm : rnd(0.35, 0.7); }
        else u.cool = 0.3;
      }
    }
    return;
  }
  u.mv = lerp(u.mv, 0, dt * 6); u.vel.set(0, 0, 0);
  if (fearStep(u, dt)) return;
  // голова: осмотр сектора или слежение за целью
  const t = u.target && u.target.alive ? u.target : null;
  u.scan += dt * (0.5 + 0.2 * Math.sin(u.id));
  const baseYaw = u.slot ? u.slot.yaw : u.yaw;
  const inCover = !!u.spot;
  // огонь по точке / подавление по приказу
  const autoCover = sq && !sq.player && ((u.coverT > B.t && u.cls !== 'rpg' && u.cls !== 'medic') || (!sq.static && (u.cls === 'mg' || (u.cls === 'rifle' && u.id % 2) || u.cls === 'lead'))) && u.state === 'pos' && (!u.target || !u.target.alive || B.t - (u.seenT || 0) > 3) && Math.random() < 0.985;
  if (sq && ((sq.player && (sq.order === 'fire' || sq.order === 'cover') && B.t < sq.orderT) || autoCover) && u.reloadT <= 0 && u.supp < 3.5) {
    let pt = null;
    if (sq.order === 'fire' && sq.firePt) pt = sq.firePt.clone().add(_v.set(gauss() * 4, 1 + Math.random(), gauss() * 4));
    else { const k = [...TK[u.team].values()].filter((q) => B.t - q.t < 30).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos))[0]; if (k) pt = k.pos.clone().add(_v.set(gauss() * 3, 1.4, gauss() * 3)); }
    if (pt && autoCover && pt.distanceTo(u.pos) > 520) pt = null;
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
    if (!t || !t.alive) u.target = pickTarget(u, u.team === 'h' ? B.load : B.loadR);
    return;
  }
  u.crouchT = 0;
  const tp = aimPointOf(t, u.aimZone, _v3);
  const want = faceYaw(tp.x - u.pos.x, tp.z - u.pos.z);
  u.yaw += angDiff(want, u.yaw) * Math.min(1, dt * 5);
  u.head = lerp(u.head, 0, dt * 6);
  const D = Math.hypot(tp.x - u.pos.x, tp.z - u.pos.z);
  u.pitch = Math.atan2(tp.y - (u.pos.y + 1.45), D);
  u.grenT = (u.grenT || 0) - dt;
  if (u.gren > 0 && u.grenT <= 0 && D < 28 && D > 8 && u.supp < 3) {
    u.grenT = rnd(5, 9);
    if (Math.random() < 0.7) { const from = u.pos.clone().add(_v.set(0, 1.7, 0)); const to = (t.isPlayer ? PL.pos : t.pos).clone(); to.x += gauss() * 1.5; to.z += gauss() * 1.5; throwGrenade(from, lobVel(from, to, 0.9 + D / 30), u.team, false, u); u.gren--; u.kick = 1; u.cool = 1; if (isFriend(u.team)) vSay('Граната!', u, { force: true }); if (isFriend(u.team) && Math.random() < 0.5) feed(clsName(u.cls) + ': граната!'); return; }
  }
  // ближний бой (до 50 м): не стоять в открытую, обходить, раненым — назад
  if (D < 50 && u.state !== 'move' && B.t > (u.cqbT || 0) && !u.nest && !u.mortar) {
    u.cqbT = B.t + rnd(4, 7);
    const tpc = tp.clone(), away = new V3(u.pos.x - tp.x, 0, u.pos.z - tp.z).normalize();
    if (u.hp < 40) { const sp = spotNear(u.team, u.pos, tpc, -30, -6, u.pos.x); if (sp) sendTo(u, sp, 0); else sendTo(u, null, 0, u.pos.clone().addScaledVector(away, 16)); u.run = true; return; }
    if (!u.spot) { const sp = spotNear(u.team, u.pos, tpc, -14, 12, u.pos.x); if (sp) { sendTo(u, sp, 0); u.run = true; return; } }
    if (sq && !sq.player && u.cls === 'rifle' && B.t > (sq.flankT || 0) && sq.members.filter((m) => m.alive).length >= 3) {
      sq.flankT = B.t + 9; const sd = Math.random() < 0.5 ? -1 : 1;
      const p = u.pos.clone().add(new V3(-away.z * sd * 18 - away.x * 6, 0, away.x * sd * 18 - away.z * 6));
      const sp = spotNear(u.team, p, tpc, -10, 10, p.x); if (sp) sendTo(u, sp, 0.2); else sendTo(u, null, 0.2, p); u.run = true;
      if (isFriend(u.team) && Math.random() < 0.3) feed(clsName(u.cls) + ': обхожу сбоку!');
      return;
    }
  }
  if (u.crouch > 0.3) return;
  u.aimT += dt; u.expT += dt;
  if (u.expT > (u.cls === 'mg' ? 6 : 4) && inCover) { u.expT = 0; u.st = rnd(1.5, 3.5); return; }
  const cqb = D < 60;
  if (u.cool > 0 || u.aimT < (u.cls === 'sniper' ? 1.2 : cqb ? (t.isPlayer ? 0.55 : 0.22) : t.isPlayer ? 0.7 : 0.45)) return;
  if (!visibleNow(u, t)) { u.cool = 0.5; u.target = null; return; }
  u.seenT = B.t;
  const acc = 1 + 1.6 * Math.exp(-u.aimT * 1.5);
  // стресс боя: в среднем ~70% от «тировой» меткости, под огнём хуже
  const stress = 1.25 * (1 + Math.min(4, u.supp) * 0.12) * (u.hp < 50 ? 1.2 : 1);
  const base = ({ rifle: 2.6, lead: 2.5, medic: 2.8, mg: 3.2, sniper: 0.55, rpg: 1 }[u.cls] || 2.6) * acc * (1 + D / 700) * stress;
  const size = t.isPlayer ? 0.6 / pEvade() : isBot(t) ? 0.7 : 0.45;
  const pHit = Math.min(1, Math.pow(size / (base * 0.001 * D + 1e-3), 2));
  if (pHit < 0.035 && u.cls !== 'mg') { u.cool = 0.6; return; }
  const vel = t.isPlayer ? PL.vel : t.vel;
  if (u.cls === 'rpg') {
    if (D > 320 || D < 25) { u.cool = 1; return; }
    launchAt(u, aimPointOf(t, 'torso', new V3()), D, 0.006); u.mag--; u.cool = rnd(5, 7); u.expT = 99; u.firedT = B.t;
  } else if (u.cls === 'sniper') {
    npcFireAt(u, aimPointOf(t, u.aimZone, new V3()), vel, base, S.tracers && Math.random() < 0.5 ? 0xff9a3c : 0); u.cool = rnd(2.5, 4); u.aimT = 0.6;
  } else {
    if (u.burst <= 0) u.burst = u.cls === 'mg' ? Math.round(rnd(6, 12)) : cqb ? Math.round(rnd(3, 6)) : Math.round(rnd(2, 4));
    npcFireAt(u, aimPointOf(t, u.aimZone, new V3()), vel, base * (t.isPlayer ? pEvade() : 1), S.tracers && Math.random() < (u.cls === 'mg' ? 0.5 : 0.25) ? 0xff9a3c : 0);
    u.burst--;
    u.cool = u.burst > 0 ? 60 / u.wp.rpm : (cqb ? rnd(0.12, 0.3) : rnd(0.25, 0.55)) * (u.cls === 'mg' ? 1.2 : 1);
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
  if (u.mortarU) { u.vel.set(0, 0, 0); u.mv = lerp(u.mv, 0, dt * 4); u.crouchT = 1; u.kick *= 0.9; return; }
  if (B.t < (B.prepT || 0) && u.state !== 'move') { u.crouchT = 1; u.mv = lerp(u.mv, 0, dt * 4); u.vel.set(0, 0, 0); return; }
  u.cool -= dt; u.rocketCool -= dt; u.reloadT = Math.max(0, u.reloadT - dt);
  u.stagger = Math.max(0, u.stagger - dt * 0.8); u.supp = Math.max(0, (u.supp || 0) - dt * 0.7);
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
  u.grenT = (u.grenT || 0) - dt;
  if (u.gren > 0 && u.grenT <= 0 && D < 32 && D > 7 && !u.crawl) {
    u.grenT = rnd(4, 8);
    if (Math.random() < 0.75) { const from = u.pos.clone().add(_v.set(0, 2.2, 0)); const to = (t.isPlayer ? PL.pos : t.pos).clone(); to.x += gauss() * 1.2; to.z += gauss() * 1.2; throwGrenade(from, lobVel(from, to, 0.8 + D / 35), 'r', false, u); u.gren--; u.kick = 1; u.cool = 0.8; if (isFriend('h') && u.pos.distanceTo(PL.pos) < 60) { feed('Граната!', 'bad'); vSay('Граната! Ложись!', null, { force: true, rate: 1.35 }); } return; }
  }
  if (u.reloadT > 0 || u.crouch > 0.4) return;
  if (u.cls === 'rocket' && u.rocketCool <= 0 && D < 470 && D > 40 && !u.crawl) { launchAt(u, tp.clone().setY(tp.y - 0.4), D, 0.008); u.rocketCool = rnd(8, 12); return; }
  if (B.scen === 'att' && u.spot && u.state === 'pos' && u.supp > (u.cls === 'heavy' ? 4 : 2.2)) { u.crouchT = 1; return; }
  if (u.cool > 0 || D > (EFF[u.cls] || 650) * (B.scen === 'att' ? 0.75 : 1)) return;
  if (u.state === 'move' && u.cls !== 'assault') return;
  if (u.lockT !== t) { u.lockT = t; u.raim = 0; }
  if (!visibleNow(u, t)) { u.cool = 0.35; u.raim = 0; return; }
  u.raim = (u.raim || 0) + Math.max(dt, 0.033);
  if (u.raim < (t.isPlayer ? (D < 50 ? 0.6 : 0.8) : 0.3)) return;
  if (D < 50 && u.state === 'pos' && !u.crawl && u.cls !== 'heavy' && B.t > (u.strafeT || 0)) {
    u.strafeT = B.t + rnd(3.5, 6.5); const sd = Math.random() < 0.5 ? -1 : 1, ax = -(tp.z - u.pos.z) / D, az = (tp.x - u.pos.x) / D;
    sendTo(u, null, 0, u.pos.clone().add(_v2.set(ax * sd * rnd(6, 11), 0, az * sd * rnd(6, 11))));
  }
  const wp = u.wp;
  if (u.burst <= 0) u.burst = Math.round(rnd(wp.burst[0], wp.burst[1]));
  const moving = u.state === 'move' ? 1.7 : 1;
  const vel = t.isPlayer ? PL.vel : t.vel;
  npcFireAt(u, tp.clone(), vel, wp.spread * (u.gone.has('head') ? 5 : 1) * (1 + D / 650) * moving * (t.isPlayer ? pEvade() : 1) * (D < 50 ? 1.25 : 1), S.tracers && Math.random() < 0.6 ? 0x7dff86 : 0);
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
/* ================= командир людей ================= */
const HROUTES = [
  [[-260, -540], [-240, -420], [-200, -300], [-150, -200], [-110, -140]],
  [[-90, -560], [-80, -420], [-50, -300], [-30, -200], [-15, -140]],
  [[90, -560], [80, -420], [50, -300], [30, -200], [15, -140]],
  [[260, -540], [240, -420], [200, -300], [150, -200], [110, -140]],
];
const TN = (t) => (B.pvp ? (t === 'r' ? 'серых' : 'зелёных') : t === 'r' ? 'роботов' : 'людей');
function computeLoads() {
  B.load = new Map(); B.loadR = new Map();
  for (const u of units) if (u.alive && u.target && u.target.alive) { const L = u.team === 'h' ? B.load : B.loadR; L.set(u.target, (L.get(u.target) || 0) + 1); }
}
function aliveN(team) { let n = 0; for (const u of units) if (u.team === team && u.alive) n++; return n + (PL.alive && PL.team === team ? 1 : 0); }
function brainAttack(team) {
  const foe = enemyTeam(team);
  const defAlive = aliveN(foe), attAlive = aliveN(team);
  const manT = team === 'h' || !!B.pvp;
  const str = team === 'r' && !B.pvp ? 3.2 : 0.75;
  const me = isFriend(team);
  const holdD = team === 'r' && !B.pvp ? [900, 750] : [430, 380];
  const hold = (m) => m.cls === 'scout' || m.cls === 'sniper';
  // люди не идут на убой: при больших потерях отходят перекатами, перегруппировываются и атакуют снова
  B.wd = B.wd || {}; B.wBase = B.wBase || Object.assign({}, B.n0);
  if (!B.wd[team] && B.t > 60 && attAlive >= 2 && attAlive < (B.wBase[team] || 0) && attAlive <= Math.ceil((B.wBase[team] || attAlive) * (manT ? 0.5 : 0.65))) {
    const until = B.t + rnd(80, 110); B.wd[team] = { until };
    if (me) cmdSay(manT ? 'Атака захлебнулась! Отходим перекатами — одни прикрывают, другие бегут! Раненых выносить!' : 'Группы отходят на ремонт и перезарядку, прикрывая друг друга'); else feed(manT ? 'Противник отходит перекатами под прикрытием' : 'Роботы отходят на ремонт — у вас есть время', 'me');
    B.wd[team].stage = null;
    const stage = WALL() ? new V3(B.wm[team][0], 0, B.wm[team][1]) : B.scen === 'att' && team === 'h' ? new V3(0, 0, -640) : B.scen === 'att' ? new V3(0, 0, 300) : new V3(0, 0, -900); B.wd[team].stage = stage; if (me && PL.alive && PL.team === team) { const sp = stage.clone(); sp.y = terrainH(sp.x, sp.z); B.obj2 = { pos: sp, text: 'Отход на сборный пункт, кв. ' + grid(sp) }; }
    for (const g of squads) { if (g.team !== team || g.player || g.static) continue; g.phase = 'hold'; g.holdT = until; const cc = groupCenter(g);
      if (cc && manT) { const ks = [...TK[team].values()].filter((q) => B.t - q.t < 30); const ec = ks.length ? ks.reduce((a, q) => a.add(q.pos), new V3()).divideScalar(ks.length) : new V3(0, 0, HILL.cz); const dir = ec.clone().sub(cc).setY(0).normalize(); if (isFinite(dir.x)) for (const o of [-14, 0, 14]) { const sp = cc.clone().addScaledVector(dir, rnd(35, 50)).add(_v2.set(-dir.z * o, 0, dir.x * o)); makeSmoke(new V3(sp.x, terrainH(sp.x, sp.z), sp.z), rnd(14, 18), rnd(60, 80), 6, true); } }
      boundMove(g, stage.clone().add(_v.set(cc ? clamp(cc.x, -300, 300) * 0.6 : gauss() * 60, 0, gauss() * 15)), null); }
  }
  if (B.wd[team] && B.wd[team].stage && !manT) for (const u of units) if (u.team === team && u.alive && u.Z && Math.hypot(u.pos.x - B.wd[team].stage.x, u.pos.z - B.wd[team].stage.z) < 120) for (const z in u.Z) { const Z = u.Z[z]; if (Z.hp > 0) { Z.hp = Math.min(Z.max, Z.hp + Z.max * 0.02); Z.int = Math.min(1, Z.int + 0.02); } }   // ремонт на сборном пункте
  if (B.wd[team] && B.t > B.wd[team].until) { B.wd[team] = null; B.wBase[team] = attAlive; if (me) cmdSay('Перегруппировались. Снова вперёд — перекатами, под дымом!'); else feed('Противник перегруппировался и снова наступает', 'bad'); for (const g of squads) if (g.team === team && !g.player && !g.static) { g.smoked = false; g.phase = 'deploy'; } }
  // противник пропал из виду — прочёсывание местности
  B.seenT = B.seenT || {};
  if (!B.seenT[team] || [...TK[team].entries()].some(([e, q]) => B.t - q.t < 40 && (e.isPlayer ? PL.alive : e.alive && !e.crawl))) B.seenT[team] = B.t;
  const hunting = B.t - B.seenT[team] > 50 && !POINTS();
  if (hunting && !B.huntSaid?.[team]) { B.huntSaid = B.huntSaid || {}; B.huntSaid[team] = true; if (me) cmdSay('Противник пропал из виду. Прочесать местность — двойками, прикрывая друг друга!'); else feed(TN(team) === 'роботов' ? 'Роботы прочёсывают местность' : 'Противник прочёсывает местность', 'bad'); }
  if (!hunting && B.huntSaid) B.huntSaid[team] = false;
  for (const g of squads) {
    if (g.team !== team || g.player || (g.static && !hunting) || g.bm) continue;
    if (g.static) { const al2 = g.members.filter((m) => m.alive && !m.crawl && !m.mortar && !m.nest && !m.chute); if (al2.length) huntStep(g, al2, groupCenter(g) || al2[0].pos.clone(), team, foe); continue; }
    if (g.phase === 'hold' && g.holdT) { if (B.t < g.holdT) continue; g.phase = 'bound'; g.holdT = 0; }
    if (g.phase === 'chute') { if (g.members.some((m) => m.alive && m.chute)) continue; g.phase = 'deploy'; if (me) feed(g.name + ': приземлились, к бою!'); }
    const al = g.members.filter((m) => m.alive && !m.crawl && !m.chute && !m.mortar);
    if (!al.length) continue;
    const c = groupCenter(g) || al[0].pos.clone();
    if (hunting && !B.wd[team]) { huntStep(g, al, c, team, foe); continue; }
    if (WALL()) {
      const ks = [...TK[team].values()].filter((q) => B.t - q.t < 25);
      if (ks.length) { const gx = ks.reduce((s, q) => s + q.pos.x, 0) / ks.length, gz = ks.reduce((s, q) => s + q.pos.z, 0) / ks.length; g.goal = new V3(gx, 0, gz); }
      else if (!g.goal) { const en = B.wm[enemyTeam(team)]; g.goal = new V3(en[0], 0, en[1]); }
      g.route = [[g.goal.x, g.goal.z]]; g.wi = 0;
    }
    if (POINTS() && B.pts) { const pt = pickPoint(g, team, c); if (g.ptN !== pt.n) g.atPt = null; g.ptN = pt.n; g.goal = pt.pos; g.route = [[pt.pos.x, pt.pos.z]]; g.wi = 0; }
    if (B.fallback && !WALL() && team !== B.fallTeam && g.goal !== B.fallPt) { g.goal = B.fallPt; g.route = [[0, HILL.cz], [B.fallPt.x, B.fallPt.z]]; g.wi = c.z > HILL.cz - 30 ? 1 : 0; if (g.phase === 'march') g.phase = 'bound'; }
    const goal = g.goal || HILLV;
    const toHill = Math.hypot(c.x - goal.x, c.z - goal.z);
    if (POINTS() && toHill < 40) {
      if (g.atPt !== g.ptN) { g.atPt = g.ptN; if (g.phase === 'march' || g.phase === 'deploy') g.phase = 'bound';
        al.forEach((m, i) => { const a = i / Math.max(1, al.length) * TAU, tp = goal.clone().add(_v.set(Math.cos(a) * 13, 0, Math.sin(a) * 13)); const sp = spotNear(team, m.pos, tp, -25, 25, tp.x); if (sp) sendTo(m, sp, i * 0.2); else sendTo(m, null, i * 0.2, tp); }); }
      continue;
    }
    if (g.holdLine) {
      if (!g.dug) { g.dug = true; al.forEach((m, i) => { const sp = spotNear(team, m.pos, goal, -40, 45, m.pos.x); if (sp) sendTo(m, sp, i * 0.4); }); }
      const close = units.some((e) => e.team !== team && e.alive && e.pos.distanceTo(c) < 170) || (PL.alive && PL.team !== team && PL.pos.distanceTo(c) < 170);
      if (!close) continue;
    }
    if (g.phase === 'wait') { if (B.t > g.release || attAlive < B.NA * 0.55) { g.phase = 'march'; if (B.wave < 2) { B.wave = 2; feed(me ? 'Второй эшелон выдвигается!' : 'Новая волна ' + TN(team) + ' выходит на рубеж!', me ? 'me' : 'bad'); } } continue; }
    const spotted = al.some((m) => { const k = TK[foe].get(m); return k && B.t - k.t < 6; });
    const sees = [...TK[team].values()].some((q) => B.t - q.t < 8 && q.pos.distanceTo(c) < 900);
    if (g.phase === 'march') {
      if (toHill < 780 || ((spotted || sees) && toHill < 950)) { g.phase = 'deploy'; al.forEach((m) => { m.state = 'pos'; m.dest = null; }); if (me) feed(g.name + ': контакт, развёртываемся'); }
      else {
        const wp = g.route[g.wi];
        if (!wp) { g.phase = 'deploy'; continue; }
        if (Math.hypot(c.x - wp[0], c.z - wp[1]) < 25) g.wi++;
        al.forEach((m, i) => { const o = (i - (al.length - 1) / 2) * 5; m.dest = new V3(wp[0] + o, 0, wp[1] - i * 3); m.state = 'move'; m.moveDelay = 0; m.moveT = 0; if (m.spot) { m.spot.used = null; m.spot = null; } });
      }
      continue;
    }
    if (g.phase === 'deploy') {
      const foeNear = [...TK[team].values()].some((q) => B.t - q.t < 30 && q.pos.distanceTo(c) < 500);
      if (!g.smoked && al.length && foeNear) {
        const dir = new V3(goal.x - c.x, 0, goal.z - c.z).normalize();
        const n = Math.min(2, al.filter((m) => m.smokes > 0).length);
        const sm = al.filter((m) => m.smokes > 0);
        for (let i = 0; i < n; i++) { const at = c.clone().addScaledVector(dir, rnd(70, 120)).add(_v.set(-dir.z * (i - 1) * 26, 0, dir.x * (i - 1) * 26)); throwSmoke(sm[i], at); }
        g.smoked = true;
        if (n && !me && B.side !== team) feed(B.pvp ? 'Противник ставит дымовую завесу!' : team === 'r' ? 'Роботы ставят дымовую завесу!' : 'Люди ставят дымовую завесу!', 'bad');
        if (n && me) feed(g.name + ': ставим дым, вперёд');
      }
      g.phase = 'bound'; g.turn = 0;
    }
    if (g.phase === 'bound') {
      const lossF = 1 - al.length / g.members.length;
      if (lossF >= 0.6 && !g.regrouped) { g.phase = 'regroup'; g.regroupT = B.t + rnd(30, 45); g.regrouped = true; const away = c.clone().sub(goal).setY(0).normalize(), back = c.clone().addScaledVector(away, 160); al.forEach((m, i) => { const sp = spotNear(team, m.pos, back, 40, 220, m.pos.x); if (sp) sendTo(m, sp, i * 0.3); }); feed(me ? g.name + ': большие потери, отходим на перегруппировку' : 'Противник отходит на перегруппировку', me ? 'bad' : ''); continue; }
      if (!POINTS() && toHill < 300 && (attAlive * str > defAlive || toHill < 200)) { g.phase = 'assault'; if (me) vSay(manT ? 'Вперёд! Ура-а!' : 'Штурм!', null, { force: true, rate: 1.1 }); feed(me ? g.name + ': штурм!' : (B.pvp ? 'Противник' : team === 'r' ? 'Роботы' : 'Люди') + ' идут на штурм высоты!', me ? 'me' : 'bad'); continue; }
      // огневая группа: встаёт на рубеже ~400 м и подавляет, пока остальные не пойдут на штурм
      if (g.tactic === 'support' && toHill < 440 && !squads.some((o) => o.team === team && o !== g && o.phase === 'assault')) { al.forEach((m) => { m.rush = false; }); continue; }
      smokeScreen(g, al, c, goal, team);
      const rush = toHill > 450 || B.t - (g.underFire || -99) < 4;
      if (rush) {
        const wpn = g.route[Math.min(g.wi, g.route.length - 1)];
        if (Math.hypot(c.x - wpn[0], c.z - wpn[1]) < 90 && g.wi < g.route.length - 1) g.wi++;
        const toward = tacticToward(g, new V3(wpn[0], 0, wpn[1]), toHill, goal);
        al.forEach((m, i) => { if (m.state === 'move' || (hold(m) && toHill < holdD[0])) return; const sp = spotNear(team, m.pos, toward, 80, 170, lerp(m.pos.x, toward.x, 0.6) + (i - 1) * 6); if (sp) sendTo(m, sp, i * 0.2); else { const d = toward.clone().sub(m.pos).setY(0).normalize(); sendTo(m, null, i * 0.2, m.pos.clone().addScaledVector(d, 110).add(_v.set((i - 1) * 6, 0, 0))); } m.rush = true; if (manT) m.run = true; });
        continue;
      }
      al.forEach((m) => { m.rush = false; });
      const moving = al.filter((m) => m.state === 'move').length;
      if (moving <= Math.floor(al.length / 3)) {
        const wpn = g.route[Math.min(g.wi, g.route.length - 1)];
        const toward = tacticToward(g, new V3(wpn[0], 0, wpn[1]), toHill, goal);
        if (Math.hypot(c.x - wpn[0], c.z - wpn[1]) < 70 && g.wi < g.route.length - 1) g.wi++;
        al.forEach((m, i) => { if (i % 2 !== g.turn) m.coverT = B.t + 4; });
        al.filter((m, i) => i % 2 === g.turn).forEach((m, i) => {
          if (m.state === 'move' || hold(m) && toHill < holdD[1]) return;
          const sp = spotNear(team, m.pos, toward, 35, 120, lerp(m.pos.x, toward.x, 0.5));
          if (sp) sendTo(m, sp, i * 0.4);
          else { const d = toward.clone().sub(m.pos).setY(0).normalize(); sendTo(m, null, i * 0.4, m.pos.clone().addScaledVector(d, 60)); }
        });
        g.turn = 1 - g.turn;
      }
    }
    if (g.phase === 'regroup' && B.t > g.regroupT) { g.phase = 'bound'; feed(me ? g.name + ': снова вперёд!' : 'Противник снова наступает', me ? 'me' : 'bad'); }
    if (g.phase === 'assault' && WALL()) { assaultWall(g, al, team, manT); continue; }
    if (g.phase === 'assault' && B.fallback && team !== B.fallTeam) { villageAssault(g, al, team, manT); continue; }
    if (g.phase === 'assault') {
      const movingN = al.filter((m) => m.state === 'move').length;
      if (manT && movingN) continue;
      g.turn = 1 - (g.turn || 0);
      al.forEach((m, i) => {
        if (m.state === 'move' && m.dest && m.dest.z > HILL.cz - 170) return;
        if (hold(m)) return;
        if (manT) {
          if (i % 2 !== g.turn && al.length > 1) return;
          const s = slots.front.filter((q) => !q.used || q.used.team === team).sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0];
          const goal = s ? s.pos : new V3(m.pos.x, 0, HILL.cz - 150);
          const dd = goal.distanceTo(m.pos);
          const p = dd < 45 ? goal.clone().add(_v.set(gauss() * 2, 0, rnd(-1, 4))) : m.pos.clone().lerp(goal, 38 / dd).add(_v.set(gauss() * 3, 0, 0));
          sendTo(m, null, Math.random() * 0.5, p); m.run = true;
          return;
        }
        const s = slots.front.filter((q) => !q.used || q.used.team === team).sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0];
        const p = s ? s.pos.clone().add(_v.set(gauss() * 2, 0, rnd(-1, 4))) : new V3(m.pos.x, 0, HILL.cz - 150);
        sendTo(m, null, Math.random() * 0.6, p);
        if (manT) m.run = true;
      });
    }
  }
}
const HILLV = new V3(0, 0, HILL.cz);
const TACT = { front: 'штурм в лоб', flankL: 'обход слева', flankR: 'обход справа', support: 'огневая поддержка' };
function tacticToward(g, toward, dist, goal) {
  if ((g.tactic === 'flankL' || g.tactic === 'flankR') && dist > 300) {
    const s = g.tactic === 'flankL' ? -1 : 1, d = new V3(goal.x - toward.x, 0, goal.z - toward.z); d.normalize();
    // смещаемся поперёк направления на цель
    toward.x = goal.x + d.z * s * 260 - d.x * 120; toward.z = goal.z - d.x * s * 260 - d.z * 120;
  }
  return toward;
}
// дымовой РПГ: гранатомётчик ставит завесу между группой и противником, когда группу прижали
function smokeScreen(g, al, c, goal, team) {
  if (g.smokeRkT && B.t < g.smokeRkT) return;
  if (B.t - (g.underFire || -99) > 3) return;
  const m = al.find((q) => q.smokeRk > 0 && q.state !== 'move'); if (!m) return;
  const d = new V3(goal.x - c.x, 0, goal.z - c.z); const L = d.length(); if (L < 160) return; d.normalize();
  const at = c.clone().addScaledVector(d, Math.min(220, L * 0.45)); at.y = terrainH(at.x, at.z) + 1;
  m.smokeRk--; g.smokeRkT = B.t + 40;
  const org = isBot(m) && m.rig.pod ? m.rig.pod.localToWorld(new V3(0, 0.05, -0.35)) : muzzle(m, new V3());
  const D = org.distanceTo(at), dir = at.clone().sub(org).normalize();
  dir.applyAxisAngle(_v3.set(-dir.z, 0, dir.x).normalize(), HOOK.rocketElev(D));
  launchRocket(org, dir, team, false, m, true);
  if (isFriend(team)) feed(clsName(m.cls) + ': ставлю дым из РПГ!');
}
// стенка на стенку: ближний штурм перебежками на ближайшего противника
function assaultWall(g, al, team, manT) {
  const foes = units.filter((u) => u.team !== team && u.alive); if (PL.alive && PL.team !== team) foes.push(PL);
  if (!foes.length) return;
  if (manT && al.some((m) => m.state === 'move')) return;
  g.turn = 1 - (g.turn || 0);
  al.forEach((m, i) => {
    if (m.state === 'move' || (manT && i % 2 !== g.turn && al.length > 1)) return;
    let t = null, bd = 1e9; for (const f of foes) { const p = f.isPlayer ? PL.pos : f.pos; const d = p.distanceTo(m.pos); if (d < bd) { bd = d; t = p; } }
    if (bd < 22) return;
    const ahead = m.pos.clone().lerp(t, Math.min(0.85, 30 / bd));
    const sp = nearCover({ pos: ahead, team, alive: true }, 22, t) || spotNear(team, m.pos, t, 15, 50, lerp(m.pos.x, t.x, 0.5) + (i - al.length / 2) * 5);
    if (sp) sendTo(m, sp, Math.random() * 0.4); else sendTo(m, null, Math.random() * 0.4, m.pos.clone().lerp(t, Math.min(0.9, 36 / bd)).add(_v.set(gauss() * 3, 0, gauss() * 3)));
    if (manT) m.run = true;
  });
}
// ===== война за точки =====
const PTS_DEF = [['А', -420, -990], ['Б', -160, -985], ['В', 140, -1040], ['Г', -300, -1330], ['Д', 60, -1300], ['Е', 420, -1250]];
const ptsMeshes = [];
const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 6, 6); poleGeo.translate(0, 3, 0);
const flagGeo = new THREE.BoxGeometry(1.6, 1.0, 0.04); flagGeo.translate(0.8, 5.4, 0);
function setupPoints() {
  ptsMeshes.forEach((m) => scene.remove(m)); ptsMeshes.length = 0; B.pts = null;
  if (!POINTS()) return;
  B.pts = PTS_DEF.map(([n, x, z]) => {
    const p = { n, pos: new V3(x, terrainH(x, z), z), own: null, cap: 0 };
    const gr = new THREE.Group(); gr.position.copy(p.pos);
    gr.add(new THREE.Mesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x555a5e })));
    p.flagM = new THREE.MeshLambertMaterial({ color: 0xbdbdbd, emissive: 0x111111 }); gr.add(new THREE.Mesh(flagGeo, p.flagM));
    scene.add(gr); ptsMeshes.push(gr); return p;
  });
  const n = (t) => units.filter((u) => u.team === t).length + (PL.team === t ? 1 : 0);
  B.tk = { h: 150, r: 150 }; B.tkD = { h: 80 / Math.max(4, n('h')), r: 80 / Math.max(4, n('r')) }; B.tkT = 5; B.waveT = 30; B.waveDead = { h: 0, r: 0 };
}
function pickPoint(g, team, c) {
  let best = B.pts[0], bs = 1e9;
  for (const p of B.pts) {
    const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
    const mine = p.own === team && Math.abs(p.cap) >= 100;
    const threat = units.some((e) => e.alive && e.team !== team && Math.abs(e.pos.x - p.pos.x) < 70 && Math.abs(e.pos.z - p.pos.z) < 70);
    let s = d + (mine ? (threat ? 80 : 850) : 0) + squads.filter((o) => o !== g && o.team === team && o.ptN === p.n).length * 200 - (g.ptN === p.n ? 140 : 0);
    if (s < bs) { bs = s; best = p; }
  }
  return best;
}
function pointsTick(dt) {
  for (const p of B.pts) {
    let nh = 0, nr = 0;
    for (const u of units) if (u.alive && !u.chute && Math.abs(u.pos.x - p.pos.x) < 25 && Math.abs(u.pos.z - p.pos.z) < 25) { if (u.team === 'h') nh++; else nr++; }
    if (PL.alive && !PL.downed && Math.hypot(PL.pos.x - p.pos.x, PL.pos.z - p.pos.z) < 25) { if (PL.team === 'h') nh++; else nr++; }
    const old = p.own;
    if (nh && !nr) p.cap = Math.min(100, p.cap + dt * 9 * Math.min(3, nh)); else if (nr && !nh) p.cap = Math.max(-100, p.cap - dt * 9 * Math.min(3, nr));
    p.own = p.cap >= 100 ? 'h' : p.cap <= -100 ? 'r' : old === 'h' && p.cap > 0 ? 'h' : old === 'r' && p.cap < 0 ? 'r' : null;
    p.contested = !!(nh && nr);
    if (p.own !== old) {
      if (p.own) { if (isFriend(p.own)) cmdSay('Точка ' + p.n + ' наша!'); else feed('Противник взял точку ' + p.n + '!', 'bad'); }
      else if (old) feed('Точка ' + p.n + ' нейтральна', isFriend(old) ? 'bad' : 'me');
    }
    const k = Math.abs(p.cap) / 100, col = p.cap > 0 ? [0.35, 0.6, 1] : p.cap < 0 ? [1, 0.32, 0.25] : [0.75, 0.75, 0.75];
    p.flagM.color.setRGB(lerp(0.75, col[0], k), lerp(0.75, col[1], k), lerp(0.75, col[2], k));
  }
  B.tkT -= dt;
  if (B.tkT <= 0) { B.tkT = 5; const oh = B.pts.filter((p) => p.own === 'h').length, or = B.pts.filter((p) => p.own === 'r').length; if (oh > or) B.tk.r -= (oh - or) * 3; else if (or > oh) B.tk.h -= (or - oh) * 3; }
  for (const u of units) if (!u.alive && !u.tkC) { u.tkC = true; B.tk[u.team] -= B.tkD[u.team]; B.waveDead[u.team]++; }
  B.waveT -= dt;
  if (B.waveT <= 0) { B.waveT = 30; ['h', 'r'].forEach((t) => { const n = Math.min(8, B.waveDead[t]); if (n >= 2 && B.tk[t] > 0) { B.waveDead[t] -= n; reinforce(t, n, 'Свежие силы с базы'); } }); }
}
// ===== перетаскивание раненых =====
function nearDowned() { if (!B.active || !PL.alive || PL.downed || PL.robot) return null; for (const u of units) if (u.team === PL.team && !u.alive && u.down && !u.dead && !u.evac && !u.carrier && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 2.2) return u; return null; }
function updateDrag(dt) {
  const u = B.drag; if (!u) return;
  if (!PL.alive || PL.downed || u.alive || u.dead || u.evac) { B.drag = null; HOOK.speedMul = PL.downed ? 0.2 : 1; return; }
  const bx = P.x + Math.sin(P.yaw) * 1.15, bz = P.z + Math.cos(P.yaw) * 1.15;
  u.pos.set(bx, terrainH(bx, bz) + (HOOK.climbY ? climbY(bx, bz) : 0), bz); u.slide.set(0, 0, 0); u.yaw = P.yaw;
  if (u.downT != null) u.downT += dt;   // пока тащат — кровь не уходит
  const cc = ccpFor(PL.team, u.pos); if (cc && Math.hypot(cc.pos.x - u.pos.x, cc.pos.z - u.pos.z) < 6) { evacuate(u, PL); B.drag = null; HOOK.speedMul = 1; return; }
  if ((B.dragS = (B.dragS || 0) + dt) > 0.6 && P.moving > 0.2) { B.dragS = 0; SS.fxPuff(_v.set(bx, u.pos.y + 0.1, bz), 0x8a7a5c, 0.2, 0.6, 1, null, 0.25); }
}

// ===== раненые: кровь, добивание, эвакуация =====
const canRevive = (u, lim) => !u.dead && !u.evac && (u.revives || 0) < 2 && B.t - (u.downT || -99) < (lim || 15);
function ccpFor(team, p) {
  let list;
  if (WALL()) list = [{ pos: new V3(B.wm[team][0], terrainH(B.wm[team][0], B.wm[team][1] + (team === 'h' ? 25 : -25)), B.wm[team][1] + (team === 'h' ? 25 : -25)), name: 'тыл' }];
  else if (team === defTeam()) list = CCP;
  else { const q = B.scen === 'att' ? new V3(0, 0, -630) : EVILL; list = [{ pos: new V3(q.x, terrainH(q.x, q.z), q.z), name: B.scen === 'att' ? 'ЛЗ' : 'тыл' }]; }
  let b = null, bd = 1e9; for (const c of list) { const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z); if (d < bd) { bd = d; b = c; } } return b;
}
function killDowned(u, how, by) {
  if (u.dead || u.evac || u.alive) return;
  u.dead = true; u.writhe = false; u.stab = false;
  if (u.carrier) { u.carrier.carry = null; u.carrier = null; }
  if (B.drag === u) { B.drag = null; HOOK.speedMul = 1; }
  if (B.kia) B.kia[u.team]++;
  if (isFriend(u.team) && (u.squad === PL.squad || Math.random() < 0.5)) feed(how === 'bleed' ? clsName(u.cls) + ' истёк кровью' : how === 'blast' ? 'Раненого (' + clsName(u.cls) + ') накрыло взрывом' : 'Добили раненого: ' + clsName(u.cls), 'bad');
  else if (by === 'player') feed('Вы добили раненого (' + clsName(u.cls) + ')', 'me');
}
function evacuate(u, by) {
  if (u.dead || u.evac) return;
  u.evac = true; u.stab = true; u.writhe = false;
  if (u.carrier) { u.carrier.carry = null; u.carrier = null; }
  { const cc = ccpFor(u.team, u.pos), n = units.filter((x) => x.evac && x.team === u.team).length, a = n * 1.9, r = 1.6 + (n % 3) * 1.1;
    if (cc) { const x = cc.pos.x + Math.cos(a) * r, z = cc.pos.z + Math.sin(a) * r; u.pos.set(x, terrainH(x, z) + climbY(x, z), z); u.yaw = a; } }
  if (B.evacN) B.evacN[u.team]++;
  if (isFriend(u.team)) feed((by && by.isPlayer ? 'Вы доставили' : clsName(by ? by.cls : 'rifle') + ' доставил') + ' раненого (' + clsName(u.cls) + ') в медпункт — будет жить', 'me');
}
function woundsTick(dt) {
  for (const u of units) {
    if (!u.down || u.alive || u.dead || u.evac || isBot(u)) continue;
    if (u.carrier) { u.downT += dt; continue; }
    if (B.t - u.downT > (u.stab ? 150 : 15)) killDowned(u, 'bleed');
  }
}
// бойцы сами выносят раненых, которых уже не поднять, — если рядом нет боя
function carryTick() {
  rescueTick();
  for (const d of units) {
    if (!d.down || d.alive || d.dead || d.evac || d.carrier || B.drag === d || isBot(d)) continue;
    if (B.t - d.downT < 3 || threatNear(d, 160)) continue;
    const medic = units.some((m) => m.alive && m.team === d.team && m.cls === 'medic' && m.kits > 0 && m.pos.distanceTo(d.pos) < 90);
    if (!d.stab && canRevive(d) && medic) continue;
    { const cc = ccpFor(d.team, d.pos); if (!cc || Math.hypot(cc.pos.x - d.pos.x, cc.pos.z - d.pos.z) > 450) continue; }
    if (units.some((m) => m.carry && m.squad === d.squad)) continue;
    let best = null, bd = 40;
    for (const h of units) {
      if (!h.alive || h.team !== d.team || isBot(h) || h.carry || h.patient || h.nest || h.mortar || h.chute || h.state === 'camp' || (h.orderT && B.t < h.orderT) || h.supp > 1.5) continue;
      if (h.squad && h.squad.player) continue;
      const dd = h.pos.distanceTo(d.pos); if (dd >= bd) continue;
      if ([...TK[h.team].values()].some((q) => B.t - q.t < 8 && q.pos.distanceTo(h.pos) < 70)) continue;
      best = h; bd = dd;
    }
    if (!best) continue;
    best.carry = d; d.carrier = best; if (best.spot) { best.spot.used = null; best.spot = null; } best.state = 'carry'; best.target = null;
    if (isFriend(d.team) && (d.squad === PL.squad || Math.random() < 0.35)) feed(clsName(best.cls) + ' тащит раненого (' + clsName(d.cls) + ') в медпункт', 'me');
  }
}
function carryStep(u, dt) {
  const b = u.carry;
  if (!b || b.dead || b.alive || b.evac) { u.carry = null; if (b) b.carrier = null; u.state = 'pos'; return; }
  if (u.pos.distanceTo(b.pos) > 2.5) { u.dest = b.pos.clone(); u.crouchT = 0.3; moveUnit(u, dt, u.speed); u.mv = lerp(u.mv, 1, dt * 5); return; }
  if (b.carryTo) {
    if (Math.hypot(b.carryTo.x - u.pos.x, b.carryTo.z - u.pos.z) < 2.2 || B.t - (b.carryT0 || B.t) > 40) { b.carryTo = null; b.sheltered = true; u.carry = null; b.carrier = null; u.state = 'pos'; u.orderT = 0; if (isFriend(u.team) && (u.squad === PL.squad || Math.random() < 0.4)) feed(clsName(u.cls) + ': раненый в укрытии — санитара!', 'me'); return; }
    u.dest = b.carryTo.clone(); u.crouchT = 0.5;
    moveUnit(u, dt, u.speed * 0.8); u.state = 'carry'; u.mv = lerp(u.mv, 0.7, dt * 5);
    const bx0 = u.pos.x + Math.sin(u.yaw) * 1.15, bz0 = u.pos.z + Math.cos(u.yaw) * 1.15;
    b.pos.set(bx0, terrainH(bx0, bz0) + climbY(bx0, bz0), bz0); b.slide.set(0, 0, 0); b.yaw = u.yaw; return;
  }
  const cc = ccpFor(u.team, u.pos); if (!cc) { u.carry = null; b.carrier = null; return; }
  if (Math.hypot(cc.pos.x - u.pos.x, cc.pos.z - u.pos.z) < 5) { evacuate(b, u); u.state = 'pos'; return; }
  u.dest = cc.pos.clone(); u.crouchT = 0.2;
  moveUnit(u, dt, u.speed * 0.7); u.state = 'carry'; u.mv = lerp(u.mv, 0.55, dt * 5);
  const bx = u.pos.x + Math.sin(u.yaw) * 1.15, bz = u.pos.z + Math.cos(u.yaw) * 1.15;
  b.pos.set(bx, terrainH(bx, bz) + climbY(bx, bz), bz); b.slide.set(0, 0, 0); b.yaw = u.yaw;
}
// противник добивает раненых, если рядом нет живой цели
function finishTick() {
  for (const s of units) {
    if (!s.alive || s.chute || s.nest || s.mortar || s.carry || s.patient || s.reloadT > 0 || s.mag <= 0 || (s.target && s.target.alive) || s.state === 'camp' || !s.wp || s.wp.type === 'rocket') continue;
    if (Math.random() > (isBot(s) ? 0.3 : 0.12)) continue;
    let d = null, bd = 45;
    for (const v of units) { if (v.alive || !v.down || v.dead || v.evac || v.team === s.team || B.t - v.downT < 2) continue; const dd = v.pos.distanceTo(s.pos); if (dd < bd) { bd = dd; d = v; } }
    if (!d) continue;
    const eye = eyeOf(s, new V3()), tp = _v3.set(d.pos.x, d.pos.y + 0.25, d.pos.z);
    if (!los(eye, tp)) continue;
    s.yaw = s.aimYaw = faceYaw(tp.x - s.pos.x, tp.z - s.pos.z);
    const n = isBot(s) ? 3 : 2; B.finishing = true; for (let i = 0; i < n; i++) npcFireAt(s, tp.clone(), null, 3, i === 0); B.finishing = false;
  }
}
// ===== отход: высота потеряна — бой продолжается у деревни =====
function retreatTo(team, why, byPlayer) {
  if (B.fallback || WALL()) return;
  B.fallback = true; B.fallTeam = team; B.fallPt = VILL.clone(); B.fallPt.y = terrainH(B.fallPt.x, B.fallPt.z);   // тыл обороны всегда на юге, за высотой
  const spots = POI.vil.spots;
  const me = isFriend(team);
  if (me && PL.squad && PL.squad.team === team) { PL.squad.order = 'follow'; PL.squad.members.forEach((m) => { m.orderT = 0; }); }
  if (me) { cmdSay((byPlayer ? '' : why + '! ') + 'Всем отход в деревню мелкими группами — по двое, прикрывая друг друга! Раненых — в медпункт'); const ns = spots.slice().sort((a, b) => a.pos.distanceTo(PL.pos) - b.pos.distanceTo(PL.pos))[0]; B.pslot = { pos: (ns ? ns.pos : B.fallPt).clone(), text: 'Отход в деревню, занять оборону' }; if (PL.team === team) B.obj2 = { pos: B.pslot.pos.clone(), text: B.pslot.text + ', кв. ' + grid(B.pslot.pos) }; }
  else feed('Противник оставляет ' + (team === 'r' && !B.pvp ? 'высоту' : 'позиции') + ' и отходит к деревне', 'me');
  for (const sq of squads) {
    if (sq.team !== team || sq.player) continue;
    sq.order = 'village'; sq.phase = 'hold';
    sq.members.forEach((m) => { if (!m.alive) return; if (m.nest) { m.nest.crew = m.nest.crew.filter((c) => c !== m); m.nest = null; } if (m.mortar) { m.mortar.crew = m.mortar.crew.filter((c) => c !== m); m.mortar = null; } m.mortarU = false; if (m.state === 'camp') m.state = 'pos'; });
    boundMove(sq, B.fallPt.clone().add(_v.set(gauss() * 20, 0, -25 + gauss() * 8)), spots);
  }
}
function villageAssault(g, al, team, manT) {
  const sp = POI.vil.spots;
  g.turn = 1 - (g.turn || 0);
  al.forEach((m, i) => {
    if (m.state === 'move' || (al.length > 1 && i % 2 !== g.turn)) return;
    const s = sp.reduce((a, q) => (q.pos.distanceTo(m.pos) < a.pos.distanceTo(m.pos) ? q : a), sp[0]);
    const goal = s ? s.pos : B.fallPt, dd = goal.distanceTo(m.pos);
    const p = dd < 40 ? goal.clone().add(_v.set(gauss() * 3, 0, gauss() * 3)) : m.pos.clone().lerp(goal, 35 / dd).add(_v.set(gauss() * 4, 0, 0));
    sendTo(m, null, Math.random() * 0.6, p); if (manT) m.run = true;
  });
}
// ===== приказы: кто → куда (позиции на карте или лазерная указка) =====
const LZR = (function () {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x55ff6a, transparent: true, opacity: 0.9 })); l.frustumCulled = false; l.visible = false; scene.add(l);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6aff80 })); dot.visible = false; scene.add(dot); l.userData.dot = dot; return l;
})();
function laserPoint() {
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion), p = camera.position.clone();
  let t = 1;
  while (t < 1600) { const s = 0.5 + t * 0.012; t += s; const x = p.x + dir.x * t, y = p.y + dir.y * t, z = p.z + dir.z * t; if (y < terrainH(x, z) + elevY(x, z)) return new V3(x, terrainH(x, z) + elevY(x, z), z); }
  return null;
}
function showLaser(pt) {
  const a = LZR.geometry.attributes.position, o = camera.position.clone().add(_v.set(0, -0.12, 0)).addScaledVector(new V3(1, 0, 0).applyQuaternion(camera.quaternion), 0.1);
  a.setXYZ(0, o.x, o.y, o.z); a.setXYZ(1, pt.x, pt.y + 0.05, pt.z); a.needsUpdate = true; LZR.visible = true;
  const dot = LZR.userData.dot; dot.position.copy(pt); dot.scale.setScalar(Math.max(0.08, pt.distanceTo(camera.position) * 0.004)); dot.visible = true;
  clearTimeout(LZR.userData.t); LZR.userData.t = setTimeout(() => { LZR.visible = false; dot.visible = false; }, 2500);
  const AC = SS.getAC(); if (AC) SS.tone(AC.currentTime, 1800, 0.06, 0.06, 'square');
}
const WHO = { trio: 'Тройка', squad: 'Отделение', mg: 'Пулемётчик', sniper: 'Снайпер', rpg: 'Гранатомётчик', medic: 'Санитар' };
function orderUnits(who) {
  const me = B.side, ok = (u) => u.alive && u.team === me && !isBot(u) && !u.nest && !u.mortar && !u.carry && !u.patient && !u.chute;
  if (who === 'trio') return PL.squad ? PL.squad.members.filter(ok) : [];
  if (who === 'squad') { let b = null, bd = 1e9; for (const q of squads) { if (q.team !== me || q.player || q.static) continue; const c = groupCenter(q); if (!c) continue; const d = c.distanceTo(PL.pos); if (d < bd) { bd = d; b = q; } } if (b) { b.order = 'hold'; return b.members.filter(ok); } return []; }
  const c = units.filter((u) => ok(u) && u.cls === who).sort((a, b) => (a.squad === PL.squad ? -50 : 0) + a.pos.distanceTo(PL.pos) - ((b.squad === PL.squad ? -50 : 0) + b.pos.distanceTo(PL.pos)))[0];
  return c ? [c] : [];
}
function orderTo(where) {
  const who = B.who || 'trio', list = orderUnits(who);
  if (!list.length) { feed(WHO[who] + ': некому выполнять — рядом никого', 'bad'); return; }
  let spots, name, center;
  if (where === 'laser') {
    const pt = laserPoint(); if (!pt) { feed('Указка: наведите прицел на землю'); return; }
    if (pt.distanceTo(PL.pos) > 600) { showLaser(pt); feed('Указка: ' + Math.round(pt.distanceTo(PL.pos)) + ' м — слишком далеко, укажите ближе 600 м', 'bad'); return; }
    showLaser(pt); name = 'точка ' + Math.round(pt.distanceTo(PL.pos)) + ' м'; center = pt;
    spots = []; const near = [...covers.flatMap((cv) => (cv.c.distanceTo(pt) < 30 ? cv.pts[B.side === 'h' ? 'h' : 'r'] : [])), ...slots.front, ...slots.rear, ...forestSpots, ...Object.values(POI).flatMap((p) => p.spots)].filter((s) => s.pos.distanceTo(pt) < 14);
    spots = near.length >= list.length ? near : near.concat(list.map((u, i) => ({ pos: pt.clone().add(new V3(Math.cos(i * 2.1) * (1.5 + i), 0, Math.sin(i * 2.1) * (1.5 + i))).setY(terrainH(pt.x, pt.z)), used: null, tmp: true })));
  } else if (where === 'front' || where === 'rear') { spots = slots[where]; name = where === 'front' ? 'передняя траншея' : 'задняя траншея'; }
  else { const p = POI[where]; if (!p) return; spots = p.spots; name = p.name.toLowerCase(); }
  if (!center) center = spots.reduce((a, s) => a.add(s.pos), new V3()).divideScalar(Math.max(1, spots.length));
  list.forEach((u, i) => {
    const s = spots.filter((q) => !q.used || q.used === u).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos))[0];
    if (s) sendTo(u, s.tmp ? null : s, i * 0.5, s.tmp ? s.pos : null, true); else sendTo(u, null, i * 0.5, center.clone().add(_v.set(gauss() * 3, 0, gauss() * 3)), true);
    u.orderT = B.t + 600; u.run = u.pos.distanceTo(center) > 40; u.target = u.target && u.target.alive ? u.target : null;
  });
  if (who === 'trio' && PL.squad) PL.squad.order = 'hold';
  B.mark = { pos: center.clone().setY(terrainH(center.x, center.z) + (where === 'mill' ? 7.4 : 0)), name: WHO[who] + ' → ' + name, t: B.t + 25 };
  feed('Вы: ' + WHO[who].toLowerCase() + ' — ' + name + '! · ' + WHO[who] + ': принял, выдвигаюсь', 'me');
}
// ===== оружейка в лагере =====
function nearArmory() { return B.active && PL.alive && !PL.robot && ARMORY && !WALL() && PL.team === 'h' && Math.hypot(ARMORY.x - P.x, ARMORY.z - P.z) < 3 ? ARMORY : null; }
function useArmory() {
  RIFLES.forEach((r, i) => { if (!r.mounted && r.org !== 'BOT' && r.type !== 'mortar' && !B.loadout.includes(i)) B.loadout.push(i); });
  resupply(); feed('Оружейка: берите любое оружие (кнопка оружия), магазины пополнены', 'me');
  if (SS.toggleWeaponList) SS.toggleWeaponList();
}
// ===== продолжить бой за другого бойца =====
function takeCandidate() {
  return units.filter((u) => u.alive && u.team === B.side && u.man && !u.nest && !u.mortar && !u.chute && !u.carry && u.state !== 'camp')
    .sort((a, b) => (a.squad === PL.squad ? -80 : 0) + a.pos.distanceTo(PL.pos) - ((b.squad === PL.squad ? -80 : 0) + b.pos.distanceTo(PL.pos)))[0] || null;
}
function takeOver() {
  const c = takeCandidate(); if (!c) return;
  const i = units.indexOf(c); if (i >= 0) units.splice(i, 1);
  if (c.spot) { c.spot.used = null; c.spot = null; }
  if (c.squad) { c.squad.members = c.squad.members.filter((m) => m !== c); if (!c.squad.player && PL.squad !== c.squad) { c.squad.player = true; c.squad.order = 'follow'; } PL.squad = c.squad; }
  P.x = c.pos.x; P.z = c.pos.z; P.yaw = c.yaw; P.pitch = 0; P.stance = 0; P.eye = 1.62;
  PL.alive = true; PL.downed = false; PL.hp = Math.max(30, c.hp); PL.revives = c.revives || 0; HOOK.dead = false; HOOK.speedMul = 1; HOOK.camRoll = 0; HOOK.camDY = 0;
  B.spect = false; B.diedShown = false; B.deadT = 0; $('endScr').hidden = true;
  { const R = ROLES_H[c.cls === 'hmg' ? 'mg' : c.cls] || ROLES_H.rifle; const keep = B.loadout.slice(); B.loadout = []; R.w.forEach((id) => { const k = WIDX(id); if (k >= 0) B.loadout.push(k); }); keep.forEach((k) => { if (!B.loadout.includes(k)) B.loadout.push(k); }); if (R.kits > PL.kit) PL.kit = R.kits; SS.selectRifle(B.loadout[0]); }
  resupply(); SS.setAim('hip');
  feed('Вы продолжаете бой за бойца: ' + clsName(c.cls) + (c.squad ? ' (' + c.squad.name + ')' : ''), 'me');
}
{ const tk = $('endTake'); if (tk) tk.addEventListener('click', takeOver); }

// ===== перекаты: половина группы прикрывает огнём, половина перебегает к укрытию =====
function boundMove(g, dest, spots) {
  g.bm = { dest: dest.clone(), spots, turn: 0, legT: B.t, started: false };
  g.members.forEach((m) => { if (m.alive) { m.orderT = B.t + 30; m.coverT = 0; } });
}
function boundTick() {
  for (const g of squads) {
    const bm = g.bm; if (!bm) continue;
    const al = g.members.filter((m) => m.alive && !m.crawl && !m.chute && !m.nest && !m.mortar && !m.carry && !m.patient);
    if (!al.length) { g.bm = null; continue; }
    const c = al.reduce((a, m) => a.add(m.pos), new V3()).divideScalar(al.length);
    if (Math.hypot(c.x - bm.dest.x, c.z - bm.dest.z) < 40 || B.t - bm.legT > 240) {
      al.forEach((m, i) => { const sp = bm.spots ? bm.spots.filter((s) => !s.used).sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0] : null; sendTo(m, sp || null, i * 0.3, sp ? null : bm.dest.clone().add(_v.set(gauss() * 8, 0, gauss() * 8)), true); m.orderT = B.t + 8; m.coverT = 0; });
      g.bm = null; continue;
    }
    const half = (m, i) => (al.length < 2 ? 0 : i % 2);
    const movers = al.filter((m, i) => half(m, i) === bm.turn), cover = al.filter((m, i) => half(m, i) !== bm.turn);
    cover.forEach((m) => { m.coverT = B.t + 3; m.orderT = Math.max(m.orderT || 0, B.t + 3); });
    const busy = movers.some((m) => m.state === 'move');
    if (bm.started && busy && B.t - bm.legT < 25) continue;
    // следующий бросок: эта половина бежит, другая прикрывает
    if (bm.started) { bm.turn = al.length < 2 ? 0 : 1 - bm.turn; }
    bm.started = true; bm.legT = B.t;
    const run = al.filter((m, i) => half(m, i) === bm.turn);
    run.forEach((m, i) => {
      m.coverT = 0;
      const d = Math.hypot(bm.dest.x - m.pos.x, bm.dest.z - m.pos.z);
      let sp = d > 90 ? spotNear(m.team, m.pos, bm.dest, 35, 85, lerp(m.pos.x, bm.dest.x, 0.4) + (i - 1) * 6) : null;
      const p = sp ? null : (d > 90 ? m.pos.clone().lerp(bm.dest, 70 / d) : bm.dest.clone()).add(_v.set(gauss() * 4, 0, gauss() * 4));
      sendTo(m, sp, i * 0.35, p, true); m.run = true; m.orderT = B.t + 30;
    });
    if (isFriend(g.team) && PL.alive && c.distanceTo(PL.pos) < 160 && Math.random() < 0.35) feed(g.name + ': ' + pickR(['перебежка, прикрываю!', 'пошли — прикрываю!', 'бегу, держи их!']));
  }
}
function huntStep(g, al, c, team, foe) {
  if (g.huntT && B.t < g.huntT && al.some((m) => m.state === 'move')) return;
  g.huntT = B.t + 18;
  const en = units.filter((u) => u.team === foe && u.alive); if (PL.alive && PL.team === foe) en.push(PL);
  if (!en.length) return;
  const tg = en.reduce((a, u) => ((u.isPlayer ? PL.pos : u.pos).distanceTo(c) < (a.isPlayer ? PL.pos : a.pos).distanceTo(c) ? u : a), en[0]);
  const tp = (tg.isPlayer ? PL.pos : tg.pos), d = tp.distanceTo(c);
  const goal = d > 120 ? c.clone().lerp(tp, 90 / d) : tp.clone().add(_v.set(gauss() * 20, 0, gauss() * 20));
  g.turn = 1 - (g.turn || 0);
  al.forEach((m, i) => { if (i % 2 === g.turn || al.length < 2) { const sp = spotNear(team, m.pos, goal, 20, 90, goal.x + (i - 1) * 8); sendTo(m, sp, i * 0.4, sp ? null : goal.clone().add(_v.set((i - 1) * 7, 0, gauss() * 5))); m.run = d > 200; } else m.coverT = B.t + 6; });
}
// ===== сдача: люди без шансов сдаются (роботы — никогда) =====
function surrenderCheck(dt) {
  if (B.pts) return false;
  for (const t of ['h', 'r']) {
    if (t === B.side && PL.alive) continue;          // пока игрок в строю — сдаваться решает он
    if (t === 'r' && !B.pvp) continue;               // роботы не сдаются
    const mine = units.filter((u) => u.team === t && u.alive && !u.crawl).length, foe = units.filter((u) => u.team !== t && u.alive).length + (PL.alive ? 1 : 0);
    const n0 = (B.n0 && B.n0[t]) || 1;
    if (B.t > 120 && mine > 0 && mine <= Math.max(2, Math.round(n0 * 0.12)) && foe >= mine * 4 && B.t - ((B.dmgT && B.dmgT[t]) || -99) < 40) {
      B.surT = (B.surT || 0) + dt;
      if (B.surT > 12) { units.forEach((u) => { if (u.team === t && u.alive) { u.surrendered = true; u.target = null; } }); endBattle(B.side !== t, t === B.side ? 'Остатки взвода сдались' : 'Противник сдался', true); return true; }
    } else B.surT = Math.max(0, (B.surT || 0) - dt * 0.5);
  }
  return false;
}
HOOK.surrender = function () {
  if (!B.active || B.over) return;
  if (!B.surAsk || B.t - B.surAsk > 4) { B.surAsk = B.t; feed('Сдаться? Нажмите «СДАТЬСЯ» ещё раз в течение 4 секунд', 'bad'); return; }
  endBattle(false, 'Вы сдались', true);
};

// ===== инстинкт самосохранения и взаимовыручка =====
function threatNear(u, r) {
  let best = null, bd = r;
  for (const q of TK[u.team].values()) { if (B.t - q.t > 15) continue; const d = q.pos.distanceTo(u.pos); if (d < bd) { bd = d; best = q.pos; } }
  if (u.fear && B.t - (u.fearT || -99) < 8 && u.fear.distanceTo(u.pos) < r && (!best || u.fear.distanceTo(u.pos) < bd)) best = u.fear;
  return best;
}
function sheltered(p) {
  if (inTrench(p)) return true;
  for (const cv of covers) { if (Math.abs(cv.c.x - p.x) > 8 || Math.abs(cv.c.z - p.z) > 8) continue; const lx = (p.x - cv.c.x) * cv.u.x + (p.z - cv.c.z) * cv.u.z, lz = (p.x - cv.c.x) * cv.n.x + (p.z - cv.c.z) * cv.n.z; if (Math.abs(lx) < cv.mx[0] + 1.2 && Math.abs(lz) < cv.mx[2] + 1.8 && cv.h > 0.8) return true; }
  return inForest(p);
}
// ближайшее укрытие, по возможности — с другой стороны от угрозы
function nearCover(u, r, from) {
  const th = from || threatNear(u, 400);
  let best = null, bs = 1e9;
  const test = (s) => { if (s.used && s.used !== u) return; const d = s.pos.distanceTo(u.pos); if (d > r) return; let sc = d; gridQuery(s.pos, s.pos, 4, _sep2); for (const o of _sep2) if (o !== u && o.alive && o.team === u.team && Math.abs(o.pos.x - s.pos.x) < 4 && Math.abs(o.pos.z - s.pos.z) < 4) sc += 7; if (th) { const tdx = th.x - s.pos.x, tdz = th.z - s.pos.z; const back = ((u.pos.x - th.x) * tdx + (u.pos.z - th.z) * tdz) < 0 ? 0 : 6; sc += back - Math.min(10, Math.hypot(tdx, tdz) / 50); } if (sc < bs) { bs = sc; best = s; } };
  const side = WALL() ? (u.team === 'h' ? 'h' : 'r') : (u.team === attTeam() ? 'r' : 'h');
  for (const cv of covers) { if (Math.abs(cv.c.x - u.pos.x) > r + 6 || Math.abs(cv.c.z - u.pos.z) > r + 6) continue; for (const s of cv.pts[side]) test(s); if (th && cv.pts[side === 'h' ? 'r' : 'h']) { /* укрытие с тыла тоже годится, если угроза с той стороны */ const tz = th.z - cv.c.z; for (const s of cv.pts[side === 'h' ? 'r' : 'h']) if (Math.sign(s.pos.z - cv.c.z) !== Math.sign(tz)) test(s); } }
  for (const s of ROCKSP[side]) if (Math.abs(s.pos.x - u.pos.x) < r && Math.abs(s.pos.z - u.pos.z) < r) test(s);
  for (const s of forestSpots) if (Math.abs(s.pos.x - u.pos.x) < r && Math.abs(s.pos.z - u.pos.z) < r) test(s);
  if (!WALL()) { for (const s of slots.front) test(s); for (const s of slots.rear) test(s); }
  for (const k in POI) for (const s of POI[k].spots) if (!s.mill) test(s);
  return best;
}
// возвращает true, если боец занят спасением себя в этом кадре
function fearStep(u, dt) {
  if (u.nest || u.mortar || u.carry || u.patient || u.state === 'camp' || u.chute) return false;
  const ordered = u.orderT > B.t;
  const th = u.fear && B.t - (u.fearT || -99) < 6 ? u.fear : null;
  // 1) под плотным огнём на открытом месте — к ближайшему укрытию
  if (u.supp > 2.2 && !u.spot && !sheltered(u.pos) && B.t > (u.hideT || 0)) {
    u.hideT = B.t + rnd(5, 8);
    const sp = nearCover(u, ordered ? 15 : 35, th);
    if (sp) { sendTo(u, sp, 0, null, true); u.run = true; if (isFriend(u.team) && (u.squad === PL.squad || Math.random() < 0.12)) feed((u.squad === PL.squad ? 'Тройка: ' : '') + clsName(u.cls) + ': ' + pickR(['прижали! В укрытие!', 'меня кроют — меняю позицию!', 'плотный огонь, ухожу!'])); return true; }
    // укрытия нет — лечь и вести огонь лёжа
    u.prone = true; u.proneT = B.t + rnd(7, 12); u.state = 'pos'; u.dest = null; if (isFriend(u.team) && u.squad === PL.squad && Math.random() < 0.4) feed('Тройка: ' + clsName(u.cls) + ' — залёг!'); return false;
  }
  // 1б) противник близко (< 70 м), а ты на открытом месте или в толпе — в укрытие, рассредоточиться
  if (B.t > (u.hideT || 0) && B.t > (u.spreadT || 0) && !ordered) {
    const tg = u.target && u.target.alive ? (u.target.isPlayer ? PL.pos : u.target.pos) : th;
    const close = tg && tg.distanceTo(u.pos) < 70;
    let crowd = 0; gridQuery(u.pos, u.pos, 4, _sep2); for (const o of _sep2) if (o !== u && o.alive && o.team === u.team && Math.abs(o.pos.x - u.pos.x) < 3.5 && Math.abs(o.pos.z - u.pos.z) < 3.5) crowd++;
    if ((close && !u.spot && !sheltered(u.pos)) || (crowd >= 2 && !inTrench(u.pos))) {
      u.spreadT = B.t + rnd(6, 10);
      const sp = nearCover(u, close ? 30 : 22, tg);
      if (sp && sp !== u.spot) { sendTo(u, sp, rnd(0, 0.5), null, true); u.run = true; return true; }
      if (crowd >= 2) { const a = Math.random() * TAU; sendTo(u, null, rnd(0, 0.5), u.pos.clone().add(_v.set(Math.cos(a) * 7, 0, Math.sin(a) * 7)), true); return true; }
    }
  }
  if (u.prone && B.t > (u.proneT || 0) && u.supp < 1.2) u.prone = false;
  // 2) в укрытии под шквалом — пережидать, не высовываться
  if (u.supp > 4.2) { u.st = Math.max(u.st || 0, rnd(1.2, 2.5)); }
  // 3) тяжело ранен в бою — отойти назад в укрытие, к санитару
  if (u.hp < 40 && th && !u.retreated && B.t > (u.hideT || 0)) {
    u.hideT = B.t + 12; u.retreated = true;
    const dir = u.pos.clone().sub(th).setY(0).normalize();
    const sp = nearCover(u, 45, th) ; const back = u.pos.clone().addScaledVector(dir, 25);
    if (sp && sp.pos.distanceTo(th) > u.pos.distanceTo(th)) sendTo(u, sp, 0, null, true); else sendTo(u, null, 0, back, true);
    u.run = true; u.orderT = B.t + 20; return true;
  }
  // 4) смена позиции: долго на одном месте или по нему пристрелялись
  if (!ordered && u.state === 'pos' && u.target && u.target.alive && B.t > (u.relocT || 0)) {
    if (!u.posT) u.posT = B.t;
    const hot = B.t - (u.hitT || -99) < 4 || (u.supp > 2.6 && B.t - (u.fearT || -99) < 2);
    if (hot || B.t - u.posT > (u.cls === 'sniper' ? 25 : 45)) {
      u.relocT = B.t + rnd(14, 22);
      const tp = u.target.isPlayer ? PL.pos : u.target.pos;
      const sd = Math.random() < 0.5 ? -1 : 1, rt = new V3(-(tp.z - u.pos.z), 0, tp.x - u.pos.x).normalize();
      const goal = u.pos.clone().addScaledVector(rt, sd * rnd(10, 22));
      const sp = nearCover({ pos: goal, team: u.team }, 16, tp);
      if (sp && sp !== u.spot && sp.pos.distanceTo(u.pos) > 5) { sendTo(u, sp, rnd(0.2, 0.8)); u.run = true; u.posT = 0; return true; }
    }
  }
  if (u.state === 'pos' && !u.posT) u.posT = B.t;
  return false;
}
// раненый под огнём: один прикрывает, другой тащит в укрытие, кто-то ставит дым
function rescueTick() {
  for (const d of units) {
    if (!d.down || d.alive || d.dead || d.evac || d.carrier || B.drag === d || isBot(d) || d.sheltered) continue;
    if (B.t - d.downT < 1.5 || B.t < (d.rescueT || 0)) continue;
    const th = threatNear(d, 260); if (!th) continue;
    if (sheltered(d.pos)) { d.sheltered = true; continue; }
    const aliveT = units.filter((h) => h.alive && h.team === d.team).length, carrying = units.filter((h) => h.alive && h.team === d.team && h.carry).length;
    if (carrying >= Math.max(1, Math.floor(aliveT * 0.15))) continue;      // не больше 15% бойцов на выносе — остальные воюют
    const helpers = units.filter((h) => h.alive && h.team === d.team && !isBot(h) && !h.carry && !h.patient && !h.nest && !h.mortar && !h.chute && h.state !== 'camp' && h.pos.distanceTo(d.pos) < 40 && !(h.orderT > B.t && h.squad && h.squad.bm))
      .sort((a, b) => a.pos.distanceTo(d.pos) - b.pos.distanceTo(d.pos));
    if (helpers.length < 2) continue;                                       // один тащит — второй обязательно прикрывает
    d.rescueT = B.t + 25;
    const carrier = helpers.find((h) => h.cls !== 'mg') || helpers[0], cover = helpers.filter((h) => h !== carrier);
    const dir = th.clone().sub(d.pos).setY(0).normalize();
    // дым между раненым и противником
    const thrower = [carrier, ...cover].find((h) => h.smokes > 0) || units.find((h) => h.alive && h.team === d.team && h.smokes > 0 && h.pos.distanceTo(d.pos) < 60);
    if (thrower) throwSmoke(thrower, d.pos.clone().addScaledVector(dir, rnd(12, 18)));
    else { const rk = units.find((h) => h.alive && h.team === d.team && h.smokeRk > 0 && h.pos.distanceTo(d.pos) < 150); if (rk) { rk.smokeRk--; const at = d.pos.clone().addScaledVector(dir, 25); at.y = terrainH(at.x, at.z) + 1; const org = muzzle(rk, new V3()); const D = org.distanceTo(at), dd = at.clone().sub(org).normalize(); dd.applyAxisAngle(_v3.set(-dd.z, 0, dd.x).normalize(), HOOK.rocketElev(D)); launchRocket(org, dd, rk.team, false, rk, true); } }
    // прикрытие: двое бьют по угрозе
    cover.slice(0, 2).forEach((h) => { h.coverT = B.t + 14; h.st = 0; });
    // носильщик тащит за ближайшее укрытие (подальше от угрозы)
    const sp = nearCover(d, 35, th);
    let to = sp ? sp.pos.clone() : d.pos.clone().addScaledVector(dir, -22);
    if (sp && sp.pos.distanceTo(th) < d.pos.distanceTo(th) - 3) to = d.pos.clone().addScaledVector(dir, -22);
    carrier.carry = d; d.carrier = carrier; d.carryTo = to; d.carryT0 = B.t; if (carrier.spot) { carrier.spot.used = null; carrier.spot = null; } carrier.state = 'carry'; carrier.target = null;
    if (isFriend(d.team) && (d.squad === PL.squad || carrier.squad === PL.squad || Math.random() < 0.4)) feed(clsName(carrier.cls) + ': ' + (thrower ? 'дым! ' : '') + 'прикрой — вытаскиваю раненого (' + clsName(d.cls) + ')!', 'me');
  }
}
function reinforce(team, n, msg) {
  const man = team === 'h' || B.pvp, comp = man ? ['lead', 'rifle', 'mg', 'rifle', 'rpg', 'medic'] : ['assault', 'heavy', 'assault', 'rocket'];
  B.rfN = (B.rfN || 0) + 1;
  let base, phase = 'march', route = null, wi = 1;
  if (WALL()) { const own = B.wm[team], en = B.wm[enemyTeam(team)]; base = new V3(own[0], 0, own[1] + (team === 'h' ? 150 : -150)); route = [[en[0], en[1]]]; wi = 0; }
  else if (team === attTeam()) { if (team === 'r') { route = ROUTES[B.rfN % ROUTES.length]; base = new V3(route[0][0], 0, route[0][1]); } else { route = HROUTES[B.rfN % HROUTES.length]; base = new V3(route[0][0], 0, route[0][1] - 130); } }
  else { base = team === 'h' ? new V3(0, 0, 135) : new V3(0, 0, HILL.cz + 70); phase = 'hold'; }
  const g = { id: 'rf' + B.rfN, team, name: 'Подкрепление ' + B.rfN, members: [], phase, route, wi, turn: 0, smoked: false, order: 'hold', tactic: ['front', 'flankL', 'flankR'][B.rfN % 3] };
  for (let i = 0; i < n; i++) {
    const x = base.x + (i - n / 2) * 5, z = base.z + (i % 2) * 4;
    const u = makeUnit(team, comp[i % comp.length], new V3(x, terrainH(x, z), z), team === 'h' ? 0 : Math.PI); u.squad = g; g.members.push(u);
    if (phase === 'hold') { const s = slots.front.filter((q) => !q.used).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos))[0] || slots.rear.find((q) => !q.used); if (s) { sendTo(u, s, i * 0.3); u.run = true; u.home = s; } }
  }
  squads.push(g);
  if (isFriend(team)) cmdSay('Подкрепление прибыло: ' + n + (man ? ' бойцов' : ' роботов') + (msg ? '. ' + msg : ''));
  else feed('К противнику подошло подкрепление: ' + n + (man ? ' бойцов' : ' роботов') + (msg ? '. ' + msg : ''), 'bad');
}
function campaignTick() {
  for (const e of B.campEv) {
    if (e.done) continue;
    const ok = e.t != null ? B.t >= e.t : e.low != null ? aliveN(e.lowTeam) < e.low * (B.n0 ? B.n0[e.lowTeam] : 1) : false;
    if (!ok) continue;
    e.done = true;
    if (e.type === 'reinf') reinforce(e.team, e.n, e.msg);
    else if (e.type === 'weather') { SS.setWeather(e.to); if (isNight() && SS.VIS.mode === 'off' && PL.robot) SS.setVision('thermal'); cmdSay(e.msg || 'Погода меняется'); }
    else if (e.type === 'msg') cmdSay(e.msg);
  }
}
function brainDefend(team) {
  const foe = enemyTeam(team);
  const enemies = units.filter((u) => u.team === foe && u.alive);
  const eAlive = enemies.length + (PL.alive && PL.team === foe ? 1 : 0);
  const near = enemies.reduce((m, r) => Math.min(m, Math.hypot(r.pos.x, r.pos.z - HILL.cz)), 9999);
  const me = isFriend(team);
  if (team === 'h' && me) {
    if (B.contactT > 0 && B.t - B.contactT > 35 && !B.lullSaid) { B.lullSaid = true; cmdSay('Затишье. Перезарядиться, перевязать раненых, смотреть в оба'); }
    if (B.t - B.contactT < 5) B.lullSaid = false;
  }
  if (B.phaseD !== 'attack' && !(B.wd && B.wd[foe]) && eAlive > 0 && eAlive <= Math.max(1, Math.round(B.NA * 0.25)) && near > 120 && B.t > 60) {
    B.phaseD = 'attack';
    if (me) cmdSay('Добить оставшихся! Отделения — вперёд перебежками, кв. ' + grid(enemies[0] ? enemies[0].pos : PL.pos)); else feed('Противник контратакует!', 'bad');
  }
  const ks = [...TK[team].values()].filter((q) => B.t - q.t < 20 && Math.abs(q.pos.x) > 120 && Math.hypot(q.pos.x, q.pos.z - HILL.cz) < 650);
  for (const sq of squads) {
    if (sq.team !== team || sq.player || sq.static) continue;
    const al = sq.members.filter((m) => m.alive && !m.crawl && !m.nest && !m.mortar && !m.mortarU && m.state !== 'camp');
    if (sq.reserve && !sq.committed && ks.length >= 2) {
      const sd = Math.sign(ks.reduce((s, q) => s + q.pos.x, 0)) || 1; sq.committed = true;
      al.forEach((m, i) => { const s = slots.front.filter((q) => !q.used && Math.sign(q.pos.x) === sd && Math.abs(q.pos.x) > 70).sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0]; if (s) { sendTo(m, s, i * 0.3); m.run = true; } });
      if (me) cmdSay(sq.name + ' (резерв) — на ' + (sd < 0 ? 'левый' : 'правый') + ' фланг! Противник обходит.');
    }
    if (!al.length || sq.bm) continue;
    if ((sq.order === 'village' || sq.order === 'rally') && B.phaseD !== 'attack') continue;
    const foc = al.map((m) => m.target).filter((x) => x && x.alive);
    sq.focus = foc.length ? foc[0] : null;
    const lost = 1 - sq.members.filter((m) => m.alive).length / sq.members.length;
    const front = al.filter((m) => !inRear(m));
    const danger = enemies.filter((r) => front.some((m) => m.pos.distanceTo(r.pos) < 45)).length;
    if (sq.order === 'hold' && front.length && (danger >= 2 || (lost >= 0.5 && near < 200))) {
      sq.order = 'fallback';
      al.forEach((m, i) => { const s = slots.rear.filter((q) => !q.used).sort((a, b) => Math.abs(a.pos.x - m.pos.x) - Math.abs(b.pos.x - m.pos.x))[0]; if (s) { sendTo(m, s, (i % 2) * 2); m.run = true; } });
      if (me) feed(sq.name + ': отходим во вторую траншею, прикрывайте!');
    }
    if (sq.order === 'fallback' && al.every((m) => m.state !== 'move')) sq.order = 'hold';
    if (B.phaseD === 'attack' && sq.order !== 'attack') { sq.order = 'attack'; sq.turn = 0; }
    if (sq.order === 'attack') {
      const moving = al.some((m) => m.state === 'move');
      if (!moving && enemies.length) {
        al.forEach((m, i) => { if (i % 2 !== sq.turn) m.coverT = B.t + 4; });
        al.filter((m, i) => i % 2 === sq.turn && m.cls !== 'medic').forEach((m, i) => {
          const tgt = enemies.reduce((a, r) => (r.pos.distanceTo(m.pos) < a.pos.distanceTo(m.pos) ? r : a), enemies[0]);
          if (m.pos.distanceTo(tgt.pos) < 60) return;
          const sp = spotNear(team, m.pos, tgt.pos, 20, 80, lerp(m.pos.x, tgt.pos.x, 0.4));
          if (sp) sendTo(m, sp, i * 0.4); else sendTo(m, null, i * 0.4, m.pos.clone().lerp(tgt.pos, 0.3));
        });
        sq.turn = 1 - sq.turn;
      }
    }
    al.forEach((m, i) => { m.sentry = i === 0; });
  }
}
function support() {
  // осветительные ракеты над известными противниками (люди, обе стороны сценария)
  B.flareT -= 1.5;
  if (isNight() && !FL.on && B.flareT <= 0 && units.some((u) => u.team === 'h' && u.alive && !u.chute)) {
    const ks = [...TK.h.values()].filter((q) => B.t - q.t < 30);
    if (ks.length || B.alarm) { const at = ks.length ? pickR(ks).pos : new V3(gauss() * 200, 0, HILL.cz - rnd(450, 900)); launchFlare(at); }
    B.flareT = rnd(26, 38);
  }
  // если игрок за роботов или люди штурмуют — приданная батарея людей
  if (S.mortars !== false && (isFriend('r') || B.scen === 'att')) {
    B.hArtT = (B.hArtT || 50) - 1.5;
    if (B.hArtT <= 0) { const ks = [...TK.h.values()].filter((q) => B.t - q.t < 20 && !friendNear('h', q.pos, 60)); if (ks.length) { const tp = pickR(ks).pos; callArtillery(tp, 4, 18, 'h', 6, 2.0); if (isFriend('h')) cmdSay('Батарея: огонь по высоте, кв. ' + grid(tp) + '!'); else cmdSay('Люди вызвали артиллерию — в укрытие!'); } B.hArtT = rnd(45, 65); }
  }
}

/* ================= тройка игрока: команды ================= */
HOOK.squadMenu = function () { const p = $('sqPanel'); p.hidden = !p.hidden; };
document.querySelectorAll('#sqPanel button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation();
  if (b.dataset.w) { B.who = b.dataset.w; document.querySelectorAll('#sqPanel [data-w]').forEach((x) => x.classList.toggle('on', x === b)); return; }
  squadCmd(b.dataset.c); $('sqPanel').hidden = true; }));
{ const bs = $('bSurr'); if (bs) bs.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); HOOK.surrender(); }); }
HOOK.point = () => { if (B.active && PL.alive) orderTo('laser'); };
{ const bp = $('bPoint'); if (bp) bp.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (B.active && PL.alive) orderTo('laser'); }); }
function platoonCmd(c) {
  const me = B.side, att = me === attTeam();
  if (c === 'p_back' && B.fallback && B.fallTeam === me) { retreatTo(me, '', true); feed('Взвод уже отошёл в деревню — держим её', 'me'); return; }
  if (c === 'p_flankL' || c === 'p_flankR') {
    const s = c === 'p_flankL' ? 'flankL' : 'flankR', att = WALL() || me === attTeam();
    const list = squads.filter((q) => q.team === me && !q.player && !q.static && q.members.some((m) => m.alive));
    const txt2 = 'Взвод: ' + (att ? 'обход ' : 'усилить ') + (s === 'flankL' ? 'левого' : 'правого') + ' фланга!';
    feed('Вы: ' + txt2, 'me');
    if (att) list.slice(0, Math.max(1, Math.ceil(list.length / 2))).forEach((q) => { q.tactic = s; if (q.phase !== 'assault') q.phase = 'bound'; });
    else { const q = list.find((x) => x.reserve && !x.committed) || list[list.length - 1]; if (q) { q.committed = true; const sd = s === 'flankL' ? -1 : 1; q.members.filter((m) => m.alive).forEach((m, i) => { const sl = slots.front.filter((z) => !z.used && Math.sign(z.pos.x) === sd && Math.abs(z.pos.x) > 70).sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0]; if (sl) { sendTo(m, sl, i * 0.3); m.run = true; } }); } }
    return;
  }
  const txt = { p_adv: att ? 'Взвод, слушай мою команду! Все — на штурм, вперёд!' : 'Взвод, контратака! Отделения — вперёд перебежками!', p_hold: 'Взвод, держать рубеж! Без команды не отходить!', p_back: att ? 'Взвод, отходим на перегруппировку!' : 'Взвод, отход во вторую траншею!' }[c];
  feed('Вы: ' + txt, 'me'); vSay(txt, null, { force: true, rate: 1.2, pitch: 0.8 });
  for (const sq of squads) {
    if (sq.team !== me || sq.player || sq.static) continue;
    const al = sq.members.filter((m) => m.alive && !m.nest && !m.mortar && m.state !== 'camp');
    al.forEach((m) => { m.orderT = 0; });
    if (sq.order === 'village' && c !== 'p_back') sq.order = 'hold';
    if (att) {
      if (c === 'p_adv') sq.phase = 'assault';
      else if (c === 'p_hold') { sq.phase = 'hold'; sq.holdT = B.t + 45; al.forEach((m) => { if (m.state === 'move') { m.state = 'pos'; m.dest = null; } }); }
      else { sq.phase = 'regroup'; sq.regroupT = B.t + 35; const cc = groupCenter(sq); if (cc) { const back = new V3(cc.x, 0, cc.z - 160); al.forEach((m, i) => { const sp = spotNear(me, m.pos, back, 40, 220, m.pos.x); if (sp) sendTo(m, sp, i * 0.3); else sendTo(m, null, i * 0.3, m.pos.clone().add(_v.set(0, 0, -120))); m.run = true; }); } }
    } else {
      if (c === 'p_adv') { sq.order = 'attack'; sq.turn = 0; }
      else if (c === 'p_hold') { sq.order = 'hold'; al.forEach((m) => { if (m.state === 'move' && !m.home) { m.state = 'pos'; m.dest = null; } }); }
      else { sq.order = 'fallback'; al.forEach((m, i) => { const s = slots.rear.filter((q) => !q.used).sort((a, b) => Math.abs(a.pos.x - m.pos.x) - Math.abs(b.pos.x - m.pos.x))[0]; if (s) { sendTo(m, s, (i % 2) * 1.5); m.run = true; } }); }
    }
  }
  if (!att) B.phaseD = c === 'p_adv' ? 'attack' : 'hold';
}
function squadCmd(c) {
  if (c === 'p_vil') { if (B.active && PL.alive) { if (WALL()) feed('Отход в деревню — только в обороне высоты'); else retreatTo(B.side, 'Приказ капитана', true); } return; }
  if (c && c.startsWith('go_')) { if (B.active && PL.alive) orderTo(c.slice(3)); return; }
  if (c && c.startsWith('p_')) { if (B.active && PL.alive) platoonCmd(c); return; }
  const sq = PL.squad; if (!sq || !B.active) return;
  const al = sq.members.filter((m) => m.alive);
  al.forEach((m) => { m.orderT = 0; });
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
    al.forEach((m, i) => { const s = B.scen === 'def' ? slots.rear.filter((q) => !q.used).sort((a, b) => a.pos.distanceTo(m.pos) - b.pos.distanceTo(m.pos))[0] : null; if (s) sendTo(m, s, i * 0.6); else sendTo(m, null, i * 0.6, m.pos.clone().add(_v.set(0, 0, B.scen === 'def' ? 60 : -60))); });
    feed('Тройка: отходим!', 'me'); sq.order = 'hold';
  }
}
HOOK.medkit = function () {
  if (!B.active || !PL.alive || PL.robot) return;
  const medic = S.role === 'medic';
  if (PL.kit > 0 && !PL.downed) {
    const dn = units.filter((u) => u.team === PL.team && !u.alive && u.down && !u.stab && !u.dead && !u.evac && u.pos.distanceTo(PL.pos) < 3.2)[0];
    if (dn && canRevive(dn)) { PL.kit--; reviveUnit(dn, medic ? 25 : 10, PL); B.healed++; updateMedBtn(); return; }
    if (dn && medic) { PL.kit--; dn.stab = true; B.healed++; feed('Вы остановили кровотечение (' + clsName(dn.cls) + '). Тащите его в медпункт — метка +', 'me'); updateMedBtn(); return; }
    const w = units.filter((u) => u.team === PL.team && u.alive && u.hp < 90 && u.pos.distanceTo(PL.pos) < 3.2).sort((a, b) => a.hp - b.hp)[0];
    if (w) { const a = medic ? 25 : 10; PL.kit--; w.hp = Math.min(100, w.hp + a); B.healed++; feed('Вы перевязали бойца (' + clsName(w.cls) + '): +' + a, 'me'); updateMedBtn(); return; }
  }
  if (PL.kit > 0 && PL.hp < 100) { PL.kit--; PL.hp = Math.min(100, PL.hp + 25); feed('Вы перевязались: +25', 'me'); }
  else if (PL.hp < 100) { PL.calledMedic = false; PL.hp = Math.min(PL.hp, 69); feed('Санитара! — зовёте помощь'); }
  else if (medic) feed('Рядом нет раненых — подойдите вплотную (3 м)');
  updateMedBtn();
};
function updateMedBtn() { $('medTxt').textContent = 'АПТЕЧКА ' + PL.kit; }
// станковый пулемёт: сесть / слезть
function nearNest() { if (!B.active || !PL.alive) return null; for (const n of nests) if (Math.hypot(n.pos.x - P.x, n.pos.z - P.z) < 3.2 && !n.crew.some((c) => c.alive && c.team !== PL.team)) return n; return null; }
function mount(n) {
  B.mounted = n; B.prevW = S.rifle;
  if (!n.wp) n.wp = W_('kord');
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
HOOK.use = function () { if (!B.active || !PL.alive) return; if (nearArmory() && !B.drag && !B.mounted && !B.mortarMode) { useArmory(); return; } if (B.drag) { B.drag = null; HOOK.speedMul = 1; feed('Вы оставили раненого'); return; } if (B.mounted) { dismount(); return; } if (B.mortarMode) { dismountMortar(); return; } const n = nearNest(); if (n) { mount(n); return; } const m = nearMortar(); if (m) { mountMortar(m); return; } const dw = nearDowned(); if (dw) { B.drag = dw; HOOK.speedMul = 0.42; feed('Тащите раненого (' + clsName(dw.cls) + ') в медпункт — белая метка с крестом. Отпустить: «БРОСИТЬ»', 'me'); return; } const dp = nearDrop(); if (dp) { pickDrop(dp); return; } if (nearCrate()) resupply(); };
HOOK.move = function () {
  if (!B.active) return;
  if (B.mounted) { const n = B.mounted; const back = _v.set(Math.sin(n.yaw), 0, Math.cos(n.yaw)); P.x = n.pos.x + back.x * 0.9; P.z = n.pos.z + back.z * 0.9; P.yaw = n.yaw + clamp(angDiff(P.yaw, n.yaw), -1.2, 1.2); }
  if (B.mortarMode) { const m = B.mortarMode; P.x = m.pos.x; P.z = m.pos.z + 1.2; }
  if (!B.mounted && !B.mortarMode) solidPush();
};
HOOK.fired = function (silent) { PL.firedT = silent ? B.t - 2.1 : B.t; if (!silent && isNight() && B.active) flashLight(camera.position, 1.3); };
// помощник: если прицел почти на известном враге — сам добавляет возвышение на падение пули
HOOK.autoElev = function (dir, rf) {
  if (!B.active || !(S.assist || PL.robot) || rf.type === 'rocket' || rf.type === 'mortar') return 0;
  let best = null, ba = 0.035;
  for (const [e, k] of TK[PL.team]) {
    if (!e.alive || e.isPlayer || B.t - k.t > 6) continue;
    const tp = aimPointOf(e, 'torso', _v2);
    const d = _v3.copy(tp).sub(camera.position); const D = d.length(); if (D < 30 || D > 1500) continue;
    d.divideScalar(D);
    const a = Math.acos(clamp(d.dot(dir), -1, 1));
    if (a < ba) { ba = a; best = { D, ty: d.y }; }
  }
  if (!best) return 0;
  const need = SS.stdElev(rf, best.D) - SS.elevRad();
  const above = Math.asin(clamp(dir.y, -1, 1)) - Math.asin(clamp(best.ty, -1, 1));
  return clamp(need - above, -0.03, 0.06);
};

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
    const c = u.crouch, run = Math.min(1, u.mv), sprint = u.run && run > 0.6 ? 1 : 0, limp = u.hp < 50 ? 1 : 0;
    u.flinch = (u.flinch || 0) * Math.exp(-dt * 7);
    u.ph += dt * (2.6 + run * 7);
    const sw = Math.sin(u.ph) * run;
    T.hipsY = lerp(0.95, 0.42, c) - run * 0.06 + Math.abs(Math.sin(u.ph)) * 0.05 * run;
    T.thL = 1.25 * c + sw * 0.8 + run * 0.15; T.thR = 1.25 * c - sw * 0.8 + run * 0.15;
    T.snL = -2.1 * c - Math.max(0, Math.sin(u.ph + 1.6)) * 1.3 * run - run * 0.2;
    T.snR = -2.1 * c - Math.max(0, Math.sin(u.ph + 1.6 + Math.PI)) * 1.3 * run - run * 0.2;
    u.kick *= Math.exp(-dt * 12);
    T.torX = -0.5 * c - 0.3 * run + (1 - run) * u.pitch * 0.5 + u.kick * 0.08;
    T.torY = Math.sin(u.ph) * 0.12 * run + u.head * 0.25; T.headX = u.pitch * 0.3 * (1 - run) + run * 0.25; T.headY = u.head * 0.75;
    T.torX -= sprint * 0.28; T.torX += u.flinch * 0.42; T.torY += u.flinch * 0.38 * (u.flinchS || 1); T.headX += u.flinch * 0.3;
    if (limp && run > 0.1) { T.thR *= 0.5; T.snR *= 0.55; T.hipsY -= Math.max(0, Math.sin(u.ph)) * 0.06; T.torY += Math.sin(u.ph) * 0.08; }
    if (u.cls === 'rpg') { T.shRx = 2.4; T.shRz = 0.2; T.faR = 1.2; T.shLx = 1.3; T.shLz = -0.3; T.faL = 0.4; T.gunX = u.pitch * 0.4; }
    else if (run > 0.3) { T.shRx = 0.9; T.shRz = 0; T.faR = 1.1; T.shLx = 1.1; T.shLz = -0.4; T.faL = 0.9; T.gunX = 0.7; }
    else { T.shRx = 1.3 + u.pitch * 0.5; T.shRz = 0; T.faR = 0.35; T.shLx = 1.45 + u.pitch * 0.5; T.shLz = -0.35; T.faL = 0.2; T.gunX = u.pitch * 0.5 - c * 0.6 + u.kick * 0.05; }
    T.shRx += u.kick * 0.18;
    if (u.reloadT > 0) { const rp = Math.sin(B.t * 3.4 + u.id); T.shLx = 0.5 + rp * 0.35; T.shLz = -0.15; T.faL = 1.55 + rp * 0.3; T.gunX -= 0.55; T.headX += 0.35; T.torY += 0.15; }
    else if (u.hp < 45 && run < 0.2 && !u.target) { T.shLx = 0.45; T.shLz = 0.35; T.faL = 1.9; T.torX -= 0.15; }
    if (u.healing) { T.hipsY = 0.5; T.thL = 1.5; T.snL = -1.6; T.thR = 0.2; T.snR = -1.7; T.torX = -0.7; T.shLx = 1.1; T.shRx = 1.0; T.faL = 0.6 + Math.sin(B.t * 6) * 0.3; T.faR = 0.8; T.gunX = -0.9; }
    if (u.chute) { T.hipsY = 0.95; T.thL = 0.15; T.thR = 0.05; T.snL = -0.35; T.snR = -0.2; T.torX = 0; T.shLx = 2.9; T.shLz = -0.35; T.shRx = 2.9; T.shRz = 0.35; T.faL = 0.4; T.faR = 0.4; T.gunX = -1.3; T.headX = 0.3; }
    if (u.mortar) { T.shLx = 0.9 + u.kick * 0.8; T.shRx = 0.9 + u.kick * 0.8; T.faL = 0.8; T.faR = 0.8; T.gunX = -0.9; }
    if (u.proneK > 0.05) { const k = u.proneK; T.hipsY = lerp(T.hipsY, 0.95, k); T.thL *= 1 - k; T.thR = lerp(T.thR, 0.12, k); T.snL = lerp(T.snL, -0.15, k); T.snR = lerp(T.snR, -0.5, k); T.torX *= 1 - k; T.torY *= 1 - k; T.headX = lerp(T.headX, 1.3, k); }
    u.hold = u.chute || u.mortar || u.healing ? null : u.carry ? 'low' : u.reloadT > 0 ? 'reload' : run > 0.3 ? 'low' : 'aim';
    if (u.hold === 'aim') { const bl = u.cls === 'rpg' ? 0.3 : 0.5; T.torY -= bl; T.headY += bl * 0.9; }   // корпус развёрнут, голова — на цель
    else if (u.hold === 'low') { T.torY -= 0.2; T.headY += 0.2; }
    blendPV(u, PV_H, dt * 11);
  }
  const v = u.pv;
  r.hips.position.y = v.hipsY;
  r.thL.rotation.set(v.thL, 0, 0); r.thR.rotation.set(v.thR, 0, 0);
  r.snL.rotation.set(v.snL, 0, 0); r.snR.rotation.set(v.snR, 0, 0);
  r.torso.rotation.set(v.torX, v.torY, 0); r.head.rotation.set(v.headX, v.headY, 0);
  r.shL.rotation.set(v.shLx, 0, v.shLz); r.shR.rotation.set(v.shRx, 0, v.shRz);
  r.faL.rotation.set(v.faL, 0, 0); r.faR.rotation.set(v.faR, 0, 0);
  if (u.fall) updateFall(u, dt);
  u.proneK = lerp(u.proneK || 0, u.prone && u.alive && !u.down ? 1 : 0, Math.min(1, dt * 3.5));
  r.root.rotation.set(0, u.yaw, 0); r.root.position.copy(u.pos);
  if (u.fall) r.tilt.quaternion.setFromAxisAngle(u.fall.ax, u.fall.th); else if (u.proneK > 0.02) { r.tilt.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -1.45 * u.proneK); r.root.position.y += 0.14 * u.proneK; } else r.tilt.quaternion.identity();
  if (!u.down && !u.fall && u.hold) { if (!u.gq || AIM.mode !== 'hip' || Math.abs(u.pos.x - camera.position.x) + Math.abs(u.pos.z - camera.position.z) < 200 || ((u.id + B.rf) & 3) === 0) holdGun(u, false, u.hold, dt * (u.gq && Math.abs(u.pos.x - camera.position.x) + Math.abs(u.pos.z - camera.position.z) >= 200 ? 4 : 1)); }
  else { const p0 = r.gun.userData.p0; u.gq = null; r.gun.position.copy(p0); r.gun.rotation.set(v.gunX, 0, 0); }
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
  if (u.alive && !u.crawl) T.torY -= 0.35;
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
  if (u.alive && !u.crawl && !u.fall && !u.gone.has('farmR') && !u.gone.has('uarmR')) holdGun(u, true, u.reloadT > 0 ? 'reload' : 'aim', dt);
  else { r.gun.position.set(0.3, 0.3, -0.3); r.gun.rotation.set(-0.9, 0.3, 0); }
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
  B.rf = (B.rf || 0) + 1;
  const cx = camera.position.x, cz = camera.position.z, zoomed = AIM.mode !== 'hip';
  // детальная модель — только у 16 ближайших (в толпе остальные — упрощённые)
  const tf = Math.tan(camera.fov * Math.PI / 360); let lodD = 52;
  { const ds = _lodD; ds.length = 0; for (const u of units) { const d = (Math.abs(u.pos.x - cx) + Math.abs(u.pos.z - cz)) * tf; if (d < 52) ds.push(d); } if (ds.length > 16) { ds.sort((a, b) => a - b); lodD = ds[15]; } }
  for (const u of units) {
    const far = !zoomed && !u.chute && Math.abs(u.pos.x - cx) + Math.abs(u.pos.z - cz) > 260;
    if (!far || ((u.id + B.rf) & 1) || !u.pv) {
      if (!isBot(u)) poseHuman(u, far ? dt * 2 : dt); else poseRobot(u, far ? dt * 2 : dt);
      u.right.set(Math.cos(u.yaw), 0, -Math.sin(u.yaw));
      u.rig.root.updateMatrixWorld(true);
    }
    if (isBot(u)) updateLaser(u);
    u.rig.hips.getWorldPosition(u.bc);
    const lodK = (Math.abs(u.pos.x - cx) + Math.abs(u.pos.z - cz)) * tf > lodD;
    for (const p of u.rig.parts) {
      if (u.gone.has(p.zone)) continue;
      if (lodK && p.key === 'r_joint') continue;
      const pt = PT[lodK && p.lod ? p.lod : p.key]; if (pt.n >= pt.max) continue;
      pt.mesh.setMatrixAt(pt.n, p.o.matrixWorld);
      if (u.man && u.team === 'r') _c.copy(OPFOR); else _c.copy(WHITE);
      if (isBot(u)) {
        const Z = u.Z[p.zone];
        if (p.key === 'r_eye') { if (!u.alive || (Z && Z.hp < Z.max * 0.5 && flick)) _c.copy(VOFF); }
        else { if (Z) _c.lerp(SCORCH, (1 - Z.int) * 0.7); if (!u.alive) _c.lerp(SCORCH, 0.45); }
      } else if (u.down) _c.lerp(DEADC, 0.25);
      pt.mesh.setColorAt(pt.n, _c);
      pt.n++;
    }
  }
  // далёкие бойцы: если фигура меньше ~5 пикселей, рисуем тёмную точку-силуэт
  { const H2 = innerHeight / 2 / Math.tan(camera.fov * Math.PI / 360);
    for (const u of units) {
      if (!u.alive && !u.down) continue;
      const d = Math.hypot(u.pos.x - cx, u.pos.z - cz); if (d < 250) continue;
      const px = 1.8 / d * H2; if (px > 6) continue;
      const bot = isBot(u), ht = bot ? (u.crawl ? 0.5 : 1.25) : u.down ? 0.25 : u.crouch > 0.5 ? 0.65 : 1.0;
      SS.emit(SS.PSY.dot, u.pos.x, u.pos.y + ht, u.pos.z, 0, 0, 0, bot ? 1.1 : 0.9, bot ? 1.1 : 0.9, 0.09, bot ? 0x4a4f56 : u.man && u.team === 'r' ? 0x3a3c40 : 0x30361f, 0.95, 0, 0, 1.6);
    } }
  for (const k in PT) { const p = PT[k]; p.mesh.count = p.n; p.mesh.instanceMatrix.needsUpdate = true; p.mesh.instanceColor.needsUpdate = true; }
}
HOOK.onVision = function (m) {
  const hot = m === 'thermal';
  unitMat.emissive.setRGB(hot ? 0.55 : 0, hot ? 0.55 : 0, hot ? 0.55 : 0);
  laserMat.opacity = m === 'nvg' ? 1 : 0.8;
};

/* ================= ход боя ================= */
function clearBattle() {
  units.forEach((u) => { if (u.laser) { scene.remove(u.laser.l); scene.remove(u.laser.dot); } if (u.chute) scene.remove(u.chute.mesh); });
  units.length = 0; squads.length = 0; smokers.length = 0; B.shells.length = 0;
  TK.h.clear(); TK.r.clear();
  rockets.forEach((r) => scene.remove(r.mesh)); rockets.length = 0;
  craters.forEach((c) => scene.remove(c)); craters.length = 0;
  debris.forEach((d) => scene.remove(d.g)); debris.length = 0;
  grenades.forEach((g) => scene.remove(g.mesh)); grenades.length = 0; fires.length = 0; fxL = 0;
  ptsMeshes.forEach((m) => scene.remove(m)); ptsMeshes.length = 0; B.pts = null; B.drag = null; { const pe = $('pts'); if (pe) pe.hidden = true; }
  for (let i = crates.length - 1; i >= 0; i--) if (crates[i].dyn) { scene.remove(crates[i].mesh); crates.splice(i, 1); }
  drops.forEach((d) => scene.remove(d.mesh)); drops.length = 0;
  smokes.length = 0;
  if (B.pchute) { scene.remove(B.pchute); B.pchute = null; }
  HOOK.chute = false;
  for (const k in PT) PT[k].mesh.count = 0;
  slots.front.concat(slots.rear).forEach((s) => { s.used = null; }); Object.values(POI).forEach((q) => q.spots.forEach((s) => { s.used = null; }));
  covers.forEach((cv) => cv.pts.h.concat(cv.pts.r).forEach((p) => { p.used = null; }));
  forestSpots.forEach((p) => { p.used = null; }); ROCKSP.h.concat(ROCKSP.r).forEach((p) => { p.used = null; });
  nests.forEach((n) => { n.crew = []; n.piv.visible = true; });
  for (let i = mortars.length - 1; i >= 0; i--) { const m = mortars[i]; if (m.dyn) { scene.remove(m.mesh); mortars.splice(i, 1); continue; } Object.assign(m, { crew: [], cool: rnd(8, 14), spread: 45, shots: 0, tgt: null, team: 'h', player: false, range: 0 }); }
  FL.on = false;
}
const SQN = ['1-е отделение', '2-е отделение', '3-е отделение', '4-е отделение', '5-е отделение', '6-е отделение', '7-е отделение'];
const RSQN = ['Штурмовая группа «Альфа»', 'Группа «Бета»', 'Группа «Гамма»', 'Группа «Дельта»', 'Группа «Эпсилон»', 'Группа «Дзета»'];
function addMortar(x, z, team) {
  const gy = terrainH(x, z);
  const mm = new THREE.Mesh(mortarGeo, lamV); mm.position.set(x, gy, z); mm.rotation.y = Math.PI; mm.castShadow = SHD; scene.add(mm);
  const m = { pos: new V3(x, gy, z), mesh: mm, crew: [], cool: rnd(20, 30), tgt: null, spread: 40, shots: 0, team, dyn: true };
  mortars.push(m); return m;
}
function startBattle() {
  if (!BATTLE_MAP) { S.gmode = 'battle'; S.autostart = true; try { localStorage.setItem('stepSniper', JSON.stringify(S)); } catch (e) { /* ignore */ } location.reload(); return; }
  clearBattle();
  B.side = S.side === 'r' ? 'r' : 'h';
  B.pvp = S.foe === 'man' || !SS.ROBOTS_ON;
  B.scen = S.scen === 'att' ? 'att' : S.scen === 'wall' ? 'wall' : S.scen === 'points' ? 'points' : 'def';
  B.wm = B.scen === 'points' ? WMAPS.points : (WMAPS[S.map] || WMAPS.field);
  B.camp = window.CAMPAIGN ? window.CAMPAIGN.current() : null; B.campEv = B.camp ? B.camp.events.map((e) => Object.assign({ done: false }, e)) : [];
  const nHt = clamp(Math.round(+S.nH || 18), 1, 100), nRt = clamp(Math.round(+S.nR || 6), 1, 100);
  const AT = attTeam(), DT = defTeam();
  Object.assign(B, { N: nRt, NA: AT === 'h' ? nHt : nRt, ND: DT === 'h' ? nHt : nRt, active: true, over: false, t: 0, rumbleT: 6, kills: 0, lost: 0, robotsKilled: 0, humansDown: 0, hitsE: 0, wave: 1, contactT: -99, rContactT: -99, lullSaid: false,
    startShots: STATS.shots, deadT: 0, dmgA: 0, dirs: [], brainT: 0, phaseD: 'hold', flareT: rnd(10, 20), hArtT: rnd(50, 70), mounted: null, mortarMode: null, spect: false, load: new Map(), loadR: new Map(),
    capOK: false, taskMsg: '', kc: {}, kw: {}, healed: 0, trioKills: 0, announced: new Set(), obj2: null, pslot: null, sitT: rnd(40, 60), horizT: 3, cricketT: 1, fireT: 0, smokeSaid: 0, assaultSaid: false, alarm: B.scen !== 'def', reachedTrench: false, lastMortar: null, mmT: 0, objDone: false, diedShown: false, rf: 0, prepT: 0 });
  HOOK.battle = true; HOOK.over = false; HOOK.dead = false; HOOK.camRoll = 0; HOOK.camDY = 0; HOOK.speedMul = 1; HOOK.dispMul = 1; HOOK.chute = false;
  HOOK.playerTeam = B.side;
  fieldGroup.visible = true; SS.setRangeVisible(false);
  const R = roleOf();
  PL.team = B.side; PL.robot = B.side === 'r' && !B.pvp; PL.alive = true; PL.hp = 100; PL.lastHit = -99; PL.kit = PL.robot ? 0 : (R.kits || 1); PL.gren = R.gren || 0; PL.calledMedic = false; PL.healer = null; PL.firedT = -99; PL.squad = null; PL.downed = false;
  B.artLeft = R.art || 3;
  P.robot = PL.robot;
  if (PL.robot) { PL.Z = {}; for (const z in PZ_DEF) PL.Z[z] = { armor: PZ_DEF[z][0], hp: PZ_DEF[z][1], max: PZ_DEF[z][1], int: 1 }; }
  let nH = nHt - (B.side === 'h' ? 1 : 0), nR = nRt - (B.side === 'r' ? 1 : 0);
  const fs = slots.front.slice().sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x));
  const nearFree = (list, p) => list.filter((q) => !q.used).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
  let pstart = null, ppos = null;
  if (B.scen === 'def') {
    // ===== люди обороняют: отдыхают в лагере, на постах — часовые, расчёты «Корда» и миномётов
    let ci = 0;
    const campPos = () => { const i = ci++; const a = i * 2.39996, r = 3.2 + Math.sqrt(i) * 2.3; const x = CAMPFIRE.x + Math.cos(a) * r * 1.4, z = CAMPFIRE.z + Math.sin(a) * r; return new V3(x, terrainH(x, z), z); };
    const placeH = (cls, s, camp) => {
      const p = camp ? campPos() : s.pos;
      const u = makeUnit('h', cls, p, camp ? faceYaw(CAMPFIRE.x - p.x, CAMPFIRE.z - p.z) : s.yaw);
      s.used = u; u.home = s;
      if (camp) u.state = 'camp'; else { u.spot = s; u.slot = s; }
      return u;
    };
    if (B.side === 'h') {
      let myM = null;
      if (S.role === 'mortar') { myM = mortars.find((m) => m.fixed); B.pslot = { pos: myM.pos.clone().add(_v.set(0, 0, 1.2)), text: 'Бегом к своему миномёту' }; myM.reserved = true; }
      const ps = S.role === 'sniper' ? slots.rear.slice().sort((a, b) => Math.abs(a.pos.x - 30) - Math.abs(b.pos.x - 30))[0] : fs[0];
      ps.used = PL;
      if (!B.pslot) B.pslot = { pos: ps.pos.clone(), text: S.role === 'sniper' ? 'Занять снайперскую позицию во второй траншее' : 'Занять позицию в первой траншее' };
      ppos = new V3(CAMPFIRE.x + 2.5, 0, CAMPFIRE.z + 3);
      if (nH >= 3) {
        const trio = { id: 'trio', team: 'h', name: 'Тройка', members: [], order: 'hold', player: true, orderT: 0 };
        ['rifle', 'mg', 'medic'].forEach((c) => { const s = nearFree(fs, ps.pos); const u = placeH(c, s, true); u.squad = trio; trio.members.push(u); nH--; });
        squads.push(trio); PL.squad = trio;
      }
    }
    const hq = { id: 'hq', team: 'h', name: 'Расчёты', members: [], static: true };
    const crewN = Math.min(2, Math.floor(nH / 6));
    for (let i = 0; i < crewN && nH >= 2; i++) { const n = nests[i]; n.wp = W_('kord'); for (let k = 0; k < 2; k++) { const u = makeUnit('h', 'hmg', n.pos, n.yaw); u.nest = n; n.crew.push(u); hq.members.push(u); nH--; } }
    const pits = mortars.filter((m) => m.fixed && !m.reserved);
    const morN = S.mortars === false ? 0 : Math.min(pits.length, Math.floor(nH / 7));
    for (let i = 0; i < morN && nH >= 1; i++) { const m = pits[i]; for (let k = 0; k < (nH >= 12 ? 2 : 1); k++) { const p = m.pos.clone().add(_v.set(k ? 1.1 : -1.1, 0, 0.6)); p.y = terrainH(p.x, p.z); const u = makeUnit('h', 'mortar', p, Math.PI); u.mortar = m; m.crew.push(u); hq.members.push(u); nH--; } }
    const snN = nH >= 14 ? 2 : nH >= 7 ? 1 : 0;
    for (let i = 0; i < snN && nH > 0; i++) { const s = i === 0 && POI.mill && !POI.mill.spots[0].used ? POI.mill.spots[0] : slots.rear.filter((q) => !q.used).sort((a, b) => Math.abs(a.pos.x - (i ? 45 : -45)) - Math.abs(b.pos.x - (i ? 45 : -45)))[0]; if (s) { const u = placeH('sniper', s, false); hq.members.push(u); nH--; } }
    if (hq.members.length) squads.push(hq);
    const roles = ['lead', 'mg', 'rpg', 'medic', 'rifle', 'rifle'];
    let k = 0;
    while (nH > 0) {
      const sq = { id: 'h' + k, team: 'h', name: SQN[k] || (k + 1) + '-е отделение', members: [], order: 'hold', turn: 0 };
      for (let i = 0; i < 6 && nH > 0; i++) { const s = fs.find((q) => !q.used) || slots.rear.find((q) => !q.used); if (!s) { nH = 0; break; } const u = placeH(roles[i], s, i > 0); u.squad = sq; sq.members.push(u); nH--; }
      if (sq.members.length) squads.push(sq);
      k++;
    }
    // ===== роботы наступают с дальних холмов
    const comps = [['assault', 'heavy', 'assault', 'rocket', 'assault'], ['assault', 'scout', 'assault', 'heavy'], ['assault', 'heavy', 'rocket', 'assault'], ['assault', 'assault', 'scout', 'heavy', 'rocket']];
    if (B.pvp) comps.splice(0, comps.length, ['lead', 'rifle', 'rifle', 'mg', 'medic', 'rifle'], ['rifle', 'rpg', 'rifle', 'sniper', 'rifle', 'mg'], ['rifle', 'mg', 'rifle', 'rifle', 'medic', 'rpg'], ['lead', 'rifle', 'sniper', 'rifle', 'mg', 'rifle']);
    const rmN = S.mortars !== false && !B.pvp && nR >= 8 ? Math.min(4, Math.floor(nR / 8)) : 0;
    const rmg = { id: 'rm', team: 'r', name: 'Миномётная батарея роботов', members: [], static: true };
    [[-180, -1480], [200, -1520], [-20, -1600], [420, -1450]].slice(0, rmN).forEach(([x, z]) => { const m = addMortar(x, z, 'r'); const u = makeUnit('r', 'mortar', m.pos.clone().add(_v.set(1, 0, 0.8)), 0); u.mortarU = m; m.crew.push(u); u.squad = rmg; rmg.members.push(u); nR--; });
    if (rmg.members.length) squads.push(rmg);
    const tot = nR + (B.side === 'r' ? 1 : 0);
    const gN = Math.max(1, Math.round(tot / (B.pvp ? 6 : 4)));
    let made = 0;
    for (let gi = 0; gi < gN; gi++) {
      const n = gi === gN - 1 ? nR - made : Math.min(nR - made, Math.round(tot / gN));
      if (n <= 0) continue;
      const route = ROUTES[gi % ROUTES.length], sp = B.pvp ? 1 : 0;
      const wave = gi < Math.ceil(gN * 0.6) ? 1 : 2;
      const g = { id: 'r' + gi, team: 'r', name: RSQN[gi] || 'Группа ' + (gi + 1), members: [], phase: wave === 1 ? 'march' : 'wait', release: rnd(85, 110), route, wi: sp + 1, turn: 0, smoked: false };
      const comp = comps[gi % comps.length];
      for (let i = 0; i < n; i++) {
        const lane = Math.floor(gi / ROUTES.length) * 40;
        const x = route[sp][0] + (i - (n - 1) / 2) * 6 + lane, z = route[sp][1] - i * 4 - (wave === 2 ? 60 : 0) - lane;
        const u = makeUnit('r', comp[i % comp.length], new V3(x, terrainH(x, z), z), 0);
        u.squad = g; g.members.push(u); made++;
      }
      squads.push(g);
    }
    if (B.side === 'r') {
      const g = squads.find((q) => q.team === 'r' && !q.static);
      const r0 = g.route[B.pvp ? 1 : 0]; ppos = new V3(r0[0] - 8, 0, r0[1] + 6); PL.squad = g;
    }
  } else if (B.scen === 'wall' || B.scen === 'points') {
    // ===== стенка на стенку: две линии в поле, между ними река и укрытия
    const line = (team, n, z0) => {
      const man = team === 'h' || B.pvp;
      const comp = man ? ['lead', 'rifle', 'mg', 'rifle', 'rpg', 'medic', 'rifle', 'sniper'] : ['assault', 'heavy', 'assault', 'rocket', 'scout', 'assault'];
      const per = man ? 6 : 4, gN = Math.max(1, Math.ceil(n / per)); let k = 0;
      for (let gi = 0; gi < gN && n > 0; gi++) {
        const own = B.wm[team], en = B.wm[enemyTeam(team)], dx = (gi - (gN - 1) / 2) * Math.min(70, 640 / gN), x0 = own[0] + dx;
        const g = { id: team + 'w' + gi, team, name: (team === 'h' ? SQN : RSQN)[gi] || 'Группа ' + (gi + 1), members: [], phase: 'march', route: [[en[0] + dx, en[1]]], wi: 0, turn: 0, smoked: false, order: 'hold', holdLine: B.wm.hold === team };
        for (let i = 0; i < per && n > 0; i++) { const x = x0 + (i - per / 2) * 6, z = z0 + (i % 2) * (team === 'h' ? 5 : -5); const u = makeUnit(team, comp[(k++) % comp.length], new V3(x, terrainH(x, z), z), team === 'h' ? 0 : Math.PI); u.squad = g; g.members.push(u); n--; }
        squads.push(g);
      }
    };
    if (B.side === 'h') {
      ppos = new V3(B.wm.h[0], 0, B.wm.h[1] + 12);
      if (nH >= 3) { const trio = { id: 'trio', team: 'h', name: 'Тройка', members: [], order: 'follow', player: true, orderT: 0 }; ['rifle', 'mg', 'medic'].forEach((c, i) => { const x = B.wm.h[0] + (i - 1) * 4, z = B.wm.h[1] + 16; const u = makeUnit('h', c, new V3(x, terrainH(x, z), z), 0); u.squad = trio; trio.members.push(u); nH--; }); squads.push(trio); PL.squad = trio; }
    }
    line('h', nH, B.wm.h[1]); line('r', nR, B.wm.r[1]);
    if (B.side === 'r') { const g = squads.find((q) => q.team === 'r' && !q.static); ppos = new V3(B.wm.r[0] + 8, 0, B.wm.r[1] - 6); PL.squad = g; }
    if (S.mortars !== false) {
      if (nH >= 12) { const m = addMortar(B.wm.h[0] - 30, B.wm.h[1] + 90, 'h'); for (let j = 0; j < 2; j++) { const p = m.pos.clone().add(_v.set(j ? 1.1 : -1.1, 0, -0.6)); p.y = terrainH(p.x, p.z); const u = makeUnit('h', 'mortar', p, 0); u.mortar = m; m.crew.push(u); } }
      if (nR >= 8) { const m = addMortar(B.wm.r[0] + 30, B.wm.r[1] - 90, 'r'); const p = m.pos.clone().add(_v.set(1.1, 0, 0.6)); p.y = terrainH(p.x, p.z); const u = makeUnit('r', B.pvp ? 'mortar' : 'mortar', p, Math.PI); if (B.pvp) u.mortar = m; else u.mortarU = m; m.crew.push(u); }
    }
    { const a = B.wm.h, c = B.wm.r; addCrate(a[0] - 12, a[1] + 12, 0, true); addCrate(a[0] + 14, a[1] + 8, 0, true); addCrate(c[0] - 10, c[1] - 6, 0, true); addCrate(c[0] + 12, c[1] - 10, 0, true); }
  } else {
    // ===== люди штурмуют: роботы держат траншеи, люди десантируются в ~500 м
    const rcomp = B.pvp ? ['rifle', 'mg', 'rifle', 'rpg', 'sniper'] : ['assault', 'heavy', 'assault', 'rocket', 'scout'];
    const rmN = S.mortars !== false && !B.pvp && nR >= 6 ? Math.min(4, Math.floor(nR / 6)) : 0;
    const rmg = { id: 'rm', team: 'r', name: 'Миномёты роботов на высоте', members: [], static: true };
    mortars.filter((m) => m.fixed).slice(0, rmN).forEach((m) => { m.team = 'r'; m.cool = rnd(15, 25); const p = m.pos.clone().add(_v.set(1.1, 0, 0.6)); p.y = terrainH(p.x, p.z); const u = makeUnit('r', 'mortar', p, 0); u.mortarU = m; m.crew.push(u); u.squad = rmg; rmg.members.push(u); nR--; });
    if (rmg.members.length) squads.push(rmg);
    if (B.side === 'r') { const ps = fs[0]; ps.used = PL; ppos = ps.pos.clone(); }
    const spread = fs.filter((q, i) => i % 2 === 0).concat(fs.filter((q, i) => i % 2 === 1));
    let k = 0;
    while (nR > 0) {
      const g = { id: 'rd' + k, team: 'r', name: RSQN[k] || 'Группа ' + (k + 1), members: [], order: 'hold', turn: 0, phase: 'hold' };
      for (let i = 0; i < 5 && nR > 0; i++) {
        const s = spread.find((q) => !q.used) || slots.rear.find((q) => !q.used); if (!s) { nR = 0; break; }
        const u = makeUnit('r', rcomp[i % rcomp.length], s.pos, s.yaw); s.used = u; u.spot = s; u.slot = s; u.home = s; u.squad = g; g.members.push(u); nR--;
      }
      if (g.members.length) squads.push(g);
      if (B.side === 'r' && k === 0) PL.squad = g;
      k++;
    }
    // десант людей
    const hq = { id: 'hq', team: 'h', name: 'Миномётчики', members: [], static: true };
    const lmN = S.mortars === false ? 0 : nH >= 12 ? 2 : nH >= 6 ? 1 : 0;
    for (let i = 0; i < lmN; i++) { const m = addMortar(i ? 45 : -45, -640, 'h'); m.cool = rnd(10, 16); for (let j = 0; j < (nH >= 16 ? 2 : 1); j++) { const p = m.pos.clone().add(_v.set(j ? 1.1 : -1.1, 0, -0.6)); p.y = terrainH(p.x, p.z); const u = makeUnit('h', 'mortar', p, 0); u.mortar = m; m.crew.push(u); hq.members.push(u); nH--; } }
    B.prepT = 38;
    if (S.mortars !== false) for (let i = 0; i < 22; i++) callArtillery(new V3(rnd(-190, 190), 0, HILL.cz - rnd(140, 160)), 1, 6, 'h', 3 + i * 1.5, 1.8, false, 'art');
    for (let x = -360, i = 0; x <= 360; x += 20, i++) { const z = -240 + gauss() * 5; makeSmoke(new V3(x, terrainH(x, z), z), rnd(18, 21), rnd(210, 250), i % 2 ? 0 : 8, true); }
    if (S.role === 'mortar' && B.side === 'h') { const m = addMortar(0, -650, 'h'); m.reserved = true; B.pslot = { pos: m.pos.clone(), text: 'Ваш миномёт на ЛЗ' }; }
    if (hq.members.length) squads.push(hq);
    const air = (u, x, z, h) => { u.pos.set(x, terrainH(x, z) + h, z); addChute(u); u.state = 'pos'; };
    const roles = ['lead', 'mg', 'rpg', 'medic', 'rifle', 'sniper'];
    if (B.side === 'h') {
      ppos = new V3(0, 0, -545);
      if (nH >= 3) {
        const trio = { id: 'trio', team: 'h', name: 'Тройка', members: [], order: 'follow', player: true, orderT: 0 };
        ['rifle', 'mg', 'medic'].forEach((c, i) => { const u = makeUnit('h', c, new V3(), 0); air(u, (i - 1) * 9, -545 - 6 - i * 3, 72 + i * 4); u.squad = trio; trio.members.push(u); nH--; });
        squads.push(trio); PL.squad = trio;
      }
    }
    const tot = Math.max(1, Math.ceil(nH / 6));
    for (let k2 = 0; k2 < tot && nH > 0; k2++) {
      const route = HROUTES[k2 % HROUTES.length];
      const wave = k2 < 4 ? 1 : 2;
      const sq = { id: 'h' + k2, team: 'h', name: SQN[k2] || (k2 + 1) + '-е отделение', members: [], order: 'hold', turn: 0, phase: wave === 1 ? 'chute' : 'wait', release: rnd(70, 100), route, wi: 1, smoked: false };
      const off = Math.floor(k2 / HROUTES.length) * 30;
      for (let i = 0; i < 6 && nH > 0; i++) {
        const u = makeUnit('h', roles[i], new V3(), 0);
        const x = route[0][0] + (i - 2.5) * 7 + off, z = route[0][1] - (i % 2) * 6 - off;
        if (wave === 1) air(u, x, z, rnd(60, 95)); else { const zz = z - 150; u.pos.set(x, terrainH(x, zz), zz); }
        u.smokes = roles[i] === 'lead' ? 2 : roles[i] === 'rifle' ? 1 : 0;
        u.squad = sq; sq.members.push(u); nH--;
      }
      squads.push(sq);
    }
  }
  if (B.scen === 'att') { addCrate(-14, -548, 0.2, true); addCrate(16, -552, -0.2, true); }
  { const tl = ['front', 'flankL', 'support', 'flankR']; const ti = { h: 0, r: 0 };
    for (const g of squads) { if (g.static || g.player || !g.members.length) continue; if (WALL() || g.team === attTeam()) g.tactic = tl[ti[g.team]++ % 4]; }
    const defs = squads.filter((g) => !WALL() && g.team === defTeam() && !g.static && !g.player && g.members.length);
    if (defs.length >= 3) defs[defs.length - 1].reserve = true;
    defs.forEach((g, i) => { if (!g.reserve) g.sector = ['центр', 'левый фланг', 'правый фланг'][i % 3]; });
    const mine = squads.filter((g) => g.team === B.side && !g.static && !g.player && g.members.length).slice(0, 6);
    if (mine.length) B.taskMsg = mine.map((g) => g.name + ' — ' + (g.tactic ? TACT[g.tactic] : g.reserve ? 'резерв' : g.sector || 'оборона')).join('; ');
  }
  P.x = ppos.x; P.z = ppos.z; P.yaw = B.side === attTeam() ? Math.PI : 0; P.pitch = 0.02;
  P.stance = 0; P.eye = PL.robot ? 2.15 : 1.62; P.jy = 0; P.vy = 0; P.lean = 0;
  if (B.scen === 'att' && B.side === 'h') {
    P.jy = 70; HOOK.chute = true;
    B.pchute = new THREE.Mesh(chuteGeo, chuteMat); scene.add(B.pchute);
  }
  PL.pos.set(P.x, terrainH(P.x, P.z), P.z);
  // снаряжение по роли
  B.loadout = [];
  let ids = R.w.slice();
  const cur = RIFLES[S.rifle];
  if (!PL.robot && cur && cur.org !== 'BOT' && !cur.mounted) {
    if (S.role === 'sniper' && cur.type === 'sniper') ids = [cur.id].concat(ids.filter((i) => i !== cur.id));
    if (S.role === 'rifle' && cur.type === 'auto' && cur.id !== 'pkm' && cur.id !== 'rpk') ids[0] = cur.id;
  }
  ids.forEach((id) => { const i = WIDX(id); if (i >= 0 && B.loadout.indexOf(i) < 0) B.loadout.push(i); });
  if (!B.loadout.length) B.loadout.push(WIDX(PL.robot ? 'rr' : 'ak'));
  RIFLES.forEach((r) => { TUR[r.id].mags = magDefault(r); TUR[r.id].ammo = r.mag; TUR[r.id].reserve = r.type === 'rocket' ? (r.smoke ? 0 : r.org === 'BOT' ? 3 : (R.rockets != null ? R.rockets : 2)) : null; });
  SS.selectRifle(B.loadout[0]);
  ['bbar', 'hp', 'feed', 'minimap', 'obj'].forEach((id) => { const e = $(id); if (e) e.hidden = false; });
  document.body.classList.add('battle');
  B.captain = S.role === 'captain' && !PL.robot; document.body.classList.toggle('captain', B.captain);
  $('bSquad').hidden = !(B.captain || (PL.squad && PL.squad.player)); $('bMed').hidden = PL.robot; $('bGren').hidden = !(PL.gren > 0);
  $('feed').innerHTML = ''; $('endScr').hidden = true;
  { const tn = (t) => (B.pvp ? (t === 'h' ? 'ЗЕЛЁНЫЕ' : 'СЕРЫЕ') : t === 'h' ? 'ЛЮДИ' : 'РОБОТЫ'); $('bHl').textContent = tn(B.side); $('bRl').textContent = tn(enemyTeam(B.side)); }
  updateArtBtn(); updateMedBtn(); updateGrenBtn();
  if (isNight() && SS.VIS.mode === 'off' && B.side === 'r' && !B.pvp) SS.setVision('thermal');
  const roleName = (B.side === 'r' && !B.pvp ? { assault: 'штурмовик', heavy: 'тяжёлый пулемётчик', rocket: 'ракетчик', scout: 'разведчик' } : { captain: 'капитан взвода', rifle: 'стрелок', mg: 'пулемётчик', sniper: 'снайпер', rpg: 'гранатомётчик', medic: 'санитар', mortar: 'миномётчик', lead: 'командир тройки' })[S.role] || '';
  let intro;
  if (B.scen === 'points') intro = 'Война за точки А–Е. Захватывайте и держите точки (стойте рядом с флагом): у кого больше точек, тот сжигает билеты противника. Подкрепления приходят волнами.';
  else if (B.scen === 'wall') intro = 'Стенка на стенку: две линии в поле за рекой, между ними курганы и рощи. Вы — ' + roleName + '. Вперёд, держаться своих!';
  else if (B.scen === 'def') intro = B.side === 'h' ? 'Вы — ' + roleName + '. ' + (isNight() ? 'Ночь, отдых у костра. ' : 'Привал в лагере за высотой. ') + 'На постах часовые. По тревоге — бегом на позицию!' : 'Вы — ' + roleName + ' штурмовой группы. Цель — высота с траншеями, кв. ' + grid(new V3(0, 0, HILL.cz)) + '. Вперёд!';
  else intro = B.side === 'h' ? 'Вы — ' + roleName + '. Десант! Артподготовка и дымовая завеса, приземление в 500 м от высоты, кв. ' + grid(new V3(0, 0, -545)) + '.' : 'Вы — ' + roleName + '. Удерживаем высоту: ' + (B.pvp ? 'зелёные' : 'люди') + ' высаживают десант с севера.';
  feed(intro, 'me');
  cmdSay('Задача: ' + R.obj + '.');
  if (B.taskMsg) setTimeout(() => { if (B.active) cmdSay('Взвод: ' + B.taskMsg + '.'); }, 3500);
  B.n0 = { h: aliveN('h'), r: aliveN('r') };
  B.drag = null; PL.revives = 0; B.dmgT = {}; B.wd = {}; B.wBase = null; B.seenT = {}; B.huntSaid = {}; B.surT = 0; B.surAsk = 0; B.rallyT = 0; B.defWithdraw = false; B.fallback = false; B.fallTeam = null; B.fallPt = null; B.vilT = 0; B.mark = null; B.evacN = { h: 0, r: 0 }; B.kia = { h: 0, r: 0 }; B.pElev = 0; if (LZR) LZR.visible = false; setupPoints(); { const pe = $('pts'); if (pe) pe.hidden = !B.pts; }
  if (B.camp) feed('Кампания · миссия ' + (S.campaign + 1) + ': «' + B.camp.title + '»', 'me');
  SS.updateWeaponUI();
}
function stopBattle() {
  if (B.mortarMode) dismountMortar();
  clearBattle(); SS.setRumble(0);
  B.active = false; HOOK.battle = false; HOOK.dead = false; HOOK.camRoll = 0; HOOK.camDY = 0; HOOK.speedMul = 1; HOOK.dispMul = 1; HOOK.playerTeam = 'h'; HOOK.chute = false;
  P.robot = false; PL.robot = false;
  fieldGroup.visible = false;
  ['bbar', 'hp', 'feed', 'bArt', 'bSquad', 'bMed', 'bUse', 'sqPanel', 'minimap', 'obj', 'bGren'].forEach((id) => { const e = $(id); if (e) e.hidden = true; });
  document.body.classList.remove('battle');
  $('endScr').hidden = true; $('dmg').style.opacity = '0';
  RIFLES.forEach((r) => { TUR[r.id].reserve = null; TUR[r.id].mags = null; });
  $('wList').hidden = true; $('morePanel').hidden = true;
  if (RIFLES[S.rifle].org === 'BOT' || RIFLES[S.rifle].mounted) SS.selectRifle(0);
  P.x = 0; P.z = 0.6; P.yaw = 0; P.eye = 1.62; P.jy = 0;
}
function endBattle(win, why, final) {
  if (B.over) return;
  if (final && win) { const mine = units.filter((u) => u.team === B.side); B.capOK = mine.filter((u) => u.alive).length > mine.length / 2; }
  if (final) { B.over = true; HOOK.over = true; }
  const shots = STATS.shots - B.startShots;
  const mm = Math.floor(B.t / 60), ss = Math.round(B.t % 60);
  const hAll = units.filter((u) => u.team === 'h').length, rAll = units.filter((u) => u.team === 'r').length;
  const iAtt = B.side === attTeam();
  $('endE').textContent = final ? (win ? (WALL() ? 'Противник разбит' : iAtt ? 'Высота взята' : 'Высота удержана, атака отбита') : 'Бой проигран') : 'Вы выбыли из боя';
  $('endT').textContent = final ? (win ? 'Победа' : why) : why;
  const R = roleOf(), v = R.val();
  $('endP').innerHTML = 'Длительность: ' + mm + ' мин ' + ss + ' с<br>Роботов уничтожено: ' + B.robotsKilled + ' из ' + rAll + (B.side === 'r' ? ' (+ вы)' : '') + '<br>Людей выбыло: ' + B.humansDown + ' из ' + hAll + (B.side === 'h' ? ' (+ вы)' : '') +
    '<br>Лично вами: ' + B.kills + (B.healed ? ', перевязано: ' + B.healed : '') + '<br>Ваши выстрелы: ' + shots + ', попаданий: ' + B.hitsE + (shots ? ' (' + Math.round(B.hitsE / shots * 100) + '%)' : '') +
    '<br>Задача «' + R.obj + '»: ' + (v >= R.need ? '<b style="color:#9fdc7a">выполнена</b>' : v + ' из ' + R.need) + (final ? '' : '<br><br>Бой продолжается без вас.');
  if (B.pvp) { const ee = units.filter((u) => u.team === enemyTeam(B.side)), me2 = units.filter((u) => u.team === B.side); $('endP').innerHTML = 'Длительность: ' + mm + ' мин ' + ss + ' с<br>Противников выведено: ' + ee.filter((u) => !u.alive).length + ' из ' + ee.length + '<br>Ваши потери: ' + me2.filter((u) => !u.alive).length + ' из ' + me2.length + ' (+ вы)<br>Лично вами: ' + B.kills + (B.healed ? ', перевязано: ' + B.healed : '') + '<br>Ваши выстрелы: ' + shots + ', попаданий: ' + B.hitsE + (shots ? ' (' + Math.round(B.hitsE / shots * 100) + '%)' : '') + '<br>Задача «' + R.obj + '»: ' + (v >= R.need ? '<b style="color:#9fdc7a">выполнена</b>' : v + ' из ' + R.need) + (final ? '' : '<br><br>Бой продолжается без вас.'); }
  { const me = B.side, mine = units.filter((u) => u.team === me && !isBot(u)); if (mine.length) { const ok = mine.filter((u) => u.alive).length, ev = mine.filter((u) => u.evac).length, kia = mine.filter((u) => u.dead).length, wd = mine.filter((u) => u.down && !u.dead && !u.evac).length;
      const k = Math.round((ok + ev) / mine.length * 100); $('endP').innerHTML += '<br><br><b>Сохранено сил: ' + k + '%</b> — в строю ' + ok + ', эвакуировано раненых ' + ev + ', лежат раненые ' + wd + ', погибли ' + kia + '<br>' + (k >= 70 ? 'Отлично: людей сберегли.' : k >= 45 ? 'Потери ощутимые. Отходите раньше, тащите раненых в медпункт.' : 'Тяжёлые потери. Лучше уходить мелкими группами, чем терять взвод.'); } }
  $('endWatch').hidden = !!final; $('endWatch').textContent = B.pts && !final ? 'Вернуться в бой (−5 билетов)' : 'Наблюдать бой';
  if ($('endNext')) $('endNext').hidden = true;
  { const tk = $('endTake'); if (tk) tk.hidden = !!final || !!B.pts || PL.robot || !takeCandidate(); }
  if (final && B.camp && window.CAMPAIGN) { $('endP').innerHTML += '<br><br><b>' + (win ? 'Миссия «' + B.camp.title + '» выполнена!' : 'Миссия провалена — попробуйте ещё раз.') + '</b>'; window.CAMPAIGN.onEnd(win); }
  setTimeout(() => { $('endScr').hidden = false; try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } }, win ? 1500 : 400);
}
$('endAgain').addEventListener('click', () => { $('endScr').hidden = true; startBattle(); SS.setAim('hip'); });
$('endMenu').addEventListener('click', () => { $('endScr').hidden = true; SS.openMenu(); });
$('endWatch').addEventListener('click', () => {
  if (B.pts && !B.over) { $('endScr').hidden = true; const sp = B.wm[B.side]; B.tk[B.side] -= 5; PL.alive = true; PL.hp = 100; PL.downed = false; HOOK.dead = false; HOOK.speedMul = 1; HOOK.camRoll = 0; HOOK.camDY = 0; B.spect = false; B.diedShown = false; B.deadT = 0; P.x = sp[0] + gauss() * 6; P.z = sp[1] + (B.side === 'h' ? 8 : -8); P.stance = 0; P.eye = PL.robot ? 2.15 : 1.62; P.yaw = B.side === 'h' ? 0 : Math.PI; if (PL.robot) { for (const z in PL.Z) { PL.Z[z].hp = PL.Z[z].max; PL.Z[z].int = 1; } } resupply(); SS.setAim('hip'); feed('Вы снова в бою (−5 билетов)', 'me'); return; }
  $('endScr').hidden = true; B.spect = true; HOOK.camRoll = 0; HOOK.camDY = 0;
  P.x = 0; P.z = HILL.cz - 60; P.eye = 3; P.yaw = 0; P.pitch = -0.05;
});

HOOK.startBattle = startBattle;
HOOK.stopBattle = stopBattle;
HOOK._dbg = { PT, smokeAt: (x, z) => makeSmoke(new V3(x, terrainH(x, z), z), rnd(12, 15), 80), SOLID, ELEV, hurtPlayer, downHuman, retreatTo, orderTo, POI, CCP, elevY, takeOver, killDowned, playerDie, drops, crates, units, B, PL, explode, squads, covers, partDamage, hurtHuman, TK, smokes, nests, mortars, squadCmd, grenades, raiseAlarm, smokeBetween, visibleNow, los };
HOOK.nextWeapon = function () {
  if (!B.active) { SS.selectRifle(S.rifle + 1); return; }
  if (B.mounted || B.mortarMode) return;
  const i = (B.loadout.indexOf(S.rifle) + 1) % B.loadout.length;
  SS.selectRifle(B.loadout[i]);
};
HOOK.aimUI = function (m) { $('bArt').hidden = !(B.active && m === 'bino'); };
HOOK.lookScale = function () { return B.assistNear ? 0.6 : 1; };

HOOK.update = function (dt, sdt) {
  updateRockets(sdt);
  updateDebris(sdt);
  updateSmokes(sdt);
  if (!B.active || B.freeze) { if (units.length) renderUnits(dt); return; }
  if (!$('menu').hidden) { renderUnits(0); return; }
  B.t += dt;
  const gy = terrainH(P.x, P.z);
  PL.vel.set((P.x - PL.pos.x) / Math.max(dt, 1e-3), 0, (P.z - PL.pos.z) / Math.max(dt, 1e-3));
  PL.pos.set(P.x, gy, P.z);
  PL.right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  PL.crouch = P.stance > 0 ? 1 : 0;
  gridBuild();
  if (!B.over) {
    B.brainT -= sdt;
    if (B.brainT <= 0) { B.brainT = 1.5; computeLoads(); if (WALL()) { brainAttack('h'); brainAttack('r'); } else { brainAttack(attTeam()); brainDefend(defTeam()); } boundTick(); support(); commander(); }
    for (const u of units) {
      if (!u.alive) continue;
      if (isBot(u)) updateRobot(u, sdt); else updateHuman(u, sdt);
    }
    updateShells(sdt);
    updateMortars(sdt);
    updateChutes(sdt);
    updateGrenades(sdt);
    updateFires(sdt);
    updateDrag(sdt);
    woundsTick(sdt);
    if ((B.carT = (B.carT || 0) - sdt) <= 0) { B.carT = 1; carryTick(); finishTick(); }
    if (B.mark && B.t > B.mark.t) B.mark = null;
    if (B.pts) pointsTick(sdt);
    if (B.campEv && B.campEv.length) campaignTick();
    atmosphere(dt);
    if (B.scen === 'def' && !B.alarm) { for (const u of units) if (u.team === 'r' && u.alive && !u.mortarU && Math.hypot(u.pos.x, u.pos.z - HILL.cz) < (B.pvp ? 900 : 1300)) { raiseAlarm((B.pvp ? 'Противник' : 'Роботы') + ' в квадрате ' + grid(u.pos) + ', ' + Math.round(Math.hypot(u.pos.x, u.pos.z - HILL.cz)) + ' м'); break; } }
    if (PL.alive && PL.team === attTeam() && Math.hypot(PL.pos.x, PL.pos.z - HILL.cz) < 158) B.reachedTrench = true;
    B.rumbleT -= dt;
    if (B.rumbleT <= 0) { B.rumbleT = 2; SS.setRumble(B.t - Math.max(B.contactT, B.rContactT || -99) < 20 ? 0.16 : 0.07); }
    if (PL.alive && PL.robot && B.t - PL.lastHit > 6) { for (const z in PL.Z) { const Z = PL.Z[z]; if (Z.hp > 0 && Z.hp < Z.max) Z.hp = Math.min(Z.max, Z.hp + dt * Z.max * 0.01); } PL.hp = PL.Z.torso.hp / PL.Z.torso.max * 100; }
    // итоги
    const AT = attTeam(), DT = defTeam();
    const fighter = (u) => u.alive && !u.mortarU && !u.mortar && !(isBot(u) && u.crawl && (WALL() || Math.hypot(u.pos.x, u.pos.z - HILL.cz) > 250));
    const aAlive = units.some((u) => u.team === AT && fighter(u)) || (PL.alive && PL.team === AT);
    const dAlive = units.some((u) => u.team === DT && fighter(u)) || (PL.alive && PL.team === DT);
    const aIn = units.filter((u) => u.team === AT && u.alive && !u.crawl && Math.hypot(u.pos.x, u.pos.z - HILL.cz) < 160).length + (PL.alive && PL.team === AT && Math.hypot(PL.pos.x, PL.pos.z - HILL.cz) < 160 ? 1 : 0);
    const dHold = units.filter((u) => u.team === DT && fighter(u) && Math.hypot(u.pos.x, u.pos.z - HILL.cz) < 170).length + (PL.alive && PL.team === DT ? 1 : 0);
    if (B.pts) { if (B.tk.h <= 0) endBattle(B.side === 'r', 'Билеты закончились', true); else if (B.tk.r <= 0) endBattle(B.side === 'h', 'Билеты закончились', true); }
    else if (!aAlive) endBattle(B.side === DT, WALL() ? 'Ваша линия разбита' : 'Штурм отбит', true);
    else if (!dAlive) endBattle(B.side === AT, WALL() ? 'Ваша линия разбита' : 'Силы обороны уничтожены', true);
    else if (surrenderCheck(dt)) { /* конец по сдаче */ }
    else if (!WALL()) {
      const dN = units.filter((u) => u.team === DT && u.alive).length, d0 = units.filter((u) => u.team === DT).length || 1;
      if (!B.fallback && ((aIn >= 2 && dHold <= 2) || (dN <= d0 * 0.6 && B.t - ((B.dmgT && B.dmgT[DT]) || -99) < 30))) retreatTo(DT, aIn >= 2 && dHold <= 2 ? 'Высота потеряна' : 'Большие потери — сберечь людей');
      if (B.fallback && !B.defWithdraw && dN <= Math.max(1, d0 * 0.3) && B.t - ((B.dmgT && B.dmgT[DT]) || -99) < 30) {
        B.defWithdraw = true; B.rallyT = B.t + rnd(90, 120);
        if (isFriend(DT)) cmdSay('Деревню не удержать. Отходим перекатами на юг, к сборному пункту у опушки! Одни прикрывают — другие бегут!'); else feed('Противник оставляет деревню и отходит на юг', 'me');
        const rally = new V3(-30, 0, 470); rally.y = terrainH(rally.x, rally.z);
        for (const sq of squads) { if (sq.team !== DT || sq.player) continue; sq.order = 'rally'; sq.members.forEach((m) => { if (m.nest) { m.nest.crew = m.nest.crew.filter((c) => c !== m); m.nest = null; } if (m.mortar) { m.mortar.crew = m.mortar.crew.filter((c) => c !== m); m.mortar = null; } m.mortarU = false; }); boundMove(sq, rally.clone().add(_v.set(gauss() * 25, 0, gauss() * 10)), null); }
        if (PL.team === DT && PL.alive) { B.pslot = { pos: rally.clone(), text: 'Отход на сборный пункт у южной опушки' }; B.obj2 = { pos: B.pslot.pos.clone(), text: B.pslot.text }; }
      }
      // со сборного пункта — контратака, когда силы соберутся
      if (B.defWithdraw && B.rallyT && B.t > B.rallyT) { B.rallyT = 0; B.phaseD = 'attack'; for (const sq of squads) if (sq.team === DT && !sq.player) { sq.order = 'attack'; sq.turn = 0; } if (isFriend(DT)) cmdSay('Перегруппировались. Контратака перекатами — вперёд!'); else feed('Противник собрался и контратакует!', 'bad'); }
    }
  }
  if (PL.alive && PL.downed) {
    P.stance = 2; B.dmgA = Math.max(B.dmgA, 0.55 + 0.25 * Math.sin(B.t * 4));
    if (B.t - PL.downT > 15) { feed('Вы истекли кровью', 'bad'); PL.hp = 0; playerDie(); }
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
    if (s.big && s.t > 12 && (s.facc = (s.facc || 0) + dt) > 0.1) { s.facc = 0; const fp = zonePoint(s.u, 'torso', new V3()); SS.fxGlow(fp.add(_v2.set(gauss() * 0.2, 0.3, gauss() * 0.2)), 0xff7a26, 0.45, 0.12, 0.5, _v3.set(gauss() * 0.2, 1.3, gauss() * 0.2), 0.9, 0, 0, 0); }
    if (s.acc > (s.big ? 0.22 : 0.45)) { s.acc = 0; const p = zonePoint(s.u, s.zone, new V3()); SS.spawnPuff(p, s.big ? 0x2b2926 : 0x4a4744, s.big ? 1.6 : 0.7, s.big ? 5 : 3, 1, s.big ? 1.6 : 0.9, 0.1); if (s.big && Math.random() < 0.2) sparks(p, 2, 0.25); }
  }
  fxL *= Math.exp(-dt * 13); fxLight.intensity = fxL;
  renderUnits(dt);
  if (S.assist && PL.alive && !PL.robot && !B.mounted && !B.mortarMode && AIM.mode !== 'bino' && B.active) {
    const cd = _v.set(0, 0, -1).applyQuaternion(camera.quaternion); let bw = null, ba = 0.075;
    for (const [e, k] of TK[PL.team]) {
      if (!e.alive || e.isPlayer || B.t - k.t > 1.5) continue;
      const tp = aimPointOf(e, 'torso', _v2), d = _v3.copy(tp).sub(camera.position), L = d.length(); if (L > 50 || L < 2) continue;
      d.divideScalar(L); const a = Math.acos(clamp(d.dot(cd), -1, 1)); if (a < ba) { ba = a; bw = [faceYaw(d.x, d.z), Math.asin(clamp(d.y, -1, 1))]; }
    }
    if (bw) { const k = Math.min(1, dt * 2.2); P.yaw += angDiff(bw[0], P.yaw) * k; P.pitch += (bw[1] - P.pitch) * k; }
  }
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
    const nn = nearNest(), nm = nn ? null : nearMortar(), nw = nn || nm ? null : nearDowned(), nd = nn || nm || nw ? null : nearDrop(), ncr = !nn && !nm && !nd && !nw ? nearCrate() : null;
    const nar = nearArmory();
    $('bUse').hidden = !(B.mounted || nn || B.mortarMode || nm || nd || ncr || nw || B.drag || nar);
    $('useTxt').textContent = nar && !B.drag ? 'ОРУЖЕЙКА' : B.drag ? 'БРОСИТЬ' : nw ? 'ТАЩИТЬ' : B.mounted ? 'СЛЕЗТЬ' : B.mortarMode ? 'ОТОЙТИ' : nn ? 'ЗА ПУЛЕМЁТ' : nm ? 'К МИНОМЁТУ' : nd ? 'ВЗЯТЬ ' + (B.loadout.indexOf(WIDX(nd.id)) >= 0 ? 'ПАТРОНЫ' : RIFLES[WIDX(nd.id)].name.split(' ')[0]) : 'ПАТРОНЫ';
    updateArtBtn();
    B.mmT -= 0.25; if (B.mmT <= 0) { B.mmT = mmBig ? 0.25 : 0.5; drawMinimap(); }
    if (B.pts) { const pe = $('pts'); if (pe) { const me = B.side, foe = enemyTeam(me); pe.innerHTML = '<span class="tk me">' + Math.max(0, Math.round(B.tk[me])) + '</span>' + B.pts.map((p) => '<span class="pt ' + (p.own ? (p.own === me ? 'me' : 'foe') : 'n') + (p.contested ? ' c' : '') + '">' + p.n + '</span>').join('') + '<span class="tk foe">' + Math.max(0, Math.round(B.tk[foe])) + '</span>'; } }
    const R = roleOf(), v = R.val(), ob = $('obj');
    if (v >= R.need && !B.objDone) { B.objDone = true; cmdSay('Задача «' + R.obj + '» выполнена. Молодец!'); }
    if (ob) ob.innerHTML = (B.objDone ? '✔ ' : '◆ ') + R.obj + ' <b>' + Math.min(v, R.need) + '/' + R.need + '</b>' + (B.obj2 ? '<br>▶ ' + B.obj2.text + ' · ' + Math.round(B.obj2.pos.distanceTo(PL.pos)) + ' м' : '');
  }
};
// помощник прицеливания и метки противника
const _sp = new V3();
function toScreen(p, W, H) { _sp.copy(p).project(camera); if (_sp.z > 1 || _sp.z < -1) return null; return [(_sp.x + 1) / 2 * W, (1 - _sp.y) / 2 * H]; }
HOOK.drawOverlay = function (o, W, H, D) {
  if (!B.active) return;
  B.assistNear = false;
  const assist = S.assist || PL.robot;
  if (PL.alive) {
    const rf = SS.curRifle();
    let bestE = null, bd = 70 * D, bestS = null;
    for (const [e, k] of TK[PL.team]) {
      if (!e.alive || B.t - k.t > 4 || e.isPlayer) continue;
      const head = aimPointOf(e, e.team === 'r' ? 'head' : 'head', new V3()); head.y += isBot(e) ? 0.45 : 0.3;
      const s = toScreen(head, W, H); if (!s || s[0] < 0 || s[0] > W || s[1] < 0 || s[1] > H) continue;
      const d = e.pos.distanceTo(PL.pos);
      o.fillStyle = PL.robot ? 'rgba(255,140,60,.9)' : 'rgba(255,70,50,.85)';
      o.beginPath(); o.moveTo(s[0], s[1] + 4 * D); o.lineTo(s[0] - 3.5 * D, s[1] - 1.5 * D); o.lineTo(s[0] + 3.5 * D, s[1] - 1.5 * D); o.closePath(); o.fill();
      const body = toScreen(aimPointOf(e, 'torso', new V3()), W, H);
      if (body) { const dc = Math.hypot(body[0] - W / 2, body[1] - H / 2); if (dc < bd) { bd = dc; bestE = e; bestS = body; } }
    }
    if (assist && (bestE && rf.type !== 'rocket' || bestE && HOOK.rocketElev)) {
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
        o.fillStyle = 'rgba(120,255,140,.9)'; o.font = 10 * D + 'px monospace'; o.textAlign = 'center'; o.fillText(Math.round(Dm) + ' м', s[0], s[1] - 11 * D);
      }
    }
  }
  if (PL.robot && PL.alive) {
    o.fillStyle = 'rgba(255,90,30,0.035)'; o.fillRect(0, 0, W, H);
    if (PL.Z.head.hp <= 0 || (PL.Z.head.hp < PL.Z.head.max * 0.3 && Math.random() < 0.3)) { o.fillStyle = 'rgba(200,200,200,' + (0.08 + Math.random() * 0.1) + ')'; for (let i = 0; i < 40; i++) o.fillRect(Math.random() * W, Math.random() * H, 30 * D, 2 * D); }
    const x0 = ((MM && !MM.hidden ? MM.getBoundingClientRect().right : 0) + 10) * D, y0 = 14 * D, s = 6 * D;
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
      o.fillStyle = 'rgba(120,200,255,.6)'; o.beginPath(); o.moveTo(s[0], s[1] + 3 * D); o.lineTo(s[0] - 3 * D, s[1] - 2 * D); o.lineTo(s[0] + 3 * D, s[1] - 2 * D); o.closePath(); o.fill();
    }
  }
  // свои: маленькие голубые метки (видно, где свои, даже без помощника)
  if (PL.alive) {
    o.fillStyle = 'rgba(110,185,255,.65)';
    for (const u of units) {
      if (!u.alive || u.team !== PL.team || (PL.squad && u.squad === PL.squad)) continue;
      const dd = Math.abs(u.pos.x - PL.pos.x) + Math.abs(u.pos.z - PL.pos.z); if (dd < 6 || dd > 700) continue;
      const s = toScreen(_v.set(u.pos.x, u.pos.y + (isBot(u) ? 2.6 : 2.05), u.pos.z), W, H); if (!s) continue;
      o.beginPath(); o.moveTo(s[0], s[1] + 3 * D); o.lineTo(s[0] - 2.6 * D, s[1] - 1.2 * D); o.lineTo(s[0] + 2.6 * D, s[1] - 1.2 * D); o.closePath(); o.fill();
    }
  }
  // точки на экране
  if (B.pts && PL.alive) for (const p of B.pts) {
    const s = toScreen(_v.set(p.pos.x, p.pos.y + 7.5, p.pos.z), W, H); if (!s) continue;
    const col = p.own ? (p.own === B.side ? 'rgba(90,162,255,.9)' : 'rgba(255,90,70,.9)') : 'rgba(210,210,210,.85)';
    o.strokeStyle = col; o.lineWidth = 2 * D; o.beginPath(); o.arc(s[0], s[1], 9 * D, 0, TAU); o.stroke();
    o.fillStyle = col; o.font = '700 ' + 11 * D + 'px sans-serif'; o.textAlign = 'center'; o.fillText(p.n, s[0], s[1] + 4 * D);
    const dd = Math.round(p.pos.distanceTo(PL.pos)); if (dd > 30) { o.font = 9 * D + 'px monospace'; o.fillText(dd + ' м', s[0], s[1] + 20 * D); }
  }
  // медпункты (когда тащите раненого) и точка указки
  if (PL.alive && (B.drag || (B.mark && B.mark.pos))) {
    const list = B.drag ? (!WALL() && PL.team === defTeam() ? CCP : [ccpFor(PL.team, PL.pos)]) : [];
    for (const cc of list) { const s = toScreen(_v.set(cc.pos.x, cc.pos.y + 3, cc.pos.z), W, H); if (!s) continue; o.fillStyle = 'rgba(255,255,255,.9)'; o.fillRect(s[0] - 9 * D, s[1] - 9 * D, 18 * D, 18 * D); o.fillStyle = '#d22'; o.fillRect(s[0] - 7 * D, s[1] - 2 * D, 14 * D, 4 * D); o.fillRect(s[0] - 2 * D, s[1] - 7 * D, 4 * D, 14 * D); o.fillStyle = '#fff'; o.font = '600 ' + 10 * D + 'px sans-serif'; o.textAlign = 'center'; o.fillText(Math.round(cc.pos.distanceTo(PL.pos)) + ' м', s[0], s[1] + 22 * D); }
    if (B.mark) { const s = toScreen(_v.set(B.mark.pos.x, B.mark.pos.y + 1.5, B.mark.pos.z), W, H); if (s) { o.strokeStyle = 'rgba(93,255,122,.95)'; o.lineWidth = 2 * D; o.beginPath(); o.arc(s[0], s[1], 8 * D, 0, TAU); o.moveTo(s[0], s[1] + 8 * D); o.lineTo(s[0], s[1] + 16 * D); o.stroke(); o.fillStyle = 'rgba(93,255,122,.95)'; o.font = '600 ' + 10 * D + 'px sans-serif'; o.textAlign = 'center'; o.fillText(B.mark.name, s[0], s[1] - 12 * D); } }
  }
  // тяжёлое ранение: отсчёт
  if (PL.downed) { const left = Math.max(0, 15 - (B.t - PL.downT)); o.fillStyle = 'rgba(255,80,60,.95)'; o.font = '700 ' + 16 * D + 'px monospace'; o.textAlign = 'center'; o.fillText('ТЯЖЁЛОЕ РАНЕНИЕ · ' + left.toFixed(0) + ' с · санитар!', W / 2, H * 0.42); const rl = 2 - (PL.revives || 0); o.font = '600 ' + 11 * D + 'px sans-serif'; o.fillText(rl > 1 ? 'Поднять вас могут ещё 2 раза' : 'Последний раз: следующее тяжёлое ранение — эвакуация', W / 2, H * 0.42 + 18 * D); }
  // метки раненых своих
  if (PL.alive && !PL.robot) {
    for (const u of units) {
      if (u.team !== PL.team || u.nest || u.stab) continue;
      const mine = PL.squad && u.squad === PL.squad;
      const hurt = u.alive && u.hp < 55, dn = !u.alive && u.down;
      if (!hurt && !dn) continue;
      const dd = Math.abs(u.pos.x - PL.pos.x) + Math.abs(u.pos.z - PL.pos.z); if (dd > (mine ? 400 : 90)) continue;
      const s = toScreen(_v.set(u.pos.x, u.pos.y + (dn ? 0.6 : 2.0), u.pos.z), W, H); if (!s) continue;
      o.fillStyle = dn ? 'rgba(255,80,60,.85)' : 'rgba(242,201,76,.85)';
      o.beginPath(); o.arc(s[0], s[1], 2.6 * D, 0, TAU); o.fill();
    }
  }
  // точка задачи
  if (B.obj2 && PL.alive) {
    const s = toScreen(_v.set(B.obj2.pos.x, B.obj2.pos.y + 2.5, B.obj2.pos.z), W, H);
    if (s) { const k = 8 * D; o.strokeStyle = '#f2c94c'; o.lineWidth = 2 * D; o.beginPath(); o.moveTo(s[0], s[1] - k); o.lineTo(s[0] + k, s[1]); o.lineTo(s[0], s[1] + k); o.lineTo(s[0] - k, s[1]); o.closePath(); o.stroke(); o.fillStyle = '#f2c94c'; o.font = 600 + ' ' + 11 * D + 'px monospace'; o.textAlign = 'center'; o.fillText(Math.round(B.obj2.pos.distanceTo(PL.pos)) + ' м', s[0], s[1] + k + 12 * D); }
  }
  // миномёт игрока
  if (B.mortarMode) {
    const m = B.mortarMode, az = Math.round(((-P.yaw * 180 / Math.PI) % 360 + 360) % 360);
    o.fillStyle = 'rgba(0,0,0,.45)'; o.fillRect(W / 2 - 170 * D, 58 * D, 340 * D, 24 * D);
    o.fillStyle = '#f2e6b0'; o.font = 600 + ' ' + 12 * D + 'px monospace'; o.textAlign = 'center';
    o.fillText('82 мм · дальность ' + m.range + ' м · азимут ' + az + '° · подлёт ' + Math.round(7 + m.range / 260) + ' с', W / 2, 75 * D);
    const tp = m.pos.clone().add(_v.set(-Math.sin(P.yaw) * m.range, 0, -Math.cos(P.yaw) * m.range)); tp.y = terrainH(tp.x, tp.z) + 1;
    const s = toScreen(tp, W, H);
    if (s) { o.strokeStyle = 'rgba(255,200,80,.9)'; o.lineWidth = 1.5 * D; o.beginPath(); o.arc(s[0], s[1], 9 * D, 0, TAU); o.moveTo(s[0] - 14 * D, s[1]); o.lineTo(s[0] + 14 * D, s[1]); o.stroke(); }
  }
  if (B.lastMortar && B.t < B.lastMortar.t + 15) {
    const s = toScreen(_v.set(B.lastMortar.pos.x, terrainH(B.lastMortar.pos.x, B.lastMortar.pos.z) + 1, B.lastMortar.pos.z), W, H);
    if (s) { o.strokeStyle = B.t < B.lastMortar.t ? 'rgba(255,220,120,.8)' : 'rgba(255,120,60,.8)'; o.lineWidth = 1.5 * D; o.beginPath(); o.arc(s[0], s[1], 6 * D, 0, TAU); o.stroke(); o.fillStyle = o.strokeStyle; o.font = 10 * D + 'px monospace'; o.textAlign = 'center'; o.fillText(B.t < B.lastMortar.t ? 'подлёт ' + Math.ceil(B.lastMortar.t - B.t) + ' с' : 'разрыв', s[0], s[1] - 10 * D); }
  }
  const R = Math.min(W, H) * 0.32;
  for (const d of B.dirs) {
    const a = d.a - Math.PI / 2;
    o.strokeStyle = 'rgba(255,60,40,' + Math.min(1, d.t).toFixed(2) + ')'; o.lineWidth = 6 * D;
    o.beginPath(); o.arc(W / 2, H / 2, R, a - 0.25, a + 0.25); o.stroke();
  }
};
})();
