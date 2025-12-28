/**
 * HoverPreviewCard Component
 *
 * A floating preview card that displays file match details and field changes.
 * Appears on hover (desktop) or tap (touch) when viewing the compact file list.
 *
 * Features:
 * - Viewport-aware positioning (flips when near edges)
 * - Shows match info, confidence, and all field changes
 * - Quick action buttons for common operations
 * - Keyboard dismissible (Escape)
 */

import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { type FileChange, type FieldChange } from '../../services/api.service';
import './HoverPreviewCard.css';

/**
 * Check if a value is effectively empty (null, undefined, or empty string)
 */
function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Check if a field change is a meaningful change (not empty-to-empty)
 */
function hasMeaningfulChange(proposed: unknown, current: unknown): boolean {
  if (isEmptyValue(proposed) && isEmptyValue(current)) {
    return false;
  }
  return proposed !== current;
}

interface HoverPreviewCardProps {
  fileChange: FileChange;
  anchorRect: DOMRect | null;
  isVisible: boolean;
  onAcceptAll: (fileId: string) => void;
  onSwitchMatch: (fileId: string) => void;
  onReject: (fileId: string) => void;
  onClose: () => void;
  disabled?: boolean;
}

export function HoverPreviewCard({
  fileChange,
  anchorRect,
  isVisible,
  onAcceptAll,
  onSwitchMatch,
  onReject,
  onClose,
  disabled = false,
}: HoverPreviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, flipHorizontal: false, flipVertical: false });
  const [isPositioned, setIsPositioned] = useState(false);

  // Calculate position based on anchor and viewport
  const updatePosition = useCallback(() => {
    if (!anchorRect || !cardRef.current) {
      setIsPositioned(false);
      return;
    }

    const card = cardRef.current;
    const cardRect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;

    // Default: position to the right of the anchor, vertically centered
    let left = anchorRect.right + gap;
    let top = anchorRect.top + (anchorRect.height / 2) - (cardRect.height / 2);
    let flipHorizontal = false;
    let flipVertical = false;

    // Check if card would overflow right edge
    if (left + cardRect.width > viewportWidth - gap) {
      // Position to the left of anchor instead
      left = anchorRect.left - cardRect.width - gap;
      flipHorizontal = true;
    }

    // Check if card would overflow left edge (after flip)
    if (left < gap) {
      left = gap;
    }

    // Check vertical overflow
    if (top < gap) {
      top = gap;
      flipVertical = true;
    }
    if (top + cardRect.height > viewportHeight - gap) {
      top = viewportHeight - cardRect.height - gap;
      flipVertical = true;
    }

    setPosition({ top, left, flipHorizontal, flipVertical });
    setIsPositioned(true);
  }, [anchorRect]);

  // Update position when visible or anchor changes
  // Use useLayoutEffect to calculate position before paint, preventing visual jump
  useLayoutEffect(() => {
    if (isVisible) {
      updatePosition();
    } else {
      setIsPositioned(false);
    }
  }, [isVisible, anchorRect, updatePosition]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible, onClose]);

  // Helpers
  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'matched': return '\u2713';
      case 'unmatched': return '?';
      case 'rejected': return '\u2717';
      case 'manual': return '\u270E';
      default: return '\u25CB';
    }
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'matched': return 'status-matched';
      case 'unmatched': return 'status-unmatched';
      case 'rejected': return 'status-rejected';
      case 'manual': return 'status-manual';
      default: return '';
    }
  };

  const getConfidenceClass = (confidence: number): string => {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const formatFieldName = (field: string): string => {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  // Get field changes that have actual differences (excluding empty-to-empty)
  const changedFields = Object.entries(fileChange.fields).filter(
    ([, fc]) => hasMeaningfulChange(fc.proposed, fc.current)
  );

  const approvedCount = changedFields.filter(([, fc]) => fc.approved).length;
  const hasAllApproved = approvedCount === changedFields.length && changedFields.length > 0;

  return (
    <div
      ref={cardRef}
      className={`hover-preview-card ${isVisible ? 'visible' : ''}`}
      style={{
        top: position.top,
        left: position.left,
        // Hide card until position is calculated to prevent visual jump
        visibility: isPositioned ? 'visible' : 'hidden',
      }}
      role="tooltip"
      aria-label={`Preview for ${fileChange.filename}`}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="preview-header">
        <div className="preview-status-row">
          <span className={`preview-status-icon ${getStatusClass(fileChange.status)}`}>
            {getStatusIcon(fileChange.status)}
          </span>
          <span className="preview-status-text">{fileChange.status}</span>
          {fileChange.matchConfidence > 0 && (
            <span className={`preview-confidence ${getConfidenceClass(fileChange.matchConfidence)}`}>
              {Math.round(fileChange.matchConfidence * 100)}%
            </span>
          )}
        </div>
        <h3 className="preview-filename" title={fileChange.filename}>
          {fileChange.filename}
        </h3>
      </div>

      {/* Match Info */}
      <div className={`preview-match-section ${fileChange.matchedIssue ? '' : 'unmatched'}`}>
        {fileChange.matchedIssue ? (
          <>
            <span className="match-label">Matched to</span>
            <span className="match-value">
              <strong>#{fileChange.matchedIssue.number}</strong>
              {fileChange.matchedIssue.title && (
                <> &mdash; {fileChange.matchedIssue.title}</>
              )}
            </span>
            {fileChange.matchedIssue.coverDate && (
              <span className="match-date">{fileChange.matchedIssue.coverDate}</span>
            )}
          </>
        ) : (
          <span className="no-match-warning">No match found</span>
        )}
      </div>

      {/* Field Changes */}
      {fileChange.status !== 'rejected' && changedFields.length > 0 ? (
        <div className="preview-changes-section">
          <div className="changes-header">
            <span className="changes-title">Changes</span>
            <span className="changes-count">
              {approvedCount}/{changedFields.length} approved
            </span>
          </div>
          <div className="changes-list">
            {changedFields.map(([field, fieldChange]: [string, FieldChange]) => {
              const displayValue = fieldChange.edited
                ? fieldChange.editedValue
                : fieldChange.proposed;

              // Truncate long values for display
              const truncateValue = (val: string | number | null | undefined): string => {
                if (val === null || val === undefined) return '';
                const str = String(val);
                return str.length > 50 ? str.substring(0, 47) + '...' : str;
              };

              return (
                <div
                  key={field}
                  className={`change-row ${fieldChange.approved ? 'approved' : 'not-approved'}`}
                  title={`${fieldChange.current ?? 'empty'} → ${displayValue ?? 'empty'}`}
                >
                  <span className="change-field">{formatFieldName(field)}</span>
                  <span className="change-value">
                    <span className="current-value">
                      {fieldChange.current ? truncateValue(fieldChange.current) : <em>empty</em>}
                    </span>
                    <span className="change-arrow">&rarr;</span>
                    <span className="proposed-value">
                      {displayValue ? truncateValue(displayValue) : <em>empty</em>}
                    </span>
                  </span>
                  <span className={`change-status ${fieldChange.approved ? 'on' : 'off'}`}>
                    {fieldChange.approved ? '\u2713' : '\u25CB'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : fileChange.status === 'rejected' ? (
        <div className="preview-rejected-notice">
          This file has been rejected. No changes will be applied.
        </div>
      ) : (
        <div className="preview-no-changes">
          No metadata changes to apply.
        </div>
      )}

      {/* Actions */}
      <div className="preview-actions">
        {fileChange.status !== 'rejected' ? (
          <>
            {changedFields.length > 0 && !hasAllApproved && (
              <button
                className="btn-sm btn-primary"
                onClick={() => onAcceptAll(fileChange.fileId)}
                disabled={disabled}
              >
                Accept All
              </button>
            )}
            <button
              className="btn-sm btn-secondary"
              onClick={() => onSwitchMatch(fileChange.fileId)}
              disabled={disabled}
            >
              {fileChange.matchedIssue ? 'Switch Match' : 'Find Match'}
            </button>
            <button
              className="btn-sm btn-ghost btn-danger-text"
              onClick={() => onReject(fileChange.fileId)}
              disabled={disabled}
            >
              Reject
            </button>
          </>
        ) : (
          <button
            className="btn-sm btn-primary"
            onClick={() => onAcceptAll(fileChange.fileId)}
            disabled={disabled}
          >
            Restore File
          </button>
        )}
      </div>
    </div>
  );
}

export default HoverPreviewCard;
