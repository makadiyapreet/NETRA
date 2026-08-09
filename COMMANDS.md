# NETRA — Individual Service Commands Reference

> Use these commands when you want to run services **individually** instead of using `./run_offline.sh`.
> Always run from the project root directory: `cd ~/Documents/Codes/Projects/NETRA`

---

## Prerequisites (One-Time Setup)

```bash
# 1. Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install Node.js dependencies (API Gateway)
cd api-gateway && npm install && cd ..

# 4. Install Node.js dependencies (Dashboard)
cd dashboard && npm install && cd ..

# 5. Copy environment file and configure API keys
cp .env.example .env
# Edit .env with your API credentials (YouTube, Telegram, Sarvam, Groq, etc.)

# 6. Pre-compile API Gateway TypeScript (do this once, or after code changes)
cd api-gateway && npx tsc && cd ..
```

---

## Starting Services Individually

**IMPORTANT:** Always activate the Python virtual environment first:
```bash
source .venv/bin/activate
```

### 1. NLP Engine (Port 8000)
```bash
# Start NLP Engine — Zero-Shot LLM threat classifier
python -m uvicorn nlp_engine.inference.inference_service:app --host 0.0.0.0 --port 8000

# Or run in background:
python -m uvicorn nlp_engine.inference.inference_service:app --host 0.0.0.0 --port 8000 &

# Health check:
curl http://localhost:8000/health

# Test classification:
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"post_id":"test-1","platform":"twitter","text":"This is a test post about safety in Ahmedabad"}'
```

### 2. Network Analysis Service (Port 8001)
```bash
# Start Network Analysis — Bot detection & graph analytics
python -m uvicorn network_analysis.api.network_service:app --host 0.0.0.0 --port 8001

# Or run in background:
python -m uvicorn network_analysis.api.network_service:app --host 0.0.0.0 --port 8001 &

# Health check:
curl http://localhost:8001/health
```

### 3. Watchlist API (Port 8002)
```bash
# Start Watchlist API — keyword/hashtag/profile management
python -m uvicorn ingestion.api.watchlist_api:app --host 0.0.0.0 --port 8002

# Or run in background:
python -m uvicorn ingestion.api.watchlist_api:app --host 0.0.0.0 --port 8002 &

# Health check:
curl http://localhost:8002/health
```

### 4. API Gateway (Port 4000)
```bash
# Option A: Run pre-compiled JavaScript (RECOMMENDED — fast, no compilation delay)
cd api-gateway && node dist/server.js

# Option B: Run with ts-node-dev (slower startup, but auto-reloads on code changes)
cd api-gateway && npm run dev

# Health check:
curl http://localhost:4000/api/health

# Test live data fetch:
curl -X POST http://localhost:4000/api/live/fetch \
  -H "Content-Type: application/json" \
  -d '{"query":"breaking news Gujarat","platforms":["youtube","telegram"]}'
```

### 5. Dashboard (Port 5173)
```bash
# Start React Dashboard
cd dashboard && npm run dev

# Open in browser:
open http://localhost:5173
```

---

## Quick All-In-One (Background Mode)

```bash
# Start all 5 services in background from a single terminal
source .venv/bin/activate

python -m uvicorn nlp_engine.inference.inference_service:app --port 8000 &
python -m uvicorn network_analysis.api.network_service:app --port 8001 &
python -m uvicorn ingestion.api.watchlist_api:app --port 8002 &
(cd api-gateway && node dist/server.js) &
(cd dashboard && node node_modules/vite/bin/vite.js) &

echo "All services starting... wait ~30s for NLP model loading"
```

---

## Stopping Services

```bash
# Stop ALL NETRA services (recommended):
./run_offline.sh stop

# Or manually kill by port:
lsof -ti :8000 | xargs kill -9    # NLP Engine
lsof -ti :8001 | xargs kill -9    # Network API
lsof -ti :8002 | xargs kill -9    # Watchlist API
lsof -ti :4000 | xargs kill -9    # API Gateway
lsof -ti :5173 | xargs kill -9    # Dashboard

# Kill all at once:
for port in 8000 8001 8002 4000 5173; do lsof -ti :$port | xargs kill -9 2>/dev/null; done
```

---

## Health Check All Services

```bash
echo "NLP Engine:    " && curl -s http://localhost:8000/health | python3 -m json.tool
echo "Network API:   " && curl -s http://localhost:8001/health | python3 -m json.tool
echo "Watchlist API: " && curl -s http://localhost:8002/health | python3 -m json.tool
echo "API Gateway:   " && curl -s http://localhost:4000/api/health | python3 -m json.tool
echo "Dashboard:     " && curl -sI http://localhost:5173 | head -1
```

---

## Diagnostics

```bash
# Full diagnostic report:
./run_offline.sh doctor

# Check which ports are occupied:
for port in 8000 8001 8002 4000 5173; do
  echo -n "Port $port: "
  lsof -ti :$port 2>/dev/null && echo "(occupied)" || echo "free"
done
```

---

## Login Credentials (Development)

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@netra.gov.in` | `netra2026` |
| **Analyst** | `analyst@netra.gov.in` | `analyst2026` |

---

## Service Architecture

```
Port 8000 ─── NLP Engine (Python/FastAPI)        ─── Zero-Shot LLM Classification
Port 8001 ─── Network Analysis (Python/FastAPI)   ─── Bot Detection & Graph Analytics
Port 8002 ─── Watchlist API (Python/FastAPI)       ─── Keyword/Profile Management
Port 4000 ─── API Gateway (Node.js/Express)        ─── REST API + WebSocket + Live Fetch
Port 5173 ─── Dashboard (React/Vite)               ─── Command Center UI
```
