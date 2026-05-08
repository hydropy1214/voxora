# ============================================================
#  Voxora Kamailio SIP Proxy Image
#  Base: kamailio/kamailio (official Docker Hub image)
#  No external repo download needed — works offline after first pull
# ============================================================

# Use official Kamailio Docker Hub image (pre-built, always available)
FROM kamailio/kamailio:5.7-debian AS kamailio-base

# Install helper tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-traditional \
    curl \
    gettext-base \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install rtpengine module for Kamailio (if not included in base)
RUN apt-get update && apt-get install -y --no-install-recommends \
    kamailio-rtpengine-modules 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/*

# Create required directories
RUN mkdir -p /var/run/kamailio /etc/kamailio \
    && chown -R kamailio:kamailio /var/run/kamailio 2>/dev/null || true

# Copy Kamailio configuration (template — IPs injected at runtime)
COPY kamailio.cfg /etc/kamailio/kamailio.cfg.tmpl
COPY dispatcher.list /etc/kamailio/dispatcher.list

# Copy and enable entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5060/udp 5060/tcp 5061/tcp

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/sbin/kamailio", "-DD", "-E", "-f", "/etc/kamailio/kamailio.cfg"]
