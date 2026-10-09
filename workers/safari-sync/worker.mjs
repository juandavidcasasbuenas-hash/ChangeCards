import { DurableObject } from 'cloudflare:workers'
import { DurableObjectSqliteSyncWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import { createTLSchema, defaultShapeSchemas, defaultBindingSchemas } from '@tldraw/tlschema'
import { safariShapeSchemas } from '../../shared/safari-shapes.mjs'
import { ROOM_ID, ROOM_KEY, MAX_BOARD_BYTES, MAX_RECORD_BYTES, MAX_RECORDS, byteSize, prepareSharedBoard } from '../../shared/safari-session.mjs'

const schema = createTLSchema({ shapes: { ...defaultShapeSchemas, ...safariShapeSchemas }, bindings: defaultBindingSchemas })
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('')
const bearer = req => req.headers.get('Authorization')?.replace(/^Bearer /, '') || ''

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin')
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').includes(origin)
    if (origin && !allowed) return json({ error: 'This website cannot access the board.' }, 403)
    const cors = { 'Access-Control-Allow-Origin': origin || '', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (url.pathname === '/health') return json({ ok: true, protocol: 'tldraw-5.4.2' })
    const match = url.pathname.match(/^\/rooms\/([^/]+)(?:\/(ticket|connect))?$/)
    if (!match || !ROOM_ID.test(match[1])) return json({ error: 'Board not found.' }, 404)
    if (request.method === 'PUT' && (!env.SAFARI_SYNC_SECRET || bearer(request) !== env.SAFARI_SYNC_SECRET)) return json({ error: 'Not authorized.' }, 403)
    try {
      const response = await env.SAFARI_ROOMS.get(env.SAFARI_ROOMS.idFromName(match[1])).fetch(request)
      if (response.status === 101) return response
      const result = new Response(response.body, response)
      for (const [key, value] of Object.entries(cors)) result.headers.set(key, value)
      return result
    } catch { return json({ error: 'Sharing is temporarily unavailable. Please try again.' }, 503) }
  },
}

export class SafariRoom extends DurableObject {
  room = null
  sockets = new Map()
  constructor(ctx, env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS safari_metadata (id INTEGER PRIMARY KEY, key_hash TEXT NOT NULL, safari TEXT NOT NULL)')
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS safari_tickets (ticket TEXT PRIMARY KEY, expires INTEGER NOT NULL)')
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'))
  }
  metadata() { return this.ctx.storage.sql.exec('SELECT * FROM safari_metadata WHERE id = 1').toArray()[0] }
  getRoom() {
    if (this.room) return this.room
    const storage = new SQLiteSyncStorage({ sql: new DurableObjectSqliteSyncWrapper(this.ctx.storage) })
    const authorize = ({ type, prev, next }) => {
      if (type === 'delete') return prev
      if (byteSize(next) > MAX_RECORD_BYTES) return null
      if (type === 'create' && this.room.getCurrentSnapshot().documents.length >= MAX_RECORDS) return null
      return next
    }
    this.room = new TLSocketRoom({ schema, storage, clientTimeout: Infinity,
      authorizeRecord: { shape: authorize, asset: authorize, binding: authorize, page: ({ type, prev, next }) => type === 'update' ? next : null },
      onSessionSnapshot: (sessionId, snapshot) => this.sockets.get(sessionId)?.serializeAttachment({ sessionId, snapshot }),
    })
    for (const ws of this.ctx.getWebSockets()) {
      const saved = ws.deserializeAttachment()
      if (!saved?.sessionId) { ws.close(1011, 'Reconnect'); continue }
      this.sockets.set(saved.sessionId, ws)
      if (saved.snapshot) this.room.handleSocketResume({ sessionId: saved.sessionId, socket: ws, snapshot: saved.snapshot })
      else this.room.handleSocketConnect({ sessionId: saved.sessionId, socket: ws })
    }
    return this.room
  }
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'PUT') return this.create(request, url.pathname.split('/')[2])
    const metadata = this.metadata()
    if (!metadata) return json({ error: 'This board does not exist. Check the invite link.' }, 404)
    if (url.pathname.endsWith('/connect')) return this.connect(request, url)
    if (await hash(bearer(request)) !== metadata.key_hash) return json({ error: 'This invite link is invalid. Ask for a new copy of the link.' }, 403)
    if (request.method === 'GET' && /^\/rooms\/[^/]+$/.test(url.pathname)) return json({ safari: JSON.parse(metadata.safari) })
    if (request.method === 'POST' && url.pathname.endsWith('/ticket')) {
      if (this.ctx.getWebSockets().length >= 20) return json({ error: 'This board has 20 people connected. Try again when someone leaves.' }, 429)
      const ticket = crypto.randomUUID(), now = Date.now()
      this.ctx.storage.sql.exec('DELETE FROM safari_tickets WHERE expires < ?', now)
      this.ctx.storage.sql.exec('INSERT INTO safari_tickets VALUES (?, ?)', ticket, now + 30000)
      return json({ ticket })
    }
    return json({ error: 'Unsupported request.' }, 405)
  }
  async create(request, roomId) {
    if (Number(request.headers.get('Content-Length')) > MAX_BOARD_BYTES + 1000) return json({ error: 'This board is too large to share.' }, 400)
    const text = await request.text()
    if (byteSize(text) > MAX_BOARD_BYTES + 1000) return json({ error: 'This board is too large to share.' }, 400)
    let board, keyHash
    try {
      const body = JSON.parse(text)
      if (!ROOM_KEY.test(body.key || '')) throw Error('Invalid invite key.')
      board = prepareSharedBoard(body.safari, body.snapshot)
      const migration = schema.migrateStoreSnapshot(board.snapshot)
      if (migration.type !== 'success') throw Error('Please refresh the website before sharing.')
      for (const [id, record] of Object.entries(migration.value)) {
        if (record.id !== id) throw Error('Invalid record ID.')
        schema.types[record.typeName].validate(record)
      }
      keyHash = await hash(body.key)
    } catch { return json({ error: 'This board could not be shared. Refresh the website and try again.' }, 400) }
    // Serializes retries as well as the first seed; an existing board is never overwritten.
    return this.ctx.blockConcurrencyWhile(async () => {
      const existing = this.metadata()
      if (existing) return existing.key_hash === keyHash ? json({ ok: true }) : json({ error: 'Session already exists.' }, 409)
      const quota = await this.env.SAFARI_QUOTA.get(this.env.SAFARI_QUOTA.idFromName('creation')).fetch(new Request('https://quota/reserve', { method: 'POST', body: JSON.stringify({ roomId, visitor: request.headers.get('X-Safari-Visitor') }) }))
      if (!quota.ok) return json({ error: 'The shared-board allowance has been reached. Please try again later.' }, 429)
      this.ctx.storage.transactionSync(() => {
        new SQLiteSyncStorage({ sql: new DurableObjectSqliteSyncWrapper(this.ctx.storage), snapshot: board.snapshot })
        this.ctx.storage.sql.exec('INSERT INTO safari_metadata VALUES (1, ?, ?)', keyHash, JSON.stringify(board.safari))
      })
      return json({ ok: true }, 201)
    })
  }
  connect(request, url) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required.' }, 400)
    const sessionId = url.searchParams.get('sessionId'), ticket = url.searchParams.get('ticket')
    const valid = this.ctx.storage.sql.exec('DELETE FROM safari_tickets WHERE ticket = ? AND expires >= ? RETURNING ticket', ticket || '', Date.now()).toArray().length
    if (!valid || !sessionId || sessionId.length > 200) return json({ error: 'Please reconnect to the board.' }, 403)
    if (this.ctx.getWebSockets().length >= 20) return json({ error: 'This board already has 20 people connected.' }, 429)
    const room = this.getRoom()
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ sessionId, snapshot: null })
    this.sockets.set(sessionId, server)
    room.handleSocketConnect({ sessionId, socket: server })
    return new Response(null, { status: 101, webSocket: client })
  }
  webSocketMessage(ws, message) {
    const saved = ws.deserializeAttachment()
    if (!saved?.sessionId) return
    if ((typeof message === 'string' ? message.length : message.byteLength) > MAX_BOARD_BYTES) { ws.close(1009, 'Message too large'); return }
    this.getRoom().handleSocketMessage(saved.sessionId, message)
  }
  endSocket(ws, method) {
    const saved = ws.deserializeAttachment()
    if (!saved?.sessionId) return
    const room = this.getRoom()
    if (saved.snapshot && !room.getSessionSnapshot(saved.sessionId)) room.handleSocketResume({ sessionId: saved.sessionId, socket: ws, snapshot: saved.snapshot })
    room[method](saved.sessionId)
    this.sockets.delete(saved.sessionId)
  }
  webSocketClose(ws) { this.endSocket(ws, 'handleSocketClose'); try { ws.close() } catch {} }
  webSocketError(ws) { this.endSocket(ws, 'handleSocketError') }
}

// A small, global, durable creation allowance. Existing rooms never spend it.
export class SafariQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS safari_creations (room TEXT PRIMARY KEY, visitor TEXT, created INTEGER)')
  }
  async fetch(request) {
    const { roomId, visitor } = await request.json(), now = Date.now()
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM safari_creations WHERE created < ?', now - 86400000)
    if (sql.exec('SELECT room FROM safari_creations WHERE room = ?', roomId).toArray().length) return json({ ok: true })
    const total = sql.exec('SELECT COUNT(*) AS n FROM safari_creations').one().n
    const recent = sql.exec('SELECT COUNT(*) AS n FROM safari_creations WHERE visitor = ? AND created > ?', visitor, now - 3600000).one().n
    if (total >= 60 || recent >= 8) return json({ error: 'Please try again later.' }, 429)
    sql.exec('INSERT INTO safari_creations VALUES (?, ?, ?)', roomId, visitor, now)
    return json({ ok: true })
  }
}
