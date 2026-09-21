/* Модель за чатом — через свой прокси.

   Прототип раздаётся статикой с GitHub Pages: ключ от чужого API там
   держать негде, он уедет вместе со страницей. Поэтому ключ живёт
   на маленьком прокси (исходник — в `worker/`), а прототип знает только
   его адрес. Адрес задаётся при сборке (`VITE_AI_URL`), и пока он пуст,
   чат работает как раньше — локальным разбором из chat.ts.

   Главное правило: **ответ модели — это данные, а не команды.** Мы берём
   из него только то, что сами умеем проверить: реплику (её показываем
   как текст), патч токенов из белого списка, значения существующих осей,
   известный экран и известное окно. Всё остальное выбрасывается молча.
   Ничего из ответа не исполняется и не попадает в разметку как HTML. */
import { AXES, DEF, TITLES, MODALS } from '@/legacy/prototype'
import { okEntry, parseTune, tuneStr } from '@/theme'
import { asksStyle, words } from '@/chat'
import type { ChatAnswer } from '@/chat'
import type { Scenario } from '@/state/types'

/** Адрес прокси: из сборки, с ручной подменой для отладки */
export function aiUrl(): string {
  const env = (import.meta.env?.VITE_AI_URL as string) || ''
  try { return localStorage.getItem('pm.ai') || env } catch { return env }
}
/* Щеколда от случайного прохожего, а не защита: строка уезжает в бандл
   вместе со страницей. Настоящая защита прокси — лимит запросов,
   потолок в день и проверка Origin на его стороне. */
const aiToken = () => (import.meta.env?.VITE_AI_TOKEN as string) || ''

/** Ответ прокси до проверки: ровно то, что пришло по сети */
interface Raw { say?: unknown; tune?: unknown; axes?: unknown; go?: unknown; modal?: unknown; chips?: unknown }

/* Управляющие символы вырезаем: реплика уходит в разметку текстом,
   и мусор в ней читался бы как порча вёрстки */
const CTRL = /[\p{Cc}]/gu
const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(CTRL, ' ').trim().slice(0, max) : ''

/** Проверка ответа модели по белым спискам. Возвращает то, что можно
    применить, и список того, что пришлось выбросить. */
export function vetAnswer(raw: Raw, cur: Scenario, styleAsked: boolean) {
  const dropped: string[] = []
  const say = str(raw.say, 600)
  const apply: Partial<Scenario> = {}

  /* Оси: только существующие ключи и только их значения */
  if (raw.axes && typeof raw.axes === 'object') {
    for (const [k, v] of Object.entries(raw.axes as Record<string, unknown>)) {
      const ax = AXES[k as keyof Scenario]
      const val = str(v, 40)
      if (!ax || !(k in DEF)) { dropped.push(`ось ${k}`); continue }
      /* Оформление без просьбы не трогаем — это обещание пользователю,
         а не совет модели: она про него знает, но может забыть */
      if (!styleAsked && ax.g === 'Стиль') { dropped.push(`оформление (${k})`); continue }
      if (!ax.opts.some(([o]: [string, string]) => o === val)
        && !(ax.free === 'color' && /^[0-9a-f]{6}$/i.test(val))) {
        dropped.push(`${k}=${val}`); continue
      }
      ;(apply as Record<string, string>)[k] = val
    }
  }

  /* Тема: ключи и диапазоны те же, что у ручного разбора */
  if (raw.tune && typeof raw.tune === 'object') {
    if (!styleAsked) dropped.push('патч оформления')
    else {
      const next = { ...parseTune(cur.tune) }
      for (const [k, v] of Object.entries(raw.tune as Record<string, unknown>)) {
        const val = str(v, 8).toLowerCase().replace('#', '')
        /* Пустая строка — «убери этот токен»: так модель может вернуть
           часть вида к дизайн-системе, не сбрасывая всё остальное */
        if (val === '') { delete next[k]; continue }
        if (!okEntry(k, val)) { dropped.push(`токен ${k}=${val}`); continue }
        next[k] = val
      }
      const s = tuneStr(next)
      if (s !== cur.tune) apply.tune = s
    }
  }

  const go = str(raw.go, 40)
  const modal = str(raw.modal, 40)
  const chips = Array.isArray(raw.chips)
    ? raw.chips.map((c) => str(c, 40)).filter(Boolean).slice(0, 4) : []

  const out: ChatAnswer = { say, chips }
  if (Object.keys(apply).length) out.apply = apply
  if (go && go in TITLES) out.go = go
  else if (go) dropped.push(`экран ${go}`)
  if (modal && modal in MODALS) out.modal = modal
  else if (modal) dropped.push(`окно ${modal}`)
  return { answer: out, dropped }
}

/** Что рассказать про отброшенное: молчать нельзя — иначе непонятно,
    почему попросили одно, а изменилось другое (или ничего). */
export function dropNote(dropped: string[], styleAsked: boolean) {
  if (!dropped.length) return ''
  const style = dropped.some((d) => d.startsWith('оформление') || d.startsWith('патч'))
  if (style && !styleAsked) return ' Оформление не трогал — про него надо попросить отдельно.'
  return ' Часть ответа я отбросил: ' + dropped.slice(0, 3).join(', ') + '.'
}

/** Запрос к прокси. null — прокси не настроен, не ответил или ответил
    не тем: наверху это значит «разбираем сами, как раньше». */
export async function ask(text: string, cur: Scenario, dark: boolean): Promise<ChatAnswer | null> {
  const url = aiUrl()
  if (!url) return null
  const styleAsked = asksStyle(words(text))
  const ac = new AbortController()
  const kill = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(aiToken() ? { 'x-pm-key': aiToken() } : {}) },
      signal: ac.signal,
      /* Отправляем запрос пользователя и текущее состояние — больше
         ничего: ни ссылок, ни localStorage, ни адреса страницы */
      body: JSON.stringify({ text, scenario: cur, dark, styleAsked }),
    })
    if (!r.ok) return null
    const raw = (await r.json()) as Raw
    const { answer: a, dropped } = vetAnswer(raw, cur, styleAsked)
    if (!a.say && !a.apply && !a.go && !a.modal) return null
    return { ...a, say: (a.say || 'Готово.') + dropNote(dropped, styleAsked) }
  } catch {
    return null
  } finally {
    clearTimeout(kill)
  }
}
