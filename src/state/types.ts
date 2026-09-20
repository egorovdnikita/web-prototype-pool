/** Оси сценария — то, что попадает в ссылку. Список совпадает с DEF
    в `legacy/prototype.js`: новая ось заводится там и дублируется сюда. */
export interface Scenario {
  coin: string
  data: string
  health: string
  wf: string
  prec: string
  fiat: string
  numfmt: string
  tzview: string
  trend: string
  noise: string
  gap: string
  rej: string
  period: string
  rate: string
  ratesrc: string
  wn: string
  wnote: string
  ser: string
  upl: string
  wgeo: string
  wvend: string
  wup: string
  wshare: string
  wlink: string
  wfilt: string
  wpage: string
  wsort: string
  wname: string
  wtagn: string
  awal: string
  apay: string
  athr: string
  asell: string
  astep: string
  aconf: string
  aerr: string
  acoins: string
  afee: string
  payn: string
  payst: string
  paytype: string
  paydoc: string
  incn: string
  incper: string
  rdata: string
  repn: string
  repst: string
  repw: string
  repacc: string
  repdl: string
  tier: string
  refn: string
  refact: string
  refpn: string
  refrub: string
  refhash: string
  refban: string
  reflink: string
  calchw: string
  taxface: string
  taxres: string
  role: string
  perm: string
  ocoins: string
  acct: string
  name: string
  fa: string
  fam: string
  sess: string
  del: string
  pwdage: string
  sesgeo: string
  subs: string
  obs: string
  notif: string
  notift: string
  avatar: string
  sublim: string
  obsexp: string
  phone: string
  mail: string
  tg: string
  cerr: string
  verif: string
  vdoc: string
  vacc: string
  verr: string
  vform: string
  vstat: string
  oerr: string
  saerr: string
  achan: string
  lerr: string
  rerr: string
  pwv: string
  a2fa: string
  otperr: string
  theme: string
  dens: string
  fsz: string
  side: string
  motion: string
  grid: string
  outline: string
  toast: string
  /* Оформление: шрифт, акцент, скругления, отступы и набор иконок */
  font: string
  accent: string
  radius: string
  space: string
  icons: string
  load: string
  neterr: string
}

/** Эфемерное состояние интерфейса — в ссылку не попадает. */
export interface Ui {
  seg: Record<string, number>
  sort: Record<string, { k: string; d: number } | null>
  /** Индекс уведомления, открытого в модалке. */
  note?: number
  /** Выписка приложена в модалке «Добавить выписку». */
  vfile?: boolean
  /** Выбранный банк в модалке «Добавить счет». */
  vbank?: string
  /** Показывать в панели только изменённые оси. */
  scdirty?: boolean
  /** Свёрнутые группы осей в панели. */
  scgrp?: string[]
  /** Свои сохранённые сценарии (живут в localStorage). */
  saved?: { name: string; axes: Record<string, string>; at?: number }[]
  /** Фильтр в панели сценариев. */
  scq?: string
  /** Вкладка панели: оси, наборы или переходы. */
  sctab?: 'ax' | 'sty' | 'sets' | 'go'
  /** Шаг обучения по панели; null или undefined — обучение не идёт. */
  tour?: number | null
  /** Закреплённые оси — всплывают наверх списка (живут в localStorage). */
  scpin?: string[]
  /** Показывать только закреплённые оси. */
  sconly?: boolean
  /** Показывать только оси, у которых есть кадр в макетах. */
  scfig?: boolean
  /** История сценариев для кнопки «Отменить». */
  schist?: Scenario[]
  /** Ширина панели: 380 / 520 / 720. */
  scw?: number
  /** Сторона, к которой пришвартована панель. */
  scside?: 'right' | 'left'
  page: Record<string, number>
  /** Выбранный размер страницы в пагинации. */
  per: Record<string, number>
  sel: Set<number>
  /** Выбранные строки наблюдателей. */
  osel: Set<number>
  /** Отмеченные пункты в форме наблюдателя, ключ «группа:индекс». */
  ochk: Set<string>
  /** Скрытые промо-баннеры сводки. */
  phide: Set<number>
  /** Отличия от умолчания в таблице каналов уведомлений. */
  nch: Record<string, boolean>
  /** Форму наблюдателя уже пытались отправить — показываем ошибки. */
  oval: boolean
  /** Строка наблюдателя, с которой открыли меню или QR. */
  obs?: number
  /** Устройство, чью сессию завершают. */
  sess?: string
  q: string
  /** Выбранная вкладка статуса воркеров; null — берём из оси «Фильтр по умолчанию». */
  wfilter: string | null
  geo: string
  wk: any
  wtag: Set<number>
  wgrp: Set<number>
  /** Черновик шторки фильтров: выбранные теги и производители. */
  ftag: Set<string>
  fmod: Set<string>
  /** Поиск по моделям внутри шторки. */
  fq: string
  /** Применённая выборка: null, пока фильтры не нажимали. */
  fapp: { t: string[]; m: string[] } | null
  /** «Создать тег» открыли из шторки — вернуться в неё после. */
  fback: boolean
  /** Что выгружаем: 'hours' — часы работы, 'stat' — статистика воркеров. */
  exk: string
  /** Свои группы и теги: null — ещё не собраны из сценария. */
  grp: { n: string; c?: string }[] | null
  tg: { n: string; d?: string; c?: string }[] | null
  /** Выбор в списке групп и тегов — под массовое удаление. */
  gsel: Set<number>
  tsel: Set<number>
  /** Правим запись с этим индексом, иначе создаём новую. */
  ted: number | null
  tname: string
  tdesc: string
  tcol: string
  /** Снимок привязки на открытии — чтобы поймать «выбор не изменился». */
  tbase: string
  /** Поиск внутри выпадающего списка селекта. */
  selq: string
  /** Правки привязок по id воркера — переживают перерисовку списка. */
  wov: Record<number, { grp?: number[]; tags?: string[] }> | null
  qfocus: boolean
  auth: string
  consent: Set<number>
  /** Показывать ли архивные суб-аккаунты. */
  arch: boolean
  /** Имя аккаунта, открытого в карточке. */
  sub: string
  step: number
  /** монета, на которой открыта модалка активов */
  coin2: string
  /** выбранный порог автовыплат в модалке */
  thr: string | null
  /** отмеченные аккаунты в модалке генерации отчёта */
  rsel: Set<string> | null
  /** «включить удалённые воркеры» в той же модалке */
  rdel: boolean
  /** уведомление в карточке отчёта закрыто */
  rnote: boolean
  /** раскрытый уровень в модалке «Уровни комиссии» */
  lvl: number | null
  /** выбранные даты календарей по ключу попоувера */
  dsel: Record<string, { mi: number; yr: number; a: number; b: number }>
  /** смещение месяца в открытом календаре */
  dpm: number
  /** масштаб графика: 0 — весь период, 3 — самый близкий */
  zoom: number
  /** предупреждение о рублёвых выплатах закрыто */
  rwarn: boolean
  /** Закрыто ли уведомление о продаже цифровой валюты в «Моих активах». */
  awarn: boolean
  /** состояния переключателей в таблицах */
  togs: Record<string, boolean>
  /** чип «Активные» в списке рефералов */
  ronly: boolean
  /** «Только активных» в экспорте списка рефералов */
  exact: boolean
}

export interface AppSnapshot {
  S: Scenario
  U: Ui
  route: string
  pop: string | null
  modal: string | null
  openGroups: Record<string, boolean>
  mini: boolean
}
