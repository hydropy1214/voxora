# Deploying CallsPsy on AWS EC2

## Recommended Instance

| Tier | Instance Type | vCPU | RAM | Notes |
|------|--------------|------|-----|-------|
| Development | t3.medium | 2 | 4 GB | No telephony |
| Small (Trial/Starter) | c5.xlarge | 4 | 8 GB | Up to 20 concurrent calls |
| Medium (Growth) | c5.2xlarge | 8 | 16 GB | Up to 100 concurrent calls |
| Large (Pro) | c5.4xlarge | 16 | 32 GB | Up to 500 concurrent calls |
| Enterprise | c5.9xlarge | 36 | 72 GB | 1000+ concurrent calls |

**OS**: Ubuntu 22.04 LTS (ami-0c7217cdde317cfec on us-east-1)

---

## Security Group Rules

Create a Security Group with these **inbound** rules:

| Type | Protocol | Port Range | Source | Description |
|------|----------|-----------|--------|-------------|
| SSH | TCP | 22 | Your IP/32 | Admin access |
| HTTP | TCP | 80 | 0.0.0.0/0 | Web UI |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Web UI (SSL) |
| Custom TCP | TCP | 3000 | 0.0.0.0/0 | Next.js Frontend |
| Custom TCP | TCP | 3001 | 0.0.0.0/0 | NestJS API |
| Custom UDP | UDP | 5060 | 0.0.0.0/0 | SIP (Kamailio) |
| Custom TCP | TCP | 5060 | 0.0.0.0/0 | SIP TCP (Kamailio) |
| Custom UDP | UDP | 5080 | 0.0.0.0/0 | SIP (FreeSWITCH) |
| Custom TCP | TCP | 5080 | 0.0.0.0/0 | SIP TCP (FreeSWITCH) |
| Custom UDP | UDP | 3478 | 0.0.0.0/0 | STUN/TURN (Coturn) |
| Custom TCP | TCP | 3478 | 0.0.0.0/0 | STUN/TURN TCP |
| Custom TCP | TCP | 5349 | 0.0.0.0/0 | STUN/TURN TLS |
| Custom UDP | UDP | 10000-20000 | 0.0.0.0/0 | RTP Media |

**Outbound**: All traffic (0.0.0.0/0) — needed for SIP calls to providers.

---

## One-Click Deploy

### Step 1: Launch EC2 instance

```bash
# Connect to your instance
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### Step 2: Clone repository

```bash
git clone https://github.com/your-org/callspsy.git
cd callspsy
```

### Step 3: Run setup

```bash
# Full production deploy (auto-detects EC2 public IP)
sudo ./setup.sh

# With custom domain:
sudo ./setup.sh --domain app.callspsy.io

# Skip firewall (using Security Groups instead)
sudo ./setup.sh --skip-firewall
```

### Step 4: Access CallsPsy

```
Dashboard:  http://YOUR_EC2_IP:3000
API:        http://YOUR_EC2_IP:3001/api
API Docs:   http://YOUR_EC2_IP:3001/api/docs
```

Demo login: `demo@callspsy.io` / `demo123456`

---

## FreeSWITCH NAT on AWS EC2

AWS EC2 instances are behind NAT. FreeSWITCH must know both the private and public IP.

The `setup.sh` script handles this automatically:
- Detects public IP via `https://checkip.amazonaws.com`
- Writes `PUBLIC_IP` to `.env`
- FreeSWITCH entrypoint injects it into `vars.xml`
- Sofia profile uses `ext-rtp-ip=$${public_ip}` and `ext-sip-ip=$${public_ip}`

**Result**: SIP/SDP contains public IP → your SIP provider can reach the media.

---

## Production Checklist

- [ ] Security Group rules applied
- [ ] `setup.sh` completed successfully
- [ ] `make test-sip` shows all ports open
- [ ] API health check returns `{"status":"ok"}`
- [ ] Changed demo password
- [ ] Configured SMTP (for email verification)
- [ ] Added Stripe keys (for billing)
- [ ] Set up domain + SSL (optional)

---

## SSL with Let's Encrypt

```bash
# After DNS is pointed to your EC2 IP:
make ssl-certbot

# Then enable HTTPS in nginx
# Edit infra/nginx/conf.d/callspsy.conf — uncomment HTTPS server block
docker compose restart nginx
```

---

## Monitoring

```bash
# View all service status
make status

# Tail logs
make logs

# FreeSWITCH console
make shell-fs

# Check SIP registration of a gateway
docker compose exec freeswitch fs_cli -x "sofia status gateway"

# Check RTPengine stats
docker compose exec rtpengine rtpengine-ctl list
```

---

## Scaling

For high concurrent call volumes, adjust in `.env`:
```bash
# Increase FreeSWITCH sessions
# Edit infra/freeswitch/conf/autoload_configs/switch.conf.xml
# <param name="max-sessions" value="50000"/>
# <param name="sessions-per-second" value="1000"/>
```

For multiple FreeSWITCH nodes, update `infra/kamailio/dispatcher.list`:
```
1 sip:10.0.1.10:5080 0 10 fs_node1
1 sip:10.0.1.11:5080 0 10 fs_node2
1 sip:10.0.1.12:5080 0 10 fs_node3
```
