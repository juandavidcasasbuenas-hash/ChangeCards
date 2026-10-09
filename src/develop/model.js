import { CARDS, CATEGORIES, CURATED_ROUTES } from './catalog.js'

export const DEVELOP_X = 6400
export const CATALOGUE_X = 8800
export const CARD_W = 300
export const CARD_H = 430
export const DECK_Y = -550
export const WORKSPACE_W = 2000
export const WORKSPACE_H = 2400
export const STATION_W = 1640
export const STATION_H = 1110
export const STATION_HEADER_H = 140
const CARD_GAP = 30
const knownCardIds = new Set(CARDS.map(card => card.id))

export function stationPosition(category) {
  const id = typeof category === 'object' ? category?.id : category
  const index = Math.max(0, CATEGORIES.findIndex(item => item.id === id))
  return { x: CATALOGUE_X + (index % 2) * (STATION_W + 180), y: Math.floor(index / 2) * (STATION_H + 160) }
}

export function templatePosition(card) {
  const position = stationPosition(card.category)
  const index = CARDS.filter(item => item.category === card.category).findIndex(item => item.id === card.id)
  return {
    x: position.x + (Math.max(0, index) % 5) * (CARD_W + CARD_GAP),
    y: position.y + STATION_HEADER_H + Math.floor(Math.max(0, index) / 5) * (CARD_H + CARD_GAP),
  }
}

export function workingPosition(index = 0) {
  const safeIndex = Math.max(0, Math.floor(index))
  return { x: DEVELOP_X + (safeIndex % 4) * (CARD_W + 64), y: 320 + Math.floor(safeIndex / 4) * (CARD_H + 70) }
}

export const templateShapeId = cardId => `shape:change-template-${cardId}`
export const stationShapeId = category => `shape:change-station-${typeof category === 'object' ? category.id : category}`

export function deckPosition(category) {
  const id = typeof category === 'object' ? category?.id : category
  const index = Math.max(0, CATEGORIES.findIndex(item => item.id === id))
  return { x: DEVELOP_X + index * (CARD_W + 90), y: DECK_Y }
}

export function deckShapes() {
  return CATEGORIES.map(category => ({
    id: stationShapeId(category), type: 'change-station', ...deckPosition(category), isLocked: true,
    props: { w: CARD_W, h: CARD_H, category: category.id },
    meta: { workshopStage: 'develop', developDeck: true },
  }))
}

export function changeCardProps(cardId, overrides = {}) {
  return { w: CARD_W, h: CARD_H, cardId, face: 'front', note: '', draft: '', authorId: '', authorName: '', template: false, sparks: [], ...overrides }
}

export function templateShapes() {
  return CARDS.map(card => ({
    id: templateShapeId(card.id), type: 'change-card', ...templatePosition(card),
    props: changeCardProps(card.id, { template: true }),
  }))
}

export function stationShapes() {
  return CATEGORIES.map(category => ({
    id: stationShapeId(category), type: 'change-station', ...stationPosition(category),
    props: { w: STATION_W, h: STATION_HEADER_H, category: category.id },
  }))
}

const validId = value => knownCardIds.has(Number(value)) ? Number(value) : null
const text = value => typeof value === 'string' ? value : ''
const finite = value => typeof value === 'number' && Number.isFinite(value)

// Returning a card to the old deck removed its position, not its saved writing.
// Import the union, leave the original session untouched, and retain both a saved
// note and its newer unfinished draft when the user has started editing again.
export function legacyEntries(session = {}) {
  const dealt = Array.isArray(session.dealtCardIds) ? session.dealtCardIds : []
  const notes = session.swarm && typeof session.swarm === 'object' ? session.swarm : {}
  const drafts = session.drafts && typeof session.drafts === 'object' ? session.drafts : {}
  const ids = [...new Set([...dealt, ...Object.keys(notes), ...Object.keys(drafts)].map(validId).filter(id => id !== null))]
  const order = legacyScrapbookOrder(session)
  return ids.map((cardId, index) => {
    const saved = notes[cardId] || {}
    const note = text(saved.note)
    const draft = text(drafts[cardId])
    const visited = Boolean(saved.visited)
    const oldPosition = session.cardPositions?.[cardId]
    const fallback = workingPosition(index)
    const x = finite(oldPosition?.x) ? DEVELOP_X + Math.max(0, Math.min(100, oldPosition.x)) / 100 * (WORKSPACE_W - CARD_W) : fallback.x
    const y = finite(oldPosition?.y) ? 320 + Math.max(0, Math.min(100, oldPosition.y)) / 100 * (WORKSPACE_H - CARD_H - 320) : fallback.y
    return { cardId, note, draft, visited, updatedAt: finite(saved.updatedAt) ? saved.updatedAt : 0, scrapbookIndex: order.indexOf(cardId), x, y, face: visited || draft ? 'back' : 'front' }
  })
}

export function legacyScrapbookOrder(session = {}) {
  const notes = session.swarm || {}
  const savedIds = CARDS.filter(card => notes[card.id]?.visited).map(card => card.id)
  const specified = Array.isArray(session.scrapbookOrder) ? session.scrapbookOrder.map(validId).filter(id => savedIds.includes(id)) : []
  const remaining = savedIds.filter(id => !specified.includes(id)).sort((a, b) => (notes[b]?.updatedAt || 0) - (notes[a]?.updatedAt || 0))
  return [...new Set([...specified, ...remaining])]
}

export function legacyBoardState(session = {}) {
  return {
    challenge: text(session.idea), entries: legacyEntries(session), scrapbookOrder: legacyScrapbookOrder(session),
    activeRouteId: CURATED_ROUTES.some(route => route.id === session.activeRouteId) ? session.activeRouteId : null,
  }
}
