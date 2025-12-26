/**
 * Download Confirmation Modal
 *
 * Shown when downloading large series (>50 issues or >1GB).
 * Allows users to confirm and configure split options.
 */

import { useState } from 'react';
import { Download, AlertTriangle, X, HardDrive, FileArchive } from 'lucide-react';
import { useDownloads, formatFileSize } from '../../contexts/DownloadContext';
import './DownloadConfirmationModal.css';

// Default split sizes in bytes
const SPLIT_SIZES = [
  { value: 2 * 1024 * 1024 * 1024, label: '2 GB' },
  { value: 4 * 1024 * 1024 * 1024, label: '4 GB' },
  { value: 8 * 1024 * 1024 * 1024, label: '8 GB' },
];

export function DownloadConfirmationModal() {
  const { confirmationState, closeConfirmation } = useDownloads();
  const { isOpen, seriesName, estimate, onConfirm, onCancel } = confirmationState;

  const [splitEnabled, setSplitEnabled] = useState(estimate?.suggestSplit ?? false);
  const [splitSizeBytes, setSplitSizeBytes] = useState(SPLIT_SIZES[0]!.value);

  if (!isOpen || !estimate) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm?.({
      splitEnabled,
      splitSizeBytes: splitEnabled ? splitSizeBytes : undefined,
    });
  };

  const handleCancel = () => {
    onCancel?.();
    closeConfirmation();
  };

  // Calculate estimated parts
  const estimatedParts = splitEnabled
    ? Math.ceil(estimate.totalSizeBytes / splitSizeBytes)
    : 1;

  // Check for unavailable files
  const unavailableCount = estimate.files.filter((f) => !f.exists).length;

  return (
    <div className="download-modal-overlay" onClick={handleCancel}>
      <div className="download-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="download-modal__header">
          <div className="download-modal__header-icon">
            <Download size={24} />
          </div>
          <div className="download-modal__header-content">
            <h2 className="download-modal__title">Confirm Download</h2>
            <p className="download-modal__subtitle">
              {seriesName || 'Selected Issues'}
            </p>
          </div>
          <button className="download-modal__close" onClick={handleCancel}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="download-modal__content">
          {/* Size Warning */}
          <div className="download-modal__warning">
            <AlertTriangle size={20} />
            <span>
              This is a large download. Make sure you have enough disk space.
            </span>
          </div>

          {/* Stats */}
          <div className="download-modal__stats">
            <div className="download-modal__stat">
              <FileArchive size={18} />
              <div className="download-modal__stat-content">
                <span className="download-modal__stat-value">
                  {estimate.fileCount}
                </span>
                <span className="download-modal__stat-label">Issues</span>
              </div>
            </div>
            <div className="download-modal__stat">
              <HardDrive size={18} />
              <div className="download-modal__stat-content">
                <span className="download-modal__stat-value">
                  {formatFileSize(estimate.totalSizeBytes)}
                </span>
                <span className="download-modal__stat-label">Total Size</span>
              </div>
            </div>
          </div>

          {/* Unavailable Files Warning */}
          {unavailableCount > 0 && (
            <div className="download-modal__unavailable">
              <AlertTriangle size={16} />
              <span>
                {unavailableCount} file{unavailableCount > 1 ? 's' : ''} unavailable
                and will be skipped.
              </span>
            </div>
          )}

          {/* Split Options */}
          <div className="download-modal__options">
            <label className="download-modal__checkbox">
              <input
                type="checkbox"
                checked={splitEnabled}
                onChange={(e) => setSplitEnabled(e.target.checked)}
              />
              <span className="download-modal__checkbox-label">
                Split into smaller parts
              </span>
              <span className="download-modal__checkbox-hint">
                Recommended for downloads over 2 GB
              </span>
            </label>

            {splitEnabled && (
              <div className="download-modal__split-size">
                <label className="download-modal__split-label">
                  Part size:
                </label>
                <select
                  className="download-modal__split-select"
                  value={splitSizeBytes}
                  onChange={(e) => setSplitSizeBytes(Number(e.target.value))}
                >
                  {SPLIT_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>
                      {size.label}
                    </option>
                  ))}
                </select>
                <span className="download-modal__split-estimate">
                  ~{estimatedParts} part{estimatedParts > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="download-modal__footer">
          <button
            className="download-modal__btn download-modal__btn--secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="download-modal__btn download-modal__btn--primary"
            onClick={handleConfirm}
          >
            <Download size={16} />
            Start Download
          </button>
        </div>
      </div>
    </div>
  );
}

export default DownloadConfirmationModal;
