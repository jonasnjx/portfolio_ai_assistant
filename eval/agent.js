'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { StateGraph, END } = require('@langchain/langgraph');
const { ChatGroq } = require('@langchain/groq');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { KNOWLEDGE } = require('./knowledge');

const GEN_MODEL   = 'llama-3.3-70b-versatile';
const ENABLE_CRITIQUE = process.env.ENABLE_CRITIQUE === 'true';

// Simple keyword-based retriever: split KNOWLEDGE into sections, return top matches
function retrieve(question) {
    const sections = KNOWLEDGE.split('\n\n').filter(s => s.trim().length > 30);
    const words = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const scored = sections.map(section => {
        const lower = section.toLowerCase();
        const score = words.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
        return { section, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map(s => s.section).join('\n\n');
}

const SYSTEM_PROMPT = `You are the assistant for Jonas Ng's portfolio. Your only job is to answer questions about Jonas's professional background, skills, experience, projects, and career.

Guidelines:
- Be warm, direct, and concise (2 to 4 sentences).
- Only answer questions about Jonas. For anything unrelated respond: "I can only answer questions about Jonas's background and experience. Is there something specific about his work you would like to know?"
- Do not make up information. If not in the knowledge base, say so.
- No long dashes. Use commas or colons instead.`;

async function nodeRetrieve(state) {
    const context = retrieve(state.question);
    return { context };
}

async function nodeGenerate(state, config) {
    const llm = new ChatGroq({ model: GEN_MODEL, temperature: 0.5, maxTokens: 300 });
    const prompt = `Use this knowledge base:\n\n${state.context}\n\nQuestion: ${state.question}`;
    const messages = [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(prompt)];
    const response = await llm.invoke(messages, config);
    return { answer: response.content.trim() };
}

async function nodeCritique(state, config) {
    if (!ENABLE_CRITIQUE) return { critique: 'OK' };
    const llm = new ChatGroq({ model: GEN_MODEL, temperature: 0 });
    const prompt = `Does this answer fully and accurately address the question using the provided context? List any specific problems, or just say "OK" if it is correct and complete.\n\nContext:\n${state.context}\n\nQuestion: ${state.question}\n\nAnswer: ${state.answer}`;
    const response = await llm.invoke([new HumanMessage(prompt)], config);
    return { critique: response.content.trim() };
}

async function nodeRevise(state, config) {
    const llm = new ChatGroq({ model: GEN_MODEL, temperature: 0.5, maxTokens: 300 });
    const prompt = `Use this knowledge base:\n\n${state.context}\n\nQuestion: ${state.question}\n\nPrevious answer: ${state.answer}\n\nCritique: ${state.critique}\n\nPlease provide an improved answer addressing the critique.`;
    const messages = [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(prompt)];
    const response = await llm.invoke(messages, config);
    return { answer: response.content.trim(), revisions: state.revisions + 1 };
}

function shouldRevise(state) {
    if (!ENABLE_CRITIQUE) return END;
    if (state.revisions >= 1) return END;
    if (state.critique === 'OK' || state.critique.toLowerCase().startsWith('ok')) return END;
    return 'revise';
}

const graph = new StateGraph({
    channels: {
        question:  { default: () => '' },
        context:   { default: () => '' },
        answer:    { default: () => '' },
        critique:  { default: () => '' },
        revisions: { default: () => 0 },
    }
});

graph.addNode('retrieve',  nodeRetrieve);
graph.addNode('generate',  nodeGenerate);
graph.addNode('check',     nodeCritique);
graph.addNode('revise',    nodeRevise);

graph.setEntryPoint('retrieve');
graph.addEdge('retrieve', 'generate');
graph.addEdge('generate', 'check');
graph.addConditionalEdges('check', shouldRevise, { revise: 'revise', [END]: END });
graph.addEdge('revise', END);

const app = graph.compile();

async function runAgent(question, config = {}) {
    const result = await app.invoke({ question, revisions: 0 }, config);
    return result.answer;
}

module.exports = { runAgent };
