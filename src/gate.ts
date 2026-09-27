/** Пароль на вход в прототип.
 *
 * Проверка идёт в браузере, поэтому это не защита, а щеколда: она закрывает
 * прототип от случайного посетителя, но не от того, кто откроет исходники.
 * В бандле лежит не сам пароль, а его SHA-256 — чтобы он хотя бы не читался
 * глазами в исходнике вкладки.
 *
 * Сменить пароль: `npm run gate` — скрипт спросит его в терминале
 * и перезапишет хэш ниже. Сам пароль никуда не записывается.
 */
export const GATE_HASH = '064fabced60fc9acd36626d3962e0ba6d01fa94c1d15179c113948b7eb0e5bff'

/** Ключ в localStorage: один раз ввёл — больше не спрашиваем на этом устройстве. */
const KEY = 'pm.gate'

export const unlocked = () => {
  try { return localStorage.getItem(KEY) === GATE_HASH } catch { return false }
}

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Проверяет пароль и, если верный, запоминает вход. */
export async function tryPassword(pass: string) {
  const h = await sha256(pass.trim())
  if (h !== GATE_HASH) return false
  try { localStorage.setItem(KEY, h) } catch { /* приватный режим */ }
  return true
}
