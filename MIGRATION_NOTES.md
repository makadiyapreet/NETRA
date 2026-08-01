# NETRA — MIGRATION NOTES

**Project:** NETRA (ERH26_PS_05)  
**Date:** 2024-07-24  
**Phase:** B — Integration  

---

## 1. Integration Architecture

All layers are connected through the following data flow:

```
┌──────────────┐     Kafka: raw-posts     ┌──────────────┐     Kafka: classified-posts     ┌──────────────┐
│   Ingestion  │ ───────────────────────▶  │  NLP Engine  │ ────────────────────────────▶   │  API Gateway │
│  (Connectors │     Kafka: trend-spikes   │  (FastAPI)   │     Kafka: alerts               │  (Express)   │
│  + Celery)   │ ───────────────────────▶  │              │ ────────────────────────────▶   │              │
└──────────────┘                           └──────────────┘                                 └──────┬───────┘
       │                                          │                                                │
       ▼                                          │                                                ▼
┌──────────────┐                           ┌──────────────┐                                 ┌──────────────┐
│    Redis     │                           │ Checkpoints  │                                 │  Dashboard   │
│  (dedup +    │                           │ (models)     │                                 │  (React +    │
│   counters)  │                           └──────────────┘                                 │  Socket.IO)  │
└──────────────┘                                                                            └──────────────┘
       │                                                                                           │
       ▼                                                                                           ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PostgreSQL  │     │    Neo4j     │◀────│   Network    │     │Elasticsearch │     │  Prometheus  │
│  (watchlist) │     │   (graph)    │     │  Analysis    │     │  (indexing)  │     │  + Grafana   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

## 2. Kafka Topics & Contracts

| Topic | Producer | Consumer | Schema |
|-------|----------|----------|--------|
| `raw-posts` | Ingestion layer (all connectors) | NLP Engine | `shared/schemas/post_schema.json` |
| `trend-spikes` | Ingestion spike detector | API Gateway | Custom (TrendSpike in `ingestion/models.py`) |
| `classified-posts` | NLP Engine inference service | API Gateway | `shared/schemas/threat_classification_schema.json` |
| `alerts` | NLP Engine (confidence-based) + Network Analysis (coordination-based) | API Gateway | `shared/schemas/alert_schema.json` |

## 3. MODE Configuration

The system supports three operating modes via the `MODE` environment variable:

### `MODE=fixture`
- API Gateway loads `fixtures/mock_data.json` into the DataStore
- **All posts are marked `is_synthetic: true`** and display a "SIMULATED" badge in the UI
- NLP Engine reads from `fixtures/sample_posts.json`
- Network Service returns fixture bot scores and clusters
- **No Kafka, Redis, PostgreSQL, or Elasticsearch required**
- Suitable for standalone demo and UI development

### `MODE=offline` (Default for `run_offline.sh`)
- DataStore **starts empty** — NO fixture data loaded
- Background poller fetches real data from YouTube API every 60s (Gujarat-focused)
- Twitter API is excluded from background polling (Free tier limitation)
- Live Fetch panel allows manual keyword queries for real YouTube data
- Facebook scraper fallback activates when META_ACCESS_TOKEN is absent
- NLP Engine runs zero-shot classification via Sarvam AI / Groq
- **No Docker infrastructure required** — all services run natively

### `MODE=kafka`
- Ingestion connectors push to Kafka `raw-posts` topic
- NLP Engine consumes from Kafka, classifies, pushes to `classified-posts` and `alerts`
- API Gateway consumes from Kafka, indexes into Elasticsearch, pushes via WebSocket
- **Requires full infrastructure stack** (docker-compose up)

## 4. Network Service Integration

The Network Service runs independently and is accessed via REST API:
- API Gateway proxies `/api/network/*` to the Network Service
- Dashboard calls these endpoints directly via the proxy
- **No Kafka dependency** — the Network Service queries Neo4j directly

## 5. Integration Decisions

### 5.1 API Gateway Kafka Consumer
- Chose **KafkaJS** (pure JS, no native dependencies) for Node.js Kafka integration
- Consumer stores data in memory (bounded buffers: 10K posts, 5K alerts, 1K spikes)
- Falls back gracefully to fixture data if Kafka is unavailable

### 5.2 Elasticsearch
- Used **@elastic/elasticsearch** v8.x client
- Indices auto-created with proper mappings on first startup
- Security disabled for demo (production would use API keys)
- Configurable data-retention purge (default: 90 days)

### 5.3 Reporting Layer
- **PDF**: ReportLab (pure Python, no external binaries)
- **DOCX**: python-docx
- **JSON**: stdlib (always available)
- Escalation templates: Jinja2 with basic-string fallback

### 5.4 Scraper Upgrade
- Playwright-based with HTTP fallback
- robots.txt compliance via `urllib.robotparser`
- Per-domain rate limiting (1 req/sec + jitter)

### 5.5 Meta Scraper Fallback (Phase D)
- When `META_ACCESS_TOKEN` is absent, the system automatically attempts public Facebook page scraping
- Uses mobile user-agent for best-effort text extraction from `m.facebook.com`
- Instagram scraping is unreliable (requires login for most content)
- All scraped posts are marked `source: 'facebook_scraper'` and `is_synthetic: false`

### 5.6 Data Integrity (Phase D)
- `is_synthetic` field added to post schema — all fixture posts are marked `true`
- PostCard and WatchlistManager display "SIMULATED" badges for synthetic posts
- Silent mock-data generation on API errors was removed entirely
- Twitter background polling disabled (Free tier limitation documented)

## 6. Docker Networking

All services use the default Docker Compose network. Service discovery:
- Services reference each other by container name (e.g., `kafka:29092`, `neo4j:7687`)
- External access uses `localhost:PORT` mapping
- Kafka uses dual listeners: `PLAINTEXT` (internal) + `PLAINTEXT_HOST` (external)

## 7. Graceful Degradation

The system is designed to degrade gracefully:
- If Elasticsearch is down → API Gateway serves from memory/fixtures
- If Neo4j is down → Network Service returns fixture data
- If Kafka is down → NLP Engine runs in fixture mode
- If Redis is down → Ingestion skips dedup (logs warning)
- If PostgreSQL is down → Watchlist falls back to default entries
- If Twitter API is Free tier → Background poller excludes Twitter, logs clear error
- If Meta Graph API unavailable → Falls back to public page scraper
