/**
 * MergeSeriesModal Component
 *
 * Modal for merging multiple series into one.
 * Features side-by-side comparison, target selection, and preview.
 */

import { useState, useEffect } from 'react';
import {
  SeriesForMerge,
  MergePreview,
  MergeResult,
  previewMergeSeries,
  mergeSeries,
} from '../../services/api.service';
import { SeriesComparisonCard } from './SeriesComparisonCard';
import './MergeSeriesModal.css';

interface MergeSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMergeComplete?: (result: MergeResult) => void;
  initialSeries: SeriesForMerge[];
  initialTargetId?: string;
}

type MergeStep = 'select' | 'preview' | 'merging' | 'complete';

export function MergeSeriesModal({
  isOpen,
  onClose,
  onMergeComplete,
  initialSeries,
  initialTargetId,
}: MergeSeriesModalProps) {
  const [step, setStep] = useState<MergeStep>('select');
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    initialTargetId || (initialSeries.length > 0 ? initialSeries[0]?.id ?? '' : '')
  );
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setSelectedTargetId(initialTargetId || (initialSeries.length > 0 ? initialSeries[0]?.id ?? '' : ''));
      setPreview(null);
      setError(null);
      setResult(null);
    }
  }, [isOpen, initialSeries, initialTargetId]);

  if (!isOpen) return null;

  const sourceIds = initialSeries
    .filter((s) => s.id !== selectedTargetId)
    .map((s) => s.id);

  const handlePreview = async () => {
    if (!selectedTargetId || sourceIds.length === 0) {
      setError('Please select a target series');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await previewMergeSeries(sourceIds, selectedTargetId);
      setPreview(response.preview);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!selectedTargetId || sourceIds.length === 0) return;

    setStep('merging');
    setLoading(true);
    setError(null);

    try {
      const response = await mergeSeries(sourceIds, selectedTargetId);
      setResult(response.result);
      setStep('complete');
      onMergeComplete?.(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'preview') {
      setStep('select');
      setPreview(null);
    }
  };

  const renderSelectStep = () => (
    <>
      <div className="merge-modal-content">
        <p className="merge-modal-instruction">
          Select which series to keep as the target. All issues from other series will be moved to the target,
          and the source series names will be added as aliases.
        </p>

        <div className="merge-series-grid">
          {initialSeries.map((series) => (
            <SeriesComparisonCard
              key={series.id}
              series={series}
              isSelected={series.id === selectedTargetId}
              onSelect={() => setSelectedTargetId(series.id)}
              showRadio
            />
          ))}
        </div>
      </div>

      <div className="merge-modal-footer">
        {error && <div className="merge-modal-error">{error}</div>}
        <div className="merge-modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handlePreview}
            disabled={loading || !selectedTargetId || sourceIds.length === 0}
          >
            {loading ? 'Loading...' : 'Preview Merge'}
          </button>
        </div>
      </div>
    </>
  );

  const renderPreviewStep = () => {
    if (!preview) return null;

    return (
      <>
        <div className="merge-modal-content">
          <div className="merge-preview-section">
            <h3>Target Series (Will Be Kept)</h3>
            <SeriesComparisonCard series={preview.targetSeries} isTarget />
          </div>

          <div className="merge-preview-section">
            <h3>Source Series (Will Be Deleted)</h3>
            <div className="merge-source-list">
              {preview.sourceSeries.map((series) => (
                <SeriesComparisonCard key={series.id} series={series} isSource />
              ))}
            </div>
          </div>

          <div className="merge-preview-summary">
            <h3>Merge Summary</h3>
            <ul>
              <li>
                <strong>Total issues after merge:</strong> {preview.totalIssuesAfterMerge}
              </li>
              {preview.resultingAliases.length > 0 && (
                <li>
                  <strong>Aliases to be added:</strong>{' '}
                  {preview.resultingAliases.join(', ')}
                </li>
              )}
            </ul>

            {preview.warnings.length > 0 && (
              <div className="merge-warnings">
                <h4>Warnings</h4>
                <ul>
                  {preview.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="merge-modal-footer">
          {error && <div className="merge-modal-error">{error}</div>}
          <div className="merge-modal-actions">
            <button className="btn-secondary" onClick={handleBack} disabled={loading}>
              Back
            </button>
            <button className="btn-primary btn-danger" onClick={handleMerge} disabled={loading}>
              {loading ? 'Merging...' : 'Confirm Merge'}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderMergingStep = () => (
    <div className="merge-modal-content merge-modal-center">
      <div className="merge-spinner" />
      <p>Merging series...</p>
    </div>
  );

  const renderCompleteStep = () => {
    if (!result) return null;

    return (
      <>
        <div className="merge-modal-content merge-modal-center">
          <div className="merge-success-icon">✓</div>
          <h3>Merge Complete!</h3>
          <ul className="merge-result-summary">
            <li>
              <strong>Issues moved:</strong> {result.issuesMoved}
            </li>
            <li>
              <strong>Series merged:</strong> {result.mergedSourceIds.length}
            </li>
            {result.aliasesAdded.length > 0 && (
              <li>
                <strong>Aliases added:</strong> {result.aliasesAdded.join(', ')}
              </li>
            )}
          </ul>
        </div>

        <div className="merge-modal-footer">
          <div className="merge-modal-actions">
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </>
    );
  };

  const getStepTitle = () => {
    switch (step) {
      case 'select':
        return 'Select Target Series';
      case 'preview':
        return 'Review Merge';
      case 'merging':
        return 'Merging...';
      case 'complete':
        return 'Merge Complete';
    }
  };

  return (
    <div className="merge-modal-overlay" onClick={onClose}>
      <div className="merge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="merge-modal-header">
          <h2>{getStepTitle()}</h2>
          <button className="merge-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {step === 'select' && renderSelectStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'merging' && renderMergingStep()}
        {step === 'complete' && renderCompleteStep()}
      </div>
    </div>
  );
}
