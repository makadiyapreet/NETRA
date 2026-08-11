# 📦 NETRA — Dependencies & Requirements

## Overview

NETRA is a polyglot system with Python (ML/NLP backend), Node.js (API Gateway), and React (Dashboard frontend). This document lists all runtime and development dependencies.

---

## 1. System Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| **OS** | macOS 12+ / Ubuntu 22.04+ / Windows 11 WSL2 | macOS 14+ / Ubuntu 24.04 |
| **Python** | 3.10 | 3.12+ |
| **Node.js** | 18.0 | 20 LTS |
| **npm** | 9.0 | 10+ |
| **RAM** | 4 GB (offline mode) | 16 GB (Docker stack) |
| **Disk** | 5 GB (code + models) | 20 GB (with Docker images) |
| **GPU** | Not required | CUDA GPU for transformer fine-tuning |

---

## 2. Python Dependencies (`requirements.txt`)

### NLP Core
| Package | Version | Purpose |
|---|---|---|
| `torch` | ≥2.0 | PyTorch neural network framework |
| `transformers` | ≥4.35 | HuggingFace model hub (Zero-Shot, CLIP, Deepfake) |
| `tokenizers` | latest | Fast tokenization |
| `datasets` | latest | HuggingFace datasets library |
| `accelerate` | latest | Model training acceleration |
| `peft` | latest | Parameter-efficient fine-tuning (LoRA) |
| `scikit-learn` | latest | ML utilities and metrics |
| `sentencepiece` | latest | Subword tokenization for multilingual models |
| `spacy` | ≥3.6 | NER and linguistic processing |

### Inference & API
| Package | Version | Purpose |
|---|---|---|
| `fastapi` | ≥0.104 | REST API framework (NLP, Network, Watchlist services) |
| `uvicorn[standard]` | latest | ASGI server |
| `pydantic` | ≥2.0 | Data validation and serialization |
| `confluent-kafka` | latest | Kafka consumer/producer (streaming mode) |

### Bot Detection & Network
| Package | Version | Purpose |
|---|---|---|
| `datasketch` | latest | MinHash LSH for near-duplicate detection |
| `neo4j` | latest | Neo4j Python driver |
| `graphdatascience` | latest | Neo4j GDS algorithms (Louvain, PageRank) |
| `pandas` | latest | Data manipulation |
| `numpy` | latest | Numerical computing |

### Testing
| Package | Version | Purpose |
|---|---|---|
| `pytest` | latest | Test framework |
| `pytest-asyncio` | latest | Async test support |
| `httpx` | latest | HTTP test client |
| `jsonschema` | latest | JSON Schema validation |
| `ruff` | latest | Python linter |

---

## 3. Node.js Dependencies

### API Gateway (`api-gateway/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.21 | HTTP framework |
| `cors` | ^2.8 | CORS middleware |
| `socket.io` | ^4.7 | WebSocket real-time alerts |
| `jsonwebtoken` | ^9.0 | JWT authentication |
| `bcryptjs` | ^3.0 | Password hashing |
| `pg` | ^8.22 | PostgreSQL client |
| `@elastic/elasticsearch` | ^8.12 | Elasticsearch client |
| `kafkajs` | ^2.2 | Kafka client |
| `node-fetch` | ^2.7 | HTTP client |
| `uuid` | ^11.1 | UUID generation |
| `web-push` | ^3.6 | Push notifications |
| `dotenv` | ^16.4 | Environment variables |

### Dashboard (`dashboard/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18 | UI framework |
| `react-dom` | ^18 | DOM rendering |
| `vite` | ^6 | Build tool and dev server |
| `lucide-react` | latest | Icon library |
| `recharts` | latest | Chart library (trend visualization) |
| `react-force-graph-2d` | latest | Network graph visualization |
| `react-leaflet` | latest | Geographic map |
| `leaflet` | latest | Map tiles and layers |

---

## 4. External Services & APIs

| Service | Required | Free Tier | Purpose |
|---|---|---|---|
| **YouTube Data API v3** | ✅ | 10,000 units/day | Video search and comment fetching |
| **Groq API** | ✅ | Free tier available | LLM inference for Zero-Shot classification |
| **Sarvam AI** | ❌ (fallback to Groq) | Free tier | Primary Indic language LLM |
| **Bhashini (ULCA)** | ❌ | **Free (Gov API)** | Government of India translation/transliteration (12 languages) |
| **Telegram Bot API** | ❌ | Free | Enhanced channel access |
| **Twitter/X API v2** | ❌ | Basic $100/mo | Tweet search (free tier has no search) |
| **Meta Graph API** | ❌ | Free | Facebook/Instagram post access |

---

## 5. Optional Infrastructure (Docker Mode)

| Service | Version | Purpose |
|---|---|---|
| **Apache Kafka** | 3.6+ | Event streaming pipeline |
| **Elasticsearch** | 8.x | Full-text search indexing |
| **Neo4j** | 5.x | Graph database for network analysis |
| **Redis** | 7.x | Deduplication cache and rate limiter |
| **PostgreSQL** | 16.x | Persistent user/watchlist storage |
| **Prometheus** | latest | Metrics collection |
| **Grafana** | latest | Monitoring dashboards |
| **Kibana** | 8.x | Elasticsearch visualization |

---

## 6. Installation Summary

```bash
# Python dependencies
pip install -r requirements.txt

# Node.js API Gateway
cd api-gateway && npm install

# Node.js Dashboard
cd dashboard && npm install
```

All versions are pinned with minimum constraints (`>=`) rather than exact pins to allow compatible updates while ensuring baseline functionality.
