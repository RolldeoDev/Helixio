/**
 * StatusBar Component
 *
 * Bottom status bar showing operation progress, selection info, and quick links.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { getActiveBatch, getCacheJobs, type BatchProgress, type CacheJob } from '../../services/api.service';

export function StatusBar() {
  const {
    selectedLibrary,
    selectedFiles,
    pagination,
    operationInProgress,
    operationMessage,
  } = useApp();

  const [activeBatch, setActiveBatch] = useState<BatchProgress | null>(null);
  const [activeCacheJob, setActiveCacheJob] = useState<CacheJob | null>(null);
  const [cacheQueuedFiles, setCacheQueuedFiles] = useState(0);

  // Poll for active batch status
  useEffect(() => {
    const checkActiveBatch = async () => {
      try {
        const result = await getActiveBatch();
        if (result.hasActiveBatch && result.activeBatchId) {
          // Fetch full batch details if needed
          setActiveBatch({
            id: result.activeBatchId,
            status: 'in_progress',
          } as BatchProgress);
        } else {
          setActiveBatch(null);
        }
      } catch {
        // Ignore errors in background polling
      }
    };

    checkActiveBatch();
    const interval = setInterval(checkActiveBatch, 5000);

    return () => clearInterval(interval);
  }, []);

  // Poll for active cache jobs
  useEffect(() => {
    const checkCacheJobs = async () => {
      try {
        const { jobs, queuedFiles } = await getCacheJobs();
        const processingJob = jobs.find(j => j.status === 'processing');
        setActiveCacheJob(processingJob || null);
        setCacheQueuedFiles(queuedFiles);
      } catch {
        // Ignore errors in background polling
      }
    };

    checkCacheJobs();
    const interval = setInterval(checkCacheJobs, 2000); // Poll more frequently for cache jobs

    return () => clearInterval(interval);
  }, []);

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
          <Link to="/batches" className="batch-status-link">
            <span className="spinner" />
            <span>Batch operation in progress</span>
          </Link>
        ) : operationMessage ? (
          <span className="operation-message">{operationMessage}</span>
        ) : selectedLibrary ? (
          <span>
            {selectedLibrary.name} - {pagination.total} files
          </span>
        ) : (
          <span>Select a library to begin</span>
        )}
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
          <Link to="/batches" className="status-link" title="Batch Operations">
            Batches
          </Link>
          <Link to="/history" className="status-link" title="Operation History">
            History
          </Link>
        </div>
        {pagination.pages > 1 && (
          <span className="page-info">
            Page {pagination.page} of {pagination.pages}
          </span>
        )}
      </div>
    </footer>
  );
}
