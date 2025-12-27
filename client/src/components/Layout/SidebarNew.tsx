/**
 * SidebarNew Component
 *
 * A streamlined sidebar with:
 * - Icon Rail (48px): Primary navigation icons
 * - Click-to-navigate behavior
 *
 * Optimized for both desktop and iPad/touch devices.
 */

import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useMetadataJob } from '../../contexts/MetadataJobContext';
import { CommandPalette } from '../CommandPalette';
import './SidebarNew.css';

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  route?: string;
  action?: 'command-palette';
  badge?: number;
}

export function SidebarNew() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedLibrary, mobileSidebarOpen, setMobileSidebarOpen } = useApp();
  const { activeJobs } = useMetadataJob();

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavClick = useCallback(
    (item: NavItem) => {
      if (item.action === 'command-palette') {
        setIsCommandPaletteOpen(true);
      } else if (item.route) {
        // Handle library route with selected library
        if (item.id === 'library' && selectedLibrary) {
          navigate(`/library/${selectedLibrary.id}`);
        } else if (item.id === 'library') {
          navigate('/library');
        } else {
          navigate(item.route);
        }
      }
    },
    [navigate, selectedLibrary]
  );

  const isRouteActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Navigation items
  const primaryNav: NavItem[] = [
    {
      id: 'home',
      label: 'Home',
      route: '/',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      id: 'series',
      label: 'Series',
      route: '/series',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      ),
    },
    {
      id: 'library',
      label: 'Library',
      route: '/library',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
    },
    {
      id: 'folders',
      label: 'Folders',
      route: '/folders',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: 'search',
      label: 'Search',
      action: 'command-palette',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
  ];

  const secondaryNav: NavItem[] = [
    {
      id: 'collections',
      label: 'Collections',
      route: '/collections',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: 'stats',
      label: 'Statistics',
      route: '/stats',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      id: 'tools',
      label: 'Tools',
      route: '/jobs',
      badge: activeJobs.length > 0 ? activeJobs.length : undefined,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      ),
    },
  ];

  const footerNav: NavItem[] = [
    {
      id: 'settings',
      label: 'Settings',
      route: '/settings',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  const renderNavButton = (item: NavItem, isActive: boolean) => (
    <button
      key={item.id}
      className={`rail-btn ${isActive ? 'active' : ''} ${item.badge ? 'has-badge' : ''}`}
      onClick={() => handleNavClick(item)}
      aria-label={item.label}
      title={item.label}
      data-badge={item.badge}
    >
      {item.icon}
    </button>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className={`sidebar-new ${mobileSidebarOpen ? 'open' : ''}`}>
        {/* Icon Rail */}
        <nav className="icon-rail" aria-label="Main navigation">
          {/* Logo */}
          <div className="rail-logo" title="Helixio">
            <img
              src="/helixioLogoSquareTransparent.png"
              alt="Helixio"
              className="rail-logo-img"
            />
          </div>

          <div className="rail-divider" />

          {/* Primary Navigation */}
          <div className="rail-section rail-primary">
            {primaryNav.map((item) =>
              renderNavButton(
                item,
                item.route ? isRouteActive(item.route) : false
              )
            )}
          </div>

          <div className="rail-spacer" />

          {/* Secondary Navigation */}
          <div className="rail-section rail-secondary">
            {secondaryNav.map((item) =>
              renderNavButton(item, item.route ? isRouteActive(item.route) : false)
            )}
          </div>

          <div className="rail-divider" />

          {/* Footer Navigation */}
          <div className="rail-section rail-footer">
            {footerNav.map((item) =>
              renderNavButton(item, item.route ? isRouteActive(item.route) : false)
            )}
          </div>
        </nav>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </>
  );
}
