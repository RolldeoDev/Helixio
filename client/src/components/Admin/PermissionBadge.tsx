/**
 * Permission Badge Component
 *
 * Displays a styled badge for a permission status.
 * Shows whether a permission is granted (active) or denied (inactive).
 */

import './PermissionBadge.css';

export interface PermissionBadgeProps {
  /** The display label for the permission */
  label: string;
  /** Whether the permission is granted */
  active: boolean;
  /** Optional: show a smaller badge */
  small?: boolean;
  /** Optional: special style for admin badge */
  isAdmin?: boolean;
}

export function PermissionBadge({ label, active, small, isAdmin }: PermissionBadgeProps) {
  const classNames = [
    'permission-badge',
    active ? 'active' : 'inactive',
    small ? 'small' : '',
    isAdmin ? 'admin' : '',
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames} title={active ? `${label} granted` : `${label} denied`}>
      {label}
    </span>
  );
}

export interface PermissionBadgesProps {
  /** Permissions object from user */
  permissions: Record<string, boolean>;
  /** Show only active permissions */
  activeOnly?: boolean;
  /** Show compact view (small badges) */
  compact?: boolean;
  /** Is this user an admin (bypasses all permissions) */
  isAdmin?: boolean;
}

/**
 * Displays a row of permission badges for a user
 */
export function PermissionBadges({ permissions, activeOnly, compact, isAdmin }: PermissionBadgesProps) {
  // If admin, show special admin badge
  if (isAdmin) {
    return (
      <div className="permission-badges">
        <PermissionBadge label="Admin" active={true} small={compact} isAdmin={true} />
      </div>
    );
  }

  // Get permission entries to display
  const permissionEntries = Object.entries(permissions);

  if (activeOnly) {
    const activePerms = permissionEntries.filter(([, value]) => value);
    if (activePerms.length === 0) {
      return <span className="permission-badges-empty">No permissions</span>;
    }
    return (
      <div className="permission-badges">
        {activePerms.map(([key]) => (
          <PermissionBadge
            key={key}
            label={formatPermissionLabel(key)}
            active={true}
            small={compact}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="permission-badges">
      {permissionEntries.map(([key, value]) => (
        <PermissionBadge
          key={key}
          label={formatPermissionLabel(key)}
          active={value}
          small={compact}
        />
      ))}
    </div>
  );
}

/**
 * Format permission key to a readable label
 */
function formatPermissionLabel(key: string): string {
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
