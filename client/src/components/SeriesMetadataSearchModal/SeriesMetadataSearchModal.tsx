/**
 * SeriesMetadataSearchModal Component
 *
 * Modal for searching external APIs (ComicVine, Metron) for series metadata.
 * Used when a series doesn't have an external ID linked yet.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  SeriesMatch,
  MetadataSource,
  SeriesMetadataPayload,
  MergedSeriesMetadata,
  SearchPagination,
} from '../../services/api.service';
import {
  searchExternalSeries,
  fetchSeriesMetadataByExternalId,
  scrapeComicVineThemes,
  expandSeriesResult,
} from '../../services/api.service';
import { MergedMetadataModal } from '../MetadataApproval/MergedMetadataModal';
import { SeriesDetailDrawer } from '../MetadataApproval/SeriesDetailDrawer';
import { useToast } from '../../contexts/ToastContext';
import './SeriesMetadataSearchModal.css';

// Source availability status
interface SourceAvailability {
  comicvine: boolean;
  metron: boolean;
  gcd: boolean;
  anilist: boolean;
  mal: boolean;
}

interface SeriesMetadataSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (source: MetadataSource, externalId: string, metadata: SeriesMetadataPayload) => void;
  seriesId: string;
  initialQuery: string;
  libraryType?: 'western' | 'manga';
}

export function SeriesMetadataSearchModal({
  isOpen,
  onClose,
  onSelect,
  seriesId,
  initialQuery,
  libraryType,
}: SeriesMetadataSearchModalProps) {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SeriesMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Source availability state
  const [sourceAvailability, setSourceAvailability] = useState<SourceAvailability>({
    comicvine: true, // Assume available until we check
    metron: true,
    gcd: false, // GCD is not implemented
    anilist: true, // Free API
    mal: true, // Free API
  });

  // Compute default source based on library type (manga → AniList, western → ComicVine)
  const defaultSource = useMemo((): MetadataSource => {
    return libraryType === 'manga' ? 'anilist' : 'comicvine';
  }, [libraryType]);
  // Source selection - defaults based on library type
  const [selectedSource, setSelectedSource] = useState<MetadataSource | 'all'>(defaultSource);

  // Multi-source / expand functionality
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandingSeriesId, setExpandingSeriesId] = useState<string | null>(null);

  // Series detail drawer
  const [detailDrawerSeries, setDetailDrawerSeries] = useState<SeriesMatch | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [expandedResult, setExpandedResult] = useState<{
    merged: MergedSeriesMetadata;
    sourceResults: Record<MetadataSource, SeriesMatch | null>;
  } | null>(null);
  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState<SearchPagination | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Search function
  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setPagination(null);
      return;
    }

    setIsSearching(true);
    setError(null);
    setPagination(null);

    try {
      const source = selectedSource === 'all' ? undefined : selectedSource;
      const response = await searchExternalSeries(searchQuery, 15, source, 0, libraryType);
      setResults(response.series || []);
      setPagination(response.pagination || null);
      setHasSearched(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      setResults([]);
      setPagination(null);

      // Check if it's an API key error and show toast with settings link
      if (
        errorMessage.toLowerCase().includes('api key') ||
        errorMessage.toLowerCase().includes('not configured') ||
        errorMessage.toLowerCase().includes('credentials')
      ) {
        addToast('error', 'API key required for metadata search', {
          label: 'Configure',
          onClick: () => {
            onClose();
            navigate('/settings?tab=system');
          },
        });
      }
    } finally {
      setIsSearching(false);
    }
  }, [selectedSource, libraryType, addToast, navigate, onClose]);

  // Load more results (pagination)
  const handleLoadMore = useCallback(async () => {
    if (!pagination || !pagination.hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    setError(null);

    try {
      const source = selectedSource === 'all' ? undefined : selectedSource;
      const newOffset = pagination.offset + pagination.limit;
      const response = await searchExternalSeries(query, pagination.limit, source, newOffset, libraryType);

      // Append new results to existing
      setResults(prev => [...prev, ...(response.series || [])]);
      setPagination(response.pagination || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more results');
    } finally {
      setIsLoadingMore(false);
    }
  }, [pagination, isLoadingMore, selectedSource, query, libraryType]);

  // Check source availability when modal opens
  useEffect(() => {
    if (isOpen) {
      fetch('/api/config')
        .then((r) => r.json())
        .then((config) => {
          setSourceAvailability({
            comicvine: config.apiKeys?.comicVine === '***configured***',
            metron: config.apiKeys?.metronUsername === '***configured***' && config.apiKeys?.metronPassword === '***configured***',
            gcd: false, // Not implemented
            anilist: true, // Free API
            mal: true, // Free API
          });
        })
        .catch(() => {
          // Fail silently, keep defaults
        });
    }
  }, [isOpen]);

  // Focus input when modal opens and trigger search if we have an initial query
  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setQuery(initialQuery);
      setResults([]);
      setError(null);
      setHasSearched(false);
      setPagination(null);
      setSelectedSource(defaultSource); // Reset to library-appropriate default

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
  }, [isOpen, initialQuery, doSearch, defaultSource]);

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

  // Handle clicking on a result row to show details
  const handleResultClick = useCallback((match: SeriesMatch) => {
    setDetailDrawerSeries(match);
    setIsDetailDrawerOpen(true);
  }, []);

  // Handle selecting from the detail drawer
  const handleSelectFromDrawer = useCallback(async (match: SeriesMatch) => {
    setIsDetailDrawerOpen(false);
    setDetailDrawerSeries(null);
    // Use the same selection logic
    await handleSelect(match);
  }, [handleSelect]);

  // Format source name
  const formatSource = (source: MetadataSource): string => {
    const labels: Record<MetadataSource, string> = {
      comicvine: 'ComicVine',
      metron: 'Metron',
      gcd: 'GCD',
      anilist: 'AniList',
      mal: 'MAL',
    };
    return labels[source] || source;
  };

  // Check if source is available
  const isSourceAvailable = (source: MetadataSource): boolean => {
    return sourceAvailability[source] ?? false;
  };

  // Get unavailable reason for a source
  const getSourceUnavailableReason = (source: MetadataSource): string => {
    if (source === 'comicvine' && !sourceAvailability.comicvine) {
      return 'ComicVine API key not configured';
    }
    if (source === 'metron' && !sourceAvailability.metron) {
      return 'Metron credentials not configured';
    }
    if (source === 'gcd') {
      return 'GCD is not yet implemented';
    }
    return '';
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
              <option
                value="comicvine"
                disabled={!isSourceAvailable('comicvine')}
                title={getSourceUnavailableReason('comicvine')}
              >
                ComicVine{!isSourceAvailable('comicvine') ? ' (not configured)' : ''}
              </option>
              <option
                value="metron"
                disabled={!isSourceAvailable('metron')}
                title={getSourceUnavailableReason('metron')}
              >
                Metron{!isSourceAvailable('metron') ? ' (not configured)' : ''}
              </option>
              <option
                value="gcd"
                disabled={!isSourceAvailable('gcd')}
                title={getSourceUnavailableReason('gcd')}
              >
                GCD (not available)
              </option>
              <option value="anilist">AniList</option>
              <option value="mal">MAL</option>
            </select>
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
                matching entries.{libraryType === 'manga' ? ' AniList and MAL results will be prioritized.' : ''}
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
                <div
                  key={`${match.source}-${match.sourceId}`}
                  className="result-item"
                  onClick={() => handleResultClick(match)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleResultClick(match);
                    }
                  }}
                >
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

                  <div className="result-actions" onClick={(e) => e.stopPropagation()}>
                    {/* Expand button - fetch from all sources */}
                    <button
                      className={`btn btn-icon expand-btn ${expandingSeriesId === match.sourceId ? 'loading' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExpandResult(match);
                      }}
                      disabled={isExpanding || isSelecting !== null}
                      title="Expand: fetch from all sources"
                    >
                      {expandingSeriesId === match.sourceId ? (
                        <span className="spinner-tiny" />
                      ) : (
                        <span className="expand-icon">⊕</span>
                      )}
                    </button>
                    <button
                      className="btn btn-primary result-select-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(match);
                      }}
                      disabled={isSelecting !== null || isExpanding}
                    >
                      {isSelecting === match.sourceId ? 'Loading...' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Load More button for pagination */}
              {pagination && pagination.hasMore && (
                <div className="load-more-container">
                  <button
                    className="btn btn-secondary load-more-btn"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <>
                        <span className="spinner-tiny" />
                        Loading...
                      </>
                    ) : (
                      <>Load More ({pagination.total - results.length} remaining)</>
                    )}
                  </button>
                </div>
              )}
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

      {/* Series Detail Drawer - shows full series info when clicking a result */}
      <SeriesDetailDrawer
        series={detailDrawerSeries}
        isOpen={isDetailDrawerOpen}
        onClose={() => {
          setIsDetailDrawerOpen(false);
          setDetailDrawerSeries(null);
        }}
        onSelect={handleSelectFromDrawer}
        isSelected={false}
      />
    </div>
  );
}
