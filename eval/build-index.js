'use strict';

// Builds the Upstash Vector index from the knowledge base.
// Run after editing lib/knowledge.js:  npm run build-index
// Upstash embeds each chunk server-side using the index's built-in model,
// so we only send raw text.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createHash } = require('crypto');
const { Index } = require('@upstash/vector');
const { KNOWLEDGE } = require('../lib/knowledge');

function chunkKnowledge(knowledge) {
    // Sections are separated by blank lines.
    const raw = knowledge.split('\n\n').map(s => s.trim()).filter(s => s.length > 30);

    const chunks = [];
    for (const section of raw) {
        // Split the big WORK EXPERIENCE block into one chunk per employer.
        if (section.startsWith('WORK EXPERIENCE')) {
            // Each employer block starts with a company line; split on single newlines
            // that begin a new employer (lines containing " - " role markers).
            const lines = section.split('\n');
            let current = [];
            const blocks = [];
            for (const line of lines) {
                // A new employer header looks like "Company, Location (dates) - Role"
                if (/ - (Senior|AI|Data|Cloud|Software|Machine)/.test(line) && current.length) {
                    blocks.push(current.join('\n').trim());
                    current = [line];
                } else {
                    current.push(line);
                }
            }
            if (current.length) blocks.push(current.join('\n').trim());
            blocks.filter(b => b.length > 20).forEach(b => chunks.push(b));
        } else {
            chunks.push(section);
        }
    }
    return chunks;
}

function chunkId(text) {
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function main() {
    const url = process.env.UPSTASH_VECTOR_REST_URL;
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
    if (!url || !token) {
        console.error('Missing UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN in .env');
        process.exit(1);
    }

    const index = new Index({ url, token });
    // RAG chunks live in the "knowledge" namespace, isolated from the
    // semantic cache which uses the "cache" namespace of the same index.
    const knowledgeNs = index.namespace('knowledge');
    const chunks = chunkKnowledge(KNOWLEDGE);
    const knowledgeHash = createHash('sha256').update(KNOWLEDGE).digest('hex').slice(0, 16);

    console.log(`Chunked knowledge into ${chunks.length} chunks.\n`);

    // Reset the knowledge namespace so removed/edited chunks do not linger.
    await knowledgeNs.reset();

    const vectors = chunks.map(text => ({
        id: chunkId(text),
        data: text,                 // Upstash embeds this server-side
        metadata: { text },         // returned at query time
    }));

    // Store a marker recording which knowledge version this index reflects.
    vectors.push({
        id: '__knowledge_hash__',
        data: 'knowledge version marker',
        metadata: { hash: knowledgeHash },
    });

    await knowledgeNs.upsert(vectors);

    // Knowledge changed, so previously cached answers may be stale. Clear them.
    try {
        await index.namespace('cache').reset();
        console.log('Cleared stale semantic cache.');
    } catch (e) { /* cache namespace may not exist yet */ }

    console.log(`Upserted ${vectors.length} vectors to "knowledge" namespace (including version marker).`);
    console.log(`Knowledge hash: ${knowledgeHash}`);
    chunks.forEach((c, i) => console.log(`  [${i + 1}] ${c.slice(0, 60).replace(/\n/g, ' ')}...`));
}

main().catch(err => { console.error(err); process.exit(1); });
