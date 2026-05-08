#!/usr/bin/env bash
# ============================================================
#  Voxora — One-Click Production Deploy
#  Supports: Ubuntu 20.04/22.04, AWS EC2, bare-metal
# ============================================================
set -euo pipefail

# ──────────────────────────────────────────────────────────
#  Color helpers
# ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[✓]${NC} $*"; }
info()    { echo -e "${CYAN}[→]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; }
header()  { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════════════${NC}"; echo -e "${BOLD}${BLUE}  $*${NC}"; echo -e "${BOLD}${BLUE}══════════════════════════════════════════════${NC}\n"; }
banner() {
  echo -e "${BOLD}${BLUE}"
  cat << 'EOF'
 __   __                              
 \ \ / /__ __  ___  _ _ __ _         
  \ V / _ \ || / _ \| '_/ _` |        
   \_/\___/\_,_\___/|_| \__,_|        
                                      
  Cloud SIP Voice Broadcasting Platform
EOF
  echo -e "${NC}"
}

# ──────────────────────────────────────────────────────────
#  Constants
# ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
MIN_DOCKER_VERSION="24.0"
MIN_COMPOSE_VERSION="2.20"
REQUIRED_PORTS=(80 443 3000 3001 5060 5080 8021 3478 10000)

# ──────────────────────────────────────────────────────────
#  Parse CLI arguments
# ──────────────────────────────────────────────────────────
SKIP_DEPS=false
SKIP_FIREWALL=false
FORCE_REINSTALL=false
DEV_MODE=false
DOMAIN=""
PUBLIC_IP=""

usage() {
  cat << EOF
Usage: $0 [OPTIONS]

Options:
  --domain DOMAIN       Set domain name (e.g. app.voxora.io)
  --ip IP               Override public IP detection
  --skip-deps           Skip dependency installation
  --skip-firewall       Skip firewall configuration
  --force               Force reinstall even if already running
  --dev                 Use dev mode (no SSL, localhost)
  -h, --help            Show this help

Examples:
  # Full production deploy on AWS EC2
  sudo ./setup.sh --domain app.voxora.io

  # Quick start without a domain (uses IP)
  sudo ./setup.sh

  # Dev mode (local only)
  ./setup.sh --dev
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --ip)     PUBLIC_IP="$2"; shift 2 ;;
    --skip-deps) SKIP_DEPS=true; shift ;;
    --skip-firewall) SKIP_FIREWALL=true; shift ;;
    --force)  FORCE_REINSTALL=true; shift ;;
    --dev)    DEV_MODE=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# ──────────────────────────────────────────────────────────
#  Detect environment
# ──────────────────────────────────────────────────────────
detect_environment() {
  header "Detecting Environment"

  # Detect if running as root
  if [[ $EUID -ne 0 ]] && [[ "$DEV_MODE" == "false" ]]; then
    warn "Running as non-root. Some operations may require sudo."
    warn "For full production deploy, run: sudo ./setup.sh"
  fi

  # Detect OS
  if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    OS_NAME="${NAME}"
    OS_VERSION="${VERSION_ID}"
    info "OS: ${OS_NAME} ${OS_VERSION}"
  else
    OS_NAME="Unknown"
    warn "Could not detect OS"
  fi

  # Detect if AWS EC2
  IS_AWS=false
  if curl -sf --connect-timeout 2 http://169.254.169.254/latest/meta-data/instance-id &>/dev/null; then
    IS_AWS=true
    AWS_INSTANCE_ID=$(curl -sf --connect-timeout 2 http://169.254.169.254/latest/meta-data/instance-id)
    AWS_AZ=$(curl -sf --connect-timeout 2 http://169.254.169.254/latest/meta-data/placement/availability-zone)
    log "Running on AWS EC2 (instance: ${AWS_INSTANCE_ID}, AZ: ${AWS_AZ})"
  else
    info "Not on AWS EC2 (bare-metal / other cloud)"
  fi

  # Detect public IP
  if [[ -n "$PUBLIC_IP" ]]; then
    info "Using provided IP: ${PUBLIC_IP}"
  else
    info "Detecting public IP..."
    PUBLIC_IP=""

    # Try multiple sources in order of reliability
    for source in \
      "https://checkip.amazonaws.com" \
      "https://api.ipify.org" \
      "https://ifconfig.me/ip" \
      "https://icanhazip.com"; do
      IP=$(curl -sf --connect-timeout 5 "$source" 2>/dev/null | tr -d '[:space:]') || true
      if [[ "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        PUBLIC_IP="$IP"
        log "Public IP detected: ${PUBLIC_IP} (via ${source})"
        break
      fi
    done

    if [[ -z "$PUBLIC_IP" ]]; then
      # Fallback: local IP
      PUBLIC_IP=$(hostname -I | awk '{print $1}')
      warn "Could not detect public IP. Using local IP: ${PUBLIC_IP}"
    fi
  fi

  # Detect private IP (for SIP binding)
  PRIVATE_IP=$(hostname -I | awk '{print $1}')
  info "Private IP: ${PRIVATE_IP}"

  # Set app URL
  if [[ "$DEV_MODE" == "true" ]]; then
    APP_URL="http://localhost:3000"
    API_URL="http://localhost:3001"
  elif [[ -n "$DOMAIN" ]]; then
    APP_URL="https://${DOMAIN}"
    API_URL="https://${DOMAIN}"
  else
    APP_URL="http://${PUBLIC_IP}"
    API_URL="http://${PUBLIC_IP}:3001"
  fi

  info "App URL: ${APP_URL}"
  info "API URL: ${API_URL}"
}

# ──────────────────────────────────────────────────────────
#  Check/install dependencies
# ──────────────────────────────────────────────────────────
install_dependencies() {
  header "Checking Dependencies"

  if [[ "$SKIP_DEPS" == "true" ]]; then
    warn "Skipping dependency installation (--skip-deps)"
    return
  fi

  # Check/install Docker
  if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | bash
    systemctl enable docker
    systemctl start docker
    # Add current user to docker group
    if [[ $EUID -ne 0 ]]; then
      usermod -aG docker "$USER" || true
    fi
    log "Docker installed"
  else
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0")
    log "Docker found: v${DOCKER_VERSION}"
  fi

  # Check/install Docker Compose
  if ! docker compose version &>/dev/null; then
    info "Installing Docker Compose plugin..."
    apt-get update -qq
    apt-get install -y docker-compose-plugin
    log "Docker Compose installed"
  else
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "0")
    log "Docker Compose found: v${COMPOSE_VERSION}"
  fi

  # Install additional tools
  for pkg in curl wget jq openssl netcat-openbsd; do
    if ! command -v "${pkg%%-*}" &>/dev/null; then
      info "Installing ${pkg}..."
      apt-get install -y "$pkg" 2>/dev/null || yum install -y "$pkg" 2>/dev/null || true
    fi
  done

  log "All dependencies satisfied"
}

# ──────────────────────────────────────────────────────────
#  Generate secure secrets
# ──────────────────────────────────────────────────────────
generate_secret() {
  openssl rand -base64 48 | tr -d '=+/' | head -c 64
}

generate_password() {
  openssl rand -base64 24 | tr -d '=+/' | head -c 32
}

# ──────────────────────────────────────────────────────────
#  Configure environment
# ──────────────────────────────────────────────────────────
configure_environment() {
  header "Configuring Environment"

  # Backup existing .env
  if [[ -f "$ENV_FILE" ]]; then
    cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
    info "Backed up existing .env"
  fi

  # Load existing .env values if present (don't regenerate secrets)
  EXISTING_JWT_SECRET=""
  EXISTING_JWT_REFRESH_SECRET=""
  EXISTING_DB_PASS=""
  EXISTING_REDIS_PASS=""
  EXISTING_ESL_PASS=""
  EXISTING_COTURN_SECRET=""

  if [[ -f "$ENV_FILE" ]]; then
    EXISTING_JWT_SECRET=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
    EXISTING_JWT_REFRESH_SECRET=$(grep '^JWT_REFRESH_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
    EXISTING_DB_PASS=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
    EXISTING_REDIS_PASS=$(grep '^REDIS_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
    EXISTING_ESL_PASS=$(grep '^FREESWITCH_ESL_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
    EXISTING_COTURN_SECRET=$(grep '^COTURN_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
  fi

  # Use existing secrets or generate new ones
  JWT_SECRET="${EXISTING_JWT_SECRET:-$(generate_secret)}"
  JWT_REFRESH_SECRET="${EXISTING_JWT_REFRESH_SECRET:-$(generate_secret)}"
  DB_PASSWORD="${EXISTING_DB_PASS:-$(generate_password)}"
  REDIS_PASSWORD="${EXISTING_REDIS_PASS:-$(generate_password)}"
  ESL_PASSWORD="${EXISTING_ESL_PASS:-$(generate_password)}"
  COTURN_SECRET="${EXISTING_COTURN_SECRET:-$(generate_secret)}"

  # Construct DATABASE_URL
  DATABASE_URL="postgresql://voxora:${DB_PASSWORD}@postgres:5432/voxora_db?schema=public"

  log "Writing .env file..."

  cat > "$ENV_FILE" << EOF
# ============================================================
# Voxora Production Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Public IP: ${PUBLIC_IP}
# ============================================================

# ── Application ──────────────────────────────────────────
NODE_ENV=production
APP_PORT=3001
APP_URL=${APP_URL}
FRONTEND_URL=${APP_URL}
PUBLIC_IP=${PUBLIC_IP}
PRIVATE_IP=${PRIVATE_IP}
DOMAIN=${DOMAIN}

# ── JWT ──────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Database ─────────────────────────────────────────────
DB_HOST=postgres
DB_PORT=5432
DB_NAME=voxora_db
DB_USER=voxora
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=${DATABASE_URL}

# ── Redis ────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# ── FreeSWITCH ESL ───────────────────────────────────────
FREESWITCH_HOST=freeswitch
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=${ESL_PASSWORD}

# ── Kamailio ─────────────────────────────────────────────
KAMAILIO_HOST=kamailio

# ── RTPengine ────────────────────────────────────────────
RTPENGINE_HOST=rtpengine
RTPENGINE_PORT=2223
RTPENGINE_MIN_PORT=10000
RTPENGINE_MAX_PORT=20000

# ── Coturn ───────────────────────────────────────────────
COTURN_HOST=${PUBLIC_IP}
COTURN_PORT=3478
COTURN_SECRET=${COTURN_SECRET}

# ── Mail (configure with your SMTP provider) ─────────────
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_USER=postmaster@mg.voxora.io
MAIL_PASS=your-mailgun-password
MAIL_FROM=noreply@voxora.io

# ── Storage ──────────────────────────────────────────────
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=/app/uploads

# ── Stripe (optional) ────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
STRIPE_PRICE_STARTER=price_replace_me
STRIPE_PRICE_GROWTH=price_replace_me
STRIPE_PRICE_PRO=price_replace_me
STRIPE_PRICE_ENTERPRISE=price_replace_me

# ── Frontend ─────────────────────────────────────────────
NEXT_PUBLIC_API_URL=${API_URL}
NEXT_PUBLIC_WS_URL=${API_URL}
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_replace_me
EOF

  log ".env configured with public IP: ${PUBLIC_IP}"
}

# ──────────────────────────────────────────────────────────
#  Configure firewall
# ──────────────────────────────────────────────────────────
configure_firewall() {
  header "Configuring Firewall"

  if [[ "$SKIP_FIREWALL" == "true" ]]; then
    warn "Skipping firewall configuration (--skip-firewall)"
    return
  fi

  if [[ "$IS_AWS" == "true" ]]; then
    warn "On AWS EC2 — configure Security Group rules manually:"
    echo ""
    echo "  Required inbound rules:"
    printf "  %-12s %-10s %-20s %s\n" "Protocol" "Port(s)" "Source" "Purpose"
    printf "  %-12s %-10s %-20s %s\n" "--------" "-------" "------" "-------"
    printf "  %-12s %-10s %-20s %s\n" "TCP" "22" "Your IP" "SSH"
    printf "  %-12s %-10s %-20s %s\n" "TCP" "80,443" "0.0.0.0/0" "HTTP/HTTPS"
    printf "  %-12s %-10s %-20s %s\n" "TCP" "3000,3001" "0.0.0.0/0" "App + API"
    printf "  %-12s %-10s %-20s %s\n" "UDP/TCP" "5060" "0.0.0.0/0" "SIP"
    printf "  %-12s %-10s %-20s %s\n" "UDP/TCP" "5080" "0.0.0.0/0" "SIP (FS)"
    printf "  %-12s %-10s %-20s %s\n" "TCP" "8021" "127.0.0.1" "ESL"
    printf "  %-12s %-10s %-20s %s\n" "UDP" "3478" "0.0.0.0/0" "STUN/TURN"
    printf "  %-12s %-10s %-20s %s\n" "UDP" "10000-20000" "0.0.0.0/0" "RTP Media"
    echo ""
    return
  fi

  # UFW firewall
  if command -v ufw &>/dev/null; then
    info "Configuring UFW firewall..."
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp     # HTTP
    ufw allow 443/tcp    # HTTPS
    ufw allow 3000/tcp   # Frontend
    ufw allow 3001/tcp   # API
    ufw allow 5060/udp   # SIP (Kamailio)
    ufw allow 5060/tcp   # SIP (Kamailio)
    ufw allow 5080/udp   # SIP (FreeSWITCH)
    ufw allow 5080/tcp   # SIP (FreeSWITCH)
    ufw allow 5061/tcp   # SIP TLS
    ufw allow 3478/udp   # STUN/TURN
    ufw allow 3478/tcp   # STUN/TURN
    ufw allow 5349/tcp   # STUN/TURN TLS
    ufw allow 10000:20000/udp  # RTP media
    ufw --force enable
    log "UFW firewall configured"
  elif command -v firewall-cmd &>/dev/null; then
    info "Configuring firewalld..."
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --permanent --add-port=3001/tcp
    firewall-cmd --permanent --add-port=5060/udp
    firewall-cmd --permanent --add-port=5060/tcp
    firewall-cmd --permanent --add-port=5080/udp
    firewall-cmd --permanent --add-port=5080/tcp
    firewall-cmd --permanent --add-port=3478/udp
    firewall-cmd --permanent --add-port=3478/tcp
    firewall-cmd --permanent --add-port=10000-20000/udp
    firewall-cmd --reload
    log "firewalld configured"
  else
    warn "No supported firewall found (ufw/firewalld). Configure ports manually."
  fi
}

# ──────────────────────────────────────────────────────────
#  Generate telephony configs
# ──────────────────────────────────────────────────────────
generate_telephony_configs() {
  header "Generating Telephony Configs"

  # ── FreeSWITCH vars.xml ─────────────────────────────────
  info "Writing FreeSWITCH vars.xml..."
  mkdir -p "${SCRIPT_DIR}/infra/freeswitch/conf"
  cat > "${SCRIPT_DIR}/infra/freeswitch/conf/vars.xml" << EOF
<include>
  <!-- Voxora FreeSWITCH Variables -->
  <X-PRE-PROCESS cmd="set" data="default_password=${ESL_PASSWORD}"/>
  <X-PRE-PROCESS cmd="set" data="public_ip=${PUBLIC_IP}"/>
  <X-PRE-PROCESS cmd="set" data="local_ip_v4=${PRIVATE_IP}"/>
  <X-PRE-PROCESS cmd="set" data="domain=\$\${local_ip_v4}"/>
  <X-PRE-PROCESS cmd="set" data="domain_name=\$\${domain}"/>
  <X-PRE-PROCESS cmd="set" data="hold_music=local_stream://moh"/>
  <X-PRE-PROCESS cmd="set" data="use_profile=voxora_outbound"/>
  <X-PRE-PROCESS cmd="set" data="rtp_start_port=10000"/>
  <X-PRE-PROCESS cmd="set" data="rtp_end_port=20000"/>
</include>
EOF
  log "FreeSWITCH vars.xml written"

  # ── Coturn config ───────────────────────────────────────
  info "Writing Coturn config..."
  mkdir -p "${SCRIPT_DIR}/infra/coturn"
  cat > "${SCRIPT_DIR}/infra/coturn/turnserver.conf" << EOF
# Coturn STUN/TURN — Voxora Production Config
listening-port=3478
tls-listening-port=5349
listening-ip=${PRIVATE_IP}
relay-ip=${PRIVATE_IP}
external-ip=${PUBLIC_IP}/${PRIVATE_IP}
realm=voxora.io
use-auth-secret
static-auth-secret=${COTURN_SECRET}
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
lt-cred-mech
EOF
  log "Coturn config written"

  # ── RTPengine defaults ─────────────────────────────────
  info "Writing RTPengine config..."
  mkdir -p "${SCRIPT_DIR}/infra/rtpengine"
  cat > "${SCRIPT_DIR}/infra/rtpengine/rtpengine.conf" << EOF
[rtpengine]
interface = ${PRIVATE_IP}!${PUBLIC_IP}
listen-ng = 127.0.0.1:2223
listen-tcp = 127.0.0.1:2222
port-min = 10000
port-max = 20000
log-level = 6
log-facility = daemon
delete-delay = 30
timeout = 60
silent-timeout = 3600
final-timeout = 10800
tos = 184
control-tos = 184
EOF
  log "RTPengine config written"

  log "Telephony configs generated"
}

# ──────────────────────────────────────────────────────────
#  Start Docker stack
# ──────────────────────────────────────────────────────────
start_services() {
  header "Starting Docker Stack"

  cd "$SCRIPT_DIR"

  # Pull latest images
  info "Pulling Docker images..."
  docker compose pull --ignore-pull-failures 2>/dev/null || true

  # Build custom images
  info "Building application images..."
  docker compose build --parallel 2>&1 | grep -E '(STEP|Step|Building|Successfully|error|ERROR)' || true

  # Start infrastructure first
  info "Starting infrastructure services (postgres, redis)..."
  docker compose up -d postgres redis
  
  # Wait for postgres
  info "Waiting for PostgreSQL to be ready..."
  local retries=0
  until docker compose exec -T postgres pg_isready -U voxora -d voxora_db &>/dev/null; do
    retries=$((retries + 1))
    if [[ $retries -ge 30 ]]; then
      error "PostgreSQL failed to start after 60s"
      docker compose logs postgres | tail -20
      exit 1
    fi
    sleep 2
  done
  log "PostgreSQL ready"

  # Wait for redis
  info "Waiting for Redis to be ready..."
  retries=0
  until docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" ping 2>/dev/null | grep -q PONG; do
    retries=$((retries + 1))
    if [[ $retries -ge 15 ]]; then
      error "Redis failed to start after 30s"
      exit 1
    fi
    sleep 2
  done
  log "Redis ready"

  # Run migrations
  info "Running database migrations..."
  docker compose run --rm backend sh -c "npx prisma migrate deploy"
  log "Migrations applied"

  # Seed database
  info "Seeding database with demo data..."
  docker compose run --rm backend sh -c "npm run prisma:seed" 2>/dev/null || \
    warn "Seed skipped (already seeded or seed not configured)"

  # Start telephony stack
  info "Starting telephony services..."
  docker compose up -d rtpengine coturn freeswitch kamailio
  sleep 3

  # Start application
  info "Starting application services..."
  docker compose up -d backend
  
  info "Waiting for backend API to be healthy..."
  retries=0
  until curl -sf --connect-timeout 3 http://localhost:3001/health &>/dev/null; do
    retries=$((retries + 1))
    if [[ $retries -ge 30 ]]; then
      warn "Backend health check timed out. Check logs: docker compose logs backend"
      break
    fi
    sleep 3
  done
  log "Backend API ready"

  # Start frontend
  docker compose up -d frontend

  # Start nginx last
  docker compose up -d nginx 2>/dev/null || warn "Nginx not started (SSL certs may be missing)"

  log "All services started"
}

# ──────────────────────────────────────────────────────────
#  Verify deployment
# ──────────────────────────────────────────────────────────
verify_deployment() {
  header "Verifying Deployment"

  local all_ok=true

  # Check container health
  echo ""
  printf "  %-25s %-12s %s\n" "Service" "Status" "Health"
  printf "  %-25s %-12s %s\n" "-------" "------" "------"

  while IFS= read -r line; do
    NAME=$(echo "$line" | awk '{print $1}')
    STATUS=$(echo "$line" | awk '{print $2}')
    HEALTH=$(echo "$line" | awk '{print $3}')

    if [[ "$STATUS" == "running" ]]; then
      STATUS_COLOR="${GREEN}running${NC}"
    else
      STATUS_COLOR="${RED}${STATUS}${NC}"
      all_ok=false
    fi

    if [[ "$HEALTH" == "healthy" ]]; then
      HEALTH_COLOR="${GREEN}healthy${NC}"
    elif [[ "$HEALTH" == "starting" ]]; then
      HEALTH_COLOR="${YELLOW}starting${NC}"
    elif [[ -n "$HEALTH" ]]; then
      HEALTH_COLOR="${RED}${HEALTH}${NC}"
    else
      HEALTH_COLOR="${CYAN}no check${NC}"
    fi

    printf "  %-25s " "$NAME"
    echo -e "${STATUS_COLOR} ${HEALTH_COLOR}"
  done < <(docker compose ps --format "{{.Name}} {{.State}} {{.Health}}" 2>/dev/null | sort)

  echo ""

  # API health check
  if curl -sf --connect-timeout 5 http://localhost:3001/health &>/dev/null; then
    log "Backend API: healthy"
  else
    warn "Backend API: not responding yet"
  fi

  # Frontend check
  if curl -sf --connect-timeout 5 http://localhost:3000 &>/dev/null; then
    log "Frontend: accessible"
  else
    warn "Frontend: not responding yet (may take a few seconds)"
  fi

  # SIP port check
  if nc -z -u localhost 5060 2>/dev/null || nc -z localhost 5060 2>/dev/null; then
    log "SIP port 5060: open"
  else
    info "SIP port 5060: check Docker logs if issues arise"
  fi

  echo ""
  if [[ "$all_ok" == "true" ]]; then
    log "All services running successfully"
  else
    warn "Some services may need attention. Check: docker compose logs"
  fi
}

# ──────────────────────────────────────────────────────────
#  Print final summary
# ──────────────────────────────────────────────────────────
print_summary() {
  header "Deployment Complete"

  echo -e "${BOLD}${GREEN}  🚀 Voxora is running!${NC}"
  echo ""
  echo -e "${BOLD}  Access URLs:${NC}"
  echo -e "  ${CYAN}Dashboard:${NC}    ${APP_URL}"
  echo -e "  ${CYAN}API:${NC}          ${API_URL}/api"
  echo -e "  ${CYAN}API Docs:${NC}     ${API_URL}/api/docs"
  echo -e "  ${CYAN}Health:${NC}       ${API_URL}/health"
  echo ""
  echo -e "${BOLD}  Demo Credentials:${NC}"
  echo -e "  ${CYAN}Email:${NC}    demo@voxora.io"
  echo -e "  ${CYAN}Password:${NC} demo123456"
  echo ""
  echo -e "${BOLD}  SIP Endpoints:${NC}"
  echo -e "  ${CYAN}SIP UDP/TCP:${NC}  ${PUBLIC_IP}:5060 (Kamailio proxy)"
  echo -e "  ${CYAN}SIP UDP/TCP:${NC}  ${PUBLIC_IP}:5080 (FreeSWITCH direct)"
  echo -e "  ${CYAN}STUN:${NC}         ${PUBLIC_IP}:3478"
  echo -e "  ${CYAN}RTP Media:${NC}    ${PUBLIC_IP}:10000-20000/UDP"
  echo ""
  echo -e "${BOLD}  Management:${NC}"
  echo -e "  ${CYAN}View logs:${NC}         docker compose logs -f"
  echo -e "  ${CYAN}Backend logs:${NC}      docker compose logs -f backend"
  echo -e "  ${CYAN}FreeSWITCH logs:${NC}   docker compose logs -f freeswitch"
  echo -e "  ${CYAN}Restart all:${NC}       docker compose restart"
  echo -e "  ${CYAN}Stop all:${NC}          docker compose down"
  echo -e "  ${CYAN}DB console:${NC}        docker compose exec postgres psql -U voxora voxora_db"
  echo -e "  ${CYAN}FS console:${NC}        docker compose exec freeswitch fs_cli"
  echo ""

  if [[ "$IS_AWS" == "true" ]]; then
    echo -e "${YELLOW}  AWS Security Group reminder:${NC}"
    echo -e "  Open ports: 80, 443, 3000, 3001, 5060/udp+tcp, 5080/udp, 3478/udp, 10000-20000/udp"
    echo ""
  fi

  echo -e "${BOLD}  Configuration saved to:${NC} .env"
  echo -e "${BOLD}  Backup at:${NC} .env.bak.*"
  echo ""
  echo -e "${BOLD}${GREEN}  Happy broadcasting! 📞${NC}"
  echo ""
}

# ──────────────────────────────────────────────────────────
#  Main
# ──────────────────────────────────────────────────────────
main() {
  banner
  detect_environment
  install_dependencies
  configure_environment
  configure_firewall
  generate_telephony_configs
  start_services
  verify_deployment
  print_summary
}

main "$@"
