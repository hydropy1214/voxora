# ============================================================
#  Voxora FreeSWITCH Image
#  Base: signalwire/freeswitch (official, pre-built, no repo issues)
#  Falls back to building from Debian if official image unavailable
# ============================================================

# Stage 1: Use the official SignalWire FreeSWITCH image
# This is pre-built and works without any external repo access during Docker build
FROM signalwire/freeswitch:v1.10 AS freeswitch-base

# If the above image is unavailable, uncomment the alternative below:
# FROM debian:bookworm-slim AS freeswitch-base
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     wget curl ca-certificates gnupg2 && \
#     wget -q -O - https://files.freeswitch.org/repo/deb/debian-release/fsstretch-archive-keyring.asc \
#     | gpg --dearmor > /usr/share/keyrings/freeswitch.gpg && \
#     echo "deb [signed-by=/usr/share/keyrings/freeswitch.gpg] https://files.freeswitch.org/repo/deb/debian-release/ bookworm main" \
#     > /etc/apt/sources.list.d/freeswitch.list && \
#     apt-get update && apt-get install -y freeswitch freeswitch-mod-sofia \
#     freeswitch-mod-commands freeswitch-mod-dptools freeswitch-mod-event-socket \
#     freeswitch-mod-spandsp freeswitch-mod-lua freeswitch-mod-sndfile \
#     freeswitch-mod-native-file freeswitch-mod-tone-stream freeswitch-mod-local-stream \
#     freeswitch-mod-cdr-csv freeswitch-mod-hash freeswitch-mod-dialplan-xml \
#     freeswitch-mod-say-en freeswitch-mod-console freeswitch-mod-logfile && \
#     rm -rf /var/lib/apt/lists/*

FROM freeswitch-base

# Install additional tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-traditional \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create required directories
RUN mkdir -p \
    /var/lib/freeswitch/recordings \
    /var/lib/freeswitch/storage \
    /var/lib/freeswitch/db \
    /var/log/freeswitch \
    /opt/voxora \
    /etc/freeswitch

# Copy Voxora configuration
COPY conf/ /etc/freeswitch/

# Copy Lua scripts
COPY scripts/ /opt/voxora/

# Set permissions
RUN chown -R freeswitch:freeswitch \
    /etc/freeswitch \
    /var/lib/freeswitch \
    /var/log/freeswitch \
    /opt/voxora \
    2>/dev/null || true

# Entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5080/udp 5080/tcp 5081/tcp 8021/tcp

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/bin/freeswitch", "-nonat", "-nf", "-c"]
