FROM node:24.21-trixie-slim AS backend-build
WORKDIR /opt/app

COPY backend/package*.json ./
COPY backend/tsconfig.json ./
COPY backend/tsconfig.build.json ./

RUN npm ci --prefer-offline --no-audit --no-fund

COPY backend/ .

RUN npm run build \
    && npm run trace

FROM node:24.21-trixie-slim AS frontend-build
WORKDIR /opt/frontend
COPY frontend/package*.json ./
COPY frontend/.npmrc ./
RUN npm ci --prefer-offline --no-audit --no-fund
COPY frontend/ ./
RUN npm run typecheck \
    && NODE_ENV=production npm run cb

FROM node:24.21-trixie-slim AS runtime-manager
WORKDIR /opt/pm2
COPY runtime-manager/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.21-trixie-slim
WORKDIR /opt/app

LABEL org.opencontainers.image.title="Remnacust Subscription Page"
LABEL org.opencontainers.image.description="Remnacust Subscription Page"
LABEL org.opencontainers.image.url="https://github.com/lottman/Remnacust-panel"
LABEL org.opencontainers.image.source="https://github.com/lottman/Remnacust-panel"
LABEL org.opencontainers.image.vendor="Remnacust"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.documentation="https://docs.rw"


RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=backend-build /opt/app/dist ./dist

COPY --from=frontend-build /opt/frontend/dist/ ./frontend/
COPY backend/ecosystem.config.js ./
COPY backend/docker-entrypoint.sh ./

ENV PM2_DISABLE_VERSION_CHECK=true
ENV NODE_OPTIONS="--max-old-space-size=16384"

COPY --from=runtime-manager /opt/pm2 /opt/pm2
RUN ln -s /opt/pm2/node_modules/pm2/bin/pm2 /usr/local/bin/pm2 \
    && ln -s /opt/pm2/node_modules/pm2/bin/pm2-runtime /usr/local/bin/pm2-runtime \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/include/node

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 \
    CMD curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${APP_PORT:-3010}/internal/health" || exit 1

ENTRYPOINT [ "/bin/sh", "docker-entrypoint.sh" ]

CMD [ "pm2-runtime", "start", "ecosystem.config.js", "--env", "production" ]
