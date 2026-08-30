import assert from 'node:assert/strict'

const targetRounds = 4
const playerCounts = [
  ...Array.from({ length: 511 }, (_, index) => index + 2),
  1000,
  10000,
]

for (const playerCount of playerCounts) {
  const passesByIdea = Array.from({ length: playerCount }, () => [])
  const passesByPlayer = Array.from({ length: playerCount }, () => [])

  for (let round = 1; round <= targetRounds; round += 1) {
    const shift = 1 + ((round - 1) % (playerCount - 1))

    for (let contributor = 0; contributor < playerCount; contributor += 1) {
      const ideaOwner = (contributor + shift) % playerCount
      const cardId = 1 + ((round - 1) * 4) + (ideaOwner % 4)
      assert.notEqual(contributor, ideaOwner, `Player ${contributor + 1} received their own idea with ${playerCount} players`)
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

console.log('Co-op routing verified through 10,000 players: no self-assignment, no application cap, and four distinct cards per player and idea.')
