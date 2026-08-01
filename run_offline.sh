#!/bin/bash
# ==============================================================================
# NETRA — Offline / Local Runner Script
# Runs all 5 microservices locally with real model inference (no Docker required).
# Usage: ./run_offline.sh
# ==============================================================================

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}   NETRA — Starting Local Services (Offline Mode)      ${NC}"
echo -e "${CYAN}======================================================${NC}"

# Default to offline mode (real models + live APIs, no Docker needed).
# Override: MODE=kafka ./run_offline.sh (requires Docker infra)
#           MODE=fixture ./run_offline.sh (mock data only)
export MODE=${MODE:-offline}

# Activate python virtual environment if available
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo -e "${GREEN}✓ Virtual environment activated (.venv)${NC}"
fi

# Function to kill existing processes on ports 8000, 8001, 8002, 4000, 5173
cleanup_ports() {
    echo -e "${YELLOW}Checking and freeing ports (8000, 8001, 8002, 4000, 5173)...${NC}"
    for port in 8000 8001 8002 4000 5173; do
        pid=$(lsof -t -i:$port 2>/dev/null)
        if [ ! -z "$pid" ]; then
            echo -e "  Cleaning up process $pid on port $port"
            kill -9 $pid 2>/dev/null || true
        fi
    done
}

cleanup_ports

# Array to store child process PIDs
PIDS=()

# Cleanup on exit (Ctrl+C)
cleanup() {
    echo -e "\n${YELLOW}Stopping all NETRA services...${NC}"
    for pid in "${PIDS[@]}"; do
        kill $pid 2>/dev/null || true
    done
    echo -e "${GREEN}✓ All services stopped cleanly.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "\n${CYAN}Starting Microservices (MODE=${MODE})...${NC}"

# 1. NLP Engine (Port 8000)
echo -e "Starting ${GREEN}NLP Engine${NC} on port 8000..."
python -m uvicorn nlp_engine.inference.inference_service:app --port 8000 > /tmp/netra_nlp.log 2>&1 &
PIDS+=($!)

# 2. Network Analysis Service (Port 8001)
echo -e "Starting ${GREEN}Network Analysis Service${NC} on port 8001..."
python -m uvicorn network_analysis.api.network_service:app --port 8001 > /tmp/netra_network.log 2>&1 &
PIDS+=($!)

# 3. Watchlist API (Port 8002)
echo -e "Starting ${GREEN}Watchlist API${NC} on port 8002..."
python -m uvicorn ingestion.api.watchlist_api:app --port 8002 > /tmp/netra_watchlist.log 2>&1 &
PIDS+=($!)

# 4. API Gateway (Port 4000)
echo -e "Starting ${GREEN}API Gateway${NC} on port 4000..."
(cd api-gateway && npm run dev) > /tmp/netra_gateway.log 2>&1 &
PIDS+=($!)

# 5. Dashboard (Port 5173)
echo -e "Starting ${GREEN}React Dashboard${NC} on port 5173..."
(cd dashboard && npm run dev) > /tmp/netra_dashboard.log 2>&1 &
PIDS+=($!)

# ── Real health check polling — don't lie about service status ─────
wait_for_health() {
  local name="$1" url="$2" timeout="${3:-30}"
  local waited=0
  echo -ne "  Waiting for ${name}..."
  until curl -sf "$url" > /dev/null 2>&1; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$timeout" ]; then
      echo -e " ${RED}✗ TIMEOUT after ${timeout}s${NC}"
      echo -e "    ${YELLOW}Check log: /tmp/netra_$(echo $name | tr '[:upper:]' '[:lower:]' | tr ' ' '_').log${NC}"
      return 1
    fi
  done
  echo -e " ${GREEN}✓ ready (${waited}s)${NC}"
  return 0
}

echo -e "\n${CYAN}Waiting for services to become healthy...${NC}"

FAILED=0
wait_for_health "NLP Engine"       "http://localhost:8000/health" 40 || FAILED=$((FAILED + 1))
wait_for_health "Network API"      "http://localhost:8001/health" 20 || FAILED=$((FAILED + 1))
wait_for_health "Watchlist API"    "http://localhost:8002/health" 20 || FAILED=$((FAILED + 1))
wait_for_health "API Gateway"      "http://localhost:4000/api/health" 20 || FAILED=$((FAILED + 1))
wait_for_health "React Dashboard"  "http://localhost:5173" 20 || FAILED=$((FAILED + 1))

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}======================================================${NC}"
  echo -e "${RED}⚠ ${FAILED} service(s) failed to start!${NC}"
  echo -e "${RED}Check the log files listed above for details.${NC}"
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
echo -e "Press ${RED}Ctrl+C${NC} to stop all services."

# Wait for child processes
wait
