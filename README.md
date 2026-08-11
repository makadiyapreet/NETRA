# 🛡️ NETRA — National-language Event & Threat Recognition Analyzer

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Docker Stack](https://img.shields.io/badge/Docker-13--Services-blue)](https://www.docker.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-112%2F112%20Passing-brightgreen.svg)](tests/)
[![PS ID](https://img.shields.io/badge/Hackathon%20PS-ERH26__PS__05-orange.svg)](#-problem-statement-erh26_ps_05)

**Enterprise-Grade Multilingual Cyber Threat Intelligence & OSINT Monitoring Platform for Law Enforcement Agencies**

*Ingesting, classifying, and mapping threat networks across Indian languages (Gujarati, Hindi, Hinglish, Marathi, Bengali, Punjabi, English) in near-real-time.*

[Architecture](#%EF%B8%8F-system-architecture) • [Key Features](#-key-features--capabilities) • [Quick Start](#-quick-start-no-docker) • [Individual Commands](COMMANDS.md) • [Docker Setup](#-one-command-setup-full-docker-stack) • [API Reference](#-api-reference) • [Security](#-security--compliance)

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
| `MODE=offline` | **Real API Data** | **No Docker needed** ✅ | Connects to YouTube Data API v3, Telegram public channels, and Facebook. Background poller fetches real Gujarat-region data every 60s. DataStore starts **empty** — only real data appears. |
| `MODE=kafka` | **Real Streaming Data** | Full Docker stack | Kafka-based streaming pipeline. Connectors push to `raw-posts` topic, NLP classifies, API Gateway consumes from `classified-posts` and `alerts`. |
| `MODE=fixture` | **Demo/Fixture Data** | No Docker needed | Loads `fixtures/mock_data.json` (28KB pre-built posts). All fixture posts are marked `is_synthetic: true` and display a "SIMULATED" badge in the UI. For development and testing only. |

### Data Integrity Guarantee

> **Every post in NETRA is either verifiably real or explicitly badged as SIMULATED.**
> - Real API-fetched posts: `is_synthetic: false`, no badge
> - Fixture/demo posts: `is_synthetic: true`, orange "SIMULATED" badge with flask icon
> - No silent mock-data generation on API errors — errors return empty results with clear diagnostic logs

### Platform Status

| Platform | Status | Keys | Notes |
|---|---|---|---|
| **YouTube** | ✅ Working | Multi-key rotation | YouTube Data API v3 fetches real videos. Background poller active. Auto-rotates on quota exhaustion. |
| **Telegram** | ✅ Working | Multi-key rotation | Scrapes verified public channels (Zee News, NDTV, Indian Express, Scroll.in, The Quint, LiveMint, CNN-News18, Hindustan Times, Divya Bhaskar, ABP Live, BBC Hindi, Firstpost, ET Markets, Ministry of I&B) + Bot API via `@NETRA_Analyzerbot`. |
| **Meta (FB/IG)** | ✅ Working | Multi-key rotation | Meta Graph API authenticated. Scraper fallback when tokens are exhausted. |
| **Twitter/X** | ⚠️ Tier Limited | Multi-key rotation | X Free tier API does NOT include search access (since 2023). Requires Basic tier ($100/mo). |

> **API Keys Required:** Configure your social media API credentials in `.env` using numbered suffixes (`_1`, `_2`, etc.) for multi-key rotation. See [Environment Configuration](#-environment-configuration) below.

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
                                  │  • Zero-Shot LLM Classifiers (Groq / Sarvam AI)            │
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
└──────────────────────────────────────────────────────────────┘   └──────────────────────────────────────────────────────────────┘
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
* **Bhashini (ULCA) Integration:** Second, independent translation/transliteration path using the Government of India's **National Language Translation Mission** API (free, no paid tier). Supports 12 Indian languages. Reduces dependency on commercial LLMs for core multilingual requirement. Register at [bhashini.gov.in](https://bhashini.gov.in/).

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
* **Multi-Key API Rotation:** Generic `KeyPool` system supporting multiple API keys per platform with automatic failover on quota exhaustion. Exhausted keys auto-recover after platform-specific cooldown periods. Dashboard surfaces real-time key health via `/api/live/key-status`.

### 6. 📊 14-Page Command Center Dashboard
0. **Login / Signup:** SOC terminal-card authentication with HUD brackets, animated grid, agency selection, cinematic splash transitions.
1. **Threat Dashboard:** Real-time threat feed with live filters, daily AI briefings, threat velocity indicators.
2. **Alert Center:** Socket.IO real-time alert dispatch with SEV 1–5 badges, analyst acknowledgment workflows, per-alert AI summary generation, and platform filter (Twitter, YouTube, Telegram, Instagram, Facebook).
3. **Network Graph:** Interactive `react-force-graph-2d` visualization of bot clusters. **Coordinated Amplification Detection** with red badges and warning banner when >5 accounts share near-identical text within 10 minutes.
4. **Geo Intelligence:** Leaflet map with 6 tile types (Dark, Light, Satellite, Terrain, Street, Voyager) and cascading Country → State → City filters.
5. **Trend Monitor:** Recharts keyword frequency spike timeseries and rolling z-score monitors.
6. **Incident Reports:** Report generator with PDF, DOCX, JSON, Excel, and CSV exports. **FIR Draft Generator** with IPC/IT Act section auto-mapping and SHA-256 evidence hash chain. **AI-powered incident summaries** via Groq LLM.
7. **Search Results:** Unified cross-entity search across posts, alerts, trend spikes, and bot clusters.
8. **Watchlist Manager:** Admin CRUD for Keywords, Hashtags, Bounding Boxes, Tracked Profiles. Auto-refreshing matched-content panel with synthetic badges and platform links.
9. **Model Performance:** Real-time metrics and latency monitoring for the Zero-Shot LLM classification engine.
10. **System Health:** Monitoring dashboard showing status, ports, ingestion rates, and latencies for all services.
11. **Crawl Scheduler:** Analyst-defined recurring crawl schedules with query, platform selection, interval configuration, live status indicators, error feedback, and auto-fire through the classify → store → alert pipeline.
12. **Advanced Tools:** Direct access to backend-only APIs — Viral Spread Graph analyzer (by Post ID) and AI Deepfake Detector (by image URL) with graceful fallback when NLP Engine is offline.

### 7. 🔬 Data Integrity System (Phase D)
* **`is_synthetic` Field:** Every post in the schema carries an `is_synthetic` boolean. Fixture data is always `true`; real API data is always `false`.
* **SIMULATED Badge:** PostCard and WatchlistManager display an orange badge with flask icon on all synthetic posts.
* **No Silent Mock Generation:** API errors (403/429) return empty results with diagnostic logs — never fake data disguised as real.
* **Mode-Aware Sidebar:** The sidebar badge accurately shows "Live APIs (No Docker)", "Live Data (Kafka)", or "Fixture Data".

---

## 💻 Quick Start (No Docker)

### One-Command Startup (Recommended)

```bash
# Clone and enter the project
git clone https://github.com/makadiyapreet/NETRA.git && cd NETRA

# One-time setup
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd api-gateway && npm install && cd ..
cd dashboard && npm install && cd ..
cp .env.example .env    # Edit .env with your API credentials

# Start all 5 services
chmod +x run_offline.sh
./run_offline.sh
```

This starts 5 services:

| # | Service | Port | Description |
|---|---------|------|-------------|
| 1 | **NLP Engine** | `8000` | Zero-Shot LLM threat classification (Groq / Sarvam AI) |
| 2 | **Network Analysis** | `8001` | Bot detection & graph analytics. Falls back to heuristic clustering if Neo4j is unavailable. |
| 3 | **Watchlist API** | `8002` | Keyword/hashtag/profile management |
| 4 | **API Gateway** | `4000` | REST API + Socket.IO + live data fetching from YouTube, Telegram, Facebook |
| 5 | **Dashboard** | `5173` | React command center UI |

The dashboard starts **empty** in `MODE=offline` and fills with real YouTube + Telegram data within ~60 seconds via the background poller. Live fetch from the Dashboard UI queries all 4 platforms simultaneously.

### Script Commands

| Command | Action |
|---------|--------|
| `./run_offline.sh` | Start all 5 services |
| `./run_offline.sh stop` | Stop all services and clean up ports |
| `./run_offline.sh doctor` | Run diagnostics without starting anything |
| `Ctrl+C` | Stop all services and exit cleanly |

### Run Services Individually

See **[COMMANDS.md](COMMANDS.md)** for detailed instructions on starting each service individually with health checks and troubleshooting.

Quick reference:
```bash
source .venv/bin/activate

# Python services
python -m uvicorn nlp_engine.inference.inference_service:app --port 8000
python -m uvicorn network_analysis.api.network_service:app --port 8001
python -m uvicorn ingestion.api.watchlist_api:app --port 8002

# Node services
cd api-gateway && node dist/server.js      # Pre-compiled (fast)
cd dashboard && npm run dev                 # Vite dev server
```

### Authentication

> **Seed Credentials (⚠️ Development/Demo Only — change before production):**
> - **Admin:** `admin@netra.gov.in` / `netra2026`
> - **Analyst:** `analyst@netra.gov.in` / `analyst2026`
>
> **Self-Service Signup:** Click "Request Access →" on the login page to create a new account.
>
> The system uses JWT-backed PostgreSQL authentication. When PostgreSQL is unavailable, an in-memory user store is used as fallback.

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
| **NLP Engine** | `8000` | Python/FastAPI — Zero-Shot LLM Prompting (Groq / Sarvam AI) |
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

Each platform supports **multiple keys** via numbered suffixes (`_1`, `_2`, etc.) for automatic rotation when quota is exhausted. If no numbered keys exist, the un-suffixed variable is used as a pool of size 1.

| Variable | Source | Purpose |
|---|---|---|
| `YOUTUBE_API_KEY_1` / `_2` | [console.cloud.google.com](https://console.cloud.google.com/) | YouTube Data API v3 — auto-rotates on daily quota exhaustion |
| `TELEGRAM_BOT_TOKEN_1` / `_2` | [@BotFather on Telegram](https://t.me/BotFather) | Telegram Bot API — auto-rotates on rate limits |
| `META_ACCESS_TOKEN_1` / `_2` | [developers.facebook.com](https://developers.facebook.com/) | Meta Graph API — scraper fallback when all tokens exhausted |
| `TWITTER_BEARER_TOKEN_1` / `_2` | [developer.twitter.com](https://developer.twitter.com/) | Twitter/X API v2 — auto-rotates on 15-min rate window |

### LLM Configuration

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | `your_key_here` | API Key for Groq (primary LLM — Llama-3.1-8B-Instant) |
| `SARVAM_API_KEY` | `your_key_here` | API Key for Sarvam AI (optional secondary — enable via `USE_SARVAM_PRIMARY=true`) |
| `USE_SARVAM_PRIMARY` | `false` | Set to `true` to use Sarvam AI as primary classifier instead of Groq |

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

NETRA uses a Zero-Shot LLM Prompting approach for real threat classification, connecting to Groq Llama-3.1-8B-Instant (primary) with Sarvam AI as optional secondary. This ensures highly accurate, multilingual text comprehension without the need for local GPU fine-tuning.

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
| `POST` | `/deepfake-check` | AI-generated image detection (deepfake) |
| `POST` | `/bhashini/translate` | Bhashini (Gov of India) text translation |
| `POST` | `/bhashini/transliterate` | Bhashini script transliteration |
| `GET` | `/bhashini/status` | Bhashini API availability status |
| `GET` | `/health` | Service health check |

### API Gateway (`:4000`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | JWT authentication login |
| `POST` | `/api/auth/signup` | Self-service account registration |
| `GET` | `/api/posts` | List classified posts (filters: language, geo, keyword, threat_category) |
| `GET` | `/api/alerts` | List alerts (severity filter) |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge an alert |
| `POST` | `/api/live/fetch` | Fetch real posts from YouTube/Telegram/Facebook/Twitter |
| `GET` | `/api/live/status` | Check API connectivity and tier info |
| `GET` | `/api/network/bot-scores` | Bot likelihood scores |
| `GET` | `/api/network/communities` | Neo4j Louvain community clusters |
| `GET` | `/api/network/duplicates` | Near-duplicate post clusters |
| `GET` | `/api/trends/spikes` | Keyword frequency spike timeseries |
| `POST` | `/api/reports/generate` | Generate incident report (PDF/DOCX/JSON) |
| `POST` | `/api/reports/generate-fir` | Generate FIR draft with IPC section mapping |
| `GET` | `/api/search` | Unified cross-entity search |
| `GET/POST` | `/api/watchlist` | CRUD watchlist management |
| `GET` | `/api/watchlist/matches/:keyword` | Find posts matching a watchlist keyword |
| `GET` | `/api/briefing/today` | AI-generated daily threat briefing |
| `POST` | `/api/ai/generate-summary` | AI-generated police-briefing-style incident summary |
| `GET` | `/api/live/key-status` | Per-platform API key pool health status |
| `GET` | `/api/network/amplification-alerts` | Coordinated amplification detection alerts |
| `GET` | `/api/network/spread-graph/:postId` | Viral spread graph for a specific post |
| `POST` | `/api/ai/deepfake-check` | AI-generated image detection (deepfake check) |
| `GET` | `/api/scheduled-crawls` | Scheduled crawl manager CRUD |
| `POST` | `/api/bhashini/translate` | Bhashini (Gov of India) text translation |
| `POST` | `/api/bhashini/transliterate` | Bhashini script transliteration |
| `GET` | `/api/bhashini/status` | Bhashini API availability status |
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
│   ├── preprocessing/                 # IndicLID language ID, AI4Bharat transliteration, Bhashini ULCA, spaCy
│   ├── inference/                     # FastAPI inference (:8000), LLM routing, FAISS vector store
│   └── datasets/                      # Test sample sets for LLM verification
├── network_analysis/                  # Layer 3: Bot & Network Graph Analysis
│   ├── api/network_service.py         # FastAPI network service (:8001)
│   ├── bot_detection/                 # 6-signal bot scorer & MinHash LSH duplicate detector
│   └── graph/                         # Neo4j Cypher schemas, Graph ETL & Louvain algorithm
├── api-gateway/                       # Layer 4: Node.js API Gateway (:4000)
│   ├── src/routes/                    # 12 route modules (live-fetch, alerts, watchlist, etc.)
│   ├── src/auth/                      # JWT authentication & RBAC
│   ├── src/data/                      # telegram_channels.json (220+ public channel directory)
│   ├── src/data-store.ts              # In-memory DataStore with is_synthetic marking
│   ├── src/middleware/                # Audit logger & Web Push dispatcher
│   └── dist/                          # Pre-compiled JavaScript (run `npx tsc` to rebuild)
├── dashboard/                         # Layer 5: React Real-time Dashboard (:5173)
│   ├── src/pages/                     # 14 pages (Dashboard, Alerts, Network, GeoMap, CrawlScheduler, AdvancedTools, etc.)
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
├── docs/                              # Documentation
│   ├── ARCHITECTURE.md                # System architecture deep-dive
│   ├── API_REFERENCE.md               # Detailed API endpoint documentation
│   ├── DATABASE_SCHEMA.md             # Database schema (PostgreSQL, DataStore, Neo4j)
│   ├── DEPLOYMENT.md                  # Deployment instructions
│   └── DEPENDENCIES.md               # Dependencies and requirements listing
├── docker-compose.yml                 # 13-service Docker compose stack
├── run_offline.sh                     # No-Docker startup script (start / stop / doctor)
├── COMMANDS.md                        # Individual service run commands reference
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

## 🔧 Troubleshooting

### macOS: Services fail with `ECANCELED` errors
Your project is in `~/Documents` which is synced by iCloud. The `run_offline.sh` script automatically pauses iCloud sync during startup. If running services manually, run this first:
```bash
killall bird fileproviderd 2>/dev/null   # They auto-restart after ~60s
```

### NLP Engine takes a long time to start
The NLP engine loads ML models (torch, transformers) on startup. This takes 30-120 seconds depending on your machine. The script waits up to 180 seconds.

### Telegram posts not appearing
Most Telegram channels don't have public preview pages enabled. NETRA uses 14 verified channels that are confirmed to work. If you have a `TELEGRAM_BOT_TOKEN` configured in `.env`, the bot API will also be used for additional channels.

### Port already in use
```bash
./run_offline.sh stop    # Clean up all ports
./run_offline.sh doctor  # Check what's occupying ports
```

---

## 📄 Additional Documentation

| Document | Description |
|---|---|
| [COMMANDS.md](COMMANDS.md) | Individual service run commands reference |
| [NETRA_PROJECT_REPORT.md](NETRA_PROJECT_REPORT.md) | Complete executive project report with full technical details |
| [FUTURE_ENHANCEMENTS.md](FUTURE_ENHANCEMENTS.md) | Product roadmap & planned feature expansions |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Database schema documentation (PostgreSQL, DataStore, Neo4j, Elasticsearch) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment instructions (local dev, Docker, cloud) |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | Complete dependency and requirements listing |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Detailed API endpoint documentation with request/response examples |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture deep-dive |

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
