import { createShapeId, createBindingId, toRichText, Box } from 'tldraw'
import { CARDS, CATEGORIES, CURATED_ROUTES } from './catalog.js'
import { DEVELOP_X, CATALOGUE_X, CARD_W, CARD_H, changeCardProps, templateShapes, stationShapes, deckShapes, DECK_Y, workingPosition, legacyBoardState } from './model.js'
import { readIdentity, saveIdentity } from '../safari/collaboration/session-client.js'
import { focusShapes, canvasMotion } from '../safari/field-table/canvas-actions.js'

export const collectDevelopEntries = editor => editor.getCurrentPageShapes().filter(shape => shape.type === 'change-card' && !shape.props.template)
export const getCurrentAuthor = () => readIdentity() || saveIdentity('Explorer')
export const developmentShapes = editor => editor.getCurrentPageShapes().filter(shape => shape.meta.workshopStage === 'develop' || shape.type.startsWith('change-'))

function challengePreview(challenge) {
  const characters = Array.from(String(challenge || '').replace(/\s+/g, ' ').trim())
  return characters.length <= 220 ? characters.join('') : `${characters.slice(0, 219).join('').trimEnd()}…`
}

function nextWorkingPosition(editor) {
  const gap = 24, lastColumn = workingPosition(3).x + CARD_W
  const occupied = editor.getCurrentPageShapes().filter(shape => !shape.props.template && shape.type !== 'change-station')
    .map(shape => editor.getShapePageBounds(shape.id)).filter(box => box && box.x + box.w + gap > DEVELOP_X && box.x < lastColumn + gap)
  const overlaps = (position, box) => position.x < box.x + box.w + gap && position.x + CARD_W + gap > box.x
    && position.y < box.y + box.h + gap && position.y + CARD_H + gap > box.y
  // Reuse empty slots after cards are returned. Page bounds also account for
  // hand placements, rotation and cards nested in a group.
  for (let slot = 0; slot < Math.max(64, occupied.length * 4); slot++) {
    const position = workingPosition(slot)
    if (!occupied.some(box => overlaps(position, box))) return position
  }
  // A large drawing or frame may span many rows. Jump below it rather than
  // scanning an unbounded number of occupied slots.
  const first = workingPosition(0), rowHeight = workingPosition(4).y - first.y
  const bottom = Math.max(first.y, ...occupied.map(box => box.y + box.h))
  return workingPosition(Math.ceil((bottom + gap - first.y) / rowHeight) * 4)
}

// Decks are existing native station shapes with richer presentation, so older
// shared boards and the sync server do not need a new record type.
export const getDeckShapes = editor => editor.getCurrentPageShapes().filter(shape => shape.type === 'change-station' && shape.meta.developDeck)

export function getDeckState(editor, category) {
  const definition = CATEGORIES.find(item => item.id === category)
  const cards = category ? CARDS.filter(card => card.category === category) : CARDS
  const inPlay = new Set(collectDevelopEntries(editor).map(shape => shape.props.cardId))
  const remaining = cards.filter(card => !inPlay.has(card.id))
  return { category: definition || null, total: cards.length, remaining, drawn: cards.length - remaining.length,
    deck: getDeckShapes(editor).find(shape => shape.props.category === category) || null }
}

function pristineScaffold(editor, shape, original, pageId) {
  return shape && shape.isLocked && shape.type === original.type
    && editor.getBindingsInvolvingShape(shape.id).length === 0
    && (!shape.parentId || shape.parentId === pageId)
    && shape.x === original.x && shape.y === original.y && !shape.rotation
    && (shape.opacity === undefined || shape.opacity === 1)
    && Object.keys(original.props).every(key => JSON.stringify(shape.props[key]) === JSON.stringify(original.props[key]))
}

function migrateDecks(editor, challenge) {
  const page = editor.getCurrentPage()
  if (page.meta.developDecksVersion === 1) return false
  editor.run(() => {
    // Remove only untouched, canonical catalogue scaffolding. Unlocked, moved,
    // flipped, annotated, connected, duplicated or resized cards remain as saved.
    const retired = templateShapes().filter(original => pristineScaffold(editor, editor.getShape(original.id), original, page.id)).map(shape => shape.id)
    editor.deleteShapes(retired)
    const oldStations = stationShapes()
    for (const deck of deckShapes()) {
      const existing = editor.getShape(deck.id)
      if (!existing) editor.createShape(deck)
      else if (pristineScaffold(editor, existing, oldStations.find(shape => shape.id === deck.id), page.id)) {
        editor.updateShape({ ...deck, meta: { ...existing.meta, ...deck.meta } })
      } else if (!existing.meta.developDeck) {
        // A user-modified heading owns its record; the pile gets a different id.
        const id = `shape:change-deck-${deck.props.category}`
        if (!editor.getShape(id)) editor.createShape({ ...deck, id })
      }
    }
    const heading = editor.getShape('shape:develop-starting-idea')
    if (heading?.meta.startingIdea && heading.x === DEVELOP_X && heading.y === 40 && !editor.getBindingsInvolvingShape(heading.id).length
      && JSON.stringify(heading.props.richText) === JSON.stringify(toRichText(challengePreview(challenge)))) {
      editor.updateShape({ id: heading.id, type: heading.type, y: DECK_Y - 130 })
    }
    editor.updatePage({ id: page.id, meta: { ...page.meta, developDecksVersion: 1 } })
  }, { history: 'ignore', ignoreShapeLock: true })
  return true
}

export function initializeDevelop(editor, { challenge, legacy = null }) {
  const page = editor.getCurrentPage()
  if (editor.getInstanceState().isReadonly) return false
  const oldHeading = editor.getShape('shape:develop-heading')
  // Retire only the original scaffold; an edited heading is someone's work.
  if (oldHeading?.meta.safariScaffolding && !editor.getBindingsInvolvingShape(oldHeading.id).length && JSON.stringify(oldHeading.props.richText) === JSON.stringify(toRichText('Room for a different idea.'))) {
    editor.run(() => editor.deleteShapes([oldHeading.id]), { history: 'ignore' })
  }
  if (page.meta.developInitialized) return migrateDecks(editor, challenge)
  const imported = legacy ? legacyBoardState(legacy) : null
  const entries = imported?.entries || []
  const shapes = [...deckShapes(),
    { id: 'shape:develop-starting-idea', type: 'text', x: DEVELOP_X, y: DECK_Y - 130, props: { richText: toRichText(challengePreview(challenge)), font: 'sans', color: 'black', size: 'm', autoSize: false, w: 1250 }, meta: { workshopStage: 'develop', startingIdea: true } },
    ...entries.map((entry, i) => ({ id: `shape:change-initial-${entry.cardId}`, type: 'change-card', x: entry.x ?? workingPosition(i).x, y: entry.y ?? workingPosition(i).y,
      props: changeCardProps(entry.cardId, { note: entry.note || '', draft: entry.draft || '', face: entry.face || 'front' }),
      meta: { workshopStage: 'develop', developDrafting: Boolean(entry.draft), savedAt: entry.updatedAt || 0 } })),
  ]
  editor.run(() => {
    editor.createShapes(shapes.filter(shape => !editor.getShape(shape.id)))
    editor.updatePage({ id: page.id, meta: { ...page.meta, developInitialized: true, developDecksVersion: 1, developRoute: imported?.activeRouteId || '',
      developOrder: (imported?.scrapbookOrder || []).map(cardId => `shape:change-initial-${cardId}`) } })
  }, { history: 'ignore' })
  return true
}

export function showDevelop(editor, category = 'table', { animate = true, duration = 460 } = {}) {
  const inWorkingArea = shape => {
    const bounds = editor.getShapePageBounds(shape.id)
    return bounds && bounds.x >= 5700 && bounds.x < CATALOGUE_X
  }
  let shapes = category === 'all' || category === 'decks' ? getDeckShapes(editor)
    : category === 'cards' ? editor.getCurrentPageShapes().filter(shape => !shape.props.template && shape.type !== 'change-station' && !shape.meta.startingIdea
      && (shape.meta.workshopStage === 'develop' || shape.type === 'change-card' || inWorkingArea(shape)))
    : category === 'table' ? editor.getCurrentPageShapes().filter(shape => !shape.props.template && (
      shape.type === 'change-station' ? shape.meta.developDeck
        : shape.meta.workshopStage === 'develop' || shape.type === 'change-card' || inWorkingArea(shape)))
      : getDeckShapes(editor).filter(shape => shape.props.category === category)
  if (category === 'cards' && !shapes.length) shapes = getDeckShapes(editor)
  const mobileCard = category !== 'all' && category !== 'decks' && editor.getViewportScreenBounds().w < 600
    ? shapes.find(shape => shape.type === 'change-card') || shapes.find(shape => shape.meta.developDeck) || shapes.find(shape => shape.props.evidence)
    : null
  if (shapes.length) focusShapes(editor, mobileCard ? [mobileCard] : shapes, { animate, duration })
  else editor.zoomToBounds(new Box(DEVELOP_X, DECK_Y - 130, 1470, 640), { inset: 80, animation: canvasMotion(editor, animate ? duration : 0) })
}

/** A physical deck does not deal a card already on the table, including routes. */
export function drawFromDeck(editor, category, { author = getCurrentAuthor(), random = Math.random } = {}) {
  if (editor.getInstanceState().isReadonly) return null
  const state = getDeckState(editor, category)
  if (!state.remaining.length) return null
  const sample = Number(random())
  const index = Math.min(state.remaining.length - 1, Math.max(0, Math.floor((Number.isFinite(sample) ? sample : 0) * state.remaining.length)))
  const card = state.remaining[index]
  const deck = getDeckState(editor, card.category).deck
  const id = createShapeId()
  editor.markHistoryStoppingPoint('draw-from-deck')
  editor.createShape({ id, type: 'change-card', ...nextWorkingPosition(editor),
    props: changeCardProps(card.id, { authorId: author.id, authorName: author.name }),
    meta: { workshopStage: 'develop', drawnFromDeck: card.category, developDrawnAt: Date.now() } })
  return { shape: editor.getShape(id), deck }
}

export function drawChangeCard(editor, cardId, { author = getCurrentAuthor(), copy = null, face = 'back', reuseUnowned = true } = {}) {
  if (editor.getInstanceState().isReadonly || !CARDS.some(card => card.id === cardId)) return null
  const existing = collectDevelopEntries(editor).find(shape => shape.props.cardId === cardId && (reuseUnowned && !shape.props.authorId || shape.props.authorId === author.id))
  if (existing && !copy) {
    editor.updateShape({ id: existing.id, type: existing.type, props: { face, authorId: author.id, authorName: author.name } })
    focusShapes(editor, [existing]); return existing.id
  }
  const id = createShapeId()
  const shape = { id, type: 'change-card', ...nextWorkingPosition(editor),
    props: changeCardProps(cardId, { face, authorId: author.id, authorName: author.name, ...(copy ? { draft: copy.props.note || copy.props.draft, sparks: copy.props.sparks } : {}) }),
    meta: { workshopStage: 'develop', developDrafting: Boolean(copy), ...(copy ? { basedOnCard: copy.id } : {}) } }
  editor.markHistoryStoppingPoint('draw-change-card')
  editor.createShape(shape); focusShapes(editor, [editor.getShape(id)])
  return id
}

export function buildFromEvidence(editor, shape) {
  if (editor.getInstanceState().isReadonly || !shape?.props.evidence?.card) return null
  const id = `shape:develop-evidence-${shape.props.evidence.card.id}`
  const existing = editor.getShape(id)
  editor.markHistoryStoppingPoint('build-on-evidence')
  editor.updateShape({ id: shape.id, type: shape.type, meta: { ...shape.meta, safariKept: true } })
  if (existing) { editor.updateShape({ id: existing.id, type: existing.type, meta: { ...existing.meta, safariKept: true } }); return editor.getShape(id) }
  const count = editor.getCurrentPageShapes().filter(item => item.meta.developmentSeed).length
  const copy = { id, type: 'safari-evidence-card', x: DEVELOP_X - 500, y: 320 + count * 405,
    props: { w: shape.props.w, h: shape.props.h, evidence: structuredClone(shape.props.evidence) }, meta: { workshopStage: 'develop', developmentSeed: true, originShapeId: shape.id, safariKept: true } }
  editor.createShape(copy)
  return editor.getShape(id)
}

const routeHeader = shape => shape.type === 'text' && shape.meta.developRouteHeader
const routeShapeId = (routeId, authorId) => createShapeId(`change-route-${routeId}-${authorId}`)

/** Each person's route is a set of native records, not a shared camera or turn. */
export function getRouteState(editor, { author = getCurrentAuthor(), allowUnowned = true } = {}) {
  if (!editor) return null
  const headers = editor.getCurrentPageShapes().filter(shape => routeHeader(shape) && shape.meta.routeOwner === author.id)
  const header = headers.find(shape => shape.meta.routeActive)
  const routeId = header?.meta.routeId || (!headers.length ? editor.getCurrentPage().meta.developRoute : '')
  const route = CURATED_ROUTES.find(item => item.id === routeId)
  if (!route) return null
  const entries = collectDevelopEntries(editor)
  const cards = route.cardIds.map((cardId, index) => header
    ? editor.getShape(header.meta.routeShapeIds[index]) || null
    : entries.find(shape => shape.props.cardId === cardId && (shape.props.authorId === author.id || allowUnowned && !shape.props.authorId)) || null)
  return { route, header, cards }
}

export function nextRouteCard(state, savedId) {
  if (!state || !state.cards.some(shape => shape?.id === savedId)) return null
  const index = state.cards.findIndex(shape => shape?.id === savedId)
  return [...state.cards.slice(index + 1), ...state.cards.slice(0, index)].find(shape => shape && !shape.props.note.trim()) || null
}

export function showRoute(editor, state, options) {
  if (!state) return
  focusShapes(editor, [state.header, ...state.cards].filter(Boolean), options)
}

function routeBaseY(editor) {
  const workingBounds = editor.getCurrentPageShapes().filter(shape => !shape.props.template && shape.type !== 'change-station')
    .map(shape => editor.getShapePageBounds(shape.id)).filter(box => box && box.x < DEVELOP_X + 1780 && box.x + box.w > DEVELOP_X - 40)
  return Math.max(930, ...workingBounds.map(box => box.y + box.h + 180))
}

export function activateRoute(editor, routeId, { author = getCurrentAuthor(), reuseUnowned = true } = {}) {
  const route = CURATED_ROUTES.find(item => item.id === routeId)
  if (!route || editor.getInstanceState().isReadonly) return null
  const id = routeShapeId(routeId, author.id), previous = editor.getShape(id)
  const entries = collectDevelopEntries(editor), baseY = previous?.meta.routeBaseY ?? routeBaseY(editor)
  const ids = route.cardIds.map((_, index) => createShapeId(`${id.slice(6)}-step-${index + 1}`))
  const routeMeta = { workshopStage: 'develop', routeId, routeOwner: author.id, routeHeaderId: id }
  editor.markHistoryStoppingPoint('choose-change-route')
  editor.run(() => {
    // Active route is per person. Selecting one does not switch anyone else's
    // ribbon, and no camera data ever enters the shared document.
    for (const header of editor.getCurrentPageShapes().filter(shape => routeHeader(shape) && shape.meta.routeOwner === author.id && shape.id !== id)) {
      editor.updateShape({ id: header.id, type: header.type, meta: { ...header.meta, routeActive: false } })
    }
    if (previous) editor.updateShape({ id, type: previous.type, meta: { ...previous.meta, routeActive: true } })
    else editor.createShape({ id, type: 'text', x: DEVELOP_X, y: baseY,
      props: { richText: toRichText(`${route.name}\n${author.name === 'Explorer' ? 'Four moves. Follow the thread.' : `${author.name}’s route · four moves.`}`), font: 'draw', color: 'violet', size: 'l', autoSize: false, w: 1680 },
      meta: { ...routeMeta, developRouteHeader: true, routeActive: true, routeBaseY: baseY, routeShapeIds: ids } })
    route.cardIds.forEach((cardId, index) => {
      if (!editor.getShape(ids[index])) {
        // A route has its own working copies. Earlier work stays where it was,
        // and another participant's writing is never claimed or overwritten.
        const source = entries.filter(shape => shape.props.cardId === cardId && (shape.props.authorId === author.id || reuseUnowned && !shape.props.authorId))
          .sort((a, b) => (b.meta.savedAt || 0) - (a.meta.savedAt || 0))[0]
        editor.createShape({ id: ids[index], type: 'change-card', x: DEVELOP_X + index * 460, y: baseY + 180,
          props: changeCardProps(cardId, { authorId: author.id, authorName: author.name, ...(source ? { note: source.props.note, draft: source.props.draft, sparks: [...source.props.sparks], face: source.props.note ? 'back' : 'front' } : {}) }),
          meta: { ...routeMeta, routeStep: index + 1, ...(source ? { basedOnCard: source.id, developDrafting: Boolean(source.meta.developDrafting), savedAt: source.meta.savedAt || 0 } : {}) } })
      }
      const labelId = createShapeId(`${id.slice(6)}-label-${index + 1}`)
      if (!editor.getShape(labelId)) editor.createShape({ id: labelId, type: 'text', x: DEVELOP_X + index * 460, y: baseY + 122,
        props: { richText: toRichText(`0${index + 1} / ${index === 0 ? 'Start here' : index === 3 ? 'A new direction' : 'Keep going'}`), font: 'draw', color: 'violet', size: 's', autoSize: false, w: CARD_W }, meta: routeMeta })
      if (index === 0) return
      const arrowId = createShapeId(`${id.slice(6)}-arrow-${index}`)
      const left = editor.getShape(ids[index - 1]), right = editor.getShape(ids[index])
      if (!editor.getShape(arrowId)) editor.createShape({ id: arrowId, type: 'arrow', x: left.x + CARD_W, y: left.y + CARD_H / 2,
        props: { start: { x: 0, y: 0 }, end: { x: right.x - left.x - CARD_W, y: right.y - left.y }, bend: index % 2 ? -24 : 24, color: 'violet', dash: 'draw', size: 'm', arrowheadStart: 'none', arrowheadEnd: 'arrow' }, meta: routeMeta })
      for (const [terminal, card, x] of [['start', left, 1], ['end', right, 0]]) {
        const bindingId = createBindingId(`${id.slice(6)}-${index}-${terminal}`)
        if (!editor.getBinding(bindingId)) editor.createBinding({ id: bindingId, type: 'arrow', fromId: arrowId, toId: card.id,
          props: { terminal, normalizedAnchor: { x, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' } })
      }
    })
  })
  return getRouteState(editor, { author, allowUnowned: reuseUnowned })
}

export function leaveRoute(editor, { author = getCurrentAuthor() } = {}) {
  if (editor.getInstanceState().isReadonly) return
  const state = getRouteState(editor, { author })
  if (state?.header) editor.updateShape({ id: state.header.id, type: state.header.type, meta: { ...state.header.meta, routeActive: false } })
  else {
    const page = editor.getCurrentPage()
    editor.updatePage({ id: page.id, meta: { ...page.meta, developRoute: '' } })
  }
}

export function changeCardMarkdown(shape) {
  const card = CARDS.find(item => item.id === shape.props.cardId)
  if (!card) return ''
  const { note, draft, authorName, sparks } = shape.props
  return `### ${card.title}\n\n${card.provocation}\n\n${note ? `${authorName && authorName !== 'Explorer' ? `**${authorName}’s idea:** ` : ''}${note}\n\n` : ''}${draft && draft !== note ? `**Unfinished draft:** ${draft}\n\n` : ''}${sparks?.length ? `**Optional AI sparks:** ${sparks.join(' · ')}\n\n` : ''}`
}

export function developMarkdown(editor, challenge) {
  const order = editor.getCurrentPage().meta.developOrder || []
  const entries = collectDevelopEntries(editor).filter(shape => shape.props.note || shape.props.draft || shape.props.sparks.length)
    .sort((a, b) => (order.indexOf(a.id) < 0 ? 9999 : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? 9999 : order.indexOf(b.id)))
  return `## Develop — Change Cards\n\n${challenge}\n\n${entries.map(changeCardMarkdown).join('')}`
}
