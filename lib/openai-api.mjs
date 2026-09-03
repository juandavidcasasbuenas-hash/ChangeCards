import fs from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'

function readApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim()

  const candidates = [
    process.env.OPENAI_API_KEY_FILE,
    path.join(process.cwd(), 'OpenAI.txt'),
    path.join(process.cwd(), 'OpenAi.txt'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const raw = fs.readFileSync(candidate, 'utf8').trim()
    const labelled = raw.match(/(?:OPENAI_API_KEY|OpenAI)\s*[:=]\s*["']?(sk-[A-Za-z0-9_-]+)/i)
    const standalone = raw.match(/^\s*["']?(sk-[A-Za-z0-9_-]+)["']?\s*$/m)
    const value = labelled?.[1] || standalone?.[1]
    if (value) return value
  }

  return null
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['transformations'],
  properties: {
    transformations: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'idea', 'shift'],
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 70 },
          idea: { type: 'string', minLength: 20, maxLength: 260 },
          shift: { type: 'string', minLength: 8, maxLength: 120 },
        },
      },
    },
  },
}

const sparkSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sparks'],
  properties: {
    sparks: {
      type: 'array',
      minItems: 10,
      maxItems: 10,
      items: { type: 'string', minLength: 2, maxLength: 180 },
    },
  },
}

const systemPrompt = `You are the optional inspiration engine inside a design-thinking Change Cards tool.

Your job is not to decide the user's next idea. Offer three editable starting points in response to a specific creative provocation.

In Evolve mode, the current idea is the source of truth. Preserve its purpose, audience, format, and all useful commitments from earlier steps unless the card explicitly challenges one of them. Change one main dimension only: the dimension named by the card. Do not hybridise several concepts, bolt on unrelated features, reset to the original idea, or contradict previous choices. The three options should feel like coherent siblings: different ways to answer the same card while continuing the same trajectory.

In Swarm mode, range more widely. The original idea must remain recognisable, but strange and divergent mutations are welcome.

Every option must apply the card strongly rather than superficially, be concrete enough to imagine doing, avoid generic innovation language, avoid merely adding features, remain concise, and differ materially from the other two.

Write each result as an altered version of the idea, not as a recommendation. Prefer surprising but plausible ideas over safe suggestions. Titles should be vivid and specific. The idea field must be one compact sentence of no more than 35 words. The shift field should plainly name what changed in no more than 16 words.

Return only data matching the supplied schema.`

const sparkSystemPrompt = `You create tiny, optional sparks for a design-thinking Change Card.

Return exactly ten sparks. The selected card's QUESTION is the dominant instruction. First infer what kind of answer that question asks for, then make every spark a plausible direct answer fragment of that same kind:
- "who" or a team question -> specific people, roles, communities, or useful combinations of them
- "what would you make/build" -> concrete artifacts, actions, formats, or experiments
- an opposite/inversion question -> concise inversions of something actually present
- a scale, evidence, audience, flaw, or assumption question -> concrete answers to that exact dimension
Do not drift into adjacent advice. For example, a Dream Team card must spark people or roles, not workshop formats, abstract values, or generic activities.

When a CARD-SPECIFIC SPARK BRIEF is supplied, treat it as an authoritative clarification of the kind of answer the card needs. It narrows the question; it does not replace the user's context or invite complete solutions.

Use the original idea and all saved workshop notes to choose answers that fit the user's real subject, audience, constraints, vocabulary, and trajectory. Wider context should make the answers more relevant; it must never change the requested answer type. Give the selected question roughly 80% of your attention and the wider lineage 20%.

When ROUTE CONTEXT is supplied, use the route purpose and earlier responses as a quiet connective thread. Answer only the current card's question: do not anticipate later steps, recap the route, or turn the spark into a complete solution.

Each spark may be a single strong keyword, a natural noun phrase, or a very short question. Use as many words as needed for immediate sense, usually one to seven and never more than twelve. Count the words before returning it, and finish on a complete, grammatical phrase rather than an article or preposition. These are fragments that help the user write, not complete ideas, slogans, categories, explanations, or instructions. Make each option materially different.

Prefer concrete nouns and specific roles over abstract language. Never mash unrelated nouns together merely to sound clever. Avoid generic creativity language such as think bigger, new perspective, user centred, innovate, imagine, explore, transform, or be bold. Do not number or label the sparks. Return only data matching the supplied schema.`

function missingPart(response, message) {
  return response.status(400).json({ error: message })
}

function missingKey(response) {
  return response.status(503).json({ error: 'No OpenAI key is configured on the server.' })
}

function modelError(response, error, fallback) {
  console.error('Change Cards generation failed:', error?.status || error?.name || error)
  const status = error?.status === 401 ? 401 : 502
  const message = error?.status === 401 ? 'The OpenAI API key was not accepted.' : fallback
  return response.status(status).json({ error: message })
}

function normaliseSpark(spark) {
  const labelledParts = spark.split(';').map((part) => part.trim())
  if (labelledParts.length === 3 && labelledParts.every((part) => part.includes(':'))) {
    return labelledParts.map((part) => {
      const separator = part.indexOf(':')
      const label = part.slice(0, separator).trim()
      let words = part.slice(separator + 1).trim().split(/\s+/)
      if (words.length > 3) {
        words = words.filter((word) => !['a', 'an', 'the'].includes(word.toLowerCase().replace(/[^a-z]/g, '')))
      }
      if (words.length > 3) words = words.slice(-3)
      return `${label}: ${words.join(' ')}`
    }).join('; ')
  }

  const words = spark.trim().split(/\s+/)
  for (let index = words.length - 2; words.length > 12 && index > 0; index -= 1) {
    if (['a', 'an', 'the', 'that', 'very'].includes(words[index].toLowerCase().replace(/[^a-z]/g, ''))) words.splice(index, 1)
  }
  return words.slice(0, 12).join(' ').replace(/[,:;—-]+$/, '')
}

export function health(_request, response) {
  response.json({ ok: true, configured: Boolean(readApiKey()) })
}

export async function transform(request, response) {
  const {
    originalIdea,
    currentIdea,
    mode,
    cardCategory,
    cardTitle,
    cardProvocation,
    previousTransformations = [],
  } = request.body || {}

  if (!originalIdea || !currentIdea || !cardTitle || !cardProvocation) {
    return missingPart(response, 'The card is missing part of its idea.')
  }
  if (String(originalIdea).length > 1200 || String(currentIdea).length > 1200) {
    return missingPart(response, 'Keep the idea under 1,000 characters.')
  }

  const apiKey = readApiKey()
  if (!apiKey) return missingKey(response)

  try {
    const client = new OpenAI({ apiKey })
    const result = await client.responses.create({
      model: 'gpt-5.6-sol',
      reasoning: { effort: 'medium' },
      input: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            originalIdea,
            currentIdea,
            mode,
            cardCategory,
            cardTitle,
            cardProvocation,
            previousTransformations: previousTransformations.slice(-8),
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'change_card_transformations',
          strict: true,
          schema,
        },
      },
    })

    const parsed = JSON.parse(result.output_text)
    if (!Array.isArray(parsed.transformations) || parsed.transformations.length !== 3) {
      throw new Error('Unexpected transformation count')
    }
    return response.json(parsed)
  } catch (error) {
    return modelError(response, error, 'That card slipped off the table. Try dealing it again.')
  }
}

export async function sparks(request, response) {
  const {
    originalIdea,
    currentIdea,
    cardCategory,
    cardTitle,
    cardProvocation,
    cardSparkBrief,
    previousTransformations = [],
    routeId,
    routeName,
    routePurpose,
    routeStep,
    routeLength,
    previousRouteResponses = [],
  } = request.body || {}

  if (!originalIdea || !currentIdea || !cardTitle || !cardProvocation) {
    return missingPart(response, 'The spark is missing part of its idea.')
  }
  if (String(originalIdea).length > 1200 || String(currentIdea).length > 1200) {
    return missingPart(response, 'Keep the idea under 1,000 characters.')
  }

  const apiKey = readApiKey()
  if (!apiKey) return missingKey(response)

  try {
    const client = new OpenAI({ apiKey })
    const result = await client.responses.create({
      model: 'gpt-5.6-luna',
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: sparkSystemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            originalIdea,
            currentIdea,
            cardCategory,
            cardTitle,
            cardProvocation,
            cardSparkBrief,
            previousTransformations: previousTransformations.slice(-20),
            routeContext: routeId ? {
              routeId,
              routeName,
              routePurpose,
              step: routeStep,
              length: routeLength,
              previousResponses: previousRouteResponses.slice(-3),
            } : undefined,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'change_card_sparks',
          strict: true,
          schema: sparkSchema,
        },
      },
    })

    const parsed = JSON.parse(result.output_text)
    const nextSparks = parsed.sparks?.map(normaliseSpark)
    if (!Array.isArray(nextSparks) || nextSparks.length !== 10 || nextSparks.some((spark) => !spark)) {
      throw new Error('Unexpected spark format')
    }
    return response.json({ sparks: nextSparks })
  } catch (error) {
    return modelError(response, error, 'No sparks landed. Try catching them again.')
  }
}
