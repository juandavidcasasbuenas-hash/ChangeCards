import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createWebSafariHandler, runWebSafari } from '../lib/evidence-safari/web.mjs'
import { presentSafari, publicSafari } from '../lib/evidence-safari/presentation.mjs'
import { FileCache, Budget } from '../lib/evidence-safari/providers.mjs'
import { VERSION } from '../lib/evidence-safari/engine.mjs'
import { parseInput, LENSES } from '../lib/evidence-safari/schema.mjs'
import { guideMarkdown } from '../src/safari/field-guide.js'
import { requestSafari } from '../src/safari/stream.js'

const sample = JSON.parse(await readFile(new URL('../public/safari/example/workshop.json', import.meta.url), 'utf8'))
const input = parseInput({ challenge: sample.challenge })
const response = () => Object.assign(new EventEmitter(), {
  code: 200, headers: {}, chunks: [], writableEnded: false,
  setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this },
  json(data) { this.data = data; return this }, write(chunk) { this.chunks.push(JSON.parse(chunk)); return true }, end() { this.writableEnded = true },
})
const request = (patch = {}) => ({ method: 'POST', headers: { origin: 'https://example.org', host: 'example.org' }, body: input, socket: { remoteAddress: '127.0.0.1' }, ...patch })

test('browser endpoint requires same origin, validates before spending and limits repeated requests', async () => {
  let calls = 0
  const handler = createWebSafariHandler(async (data, { onEvent }) => { calls++; await onEvent({ type: 'result', safari: sample }); await onEvent({ type: 'done' }) }, { perHour: 1 })
  let res = response()
  await handler(request({ headers: { origin: 'https://other.org', host: 'example.org' } }), res)
  assert.equal(res.code, 403)
  res = response(); await handler(request({ body: { challenge: 'tiny' } }), res)
  assert.equal(res.code, 400); assert.equal(calls, 0)
  res = response(); await handler(request(), res)
  assert.equal(res.code, 200); assert.equal(calls, 1)
  assert.deepEqual(res.chunks.map(c => c.type), ['result', 'done'])
  assert.equal(res.headers['Content-Type'], 'application/x-ndjson; charset=utf-8')
  res = response(); await handler(request(), res)
  assert.equal(res.code, 429); assert.equal(calls, 1)
})

test('browser disconnect aborts in-flight generation and releases the concurrency slot', async () => {
  let aborted = false
  const handler = createWebSafariHandler(async (_, { signal }) => new Promise(resolve => { signal.addEventListener('abort', () => { aborted = true; resolve() }) }))
  const res = response(), pending = handler(request(), res)
  res.emit('close'); await pending
  assert.equal(aborted, true); assert.equal(res.writableEnded, true)
})

test('browser errors are useful without leaking provider messages or credentials', async () => {
  const handler = createWebSafariHandler(async () => { throw Error('Sensitive upstream details') })
  const res = response(); await handler(request(), res)
  assert.equal(res.chunks[0].type, 'error')
  assert.doesNotMatch(JSON.stringify(res.chunks), /Sensitive/)
})

test('web pipeline makes no image calls, strips legacy artwork and records zero-cost cache hits', async () => {
  const events = [], reports = [], key = `web-safari-v1:${VERSION}:${JSON.stringify(input)}`
  const cache = { async get(k) { return k === key ? sample : null }, async set(k, value) { reports.push({ key: k, value }) } }
  const result = await runWebSafari(input, { cache, imageKey: 'test-only',
    illustrate: () => assert.fail('Image generation must never be called'),
    onEvent: event => events.push(event),
  })
  assert.deepEqual(events.map(e => e.type), ['result', 'done'])
  assert.equal(result.artwork, undefined)
  assert.equal(events[0].safari.artwork, undefined)
  assert.equal(result.cost.estimatedUsd, 0)
  assert.equal(result.cost.limitUsd, .25)
  assert.equal(events[0].safari.cacheHit, true)
  assert.equal(reports.length, 1)
  assert.equal(reports[0].value.kind, 'safari_run')
  assert.equal(reports[0].value.cost.estimatedUsd, 0)
  assert.ok(result.timing.totalMs >= 0)
})

test('a failed usage-ledger write cannot hide usable evidence', async () => {
  const result = await runWebSafari(input, { cache: { async get() { return sample }, async set() { throw Error('Disk full') } } })
  assert.equal(result.cards.length, sample.cards.length)
  assert.equal(result.cost.estimatedUsd, 0)
})

test('station presentation falls back without losing evidence and strips source extracts', async () => {
  const result = await presentSafari({ ...sample, sources: [{ content: 'full extract', passages: ['anchor'], queries: ['query'], id: 'source' }], trace: { searches: [] } }, { provider: { async model() { throw Error('Unavailable') } }, cache: new FileCache(null) })
  assert.equal(result.stations.length, 6)
  assert.equal(result.cards.length, sample.cards.length)
  assert.equal(result.sources[0].content, undefined)
  assert.equal(result.sources[0].passages, undefined)
  assert.equal(result.trace, undefined)
})

test('early evidence uses the same source redaction as final results and has exportable stations', () => {
  const card = sample.cards[0], source = sample.sources.find(s => s.id === card.sourceId)
  const early = publicSafari({ ...sample, stations: undefined, cards: [card], sources: [{ ...source, content: 'full private extract', passages: ['extra text'], queries: ['research query'] }], trace: { rejected: ['private check'] }, status: 'researching' })
  assert.equal(early.stations.length, 6)
  assert.doesNotMatch(JSON.stringify(early), /full private extract|extra text|research query|private check/)
  const output = guideMarkdown(early, early.cards)
  assert.ok(output.includes(source.url) && output.includes(card.supportQuote))
})

test('field-guide export contains selected findings, personal notes, source URLs and transfer limits', () => {
  const card = sample.cards[0], source = sample.sources.find(s => s.id === card.sourceId)
  const output = guideMarkdown({ ...sample, reflection: 'Time is also a cost.', notes: { [card.id]: 'Ask about workload.' } }, [card], { savedOnly: true })
  for (const value of [source.url, card.finding, card.limitation, card.transferCaution, card.supportQuote, 'Time is also a cost.', 'Ask about workload.']) assert.ok(output.includes(value))
  assert.ok(!output.includes(sample.cards[1].finding))
})

test('client stream handles split UTF-8 frames and reports interrupted results', async () => {
  const original = globalThis.fetch
  try {
    const bytes = new TextEncoder().encode(`${JSON.stringify({ type: 'result', safari: { challenge: 'Curiosity — discovery' } })}\n${JSON.stringify({ type: 'done' })}\n`)
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1)); controller.close() } }))
    const events = []
    await requestSafari('A sample challenge', { onEvent: event => events.push(event) })
    assert.equal(events[0].safari.challenge, 'Curiosity — discovery')
    assert.equal(events.at(-1).type, 'done')
    globalThis.fetch = async () => new Response(`${JSON.stringify({ type: 'result', safari: sample })}\n`)
    const interrupted = []
    await requestSafari('A sample challenge', { onEvent: event => interrupted.push(event) })
    assert.equal(interrupted.at(-1).type, 'completion_interrupted')
    globalThis.fetch = async () => new Response('')
    await assert.rejects(requestSafari('A sample challenge', { onEvent() {} }), /ended before evidence/)
    globalThis.fetch = async () => new Response(`${JSON.stringify({ type: 'evidence', safari: { ...sample, cards: sample.cards.slice(0, 3) } })}\n`)
    const partial = []
    await assert.rejects(requestSafari('A sample challenge', { onEvent: event => partial.push(event) }), /ended before evidence/)
    assert.equal(partial[0].safari.cards.length, 3, 'Checked evidence stays available to the UI when the stream ends early')
  } finally { globalThis.fetch = original }
})

test('published example has six populated stations and all claims retain references', () => {
  assert.deepEqual(new Set(sample.stations.map(s => s.lens)), new Set(Object.keys(LENSES)))
  for (const card of sample.cards) {
    assert.ok(sample.sources.some(s => s.id === card.sourceId))
    assert.ok(card.takeaway.length)
    assert.ok(card.verification.quoteMatched)
  }
  assert.ok(sample.cards.length >= 20)
  assert.ok(new Budget(.5).report().limitUsd <= .5)
})
