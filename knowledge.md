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
- Data and Databases: Snowflake, MongoDB, RDS, Redis, SQL, OpenSearch, Airflow, Python, PySpark
- Analytics and ML: Tableau, Power BI, Grafana, SageMaker
- Data Governance: OpenMetadata, Alation
- AI and LLM: Groq, Langfuse, RAG, multi-agent systems, AutoGen, Snowflake Cortex Analyst

## Projects

### 3D Portfolio Room (2026)
A walkable voxel room built in Three.js with third-person controls, pixel art, interactive objects, roaming pets, and a Street Fighter arcade machine. The portfolio site itself is a desktop-only interactive game where recruiters can explore Jonas's experience. Built using Three.js, plain HTML, Express, and deployed on Vercel. No bundler. GitHub: github.com/jonasnjx/portfolio_site

### Baymax AI Assistant for 3D Portfolio Room (2026)
An AI assistant backend that powers Baymax, a virtual assistant in the 3D portfolio room, and a chat widget on the classic site. Answers recruiter questions about Jonas's background using Groq (Llama 3.3 70B) with a curated knowledge base and Upstash Redis caching. Built with Node.js, deployed as a separate Vercel service. Uses per-IP rate limiting and 24-hour response caching. GitHub: github.com/jonasnjx/portfolio_ai_assistant

### Portfolio Analytics (2026)
A modular event pipeline that tracks visitor interactions across the 3D room and classic site. Events (room entries, object clicks, page views, AI chatbot queries) are sent to a separate Vercel service via Upstash QStash, aggregated into Redis counters, and displayed on a live public dashboard. Built with Node.js, QStash, Redis, and Chart.js. GitHub: github.com/jonasnjx/portfolio_analytics. Dashboard: jonasnjx.vercel.app/dashboard

### Writing and Articles

Jonas has written about AI, data engineering, and system design:

- "How I Built the Portfolio Site Analytics using a Modular Event Pipeline" (2026): How Jonas built a separate analytics service tracking visitor interactions. Covers the modular design approach (separate repos), the three API endpoints (/track, /consume, /stats), why QStash is used instead of Kafka (serverless compatibility, HTTP-based), and the limitations of HTTP vs persistent connections at scale.

- "Building a Portfolio AI Assistant: Technical Design and Model Choices" (2026): How Jonas built Baymax, covering the motivation (scattered portfolio information), the technical architecture (Vercel service, Upstash Redis for caching and rate limiting, Groq for LLM inference), why Llama 3.3 70B was chosen (128k context fits the full knowledge base, 70B for quality, free tier), why Groq is fast (LPU custom silicon keeps model weights on-chip), and how Redis caching works (normalise, hash, lookup, store with 24h TTL).

- "Context Engineering: The Gap Between a Reliable AI and One That Isn't" (2026): An article about how AI agents consume data differently from humans. The key insight: when Jonas was building an enterprise HR chatbot, it kept hallucinating because there were multiple date fields and the model had no idea which applied to which context. When proper context was added, hallucinations dropped noticeably.

## Personal

- Based in Singapore
- Outside work: dancing and hiking
- Actively learning in AI and data engineering
- Open to senior data engineering and cloud engineering roles
