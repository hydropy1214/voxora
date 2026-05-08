FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg2 \
    wget \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add FreeSWITCH repo
RUN wget -O - https://files.freeswitch.org/repo/deb/debian-release/fsstretch-archive-keyring.asc | gpg --dearmor > /usr/share/keyrings/freeswitch.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/freeswitch.gpg] https://files.freeswitch.org/repo/deb/debian-release/ bookworm main" > /etc/apt/sources.list.d/freeswitch.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    freeswitch-meta-bare \
    freeswitch-conf-vanilla \
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
    freeswitch-mod-flite \
    freeswitch-mod-cdr-csv \
    freeswitch-mod-spandsp \
    freeswitch-sounds-en-us-callie \
    && rm -rf /var/lib/apt/lists/*

COPY conf/ /etc/freeswitch/
COPY scripts/ /opt/voxora/

RUN mkdir -p /var/lib/freeswitch/recordings /var/log/freeswitch \
    && chown -R freeswitch:freeswitch /var/lib/freeswitch /var/log/freeswitch /etc/freeswitch

EXPOSE 5060/udp 5060/tcp 5061/tcp 8021/tcp 10000-20000/udp

USER freeswitch

CMD ["/usr/bin/freeswitch", "-nonat", "-nf"]
