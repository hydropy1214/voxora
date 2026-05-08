# ============================================================
#  Voxora — Production Management Makefile
#  Usage: make <target>
# ============================================================

.PHONY: help setup up down restart logs ps build pull migrate seed \
        shell-backend shell-fs shell-db \
        backup restore monitor status test-sip

COMPOSE        = docker compose
COMPOSE_FILE   = -f docker-compose.yml
ENV_FILE       = .env

include $(ENV_FILE)
export

##@ General

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Deployment

setup: ## Run one-click setup (detects IP, configures .env, starts stack)
	@bash setup.sh

up: ## Start all services
	$(COMPOSE) $(COMPOSE_FILE) up -d

up-infra: ## Start only infrastructure (postgres, redis)
	$(COMPOSE) $(COMPOSE_FILE) up -d postgres redis

up-telephony: ## Start telephony stack
	$(COMPOSE) $(COMPOSE_FILE) up -d coturn rtpengine kamailio freeswitch

up-app: ## Start application services
	$(COMPOSE) $(COMPOSE_FILE) up -d backend frontend nginx

down: ## Stop all services
	$(COMPOSE) $(COMPOSE_FILE) down

down-volumes: ## Stop all services and remove volumes (DESTRUCTIVE)
	@read -p "This will delete all data. Are you sure? [y/N] " ans; \
	if [ "$$ans" = "y" ]; then \
		$(COMPOSE) $(COMPOSE_FILE) down -v; \
	fi

restart: ## Restart all services
	$(COMPOSE) $(COMPOSE_FILE) restart

restart-backend: ## Restart backend only
	$(COMPOSE) $(COMPOSE_FILE) restart backend

restart-freeswitch: ## Restart FreeSWITCH only
	$(COMPOSE) $(COMPOSE_FILE) restart freeswitch

restart-kamailio: ## Restart Kamailio only
	$(COMPOSE) $(COMPOSE_FILE) restart kamailio

##@ Building

build: ## Build all Docker images
	$(COMPOSE) $(COMPOSE_FILE) build --parallel

build-backend: ## Build backend image only
	$(COMPOSE) $(COMPOSE_FILE) build backend

build-frontend: ## Build frontend image only
	$(COMPOSE) $(COMPOSE_FILE) build frontend

pull: ## Pull latest base images
	$(COMPOSE) $(COMPOSE_FILE) pull

##@ Database

migrate: ## Run Prisma migrations
	$(COMPOSE) $(COMPOSE_FILE) exec backend npx prisma migrate deploy

migrate-dev: ## Run Prisma migrations in dev mode
	$(COMPOSE) $(COMPOSE_FILE) exec backend npx prisma migrate dev

seed: ## Seed database with demo data
	$(COMPOSE) $(COMPOSE_FILE) exec backend npm run prisma:seed

studio: ## Open Prisma Studio (DB GUI)
	$(COMPOSE) $(COMPOSE_FILE) exec backend npx prisma studio --hostname 0.0.0.0

schema: ## Print Prisma schema
	$(COMPOSE) $(COMPOSE_FILE) exec backend npx prisma format

##@ Monitoring

ps: ## Show running containers
	$(COMPOSE) $(COMPOSE_FILE) ps

status: ## Show service status with health checks
	@echo ""
	@echo "Service Status:"
	@echo "──────────────────────────────────────────────"
	@$(COMPOSE) $(COMPOSE_FILE) ps --format "table {{.Name}}\t{{.State}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "API Health:"
	@curl -sf http://localhost:3001/health | python3 -m json.tool 2>/dev/null || echo "  API not responding"
	@echo ""

logs: ## Tail all logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f --tail=100

logs-backend: ## Tail backend logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f backend

logs-frontend: ## Tail frontend logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f frontend

logs-freeswitch: ## Tail FreeSWITCH logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f freeswitch

logs-kamailio: ## Tail Kamailio logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f kamailio

logs-rtpengine: ## Tail RTPengine logs
	$(COMPOSE) $(COMPOSE_FILE) logs -f rtpengine

monitor: ## Open live system monitor
	@watch -n 2 'docker compose ps && echo "" && echo "=== API ===" && curl -sf http://localhost:3001/health | python3 -m json.tool 2>/dev/null'

##@ Shell Access

shell-backend: ## Open backend shell
	$(COMPOSE) $(COMPOSE_FILE) exec backend sh

shell-frontend: ## Open frontend shell
	$(COMPOSE) $(COMPOSE_FILE) exec frontend sh

shell-db: ## Open PostgreSQL console
	$(COMPOSE) $(COMPOSE_FILE) exec postgres psql -U $(DB_USER:-voxora) $(DB_NAME:-voxora_db)

shell-redis: ## Open Redis console
	$(COMPOSE) $(COMPOSE_FILE) exec redis redis-cli -a $(REDIS_PASSWORD)

shell-fs: ## Open FreeSWITCH console
	$(COMPOSE) $(COMPOSE_FILE) exec freeswitch fs_cli

##@ Testing

test-sip: ## Test SIP connectivity
	@echo "Testing SIP port 5060..."
	@nc -zv localhost 5060 2>&1 && echo "SIP TCP: OK" || echo "SIP TCP: FAILED"
	@echo "Testing FreeSWITCH port 5080..."
	@nc -zv localhost 5080 2>&1 && echo "FS SIP TCP: OK" || echo "FS SIP TCP: FAILED"
	@echo "Testing ESL port 8021..."
	@nc -zv localhost 8021 2>&1 && echo "ESL TCP: OK" || echo "ESL TCP: FAILED"
	@echo "Testing STUN port 3478..."
	@nc -zuv localhost 3478 2>&1 && echo "STUN UDP: OK" || echo "STUN UDP: FAILED"

test-api: ## Test API endpoints
	@echo "Testing health endpoint..."
	@curl -sf http://localhost:3001/health | python3 -m json.tool
	@echo ""
	@echo "Testing API root..."
	@curl -sf http://localhost:3001/api | python3 -m json.tool

##@ Backup / Restore

backup: ## Backup PostgreSQL database
	@mkdir -p ./backups
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
	$(COMPOSE) $(COMPOSE_FILE) exec -T postgres \
		pg_dump -U $(DB_USER:-voxora) $(DB_NAME:-voxora_db) \
		| gzip > ./backups/voxora_$$TIMESTAMP.sql.gz; \
	echo "Backup saved: ./backups/voxora_$$TIMESTAMP.sql.gz"

restore: ## Restore PostgreSQL database (BACKUP=./backups/file.sql.gz)
	@test -f "$(BACKUP)" || (echo "Set BACKUP=path/to/file.sql.gz" && exit 1)
	@gunzip -c $(BACKUP) | $(COMPOSE) $(COMPOSE_FILE) exec -T postgres \
		psql -U $(DB_USER:-voxora) $(DB_NAME:-voxora_db)
	@echo "Restore complete"

##@ SSL / Certificates

ssl-generate: ## Generate self-signed SSL certificate for testing
	@mkdir -p ./infra/nginx/ssl
	@openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
		-keyout ./infra/nginx/ssl/privkey.pem \
		-out ./infra/nginx/ssl/fullchain.pem \
		-subj "/CN=$(DOMAIN:-localhost)/O=Voxora/C=US"
	@echo "Self-signed cert generated in ./infra/nginx/ssl/"

ssl-certbot: ## Obtain Let's Encrypt certificate (requires --domain set in .env)
	@test -n "$(DOMAIN)" || (echo "Set DOMAIN= in .env" && exit 1)
	@docker run --rm -v $$(pwd)/infra/nginx/ssl:/etc/letsencrypt \
		-p 80:80 certbot/certbot certonly \
		--standalone --agree-tos --no-eff-email \
		--email admin@$(DOMAIN) -d $(DOMAIN)

##@ Updates

update: ## Update images and restart (zero-downtime for app services)
	$(COMPOSE) $(COMPOSE_FILE) pull
	$(COMPOSE) $(COMPOSE_FILE) up -d --no-deps backend frontend
	@echo "App services updated"

update-full: ## Full update including telephony stack
	$(COMPOSE) $(COMPOSE_FILE) pull
	$(COMPOSE) $(COMPOSE_FILE) up -d
	@echo "All services updated"
