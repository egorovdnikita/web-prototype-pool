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
import { card, chart, emptyBox, seg, status, type Model } from '@/legacy/prototype'

export type Block =
  | { t: 'stats'; items: { label: string; value: string; note?: string }[] }
  | { t: 'table'; cols: string[]; rows: string[][] }
  | { t: 'chart'; title?: string }
  | { t: 'empty'; title: string; text?: string }
  | { t: 'tabs'; items: string[] }
  | { t: 'actions'; items: string[] }
  | { t: 'text'; title?: string; text: string }

export interface Draft { title: string; blocks: Block[] }

/* Пределы. Они не про вкус, а про длину ссылки: черновик уезжает в хэш
   целиком, иначе коллега откроет пустоту. Кириллица в base64 — это почти
   три символа на букву, поэтому тексты короткие. */
export const CAPS = {
  title: 48, blocks: 6, text: 160, label: 32, value: 24,
  stats: 4, cols: 5, rows: 6, cell: 24, tabs: 4, actions: 3,
  /* Потолок на всю спецификацию в закодированном виде. Пределы по полям
     его не гарантируют: шесть таблиц кириллицей дают под пять тысяч
     символов, а ссылку такой длины уже неудобно пересылать. Поэтому
     после сборки лишние блоки с конца отбрасываются — лучше короткий
     черновик, который открывается по ссылке, чем полный, который нет. */
  link: 1800,
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
        blocks.push({ t: 'table', cols, rows })
        break
      }
      case 'chart':
        blocks.push({ t: 'chart', title: clip(b.title, CAPS.label) })
        break
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

/** Черновик в ссылку: JSON → UTF-8 → base64url. Сжатия нет намеренно —
    оно асинхронное, а состояние читается при первом рендере. Пределы
    сверху держат длину в районе киловатта символов. */
export function encodeDraft(d: Draft): string {
  const json = JSON.stringify(d)
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
    return vetDraft(JSON.parse(new TextDecoder().decode(bytes)))
  } catch { return null }
}

/* ===== разметка ===== */

/** Черновик приезжает по ссылке, а ссылка — чужой ввод. Ничего из него
    не должно стать разметкой: экранируем всё до единого поля. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const head = (t: string) => (t ? `<div class="ch"><h2>${esc(t)}</h2></div>` : '')

/** Спецификация → разметка из блоков дизайн-системы */
export function renderDraft(d: Draft, m: Model): string {
  const out = d.blocks.map((b, i) => {
    switch (b.t) {
      case 'stats':
        return card(`<div class="grid g4" style="gap:var(--sp4);margin:0">${b.items.map((s) =>
          `<div class="statcard"><div><div class="cap">${esc(s.label)}</div>`
          + `<div class="n mono">${esc(s.value)}</div></div>`
          + `${s.note ? `<div class="cap">${esc(s.note)}</div>` : ''}</div>`).join('')}</div>`)
      case 'table':
        return card(`<div class="tw"><table class="tbl"><thead><tr>${b.cols.map((c) =>
          `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) =>
          `<tr>${b.cols.map((_, j) => `<td class="mono">${esc(r[j] || '—')}</td>`).join('')}</tr>`).join('')
          || `<tr><td colspan="${b.cols.length}">${emptyBox('Пока пусто', 'Данных для этой таблицы ещё нет')}</td></tr>`
          }</tbody></table></div>`)
      case 'chart':
        return card(`${head(b.title || 'График')}${chart(m)}`)
      case 'empty':
        return card(emptyBox(esc(b.title), esc(b.text || '')))
      case 'tabs':
        return card(seg(`draft-${i}`, b.items.map(esc)))
      case 'actions':
        return card(`<div class="row" style="gap:var(--sp2)">${b.items.map((a, j) =>
          `<button class="btn ${j ? 'out' : ''}" data-toast="${esc(a)} — это черновик, кнопка ничего не делает">`
          + `${esc(a)}</button>`).join('')}</div>`)
      case 'text':
        return card(`${head(b.title || '')}<p class="bs">${esc(b.text)}</p>`)
      default:
        return ''
    }
  })
  /* Плашка сверху — чтобы черновик никогда не приняли за сверенный экран */
  const note = card(`<div class="ch"><h2>${esc(d.title)}</h2>`
    + `${status('warn', 'Черновик')}</div>`
    + '<p class="bs">Это не раздел продукта: он собран в чате из блоков дизайн-системы '
    + 'и не сверялся с макетами. Живёт в вашей ссылке.</p>', 'draftnote')
  return note + out.join('')
}

/** Локальная заготовка: без модели придумать содержимое неоткуда, но
    каркас раздела собрать можно — дальше он правится фразами или руками. */
export function skeletonDraft(title: string): Draft {
  return {
    title: title.slice(0, CAPS.title),
    blocks: [
      { t: 'stats', items: [
        { label: 'Всего', value: '—' }, { label: 'За 24 ч', value: '—' },
        { label: 'В среднем', value: '—' }, { label: 'Изменение', value: '—' },
      ] },
      { t: 'chart', title: 'Динамика' },
      { t: 'table', cols: ['Дата', 'Событие', 'Значение'], rows: [] },
    ],
  }
}
