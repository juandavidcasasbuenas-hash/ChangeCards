import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const targetRounds = 4
const cardPools = [
  [1, 2, 3, 4, 17, 18, 19, 20, 21, 22],
  [5, 6, 7, 8, 23, 24, 25, 26, 27, 28],
  [9, 10, 11, 12, 29, 30, 31, 32, 33, 34],
  [13, 14, 15, 16, 35, 36, 37, 38, 39, 40],
]
const playerCounts = [
  ...Array.from({ length: 511 }, (_, index) => index + 2),
  1000,
  10000,
]
const seenCards = new Set()

for (const playerCount of playerCounts) {
  const passesByIdea = Array.from({ length: playerCount }, () => [])
  const passesByPlayer = Array.from({ length: playerCount }, () => [])

  for (let round = 1; round <= targetRounds; round += 1) {
    const shift = 1 + ((round - 1) % (playerCount - 1))
    const cardOffset = ((playerCount * 7) + (round * 3)) % 10

    for (let contributor = 0; contributor < playerCount; contributor += 1) {
      const ideaOwner = (contributor + shift) % playerCount
      const cardId = cardPools[round - 1][(ideaOwner + cardOffset) % 10]
      seenCards.add(cardId)
      assert.notEqual(contributor, ideaOwner, `Player ${contributor + 1} received their own idea with ${playerCount} players`)
      assert.ok(cardPools[round - 1].includes(cardId), `Round ${round} selected a card outside its thinking category`)
      passesByIdea[ideaOwner].push({ contributor, cardId })
      passesByPlayer[contributor].push({ ideaOwner, cardId })
    }
  }

  passesByIdea.forEach((passes, ideaOwner) => {
    assert.equal(passes.length, targetRounds, `Idea ${ideaOwner + 1} did not receive four passes`)
    assert.equal(new Set(passes.map((pass) => pass.cardId)).size, targetRounds, `Idea ${ideaOwner + 1} received a repeated card`)
    assert.equal(new Set(passes.map((pass) => pass.contributor)).size, Math.min(targetRounds, playerCount - 1), `Idea ${ideaOwner + 1} repeated a contributor unnecessarily`)
  })

  passesByPlayer.forEach((passes, contributor) => {
    assert.equal(passes.length, targetRounds, `Player ${contributor + 1} did not receive four passes`)
    assert.equal(new Set(passes.map((pass) => pass.cardId)).size, targetRounds, `Player ${contributor + 1} received a repeated card`)
    assert.equal(new Set(passes.map((pass) => pass.ideaOwner)).size, Math.min(targetRounds, playerCount - 1), `Player ${contributor + 1} repeated an idea unnecessarily`)
  })
}

assert.deepEqual([...seenCards].sort((a, b) => a - b), Array.from({ length: 40 }, (_, index) => index + 1), 'Not every card is reachable through co-op routing')

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/20260903_expand_deck_to_40.sql', import.meta.url), 'utf8')
assert.match(schema, /card_id between 1 and 40/)
assert.match(migration, /card_id between 1 and 40/)
cardPools.flat().forEach((cardId) => {
  assert.match(schema, new RegExp(`\\b${cardId}\\b`), `Card ${cardId} is missing from the canonical co-op schema`)
  assert.match(migration, new RegExp(`\\b${cardId}\\b`), `Card ${cardId} is missing from the expansion migration`)
})

console.log('Co-op routing verified through 10,000 players: all 40 cards are reachable, categories remain round-specific, and every player and idea receives four distinct cards.')
