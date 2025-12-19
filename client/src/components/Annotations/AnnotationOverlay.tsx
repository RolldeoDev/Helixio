/**
 * Annotation Overlay Component
 *
 * Overlay for the reader that allows creating and viewing annotations.
 * Supports text notes and region highlights on pages.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { useAnnotations, PageAnnotation, AnnotationHighlight } from '../../contexts/AnnotationsContext';
import './Annotations.css';

// =============================================================================
// Types
// =============================================================================

interface AnnotationOverlayProps {
  fileId: string;
  pageIndex: number;
  isEnabled: boolean;
  onToggle: () => void;
}

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// =============================================================================
// Highlight Colors
// =============================================================================

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: 'rgba(255, 235, 59, 0.3)' },
  { name: 'Green', value: 'rgba(76, 175, 80, 0.3)' },
  { name: 'Blue', value: 'rgba(33, 150, 243, 0.3)' },
  { name: 'Pink', value: 'rgba(233, 30, 99, 0.3)' },
  { name: 'Orange', value: 'rgba(255, 152, 0, 0.3)' },
];

// =============================================================================
// Component
// =============================================================================

export function AnnotationOverlay({
  fileId,
  pageIndex,
  isEnabled,
  onToggle,
}: AnnotationOverlayProps) {
  const {
    getPageAnnotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
  } = useAnnotations();

  const [selectedAnnotation, setSelectedAnnotation] = useState<PageAnnotation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0]!.value);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [tempHighlights, setTempHighlights] = useState<AnnotationHighlight[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  const annotations = getPageAnnotations(fileId, pageIndex);

  // Convert mouse position to percentage
  const getRelativePosition = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!overlayRef.current) return { x: 0, y: 0 };

    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  // Handle drawing start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isEnabled) return;

      const pos = getRelativePosition(e);
      setDrawing({
        isDrawing: true,
        startX: pos.x,
        startY: pos.y,
        currentX: pos.x,
        currentY: pos.y,
      });
    },
    [isEnabled, getRelativePosition]
  );

  // Handle drawing
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing?.isDrawing) return;

      const pos = getRelativePosition(e);
      setDrawing((prev) =>
        prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null
      );
    },
    [drawing, getRelativePosition]
  );

  // Handle drawing end
  const handleMouseUp = useCallback(() => {
    if (!drawing?.isDrawing) return;

    const { startX, startY, currentX, currentY } = drawing;

    // Only create highlight if it has some size
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    if (width > 1 && height > 1) {
      const highlight: AnnotationHighlight = {
        id: `highlight-${Date.now()}`,
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        width,
        height,
        color: selectedColor,
      };
      setTempHighlights((prev) => [...prev, highlight]);
    }

    setDrawing(null);
  }, [drawing, selectedColor]);

  // Save annotation
  const handleSaveAnnotation = useCallback(() => {
    if (!editText.trim() && tempHighlights.length === 0) return;

    if (selectedAnnotation) {
      updateAnnotation(selectedAnnotation.id, {
        text: editText,
        highlights: tempHighlights,
      });
    } else {
      addAnnotation({
        fileId,
        pageIndex,
        text: editText,
        highlights: tempHighlights,
      });
    }

    setEditText('');
    setTempHighlights([]);
    setSelectedAnnotation(null);
    setIsEditing(false);
  }, [
    editText,
    tempHighlights,
    selectedAnnotation,
    fileId,
    pageIndex,
    addAnnotation,
    updateAnnotation,
  ]);

  // Edit existing annotation
  const handleEditAnnotation = useCallback((annotation: PageAnnotation) => {
    setSelectedAnnotation(annotation);
    setEditText(annotation.text);
    setTempHighlights(annotation.highlights);
    setIsEditing(true);
  }, []);

  // Delete annotation
  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      if (window.confirm('Delete this annotation?')) {
        deleteAnnotation(id);
        setSelectedAnnotation(null);
        setIsEditing(false);
      }
    },
    [deleteAnnotation]
  );

  // Cancel editing
  const handleCancel = useCallback(() => {
    setEditText('');
    setTempHighlights([]);
    setSelectedAnnotation(null);
    setIsEditing(false);
  }, []);

  // Clear temp highlight
  const handleRemoveTempHighlight = useCallback((id: string) => {
    setTempHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // Current drawing rectangle
  const drawingRect = useMemo(() => {
    if (!drawing?.isDrawing) return null;

    return {
      x: Math.min(drawing.startX, drawing.currentX),
      y: Math.min(drawing.startY, drawing.currentY),
      width: Math.abs(drawing.currentX - drawing.startX),
      height: Math.abs(drawing.currentY - drawing.startY),
    };
  }, [drawing]);

  return (
    <div
      ref={overlayRef}
      className={`annotation-overlay ${isEnabled ? 'enabled' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Existing Annotations */}
      {annotations.map((annotation) => (
        <div key={annotation.id}>
          {/* Highlights */}
          {annotation.highlights.map((highlight) => (
            <div
              key={highlight.id}
              className="annotation-highlight"
              style={{
                left: `${highlight.x}%`,
                top: `${highlight.y}%`,
                width: `${highlight.width}%`,
                height: `${highlight.height}%`,
                backgroundColor: highlight.color,
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleEditAnnotation(annotation);
              }}
            />
          ))}

          {/* Note indicator */}
          {annotation.text && (
            <button
              className="annotation-indicator"
              style={{
                left: `${annotation.highlights[0]?.x || 5}%`,
                top: `${annotation.highlights[0]?.y || 5}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleEditAnnotation(annotation);
              }}
              title={annotation.text}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {/* Temporary Highlights (while creating) */}
      {tempHighlights.map((highlight) => (
        <div
          key={highlight.id}
          className="annotation-highlight temp"
          style={{
            left: `${highlight.x}%`,
            top: `${highlight.y}%`,
            width: `${highlight.width}%`,
            height: `${highlight.height}%`,
            backgroundColor: highlight.color,
          }}
        >
          <button
            className="highlight-remove"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveTempHighlight(highlight.id);
            }}
          >
            ×
          </button>
        </div>
      ))}

      {/* Drawing Rectangle */}
      {drawingRect && (
        <div
          className="annotation-drawing"
          style={{
            left: `${drawingRect.x}%`,
            top: `${drawingRect.y}%`,
            width: `${drawingRect.width}%`,
            height: `${drawingRect.height}%`,
            borderColor: selectedColor.replace('0.3', '0.8'),
          }}
        />
      )}

      {/* Editing Panel */}
      {isEnabled && (isEditing || tempHighlights.length > 0) && (
        <div className="annotation-panel" onClick={(e) => e.stopPropagation()}>
          <div className="annotation-panel-header">
            <span>{selectedAnnotation ? 'Edit Annotation' : 'New Annotation'}</span>
            {selectedAnnotation && (
              <button
                className="annotation-delete"
                onClick={() => handleDeleteAnnotation(selectedAnnotation.id)}
              >
                Delete
              </button>
            )}
          </div>

          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Add a note..."
            className="annotation-textarea"
            rows={3}
          />

          <div className="annotation-colors">
            <span className="color-label">Highlight color:</span>
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.value}
                className={`color-option ${selectedColor === color.value ? 'selected' : ''}`}
                style={{ backgroundColor: color.value.replace('0.3', '0.6') }}
                onClick={() => setSelectedColor(color.value)}
                title={color.name}
              />
            ))}
          </div>

          <div className="annotation-actions">
            <button className="btn-save" onClick={handleSaveAnnotation}>
              Save
            </button>
            <button className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        className={`annotation-toggle ${isEnabled ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title={isEnabled ? 'Disable annotations' : 'Enable annotations'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      {/* Annotation Count */}
      {annotations.length > 0 && (
        <div className="annotation-count">
          {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
