import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chooseFinding, LENSES } from '../src/safari/discovery.js'

const { cards } = JSON.parse(await readFile(new URL('../public/safari/example/workshop.json', import.meta.url), 'utf8'))

test('surprise draws cover all six perspectives before repeating a perspective and never repeat an unseen find', () => {
  const seen = [], trail = []
  for (let i = 0; i < cards.length; i++) {
    const card = chooseFinding(cards, seen, { random: () => .6 })
    assert.ok(!seen.includes(card.id))
    assert.ok(cards.includes(card), 'Drawing must return the original referenced evidence record')
    seen.push(card.id); trail.push(card)
  }
  assert.deepEqual(new Set(trail.slice(0, 6).map(c => c.lens)), new Set(LENSES))
  assert.equal(new Set(seen).size, cards.length)
})

test('piles stay within their category; detours prefer unseen evidence from another perspective', () => {
  const card = chooseFinding(cards, [], { lens: 'People', random: () => 0 })
  const more = chooseFinding(cards, [card.id], { lens: card.lens, currentId: card.id })
  assert.equal(more.lens, 'People'); assert.notEqual(more.id, card.id)
  const detour = chooseFinding(cards, [card.id], { avoidLens: card.lens, currentId: card.id })
  assert.notEqual(detour.lens, 'People')
  const otherPerspectivesSeen = cards.filter(c => c.lens !== 'People').map(c => c.id)
  assert.notEqual(chooseFinding(cards, otherPerspectivesSeen, { avoidLens: 'People', currentId: card.id }).lens, 'People', 'A detour still changes perspective when its other findings have been seen')
})

test('empty and sparse collections remain usable, and exhausted collections can be revisited', () => {
  assert.equal(chooseFinding([], []), null)
  assert.equal(chooseFinding([cards[0]], [], { lens: 'Possibilities' }), null)
  assert.equal(chooseFinding([cards[0]], [cards[0].id], { currentId: cards[0].id }), null)
  const revisited = chooseFinding(cards, cards.map(c => c.id), { currentId: cards[0].id })
  assert.ok(revisited); assert.notEqual(revisited.id, cards[0].id)
})
