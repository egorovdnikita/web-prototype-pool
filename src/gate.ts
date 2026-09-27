/** Пароль на вход в прототип.
 *
 * Проверка идёт в браузере, поэтому это не защита, а щеколда: она закрывает
 * прототип от случайного посетителя, но не от того, кто откроет собранную
 * страницу. Настоящая дверь — Cloudflare Access перед раздачей (README).
 *
 * Хэша пароля в репозитории нет: он подставляется при сборке из
 * `VITE_GATE_HASH` (файл `.env.local`, он в .gitignore). Так открытый
 * репозиторий не раздаёт даже хэш. В собранном бандле хэш всё равно
 * окажется — иначе браузеру нечем проверять; это цена щеколды.
 *
 * Сменить пароль: `npm run gate` — спросит его в терминале и перезапишет
 * `.env.local`. Сам пароль никуда не записывается.
 *
 * Переменной нет — щеколды нет, прототип открывается сразу. Так сборка
 * из чистого клона не запирается наглухо неизвестным паролем.
 */
export const GATE_HASH = (import.meta.env.VITE_GATE_HASH as string | undefined) || ''

/** Ключ в localStorage: один раз ввёл — больше не спрашиваем на этом устройстве. */
const KEY = 'pm.gate'

export const unlocked = () => {
  if (!GATE_HASH) return true
  try { return localStorage.getItem(KEY) === GATE_HASH } catch { return false }
}

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Проверяет пароль и, если верный, запоминает вход. */
export async function tryPassword(pass: string) {
  if (!GATE_HASH) return true
  const h = await sha256(pass.trim())
  if (h !== GATE_HASH) return false
  try { localStorage.setItem(KEY, h) } catch { /* приватный режим */ }
  return true
}
