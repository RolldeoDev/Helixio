/**
 * Keyboard Shortcuts Configuration Hook
 *
 * Provides customizable keyboard shortcuts for the reader.
 * Shortcuts are stored in localStorage and can be customized by users.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ShortcutAction =
  // Navigation
  | 'nextPage'
  | 'prevPage'
  | 'firstPage'
  | 'lastPage'
  | 'nextChapter'
  | 'prevChapter'
  | 'jumpToPage'
  // Reading modes
  | 'singleMode'
  | 'doubleMode'
  | 'doubleMangaMode'
  | 'continuousMode'
  | 'webtoonMode'
  // Scaling
  | 'fitHeight'
  | 'fitWidth'
  | 'fitScreen'
  | 'originalSize'
  // Direction
  | 'toggleDirection'
  // UI
  | 'toggleFullscreen'
  | 'toggleUI'
  | 'toggleSettings'
  | 'toggleInfo'
  | 'toggleThumbnails'
  | 'toggleQueue'
  | 'closeReader'
  // Zoom
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  // Bookmarks
  | 'toggleBookmark'
  // Page manipulation
  | 'rotateCW'
  | 'rotateCCW';

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutConfig {
  action: ShortcutAction;
  label: string;
  category: 'navigation' | 'mode' | 'scaling' | 'ui' | 'zoom' | 'other';
  bindings: KeyBinding[];
}

// =============================================================================
// Default Shortcuts
// =============================================================================

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  // Navigation
  {
    action: 'nextPage',
    label: 'Next Page',
    category: 'navigation',
    bindings: [
      { key: 'ArrowRight' },
      { key: 'ArrowDown' },
      { key: 'd' },
      { key: ' ' }, // Space
      { key: 'PageDown' },
    ],
  },
  {
    action: 'prevPage',
    label: 'Previous Page',
    category: 'navigation',
    bindings: [
      { key: 'ArrowLeft' },
      { key: 'ArrowUp' },
      { key: 'a' },
      { key: ' ', shift: true }, // Shift+Space
      { key: 'PageUp' },
    ],
  },
  {
    action: 'firstPage',
    label: 'First Page',
    category: 'navigation',
    bindings: [{ key: 'Home' }],
  },
  {
    action: 'lastPage',
    label: 'Last Page',
    category: 'navigation',
    bindings: [{ key: 'End' }],
  },
  {
    action: 'nextChapter',
    label: 'Next Chapter/Issue',
    category: 'navigation',
    bindings: [{ key: ']' }],
  },
  {
    action: 'prevChapter',
    label: 'Previous Chapter/Issue',
    category: 'navigation',
    bindings: [{ key: '[' }],
  },
  {
    action: 'jumpToPage',
    label: 'Jump to Page',
    category: 'navigation',
    bindings: [{ key: 'g' }],
  },

  // Reading modes
  {
    action: 'singleMode',
    label: 'Single Page Mode',
    category: 'mode',
    bindings: [{ key: '1' }],
  },
  {
    action: 'doubleMode',
    label: 'Double Page Mode',
    category: 'mode',
    bindings: [{ key: '2' }],
  },
  {
    action: 'doubleMangaMode',
    label: 'Double Page (Manga)',
    category: 'mode',
    bindings: [{ key: '3' }],
  },
  {
    action: 'continuousMode',
    label: 'Continuous Mode',
    category: 'mode',
    bindings: [{ key: '4' }],
  },
  {
    action: 'webtoonMode',
    label: 'Webtoon Mode',
    category: 'mode',
    bindings: [{ key: '5' }],
  },

  // Scaling
  {
    action: 'fitHeight',
    label: 'Fit to Height',
    category: 'scaling',
    bindings: [{ key: 'h' }],
  },
  {
    action: 'fitWidth',
    label: 'Fit to Width',
    category: 'scaling',
    bindings: [{ key: 'w', shift: true }],
  },
  {
    action: 'fitScreen',
    label: 'Fit to Screen',
    category: 'scaling',
    bindings: [{ key: 's', shift: true }],
  },
  {
    action: 'originalSize',
    label: 'Original Size',
    category: 'scaling',
    bindings: [{ key: 'o' }],
  },

  // Direction
  {
    action: 'toggleDirection',
    label: 'Toggle Reading Direction',
    category: 'other',
    bindings: [{ key: 'r' }],
  },

  // UI
  {
    action: 'toggleFullscreen',
    label: 'Toggle Fullscreen',
    category: 'ui',
    bindings: [{ key: 'f' }, { key: 'F11' }],
  },
  {
    action: 'toggleUI',
    label: 'Toggle UI',
    category: 'ui',
    bindings: [{ key: 'm' }],
  },
  {
    action: 'toggleSettings',
    label: 'Open Settings',
    category: 'ui',
    bindings: [{ key: ',' }],
  },
  {
    action: 'toggleInfo',
    label: 'Toggle Issue Info',
    category: 'ui',
    bindings: [{ key: 'i' }],
  },
  {
    action: 'toggleThumbnails',
    label: 'Toggle Thumbnails',
    category: 'ui',
    bindings: [{ key: 't' }],
  },
  {
    action: 'toggleQueue',
    label: 'Toggle Reading Queue',
    category: 'ui',
    bindings: [{ key: 'q' }],
  },
  {
    action: 'closeReader',
    label: 'Close Reader',
    category: 'ui',
    bindings: [{ key: 'Escape' }],
  },

  // Zoom
  {
    action: 'zoomIn',
    label: 'Zoom In',
    category: 'zoom',
    bindings: [{ key: '+' }, { key: '=' }],
  },
  {
    action: 'zoomOut',
    label: 'Zoom Out',
    category: 'zoom',
    bindings: [{ key: '-' }],
  },
  {
    action: 'resetZoom',
    label: 'Reset Zoom',
    category: 'zoom',
    bindings: [{ key: '0' }],
  },

  // Bookmarks
  {
    action: 'toggleBookmark',
    label: 'Toggle Bookmark',
    category: 'other',
    bindings: [{ key: 'b' }],
  },

  // Page manipulation
  {
    action: 'rotateCW',
    label: 'Rotate Clockwise',
    category: 'other',
    bindings: [{ key: '.', shift: true }],
  },
  {
    action: 'rotateCCW',
    label: 'Rotate Counter-clockwise',
    category: 'other',
    bindings: [{ key: ',', shift: true }],
  },
];

const STORAGE_KEY = 'helixio-keyboard-shortcuts';

// =============================================================================
// Helper Functions
// =============================================================================

function matchesBinding(event: KeyboardEvent, binding: KeyBinding): boolean {
  // Normalize key
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const bindingKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;

  if (eventKey !== bindingKey) return false;

  // Check modifiers
  const ctrl = binding.ctrl ?? false;
  const meta = binding.meta ?? false;
  const shift = binding.shift ?? false;
  const alt = binding.alt ?? false;

  return (
    event.ctrlKey === ctrl &&
    event.metaKey === meta &&
    event.shiftKey === shift &&
    event.altKey === alt
  );
}

function formatBinding(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.meta) parts.push('Cmd');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');

  // Format special keys
  let key = binding.key;
  switch (key) {
    case ' ':
      key = 'Space';
      break;
    case 'ArrowUp':
      key = '↑';
      break;
    case 'ArrowDown':
      key = '↓';
      break;
    case 'ArrowLeft':
      key = '←';
      break;
    case 'ArrowRight':
      key = '→';
      break;
    default:
      if (key.length === 1) key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join('+');
}

// =============================================================================
// Hook
// =============================================================================

export interface UseKeyboardShortcutsOptions {
  onAction: (action: ShortcutAction) => void;
  enabled?: boolean;
  excludeInputs?: boolean;
}

export function useKeyboardShortcuts({
  onAction,
  enabled = true,
  excludeInputs = true,
}: UseKeyboardShortcutsOptions) {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SHORTCUTS;
  });

  // Build a lookup map for quick action matching (kept for potential future use)
  const _bindingMap = useMemo(() => {
    const map = new Map<string, ShortcutAction>();
    for (const config of shortcuts) {
      for (const binding of config.bindings) {
        // Create a unique key for this binding
        const key = [
          binding.ctrl ? 'ctrl' : '',
          binding.meta ? 'meta' : '',
          binding.shift ? 'shift' : '',
          binding.alt ? 'alt' : '',
          binding.key.toLowerCase(),
        ].join('-');
        map.set(key, config.action);
      }
    }
    return map;
  }, [shortcuts]);
  void _bindingMap; // Suppress unused variable warning

  // Handle key events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Skip if typing in an input
      if (excludeInputs) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      // Find matching action
      for (const config of shortcuts) {
        for (const binding of config.bindings) {
          if (matchesBinding(event, binding)) {
            event.preventDefault();
            event.stopPropagation();
            onAction(config.action);
            return;
          }
        }
      }
    },
    [enabled, excludeInputs, shortcuts, onAction]
  );

  // Set up event listener
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, handleKeyDown]);

  // Update a shortcut's bindings
  const updateShortcut = useCallback(
    (action: ShortcutAction, bindings: KeyBinding[]) => {
      setShortcuts((prev) => {
        const next = prev.map((config) =>
          config.action === action ? { ...config, bindings } : config
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  // Reset all shortcuts to defaults
  const resetShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get the shortcut hint for an action (for display in UI)
  const getShortcutHint = useCallback(
    (action: ShortcutAction): string | undefined => {
      const config = shortcuts.find((s) => s.action === action);
      if (!config || config.bindings.length === 0) return undefined;
      return formatBinding(config.bindings[0]!);
    },
    [shortcuts]
  );

  return {
    shortcuts,
    updateShortcut,
    resetShortcuts,
    getShortcutHint,
    formatBinding,
  };
}

// Export defaults for settings UI
export { DEFAULT_SHORTCUTS };
