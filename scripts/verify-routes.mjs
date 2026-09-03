import puppeteer from 'puppeteer-core'

const origin = 'http://localhost:8787'
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const consoleErrors = []
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
    sparkPayloads.push(JSON.parse(request.postData() || '{}'))
    request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sparks: [
        'Test the riskiest belief', 'A one-day paper trial', 'Ask the doubtful neighbour', 'Watch one real handover', 'Remove the confident claim',
        'Measure the first hesitation', 'Borrow the existing queue', 'Invite a friendly critic', 'Try the smallest promise', 'Keep the failed version',
      ] }),
    })
  })

  await page.goto(origin, { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    localStorage.setItem('change-cards-session-v1', JSON.stringify({
      stage: 'play',
      idea: 'A neighbourhood library that helps isolated older residents make new friends.',
      mode: 'tabletop',
      journey: [],
      targetSteps: 3,
      evolveFinished: false,
      swarm: {},
      dealtCardIds: [1],
      cardPositions: { 1: { x: 45, y: 23 } },
      scrapbookOrder: [],
      activeRouteId: null,
    }))
    localStorage.setItem('change-cards-onboarding-v2', 'complete')
    sessionStorage.removeItem('change-cards-cache-v1')
  })
  await page.reload({ waitUntil: 'networkidle0' })

  await page.click('.routes-button')
  await page.waitForSelector('.route-chooser')
  const chooser = await page.$eval('.route-chooser', (element) => ({
    routeCount: element.querySelectorAll('.route-slip').length,
    cardCounts: [...element.querySelectorAll('.route-slip')].map((slip) => slip.querySelectorAll('.route-slip-cards > b').length),
    inViewport: element.getBoundingClientRect().right <= innerWidth && element.getBoundingClientRect().left >= 0,
  }))
  const focusVeil = await page.$eval('.route-chooser-scrim', (element) => ({
    background: getComputedStyle(element).backgroundColor,
    backdropFilter: getComputedStyle(element).backdropFilter || getComputedStyle(element).webkitBackdropFilter,
  }))
  if (chooser.routeCount !== 5 || chooser.cardCounts.some((count) => count !== 4) || !chooser.inViewport) {
    throw new Error(`Route chooser is incomplete: ${JSON.stringify(chooser)}`)
  }
  if (focusVeil.background === 'rgba(0, 0, 0, 0)' || focusVeil.backdropFilter === 'none') {
    throw new Error(`Route chooser does not separate itself from the table: ${JSON.stringify(focusVeil)}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 520))
  await page.screenshot({ path: '/tmp/change-cards-route-chooser-desktop.png', fullPage: false })

  await page.click('.route-chooser-scrim')
  await page.waitForSelector('.route-chooser', { hidden: true })
  await page.waitForFunction(() => document.activeElement === document.querySelector('.routes-button'))
  await page.click('.routes-button')
  await page.waitForSelector('.route-chooser')

  await page.click('.route-slip:first-child')
  await page.waitForFunction(() => document.querySelectorAll('.tabletop-canvas > .table-card-shell').length === 5)
  await page.waitForSelector('.tabletop.has-active-route')
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const routeFromPartialDeck = await page.$eval('.tabletop', (table) => {
    const cards = [...table.querySelectorAll('.tabletop-canvas > .table-card-shell')]
    return {
      ids: cards.map((card) => Number(card.dataset.cardId)),
      routeIds: cards.filter((card) => card.classList.contains('is-route-card')).map((card) => Number(card.dataset.cardId)),
      backgroundIds: cards.filter((card) => card.classList.contains('is-route-background')).map((card) => Number(card.dataset.cardId)),
      routePositions: cards.filter((card) => card.classList.contains('is-route-card')).map((card) => ({ left: card.style.left, top: card.style.top })),
      remaining: table.querySelector('.deck-back > span:last-child')?.textContent,
    }
  })
  if (JSON.stringify(routeFromPartialDeck.routeIds) !== JSON.stringify([13, 7, 14, 15]) || routeFromPartialDeck.backgroundIds[0] !== 1 || routeFromPartialDeck.remaining !== '35') {
    throw new Error(`Route did not gather and deal cleanly: ${JSON.stringify(routeFromPartialDeck)}`)
  }
  if (new Set(routeFromPartialDeck.routePositions.map(({ left, top }) => `${left}/${top}`)).size !== 4) {
    throw new Error(`Route cards did not land in four positions: ${JSON.stringify(routeFromPartialDeck.routePositions)}`)
  }

  await page.click('.table-card-shell[data-card-id="13"] .card-front')
  await page.waitForSelector('.response-editor')
  await page.waitForFunction(() => document.querySelector('.editor-spark button'))
  const sparkPayload = sparkPayloads.at(-1)
  if (sparkPayload.routeId !== 'assumption-to-evidence' || sparkPayload.routeStep !== 1 || sparkPayload.routeLength !== 4 || !Array.isArray(sparkPayload.previousRouteResponses)) {
    throw new Error(`Route context is missing from sparks: ${JSON.stringify(sparkPayload)}`)
  }
  await page.type('.response-editor', 'Test the welcome ritual with one resident before building the wider programme.')
  await page.click('.response-submit')
  await page.waitForSelector('.active-card-layer', { hidden: true })
  await page.waitForSelector('.table-card-shell[data-card-id="13"].is-route-complete')
  if (!await page.$('.table-card-shell[data-card-id="7"].is-route-next')) throw new Error('The next route card is not signposted')

  await page.click('.table-card-shell[data-card-id="7"] .card-front')
  await page.waitForSelector('.response-editor')
  await page.waitForFunction(() => document.querySelector('.editor-spark button'))
  const secondStepPayload = sparkPayloads.at(-1)
  if (secondStepPayload.routeStep !== 2 || secondStepPayload.previousRouteResponses?.[0]?.cardTitle !== 'Your Assumption Is Wrong' || !secondStepPayload.previousRouteResponses?.[0]?.response.includes('welcome ritual')) {
    throw new Error(`Earlier route work did not reach the next card: ${JSON.stringify(secondStepPayload)}`)
  }
  await page.click('.surface-close')
  await page.waitForSelector('.active-card-layer', { hidden: true })

  await page.click('.route-ribbon > button')
  await page.waitForSelector('.tabletop.has-active-route', { hidden: true })
  await new Promise((resolve) => setTimeout(resolve, 760))
  const restoredCard = await page.$eval('.table-card-shell[data-card-id="1"]', (element) => ({
    left: element.style.left,
    top: element.style.top,
    background: element.classList.contains('is-route-background'),
  }))
  if (restoredCard.left !== '45%' || restoredCard.top !== '23%' || restoredCard.background) {
    throw new Error(`Leaving the route changed the original table: ${JSON.stringify(restoredCard)}`)
  }

  await page.click('.deal-all-button')
  await page.waitForFunction(() => document.querySelectorAll('.tabletop-canvas > .table-card-shell').length === 40)
  await page.click('.routes-button')
  await page.click('.route-slip:nth-child(3)')
  await page.waitForSelector('.tabletop.has-active-route')
  const fullDeckRoute = await page.$eval('.tabletop', (table) => {
    const cards = [...table.querySelectorAll('.tabletop-canvas > .table-card-shell')]
    return {
      count: cards.length,
      unique: new Set(cards.map((card) => card.dataset.cardId)).size,
      focused: cards.filter((card) => card.classList.contains('is-route-card')).map((card) => Number(card.dataset.cardId)),
      backgroundCount: cards.filter((card) => card.classList.contains('is-route-background')).length,
      activeRouteId: JSON.parse(localStorage.getItem('change-cards-session-v1')).activeRouteId,
    }
  })
  if (fullDeckRoute.count !== 40 || fullDeckRoute.unique !== 40 || JSON.stringify(fullDeckRoute.focused) !== JSON.stringify([6, 22, 20, 8]) || fullDeckRoute.backgroundCount !== 36 || fullDeckRoute.activeRouteId !== 'creative-breakthrough') {
    throw new Error(`Deal all route focus failed: ${JSON.stringify(fullDeckRoute)}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 1200))
  await page.screenshot({ path: '/tmp/change-cards-route-desktop.png', fullPage: false })

  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.tabletop.has-active-route')
  if ((await page.$$('.table-card-shell.is-route-card')).length !== 4) throw new Error('The active route did not survive refresh')

  const compactRouteLayouts = []
  for (const width of [820, 600, 390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1 })
    await new Promise((resolve) => setTimeout(resolve, 220))
    compactRouteLayouts.push(await page.$eval('.tabletop', (table) => {
      const cards = [...table.querySelectorAll('.tabletop-canvas > .table-card-shell')]
      const ribbon = table.querySelector('.route-ribbon')?.getBoundingClientRect()
      return {
        width: innerWidth,
        firstFour: cards.slice(0, 4).map((card) => Number(card.dataset.cardId)),
        scrollable: table.scrollHeight > table.clientHeight,
        horizontalOverflow: table.scrollWidth > table.clientWidth + 1 || document.body.scrollWidth > innerWidth + 1,
        ribbonContained: ribbon && ribbon.left >= 0 && ribbon.right <= innerWidth,
        backgroundCount: cards.filter((card) => card.classList.contains('is-route-background')).length,
      }
    }))
  }
  const brokenCompactLayout = compactRouteLayouts.find((layout) => JSON.stringify(layout.firstFour) !== JSON.stringify([6, 22, 20, 8]) || !layout.scrollable || layout.horizontalOverflow || !layout.ribbonContained || layout.backgroundCount !== 36)
  if (brokenCompactLayout) throw new Error(`Compact route layout failed: ${JSON.stringify(compactRouteLayouts)}`)

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  await new Promise((resolve) => setTimeout(resolve, 220))
  await page.screenshot({ path: '/tmp/change-cards-route-mobile.png', fullPage: false })

  await page.click('.route-ribbon > button')
  await new Promise((resolve) => setTimeout(resolve, 760))
  if ((await page.$$('.table-card-shell')).length !== 40) throw new Error('Leaving a route removed cards from the full deck')
  await page.click('.routes-button')
  await page.waitForSelector('.route-chooser')
  const mobileChooser = await page.$eval('.route-chooser', (element) => ({
    contained: element.getBoundingClientRect().left >= 0 && element.getBoundingClientRect().right <= innerWidth,
    horizontallyScrollable: element.querySelector('.route-slips').scrollWidth > element.querySelector('.route-slips').clientWidth,
    bodyOverflow: document.body.scrollWidth > innerWidth + 1,
  }))
  if (!mobileChooser.contained || !mobileChooser.horizontallyScrollable || mobileChooser.bodyOverflow) {
    throw new Error(`Mobile route chooser failed: ${JSON.stringify(mobileChooser)}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 520))
  if (!await page.$('.route-scroll-button.is-next') || await page.$('.route-scroll-button.is-previous')) {
    throw new Error('Route carousel does not start with only its forward arrow')
  }
  await page.screenshot({ path: '/tmp/change-cards-route-chooser-mobile.png', fullPage: false })
  await page.click('.route-scroll-button.is-next')
  await page.waitForFunction(() => document.querySelector('.route-slips')?.scrollLeft > 40)
  if (!await page.$('.route-scroll-button.is-previous')) throw new Error('The previous route arrow did not appear after scrolling')
  await page.focus('.route-scroll-button.is-previous')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('.route-slips')?.scrollLeft < 5)
  if (await page.$('.route-scroll-button.is-previous') || !await page.$('.route-scroll-button.is-next')) {
    throw new Error('Route carousel arrows did not update at the starting edge')
  }
  await page.setViewport({ width: 320, height: 720, deviceScaleFactor: 1 })
  await new Promise((resolve) => setTimeout(resolve, 220))
  const narrowCarousel = await page.$eval('.route-chooser', (chooser) => {
    const chooserRect = chooser.getBoundingClientRect()
    const controls = [...chooser.querySelectorAll('.route-scroll-button, .route-chooser-close')].map((button) => button.getBoundingClientRect())
    return {
      contained: chooserRect.left >= 0 && chooserRect.right <= innerWidth,
      controlsContained: controls.every((rect) => rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
      bodyOverflow: document.body.scrollWidth > innerWidth + 1,
    }
  })
  if (!narrowCarousel.contained || !narrowCarousel.controlsContained || narrowCarousel.bodyOverflow) {
    throw new Error(`The route carousel breaks at 320px: ${JSON.stringify(narrowCarousel)}`)
  }
  await page.click('.route-chooser-close')

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('change-cards-session-v1'))
    session.activeRouteId = 'build-for-uncertainty'
    session.swarm = {
      ...session.swarm,
      40: { note: 'Treat the venue as a replaceable boundary.', visited: true, updatedAt: 1 },
      36: { note: 'Separate hosting, invitations and materials.', visited: true, updatedAt: 2 },
      24: { note: 'Run one reversible neighbourhood trial.', visited: true, updatedAt: 3 },
    }
    localStorage.setItem('change-cards-session-v1', JSON.stringify(session))
    sessionStorage.removeItem('change-cards-cache-v1')
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.table-card-shell[data-card-id="37"].is-route-next')
  await page.click('.table-card-shell[data-card-id="37"] .card-front')
  await page.waitForSelector('.response-editor')
  await page.waitForFunction(() => document.querySelector('.editor-spark button'))
  await page.type('.response-editor', 'If invitations fail, hosts phone one person and record why others declined.')
  await page.click('.response-submit')
  await page.waitForSelector('.route-ribbon.is-celebrating')
  await page.waitForSelector('.tabletop.has-active-route', { hidden: true, timeout: 3500 })
  const completionState = await page.evaluate(() => JSON.parse(localStorage.getItem('change-cards-session-v1')))
  if (completionState.activeRouteId !== null || !completionState.swarm?.[37]?.visited || completionState.dealtCardIds.length !== 40) {
    throw new Error(`Completing a route did not return cleanly to the table: ${JSON.stringify(completionState)}`)
  }

  if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(' | ')}`)
  console.log(JSON.stringify({
    routeChooser: true,
    partialDeckPreserved: true,
    missingCardsDealt: true,
    routeAwareSparks: true,
    routeLineage: true,
    progressAndNextStep: true,
    positionsRestored: true,
    fullDeckNoDuplicates: true,
    refreshPersistence: true,
    mobileScrollable: true,
    mouseAndKeyboardRouteScrolling: true,
    completionReturnsToTable: true,
  }, null, 2))
} finally {
  await browser.close()
}
