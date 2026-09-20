# Evidence Safari: a tabletop of discoveries

Updated 5 September 2026. The six-category evidence engine remains intact. This revision changes the interface, progress feedback and artwork delivery.

The previous editorial station grid was too uniform and too much like a research index. [This critique of AI-generated UI](https://docs.bswen.com/blog/2026-03-20-ai-generated-ui-anti-patterns/) points to repeated templates, excessive containers and decorative effects without purpose. The concrete visual reference here is the actual Change Cards interface: Charter headlines, DM Sans, small DM Mono labels, warm paper, black ink, saturated colour, workshop notes and thick pen doodles.

Six coloured piles now sit on a worktable. Each click uncovers one referenced nugget. A detour changes perspective; a surprise draw favours the least-explored perspectives. Findings are drawn from the curated evidence already returned, so exploring has no extra API cost. The trail makes serendipity revisitable. The field guide preserves the user's notes and keeps sources attached. Detail is folded twice: first context and relevance, then source methods and caveats.

Research uses real streamed completion events for each perspective, actual source totals and audit counts, plus elapsed time. There is no invented completion percentage. Image generation was removed from the backend and browser flow. The six category doodles below are static assets generated once during development. They do not depict studies, participants or research data.

## Doodle provenance

Generated with the built-in image-generation tool, one image per category. All six used `public/icons/change-cards/04-hand-over-the-pen.png` as the visual style reference. Outputs were copied directly without raster editing. The transparent backgrounds allow the category colours to show through.

Saved files:

- `public/safari/doodles/people.png`
- `public/safari/doodles/patterns.png`
- `public/safari/doodles/systems.png`
- `public/safari/doodles/elsewhere.png`
- `public/safari/doodles/edges.png`
- `public/safari/doodles/possibilities.png`

Exact shared prompt, substituting the category name and scene below:

> Create ONE standalone doodle icon for "${name}", to be used on a colourful physical-looking workshop card in a design-thinking game. Scene: ${scene} Style: quick confident thick BLACK felt-tip strokes, lively slightly wobbly outlines, intentionally simple and whimsical, like a facilitator drew it in ten seconds. Flat 2D ink, very few details, friendly adult workshop aesthetic. Match the attached reference's thick black doodle language but do not copy its objects or tiny foot logo. Centre the doodle, let it fill roughly 70% of a square canvas. Genuinely transparent background, pure black ink only, no colour, no shading, no thin engraved lines, no textures or realistic rendering, no text, no letters, no numbers, no logos, no signatures, no feet/footprints. This is a reusable category illustration, not a depiction of evidence.

| Category | Exact scene |
| --- | --- |
| People | Two simple, playful stick people leaning towards an oversized listening ear. A tiny speech bubble above them. Three connected elements, instantly legible. |
| Patterns | A big slightly wonky magnifying glass hovering over three repeating wavy lines, with one line playfully escaping the pattern. |
| Systems | Three chunky, imperfect interlocking cogwheels, one large and two small, with a short loose string pulling one of them. |
| Elsewhere | Two open doorways at different angles, joined by one looping dotted arrow that goes out of one door and into the other. |
| Edges | A small curious stick figure peeking around the edge of an unfinished square frame, leaning out beyond the boundary. |
| Possibilities | A chunky pencil with two little rocket fins taking off, leaving a short loose spring-like scribble behind it. |

## Verification

The deterministic suite covers evidence quality and provenance, honest progress, cost limits, drawing behaviour and exports. Browser verification covers the six piles and all six images, desktop and mobile, compact reveals and source expansion, detours, trail/notes after reload, copy/download/PDF, incremental progress and cancellation, sparse results, and the unchanged Change Cards route. Screenshots and the browser verification record are under `output/safari-ui/`.
