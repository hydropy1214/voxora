#!/bin/bash
set -e

PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"
PRIVATE_IP="${PRIVATE_IP:-127.0.0.1}"
FREESWITCH_IP="${FREESWITCH_IP:-127.0.0.1}"
FREESWITCH_PORT="${FREESWITCH_PORT:-5080}"
RTPENGINE_IP="${RTPENGINE_IP:-127.0.0.1}"
RTPENGINE_PORT="${RTPENGINE_PORT:-2223}"

echo "[Kamailio] Public IP: ${PUBLIC_IP}"
echo "[Kamailio] Private IP: ${PRIVATE_IP}"
echo "[Kamailio] FreeSWITCH: ${FREESWITCH_IP}:${FREESWITCH_PORT}"
echo "[Kamailio] RTPengine: ${RTPENGINE_IP}:${RTPENGINE_PORT}"

# Substitute IPs into kamailio config template
sed \
  -e "s/PRIVATE_IP_PLACEHOLDER/${PRIVATE_IP}/g" \
  -e "s/PUBLIC_IP_PLACEHOLDER/${PUBLIC_IP}/g" \
  -e "s/FREESWITCH_IP_PLACEHOLDER/${FREESWITCH_IP}/g" \
  -e "s/FREESWITCH_PORT_PLACEHOLDER/${FREESWITCH_PORT}/g" \
  -e "s/RTPENGINE_IP_PLACEHOLDER/${RTPENGINE_IP}/g" \
  -e "s/RTPENGINE_PORT_PLACEHOLDER/${RTPENGINE_PORT}/g" \
  /etc/kamailio/kamailio.cfg.tmpl > /etc/kamailio/kamailio.cfg

# Update dispatcher with actual FreeSWITCH IP
cat > /etc/kamailio/dispatcher.list << EOF
1 sip:${FREESWITCH_IP}:${FREESWITCH_PORT} 0 10 fs_primary
EOF

echo "[Kamailio] Config written. Starting..."
exec "$@"
