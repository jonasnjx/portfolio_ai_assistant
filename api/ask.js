const Groq = require('groq-sdk');
const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');
const { createHash } = require('crypto');

const KNOWLEDGE = `
Jonas Ng is a Senior Data and Cloud Engineer based in Singapore with 5 years of experience. He works at the intersection of AI, data, and cloud, helping teams bring AI solutions into production. He builds the data foundations that make AI reliable and scalable: pipelines, governance frameworks, data catalogs, CI/CD workflows, and monitoring systems.

CURRENT ROLE: Senior Data Engineer at Certis, Singapore (August 2025 to present).

WORK EXPERIENCE:

A*STAR, Singapore (August 2024 to June 2025) - Senior Data Engineer
- Led technical integration of Alation data catalog with 13 system owners
- Built 8 ADF pipelines transforming data from Blob storage into Snowflake daily
- Created a RAG application using Node.js and Neo4j, deployed on Azure App Service
- Implemented PGP encryption/decryption for ERP system integration
- Built a multi-agent GenAI chatbot using Snowflake Streamlit, Cortex Analyst, and Microsoft AutoGen
- Developed enterprise architecture using ArchiMate

Accenture, Singapore (July 2021 to July 2024) - AI Cloud Engineer
- Delivered cloud and analytics solutions for finance, manufacturing, and government clients
- Built serverless AWS pipelines (Lambda, S3, Redshift) with CloudFormation/CodePipeline CI/CD
- Trained DBSCAN clustering model on SageMaker to flag suspicious traffic
- Built CloudWatch alerting, QuickSight dashboards
- Managed cloud security across AWS, GCP, Azure
- Built dashboards with Tableau, GCP Looker, and Python/Dash

Internships (2019-2021): Vertex Holdings (LightGBM/ELMo model, 86% accuracy), UPS (supply chain forecasting), Kuehne+Nagel (Tableau/SQL reporting), Shopee (PySpark productivity reports), Air Liquide (Power BI reporting)

CERTIFICATIONS: AWS Machine Learning Specialty, AWS Solutions Architect Associate, Microsoft Azure Fundamentals, SnowPro Associate

EDUCATION: Business Analytics (Honours), Nanyang Technological University (NTU), Singapore

TECHNICAL SKILLS:
- Cloud: AWS (SageMaker, ECS, Glue, Lambda, S3 Iceberg, CloudFormation, CodePipeline), Azure (ADF, App Service), Docker, CI/CD, Git
- Data: Snowflake, MongoDB, RDS, SQL, OpenSearch, Airflow, Python, PySpark
- Analytics/ML: Tableau, Power BI, SageMaker
- Data Governance: OpenMetadata, Alation
- GenAI: RAG, multi-agent systems, AutoGen, Snowflake Cortex Analyst

PROJECTS:
- 3D Portfolio Room (2026): A walkable voxel room in Three.js where recruiters explore Jonas's experience
- Context Engineering article (2026): About how AI agents need proper data context to avoid hallucinations
- Data Engineering trends article (2025): Practitioner take on streaming, Iceberg, observability, vector DBs, catalogs

PERSONAL: Based in Singapore. Outside work: dancing and hiking. Open to senior data engineering and cloud roles.
`;

const SYSTEM_PROMPT = `You are the assistant for Jonas Ng's portfolio. Your only job is to answer questions about Jonas's professional background, skills, experience, projects, and career.

Use this knowledge base:
${KNOWLEDGE}

Guidelines:
- Be warm, direct, and concise (2 to 4 sentences).
- Only answer questions about Jonas. For anything unrelated respond: "I can only answer questions about Jonas's background and experience. Is there something specific about his work you would like to know?"
- Do not make up information. If not in the knowledge base, say so and suggest reaching out via LinkedIn or email.
- No long dashes. Use commas or colons instead.`;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
});

function hashQuestion(q) {
    return createHash('sha256')
        .update(q.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim())
        .digest('hex')
        .slice(0, 32);
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

    const cacheKey = `assistant:${hashQuestion(question)}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) return res.status(200).json({ answer: cached, cache: 'HIT' });
    } catch (e) { /* continue without cache */ }

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: question.trim() },
            ],
            max_tokens: 300,
            temperature: 0.5,
        });

        const answer = completion.choices[0]?.message?.content?.trim()
            || 'Sorry, I could not generate a response.';

        try { await redis.set(cacheKey, answer, { ex: 86400 }); } catch (e) {}

        return res.status(200).json({ answer, cache: 'MISS' });
    } catch (err) {
        console.error('Groq error:', err?.message || err);
        return res.status(500).json({ error: 'The assistant is temporarily unavailable. Please try again shortly.' });
    }
};
