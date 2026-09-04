import { fileURLToPath } from 'node:url'
// Explicit live check: creates one isolated two-player room and finishes it.
// AI suggestions are mocked; room membership and four rounds use real Supabase.
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'
const origin = process.env.VERIFY_ORIGIN || 'http://localhost:8787'
const output = fileURLToPath(new URL('../output/ux-improvements/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] })
const errors = []
const makePlayer = async (width) => {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  await page.setViewport({ width, height: 900 })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', (request) => request.url().includes('/api/sparks') ? request.respond({ status: 200, contentType: 'application/json', body: '{"sparks":["Try a small community experiment","Invite a different perspective"]}' }) : request.continue())
  await page.goto(origin, { waitUntil: 'networkidle0' })
  return page
}
let host, guest, code
try {
  host = await makePlayer(1440)
  await host.click('.entry-mode-toggle button:last-child')
  await host.type('#idea', 'UX verification: a community book exchange.')
  await host.click('.entry-create-choice')
  await host.waitForSelector('#entry-display-name')
  await host.type('#entry-display-name', 'UX check — host')
  await host.click('.entry-name-step .ink-button')
  await host.waitForSelector('.coop-lobby')
  code = new URL(host.url()).searchParams.get('room')
  assert.ok(code)
  console.log('Isolated co-op test room created.')
  guest = await makePlayer(390)
  await guest.click('.entry-mode-toggle button:last-child')
  await guest.click('.coop-entry-choices button:last-child')
  await guest.type('#entry-room-code', code)
  await guest.click('.entry-join-choice button')
  await guest.waitForSelector('#entry-display-name')
  await guest.type('#entry-display-name', 'UX check — guest')
  await guest.click('.entry-name-step .ink-button')
  await guest.waitForSelector('#coop-idea')
  await guest.type('#coop-idea', 'UX verification: a neighbourhood repair afternoon.')
  await guest.click('.coop-idea-entry .ink-button')
  await guest.waitForSelector('.coop-lobby')
  await host.waitForFunction(() => document.querySelector('.coop-start-button') && !document.querySelector('.coop-start-button').disabled)
  await host.screenshot({ path: `${output}coop-lobby-desktop.png`, fullPage: true })
  await guest.screenshot({ path: `${output}coop-lobby-mobile.png`, fullPage: true })
  await host.click('.coop-route-trigger')
  await host.click('.coop-route-option:not(.is-surprise)')
  await host.waitForFunction(() => document.querySelector('.coop-route-copy strong')?.textContent === 'From assumption to evidence')
  for (let round = 1; round <= 4; round += 1) {
    await host.waitForSelector(round === 1 ? '.coop-start-button:not(:disabled)' : '.coop-between-actions .ink-button:not(:disabled)')
    await host.click(round === 1 ? '.coop-start-button' : '.coop-between-actions .ink-button')
    await Promise.all([host.waitForSelector('.response-editor'), guest.waitForSelector('.response-editor')])
    if (round === 1) {
      await host.screenshot({ path: `${output}coop-round-desktop.png`, fullPage: true })
      await guest.screenshot({ path: `${output}coop-round-mobile.png`, fullPage: true })
    }
    await Promise.all([host.type('.response-editor', `Host change for pass ${round}: invite a neighbour to try one small experiment.`), guest.type('.response-editor', `Guest change for pass ${round}: make a paper prototype and ask for feedback.`)])
    await Promise.all([host.click('.response-submit'), guest.click('.response-submit')])
    await Promise.all([host.waitForSelector('.coop-round-waiting, .coop-between, .coop-reveal'), guest.waitForSelector('.coop-round-waiting, .coop-between, .coop-reveal')])
    if (await host.$('.coop-inline-host-actions')) await host.click('.coop-inline-host-actions button:first-child')
    await Promise.all([host.waitForSelector(round < 4 ? '.coop-between' : '.coop-reveal'), guest.waitForSelector(round < 4 ? '.coop-between' : '.coop-reveal')])
    console.log(`Co-op pass ${round} completed by both participants.`)
  }
  for (const page of [host, guest]) {
    assert.equal(await page.$$eval('.coop-reveal-card:not(.is-empty)', (cards) => cards.length), 4)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  }
  await host.screenshot({ path: `${output}coop-reveal-desktop.png`, fullPage: true })
  await guest.screenshot({ path: `${output}coop-reveal-mobile.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log('Live co-op verified: separate host/join paths, two participants, shared route, four saved passes and both final reveals. Room finished; no invitations sent.')
} catch (error) {
  if (host) {
    await host.screenshot({ path: `${output}coop-failure.png`, fullPage: true })
    console.error('Host visible status:', await host.$eval('body', (element) => element.innerText.slice(-1400)))
    // Finish our own isolated test room when an End session control is available.
    const end = await host.$('.coop-inline-host-actions button:last-child, .coop-floating-host-actions button:last-child, .coop-between-actions button:last-child')
    if (end) await end.click()
  }
  throw error
} finally { await browser.close() }
