import test from 'node:test'
import assert from 'node:assert/strict'
import { CARDS, CURATED_ROUTES, CATEGORIES, cardArtwork } from '../src/develop/catalog.js'
import { CARD_W, CARD_H, DEVELOP_X, CATALOGUE_X, legacyEntries, legacyBoardState, templateShapes, stationShapes } from '../src/develop/model.js'
import { buildSparkPayload, sparkCacheKey } from '../src/develop/ai.js'

test('all 40 stable card IDs, artwork and five four-card routes survive extraction', () => {
  assert.deepEqual(CARDS.map(card => card.id), Array.from({ length: 40 }, (_, index) => index + 1))
  for (const category of CATEGORIES) assert.equal(CARDS.filter(card => card.category === category.id).length, 10)
  assert.equal(CARDS.find(card => card.id === 40).title, 'Move the Boundary')
  assert.equal(cardArtwork(CARDS[0]).src, '/icons/change-cards/01-borrow-a-brain.png')
  assert.deepEqual(cardArtwork(CARDS[39]), { src: '/icons/change-cards/17-40-doodles.png', spriteIndex: 23 })
  assert.equal(cardArtwork(99), null)
  assert.deepEqual(CURATED_ROUTES.map(route => route.cardIds), [[13, 7, 14, 15], [19, 4, 29, 31], [6, 22, 20, 8], [23, 30, 32, 34], [40, 36, 24, 37]])
})

test('legacy migration preserves returned cards, saved notes, newer drafts, route and scrapbook order without modifying the source', () => {
  const session = {
    idea: 'A public library for everyone', dealtCardIds: [13, 7, 7, 999], activeRouteId: 'assumption-to-evidence',
    swarm: { 13: { note: 'Saved idea', visited: true, updatedAt: 100 }, 40: { note: 'Returned to the deck', visited: true, updatedAt: 200 } },
    drafts: { 13: 'Newer unfinished edit', 24: 'Undealt draft', 999: 'Unknown card' },
    scrapbookOrder: [13, 40, 13], cardPositions: { 13: { x: 20, y: 30 }, 7: { x: Infinity, y: -20 } },
  }
  const before = structuredClone(session)
  const board = legacyBoardState(session)
  assert.deepEqual(board.entries.map(entry => entry.cardId), [13, 7, 40, 24])
  assert.equal(board.challenge, session.idea)
  assert.equal(board.activeRouteId, session.activeRouteId)
  assert.deepEqual(board.scrapbookOrder, [13, 40])
  const edited = board.entries.find(entry => entry.cardId === 13)
  assert.equal(edited.note, 'Saved idea')
  assert.equal(edited.draft, 'Newer unfinished edit')
  assert.equal(edited.face, 'back')
  assert.equal(edited.visited, true)
  assert.equal(edited.scrapbookIndex, 0)
  assert.ok(edited.x >= DEVELOP_X && edited.x < CATALOGUE_X)
  assert.ok(board.entries.every(entry => Number.isFinite(entry.x) && Number.isFinite(entry.y)))
  assert.deepEqual(session, before)
  assert.deepEqual(legacyEntries({ dealtCardIds: null, drafts: null, swarm: null }), [])
  assert.equal(legacyBoardState({ activeRouteId: 'unknown' }).activeRouteId, null)
})

test('catalogue stations and templates have deterministic separate IDs and no overlapping cards', () => {
  const templates = templateShapes()
  assert.equal(templates.length, 40)
  assert.equal(stationShapes().length, 4)
  assert.equal(new Set([...templates, ...stationShapes()].map(shape => shape.id)).size, 44)
  assert.deepEqual(templateShapes(), templates)
  assert.ok(templates.every(shape => shape.props.template && shape.props.note === '' && shape.x >= CATALOGUE_X))
  for (let i = 0; i < templates.length; i++) for (let j = i + 1; j < templates.length; j++) {
    const a = templates[i], b = templates[j]
    assert.ok(a.x + CARD_W <= b.x || b.x + CARD_W <= a.x || a.y + CARD_H <= b.y || b.y + CARD_H <= a.y, `Cards ${a.props.cardId}/${b.props.cardId} overlap`)
  }
})

test('sparks retain ordered route lineage and source limitations within the existing 20-entry context limit', () => {
  const route = CURATED_ROUTES[0]
  const evidence = { card: { id: 'people_1', title: 'Time matters', finding: 'Participants reported time constraints.', sourceId: 'source_1', limitation: 'Small survey.', transferCaution: 'Different population.' }, source: { id: 'source_1', title: 'Study', url: 'https://example.org/study' } }
  const entries = [
    { props: { cardId: 13, note: 'Test the premise.', template: false } },
    { cardId: 7, note: 'Try one session.' },
    { cardId: 14, note: 'Prototype next week.' },
    { cardId: 13, note: 'Ignore this catalogue template.', template: true },
  ]
  const payload = buildSparkPayload({ challenge: 'A library', card: CARDS.find(card => card.id === 15), entries, route, evidence: [evidence] })
  assert.equal(payload.routeStep, 4)
  assert.equal(payload.routeLength, 4)
  assert.deepEqual(payload.previousRouteResponses.map(item => item.response), ['Test the premise.', 'Try one session.', 'Prototype next week.'])
  assert.equal(payload.previousTransformations[0].kind, 'evidence')
  assert.equal(payload.previousTransformations[0].evidence.sourceUrl, evidence.source.url)
  assert.equal(payload.previousTransformations[0].evidence.limitation, 'Small survey.')
  assert.equal(payload.previousTransformations[0].evidence.transferCaution, 'Different population.')
  assert.equal(payload.originalIdea, 'A library')
  assert.equal(payload.currentIdea, 'A library')
  const bounded = buildSparkPayload({ challenge: 'A library', card: CARDS[0], entries: Array.from({ length: 40 }, (_, index) => ({ cardId: index + 1, note: `Idea ${index}` })), evidence: Array.from({ length: 12 }, () => evidence) })
  assert.equal(bounded.previousTransformations.length, 20)
  assert.equal(bounded.previousTransformations.filter(item => item.kind === 'evidence').length, 4)
})

test('spark cache identity changes with writing, route progress and evidence, but is deterministic', () => {
  const base = { challenge: 'A library', card: CARDS[0], entries: [{ cardId: 13, note: 'Try one session.' }] }
  const payload = buildSparkPayload(base)
  const key = sparkCacheKey(payload)
  assert.equal(sparkCacheKey(buildSparkPayload(base)), key)
  assert.notEqual(sparkCacheKey(buildSparkPayload({ ...base, entries: [{ cardId: 13, note: 'Try two sessions.' }] })), key)
  assert.notEqual(sparkCacheKey({ ...payload, routeId: 'assumption-to-evidence', routeStep: 1 }), key)
  assert.notEqual(sparkCacheKey(buildSparkPayload({ ...base, evidence: [{ card: { id: 'p1', finding: 'A finding' }, source: { url: 'https://example.org' } }] })), key)
  assert.match(key, /^sparks-luna-v4::Borrow a Brain::/)
})
