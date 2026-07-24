# NETRA — KPI REPORT

**Project:** PS05 Threat Analyzer (ERH26_PS_05)  
**Date:** 2024-07-24  
**Domain:** Cyber Threat Intelligence / OSINT  

---

## 1. Named Success Metrics

### 1.1 Classification Performance

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **4-class threat taxonomy** (Inflammatory, IncitementToViolence, FakeNews, Neutral) | Implemented | ✅ DONE | All classifiers (IndicBERT, mBERT, Sarvam) use the same 4 labels |
| **Macro F1 ≥ 0.70** (on balanced test set) | ≥ 0.70 | 🔶 PENDING | Requires fine-tuning on labeled data. Evaluation framework (`evaluate.py`) is complete and ready |
| **Per-language accuracy** (gu, hi, en, mixed) | Reported per language | ✅ READY | `evaluate.py` computes per-language accuracy automatically |
| **Neutral false-positive rate < 10%** | < 0.10 | 🔶 PENDING | Metric computed by `evaluate.py` — needs fine-tuned model to measure |
| **Benchmark table** (IndicBERT vs mBERT vs MuRIL vs Sarvam) | Comparison table | ✅ READY | `evaluate.py --benchmark-table` produces full comparison |
| **Confidence scores** [0, 1] | Per prediction | ✅ DONE | All classifiers output softmax probabilities |

### 1.2 Ingestion Performance

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **Multi-platform coverage** | Twitter, YouTube, Facebook, Instagram | ✅ DONE | 4 API connectors + 1 Playwright scraper + 1 simulator |
| **Deduplication** | Redis-backed, post-level | ✅ DONE | `redis_client.is_duplicate()` with configurable TTL (24h default) |
| **Rate limiting** | Per-domain, configurable | ✅ DONE | Scraper: 1 req/sec + jitter. API connectors: platform-specific |
| **Trend spike detection** | Rolling z-score, configurable threshold | ✅ DONE | `spike_detector.py` with z-threshold=3.0, window=60 |
| **Watchlist-driven crawling** | PostgreSQL-backed CRUD | ✅ DONE | Keywords, hashtags, geo-boxes, profiles |
| **Prometheus metrics** | Ingestion rate, errors, duration | ✅ DONE | `monitoring/metrics.py` exports counters, histograms, gauges |

### 1.3 Network Analysis Performance

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **Bot detection** | Heuristic scoring [0, 1] | ✅ DONE | 6 signals: account age, follower ratio, posting freq, profile completeness, content diversity, timing regularity |
| **Near-duplicate detection** | MinHash LSH | ✅ DONE | Configurable similarity threshold (default 0.8) |
| **Community detection** | Louvain algorithm via Neo4j GDS | ✅ DONE | `community_detection.py` with PageRank + betweenness centrality |
| **Coordination scoring** | Per-cluster score [0, 1] | ✅ DONE | Weighted: 40% avg bot + 35% duplicate edges + 25% cluster size |
| **Neo4j graph schema** | Nodes: Account, Post, Cluster. Edges: POSTED, MENTIONED, SHARED_DUPLICATE, MEMBER_OF | ✅ DONE | `graph/neo4j_schema.cypher` |

### 1.4 Dashboard & API Performance

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **Real-time alerts** | WebSocket push via Socket.IO | ✅ DONE | `websocket-server.ts` pushes `new-alert`, `alert-acknowledged`, `trend-spike` |
| **RBAC enforcement** | Analyst / Admin roles | ✅ DONE | Header-based demo RBAC, Admin-only for acknowledge + reports |
| **Audit logging** | All mutations logged | ✅ DONE | `audit-logger.ts` logs user, role, action, target, timestamp |
| **Filterable post feed** | Language, geo, keyword, threat category | ✅ DONE | `routes/posts.ts` with pagination |
| **Incident reports** | JSON, PDF, DOCX | ✅ DONE | `reporting/generate_report.py` |
| **Network proxy** | Bot scores, clusters from API | ✅ DONE | `routes/network.ts` proxies to Network Service |
| **6 dashboard views** | Dashboard, Alerts, Network, GeoMap, Trends, Reports | ✅ DONE | React + Vite + TypeScript |

### 1.5 Infrastructure & Operations

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **One-command deployment** | `docker-compose up` | ✅ DONE | All 12 services in `docker-compose.yml` |
| **Fixture mode** | Standalone demo without infrastructure | ✅ DONE | `MODE=fixture` works for all services |
| **Kafka integration** | 4 topics, partitioned | ✅ DONE | `raw-posts`, `trend-spikes`, `classified-posts`, `alerts` |
| **Elasticsearch indexing** | Full-text search, filtered queries | ✅ DONE | `elasticsearch-client.ts` with auto-created indices |
| **Monitoring** | Prometheus + Grafana | ✅ DONE | 7-panel Grafana dashboard, Prometheus scraping all services |
| **No hardcoded secrets** | All via env vars | ✅ DONE | `.env.example` documents all variables |

### 1.6 Compliance & Safety

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **Alert-only (no auto-takedown)** | System generates alerts, never suspends/removes | ✅ DONE | Explicitly noted in escalation templates |
| **Public data only** | No private accounts, no closed groups | ✅ DONE | All connectors use public APIs and public profiles |
| **robots.txt compliance** | Scraper checks before crawling | ✅ DONE | `FallbackScraper._check_robots_txt()` |
| **Bias review** | Dataset skew analysis documented | ✅ DONE | `BIAS_REVIEW_NOTES.md` with comprehensive analysis |

---

## 2. Bonus Features

| Feature | Status | Notes |
|---------|--------|-------|
| **Multimodal OCR** | ✅ DONE | `bonus_multimodal/ocr_extraction.py` (EasyOCR, Tesseract fallback) |
| **Image-text consistency** | ✅ DONE | `bonus_multimodal/image_text_consistency.py` (CLIP-based) |
| **Active learning / uncertainty sampling** | ✅ DONE | `inference/uncertainty_sampler.py` routes low-confidence posts for review |
| **Sarvam model support** | ✅ DONE | Prompt-based classification with LoRA fine-tuning path |

---

## 3. Metrics Requiring Live Data

The following metrics are fully instrumented but require a fine-tuned model and live data to produce meaningful numbers:

| Metric | Instrumentation | What's Needed |
|--------|-----------------|---------------|
| Macro F1 score | `evaluate.py` | Fine-tuned model checkpoint + labeled test set |
| Per-language accuracy breakdown | `evaluate.py` | Test set with language annotations |
| Neutral false-positive rate | `evaluate.py` | Trained classifier (untrained model outputs are random) |
| Benchmark comparison table | `evaluate.py --benchmark-table` | All 4 model checkpoints |
| End-to-end latency | Prometheus `classification_duration_seconds` | Live Kafka traffic |
| Ingestion throughput | Prometheus `posts_ingested_total` | Running crawl cycle |
