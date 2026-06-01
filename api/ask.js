import Groq from 'groq-sdk';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE = readFileSync(join(__dirname, '../knowledge.md'), 'utf-8');

const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
const redis  = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 requests per minute per IP
});

const SYSTEM_PROMPT = `You are the assistant for Jonas Ng's portfolio. Your only job is to answer questions about Jonas's professional background, skills, experience, projects, and career.

Use the following knowledge base to answer questions accurately:

${KNOWLEDGE}

Guidelines:
- Be warm, direct, and conversational. Keep answers concise (2 to 4 sentences unless more detail is genuinely needed).
- Only answer questions about Jonas. If asked anything unrelated (general knowledge, coding help, opinions, personal questions unrelated to his work), respond only with: "I can only answer questions about Jonas's background and experience. Is there something specific about his work you'd like to know?"
- Do not make up information. If something is not in the knowledge base, say you don't have that detail and suggest reaching out directly via LinkedIn or email.
- Do not use long dashes. Use commas or colons instead.`;

function corsHeaders(origin) {
    const allowed = ['https://jonasnjx.github.io', 'http://localhost:3000'];
    const o = allowed.includes(origin) ? origin : allowed[0];
    return {
        'Access-Control-Allow-Origin': o,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function hashQuestion(q) {
    return createHash('sha256')
        .update(q.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim())
        .digest('hex')
        .slice(0, 32);
}

export default async function handler(req, res) {
    const headers = corsHeaders(req.headers.origin || '');

    // Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).set(headers).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).set(headers).json({ error: 'Method not allowed' });
    }

    // Rate limit by IP
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1';
    const { success } = await ratelimit.limit(ip);
    if (!success) {
        return res.status(429).set(headers).json({ error: 'Too many requests. Please slow down.' });
    }

    const { question } = req.body || {};

    if (!question || typeof question !== 'string') {
        return res.status(400).set(headers).json({ error: 'Question is required.' });
    }
    if (question.trim().length === 0) {
        return res.status(400).set(headers).json({ error: 'Question cannot be empty.' });
    }
    if (question.length > 300) {
        return res.status(400).set(headers).json({ error: 'Question is too long. Please keep it under 300 characters.' });
    }

    const cacheKey = `assistant:${hashQuestion(question)}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
        return res.status(200).set(headers).json({ answer: cached, cache: 'HIT' });
    }

    // Call Groq
    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: question.trim() },
            ],
            max_tokens: 300,
            temperature: 0.5,
        });

        const answer = completion.choices[0]?.message?.content?.trim() || 'Sorry, I could not generate a response.';

        // Cache for 24 hours
        await redis.set(cacheKey, answer, { ex: 86400 });

        return res.status(200).set(headers).json({ answer, cache: 'MISS' });
    } catch (err) {
        console.error('Groq error:', err);
        return res.status(500).set(headers).json({ error: 'The assistant is temporarily unavailable. Please try again shortly.' });
    }
}
