const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');
const { createHash } = require('crypto');
const { runAgent } = require('../lib/agent');

const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
});

// Cache version. Bumped to v2 when the answer pipeline moved to the
// LangGraph agent (retrieve -> generate -> check -> revise), so old
// single-call answers do not collide with new pipeline answers.
const CACHE_VERSION = 'v2';

function hashQuestion(q) {
    return createHash('sha256')
        .update(q.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim())
        .digest('hex')
        .slice(0, 32);
}

// Short-circuit greetings and pleasantries so they never reach the LLM.
// Only fires when the whole message is a greeting, so "hi, what does Jonas do"
// still goes to the agent.
const GREETINGS = new Set([
    'hi', 'hii', 'hiya', 'hello', 'helo', 'hey', 'heyy', 'yo', 'sup', 'howdy',
    'good morning', 'good afternoon', 'good evening', 'morning', 'gm',
    'hi there', 'hello there', 'hey there', 'greetings',
]);
const THANKS = new Set([
    'thank you', 'thanks', 'thank u', 'thx', 'ty', 'tysm', 'thankyou',
    'appreciate it', 'much appreciated', 'cheers', 'thanks a lot',
]);
const BYES = new Set([
    'bye', 'goodbye', 'good bye', 'see you', 'see ya', 'cya', 'take care',
]);

function cannedReply(question) {
    const q = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (GREETINGS.has(q)) return "Hi! Ask me anything about Jonas's background, experience, or projects.";
    if (THANKS.has(q))    return "You're welcome! Anything else you'd like to know about Jonas?";
    if (BYES.has(q))      return "Thanks for stopping by!";
    return null;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1';
    try {
        const { success } = await ratelimit.limit(ip);
        if (!success) return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    } catch (e) { /* continue if rate limiter fails */ }

    const { question } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'Question is required.' });
    }
    if (question.length > 300) {
        return res.status(400).json({ error: 'Question too long. Keep it under 300 characters.' });
    }

    // Greetings and pleasantries get an instant canned reply, no LLM call.
    const canned = cannedReply(question);
    if (canned) return res.status(200).json({ answer: canned, cache: 'SKIP' });

    const cacheKey = `assistant:${CACHE_VERSION}:${hashQuestion(question)}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) return res.status(200).json({ answer: cached, cache: 'HIT' });
    } catch (e) { /* continue without cache */ }

    try {
        const answer = (await runAgent(question.trim()))
            || 'Sorry, I could not generate a response.';

        try { await redis.set(cacheKey, answer, { ex: 86400 }); } catch (e) {}

        return res.status(200).json({ answer, cache: 'MISS' });
    } catch (err) {
        console.error('Agent error:', err?.message || err);
        return res.status(500).json({ error: 'The assistant is temporarily unavailable. Please try again shortly.' });
    }
};
