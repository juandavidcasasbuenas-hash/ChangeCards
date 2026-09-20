import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import { readApiKey } from '../openai-api.mjs'
import { assertSchema } from './schema.mjs'

export const MODEL = 'gpt-5.6-luna'
export const PRICES = { asOf: '2026-09-05', inputPerMillion: 0.2, outputPerMillion: 1.2, searchPerRequest: 0.005 }
export const hash = (value) => createHash('sha256').update(value).digest('hex')

export class Budget {
  constructor(limit = 0.40) {
    if (!Number.isFinite(limit) || limit <= 0 || limit > 5) throw new Error('Budget must be greater than zero and at most $5.')
    this.limit = limit; this.committed = 0; this.entries = []
  }
  reserve(label, ceiling) {
    if (this.committed + ceiling > this.limit) throw new Error(`Budget limit reached before ${label}.`)
    this.committed += ceiling
    const entry = { label, reservedUsd: ceiling, estimatedUsd: ceiling, status: 'reserved' }
    this.entries.push(entry)
    return (usd, extra = {}) => {
      // Failed/ambiguous requests retain their reservation; never assume they were free.
      this.committed += usd - entry.estimatedUsd
      Object.assign(entry, extra, { estimatedUsd: usd, status: 'reported' })
    }
  }
  report() { return { currency: 'USD', limitUsd: this.limit, estimatedUsd: Number(this.committed.toFixed(6)), rates: PRICES, entries: this.entries } }
}

export class FileCache {
  constructor(directory, ttlMs = 24 * 60 * 60 * 1000) { this.directory = directory; this.ttlMs = ttlMs }
  async get(key) {
    if (!this.directory) return null
    try {
      const entry = JSON.parse(await fs.readFile(path.join(this.directory, `${hash(key)}.json`), 'utf8'))
      return Date.now() - entry.savedAt < this.ttlMs ? entry.value : null
    } catch { return null }
  }
  async set(key, value) {
    if (!this.directory) return
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const filename = path.join(this.directory, `${hash(key)}.json`)
    const temporary = `${filename}.${process.pid}.${crypto.randomUUID()}.tmp`
    await fs.writeFile(temporary, JSON.stringify({ savedAt: Date.now(), value }), { mode: 0o600 })
    await fs.rename(temporary, filename)
  }
}

async function searchKey() {
  if (process.env.PERPLEXITY_API_KEY) return process.env.PERPLEXITY_API_KEY.trim()
  if (!process.env.PERPLEXITY_API_KEY_FILE) return null
  const raw = await fs.readFile(process.env.PERPLEXITY_API_KEY_FILE, 'utf8')
  return raw.match(/(?:PERPLEXITY_API_KEY|Perplexity)\s*[:=]\s*["']?(pplx-[\w-]+)/i)?.[1]
    || raw.match(/^\s*["']?(pplx-[\w-]+)["']?\s*$/m)?.[1] || null
}

export async function createProviders({ budget, cache, signal }) {
  const apiKey = readApiKey()
  const perplexityKey = await searchKey()
  if (!apiKey || !perplexityKey) throw new Error('Configure server-side OPENAI_API_KEY and PERPLEXITY_API_KEY (or their _FILE variables).')
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 90000 })
  return {
    async model({ stage, system, data, schema, maxTokens = 4500 }) {
      signal?.throwIfAborted()
      const input = JSON.stringify(data)
      // UTF-8 bytes conservatively bound input tokens; include schema and framing overhead.
      const inputCeiling = Buffer.byteLength(system + input + JSON.stringify(schema), 'utf8') + 2048
      const settle = budget.reserve(stage, (inputCeiling * PRICES.inputPerMillion + maxTokens * PRICES.outputPerMillion) / 1e6)
      const result = await client.responses.create({
        model: MODEL, reasoning: { effort: 'low' }, store: false, max_output_tokens: maxTokens,
        input: [{ role: 'system', content: system }, { role: 'user', content: input }],
        text: { format: { type: 'json_schema', name: stage.replace(/\W/g, '_'), strict: true, schema } },
      }, { signal })
      if (result.usage) settle((result.usage.input_tokens * PRICES.inputPerMillion + result.usage.output_tokens * PRICES.outputPerMillion) / 1e6,
        { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens })
      if (result.status !== 'completed' || !result.output_text) throw new Error(`Incomplete model response at ${stage}.`)
      return assertSchema(JSON.parse(result.output_text), schema)
    },
    async search(queries) {
      signal?.throwIfAborted()
      const body = { query: queries, max_results: 12, max_tokens: 16000, max_tokens_per_page: 1800 }
      const cacheKey = `perplexity-search-v1:${JSON.stringify(body)}`
      const cached = await cache?.get(cacheKey)
      if (cached) return { ...cached, cacheHit: true }
      const settle = budget.reserve('search', PRICES.searchPerRequest)
      const response = await fetch('https://api.perplexity.ai/search', {
        method: 'POST', headers: { Authorization: `Bearer ${perplexityKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(30000)]),
      })
      if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`)
      settle(PRICES.searchPerRequest)
      const payload = await response.json()
      if (!Array.isArray(payload.results)) throw new Error('Search provider returned an invalid result shape.')
      const result = { results: payload.results, retrievedAt: new Date().toISOString(), cacheHit: false }
      await cache?.set(cacheKey, result)
      return result
    },
  }
}
