# 📊 NETRA — Database Schema Documentation

## Overview

NETRA uses a **hybrid data storage** approach:
- **In-Memory DataStore** for real-time operational data (offline/live mode)
- **PostgreSQL** for persistent user accounts, watchlist, and audit logs (Docker/production mode)
- **Elasticsearch 8** for full-text search and indexing (Docker mode)
- **Neo4j** for graph-based network analysis (Docker mode)
- **Redis** for TTL-based deduplication and rate limiting (Docker mode)

---

## 1. Core Data Schemas (JSON Draft-07)

All data flowing through the Kafka pipeline conforms to strict JSON Schema contracts located in `shared/schemas/`.

### 1.1 Post Schema (`post_schema.json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `post_id` | string | ✅ | Globally unique identifier (e.g., `YT-LIVE-abc123-1786425787`) |
| `platform` | enum | ✅ | `twitter` \| `instagram` \| `facebook` \| `youtube` \| `telegram` \| `web` |
| `author_id` | string | ✅ | Platform-specific author identifier |
| `author_handle` | string | ✅ | Public handle / username |
| `text` | string | ✅ | Raw post text content |
| `language_hint` | string? | ❌ | Optional language hint (`gu`, `hi`, `en`, `mixed`) |
| `created_at` | datetime | ✅ | ISO 8601 timestamp |
| `geo_location` | object? | ❌ | `{ lat, lng, place_name, city, state, country }` |
| `hashtags` | string[] | ✅ | Extracted hashtags |
| `mentions` | string[] | ✅ | Mentioned users |
| `media_urls` | string[] | ✅ | Attached image/video URLs |
| `engagement_counts` | object | ✅ | `{ likes, shares, comments, views }` |
| `raw_payload` | object | ✅ | Original API response (preserved for audit) |
| `is_synthetic` | boolean | ❌ | `true` for fixture data, `false` for real API data |

### 1.2 Threat Classification Schema (`threat_classification_schema.json`)

| Field | Type | Description |
|---|---|---|
| `post_id` | string | Reference to source post |
| `threat_category` | enum | `Inflammatory` \| `IncitementToViolence` \| `FakeNews` \| `Neutral` |
| `threat_confidence` | float | 0.0 – 1.0 confidence score |
| `sentiment` | string | `positive` \| `negative` \| `neutral` |
| `sentiment_intensity` | float | 0.0 – 1.0 |
| `detected_language` | string | Detected language code |
| `model_version` | string | Model identifier (e.g., `zeroshot-sarvam-v2`) |
| `classified_at` | datetime | ISO 8601 classification timestamp |

### 1.3 Alert Schema (`alert_schema.json`)

| Field | Type | Description |
|---|---|---|
| `alert_id` | string | Unique alert identifier |
| `post_id` | string | Reference to triggering post |
| `threat_category` | string | Inherited from classification |
| `severity` | int | 1–5 severity score |
| `triggering_reason` | string | Human-readable explanation |
| `bot_cluster_id` | string? | Associated bot cluster (if any) |
| `created_at` | datetime | Alert creation timestamp |
| `acknowledged` | boolean | Whether an analyst has reviewed it |

---

## 2. PostgreSQL Tables (Docker/Production Mode)

### 2.1 `users` Table

```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'Analyst',  -- 'Analyst' | 'Admin'
    full_name     VARCHAR(255),
    agency        VARCHAR(255),
    created_at    TIMESTAMP DEFAULT NOW(),
    last_login    TIMESTAMP
);
```

### 2.2 `watchlists` Table

```sql
CREATE TABLE watchlists (
    id          SERIAL PRIMARY KEY,
    type        VARCHAR(50) NOT NULL,   -- 'keyword' | 'hashtag' | 'geo_box' | 'profile'
    value       TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    enabled     BOOLEAN DEFAULT true,
    created_by  VARCHAR(255),
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    deleted_at  TIMESTAMP              -- Soft delete
);
```

### 2.3 `audit_logs` Table

```sql
CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    action      VARCHAR(100) NOT NULL,  -- 'login' | 'create_watchlist' | 'acknowledge_alert' etc.
    user_name   VARCHAR(255),
    user_role   VARCHAR(20),
    ip_address  VARCHAR(45),
    details     JSONB DEFAULT '{}',
    created_at  TIMESTAMP DEFAULT NOW()
);
```

---

## 3. In-Memory DataStore (Offline Mode)

In `MODE=offline`, the API Gateway uses an in-memory `DataStore` class (`api-gateway/src/data-store.ts`) that provides:

| Collection | Description | Capacity |
|---|---|---|
| `posts` | Classified social media posts | Unbounded (resets on restart) |
| `alerts` | Generated threat alerts | Unbounded |
| `trend_spikes` | Keyword frequency spike timeseries | Unbounded |
| `bot_scores` | Account bot likelihood scores | Unbounded |
| `communities` | Graph community clusters | Unbounded |
| `duplicates` | Near-duplicate post clusters | Unbounded |

The DataStore starts **empty** in offline mode and fills progressively as the background poller fetches real data from YouTube, Telegram, and other APIs.

---

## 4. Elasticsearch Indices (Docker Mode)

| Index | Description |
|---|---|
| `netra-posts` | Full-text searchable classified posts |
| `netra-alerts` | Searchable alert records |

---

## 5. Neo4j Graph Schema (Docker Mode)

### Nodes
- `(:Post {post_id, text, platform, threat_category})`
- `(:Author {author_id, handle, bot_score})`
- `(:Hashtag {tag})`

### Relationships
- `(:Author)-[:POSTED]->(:Post)`
- `(:Post)-[:TAGGED_WITH]->(:Hashtag)`
- `(:Author)-[:MENTIONS]->(:Author)`
- `(:Author)-[:AMPLIFIES]->(:Post)`

### Algorithms
- **Louvain Community Detection**: Groups tightly connected author nodes into communities
- **PageRank**: Identifies high-influence accounts amplifying threat content

---

## 6. Scheduled Crawls (In-Memory)

```typescript
interface CrawlSchedule {
    id: string;               // e.g., "SCH-C7785250"
    query: string;            // Search query
    platforms: string[];      // Target platforms
    interval_seconds: number; // Crawl frequency
    enabled: boolean;
    created_at: string;
    created_by: string;
    last_run_at: string | null;
    next_run_at: string;
    run_count: number;
    last_result: { posts_fetched: number; error?: string } | null;
}
```
