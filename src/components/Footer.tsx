import { DOCS } from '@/legacy/prototype'

const LEGAL: [string, string][] = [
  ['Оферта', DOCS.offer],
  ['Политика конфиденциальности', DOCS.privacy],
  ['Пользовательское соглашение', DOCS.agreement],
  ['Политика обработки персональных данных', DOCS.personal],
  ['Реквизиты', DOCS.requisites],
]

export function Footer() {
  return (
    <div className="foot">
      <span>© 2026 web-prototype-pool. Все права защищены</span>
      <span className="l">
        {LEGAL.map(([t, u]) => (
          <a href={u} target="_blank" rel="noopener" key={t}>{t}</a>
        ))}
      </span>
    </div>
  )
}
