/* Тонкая настройка оформления — «тема» поверх дизайн-системы.

   Пять осей оформления дают крупные шаги: шрифт, акцент, скругления,
   отступы, иконки. Тема добирает остальное: поверхности, текст, статусные
   цвета, масштаб текста, ширину сайдбара и высоту контролов. Это не
   свободный CSS, а патч токенов из белого списка: только известные ключи,
   только значения в диапазоне. Поэтому тема сериализуется в ссылку,
   проверяется тестами и сбрасывается одной кнопкой.

   Разбор фраз («фон темнее», «скругления 4») живёт в chat.ts — здесь
   только модель: список токенов, чтение и запись, цветовая арифметика
   и проверка контраста.

   Чего здесь нет намеренно: акцентного цвета и шрифта — у них свои оси,
   и второй хозяин у одной переменной означал бы, что кто-то из двоих
   молча перетирает другого. --brand уводит ось «Акцентный цвет». */

export interface Tok {
  /** CSS-переменные, которые ставит этот ключ (первая — основная) */
  css: string[]
  type: 'color' | 'num'
  label: string
  /** Цвет переопределён в тёмной теме — значит, хранится отдельно для неё */
  themed?: boolean
  min?: number
  max?: number
  /** Как показать значение человеку */
  unit?: string
}

/* Белый список. Ключи короткие: они уезжают в ссылку. Тёмные двойники
   получают префикс d (bg → dbg): в тёмной теме эти токены переопределены
   дизайн-системой, и один общий цвет ломал бы вторую тему. */
export const TOKENS: Record<string, Tok> = {
  bg:    { css: ['--bg'],      type: 'color', label: 'Фон страницы',    themed: true },
  sf:    { css: ['--surface'], type: 'color', label: 'Фон карточек',    themed: true },
  bg3:   { css: ['--bg3'],     type: 'color', label: 'Третий слой',     themed: true },
  c1:    { css: ['--c1'],      type: 'color', label: 'Основной текст',  themed: true },
  c2:    { css: ['--c2'],      type: 'color', label: 'Текст помельче',  themed: true },
  c3:    { css: ['--c3'],      type: 'color', label: 'Подписи',         themed: true },
  /* Границы дизайн-система не переопределяет в тёмной теме — значит,
     и двойника у них нет: один цвет работает в обеих */
  bd:    { css: ['--border'],  type: 'color', label: 'Границы' },
  pos:   { css: ['--pos'],     type: 'color', label: 'Цвет «хорошо»' },
  warn:  { css: ['--warn'],    type: 'color', label: 'Цвет «внимание»' },
  neg:   { css: ['--neg'],     type: 'color', label: 'Цвет «плохо»' },
  rk:    { css: ['--rk'],      type: 'num', label: 'Скругления', min: 0,   max: 250, unit: '%' },
  spk:   { css: ['--spk'],     type: 'num', label: 'Отступы',    min: 0,   max: 250, unit: '%' },
  fsk:   { css: ['--fsk'],     type: 'num', label: 'Масштаб текста', min: 80, max: 140, unit: '%' },
  sb:    { css: ['--sb'],      type: 'num', label: 'Ширина сайдбара', min: 180, max: 380, unit: 'px' },
  hb:    { css: ['--h-btn', '--h-ctrl', '--h-btn-sm'], type: 'num', label: 'Высота кнопок', min: 32, max: 64, unit: 'px' },
  hf:    { css: ['--h-field'], type: 'num', label: 'Высота полей', min: 40, max: 72, unit: 'px' },
}

/** Значения дизайн-системы: от них считаются «темнее», «шире», «крупнее»,
    от них же идёт проверка контраста, когда сам цвет не трогали.
    `npm run audit` сверяет эти числа с app.css — иначе они разойдутся. */
export const BASE: Record<string, string> = {
  bg: 'f5f5f5', sf: 'ffffff', bg3: 'e5e5e5', c1: '171717', c2: '737373', c3: '9ca3af',
  bd: '6b7280', pos: '22c55e', warn: 'f59e0b', neg: 'ef4444',
  rk: '100', spk: '100', fsk: '100', sb: '252', hb: '48', hf: '56',
}
export const BASE_DARK: Record<string, string> = {
  bg: '0a0a0a', sf: '171717', bg3: '262626', c1: 'fafafa', c2: 'a3a3a3', c3: '737373',
}

/** Патч: ключ токена (или d+ключ для тёмной темы) → значение */
export type Tune = Record<string, string>

const HEX = /^[0-9a-f]{6}$/
/** Ключ патча → токен: dbg → bg */
export const tokOf = (k: string) => TOKENS[k] || (k[0] === 'd' ? TOKENS[k.slice(1)] : undefined)
const isDark = (k: string) => !TOKENS[k] && k[0] === 'd'

export function okEntry(k: string, v: string) {
  const t = tokOf(k)
  if (!t) return false
  /* Тёмный двойник бывает только у тех цветов, что дизайн-система
     переопределяет в тёмной теме: у остальных он ничего не значит */
  if (isDark(k) && !t.themed) return false
  if (t.type === 'color') return HEX.test(v)
  if (!/^\d{1,3}$/.test(v)) return false
  const n = +v
  return n >= (t.min ?? 0) && n <= (t.max ?? 999)
}

/** Разбор значения из ссылки. Неизвестные ключи и значения вне диапазона
    выбрасываются — чужая или старая ссылка не должна ронять прототип. */
export function parseTune(s: string): Tune {
  const out: Tune = {}
  if (!s) return out
  const parts = s.split('_')
  if (parts.shift() !== 't1') return out
  for (const p of parts) {
    const i = p.indexOf('-')
    if (i < 1) continue
    const k = p.slice(0, i), v = p.slice(i + 1).toLowerCase()
    if (okEntry(k, v)) out[k] = v
  }
  return out
}

/** Запись в ссылку: версия, потом пары в порядке белого списка —
    чтобы одна и та же тема всегда давала одну и ту же строку. */
export function tuneStr(t: Tune): string {
  const keys = Object.keys(t).filter((k) => okEntry(k, t[k]))
  if (!keys.length) return ''
  const ord = Object.keys(TOKENS)
  keys.sort((a, b) => {
    const d = ord.indexOf(tokKey(a)) - ord.indexOf(tokKey(b))
    return d || (a.length - b.length)
  })
  return 't1_' + keys.map((k) => `${k}-${t[k]}`).join('_')
}
const tokKey = (k: string) => (TOKENS[k] ? k : k.slice(1))

/** Приводит значение из ссылки к каноническому виду, попутно выкидывая мусор */
export const cleanTune = (s: string) => tuneStr(parseTune(s))

/** Значение ключа с учётом темы: сначала патч, потом дизайн-система */
export function valueOf(t: Tune, k: string, dark: boolean) {
  const tok = TOKENS[k]
  if (!tok) return ''
  if (tok.themed && dark) return t['d' + k] || BASE_DARK[k] || BASE[k]
  return t[k] || BASE[k]
}

/** Патч → список CSS-переменных. Ставится поверх осей оформления:
    inline-стиль на <html> сильнее и :root, и тёмной темы. */
export function cssVars(t: Tune, dark: boolean): [string, string][] {
  const out: [string, string][] = []
  for (const k of Object.keys(TOKENS)) {
    const tok = TOKENS[k]
    const v = tok.themed && dark ? t['d' + k] : t[k]
    if (!v || !okEntry(tok.themed && dark ? 'd' + k : k, v)) continue
    if (tok.type === 'color') {
      out.push([tok.css[0], '#' + v])
      /* Статусные цвета идут парой с подложкой в 16% — иначе плашка
         остаётся зелёной, а текст на ней уже нет */
      if (k === 'pos' || k === 'warn' || k === 'neg') out.push([`--${k}-sub`, '#' + v + '29'])
      if (k === 'bd') out.push(['--ctrl-line', '#' + v])
    } else if (k === 'rk' || k === 'spk' || k === 'fsk') {
      out.push([tok.css[0], String(+v / 100)])
    } else if (k === 'hb') {
      out.push(['--h-btn', v + 'px'], ['--h-ctrl', v + 'px'],
        ['--h-btn-sm', Math.max(28, +v - 8) + 'px'])
    } else {
      out.push([tok.css[0], v + 'px'])
    }
  }
  return out
}

/** Все переменные, которые тема вообще может тронуть: их снимают,
    когда ключ из патча ушёл, иначе старое значение застревает на <html>. */
export const ALL_VARS = [...new Set(Object.values(TOKENS).flatMap((t) => t.css)
  .concat(['--pos-sub', '--warn-sub', '--neg-sub', '--ctrl-line']))]

/* ===== цвет ===== */

export const rgb = (h: string): [number, number, number] => {
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
export const toHex = (c: [number, number, number]) => c.map(hex2).join('')

/** Относительная яркость по WCAG */
export function lum(h: string) {
  const [r, g, b] = rgb(h).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Контраст по WCAG: 1 — неразличимо, 21 — чёрное на белом */
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10
}
export const mix = (a: string, b: string, t: number): string =>
  toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t) as [number, number, number])
export const darken = (h: string, k = 0.15) => mix(h, '000000', k)
export const lighten = (h: string, k = 0.15) => mix(h, 'ffffff', k)
/* «Теплее» и «холоднее» — подмешать немного янтарного или синего:
   так фраза даёт заметный, но не радикальный сдвиг. */
export const warmer = (h: string, k = 0.12) => mix(h, 'ff9a3d', k)
export const cooler = (h: string, k = 0.12) => mix(h, '3d8aff', k)

/** Читаемый текст на фоне: берём тот полюс шкалы, что даёт больший контраст */
export const readable = (bgHex: string) =>
  contrast(bgHex, '171717') >= contrast(bgHex, 'fafafa') ? '171717' : 'fafafa'

/** Пары «фон — текст», которые проверяем на читаемость */
const PAIRS: [string, string, string][] = [
  ['bg', 'c1', 'текст на фоне страницы'],
  ['sf', 'c1', 'текст на карточке'],
  ['sf', 'c2', 'подписи на карточке'],
  ['bg', 'c2', 'подписи на фоне страницы'],
]

/** Предупреждения о контрасте: считаем по итоговым значениям — патч там,
    где он есть, дизайн-система в остальном. Порог AA — 4.5. */
export function tuneWarnings(t: Tune, dark: boolean): string[] {
  const out: string[] = []
  for (const [bgK, fgK, what] of PAIRS) {
    const bg = valueOf(t, bgK, dark), fg = valueOf(t, fgK, dark)
    if (!HEX.test(bg) || !HEX.test(fg)) continue
    /* Ругаемся только на то, что сами и сломали: дизайн-системные
       подписи и так на грани, и напоминать о них при каждой правке — шум */
    const touched = t[bgK] || t[fgK] || t['d' + bgK] || t['d' + fgK]
    const c = contrast(bg, fg)
    if (touched && c < 4.5) out.push(`${what} — контраст ${c.toFixed(1)} при норме 4.5`)
  }
  return out
}

/** Человеческое описание патча: для панели и ответа в чат */
export function tuneList(t: Tune): { k: string; label: string; value: string }[] {
  return Object.keys(t).filter((k) => okEntry(k, t[k])).map((k) => {
    const tok = tokOf(k)!
    const dark = isDark(k)
    return {
      k,
      label: tok.label + (dark ? ' (тёмная)' : ''),
      value: tok.type === 'color' ? '#' + t[k] : t[k] + (tok.unit || ''),
    }
  })
}

/* ===== Выгрузка токенов =====

   Дизайнеру нужна не строка из ссылки, а значения: «какой у нас теперь
   фон карточки и радиус кнопки». Считать их в уме по множителям нельзя —
   и не нужно: браузер уже посчитал. Мы спрашиваем у него итоговые
   величины (`readTokens`) и складываем их в формат Design Tokens (W3C),
   который понимают плагины импорта переменных в Figma. */

/** Что выгружаем. Ключ — имя в файле, значение — переменная CSS. */
export const EXPORT: Record<string, [string, string][]> = {
  color: [
    ['accent', '--accent'], ['accent-sub', '--accent-sub'], ['accent-hover', '--accent-h'],
    ['accent-active', '--accent-a'], ['focus', '--focus'], ['brand', '--brand'],
    ['bg', '--bg'], ['surface', '--surface'], ['bg-3', '--bg3'],
    ['text-1', '--c1'], ['text-2', '--c2'], ['text-3', '--c3'],
    ['border', '--border'], ['control', '--ctrl'], ['control-line', '--ctrl-line'],
    ['positive', '--pos'], ['warning', '--warn'], ['negative', '--neg'], ['neutral', '--neu'],
    ['inverse-bg', '--inv-bg'], ['inverse-fg', '--inv-fg'],
  ],
  radius: [
    ['3xs', '--r-3xs'], ['2xs', '--r-2xs'], ['1xs', '--r-1xs'], ['xs', '--r-xs'],
    ['s', '--r-s'], ['m', '--r-m'], ['l', '--r-l'], ['xl', '--r-xl'], ['2xl', '--r-2xl'],
  ],
  space: [
    ['1', '--sp1'], ['2', '--sp2'], ['3', '--sp3'],
    ['4', '--sp4'], ['5', '--sp5'], ['6', '--sp6'],
  ],
  size: [
    ['button', '--h-btn'], ['button-sm', '--h-btn-sm'], ['field', '--h-field'],
    ['control', '--h-ctrl'], ['sidebar', '--sb'],
  ],
  font: [
    ['body-1', '--fs-b1'], ['body-2', '--fs-m'], ['body-3', '--fs-s'],
    ['caption-1', '--fs-c'], ['caption-2', '--fs-c2'],
    ['headline-5', '--fs-h5'], ['headline-4', '--fs-h4'], ['headline-3', '--fs-h3'],
    ['headline-2', '--fs-h2'], ['headline-1', '--fs-h1'], ['display', '--fs-ds'],
  ],
}
/** Цвет или размер: от этого зависит и способ замера, и тип в файле */
const isColorGroup = (g: string) => g === 'color'

/** Итоговые значения из браузера. Считает он, а не мы: `--r-m` в CSS —
    это `calc(16px*var(--rk))`, и разворачивать эту арифметику руками
    значило бы завести вторую копию дизайн-системы. */
export function readTokens(): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof document === 'undefined') return out
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden'
  document.body.appendChild(probe)
  for (const [group, list] of Object.entries(EXPORT)) {
    for (const [name, v] of list) {
      /* Цвет меряем через color, длину — через width: computed-значение
         самой переменной осталось бы текстом вида calc(16px*1) */
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'
        + (isColorGroup(group) ? `color:var(${v})` : `width:var(${v})`)
      const cs = getComputedStyle(probe)
      out[`${group}.${name}`] = isColorGroup(group) ? rgbaHex(cs.color) : cs.width
    }
  }
  probe.remove()
  out['font.family'] = getComputedStyle(document.documentElement).getPropertyValue('--font').trim()
  return out
}

/** rgb()/rgba() из браузера → #rrggbb или #rrggbbaa: в Figma нужен hex */
export function rgbaHex(v: string) {
  const m = v.match(/-?[\d.]+/g)
  if (!m || m.length < 3) return v
  const h = m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('')
  const a = m[3] === undefined || +m[3] >= 1 ? '' : Math.round(+m[3] * 255).toString(16).padStart(2, '0')
  return '#' + h + a
}

/** Файл токенов в формате Design Tokens: его жуют плагины импорта в Figma */
export function buildTokensDoc(values: Record<string, string>, meta: { dark: boolean; font: string }) {
  const doc: Record<string, unknown> = {
    $description: `Promminer Pool — тема прототипа, ${meta.dark ? 'тёмная' : 'светлая'}`,
  }
  for (const [group, list] of Object.entries(EXPORT)) {
    const g: Record<string, unknown> = {}
    for (const [name] of list) {
      const v = values[`${group}.${name}`]
      if (!v) continue
      g[name] = { $type: isColorGroup(group) ? 'color' : group === 'font' ? 'fontSize' : 'dimension', $value: v }
    }
    if (Object.keys(g).length) doc[group] = g
  }
  const fam = values['font.family'] || meta.font
  if (fam) (doc.font as Record<string, unknown>).family = { $type: 'fontFamily', $value: fam }
  return doc
}
