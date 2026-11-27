/* Раскладка кнопок: пресеты «2 пальца» и «4 пальца», перетаскивание, размер, прозрачность. Хранится в localStorage. */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const IDS = ['bFire', 'bFireL', 'bScope', 'bScopeL', 'bBino', 'bBreath', 'bCrouch', 'bProne', 'bReload', 'bArt', 'bJump', 'bMore', 'bMed', 'bUse', 'bGren', 'bLeanL', 'bLeanR', 'joy'];
const NAMES = { bFire: 'Огонь', bFireL: 'Огонь (левый)', bScope: 'Прицел', bScopeL: 'Прицел (левый)', bBino: 'Бинокль', bBreath: 'Дыхание', bCrouch: 'Сидя', bProne: 'Лёжа', bReload: 'Перезарядка', bArt: 'Артиллерия', bJump: 'Прыжок', bMore: 'Ещё (ПНВ, лазер, наклоны, команды)', bMed: 'Аптечка', bUse: 'За пулемёт/миномёт/ящик', bGren: 'Граната (удерживать)', bLeanL: 'Наклон влево', bLeanR: 'Наклон вправо', joy: 'Джойстик' };
// центр кнопки — доля ширины/высоты экрана, s — диаметр в px, v — видимость
// эталонный экран 851×393: справа — огонь и стойки, слева по краю — огонь (левый) с наклонами,
// левая нижняя четверть — плавающий джойстик, верхние углы свободны под обзор
const BASE = {
  bFire: { x: 0.889, y: 0.72, s: 76, v: 1 }, bBreath: { x: 0.803, y: 0.735, s: 46, v: 1 }, bUse: { x: 0.731, y: 0.636, s: 46, v: 1 },
  bScope: { x: 0.958, y: 0.5, s: 50, v: 1 }, bGren: { x: 0.875, y: 0.52, s: 40, v: 1 }, bMed: { x: 0.815, y: 0.56, s: 38, v: 1 },
  bArt: { x: 0.958, y: 0.37, s: 38, v: 1 }, bMore: { x: 0.961, y: 0.235, s: 36, v: 1 }, bBino: { x: 0.961, y: 0.636, s: 40, v: 1 },
  bJump: { x: 0.77, y: 0.935, s: 38, v: 1 }, bReload: { x: 0.823, y: 0.935, s: 38, v: 1 }, bCrouch: { x: 0.876, y: 0.935, s: 38, v: 1 }, bProne: { x: 0.929, y: 0.935, s: 38, v: 1 },
  bFireL: { x: 0.092, y: 0.522, s: 50, v: 1 }, bLeanL: { x: 0.031, y: 0.522, s: 34, v: 1 }, bLeanR: { x: 0.153, y: 0.522, s: 34, v: 1 }, bScopeL: { x: 0.209, y: 0.522, s: 40, v: 1 },
  joy: { x: 0.141, y: 0.81, s: 96, v: 1 },
};
const PRESETS = {
  two: Object.assign(JSON.parse(JSON.stringify(BASE)), { bFireL: { x: 0.092, y: 0.522, s: 50, v: 0 }, bScopeL: { x: 0.209, y: 0.522, s: 40, v: 0 } }),
  four: JSON.parse(JSON.stringify(BASE)),
};
const touch = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || ('ontouchstart' in window);
let L = null, alpha = 0.7;
function load() {
  try { const r = JSON.parse(localStorage.getItem('stepSniperHud') || 'null'); if (r && r.layout && r.v === 11) { L = r.layout; alpha = r.alpha || 0.7; } } catch (e) { /* нет хранилища */ }
  if (!L) L = JSON.parse(JSON.stringify(touch ? PRESETS.four : PRESETS.two));
  IDS.forEach((id) => { if (!L[id]) L[id] = JSON.parse(JSON.stringify(PRESETS.four[id])); });
}
function save() { try { localStorage.setItem('stepSniperHud', JSON.stringify({ layout: L, alpha, v: 11 })); } catch (e) { /* ignore */ } }
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
