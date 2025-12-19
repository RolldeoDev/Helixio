/**
 * MetadataFetchModal Component
 *
 * Modal for fetching and applying metadata to selected files.
 * Shows matches with confidence scores and allows user approval.
 * Displays real-time progress with detailed step-by-step logging.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchMetadataForFiles,
  applyMetadataBatch,
  getMetadataFetchSession,
  MetadataFetchResult,
  MetadataMatch,
  MetadataSource,
  MetadataFetchLogEntry,
  MetadataFetchAPICall,
  MetadataFetchStep,
} from '../../services/api.service';

interface MetadataFetchModalProps {
  fileIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

type SelectionState = {
  [fileId: string]: {
    selected: boolean;
    match: MetadataMatch | null;
  };
};

// Step information for progress display
const STEPS: { key: MetadataFetchStep; label: string; icon: string }[] = [
  { key: 'parsing', label: 'Parsing Filenames', icon: '📄' },
  { key: 'searching', label: 'Searching Sources', icon: '🔍' },
  { key: 'scoring', label: 'Scoring Results', icon: '📊' },
  { key: 'organizing', label: 'Organizing Matches', icon: '📋' },
  { key: 'fetching', label: 'Fetching Details', icon: '📥' },
  { key: 'applying', label: 'Applying Metadata', icon: '✏️' },
];

export function MetadataFetchModal({
  fileIds,
  onClose,
  onComplete,
}: MetadataFetchModalProps) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MetadataFetchResult[]>([]);
  const [selections, setSelections] = useState<SelectionState>({});
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  // Progress tracking state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<MetadataFetchStep>('parsing');
  const [logs, setLogs] = useState<MetadataFetchLogEntry[]>([]);
  const [apiCalls, setApiCalls] = useState<MetadataFetchAPICall[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom of logs when new ones arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Poll for session updates
  const pollSession = useCallback(async (sid: string) => {
    try {
      const sessionData = await getMetadataFetchSession(sid);
      setCurrentStep(sessionData.session.currentStep);
      setLogs(sessionData.logs);
      setApiCalls(sessionData.apiCalls);

      // Calculate progress based on step
      const stepIndex = STEPS.findIndex(s => s.key === sessionData.session.currentStep);
      if (stepIndex >= 0) {
        setOverallProgress(Math.round((stepIndex / STEPS.length) * 100));
      }

      // If session is complete, stop polling
      if (sessionData.session.status !== 'in_progress') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err) {
      console.error('Failed to poll session:', err);
    }
  }, []);

  // Fetch metadata on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Start fetching with session logging enabled
        const response = await fetchMetadataForFiles(fileIds, true);

        // If we got a session ID, start polling for updates
        if (response.sessionId) {
          setSessionId(response.sessionId);
          // Get initial session state
          await pollSession(response.sessionId);
        }

        setResults(response.results);
        setOverallProgress(100);

        // Initialize selections - auto-select high confidence matches
        const initialSelections: SelectionState = {};
        for (const result of response.results) {
          initialSelections[result.fileId] = {
            selected: result.status === 'matched' && result.bestMatch !== null,
            match: result.bestMatch,
          };
        }
        setSelections(initialSelections);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metadata');
      } finally {
        setLoading(false);
        // Clean up polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    };

    fetchData();

    // Cleanup on unmount
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fileIds, pollSession]);

  // Start polling when we have a session
  useEffect(() => {
    if (sessionId && loading) {
      // Poll every 500ms while loading
      pollingRef.current = setInterval(() => {
        pollSession(sessionId);
      }, 500);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [sessionId, loading, pollSession]);

  const handleToggleSelection = (fileId: string) => {
    setSelections((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId]!,
        selected: !prev[fileId]?.selected,
      },
    }));
  };

  const handleSelectMatch = (fileId: string, match: MetadataMatch) => {
    setSelections((prev) => ({
      ...prev,
      [fileId]: {
        selected: true,
        match,
      },
    }));
    setExpandedFile(null);
  };

  const handleSelectAll = () => {
    setSelections((prev) => {
      const newSelections = { ...prev };
      for (const fileId of Object.keys(newSelections)) {
        if (newSelections[fileId]?.match) {
          newSelections[fileId] = {
            ...newSelections[fileId]!,
            selected: true,
          };
        }
      }
      return newSelections;
    });
  };

  const handleSelectNone = () => {
    setSelections((prev) => {
      const newSelections = { ...prev };
      for (const fileId of Object.keys(newSelections)) {
        newSelections[fileId] = {
          ...newSelections[fileId]!,
          selected: false,
        };
      }
      return newSelections;
    });
  };

  const handleApply = async () => {
    const toApply = Object.entries(selections)
      .filter(([, value]) => value.selected && value.match)
      .map(([fileId, value]) => ({
        fileId,
        source: value.match!.source,
        sourceId: value.match!.sourceId,
        type: value.match!.type,
      }));

    if (toApply.length === 0) {
      return;
    }

    try {
      setApplying(true);
      setError(null);
      await applyMetadataBatch(toApply);
      onComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply metadata');
    } finally {
      setApplying(false);
    }
  };

  const selectedCount = Object.values(selections).filter(
    (s) => s.selected && s.match
  ).length;

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 0.7) return 'confidence-high';
    if (confidence >= 0.4) return 'confidence-medium';
    return 'confidence-low';
  };

  const getConfidenceLabel = (confidence: number) => {
    const percent = Math.round(confidence * 100);
    if (confidence >= 0.7) return `${percent}% - High`;
    if (confidence >= 0.4) return `${percent}% - Medium`;
    return `${percent}% - Low`;
  };

  const getSourceLabel = (source: MetadataSource) => {
    return source === 'comicvine' ? 'ComicVine' : 'Metron';
  };

  const getAPICallStatusIcon = (status: MetadataFetchAPICall['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'success': return '✓';
      case 'error': return '✗';
      case 'rate_limited': return '⚠';
      default: return '•';
    }
  };

  const getAPISourceLabel = (source: MetadataFetchAPICall['source']) => {
    switch (source) {
      case 'anthropic': return 'CLAUDE';
      case 'comicvine': return 'COMICVINE';
      case 'metron': return 'METRON';
      default: return String(source).toUpperCase();
    }
  };

  const getCurrentStepIndex = () => {
    return STEPS.findIndex(s => s.key === currentStep);
  };

  return (
    <div className="metadata-fetch-modal">
      <div className="modal-header">
        <h2>Fetch Metadata</h2>
        <button className="btn-close" onClick={onClose} disabled={applying}>
          x
        </button>
      </div>

      {loading ? (
        <div className="modal-loading-detailed">
          {/* Progress Steps */}
          <div className="progress-steps">
            {STEPS.map((step, index) => {
              const currentIndex = getCurrentStepIndex();
              const isActive = index === currentIndex;
              const isComplete = index < currentIndex;

              return (
                <div
                  key={step.key}
                  className={`progress-step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
                >
                  <div className="step-indicator">
                    {isComplete ? '✓' : step.icon}
                  </div>
                  <div className="step-label">{step.label}</div>
                </div>
              );
            })}
          </div>

          {/* Overall Progress Bar */}
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span className="progress-text">
              {fileIds.length} file{fileIds.length !== 1 ? 's' : ''} • {overallProgress}%
            </span>
          </div>

          {/* API Calls Section */}
          {apiCalls.length > 0 && (
            <div className="api-calls-section">
              <div className="section-header">API Calls</div>
              <div className="api-calls-list">
                {apiCalls.slice(-5).map((call, index) => (
                  <div key={index} className={`api-call-item ${call.status}`}>
                    <span className="api-call-status">
                      {getAPICallStatusIcon(call.status)}
                    </span>
                    <span className="api-call-source">
                      {getAPISourceLabel(call.source)}
                    </span>
                    <span className="api-call-endpoint">
                      {call.endpoint}
                    </span>
                    {call.resultCount !== undefined && call.status === 'success' && (
                      <span className="api-call-results">
                        {call.resultCount} results
                      </span>
                    )}
                    {call.duration && (
                      <span className="api-call-duration">
                        {call.duration}ms
                      </span>
                    )}
                    {call.error && (
                      <span className="api-call-error" title={call.error}>
                        {call.error.substring(0, 30)}...
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Log */}
          <div className="activity-log-section">
            <div className="section-header">Activity Log</div>
            <div className="activity-log">
              {logs.slice(-10).map((log, index) => (
                <div key={index} className={`log-entry ${log.level}`}>
                  <span className="log-step">{log.stepName}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="log-entry info">
                  <span className="log-message">Starting metadata search...</span>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Loading indicator */}
          <div className="loading-footer">
            <div className="spinner-small" />
            <span>Searching for metadata matches...</span>
          </div>
        </div>
      ) : error ? (
        <div className="modal-error">
          <p>{error}</p>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="modal-toolbar">
            <div className="toolbar-left">
              <span className="result-summary">
                {results.filter((r) => r.status === 'matched').length} matched,{' '}
                {results.filter((r) => r.status === 'low_confidence').length} low
                confidence,{' '}
                {results.filter((r) => r.status === 'no_match').length} no match
              </span>
            </div>
            <div className="toolbar-right">
              <button className="btn-ghost" onClick={handleSelectAll}>
                Select All
              </button>
              <button className="btn-ghost" onClick={handleSelectNone}>
                Select None
              </button>
            </div>
          </div>

          <div className="modal-content-scroll">
            <div className="fetch-results">
              {results.map((result) => {
                const selection = selections[result.fileId];
                const isExpanded = expandedFile === result.fileId;

                return (
                  <div
                    key={result.fileId}
                    className={`fetch-result-item ${result.status} ${
                      selection?.selected ? 'selected' : ''
                    }`}
                  >
                    <div className="result-main">
                      <label className="result-checkbox">
                        <input
                          type="checkbox"
                          checked={selection?.selected || false}
                          disabled={!selection?.match}
                          onChange={() => handleToggleSelection(result.fileId)}
                        />
                      </label>

                      <div className="result-info">
                        <div className="result-filename" title={result.filename}>
                          {result.filename}
                        </div>

                        {result.bestMatch ? (
                          <div className="result-match">
                            <span className="match-name">
                              {result.bestMatch.name}
                              {result.bestMatch.number &&
                                ` #${result.bestMatch.number}`}
                            </span>
                            {result.bestMatch.publisher && (
                              <span className="match-publisher">
                                {result.bestMatch.publisher}
                              </span>
                            )}
                            {result.bestMatch.year && (
                              <span className="match-year">
                                ({result.bestMatch.year})
                              </span>
                            )}
                            <span className="match-source">
                              {getSourceLabel(result.bestMatch.source)}
                            </span>
                            <span
                              className={`match-confidence ${getConfidenceClass(
                                result.bestMatch.confidence
                              )}`}
                            >
                              {getConfidenceLabel(result.bestMatch.confidence)}
                            </span>
                          </div>
                        ) : (
                          <div className="result-no-match">
                            {result.error || 'No matches found'}
                          </div>
                        )}
                      </div>

                      {result.alternateMatches.length > 0 && (
                        <button
                          className="btn-ghost btn-expand"
                          onClick={() =>
                            setExpandedFile(isExpanded ? null : result.fileId)
                          }
                        >
                          {isExpanded
                            ? 'Hide alternatives'
                            : `${result.alternateMatches.length} alternatives`}
                        </button>
                      )}
                    </div>

                    {isExpanded && result.alternateMatches.length > 0 && (
                      <div className="result-alternatives">
                        {selection?.match &&
                          selection.match !== result.bestMatch && (
                            <div
                              className="alternative-item current"
                              onClick={() =>
                                handleSelectMatch(
                                  result.fileId,
                                  result.bestMatch!
                                )
                              }
                            >
                              <span className="alt-label">Original:</span>
                              <span className="alt-name">
                                {result.bestMatch?.name}
                                {result.bestMatch?.number &&
                                  ` #${result.bestMatch.number}`}
                              </span>
                              <span className="alt-source">
                                {result.bestMatch &&
                                  getSourceLabel(result.bestMatch.source)}
                              </span>
                              <span
                                className={`alt-confidence ${
                                  result.bestMatch &&
                                  getConfidenceClass(result.bestMatch.confidence)
                                }`}
                              >
                                {result.bestMatch &&
                                  Math.round(result.bestMatch.confidence * 100)}
                                %
                              </span>
                            </div>
                          )}
                        {result.alternateMatches.map((alt, idx) => (
                          <div
                            key={idx}
                            className={`alternative-item ${
                              selection?.match?.sourceId === alt.sourceId &&
                              selection?.match?.source === alt.source
                                ? 'selected'
                                : ''
                            }`}
                            onClick={() =>
                              handleSelectMatch(result.fileId, alt)
                            }
                          >
                            <span className="alt-name">
                              {alt.name}
                              {alt.number && ` #${alt.number}`}
                            </span>
                            {alt.publisher && (
                              <span className="alt-publisher">
                                {alt.publisher}
                              </span>
                            )}
                            {alt.year && (
                              <span className="alt-year">({alt.year})</span>
                            )}
                            <span className="alt-source">
                              {getSourceLabel(alt.source)}
                            </span>
                            <span
                              className={`alt-confidence ${getConfidenceClass(
                                alt.confidence
                              )}`}
                            >
                              {Math.round(alt.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="modal-footer">
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={applying}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleApply}
              disabled={selectedCount === 0 || applying}
            >
              {applying
                ? 'Applying...'
                : `Apply Metadata (${selectedCount} files)`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
