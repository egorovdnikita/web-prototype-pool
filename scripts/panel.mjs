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
  draft: null, drafts: [],
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

/* 8d. Модель за прокси: справочник и проверка её ответа */
{
  const { buildCatalog, catalogPath } = await import('./catalog.mjs');
  const theme = await vite.ssrLoadModule('/src/theme.ts');
  const fresh = buildCatalog(proto, theme, await vite.ssrLoadModule('/src/draft.ts'));
  const onDisk = JSON.parse(fs.readFileSync(catalogPath(P), 'utf8'));
  if (JSON.stringify(fresh) !== JSON.stringify(onDisk))
    fail('worker/catalog.json разошёлся с прототипом — соберите заново: npm run catalog');

  const { vetAnswer, dropNote } = await vite.ssrLoadModule('/src/ai.ts');
  const vet = (raw, styleAsked = true, S = { ...DEF }) => vetAnswer(raw, S, styleAsked);
  /* Ответ модели — данные, а не команда: берём только то, что проверили */
  if (vet({ axes: { coin: 'ltc' } }).answer.apply?.coin !== 'ltc') fail('годная ось не применилась');
  if (vet({ axes: { выдумка: 'да' } }).answer.apply) fail('несуществующая ось применилась');
  if (vet({ axes: { coin: 'zzz' } }).answer.apply) fail('чужое значение оси применилось');
  if (vet({ go: 'payouts' }).answer.go !== 'payouts') fail('экран не открылся');
  if (vet({ go: 'нет-такого' }).answer.go) fail('несуществующий экран открылся');
  if (vet({ modal: 'нет-такого' }).answer.modal) fail('несуществующее окно открылось');
  if (vet({ tune: { bg: '#F5F5F5' } }).answer.apply?.tune !== 't1_bg-f5f5f5')
    fail('патч токенов не разобран');
  if (vet({ tune: { bg: 'zzz', rk: '25' } }).answer.apply?.tune !== 't1_rk-25')
    fail('мусорный токен не отброшен');
  /* Патч кладётся поверх того, что уже набрано, а пустая строка снимает ключ */
  const withTune = { ...DEF, tune: 't1_bg-f5f5f5_rk-25' };
  if (vetAnswer({ tune: { rk: '' } }, withTune, true).answer.apply?.tune !== 't1_bg-f5f5f5')
    fail('пустое значение не сняло токен');
  /* Главное обещание: без просьбы оформление не трогаем */
  const sneak = vet({ say: 'Готово', axes: { font: 'inter' }, tune: { bg: '000000' } }, false);
  if (sneak.answer.apply) fail('модель поменяла оформление, о котором не просили');
  if (!dropNote(sneak.dropped, false).includes('Оформление не трогал'))
    fail('про отброшенное оформление не сказали');
  /* Реплика — текст: длину режем, управляющие символы вычищаем */
  const long = vet({ say: 'я'.repeat(900) }).answer.say;
  if (long.length !== 600) fail('длина реплики не ограничена');
  if (vet({ say: 'а\u0007б' }).answer.say.includes('\u0007')) fail('управляющий символ не вычищен');
  if (vet({ chips: ['1', '2', '3', '4', '5', '6'] }).answer.chips.length !== 4) fail('подсказок больше четырёх');
  if (vet({ say: 42, axes: 'нет', tune: 7 }).answer.say !== '') fail('ответ не того вида не отброшен');

  run('чат ждёт ответа прокси', { ...DEF }, ui({ sctab: 'chat', chatwait: true }), {},
    (html) => html.includes('Думаю') ? null : 'нет строки ожидания');
}

/* 8e. Мои темы, сравнение до/после и выгрузка токенов */
{
  const theme = await vite.ssrLoadModule('/src/theme.ts');
  /* Файл токенов: типы по группам, значения — как их посчитал браузер */
  const values = {
    'color.bg': '#f5f5f5', 'color.accent': '#7086fc', 'radius.m': '16px',
    'space.4': '16px', 'size.button': '48px', 'font.body-2': '16px', 'font.family': 'Gilroy',
  };
  const doc = theme.buildTokensDoc(values, { dark: false, font: 'gilroy' });
  if (doc.color.bg.$value !== '#f5f5f5' || doc.color.bg.$type !== 'color') fail('цвет в выгрузке не тот');
  if (doc.radius.m.$type !== 'dimension') fail('радиус в выгрузке не размер');
  if (doc.font['body-2'].$type !== 'fontSize') fail('кегль в выгрузке не кегль');
  if (doc.font.family.$value !== 'Gilroy') fail('гарнитура в выгрузку не попала');
  if (!String(doc.$description).includes('светлая')) fail('в выгрузке не указана тема');
  if (JSON.parse(JSON.stringify(doc)) === null) fail('выгрузка не сериализуется');
  /* Пустые значения пропускаем, а не пишем null: плагины Figma на них спотыкаются */
  if ('l' in theme.buildTokensDoc({}, { dark: true, font: '' })) fail('в выгрузку попало пустое значение');
  if (theme.rgbaHex('rgb(10, 20, 30)') !== '#0a141e') fail('цвет из браузера разобран неверно');
  if (theme.rgbaHex('rgba(0, 0, 0, 0.5)') !== '#00000080') fail('прозрачность потерялась');
  /* Каждая переменная выгрузки существует в app.css — иначе в файле дырки */
  const css = fs.readFileSync(P + 'src/styles/app.css', 'utf8');
  for (const list of Object.values(theme.EXPORT)) for (const [, v] of list) {
    if (!css.includes(v + ':')) fail(`переменной ${v} нет в app.css, а она в выгрузке`);
  }

  const withThemes = run('«Стиль» со своими темами', { ...DEF, font: 'inter' },
    ui({ sctab: 'sty', themes: [{ name: 'Тёплая', sty: { font: 'inter', tune: 't1_bg-f6eadf' }, at: Date.now() }] }), {},
    (html) => html.includes('data-themego="Тёплая"') ? null : 'тема не попала в список');
  if (!withThemes.includes('data-themelink="Тёплая"')) fail('у темы нет ссылки');
  if (!withThemes.includes('data-themedel="Тёплая"')) fail('тему нельзя удалить');
  if (!withThemes.includes('1 из 5') || !withThemes.includes('токенов 1')) fail('подпись темы врёт');
  if (!withThemes.includes('Посмотреть без темы')) fail('нет сравнения до/после');
  const peek = run('«Стиль» во время сравнения', { ...DEF },
    ui({ sctab: 'sty', stystash: { font: 'inter' } }), {},
    (html) => html.includes('Вернуть тему') ? null : 'кнопка не переключилась');
  if (!peek.includes('без темы')) fail('не сказано, что тема снята');
}

/* 8f. Черновой раздел: спецификация, ссылка, разметка и разбор фраз */
{
  const D = await vite.ssrLoadModule('/src/draft.ts');
  const good = { title: 'Бонусы', blocks: [
    { t: 'stats', items: [{ label: 'Всего', value: '128' }] },
    { t: 'table', cols: ['Дата', 'Событие'], rows: [['01.02', 'Начисление']] },
  ] };
  if (!D.vetDraft(good)) fail('годный черновик не принят');
  if (D.vetDraft({ title: 'Пусто', blocks: [] })) fail('черновик без блоков принят');
  if (D.vetDraft({ title: '', blocks: [{ t: 'chart' }] })) fail('черновик без названия принят');
  if (D.vetDraft({ title: 'X', blocks: [{ t: 'script' }, { t: 'iframe' }] }))
    fail('неизвестные блоки не отброшены');
  /* Пределы держат длину ссылки: без них черновик в неё не влезет */
  const fat = D.vetDraft({ title: 'я'.repeat(200), blocks: Array(20).fill({ t: 'chart' }) });
  if (fat.title.length !== D.CAPS.title) fail('название не обрезано');
  if (fat.blocks.length !== D.CAPS.blocks) fail('число блоков не ограничено');
  const wide = D.vetDraft({ title: 'T', blocks: [{ t: 'table',
    cols: Array(20).fill('к'), rows: Array(20).fill(Array(20).fill('я'.repeat(80))) }] });
  if (wide.blocks[0].cols.length !== D.CAPS.cols) fail('колонки не ограничены');
  if (wide.blocks[0].rows.length !== D.CAPS.rows) fail('строки не ограничены');
  if (wide.blocks[0].rows[0][0].length !== D.CAPS.cell) fail('ячейка не обрезана');
  /* Ссылка: круг без потерь и разумная длина */
  const enc = D.encodeDraft(D.vetDraft(good));
  if (JSON.stringify(D.decodeDraft(enc)) !== JSON.stringify(D.vetDraft(good)))
    fail('черновик не пережил ссылку');
  if (D.decodeDraft('не-base64')) fail('мусор из ссылки не отброшен');
  if (D.decodeDraft(D.encodeDraft({ title: 'X', blocks: [{ t: 'script' }] }))) fail('мусор пролез через ссылку');
  const big = D.encodeDraft(D.vetDraft({ title: 'я'.repeat(60), blocks: [
    { t: 'stats', items: Array(6).fill({ label: 'я'.repeat(40), value: 'я'.repeat(40) }) },
    { t: 'table', cols: Array(6).fill('я'.repeat(30)), rows: Array(8).fill(Array(6).fill('я'.repeat(30))) },
    { t: 'text', title: 'я'.repeat(40), text: 'я'.repeat(200) },
    { t: 'tabs', items: Array(6).fill('я'.repeat(40)) },
    { t: 'actions', items: Array(6).fill('я'.repeat(40)) },
    { t: 'chart', title: 'я'.repeat(40) }] }));
  if (big.length > D.CAPS.link) fail(`черновик не влезает в ссылку: ${big.length} символов`);
  /* Обрезка идёт с конца и не съедает черновик целиком */
  if (!D.vetDraft({ title: 'T', blocks: Array(6).fill({ t: 'table',
    cols: Array(5).fill('колонка'), rows: Array(6).fill(Array(5).fill('значение ячейки')) }) }).blocks.length)
    fail('обрезка съела все блоки');
  /* Разметка: всё чужое экранируется — черновик приезжает по ссылке */
  proto.applyState({ S: { ...DEF }, U: ui(), route: 'draft', pop: null, modal: null, openGroups: {}, mini: false });
  const m = proto.M();
  const html = D.renderDraft(D.vetDraft({ title: '<img src=x onerror=alert(1)>', blocks: [
    { t: 'stats', items: [{ label: '<b>жир</b>', value: '1', note: '+12%' }] },
    { t: 'table', cols: ['<script>', 'Статус'], rows: [['"кавычки"', 'Завершён']] },
    { t: 'empty', title: 'Пусто', text: 'Ничего' },
    { t: 'actions', items: ['Кнопка'] },
    { t: 'chart', title: 'График' }] }), m);
  if (html.includes('<img src=x') || html.includes('<script>') || html.includes('<b>жир</b>'))
    fail('содержимое черновика попало в разметку как есть');
  if (!html.includes('&lt;script&gt;')) fail('текст не экранирован');
  if (!html.includes('Черновик') || !html.includes('draftbar')) fail('нет плашки «черновик»');
  /* Карточки собраны как на настоящих экранах: шапка с заголовком,
     таблица с пагинацией, показатели с иконкой */
  if (!html.includes('class="ch"')) fail('у карточек нет шапки');
  if (!html.includes('class="pager"')) fail('у таблицы нет пагинации');
  if (!html.includes('class="ic"')) fail('у показателей нет иконки');
  if (!html.includes('class="tbl"') || !html.includes('statcard')) fail('блоки собраны не из дизайн-системы');
  if (!html.includes('<svg')) fail('график не нарисовался');
  /* Свои диаграммы: столбики, линия и кольцо рисуются по числам */
  const drawn = D.renderDraft(D.vetDraft({ title: 'Д', blocks: [
    { t: 'chart', kind: 'bars', labels: ['<b>01</b>', '02'], values: [10, 20] },
    { t: 'chart', kind: 'line', labels: ['01', '02', '03'], values: [3, 1, 9] },
    { t: 'chart', kind: 'donut', labels: ['BTC', 'LTC'], values: [70, 30], unit: '₽' }] }), m);
  if (!drawn.includes('dbars') || !drawn.includes('dline') || !drawn.includes('ddonut'))
    fail('не все виды диаграмм нарисовались');
  if (drawn.includes('<b>01</b>')) fail('подпись диаграммы не экранирована');
  if (!drawn.includes('70%') || !drawn.includes('30%')) fail('в кольце нет долей');
  /* Новые блоки: герой, рейтинг, лента и подсказка — со своей разметкой
     и с экранированием, как у всех остальных */
  const rich = D.renderDraft(D.vetDraft({ title: 'Р', blocks: [
    { t: 'kpi', label: 'Доход', value: '128 400 ₽', note: 'За сутки 6 210 ₽', delta: '+12%' },
    { t: 'list', title: 'Топ', items: [{ label: '<b>w1</b>', value: '300 TH/s', share: 60 }] },
    { t: 'feed', title: 'События', items: [{ time: '02.02 10:00', text: 'Выплата ушла', tone: 'ok' }] },
    { t: 'callout', text: 'Порог выплаты — 0,001 BTC', tone: 'warn' }] }), m);
  if (!rich.includes('dhero') || !rich.includes('dlist') || !rich.includes('dfeed') || !rich.includes('dcallout'))
    fail('новые блоки не нарисовались');
  if (rich.includes('<b>w1</b>')) fail('подпись рейтинга не экранирована');
  if (!rich.includes('class="dyn teal"')) fail('дельта героя не стала бейджем');
  /* Ссылка с короткими ключами читается обратно без потерь */
  const richSpec = D.vetDraft({ title: 'Р', blocks: [
    { t: 'kpi', label: 'Доход', value: '1 ₽', delta: '+1%' },
    { t: 'feed', items: [{ time: '01.02', text: 'Событие', tone: 'ok' }] }] });
  if (JSON.stringify(D.decodeDraft(D.encodeDraft(richSpec))) !== JSON.stringify(richSpec))
    fail('новые блоки не пережили ссылку');
  if (D.encodeDraft(richSpec).includes('title')) fail('ключи в ссылке не сокращены');
  /* Статусы в таблице — плашки дизайн-системы, а не голый текст */
  if (!html.includes('class="status ok')) fail('статус в таблице не стал плашкой');
  /* Дельта показателя — бейдж, а не строчка текста */
  if (!html.includes('class="dyn ok"')) fail('дельта показателя не стала бейджем');
  /* Мусор вместо чисел не должен доходить до разметки */
  const junk = D.vetDraft({ title: 'Д', blocks: [{ t: 'chart', kind: 'evil',
    labels: ['a', 'b'], values: ['10', NaN, Infinity, 5] }] });
  /* От четырёх «чисел» осталось одно — это уже не диаграмма: блок
     откатывается к графику прототипа, а не рисует точку */
  if (junk.blocks[0].values) fail('нечисловые данные приняты');
  const evil = D.vetDraft({ title: 'Д', blocks: [{ t: 'chart', kind: 'evil', values: [1, 2, 3] }] });
  if (evil.blocks[0].kind !== 'line') fail('неизвестный вид диаграммы не заменён');
  if (evil.blocks[0].labels.join() !== '1,2,3') fail('подписи не добились номерами');

  /* Разбор фраз */
  const dr = (text, cur = null) => answer(text, { ...DEF }, false, cur).draft;
  const made = dr('новый раздел Бонусы');
  if (made?.title !== 'Бонусы') fail(`«новый раздел Бонусы» дал ${made && made.title}`);
  if (!dr('сделай экран про рефералов')) fail('«сделай экран» не собрал черновик');
  const added = dr('добавь вкладки', made);
  if (!added || added.blocks.length !== made.blocks.length + 1) fail('вкладки не добавились');
  const cut = dr('убери график', made);
  if (!cut || cut.blocks.some((b) => b.t === 'chart')) fail('график не убрался');
  if (answer('добавь вкладки', { ...DEF }, false, null).draft) fail('правка без черновика собрала раздел');
  /* Жалоба из отзыва: «без общего графика, а много разных диограмм» молча
     переключала постороннюю ось вместо правки черновика */
  const many = dr('Без общего графика а много разных диограмм', dr('новый раздел Сводка'));
  if (!many) fail('«без графика, а много диаграмм» не поправила черновик');
  if (many.blocks.filter((b) => b.t === 'chart').length < 3) fail('«много диаграмм» дало меньше трёх');
  const kinds = new Set(many.blocks.filter((b) => b.t === 'chart').map((b) => b.kind));
  if (kinds.size < 2) fail('«разные диаграммы» вышли одинаковыми');
  /* Диаграммы несут свои числа, а не берут график хэшрейта из прототипа */
  for (const b of many.blocks.filter((x) => x.t === 'chart')) {
    if (!b.values || b.values.length < 2) fail(`диаграмма ${b.kind} без данных`);
    if (b.labels.length !== b.values.length) fail('подписи не сошлись с числами');
  }
  /* Названный вид диаграммы: «круговую» — это кольцо, и одно, а не два */
  const beforeD = dr('новый раздел Сводка');
  const donut = dr('добавь круговую диаграмму', beforeD);
  const rings = (d) => d.blocks.filter((b) => b.t === 'chart' && b.kind === 'donut').length;
  if (rings(donut) !== rings(beforeD) + 1) fail(`«круговую диаграмму» дало ${rings(donut) - rings(beforeD)} колец`);
  /* Таблицы приходят с содержимым, а не пустые */
  const filled = dr('новый раздел Выплаты');
  const tbl = filled.blocks.find((b) => b.t === 'table');
  if (!tbl?.rows.length) fail('таблица пришла пустой');
  if (!tbl.rows.some((r) => /₽/.test(r.join(' ')))) fail('в таблице выплат нет сумм');
  /* Одна и та же просьба даёт одни и те же числа — иначе ссылка не
     воспроизводится и у коллеги будет другая картинка */
  if (JSON.stringify(dr('новый раздел Выплаты')) !== JSON.stringify(filled))
    fail('генерация не повторяется — ссылка покажет другое');
  /* Фраза про черновик, которую не разобрали, не должна трогать оси */
  for (const q of ['сделай красиво', 'убери лишнее отсюда', 'добавь сюда ещё чего-нибудь']) {
    const lost = answer(q, { ...DEF }, false, made);
    if (lost.apply || lost.go || lost.modal) fail(`«${q}» при открытом черновике дёрнула посторонние оси`);
    if (!lost.say.includes('поменять в черновике')) fail(`«${q}» ответила не про черновик`);
  }
  /* Замена и переименование */
  const swapped = dr('вместо таблицы кнопки', made);
  if (!swapped || swapped.blocks.some((b) => b.t === 'table') || !swapped.blocks.some((b) => b.t === 'actions'))
    fail('«вместо таблицы кнопки» не сработало');
  const renamed = dr('переименуй в Сводка', made);
  if (renamed?.title !== 'Сводка') fail('переименование не сработало');
  /* Заготовки по теме: знакомое название даёт осмысленный набор блоков */
  const bonus = dr('новый раздел Бонусы');
  if (!bonus.blocks.some((b) => b.t === 'actions')) fail('шаблон «бонусы» без кнопок');
  const analytics = dr('новый раздел Аналитика');
  if (analytics.blocks.filter((b) => b.t === 'chart').length < 2) fail('шаблон «аналитика» без графиков');
  /* Навигация не должна превращаться в генерацию */
  for (const q of ['открой выплаты', 'открой раздел воркеры', 'авария на парке', 'фон темнее']) {
    if (answer(q, { ...DEF }, false, null).draft) fail(`«${q}» собрала черновик`);
  }

  /* Ответ модели с черновиком проходит ту же проверку */
  const { vetAnswer } = await vite.ssrLoadModule('/src/ai.ts');
  const fromAi = vetAnswer({ say: 'Собрал', draft: good }, { ...DEF }, false);
  if (fromAi.answer.draft?.title !== 'Бонусы') fail('черновик от модели не принят');
  const badAi = vetAnswer({ say: 'Собрал', draft: { title: 'X', blocks: [{ t: 'iframe' }] } }, { ...DEF }, false);
  if (badAi.answer.draft) fail('негодный черновик от модели принят');
  if (!badAi.dropped.length) fail('про отброшенный черновик не сказали');

  /* Композиция: знакомая тема даёт проработанный экран, а не список блоков */
  const pay = dr('сделай раздел Выплаты');
  for (const need of ['kpi', 'stats', 'table', 'feed', 'callout']) {
    if (!pay.blocks.some((b) => b.t === need)) fail(`в разделе «Выплаты» нет блока ${need}`);
  }
  if (pay.blocks.length < 7) fail(`экран из ${pay.blocks.length} блоков — это всё ещё набросок`);
  if (D.draftSize(pay) > D.CAPS.link) fail('проработанный экран не влезает в ссылку');
  /* Рейтинг и лента приходят с данными, а не пустыми */
  const rank = pay.blocks.find((b) => b.t === 'list');
  if (!rank.items.every((i) => i.label && i.value && typeof i.share === 'number'))
    fail('в рейтинге нет значений или долей');
  const feed = pay.blocks.find((b) => b.t === 'feed');
  if (!feed.items.every((i) => i.time && i.text)) fail('в ленте нет времени или текста');
  /* Незнакомая тема — та же композиция, а не голый каркас */
  const other = dr('новый раздел Прошивки');
  if (other.blocks.length < 6) fail('незнакомая тема осталась каркасом');

  const withDrafts = run('«Переходы» с черновиками', { ...DEF }, ui({ sctab: 'go' }), {
    drafts: [D.vetDraft(good)], draft: D.vetDraft(good),
  }, (html) => html.includes('data-draftgo="Бонусы"') ? null : 'черновик не попал в список');
  if (!withDrafts.includes('data-draftdel="Бонусы"')) fail('черновик нельзя удалить');
  if (!withDrafts.includes('data-draftclose')) fail('нет кнопки «убрать из ссылки»');
  run('«Переходы» без черновиков', { ...DEF }, ui({ sctab: 'go' }), {},
    (html) => html.includes('новый раздел Бонусы') ? null : 'нет подсказки про черновик');
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
