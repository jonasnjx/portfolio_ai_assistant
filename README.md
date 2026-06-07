# portfolio_ai_assistant

AI assistant backend for my portfolio. Powers the Baymax assistant in the 3D portfolio room and the chat widget on the classic site, plus an offline evaluation pipeline that measures answer quality over time.

## Architecture

```
  Portfolio site / 3D room
           |
   POST /ask  {question}
           |
  ┌────────▼────────┐
  │  /ask endpoint  │
  │  (Vercel fn)    │
  └────────┬────────┘
           │
  ┌────────▼────────────────┐
  │  Rate limit check        │
  │  Upstash Redis           │
  │  20 req / min / IP       │
  └───┬─────────────────┬───┘
      │ 429             │ OK
      ▼                 │
  Return error          │
  to client             │
                ┌───────▼────────────────────┐
                │  Cache lookup               │
                │  Upstash Redis              │
                │  key: assistant:v2:SHA256   │
                └──────┬──────────────┬──────┘
                  MISS │              │ HIT
                       │              ▼
                       │        Return cached answer { cache: "HIT" }
                       │
               ┌───────▼────────────────────────────────┐
               │  LangGraph agent (lib/agent.js)          │
               │                                          │
               │  retrieve → generate → check → revise    │
               │   (keyword)  (Groq)   (self   (rewrite   │
               │                       critique) once)    │
               └───────┬────────────────────────────────┘
                       │
               Store in Redis (TTL 24h) → return { cache: "MISS" }


  GET /health  →  { status: "ok" }
```

## Stack

- **LangGraph** (`@langchain/langgraph`): orchestrates the multi-step answer pipeline with a conditional self-critique loop
- **Groq API** (llama-3.3-70b-versatile): LLM inference, fast and free tier
- **Upstash Redis**: response caching (24h TTL) + per-IP rate limiting
- **Vercel serverless functions**: hosting, zero config

## The answer pipeline (`lib/agent.js`)

The live assistant runs a LangGraph agent, not a single LLM call:

1. **retrieve** — splits the knowledge base into sections and returns the top 3 by keyword overlap with the question. Pure JavaScript, no model call. (At this knowledge size, keyword matching is enough; swapping in embeddings + vector search is the natural upgrade to real RAG.)
2. **generate** — Groq produces an answer using only the retrieved context.
3. **check** — the model reviews its own answer for completeness and accuracy (self-critique).
4. **revise** — if the check finds problems, the model rewrites the answer once. Capped at one revision.

Self-critique is on by default. Set `ENABLE_CRITIQUE=false` to disable it (then the pipeline is just retrieve → generate).

**ESM note:** the langchain packages are ESM-only. `lib/agent.js` loads them via dynamic `import()` and builds the graph lazily, so it works from CommonJS on any Node version (a plain `require()` crashes on Vercel's Node runtime).

## Repository layout

```
api/
  ask.js          # Production endpoint: rate limit + cache + agent
  health.js       # Health check
lib/
  knowledge.js    # Single source of truth for the knowledge base (KNOWLEDGE constant)
  agent.js        # Shared LangGraph agent, used by both api/ask.js and the eval
eval/
  golden.json     # Golden dataset: questions + reference answers
  judge.js        # LLM-as-judge (llama-3.1-8b-instant), scores 1-5 on accuracy/relevance/conciseness
  run.js          # Runs the agent over the golden set, scores it, writes a timestamped result
  compare.js      # Diffs the two latest runs, flags regressions
  changelog.json  # One-line note per run (what changed)
  index.json      # Manifest of all runs (the model card reads this)
  results/        # One JSON per eval run (committed; the model card reads these)
knowledge.md      # Human-readable knowledge reference (keep in sync with lib/knowledge.js)
```

Both `api/ask.js` and `eval/run.js` import the same `lib/agent.js`, so the eval measures exactly what production serves.

## Endpoints

- `POST /ask` — `{ "question": "..." }` returns `{ "answer": "...", "cache": "HIT"|"MISS" }`
- `GET /health` — returns `{ "status": "ok" }`

## Evaluation pipeline

Measures Baymax answer quality on a golden dataset, so changes (new knowledge, prompt tweaks, model swaps, critique on/off) can be regression-tested.

```bash
npm run eval                       # run the eval, write eval/results/<runId>.json + update index.json
ENABLE_CRITIQUE=false npm run eval # run with self-critique disabled, for comparison
npm run compare                    # diff the two latest runs, flag regressions
```

After a meaningful change: run the eval, add a one-line note to `eval/changelog.json` for the new run id, and commit `eval/`. The public model card at `jonasng.dev/baymax` reads these JSON files directly from GitHub and updates on push.

Optional: set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (free Langfuse cloud) to get per-node traces, token cost, and latency for each eval run. Without them the eval runs fine, just without tracing.

## Setup

```bash
npm install            # uses .npmrc (legacy-peer-deps) for the langchain dep tree
cp .env.example .env   # fill in your keys
vercel dev
```

On this machine, npm needs `NODE_OPTIONS=--use-system-ca` due to a local SSL setup.

## Environment variables

```
GROQ_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# optional, for eval tracing only:
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

- Groq: https://console.groq.com
- Upstash: https://console.upstash.com
- Langfuse: https://cloud.langfuse.com

## Knowledge base

Edit `lib/knowledge.js` (the `KNOWLEDGE` constant) to update what the assistant knows. `knowledge.md` is the human-readable mirror; keep both in sync with the portfolio site. After updating, re-run the eval to confirm answer quality did not regress.

## Deployment

Pushing to `master` auto-deploys on Vercel. Set the environment variables in the Vercel project settings. The `/ask` function uses `maxDuration: 30` (vercel.json) because the self-critique loop can make up to three Groq calls on a cache miss.
