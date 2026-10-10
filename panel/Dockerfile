# Build from the public project root: docker build -f panel/Dockerfile .
FROM node:24.21-trixie-slim AS backend-build
WORKDIR /opt/app

COPY panel/backend/package*.json ./
COPY panel/backend/patches ./patches
COPY panel/backend/scripts ./scripts
COPY panel/backend/vendor ./vendor
COPY panel/backend/prisma ./prisma
COPY panel/backend/rspack.config.mjs ./
COPY panel/backend/prisma.config.ts ./prisma.config.ts
COPY panel/backend/@types ./@types

RUN npm ci --prefer-offline --no-audit --no-fund

COPY panel/backend/tsconfig*.json ./
COPY panel/backend/src ./src
COPY panel/backend/libs ./libs

RUN npm run migrate:generate \
    && npm run build --prefix libs/contract \
    && npm run generate:openapi \
    && test -s openapi.json \
    && npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

RUN cd node_modules/@prisma/client/runtime && \
    find . -maxdepth 1 -type f ! -name 'library.js' ! -name 'package.json' -delete && \
    cd /opt/app/node_modules/.prisma/client && \
    find . -maxdepth 1 -type f \
      \( -name 'edge.*' -o -name 'index-browser.js' -o -name 'wasm.*' \
         -o -name 'query_engine_bg.*' -o -name '*-loader.mjs' \) -delete && \
    cd /opt/app && \
    rm -rf node_modules/typescript \
           node_modules/effect/dist/esm \
           node_modules/effect/dist/dts \
           node_modules/effect/src && \
    find node_modules \( -name '*.js.map' -o -name '*.mjs.map' \) -delete && \
    find node_modules \( -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' \) -delete

FROM node:24.21-trixie-slim AS frontend
WORKDIR /opt/frontend
COPY panel/frontend/package*.json ./
COPY panel/frontend/vendor ./vendor
COPY --from=backend-build /opt/app/libs/contract/build ./vendor/backend-contract/build
RUN --mount=type=cache,id=remnacust-frontend-npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --no-fund
COPY panel/frontend/ ./
COPY --from=backend-build /opt/app/libs/contract/build ./vendor/backend-contract/build
RUN --mount=type=cache,id=remnacust-webfonts,target=/opt/frontend/node_modules/.vite,sharing=locked \
    npm run typecheck \
    && npm run cb

FROM alpine:3.21 AS certificates
RUN apk add --no-cache ca-certificates

FROM node:24.21-trixie-slim AS runtime-manager
WORKDIR /opt/pm2
COPY panel/runtime-manager/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.21-trixie-slim
COPY --from=certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

LABEL org.opencontainers.image.title="Remnacust"
LABEL org.opencontainers.image.version="1.1.7.19"
LABEL org.opencontainers.image.description="Powerful proxy management tool"
LABEL org.opencontainers.image.url="https://github.com/lottman/Remnacust-panel"
LABEL org.opencontainers.image.source="https://github.com/lottman/Remnacust-panel"
LABEL org.opencontainers.image.vendor="Remnacust"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.documentation="https://docs.rw"

WORKDIR /opt/app

ARG BRANCH=main
ARG __RW_METADATA_VERSION=1.1.7.19
ARG __RW_METADATA_GIT_BACKEND_COMMIT=unknown
ARG __RW_METADATA_GIT_FRONTEND_COMMIT=unknown
ARG __RW_METADATA_GIT_BRANCH=local
ARG __RW_METADATA_BUILD_TIME=""
ARG __RW_METADATA_BUILD_NUMBER=0

RUN printf 'Acquire::https::CaInfo "/etc/ssl/certs/ca-certificates.crt";\nAPT::Update::Error-Mode "any";\n' > /etc/apt/apt.conf.d/80remnacust-ca \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 update && apt-get upgrade -y && apt-get install -y --no-install-recommends curl ca-certificates \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

ENV REMNAWAVE_BRANCH=${BRANCH}
ENV PRISMA_HIDE_UPDATE_MESSAGE=true
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV PM2_DISABLE_VERSION_CHECK=true
ENV HWID_ENABLED_DEFAULT=true
ENV __RW_METADATA_VERSION=${__RW_METADATA_VERSION}
ENV __RW_METADATA_GIT_BACKEND_COMMIT=${__RW_METADATA_GIT_BACKEND_COMMIT}
ENV __RW_METADATA_GIT_FRONTEND_COMMIT=${__RW_METADATA_GIT_FRONTEND_COMMIT}
ENV __RW_METADATA_GIT_BRANCH=${__RW_METADATA_GIT_BRANCH}
ENV __RW_METADATA_BUILD_TIME=${__RW_METADATA_BUILD_TIME}
ENV __RW_METADATA_BUILD_NUMBER=${__RW_METADATA_BUILD_NUMBER}

COPY --from=backend-build /opt/app/dist ./dist
COPY --from=backend-build /opt/app/openapi.json ./openapi.json
COPY --from=frontend /opt/frontend/dist ./frontend
COPY --from=backend-build /opt/app/prisma/generated ./prisma/generated
COPY --from=backend-build /opt/app/prisma/migrations ./prisma/migrations
COPY --from=backend-build /opt/app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=backend-build /opt/app/node_modules ./node_modules
COPY --from=backend-build /opt/app/vendor ./vendor
RUN node -e "require('@remnawave/node-contract')"

COPY panel/backend/configs /var/lib/remnawave/configs
COPY panel/backend/package*.json ./
COPY panel/backend/prisma.config.ts ./prisma.config.ts
COPY panel/backend/ecosystem.config.js ./
COPY panel/backend/docker-entrypoint.sh ./

RUN node -e "const fs=require('fs');const p='docker-entrypoint.sh';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'))" \
    && /bin/sh -n docker-entrypoint.sh

COPY --from=runtime-manager /opt/pm2 /opt/pm2
RUN ln -s /opt/pm2/node_modules/pm2/bin/pm2 /usr/local/bin/pm2 \
    && ln -s /opt/pm2/node_modules/pm2/bin/pm2-runtime /usr/local/bin/pm2-runtime \
    && chmod +x /opt/app/dist/cli.js \
    && ln -s /opt/app/dist/cli.js /usr/local/bin/cli \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
        /usr/local/bin/corepack \
        /usr/local/include/node

ENTRYPOINT [ "/bin/sh", "docker-entrypoint.sh" ]
CMD [ "pm2-runtime", "start", "ecosystem.config.js", "--env", "production" ]
