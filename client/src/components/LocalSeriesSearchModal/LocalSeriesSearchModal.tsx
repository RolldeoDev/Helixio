/**
 * LocalSeriesSearchModal Component
 *
 * Modal for searching series and moving files to a different series.
 * Supports both local library search and external API provider search.
 * Features rich cards with cover images, publisher, year, and issue count.
 * Supports both single file and batch operations.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  searchSeries,
  searchExternalSeries,
  linkFileToSeries,
  resolveSeriesCoverUrl,
  post,
  type Series,
  type SeriesMatch,
  type MetadataSource,
} from '../../services/api.service';
import './LocalSeriesSearchModal.css';

type SearchMode = 'local' | 'api';

interface LocalSeriesSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileIds: string[];
  currentSeriesId: string | null;
  currentSeriesName: string | null;
  onSuccess?: (targetSeries: Series, movedCount: number) => void;
}

// Unified result type for display
interface UnifiedResult {
  id: string;
  name: string;
  publisher?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  issueCount?: number | null;
  coverUrl?: string | null;
  confidence?: number;
  source?: MetadataSource;
  sourceId?: string;
  isLocal: boolean;
  original: Series | SeriesMatch;
}

// API to create a new series, or find existing if it already exists
async function createOrFindSeriesFromMatch(match: SeriesMatch): Promise<Series> {
  try {
    // Try to create the series
    const result = await post<{ series: Series }>('/series', {
      name: match.name,
      startYear: match.startYear,
      endYear: match.endYear,
      publisher: match.publisher,
      summary: match.description,
      issueCount: match.issueCount,
      // Store external ID for future reference
      [`${match.source}Id`]: match.sourceId,
    });
    return result.series;
  } catch (err) {
    // If series already exists, find it by name
    if (err instanceof Error && err.message.includes('already exists')) {
      const searchResult = await searchSeries(match.name, 50);
      // Find the matching series by name and publisher
      const existing = searchResult.series.find(s => {
        const nameMatch = s.name.toLowerCase() === match.name.toLowerCase();
        const publisherMatch = !match.publisher || !s.publisher ||
          s.publisher.toLowerCase() === match.publisher.toLowerCase();
        return nameMatch && publisherMatch;
      });
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

export function LocalSeriesSearchModal({
  isOpen,
  onClose,
  fileIds,
  currentSeriesId,
  currentSeriesName,
  onSuccess,
}: LocalSeriesSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search mode: local library or external API
  const [searchMode, setSearchMode] = useState<SearchMode>('local');

  // Source selector for API mode
  const [selectedSource, setSelectedSource] = useState<MetadataSource | 'all'>('all');

  // Pagination state
  const [displayLimit, setDisplayLimit] = useState(15);
  const [apiPagination, setApiPagination] = useState<{
    hasMore: boolean;
    offset: number;
    total?: number;
  } | null>(null);

  // Batch progress state
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    failed: string[];
  } | null>(null);

  // Convert local series to unified result
  const localToUnified = useCallback((series: Series): UnifiedResult => ({
    id: series.id,
    name: series.name,
    publisher: series.publisher,
    startYear: series.startYear,
    endYear: series.endYear,
    issueCount: series.issueCount,
    coverUrl: resolveSeriesCoverUrl(series),
    isLocal: true,
    original: series,
  }), []);

  // Convert API match to unified result
  const apiToUnified = useCallback((match: SeriesMatch): UnifiedResult => ({
    id: `${match.source}-${match.sourceId}`,
    name: match.name,
    publisher: match.publisher,
    startYear: match.startYear,
    endYear: match.endYear,
    issueCount: match.issueCount,
    coverUrl: match.coverUrl || match.imageUrls?.medium || match.imageUrls?.small,
    confidence: match.confidence,
    source: match.source,
    sourceId: match.sourceId,
    isLocal: false,
    original: match,
  }), []);

  // Search function - handles both local and API search
  const doSearch = useCallback(
    async (searchQuery: string, loadMore = false) => {
      if (searchQuery.length < 2) {
        setResults([]);
        setApiPagination(null);
        return;
      }

      setIsSearching(true);
      setError(null);

      try {
        if (searchMode === 'local') {
          // Local search
          const response = await searchSeries(searchQuery, 50);
          const filtered = currentSeriesId
            ? response.series.filter((s) => s.id !== currentSeriesId)
            : response.series;
          setResults(filtered.map(localToUnified));
          setApiPagination(null);
        } else {
          // API search
          const offset = loadMore ? (apiPagination?.offset ?? 0) + 15 : 0;
          const source = selectedSource === 'all' ? undefined : selectedSource;
          const response = await searchExternalSeries(searchQuery, 15, source, offset);

          const newResults = response.series.map(apiToUnified);

          if (loadMore) {
            setResults(prev => [...prev, ...newResults]);
          } else {
            setResults(newResults);
          }

          setApiPagination({
            hasMore: response.pagination?.hasMore ?? false,
            offset,
            total: response.pagination?.total,
          });
        }

        setDisplayLimit(15);
        setHasSearched(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [currentSeriesId, searchMode, selectedSource, apiPagination, localToUnified, apiToUnified]
  );

  // Load more results
  const handleLoadMore = useCallback(() => {
    if (searchMode === 'local') {
      setDisplayLimit((prev) => prev + 15);
    } else if (apiPagination?.hasMore) {
      doSearch(query, true);
    }
  }, [searchMode, apiPagination, query, doSearch]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setQuery('');
      setResults([]);
      setError(null);
      setHasSearched(false);
      setDisplayLimit(15);
      setBatchProgress(null);
      setSearchMode('local');
      setSelectedSource('all');
      setApiPagination(null);

      // Focus input after animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Re-search when mode or source changes
  useEffect(() => {
    if (isOpen && query.length >= 2) {
      doSearch(query);
    }
  }, [searchMode, selectedSource]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

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

  // Handle series selection - move files to this series
  const handleSelect = useCallback(
    async (result: UnifiedResult) => {
      if (fileIds.length === 0) return;

      setIsMoving(true);
      setError(null);

      try {
        let targetSeries: Series;

        if (result.isLocal) {
          // Local series - use directly
          targetSeries = result.original as Series;
        } else {
          // API result - create new series or find existing
          const match = result.original as SeriesMatch;
          targetSeries = await createOrFindSeriesFromMatch(match);
        }

        if (fileIds.length === 1) {
          // Single file move
          await linkFileToSeries(fileIds[0]!, targetSeries.id);
          onSuccess?.(targetSeries, 1);
          onClose();
        } else {
          // Batch move with progress tracking
          const failed: string[] = [];
          setBatchProgress({ current: 0, total: fileIds.length, failed: [] });

          for (let i = 0; i < fileIds.length; i++) {
            try {
              await linkFileToSeries(fileIds[i]!, targetSeries.id);
            } catch {
              failed.push(fileIds[i]!);
            }
            setBatchProgress({ current: i + 1, total: fileIds.length, failed });
          }

          const movedCount = fileIds.length - failed.length;
          if (failed.length > 0) {
            setError(`Failed to move ${failed.length} file(s)`);
          }

          if (movedCount > 0) {
            onSuccess?.(targetSeries, movedCount);
          }

          // Close after short delay to show completion
          setTimeout(() => {
            onClose();
          }, 500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to move file(s)');
      } finally {
        setIsMoving(false);
        setBatchProgress(null);
      }
    },
    [fileIds, onSuccess, onClose]
  );

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isMoving) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, isMoving, onClose]);

  if (!isOpen) return null;

  const displayedResults = searchMode === 'local'
    ? results.slice(0, displayLimit)
    : results;
  const hasMoreLocal = searchMode === 'local' && results.length > displayLimit;
  const hasMoreApi = searchMode === 'api' && apiPagination?.hasMore;

  return (
    <div className="local-series-search-overlay" onClick={isMoving ? undefined : onClose}>
      <div className="local-series-search-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="lss-header">
          <h2>
            {fileIds.length === 1
              ? 'Move File to Series'
              : `Move ${fileIds.length} Files to Series`}
          </h2>
          <button
            className="lss-close-btn"
            onClick={onClose}
            disabled={isMoving}
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Current series banner */}
        {currentSeriesName && (
          <div className="lss-current-series">
            <span className="lss-current-label">Current Series:</span>
            <span className="lss-current-name">{currentSeriesName}</span>
          </div>
        )}

        {/* Search mode toggle */}
        <div className="lss-mode-toggle">
          <button
            className={`lss-mode-btn ${searchMode === 'local' ? 'active' : ''}`}
            onClick={() => setSearchMode('local')}
            disabled={isMoving}
          >
            Library
          </button>
          <button
            className={`lss-mode-btn ${searchMode === 'api' ? 'active' : ''}`}
            onClick={() => setSearchMode('api')}
            disabled={isMoving}
          >
            Search API
          </button>
        </div>

        {/* Source selector (API mode only) */}
        {searchMode === 'api' && (
          <div className="lss-source-selector">
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value as MetadataSource | 'all')}
              disabled={isMoving || isSearching}
            >
              <option value="all">All Sources</option>
              <option value="comicvine">ComicVine</option>
              <option value="metron">Metron</option>
              <option value="gcd">GCD</option>
              <option value="anilist">AniList</option>
              <option value="mal">MAL</option>
            </select>
          </div>
        )}

        {/* Search form */}
        <form className="lss-search-form" onSubmit={handleSubmit}>
          <div className="lss-search-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder={searchMode === 'local' ? 'Search series in your library...' : 'Search external metadata sources...'}
              className="lss-search-input"
              disabled={isMoving}
            />
            {isSearching && <span className="lss-search-spinner" />}
          </div>
        </form>

        {/* Error message */}
        {error && <div className="lss-error">{error}</div>}

        {/* Results */}
        <div className="lss-results">
          {displayedResults.length > 0 ? (
            <>
              {displayedResults.map((result) => (
                <button
                  key={result.id}
                  className={`lss-result-item ${!result.isLocal ? 'lss-result-api' : ''}`}
                  onClick={() => handleSelect(result)}
                  disabled={isMoving}
                >
                  {/* Cover image */}
                  <div className="lss-result-cover">
                    {result.coverUrl ? (
                      <img
                        src={result.coverUrl}
                        alt={result.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="lss-cover-placeholder">
                        <span>No Cover</span>
                      </div>
                    )}
                  </div>

                  {/* Series info */}
                  <div className="lss-result-info">
                    <div className="lss-result-name">{result.name}</div>
                    <div className="lss-result-details">
                      {result.publisher && (
                        <span className="lss-detail-item">{result.publisher}</span>
                      )}
                      {result.startYear && (
                        <span className="lss-detail-item">
                          {result.startYear}
                          {result.endYear && result.endYear !== result.startYear
                            ? `-${result.endYear}`
                            : ''}
                        </span>
                      )}
                      {result.issueCount !== null && result.issueCount !== undefined && result.issueCount > 0 && (
                        <span className="lss-issue-count">
                          {result.issueCount} issue{result.issueCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {/* Source badge for API results */}
                    {!result.isLocal && result.source && (
                      <div className="lss-result-source">
                        <span className={`lss-source-badge lss-source-${result.source}`}>
                          {result.source}
                        </span>
                        {result.confidence !== undefined && (
                          <span className="lss-confidence">
                            {Math.round(result.confidence * 100)}% match
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}

              {/* Load more button */}
              {(hasMoreLocal || hasMoreApi) && (
                <button
                  className="lss-load-more"
                  onClick={handleLoadMore}
                  disabled={isMoving || isSearching}
                >
                  {isSearching ? 'Loading...' : (
                    hasMoreLocal
                      ? `Load More (${results.length - displayLimit} remaining)`
                      : 'Load More Results'
                  )}
                </button>
              )}
            </>
          ) : hasSearched && query.length >= 2 && !isSearching ? (
            <div className="lss-no-results">
              No series found matching "{query}"
              {searchMode === 'local' && (
                <button
                  className="lss-try-api-btn"
                  onClick={() => setSearchMode('api')}
                >
                  Try searching external APIs
                </button>
              )}
            </div>
          ) : query.length > 0 && query.length < 2 ? (
            <div className="lss-hint">Type at least 2 characters to search</div>
          ) : !hasSearched ? (
            <div className="lss-hint">
              {searchMode === 'local'
                ? 'Start typing to search your library'
                : 'Start typing to search external metadata sources'}
            </div>
          ) : null}
        </div>

        {/* Batch progress overlay */}
        {batchProgress && (
          <div className="lss-progress-overlay">
            <div className="lss-progress-content">
              <div className="lss-progress-spinner" />
              <div className="lss-progress-text">
                Moving files... {batchProgress.current} / {batchProgress.total}
              </div>
              {batchProgress.failed.length > 0 && (
                <div className="lss-progress-failed">
                  {batchProgress.failed.length} failed
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LocalSeriesSearchModal;
