/* Режим «Оборона»: люди держат окопы против наступающих человекоподобных боевых роботов.
   Юниты рисуются инстансами (по одному InstancedMesh на тип детали), скелет — дерево Object3D вне сцены. */
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

/* ================= окопы ================= */
const TRENCH = { front: -35, rear: -6 };
const PH = 1.15;           // высота бруствера
const trenchGroup = new THREE.Group(); trenchGroup.visible = false; scene.add(trenchGroup);
const parapets = [];
const slots = { front: [], rear: [] };
const bagMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.2, 0.34), new THREE.MeshLambertMaterial({ color: 0xa08f6a }), 1200);
bagMesh.count = 0; trenchGroup.add(bagMesh);
(function buildTrenches() {
  const earthM = new THREE.MeshLambertMaterial({ color: 0x6e5c3f });
  const floorM = new THREE.MeshLambertMaterial({ color: 0x45392a });
  const postM = new THREE.MeshLambertMaterial({ color: 0x5f4a32 });
  const shape = new THREE.Shape();
  shape.moveTo(-1.3, -0.4); shape.lineTo(1.05, -0.4); shape.lineTo(0.35, PH); shape.lineTo(-0.5, PH); shape.lineTo(-1.3, -0.4);
  const L = 7.2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2); geo.rotateY(Math.PI / 2);     // длина вдоль X, фронт (к врагу) — в сторону -Z
  geo.computeVertexNormals();
  const dummy = new THREE.Object3D();
  let nb = 0;
  [['front', TRENCH.front], ['rear', TRENCH.rear]].forEach(([name, zc]) => {
    for (let i = -6; i <= 6; i++) {
      const cx = i * 7.6, cz = zc + (i % 2 ? 0.9 : -0.9), ang = i % 2 ? 0.09 : -0.09;
      const gy = terrainH(cx, cz);
      const m = new THREE.Mesh(geo, earthM); m.position.set(cx, gy, cz); m.rotation.y = ang; trenchGroup.add(m);
      const u = new V3(Math.cos(ang), 0, -Math.sin(ang)), n = new V3(Math.sin(ang), 0, Math.cos(ang));
      const pp = { c: new V3(cx, gy, cz), u, n, L: L / 2, name };
      parapets.push(pp);
      // мешки с песком по верху
      for (let x = -L / 2 + 0.35; x < L / 2 - 0.2; x += 0.6) {
        dummy.position.set(cx + u.x * x, gy + PH + 0.1, cz + u.z * x);
        dummy.rotation.set(0, ang + gauss() * 0.08, gauss() * 0.03); dummy.updateMatrix();
        bagMesh.setMatrixAt(nb++, dummy.matrix);
      }
      // дно окопа и плетень
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.5), floorM); fl.rotation.set(-Math.PI / 2, 0, ang);
      fl.position.set(cx + n.x * 1.9, terrainH(cx + n.x * 1.9, cz + n.z * 1.9) + 0.03, cz + n.z * 1.9); trenchGroup.add(fl);
      for (let x = -L / 2 + 0.4; x < L / 2; x += 1.6) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.08), postM);
        p.position.set(cx + u.x * x + n.x * 1.05, gy + 0.45, cz + u.z * x + n.z * 1.05); trenchGroup.add(p);
      }
      [-2.4, 0, 2.4].forEach((s) => {
        const x = cx + u.x * s + n.x * 1.85, z = cz + u.z * s + n.z * 1.85;
        slots[name].push({ pos: new V3(x, terrainH(x, z), z), yaw: ang, pp, used: false });
      });
    }
  });
  bagMesh.count = nb; bagMesh.instanceMatrix.needsUpdate = true;
})();
// отрезок против бруствера (локальная коробка), возвращает параметр входа 0..1
function segParapet(pp, p0, p1) {
  if ((p0.z - pp.c.z > 2.5 && p1.z - pp.c.z > 2.5) || (p0.z - pp.c.z < -2.5 && p1.z - pp.c.z < -2.5)) return null;
  const ox = p0.x - pp.c.x, oz = p0.z - pp.c.z, oy = p0.y - pp.c.y;
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const s = [ox * pp.u.x + oz * pp.u.z, oy, ox * pp.n.x + oz * pp.n.z];
  const e = [dx * pp.u.x + dz * pp.u.z, dy, dx * pp.n.x + dz * pp.n.z];
  const mn = [-pp.L, -0.4, -1.0], mx = [pp.L, PH + 0.12, 1.0];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(e[i]) < 1e-9) { if (s[i] < mn[i] || s[i] > mx[i]) return null; continue; }
    let a = (mn[i] - s[i]) / e[i], b = (mx[i] - s[i]) / e[i];
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return t0;
}
// стоит ли точка за бруствером относительно взрыва
function coveredFrom(pos, blast) {
  for (const pp of parapets) {
    const lx = (pos.x - pp.c.x) * pp.u.x + (pos.z - pp.c.z) * pp.u.z, lz = (pos.x - pp.c.x) * pp.n.x + (pos.z - pp.c.z) * pp.n.z;
    if (Math.abs(lx) <= pp.L + 0.5 && lz > 0.6 && lz < 3.2) {
      const bz = (blast.x - pp.c.x) * pp.n.x + (blast.z - pp.c.z) * pp.n.z;
      return bz < -0.9;
    }
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

/* ================= инстансы деталей ================= */
const PT = {};
const MAXU = 28;
function bx(w, h, d, ox, oy, oz) { const g = new THREE.BoxGeometry(w, h, d); g.translate(ox || 0, oy || 0, oz || 0); return g; }
function defPart(key, geo, color, mult, basic) {
  const max = MAXU * (mult || 1);
  const mat = basic ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff });
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  m.frustumCulled = false; m.count = 0; scene.add(m);
  PT[key] = { mesh: m, n: 0, max, col: new THREE.Color(color) };
}
// люди
defPart('h_pelvis', bx(0.34, 0.2, 0.22), 0x4d5a36);
defPart('h_torso', bx(0.38, 0.56, 0.22, 0, 0.28, 0), 0x5b6b3d);
defPart('h_vest', bx(0.44, 0.4, 0.3, 0, 0.3, 0), 0x3e4a2b);
defPart('h_head', bx(0.17, 0.21, 0.19, 0, 0.1, 0), 0xc49c7c);
(function () { const g = new THREE.SphereGeometry(0.14, 10, 6, 0, TAU, 0, Math.PI / 2); g.translate(0, 0.14, 0); defPart('h_helmet', g, 0x4b5631); })();
defPart('h_uarm', bx(0.1, 0.3, 0.1, 0, -0.15, 0), 0x5b6b3d, 2);
defPart('h_farm', bx(0.09, 0.28, 0.09, 0, -0.14, 0), 0x5b6b3d, 2);
defPart('h_thigh', bx(0.15, 0.46, 0.16, 0, -0.23, 0), 0x4d5a36, 2);
defPart('h_shin', bx(0.13, 0.44, 0.14, 0, -0.22, 0), 0x4d5a36, 2);
defPart('h_boot', bx(0.13, 0.09, 0.26, 0, -0.04, -0.05), 0x2a2824, 2);
defPart('h_gun', bx(0.05, 0.09, 0.85, 0, 0, -0.3), 0x1d1d1c);
(function () { const g = new THREE.CylinderGeometry(0.045, 0.045, 1.0, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.15); defPart('h_tube', g, 0x4b5636); })();
// роботы
defPart('r_pelvis', bx(0.52, 0.26, 0.36), 0x4d5258);
defPart('r_torso', bx(0.72, 0.62, 0.46, 0, 0.36, 0), 0x6b7178);
defPart('r_plate', bx(0.6, 0.44, 0.08, 0, 0.42, -0.26), 0x8a9096);
defPart('r_pack', bx(0.48, 0.42, 0.24, 0, 0.4, 0.33), 0x464b51);
defPart('r_head', bx(0.32, 0.26, 0.32, 0, 0.13, 0), 0x5d636a);
defPart('r_visor', bx(0.27, 0.05, 0.02, 0, 0.15, -0.166), 0xff3a1e, 1, true);
defPart('r_pad', bx(0.28, 0.16, 0.38), 0x7a8087, 2);
defPart('r_uarm', bx(0.17, 0.44, 0.17, 0, -0.22, 0), 0x5a6067, 2);
defPart('r_farm', bx(0.16, 0.42, 0.16, 0, -0.21, 0), 0x5a6067, 2);
defPart('r_thigh', bx(0.22, 0.56, 0.24, 0, -0.28, 0), 0x5a6067, 2);
defPart('r_shin', bx(0.19, 0.56, 0.21, 0, -0.28, 0), 0x5a6067, 2);
defPart('r_foot', bx(0.24, 0.08, 0.4, 0, -0.04, -0.06), 0x3f444a, 2);
defPart('r_gun', bx(0.11, 0.14, 0.95, 0, 0, -0.35), 0x2a2d30);
(function () { const g = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, -1.05); defPart('r_barrel', g, 0x1c1e20); })();
defPart('r_pod', bx(0.3, 0.28, 0.5), 0x4f555b);

function O(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); if (parent) parent.add(o); return o; }
function humanRig(cls) {
  const root = O(null, 0, 0, 0); root.rotation.order = 'YXZ';
  const hips = O(root, 0, 0.95, 0), torso = O(hips, 0, 0.08, 0), head = O(torso, 0, 0.6, 0);
  const shR = O(torso, 0.25, 0.5, 0), shL = O(torso, -0.25, 0.5, 0), faR = O(shR, 0, -0.3, 0), faL = O(shL, 0, -0.3, 0);
  const thL = O(hips, -0.1, -0.05, 0), thR = O(hips, 0.1, -0.05, 0), snL = O(thL, 0, -0.46, 0), snR = O(thR, 0, -0.46, 0);
  const btL = O(snL, 0, -0.44, 0), btR = O(snR, 0, -0.44, 0);
  const gun = cls === 'rpg' ? O(torso, 0.16, 0.62, 0.02) : O(torso, 0.12, 0.36, -0.16);
  if (cls === 'mg') gun.scale.set(1.25, 1.1, 1.25);
  const parts = [[hips, 'h_pelvis', 'legs'], [torso, 'h_torso', 'torso'], [torso, 'h_vest', 'torso'], [head, 'h_head', 'head'], [head, 'h_helmet', 'head'],
    [shR, 'h_uarm', 'arm'], [shL, 'h_uarm', 'arm'], [faR, 'h_farm', 'arm'], [faL, 'h_farm', 'arm'],
    [thL, 'h_thigh', 'legs'], [thR, 'h_thigh', 'legs'], [snL, 'h_shin', 'legs'], [snR, 'h_shin', 'legs'], [btL, 'h_boot', 'legs'], [btR, 'h_boot', 'legs'],
    [gun, cls === 'rpg' ? 'h_tube' : 'h_gun', 'arm']];
  return { root, hips, torso, head, shR, shL, faR, faL, thL, thR, snL, snR, gun, parts };
}
function robotRig(cls) {
  const root = O(null, 0, 0, 0); root.rotation.order = 'YXZ';
  const hips = O(root, 0, 1.15, 0), torso = O(hips, 0, 0.12, 0), head = O(torso, 0, 0.74, 0);
  const pdR = O(torso, 0.47, 0.68, 0), pdL = O(torso, -0.47, 0.68, 0);
  const shR = O(torso, 0.47, 0.58, 0), shL = O(torso, -0.47, 0.58, 0), faR = O(shR, 0, -0.44, 0), faL = O(shL, 0, -0.44, 0);
  const thL = O(hips, -0.18, -0.06, 0), thR = O(hips, 0.18, -0.06, 0), snL = O(thL, 0, -0.56, 0), snR = O(thR, 0, -0.56, 0);
  const ftL = O(snL, 0, -0.56, 0), ftR = O(snR, 0, -0.56, 0);
  const gun = O(torso, 0.38, 0.4, -0.22);
  if (cls === 'heavy') gun.scale.set(1.3, 1.3, 1.15);
  const parts = [[hips, 'r_pelvis', 'legs'], [torso, 'r_torso', 'torso'], [torso, 'r_plate', 'torso'], [torso, 'r_pack', 'torso'],
    [head, 'r_head', 'head'], [head, 'r_visor', 'head'], [pdR, 'r_pad', 'armR'], [pdL, 'r_pad', 'armL'],
    [shR, 'r_uarm', 'armR'], [shL, 'r_uarm', 'armL'], [faR, 'r_farm', 'armR'], [faL, 'r_farm', 'armL'],
    [thL, 'r_thigh', 'legs'], [thR, 'r_thigh', 'legs'], [snL, 'r_shin', 'legs'], [snR, 'r_shin', 'legs'], [ftL, 'r_foot', 'legs'], [ftR, 'r_foot', 'legs'],
    [gun, 'r_gun', 'armR'], [gun, 'r_barrel', 'armR']];
  let pod = null;
  if (cls === 'rocket') { pod = O(torso, -0.3, 0.9, 0.08); parts.push([pod, 'r_pod', 'torso']); }
  return { root, hips, torso, head, shR, shL, faR, faL, thL, thR, snL, snR, gun, pod, parts };
}

/* ================= юниты ================= */
const RW = {
  assault: { id: 'r_assault', mv: 820, bc: 0.2, g: 9.5, sh: 0, sg: 1.5, rpm: 600, burst: [3, 4], pause: [1.0, 1.8], spread: 3.2 },
  heavy:   { id: 'r_heavy',   mv: 850, bc: 0.25, g: 12, sh: 0, sg: 1.5, rpm: 720, burst: [7, 12], pause: [1.3, 2.2], spread: 4.2 },
};
const units = [];
const PL = { isPlayer: true, team: 'h', alive: true, hp: 100, pos: new V3(), vel: new V3(), right: new V3(1, 0, 0), kneel: 0, crouch: 0, lastHit: -99 };
const B = { active: false, over: false, N: 10, t: 0, mortarT: 25, rumbleT: 8, artLeft: 3, kills: 0, lost: 0, robotsKilled: 0, hitsR: 0, shots0: 0,
  loadout: [], wi: 0, deadT: 0, dmgA: 0, dirs: [], hudT: 0, shells: [], startShots: 0 };

function makeUnit(team, cls, pos, yaw) {
  const rig = team === 'h' ? humanRig(cls) : robotRig(cls);
  const u = {
    team, cls, rig, pos: pos.clone(), yaw, aimYaw: yaw, alive: true, H: team === 'h' ? 1.78 : 2.35, right: new V3(1, 0, 0), vel: new V3(),
    hp: 100, st: rnd(0.5, 3), state: team === 'h' ? 'duck' : 'move', target: null, retarget: 0, cool: rnd(1, 3), burst: 0,
    crouch: team === 'h' ? 1 : 0, crouchT: team === 'h' ? 1 : 0, pitch: 0, ph: Math.random() * TAU, mv: 0, fall: 0, kick: 0, stagger: 0, staggerPh: 0,
    rangeErr: gauss() * 0.05, supp: 0, kneel: 0, smokeT: 0, rocketCool: rnd(4, 9), lane: pos.x, stop: rnd(55, 120), deadT: 0, slot: null,
  };
  if (team === 'r') {
    const k = cls === 'heavy' ? 1.3 : 1;
    const Z = (armor, hp) => ({ armor: armor * k, hp: hp * k, max: hp * k, int: 1, broken: false });
    u.zones = { head: Z(2600, 45), torso: Z(4200, 160), armL: Z(2200, 50), armR: Z(2200, 50), legs: Z(3000, 90) };
    u.wp = cls === 'heavy' ? RW.heavy : RW.assault;
    u.speed = cls === 'heavy' ? 1.7 : 2.35;
  } else {
    u.wp = W_(cls === 'mg' ? 'pkm' : cls === 'sniper' ? 'svd' : cls === 'rpg' ? 'rpg' : 'ak');
  }
  units.push(u);
  return u;
}
function faceYaw(dx, dz) { return Math.atan2(-dx, -dz); }
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function exposed(t) {
  if (t.isPlayer) return P.eye > 1.3 || !inTrench(t.pos);
  if (t.team === 'h') return t.crouch < 0.5 || !t.slot;
  return true;
}
function aimPoint(t, out) {
  if (t.isPlayer) return out.set(camera.position.x, camera.position.y - 0.15, camera.position.z);
  if (t.team === 'h') return out.set(t.pos.x, t.pos.y + (t.crouch > 0.5 ? 1.05 : 1.52), t.pos.z);
  return out.set(t.pos.x, t.pos.y + 1.6 - t.kneel * 0.5, t.pos.z);
}
const _v = new V3(), _v2 = new V3(), _v3 = new V3();
function muzzle(u, out) { return u.rig.gun.localToWorld(out.set(0, 0, u.team === 'r' ? -1.25 : -0.75)); }

/* ---------- эффекты ---------- */
function flashFX(p, big) {
  SS.addEffect({ o: new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color: 0xffc46a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: false })),
    t: 0, life: 0.07, s0: big ? 0.02 : 0.012, s1: big ? 0.03 : 0.018, v: new V3(), a0: 1 }).o.position.copy(p);
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

/* ---------- звуки ---------- */
function boom(dist, power) {
  const AC = SS.getAC(); if (!AC) return;
  const t = AC.currentTime + dist / 343, v = clamp(60 * power / (dist + 40), 0.05, 1.2);
  SS.noiseHit(t, 1.6 + power * 0.4, 'lowpass', 180 + 200 / (1 + dist / 100), v);
  SS.tone(t, 55, 1.0, v * 0.9, 'sine', 28);
  if (dist < 150) SS.noiseHit(t, 0.12, 'highpass', 1200, v * 0.7);
  SS.noiseHit(t + 0.4, 2.2, 'lowpass', 140, v * 0.3);
}
function whistle(dist) {
  const AC = SS.getAC(); if (!AC) return;
  SS.tone(AC.currentTime, 1700, 1.5, clamp(25 / (dist + 25), 0.02, 0.25), 'sine', 450);
}
function ring(v) { const AC = SS.getAC(); if (!AC) return; SS.tone(AC.currentTime, 3600, 2.5, 0.05 * v, 'sine'); }

/* ---------- взрыв ---------- */
function explode(pt, power, opts) {
  opts = opts || {};
  const dist = pt.distanceTo(camera.position);
  const add = (color, s0, s1, life) => SS.addEffect({ o: new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })), t: 0, life, s0, s1, v: new V3(), a0: 1 }).o.position.copy(pt).add(_v.set(0, 0.4 * power, 0));
  add(0xfff0c8, 2.5 * power, 6 * power, 0.18);
  add(0xff8a2a, 2 * power, 5 * power, 0.5);
  if (opts.ground !== false) {
    SS.spawnPuff(pt, 0x8a7a5c, 3.5 * power, 3.2, Math.round(5 + 4 * power), 1.3, 1.4 * power);
    for (let i = 0; i < Math.round(10 * power); i++) {
      const e = SS.addEffect({ o: new THREE.Sprite(new THREE.SpriteMaterial({ map: SS.puffTex, color: 0x3a3025, transparent: true, depthWrite: false })), t: 0, life: rnd(1.5, 2.6), s0: rnd(0.25, 0.6), s1: rnd(0.2, 0.5), v: new V3(gauss() * 4 * power, rnd(5, 13) * Math.sqrt(power), gauss() * 4 * power), a0: 1, g: true, floor: terrainH(pt.x, pt.z) });
      e.o.position.copy(pt);
    }
    if (power >= 0.8) {
      const c = new THREE.Mesh(craterGeo, craterMat); const r = 1.4 * power + 0.6;
      c.scale.set(r * 2, 1, r * 2); c.position.set(pt.x, terrainH(pt.x, pt.z) + 0.04, pt.z); c.rotation.y = Math.random() * TAU;
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
    const c = _v2.set(u.pos.x, u.pos.y + (u.team === 'r' ? 1.3 : 0.9), u.pos.z);
    const d = c.distanceTo(pt); if (d > R) continue;
    let k = Math.pow(1 - d / R, 1.5);
    if (u.team === 'h') {
      if (u.crouch > 0.5 && coveredFrom(u.pos, pt)) k *= 0.15;
      hurtHuman(u, 170 * power * k, opts.by, pt);
    } else {
      for (const z in u.zones) { const Z = u.zones[z]; Z.hp -= 55 * power * k; Z.int = Math.max(0, Z.int - 0.3 * k * power); }
      u.stagger = Math.min(1.5, u.stagger + k * power * 1.5);
      checkRobot(u, opts.by);
    }
  }
  if (opts.direct) {
    const u = opts.direct.u;
    if (u.alive && u.team === 'r') { const Z = u.zones[opts.direct.zone]; Z.hp -= 420; Z.int = 0; checkRobot(u, opts.by); }
  }
  if (PL.alive && B.active) {
    const d = pt.distanceTo(_v2.set(P.x, PL.pos.y + 0.9, P.z));
    if (d < R) { let k = Math.pow(1 - d / R, 1.5); if (P.eye < 1.2 && coveredFrom(PL.pos, pt)) k *= 0.15; hurtPlayer(140 * power * k, pt); }
  }
}

/* ---------- урон ---------- */
function feed(text, cls) {
  const f = $('feed'); const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls;
  f.insertBefore(d, f.firstChild);
  while (f.children.length > 5) f.removeChild(f.lastChild);
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 700); }, 6000);
}
function hurtHuman(u, dmg, by, from) {
  if (!u.alive) return;
  u.hp -= dmg; u.supp += 2;
  if (u.hp <= 0) {
    u.alive = false; u.fall = 0; u.fallDir = 1; B.lost++;
    SS.spawnPuff(_v.set(u.pos.x, u.pos.y + 1.2, u.pos.z), 0x6b0d0d, 0.5, 0.8, 2, 0.1, 0.05);
    feed(by === 'player' ? 'Вы ранили своего бойца насмерть' : 'Боец погиб (' + clsName(u.cls) + ')', 'bad');
  }
}
function clsName(c) { return { rifle: 'автоматчик', mg: 'пулемётчик', sniper: 'снайпер', rpg: 'гранатомётчик', assault: 'штурмовой', heavy: 'тяжёлый', rocket: 'ракетный' }[c] || c; }
function humanHit(u, zone, E) {
  let dmg;
  if (zone === 'head') dmg = E > 900 || Math.random() < 0.5 ? 100 : 25;
  else if (zone === 'torso') { const plate = Math.random() < 0.62; dmg = plate && E < 3200 ? 18 + E / 300 : 45 + E / 40; }
  else if (zone === 'arm') dmg = 18 + E / 120;
  else dmg = 22 + E / 100;
  return dmg;
}
function hurtPlayer(dmg, from) {
  if (!PL.alive || !B.active) return;
  PL.hp -= dmg; PL.lastHit = B.t;
  B.dmgA = Math.min(1, B.dmgA + dmg / 45);
  SHAKE.a += 0.02;
  if (from) {
    const a = Math.atan2(from.x - P.x, -(from.z - P.z)) + P.yaw;   // относительно взгляда
    B.dirs.push({ a, t: 1.6 });
  }
  if (PL.hp <= 0) playerDie();
}
function playerDie() {
  PL.alive = false; PL.hp = 0; HOOK.dead = true; B.deadT = 0;
  SS.setAim('hip');
  feed('Вы погибли', 'bad');
}
function checkRobot(u, by) {
  const Z = u.zones;
  for (const k in Z) {
    const z = Z[k];
    if (!z.broken && z.hp <= 0) {
      z.broken = true;
      const p = zonePoint(u, k);
      sparks(p, 6, 0.6); SS.spawnPuff(p, 0x2e2c2a, 1.2, 3, 2, 0.8, 0.2);
      if (k === 'legs') u.kneel = 0.001;
      if (k !== 'torso' && by === 'player') feed('Робот: ' + { head: 'голова уничтожена', armL: 'левая рука оторвана', armR: 'оружейная рука уничтожена', legs: 'ноги перебиты' }[k], 'me');
      smokers.push({ u, zone: k, t: 25, acc: 0 });
    }
  }
  if (u.alive && (Z.torso.hp <= 0 || (Z.head.broken && Z.torso.hp < Z.torso.max * 0.4))) {
    u.alive = false; u.fall = 0; u.fallDir = Math.random() < 0.5 ? -1 : 1; B.robotsKilled++;
    const p = _v3.set(u.pos.x, u.pos.y + 1.5, u.pos.z);
    explode(p.clone(), 0.45, { noDamage: true, ground: false });
    sparks(p, 12, 0.9);
    smokers.push({ u, zone: 'torso', t: 40, acc: 0, big: true });
    if (by === 'player') { B.kills++; HM.t = 0.45; HM.kind = 'kill'; feed('Робот уничтожен (' + SS.curRifle().name + ', ' + Math.round(u.pos.distanceTo(PL.pos)) + ' м)', 'me'); }
    else feed('Робот уничтожен (' + clsName(u.cls) + ')');
  }
}
function zonePoint(u, zone) {
  const y = { head: 2.15, torso: 1.6, armL: 1.5, armR: 1.5, legs: 0.7 }[zone] - u.kneel * 0.5;
  const s = zone === 'armL' ? -0.5 : zone === 'armR' ? 0.5 : 0;
  return new V3(u.pos.x + u.right.x * s, u.pos.y + y, u.pos.z + u.right.z * s);
}
function robotHit(u, zone, E, b, pt) {
  const Z = u.zones[zone];
  const thr = Z.armor * Z.int;
  const byP = b.player ? 'player' : '';
  if (E > thr) {
    Z.hp -= (E - thr * 0.5) / 28;
    Z.int = Math.max(0, Z.int - 0.12);
    sparks(pt, 2, 0.3);
    SS.spawnPuff(pt, 0x2a2826, 0.4, 1.2, 1, 0.5, 0.05);
    if (b.player) { HM.t = 0.25; HM.kind = 'pen'; }
  } else {
    // броня держит: искры, износ брони, рикошет
    Z.int = Math.max(0, Z.int - 0.045 * E / 1000 * (zone === 'torso' ? 1 : 1.2));
    Z.hp -= E / 600;
    sparks(pt, 3, 0.3);
    if (b.player) { HM.t = 0.2; HM.kind = 'ric'; }
    if (!b.rico && Math.random() < 0.6) {
      const v = b.v.clone().normalize();
      const n = _v.set(gauss(), Math.abs(gauss()) * 0.6, gauss()).normalize();
      const d = v.sub(n.multiplyScalar(2 * v.dot(n))).normalize();
      SS.spawnBullet({ team: b.team, rf: b.rf, origin: pt.clone().addScaledVector(d, 0.6), dir: d, mv: b.v.length() * rnd(0.3, 0.5), tracer: Math.random() < 0.5 ? 0xffc870 : 0, rico: true, dt: 0.002, owner: u });
    }
    const AC = SS.getAC(); const dist = pt.distanceTo(camera.position);
    if (AC && dist < 300) SS.tone(AC.currentTime + dist / 343, rnd(1800, 3200), 0.12, clamp(8 / (dist + 8), 0.02, 0.3), 'triangle', rnd(900, 1500));
  }
  checkRobot(u, byP);
}

/* ---------- попадания пуль (хук ядра) ---------- */
function unitHit(u, p0, p1, isPl) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z, dy = p1.y - p0.y;
  const ux = u.pos.x, uz = u.pos.z;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 1e-9 ? ((ux - p0.x) * dx + (uz - p0.z) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = p0.x + dx * t - ux, cz = p0.z + dz * t - uz;
  const hd = Math.sqrt(cx * cx + cz * cz);
  const robot = u.team === 'r';
  if (hd > (robot ? 0.66 : 0.34)) return null;
  const H = isPl ? P.eye + 0.14 : robot ? 2.35 - u.kneel * 0.65 : 1.78 - u.crouch * 0.62;
  const h = p0.y + dy * t - u.pos.y;
  if (h < 0 || h > H) return null;
  const f = h / H;
  const lat = cx * u.right.x + cz * u.right.z;
  let zone, r;
  if (robot) {
    if (f > 0.86) { zone = 'head'; r = 0.2; }
    else if (f > 0.5) { if (Math.abs(lat) > 0.36) { zone = lat > 0 ? 'armR' : 'armL'; r = 0.66; } else { zone = 'torso'; r = 0.42; } }
    else { zone = 'legs'; r = 0.3; }
  } else {
    if (f > 0.87) { zone = 'head'; r = 0.13; }
    else if (f > 0.5) { if (Math.abs(lat) > 0.2) { zone = 'arm'; r = 0.34; } else { zone = 'torso'; r = 0.26; } }
    else { zone = 'legs'; r = 0.2; }
  }
  if (hd > r) return null;
  return { t, zone, pt: new V3(p0.x + dx * t, p0.y + dy * t, p0.z + dz * t) };
}
HOOK.collide = function (b, p0, p1) {
  if (!B.active) return null;
  let best = null;
  // щелчки пуль над головой
  if (b.team === 'r' && !b.cracked && PL.alive) {
    const c = camera.position;
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, L2 = dx * dx + dy * dy + dz * dz;
    let t = L2 > 0 ? ((c.x - p0.x) * dx + (c.y - p0.y) * dy + (c.z - p0.z) * dz) / L2 : 0; t = clamp(t, 0, 1);
    const ex = p0.x + dx * t - c.x, ey = p0.y + dy * t - c.y, ez = p0.z + dz * t - c.z, d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (d < 3) { b.cracked = true; if (b.v.length() > 360) SS.sndCrack(clamp(1.4 / (d + 0.6), 0.2, 1)); }
  }
  for (const pp of parapets) {
    const t = segParapet(pp, p0, p1);
    if (t != null && (!best || t < best.t)) best = { t, fn: () => hitParapet(b, new V3().lerpVectors(p0, p1, t)) };
  }
  for (const u of units) {
    if (!u.alive || u === b.owner) continue;
    if ((u.pos.z - p0.z > 2 && u.pos.z - p1.z > 2) || (u.pos.z - p0.z < -2 && u.pos.z - p1.z < -2)) continue;
    const h = unitHit(u, p0, p1, false);
    if (h && (!best || h.t < best.t)) best = { t: h.t, fn: () => bulletHitsUnit(b, u, h) };
  }
  if (PL.alive && !b.player && b.team === 'r') {
    const h = unitHit(PL, p0, p1, true);
    if (h && (!best || h.t < best.t)) best = { t: h.t, fn: () => { const v = b.v.length(); hurtPlayer(humanHit(PL, h.zone, 0.5 * b.rf.g / 1000 * v * v) * 0.7, b.origin); SS.killBullet(b, null); } };
  }
  return best;
};
function hitParapet(b, pt) {
  SS.killBullet(b, pt, false);
  for (const u of units) if (u.team === 'h' && u.alive && Math.abs(u.pos.x - pt.x) < 3 && Math.abs(u.pos.z - pt.z) < 3.5) u.supp += 0.7;
}
function bulletHitsUnit(b, u, h) {
  const v = b.v.length(), E = 0.5 * b.rf.g / 1000 * v * v;
  SS.killBullet(b, null);
  if (u.team === 'h') {
    SS.spawnPuff(h.pt, 0x6b0d0d, 0.3, 0.5, 1, 0.1, 0.03);
    hurtHuman(u, humanHit(u, h.zone, E), b.player ? 'player' : '', b.origin);
  } else {
    if (b.player) B.hitsR++;
    robotHit(u, h.zone, E, b, h.pt);
  }
}

/* ================= ракеты (РПГ-7 и ракетные роботы) ================= */
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
  if (player) {
    SHAKE.a += 0.02;
    const back = origin.clone().addScaledVector(dir, -2.2); SS.spawnPuff(back, 0xcfc8b8, 2.2, 2.5, 5, 0.4, 0.6);
  }
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
    // флюгерный эффект: на активном участке граната доворачивает против ветра
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
    let boom = null;
    while (r.acc >= 0.004 && !boom) {
      r.acc -= 0.004;
      _rp0.copy(r.p);
      rocketStep(r, 0.004);
      const p0 = _rp0, p1 = r.p;
      let best = null;
      if (B.active) {
        for (const pp of parapets) { const t = segParapet(pp, p0, p1); if (t != null && (!best || t < best.t)) best = { t }; }
        for (const u of units) {
          if (!u.alive || u === r.owner) continue;
          if (Math.abs(u.pos.z - p1.z) > 3) continue;
          const h = unitHit(u, p0, p1, false);
          if (h && (!best || h.t < best.t)) best = { t: h.t, u, zone: h.zone };
        }
        if (r.team === 'r' && PL.alive) { const h = unitHit(PL, p0, p1, true); if (h && (!best || h.t < best.t)) best = { t: h.t }; }
      } else {
        const tg = SS.targetSeg(p0, p1);
        if (tg && (!best || tg.f < best.t)) best = { t: tg.f, tg };
      }
      const g1 = terrainH(p1.x, p1.z);
      if (p1.y <= g1) { const g0 = terrainH(p0.x, p0.z), e0 = p0.y - g0, e1 = p1.y - g1, f = e0 > 0 ? e0 / (e0 - e1) : 0; if (!best || f < best.t) best = { t: f }; }
      if (best) boom = { pt: new V3().lerpVectors(p0, p1, best.t), u: best.u, zone: best.zone, tg: best.tg };
      else if (r.t > 4.5) boom = { pt: r.p.clone(), air: true };
    }
    if (boom) {
      if (boom.tg) { const T = boom.tg.T; T.hits.push({ a: boom.tg.a, b: T.kind === 'steel' ? boom.tg.b + 0.735 : boom.tg.b, score: 10 }); if (T.kind === 'ring') SS.paintRing(T); else { SS.paintSteel(T); T.swingV += 6; } }
      explode(boom.pt, 1.0, { by: r.player ? 'player' : '', direct: boom.u ? { u: boom.u, zone: boom.zone } : null, ground: !boom.air });
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
// таблица прицела ПГО-7: угол возвышения для дальности D (рад)
const RK_TABLE = (function () {
  const tb = [];
  for (let a = 0; a <= 0.09; a += 0.0005) {
    const r = { p: new V3(0, 0, 0), v: new V3(0, Math.sin(a), -Math.cos(a)).multiplyScalar(117), t: 0 };
    const save = SS.windAt; let D = 0;
    for (let i = 0; i < 2000; i++) {
      const v = r.v, sp = v.length(), k = RK_K * sp;
      let ax = -k * v.x, ay = -k * v.y - 9.81, az = -k * v.z;
      if (r.t > 0.06 && r.t < 0.56) { ax += v.x / sp * 390; ay += v.y / sp * 390; az += v.z / sp * 390; }
      v.x += ax * 0.004; v.y += ay * 0.004; v.z += az * 0.004; r.p.addScaledVector(v, 0.004); r.t += 0.004;
      if (r.p.y < 0 && r.t > 0.05) { D = -r.p.z; break; }
      if (r.t > 4.5) { D = -r.p.z; break; }
    }
    tb.push([a, D]);
    void save;
  }
  return tb;
})();
HOOK.rocketElev = function (D) {
  for (let i = 1; i < RK_TABLE.length; i++) if (RK_TABLE[i][1] >= D) { const a = RK_TABLE[i - 1], b = RK_TABLE[i]; return lerp(a[0], b[0], (D - a[1]) / (b[1] - a[1] || 1)); }
  return RK_TABLE[RK_TABLE.length - 1][0];
};

/* ================= артиллерия ================= */
function callArtillery(center, count, spread, team, delay) {
  for (let i = 0; i < count; i++) {
    B.shells.push({ t: delay + i * rnd(0.3, 0.7) + Math.random() * 0.5, pos: new V3(center.x + gauss() * spread, 0, center.z + gauss() * spread * 1.3), team, wh: false });
  }
}
function updateShells(dt) {
  for (let i = B.shells.length - 1; i >= 0; i--) {
    const s = B.shells[i]; s.t -= dt;
    if (!s.wh && s.t < 1.5) { s.wh = true; whistle(s.pos.distanceTo(PL.pos)); }
    if (s.t <= 0) { s.pos.y = terrainH(s.pos.x, s.pos.z); explode(s.pos, s.team === 'h' ? 2.3 : 1.8, { by: s.team === 'h' ? 'player' : '' }); B.shells.splice(i, 1); }
  }
}
HOOK.callArt = function () {
  if (!B.active || !PL.alive) return;
  if (B.artLeft <= 0) { feed('Артиллерия: заявки исчерпаны'); return; }
  if (!LRF.pt || LRF.t <= 0) { feed('Сначала измерьте дальность до цели лазером (бинокль)'); return; }
  const d = LRF.pt.distanceTo(PL.pos);
  if (d < 90) { feed('Слишком близко к своим — нужна цель дальше 90 м', 'bad'); return; }
  B.artLeft--;
  callArtillery(LRF.pt, 6, 16, 'h', 7);
  feed('Огонь! Батарея — 6 снарядов, ' + Math.round(d) + ' м, подлёт 7 с', 'me');
  updateArtBtn();
};
function updateArtBtn() { $('artTxt').textContent = 'АРТ ' + B.artLeft; $('bArt').disabled = B.artLeft <= 0; }
$('bArt').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); SS.audioInit(); HOOK.callArt(); });

/* ================= ИИ ================= */
function pickRobot(u) {
  let best = null, bd = Infinity;
  for (const r of units) {
    if (r.team !== 'r' || !r.alive) continue;
    const d = r.pos.distanceTo(u.pos) + Math.random() * 60;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
function pickHuman(u) {
  let best = null, bd = Infinity;
  const cand = units.filter((h) => h.team === 'h' && h.alive);
  if (PL.alive) cand.push(PL);
  for (const h of cand) {
    const d = h.pos.distanceTo(u.pos) + (exposed(h) ? 0 : 220) + Math.random() * 120 + (h.isPlayer ? 50 : 0);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
function npcShoot(u, tgt, spreadMrad, tracer) {
  const wp = u.wp;
  const org = muzzle(u, new V3());
  const tp = aimPoint(tgt, _v2);
  const D = org.distanceTo(tp);
  const tf = D / (wp.mv * 0.8);
  tp.addScaledVector(tgt.vel, tf);
  const dir = tp.sub(org).normalize();
  const el = SS.zeroAngle(wp) + SS.stdElev(wp, D * (1 + u.rangeErr));
  const ax = _v3.set(-dir.z, 0, dir.x).normalize();
  dir.applyAxisAngle(ax, el);
  const s = spreadMrad * 0.001;
  dir.x += gauss() * s; dir.y += gauss() * s; dir.z += gauss() * s; dir.normalize();
  SS.spawnBullet({ team: u.team, rf: wp, origin: org, dir, mv: wp.mv + gauss() * 3, tracer, owner: u, dt: 0.002 });
  flashFX(org, wp.g > 10);
  u.kick = 1;
  SS.sndShotFar(org.distanceTo(camera.position), wp.g > 10 || u.cls === 'mg', u.team === 'r');
}
function updateHuman(u, dt) {
  u.st -= dt; u.cool -= dt; u.supp = Math.max(0, u.supp - dt * 0.7); u.retarget -= dt;
  if (!u.target || !u.target.alive || u.retarget < 0) { u.target = pickRobot(u); u.retarget = rnd(2, 4); }
  const tg = u.target;
  const D = tg ? tg.pos.distanceTo(u.pos) : Infinity;
  const range = u.cls === 'rpg' ? 330 : u.cls === 'sniper' ? 1100 : u.cls === 'mg' ? 750 : 380;
  if (u.state === 'duck') {
    u.crouchT = 1;
    if (u.st <= 0 && tg && D < range && u.supp < 2.5) { u.state = 'aim'; u.st = rnd(3, 8); u.cool = rnd(0.5, 1.1); u.burst = 0; }
  } else {
    u.crouchT = 0;
    if (tg) {
      const want = faceYaw(tg.pos.x - u.pos.x, tg.pos.z - u.pos.z);
      const base = u.slot ? u.slot.yaw : u.yaw;
      u.yaw = base + clamp(angDiff(want, base), -1.1, 1.1);
      const dy = (tg.pos.y + 1.5) - (u.pos.y + 1.45); u.pitch = Math.atan2(dy, D);
    }
    if (u.cool <= 0 && tg && D < range) {
      if (u.cls === 'rpg') {
        const org = muzzle(u, new V3()); const tp = aimPoint(tg, _v2).addScaledVector(tg.vel, D / 220);
        const dir = tp.sub(org).normalize(); dir.applyAxisAngle(_v3.set(-dir.z, 0, dir.x).normalize(), HOOK.rocketElev(D * (1 + u.rangeErr)));
        dir.x += gauss() * 0.006; dir.y += gauss() * 0.006; dir.normalize();
        launchRocket(org.addScaledVector(dir, 0.6), dir, 'h', false, u);
        u.state = 'duck'; u.st = rnd(6, 9); u.kick = 1;
      } else if (u.cls === 'sniper') {
        npcShoot(u, tg, 0.6, S.tracers && Math.random() < 0.5 ? 0xff9a3c : 0); u.cool = rnd(2.5, 4.5);
      } else {
        if (u.burst <= 0) u.burst = u.cls === 'mg' ? Math.round(rnd(6, 11)) : Math.round(rnd(2, 4));
        npcShoot(u, tg, (u.cls === 'mg' ? 3.6 : 3.0) * (1 + D / 600), S.tracers && Math.random() < (u.cls === 'mg' ? 0.5 : 0.25) ? 0xff9a3c : 0);
        u.burst--;
        u.cool = u.burst > 0 ? 60 / u.wp.rpm : rnd(0.5, 1.2) * (u.cls === 'mg' ? 1.3 : 1);
      }
    }
    if (u.st <= 0 || u.supp > 3.5 || !tg || D > range) { u.state = 'duck'; u.st = rnd(1.5, 4); }
  }
}
function updateRobot(u, dt) {
  u.st -= dt; u.cool -= dt; u.rocketCool -= dt; u.retarget -= dt;
  if (!u.target || !u.target.alive || u.retarget < 0) { u.target = pickHuman(u); u.retarget = rnd(2, 4); }
  const tg = u.target;
  const legs = !u.zones.legs.broken;
  const goalZ = TRENCH.front - u.stop;
  const atGoal = u.pos.z >= goalZ - 1;
  let moving = false;
  if (u.state === 'move' && legs && !atGoal) {
    // к своей полосе, с расталкиванием соседей
    let dx = (u.lane - u.pos.x) * 0.05, dz = 1;
    for (const o of units) if (o !== u && o.team === 'r' && o.alive) { const ex = u.pos.x - o.pos.x, ez = u.pos.z - o.pos.z, d2 = ex * ex + ez * ez; if (d2 < 9 && d2 > 1e-4) { dx += ex / d2 * 1.5; dz += ez / d2 * 1.5; } }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const sp = u.speed * (u.zones.legs.int < 0.4 ? 0.6 : 1) * (1 - Math.min(0.8, u.stagger));
    u.vel.set(dx * sp, 0, dz * sp);
    u.pos.x += u.vel.x * dt; u.pos.z += u.vel.z * dt;
    u.yaw += angDiff(faceYaw(dx, dz), u.yaw) * Math.min(1, dt * 3);
    moving = true;
    if (u.st <= 0) { u.state = 'fire'; u.st = rnd(2.5, 4.5); u.burst = 0; }
  } else {
    u.vel.set(0, 0, 0);
    if (u.state === 'move') { u.state = 'fire'; u.st = rnd(2.5, 4.5); }
    if (u.st <= 0 && legs && !atGoal) { u.state = 'move'; u.st = rnd(6, 11); }
  }
  u.pos.y = terrainH(u.pos.x, u.pos.z);
  u.mv = lerp(u.mv, moving ? 1 : 0, dt * 4);
  if (tg) {
    const D = tg.pos.distanceTo(u.pos);
    const want = faceYaw(tg.pos.x - u.pos.x, tg.pos.z - u.pos.z);
    if (!moving) u.yaw += angDiff(want, u.yaw) * Math.min(1, dt * 2.5);
    u.aimYaw = want;
    u.pitch = Math.atan2((tg.pos.y + 1.4) - (u.pos.y + 1.75), D);
    if (u.state === 'fire' && D < 700 && u.stagger < 0.4) {
      if (u.cls === 'rocket' && u.rocketCool <= 0 && D < 460) {
        const org = new V3(); u.rig.pod.localToWorld(org.set(0, 0.1, -0.3));
        const tp = aimPoint(tg, _v2); tp.y -= 0.6;
        const dir = tp.sub(org).normalize(); dir.applyAxisAngle(_v3.set(-dir.z, 0, dir.x).normalize(), HOOK.rocketElev(D));
        dir.x += gauss() * 0.012; dir.y += gauss() * 0.008; dir.normalize();
        launchRocket(org, dir, 'r', false, u); u.rocketCool = rnd(9, 14);
      } else if (!u.zones.armR.broken && u.cool <= 0) {
        const wp = u.wp;
        if (u.burst <= 0) u.burst = Math.round(rnd(wp.burst[0], wp.burst[1]));
        const blind = u.zones.head.broken ? 5 : 1;
        npcShoot(u, tg, wp.spread * blind * (1 + D / 350) * (exposed(tg) ? 1 : 1.4), S.tracers && Math.random() < 0.5 ? 0x7dff86 : 0);
        u.burst--;
        u.cool = u.burst > 0 ? 60 / wp.rpm : rnd(wp.pause[0], wp.pause[1]);
      }
    }
  }
  if (u.kneel > 0) u.kneel = Math.min(1, u.kneel + dt * 2);
  u.stagger = Math.max(0, u.stagger - dt * 0.8);
}

/* ---------- анимация и вывод инстансов ---------- */
const SCORCH = new THREE.Color(0x231d18), _c = new THREE.Color(), DEADC = new THREE.Color(0x3a382f), VISOR_OFF = new THREE.Color(0x200505);
function poseHuman(u, dt) {
  const r = u.rig;
  if (u.alive) u.crouch = lerp(u.crouch, u.crouchT, Math.min(1, dt * 6));
  const c = u.crouch;
  r.hips.position.y = lerp(0.95, 0.5, c);
  r.thL.rotation.x = r.thR.rotation.x = 1.25 * c;
  r.snL.rotation.x = r.snR.rotation.x = -2.1 * c;
  u.kick *= Math.exp(-dt * 12);
  r.torso.rotation.x = -0.35 * c + u.pitch * 0.5 + u.kick * 0.08;
  r.head.rotation.x = u.pitch * 0.3;
  if (u.cls === 'rpg') { r.shR.rotation.set(2.4, 0, 0.2); r.faR.rotation.x = 1.2; r.shL.rotation.set(1.3, 0, -0.3); r.faL.rotation.x = 0.4; }
  else { r.shR.rotation.set(1.3 + u.pitch * 0.5, 0, 0); r.faR.rotation.x = 0.35; r.shL.rotation.set(1.45 + u.pitch * 0.5, 0, -0.35); r.faL.rotation.x = 0.2; }
  r.gun.rotation.x = u.pitch * 0.5 - c * 0.5 + u.kick * 0.05;
  if (!u.alive) {
    u.fall = Math.min(1, u.fall + dt * 1.5);
    const e = 1 - Math.pow(1 - u.fall, 3);
    r.root.rotation.set(e * 1.45, u.yaw, 0);
    r.root.position.set(u.pos.x, u.pos.y + 0.05 * e, u.pos.z);
    r.shR.rotation.x = lerp(r.shR.rotation.x, 2.6, e); r.shL.rotation.x = lerp(r.shL.rotation.x, 2.8, e);
  } else { r.root.rotation.set(0, u.yaw, 0); r.root.position.copy(u.pos); }
}
function poseRobot(u, dt) {
  const r = u.rig;
  if (u.alive) u.ph += dt * TAU * (u.speed / 2.0) * u.mv;
  const sw = Math.sin(u.ph) * 0.5 * u.mv, kn = u.kneel;
  r.thL.rotation.x = sw + kn * 1.35; r.thR.rotation.x = -sw + kn * 1.35;
  r.snL.rotation.x = -Math.max(0, Math.sin(u.ph + 1.3)) * 0.8 * u.mv - kn * 1.6;
  r.snR.rotation.x = -Math.max(0, Math.sin(u.ph + 1.3 + Math.PI)) * 0.8 * u.mv - kn * 1.6;
  r.hips.position.y = 1.15 - Math.abs(Math.cos(u.ph)) * 0.06 * u.mv - kn * 0.55;
  u.kick *= Math.exp(-dt * 12);
  const ty = clamp(angDiff(u.aimYaw, u.yaw), -0.9, 0.9);
  r.torso.rotation.set(-0.08 * u.mv + u.pitch * 0.4 + u.kick * 0.05, lerp(r.torso.rotation.y, ty, Math.min(1, dt * 5)), 0);
  r.shL.rotation.set(-sw * 0.6 + 0.15, 0, 0); r.faL.rotation.x = 0.35;
  if (u.zones.armR.broken) { r.shR.rotation.set(0.15, 0, 0.25); r.faR.rotation.x = 0.1; r.gun.rotation.set(1.2, 0, 0); }
  else { r.shR.rotation.set(1.35, 0, 0); r.faR.rotation.x = 0.25; r.gun.rotation.set(u.pitch * 0.6 + u.kick * 0.04, 0, 0); }
  u.staggerPh += dt * 13;
  if (!u.alive) {
    u.fall = Math.min(1, u.fall + dt * 1.1);
    const e = u.fall < 0.85 ? Math.pow(u.fall / 0.85, 2) : 1 - Math.sin((u.fall - 0.85) / 0.15 * Math.PI) * 0.04;
    r.root.rotation.set(-u.fallDir * e * 1.5, u.yaw, 0);
    r.root.position.set(u.pos.x, u.pos.y, u.pos.z);
  } else {
    r.root.rotation.set(0, u.yaw, Math.sin(u.staggerPh) * u.stagger * 0.12);
    r.root.position.copy(u.pos);
  }
}
function renderUnits(dt) {
  for (const k in PT) PT[k].n = 0;
  const flick = (SS.getSimT() * 17) % 1 > 0.5;
  for (const u of units) {
    if (u.team === 'h') poseHuman(u, dt); else poseRobot(u, dt);
    u.right.set(Math.cos(u.yaw), 0, -Math.sin(u.yaw));
    u.rig.root.updateMatrixWorld(true);
    for (const [obj, key, zone] of u.rig.parts) {
      const p = PT[key]; if (p.n >= p.max) continue;
      p.mesh.setMatrixAt(p.n, obj.matrixWorld);
      _c.copy(p.col);
      if (u.team === 'r') {
        const Z = u.zones[zone];
        if (key === 'r_visor') { if (!u.alive || Z.broken || (Z.hp < Z.max * 0.5 && flick)) _c.copy(VISOR_OFF); }
        else { _c.lerp(SCORCH, (1 - Z.int) * 0.75 + (Z.broken ? 0.25 : 0)); if (!u.alive) _c.lerp(SCORCH, 0.4); }
      } else if (!u.alive) _c.lerp(DEADC, 0.35);
      p.mesh.setColorAt(p.n, _c);
      p.n++;
    }
  }
  for (const k in PT) { const p = PT[k]; p.mesh.count = p.n; p.mesh.instanceMatrix.needsUpdate = true; p.mesh.instanceColor.needsUpdate = true; }
}

/* ================= ход боя ================= */
function clearBattle() {
  units.length = 0; smokers.length = 0; B.shells.length = 0;
  rockets.forEach((r) => scene.remove(r.mesh)); rockets.length = 0;
  craters.forEach((c) => scene.remove(c)); craters.length = 0;
  for (const k in PT) PT[k].mesh.count = 0;
  slots.front.forEach((s) => { s.used = false; }); slots.rear.forEach((s) => { s.used = false; });
}
function startBattle() {
  clearBattle();
  const N = S.teamN || 10;
  B.N = N; B.active = true; B.over = false; B.t = 0; B.mortarT = rnd(22, 30); B.rumbleT = 6; B.artLeft = N >= 15 ? 4 : 3;
  B.kills = 0; B.lost = 0; B.robotsKilled = 0; B.hitsR = 0; B.startShots = STATS.shots; B.deadT = 0; B.dmgA = 0; B.dirs = [];
  HOOK.battle = true; HOOK.over = false; HOOK.dead = false; HOOK.camRoll = 0; HOOK.camDY = 0;
  trenchGroup.visible = true; SS.setRangeVisible(false);
  // игрок — в центре первой траншеи
  const fs = slots.front.slice().sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x));
  const ps = fs[0]; ps.used = true;
  P.x = ps.pos.x; P.z = ps.pos.z + 0.3; P.yaw = 0; P.pitch = 0.01; P.stance = 0; P.eye = 1.62;
  PL.alive = true; PL.hp = 100; PL.pos.set(P.x, terrainH(P.x, P.z), P.z); PL.lastHit = -99;
  // свои бойцы
  const kinds = [];
  for (let i = 0; i < N - 1; i++) { const r = i % 7; kinds.push(r === 1 || r === 4 ? 'mg' : r === 3 ? 'rpg' : r === 6 ? 'sniper' : 'rifle'); }
  const order = fs.slice(1).concat(slots.rear.slice().sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x)));
  let oi = 0;
  kinds.forEach((k) => {
    // снайперы — во вторую траншею, остальные — ближе к центру первой
    let s;
    if (k === 'sniper') s = slots.rear.filter((q) => !q.used).sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x))[0];
    if (!s) { while (order[oi] && order[oi].used) oi++; s = order[oi]; }
    if (!s) return;
    s.used = true;
    const u = makeUnit('h', k, s.pos, s.yaw); u.slot = s;
  });
  // роботы
  const width = Math.max(40, N * 4.2);
  for (let i = 0; i < N; i++) {
    const r = i % 8;
    const cls = r === 2 || r === 6 ? 'heavy' : r === 4 ? 'rocket' : 'assault';
    const x = lerp(-width / 2, width / 2, (i + 0.5) / N) + gauss() * 3;
    const z = TRENCH.front - rnd(380, 520);
    const u = makeUnit('r', cls, new V3(x, terrainH(x, z), z), 0);
    u.lane = clamp(x * 0.8, -42, 42);
  }
  // снаряжение
  B.loadout = [];
  [S.rifle, WIDX('pkm'), WIDX('ak'), WIDX('rpg')].forEach((i) => { if (i >= 0 && B.loadout.indexOf(i) < 0) B.loadout.push(i); });
  B.wi = 0;
  RIFLES.forEach((r) => { TUR[r.id].ammo = r.mag; TUR[r.id].reserve = r.type === 'rocket' ? 5 : null; });
  ['bbar', 'hp', 'feed'].forEach((id) => { $(id).hidden = false; });
  $('feed').innerHTML = '';
  $('endScr').hidden = true;
  updateArtBtn();
  feed('Роботы наступают: ' + N + ' машин на ' + Math.round(-TRENCH.front + 450) + ' м. Держать окопы!', 'me');
  SS.updateWeaponUI();
}
function stopBattle() {
  clearBattle();
  B.active = false; HOOK.battle = false; HOOK.dead = false; HOOK.camRoll = 0; HOOK.camDY = 0;
  trenchGroup.visible = false;
  ['bbar', 'hp', 'feed', 'bArt'].forEach((id) => { $(id).hidden = true; });
  $('endScr').hidden = true; $('dmg').style.opacity = '0';
  RIFLES.forEach((r) => { TUR[r.id].reserve = null; });
  P.x = 0; P.z = 0.6; P.yaw = 0;
}
function endBattle(win, why) {
  if (B.over) return;
  B.over = true; HOOK.over = true;
  const shots = STATS.shots - B.startShots;
  const mm = Math.floor(B.t / 60), ss = Math.round(B.t % 60);
  $('endE').textContent = win ? 'Позиция удержана' : 'Бой проигран';
  $('endT').textContent = win ? 'Победа' : why;
  $('endP').innerHTML = 'Длительность: ' + mm + ' мин ' + ss + ' с<br>Роботов уничтожено: ' + B.robotsKilled + ' из ' + B.N + ' (вами — ' + B.kills + ')<br>' +
    'Потери: ' + B.lost + ' из ' + (B.N - 1) + ' бойцов<br>Ваши выстрелы: ' + shots + ', попаданий по роботам: ' + B.hitsR + (shots ? ' (' + Math.round(B.hitsR / shots * 100) + '%)' : '');
  setTimeout(() => { $('endScr').hidden = false; try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } }, win ? 1500 : 300);
}
$('endAgain').addEventListener('click', () => { $('endScr').hidden = true; startBattle(); SS.setAim('hip'); });
$('endMenu').addEventListener('click', () => { $('endScr').hidden = true; SS.openMenu(); });

HOOK.startBattle = startBattle;
HOOK._dbg = { units, B, PL, explode };
HOOK.stopBattle = stopBattle;
HOOK.nextWeapon = function () {
  if (!B.active) { SS.selectRifle(S.rifle + 1); return; }
  B.wi = (B.loadout.indexOf(S.rifle) + 1) % B.loadout.length;
  SS.selectRifle(B.loadout[B.wi]);
};
HOOK.aimUI = function (m) { $('bArt').hidden = !(B.active && m === 'bino'); };
HOOK.move = function () {
  if (!B.active) return;
  // не даём уйти дальше 150 м за бруствер, чтобы не потеряться
  P.z = clamp(P.z, TRENCH.front - 150, 40);
};

HOOK.update = function (dt, sdt) {
  updateRockets(sdt);
  if (!B.active) { if (units.length) renderUnits(dt); return; }
  if (!$('menu').hidden) { renderUnits(0); return; }
  B.t += dt;
  // игрок как цель
  const gy = terrainH(P.x, P.z);
  PL.vel.set((P.x - PL.pos.x) / Math.max(dt, 1e-3), 0, (P.z - PL.pos.z) / Math.max(dt, 1e-3));
  PL.pos.set(P.x, gy, P.z);
  PL.right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  if (!B.over) {
    for (const u of units) {
      if (!u.alive) continue;
      if (u.team === 'h') updateHuman(u, sdt); else updateRobot(u, sdt);
    }
    updateShells(sdt);
    // миномёты роботов
    B.mortarT -= sdt;
    if (B.mortarT <= 0) {
      const tgts = units.filter((u) => u.team === 'h' && u.alive); if (PL.alive) tgts.push(PL, PL);
      const t = tgts[Math.floor(Math.random() * tgts.length)];
      if (t) callArtillery(t.pos, Math.round(rnd(2, 4)), 20, 'r', 0.2);
      B.mortarT = Math.max(13, 38 - B.N) + rnd(0, 10);
    }
    // далёкий гул боя
    B.rumbleT -= dt;
    if (B.rumbleT <= 0) { B.rumbleT = rnd(7, 16); const AC = SS.getAC(); if (AC) SS.noiseHit(AC.currentTime, 2.5, 'lowpass', 120, 0.18); }
    // регенерация игрока
    if (PL.alive && B.t - PL.lastHit > 6 && PL.hp < 100) PL.hp = Math.min(100, PL.hp + dt * 3);
    // итоги
    const rAlive = units.some((u) => u.team === 'r' && u.alive);
    if (!rAlive) endBattle(true);
  }
  // смерть игрока
  if (!PL.alive) {
    B.deadT += dt;
    HOOK.camRoll = lerp(HOOK.camRoll || 0, 0.7, Math.min(1, dt * 2));
    HOOK.camDY = lerp(HOOK.camDY || 0, -(P.eye - 0.25), Math.min(1, dt * 2));
    if (B.deadT > 2.5) endBattle(false, 'Вы погибли');
  }
  // дым от подбитых роботов
  for (let i = smokers.length - 1; i >= 0; i--) {
    const s = smokers[i]; s.t -= dt; s.acc += dt;
    if (s.t <= 0) { smokers.splice(i, 1); continue; }
    if (s.acc > (s.big ? 0.22 : 0.45)) { s.acc = 0; SS.spawnPuff(zonePoint(s.u, s.zone), s.big ? 0x2b2926 : 0x4a4744, s.big ? 1.6 : 0.7, s.big ? 5 : 3, 1, s.big ? 1.6 : 0.9, 0.1); if (s.big && Math.random() < 0.2) sparks(zonePoint(s.u, s.zone), 2, 0.25); }
  }
  renderUnits(dt);
  // HUD
  B.dmgA = Math.max(0, B.dmgA - dt * 0.6);
  const low = PL.alive && PL.hp < 35 ? 0.25 + 0.15 * Math.sin(B.t * 6) : 0;
  $('dmg').style.opacity = Math.min(1, B.dmgA + low).toFixed(3);
  B.dirs = B.dirs.filter((d) => (d.t -= dt) > 0);
  B.hudT -= dt;
  if (B.hudT <= 0) {
    B.hudT = 0.2;
    $('bH').textContent = units.filter((u) => u.team === 'h' && u.alive).length + (PL.alive ? 1 : 0);
    $('bR').textContent = units.filter((u) => u.team === 'r' && u.alive).length;
    $('hpFill').style.transform = 'scaleX(' + (Math.max(0, PL.hp) / 100).toFixed(3) + ')';
    $('hpFill').style.background = PL.hp < 35 ? '#ff7a5c' : PL.hp < 65 ? '#f2c94c' : '#9fdc7a';
    $('hpTxt').textContent = Math.max(0, Math.round(PL.hp));
    updateArtBtn();
  }
};
HOOK.drawOverlay = function (o, W, H, D) {
  if (!B.active) return;
  // индикатор направления огня по вам
  const R = Math.min(W, H) * 0.32;
  for (const d of B.dirs) {
    const a = d.a - Math.PI / 2;
    o.strokeStyle = 'rgba(255,60,40,' + Math.min(1, d.t).toFixed(2) + ')'; o.lineWidth = 6 * D;
    o.beginPath(); o.arc(W / 2, H / 2, R, a - 0.25, a + 0.25); o.stroke();
  }
};
})();
