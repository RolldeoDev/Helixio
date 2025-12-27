/**
 * MetadataApprovalModal Component
 *
 * Multi-step wizard for metadata approval with sidebar navigation:
 * 1. Options - Configure job settings
 * 2. Initialize - Load and parse files
 * 3. Series approval - Match files to series
 * 4. File review - Review and approve field changes
 * 5. Apply - Write metadata to files
 * 6. Complete - Summary
 *
 * Uses MetadataJobContext for persistent state that survives modal close.
 * Features sidebar navigation to view past step logs.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMetadataJob, type JobStep, type StepLogEntry } from '../../contexts/MetadataJobContext';
import { SeriesApprovalStep } from './SeriesApprovalStep';
import { FileReviewStep } from './FileReviewStep';
import { StepSidebar, type StepId } from './StepSidebar';
import { getIndexedFilesInfo, type IndexedFilesInfo } from '../../services/api.service';
import './MetadataApproval.css';

export function MetadataApprovalModal() {
  const {
    step,
    session,
    jobId,
    stepLogs,
    completedSteps,
    error,
    fileIds,
    options,
    applyResult,
    applyProgress,
    setOptions,
    beginSession,
    closeModal,
    cancelJob,
    abandonJob,
    updateSession,
    completeJob,
    applyChanges,
    resetSeriesSelection,
  } = useMetadataJob();

  const [viewingStep, setViewingStep] = useState<StepId | null>(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true); // Track if user is scrolled to bottom

  // Indexed files state for the re-search option
  const [indexedFilesInfo, setIndexedFilesInfo] = useState<IndexedFilesInfo | null>(null);
  const [indexedFilesExpanded, setIndexedFilesExpanded] = useState(false);
  const [excludedFileIds, setExcludedFileIds] = useState<Set<string>>(new Set());
  const [loadingIndexedFiles, setLoadingIndexedFiles] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Fetch indexed files info when entering options step
  useEffect(() => {
    if (step === 'options' && fileIds.length > 0 && !indexedFilesInfo && !loadingIndexedFiles) {
      setLoadingIndexedFiles(true);
      getIndexedFilesInfo(fileIds)
        .then((info) => {
          setIndexedFilesInfo(info);
          // By default, exclude all indexed files (they're already searched)
          setExcludedFileIds(new Set(info.indexedFileIds));
        })
        .catch((err) => {
          console.error('Failed to fetch indexed files info:', err);
        })
        .finally(() => {
          setLoadingIndexedFiles(false);
        });
    }
  }, [step, fileIds, indexedFilesInfo, loadingIndexedFiles]);

  // Reset indexed files state when fileIds change (new job started)
  useEffect(() => {
    setIndexedFilesInfo(null);
    setExcludedFileIds(new Set());
    setIndexedFilesExpanded(false);
  }, [fileIds]);

  // Handler to toggle exclusion of all indexed files
  const handleToggleExcludeAll = useCallback(() => {
    if (!indexedFilesInfo) return;

    if (excludedFileIds.size === indexedFilesInfo.indexedFileIds.length) {
      // Currently all excluded, so include all (re-search all)
      setExcludedFileIds(new Set());
    } else {
      // Exclude all indexed files
      setExcludedFileIds(new Set(indexedFilesInfo.indexedFileIds));
    }
  }, [indexedFilesInfo, excludedFileIds]);

  // Handler to toggle individual file exclusion
  const handleToggleFileExclusion = useCallback((fileId: string) => {
    setExcludedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  // Compute the files that will actually be processed
  const filesToProcess = fileIds.filter((id) => !excludedFileIds.has(id));

  // Get logs from stepLogs (single source of truth)
  const initLogs = stepLogs.initializing || [];
  const applyLogs = stepLogs.applying || [];
  const fetchingLogs = stepLogs.fetching_issues || [];

  // Get current step's logs for the log panel
  const getCurrentLogs = (): StepLogEntry[] => {
    if (viewingStep) {
      return stepLogs[viewingStep as JobStep] || [];
    }
    switch (step) {
      case 'initializing':
        return initLogs;
      case 'fetching_issues':
        return fetchingLogs;
      case 'applying':
        return applyLogs;
      default:
        return stepLogs[step as JobStep] || [];
    }
  };

  const currentLogs = getCurrentLogs();

  // Handle scroll in log container to track if user is at bottom
  const handleLogScroll = useCallback(() => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      // Consider "at bottom" if within 50px of the bottom
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      isUserAtBottomRef.current = isAtBottom;
    }
  }, []);

  // Auto-scroll logs to bottom only if user is already at bottom
  useEffect(() => {
    if (logContainerRef.current && logsExpanded && isUserAtBottomRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentLogs, logsExpanded]);

  // Reset viewing step when current step changes
  useEffect(() => {
    setViewingStep(null);
  }, [step]);

  const handleClose = () => {
    closeModal();
  };

  const handleCancel = async () => {
    await cancelJob();
  };

  const handleAbandon = async () => {
    setShowAbandonConfirm(false);
    await abandonJob();
  };

  const handleSeriesComplete = async () => {
    // Session is already being updated via context
  };

  // Handler to start the session with excluded files
  const handleBeginSession = useCallback(async () => {
    // Update options with excluded file IDs before starting
    const excludeArray = Array.from(excludedFileIds);
    if (excludeArray.length > 0) {
      await setOptions({ ...options, excludeFileIds: excludeArray });
    }
    await beginSession();
  }, [excludedFileIds, options, setOptions, beginSession]);

  const handleStartApply = () => {
    applyChanges();
  };

  const handleDone = () => {
    completeJob();
  };

  const handleStepClick = (clickedStep: StepId) => {
    if (clickedStep !== step) {
      setViewingStep(clickedStep);
      setLogsExpanded(true);
    } else {
      setViewingStep(null);
    }
  };

  const handleBackToCurrent = () => {
    setViewingStep(null);
  };

  const handleNavigateToStep = async (targetStep: StepId, seriesGroupIndex?: number) => {
    // Currently only series_approval navigation is supported
    if (targetStep === 'series_approval') {
      try {
        // Reset to the specified series group (defaults to 0)
        await resetSeriesSelection(seriesGroupIndex ?? 0);
        setViewingStep(null);
      } catch (err) {
        console.error('Failed to navigate to series selection:', err);
      }
    }
  };

  const getStepTitle = (): string => {
    if (viewingStep) {
      return getStepLabel(viewingStep) + ' Log';
    }
    switch (step) {
      case 'options':
        return 'Metadata Options';
      case 'initializing':
        return 'Initializing...';
      case 'series_approval':
        return `Series Approval (${(session?.currentSeriesIndex ?? 0) + 1} of ${session?.seriesGroups?.length ?? 0})`;
      case 'fetching_issues':
        return 'Fetching Issues...';
      case 'file_review':
        return 'Review Changes';
      case 'applying':
        return 'Applying Changes...';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
    }
  };

  const getStepLabel = (stepId: StepId): string => {
    switch (stepId) {
      case 'options':
        return 'Options';
      case 'initializing':
        return 'Initialization';
      case 'series_approval':
        return 'Series Approval';
      case 'fetching_issues':
        return 'Fetching Issues';
      case 'file_review':
        return 'File Review';
      case 'applying':
        return 'Applying';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Determine if we can minimize (close modal but keep job running)
  const canMinimize = step !== 'options' && step !== 'complete' && step !== 'error';

  // Show logs panel for certain steps
  const showLogsPanel = ['initializing', 'fetching_issues', 'applying'].includes(step) || viewingStep !== null;

  // Render the current step content
  const renderCurrentStep = () => {
    // If viewing a past step's logs, show the log view
    if (viewingStep) {
      const logs = stepLogs[viewingStep as JobStep] || [];
      return (
        <div className="step-history-view">
          <div className="step-history-header">
            <h3>{getStepLabel(viewingStep)} Log</h3>
            <button className="btn-secondary btn-sm" onClick={handleBackToCurrent}>
              Back to Current
            </button>
          </div>
          {logs.length === 0 ? (
            <div className="step-history-empty">
              <p>No logs recorded for this step.</p>
            </div>
          ) : (
            <div className="log-list-full">
              {logs.map((log: StepLogEntry, index: number) => (
                <div key={index} className={`log-entry ${log.type || 'info'}`}>
                  <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                  <span className="log-message">{log.message}</span>
                  {log.detail && <span className="log-detail">{log.detail}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    switch (step) {
      case 'options': {
        const indexedCount = indexedFilesInfo?.indexedCount ?? 0;
        const excludedCount = excludedFileIds.size;
        const allIndexedExcluded = indexedCount > 0 && excludedCount === indexedCount;
        const someIndexedExcluded = excludedCount > 0 && excludedCount < indexedCount;

        return (
          <div className="approval-options">
            <div className="options-summary">
              <p>
                Ready to fetch metadata for{' '}
                <strong>
                  {filesToProcess.length} file{filesToProcess.length !== 1 ? 's' : ''}
                </strong>
                {excludedCount > 0 && (
                  <span className="text-muted">
                    {' '}({excludedCount} already-indexed file{excludedCount !== 1 ? 's' : ''} excluded)
                  </span>
                )}
              </p>
            </div>

            <div className="options-form">
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={options.useLLMCleanup ?? false}
                  onChange={(e) => setOptions({ ...options, useLLMCleanup: e.target.checked })}
                />
                <span className="option-label">
                  <strong>LLM Cleanup</strong>
                  <span className="option-description">
                    Use Claude AI to intelligently parse filenames and clean up series/book names before searching. Recommended for files with messy or complex naming.
                  </span>
                </span>
              </label>

              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={options.mixedSeries ?? false}
                  onChange={(e) => setOptions({ ...options, mixedSeries: e.target.checked })}
                />
                <span className="option-label">
                  <strong>Mixed Series</strong>
                  <span className="option-description">
                    Folder contains multiple series. Each file will be parsed individually and existing series.json will be ignored. Use when a folder has comics from different series.
                  </span>
                </span>
              </label>

              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={options.searchMode === 'full'}
                  onChange={(e) => setOptions({ ...options, searchMode: e.target.checked ? 'full' : 'quick' })}
                />
                <span className="option-label">
                  <strong>Full Data Mode</strong>
                  <span className="option-description">
                    Search all enabled metadata sources (ComicVine, Metron) and merge results for richer data. When disabled, only the primary source is searched (faster).
                  </span>
                </span>
              </label>

              {/* Indexed files exclusion option */}
              {loadingIndexedFiles && (
                <div className="option-loading">
                  <span className="spinner-small" /> Checking for already-indexed files...
                </div>
              )}

              {indexedFilesInfo && indexedCount > 0 && (
                <div className="indexed-files-option">
                  <label className="option-checkbox">
                    <input
                      type="checkbox"
                      checked={!allIndexedExcluded}
                      ref={(el) => {
                        if (el) el.indeterminate = someIndexedExcluded;
                      }}
                      onChange={handleToggleExcludeAll}
                    />
                    <span className="option-label">
                      <strong>Re-search already indexed files</strong>
                      <span className="option-description">
                        {indexedCount} file{indexedCount !== 1 ? 's have' : ' has'} already been indexed with metadata.
                        {allIndexedExcluded
                          ? ' Check to re-search them for updated metadata.'
                          : ' Uncheck to skip files that already have metadata.'}
                      </span>
                    </span>
                  </label>

                  {/* Expandable list of indexed files */}
                  <div className="indexed-files-expand">
                    <button
                      className="btn-text-small"
                      onClick={() => setIndexedFilesExpanded(!indexedFilesExpanded)}
                    >
                      {indexedFilesExpanded ? '▼' : '▶'} {indexedFilesExpanded ? 'Hide' : 'Show'} individual files
                    </button>
                  </div>

                  {indexedFilesExpanded && (
                    <div className="indexed-files-list">
                      {indexedFilesInfo.files
                        .filter((f) => f.isIndexed)
                        .map((file) => (
                          <label key={file.id} className="indexed-file-item">
                            <input
                              type="checkbox"
                              checked={!excludedFileIds.has(file.id)}
                              onChange={() => handleToggleFileExclusion(file.id)}
                            />
                            <span className="indexed-file-name" title={file.filename}>
                              {file.filename}
                            </span>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="options-footer">
              <button className="btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleBeginSession}
                disabled={filesToProcess.length === 0}
              >
                {filesToProcess.length === 0 ? 'No files to process' : 'Start'}
              </button>
            </div>
          </div>
        );
      }

      case 'initializing':
        return (
          <div className="step-content-centered">
            <div className="progress-display">
              <div className="spinner-large" />
              <h3>Processing {fileIds.length} files...</h3>
              <p className="progress-hint">Progress details shown below</p>
            </div>
          </div>
        );

      case 'series_approval':
        if (!session) {
          return (
            <div className="step-content-centered">
              <div className="spinner" />
              <p>Loading session data...</p>
            </div>
          );
        }
        return (
          <SeriesApprovalStep
            session={session}
            onSessionUpdate={updateSession}
            onComplete={handleSeriesComplete}
          />
        );

      case 'fetching_issues':
        return (
          <div className="step-content-centered">
            <div className="progress-display">
              <div className="spinner-large" />
              <h3>Fetching Issue Details</h3>
              <p className="progress-hint">Matching files to issues...</p>
            </div>
          </div>
        );

      case 'file_review':
        if (!session) {
          return (
            <div className="step-content-centered">
              <div className="spinner" />
              <p>Loading file review data...</p>
            </div>
          );
        }
        return (
          <FileReviewStep
            session={session}
            jobId={jobId}
            onStartApply={handleStartApply}
            onCancel={handleCancel}
            onChangeSeriesSelection={(seriesGroupIndex) => handleNavigateToStep('series_approval', seriesGroupIndex)}
            applying={false}
          />
        );

      case 'applying': {
        const phaseLabels: Record<string, string> = {
          idle: 'Starting...',
          converting: 'Converting CBR to CBZ',
          applying: 'Writing Metadata',
          creating_series_json: 'Creating Series Files',
          complete: 'Finishing...',
        };
        const progressPercent = applyProgress.total > 0
          ? Math.round((applyProgress.current / applyProgress.total) * 100)
          : 0;

        return (
          <div className="step-content-centered">
            <div className="progress-display">
              <div className="spinner-large" />
              <h3>Applying Changes</h3>
              <p className="phase-label">{phaseLabels[applyProgress.phase] || 'Processing...'}</p>

              {applyProgress.total > 0 && (
                <div className="apply-progress-bar">
                  <div className="progress-info">
                    <span>{applyProgress.current} of {applyProgress.total}</span>
                    <span className="progress-percent">{progressPercent}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {applyProgress.currentFile && (
                    <div className="current-file">{applyProgress.currentFile}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'complete':
        if (!applyResult) {
          return (
            <div className="step-content-centered">
              <div className="spinner" />
              <p>Finalizing...</p>
            </div>
          );
        }
        return (
          <div className="approval-complete">
            <div className={`complete-icon ${applyResult.failed > 0 ? 'has-errors' : ''}`}>
              {applyResult.failed > 0 ? '!' : '✓'}
            </div>
            <h3>
              {applyResult.failed > 0
                ? 'Metadata Applied with Errors'
                : 'Metadata Applied Successfully'}
            </h3>
            <div className="complete-stats">
              <div className="stat">
                <span className="stat-value">{applyResult.successful}</span>
                <span className="stat-label">Files Updated</span>
              </div>
              {applyResult.failed > 0 && (
                <div className="stat stat-error">
                  <span className="stat-value">{applyResult.failed}</span>
                  <span className="stat-label">Failed</span>
                </div>
              )}
            </div>

            {applyResult.results.filter((r) => !r.success).length > 0 && (
              <div className="error-details">
                <h4>Error Details</h4>
                <div className="error-list">
                  {applyResult.results
                    .filter((r) => !r.success)
                    .map((result, index) => (
                      <div key={index} className="error-item">
                        <span className="error-file">
                          {result.filename || result.fileId}
                        </span>
                        <span className="error-message">
                          {result.error || 'Unknown error'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={handleDone}>
              Done
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="approval-error">
            <div className="error-icon">!</div>
            <h3>Error</h3>
            <p>{error || 'An unknown error occurred'}</p>
            <button className="btn-secondary" onClick={handleCancel}>
              Close
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Show abandon button on all steps except complete
  const canAbandon = step !== 'complete';

  return (
    <>
      <div className="modal-overlay" onClick={canMinimize ? handleClose : handleCancel}>
        <div className="modal-content large with-sidebar" onClick={(e) => e.stopPropagation()}>
          {/* Sidebar Navigation */}
          <StepSidebar
            currentStep={step}
            viewingStep={viewingStep}
            onStepClick={handleStepClick}
            onNavigateToStep={handleNavigateToStep}
            completedSteps={completedSteps}
            stepLogs={stepLogs}
            initLogs={initLogs}
          />

          {/* Main Content Area */}
          <div className="modal-main">
            {/* Header */}
            <div className="modal-header">
              <h2>{getStepTitle()}</h2>
              <div className="modal-header-actions">
                {canAbandon && (
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => setShowAbandonConfirm(true)}
                    title="Abandon job - stop all processes and delete job data"
                  >
                    Abandon
                  </button>
                )}
                {canMinimize && (
                  <button
                    className="btn-minimize"
                    onClick={handleClose}
                    title="Minimize - job continues in background"
                  >
                    -
                  </button>
                )}
                <button
                  className="btn-close"
                  onClick={canMinimize ? handleClose : handleCancel}
                  disabled={step === 'applying'}
                  title={canMinimize ? 'Close - job continues in background' : 'Cancel'}
                >
                  x
                </button>
              </div>
            </div>

            {/* Step Content */}
            <div className="modal-body">
              {renderCurrentStep()}
            </div>

            {/* Collapsible Log Panel */}
            {showLogsPanel && currentLogs.length > 0 && (
              <div className={`log-panel ${logsExpanded ? 'expanded' : 'collapsed'}`}>
                <button
                  className="log-panel-toggle"
                  onClick={() => setLogsExpanded(!logsExpanded)}
                >
                  <span className="toggle-icon">{logsExpanded ? '▼' : '▲'}</span>
                  <span className="toggle-label">
                    Activity Log ({currentLogs.length} entries)
                  </span>
                </button>
                {logsExpanded && (
                  <div className="log-panel-content" ref={logContainerRef} onScroll={handleLogScroll}>
                    {currentLogs.map((log, index) => (
                      <div key={index} className={`log-entry ${log.type || 'info'}`}>
                        <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                        <span className="log-message">{log.message}</span>
                        {log.detail && <span className="log-detail">{log.detail}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Background hint for applicable steps */}
            {canMinimize && !viewingStep && (
              <div className="minimize-hint">
                You can close this modal - the job will continue in the background.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Abandon Confirmation Dialog */}
      {showAbandonConfirm && (
        <div className="modal-overlay confirm-overlay" onClick={() => setShowAbandonConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Abandon Job?</h3>
            <p>
              This will stop all processes, clean up temporary data, and permanently delete this job.
              This action cannot be undone.
            </p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setShowAbandonConfirm(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleAbandon}>
                Abandon Job
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MetadataApprovalModal;
