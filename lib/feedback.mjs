import { createHmac } from 'node:crypto'

export function createFeedbackHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function feedback(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }) }
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key || !env.RESEND_API_KEY || !env.FEEDBACK_FROM_EMAIL) return res.status(503).json({ error: 'Feedback is not available yet. Please try again later.' })
    let body
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body } catch { return res.status(400).json({ error: 'Invalid feedback.' }) }
    const { id, message, email = '', screen } = body || {}
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || typeof message !== 'string' || !message.trim() || message.length > 3000 || typeof email !== 'string' || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !['landing', 'table', 'co-op'].includes(screen)) return res.status(400).json({ error: 'Please check your feedback and email address.' })
    const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
    const ipHash = createHmac('sha256', key).update(ip).digest('hex')
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    const db = async (query, options = {}) => {
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/tester_feedback${query}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('Feedback storage request failed')
      return response.status === 204 ? null : response.json()
    }
    try {
      let [saved] = await db(`?id=eq.${id}&select=id,message,email,screen,notification_sent_at`)
      if (saved && (saved.message !== message.trim() || saved.email !== email.trim() || saved.screen !== screen)) return res.status(409).json({ error: 'Please reopen the form and try again.' })
      if (!saved) {
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        const recent = await db(`?ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=5`)
        if (recent.length >= 5) return res.status(429).json({ error: 'Please wait a few minutes before sending more feedback.' })
        const rows = await db('?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ id, message: message.trim(), email: email.trim(), screen, ip_hash: ipHash, app_version: env.VERCEL_GIT_COMMIT_SHA || 'local' }) })
        saved = rows[0]
        if (!saved) [saved] = await db(`?id=eq.${id}&select=id,message,email,screen,notification_sent_at`)
      }
      if (!saved) throw new Error('Feedback was not stored')
      if (!saved.notification_sent_at) {
        try {
          const notification = await fetchImpl('https://api.resend.com/emails', {
            method: 'POST', signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `feedback/${id}` },
            body: JSON.stringify({ from: env.FEEDBACK_FROM_EMAIL, to: ['juan@jdcasasbuenas.com'], subject: 'New Change Cards feedback', ...(saved.email ? { reply_to: saved.email } : {}), text: `${saved.message}\n\nFrom: ${saved.email || 'Anonymous tester'}\nScreen: ${saved.screen}\nFeedback ID: ${id}` }),
          })
          if (!notification.ok) throw new Error('Notification failed')
          await db(`?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notification_sent_at: new Date().toISOString() }) })
        } catch { console.warn('Feedback saved; email notification pending:', id) }
      }
      return res.status(201).json({ saved: true })
    } catch { return res.status(503).json({ error: 'Could not save your feedback. Please try again.' }) }
  }
}

export default createFeedbackHandler()
