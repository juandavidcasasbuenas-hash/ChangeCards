import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { runSafari } from '../lib/evidence-safari/engine.mjs'
import { toMarkdown } from '../lib/evidence-safari/export.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  context: { type: 'string' }, geography: { type: 'string' }, count: { type: 'string' },
  'max-cost': { type: 'string', default: '0.40' }, out: { type: 'string', default: 'output/evidence-safari' },
  refresh: { type: 'boolean', default: false }, 'no-cache': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h' },
} })
if (values.help || !positionals.length) {
  console.log('Usage: npm run safari -- "challenge" [--context "..."] [--geography "..."] [--count 24] [--max-cost 0.40] [--out directory] [--refresh] [--no-cache]')
  process.exit(values.help ? 0 : 1)
}
try {
  const result = await runSafari({ challenge: positionals.join(' '), context: values.context, geography: values.geography, targetCount: values.count ? Number(values.count) : 24 }, {
    maxCostUsd: Number(values['max-cost']), refresh: values.refresh,
    cacheDirectory: values['no-cache'] ? null : '.cache/evidence-safari',
    onProgress: (event) => console.error(JSON.stringify(event)),
  })
  const output = path.resolve(values.out)
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, 'safari.json'), JSON.stringify(result, null, 2))
  await fs.writeFile(path.join(output, 'safari.md'), toMarkdown(result))
  console.log(JSON.stringify({ status: result.status, cards: result.cards.length, durationMs: result.durationMs, cost: result.cost.estimatedUsd, cacheHit: result.cacheHit, output }, null, 2))
  if (result.status !== 'complete') process.exitCode = 2
} catch (error) {
  // Provider SDK errors can contain request/header details: print only a safe message.
  console.error(error?.status ? `Provider request failed (HTTP ${error.status}).` : error.message)
  process.exitCode = 1
}
