# portfolio_ai_assistant

AI assistant backend for my portfolio. Powers the Baymax chatbot in the 3D portfolio room and the chat widget on the classic site, plus an offline evaluation pipeline that measures answer quality over time.

## Architecture

```
  Portfolio site / 3D room
           |
   POST /ask  {question}
           |
  ┌────────▼────────┐
  │  /ask endpoint  │   (Vercel serverless)
  └────────┬────────┘
           |
   Rate limit (Upstash Redis, 20 req/min/IP)
           |
   Greeting short-circuit  ──►  canned reply (no LLM)   { cache: "SKIP" }
           |
   1. Exact cache    (Upstash Redis, hash, 24h)  ──►  hit   { cache: "HIT" }
           |
   2. Semantic cache (Upstash Vector, meaning, 7d) ──► hit  { cache: "SEMANTIC" }
           |
  ┌────────▼────────────────────────────────┐
  │  LangGraph agent (lib/agent.js)          │
  │  retrieve → generate → check → revise    │
  │  (context)  (Groq)    (self-critique)    │
  └────────┬────────────────────────────────┘
           |
   Store answer in BOTH caches → return  { cache: "MISS" }


  GET /health  →  { status: "ok" }
```

## Stack

- **LangGraph** (`@langchain/langgraph`): orchestrates the multi-step answer pipeline with a conditional self-critique loop
- **Groq API**: LLM inference (free tier). `openai/gpt-oss-120b` generates/critiques; `openai/gpt-oss-20b` is the eval judge. (Switched from `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`, which Groq decommissioned on 2026-08-16.)
- **Upstash Redis**: exact-match response cache (24h TTL) + per-IP rate limiting
- **Upstash Vector**: semantic cache and (future) RAG retrieval. Dense index, embedding model `bge-large-en-v1.5`, two namespaces (`cache`, `knowledge`)
- **Vercel serverless functions**: hosting

## The answer pipeline (`lib/agent.js`)

The live assistant runs a LangGraph agent, not a single LLM call:

1. **retrieve** — gathers the knowledge for the question. The knowledge base is ~1,200 tokens, which fits entirely in the model's context, so the **full KB is passed while it is small**. Semantic retrieval (dense Upstash Vector, `knowledge` namespace) only activates once the KB grows past `RETRIEVAL_CHUNK_THRESHOLD` (25 chunks), with a keyword fallback. The eval confirmed full context (4.19) beats keyword (3.75) and vector top-k (3.45) at this size, because broad chunks dominated retrieval and dropped key facts.
2. **generate** — Groq produces an answer from the retrieved context.
3. **check** — the model reviews its own answer for completeness and accuracy (self-critique).
4. **revise** — if the check finds problems, the model rewrites the answer once. Capped at one revision.

Self-critique is on by default. Set `ENABLE_CRITIQUE=false` to disable it (then the pipeline is just retrieve → generate). Groq calls use `maxRetries: 1` so the function fails fast instead of hanging when rate-limited.

**ESM note:** the langchain packages are ESM-only. `lib/agent.js` loads them via dynamic `import()` and builds the graph lazily, so it works from CommonJS on any Node version (a plain `require()` crashes on Vercel's Node runtime).

## Caching (two layers)

A question checks two caches before reaching the LLM, so repeated or reworded questions return instantly without spending tokens. Only real generations are cached (never the fallback string), so a transient empty response is never frozen in.

1. **Exact cache** (`lib/`, in `api/ask.js`) — Upstash Redis. Key is a SHA256 of the normalized question. Catches identical repeats. 24h TTL.
2. **Semantic cache** (`lib/semantic-cache.js`) — Upstash Vector, `cache` namespace, embedding model `bge-large-en-v1.5`. Embeds the question and reuses a stored answer when an earlier question is similar above `MIN_SIMILARITY = 0.92`. Catches paraphrases ("what's my latest job" reuses the answer to "where does Jonas work now"). 7-day soft TTL: each entry is timestamped and entries older than 7 days are treated as a miss (Upstash Vector has no native expiry). Cleared on knowledge rebuild.

## Guardrails

- **Rate limiting**: 20 requests/min per IP (Upstash Redis)
- **Greeting short-circuit**: hi / thank you / bye return a canned reply, no LLM call
- **Scope limit**: only answers questions about Jonas; off-topic gets a polite refusal (system prompt)
- **Input limit**: questions over 300 characters are rejected
- **Fail-fast**: friendly message instead of hanging when the model is rate-limited

## Repository layout

```
api/
  ask.js            # Production endpoint: rate limit + greeting + caches + agent
  health.js         # Health check
lib/
  knowledge.js      # Single source of truth for the knowledge base (KNOWLEDGE constant)
  agent.js          # Shared LangGraph agent, used by both api/ask.js and the eval
  semantic-cache.js # Semantic (meaning-based) cache over Upstash Vector
eval/
  golden.json       # Golden dataset: questions + reference answers (12)
  judge.js          # LLM-as-judge (openai/gpt-oss-20b), scores 1-5 on accuracy/relevance/conciseness
  run.js            # Runs the agent over the golden set, scores it, writes a timestamped result
  compare.js        # Diffs the two latest runs, flags regressions
  build-index.js    # Builds the Upstash Vector "knowledge" namespace; clears the "cache" namespace
  changelog.json    # One-line note per run (what changed)
  index.json        # Manifest of all runs (the model card reads this)
  results/          # One JSON per eval run (committed; the model card reads these)
knowledge.md        # Human-readable knowledge reference (keep in sync with lib/knowledge.js)
```

Both `api/ask.js` and `eval/run.js` import the same `lib/agent.js`, so the eval measures exactly what production serves.

## Endpoints

- `POST /ask` — `{ "question": "..." }` returns `{ "answer": "...", "cache": "SKIP"|"HIT"|"SEMANTIC"|"MISS" }`
- `GET /health` — returns `{ "status": "ok" }`

## Evaluation pipeline

Measures Baymax answer quality on a golden dataset, so changes (new knowledge, prompt tweaks, model swaps, critique on/off, retrieval changes) can be regression-tested.

```bash
npm run build-index                # (re)build the Vector knowledge namespace after editing knowledge.js
npm run eval                       # run the eval, write eval/results/<runId>.json + update index.json
ENABLE_CRITIQUE=false npm run eval # run with self-critique disabled, for comparison
npm run compare                    # diff the two latest runs, flag regressions
```

After a meaningful change: run the eval, add a one-line note to `eval/changelog.json` for the new run id, and commit `eval/`. The public model card at `jonasng.dev/baymax` reads these JSON files directly from GitHub and updates on push.

One full eval run costs roughly 50k to 70k Groq tokens (it is the heaviest token consumer, far more than production). The free tier is 100k tokens/day per account, so run it deliberately around a change, not in a loop.

Optional: set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (free Langfuse cloud) to get per-node traces, token cost, and latency for each eval run. Without them the eval runs fine, just without tracing.

## Setup

```bash
npm install            # uses .npmrc (legacy-peer-deps) for the langchain dep tree
cp .env.example .env   # fill in your keys
vercel dev
```

On this machine, npm and node need `NODE_OPTIONS=--use-system-ca` due to a local SSL setup.

## Environment variables

```
GROQ_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
UPSTASH_VECTOR_REST_URL=
UPSTASH_VECTOR_REST_TOKEN=
# optional, for eval tracing only:
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

- Groq: https://console.groq.com
- Upstash (Redis + Vector): https://console.upstash.com
- Langfuse: https://cloud.langfuse.com

The Upstash Vector index is a single **dense** index (model `bge-large-en-v1.5`) with two namespaces: `cache` (semantic cache) and `knowledge` (RAG, used only when the KB grows). Set the same vector credentials in Vercel so semantic caching works in production.

## Knowledge base

Edit `lib/knowledge.js` (the `KNOWLEDGE` constant) to update what the assistant knows. `knowledge.md` is the human-readable mirror; keep both in sync with the portfolio site. After updating, run `npm run build-index` (rebuilds the knowledge namespace and clears the now-stale semantic cache), then re-run the eval to confirm quality did not regress.

## Deployment

Pushing to `master` auto-deploys on Vercel. Set the environment variables in the Vercel project settings. The `/ask` function uses `maxDuration: 30` (vercel.json) because the self-critique loop can make up to three Groq calls on a cache miss.
