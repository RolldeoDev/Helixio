/**
 * ChangeFileSeriesModal Component
 *
 * Modal for changing which series a file belongs to.
 * Features search functionality to find the target series.
 */

import { useState, useEffect, useCallback } from 'react';
import { searchSeries, linkFileToSeries } from '../../services/api.service';
import type { Series } from '../../services/api.service';
import './ChangeFileSeriesModal.css';

interface ChangeFileSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  filename: string;
  currentSeriesId: string | null;
  currentSeriesName: string | null;
  onSuccess?: () => void;
}

export function ChangeFileSeriesModal({
  isOpen,
  onClose,
  fileId,
  filename,
  currentSeriesId,
  currentSeriesName,
  onSuccess,
}: ChangeFileSeriesModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Series[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedSeriesId(null);
      setError(null);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await searchSeries(searchQuery, 20);
        // Filter out the current series
        setSearchResults(result.series.filter((s: Series) => s.id !== currentSeriesId));
      } catch (err) {
        console.error('Search failed:', err);
        setError('Failed to search series');
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, currentSeriesId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedSeriesId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await linkFileToSeries(fileId, selectedSeriesId);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to change series:', err);
      setError('Failed to move file to new series');
    } finally {
      setIsSubmitting(false);
    }
  }, [fileId, selectedSeriesId, onSuccess, onClose]);

  if (!isOpen) return null;

  const selectedSeries = searchResults.find((s) => s.id === selectedSeriesId);

  return (
    <div className="change-file-series-modal-overlay" onClick={onClose}>
      <div className="change-file-series-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Change Series</h3>
          <button className="btn-close" onClick={onClose} title="Close">
            x
          </button>
        </div>

        <div className="modal-content">
          <div className="file-info">
            <span className="label">File:</span>
            <span className="filename" title={filename}>{filename}</span>
          </div>

          {currentSeriesName && (
            <div className="current-series">
              <span className="label">Current Series:</span>
              <span className="series-name">{currentSeriesName}</span>
            </div>
          )}

          <div className="search-section">
            <label htmlFor="series-search">Search for new series:</label>
            <input
              id="series-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type series name..."
              autoFocus
            />
          </div>

          {isSearching && (
            <div className="loading-indicator">
              <span className="spinner-small" /> Searching...
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((series) => (
                <button
                  key={series.id}
                  className={`series-result ${selectedSeriesId === series.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSeriesId(series.id)}
                >
                  <span className="series-name">{series.name}</span>
                  {series.startYear && <span className="series-year">({series.startYear})</span>}
                  {series.publisher && <span className="series-publisher">{series.publisher}</span>}
                  <span className="series-issue-count">{series.issueCount} issues</span>
                </button>
              ))}
            </div>
          )}

          {searchQuery && !isSearching && searchResults.length === 0 && (
            <div className="no-results">No series found matching "{searchQuery}"</div>
          )}

          {selectedSeries && (
            <div className="selection-preview">
              <span className="arrow">→</span>
              <span className="new-series">
                <strong>{selectedSeries.name}</strong>
                {selectedSeries.startYear && ` (${selectedSeries.startYear})`}
              </span>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!selectedSeriesId || isSubmitting}
          >
            {isSubmitting ? 'Moving...' : 'Move to Series'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChangeFileSeriesModal;
