import { LENSES } from './schema.mjs'
const line = (value) => String(value).replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').trim()
export function toMarkdown(safari) {
  const sourceMap = new Map(safari.sources.map((s) => [s.id, s]))
  const out = [`# Evidence safari: ${line(safari.challenge)}`, '', line(safari.framing), '',
    `Status: **${safari.status}** · ${safari.cards.length} records · ${safari.coverage.sourceCount} sources · ${(safari.durationMs / 1000).toFixed(1)}s · estimated API cost $${safari.cost.estimatedUsd.toFixed(4)}`, '',
    'Findings describe source evidence. Connections and questions are prompts for discovery, not established effects in your context. Source passages are supplied by the search provider; checks are automated, not a human literature review.', '',
    '## Scope and assumptions', '', ...safari.assumptions.map((x) => `- ${line(x)}`), '']
  for (const lens of Object.keys(LENSES)) {
    out.push(`## ${lens}`, '')
    for (const card of safari.cards.filter((c) => c.lens === lens)) {
      const s = sourceMap.get(card.sourceId)
      out.push(`### ${line(card.title)}`, '', line(card.finding), '',
        `**Why it might matter (${card.relevance}):** ${line(card.connection)}`, '',
        `**Explore:** ${line(card.discussionQuestion)}`, '',
        `**Original context:** ${line(card.context)}`, '',
        `**Evidence:** ${card.evidenceType.replaceAll('_', ' ')} · ${card.discipline}. ${line(card.qualityReason)}`, '',
        `**Limits:** ${line(card.limitation)} ${line(card.transferCaution)}`, '',
        `**Source:** [${line(s.title).replace(/[\[\]]/g, '')}](${s.url.replaceAll('(', '%28').replaceAll(')', '%29')}) · ${s.publishedAt || 'date not reported'} (provider metadata) · retrieved ${s.retrievedAt.slice(0, 10)}`, '',
        `> ${line(card.supportQuote)}`, '')
    }
  }
  out.push('## Gaps to explore', '', ...safari.gaps.map((x) => `- ${line(x)}`), '')
  if (safari.warnings.length) out.push('## Run limitations', '', ...safari.warnings.map((x) => `- ${line(x)}`), '')
  return out.join('\n')
}
