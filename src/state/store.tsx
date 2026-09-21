import {
  createContext, useCallback, useContext, useEffect, useReducer, useRef,
  type ReactNode,
} from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { AXES, DEF, MODELS, PRESETS, GROUP_OF, M, allowed, groups, tagsOf, applyState, workersList, workersRows, obsOf, subsOf, coinsOf, SUM_ROUTES, AX_STYLE, FONTS, fontStack, fontsHref } from '@/legacy/prototype'
import type { AppSnapshot, Scenario, Ui } from './types'
import { TOUR, markTourSeen, tourSeen } from '@/tour'
import { answer } from '@/chat'

const HOME = 'home'
/* База сайта: «/» при раздаче с корня, «/promminer-pool/» на GitHub Pages.
   Роутеру её отдаёт basepath, а здесь она нужна, чтобы вычислить раздел
   из адреса и обратно. */
const BASE = import.meta.env.BASE_URL || '/'
export const pathOf = (route: string) => (route === HOME ? '/' : '/' + route)
export const routeOf = (pathname: string) => {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname
  return p.replace(/^\/+|\/+$/g, '') || HOME
}

/* Затемнение акцента для состояний: в дизайн-системе ховер и нажатие —
   следующие шаги шкалы, а у произвольного цвета шкалы нет, поэтому берём
   тот же цвет темнее на 12 и 24 процента. */
const shade = (hex: string, k: number) => {
  const n = parseInt(hex, 16)
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('')
}

/* Гарнитуры Google Fonts подключаются одной ссылкой и только когда нужны:
   выбран не-Gilroy или открыта вкладка «Стиль», где шрифты показаны образцами. */
let fontsLinked = false
function ensureFonts() {
  if (fontsLinked) return
  fontsLinked = true
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = fontsHref()
  document.head.appendChild(l)
}

const freshUi = (): Ui => ({
  seg: {}, sort: {}, page: {}, per: {}, sel: new Set(), osel: new Set(), ochk: new Set(), phide: new Set(), nch: {}, oval: false, obs: 0, sess: '',
  scgrp: [], saved: loadSaved(), sctab: 'ax', scpin: loadPins(), schist: [], scw: 420, scside: 'right',
  ...loadPanel(),
  /* Первый заход — показываем обучение по панели; дальше только по кнопке «?» */
  tour: tourSeen() ? null : 0,
  q: '', wfilter: null, geo: '',
  wk: null, wtag: new Set(), wgrp: new Set(),
  ftag: new Set(), fmod: new Set(), fq: '', fapp: null, fback: false, exk: 'stat',
  grp: null, tg: null, gsel: new Set(), tsel: new Set(), ted: null, tname: '', tdesc: '', tcol: '#ef4444', tbase: '', wov: null, selq: '',
  qfocus: false, auth: 'login', consent: new Set(), arch: false, sub: '', step: 0, coin2: 'BTC', thr: null, rsel: null, rdel: false, rnote: false, lvl: null, dsel: {}, dpm: 0, zoom: 0, rwarn: false, awarn: false, togs: {}, ronly: false, exact: false,
})

/** Свои сценарии живут в localStorage отдельно от текущего состояния. */
const SAVED_KEY = 'pm.saved'
const PIN_KEY = 'pm.pins'
/** Геометрия панели: ширина, сторона и открытая вкладка — тоже переживают перезагрузку */
const PANEL_KEY = 'pm.panel'
type PanelGeom = Pick<Ui, 'scw' | 'scside' | 'sctab' | 'scgrp'>
function loadPanel(): PanelGeom {
  try { return JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') } catch { return {} }
}
function storePanel(u: Ui) {
  try {
    localStorage.setItem(PANEL_KEY,
      JSON.stringify({ scw: u.scw, scside: u.scside, sctab: u.sctab, scgrp: u.scgrp }))
  } catch { /* приватный режим */ }
}
function loadPins(): string[] {
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || '[]') } catch { return [] }
}
function storePins(list: string[]) {
  try { localStorage.setItem(PIN_KEY, JSON.stringify(list)) } catch { /* приватный режим */ }
}
function loadSaved(): Ui['saved'] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') } catch { return [] }
}
function storeSaved(list: Ui['saved']) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)) } catch { /* приватный режим */ }
}

/** Значение из ссылки должно быть среди значений оси: чужая или старая
    ссылка иначе роняет прототип (COINS['zzz'] — undefined, и экран падает).
    Исключение — акцентный цвет: у него свободное значение, шесть цифр. */
export function okValue(k: keyof Scenario, v: string) {
  const ax = AXES[k]
  if (!ax) return false
  if (ax.opts.some(([o]: [string, string]) => o === v)) return true
  return ax.free === 'color' && /^[0-9a-f]{6}$/i.test(v)
}

/** В ссылку пишем только отличия от умолчаний: полный набор — это 1106
    символов даже на нетронутом прототипе, а отличия обычно укладываются
    в несколько десятков. Старые ссылки с полным набором читаются как есть:
    loadScenario начинает с DEF и просто накладывает то, что нашлось. */
export function hashOf(s: Scenario) {
  const q = new URLSearchParams()
  for (const k of Object.keys(DEF) as (keyof Scenario)[]) if (s[k] !== DEF[k]) q.set(k, s[k])
  return q.toString()
}

/** Сценарий из хэша ссылки, иначе из localStorage, иначе дефолт. */
function loadScenario(): Scenario {
  let s = location.hash.slice(1)
  if (!s) { try { s = localStorage.getItem('pm') || '' } catch { /* приватный режим */ } }
  const q = new URLSearchParams(s)
  const out = { ...DEF }
  for (const k of Object.keys(DEF) as (keyof Scenario)[]) {
    const v = q.get(k)
    if (v && okValue(k, v)) out[k] = v
  }
  return out
}

interface Ctx {
  S: Scenario
  U: Ui
  route: string
  pop: string | null
  modal: string | null
  openGroups: Record<string, boolean>
  mini: boolean
  panel: boolean
  toasts: { id: number; msg: string }[]
  /** Делегированный обработчик: разбирает data-атрибуты, как в архивном прототипе. */
  onClick: (e: React.MouseEvent) => void
  onInput: (e: React.FormEvent) => void
  toast: (msg: string) => void
  go: (route: string) => void
  /** Правка эфемерного состояния из React-компонентов: делегированным
      обработчиком не выразить то, что тянут мышью. */
  patchUi: (p: Partial<Ui>) => void
  /** Копия состояния для движка прототипа. */
  snapshot: AppSnapshot
}

/* Контекст открыт наружу ради scripts/panel.mjs: он рендерит панель
   в строку с подставным состоянием, без роутера и браузера. */
export const AppCtx = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp вне AppProvider')
  return ctx
}

/** Модель текущего сценария — движок читает состояние, отданное через applyState. */
export function useModel() {
  const { snapshot } = useApp()
  applyState(snapshot)
  return M()
}

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const route = routeOf(pathname)

  const [, bump] = useReducer((x: number) => x + 1, 0)
  const S = useRef<Scenario>(loadScenario())
  const U = useRef<Ui>(freshUi())
  const pop = useRef<string | null>(null)
  const modal = useRef<string | null>(null)
  const openGroups = useRef<Record<string, boolean>>({ fin: false, tools: false, ref: false, sfin: false })
  const panel = useRef(false)
  const toasts = useRef<{ id: number; msg: string }[]>([])
  const toastId = useRef(0)

  /* Стопка предыдущих сценариев — «Отменить» в панели откатывает по одному шагу.
     Глубину держим небольшой: это инструмент отладки, а не редактор. */
  /* Оформление (шрифт, акцент, скругления, отступы, иконки) — не состояние
     продукта: связки, сброс и «Случайный» его не трогают, иначе выбранный
     стиль слетал от любого клика по готовому набору. Свой сброс у него
     на вкладке «Стиль». */
  const keepStyle = (from: Scenario) => {
    const out: Partial<Scenario> = {}
    for (const k of AX_STYLE) (out as Record<string, string>)[k] = (from as unknown as Record<string, string>)[k]
    return out
  }

  const pushHist = useCallback(() => {
    const h = U.current.schist || []
    U.current.schist = [...h, { ...S.current }].slice(-30)
  }, [])

  const go = useCallback((r: string) => {
    pop.current = null
    modal.current = null
    const g = GROUP_OF[r]
    if (g) openGroups.current[g] = true
    navigate({ to: pathOf(r) })
    scrollTo(0, 0)
  }, [navigate])

  const toast = useCallback((msg: string) => {
    /* Ось «Всплывающие подсказки»: их можно погасить, чтобы не мешали
       снимать экраны и записывать видео */
    if (!msg || S.current.toast === 'off') return
    const id = ++toastId.current
    toasts.current = [...toasts.current, { id, msg }]
    bump()
    setTimeout(() => { toasts.current = toasts.current.filter((t) => t.id !== id); bump() }, 2600)
  }, [])

  /* Буфер обмена отдаёт промис и умеет отказать (нет фокуса, нет прав) —
     без catch мы врали «Скопировано» и роняли необработанный отказ. */
  const copy = useCallback((text: string, ok: string) => {
    const c = navigator.clipboard
    if (!c) return toast('Браузер не дал доступ к буферу обмена')
    c.writeText(text).then(() => toast(ok), () => toast('Не удалось скопировать — выделите текст вручную'))
  }, [toast])

  /* Сценарий живёт в хэше — ссылку можно отправить команде. */
  useEffect(() => {
    const q = hashOf(S.current)
    history.replaceState(null, '', location.pathname + (q ? '#' + q : ''))
    try { localStorage.setItem('pm', q) } catch { /* приватный режим */ }
  })

  /* Свёрнутый сайдбар — тоже ось: кнопка в сайдбаре её переключает */
  useEffect(() => { document.body.classList.toggle('mini', S.current.side === 'mini') })
  /* Пока панель открыта, модалки центруются по свободной части экрана:
     иначе окно уезжает под панель — она лежит выше маски. */
  useEffect(() => {
    const b = document.body
    b.classList.toggle('scopen', panel.current)
    b.classList.toggle('scleft', U.current.scside === 'left')
    b.style.setProperty('--scpad', panel.current ? (U.current.scw || 420) + 'px' : '0px')
  })
  /* Меню строки таблицы висит фиксированно — ставим его под кнопкой,
     иначе прокрутка таблицы его обрезает, а снятая обрезка ломает вёрстку */
  useEffect(() => {
    const menu = document.querySelector('.pop.menu.wkmenu') as HTMLElement | null
    if (!menu) return
    const btn = menu.parentElement?.querySelector('[data-pop]') as HTMLElement | null
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const w = menu.offsetWidth, h = menu.offsetHeight
    const top = r.bottom + 8 + h > innerHeight ? r.top - 8 - h : r.bottom + 8
    menu.style.top = Math.max(8, top) + 'px'
    menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'
  })
  /* Оси «Интерфейса» живут атрибутами на <html>: тема, плотность,
     размер текста и анимации — всё стилями, без перерисовки экранов. */
  useEffect(() => {
    const t = S.current.theme
    const eff = t === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t
    const el = document.documentElement
    el.setAttribute('data-theme', eff)
    el.setAttribute('data-dens', S.current.dens)
    el.setAttribute('data-fsz', S.current.fsz)
    el.setAttribute('data-motion', S.current.motion)
    el.setAttribute('data-grid', S.current.grid)
    el.setAttribute('data-outline', S.current.outline)
    el.setAttribute('data-radius', S.current.radius)
    el.setAttribute('data-space', S.current.space)
    el.setAttribute('data-icons', S.current.icons)
    /* Акцент: «ds» — цвет дизайн-системы из app.css, иначе цвет из пипетки.
       Подложки и фокус — тот же цвет с прозрачностью 12% и 48%. */
    const acc = S.current.accent
    if (/^[0-9a-f]{6}$/i.test(acc)) {
      el.style.setProperty('--accent', '#' + acc)
      el.style.setProperty('--accent-sub', '#' + acc + '1f')
      el.style.setProperty('--accent-ghost', '#' + acc + '1f')
      el.style.setProperty('--accent-tint', '#' + acc + '29')
      el.style.setProperty('--focus', '#' + acc + '7a')
      /* без этих двух кнопка красится новым цветом, а под курсором
         возвращается к индиговому из дизайн-системы */
      el.style.setProperty('--accent-h', shade(acc, 0.88))
      el.style.setProperty('--accent-a', shade(acc, 0.76))
      /* знак логотипа живёт на своём фирменном токене — уводим и его */
      el.style.setProperty('--brand', '#' + acc)
    } else {
      for (const v of ['--accent', '--accent-sub', '--accent-ghost', '--accent-tint',
        '--focus', '--accent-h', '--accent-a', '--brand']) el.style.removeProperty(v)
    }
    /* Поле HEX в панели не управляемое (иначе теряется курсор при вводе) —
       подтягиваем его значение, когда цвет сменили образцом или пипеткой */
    const hx = document.getElementById('schex') as HTMLInputElement | null
    if (hx && document.activeElement !== hx) hx.value = /^[0-9a-f]{6}$/i.test(acc) ? acc : ''
    const f = S.current.font
    el.style.setProperty('--font', fontStack(f))
    if (FONTS[f]?.g || U.current.sctab === 'sty') ensureFonts()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* Пока идёт обучение, стрелки листают шаги, а Esc его закрывает */
      if (U.current.tour != null) {
        const n = U.current.tour
        if (e.key === 'Escape') { U.current.tour = null; markTourSeen(); return bump() }
        if (e.key === 'ArrowRight' && n < TOUR.length - 1) {
          U.current.tour = n + 1
          const st = TOUR[n + 1]
          if (st.panel !== undefined) panel.current = st.panel
          if (st.tab) U.current.sctab = st.tab
          return bump()
        }
        if (e.key === 'ArrowLeft' && n > 0) {
          U.current.tour = n - 1
          const st = TOUR[n - 1]
          if (st.panel !== undefined) panel.current = st.panel
          if (st.tab) U.current.sctab = st.tab
          return bump()
        }
      }
      if (e.key === 'Escape') {
        if (modal.current) { modal.current = null; bump() }
        else if (pop.current) { pop.current = null; bump() }
        else if (panel.current) { panel.current = false; bump() }
      }
      /* Enter в поле чата — то же, что кнопка «Отправить»: жмём её,
         чтобы разбор жил в одном месте, в делегированном обработчике. */
      if (e.key === 'Enter' && (e.target as HTMLElement)?.id === 'scchat') {
        (document.querySelector('[data-chatsend]') as HTMLElement | null)?.click()
        return
      }
      const tag = (e.target as HTMLElement)?.tagName || ''
      const typing = /input|textarea/i.test(tag)
      if ((e.key === 's' || e.key === 'ы') && !typing) {
        panel.current = !panel.current
        bump()
      }
      /* «/» открывает панель и ставит курсор в поиск — как в дев-инструментах */
      if (e.key === '/' && !typing) {
        e.preventDefault()
        if (!panel.current) { panel.current = true; bump() }
        setTimeout(() => (document.getElementById('scq') as HTMLInputElement | null)?.focus(), 60)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  /* Наведение на график: линия, точки на сериях и подсказка. Двигаем живой DOM,
     а не состояние, иначе каждый пиксель мыши перерисовывал бы экран. */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const wrap = (e.target as HTMLElement)?.closest?.('.chartwrap[data-chart]') as HTMLElement | null
      if (!wrap) return
      const cfg = JSON.parse(wrap.dataset.chart!)
      /* .chartwrap теперь ровно поле графика: подписи осей живут в HTML рядом,
         поэтому проценты считаем прямо от его размеров */
      const box = wrap.getBoundingClientRect()
      const t01 = (e.clientX - box.left) / box.width
      const i = Math.round(t01 * (cfg.N - 1))
      if (i < 0 || i > cfg.N - 1) { wrap.classList.remove('on'); return }
      const v = cfg.p[i]
      /* На пропуске в данных подсказки нет — линия там разорвана */
      if (v == null) { wrap.classList.remove('on'); return }
      const px = (i / (cfg.N - 1)) * box.width
      const py = box.height - (v / 100) * box.height
      const pr = box.height - 2
      const line = wrap.querySelector('.chline') as HTMLElement
      const dh = wrap.querySelector('.cdot.ch') as HTMLElement
      const dr = wrap.querySelector('.cdot.cr') as HTMLElement
      const tip = wrap.querySelector('.ctip') as HTMLElement
      line.style.left = px + 'px'
      dh.style.left = px + 'px'; dh.style.top = py + 'px'
      dr.style.left = px + 'px'; dr.style.top = pr + 'px'
      const t = cfg.hrs[Math.round((i / (cfg.N - 1)) * (cfg.hrs.length - 1))]
      const hash = Math.round((v / 100) * cfg.max)
      tip.innerHTML =
        `<b>${t}</b><span><i class="h"></i>Хэшрейт<em>${hash.toLocaleString('ru')} ${cfg.unit}</em></span>` +
        `<span><i class="r"></i>Реджект<em>${(v / 50).toFixed(2).replace('.', ',')} %</em></span>`
      tip.style.left = px + 'px'
      tip.classList.toggle('flip', px > box.width - 200)
      wrap.classList.add('on')
    }
    const onLeave = (e: MouseEvent) => {
      const wrap = (e.target as HTMLElement)?.closest?.('.chartwrap') as HTMLElement | null
      if (wrap) wrap.classList.remove('on')
    }
    /* список событий: под шапкой появляется разделитель, когда список сдвинут */
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement
      if (el?.classList?.contains('wdevents')) el.closest('.wdevcard')?.classList.toggle('scrolled', el.scrollTop > 0)
    }
    addEventListener('mousemove', onMove)
    addEventListener('mouseout', onLeave)
    addEventListener('scroll', onScroll, true)
    return () => {
      removeEventListener('mousemove', onMove); removeEventListener('mouseout', onLeave)
      removeEventListener('scroll', onScroll, true)
    }
  }, [])

  const onInput = useCallback((e: React.FormEvent) => {
    const q = (e.target as HTMLElement).closest('#q') as HTMLInputElement | null
    if (q) { U.current.q = q.value; U.current.page.workers = 1; U.current.qfocus = true; bump() }
    const sq = (e.target as HTMLElement).closest('#scq') as HTMLInputElement | null
    if (sq) { U.current.scq = sq.value; bump() }
    const fq = (e.target as HTMLElement).closest('#fq') as HTMLInputElement | null
    if (fq) { U.current.fq = fq.value; bump() }
    const sq2 = (e.target as HTMLElement).closest('#selq') as HTMLInputElement | null
    if (sq2) { U.current.selq = sq2.value; bump() }
    /* Пипетка браузера и поле HEX в панели стиля — акцент меняется на лету */
    const ac = (e.target as HTMLElement).closest('#scacc') as HTMLInputElement | null
    if (ac) { S.current.accent = ac.value.replace('#', '').toLowerCase(); bump() }
    const hx = (e.target as HTMLElement).closest('#schex') as HTMLInputElement | null
    if (hx) {
      const v = hx.value.trim().replace('#', '').toLowerCase()
      if (/^[0-9a-f]{6}$/.test(v)) { S.current.accent = v; bump() }
    }
    const tn = (e.target as HTMLElement).closest('#tname') as HTMLInputElement | null
    if (tn) { U.current.tname = tn.value; bump() }
    const td = (e.target as HTMLElement).closest('#tdesc') as HTMLInputElement | null
    if (td) { U.current.tdesc = td.value; bump() }
  }, [])

  const snapshot = useCallback((): AppSnapshot => ({
    S: S.current, U: U.current, route,
    pop: pop.current, modal: modal.current,
    openGroups: openGroups.current, mini: S.current.side === 'mini',
  }), [route])

  const onClick = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    const at = (sel: string) => t.closest(sel) as HTMLElement | null
    const u = U.current

    /* Группы и теги: создание, правка, удаление и привязка в одной модалке */
    const bindMode = () => modal.current === 'wgroups' || modal.current === 'wtags'
    const listOf = (k: string) => (k === 'g' ? groups() : tagsOf())
    /* привязки воркера в U — их читает деталка и правят модалки */
    const seedBind = (w: { tags?: string[]; grp?: number[] } | null) => {
      if (!w) return
      u.wgrp = new Set(w.grp || [])
      const tl = tagsOf()
      u.wtag = new Set((w.tags || []).map((t) => tl.findIndex((x) => x.n === t)).filter((i) => i >= 0))
    }
    const markOf = (k: string) =>
      bindMode() ? (k === 'g' ? u.wgrp : u.wtag) : (k === 'g' ? u.gsel : u.tsel)
    const tcol = at('[data-tcol]')
    if (tcol) { u.tcol = tcol.dataset.tcol!; return bump() }
    const tall = at('[data-tall]')
    if (tall) {
      const k = tall.dataset.tall!, set = markOf(k), list = listOf(k)
      if (set.size === list.length) set.clear()
      else list.forEach((_: unknown, i: number) => set.add(i))
      return bump()
    }
    const tpick = at('[data-tpick]')
    if (tpick) {
      const [k, i] = tpick.dataset.tpick!.split(':')
      const set = markOf(k), n = +i
      set.has(n) ? set.delete(n) : set.add(n)
      return bump()
    }
    /* «Изменить» превращает строку в поле ввода (макет 173:67199) */
    const ted = at('[data-ted]')
    if (ted) {
      const [, i] = ted.dataset.ted!.split(':')
      u.ted = +i; u.tname = ''
      return bump()
    }
    if (at('[data-tcancel]')) { u.ted = null; u.tname = ''; return bump() }
    const ts2 = at('[data-tsave2]')
    if (ts2) {
      const k = ts2.dataset.tsave2!, list = listOf(k)
      const inp = ts2.closest('.tcard')?.querySelector('input') as HTMLInputElement | null
      const name = (inp?.value || '').trim()
      if (name && u.ted != null && list[u.ted]) Object.assign(list[u.ted] as object, { n: name })
      u.ted = null; u.tname = ''
      bump()
      return toast(k === 'g' ? 'Группа изменена' : 'Тег изменён')
    }
    /* Корзина в строке — удаляем именно её, не трогая общий выбор */
    const ted1 = at('[data-ted1]')
    if (ted1) {
      const [k, i] = ted1.dataset.ted1!.split(':')
      const set = k === 'g' ? u.gsel : u.tsel
      set.clear(); set.add(+i)
    }
    const tsave = at('[data-tsave]')
    if (tsave) {
      const k = tsave.dataset.tsave!, list = listOf(k), name = (u.tname || '').trim()
      if (!name) return
      ;(list as { n: string; d?: string; c?: string }[]).push(
        k === 'g' ? { n: name, c: '0' } : { n: name, d: u.tdesc || '', c: u.tcol || '#ef4444' })
      u.ted = null; u.tname = ''; u.tdesc = ''
      bump()
      return toast(tsave.dataset.toast!)
    }
    const tdel = at('[data-tdel]')
    if (tdel) {
      const k = tdel.dataset.tdel!, set = k === 'g' ? u.gsel : u.tsel
      const kept = listOf(k).filter((_: unknown, i: number) => !set.has(i))
      if (k === 'g') u.grp = kept as Ui['grp']; else u.tg = kept as Ui['tg']
      const many = set.size > 1
      set.clear(); u.ted = null; u.tname = ''; u.tdesc = ''
      toast(k === 'g' ? (many ? 'Группы удалены' : 'Группа удалена') : (many ? 'Теги удалены' : 'Тег удалён'))
    }
    const tbind = at('[data-tbind]')
    if (tbind) {
      const k = tbind.dataset.tbind!, set = k === 'g' ? u.wgrp : u.wtag
      const now = [...set].sort().join()
      if (now === (u.tbase ?? '')) return toast('Выбор не изменился')
      /* пишем привязку обратно в воркера — она переживает перерисовку списка */
      if (u.wk) {
        const tl = tagsOf()
        const patch = k === 'g'
          ? { grp: [...u.wgrp] }
          : { tags: [...u.wtag].map((i) => tl[i] && tl[i].n).filter(Boolean) }
        u.wov = { ...(u.wov || {}), [u.wk.id]: { ...(u.wov?.[u.wk.id] || {}), ...patch } }
        Object.assign(u.wk, patch)
      }
      modal.current = null; bump()
      return toast(k === 'g' ? 'Группы обновлены' : 'Теги обновлены')
    }

    const au = at('[data-auth]')
    if (au) { u.auth = au.dataset.auth!; u.consent.clear(); return bump() }
    const ach = at('[data-acheck]')
    if (ach) { const i = +ach.dataset.acheck!; u.consent.has(i) ? u.consent.delete(i) : u.consent.add(i); return bump() }
    const a2 = at('[data-auth2]')
    if (a2 && a2.dataset.auth2) {
      const n = a2.dataset.auth2
      if (n === 'done') { u.auth = 'login'; go(HOME); toast('Готово') } else { u.auth = n }
      return bump()
    }
    const si = at('[data-subinfo]')
    if (si) { u.sub = si.dataset.subinfo!; modal.current = 'subinfo'; return bump() }
    const nt = at('[data-note]')
    if (nt) { u.note = Number(nt.dataset.note); modal.current = 'noteinfo'; pop.current = null; return bump() }
    const th = at('[data-theme-set]')
    /* Тема — ось сценария: уезжает в ссылку вместе с остальным состоянием */
    if (th) { S.current.theme = th.dataset.themeSet!; return bump() }
    if (at('[data-arch]')) { u.arch = !u.arch; return bump() }
    const sg = at('[data-seg]')
    if (sg) {
      u.seg[sg.dataset.seg!] = +sg.dataset.i!
      if (sg.closest('.pop')) pop.current = null
      return bump()
    }
    const wf = at('[data-wf]')
    if (wf) { u.wfilter = wf.dataset.wf!; u.page.workers = 1; return bump() }
    const sk = at('[data-sortk]')
    if (sk) {
      const k = sk.dataset.sortk!, tb = sk.dataset.sorttbl || 'workers', s = u.sort[tb]
      u.sort[tb] = s && s.k === k ? (s.d > 0 ? { k, d: -1 } : null) : { k, d: 1 }
      return bump()
    }
    /* Размер страницы в пагинации */
    const pper = at('[data-per]')
    if (pper) {
      const [id, n] = pper.dataset.per!.split(':')
      u.per[id] = +n; u.page[id] = 1; pop.current = null
      return bump()
    }
    const pg = at('[data-page]')
    if (pg && !(pg as HTMLButtonElement).disabled) { u.page[pg.dataset.page!] = +pg.dataset.p!; return bump() }
    /* «Подтвердить» в форме наблюдателя: либо ошибки, либо экран успеха */
    if (at('[data-osubmit]')) {
      /* под суб-аккаунтом аккаунт не выбирают — группы там нет */
      const groups = S.current.acct === 'sub' ? ['perm', 'coin'] : ['acc', 'perm', 'coin']
      const empty = groups.some((k) => !Array.from(u.ochk).some((x) => x.startsWith(k + ':')))
      if (empty || S.current.oerr !== 'no') { u.oval = true; return bump() }
      u.oval = false; u.step = 1; return bump()
    }
    /* Чекбоксы в форме наблюдателя и «Выбрать все» по группе */
    const ock = at('[data-ochk]')
    if (ock) { const k = ock.dataset.ochk!; u.ochk.has(k) ? u.ochk.delete(k) : u.ochk.add(k); return bump() }
    const oca = at('[data-ochkall]')
    if (oca) {
      const [key, n] = oca.dataset.ochkall!.split(':')
      const all = Array.from({ length: +n }, (_, i) => `${key}:${i}`)
      const on = all.every((k) => u.ochk.has(k))
      all.forEach((k) => (on ? u.ochk.delete(k) : u.ochk.add(k)))
      return bump()
    }
    /* Баннеры сводки закрываются по крестику */
    const ph = at('[data-phide]')
    if (ph) { u.phide.add(+ph.dataset.phide!); toast('Баннер скрыт'); return bump() }
    /* Тумблер канала у события и «Включить все / Выключить все» по колонке */
    const nch = at('[data-nch]')
    if (nch) { const k = nch.dataset.nch!; u.nch[k] = !nch.classList.contains('on'); return bump() }
    const nc = at('[data-ncol]')
    if (nc) {
      const i = nc.dataset.ncol!
      const togs = Array.from(document.querySelectorAll<HTMLElement>(`.ntbl .tog[data-nch$="-${i}"]`))
      const on = togs.every((t) => t.classList.contains('on'))
      togs.forEach((t) => { u.nch[t.dataset.nch!] = !on })
      toast(on ? 'Канал выключен для всех событий' : 'Канал включен для всех событий')
      return bump()
    }
    /* Выбор строк наблюдателей — своя коллекция, не пересекается с воркерами */
    const osl = at('[data-osel]')
    if (osl) { const i = +osl.dataset.osel!; u.osel.has(i) ? u.osel.delete(i) : u.osel.add(i); return bump() }
    if (at('[data-oselall]')) {
      applyState(snapshot())
      const n = obsOf(M()).length
      const on = n > 0 && Array.from({ length: n }, (_, i) => i).every((i) => u.osel.has(i))
      u.osel.clear()
      if (!on) for (let i = 0; i < n; i++) u.osel.add(i)
      return bump()
    }
    if (at('[data-oselclear]')) { u.osel.clear(); return bump() }
    const sl = at('[data-sel]')
    if (sl) { const id = +sl.dataset.sel!; u.sel.has(id) ? u.sel.delete(id) : u.sel.add(id); return bump() }
    if (at('[data-selall]')) {
      applyState(snapshot())
      const rows = workersRows(M()), per = u.per.workers ?? 10
      const pages = Math.max(1, Math.ceil(rows.length / per))
      const cur = Math.min(u.page.workers || 1, pages)
      const page = rows.slice((cur - 1) * per, cur * per)
      const on = page.every((w: any) => u.sel.has(w.id))
      page.forEach((w: any) => (on ? u.sel.delete(w.id) : u.sel.add(w.id)))
      return bump()
    }
    const sc = at('[data-selclear]')
    /* «Удалить» в панели массовых действий несёт и снятие выбора, и закрытие */
    if (sc) { u.sel.clear(); if (!sc.hasAttribute('data-close')) return bump() }
    const geo = at('[data-geo]')
    if (geo) { u.geo = geo.dataset.geo === 'Все' ? '' : geo.dataset.geo!; u.page.workers = 1; return bump() }
    const tf = at('[data-tilef]')
    if (tf) { u.wfilter = tf.dataset.tilef!; u.page.workers = 1; go('workers'); return bump() }
    const cp = at('[data-copy]')
    if (cp) { copy(cp.dataset.copy!, 'Скопировано'); return }
    /* «Посмотреть» в экшн-меню строки — тот же переход, что и клик по строке */
    const wko = at('[data-wkopen]')
    if (wko) {
      applyState(snapshot())
      u.wk = workersList(M()).find((w: any) => w.id === +wko.dataset.wkopen!) || null
      seedBind(u.wk)
      pop.current = null
      go('worker')
      return bump()
    }
    const wk = at('[data-wk]')
    /* по клику на строку — в деталку, но не когда жмут меню действий
       или чекбокс выбора (комментарий дизайнера в макете 177:122812) */
    if (wk && !at('[data-pop]') && !at('[data-sel]') && !at('.wact') && !at('.pop')) {
      applyState(snapshot())
      u.wk = workersList(M()).find((w: any) => w.id === +wk.dataset.wk!) || null
      seedBind(u.wk)
      go('worker')
      return bump()
    }
    if (at('[data-readall]')) { S.current.notif = 'none'; pop.current = null; bump(); return toast('Все уведомления отмечены как прочитанные') }
    const st = at('[data-step]')
    if (st) { u.step = +st.dataset.step!; return bump() }
    const md = at('[data-modal]')
    if (md) {
      if (md.dataset.obs) u.obs = +md.dataset.obs
      if (md.dataset.sess) u.sess = md.dataset.sess
      if (md.dataset.ex) u.exk = md.dataset.ex
      /* модалки активов открываются на монете той строки, из которой нажали */
      if (md.dataset.coin) { u.coin2 = md.dataset.coin; u.thr = null }
      /* генерация отчёта открывается со всеми отмеченными аккаунтами */
      if (md.dataset.modal === 'repacc') {
        u.rsel = new Set(subsOf(M()).filter((x: any) => !x.arch).map((x: any) => x.name))
        u.rdel = false
      }
      if (md.dataset.wk2) {
        const w2 = workersList(M()).find((w: any) => w.id === +md.dataset.wk2!)
        if (w2) { u.wk = w2; seedBind(w2) }
      }
      /* форма групп и тегов открывается пустой, а привязка помнит исходный выбор */
      if (['group', 'tagnew', 'wgroups', 'wtags'].includes(md.dataset.modal!)) {
        u.ted = null; u.tname = ''; u.tdesc = ''
        if (md.dataset.modal === 'wgroups') u.tbase = [...u.wgrp].sort().join()
        if (md.dataset.modal === 'wtags') u.tbase = [...u.wtag].sort().join()
      }
      /* «Создать тег» из шторки — после создания вернуться в шторку */
      u.fback = md.dataset.modal === 'tagnew' && modal.current === 'filters'
      modal.current = md.dataset.modal!; u.step = 0; u.vfile = false; u.vbank = undefined; pop.current = null
      /* формы наблюдателя открываются с отмеченными первыми двумя пунктами */
      if (md.dataset.modal === 'observer' || md.dataset.modal === 'obsedit') {
        u.ochk = new Set(['acc:0', 'acc:1', 'perm:0', 'perm:1', 'coin:0', 'coin:1'])
        u.oval = false
      }
      return bump()
    }
    const tst = at('[data-toast]')
    /* Ось «Ошибка сети» на значении «При отправке формы»: любое действие,
       которое рапортует об успехе, вместо этого сообщает о сбое связи */
    const say = (msg: string) => toast(
      S.current.neterr === 'form' && !/не удалось|ошибка/i.test(msg)
        ? 'Не удалось сохранить: нет связи с сервером'
        : msg)
    /* Ось сценария применяем до закрытия: кнопки модалок несут и data-axis,
       и data-close, а ветка закрытия выходит из обработчика. */
    const ax = at('[data-axis]')
    if (ax) {
      pushHist()
      ;(S.current as any)[ax.dataset.axis!] = ax.dataset.val
      /* Списки групп и тегов кэшируются в U — оси, которые их задают,
         сбрасывают кэш, иначе лента площадок не меняется */
      if (ax.dataset.axis === 'wf' || ax.dataset.axis === 'wgeo') { u.grp = null; u.tg = null }
      pop.current = null
      guardRoute()
      if (!ax.hasAttribute('data-close')) return bump()
    }
    const cl = at('[data-close]')
    /* Маска тоже помечена data-close, но закрывать по ней нужно только при клике
       мимо окна — иначе модалка схлопывается от клика по любому полю внутри. */
    if (cl && (!cl.classList.contains('mask') || t === cl)) {
      const back = modal.current === 'tagnew' && u.fback
      modal.current = back ? 'filters' : null
      if (back) u.fback = false
      bump(); if (tst) say(tst.dataset.toast!); return
    }
    /* «Вставить» — подставляет номер в поле рядом */
    const ps = at('[data-paste]')
    if (ps) {
      const inp = ps.parentElement?.querySelector('input') as HTMLInputElement | null
      if (inp) { inp.value = ps.dataset.paste!; inp.dispatchEvent(new Event('input', { bubbles: true })) }
      if (tst) say(tst.dataset.toast!)
      return
    }
    if (tst) return say(tst.dataset.toast!)
    const gt = at('[data-go]')
    if (gt) { go(gt.dataset.go!); return bump() }
    /* Вотчер без разрешения на раздел не должен на нём стоять: уводим
       на первый доступный, а если Главной нет — на ближайший из разрешённых */
    /* Шаг обучения открывает панель и нужную вкладку: подсветка ссылается
       на настоящие элементы, и без этого ей не на что встать. */
    function applyTourStep(n: number) {
      const step = TOUR[n]
      if (!step) return
      if (step.panel !== undefined) panel.current = step.panel
      if (step.tab) { u.sctab = step.tab; storePanel(u) }
    }

    function guardRoute() {
      /* монета вне набора ссылки наблюдателя переключается на доступную (28:44088) */
      const coins = coinsOf()
      if (coins && !coins.has(S.current.coin)) S.current.coin = [...coins][0]
      const ok = allowed()
      if (!ok || ok.has(route)) return
      const next = ['home', 'workers', 'assets', 'income', 'payouts', 'ref'].find((r) => ok.has(r))
      if (next && next !== route) go(next)
    }
    /* стрелки прокрутки ленты групп на «Воркерах» */
    /* чекбоксы в модалках «Изменить теги» и «Изменить группы» */
    /* шторка фильтров: теги чипами, модели чекбоксами, поиск по моделям */
    const ft = at('[data-ftag]')
    if (ft) { const t = ft.dataset.ftag!; u.ftag.has(t) ? u.ftag.delete(t) : u.ftag.add(t); return bump() }
    const fm = at('[data-fmod]')
    if (fm) { const k = fm.dataset.fmod!; u.fmod.has(k) ? u.fmod.delete(k) : u.fmod.add(k); return bump() }
    if (at('[data-fall]')) {
      const all = MODELS.map(([k]) => k)
      u.fmod = new Set(u.fmod.size === all.length ? [] : all)
      return bump()
    }
    const fr = at('[data-freset]')
    if (fr) {
      const k = fr.dataset.freset!
      if (k !== 'm') u.ftag.clear()
      if (k !== 't') { u.fmod.clear(); u.fq = '' }
      if (k === 'all') { u.fapp = null; u.page.workers = 1 }
      return bump()
    }
    if (at('[data-fapply]')) {
      u.fapp = { t: [...u.ftag], m: [...u.fmod] }
      u.page.workers = 1
      modal.current = null
      toast('Фильтры применены')
      return bump()
    }
    if (at('[data-fclear]')) {
      u.ftag.clear(); u.fmod.clear(); u.fq = ''; u.fapp = null; u.page.workers = 1
      return bump()
    }
    const gs = at('[data-gscroll]')
    if (gs) {
      const strip = gs.parentElement?.querySelector('.segl') as HTMLElement | null
      if (strip) strip.scrollLeft += +gs.dataset.gscroll! * 320
      return
    }
    const gp = at('[data-grp]')
    if (gp) { const g = gp.dataset.grp!; openGroups.current[g] = !openGroups.current[g]; return bump() }
    const ac = at('[data-acct]')
    if (ac) {
      S.current.acct = ac.dataset.acct!
      pop.current = null
      /* выбор аккаунта выводит из режима сводки в кабинет этого аккаунта */
      if (SUM_ROUTES.has(route)) go('home')
      /* под суб-аккаунтом часть разделов профиля недоступна — уводим на сводку */
      else if (S.current.acct === 'sub' && ['security', 'verification', 'subaccounts'].includes(route)) go('profile')
      return bump()
    }
    if (at('[data-pop]')) u.dpm = 0
    const pp = at('[data-pop]')
    if (pp) { pop.current = pop.current === pp.dataset.pop ? null : pp.dataset.pop!; return bump() }
    const eye = at('[data-eye]')
    if (eye) {
      const inp = eye.closest('.inp, .afield')?.querySelector('input') as HTMLInputElement | null
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password'
      eye.classList.toggle('on')
      return
    }
    /* Крестик в поле анкеты — очищает значение */
    const clr = at('[data-clear]')
    if (clr) {
      const inp = clr.closest('.inp')?.querySelector('input') as HTMLInputElement | null
      if (inp) { inp.value = ''; inp.focus() }
      return
    }
    /* Выписка в модалке: зона загрузки прикладывает файл, «Удалить» убирает */
    const vf = at('[data-vfile]')
    if (vf) { U.current.vfile = vf.dataset.vfile !== 'off'; return bump() }
    const vb = at('[data-vbank]')
    if (vb) { U.current.vbank = vb.dataset.vbank!; pop.current = null; return bump() }
    const rs = at('[data-rsel]')
    if (rs) {
      const n = rs.dataset.rsel!
      const set = new Set(u.rsel || [])
      set.has(n) ? set.delete(n) : set.add(n)
      u.rsel = set; return bump()
    }
    const ra = at('[data-rall]')
    if (ra) {
      u.rsel = ra.dataset.rall === 'on'
        ? new Set(subsOf(M()).filter((x: any) => !x.arch).map((x: any) => x.name))
        : new Set()
      return bump()
    }
    if (at('[data-rdel]')) { u.rdel = !u.rdel; return bump() }
    if (at('[data-rnote]')) { u.rnote = true; return bump() }
    const zm = at('[data-zoom]')
    if (zm) { u.zoom = Math.max(0, Math.min(3, (u.zoom || 0) + Number(zm.dataset.zoom))); return bump() }
    if (at('[data-rwarn]')) { u.rwarn = true; return bump() }
    if (at('[data-awarn]')) { u.awarn = true; return bump() }
    if (at('[data-ronly]')) { u.ronly = !u.ronly; return bump() }
    if (at('[data-exact]')) { u.exact = !u.exact; return bump() }
    /* Календарь: стрелки листают месяц, клики набирают диапазон */
    const dm = at('[data-dpm]')
    if (dm) { u.dpm = (u.dpm || 0) + Number(dm.dataset.dpm); return bump() }
    const dd = at('[data-dpd]')
    if (dd) {
      const key = pop.current || ''
      const [mi, yr, d] = dd.dataset.dpd!.split(':').map(Number)
      const cur = u.dsel[key]
      u.dsel[key] = !cur || cur.b || cur.mi !== mi || cur.yr !== yr
        ? { mi, yr, a: d, b: 0 }
        : { mi, yr, a: Math.min(cur.a, d), b: Math.max(cur.a, d) }
      return bump()
    }
    const lv = at('[data-lvl]')
    if (lv) { const i = +lv.dataset.lvl!; u.lvl = u.lvl === i ? null : i; return bump() }
    /* «Сбросить» в калькуляторах возвращает поля к состоянию по умолчанию */
    if (at('[data-creset]')) {
      for (const k of Object.keys(u.seg)) if (k.startsWith('calc-') || k.startsWith('tax-')) delete u.seg[k]
      toast('Значения сброшены'); return bump()
    }
    const c2 = at('[data-coin2]')
    if (c2) { u.coin2 = c2.dataset.coin2!; u.thr = null; pop.current = null; return bump() }
    const tr = at('[data-thr]')
    if (tr) { u.thr = tr.dataset.thr!; return bump() }
    const tg = at('[data-tog]')
    if (tg) {
      /* переключатели таблиц запоминают состояние: раньше класс слетал на перерисовке */
      const k = tg.dataset.tog
      if (k) { u.togs[k] = !tg.classList.contains('on'); return bump() }
      tg.classList.toggle('on'); return
    }
    if (at('[data-mini]')) { S.current.side = S.current.side === 'mini' ? 'full' : 'mini'; return bump() }
    if (at('[data-panel]')) { panel.current = !panel.current; return bump() }
    /* ==== Чат панели ==== */
    const said = at('[data-chatsay]')
    const send = at('[data-chatsend]')
    if (said || send) {
      const inp = document.getElementById('scchat') as HTMLInputElement | null
      const text = said ? said.dataset.chatsay! : (inp?.value || '').trim()
      if (!text) return
      if (inp && !said) inp.value = ''
      const a = answer(text)
      u.chat = [...(u.chat || []), { role: 'you', text }, { role: 'bot', text: a.say }]
      if (a.apply) { pushHist(); Object.assign(S.current, a.apply) }
      if (a.modal) modal.current = a.modal
      /* Подсказки под ответом кладём отдельным сообщением: разметка читает
         их из последнего ответа, поэтому держим их рядом с ним */
      u.chatchips = a.chips || []
      if (a.go) { go(a.go); return bump() }
      guardRoute()
      return bump()
    }
    if (at('[data-chatclear]')) { u.chat = []; u.chatchips = []; return bump() }

    /* ==== Обучение ==== */
    if (at('[data-tour]')) { u.tour = 0; applyTourStep(0); return bump() }
    const tstep = at('[data-tourgo]')
    if (tstep) {
      const n = Number(tstep.dataset.tourgo)
      if (n < 0 || n >= TOUR.length) { u.tour = null; markTourSeen(); return bump() }
      u.tour = n; applyTourStep(n); return bump()
    }
    if (at('[data-tourend]')) { u.tour = null; markTourSeen(); return bump() }
    const pr = at('[data-preset]')
    if (pr) {
      const found = PRESETS.find(([n]) => n === pr.dataset.preset)
      if (found) {
        pushHist()
        S.current = pr.hasAttribute('data-over')
          ? { ...S.current, ...found[2] }
          : { ...DEF, ...keepStyle(S.current), ...found[2] }
        modal.current = null; toast(`Сценарий «${found[0]}»`)
      }
      return bump()
    }
    if (at('[data-reset]')) {
      pushHist()
      S.current = { ...DEF, ...keepStyle(S.current) }
      /* Раньше сброс заодно уводил на Главную, хотя из названия это не следует.
         Экран остаётся тот же — уходим с него, только если он стал недоступен. */
      modal.current = null; guardRoute(); return bump()
    }
    /* ==== Панель сценариев ==== */
    if (at('[data-onlydirty]')) { u.scdirty = !u.scdirty; return bump() }
    if (at('[data-onlypin]')) { u.sconly = !u.sconly; return bump() }
    if (at('[data-onlyfigma]')) { u.scfig = !u.scfig; return bump() }
    /* Пипетка: берёт цвет с любой точки экрана. Есть не во всех браузерах —
       в остальных остаются образцы и системный выбор цвета. */
    if (at('[data-eyedrop]')) {
      const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
      if (!ED) return toast('Пипетка есть в Chrome и Edge — здесь выберите цвет в поле рядом')
      new ED().open().then((r) => {
        pushHist()
        S.current.accent = r.sRGBHex.replace('#', '').toLowerCase()
        bump()
      }).catch(() => { /* закрыли пипетку клавишей Esc */ })
      return
    }
    /* Сброс только оформления: остальной сценарий остаётся как был */
    if (at('[data-styreset]')) {
      pushHist()
      for (const k of AX_STYLE) (S.current as unknown as Record<string, string>)[k] = (DEF as unknown as Record<string, string>)[k]
      return bump()
    }
    const tab = at('[data-sctab]')
    if (tab) { u.sctab = tab.dataset.sctab as Ui['sctab']; storePanel(u); return bump() }
    /* Закреплённые оси всплывают наверх списка и переживают перезагрузку */
    const pin = at('[data-scpin]')
    if (pin) {
      const k = pin.dataset.scpin!
      const list = u.scpin || []
      u.scpin = list.includes(k) ? list.filter((x) => x !== k) : [...list, k]
      storePins(u.scpin)
      return bump()
    }
    /* Шаг назад по истории: каждая смена оси кладёт предыдущий сценарий в стопку */
    if (at('[data-scback]')) {
      const h = u.schist || []
      if (!h.length) return toast('История пуста')
      S.current = h[h.length - 1]
      u.schist = h.slice(0, -1)
      return bump()
    }
    /* Сброс и случайные значения внутри одной группы */
    const gr = at('[data-grpreset]')
    if (gr) {
      pushHist()
      const g = gr.dataset.grpreset!
      for (const k of Object.keys(AXES) as (keyof typeof DEF)[]) if (AXES[k].g === g) S.current[k] = DEF[k]
      return bump()
    }
    const gx = at('[data-grprand]')
    if (gx) {
      pushHist()
      const g = gx.dataset.grprand!
      for (const k of Object.keys(AXES) as (keyof typeof DEF)[]) if (AXES[k].g === g && !AX_STYLE.has(k)) {
        const opts = AXES[k].opts.map(([v]: [string, string]) => v)
        S.current[k] = opts[Math.floor(Math.random() * opts.length)]
      }
      return bump()
    }
    /* Свернуть или развернуть сразу все группы */
    const col = at('[data-sccol]')
    if (col) {
      const all = [...new Set(Object.keys(AXES).map((k) => AXES[k as keyof typeof AXES].g))]
      u.scgrp = col.dataset.sccol === 'all' ? all : []
      storePanel(u)
      return bump()
    }
    /* Ширина панели и сторона швартовки */
    const sw = at('[data-scw]')
    if (sw) { u.scw = Number(sw.dataset.scw); storePanel(u); return bump() }
    if (at('[data-scside]')) { u.scside = u.scside === 'left' ? 'right' : 'left'; storePanel(u); return bump() }
    if (at('[data-copyjson]')) {
      const diff: Record<string, string> = {}
      for (const k of Object.keys(DEF) as (keyof typeof DEF)[]) if (S.current[k] !== DEF[k]) diff[k] = S.current[k]
      copy(JSON.stringify(diff, null, 2), 'Сценарий скопирован как JSON')
      return
    }
    const grp = at('[data-scgrp]')
    if (grp) {
      const g = grp.dataset.scgrp!
      const list = u.scgrp || []
      u.scgrp = list.includes(g) ? list.filter((x) => x !== g) : [...list, g]
      storePanel(u)
      return bump()
    }
    const axr = at('[data-axreset]')
    if (axr) { pushHist(); const k = axr.dataset.axreset! as keyof typeof DEF; S.current[k] = DEF[k]; return bump() }
    if (at('[data-rand]')) {
      pushHist()
      const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
      for (const k of Object.keys(AXES) as (keyof typeof DEF)[]) {
        if (AX_STYLE.has(k)) continue
        S.current[k] = pick(AXES[k].opts.map(([v]: [string, string]) => v))
      }
      toast('Случайный сценарий')
      return bump()
    }
    if (at('[data-save]')) {
      const inp = document.getElementById('scname') as HTMLInputElement | null
      const name = (inp?.value || '').trim() || `Сценарий ${(u.saved?.length || 0) + 1}`
      const axes: Record<string, string> = {}
      for (const k of Object.keys(DEF) as (keyof typeof DEF)[])
        if (S.current[k] !== DEF[k]) axes[k] = S.current[k]
      /* Два сохранения подряд давали два одинаковых набора: сверяем состав
         и не плодим копии, если такой сценарий уже лежит под другим именем. */
      const same = (u.saved || []).find((x) => JSON.stringify(x.axes) === JSON.stringify(axes))
      if (same && same.name !== name) {
        if (inp) inp.value = ''
        return toast(`Такой сценарий уже сохранён — «${same.name}»`)
      }
      u.saved = [...(u.saved || []).filter((x) => x.name !== name), { name, axes, at: Date.now() }]
      storeSaved(u.saved)
      if (inp) inp.value = ''
      toast(`Сценарий «${name}» сохранён`)
      return bump()
    }
    const ap = at('[data-apply]')
    if (ap) {
      const found = (u.saved || []).find((x) => x.name === ap.dataset.apply)
      if (found) {
        pushHist()
        /* «Поверх текущего» не сбрасывает остальные оси — так наборы складываются */
        S.current = ap.hasAttribute('data-over')
          ? { ...S.current, ...found.axes }
          : { ...DEF, ...keepStyle(S.current), ...found.axes }
        modal.current = null; toast(`Сценарий «${found.name}»`)
      }
      return bump()
    }
    const dls = at('[data-delsave]')
    if (dls) {
      u.saved = (u.saved || []).filter((x) => x.name !== dls.dataset.delsave)
      storeSaved(u.saved)
      return bump()
    }
    if (at('[data-scimport]')) {
      const inp = document.getElementById('scimp') as HTMLInputElement | null
      const raw = (inp?.value || '').trim()
      const hash = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw
      if (!hash) return toast('Вставьте ссылку со сценарием')
      const p = new URLSearchParams(hash)
      const next = { ...DEF }
      let n = 0, bad = 0
      for (const k of Object.keys(DEF) as (keyof typeof DEF)[]) {
        const v = p.get(k)
        if (!v) continue
        if (okValue(k, v)) { next[k] = v; n++ } else bad++
      }
      if (!n) return toast(bad ? 'В ссылке нет знакомых значений' : 'В ссылке нет сценария')
      S.current = next; modal.current = null
      if (inp) inp.value = ''
      toast(bad ? `Сценарий применён, ${bad} незнакомых значений пропущено` : 'Сценарий из ссылки применён')
      return bump()
    }
    if (at('[data-copylink]')) { copy(location.href, 'Ссылка скопирована'); return }
    if (pop.current && !at('.pop-wrap')) { pop.current = null; bump() }
  }, [go, toast, snapshot])

  const patchUi = useCallback((p: Partial<Ui>) => {
    Object.assign(U.current, p)
    if ('scw' in p || 'scside' in p || 'sctab' in p || 'scgrp' in p) storePanel(U.current)
    bump()
  }, [])

  const snap = snapshot()
  applyState(snap)
  const value: Ctx = {
    ...snap,
    panel: panel.current,
    toasts: toasts.current,
    onClick, onInput, toast, go, patchUi,
    snapshot: snap,
  }

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
