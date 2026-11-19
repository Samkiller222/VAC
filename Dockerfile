# VAC monitor as a container (alternative to the systemd service).
# Build:  docker build -t vac-monitor .
# Run:    docker run -d --name vac-monitor --restart unless-stopped \
#           --env-file /etc/vac-monitor/vac-monitor.env \
#           -e OFFICES_FILE=/config/offices.json -e DATA_DIR=/data \
#           -v /etc/vac-monitor/offices.json:/config/offices.json:ro \
#           -v vac-monitor-data:/data \
#           -p 127.0.0.1:3000:3000 vac-monitor
FROM node:22-alpine

WORKDIR /app
COPY package.json index.js seed-demo.js ./
COPY src ./src
COPY public ./public
COPY config ./config

# Run as the unprivileged "node" user that the image provides
RUN mkdir -p /data && chown node:node /data
USER node

ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "index.js"]
