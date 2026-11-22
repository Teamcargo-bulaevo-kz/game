/* Раскладка кнопок: пресеты «2 пальца» и «4 пальца», перетаскивание, размер, прозрачность. Хранится в localStorage. */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const IDS = ['bFire', 'bFireL', 'bScope', 'bScopeL', 'bBino', 'bBreath', 'bCrouch', 'bProne', 'bReload', 'bArt', 'bJump', 'bRun', 'bVision', 'bSquad', 'bMed', 'bUse', 'bLeanL', 'bLeanR', 'bGren', 'joy'];
const NAMES = { bFire: 'Огонь', bFireL: 'Огонь (левый)', bScope: 'Прицел', bScopeL: 'Прицел (левый)', bBino: 'Бинокль', bBreath: 'Дыхание', bCrouch: 'Сидя', bProne: 'Лёжа', bReload: 'Перезарядка', bArt: 'Артиллерия', bJump: 'Прыжок', bRun: 'Бег', bVision: 'ПНВ/тепловизор', bSquad: 'Команды тройке', bMed: 'Аптечка', bUse: 'За пулемёт/миномёт', bLeanL: 'Наклон влево', bLeanR: 'Наклон вправо', bGren: 'Граната', joy: 'Джойстик' };
// центр кнопки — доля ширины/высоты экрана, s — диаметр в px, v — видимость
const PRESETS = {
  two: {
    bFire: { x: 0.9, y: 0.66, s: 86, v: 1 }, bScope: { x: 0.775, y: 0.6, s: 66, v: 1 }, bBino: { x: 0.94, y: 0.38, s: 58, v: 1 },
    bBreath: { x: 0.775, y: 0.38, s: 60, v: 1 }, bCrouch: { x: 0.865, y: 0.9, s: 56, v: 1 }, bProne: { x: 0.94, y: 0.9, s: 56, v: 1 },
    bReload: { x: 0.79, y: 0.9, s: 56, v: 1 }, bArt: { x: 0.83, y: 0.38, s: 54, v: 1 }, bFireL: { x: 0.07, y: 0.5, s: 60, v: 1 }, bScopeL: { x: 0.2, y: 0.42, s: 56, v: 0 },
    bJump: { x: 0.715, y: 0.91, s: 52, v: 1 }, bRun: { x: 0.28, y: 0.86, s: 50, v: 1 }, bVision: { x: 0.72, y: 0.38, s: 48, v: 1 },
    bSquad: { x: 0.695, y: 0.08, s: 44, v: 1 }, bMed: { x: 0.755, y: 0.08, s: 44, v: 1 }, bUse: { x: 0.68, y: 0.62, s: 56, v: 1 }, bLeanL: { x: 0.735, y: 0.58, s: 42, v: 1 }, bLeanR: { x: 0.735, y: 0.74, s: 42, v: 1 }, bGren: { x: 0.64, y: 0.91, s: 46, v: 1 },
    joy: { x: 0.14, y: 0.72, s: 140, v: 1 },
  },
  four: {
    bFire: { x: 0.885, y: 0.7, s: 94, v: 1 }, bScope: { x: 0.955, y: 0.43, s: 62, v: 1 }, bBino: { x: 0.955, y: 0.2, s: 52, v: 1 },
    bBreath: { x: 0.775, y: 0.69, s: 56, v: 1 }, bCrouch: { x: 0.865, y: 0.92, s: 52, v: 1 }, bProne: { x: 0.94, y: 0.92, s: 52, v: 1 },
    bReload: { x: 0.79, y: 0.92, s: 52, v: 1 }, bArt: { x: 0.86, y: 0.2, s: 50, v: 1 }, bFireL: { x: 0.065, y: 0.5, s: 66, v: 1 }, bScopeL: { x: 0.2, y: 0.42, s: 58, v: 1 },
    bJump: { x: 0.715, y: 0.92, s: 50, v: 1 }, bRun: { x: 0.28, y: 0.86, s: 52, v: 1 }, bVision: { x: 0.76, y: 0.2, s: 46, v: 1 },
    bSquad: { x: 0.695, y: 0.08, s: 44, v: 1 }, bMed: { x: 0.755, y: 0.08, s: 44, v: 1 }, bUse: { x: 0.67, y: 0.62, s: 56, v: 1 }, bLeanL: { x: 0.8, y: 0.45, s: 44, v: 1 }, bLeanR: { x: 0.875, y: 0.44, s: 44, v: 1 }, bGren: { x: 0.64, y: 0.92, s: 46, v: 1 },
    joy: { x: 0.15, y: 0.75, s: 140, v: 1 },
  },
};
const touch = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || ('ontouchstart' in window);
let L = null, alpha = 1;
function load() {
  try { const r = JSON.parse(localStorage.getItem('stepSniperHud') || 'null'); if (r && r.layout && r.v === 6) { L = r.layout; alpha = r.alpha || 1; } } catch (e) { /* нет хранилища */ }
  if (!L) L = JSON.parse(JSON.stringify(touch ? PRESETS.four : PRESETS.two));
  IDS.forEach((id) => { if (!L[id]) L[id] = JSON.parse(JSON.stringify(PRESETS.four[id])); });
}
function save() { try { localStorage.setItem('stepSniperHud', JSON.stringify({ layout: L, alpha, v: 6 })); } catch (e) { /* ignore */ } }
function apply() {
  const W = innerWidth, H = innerHeight;
  IDS.forEach((id) => {
    const el = $(id); if (!el) return;
    const c = L[id];
    const s = c.s;
    el.style.width = s + 'px'; el.style.height = s + 'px';
    el.style.left = Math.round(c.x * W - s / 2) + 'px'; el.style.top = Math.round(c.y * H - s / 2) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.opacity = id === 'joy' ? '' : String(alpha);
    el.classList.toggle('lay-off', !c.v);
    if (id !== 'joy') { const ic = el.querySelector('svg'); if (ic) { const k = Math.round(s * 0.38); ic.style.width = k + 'px'; ic.style.height = k + 'px'; } }
  });
  if (!touch) { $('joy').classList.add('lay-off'); }
}
/* ---------- редактор ---------- */
let editing = false, sel = null, drag = null, onDone = null;
const bar = document.createElement('div');
bar.id = 'hudEd';
bar.innerHTML = '<div class="hn" id="hudSel">Нажмите на кнопку, чтобы выбрать, и тяните</div>' +
  '<div class="hb"><button type="button" data-a="two">2 пальца</button><button type="button" data-a="four">4 пальца</button>' +
  '<button type="button" data-a="sm">Размер −</button><button type="button" data-a="lg">Размер +</button>' +
  '<button type="button" data-a="vis">Скрыть/показать</button><button type="button" data-a="am">Прозр. −</button><button type="button" data-a="ap">Прозр. +</button>' +
  '<button type="button" data-a="done" class="ok">Готово</button></div>';
bar.hidden = true;
document.body.appendChild(bar);
const pick = document.createElement('div'); pick.id = 'hudPick'; pick.hidden = true; document.body.appendChild(pick);
function hit(x, y) {
  let best = null, bd = Infinity;
  IDS.forEach((id) => {
    const el = $(id); if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(x - cx, y - cy);
    if (d < r.width / 2 + 14 && d < bd) { bd = d; best = id; }
  });
  return best;
}
function select(id) {
  sel = id;
  IDS.forEach((k) => { const el = $(k); if (el) el.classList.toggle('lay-sel', k === id); });
  $('hudSel').textContent = id ? NAMES[id] + ' · ' + L[id].s + ' px' + (L[id].v ? '' : ' · скрыта') : 'Нажмите на кнопку, чтобы выбрать, и тяните';
}
pick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const id = hit(e.clientX, e.clientY);
  select(id);
  if (id) { drag = { id, pid: e.pointerId, dx: e.clientX - L[id].x * innerWidth, dy: e.clientY - L[id].y * innerHeight }; try { pick.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
});
pick.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  const c = L[drag.id];
  c.x = Math.min(0.98, Math.max(0.02, (e.clientX - drag.dx) / innerWidth));
  c.y = Math.min(0.98, Math.max(0.05, (e.clientY - drag.dy) / innerHeight));
  apply();
});
const end = () => { drag = null; };
pick.addEventListener('pointerup', end); pick.addEventListener('pointercancel', end);
bar.addEventListener('click', (e) => {
  const a = e.target && e.target.dataset ? e.target.dataset.a : null;
  if (!a) return;
  if (a === 'two' || a === 'four') { L = JSON.parse(JSON.stringify(PRESETS[a])); }
  else if (a === 'sm' && sel) L[sel].s = Math.max(40, L[sel].s - 6);
  else if (a === 'lg' && sel) L[sel].s = Math.min(sel === 'joy' ? 220 : 130, L[sel].s + 6);
  else if (a === 'vis' && sel) L[sel].v = L[sel].v ? 0 : 1;
  else if (a === 'am') alpha = Math.max(0.3, Math.round((alpha - 0.1) * 10) / 10);
  else if (a === 'ap') alpha = Math.min(1, Math.round((alpha + 0.1) * 10) / 10);
  else if (a === 'done') { stop(); return; }
  apply(); select(sel);
});
function edit(cb) {
  editing = true; onDone = cb || null;
  document.body.classList.add('editing');
  bar.hidden = false; pick.hidden = false;
  apply(); select(null);
}
function stop() {
  editing = false;
  document.body.classList.remove('editing');
  bar.hidden = true; pick.hidden = true; select(null);
  save(); apply();
  if (onDone) onDone();
}
load();
apply();
window.addEventListener('resize', () => setTimeout(apply, 60));
window.HUD = { apply, edit, get layout() { return L; } };
})();
