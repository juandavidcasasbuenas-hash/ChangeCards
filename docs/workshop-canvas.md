# Discover and Develop on one board

The workshop has two entry points: Evidence Safari for **Discover**, and Change
Cards for **Develop**. A person can start with either. Switching modes navigates
between areas of the same tldraw page; it does not create a second document or
replace the work already on the board.

Discover retains its evidence stations and research pipeline. Develop contains
the existing Change Card catalogue, its four categories, curated routes and a
working area. Cards, writing, notes, connectors and drawings are native tldraw
records. Catalogue cards remain reusable prompts; working copies hold a person's
ideas and sparks. Curated routes guide exploration without imposing turns on
other participants.

## Bringing evidence into an idea

Starting from a finding copies it into the Develop area. The original remains in
its evidence station. The copy carries the complete evidence payload, including
the source, context, limitations, transfer cautions and supporting extract. Its
origin shape ID records the connection to the original finding. Copying a finding
does not turn a speculative application of that evidence into an established
research claim.

Sparks continue to use the existing endpoint and cache. Selected evidence is
labelled as research context, with source information and limitations, alongside
the person's workshop notes. Browsing categories, opening a route, switching
modes, moving a card, writing a note and joining a shared board require no model
calls. New spark requests remain an explicit user action.

## Existing work and invitations

Existing Safari canvases and invite links remain compatible. The custom Safari
shape schemas and the local Safari persistence key are retained. Develop is
initialized only once on a page. Revisiting it must not restore cards that someone
deleted or rearrange their notes.

An existing Change Cards session can be imported into a native board. The import
reads the union of dealt cards, saved notes and unfinished drafts, including notes
on cards that were returned to the deck. It preserves saved writing alongside a
newer draft, scrapbook order and the selected curated route. The original
`change-cards-session-v1` data remains available as a backup. Native persistence
is used for later changes; the legacy session is not continuously re-imported.

Invitations are available after a board exists. The current document is copied
into the existing Cloudflare room service, then all participants edit that one
document. This works for a Change Card-only board as well as a Safari or a board
containing both stages. No research generation is required before sharing a
Develop board. The server accepts one tldraw page with either evidence cards or
Change Cards, and retains the existing participant, record and size limits.

The capability link grants editing access to the entire board, including its
evidence extracts. Anyone with the complete link can forward it. The key stays in
the URL fragment; server-side creation credentials never reach the client.
See [Shared Safari boards](safari-sharing.md) for deployment, access and limits.

## Shared content, individual exploration

Cards, ideas, notes, arrows and evidence belong to the board. Each participant's
camera, chosen stage, category and reading panel are their own. Initial sharing
strips local stage and category fields from page metadata. A stage switch should
not move another participant's camera or close their reading panel.

Use separate working copies for separate contributions. tldraw merges record
changes, but it is not a character-level collaborative text editor: simultaneous
changes to the same text property can replace one another. A copied prompt with
its own author and note preserves parallel contributions without turn taking.

## Verification

`tests/develop-integration.test.mjs` covers legacy import, provenance, initialization
and stage boundaries without paid API calls. `tests/safari-sharing.test.mjs`
exercises the real Worker protocol, including loading the legacy Safari schema,
adding Change Cards to an existing room, sharing a Develop-only board, native
property updates and durable reopening. Existing Safari tests remain applicable
to generation, citations and canvas exports.

Frontend and Worker shape schemas must be deployed together. Deploy the Worker
first so it accepts the new shape types before a browser can create them. Retain
the existing Safari shape types so saved rooms remain readable.
