/**
 * StatusBar Component
 *
 * Bottom status bar showing operation progress, selection info, and quick links.
 */

import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useAdaptivePolling } from '../../hooks';
import { getActiveBatch, getCacheJobs, type BatchProgress } from '../../services/api.service';

export function StatusBar() {
  const location = useLocation();
  const {
    selectedLibrary,
    selectedFiles,
    pagination,
    operationInProgress,
    operationMessage,
  } = useApp();

  // Pagination is only relevant on library routes
  const isLibraryRoute = location.pathname === '/library' || location.pathname.startsWith('/library/');

  // Adaptive polling for batch status - polls every 60s when idle, 5s when active
  const { data: batchData } = useAdaptivePolling({
    fetchFn: getActiveBatch,
    isActive: (data) => data.hasActiveBatch,
    activeInterval: 5000,
  });

  // Adaptive polling for cache jobs - polls every 60s when idle, 2s when active
  const { data: cacheData } = useAdaptivePolling({
    fetchFn: getCacheJobs,
    isActive: (data) => data.jobs.some(j => j.status === 'processing'),
  });

  // Derive display state from polling data
  const activeBatch: BatchProgress | null = batchData?.hasActiveBatch && batchData.activeBatchId
    ? { id: batchData.activeBatchId, status: 'in_progress' } as BatchProgress
    : null;
  const activeCacheJob = cacheData?.jobs.find(j => j.status === 'processing') || null;
  const cacheQueuedFiles = cacheData?.queuedFiles || 0;

  return (
    <footer className="status-bar">
      <div className="status-left">
        {operationInProgress ? (
          <span className="operation-status">
            <span className="spinner" />
            {operationMessage || operationInProgress}
          </span>
        ) : activeCacheJob ? (
          <span className="cache-status">
            <span className="spinner" />
            <span>
              Caching: {activeCacheJob.currentFile || 'Processing...'}
              {activeCacheJob.currentProgress && (
                <> (page {activeCacheJob.currentProgress.currentPage}/{activeCacheJob.currentProgress.totalPages})</>
              )}
              {' '}- {activeCacheJob.processedFiles}/{activeCacheJob.totalFiles} files
              {cacheQueuedFiles > activeCacheJob.totalFiles - activeCacheJob.processedFiles && (
                <> (+{cacheQueuedFiles - (activeCacheJob.totalFiles - activeCacheJob.processedFiles)} queued)</>
              )}
            </span>
          </span>
        ) : activeBatch ? (
          <Link to="/jobs" className="batch-status-link">
            <span className="spinner" />
            <span>Batch operation in progress</span>
          </Link>
        ) : operationMessage ? (
          <span className="operation-message">{operationMessage}</span>
        ) : isLibraryRoute && selectedLibrary ? (
          <span>
            {selectedLibrary.name} - {pagination.total} files
          </span>
        ) : isLibraryRoute ? (
          <span>Select a library to begin</span>
        ) : null}
      </div>

      <div className="status-center">
        {selectedFiles.size > 0 && (
          <span className="selection-info">
            {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
          </span>
        )}
      </div>

      <div className="status-right">
        <div className="status-links">
          <Link to="/jobs" className="status-link" title="Job History">
            Job History
          </Link>
          <Link to="/history" className="status-link" title="Operation History">
            History
          </Link>
        </div>
        {isLibraryRoute && pagination.pages > 1 && (
          <span className="page-info">
            Page {pagination.page} of {pagination.pages}
          </span>
        )}
      </div>
    </footer>
  );
}
