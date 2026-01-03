/**
 * CoverCard Type Definitions
 *
 * Unified cover card component for displaying comic files/issues
 * with configurable selection, context menu, and theming support.
 */

import type { ComicFile, FileMetadata } from '../../services/api.service';

// =============================================================================
// File Data Types
// =============================================================================

/**
 * Minimal file data required by CoverCard
 * This allows components to pass partial ComicFile objects
 */
export interface CoverCardFile {
  id: string;
  filename: string;
  path?: string;
  libraryId?: string;
  metadata?: Partial<FileMetadata> | null;
  /** Cover hash for cache-busting when cover changes */
  coverHash?: string | null;
}

// =============================================================================
// Context Menu Types
// =============================================================================

/**
 * Predefined menu item identifiers
 */
export type MenuItemPreset =
  | 'read'
  | 'markRead'
  | 'markUnread'
  | 'addToCollection'
  | 'fetchMetadata'
  | 'editMetadata'
  | 'editPages'
  | 'rename'
  | 'rebuildCache'
  | 'quarantine'
  | 'restore'
  | 'delete';

/**
 * Custom menu item configuration
 */
export interface CoverCardMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
  /** Show only when single file selected */
  singleOnly?: boolean;
  /** Show only when multiple files selected */
  multiOnly?: boolean;
}

// =============================================================================
// Reading Progress
// =============================================================================

/**
 * Reading progress data structure
 */
export interface ReadingProgressData {
  currentPage: number;
  totalPages: number;
  completed: boolean;
}

// =============================================================================
// Badge Configuration
// =============================================================================

/**
 * Badge type for visual styling
 */
export type BadgeType = 'primary' | 'success' | 'warning' | 'info' | 'error';

/**
 * Badge position on the card
 */
export type BadgePosition = 'top-left' | 'top-right' | 'top-center';

/**
 * Badge configuration for special indicators
 */
export interface CoverCardBadge {
  text: string;
  type?: BadgeType;
  position?: BadgePosition;
}

// =============================================================================
// Size & Variant
// =============================================================================

/**
 * Size variants for different contexts
 */
export type CoverCardSize = 'compact' | 'small' | 'medium' | 'large';

/**
 * Display variant - affects layout structure
 */
export type CoverCardVariant = 'grid' | 'list' | 'carousel';

// =============================================================================
// Main Props Interface
// =============================================================================

/**
 * CoverCard component props
 */
export interface CoverCardProps {
  /** The file data to display (can be full ComicFile or minimal CoverCardFile) */
  file: ComicFile | CoverCardFile;

  /** Reading progress data (optional, fetched externally) */
  progress?: ReadingProgressData;

  // === Display Options ===

  /** Size variant - controls card dimensions */
  size?: CoverCardSize;

  /** Display variant - controls layout structure */
  variant?: CoverCardVariant;

  /** Custom badge to display */
  badge?: CoverCardBadge;

  /** Show title and metadata below cover (default: true for grid/carousel) */
  showInfo?: boolean;

  /** Show series name in info section (below cover, if no subtitle) */
  showSeries?: boolean;

  /** Show series as subtitle below the title (takes precedence over showSeries) */
  showSeriesAsSubtitle?: boolean;

  /** Show issue number in info section */
  showIssueNumber?: boolean;

  // === Selection ===

  /** Whether selection is enabled */
  selectable?: boolean;

  /** Whether this card is currently selected */
  isSelected?: boolean;

  // === Context Menu ===

  /** Enable context menu on right-click */
  contextMenuEnabled?: boolean;

  /** Menu items using presets */
  menuItems?: MenuItemPreset[];

  /** Custom menu items (merged with presets) */
  customMenuItems?: CoverCardMenuItem[];

  /** Number of files currently selected (for menu label display) */
  selectedCount?: number;

  // === Events ===

  /** Click handler */
  onClick?: (fileId: string, event: React.MouseEvent) => void;

  /** Double-click handler (e.g., open reader) */
  onDoubleClick?: (fileId: string) => void;

  /** Read button handler (opens reader directly from hover button) */
  onRead?: (fileId: string) => void;

  /** Selection change handler */
  onSelectionChange?: (fileId: string, selected: boolean) => void;

  /** Context menu action handler */
  onMenuAction?: (action: MenuItemPreset | string, fileId: string) => void;

  /** Keyboard navigation handler */
  onKeyDown?: (fileId: string, event: React.KeyboardEvent) => void;

  // === Accessibility ===

  /** Tab index for keyboard navigation */
  tabIndex?: number;

  /** ARIA label override */
  ariaLabel?: string;

  // === Advanced ===

  /** Custom class name */
  className?: string;

  /** Animation delay index for staggered animations */
  animationIndex?: number;

  /** Disable lazy loading (for above-the-fold items) */
  eager?: boolean;
}

// =============================================================================
// Cover Image Types
// =============================================================================

/**
 * Cover image loading status
 */
export type CoverImageStatus = 'loading' | 'loaded' | 'error';

/**
 * CoverImage component props
 */
export interface CoverImageProps {
  fileId: string;
  filename: string;
  progress?: ReadingProgressData;
  eager?: boolean;
  onRetry?: () => void;
}

// =============================================================================
// Context Menu Types
// =============================================================================

/**
 * Context menu position
 */
export interface MenuPosition {
  x: number;
  y: number;
}

/**
 * Context menu state
 */
export interface ContextMenuState {
  isOpen: boolean;
  position: MenuPosition | null;
  fileId: string | null;
}

/**
 * ContextMenu component props
 */
export interface ContextMenuProps {
  position: MenuPosition;
  items: MenuItemPreset[];
  customItems?: CoverCardMenuItem[];
  selectedCount: number;
  onAction: (action: string) => void;
  onClose: () => void;
}
