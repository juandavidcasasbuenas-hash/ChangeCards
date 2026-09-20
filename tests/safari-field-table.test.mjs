import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { TABLE_KEY, exportFieldTable, persistSafari, readTable, safeSourceUrl, starterThread } from '../src/safari/field-table/model.js'

const sample = JSON.parse(fs.readFileSync(new URL('../public/safari/example/workshop.json', import.meta.url)))
const guideKey = 'evidence-safari.field-guides.v1'
function storage() {
  const records = new Map()
  globalThis.localStorage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) }
  return records
}

test('field notes keep the source, setting and cautions for both ends of a thread', () => {
  const thread = { ...starterThread(sample), id: 'test-thread' }
  const safari = { ...sample, savedIds: [thread.cardIds[0]], notes: { [thread.cardIds[0]]: 'Ask participants about their time.' } }
  const output = exportFieldTable(safari, { threads: [thread], reflection: 'A free workshop still takes time.' })
  for (const id of thread.cardIds) {
    const card = sample.cards.find(item => item.id === id)
    const source = sample.sources.find(item => item.id === card.sourceId)
    for (const value of [card.title, card.finding, card.context, card.transferCaution, card.limitation, card.supportQuote, source.url]) assert.ok(output.includes(value), `Export lost ${id}: ${value}`)
  }
  for (const value of [thread.observation, thread.question, thread.nextStep, 'personal interpretations', 'Ask participants about their time.', 'A free workshop still takes time.']) assert.ok(output.includes(value))
  const unkept = sample.cards.find(card => !thread.cardIds.includes(card.id))
  assert.ok(!output.includes(unkept.finding), 'Unkept, unconnected findings should not be included')
})

test('saving an explored trail preserves other guides and the card game', () => {
  const records = storage()
  const other = { ...sample, id: 'another-safari', notes: { some: 'A personal note' }, reflection: 'Keep this.' }
  const game = '{"idea":"Keep my game"}'
  records.set('change-cards-session-v1', game)
  records.set(guideKey, JSON.stringify({ currentId: other.id, safaris: [other] }))
  persistSafari({ ...sample, savedIds: ['people_1'], seenIds: ['people_1'] })
  const stored = JSON.parse(records.get(guideKey))
  assert.equal(stored.safaris.length, 2)
  assert.deepEqual(stored.safaris.find(item => item.id === other.id), other)
  assert.equal(records.get('change-cards-session-v1'), game)
})

test('restoring a table keeps valid work and rejects broken links and invalid positions', () => {
  const records = storage()
  const valid = { ...starterThread(sample), id: 'valid' }
  records.set(TABLE_KEY + sample.id, JSON.stringify({
    threads: [valid, null, { ...valid, id: 'missing', cardIds: ['people_1', 'deleted'] }, { ...valid, id: 'duplicate', cardIds: ['people_1', 'people_1'] }, { ...valid, id: 'bad', relation: 'bogus' }, { ...valid, relation: 'constructor' }],
    positions: { valid: { x: 125, y: 88 }, invalid: { x: 999999, y: 0 }, malformed: { x: '10', y: 0 } },
    reflection: 'Keep my question.',
  }))
  const restored = readTable(sample)
  assert.deepEqual(restored.threads, [valid])
  assert.deepEqual(restored.positions, { valid: { x: 125, y: 88 } })
  assert.equal(restored.reflection, 'Keep my question.')
  records.set(TABLE_KEY + sample.id, 'broken json')
  assert.ok(readTable(sample).storageError)
})

test('the field table can carry an existing reflection and does not invent a starter for other evidence', () => {
  storage()
  assert.equal(readTable({ ...sample, reflection: 'An earlier reflection' }).reflection, 'An earlier reflection')
  assert.equal(starterThread({ ...sample, id: 'new-challenge' }), null)
  assert.equal(starterThread({ ...sample, cards: sample.cards.filter(card => card.id !== 'people_1') }), null)
})

test('evidence links allow web sources without accepting executable URL schemes', () => {
  assert.equal(safeSourceUrl('javascript:alert(1)'), undefined)
  assert.equal(safeSourceUrl('data:text/html,untrusted'), undefined)
  assert.equal(safeSourceUrl(undefined), undefined)
  assert.equal(safeSourceUrl('https://example.org/evidence'), 'https://example.org/evidence')
})
