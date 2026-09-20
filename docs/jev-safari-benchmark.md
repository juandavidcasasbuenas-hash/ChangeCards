# Jev evaluation for Evidence Safari

Live test on 19 September 2026. Jev is promising for fast screening, but this test does not justify replacing the full Safari auditor. The production engine is unchanged.

| This 24-case audit test | Jev 1.13.0 | Current GPT-5.6 Luna auditor |
| --- | ---: | ---: |
| Agreed with predefined accept/reject labels | 23/24 | 24/24 |
| Supported cards retained | 8/8 | 8/8 |
| Deliberately bad or thin cards rejected | 15/16 | 16/16 |
| Wall time | 3.003 seconds | 13.967 seconds |
| Estimated API cost | $0.002687 | $0.011602 |
| Input tokens | 63,976 | 38,235 |
| Output tokens | 2,921, free | 3,296 |
| Requests, with concurrency capped at 3 | 24 | 8 |
| Service or schema failures | 0 | 0 |

**Total test cost: approximately $0.01429 (1.43 US cents).** Calculated from reported usage at [TypeSafe's published rate](https://docs.typesafe.ai/models) and [OpenAI's published rate](https://developers.openai.com/api/docs/models/gpt-5.6-luna), matching the project's configured OpenAI prices. No cached OpenAI input tokens were reported. This is a usage-based estimate, not an invoice.

Jev accepted a modified claim saying an audit covered **402 different patients**, although the source says **402 meal trays**. All five Jev checks passed; its support probability was 0.68. The current auditor rejected the denominator error. Jev caught the other planted errors: wrong percentage, unsupported causality, misattributed background research, reversed statistical significance, wrong population/date, guidance presented as effectiveness, proven transfer, false quality labels and invented follow-up. It also rejected four thin legacy cards and retained the useful cross-sector analogies and honestly labelled guidance.

The predeclared exploratory rule requiring every pass probability to reach 0.9 would auto-accept **zero** cases. Sending everything else to the current auditor would therefore add work on this sample. Thresholds need validation on a separate labelled set; tuning them to these 24 cases would not demonstrate general reliability.

The closest next pilot is **Jev screening source material for substantive findings before card writing**, with the current final factual audit retained. The four thin cases are encouraging, but source-only screening itself was not tested here. This could reduce material sent to the writer, which is the larger delay: two saved Safari runs spent 36–59 seconds writing, compared with 11–17 seconds auditing. Jev returns typed judgments rather than writing card prose. Search, planning and writing costs remain after an auditor swap.

The benchmark used saved research from science-communication workshops, hospital food waste and youth participation. Eight supported examples were prepared conservatively, four thin examples came from older saved outputs, and twelve semantic mutations were deliberately introduced. Labels and prompts were frozen before requests. These are agent-authored regression labels based on supplied extracts, not expert adjudication or a random sample of production traffic.

Each case passed existing deterministic quote, source and length checks. Requests excluded previous model verdicts and expected labels. Jev received one card and its complete available source extract, with five independent questions following the [citation-checking cookbook](https://docs.typesafe.ai/cookbooks/citation_check). The current model used the application's actual auditor prompt and schema. Variants of a study were kept in separate batches to prevent duplicate detection from masking semantic failures; the eight baseline requests are therefore not the usual production batch layout. Cross-card study deduplication, retrieval, drafting and a full end-to-end Safari were not tested. One run per case does not establish latency stability or a production error rate.

Reproduce locally with:

```sh
node scripts/benchmark-safari-jev.mjs        # Offline fixtures and checks; no API calls
node scripts/benchmark-safari-jev.mjs --live # Paid, opt-in comparison; $0.20 ceiling per run
```

The live command reads `jev.txt` (or `TYPESAFE_API_KEY`) and the existing OpenAI credential. Keys are never written into results; `jev.txt` is now ignored by Git. All 32 requests succeeded without retry. Raw typed answers, usage, timing, prompt hashes and labels are saved in `output/jev-evaluation/`; see `latest-results.json`, the timestamped call ledger, `fixtures.json` and `manifest.json`. Explicit approval for sharing these saved test cases with both providers was obtained before execution.
