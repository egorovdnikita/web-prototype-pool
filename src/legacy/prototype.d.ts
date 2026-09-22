/** Типы для движка прототипа (src/legacy/prototype.js). */
import type { AppSnapshot, Scenario, Ui } from '@/state/types'

export interface Axis { label: string; g: string; note?: string; free?: string; opts: [string, string][] }
export interface NavItem { id?: string; t: string; ic: string; g?: string; kids?: [string, string][] }
/** Модель текущего сценария: балансы, хэшрейт, здоровье парка, строки таблиц. */
export type Model = any

export declare const AXES: Record<keyof Scenario, Axis>
/** Оси, которых нет в макетах — придуманы при сборке панели. */
export declare const AX_OWN: Set<string>
/** Оси оформления: шрифт, акцент, скругления, отступы, иконки. */
export declare const AX_STYLE: Set<string>
/** Наборы иконок: ключ, название, словесная характеристика. */
export declare const ICON_PACKS: [string, string, string][]
/** Несколько иконок набора подряд — образец для панели. */
export declare function iconSample(pack: string): string
/** Гарнитуры для оси «Шрифт»: ключ → имя и семейство в Google Fonts. */
export declare const FONTS: Record<string, { name: string; g?: string }>
/** Стек шрифтов для токена --font. */
export declare function fontStack(key: string): string
/** Адрес css2 со всеми гарнитурами оси. */
export declare function fontsHref(): string
/** Готовые связки состояний для панели: имя, пояснение, набор осей, раздел. */
export declare const PRESETS: [string, string, Partial<Scenario>, string][]
/** Категории групп осей: заголовок и входящие в него группы. */
export declare const AXCAT: [string, string[]][]
export declare const DEF: Scenario
export declare const COINS: Record<string, any>
export declare const HEALTH: Record<string, { a: number; l: number; o: number; f: number }>
export declare const TIERS: { p: string; n: string; c: string }[]
export declare const NOTIF_N: Record<string, number>
/** Сколько уведомлений показывает колокольчик с учётом оси «Типы уведомлений». */
export declare function notifCount(): number
export declare const ACCOUNTS: string[]
export declare function M(): Model

export declare function nf(v: number | string, d?: number): string
export declare function ni(v: number | string): string
/** Дробная сумма без хвостовых нулей, до `max` знаков. */
export declare function dec(v: number, max?: number): string
export declare function rng(seed: number): () => number
export declare function sv(path: string, w?: number): string

export declare const I: Record<string, string>
export declare const D: string
export declare const DOCS: Record<string, string>
export declare const LINKS: Record<string, any>
export declare const CONSENTS: any[]
export declare const LOGO: string
export declare const COIN_ICON: Record<string, string>
export declare const GOOGLE: string
export declare const USD_ICON: string

export declare const NAV: NavItem[]
export declare const TITLES: Record<string, string>
export declare const GROUP_OF: Record<string, string>
/** Разделы, доступные роли: null у владельца, набор идентификаторов у наблюдателя */
export declare function allowed(): Set<string> | null
export declare function permsOf(): Record<string, number>

export declare function card(inner: string, cls?: string): string
export declare function emptyBox(title: string, text: string): string
export declare function seg(id: string, opts: string[], def?: number): string
export declare function segv(id: string, opts: string[], def?: number): string
export declare function segLine(id: string, opts: string[], def?: number, cls?: string): string
export declare function segi(id: string, def?: number): number
export declare function pageSlice(pid: string, total: number, per?: number): [number, number]
/** Checkbox дизайн-системы. cls: 'ind' (частично), 'err', 'dis'. */
export declare function cb(on: boolean, attr?: string, cls?: string): string
/** Radio дизайн-системы. cls: 'dis'. */
export declare function rd(on: boolean, attr?: string, cls?: string): string
/** Status дизайн-системы: точка + подпись. */
export declare function status(t: 'ok'|'err'|'warn'|'off', label: string): string
/** Инлайн-галка 12×12 для пунктов меню и чекбоксов. */
export declare const CHECK: string
export declare function pager(id: string, total: number, per?: number): string
export declare function chart(m: Model, opts?: any): string
/** Бейдж динамики: «+10%» цветом kind. */
export declare function dyn(kind: 'teal'|'ok'|'neg', val: string): string
/** Чипы периода 7/30/90 дней; состояние живёт в U.seg[id]. */
export declare function dayChips(id: string, def?: number | null): string
/** Селект в шапке карточки. */
export declare function fsel(id: string, opts: string[], ico?: (v: string) => string): string
/** Поле выбора даты с календарём. */
export declare function dateInput(id?: string): string
/** Скелетон загрузки страницы. */
export declare function skeleton(): string
export declare function loadFail(): string
/** Календарь дизайн-системы; sel — подсвеченные числа. */
export declare function datePicker(sel?: number[]): string

export declare const V: Record<string, (m: Model) => string>
export declare const MODALS: Record<string, {
  t: string | ((m: Model) => string); s?: string | ((m: Model) => string); ok?: string; cta?: string; cancel?: string; acts?: false
  steps?: number | ((m: Model) => number)
  b: (m: Model, step: number) => string
  /** Прижатый футер модалки — рисуется вне прокручиваемого тела. */
  foot?: (m: Model, step: number) => string
  /** Иллюстрация в шапке (Modal HeaderA с картинкой). */
  img?: string
  /** Заголовок по центру — как в модалке выхода. */
  center?: boolean
  /** Узкое окно 500 — подтверждения. */
  size?: 'sm' | 'xs' | 'tx'
  /** Шторка: панель 430 у правого края вместо центральной модалки. */
  sheet?: true
  /** Тело фиксированной высоты 348 — шаговые экраны контактов. */
  tall?: number | ((m: Model) => number)
  noHead?: boolean
  noClose?: boolean
}>
/** Вкладки профиля — рисуются в шапке. */
export declare function profTabs(cur: string, m: Model): string
export declare function notifications(): string
export declare function acctSummary(m: Model): string
export declare function workersList(m: Model): any[]
export declare function workersRows(m: Model): any[]

export declare const PROF: [string, string, string][]
export declare const SUBS: any[]
export declare const OBSERVERS: any[]
export declare const SESSIONS: any[]
export declare const VFIELDS: Record<string, any[]>
export declare const VFORMS: [string, string][]
export declare const BANKS: Record<string, { name: string; short: string; svg: string }>

export declare const S: Scenario
export declare const U: Ui
export declare const route: string
export declare const pop: string | null
export declare const modal: string | null
export declare const openGroups: Record<string, boolean>
export declare const mini: boolean

/** Отдаёт движку текущее состояние React перед рендером экрана. */
export declare function applyState(next: AppSnapshot): void
export declare function obsOf(m: any): any[]
export declare function subsOf(m: any): any[]
export declare function permsOf(): Record<string, number>
export declare function coinsOf(): Set<string> | null
export declare const SUM_NAV: typeof NAV
export declare const SUM_ROUTES: Set<string>
export declare const SCREEN_NAMES: Record<string, string>
export declare const MODELS: [string, string][]
export declare const TAGS: [string, string][]
export declare function vendorOf(model: string): string
export declare function groups(): { n: string; c?: string }[]
export declare function tagsOf(): { n: string; d?: string; c?: string }[]
export declare function coinNow(): string
