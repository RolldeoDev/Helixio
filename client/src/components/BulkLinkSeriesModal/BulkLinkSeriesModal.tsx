/**
 * BulkLinkSeriesModal Component
 *
 * Three-step wizard modal for bulk linking multiple series to a single target parent.
 * Step 1: Select target parent series
 * Step 2: Review source series and set per-series relationship types
 * Step 3: Confirm and submit
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Series,
  getSeriesList,
  getSeries,
  resolveSeriesCoverUrl,
  bulkLinkSeries,
  type RelationshipType,
  type BulkOperationResult,
} from '../../services/api.service';
import './BulkLinkSeriesModal.css';

// =============================================================================
// Types
// =============================================================================

type BulkLinkStep = 'target' | 'review' | 'confirm';

interface BulkLinkSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceSeriesIds: string[];
  onLinked: (result: BulkOperationResult) => void;
}

interface SourceSeriesState {
  id: string;
  name: string;
  coverUrl: string | null;
  relationshipType: RelationshipType;
}

const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: 'related', label: 'Related' },
  { value: 'spinoff', label: 'Spinoff' },
  { value: 'prequel', label: 'Prequel' },
  { value: 'sequel', label: 'Sequel' },
  { value: 'bonus', label: 'Bonus' },
];

// =============================================================================
// Component
// =============================================================================

export function BulkLinkSeriesModal({
  isOpen,
  onClose,
  sourceSeriesIds,
  onLinked,
}: BulkLinkSeriesModalProps) {
  // Wizard state
  const [step, setStep] = useState<BulkLinkStep>('target');

  // Source series state (loaded from IDs)
  const [sourceSeries, setSourceSeries] = useState<SourceSeriesState[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);

  // Target selection state
  const [targetSeries, setTargetSeries] = useState<Series[]>([]);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the selected target series object
  const selectedTarget = useMemo(() => {
    return targetSeries.find((s) => s.id === selectedTargetId) || null;
  }, [targetSeries, selectedTargetId]);

  // Create a stable key from source IDs to prevent infinite re-renders
  // (parent may recreate the array on each render with Array.from())
  const sourceSeriesKey = useMemo(
    () => sourceSeriesIds.join(','),
    [sourceSeriesIds]
  );

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('target');
      setSearch('');
      setPage(1);
      setSelectedTargetId(null);
      setError(null);
      setSourceSeries([]);
    }
  }, [isOpen]);

  // Load source series info when modal opens
  // Uses batched API calls to prevent ERR_INSUFFICIENT_RESOURCES
  useEffect(() => {
    if (!isOpen || sourceSeriesIds.length === 0) return;

    const BATCH_SIZE = 5; // Concurrency limit
    let cancelled = false;

    const loadSourceSeries = async () => {
      setLoadingSource(true);
      try {
        const results: SourceSeriesState[] = [];

        // Process in batches to limit concurrent requests
        for (let i = 0; i < sourceSeriesIds.length; i += BATCH_SIZE) {
          if (cancelled) return;

          const batch = sourceSeriesIds.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (id) => {
              try {
                const { series } = await getSeries(id);
                return {
                  id: series.id,
                  name: series.name,
                  coverUrl: resolveSeriesCoverUrl(series),
                  relationshipType: 'related' as RelationshipType,
                };
              } catch {
                return null; // Skip series that fail to load
              }
            })
          );

          // Filter out nulls and add to results
          results.push(...batchResults.filter((r): r is SourceSeriesState => r !== null));
        }

        if (!cancelled) {
          setSourceSeries(results);
        }
      } finally {
        if (!cancelled) {
          setLoadingSource(false);
        }
      }
    };

    loadSourceSeries();

    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceSeriesKey]); // Use stable key instead of array

  // Create a stable Set for efficient lookup (memoized based on stable key)
  const sourceSeriesIdSet = useMemo(
    () => new Set(sourceSeriesIds),
    [sourceSeriesKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Load target series
  const loadTargetSeries = useCallback(
    async (pageNum: number, searchQuery: string, append = false) => {
      setLoadingTarget(true);
      try {
        const response = await getSeriesList({
          page: pageNum,
          limit: 50,
          search: searchQuery || undefined,
          sortBy: 'name',
          sortOrder: 'asc',
        });

        // Filter out source series IDs using stable Set
        const filtered = response.series.filter(
          (s: Series) => !sourceSeriesIdSet.has(s.id)
        );

        if (append) {
          setTargetSeries((prev) => [...prev, ...filtered]);
        } else {
          setTargetSeries(filtered);
        }
        setHasMore(response.series.length === 50);
      } catch (err) {
        console.error('Failed to load series:', err);
      } finally {
        setLoadingTarget(false);
      }
    },
    [sourceSeriesIdSet]
  );

  // Initial load and search
  useEffect(() => {
    if (!isOpen || step !== 'target') return;

    const debounce = setTimeout(() => {
      setPage(1);
      loadTargetSeries(1, search);
    }, 300);

    return () => clearTimeout(debounce);
  }, [isOpen, step, search, loadTargetSeries]);

  // Load more
  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadTargetSeries(nextPage, search, true);
  }, [page, search, loadTargetSeries]);

  // Handle relationship type change for a single series
  const handleTypeChange = useCallback((seriesId: string, type: RelationshipType) => {
    setSourceSeries((prev) =>
      prev.map((s) => (s.id === seriesId ? { ...s, relationshipType: type } : s))
    );
  }, []);

  // Handle "Set all to" action
  const handleSetAllTypes = useCallback((type: RelationshipType) => {
    setSourceSeries((prev) => prev.map((s) => ({ ...s, relationshipType: type })));
  }, []);

  // Handle submission
  const handleSubmit = useCallback(async () => {
    if (!selectedTargetId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await bulkLinkSeries(
        selectedTargetId,
        sourceSeries.map((s) => ({
          seriesId: s.id,
          relationshipType: s.relationshipType,
        }))
      );

      onLinked(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link series');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedTargetId, sourceSeries, onLinked]);

  // Step navigation
  const handleContinue = useCallback(() => {
    if (step === 'target' && selectedTargetId) {
      setStep('review');
    } else if (step === 'review') {
      setStep('confirm');
    }
  }, [step, selectedTargetId]);

  const handleBack = useCallback(() => {
    if (step === 'review') {
      setStep('target');
    } else if (step === 'confirm') {
      setStep('review');
    }
  }, [step]);

  if (!isOpen) return null;

  const stepNumber = step === 'target' ? 1 : step === 'review' ? 2 : 3;

  return (
    <div className="bulk-link-modal-overlay" onClick={onClose}>
      <div className="bulk-link-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bulk-link-modal-header">
          <h2>Bulk Link Series</h2>
          <button className="bulk-link-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bulk-link-steps">
          <div className={`bulk-link-step ${stepNumber >= 1 ? 'active' : ''} ${stepNumber > 1 ? 'completed' : ''}`}>
            <span className="step-number">{stepNumber > 1 ? '✓' : '1'}</span>
            <span className="step-label">Target</span>
          </div>
          <div className="bulk-link-step-connector" />
          <div className={`bulk-link-step ${stepNumber >= 2 ? 'active' : ''} ${stepNumber > 2 ? 'completed' : ''}`}>
            <span className="step-number">{stepNumber > 2 ? '✓' : '2'}</span>
            <span className="step-label">Review</span>
          </div>
          <div className="bulk-link-step-connector" />
          <div className={`bulk-link-step ${stepNumber >= 3 ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Confirm</span>
          </div>
        </div>

        {/* Content */}
        <div className="bulk-link-modal-content">
          {/* Step 1: Select Target */}
          {step === 'target' && (
            <div className="bulk-link-target-step">
              <p className="bulk-link-description">
                Select a parent series to link <strong>{sourceSeriesIds.length} series</strong> to as children:
              </p>

              <div className="bulk-link-search">
                <input
                  type="text"
                  placeholder="Search series..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="search-clear" onClick={() => setSearch('')}>
                    &times;
                  </button>
                )}
              </div>

              <div className="bulk-link-select-grid">
                {loadingTarget && targetSeries.length === 0 ? (
                  <div className="bulk-link-loading">Loading series...</div>
                ) : targetSeries.length === 0 ? (
                  <div className="bulk-link-empty">No series found</div>
                ) : (
                  <>
                    {targetSeries.map((series) => (
                      <div
                        key={series.id}
                        className={`bulk-link-item ${selectedTargetId === series.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTargetId(series.id)}
                      >
                        <div className="bulk-link-radio">
                          <input
                            type="radio"
                            checked={selectedTargetId === series.id}
                            onChange={() => setSelectedTargetId(series.id)}
                          />
                        </div>
                        <div className="bulk-link-cover">
                          {resolveSeriesCoverUrl(series) ? (
                            <img src={resolveSeriesCoverUrl(series)!} alt={series.name} />
                          ) : (
                            <div className="bulk-link-placeholder">
                              {series.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="bulk-link-info">
                          <div className="bulk-link-name">{series.name}</div>
                          <div className="bulk-link-meta">
                            {series.startYear && <span>{series.startYear}</span>}
                            {series.publisher && <span>{series.publisher}</span>}
                          </div>
                          <div className="bulk-link-count">
                            {series._count?.issues || 0} issues
                          </div>
                        </div>
                      </div>
                    ))}
                    {hasMore && (
                      <button
                        className="bulk-link-load-more"
                        onClick={handleLoadMore}
                        disabled={loadingTarget}
                      >
                        {loadingTarget ? 'Loading...' : 'Load More'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Review & Set Types */}
          {step === 'review' && (
            <div className="bulk-link-review-step">
              <p className="bulk-link-description">
                Link <strong>{sourceSeries.length} series</strong> as children of{' '}
                <strong>{selectedTarget?.name}</strong>
              </p>

              <div className="bulk-link-set-all">
                <span>Set all to:</span>
                <select
                  onChange={(e) => handleSetAllTypes(e.target.value as RelationshipType)}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose type...
                  </option>
                  {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bulk-link-type-table">
                <div className="bulk-link-table-header">
                  <div className="table-col-series">Series</div>
                  <div className="table-col-type">Relationship Type</div>
                </div>
                {loadingSource ? (
                  <div className="bulk-link-loading">Loading series info...</div>
                ) : (
                  sourceSeries.map((series) => (
                    <div key={series.id} className="bulk-link-table-row">
                      <div className="table-col-series">
                        <div className="bulk-link-cover-small">
                          {series.coverUrl ? (
                            <img src={series.coverUrl} alt={series.name} />
                          ) : (
                            <div className="bulk-link-placeholder-small">
                              {series.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="bulk-link-series-name">{series.name}</span>
                      </div>
                      <div className="table-col-type">
                        <select
                          value={series.relationshipType}
                          onChange={(e) =>
                            handleTypeChange(series.id, e.target.value as RelationshipType)
                          }
                        >
                          {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <div className="bulk-link-confirm-step">
              <div className="bulk-link-confirm-summary">
                <p>
                  Ready to create <strong>{sourceSeries.length}</strong> relationships
                </p>
              </div>

              <div className="bulk-link-confirm-target">
                <div className="confirm-label">Parent Series:</div>
                <div className="confirm-target-card">
                  <div className="bulk-link-cover">
                    {selectedTarget && resolveSeriesCoverUrl(selectedTarget) ? (
                      <img src={resolveSeriesCoverUrl(selectedTarget)!} alt={selectedTarget.name} />
                    ) : (
                      <div className="bulk-link-placeholder">
                        {selectedTarget?.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="confirm-target-info">
                    <div className="bulk-link-name">{selectedTarget?.name}</div>
                    {selectedTarget?.startYear && (
                      <div className="bulk-link-meta">{selectedTarget.startYear}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bulk-link-confirm-children">
                <div className="confirm-label">Children to add:</div>
                <div className="bulk-link-confirm-list">
                  {sourceSeries.map((series) => (
                    <div key={series.id} className="bulk-link-confirm-item">
                      <div className="bulk-link-cover-small">
                        {series.coverUrl ? (
                          <img src={series.coverUrl} alt={series.name} />
                        ) : (
                          <div className="bulk-link-placeholder-small">
                            {series.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="confirm-item-name">{series.name}</span>
                      <span className="confirm-item-type">{series.relationshipType}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className="bulk-link-error">{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bulk-link-modal-footer">
          <div className="bulk-link-selection-info">
            {step === 'target' && selectedTargetId && (
              <span>Target selected</span>
            )}
            {step === 'review' && (
              <span>{sourceSeries.length} series to link</span>
            )}
          </div>

          <div className="bulk-link-actions">
            {step !== 'target' && (
              <button
                className="btn btn-secondary"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                Back
              </button>
            )}
            <button className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            {step !== 'confirm' ? (
              <button
                className="btn btn-primary"
                onClick={handleContinue}
                disabled={step === 'target' && !selectedTargetId}
              >
                Continue
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Linking...' : 'Link All'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
