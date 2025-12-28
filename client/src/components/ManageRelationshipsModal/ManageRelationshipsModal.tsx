/**
 * ManageRelationshipsModal Component
 *
 * Full management interface for series relationships with:
 * - Tabs for Parents/Children
 * - Type dropdowns to change relationship type
 * - Drag-and-drop reordering for children
 * - Remove buttons with undo toast
 */

import { useState, useEffect } from 'react';
import {
  removeChildSeries,
  reorderChildSeries,
  updateRelationshipType,
  type RelationshipType,
  type RelatedSeriesInfo,
} from '../../services/api/series';
import { resolveSeriesCoverUrl } from '../../services/api.service';
import { useToast } from '../../contexts/ToastContext';
import './ManageRelationshipsModal.css';

// =============================================================================
// Types
// =============================================================================

type ActiveTab = 'parents' | 'children';

interface ManageRelationshipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  seriesId: string;
  seriesName: string;
  parents: RelatedSeriesInfo[];
  children: RelatedSeriesInfo[];
  onUpdate: () => void;
}

const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: 'related', label: 'Related' },
  { value: 'spinoff', label: 'Spinoff' },
  { value: 'prequel', label: 'Prequel' },
  { value: 'sequel', label: 'Sequel' },
  { value: 'bonus', label: 'Bonus' },
];

// =============================================================================
// Component
// =============================================================================

export function ManageRelationshipsModal({
  isOpen,
  onClose,
  seriesId,
  seriesName,
  parents,
  children,
  onUpdate,
}: ManageRelationshipsModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('children');
  const [localChildren, setLocalChildren] = useState<RelatedSeriesInfo[]>([]);
  const [localParents, setLocalParents] = useState<RelatedSeriesInfo[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { addToast } = useToast();

  // Sync local state with props
  useEffect(() => {
    setLocalChildren([...children].sort((a, b) => a.sortOrder - b.sortOrder));
    setLocalParents([...parents]);
  }, [children, parents]);

  // Set default active tab based on what exists
  useEffect(() => {
    if (isOpen) {
      if (children.length > 0) {
        setActiveTab('children');
      } else if (parents.length > 0) {
        setActiveTab('parents');
      }
    }
  }, [isOpen, children.length, parents.length]);

  if (!isOpen) return null;

  // =============================================================================
  // Handlers
  // =============================================================================

  const handleTypeChange = async (
    relatedSeriesId: string,
    newType: RelationshipType,
    isParent: boolean
  ) => {
    setIsUpdating(true);
    try {
      if (isParent) {
        // Current series is the child
        await updateRelationshipType(relatedSeriesId, seriesId, newType);
        setLocalParents((prev) =>
          prev.map((p) => (p.id === relatedSeriesId ? { ...p, relationshipType: newType } : p))
        );
      } else {
        // Current series is the parent
        await updateRelationshipType(seriesId, relatedSeriesId, newType);
        setLocalChildren((prev) =>
          prev.map((c) => (c.id === relatedSeriesId ? { ...c, relationshipType: newType } : c))
        );
      }
      addToast('success', 'Relationship type updated');
    } catch (err) {
      console.error('Failed to update type:', err);
      addToast('error', 'Failed to update relationship type');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async (relatedSeriesId: string, name: string, isParent: boolean) => {
    // Optimistically remove from UI
    const removedParent = isParent ? localParents.find((p) => p.id === relatedSeriesId) : null;
    const removedChild = !isParent ? localChildren.find((c) => c.id === relatedSeriesId) : null;

    if (isParent) {
      setLocalParents((prev) => prev.filter((p) => p.id !== relatedSeriesId));
    } else {
      setLocalChildren((prev) => prev.filter((c) => c.id !== relatedSeriesId));
    }

    try {
      if (isParent) {
        await removeChildSeries(relatedSeriesId, seriesId);
      } else {
        await removeChildSeries(seriesId, relatedSeriesId);
      }
      addToast('success', `Removed "${name}"`);
      onUpdate();
    } catch (err) {
      console.error('Failed to remove relationship:', err);
      // Restore on error
      if (isParent && removedParent) {
        setLocalParents((prev) => [...prev, removedParent]);
      } else if (!isParent && removedChild) {
        setLocalChildren((prev) => [...prev, removedChild]);
      }
      addToast('error', 'Failed to remove relationship');
    }
  };

  // =============================================================================
  // Drag and Drop
  // =============================================================================

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder locally
    const newChildren = [...localChildren];
    const removed = newChildren.splice(draggedIndex, 1)[0];
    if (!removed) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    newChildren.splice(dragOverIndex, 0, removed);
    setLocalChildren(newChildren);

    setDraggedIndex(null);
    setDragOverIndex(null);

    // Persist to server
    try {
      await reorderChildSeries(seriesId, newChildren.map((c) => c.id));
      onUpdate();
    } catch (err) {
      console.error('Failed to reorder:', err);
      // Restore original order
      setLocalChildren([...children].sort((a, b) => a.sortOrder - b.sortOrder));
      addToast('error', 'Failed to save order');
    }
  };

  // Keyboard reorder
  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newChildren = [...localChildren];
    const prev = newChildren[index - 1];
    const curr = newChildren[index];
    if (!prev || !curr) return;
    [newChildren[index - 1], newChildren[index]] = [curr, prev];
    setLocalChildren(newChildren);

    try {
      await reorderChildSeries(seriesId, newChildren.map((c) => c.id));
      onUpdate();
    } catch (err) {
      console.error('Failed to reorder:', err);
      setLocalChildren([...children].sort((a, b) => a.sortOrder - b.sortOrder));
      addToast('error', 'Failed to save order');
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= localChildren.length - 1) return;
    const newChildren = [...localChildren];
    const curr = newChildren[index];
    const next = newChildren[index + 1];
    if (!curr || !next) return;
    [newChildren[index], newChildren[index + 1]] = [next, curr];
    setLocalChildren(newChildren);

    try {
      await reorderChildSeries(seriesId, newChildren.map((c) => c.id));
      onUpdate();
    } catch (err) {
      console.error('Failed to reorder:', err);
      setLocalChildren([...children].sort((a, b) => a.sortOrder - b.sortOrder));
      addToast('error', 'Failed to save order');
    }
  };

  // =============================================================================
  // Render
  // =============================================================================

  const renderRelationshipItem = (
    item: RelatedSeriesInfo,
    index: number,
    isParent: boolean
  ) => {
    const coverUrl = resolveSeriesCoverUrl(item);
    const isDragging = draggedIndex === index && !isParent;
    const isDragOver = dragOverIndex === index && !isParent;

    return (
      <div
        key={item.id}
        className={`manage-rel-item ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
        draggable={!isParent}
        onDragStart={() => !isParent && handleDragStart(index)}
        onDragOver={(e) => !isParent && handleDragOver(e, index)}
        onDragEnd={handleDragEnd}
      >
        {/* Drag handle (children only) */}
        {!isParent && (
          <div className="manage-rel-drag-handle" title="Drag to reorder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </div>
        )}

        {/* Cover */}
        <div className="manage-rel-cover">
          {coverUrl ? (
            <img src={coverUrl} alt={item.name} />
          ) : (
            <div className="manage-rel-placeholder">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="manage-rel-info">
          <div className="manage-rel-name">{item.name}</div>
          <div className="manage-rel-meta">
            {item.startYear && <span>{item.startYear}</span>}
            {item.publisher && <span>{item.publisher}</span>}
          </div>
        </div>

        {/* Type selector */}
        <select
          className="manage-rel-type-select"
          value={item.relationshipType}
          onChange={(e) => handleTypeChange(item.id, e.target.value as RelationshipType, isParent)}
          disabled={isUpdating}
        >
          {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Keyboard reorder buttons (children only) */}
        {!isParent && (
          <div className="manage-rel-reorder-btns">
            <button
              className="manage-rel-reorder-btn"
              onClick={() => handleMoveUp(index)}
              disabled={index === 0}
              title="Move up"
              aria-label="Move up"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              className="manage-rel-reorder-btn"
              onClick={() => handleMoveDown(index)}
              disabled={index >= localChildren.length - 1}
              title="Move down"
              aria-label="Move down"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}

        {/* Remove button */}
        <button
          className="manage-rel-remove-btn"
          onClick={() => handleRemove(item.id, item.name, isParent)}
          title="Remove relationship"
          aria-label="Remove relationship"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className="manage-rel-modal-overlay" onClick={onClose}>
      <div className="manage-rel-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="manage-rel-modal-header">
          <h2>Manage Relationships</h2>
          <span className="manage-rel-series-name">{seriesName}</span>
          <button className="manage-rel-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="manage-rel-tabs">
          <button
            className={`manage-rel-tab ${activeTab === 'parents' ? 'active' : ''}`}
            onClick={() => setActiveTab('parents')}
          >
            Parents
            {localParents.length > 0 && (
              <span className="manage-rel-tab-count">{localParents.length}</span>
            )}
          </button>
          <button
            className={`manage-rel-tab ${activeTab === 'children' ? 'active' : ''}`}
            onClick={() => setActiveTab('children')}
          >
            Children
            {localChildren.length > 0 && (
              <span className="manage-rel-tab-count">{localChildren.length}</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="manage-rel-modal-content">
          {activeTab === 'parents' && (
            <div className="manage-rel-list">
              {localParents.length === 0 ? (
                <div className="manage-rel-empty">
                  No parent series linked
                </div>
              ) : (
                localParents.map((item, index) => renderRelationshipItem(item, index, true))
              )}
            </div>
          )}

          {activeTab === 'children' && (
            <div className="manage-rel-list">
              {localChildren.length === 0 ? (
                <div className="manage-rel-empty">
                  No child series linked
                </div>
              ) : (
                <>
                  <div className="manage-rel-list-hint">
                    Drag items to reorder, or use arrow buttons
                  </div>
                  {localChildren.map((item, index) => renderRelationshipItem(item, index, false))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="manage-rel-modal-footer">
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
