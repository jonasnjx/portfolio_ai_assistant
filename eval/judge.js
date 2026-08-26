'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { ChatGroq } = require('@langchain/groq');
const { HumanMessage } = require('@langchain/core/messages');
const { KNOWLEDGE } = require('../lib/knowledge');

const JUDGE_MODEL = 'openai/gpt-oss-20b';

const JUDGE_PROMPT = (question, reference, answer) => `You are an impartial evaluator of an AI assistant that answers questions about Jonas Ng's professional background.

[KNOWLEDGE BASE - the full ground truth about Jonas]:
${KNOWLEDGE}

[QUESTION]: ${question}
[REFERENCE ANSWER - one concise example of a correct answer, NOT the only acceptable one]: ${reference}
[ASSISTANT ANSWER]: ${answer}

Score the assistant answer on three criteria, using integers 1 to 5.
Judge accuracy against the KNOWLEDGE BASE, not just the reference answer. The reference is only one concise correct answer; the assistant may correctly include additional detail. Do NOT penalize extra detail that is supported by the knowledge base. Only penalize facts that contradict the knowledge base or are not supported by it (genuine fabrications).
For out-of-scope questions (not about Jonas), a polite refusal is the correct answer and should score 5 on all criteria.

Scoring rubric:
- accuracy: 5 = every fact is supported by the knowledge base, nothing fabricated. 3 = mostly supported, minor unsupported detail. 1 = contains facts that contradict the knowledge base or are fabricated.
- relevance: 5 = fully answers the question. 3 = partial or some drift. 1 = off-topic.
- conciseness: 5 = tight and appropriately brief. 3 = somewhat wordy. 1 = rambling or padded.

Return ONLY valid JSON, no other text:
{
  "accuracy":    {"score": <1-5>, "reason": "<one sentence>"},
  "relevance":   {"score": <1-5>, "reason": "<one sentence>"},
  "conciseness": {"score": <1-5>, "reason": "<one sentence>"}
}`;

async function judgeAnswer(question, reference, answer) {
    // gpt-oss-20b is a reasoning model: keep reasoning effort low so it does not
    // burn the token budget before emitting the JSON, and leave generous headroom.
    const llm = new ChatGroq({ model: JUDGE_MODEL, temperature: 0, maxTokens: 1024, reasoningEffort: 'low' });

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await llm.invoke([new HumanMessage(JUDGE_PROMPT(question, reference, answer))]);
            // Strip any markdown code fences the model wraps the JSON in, then take
            // the last balanced {...} block (reasoning text may precede it).
            const text = response.content.trim().replace(/```(?:json)?/gi, '');
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON found in judge response');
            const scores = JSON.parse(jsonMatch[0]);
            const overall = parseFloat(
                ((scores.accuracy.score + scores.relevance.score + scores.conciseness.score) / 3).toFixed(2)
            );
            return { ...scores, overall };
        } catch (err) {
            if (attempt === 1) throw new Error(`Judge failed after 2 attempts: ${err.message}`);
        }
    }
}

module.exports = { judgeAnswer, JUDGE_MODEL };
