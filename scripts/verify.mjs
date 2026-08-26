import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 })

const consoleErrors = []
let transformRequestCount = 0
let sparkRequestCount = 0
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))
page.on('request', (request) => {
  if (request.url().includes('/api/transform')) transformRequestCount += 1
  if (request.url().includes('/api/sparks')) sparkRequestCount += 1
})

await page.goto('http://localhost:8787', { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  localStorage.removeItem('change-cards-session-v1')
  sessionStorage.removeItem('change-cards-cache-v1')
})
await page.reload({ waitUntil: 'networkidle0' })

const initialText = await page.$eval('body', (element) => element.innerText)
if (!initialText.includes('Push an idea') || !initialText.includes('What are you working on?')) {
  throw new Error('Entry screen did not render expected content')
}
await page.screenshot({ path: 'verification-entry.png', fullPage: true })

await page.type('#idea', 'A neighbourhood library that helps isolated older residents make new friends.')
await page.click('.idea-form .ink-button')
await page.waitForSelector('.mode-choice')
await new Promise((resolve) => setTimeout(resolve, 800))
await page.screenshot({ path: 'verification-modes.png', fullPage: true })

await page.click('.evolve-choice')
await page.waitForSelector('.card-grid .change-card')
await new Promise((resolve) => setTimeout(resolve, 900))
const cardCount = await page.$$eval('.card-grid .change-card', (cards) => cards.length)
if (cardCount !== 16) throw new Error(`Expected 16 cards, found ${cardCount}`)
const iconCount = await page.$$eval('.card-grid .card-icon', (icons) => new Set(icons.map((icon) => icon.dataset.icon)).size)
if (iconCount !== 16) throw new Error(`Expected 16 unique card icons, found ${iconCount}`)
const deckOverlap = await page.$$eval('.card-grid .change-card', (cards) => {
  const rects = cards.map((card) => card.getBoundingClientRect())
  return rects.some((a, index) => rects.slice(index + 1).some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2))
})
if (deckOverlap) throw new Error('Evolve deck cards overlap before interaction')
await page.screenshot({ path: 'verification-evolve.png', fullPage: true })

const evolveHoverTarget = await page.$('.card-grid .change-card:nth-child(5)')
const evolveBefore = await evolveHoverTarget.boundingBox()
await evolveHoverTarget.hover()
await new Promise((resolve) => setTimeout(resolve, 300))
const evolveAfter = await evolveHoverTarget.boundingBox()
if (evolveAfter.width * evolveAfter.height < evolveBefore.width * evolveBefore.height * 1.015 || Math.abs((evolveAfter.x + evolveAfter.width / 2) - (evolveBefore.x + evolveBefore.width / 2)) > 3) {
  throw new Error(`Evolve hover is not enlarging predictably in place: ${JSON.stringify({ evolveBefore, evolveAfter })}`)
}
await page.screenshot({ path: 'verification-hover.png', fullPage: false })
await page.click('.card-grid .change-card:nth-child(5) .card-front')
await page.waitForSelector('.response-editor')
await page.waitForFunction(
  () => document.querySelector('.spark-single-stage') || document.querySelector('.spark-retry'),
  { timeout: 120000 },
)
const sparkError = await page.$eval('.spark-retry', (element) => element.textContent).catch(() => null)
if (sparkError) throw new Error(`Subject-specific sparks failed to load: ${sparkError}`)
const sparkDeck = await page.$eval('.spark-single-stage', (stage) => ({
  count: Number(stage.dataset.sparkCount),
  current: stage.querySelector('button').dataset.spark,
}))
if (sparkDeck.count !== 12 || !sparkDeck.current || sparkDeck.current.split(/\s+/).length > 6) {
  throw new Error(`Expected twelve concise prompts: ${JSON.stringify(sparkDeck)}`)
}
await page.waitForFunction((firstSpark) => document.querySelector('.spark-single-stage button')?.dataset.spark !== firstSpark, { timeout: 6000 }, sparkDeck.current)
const rotatingSpark = await page.$eval('.spark-single-stage button', (button) => button.dataset.spark)
const generationChrome = await page.$eval('.generation-surface', (element) => ({
  backBorder: getComputedStyle(element.closest('.card-back')).borderTopWidth,
  backBackground: getComputedStyle(element.closest('.card-back')).backgroundColor,
  cardRect: element.closest('.change-card').getBoundingClientRect().toJSON(),
  viewportHeight: window.innerHeight,
}))
if (generationChrome.backBorder === '0px' || generationChrome.backBackground === 'rgba(0, 0, 0, 0)' || Math.abs(generationChrome.cardRect.width / generationChrome.cardRect.height - 5 / 7) > 0.03) {
  throw new Error('The writing workspace is not contained on a physical card back')
}
if (generationChrome.cardRect.top < 200 || generationChrome.cardRect.bottom > generationChrome.viewportHeight + 5) {
  throw new Error(`Selected card did not move smoothly into the visible workspace: ${JSON.stringify(generationChrome.cardRect)}`)
}
await page.$eval('.spark-single-stage button', (element) => element.click())
await page.waitForFunction((spark) => document.querySelector('.response-editor')?.value === `${spark} — `, {}, rotatingSpark)
const authoredResponse = 'The library becomes a weekly doorstep service: librarians bring books and a small shared activity to each street, so neighbours meet close to home.'
await page.type('.response-editor', authoredResponse)
const preservedDraft = await page.$eval('.response-editor', (element) => element.value)
if (preservedDraft !== `${rotatingSpark} — ${authoredResponse}`) throw new Error('Taking a tiny spark did not leave the response editable')
const finalAuthoredResponse = preservedDraft
await new Promise((resolve) => setTimeout(resolve, 700))
await page.screenshot({ path: 'verification-generation.png', fullPage: true })
await page.click('.response-submit')
await page.waitForFunction(() => document.querySelector('.deck-heading .eyebrow')?.textContent.includes('Change 2 of 3'))
const authoredJourneyStep = await page.evaluate(() => JSON.parse(localStorage.getItem('change-cards-session-v1')).journey.at(-1))
if (authoredJourneyStep.idea !== finalAuthoredResponse || !authoredJourneyStep.authored) throw new Error('The journey did not preserve the user-authored evolution verbatim')
const playedPathCards = await page.$$eval('.journey-stop.complete .journey-card-slot', (cards) => cards.length)
if (playedPathCards !== 1) throw new Error(`Expected one played card in the visible path, found ${playedPathCards}`)
await new Promise((resolve) => setTimeout(resolve, 600))
await page.screenshot({ path: 'verification-path.png', fullPage: true })

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
await page.click('.card-grid .change-card:first-child .card-front')
await page.waitForSelector('.response-editor')
await new Promise((resolve) => setTimeout(resolve, 1000))
const mobileAuthorCard = await page.$eval('.change-card.is-selected', (element) => {
  const card = element.getBoundingClientRect()
  const surface = element.querySelector('.generation-surface')
  return {
    ratio: card.width / card.height,
    initialContentFits: surface.scrollHeight <= surface.clientHeight + 2,
  }
})
if (Math.abs(mobileAuthorCard.ratio - 5 / 7) > 0.04 || !mobileAuthorCard.initialContentFits) {
  throw new Error(`Mobile authoring card is not usable: ${JSON.stringify(mobileAuthorCard)}`)
}
await page.screenshot({ path: 'verification-mobile-evolve.png', fullPage: false })
await page.click('.surface-close')
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 })
if (transformRequestCount !== 0) throw new Error(`Evolve made ${transformRequestCount} unexpected model calls`)
if (sparkRequestCount < 1) throw new Error('Evolve did not request subject-specific sparks')

await page.click('.mode-switch button:nth-child(2)')
await page.waitForSelector('.swarm-canvas')
await new Promise((resolve) => setTimeout(resolve, 700))
const swarmCardCount = await page.$$eval('.swarm-card-position', (cards) => cards.length)
if (swarmCardCount !== 16) throw new Error(`Expected 16 Swarm cards, found ${swarmCardCount}`)
const tabletop = await page.$eval('.swarm-canvas', (element) => {
  const rect = element.getBoundingClientRect()
  return { width: rect.width, viewport: window.innerWidth, border: getComputedStyle(element).borderTopWidth }
})
if (Math.abs(tabletop.width - tabletop.viewport) > 2 || tabletop.border !== '0px') {
  throw new Error('Swarm tabletop is not using the full browser width')
}
await page.screenshot({ path: 'verification-swarm.png', fullPage: true })

const hoverTarget = await page.$('.swarm-card-position:nth-child(3) .change-card')
const hoverBefore = await hoverTarget.boundingBox()
await hoverTarget.hover()
await new Promise((resolve) => setTimeout(resolve, 300))
const hoverAfter = await hoverTarget.boundingBox()
if (hoverAfter.width * hoverAfter.height < hoverBefore.width * hoverBefore.height * 1.08 || Math.abs((hoverAfter.x + hoverAfter.width / 2) - (hoverBefore.x + hoverBefore.width / 2)) > 3) {
  throw new Error(`Swarm hover is not enlarging predictably in place: ${JSON.stringify({ hoverBefore, hoverAfter })}`)
}
await page.screenshot({ path: 'verification-hover.png', fullPage: false })
await page.click('.swarm-card-position:nth-child(3) .card-front')
await page.waitForFunction(
  () => document.querySelectorAll('.idea-sticky').length === 3 || document.querySelector('.swarm-error'),
  { timeout: 120000 },
)
const swarmError = await page.$eval('.swarm-error', (element) => element.textContent).catch(() => null)
const stickyCount = await page.$$eval('.idea-sticky', (stickies) => stickies.length)
if (!swarmError && stickyCount !== 3) throw new Error(`Expected 3 Swarm ideas, found ${stickyCount}`)
if (stickyCount) {
  await page.click('.idea-sticky .sticky-actions button:first-child')
  const starred = await page.$eval('.idea-sticky', (element) => element.classList.contains('is-starred'))
  if (!starred) throw new Error('Swarm favourite interaction did not update')
}
await new Promise((resolve) => setTimeout(resolve, 500))
await page.screenshot({ path: 'verification-swarm-played.png', fullPage: true })

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
await new Promise((resolve) => setTimeout(resolve, 300))
const mobileCanvas = await page.$eval('.swarm-canvas', (element) => ({
  scrollWidth: element.scrollWidth,
  clientWidth: element.clientWidth,
}))
await page.screenshot({ path: 'verification-mobile.png', fullPage: false })

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 })
await page.evaluate(() => {
  localStorage.setItem('change-cards-session-v1', JSON.stringify({
    stage: 'play',
    idea: 'A neighbourhood library that helps isolated older residents make new friends.',
    mode: 'evolve',
    targetSteps: 3,
    evolveFinished: true,
    swarm: {},
    journey: [
      { cardId: 5, cardTitle: 'Do the Opposite', provocation: 'What if you deliberately did the exact opposite?', category: 'ingenious', title: 'The Library That Keeps People Apart', idea: 'Visitors exchange anonymous book notes before they ever meet face-to-face.', shift: 'Connection begins through deliberate separation.' },
      { cardId: 3, cardTitle: 'Build the Dream Team', provocation: 'If you could put any three kinds of people in the room, who would they be?', category: 'multidisciplinary', title: 'The Neighbourhood Story Exchange', idea: 'Older residents, theatre makers and librarians turn anonymous notes into live neighbourhood stories.', shift: 'A mixed team makes hidden connections visible.' },
      { cardId: 14, cardTitle: 'Prototype It Tomorrow', provocation: 'What could you make tomorrow that would teach you something?', category: 'flexible', title: 'Three Notes by Friday', idea: 'The library leaves three handwritten prompts in returned books and tracks which ones bring readers back to meet.', shift: 'The programme becomes a tiny, observable experiment.' },
    ],
  }))
})
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('.ending-page')
const ancestryCount = await page.$$eval('.ancestry-step', (steps) => steps.length)
if (ancestryCount !== 3) throw new Error(`Expected 3 ancestry steps, found ${ancestryCount}`)
const finalPrimaryActions = await page.$$eval('.final-actions button', (buttons) => buttons.length)
if (finalPrimaryActions !== 2) throw new Error(`Expected two primary ending actions, found ${finalPrimaryActions}`)
const tinyCardOverflow = await page.$$eval('.tiny-change-card', (cards) => cards.some((card) => card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1))
if (tinyCardOverflow) throw new Error('Final journey card text is overflowing')
await page.screenshot({ path: 'verification-ending.png', fullPage: true })

const overlay = await page.$('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
const result = {
  title: await page.title(),
  hasContent: initialText.trim().length > 0,
  cardCount,
  iconCount,
  deckOverlap,
  swarmCardCount,
  fullWidthTabletop: true,
  stableInPlaceHover: true,
  userAuthoredFirst: true,
  microSparks: true,
  evolveUsesSparkModel: true,
  mobileAuthorCard: true,
  stickyCount,
  swarmError,
  mobileDeckScrolls: mobileCanvas.scrollWidth > mobileCanvas.clientWidth,
  ancestryCount,
  errorOverlay: Boolean(overlay),
  consoleErrors,
}

console.log(JSON.stringify(result, null, 2))
await browser.close()
