import { timingSafeEqual } from 'node:crypto'
import { runSafari } from './engine.mjs'
import { parseInput } from './schema.mjs'

// This backend-only endpoint is opt-in. Do not expose a shared token in browser code.
const cacheEntries = new Map()
const cache = {
  async get(key) {
    const value = cacheEntries.get(key)
    if (!value || Date.now() - value.at > 86400000) { cacheEntries.delete(key); return null }
    return structuredClone(value.data)
  },
  async set(key, data) {
    if (cacheEntries.size >= 32) cacheEntries.delete(cacheEntries.keys().next().value)
    cacheEntries.set(key, { at: Date.now(), data: structuredClone(data) })
  },
}
let active = 0
function authorised(header, token) {
  const supplied = Buffer.from(typeof header === 'string' ? header : '')
  const expected = Buffer.from(`Bearer ${token}`)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export function createSafariHandler(run = runSafari) {
  return async function evidenceSafari(request, response) {
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ error: 'Use POST.' }) }
    const token = process.env.EVIDENCE_SAFARI_TOKEN
    if (!token) return response.status(503).json({ error: 'Evidence Safari HTTP access is not enabled. Configure EVIDENCE_SAFARI_TOKEN on the server, or use the CLI.' })
    if (!authorised(request.headers.authorization, token)) return response.status(401).json({ error: 'Unauthorised.' })
    let input
    try { input = parseInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
    if (active >= 2) { response.setHeader('Retry-After', '30'); return response.status(429).json({ error: 'Two safaris are already running. Retry shortly.' }) }
    const controller = new AbortController()
    const close = () => { if (!response.writableEnded) controller.abort() }
    response.on('close', close)
    active++
    try {
      const result = await run(input, { cache, signal: controller.signal, maxCostUsd: 0.40 })
      // Public response contains the short traceable passage; full extracts stay server-side.
      const sources = result.sources.map(({ content, passages, ...source }) => source)
      return response.json({ ...result, sources })
    } catch (error) {
      console.error('Evidence Safari failed:', error?.status || error?.name || 'Error')
      return response.status(502).json({ error: 'The evidence run could not finish. Check server configuration and provider availability.' })
    } finally { active--; response.off('close', close) }
  }
}
export const evidenceSafari = createSafariHandler()
