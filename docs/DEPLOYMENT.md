# 🚀 NETRA — Deployment Instructions

## Table of Contents
1. [Local Development (Recommended)](#1-local-development-recommended)
2. [Full Docker Stack (Production)](#2-full-docker-stack-production)
3. [Environment Configuration](#3-environment-configuration)
4. [Post-Deployment Verification](#4-post-deployment-verification)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Local Development (Recommended)

### Prerequisites

| Software | Version | Required |
|---|---|---|
| Python | 3.10+ | ✅ |
| Node.js | 18+ | ✅ |
| npm | 9+ | ✅ |
| Git | 2.x | ✅ |
| Docker | 24+ | ❌ Only for full stack |

### Step-by-Step Setup

```bash
# 1. Clone repository
git clone https://github.com/makadiyapreet/NETRA.git
cd NETRA

# 2. Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Install Node.js dependencies
cd api-gateway && npm install && cd ..
cd dashboard && npm install && cd ..

# 5. Configure environment
cp .env.example .env
# Edit .env with your API keys (see Section 3)

# 6. Start all services
chmod +x run_offline.sh
./run_offline.sh
```

### What Gets Started

| # | Service | Port | Technology |
|---|---|---|---|
| 1 | NLP Engine | `8000` | FastAPI + Zero-Shot LLM (Sarvam AI / Groq) |
| 2 | Network Analysis | `8001` | FastAPI + Bot Detection + MinHash LSH |
| 3 | Watchlist API | `8002` | FastAPI + SQLite (offline) |
| 4 | API Gateway | `4000` | Express.js + Socket.IO |
| 5 | Dashboard | `5173` | React 18 + Vite |

### Accessing the Dashboard

```
URL:       http://localhost:5173
Login:     admin@netra.gov.in / netra2026
Alt Login: analyst@netra.gov.in / analyst2026
```

### Useful Commands

```bash
./run_offline.sh          # Start all services
./run_offline.sh stop     # Stop all services
./run_offline.sh doctor   # Diagnose port/process issues
```

---

## 2. Full Docker Stack (Production)

### Prerequisites

| Software | Version |
|---|---|
| Docker | 24+ |
| Docker Compose | v2+ |
| 16 GB RAM | Recommended |

### One-Command Setup

```bash
docker-compose up --build -d
```

### Docker Services (13 containers)

| Service | Port | Description |
|---|---|---|
| `netra-nlp` | 8000 | NLP Engine |
| `netra-network` | 8001 | Network Analysis |
| `netra-watchlist` | 8002 | Watchlist API |
| `netra-gateway` | 4000 | API Gateway |
| `netra-dashboard` | 5173 | React Dashboard |
| `kafka` | 9092 | Apache Kafka |
| `zookeeper` | 2181 | Kafka Coordinator |
| `elasticsearch` | 9200 | Full-Text Search |
| `neo4j` | 7474/7687 | Graph Database |
| `redis` | 6379 | Deduplication Cache |
| `postgres` | 5432 | User/Watchlist DB |
| `prometheus` | 9090 | Metrics Collection |
| `grafana` | 3001 | Monitoring Dashboard |

---

## 3. Environment Configuration

Create a `.env` file in the project root with the following variables:

### Required API Keys

```env
# YouTube Data API v3 (required for YouTube crawling)
YOUTUBE_API_KEY_1=your_youtube_api_key_here
YOUTUBE_API_KEY_2=optional_second_key

# Twitter/X API v2 (requires Basic tier at $100/mo for search)
TWITTER_BEARER_TOKEN_1=your_twitter_bearer_token

# Telegram Bot API (optional - public channel scraping works without it)
TELEGRAM_BOT_TOKEN_1=your_telegram_bot_token

# Meta Graph API (optional)
META_ACCESS_TOKEN_1=your_meta_access_token

# Groq LLM API (required for threat classification)
GROQ_API_KEY=your_groq_api_key

# Sarvam AI (optional, primary classifier - falls back to Groq)
SARVAM_API_KEY=your_sarvam_api_key
```

### Service Configuration

```env
# Execution mode
MODE=offline          # offline | kafka | fixture

# Service hosts (defaults shown)
NLP_SERVICE_HOST=127.0.0.1
NLP_SERVICE_PORT=8000
NETWORK_SERVICE_HOST=127.0.0.1
NETWORK_SERVICE_PORT=8001
WATCHLIST_API_HOST=127.0.0.1
WATCHLIST_API_PORT=8002

# JWT Secret
JWT_SECRET=your-secret-key-here

# Background polling interval (seconds)
POLLING_INTERVAL=60
```

### Multi-Key Rotation

NETRA supports multiple API keys per platform with automatic rotation:
```env
YOUTUBE_API_KEY_1=key_one
YOUTUBE_API_KEY_2=key_two
YOUTUBE_API_KEY_3=key_three
```

When one key hits its quota, the system automatically rotates to the next available key.

### Bhashini (Government Translation API — Free)

Bhashini is India's National Language Translation Mission API by MeitY. **Free, no paid tier.**

```env
# Register at https://bhashini.gov.in/ (instant, free)
# Profile → API Keys → Copy userID and ulcaApiKey
BHASHINI_USER_ID=your_user_id
BHASHINI_API_KEY=your_ulca_api_key
```

Supports 12 Indian languages: Hindi, Gujarati, Marathi, Bengali, Punjabi, Tamil, Telugu, Malayalam, Kannada, Odia, Urdu, English.

---

## 4. Post-Deployment Verification

### Health Checks

```bash
# Check all services
curl http://localhost:4000/api/health-metrics | jq

# Check individual services
curl http://localhost:8000/health   # NLP Engine
curl http://localhost:8001/health   # Network Analysis
curl http://localhost:8002/health   # Watchlist API
curl http://localhost:4000/api/health  # API Gateway
```

### Run Test Suite

```bash
# Unit tests
source .venv/bin/activate
pytest tests/ -v

# Integration test
python integration_test.py

# NLP Pipeline verification
python -m nlp_engine.inference.verify_pipeline
```

### Verify Dashboard

1. Open `http://localhost:5173`
2. Log in with `admin@netra.gov.in` / `netra2026`
3. Check **System Health** page → all services should show green
4. Check **Dashboard** → data should start appearing after ~60s (background poller)
5. Check **Alert Center** → alerts generated from classified posts

---

## 5. Troubleshooting

### Port Already in Use

```bash
./run_offline.sh stop     # Kill all NETRA processes
./run_offline.sh doctor   # Diagnose which ports are occupied
```

### NLP Engine Won't Start

```bash
# Check logs
cat /tmp/netra_logs/nlp.log

# Common fix: reinstall Python deps
source .venv/bin/activate
pip install -r requirements.txt --force-reinstall
```

### No Data Appearing on Dashboard

The dashboard starts empty in offline mode. Data appears after:
1. The background poller runs (every 60s)
2. YouTube/Telegram APIs return results
3. NLP Engine classifies the posts (~30s per batch)

You can also manually trigger a fetch:
```bash
curl -X POST http://localhost:4000/api/live/fetch \
  -H "Content-Type: application/json" \
  -H "X-User-Role: Admin" \
  -d '{"query": "Gujarat news", "platforms": ["youtube"]}'
```

### macOS iCloud Sync Issues

If the project is in `~/Documents` (iCloud synced), services may crash with `ECANCELED`:
```bash
killall bird fileproviderd 2>/dev/null
```

### Docker Memory Issues

The full Docker stack requires ~8-16 GB RAM. If containers crash:
```bash
docker stats                    # Check memory usage
docker-compose down -v          # Clean restart
docker system prune -f          # Free disk space
```
