# NETRA — DELIVERABLES STATUS

**Project:** NETRA (ERH26_PS_05)  
**Date:** 2024-07-24  
**PS Domain:** Cyber Threat Intelligence / OSINT  

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete and working |
| 🔶 | Implemented but needs live data / fine-tuning to validate |
| ❌ | Not done |

---

## Layer 1: Ingestion Pipeline

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| Twitter/X connector (API v2) | ✅ | `ingestion/connectors/twitter.py` |
| YouTube connector (Data API v3) | ✅ | `ingestion/connectors/youtube.py` |
| Facebook/Instagram connector (Meta Graph API) | ✅ | `ingestion/connectors/meta.py` |
| Playwright scraper (fallback) | ✅ | `ingestion/connectors/scraper.py` |
| Synthetic data simulator | ✅ | `ingestion/connectors/simulator.py` |
| Base connector contract (ABC) | ✅ | `ingestion/connectors/base.py` |
| Kafka producer (`raw-posts`, `trend-spikes`) | ✅ | `ingestion/kafka_producer.py` |
| Redis dedup (post-level, TTL-based) | ✅ | `ingestion/redis_client.py`, `ingestion/dedup/redis_dedup.py` |
| Trend spike detection (z-score) | ✅ | `ingestion/trending/spike_detector.py` |
| Trending hashtags (geo-tagged) | ✅ | `ingestion/trending/trending_hashtags.py` |
| PostgreSQL watchlist CRUD | ✅ | `ingestion/db/watchlist_crud.py`, `ingestion/watchlist/watchlist_manager.py` |
| Watchlist SQL schema | ✅ | `ingestion/watchlist/watchlist_schema.sql` |
| SQLAlchemy ORM models | ✅ | `ingestion/db/models.py` |
| Pydantic message models (PostMessage, TrendSpike) | ✅ | `ingestion/models.py` |
| Celery task scheduler | ✅ | `ingestion/scheduler/tasks.py` |
| Prometheus metrics | ✅ | `ingestion/monitoring/metrics.py` |
| Environment-based configuration | ✅ | `ingestion/config.py` |

---

## Layer 2: NLP Engine

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| **Zero-Shot Classifier (Active)** | ✅ | `nlp_engine/models/zeroshot_classifier.py` |
| IndicBERT classifier (4-class) | 🔶 | `nlp_engine/models/indicbert_classifier.py` (Pending GPU training) |
| MuRIL classifier (4-class, 17 Indian langs) | 🔶 | `nlp_engine/models/muril_classifier.py` (Pending GPU training) |
| mBERT classifier (PS baseline) | 🔶 | `nlp_engine/models/mbert_classifier.py` (Pending GPU training) |
| Sarvam classifier (prompt-based) | 🔶 | `nlp_engine/models/sarvam_classifier.py` (Pending GPU training) |
| Sentiment model | ✅ | `nlp_engine/models/sentiment_model.py` |
| IndicBERT training script | ✅ | `nlp_engine/models/train_indicbert.py` |
| MuRIL training script | ✅ | `nlp_engine/models/train_muril.py` |
| Sarvam LoRA training script | ✅ | `nlp_engine/models/train_sarvam.py` |
| Evaluation + benchmark table | ✅ | `nlp_engine/models/evaluate.py` |
| Dataset preparation (unified CSV) | ✅ | `nlp_engine/datasets/prepare_datasets.py` |
| Language identification (spaCy + fasttext) | ✅ | `nlp_engine/preprocessing/language_id.py` |
| Transliteration | ✅ | `nlp_engine/preprocessing/transliteration.py` |
| spaCy preprocessing pipeline | ✅ | `nlp_engine/preprocessing/spacy_pipeline.py` |
| FastAPI inference service (fixture + kafka modes) | ✅ | `nlp_engine/inference/inference_service.py` |
| Uncertainty sampler (active learning) | ✅ | `nlp_engine/inference/uncertainty_sampler.py` |
| NLP configuration (env-based) | ✅ | `nlp_engine/config.py` |
| Fine-tuned model checkpoint | 🔶 | Requires labeled training data + GPU |
| Macro F1 ≥ 0.70 on test set | 🔶 | Evaluation framework ready; needs trained model |
| Neutral FP rate < 10% | 🔶 | Metric instrumented; needs trained model |

---

## Layer 3: Network Analysis

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| Bot heuristic scorer (6 signals) | ✅ | `network_analysis/bot_detection/heuristic_scorer.py` |
| Near-duplicate detection (MinHash LSH) | ✅ | `network_analysis/bot_detection/near_duplicate.py` |
| Neo4j graph schema (Cypher DDL) | ✅ | `network_analysis/graph/neo4j_schema.cypher` |
| Graph ETL pipeline | ✅ | `network_analysis/graph/graph_etl.py` |
| Community detection (Louvain + PageRank + Betweenness) | ✅ | `network_analysis/graph/community_detection.py` |
| Coordination scoring | ✅ | `network_analysis/graph/community_detection.py` |
| FastAPI network service | ✅ | `network_analysis/api/network_service.py` |
| Network configuration | ✅ | `network_analysis/config.py` |

---

## Layer 4: Dashboard & API Gateway

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| Express API server | ✅ | `api-gateway/src/server.ts` |
| Kafka consumer (classified-posts, alerts, trend-spikes) | ✅ | `api-gateway/src/kafka-consumer.ts` |
| Elasticsearch client (indexing + search) | ✅ | `api-gateway/src/elasticsearch-client.ts` |
| WebSocket server (Socket.IO) | ✅ | `api-gateway/src/websocket-server.ts` |
| Fixture data store | ✅ | `api-gateway/src/data-store.ts` |
| Posts route (filterable, paginated) | ✅ | `api-gateway/src/routes/posts.ts` |
| Alerts route (with acknowledge) | ✅ | `api-gateway/src/routes/alerts.ts` |
| Network proxy route | ✅ | `api-gateway/src/routes/network.ts` |
| Reports route | ✅ | `api-gateway/src/routes/reports.ts` |
| Trends route | ✅ | `api-gateway/src/routes/trends.ts` |
| RBAC middleware (Analyst / Admin) | ✅ | `api-gateway/src/auth/rbac.ts` |
| Audit logger | ✅ | `api-gateway/src/middleware/audit-logger.ts` |
| React dashboard (8 pages) | ✅ | `dashboard/src/pages/*.tsx` |
| Search Results page | ✅ | `dashboard/src/pages/SearchResults.tsx` |
| Watchlist Manager page (Admin-only) | ✅ | `dashboard/src/pages/WatchlistManager.tsx` |
| Dark/Light theme toggle | ✅ | `dashboard/src/ThemeContext.tsx`, `dashboard/src/styles/index.css` |
| SearchBar component | ✅ | embedded in `dashboard/src/components/Sidebar.tsx` |
| Data Mode Badge (live/fixture) | ✅ | embedded in `dashboard/src/components/Sidebar.tsx` |
| Reusable components | ✅ | `dashboard/src/components/*.tsx` |
| Socket.IO live alerts | ✅ | `dashboard/src/` (integrated in pages) |
| Global search route | ✅ | `api-gateway/src/routes/search.ts` |
| Watchlist proxy route | ✅ | `api-gateway/src/routes/watchlist.ts` |
| Watchlist REST API (ingestion) | ✅ | `ingestion/api/watchlist_api.py` |

---

## Layer 5: Reporting

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| Report generator (PDF, DOCX, JSON) | ✅ | `reporting/generate_report.py` |
| Escalation notice template (Jinja2) | ✅ | `reporting/templates/incident_report_template.py` |

---

## Infrastructure & DevOps

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| Docker Compose (all 12 services) | ✅ | `docker-compose.yml` |
| NLP Engine Dockerfile | ✅ | `infra/nlp_engine.Dockerfile` |
| Network Service Dockerfile | ✅ | `infra/network_analysis.Dockerfile` |
| Prometheus config (all scrape targets) | ✅ | `infra/prometheus/prometheus.yml` |
| Grafana dashboard (7 panels) | ✅ | `infra/grafana/provisioning/dashboards/netra-overview.json` |
| Grafana datasource provisioning | ✅ | `infra/grafana/provisioning/datasources/datasource.yml` |
| PostgreSQL init script | ✅ | `ingestion/watchlist/watchlist_schema.sql` |

---

## Shared Contracts & Schemas

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| Post schema (raw-posts topic) | ✅ | `shared/schemas/post_schema.json` |
| Threat classification schema (classified-posts topic) | ✅ | `shared/schemas/threat_classification_schema.json` |
| Alert schema (alerts topic) | ✅ | `shared/schemas/alert_schema.json` |
| Network service API schema | ✅ | `shared/schemas/network_service_api.json` |

---

## Documentation

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| GAP_REPORT.md | ✅ | `GAP_REPORT.md` |
| MIGRATION_NOTES.md | ✅ | `MIGRATION_NOTES.md` |
| KPI_REPORT.md | ✅ | `KPI_REPORT.md` |
| DELIVERABLES_STATUS.md | ✅ | `DELIVERABLES_STATUS.md` (this file) |
| BIAS_REVIEW_NOTES.md | ✅ | `BIAS_REVIEW_NOTES.md` |
| README.md | ✅ | `README.md` |
| .env.example | ✅ | `.env.example` |

---

## Testing

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| Integration test suite (16 tests) | ✅ | `integration_test.py` |
| Unit tests (schema, heuristic, language ID, etc.) | ✅ | `tests/` directory |
| Fixture data (posts, classified, alerts, bot scores) | ✅ | `fixtures/` directory |

---

## Summary

| Category | Total | Done | Pending |
|----------|-------|------|---------|
| Ingestion | 18 | 18 | 0 |
| NLP Engine | 20 | 17 | 3 (need trained model) |
| Network Analysis | 8 | 8 | 0 |
| Dashboard & API | 25 | 25 | 0 |
---

## 21-Objective Tier Upgrade Pass (July 2026)

| Tier | Objective | Status | Implementation File(s) |
|------|-----------|--------|------------------------|
| **Tier 1** | 1. Add Kibana service | ✅ | `docker-compose.yml`, `infra/kibana/export.ndjson` |
| **Tier 1** | 2. Video support (Shorts/Reels) | ✅ | `bonus_multimodal/video_frame_analysis.py`, `inference_service.py` |
| **Tier 1** | 3. Scrapy vs Playwright dual strategy | ✅ | `ingestion/connectors/scrapy_spider.py`, `scraper.py` |
| **Tier 1** | 4. Real Login & JWT Authentication | ✅ | `ingestion/watchlist/users_schema.sql`, `jwt-auth.ts`, `Login.tsx` |
| **Tier 2** | 5. GPU Model Training Runbook | ⚠️ BLOCKED | `RUNBOOK_FOR_GPU_TRAINING.md` (no GPU available; step-by-step Colab runbook provided) |
| **Tier 2** | 6. Explainable AI ("Why was this flagged?") | ✅ | `nlp_engine/inference/explainer.py`, `threat_classification_schema.json` |
| **Tier 2** | 7. Confusion Matrix Visualization | ✅ | `nlp_engine/models/evaluate.py`, `dashboard/src/pages/ModelPerformance.tsx` |
| **Tier 2** | 8. Rate-Limit & Circuit Breaker Dashboard | ✅ | `infra/grafana/provisioning/dashboards/rate-limits.json` |
| **Tier 3** | 9. GenAI Daily Incident Briefing | ✅ | `ingestion/scheduler/daily_briefing.py`, `api-gateway/src/routes/briefing.ts` |
| **Tier 3** | 10. Historical Case-Linking (FAISS) | ✅ | `nlp_engine/inference/vector_store.py` |
| **Tier 3** | 11. Deepfake Image Detection | ✅ | `bonus_multimodal/deepfake_detector.py` |
| **Tier 3** | 12. Multi-Language Expansion (mr, bn, pa) | ✅ | `language_id.py`, `threat_classification_schema.json` |
| **Tier 3** | 13. Public Telegram Channel Monitoring | ✅ | `ingestion/connectors/telegram.py` |
| **Tier 3** | 14. Mobile Push Notifications | ✅ | `api-gateway/src/routes/notifications.ts` |
| **Tier 3** | 15. Multi-Tenant Jurisdiction Filtering | ✅ | `ingestion/watchlist/watchlist_schema.sql`, `FilterBar.tsx` |
| **Tier 3** | 16. A/B Testing for Classifiers | ✅ | `nlp_engine/inference/ab_router.py` |
| **Tier 3** | 17. Hash-Chain Evidence Audit Trail | ✅ | `reporting/evidence_chain.py` |
| **Tier 3** | 18. I4C National Portal Integration Stub | ✅ | `ingestion/connectors/i4c_integration_stub.py` |
| **Tier 4** | 19. Guided Walkthrough Tour | ✅ | `dashboard/src/components/GuidedTour.tsx` |
| **Tier 4** | 20. Consolidated System Health Page | ✅ | `dashboard/src/pages/SystemHealth.tsx`, `routes/health-metrics.ts` |
| **Feature**| 21. Cascading Geo Filter (Country→State→City)| ✅ | `post_schema.json`, `routes/geo.ts`, `FilterBar.tsx` |
| **Feature**| 22. API Quota Mock Fallback Generator | ✅ | `api-gateway/src/routes/live-fetch.ts` |
| **Feature**| 23. Live Data UI Auto-Refresh Timer | ✅ | `dashboard/src/pages/Dashboard.tsx`, `GeoMapView.tsx` |
