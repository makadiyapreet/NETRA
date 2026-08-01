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

[Architecture](#%EF%B8%8F-system-architecture) • [Key Features](#-key-features--capabilities) • [Quick Start (No Docker)](#-quick-start-no-docker) • [Docker Setup](#-one-command-setup-full-docker-stack) • [API Reference](#-api-reference) • [Security](#-security--compliance)

</div>

---

## 📌 Problem Statement (ERH26_PS_05)

Open social media platforms (Twitter/X, Instagram, Facebook, YouTube, Telegram) are increasingly manipulated to coordinate misinformation campaigns, incite communal tension, threaten public officeholders, and organize cyberbullying. Threats often scale rapidly across regional Indian languages (**Gujarati, Hindi, Hinglish, Marathi, Bengali, Punjabi**), evading generic English-centric content moderation filters.

**NETRA** resolves this critical gap for law enforcement with an automated, crawler-driven OSINT pipeline combined with Zero-Shot LLM Prompting, graph network analytics (Neo4j + Louvain community detection), and a real-time command dashboard with automated police FIR escalation generators.

---

## 🟢 Three Execution Modes

NETRA supports three execution modes, designed for different infrastructure scenarios:

| Mode | Data Source | Infrastructure | Behavior |
|---|---|---|---|
| `MODE=offline` | **Real API Data** | **No Docker needed** ✅ | Connects to YouTube Data API v3 (confirmed working). Background poller fetches real Gujarat-region data every 60s. DataStore starts **empty** — only real data appears. Twitter excluded from background polling due to Free tier limitation. |
| `MODE=kafka` | **Real Streaming Data** | Full Docker stack | Kafka-based streaming pipeline. Connectors push to `raw-posts` topic, NLP classifies, API Gateway consumes from `classified-posts` and `alerts`. |
| `MODE=fixture` | **Demo/Fixture Data** | No Docker needed | Loads `fixtures/mock_data.json` (28KB pre-built posts). All fixture posts are marked `is_synthetic: true` and display a "SIMULATED" badge in the UI. For development and testing only. |

### Data Integrity Guarantee

> **Every post in NETRA is either verifiably real or explicitly badged as SIMULATED.**
> - Real API-fetched posts: `is_synthetic: false`, no badge
> - Fixture/demo posts: `is_synthetic: true`, orange "SIMULATED" badge with flask icon
> - No silent mock-data generation on API errors — errors return empty results with clear diagnostic logs

### Platform Status

| Platform | Status | Notes |
|---|---|---|
| **YouTube** | ✅ Working | YouTube Data API v3 fetches real videos. Background poller active. |
| **Twitter/X** | ⚠️ Tier Limited | X Free tier API does NOT include search access (since 2023). Requires Basic tier ($100/mo). Code is correct; upgrade needed. |
| **Facebook** | 🔄 Scraper Fallback | No Meta Graph API token → automatic public page scraper fallback. Best-effort extraction. |
| **Instagram** | ❌ Requires Auth | Instagram requires login for most content. Scraping unreliable. |
| **Telegram** | ✅ Connector Built | Bot API connector for public channels. Requires `TELEGRAM_BOT_TOKEN`. |

> **API Keys Required:** Configure your social media API credentials in `.env`. See [Environment Configuration](#-environment-configuration) below.

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
                                  │  • Zero-Shot LLM Classifiers (Sarvam AI / Groq)            │
                                  │  • XAI Explainer (Chain-of-Thought + Keyword Heuristics)    │
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
                                  │  • 12 React Pages (Login, Signup, Dashboard, Alerts,        │
                                  │    Network, GeoMap, Trends, Reports, Search, Watchlist,     │
                                  │    ModelPerf, SystemHealth)                                 │
                                  │  • Persistent Dark / Light Mode System                       │
                                  │  • Cascading Geo Filter (Country → State → City)            │
                                  │  • Data Integrity: SIMULATED badges on all synthetic data   │
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
* **MinHash LSH Near-Duplicate Clustering:** Groups near-identical messages posted across different accounts within short time windows.
* **Neo4j Louvain Community Detection:** Identifies coordinated bot armies amplifying threat hashtags.

### 4. 🎬 Multimodal Meme & Video Analysis
* **Static Image OCR:** Tesseract OCR (Hindi + Gujarati + English) extracts text embedded in meme images.
* **OpenCV Video Frame Analysis:** Extracts keyframes at 1 fps from short video clips (YouTube Shorts / Reels ≤60s), running OCR and OpenAI CLIP consistency checks per frame to flag misleading video memes.
* **Deepfake Detection:** Integrates HuggingFace image classification models (`umm-maybe/AI-image-detector`) to flag AI-generated propaganda imagery.

### 5. 🛡️ Security, RBAC & Legal Audit Trail
* **SOC Login & Signup UI:** Military-grade terminal-card authentication pages with HUD corner brackets, animated grid background, scanning-line effect, and "Verifying Clearance" loading states.
* **JWT Authentication:** Stateful user management backed by PostgreSQL (`users` table) with role separation (**Analyst** vs. **Admin**). In-memory fallback user store for offline/no-Docker development.
* **Self-Service Signup:** Agency/jurisdiction dropdown (Ahmedabad Crime Branch, Surat Cyber Cell, ATS, SIB, NIA, CBI), password strength meter, and terms acknowledgment.
* **Audit Logging:** All watchlist mutations and login attempts are logged with timestamps, IP addresses, and user roles.
* **Tamper-Evident Evidence Hash Chain:** SHA-256 hash chain for every alert and report, ensuring legal evidence integrity.
* **Police FIR & I4C Exporter:** 1-click legal draft generator pre-filling IPC Sections 153A, 295A, 505, and IT Act Section 66F.

### 6. 📊 12-Page Command Center Dashboard
0. **Login / Signup:** SOC terminal-card authentication with HUD brackets, animated grid, agency selection.
1. **Threat Dashboard:** Real-time threat feed with live filters, daily AI briefings, threat velocity indicators.
2. **Alert Center:** Socket.IO real-time alert dispatch with SEV 1–5 badges and analyst acknowledgment workflows.
3. **Network Graph:** Interactive `react-force-graph-2d` visualization of bot clusters and coordination nodes.
4. **Geo Intelligence:** Leaflet map with 6 tile types (Dark, Light, Satellite, Terrain, Street, Voyager) and cascading Country → State → City filters.
5. **Trend Monitor:** Recharts keyword frequency spike timeseries and rolling z-score monitors.
6. **Incident Reports:** Report generator exporting executive PDF, DOCX, and JSON threat escalation briefs.
7. **Search Results:** Unified cross-entity search across posts, alerts, trend spikes, and bot clusters.
8. **Watchlist Manager:** Admin CRUD for Keywords, Hashtags, Bounding Boxes, Tracked Profiles. Auto-refreshing matched-content panel with synthetic badges and platform links.
9. **Model Performance:** Real-time metrics and latency monitoring for the Zero-Shot LLM classification engine.
10. **System Health:** Monitoring dashboard showing status, ports, ingestion rates, and latencies for all services.

### 7. 🔬 Data Integrity System (Phase D)
* **`is_synthetic` Field:** Every post in the schema carries an `is_synthetic` boolean. Fixture data is always `true`; real API data is always `false`.
* **SIMULATED Badge:** PostCard and WatchlistManager display an orange badge with flask icon on all synthetic posts.
* **No Silent Mock Generation:** API errors (403/429) return empty results with diagnostic logs — never fake data disguised as real.
* **Mode-Aware Sidebar:** The sidebar badge accurately shows "Live APIs (No Docker)", "Live Data (Kafka)", or "Fixture Data".

---

## 💻 Quick Start (No Docker)

Run all services locally without Docker — **recommended for hackathon demo**:

```bash
# One-command startup
chmod +x run_offline.sh
./run_offline.sh
```

This starts 5 services:
1. **NLP Engine** (port 8000) — Zero-Shot LLM classification
2. **Network Service** (port 8001) — Bot detection & graph analysis. Automatically falls back to DataStore heuristic clustering if Neo4j is unavailable.
3. **Watchlist API** (port 8002) — Keyword/hashtag/profile management
4. **API Gateway** (port 4000) — REST API + Socket.IO + live data fetching
5. **Dashboard** (port 5173) — React command center UI

The dashboard starts **empty** in `MODE=offline` and fills with real YouTube data within ~60 seconds via the background poller.

Or manually start each service:

```bash
# 1. Environment setup
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API credentials

# 2. Start NLP Engine Service
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
> **Self-Service Signup:** Click "Request Access →" on the login page to create a new account.

---

## 🐳 One-Command Setup (Full Docker Stack)

```bash
# 1. Clone repository
git clone https://github.com/makadiyapreet/NETRA.git && cd NETRA

# 2. Copy environment file and configure API keys
cp .env.example .env
# Edit .env with your Twitter/X, YouTube, Meta API credentials

# 3. Spin up all 13 Docker services
docker compose up -d

# 4. Verify service health
curl http://localhost:4000/api/health

# 5. Start the Dashboard UI
cd dashboard && npm install && npm run dev
```

### Deployed Services Summary

| Service | Port | Description |
|---|---|---|
| **React Command Dashboard** | `5173` | Main analyst UI |
| **API Gateway** | `4000` | Node.js Express + Socket.IO REST/WS API |
| **NLP Engine** | `8000` | Python/FastAPI — Zero-Shot LLM Prompting (Sarvam AI / Groq) |
| **Network Analysis** | `8001` | Python/FastAPI — Bot detection, Neo4j graph, Louvain communities |
| **Watchlist REST API** | `8002` | FastAPI PostgreSQL Watchlist Management |
| **Kibana Analytics** | `5601` | Elasticsearch Index Pattern & Saved Dashboard |
| **Grafana Dashboards** | `3001` | Provisioned metrics dashboards (`admin` / `netra`) |
| **Prometheus Metrics** | `9090` | Time Series Scraper |
| **Elasticsearch** | `9200` | Full-Text Post Search & Aggregations |
| **Neo4j Graph Database** | `7474` / `7687` | Cypher Graph DB & Louvain Algorithm Engine |
| **PostgreSQL Database** | `5432` | Watchlists & User Credentials |
| **Redis Cache** | `6379` | Post Deduplication & Rate Limit Store |
| **Apache Kafka** | `9092` | Distributed Streaming (`raw-posts`, `classified-posts`, `alerts`) |

---

## 🔧 Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required API Credentials

| Variable | Source | Purpose |
|---|---|---|
| `TWITTER_BEARER_TOKEN` | [developer.twitter.com](https://developer.twitter.com/) | Twitter/X API v2 (requires Basic tier for search) |
| `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com/) | YouTube Data API v3 ✅ |
| `META_ACCESS_TOKEN` | [developers.facebook.com](https://developers.facebook.com/) | Meta Graph API (optional — scraper fallback available) |

### LLM Configuration

| Variable | Default | Description |
|---|---|---|
| `SARVAM_API_KEY` | `your_key_here` | API Key for Sarvam AI (primary LLM) |
| `GROQ_API_KEY` | `your_key_here` | API Key for Groq (fallback LLM) |
| `ACTIVE_MODEL` | `zeroshot` | Classification mode: `zeroshot` (LLM) or fine-tuned model name |

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
| `GET` | `/health` | Service health check |

### API Gateway (`:4000`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | JWT authentication login |
| `POST` | `/api/auth/signup` | Self-service account registration |
| `GET` | `/api/posts` | List classified posts (filters: language, geo, keyword, threat_category) |
| `GET` | `/api/alerts` | List alerts (severity filter) |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge an alert |
| `POST` | `/api/live/fetch` | Fetch real posts from YouTube/Twitter/Facebook |
| `GET` | `/api/live/status` | Check API connectivity and tier info |
| `GET` | `/api/network/bot-scores` | Bot likelihood scores |
| `GET` | `/api/network/communities` | Neo4j Louvain community clusters |
| `GET` | `/api/network/duplicates` | Near-duplicate post clusters |
| `GET` | `/api/trends/spikes` | Keyword frequency spike timeseries |
| `POST` | `/api/reports/generate` | Generate incident report (PDF/DOCX/JSON) |
| `GET` | `/api/search` | Unified cross-entity search |
| `GET/POST` | `/api/watchlist` | CRUD watchlist management |
| `GET` | `/api/watchlist/matches/:keyword` | Find posts matching a watchlist keyword |
| `GET` | `/api/briefing/today` | AI-generated daily threat briefing |
| `GET` | `/api/geo/hierarchy` | Cascading geo filter (Country → State → City) |
| `GET` | `/api/health` | Full service health check |

### Network Analysis (`:8001`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/score-bot` | Score account for bot likelihood |
| `POST` | `/find-duplicates` | Near-duplicate posts via MinHash LSH |
| `GET` | `/communities` | Louvain community detection results |
| `GET` | `/health` | Service health check |

### Watchlist API (`:8002`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/watchlist` | List all watchlist entries |
| `POST` | `/watchlist` | Create new entry (keyword/hashtag/geo_box/profile) |
| `PUT` | `/watchlist/:id` | Update entry |
| `DELETE` | `/watchlist/:id` | Soft-delete entry |
| `GET` | `/health` | Service health check |

---

## 📊 NLP & ML Validation

The Zero-Shot LLM approach handles code-mixed (Hinglish/Gujlish) natively and adapts to emerging slang faster than static fine-tuned models.

```bash
# Run test samples through the live LLM pipeline
python -m nlp_engine.inference.verify_pipeline
```

---

## 🧪 Testing & Quality Assurance

```bash
# Run pytest suite (84 tests)
pytest tests/ -v

# Run integration test suite
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
│   ├── src/routes/                    # 12 route modules (live-fetch, alerts, watchlist, etc.)
│   ├── src/auth/                      # JWT authentication & RBAC
│   ├── src/data-store.ts              # In-memory DataStore with is_synthetic marking
│   └── src/middleware/                # Audit logger & Web Push dispatcher
├── dashboard/                         # Layer 5: React Real-time Dashboard (:5173)
│   ├── src/pages/                     # 12 pages (Dashboard, Alerts, Network, GeoMap, etc.)
│   ├── src/components/                # Sidebar, FilterBar, PostCard (with SIMULATED badge), etc.
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
│   ├── post_schema.json               # Post schema with is_synthetic field
│   ├── threat_classification_schema.json
│   └── alert_schema.json
├── infra/                             # Dockerfiles, Prometheus, Grafana, Kibana configs
├── fixtures/                          # Demo data (used ONLY in MODE=fixture)
├── docker-compose.yml                 # 13-service Docker compose stack
├── run_offline.sh                     # No-Docker startup script
├── NETRA_PROJECT_REPORT.md            # Complete executive project report
├── DELIVERABLES_STATUS.md             # Deliverable checklist with completion status
├── GAP_REPORT.md                      # 35 audit gaps found and resolved
└── README.md                          # This file
```

---

## 🔒 Security & Compliance

* **JWT Authentication:** All API endpoints require valid JWT tokens. RBAC separates Analyst and Admin privileges.
* **Data Isolation:** Raw social media payloads are schema-validated against strict JSON Draft-07 contracts.
* **Audit Trail:** Every watchlist edit, login attempt, and alert status change is recorded.
* **Evidence Integrity:** SHA-256 hash chain prevents evidence tampering for court proceedings.
* **Rate Limits:** Exponential backoff and circuit breakers protect third-party API quotas.
* **Data Integrity:** `is_synthetic` field and SIMULATED badges ensure no synthetic data is presented as real.
* **Legal Compliance:** FIR generator auto-fills IPC Sections 153A, 295A, 505, and IT Act Section 66F.

---

## 📄 Additional Documentation

| Document | Description |
|---|---|
| [NETRA_PROJECT_REPORT.md](NETRA_PROJECT_REPORT.md) | Complete executive project report with full technical details |
| [DELIVERABLES_STATUS.md](DELIVERABLES_STATUS.md) | Deliverable checklist with completion status |
| [KPI_REPORT.md](KPI_REPORT.md) | Key Performance Indicator metrics report |
| [FUTURE_ENHANCEMENTS.md](FUTURE_ENHANCEMENTS.md) | Product roadmap & planned feature expansions |
| [GAP_REPORT.md](GAP_REPORT.md) | 35 audit gaps found and resolved across 4 phases |
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
