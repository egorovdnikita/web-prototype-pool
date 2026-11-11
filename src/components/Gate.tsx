import { useEffect, useRef, useState } from 'react'
import { I, LOGO } from '@/legacy/prototype'
import { tryPassword } from '@/gate'
import { Ico, Raw } from './Raw'

/** Пароль на вход. Экран повторяет страницу входа прототипа:
    белый лист, колонка 358, поле 56 и кнопка xl. */
export function Gate({ onPass }: { onPass: () => void }) {
  const [err, setErr] = useState(false)
  const [eye, setEye] = useState(false)
  const [busy, setBusy] = useState(false)
  const inp = useRef<HTMLInputElement>(null)

  useEffect(() => { inp.current?.focus() }, [])

  const submit = async () => {
    const v = inp.current?.value || ''
    if (!v || busy) return
    setBusy(true)
    const ok = await tryPassword(v)
    setBusy(false)
    if (ok) onPass()
    else { setErr(true); inp.current?.select() }
  }

  return (
    <div className="auth">
      <div className="acol">
        <div className="logo gatelogo"><Raw html={LOGO.replace(' lbl', '')} className="slot" /></div>
        <h1 className="ah">Войти в прототип</h1>
        <p className="asub mut">Здесь живут сценарии и гипотезы</p>

        <div className={`afield ${err ? 'err' : ''}`}>
          <input
            ref={inp}
            type={eye ? 'text' : 'password'}
            placeholder="Пароль"
            autoComplete="current-password"
            onInput={() => err && setErr(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />
          <button
            className={`aeye ${eye ? 'on' : ''}`}
            type="button"
            aria-label={eye ? 'Скрыть пароль' : 'Показать пароль'}
            onClick={() => { setEye(!eye); inp.current?.focus() }}
          >
            <Ico html={I.eyeoff} /><span className="off"><Ico html={I.eye} /></span>
          </button>
        </div>
        {/* Ошибка слева, «Забыли пароль?» справа — в одну строку,
            чтобы поле и кнопка не расходились при ошибке */}
        <div className="gateforgot">
          {err && <span className="errmsg">Пароль неверный</span>}
          <a className="lnk bs" href="https://t.me/designer_of_tomorrow" target="_blank" rel="noopener">
            Забыли пароль?
          </a>
        </div>

        <button className="btn xl" onClick={submit} disabled={busy}>Войти</button>
      </div>
      <div className="afoot">© 2026 web-prototype-pool. Все права защищены</div>
    </div>
  )
}
