# Voxora — Cloud SIP Voice Broadcasting Platform

> Enterprise-grade outbound SIP voice broadcasting. Direct SIP protocol. No telecom APIs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Overview

Voxora is a production-ready, multi-tenant SaaS platform for outbound voice broadcasting using direct SIP protocol via FreeSWITCH + Kamailio. No Twilio, Plivo, or any telecom APIs.

### Key Features

- **Direct SIP** — FreeSWITCH + Kamailio, any SIP provider
- **AMD** — Answering Machine Detection (human vs voicemail)
- **Realtime** — Socket.io live dashboard, live call monitoring
- **Multi-tenant** — Organization-scoped accounts
- **Campaign Engine** — BullMQ queues, concurrent call control, CPS limiter
- **Analytics** — Call outcomes, RTP quality (MOS), timeline charts
- **Billing** — Stripe subscription management

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Nginx Proxy                             │
│                    (SSL termination + routing)                   │
└────────────┬──────────────────────────────┬────────────────────┘
             │                              │
    ┌────────▼──────────┐        ┌─────────▼──────────┐
    │   Next.js 14      │        │   NestJS 10 API     │
    │   Frontend        │        │   + Socket.io       │
    │   (TypeScript)    │        │   (TypeScript)      │
    └───────────────────┘        └─────────┬──────────┘
                                           │
               ┌───────────────────────────┼───────────────────────┐
               │                           │                       │
    ┌──────────▼──────┐       ┌────────────▼──────┐   ┌──────────▼──────┐
    │   PostgreSQL 16  │       │   Redis 7          │   │   BullMQ        │
    │   (Prisma ORM)   │       │   (cache + pub/sub)│   │   (job queues)  │
    └──────────────────┘       └────────────────────┘   └─────────────────┘

                    Telephony Stack
    ┌─────────────────────────────────────────────────────┐
    │                                                     │
    │  ┌────────────┐   ┌──────────────┐   ┌───────────┐ │
    │  │ FreeSWITCH │   │   Kamailio   │   │ RTPengine │ │
    │  │  (ESL API) │   │ (SIP proxy)  │   │ (RTP relay│ │
    │  └────────────┘   └──────────────┘   └───────────┘ │
    │                                                     │
    │  ┌────────────────────────────────────────────────┐ │
    │  │           Coturn (STUN/TURN)                   │ │
    │  └────────────────────────────────────────────────┘ │
    └─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Shadcn UI, Recharts |
| Backend | NestJS 10, TypeScript, PostgreSQL, Prisma ORM |
| Realtime | Socket.io, Redis Pub/Sub |
| Queue | BullMQ (Redis-backed) |
| Telephony | FreeSWITCH, Kamailio, RTPengine, Coturn |
| Infrastructure | Docker, Docker Compose, Nginx |

---

## Project Structure

```
voxora/
├── apps/
│   ├── backend/                    # NestJS API
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # JWT auth, refresh tokens, email verification
│   │   │   │   ├── users/          # User profile management
│   │   │   │   ├── sip-accounts/   # SIP provider management
│   │   │   │   ├── contacts/       # CSV import, contact lists
│   │   │   │   ├── audio-files/    # MP3/WAV upload & management
│   │   │   │   ├── campaigns/      # Campaign CRUD + BullMQ processor
│   │   │   │   ├── live-monitor/   # Real-time stats API
│   │   │   │   ├── recordings/     # Call recording archive
│   │   │   │   ├── analytics/      # Dashboard + performance data
│   │   │   │   └── billing/        # Stripe subscriptions
│   │   │   ├── services/
│   │   │   │   └── sip/            # FreeSWITCH ESL client
│   │   │   ├── gateways/           # Socket.io WebSocket gateway
│   │   │   └── prisma/             # Database client
│   │   └── prisma/
│   │       └── schema.prisma       # Database schema
│   │
│   └── frontend/                   # Next.js 14 app
│       └── src/
│           ├── app/
│           │   ├── (auth)/         # Login, signup, forgot password
│           │   └── (dashboard)/    # All dashboard pages
│           ├── components/         # Reusable UI components
│           ├── hooks/              # Custom hooks (useLiveStats)
│           ├── lib/                # API client, utilities
│           └── store/              # Zustand state management
│
├── infra/
│   ├── freeswitch/                 # FreeSWITCH config + Lua scripts
│   ├── kamailio/                   # Kamailio SIP proxy config
│   ├── rtpengine/                  # RTPengine config
│   ├── coturn/                     # STUN/TURN server config
│   └── nginx/                      # Reverse proxy config
│
├── packages/
│   └── shared/                     # Shared TypeScript types
│
├── docker-compose.yml              # Production stack
├── docker-compose.dev.yml          # Development overrides
└── .env.example                    # Environment template
```

---

## Quick Start

### Prerequisites

- Docker + Docker Compose v2
- Node.js 20+ (for local development)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/voxora.git
cd voxora
cp .env.example .env
# Edit .env with your settings
```

### 2. Start with Docker

```bash
# Production (full stack)
docker compose up -d

# Development (no telephony services)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker compose logs -f backend
docker compose logs -f frontend
```

### 3. Initialize database

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

### 4. Access the application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| API Docs | http://localhost:3001/api/docs |

Demo credentials: `demo@voxora.io` / `demo123456`

---

## Local Development

```bash
# Install dependencies
npm install

# Start PostgreSQL + Redis only
docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres redis -d

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Start backend
npm run dev:backend

# Start frontend (in another terminal)
npm run dev:frontend
```

---

## Configuration

### Required Environment Variables

```bash
# Core
JWT_SECRET=<32+ char random string>
DATABASE_URL=postgresql://voxora:pass@localhost:5432/voxora_db

# FreeSWITCH ESL (for telephony)
FREESWITCH_HOST=localhost
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=ClueCon

# Stripe (for billing, optional)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

See `.env.example` for full configuration reference.

---

## Campaign Flow

```
1. User adds SIP account → FreeSWITCH gateway registration
2. User uploads contacts (CSV) → Phone validation + deduplication
3. User uploads audio (MP3/WAV) → Stored + duration analysis
4. User creates campaign → Links SIP + contacts + audio
5. User starts campaign → BullMQ job queued
6. Campaign processor → Dials contacts via FreeSWITCH ESL
7. AMD detection → Human/machine/voicemail decision
8. Audio playback → Full call recording
9. Realtime updates → Socket.io events to dashboard
10. Campaign complete → Analytics stored
```

---

## API Documentation

Interactive Swagger UI: `http://localhost:3001/api/docs`

### Key Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/sip-accounts
POST   /api/sip-accounts
POST   /api/sip-accounts/:id/test

GET    /api/contacts/lists
POST   /api/contacts/lists/:id/import

GET    /api/audio-files
POST   /api/audio-files/upload

GET    /api/campaigns
POST   /api/campaigns
POST   /api/campaigns/:id/start
POST   /api/campaigns/:id/pause
POST   /api/campaigns/:id/stop

GET    /api/analytics/dashboard
GET    /api/live-monitor/stats

GET    /api/billing/plans
POST   /api/billing/checkout
```

---

## WebSocket Events

Connect to `ws://localhost:3001` with JWT auth token.

```javascript
// Subscribe to live monitor
socket.emit('join:live-monitor')
socket.on('call:answered', (data) => { ... })
socket.on('call:hangup', (data) => { ... })
socket.on('stats:update', (data) => { ... })

// Subscribe to specific campaign
socket.emit('join:campaign', { campaignId: 'xxx' })
socket.on('campaign:completed', (data) => { ... })
```

---

## Billing Plans

| Plan | Concurrent | Monthly |
|------|-----------|---------|
| Trial | 2 | Free (14 days) |
| Starter | 10 | $49 |
| Growth | 50 | $149 |
| Pro | 200 | $399 |
| Enterprise | 1,000+ | Custom |

---

## Production Deployment

1. **Set all environment variables** in `.env`
2. **Configure SSL certificates** in `infra/nginx/ssl/`
3. **Update domain** in `infra/nginx/conf.d/voxora.conf`
4. **Set FreeSWITCH external IP** for NAT traversal
5. **Configure Coturn** with your public IP
6. **Point DNS** to your server IP

```bash
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
```

---

## License

MIT © Voxora
