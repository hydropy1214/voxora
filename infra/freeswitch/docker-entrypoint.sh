#!/bin/bash
# ============================================================
#  FreeSWITCH Docker Entrypoint
#
#  What this does:
#  1. Writes /etc/freeswitch/vars.xml with actual PUBLIC_IP
#     → FreeSWITCH uses this in ext-rtp-ip / ext-sip-ip
#     → Without correct public IP, media goes to wrong address on AWS
#  2. Creates /var/callspsy/gateways/ directory (shared volume)
#     → Backend writes gateway XML files here
#     → FreeSWITCH sofia profile includes *.xml from this dir
#  3. Starts FreeSWITCH
# ============================================================
set -e

PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"
PRIVATE_IP="${PRIVATE_IP:-0.0.0.0}"
ESL_PASSWORD="${ESL_PASSWORD:-ClueCon}"
GATEWAY_DIR="/var/callspsy/gateways"

echo "[FS] ============================================"
echo "[FS] CallsPsy FreeSWITCH"
echo "[FS] Public IP:   ${PUBLIC_IP}"
echo "[FS] Private IP:  ${PRIVATE_IP}"
echo "[FS] Gateway dir: ${GATEWAY_DIR}"
echo "[FS] ============================================"

# ── 1. Write vars.xml with actual public IP ─────────────────────────────────
cat > /etc/freeswitch/vars.xml << EOF
<?xml version="1.0"?>
<include>
  <!--
    CallsPsy FreeSWITCH Variables
    Auto-generated at container start.
    Public IP: ${PUBLIC_IP}
  -->

  <!-- Network: bind to private IP, advertise public IP in SIP/SDP -->
  <X-PRE-PROCESS cmd="set" data="local_ip_v4=${PRIVATE_IP}"/>
  <X-PRE-PROCESS cmd="set" data="public_ip=${PUBLIC_IP}"/>
  <X-PRE-PROCESS cmd="set" data="domain=\$\${local_ip_v4}"/>
  <X-PRE-PROCESS cmd="set" data="domain_name=\$\${domain}"/>

  <!-- ESL password (matches FREESWITCH_ESL_PASSWORD in backend .env) -->
  <X-PRE-PROCESS cmd="set" data="default_password=${ESL_PASSWORD}"/>

  <!-- RTP port range (must match Security Group / firewall rules) -->
  <X-PRE-PROCESS cmd="set" data="rtp_start_port=10000"/>
  <X-PRE-PROCESS cmd="set" data="rtp_end_port=20000"/>

  <!-- Audio defaults -->
  <X-PRE-PROCESS cmd="set" data="hold_music=silence_stream://0"/>
  <X-PRE-PROCESS cmd="set" data="use_profile=callspsy_outbound"/>

  <!-- Sound path (needed by some modules) -->
  <X-PRE-PROCESS cmd="set" data="sound_prefix=/usr/share/freeswitch/sounds/en/us/callie"/>
</include>
EOF
echo "[FS] vars.xml written"

# ── 2. Ensure gateway directory exists and is writable ─────────────────────
mkdir -p "${GATEWAY_DIR}"
chown -R freeswitch:freeswitch "${GATEWAY_DIR}" 2>/dev/null || true
chmod 775 "${GATEWAY_DIR}"
echo "[FS] Gateway dir ready: ${GATEWAY_DIR}"

# ── 3. Ensure recordings directory exists ──────────────────────────────────
mkdir -p /var/lib/freeswitch/recordings
chown -R freeswitch:freeswitch /var/lib/freeswitch/recordings 2>/dev/null || true

# ── 4. Start FreeSWITCH ────────────────────────────────────────────────────
echo "[FS] Starting FreeSWITCH..."
exec "$@"
