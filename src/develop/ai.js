import { CARDS } from './catalog.js'

const CACHE_KEY = 'change-cards-cache-v1'

// Preserve the existing cache identity: evidence context becomes part of the
// previous-transformations input, so a different finding gets different sparks.
export function sparkCacheKey(payload) {
  const context = JSON.stringify([
    payload.originalIdea, payload.currentIdea, payload.cardTitle, payload.previousTransformations,
    payload.routeId, payload.routeStep, payload.previousRouteResponses,
  ])
  let signature = 0
  for (let index = 0; index < context.length; index += 1) signature = ((signature * 31) + context.charCodeAt(index)) | 0
  return ['sparks-luna-v4', payload.cardTitle, signature.toString(36)].join('::')
}

export async function requestSparks(payload, { signal, force = false } = {}) {
  const key = sparkCacheKey(payload)
  let cache = {}
  try { cache = JSON.parse(sessionStorage.getItem(CACHE_KEY)) || {} } catch { /* Cache is optional. */ }
  if (!force && Array.isArray(cache[key])) return cache[key]
  const response = await fetch('/api/sparks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No sparks landed.')
  if (!Array.isArray(data.sparks) || !data.sparks.every(spark => typeof spark === 'string')) throw new Error('No sparks landed.')
  cache[key] = data.sparks
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* Cache is optional. */ }
  return data.sparks
}

function entryProps(entry) { return entry?.props || entry || {} }

// A compact, labelled source record reaches the existing endpoint without a new
// model call or pretending that a research finding is an idea written by a user.
function evidenceContext(value) {
  const payload = value?.props?.evidence || value?.evidence || value
  const card = payload?.card
  if (!card) return null
  const source = payload.source || {}
  return {
    kind: 'evidence', cardId: card.id, cardTitle: card.title,
    idea: card.finding || card.takeaway || '',
    shift: 'Research context for ideation, not a user proposal or a proven intervention. Preserve the source limitations.',
    evidence: {
      finding: card.finding || card.takeaway || '', limitation: card.limitation || '',
      connection: card.connection || '', transferCaution: card.transferCaution || '',
      sourceId: card.sourceId || source.id || '', sourceTitle: source.title || '',
      sourceUrl: source.url || '', sourceYear: source.year || '',
    },
  }
}

export function buildSparkPayload({ challenge, card, entries = [], route = null, evidence = [] }) {
  const written = entries.map(entryProps).filter(entry => !entry.template && typeof entry.note === 'string' && entry.note.trim())
  const notes = written.flatMap(entry => {
    const changeCard = CARDS.find(item => item.id === Number(entry.cardId))
    if (!changeCard) return []
    return [{
      cardId: changeCard.id, cardTitle: changeCard.title, provocation: changeCard.provocation,
      category: changeCard.label, idea: entry.note.trim(), shift: `The user's workshop note for ${changeCard.title}.`,
    }]
  })
  // The server accepts the final 20 context entries. Keep up to four selected
  // findings alongside the latest writing to bound request size and retain refs.
  const findings = (Array.isArray(evidence) ? evidence : [evidence]).map(evidenceContext).filter(Boolean).slice(-4)
  const routeStepIndex = route?.cardIds?.indexOf(card.id) ?? -1
  const previousRouteResponses = routeStepIndex > 0
    ? route.cardIds.slice(0, routeStepIndex).flatMap(cardId => {
      const responses = notes.filter(entry => entry.cardId === cardId)
      return responses.map(entry => ({ cardTitle: entry.cardTitle, response: entry.idea }))
    }).slice(-3)
    : []
  return {
    originalIdea: challenge, currentIdea: challenge,
    cardCategory: card.label, cardTitle: card.title, cardProvocation: card.provocation, cardSparkBrief: card.sparkBrief,
    previousTransformations: [...findings, ...notes.slice(-(20 - findings.length))],
    routeId: route?.id, routeName: route?.name, routePurpose: route?.purpose,
    routeStep: routeStepIndex >= 0 ? routeStepIndex + 1 : undefined,
    routeLength: routeStepIndex >= 0 ? route.cardIds.length : undefined, previousRouteResponses,
  }
}
