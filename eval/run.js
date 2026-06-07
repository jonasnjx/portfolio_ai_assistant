'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { runAgent } = require('./agent');
const { judgeAnswer, JUDGE_MODEL } = require('./judge');

const golden = require('./golden.json');

async function main() {
    const runId   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const config  = process.env.ENABLE_CRITIQUE === 'true' ? 'with-critique' : 'no-critique';
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

        let answer, scores;
        try {
            answer = await runAgent(item.question, cbConfig);
            scores = await judgeAnswer(item.question, item.reference, answer);
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
        genModel:   'llama-3.3-70b-versatile',
        judgeModel: JUDGE_MODEL,
        critique:   process.env.ENABLE_CRITIQUE === 'true',
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
