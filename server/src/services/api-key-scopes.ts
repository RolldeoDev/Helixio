/**
 * API Key Scope Definitions
 *
 * Scopes control what operations an API key can perform.
 * Keys can only be granted scopes that the user has access to.
 */

// All available scopes with descriptions
export const API_SCOPES = {
  // Library access
  'library:read': 'Read library and file information',
  'library:write': 'Modify library settings and trigger scans',

  // Reading progress
  'progress:read': 'Read reading progress and history',
  'progress:write': 'Update reading progress and bookmarks',

  // Collections
  'collections:read': 'Read collections and favorites',
  'collections:write': 'Manage collections and favorites',

  // Metadata
  'metadata:read': 'Read file and series metadata',
  'metadata:write': 'Edit metadata and trigger metadata jobs',

  // Statistics and achievements
  'stats:read': 'Read reading statistics',
  'achievements:read': 'Read achievements',

  // File operations
  'files:read': 'Read file pages and covers',
  'files:download': 'Download comic files',

  // OPDS feeds
  'opds:read': 'Access OPDS catalog feeds',

  // Reading queue
  'queue:read': 'Read reading queue',
  'queue:write': 'Manage reading queue',

  // Series management
  'series:read': 'Read series information',
  'series:write': 'Manage series (merge, link, update)',

  // Admin-only scopes (only available to admin users)
  'admin:users': 'Manage users and accounts',
  'admin:system': 'Access system settings and configuration',
  'admin:api-keys': 'Manage all API keys',
} as const;

export type ApiScope = keyof typeof API_SCOPES;

// Scope groups for common use cases (presets)
export const SCOPE_PRESETS = {
  'read-only': [
    'library:read',
    'progress:read',
    'collections:read',
    'metadata:read',
    'stats:read',
    'achievements:read',
    'files:read',
    'queue:read',
    'series:read',
  ] as ApiScope[],

  'full-access': Object.keys(API_SCOPES).filter(
    (s) => !s.startsWith('admin:')
  ) as ApiScope[],

  'opds-only': ['opds:read', 'library:read', 'files:read'] as ApiScope[],

  'sync-client': [
    'library:read',
    'progress:read',
    'progress:write',
    'collections:read',
    'queue:read',
    'queue:write',
    'files:read',
    'series:read',
  ] as ApiScope[],

  'automation': [
    'library:read',
    'library:write',
    'metadata:read',
    'metadata:write',
    'series:read',
    'series:write',
  ] as ApiScope[],
} as const;

export type ScopePreset = keyof typeof SCOPE_PRESETS;

// Scope categories for UI grouping
export const SCOPE_CATEGORIES = {
  Library: ['library:read', 'library:write'],
  Reading: ['progress:read', 'progress:write', 'queue:read', 'queue:write'],
  Collections: ['collections:read', 'collections:write'],
  Metadata: ['metadata:read', 'metadata:write'],
  Series: ['series:read', 'series:write'],
  Statistics: ['stats:read', 'achievements:read'],
  Files: ['files:read', 'files:download', 'opds:read'],
  Admin: ['admin:users', 'admin:system', 'admin:api-keys'],
} as const;

/**
 * Check if a scope is valid
 */
export function isValidScope(scope: string): scope is ApiScope {
  return scope in API_SCOPES;
}

/**
 * Check if a scope is an admin scope
 */
export function isAdminScope(scope: string): boolean {
  return scope.startsWith('admin:');
}

/**
 * Filter scopes to only include valid ones
 */
export function filterValidScopes(scopes: string[]): ApiScope[] {
  return scopes.filter(isValidScope) as ApiScope[];
}

/**
 * Filter out admin scopes from a list
 */
export function filterNonAdminScopes(scopes: ApiScope[]): ApiScope[] {
  return scopes.filter((s) => !isAdminScope(s));
}

/**
 * Get scopes available to a user based on their role
 */
export function getAvailableScopesForRole(
  role: 'admin' | 'user' | 'guest'
): ApiScope[] {
  const allScopes = Object.keys(API_SCOPES) as ApiScope[];

  if (role === 'admin') {
    return allScopes;
  }

  if (role === 'user') {
    return filterNonAdminScopes(allScopes);
  }

  // Guests get read-only access
  return SCOPE_PRESETS['read-only'];
}

/**
 * Validate that requested scopes are allowed for a user role
 */
export function validateScopesForRole(
  requestedScopes: string[],
  role: 'admin' | 'user' | 'guest'
): { valid: boolean; invalidScopes: string[]; reason?: string } {
  const availableScopes = getAvailableScopesForRole(role);
  const invalidScopes: string[] = [];

  for (const scope of requestedScopes) {
    if (!isValidScope(scope)) {
      invalidScopes.push(scope);
    } else if (!availableScopes.includes(scope as ApiScope)) {
      invalidScopes.push(scope);
    }
  }

  if (invalidScopes.length > 0) {
    const hasAdminScopes = invalidScopes.some(isAdminScope);
    return {
      valid: false,
      invalidScopes,
      reason: hasAdminScopes
        ? 'Admin scopes require admin role'
        : 'One or more scopes are invalid or not available for your role',
    };
  }

  return { valid: true, invalidScopes: [] };
}

/**
 * Check if a scope grants access to an action
 * Some scopes imply others (e.g., library:write implies library:read)
 */
export function scopeGrantsAccess(
  grantedScopes: string[],
  requiredScope: ApiScope
): boolean {
  // Direct match
  if (grantedScopes.includes(requiredScope)) {
    return true;
  }

  // Write scopes imply read scopes
  const writeToRead: Record<string, string> = {
    'library:write': 'library:read',
    'progress:write': 'progress:read',
    'collections:write': 'collections:read',
    'metadata:write': 'metadata:read',
    'queue:write': 'queue:read',
    'series:write': 'series:read',
  };

  for (const [writeScope, readScope] of Object.entries(writeToRead)) {
    if (requiredScope === readScope && grantedScopes.includes(writeScope)) {
      return true;
    }
  }

  return false;
}
