import Groq from 'groq-sdk';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createHash } from 'crypto';

// Knowledge base inlined to avoid serverless file-read issues
const KNOWLEDGE = `
# About Jonas Ng

Jonas is a Senior Data and Cloud Engineer based in Singapore with 5 years of experience. He works at the intersection of AI, data, and cloud, helping teams bring AI solutions into production. He builds the data foundations that make AI reliable and scalable: pipelines, governance frameworks, data catalogs, CI/CD workflows, and monitoring systems.

## Current Role

Senior Data Engineer at Certis, Singapore (August 2025 to present).

## Work Experience

### A*STAR, Singapore (August 2024 to June 2025)
Senior Data Engineer

- Led the technical integration of Alation, a data catalog tool, coordinating with 13 system owners and the infrastructure team
- Managed Agent installation and configuration within Linux VMs
- Worked with network teams to establish secure connectivity for metadata extraction and catalog sync
- Built catalog features to support IM8 data governance requirements including sensitivity classification and lineage
- Built 8 ADF pipelines to transform and load unstructured data from 3-tier Blob storage into Snowflake daily
- Created an interactive RAG application using Node.js and Neo4j to present data flows, deployed via Azure App Service
- Implemented PGP encryption and decryption using Python and SQL worksheets for ERP system integration
- Developed enterprise architecture for A*STAR using ArchiMate to connect business logic with applications and data
- Built a multi-agent GenAI chatbot using Snowflake Streamlit, Cortex Analyst, and Microsoft AutoGen

### Accenture, Singapore (July 2021 to July 2024)
AI Cloud Engineer

- Delivered cloud and analytics solutions to clients in finance, manufacturing, and government agencies
- Built serverless data pipelines on AWS (Lambda, S3, Redshift) to ingest and process unstructured logs
- Implemented code logic to support changing log formats and prevent failures during ingestion
- Set up CloudWatch alarms with Slack alerts to catch and respond to pipeline errors quickly
- Used CloudFormation and CodePipeline for automated end-to-end CI/CD deployments
- Trained a clustering model (DBSCAN) on SageMaker to flag suspicious traffic
- Built QuickSight dashboards and managed user access for reporting and monitoring
- Managed cloud security fixes across AWS, GCP, and Azure including key rotation and traffic encryption
- Developed dashboards using Tableau, GCP Looker, and custom Python and Dash applications
- Researched NeRF image synthesis algorithms and proposed GenAI solutions to automate call centers

### Internships (2019 to 2021)

- Vertex Holdings: trained a model using LightGBM and ELMo, achieving 86% accuracy on imbalanced data
- UPS: optimised supply chain networks using time-series forecasting and network modeling
- Kuehne+Nagel: automated supply chain reporting using Tableau, Python and SQL
- Shopee: automated warehouse productivity reports using Python, PySpark, and Google Sheets API
- Air Liquide: streamlined stakeholder reporting using Power BI and Python

## Certifications

- AWS Machine Learning Specialty
- AWS Solutions Architect Associate
- Microsoft Certified: Azure Fundamentals
- SnowPro Associate

## Education

Business Analytics (Honours), Nanyang Technological University (NTU), Singapore

## Technical Skills

- Cloud and Infrastructure: AWS (SageMaker, ECS, Glue, Lambda, S3 Iceberg, CloudFormation, CodePipeline), Azure (ADF, App Service), Docker, ECS, CI/CD, Git
- Data and Databases: Snowflake, MongoDB, RDS, SQL, OpenSearch, Airflow, Python, PySpark
- Analytics and ML: Tableau, Power BI, SageMaker
- Data Governance: OpenMetadata, Alation
- GenAI: RAG, multi-agent systems, AutoGen, Snowflake Cortex Analyst

## Projects

### 3D Portfolio Room (2026)
A walkable voxel room built in Three.js with third-person controls, pixel art, interactive objects, roaming pets, and a Street Fighter arcade machine. The portfolio site itself is a desktop-only interactive game where recruiters can explore Jonas's experience.

### Writing and Articles

- "Context Engineering: The Gap Between a Reliable AI and One That Isn't" (2026): How AI agents consume data differently from humans. When Jonas was building an enterprise HR chatbot, it kept hallucinating because there were multiple date fields and the model had no idea which applied to which context. When proper context was added, hallucinations dropped noticeably.
- "What Actually Changed in Data Engineering This Year" (2025): A practitioner's take on streaming-first ingestion, open table formats (Iceberg), orchestration, observability, vector databases, and data catalogs.

## Personal

- Based in Singapore
- Outside work: dancing and hiking
- Actively learning in AI and data engineering
- Open to senior data engineering and cloud engineering roles
`;

const SYSTEM_PROMPT = `You are the assistant for Jonas Ng's portfolio. Your only job is to answer questions about Jonas's professional background, skills, experience, projects, and career.

Use the following knowledge base to answer questions accurately:

${KNOWLEDGE}

Guidelines:
- Be warm, direct, and conversational. Keep answers concise (2 to 4 sentences unless more detail is genuinely needed).
- Only answer questions about Jonas. If asked anything unrelated (general knowledge, coding help, opinions, personal questions unrelated to his work), respond only with: "I can only answer questions about Jonas's background and experience. Is there something specific about his work you would like to know?"
- Do not make up information. If something is not in the knowledge base, say you do not have that detail and suggest reaching out directly via LinkedIn or email.
- Do not use long dashes. Use commas or colons instead.`;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
});

function corsHeaders(origin) {
    // Allow portfolio domains + localhost for dev
    const allowed = [
        'https://jonasnjx.github.io',
        'https://portfolio-site-jonasnjx.vercel.app',
        'http://localhost:3000',
    ];
    const o = allowed.includes(origin) ? origin : '*';
    return {
        'Access-Control-Allow-Origin': o,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function hashQuestion(q) {
    return createHash('sha256')
        .update(q.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim())
        .digest('hex')
        .slice(0, 32);
}

export default async function handler(req, res) {
    const headers = corsHeaders(req.headers.origin || '');

    if (req.method === 'OPTIONS') {
        return res.status(200).set(headers).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).set(headers).json({ error: 'Method not allowed' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1';
    const { success } = await ratelimit.limit(ip);
    if (!success) {
        return res.status(429).set(headers).json({ error: 'Too many requests. Please slow down.' });
    }

    const { question } = req.body || {};

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).set(headers).json({ error: 'Question is required.' });
    }
    if (question.length > 300) {
        return res.status(400).set(headers).json({ error: 'Question is too long. Please keep it under 300 characters.' });
    }

    const cacheKey = `assistant:${hashQuestion(question)}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.status(200).set(headers).json({ answer: cached, cache: 'HIT' });
        }
    } catch (e) {
        // Redis unavailable, continue without cache
    }

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: question.trim() },
            ],
            max_tokens: 300,
            temperature: 0.5,
        });

        const answer = completion.choices[0]?.message?.content?.trim() || 'Sorry, I could not generate a response.';

        try {
            await redis.set(cacheKey, answer, { ex: 86400 });
        } catch (e) {
            // Cache write failed, continue
        }

        return res.status(200).set(headers).json({ answer, cache: 'MISS' });
    } catch (err) {
        console.error('Groq error:', err);
        return res.status(500).set(headers).json({ error: 'The assistant is temporarily unavailable. Please try again shortly.' });
    }
}
