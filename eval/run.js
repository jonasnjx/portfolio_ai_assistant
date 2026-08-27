'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { runAgent, ENABLE_CRITIQUE } = require('../lib/agent');
const { judgeAnswer, JUDGE_MODEL } = require('./judge');

const golden = require('./golden.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The free tier caps gpt-oss-120b at 8,000 tokens/min. On a 429, Groq tells us
// how long to wait ("try again in Xs"); honor it and retry the call.
async function withRateLimitRetry(fn, label, maxAttempts = 6) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const msg = err?.message || String(err);
            const rateLimited = err?.status === 429 || /rate_limit|429/.test(msg);
            if (!rateLimited || attempt === maxAttempts) throw err;
            const m = msg.match(/try again in ([\d.]+)s/);
            const waitMs = (m ? Math.ceil(parseFloat(m[1]) * 1000) : attempt * 4000) + 750;
            console.log(`  rate limited on ${label}, waiting ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
            await sleep(waitMs);
        }
    }
}

async function main() {
    const runId   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const config  = ENABLE_CRITIQUE ? 'with-critique' : 'no-critique';
    const results = [];

    console.log(`\nEval run: ${runId} (${config})\n`);

    let langfuseHandler = null;
    try {
        const { CallbackHandler } = require('langfuse-langchain');
        langfuseHandler = new CallbackHandler();
        console.log('Langfuse tracing enabled\n');
    } catch {
        console.log('Langfuse not configured, running without tracing\n');
    }

    for (const item of golden) {
        const start    = Date.now();
        const cbConfig = langfuseHandler
            ? { callbacks: [langfuseHandler], metadata: { runId, questionId: item.id, category: item.category } }
            : {};

        console.log(`[${item.id}] ${item.question}`);

        // Free tier caps gpt-oss-120b at 8,000 tokens/min, and one question's
        // retrieve->generate->check->revise loop burns ~6-7k. Start each question
        // with a fresh minute window so it completes without thrashing on retries.
        await sleep(48000);

        let answer, scores;
        try {
            answer = await withRateLimitRetry(() => runAgent(item.question, cbConfig), 'agent');
            scores = await withRateLimitRetry(() => judgeAnswer(item.question, item.reference, answer, item.category), 'judge');
        } catch (err) {
            console.error(`  ERROR: ${err.message}`);
            results.push({ id: item.id, category: item.category, question: item.question, error: err.message });
            continue;
        }

        const latencyMs = Date.now() - start;
        console.log(`  Answer: ${answer.slice(0, 120)}...`);
        console.log(`  Scores: accuracy=${scores.accuracy.score} relevance=${scores.relevance.score} conciseness=${scores.conciseness.score} overall=${scores.overall}`);
        console.log(`  Latency: ${latencyMs}ms\n`);

        results.push({
            id:         item.id,
            category:   item.category,
            question:   item.question,
            answer,
            reference:  item.reference,
            scores,
            latencyMs,
        });
    }

    // Aggregate
    const valid   = results.filter(r => r.scores);
    const avg     = k => parseFloat((valid.reduce((s, r) => s + r.scores[k].score, 0) / valid.length).toFixed(2));
    const aggregate = {
        accuracy:    avg('accuracy'),
        relevance:   avg('relevance'),
        conciseness: avg('conciseness'),
        overall:     parseFloat((valid.reduce((s, r) => s + r.scores.overall, 0) / valid.length).toFixed(2)),
        totalQuestions: golden.length,
        scoredQuestions: valid.length,
    };

    console.log('=== Aggregate ===');
    console.log(`Accuracy:    ${aggregate.accuracy}`);
    console.log(`Relevance:   ${aggregate.relevance}`);
    console.log(`Conciseness: ${aggregate.conciseness}`);
    console.log(`Overall:     ${aggregate.overall} / 5`);

    // Save results
    const output = {
        runId,
        config,
        genModel:   'openai/gpt-oss-120b',
        judgeModel: JUDGE_MODEL,
        critique:   ENABLE_CRITIQUE,
        aggregate,
        perQuestion: results,
    };

    const outPath = path.join(__dirname, 'results', `${runId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to eval/results/${runId}.json`);

    // Update index.json
    const indexPath = path.join(__dirname, 'index.json');
    const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { runs: [] };
    index.runs.unshift({ runId, overall: aggregate.overall, genModel: output.genModel, judgeModel: output.judgeModel, critique: output.critique });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log('index.json updated');

    if (langfuseHandler) {
        await langfuseHandler.flushAsync();
        console.log('Langfuse traces flushed');
    }
}

main().catch(err => { console.error(err); process.exit(1); });
