#!/bin/bash
#
# Redis Initialization Script for Helixio
#
# This script handles Redis startup and management for the embedded
# Redis instance in the Helixio Docker container.
#
# Usage:
#   init-redis.sh start   - Start Redis server
#   init-redis.sh stop    - Stop Redis gracefully
#   init-redis.sh wait    - Wait for Redis to be ready
#   init-redis.sh status  - Check if Redis is running
#   init-redis.sh ping    - Ping Redis to check health
#

set -e

# Configuration
REDIS_DIR="${REDIS_DIR:-/config/redis}"
REDIS_LOG="${HELIXIO_DIR:-/config/.helixio}/logs/redis.log"
REDIS_CONF="/docker/redis.conf"
REDIS_PID="${REDIS_DIR}/redis.pid"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"

# Ensure directories exist
mkdir -p "$REDIS_DIR"
mkdir -p "$(dirname "$REDIS_LOG")"

#
# Start Redis server
#
start_redis() {
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q "PONG"; then
        echo "Redis is already running"
        return 0
    fi

    echo "Starting Redis..."

    # Ensure log file exists with correct permissions
    touch "$REDIS_LOG"
    chown redis:redis "$REDIS_LOG" 2>/dev/null || true
    chmod 640 "$REDIS_LOG" 2>/dev/null || true

    # Ensure data directory has correct permissions
    chown -R redis:redis "$REDIS_DIR" 2>/dev/null || true
    chmod 750 "$REDIS_DIR" 2>/dev/null || true

    # Build Redis arguments
    local redis_args=(
        "--daemonize" "yes"
        "--pidfile" "$REDIS_PID"
        "--logfile" "$REDIS_LOG"
        "--dir" "$REDIS_DIR"
        "--bind" "$REDIS_HOST"
        "--port" "$REDIS_PORT"
    )

    # Add password if configured
    if [ -n "$REDIS_PASSWORD" ]; then
        redis_args+=("--requirepass" "$REDIS_PASSWORD")
    fi

    # Include config file if it exists
    if [ -f "$REDIS_CONF" ]; then
        # Start Redis with config file and additional arguments
        gosu redis redis-server "$REDIS_CONF" "${redis_args[@]}"
    else
        # Start Redis with arguments only
        gosu redis redis-server "${redis_args[@]}"
    fi

    # Wait a moment for Redis to start
    sleep 1

    # Verify Redis started successfully
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q "PONG"; then
        echo "Redis started successfully on $REDIS_HOST:$REDIS_PORT"
        return 0
    else
        echo "ERROR: Redis failed to start. Check logs at $REDIS_LOG"
        tail -n 20 "$REDIS_LOG" 2>/dev/null || true
        return 1
    fi
}

#
# Wait for Redis to be ready
#
wait_ready() {
    local retries=${1:-30}
    local i=0

    echo "Waiting for Redis to be ready..."

    while [ $i -lt $retries ]; do
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q "PONG"; then
            echo "Redis is ready"
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done

    echo "ERROR: Redis not ready after $retries seconds"
    return 1
}

#
# Stop Redis gracefully
#
stop_redis() {
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q "PONG"; then
        echo "Redis is not running"
        return 0
    fi

    echo "Stopping Redis..."

    # Use SHUTDOWN NOSAVE for cache (we don't need persistence)
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SHUTDOWN NOSAVE 2>/dev/null; then
        echo "Redis stopped successfully"
        return 0
    fi

    # If SHUTDOWN failed, try killing the process
    if [ -f "$REDIS_PID" ]; then
        local pid=$(cat "$REDIS_PID")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Sending SIGTERM to Redis (PID: $pid)..."
            kill -TERM "$pid" 2>/dev/null || true

            # Wait up to 10 seconds for graceful shutdown
            local i=0
            while [ $i -lt 10 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                i=$((i + 1))
            done

            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo "Force killing Redis..."
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$REDIS_PID"
    fi

    echo "Redis stopped"
}

#
# Check Redis status
#
status_redis() {
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q "PONG"; then
        echo "Redis is running on $REDIS_HOST:$REDIS_PORT"

        # Show memory info
        local info=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory 2>/dev/null | grep -E "^(used_memory_human|maxmemory_human):" || true)
        if [ -n "$info" ]; then
            echo "Memory: $info"
        fi

        return 0
    else
        echo "Redis is not running"
        return 1
    fi
}

#
# Ping Redis
#
ping_redis() {
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q "PONG"; then
        echo "PONG"
        return 0
    else
        echo "Redis is not responding"
        return 1
    fi
}

#
# Main entry point
#
case "${1:-}" in
    start)
        start_redis
        ;;
    wait)
        wait_ready "${2:-30}"
        ;;
    stop)
        stop_redis
        ;;
    status)
        status_redis
        ;;
    ping)
        ping_redis
        ;;
    *)
        echo "Usage: $0 {start|wait|stop|status|ping}"
        echo ""
        echo "Commands:"
        echo "  start  - Start Redis server"
        echo "  wait   - Wait for Redis to be ready (optional: timeout in seconds)"
        echo "  stop   - Stop Redis gracefully"
        echo "  status - Check if Redis is running"
        echo "  ping   - Ping Redis to check health"
        exit 1
        ;;
esac
