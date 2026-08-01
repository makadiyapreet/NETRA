# NETRA — GAP REPORT

**Project:** NETRA (ERH26_PS_05)  
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

---

## 5. Phase B — Upgrade Pass (July 2026)

5 additional gaps identified and resolved in the upgrade pass:

| # | Objective | Gap | Resolution |
|---|-----------|-----|------------|
| 23 | Real Data Default | System defaulted to `MODE=fixture` everywhere | ✅ Flipped to `MODE=kafka` in 4 files: `nlp_engine/config.py`, `server.ts`, `kafka-consumer.ts`, `run_demo.py` |
| 24 | Dark/Light Theme | Dashboard was dark-only, no theme toggle | ✅ Built: `ThemeContext.tsx`, light-mode CSS variables, theme toggle in Sidebar, persistent via localStorage |
| 25 | Global Search | No unified keyword search across entities | ✅ Built: `GET /api/search` route + `SearchResults.tsx` page querying posts, alerts, trends, clusters |
| 26 | Watchlist UI | Watchlist CRUD had no HTTP API or frontend | ✅ Built: `watchlist_api.py` (FastAPI on :8002), `routes/watchlist.ts` (proxy), `WatchlistManager.tsx` (Admin-only) |
| 27 | MuRIL Classifier | MuRIL referenced in benchmarks but no implementation | ✅ Built: `muril_classifier.py`, `train_muril.py`, updated `evaluate.py` and `inference_service.py` |

---

## 6. Phase C — Architecture Transparency & Master Fix (July 2026)

2 additional architectural gaps and ethical corrections resolved:

| # | Objective | Gap | Resolution |
|---|-----------|-----|------------|
| 28 | Benchmark Transparency | Previous README claimed 89% accuracy on fine-tuned models, but `checkpoints/` was empty. | ✅ Architectural Pivot: Removed all claims of fine-tuned transformers. Shifted NLP Engine to a **Zero-Shot LLM Prompting** architecture using Sarvam AI and Groq. |
| 29 | Pipeline Integrity | Live data was being fetched but not piped into DataStore/Dashboard in real-time. | ✅ Built: Master fix in `live-fetch.ts` to fetch, classify (via LLM), generate alerts, generate trend spikes, and push to `DataStore` seamlessly. |

---

## 7. Phase D — Honesty & Real-Data Pass (July 2026)

6 critical integrity gaps discovered and resolved. This pass focused on eliminating all fake-but-presented-as-real data from the pipeline.

| # | Objective | Gap | Resolution |
|---|-----------|-----|------------|
| 30 | Remove Silent Mock Fallback | `live-fetch.ts` silently generated 10 fake posts (source: `mock_live`) when Twitter API returned 403. These were indistinguishable from real data on the dashboard. Background poller triggered this every 15s, flooding DataStore with hundreds of fake posts. | ✅ **Removed entirely.** Mock generator deleted. On 403/429/402, function returns empty array with clear diagnostic log. Added `is_synthetic` field to post schema for future use. |
| 31 | Badge Synthetic Data | Fixture data loaded via `mock_data.json` appeared identical to real data in the UI. No visual indicator anywhere. | ✅ **Full badge system.** All fixture posts marked `is_synthetic: true`. `PostCard.tsx` shows orange "SIMULATED" badge with flask icon and left-border styling. `WatchlistManager.tsx` matched posts also badged. |
| 32 | Twitter/X Zero Results | Twitter search returned zero results, masked by the mock fallback generating fake data. | ✅ **Root cause identified:** X Free tier API does NOT include search access (since 2023). Requires Basic tier ($100/mo). Added clear tier-specific error messages. Background poller now excludes Twitter. |
| 33 | Meta Scraper Fallback | `META_ACCESS_TOKEN` is empty (expected). No automatic fallback to scraper when Graph API unavailable. | ✅ **Wired scraper fallback** in `live-fetch.ts`. When no Graph API token, system attempts public Facebook page scraping. Reports honestly when scraping fails (Facebook requires login for most content). |
| 34 | Watchlist Data Flow | `GET /api/watchlist` silently returned hardcoded `FIXTURE_WATCHLIST` when upstream API (port 8002) was unreachable, presenting fake data as real. Matches endpoint limited to 1000 posts. | ✅ **Removed silent fallback.** Returns 503 with clear error message. Matches endpoint now searches all 10K posts. Added auto-refresh, synthetic badges, and post_url links. |
| 35 | No-Docker Real Data | `MODE=offline` loaded fixture data into DataStore AND fetched live data, mixing real and fake. Background poller polled all 48 Indian locations every 15s, burning API quota. | ✅ **Fixed.** `MODE=offline` now starts with empty DataStore (real data only). `MODE=fixture` is the only way to get demo data. Background poller focused on Gujarat per PS scope, interval increased to 60s. Sidebar badge correctly shows "Live APIs (No Docker)". |

**Total gaps: 35 found, 35 resolved.**

---

## 8. Phase E — Repo/Report Drift Audit (August 1, 2026)

Identified and resolved discrepancies between the pushed GitHub state (July 26 commit)
and the local working copy (July 31+). This audit ensures the codebase matches
its own documentation and that no silent data fabrication occurs.

| # | Issue | Gap | Resolution |
|---|-------|-----|------------|
| 36 | Silent fixture fallback in `GET /api/watchlist` | Route returned hardcoded `FIXTURE_WATCHLIST` on any upstream error or empty result. Report Section 12.4 claimed this was "removed and replaced with 503" — but the `hasData` check caused empty-but-live watchlists to fall through to fixture path. | ✅ `FIXTURE_WATCHLIST` constant deleted entirely. Route returns upstream data as-is (even if empty). Returns 503 only when upstream is genuinely unreachable. |
| 37 | Startup script lies about health | `run_offline.sh` used `sleep 3` then unconditionally printed "All services running!" regardless of actual startup status. | ✅ Replaced with per-service health-check polling via `curl`. Only prints success when each service's `/health` endpoint actually responds 200. Reports failures with log paths. |
| 38 | Frontend doesn't check `res.ok` | `WatchlistManager.tsx` `fetchWatchlist()` called `.json()` on every response including 503 errors, shoving error bodies into data state. | ✅ Fixed to gate on `res.ok`. 503 now correctly sets `serviceError` state and clears data. |
| 39 | Model Performance presents mock metrics as real | Page shows IndicBERT 86%, MuRIL 89% etc. with confusion matrix. No trained checkpoints exist (Zero-Shot LLM is the active architecture). Numbers generated by `Math.random()` in `generateMockConfusion()`. | ✅ Relabeled as "Benchmark Targets — Not Live Measurements" with prominent warning banner. Zero-Shot marked as ACTIVE model. Non-active models show "(target)" suffix on all metric labels. |
| 40 | SystemHealth hardcodes all services as healthy | All 12 services shown with green dots regardless of actual state. Metrics (42.5 msg/s, 12ms lag) are fixed constants. | ✅ Replaced with real live health checks that ping each service endpoint. Shows actual data mode, distinguishes app services from Docker-only infrastructure. |
| 41 | Sarvam API 404 | `zeroshot_classifier.py` used wrong endpoint URL (`/chat/completions` instead of `/v1/chat/completions`), wrong auth header, and wrong model name. All classifications fell through to Groq fallback. | ✅ Fixed URL to `/v1/chat/completions`, auth to `api-subscription-key` header, model to `sarvam-m4`. |
| 42 | Watchlist API missing `/health` | `ingestion/api/watchlist_api.py` had no health endpoint, making startup verification impossible. | ✅ Added `GET /health` endpoint returning status and database connection mode. |
| 43 | `SIMULATOR_MODE` defaults to `true` | `ingestion/config.py` defaulted `SIMULATOR_MODE` to `true`, meaning the ingestion layer would silently use synthetic data if someone ran it directly. | ✅ Changed default to `false`. Simulator posts now also set `is_synthetic: true` on every generated `PostMessage`. |
| 44 | Broken import in `tasks.py` | `from ingestion.connectors.scraper import ScraperConnector` — class doesn't exist (actual name is `FallbackScraper`). Would cause ImportError if ingestion scheduler was run. | ✅ Fixed import. Wired scraper as automatic fallback when `META_ACCESS_TOKEN` is absent. |
| 45 | `network.ts` silent fixture fallback | `FIXTURE_CLUSTERS` (3 fake bot rings) and `FIXTURE_BOT_SCORES` (15 fake accounts) silently returned when Python network service was down. Exact same anti-pattern as watchlist. | ✅ Deleted all fixture data. Routes now return 503 on upstream failure. Added real DataStore-based bot heuristic scoring. |
| 46 | `health-metrics.ts` all-healthy lie | All 12 services hardcoded as `"healthy"`. Performance numbers (42.5 msg/s, 12ms lag) were fixed constants, not measured. | ✅ Replaced with real per-service health pings. Shows actual DataStore counts and honest API rate limit status. |
| 47 | `briefing.ts` fabricated post count | Daily briefing multiplied alert count by 50 to fake "posts processed" number. A system with 5 alerts would claim 250 posts processed. | ✅ Replaced with actual DataStore post count. |
| 48 | `live-fetch.ts` broken FIXTURE_WATCHLIST import | `live-fetch.ts` imported and used `FIXTURE_WATCHLIST` from `watchlist.ts` for alert matching. After removing the constant (gap #36), this became a build-breaking error. Also meant watchlist matching was always against hardcoded data, not the user's real watchlist. | ✅ Replaced with live API call to watchlist service (port 8002). Graceful degradation if service is down. |
| 49 | `NetworkView.tsx` fabricated bot scores | When bot-score API call failed, frontend fabricated `bot_likelihood: 0.85` with fake indicators `['rapid_retweets', 'similar_captions']`. Used `|| 0.5` fallback everywhere, showing 50% for unavailable data. | ✅ Unavailable scores now show "N/A" in gray. No fabricated numbers. |
| 50 | Twitter shows "Connected" (misleading) | Dashboard shows a green dot with "Connected" for Twitter when Bearer Token exists, even though Free tier can't search. A judge would think Twitter search works. | ✅ Shows yellow dot with "Auth Only (Free tier — no search)" when warning flag is present. Green only when no warning. |
| 51 | `server.ts` MODE defaults to `'kafka'` | When no `MODE` env var is set (e.g. running `npm run dev` directly without the startup script), server defaults to Kafka mode — tries to connect to non-existent Docker Kafka. | ✅ Changed default to `'offline'`. Matches `run_offline.sh` and the no-Docker workflow. |
| 52 | `kafka-consumer.ts` MODE defaults to `'kafka'` | Same issue — defaults to Kafka, tries to connect to Docker infra that doesn't exist. | ✅ Changed default to `'offline'`. |

**Total gaps: 52 found, 52 resolved.**
