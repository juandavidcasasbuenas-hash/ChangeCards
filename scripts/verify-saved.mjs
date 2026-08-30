import puppeteer from 'puppeteer-core'

const origin = 'http://localhost:8787'
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
})

try {
  await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write'])
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 })

  const consoleErrors = []
  let sparkRequestCount = 0
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    if (!request.url().includes('/api/sparks')) {
      request.continue()
      return
    }
    sparkRequestCount += 1
    request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sparks: Array.from({ length: 10 }, (_, index) => `Useful spark ${index + 1}`) }),
    })
  })

  const originalIdea = 'A neighbourhood library that helps isolated older residents make new friends.'
  const notes = {
    3: { note: 'Older residents, theatre makers and librarians turn anonymous book notes into live neighbourhood stories.', visited: true, updatedAt: 100 },
    7: { note: 'Run one tiny doorstep book exchange on a single street with handwritten invitations and borrowed chairs.', visited: true, updatedAt: 200 },
    14: { note: 'The library leaves three handwritten prompts in returned books and tracks which ones bring readers back to meet. The test records which prompt starts a conversation, which is ignored, and what residents change in their own words. This deliberately long response confirms that the enlarged saved card keeps every line readable without escaping the viewport.', visited: true, updatedAt: 300 },
  }

  await page.goto(origin, { waitUntil: 'networkidle0' })
  await page.evaluate(({ originalIdea, notes }) => {
    localStorage.setItem('change-cards-onboarding-v2', 'complete')
    localStorage.setItem('change-cards-session-v1', JSON.stringify({
      stage: 'play',
      idea: originalIdea,
      mode: 'tabletop',
      journey: [],
      targetSteps: 3,
      evolveFinished: false,
      swarm: notes,
      dealtCardIds: [3, 7, 14],
      cardPositions: {},
    }))
    sessionStorage.removeItem('change-cards-cache-v1')
  }, { originalIdea, notes })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.saved-copy-button')

  const rail = await page.$eval('.saved-pins', (element) => ({
    text: element.innerText,
    pinCount: element.querySelectorAll('.saved-pin').length,
  }))
  if (!rail.text.includes('COPY IDEAS') || rail.text.includes('SAVED') || rail.pinCount !== 3) {
    throw new Error(`Saved rail is not the single review/export surface: ${JSON.stringify(rail)}`)
  }
  const usedCardLabels = await page.$$eval('.used-card-back', (cards) => cards.map((card) => card.innerText))
  if (usedCardLabels.some((label) => label.includes('Note saved'))) throw new Error('Used cards still repeat “Note saved”')

  await page.click('.saved-pin:first-child')
  await page.waitForSelector('.saved-review-card[data-card-id="14"]')
  if (sparkRequestCount !== 0) throw new Error('Opening a saved card requested sparks')
  const desktopReview = await page.$eval('.saved-review', (element) => {
    const rect = element.getBoundingClientRect()
    const note = element.querySelector('.saved-review-idea')
    const noteStyle = getComputedStyle(note)
    return {
      withinViewport: rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      noteCanScroll: note.scrollHeight >= note.clientHeight,
      noteIsContinuous: noteStyle.backgroundColor === 'rgba(0, 0, 0, 0)' && noteStyle.boxShadow === 'none' && !note.querySelector('span'),
      questionHasNoHelper: !element.querySelector('.saved-review-question span') && !element.innerText.includes('THE QUESTION'),
      questionVisible: Boolean(element.querySelector('.saved-review-question')?.innerText.trim()),
    }
  })
  if (!desktopReview.withinViewport || !desktopReview.noteCanScroll || !desktopReview.noteIsContinuous || !desktopReview.questionHasNoHelper || !desktopReview.questionVisible) {
    throw new Error(`Desktop saved review is not contained and readable: ${JSON.stringify(desktopReview)}`)
  }

  await page.click('.saved-review-copy')
  await new Promise((resolve) => setTimeout(resolve, 800))
  const individualFeedback = await page.evaluate(() => ({
    button: document.querySelector('.saved-review-copy')?.innerText,
    status: document.querySelector('[role="status"]')?.textContent,
  }))
  if (!individualFeedback.button?.toLowerCase().includes('copied')) throw new Error(`Individual copy feedback failed: ${JSON.stringify(individualFeedback)}`)
  const individualCopy = await page.evaluate(() => navigator.clipboard.readText())
  const expectedIndividual = `CHANGE CARD — Prototype It Tomorrow\nQuestion: What could you make tomorrow that would teach you something?\n\nIDEA\n${notes[14].note}`
  if (individualCopy !== expectedIndividual) throw new Error(`Individual copy format changed:\n${individualCopy}`)

  await page.click('.saved-review-close')
  await page.waitForSelector('.saved-review', { hidden: true })
  await page.waitForFunction(() => document.activeElement?.classList.contains('saved-pin'), { timeout: 1000 })
  const focusRestored = await page.evaluate(() => document.activeElement?.classList.contains('saved-pin'))
  if (!focusRestored) throw new Error('Closing review did not restore focus to its saved thumbnail')

  await page.click('.saved-copy-button')
  await new Promise((resolve) => setTimeout(resolve, 800))
  const allFeedback = await page.evaluate(() => ({
    button: document.querySelector('.saved-copy-button')?.innerText,
    status: document.querySelector('[role="status"]')?.textContent,
  }))
  if (!allFeedback.button?.toLowerCase().includes('copied')) throw new Error(`Complete copy feedback failed: ${JSON.stringify(allFeedback)}`)
  const allCopy = await page.evaluate(() => navigator.clipboard.readText())
  const expectedAll = `CHANGE CARDS\n\nORIGINAL IDEA\n${originalIdea}\n\nSAVED IDEAS\n\n1. Build the Dream Team\nQuestion: If you could put any three kinds of people in the room, who would they be?\n\n${notes[3].note}\n\n2. Make It Ridiculously Small\nQuestion: You have one day, one person and £100. What do you build?\n\n${notes[7].note}\n\n3. Prototype It Tomorrow\nQuestion: What could you make tomorrow that would teach you something?\n\n${notes[14].note}`
  if (allCopy !== expectedAll) throw new Error(`Complete copy format changed:\n${allCopy}`)

  await page.click('.saved-pin:first-child')
  await page.waitForSelector('.saved-review-card[data-card-id="14"]')
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.saved-review-card[data-card-id="7"]')
  if (sparkRequestCount !== 0) throw new Error('Browsing saved cards requested sparks')
  await page.click('.saved-review-edit')
  await page.waitForSelector('.response-editor')
  const preservedEdit = await page.$eval('.response-editor', (element) => element.value)
  if (preservedEdit !== notes[7].note) throw new Error('Editing did not preserve the saved response')
  await page.waitForFunction(() => document.querySelector('.editor-spark button'), { timeout: 5000 })
  if (sparkRequestCount !== 1) throw new Error(`Editing should request sparks once, saw ${sparkRequestCount}`)
  await page.click('.surface-close')

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  await page.click('.saved-pin:first-child')
  await page.waitForSelector('.saved-review-card[data-card-id="14"]')
  await new Promise((resolve) => setTimeout(resolve, 650))
  const mobileReview = await page.$eval('.saved-review', (element) => {
    const rect = element.getBoundingClientRect()
    const buttons = [...element.querySelectorAll('button')].map((button) => {
      const buttonRect = button.getBoundingClientRect()
      return { className: button.className, width: buttonRect.width, height: buttonRect.height, disabled: button.disabled }
    })
    return {
      withinViewport: rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      accessibleTargets: buttons.every((button) => button.disabled || (button.width >= 43 && button.height >= 43)),
      buttons,
    }
  })
  if (!mobileReview.withinViewport || !mobileReview.accessibleTargets) {
    throw new Error(`Mobile saved review is not usable: ${JSON.stringify(mobileReview)}`)
  }
  await page.$eval('.saved-review', (element) => {
    const start = new Event('touchstart', { bubbles: true })
    Object.defineProperty(start, 'touches', { value: [{ clientX: 320, clientY: 400 }] })
    element.dispatchEvent(start)
    const end = new Event('touchend', { bubbles: true })
    Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 210, clientY: 405 }] })
    element.dispatchEvent(end)
  })
  await page.waitForSelector('.saved-review-card[data-card-id="7"]')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.saved-review', { hidden: true })

  if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(' | ')}`)
  console.log(JSON.stringify({
    savedRailIsExportSurface: true,
    reviewDoesNotGenerate: true,
    individualCopy: true,
    completeCopy: true,
    chronologicalExport: true,
    focusRestored: true,
    editPreservesResponse: true,
    keyboardNavigation: true,
    mobileContained: true,
    mobileSwipe: true,
    sparkRequestCount,
  }, null, 2))
} finally {
  await browser.close()
}
