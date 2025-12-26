/**
 * SeriesHero Component
 *
 * Hero content for series detail pages with:
 * - Large cover image with dramatic shadow
 * - Title, deck/tagline, and quick stats
 * - Action buttons (Continue Reading, collections)
 *
 * Note: The gradient backdrop is now handled by DetailHeroSection wrapper.
 */

import { useMemo } from 'react';
import { Series, SeriesIssue } from '../../services/api.service';
import { QuickCollectionIcons } from '../QuickCollectionIcons';
import { CollectionFlyout } from '../CollectionFlyout';
import { ActionMenu, type ActionMenuItem } from '../ActionMenu';
import { MarkdownContent } from '../MarkdownContent';
import './SeriesHero.css';

// =============================================================================
// Types
// =============================================================================

interface SeriesHeroProps {
  series: Series;
  coverUrl: string | null;
  issues: SeriesIssue[];
  nextIssue: { id: string; filename: string } | null;
  actionItems: ActionMenuItem[];
  onContinueReading: () => void;
  onSeriesAction: (actionId: string) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatReadTime(totalPages: number): string {
  // Average 30 seconds per page
  const totalMinutes = Math.ceil(totalPages * 0.5);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

// =============================================================================
// Stat Item Component
// =============================================================================

interface StatItemProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  accent?: boolean;
}

function StatItem({ icon, value, label, accent }: StatItemProps) {
  return (
    <div className={`series-hero__stat ${accent ? 'series-hero__stat--accent' : ''}`}>
      <div className="series-hero__stat-icon">{icon}</div>
      <div className="series-hero__stat-content">
        <span className="series-hero__stat-value">{value}</span>
        <span className="series-hero__stat-label">{label}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SeriesHero({
  series,
  coverUrl,
  issues,
  nextIssue,
  actionItems,
  onContinueReading,
  onSeriesAction,
}: SeriesHeroProps) {
  // Calculate stats from issues
  const stats = useMemo(() => {
    let totalPages = 0;
    let totalSize = 0;
    let pagesRead = 0;

    for (const issue of issues) {
      const pageCount = issue.metadata?.pageCount || issue.readingProgress?.totalPages || 0;
      totalPages += pageCount;
      totalSize += issue.size || 0;

      if (issue.readingProgress) {
        if (issue.readingProgress.completed) {
          pagesRead += pageCount;
        } else {
          pagesRead += issue.readingProgress.currentPage;
        }
      }
    }

    return { totalPages, totalSize, pagesRead };
  }, [issues]);

  // Progress calculations
  const progress = series.progress;
  const totalOwned = progress?.totalOwned ?? series._count?.issues ?? issues.length;
  const totalRead = progress?.totalRead ?? 0;
  const progressPercent = totalOwned > 0 ? Math.round((totalRead / totalOwned) * 100) : 0;
  const isComplete = totalOwned > 0 && totalRead >= totalOwned;

  // Format year range
  const yearRange = series.startYear
    ? series.endYear && series.endYear !== series.startYear
      ? `${series.startYear} – ${series.endYear}`
      : String(series.startYear)
    : null;

  return (
    <div className="series-hero">
      {/* Main content */}
      <div className="series-hero__content">
        {/* Cover image */}
        <div className="series-hero__cover-wrapper">
          <div className="series-hero__cover">
            {coverUrl ? (
              <img src={coverUrl} alt={series.name} loading="eager" />
            ) : (
              <div className="series-hero__cover-placeholder">
                <span>{series.name.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
          {/* Progress ring on cover */}
          {progressPercent > 0 && progressPercent < 100 && (
            <svg className="series-hero__progress-ring" viewBox="0 0 36 36">
              {/* Background fill circle */}
              <circle
                className="series-hero__progress-ring-bg"
                cx="18"
                cy="18"
                r="17"
              />
              {/* Track circle */}
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="3"
              />
              {/* Progress arc */}
              <circle
                className="series-hero__progress-ring-fill"
                cx="18"
                cy="18"
                r="14"
                fill="none"
                strokeWidth="3"
                strokeDasharray={`${progressPercent} 100`}
                strokeLinecap="round"
              />
              {/* Percentage text */}
              <text
                x="18"
                y="18"
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="8"
                fontWeight="700"
                transform="rotate(90, 18, 18)"
              >
                {progressPercent}%
              </text>
            </svg>
          )}
          {isComplete && (
            <div className="series-hero__complete-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="series-hero__info">
          {/* Meta line */}
          <div className="series-hero__meta">
            {yearRange && <span className="series-hero__meta-year">{yearRange}</span>}
            {series.publisher && (
              <a
                className="series-hero__meta-publisher"
                href={`/series?publisher=${encodeURIComponent(series.publisher)}`}
              >
                {series.publisher}
              </a>
            )}
            {series.type === 'manga' && <span className="series-hero__meta-badge manga">Manga</span>}
            {series.ageRating && <span className="series-hero__meta-badge">{series.ageRating}</span>}
          </div>

          {/* Title */}
          <h1 className="series-hero__title">{series.name}</h1>

          {/* Deck/tagline */}
          {series.deck && (
            <div className="series-hero__deck">
              <MarkdownContent content={series.deck} className="series-hero__deck-content" />
            </div>
          )}

          {/* Stats row */}
          <div className="series-hero__stats">
            <StatItem
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              }
              value={`${progressPercent}%`}
              label="Progress"
              accent={progressPercent > 0}
            />
            <StatItem
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              }
              value={`${totalRead}/${totalOwned}`}
              label="Issues"
            />
            {stats.totalPages > 0 && (
              <StatItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                  </svg>
                }
                value={stats.totalPages.toLocaleString()}
                label="Pages"
              />
            )}
            {stats.totalSize > 0 && (
              <StatItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                }
                value={formatBytes(stats.totalSize)}
                label="Size"
              />
            )}
            {stats.totalPages > 0 && (
              <StatItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                }
                value={formatReadTime(stats.totalPages - stats.pagesRead)}
                label="Est. Time"
              />
            )}
          </div>

          {/* Actions */}
          <div className="series-hero__actions">
            {nextIssue && (
              <button className="series-hero__cta" onClick={onContinueReading}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Continue Reading</span>
              </button>
            )}
            {!nextIssue && isComplete && (
              <div className="series-hero__complete-text">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Series Complete</span>
              </div>
            )}
            {!nextIssue && !isComplete && totalOwned > 0 && (
              <button className="series-hero__cta series-hero__cta--secondary" onClick={onContinueReading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>Start Reading</span>
              </button>
            )}
            <div className="series-hero__actions-secondary">
              <QuickCollectionIcons seriesId={series.id} size="medium" />
              <CollectionFlyout seriesId={series.id} size="medium" align="right" />
              <ActionMenu
                items={actionItems}
                onAction={onSeriesAction}
                ariaLabel="Series actions"
                size="medium"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SeriesHero;
