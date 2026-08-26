# Change Cards

A tactile design-thinking card game: enter an idea, then mutate it through a deck of 16 provocations in **Evolve** or **Swarm** mode.

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

## Verification

With the production server already running, `npm run verify` checks the entry flow, all 16 cards, a live Evolve generation, a live Swarm generation, favouriting, responsive card access, the ending ancestry, and browser errors. It uses the local Google Chrome installation and makes two API requests.
