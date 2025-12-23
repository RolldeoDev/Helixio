/**
 * Library Scan Modal
 *
 * Displays the progress of a library scan job with stage indicators,
 * progress bar, and log viewer.
 */

import { useMemo } from 'react';
import { useLibraryScan } from '../../contexts/LibraryScanContext';
import type { ScanJobStatus } from '../../services/api.service';
import './LibraryScanModal.css';

// =============================================================================
// Types
// =============================================================================

interface LibraryScanModalProps {
  libraryId: string;
  libraryName: string;
  onClose: () => void;
}

interface StageInfo {
  key: ScanJobStatus;
  label: string;
  icon: string;
}

// =============================================================================
// Constants
// =============================================================================

const STAGES: StageInfo[] = [
  { key: 'discovering', label: 'Discovering', icon: '🔍' },
  { key: 'cleaning', label: 'Cleaning', icon: '🧹' },
  { key: 'indexing', label: 'Indexing', icon: '📄' },
  { key: 'linking', label: 'Linking', icon: '🔗' },
  { key: 'covers', label: 'Covers', icon: '🖼️' },
];

const STAGE_ORDER: ScanJobStatus[] = [
  'queued',
  'discovering',
  'cleaning',
  'indexing',
  'linking',
  'covers',
  'complete',
];

// =============================================================================
// Component
// =============================================================================

export function LibraryScanModal({ libraryId, libraryName, onClose }: LibraryScanModalProps) {
  const { getActiveScan, getScanProgress, getScanStageLabel, cancelScan } = useLibraryScan();

  const scan = getActiveScan(libraryId);
  const progress = scan ? getScanProgress(scan) : 0;

  const isComplete = scan?.status === 'complete';
  const isError = scan?.status === 'error';
  const isCancelled = scan?.status === 'cancelled';
  const isTerminal = isComplete || isError || isCancelled;

  const currentStageIndex = scan ? STAGE_ORDER.indexOf(scan.status) : -1;

  const handleCancel = async () => {
    if (scan && !isTerminal) {
      await cancelScan(libraryId, scan.id);
    }
  };

  // Get stats summary
  const stats = useMemo(() => {
    if (!scan) return null;
    return {
      files: scan.totalFiles || scan.discoveredFiles,
      indexed: scan.indexedFiles,
      linked: scan.linkedFiles,
      series: scan.seriesCreated,
      covers: scan.coversExtracted,
      orphaned: scan.orphanedFiles,
      errors: scan.errorCount,
    };
  }, [scan]);

  if (!scan) {
    return (
      <div className="library-scan-modal-overlay" onClick={onClose}>
        <div className="library-scan-modal" onClick={(e) => e.stopPropagation()}>
          <div className="library-scan-modal-header">
            <h2>Library Scan</h2>
            <button className="library-scan-modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="library-scan-modal-content">
            <p className="library-scan-modal-no-scan">No active scan for this library.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="library-scan-modal-overlay" onClick={onClose}>
      <div className="library-scan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="library-scan-modal-header">
          <h2>Scanning: {libraryName}</h2>
          <button className="library-scan-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="library-scan-modal-content">
          {/* Stage Progress */}
          <div className="library-scan-stages">
            {STAGES.map((stage) => {
              const stageIndex = STAGE_ORDER.indexOf(stage.key);
              const isCurrentStage = scan.status === stage.key;
              const isCompletedStage = currentStageIndex > stageIndex;
              const isPendingStage = currentStageIndex < stageIndex;

              return (
                <div
                  key={stage.key}
                  className={`library-scan-stage ${isCurrentStage ? 'active' : ''} ${
                    isCompletedStage ? 'completed' : ''
                  } ${isPendingStage ? 'pending' : ''}`}
                >
                  <div className="library-scan-stage-icon">
                    {isCompletedStage ? '✓' : stage.icon}
                  </div>
                  <div className="library-scan-stage-label">{stage.label}</div>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="library-scan-progress-container">
            <div className="library-scan-progress-bar">
              <div
                className={`library-scan-progress-fill ${isError ? 'error' : ''} ${
                  isComplete ? 'complete' : ''
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="library-scan-progress-text">{progress}%</div>
          </div>

          {/* Current Status */}
          <div className="library-scan-status">
            <div className="library-scan-status-stage">
              {getScanStageLabel(scan.status)}
              {!isTerminal && <span className="library-scan-spinner" />}
            </div>
            {scan.currentMessage && (
              <div className="library-scan-status-message">{scan.currentMessage}</div>
            )}
            {scan.currentDetail && (
              <div className="library-scan-status-detail">{scan.currentDetail}</div>
            )}
          </div>

          {/* Stats */}
          {stats && (
            <div className="library-scan-stats">
              <div className="library-scan-stat">
                <span className="library-scan-stat-value">{stats.files}</span>
                <span className="library-scan-stat-label">Files</span>
              </div>
              <div className="library-scan-stat">
                <span className="library-scan-stat-value">{stats.indexed}</span>
                <span className="library-scan-stat-label">Indexed</span>
              </div>
              <div className="library-scan-stat">
                <span className="library-scan-stat-value">{stats.linked}</span>
                <span className="library-scan-stat-label">Linked</span>
              </div>
              <div className="library-scan-stat">
                <span className="library-scan-stat-value">{stats.series}</span>
                <span className="library-scan-stat-label">Series</span>
              </div>
              <div className="library-scan-stat">
                <span className="library-scan-stat-value">{stats.covers}</span>
                <span className="library-scan-stat-label">Covers</span>
              </div>
              {stats.orphaned > 0 && (
                <div className="library-scan-stat warning">
                  <span className="library-scan-stat-value">{stats.orphaned}</span>
                  <span className="library-scan-stat-label">Orphaned</span>
                </div>
              )}
              {stats.errors > 0 && (
                <div className="library-scan-stat error">
                  <span className="library-scan-stat-value">{stats.errors}</span>
                  <span className="library-scan-stat-label">Errors</span>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {isError && scan.error && (
            <div className="library-scan-error">
              <strong>Error:</strong> {scan.error}
            </div>
          )}

          {/* Complete Message */}
          {isComplete && (
            <div className="library-scan-complete">
              Scan completed successfully!
            </div>
          )}

          {/* Cancelled Message */}
          {isCancelled && (
            <div className="library-scan-cancelled">
              Scan was cancelled.
            </div>
          )}
        </div>

        <div className="library-scan-modal-footer">
          {!isTerminal && (
            <button className="library-scan-cancel-btn" onClick={handleCancel}>
              Cancel Scan
            </button>
          )}
          <button className="library-scan-close-btn" onClick={onClose}>
            {isTerminal ? 'Close' : 'Hide'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LibraryScanModal;
