import { cardMarkdown, readGuides, writeGuides } from '../field-guide.js'

export const TABLE_KEY = 'evidence-safari.field-table.v1:'
export const RELATIONS = {
  echoes: { label: 'An echo', description: 'These findings seem to reinforce each other.', color: 'green' },
  tension: { label: 'A tension', description: 'These findings pull in different directions.', color: 'red' },
  leap: { label: 'An unexpected link', description: 'An idea from one setting could open up another.', color: 'violet' },
}
export const LENS_NOTES = {
  People: 'Start with someone’s world.',
  Patterns: 'Step back. What keeps showing up?',
  Systems: 'Look at what makes things possible.',
  Elsewhere: 'Borrow a different point of view.',
  Edges: 'Listen for what’s being left out.',
  Possibilities: 'Find a small opening for change.',
}
export const LENS_COLORS = {
  People: '#ef9f86', Patterns: '#a9c6da', Systems: '#ead177',
  Elsewhere: '#c2b3d4', Edges: '#b3c5a0', Possibilities: '#ebbc8e',
}
export const sourceFor = (safari, card) => safari.sources.find(source => source.id === card.sourceId)
export const safeSourceUrl = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}

export function readTable(safari) {
  try {
    const stored = JSON.parse(localStorage.getItem(TABLE_KEY + safari.id) || '{}') || {}
    const ids = new Set(safari.cards.map(card => card.id))
    const threads = (Array.isArray(stored.threads) ? stored.threads : []).filter(thread =>
      thread && typeof thread.id === 'string' && typeof thread.title === 'string' &&
      typeof thread.observation === 'string' && typeof thread.question === 'string' &&
      typeof thread.nextStep === 'string' && Object.hasOwn(RELATIONS, thread.relation) &&
      Array.isArray(thread.cardIds) && thread.cardIds.length === 2 &&
      new Set(thread.cardIds).size === 2 && thread.cardIds.every(id => ids.has(id)))
    const positions = Object.fromEntries(Object.entries(stored.positions || {}).filter(([, p]) =>
      p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 100000 && Math.abs(p.y) < 100000))
    return { threads, positions, reflection: typeof stored.reflection === 'string' ? stored.reflection : (safari.reflection || '') }
  } catch { return { threads: [], positions: {}, reflection: safari.reflection || '', storageError: 'Your field table could not be restored. Download your guide to keep a separate copy.' } }
}

export function persistSafari(safari) {
  const library = readGuides()
  // Never replace another trail, its notes, or the Change Cards session.
  const previous = library.safaris.find(item => item.id === safari.id)
  writeGuides({ ...library, currentId: safari.id, safaris: [
    { ...previous, ...safari }, ...library.safaris.filter(item => item.id !== safari.id),
  ] })
}

export function exportFieldTable(safari, table) {
  const included = new Set([...(safari.savedIds || []), ...table.threads.flatMap(thread => thread.cardIds)])
  let text = `# Evidence Safari — field notes\n\n${safari.challenge}\n\nEvidence collection prepared ${safari.generatedAt.slice(0, 10)}.\n\n`
  if (table.reflection.trim()) text += `## What changed my thinking\n\n${table.reflection.trim()}\n\n`
  if (table.threads.length) {
    text += '## Threads to follow\n\nConnections below are personal interpretations and questions, not established findings.\n\n'
    for (const thread of table.threads) {
      text += `### ${thread.title}\n\n**${RELATIONS[thread.relation].label}:** ${thread.observation}\n\n`
      text += `**Findings connected:** ${thread.cardIds.map(id => safari.cards.find(card => card.id === id).title).join(' + ')}\n\n`
      if (thread.question) text += `**Question to explore:** ${thread.question}\n\n`
      if (thread.nextStep) text += `**A small next step:** ${thread.nextStep}\n\n`
    }
  }
  text += '## Findings & their sources\n\n'
  for (const card of safari.cards.filter(card => included.has(card.id))) text += cardMarkdown(card, sourceFor(safari, card), safari.notes?.[card.id])
  text += '\n---\n\nEvidence was checked by an AI model against search extracts. Full texts have not been independently verified. Connections across settings are hypotheses, not proof.\n'
  return text
}

export function starterThread(safari) {
  if (safari.id !== 'safari_5ae0ab93057f7356' || !['people_1', 'elsewhere_1'].every(id => safari.cards.some(card => card.id === id))) return null
  return {
    cardIds: ['people_1', 'elsewhere_1'], relation: 'leap', title: 'Free still costs time',
    observation: 'Removing the fee may not remove the cost of taking part. The short clinician workshops suggest a format worth exploring, although their health-care setting is different.',
    question: 'How might we make a workshop fit into a science communicator’s working day?',
    nextStep: 'Ask three potential participants to compare a one-hour session with a half-day workshop. What would they have to give up to attend each?',
  }
}
