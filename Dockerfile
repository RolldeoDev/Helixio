# Stage 1: Dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y \
    build-essential python3 libvips-dev \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci

# Stage 2: Builder
FROM deps AS builder
WORKDIR /app
COPY . .
WORKDIR /app/server
RUN npx prisma generate && npm run build
WORKDIR /app/client
RUN npm run build

# Stage 3: Production
FROM node:20-bookworm-slim AS production
RUN apt-get update && apt-get install -y \
    libvips42 p7zip-full gosu \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --workspace=server --omit=dev
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=builder /app/server/node_modules/@prisma ./server/node_modules/@prisma
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && \
    usermod -l helixio -d /home/helixio -m node && \
    groupmod -n helixio node

ENV NODE_ENV=production PORT=8483 HOME=/config NO_OPEN=true
VOLUME ["/config", "/comics"]
EXPOSE 8483

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8483/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
