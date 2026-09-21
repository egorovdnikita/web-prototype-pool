/* Справочник для прокси: что вообще можно включить в прототипе.

   Модель за прокси не знает ни осей, ни экранов — их надо перечислить
   в системном запросе. Руками этот список не написать: осей больше сотни,
   и он разойдётся с прототипом на первой же правке. Поэтому справочник
   собирается отсюда, а `npm run panel` сверяет файл с текущим кодом.

   Запуск: npm run catalog (перезаписывает worker/catalog.json) */
import fs from 'node:fs';
import { createServer } from 'vite';

/** Компактный справочник: только то, что нужно модели для ответа */
export function buildCatalog(proto, theme, draft) {
  const { AXES, TITLES, SCREEN_NAMES, MODALS, AX_STYLE } = proto;
  const axes = {};
  for (const [k, ax] of Object.entries(AXES)) {
    const opts = {};
    for (const [v, label] of ax.opts) opts[v] = label;
    axes[k] = { label: ax.label, g: ax.g, style: AX_STYLE.has(k) || undefined, opts };
    if (ax.free) axes[k].free = ax.free;
  }
  const screens = {};
  for (const [id, t] of Object.entries(TITLES)) screens[id] = SCREEN_NAMES[id] || t;
  const modals = {};
  for (const [k, m] of Object.entries(MODALS)) {
    const t = typeof m.t === 'function' ? '' : m.t;
    if (t) modals[k] = t;
  }
  const tokens = {};
  for (const [k, tok] of Object.entries(theme.TOKENS)) {
    tokens[k] = { label: tok.label, type: tok.type };
    if (tok.themed) tokens[k].themed = true;
    if (tok.type === 'num') { tokens[k].min = tok.min; tokens[k].max = tok.max; }
  }
  /* Блоки черновика: из чего модель может собрать новый раздел */
  const draftBlocks = {
    stats: 'items: [{label, value, note?}] — плашки с показателями',
    table: 'cols: [заголовок], rows: [[ячейка]] — таблица дизайн-системы',
    chart: 'title? — график хэшрейта из прототипа',
    empty: 'title, text? — пустое состояние с иллюстрацией',
    tabs: 'items: [название] — Segment Control',
    actions: 'items: [подпись] — кнопки (ничего не делают)',
    text: 'title?, text — абзац текста',
  };
  return {
    axes, screens, modals, tokens, base: theme.BASE, baseDark: theme.BASE_DARK,
    draftBlocks, draftCaps: draft.CAPS,
  };
}

export const catalogPath = (root) => root + 'worker/catalog.json';

/* Запуск как скрипт: собрать и записать */
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('../', import.meta.url).pathname;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const proto = await vite.ssrLoadModule('/src/legacy/prototype.js');
  const theme = await vite.ssrLoadModule('/src/theme.ts');
  const draft = await vite.ssrLoadModule('/src/draft.ts');
  const cat = buildCatalog(proto, theme, draft);
  fs.writeFileSync(catalogPath(root), JSON.stringify(cat, null, 1) + '\n');
  await vite.close();
  const size = (fs.statSync(catalogPath(root)).size / 1024).toFixed(1);
  console.log(`справочник: ${Object.keys(cat.axes).length} осей, ${Object.keys(cat.screens).length} экранов, `
    + `${Object.keys(cat.modals).length} модалок, ${Object.keys(cat.tokens).length} токенов — ${size} КБ`);
}
