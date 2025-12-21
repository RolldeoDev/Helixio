/**
 * SeriesMetadataSearchModal Component
 *
 * Modal for searching external APIs (ComicVine, Metron) for series metadata.
 * Used when a series doesn't have an external ID linked yet.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  SeriesMatch,
  MetadataSource,
  SeriesMetadataPayload,
  MergedSeriesMetadata,
} from '../../services/api.service';
import {
  searchExternalSeries,
  fetchSeriesMetadataByExternalId,
  scrapeComicVineThemes,
  expandSeriesResult,
} from '../../services/api.service';
import { MergedMetadataModal } from '../MetadataApproval/MergedMetadataModal';
import './SeriesMetadataSearchModal.css';

interface SeriesMetadataSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (source: MetadataSource, externalId: string, metadata: SeriesMetadataPayload) => void;
  seriesId: string;
  initialQuery: string;
}

export function SeriesMetadataSearchModal({
  isOpen,
  onClose,
  onSelect,
  seriesId,
  initialQuery,
}: SeriesMetadataSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SeriesMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Source selection
  const [selectedSource, setSelectedSource] = useState<MetadataSource | 'all'>('all');

  // Multi-source / expand functionality
  const [searchAllSources, setSearchAllSources] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandingSeriesId, setExpandingSeriesId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<{
    merged: MergedSeriesMetadata;
    sourceResults: Record<MetadataSource, SeriesMatch | null>;
  } | null>(null);
  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

  // Search function
  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const source = selectedSource === 'all' ? undefined : selectedSource;
      const response = await searchExternalSeries(searchQuery, 15, source);
      setResults(response.series || []);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [selectedSource]);

  // Focus input when modal opens and trigger search if we have an initial query
  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setQuery(initialQuery);
      setResults([]);
      setError(null);
      setHasSearched(false);

      // Focus input after a brief delay for animation
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);

      // Automatically search if we have an initial query
      if (initialQuery && initialQuery.length >= 2) {
        doSearch(initialQuery);
      }
    }
  }, [isOpen, initialQuery, doSearch]);

  // Debounced search on input change
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      // Clear existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Debounce search (300ms delay)
      searchTimeoutRef.current = setTimeout(() => {
        doSearch(value);
      }, 300);
    },
    [doSearch]
  );

  // Handle form submit (immediate search)
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      doSearch(query);
    },
    [query, doSearch]
  );

  // Handle series selection
  const handleSelect = useCallback(
    async (match: SeriesMatch) => {
      setIsSelecting(match.sourceId);
      setError(null);

      try {
        // Fetch full metadata for the selected series
        const result = await fetchSeriesMetadataByExternalId(
          seriesId,
          match.source,
          match.sourceId
        );

        if (result.metadata) {
          // For ComicVine, try to scrape themes from the website
          // (the API doesn't expose themes, but the website shows them)
          if (match.source === 'comicvine' && match.url) {
            try {
              const scrapedThemes = await scrapeComicVineThemes(match.url);
              if (scrapedThemes.length > 0) {
                // Merge scraped themes with any existing genres
                const existingGenres = result.metadata.genres || [];
                const mergedGenres = [...new Set([...scrapedThemes, ...existingGenres])];
                result.metadata.genres = mergedGenres;
              }
            } catch (scrapeErr) {
              // Theme scraping is optional - don't block the flow if it fails
              console.warn('Failed to scrape ComicVine themes:', scrapeErr);
            }
          }

          onSelect(match.source, match.sourceId, result.metadata);
        } else {
          setError('Failed to fetch metadata for selected series');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metadata');
      } finally {
        setIsSelecting(null);
      }
    },
    [seriesId, onSelect]
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Handle expanding a single result to fetch from all sources
  const handleExpandResult = useCallback(async (match: SeriesMatch) => {
    setIsExpanding(true);
    setExpandingSeriesId(match.sourceId);
    setError(null);

    try {
      // API now returns both merged and sourceResults directly
      const result = await expandSeriesResult(match);
      setExpandedResult({
        merged: result.merged,
        sourceResults: result.sourceResults,
      });
      setIsExpandModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to expand search');
    } finally {
      setIsExpanding(false);
      setExpandingSeriesId(null);
    }
  }, []);

  // Handle accepting merged data from the expand modal
  const handleAcceptMerged = useCallback(async (merged: MergedSeriesMetadata) => {
    setIsExpandModalOpen(false);
    setExpandedResult(null);

    // Create metadata payload from merged data
    const metadata: SeriesMetadataPayload = {
      seriesName: merged.name,
      publisher: merged.publisher || undefined,
      description: merged.description || undefined,
      startYear: merged.startYear,
      endYear: merged.endYear || undefined,
      issueCount: merged.issueCount,
      characters: merged.characters?.map((c) => c.name),
      locations: merged.locations?.map((l) => l.name),
    };

    // Call onSelect with the merged data
    onSelect(merged.source, merged.sourceId, metadata);
  }, [onSelect]);

  // Format source name
  const formatSource = (source: MetadataSource): string => {
    const labels: Record<MetadataSource, string> = {
      comicvine: 'ComicVine',
      metron: 'Metron',
      gcd: 'GCD',
    };
    return labels[source] || source;
  };

  // Get confidence badge class
  const getConfidenceBadgeClass = (confidence: number): string => {
    if (confidence >= 0.85) return 'confidence-high';
    if (confidence >= 0.7) return 'confidence-medium';
    return 'confidence-low';
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="series-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Search External Series</h2>
          <button
            className="btn-icon btn-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-row">
            <div className="search-input-wrapper">
              <svg
                className="search-icon"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
              >
                <path
                  d="M8.25 14.25a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM15.75 15.75l-3.263-3.262"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search for series by name..."
                className="search-input"
                autoComplete="off"
              />
              {(isSearching || isExpanding) && <div className="search-spinner" />}
            </div>
            <select
              className="source-selector"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value as MetadataSource | 'all')}
            >
              <option value="all">All Sources</option>
              <option value="comicvine">ComicVine</option>
              <option value="metron">Metron</option>
              <option value="gcd">GCD</option>
            </select>
          </div>
          {/* Search options - toggle for searching all sources */}
          <div className="search-options">
            <label className="option-toggle">
              <input
                type="checkbox"
                checked={searchAllSources}
                onChange={(e) => setSearchAllSources(e.target.checked)}
              />
              <span>Search all sources</span>
            </label>
            <span className="option-hint">
              {searchAllSources
                ? 'Results from all sources will be merged'
                : 'Click ⊕ on a result to fetch from other sources'}
            </span>
          </div>
        </form>

        <div className="modal-content">
          {error && (
            <div className="search-error">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M8 4.5v4M8 11.5h.01"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!hasSearched && !error && (
            <div className="search-hint">
              <p>
                Search for &quot;{initialQuery}&quot; or enter a different series name to find
                matching entries in ComicVine and Metron.
              </p>
            </div>
          )}

          {hasSearched && results.length === 0 && !isSearching && !error && (
            <div className="no-results">
              <p>No series found matching &quot;{query}&quot;</p>
              <p className="hint">Try adjusting your search terms or using a different name.</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="results-list">
              {results.map((match) => (
                <div key={`${match.source}-${match.sourceId}`} className="result-item">
                  <div className="result-cover">
                    {match.coverUrl ? (
                      <img
                        src={match.coverUrl}
                        alt={match.name}
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="no-cover">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <rect
                            x="3"
                            y="3"
                            width="18"
                            height="18"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M3 16l5-5 4 4 5-5 4 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="result-info">
                    <div className="result-header">
                      <span className="result-name">{match.name}</span>
                      <div className="result-badges">
                        <span className={`source-badge source-${match.source}`}>
                          {formatSource(match.source)}
                        </span>
                        {match.confidence > 0 && (
                          <span
                            className={`confidence-badge ${getConfidenceBadgeClass(match.confidence)}`}
                          >
                            {Math.round(match.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="result-details">
                      {match.publisher && (
                        <span className="detail">{match.publisher}</span>
                      )}
                      {match.startYear && (
                        <span className="detail">
                          {match.startYear}
                          {match.endYear && match.endYear !== match.startYear
                            ? ` - ${match.endYear}`
                            : ''}
                        </span>
                      )}
                      {match.issueCount !== undefined && match.issueCount > 0 && (
                        <span className="detail">{match.issueCount} issues</span>
                      )}
                    </div>

                    {match.description && (
                      <p className="result-description">
                        {match.description.substring(0, 200)}
                        {match.description.length > 200 ? '...' : ''}
                      </p>
                    )}
                  </div>

                  <div className="result-actions">
                    {/* Expand button - shown when not in searchAllSources mode */}
                    {!searchAllSources && (
                      <button
                        className={`btn btn-icon expand-btn ${expandingSeriesId === match.sourceId ? 'loading' : ''}`}
                        onClick={() => handleExpandResult(match)}
                        disabled={isExpanding || isSelecting !== null}
                        title="Expand: fetch from all sources"
                      >
                        {expandingSeriesId === match.sourceId ? (
                          <span className="spinner-tiny" />
                        ) : (
                          <span className="expand-icon">⊕</span>
                        )}
                      </button>
                    )}
                    <button
                      className="btn btn-primary result-select-btn"
                      onClick={() => handleSelect(match)}
                      disabled={isSelecting !== null || isExpanding}
                    >
                      {isSelecting === match.sourceId ? 'Loading...' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      {/* Merged Metadata Modal - shows comparison when expanding */}
      {expandedResult && (
        <MergedMetadataModal
          isOpen={isExpandModalOpen}
          onClose={() => {
            setIsExpandModalOpen(false);
            setExpandedResult(null);
          }}
          onAccept={handleAcceptMerged}
          sourceResults={expandedResult.sourceResults}
          mergedPreview={expandedResult.merged}
          isLoading={false}
        />
      )}
    </div>
  );
}
