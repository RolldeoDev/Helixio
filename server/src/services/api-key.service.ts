/**
 * API Key Service
 *
 * Manages API keys for programmatic access to Helixio.
 * Keys are hashed with HMAC-SHA256 before storage - the raw key is only shown once at creation.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import {
  ApiScope,
  validateScopesForRole,
  filterValidScopes,
  isAdminScope,
} from './api-key-scopes.js';
import { UserInfo } from './auth.service.js';

const prisma = new PrismaClient();

// HMAC secret for key hashing - MUST be set via environment variable
// SECURITY: This secret is critical - without it, API keys cannot be validated
// across server restarts and become completely insecure.
//
// Uses lazy initialization to allow the env loader to run before this is needed.
let _hmacSecret: string | null = null;

/**
 * Get the HMAC secret for API key hashing.
 * Throws an error if API_KEY_SECRET is not configured.
 */
function getHmacSecret(): string {
  if (_hmacSecret !== null) {
    return _hmacSecret;
  }

  const secret = process.env.API_KEY_SECRET;
  if (!secret) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════════╗');
    console.error('║  CRITICAL SECURITY ERROR: API_KEY_SECRET not configured         ║');
    console.error('╠══════════════════════════════════════════════════════════════════╣');
    console.error('║  The API_KEY_SECRET environment variable is required for        ║');
    console.error('║  secure API key authentication. Without it, API keys cannot     ║');
    console.error('║  be validated across server restarts.                           ║');
    console.error('║                                                                  ║');
    console.error('║  Generate a secret with:                                         ║');
    console.error("║    node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    console.error('║                                                                  ║');
    console.error('║  Add it to your .env file:                                       ║');
    console.error('║    API_KEY_SECRET="your-generated-secret"                        ║');
    console.error('║                                                                  ║');
    console.error('║  Or set it in your environment:                                  ║');
    console.error('║    export API_KEY_SECRET="your-generated-secret"                 ║');
    console.error('╚══════════════════════════════════════════════════════════════════╝');
    console.error('');
    throw new Error('API_KEY_SECRET environment variable is not configured');
  }

  _hmacSecret = secret;
  return secret;
}

// =============================================================================
// Types
// =============================================================================

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  description?: string;
  expiresAt?: Date;
  ipWhitelist?: string[];
  scopes: string[];
  libraryIds?: string[];
  rateLimitTier?: 'standard' | 'elevated' | 'unlimited';
}

export interface ApiKeyInfo {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  scopes: string[];
  libraryIds: string[] | null;
  expiresAt: Date | null;
  ipWhitelist: string[] | null;
  rateLimitTier: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  usageCount: number;
  createdAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export interface ApiKeyWithUser extends ApiKeyInfo {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    role: string;
  };
}

export interface ApiKeyValidation {
  id: string;
  userId: string;
  user: UserInfo;
  scopes: string[];
  libraryIds: string[] | null;
  tier: string;
  ipWhitelist: string[] | null;
}

export interface UsageStats {
  totalRequests: number;
  requestsLast24h: number;
  requestsLast7d: number;
  requestsLast30d: number;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  recentRequests: Array<{
    endpoint: string;
    method: string;
    statusCode: number;
    timestamp: Date;
    ipAddress: string;
  }>;
}

export interface SystemApiKeyStats {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  revokedKeys: number;
  requestsLast24h: number;
  requestsLast7d: number;
  requestsLast30d: number;
}

// =============================================================================
// Key Generation and Hashing
// =============================================================================

/**
 * Generate a new API key
 * Format: hlx_{43 chars of base64url} = 47 chars total
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const base64 = randomBytes.toString('base64url');
  return `hlx_${base64}`;
}

/**
 * Hash an API key using HMAC-SHA256
 */
function hashApiKey(rawKey: string): string {
  return crypto.createHmac('sha256', getHmacSecret()).update(rawKey).digest('hex');
}

/**
 * Extract the prefix from a raw API key for display
 */
function getKeyPrefix(rawKey: string): string {
  return rawKey.substring(0, 12); // "hlx_xxxxxxxx"
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new API key
 * Returns the raw key (only shown once) and the key info
 */
export async function createApiKey(
  input: CreateApiKeyInput,
  userRole: 'admin' | 'user' | 'guest'
): Promise<{ key: string; info: ApiKeyInfo }> {
  const {
    userId,
    name,
    description,
    expiresAt,
    ipWhitelist,
    scopes,
    libraryIds,
    rateLimitTier = 'standard',
  } = input;

  // Validate name
  if (!name || name.trim().length < 1) {
    throw new Error('API key name is required');
  }
  if (name.length > 100) {
    throw new Error('API key name must be 100 characters or less');
  }

  // Validate scopes
  const validScopes = filterValidScopes(scopes);
  if (validScopes.length === 0) {
    throw new Error('At least one valid scope is required');
  }

  // Validate scopes against user role
  const scopeValidation = validateScopesForRole(validScopes, userRole);
  if (!scopeValidation.valid) {
    throw new Error(
      scopeValidation.reason ||
        `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`
    );
  }

  // Validate IP whitelist format
  if (ipWhitelist && ipWhitelist.length > 0) {
    for (const ip of ipWhitelist) {
      if (!isValidIpOrCidr(ip)) {
        throw new Error(`Invalid IP address or CIDR: ${ip}`);
      }
    }
  }

  // Validate library IDs exist if provided
  if (libraryIds && libraryIds.length > 0) {
    const libraries = await prisma.library.findMany({
      where: { id: { in: libraryIds } },
      select: { id: true },
    });
    if (libraries.length !== libraryIds.length) {
      throw new Error('One or more library IDs are invalid');
    }
  }

  // Generate the key
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);

  // Create the key record
  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name: name.trim(),
      description: description?.trim() || null,
      keyPrefix,
      keyHash,
      expiresAt: expiresAt || null,
      ipWhitelist: ipWhitelist ? JSON.stringify(ipWhitelist) : null,
      scopes: JSON.stringify(validScopes),
      libraryIds: libraryIds ? JSON.stringify(libraryIds) : null,
      rateLimitTier,
    },
  });

  return {
    key: rawKey,
    info: mapApiKeyToInfo(apiKey),
  };
}

/**
 * Validate an API key and return its info if valid
 */
export async function validateApiKey(
  rawKey: string
): Promise<ApiKeyValidation | null> {
  // Check key format
  if (!rawKey || !rawKey.startsWith('hlx_')) {
    return null;
  }

  const keyHash = hashApiKey(rawKey);

  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash },
    include: {
      user: true,
    },
  });

  if (!apiKey) {
    return null;
  }

  // Check if key is active
  if (!apiKey.isActive) {
    return null;
  }

  // Check if key is expired
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return null;
  }

  // Check if user is active
  if (!apiKey.user.isActive) {
    return null;
  }

  // Parse stored JSON fields
  const scopes: string[] = JSON.parse(apiKey.scopes);
  const libraryIds: string[] | null = apiKey.libraryIds
    ? JSON.parse(apiKey.libraryIds)
    : null;
  const ipWhitelist: string[] | null = apiKey.ipWhitelist
    ? JSON.parse(apiKey.ipWhitelist)
    : null;

  return {
    id: apiKey.id,
    userId: apiKey.userId,
    user: {
      id: apiKey.user.id,
      username: apiKey.user.username,
      email: apiKey.user.email,
      displayName: apiKey.user.displayName,
      avatarUrl: apiKey.user.avatarUrl,
      role: apiKey.user.role as 'admin' | 'user' | 'guest',
      isActive: apiKey.user.isActive,
      profilePrivate: apiKey.user.profilePrivate,
      hideReadingStats: apiKey.user.hideReadingStats,
      setupComplete: apiKey.user.setupComplete,
      permissions: apiKey.user.permissions,
      createdAt: apiKey.user.createdAt,
      lastLoginAt: apiKey.user.lastLoginAt,
      lastActiveAt: apiKey.user.lastActiveAt,
    },
    scopes,
    libraryIds,
    tier: apiKey.rateLimitTier,
    ipWhitelist,
  };
}

/**
 * Update API key usage tracking
 */
export async function updateApiKeyUsage(
  keyId: string,
  ipAddress: string
): Promise<void> {
  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      lastUsedAt: new Date(),
      lastUsedIp: ipAddress,
      usageCount: { increment: 1 },
    },
  });
}

/**
 * Log an API key request
 */
export async function logApiKeyRequest(
  keyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ipAddress: string,
  userAgent: string | null,
  durationMs?: number
): Promise<void> {
  await prisma.apiKeyUsageLog.create({
    data: {
      apiKeyId: keyId,
      endpoint,
      method,
      statusCode,
      ipAddress,
      userAgent,
      durationMs,
    },
  });
}

/**
 * List API keys for a user
 */
export async function listUserApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return keys.map(mapApiKeyToInfo);
}

/**
 * Get a specific API key (user must own it)
 */
export async function getApiKey(
  keyId: string,
  userId: string
): Promise<ApiKeyInfo | null> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  return key ? mapApiKeyToInfo(key) : null;
}

/**
 * Update an API key
 */
export async function updateApiKey(
  keyId: string,
  userId: string,
  userRole: 'admin' | 'user' | 'guest',
  updates: {
    name?: string;
    description?: string;
    ipWhitelist?: string[];
    scopes?: string[];
    libraryIds?: string[];
    isActive?: boolean;
  }
): Promise<ApiKeyInfo> {
  // Verify ownership
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!existing) {
    throw new Error('API key not found');
  }

  // Validate updates
  const data: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length < 1) {
      throw new Error('API key name is required');
    }
    data.name = updates.name.trim();
  }

  if (updates.description !== undefined) {
    data.description = updates.description?.trim() || null;
  }

  if (updates.ipWhitelist !== undefined) {
    if (updates.ipWhitelist.length > 0) {
      for (const ip of updates.ipWhitelist) {
        if (!isValidIpOrCidr(ip)) {
          throw new Error(`Invalid IP address or CIDR: ${ip}`);
        }
      }
    }
    data.ipWhitelist = updates.ipWhitelist.length > 0
      ? JSON.stringify(updates.ipWhitelist)
      : null;
  }

  if (updates.scopes !== undefined) {
    const validScopes = filterValidScopes(updates.scopes);
    if (validScopes.length === 0) {
      throw new Error('At least one valid scope is required');
    }
    const scopeValidation = validateScopesForRole(validScopes, userRole);
    if (!scopeValidation.valid) {
      throw new Error(
        scopeValidation.reason ||
          `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`
      );
    }
    data.scopes = JSON.stringify(validScopes);
  }

  if (updates.libraryIds !== undefined) {
    if (updates.libraryIds.length > 0) {
      const libraries = await prisma.library.findMany({
        where: { id: { in: updates.libraryIds } },
        select: { id: true },
      });
      if (libraries.length !== updates.libraryIds.length) {
        throw new Error('One or more library IDs are invalid');
      }
    }
    data.libraryIds = updates.libraryIds.length > 0
      ? JSON.stringify(updates.libraryIds)
      : null;
  }

  if (updates.isActive !== undefined) {
    data.isActive = updates.isActive;
  }

  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data,
  });

  return mapApiKeyToInfo(updated);
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  keyId: string,
  userId: string,
  reason?: string
): Promise<void> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!existing) {
    throw new Error('API key not found');
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason || null,
    },
  });
}

/**
 * Rotate an API key (revoke old, create new with same settings)
 */
export async function rotateApiKey(
  keyId: string,
  userId: string,
  userRole: 'admin' | 'user' | 'guest'
): Promise<{ key: string; info: ApiKeyInfo }> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!existing) {
    throw new Error('API key not found');
  }

  // Revoke the old key
  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: 'Rotated',
    },
  });

  // Create a new key with the same settings
  const scopes: string[] = JSON.parse(existing.scopes);
  const libraryIds: string[] | null = existing.libraryIds
    ? JSON.parse(existing.libraryIds)
    : null;
  const ipWhitelist: string[] | null = existing.ipWhitelist
    ? JSON.parse(existing.ipWhitelist)
    : null;

  return createApiKey(
    {
      userId,
      name: existing.name,
      description: existing.description || undefined,
      expiresAt: existing.expiresAt || undefined,
      ipWhitelist: ipWhitelist || undefined,
      scopes,
      libraryIds: libraryIds || undefined,
      rateLimitTier: existing.rateLimitTier as 'standard' | 'elevated' | 'unlimited',
    },
    userRole
  );
}

/**
 * Get usage statistics for an API key
 */
export async function getApiKeyUsage(
  keyId: string,
  days: number = 30
): Promise<UsageStats> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get total and recent counts
  const [totalRequests, requests24h, requests7d, requests30d] = await Promise.all([
    prisma.apiKeyUsageLog.count({ where: { apiKeyId: keyId } }),
    prisma.apiKeyUsageLog.count({
      where: { apiKeyId: keyId, timestamp: { gte: cutoff24h } },
    }),
    prisma.apiKeyUsageLog.count({
      where: { apiKeyId: keyId, timestamp: { gte: cutoff7d } },
    }),
    prisma.apiKeyUsageLog.count({
      where: { apiKeyId: keyId, timestamp: { gte: cutoff } },
    }),
  ]);

  // Get top endpoints
  const logs = await prisma.apiKeyUsageLog.findMany({
    where: { apiKeyId: keyId, timestamp: { gte: cutoff } },
    select: { endpoint: true },
  });

  const endpointCounts = new Map<string, number>();
  for (const log of logs) {
    endpointCounts.set(log.endpoint, (endpointCounts.get(log.endpoint) || 0) + 1);
  }

  const topEndpoints = Array.from(endpointCounts.entries())
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Get recent requests
  const recentLogs = await prisma.apiKeyUsageLog.findMany({
    where: { apiKeyId: keyId },
    orderBy: { timestamp: 'desc' },
    take: 20,
    select: {
      endpoint: true,
      method: true,
      statusCode: true,
      timestamp: true,
      ipAddress: true,
    },
  });

  return {
    totalRequests,
    requestsLast24h: requests24h,
    requestsLast7d: requests7d,
    requestsLast30d: requests30d,
    topEndpoints,
    recentRequests: recentLogs,
  };
}

// =============================================================================
// Admin Functions
// =============================================================================

/**
 * List all API keys (admin only)
 */
export async function listAllApiKeys(): Promise<ApiKeyWithUser[]> {
  const keys = await prisma.apiKey.findMany({
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return keys.map((key) => ({
    ...mapApiKeyToInfo(key),
    user: key.user,
  }));
}

/**
 * Admin revoke any API key
 */
export async function adminRevokeApiKey(
  keyId: string,
  reason?: string
): Promise<void> {
  const existing = await prisma.apiKey.findUnique({
    where: { id: keyId },
  });

  if (!existing) {
    throw new Error('API key not found');
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason || 'Revoked by admin',
    },
  });
}

/**
 * Get system-wide API key statistics (admin only)
 */
export async function getSystemApiKeyStats(): Promise<SystemApiKeyStats> {
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalKeys,
    activeKeys,
    expiredKeys,
    revokedKeys,
    requests24h,
    requests7d,
    requests30d,
  ] = await Promise.all([
    prisma.apiKey.count(),
    prisma.apiKey.count({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    prisma.apiKey.count({
      where: {
        isActive: true,
        expiresAt: { lte: now },
      },
    }),
    prisma.apiKey.count({
      where: { isActive: false },
    }),
    prisma.apiKeyUsageLog.count({
      where: { timestamp: { gte: cutoff24h } },
    }),
    prisma.apiKeyUsageLog.count({
      where: { timestamp: { gte: cutoff7d } },
    }),
    prisma.apiKeyUsageLog.count({
      where: { timestamp: { gte: cutoff30d } },
    }),
  ]);

  return {
    totalKeys,
    activeKeys,
    expiredKeys,
    revokedKeys,
    requestsLast24h: requests24h,
    requestsLast7d: requests7d,
    requestsLast30d: requests30d,
  };
}

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * Clean up expired API keys and old usage logs
 */
export async function cleanupExpiredKeys(
  keyRetentionDays: number = 30,
  logRetentionDays: number = 90
): Promise<{ keysDeleted: number; logsDeleted: number }> {
  const now = new Date();
  const keyCutoff = new Date(now.getTime() - keyRetentionDays * 24 * 60 * 60 * 1000);
  const logCutoff = new Date(now.getTime() - logRetentionDays * 24 * 60 * 60 * 1000);

  // Delete expired keys that have been expired for more than retention period
  const keysResult = await prisma.apiKey.deleteMany({
    where: {
      isActive: false,
      OR: [
        { revokedAt: { lte: keyCutoff } },
        { expiresAt: { lte: keyCutoff } },
      ],
    },
  });

  // Delete old usage logs
  const logsResult = await prisma.apiKeyUsageLog.deleteMany({
    where: {
      timestamp: { lte: logCutoff },
    },
  });

  return {
    keysDeleted: keysResult.count,
    logsDeleted: logsResult.count,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map a Prisma ApiKey to ApiKeyInfo
 */
function mapApiKeyToInfo(
  key: {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    keyPrefix: string;
    scopes: string;
    libraryIds: string | null;
    expiresAt: Date | null;
    ipWhitelist: string | null;
    rateLimitTier: string;
    isActive: boolean;
    lastUsedAt: Date | null;
    lastUsedIp: string | null;
    usageCount: number;
    createdAt: Date;
    revokedAt: Date | null;
    revokedReason: string | null;
  }
): ApiKeyInfo {
  return {
    id: key.id,
    userId: key.userId,
    name: key.name,
    description: key.description,
    keyPrefix: key.keyPrefix,
    scopes: JSON.parse(key.scopes),
    libraryIds: key.libraryIds ? JSON.parse(key.libraryIds) : null,
    expiresAt: key.expiresAt,
    ipWhitelist: key.ipWhitelist ? JSON.parse(key.ipWhitelist) : null,
    rateLimitTier: key.rateLimitTier,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt,
    lastUsedIp: key.lastUsedIp,
    usageCount: key.usageCount,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt,
    revokedReason: key.revokedReason,
  };
}

/**
 * Validate an IP address or CIDR notation
 */
function isValidIpOrCidr(value: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (ipv4Regex.test(value)) {
    const [ipPart, cidr] = value.split('/');
    if (!ipPart) return false;
    const parts = ipPart.split('.').map(Number);
    if (parts.some((p) => p > 255)) return false;
    if (cidr && (parseInt(cidr) < 0 || parseInt(cidr) > 32)) return false;
    return true;
  }

  // IPv6 (simplified check)
  const ipv6Regex = /^([0-9a-fA-F:]+)(\/\d{1,3})?$/;
  if (ipv6Regex.test(value)) {
    const [, cidr] = value.split('/');
    if (cidr && (parseInt(cidr) < 0 || parseInt(cidr) > 128)) return false;
    return true;
  }

  return false;
}

/**
 * Check if an IP matches a whitelist
 */
export function isIpAllowed(
  ip: string | undefined,
  whitelist: string[]
): boolean {
  if (!ip) return false;
  if (whitelist.length === 0) return true;

  // Normalize IP (strip ::ffff: prefix for IPv4-mapped IPv6)
  const normalizedIp = ip.replace(/^::ffff:/, '');

  for (const allowed of whitelist) {
    // Exact match
    if (normalizedIp === allowed) return true;

    // CIDR match (simplified - just checks if IP starts with network prefix)
    if (allowed.includes('/')) {
      const [network] = allowed.split('/');
      if (network && normalizedIp.startsWith(network.replace(/\.0+$/, ''))) return true;
    }
  }

  return false;
}

/**
 * Check if an API key has a specific scope
 */
export function hasScope(apiKeyScopes: string[], requiredScope: ApiScope): boolean {
  return apiKeyScopes.includes(requiredScope);
}

/**
 * Check if an API key has access to a library
 */
export function hasLibraryAccess(
  apiKeyLibraryIds: string[] | null,
  libraryId: string
): boolean {
  // null means all libraries
  if (apiKeyLibraryIds === null) return true;
  return apiKeyLibraryIds.includes(libraryId);
}
