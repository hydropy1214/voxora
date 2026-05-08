# Voxora — Cloud SIP Voice Broadcasting Platform

<div align="center">

```
 __   __                              
 \ \ / /__ __  ___  _ _ __ _         
  \ V / _ \ || / _ \| '_/ _` |        
   \_/\___/\_,_\___/|_| \__,_|        
```

**Enterprise outbound voice broadcasting using direct SIP protocol.**  
No Twilio. No Plivo. No telecom APIs. Your SIP provider. Your calls.

[![Backend](https://img.shields.io/badge/Backend-NestJS%2010-e0234e?logo=nestjs)](apps/backend)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2014-black?logo=next.js)](apps/frontend)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%2016-4169e1?logo=postgresql)](apps/backend/prisma/schema.prisma)
[![SIP](https://img.shields.io/badge/SIP-FreeSWITCH%20%2B%20Kamailio-orange)](infra/freeswitch)
[![Deploy](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ed?logo=docker)](docker-compose.yml)

</div>

---

## Table of Contents

1. [What is Voxora?](#1-what-is-voxora)
2. [How It Works — Plain English](#2-how-it-works--plain-english)
3. [Telecom Architecture Explained](#3-telecom-architecture-explained)
4. [Full System Architecture](#4-full-system-architecture)
5. [One-Click Deploy (AWS / Linux)](#5-one-click-deploy-aws--linux)
6. [Manual Setup](#6-manual-setup)
7. [First Steps After Install](#7-first-steps-after-install)
8. [SIP Provider Setup](#8-sip-provider-setup)
9. [Running Your First Campaign](#9-running-your-first-campaign)
10. [How Calls Actually Work](#10-how-calls-actually-work)
11. [All Services Explained](#11-all-services-explained)
12. [Port Reference](#12-port-reference)
13. [Environment Variables](#13-environment-variables)
14. [Project Structure](#14-project-structure)
15. [API Reference](#15-api-reference)
16. [Troubleshooting](#16-troubleshooting)
17. [FAQ](#17-faq)

---

## 1. What is Voxora?

Voxora is a **self-hosted SaaS platform** that lets you run outbound voice broadcasting campaigns at scale.

### What you can do with Voxora

| Feature | Description |
|---------|-------------|
| **Outbound calling** | Dial thousands of contacts automatically |
| **Audio broadcasting** | Play a pre-recorded MP3/WAV message when someone answers |
| **Voicemail drop** | Leave a voicemail automatically when a machine answers |
| **AMD** | Automatically detect if a human or voicemail answered |
| **Real-time monitoring** | Watch every call live as it happens |
| **Campaign management** | Create, start, pause, stop campaigns |
| **Contact lists** | Upload contacts via CSV with automatic validation |
| **SIP accounts** | Connect any SIP provider (VoIP.ms, Vonage SIP, BulkVS, etc.) |
| **Analytics** | Answer rates, human rates, voicemail rates, call quality |

### What Voxora is NOT

- ❌ Not an inbound call center
- ❌ Not a PBX or phone system
- ❌ Not a Twilio/Plivo wrapper (it uses direct SIP — you connect your own provider)
- ❌ Not a hosted service (you run it on your own server)

---

## 2. How It Works — Plain English

Here is the complete flow in plain English, from signup to a completed call:

```
1. You sign up and log in to the Voxora dashboard.

2. You add a SIP account:
   → Enter your SIP provider's server, username, and password.
   → Voxora registers your account with FreeSWITCH (a media server).
   → FreeSWITCH sends a SIP REGISTER message to your provider.
   → Your provider confirms registration.
   → Status shows "Registered" on the dashboard.

3. You upload contacts:
   → Upload a CSV file with phone numbers.
   → Voxora validates each number (correct format, no duplicates).
   → Valid numbers are stored, ready to dial.

4. You upload an audio file:
   → Upload an MP3 or WAV of your message.
   → Voxora stores it and detects its duration.

5. You create a campaign:
   → Select your SIP account, contact list, and audio file.
   → Set how many concurrent calls (e.g. 10 calls at once).
   → Set how fast to dial (e.g. 2 calls per second).
   → Choose what happens when a voicemail answers (hang up, or leave a voicemail).

6. You start the campaign:
   → Voxora adds a job to the queue (BullMQ / Redis).
   → A worker picks it up and starts dialing.
   → For each contact, it tells FreeSWITCH to call that number.
   → FreeSWITCH dials through your SIP provider.
   → When the person answers, the audio file plays.
   → If voicemail answers, the configured action runs.
   → Results update in real time on your dashboard.
```

---

## 3. Telecom Architecture Explained

This section explains the telecom technology to someone with no telecom background.

### What is SIP?

**SIP (Session Initiation Protocol)** is the standard internet protocol for making phone calls. It is like HTTP, but for phone calls. When you make a VoIP call, SIP signals the call (who is calling who, start, stop) and RTP carries the actual audio.

### What is a SIP Provider?

A SIP provider (also called a VoIP provider or SIP trunk provider) is a company that:
- Has connections to the real phone network (PSTN)
- Gives you SIP credentials (server, username, password)
- Routes your calls to real phone numbers
- Charges per minute or per call

Examples: VoIP.ms, BulkVS, Vonage SIP, Bandwidth, Flowroute, DIDWW.

### Why Direct SIP instead of APIs (Twilio/Plivo)?

| | SIP Direct | Twilio/Plivo API |
|--|-----------|-----------------|
| Cost | ~$0.003/min (your provider) | ~$0.015/min (API markup) |
| Control | Full (your own FreeSWITCH) | Limited to API features |
| Privacy | Calls go through your server | Calls go through their servers |
| Concurrent calls | Only limited by your server | Limited by plan/pricing |
| Codec support | Any (G.711, G.729, Opus, etc.) | Restricted |
| Provider lock-in | Use any provider | Locked to their platform |

### How a Call Gets Made (Technical)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Server                                   │
│                                                                     │
│  ┌──────────┐    ESL API    ┌────────────┐   SIP INVITE  ┌────────┐│
│  │  Voxora  │ ──────────►  │ FreeSWITCH │ ────────────► │Kamailio││
│  │  Backend │              │  (Media    │               │ (SIP   ││
│  │  (NestJS)│ ◄──────────  │   Server)  │               │ Proxy) ││
│  └──────────┘  ESL Events  └────────────┘               └───┬────┘│
│                                  │                           │     │
│                                  │ RTP Audio                 │ SIP │
│                                  │                           │     │
└──────────────────────────────────┼───────────────────────────┼─────┘
                                   │                           │
                            ┌──────▼──────┐             ┌──────▼──────┐
                            │  RTPengine  │             │ SIP Provider│
                            │ (Media Relay│             │ (VoIP.ms,   │
                            │  for NAT)  │◄────────────►│  BulkVS..)  │
                            └─────────────┘  RTP Audio  └──────┬──────┘
                                                               │
                                                         ┌─────▼──────┐
                                                         │Real Phone  │
                                                         │(end user)  │
                                                         └────────────┘
```

**Step by step:**

1. **Backend → FreeSWITCH** (via ESL): "Call +1-555-000-0001, play this audio file"
2. **FreeSWITCH → Kamailio** (SIP INVITE): Routes the call via the registered SIP account
3. **Kamailio → SIP Provider** (SIP INVITE): Forwards call to provider's SIP server
4. **SIP Provider → Phone** (PSTN): Provider dials the real phone number
5. **Phone rings** → Person answers → SIP 200 OK flows back
6. **FreeSWITCH runs AMD** (Answering Machine Detection): Human or voicemail?
7. **FreeSWITCH plays audio** (via Lua script): Audio file streams to the caller
8. **RTP audio** flows: Voice data goes back and forth via RTPengine
9. **Call ends** → FreeSWITCH sends ESL event to backend → DB updated → Dashboard updates

### What is ESL?

**ESL (Event Socket Layer)** is FreeSWITCH's control API. It is a TCP connection on port 8021. The Voxora backend connects to it and:
- Sends commands: "place this call", "hang up this call", "check gateway status"
- Receives events: "call answered", "call ended", "AMD result"

### What is AMD?

**AMD (Answering Machine Detection)** detects whether a human or a voicemail system answered the call. FreeSWITCH listens to the audio after answer and:
- Detects silence patterns (human says "Hello?")
- Detects machine greeting patterns (automated voice + beep)
- Returns: `HUMAN`, `MACHINE`, `FAX`, or `NOTSURE`

Voxora then acts on the result:
- **HUMAN** → Play main audio file
- **MACHINE** → Drop voicemail (or hang up, depending on settings)
- **FAX** → Hang up
- **NOTSURE** → Play audio (safe default)

### What is NAT and Why Does It Matter?

When your server is behind AWS (or any cloud), it has two IPs:
- **Private IP**: 10.x.x.x or 172.x.x.x (what the server sees)
- **Public IP**: Your Elastic IP (what the internet sees)

For SIP/RTP to work across the internet, FreeSWITCH must advertise the **public IP** in SIP headers and SDP (media negotiation). If it advertises the private IP, the SIP provider cannot send audio to it.

Voxora sets `ext-rtp-ip` and `ext-sip-ip` in FreeSWITCH to your public IP automatically via `setup.sh` and the Docker entrypoint.

---

## 4. Full System Architecture

### Service Map

```
                              Internet
                                 │
                       ┌─────────▼──────────┐
                       │    Nginx (80/443)   │  Reverse proxy + SSL
                       └──┬──────────────┬──┘
                          │              │
               ┌──────────▼──┐    ┌──────▼──────────┐
               │  Next.js 14 │    │   NestJS 10 API  │
               │  Frontend   │    │   Port 3001      │
               │  Port 3000  │    │                  │
               └─────────────┘    └──┬─────────────┬─┘
                                     │             │
                        ┌────────────▼──┐    ┌─────▼──────┐
                        │  PostgreSQL   │    │   Redis 7   │
                        │  Port 5432    │    │  Port 6379  │
                        │  (all data)   │    │  (queues +  │
                        └───────────────┘    │   cache)    │
                                             └─────┬───────┘
                                                   │ BullMQ Jobs
                                         ┌─────────▼──────┐
                                         │ Campaign Worker │
                                         │  (NestJS Bull  │
                                         │   Processor)   │
                                         └────────┬───────┘
                                                  │ ESL TCP:8021
                              ┌───────────────────▼──────────────┐
                              │         FreeSWITCH                │
                              │      SIP Port: 5080               │
                              │      ESL Port: 8021               │
                              │   Reads gateways from:           │
                              │   /var/voxora/gateways/*.xml     │
                              └───────────────────┬──────────────┘
                                                  │ SIP INVITE
                              ┌───────────────────▼──────────────┐
                              │         Kamailio                  │
                              │   SIP Proxy Port: 5060            │
                              │   Routes to FreeSWITCH:5080      │
                              │   RTPengine media relay          │
                              └───────────────────┬──────────────┘
                                                  │ SIP to Provider
                              ┌───────────────────▼──────────────┐
                              │      Your SIP Provider            │
                              │  (VoIP.ms, BulkVS, Vonage, etc.) │
                              └───────────────────┬──────────────┘
                                                  │ PSTN
                                         [Real Phone Number]
```

### Data Flow for a Campaign

```
User: "Start campaign"
        │
        ▼
CampaignsService.start()
  → Update status = RUNNING in PostgreSQL
  → Push job to BullMQ Redis queue
        │
        ▼
CampaignProcessor (BullMQ worker)
  1. Check FreeSWITCH ESL is connected (port 8021)
  2. Check SIP gateway is REGISTERED (SIP account connected to provider)
  3. For each contact in the list:
     a. Create CallLog in DB (status=DIALING)
     b. Call ESL originate:
        originate {vars} sofia/gateway/<sip-account-uuid>/+1phone &park()
     c. FreeSWITCH sends SIP INVITE via registered gateway
     d. Receive +OK <uuid> from ESL → update CallLog.uuid
        │
        ▼
FreeSWITCH (telephony)
  - SIP INVITE → Kamailio → SIP Provider → Phone rings
  - On answer: execute_on_answer triggers amd.lua
  - AMD detects HUMAN/MACHINE
  - Plays audio file (from shared /app/uploads volume)
  - Hangs up
        │
        ▼
ESL Events → SipService
  CHANNEL_ANSWER        → CallLog.status = ANSWERED
  CHANNEL_HANGUP_COMPLETE → CallLog.status = COMPLETED/FAILED/BUSY/NOANSWER
                          → Campaign counters updated
                          → WebSocket event → Live dashboard
```

---

## 5. One-Click Deploy (AWS / Linux)

### Prerequisites

| Requirement | Details |
|-------------|---------|
| OS | Ubuntu 20.04 LTS or 22.04 LTS |
| RAM | 4 GB minimum (8 GB recommended) |
| CPU | 2 vCPU minimum (4 vCPU recommended) |
| Disk | 20 GB minimum |
| Network | Public IP with ports open (see below) |

### AWS Security Group — Required Inbound Rules

Before running setup, open these ports in your EC2 Security Group:

| Protocol | Port(s) | Source | Purpose |
|----------|---------|--------|---------|
| TCP | 22 | Your IP only | SSH access |
| TCP | 80 | 0.0.0.0/0 | Web UI (HTTP) |
| TCP | 443 | 0.0.0.0/0 | Web UI (HTTPS) |
| TCP | 3000 | 0.0.0.0/0 | Next.js frontend |
| TCP | 3001 | 0.0.0.0/0 | NestJS API |
| UDP + TCP | 5060 | 0.0.0.0/0 | Kamailio SIP proxy |
| UDP + TCP | 5080 | 0.0.0.0/0 | FreeSWITCH SIP |
| UDP + TCP | 3478 | 0.0.0.0/0 | STUN/TURN (Coturn) |
| UDP | 10000–20000 | 0.0.0.0/0 | RTP media streams |

> **Why 10000–20000?** Every active call needs 2 UDP ports for RTP audio. A campaign running 100 concurrent calls needs up to 200 ports open.

### Run the Setup Script

```bash
# 1. SSH into your server
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# 2. Clone the repository
git clone https://github.com/hydropy1214/voxora.git
cd voxora

# 3. Run one-click setup (takes ~10 minutes on first run)
sudo ./setup.sh
```

**With a custom domain:**
```bash
sudo ./setup.sh --domain app.voxora.io
```

**If using AWS Security Groups (skip UFW firewall config):**
```bash
sudo ./setup.sh --skip-firewall
```

**Force reinstall everything:**
```bash
sudo ./setup.sh --force
```

### What `setup.sh` Does (13 steps)

| Step | What happens |
|------|-------------|
| 1 | Detects your public IP (AWS metadata → ipify → ifconfig.me → hostname) |
| 2 | Installs Docker Engine + Docker Compose plugin (if not present) |
| 3 | Configures UFW firewall with all required ports |
| 4 | Generates cryptographically secure secrets (JWT, DB, Redis, ESL, TURN) |
| 5 | Writes `.env` file with all configuration |
| 6 | Writes FreeSWITCH `vars.xml` and Coturn `turnserver.conf` with your public IP |
| 7 | Pulls all Docker base images (postgres, redis, nginx, etc.) |
| 8 | Builds custom Docker images (FreeSWITCH + Kamailio + backend + frontend) |
| 9 | Starts PostgreSQL and Redis, waits for health checks |
| 10 | Runs Prisma database migrations (creates all tables) |
| 11 | Seeds demo account (`demo@voxora.io` / `demo123456`) |
| 12 | Starts telephony stack (RTPengine → Coturn → Kamailio → FreeSWITCH) |
| 13 | Starts application (backend → frontend → nginx), prints all URLs |

---

## 6. Manual Setup

### Step 1 — Install Dependencies

```bash
# Docker Engine
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker

# Docker Compose plugin
apt-get install -y docker-compose-plugin

# Node.js 20 (for local dev only)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### Step 2 — Clone and Configure

```bash
git clone https://github.com/hydropy1214/voxora.git
cd voxora

# Copy the environment template
cp .env.example .env

# Edit .env — set at minimum:
#   DB_PASSWORD       (any strong password)
#   REDIS_PASSWORD    (any strong password)
#   JWT_SECRET        (run: openssl rand -base64 48)
#   JWT_REFRESH_SECRET (run: openssl rand -base64 48)
#   PUBLIC_IP         (your server's public IP)
nano .env
```

### Step 3 — Start Services

```bash
# Pull images
docker compose pull

# Build custom images (FreeSWITCH, Kamailio, backend, frontend)
docker compose build --parallel

# Start everything
docker compose up -d

# Check status
docker compose ps
```

### Step 4 — Database Setup

```bash
# Run migrations
docker compose exec backend npx prisma migrate deploy

# Seed demo data
docker compose exec backend npm run prisma:seed
```

### Step 5 — Access the Application

```
Dashboard:  http://YOUR_IP:3000
API:        http://YOUR_IP:3001/api
API Docs:   http://YOUR_IP:3001/api/docs
Status:     http://YOUR_IP:3000/status
```

**Demo credentials:** `demo@voxora.io` / `demo123456`

---

## 7. First Steps After Install

After installation, follow this checklist:

### ✅ Checklist

```
□ 1. Open the dashboard at http://YOUR_IP:3000
□ 2. Log in with demo@voxora.io / demo123456
□ 3. Create your own account (Sign Up)
□ 4. Go to Settings → change password
□ 5. Go to System Status → check all services are green
□ 6. Add a SIP account (see Section 8)
□ 7. Upload a contact list (CSV with phone column)
□ 8. Upload an audio file (MP3 or WAV, your message)
□ 9. Create a campaign
□ 10. Run a test call (1 contact, 1 concurrent)
```

### Check System Status

Go to **Dashboard → System Status** (or `/status`) to verify:
- PostgreSQL: Connected ✅
- Redis: Connected ✅
- FreeSWITCH ESL: Connected ✅ *(may take 60-90 seconds to show green)*
- Kamailio SIP port 5060: Open ✅
- RTPengine port 2223: Open ✅

> **FreeSWITCH takes ~60–90 seconds** to fully initialize. The status page will show "Not Connected" initially. This is normal. Refresh after 2 minutes.

---

## 8. SIP Provider Setup

### What SIP credentials do you need?

From your SIP provider you need:

| Field | Example | Description |
|-------|---------|-------------|
| SIP Server | `sip.voip.ms` | Your provider's SIP server hostname |
| Port | `5060` | Usually 5060 (UDP) or 5061 (TLS) |
| Username | `1001234` | Your SIP account number or username |
| Password | `your-password` | Your SIP account password |
| Transport | `UDP` | UDP (default), TCP, or TLS |

### Adding a SIP Account

1. Go to **SIP Accounts** in the sidebar
2. Click **Add SIP Account**
3. Fill in your provider's credentials
4. Click **Save**
5. Wait 5–10 seconds, then click **Test Connection**

**What happens when you add an account:**
1. Voxora encrypts your password (AES-256) in the database
2. Writes a gateway config file to `/var/voxora/gateways/<uuid>.xml`
3. Tells FreeSWITCH to reload its SIP profile (`sofia rescan`)
4. FreeSWITCH sends `SIP REGISTER` to your provider
5. Provider responds with `200 OK` → status shows **Registered**

### Popular SIP Providers

| Provider | SIP Server | Notes |
|----------|-----------|-------|
| VoIP.ms | `sip.voip.ms` | Good for Canada/US |
| BulkVS | `sip.bulkvs.com` | US bulk calling |
| Vonage SIP | `sip.nexmo.com` | Global |
| DIDWW | `sip.didww.com` | Global |
| Flowroute | `sip.flowroute.com` | US only |
| Twilio SIP | `your-domain.sip.twilio.com` | If you want Twilio as SIP provider |

### Provider-Specific Notes

**VoIP.ms:**
- Enable "Sub-Accounts" in VoIP.ms portal
- Set `SIP Server` to `sip.voip.ms` (or a regional server like `chicago.voip.ms`)
- Username format: `accountid_subaccount` (e.g. `123456_voxora`)

**BulkVS:**
- Create a SIP Trunk in BulkVS portal
- Whitelist your server's public IP in their dashboard
- Transport: UDP

**Any provider:**
- Make sure your server's IP is whitelisted in the provider's portal
- SIP trunk must allow outbound calls (not just inbound)
- Check that the provider supports the caller ID you set

---

## 9. Running Your First Campaign

### Step 1 — Upload Contacts

1. Go to **Contacts** → **New List**
2. Give it a name (e.g. "Test List")
3. Drag and drop a CSV file
4. CSV format — the **phone** column is required:

```csv
phone,first_name,last_name,company
+15551234567,John,Doe,Acme Corp
+15559876543,Jane,Smith,Beta LLC
+15555555555,Bob,Jones,
```

> Voxora auto-detects the phone column. Supported column names: `phone`, `mobile`, `cell`, `telephone`, `number`.

What happens after upload:
- Phone numbers are validated with `libphonenumber-js`
- Invalid numbers (too short, wrong format) are flagged
- Duplicates are detected and skipped
- Opted-out numbers are excluded

### Step 2 — Upload Audio

1. Go to **Audio Files** → drag and drop an MP3 or WAV file
2. Wait for status to show **Ready** (~5 seconds)
3. Click Play to preview it in the browser

Requirements:
- Format: MP3 or WAV
- Max size: 50 MB
- Recommended: 8kHz mono WAV for telephony (smallest, most compatible)

### Step 3 — Create Campaign

1. Go to **Campaigns** → **New Campaign**
2. Follow the 4-step wizard:

**Step 1 — Basic Info:**
- Campaign name
- Type: `Broadcast` (plays audio on answer) or `Voicemail Drop` (leaves voicemail on machine)
- Caller ID number (shown to the called person)
- Caller ID name

**Step 2 — Select Resources:**
- SIP Account (must be Registered)
- Contact List
- Audio File

**Step 3 — Settings:**
- Max Concurrent Calls (slider: 1–200)
  - How many calls ring at the same time
  - Start with 5–10 for testing
- Calls Per Second (slider: 0.1–20)
  - How fast to initiate new calls
  - 1 CPS = 1 new call per second
- AMD: Enable/Disable answering machine detection
- AMD Action: What to do when machine answers
  - `Play on Human` — only play audio when human answers
  - `Voicemail Drop` — leave voicemail when machine answers
  - `Hang Up on Machine` — hang up when machine detected
  - `Play on Both` — play audio regardless

**Step 4 — Review:**
- Review all settings and click **Create Campaign**

### Step 4 — Start the Campaign

1. Find your campaign in the list
2. Click the ▶ Play button
3. Watch the Live Monitor for real-time results

### Monitoring a Running Campaign

Go to **Live Monitor** to see:
- Number of active calls right now
- Latest 20 call results as they happen
- AMD results (human vs machine)
- Answer rates
- SIP connection status

Go to **Dashboard** for aggregated stats:
- Total calls, answer rate, human rate, voicemail rate
- 14-day call volume chart
- RTP quality (MOS score)

---

## 10. How Calls Actually Work

This is the technical detail of the entire call lifecycle:

### Phase 1 — Campaign Start

```
User clicks "Start"
    ↓
API: POST /api/campaigns/:id/start
    ↓
campaign.status = 'RUNNING' in PostgreSQL
    ↓
BullMQ job pushed to Redis queue:
  { campaignId: "uuid", userId: "uuid" }
```

### Phase 2 — Worker Startup Checks

```
CampaignProcessor picks up the BullMQ job
    ↓
CHECK 1: Is FreeSWITCH ESL connected?
  → If not: throw error "FreeSWITCH not connected"
    ↓
CHECK 2: Is the SIP gateway REGISTERED?
  → ESL: "sofia status gateway <account-uuid>"
  → If not registered: wait up to 30 seconds
  → If still not registered: throw error
    ↓
LOAD contacts from PostgreSQL:
  WHERE listId = campaign.contactListId
  AND isValid = true
  AND isDuplicate = false
  AND isOptedOut = false
```

### Phase 3 — The Dial Loop

```
For each contact:
    ↓
CONCURRENCY CHECK:
  Count active calls (status IN DIALING/RINGING/ANSWERED)
  If >= maxConcurrentCalls: wait 50ms and recheck
    ↓
RATE LIMITER:
  sleep(1000 / callsPerSecond) ms
    ↓
CREATE CallLog in DB:
  { status: 'DIALING', phone: "+15551234567", campaignId, contactId }
    ↓
ESL ORIGINATE COMMAND:
  originate
    {origination_caller_id_name='Acme Corp',
     origination_caller_id_number='+15551112222',
     voxora_campaign_id=<uuid>,
     voxora_call_log_id=<uuid>,
     voxora_audio_file=/app/uploads/audio/<uuid>.mp3,
     voxora_amd_action=PLAY_ON_HUMAN,
     execute_on_answer=lua /opt/voxora/amd.lua}
    sofia/gateway/<sip-account-uuid>/+15551234567
    &park()
    ↓
FreeSWITCH responds: "+OK <call-uuid>"
    ↓
UPDATE CallLog.uuid = <call-uuid>
UPDATE CallLog.status = 'RINGING'
```

### Phase 4 — The Call (FreeSWITCH + Kamailio)

```
FreeSWITCH sends SIP INVITE to Kamailio:5060
    ↓
Kamailio routes to SIP provider:
  - Engages RTPengine for media relay
  - Records route for in-dialog requests
  - Sends SIP INVITE to provider
    ↓
SIP Provider routes to PSTN:
  - Dials +15551234567 on the real phone network
    ↓
Phone rings → Person/machine answers → SIP 200 OK
    ↓
execute_on_answer: FreeSWITCH runs /opt/voxora/amd.lua
```

### Phase 5 — AMD Detection (Lua)

```
amd.lua reads channel variables:
  voxora_audio_file, voxora_amd_action, etc.
    ↓
AMD detection:
  1. Check amd_result variable (set by mod_spandsp if available)
  2. Check amd_tone_length > 0 → MACHINE (detected beep)
  3. Default: HUMAN
    ↓
Fire custom ESL event: voxora::human_answer or voxora::machine_answer
    ↓
HUMAN  → playback /app/uploads/audio/<uuid>.mp3
MACHINE (VOICEMAIL_DROP) → wait for beep → playback voicemail.mp3
MACHINE (HANGUP_ON_MACHINE) → hangup
FAX → hangup
    ↓
hangup NORMAL_CLEARING
```

### Phase 6 — Call Completion

```
FreeSWITCH sends ESL event: CHANNEL_HANGUP_COMPLETE
  Headers: Unique-ID, Hangup-Cause, variable_billsec,
           variable_amd_result, variable_voxora_call_log_id
    ↓
SipService.handleHangup() processes the event:
    ↓
MAP hangup cause to status:
  NORMAL_CLEARING → COMPLETED
  USER_BUSY       → BUSY
  NO_ANSWER       → NOANSWER
  ORIGINATOR_CANCEL → CANCELLED
  anything else   → FAILED
    ↓
UPDATE CallLog:
  status, hangupCause, duration, amdResult, rtpMos
    ↓
UPDATE Campaign counters:
  answeredCalls++, humanAnswers++, or failedCalls++, etc.
    ↓
WebSocket broadcast to dashboard:
  { event: "call:hangup", uuid, phone, status, duration, amdResult }
    ↓
Live Monitor updates in real time
```

---

## 11. All Services Explained

### What runs in Docker

| Container | Image | What it does | Ports |
|-----------|-------|-------------|-------|
| `voxora_postgres` | postgres:16-alpine | Stores all application data. Tables: users, campaigns, call_logs, sip_accounts, contacts, audio_files, etc. | 5432 (internal) |
| `voxora_redis` | redis:7-alpine | Two jobs: (1) BullMQ campaign job queues — workers pick up jobs and place calls. (2) API response caching. | 6379 (internal) |
| `voxora_freeswitch` | signalwire/freeswitch:v1.10 | The SIP media server. Places calls, handles audio, runs AMD. Reads gateway configs from shared volume. Exposes ESL on port 8021 for the backend to control it. | 5080/UDP+TCP (SIP), 8021/TCP (ESL) |
| `voxora_kamailio` | kamailio/kamailio:5.7-debian | SIP proxy on port 5060. Routes calls from FreeSWITCH to your SIP provider. Integrates RTPengine for media relay. Provides load balancing and failover. | 5060/UDP+TCP (SIP) |
| `voxora_rtpengine` | drachtio/rtpengine:latest | RTP media relay. Ensures audio packets travel correctly through NAT (AWS). Maps public IP ↔ private IP for audio streams. | 2223/UDP (control), 10000-20000/UDP (media) |
| `voxora_coturn` | coturn/coturn:4.6-alpine | STUN/TURN server. Helps WebRTC clients discover their public IP and relay media. Optional for pure SIP. | 3478/UDP+TCP (STUN/TURN) |
| `voxora_backend` | Built from apps/backend | NestJS REST API + Socket.io WebSocket server. All business logic: auth, campaigns, contacts, analytics, billing. | 3001/TCP |
| `voxora_frontend` | Built from apps/frontend | Next.js 14 dashboard. All UI pages: campaigns, contacts, audio files, live monitor, analytics, billing, status. | 3000/TCP |
| `voxora_nginx` | nginx:1.25-alpine | Reverse proxy. Routes `/api/*` to backend, `/socket.io/*` to WebSocket, `/` to frontend. Rate limiting. Optional SSL. | 80/TCP, 443/TCP |

### Shared Volumes

| Volume | Shared Between | Purpose |
|--------|---------------|---------|
| `uploads_data` | Backend (write) + FreeSWITCH (read) | Audio files (MP3/WAV) uploaded by users. Backend stores them, FreeSWITCH plays them. Same path: `/app/uploads` |
| `freeswitch_gateways` | Backend (write) + FreeSWITCH (read) | SIP gateway XML configs. Backend writes one file per SIP account. FreeSWITCH loads them via `sofia profile rescan`. Path: `/var/voxora/gateways` |
| `freeswitch_recordings` | FreeSWITCH | Call recordings (optional). |
| `postgres_data` | PostgreSQL | Database files |
| `redis_data` | Redis | Persistent queue and cache data |

---

## 12. Port Reference

| Port | Protocol | Service | Exposed To |
|------|----------|---------|-----------|
| **3000** | TCP | Next.js Frontend | Internet |
| **3001** | TCP | NestJS API + WebSocket | Internet |
| **80** | TCP | Nginx HTTP | Internet |
| **443** | TCP | Nginx HTTPS | Internet |
| **5060** | UDP + TCP | Kamailio SIP Proxy | Internet (SIP providers) |
| **5080** | UDP + TCP | FreeSWITCH SIP | Internet (SIP providers) |
| **8021** | TCP | FreeSWITCH ESL | Internal only (backend) |
| **3478** | UDP + TCP | Coturn STUN/TURN | Internet |
| **5349** | TCP | Coturn STUN/TURN TLS | Internet |
| **10000–20000** | UDP | RTP Media | Internet (audio streams) |
| **5432** | TCP | PostgreSQL | Internal only |
| **6379** | TCP | Redis | Internal only |
| **2223** | UDP | RTPengine control | Internal only |

---

## 13. Environment Variables

The `.env` file is auto-generated by `setup.sh`. Here is every variable explained:

### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `JWT_SECRET` | *(64-char random)* | Signs JWT access tokens. Must be 32+ chars. Changing this invalidates all sessions. |
| `JWT_REFRESH_SECRET` | *(64-char random)* | Signs JWT refresh tokens. Different from JWT_SECRET. |
| `DB_PASSWORD` | *(random)* | PostgreSQL password for the `voxora` user. |
| `DATABASE_URL` | `postgresql://voxora:...@postgres:5432/voxora_db` | Full PostgreSQL connection string used by Prisma. |
| `REDIS_PASSWORD` | *(random)* | Redis authentication password. |
| `FREESWITCH_ESL_PASSWORD` | *(random)* | Password for FreeSWITCH Event Socket. Must match what's in FreeSWITCH config. |
| `PUBLIC_IP` | `54.123.45.67` | Your server's public IP. Used in FreeSWITCH NAT config (`ext-rtp-ip`). |
| `PRIVATE_IP` | `172.31.0.5` | Your server's private IP. Used for binding. |

### Optional but Recommended

| Variable | Example | Description |
|----------|---------|-------------|
| `DOMAIN` | `app.voxora.io` | Your domain name. Used in emails and SSL config. |
| `MAIL_HOST` | `smtp.mailgun.org` | SMTP server for email verification and password reset. |
| `MAIL_USER` | `postmaster@mg.voxora.io` | SMTP username. |
| `MAIL_PASS` | `your-password` | SMTP password. |
| `MAIL_FROM` | `noreply@voxora.io` | From address for emails. |

### Billing (Optional)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key. Required to enable billing/subscriptions. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret. |
| `STRIPE_PRICE_STARTER` | Stripe Price ID for the Starter plan. |
| `STRIPE_PRICE_GROWTH` | Stripe Price ID for the Growth plan. |
| `STRIPE_PRICE_PRO` | Stripe Price ID for the Pro plan. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (goes to frontend). |

---

## 14. Project Structure

```
voxora/
├── setup.sh                    # One-click deploy script (350 lines)
├── Makefile                    # Management commands (make help)
├── docker-compose.yml          # Production stack (9 services)
├── docker-compose.dev.yml      # Dev overrides (no telephony)
├── .env.example                # Environment template
│
├── apps/
│   ├── backend/                # NestJS 10 API
│   │   ├── src/
│   │   │   ├── app.module.ts   # Root module
│   │   │   ├── main.ts         # Entry point, Swagger setup
│   │   │   ├── health.controller.ts
│   │   │   │
│   │   │   ├── modules/
│   │   │   │   ├── auth/       # JWT auth, refresh tokens, email verify
│   │   │   │   ├── users/      # Profile, password change
│   │   │   │   ├── sip-accounts/ # SIP account CRUD + gateway registration
│   │   │   │   ├── contacts/   # CSV import, phone validation, lists
│   │   │   │   ├── audio-files/ # MP3/WAV upload, streaming
│   │   │   │   ├── campaigns/  # Campaign CRUD, start/pause/stop + BullMQ processor
│   │   │   │   ├── live-monitor/ # Real-time stats API
│   │   │   │   ├── recordings/ # Call recording archive
│   │   │   │   ├── analytics/  # Dashboard stats, timeline, RTP quality
│   │   │   │   ├── billing/    # Stripe checkout, webhooks, plan management
│   │   │   │   └── system/     # System health status API
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── sip/
│   │   │   │   │   ├── freeswitch-esl.service.ts  # ESL TCP connection + events
│   │   │   │   │   ├── gateway-manager.service.ts # Writes gateway XML files
│   │   │   │   │   ├── sip.service.ts             # ESL event → DB update handler
│   │   │   │   │   └── sip-test.service.ts        # Connection testing
│   │   │   │   └── crypto/
│   │   │   │       └── crypto.service.ts          # AES-256 encrypt/decrypt
│   │   │   │
│   │   │   ├── gateways/
│   │   │   │   └── websocket.gateway.ts  # Socket.io server (realtime events)
│   │   │   │
│   │   │   └── prisma/
│   │   │       ├── prisma.module.ts
│   │   │       └── prisma.service.ts
│   │   │
│   │   └── prisma/
│   │       ├── schema.prisma   # Database schema (15 models)
│   │       └── seed.ts         # Demo data seed
│   │
│   └── frontend/               # Next.js 14 UI
│       └── src/
│           ├── app/
│           │   ├── (auth)/     # Login, signup, forgot password
│           │   └── (dashboard)/
│           │       ├── dashboard/    # Stats, charts, live feed
│           │       ├── campaigns/    # Campaign list + wizard
│           │       ├── contacts/     # CSV upload, contact table
│           │       ├── audio-files/  # Upload, preview, waveform
│           │       ├── sip-accounts/ # SIP account management
│           │       ├── live-monitor/ # Real-time call feed
│           │       ├── analytics/    # Charts, KPIs, RTP quality
│           │       ├── billing/      # Plan cards, Stripe checkout
│           │       ├── recordings/   # Archive, playback, download
│           │       ├── settings/     # Profile, password
│           │       └── status/       # System health page
│           │
│           ├── components/     # Reusable React components
│           ├── hooks/          # useLiveStats (Socket.io)
│           ├── lib/            # axios API client, utilities
│           └── store/          # Zustand auth state
│
├── packages/
│   └── shared/                 # Shared TypeScript types
│
├── infra/
│   ├── freeswitch/
│   │   ├── Dockerfile          # Based on signalwire/freeswitch:v1.10
│   │   ├── docker-entrypoint.sh # Writes vars.xml with public IP at startup
│   │   ├── conf/
│   │   │   ├── vars.xml        # Written at runtime (do not edit)
│   │   │   ├── autoload_configs/
│   │   │   │   ├── sofia.conf.xml    # SIP profile (NAT, ports, gateway dir)
│   │   │   │   ├── event_socket.conf.xml  # ESL config
│   │   │   │   ├── acl.conf.xml      # Network trust ACLs
│   │   │   │   ├── modules.conf.xml  # Loaded modules list
│   │   │   │   └── switch.conf.xml   # Core settings
│   │   │   └── dialplan/
│   │   │       └── voxora_outbound.xml  # Outbound call routing
│   │   └── scripts/
│   │       ├── amd.lua          # AMD detection + audio playback
│   │       ├── call_complete.lua # Fires on call end
│   │       └── startup.lua      # Runs at FS startup
│   │
│   ├── kamailio/
│   │   ├── Dockerfile           # Based on kamailio/kamailio:5.7-debian
│   │   ├── docker-entrypoint.sh # Substitutes IPs into config at startup
│   │   ├── kamailio.cfg         # Full SIP proxy config + RTPengine integration
│   │   └── dispatcher.list      # FreeSWITCH backend list
│   │
│   ├── nginx/
│   │   ├── nginx.conf           # Performance + logging config
│   │   └── conf.d/voxora.conf   # Virtual host: proxy + WebSocket + rate limiting
│   │
│   └── coturn/
│       └── turnserver.conf      # STUN/TURN config (written by setup.sh)
│
├── scripts/
│   ├── health-check.sh          # Verify all services are up
│   └── postgres-init.sql        # Extensions + performance tuning
│
└── docs/
    └── aws-deployment.md        # Detailed AWS deploy guide
```

---

## 15. API Reference

Full interactive docs at: `http://YOUR_IP:3001/api/docs` (Swagger UI)

### Authentication

```bash
# Register
POST /api/auth/register
{ "email": "user@example.com", "password": "...", "firstName": "John", "lastName": "Doe" }

# Login
POST /api/auth/login
{ "email": "user@example.com", "password": "..." }
# Returns: { accessToken, refreshToken, user }

# All subsequent requests need header:
Authorization: Bearer <accessToken>
```

### SIP Accounts

```bash
POST   /api/sip-accounts          # Add account (triggers FreeSWITCH gateway registration)
GET    /api/sip-accounts          # List accounts with live registration status
GET    /api/sip-accounts/:id      # Get one account
PUT    /api/sip-accounts/:id      # Update account (re-registers gateway)
DELETE /api/sip-accounts/:id      # Remove account (unregisters gateway)
POST   /api/sip-accounts/:id/test # Test connection (waits for REGISTERED status)
```

### Contacts

```bash
POST   /api/contacts/lists                    # Create contact list
GET    /api/contacts/lists                    # List all contact lists
POST   /api/contacts/lists/:id/import         # Upload CSV file
GET    /api/contacts/lists/:id/contacts       # Get contacts (paginated)
DELETE /api/contacts/lists/:id                # Delete list
POST   /api/contacts/opt-out                  # Opt out a phone number
```

### Audio Files

```bash
POST   /api/audio-files/upload   # Upload MP3/WAV (multipart form)
GET    /api/audio-files          # List all audio files
GET    /api/audio-files/:id/stream # Stream audio (for playback)
DELETE /api/audio-files/:id      # Delete file
```

### Campaigns

```bash
POST   /api/campaigns            # Create campaign
GET    /api/campaigns            # List campaigns (paginated)
GET    /api/campaigns/:id        # Get campaign + stats
POST   /api/campaigns/:id/start  # Start campaign (BullMQ job)
POST   /api/campaigns/:id/pause  # Pause campaign
POST   /api/campaigns/:id/stop   # Stop campaign
GET    /api/campaigns/:id/live-calls  # Live calls (DIALING/RINGING/ANSWERED)
GET    /api/campaigns/:id/call-logs   # Call log history (paginated)
```

### WebSocket Events

Connect with: `io('http://YOUR_IP:3001', { auth: { token: accessToken } })`

```javascript
// Subscribe to a campaign's events
socket.emit('join:campaign', { campaignId: 'uuid' })

// Subscribe to live monitor
socket.emit('join:live-monitor')

// Events you receive
socket.on('call:answered',  (data) => { /* { uuid, phone, timestamp } */ })
socket.on('call:hangup',    (data) => { /* { uuid, phone, status, duration, amdResult } */ })
socket.on('campaign:progress', (data) => { /* { campaignId, dialedCount, total, activeCalls } */ })
socket.on('campaign:completed', (data) => { /* { campaignId, status } */ })
socket.on('amd:human',    (data) => { /* { uuid, campaignId } */ })
socket.on('amd:machine',  (data) => { /* { uuid, campaignId, toneLen } */ })
```

---

## 16. Troubleshooting

### FreeSWITCH shows "Not Connected"

**Symptom:** System Status page shows FreeSWITCH ESL as red/disconnected.

**Causes and fixes:**

```bash
# 1. Check if FreeSWITCH is running
docker compose ps freeswitch
# Should show "running (healthy)"

# 2. Check FreeSWITCH logs
docker compose logs freeswitch | tail -50
# Look for errors like "Address already in use" or "Module load failed"

# 3. FreeSWITCH is slow to start — wait 90 seconds then check
# The ESL backend retries with exponential backoff (5s → 60s max)

# 4. Restart FreeSWITCH
docker compose restart freeswitch

# 5. Check ESL port is open
nc -zv 127.0.0.1 8021
```

### SIP Account shows "Failed" or "Unregistered"

**Symptom:** Added SIP account, status doesn't change to "Registered".

**Causes and fixes:**

```bash
# 1. Check FreeSWITCH gateway status
docker compose exec freeswitch fs_cli -x "sofia status gateway <account-uuid>"

# 2. Check if gateway XML was written
ls /var/lib/docker/volumes/voxora_freeswitch_gateways/_data/
# Should show <account-uuid>.xml

# 3. Verify SIP credentials are correct
# Common mistakes: wrong password, wrong SIP server hostname, port blocked

# 4. Check if SIP port is open to internet
nc -zv YOUR_PUBLIC_IP 5060

# 5. View SIP registration traffic in FreeSWITCH console
docker compose exec freeswitch fs_cli
# Then type: sofia loglevel all 9
# Then type: sofia profile voxora_outbound rescan
# Watch for REGISTER/401/403 responses

# 6. AWS: Check Security Group allows outbound to provider on port 5060
```

### Calls fail immediately (ORIGINATE_FAILED)

**Symptom:** Calls go to FAILED status instantly, no ringing.

```bash
# 1. Check gateway is registered BEFORE starting campaign
# Status page → SIP Accounts → must show "Registered"

# 2. Try a test call
docker compose exec freeswitch fs_cli
# Type: originate {ignore_early_media=true}sofia/gateway/<uuid>/+15551234567 &echo()

# 3. Check RTPengine is running
docker compose ps rtpengine
nc -zv 127.0.0.1 2223  # Control port should be open

# 4. Check for NAT issues — PUBLIC_IP in .env must match your Elastic IP
grep PUBLIC_IP .env
curl -s https://checkip.amazonaws.com  # Compare these two
```

### No audio (one-way or no audio)

**Symptom:** Call connects but no audio is heard.

```bash
# 1. This is almost always a NAT/IP issue
# PUBLIC_IP in .env must be your actual public Elastic IP

# 2. Verify FreeSWITCH is advertising the right IP
docker compose exec freeswitch fs_cli -x "sofia status profile voxora_outbound"
# Look for ext-rtp-ip — should be your public IP

# 3. Verify RTP ports 10000-20000 are open in Security Group

# 4. Restart FreeSWITCH and RTPengine after fixing IP
docker compose restart rtpengine freeswitch
```

### Audio file not playing

**Symptom:** Call connects, AMD detects human, but nothing plays.

```bash
# 1. Check audio file exists in uploads volume
docker compose exec freeswitch ls /app/uploads/audio/
# Should list .mp3 or .wav files

# 2. Check audio file path in DB matches what's on disk
docker compose exec backend npx prisma studio
# Open AudioFile table, check storagePath column

# 3. Test audio playback in FreeSWITCH
docker compose exec freeswitch fs_cli
# Type: originate loopback/1234 &playback(/app/uploads/audio/your-file.mp3)
```

### Database connection failed

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Check logs
docker compose logs postgres | tail -20

# Test connection
docker compose exec postgres pg_isready -U voxora

# Reset everything (WARNING: deletes all data)
docker compose down -v
docker compose up -d
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

---

## 17. FAQ

**Q: Do I need to install FreeSWITCH or Kamailio on my server?**  
A: No. Everything runs in Docker containers. `docker compose up -d` downloads and starts all services automatically.

**Q: Which SIP providers work with Voxora?**  
A: Any standard SIP trunk provider that supports SIP REGISTER. Popular ones: VoIP.ms, BulkVS, Flowroute, Vonage SIP, DIDWW, Telnyx (SIP trunk, not API), Bandwidth.

**Q: How many concurrent calls can I run?**  
A: Depends on your server. A `c5.xlarge` (4 vCPU, 8GB) can handle ~100 concurrent calls. A `c5.4xlarge` (16 vCPU, 32GB) can handle 500+. Your SIP provider may also have limits.

**Q: What happens if FreeSWITCH restarts?**  
A: The backend automatically re-registers all SIP accounts with FreeSWITCH when the ESL connection re-establishes. Running campaigns will fail and need to be restarted.

**Q: How do I add SSL / HTTPS?**  
A: Run `make ssl-certbot` (requires a domain pointing to your server) or `make ssl-generate` for a self-signed cert. Then uncomment the HTTPS server block in `infra/nginx/conf.d/voxora.conf`.

**Q: How do I backup the database?**  
A: `make backup` creates a timestamped gzip dump in `./backups/`. Restore with `make restore BACKUP=./backups/file.sql.gz`.

**Q: Can I use Voxora without a domain name?**  
A: Yes. Access it directly at `http://YOUR_IP:3000`. SSL is optional.

**Q: The setup takes a long time. Is that normal?**  
A: Yes. Building FreeSWITCH and Kamailio Docker images takes 5–10 minutes on first run. Subsequent runs are instant (images are cached).

**Q: How do I update Voxora?**  
A: `git pull && make build && make up` (or `make update` for zero-downtime app-only update).

**Q: How do I view FreeSWITCH logs?**  
A: `make logs-freeswitch` or `docker compose exec freeswitch fs_cli` for the live console.

---

## Management Quick Reference

```bash
# Deploy
sudo ./setup.sh                  # First-time deploy
make up                          # Start all services
make down                        # Stop all services
make restart                     # Restart all services

# Logs
make logs                        # All service logs
make logs-backend                # Backend only
make logs-freeswitch             # FreeSWITCH only
make logs-kamailio               # Kamailio only

# Database
make migrate                     # Run migrations
make seed                        # Seed demo data
make backup                      # Dump database
make studio                      # Open Prisma Studio (DB GUI)

# Shell access
make shell-fs                    # FreeSWITCH console (fs_cli)
make shell-db                    # PostgreSQL psql
make shell-backend               # Backend shell

# Testing
make test-sip                    # Test SIP ports
make status                      # Service health dashboard
bash scripts/health-check.sh     # Full health check

# SSL
make ssl-certbot                 # Let's Encrypt cert
make ssl-generate                # Self-signed cert
```

---

## License

MIT © Voxora

---

<div align="center">

**Questions?** Open an issue on GitHub.

*Built with FreeSWITCH, Kamailio, NestJS, Next.js, and a lot of SIP.*

</div>
