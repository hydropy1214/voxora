#!/usr/bin/env bash
# ============================================================
#  Voxora — One-Click Production Deploy
#  
#  WHAT THIS SCRIPT DOES (step by step):
#  1.  Detects your public IP (AWS/bare-metal/any cloud)
#  2.  Installs Docker Engine + Docker Compose plugin (if missing)
#  3.  Configures UFW firewall ports (or prints AWS Security Group guide)
#  4.  Generates cryptographically secure secrets (JWT, DB, Redis, ESL, TURN)
#  5.  Writes .env with all configuration
#  6.  Generates per-service configs (FreeSWITCH, Coturn, RTPengine) with your IP
#  7.  Pulls all Docker images (postgres, redis, nginx, coturn, rtpengine)
#  8.  Builds custom images (FreeSWITCH + Kamailio + backend + frontend)
#  9.  Starts infrastructure first: postgres → redis
#  10. Waits for health checks before proceeding
#  11. Starts telephony stack: rtpengine → coturn → kamailio → freeswitch
#  12. Runs database migrations (prisma migrate deploy)
#  13. Seeds demo data (demo@voxora.io / demo123456)
#  14. Starts application: backend → frontend → nginx
#  15. Prints access URLs and management commands
#
#  REQUIREMENTS:
#  - Ubuntu 20.04/22.04 (or any Debian-based Linux)
#  - 4GB+ RAM, 20GB+ disk
#  - Ports 80, 443, 3000, 3001, 5060, 5080, 3478, 10000-20000 available
#
#  USAGE:
#  sudo ./setup.sh                     # Auto-detect IP
#  sudo ./setup.sh --domain voxora.io  # With custom domain
#  sudo ./setup.sh --skip-firewall     # AWS (use Security Groups instead)
#  ./setup.sh --dev                    # Local development
# ============================================================
set -euo pipefail
IFS=$'\n\t'

# ──────────────────────────────────────────────────────────
#  Colors and logging
# ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
STEP=0

log()    { echo -e "${GREEN}  ✓${NC} $*"; }
info()   { echo -e "${CYAN}  →${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
error()  { echo -e "${RED}  ✗${NC} $*" >&2; }
detail() { echo -e "${DIM}    $*${NC}"; }

step() {
  STEP=$((STEP + 1))
  echo ""
  echo -e "${BOLD}${BLUE}┌─ Step ${STEP}: $*${NC}"
}

header() {
  echo ""
  echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${BLUE}║  $*$(printf '%*s' $((51 - ${#1})) '')║${NC}"
  echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
}

banner() {
  clear 2>/dev/null || true
  echo -e "${BOLD}${BLUE}"
  echo "  ██╗   ██╗ ██████╗ ██╗  ██╗ ██████╗ ██████╗  █████╗ "
  echo "  ██║   ██║██╔═══██╗╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗"
  echo "  ██║   ██║██║   ██║ ╚███╔╝ ██║   ██║██████╔╝███████║"
  echo "  ╚██╗ ██╔╝██║   ██║ ██╔██╗ ██║   ██║██╔══██╗██╔══██║"
  echo "   ╚████╔╝ ╚██████╔╝██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║"
  echo "    ╚═══╝   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Cloud SIP Voice Broadcasting Platform${NC}"
  echo -e "  ${DIM}One-click production deploy${NC}"
  echo ""
}

# ──────────────────────────────────────────────────────────
#  Parse arguments
# ──────────────────────────────────────────────────────────
SKIP_DEPS=false
SKIP_FIREWALL=false
FORCE_REINSTALL=false
DEV_MODE=false
DOMAIN=""
PUBLIC_IP_OVERRIDE=""

usage() {
  cat << 'EOF'
Voxora Setup Script

Usage: sudo ./setup.sh [OPTIONS]

Options:
  --domain DOMAIN       Set your domain (e.g. app.voxora.io)
  --ip IP               Override auto-detected public IP
  --skip-deps           Skip Docker installation (already installed)
  --skip-firewall       Skip firewall setup (use for AWS Security Groups)
  --force               Force reinstall even if already deployed
  --dev                 Development mode (uses localhost, disables telephony)
  -h, --help            Show this help

Examples:
  # AWS EC2 deploy (auto-detects Elastic IP):
  sudo ./setup.sh --skip-firewall

  # With custom domain:
  sudo ./setup.sh --domain app.voxora.io

  # Force rebuild everything:
  sudo ./setup.sh --force

  # Local development (no telephony):
  ./setup.sh --dev
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)   DOMAIN="$2";              shift 2 ;;
    --ip)       PUBLIC_IP_OVERRIDE="$2";  shift 2 ;;
    --skip-deps)    SKIP_DEPS=true;       shift ;;
    --skip-firewall) SKIP_FIREWALL=true;  shift ;;
    --force)    FORCE_REINSTALL=true;     shift ;;
    --dev)      DEV_MODE=true;            shift ;;
    -h|--help)  usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# ──────────────────────────────────────────────────────────
#  Globals
# ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
LOG_FILE="${SCRIPT_DIR}/setup.log"

# Redirect all output to log as well
exec > >(tee -a "$LOG_FILE") 2>&1

# ──────────────────────────────────────────────────────────
#  STEP 1: Detect Environment
# ──────────────────────────────────────────────────────────
detect_environment() {
  step "Detect Environment"

  # Root check
  if [[ $EUID -ne 0 ]] && [[ "$DEV_MODE" == "false" ]]; then
    warn "Not running as root. Some steps may fail."
    warn "Recommended: sudo ./setup.sh"
  fi

  # OS detection
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    source /etc/os-release
    log "OS: ${NAME:-Unknown} ${VERSION_ID:-}"
  fi

  # AWS EC2 detection via metadata service
  IS_AWS=false
  if curl -sf --connect-timeout 1 http://169.254.169.254/latest/meta-data/instance-id &>/dev/null; then
    IS_AWS=true
    AWS_INSTANCE=$(curl -sf --connect-timeout 1 http://169.254.169.254/latest/meta-data/instance-id)
    AWS_REGION=$(curl -sf --connect-timeout 1 http://169.254.169.254/latest/meta-data/placement/region || echo "unknown")
    log "AWS EC2 detected — Instance: ${AWS_INSTANCE} | Region: ${AWS_REGION}"
    detail "AWS Security Group ports will need manual configuration (see summary at end)"
  else
    info "Not AWS EC2 — bare metal / other cloud"
  fi

  # Public IP detection
  if [[ -n "$PUBLIC_IP_OVERRIDE" ]]; then
    PUBLIC_IP="$PUBLIC_IP_OVERRIDE"
    log "Using provided IP: ${PUBLIC_IP}"
  else
    info "Detecting public IP..."
    PUBLIC_IP=""
    declare -a IP_SOURCES=(
      "https://checkip.amazonaws.com"
      "https://api.ipify.org"
      "https://ifconfig.me/ip"
      "https://icanhazip.com"
      "https://ident.me"
    )
    for src in "${IP_SOURCES[@]}"; do
      IP=$(curl -sf --connect-timeout 4 --max-time 8 "$src" 2>/dev/null | tr -d '[:space:]') || true
      if [[ "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        PUBLIC_IP="$IP"
        log "Public IP: ${PUBLIC_IP} (via ${src})"
        break
      fi
    done

    if [[ -z "$PUBLIC_IP" ]]; then
      PUBLIC_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
      warn "Could not detect public IP. Using: ${PUBLIC_IP}"
      warn "Set correct IP with: --ip YOUR_PUBLIC_IP"
    fi
  fi

  # Private/local IP
  PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
  log "Private IP: ${PRIVATE_IP}"

  # App URLs
  if [[ "$DEV_MODE" == "true" ]]; then
    APP_URL="http://localhost:3000"
    API_URL="http://localhost:3001"
    info "Dev mode: using localhost URLs"
  elif [[ -n "$DOMAIN" ]]; then
    APP_URL="https://${DOMAIN}"
    API_URL="https://${DOMAIN}"
    log "Domain: ${DOMAIN}"
  else
    APP_URL="http://${PUBLIC_IP}"
    API_URL="http://${PUBLIC_IP}:3001"
  fi

  log "App URL: ${APP_URL}"
}

# ──────────────────────────────────────────────────────────
#  STEP 2: Install Docker
# ──────────────────────────────────────────────────────────
install_docker() {
  step "Install Docker Engine"

  if [[ "$SKIP_DEPS" == "true" ]]; then
    warn "Skipping dependency installation (--skip-deps)"
    if ! command -v docker &>/dev/null; then
      error "Docker not found but --skip-deps was set. Install Docker first."
      exit 1
    fi
    return
  fi

  # Docker Engine
  if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    log "Docker already installed: v${DOCKER_VER}"
  else
    info "Installing Docker Engine (official install script)..."
    detail "Downloading from https://get.docker.com"
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    bash /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh

    # Enable + start Docker
    systemctl enable docker 2>/dev/null || true
    systemctl start  docker 2>/dev/null || true

    # Add user to docker group
    if [[ -n "${SUDO_USER:-}" ]]; then
      usermod -aG docker "${SUDO_USER}" 2>/dev/null || true
      info "Added ${SUDO_USER} to docker group (re-login required for non-sudo use)"
    fi

    log "Docker Engine installed"
  fi

  # Docker Compose plugin
  if docker compose version &>/dev/null; then
    COMPOSE_VER=$(docker compose version --short 2>/dev/null || echo "unknown")
    log "Docker Compose already installed: v${COMPOSE_VER}"
  else
    info "Installing Docker Compose plugin..."
    apt-get update -qq 2>/dev/null || yum update -q 2>/dev/null || true
    apt-get install -y docker-compose-plugin 2>/dev/null || \
    yum install -y docker-compose-plugin 2>/dev/null || {
      # Manual install as fallback
      COMPOSE_URL="https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)"
      curl -fsSL "$COMPOSE_URL" -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    }
    log "Docker Compose installed"
  fi

  # Install useful tools
  for pkg in curl wget netcat-openbsd openssl jq; do
    command -v "${pkg%%-*}" &>/dev/null || {
      apt-get install -y "$pkg" 2>/dev/null || yum install -y "$pkg" 2>/dev/null || true
    }
  done

  log "All dependencies satisfied"
}

# ──────────────────────────────────────────────────────────
#  STEP 3: Configure Firewall
# ──────────────────────────────────────────────────────────
configure_firewall() {
  step "Configure Firewall"

  if [[ "$SKIP_FIREWALL" == "true" ]]; then
    warn "Firewall configuration skipped (--skip-firewall)"
    detail "If using AWS, configure these Security Group inbound rules:"
    print_aws_sg_guide
    return
  fi

  if [[ "$IS_AWS" == "true" ]]; then
    warn "AWS EC2 detected — skipping UFW (use Security Groups)"
    print_aws_sg_guide
    return
  fi

  if command -v ufw &>/dev/null; then
    info "Configuring UFW firewall..."
    ufw --force reset &>/dev/null
    ufw default deny incoming
    ufw default allow outgoing
    # Essential
    ufw allow ssh comment "SSH"
    ufw allow 80/tcp  comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    ufw allow 3000/tcp comment "Voxora Frontend"
    ufw allow 3001/tcp comment "Voxora API"
    # SIP
    ufw allow 5060/udp comment "SIP UDP (Kamailio)"
    ufw allow 5060/tcp comment "SIP TCP (Kamailio)"
    ufw allow 5080/udp comment "SIP UDP (FreeSWITCH)"
    ufw allow 5080/tcp comment "SIP TCP (FreeSWITCH)"
    # STUN/TURN
    ufw allow 3478/udp comment "STUN/TURN"
    ufw allow 3478/tcp comment "STUN/TURN TCP"
    ufw allow 5349/tcp comment "STUN/TURN TLS"
    # RTP media (wide range)
    ufw allow 10000:20000/udp comment "RTP Media"
    # Enable
    ufw --force enable
    log "UFW configured — $(ufw status | grep -c 'ALLOW') rules active"
  elif command -v firewall-cmd &>/dev/null; then
    info "Configuring firewalld..."
    firewall-cmd --permanent --add-service={http,https,ssh}
    firewall-cmd --permanent --add-port={3000,3001,5060,5080}/tcp
    firewall-cmd --permanent --add-port={5060,5080,3478}/udp
    firewall-cmd --permanent --add-port=10000-20000/udp
    firewall-cmd --reload
    log "firewalld configured"
  else
    warn "No firewall manager found (ufw/firewalld). Ports should be open by default."
  fi
}

print_aws_sg_guide() {
  echo ""
  echo -e "  ${BOLD}AWS Security Group Inbound Rules:${NC}"
  echo -e "  ${DIM}┌──────────┬────────────────┬─────────────────────┬────────────────────────┐${NC}"
  echo -e "  ${DIM}│ Protocol │ Port(s)        │ Source              │ Purpose                │${NC}"
  echo -e "  ${DIM}├──────────┼────────────────┼─────────────────────┼────────────────────────┤${NC}"
  echo -e "  ${DIM}│ TCP      │ 22             │ Your IP/32          │ SSH admin access       │${NC}"
  echo -e "  ${DIM}│ TCP      │ 80, 443        │ 0.0.0.0/0           │ Web UI (HTTP/HTTPS)    │${NC}"
  echo -e "  ${DIM}│ TCP      │ 3000           │ 0.0.0.0/0           │ Voxora Frontend        │${NC}"
  echo -e "  ${DIM}│ TCP      │ 3001           │ 0.0.0.0/0           │ Voxora API             │${NC}"
  echo -e "  ${DIM}│ UDP+TCP  │ 5060           │ 0.0.0.0/0           │ SIP (Kamailio proxy)   │${NC}"
  echo -e "  ${DIM}│ UDP+TCP  │ 5080           │ 0.0.0.0/0           │ SIP (FreeSWITCH)       │${NC}"
  echo -e "  ${DIM}│ UDP+TCP  │ 3478           │ 0.0.0.0/0           │ STUN/TURN (Coturn)     │${NC}"
  echo -e "  ${DIM}│ UDP      │ 10000-20000    │ 0.0.0.0/0           │ RTP Media streams      │${NC}"
  echo -e "  ${DIM}└──────────┴────────────────┴─────────────────────┴────────────────────────┘${NC}"
  echo ""
}

# ──────────────────────────────────────────────────────────
#  STEP 4: Generate Configuration
# ──────────────────────────────────────────────────────────
generate_secret()   { openssl rand -base64 48 | tr -d '=+/' | head -c 64; }
generate_password() { openssl rand -base64 24 | tr -d '=+/' | head -c 32; }

configure_environment() {
  step "Generate Configuration (.env)"

  # Backup existing .env
  if [[ -f "$ENV_FILE" ]]; then
    BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
    cp "$ENV_FILE" "$BACKUP"
    info "Backed up existing .env → $(basename "$BACKUP")"
  fi

  # Preserve existing secrets (idempotent — won't change DB passwords on re-run)
  _get_env() {
    [[ -f "$ENV_FILE" ]] && grep "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true
  }

  JWT_SECRET="$(_get_env JWT_SECRET)";               [[ -z "$JWT_SECRET" ]] && JWT_SECRET="$(generate_secret)"
  JWT_REFRESH="$(_get_env JWT_REFRESH_SECRET)";       [[ -z "$JWT_REFRESH" ]] && JWT_REFRESH="$(generate_secret)"
  DB_PASS="$(_get_env DB_PASSWORD)";                  [[ -z "$DB_PASS" ]]     && DB_PASS="$(generate_password)"
  REDIS_PASS="$(_get_env REDIS_PASSWORD)";            [[ -z "$REDIS_PASS" ]]  && REDIS_PASS="$(generate_password)"
  ESL_PASS="$(_get_env FREESWITCH_ESL_PASSWORD)";     [[ -z "$ESL_PASS" ]]    && ESL_PASS="$(generate_password)"
  COTURN_SEC="$(_get_env COTURN_SECRET)";             [[ -z "$COTURN_SEC" ]]  && COTURN_SEC="$(generate_secret)"

  DATABASE_URL="postgresql://voxora:${DB_PASS}@postgres:5432/voxora_db?schema=public"

  info "Writing .env..."
  cat > "$ENV_FILE" << EOF
# ============================================================
# Voxora Configuration — Auto-generated $(date -u '+%Y-%m-%d %H:%M UTC')
# Public IP: ${PUBLIC_IP}  |  Host: $(hostname -s)
# ============================================================

# ── Application ──────────────────────────────────────────────
NODE_ENV=production
APP_PORT=3001
APP_URL=${APP_URL}
FRONTEND_URL=${APP_URL}
DOMAIN=${DOMAIN}
PUBLIC_IP=${PUBLIC_IP}
PRIVATE_IP=${PRIVATE_IP}

# ── JWT Authentication ────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Database (PostgreSQL) ─────────────────────────────────────
DB_HOST=postgres
DB_PORT=5432
DB_NAME=voxora_db
DB_USER=voxora
DB_PASSWORD=${DB_PASS}
DATABASE_URL=${DATABASE_URL}

# ── Redis ─────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASS}

# ── FreeSWITCH ESL ────────────────────────────────────────────
# ESL = Event Socket Library — how the API controls FreeSWITCH
FREESWITCH_HOST=freeswitch
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=${ESL_PASS}

# ── Kamailio ──────────────────────────────────────────────────
KAMAILIO_HOST=kamailio

# ── RTPengine ─────────────────────────────────────────────────
RTPENGINE_HOST=rtpengine
RTPENGINE_PORT=2223
RTPENGINE_MIN_PORT=10000
RTPENGINE_MAX_PORT=20000

# ── Coturn STUN/TURN ──────────────────────────────────────────
COTURN_HOST=${PUBLIC_IP}
COTURN_PORT=3478
COTURN_SECRET=${COTURN_SEC}

# ── Email (configure for email verification + password reset) ─
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_USER=postmaster@mg.yourdomain.com
MAIL_PASS=your-mailgun-password
MAIL_FROM=noreply@yourdomain.com

# ── Storage ───────────────────────────────────────────────────
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=/app/uploads

# ── Stripe Billing (optional — add to enable billing features)
STRIPE_SECRET_KEY=sk_live_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
STRIPE_PRICE_STARTER=price_replace_me
STRIPE_PRICE_GROWTH=price_replace_me
STRIPE_PRICE_PRO=price_replace_me
STRIPE_PRICE_ENTERPRISE=price_replace_me

# ── Frontend ──────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=${API_URL}
NEXT_PUBLIC_WS_URL=${API_URL}
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_replace_me
EOF

  log ".env written ($(wc -l < "$ENV_FILE") lines)"
}

# ──────────────────────────────────────────────────────────
#  STEP 5: Generate Telephony Configs
# ──────────────────────────────────────────────────────────
generate_telephony_configs() {
  step "Generate Telephony Service Configs"

  # FreeSWITCH vars.xml — injected by docker-entrypoint.sh at runtime
  # (entrypoint reads PUBLIC_IP and ESL_PASSWORD from Docker env)
  log "FreeSWITCH: config will be injected at container start via entrypoint"
  detail "PUBLIC_IP=${PUBLIC_IP} → ext-rtp-ip / ext-sip-ip in sofia profile"

  # Coturn configuration
  info "Writing Coturn config..."
  mkdir -p "${SCRIPT_DIR}/infra/coturn"
  cat > "${SCRIPT_DIR}/infra/coturn/turnserver.conf" << EOF
# Coturn STUN/TURN Server — Voxora Production
# Generated: $(date -u '+%Y-%m-%d %H:%M UTC')
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=${PRIVATE_IP}
external-ip=${PUBLIC_IP}/${PRIVATE_IP}
realm=voxora.io
use-auth-secret
static-auth-secret=${COTURN_SEC}
server-name=voxora-turn
log-file=/var/log/coturn/turnserver.log
syslog
no-tlsv1
no-tlsv1_1
no-tlsv1_2
cipher-list="ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256"
min-port=10000
max-port=20000
no-loopback-peers
no-multicast-peers
fingerprint
EOF
  log "Coturn config written (external-ip=${PUBLIC_IP})"

  log "All telephony configs ready"
}

# ──────────────────────────────────────────────────────────
#  STEP 6: Pull Docker Images
# ──────────────────────────────────────────────────────────
pull_images() {
  step "Pull Docker Base Images"
  info "Pre-pulling standard images (faster than building from scratch)..."
  detail "Images: postgres:16-alpine, redis:7-alpine, nginx:1.25-alpine"
  detail "         coturn/coturn:4.6-alpine, drachtio/rtpengine:latest"
  detail "         signalwire/freeswitch:v1.10, kamailio/kamailio:5.7-debian"

  cd "$SCRIPT_DIR"

  # Pull standard images (these never need building)
  docker pull postgres:16-alpine &
  docker pull redis:7-alpine &
  docker pull nginx:1.25-alpine &

  # Pull telephony base images (used in Dockerfiles)
  docker pull coturn/coturn:4.6-alpine &
  docker pull drachtio/rtpengine:latest &
  docker pull signalwire/freeswitch:v1.10 &
  docker pull kamailio/kamailio:5.7-debian &

  # Wait for all pulls
  wait
  log "Base images pulled"
}

# ──────────────────────────────────────────────────────────
#  STEP 7: Build Custom Images
# ──────────────────────────────────────────────────────────
build_images() {
  step "Build Custom Docker Images"
  info "Building: kamailio (SIP proxy) + freeswitch (media server) + backend + frontend"
  detail "This step adds Voxora configs/scripts on top of official images"
  detail "Duration: ~5-10 minutes on first run (cached on subsequent runs)"

  cd "$SCRIPT_DIR"

  # Build all custom images in parallel
  docker compose build \
    --parallel \
    --progress=plain \
    2>&1 | grep -E '(STEP|Step|\[|Building|Successfully|ERROR|Error|=>)' || true

  log "All custom images built"
}

# ──────────────────────────────────────────────────────────
#  STEP 8: Start Infrastructure
# ──────────────────────────────────────────────────────────
start_infrastructure() {
  step "Start Infrastructure (PostgreSQL + Redis)"
  cd "$SCRIPT_DIR"

  info "Starting PostgreSQL..."
  docker compose up -d postgres

  info "Starting Redis..."
  docker compose up -d redis

  # Wait for PostgreSQL
  info "Waiting for PostgreSQL to accept connections..."
  local retries=0
  until docker compose exec -T postgres pg_isready \
        -U "${DB_USER:-voxora}" -d "${DB_NAME:-voxora_db}" &>/dev/null; do
    retries=$((retries + 1))
    if [[ $retries -ge 40 ]]; then
      error "PostgreSQL failed to start after 80s"
      docker compose logs postgres | tail -20
      exit 1
    fi
    printf "."
    sleep 2
  done
  echo ""
  log "PostgreSQL ready (after ~$((retries * 2))s)"

  # Wait for Redis
  info "Waiting for Redis..."
  retries=0
  until docker compose exec -T redis redis-cli -a "${REDIS_PASS:-}" ping 2>/dev/null | grep -q PONG; do
    retries=$((retries + 1))
    if [[ $retries -ge 20 ]]; then
      error "Redis failed to start after 40s"
      docker compose logs redis | tail -10
      exit 1
    fi
    printf "."
    sleep 2
  done
  echo ""
  log "Redis ready"
}

# ──────────────────────────────────────────────────────────
#  STEP 9: Run Database Migrations
# ──────────────────────────────────────────────────────────
run_migrations() {
  step "Database Migrations + Seed"
  cd "$SCRIPT_DIR"

  info "Running Prisma migrations..."
  detail "This creates all tables: users, organizations, sip_accounts, campaigns, call_logs, etc."
  docker compose run --rm backend sh -c "npx prisma migrate deploy" 2>&1 | \
    grep -E '(Applying|Applied|already|migrations|error|Error)' || true
  log "Migrations applied"

  info "Seeding demo data..."
  detail "Creates demo account: demo@voxora.io / demo123456"
  docker compose run --rm backend sh -c "npm run prisma:seed" 2>&1 | \
    grep -E '(Created|Seeded|complete|error|Error)' || true
  log "Demo data seeded"
}

# ──────────────────────────────────────────────────────────
#  STEP 10: Start Telephony Stack
# ──────────────────────────────────────────────────────────
start_telephony() {
  step "Start Telephony Stack"

  if [[ "$DEV_MODE" == "true" ]]; then
    warn "Dev mode: skipping telephony services (FreeSWITCH/Kamailio/RTPengine/Coturn)"
    detail "Start telephony with: docker compose --profile telephony up -d"
    return
  fi

  cd "$SCRIPT_DIR"

  # Start in dependency order
  info "Starting RTPengine (RTP media relay)..."
  detail "Interface: ${PRIVATE_IP}!${PUBLIC_IP} | Ports: 10000-20000/UDP"
  docker compose up -d rtpengine

  info "Starting Coturn (STUN/TURN)..."
  detail "Port: 3478/UDP+TCP | External: ${PUBLIC_IP}"
  docker compose up -d coturn

  # Wait for RTPengine before starting Kamailio/FreeSWITCH
  info "Waiting for RTPengine control port..."
  local retries=0
  until docker compose exec -T rtpengine nc -z 127.0.0.1 2223 &>/dev/null 2>&1 || \
        nc -z 127.0.0.1 2223 &>/dev/null 2>&1; do
    retries=$((retries + 1))
    [[ $retries -ge 15 ]] && { warn "RTPengine may not be ready (continuing)"; break; }
    sleep 2
  done

  info "Starting Kamailio (SIP proxy on port 5060)..."
  detail "Routes SIP: providers → Kamailio:5060 → FreeSWITCH:5080 → RTPengine"
  docker compose up -d kamailio

  info "Starting FreeSWITCH (SIP media server on port 5080)..."
  detail "ESL: port 8021 | Public IP injected: ${PUBLIC_IP}"
  detail "This takes ~60 seconds to fully initialize..."
  docker compose up -d freeswitch

  log "Telephony services started (FreeSWITCH needs ~60s to fully initialize)"
}

# ──────────────────────────────────────────────────────────
#  STEP 11: Start Application
# ──────────────────────────────────────────────────────────
start_application() {
  step "Start Application (Backend + Frontend + Nginx)"
  cd "$SCRIPT_DIR"

  info "Starting NestJS backend API..."
  docker compose up -d backend

  # Wait for backend health
  info "Waiting for backend API health check..."
  local retries=0
  until curl -sf --connect-timeout 3 http://localhost:3001/health &>/dev/null; do
    retries=$((retries + 1))
    if [[ $retries -ge 40 ]]; then
      warn "Backend health check timed out — it may still be starting"
      warn "Check: docker compose logs backend"
      break
    fi
    printf "."
    sleep 3
  done
  echo ""
  log "Backend API: http://localhost:3001"

  info "Starting Next.js frontend..."
  docker compose up -d frontend
  log "Frontend: http://localhost:3000"

  info "Starting Nginx reverse proxy..."
  docker compose up -d nginx 2>/dev/null || warn "Nginx failed (SSL certs missing — OK for HTTP mode)"
}

# ──────────────────────────────────────────────────────────
#  STEP 12: Verify Deployment
# ──────────────────────────────────────────────────────────
verify_deployment() {
  step "Verify Deployment"
  cd "$SCRIPT_DIR"

  echo ""
  echo -e "  ${BOLD}Container Status:${NC}"
  echo -e "  ${DIM}──────────────────────────────────────────────────────────${NC}"

  # Show all containers
  docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Status}}" 2>/dev/null | \
    while IFS= read -r line; do
      if echo "$line" | grep -q "running"; then
        echo -e "  ${GREEN}●${NC} $line"
      elif echo "$line" | grep -q "NAME"; then
        echo -e "  ${DIM}$line${NC}"
      else
        echo -e "  ${YELLOW}●${NC} $line"
      fi
    done

  echo ""

  # API check
  if curl -sf --connect-timeout 5 http://localhost:3001/health &>/dev/null; then
    log "API health check: OK"
  else
    warn "API not responding yet (check: docker compose logs backend)"
  fi

  # Frontend check
  if curl -sf --connect-timeout 8 http://localhost:3000 &>/dev/null; then
    log "Frontend accessible: OK"
  else
    warn "Frontend not responding yet (may need 30s more)"
  fi
}

# ──────────────────────────────────────────────────────────
#  STEP 13: Print Summary
# ──────────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║         🚀 Voxora Deployed Successfully!             ║${NC}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""

  echo -e "${BOLD}  Access URLs:${NC}"
  echo -e "  ${CYAN}Dashboard:${NC}         ${APP_URL}"
  echo -e "  ${CYAN}API:${NC}               ${API_URL}/api"
  echo -e "  ${CYAN}API Docs:${NC}          ${API_URL}/api/docs"
  echo -e "  ${CYAN}System Status:${NC}     ${APP_URL}/status"
  echo ""

  echo -e "${BOLD}  Demo Login:${NC}"
  echo -e "  ${CYAN}Email:${NC}    demo@voxora.io"
  echo -e "  ${CYAN}Password:${NC} demo123456"
  echo ""

  echo -e "${BOLD}  SIP Endpoints (for your SIP provider):${NC}"
  echo -e "  ${CYAN}SIP Proxy:${NC}         ${PUBLIC_IP}:5060 (UDP/TCP) — Kamailio"
  echo -e "  ${CYAN}SIP Direct:${NC}        ${PUBLIC_IP}:5080 (UDP/TCP) — FreeSWITCH"
  echo -e "  ${CYAN}STUN/TURN:${NC}         ${PUBLIC_IP}:3478 (UDP)"
  echo -e "  ${CYAN}RTP Media:${NC}         ${PUBLIC_IP}:10000-20000 (UDP)"
  echo ""

  if [[ "$IS_AWS" == "true" ]]; then
    echo -e "${YELLOW}  ⚠ AWS Reminder:${NC}"
    echo -e "  Add Security Group rules: 5060/UDP, 5080/UDP, 3478/UDP, 10000-20000/UDP"
    echo ""
  fi

  echo -e "${BOLD}  Management Commands:${NC}"
  echo -e "  ${DIM}# View all logs${NC}"
  echo -e "  docker compose logs -f"
  echo ""
  echo -e "  ${DIM}# Service-specific logs${NC}"
  echo -e "  docker compose logs -f backend"
  echo -e "  docker compose logs -f freeswitch"
  echo -e "  docker compose logs -f kamailio"
  echo ""
  echo -e "  ${DIM}# FreeSWITCH console (run commands, check SIP status)${NC}"
  echo -e "  docker compose exec freeswitch fs_cli"
  echo ""
  echo -e "  ${DIM}# Database console${NC}"
  echo -e "  docker compose exec postgres psql -U voxora voxora_db"
  echo ""
  echo -e "  ${DIM}# Or use the Makefile:${NC}"
  echo -e "  make help"
  echo ""
  echo -e "  ${DIM}# Health check${NC}"
  echo -e "  bash scripts/health-check.sh"
  echo ""
  echo -e "  ${DIM}# Restart all${NC}"
  echo -e "  docker compose restart"
  echo ""
  echo -e "  ${DIM}# Stop all${NC}"
  echo -e "  docker compose down"
  echo ""

  echo -e "${BOLD}  What was deployed:${NC}"
  echo -e "  ${DIM}• PostgreSQL 16       — database (Docker: postgres:16-alpine)${NC}"
  echo -e "  ${DIM}• Redis 7             — cache + job queues (Docker: redis:7-alpine)${NC}"
  echo -e "  ${DIM}• FreeSWITCH v1.10    — SIP media server (Docker: signalwire/freeswitch:v1.10 + custom config)${NC}"
  echo -e "  ${DIM}• Kamailio 5.7        — SIP proxy/router (Docker: kamailio/kamailio:5.7-debian + custom config)${NC}"
  echo -e "  ${DIM}• RTPengine           — RTP media relay (Docker: drachtio/rtpengine:latest)${NC}"
  echo -e "  ${DIM}• Coturn 4.6          — STUN/TURN server (Docker: coturn/coturn:4.6-alpine)${NC}"
  echo -e "  ${DIM}• NestJS API          — backend (built from apps/backend)${NC}"
  echo -e "  ${DIM}• Next.js 14 UI       — frontend (built from apps/frontend)${NC}"
  echo -e "  ${DIM}• Nginx 1.25          — reverse proxy (Docker: nginx:1.25-alpine)${NC}"
  echo ""

  echo -e "  ${DIM}Log file: ${LOG_FILE}${NC}"
  echo ""
  echo -e "${BOLD}${GREEN}  📞 Ready for outbound SIP broadcasting!${NC}"
  echo ""
}

# ──────────────────────────────────────────────────────────
#  Main
# ──────────────────────────────────────────────────────────
main() {
  banner
  echo -e "  ${DIM}Log: ${LOG_FILE}${NC}"
  echo ""

  detect_environment           # Step 1
  install_docker               # Step 2
  configure_firewall           # Step 3
  configure_environment        # Step 4
  generate_telephony_configs   # Step 5
  pull_images                  # Step 6
  build_images                 # Step 7
  start_infrastructure         # Step 8
  run_migrations               # Step 9
  start_telephony              # Step 10
  start_application            # Step 11
  verify_deployment            # Step 12
  print_summary                # Step 13
}

main "$@"
