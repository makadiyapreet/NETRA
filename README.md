# NETRA — National-language Event & Threat Recognition Analyzer

> **Hackathon PS ID:** ERH26_PS_05 — Cyber Threat Intelligence / OSINT  
> **Full-stack system:** Ingestion → NLP → Network Analysis → API Gateway → Dashboard + Reporting  
> **Languages:** Gujarati / Hindi / Hinglish / English (multilingual)  

NETRA is an end-to-end social media threat and sentiment analyzer for Indian languages.
It ingests posts from Twitter/X, YouTube, Facebook, and Instagram; classifies them across
a 4-class threat taxonomy (Inflammatory, IncitementToViolence, FakeNews, Neutral); detects
bot coordination networks; and surfaces alerts through a real-time React dashboard.

**Key documents:**
- [GAP_REPORT.md](GAP_REPORT.md) — Audit findings
- [KPI_REPORT.md](KPI_REPORT.md) — Success metrics
- [DELIVERABLES_STATUS.md](DELIVERABLES_STATUS.md) — 81-item checklist (78 done, 3 pending model training)
- [MIGRATION_NOTES.md](MIGRATION_NOTES.md) — Integration architecture
- [BIAS_REVIEW_NOTES.md](BIAS_REVIEW_NOTES.md) — Dataset skew analysis

---

## Table of Contents

1. [One-Command Setup](#one-command-setup)
2. [Quick Start (No Docker)](#quick-start-no-docker)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Running in Fixture Mode (dev)](#running-in-fixture-mode)
6. [Running in Kafka Mode (integration)](#running-in-kafka-mode)
7. [Tests](#tests)
8. [Shared Contract — Schemas & APIs](#shared-contract)
9. [Accuracy / Evaluation Results](#accuracy--evaluation-results)
10. [Technology Stack](#technology-stack)

---

## One-Command Setup

```bash
# Full stack (all 12 services: Kafka, Redis, Postgres, Neo4j, ES, NLP, Network, Prometheus, Grafana)
docker compose up -d

# Verify everything is running
curl http://localhost:4000/api/health   # API Gateway
curl http://localhost:8000/health       # NLP Engine
curl http://localhost:8001/health       # Network Service

# Open the dashboard
open http://localhost:5173              # React dashboard (run `cd dashboard && npm run dev` first)

# Open monitoring
open http://localhost:3001              # Grafana (admin / netra)
open http://localhost:9090              # Prometheus
```

## Quick Start (No Docker)

```bash
# 1. Clone and cd
cd netra

# 2. Create virtual environment
python3 -m venv .venv && source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy env and edit if needed
cp .env.example .env

# 5. Run tests (no model downloads needed)
pytest tests/ -v

# 6. Start NLP service (fixture mode — no Kafka, no models needed for mock)
MODE=fixture python -m uvicorn nlp_engine.inference.inference_service:app --port 8000

# 7. Trigger fixture pipeline (in another terminal)
curl -X POST http://localhost:8000/run-fixture

# 8. Start Network service (fixture mode — no Neo4j needed)
MODE=fixture python -m uvicorn network_analysis.api.network_service:app --port 8001

# 9. Start API Gateway
cd api-gateway && npm install && npm run dev   # Runs on port 4000

# 10. Start Dashboard
cd dashboard && npm install && npm run dev     # Runs on port 5173

# 11. Run integration tests
python integration_test.py --fixture-only      # Local tests only
python integration_test.py                     # Full suite (requires running services)
```


---

## Architecture

```
┌─────────────┐     Kafka: raw-posts     ┌──────────────────────┐
│  Ingestion  │ ─────────────────────────▶│     NLP Engine       │
│  (Layer 1)  │                           │  ┌────────────────┐  │
│  [Person 1] │     Kafka: trend-spikes   │  │ Language ID     │  │
│             │ ─────────▶ Dashboard       │  │ Transliteration │  │
└─────────────┘                           │  │ IndicBERT/Sarvam│  │
                                          │  │ Sentiment       │  │
                                          │  └────────┬───────┘  │
                                          │           │          │
                                          │     Kafka: classified-posts
                                          │           │  Kafka: alerts
                                          └───────────┼──────────┘
                                                      │
                                                      ▼
                                          ┌──────────────────────┐
                                          │ Network Analysis     │
                                          │  ┌────────────────┐  │
                                          │  │ Bot Scorer      │  │
                                          │  │ Near-Duplicate  │  │
                                          │  │ Neo4j Graph     │  │
                                          │  │ Community Det.  │  │
                                          │  └────────┬───────┘  │
                                          │    REST API │        │
                                          └────────────┼────────┘
                                                       │
                                                       ▼
                                          ┌──────────────────────┐
                                          │    Dashboard         │
                                          │    (Layer 3)         │
                                          │    [Person 3]        │
                                          └──────────────────────┘
```

---

## Project Structure

```
netra/
├── ingestion/                           # Layer 1: Data Ingestion
│   ├── config.py                        # Centralized settings (env-driven)
│   ├── models.py                        # Pydantic v2: PostMessage, TrendSpike
│   ├── kafka_producer.py                # Kafka producer (raw-posts, trend-spikes)
│   ├── redis_client.py                  # Redis dedup + rate limiting + counters
│   ├── connectors/
│   │   ├── base.py                      # Abstract base connector (fetch→dedup→publish)
│   │   ├── twitter.py                   # Twitter/X API v2 (tweepy)
│   │   ├── youtube.py                   # YouTube Data API v3
│   │   ├── meta.py                      # Facebook/Instagram (Meta Graph API)
│   │   ├── scraper.py                   # Playwright fallback (robots.txt compliant)
│   │   └── simulator.py                 # Synthetic data generator
│   ├── scheduler/tasks.py               # Celery crawl tasks with retry
│   ├── trending/
│   │   ├── spike_detector.py            # Rolling z-score spike detection
│   │   └── trending_hashtags.py         # Geo-tagged trending hashtags
│   ├── db/
│   │   ├── models.py                    # SQLAlchemy ORM models
│   │   └── watchlist_crud.py            # PostgreSQL CRUD operations
│   ├── watchlist/
│   │   ├── watchlist_schema.sql         # PostgreSQL DDL + seed data
│   │   └── watchlist_manager.py         # High-level watchlist API
│   ├── dedup/redis_dedup.py             # Dedup wrapper
│   └── monitoring/metrics.py            # Prometheus counters/histograms
│
├── nlp_engine/                          # Layer 2: NLP Classification
│   ├── config.py                        # NLP configuration (env-driven)
│   ├── preprocessing/
│   │   ├── language_id.py               # IndicLID + fastText language detection
│   │   ├── transliteration.py           # AI4Bharat Xlit (Romanized→native)
│   │   └── spacy_pipeline.py            # Custom spaCy pipeline
│   ├── datasets/
│   │   └── prepare_datasets.py          # HASOC/TRAC-2/MACD loader + label mapper
│   ├── models/
│   │   ├── indicbert_classifier.py      # IndicBERT/MuRIL 4-class threat classifier
│   │   ├── mbert_classifier.py          # mBERT baseline (PS-mandated)
│   │   ├── sarvam_classifier.py         # Sarvam prompt-based classifier
│   │   ├── sentiment_model.py           # XLM-R sentiment + intensity
│   │   ├── train_indicbert.py           # Fine-tuning (class-weighted loss)
│   │   ├── train_sarvam.py              # LoRA/QLoRA fine-tuning
│   │   └── evaluate.py                  # Benchmark table: IndicBERT vs mBERT vs MuRIL
│   ├── inference/
│   │   ├── inference_service.py         # FastAPI (fixture / kafka modes)
│   │   └── uncertainty_sampler.py       # Active learning: low-confidence routing
│   ├── training/                        # Re-exports for target structure
│   └── active_learning/                 # Re-exports for target structure
│
├── network_analysis/                    # Layer 3: Bot & Network Analysis
│   ├── config.py                        # Network service configuration
│   ├── bot_detection/
│   │   ├── heuristic_scorer.py          # 6-signal bot scoring
│   │   └── near_duplicate.py            # MinHash LSH near-duplicate detection
│   ├── graph/
│   │   ├── neo4j_schema.cypher          # Constraints + indexes
│   │   ├── graph_etl.py                 # Post/Account/Cluster ETL into Neo4j
│   │   └── community_detection.py       # Louvain + PageRank + coordination scoring
│   └── api/
│       └── network_service.py           # FastAPI REST API
│
├── api-gateway/                         # Layer 4: API Gateway (Node.js/Express)
│   └── src/
│       ├── server.ts                    # Express + Socket.IO (fixture/kafka switch)
│       ├── kafka-consumer.ts            # KafkaJS consumer (classified-posts, alerts, spikes)
│       ├── elasticsearch-client.ts      # ES indexing + filtered search
│       ├── data-store.ts                # Fixture data store
│       ├── websocket-server.ts          # Socket.IO real-time push
│       ├── routes/
│       │   ├── posts.ts                 # Filterable, paginated post feed
│       │   ├── alerts.ts                # Alert management + acknowledge
│       │   ├── network.ts               # Proxy to Network Service
│       │   ├── reports.ts               # Incident report generation
│       │   └── trends.ts                # Trend data
│       ├── auth/rbac.ts                 # Analyst / Admin RBAC
│       └── middleware/audit-logger.ts   # Mutation audit logging
│
├── dashboard/                           # Layer 5: React Dashboard (Vite + TS)
│   └── src/
│       ├── App.tsx                      # 6-page layout with sidebar + role switcher
│       ├── pages/
│       │   ├── Dashboard.tsx            # Threat intelligence feed
│       │   ├── AlertsPanel.tsx          # Alert center
│       │   ├── NetworkView.tsx          # Force-directed graph visualization
│       │   ├── GeoMapView.tsx           # Leaflet geo heatmap
│       │   ├── TrendView.tsx            # Recharts trend monitor
│       │   └── IncidentReport.tsx       # Report generation UI
│       └── components/                  # FilterBar, PostCard, AlertCard, Sidebar, etc.
│
├── reporting/                           # Incident Reports & Escalation
│   ├── generate_report.py              # PDF (ReportLab), DOCX (python-docx), JSON
│   └── templates/
│       └── incident_report_template.py  # Jinja2 escalation notices
│
├── bonus_multimodal/                    # Meme/Image bonus
│   ├── ocr_extraction.py               # Tesseract OCR (hin+guj+eng)
│   └── image_text_consistency.py        # CLIP image-text consistency
│
├── shared/schemas/                      # Shared contract (all layers)
│   ├── post_schema.json
│   ├── threat_classification_schema.json
│   ├── alert_schema.json
│   └── network_service_api.json
│
├── fixtures/                            # Demo/test data
├── tests/                               # pytest test suite
├── infra/                               # Dockerfiles, Prometheus, Grafana
├── docker-compose.yml                   # All 12 services
├── integration_test.py                  # 16-test E2E integration suite
├── GAP_REPORT.md                        # Audit findings
├── KPI_REPORT.md                        # Success metrics
├── DELIVERABLES_STATUS.md               # 81-item checklist
├── MIGRATION_NOTES.md                   # Integration architecture
├── BIAS_REVIEW_NOTES.md                 # Dataset skew analysis
├── requirements.txt
├── .env.example
└── README.md
```

---

## Running in Fixture Mode

Fixture mode (`MODE=fixture`) reads from `fixtures/sample_posts.json` and writes results
to the fixtures directory. **No Kafka, no live data, no model downloads needed for mock
predictions.**

```bash
# 1. Start the NLP Engine
MODE=fixture python -m uvicorn nlp_engine.inference.inference_service:app --port 8000

# 2. Trigger the full pipeline
curl -X POST http://localhost:8000/run-fixture

# Output files:
#   fixtures/sample_classified_output.json   ← threat_classification_schema
#   fixtures/sample_alerts_output.json       ← alert_schema
#   fixtures/uncertain_posts.json            ← low-confidence posts for review

# 3. Classify a single post
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"post_id":"test-1","platform":"twitter","author_id":"a1","author_handle":"@test","text":"Breaking news in Ahmedabad","created_at":"2026-07-20T12:00:00Z","hashtags":[],"mentions":[],"media_urls":[],"engagement_counts":{"likes":0,"shares":0,"comments":0},"raw_payload":{"account_created_at":"2020-01-01T00:00:00Z","follower_count":1000,"following_count":500,"post_count":3000}}'
```

### Neo4j Graph (fixture mode)

```bash
# Start Neo4j
docker compose up neo4j -d

# Run ETL (requires classified output to exist first)
python -m network_analysis.graph.graph_etl

# Start Network API
MODE=fixture python -m uvicorn network_analysis.api.network_service:app --port 8001

# Query bot scores
curl http://localhost:8001/bot-score/<account_id>
```

---

## Running in Kafka Mode

Kafka mode (`MODE=kafka`) consumes from `raw-posts` and produces to `classified-posts`
and `alerts`. Switch by setting `MODE=kafka` in `.env`.

```bash
# Start infrastructure
docker compose up -d

# The NLP Engine auto-consumes from "raw-posts" and produces to "classified-posts" + "alerts"
# The Network Service responds to REST queries from the Dashboard
```

---

## Tests

```bash
# Run all tests (no model downloads needed)
pytest tests/ -v

# Run specific test modules
pytest tests/test_language_id.py -v       # Language identification
pytest tests/test_transliteration.py -v   # Transliteration heuristics
pytest tests/test_heuristic_scorer.py -v  # Bot scoring
pytest tests/test_near_duplicate.py -v    # MinHash LSH (requires datasketch)
pytest tests/test_schemas.py -v           # JSON schema validation (requires jsonschema)
```

---

## Shared Contract

### Kafka Topics (fixed names, all 3 layers use exactly these)

| Topic              | Producer      | Consumer      |
|--------------------|---------------|---------------|
| `raw-posts`        | Ingestion     | **NLP Engine**|
| `trend-spikes`     | Ingestion     | Dashboard     |
| `classified-posts` | **NLP Engine**| Dashboard     |
| `alerts`           | **NLP/Network**| Dashboard    |

### Schema 1 — `post_schema.json` (Ingestion → NLP Engine)

```json
{
  "post_id": "string, required, globally unique",
  "platform": "enum: twitter | instagram | facebook | youtube, required",
  "author_id": "string, required",
  "author_handle": "string, required",
  "text": "string, required, raw post text",
  "language_hint": "string, optional, e.g. 'gu' | 'hi' | 'en' | 'mixed' | null",
  "created_at": "ISO 8601 timestamp, required",
  "geo_location": "{ lat: number, lng: number, place_name: string } | null",
  "hashtags": "array of strings",
  "mentions": "array of strings (handles)",
  "media_urls": "array of strings (URLs to images/video)",
  "engagement_counts": "{ likes: number, shares: number, comments: number }",
  "raw_payload": "object — includes account_created_at, follower_count, following_count, post_count"
}
```

### Schema 2 — `threat_classification_schema.json` (NLP Engine → Dashboard)

```json
{
  "post_id": "string, required, matches post_schema.json post_id",
  "threat_category": "enum: Inflammatory | IncitementToViolence | FakeNews | Neutral, required",
  "threat_confidence": "number 0-1, required",
  "sentiment": "enum: positive | negative | neutral, required",
  "sentiment_intensity": "number 0-1, required",
  "detected_language": "enum: gu | hi | en | mixed, required",
  "model_version": "string, required",
  "classified_at": "ISO 8601 timestamp, required"
}
```

### Schema 3 — `alert_schema.json` (NLP/Network → Dashboard)

```json
{
  "alert_id": "string, required, globally unique",
  "post_id": "string, required, matches post_schema.json post_id",
  "threat_category": "enum: Inflammatory | IncitementToViolence | FakeNews | Neutral, required",
  "severity": "integer 1-5, required",
  "triggering_reason": "string, required, human-readable explanation",
  "bot_cluster_id": "string | null, links to a coordination cluster if relevant",
  "created_at": "ISO 8601 timestamp, required"
}
```

### Schema 4 — `network_service` REST API (Network Analysis → Dashboard)

```
GET /bot-score/{account_id}
→ { account_id, bot_likelihood: 0-1, signals: {...} }

GET /cluster/{cluster_id}
→ { cluster_id, accounts: [...], coordination_score: 0-1, graph_edges: [{from, to, relation}] }
```

---

## Accuracy / Evaluation Results

> **Status: TBD** — Real numbers will be reported once `evaluate.py` runs against a
> fine-tuned checkpoint trained on HASOC/TRAC-2/MACD data.

### How to generate results

```bash
# 1. Prepare datasets (requires downloading HASOC/TRAC-2/MACD)
python -m nlp_engine.datasets.prepare_datasets \
  --raw-dir raw_datasets/ \
  --output datasets/unified_threat_dataset.csv

# 2. Train IndicBERT
python -m nlp_engine.models.train_indicbert \
  --dataset datasets/unified_threat_dataset.csv \
  --output-dir checkpoints/indicbert-threat-v1

# 2b. Train mBERT baseline (PS-suggested general-purpose transformer)
python -m nlp_engine.models.train_indicbert \
  --dataset datasets/unified_threat_dataset.csv \
  --model bert-base-multilingual-cased \
  --output-dir checkpoints/mbert-threat-v1

# 3. Evaluate single model
python -m nlp_engine.models.evaluate \
  --dataset datasets/unified_threat_dataset.csv \
  --model-type indicbert \
  --model-path checkpoints/indicbert-threat-v1 \
  --output results/evaluation_results.json

# 3b. Full benchmark table (IndicBERT vs MuRIL vs mBERT)
python -m nlp_engine.models.evaluate \
  --dataset datasets/unified_threat_dataset.csv \
  --benchmark-table
```

### Evaluation metrics reported

| Metric | Scope |
|--------|-------|
| Per-class Precision, Recall, F1 | Inflammatory, IncitementToViolence, FakeNews, Neutral |
| Macro / Micro / Weighted F1 | Overall |
| Accuracy by detected_language | gu, hi, en, mixed |
| Confusion matrix | 4×4 |
| Mean prediction confidence | Overall |

### Dataset sources

| Dataset | Labels | Language | Download |
|---------|--------|----------|----------|
| HASOC (2019-2023) | HATE, OFFN, PRFN, NOT | hi, gu, en | https://hasocfire.github.io/ |
| TRAC-2 | OAG, CAG, NAG | hi, en | https://github.com/kmi-linguistics/trac-2 |
| MACD | Abusive / Non-abusive | hi | https://github.com/ShareChatAI/MACD |
| AIKosh (supplementary) | Various | gu, hi | https://aikosh.indiaai.gov.in (requires registration with Indian phone/institutional email) |

### Label mapping (dataset → our taxonomy)

| Source | Original | → Our Taxonomy |
|--------|----------|----------------|
| HASOC | HATE | IncitementToViolence |
| HASOC | OFFN / PRFN | Inflammatory |
| HASOC | NOT | Neutral |
| TRAC-2 | OAG | IncitementToViolence |
| TRAC-2 | CAG | Inflammatory |
| TRAC-2 | NAG | Neutral |
| MACD | 0 (Abusive) | Inflammatory |
| MACD | 1 (Non-abusive) | Neutral |

> **FakeNews note:** None of these datasets directly contain FakeNews labels. FakeNews
> detection uses a rule-based heuristic (urgency markers, conspiracy patterns, unverified
> claim markers) applied as a post-processing layer. Supplement with dedicated datasets
> (e.g., Constraint shared task, Indian Fake News Dataset from AIKosh) for improved
> FakeNews recall.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| **Ingestion** | Python, Celery, tweepy (Twitter v2), requests (YouTube/Meta), Playwright (scraper) |
| **Data Pipeline** | Apache Kafka (4 topics), Redis (dedup + counters), PostgreSQL (watchlist) |
| Preprocessing Pipeline | spaCy (custom pipeline wrapping lang ID + xlit) |
| Language ID | IndicLID-BERT (AI4Bharat) + fastText lid.176 fallback |
| Transliteration | AI4Bharat XlitEngine (Romanized → native) |
| Threat Classifier | IndicBERT (primary) + MuRIL + mBERT (PS baseline) + Sarvam-m |
| Sentiment | XLM-RoBERTa multilingual sentiment |
| Bot Scoring | Heuristic: 6 signals (account age, follower ratio, posting freq, engagement, content diversity, timing) |
| Near-Duplicate | MinHash LSH (datasketch) |
| Coordination Graph | Neo4j 5 Community + GDS (Louvain, PageRank, betweenness) |
| OCR | Tesseract (hin+guj+eng) + Sarvam Akshar (stub) |
| Image Analysis | CLIP (openai/clip-vit-base-patch32) |
| Inference Server | FastAPI + Uvicorn |
| Fine-Tuning | HuggingFace Transformers, PyTorch, PEFT (LoRA) |
| **API Gateway** | Node.js, Express, KafkaJS, Socket.IO, @elastic/elasticsearch |
| **Dashboard** | React 18, TypeScript, Vite, Recharts, Leaflet, react-force-graph-2d |
| **Reporting** | ReportLab (PDF), python-docx (DOCX), Jinja2 (escalation templates) |
| **Monitoring** | Prometheus + Grafana (7-panel dashboard) |
| **Infrastructure** | Docker Compose (12 services: Kafka, Redis, PostgreSQL, Neo4j, ES, Prometheus, Grafana) |

---

## License

For hackathon use only (ERH26_PS_05).
