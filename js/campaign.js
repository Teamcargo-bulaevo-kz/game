/* Кампания «Степной фронт»: миссии с брифингом, погодой, расстановками и подкреплениями. Прогресс — в localStorage. */
(function () {
'use strict';
const SS = window.SS, S = SS.S, $ = (id) => document.getElementById(id);
const KEY = 'stepCampaign';
const MISSIONS = [
  { title: 'Высота 112', brief: 'Рассвет. Разведка докладывает: группа боевых роботов идёт к высоте 112 со стороны дальних холмов. Взвод отдыхает в лагере за высотой. По тревоге — занять траншеи и удержать высоту. Через пару минут из-за холмов выйдет вторая волна.',
    cfg: { scen: 'def', foe: 'bot', nH: 18, nR: 6, weather: 'clear' },
    events: [{ t: 150, type: 'reinf', team: 'r', n: 4, msg: 'Вторая волна вышла из-за холмов' }] },
  { title: 'Ночная тревога', brief: 'Ночь. Роботы пытаются взять высоту в темноте. Ближе к полуночи небо затянет — станет кромешно темно. ПНВ, осветительные ракеты, лазер. Под утро с юга подойдёт подкрепление.',
    cfg: { scen: 'def', foe: 'bot', nH: 22, nR: 7, weather: 'night' },
    events: [{ t: 110, type: 'weather', to: 'dark', msg: 'Небо затянуло — кромешная тьма' }, { t: 150, type: 'reinf', team: 'h', n: 8, msg: 'Свои с юга — держитесь!' }, { t: 230, type: 'reinf', team: 'r', n: 3 }] },
  { title: 'Переправа', brief: 'Туман над рекой. Взвод держит южный берег у брода. Серые попытаются форсировать реку. Не дать переправиться: держите рубеж, бейте на воде, когда противник замедлится.',
    cfg: { scen: 'wall', map: 'crossing', foe: 'man', nH: 20, nR: 24, weather: 'fog' },
    events: [{ t: 110, type: 'reinf', team: 'r', n: 8, msg: 'Противник подтянул резерв к броду' }, { low: 0.45, lowTeam: 'h', type: 'reinf', team: 'h', n: 8, msg: 'Резерв батальона на подходе' }] },
  { title: 'Десант', brief: 'Дождь. Роботы закрепились на высоте 112. Ваш взвод высаживается в 500 м после артподготовки, под дымовой стеной. Второй эшелон подойдёт позже — не ждите его, давите огнём и обходите.',
    cfg: { scen: 'att', foe: 'bot', nH: 26, nR: 7, weather: 'rain' },
    events: [{ t: 140, type: 'reinf', team: 'h', n: 8, msg: 'Второй эшелон вышел к ЛЗ' }] },
  { title: 'Курганы', brief: 'Пасмурно. Встречный бой в открытой степи у курганов. Курганы и камни — главная опора: занимайте их раньше противника, держите фланги.',
    cfg: { scen: 'wall', map: 'kurgans', foe: 'man', nH: 34, nR: 26, weather: 'cloudy' },
    events: [{ t: 150, type: 'reinf', team: 'h', n: 6 }, { t: 170, type: 'reinf', team: 'r', n: 6 }] },
  { title: 'Лесополоса', brief: 'Закат. Роботы прорвались к дальней лесополосе. Выбить их, пока не стемнело, — темнеет быстро. Деревья держат пули: двигайтесь от ствола к стволу.',
    cfg: { scen: 'wall', map: 'forest', foe: 'bot', nH: 36, nR: 7, weather: 'dusk' },
    events: [{ t: 170, type: 'weather', to: 'night', msg: 'Стемнело' }, { t: 200, type: 'reinf', team: 'r', n: 3, msg: 'Роботы подтянули резерв' }, { t: 120, type: 'reinf', team: 'h', n: 8, msg: 'Соседний взвод заходит с фланга' }] },
  { title: 'Последний рубеж', brief: 'Кромешная ночь. Главные силы роботов идут на высоту 112. Держаться до подхода батальона. Будет тяжело.',
    cfg: { scen: 'def', foe: 'bot', nH: 40, nR: 16, weather: 'dark' },
    events: [{ t: 100, type: 'reinf', team: 'r', n: 6, msg: 'Ещё одна волна роботов' }, { t: 220, type: 'reinf', team: 'r', n: 6 }, { t: 270, type: 'reinf', team: 'h', n: 12, msg: 'Батальон подошёл! Контратака!' }],
    outro: 'Высота устояла. На рассвете батальон погнал роботов на север. В брошенном корпусе нашли карту: машинами управляет узел связи в степи, и охраняют его люди в сером.' },
  { title: 'Узел связи', brief: 'Глава II. Пленный рассказал о сети антенн, через которую серые управляют роботами. Шесть позиций (А–Е) держат роботы-охранники. Захватите и держите точки, пока их билеты не кончатся.',
    cfg: { scen: 'points', foe: 'bot', nH: 36, nR: 8, weather: 'cloudy' },
    events: [{ t: 160, type: 'reinf', team: 'r', n: 4, msg: 'Роботы перебрасывают резерв к антеннам' }],
    outro: 'Антенны молчат, роботы в округе встали. Но серые уже знают, где мы, и стягивают пехоту.' },
  { title: 'Контрудар', brief: 'Глава II. Серые пошли в контратаку, чтобы вернуть узел связи. Это пехота, такая же, как мы: работает от укрытий и обходит. Удержите большинство точек.',
    cfg: { scen: 'points', foe: 'man', nH: 34, nR: 38, weather: 'rain' },
    events: [{ t: 120, type: 'reinf', team: 'r', n: 8, msg: 'Подошла рота серых' }, { low: 0.5, lowTeam: 'h', type: 'reinf', team: 'h', n: 10, msg: 'Соседи прислали взвод' }],
    outro: 'Контрудар отбит. Среди убитых нашли офицера: при нём приказ собрать силы у бывшего совхоза за рекой.' },
  { title: 'Ночной рейд', brief: 'Глава III. Ночь, луны нет. Небольшая группа скрытно выходит к позициям серых за рекой. Держитесь дальше от огня и стреляйте первыми. ПНВ и лазер вам в помощь.',
    cfg: { scen: 'wall', map: 'crossing', foe: 'man', nH: 16, nR: 22, weather: 'dark' },
    events: [{ t: 140, type: 'reinf', team: 'r', n: 6, msg: 'У серых тревога, поднимают резерв' }],
    outro: 'Склад серых горит. Теперь главное: их штаб в степи, на шести укреплённых точках.' },
  { title: 'Степной штаб', brief: 'Глава III. Решающий бой. Штаб серых: шесть точек, люди и роботы вместе. Батальон атакует всеми силами. Берите точки, тащите раненых к санитарам, не давайте себя прижать огнём.',
    cfg: { scen: 'points', foe: 'man', nH: 48, nR: 52, weather: 'dusk' },
    events: [{ t: 150, type: 'weather', to: 'night', msg: 'Стемнело: бой идёт в темноте' }, { t: 140, type: 'reinf', team: 'r', n: 10, msg: 'Серые бросили в бой последний резерв' }, { t: 200, type: 'reinf', team: 'h', n: 12, msg: 'Второй батальон вступил в бой!' }],
    outro: 'Штаб взят. Степь затихла: роботы стоят, серые сдаются. Война здесь закончилась. Спасибо, снайпер.' },
];
function prog() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{"done":0}');
    return { done: Math.max(0, Math.min(MISSIONS.length, Math.floor(Number(p && p.done) || 0))) };
  } catch (e) { return { done: 0 }; }
}
function setProg(p) {
  try { localStorage.setItem(KEY, JSON.stringify({ done: Math.max(0, Math.min(MISSIONS.length, Math.floor(Number(p.done) || 0))) })); }
  catch (e) { /* хранилище может быть недоступно */ }
}
function activeIndex() {
  const i = S.campaign;
  return Number.isInteger(i) && i >= 0 && i < MISSIONS.length ? i : null;
}
function persistSettings() {
  try { localStorage.setItem('stepSniper', JSON.stringify(S)); } catch (e) { /* хранилище может быть недоступно */ }
}
function launch(i) {
  const p = prog();
  if (!Number.isInteger(i) || i < 0 || i >= MISSIONS.length || i > p.done) return;
  const m = MISSIONS[i];
  Object.assign(S, m.cfg, { gmode: 'battle', side: 'h', campaign: i, autostart: true, map: m.cfg.map || 'field' });
  persistSettings();
  location.reload();
}
let sel = null;
function render() {
  const box = $('mCamp'); if (!box) return;
  const p = prog(); while (box.firstChild) box.removeChild(box.firstChild);
  MISSIONS.forEach((m, i) => {
    const b = document.createElement('button'); b.type = 'button';
    const open = i <= p.done, done = i < p.done;
    b.className = 'chip' + (sel === i ? ' on' : '') + (open ? '' : ' lock');
    b.textContent = (done ? '✔ ' : open ? '' : '🔒 ') + (i + 1) + '. ' + m.title;
    b.disabled = !open;
    b.addEventListener('click', () => { sel = i; render(); });
    box.appendChild(b);
  });
  const note = $('mCampNote'); if (!note) return;
  while (note.firstChild) note.removeChild(note.firstChild);
  if (sel != null && sel <= p.done && MISSIONS[sel]) {
    const m = MISSIONS[sel], heading = document.createElement('b');
    heading.textContent = (sel + 1) + '. ' + m.title;
    note.appendChild(heading); note.appendChild(document.createTextNode(' — ' + m.brief));
    const go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.style.marginTop = '8px'; go.textContent = 'Начать миссию';
    go.addEventListener('click', () => launch(sel)); note.appendChild(document.createElement('br')); note.appendChild(go);
  } else {
    const i = activeIndex();
    note.textContent = i != null
      ? 'Сейчас: миссия ' + (i + 1) + ' «' + MISSIONS[i].title + '». Чтобы играть свободный бой, измените режим, сценарий, сторону или расстановку ниже.'
      : 'Пройдено миссий: ' + p.done + ' из ' + MISSIONS.length + '. Выберите миссию.';
  }
}
// Выбор свободного режима/сценария/стороны/расстановки отключает режим кампании.
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target && typeof target.closest === 'function' &&
      target.closest('#mGmode,#mScen,#mFoe,#mSide,#mMap') && activeIndex() != null) {
    S.campaign = null; persistSettings(); render();
  }
}, true);
window.CAMPAIGN = {
  missions: MISSIONS,
  current() { const i = activeIndex(); return i == null ? null : MISSIONS[i]; },
  onEnd(win) {
    const i = activeIndex(); if (i == null) return;
    const p = prog();
    if (win && i + 1 > p.done) { p.done = i + 1; setProg(p); }
    const nx = $('endNext');
    if (nx) { nx.hidden = !(win && i + 1 < MISSIONS.length); nx.textContent = 'Миссия ' + (i + 2) + ' →'; }
    const ep = $('endP');
    if (ep && win && MISSIONS[i].outro) { const q = document.createElement('div'); q.className = 'outro'; q.textContent = MISSIONS[i].outro; ep.appendChild(q); }
    render();
  },
};
const nx = $('endNext');
if (nx) nx.addEventListener('click', () => { const i = activeIndex(); if (i != null) launch(i + 1); });
if (S.campaign != null && activeIndex() == null) { S.campaign = null; persistSettings(); }
render();
})();
