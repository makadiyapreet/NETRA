# NETRA — GAP REPORT

**Project:** PS05 Threat Analyzer (ERH26_PS_05)  
**Date:** 2024-07-24  
**Phase:** A — Audit & Complete  

---

## 1. Executive Summary

Complete audit of the NETRA repository against the target structure and shared contract. 
**22 gaps identified, all resolved.** The system was approximately 80% complete before 
this audit; the remaining 20% has been built and integrated.

---

## 2. Gaps Found & Resolutions

### 2.1 Critical Gaps (Built from Scratch)

| # | Component | File | Gap | Resolution |
|---|-----------|------|-----|------------|
| 1 | API Gateway | `kafka-consumer.ts` | **Entirely missing** — no Kafka consumer; gateway was fixture-only | ✅ Built: Full KafkaJS consumer for `classified-posts`, `alerts`, `trend-spikes` topics with MODE switch |
| 2 | API Gateway | `elasticsearch-client.ts` | **Entirely missing** — no search indexing | ✅ Built: ES client with index creation, filtered search, pagination, data-retention purge |
| 3 | Reporting | `generate_report.py` | **Entire layer missing** — no report generation | ✅ Built: PDF (ReportLab), DOCX (python-docx), JSON output with threat breakdown |
| 4 | Reporting | `templates/incident_report_template.py` | **Entirely missing** — no escalation templates | ✅ Built: Jinja2 escalation notices with severity-triggered actions, brief alerts for SMS/webhook |
| 5 | Integration | `integration_test.py` | **Entirely missing** — no E2E test | ✅ Built: 16-test suite covering all services, schema validation, RBAC, fixture data |
| 6 | NLP Engine | `mbert_classifier.py` | No mBERT classifier (PS-mandated baseline) | ✅ Built: Dedicated `bert-base-multilingual-cased` classifier for benchmarking |
| 7 | Ingestion | `connectors/scraper.py` | Was a non-functional stub (just logged and returned `[]`) | ✅ Rebuilt: Full Playwright scraper with robots.txt, rate-limiting, BeautifulSoup extraction |

### 2.2 Infrastructure Gaps

| # | Component | Gap | Resolution |
|---|-----------|-----|------------|
| 8 | Docker Compose | Missing Redis service | ✅ Added: `redis:7-alpine` with persistence |
| 9 | Docker Compose | Missing PostgreSQL service | ✅ Added: `postgres:16-alpine` with watchlist schema auto-init |
| 10 | Docker Compose | Missing Elasticsearch service | ✅ Added: `elasticsearch:8.12.0` with security disabled for demo |
| 11 | Docker Compose | Missing Prometheus service | ✅ Added: `prom/prometheus:v2.49.0` with all scrape targets |
| 12 | Docker Compose | Missing Grafana service | ✅ Added: `grafana/grafana:10.2.3` with dashboard provisioning |
| 13 | Prometheus | Only scraped ingestion, not NLP/Network | ✅ Updated: Scrapes all 3 application services |
| 14 | Grafana | No provisioned dashboard | ✅ Built: 7-panel dashboard (ingestion rate, dedup, latency, alerts, errors, crawl duration, spikes) |

### 2.3 Structural Gaps (Aliases Created)

| # | Target Path | Actual Location | Resolution |
|---|-------------|-----------------|------------|
| 15 | `ingestion/watchlist/watchlist_schema.sql` | Did not exist | ✅ Created: Full PostgreSQL DDL with seed data |
| 16 | `ingestion/watchlist/watchlist_manager.py` | `ingestion/db/watchlist_crud.py` | ✅ Created: Wrapper re-exporting CRUD with session-managed API |
| 17 | `ingestion/dedup/redis_dedup.py` | `ingestion/redis_client.py` | ✅ Created: Thin wrapper re-exporting dedup operations |
| 18 | `nlp_engine/training/*.py` | `nlp_engine/models/*.py`, `nlp_engine/datasets/*.py` | ✅ Created: Re-export modules in `training/` directory |
| 19 | `nlp_engine/active_learning/uncertainty_sampler.py` | `nlp_engine/inference/uncertainty_sampler.py` | ✅ Created: Re-export module |

### 2.4 Configuration & Documentation

| # | Component | Gap | Resolution |
|---|-----------|-----|------------|
| 20 | API Gateway | `package.json` missing `kafkajs` and `@elastic/elasticsearch` | ✅ Updated |
| 21 | API Gateway | `server.ts` had no Kafka/ES wiring | ✅ Updated: MODE switch, graceful shutdown |
| 22 | `.env.example` | Missing some infra vars | Already covers all needed env vars ✅ |

---

## 3. Structural Note

The existing codebase uses Python-style directory names (`nlp_engine`, `network_analysis`) while
the target structure uses kebab-case (`nlp-engine`, `network-analysis`). **We did NOT rename** the
working directories (would break all Python imports). Instead, the target-expected files were
created in the actual directories. The code is functionally equivalent and all imports work.

---

## 4. What Was NOT Changed

Per the preservation rules:
- All existing working connectors (Twitter, YouTube, Meta) — **untouched**
- All NLP classifiers (IndicBERT, Sarvam, sentiment) — **untouched**
- All network analysis (bot scorer, near-duplicate, graph ETL, community detection) — **untouched**
- All dashboard pages and components — **untouched**
- All fixture data files — **untouched**
- All shared schemas — **untouched**
- All existing tests — **untouched**
