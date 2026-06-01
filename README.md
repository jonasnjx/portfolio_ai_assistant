# portfolio_ai_assistant

AI assistant backend for my portfolio. Powers the Baymax assistant in the 3D portfolio room and the chat widget on the classic site.

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
                ┌───────▼──────────────┐
                │  Cache lookup         │
                │  Upstash Redis        │
                │  key: SHA256(question)│
                └──────┬──────────┬────┘
                  MISS │          │ HIT
                       │          ▼
                       │    Return cached answer
                       │    { cache: "HIT" }
                       │
               ┌───────▼──────────┐
               │  Groq API         │
               │  Llama 3.3 70B    │
               │  + knowledge.md   │
               └───────┬──────────┘
                       │
               ┌───────▼──────────┐
               │  Store in Redis   │
               │  TTL: 24h         │
               └───────┬──────────┘
                       │
               Return answer to client
               { cache: "MISS" }


  GET /health  →  { status: "ok" }
```

## Stack

- **Groq API** (llama-3.3-70b-versatile): LLM inference, fast and free tier
- **Upstash Redis**: response caching (24h TTL) + per-IP rate limiting
- **Vercel serverless functions**: hosting, zero config
- **knowledge.md**: curated context about Jonas, stuffed into every prompt

## Endpoints

- `POST /ask` — `{ "question": "..." }` returns `{ "answer": "...", "cache": "HIT"|"MISS" }`
- `GET /health` — returns `{ "status": "ok" }`

## Setup

```bash
npm install
cp .env.example .env
# Fill in your keys in .env
vercel dev
```

## Environment variables

```
GROQ_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- Groq: https://console.groq.com
- Upstash: https://console.upstash.com

## Knowledge base

Edit `knowledge.md` to update what the assistant knows. Keep it in sync with the portfolio site.

## Deployment

```bash
vercel --prod
```

Set the three environment variables in Vercel project settings before deploying.
