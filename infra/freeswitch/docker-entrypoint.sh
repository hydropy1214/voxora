#!/bin/bash
set -e

# ──────────────────────────────────────────────────────────────────
#  FreeSWITCH Docker Entrypoint
#  Injects PUBLIC_IP into FreeSWITCH vars.xml before starting
# ──────────────────────────────────────────────────────────────────

PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"
PRIVATE_IP="${PRIVATE_IP:-127.0.0.1}"
ESL_PASSWORD="${ESL_PASSWORD:-ClueCon}"

echo "[FS] Public IP: ${PUBLIC_IP}"
echo "[FS] Private IP: ${PRIVATE_IP}"

# Write runtime vars.xml with actual IPs
cat > /etc/freeswitch/vars.xml << EOF
<include>
  <X-PRE-PROCESS cmd="set" data="public_ip=${PUBLIC_IP}"/>
  <X-PRE-PROCESS cmd="set" data="local_ip_v4=${PRIVATE_IP}"/>
  <X-PRE-PROCESS cmd="set" data="domain=\$\${local_ip_v4}"/>
  <X-PRE-PROCESS cmd="set" data="domain_name=\$\${domain}"/>
  <X-PRE-PROCESS cmd="set" data="default_password=${ESL_PASSWORD}"/>
  <X-PRE-PROCESS cmd="set" data="hold_music=local_stream://moh"/>
  <X-PRE-PROCESS cmd="set" data="rtp_start_port=10000"/>
  <X-PRE-PROCESS cmd="set" data="rtp_end_port=20000"/>
  <X-PRE-PROCESS cmd="set" data="use_profile=voxora_outbound"/>
</include>
EOF

echo "[FS] Vars written. Starting FreeSWITCH..."
exec "$@"
