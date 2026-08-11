# 🏗️ NETRA — System Architecture

## Overview

NETRA (National-language Event & Threat Recognition Analyzer) is a distributed microservices system for real-time multilingual social media threat intelligence. The architecture follows a 5-layer pipeline design with clear separation of concerns.

---

## High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                    SOCIAL MEDIA DATA SOURCES                      │
│  YouTube Data API v3 · Twitter/X API v2 · Meta Graph API          │
│  Telegram Bot API · Public Channel Scraper · Playwright Crawler   │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│              LAYER 1: INGESTION & DATA COLLECTION                 │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Key Pool     │  │ Crawl        │  │ Watchlist API          │   │
│  │ Rotation     │  │ Scheduler    │  │ (Keywords, Geo, Users) │   │
│  │ (per-API)    │  │ (Recurring)  │  │ Port :8002             │   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
│                                                                   │
│  Kafka Topic: raw-posts (streaming mode)                         │
│  In-memory DataStore (offline mode)                              │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                   LAYER 2: NLP ENGINE (:8000)                     │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Language ID   │  │ Transliter-  │  │ Zero-Shot LLM         │   │
│  │ (IndicLID +   │  │ ation        │  │ Classifier            │   │
│  │  fastText)    │  │ (AI4Bharat   │  │ (Sarvam → Groq        │   │
│  │              │  │  Xlit)       │  │  fallback chain)      │   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Sentiment    │  │ Deepfake     │  │ XAI Explainer          │   │
│  │ Analysis     │  │ Detector     │  │ (Chain-of-Thought)     │   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Bhashini (ULCA) — Gov of India Translation API (12 langs)   │ │
│  │ Independent translation/transliteration path (free, MeitY)  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│              LAYER 3: NETWORK ANALYSIS (:8001)                    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ 6-Signal Bot │  │ MinHash LSH  │  │ Neo4j Louvain         │   │
│  │ Scorer       │  │ Duplicate    │  │ Community Detection   │   │
│  │              │  │ Detector     │  │ + PageRank            │   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│              LAYER 4: API GATEWAY (:4000)                         │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Express.js   │  │ Socket.IO    │  │ JWT + RBAC            │   │
│  │ REST API     │  │ WebSockets   │  │ Auth Middleware        │   │
│  │ (15 routes)  │  │ (real-time)  │  │ (Admin/Analyst)       │   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Audit Logger │  │ Background   │  │ Evidence Chain         │   │
│  │              │  │ Poller       │  │ (SHA-256 hashing)      │   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│           LAYER 5: COMMAND DASHBOARD (:5173)                      │
│                                                                   │
│  14 React Pages:                                                  │
│  Login · Signup · Dashboard · Alert Center · Network Graph        │
│  Geo Map · Trends · Reports · Search · Watchlist                  │
│  Model Perf · System Health · Crawl Scheduler · Advanced Tools    │
│                                                                   │
│  Features:                                                        │
│  Dark/Light Mode · Socket.IO Live Updates · Cascading Geo Filter  │
│  SIMULATED Badges · Export (PDF/DOCX/CSV) · AI Summaries          │
└───────────────────────────────────────────────────────────────────┘
```

---

## Data Flow (Offline Mode)

```
1. Background Poller (every 60s)
   └─→ YouTube API + Telegram Scraper + Facebook Scraper
       └─→ Raw posts collected
           └─→ NLP Engine (:8000) classifies each post
               └─→ Threat category + confidence + sentiment
                   └─→ DataStore (in-memory) stores posts
                       └─→ Alert generation (severity-based)
                           └─→ Socket.IO broadcast to dashboard
                               └─→ UI updates in real-time
```

---

## Data Flow (Kafka/Streaming Mode)

```
1. Kafka Connectors produce to `raw-posts` topic
2. NLP Engine consumes, classifies, produces to:
   - `classified-posts` topic
   - `alerts` topic
3. API Gateway consumes both topics
4. Elasticsearch indexes for search
5. Neo4j ETL loads graph data
6. Dashboard receives via Socket.IO
```

---

## Technology Stack Summary

| Layer | Technologies |
|---|---|
| **Ingestion** | Python, YouTube Data API v3, Telegram Bot API, Playwright, Scrapy |
| **NLP Engine** | Python, FastAPI, PyTorch, Transformers, Sarvam AI, Groq LLM |
| **Network Analysis** | Python, FastAPI, datasketch (MinHash LSH), Neo4j, GDS |
| **API Gateway** | Node.js, Express.js, Socket.IO, JWT, PostgreSQL |
| **Dashboard** | React 18, Vite, Recharts, react-force-graph-2d, Leaflet |
| **Infrastructure** | Docker Compose, Kafka, Elasticsearch, Redis, Prometheus, Grafana |

---

## Security Architecture

```
Client → HTTPS → API Gateway
                    │
                    ├─ JWT Token Validation
                    ├─ RBAC (Admin / Analyst)
                    ├─ Audit Logging (all mutations)
                    ├─ Rate Limiting (API key pools)
                    └─ Evidence Hash Chain (SHA-256)
```

---

## Scalability Considerations

| Component | Horizontal Scaling Strategy |
|---|---|
| NLP Engine | Multiple uvicorn workers behind load balancer |
| API Gateway | Node.js cluster mode or multiple instances |
| Kafka | Partition-based topic scaling |
| Elasticsearch | Index sharding across nodes |
| Neo4j | Read replicas for graph queries |
| Dashboard | Static build served via CDN |
