/**
 * SeriesDetailDrawer Component
 *
 * A slide-out drawer that displays comprehensive series information from ComicVine.
 * Shows all available metadata including description, characters, creators,
 * concepts, locations, and objects.
 *
 * Uses React Portal to render at document body level, bypassing any stacking
 * context issues from parent modal overlays with backdrop-filter.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { type SeriesMatch, type SeriesCredit } from '../../services/api.service';
import './SeriesDetailDrawer.css';

interface SeriesDetailDrawerProps {
  series: SeriesMatch | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (series: SeriesMatch) => void;
  isSelected?: boolean;
}

export function SeriesDetailDrawer({
  series,
  isOpen,
  onClose,
  onSelect,
  isSelected,
}: SeriesDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node) && isOpen) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Don't render if no series data
  if (!series) return null;

  // Get portal target - fallback to body
  const portalTarget = document.body;

  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  const getConfidenceClass = (confidence: number): string => {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const getSourceDisplayName = (source: string): string => {
    const sourceNames: Record<string, string> = {
      comicvine: 'ComicVine',
      metron: 'Metron',
      gcd: 'Grand Comics Database',
      anilist: 'AniList',
      mal: 'MyAnimeList',
    };
    return sourceNames[source] || source;
  };

  const renderCreditSection = (
    title: string,
    credits: SeriesCredit[] | undefined,
    icon: string
  ) => {
    if (!credits || credits.length === 0) return null;

    return (
      <div className="drawer-section">
        <h4 className="section-title">
          <span className="section-icon">{icon}</span>
          {title}
          <span className="section-count">{credits.length}</span>
        </h4>
        <div className="credit-grid">
          {credits.map((credit) => (
            <div key={credit.id} className="credit-item">
              <span className="credit-name">{credit.name}</span>
              {credit.count && credit.count > 1 && (
                <span className="credit-count">{credit.count} issues</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Use portal to render at document body level
  // This bypasses stacking context issues from parent modal overlays with backdrop-filter
  return createPortal(
    <div className={`drawer-overlay ${isOpen ? 'open' : ''}`}>
      <div ref={drawerRef} className={`series-detail-drawer ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-section">
            <h2 className="drawer-title">{series.name}</h2>
            {series.startYear && (
              <span className="drawer-year">
                ({series.startYear}
                {series.endYear && series.endYear !== series.startYear
                  ? ` - ${series.endYear}`
                  : ''}
                )
              </span>
            )}
          </div>
          <button className="drawer-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="drawer-content">
          {/* Cover and Quick Info */}
          <div className="drawer-hero">
            {series.imageUrls?.medium && (
              <img
                src={series.imageUrls.medium}
                alt={series.name}
                className="drawer-cover"
              />
            )}
            <div className="drawer-quick-info">
              <div className="quick-info-item">
                <span className="info-label">Publisher</span>
                <span className="info-value">{series.publisher || 'Unknown'}</span>
              </div>
              <div className="quick-info-item">
                <span className="info-label">Issues</span>
                <span className="info-value">
                  {series.issueCount || '?'}
                  {series.firstIssueNumber && series.lastIssueNumber && (
                    <span className="issue-range">
                      {' '}(#{series.firstIssueNumber} - #{series.lastIssueNumber})
                    </span>
                  )}
                </span>
              </div>
              {series.seriesType && (
                <div className="quick-info-item">
                  <span className="info-label">Type</span>
                  <span className="info-value format-badge">{series.seriesType}</span>
                </div>
              )}
              <div className="quick-info-item">
                <span className="info-label">Source</span>
                <span className="info-value source-badge">{series.source}</span>
              </div>
              <div className="quick-info-item">
                <span className="info-label">Match</span>
                <span className={`info-value confidence-badge ${getConfidenceClass(series.confidence)}`}>
                  {formatConfidence(series.confidence)}
                </span>
              </div>
              {series.url && (
                <a
                  href={series.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="external-link"
                >
                  View on {getSourceDisplayName(series.source)}
                </a>
              )}
            </div>
          </div>

          {/* Description */}
          {(series.shortDescription || series.description) && (
            <div className="drawer-section">
              <h4 className="section-title">
                <span className="section-icon">&#128214;</span>
                Description
              </h4>
              {series.shortDescription && (
                <p className="drawer-deck">{series.shortDescription}</p>
              )}
              {series.description && (
                <p className="drawer-description">{series.description}</p>
              )}
            </div>
          )}

          {/* Aliases */}
          {series.aliases && series.aliases.length > 0 && (
            <div className="drawer-section">
              <h4 className="section-title">
                <span className="section-icon">&#128278;</span>
                Also Known As
              </h4>
              <div className="aliases-list">
                {series.aliases.map((alias, idx) => (
                  <span key={idx} className="alias-tag">{alias}</span>
                ))}
              </div>
            </div>
          )}

          {/* Characters */}
          {renderCreditSection('Characters', series.characters, '\u{1F9B8}')}

          {/* Creators */}
          {renderCreditSection('Creators', series.creators, '\u{270F}')}

          {/* Locations */}
          {renderCreditSection('Locations', series.locations, '\u{1F5FA}')}

          {/* Objects */}
          {renderCreditSection('Notable Objects', series.objects, '\u{2728}')}

          {/* No Additional Data Message */}
          {!series.characters?.length &&
            !series.creators?.length &&
            !series.locations?.length &&
            !series.objects?.length &&
            !series.description &&
            !series.shortDescription && (
              <div className="drawer-empty">
                <p>No additional metadata available for this series.</p>
                {series.source === 'metron' && (
                  <p className="empty-hint">
                    Try searching ComicVine for richer series information.
                  </p>
                )}
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
          {onSelect && (
            <button
              className={`btn-primary ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(series)}
            >
              {isSelected ? 'Selected' : 'Select This Series'}
            </button>
          )}
        </div>
      </div>
    </div>,
    portalTarget
  );
}

export default SeriesDetailDrawer;
