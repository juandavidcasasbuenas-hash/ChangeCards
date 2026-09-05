import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const origin = process.env.VERIFY_ORIGIN || 'http://localhost:8787'
const output = fileURLToPath(new URL('../output/mobile-workshop/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.setRequestInterception(true)
page.on('request', (request) => request.url().includes('/api/sparks')
  ? request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ sparks: ['A tasting flight of three vegetables', 'Recipes shared by neighbours'] }) })
  : request.continue())
const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))
const session = {
  stage: 'play', idea: 'A market stall that makes unfamiliar vegetables irresistible.',
  dealtCardIds: [40, 34, 14, 6, 13, 7, 9, 19, 20, 22, 8, 5, 2],
  swarm: { 14: { visited: true, note: 'A tasting flight of three vegetables.' } },
  drafts: { 7: 'Keep this unfinished thought.' }, cardPositions: {},
}
const seed = async (next = session) => {
  await page.evaluate((value) => localStorage.setItem('change-cards-session-v1', JSON.stringify(value)), next)
  await page.reload({ waitUntil: 'networkidle0' })
  await settle(900)
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
}
const readSession = () => page.evaluate(() => JSON.parse(localStorage.getItem('change-cards-session-v1')))
const dockState = () => page.evaluate(() => {
  const rect = (selector) => document.querySelector(selector).getBoundingClientRect()
  const dock = rect('.side-deck'), note = rect('.mobile-idea-summary'), header = rect('.topbar')
  return {
    width: innerWidth, headerHeight: header.height, noteBottom: note.bottom, dockHeight: dock.height,
    dockContained: dock.left >= 0 && dock.right <= innerWidth && dock.bottom <= innerHeight && dock.top >= innerHeight - 90,
    noteVisible: note.top >= header.bottom - 1 && note.bottom < innerHeight / 2,
    buttonReachable: ['.draw-card-button', '.routes-button', '.table-actions-toggle'].every((selector) => {
      const element = document.querySelector(selector), r = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
    }),
    savedOnOneLine: getComputedStyle(document.querySelector('.scrapbook-nav-button')).display === 'inline-flex',
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }
})
try {
  await page.goto(origin, { waitUntil: 'networkidle0' })
  for (const [width, height] of [[320, 568], [390, 844], [559, 775], [720, 900]]) {
    await page.setViewport({ width, height })
    await seed()
    const before = await dockState()
    assert.ok(before.headerHeight <= 52 && before.dockHeight <= 62 && before.dockContained && before.noteVisible && before.buttonReachable && before.savedOnOneLine && !before.overflow, JSON.stringify(before))
    assert.equal(await page.$eval('.table-actions-popover', (element) => getComputedStyle(element).display), 'none')
    assert.equal(await page.$eval('.mobile-idea-summary', (element) => element.innerText), session.idea)
    await page.screenshot({ path: `${output}workshop-${width}.png` })
    await page.evaluate(() => scrollTo(0, 1000)); await settle()
    const after = await dockState()
    assert.ok(after.buttonReachable && after.noteVisible && after.dockContained && !after.overflow, JSON.stringify(after))
    console.log({ ...after, phase: 'scrolled' })
  }
  await page.setViewport({ width: 390, height: 844 }); await seed()
  await page.evaluate(() => scrollTo(0, 700)); await settle()
  await page.click('.table-actions-toggle')
  assert.equal(await page.$eval('.table-actions-toggle', (element) => element.getAttribute('aria-expanded')), 'true')
  assert.equal(await page.$eval('.table-actions-popover', (element) => element.getBoundingClientRect().bottom < document.querySelector('.side-deck').getBoundingClientRect().top), true)
  await page.screenshot({ path: `${output}more-actions.png` })
  await page.keyboard.press('Escape')
  assert.equal(await page.$eval('.table-actions-toggle', (element) => element === document.activeElement && element.getAttribute('aria-expanded') === 'false'), true)
  await page.click('.table-actions-toggle'); await page.click('.mobile-idea-summary')
  assert.equal(await page.$eval('.table-actions-toggle', (element) => element.getAttribute('aria-expanded')), 'false')
  await page.click('.draw-card-button'); await page.waitForSelector('.deal-flight-card')
  const flight = await page.$eval('.deal-flight-card', (element) => ({ top: parseFloat(element.style.top), left: parseFloat(element.style.left) }))
  assert.ok(flight.top > 400 && flight.left > -100, `Flight did not start at the dock: ${JSON.stringify(flight)}`)
  await page.waitForFunction((count) => JSON.parse(localStorage.getItem('change-cards-session-v1')).dealtCardIds.length === count + 1, {}, session.dealtCardIds.length)
  await settle(1400)
  await page.click('.routes-button'); await page.waitForSelector('.route-chooser')
  await page.click('.route-slip'); await page.waitForSelector('.has-active-route'); await settle(1600)
  await page.screenshot({ path: `${output}route-mobile.png` })
  await page.click('.route-ribbon > button'); await settle(1000)
  await page.click('.table-actions-toggle'); await page.click('.clear-unused-button'); await settle()
  assert.deepEqual((await readSession()).dealtCardIds.slice().sort((a, b) => a - b), [7, 14])
  assert.equal((await readSession()).drafts[7], session.drafts[7])
  assert.equal(await page.$eval('.table-actions-toggle', (element) => element.getAttribute('aria-expanded')), 'false')
  await page.click('.table-actions-toggle'); await page.click('.deal-all-button'); await settle()
  assert.equal((await readSession()).dealtCardIds.length, 40)
  await page.$eval('.tabletop-canvas > .table-card-shell:last-of-type', (element) => element.scrollIntoView({ block: 'end', behavior: 'instant' })); await settle()
  assert.equal(await page.$eval('.tabletop-canvas > .table-card-shell:last-of-type', (element) => element.getBoundingClientRect().bottom < document.querySelector('.side-deck').getBoundingClientRect().top), true)
  await page.click('.table-actions-toggle'); await page.setViewport({ width: 1440, height: 900 }); await settle()
  assert.equal(await page.$eval('.table-actions-toggle', (element) => getComputedStyle(element).display), 'none')
  assert.equal(await page.$eval('.deal-all-button', (element) => element.getClientRects().length > 0), true)
  await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${output}desktop.png` })
  assert.deepEqual(errors, [])
  console.log('Mobile dock verified: compact header, visible post-it, pinned controls, More dismissal, drawing, routes, preserved drafts, all 40 cards, desktop resize. No page errors.')
} catch (error) {
  await page.screenshot({ path: `${output}failure.png` }); console.error(errors); throw error
} finally { await browser.close() }
