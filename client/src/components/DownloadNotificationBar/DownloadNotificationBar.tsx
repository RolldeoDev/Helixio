/**
 * Download Notification Bar
 *
 * Displays download progress and status in the bottom-right corner.
 * Similar to Google Drive's download notifications.
 */

import { Download, X, Check, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useDownloads, formatFileSize, type DownloadJob } from '../../contexts/DownloadContext';
import './DownloadNotificationBar.css';

export function DownloadNotificationBar() {
  const {
    activeDownloads,
    cancelDownload,
    clearCompleted,
    downloadReadyJob,
  } = useDownloads();
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter to show relevant downloads
  const visibleDownloads = activeDownloads.filter(
    (job) => !['completed'].includes(job.status) || Date.now() - job.createdAt.getTime() < 10000
  );

  if (visibleDownloads.length === 0) {
    return null;
  }

  const activeCount = visibleDownloads.filter((job) =>
    ['pending', 'preparing', 'downloading'].includes(job.status)
  ).length;

  const completedCount = visibleDownloads.filter((job) =>
    ['completed', 'ready'].includes(job.status)
  ).length;

  const failedCount = visibleDownloads.filter((job) => job.status === 'failed').length;

  return (
    <div className="download-notification-bar">
      {/* Header */}
      <div
        className="download-notification-bar__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="download-notification-bar__header-content">
          <Download size={16} />
          <span className="download-notification-bar__title">
            {activeCount > 0 && `${activeCount} downloading`}
            {activeCount > 0 && completedCount > 0 && ', '}
            {completedCount > 0 && `${completedCount} ready`}
            {(activeCount > 0 || completedCount > 0) && failedCount > 0 && ', '}
            {failedCount > 0 && `${failedCount} failed`}
            {activeCount === 0 && completedCount === 0 && failedCount === 0 && 'Downloads'}
          </span>
        </div>
        <div className="download-notification-bar__header-actions">
          {completedCount > 0 && (
            <button
              className="download-notification-bar__clear"
              onClick={(e) => {
                e.stopPropagation();
                clearCompleted();
              }}
              title="Clear completed"
            >
              Clear
            </button>
          )}
          <button className="download-notification-bar__toggle">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Download List */}
      {isExpanded && (
        <div className="download-notification-bar__list">
          {visibleDownloads.map((job) => (
            <DownloadItem
              key={job.id}
              job={job}
              onCancel={() => cancelDownload(job.id)}
              onDownload={() => downloadReadyJob(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DownloadItemProps {
  job: DownloadJob;
  onCancel: () => void;
  onDownload: () => void;
}

function DownloadItem({ job, onCancel, onDownload }: DownloadItemProps) {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'pending':
      case 'preparing':
      case 'downloading':
        return <Loader2 className="download-item__icon download-item__icon--spinning" size={18} />;
      case 'ready':
        return <Download className="download-item__icon download-item__icon--ready" size={18} />;
      case 'completed':
        return <Check className="download-item__icon download-item__icon--success" size={18} />;
      case 'failed':
        return <AlertCircle className="download-item__icon download-item__icon--error" size={18} />;
      default:
        return <Download className="download-item__icon" size={18} />;
    }
  };

  const getStatusClass = () => {
    switch (job.status) {
      case 'ready':
        return 'download-item--ready';
      case 'completed':
        return 'download-item--completed';
      case 'failed':
        return 'download-item--failed';
      default:
        return '';
    }
  };

  return (
    <div className={`download-item ${getStatusClass()}`}>
      <div className="download-item__icon-wrapper">
        {getStatusIcon()}
      </div>

      <div className="download-item__content">
        <div className="download-item__name" title={job.seriesName}>
          {job.seriesName || 'Download'}
        </div>
        <div className="download-item__status">
          {job.status === 'preparing' && (
            <>
              <span>{job.message || 'Preparing...'}</span>
              <span className="download-item__progress-text">
                {job.progress > 0 && `${job.progress}%`}
              </span>
            </>
          )}
          {job.status === 'pending' && <span>Waiting in queue...</span>}
          {job.status === 'ready' && (
            <span>
              Ready to download ({formatFileSize(job.totalSizeBytes)})
            </span>
          )}
          {job.status === 'downloading' && <span>Downloading...</span>}
          {job.status === 'completed' && <span>Download complete</span>}
          {job.status === 'failed' && (
            <span className="download-item__error">{job.error || 'Download failed'}</span>
          )}
        </div>

        {/* Progress bar for preparing state */}
        {job.status === 'preparing' && (
          <div className="download-item__progress-bar">
            <div
              className="download-item__progress-fill"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="download-item__actions">
        {job.status === 'ready' && (
          <button
            className="download-item__download-btn"
            onClick={onDownload}
            title="Download"
          >
            <Download size={16} />
          </button>
        )}
        {['pending', 'preparing'].includes(job.status) && (
          <button
            className="download-item__cancel-btn"
            onClick={onCancel}
            title="Cancel"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default DownloadNotificationBar;
