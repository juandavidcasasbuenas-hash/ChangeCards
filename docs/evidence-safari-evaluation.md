# Evidence Safari: implementation evaluation

Checked on 5 September 2026. Engine version 1.2.0. These are live prototype measurements, not a statistical benchmark or a systematic evidence review.

## Final live runs

| Challenge | Selected records | Source URLs | Source domains | Elapsed | Estimated API cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Increasing participation of young people in conferences | 24 | 24 | 18 | 63.3 seconds | $0.079122 |
| Reducing food waste in hospital catering | 21 | 21 | 14 | 63.8 seconds | $0.084022 |

Both had zero search-cache hits and covered all six lenses. Counts are intentionally flexible: the hospital run retained 21 rather than padding to 24 after support checks and diversity selection. Reusing each completed run returned the same result ID with zero additional API usage; this was checked using a provider stub that would throw if generation were attempted.

| Lens | Conferences | Hospital food waste |
| --- | ---: | ---: |
| People | 5 | 4 |
| Patterns | 3 | 3 |
| Systems | 3 | 4 |
| Elsewhere | 4 | 4 |
| Edges | 4 | 3 |
| Possibilities | 5 | 3 |

The conference output includes model-assigned fields spanning sociology, education, public policy, public health and economics, plus `other`. The hospital output includes public health, organisational studies, engineering, sociology, public policy and education. These tags support navigation; they are not an independently validated classification of the research.

## Reviewable results

- [Conference safari, readable](../output/evidence-safari/youth-conferences/safari.md)
- [Conference safari, source extracts and audit trace](../output/evidence-safari/youth-conferences/safari.json)
- [Hospital food-waste safari, readable](../output/evidence-safari/hospital-food-waste/safari.md)
- [Hospital food-waste safari, source extracts and audit trace](../output/evidence-safari/hospital-food-waste/safari.json)
- [Machine-readable evaluation](../output/evidence-safari/evaluation.json)

## What the live tests changed

The initial GPT-4.1 mini configuration returned eight selected records and let weak statistical roundups through the model audit. Switching to Luna alone improved the output but still lost many candidates to quotation mismatches. The final approach removes quote writing from the model: the engine creates numbered passages and copies the passage associated with the selected ID. Excerpts never cross the search provider's explicit omission boundaries. Full-context model checks still assess the entire claim; a matching passage is not sufficient proof.

The final query-plan schema requires six named lens objects with two queries each. This prevents occasional malformed plans and keeps internal count settings out of the research context. Elsewhere explicitly seeks other settings and marks transfer as analogy. A small denylist excludes statistical roundup sites identified during live testing; broader source suitability still depends on provenance and model assessment, not that denylist.

Audit calls see summaries of every candidate, including those in other batches, to reduce duplicate underlying studies or datasets. Exact source identity, canonical study key, text similarity and a domain cap provide further deduplication. This is useful but not perfect bibliographic entity resolution.

Examples of rejected candidates in the final runs:

- A source’s estimate did not contain the claimed 55% vegetable-waste figure.
- A before–after comparison was given a causal title without adequate support.
- A secondary source was presented as primary research.
- The same youth-activities research appeared more than once.
- An extract had an incomplete comparator, so an asserted reduction could not be verified.

Targeted source review during development checked the [doctoral conference participation paper](https://files.eric.ed.gov/fulltext/EJ905783.pdf) and the [Youth in Landscapes evaluation](https://online.ucpress.edu/elementa/article/doi/10.1525/elementa.327/112847/Towards-meaningful-youth-participation-in-science). The former supports barriers around interaction and reflection; the latter distinguishes reported confidence gains from limited evidence of policy influence. An attempted independent fetch of the Gen Z conference paper returned HTTP 429. This limited review does not make the full packs human-verified.

## Engineering checks

All 14 automated tests pass, covering input validation, safe citation URLs, source deduplication, exact passages, provenance rejection, concurrent budget reservations, cache expiry/reuse, lens diversity, fabricated IDs, unsupported claims, provider outages, missing/duplicate audit verdicts, failed audits and HTTP access controls.

Additional checks passed:

- Every final record's support passage exists verbatim in its saved extract and contains no more than 25 words.
- No selected passage crosses an explicit excerpt-omission join.
- Every selected record has a distinct source ID and an explicit `humanReviewed: false` flag.
- Express health, Safari route configuration and existing Sparks validation work without paid calls.
- Production build and `git diff --check` pass. Vite still reports its existing large-bundle advisory.

## Practical conclusion

For a first discovery engine, a roughly one-minute run at about eight US cents is a useful balance of breadth, traceability and cost. Two challenges are insufficient to establish reliability on arbitrary topics. The implementation returns gaps when evidence is sparse and leaves provider-extract, source-date and automated-review limitations visible. Selective full-text retrieval and a human-scored benchmark across more challenge types are the next quality improvements.

The backend runs locally now, with an optional service-authenticated HTTP route. Public hosting, a frontend and public-user quotas are outside this implementation.
