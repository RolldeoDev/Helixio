/**
 * ScanStep Component
 *
 * Third step of the setup wizard. Shows library scan progress.
 * Scan runs in background - user can skip at any time.
 */

import { useEffect } from 'react';
import { useLibraryScan } from '../../contexts/LibraryScanContext';
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
  } = useLibraryScan();

  const activeScan = getActiveScan(libraryId);
  const progress = activeScan ? getScanProgress(activeScan) : 0;
  const stageLabel = activeScan ? getScanStageLabel(activeScan.status) : 'Preparing...';
  const isComplete = activeScan?.status === 'complete';
  const hasError = activeScan?.status === 'error';

  // Start scan on mount if not already running
  useEffect(() => {
    if (!hasActiveScan(libraryId)) {
      startScan(libraryId);
    }
  }, [libraryId, hasActiveScan, startScan]);

  const getStatusMessage = () => {
    if (!activeScan) return 'Starting scan...';
    if (hasError) return 'Scan encountered an error';
    if (isComplete) {
      const { discoveredFiles, seriesCreated } = activeScan;
      return `Found ${discoveredFiles} comic${discoveredFiles !== 1 ? 's' : ''} in ${seriesCreated} series`;
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
          {activeScan && !hasError && (
            <>
              <div className="scan-stat">
                <span className="scan-stat-value">{activeScan.discoveredFiles || 0}</span>
                <span className="scan-stat-label">Files Found</span>
              </div>
              <div className="scan-stat">
                <span className="scan-stat-value">{activeScan.seriesCreated || 0}</span>
                <span className="scan-stat-label">Series</span>
              </div>
              {activeScan.coversExtracted > 0 && (
                <div className="scan-stat">
                  <span className="scan-stat-value">{activeScan.coversExtracted}</span>
                  <span className="scan-stat-label">Covers</span>
                </div>
              )}
            </>
          )}
        </div>

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
