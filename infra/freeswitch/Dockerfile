FROM debian:bookworm-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg2 wget curl ca-certificates procps netcat-traditional \
    && rm -rf /var/lib/apt/lists/*

# Add FreeSWITCH official repo
RUN wget -q -O /usr/share/keyrings/freeswitch.gpg \
    https://files.freeswitch.org/repo/deb/debian-release/fsstretch-archive-keyring.asc \
    && echo "deb [signed-by=/usr/share/keyrings/freeswitch.gpg] https://files.freeswitch.org/repo/deb/debian-release/ bookworm main" \
    > /etc/apt/sources.list.d/freeswitch.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    freeswitch \
    freeswitch-mod-sofia \
    freeswitch-mod-commands \
    freeswitch-mod-dptools \
    freeswitch-mod-event-socket \
    freeswitch-mod-logfile \
    freeswitch-mod-console \
    freeswitch-mod-sndfile \
    freeswitch-mod-native-file \
    freeswitch-mod-tone-stream \
    freeswitch-mod-local-stream \
    freeswitch-mod-cdr-csv \
    freeswitch-mod-spandsp \
    freeswitch-mod-lua \
    freeswitch-mod-opus \
    freeswitch-mod-amr \
    freeswitch-mod-ilbc \
    freeswitch-mod-g723-1 \
    freeswitch-mod-g729 \
    freeswitch-mod-hash \
    freeswitch-mod-dialplan-xml \
    freeswitch-mod-expr \
    freeswitch-mod-say-en \
    freeswitch-sounds-en-us-callie \
    && rm -rf /var/lib/apt/lists/*

# Create required directories
RUN mkdir -p \
    /var/lib/freeswitch/recordings \
    /var/lib/freeswitch/storage \
    /var/lib/freeswitch/db \
    /var/log/freeswitch \
    /opt/voxora \
    /etc/freeswitch \
    && chown -R freeswitch:freeswitch \
        /var/lib/freeswitch \
        /var/log/freeswitch \
        /opt/voxora

# Copy configuration files
COPY conf/ /etc/freeswitch/

# Copy Voxora Lua scripts
COPY scripts/ /opt/voxora/

# Set permissions
RUN chown -R freeswitch:freeswitch /etc/freeswitch /opt/voxora \
    && chmod +x /opt/voxora/*.lua 2>/dev/null || true

# Entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose SIP and RTP ports
EXPOSE 5080/udp 5080/tcp 5081/tcp 8021/tcp

# Switch to freeswitch user
USER freeswitch

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/bin/freeswitch", "-nonat", "-nf", "-nosql", "-c"]
