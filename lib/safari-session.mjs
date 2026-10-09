import { createHmac } from 'node:crypto'
import { MAX_BOARD_BYTES, ROOM_ID, ROOM_KEY, byteSize, prepareSharedBoard } from '../shared/safari-session.mjs'

export function createSafariSessionHandler({ env = process.env, fetcher = fetch } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const server = env.SAFARI_SYNC_URL?.replace(/\/$/, '')
    const secret = env.SAFARI_SYNC_SECRET
    if (req.method === 'GET') return res.status(200).json({ enabled: Boolean(server && secret), server: server || null })
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Use POST.' }) }
    let origin
    try { origin = new URL(req.headers.origin) } catch { /* Fail closed. */ }
    const local = !env.VERCEL && env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(origin?.hostname) && /^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host || '')
    if (!origin || (!local && origin.host !== req.headers.host)) return res.status(403).json({ error: 'Open this safari on the website to invite people.' })
    if (!server || !secret) return res.status(503).json({ error: 'Shared boards are not available yet. Your local board is safe.' })
    const { roomId, key, safari, snapshot } = req.body || {}
    if (!ROOM_ID.test(roomId || '') || !ROOM_KEY.test(key || '')) return res.status(400).json({ error: 'Invalid session details.' })
    let board
    try {
      if (byteSize(req.body) > MAX_BOARD_BYTES + 1000) throw Error('This board is too large to share.')
      board = prepareSharedBoard(safari, snapshot)
    } catch (error) { return res.status(400).json({ error: error.message }) }
    // Only this server can create rooms. A durable quota in the Worker bounds
    // creation across all Vercel instances; the Worker never receives a raw IP.
    const ip = env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0] : req.socket?.remoteAddress || 'local'
    const visitor = createHmac('sha256', secret).update(ip).digest('hex')
    try {
      const response = await fetcher(`${server}/rooms/${roomId}`, { method: 'PUT', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'X-Safari-Visitor': visitor },
        body: JSON.stringify({ ...board, key }), signal: AbortSignal.timeout(25000) })
      const result = await response.json()
      if (!response.ok) return res.status([400, 409, 429].includes(response.status) ? response.status : 503).json({ error: result.error || 'Could not open sharing. Please try again.' })
      return res.status(200).json({ roomId, server })
    } catch { return res.status(503).json({ error: 'Could not connect to sharing. Please try again; your local board is safe.' }) }
  }
}
export const safariSession = createSafariSessionHandler()
