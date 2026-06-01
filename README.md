# portfolio_ai_assistant

AI assistant backend for my portfolio. Powers the robot receptionist NPC in the 3D portfolio room.

## What it does

Answers recruiter questions about my background, experience, and projects using Groq (Llama 3.3 70B) with a curated knowledge base. Responses are cached in Upstash Redis for instant repeat answers.

## Stack

- Groq API (llama-3.3-70b-versatile) for LLM inference
- Upstash Redis for response caching and rate limiting
- Vercel serverless functions for hosting

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

Get keys from:
- Groq: https://console.groq.com
- Upstash: https://console.upstash.com (create a Redis database)

## Knowledge base

Edit `knowledge.md` to update what the assistant knows. Keep it factual and in sync with the portfolio site.

## Deployment

```bash
vercel --prod
```

Set the three environment variables in the Vercel project settings before deploying.
