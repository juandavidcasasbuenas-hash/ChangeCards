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
const legacySchema = createTLSchema({ shapes: { ...defaultShapeSchemas, ...Object.fromEntries(Object.entries(safariShapeSchemas).filter(([type]) => type.startsWith('safari-'))) }, bindings: defaultBindingSchemas })
const page = PageRecordType.create({ id: 'page:page', name: 'Evidence Safari', index: 'a1', meta: { safariSeenIds: ['one'], safariActiveLens: 'People' } })
const card = schema.types.shape.create({ id: 'shape:one', type: 'safari-evidence-card', parentId: page.id, index: 'a1', props: { w: 348, h: 348,
  evidence: { card: { id: 'one', title: 'A public example', finding: 'A finding', lens: 'People' }, source: { id: 'source', url: 'https://example.org/research' } } } })
const document = DocumentRecordType.create({ id: 'document:document' })
const changeCard = schema.types.shape.create({ id: 'shape:change-one', type: 'change-card', parentId: page.id, index: 'a2', props: {
  w: 348, h: 420, cardId: 1, face: 'front', note: '', draft: '', authorId: 'alice', authorName: 'Alice', template: false, sparks: [],
} })
const changeStation = schema.types.shape.create({ id: 'shape:change-station', type: 'change-station', parentId: page.id, index: 'a3', props: { w: 1100, h: 120, category: 'ingenious' } })
const safari = { id: 'test-example', challenge: 'A public test challenge', status: 'complete' }
const snapshot = { store: Object.fromEntries([page, card, document].map(record => [record.id, record])), schema: schema.serialize() }
const board = () => prepareSharedBoard(safari, snapshot)
const developBoard = () => prepareSharedBoard({ ...safari, id: 'test-develop', kind: 'develop' }, { store: Object.fromEntries([page, changeCard, changeStation, document].map(record => [record.id, record])), schema: schema.serialize() })

test('sharing preserves findings, references and positions but excludes personal navigation and reading', () => {
  const result = board()
  assert.deepEqual(result.snapshot.store[card.id], card)
  assert.equal(result.snapshot.store[page.id].meta.safariSeenIds, undefined)
  assert.equal(result.snapshot.store[page.id].meta.safariActiveLens, undefined)
  assert.deepEqual(snapshot.store[page.id].meta.safariSeenIds, ['one'])
  assert.throws(() => prepareSharedBoard({ ...safari, status: 'researching' }, snapshot), /Finish/)
  assert.throws(() => prepareSharedBoard(safari, { ...snapshot, store: { ...snapshot.store, camera: { typeName: 'camera' } } }), /document/)
})

test('Change Card-only boards are shareable and legacy Safari schemas retain their evidence', () => {
  const develop = developBoard()
  assert.equal(develop.safari.kind, 'develop')
  assert.equal(develop.safari.defaultStage, 'develop')
  assert.deepEqual(develop.snapshot.store[changeCard.id], changeCard)
  assert.deepEqual(develop.snapshot.store[changeStation.id], changeStation)
  assert.equal(board().safari.kind, 'safari')
  assert.equal(board().safari.defaultStage, 'discover')
  assert.equal(prepareSharedBoard({ ...safari, defaultStage: 'develop' }, snapshot).safari.defaultStage, 'develop')
  const migrated = schema.migrateStoreSnapshot({ ...snapshot, schema: legacySchema.serialize() })
  assert.equal(migrated.type, 'success')
  assert.deepEqual(migrated.value[card.id], card)
  assert.throws(() => schema.types.shape.validate({ ...changeCard, props: { ...changeCard.props, face: 'mirrored' } }))
  assert.throws(() => prepareSharedBoard(safari, { ...snapshot, store: { [page.id]: page, [document.id]: document } }), /Add evidence or a Change Card/)
  assert.throws(() => prepareSharedBoard(safari, { ...snapshot, store: { ...snapshot.store, 'page:second': { ...page, id: 'page:second' } } }), /too large/)
})

test('invite links keep the edit capability out of paths and reject incomplete keys', () => {
  const access = { roomId: randomUUID(), key: randomBytes(32).toString('base64url') }
  const url = new URL(sessionLink('https://example.org', access))
  assert.equal(url.search, '')
  assert.deepEqual(parseSessionLink(url.pathname, url.hash), access)
  assert.throws(() => parseSessionLink(url.pathname, ''), /incomplete/)
})

test('creation endpoint enforces same origin, completed boards, and keeps the server secret private', async () => {
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
  res = response(); await handler({ ...req, headers: { ...req.headers, origin: 'https://example.org' }, body: { ...req.body, ...developBoard() } }, res)
  assert.equal(res.code, 200); assert.equal(calls, 2)
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
  const create = (payload, target = endpoint) => mf.dispatchFetch(target, { method: 'PUT', headers: { Authorization: 'Bearer test-only-secret', 'X-Safari-Visitor': 'test' }, body: JSON.stringify({ ...payload, key }) })
  const clients = []
  async function connect(target = endpoint) {
    const ticketResponse = await mf.dispatchFetch(`${target}/ticket`, { method: 'POST', headers: auth })
    assert.equal(ticketResponse.status, 200)
    const { ticket } = await ticketResponse.json()
    const url = `${target}/connect?ticket=${ticket}&sessionId=${randomUUID()}`
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
    assert.equal((await create({ ...board(), snapshot: { ...snapshot, schema: legacySchema.serialize() } })).status, 201)
    assert.equal((await mf.dispatchFetch(endpoint)).status, 403)
    assert.equal((await mf.dispatchFetch(endpoint, { headers: { ...auth, Origin: 'https://bad.example' } })).status, 403)
    const researchEndpoint = `${endpoint}/research`
    const claimResearch = (ownerId, headers = auth) => mf.dispatchFetch(researchEndpoint, { method: 'POST', headers, body: JSON.stringify({ ownerId }) })
    const releaseResearch = ownerId => mf.dispatchFetch(researchEndpoint, { method: 'DELETE', headers: auth, body: JSON.stringify({ ownerId }) })
    const owners = [randomUUID(), randomUUID()]
    assert.equal((await claimResearch(owners[0], {})).status, 403)
    assert.equal((await claimResearch('invalid-owner')).status, 400)
    const reservations = await Promise.all(owners.map(ownerId => claimResearch(ownerId)))
    assert.deepEqual(reservations.map(response => response.status).sort(), [200, 409], 'only one simultaneous researcher can reserve a paid run')
    const owner = owners[reservations.findIndex(response => response.status === 200)]
    const otherOwner = owners.find(candidate => candidate !== owner)
    const reservation = await (await claimResearch(owner)).json()
    assert.equal(reservation.ownerId, owner, 'retrying the same reservation is safe')
    assert.ok(reservation.expiresAt > Date.now() && reservation.expiresAt <= Date.now() + 600000)
    assert.equal((await (await releaseResearch(otherOwner)).json()).released, false)
    assert.equal((await claimResearch(otherOwner)).status, 409, 'another participant cannot release the active researcher’s reservation')
    assert.equal((await (await releaseResearch(owner)).json()).released, true)
    assert.equal((await claimResearch(otherOwner)).status, 200)
    const alice = await connect(), bob = await connect()
    assert.deepEqual(alice.initial.diff[card.id][1], card)
    // A connection ticket is single-use, separate from the reusable invite key.
    assert.equal((await mf.dispatchFetch(alice.url, { headers: { Upgrade: 'websocket' } })).status, 403)
    alice.ws.send(JSON.stringify({ type: 'push', clientClock: 1, diff: { [card.id]: ['patch', { x: ['put', 172] }] } }))
    bob.ws.send(JSON.stringify({ type: 'push', clientClock: 1, diff: { [card.id]: ['patch', { y: ['put', 281] }] } }))
    await Promise.all([alice.wait(m => m.type === 'data' && m.data.some(d => d.type === 'push_result' && d.clientClock === 1)), bob.wait(m => m.type === 'data' && m.data.some(d => d.type === 'push_result' && d.clientClock === 1))])
    const third = await connect()
    assert.equal(third.initial.diff[card.id][1].x, 172); assert.equal(third.initial.diff[card.id][1].y, 281)
    // Develop can be opened on a legacy Safari room: the native server accepts
    // both new shape kinds without replacing the existing evidence document.
    alice.ws.send(JSON.stringify({ type: 'push', clientClock: 2, diff: { [changeCard.id]: ['put', changeCard], [changeStation.id]: ['put', changeStation] } }))
    await bob.wait(m => m.type === 'data' && m.data.some(d => d.type === 'patch' && d.diff?.[changeCard.id]))
    alice.ws.send(JSON.stringify({ type: 'push', clientClock: 3, diff: { [changeCard.id]: ['patch', { props: ['patch', { face: ['put', 'back'], note: ['put', 'Try a small workshop.'], sparks: ['put', ['A six-person pilot']] }] }] } }))
    await alice.wait(m => m.type === 'data' && m.data.some(d => d.type === 'push_result' && d.clientClock === 3))
    const combined = await connect()
    assert.equal(combined.initial.diff[changeCard.id][1].props.face, 'back')
    assert.equal(combined.initial.diff[changeCard.id][1].props.note, 'Try a small workshop.')
    assert.deepEqual(combined.initial.diff[changeCard.id][1].props.sparks, ['A six-person pilot'])
    assert.deepEqual(combined.initial.diff[changeStation.id][1], changeStation)
    assert.equal(combined.initial.diff[card.id][1].props.evidence.source.url, card.props.evidence.source.url)
    // Starting directly in Develop requires no evidence generation or placeholder.
    const developEndpoint = `https://sync.example/rooms/${randomUUID()}`
    assert.equal((await create(developBoard(), developEndpoint)).status, 201)
    const metadata = await (await mf.dispatchFetch(developEndpoint, { headers: auth })).json()
    assert.equal(metadata.safari.kind, 'develop'); assert.equal(metadata.safari.defaultStage, 'develop')
    const developClient = await connect(developEndpoint)
    assert.deepEqual(developClient.initial.diff[changeCard.id][1], changeCard)
    assert.equal(developClient.initial.diff[card.id], undefined)
    // A retried invite request must never restore the original positions.
    assert.equal((await create(board())).status, 200)
    alice.ws.send(JSON.stringify({ type: 'push', clientClock: 4, diff: { [card.id]: ['remove'] } }))
    await alice.wait(m => m.type === 'data' && m.data.some(d => d.type === 'push_result' && d.clientClock === 4))
    for (const client of clients) client.ws.close()
    await mf.dispose()
    mf = new Miniflare(options)
    assert.equal((await claimResearch(owner)).status, 409, 'the research reservation survives Durable Object restarts')
    assert.equal((await (await releaseResearch(otherOwner)).json()).released, true)
    assert.equal((await claimResearch(owner)).status, 200)
    const reopened = await connect()
    assert.equal(reopened.initial.diff[card.id], undefined, 'deleted evidence must stay deleted after every client leaves and the worker restarts')
    assert.ok(reopened.initial.diff[page.id])
    assert.equal(reopened.initial.diff[changeCard.id][1].props.note, 'Try a small workshop.')
    reopened.ws.close()
  } finally {
    await mf.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
