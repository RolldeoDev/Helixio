/**
 * ScanStep Component
 *
 * Third step of the setup wizard. Shows library scan progress.
 * Scan runs in background - user can skip at any time.
 */

import { useEffect, useRef, useState } from 'react';
import { useLibraryScan } from '../../contexts/LibraryScanContext';
import type { LibraryScanJob } from '../../services/api.service';
import { truncatePath } from '../../utils/format';
import './SetupWizard.css';

interface ScanStepProps {
  libraryId: string;
  onNext: () => void;
  onSkip: () => void;
}

export function ScanStep({ libraryId, onNext, onSkip }: ScanStepProps) {
  const {
    getActiveScan,
    getScanProgress,
    getScanStageLabel,
    startScan,
    hasActiveScan,
    error: contextError,
  } = useLibraryScan();

  // Track whether we've already initiated a scan for this library
  // This prevents re-starting after the scan completes and gets cleared from activeScans
  const scanInitiatedRef = useRef<string | null>(null);

  // Store the final scan result when complete, so we keep showing it
  // even after the scan is cleared from activeScans (after 5 second timeout)
  const [completedScan, setCompletedScan] = useState<LibraryScanJob | null>(null);

  const activeScan = getActiveScan(libraryId);

  // Use completed scan data if we have it and active scan was cleared
  const displayScan = activeScan || completedScan;
  const progress = displayScan ? getScanProgress(displayScan) : 0;
  const stageLabel = displayScan ? getScanStageLabel(displayScan.status) : 'Preparing...';
  const isComplete = displayScan?.status === 'complete';
  const hasError = displayScan?.status === 'error' || (!displayScan && contextError);

  // Capture the completed scan state before it gets cleared from context
  useEffect(() => {
    if (activeScan?.status === 'complete' && !completedScan) {
      setCompletedScan(activeScan);
    }
  }, [activeScan, completedScan]);

  // Start scan on mount if not already running
  // Only starts once per libraryId to prevent re-triggering after completion
  useEffect(() => {
    // Skip if we've already initiated a scan for this library
    if (scanInitiatedRef.current === libraryId) {
      return;
    }

    // Skip if we already have a completed scan recorded
    if (completedScan) {
      scanInitiatedRef.current = libraryId;
      return;
    }

    // Skip if there's already an active scan
    if (hasActiveScan(libraryId)) {
      scanInitiatedRef.current = libraryId;
      return;
    }

    // Mark as initiated and start the scan
    scanInitiatedRef.current = libraryId;
    startScan(libraryId);
  }, [libraryId, hasActiveScan, startScan, completedScan]);

  const getStatusMessage = () => {
    // Handle context-level error (e.g., startScan failed)
    if (!displayScan && contextError) {
      return contextError;
    }
    if (!displayScan) return 'Starting scan...';
    // Display actual error message from scan job
    if (hasError) {
      return displayScan.error || 'Scan encountered an error';
    }
    if (isComplete) {
      const { discoveredFiles, seriesCreated } = displayScan;
      return `Found ${discoveredFiles} comic${discoveredFiles !== 1 ? 's' : ''} in ${seriesCreated} series`;
    }
    // Show folder progress during active scan
    if (displayScan.foldersTotal && displayScan.foldersTotal > 0) {
      return `${stageLabel} • Folder ${displayScan.foldersComplete || 0} of ${displayScan.foldersTotal}`;
    }
    return stageLabel;
  };

  return (
    <div className="setup-step scan-step">
      <div className="step-header">
        <h2>Scanning Your Library</h2>
        <p className="step-subtitle">
          Helixio is scanning your library to discover and organize your comics.
          This happens in the background - you can continue to the next step.
        </p>
      </div>

      <div className="scan-progress-container">
        <div className="scan-status">
          <div className={`scan-icon ${isComplete ? 'complete' : hasError ? 'error' : 'scanning'}`}>
            {isComplete ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : hasError ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            ) : (
              <div className="spinner" />
            )}
          </div>
          <span className="scan-message">{getStatusMessage()}</span>
        </div>

        <div className="scan-progress-bar">
          <div
            className="scan-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="scan-stats">
          {displayScan && !hasError && (
            <>
              <div className="scan-stat">
                <span className="scan-stat-value">{displayScan.indexedFiles || 0}</span>
                <span className="scan-stat-label">Files Processed</span>
              </div>
              {(displayScan.foldersTotal ?? 0) > 0 && (
                <div className="scan-stat">
                  <span className="scan-stat-value">
                    {displayScan.foldersComplete || 0}/{displayScan.foldersTotal}
                  </span>
                  <span className="scan-stat-label">Folders</span>
                </div>
              )}
              <div className="scan-stat">
                <span className="scan-stat-value">{displayScan.coversExtracted || 0}</span>
                <span className="scan-stat-label">Covers</span>
              </div>
              <div className="scan-stat">
                <span className="scan-stat-value">{displayScan.seriesCreated || 0}</span>
                <span className="scan-stat-label">Series</span>
              </div>
            </>
          )}
        </div>

        {/* Current folder being processed */}
        {displayScan && displayScan.currentFolder && !hasError && !isComplete && (
          <div className="scan-current-folder">
            <span className="scan-current-folder-label">Scanning:</span>
            <span className="scan-current-folder-path">
              {truncatePath(displayScan.currentFolder)}
            </span>
          </div>
        )}

        <p className="scan-hint">
          The scan will continue in the background even if you proceed to the next step.
        </p>
      </div>

      <div className="step-actions">
        <button className="btn-primary btn-lg" onClick={onNext}>
          {isComplete ? 'Continue' : 'Continue (scan in background)'}
        </button>
        <button className="btn-text" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
