/**
 * Permission Types and Utilities
 *
 * Defines the extensible permission system for user access control.
 * Permissions are stored as a JSON object on the User model.
 *
 * To add a new permission:
 * 1. Add entry to PERMISSIONS object below
 * 2. Add requirePermission('newPermission') middleware to relevant routes
 * 3. Frontend automatically picks up new permission from GET /api/auth/permissions
 */

/**
 * Permission definition with metadata for UI display
 */
export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

/**
 * All available permissions in the system.
 * Add new permissions here - no database migrations required.
 */
export const PERMISSIONS = {
  login: {
    key: 'login',
    label: 'Login',
    description: 'Can log in to the system',
    defaultEnabled: true,
  },
  changePassword: {
    key: 'changePassword',
    label: 'Change Password',
    description: 'Can change own password',
    defaultEnabled: true,
  },
  bookmark: {
    key: 'bookmark',
    label: 'Bookmark',
    description: 'Can create bookmarks',
    defaultEnabled: false,
  },
  download: {
    key: 'download',
    label: 'Download',
    description: 'Can download files',
    defaultEnabled: false,
  },
  changeRestriction: {
    key: 'changeRestriction',
    label: 'Change Restriction',
    description: 'Can modify age restriction and privacy settings',
    defaultEnabled: false,
  },
} as const;

/**
 * Valid permission keys
 */
export type PermissionKey = keyof typeof PERMISSIONS;

/**
 * User permissions object (stored as JSON in database)
 */
export type UserPermissions = Partial<Record<PermissionKey, boolean>>;

/**
 * Get all permission definitions for the admin UI
 */
export function getAllPermissions(): Record<PermissionKey, PermissionDefinition> {
  return PERMISSIONS;
}

/**
 * Get default permissions for new users (only login + changePassword enabled)
 */
export function getDefaultPermissions(): UserPermissions {
  const defaults: UserPermissions = {};
  for (const [key, def] of Object.entries(PERMISSIONS)) {
    defaults[key as PermissionKey] = def.defaultEnabled;
  }
  return defaults;
}

/**
 * Get default permissions as a JSON string for database storage
 */
export function getDefaultPermissionsJson(): string {
  return JSON.stringify(getDefaultPermissions());
}

/**
 * Parse permissions JSON string from database
 */
export function parsePermissions(permissionsJson: string | null | undefined): UserPermissions {
  if (!permissionsJson) {
    return {};
  }
  try {
    const parsed = JSON.parse(permissionsJson);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return parsed as UserPermissions;
  } catch {
    return {};
  }
}

/**
 * Check if a user has a specific permission.
 * Admins always have all permissions.
 *
 * @param user - User object with role and optional permissions JSON
 * @param permission - Permission key to check
 * @returns true if user has the permission
 */
export function hasPermission(
  user: { role: string; permissions?: string | null },
  permission: PermissionKey
): boolean {
  // Admins bypass all permission checks
  if (user.role === 'admin') {
    return true;
  }

  const perms = parsePermissions(user.permissions);
  return perms[permission] === true;
}

/**
 * Validate that a permission key is valid
 */
export function isValidPermissionKey(key: string): key is PermissionKey {
  return key in PERMISSIONS;
}

/**
 * Merge new permissions into existing permissions
 */
export function mergePermissions(
  existing: UserPermissions,
  updates: Partial<Record<string, boolean>>
): UserPermissions {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (isValidPermissionKey(key) && typeof value === 'boolean') {
      merged[key] = value;
    }
  }
  return merged;
}
