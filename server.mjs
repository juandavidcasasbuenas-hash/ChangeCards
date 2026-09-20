import express from 'express'
import feedback from './lib/feedback.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import { health, sparks, transform } from './lib/openai-api.mjs'
import { evidenceSafari } from './lib/evidence-safari/http.mjs'
import { safariWeb } from './lib/evidence-safari/web.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 8787)

app.use(express.json({ limit: '32kb' }))
app.get('/api/health', health)
app.post('/api/transform', transform)
app.post('/api/sparks', sparks)
app.post('/api/feedback', feedback)
app.post('/api/evidence-safari', evidenceSafari)
app.post('/api/safari/run', safariWeb)

const dist = path.join(__dirname, 'dist')
if (process.env.VERCEL !== '1' && process.env.VERCEL !== 'true') {
  app.use(express.static(dist))
  app.get('*path', (_request, response) => response.sendFile(path.join(dist, 'index.html')))
  app.listen(port, () => {
    console.log(`Change Cards server ready on http://localhost:${port}`)
  })
}

export default app
