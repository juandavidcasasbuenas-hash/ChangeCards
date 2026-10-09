// Local UI verification only. Replays the published example; never calls an AI provider.
// npm run build && node scripts/preview-safari.mjs
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sample = JSON.parse(fs.readFileSync(path.join(root, 'public/safari/example/workshop.json'), 'utf8'))
const lenses = ['People', 'Patterns', 'Systems', 'Elsewhere', 'Edges', 'Possibilities']
const app = express()
app.use(express.json())
app.post('/api/safari/run', (request, response) => {
  const safari = { ...sample, id: `ui-preview-${Date.now()}`, challenge: request.body.challenge, status: 'researching', cards: [] }
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.flushHeaders()
  const emit = event => response.write(`${JSON.stringify(event)}\n`)
  emit({ type: 'evidence', safari })
  emit({ type: 'progress', stage: 'searching', lens: 'People', lensState: 'working' })
  let step = 0
  const timer = setInterval(() => {
    const lens = lenses[step++]
    safari.cards.push(...sample.cards.filter(card => card.lens === lens))
    emit({ type: 'evidence', safari })
    emit({ type: 'progress', stage: 'checking', lens: lenses[step] || lens, lensState: 'working' })
    if (step === lenses.length) {
      safari.status = 'complete'
      emit({ type: 'result', safari })
      emit({ type: 'done', safariId: safari.id, cost: { estimatedUsd: 0 }, timing: { totalMs: 36000, firstEvidenceMs: 6000 } })
      clearInterval(timer); response.end()
    }
  }, 6000)
  response.on('close', () => clearInterval(timer))
})
app.use('/api', (_, response) => response.status(404).json({ error: 'UI preview: live APIs disabled.' }))
app.use(express.static(path.join(root, 'dist')))
app.get('/{*path}', (_, response) => response.sendFile(path.join(root, 'dist/index.html')))
app.listen(8791, '127.0.0.1', () => console.log('Safari UI preview: http://127.0.0.1:8791 — example fixtures only, $0 API usage'))
