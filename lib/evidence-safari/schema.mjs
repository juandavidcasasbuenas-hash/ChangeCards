export const LENSES = {
  People: 'Behaviours, needs, frustrations, motivations, workarounds and lived experience.',
  Patterns: 'Statistics, trends, prevalence, scale, correlations and measured outcomes.',
  Systems: 'Stakeholders, incentives, dependencies, bottlenecks and unintended consequences.',
  Elsewhere: 'Analogous mechanisms in different sectors, disciplines, countries and cultures.',
  Edges: 'Outliers, excluded groups, exceptions, failures and counterevidence.',
  Possibilities: 'Documented experiments, evaluated interventions and emerging practices.',
}
export const DISCIPLINES = ['psychology', 'sociology', 'economics', 'education', 'public health', 'design and HCI', 'public policy', 'organisational studies', 'ecology', 'engineering', 'other']
const str = { type: 'string' }
const arr = (items) => ({ type: 'array', items })
const en = (values) => ({ type: 'string', enum: values })
export const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
export const planSchema = obj({
  framing: str, assumptions: arr(str), researchGaps: arr(str),
  lanes: obj(Object.fromEntries(Object.keys(LENSES).map((lens) => [lens, obj({ mechanism: str, queries: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string', minLength: 8, maxLength: 240 } } })]))),
})
export const cardSchema = obj({
  title: str, takeaway: str, finding: str, sourceId: str, passageId: str,
  discipline: en(DISCIPLINES), context: str,
  evidenceType: en(['systematic_review', 'experiment', 'observational', 'qualitative', 'official_statistics', 'case_study', 'guidance', 'theory']),
  sourceRole: en(['primary', 'research_synthesis', 'institutional_guidance', 'secondary', 'unclear']),
  qualityReason: str, limitation: str,
  relevance: en(['direct', 'adjacent', 'analogy']),
  connection: str, transferCaution: str, discussionQuestion: str,
  studyKey: str,
})
export const draftSchema = obj({ cards: arr(cardSchema), gaps: arr(str) })
export const auditSchema = obj({ verdicts: arr(obj({
  id: str, supported: { type: 'boolean' }, sourceSuitable: { type: 'boolean' },
  contextAccurate: { type: 'boolean' }, transferHonest: { type: 'boolean' }, substantive: { type: 'boolean' },
  reason: str, duplicateOf: str,
})) })

export function parseInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object.')
  const { challenge, context = '', geography = '', targetCount = 24 } = input
  if (typeof challenge !== 'string' || challenge.trim().length < 8 || challenge.length > 1200) throw new Error('Challenge must contain 8–1,200 characters.')
  for (const [name, value] of Object.entries({ context, geography })) {
    if (typeof value !== 'string' || value.length > (name === 'context' ? 1600 : 120)) throw new Error(`${name} is too long or is not text.`)
  }
  if (!Number.isInteger(targetCount) || targetCount < 18 || targetCount > 36) throw new Error('targetCount must be an integer between 18 and 36.')
  return { challenge: challenge.trim(), context: context.trim(), geography: geography.trim(), targetCount }
}

// Keep validation at the provider boundary even with strict structured output.
export function assertSchema(value, schema, at = '$') {
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`Invalid enum at ${at}`)
  if (schema.type === 'string' && typeof value !== 'string') throw new Error(`Expected text at ${at}`)
  if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Expected boolean at ${at}`)
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`Expected array at ${at}`)
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) throw new Error(`Invalid array length at ${at}`)
    value.forEach((item, i) => assertSchema(item, schema.items, `${at}[${i}]`))
  }
  if (schema.type === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))) throw new Error(`Invalid text length at ${at}`)
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected object at ${at}`)
    for (const [key, field] of Object.entries(schema.properties)) assertSchema(value[key], field, `${at}.${key}`)
    if (Object.keys(value).some((key) => !(key in schema.properties))) throw new Error(`Unexpected field at ${at}`)
  }
  return value
}
