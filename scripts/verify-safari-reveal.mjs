import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

export async function verifySafariReveal(page, sample, { origin, output }) {
  const checks = [], runId = `reveal-verification-${Date.now()}`
  const first = sample.cards.filter(card => card.lens === 'People').slice(0, 3)
  const second = [...first, ...sample.cards.filter(card => card.lens === 'Patterns').slice(0, 3)]
  const front = first.find(card => card.id === 'people_1') || first[0]
  const shell = id => `[data-evidence-id="${id}"]`
  const snapshot = (id, cards, status = 'researching') => ({ ...sample, id, cards, status,
    sources: sample.sources.filter(source => cards.some(card => card.sourceId === source.id)),
  })
  const installStream = () => page.evaluate(() => {
    const original = window.fetch
    window.__revealAborted = false
    window.__restoreRevealFetch = () => { window.fetch = original }
    window.fetch = (url, options) => {
      if (url !== '/api/safari/run') return original(url, options)
      const stream = new ReadableStream({ start(controller) {
        window.__revealPush = event => { if (!options.signal.aborted) controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n')) }
        window.__revealEnd = () => controller.close()
        options.signal.addEventListener('abort', () => { window.__revealAborted = true; controller.error(new DOMException('Aborted', 'AbortError')) }, { once: true })
      } })
      return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } }))
    }
  })
  const push = event => page.evaluate(event => window.__revealPush(event), event)
  const start = async () => {
    await page.goto(`${origin}/safari/`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('#sf-challenge')
    await installStream()
    await page.type('#sf-challenge', sample.challenge)
    await page.locator('.sf-challenge-form .sf-primary').click()
    await page.waitForSelector('.sf-research-wait')
  }
  const currentGuide = () => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('evidence-safari.field-guides.v1'))
    return data.safaris.find(safari => safari.id === data.currentId)
  })
  const cardTransform = id => page.$eval(shell(id), el => el.closest('.tl-shape').style.transform)
  const settleMotion = () => page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
    let stable = 0, last = ''
    while (stable < 5) {
      await new Promise(requestAnimationFrame)
      const camera = JSON.stringify(window.tlsync?.store.allRecords().find(r => r.typeName === 'camera'))
      stable = camera === last ? stable + 1 : 0; last = camera
    }
  })
  const shot = async name => { await settleMotion(); await page.screenshot({ path: path.join(output, `${name}.png`) }) }
  await page.setViewport({ width: 1440, height: 1000 })
  await start()
  await push({ type: 'evidence', safari: snapshot(runId, []) })
  await push({ type: 'progress', stage: 'searching', lens: 'People', lensState: 'working' })
  await page.waitForSelector('[data-trail="People"]')
  assert.equal(await page.$$eval('[data-trail]', els => els.length), 6)
  assert.equal(await page.$$eval('[data-evidence-id]', els => els.length), 0)
  await shot('reveal-empty-desktop')

  await push({ type: 'evidence', safari: snapshot(runId, first) })
  await page.waitForSelector(shell(front.id))
  await page.waitForFunction(() => !document.querySelector('[data-trail="People"]'))
  assert.equal((await currentGuide()).cards.length, first.length)
  await page.locator(`${shell(front.id)} .esc-flip-button`).click()
  await page.waitForSelector(`${shell(front.id)}[data-card-face="back"]`)
  await push({ type: 'evidence', safari: snapshot(runId, second) })
  await push({ type: 'progress', stage: 'checking', lens: 'Systems', lensState: 'working' })
  assert.ok(await page.$(`${shell(front.id)}[data-card-face="back"]`), 'Arrivals must not close the card being read')
  await page.keyboard.press('Escape')
  await page.waitForSelector(`${shell(front.id)}[data-card-face="front"]`)
  await page.waitForFunction(() => document.querySelectorAll('[data-evidence-id]').length >= 6)
  await shot('reveal-first-desktop')

  const title = await page.$(`${shell(front.id)} .esc-card-front h2`)
  const box = await title.boundingBox()
  const before = await cardTransform(front.id)
  await page.mouse.move(box.x + 25, box.y + 15)
  await page.mouse.down()
  await page.mouse.move(box.x + 155, box.y + 170, { steps: 16 })
  await page.mouse.up()
  const moved = await cardTransform(front.id)
  assert.notEqual(moved, before, 'A revealed card is draggable before research completes')
  await page.keyboard.press('Escape')

  await page.keyboard.press('n')
  await page.mouse.click(1290, 785)
  await page.waitForSelector('[contenteditable="true"]', { visible: true })
  await page.focus('[contenteditable="true"]')
  await page.keyboard.type('Keep this connection while other cards arrive.')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  assert.ok((await page.$eval('body', el => el.innerText)).includes('Keep this connection'))

  const patternFront = second.find(card => card.lens === 'Patterns')
  await page.locator(`${shell(patternFront.id)} .esc-card-front h2`).click()
  await page.keyboard.press('Backspace')
  await page.waitForFunction(id => !document.querySelector(`[data-evidence-id="${id}"]`), {}, patternFront.id)
  assert.ok(await page.evaluate(id => !window.tlsync.store.get(`shape:evidence-${id}`), patternFront.id))
  await push({ type: 'evidence', safari: snapshot(runId, sample.cards) })
  await push({ type: 'progress', stage: 'curating' })
  await page.waitForFunction(count => document.querySelector('.esc-progress-copy').textContent.includes(String(count)), {}, sample.cards.length)
  assert.equal(await cardTransform(front.id), moved, 'Later cards do not move earlier work')
  assert.equal(await page.$(shell(patternFront.id)), null, 'A deleted card must not be reintroduced')
  assert.ok((await page.$eval('body', el => el.innerText)).includes('Keep this connection'))
  assert.equal(new Set(await page.$$eval('[data-evidence-id]', els => els.map(el => el.dataset.evidenceId))).size, sample.cards.length - 1)
  await push({ type: 'result', safari: snapshot(runId, sample.cards, 'complete') })
  await push({ type: 'done', safariId: runId, cost: { estimatedUsd: 0 }, timing: { totalMs: 1000, firstEvidenceMs: 300, stages: [] } })
  await page.evaluate(() => window.__revealEnd())
  await page.waitForSelector('[data-research-busy="false"]')
  assert.equal(await cardTransform(front.id), moved)
  await shot('reveal-complete-desktop')
  // tldraw batches IndexedDB writes; wait for the actual saved document, not an arbitrary delay.
  await page.waitForFunction(async ({ id, count }) => {
    const data = await window.tlsync.db.load()
    return data.records.find(r => r.typeName === 'page')?.meta.safariImportedIds?.length === count && !data.records.some(r => r.id === `shape:evidence-${id}`)
  }, { timeout: 10000 }, { id: patternFront.id, count: sample.cards.length })
  checks.push('Six empty trails become checked evidence before completion; cards can be read, dragged, annotated and deleted without late arrivals resetting the canvas')

  await page.goto(`${origin}/safari/`, { waitUntil: 'networkidle0' })
  await page.locator('.sf-recent > summary').click()
  await page.locator('.sf-recent button').click()
  await page.waitForSelector(shell(front.id))
  assert.equal(await cardTransform(front.id), moved)
  assert.equal(await page.$(shell(patternFront.id)), null)
  assert.ok((await page.$eval('body', el => el.innerText)).includes('Keep this connection'))
  checks.push('Reopening a recent safari returns to its canvas and preserves positions, personal notes and deletions')

  await start()
  await push({ type: 'result', safari: { ...snapshot(`${runId}-cached`, sample.cards, 'complete'), cacheHit: true } })
  await push({ type: 'done', safariId: `${runId}-cached`, cost: { estimatedUsd: 0 } })
  await page.evaluate(() => window.__revealEnd())
  await page.waitForSelector('[data-research-busy="false"]')
  assert.equal((await currentGuide()).cards.length, sample.cards.length)
  assert.ok(await page.$(shell(front.id)))

  await start()
  await push({ type: 'evidence', safari: snapshot(`${runId}-cancel`, []) })
  await page.waitForSelector('.esc-stop')
  await page.locator('.esc-stop').click()
  await page.waitForSelector('#sf-challenge')
  assert.ok(await page.evaluate(() => window.__revealAborted))
  assert.ok(await page.evaluate(id => !JSON.parse(localStorage.getItem('evidence-safari.field-guides.v1')).safaris.some(safari => safari.id === id), `${runId}-cancel`))

  await start()
  await push({ type: 'evidence', safari: snapshot(`${runId}-failed`, []) })
  await push({ type: 'error', message: 'Search temporarily unavailable. Please try again.' })
  await page.evaluate(() => window.__revealEnd())
  await page.waitForSelector('.sf-error')
  assert.equal(await page.$eval('#sf-challenge', el => el.value), sample.challenge)
  assert.ok(await page.evaluate(id => !JSON.parse(localStorage.getItem('evidence-safari.field-guides.v1')).safaris.some(safari => safari.id === id), `${runId}-failed`))
  checks.push('Cached results open immediately; cancellation and early errors discard empty safaris and retain the question')

  await start()
  await push({ type: 'evidence', safari: snapshot(`${runId}-stop`, first) })
  await page.waitForSelector('.esc-stop')
  await page.locator('.esc-stop').click()
  await page.waitForFunction(() => window.__revealAborted)
  assert.equal((await currentGuide()).status, 'partial')
  assert.equal((await currentGuide()).cards.length, first.length)
  assert.ok(await page.$(shell(front.id)))
  checks.push('Stop here aborts the request and preserves already checked evidence')

  await start()
  await push({ type: 'evidence', safari: snapshot(`${runId}-disconnect`, first) })
  await page.waitForSelector(shell(front.id))
  await page.evaluate(() => window.__revealEnd())
  await page.waitForFunction(() => document.querySelector('.esc-progress-copy').textContent.includes('stopped early'))
  assert.equal((await currentGuide()).status, 'partial')
  assert.ok(await page.$(shell(front.id)))
  checks.push('A disconnected stream leaves its checked findings usable and saved')

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 })
    await start()
    await push({ type: 'evidence', safari: snapshot(`${runId}-mobile-${width}`, []) })
    await page.waitForSelector('[data-trail="People"]')
    await push({ type: 'evidence', safari: snapshot(`${runId}-mobile-${width}`, first) })
    await page.waitForSelector(shell(front.id))
    await push({ type: 'progress', stage: 'writing', lens: 'Patterns', lensState: 'working' })
    assert.ok(await page.$eval('.esc-progress', el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.bottom < innerHeight / 2 }))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await shot(`reveal-mobile-${width}`)
    await page.locator('.esc-latest').click()
    await settleMotion()
    await page.locator(`${shell(first.at(-1).id)} .esc-flip-button`).click()
    await page.waitForSelector(`${shell(first.at(-1).id)}[data-card-face="back"]`)
    await page.keyboard.press('Escape')
    await page.locator('.esc-stop').click()
  }
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  assert.equal(await page.$eval('.esc-card-rotor', el => getComputedStyle(el).animationName), 'none')
  await page.emulateMediaFeatures([])
  checks.push('Mobile layouts at 320/390px, reading during generation and reduced motion')
  return checks
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.env.SAFARI_TEST_ORIGIN || 'http://localhost:8790'
  const output = path.resolve('output/safari-reveal')
  await fs.mkdir(output, { recursive: true })
  const sample = JSON.parse(await fs.readFile(new URL('../public/safari/example/workshop.json', import.meta.url)))
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  const page = await browser.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  // The harness must never fall through to a paid research request.
  await page.setRequestInterception(true)
  page.on('request', request => request.url().endsWith('/api/safari/run') ? request.abort('blockedbyclient') : request.continue())
  try {
    const checks = await verifySafariReveal(page, sample, { origin, output })
    assert.deepEqual(errors, [])
    const result = { passed: true, checks, errors, providerCalls: 0, checkedAt: new Date().toISOString() }
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
    console.error(JSON.stringify({ message: error.message, errors, screenshot: path.join(output, 'failure.png') }))
    throw error
  } finally { await browser.close() }
}
