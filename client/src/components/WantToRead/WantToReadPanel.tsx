/**
 * Want to Read Panel Component
 *
 * Displays the user's "Want to Read" queue with priority levels
 * and reordering capabilities.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWantToRead, WantToReadItem } from '../../contexts/WantToReadContext';
import { getCoverUrl } from '../../services/api.service';
import './WantToRead.css';

// =============================================================================
// Priority Badge Component
// =============================================================================

interface PriorityBadgeProps {
  priority: number;
  onChange: (priority: number) => void;
}

function PriorityBadge({ priority, onChange }: PriorityBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  const labels: Record<number, string> = {
    1: 'High',
    2: 'Med',
    3: 'Low',
  };

  const colors: Record<number, string> = {
    1: 'var(--color-error, #ef4444)',
    2: 'var(--color-warning, #f59e0b)',
    3: 'var(--color-success, #22c55e)',
  };

  return (
    <div className="wtr-priority-wrapper">
      <button
        className="wtr-priority-badge"
        style={{ backgroundColor: colors[priority] }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title={`Priority: ${labels[priority]}`}
      >
        {labels[priority]}
      </button>
      {isOpen && (
        <div className="wtr-priority-dropdown">
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              className={`wtr-priority-option ${p === priority ? 'active' : ''}`}
              style={{ '--priority-color': colors[p] } as React.CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                onChange(p);
                setIsOpen(false);
              }}
            >
              {labels[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Want to Read Item Component
// =============================================================================

interface WantToReadItemProps {
  item: WantToReadItem;
  index: number;
  onRead: (fileId: string) => void;
  onRemove: (fileId: string) => void;
  onPriorityChange: (fileId: string, priority: number) => void;
}

function WantToReadItemRow({
  item,
  onRead,
  onRemove,
  onPriorityChange,
}: WantToReadItemProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="wtr-item"
      onClick={() => onRead(item.fileId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onRead(item.fileId);
        }
      }}
    >
      <div className="wtr-item-cover">
        <img
          src={getCoverUrl(item.fileId)}
          alt=""
          loading="lazy"
        />
      </div>
      <div className="wtr-item-info">
        <span className="wtr-item-title" title={item.filename}>
          {item.filename.replace(/\.cb[rz7t]$/i, '')}
        </span>
        <span className="wtr-item-date">Added {formatDate(item.addedAt)}</span>
      </div>
      <div className="wtr-item-actions">
        <PriorityBadge
          priority={item.priority}
          onChange={(p) => onPriorityChange(item.fileId, p)}
        />
        <button
          className="wtr-item-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.fileId);
          }}
          title="Remove from Want to Read"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function WantToReadPanel() {
  const navigate = useNavigate();
  const {
    items,
    isLoading,
    removeFromWantToRead,
    updatePriority,
    clearAll,
  } = useWantToRead();
  const [collapsed, setCollapsed] = useState(false);
  const [filterPriority, setFilterPriority] = useState<number | null>(null);

  const handleRead = useCallback((fileId: string) => {
    navigate(`/read/${fileId}`);
  }, [navigate]);

  // Filter and sort items
  const displayItems = items
    .filter((item) => filterPriority === null || item.priority === filterPriority)
    .sort((a, b) => {
      // Sort by priority first (1 = high comes first)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by added date (newest first)
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });

  if (isLoading) {
    return (
      <div className="wtr-panel">
        <div className="wtr-loading">Loading...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="wtr-panel">
      <button
        className="wtr-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="wtr-title">
          Want to Read
          <span className="wtr-count">{items.length}</span>
        </span>
        <span className={`wtr-chevron ${collapsed ? 'collapsed' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {!collapsed && (
        <div className="wtr-content">
          {/* Filter Pills */}
          <div className="wtr-filters">
            <button
              className={`wtr-filter-pill ${filterPriority === null ? 'active' : ''}`}
              onClick={() => setFilterPriority(null)}
            >
              All ({items.length})
            </button>
            <button
              className={`wtr-filter-pill high ${filterPriority === 1 ? 'active' : ''}`}
              onClick={() => setFilterPriority(filterPriority === 1 ? null : 1)}
            >
              High ({items.filter((i) => i.priority === 1).length})
            </button>
            <button
              className={`wtr-filter-pill med ${filterPriority === 2 ? 'active' : ''}`}
              onClick={() => setFilterPriority(filterPriority === 2 ? null : 2)}
            >
              Med ({items.filter((i) => i.priority === 2).length})
            </button>
            <button
              className={`wtr-filter-pill low ${filterPriority === 3 ? 'active' : ''}`}
              onClick={() => setFilterPriority(filterPriority === 3 ? null : 3)}
            >
              Low ({items.filter((i) => i.priority === 3).length})
            </button>
          </div>

          {/* Items List */}
          <div className="wtr-list">
            {displayItems.map((item, index) => (
              <WantToReadItemRow
                key={item.fileId}
                item={item}
                index={index}
                onRead={handleRead}
                onRemove={removeFromWantToRead}
                onPriorityChange={updatePriority}
              />
            ))}
          </div>

          {/* Clear All */}
          {items.length > 0 && (
            <button className="wtr-clear" onClick={clearAll}>
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  );
}
