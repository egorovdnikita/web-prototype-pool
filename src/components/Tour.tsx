import { useLayoutEffect, useRef, useState } from 'react'
import { TOUR } from '@/tour'
import { useApp } from '@/state/store'

/** Отступ подсветки от элемента, чтобы рамка не липла к нему вплотную */
const PAD = 6
const CARD = 320

/** Обучение по панели: подсвечиваем настоящий элемент и ставим рядом карточку.
    Шаг сам открывает панель и вкладку — это делает обработчик в store. */
export function Tour() {
  const { U } = useApp()
  const n = U.tour ?? null
  const step = n == null ? null : TOUR[n]
  const [box, setBox] = useState<DOMRect | null>(null)
  const card = useRef<HTMLDivElement>(null)

  /* Меряем до отрисовки, иначе подсветка успевает мигнуть на прежнем месте.
     Элемент мог ещё не появиться (вкладка переключается тем же кликом), а
     панель выезжает за .22s — поэтому меряем ещё дважды. Если не нашли,
     оставляем прежнюю рамку: пустая подсветка выглядела бы поломкой. */
  useLayoutEffect(() => {
    if (!step) { setBox(null); return }
    let alive = true
    const find = () => {
      if (!alive) return
      const el = document.querySelector(step.sel) as HTMLElement | null
      if (el) setBox(el.getBoundingClientRect())
    }
    find()
    const t1 = setTimeout(find, 60)
    const t2 = setTimeout(find, 280)
    addEventListener('resize', find)
    addEventListener('scroll', find, true)
    return () => {
      alive = false
      clearTimeout(t1); clearTimeout(t2)
      removeEventListener('resize', find)
      removeEventListener('scroll', find, true)
    }
  }, [n, step])

  /* Высота карточки зависит от длины текста, поэтому место считаем грубо,
     а потом подвигаем по факту — иначе последний шаг уезжал за нижний край. */
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = Math.min(0, innerWidth - 16 - r.right) + Math.max(0, 16 - r.left)
    const dy = Math.min(0, innerHeight - 16 - r.bottom) + Math.max(0, 16 - r.top)
    if (dx) el.style.left = `${r.left + dx}px`
    if (dy) el.style.top = `${r.top + dy}px`
  })

  if (n == null || !step) return null

  const ring = box && {
    left: box.left - PAD, top: box.top - PAD,
    width: box.width + PAD * 2, height: box.height + PAD * 2,
  }
  /* Карточка встаёт с указанной стороны и не вылезает за экран.
     Элемент мог не найтись (вкладка ещё не отрисовалась) — тогда середина. */
  /* Размеры окна берём осторожно: этот же компонент рендерит в строку
     scripts/panel.mjs, а там окна нет вовсе. */
  const vw = typeof window === 'undefined' ? 1440 : innerWidth
  const vh = typeof window === 'undefined' ? 900 : innerHeight
  const place: { left: number; top: number } = (() => {
    if (!box) return { left: (vw - CARD) / 2, top: vh / 2 - 90 }
    const gap = 16
    const left = step.place === 'right' ? box.right + gap
      : step.place === 'left' ? box.left - CARD - gap
        : box.left + box.width / 2 - CARD / 2
    const top = step.place === 'top' ? box.top - 190
      : step.place === 'bottom' ? box.bottom + gap
        : box.top
    return {
      left: Math.max(16, Math.min(left, vw - CARD - 16)),
      top: Math.max(16, Math.min(top, vh - 200)),
    }
  })()

  return (
    <>
      <div className={`tourring ${box ? '' : 'none'}`} style={ring || undefined} />
      <div ref={card} className="tourcard" style={place} role="dialog" aria-label="Обучение по панели сценариев">
        <b>{step.title}</b>
        <p>{step.text}</p>
        <div className="tourf">
          <span className="tourn">{n + 1} из {TOUR.length}</span>
          <button className="tourskip" data-tourend>Пропустить</button>
          {n > 0 && <button className="tourback" data-tourgo={n - 1}>Назад</button>}
          <button className="tournext" data-tourgo={n + 1}>
            {n === TOUR.length - 1 ? 'Готово' : 'Дальше'}
          </button>
        </div>
      </div>
    </>
  )
}
