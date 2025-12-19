/**
 * Home Header Component
 *
 * Displays welcome greeting and library scope toggle.
 * Features personalized greeting based on time of day and user name.
 */

import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';

// =============================================================================
// Types
// =============================================================================

export type LibraryScope = 'all' | string;

interface HomeHeaderProps {
  libraryScope: LibraryScope;
  onLibraryScopeChange: (scope: LibraryScope) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// =============================================================================
// Component
// =============================================================================

export function HomeHeader({ libraryScope, onLibraryScopeChange }: HomeHeaderProps) {
  const { libraries } = useApp();
  const { user, isAuthenticated } = useAuth();

  // Get display name for current scope
  const getScopeName = () => {
    if (libraryScope === 'all') return 'All Libraries';
    const lib = libraries.find((l) => l.id === libraryScope);
    return lib?.name || 'Library';
  };

  // Cycle through library scopes
  const handleToggleScope = () => {
    if (libraryScope === 'all' && libraries.length > 0) {
      onLibraryScopeChange(libraries[0]!.id);
    } else if (libraries.length > 1) {
      const currentIndex = libraries.findIndex((l) => l.id === libraryScope);
      if (currentIndex < libraries.length - 1) {
        onLibraryScopeChange(libraries[currentIndex + 1]!.id);
      } else {
        onLibraryScopeChange('all');
      }
    } else {
      onLibraryScopeChange('all');
    }
  };

  return (
    <header className="home-header home-section">
      <div className="home-welcome">
        <h1 className="home-welcome-greeting">
          {getGreeting()}
          {isAuthenticated && user?.displayName && `, ${user.displayName}`}
        </h1>
        <p className="home-welcome-date">{getFormattedDate()}</p>
      </div>

      <button
        className="home-library-toggle"
        onClick={handleToggleScope}
        title="Toggle library scope"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        {getScopeName()}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: 'auto', width: 14, height: 14 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </header>
  );
}
