/**
 * NavIconButton Component
 *
 * Icon-only navigation button with tooltip.
 * Used in the compact sidebar navigation bar.
 *
 * Can be used as:
 * - Navigation link (with `to` prop)
 * - Action button (with `onClick` prop)
 */

import { Link, useLocation } from 'react-router-dom';

interface NavIconButtonBaseProps {
  icon: string;
  label: string;
  badge?: number;
  isActive?: boolean;
}

interface NavIconButtonLinkProps extends NavIconButtonBaseProps {
  to: string;
  onClick?: never;
}

interface NavIconButtonActionProps extends NavIconButtonBaseProps {
  to?: never;
  onClick: () => void;
}

type NavIconButtonProps = NavIconButtonLinkProps | NavIconButtonActionProps;

export function NavIconButton({ to, icon, label, badge, onClick, isActive: isActiveProp }: NavIconButtonProps) {
  const location = useLocation();
  const isActive = isActiveProp ?? (to ? location.pathname === to : false);

  const content = (
    <>
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="nav-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span className="nav-tooltip">{label}</span>
    </>
  );

  // If onClick is provided, render as button
  if (onClick) {
    return (
      <button
        type="button"
        className={`nav-icon-btn ${isActive ? 'active' : ''}`}
        aria-label={badge ? `${label} (${badge} active)` : label}
        aria-pressed={isActive}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  // Otherwise render as link
  return (
    <Link
      to={to!}
      className={`nav-icon-btn ${isActive ? 'active' : ''}`}
      aria-label={badge ? `${label} (${badge} active)` : label}
      aria-current={isActive ? 'page' : undefined}
    >
      {content}
    </Link>
  );
}
