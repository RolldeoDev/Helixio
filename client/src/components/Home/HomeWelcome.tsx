/**
 * Home Welcome Component
 *
 * A premium, magazine-style welcome section featuring:
 * - Personalized greeting with time-aware messaging
 * - Animated fun fact that rotates
 * - Quick stats overview with visual hierarchy
 * - Navigation to full stats dashboard
 * - Featured currently reading with cinematic presentation
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCoverUrl,
  ContinueReadingItem,
  AllTimeStats,
  StatsSummary,
} from '../../services/api.service';
import { generateFunFact, FunFact } from '../../utils/funFacts';
import { getTitleDisplay } from '../../utils/titleDisplay';
import './HomeWelcome.css';

// =============================================================================
// Types
// =============================================================================

export type LibraryScope = 'all' | string;

interface HomeWelcomeProps {
  libraryScope: LibraryScope;
  onLibraryScopeChange: (scope: LibraryScope) => void;
  featuredItem: ContinueReadingItem | null;
  allTimeStats: AllTimeStats | null;
  statsSummary: StatsSummary | null;
  isLoading: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: 'Good morning', emoji: '☀️' };
  if (hour >= 12 && hour < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  if (hour >= 17 && hour < 21) return { text: 'Good evening', emoji: '🌅' };
  return { text: 'Night owl reading', emoji: '🌙' };
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

// =============================================================================
// Sub-components
// =============================================================================

interface QuickStatProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  trend?: 'up' | 'down' | 'neutral';
  delay?: number;
}

function QuickStat({ icon, value, label, delay = 0 }: QuickStatProps) {
  return (
    <div
      className="welcome-quick-stat"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="welcome-quick-stat-icon">{icon}</div>
      <div className="welcome-quick-stat-content">
        <span className="welcome-quick-stat-value">{value}</span>
        <span className="welcome-quick-stat-label">{label}</span>
      </div>
    </div>
  );
}

interface FunFactDisplayProps {
  fact: FunFact | null;
  onRefresh: () => void;
}

function FunFactDisplay({ fact, onRefresh }: FunFactDisplayProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleRefresh = () => {
    setIsAnimating(true);
    setTimeout(() => {
      onRefresh();
      setIsAnimating(false);
    }, 300);
  };

  if (!fact) return null;

  return (
    <div className={`welcome-fun-fact ${isAnimating ? 'animating' : ''}`}>
      <div className="welcome-fun-fact-icon">{fact.icon}</div>
      <div className="welcome-fun-fact-content">
        <span className="welcome-fun-fact-label">Fun Fact</span>
        <p className="welcome-fun-fact-text">
          {fact.text} <strong>{fact.emphasis}</strong>
        </p>
      </div>
      <button
        className="welcome-fun-fact-refresh"
        onClick={handleRefresh}
        title="Show another fact"
        aria-label="Refresh fun fact"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function HomeWelcome({
  libraryScope,
  onLibraryScopeChange,
  featuredItem,
  allTimeStats,
  statsSummary,
  isLoading,
}: HomeWelcomeProps) {
  const navigate = useNavigate();
  const { libraries, preferFilenameOverMetadata } = useApp();
  const { user, isAuthenticated } = useAuth();

  const [funFact, setFunFact] = useState<FunFact | null>(null);
  const [factKey, setFactKey] = useState(0);
  const [coverError, setCoverError] = useState(false);

  const greeting = useMemo(() => getGreeting(), []);

  // Reset cover error state when featured item changes
  useEffect(() => {
    setCoverError(false);
  }, [featuredItem?.fileId]);

  // Generate initial fun fact
  useEffect(() => {
    if (statsSummary || allTimeStats) {
      setFunFact(generateFunFact(statsSummary, allTimeStats));
    }
  }, [statsSummary, allTimeStats]);

  // Handle fun fact refresh
  const refreshFunFact = useCallback(() => {
    setFunFact(generateFunFact(statsSummary, allTimeStats));
    setFactKey((k) => k + 1);
  }, [statsSummary, allTimeStats]);

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

  const handleContinueReading = () => {
    if (featuredItem) {
      navigate(`/read/${featuredItem.fileId}`);
    }
  };

  // Determine what stats to show
  const stats = statsSummary || (allTimeStats ? {
    totalFiles: 0,
    filesRead: allTimeStats.totalComicsRead,
    pagesRead: allTimeStats.totalPagesRead,
    readingTime: allTimeStats.totalReadingTime,
    currentStreak: allTimeStats.currentStreak,
  } : null);

  return (
    <section className="welcome-section">
      {/* Background Pattern */}
      <div className="welcome-bg-pattern" aria-hidden="true" />

      {/* Main Content Grid */}
      <div className="welcome-grid">
        {/* Left Column: Greeting & Stats */}
        <div className="welcome-main">
          {/* Header Row */}
          <div className="welcome-header">
            <div className="welcome-greeting">
              <span className="welcome-greeting-emoji">{greeting.emoji}</span>
              <div className="welcome-greeting-text">
                <h1 className="welcome-title">
                  {greeting.text}
                  {isAuthenticated && user?.displayName && (
                    <span className="welcome-name">, {user.displayName}</span>
                  )}
                </h1>
                <p className="welcome-date">{getFormattedDate()}</p>
              </div>
            </div>

            <button
              className="welcome-library-toggle"
              onClick={handleToggleScope}
              title="Toggle library scope"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>{getScopeName()}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chevron">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* Quick Stats Row */}
          <div className="welcome-stats-row">
            {isLoading ? (
              <>
                <div className="welcome-quick-stat skeleton" />
                <div className="welcome-quick-stat skeleton" />
                <div className="welcome-quick-stat skeleton" />
                <div className="welcome-quick-stat skeleton" />
              </>
            ) : stats ? (
              <>
                <QuickStat
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  }
                  value={formatNumber(stats.filesRead || 0)}
                  label="Comics Read"
                  delay={0}
                />
                <QuickStat
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                    </svg>
                  }
                  value={formatNumber(stats.pagesRead || 0)}
                  label="Pages Read"
                  delay={50}
                />
                <QuickStat
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  }
                  value={formatDuration(stats.readingTime || 0)}
                  label="Time Reading"
                  delay={100}
                />
                <QuickStat
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  }
                  value={`${stats.currentStreak || 0} days`}
                  label="Current Streak"
                  delay={150}
                />
              </>
            ) : (
              <div className="welcome-stats-empty">
                <span>Start reading to see your stats</span>
              </div>
            )}
          </div>

          {/* Fun Fact */}
          <FunFactDisplay key={factKey} fact={funFact} onRefresh={refreshFunFact} />

          {/* Quick Action Links */}
          <div className="welcome-action-links">
            <Link to="/series" className="welcome-action-link welcome-action-link--primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              <span>Browse Series</span>
            </Link>
            <Link to="/stats" className="welcome-action-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>View Statistics</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Featured Reading */}
        <div className="welcome-featured">
          {isLoading ? (
            <div className="welcome-featured-card skeleton" />
          ) : featuredItem ? (
            (() => {
              // Compute display title using metadata with fallbacks
              const { primaryTitle } = getTitleDisplay(
                {
                  filename: featuredItem.filename,
                  metadata: {
                    series: featuredItem.series,
                    number: featuredItem.number,
                    title: featuredItem.title,
                  },
                },
                { preferFilename: preferFilenameOverMetadata }
              );

              // Build issue info string (e.g., "Issue 2 of 5")
              const issueInfo = featuredItem.number
                ? featuredItem.issueCount
                  ? `Issue ${featuredItem.number} of ${featuredItem.issueCount}`
                  : `Issue #${featuredItem.number}`
                : null;

              return (
                <div
                  className="welcome-featured-card"
                  onClick={handleContinueReading}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleContinueReading();
                  }}
                >
                  <div className="welcome-featured-cover">
                    {coverError ? (
                      <div className="welcome-featured-cover-placeholder">
                        <span className="welcome-featured-cover-initial">
                          {(featuredItem.series || featuredItem.filename).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={getCoverUrl(featuredItem.fileId)}
                        alt={featuredItem.filename}
                        loading="eager"
                        onError={() => setCoverError(true)}
                      />
                    )}
                    <div className="welcome-featured-overlay" />
                    {/* Issue number badge */}
                    {featuredItem.number && (
                      <div className="welcome-featured-issue-badge">
                        <span className="welcome-featured-issue-hash">#</span>
                        <span className="welcome-featured-issue-number">{featuredItem.number}</span>
                      </div>
                    )}
                    <div className="welcome-featured-play">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="welcome-featured-info">
                    <span className="welcome-featured-label">Continue Reading</span>
                    <h3 className="welcome-featured-title">{primaryTitle}</h3>
                    {/* Series name as subtitle if different from title */}
                    {featuredItem.series && featuredItem.series !== primaryTitle && (
                      <span className="welcome-featured-series">{featuredItem.series}</span>
                    )}
                    {/* Issue info (e.g., "Issue 2 of 5") */}
                    {issueInfo && (
                      <span className="welcome-featured-issue-info">{issueInfo}</span>
                    )}
                    <div className="welcome-featured-progress">
                      <div className="welcome-featured-progress-bar">
                        <div
                          className="welcome-featured-progress-fill"
                          style={{ width: `${featuredItem.progress}%` }}
                        />
                      </div>
                      <span className="welcome-featured-progress-text">
                        {Math.round(featuredItem.progress)}% • Page {featuredItem.currentPage + 1}/{featuredItem.totalPages}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="welcome-featured-empty">
              <div className="welcome-featured-empty-icon">
                <img
                  src="/helixioLogoSquareTransparent.png"
                  alt="Helixio"
                  className="welcome-empty-logo"
                />
              </div>
              <span>Start reading to see your current comic here</span>
              <Link to="/library" className="welcome-featured-browse">
                Browse Library
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default HomeWelcome;
