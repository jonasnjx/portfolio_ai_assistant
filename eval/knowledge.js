'use strict';

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
- Data: Snowflake, MongoDB, RDS, Redis, SQL, OpenSearch, Airflow, Python, PySpark
- Analytics/ML: Tableau, Power BI, Grafana, SageMaker
- Data Governance: OpenMetadata, Alation
- AI and LLM: Groq, Langfuse, RAG, multi-agent systems, AutoGen, Snowflake Cortex Analyst

PROJECTS:
- 3D Portfolio Room (2026): A walkable voxel room in Three.js where recruiters explore Jonas's experience. GitHub: github.com/jonasnjx/portfolio_site
- Baymax AI Assistant for 3D Portfolio Room (2026): An AI assistant backend powering Baymax in the 3D room and a chat widget on the classic site. Answers recruiter questions using Groq (Llama 3.3 70B) with a curated knowledge base and Upstash Redis caching. Built with Node.js on Vercel. GitHub: github.com/jonasnjx/portfolio_ai_assistant
- Portfolio Analytics (2026): A modular event pipeline tracking visitor interactions across the 3D room and classic site. Events are sent via Upstash QStash, aggregated into Redis counters, and displayed on a live public dashboard. Built with Node.js, QStash, Redis, and Chart.js. GitHub: github.com/jonasnjx/portfolio_analytics

WRITING (most recent first):
- "I Led Deliveries for Enterprise Data Catalogs End-to-End. Here Is What I Learned." (2026): Lessons from leading two catalog implementations. Alation (SaaS) at a government research agency: connected 13 systems, main challenges were system owner approvals and cloud security briefings. OpenMetadata (open-source on ECS): 5 AWS accounts, 8000+ assets, challenges included OpenSearch version compatibility and managing Airflow ingestion scripts. Key learnings: adoption is hardest, top-down beats bottom-up, technical catalogs suit AI/ML pipelines, business catalogs suit enterprise platforms.
- "How I Built Analytics for my Portfolio Site using a Modular Approach and Event-driven Pipeline" (2026): How Jonas built a separate analytics service. Covers the modular design approach, the three API endpoints (/track, /consume, /stats), why QStash is used instead of Kafka, and the limitations of HTTP vs persistent connections at scale.
- "Building an AI Chatbot Assistant: Technical Design and Model Choices" (2026): How Jonas built Baymax, covering the motivation, architecture, why Llama 3.3 70B was chosen, why Groq is fast (LPU custom silicon), and how Redis caching works.
- "Context Engineering: The Deciding Factor for AI to be Reliable and Consistent" (2026): About how AI agents consume data differently from humans. Key insight from building an enterprise HR chatbot: hallucinations dropped when proper field context was added.

PERSONAL: Based in Singapore. Outside work: dancing and hiking. Open to senior data engineering and cloud roles.
`;

module.exports = { KNOWLEDGE };
