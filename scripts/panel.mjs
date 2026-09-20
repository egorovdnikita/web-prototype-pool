/* Сквозная проверка панели сценариев — то же, что sweep для экранов, только
   панель написана на React, и в узле её надо сначала собрать. Тестовый стек
   для этого не нужен: Vite умеет транспилировать TSX для Node
   (`ssrLoadModule`), а панели из всего приложения нужен один контекст —
   роутер и браузер не нужны совсем.

   Проверяем каждую вкладку в разных состояниях: что ничего не падает,
   что в списке лежат все оси, экраны и модалки, что фильтры и поиск режут
   именно то, что должны, и что каждый data-атрибут разметки кто-то
   обрабатывает.

   Запуск: npm run panel */
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';

const P = new URL('../', import.meta.url).pathname;
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { ScenarioPanel } = await vite.ssrLoadModule('/src/components/ScenarioPanel.tsx');
const { AppCtx } = await vite.ssrLoadModule('/src/state/store.tsx');
const proto = await vite.ssrLoadModule('/src/legacy/prototype.js');
const { AXES, DEF, AX_STYLE, AX_OWN, PRESETS, TITLES, MODALS } = proto;

const store = fs.readFileSync(P + 'src/state/store.tsx', 'utf8');
const keys = Object.keys(AXES);
const prod = keys.filter((k) => !AX_STYLE.has(k));

/* Подставное состояние: то же, что собирает freshUi, но без браузера */
const ui = (extra = {}) => ({
  seg: {}, sort: {}, page: {}, per: {}, sel: new Set(), osel: new Set(), ochk: new Set(),
  phide: new Set(), nch: {}, sel2: new Set(), consent: new Set(), wtag: new Set(), wgrp: new Set(),
  ftag: new Set(), fmod: new Set(), gsel: new Set(), tsel: new Set(), togs: {}, dsel: {},
  scgrp: [], saved: [], sctab: 'ax', scpin: [], schist: [], scw: 420, scside: 'right',
  ...extra,
});

const ctx = (S, U, extra = {}) => ({
  S, U, route: 'home', pop: null, modal: null, openGroups: {}, mini: false,
  panel: true, toasts: [], onClick() {}, onInput() {}, toast() {}, go() {}, patchUi() {},
  snapshot: { S, U, route: 'home', pop: null, modal: null, openGroups: {}, mini: false },
  ...extra,
});

const draw = (S, U, extra) =>
  renderToStaticMarkup(h(AppCtx.Provider, { value: ctx(S, U, extra) }, h(ScenarioPanel, null)));

let renders = 0;
const fail = (msg) => { console.error('панель: ' + msg); process.exit(1); };
const run = (name, S, U, extra, check) => {
  let html;
  try { html = draw(S, U, extra) } catch (e) { fail(`${name} — падение: ${e.message}`) }
  renders++;
  const err = check && check(html);
  if (err) fail(`${name} — ${err}`);
  return html;
};

/* 1. Вкладки в состоянии по умолчанию */
const all = {};
for (const tab of ['ax', 'sty', 'sets', 'go']) {
  all[tab] = run(`вкладка ${tab}`, { ...DEF }, ui({ sctab: tab }), {}, (html) =>
    html.includes('Сценарии') ? null : 'нет заголовка');
}
/* 2. В списке осей — все оси продукта и ни одной оси оформления */
for (const k of prod) {
  if (!all.ax.includes(`data-axis="${k}"`)) fail(`ось ${k} не попала в список`);
}
for (const k of AX_STYLE) {
  if (all.ax.includes(`data-axis="${k}"`)) fail(`ось оформления ${k} видна в списке осей`);
  if (!all.sty.includes(`data-axis="${k}"`) && k !== 'accent' && k !== 'font' && k !== 'icons')
    fail(`ось оформления ${k} не попала на вкладку «Стиль»`);
}
/* 3. Значений столько же, сколько в описании осей */
const optsOf = (html, k) =>
  [...html.matchAll(new RegExp(`data-axis="${k}" data-val="([^"]*)"`, 'g'))].map((m) => m[1]);
for (const k of prod) {
  const got = optsOf(all.ax, k), want = AXES[k].opts.map(([v]) => v);
  if (got.join() !== want.join()) fail(`у оси ${k} значения ${got.join('/')} вместо ${want.join('/')}`);
}
/* 4. Переходы: все экраны и все модалки */
for (const id of Object.keys(TITLES)) {
  if (!all.go.includes(`data-go="${id}"`)) fail(`экран ${id} не попал в «Переходы»`);
}
for (const k of Object.keys(MODALS)) {
  if (!all.go.includes(`data-modal="${k}"`)) fail(`модалка ${k} не попала в «Переходы»`);
}
/* 5. Наборы: все связки на месте */
for (const [name] of PRESETS) {
  if (!all.sets.includes(`data-preset="${name}"`)) fail(`связка «${name}» не попала в «Наборы»`);
}

/* 6. Фильтры и поиск режут то, что должны */
const changed = { ...DEF, data: 'empty', health: 'critical' };
run('фильтр «Изменённые»', changed, ui({ scdirty: true }), {}, (html) => {
  const n = [...html.matchAll(/class="scg [^"]*dirty/g)].length;
  return n === 2 ? null : `показано ${n} осей вместо двух`;
});
run('фильтр «★»', { ...DEF }, ui({ sconly: true, scpin: ['coin'] }), {}, (html) => {
  const n = new Set([...html.matchAll(/data-axis="([a-z0-9]+)"/g)].map((m) => m[1])).size;
  return n === 1 ? null : `показано ${n} осей вместо одной`;
});
run('фильтр «Из макетов»', { ...DEF }, ui({ scfig: true }), {}, (html) =>
  [...AX_OWN].some((k) => !AX_STYLE.has(k) && html.includes(`data-axis="${k}"`))
    ? 'придуманная ось не спряталась' : null);
run('поиск по оси', { ...DEF }, ui({ scq: 'монета' }), {}, (html) =>
  html.includes('data-axis="coin"') ? null : 'поиск не нашёл «Монета»');
run('поиск без совпадений', { ...DEF }, ui({ scq: 'зюзюка' }), {}, (html) =>
  html.includes('Ничего не нашлось') ? null : 'нет объяснения пустого списка');
run('поиск на «Стиле»', { ...DEF }, ui({ sctab: 'sty', scq: 'lucide' }), {}, (html) =>
  html.includes('data-val="line"') && !html.includes('data-axis="radius"')
    ? null : 'поиск на «Стиле» не отфильтровал');
run('свёрнутые группы', { ...DEF }, ui({ scgrp: [...new Set(prod.map((k) => AXES[k].g))] }), {}, (html) =>
  html.includes('data-axis="data"') ? 'свёрнутая группа всё равно рисует оси' : null);

/* 7. Крайние состояния */
run('всё изменено', Object.fromEntries(keys.map((k) => [k, AXES[k].opts.at(-1)[0]])), ui(), {});
run('сохранённые наборы', changed, ui({ saved: [{ name: 'Мой', axes: { data: 'empty' }, at: 1 }], sctab: 'sets' }), {});
run('история и закрепления', changed, ui({ schist: [{ ...DEF }], scpin: ['coin', 'data'] }), {});
run('панель закрыта', { ...DEF }, ui(), { panel: false }, (html) =>
  html.includes('inert') ? null : 'закрытая панель не помечена inert');
run('панель слева', { ...DEF }, ui({ scside: 'left' }), {}, (html) =>
  html.includes('dockl') ? null : 'швартовка слева не применилась');
run('открыта модалка', { ...DEF }, ui(), { modal: 'export' }, (html) =>
  html.includes('scmask on') ? 'маска панели рисуется поверх модалки' : null);

/* 8. Каждый data-атрибут разметки кто-то обрабатывает */
const used = new Set();
for (const html of [...Object.values(all)]) {
  for (const m of html.matchAll(/data-([a-z0-9-]+)(?:=|\s|>)/g)) used.add(m[1]);
}
const REACT = new Set(['val', 'over']); /* читаются рядом с действием, не триггеры */
for (const k of used) {
  if (REACT.has(k)) continue;
  const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (!store.includes(`[data-${k}]`) && !store.includes(`dataset.${camel}`))
    fail(`data-${k} в разметке панели никто не обрабатывает`);
}

await vite.close();
console.log(`панель: ${renders} рендеров, ${prod.length} осей, ${Object.keys(TITLES).length} экранов, `
  + `${Object.keys(MODALS).length} модалок, ${PRESETS.length} связок — ошибок нет`);
