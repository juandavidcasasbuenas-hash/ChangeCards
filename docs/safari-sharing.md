# Shared Safari boards

Creation/research stays local and unchanged. After a safari finishes (including a
partial safari with evidence), **Invite → Create invite link** seeds its current
document into a shared room. The initial copy includes moved cards, notes, arrows,
groups, kept finds and references. Retries never overwrite an existing room.
The original local document remains as a backup; subsequent opens of that safari
in that browser take the user to its shared board.

Guests follow the link, enter a display name, and edit the same document. Reading
panels, seen findings, station navigation and cameras are individual; kept finds
and annotations belong to the board. Names are display labels, not verified
identities. Anyone holding the full invite link can edit and forward the link.
There is no account requirement, email sending, or access revocation UI in this
first version. Save the link to return from another browser.

## Hosting

- Vercel continues to serve the website and existing evidence APIs.
- `POST /api/safari/session` validates a finished document and seeds the Worker.
- `workers/safari-sync/worker.mjs` runs native `@tldraw/sync-core`, with exactly one
  Cloudflare Durable Object per room. SQLite commits document changes durably.
- WebSocket hibernation and automatic ping responses avoid keeping an idle room
  running. Durable Objects are available on Workers Free; its usage limits apply.
- All tldraw packages are pinned to **5.4.2** on both ends. Upgrade them together.
  The browser's existing SDK licence also applies to shared boards.

The native client handles reconnection and merges concurrent record changes. The
board becomes read-only during a disconnect and warns before closing the tab.
It does not provide persistent offline editing: keep the tab open until it
reconnects. The server copy is available even after every participant has left.

## Configuration

1. `npx wrangler login --scopes account:read user:read workers_scripts:write`
2. Set the account ID and allowed website origins in
   `workers/safari-sync/wrangler.jsonc`.
3. `npm run deploy:safari-sync`
4. `npx wrangler secret put SAFARI_SYNC_SECRET --config workers/safari-sync/wrangler.jsonc`
5. Set **server-only** `SAFARI_SYNC_URL` (the HTTPS workers.dev URL) and the same
   `SAFARI_SYNC_SECRET` in Vercel, then redeploy the website.

For local work, set `SAFARI_SYNC_URL=http://localhost:8792` in `.env`. Put the same
secret in `.env` and `workers/safari-sync/.dev.vars`, both ignored by Git. Run
`npm run dev:safari-sync` alongside the website and Express API. Preview deployment
origins must be explicitly added to the allowlist before using the live Worker.

## Access and cost bounds

- Room creation needs a server secret. The global durable allowance is 60 new
  rooms per rolling day and 8 per visitor per hour. IPs are HMAC-hashed by Vercel;
  the Worker stores only that digest, and prunes quota entries after one day.
- Each room has a random 256-bit edit capability. Only its SHA-256 digest is
  stored server-side. The reusable key stays in the invite's URL fragment and is
  sent in authorization headers, not in HTTP paths, query strings or referrers.
- WebSocket upgrades use separate, one-use, 30-second tickets. Metadata reads,
  ticket requests and joins require authorization. Unknown rooms are not created
  automatically. Browser origins are allowlisted; no wildcard CORS or cookies.
- Up to 20 connected participants, 1,500 records and 1.5 MB per initial board.
  Each record is capped at 300 KB. Small inline PNG/JPEG/WebP/GIF uploads up to
  200 KB are supported; browser-only assets and larger media must be removed
  before sharing. This avoids another media-storage service for this release.
- No LLM or image generation is called by sharing, joining, editing or reopening.
- Document data is retained until the service owner removes the room. There is
  no automatic expiry and no one-day demo-server dependency.

## Verification

`npm run test:safari` includes local Miniflare tests of the real Worker and SDK
protocol: unauthorized access, native schema validation, two concurrent editors,
ticket replay rejection, safe creation retries, deletion, and reopening persisted
SQLite state after destroying/recreating the server. It makes no paid API calls.

Browser verification covers Invite, guest naming, two-way notes and kept finds,
independent reading/navigation, copying links, reload, disconnect/reconnect, and
mobile layouts. The connection-ticket callback returns a denied ticketless upgrade
on request failure so SDK 5.4.2 can continue its normal connection backoff; a
rejected URI promise would otherwise stall it.

References: [tldraw sync](https://tldraw.dev/docs/sync),
[Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
