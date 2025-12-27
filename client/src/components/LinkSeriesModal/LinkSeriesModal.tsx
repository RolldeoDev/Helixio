/**
 * LinkSeriesModal Component
 *
 * Three-step wizard modal for creating series relationships.
 * Step 1: Choose direction (add as child or link to parent)
 * Step 2: Select series to link
 * Step 3: Confirm and optionally set relationship type
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Series,
  getSeriesList,
  getCoverUrl,
  getApiCoverUrl,
} from '../../services/api.service';
import {
  addChildSeries,
  type RelationshipType,
} from '../../services/api/series';
import './LinkSeriesModal.css';

// =============================================================================
// Types
// =============================================================================

type LinkStep = 'direction' | 'select' | 'confirm';
type LinkDirection = 'addAsChild' | 'addAsParent';

interface LinkSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSeries: { id: string; name: string };
  existingParentIds: string[];
  existingChildIds: string[];
  onLinked: () => void;
}

const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; label: string; description: string }[] = [
  { value: 'related', label: 'Related', description: 'General relationship' },
  { value: 'spinoff', label: 'Spinoff', description: 'A series that branched off from the main story' },
  { value: 'prequel', label: 'Prequel', description: 'Events that happened before' },
  { value: 'sequel', label: 'Sequel', description: 'Events that happened after' },
  { value: 'bonus', label: 'Bonus', description: 'Extra content like side stories or specials' },
];

// =============================================================================
// Component
// =============================================================================

export function LinkSeriesModal({
  isOpen,
  onClose,
  currentSeries,
  existingParentIds,
  existingChildIds,
  onLinked,
}: LinkSeriesModalProps) {
  // Wizard state
  const [step, setStep] = useState<LinkStep>('direction');
  const [direction, setDirection] = useState<LinkDirection | null>(null);

  // Selection state
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Confirmation state
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('related');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('direction');
      setDirection(null);
      setSelectedIds(new Set());
      setSearch('');
      setPage(1);
      setRelationshipType('related');
      setError(null);
    }
  }, [isOpen]);

  // Determine which series to exclude based on direction
  const getExcludeIds = useCallback(() => {
    const ids = [currentSeries.id];
    if (direction === 'addAsChild') {
      // Adding children to current series - exclude existing children
      return [...ids, ...existingChildIds];
    } else {
      // Adding current as child to parents - exclude existing parents
      return [...ids, ...existingParentIds];
    }
  }, [currentSeries.id, direction, existingChildIds, existingParentIds]);

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

        const excludeIds = getExcludeIds();
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
    [getExcludeIds]
  );

  // Fetch on step change to select
  useEffect(() => {
    if (step === 'select' && direction) {
      setPage(1);
      fetchSeries(1, search);
    }
  }, [step, direction, fetchSeries, search]);

  // Search debounce
  useEffect(() => {
    if (step !== 'select') return;

    const timer = setTimeout(() => {
      setPage(1);
      fetchSeries(1, search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, step, fetchSeries]);

  if (!isOpen) return null;

  // Handlers
  const handleDirectionSelect = (dir: LinkDirection) => {
    setDirection(dir);
    setStep('select');
  };

  const handleToggleSelect = (seriesId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(seriesId)) {
        newSet.delete(seriesId);
      } else {
        if (newSet.size < 10) {
          newSet.add(seriesId);
        }
      }
      return newSet;
    });
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchSeries(nextPage, search, true);
  };

  const handleBack = () => {
    if (step === 'select') {
      setStep('direction');
      setDirection(null);
      setSelectedIds(new Set());
    } else if (step === 'confirm') {
      setStep('select');
    }
  };

  const handleContinueToConfirm = () => {
    if (selectedIds.size > 0) {
      setStep('confirm');
    }
  };

  const handleConfirmLink = async () => {
    if (selectedIds.size === 0 || !direction) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const selectedSeriesIds = Array.from(selectedIds);

      // Create relationships based on direction
      for (const selectedId of selectedSeriesIds) {
        if (direction === 'addAsChild') {
          // Current series is parent, selected series are children
          await addChildSeries(currentSeries.id, selectedId, relationshipType);
        } else {
          // Selected series are parents, current series is child
          await addChildSeries(selectedId, currentSeries.id, relationshipType);
        }
      }

      onLinked();
      onClose();
    } catch (err) {
      console.error('Failed to create relationships:', err);
      setError(err instanceof Error ? err.message : 'Failed to create relationships');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCover = (s: Series) => {
    if (s.coverHash) return getApiCoverUrl(s.coverHash);
    if (s.coverFileId) return getCoverUrl(s.coverFileId);
    if (s.issues && s.issues.length > 0 && s.issues[0]) {
      return getCoverUrl(s.issues[0].id);
    }
    return null;
  };

  const selectedSeries = series.filter((s) => selectedIds.has(s.id));

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="link-series-modal-overlay" onClick={onClose}>
      <div className="link-series-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="link-series-modal-header">
          <h2>
            {step === 'direction' && 'Link Series'}
            {step === 'select' && 'Select Series'}
            {step === 'confirm' && 'Confirm Link'}
          </h2>
          <button className="link-series-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="link-series-steps">
          <div className={`link-series-step ${step === 'direction' ? 'active' : ''} ${step !== 'direction' ? 'completed' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Direction</span>
          </div>
          <div className="link-series-step-connector" />
          <div className={`link-series-step ${step === 'select' ? 'active' : ''} ${step === 'confirm' ? 'completed' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Select</span>
          </div>
          <div className="link-series-step-connector" />
          <div className={`link-series-step ${step === 'confirm' ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Confirm</span>
          </div>
        </div>

        {/* Content */}
        <div className="link-series-modal-content">
          {/* Step 1: Direction Selection */}
          {step === 'direction' && (
            <div className="link-series-direction-step">
              <p className="link-series-description">
                How would you like to link series to <strong>{currentSeries.name}</strong>?
              </p>

              <div className="link-series-direction-options">
                <button
                  className="link-series-direction-card"
                  onClick={() => handleDirectionSelect('addAsChild')}
                >
                  <div className="direction-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="4" y="4" width="6" height="6" rx="1" />
                      <rect x="14" y="14" width="4" height="4" rx="1" />
                      <rect x="14" y="6" width="4" height="4" rx="1" />
                      <path d="M10 7h4M12 10v4" />
                    </svg>
                  </div>
                  <div className="direction-title">Add Child Series</div>
                  <div className="direction-description">
                    Select series to add as children of <strong>{currentSeries.name}</strong>
                    <br />
                    <span className="direction-example">(e.g., spinoffs, sequels, bonus content)</span>
                  </div>
                </button>

                <button
                  className="link-series-direction-card"
                  onClick={() => handleDirectionSelect('addAsParent')}
                >
                  <div className="direction-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="14" y="14" width="6" height="6" rx="1" />
                      <rect x="4" y="6" width="4" height="4" rx="1" />
                      <rect x="4" y="14" width="4" height="4" rx="1" />
                      <path d="M8 8h6M14 10v4" />
                    </svg>
                  </div>
                  <div className="direction-title">Link to Parent Series</div>
                  <div className="direction-description">
                    Select parent series that <strong>{currentSeries.name}</strong> belongs to
                    <br />
                    <span className="direction-example">(e.g., main series this is a spinoff of)</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Series Selection */}
          {step === 'select' && (
            <div className="link-series-select-step">
              <div className="link-series-search">
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

              <div className="link-series-select-grid">
                {loading && series.length === 0 ? (
                  <div className="link-series-loading">Loading...</div>
                ) : series.length === 0 ? (
                  <div className="link-series-empty">
                    {search ? 'No series found' : 'No series available'}
                  </div>
                ) : (
                  <>
                    {series.map((s) => {
                      const coverUrl = getCover(s);
                      const isSelected = selectedIds.has(s.id);

                      return (
                        <div
                          key={s.id}
                          className={`link-series-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleSelect(s.id)}
                        >
                          <div className="link-series-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(s.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          <div className="link-series-cover">
                            {coverUrl ? (
                              <img src={coverUrl} alt={s.name} />
                            ) : (
                              <div className="link-series-placeholder">
                                {s.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>

                          <div className="link-series-info">
                            <div className="link-series-name">{s.name}</div>
                            <div className="link-series-meta">
                              {s.startYear && <span>{s.startYear}</span>}
                              {s.publisher && <span>{s.publisher}</span>}
                            </div>
                            <div className="link-series-count">
                              {s._count?.issues ?? 0} issues
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {hasMore && (
                      <button
                        className="link-series-load-more"
                        onClick={handleLoadMore}
                        disabled={loading}
                      >
                        {loading ? 'Loading...' : 'Load More'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 'confirm' && (
            <div className="link-series-confirm-step">
              <div className="link-series-confirm-summary">
                <p>
                  {direction === 'addAsChild' ? (
                    <>
                      Link <strong>{selectedIds.size}</strong> series as children of{' '}
                      <strong>{currentSeries.name}</strong>
                    </>
                  ) : (
                    <>
                      Link <strong>{currentSeries.name}</strong> as child of{' '}
                      <strong>{selectedIds.size}</strong> selected series
                    </>
                  )}
                </p>
              </div>

              <div className="link-series-selected-preview">
                {selectedSeries.map((s) => {
                  const coverUrl = getCover(s);
                  return (
                    <div key={s.id} className="link-series-preview-item">
                      <div className="link-series-preview-cover">
                        {coverUrl ? (
                          <img src={coverUrl} alt={s.name} />
                        ) : (
                          <div className="link-series-placeholder-small">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="link-series-preview-name">{s.name}</span>
                    </div>
                  );
                })}
              </div>

              <div className="link-series-type-selector">
                <label>Relationship Type</label>
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
                >
                  {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} - {opt.description}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="link-series-error">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="link-series-modal-footer">
          <div className="link-series-selection-info">
            {step === 'select' && selectedIds.size > 0 && (
              <span>{selectedIds.size} series selected</span>
            )}
          </div>

          <div className="link-series-actions">
            {step !== 'direction' && (
              <button className="btn-secondary" onClick={handleBack} disabled={isSubmitting}>
                Back
              </button>
            )}
            <button className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>

            {step === 'select' && (
              <button
                className="btn-primary"
                onClick={handleContinueToConfirm}
                disabled={selectedIds.size === 0}
              >
                Continue
              </button>
            )}

            {step === 'confirm' && (
              <button
                className="btn-primary"
                onClick={handleConfirmLink}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Linking...' : 'Link Series'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
