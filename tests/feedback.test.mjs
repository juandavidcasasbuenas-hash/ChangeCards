import test from 'node:test'
import assert from 'node:assert/strict'
import { createFeedbackHandler } from '../lib/feedback.mjs'

const payload = { id: 'b1259f6f-71bb-4560-844a-6926c51f82d2', message: 'Useful cards', email: 'tester@example.com', screen: 'table' }
function fixture({ configured = true, storageFails = false, emailFails = false, limited = false } = {}) {
  const rows = new Map(); const mails = []
  const handler = createFeedbackHandler({
    env: configured ? { SUPABASE_URL: 'https://db.example.com', SUPABASE_SERVICE_ROLE_KEY: 'test', RESEND_API_KEY: 'test', FEEDBACK_FROM_EMAIL: 'Feedback <feedback@example.com>' } : {},
    fetchImpl: async (url, options) => {
      if (url === 'https://api.resend.com/emails') { mails.push({ body: JSON.parse(options.body), headers: options.headers }); return new Response('{}', { status: emailFails ? 500 : 200 }) }
      if (storageFails) throw new Error('offline')
      const parsed = new URL(url)
      const id = parsed.searchParams.get('id')?.slice(3)
      if (options.method === 'POST') { const row = JSON.parse(options.body); rows.set(row.id, row); return Response.json([row]) }
      if (options.method === 'PATCH') { Object.assign(rows.get(id), JSON.parse(options.body)); return new Response(null, { status: 204 }) }
      if (parsed.searchParams.has('ip_hash')) return Response.json(limited ? Array(5).fill({id:'existing'}) : [])
      return Response.json(rows.has(id) ? [rows.get(id)] : [])
    },
  })
  const send = async (body = payload, method = 'POST') => {
    const res = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
    await handler({ method, body, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res)
    return res
  }
  return { send, rows, mails }
}
test('stores once and emails fixed recipient with optional reply-to; retries do not notify twice', async () => {
  const f = fixture(); assert.equal((await f.send()).code, 201); assert.equal((await f.send()).code, 201)
  assert.equal(f.rows.size, 1); assert.equal(f.mails.length, 1)
  assert.deepEqual(f.mails[0].body.to, ['juan@jdcasasbuenas.com'])
  assert.equal(f.mails[0].body.reply_to, payload.email)
  assert.equal(f.mails[0].headers['Idempotency-Key'], `feedback/${payload.id}`)
  assert.notEqual(f.rows.get(payload.id).ip_hash, '127.0.0.1')
  assert.equal((await f.send({...payload, message:'Changed payload'})).code, 409)
})
test('email failure keeps feedback marked as not notified', async () => {
  const f=fixture({emailFails:true}); assert.equal((await f.send()).code,201)
  assert.equal(f.rows.size,1); assert.equal(f.rows.get(payload.id).notification_sent_at,undefined)
})
test('storage failure does not send email or claim success', async () => {
  const f=fixture({storageFails:true}); assert.equal((await f.send()).code,503); assert.equal(f.mails.length,0)
})
test('missing setup, rate limit, invalid input and wrong method reject safely', async () => {
  assert.equal((await fixture({configured:false}).send()).code,503)
  assert.equal((await fixture({limited:true}).send()).code,429)
  for (const patch of [{message:''},{message:'a'.repeat(3001)},{email:'bad\r\n@address'},{screen:'secret-room'},{id:'invalid'}]) assert.equal((await fixture().send({...payload,...patch})).code,400)
  assert.equal((await fixture().send(payload,'GET')).code,405)
})
