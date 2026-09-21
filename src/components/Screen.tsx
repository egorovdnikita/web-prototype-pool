import { V, card, loadFail, skeleton, type Model } from '@/legacy/prototype'
import { renderDraft } from '@/draft'
import { DRAFT_ROUTE, useApp } from '@/state/store'
import { Raw } from './Raw'

/** Мост до движка: экран, который ещё не переведён в TSX, приходит строкой. */
export function Screen({ m }: { m: Model }) {
  const { route, S, draft } = useApp()
  if (S.load === 'yes') return <Raw html={skeleton()} />
  if (S.load === 'err') return <Raw html={loadFail()} />
  /* Черновик рисует не движок: в V его нет и не должно быть — там лежат
     экраны, сверенные с макетами. */
  if (route === DRAFT_ROUTE) {
    return <Raw html={draft
      ? renderDraft(draft, m)
      : card('<div class="empty"><b>Черновика нет</b><p>Соберите его в чате панели: «новый раздел Бонусы»</p></div>')} />
  }
  const render = V[route]
  const html = render ? render(m) : card('<div class="empty"><b>Экран в работе</b></div>')
  return <Raw html={html} />
}
