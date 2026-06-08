'use strict';

const { createHash } = require('crypto');
const { Index } = require('@upstash/vector');

// Semantic cache: matches questions by meaning, not exact text, so paraphrases
// ("what's Jonas's latest job" / "where does Jonas work now") share one cached
// answer. Lives in the "cache" namespace of the shared dense vector index, so
// it does not collide with the "knowledge" namespace used for RAG.
//
// MIN_SIMILARITY is intentionally conservative: high enough that a
// similar-but-different question ("first job" vs "latest job") does NOT reuse a
// wrong answer. Lower it (toward ~0.88) to catch more paraphrases once you have
// calibrated it with real question pairs.
const CACHE_NAMESPACE = 'cache';
const MIN_SIMILARITY = 0.92;
// Soft TTL: Upstash Vector has no native expiry, so we stamp each entry and
// treat anything older than this as a miss. Keeps answers from going stale
// even if the index is not rebuilt after a knowledge change.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let _ns = null;
function getCacheNamespace() {
    if (_ns) return _ns;
    const url = process.env.UPSTASH_VECTOR_REST_URL;
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
    if (!url || !token) return null;
    _ns = new Index({ url, token }).namespace(CACHE_NAMESPACE);
    return _ns;
}

// Returns a cached answer if a semantically close question exists, else null.
async function getCached(question) {
    const ns = getCacheNamespace();
    if (!ns) return null;
    try {
        const res = await ns.query({ data: question, topK: 1, includeMetadata: true });
        const top = res && res[0];
        if (top && top.score >= MIN_SIMILARITY && top.metadata && top.metadata.answer) {
            // Soft TTL: ignore entries older than CACHE_TTL_MS.
            const ts = top.metadata.ts || 0;
            if (Date.now() - ts > CACHE_TTL_MS) return null;
            return top.metadata.answer;
        }
        return null;
    } catch (err) {
        console.error('Semantic cache lookup failed:', err?.message);
        return null;
    }
}

// Stores a question/answer pair so future similar questions can reuse it.
async function setCached(question, answer) {
    const ns = getCacheNamespace();
    if (!ns) return;
    try {
        const id = createHash('sha256').update(question.toLowerCase().trim()).digest('hex').slice(0, 24);
        await ns.upsert({ id, data: question, metadata: { answer, question, ts: Date.now() } });
    } catch (err) {
        console.error('Semantic cache write failed:', err?.message);
    }
}

module.exports = { getCached, setCached, MIN_SIMILARITY, CACHE_NAMESPACE };
