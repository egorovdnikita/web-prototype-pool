/* Чат в панели сценариев. Модели за ним нет: прототип раздаётся статикой
   с GitHub Pages, ключ от чужого API там держать негде — он утечёт вместе
   со страницей. Поэтому разбор запроса свой, локальный: он ищет ось,
   значение, связку, экран или модалку по словам и сам их включает.
   Место под настоящую модель это не занимает: интерфейс чата и разбор
   разделены, `answer()` можно будет заменить на запрос к серверу. */
import { AXES, PRESETS, SCREEN_NAMES, TITLES, MODALS, DEF } from '@/legacy/prototype'
import type { Scenario } from './state/types'
import {
  TOKENS, BASE, parseTune, tuneStr, tuneWarnings, valueOf, readable, contrast,
  darken, lighten, warmer, cooler,
} from './theme'
import { genRows, genSeries, seedOf, skeletonDraft, vetDraft, CAPS,
  type ChartKind, type Draft, type Block } from './draft'

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
  /** Черновой раздел: чат собрал новый экран из блоков дизайн-системы */
  draft?: Draft
}

/* Слова запроса: регистр и ё не важны, знаки препинания выкидываем */
export const words = (s: string) =>
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
  + '«наблюдатель», «шрифт Onest». Оформление тоже меняю: «фон темнее», '
  + '«карточки белые», «скругления 4», «отступы больше», «крупнее текст», '
  + '«сайдбар 300». Скажите «сбрось», чтобы вернуть оси к умолчанию, '
  + 'или «верни оформление» — чтобы снять только тему. '
  + 'А если раздела ещё нет — «новый раздел Бонусы»: соберу черновик из блоков.'

/* ===== Оформление: фразы про вид, а не про состояние продукта =====

   Правило простое: патч темы применяется, только если в запросе есть
   и цель («фон», «скругления», «сайдбар»), и что с ней делать («темнее»,
   «4», «#ff6600»). Без пары это не просьба про оформление, и разбор идёт
   дальше по осям — так «авария на парке» остаётся связкой, а не цветом. */

/* Цвета по именам. Значения — из палитры дизайн-системы и ближайших
   к ней тонов: называть цвет словом удобнее, чем диктовать HEX. */
const COLORS: Record<string, string> = {
  белый: 'ffffff', черный: '0a0a0a', серый: '737373', графитовый: '334155',
  синий: '2563eb', голубой: '0ea5e9', индиго: '4f46e5', бирюзовый: '0d9488',
  зеленый: '16a34a', салатовый: '84cc16', желтый: 'ca8a04', оранжевый: 'ea580c',
  красный: 'dc2626', розовый: 'db2777', фиолетовый: '7c3aed', сиреневый: 'a78bfa',
  бежевый: 'e8dcc8', песочный: 'f0e6d2', кремовый: 'f7f3e8', мятный: 'a7f3d0',
}
/* «Белый», «белые», «белым» — одно и то же: срезаем окончание
   прилагательного и сравниваем по первым четырём буквам основы. */
const cstem = (w: string) => w
  .replace(/(ыми|ими|ого|его|ому|ему|ый|ий|ой|ые|ие|ая|яя|ое|ее|ым|им|ую|юю|ых|их|ом|ем)$/, '')
  .slice(0, 4)
const COLOR_STEM: Record<string, string> = {}
for (const [name, hex] of Object.entries(COLORS)) COLOR_STEM[cstem(name)] = hex

/* Цели: слово в запросе → ключ токена. Порядок важен — «карточки» должны
   разобраться раньше «фона», а «подписи» раньше «текста». */
const TARGETS: [RegExp, string][] = [
  [/^(карточ|карточк|плитк|блоков|блоки)/, 'sf'],
  [/^(фон|подлож|страниц)/, 'bg'],
  [/^(подпис|второстеп|вспомогат)/, 'c2'],
  [/^(текст|надпис|буквы|шрифт)/, 'c1'],
  [/^(границ|рамк|обводк|разделит)/, 'bd'],
  [/^(скруглен|радиус|углы|угол)/, 'rk'],
  [/^(отступ|воздух|плотн|просторн|компакт)/, 'spk'],
  [/^(сайдбар|боков)/, 'sb'],
  [/^(кнопк)/, 'hb'],
  [/^(поле|полей|полям|инпут)/, 'hf'],
  [/^(успех|позитив|хорош)/, 'pos'],
  [/^(предупрежд|внимани)/, 'warn'],
  [/^(ошибк|негатив)/, 'neg'],
]

/* Шаг относительной правки: на сколько двигаем число за одну фразу */
const STEP: Record<string, number> = { rk: 25, spk: 25, fsk: 10, sb: 24, hb: 8, hf: 8 }
/* База, от которой считается число в пикселях: «скругления 4» — это
   4 пикселя вместо шестнадцати у --r-m, то есть 25%. */
const PX_BASE: Record<string, number> = { rk: 16, spk: 16, fsk: 16 }

const UP = /^(больше|крупнее|шире|выше|просторнее|увеличь|прибав)/
const DOWN = /^(меньше|мельче|уже|ниже|плотнее|компактнее|уменьш|убав)/
const DARKER = /^(темнее|потемнее)/
const LIGHTER = /^(светлее|посветлее|ярче|бледнее)/
const WARM = /^(теплее|потеплее)/
const COOL = /^(холоднее|прохладнее)/
const OFF = /^(нет|ноль|убери|прямые|квадрат)/
const BACK = /^(верни|вернуть|обычн|стандарт|умолчан)/
const SIZEWORD = /^(крупнее|мельче|кегл|масштаб)/

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Цвет из слова: «#ff6600», «ff6600», «синий», «тёмно-синий» */
function colorOf(w: string): string | null {
  const hex = w.replace('#', '')
  if (/^[0-9a-f]{6}$/.test(hex)) return hex
  if (/^[0-9a-f]{3}$/.test(hex)) return hex.split('').map((c) => c + c).join('')
  let k = 0
  let name = w
  if (name.startsWith('темно-')) { k = -1; name = name.slice(6) }
  else if (name.startsWith('светло-')) { k = 1; name = name.slice(7) }
  const base = COLOR_STEM[cstem(name)]
  if (!base) return null
  return k === 0 ? base : k < 0 ? darken(base, 0.35) : lighten(base, 0.45)
}

/* ===== Новый раздел =====

   «Сделай раздел про рефералов» — это не ось и не тема, а то, чего
   в прототипе нет вовсе. Без модели придумать содержимое неоткуда,
   поэтому локально собираем каркас из блоков дизайн-системы, а наполнить
   его может модель за прокси — она возвращает ту же спецификацию. */

const MAKE = /^(новый|новая|новое|создай|сделай|добавь|сгенерир|набросай|придумай)/
/* «Вкладки» здесь нет намеренно: это блок внутри черновика, а не раздел —
   иначе «добавь вкладки» собирало бы новый раздел с названием «и». */
const WHAT = /^(раздел|экран|страниц)/
/* Блоки, которые можно назвать словом. Сравниваем по основе и допускаем
   одну опечатку: «диограмм» — это всё-таки диаграмма. */
const KINDS: { stems: string[]; t: Block['t']; name: string; make: (n: number, topic: string) => Block }[] = [
  { stems: ['таблиц', 'списк', 'строк'], t: 'table', name: 'Таблица',
    make: (n, topic) => table(['Дата', 'Событие', 'Значение'], topic, n) },
  { stems: ['график', 'диагр', 'чарт', 'кругов', 'кольц', 'донат', 'столб', 'гистогр'], t: 'chart', name: 'График',
    /* Каждый следующий график — другого вида и с другими числами:
       «много разных диаграмм» должно давать именно разные. */
    make: (n, topic) => chartOf(CHART_KINDS[n % CHART_KINDS.length], topic, n) },
  { stems: ['статис', 'показа', 'цифр', 'метрик', 'счетчи', 'счётчи'], t: 'stats', name: 'Показатели',
    make: () => ({ t: 'stats', items: [
      { label: 'Всего', value: '—' }, { label: 'За 24 ч', value: '—' },
      { label: 'В среднем', value: '—' }, { label: 'Изменение', value: '—' }] }) },
  { stems: ['пуст', 'заглуш'], t: 'empty', name: 'Пустое состояние',
    make: () => ({ t: 'empty', title: 'Пока пусто', text: 'Данные появятся, когда что-то произойдёт' }) },
  { stems: ['кнопк', 'действ'], t: 'actions', name: 'Кнопки',
    make: () => ({ t: 'actions', items: ['Основное действие', 'Второе'] }) },
  { stems: ['вкладк', 'переключ', 'сегмен'], t: 'tabs', name: 'Вкладки',
    make: () => ({ t: 'tabs', items: ['Все', 'Активные', 'Завершённые'] }) },
  { stems: ['текст', 'описан', 'абзац'], t: 'text', name: 'Текст',
    make: () => ({ t: 'text', text: 'Короткое пояснение к разделу.' }) },
]
const CHART_TITLES: Record<ChartKind, string[]> = {
  line: ['Динамика', 'По дням', 'Тренд'],
  bars: ['Сравнение', 'По периодам', 'Объём'],
  donut: ['Распределение', 'Доли', 'Структура'],
}
const CHART_KINDS: ChartKind[] = ['line', 'bars', 'donut']
/* Слова, по которым понятно, какую диаграмму просят */
const CHART_WORDS: [RegExp, ChartKind][] = [
  [/^(столб|бар|гистогр|колонк)/, 'bars'],
  [/^(кругов|кольц|донат|пирог|дол[яи]|структур)/, 'donut'],
  [/^(лини|кривая|тренд|динамик)/, 'line'],
]

/** График со своими числами: вид, подписи и значения уезжают в ссылку,
    поэтому у всех, кто её откроет, диаграмма одна и та же. */
function chartOf(kind: ChartKind, topic: string, n: number): Block {
  const titles = CHART_TITLES[kind]
  const { labels, values, unit } = genSeries(kind, topic, seedOf(topic + kind + n))
  return { t: 'chart', kind, title: titles[n % titles.length], labels, values, unit }
}
/** Таблица с содержимым: строки считаются от названия колонок и темы */
function table(cols: string[], topic: string, n = 0): Block {
  return { t: 'table', cols, rows: genRows(cols, 5, seedOf(topic + cols.join() + n)) }
}

/* Одна опечатка не должна ронять разбор. Расстояние больше единицы —
   это уже другое слово, и угадывать мы не беремся. */
function near(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, diff = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++diff > 1) return false
    if (a.length > b.length) i++
    else if (a.length < b.length) j++
    else { i++; j++ }
  }
  return diff + (a.length - i) + (b.length - j) <= 1
}
const kindOf = (w: string) => KINDS.find((k) => k.stems.some((s) =>
  w.startsWith(s) || near(w.slice(0, s.length), s)))

/* «Много диаграмм» — это не одна диаграмма */
const COUNT: Record<string, number> = {
  много: 3, несколько: 3, разные: 3, разных: 3, пара: 2, пары: 2, две: 2, два: 2,
  три: 3, четыре: 4, пять: 5,
}
const DEL_W = /^(убер|удал|выкин|сотри|без|вместо|замен|лишн)/
const ADD_W = /^(добав|встав|еще|ещё|нужн|хочу|дай|сделай|поставь|прибав)/
const RENAME = /^(переимен|назов|назван)/

/** Что делать с черновиком: разбираем фразу слева направо. «Без общего
    графика, а много разных диаграмм» — это сначала убрать, потом добавить
    три: слово-действие держится до следующего, а количество его меняет. */
function planEdits(all: string[]) {
  const plan: { kind: typeof KINDS[number]; del: boolean; n: number; want?: ChartKind }[] = []
  /* «Столбиками», «кольцевую», «линию» — если вид назвали, берём его,
     иначе чередуем, чтобы «много разных» и правда были разные */
  const want = CHART_WORDS.find(([re]) => all.some((w) => re.test(w)))?.[1]
  let del = false, n = 1, used = false
  for (const w of all) {
    if (DEL_W.test(w)) { del = true; n = 1; used = false; continue }
    if (ADD_W.test(w)) { del = false; n = 1; used = false; continue }
    if (COUNT[w]) {
      n = COUNT[w]
      /* «Убери два графика» — количество к удалению; «без графика, а много
         диаграмм» — удаление уже случилось, значит речь о добавлении */
      if (del && used) { del = false; used = false }
      continue
    }
    if (/^\d{1,2}$/.test(w)) { n = Math.min(+w, CAPS.blocks); continue }
    const kind = kindOf(w)
    if (!kind) continue
    /* «Круговую диаграмму» — это два слова про один блок, а не два блока.
       Пока не встретилось новое слово-действие, повтор того же вида
       считаем уточнением, а не второй просьбой. */
    const last = plan[plan.length - 1]
    if (last && last.kind === kind && last.del === del && used) { last.n = Math.max(last.n, n); continue }
    plan.push({ kind, del, n, want })
    used = true
    /* После удаления следующий блок в той же фразе — почти всегда замена */
    if (del) { del = false; n = 1 }
  }
  return plan
}

/** Разбор запросов про новый раздел и правку открытого черновика.
    null — речь не о нём. */
export function draftAnswer(q: string[], all: string[], raw: string, cur: Draft | null): ChatAnswer | null {
  /* Слова намерения ищем в исходном наборе, а не в очищенном: «сделай»
     и «покажи» лежат в STOP, иначе они перетягивали бы поиск по осям —
     но именно они отличают «сделай раздел» от «открой раздел». */
  const wants = all.some((w) => MAKE.test(w)) && all.some((w) => WHAT.test(w))

  /* Открыт черновик — правки разбираем первыми: «добавь таблицу» про него,
     а не заявка на новый раздел с названием «таблицу». */
  if (cur && !wants) {
    if (all.some((w) => RENAME.test(w))) {
      const m = raw.match(/(?:переименуй|назови|название)\s*(?:раздел\w*|черновик\w*|его)?\s*(?:в|на)?\s*[«"']?([^»"'.!?]+)/i)
      const name = (m?.[1] || '').trim().slice(0, CAPS.title)
      if (name.length < 2) return { say: 'Как назвать? Скажите: «переименуй в Аналитика».' }
      const title = name[0].toUpperCase() + name.slice(1)
      return { say: `Теперь раздел называется «${title}».`, draft: vetDraft({ ...cur, title })! }
    }
    const plan = planEdits(all)
    if (plan.length) return editDraft(cur, plan)
    /* Черновик открыт, а фраза похожа на правку — тогда честное «не понял»
       вместо молчаливого переключения посторонней оси. */
    if (all.some((w) => DEL_W.test(w) || ADD_W.test(w) || /^(черновик|раздел|блок)/.test(w))) {
      return {
        say: 'Не понял, что поменять в черновике. Блоки, которые я знаю: показатели, '
          + 'таблица, график, вкладки, кнопки, пустое состояние, текст.',
        chips: ['добавь таблицу', 'убери график', 'переименуй в Аналитика'],
      }
    }
  }

  if (wants) {
    /* Название берём из исходной строки: регистр и кавычки важны, а words()
       их уже потерял. Придумывать за пользователя не будем — берём то,
       что сказали, вплоть до падежа. */
    const m = raw.match(/(?:раздел|экран|страниц\w*)\w*\s*(?:про|для|о|об|по)?\s*[«"']?([^»"'.!?]+)/i)
    const name = (m?.[1] || '').trim().replace(/\s+/g, ' ').slice(0, CAPS.title)
    if (name.length < 2) {
      return { say: 'Как назвать раздел? Скажите, например: «новый раздел Бонусы».', chips: ['новый раздел Бонусы'] }
    }
    const title = name[0].toUpperCase() + name.slice(1)
    const made = topicDraft(title)
    return {
      say: `Собрал черновик «${title}»: ${made.blocks.map(blockWord).join(', ')}. `
        + 'Цифры и строки я насочинял по названию — они правдоподобные, но выдуманные, '
        + 'и у всех, кто откроет ссылку, будут те же. Дальше скажите, что добавить, убрать или заменить: '
        + '«добавь кольцевую», «убери столбики», «переименуй в …».',
      draft: made,
      chips: ['добавь вкладки', 'убери график', 'вместо таблицы кнопки'],
    }
  }
  return null
}

/** Применяем разобранный план: удаляем с конца, добавляем в конец */
function editDraft(cur: Draft, plan: ReturnType<typeof planEdits>): ChatAnswer {
  const blocks = [...cur.blocks]
  const said: string[] = []
  let full = false
  for (const { kind, del, n, want } of plan) {
    if (del) {
      let left = n, hit = 0
      for (let i = blocks.length - 1; i >= 0 && left > 0; i--) {
        if (blocks[i].t === kind.t) { blocks.splice(i, 1); left--; hit++ }
      }
      said.push(hit
        ? `убрал ${hit > 1 ? hit + ' × ' : ''}«${kind.name.toLowerCase()}»`
        : `«${kind.name.toLowerCase()}» в черновике и не было`)
      continue
    }
    const names: string[] = []
    for (let i = 0; i < n; i++) {
      if (blocks.length >= CAPS.blocks) { full = true; break }
      const idx = blocks.filter((b) => b.t === kind.t).length
      const one = kind.t === 'chart' && want ? chartOf(want, cur.title, idx) : kind.make(idx, cur.title)
      blocks.push(one)
      names.push(blockWord(one))
    }
    if (names.length) said.push(`добавил ${names.map((x) => `«${x}»`).join(', ')}`)
  }
  if (!blocks.length) return { say: 'Так от раздела ничего не останется — оставил как было.' }
  /* Ничего не вышло — говорим об этом прямо, а не пустой репликой с точкой */
  if (!said.length) {
    return { say: full
      ? `В черновике уже ${CAPS.blocks} блоков — больше в ссылку не влезает. Уберите что-нибудь.`
      : 'Ничего не поменял: не нашёл, к чему это отнести.' }
  }
  const next = vetDraft({ ...cur, blocks })
  if (!next) return { say: 'Такой черновик уже не влезает в ссылку — уберите что-нибудь.' }
  /* vetDraft мог обрезать хвост под длину ссылки — говорим об этом честно */
  const cut = blocks.length - next.blocks.length
  return {
    say: said.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.'
      + (full ? ` Больше ${CAPS.blocks} блоков в ссылку не влезает.` : '')
      + (cut ? ` Последн${cut > 1 ? 'ие ' + cut + ' блока' : 'ий блок'} не влез в ссылку — отбросил.` : ''),
    draft: next,
    chips: ['добавь вкладки', 'убери график', 'переименуй в Аналитика'],
  }
}

/* Заготовки по теме названия. Придумать содержимое без модели неоткуда,
   но набор блоков и подписи для знакомых тем предсказать можно — это
   честный шаблон, а не выдумка: цифры остаются прочерками. */
const TOPICS: [RegExp, (t: string) => Block[]][] = [
  [/аналит|статис|метрик|дашборд/, (n) => [
    { t: 'stats', items: [
      { label: 'Всего за период', value: '128 400 ₽' }, { label: 'За 24 ч', value: '6 210 ₽' },
      { label: 'Среднее', value: '5 350 ₽' }, { label: 'Изменение', value: '+12%' }] },
    chartOf('line', n, 0),
    chartOf('bars', n, 1),
    chartOf('donut', n, 2),
    table(['Дата', 'Показатель', 'Значение'], n),
  ]],
  [/бонус|акци|промо/, (n) => [
    { t: 'stats', items: [
      { label: 'Активных бонусов', value: '14' }, { label: 'Начислено', value: '86 200 ₽' },
      { label: 'Использовано', value: '61 400 ₽' }] },
    { t: 'tabs', items: ['Активные', 'История'] },
    chartOf('donut', n, 0),
    table(['Дата', 'Бонус', 'Статус', 'Сумма'], n),
    { t: 'actions', items: ['Начислить бонус'] },
  ]],
  [/реферал|партн/, (n) => [
    { t: 'stats', items: [
      { label: 'Рефералов', value: '37' }, { label: 'Доход с рефералов', value: '94 800 ₽' },
      { label: 'Уровень', value: '15%' }] },
    chartOf('line', n, 0),
    table(['Дата', 'Реферал', 'Хэшрейт', 'Начислено'], n),
  ]],
  [/отчет|отчёт|выгруз|документ/, (n) => [
    { t: 'tabs', items: ['Готовые', 'В работе'] },
    table(['Дата', 'Отчёт', 'Период', 'Статус'], n),
    { t: 'actions', items: ['Сформировать отчёт', 'Скачать'] },
  ]],
  [/выплат|платеж|платёж|финанс/, (n) => [
    { t: 'stats', items: [
      { label: 'К выплате', value: '42 900 ₽' }, { label: 'Выплачено за месяц', value: '318 600 ₽' },
      { label: 'Средняя выплата', value: '10 600 ₽' }] },
    chartOf('bars', n, 0),
    table(['Дата', 'Сумма', 'Кошелёк', 'Статус'], n),
  ]],
]

/** Черновик по названию: знакомая тема — свой набор блоков, иначе каркас */
export function topicDraft(title: string): Draft {
  const low = title.toLowerCase()
  const hit = TOPICS.find(([re]) => re.test(low))
  return vetDraft({ title, blocks: hit ? hit[1](title) : skeletonDraft(title).blocks })!
}

/* Диаграммы называем по виду: «график, график, график» ничего не говорит */
const KIND_RU: Record<ChartKind, string> = { line: 'линия', bars: 'столбики', donut: 'кольцо' }
const blockWord = (b: Block) =>
  b.t === 'chart' && b.kind ? `диаграмма-${KIND_RU[b.kind]}` : BLOCK_NAME[b.t].toLowerCase()

const BLOCK_NAME: Record<Block['t'], string> = {
  stats: 'Показатели', table: 'Таблица', chart: 'График',
  empty: 'Пустое состояние', tabs: 'Вкладки', actions: 'Кнопки', text: 'Текст',
}

/** Просили ли вообще про внешний вид. Нужно не только разбору, но и
    политике для модели: без явной просьбы её патч оформления не берём. */
export function asksStyle(q: string[]) {
  return q.some((w) => TARGETS.some(([re]) => re.test(w))
    || /^(оформлен|дизайн|стил|тем[ауые]|темой|цвет|шрифт|внешн)/.test(w))
}

/** Разбор фразы про оформление. null — речь не о нём. */
export function styleAnswer(q: string[], cur: Scenario, dark: boolean): ChatAnswer | null {
  const tune = parseTune(cur.tune)
  /* «Верни оформление» — отдельная команда: цели у неё нет */
  if (q.some((w) => BACK.test(w)) && q.some((w) => /^(оформлен|тема|тему|темы|стиль|вид)/.test(w))) {
    return Object.keys(tune).length
      ? { say: 'Вернул оформление дизайн-системы.', apply: { tune: '' } }
      : { say: 'Оформление и так дизайн-системное — возвращать нечего.' }
  }

  /* Что делаем */
  let color: string | null = null
  let num: number | null = null
  let dir = 0, tone = '', off = false, back = false, size = false
  for (const w of q) {
    if (UP.test(w)) dir = 1
    else if (DOWN.test(w)) dir = -1
    else if (DARKER.test(w)) tone = 'dark'
    else if (LIGHTER.test(w)) tone = 'light'
    else if (WARM.test(w)) tone = 'warm'
    else if (COOL.test(w)) tone = 'cool'
    else if (OFF.test(w)) off = true
    else if (BACK.test(w)) back = true
    if (SIZEWORD.test(w)) size = true
    if (/^\d{1,3}$/.test(w)) num = +w
    else if (color === null) color = colorOf(w)
  }

  /* Куда применяем */
  let key = ''
  for (const w of q) {
    const hit = TARGETS.find(([re]) => re.test(w))
    if (hit) { key = hit[1]; break }
  }
  /* «Крупнее текст» — это масштаб, а не цвет текста */
  if ((key === 'c1' || key === 'c2') && (size || (num !== null && color === null))) key = 'fsk'
  if (!key) return null

  const tok = TOKENS[key]
  const isColor = tok.type === 'color'
  /* Тёмная тема хранит свои цвета: патч целится в ту тему, что на экране */
  const slot = isColor && tok.themed && dark ? 'd' + key : key
  const now = valueOf(tune, key, dark)

  let next = ''
  if (back) next = ''
  else if (isColor) {
    if (color) next = color
    else if (tone === 'dark') next = darken(now, 0.18)
    else if (tone === 'light') next = lighten(now, 0.18)
    else if (tone === 'warm') next = warmer(now)
    else if (tone === 'cool') next = cooler(now)
    else if (dir) next = dir > 0 ? lighten(now, 0.18) : darken(now, 0.18)
    else return null
  } else {
    const base = PX_BASE[key]
    if (off) next = String(tok.min ?? 0)
    else if (num !== null) {
      /* Для множителей маленькое число — это пиксели («скругления 4»),
         большое — сразу проценты («скругления 150») */
      next = String(clamp(base && num <= 48 ? Math.round((num / base) * 100) : num,
        tok.min ?? 0, tok.max ?? 999))
    } else if (dir) next = String(clamp(+now + dir * STEP[key], tok.min ?? 0, tok.max ?? 999))
    else return null
  }

  const out: Record<string, string> = { ...tune }
  if (!next || next === (isColor ? '' : BASE[key])) delete out[slot]
  else out[slot] = next
  const extra: string[] = []
  /* Читаемость: если сами испортили контраст, подбираем цвет текста
     по WCAG и говорим об этом — молча менять то, о чём не просили, нельзя */
  if (isColor && (key === 'bg' || key === 'sf') && next) {
    const fgSlot = tok.themed && dark ? 'dc1' : 'c1'
    const fg = valueOf(out, 'c1', dark)
    if (contrast(next, fg) < 4.5) {
      const good = readable(next)
      out[fgSlot] = good
      extra.push(`текст пришлось сменить на #${good} — на прежнем читать было нельзя`)
    }
  }

  const str = tuneStr(out)
  if (str === cur.tune) return { say: `И так ${tok.label.toLowerCase()} такой — ничего не поменял.` }
  /* Множители показываем и в пикселях: «25%» ни о чём не говорит,
     «≈4px» говорит. База — основной радиус, шаг отступа и кегль текста. */
  const px = PX_BASE[key] && next ? ` (≈${Math.round((PX_BASE[key] * +next) / 100)}px)` : ''
  const val = !next ? 'как в дизайн-системе'
    : isColor ? '#' + next : next + (tok.unit || '') + px
  const where = isColor && tok.themed ? (dark ? ' в тёмной теме' : ' в светлой теме') : ''
  /* Ругаемся только на то, что сломала эта правка: старые предупреждения
     пользователь уже видел, и повторять их при каждой фразе — шум */
  const had = tuneWarnings(tune, dark)
  const warn = tuneWarnings(parseTune(str), dark).filter((w) => !had.includes(w))
  return {
    say: `${tok.label}${where} — ${val}.`
      + (extra.length ? ' ' + extra.join('; ') + '.' : '')
      + (warn.length ? ' Осторожно: ' + warn.join('; ') + '.' : ''),
    apply: { tune: str },
    chips: warn.some((w) => w.includes('карточ')) ? ['карточки темнее', 'верни оформление']
      : ['верни оформление', 'скругления 4', 'крупнее текст'],
  }
}

export function answer(text: string, cur: Scenario = DEF as Scenario, dark = false,
  draft: Draft | null = null): ChatAnswer {
  const raw = words(text)
  /* «Открой выплаты» — это экран, а не ось «Статусы выплат»: слово-намерение
     само по себе ничего не значит, но подсказывает, что искать. */
  const want = raw.some((w) => /^(открой|открыть|перейд|экран|раздел|покажи)/.test(w)) ? 2
    : raw.some((w) => /^(окно|окна|модалк)/.test(w)) ? 3 : -1
  const q = raw.filter((w) => !STOP.has(w))
  if (!q.length) return { say: HELP }

  /* Прямые команды — их проще разобрать до поиска по осям */
  const has = (...ws: string[]) => ws.some((w) => q.some((x) => x.startsWith(w)))
  if (has('помощь', 'умеешь', 'справк')) return { say: HELP, chips: ['авария на парке', 'тёмная тема', 'фон темнее'] }
  if (has('сброс', 'сбрось', 'умолчан')) {
    return { say: 'Вернул все оси к умолчанию.', apply: { ...DEF } }
  }
  /* Оформление разбираем раньше осей: у фразы «фон темнее» нет значения
     оси, зато есть цель и действие — иначе она ушла бы в поиск наугад */
  const sty = styleAnswer(q, cur, dark)
  if (sty) return sty
  /* Новый раздел разбираем здесь же: «сделай раздел Бонусы» не значение
     оси и не тема — такого экрана в прототипе нет вовсе */
  const drf = draftAnswer(q, raw, text, draft)
  if (drf) return drf

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
export const CHAT_HINTS = ['авария на парке', 'пусто в таблицах', 'тёмная тема',
  'фон темнее', 'скругления 4', 'помощь']
