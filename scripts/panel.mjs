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
const { Tour } = await vite.ssrLoadModule('/src/components/Tour.tsx');
const { TOUR } = await vite.ssrLoadModule('/src/tour.ts');
const { answer } = await vite.ssrLoadModule('/src/chat.ts');
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
for (const tab of ['ax', 'sty', 'sets', 'go', 'chat']) {
  all[tab] = run(`вкладка ${tab}`, { ...DEF }, ui({ sctab: tab }), {}, (html) =>
    html.includes('Сценарии') ? null : 'нет заголовка');
}
/* 2. В списке осей — все оси продукта и ни одной оси оформления */
for (const k of prod) {
  if (!all.ax.includes(`data-axis="${k}"`)) fail(`ось ${k} не попала в список`);
}
for (const k of AX_STYLE) {
  if (all.ax.includes(`data-axis="${k}"`)) fail(`ось оформления ${k} видна в списке осей`);
  /* У шрифта, акцента, иконок и тонкой настройки своя разметка,
     а не ряд кнопок data-axis — их проверяем отдельно ниже */
  if (!all.sty.includes(`data-axis="${k}"`) && !['accent', 'font', 'icons', 'tune'].includes(k))
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

/* 8. Чат: разбор запроса включает то, что просили */
{
  const ask = (q) => answer(q);
  const cases = [
    ['авария на парке', (a) => a.apply && a.apply.health === 'critical'],
    ['тёмная тема', (a) => a.apply && a.apply.theme === 'dark'],
    ['пусто в таблицах', (a) => a.apply && a.apply.data === 'empty'],
    ['открой выплаты', (a) => a.go === 'payouts'],
    ['наблюдатель', (a) => a.apply && a.apply.role === 'observer'],
    ['сбрось', (a) => a.apply && a.apply.data === 'normal'],
    ['помощь', (a) => !a.apply && !a.go && a.chips],
    ['', (a) => !a.apply && !a.go],
    ['абырвалг', (a) => !a.apply && !a.go && a.chips],
  ];
  for (const [q, ok] of cases) {
    const a = ask(q);
    if (!a || typeof a.say !== 'string' || !a.say) fail(`чат молчит на «${q}»`);
    if (!ok(a)) fail(`чат не понял «${q}»: ${JSON.stringify(a).slice(0, 120)}`);
  }
  /* Ответ ссылается только на живые оси, экраны и окна */
  for (const q of ['авария на парке', 'крупный клиент', 'тёмная тема', 'окно экспорта']) {
    const a = ask(q);
    for (const k of Object.keys(a.apply || {})) if (!AXES[k]) fail(`чат вернул ось ${k}, которой нет`);
    if (a.go && !(a.go in TITLES)) fail(`чат ведёт на экран ${a.go}, которого нет`);
    if (a.modal && !(a.modal in MODALS)) fail(`чат открывает окно ${a.modal}, которого нет`);
  }
  const withChat = run('вкладка «Чат» с перепиской', { ...DEF },
    ui({ sctab: 'chat', chat: [{ role: 'you', text: 'привет' }, { role: 'bot', text: 'здравствуйте' }] }), {},
    (html) => html.includes('привет') && html.includes('здравствуйте') ? null : 'переписка не отрисовалась');
  if (!withChat.includes('data-chatsend')) fail('в чате нет кнопки отправки');
}

/* 8b. Тонкая настройка: модель темы и её секция на вкладке «Стиль» */
{
  const T = await vite.ssrLoadModule('/src/theme.ts');
  const round = (s) => T.tuneStr(T.parseTune(s));
  const good = 't1_bg-102030_c1-fafafa_rk-25_sb-300';
  if (round(good) !== good) fail(`тема не пережила запись и чтение: ${round(good)}`);
  if (round('') !== '') fail('пустая тема должна оставаться пустой');
  if (round('bg-102030') !== '') fail('тема без версии должна отбрасываться');
  /* Мусор выкидывается по одному ключу, остальное живёт */
  if (round('t1_bg-zzzzzz_rk-999_sb-300_нет-1') !== 't1_sb-300') fail('мусор в теме не отброшен');
  /* Порядок ключей не зависит от порядка ввода: одна тема — одна строка */
  if (T.tuneStr({ rk: '25', bg: '102030' }) !== 't1_bg-102030_rk-25') fail('порядок ключей в теме плавает');
  /* Светлые и тёмные цвета не пересекаются */
  const vars = (s, dark) => Object.fromEntries(T.cssVars(T.parseTune(s), dark));
  if (vars('t1_bg-102030', true)['--bg']) fail('светлый цвет протёк в тёмную тему');
  if (vars('t1_dbg-102030', true)['--bg'] !== '#102030') fail('тёмный цвет не применился');
  if (vars('t1_dbg-102030', false)['--bg']) fail('тёмный цвет протёк в светлую тему');
  if (vars('t1_rk-50', false)['--rk'] !== '0.5') fail('множитель скруглений считается неверно');
  if (vars('t1_hb-40', false)['--h-btn-sm'] !== '32px') fail('малая кнопка не поехала за большой');
  /* Контраст: белое на чёрном — 21, и предупреждение только на то, что тронули */
  if (T.contrast('ffffff', '000000') !== 21) fail('контраст считается неверно');
  if (T.tuneWarnings(T.parseTune(''), false).length) fail('дизайн-система сама по себе не предупреждает');
  if (!T.tuneWarnings(T.parseTune('t1_bg-777777'), false).length) fail('серое на сером не поймано');
  /* Каждая переменная белого списка есть в ALL_VARS: иначе она застрянет */
  for (const tok of Object.values(T.TOKENS)) for (const v of tok.css) {
    if (!T.ALL_VARS.includes(v)) fail(`переменная ${v} не снимается при сбросе темы`);
  }

  const empty = run('«Стиль» без тонкой настройки', { ...DEF }, ui({ sctab: 'sty' }), {},
    (html) => html.includes('Тонкая настройка') ? null : 'нет секции тонкой настройки');
  if (!empty.includes('data-chatsay="фон темнее"')) fail('нет подсказок для чата');
  const set = run('«Стиль» с тонкой настройкой', { ...DEF, tune: good }, ui({ sctab: 'sty' }), {},
    (html) => html.includes('data-tunedel="bg"') ? null : 'токен без кнопки «убрать»');
  if (!set.includes('data-axreset="tune"')) fail('нет сброса тонкой настройки');
  if (!set.includes('300px')) fail('значение токена не показано');
  /* Строка «Своя тема» считает и оси, и токены */
  const own = run('строка «Своя тема»', { ...DEF, tune: good, font: 'inter' }, ui({ sctab: 'sty' }), {},
    (html) => html.includes('Своя тема') ? null : 'нет строки «Своя тема»');
  if (!own.includes('1 из 5') || !own.includes('токенов 4')) fail('счётчик своей темы врёт');
}

/* 8c. Чат про оформление: цель + действие меняют тему, остальное — оси */
{
  const sty = (text, S = { ...DEF }, dark = false) => answer(text, S, dark);
  const tuneOf = (text, S, dark) => (sty(text, S, dark).apply || {}).tune;
  if (!tuneOf('фон темнее')) fail('«фон темнее» не поменял тему');
  if (tuneOf('скругления 4') !== 't1_rk-25') fail('«скругления 4» считается неверно');
  if (tuneOf('крупнее текст') !== 't1_fsk-110') fail('«крупнее текст» не поменял масштаб');
  if (tuneOf('сайдбар 300') !== 't1_sb-300') fail('«сайдбар 300» не поменял ширину');
  if (tuneOf('карточки белые') !== 't1_sf-ffffff') fail('цвет по имени не разобран');
  if (tuneOf('фон #102030') !== 't1_bg-102030_c1-fafafa') fail('нечитаемый текст не подобран');
  if (tuneOf('фон теплее', { ...DEF }, true)?.slice(0, 7) !== 't1_dbg-') fail('в тёмной теме патч ушёл не в ту тему');
  /* «Светлее» в тёмной теме считается от тёмного фона, а не от светлого:
     иначе первая же правка выбрасывает тёмную тему в белый */
  {
    const T = await vite.ssrLoadModule('/src/theme.ts');
    const want = 't1_bg-ffffff_dbg-' + T.lighten(T.BASE_DARK.bg, 0.18);
    const from = { ...DEF, tune: 't1_bg-ffffff' };
    if (tuneOf('фон светлее', from, true) !== want) fail('в тёмной теме считаем от чужой базы');
  }
  if (tuneOf('верни оформление', { ...DEF, tune: 't1_rk-25' }) !== '') fail('«верни оформление» не сбросило тему');
  /* Продуктовые фразы оформление не трогают — иначе чат чинил бы то,
     о чём не просили */
  for (const q of ['авария на парке', 'пусто в таблицах', 'тёмная тема', 'шрифт Onest',
    'наблюдатель', 'открой выплаты', 'окно экспорта', 'крупный клиент']) {
    const a = answer(q, { ...DEF }, false);
    if (a.apply && 'tune' in a.apply) fail(`«${q}» полезла в оформление`);
    if (!a.apply && !a.go && !a.modal) fail(`«${q}» перестала работать`);
  }
}

/* 9. Обучение: каждый шаг рисуется и ведёт на следующий */
for (let i = 0; i < TOUR.length; i++) {
  const html = renderToStaticMarkup(
    h(AppCtx.Provider, { value: ctx({ ...DEF }, ui({ tour: i })) }, h(Tour, null)));
  renders++;
  if (!html.includes(TOUR[i].title)) fail(`шаг обучения ${i + 1} не показывает заголовок`);
  if (!html.includes(`${i + 1} из ${TOUR.length}`)) fail(`шаг обучения ${i + 1} без счётчика`);
  const next = i === TOUR.length - 1 ? 'Готово' : 'Дальше';
  if (!html.includes(next)) fail(`шаг обучения ${i + 1} без кнопки «${next}»`);
  if (i > 0 && !html.includes(`data-tourgo="${i - 1}"`)) fail(`шаг обучения ${i + 1} без «Назад»`);
  all.tour = (all.tour || '') + html;
}
if (renderToStaticMarkup(h(AppCtx.Provider, { value: ctx({ ...DEF }, ui({ tour: null })) }, h(Tour, null))))
  fail('обучение рисуется, когда оно выключено');
renders++;

/* 10. Каждый data-атрибут разметки кто-то обрабатывает */
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
  + `${Object.keys(MODALS).length} модалок, ${PRESETS.length} связок, ${TOUR.length} шагов обучения, `
  + `чат — ошибок нет`);
