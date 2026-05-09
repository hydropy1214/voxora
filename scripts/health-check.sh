#!/usr/bin/env bash
# ============================================================
#  CallsPsy Health Check Script
#  Verifies all services are running correctly
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0

check() {
  local name="$1"
  local cmd="$2"
  local required="${3:-true}"

  if eval "$cmd" &>/dev/null; then
    echo -e "${GREEN}[PASS]${NC} $name"
    PASS=$((PASS + 1))
  else
    if [[ "$required" == "true" ]]; then
      echo -e "${RED}[FAIL]${NC} $name"
      FAIL=$((FAIL + 1))
    else
      echo -e "${YELLOW}[WARN]${NC} $name (optional)"
      WARN=$((WARN + 1))
    fi
  fi
}

echo ""
echo "=== CallsPsy Health Check ==="
echo ""

echo "── Docker Services ──"
check "PostgreSQL running"   "docker compose ps postgres   | grep -q 'running'"
check "Redis running"        "docker compose ps redis      | grep -q 'running'"
check "Backend running"      "docker compose ps backend    | grep -q 'running'"
check "Frontend running"     "docker compose ps frontend   | grep -q 'running'"
check "FreeSWITCH running"   "docker compose ps freeswitch | grep -q 'running'"  "false"
check "Kamailio running"     "docker compose ps kamailio   | grep -q 'running'"  "false"
check "RTPengine running"    "docker compose ps rtpengine  | grep -q 'running'"  "false"
check "Coturn running"       "docker compose ps coturn     | grep -q 'running'"  "false"
check "Nginx running"        "docker compose ps nginx      | grep -q 'running'"  "false"

echo ""
echo "── API Endpoints ──"
check "Backend health"       "curl -sf --max-time 5 http://localhost:3001/health"
check "Backend API root"     "curl -sf --max-time 5 http://localhost:3001/api"
check "Frontend accessible"  "curl -sf --max-time 10 http://localhost:3000"  "false"
check "Nginx accessible"     "curl -sf --max-time 5 http://localhost/health"  "false"

echo ""
echo "── Database ──"
check "PostgreSQL connection"  "docker compose exec -T postgres pg_isready -U callspsy"
check "Redis ping"             "docker compose exec -T redis redis-cli -a \"\${REDIS_PASSWORD:-callspsy_redis_pass}\" ping | grep -q PONG"

echo ""
echo "── Network Ports ──"
check "Port 3001 (API)"        "nc -z localhost 3001"
check "Port 3000 (Frontend)"   "nc -z localhost 3000"  "false"
check "Port 5060 (SIP)"        "nc -z localhost 5060"  "false"
check "Port 5080 (FS SIP)"     "nc -z localhost 5080"  "false"
check "Port 8021 (ESL)"        "nc -z localhost 8021"  "false"
check "Port 3478 (STUN)"       "nc -z localhost 3478"  "false"

echo ""
echo "─────────────────────────────"
echo -e "${GREEN}PASS: ${PASS}${NC}  ${RED}FAIL: ${FAIL}${NC}  ${YELLOW}WARN: ${WARN}${NC}"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}Health check FAILED — $FAIL critical service(s) down${NC}"
  echo "Run: docker compose logs <service>"
  exit 1
else
  echo -e "${GREEN}Health check PASSED${NC}"
  exit 0
fi
