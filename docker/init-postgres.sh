#!/bin/bash
#
# PostgreSQL Initialization Script for Helixio
#
# This script handles PostgreSQL initialization, startup, and database setup
# for the embedded PostgreSQL instance in the Helixio Docker container.
#
# Usage:
#   init-postgres.sh init    - Initialize PostgreSQL data directory
#   init-postgres.sh start   - Start PostgreSQL server
#   init-postgres.sh setup   - Create database and enable extensions
#   init-postgres.sh stop    - Stop PostgreSQL gracefully
#   init-postgres.sh status  - Check if PostgreSQL is running
#

set -e

# Configuration
PGDATA="${PGDATA:-/config/pgdata}"
PGLOG="${HELIXIO_DIR:-/config/.helixio}/logs/postgres.log"
# PostgreSQL system user (always 'postgres' for pg_ctl, initdb, etc.)
POSTGRES_USER="postgres"
# Application database name
PGDATABASE="${PGDATABASE:-helixio}"

# Ensure log directory exists
mkdir -p "$(dirname "$PGLOG")"

#
# Initialize PostgreSQL data directory
#
init_postgres() {
    if [ -f "$PGDATA/PG_VERSION" ]; then
        echo "PostgreSQL data directory already initialized"
        return 0
    fi

    echo "Initializing PostgreSQL data directory at $PGDATA..."

    # Create data directory with correct permissions
    mkdir -p "$PGDATA"
    chmod 700 "$PGDATA"

    # Initialize database cluster
    # Using -E UTF8 for Unicode support, --locale=C for consistent behavior
    gosu "$POSTGRES_USER" initdb -D "$PGDATA" -E UTF8 --locale=C --auth=trust

    # Copy our custom configuration
    if [ -f /docker/postgres.conf ]; then
        cp /docker/postgres.conf "$PGDATA/postgresql.conf"
    else
        # Fallback: configure for embedded use
        cat >> "$PGDATA/postgresql.conf" <<EOF

# Helixio embedded PostgreSQL configuration
listen_addresses = 'localhost'
port = 5432
max_connections = 20
shared_buffers = 128MB
work_mem = 4MB
maintenance_work_mem = 64MB
wal_level = minimal
max_wal_senders = 0
fsync = on
synchronous_commit = on
log_destination = 'stderr'
logging_collector = off
EOF
    fi

    # Configure client authentication (trust for local connections)
    cat > "$PGDATA/pg_hba.conf" <<EOF
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
EOF

    echo "PostgreSQL initialized successfully"
}

#
# Start PostgreSQL server
#
start_postgres() {
    if pg_isready -q 2>/dev/null; then
        echo "PostgreSQL is already running"
        return 0
    fi

    echo "Starting PostgreSQL..."

    # Ensure data directory exists and has correct permissions
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
        echo "ERROR: PostgreSQL not initialized. Run 'init' first."
        exit 1
    fi

    # Ensure log file exists and is writable by postgres user
    # Handles cases where file exists with wrong ownership after container restart
    # Use postgres:helixio ownership so helixio user can read logs for debugging
    if [ -f "$PGLOG" ]; then
        chown postgres:helixio "$PGLOG" 2>/dev/null || true
        chmod 640 "$PGLOG" 2>/dev/null || true
    else
        touch "$PGLOG"
        chown postgres:helixio "$PGLOG"
        chmod 640 "$PGLOG"
    fi

    # Start PostgreSQL in background
    gosu "$POSTGRES_USER" pg_ctl -D "$PGDATA" -l "$PGLOG" start -w -t 30

    if [ $? -eq 0 ]; then
        echo "PostgreSQL started successfully"
    else
        echo "ERROR: PostgreSQL failed to start. Check logs at $PGLOG"
        tail -n 20 "$PGLOG" 2>/dev/null || true
        exit 1
    fi
}

#
# Wait for PostgreSQL to be ready
#
wait_ready() {
    local retries=${1:-30}
    local i=0

    echo "Waiting for PostgreSQL to be ready..."

    while [ $i -lt $retries ]; do
        if pg_isready -q 2>/dev/null; then
            echo "PostgreSQL is ready"
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done

    echo "ERROR: PostgreSQL not ready after $retries seconds"
    return 1
}

#
# Create database and enable extensions
#
setup_database() {
    echo "Setting up Helixio database..."

    # Use -U postgres to override any PGUSER environment variable
    # This ensures we connect as the postgres superuser for admin tasks

    # Create helixio role if it doesn't exist
    # This role is used by the application to connect to the database
    # Connect to 'postgres' database for admin operations before app database exists
    if gosu "$POSTGRES_USER" psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='helixio'" | grep -q 1; then
        echo "PostgreSQL role 'helixio' already exists"
    else
        echo "Creating PostgreSQL role 'helixio'..."
        gosu "$POSTGRES_USER" psql -U postgres -d postgres -c "CREATE ROLE helixio WITH LOGIN CREATEDB;"
    fi

    # Check if database exists using safe query
    if gosu "$POSTGRES_USER" psql -U postgres -d "$PGDATABASE" -c '\q' 2>/dev/null; then
        echo "Database '$PGDATABASE' already exists"
    else
        echo "Creating database '$PGDATABASE'..."
        gosu "$POSTGRES_USER" createdb -U postgres -O helixio "$PGDATABASE"
    fi

    # Enable CITEXT extension for case-insensitive text
    echo "Enabling CITEXT extension..."
    gosu "$POSTGRES_USER" psql -U postgres -d "$PGDATABASE" -c "CREATE EXTENSION IF NOT EXISTS citext;"

    # Ensure helixio role has necessary privileges
    echo "Granting privileges to 'helixio' role..."
    gosu "$POSTGRES_USER" psql -U postgres -d "$PGDATABASE" -c "GRANT ALL PRIVILEGES ON DATABASE $PGDATABASE TO helixio;"
    gosu "$POSTGRES_USER" psql -U postgres -d "$PGDATABASE" -c "GRANT ALL PRIVILEGES ON SCHEMA public TO helixio;"
    gosu "$POSTGRES_USER" psql -U postgres -d "$PGDATABASE" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO helixio;"
    gosu "$POSTGRES_USER" psql -U postgres -d "$PGDATABASE" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO helixio;"

    echo "Database setup complete"
}

#
# Stop PostgreSQL gracefully
#
stop_postgres() {
    if ! pg_isready -q 2>/dev/null; then
        echo "PostgreSQL is not running"
        return 0
    fi

    echo "Stopping PostgreSQL..."
    # Use smart shutdown first for graceful termination, fall back to fast
    if ! gosu "$POSTGRES_USER" pg_ctl -D "$PGDATA" stop -m smart -t 10 2>/dev/null; then
        echo "Graceful shutdown timed out, using fast shutdown..."
        gosu "$POSTGRES_USER" pg_ctl -D "$PGDATA" stop -m fast -t 20
    fi

    if [ $? -eq 0 ]; then
        echo "PostgreSQL stopped successfully"
    else
        echo "ERROR: PostgreSQL stop failed"
        exit 1
    fi
}

#
# Check PostgreSQL status
#
status_postgres() {
    if pg_isready -q 2>/dev/null; then
        echo "PostgreSQL is running"
        gosu "$POSTGRES_USER" pg_ctl -D "$PGDATA" status
        return 0
    else
        echo "PostgreSQL is not running"
        return 1
    fi
}

#
# Main entry point
#
case "${1:-}" in
    init)
        init_postgres
        ;;
    start)
        start_postgres
        ;;
    wait)
        wait_ready "${2:-30}"
        ;;
    setup)
        setup_database
        ;;
    stop)
        stop_postgres
        ;;
    status)
        status_postgres
        ;;
    *)
        echo "Usage: $0 {init|start|wait|setup|stop|status}"
        echo ""
        echo "Commands:"
        echo "  init   - Initialize PostgreSQL data directory"
        echo "  start  - Start PostgreSQL server"
        echo "  wait   - Wait for PostgreSQL to be ready (optional: timeout in seconds)"
        echo "  setup  - Create database and enable extensions"
        echo "  stop   - Stop PostgreSQL gracefully"
        echo "  status - Check if PostgreSQL is running"
        exit 1
        ;;
esac
