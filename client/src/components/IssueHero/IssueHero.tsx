/**
 * IssueHero Component
 *
 * Hero content for issue detail pages with:
 * - Large cover image with dramatic shadow
 * - Issue title (prominent) with series context
 * - Quick stats (progress, pages, size, est. time, sessions)
 * - Action buttons (Start/Continue Reading, collections, overflow menu)
 *
 * Note: The gradient backdrop is now handled by DetailHeroSection wrapper.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ComicFile,
  ComicInfo,
  ReadingProgress,
} from '../../services/api.service';
import { QuickCollectionIcons } from '../QuickCollectionIcons';
import { CollectionFlyout } from '../CollectionFlyout';
import { ActionMenu, type ActionMenuItem } from '../ActionMenu';
import { ProgressRing, CompletedBadge } from '../Progress';
import { ExternalProviderLinks } from '../ExternalProviderLinks';
import './IssueHero.css';

// =============================================================================
// Types
// =============================================================================

export interface IssueHeroProps {
  file: ComicFile;
  comicInfo: ComicInfo | null;
  progress: ReadingProgress | null;
  coverUrl: string;
  historyCount: number;
  totalPages: number;
  actionItems: ActionMenuItem[];
  onStartReading: () => void;
  onIssueAction: (actionId: string) => void;
  seriesId?: string;
  seriesName?: string;
  comicVineId?: string | null;
  metronId?: string | null;
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

function formatReadTime(remainingPages: number): string {
  if (remainingPages <= 0) return '0m';
  // Average 30 seconds per page
  const totalMinutes = Math.ceil(remainingPages * 0.5);
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
    <div className={`issue-hero__stat ${accent ? 'issue-hero__stat--accent' : ''}`}>
      <div className="issue-hero__stat-icon">{icon}</div>
      <div className="issue-hero__stat-content">
        <span className="issue-hero__stat-value">{value}</span>
        <span className="issue-hero__stat-label">{label}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function IssueHero({
  file,
  comicInfo,
  progress,
  coverUrl,
  historyCount,
  totalPages,
  actionItems,
  onStartReading,
  onIssueAction,
  seriesId,
  seriesName,
  comicVineId,
  metronId,
}: IssueHeroProps) {
  // Progress calculations
  const currentPage = progress?.currentPage ?? 0;
  const isCompleted = progress?.completed ?? false;
  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const pagesRemaining = totalPages - currentPage;

  // Title display
  const issueNumber = comicInfo?.Number;
  const issueTitle = comicInfo?.Title;
  const series = comicInfo?.Series || seriesName || '';
  const volume = comicInfo?.Volume;
  const publisher = comicInfo?.Publisher;
  const year = comicInfo?.Year;

  // Build secondary title line (Series + Issue Number)
  const secondaryTitle = useMemo(() => {
    const parts: string[] = [];
    if (series) parts.push(series);
    if (issueNumber) parts.push(`#${issueNumber}`);
    return parts.join(' ');
  }, [series, issueNumber]);

  // Primary title (issue-specific title or fallback to filename)
  const primaryTitle = issueTitle || file.filename.replace(/\.[^/.]+$/, '');

  // Button label based on progress
  const ctaLabel = progress && currentPage > 0 && !isCompleted ? 'Continue Reading' : 'Start Reading';

  return (
    <div className="issue-hero">
      {/* Main content */}
      <div className="issue-hero__content">
        {/* Cover image */}
        <div className="issue-hero__cover-wrapper">
          <div className="issue-hero__cover">
            {coverUrl ? (
              <img src={coverUrl} alt={primaryTitle} loading="eager" />
            ) : (
              <div className="issue-hero__cover-placeholder">
                <span>{primaryTitle.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
          {/* Progress ring */}
          {progressPercent > 0 && progressPercent < 100 && (
            <ProgressRing
              progress={progressPercent}
              size="lg"
              showLabel
              className="issue-hero__progress-ring"
            />
          )}
          {isCompleted && (
            <CompletedBadge
              size="lg"
              title="Completed"
              className="issue-hero__complete-badge"
            />
          )}
        </div>

        {/* Info section */}
        <div className="issue-hero__info">
          {/* Secondary title (Series + Number) */}
          {secondaryTitle && (
            <div className="issue-hero__title-secondary">
              {seriesId ? (
                <Link to={`/series/${seriesId}`} className="issue-hero__series-name-link">
                  {secondaryTitle}
                </Link>
              ) : (
                <span>{secondaryTitle}</span>
              )}
            </div>
          )}

          {/* Primary title (Issue Title) */}
          <h1 className="issue-hero__title-primary">{primaryTitle}</h1>

          {/* Meta line */}
          <div className="issue-hero__meta">
            {publisher && (
              <span className="issue-hero__meta-publisher">{publisher}</span>
            )}
            {year && <span className="issue-hero__meta-year">{year}</span>}
            {volume && <span className="issue-hero__meta-volume">Volume {volume}</span>}
            {totalPages > 0 && (
              <span className="issue-hero__meta-pages">{totalPages} pages</span>
            )}
            <ExternalProviderLinks
              comicVineId={comicVineId}
              metronId={metronId}
              context="issue"
            />
          </div>

          {/* Progress bar */}
          {totalPages > 0 && (
            <div className="issue-hero__progress-bar-container">
              <div className="issue-hero__progress-bar">
                <div
                  className="issue-hero__progress-bar-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="issue-hero__progress-text">
                {isCompleted
                  ? 'Completed'
                  : currentPage > 0
                  ? `Page ${currentPage} of ${totalPages}`
                  : 'Not started'}
              </span>
            </div>
          )}

          {/* Stats row */}
          <div className="issue-hero__stats">
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                </svg>
              }
              value={totalPages.toLocaleString()}
              label="Pages"
            />
            {file.size > 0 && (
              <StatItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                }
                value={formatBytes(file.size)}
                label="Size"
              />
            )}
            {pagesRemaining > 0 && (
              <StatItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                }
                value={formatReadTime(pagesRemaining)}
                label="Est. Time"
              />
            )}
            {historyCount > 0 && (
              <StatItem
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                value={historyCount}
                label={historyCount === 1 ? 'Session' : 'Sessions'}
              />
            )}
          </div>

          {/* Actions */}
          <div className="issue-hero__actions">
            <button className="issue-hero__cta" onClick={onStartReading}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{ctaLabel}</span>
            </button>
            <div className="issue-hero__actions-secondary">
              <QuickCollectionIcons fileId={file.id} size="medium" />
              <CollectionFlyout fileId={file.id} size="medium" align="right" />
              <ActionMenu
                items={actionItems}
                onAction={onIssueAction}
                ariaLabel="Issue actions"
                size="medium"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IssueHero;
