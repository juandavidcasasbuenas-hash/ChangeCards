import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Box, ArrowShapeUtil, TextShapeUtil, toRichText } from 'tldraw'
import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas, DocumentRecordType, PageRecordType } from '@tldraw/tlschema'
import { CARDS, CURATED_ROUTES } from '../src/develop/catalog.js'
import { templateShapes, stationShapes, deckShapes, deckPosition, changeCardProps, workingPosition, DEVELOP_X, CATALOGUE_X, CARD_W, WORKSPACE_W } from '../src/develop/model.js'
import { buildSparkPayload, sparkCacheKey } from '../src/develop/ai.js'
import { evidencePayload, richTextPlainText } from '../src/safari/field-table/canvas-model.js'
import { safariShapeSchemas } from '../shared/safari-shapes.mjs'
import { MAX_RECORD_BYTES, prepareSharedBoard } from '../shared/safari-session.mjs'
import { initializeDevelop, getDeckShapes, getDeckState, drawFromDeck, buildFromEvidence, collectDevelopEntries, drawChangeCard, activateRoute, getRouteState, nextRouteCard, showRoute, leaveRoute, showDevelop, developMarkdown } from '../src/develop/canvas-actions.js'

const evidence = JSON.parse(fs.readFileSync(new URL('../public/safari/example/workshop.json', import.meta.url)))
const schema = createTLSchema({ shapes: { ...defaultShapeSchemas, ...safariShapeSchemas }, bindings: defaultBindingSchemas })
const legacy = () => ({
  idea: 'Make a workshop useful for science communicators.', dealtCardIds: [1, 2, '999'],
  swarm: { 1: { note: 'Begin with their own communication problem.', visited: true, updatedAt: 2 }, 7: { note: 'Test a one-hour format.', visited: true, updatedAt: 4 } },
  drafts: { 1: 'A newer unfinished thought.', 14: 'Make a paper prototype.', 999: 'Not a real card.' },
  scrapbookOrder: [7, 1], activeRouteId: CURATED_ROUTES[0].id,
  cardPositions: { 1: { x: 12, y: 36 }, 2: { x: 200, y: -10 } },
})

// The editor facade retains actual shape records and camera bounds. It lets the
// production actions run without DOM rendering; schema/protocol validation is
// also covered below and in safari-sharing.test.mjs.
function editorWith(initial = []) {
  const shapes = new Map(initial.map(shape => [shape.id, structuredClone({ meta: {}, ...shape })]))
  const bindings = new Map()
  let page = { id: 'page:workshop', meta: {} }, readonly = false, ignoreShapeLock = false
  const editor = {
    shapes, bindings, focusedBounds: null,
    getCurrentPage: () => page,
    getCurrentPageShapes: () => [...shapes.values()],
    getShape: id => shapes.get(id),
    getBinding: id => bindings.get(id),
    getBindingsInvolvingShape: id => [...bindings.values()].filter(binding => binding.fromId === id || binding.toId === id),
    createBinding: binding => { bindings.set(binding.id, structuredClone(binding)); return editor },
    getInstanceState: () => ({ isReadonly: readonly }),
    setReadonly: value => { readonly = value },
    run: (callback, options) => { const previous = ignoreShapeLock; ignoreShapeLock = options?.ignoreShapeLock ?? previous; try { return callback() } finally { ignoreShapeLock = previous } },
    createShape: shape => { shapes.set(shape.id, structuredClone({ meta: {}, parentId: page.id, ...shape })); return editor },
    createShapes: records => { records.forEach(editor.createShape); return editor },
    updatePage: patch => { page = { ...page, ...structuredClone(patch) }; return editor },
    updateShape: patch => { const old = shapes.get(patch.id); if (old?.isLocked && !ignoreShapeLock && patch.isLocked !== false) return editor; shapes.set(patch.id, { ...old, ...patch, props: { ...old.props, ...patch.props } }); return editor },
    deleteShape: id => { if (shapes.get(id)?.isLocked && !ignoreShapeLock) return editor; shapes.delete(id); for (const [key, binding] of bindings) if (binding.toId === id || binding.fromId === id) bindings.delete(key); return editor },
    deleteShapes: ids => { ids.forEach(editor.deleteShape); return editor },
    markHistoryStoppingPoint() {},
    getShapePageBounds: id => { const shape = shapes.get(id); return shape ? new Box(shape.x || 0, shape.y || 0, shape.props.w || 300, shape.props.h || 150) : null },
    getViewportScreenBounds: () => new Box(0, 0, 1400, 900),
    getContainer: () => null,
    updateViewportScreenBounds: () => editor,
    getContainerWindow: () => ({ matchMedia: () => ({ matches: true }) }),
    setCurrentTool: () => editor,
    selectNone: () => editor,
    zoomToBounds: bounds => { editor.focusedBounds = bounds; return editor },
  }
  return editor
}

test('initializing a native board imports saved writing and drafts once; reopening never restores deleted cards or overwrites edits', () => {
  const session = legacy(), original = structuredClone(session)
  const editor = editorWith()
  assert.equal(initializeDevelop(editor, { challenge: session.idea, legacy: session }), true)
  const entries = collectDevelopEntries(editor)
  assert.deepEqual(new Set(entries.map(entry => entry.props.cardId)), new Set([1, 2, 7, 14]))
  const first = entries.find(entry => entry.props.cardId === 1), returned = entries.find(entry => entry.props.cardId === 7)
  assert.equal(first.props.note, session.swarm[1].note)
  assert.equal(first.props.draft, session.drafts[1])
  assert.equal(first.props.face, 'back')
  assert.equal(returned.props.note, session.swarm[7].note)
  assert.equal(entries.find(entry => entry.props.cardId === 14).props.draft, session.drafts[14])
  assert.deepEqual(editor.getCurrentPage().meta.developOrder, [returned.id, first.id])
  assert.equal(editor.getCurrentPage().meta.developRoute, session.activeRouteId)
  assert.equal(entries.find(entry => entry.props.cardId === 2).x, DEVELOP_X + WORKSPACE_W - CARD_W)
  editor.deleteShape(returned.id)
  editor.updateShape({ id: first.id, x: 7123, props: { note: 'A later workshop edit.' } })
  const beforeReopen = structuredClone(editor.getCurrentPageShapes())
  assert.equal(initializeDevelop(editor, { challenge: session.idea, legacy: session }), false)
  assert.deepEqual(editor.getCurrentPageShapes(), beforeReopen)
  assert.equal(editor.getShape(returned.id), undefined)
  assert.deepEqual(session, original)
  const readonlyEditor = editorWith()
  readonlyEditor.setReadonly(true)
  assert.equal(initializeDevelop(readonlyEditor, { challenge: session.idea }), false)
  assert.equal(readonlyEditor.getCurrentPageShapes().length, 0)
})

test('native Change Card catalogue records validate against the same schema used by the sync server', () => {
  const page = PageRecordType.create({ id: 'page:test', name: 'Workshop', index: 'a1' })
  const templates = templateShapes(), stations = [...stationShapes(), ...deckShapes().map(shape => ({ ...shape, id: `shape:deck-test-${shape.props.category}` }))]
  assert.equal(new Set(templates.map(shape => shape.props.cardId)).size, CARDS.length)
  assert.equal(new Set([...templates, ...stations].map(shape => shape.id)).size, templates.length + stations.length)
  for (const shape of [...templates, ...stations]) {
    const record = schema.types.shape.create({ ...shape, parentId: page.id, index: 'a1' })
    assert.equal(schema.types.shape.validate(record), record)
  }
})

test('a long or multiline challenge stays compact on the table while the complete question remains exportable', () => {
  const challenge = ('A long workshop challenge\n\nwith more context. ').repeat(30)
  const editor = editorWith()
  initializeDevelop(editor, { challenge })
  const display = richTextPlainText(editor.getShape('shape:develop-starting-idea').props.richText)
  assert.ok(Array.from(display).length <= 220)
  assert.ok(display.endsWith('…'))
  assert.equal(display.includes('\n'), false, 'pasted line breaks must not push the starting cards down')
  assert.ok(developMarkdown(editor, challenge).includes(challenge), 'the complete challenge is retained outside the canvas preview')
})

test('evidence-to-Develop keeps the original untouched and source limitations available to sparks and card exports', () => {
  const payload = evidencePayload(evidence, evidence.cards[0]), original = structuredClone(payload)
  const sourceShape = { id: 'shape:original-finding', type: 'safari-evidence-card', x: 50, y: 160, props: { w: 348, h: 348, evidence: payload }, meta: { safariKept: false } }
  const editor = editorWith([sourceShape])
  const copied = buildFromEvidence(editor, editor.getShape(sourceShape.id))
  assert.notEqual(copied.id, sourceShape.id)
  assert.deepEqual(copied.props.evidence, original)
  assert.equal(copied.meta.originShapeId, sourceShape.id)
  assert.equal(copied.meta.workshopStage, 'develop')
  assert.equal(copied.meta.developmentSeed, true)
  assert.deepEqual(editor.getShape(sourceShape.id).props.evidence, original)
  assert.equal(editor.getShape(sourceShape.id).x, 50)
  assert.equal(editor.getShape(sourceShape.id).meta.safariKept, true, 'a finding used in Develop also appears in the Discover kept shelf')
  assert.equal(buildFromEvidence(editor, sourceShape).id, copied.id)
  assert.equal(editor.getCurrentPageShapes().filter(shape => shape.meta.developmentSeed).length, 1)
  const card = CARDS.find(item => item.id === 14)
  const inputs = { challenge: evidence.challenge, card, entries: [{ props: changeCardProps(7, { note: 'Try an hour over lunch.' }) }], route: CURATED_ROUTES.find(route => route.id === 'assumption-to-evidence') }
  const request = buildSparkPayload({ ...inputs, evidence: [copied] })
  const research = request.previousTransformations.find(item => item.kind === 'evidence')
  assert.equal(research.evidence.sourceUrl, payload.source.url)
  assert.equal(research.evidence.transferCaution, payload.card.transferCaution)
  assert.equal(research.evidence.limitation, payload.card.limitation)
  assert.match(research.shift, /not a user proposal or a proven intervention/)
  assert.ok(request.previousTransformations.some(item => item.idea === 'Try an hour over lunch.' && item.kind !== 'evidence'))
  assert.equal(request.routeStep, 3)
  assert.ok(request.previousRouteResponses.some(item => item.response === 'Try an hour over lunch.'))
  const other = buildSparkPayload({ ...inputs, evidence: [evidencePayload(evidence, evidence.cards[1])] })
  assert.notEqual(sparkCacheKey(request), sparkCacheKey(other))
  assert.deepEqual(payload, original)
  initializeDevelop(editor, { challenge: evidence.challenge })
  const working = editor.getShape(drawChangeCard(editor, 14, { author: { id: 'alex', name: 'Alex' } }))
  editor.updateShape({ id: working.id, props: { note: 'An hour over lunch.', draft: 'Next: test the time.', sparks: ['A six-person pilot'], authorName: 'Alex' } })
  const exported = developMarkdown(editor, evidence.challenge)
  for (const value of ['An hour over lunch.', 'Unfinished draft', 'Next: test the time.', 'Optional AI sparks', 'A six-person pilot', 'Alex']) assert.ok(exported.includes(value))
  copied.props.evidence.card.title = 'A local copy edit'
  assert.equal(editor.getShape(sourceShape.id).props.evidence.card.title, original.card.title)
})

test('Develop navigation focuses its own categories and working area without changing document state', () => {
  const editor = editorWith([{ id: 'shape:discovery', type: 'safari-evidence-card', x: 10, y: 10, props: { w: 348, h: 348, evidence: evidencePayload(evidence, evidence.cards[0]) } }])
  initializeDevelop(editor, { challenge: evidence.challenge })
  const before = structuredClone({ page: editor.getCurrentPage(), shapes: editor.getCurrentPageShapes() })
  for (const category of ['table', 'multidisciplinary', 'all']) {
    showDevelop(editor, category, { animate: false })
    assert.ok(editor.focusedBounds.x >= DEVELOP_X, `${category} included evidence from the Discover area`)
    assert.deepEqual({ page: editor.getCurrentPage(), shapes: editor.getCurrentPageShapes() }, before)
  }
})

test('Your table includes untagged native annotations but excludes the catalogue and Discover area', () => {
  const native = [
    { id: 'shape:sketch', type: 'draw', x: 5750, y: 1500, props: { w: 180, h: 300 } },
    { id: 'shape:connection', type: 'arrow', x: 8250, y: 700, props: { w: 100, h: 200 } },
    { id: 'shape:annotation', type: 'text', x: 8500, y: 1600, props: { w: 220, h: 130 } },
  ]
  const editor = editorWith([...native, { id: 'shape:discover-note', type: 'note', x: 500, y: 0, props: { w: 200, h: 200 } }])
  initializeDevelop(editor, { challenge: evidence.challenge })
  showDevelop(editor, 'table', { animate: false })
  const focused = editor.focusedBounds
  for (const shape of native) {
    assert.ok(focused.x <= shape.x && focused.x + focused.w >= shape.x + shape.props.w)
    assert.ok(focused.y <= shape.y && focused.y + focused.h >= shape.y + shape.props.h)
  }
  assert.ok(focused.x >= 5700)
  assert.ok(focused.x + focused.w < CATALOGUE_X)
})

test('Your cards focuses working ideas and annotations without decks or the starting challenge; an empty table returns to the piles', () => {
  const editor = editorWith(), author = { id: 'alex', name: 'Alex' }
  initializeDevelop(editor, { challenge: 'Make a useful workshop.' })
  showDevelop(editor, 'cards', { animate: false })
  assert.deepEqual(editor.focusedBounds, Box.Common(getDeckShapes(editor).map(shape => editor.getShapePageBounds(shape.id))))
  const drawn = drawFromDeck(editor, undefined, { author, random: () => 0 }).shape
  const annotation = { id: 'shape:my-sketch', type: 'draw', x: 7100, y: 950, props: { w: 180, h: 170 } }
  editor.createShape(annotation)
  const route = activateRoute(editor, CURATED_ROUTES[0].id, { author })
  const before = structuredClone(editor.getCurrentPageShapes())
  showDevelop(editor, 'cards', { animate: false })
  const focused = editor.focusedBounds
  assert.ok(focused.y >= drawn.y, 'the challenge and piles must not reduce the card scale')
  for (const shape of [drawn, annotation, route.header, ...route.cards]) {
    const bounds = editor.getShapePageBounds(shape.id)
    assert.ok(focused.x <= bounds.x && focused.x + focused.w >= bounds.x + bounds.w)
    assert.ok(focused.y <= bounds.y && focused.y + focused.h >= bounds.y + bounds.h)
  }
  assert.deepEqual(editor.getCurrentPageShapes(), before)
})

test('phone navigation keeps the selected deck readable; all decks remain an explicit overview', () => {
  const editor = editorWith()
  initializeDevelop(editor, { challenge: evidence.challenge })
  editor.getViewportScreenBounds = () => new Box(0, 0, 390, 844)
  for (const category of ['table', 'ingenious']) {
    showDevelop(editor, category, { animate: false })
    const focused = editor.focusedBounds
    const target = getDeckShapes(editor).find(shape => category === 'table' || shape.props.category === category)
    assert.deepEqual(focused, editor.getShapePageBounds(target.id))
  }
  showDevelop(editor, 'all', { animate: false })
  assert.ok(editor.focusedBounds.w > CARD_W * 3)
})

test('drawing after deletion or manual movement uses a vacant slot without moving existing cards; route lanes avoid existing work', () => {
  const editor = editorWith(), author = { id: 'alice', name: 'Alice' }
  initializeDevelop(editor, { challenge: evidence.challenge })
  for (const cardId of [1, 5, 14]) drawChangeCard(editor, cardId, { author })
  const removed = collectDevelopEntries(editor).find(shape => shape.props.cardId === 5)
  editor.deleteShape(removed.id)
  const newId = drawChangeCard(editor, 6, { author })
  assert.equal(editor.getShape(newId).x, removed.x)
  assert.equal(editor.getShape(newId).y, removed.y)
  const moved = collectDevelopEntries(editor).find(shape => shape.props.cardId === 14)
  editor.updateShape({ id: moved.id, x: workingPosition(3).x - 30 })
  const before = structuredClone(collectDevelopEntries(editor))
  drawChangeCard(editor, 7, { author })
  activateRoute(editor, CURATED_ROUTES[0].id, { author })
  for (const previous of before) assert.deepEqual(editor.getShape(previous.id), previous)
  const boxes = collectDevelopEntries(editor).map(shape => editor.getShapePageBounds(shape.id))
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
  }
  // One large canvas object should not cause an unbounded search for a vacancy.
  const frame = { id: 'shape:large-frame', type: 'frame', x: DEVELOP_X - 50, y: 0, props: { w: WORKSPACE_W, h: 1000000 } }
  editor.createShape(frame)
  const belowId = drawChangeCard(editor, 40, { author })
  assert.ok(editor.getShape(belowId).y > frame.props.h)
})

test('legacy source-card findings can become native Develop evidence without leaking incompatible properties', () => {
  const source = { id: 'shape:old-source-card', type: 'safari-source-card', x: 500, y: 800,
    props: { w: 348, h: 600, findingShapeId: 'shape:deleted-original', evidence: evidencePayload(evidence, evidence.cards[0]) }, meta: {} }
  const editor = editorWith([source])
  const developed = buildFromEvidence(editor, editor.getShape(source.id))
  const record = schema.types.shape.create({ ...developed, index: 'a1' })
  assert.equal(schema.types.shape.validate(record), record)
  assert.equal(developed.props.findingShapeId, undefined)
  assert.deepEqual(developed.props.evidence, source.props.evidence)
  assert.deepEqual(editor.getShape(source.id).props, source.props)
})

test('shared participants get separate working copies while repeat draws preserve their own writing', () => {
  const editor = editorWith()
  initializeDevelop(editor, { challenge: evidence.challenge })
  editor.createShape({ id: 'shape:imported-unowned', type: 'change-card', ...workingPosition(0), props: changeCardProps(1) })
  const starter = editor.getShape('shape:imported-unowned')
  const alice = { id: 'alice', name: 'Alice' }, bob = { id: 'bob', name: 'Bob' }
  const aliceId = drawChangeCard(editor, 1, { author: alice, reuseUnowned: false })
  const bobId = drawChangeCard(editor, 1, { author: bob, reuseUnowned: false })
  assert.notEqual(aliceId, starter.id)
  assert.notEqual(aliceId, bobId)
  assert.equal(editor.getShape(aliceId).props.authorId, alice.id)
  assert.equal(editor.getShape(bobId).props.authorId, bob.id)
  editor.updateShape({ id: aliceId, props: { note: 'Alice’s workshop idea.' } })
  editor.updateShape({ id: bobId, props: { draft: 'Bob is still writing.' } })
  assert.equal(drawChangeCard(editor, 1, { author: alice, reuseUnowned: false }), aliceId)
  assert.equal(editor.getShape(aliceId).props.note, 'Alice’s workshop idea.')
  assert.equal(editor.getShape(bobId).props.draft, 'Bob is still writing.')
  assert.equal(editor.getShape(starter.id).props.authorId, '')
  const before = structuredClone(editor.getCurrentPageShapes())
  editor.setReadonly(true)
  assert.equal(drawChangeCard(editor, 5, { author: alice }), null)
  assert.deepEqual(editor.getCurrentPageShapes(), before)
})

test('sharing strips personal phase navigation and retains the initial record size bound for native Change Cards', () => {
  const page = PageRecordType.create({ id: 'page:test', name: 'Workshop', index: 'a1', meta: { workshopStage: 'develop', developCategory: 'flexible', developInitialized: true } })
  const card = schema.types.shape.create({ id: 'shape:test', type: 'change-card', parentId: page.id, index: 'a1', props: changeCardProps(1, { note: 'Our shared idea' }) })
  const document = DocumentRecordType.create({ id: 'document:document' })
  const snapshot = { store: Object.fromEntries([page, card, document].map(record => [record.id, record])), schema: schema.serialize() }
  const metadata = { id: 'develop-test', challenge: 'Our challenge', kind: 'develop', defaultStage: 'develop', status: 'complete', secret: 'must-not-travel' }
  const shared = prepareSharedBoard(metadata, snapshot)
  assert.equal(shared.snapshot.store[page.id].meta.workshopStage, undefined)
  assert.equal(shared.snapshot.store[page.id].meta.developCategory, undefined)
  assert.equal(shared.snapshot.store[page.id].meta.developInitialized, true)
  assert.equal(snapshot.store[page.id].meta.workshopStage, 'develop')
  assert.equal(shared.safari.defaultStage, 'develop')
  assert.equal(shared.safari.secret, undefined)
  const oversized = structuredClone(snapshot)
  oversized.store[card.id].props.note = 'a'.repeat(MAX_RECORD_BYTES)
  assert.throws(() => prepareSharedBoard(metadata, oversized), /too large/)
})


test('a curated route is four owned native cards joined by bound arrows; existing notes stay untouched and route records sync', () => {
  const editor = editorWith(), author = { id: 'alice', name: 'Alice' }, route = CURATED_ROUTES[0]
  initializeDevelop(editor, { challenge: evidence.challenge })
  const prior = { id: 'shape:prior-idea', type: 'change-card', x: DEVELOP_X, y: 1000,
    props: changeCardProps(route.cardIds[0], { note: 'Keep the earlier idea.', draft: 'A further thought.', authorId: author.id, authorName: author.name }), meta: { savedAt: 12 } }
  editor.createShape(prior)
  const before = structuredClone(editor.getCurrentPageShapes())
  const state = activateRoute(editor, route.id, { author, reuseUnowned: false })
  assert.deepEqual(state.cards.map(shape => shape.props.cardId), route.cardIds)
  assert.ok(state.cards.every(shape => shape.props.authorId === author.id))
  assert.ok(state.cards.every(shape => shape.y > prior.y + prior.props.h))
  assert.equal(state.cards[0].props.note, prior.props.note)
  assert.equal(state.cards[0].props.draft, prior.props.draft)
  assert.equal(state.cards[0].meta.basedOnCard, prior.id)
  for (const shape of before) assert.deepEqual(editor.getShape(shape.id), shape)
  const arrows = editor.getCurrentPageShapes().filter(shape => shape.type === 'arrow')
  assert.equal(arrows.length, 3)
  assert.equal(editor.bindings.size, 6)
  for (let index = 0; index < arrows.length; index++) {
    const bindings = [...editor.bindings.values()].filter(binding => binding.fromId === arrows[index].id)
    assert.equal(bindings.find(binding => binding.props.terminal === 'start').toId, state.cards[index].id)
    assert.equal(bindings.find(binding => binding.props.terminal === 'end').toId, state.cards[index + 1].id)
  }
  const arrowUtil = new ArrowShapeUtil(editor), textUtil = new TextShapeUtil(editor)
  for (const shape of editor.getCurrentPageShapes().filter(shape => shape.meta.routeHeaderId)) {
    const defaults = shape.type === 'arrow' ? arrowUtil.getDefaultProps() : shape.type === 'text' ? textUtil.getDefaultProps() : {}
    const record = schema.types.shape.create({ ...shape, props: { ...defaults, ...shape.props }, index: 'a1' })
    assert.equal(schema.types.shape.validate(record), record)
  }
  for (const binding of editor.bindings.values()) {
    const record = schema.types.binding.create(binding)
    assert.equal(schema.types.binding.validate(record), record)
  }
  showRoute(editor, state, { animate: false })
  assert.ok(editor.focusedBounds.w >= 1680)
  const snapshot = structuredClone(editor.getCurrentPageShapes())
  activateRoute(editor, route.id, { author })
  assert.deepEqual(editor.getCurrentPageShapes(), snapshot, 'revisiting a route must preserve manual positions and writing')
  assert.equal(editor.bindings.size, 6)
})

test('route completion chooses the next unfinished stop in order, wraps skipped cards, and stops after all four', () => {
  const editor = editorWith(), author = { id: 'alice', name: 'Alice' }
  const state = activateRoute(editor, CURATED_ROUTES[0].id, { author })
  const current = () => getRouteState(editor, { author })
  const save = index => editor.updateShape({ id: state.cards[index].id, props: { note: `Idea ${index + 1}` } })
  save(0)
  assert.equal(nextRouteCard(current(), state.cards[0].id).id, state.cards[1].id)
  save(2)
  assert.equal(nextRouteCard(current(), state.cards[2].id).id, state.cards[3].id)
  save(3)
  assert.equal(nextRouteCard(current(), state.cards[3].id).id, state.cards[1].id)
  save(1)
  assert.equal(nextRouteCard(current(), state.cards[1].id), null)
  assert.equal(nextRouteCard(current(), 'shape:outside-this-route'), null)
})

test('participants have independent active routes and writing; leaving or changing a route does not switch a peer', () => {
  const editor = editorWith(), alice = { id: 'alice', name: 'Alice' }, bob = { id: 'bob', name: 'Bob' }
  const route = CURATED_ROUTES[0], aliceState = activateRoute(editor, route.id, { author: alice, reuseUnowned: false })
  editor.updateShape({ id: aliceState.cards[0].id, props: { note: 'Alice’s private take on the shared table.' } })
  const bobState = activateRoute(editor, route.id, { author: bob, reuseUnowned: false })
  assert.notEqual(aliceState.cards[0].id, bobState.cards[0].id)
  assert.equal(bobState.cards[0].props.note, '')
  assert.equal(getRouteState(editor, { author: alice }).route.id, route.id)
  activateRoute(editor, CURATED_ROUTES[1].id, { author: alice, reuseUnowned: false })
  assert.equal(getRouteState(editor, { author: bob }).route.id, route.id)
  assert.equal(getRouteState(editor, { author: alice }).route.id, CURATED_ROUTES[1].id)
  leaveRoute(editor, { author: alice })
  assert.equal(getRouteState(editor, { author: alice }), null)
  assert.equal(getRouteState(editor, { author: bob }).route.id, route.id)
  const priorCount = collectDevelopEntries(editor).length
  activateRoute(editor, route.id, { author: alice })
  assert.equal(collectDevelopEntries(editor).length, priorCount)
  assert.equal(getRouteState(editor, { author: alice }).cards[0].props.note, 'Alice’s private take on the shared table.')
})

test('revisiting a route repairs a deleted stop and its native arrow binding without duplicating the route', () => {
  const editor = editorWith(), author = { id: 'alice', name: 'Alice' }, route = CURATED_ROUTES[0]
  const state = activateRoute(editor, route.id, { author })
  editor.deleteShape(state.cards[1].id)
  assert.equal(editor.bindings.size, 4)
  const repaired = activateRoute(editor, route.id, { author })
  assert.equal(repaired.cards[1].id, state.cards[1].id)
  assert.equal(editor.bindings.size, 6)
  assert.equal(editor.getCurrentPageShapes().filter(shape => shape.type === 'arrow').length, 3)
  editor.setReadonly(true)
  const before = structuredClone(editor.getCurrentPageShapes())
  assert.equal(activateRoute(editor, CURATED_ROUTES[1].id, { author }), null)
  leaveRoute(editor, { author })
  assert.deepEqual(editor.getCurrentPageShapes(), before)
})


test('retiring the old Develop scaffold preserves user-edited headings and other work', () => {
  for (const text of ['Room for a different idea.', 'Our ideas for tomorrow']) {
    const editor = editorWith([{ id: 'shape:develop-heading', type: 'text', x: DEVELOP_X, y: -80,
      props: { richText: toRichText(text) }, meta: { safariScaffolding: true } }])
    editor.updatePage({ meta: { developInitialized: true } })
    initializeDevelop(editor, { challenge: 'Workshop challenge' })
    assert.equal(Boolean(editor.getShape('shape:develop-heading')), text !== 'Room for a different idea.')
    assert.equal(editor.getCurrentPageShapes().length, text === 'Room for a different idea.' ? 4 : 5)
  }
})

test('a fresh Develop board starts with four native piles and no predealt cards or catalogue grid', () => {
  const editor = editorWith()
  initializeDevelop(editor, { challenge: 'Make more space for unexpected ideas.' })
  assert.equal(collectDevelopEntries(editor).length, 0)
  assert.equal(editor.getCurrentPageShapes().filter(shape => shape.props.template).length, 0)
  assert.equal(getDeckShapes(editor).length, 4)
  assert.equal(editor.getCurrentPage().meta.developDecksVersion, 1)
  for (const deck of getDeckShapes(editor)) {
    assert.deepEqual({ x: deck.x, y: deck.y }, deckPosition(deck.props.category))
    assert.equal(deck.isLocked, true)
    assert.equal(deck.props.w, 300)
    assert.equal(deck.props.h, 430)
    const state = getDeckState(editor, deck.props.category)
    assert.equal(state.remaining.length, 10)
    assert.equal(state.total, 10)
    assert.equal(state.drawn, 0)
    const record = schema.types.shape.create({ ...deck, parentId: editor.getCurrentPage().id, index: 'a1' })
    assert.equal(schema.types.shape.validate(record), record)
  }
})

test('catalogue migration removes pristine locked scaffolds while preserving modified cards, clones, notes and routes', () => {
  const originalTemplates = templateShapes().map(shape => ({ ...shape, isLocked: true }))
  const modified = originalTemplates.slice(0, 5).map((shape, index) => ({ ...shape,
    ...(index === 0 ? { isLocked: false } : index === 1 ? { x: shape.x + 200 } : index === 2 ? { parentId: 'shape:my-group' } : {}),
    props: { ...shape.props, ...(index === 3 ? { note: 'Our annotation' } : index === 4 ? { face: 'back' } : {}) },
  }))
  const clone = { ...originalTemplates[5], id: 'shape:my-template-copy', x: 7000 }
  const oldStations = stationShapes().map(shape => ({ ...shape, isLocked: true }))
  oldStations[0].x += 20
  const editor = editorWith([...originalTemplates, ...modified, clone, ...oldStations])
  editor.updatePage({ meta: { developInitialized: true, developRoute: CURATED_ROUTES[0].id, developOrder: ['shape:my-idea'] } })
  const own = { id: 'shape:my-idea', type: 'change-card', x: 6925, y: 345,
    props: changeCardProps(14, { note: 'Keep this thought.', draft: 'And this unfinished thought.' }), meta: { developDrafting: true } }
  editor.createShape(own)
  activateRoute(editor, CURATED_ROUTES[1].id, { author: { id: 'alex', name: 'Alex' } })
  const preserved = structuredClone(editor.getCurrentPageShapes().filter(shape => !shape.id.startsWith('shape:change-template-') && !shape.id.startsWith('shape:change-station-')))
  initializeDevelop(editor, { challenge: 'An existing workshop.' })
  for (const shape of [...modified, clone, oldStations[0], ...preserved]) {
    const actual = editor.getShape(shape.id)
    assert.ok(actual, `lost ${shape.id}`)
    assert.deepEqual(actual.props, shape.props)
    assert.equal(actual.x, shape.x)
    assert.equal(actual.y, shape.y)
    assert.equal(actual.isLocked, shape.isLocked)
  }
  for (const original of originalTemplates.slice(5)) assert.equal(editor.getShape(original.id), undefined)
  assert.equal(getDeckShapes(editor).length, 4)
  assert.equal(getDeckShapes(editor).find(shape => shape.props.category === oldStations[0].props.category).id, `shape:change-deck-${oldStations[0].props.category}`)
  assert.deepEqual(editor.getCurrentPage().meta.developOrder, ['shape:my-idea'])
  const after = structuredClone(editor.getCurrentPageShapes())
  assert.equal(initializeDevelop(editor, { challenge: 'An existing workshop.' }), false)
  assert.deepEqual(editor.getCurrentPageShapes(), after)
})

test('draws are front-facing random unseen cards, respect route depletion, and become available after return', () => {
  const editor = editorWith(), author = { id: 'alice', name: 'Alice' }, category = CARDS[0].category
  initializeDevelop(editor, { challenge: 'Draw something unexpected.' })
  const deckCards = CARDS.filter(card => card.category === category)
  const first = drawFromDeck(editor, category, { author, random: () => 0.65 })
  assert.equal(first.shape.props.cardId, deckCards[Math.floor(deckCards.length * 0.65)].id)
  assert.equal(first.shape.props.face, 'front')
  assert.equal(first.shape.props.authorId, author.id)
  assert.equal(first.shape.isLocked, undefined)
  assert.equal(first.deck.props.category, category)
  assert.equal(editor.focusedBounds, null, 'drawing itself must not teleport the camera')
  assert.equal(getDeckState(editor, category).remaining.length, 9)
  const record = schema.types.shape.create({ ...first.shape, parentId: editor.getCurrentPage().id, index: 'a1' })
  assert.equal(schema.types.shape.validate(record), record)
  const seen = new Set([first.shape.props.cardId])
  while (getDeckState(editor, category).remaining.length) {
    const result = drawFromDeck(editor, category, { author, random: () => 0.5 })
    assert.equal(seen.has(result.shape.props.cardId), false)
    seen.add(result.shape.props.cardId)
  }
  assert.equal(seen.size, 10)
  const exhausted = structuredClone(editor.getCurrentPageShapes())
  assert.equal(drawFromDeck(editor, category, { author }), null)
  assert.deepEqual(editor.getCurrentPageShapes(), exhausted)
  editor.deleteShape(first.shape.id)
  assert.equal(getDeckState(editor, category).remaining.length, 1)
  assert.equal(drawFromDeck(editor, category, { author }).shape.props.cardId, first.shape.props.cardId)
  assert.equal(drawFromDeck(editor, 'unknown-category', { author }), null)
  activateRoute(editor, CURATED_ROUTES[0].id, { author })
  const routeIds = new Set(CURATED_ROUTES[0].cardIds)
  assert.ok(getDeckState(editor).remaining.every(card => !routeIds.has(card.id)))
  const beforeReadonly = structuredClone(editor.getCurrentPageShapes())
  editor.setReadonly(true)
  assert.equal(drawFromDeck(editor, undefined, { author }), null)
  assert.deepEqual(editor.getCurrentPageShapes(), beforeReadonly)
})

test('deck migration preserves native arrow connections to otherwise pristine catalogue cards and headings', () => {
  const challenge = 'Our connected ideas'
  const targets = [
    { ...templateShapes()[0], isLocked: true },
    { ...stationShapes()[0], isLocked: true },
    { id: 'shape:develop-heading', type: 'text', x: DEVELOP_X, y: -80,
      props: { richText: toRichText('Room for a different idea.') }, meta: { safariScaffolding: true } },
    { id: 'shape:develop-starting-idea', type: 'text', x: DEVELOP_X, y: 40,
      props: { richText: toRichText(challenge) }, meta: { startingIdea: true } },
  ]
  const editor = editorWith(targets)
  editor.updatePage({ meta: { developInitialized: true } })
  targets.forEach((target, index) => {
    const arrowId = `shape:my-connection-${index}`
    editor.createShape({ id: arrowId, type: 'arrow', x: 6700, y: 300 + index * 80, props: { start: { x: 0, y: 0 }, end: { x: 150, y: 0 } } })
    editor.createBinding({ id: `binding:my-connection-${index}`, type: 'arrow', fromId: arrowId, toId: target.id,
      props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' } })
  })
  const before = structuredClone(editor.getCurrentPageShapes()), bindings = structuredClone([...editor.bindings.values()])
  initializeDevelop(editor, { challenge })
  for (const shape of before) assert.deepEqual(editor.getShape(shape.id), shape, `changed connected record ${shape.id}`)
  assert.deepEqual([...editor.bindings.values()], bindings)
  assert.equal(getDeckShapes(editor).length, 4)
  assert.equal(getDeckShapes(editor).find(shape => shape.props.category === targets[1].props.category).id, `shape:change-deck-${targets[1].props.category}`)
})
