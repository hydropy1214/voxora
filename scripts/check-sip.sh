#!/bin/bash
# ============================================================
#  CallsPsy — SIP Registration Check
#
#  Checks if the Vonage SIP gateway is registered with FreeSWITCH.
#  Run this BEFORE making test calls to confirm connectivity.
#
#  Usage:
#    chmod +x scripts/check-sip.sh
#    ./scripts/check-sip.sh
# ============================================================

set -euo pipefail

API="${API_URL:-http://localhost:3001}"
EMAIL="${LOGIN_EMAIL:-demo@callspsy.com}"
PASSWORD="${LOGIN_PASSWORD:-demo123456}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; }

require() { command -v "$1" >/dev/null 2>&1 || { error "Required: '$1' not found"; exit 1; }; }
require curl
require jq

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     CallsPsy — SIP Connectivity Check            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. API health ─────────────────────────────────────────────────────────────
info "Checking backend API..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API/health" --max-time 5 || echo "000")
if [[ "$HTTP" != "200" ]]; then
  error "Backend not reachable at $API/health (HTTP $HTTP)"
  echo "  Start it: cd apps/backend && npm run start:dev"
  exit 1
fi
success "Backend API reachable"

# ── 2. Login ──────────────────────────────────────────────────────────────────
info "Logging in..."
LOGIN_RESP=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  --max-time 10)

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.accessToken // empty' 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  error "Login failed. Run: cd apps/backend && npx prisma db seed"
  exit 1
fi
success "Authenticated"

AUTH="Authorization: Bearer $TOKEN"

# ── 3. System status (ESL + FreeSWITCH) ──────────────────────────────────────
info "Checking FreeSWITCH ESL connection..."
SYS_RESP=$(curl -s "$API/system/status" -H "$AUTH" --max-time 10 2>/dev/null || echo '{}')
ESL_CONNECTED=$(echo "$SYS_RESP" | jq -r '.freeswitch.eslConnected // .eslConnected // false')
FS_VERSION=$(echo "$SYS_RESP" | jq -r '.freeswitch.version // "unknown"')

if [[ "$ESL_CONNECTED" == "true" ]]; then
  success "FreeSWITCH ESL connected (version: $FS_VERSION)"
else
  warn "FreeSWITCH ESL NOT connected"
  echo ""
  echo "  FreeSWITCH must be running for calls to work."
  echo "  Start it: docker compose up -d freeswitch"
  echo ""
fi

# ── 4. SIP accounts ───────────────────────────────────────────────────────────
info "Checking SIP accounts..."
SIP_RESP=$(curl -s "$API/sip-accounts" -H "$AUTH" --max-time 10)
SIP_COUNT=$(echo "$SIP_RESP" | jq 'length' 2>/dev/null || echo "0")

if [[ "$SIP_COUNT" == "0" ]]; then
  warn "No SIP accounts found. Run: cd apps/backend && npx prisma db seed"
  exit 1
fi

echo ""
echo "  Found $SIP_COUNT SIP account(s):"
echo ""

echo "$SIP_RESP" | jq -c '.[]' | while read -r account; do
  ID=$(echo "$account" | jq -r '.id')
  NAME=$(echo "$account" | jq -r '.name')
  SERVER=$(echo "$account" | jq -r '.sipServer')
  PORT=$(echo "$account" | jq -r '.sipPort')
  USER=$(echo "$account" | jq -r '.username')
  TRANSPORT=$(echo "$account" | jq -r '.transport')
  STATUS=$(echo "$account" | jq -r '.liveStatus // .status')

  echo "  ┌─────────────────────────────────────────────"
  echo "  │ Name:      $NAME"
  echo "  │ ID:        $ID"
  echo "  │ Server:    $SERVER:$PORT ($TRANSPORT)"
  echo "  │ Username:  $USER"
  echo -n "  │ Status:    "

  case "$STATUS" in
    REGISTERED)   echo -e "${GREEN}✅ REGISTERED${NC}" ;;
    REGISTERING)  echo -e "${YELLOW}⏳ REGISTERING...${NC}" ;;
    FAILED)       echo -e "${RED}❌ FAILED${NC}" ;;
    UNREGISTERED) echo -e "${YELLOW}⚠  UNREGISTERED${NC}" ;;
    *)            echo -e "${YELLOW}❓ $STATUS${NC}" ;;
  esac
  echo "  └─────────────────────────────────────────────"
  echo ""
done

# ── 5. Force test registration on first account ───────────────────────────────
FIRST_SIP_ID=$(echo "$SIP_RESP" | jq -r '.[0].id')
FIRST_SIP_STATUS=$(echo "$SIP_RESP" | jq -r '.[0].liveStatus // .[0].status')

if [[ "$FIRST_SIP_STATUS" != "REGISTERED" ]]; then
  info "Testing SIP registration for account: $FIRST_SIP_ID..."
  TEST_RESP=$(curl -s -X POST "$API/sip-accounts/$FIRST_SIP_ID/test" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    --max-time 15 2>/dev/null || echo '{}')

  TEST_SUCCESS=$(echo "$TEST_RESP" | jq -r '.success // false')
  TEST_STATUS=$(echo "$TEST_RESP" | jq -r '.status // "unknown"')
  TEST_LATENCY=$(echo "$TEST_RESP" | jq -r '.latencyMs // "?"')
  TEST_DETAIL=$(echo "$TEST_RESP" | jq -r '.detail // ""')

  if [[ "$TEST_SUCCESS" == "true" ]]; then
    success "Registration test PASSED — status: $TEST_STATUS, latency: ${TEST_LATENCY}ms"
  else
    warn "Registration test: $TEST_STATUS"
    if [[ -n "$TEST_DETAIL" ]]; then
      echo "  Detail: $TEST_DETAIL"
    fi
    echo ""
    echo "  Vonage SIP credentials:"
    echo "    Host:      edge3-tlssbc2va.prod.vonedge.com:5061"
    echo "    Username:  VHNVhdzLwFuSAhkJoCsA"
    echo "    Transport: TLS"
    echo ""
    echo "  Common issues:"
    echo "    • FreeSWITCH not running: docker compose up -d freeswitch"
    echo "    • Wrong port: Vonage Edge requires TLS on port 5061"
    echo "    • Credentials expired: check Vonage dashboard"
    echo "    • Firewall blocking outbound 5061: open TCP/UDP 5061 egress"
  fi
fi

# ── 6. Network test ───────────────────────────────────────────────────────────
echo ""
info "Testing network connectivity to Vonage Edge..."

if command -v openssl >/dev/null 2>&1; then
  OPENSSL_OUT=$(echo "OPTIONS sip:check@edge3-tlssbc2va.prod.vonedge.com SIP/2.0" | \
    openssl s_client -connect edge3-tlssbc2va.prod.vonedge.com:5061 \
    -tls1_2 -quiet 2>&1 | head -5 || true)
  if echo "$OPENSSL_OUT" | grep -qi "connected\|certificate\|issuer"; then
    success "TLS connection to edge3-tlssbc2va.prod.vonedge.com:5061 → OK"
  else
    warn "TLS test inconclusive (may require SIP traffic)"
    echo "  $OPENSSL_OUT" | head -3
  fi
elif command -v nc >/dev/null 2>&1; then
  if nc -z -w 5 edge3-tlssbc2va.prod.vonedge.com 5061 2>/dev/null; then
    success "Port 5061 reachable on edge3-tlssbc2va.prod.vonedge.com"
  else
    warn "Port 5061 not reachable — check firewall/egress rules"
  fi
else
  warn "Cannot test network (openssl/nc not found)"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Next: run a test call"
echo "  DESTINATION=+15551234567 ./scripts/test-calls.sh"
echo ""
