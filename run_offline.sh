#!/bin/bash
# ==============================================================================
# NETRA — Offline / Local Runner Script
# Runs all 5 microservices locally with real model inference (no Docker required).
#
# Usage:
#   ./run_offline.sh           — start all services
#   ./run_offline.sh stop      — stop all running services and clean up ports
#   ./run_offline.sh doctor    — run diagnostics without starting anything
# ==============================================================================

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

LOG_DIR="/tmp/netra_logs"
mkdir -p "$LOG_DIR"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()
VENV_PYTHON="$PROJECT_DIR/.venv/bin/python"

# ── Unified Full Cleanup Function ───────────────────────────────────────────
stop_all_services() {
    echo -e "\n${YELLOW}Stopping all NETRA services & cleaning up...${NC}"

    # 1. Kill tracked child PIDs (graceful first, then force)
    if [ ${#PIDS[@]} -gt 0 ]; then
        for pid in "${PIDS[@]}"; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
            fi
        done
        sleep 1
        for pid in "${PIDS[@]}"; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi

    # 2. Kill PIDs recorded in PID files
    for pidfile in "$LOG_DIR"/*.pid; do
        [ -f "$pidfile" ] || continue
        old_pid=$(cat "$pidfile" 2>/dev/null)
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            kill -9 "$old_pid" 2>/dev/null || true
        fi
        rm -f "$pidfile"
    done

    # 3. Kill all processes listening on NETRA ports (8000, 8001, 8002, 4000, 5173)
    for port in 8000 8001 8002 4000 5173; do
        pids=$(lsof -ti :$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    done

    # 4. Kill any detached zombie NETRA processes by matching command patterns
    for pattern in "uvicorn nlp_engine" "uvicorn network_analysis" "uvicorn ingestion" "ts-node-dev.*server.ts" "vite/bin/vite.js" "node dist/server.js"; do
        stale_pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ -n "$stale_pids" ]; then
            echo "$stale_pids" | xargs kill -9 2>/dev/null || true
        fi
    done

    echo -e "${GREEN}✓ All NETRA processes stopped and ports cleared.${NC}"
}



# ── Stop Mode ────────────────────────────────────────────────────────────────
if [ "${1:-}" = "stop" ]; then
    stop_all_services
    exit 0
fi

# ── Doctor Mode ──────────────────────────────────────────────────────────────
if [ "${1:-}" = "doctor" ]; then
    echo -e "${CYAN}=== NETRA Startup Diagnostic ===${NC}"
    echo ""

    echo -e "${CYAN}-- Port occupancy --${NC}"
    for port in 8000 8001 8002 4000 5173; do
        pid=$(lsof -ti :$port 2>/dev/null | head -n 1 || true)
        if [ -n "$pid" ]; then
            cmd=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
            echo -e "  Port $port: ${RED}OCCUPIED${NC} by pid $pid ($cmd)"
        else
            echo -e "  Port $port: ${GREEN}free${NC}"
        fi
    done

    echo ""
    echo -e "${CYAN}-- PID files --${NC}"
    found_pids=false
    for pidfile in "$LOG_DIR"/*.pid; do
        [ -f "$pidfile" ] || continue
        found_pids=true
        svc=$(basename "$pidfile" .pid)
        stored_pid=$(cat "$pidfile" 2>/dev/null)
        if [ -n "$stored_pid" ] && kill -0 "$stored_pid" 2>/dev/null; then
            echo -e "  $svc: ${GREEN}running${NC} (pid $stored_pid)"
        else
            echo -e "  $svc: ${YELLOW}stale${NC} (pid $stored_pid, not running)"
        fi
    done
    if [ "$found_pids" = false ]; then
        echo "  No PID files found."
    fi

    echo ""
    echo -e "${CYAN}-- Environment --${NC}"
    if [ -f "$VENV_PYTHON" ]; then
        echo "  venv Python: $("$VENV_PYTHON" --version 2>&1)"
    else
        echo -e "  ${RED}.venv/bin/python not found!${NC}"
    fi
    echo "  System Python: $(python3 --version 2>&1)"
    echo "  Node: $(node --version 2>&1)"



    echo ""
    echo -e "${CYAN}-- Health checks (if services are running) --${NC}"
    for pair in "NLP Engine|http://localhost:8000/health" \
                "Network API|http://localhost:8001/health" \
                "Watchlist API|http://localhost:8002/health" \
                "API Gateway|http://localhost:4000/api/health" \
                "Dashboard|http://localhost:5173"; do
        name="${pair%%|*}"
        url="${pair##*|}"
        if curl -sf --max-time 3 "$url" > /dev/null 2>&1; then
            echo -e "  $name: ${GREEN}✓ healthy${NC}"
        else
            echo -e "  $name: ${YELLOW}✗ not responding${NC}"
        fi
    done

    echo ""
    echo -e "${CYAN}-- Recent service logs (last 10 lines each) --${NC}"
    found_logs=false
    for f in "$LOG_DIR"/*.log; do
        [ -f "$f" ] || continue
        [ -s "$f" ] || continue
        found_logs=true
        echo -e "  ${CYAN}-- $(basename "$f") --${NC}"
        tail -n 10 "$f" | sed 's/^/    /'
        echo ""
    done
    if [ "$found_logs" = false ]; then
        echo "  No log files found in $LOG_DIR"
    fi

    exit 0
fi

# ── Main Startup ─────────────────────────────────────────────────────────────

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}   NETRA — Starting Local Services (Offline Mode)      ${NC}"
echo -e "${CYAN}======================================================${NC}"

export MODE=${MODE:-offline}
export PYTHONUNBUFFERED=1

# Load .env file so all services inherit API keys (SARVAM_API_KEY, GROQ_API_KEY, etc.)
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a  # auto-export all sourced variables
    # Source .env, skipping comments and blank lines
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue
        # Only export lines that look like KEY=VALUE
        if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            export "$line"
        fi
    done < "$PROJECT_DIR/.env"
    set +a
    echo -e "${GREEN}✓ Loaded environment from .env${NC}"
else
    echo -e "${YELLOW}⚠ No .env file found — services may lack API keys${NC}"
fi

# Check venv exists
if [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${RED}✗ .venv/bin/python not found!${NC}"
    echo -e "  Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi
echo -e "${GREEN}✓ Python venv found: $("$VENV_PYTHON" --version 2>&1)${NC}"



# Pre-compile API Gateway TypeScript to dist (makes gateway startup instant & reliable)
if [ ! -f "api-gateway/dist/server.js" ] || [ "api-gateway/src/server.ts" -nt "api-gateway/dist/server.js" ]; then
    echo -e "${YELLOW}Compiling API Gateway TypeScript → dist/...${NC}"
    (cd api-gateway && npx tsc 2>/dev/null) || true
fi

# ── Pre-launch Cleanup ───────────────────────────────────────────────────────
stop_all_services

# Set trap: SIGINT (Ctrl+C), SIGTERM (kill), SIGHUP (terminal close)
# NOTE: Do NOT trap EXIT — it fires when `wait` returns after a child exits,
# causing a cascading kill of all remaining healthy services.
trap 'stop_all_services; exit 0' SIGINT SIGTERM SIGHUP

# ── Health check poller ──────────────────────────────────────────────────────
wait_for_health() {
    local name="$1" url="$2" logfile="$3" timeout="${4:-30}"
    local waited=0

    echo -ne "  Waiting for ${name}..."
    until curl -sf --max-time 2 "$url" > /dev/null 2>&1; do
        # Check if the process is still alive
        sleep 2
        waited=$((waited + 2))
        if [ "$waited" -ge "$timeout" ]; then
            echo -e " ${RED}✗ TIMEOUT after ${timeout}s${NC}"
            if [ -s "$logfile" ]; then
                echo -e "${RED}--- last 20 lines of $(basename "$logfile") ---${NC}"
                tail -n 20 "$logfile" 2>/dev/null | sed 's/^/    /'
                echo -e "${RED}-------------------------------------------${NC}"
            fi
            return 1
        fi
    done
    echo -e " ${GREEN}✓ ready (${waited}s)${NC}"
    return 0
}

echo -e "\n${CYAN}Starting Microservices (MODE=${MODE})...${NC}"

# ── Launch services using ABSOLUTE venv python path ─────────────────────────
# Using $VENV_PYTHON instead of "python" avoids issues with PATH/activate

# 1. NLP Engine (Port 8000)
echo -e "Starting ${GREEN}NLP Engine${NC} on port 8000..."
> "$LOG_DIR/nlp.log"
"$VENV_PYTHON" -m uvicorn nlp_engine.inference.inference_service:app --host 0.0.0.0 --port 8000 >> "$LOG_DIR/nlp.log" 2>&1 &
NLP_PID=$!
PIDS+=($NLP_PID)
echo "$NLP_PID" > "$LOG_DIR/nlp.pid"

# 2. Network Analysis Service (Port 8001)
echo -e "Starting ${GREEN}Network Analysis Service${NC} on port 8001..."
> "$LOG_DIR/network.log"
"$VENV_PYTHON" -m uvicorn network_analysis.api.network_service:app --host 0.0.0.0 --port 8001 >> "$LOG_DIR/network.log" 2>&1 &
NET_PID=$!
PIDS+=($NET_PID)
echo "$NET_PID" > "$LOG_DIR/network.pid"

# 3. Watchlist API (Port 8002)
echo -e "Starting ${GREEN}Watchlist API${NC} on port 8002..."
> "$LOG_DIR/watchlist.log"
"$VENV_PYTHON" -m uvicorn ingestion.api.watchlist_api:app --host 0.0.0.0 --port 8002 >> "$LOG_DIR/watchlist.log" 2>&1 &
WL_PID=$!
PIDS+=($WL_PID)
echo "$WL_PID" > "$LOG_DIR/watchlist.pid"

# 4. API Gateway (Port 4000) — use pre-compiled dist/server.js for reliability
echo -e "Starting ${GREEN}API Gateway${NC} on port 4000..."
> "$LOG_DIR/gateway.log"
(cd api-gateway && exec node dist/server.js) >> "$LOG_DIR/gateway.log" 2>&1 &
GW_PID=$!
PIDS+=($GW_PID)
echo "$GW_PID" > "$LOG_DIR/gateway.pid"

# 5. Dashboard (Port 5173)
echo -e "Starting ${GREEN}React Dashboard${NC} on port 5173..."
> "$LOG_DIR/dashboard.log"
(cd dashboard && exec node node_modules/vite/bin/vite.js) >> "$LOG_DIR/dashboard.log" 2>&1 &
DASH_PID=$!
PIDS+=($DASH_PID)
echo "$DASH_PID" > "$LOG_DIR/dashboard.pid"

# ── Health check all services ────────────────────────────────────────────────
echo -e "\n${CYAN}Waiting for services to become healthy...${NC}"

FAILED=0
# NLP engine takes the longest (loading ML models) — give it 180s
wait_for_health "NLP Engine"       "http://localhost:8000/health"     "$LOG_DIR/nlp.log"       180 || FAILED=$((FAILED + 1))
wait_for_health "Network API"      "http://localhost:8001/health"     "$LOG_DIR/network.log"   90  || FAILED=$((FAILED + 1))
wait_for_health "Watchlist API"    "http://localhost:8002/health"     "$LOG_DIR/watchlist.log"  60  || FAILED=$((FAILED + 1))
wait_for_health "API Gateway"      "http://localhost:4000/api/health" "$LOG_DIR/gateway.log"   30  || FAILED=$((FAILED + 1))
wait_for_health "React Dashboard"  "http://localhost:5173"            "$LOG_DIR/dashboard.log" 60  || FAILED=$((FAILED + 1))

echo ""
if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}======================================================${NC}"
    echo -e "${RED}⚠ ${FAILED} service(s) failed to start!${NC}"
    echo -e "${RED}  Full logs: ${LOG_DIR}/*.log${NC}"
    echo -e "${RED}  Run: ./run_offline.sh doctor${NC}"
    echo -e "${RED}======================================================${NC}"
else
    echo -e "${CYAN}======================================================${NC}"
    echo -e "${GREEN}🚀 All NETRA microservices verified healthy!${NC}"
    echo -e "${CYAN}======================================================${NC}"
fi

echo -e "  📦 Mode          : ${GREEN}${MODE}${NC}"
echo -e "  🌐 Dashboard     : ${GREEN}http://localhost:5173${NC}"
echo -e "  📡 API Gateway   : ${GREEN}http://localhost:4000${NC}"
echo -e "  🧠 NLP Engine    : ${GREEN}http://localhost:8000${NC}"
echo -e "  🕸 Network API   : ${GREEN}http://localhost:8001${NC}"
echo -e "  📋 Watchlist API : ${GREEN}http://localhost:8002${NC}"
echo -e "${CYAN}------------------------------------------------------${NC}"
echo -e "  🔑 Credentials   : ${YELLOW}admin@netra.gov.in / netra2026${NC}"
echo -e "                   : ${YELLOW}analyst@netra.gov.in / analyst2026${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "  📋 Logs          : ${CYAN}${LOG_DIR}/*.log${NC}"
echo -e "  🩺 Diagnostics   : ${CYAN}./run_offline.sh doctor${NC}"
echo -e "  🛑 Stop command  : ${CYAN}./run_offline.sh stop${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "Press ${RED}Ctrl+C${NC} to stop all services and exit.\n"

# Keep the script alive — loop on wait so that if one child exits, we don't kill the others.
# When Ctrl+C / SIGTERM / SIGHUP is received, the trap fires stop_all_services then exits.
while true; do
    wait -n 2>/dev/null || true
    # Check if ALL services are dead (not just one)
    any_alive=false
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            any_alive=true
            break
        fi
    done
    if [ "$any_alive" = false ]; then
        echo -e "\n${RED}All services have exited.${NC}"
        break
    fi
done
