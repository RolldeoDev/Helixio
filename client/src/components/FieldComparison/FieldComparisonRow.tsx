/**
 * FieldComparisonRow Component
 *
 * Reusable row component for comparing current vs proposed field values.
 * Supports both diff badges (for API metadata) and confidence badges (for LLM metadata).
 */

import './FieldComparison.css';

export type FieldDiffStatus = 'new' | 'changed' | 'same' | 'removed';

export interface FieldComparisonRowProps {
  fieldName: string;
  label: string;
  currentValue: string | number | null;
  proposedValue: string | number | null;
  isSelected: boolean;
  isLocked?: boolean;
  status?: FieldDiffStatus;
  confidence?: number; // 0-1, for LLM-generated fields
  onToggle: (selected: boolean) => void;
  disabled?: boolean;
  // For cover fields
  coverPreview?: {
    currentUrl: string | null;
    proposedUrl: string | null;
  };
  // Optional value formatter
  formatValue?: (value: string | number | null) => string;
}

export function FieldComparisonRow({
  fieldName,
  label,
  currentValue,
  proposedValue,
  isSelected,
  isLocked = false,
  status,
  confidence,
  onToggle,
  disabled = false,
  coverPreview,
  formatValue,
}: FieldComparisonRowProps) {
  const isDisabled = disabled || isLocked;

  // Format display value
  const displayValue = (value: string | number | null): React.ReactNode => {
    if (value === null || value === '' || value === undefined) {
      return <em className="field-comparison-empty">Empty</em>;
    }
    if (formatValue) {
      return formatValue(value);
    }
    // Truncate long strings for display
    if (typeof value === 'string' && value.length > 150) {
      return value.substring(0, 150) + '...';
    }
    return String(value);
  };

  // Get diff badge class and text
  const getDiffBadge = (): { className: string; text: string } | null => {
    if (!status) return null;
    switch (status) {
      case 'new':
        return { className: 'field-comparison-badge badge-new', text: 'NEW' };
      case 'changed':
        return { className: 'field-comparison-badge badge-changed', text: 'CHANGED' };
      case 'removed':
        return { className: 'field-comparison-badge badge-removed', text: 'REMOVED' };
      case 'same':
        return { className: 'field-comparison-badge badge-same', text: 'SAME' };
      default:
        return null;
    }
  };

  // Get confidence badge class
  const getConfidenceBadge = (): { className: string; text: string } | null => {
    if (confidence === undefined) return null;
    let confidenceClass = 'confidence-low';
    if (confidence >= 0.7) confidenceClass = 'confidence-high';
    else if (confidence >= 0.4) confidenceClass = 'confidence-medium';
    return {
      className: `field-comparison-badge ${confidenceClass}`,
      text: `${Math.round(confidence * 100)}%`,
    };
  };

  const diffBadge = getDiffBadge();
  const confidenceBadge = getConfidenceBadge();
  const badge = diffBadge || confidenceBadge;

  return (
    <div
      className={`field-comparison-row ${isLocked ? 'locked' : ''} ${isSelected ? 'selected' : ''}`}
    >
      <div className="field-comparison-checkbox">
        <input
          type="checkbox"
          id={`field-${fieldName}`}
          checked={isSelected}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={isDisabled}
        />
        <label htmlFor={`field-${fieldName}`}>
          {isLocked && (
            <svg
              className="field-comparison-lock-icon"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M10.5 6.417V4.667a3.5 3.5 0 1 0-7 0v1.75M4.083 12.833h5.834a1.167 1.167 0 0 0 1.166-1.166V7.583a1.167 1.167 0 0 0-1.166-1.166H4.083a1.167 1.167 0 0 0-1.166 1.166v4.084a1.167 1.167 0 0 0 1.166 1.166Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {label}
        </label>
      </div>

      {badge && (
        <div className={badge.className}>
          {badge.text}
        </div>
      )}

      <div className="field-comparison-values">
        {coverPreview ? (
          <div className="field-comparison-cover">
            <div className="field-comparison-cover-item current">
              <span className="field-comparison-cover-label">Current</span>
              {coverPreview.currentUrl ? (
                <img
                  src={coverPreview.currentUrl}
                  alt="Current cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="field-comparison-no-cover">No cover</div>
              )}
            </div>
            <div className="field-comparison-arrow">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M4 10H16M16 10L11 5M16 10L11 15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="field-comparison-cover-item proposed">
              <span className="field-comparison-cover-label">Proposed</span>
              {coverPreview.proposedUrl ? (
                <img
                  src={coverPreview.proposedUrl}
                  alt="Proposed cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="field-comparison-no-cover">No cover</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="field-comparison-value current">
              <span className="field-comparison-value-label">Current:</span>
              <span className="field-comparison-value-text">
                {displayValue(currentValue)}
              </span>
            </div>
            <div className="field-comparison-value proposed">
              <span className="field-comparison-value-label">Proposed:</span>
              <span className="field-comparison-value-text">
                {displayValue(proposedValue)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
