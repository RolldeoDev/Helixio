/**
 * Metadata Quick View Component
 *
 * A popup/sidebar showing full metadata for a comic without
 * opening the full metadata editor.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCoverUrl, getFile } from '../../services/api.service';
import type { FileMetadata } from '../../services/api.service';
import './AdvancedSearch.css';

// =============================================================================
// Types
// =============================================================================

interface MetadataQuickViewProps {
  fileId: string;
  filename: string;
  position?: { x: number; y: number };
  anchor?: 'left' | 'right' | 'top' | 'bottom';
  onClose: () => void;
  onEdit?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function MetadataQuickView({
  fileId,
  filename,
  position,
  anchor = 'right',
  onClose,
  onEdit,
}: MetadataQuickViewProps) {
  const navigate = useNavigate();
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch metadata
  useEffect(() => {
    let cancelled = false;

    async function fetchMetadata() {
      setLoading(true);
      setError(null);

      try {
        const file = await getFile(fileId);
        if (!cancelled) {
          setMetadata(file.metadata || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metadata');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMetadata();

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Calculate position
  const getStyle = useCallback((): React.CSSProperties => {
    if (!position) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const style: React.CSSProperties = {};
    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupWidth = 400;
    const popupHeight = 500;

    // Determine best position based on anchor and available space
    switch (anchor) {
      case 'right':
        style.left = Math.min(position.x + padding, viewportWidth - popupWidth - padding);
        style.top = Math.min(Math.max(position.y - 100, padding), viewportHeight - popupHeight - padding);
        break;
      case 'left':
        style.left = Math.max(position.x - popupWidth - padding, padding);
        style.top = Math.min(Math.max(position.y - 100, padding), viewportHeight - popupHeight - padding);
        break;
      case 'bottom':
        style.left = Math.min(Math.max(position.x - popupWidth / 2, padding), viewportWidth - popupWidth - padding);
        style.top = position.y + padding;
        break;
      case 'top':
        style.left = Math.min(Math.max(position.x - popupWidth / 2, padding), viewportWidth - popupWidth - padding);
        style.top = Math.max(position.y - popupHeight - padding, padding);
        break;
    }

    return style;
  }, [position, anchor]);

  const handleRead = () => {
    navigate(`/read/${fileId}?filename=${encodeURIComponent(filename)}`);
  };

  // Render field if value exists
  const renderField = (label: string, value: string | number | null | undefined) => {
    if (!value) return null;
    return (
      <div className="mqv-field">
        <span className="mqv-label">{label}</span>
        <span className="mqv-value">{value}</span>
      </div>
    );
  };

  // Render array field as tags
  const renderTags = (label: string, values: string | null | undefined) => {
    if (!values) return null;
    const tags = values.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) return null;

    return (
      <div className="mqv-field">
        <span className="mqv-label">{label}</span>
        <div className="mqv-tags">
          {tags.slice(0, 10).map((tag, i) => (
            <span key={i} className="mqv-tag">{tag}</span>
          ))}
          {tags.length > 10 && (
            <span className="mqv-tag">+{tags.length - 10} more</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="metadata-quick-view"
      style={getStyle()}
    >
      {/* Header with Cover */}
      <div className="mqv-header">
        <div className="mqv-cover">
          <img
            src={getCoverUrl(fileId)}
            alt=""
            loading="lazy"
          />
        </div>
        <div className="mqv-title-section">
          <h3 className="mqv-series">
            {metadata?.series || filename.replace(/\.cb[rz7t]$/i, '')}
          </h3>
          {metadata?.number && (
            <p className="mqv-issue">
              #{metadata.number}
              {metadata.title && ` - ${metadata.title}`}
            </p>
          )}
          {metadata?.year && (
            <span className="mqv-year">{metadata.year}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mqv-body">
        {loading && (
          <div className="mqv-loading">Loading metadata...</div>
        )}

        {error && (
          <div className="mqv-error">{error}</div>
        )}

        {!loading && !error && metadata && (
          <>
            {/* Summary */}
            {metadata.summary && (
              <div className="mqv-field">
                <span className="mqv-label">Summary</span>
                <span className="mqv-value truncated">{metadata.summary}</span>
              </div>
            )}

            {/* Creators */}
            {renderField('Writer', metadata.writer)}
            {renderField('Penciller', metadata.penciller)}

            {/* Publication */}
            {renderField('Publisher', metadata.publisher)}
            {renderField('Volume', metadata.volume)}

            {/* Tags */}
            {renderTags('Genre', metadata.genre)}
          </>
        )}

        {!loading && !error && !metadata && (
          <div className="mqv-empty">No metadata available</div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mqv-footer">
        <button className="mqv-btn-primary" onClick={handleRead}>
          Read
        </button>
        {onEdit && (
          <button className="mqv-btn-secondary" onClick={onEdit}>
            Edit Metadata
          </button>
        )}
        <button className="mqv-btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
