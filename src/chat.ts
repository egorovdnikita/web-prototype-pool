/* Чат в панели сценариев. Модели за ним нет: прототип раздаётся статикой
   с GitHub Pages, ключ от чужого API там держать негде — он утечёт вместе
   со страницей. Поэтому разбор запроса свой, локальный: он ищет ось,
   значение, связку, экран или модалку по словам и сам их включает.
   Место под настоящую модель это не занимает: интерфейс чата и разбор
   разделены, `answer()` можно будет заменить на запрос к серверу. */
import { AXES, PRESETS, SCREEN_NAMES, TITLES, MODALS, DEF } from '@/legacy/prototype'
import type { Scenario } from './state/types'

export interface ChatMsg { role: 'you' | 'bot'; text: string }

export interface ChatAnswer {
  /** Что ответить в чат */
  say: string
  /** Оси, которые надо включить */
  apply?: Partial<Scenario>
  /** Куда перейти */
  go?: string
  /** Какое окно открыть */
  modal?: string
  /** Подсказки под ответом: их можно нажать как готовый запрос */
  chips?: string[]
}

/* Слова запроса: регистр и ё не важны, знаки препинания выкидываем */
const words = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9+./ -]/g, ' ').split(/\s+/).filter(Boolean)

/* Отбрасываем служебные слова, иначе «покажи» и «мне» перетягивают счёт */
const STOP = new Set(['покажи', 'показать', 'открой', 'открыть', 'включи', 'включить', 'сделай',
  'поставь', 'хочу', 'мне', 'пожалуйста', 'давай', 'как', 'что', 'на', 'в', 'и', 'с', 'у', 'по',
  'это', 'мне', 'нужно', 'надо', 'выглядит', 'если'])

/* name — короткое имя (по нему совпадение весит втрое), phrase — всё
   остальное: пояснение оси, группа, описание связки. kind нужен только
   для предсказуемого порядка, когда всё остальное вровень. */
interface Cand { name: string; phrase: string; label: string; kind: number; act: Omit<ChatAnswer, 'say'> }

/* Всё, что чат умеет включать: значения осей, связки, экраны, модалки */
function candidates(): Cand[] {
  const out: Cand[] = []
  for (const k of Object.keys(AXES) as (keyof Scenario)[]) {
    const ax = AXES[k]
    for (const [v, label] of ax.opts) {
      out.push({
        name: `${ax.label} ${label}`,
        /* Группу в сравнение не берём: её название повторяет имена осей
           и перетягивает счёт на случайные оси того же раздела. */
        phrase: ax.note || '',
        label: `${ax.label} — ${label}`,
        kind: 0,
        act: { apply: { [k]: v } as Partial<Scenario> },
      })
    }
  }
  for (const [name, note, axes] of PRESETS) {
    out.push({ name, phrase: note, label: `Связка «${name}»`, kind: 1, act: { apply: axes } })
  }
  for (const [id, t] of Object.entries(TITLES)) {
    const name = SCREEN_NAMES[id] || t
    out.push({ name, phrase: '', label: `Экран «${name}»`, kind: 2, act: { go: id } })
  }
  for (const [k, m] of Object.entries(MODALS)) {
    const t = typeof m.t === 'function' ? '' : m.t
    if (t) out.push({ name: t, phrase: '', label: `Окно «${t}»`, kind: 3, act: { modal: k } })
  }
  return out
}

let INDEX: Cand[] | null = null
const index = () => (INDEX ||= candidates())

/* Русский склоняется, поэтому сравниваем по грубой основе — первым пяти
   буквам: «воркеры», «воркеров» и «воркерам» так сходятся. Короткие слова
   сравниваем целиком, иначе предлог «на» ловил бы «наблюдателя». */
const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w)
const inPhrase = (p: string[], w: string) =>
  p.some((x) => x === w || (w.length > 3 && x.length > 3 && stem(x) === stem(w)))

/* Точное слово весит больше, чем совпадение по основе: «наблюдатель» —
   это «Роль — Наблюдатель», а не ось «Наблюдатели» с их количеством. */
const hits = (q: string[], text: string) => {
  const p = words(text)
  let hit = 0
  for (const w of q) {
    if (p.includes(w)) hit += w.length > 3 ? 3 : 1
    else if (inPhrase(p, w)) hit += w.length > 3 ? 2 : 1
  }
  return hit
}
/* Совпадение в имени весит втрое: «авария на парке» — это связка с таким
   названием, а не ось, у которой слово затерялось в пояснении. */
const base = (q: string[], c: Cand) => hits(q, c.name) * 3 + hits(q, c.phrase)
/* Намерение («открой», «окно») только двигает порядок, само по себе
   ничего не значит: без совпадения по словам это не ответ, а угадайка. */
const score = (q: string[], c: Cand, want: number) => base(q, c) + (want === c.kind ? 3 : 0)

const HELP = 'Я включаю состояния прототипа словами. Попробуйте: «авария на парке», '
  + '«пусто в таблицах», «тёмная тема», «открой выплаты», «окно экспорта», '
  + '«наблюдатель», «шрифт Onest». Скажите «сбрось», чтобы вернуть всё к умолчанию.'

export function answer(text: string): ChatAnswer {
  const raw = words(text)
  /* «Открой выплаты» — это экран, а не ось «Статусы выплат»: слово-намерение
     само по себе ничего не значит, но подсказывает, что искать. */
  const want = raw.some((w) => /^(открой|открыть|перейд|экран|раздел|покажи)/.test(w)) ? 2
    : raw.some((w) => /^(окно|окна|модалк)/.test(w)) ? 3 : -1
  const q = raw.filter((w) => !STOP.has(w))
  if (!q.length) return { say: HELP }

  /* Прямые команды — их проще разобрать до поиска по осям */
  const has = (...ws: string[]) => ws.some((w) => q.some((x) => x.startsWith(w)))
  if (has('помощь', 'умеешь', 'справк')) return { say: HELP, chips: ['авария на парке', 'тёмная тема', 'открой выплаты'] }
  if (has('сброс', 'сбрось', 'умолчан')) {
    return { say: 'Вернул все оси к умолчанию.', apply: { ...DEF } }
  }

  /* Вровень — выигрывает более короткое имя, а потом ось, связка, экран,
     окно: так ответ на одно и то же слово всегда один и тот же. */
  const scored = index()
    .map((c) => ({ c, s: score(q, c, want), b: base(q, c), len: words(c.name).length }))
    .sort((a, b) => b.s - a.s || a.len - b.len || a.c.kind - b.c.kind)
  const best = scored[0]
  if (!best || best.b < 3) {
    return {
      say: 'Не понял, что включить. Скажите «помощь» — покажу, что я умею.',
      chips: ['помощь', 'авария на парке', 'тёмная тема'],
    }
  }
  /* Вровень и по счёту, и по длине — не угадываем, а спрашиваем */
  const rivals = scored
    .filter((x) => x.s === best.s && x.len === best.len && x.c.kind === best.c.kind)
    .slice(0, 3)
  if (rivals.length > 1) {
    return {
      say: 'Уточните, что из этого:',
      chips: rivals.map((x) => x.c.label),
    }
  }
  const { c } = best
  const n = c.act.apply ? Object.keys(c.act.apply).length : 0
  const say = c.kind === 2 ? `Открыл экран «${c.name}».`
    : c.kind === 3 ? `Открыл окно «${c.name}» поверх текущего экрана.`
      : c.kind === 1 ? `Включил связку «${c.name}» — ${n} ${axWord(n)}.`
        : `Включил: ${c.label}.`
  return { say, ...c.act }
}

/* «5 осей», но «21 ось» — иначе ответ выглядит машинным */
function axWord(n: number) {
  const t = n % 10, h = n % 100
  if (t === 1 && h !== 11) return 'ось'
  if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return 'оси'
  return 'осей'
}

/* Подсказки на пустом чате */
export const CHAT_HINTS = ['авария на парке', 'пусто в таблицах', 'тёмная тема', 'открой выплаты', 'помощь']
