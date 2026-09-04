import puppeteer from 'puppeteer-core'

const origin = 'http://localhost:8787'
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 })
  const consoleErrors = []
  let sparkRequestCount = 0
  const sparkPayloads = []
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
    sparkPayloads.push(JSON.parse(request.postData() || '{}'))
    request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sparks: [
        'A doorstep story exchange', 'Borrowed chairs outside', 'One street at a time', 'Resident hosts', 'A shared book trolley',
        'Tea before books', 'Handwritten invitations', 'The quietest neighbour', 'A weekly doorstep bell', 'Stories in returned books',
      ] }),
    })
  })

  await page.goto(origin, { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    localStorage.removeItem('change-cards-session-v1')
    localStorage.removeItem('change-cards-onboarding-v2')
    sessionStorage.removeItem('change-cards-cache-v1')
  })
  await page.reload({ waitUntil: 'networkidle0' })

  const landing = await page.$eval('body', (element) => ({
    text: element.innerText,
    favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
    creatorLink: document.querySelector('.project-credit a')?.getAttribute('href'),
  }))
  if (!landing.text.includes('Push an idea') || !landing.text.includes('What are you working on?')) throw new Error('Landing page content is missing')
  if (!landing.favicon || landing.creatorLink !== 'https://jdcasasbuenas.com') throw new Error('Landing page identity metadata is missing')

  for (const width of [1440, 821, 820, 658, 390, 320]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
    const footerLayout = await page.$eval('.project-credit.is-app-footer', (element) => {
      const footer = element.getBoundingClientRect()
      const visibleItems = [...element.children]
        .filter((child) => getComputedStyle(child).display !== 'none')
        .map((child) => {
          const rect = child.getBoundingClientRect()
          return { className: child.className, left: rect.left, right: rect.right }
        })
      return {
        position: getComputedStyle(element).position,
        footer: { left: footer.left, right: footer.right },
        visibleItems,
        viewportWidth: innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })
    const itemsOverlap = footerLayout.visibleItems.some((item, index) => (
      index < footerLayout.visibleItems.length - 1 && item.right > footerLayout.visibleItems[index + 1].left + 0.5
    ))
    const privacyVisible = footerLayout.visibleItems.some((item) => item.className.includes('privacy-link'))
    const contextVisible = footerLayout.visibleItems.some((item) => item.className.includes('credit-context') && !item.className.includes('separator'))
    if (footerLayout.position !== 'relative' || footerLayout.footer.left < -1 || footerLayout.footer.right > footerLayout.viewportWidth + 1 || footerLayout.horizontalOverflow || itemsOverlap || !privacyVisible || (width <= 820 && contextVisible)) {
      throw new Error(`Footer does not adapt cleanly at ${width}px: ${JSON.stringify(footerLayout)}`)
    }
  }
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 })

  const privacyTrigger = await page.$('.project-credit .privacy-link')
  if (!privacyTrigger) throw new Error('The footer does not expose the privacy notice')
  await privacyTrigger.click()
  await page.waitForSelector('.privacy-sheet')
  const privacyNotice = await page.$eval('.privacy-sheet', (element) => ({
    text: element.innerText,
    inViewport: element.getBoundingClientRect().top >= 0 && element.getBoundingClientRect().bottom <= innerHeight,
    bodyLocked: document.body.style.overflow === 'hidden',
  }))
  if (!privacyNotice.text.includes('How your ideas') || !privacyNotice.text.includes('Supabase') || !privacyNotice.text.includes('OpenAI') || !privacyNotice.text.includes('Vercel Web Analytics') || !privacyNotice.inViewport || !privacyNotice.bodyLocked) {
    throw new Error(`Privacy notice is incomplete or poorly contained: ${JSON.stringify(privacyNotice)}`)
  }
  await page.keyboard.press('Escape')
  await page.waitForSelector('.privacy-sheet', { hidden: true })
  await page.waitForFunction(() => document.activeElement === document.querySelector('.project-credit .privacy-link'))

  const initialMode = await page.$eval('.entry-mode-toggle', (element) => ({
    text: element.innerText,
    selected: element.querySelector('[aria-pressed="true"]')?.textContent?.trim(),
  }))
  if (!initialMode.text.toLowerCase().includes('solo') || !initialMode.text.toLowerCase().includes('co-op') || initialMode.selected !== 'Solo') throw new Error('The mode selector is not initialised to Solo')
  await page.click('.entry-mode-toggle button:last-child')
  await page.click('.coop-entry-choices button:last-child')
  await page.waitForSelector('.entry-room-actions #entry-room-code')
  if (await page.$('#idea')) throw new Error('Joining should ask for code before an idea')
  await page.click('.coop-entry-choices button:first-child')
  await page.type('#idea', 'A temporary co-op idea')
  await page.click('.entry-create-choice')
  await page.waitForSelector('.entry-name-step #entry-display-name')
  if (!await page.$eval('.entry-name-step', (element) => element.innerText.includes('What should we') && element.innerText.includes('call you?'))) throw new Error('Name entry did not move to the focused second screen')
  await page.click('.entry-name-back')
  await page.waitForSelector('.entry-mode-toggle')
  await page.$eval('#idea', (element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(element, '')
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.click('.entry-mode-toggle button:first-child')
  await page.waitForSelector('.entry-room-actions', { hidden: true })

  const originalIdea = 'A neighbourhood library that helps isolated older residents make new friends.'
  await page.type('#idea', originalIdea)
  await page.click('.idea-form .ink-button')
  await page.waitForSelector('.tabletop')
  const initialTable = await page.$eval('.tabletop', (element) => ({
    originalIdea: element.querySelector('.original-note p')?.textContent,
    originalIdeaHelperCount: element.querySelectorAll('.original-note > span').length,
    deckCount: element.querySelector('.deck-back > span:last-child')?.textContent,
  }))
  if (initialTable.originalIdea !== originalIdea || initialTable.originalIdeaHelperCount !== 0 || initialTable.deckCount !== '40') throw new Error(`Table did not initialise correctly: ${JSON.stringify(initialTable)}`)

  await page.click('.deck-stack')
  await page.waitForSelector('.deal-flight-card')
  await page.waitForSelector('.deal-flight-card', { hidden: true, timeout: 4000 })
  const dealtCards = await page.$$('.tabletop-canvas > .table-card-shell')
  if (dealtCards.length !== 1) throw new Error(`Expected one dealt card, found ${dealtCards.length}`)
  const dealtCardId = await page.$eval('.tabletop-canvas > .table-card-shell', (element) => element.dataset.cardId)

  await page.click(`.tabletop-canvas > .table-card-shell[data-card-id="${dealtCardId}"] .card-front`)
  await page.waitForSelector('.response-editor')
  await page.waitForFunction(() => document.querySelector('.editor-spark button'), { timeout: 5000 })
  if (sparkRequestCount !== 1) throw new Error(`Opening an unsaved card should request sparks once, saw ${sparkRequestCount}`)
  const editorCard = await page.$eval('.active-card-wrap', (element) => {
    const rect = element.getBoundingClientRect()
    return { withinViewport: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth }
  })
  if (!editorCard.withinViewport) throw new Error('Desktop writing card is cropped')

  const response = 'The library becomes a weekly doorstep exchange where resident hosts bring one book and one conversation prompt to each street.'
  await page.type('.response-editor', response)
  await page.click('.response-submit')
  await page.waitForSelector('.saved-pins')
  await page.waitForSelector(`.table-card-shell[data-card-id="${dealtCardId}"] .change-card.is-face-down`)
  const savedTableCard = await page.$eval(`.table-card-shell[data-card-id="${dealtCardId}"] .used-card-back`, (element) => element.innerText)
  if (!savedTableCard.includes(response) || savedTableCard.includes('Note saved')) throw new Error('Saved table card does not show the authored idea cleanly')

  await page.click(`.table-card-shell[data-card-id="${dealtCardId}"] .used-card-back`)
  await page.waitForSelector(`.saved-review-card[data-card-id="${dealtCardId}"]`)
  if (sparkRequestCount !== 1) throw new Error('Reviewing the saved table card made an additional model request')
  await page.click('.saved-review-close')
  await page.waitForSelector('.saved-review', { hidden: true })

  await page.click('.deal-all-button')
  await page.waitForFunction(() => document.querySelectorAll('.tabletop-canvas > .table-card-shell').length === 40)
  const allCards = await page.$$eval('.tabletop-canvas > .table-card-shell', (cards) => {
    const canvas = cards[0]?.closest('.tabletop-canvas')?.getBoundingClientRect()
    return {
    count: cards.length,
    unique: new Set(cards.map((card) => card.dataset.cardId)).size,
    denseLayout: cards[0]?.closest('.tabletop')?.classList.contains('is-dense'),
    spriteIconCount: cards.filter((card) => card.querySelector('.sprite-card-icon')).length,
    cardsContained: cards.every((card) => {
      const rect = card.getBoundingClientRect()
      return rect.left >= canvas.left - 1 && rect.right <= canvas.right + 1 && rect.top >= canvas.top - 1 && rect.bottom <= canvas.bottom + 1
    }),
    titlesContained: cards.every((card) => {
      const title = card.querySelector('.card-front strong')
      const face = card.querySelector('.card-front')
      if (!title || !face) return true
      const titleRect = title.getBoundingClientRect()
      const faceRect = face.getBoundingClientRect()
      return titleRect.left >= faceRect.left - 1 && titleRect.right <= faceRect.right + 1 && titleRect.top >= faceRect.top - 1 && titleRect.bottom <= faceRect.bottom + 1
    }),
  }
  })
  if (allCards.count !== 40 || allCards.unique !== 40 || !allCards.denseLayout || allCards.spriteIconCount !== 24 || !allCards.cardsContained || !allCards.titlesContained) throw new Error(`Deal all produced a broken deck: ${JSON.stringify(allCards)}`)

  const denseBreakpointResults = []
  for (const width of [1280, 1024, 821]) {
    await page.setViewport({ width, height: 720, deviceScaleFactor: 1 })
    await new Promise((resolve) => setTimeout(resolve, 120))
    denseBreakpointResults.push(await page.$eval('.tabletop', (table) => {
      const canvas = table.querySelector('.tabletop-canvas')
      const canvasRect = canvas.getBoundingClientRect()
      const cards = [...canvas.querySelectorAll(':scope > .table-card-shell')]
      return {
        width: innerWidth,
        cardCount: cards.length,
        scrollable: document.documentElement.scrollHeight > innerHeight,
        horizontalOverflow: table.scrollWidth > table.clientWidth + 1,
        scrollWidth: table.scrollWidth,
        clientWidth: table.clientWidth,
        overflowers: [...table.querySelectorAll('*')].map((child) => {
          const rect = child.getBoundingClientRect()
          return { className: String(child.className), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }
        }).filter((child) => child.right > innerWidth + 1 || child.left < -1).slice(0, 6),
        cardsContained: cards.every((card) => {
          const rect = card.getBoundingClientRect()
          return rect.left >= canvasRect.left - 1 && rect.right <= canvasRect.right + 1 && rect.top >= canvasRect.top - 1 && rect.bottom <= canvasRect.bottom + 1
        }),
      }
    }))
  }
  if (denseBreakpointResults.some((result) => result.cardCount !== 40 || result.horizontalOverflow || !result.cardsContained)) {
    throw new Error(`Dense deck breaks at a desktop/tablet boundary: ${JSON.stringify(denseBreakpointResults)}`)
  }

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await new Promise((resolve) => setTimeout(resolve, 120))

  const newestTestCardId = dealtCardId === '40' ? '39' : '40'
  await page.click(`.table-card-shell[data-card-id="${newestTestCardId}"] .card-front`)
  await page.waitForSelector('.response-editor')
  await page.waitForFunction(() => document.querySelector('.editor-spark button'), { timeout: 5000 })
  const newestCardPayload = sparkPayloads.at(-1)
  if (!newestCardPayload.cardSparkBrief || !['Move the Boundary', 'Design for Misuse'].includes(newestCardPayload.cardTitle)) {
    throw new Error(`New cards do not send their Spark brief: ${JSON.stringify(newestCardPayload)}`)
  }
  await page.click('.surface-close')

  await new Promise((resolve) => setTimeout(resolve, 1100))
  const compactBreakpointResults = []
  for (const width of [820, 600, 390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1 })
    await page.mouse.move(0, 0)
    await new Promise((resolve) => setTimeout(resolve, 160))
    compactBreakpointResults.push(await page.$eval('.tabletop', (table) => ({
      width: innerWidth,
      scrollable: document.documentElement.scrollHeight > innerHeight,
      cardCount: table.querySelectorAll('.tabletop-canvas > .table-card-shell').length,
      horizontalOverflow: table.scrollWidth > table.clientWidth + 1,
      bodyHorizontalOverflow: document.body.scrollWidth > innerWidth + 1,
    })))
  }
  if (compactBreakpointResults.some((result) => !result.scrollable || result.cardCount !== 40 || result.horizontalOverflow || result.bodyHorizontalOverflow)) {
    throw new Error(`Compact full-deck browsing breaks at a responsive boundary: ${JSON.stringify(compactBreakpointResults)}`)
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  await new Promise((resolve) => setTimeout(resolve, 160))
  const workshopFooter = await page.$eval('.project-credit.is-app-footer', (element) => {
    const footer = element.getBoundingClientRect()
    const items = [...element.children]
      .filter((child) => getComputedStyle(child).display !== 'none')
      .map((child) => {
        const rect = child.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      })
    return {
      position: getComputedStyle(element).position,
      left: footer.left,
      right: footer.right,
      viewportWidth: innerWidth,
      itemsOverlap: items.some((item, index) => index < items.length - 1 && item.right > items[index + 1].left + 0.5),
    }
  })
  if (workshopFooter.position !== 'relative' || workshopFooter.left < -1 || workshopFooter.right > workshopFooter.viewportWidth + 1 || workshopFooter.itemsOverlap) {
    throw new Error(`Workshop footer is not contained on mobile: ${JSON.stringify(workshopFooter)}`)
  }
  const mobileTable = await page.$eval('.tabletop', (element) => ({
    scrollable: document.documentElement.scrollHeight > innerHeight,
    cardCount: element.querySelectorAll('.tabletop-canvas > .table-card-shell').length,
    horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    overflowers: [...element.querySelectorAll('*')].map((child) => {
      const rect = child.getBoundingClientRect()
      return { className: child.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }
    }).filter((child) => child.right > innerWidth + 1 || child.left < -1).slice(0, 8),
  }))
  if (!mobileTable.scrollable || mobileTable.cardCount !== 40 || mobileTable.horizontalOverflow) {
    throw new Error(`Mobile table does not expose the full deck cleanly: ${JSON.stringify(mobileTable)}`)
  }
  await page.$eval('.tabletop-canvas > .table-card-shell:last-of-type', (element) => element.scrollIntoView({ block: 'end', behavior: 'instant' }))
  await new Promise((resolve) => setTimeout(resolve, 150))
  const lastCard = await page.$eval('.tabletop-canvas > .table-card-shell:last-of-type', (element) => {
    const rect = element.getBoundingClientRect()
    const table = element.closest('.tabletop')
    return { visible: rect.bottom > 60 && rect.top < innerHeight, top: rect.top, bottom: rect.bottom, scrollTop: table.scrollTop, scrollHeight: table.scrollHeight, clientHeight: table.clientHeight }
  })
  if (!lastCard.visible) throw new Error(`Mobile users cannot scroll to the final dealt cards: ${JSON.stringify(lastCard)}`)

  await page.$eval('.project-credit.is-app-footer .privacy-link', (element) => element.click())
  await page.waitForSelector('.privacy-sheet')
  await new Promise((resolve) => setTimeout(resolve, 450))
  const mobilePrivacy = await page.$eval('.privacy-sheet', (element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      internallyScrollable: element.scrollHeight > element.clientHeight,
      bodyHorizontalOverflow: document.body.scrollWidth > innerWidth + 1,
    }
  })
  if (mobilePrivacy.left < -1 || mobilePrivacy.right > mobilePrivacy.viewportWidth + 1 || mobilePrivacy.bottom > mobilePrivacy.viewportHeight + 1 || !mobilePrivacy.internallyScrollable || mobilePrivacy.bodyHorizontalOverflow) {
    throw new Error(`Mobile privacy sheet is not contained: ${JSON.stringify(mobilePrivacy)}`)
  }
  await page.keyboard.press('Escape')
  await page.waitForSelector('.privacy-sheet', { hidden: true })

  if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(' | ')}`)
  console.log(JSON.stringify({
    landingPage: true,
    responsiveFooter: true,
    privacyNotice: true,
    tabletopStartsDirectly: true,
    randomDealFlight: true,
    unsavedCardIdeation: true,
    savedCardReview: true,
    reviewDoesNotGenerate: true,
    dealAllUniqueCards: true,
    denseDeckBreakpoints: true,
    compactDeckBreakpoints: true,
    mobileTableScrolls: true,
    mobileWorkshopFooter: true,
    mobilePrivacyContained: true,
    sparkRequestCount,
  }, null, 2))
} finally {
  await browser.close()
}
