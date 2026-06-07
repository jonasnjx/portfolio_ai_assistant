'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { ChatGroq } = require('@langchain/groq');
const { HumanMessage } = require('@langchain/core/messages');

const JUDGE_MODEL = 'llama-3.1-8b-instant';

const JUDGE_PROMPT = (question, reference, answer) => `You are an impartial evaluator of an AI assistant that answers questions about Jonas Ng's professional background.

[QUESTION]: ${question}
[REFERENCE ANSWER]: ${reference}
[ASSISTANT ANSWER]: ${answer}

Score the assistant answer on three criteria, using integers 1 to 5.
Compare facts against the reference answer. Penalize any invented facts heavily on accuracy.
For out-of-scope questions, a polite refusal is the correct answer and should score 5 on all criteria.

Scoring rubric:
- accuracy: 5 = all facts correct, nothing invented. 3 = mostly right, minor gap. 1 = fabricated or wrong facts.
- relevance: 5 = fully answers the question. 3 = partial or some drift. 1 = off-topic.
- conciseness: 5 = tight and appropriately brief. 3 = somewhat wordy. 1 = rambling or padded.

Return ONLY valid JSON, no other text:
{
  "accuracy":    {"score": <1-5>, "reason": "<one sentence>"},
  "relevance":   {"score": <1-5>, "reason": "<one sentence>"},
  "conciseness": {"score": <1-5>, "reason": "<one sentence>"}
}`;

async function judgeAnswer(question, reference, answer) {
    const llm = new ChatGroq({ model: JUDGE_MODEL, temperature: 0, maxTokens: 400 });

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await llm.invoke([new HumanMessage(JUDGE_PROMPT(question, reference, answer))]);
            const text = response.content.trim();
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
