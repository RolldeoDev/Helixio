/**
 * Redis Adapter Service
 *
 * Implements the CacheLayer interface for Redis.
 * Provides connection management, graceful degradation,
 * and all cache operations (key-value and sorted sets).
 *
 * Key features:
 * - Auto-reconnect with exponential backoff
 * - Graceful degradation (returns null on errors, never throws)
 * - JSON serialization for complex values
 * - SCAN-based pattern invalidation (production-safe, non-blocking)
 */

import { createClient, type RedisClientType } from 'redis';
import { createServiceLogger } from '../logger.service.js';
import type {
  CacheLayer,
  CacheLayerStats,
  SortedSetMember,
  RedisConfig,
  DEFAULT_REDIS_CONFIG,
} from './cache.types.js';

const logger = createServiceLogger('redis-adapter');

// =============================================================================
// Redis Adapter Class
// =============================================================================

class RedisAdapterService implements CacheLayer {
  readonly name = 'redis-l2';

  private client: RedisClientType | null = null;
  private connected = false;
  private connecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private config: RedisConfig;

  // Statistics
  private stats: CacheLayerStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  constructor(config: Partial<RedisConfig> = {}) {
    this.config = {
      host: config.host ?? process.env.REDIS_HOST ?? '127.0.0.1',
      port: config.port ?? parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: config.password ?? process.env.REDIS_PASSWORD,
      db: config.db ?? parseInt(process.env.REDIS_DB ?? '0', 10),
      maxRetries: config.maxRetries ?? 10,
      retryDelayMs: config.retryDelayMs ?? 1000,
      connectTimeoutMs: config.connectTimeoutMs ?? 5000,
      commandTimeoutMs: config.commandTimeoutMs ?? 2000,
    };
  }

  // =============================================================================
  // Connection Management
  // =============================================================================

  /**
   * Initialize Redis connection.
   * Non-blocking: logs warning and continues if connection fails.
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      const url = this.buildConnectionUrl();
      this.client = createClient({
        url,
        socket: {
          connectTimeout: this.config.connectTimeoutMs,
          reconnectStrategy: (retries) => {
            if (retries >= this.config.maxRetries) {
              logger.error({ retries }, 'Redis max reconnection attempts reached');
              return new Error('Max retries reached');
            }
            const delay = Math.min(retries * this.config.retryDelayMs, 10000);
            logger.debug({ retries, delay }, 'Redis reconnecting');
            return delay;
          },
        },
      });

      // Event handlers
      this.client.on('connect', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        logger.info('Redis connected');
      });

      this.client.on('ready', () => {
        logger.debug('Redis ready');
      });

      this.client.on('error', (err) => {
        this.stats.errors++;
        // Only log once per disconnect event
        if (this.connected) {
          logger.error({ err }, 'Redis error');
        }
        this.connected = false;
      });

      this.client.on('end', () => {
        this.connected = false;
        logger.info('Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        logger.debug('Redis reconnecting...');
      });

      await this.client.connect();
      await this.client.select(this.config.db);

      this.connected = true;
      logger.info({ host: this.config.host, port: this.config.port }, 'Redis initialized');
    } catch (error) {
      logger.warn({ error }, 'Redis connection failed - caching degraded to L1 only');
      this.connected = false;
      this.client = null;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Gracefully disconnect from Redis.
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // Force disconnect if quit fails
        this.client.disconnect();
      }
      this.client = null;
    }

    this.connected = false;
    logger.info('Redis disconnected');
  }

  /**
   * Check if Redis is currently available.
   */
  isAvailable(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Ping Redis to check connection health.
   */
  async ping(): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const result = await this.client!.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheLayerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics (useful for monitoring intervals).
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  // =============================================================================
  // Core Key-Value Operations
  // =============================================================================

  /**
   * Get a value from Redis.
   * Returns null if not found, expired, or on error (graceful degradation).
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      this.stats.misses++;
      return null;
    }

    try {
      const raw = await this.client!.get(key);

      if (raw === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis GET failed');
      this.handleConnectionError(error);
      return null;
    }
  }

  /**
   * Set a value in Redis with TTL.
   * Fails silently on error (graceful degradation).
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const serialized = JSON.stringify(value);
      await this.client!.setEx(key, ttlSeconds, serialized);
      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis SET failed');
      this.handleConnectionError(error);
    }
  }

  /**
   * Delete a key from Redis.
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const result = await this.client!.del(key);
      if (result > 0) {
        this.stats.deletes++;
        return true;
      }
      return false;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis DEL failed');
      this.handleConnectionError(error);
      return false;
    }
  }

  /**
   * Invalidate all keys matching a pattern.
   * Uses SCAN for production safety (non-blocking).
   */
  async invalidatePattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) return 0;

    try {
      let deletedCount = 0;
      const scanPattern = pattern.endsWith('*') ? pattern : `${pattern}*`;

      // Use SCAN for non-blocking iteration
      for await (const key of this.client!.scanIterator({
        MATCH: scanPattern,
        COUNT: 100,
      })) {
        await this.client!.del(key);
        deletedCount++;
        this.stats.deletes++;
      }

      if (deletedCount > 0) {
        logger.debug({ pattern, deletedCount }, 'Redis pattern invalidation complete');
      }

      return deletedCount;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, pattern }, 'Redis pattern invalidation failed');
      this.handleConnectionError(error);
      return 0;
    }
  }

  // =============================================================================
  // Sorted Set Operations (for pagination indices)
  // =============================================================================

  /**
   * Add members to a sorted set.
   * Used for building series pagination indices.
   */
  async zAdd(key: string, members: SortedSetMember[]): Promise<void> {
    if (!this.isAvailable() || members.length === 0) return;

    try {
      // Transform to redis format: [{ score, value }]
      const entries = members.map((m) => ({
        score: m.score,
        value: m.value,
      }));

      await this.client!.zAdd(key, entries);
      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key, count: members.length }, 'Redis ZADD failed');
      this.handleConnectionError(error);
    }
  }

  /**
   * Get a range of members from a sorted set by index.
   * Returns member values (not scores) in sorted order.
   */
  async zRange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.isAvailable()) return [];

    try {
      const result = await this.client!.zRange(key, start, stop);
      if (result.length > 0) {
        this.stats.hits++;
      } else {
        this.stats.misses++;
      }
      return result;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis ZRANGE failed');
      this.handleConnectionError(error);
      return [];
    }
  }

  /**
   * Get a range of members from a sorted set with their scores.
   */
  async zRangeWithScores(key: string, start: number, stop: number): Promise<SortedSetMember[]> {
    if (!this.isAvailable()) return [];

    try {
      const result = await this.client!.zRangeWithScores(key, start, stop);
      if (result.length > 0) {
        this.stats.hits++;
      } else {
        this.stats.misses++;
      }
      return result.map((r) => ({ value: r.value, score: r.score }));
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis ZRANGE WITHSCORES failed');
      this.handleConnectionError(error);
      return [];
    }
  }

  /**
   * Get the number of members in a sorted set.
   */
  async zCard(key: string): Promise<number> {
    if (!this.isAvailable()) return 0;

    try {
      return await this.client!.zCard(key);
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis ZCARD failed');
      this.handleConnectionError(error);
      return 0;
    }
  }

  /**
   * Remove members from a sorted set.
   */
  async zRemove(key: string, members: string[]): Promise<void> {
    if (!this.isAvailable() || members.length === 0) return;

    try {
      await this.client!.zRem(key, members);
      this.stats.deletes++;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis ZREM failed');
      this.handleConnectionError(error);
    }
  }

  /**
   * Set TTL on a key.
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      return await this.client!.expire(key, ttlSeconds);
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis EXPIRE failed');
      this.handleConnectionError(error);
      return false;
    }
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      logger.debug({ error, key }, 'Redis EXISTS failed');
      this.handleConnectionError(error);
      return false;
    }
  }

  /**
   * Get Redis memory info (for health checks).
   */
  async getMemoryInfo(): Promise<{ usedBytes: number; maxBytes: number } | null> {
    if (!this.isAvailable()) return null;

    try {
      const info = await this.client!.info('memory');
      const usedMatch = info.match(/used_memory:(\d+)/);
      const maxMatch = info.match(/maxmemory:(\d+)/);

      return {
        usedBytes: usedMatch?.[1] ? parseInt(usedMatch[1], 10) : 0,
        maxBytes: maxMatch?.[1] ? parseInt(maxMatch[1], 10) : 0,
      };
    } catch {
      return null;
    }
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private buildConnectionUrl(): string {
    const { host, port, password } = this.config;
    if (password) {
      return `redis://:${password}@${host}:${port}`;
    }
    return `redis://${host}:${port}`;
  }

  private handleConnectionError(error: unknown): void {
    // Check if this is a connection error that indicates Redis is down
    const isConnectionError =
      error instanceof Error &&
      (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('Socket closed unexpectedly'));

    if (isConnectionError && this.connected) {
      this.connected = false;
      logger.warn('Redis connection lost, operations will fall back to L1 cache');
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const redisAdapter = new RedisAdapterService();

/**
 * Initialize Redis connection.
 * Call this during server startup.
 */
export async function initializeRedis(): Promise<void> {
  await redisAdapter.connect();
}

/**
 * Close Redis connection.
 * Call this during server shutdown.
 */
export async function closeRedis(): Promise<void> {
  await redisAdapter.disconnect();
}

export default redisAdapter;
