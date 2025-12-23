/**
 * CrossMatchIndicator Component
 *
 * Shows the status of cross-source matching during series approval.
 * Displays confidence badges for each secondary source and matching status.
 */

import { useState } from 'react';
import type { MetadataSource, CrossSourceMatch, CrossSourceResult } from '../../services/api.service';
import './CrossMatchIndicator.css';

const SOURCE_LABELS: Record<MetadataSource, string> = {
  comicvine: 'ComicVine',
  metron: 'Metron',
  gcd: 'GCD',
  anilist: 'AniList',
  mal: 'MAL',
};

const SOURCE_COLORS: Record<MetadataSource, string> = {
  comicvine: '#f05050',
  metron: '#4a90d9',
  gcd: '#4caf50',
  anilist: '#02a9ff',
  mal: '#4e74c9',
};

interface CrossMatchIndicatorProps {
  /** Result from cross-source matching */
  crossMatchResult?: CrossSourceResult | null;
  /** Whether cross-matching is in progress */
  isSearching?: boolean;
  /** Sources currently being searched */
  searchingSources?: MetadataSource[];
  /** Callback when user clicks to view match details */
  onViewMatch?: (match: CrossSourceMatch) => void;
  /** Callback when user manually triggers a refresh */
  onRefresh?: () => void;
  /** Auto-match threshold for highlighting */
  autoMatchThreshold?: number;
}

/**
 * Get confidence level category
 */
function getConfidenceLevel(confidence: number, threshold: number): 'high' | 'medium' | 'low' {
  if (confidence >= threshold) return 'high';
  if (confidence >= 0.8) return 'medium';
  return 'low';
}

/**
 * Format confidence as percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function CrossMatchIndicator({
  crossMatchResult,
  isSearching = false,
  searchingSources = [],
  onViewMatch,
  onRefresh,
  autoMatchThreshold = 0.95,
}: CrossMatchIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  // If no result and not searching, nothing to show
  if (!crossMatchResult && !isSearching) {
    return null;
  }

  // Build status for each source
  const sourceStatuses: Array<{
    source: MetadataSource;
    status: 'matched' | 'no_match' | 'searching' | 'error' | 'skipped';
    match?: CrossSourceMatch;
  }> = [];

  if (crossMatchResult) {
    for (const [source, status] of Object.entries(crossMatchResult.status) as [MetadataSource, string][]) {
      if (source === crossMatchResult.primarySource) continue; // Skip primary source
      const match = crossMatchResult.matches.find(m => m.source === source);
      sourceStatuses.push({ source, status: status as 'matched' | 'no_match' | 'searching' | 'error' | 'skipped', match });
    }
  } else if (isSearching) {
    for (const source of searchingSources) {
      sourceStatuses.push({ source, status: 'searching' });
    }
  }

  // Calculate summary stats
  const matchedCount = sourceStatuses.filter(s => s.status === 'matched').length;
  const autoMatchedCount = sourceStatuses.filter(s => s.match?.isAutoMatchCandidate).length;
  const totalSecondary = sourceStatuses.filter(s => s.status !== 'skipped').length;

  return (
    <div className={`cross-match-indicator ${expanded ? 'expanded' : ''}`}>
      {/* Compact summary */}
      <div className="cross-match-summary" onClick={() => setExpanded(!expanded)}>
        <span className="summary-label">Cross-Source:</span>

        {isSearching ? (
          <span className="searching-status">
            <span className="spinner-small" />
            Searching...
          </span>
        ) : (
          <>
            {/* Source badges */}
            <div className="source-badges">
              {sourceStatuses.map(({ source, status, match }) => (
                <span
                  key={source}
                  className={`source-badge-mini ${status} ${match?.isAutoMatchCandidate ? 'auto-matched' : ''}`}
                  style={{
                    borderColor: SOURCE_COLORS[source],
                    backgroundColor: status === 'matched' ? SOURCE_COLORS[source] : 'transparent',
                  }}
                  title={`${SOURCE_LABELS[source]}: ${
                    status === 'matched'
                      ? `${formatConfidence(match!.confidence)} confidence`
                      : status === 'no_match'
                      ? 'No match found'
                      : status === 'error'
                      ? 'Error searching'
                      : status === 'searching'
                      ? 'Searching...'
                      : 'Skipped'
                  }`}
                >
                  {SOURCE_LABELS[source].charAt(0)}
                  {match && (
                    <span className={`confidence-dot ${getConfidenceLevel(match.confidence, autoMatchThreshold)}`} />
                  )}
                </span>
              ))}
            </div>

            {/* Summary text */}
            <span className="match-summary-text">
              {matchedCount === 0 ? (
                'No matches'
              ) : autoMatchedCount > 0 ? (
                <span className="auto-matched-text">
                  {autoMatchedCount} auto-matched
                </span>
              ) : (
                `${matchedCount}/${totalSecondary} matched`
              )}
            </span>
          </>
        )}

        <button
          className="expand-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="cross-match-details">
          {sourceStatuses.map(({ source, status, match }) => (
            <div
              key={source}
              className={`match-detail-row ${status}`}
              style={{ borderLeftColor: SOURCE_COLORS[source] }}
            >
              <span
                className="source-name"
                style={{ color: SOURCE_COLORS[source] }}
              >
                {SOURCE_LABELS[source]}
              </span>

              {status === 'matched' && match ? (
                <>
                  <div className="match-info">
                    <span className={`confidence-badge ${getConfidenceLevel(match.confidence, autoMatchThreshold)}`}>
                      {formatConfidence(match.confidence)}
                    </span>
                    {match.isAutoMatchCandidate && (
                      <span className="auto-match-label">Auto-matched</span>
                    )}
                    <span className="series-name">{match.seriesData.name}</span>
                  </div>

                  {/* Match factors tooltip */}
                  <div className="match-factors">
                    <span className={`factor ${match.matchFactors.titleSimilarity >= 0.9 ? 'good' : 'partial'}`}>
                      Title: {Math.round(match.matchFactors.titleSimilarity * 100)}%
                    </span>
                    <span className={`factor ${match.matchFactors.publisherMatch ? 'good' : 'bad'}`}>
                      Publisher: {match.matchFactors.publisherMatch ? '✓' : '✗'}
                    </span>
                    <span className={`factor ${match.matchFactors.yearMatch === 'exact' ? 'good' : match.matchFactors.yearMatch === 'close' ? 'partial' : 'bad'}`}>
                      Year: {match.matchFactors.yearMatch}
                    </span>
                    <span className={`factor ${match.matchFactors.issueCountMatch ? 'good' : 'neutral'}`}>
                      Issues: {match.matchFactors.issueCountMatch ? '✓' : '-'}
                    </span>
                  </div>

                  {onViewMatch && (
                    <button
                      className="view-match-btn"
                      onClick={() => onViewMatch(match)}
                    >
                      View
                    </button>
                  )}
                </>
              ) : status === 'searching' ? (
                <span className="status-text searching">
                  <span className="spinner-small" />
                  Searching...
                </span>
              ) : status === 'no_match' ? (
                <span className="status-text no-match">No match found</span>
              ) : status === 'error' ? (
                <span className="status-text error">Error</span>
              ) : (
                <span className="status-text skipped">Skipped</span>
              )}
            </div>
          ))}

          {onRefresh && !isSearching && (
            <button className="refresh-btn" onClick={onRefresh}>
              Refresh Cross-Matches
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default CrossMatchIndicator;
