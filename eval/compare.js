'use strict';

const fs   = require('fs');
const path = require('path');

const resultsDir = path.join(__dirname, 'results');
const files = fs.readdirSync(resultsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(-2);

if (files.length < 2) {
    console.log('Need at least 2 result files to compare. Run eval at least twice.');
    process.exit(0);
}

const [prev, curr] = files.map(f => JSON.parse(fs.readFileSync(path.join(resultsDir, f))));

console.log(`\nComparing:`);
console.log(`  Previous: ${prev.runId} (${prev.config})`);
console.log(`  Current:  ${curr.runId} (${curr.config})\n`);

const criteria = ['accuracy', 'relevance', 'conciseness', 'overall'];
const delta = v => v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
const arrow = v => v > 0.1 ? ' ↑' : v < -0.1 ? ' ↓' : '  ';

console.log('=== Aggregate Delta ===');
criteria.forEach(k => {
    const d = curr.aggregate[k] - prev.aggregate[k];
    console.log(`  ${k.padEnd(12)} ${prev.aggregate[k].toFixed(2)} -> ${curr.aggregate[k].toFixed(2)}  ${delta(d)}${arrow(d)}`);
});

// Flag per-question regressions
const prevMap = Object.fromEntries(prev.perQuestion.filter(r => r.scores).map(r => [r.id, r]));
const regressions = curr.perQuestion.filter(r => {
    if (!r.scores) return false;
    const p = prevMap[r.id];
    return p && p.scores && (r.scores.overall - p.scores.overall) <= -1;
});

if (regressions.length > 0) {
    console.log('\n=== Regressions (overall dropped by 1+) ===');
    regressions.forEach(r => {
        const p = prevMap[r.id];
        console.log(`  [${r.id}] ${r.question}`);
        console.log(`    overall: ${p.scores.overall} -> ${r.scores.overall}`);
        console.log(`    answer:  ${r.answer.slice(0, 100)}...`);
    });
} else {
    console.log('\nNo regressions detected.');
}
