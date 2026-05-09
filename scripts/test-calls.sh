#!/bin/bash
# ============================================================
#  CallsPsy — SIP Test Call Script
#
#  Tests the full call pipeline end-to-end:
#    1. Verify backend API is up
#    2. Login and get auth token
#    3. Check Vonage SIP account registration
#    4. Create contact list with test numbers
#    5. Create + start campaign
#    6. Monitor call progress in real time
#    7. Print final stats report
#
#  Usage:
#    chmod +x scripts/test-calls.sh
#    DESTINATION=+15551234567 ./scripts/test-calls.sh        # 1 test call
#    DESTINATION=+15551234567 CALL_COUNT=10 ./scripts/test-calls.sh
#    DESTINATION=+15551234567 CALL_COUNT=100 ./scripts/test-calls.sh
#
#  Prerequisites:
#    - Backend running on localhost:3001
#    - PostgreSQL + Redis running
#    - FreeSWITCH running with ESL on 8021
#    - DB seeded: cd apps/backend && npx prisma db seed
# ============================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
API="${API_URL:-http://localhost:3001}"
EMAIL="${LOGIN_EMAIL:-demo@callspsy.com}"
PASSWORD="${LOGIN_PASSWORD:-demo123456}"
DESTINATION="${DESTINATION:-}"          # e.g. +15551234567
CALL_COUNT="${CALL_COUNT:-10}"          # number of test calls (1–100)
CALLS_PER_SECOND="${CPS:-2}"            # dial rate
MAX_CONCURRENT="${MAX_CONCURRENT:-5}"   # max simultaneous calls

# Colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }
die()     { error "$*"; exit 1; }

require() { command -v "$1" >/dev/null 2>&1 || die "Required tool '$1' not found. Install it first."; }
require curl
require jq
require python3

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     CallsPsy — SIP Test Call Runner              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Validate destination ───────────────────────────────────────────────────
if [[ -z "$DESTINATION" ]]; then
  echo -e "${YELLOW}No destination number set.${NC}"
  echo ""
  echo "  Usage: DESTINATION=+15551234567 ./scripts/test-calls.sh"
  echo ""
  echo "  Options (env vars):"
  echo "    DESTINATION       — Phone number to call (E.164 format, e.g. +15551234567) [REQUIRED]"
  echo "    CALL_COUNT        — How many calls to make (default: 10, max: 100)"
  echo "    CPS               — Calls per second dial rate (default: 2)"
  echo "    MAX_CONCURRENT    — Max simultaneous calls (default: 5)"
  echo "    API_URL           — Backend API URL (default: http://localhost:3001)"
  echo "    LOGIN_EMAIL       — User email (default: demo@callspsy.com)"
  echo "    LOGIN_PASSWORD    — User password (default: demo123456)"
  echo ""
  exit 1
fi

# Clamp call count
CALL_COUNT=$(( CALL_COUNT > 100 ? 100 : CALL_COUNT ))
CALL_COUNT=$(( CALL_COUNT < 1   ? 1   : CALL_COUNT ))

info "Destination:    $DESTINATION"
info "Call count:     $CALL_COUNT"
info "Dial rate:      ${CALLS_PER_SECOND} calls/sec"
info "Max concurrent: $MAX_CONCURRENT"
info "API:            $API"
echo ""

# ── 2. Health check ───────────────────────────────────────────────────────────
info "Checking API health..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API/health" --max-time 5 || echo "000")
if [[ "$HTTP" != "200" ]]; then
  die "Backend not reachable at $API/health (HTTP $HTTP). Start it first:
  cd apps/backend && npm run start:dev"
fi
success "API is up"

# ── 3. Login ──────────────────────────────────────────────────────────────────
info "Logging in as $EMAIL..."
LOGIN_RESP=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  --max-time 10)

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.accessToken // empty' 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  error "Login failed. Response: $LOGIN_RESP"
  die "Check your credentials. Run: cd apps/backend && npx prisma db seed"
fi
success "Authenticated (token: ${TOKEN:0:20}...)"

AUTH="Authorization: Bearer $TOKEN"

# ── 4. Check SIP accounts ─────────────────────────────────────────────────────
info "Fetching SIP accounts..."
SIP_RESP=$(curl -s "$API/sip-accounts" -H "$AUTH" --max-time 10)
SIP_COUNT=$(echo "$SIP_RESP" | jq 'length' 2>/dev/null || echo "0")

if [[ "$SIP_COUNT" == "0" ]]; then
  error "No SIP accounts found."
  die "Run: cd apps/backend && npx prisma db seed"
fi

# Use first SIP account
SIP_ACCOUNT_ID=$(echo "$SIP_RESP" | jq -r '.[0].id')
SIP_ACCOUNT_NAME=$(echo "$SIP_RESP" | jq -r '.[0].name')
SIP_STATUS=$(echo "$SIP_RESP" | jq -r '.[0].liveStatus // .[0].status')

success "SIP account: $SIP_ACCOUNT_NAME (id: $SIP_ACCOUNT_ID)"
info "  Registration status: $SIP_STATUS"

if [[ "$SIP_STATUS" != "REGISTERED" ]]; then
  warn "SIP gateway is not REGISTERED (status: $SIP_STATUS)"
  warn "FreeSWITCH must be running for calls to work."
  warn "Test registration first: ./scripts/check-sip.sh"
  echo ""
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 0
fi

# ── 5. Upload a silent test audio file ────────────────────────────────────────
info "Checking for test audio file..."
AUDIO_RESP=$(curl -s "$API/audio-files" -H "$AUTH" --max-time 10)
AUDIO_COUNT=$(echo "$AUDIO_RESP" | jq 'length' 2>/dev/null || echo "0")
AUDIO_ID=""

if [[ "$AUDIO_COUNT" -gt "0" ]]; then
  AUDIO_ID=$(echo "$AUDIO_RESP" | jq -r '.[0].id')
  AUDIO_NAME=$(echo "$AUDIO_RESP" | jq -r '.[0].name')
  success "Using existing audio: $AUDIO_NAME (id: $AUDIO_ID)"
else
  warn "No audio files found. Creating a silent test file..."

  # Create a silent 3-second WAV using Python
  TMPWAV=$(mktemp /tmp/silence_XXXXXX.wav)
  python3 - <<'PYEOF'
import struct, wave, os, sys, tempfile

# 3 seconds of silence at 8000 Hz mono PCM
sample_rate = 8000
duration    = 3
samples     = b'\x00\x00' * (sample_rate * duration)

outfile = sys.argv[1] if len(sys.argv) > 1 else '/tmp/test_silence.wav'
with wave.open(outfile, 'w') as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(sample_rate)
    f.writeframes(samples)
print(f"WAV written: {outfile}")
PYEOF

  if [[ -f "$TMPWAV" ]]; then
    UPLOAD_RESP=$(curl -s -X POST "$API/audio-files" \
      -H "$AUTH" \
      -F "file=@$TMPWAV;type=audio/wav" \
      -F "name=Test Silence 3s" \
      --max-time 30)
    AUDIO_ID=$(echo "$UPLOAD_RESP" | jq -r '.id // empty')
    rm -f "$TMPWAV"
    if [[ -n "$AUDIO_ID" ]]; then
      success "Audio file created: $AUDIO_ID"
    else
      warn "Could not upload audio. Campaign will run without audio. Response: $UPLOAD_RESP"
    fi
  fi
fi

# ── 6. Create contact list ────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LIST_NAME="Test List $TIMESTAMP"

info "Creating contact list: $LIST_NAME ($CALL_COUNT contacts)..."

LIST_RESP=$(curl -s -X POST "$API/contact-lists" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$LIST_NAME\",\"description\":\"Auto-created by test-calls.sh\"}" \
  --max-time 10)

LIST_ID=$(echo "$LIST_RESP" | jq -r '.id // empty')
if [[ -z "$LIST_ID" ]]; then
  die "Failed to create contact list. Response: $LIST_RESP"
fi
success "Contact list created: $LIST_ID"

# ── 7. Import contacts ────────────────────────────────────────────────────────
info "Importing $CALL_COUNT contacts to list..."

# Build CSV with CALL_COUNT rows all pointing to DESTINATION
CSV_CONTENT="phone,firstName,lastName"$'\n'
for i in $(seq 1 $CALL_COUNT); do
  CSV_CONTENT+="${DESTINATION},Test,Contact${i}"$'\n'
done

TMPCSV=$(mktemp /tmp/contacts_XXXXXX.csv)
echo "$CSV_CONTENT" > "$TMPCSV"

IMPORT_RESP=$(curl -s -X POST "$API/contact-lists/$LIST_ID/import" \
  -H "$AUTH" \
  -F "file=@$TMPCSV;type=text/csv" \
  --max-time 60)
rm -f "$TMPCSV"

IMPORTED_COUNT=$(echo "$IMPORT_RESP" | jq -r '.imported // .validCount // .count // 0' 2>/dev/null || echo "?")
success "Imported $IMPORTED_COUNT contacts"

# ── 8. Create campaign ────────────────────────────────────────────────────────
CAMPAIGN_NAME="Test Campaign $TIMESTAMP"

info "Creating campaign: $CAMPAIGN_NAME..."

CAMPAIGN_DATA=$(jq -n \
  --arg name "$CAMPAIGN_NAME" \
  --arg listId "$LIST_ID" \
  --arg sipId "$SIP_ACCOUNT_ID" \
  --arg audioId "$AUDIO_ID" \
  --argjson cps "$CALLS_PER_SECOND" \
  --argjson maxc "$MAX_CONCURRENT" \
  '{
    name: $name,
    contactListId: $listId,
    sipAccountId: $sipId,
    audioFileId: (if $audioId != "" then $audioId else null end),
    callsPerSecond: $cps,
    maxConcurrentCalls: $maxc,
    amdEnabled: false,
    amdAction: "PLAY_ON_HUMAN",
    callerIdNumber: "VHNVhdzLwFuSAhkJoCsA",
    callerIdName: "CallsPsy Test"
  }')

CAMPAIGN_RESP=$(curl -s -X POST "$API/campaigns" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "$CAMPAIGN_DATA" \
  --max-time 15)

CAMPAIGN_ID=$(echo "$CAMPAIGN_RESP" | jq -r '.id // empty')
if [[ -z "$CAMPAIGN_ID" ]]; then
  die "Failed to create campaign. Response: $CAMPAIGN_RESP"
fi
success "Campaign created: $CAMPAIGN_ID"

# ── 9. Start campaign ─────────────────────────────────────────────────────────
info "Starting campaign..."
START_RESP=$(curl -s -X POST "$API/campaigns/$CAMPAIGN_ID/start" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  --max-time 15)

START_STATUS=$(echo "$START_RESP" | jq -r '.status // .message // "unknown"')
success "Campaign started (status: $START_STATUS)"

# ── 10. Monitor progress ──────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Monitoring campaign progress...  (Ctrl+C to stop)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

POLL_INTERVAL=3
MAX_WAIT=300   # 5 minute timeout
elapsed=0

while true; do
  STATUS_RESP=$(curl -s "$API/campaigns/$CAMPAIGN_ID" -H "$AUTH" --max-time 10 2>/dev/null || echo '{}')

  STATUS=$(echo "$STATUS_RESP" | jq -r '.status // "UNKNOWN"')
  PROCESSED=$(echo "$STATUS_RESP" | jq -r '.processedContacts // 0')
  TOTAL=$(echo "$STATUS_RESP" | jq -r '.totalContacts // 0')
  ANSWERED=$(echo "$STATUS_RESP" | jq -r '.answeredCalls // 0')
  FAILED=$(echo "$STATUS_RESP" | jq -r '.failedCalls // 0')
  ACTIVE=$(echo "$STATUS_RESP" | jq -r '.activeCalls // 0')
  HUMAN=$(echo "$STATUS_RESP" | jq -r '.humanAnswers // 0')
  MACHINE=$(echo "$STATUS_RESP" | jq -r '.machineAnswers // 0')

  PERCENT=0
  if [[ "$TOTAL" -gt 0 ]]; then
    PERCENT=$(( PROCESSED * 100 / TOTAL ))
  fi

  # Build progress bar
  FILLED=$(( PERCENT / 5 ))
  BAR=""
  for ((i=0; i<20; i++)); do
    if [[ $i -lt $FILLED ]]; then BAR+="█"; else BAR+="░"; fi
  done

  printf "\r  [%s] %3d%% | %s/%s dialed | %s active | ✅ %s answered | ❌ %s failed | %s" \
    "$BAR" "$PERCENT" "$PROCESSED" "$TOTAL" "$ACTIVE" "$ANSWERED" "$FAILED" "$STATUS"

  if [[ "$STATUS" == "COMPLETED" || "$STATUS" == "CANCELLED" || "$STATUS" == "FAILED" ]]; then
    echo ""
    break
  fi

  elapsed=$(( elapsed + POLL_INTERVAL ))
  if [[ $elapsed -ge $MAX_WAIT ]]; then
    echo ""
    warn "Timeout after ${MAX_WAIT}s — campaign may still be running"
    break
  fi

  sleep "$POLL_INTERVAL"
done

# ── 11. Final report ──────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Final Report${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

FINAL=$(curl -s "$API/campaigns/$CAMPAIGN_ID" -H "$AUTH" --max-time 10 2>/dev/null || echo '{}')
F_STATUS=$(echo "$FINAL" | jq -r '.status // "UNKNOWN"')
F_PROCESSED=$(echo "$FINAL" | jq -r '.processedContacts // 0')
F_TOTAL=$(echo "$FINAL" | jq -r '.totalContacts // 0')
F_ANSWERED=$(echo "$FINAL" | jq -r '.answeredCalls // 0')
F_FAILED=$(echo "$FINAL" | jq -r '.failedCalls // 0')
F_BUSY=$(echo "$FINAL" | jq -r '.busyCalls // 0')
F_NOANSWER=$(echo "$FINAL" | jq -r '.noanswer // 0')
F_HUMAN=$(echo "$FINAL" | jq -r '.humanAnswers // 0')
F_MACHINE=$(echo "$FINAL" | jq -r '.machineAnswers // 0')
F_DURATION=$(echo "$FINAL" | jq -r '.totalDuration // 0')

ANSWER_RATE=0
if [[ "$F_PROCESSED" -gt 0 ]]; then
  ANSWER_RATE=$(python3 -c "print(f'{$F_ANSWERED/$F_PROCESSED*100:.1f}')")
fi

echo ""
echo "  Campaign:       $CAMPAIGN_NAME"
echo "  Campaign ID:    $CAMPAIGN_ID"
echo "  Status:         $F_STATUS"
echo "  Destination:    $DESTINATION"
echo ""
echo "  Dialed:         $F_PROCESSED / $F_TOTAL"
echo "  Answered:       $F_ANSWERED"
echo "  No Answer:      $F_NOANSWER"
echo "  Busy:           $F_BUSY"
echo "  Failed:         $F_FAILED"
echo "  Human Answers:  $F_HUMAN"
echo "  Machine Answers:$F_MACHINE"
echo "  Answer Rate:    ${ANSWER_RATE}%"
echo "  Total Duration: ${F_DURATION}s"
echo ""

if [[ "$F_STATUS" == "COMPLETED" ]]; then
  echo -e "  ${GREEN}✅ Campaign completed successfully!${NC}"
elif [[ "$F_STATUS" == "FAILED" ]]; then
  echo -e "  ${RED}❌ Campaign failed — check FreeSWITCH ESL connection${NC}"
else
  echo -e "  ${YELLOW}⚠  Campaign in state: $F_STATUS${NC}"
fi
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  View results: $API/campaigns/$CAMPAIGN_ID"
echo "  View in UI:   http://localhost:3000"
echo ""
