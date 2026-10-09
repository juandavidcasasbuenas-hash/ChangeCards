# Evidence Safari canvas field table

Open `/safari/field-table` for the precomputed workshop collection, or `/safari/field-table?safari=<saved-id>` for a guide saved in this browser. Opening or working on the canvas makes no research API call.

New safaris at `/safari/` open this canvas during generation. Each checked batch adds cards into reserved spaces without moving existing work. A compact progress panel shows the count, elapsed time, six research trails, **See latest** and **Stop here**. The first arrival focuses its station only if the user has not interacted; later arrivals never move the camera. Stopping or losing the connection preserves checked findings. The final result keeps the same document identity.

## Exploration and reading

The fixed header keeps even a long challenge out of the canvas. Six illustrated category buttons jump to evidence stations; **All** fits the whole table. On phones, a station opens at the first card at a readable scale. **Surprise me** chooses a finding using the existing discovery logic and reading history. The **Kept** shelf brings useful finds back into reach.

Cards use Change Cards' bold upright typography, coloured paper and reusable ink doodles. Each front shows a short takeaway and source domain. **Look closer** or double-click opens a native modal reading panel, outside the canvas's transformed shapes. It shows the full finding, possible connection and discussion prompt, with context/cautions and the supporting extract in disclosures. The original source remains directly linked. **Next in [category]** and **Take a detour** continue exploration; **Keep this** bookmarks the finding, and **Copy** includes its source and caveats.

Reading never rotates, resizes or relocates a card and never changes the camera. Escape, close or clicking the backdrop dismisses the panel and returns focus. The modal traps keyboard focus, supports touch scrolling, and stays open across evidence arrivals. Reduced-motion preferences suppress entry and navigation animations.

## Working on the table

The compact toolbar exposes Move, Pan, Note, Connect, Draw and undo/redo. Cards can move, bind to arrows, live inside frames and be grouped. Direct card resizing/rotation is disabled to keep the evidence legible. Native tldraw shortcuts and the full menu remain available: **A** for arrows, **N** for notes, **D** for drawing, **F** for frames, and **Cmd/Ctrl G** for grouping. Notes are editable; double-click an arrow to label it.

**Tidy [category]**, in Export, is an explicit undoable arrangement of ungrouped evidence. It leaves notes, groups and drawings in place and is disabled while new evidence is arriving.

## Persistence, migration and exports

- The existing IndexedDB key `evidence-safari.canvas.v2:<safari-id>` is retained. The document stores shapes, bindings, notes, camera, imported IDs, per-category arrival slots, kept/seen finds and the last chosen category. Browser and origin still define storage scope; there is no cloud or multiplayer sync.
- Document layout version 3 redistributes only cards still at their original generated pile coordinates. Moved/grouped cards and annotations are preserved. Untouched generated scaffolding is removed; an edited prompt remains personal work. Existing notes and earlier connections are carried forward.
- Older source companions fold into the original findings, redirecting personal arrow bindings. Orphaned source cards keep their evidence. Each card embeds its complete evidence/source payload so native copying is self-contained.
- Imported IDs prevent new batches or reopening from resurrecting deleted cards. Arrivals and migration stay outside personal undo history. Reserved slots prevent later cards from overlapping earlier arrivals.
- Export copies all current findings and notes, copies only kept findings, or downloads Markdown. Exports include source links, context, cautions and limitations; all-find exports also include native notes, frame names and arrow labels/endpoints. Duplicated cards are deduplicated by evidence ID. The native menu exports the visual table as SVG/PNG; Markdown retains the full evidence.

## Runtime

Uses tldraw 5.4.2 and React 19.3. The canvas route is loaded lazily. The AI research, verification and cost controls are unchanged; the interface does not add model calls or per-run image generation.

Local development works without a licence key. An active [100-day trial licence](https://tldraw.dev/community/license) permits production evaluation. `VITE_TLDRAW_LICENSE_KEY` is set in the deployment environment and embedded publicly at build time. The key must cover the deployment domain; a changed key requires a rebuild. Trial expiry and renewal follow [tldraw's licence documentation](https://tldraw.dev/sdk-features/license-key). The SDK's licensing UI remains intact.

## Verification

`npm run test:safari` covers the evidence pipeline, separate station positions, recognition of untouched legacy piles, complete provenance, deduplication, native binding export, absent sources and source-companion migration. `npm run build` checks the production bundle.

`node scripts/preview-safari.mjs` serves the built app at `http://127.0.0.1:8791` with the public example replayed one category at a time. All other API routes are blocked. This is a no-cost UI fixture, not real research for the submitted question. It supports manual checks of progress, long challenges, notes, dragging, reading across arrivals, cancellation, persistence, exports and responsive layouts.

`node scripts/verify-safari-reveal.mjs` is the automated browser harness for progressive arrivals, the reading panel, note/deletion preservation, reopening, cached results, early errors, stopping, interrupted streams and 320/390px layouts. It intercepts research and blocks paid requests. The full `npm run verify:safari` also covers the older discovery experience and Change Cards route isolation.
