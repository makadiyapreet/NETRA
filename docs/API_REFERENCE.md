# 🔌 NETRA — API Reference

## Authentication

All API endpoints (except `/api/auth/login` and `/api/health`) require authentication via the `X-User-Role` header:

```
X-User-Role: Admin       # Full access
X-User-Role: Analyst     # Read-only access (no report generation, no watchlist edits)
```

In Docker/production mode, JWT tokens are used instead:
```
Authorization: Bearer <jwt_token>
```

---

## Base URLs

| Service | Base URL | Port |
|---|---|---|
| API Gateway | `http://localhost:4000/api` | 4000 |
| NLP Engine | `http://localhost:8000` | 8000 |
| Network Analysis | `http://localhost:8001` | 8001 |
| Watchlist API | `http://localhost:8002` | 8002 |

---

## API Gateway Endpoints (`:4000`)

### Authentication

#### `POST /api/auth/login`
Authenticate and receive a JWT token.

**Request:**
```json
{
  "email": "admin@netra.gov.in",
  "password": "netra2026"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "email": "admin@netra.gov.in",
    "role": "Admin",
    "full_name": "System Admin"
  }
}
```

#### `POST /api/auth/signup`
Self-service user registration.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "full_name": "John Doe",
  "role": "Analyst",
  "agency": "Ahmedabad Crime Branch"
}
```

---

### Posts

#### `GET /api/posts`
List classified posts with optional filters.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `page` | int | Page number (default: 1) |
| `size` | int | Page size (default: 50) |
| `language` | string | Filter by language code (`gu`, `hi`, `en`) |
| `threat_category` | string | Filter by category |
| `platform` | string | Filter by platform |
| `q` | string | Full-text keyword search |

**Response (200):**
```json
{
  "data": [
    {
      "post_id": "YT-LIVE-abc123",
      "platform": "youtube",
      "text": "Post content...",
      "threat_category": "Inflammatory",
      "threat_confidence": 0.87,
      "sentiment": "negative",
      "detected_language": "hi",
      "geo_location": { "lat": 23.02, "lng": 72.57, "city": "Ahmedabad" }
    }
  ],
  "total": 234,
  "page": 1,
  "size": 50
}
```

---

### Alerts

#### `GET /api/alerts`
List threat alerts with severity filter.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `severity` | int | Minimum severity (1-5) |
| `acknowledged` | boolean | Filter by acknowledgment status |

#### `POST /api/alerts/:id/acknowledge`
Mark an alert as acknowledged by an analyst.

---

### Live Data Fetching

#### `POST /api/live/fetch`
Fetch real social media posts, classify them, and store results.

**Request:**
```json
{
  "query": "protest Gujarat",
  "platforms": ["youtube", "telegram", "twitter"]
}
```

**Response (200):**
```json
{
  "query": "protest Gujarat",
  "total": 12,
  "new_posts": 10,
  "errors": ["Twitter: credits depleted"],
  "throughput": {
    "total_ms": 305623,
    "posts_count": 12,
    "posts_per_second": 0.04
  }
}
```

#### `GET /api/live/status`
Check API connectivity and key pool info.

#### `GET /api/live/key-status`
Per-platform API key health status.

---

### Reports & Legal

#### `POST /api/reports/generate`
Generate an incident report from selected posts.

**Request:**
```json
{
  "post_ids": ["post_1", "post_5", "post_12"],
  "format": "json"
}
```

#### `POST /api/reports/generate-fir`
Generate legal violation analysis with IPC/IT Act section mapping.

**Request:**
```json
{
  "post_ids": ["post_1", "post_5"]
}
```

**Response (200):**
```json
{
  "case_title": "Legal Violation Analysis",
  "sections_violated": [
    { "section": "IPC 153A", "description": "Promoting enmity between groups" },
    { "section": "IT Act 66F", "description": "Cyber terrorism" }
  ],
  "evidence_hash": "sha256:a1b2c3d4..."
}
```

---

### AI Analysis

#### `POST /api/ai/generate-summary`
Generate an AI-powered police-briefing-style summary.

**Request:**
```json
{
  "post_ids": ["post_1", "post_2"],
  "context": "Alert Center"
}
```

#### `POST /api/ai/deepfake-check`
Check if an image is AI-generated.

**Request:**
```json
{
  "image_url": "https://example.com/image.jpg"
}
```

**Response (200):**
```json
{
  "is_ai_generated": true,
  "confidence": 0.89,
  "model_name": "umm-maybe/AI-image-detector",
  "explanation": "Image classified as AI-generated with 89% confidence."
}
```

---

### Network Analysis

#### `GET /api/network/bot-scores`
Bot likelihood scores for all detected accounts.

#### `GET /api/network/communities`
Louvain community clusters from Neo4j graph analysis.

#### `GET /api/network/duplicates`
Near-duplicate post clusters detected via MinHash LSH.

#### `GET /api/network/spread-graph/:postId`
Viral spread graph for a specific post.

#### `GET /api/network/amplification-alerts`
Coordinated amplification detection alerts.

---

### Scheduled Crawls

#### `GET /api/scheduled-crawls`
List all scheduled crawl configurations.

#### `POST /api/scheduled-crawls`
Create a new recurring crawl schedule.

**Request:**
```json
{
  "query": "riot Mumbai",
  "platforms": ["youtube", "telegram"],
  "interval_seconds": 300
}
```

#### `PATCH /api/scheduled-crawls/:id`
Toggle a schedule's enabled/disabled state.

#### `DELETE /api/scheduled-crawls/:id`
Remove a scheduled crawl.

---

### Search & Watchlist

#### `GET /api/search?q=keyword`
Unified search across posts, alerts, trends, and bot clusters.

#### `GET /api/watchlist`
List all watchlist entries.

#### `POST /api/watchlist`
Create new watchlist entry (keyword/hashtag/geo_box/profile).

#### `GET /api/watchlist/matches/:keyword`
Find posts matching a watchlist keyword.

---

### Bhashini (Government of India Translation API)

#### `POST /api/bhashini/translate`
Translate text between languages using Bhashini (ULCA) NMT models.

**Request:**
```json
{
  "text": "Hello, how are you?",
  "source_language": "en",
  "target_language": "hi"
}
```

**Response (200):**
```json
{
  "original": "Hello, how are you?",
  "translated": "नमस्ते, आप कैसे हैं?",
  "source_language": "en",
  "target_language": "hi",
  "task_type": "translation",
  "service_id": "ai4bharat/indictrans-v2-all-gpu--t4",
  "latency_ms": 1250.3,
  "success": true,
  "error": null,
  "provider": "Bhashini (Government of India — MeitY)"
}
```

#### `POST /api/bhashini/transliterate`
Transliterate text between scripts using Bhashini models.

**Request:**
```json
{
  "text": "namaste kaise ho",
  "source_language": "en",
  "target_language": "hi"
}
```

#### `GET /api/bhashini/status`
Check Bhashini API availability and configuration status.

**Response (200):**
```json
{
  "service": "Bhashini (ULCA)",
  "provider": "Government of India — MeitY",
  "available": true,
  "cached_services": 2,
  "supported_languages": ["hi", "gu", "en", "mr", "bn", "pa", "ta", "te", "ml", "kn", "or", "ur"],
  "credentials_configured": true,
  "registration_url": "https://bhashini.gov.in/",
  "cost": "Free (Government API)"
}
```

---

### System

#### `GET /api/health`
Basic health check.

#### `GET /api/health-metrics`
Full system health with per-service latency and status.

#### `GET /api/health/data-mode`
Current data mode (offline/kafka/fixture).

#### `GET /api/briefing/today`
AI-generated daily threat briefing.

#### `GET /api/geo/hierarchy`
Cascading geo filter hierarchy (Country → State → City).

---

## NLP Engine Endpoints (`:8000`)

#### `POST /classify`
Classify a single post.

#### `POST /classify-batch`
Classify multiple posts in batch.

#### `POST /deepfake-check`
Deepfake image detection.

#### `GET /health`
Service health check.

---

## Network Analysis Endpoints (`:8001`)

#### `POST /score-bot`
Score an account for bot likelihood.

#### `POST /find-duplicates`
Find near-duplicate posts via MinHash LSH.

#### `GET /communities`
Louvain community detection results.

#### `GET /health`
Service health check.

---

## Watchlist API Endpoints (`:8002`)

#### `GET /watchlist`
List all watchlist entries.

#### `POST /watchlist`
Create new entry.

#### `PUT /watchlist/:id`
Update entry.

#### `DELETE /watchlist/:id`
Soft-delete entry.

#### `GET /health`
Service health check.
