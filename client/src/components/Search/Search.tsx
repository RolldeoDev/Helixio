/**
 * Search Component
 *
 * Full-text search across ComicInfo.xml fields with filtering and facets.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CoverCard, type CoverCardFile, type MenuItemPreset } from '../CoverCard';
import { CollectionPickerModal } from '../CollectionPickerModal';
import { markAsCompleted, markAsIncomplete } from '../../services/api.service';

const API_BASE = '/api';

interface SearchResult {
  id: string;
  filename: string;
  path: string;
  libraryId: string;
  libraryName: string;
  metadata: {
    series?: string;
    number?: string;
    title?: string;
    year?: number;
    writer?: string;
    publisher?: string;
    genre?: string;
  };
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pages: number;
  facets?: {
    series: Array<{ value: string; count: number }>;
    writer: Array<{ value: string; count: number }>;
    publisher: Array<{ value: string; count: number }>;
    year: Array<{ value: number; count: number }>;
  };
}

interface SearchFilters {
  series?: string;
  writer?: string;
  publisher?: string;
  year?: number;
  libraryId?: string;
}

export function Search() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [facets, setFacets] = useState<SearchResponse['facets']>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [collectionPickerFileIds, setCollectionPickerFileIds] = useState<string[]>([]);

  const performSearch = useCallback(async (searchQuery: string, searchFilters: SearchFilters, searchPage: number) => {
    if (!searchQuery.trim() && Object.keys(searchFilters).length === 0) {
      setResults([]);
      setTotal(0);
      setPages(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }
      params.set('page', searchPage.toString());
      params.set('limit', '24');

      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      });

      const response = await fetch(`${API_BASE}/metadata/search?${params}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
      setTotal(data.total);
      setPages(data.pages);
      setFacets(data.facets);
      setSearchedQuery(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    performSearch(query, filters, 1);
  };

  const handleFilterChange = (key: keyof SearchFilters, value: string | number | undefined) => {
    const newFilters = { ...filters };
    if (value === undefined || value === '') {
      delete newFilters[key];
    } else {
      (newFilters as Record<string, unknown>)[key] = value;
    }
    setFilters(newFilters);
    setPage(1);
    performSearch(query, newFilters, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    performSearch(query, filters, newPage);
  };

  const clearFilters = () => {
    setFilters({});
    setPage(1);
    performSearch(query, {}, 1);
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(`/library/${result.libraryId}?file=${result.id}`);
  };

  // Menu items for search results
  const menuItems: MenuItemPreset[] = ['read', 'markRead', 'markUnread', 'addToCollection'];

  // Handle context menu action
  const handleMenuAction = useCallback(async (action: MenuItemPreset | string, fileId: string) => {
    switch (action) {
      case 'read':
        navigate(`/read/${fileId}`);
        break;
      case 'markRead':
        try {
          await markAsCompleted(fileId);
        } catch (err) {
          console.error('Failed to mark as read:', err);
        }
        break;
      case 'markUnread':
        try {
          await markAsIncomplete(fileId);
        } catch (err) {
          console.error('Failed to mark as unread:', err);
        }
        break;
      case 'addToCollection':
        setCollectionPickerFileIds([fileId]);
        break;
    }
  }, [navigate]);

  const activeFilterCount = Object.keys(filters).filter(
    (k) => filters[k as keyof SearchFilters] !== undefined
  ).length;

  return (
    <div className="search-page">
      <div className="search-header">
        <button className="btn-back" onClick={() => navigate('/')} title="Back to Library">
          ← Back
        </button>
        <h1>Search</h1>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search comics by series, title, writer..."
            className="search-input"
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="search-content">
        {/* Filters Panel */}
        <div className={`search-filters ${showFilters ? '' : 'collapsed'}`}>
          <div className="filters-header">
            <h3>
              Filters
              {activeFilterCount > 0 && (
                <span className="filter-count">{activeFilterCount}</span>
              )}
            </h3>
            <button
              className="btn-ghost"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Hide' : 'Show'}
            </button>
          </div>

          {showFilters && (
            <div className="filters-body">
              {activeFilterCount > 0 && (
                <button className="btn-ghost clear-filters" onClick={clearFilters}>
                  Clear All Filters
                </button>
              )}

              {/* Series Facet */}
              {facets?.series && facets.series.length > 0 && (
                <div className="filter-group">
                  <h4>Series</h4>
                  <select
                    value={filters.series || ''}
                    onChange={(e) => handleFilterChange('series', e.target.value || undefined)}
                  >
                    <option value="">All Series</option>
                    {facets.series.slice(0, 20).map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.value} ({f.count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Writer Facet */}
              {facets?.writer && facets.writer.length > 0 && (
                <div className="filter-group">
                  <h4>Writer</h4>
                  <select
                    value={filters.writer || ''}
                    onChange={(e) => handleFilterChange('writer', e.target.value || undefined)}
                  >
                    <option value="">All Writers</option>
                    {facets.writer.slice(0, 20).map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.value} ({f.count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Publisher Facet */}
              {facets?.publisher && facets.publisher.length > 0 && (
                <div className="filter-group">
                  <h4>Publisher</h4>
                  <select
                    value={filters.publisher || ''}
                    onChange={(e) => handleFilterChange('publisher', e.target.value || undefined)}
                  >
                    <option value="">All Publishers</option>
                    {facets.publisher.slice(0, 20).map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.value} ({f.count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Year Facet */}
              {facets?.year && facets.year.length > 0 && (
                <div className="filter-group">
                  <h4>Year</h4>
                  <select
                    value={filters.year || ''}
                    onChange={(e) =>
                      handleFilterChange('year', e.target.value ? parseInt(e.target.value, 10) : undefined)
                    }
                  >
                    <option value="">All Years</option>
                    {facets.year
                      .sort((a, b) => b.value - a.value)
                      .slice(0, 30)
                      .map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.value} ({f.count})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="search-results">
          {searchedQuery && (
            <div className="results-header">
              <span className="results-count">
                {total} results for "{searchedQuery}"
              </span>
            </div>
          )}

          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && searchedQuery && (
            <div className="empty-state">
              <p>No results found for "{searchedQuery}"</p>
              <p className="hint">Try adjusting your search terms or filters</p>
            </div>
          )}

          {!loading && results.length === 0 && !searchedQuery && (
            <div className="empty-state">
              <p>Enter a search term to find comics</p>
              <p className="hint">
                Search by series name, issue title, writer, artist, or any metadata field
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="results-grid">
              {results.map((result) => {
                // Convert SearchResult to CoverCardFile format
                const file: CoverCardFile = {
                  id: result.id,
                  filename: result.filename,
                  path: result.path,
                  libraryId: result.libraryId,
                  metadata: {
                    series: result.metadata.series,
                    number: result.metadata.number,
                    title: result.metadata.title,
                    year: result.metadata.year,
                    writer: result.metadata.writer,
                    publisher: result.metadata.publisher,
                    genre: result.metadata.genre,
                  },
                };

                return (
                  <CoverCard
                    key={result.id}
                    file={file}
                    variant="grid"
                    size="medium"
                    selectable={false}
                    contextMenuEnabled={true}
                    menuItems={menuItems}
                    showInfo={true}
                    showSeries={true}
                    showIssueNumber={true}
                    onClick={() => handleResultClick(result)}
                    onMenuAction={handleMenuAction}
                  />
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="pagination">
              <button
                className="btn-ghost"
                disabled={page === 1 || loading}
                onClick={() => handlePageChange(page - 1)}
              >
                ← Previous
              </button>
              <span className="page-info">
                Page {page} of {pages}
              </span>
              <button
                className="btn-ghost"
                disabled={page === pages || loading}
                onClick={() => handlePageChange(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Collection Picker Modal */}
      <CollectionPickerModal
        isOpen={collectionPickerFileIds.length > 0}
        onClose={() => setCollectionPickerFileIds([])}
        fileIds={collectionPickerFileIds}
      />
    </div>
  );
}
