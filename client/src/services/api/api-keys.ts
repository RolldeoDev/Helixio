/**
 * API Keys Module
 *
 * Client-side API for managing API keys.
 */

import { get, post, patch, del } from './shared';

// =============================================================================
// Types
// =============================================================================

export interface ApiKeyInfo {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  scopes: string[];
  libraryIds: string[] | null;
  expiresAt: string | null;
  ipWhitelist: string[] | null;
  rateLimitTier: string;
  isActive: boolean;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  usageCount: number;
  createdAt: string;
  revokedAt: string | null;
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

export interface CreateApiKeyInput {
  name: string;
  description?: string;
  expiresAt?: string;
  ipWhitelist?: string[];
  scopes: string[];
  libraryIds?: string[];
  rateLimitTier?: 'standard' | 'elevated' | 'unlimited';
}

export interface UpdateApiKeyInput {
  name?: string;
  description?: string;
  ipWhitelist?: string[];
  scopes?: string[];
  libraryIds?: string[];
  isActive?: boolean;
}

export interface CreateApiKeyResult {
  key: string;
  info: ApiKeyInfo;
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
    timestamp: string;
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

export interface ScopesResponse {
  scopes: Record<string, string>;
  availableScopes: string[];
  presets: Record<string, string[]>;
  categories: Record<string, string[]>;
}

// =============================================================================
// User API Key Management
// =============================================================================

/**
 * Get all API keys for the current user
 */
export async function getApiKeys(): Promise<ApiKeyInfo[]> {
  const response = await get<{ success: boolean; data: { keys: ApiKeyInfo[] } }>('/api-keys');
  return response.data.keys;
}

/**
 * Create a new API key
 * Returns the raw key (only shown once) and key info
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const response = await post<{
    success: boolean;
    data: { key: string; info: ApiKeyInfo };
    message: string;
  }>('/api-keys', input);
  return response.data;
}

/**
 * Get available scopes for the current user
 */
export async function getAvailableScopes(): Promise<ScopesResponse> {
  const response = await get<{ success: boolean; data: ScopesResponse }>('/api-keys/scopes');
  return response.data;
}

/**
 * Get a specific API key
 */
export async function getApiKey(keyId: string): Promise<ApiKeyInfo> {
  const response = await get<{ success: boolean; data: { key: ApiKeyInfo } }>(`/api-keys/${keyId}`);
  return response.data.key;
}

/**
 * Update an API key
 */
export async function updateApiKey(keyId: string, updates: UpdateApiKeyInput): Promise<ApiKeyInfo> {
  const response = await patch<{ success: boolean; data: { key: ApiKeyInfo } }>(
    `/api-keys/${keyId}`,
    updates
  );
  return response.data.key;
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string, _reason?: string): Promise<void> {
  await del<{ success: boolean; message: string }>(`/api-keys/${keyId}`);
}

/**
 * Rotate an API key (revoke old, create new with same settings)
 */
export async function rotateApiKey(keyId: string): Promise<CreateApiKeyResult> {
  const response = await post<{
    success: boolean;
    data: { key: string; info: ApiKeyInfo };
    message: string;
  }>(`/api-keys/${keyId}/rotate`, {});
  return response.data;
}

/**
 * Get usage statistics for an API key
 */
export async function getApiKeyUsage(keyId: string, days: number = 30): Promise<UsageStats> {
  const response = await get<{ success: boolean; data: { usage: UsageStats } }>(
    `/api-keys/${keyId}/usage?days=${days}`
  );
  return response.data.usage;
}

// =============================================================================
// Admin API Key Management
// =============================================================================

/**
 * Get all API keys across all users (admin only)
 */
export async function getAllApiKeys(): Promise<ApiKeyWithUser[]> {
  const response = await get<{ keys: ApiKeyWithUser[] }>(
    '/api-keys/admin/all'
  );
  return response.keys;
}

/**
 * Get system-wide API key statistics (admin only)
 */
export async function getApiKeySystemStats(): Promise<SystemApiKeyStats> {
  const response = await get<{ stats: SystemApiKeyStats }>(
    '/api-keys/admin/stats'
  );
  return response.stats;
}

/**
 * Admin revoke any API key
 */
export async function adminRevokeApiKey(keyId: string, _reason?: string): Promise<void> {
  await del<{ success: boolean; message: string }>(`/api-keys/admin/${keyId}`);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format expiration date for display
 */
export function formatExpiration(expiresAt: string | null): string {
  if (!expiresAt) return 'Never';
  const date = new Date(expiresAt);
  const now = new Date();
  if (date < now) return 'Expired';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Check if an API key is expired
 */
export function isKeyExpired(key: ApiKeyInfo): boolean {
  if (!key.expiresAt) return false;
  return new Date(key.expiresAt) < new Date();
}

/**
 * Get the status of an API key
 */
export function getKeyStatus(
  key: ApiKeyInfo
): 'active' | 'revoked' | 'expired' | 'inactive' {
  if (key.revokedAt) return 'revoked';
  if (!key.isActive) return 'inactive';
  if (isKeyExpired(key)) return 'expired';
  return 'active';
}

/**
 * Get status badge color for an API key
 */
export function getStatusColor(
  status: 'active' | 'revoked' | 'expired' | 'inactive'
): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'revoked':
      return 'red';
    case 'expired':
      return 'orange';
    case 'inactive':
      return 'gray';
    default:
      return 'gray';
  }
}

/**
 * Format last used time for display
 */
export function formatLastUsed(lastUsedAt: string | null): string {
  if (!lastUsedAt) return 'Never used';
  const date = new Date(lastUsedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
