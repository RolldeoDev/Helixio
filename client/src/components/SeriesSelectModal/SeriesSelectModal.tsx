/**
 * SeriesSelectModal Component
 *
 * Modal for selecting one or more series from the library.
 * Used for initiating merge operations from series detail or context menu.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Series,
  getSeriesList,
  resolveSeriesCoverUrl,
} from '../../services/api.service';
import './SeriesSelectModal.css';

interface SeriesSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedSeries: Series[]) => void;
  excludeIds?: string[];
  title?: string;
  multiSelect?: boolean;
  maxSelect?: number;
}

export function SeriesSelectModal({
  isOpen,
  onClose,
  onSelect,
  excludeIds = [],
  title = 'Select Series',
  multiSelect = true,
  maxSelect = 10,
}: SeriesSelectModalProps) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Fetch series
  const fetchSeries = useCallback(
    async (pageNum: number, searchQuery: string, append = false) => {
      setLoading(true);
      try {
        const result = await getSeriesList({
          page: pageNum,
          limit: 50,
          search: searchQuery || undefined,
          sortBy: 'name',
          sortOrder: 'asc',
        });

        // Filter out excluded series
        const filtered = result.series.filter((s) => !excludeIds.includes(s.id));

        if (append) {
          setSeries((prev) => [...prev, ...filtered]);
        } else {
          setSeries(filtered);
        }

        setHasMore(result.pagination.page < result.pagination.pages);
      } catch (err) {
        console.error('Failed to fetch series:', err);
      } finally {
        setLoading(false);
      }
    },
    [excludeIds]
  );

  // Initial fetch and search
  useEffect(() => {
    if (isOpen) {
      setPage(1);
      setSelectedIds(new Set());
      fetchSeries(1, search);
    }
  }, [isOpen, search, fetchSeries]);

  // Handle search with debounce
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      setPage(1);
      fetchSeries(1, search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, isOpen, fetchSeries]);

  if (!isOpen) return null;

  const handleToggleSelect = (seriesId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(seriesId)) {
        newSet.delete(seriesId);
      } else {
        if (!multiSelect) {
          newSet.clear();
        }
        if (newSet.size < maxSelect) {
          newSet.add(seriesId);
        }
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    const selected = series.filter((s) => selectedIds.has(s.id));
    onSelect(selected);
    onClose();
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchSeries(nextPage, search, true);
  };

  return (
    <div className="series-select-modal-overlay" onClick={onClose}>
      <div className="series-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="series-select-modal-header">
          <h2>{title}</h2>
          <button className="series-select-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="series-select-search">
          <input
            type="text"
            placeholder="Search series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>
              ×
            </button>
          )}
        </div>

        <div className="series-select-content">
          {loading && series.length === 0 ? (
            <div className="series-select-loading">Loading...</div>
          ) : series.length === 0 ? (
            <div className="series-select-empty">
              {search ? 'No series found matching your search' : 'No series available'}
            </div>
          ) : (
            <>
              <div className="series-select-grid">
                {series.map((s) => {
                  const coverUrl = resolveSeriesCoverUrl(s);
                  const isSelected = selectedIds.has(s.id);

                  return (
                    <div
                      key={s.id}
                      className={`series-select-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleToggleSelect(s.id)}
                    >
                      <div className="series-select-checkbox">
                        <input
                          type={multiSelect ? 'checkbox' : 'radio'}
                          checked={isSelected}
                          onChange={() => handleToggleSelect(s.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      <div className="series-select-cover">
                        {coverUrl ? (
                          <img src={coverUrl} alt={s.name} />
                        ) : (
                          <div className="series-select-placeholder">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="series-select-info">
                        <div className="series-select-name">{s.name}</div>
                        <div className="series-select-meta">
                          {s.startYear && <span>{s.startYear}</span>}
                          {s.publisher && <span>{s.publisher}</span>}
                        </div>
                        <div className="series-select-count">
                          {s._count?.issues ?? 0} issues
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <button
                  className="series-select-load-more"
                  onClick={handleLoadMore}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </>
          )}
        </div>

        <div className="series-select-modal-footer">
          <div className="series-select-selection-info">
            {selectedIds.size > 0
              ? `${selectedIds.size} series selected`
              : 'Select series to merge with'}
          </div>
          <div className="series-select-actions">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
            >
              {multiSelect ? 'Continue' : 'Select'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
