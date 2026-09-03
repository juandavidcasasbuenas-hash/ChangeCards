import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const cardPattern = /\{ id: (\d+), category: '([^']+)', label: '([^']+)', title: '([^']+)', provocation: '([^']+)', sparkBrief: '([^']+)' \}/g
const cards = [...source.matchAll(cardPattern)].map((match) => ({
  id: Number(match[1]),
  category: match[2],
  label: match[3],
  title: match[4],
  provocation: match[5],
  sparkBrief: match[6],
}))

assert.deepEqual(cards.map((card) => card.id), Array.from({ length: 24 }, (_, index) => index + 17), 'Expected a complete sequence of new cards from 17 to 40')
assert.equal(new Set(cards.map((card) => card.title)).size, 24, 'New card titles must be unique')
for (const category of ['multidisciplinary', 'ingenious', 'optimistic', 'flexible']) {
  assert.equal(cards.filter((card) => card.category === category).length, 6, `${category} should gain six cards`)
}
cards.forEach((card) => {
  assert.ok(card.provocation.length >= 30, `${card.title} needs a substantive provocation`)
  assert.ok(card.sparkBrief.length >= 40, `${card.title} needs a card-specific Spark brief`)
})

if (!process.argv.includes('--live')) {
  console.log('New card Spark metadata verified: 24 unique cards, six per category, each with a substantive provocation and card-specific brief.')
  process.exit(0)
}

const origin = process.env.CHANGE_CARDS_ORIGIN || 'http://localhost:8787'
const originalIdea = 'A free one-hour online workshop that helps science communicators use design thinking in their everyday practice.'
const previousTransformations = [
  {
    cardId: 4,
    cardTitle: 'Hand Over the Pen',
    provocation: 'What if the people affected by this idea designed it themselves?',
    category: 'Being multidisciplinary',
    idea: 'Participants choose a real communication challenge and shape the workshop exercises around it.',
    shift: 'Participants shape the agenda.',
  },
]

async function requestCard(card) {
  const startedAt = performance.now()
  const response = await fetch(`${origin}/api/sparks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalIdea,
      currentIdea: originalIdea,
      cardCategory: card.label,
      cardTitle: card.title,
      cardProvocation: card.provocation,
      cardSparkBrief: card.sparkBrief,
      previousTransformations,
    }),
  })
  const body = await response.json()
  assert.equal(response.ok, true, `${card.title} failed: ${body.error || response.status}`)
  assert.equal(body.sparks?.length, 10, `${card.title} did not return ten Sparks`)
  assert.equal(new Set(body.sparks.map((spark) => spark.toLowerCase())).size, 10, `${card.title} returned duplicate Sparks`)
  body.sparks.forEach((spark) => {
    assert.ok(spark.trim().length >= 2, `${card.title} returned an empty Spark`)
    assert.ok(spark.trim().split(/\s+/).length <= 12, `${card.title} returned a Spark over twelve words: ${spark}`)
  })
  return { ...card, durationMs: Math.round(performance.now() - startedAt), sparks: body.sparks }
}

const sampleIds = new Set([17, 20, 23, 26, 29, 32, 37, 40])
const cardArgument = process.argv.find((argument) => argument.startsWith('--card='))
const requestedCardId = cardArgument ? Number(cardArgument.split('=')[1]) : null
const cardsToTest = requestedCardId
  ? cards.filter((card) => card.id === requestedCardId)
  : process.argv.includes('--sample') ? cards.filter((card) => sampleIds.has(card.id)) : cards
assert.ok(cardsToTest.length, `No new card matched ${cardArgument}`)
const results = []
for (let index = 0; index < cardsToTest.length; index += 4) {
  results.push(...await Promise.all(cardsToTest.slice(index, index + 4).map(requestCard)))
}

console.log(JSON.stringify({
  cardCount: results.length,
  averageDurationMs: Math.round(results.reduce((total, result) => total + result.durationMs, 0) / results.length),
  slowestDurationMs: Math.max(...results.map((result) => result.durationMs)),
  cards: results.map(({ id, title, durationMs, sparks }) => ({
    id,
    title,
    durationMs,
    ...(process.argv.includes('--sample') || requestedCardId ? { sparks } : {}),
  })),
}, null, 2))
