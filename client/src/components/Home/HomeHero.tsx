/**
 * Home Hero Component
 *
 * Hero section with:
 * - Featured current reading (large cover with play button)
 * - Quick stats row (comics read, pages, streaks)
 */

import { useNavigate } from 'react-router-dom';
import { getCoverUrl, ContinueReadingItem, AllTimeStats } from '../../services/api.service';
import './HomeHero.css';

// =============================================================================
// Types
// =============================================================================

interface HomeHeroProps {
  featuredItem: ContinueReadingItem | null;
  stats: AllTimeStats | null;
  isLoading?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

// =============================================================================
// Stat Card Component
// =============================================================================

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color?: string;
}

function StatCard({ icon, value, label, color }: StatCardProps) {
  return (
    <div className="hero-stat-card">
      <div className="hero-stat-icon" style={{ color }}>
        {icon}
      </div>
      <div className="hero-stat-content">
        <span className="hero-stat-value" style={{ color }}>
          {value}
        </span>
        <span className="hero-stat-label">{label}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function HomeHero({ featuredItem, stats, isLoading }: HomeHeroProps) {
  const navigate = useNavigate();

  const handleContinueReading = () => {
    if (featuredItem) {
      navigate(`/read/${featuredItem.fileId}`);
    }
  };

  return (
    <section className="home-hero home-section">
      {/* Featured Current Reading */}
      <div className="hero-featured">
        {isLoading ? (
          <div className="hero-featured-cover skeleton" />
        ) : featuredItem ? (
          <div
            className="hero-featured-cover"
            onClick={handleContinueReading}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleContinueReading();
              }
            }}
          >
            <img
              src={getCoverUrl(featuredItem.fileId)}
              alt={featuredItem.filename}
              loading="eager"
            />
            <div className="hero-featured-overlay">
              <div className="hero-featured-play">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <div className="hero-featured-info">
                <span className="hero-featured-label">Continue Reading</span>
                <h3 className="hero-featured-title">
                  {featuredItem.filename.replace(/\.cb[rz7t]$/i, '')}
                </h3>
                <div className="hero-featured-progress">
                  <div className="hero-featured-progress-bar">
                    <div
                      className="hero-featured-progress-fill"
                      style={{ width: `${featuredItem.progress}%` }}
                    />
                  </div>
                  <span className="hero-featured-progress-text">
                    {Math.round(featuredItem.progress)}% • Page {featuredItem.currentPage + 1}/{featuredItem.totalPages}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="hero-featured-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>Start reading to see your current comic here</span>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="hero-stats">
        {isLoading ? (
          <>
            <div className="hero-stat-card skeleton" />
            <div className="hero-stat-card skeleton" />
            <div className="hero-stat-card skeleton" />
            <div className="hero-stat-card skeleton" />
          </>
        ) : stats ? (
          <>
            <StatCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              }
              value={stats.totalComicsRead}
              label="Comics Read"
              color="var(--color-primary)"
            />
            <StatCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                </svg>
              }
              value={formatNumber(stats.totalPagesRead)}
              label="Pages Read"
              color="var(--color-info)"
            />
            <StatCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              value={formatDuration(stats.totalReadingTime)}
              label="Time Reading"
              color="var(--color-warning)"
            />
            <StatCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              }
              value={`${stats.currentStreak} days`}
              label={stats.currentStreak > 0 ? 'Current Streak' : 'Start a Streak!'}
              color="var(--color-success)"
            />
          </>
        ) : (
          <div className="hero-stats-empty">
            <span>Read comics to see your stats here</span>
          </div>
        )}
      </div>
    </section>
  );
}
