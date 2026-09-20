# Evidence Safari canvas field table

Open `/safari/field-table` for the precomputed workshop collection, or `/safari/field-table?safari=<saved-id>` for a guide saved in this browser. No research API call is made when opening or working on the canvas.

Starting a new safari at `/safari/` now opens this same canvas during generation. Empty categories have static doodle placeholders; each checked batch adds cards without moving, reselecting or reopening existing shapes. “See latest” focuses a new find on demand. The first arrival can be brought into view on an untouched mobile canvas, but subsequent arrivals never change the camera. “Stop here” saves the partial guide and aborts outstanding research. A lost connection also preserves checked findings. The final result uses the same safari and document identity. Reopening one of these safaris from “previous trails” returns to its canvas; older guides and the precomputed example retain their discovery view.

## Interaction

The entire field table is a tldraw document with its standard toolbar, menus and gestures. All evidence cards can move, resize, rotate, bind to arrows, live inside frames, and be grouped. Drag a card from one of six loose piles to explore it; double-click a card to zoom in and read it. Draw connections with **A**, double-click an arrow to label it, use **N** for notes, **D** for freehand drawing and **F** for frames. Select multiple cards with Shift-click or a marquee, then use **Cmd/Ctrl G** to group. Native undo/redo, pan, zoom, alignment, snapping and clipboard actions are available.

The small **+** turns a card over and brings it into a comfortable reading view. Its reverse contains the finding, original setting, evidence type, quality rationale, limitation, transfer caution, supporting search extract, retrieval date and original link. Scroll inside the reverse to read everything. **×** or **Escape** flips it back and restores the exact previous pan, zoom and selection. The card keeps the same identity, dimensions, position and native arrow bindings throughout; reading creates no extra shapes. Flip and camera animations respect reduced-motion preferences.

Evidence cards keep the original finding and provenance together. Personal ideas are native notes, text, arrows and frames. The initial prompt note is editable; once edited, it is included in the field-note export.

## Persistence and exports

- tldraw stores the complete document and session in IndexedDB under `evidence-safari.canvas.v2:<safari-id>`, including native shapes, bindings, groups and camera. Storage is local to the browser and origin; this demo has no multiplayer or cloud sync.
- Every custom card embeds its complete evidence and source payload, so native copying does not depend on React state or the original guide remaining open. The open reverse is transient editor state; reloading starts with front faces.
- Older detail companions are folded into their original findings on opening. Personal arrow bindings to a companion are redirected to the finding, while the generated source connector is removed. If the original finding was deleted, its source card is retained as a compact, flippable evidence card.
- First opening carries over existing personal notes, reflection and valid connections from the earlier guide/table. Prior connections become native frames, cards, text and bound arrows. Original stored data is retained.
- A page marker prevents re-seeding a document after its contents are deliberately deleted. Canvas changes thereafter remain independent from the original discovery guide.
- The page also records every imported evidence ID. This prevents later research snapshots or reopening from resurrecting a deleted card. Arrivals are local persisted document changes, excluded from the user's undo history. Personal notes, connections and edited category labels are retained.
- The native menu exports SVG/PNG with card fronts and source hyperlinks. Reading a reverse does not change the exported table; the complete evidence details remain available in the Markdown export.
- The Safari menu items copy/download Markdown containing current canvas notes, frame names, native arrow labels/endpoints and deduplicated evidence, including source links and limitations. This text export does not preserve spatial layout; SVG/PNG preserve appearance.

## Runtime

Uses tldraw 5.4.2 and React 19.3. The field-table route is loaded lazily. Local development works without a licence key. An active [100-day trial licence](https://tldraw.dev/community/license) permits production evaluation. Set the emailed key as `VITE_TLDRAW_LICENSE_KEY` in Vercel's **Production** environment before deploying: Vite embeds this public SDK key at build time, so changing it requires a new build. The key must cover the deployment domain. Trial keys stop working at expiry, without a grace period; the [SDK's licence documentation](https://tldraw.dev/sdk-features/license-key) describes validation and renewal. The SDK's own licensing UI is retained.

## Verification

Run `npm run test:safari` and `npm run build`. Canvas model tests cover complete evidence seeding, independent provenance payloads, duplicate handling, native binding export, absent sources, rich-text conversion and preservation of evidence/connections when migrating old source companions. Browser verification covers native canvas gestures and persistence, flipping a grouped card inside a frame, readable zoom, internal scrolling without canvas movement, reaching the source link, and returning to the same table view.

`node scripts/verify-safari-reveal.mjs` exercises progressive arrivals, reading and dragging during research, notes/deletions across later snapshots and reopening, cached results, early errors, stopping, interrupted streams, 320/390px layouts and reduced motion. It intercepts the research stream and blocks paid API calls. Screenshots and results are written to `output/safari-reveal/`. The full `npm run verify:safari` suite also runs these checks alongside discovery, exports and Change Cards route isolation, writing to `output/safari-ui/`.
