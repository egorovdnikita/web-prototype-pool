/* Черновик раздела — то, чего в прототипе ещё нет.

   Прототип держится правилом «экраны сверяются с макетами Figma».
   Черновик это правило не нарушает, а обходит честно: он не притворяется
   разделом продукта. Это песочница — отдельный маршрут, отдельный пункт
   в сайдбаре с пометкой «черновик», и он не попадает ни в NAV, ни в TITLES,
   ни в сквозные проверки экранов.

   Модель (или локальная заготовка) возвращает не HTML, а **спецификацию
   из блоков дизайн-системы**: статистика, таблица, график, пустое
   состояние, вкладки, кнопки, текст. Отсюда три следствия:

   - свободного кода в прототипе не появляется, и ссылка не несёт чужой
     разметки — только данные, которые мы сами умеем проверить;
   - вид черновика собирается теми же `card()`, `seg()`, `chart()`, что
     и настоящие экраны, поэтому он выглядит как продукт, а не как макет
     из другого мира;
   - всё, что пришло снаружи, экранируется: черновик приезжает по ссылке,
     а ссылка — это чужой ввод. */
import {
  I, card, chart, dayChips, dyn, emptyBox, fsel, segi, segLine, status, type Model,
} from '@/legacy/prototype'

/** Виды диаграмм, которые черновик рисует сам */
export type ChartKind = 'line' | 'bars' | 'donut'

export type Block =
  /* Герой страницы: главное число крупно, рядом контекст и дельта.
     На экранах прототипа так открываются «Доход» и «Воркеры». */
  | { t: 'kpi'; label: string; value: string; note?: string; delta?: string; spark?: number[] }
  | { t: 'stats'; items: { label: string; value: string; note?: string }[] }
  | { t: 'table'; title?: string; cols: string[]; rows: string[][] }
  /* Рейтинг с полосами: «топ воркеров», «доли монет» — то, ради чего
     в дашбордах обычно и заводят отдельный блок рядом с графиком */
  | { t: 'list'; title?: string; items: { label: string; value: string; share?: number }[] }
  /* Лента событий: время, что случилось, чем кончилось */
  | { t: 'feed'; title?: string; items: { time: string; text: string; tone?: string }[] }
  /* Подсказка-плашка: то, что на настоящих экранах объясняет правило */
  | { t: 'callout'; title?: string; text: string; tone?: string }
  /* Без values это старый блок — график хэшрейта из прототипа. С values
     черновик рисует свою диаграмму: подписи и числа лежат в спецификации,
     поэтому по ссылке у всех одно и то же, а не случайные цифры. */
  | { t: 'chart'; title?: string; kind?: ChartKind; labels?: string[]; values?: number[]; unit?: string }
  | { t: 'empty'; title: string; text?: string }
  | { t: 'tabs'; items: string[] }
  | { t: 'actions'; items: string[] }
  | { t: 'text'; title?: string; text: string }

export interface Draft { title: string; blocks: Block[] }

/* Пределы. Они не про вкус, а про длину ссылки: черновик уезжает в хэш
   целиком, иначе коллега откроет пустоту. Кириллица в base64 — это почти
   три символа на букву, поэтому тексты короткие. */
export const CAPS = {
  title: 48, blocks: 9, text: 160, label: 32, value: 24,
  stats: 4, cols: 5, rows: 6, cell: 24, tabs: 4, actions: 3, listn: 5, feedn: 5,
  /* Точек на диаграмме и длина подписи под ней: и то и другое уезжает
     в ссылку, а больше восьми столбиков в карточке всё равно не читается */
  points: 8, plabel: 10, unit: 8,
  /* Потолок на всю спецификацию в закодированном виде. Проработанный
     экран — это девять блоков с доменными подписями, и в прежние 1800
     символов он не влезал: приходилось выбирать между «полный экран»
     и «работающая ссылка». Ключи в ссылке сокращены (см. SHORT), лимит
     поднят до 3500 — столько адрес держат и браузеры, и мессенджеры.
     Что не влезло, отбрасывается с конца. */
  link: 3500,
}

const clip = (v: unknown, n: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''
const list = (v: unknown) => (Array.isArray(v) ? v : [])

/** Проверка спецификации: неизвестные блоки выбрасываются, длины режутся.
    null — собирать нечего. */
export function vetDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = clip(r.title, CAPS.title)
  const blocks: Block[] = []
  for (const b0 of list(r.blocks).slice(0, CAPS.blocks)) {
    if (!b0 || typeof b0 !== 'object') continue
    const b = b0 as Record<string, unknown>
    switch (b.t) {
      case 'stats': {
        const items = list(b.items).slice(0, CAPS.stats).map((i) => {
          const o = (i || {}) as Record<string, unknown>
          return { label: clip(o.label, CAPS.label), value: clip(o.value, CAPS.value), note: clip(o.note, CAPS.label) }
        }).filter((i) => i.label || i.value)
        if (items.length) blocks.push({ t: 'stats', items })
        break
      }
      case 'table': {
        const cols = list(b.cols).slice(0, CAPS.cols).map((c) => clip(c, CAPS.cell)).filter(Boolean)
        if (!cols.length) break
        const rows = list(b.rows).slice(0, CAPS.rows)
          .map((row) => list(row).slice(0, cols.length).map((c) => clip(c, CAPS.cell)))
          .filter((row) => row.some(Boolean))
        blocks.push({ t: 'table', title: clip(b.title, CAPS.label), cols, rows })
        break
      }
      case 'chart': {
        const one: Block = { t: 'chart', title: clip(b.title, CAPS.label) }
        const values = list(b.values).slice(0, CAPS.points)
          .map((v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : NaN))
          .filter((v) => !isNaN(v))
        if (values.length > 1) {
          const labels = list(b.labels).slice(0, values.length).map((l) => clip(l, CAPS.plabel))
          one.kind = ['line', 'bars', 'donut'].includes(b.kind as string) ? b.kind as ChartKind : 'line'
          one.values = values
          /* Подписей может прийти меньше, чем чисел — добиваем номерами,
             иначе столбики поедут относительно оси */
          one.labels = values.map((_, i) => labels[i] || String(i + 1))
          one.unit = clip(b.unit, CAPS.unit)
        }
        blocks.push(one)
        break
      }
      case 'kpi': {
        const label = clip(b.label, CAPS.label), value = clip(b.value, CAPS.value)
        const spark = list(b.spark).slice(0, CAPS.points)
          .map((v) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : NaN))
          .filter((v) => !isNaN(v))
        if (label && value) blocks.push({ t: 'kpi', label, value,
          note: clip(b.note, CAPS.label), delta: clip(b.delta, 12),
          ...(spark.length > 2 ? { spark } : {}) })
        break
      }
      case 'list': {
        const items = list(b.items).slice(0, CAPS.listn).map((i) => {
          const o = (i || {}) as Record<string, unknown>
          const share = typeof o.share === 'number' && isFinite(o.share)
            ? Math.max(0, Math.min(100, Math.round(o.share))) : undefined
          return { label: clip(o.label, CAPS.label), value: clip(o.value, CAPS.value), share }
        }).filter((i) => i.label)
        if (items.length) blocks.push({ t: 'list', title: clip(b.title, CAPS.label), items })
        break
      }
      case 'feed': {
        const items = list(b.items).slice(0, CAPS.feedn).map((i) => {
          const o = (i || {}) as Record<string, unknown>
          return { time: clip(o.time, 16), text: clip(o.text, CAPS.text), tone: clip(o.tone, 8) }
        }).filter((i) => i.text)
        if (items.length) blocks.push({ t: 'feed', title: clip(b.title, CAPS.label), items })
        break
      }
      case 'callout': {
        const text = clip(b.text, CAPS.text)
        if (text) blocks.push({ t: 'callout', title: clip(b.title, CAPS.label), text, tone: clip(b.tone, 8) })
        break
      }
      case 'empty': {
        const title2 = clip(b.title, CAPS.label)
        if (title2) blocks.push({ t: 'empty', title: title2, text: clip(b.text, CAPS.text) })
        break
      }
      case 'tabs': {
        const items = list(b.items).slice(0, CAPS.tabs).map((i) => clip(i, CAPS.label)).filter(Boolean)
        if (items.length > 1) blocks.push({ t: 'tabs', items })
        break
      }
      case 'actions': {
        const items = list(b.items).slice(0, CAPS.actions).map((i) => clip(i, CAPS.label)).filter(Boolean)
        if (items.length) blocks.push({ t: 'actions', items })
        break
      }
      case 'text': {
        const text = clip(b.text, CAPS.text)
        if (text) blocks.push({ t: 'text', title: clip(b.title, CAPS.label), text })
        break
      }
      default: break
    }
  }
  if (!title || !blocks.length) return null
  /* Режем с конца, пока не влезет в ссылку. Первый блок оставляем всегда:
     без него это уже не черновик. */
  while (blocks.length > 1 && encodeDraft({ title, blocks }).length > CAPS.link) blocks.pop()
  
  return { title, blocks }
}

/** Сколько символов займёт черновик в ссылке — панели и тестам */
export const draftSize = (d: Draft) => encodeDraft(d).length

/* ===== ссылка ===== */

const b64url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/')

/* Ключи в ссылке сокращены: «title» и «values» на каждом блоке стоили
   больше, чем сами данные. Сжатия нет намеренно — CompressionStream
   асинхронный, а состояние читается при первом рендере. */
const SHORT: Record<string, string> = {
  title: 'a', blocks: 'b', items: 'c', label: 'd', value: 'e', note: 'f',
  cols: 'g', rows: 'h', kind: 'i', labels: 'j', values: 'k', unit: 'l',
  text: 'm', share: 'n', time: 'o', tone: 'p', delta: 'q',
}
const LONG: Record<string, string> = Object.fromEntries(
  Object.entries(SHORT).map(([k, v]) => [v, k]))

const rename = (v: unknown, map: Record<string, string>): unknown => {
  if (Array.isArray(v)) return v.map((x) => rename(x, map))
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => [map[k] || k, rename(x, map)]))
  }
  return v
}

/** Черновик в ссылку: JSON с короткими ключами → UTF-8 → base64url */
export function encodeDraft(d: Draft): string {
  const json = JSON.stringify(rename(d, SHORT))
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return b64url(btoa(bin))
}

export function decodeDraft(s: string): Draft | null {
  if (!s) return null
  try {
    const bin = atob(unb64url(s))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return vetDraft(rename(JSON.parse(new TextDecoder().decode(bytes)), LONG))
  } catch { return null }
}

/* ===== разметка ===== */

/** Черновик приезжает по ссылке, а ссылка — чужой ввод. Ничего из него
    не должно стать разметкой: экранируем всё до единого поля. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const head = (t: string) => (t ? `<div class="ch"><h2>${esc(t)}</h2></div>` : '')

/* Настоящие экраны прототипа устроены плотнее голого списка блоков:
   у карточки есть шапка с заголовком и контролами, у таблицы — фильтр,
   статусы и пагинация, у показателей — иконка и дельта. Черновик
   собирается по тем же правилам, иначе он выглядит наброском, даже когда
   данные в нём осмысленные. */

/** Иконка показателя по смыслу подписи */
const STAT_ICO: [RegExp, string, string][] = [
  [/изменен|рост|динамик|прирост/, 'bars', 'var(--pos)'],
  [/хэшрейт|хешрейт|мощност/, 'monitor', 'var(--accent)'],
  [/воркер|устройств|оборуд/, 'pc', 'var(--accent)'],
  [/реферал|партн|клиент|польз/, 'ref', 'var(--warn)'],
  [/бонус|акци|промо/, 'pie', 'var(--warn)'],
  [/доход|сумм|выплач|прибыл|баланс|₽|\$/, 'wallet', 'var(--pos)'],
  [/период|дата|срок|время|сутк|24 ч/, 'clock', 'var(--accent)'],
]
/* Смотрим и на подпись, и на значение: «Всего за период» без значения
   выглядит как про время, а «128 400 ₽» сразу говорит, что это деньги */
const statIco = (label: string, value: string) => {
  const s = (label + ' ' + value).toLowerCase()
  const hit = STAT_ICO.find(([re]) => re.test(s))
  const [, name, color] = hit || [null, 'bars', 'var(--accent)']
  return { html: I[name] || I.bars, color }
}

/* Значение вида «+12%» или «−8%» — это дельта, её место на бейдже */
const DELTA = /^[+\-−]\d+([.,]\d+)?\s*%$/
/* Числовые ячейки в таблицах прототипа прижаты вправо и набраны mono */
const NUMCELL = /^[+\-−]?[\d\s.,]+(%|₽|\$|TH\/s|GH\/s)?$/
/* Дата тоже состоит из цифр, но в таблицах прототипа она слева */
const DATECELL = /^\d{2}[.:]\d{2}(\.\d{2,4})?$/
const isNum = (v: string) => NUMCELL.test(v) && !DATECELL.test(v)
const ST_PILL: [RegExp, 'ok' | 'warn' | 'err' | 'off'][] = [
  [/заверш|готов|активн|успеш|выплач/i, 'ok'],
  [/обработ|ожид|в работе|генерир/i, 'warn'],
  [/отклон|ошибк|сбой|отмен/i, 'err'],
]

/** Шапка карточки: заголовок слева, контролы справа — как на экранах */
const cardHead = (title: string, right = '') =>
  `<div class="ch"><h2>${esc(title)}</h2>${right ? `<div class="spacer"></div>${right}` : ''}</div>`

/** Спецификация → разметка: блоки дизайн-системы плюс свои диаграммы */
export function renderDraft(d: Draft, m: Model): string {
  const one = (b: Block, i: number) => block(b, i, m, d)
  /* Рейтинг рядом с диаграммой, а не под ней: страница из одинаковых
     карточек в столбик — первое, по чему видно генерацию. Пара идёт
     в две колонки и схлопывается на узком экране. */
  const out: string[] = []
  for (let i = 0; i < d.blocks.length; i++) {
    const b = d.blocks[i], next = d.blocks[i + 1]
    if (b.t === 'chart' && next?.t === 'list') {
      out.push(`<div class="dpair">${one(b, i)}${one(next, i + 1)}</div>`)
      i++
      continue
    }
    out.push(one(b, i))
  }
  /* Панель фильтров — одна на страницу. Раньше чипы периода висели
     на каждой карточке: три одинаковых контрола в столбик читаются
     как шум, а не как управление. */
  const bar = d.blocks.some((b) => b.t === 'chart' || b.t === 'table')
    ? `<div class="dtools">${dayChips('draft-period', 1)}
        <div class="spacer"></div>
        <button class="btn out" data-toast="Экспорт — это черновик, кнопка ничего не делает">Экспорт</button>
      </div>`
    : ''
  const note = `<div class="draftbar">${status('warn', 'Черновик')}`
    + '<span>Собран в чате из блоков дизайн-системы. С макетами не сверялся, '
    + 'данные выдуманы — живёт в вашей ссылке.</span>'
    + '<button class="btn link" data-panel>Изменить в чате</button></div>'
  return note + bar + out.join('')
}

function block(b: Block, i: number, m: Model, page: Draft): string {
  {
    void page
    switch (b.t) {
      case 'stats':
        /* Сетка под число показателей: три карточки в ряду на четыре
           колонки оставляли дырку справа — на экранах прототипа так не бывает */
        return `<div class="grid g${Math.min(4, Math.max(2, b.items.length))}" style="gap:var(--sp4);margin:0">${b.items.map((s) => {
          const ico = statIco(s.label, s.value)
          /* «+12%» — это дельта, а не значение: у прототипа для неё бейдж */
          const vd = DELTA.test(s.value)
          const nd = !!s.note && DELTA.test(s.note)
          const badge = (v: string) => dyn(/^[-−]/.test(v) ? 'neg' : 'ok', esc(v.replace(/^[+\-−]/, '')))
          /* Дельта стоит под числом, а не рядом с иконкой: иначе
             «318 600 ₽» с бейджем и иконкой в одной строке ломается
             на две — ровно та рябь, по которой видно наспех собранный экран */
          return `<div class="statcard"><div class="stcol"><div class="cap">${esc(s.label)}</div>`
            + `${vd ? badge(s.value) : `<div class="n mono">${esc(s.value)}</div>`}`
            + `${nd ? `<div class="stdelta">${badge(s.note!)}</div>` : ''}`
            + `${s.note && !nd ? `<div class="cap" style="margin:4px 0 0">${esc(s.note)}</div>` : ''}</div>`
            + `<div class="ic" style="background:color-mix(in srgb, ${ico.color} 16%, transparent);color:${ico.color}">`
            + `${ico.html}</div></div>`
        }).join('')}</div>`
      case 'table': {
        const id = `draft-tbl-${i}`
        /* Фильтр по статусу — не украшение: он и правда режет строки */
        const stCol = b.cols.findIndex((c) => /статус/i.test(c))
        const opts = stCol >= 0
          ? ['Все статусы', ...new Set(b.rows.map((r) => r[stCol]).filter(Boolean))]
          : []
        const pick = opts.length ? segi(`${id}-st`, 0) : 0
        const rows = stCol >= 0 && pick > 0 ? b.rows.filter((r) => r[stCol] === opts[pick]) : b.rows
        /* Из контролов на карточке оставляем тот, что делает дело:
           фильтр по статусу. Период — общий, он в панели сверху. */
        const right = opts.length > 1 ? fsel(`${id}-st`, opts) : ''
        return card(`${cardHead(b.title || 'Данные', right)}`
          + (rows.length
            ? `<div class="tw"><table class="tbl"><thead><tr>${b.cols.map((c, j) =>
              `<th${j && isNum(rows[0][j] || '') ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}`
              + `</tr></thead><tbody>${rows.map((r) => `<tr>${b.cols.map((_, j) => {
                const v = r[j] || '—'
                const st = ST_PILL.find(([re]) => re.test(v))
                if (st) return `<td>${status(st[1], esc(v))}</td>`
                return isNum(v)
                  ? `<td class="num mono">${esc(v)}</td>`
                  : `<td class="${DATECELL.test(v) ? 'mono' : ''}">${esc(v)}</td>`
              }).join('')}</tr>`).join('')}</tbody></table></div>`

            : emptyBox('Пока пусто', 'Данных для этой таблицы ещё нет'))
          + (rows.length ? `<div class="dnote">${rowsNote(rows.length)}`
            + '<button class="btn link" data-toast="Полный список — это черновик">Показать все</button></div>' : ''))
      }
      case 'chart': {
        if (!b.values || !b.labels) return card(`${cardHead(b.title || 'График')}${chart(m)}`)
        /* Период общий для всей страницы и реально режет ряд */
        const cut = [Math.max(2, Math.ceil(b.values.length / 2)), b.values.length, b.values.length][segi('draft-period', 1)]
        const labels = b.kind === 'donut' ? b.labels : b.labels.slice(-cut)
        const values = b.kind === 'donut' ? b.values : b.values.slice(-cut)
        const sub = b.kind === 'donut'
          ? `Доли от ${nfmt(values.reduce((x, y) => x + y, 0))}${b.unit ? ' ' + esc(b.unit) : ''}`
          : `По дням${b.unit ? `, ${esc(b.unit)}` : ''} · всего ${nfmt(values.reduce((x, y) => x + y, 0))}`
        return card(`${cardHead(b.title || 'График')}<p class="dsub">${sub}</p>`
          + drawChart(b.kind || 'line', labels, values, b.unit || ''))
      }
      case 'kpi':
        /* Герой страницы — акцентная плашка дизайн-системы. Справа
           спарклайн: иначе половина плашки пустая, а это первое,
           за что цепляется глаз на широком экране. */
        return card(`<div class="hero dhero">
          <div class="dheroL">
            <div class="hrow"><span class="l">${esc(b.label)}</span>
              ${b.delta ? dyn(/^[-−]/.test(b.delta) ? 'neg' : 'teal', esc(b.delta.replace(/^[+\-−]/, ''))) : ''}</div>
            <div class="hval"><div class="v mono">${esc(b.value)}</div>
              ${b.note ? `<div class="s mono">${esc(b.note)}</div>` : ''}</div>
          </div>
          ${b.spark && b.spark.length > 2 ? spark(b.spark) : ''}</div>`)
      case 'list': {
        const max = Math.max(...b.items.map((x) => x.share ?? 0), 1)
        return card(`${cardHead(b.title || 'Рейтинг')}
          <p class="dsub">Доля от общего объёма</p>
          <div class="dlist">${b.items.map((x, n) => `<div class="drow">
            <span class="dn">${n + 1}</span>
            <span class="dnm">${esc(x.label)}</span>
            <span class="dbarline"><i style="width:${Math.round(((x.share ?? 0) / max) * 100)}%"></i></span>
            <b class="mono">${esc(x.value)}</b>
            ${x.share !== undefined ? `<em>${x.share}%</em>` : ''}
          </div>`).join('')}</div>`)
      }
      case 'feed':
        return card(`${cardHead(b.title || 'Последние события')}
          <div class="dfeed">${b.items.map((x) => `<div class="dfrow">
            <i class="${TONE[x.tone || ''] || 'neu'}"></i>
            <span class="dft mono">${esc(x.time)}</span>
            <span class="dfx">${esc(x.text)}</span></div>`).join('')}</div>`)
      case 'callout':
        return `<div class="dcallout ${TONE[b.tone || ''] || 'neu'}">
          <i>${I.inf}</i><div>${b.title ? `<b>${esc(b.title)}</b>` : ''}
          <span>${esc(b.text)}</span></div></div>`
      case 'empty':
        return card(`${cardHead(b.title)}${emptyBox(esc(b.title), esc(b.text || ''))}`)
      case 'tabs':
        return `<div class="row" style="margin:0">${segLine(`draft-${i}`, b.items.map(esc), 0, 'fill')}</div>`
      case 'actions':
        return card(`${cardHead('Действия',
          b.items.map((a, j) => `<button class="btn ${j ? 'out' : ''}" `
            + `data-toast="${esc(a)} — это черновик, кнопка ничего не делает">${esc(a)}</button>`).join(''))}`)
      case 'text':
        return card(`${b.title ? cardHead(b.title) : ''}<p class="bs" style="color:var(--c2)">${esc(b.text)}</p>`)
      default:
        return ''
    }
  }
}

/** Спарклайн героя: тот же ряд, что и на диаграмме, но без осей */
function spark(values: number[]) {
  const max = Math.max(...values), min = Math.min(...values, 0)
  const W = 240, H = 64
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / (max - min || 1)) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `<svg class="dspark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="M${pts.join(' L')} L${W},${H} L0,${H} Z" fill="currentColor" opacity=".18"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"
      vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`
}

/* Тон события и подсказки: те же три состояния, что у статусов */
const TONE: Record<string, string> = { ok: 'ok', warn: 'warn', err: 'err', neu: 'neu' }


/** Локальная заготовка: без модели придумать содержимое неоткуда, но
    каркас раздела собрать можно — дальше он правится фразами или руками. */
export function skeletonDraft(title: string): Draft {
  const seed = seedOf(title)
  const r = rnd(seed)
  const line = genSeries('line', title, seed)
  const big = line.values[line.values.length - 1]
  return {
    title: title.slice(0, CAPS.title),
    blocks: [
      { t: 'stats', items: [
        { label: 'Всего', value: nfmt(big * 8) + (line.unit ? ' ' + line.unit : '') },
        { label: 'За 24 ч', value: nfmt(big) + (line.unit ? ' ' + line.unit : '') },
        { label: 'В среднем', value: nfmt(Math.round(line.values.reduce((a, b) => a + b, 0) / line.values.length)) },
        { label: 'Изменение', value: (r() > 0.5 ? '+' : '−') + (1 + Math.floor(r() * 20)) + '%' },
      ] },
      { t: 'chart', kind: 'line', title: 'Динамика', ...line },
      { t: 'table', title: 'Последние события', cols: ['Дата', 'Событие', 'Значение'],
        rows: genRows(['Дата', 'Событие', 'Значение'], 5, seed) },
    ],
  }
}

/* ===== диаграммы =====

   В дизайн-системе один график — линия хэшрейта, и она про хэшрейт.
   Черновику нужны свои: столбики, линия и кольцо по произвольным числам.
   Рисуем их сами, но цветами и радиусами дизайн-системы, чтобы черновик
   не выпадал из прототипа. Числа приходят из спецификации — значит,
   по ссылке у всех одна и та же картинка. */

/** Палитра диаграмм: акцент и статусные цвета — они меняются вместе с темой */
const HUES = ['var(--accent)', 'var(--pos)', 'var(--warn)', 'var(--neg)', 'var(--c3)', 'var(--accent-h)']
const nfmt = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ru') : String(v))

export function drawChart(kind: ChartKind, labels: string[], values: number[], unit: string) {
  if (kind === 'donut') return drawDonut(labels, values, unit)
  if (kind === 'bars') return drawBars(labels, values, unit)
  return drawLine(labels, values, unit)
}

/* Круглый потолок шкалы: 87 → 100, 41 743 → 50 000. Без него подписи
   на оси выглядят случайными числами, как в наспех сделанном макете. */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}
/** Ось значений слева и линии сетки — как на графиках прототипа */
function axis(max: number, unit: string) {
  const ticks = [1, 0.75, 0.5, 0.25, 0]
  return {
    col: `<div class="dax">${ticks.map((k) =>
      `<span>${nfmt(Math.round(max * k))}</span>`).join('')}</div>`,
    grid: `<div class="dgridlines">${ticks.map(() => '<i></i>').join('')}</div>`,
    unit: unit ? `<span class="dunit">${esc(unit)}</span>` : '',
  }
}
/** Подпись ряда под диаграммой: цвет, название, единица */
const legend = (name: string, unit: string) =>
  `<div class="dleg row"><span><i style="background:${HUES[0]}"></i>${esc(name)}`
  + `${unit ? ` <b>${esc(unit)}</b>` : ''}</span></div>`

function drawBars(labels: string[], values: number[], unit: string) {
  const max = niceMax(Math.max(...values, 1))
  const a = axis(max, unit)
  return `<div class="dchart">${a.unit}
    <div class="dplotrow">${a.col}
      <div class="dplot">${a.grid}
        <div class="dbars">${values.map((v, i) => {
          /* Число подписываем у пика, остальные читаются по сетке:
             восемь подписей подряд — это таблица, а не диаграмма */
          const top = v === Math.max(...values)
          return `<div class="dbar" title="${esc(labels[i])}: ${nfmt(v)}">
            ${top ? `<span class="dv">${nfmt(v)}</span>` : ''}
            <i class="${top ? 'top' : ''}" style="height:${Math.max(2, (v / max) * 100)}%"></i>
          </div>`
        }).join('')}</div>
      </div>
    </div>
    <div class="dls">${labels.map((l, i) =>
      `<span>${labels.length > 6 && i % 2 ? '' : esc(l)}</span>`).join('')}</div>
    ${legend('Значение', unit)}</div>`
}

function drawLine(labels: string[], values: number[], unit: string) {
  const max = niceMax(Math.max(...values, 1))
  const W = 600, H = 180
  const x = (i: number) => (values.length < 2 ? 0 : (i / (values.length - 1)) * W)
  const y = (v: number) => H - (v / max) * H
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const a = axis(max, unit)
  return `<div class="dchart">${a.unit}
    <div class="dplotrow">${a.col}
      <div class="dplot">${a.grid}
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="dline" aria-hidden="true">
          <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/>
            <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
          <path d="M${pts.join(' L')} L${W},${H} L0,${H} Z" fill="url(#dg)"/>
          <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"
            vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        </svg>
        <div class="ddots">${values.map((v, i) => {
          /* Точки на каждом дне превращают линию в бусы — оставляем пик
             и последнее значение, по ним и читают график */
          const show = v === Math.max(...values) || i === values.length - 1
          return show
            ? `<i class="${i === values.length - 1 ? 'last' : ''}" style="left:${(x(i) / W) * 100}%;bottom:${(v / max) * 100}%" title="${esc(labels[i])}: ${nfmt(v)}"></i>`
            : ''
        }).join('')}</div>
      </div>
    </div>
    <div class="dls">${labels.map((l, i) =>
      `<span>${labels.length > 6 && i % 2 ? '' : esc(l)}</span>`).join('')}</div>
    ${legend('Значение', unit)}</div>`
}

function drawDonut(labels: string[], values: number[], unit: string) {
  const sum = values.reduce((a, b) => a + b, 0) || 1
  const R = 60, C = 2 * Math.PI * R
  let off = 0
  const rings = values.map((v, i) => {
    const len = (v / sum) * C
    const seg = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${HUES[i % HUES.length]}"
      stroke-width="26" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}"
      stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 80 80)"/>`
    off += len
    return seg
  }).join('')
  return `<div class="dchart donut">
    <div class="ddwrap">
      <svg viewBox="0 0 160 160" class="ddonut" aria-hidden="true">${rings}</svg>
      <div class="ddmid"><b>${nfmt(sum)}</b><span>${esc(unit || 'всего')}</span></div>
    </div>
    <div class="dleg">${values.map((v, i) =>
      `<span><i style="background:${HUES[i % HUES.length]}"></i>${esc(labels[i])}
        <b>${nfmt(v)}${esc(unit ? ' ' + unit : '')}</b>
        <em>${Math.round((v / sum) * 100)}%</em></span>`).join('')}</div></div>`
}

/* ===== данные =====

   Числа для диаграмм и строки таблиц черновик придумывает сам, но не
   случайно: зерно считается от названия раздела, поэтому одна и та же
   просьба даёт одну и ту же картинку, а ссылка воспроизводится. */

export function seedOf(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function rnd(seed: number) {
  let a = seed || 1
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = (n: number) => {
  const d = new Date(2026, 1, 2 + n)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** Категории для кольцевой диаграммы — по теме раздела */
const SLICES: [RegExp, string[]][] = [
  [/монет|доход|выплат|финанс/, ['BTC', 'LTC', 'DOGE', 'ZEC']],
  [/воркер|парк|оборуд/, ['Активные', 'Низкий', 'Оффлайн']],
  [/реферал|партн/, ['1 уровень', '2 уровень', '3 уровень']],
  [/бонус|акци|промо/, ['Начислено', 'Использовано', 'Сгорело']],
]
/* По умолчанию делим по монетам: для майнинг-пула это самый естественный
   разрез, и он честнее безликих «Доля A, B, C» */
const SLICE_DEF = ['BTC', 'LTC', 'ZEC']

/** Ряд чисел с подписями: по дням для линии и столбиков, по категориям
    для кольца. Масштаб зависит от темы — деньги, хэшрейт или счёт. */
export function genSeries(kind: ChartKind, topic: string, seed: number) {
  const r = rnd(seed)
  const low = topic.toLowerCase()
  const money = /доход|выплат|финанс|бонус|сумма|платеж|платёж|реферал|партн/.test(low)
  const hash = /хэшрейт|хешрейт|мощност|воркер/.test(low)
  const base = money ? 40000 + Math.floor(r() * 60000) : hash ? 400 + Math.floor(r() * 600) : 40 + Math.floor(r() * 160)
  const unit = money ? '₽' : hash ? 'TH/s' : ''
  if (kind === 'donut') {
    const labels = (SLICES.find(([re]) => re.test(low)) || [null, SLICE_DEF])[1]
    return { labels, values: labels.map(() => Math.round(base * (0.3 + r()))), unit }
  }
  const n = CAPS.points
  const values: number[] = []
  let v = base
  for (let i = 0; i < n; i++) {
    v = Math.max(1, Math.round(v * (0.85 + r() * 0.35)))
    values.push(v)
  }
  return { labels: Array.from({ length: n }, (_, i) => DAY(i)), values, unit }
}

/* Что подставлять в колонку таблицы — по её заголовку. Названия колонок
   приходят от темы раздела, поэтому и содержимое получается правдоподобным. */
const CELLS: [RegExp, (r: () => number, i: number) => string][] = [
  [/дата|день|период/, (_r, i) => DAY(i)],
  [/время/, (r) => `${String(8 + Math.floor(r() * 12)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`],
  [/сумма|доход|начислен|выплач|оборот|прибыл/, (r) => `${(10000 + Math.floor(r() * 90000)).toLocaleString('ru')} ₽`],
  [/хэшрейт|хешрейт|мощност/, (r) => `${(100 + Math.floor(r() * 900))} TH/s`],
  [/статус/, (r) => ['Завершён', 'В обработке', 'Отклонён'][Math.floor(r() * 3)]],
  [/кошел|счет|счёт|адрес/, (r) => `1A1z****${String(Math.floor(r() * 9000) + 1000)}`],
  [/реферал|партн|клиент|польз/, (r) => `ID ${Math.floor(r() * 9000) + 1000}`],
  [/воркер|устройств/, (r) => `worker-${Math.floor(r() * 90) + 10}`],
  [/монет|валют/, (r) => ['BTC', 'LTC', 'ZEC'][Math.floor(r() * 3)]],
  [/бонус|акци|промо/, (r) => ['Приветственный', 'За объём', 'Реферальный'][Math.floor(r() * 3)]],
  [/отч[её]т|документ/, (_r, i) => `Отчёт №${101 + i}`],
  [/событи|операц|тип/, (r) => ['Начисление', 'Списание', 'Корректировка'][Math.floor(r() * 3)]],
  [/уровен|тариф/, (r) => `${5 * (1 + Math.floor(r() * 5))}%`],
  [/показател|метрик/, (r) => ['Хэшрейт', 'Доход', 'Реджект', 'Uptime'][Math.floor(r() * 4)]],
]

/** Строки таблицы по названиям колонок */
export function genRows(cols: string[], n: number, seed: number) {
  const r = rnd(seed)
  return Array.from({ length: Math.min(n, CAPS.rows) }, (_, i) => cols.map((c) => {
    const low = c.toLowerCase()
    const hit = CELLS.find(([re]) => re.test(low))
    return hit ? hit[1](r, i) : `${(100 + Math.floor(r() * 900))}`
  }))
}

/* Рейтинги и ленты: те же выдуманные, но правдоподобные данные —
   имена берём по теме раздела, доли считаем от значений. */

const RANK_NAMES: [RegExp, string[]][] = [
  [/монет|доход|выплат|финанс/, ['BTC', 'LTC', 'DOGE', 'ZEC']],
  [/реферал|партн/, ['ID 8842', 'ID 1207', 'ID 3391', 'ID 5560']],
  [/бонус|акци|промо/, ['Приветственный', 'За объём', 'Реферальный', 'Сезонный']],
  [/отч[её]т|документ/, ['Январь', 'Февраль', 'Март', 'Апрель']],
]
const RANK_DEF = ['worker-12', 'worker-07', 'worker-31', 'worker-45']

/** Рейтинг с долями: «топ воркеров», «доход по монетам» */
export function genList(topic: string, seed: number) {
  const r = rnd(seed)
  const low = topic.toLowerCase()
  const names = (RANK_NAMES.find(([re]) => re.test(low)) || [null, RANK_DEF])[1]
  const money = /доход|выплат|финанс|бонус|реферал|партн/.test(low)
  const raw = names.map(() => 1 + r() * 3)
  const sum = raw.reduce((a, b) => a + b, 0)
  return names.map((label, i) => ({
    label,
    value: money
      ? `${Math.round((raw[i] / sum) * 400000).toLocaleString('ru')} ₽`
      : `${Math.round(raw[i] * 300)} TH/s`,
    share: Math.round((raw[i] / sum) * 100),
  }))
}

const EVENTS: [RegExp, [string, string][]][] = [
  [/выплат|финанс|платеж/, [
    ['Выплата отправлена на кошелёк', 'ok'], ['Выплата в обработке', 'warn'],
    ['Выплата отклонена: не пройдена верификация', 'err'], ['Порог выплаты снижен до 0,001 BTC', 'neu'],
    ['Добавлен новый кошелёк', 'neu']]],
  [/реферал|партн/, [
    ['Новый реферал подключился', 'ok'], ['Начислено вознаграждение за месяц', 'ok'],
    ['Реферал отключил последнего воркера', 'warn'], ['Уровень программы повышен до 15%', 'neu'],
    ['Ссылка приглашения обновлена', 'neu']]],
  [/воркер|парк|монитор/, [
    ['Воркер вернулся в строй', 'ok'], ['Низкий хэшрейт на трёх воркерах', 'warn'],
    ['Парк ушёл в оффлайн на 12 минут', 'err'], ['Добавлено 40 воркеров', 'neu'],
    ['Прошивка обновлена', 'neu']]],
]
const EVENT_DEF: [string, string][] = [
  ['Данные обновлены', 'ok'], ['Изменение применено', 'neu'],
  ['Показатель вышел за порог', 'warn'], ['Задача завершилась с ошибкой', 'err'],
  ['Новая запись добавлена', 'neu'],
]

/** Лента событий: время и что случилось */
export function genFeed(topic: string, seed: number) {
  const r = rnd(seed)
  const low = topic.toLowerCase()
  const src = (EVENTS.find(([re]) => re.test(low)) || [null, EVENT_DEF])[1]
  return src.slice(0, CAPS.feedn).map(([text, tone], i) => ({
    time: `${DAY(CAPS.points - 1 - i)} ${String(9 + Math.floor(r() * 12)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
    text, tone,
  }))
}

/* ===== один набор чисел на всю страницу =====

   Главная примета сгенерированного экрана — цифры, которые не сходятся:
   герой показывает 866 656 ₽, столбики дают в сумме 480 тысяч, таблица
   живёт своей жизнью, а доли не складываются в сто процентов. Поэтому
   страница считается из одного ряда: сумма ряда — это герой, его дни —
   это подписи диаграммы, строки таблицы и время в ленте, а доли режут
   ту же сумму. */

export interface PageData {
  unit: string
  money: boolean
  days: string[]
  series: number[]
  total: number
  last: number
  prev: number
  delta: number
  avg: number
  max: number
  split: { label: string; value: string; share: number }[]
  feed: { time: string; text: string; tone: string }[]
}

const money = (v: number) => `${Math.round(v).toLocaleString('ru')} ₽`
const withUnit = (v: number, unit: string) =>
  unit === '₽' ? money(v) : `${Math.round(v).toLocaleString('ru')}${unit ? ' ' + unit : ''}`

export function pageData(topic: string): PageData {
  const seed = seedOf(topic)
  const { labels: days, values: series, unit } = genSeries('line', topic, seed)
  const total = series.reduce((a, b) => a + b, 0)
  const last = series[series.length - 1], prev = series[series.length - 2] || last
  const r = rnd(seed ^ 0x9e37)
  const low = topic.toLowerCase()
  const names = (RANK_NAMES.find(([re]) => re.test(low)) || [null, RANK_DEF])[1]
  /* Доли режут ту же сумму и складываются ровно в сто процентов —
     остаток отдаём первой строке, иначе «99%» бросается в глаза */
  const raw = names.map(() => 1 + r() * 3)
  const sum = raw.reduce((a, b) => a + b, 0)
  const shares = raw.map((x) => Math.round((x / sum) * 100))
  shares[0] += 100 - shares.reduce((a, b) => a + b, 0)
  const split = names.map((label, i) => ({
    label, value: withUnit((total * shares[i]) / 100, unit), share: shares[i],
  }))
  const src = (EVENTS.find(([re]) => re.test(low)) || [null, EVENT_DEF])[1]
  const feed = src.slice(0, CAPS.feedn).map(([text, tone], i) => ({
    time: `${days[days.length - 1 - i] || days[0]} ${String(9 + Math.floor(r() * 12)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
    text, tone,
  }))
  return {
    unit, money: unit === '₽', days, series, total, last, prev,
    delta: Math.round(((last - prev) / (prev || 1)) * 100),
    avg: Math.round(total / series.length),
    max: Math.max(...series),
    split, feed,
  }
}

/** Строки таблицы из тех же дней и значений, что и диаграмма */
export function rowsFor(cols: string[], d: PageData): string[][] {
  const r = rnd(seedOf(cols.join()))
  const from = Math.max(0, d.days.length - CAPS.rows)
  /* Свежие записи сверху — как в «Истории выплат» на настоящем экране */
  return d.days.slice(from).map((day, k) => [day, d.series[from + k]] as const)
    .reverse()
    .map(([day, val], i) => cols.map((c) => {
    const low = c.toLowerCase()
    if (/дата|день|период/.test(low)) return day
    if (/сумма|доход|начислен|выплач|оборот|прибыл|значен/.test(low)) return withUnit(val, d.unit)
    if (/хэшрейт|хешрейт|мощност/.test(low)) return `${Math.round(val / 100)} TH/s`
    const hit = CELLS.find(([re]) => re.test(low))
    return hit ? hit[1](r, i) : String(Math.round(val))
  }))
}

/** Сколько строк показали из скольких — вместо пагинации на пять записей */
export const rowsNote = (n: number) => `Показаны ${n} последних записей`
