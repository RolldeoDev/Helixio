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

# Run database migrations
export DATABASE_URL="file:${HELIXIO_DIR}/helixio.db"
cd /app/server
gosu helixio npx prisma migrate deploy 2>/dev/null || \
    gosu helixio npx prisma db push --skip-generate 2>/dev/null || true

# Start application
cd /app
exec gosu helixio "$@"
