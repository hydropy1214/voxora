FROM debian:bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg2 wget curl ca-certificates gettext-base netcat-traditional \
    && rm -rf /var/lib/apt/lists/*

# Add Kamailio official repo
RUN wget -qO /usr/share/keyrings/kamailio.gpg \
    "https://www.kamailio.org/pub/kamailio/gpg-key.asc" \
    && echo "deb [signed-by=/usr/share/keyrings/kamailio.gpg] http://deb.kamailio.org/kamailio57 bookworm main" \
    > /etc/apt/sources.list.d/kamailio.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    kamailio \
    kamailio-tls-modules \
    kamailio-outbound-modules \
    kamailio-utils-modules \
    kamailio-extra-modules \
    kamailio-json-modules \
    kamailio-rtpengine-modules \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/run/kamailio /etc/kamailio \
    && chown -R kamailio:kamailio /var/run/kamailio

COPY kamailio.cfg /etc/kamailio/kamailio.cfg.tmpl
COPY dispatcher.list /etc/kamailio/dispatcher.list
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5060/udp 5060/tcp 5061/tcp

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/sbin/kamailio", "-DD", "-E", "-f", "/etc/kamailio/kamailio.cfg"]
