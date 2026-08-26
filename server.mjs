import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 8787)

app.use(express.json({ limit: '32kb' }))

function readApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim()

  const candidates = [
    process.env.OPENAI_API_KEY_FILE,
    path.join(__dirname, 'OpenAI.txt'),
    path.join(__dirname, 'OpenAi.txt'),
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
      items: { type: 'string', minLength: 2, maxLength: 96 },
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

Use the original idea and all saved workshop notes to choose answers that fit the user's real subject, audience, constraints, vocabulary, and trajectory. Wider context should make the answers more relevant; it must never change the requested answer type. Give the selected question roughly 80% of your attention and the wider lineage 20%.

Each spark may be a single strong keyword, a natural noun phrase, or a very short question. Use as many words as needed for immediate sense, usually one to seven and never more than twelve. These are fragments that help the user write, not complete ideas, slogans, categories, explanations, or instructions. Make each option materially different.

Prefer concrete nouns and specific roles over abstract language. Never mash unrelated nouns together merely to sound clever. Avoid generic creativity language such as think bigger, new perspective, user centred, innovate, imagine, explore, transform, or be bold. Do not number or label the sparks. Return only data matching the supplied schema.`

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, configured: Boolean(readApiKey()) })
})

app.post('/api/transform', async (request, response) => {
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
    return response.status(400).json({ error: 'The card is missing part of its idea.' })
  }

  if (String(originalIdea).length > 1200 || String(currentIdea).length > 1200) {
    return response.status(400).json({ error: 'Keep the idea under 1,000 characters.' })
  }

  const apiKey = readApiKey()
  if (!apiKey) {
    return response.status(503).json({ error: 'No local OpenAI key was found. Add OpenAI.txt and try again.' })
  }

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
    response.json(parsed)
  } catch (error) {
    console.error('Change Cards generation failed:', error?.status || error?.name || 'unknown error')
    const message = error?.status === 401
      ? 'The local API key was not accepted.'
      : 'That card slipped off the table. Try dealing it again.'
    response.status(error?.status === 401 ? 401 : 502).json({ error: message })
  }
})

app.post('/api/sparks', async (request, response) => {
  const {
    originalIdea,
    currentIdea,
    cardCategory,
    cardTitle,
    cardProvocation,
    previousTransformations = [],
  } = request.body || {}

  if (!originalIdea || !currentIdea || !cardTitle || !cardProvocation) {
    return response.status(400).json({ error: 'The spark is missing part of its idea.' })
  }

  if (String(originalIdea).length > 1200 || String(currentIdea).length > 1200) {
    return response.status(400).json({ error: 'Keep the idea under 1,000 characters.' })
  }

  const apiKey = readApiKey()
  if (!apiKey) {
    return response.status(503).json({ error: 'No local OpenAI key was found. Add OpenAI.txt and try again.' })
  }

  try {
    const client = new OpenAI({ apiKey })
    const result = await client.responses.create({
      model: 'gpt-5.6-sol',
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
            previousTransformations: previousTransformations.slice(-20),
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
    const sparks = parsed.sparks?.map((spark) => spark.trim())
    if (!Array.isArray(sparks) || sparks.length !== 10 || sparks.some((spark) => spark.split(/\s+/).length > 12)) {
      throw new Error('Unexpected spark format')
    }
    response.json({ sparks })
  } catch (error) {
    console.error('Change Cards spark generation failed:', error?.status || error?.name || 'unknown error')
    const message = error?.status === 401
      ? 'The local API key was not accepted.'
      : 'No sparks landed. Try catching them again.'
    response.status(error?.status === 401 ? 401 : 502).json({ error: message })
  }
})

const dist = path.join(__dirname, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*path', (_request, response) => response.sendFile(path.join(dist, 'index.html')))
}

app.listen(port, () => {
  console.log(`Change Cards server ready on http://localhost:${port}`)
})
