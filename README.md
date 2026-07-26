# 🛡️ NETRA — National-language Event & Threat Recognition Analyzer

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Docker Stack](https://img.shields.io/badge/Docker-13--Services-blue)](https://www.docker.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-84%2F84%20Passing-brightgreen.svg)](tests/)
[![PS ID](https://img.shields.io/badge/Hackathon%20PS-ERH26__PS__05-orange.svg)](#-problem-statement-erh26_ps_05)

**Enterprise-Grade Multilingual Cyber Threat Intelligence & OSINT Monitoring Platform for Law Enforcement Agencies**

*Ingesting, classifying, and mapping threat networks across Indian languages (Gujarati, Hindi, Hinglish, Marathi, Bengali, Punjabi, English) in near-real-time.*

[Architecture](#%EF%B8%8F-system-architecture) • [Key Features](#-key-features--capabilities) • [One-Command Setup](#-one-command-setup-full-docker-stack) • [Quick Start (No Docker)](#-quick-start-no-docker) • [Model Training](#-model-training--real-inference) • [API Reference](#-api-reference) • [ML Benchmarks](#-nlp--ml-model-benchmarks) • [Security & Compliance](#-security--compliance)

</div>

---

## 📌 Problem Statement (ERH26_PS_05)

Open social media platforms (Twitter/X, Instagram, Facebook, YouTube, Telegram) are increasingly manipulated to coordinate misinformation campaigns, incite communal tension, threaten public officeholders, and organize cyberbullying. Threats often scale rapidly across regional Indian languages (**Gujarati, Hindi, Hinglish, Marathi, Bengali, Punjabi**), evading generic English-centric content moderation filters.

**NETRA** resolves this critical gap for law enforcement with an automated, crawler-driven OSINT pipeline combined with Zero-Shot LLM Prompting, graph network analytics (Neo4j + Louvain community detection), and a real-time command dashboard with automated police FIR escalation generators.

---

## 🟢 Execution Mode: Real Data (`MODE=kafka`)

NETRA operates in **real data mode by default**, connecting to live social media APIs and streaming posts through Apache Kafka for real-time threat classification.

| Component | Behavior |
|---|---|
| **Data Ingestion** | Connects to Twitter/X API v2, YouTube Data API v3, Meta Graph API, Telegram Bot API, Playwright JS scraper, and Scrapy static crawler |
| **Streaming** | Live posts stream into Kafka topics (`raw-posts` → `classified-posts` → `alerts`) |
| **Classification** | Zero-Shot LLM Prompting (Sarvam AI / Groq) classifies posts in real-time |
| **Alerting** | High-confidence threats (≥70%) auto-generate alerts dispatched via Socket.IO WebSockets |
| **Network Analysis** | Bot scoring, MinHash LSH duplicate detection, and Neo4j Louvain community graphs run continuously |
| **Quota Fallback** | Automatically generates 10 diverse, media-rich mock threat posts across 5 platforms if live API keys hit quota limits (402/403/429). |

> **API Keys Required:** Configure your social media API credentials in `.env` to enable live data ingestion. See [Environment Configuration](#-environment-configuration) below.

---

## 🏗️ System Architecture

```
                                  ┌─────────────────────────────────────────────────────────────┐
                                  │                  SOCIAL MEDIA DATA SOURCES                  │
                                  │  Twitter/X API v2 • YouTube v3 • Meta Graph • Telegram Bot │
                                  │  Playwright JS Scraper • Scrapy Static HTML Crawler         │
                                  └──────────────────────────────┬──────────────────────────────┘
                                                                 │
                                                                 ▼
                                                Kafka Topic: `raw-posts`
                                                                 │
                                  ┌──────────────────────────────┴──────────────────────────────┐
                                  │                     LAYER 1: INGESTION                      │
                                  │  • Redis TTL De-duplication & Rate-Limiter                  │
                                  │  • PostgreSQL Watchlist DB (Keywords, Geo-Boxes, Profiles)  │
                                  │  • Celery Crawl Scheduler & Spike Detector                 │
                                  └──────────────────────────────┬──────────────────────────────┘
                                                                 │
                                                                 ▼
                                  ┌─────────────────────────────────────────────────────────────┐
                                  │                   LAYER 2: NLP ENGINE                       │
                                  │  • Script & Language ID (IndicLID + fastText)              │
                                  │  • AI4Bharat Xlit Romanized Transliteration                 │
                                  │  • Threat Classifiers: Zero-Shot LLM (Sarvam AI / Groq)               │
                                  │  • XAI Explainer (Attention Weights + Keyword Heuristics)   │
                                  │  • FAISS Vector Similarity & Shadow A/B Testing Router      │
                                  └──────────────────────────────┬──────────────────────────────┘
                                                                 │
                                           ┌─────────────────────┴─────────────────────┐
                                           │                                           │
                           Kafka Topic: `classified-posts`                   Kafka Topic: `alerts`
                                           │                                           │
                                           ▼                                           ▼
┌─────────────────────────────────────────────────────────────┐   ┌─────────────────────────────────────────────────────────────┐
│                 LAYER 3: NETWORK ANALYSIS                   │   │                  LAYER 4: API GATEWAY                    │
│  • 6-Signal Bot Heuristic Scorer                            │   │  • Express.js REST API + Socket.IO WebSockets               │
│  • MinHash LSH Near-Duplicate Content Clusterer             │   │  • JWT Auth & Role-Based Access Control (Analyst/Admin)     │
│  • Neo4j Graph DB ETL + Louvain Community Detection         │   │  • Elasticsearch 8 Indexing & Filtered Search               │
│  • Influencer PageRank & Coordinated Amplification Detector │   │  • Web Push Mobile Notifications & Audit Logging            │
└──────────────────────────────┬──────────────────────────────┘   └──────────────────────────────┬──────────────────────────────┘
                               │                                                                 │
                               └──────────────────────────────┬──────────────────────────────────┘
                                                              │
                                                              ▼
                                  ┌─────────────────────────────────────────────────────────────┐
                                  │                 LAYER 5: COMMAND DASHBOARD                  │
                                  │  • 10 React Pages (Dashboard, Alerts, Network, GeoMap,      │
                                  │    Trends, Reports, Search, Watchlist, ModelPerf, Health)   │
                                  │  • Persistent Dark / Light Mode System                       │
                                  │  • Cascading Geo Filter (Country → State → City)            │
                                  │  • Interactive Guided Walkthrough Tour                      │
                                  │  • 1-Click Police FIR & I4C Legal Escalation Exporter       │
                                  └─────────────────────────────────────────────────────────────┘
```

---

## ⭐ Key Features & Capabilities

### 1. 🌐 Multilingual NLP & Threat Taxonomy
* **7 Languages Supported:** Gujarati (`gu`), Hindi (`hi`), Hinglish (`mixed`), English (`en`), Marathi (`mr`), Bengali (`bn`), Punjabi (`pa`).
* **4-Class Threat Taxonomy:**
  * `Inflammatory` — Hate speech, communal provocation, malicious slurs.
  * `IncitementToViolence` — Explicit calls for violence, mob action, riots, or physical harm.
  * `FakeNews` — Fabricated news, viral misinformation, unverified rumors.
  * `Neutral` — General public discussion without threat signals.
* **Transliteration Engine:** AI4Bharat Xlit Engine converts Romanized text (e.g. Gujlish/Hinglish *"danga karenge"*) into native Devanagari/Gujarati script (`दंगा करेंगे`) prior to classification.

### 2. 🔍 Explainable AI (XAI) ("Why was this flagged?")
* Every prediction generates an automated plain-language explanation:
  > *"Flagged as IncitementToViolence (94% confidence) — highest-attention tokens: 'danga', 'maro', 'jalao'. The model's attention concentrated on these terms as primary threat indicators."*

### 3. 🤖 Bot Detection & Graph Network Analytics
* **6-Signal Bot Scorer:** Evaluates account age, follower/following ratio, posting frequency, engagement anomaly score, default avatar, and handle randomness.
* **MinHash LSH Near-Duplicate Clustering:** Group near-identical messages posted across different accounts within short time windows.
* **Neo4j Louvain Community Detection:** Identifies coordinated bot armies amplifying threat hashtags.

### 4. 🎬 Multimodal Meme & Video Analysis
* **Static Image OCR:** Tesseract OCR (Hindi + Gujarati + English) extracts text embedded in meme images.
* **OpenCV Video Frame Analysis:** Extracts keyframes at 1 fps from short video clips (YouTube Shorts / Reels ≤60s), running OCR and OpenAI CLIP consistency checks per frame to flag misleading video memes.
* **Deepfake Detection:** Integrates HuggingFace image classification models (`umm-maybe/AI-image-detector`) to flag AI-generated propaganda imagery.

### 5. 🛡️ Security, RBAC & Legal Audit Trail
* **SOC Login & Signup UI:** Military-grade terminal-card authentication pages with HUD corner brackets, animated grid background, scanning-line effect, and "Verifying Clearance" loading states.
* **JWT Authentication:** Stateful user management backed by PostgreSQL (`users` table) with role separation (**Analyst** vs. **Admin**). In-memory fallback user store for offline/no-Docker development.
* **Self-Service Signup:** Agency/jurisdiction dropdown (Ahmedabad Crime Branch, Surat Cyber Cell, ATS, SIB, NIA, CBI), password strength meter, and terms acknowledgment.
* **Audit Logging:** All watchlist mutations and login attempts are logged with timestamps, IP addresses, and user roles via `audit-logger.ts`.
* **Tamper-Evident Evidence Hash Chain:** Computes a SHA-256 hash chain for every alert and report, ensuring legal evidence integrity in court.
* **Police FIR & I4C Exporter:** 1-click legal draft generator pre-filling IPC Sections 153A, 295A, 505, and IT Act Section 66F for cybercrime reporting.

### 6. 📊 12-Page Command Center Dashboard
0. **Login / Signup:** SOC terminal-card authentication with HUD brackets, animated grid background, role-based access, and agency selection.
1. **Threat Dashboard:** Real-time threat feed with live filters, daily AI briefings, and threat velocity indicators.
2. **Alert Center:** Socket.IO real-time alert dispatch with SEV 1–5 badges and analyst acknowledgment workflows.
3. **Network Graph:** Interactive `react-force-graph-2d` visualization of bot clusters and coordination nodes.
4. **Geo Intelligence:** Leaflet map with 6 map tile types (Dark, Light, Satellite, Terrain, Street, Voyager) and cascading Country → State → City filters.
5. **Trend Monitor:** Recharts keyword frequency spike timeseries and rolling z-score monitors.
6. **Incident Reports:** Report generator exporting executive PDF, DOCX, and JSON threat escalation briefs.
7. **Search Results:** Unified cross-entity search across posts, alerts, trend spikes, and bot clusters.
8. **Watchlist Manager:** Admin CRUD interface for Keywords, Hashtags, Bounding Boxes, and Tracked Profiles.
9. **Model Performance:** Real-time metrics and latency monitoring for the Zero-Shot LLM classification engine.
10. **System Health:** Monitoring dashboard showing real-time status, ports, ingestion rates, consumer lag, and latencies for all 13 services.

---

## ⚡ 21 Completed Tier Upgrade Objectives

The system includes 21 comprehensive tier upgrades:

| Tier | Objective | Implementation Summary |
|---|---|---|
| **Tier 1** | 1. Add Kibana Service | Deployed `kibana:8.12.0` (port 5601) with starter dashboard ndjson (`infra/kibana/export.ndjson`). |
| **Tier 1** | 2. Video Support | OpenCV keyframe extraction at 1 fps for video clips ≤60s with OCR + CLIP checking per frame. |
| **Tier 1** | 3. Dual Scraper Strategy | Built `scrapy_spider.py` for static pages alongside Playwright for JS-heavy rendering. |
| **Tier 1** | 4. Real Login & JWT Auth | Built `users_schema.sql`, `jwt-auth.ts`, `Login.tsx`, and auth-gated dashboard routes. |
| **Tier 2** | 5. API-Driven Classification | Produced `LLM_PROMPTING_GUIDE.md` for Zero-Shot execution. |
| **Tier 2** | 6. Explainable AI (XAI) | Built `explainer.py` for LLM chain-of-thought extraction + schema explanation field. |
| **Tier 2** | 7. Model Latency UI | Built `ModelPerformance.tsx` to track API response times and throughput. |
| **Tier 2** | 8. Rate-Limit Visibility | Built Grafana dashboard (`rate-limits.json`) tracking per-platform API quotas and circuit states. |
| **Tier 3** | 9. GenAI Daily Briefing | Built `daily_briefing.py` and `/api/briefing/today` executive summary generator. |
| **Tier 3** | 10. Vector Similarity Search | Built FAISS vector store (`vector_store.py`) for historical case linking. |
| **Tier 3** | 11. Deepfake Image Detection | Built `deepfake_detector.py` using HuggingFace classification pipelines. |
| **Tier 3** | 12. Multi-Language Scale | Added Marathi (`mr`), Bengali (`bn`), and Punjabi (`pa`) script detection. |
| **Tier 3** | 13. Public Telegram Monitoring| Built `telegram.py` connector using Telegram Bot API for public channels. |
| **Tier 3** | 14. Mobile Push Notifications | Built `notifications.ts` using Web Push API for SEV ≥ 4 alerts. |
| **Tier 3** | 15. Jurisdiction Filtering | Added multi-tenant jurisdiction selection (*Ahmedabad Crime Branch*, *Surat Cyber Cell*, *ATS*, *SIB*). |
| **Tier 3** | 16. A/B Classifier Testing | Built `ab_router.py` for shadow-testing candidate prompts against primary LLM. |
| **Tier 3** | 17. Hash-Chain Evidence Log | Built `evidence_chain.py` SHA-256 hash chain for tamper-evident audit logs. |
| **Tier 3** | 18. I4C National Portal Stub | Built `i4c_integration_stub.py` mapping threats to IPC and IT Act sections. |
| **Tier 4** | 19. Guided Walkthrough Tour | Built `GuidedTour.tsx` with an interactive 8-step walkthrough modal. |
| **Tier 4** | 20. System Health Page | Built `SystemHealth.tsx` showing status for all 13 microservices. |
| **Feature**| 21. Cascading Geo Filter | Built 3-level Country → State → City filter (`/api/geo/hierarchy`). |

---

## 🐳 One-Command Setup (Full Docker Stack)

```bash
# 1. Clone repository
git clone https://github.com/makadiyapreet/NETRA.git && cd NETRA

# 2. Copy environment file and configure API keys
cp .env.example .env
# Edit .env with your Twitter/X, YouTube, Meta API credentials

# 3. Spin up all 13 Docker services (Kafka, Redis, Postgres, Neo4j, ES, Kibana, NLP, Network, Gateway, Monitoring)
docker compose up -d

# 4. Verify service health
curl http://localhost:4000/api/health

# 5. Start the Dashboard UI
cd dashboard && npm install && npm run dev
```

### Deployed Services Summary

| Service | Port | Description |
|---|---|---|
| **React Command Dashboard** | `5173` | Main analyst UI (Runs via `cd dashboard && npm run dev`) |
| **API Gateway** | `4000` | Node.js Express + Socket.IO REST/WS API |
| **NLP Engine** | `8000` | Python/FastAPI service using a **Zero-Shot LLM Prompting** strategy (Sarvam AI primary, Groq fallback) for multilingual threat classification and sentiment analysis, ensuring transparent output while pending future local fine-tuning. |
| **Network Analysis** | `8001` | Python/FastAPI service with Neo4j and `networkx` for Bot detection and Louvain community detection. |
| **Watchlist REST API** | `8002` | FastAPI PostgreSQL Watchlist Management Service |
| **Kibana Analytics** | `5601` | Elasticsearch Index Pattern & Saved Dashboard |
| **Grafana Dashboards** | `3001` | Provisioned metrics dashboards (`admin` / `netra`) |
| **Prometheus Metrics** | `9090` | Prometheus Time Series Scraper |
| **Elasticsearch** | `9200` | Full-Text Post Search & Aggregations |
| **Neo4j Graph Database** | `7474` / `7687` | Cypher Graph DB & Louvain Algorithm Engine |
| **PostgreSQL Database** | `5432` | Relational Store for Watchlists & User Credentials |
| **Redis Cache** | `6379` | In-Memory Post Deduplication & Rate Limit Store |
| **Apache Kafka** | `9092` | Distributed Streaming Broker (`raw-posts`, `classified-posts`, `alerts`) |

---

## 💻 Quick Start (No Docker)

Run all services locally without Docker:

```bash
# One-command startup (recommended)
chmod +x run_offline.sh
./run_offline.sh
```

Or manually start each service:

```bash
# 1. Environment setup
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API credentials

# 2. Start NLP Engine Service (real model inference)
python -m uvicorn nlp_engine.inference.inference_service:app --port 8000 &

# 3. Start Network Analysis Service
python -m uvicorn network_analysis.api.network_service:app --port 8001 &

# 4. Start Watchlist API Service
python -m uvicorn ingestion.api.watchlist_api:app --port 8002 &

# 5. Start API Gateway (in api-gateway directory)
cd api-gateway && npm run dev &

# 6. Start Dashboard UI (in dashboard directory)
cd dashboard && npm run dev &
```

> **Authentication:**
> The system uses JWT-backed PostgreSQL authentication. When PostgreSQL is unavailable, an in-memory user store is used as fallback.
>
> **Seed Credentials:**
> - **Admin:** `admin@netra.gov.in` / `netra2026`
> - **Analyst:** `analyst@netra.gov.in` / `analyst2026`
>
> **Self-Service Signup:** Click "Request Access →" on the login page to create a new account with your agency/jurisdiction.

---

## 🔧 Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required API Credentials

| Variable | Source | Purpose |
|---|---|---|
| `TWITTER_BEARER_TOKEN` | [developer.twitter.com](https://developer.twitter.com/) | Twitter/X API v2 stream |
| `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com/) | YouTube Data API v3 |
| `META_ACCESS_TOKEN` | [developers.facebook.com](https://developers.facebook.com/) | Meta Graph API (FB/Instagram) |

### LLM Configuration

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `sarvam` | Which provider to use: `sarvam` or `groq` |
| `SARVAM_API_KEY` | `your_key_here` | API Key for Sarvam AI |
| `GROQ_API_KEY` | `your_key_here` | API Key for Groq (Fallback) |
| `LLM_MODEL_VERSION` | `sarvam-v1` | Version string reported in classification output |

### Threshold Configuration

| Variable | Default | Description |
|---|---|---|
| `ALERT_CONFIDENCE_THRESHOLD` | `0.7` | Minimum confidence to trigger an alert |
| `ALERT_MIN_SEVERITY` | `2` | Minimum severity level to emit alerts |
| `UNCERTAINTY_THRESHOLD` | `0.5` | Below this → route to human review |
| `DUPLICATE_SIMILARITY_THRESHOLD` | `0.8` | MinHash LSH near-duplicate threshold |
| `BOT_SCORE_THRESHOLD` | `0.7` | Score above this → flag as likely bot |

---

## 🧠 Zero-Shot LLM Inference

NETRA uses a Zero-Shot LLM Prompting approach for real threat classification, connecting to Sarvam AI (primary) and Groq (fallback). This ensures highly accurate, multilingual text comprehension without the need for local GPU fine-tuning.

### Automated Setup (Recommended)

```bash
# Set up environment and API keys
python setup_llm_engine.py

# Verify API connections
python verify_llm.py
```

### Prompt Engineering

The system uses a carefully engineered system prompt that instructs the LLM to analyze the provided text, apply our 4-class taxonomy (`Neutral`, `Inflammatory`, `IncitementToViolence`, `FakeNews`), and return a structured JSON response containing the category, confidence score, and extracted threat keywords.

---

## 📡 API Reference

### NLP Engine (`:8000`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/classify` | Classify a single post (returns threat category, confidence, sentiment) |
| `POST` | `/classify-batch` | Classify multiple posts in batch |
| `GET` | `/health` | Service health check (model loaded status, version) |

### API Gateway (`:4000`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | JWT authentication login |
| `POST` | `/api/auth/signup` | Self-service account registration |
| `GET` | `/api/posts` | List classified posts (with filters: language, geo, keyword, threat_category) |
| `GET` | `/api/alerts` | List alerts (with severity filter) |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge an alert |
| `GET` | `/api/network/bot-scores` | Bot likelihood scores for all accounts |
| `GET` | `/api/network/communities` | Neo4j Louvain community clusters |
| `GET` | `/api/network/duplicates` | Near-duplicate post clusters |
| `GET` | `/api/trends/spikes` | Keyword frequency spike timeseries |
| `POST` | `/api/reports/generate` | Generate incident report (PDF/DOCX/JSON) |
| `GET` | `/api/search` | Unified cross-entity search |
| `GET/POST` | `/api/watchlist` | CRUD watchlist management |
| `GET` | `/api/briefing/today` | AI-generated daily threat briefing |
| `GET` | `/api/geo/hierarchy` | Cascading geo filter (Country → State → City) |
| `GET` | `/api/health` | Full service health check |
| `GET` | `/api/health-metrics` | Detailed service metrics & latencies |

### Network Analysis (`:8001`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/score-bot` | Score a single account for bot likelihood |
| `POST` | `/find-duplicates` | Find near-duplicate posts via MinHash LSH |
| `GET` | `/communities` | Get Louvain community detection results |
| `GET` | `/health` | Service health check |

### Watchlist API (`:8002`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/watchlists` | List all watchlists |
| `POST` | `/watchlists` | Create a new watchlist entry |
| `PUT` | `/watchlists/:id` | Update a watchlist entry |
| `DELETE` | `/watchlists/:id` | Delete a watchlist entry |
| `GET` | `/health` | Service health check |

---

## 📊 NLP & ML Validation

The Zero-Shot LLM approach handles code-mixed (Hinglish/Gujlish) natively and adapts to emerging slang much faster than static fine-tuned models. 

Evaluation results measured across our internal test sets show that Sarvam AI's native Hindi/Indic models perform exceptionally well on context-heavy threat detection, while Groq provides sub-second fallback latency.

### Run Verification

```bash
# Run a batch of test samples through the live LLM pipeline
python -m nlp_engine.inference.verify_pipeline
```

---

## 🧪 Testing & Quality Assurance

NETRA includes a comprehensive 84-test unit test suite and 16 end-to-end integration tests:

```bash
# Run pytest suite (all 84 tests passing)
pytest tests/ -v

# Run full integration test suite
python integration_test.py

# Run demo verification pipeline
python run_demo.py
```

---

## 📂 Project Directory Structure

```
NETRA/
├── ingestion/                         # Layer 1: Data Ingestion & Crawling
│   ├── api/watchlist_api.py           # FastAPI Watchlist REST API (:8002)
│   ├── connectors/                    # Twitter, YouTube, Meta, Scraper, Telegram, Scrapy
│   ├── db/                            # SQLAlchemy ORM models & CRUD operations
│   ├── watchlist/                     # Watchlist SQL schemas (watchlists & users)
│   ├── trending/                      # Z-score spike detector & hashtag tracker
│   └── scheduler/                     # Celery task queue & daily briefing generator
├── nlp_engine/                        # Layer 2: Multilingual NLP Engine
│   ├── models/                        # LLM prompt templates and API connectors
│   ├── preprocessing/                 # IndicLID language ID, AI4Bharat transliteration, spaCy
│   ├── inference/                     # FastAPI inference (:8000), LLM routing, FAISS vector store
│   └── datasets/                      # Test sample sets for LLM verification
├── network_analysis/                  # Layer 3: Bot & Network Graph Analysis
│   ├── api/network_service.py         # FastAPI network service (:8001)
│   ├── bot_detection/                 # 6-signal bot scorer & MinHash LSH duplicate detector
│   └── graph/                         # Neo4j Cypher schemas, Graph ETL & Louvain algorithm
├── api-gateway/                       # Layer 4: Node.js API Gateway (:4000)
│   ├── src/routes/                    # Posts, Alerts, Network, Reports, Trends, Search, Watchlist, Auth, Geo, Health
│   ├── src/auth/                      # JWT authentication & Role-Based Access Control (RBAC)
│   └── src/middleware/                # Mutation audit logger & Web Push dispatcher
├── dashboard/                         # Layer 5: React Real-time Dashboard (:5173)
│   ├── src/pages/                     # 10 full pages (Dashboard, Alerts, Network, GeoMap, Trends, Reports, Search, Watchlist, ModelPerf, Health)
│   ├── src/components/                # Sidebar, FilterBar, PostCard, GuidedTour, RoleSwitcher
│   └── src/ThemeContext.tsx           # Persistent Dark / Light mode provider
├── reporting/                         # Incident Reporting & Evidence
│   ├── generate_report.py             # PDF (ReportLab), DOCX (python-docx), JSON exporters
│   └── evidence_chain.py              # SHA-256 hash-chain evidence logger
├── bonus_multimodal/                  # Multimodal Processing
│   ├── ocr_extraction.py              # Tesseract OCR for Hindi, Gujarati, English
│   ├── video_frame_analysis.py        # OpenCV keyframe extractor (Shorts/Reels ≤60s)
│   ├── image_text_consistency.py      # OpenAI CLIP consistency checker
│   └── deepfake_detector.py           # HuggingFace AI-image detection pipeline
├── shared/schemas/                    # JSON Schemas (Shared Contract)
├── infra/                             # Dockerfiles, Prometheus, Grafana, Kibana configs
├── fixtures/                          # Sample data for development & testing
├── docker-compose.yml                 # 13-service Docker compose stack
├── FUTURE_ENHANCEMENTS.md            # Product roadmap & feature expansion guide
├── NETRA_PROJECT_REPORT.md            # Complete executive project report
├── DELIVERABLES_STATUS.md             # 94-item deliverable checklist
└── GAP_REPORT.md                      # Audit findings & 27 resolved gaps
```

---

## 🔒 Security & Compliance

* **JWT Authentication:** All API endpoints require valid JWT tokens. Role-based access control separates Analyst and Admin privileges.
* **Data Isolation:** All raw social media payloads are schema-validated against strict JSON Draft-07 contracts.
* **Audit Trail:** Every watchlist edit, login attempt, and alert status change is recorded with timestamps, user IDs, and roles.
* **Evidence Integrity:** SHA-256 hash chain prevents evidence tampering for court proceedings.
* **Rate Limits:** Exponential backoff and token bucket circuit breakers protect third-party API quotas.
* **Legal Compliance:** FIR generator auto-fills IPC Sections 153A, 295A, 505, and IT Act Section 66F for I4C national portal submission.

---

## 📄 Additional Documentation

| Document | Description |
|---|---|
| [NETRA_PROJECT_REPORT.md](NETRA_PROJECT_REPORT.md) | Complete executive project report |
| [DELIVERABLES_STATUS.md](DELIVERABLES_STATUS.md) | 94-item deliverable checklist with completion status |
| [KPI_REPORT.md](KPI_REPORT.md) | Key Performance Indicator metrics report |
| [FUTURE_ENHANCEMENTS.md](FUTURE_ENHANCEMENTS.md) | Product roadmap & planned feature expansions |
| [GAP_REPORT.md](GAP_REPORT.md) | Audit findings & 27 resolved gaps |
| [BIAS_REVIEW_NOTES.md](BIAS_REVIEW_NOTES.md) | ML model bias assessment & mitigation notes |
| [MIGRATION_NOTES.md](MIGRATION_NOTES.md) | System migration & upgrade documentation |

---

## 📜 License & Citation

NETRA is released under the **MIT License**. Created for Hackathon Problem Statement **ERH26_PS_05**.

```bibtex
@software{netra2026,
  author = {Makadiya Preet},
  title = {NETRA: National-language Event & Threat Recognition Analyzer},
  year = {2026},
  url = {https://github.com/makadiyapreet/NETRA}
}
```
