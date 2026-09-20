import path from 'node:path'
import { tmpdir } from 'node:os'
import { runSafari, VERSION } from './engine.mjs'
import { Budget, FileCache, createProviders } from './providers.mjs'
import { presentSafari, publicSafari } from './presentation.mjs'
import { parseInput } from './schema.mjs'

const cacheRoot = process.env.VERCEL ? path.join(tmpdir(), 'evidence-safari') : '.cache/evidence-safari-web'

// Category doodles are static assets. Research never invokes an image provider.
export async function runWebSafari(raw, options = {}) {
  const started = Date.now(), stages = []
  let firstEvidenceMs = null
  const input = parseInput(raw)
  const budget = options.budget || new Budget(0.25)
  const cache = options.cache || new FileCache(cacheRoot)
  const emit = options.onEvent || (() => {})
  const signal = options.signal || AbortSignal.timeout(280000)
  const cacheKey = `web-safari-v1:${VERSION}:${JSON.stringify(input)}`
  let safari = await cache.get(cacheKey)
  if (safari) {
    safari = { ...safari, cacheHit: true, originalCost: safari.cost, cost: budget.report() }
  } else {
    const provider = options.provider || await createProviders({ budget, cache, signal })
    const rawSafari = await runSafari(input, { budget, cache, provider, signal,
      onEvidence: async (snapshot) => {
        if (snapshot.cards.length && firstEvidenceMs === null) firstEvidenceMs = Date.now() - started
        await emit({ type: 'evidence', safari: publicSafari(snapshot) })
      },
      onProgress: (progress) => {
        if (progress.stage === 'finished') return
        if (stages.at(-1)?.stage !== progress.stage) stages.push({ stage: progress.stage, elapsedMs: Date.now() - started })
        emit({ type: 'progress', ...progress })
      },
    })
    signal.throwIfAborted()
    if (!rawSafari.cards.length) throw Error('We could not find enough supported evidence for this challenge. Try adding a setting or population.')
    stages.push({ stage: 'curating', elapsedMs: Date.now() - started })
    await emit({ type: 'progress', stage: 'curating', elapsedMs: Date.now() - started })
    safari = await presentSafari(rawSafari, { provider, cache })
    safari.cost = budget.report()
    if (safari.status === 'complete') await cache.set(cacheKey, safari)
  }
  signal.throwIfAborted()
  const timing = { totalMs: Date.now() - started, firstEvidenceMs: firstEvidenceMs ?? Date.now() - started, overlappingStages: true, stages }
  // Keep the final run ledger even for partial safaris, independently of result caching.
  const report = { kind: 'safari_run', safariId: safari.id, challenge: safari.challenge, generatedAt: new Date().toISOString(), status: safari.status, cacheHit: safari.cacheHit, cost: budget.report(), timing }
  try { await cache.set?.(`run-report:${safari.id}:${started}`, report) } catch { /* Optional telemetry must not hide usable evidence. */ }
  const evidence = publicSafari(safari)
  await emit({ type: 'result', safari: { ...evidence, timing } })
  const completion = { type: 'done', safariId: safari.id, cost: budget.report(), timing }
  await emit(completion)
  return { ...evidence, cost: completion.cost, timing }
}

export function createWebSafariHandler(run = runWebSafari, { perHour = 8, dailyRuns = 60, now = Date.now } = {}) {
  const visitors = new Map()
  let active = 0, day = '', usedToday = 0
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ error: 'Use POST.' }) }
    // Browser route: never ship the service token or provider credentials to the client.
    const host = request.headers.host
    let origin
    try { origin = new URL(request.headers.origin) } catch { /* Missing origin is rejected. */ }
    const local = process.env.NODE_ENV !== 'production' && !process.env.VERCEL && origin && ['localhost', '127.0.0.1'].includes(origin.hostname) && /^(localhost|127\.0\.0\.1)(:|$)/.test(host || '')
    if (!origin || (!local && origin.host !== host)) return response.status(403).json({ error: 'Open Evidence Safari on this website to begin.' })
    let input
    try { input = parseInput(request.body) } catch (error) { return response.status(400).json({ error: error.message }) }
    const stamp = now(), today = new Date(stamp).toISOString().slice(0, 10)
    if (today !== day) { day = today; usedToday = 0 }
    for (const [ip, entry] of visitors) if (entry.until <= stamp) visitors.delete(ip)
    // Vercel supplies this header; do not trust arbitrary forwarded IPs on Express.
    const ip = process.env.VERCEL ? String(request.headers['x-vercel-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0] : request.socket?.remoteAddress || 'unknown'
    const visitor = visitors.get(ip) || { count: 0, until: stamp + 3600000 }
    if (visitor.count >= perHour || usedToday >= dailyRuns || active >= 2) {
      response.setHeader('Retry-After', active >= 2 ? '30' : '3600')
      return response.status(429).json({ error: active >= 2 ? 'Two safaris are being prepared. Please try again shortly.' : 'The safari allowance has been reached. Your saved field guides are still available; try again later.' })
    }
    visitor.count++; visitors.set(ip, visitor); usedToday++; active++
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(280000)])
    const disconnect = () => controller.abort()
    response.on('close', disconnect)
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    response.setHeader('X-Accel-Buffering', 'no')
    response.flushHeaders?.()
    const emit = async (event) => {
      if (controller.signal.aborted || response.writableEnded) return
      response.write(`${JSON.stringify(event)}\n`)
    }
    try {
      await run(input, { signal, onEvent: emit })
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = /configure server-side/i.test(error.message) ? 'Evidence search is not configured on this server yet.'
          : /could not find enough/.test(error.message) ? error.message
          : /budget limit/.test(error.message) ? 'This search reached its cost limit. Try a more specific challenge.'
          : signal.aborted ? 'This search took too long. Try again with a little more context.'
          : 'The evidence search was interrupted. Please try again.'
        await emit({ type: 'error', message })
      }
    } finally {
      active--; response.off('close', disconnect); response.end()
    }
  }
}

export const safariWeb = createWebSafariHandler()
