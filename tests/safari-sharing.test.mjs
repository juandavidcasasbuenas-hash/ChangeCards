import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas, DocumentRecordType, PageRecordType } from '@tldraw/tlschema'
import { JsonChunkAssembler, getTlsyncProtocolVersion } from '@tldraw/sync-core'
import { safariShapeSchemas } from '../shared/safari-shapes.mjs'
import { prepareSharedBoard, parseSessionLink, sessionLink } from '../shared/safari-session.mjs'
import { createSafariSessionHandler } from '../lib/safari-session.mjs'

const schema = createTLSchema({ shapes: { ...defaultShapeSchemas, ...safariShapeSchemas }, bindings: defaultBindingSchemas })
const page = PageRecordType.create({ id: 'page:page', name: 'Evidence Safari', index: 'a1', meta: { safariSeenIds: ['one'], safariActiveLens: 'People' } })
const card = schema.types.shape.create({ id: 'shape:one', type: 'safari-evidence-card', parentId: page.id, index: 'a1', props: { w: 348, h: 348,
  evidence: { card: { id: 'one', title: 'A public example', finding: 'A finding', lens: 'People' }, source: { id: 'source', url: 'https://example.org/research' } } } })
const document = DocumentRecordType.create({ id: 'document:document' })
const safari = { id: 'test-example', challenge: 'A public test challenge', status: 'complete' }
const snapshot = { store: Object.fromEntries([page, card, document].map(record => [record.id, record])), schema: schema.serialize() }
const board = () => prepareSharedBoard(safari, snapshot)

test('sharing preserves findings, references and positions but excludes personal navigation and reading', () => {
  const result = board()
  assert.deepEqual(result.snapshot.store[card.id], card)
  assert.equal(result.snapshot.store[page.id].meta.safariSeenIds, undefined)
  assert.equal(result.snapshot.store[page.id].meta.safariActiveLens, undefined)
  assert.deepEqual(snapshot.store[page.id].meta.safariSeenIds, ['one'])
  assert.throws(() => prepareSharedBoard({ ...safari, status: 'researching' }, snapshot), /Finish/)
  assert.throws(() => prepareSharedBoard(safari, { ...snapshot, store: { ...snapshot.store, camera: { typeName: 'camera' } } }), /document/)
})

test('invite links keep the edit capability out of paths and reject incomplete keys', () => {
  const access = { roomId: randomUUID(), key: randomBytes(32).toString('base64url') }
  const url = new URL(sessionLink('https://example.org', access))
  assert.equal(url.search, '')
  assert.deepEqual(parseSessionLink(url.pathname, url.hash), access)
  assert.throws(() => parseSessionLink(url.pathname, ''), /incomplete/)
})

test('creation endpoint enforces same origin, completed evidence, and keeps the server secret private', async () => {
  let calls = 0
  const handler = createSafariSessionHandler({ env: { SAFARI_SYNC_URL: 'https://sync.example', SAFARI_SYNC_SECRET: 'server-secret', VERCEL: '1' }, fetcher: async (_url, opts) => {
    calls++; assert.equal(opts.headers.Authorization, 'Bearer server-secret'); assert.notEqual(opts.headers['X-Safari-Visitor'], '127.0.0.1')
    return Response.json({ ok: true })
  } })
  const response = () => ({ code: 0, result: null, setHeader() {}, status(code) { this.code = code; return this }, json(result) { this.result = result; return this } })
  const req = { method: 'POST', headers: { origin: 'https://bad.example', host: 'example.org' }, body: { ...board(), roomId: randomUUID(), key: randomBytes(32).toString('base64url') } }
  let res = response(); await handler(req, res); assert.equal(res.code, 403); assert.equal(calls, 0)
  res = response(); await handler({ ...req, headers: { ...req.headers, origin: 'https://example.org' } }, res)
  assert.equal(res.code, 200); assert.equal(calls, 1); assert.equal(JSON.stringify(res.result).includes('server-secret'), false)
})

test('native sync: two clients, concurrent edits, access checks, idempotent creation and durable reopen', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'safari-sync-test-'))
  const bundled = await build({ entryPoints: ['workers/safari-sync/worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] })
  const options = convertV4MiniflareOptions({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-10-09',
    bindings: { SAFARI_SYNC_SECRET: 'test-only-secret', ALLOWED_ORIGINS: 'https://example.org' },
    durableObjects: { SAFARI_ROOMS: { className: 'SafariRoom', useSQLite: true }, SAFARI_QUOTA: { className: 'SafariQuota', useSQLite: true } }, durableObjectsPersist: directory })
  options.resourcePersistencePath = directory
  let mf = new Miniflare(options)
  const roomId = randomUUID(), key = randomBytes(32).toString('base64url'), endpoint = `https://sync.example/rooms/${roomId}`
  const auth = { Authorization: `Bearer ${key}`, Origin: 'https://example.org' }
  const create = payload => mf.dispatchFetch(endpoint, { method: 'PUT', headers: { Authorization: 'Bearer test-only-secret', 'X-Safari-Visitor': 'test' }, body: JSON.stringify({ ...payload, key }) })
  const clients = []
  async function connect() {
    const ticketResponse = await mf.dispatchFetch(`${endpoint}/ticket`, { method: 'POST', headers: auth })
    assert.equal(ticketResponse.status, 200)
    const { ticket } = await ticketResponse.json()
    const url = `${endpoint}/connect?ticket=${ticket}&sessionId=${randomUUID()}`
    const response = await mf.dispatchFetch(url, { headers: { Upgrade: 'websocket', Origin: 'https://example.org' } })
    assert.equal(response.status, 101)
    const ws = response.webSocket, messages = [], pending = [], assembler = new JsonChunkAssembler()
    ws.accept()
    ws.addEventListener('message', event => {
      const assembled = assembler.handleMessage(event.data)
      if (!assembled?.data) return
      messages.push(assembled.data)
      for (const resolve of pending.splice(0)) resolve()
    })
    const wait = async predicate => {
      const deadline = Date.now() + 5000
      while (!messages.some(predicate)) {
        if (Date.now() > deadline) throw Error('Sync message timed out: ' + JSON.stringify(messages))
        await Promise.race([new Promise(resolve => pending.push(resolve)), new Promise(resolve => setTimeout(resolve, 100))])
      }
      return messages.find(predicate)
    }
    ws.send(JSON.stringify({ type: 'connect', connectRequestId: randomUUID(), protocolVersion: getTlsyncProtocolVersion(), schema: schema.serialize(), lastServerClock: -1 }))
    const initial = await wait(message => message.type === 'connect')
    const client = { ws, wait, initial, messages, url }; clients.push(client); return client
  }
  try {
    assert.equal((await mf.dispatchFetch(endpoint, { method: 'PUT', body: '{}' })).status, 403)
    assert.equal((await create(board())).status, 201)
    assert.equal((await mf.dispatchFetch(endpoint)).status, 403)
    assert.equal((await mf.dispatchFetch(endpoint, { headers: { ...auth, Origin: 'https://bad.example' } })).status, 403)
    const alice = await connect(), bob = await connect()
    assert.deepEqual(alice.initial.diff[card.id][1], card)
    // A connection ticket is single-use, separate from the reusable invite key.
    assert.equal((await mf.dispatchFetch(alice.url, { headers: { Upgrade: 'websocket' } })).status, 403)
    alice.ws.send(JSON.stringify({ type: 'push', clientClock: 1, diff: { [card.id]: ['patch', { x: ['put', 172] }] } }))
    bob.ws.send(JSON.stringify({ type: 'push', clientClock: 1, diff: { [card.id]: ['patch', { y: ['put', 281] }] } }))
    await Promise.all([alice.wait(m => m.type === 'data' && m.data.some(d => d.type === 'push_result' && d.clientClock === 1)), bob.wait(m => m.type === 'data' && m.data.some(d => d.type === 'push_result' && d.clientClock === 1))])
    const third = await connect()
    assert.equal(third.initial.diff[card.id][1].x, 172); assert.equal(third.initial.diff[card.id][1].y, 281)
    // A retried invite request must never restore the original positions.
    assert.equal((await create(board())).status, 200)
    alice.ws.send(JSON.stringify({ type: 'push', clientClock: 2, diff: { [card.id]: ['remove'] } }))
    await alice.wait(m => m.type === 'data' && m.data.some(d => d.type === 'push_result' && d.clientClock === 2))
    for (const client of clients) client.ws.close()
    await mf.dispose()
    mf = new Miniflare(options)
    const reopened = await connect()
    assert.equal(reopened.initial.diff[card.id], undefined, 'deleted evidence must stay deleted after every client leaves and the worker restarts')
    assert.ok(reopened.initial.diff[page.id])
    reopened.ws.close()
  } finally {
    await mf.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
