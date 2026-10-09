import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Box } from 'tldraw'
import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas, DocumentRecordType, PageRecordType } from '@tldraw/tlschema'
import { CARDS, CURATED_ROUTES } from '../src/develop/catalog.js'
import { templateShapes, stationShapes, changeCardProps, workingPosition, DEVELOP_X, CATALOGUE_X, CARD_W, WORKSPACE_W } from '../src/develop/model.js'
import { buildSparkPayload, sparkCacheKey } from '../src/develop/ai.js'
import { evidencePayload, richTextPlainText } from '../src/safari/field-table/canvas-model.js'
import { safariShapeSchemas } from '../shared/safari-shapes.mjs'
import { MAX_RECORD_BYTES, prepareSharedBoard } from '../shared/safari-session.mjs'
import { initializeDevelop, buildFromEvidence, collectDevelopEntries, drawChangeCard, activateRoute, showDevelop, developMarkdown } from '../src/develop/canvas-actions.js'

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
  let page = { id: 'page:workshop', meta: {} }, readonly = false
  const editor = {
    shapes, focusedBounds: null,
    getCurrentPage: () => page,
    getCurrentPageShapes: () => [...shapes.values()],
    getShape: id => shapes.get(id),
    getInstanceState: () => ({ isReadonly: readonly }),
    setReadonly: value => { readonly = value },
    run: callback => callback(),
    createShape: shape => { shapes.set(shape.id, structuredClone({ meta: {}, parentId: page.id, ...shape })); return editor },
    createShapes: records => { records.forEach(editor.createShape); return editor },
    updatePage: patch => { page = { ...page, ...structuredClone(patch) }; return editor },
    updateShape: patch => { const old = shapes.get(patch.id); shapes.set(patch.id, { ...old, ...patch, props: { ...old.props, ...patch.props } }); return editor },
    deleteShape: id => { shapes.delete(id); return editor },
    markHistoryStoppingPoint() {},
    getShapePageBounds: id => { const shape = shapes.get(id); return shape ? new Box(shape.x || 0, shape.y || 0, shape.props.w || 300, shape.props.h || 150) : null },
    getViewportScreenBounds: () => new Box(0, 0, 1400, 900),
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
  const templates = templateShapes(), stations = stationShapes()
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
  const working = collectDevelopEntries(editor).find(shape => shape.props.cardId === 14)
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

test('phone navigation keeps a working or category card readable; the whole catalogue remains an explicit overview', () => {
  const editor = editorWith()
  initializeDevelop(editor, { challenge: evidence.challenge })
  editor.getViewportScreenBounds = () => new Box(0, 0, 390, 844)
  for (const category of ['table', 'ingenious']) {
    showDevelop(editor, category, { animate: false })
    const focused = editor.focusedBounds
    const target = editor.getCurrentPageShapes().find(shape => shape.type === 'change-card' &&
      (category === 'table' ? !shape.props.template : shape.props.template && CARDS.find(card => card.id === shape.props.cardId).category === category))
    assert.deepEqual(focused, editor.getShapePageBounds(target.id))
  }
  showDevelop(editor, 'all', { animate: false })
  assert.ok(editor.focusedBounds.w > CARD_W * 3)
})

test('drawing after deletion or manual movement uses a vacant slot without moving existing cards; routes use the same placement', () => {
  const editor = editorWith(), author = { id: 'alice', name: 'Alice' }
  initializeDevelop(editor, { challenge: evidence.challenge })
  const removed = collectDevelopEntries(editor).find(shape => shape.props.cardId === 5)
  editor.deleteShape(removed.id)
  const newId = drawChangeCard(editor, 6, { author })
  assert.equal(editor.getShape(newId).x, removed.x)
  assert.equal(editor.getShape(newId).y, removed.y)
  const moved = collectDevelopEntries(editor).find(shape => shape.props.cardId === 14)
  editor.updateShape({ id: moved.id, x: workingPosition(3).x - 30 })
  const before = structuredClone(collectDevelopEntries(editor))
  drawChangeCard(editor, 7, { author })
  activateRoute(editor, CURATED_ROUTES[0].id)
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
  const starter = collectDevelopEntries(editor).find(shape => shape.props.cardId === 1)
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
