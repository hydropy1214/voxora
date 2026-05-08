FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg2 wget curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN wget -O /usr/share/keyrings/kamailio.gpg https://www.kamailio.org/pub/kamailio/gpg-key.asc \
    && echo "deb [signed-by=/usr/share/keyrings/kamailio.gpg] http://deb.kamailio.org/kamailio57 bookworm main" > /etc/apt/sources.list.d/kamailio.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    kamailio \
    kamailio-redis-modules \
    kamailio-tls-modules \
    kamailio-outbound-modules \
    kamailio-utils-modules \
    && rm -rf /var/lib/apt/lists/*

COPY kamailio.cfg /etc/kamailio/kamailio.cfg

EXPOSE 5060/udp 5060/tcp 5061/tcp

CMD ["/usr/sbin/kamailio", "-DD", "-E", "-f", "/etc/kamailio/kamailio.cfg"]
