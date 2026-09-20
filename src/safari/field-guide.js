const STORAGE_KEY = 'evidence-safari.field-guides.v1'
export function readGuides() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!data) return { safaris: [], currentId: null }
    if (!Array.isArray(data.safaris) || data.safaris.some(s => !s.id || !Array.isArray(s.cards) || !Array.isArray(s.sources) || !Array.isArray(s.stations))) throw Error('Invalid saved guide')
    return data
  } catch { return { safaris: [], currentId: null, storageError: 'Saved field guides could not be read in this browser.' } }
}
export function writeGuides(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ safaris: data.safaris, currentId: data.currentId }))
}

const sentence = value => String(value || '').trim()
export const evidenceLabel = type => ({ qualitative: 'Qualitative study', observational: 'Observational study', systematic_review: 'Research review', official_statistics: 'Official statistics', experiment: 'Experiment', case_study: 'Case study', guidance: 'Practice guidance', theory: 'Theory' }[type] || String(type).replaceAll('_', ' '))
export function cardMarkdown(card, source, note) {
  return `### ${card.title}\n\n${sentence(card.finding)}\n\n` +
    `**Original context:** ${sentence(card.context)}\n\n` +
    `**Why it might matter (${card.relevance}; a hypothesis):** ${sentence(card.connection)}\n\n` +
    `**Transfer caution:** ${sentence(card.transferCaution)}\n\n` +
    `**Discuss:** ${sentence(card.discussionQuestion)}\n\n` +
    `**Evidence:** ${evidenceLabel(card.evidenceType)}. ${sentence(card.qualityReason)}\n\n` +
    `**Limitation:** ${sentence(card.limitation)}\n\n` +
    (source ? `**Source:** [${source.title.replaceAll('[', '').replaceAll(']', '')}](${source.url})\n\n**Supporting passage (search extract):** “${card.supportQuote}”\n\nRetrieved ${source.retrievedAt?.slice(0, 10) || 'date not recorded'}.\n\n` : '') +
    (note?.trim() ? `**My note:** ${note.trim()}\n\n` : '')
}
export function guideMarkdown(safari, cards, { savedOnly = false } = {}) {
  let output = `# Evidence Safari${savedOnly ? ' — field guide' : ''}\n\n${safari.challenge}\n\nPrepared ${safari.generatedAt.slice(0, 10)} · ${cards.length} findings\n\n`
  if (safari.reflection?.trim()) output += `## What changed my thinking\n\n${safari.reflection.trim()}\n\n`
  for (const station of safari.stations) {
    const findings = cards.filter(c => c.lens === station.lens)
    if (!findings.length) continue
    output += `## ${station.lens} — ${station.title}\n\n`
    for (const card of findings) output += cardMarkdown(card, safari.sources.find(s => s.id === card.sourceId), safari.notes?.[card.id])
  }
  output += `---\n\nFindings were checked by an AI model against search-provider extracts, not independently verified against full texts. Connections to the challenge are hypotheses.\n`
  if (!savedOnly && safari.gaps?.length) output += `\n## Questions still open\n\n${safari.gaps.map(g => `- ${g}`).join('\n')}\n`
  return output
}
export async function copyText(text) {
  if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return } catch { /* Fall back on older/insecure browsers. */ } }
  const area = document.createElement('textarea')
  area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'
  const focused = document.activeElement
  // Elements outside an open native dialog are inert, including a fallback textarea.
  ;(document.querySelector('dialog[open]') || document.body).append(area)
  area.focus(); area.select()
  const copied = document.execCommand('copy'); area.remove(); focused?.focus({ preventScroll: true })
  if (!copied) throw Error('Copy was blocked by the browser. Use Download instead.')
}
export function downloadGuide(text, challenge) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = `${challenge.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70)}-field-guide.md`
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
