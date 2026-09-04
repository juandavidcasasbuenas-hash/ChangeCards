# Change Cards

A tactile design-thinking card game. Play solo against a deck of 40 provocations, or create a four-round co-op room where ideas circulate and return with four hidden changes.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

For the production build:

```bash
npm run build
npm start
```

Open [http://localhost:8787](http://localhost:8787).

## OpenAI key

The browser never receives the API key. The Express server reads it from either:

- `OPENAI_API_KEY` in the server environment;
- the file at `OPENAI_API_KEY_FILE`; or
- a local `OpenAI.txt` / `OpenAi.txt` beside `server.mjs`.

Both `.env` and the supported key filenames are git-ignored. A labelled multi-key text file is supported; the server extracts only the `OpenAI:` entry.

## Supabase for co-op mode

Solo mode works without Supabase. To enable shared co-op rooms:

1. Open the Supabase SQL Editor and run [`supabase/schema.sql`](./supabase/schema.sql). This creates the room tables, row-level security policies, round functions, and Realtime publication entries.
2. In **Authentication → Providers → Anonymous**, enable anonymous sign-ins. Players use temporary identities so they can join with only a display name.
3. Copy the project URL and publishable key from the project’s Connect dialog into `.env`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

4. Restart `npm run dev`. The publishable key is intended for browser use; never put a service-role secret in a `VITE_` variable.

Co-op rooms accept new players only in the lobby and have no application-level player cap. Guests can follow the shared link or switch to Co-op on the landing page and enter the six-character room code. The host starts each pass, every pass lasts 60 seconds, responses remain hidden, and the fourth pass automatically returns each idea to its owner. Change Cards may repeat across unrelated ideas, but every player and every idea receives four distinct cards.

## Verification

With the production server already running, `npm run verify` checks the solo entry flow, all 40 cards, Spark generation, saving and reviewing ideas, responsive card access, and browser errors. It uses the local Google Chrome installation with mocked Spark requests. Co-op requires a configured Supabase project for end-to-end verification.

## Workshop UX verification

Solo card drafts are kept in the current browser and restored after closing a card or reloading. The logo returns to a resumable home screen; **New idea** asks before clearing the table and offers a text download of saved ideas and unfinished drafts. **Deal all 40** groups cards by thinking style and arranges them around the starting note on the canvas. Guided routes remain visible after completion until the player finishes the route.

With the production build served on port 8787, `npm run verify:ux` exercises draft recovery, home/reset/export, responsive layouts, saved-idea copying, route completion, and AI loading/failure/retry and restored rotating sparks. It mocks AI requests and saves screenshots under `output/ux-improvements/`. Set `VERIFY_ORIGIN` to check another local server.

`npm run verify:coop:live` is an **explicit live integration check**. It creates an isolated two-player Supabase room, completes four passes and verifies both reveals. AI requests are mocked and no invitations are sent. Like other co-op rooms, its records remain in Supabase until deleted by the operator. It is intentionally separate from the default verification command.
