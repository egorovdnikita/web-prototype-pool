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
import { skeletonDraft, vetDraft, CAPS, type Draft, type Block } from './draft'

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
/* Блоки, которые можно добросить в открытый черновик словом */
const ADD: [RegExp, Block][] = [
  [/^(таблиц|список)/, { t: 'table', cols: ['Дата', 'Событие', 'Значение'], rows: [] }],
  [/^(график|диаграмм|чарт)/, { t: 'chart', title: 'Динамика' }],
  [/^(статистик|показател|цифр|метрик)/, { t: 'stats', items: [
    { label: 'Всего', value: '—' }, { label: 'За 24 ч', value: '—' },
    { label: 'В среднем', value: '—' }, { label: 'Изменение', value: '—' }] }],
  [/^(пуст|заглушк)/, { t: 'empty', title: 'Пока пусто', text: 'Данные появятся, когда что-то произойдёт' }],
  [/^(кнопк|действи)/, { t: 'actions', items: ['Основное действие', 'Второе'] }],
  [/^(вкладк|переключател|сегмент)/, { t: 'tabs', items: ['Все', 'Активные', 'Завершённые'] }],
]

/** Разбор запросов про новый раздел и правку открытого черновика.
    null — речь не о нём. */
export function draftAnswer(q: string[], all: string[], raw: string, cur: Draft | null): ChatAnswer | null {
  /* Слова намерения ищем в исходном наборе, а не в очищенном: «сделай»
     и «покажи» лежат в STOP, иначе они перетягивали бы поиск по осям —
     но именно они отличают «сделай раздел» от «открой раздел». */
  /* Правку открытого черновика разбираем первой: «добавь таблицу» — это
     про него, а не заявка на новый раздел с названием «таблицу». */
  const add = all.some((w) => /^(добав|встав|прибав)/.test(w))
  const del = all.some((w) => /^(убер|удал|выкин|сотри)/.test(w))
  const block = (add || del) ? ADD.find(([re]) => q.some((w) => re.test(w))) : undefined
  if (cur && block) return editDraft(cur, block[1], del)

  const wants = all.some((w) => MAKE.test(w)) && all.some((w) => WHAT.test(w))
  if (wants) {
    /* Название берём из исходной строки: регистр и кавычки важны, а words()
       их уже потерял. «Сделай раздел про рефералов» → «Рефералы по дням»
       мы не придумываем — берём то, что сказали. */
    const m = raw.match(/(?:раздел|экран|страниц\w*)\w*\s*(?:про|для|о|об|по)?\s*[«"']?([^»"'.!?]+)/i)
    const name = (m?.[1] || '').trim().replace(/\s+/g, ' ').slice(0, CAPS.title)
    if (name.length < 2) {
      return { say: 'Как назвать раздел? Скажите, например: «новый раздел Бонусы».', chips: ['новый раздел Бонусы'] }
    }
    const title = name[0].toUpperCase() + name.slice(1)
    return {
      say: `Собрал черновик «${title}» из блоков дизайн-системы: показатели, график и таблица. `
        + 'Это не раздел продукта — он не сверялся с макетами и живёт в вашей ссылке. '
        + 'Дальше скажите, что добавить или убрать.',
      draft: skeletonDraft(title),
      chips: ['добавь вкладки', 'добавь пустое состояние', 'убери график'],
    }
  }
  return null
}

/** Добавить или убрать блок в открытом черновике */
function editDraft(cur: Draft, block: Block, del: boolean): ChatAnswer {
  const name = BLOCK_NAME[block.t]
  if (del) {
    const blocks = cur.blocks.filter((b) => b.t !== block.t)
    if (blocks.length === cur.blocks.length) return { say: `В черновике и нет блока «${name}».` }
    if (!blocks.length) return { say: 'Это последний блок — без него от раздела ничего не останется.' }
    return { say: `Убрал «${name}».`, draft: vetDraft({ ...cur, blocks })!, chips: ['добавь таблицу', 'добавь график'] }
  }
  if (cur.blocks.length >= CAPS.blocks) {
    return { say: `В черновике уже ${CAPS.blocks} блоков — больше не влезет в ссылку. Уберите что-нибудь.` }
  }
  const next = vetDraft({ ...cur, blocks: [...cur.blocks, block] })
  return next
    ? { say: `Добавил «${name}» в конец.`, draft: next, chips: ['добавь вкладки', 'убери таблицу'] }
    : { say: 'Этот блок в черновик уже не влезает — ссылка станет слишком длинной.' }
}

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
