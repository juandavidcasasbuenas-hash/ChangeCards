export const LENSES = ['People', 'Patterns', 'Systems', 'Elsewhere', 'Edges', 'Possibilities']
export const LENS_COPY = {
  People: 'Lived experience', Patterns: 'The bigger picture', Systems: 'Behind the scenes',
  Elsewhere: 'Different worlds', Edges: 'Outside the usual', Possibilities: 'What could be',
}
export const lensClass = lens => `sf-lens-${lens.toLowerCase()}`

// A detour prefers unexplored evidence and the least-visited perspectives.
// The collection is already curated: drawing never invents or regenerates evidence.
export function chooseFinding(cards, seenIds = [], { lens, avoidLens, currentId, random = Math.random } = {}) {
  let pool = cards.filter(card => (!lens || card.lens === lens) && card.id !== currentId)
  if (!pool.length) return null
  if (avoidLens && pool.some(card => card.lens !== avoidLens)) pool = pool.filter(card => card.lens !== avoidLens)
  const unseen = pool.filter(card => !seenIds.includes(card.id))
  if (unseen.length) pool = unseen
  const counts = Object.fromEntries(LENSES.map(name => [name, cards.filter(card => card.lens === name && seenIds.includes(card.id)).length]))
  const least = Math.min(...pool.map(card => counts[card.lens]))
  if (!lens) pool = pool.filter(card => counts[card.lens] === least)
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

export function formatDuration(ms = 0) {
  const seconds = Math.floor(ms / 1000)
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}
