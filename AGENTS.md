# Agents

## Cursor Cloud specific instructions

This repository is a **production-ready SaaS platform** called **Voxora** — a cloud-based outbound SIP voice broadcasting system. It is a fully implemented Node.js monorepo, not a scaffold.

### Repository structure

```
voxora/
├── apps/
│   ├── backend/      NestJS 10 API  (TypeScript)
│   └── frontend/     Next.js 14 UI  (TypeScript + Tailwind)
├── packages/
│   └── shared/       Shared TypeScript types
├── infra/
│   ├── freeswitch/   FreeSWITCH SIP media server (Docker + Lua scripts)
│   ├── kamailio/     Kamailio SIP proxy          (Docker + config)
│   ├── nginx/        Reverse proxy               (Docker + config)
│   ├── coturn/       STUN/TURN server            (config only)
│   └── rtpengine/    RTP relay                   (config only)
├── scripts/          Utility shell scripts
├── docs/             Deployment documentation
├── docker-compose.yml          Production stack (9 services)
├── docker-compose.dev.yml      Development overrides
└── setup.sh                    One-click deploy script
```

### Installing dependencies

```bash
# Backend
cd apps/backend && npm install

# Frontend
cd apps/frontend && npm install

# Root workspace tools
npm install
```

### Building

```bash
# Backend (NestJS → dist/)
cd apps/backend && npm run build

# Frontend (Next.js → .next/)
cd apps/frontend && npm run build
```

### Running lint

```bash
cd apps/backend && npm run lint
cd apps/frontend && npm run lint
```

### Running tests

```bash
cd apps/backend && npm test
```

### Running the dev environment

```bash
# Option 1: Docker Compose (recommended — starts postgres + redis)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis

# Then run app services locally:
cd apps/backend  && npm run start:dev   # http://localhost:3001
cd apps/frontend && npm run dev         # http://localhost:3000
```

### One-click production deploy (AWS EC2 / any Linux)

```bash
sudo ./setup.sh             # auto-detects public IP
sudo ./setup.sh --skip-firewall   # when using AWS Security Groups
```

### Environment variables

All environment variables are documented in `.env.example`. The `setup.sh` script auto-generates a `.env` with secure random secrets.

Key required vars: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`, `DATABASE_URL`.

### Key caveats

- The backend uses `modesl` (CommonJS) for FreeSWITCH ESL — import it with `require('modesl')`, **not** `import * as esl from 'modesl'`.
- `libphonenumber-js` is used for phone validation in the contacts import service.
- FreeSWITCH and Kamailio use `network_mode: host` in Docker — they cannot run behind a Docker bridge network for SIP to work correctly.
- The campaign BullMQ processor connects to FreeSWITCH via ESL on startup (5s deferred, exponential backoff retry). Campaigns require ESL to be connected.
- Prisma migrations must be run before the backend will start: `npx prisma migrate deploy`.
