#!/bin/bash
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "Starting Helixio with UID:${PUID} GID:${PGID}"

# Update user/group IDs if different from default
if [ "$PUID" != "1000" ] || [ "$PGID" != "1000" ]; then
    groupmod -o -g "$PGID" helixio 2>/dev/null || true
    usermod -o -u "$PUID" helixio 2>/dev/null || true
fi

# Initialize directory structure
HELIXIO_DIR="/config/.helixio"
mkdir -p "$HELIXIO_DIR"/{logs,cache/covers,cache/series/comicvine,cache/series/metron,cache/series-covers,cache/thumbnails}

# Set ownership
chown -R helixio:helixio /config /app

# =============================================================================
# API_KEY_SECRET handling
# =============================================================================
# API_KEY_SECRET is required for secure API key authentication.
# Priority:
#   1. Environment variable (if set by user)
#   2. Persisted secret file (auto-generated on first run)
#
# This ensures API keys remain valid across container restarts.
# =============================================================================

SECRET_FILE="${HELIXIO_DIR}/.api_key_secret"

if [ -z "$API_KEY_SECRET" ]; then
    # No environment variable set, check for persisted secret
    if [ -f "$SECRET_FILE" ]; then
        echo "Loading API_KEY_SECRET from persisted file"
        export API_KEY_SECRET=$(cat "$SECRET_FILE")
    else
        # Generate a new secret and persist it
        echo "Generating new API_KEY_SECRET (first run)"
        NEW_SECRET=$(openssl rand -hex 32)
        echo -n "$NEW_SECRET" > "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
        chown helixio:helixio "$SECRET_FILE"
        export API_KEY_SECRET="$NEW_SECRET"
    fi
else
    echo "Using API_KEY_SECRET from environment variable"
    # Optionally persist the env var secret so it survives if the env var is removed
    if [ ! -f "$SECRET_FILE" ]; then
        echo -n "$API_KEY_SECRET" > "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
        chown helixio:helixio "$SECRET_FILE"
    fi
fi

# =============================================================================
# Database setup
# =============================================================================

export DATABASE_URL="file:${HELIXIO_DIR}/helixio.db"
cd /app/server
gosu helixio npx prisma migrate deploy 2>/dev/null || \
    gosu helixio npx prisma db push --skip-generate 2>/dev/null || true

# Start application
# Export HOME explicitly to ensure app uses /config for data storage
# (gosu normally resets HOME based on user's passwd entry)
cd /app
exec gosu helixio env HOME=/config "$@"
