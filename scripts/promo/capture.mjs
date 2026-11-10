// Захват состояний прототипа для промо-ролика README.
//
//   PLAYWRIGHT_HOME=/путь/к/папке/с/playwright node scripts/promo/capture.mjs ПАПКА
//
// Поднимает dev-сервер без щеколды (VITE_GATE_HASH пустой), открывает прототип
// в Chrome 1920×1080 с плотностью 2x и проходит сценарий настоящими кликами.
// Перед каждым кликом измеряет прямоугольник кнопки — кольцо в ролике ставится
// в её центр. Результат: ПАПКА/NN-имя.png и ПАПКА/steps.json.
//
// Логотип в сайдбаре скрыт: в ролике README не должно быть названия продукта.
// Скрипт падает, если название всё же встретилось в тексте страницы.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.resolve(process.argv[2] || '')
if (!process.argv[2]) throw new Error('Укажите папку для кадров')
mkdirSync(out, { recursive: true })

const home = process.env.PLAYWRIGHT_HOME
const require = createRequire(home ? path.join(path.resolve(home), 'noop.js') : import.meta.url)
const { chromium } = require('playwright')

const PORT = 5287
const URL = `http://localhost:${PORT}/`
const BRAND = /promm|prombox/i

// Сценарий: разделы через сайдбар, затем панель «Сценарии» поверх Главной.
// Последний шаг возвращает прототип в исходное состояние — петля бесшовная.
const sc = (p) => p.locator('aside.sc')
const STEPS = [
  { name: 'home' },
  { name: 'workers', click: (p) => p.locator('.sb [data-go="workers"]') },
  { name: 'fin-open', click: (p) => p.locator('.sb [data-grp="fin"]') },
  { name: 'income', click: (p) => p.locator('.sb [data-go="income"]') },
  { name: 'home-back', click: (p) => p.locator('.sb [data-go="home"]') },
  { name: 'fin-close', click: (p) => p.locator('.sb [data-grp="fin"]') },
  { name: 'panel', click: (p) => p.locator('button.sct') },
  { name: 'critical', click: (p) => sc(p).locator('[data-axis="health"][data-val="critical"]') },
  { name: 'empty', click: (p) => sc(p).locator('[data-axis="data"][data-val="empty"]') },
  { name: 'style', click: (p) => sc(p).getByRole('button', { name: 'Стиль', exact: true }) },
  { name: 'accent', click: (p) => sc(p).locator('[data-axis="accent"]').nth(5) },
  { name: 'radius', click: (p) => sc(p).locator('[data-axis="radius"]').last() },
  { name: 'reset-style', click: (p) => sc(p).getByRole('button', { name: 'Вернуть', exact: true }) },
  { name: 'reset', click: (p) => sc(p).locator('[data-reset]') },
  { name: 'closed', click: (p) => sc(p).getByRole('button', { name: 'Закрыть' }) },
]

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_GATE_HASH: '' }, stdio: ['ignore', 'pipe', 'inherit'],
})
await new Promise((ok, fail) => {
  vite.stdout.on('data', (d) => String(d).includes('Local') && ok())
  vite.on('exit', () => fail(new Error('Vite не запустился')))
})

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
    colorScheme: 'light', locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
  ctx.setDefaultTimeout(8000)
  await ctx.addInitScript(() => { localStorage.clear(); localStorage.setItem('pm.tour', '1') })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '.sb .logo{visibility:hidden!important} *{caret-color:transparent!important}' })
  await page.evaluate(() => document.fonts.ready)
  const steps = []
  for (const [i, s] of STEPS.entries()) {
    let target = null
    if (s.click) {
      const el = s.click(page)
      await el.scrollIntoViewIfNeeded()
      const b = await el.boundingBox()
      target = { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }
      await el.click()
    }
    // Курсора в ролике нет — уводим мышь, чтобы не было подсветки наведения.
    await page.mouse.move(700, 1079)
    await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
    await page.waitForTimeout(1400)
    // Проверяем только видимый в кадре текст: копирайт в футере за экраном.
    const text = await page.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const seen = []
      for (let n; (n = w.nextNode());) {
        const r = document.createRange(); r.selectNodeContents(n)
        if ([...r.getClientRects()].some((b) => b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth)) seen.push(n.data)
      }
      return seen.join(' ') + ' ' + document.title.replace(/.*/, '')
    })
    if (BRAND.test(text)) throw new Error(`Название продукта на шаге ${s.name}`)
    const file = `${String(i).padStart(2, '0')}-${s.name}.png`
    await page.screenshot({ path: path.join(out, file) })
    steps.push({ name: s.name, file, target })
    console.log(`Снят шаг ${s.name}`)
  }
  writeFileSync(path.join(out, 'steps.json'), JSON.stringify({ viewport: [1920, 1080], scale: 2, steps }, null, 2))
} finally {
  await browser.close()
  vite.kill()
}
