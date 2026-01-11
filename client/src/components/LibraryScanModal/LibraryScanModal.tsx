/**
 * Library Scan Modal
 *
 * Wrapper component that displays scan details using the unified JobDetailPanel.
 * Maintains backward compatibility with existing usage while providing
 * a consistent experience across all job types.
 */

import { useLibraryScan } from '../../contexts/LibraryScanContext';
import { JobDetailPanel } from '../UnifiedJobsPanel/JobDetailPanel/JobDetailPanel';

// =============================================================================
// Types
// =============================================================================

interface LibraryScanModalProps {
  libraryId: string;
  libraryName: string;
  onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function LibraryScanModal({ libraryId, libraryName, onClose }: LibraryScanModalProps) {
  const { getActiveScan } = useLibraryScan();

  const scan = getActiveScan(libraryId);

  if (!scan) {
    // No active scan - show a simple message and close button
    return (
      <div className="job-detail-backdrop" onClick={onClose}>
        <div className="job-detail-panel" onClick={(e) => e.stopPropagation()}>
          <div className="panel-header">
            <div className="panel-title-section">
              <h2 className="panel-title">Library Scan: {libraryName}</h2>
              <p className="panel-subtitle">No active scan</p>
            </div>
            <button className="panel-close-btn" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="panel-body">
            <div className="panel-empty">
              No active scan for this library.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Use unified JobDetailPanel for consistent experience
  return (
    <JobDetailPanel
      jobType="library-scan"
      jobId={scan.id}
      onClose={onClose}
    />
  );
}

export default LibraryScanModal;
