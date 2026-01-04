# Stage 1: Dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y \
    build-essential python3 libvips-dev libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci

# Stage 2: Builder
FROM deps AS builder
WORKDIR /app
COPY . .
# Generate Prisma client and build server
WORKDIR /app/server
RUN npx prisma generate && npm run build
WORKDIR /app/client
RUN npm run build

# Stage 3: Production
FROM node:20-bookworm-slim AS production

# OCI Labels for Unraid and container registries
LABEL org.opencontainers.image.title="Helixio" \
      org.opencontainers.image.description="Web-based comic book library platform with integrated reader" \
      org.opencontainers.image.url="https://github.com/RolldeoDev/Helixio" \
      org.opencontainers.image.source="https://github.com/RolldeoDev/Helixio" \
      org.opencontainers.image.vendor="RolldeoDev" \
      org.opencontainers.image.licenses="MIT" \
      maintainer="RolldeoDev"

# Install runtime dependencies including PostgreSQL 15
RUN apt-get update && apt-get install -y \
    libvips42 p7zip-full gosu openssl libsecret-1-0 \
    postgresql-15 postgresql-contrib-15 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/run/postgresql \
    && chown -R postgres:postgres /var/run/postgresql

# Add PostgreSQL 15 binaries to PATH (Debian installs them to /usr/lib/postgresql/15/bin/)
ENV PATH="/usr/lib/postgresql/15/bin:$PATH"
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --workspace=server --omit=dev
COPY --from=builder /app/server/prisma ./server/prisma
# Copy pre-generated Prisma client from builder (to avoid generating in production)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Copy Docker scripts and configuration
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY docker/init-postgres.sh /docker/init-postgres.sh
COPY docker/postgres.conf /docker/postgres.conf
RUN chmod +x /docker-entrypoint.sh /docker/init-postgres.sh && \
    usermod -l helixio -d /home/helixio -m node && \
    groupmod -n helixio node && \
    usermod -a -G postgres helixio

ENV NODE_ENV=production PORT=8483 HOME=/config NO_OPEN=true
VOLUME ["/config", "/comics"]
EXPOSE 8483

# Increased start-period to allow PostgreSQL initialization on first run
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8483/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
