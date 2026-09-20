# Evidence Safari engine

A discovery engine and independent `/safari` experience: a challenge goes in; a varied, referenced collection of bitesized findings comes out. Default target: 24 records across People, Patterns, Systems, Elsewhere, Edges and Possibilities. The engine does not force a count when the evidence is weak.

The output keeps three things separate: **what the source found**, **why it might matter here**, and **a question to investigate**. Those are different kinds of statement. This matters especially when transferring findings across disciplines.

## Use it now

Node 22+ and the existing project dependencies are sufficient. No new packages were added.

```bash
npm run safari -- "increasing participation of young people in conferences"
npm run safari -- "reducing food waste in hospital catering" --geography "United Kingdom"
npm run safari -- "helping neighbours share tools" --context "Residents of apartment buildings; focus on borrowing rather than ownership" --out output/tool-sharing
npm run test:safari
```

Configure `OPENAI_API_KEY` and `PERPLEXITY_API_KEY`, or their `_FILE` variants, on the server. OpenAI also supports the existing project key-file lookup. Labelled multi-key files are supported without printing their contents. No keys are sent to the browser. This implementation uses the credentials already configured locally.

Each command writes `safari.json` (including source extracts and the audit trail) and `safari.md` (a readable safari). Exit codes: 0 = coverage criteria met, 2 = partial/insufficient evidence with artifacts saved, 1 = configuration/input/fatal provider failure.

Options: `--count 24` (18–36), `--max-cost 0.40` (USD), `--context`, `--geography`, `--out`, `--refresh`, `--no-cache`. Count is a soft target. Refresh regenerates the plan and findings; search results may still come from their 24-hour cache. Use `--no-cache` for wholly fresh retrieval. Cached full results retain their original generation/retrieval dates and report zero new API cost.

Programmatic entrypoint:

```js
import { runSafari } from './lib/evidence-safari/engine.mjs'

const safari = await runSafari({
  challenge: 'Increasing participation of young people in conferences',
  geography: '',
  context: '',
  targetCount: 24,
}, {
  maxCostUsd: 0.40,
  cacheDirectory: '.cache/evidence-safari',
  onProgress: console.log,
})
```

There is also `POST /api/evidence-safari` in Express and a matching serverless entrypoint. It is intentionally backend-to-backend: enable it with `EVIDENCE_SAFARI_TOKEN` and send `Authorization: Bearer <token>`. Body fields match the example above. HTTP cost is fixed at the server's $0.40 guardrail; the client cannot raise it. The response omits full source extracts but retains short supporting quotes, links and hashes. Missing configuration returns 503, bad token 401, invalid input 400, process concurrency limit 429, fatal provider failure 502. Evidence insufficiency is a successful response with an explicit `status`, not a provider error.

The website uses a separate `POST /api/safari/run` endpoint. No shared service token is exposed to the browser. See the website section below for its bounds and deployment considerations. This work has been verified locally; it has not been deployed.

## Website experience

Open `/safari` on the existing Vite or Express app. The route loads its own React module and scoped CSS; it does not import the Change Cards application or depend on its Supabase rooms. Typography, paper, ink and small pen illustrations connect the two experiences. The Discovery half of the Double Diamond is highlighted. Narrow `vercel.json` rewrites handle direct links to `/safari` and `/safari/`, following [Vercel's Vite SPA guidance](https://vercel.com/docs/frameworks/frontend/vite); API and example-asset paths retain their existing routing.

The worktable offers six coloured evidence piles, using the Change Cards paper, ink, bold colour, thick doodles and physical-card styling. A pile reveals one short finding. “Surprise me” prioritises unseen findings and the least-visited perspectives; “Take a detour” moves into another perspective, favouring unseen findings there. Drawing uses the already-curated collection and makes no provider calls. “Your trail” lets people revisit discoveries. Empty perspectives remain visible as open questions.

A finding starts with a title, short takeaway and source link. “Look a little closer” reveals the finding, original setting, relevance hypothesis, transfer caution and discussion question. Methods, limitations and the supporting passage sit one fold deeper. New findings start collapsed even when the previous one was expanded.

A **field guide** holds kept findings, personal notes and a reflection. Each safari keeps its own guide and is accessible from previous trails. Text, references, notes and discovered IDs use the existing `evidence-safari.field-guides.v1` localStorage key, preserving earlier guides. The old image database is no longer used; existing data is not deleted. Change Cards storage is untouched. Guides are local to this browser, with no account sync. Storage failures leave the current view usable and show an export reminder.

Copy one finding, copy a saved guide, or export the entire safari. Markdown includes full findings, context, caution, source links, short supporting passages and personal notes. Print/PDF renders complete content even when the onscreen findings are collapsed. The science-communicator example in `public/safari/example/` is a precomputed, referenced run, clearly opened as an example and dated by its original generation time; it does not spend API credits on page load.

### Streaming, static doodles and costs

The browser endpoint streams NDJSON: an initial `evidence` snapshot opens the canvas, followed by overlapping `progress` and checked `evidence` snapshots, then `result` and `done`. Each completed writer queues its audit while the other writers continue. Audits run serially, with previous accepted findings available for cross-study deduplication. No unchecked drafts are sent to the browser. Equal per-lens spaces are reserved during generation; spare spaces are filled at the end. Already revealed findings remain in the final selection.

New safaris open directly on the field-table canvas. Six doodled placeholders make room for arriving piles. Cards arrive with a short animation and can immediately be moved, read or annotated. A compact status shows the number of findings, elapsed time, “See latest” and “Stop here”. Stopping or losing the connection keeps checked findings as a partial guide. Late snapshots preserve canvas positions, notes, deletions and the card currently being read. Cached results open immediately. The example and older discovery board remain available.

There are no image or Jev calls. Errors before any findings remain retryable; cancellation and connection close abort upstream work. Every public snapshot omits full extracts, queries and the rejection trace. Timing now includes `firstEvidenceMs` and `overlappingStages`; consecutive stage-start timestamps should no longer be interpreted as exclusive stage durations.

Six category doodles in `public/safari/doodles/` were generated once during development using the existing Change Cards pen drawing as a style reference. They are static category markers, not depictions of evidence. No Gemini credentials are required. Asset prompts, provenance and redesign rationale are in [the redesign note](safari-redesign.md).

Station stories for the exported collection still add one bounded model call. Browser work reserves against a **$0.25 estimate limit**, reduced from $0.50; failed or ambiguous calls retain conservative reservations. Repeated identical complete safaris are cached for 24 hours, with zero new model cost on cache hits. Completed and partial runs also write a compact `safari_run` ledger into the server cache directory, independently of whether evidence is cacheable. The result includes time and usage for the folded **Behind the finds → Time & cost** view. These are usage estimates, not provider billing receipts; local cache files are not a durable billing system.

Historical comparison: the original workshop example generated 23 findings across seven disciplines plus six illustrations for $0.293637 estimated total. Research and editing accounted for about $0.08, artwork about $0.21. That measured run predates the removal of image generation. It is not a current-run invoice or a guaranteed future price. The redesign's live endpoint check reused all 23 findings at $0 new provider cost.

Browser requests require a matching Origin (local development also permits localhost ports), valid bounded input, and available capacity. Default limits are two active runs, eight starts per IP per hour and sixty starts per day **per server process**. These provide prototype bounds, not authentication or a durable global quota: Origin headers can be forged outside a browser, and restarts/multiple serverless instances have independent counters. A scaled public launch needs shared quotas or authenticated usage accounting. Serverless cache files live in `/tmp`; other cache files are git-ignored. Each browser run has a 280-second deadline; serverless entries request 300 seconds, subject to the hosting plan. No provider keys or a reusable service token are bundled into the frontend.

### Verification

`npm run test:safari` covers source/quote gates, substantive findings, bounded spend, caching, failure handling, origin/rate checks, disconnect cancellation, streaming, presentation fallbacks, non-repeating discovery draws, honest progress counts, zero image calls and reference-preserving exports. Progressive tests hold a writer open and verify that audited cards are delivered early, retained at completion, deduplicated against previous batches and never delivered after cancellation. No external providers are used by those tests.

`SAFARI_TEST_ORIGIN=http://localhost:8787 npm run verify:safari` exercises the browser with a deterministic generation stream. It checks desktop/mobile layouts down to 320px, doodle visibility and overlap, collapsed and expanded evidence, detours, sparse results, kept findings, notes and trail after reload, clipboard use within a native dialog, Markdown download, complete print/PDF output, incremental progress, errors, cancellation and Change Cards route isolation. Add `-- --live` to exercise the actual configured endpoint; that may incur provider charges on a cache miss. Verification screenshots and a result record go to `output/safari-ui/`.

## Implementation choice

**Perplexity raw Search API + GPT-5.6 Luna at low reasoning effort.** Retrieval and synthesis are separate. Provider interfaces are injected into `runSafari` so another search/model implementation can be evaluated against the same validation and selection pipeline.

The decision is about controllable discovery and provenance, not which chatbot writes the most persuasive answer. Search supplies a bounded collection of URLs and extracts. The model chooses queries, distils evidence and checks support. It cannot add URLs to the source registry. Source selection balances empirical research with documented qualitative experience and institutional practice; a recommendation is not labelled an experimentally demonstrated effect.

Current published prices checked on 5 September 2026, before volume discounts and free allowances:

| Option | Published unit price | Assessment for this engine |
| --- | --- | --- |
| [Perplexity Search](https://docs.perplexity.ai/docs/getting-started/pricing) | $5/1,000 successful requests; up to five queries per request; no extra search-content token charge | Chosen. Raw extracts, filters and bounded requests; pairs of complementary queries fit each lens. Six requests cost $0.03. |
| [Brave Search](https://brave.com/search/api/) | $5/1,000 requests including LLM context | Strong alternative. Would need a quality comparison on this workload; not benchmarked here. |
| [Exa](https://exa.ai/pricing) | Search $7/1,000 up to ten results; contents $1/1,000 pages | Strong alternative for semantic discovery and targeted content retrieval. Not benchmarked here. |
| [Tavily](https://www.tavily.com/pricing) | $0.008/credit PAYG; [basic search 1 credit, advanced 2](https://docs.tavily.com/documentation/api-credits) | Convenient search/extract product. Explicitly controlling advanced search matters for spend. |
| [Firecrawl](https://www.firecrawl.dev/pricing) | Search 2 credits/ten results; scraping 1 credit/page; credit value depends on plan | Useful for later full-page/PDF retrieval where excerpts are too thin. No need for a crawler on every result in the first version. |
| [Gemini Google grounding](https://ai.google.dev/gemini-api/docs/google-search) | Gemini 3 bills individual executed queries; [published search price $14/1,000 after allowance](https://ai.google.dev/gemini-api/docs/pricing) | Useful integrated alternative, but the model decides how many queries to execute. Less explicit control over the evidence corpus and search budget. |
| [OpenAlex](https://help.openalex.org/access/pricing/) | $1 daily API allowance for a free account; paid usage beyond allowance | Useful scholarly enrichment later. A scholarly corpus alone undercovers lived experience, operational reports and emerging practice. |
| [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) | $0.20/M input tokens; $1.20/M output tokens | Chosen for bounded planning, drafting and verification. Cost reporting conservatively ignores cached-input discounts. |

These are a documentation comparison, not a head-to-head retrieval benchmark. The local live evaluation compares model/prompt configurations using Perplexity retrieval. No new subscription was purchased.

An initial GPT-4.1 mini run was unsuitable: it yielded only eight selected records, altered many quotations and allowed weak statistical roundups through its model audit. That result is retained under `output/evidence-safari/baseline-gpt41` as a **failed development baseline**, not an evidence pack to use. The final configuration and live measurements are recorded in the [evaluation document](evidence-safari-evaluation.md).

## Pipeline and bounded work

1. **Frame.** One model call creates two targeted queries for each lens. Unspecified age, geography and outcomes remain explicit uncertainties. Queries probe mechanisms, alternatives and counterevidence, not only the literal challenge wording.
2. **Retrieve.** Six Search requests, each with two queries; three requests at a time. Up to 12 results and 16,000 content tokens per request. Search extracts are cached for 24 hours. Long extracts are capped at 6,500 characters before model use.
3. **Distil.** Six calls produce up to six candidate records per lens. Only supplied source IDs and mechanically numbered passage IDs are allowed. The engine copies the selected original passage into `supportQuote`; the model never writes quotations. Full extracts are available to the writer. Weak records may be omitted.
4. **Check.** Deterministic schema, length, URL, source-provenance and exact-quote checks run first. Up to three independent model calls then check each finding against its complete supplied extract, including title, takeaway, context, source suitability and honesty of transfer. A substantive-content gate rejects bare definitions, study objectives and forced analogies. Missing/failed verdicts reject a record.
5. **Select.** Round-robin selection across the lenses favours new disciplines, permits one record per source and underlying study key, and caps any source domain at three records. Text similarity removes near-identical findings. The target is a breadth goal, not a quota to invent evidence.
6. **Return.** Evidence records, source registry, assumptions, coverage, gaps, rejection reasons, actual token usage, estimated dollar cost and timing are exported. Coverage status requires at least 20 records (or a lower requested target), two per lens, four disciplines and eight source domains. `complete` means those coverage gates passed; it does not mean the literature is exhaustively covered or every claim is scientifically certain.

No autonomous retry/research loop: six searches and at most thirteen engine model calls (one planner, six writers, six lane audits), plus one station-editing call on the web. Writers run three at a time and one audit can overlap them. Smaller audit batches add prompt overhead; this change is intended to improve time to useful evidence, not claim a measured reduction in total time or cost. Calls reserve a conservative cost estimate before execution, including concurrent requests. Successful token usage replaces the reservation; ambiguous failures retain their reserved cost. The ceilings remain $0.40/CLI run and $0.25/web run at the checked rate card, not contractual billing guarantees. Provider pricing changes, taxes and hosting are outside this estimate. API retries are disabled. The engine deadline is four minutes; search requests time out after 30 seconds and model requests after 90 seconds.

## Evidence contract

The JSON record contains:

- `finding`, `title`, `takeaway`, `context`: what was actually reported and where; the takeaway is the short collapsed preview.
- `evidenceType`, `sourceRole`, `qualityReason`, `limitation`: a transparent account of the method/provenance, without a misleading universal evidence score.
- `sourceId`, `supportQuote`: a registry reference and a short, exact source passage.
- `relevance`: `direct`, `adjacent` or `analogy`.
- `connection`, `transferCaution`, `discussionQuestion`: a hypothesis and inquiry prompt, separated from source findings.
- `discipline`, `lens`, `studyKey`: diversity and deduplication metadata.
- `verification`: machine quote matching and model checking; `humanReviewed` is explicitly false.

The source registry includes the original URL, provider title/date, retrieval timestamp, extract, SHA-256 content hash and originating search queries. Publication dates are labelled unverified provider metadata. A quote is an audit anchor, not a substitute for reading the surrounding source. A source may be correctly quoted and still have weak methods: the limitation remains visible.

Retrieved documents are treated as untrusted material. Instructions in them cannot change the task. There is no tool execution from source text, and generated references are never accepted as new sources. Prompt injection and model error cannot be eliminated just by prompting; strict registry matching and fail-closed checks provide additional boundaries.

## Limits and next quality improvements

This is a discovery engine, not a systematic review. An automated audit can share the writer's blind spots. Search-provider extracts can omit qualifiers or contain extraction errors; links and provider dates are not independently verified full-text citations. Evidence gaps mean **not established by this run**, not proof that research does not exist. The domain cap is deliberately conservative and can underuse repositories hosting many independent journals. Canonical study keys are model-produced, so differently named mirrors can evade study deduplication.

The highest-value next addition is selective full-text retrieval for sources where methods or qualifiers are missing, followed by human review of a small benchmark of diverse challenges. Add source-level quality annotations and a feedback loop before optimising costs further. Search quality and evidence quality are separate; no API guarantees the latter.

## Cards, stations and the Double Diamond

Cards remain a useful small unit within the six evidence perspectives. The implemented interface uncovers one short finding at a time and adds context, source and limitations on expansion. Participants can collect surprises, tensions, missing voices and assumptions to test in a field guide. Those discussion tasks cut across the grouping, consistent with [Policy Lab's original evidence safari](https://openpolicy.blog.gov.uk/2016/03/07/exploring-the-evidence/).

The evidence records remain independent of their layout, leaving room to connect the field guide with Change Cards or a future shared notebook. The attached image supports this mixed collection of facts, research and lived experience; its document contents were reference material, not instructions to the engine.
