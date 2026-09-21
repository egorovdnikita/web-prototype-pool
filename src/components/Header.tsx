import { useEffect } from 'react'
import {
  I, notifCount, PROF, SUM_ROUTES, TITLES, acctSummary, nf, notifications, permsOf, profTabs, type Model,
} from '@/legacy/prototype'
import { DRAFT_ROUTE, useApp } from '@/state/store'
import { Ico, Raw } from './Raw'

/* Хедер по DS: белая панель, снизу radius-l 24, padding 20/8, ряд px16 gap16.
   Контролы h48, border 1px, radius-m 16, без тени. Заголовок H3 32/38 SemiBold. */
/* Вкладки профиля по макету — часть шапки, а не отдельный блок страницы. */
const PROFILE_ROUTES = [...PROF.map(([id]) => id), 'notifconfig']

export function Header({ m }: { m: Model }) {
  const { S, route, pop, draft } = useApp()
  const n = notifCount()
  const acct = S.acct === 'main' ? 'natarusso' : 'alfred'
  /* Наблюдателю баланс показываем, только если открыт раздел «Мои активы»,
     а переключатель аккаунта не кликабельный: суб-аккаунты ему недоступны
     (макеты 30:71549 и 39:111046 файла «Наблюдатель») */
  const obs = S.role === 'observer'
  const showBal = !obs || !!permsOf().assets
  /* На проде заголовок вкладки — «<Раздел> - Promminer» */
  useEffect(() => {
    const t = TITLES[route] || (route === DRAFT_ROUTE ? draft?.title : '')
    document.title = t ? `${t} - Promminer` : 'Promminer Pool'
  }, [route, draft])

  return (
    <header className="top">
      <div className="toprow">
        <h1 className="h3">{TITLES[route] || (route === DRAFT_ROUTE ? draft?.title || 'Черновик' : '')}</h1>
        <div className="hgroup">
          {showBal && (
            <button className="hbtn" data-go="assets">
              <Ico html={I.rub} />
              <span className="mono">{nf(m.pool)}</span>
            </button>
          )}

          <span className="pop-wrap">
            <button className="hbtn sq" data-pop="notif">
              <Ico className="i3" html={I.bell} />
              {!!n && <span className="bdg">{n > 99 ? '99+' : n}</span>}
            </button>
            {pop === 'notif' && <Raw html={notifications()} />}
          </span>

          <span className="pop-wrap">
            <button className={`hbtn ${pop === 'acct' ? 'open' : ''} ${obs ? 'flat' : ''}`}
              data-pop={obs ? undefined : 'acct'} disabled={obs}>
              {SUM_ROUTES.has(route) ? 'Сводка по аккаунтам (46)' : acct}
              {!obs && <Ico html={I.cd} />}
            </button>
            {pop === 'acct' && <Raw html={acctSummary(m)} />}
          </span>

          <span className="pop-wrap">
            <button className={`hbtn tight ${pop === 'user' ? 'open' : ''}`} data-pop="user">
              {/* Ось «Аватар»: с загруженным снимком в шапке стоит кружок
                  с инициалом, без него — обезличенный значок дизайн-системы */}
              {S.avatar === 'yes'
                ? <span className="avat sm">{acct[0].toUpperCase()}</span>
                : <Ico className="i3" html={I.user} />}
              <Ico html={I.cd} />
            </button>
            {pop === 'user' && (
              <div className="pop" style={{ minWidth: 280 }}>
                <div className="phead">
                  <span className={`avat ${S.avatar === 'yes' ? 'pic' : ''}`}>{acct[0].toUpperCase()}</span>
                  <span className="uname">
                    <b>{acct}<button className="lnk" style={{ color: 'var(--accent)' }} data-copy={acct}>
                      <Ico html={I.cp} /></button></b>
                    <i>Иванов Иван</i>
                  </span>
                </div>
                {PROF.map(([id, t, ic]) => (
                  <button data-go={id} key={id}><Ico className="i3" html={I[ic]} />{t}</button>
                ))}
                <div className="hr" />
                <button data-modal="settings"><Ico className="i3" html={I.gear} />Настройки</button>
                <div className="hr" />
                <button data-modal="logout"><Ico className="i3" html={I.out} />Выйти</button>
              </div>
            )}
          </span>
        </div>
      </div>
      {PROFILE_ROUTES.includes(route) && <Raw html={profTabs(route === 'notifconfig' ? 'notifsettings' : route, m)} />}
    </header>
  )
}
