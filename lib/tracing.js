'use strict';

// Builds a Langfuse callback handler to trace the agent's LLM calls (per-node
// tokens, latency, cost). Returns null when keys are not set, so tracing is an
// opt-in no-op. langfuse-langchain is ESM-only, so it is loaded via dynamic
// import (works from CommonJS on any Node version; a plain require crashes on
// Vercel's runtime).
async function getTracer() {
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return null;
    try {
        const { CallbackHandler } = await import('langfuse-langchain');
        return new CallbackHandler();
    } catch (err) {
        console.error('Langfuse tracer init failed:', err?.message);
        return null;
    }
}

module.exports = { getTracer };
