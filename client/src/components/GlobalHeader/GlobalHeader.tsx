/**
 * GlobalHeader Component
 *
 * Contextual toolbar with search, breadcrumbs, and user info.
 * Hidden on the reader page for immersive reading.
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { GlobalSearchBar } from './GlobalSearchBar';
import './GlobalHeader.css';

// Route to display name mapping
const ROUTE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/library': 'Library',
  '/series': 'Series',
  '/collections': 'Collections',
  '/folders': 'Folders',
  '/stats': 'Statistics',
  '/achievements': 'Achievements',
  '/settings': 'Settings',
  '/search': 'Search',
  '/duplicates': 'Duplicates',
  '/jobs': 'Jobs',
  '/batches': 'Batches',
  '/history': 'History',
  '/lists': 'Shared Lists',
  '/admin/users': 'User Management',
};

// Icons
const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const LibraryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="8" r="4" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);

export function GlobalHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedLibrary, libraries, isAllLibraries } = useApp();
  const { user, isAuthenticated } = useAuth();

  // Hide on reader pages for immersive fullscreen reading
  if (location.pathname.startsWith('/read/')) {
    return null;
  }

  // Build breadcrumb from current path
  const getBreadcrumb = () => {
    const path = location.pathname;

    // Check exact matches first
    if (ROUTE_LABELS[path]) {
      return ROUTE_LABELS[path];
    }

    // Handle dynamic routes
    if (path.startsWith('/library/')) {
      return 'Library';
    }
    if (path.startsWith('/series/')) {
      return 'Series Detail';
    }
    if (path.startsWith('/issue/')) {
      return 'Issue Detail';
    }
    if (path.startsWith('/stats/')) {
      return 'Statistics';
    }

    // Fallback: capitalize first segment
    const segment = path.split('/')[1];
    return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Home';
  };

  // Get library display name
  const getLibraryName = () => {
    if (isAllLibraries) return 'All Libraries';
    if (selectedLibrary) return selectedLibrary.name;
    return 'Select Library';
  };

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (!user) return '?';
    const name = user.displayName || user.username;
    return name.charAt(0).toUpperCase();
  };

  return (
    <header className="global-header">
      {/* Left: Search */}
      <div className="header-left">
        <GlobalSearchBar />
      </div>

      {/* Center: Breadcrumb */}
      <div className="header-center">
        <nav className="header-breadcrumb" aria-label="Breadcrumb">
          <button
            className="breadcrumb-item breadcrumb-root"
            onClick={() => navigate('/')}
            type="button"
          >
            Helixio
          </button>
          <span className="breadcrumb-separator">
            <ChevronIcon />
          </span>
          <span className="breadcrumb-item breadcrumb-current">
            {getBreadcrumb()}
          </span>
        </nav>
      </div>

      {/* Right: Library selector + User */}
      <div className="header-right">
        {/* Library indicator */}
        {libraries.length > 0 && (
          <button
            className="header-library-btn"
            onClick={() => navigate('/library')}
            type="button"
            title={getLibraryName()}
          >
            <LibraryIcon />
            <span className="header-library-name">{getLibraryName()}</span>
          </button>
        )}

        {/* User indicator */}
        {isAuthenticated && user && (
          <button
            className="header-user-btn"
            onClick={() => navigate('/settings')}
            type="button"
            title={user.displayName || user.username}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="header-user-avatar"
              />
            ) : (
              <span className="header-user-initials">{getUserInitials()}</span>
            )}
          </button>
        )}

        {/* Guest indicator */}
        {!isAuthenticated && (
          <button
            className="header-user-btn header-user-guest"
            onClick={() => navigate('/login')}
            type="button"
            title="Sign in"
          >
            <UserIcon />
          </button>
        )}
      </div>
    </header>
  );
}
