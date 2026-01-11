#!/bin/bash
set -e

#
# Helixio Docker Entrypoint
#
# This script initializes and manages the Helixio application with embedded PostgreSQL.
# It handles:
# - User/group permissions for volume access
# - PostgreSQL initialization and startup
# - Prisma migrations
# - Application startup
# - Graceful shutdown of both PostgreSQL and Node.js
#

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# =============================================================================
# Validate PUID/PGID
# =============================================================================

# Validate PUID is numeric
if ! echo "$PUID" | grep -qE '^[0-9]+$'; then
    echo "ERROR: PUID must be a numeric value, got: $PUID"
    exit 1
fi

# Validate PGID is numeric
if ! echo "$PGID" | grep -qE '^[0-9]+$'; then
    echo "ERROR: PGID must be a numeric value, got: $PGID"
    exit 1
fi

echo "Starting Helixio with UID:${PUID} GID:${PGID}"

# =============================================================================
# User/Group ID Configuration
# =============================================================================

# Update user/group IDs if different from default
if [ "$PUID" != "1000" ] || [ "$PGID" != "1000" ]; then
    echo "Updating helixio user to UID:${PUID} GID:${PGID}..."
    if ! groupmod -o -g "$PGID" helixio 2>&1; then
        echo "WARN: Failed to update helixio group to GID $PGID"
    fi
    if ! usermod -o -u "$PUID" helixio 2>&1; then
        echo "WARN: Failed to update helixio user to UID $PUID"
    fi
fi

# =============================================================================
# Directory Structure Initialization
# =============================================================================

HELIXIO_DIR="/config/.helixio"
mkdir -p "$HELIXIO_DIR"/{logs,cache/covers,cache/series/comicvine,cache/series/metron,cache/series-covers,cache/thumbnails}

# PostgreSQL data directory
export PGDATA="/config/pgdata"

# Redis data directory
export REDIS_DIR="/config/redis"
mkdir -p "$REDIS_DIR"
export PGUSER="helixio"
export PGDATABASE="helixio"
mkdir -p "$PGDATA"

# Set ownership (helixio owns app data, postgres owns pgdata, redis owns redis dir)
chown -R helixio:helixio /config /app
chown -R postgres:postgres "$PGDATA" /var/run/postgresql
chown -R redis:redis "$REDIS_DIR" /var/run/redis

# Pre-create postgres log file with correct ownership
# This allows pg_ctl (running as postgres) to write logs
# Make it group-readable so helixio user can also read logs for debugging
touch "$HELIXIO_DIR/logs/postgres.log"
chown postgres:helixio "$HELIXIO_DIR/logs/postgres.log"
chmod 640 "$HELIXIO_DIR/logs/postgres.log"

# =============================================================================
# Cookie Security handling
# =============================================================================

if [ -z "$COOKIE_SECURE" ]; then
    export COOKIE_SECURE=false
    echo "COOKIE_SECURE defaulted to false (HTTP access)"
fi

# =============================================================================
# API_KEY_SECRET handling
# =============================================================================

SECRET_FILE="${HELIXIO_DIR}/.api_key_secret"

if [ -z "$API_KEY_SECRET" ]; then
    if [ -f "$SECRET_FILE" ]; then
        echo "Loading API_KEY_SECRET from persisted file"
        export API_KEY_SECRET=$(cat "$SECRET_FILE")
    else
        echo "Generating new API_KEY_SECRET (first run)"
        NEW_SECRET=$(openssl rand -hex 32)
        echo -n "$NEW_SECRET" > "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
        chown helixio:helixio "$SECRET_FILE"
        export API_KEY_SECRET="$NEW_SECRET"
    fi
else
    echo "Using API_KEY_SECRET from environment variable"
    if [ ! -f "$SECRET_FILE" ]; then
        echo -n "$API_KEY_SECRET" > "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
        chown helixio:helixio "$SECRET_FILE"
    fi
fi

# =============================================================================
# PostgreSQL Setup
# =============================================================================

export HELIXIO_DIR  # Pass to init-postgres.sh for log path

echo "Initializing PostgreSQL..."
if ! /docker/init-postgres.sh init; then
    echo "ERROR: PostgreSQL initialization failed"
    echo "Check permissions on /config/pgdata directory"
    exit 1
fi

echo "Starting PostgreSQL..."
if ! /docker/init-postgres.sh start; then
    echo "ERROR: PostgreSQL failed to start"
    echo "=== PostgreSQL Log (last 50 lines) ==="
    tail -n 50 "$HELIXIO_DIR/logs/postgres.log" 2>/dev/null || echo "(no log available)"
    echo "======================================="
    exit 1
fi

echo "Waiting for PostgreSQL to be ready..."
if ! /docker/init-postgres.sh wait 30; then
    echo "ERROR: PostgreSQL failed to become ready within 30 seconds"
    echo "=== PostgreSQL Log (last 50 lines) ==="
    tail -n 50 "$HELIXIO_DIR/logs/postgres.log" 2>/dev/null || echo "(no log available)"
    echo "======================================="
    /docker/init-postgres.sh stop
    exit 1
fi

echo "Setting up database..."
/docker/init-postgres.sh setup

# =============================================================================
# Database URL Configuration
# =============================================================================

export DATABASE_URL="postgresql://${PGUSER}@localhost:5432/${PGDATABASE}"
echo "DATABASE_URL configured for PostgreSQL"

# =============================================================================
# Redis Setup (Optional - graceful fallback if fails)
# =============================================================================

echo "Starting Redis..."
export HELIXIO_DIR  # Pass to init-redis.sh for log path
if /docker/init-redis.sh start; then
    echo "Redis started successfully"
    export REDIS_ENABLED=true
    export REDIS_HOST=127.0.0.1
    export REDIS_PORT=6379
else
    echo "WARN: Redis failed to start, continuing without L2 cache (will use memory cache only)"
    export REDIS_ENABLED=false
fi

# =============================================================================
# Prisma Migrations
# =============================================================================

cd /app/server

echo "Running Prisma migrations..."
# First try migrate deploy for production migrations
gosu helixio npx prisma migrate deploy 2>/dev/null || true

# Always run db push to ensure schema is applied
# This handles cases where there are no migrations or schema drifted
echo "Syncing database schema..."
if ! gosu helixio npx prisma db push --skip-generate --accept-data-loss 2>/dev/null; then
    echo "ERROR: Database schema sync failed"
    /docker/init-postgres.sh stop
    exit 1
fi

echo "Generating Prisma client..."
gosu helixio npx prisma generate

# =============================================================================
# Signal Handling for Graceful Shutdown
# =============================================================================

NODE_PID=""

shutdown() {
    echo ""
    echo "Received shutdown signal, cleaning up..."

    # Stop Node.js application
    if [ -n "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
        echo "Stopping Node.js application..."
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi

    # Stop Redis (if running)
    if [ "$REDIS_ENABLED" = "true" ]; then
        echo "Stopping Redis..."
        /docker/init-redis.sh stop || true
    fi

    # Stop PostgreSQL
    echo "Stopping PostgreSQL..."
    /docker/init-postgres.sh stop

    echo "Shutdown complete"
    exit 0
}

trap shutdown TERM INT

# =============================================================================
# Start Application
# =============================================================================

cd /app
echo "Starting Helixio application..."

# Start Node.js in background to allow signal handling
gosu helixio env HOME=/config "$@" &
NODE_PID=$!

# Wait for the application to exit
wait $NODE_PID
EXIT_CODE=$?

# If we get here, the app exited on its own (not from signal)
echo "Application exited with code $EXIT_CODE"

# Clean up PostgreSQL
/docker/init-postgres.sh stop

exit $EXIT_CODE
