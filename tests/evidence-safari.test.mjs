import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { LENSES, DISCIPLINES, parseInput } from '../lib/evidence-safari/schema.mjs'
import { Budget, FileCache } from '../lib/evidence-safari/providers.mjs'
import { runSafari, checkCard, collectSources, selectCards, canonicalUrl } from '../lib/evidence-safari/engine.mjs'
import { createSafariHandler } from '../lib/evidence-safari/http.mjs'
import { runWebSafari } from '../lib/evidence-safari/web.mjs'

const quote = 'Participants described transport costs as a barrier to taking part in the programme.'
const content = `${quote} This qualitative study interviewed participants in a local programme about access barriers. The interviews describe experience rather than estimating the prevalence of barriers in the wider population. Study limitations include a small sample and a single setting.`
const card = (source, index = 0) => ({
  takeaway: 'Interviewees in a local programme described transport costs as a barrier to taking part.',
  title: `Transport access ${index}`, finding: 'Participants in a local programme described transport costs as a barrier to taking part. The interviews describe their experiences rather than estimating the prevalence of this barrier in the wider population.',
  sourceId: source.id, supportQuote: quote, discipline: DISCIPLINES[index % DISCIPLINES.length], context: 'A local programme; dates and sample size not reported in this extract.',
  evidenceType: 'qualitative', sourceRole: 'primary', qualityReason: 'Original interviews report participants’ experiences.', limitation: 'A single setting cannot establish population prevalence.',
  relevance: 'analogy', connection: 'Travel costs might also shape who can participate in the challenge context.', transferCaution: 'The original setting differs; the same barrier may not apply.',
  discussionQuestion: 'Whose costs are currently invisible?', studyKey: `Study ${index}`,
})
const fixture = (hooks = {}) => {
  let writes = 0, searches = 0
  return {
    counts: () => ({ writes, searches }),
    async search(queries) {
      searches++
      const lens = queries[0].split(' ')[0]
      if (hooks.searchFailure) throw new Error('Provider unavailable')
      return { results: Array.from({ length: 6 }, (_, i) => ({ url: `https://${lens.toLowerCase()}${i}.example.org/study`, title: `${lens} study ${i}`, snippet: content })), retrievedAt: '2026-09-05T12:00:00Z' }
    },
    async model({ stage, data }) {
      if (stage === 'plan') return { framing: 'Explore barriers and opportunities.', assumptions: ['Geography unspecified.'], researchGaps: [], lanes: Object.fromEntries(Object.keys(LENSES).map((lens) => [lens, { mechanism: 'Access', queries: [`${lens} original study`, `${lens} other sector study`] }])) }
      if (stage.startsWith('write_')) {
        writes++
        return { cards: data.sources.slice(0, 4).map((s, i) => {
          const offset = Object.keys(LENSES).indexOf(data.lens) * 4 + i
          const { supportQuote, ...c } = card(s, offset)
          c.passageId = s.passages[0].id
          // Different claims exercise diversity selection; fixture content is not live evidence.
          c.finding = `This synthetic fixture describes a distinct interview finding for the test only: ${Array.from({ length: 14 }, (_, n) => `mechanism${offset}dimension${n}`).join(' ')}.`
          if (hooks.badQuote) c.passageId = 'invented-passage'
          if (hooks.unknownSource) c.sourceId = 'invented'
          return c
        }), gaps: [] }
      }
      return { verdicts: data.cards.map((c) => ({ id: c.id, supported: !hooks.unsupported, substantive: !hooks.thin, sourceSuitable: true, contextAccurate: true, transferHonest: true, reason: 'Checked fixture.', duplicateOf: '' })) }
    },
  }
}

test('input rejects wrong types, unbounded challenge and count', () => {
  for (const input of [null, [], { challenge: 'tiny' }, { challenge: 'x'.repeat(1201) }, { challenge: 'A valid challenge', targetCount: 500 }, { challenge: 'A valid challenge', geography: {} }]) assert.throws(() => parseInput(input))
  assert.equal(parseInput({ challenge: '  A valid challenge  ' }).targetCount, 24)
})

test('canonical URLs strip tracking and reject unsafe or credential-bearing links', () => {
  assert.equal(canonicalUrl('https://example.org/a?utm_source=x#section'), 'https://example.org/a')
  for (const url of ['javascript:alert(1)', 'http://127.0.0.1/', 'http://172.16.0.1/', 'https://user:password@example.org/', 'http://[::1]/']) assert.equal(canonicalUrl(url), null)
})

test('source identity deduplicates across lenses while retaining provenance', () => {
  const sources = collectSources(['People', 'Edges'].map((lens) => ({ lane: { lens, queries: [lens] }, result: { results: [{ url: 'https://example.org/a', title: 'Original study', snippet: content }], retrievedAt: '2026-09-05' } })))
  assert.equal(sources.length, 1)
  assert.deepEqual(sources[0].lenses, ['People', 'Edges'])
  assert.equal(sources[0].publishedAt, null)
  assert.equal(sources[0].access, 'provider_extract')
})

test('quote integrity, source IDs and secondary provenance fail closed', () => {
  const source = { id: 's', content, lenses: ['People'] }
  const c = card(source)
  assert.equal(checkCard(c, source, 'People'), null)
  assert.match(checkCard({ ...c, supportQuote: quote.replace('costs', 'fees') }, source, 'People'), /quote/)
  assert.match(checkCard(c, null, 'People'), /Unknown/)
  assert.match(checkCard({ ...c, sourceRole: 'secondary' }, source, 'People'), /provenance/)
})

test('budget reserves synchronously across concurrent requests and keeps ambiguous costs', () => {
  const b = new Budget(0.1)
  const finish = b.reserve('first', 0.06)
  assert.throws(() => b.reserve('second', 0.05), /Budget/)
  finish(0.02)
  b.reserve('ambiguous', 0.06)
  assert.equal(b.report().estimatedUsd, 0.08)
  assert.throws(() => new Budget(NaN))
})

test('file cache expires entries and never requires a key for disabled cache', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'safari-test-'))
  try {
    const cache = new FileCache(directory)
    await cache.set('test', { ok: true })
    assert.deepEqual(await cache.get('test'), { ok: true })
    assert.equal(await new FileCache(directory, -1).get('test'), null)
    assert.equal(await new FileCache(null).get('test'), null)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('complete pipeline keeps six lenses, four disciplines and distinct sources', async () => {
  const events = []
  const result = await runSafari({ challenge: 'Increasing participation in local activities' }, { provider: fixture(), onProgress: event => events.push(event) })
  assert.equal(result.status, 'complete')
  assert.equal(result.cards.length, 24)
  assert.equal(new Set(result.cards.map((c) => c.sourceId)).size, 24)
  assert.ok(Object.values(result.coverage.lenses).every((n) => n === 4))
  assert.ok(result.cards.every((c) => c.verification.humanReviewed === false))
  for (const stage of ['searching', 'writing']) {
    const completions = events.filter(e => e.stage === stage && e.lensState === 'done')
    assert.deepEqual(completions.map(e => e.completed), [1, 2, 3, 4, 5, 6])
    assert.equal(new Set(completions.map(e => e.lens)).size, 6)
  }
  const lastCheck = events.filter(e => e.stage === 'checking').at(-1)
  assert.equal(lastCheck.checked, 24)
  assert.equal(lastCheck.failedChecks, 0)
})

test('fabricated quotes, invented source IDs and unsupported claims never become cards', async () => {
  for (const hooks of [{ badQuote: true }, { unknownSource: true }, { unsupported: true }, { thin: true }]) {
    const result = await runSafari({ challenge: 'Increasing participation in local activities' }, { provider: fixture(hooks) })
    assert.equal(result.status, 'insufficient_evidence')
    assert.equal(result.cards.length, 0)
    assert.ok(result.trace.rejected.length)
  }
})

test('provider failure returns honest gaps, not synthetic evidence', async () => {
  const result = await runSafari({ challenge: 'Reducing food waste in hospitals' }, { provider: fixture({ searchFailure: true }) })
  assert.equal(result.cards.length, 0)
  assert.equal(result.warnings.filter((w) => w.startsWith('Search failed')).length, 6)
  assert.equal(result.status, 'insufficient_evidence')
})

test('selection enforces source/study/domain diversity', () => {
  const sources = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, domain: 'same.example.org' }))
  const candidates = sources.map((s, i) => ({ ...card(s, i), lens: 'People', finding: `concept${i} barrier${i} institution${i} experience${i}` }))
  assert.equal(selectCards(candidates, sources, 24).length, 3)
})

test('HTTP endpoint is opt-in, authenticates, validates input and strips full extracts', async () => {
  const original = process.env.EVIDENCE_SAFARI_TOKEN
  const response = () => Object.assign(new EventEmitter(), { code: 200, setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } })
  let called = 0
  const handler = createSafariHandler(async () => { called++; return { sources: [{ id: 's', content: 'private full extract', url: 'https://example.org' }] } })
  try {
    delete process.env.EVIDENCE_SAFARI_TOKEN
    let res = response()
    await handler({ method: 'POST', headers: {}, body: {} }, res)
    assert.equal(res.code, 503)
    process.env.EVIDENCE_SAFARI_TOKEN = 'test-secret'
    res = response()
    await handler({ method: 'POST', headers: {}, body: {} }, res)
    assert.equal(res.code, 401)
    res = response()
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: { challenge: [] } }, res)
    assert.equal(res.code, 400)
    res = response()
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: { challenge: 'A valid challenge' } }, res)
    assert.equal(called, 1)
    assert.equal(res.data.sources[0].content, undefined)
  } finally { if (original === undefined) delete process.env.EVIDENCE_SAFARI_TOKEN; else process.env.EVIDENCE_SAFARI_TOKEN = original }
})

test('cache hit returns zero new usage without calling providers', async () => {
  const values = new Map()
  const cache = { async get(key) { return values.get(key) }, async set(key, value) { values.set(key, value) } }
  const first = await runSafari({ challenge: 'Increasing participation in local activities' }, { provider: fixture(), cache })
  const second = await runSafari({ challenge: 'Increasing participation in local activities' }, { provider: { model() { throw new Error('Cache miss') } }, cache })
  assert.equal(second.id, first.id)
  assert.equal(second.cacheHit, true)
  assert.equal(second.cost.estimatedUsd, 0)
  assert.deepEqual(second.originalCost, first.cost)
})

test('missing and duplicate audit verdicts reject evidence', async () => {
  for (const duplicate of [false, true]) {
    const provider = fixture(), model = provider.model
    provider.model = async (args) => {
      const result = await model(args)
      if (args.stage.startsWith('audit_')) result.verdicts = duplicate ? [...result.verdicts, ...result.verdicts] : []
      return result
    }
    const result = await runSafari({ challenge: 'Increasing participation in local activities' }, { provider })
    assert.equal(result.cards.length, 0)
    assert.equal(result.status, 'insufficient_evidence')
  }
})

test('a failed audit cannot leak unreviewed cards', async () => {
  const events = []
  const provider = fixture(), model = provider.model
  provider.model = (args) => { if (args.stage.startsWith('audit_')) throw new Error('Audit unavailable'); return model(args) }
  const result = await runSafari({ challenge: 'Increasing participation in local activities' }, { provider, onProgress: event => events.push(event) })
  assert.equal(result.cards.length, 0)
  assert.ok(result.warnings.some((w) => w.startsWith('Audit batch failed')))
  const lastCheck = events.filter(e => e.stage === 'checking').at(-1)
  assert.equal(lastCheck.checked, 0)
  assert.equal(lastCheck.failedChecks, 24)
})

test('checked evidence reaches the user while another writer is still pending, and final selection keeps every reveal', async () => {
  const slow = Promise.withResolvers(), firstFinds = Promise.withResolvers(), snapshots = [], audits = []
  let slowFinished = false
  const provider = fixture(), model = provider.model
  provider.model = async args => {
    if (args.stage === 'write_Elsewhere') { await slow.promise; slowFinished = true }
    if (args.stage.startsWith('audit_')) audits.push(structuredClone(args.data))
    return model(args)
  }
  const pending = runSafari({ challenge: 'Increasing participation in local activities' }, {
    provider, signal: AbortSignal.timeout(3000), onEvidence: snapshot => {
      snapshots.push(structuredClone(snapshot))
      if (snapshot.cards.length) firstFinds.resolve(snapshot)
    },
  })
  try {
    const first = await firstFinds.promise
    assert.equal(slowFinished, false, 'First useful evidence must not wait for every writer')
    assert.ok(first.cards.length > 0 && first.cards.length < 24)
    assert.ok(first.cards.every(card => card.verification.semanticCheck === 'model_checked'))
    assert.ok(first.cards.every(card => first.sources.some(source => source.id === card.sourceId)))
  } finally { slow.resolve() }
  const final = await pending
  assert.equal(snapshots[0].cards.length, 0, 'The canvas receives a stable identity before research')
  assert.ok(snapshots.every(snapshot => snapshot.id === final.id))
  for (let i = 1; i < snapshots.length; i++) assert.ok(snapshots[i - 1].cards.every(card => snapshots[i].cards.some(c => c.id === card.id)))
  assert.ok(snapshots.at(-1).cards.every(card => final.cards.some(c => c.id === card.id)))
  assert.equal(final.cards.length, 24)
  assert.ok(audits.slice(1).every(batch => batch.retainedCandidateIds.length > 0))
  assert.ok(audits.every(batch => batch.retainedCandidateIds.every(id => batch.allCandidateSummaries.some(card => card.id === id))))
})

test('a later semantic duplicate of an accepted study is rejected before it can be revealed', async () => {
  const provider = fixture(), model = provider.model, reveals = []
  let checkedFirst = false
  provider.model = async args => {
    const result = await model(args)
    if (args.stage.startsWith('audit_')) {
      if (checkedFirst) for (const verdict of result.verdicts) verdict.duplicateOf = args.data.retainedCandidateIds[0]
      checkedFirst = true
    }
    return result
  }
  const result = await runSafari({ challenge: 'Increasing participation in local activities' }, { provider, onEvidence: e => reveals.push(e) })
  assert.equal(result.cards.length, 4)
  assert.ok(reveals.every(e => e.cards.length <= 4))
  assert.ok(result.trace.rejected.some(item => item.verdict?.duplicateOf))
})

test('failed semantic checks never appear even in an intermediate reveal', async () => {
  for (const hooks of [{ unsupported: true }, { thin: true }, { badQuote: true }]) {
    const snapshots = []
    await runSafari({ challenge: 'Increasing participation in local activities' }, { provider: fixture(hooks), onEvidence: snapshot => snapshots.push(snapshot) })
    assert.ok(snapshots.every(snapshot => snapshot.cards.length === 0))
  }
})

test('cancelling after the first reveal prevents further evidence and queued audit calls', async () => {
  const controller = new AbortController(), snapshots = []
  const provider = fixture(), model = provider.model
  let audits = 0
  provider.model = args => { if (args.stage.startsWith('audit_')) audits++; return model(args) }
  await assert.rejects(runSafari({ challenge: 'Increasing participation in local activities' }, { provider, signal: controller.signal,
    onEvidence: snapshot => { snapshots.push(snapshot); if (snapshot.cards.length) controller.abort() },
  }), { name: 'AbortError' })
  assert.equal(audits, 1)
  assert.equal(snapshots.filter(snapshot => snapshot.cards.length > 0).length, 1)
})

test('uncached web research emits referenced evidence before final presentation and records time to first findings', async () => {
  const events = []
  const result = await runWebSafari({ challenge: 'Increasing participation in local activities' }, {
    provider: fixture(), cache: new FileCache(null), onEvent: event => events.push(structuredClone(event)),
  })
  const evidence = events.filter(event => event.type === 'evidence')
  assert.equal(evidence[0].safari.cards.length, 0)
  assert.ok(evidence.some(event => event.safari.cards.length > 0 && event.safari.cards.length < result.cards.length))
  assert.ok(events.findIndex(event => event.type === 'evidence' && event.safari.cards.length) < events.findIndex(event => event.stage === 'curating'))
  for (const event of evidence) {
    assert.equal(event.safari.id, result.id)
    assert.equal(event.safari.trace, undefined)
    assert.ok(event.safari.sources.every(source => source.content === undefined && source.passages === undefined && source.queries === undefined))
  }
  assert.ok(result.timing.firstEvidenceMs <= result.timing.totalMs)
  assert.equal(result.timing.overlappingStages, true)
  assert.equal(events.at(-1).type, 'done')
})
