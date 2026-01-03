/**
 * Page Editor Types
 *
 * TypeScript interfaces for the Page Editor modal component.
 */

// =============================================================================
// Page Information
// =============================================================================

export interface PageInfo {
  path: string;
  size: number;
  index: number;
}

// =============================================================================
// Operation Types
// =============================================================================

export interface PageReorderItem {
  originalPath: string;
  newIndex: number;
}

export interface PageModifyOperation {
  type: 'delete' | 'reorder';
  path: string;
  newIndex?: number;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ArchiveModifiability {
  fileId: string;
  filename: string;
  isModifiable: boolean;
  format: 'zip' | 'rar' | '7z' | 'unknown';
  pageCount: number;
  reason?: string;
  canConvert?: boolean;
  hasBookmarks: boolean;
  bookmarkPages: number[];
}

export interface ModifyPagesResponse {
  success: boolean;
  deletedCount: number;
  reorderedCount: number;
  newTotalPages: number;
  warnings?: string[];
  message: string;
}

// =============================================================================
// State Types
// =============================================================================

export interface PageEditorState {
  /** Original page list (immutable after load) */
  originalPages: PageInfo[];
  /** Current working order of pages */
  pages: PageInfo[];
  /** Indices of pages marked for deletion */
  deletedIndices: Set<number>;
  /** Currently selected page indices */
  selectedIndices: Set<number>;
  /** Loading state for initial page load */
  isLoading: boolean;
  /** Saving state for save operation */
  isSaving: boolean;
  /** Error message if any */
  error: string | null;
  /** Archive modifiability info */
  modifiability: ArchiveModifiability | null;
}

export interface PendingChanges {
  /** Page paths to delete */
  deletions: string[];
  /** Reorder operations */
  reorders: PageReorderItem[];
  /** Whether there are any pending changes */
  hasChanges: boolean;
  /** Summary of changes */
  summary: {
    deletedCount: number;
    reorderedCount: number;
  };
}

// =============================================================================
// Component Props
// =============================================================================

export interface PageEditorModalProps {
  /** File ID of the archive to edit */
  fileId: string;
  /** Display filename */
  filename: string;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback after successful save */
  onSave?: () => void;
}

export interface PageEditorGridProps {
  /** Pages to display */
  pages: PageInfo[];
  /** Selected page indices */
  selectedIndices: Set<number>;
  /** Deleted page indices (for visual indication) */
  deletedIndices: Set<number>;
  /** File ID for image URLs */
  fileId: string;
  /** Callback when page is clicked */
  onPageClick: (page: PageInfo, event: React.MouseEvent) => void;
  /** Callback when page is double-clicked (preview) */
  onPageDoubleClick: (page: PageInfo) => void;
  /** Callback when drag starts */
  onDragStart: (index: number, event: React.DragEvent) => void;
  /** Callback when drag ends */
  onDragEnd: () => void;
  /** Callback when dragging over a page */
  onDragOver: (index: number, event: React.DragEvent) => void;
  /** Callback when dropping on a page */
  onDrop: (targetIndex: number, event: React.DragEvent) => void;
  /** Currently dragged page index */
  draggedIndex: number | null;
  /** Index being dragged over */
  dragOverIndex: number | null;
}

export interface PageEditorToolbarProps {
  /** Total page count */
  pageCount: number;
  /** Number of selected pages */
  selectedCount: number;
  /** Whether there are pending changes */
  hasChanges: boolean;
  /** Callback to select all pages */
  onSelectAll: () => void;
  /** Callback to clear selection */
  onClearSelection: () => void;
  /** Callback to delete selected pages */
  onDeleteSelected: () => void;
  /** Callback to move selection up */
  onMoveUp: () => void;
  /** Callback to move selection down */
  onMoveDown: () => void;
  /** Callback to move selection to front */
  onMoveToFront: () => void;
  /** Callback to move selection to back */
  onMoveToBack: () => void;
  /** Whether any buttons should be disabled */
  disabled?: boolean;
}

export interface PageEditorFooterProps {
  /** Pending changes summary */
  changes: PendingChanges;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Callback to save changes */
  onSave: () => void;
  /** Callback to cancel/close */
  onCancel: () => void;
  /** Warning messages to display */
  warnings?: string[];
}
