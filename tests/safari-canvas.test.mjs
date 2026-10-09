import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CARD_W, CARD_H, cardPosition, stationPosition, isOriginalPilePosition, canvasFieldNotes, evidencePayload, evidencePiles, incomingEvidence, sourceCardMigration, richTextPlainText } from '../src/safari/field-table/canvas-model.js'
import { mergeSafari, mergeProgress, trailStatus } from '../src/safari/live.js'

const sample = JSON.parse(fs.readFileSync(new URL('../public/safari/example/workshop.json', import.meta.url)))
const rich = text => ({ type: 'doc', content: text.split('\n').map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const cardShape = (id, card = sample.cards[0]) => ({ id, type: 'safari-evidence-card', props: { evidence: evidencePayload(sample, card) } })

test('station layouts keep every card separate, including later arrivals and long questions', () => {
  const positions = ['People', 'Patterns', 'Systems', 'Elsewhere', 'Edges', 'Possibilities'].flatMap(lens => Array.from({ length: 9 }, (_, i) => cardPosition(lens, i)))
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    const a = positions[i], b = positions[j]
    assert.ok(a.x + CARD_W <= b.x || b.x + CARD_W <= a.x || a.y + CARD_H <= b.y || b.y + CARD_H <= a.y, `Cards ${i} and ${j} overlap`)
  }
  assert.ok(cardPosition('People', 0).y > stationPosition('People').y)
  const short = evidencePiles({ ...sample, challenge: 'Short question' })
  const long = evidencePiles({ ...sample, challenge: 'A long workshop question. '.repeat(40) })
  assert.deepEqual(short, long, 'Questions live in the header and cannot overlap the evidence')
})

test('migration recognises generated piles but preserves moved and grouped evidence', () => {
  assert.equal(isOriginalPilePosition({ parentId: 'page:one', x: 26, y: 264 }, 'People'), true)
  assert.equal(isOriginalPilePosition({ parentId: 'page:one', x: 435, y: 680 }, 'Edges'), true)
  assert.equal(isOriginalPilePosition({ parentId: 'page:one', x: -200, y: 280 }, 'People'), false)
  assert.equal(isOriginalPilePosition({ parentId: 'shape:group', x: 0, y: 240 }, 'People'), false)
  assert.equal(isOriginalPilePosition({ parentId: 'page:one', x: 0, y: 260 }, 'People'), false)
})

test('successive reveals add only new evidence and never restore a card the user already received then deleted', () => {
  const first = { ...sample, cards: sample.cards.slice(0, 4) }
  const imported = first.cards.map(card => card.id)
  assert.equal(evidencePiles({ ...sample, cards: [] }, { includeEmpty: true }).length, 6)
  assert.equal(incomingEvidence(first, imported).length, 0)
  const additions = incomingEvidence(sample, imported).flatMap(pile => pile.cards)
  assert.equal(additions.length, sample.cards.length - 4)
  assert.ok(additions.every(card => !imported.includes(card.id)))
  assert.equal(incomingEvidence(sample, sample.cards.map(card => card.id)).length, 0, 'Final metadata must not create a second copy')
})

test('research snapshots keep field notes and other safaris; overlapping lane progress remains independent', () => {
  const existing = { ...sample, savedIds: [sample.cards[0].id], notes: { [sample.cards[0].id]: 'A question to ask' }, reflection: 'A connection', seenIds: [sample.cards[0].id] }
  const other = { ...sample, id: 'another-safari' }
  const next = mergeSafari({ currentId: sample.id, safaris: [existing, other] }, { ...sample, cards: sample.cards.slice(0, 4), status: 'researching' })
  const complete = mergeSafari(next, sample)
  assert.equal(complete.safaris[0].notes[sample.cards[0].id], 'A question to ask')
  assert.equal(complete.safaris[0].reflection, 'A connection')
  assert.deepEqual(complete.safaris[0].savedIds, existing.savedIds)
  assert.equal(complete.safaris[1], other)
  let progress = mergeProgress({}, { stage: 'checking', lens: 'People', lensState: 'working' })
  progress = mergeProgress(progress, { stage: 'writing', lens: 'Patterns', lensState: 'done' })
  assert.equal(trailStatus('People', progress, true), 'Checking what holds up…')
  assert.equal(trailStatus('Patterns', progress, true), 'Taking a closer look…')
  assert.equal(trailStatus('People', progress, false), 'An open question')
})

test('the canvas exposes every finding once, with its original source independent of the guide', () => {
  const piles = evidencePiles(sample)
  const cards = piles.flatMap(pile => pile.cards)
  assert.equal(piles.length, 6)
  assert.equal(cards.length, sample.cards.length)
  assert.equal(new Set(cards.map(card => card.id)).size, sample.cards.length)
  for (const pile of piles) assert.ok(pile.cards.every(card => card.lens === pile.lens))
  const original = sample.cards[0]
  const payload = evidencePayload(sample, original)
  assert.equal(payload.source.id, original.sourceId)
  assert.equal(payload.card.transferCaution, original.transferCaution)
  payload.card.title = 'Changed copy'
  payload.source.url = 'https://example.org'
  assert.notEqual(original.title, payload.card.title)
  assert.notEqual(sample.sources.find(source => source.id === original.sourceId).url, payload.source.url)
})

test('canvas export follows native bindings, includes annotations and deduplicates copied evidence', () => {
  const a = cardShape('a'), b = cardShape('b', sample.cards[1])
  const shapes = [a, b, { ...a, id: 'copy-in-group' },
    { ...a, id: 'source', type: 'safari-source-card' },
    { id: 'note', type: 'note', props: { richText: rich('A possibility\nAsk three participants.') } },
    { id: 'frame', type: 'frame', props: { name: 'Time matters' } },
    { id: 'tip', type: 'text', props: { richText: rich('Only scaffolding') }, meta: { safariScaffolding: true } },
    { id: 'arrow', type: 'arrow', props: { richText: rich('Could this help?') } },
    { id: 'source-link', type: 'arrow', props: { richText: rich('Technical source link') }, meta: { safariSourceLink: true } },
  ]
  const bindings = [{ fromId: 'arrow', toId: 'a', props: { terminal: 'start' } }, { fromId: 'arrow', toId: 'b', props: { terminal: 'end' } }]
  const output = canvasFieldNotes(sample, shapes, bindings)
  assert.ok(output.includes(`${sample.cards[0].title} → ${sample.cards[1].title}: Could this help?`))
  for (const value of ['A possibility\nAsk three participants.', 'Time matters', 'not new evidence claims']) assert.ok(output.includes(value))
  assert.ok(!output.includes('Only scaffolding'))
  assert.ok(!output.includes('Technical source link'))
  assert.equal(output.split(`### ${sample.cards[0].title}\n`).length - 1, 1)
  for (const shape of [a, b]) {
    const { card, source } = shape.props.evidence
    for (const value of [card.finding, card.context, card.limitation, card.transferCaution, card.supportQuote, source.url]) assert.ok(output.includes(value))
  }
  assert.ok(!output.includes(sample.cards[2].finding), 'Deleted evidence should not be reintroduced from the original collection')
})

test('free arrows and absent sources remain exportable without inventing evidence', () => {
  const a = cardShape('a')
  a.props.evidence.source = null
  const output = canvasFieldNotes(sample, [a, { id: 'arrow', type: 'arrow', props: { richText: rich('An open question') } }])
  assert.ok(output.includes('Canvas point → Canvas point: An open question'))
  assert.ok(output.includes(a.props.evidence.card.limitation))
  assert.ok(!output.includes('undefined'))
  assert.ok(!output.includes('**Source:**'))
})

test('native rich-text notes keep paragraphs, inline marks and line breaks in plain text', () => {
  const value = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'One ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'thought' }, { type: 'hardBreak' }, { type: 'text', text: 'continued' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Another thought' }] },
  ] }
  assert.equal(richTextPlainText(value), 'One thought\ncontinued\nAnother thought')
  assert.equal(richTextPlainText(null), '')
})

test('folding old source cards away preserves personal connections and their evidence', () => {
  const finding = cardShape('finding')
  const source = { ...cardShape('source'), type: 'safari-source-card', props: { evidence: finding.props.evidence, findingShapeId: finding.id, w: 490, h: 900 } }
  const auto = { id: 'automatic-source-link', type: 'arrow', meta: { safariSourceLink: true }, props: { richText: rich('') } }
  const personal = { id: 'personal-connection', type: 'arrow', props: { richText: rich('Could this explain the barrier?') } }
  const originalBindings = [
    { id: 'automatic-binding', type: 'arrow', fromId: auto.id, toId: source.id, props: { terminal: 'end' } },
    { id: 'personal-binding', type: 'arrow', fromId: personal.id, toId: source.id, props: { terminal: 'end', normalizedAnchor: { x: .5, y: .5 } } },
  ]
  const shapes = [finding, source, auto, personal]
  const migration = sourceCardMigration(shapes, originalBindings)
  assert.deepEqual(migration.removeIds, [source.id, auto.id])
  assert.deepEqual(migration.bindings, [{ ...originalBindings[1], toId: finding.id }])
  assert.equal(originalBindings[1].toId, source.id, 'The original work must not be mutated while planning migration')
  const output = canvasFieldNotes(sample, shapes.filter(shape => !migration.removeIds.includes(shape.id)), migration.bindings)
  for (const text of [finding.props.evidence.card.finding, finding.props.evidence.card.limitation, finding.props.evidence.source.url, 'Could this explain the barrier?']) assert.ok(output.includes(text))
})

test('a source card with no original finding keeps its identity, position and provenance', () => {
  const card = { ...cardShape('only-copy'), type: 'safari-source-card', x: 300, y: 600, props: { ...cardShape('copy').props, findingShapeId: 'deleted-finding', w: 490, h: 900 } }
  const migration = sourceCardMigration([card], [])
  assert.deepEqual(migration.removeIds, [])
  assert.deepEqual(migration.bindings, [])
  assert.deepEqual(migration.compact, [{ id: card.id, type: card.type, props: { h: 490 * CARD_H / CARD_W } }])
  assert.equal(card.x, 300)
  assert.equal(card.props.evidence.card.id, sample.cards[0].id)
})
